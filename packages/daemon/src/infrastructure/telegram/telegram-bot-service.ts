/**
 * TelegramBotService: Long Polling bot with 2-Tier auth + 9 commands.
 *
 * Uses better-sqlite3 directly for DB access (same pattern as KillSwitchService).
 * Long Polling with exponential backoff (1s -> 2s -> 4s -> ... -> 30s max).
 * MarkdownV2 escape for all user-facing text.
 *
 * Commands:
 *   /start      - Register chat_id as PENDING user             (public)
 *   /help       - Show available commands                        (public)
 *   /status     - Show daemon status, wallet count, session count (readonly+)
 *   /wallets    - List all wallets                               (readonly+)
 *   /pending    - List pending approval transactions             (admin)
 *   /approve    - Approve a pending transaction                  (admin)
 *   /reject     - Reject a pending transaction                   (admin)
 *   /killswitch - Activate kill switch with confirmation          (admin)
 *   /newsession - Create a new session for a wallet              (admin)
 *
 * Auth: TelegramAuth 2-Tier (PUBLIC / READONLY / ADMIN)
 * Callback queries: inline keyboard buttons for approve/reject/killswitch/newsession
 *
 * @see packages/daemon/src/services/kill-switch-service.ts (SQLite direct pattern)
 * @see packages/daemon/src/services/autostop-service.ts (service start/stop pattern)
 */

import { createHash } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import type { SupportedLocale } from '@waiaas/core';
import { getMessages, SignResponseSchema, WAIaaSError } from '@waiaas/core';
import type { TelegramApi } from './telegram-api.js';
import type { TelegramUpdate, TelegramMessage } from './telegram-types.js';
import type { KillSwitchService } from '../../services/kill-switch-service.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { SettingsService } from '../settings/settings-service.js';
import type { JwtSecretManager, JwtPayload } from '../jwt/index.js';
import type { SignResponseHandler } from '../../services/signing-sdk/sign-response-handler.js';
import { TelegramAuth } from './telegram-auth.js';
import { buildConfirmKeyboard, buildWalletSelectKeyboard, buildApprovalKeyboard } from './telegram-keyboard.js';

// ---------------------------------------------------------------------------
// MarkdownV2 escape utility
// ---------------------------------------------------------------------------

/**
 * Escape special characters for Telegram MarkdownV2 parse mode.
 * @see https://core.telegram.org/bots/api#markdownv2-style
 */
export const escapeMarkdownV2 = (s: string): string =>
  s.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TelegramBotServiceOptions {
  sqlite: Database;
  api: TelegramApi;
  locale?: SupportedLocale;
  killSwitchService?: KillSwitchService;
  notificationService?: NotificationService;
  settingsService?: SettingsService;
  jwtSecretManager?: JwtSecretManager;
  signResponseHandler?: SignResponseHandler;
  sessionTtl?: number;
}

// ---------------------------------------------------------------------------
// TelegramBotService
// ---------------------------------------------------------------------------

export class TelegramBotService {
  private sqlite: Database;
  private api: TelegramApi;
  private locale: SupportedLocale;
  private killSwitchService?: KillSwitchService;
  private jwtSecretManager?: JwtSecretManager;
  private settingsService?: SettingsService;
  private signResponseHandler?: SignResponseHandler;
  private sessionTtl: number;
  private auth: TelegramAuth;
  private running = false;
  private offset = 0;
  private backoffMs = 1000;
  private retryCount = 0;
  private static readonly MAX_BACKOFF_MS = 30_000;
  private static readonly POLL_TIMEOUT_SEC = 30;

  constructor(opts: TelegramBotServiceOptions) {
    this.sqlite = opts.sqlite;
    this.api = opts.api;
    this.locale = opts.locale ?? 'en';
    this.killSwitchService = opts.killSwitchService;
    this.jwtSecretManager = opts.jwtSecretManager;
    this.settingsService = opts.settingsService;
    this.signResponseHandler = opts.signResponseHandler;
    this.sessionTtl = opts.sessionTtl ?? 3600; // default 1 hour
    this.auth = new TelegramAuth(opts.sqlite);
  }

  /**
   * Set the signResponseHandler for /sign_response command (late-binding from signing SDK lifecycle).
   * Same late-binding pattern as VersionCheckService.setNotificationService().
   */
  setSignResponseHandler(handler: SignResponseHandler): void {
    this.signResponseHandler = handler;
  }

  /**
   * Start the Long Polling loop (fire-and-forget, runs in background).
   * Does NOT block -- returns immediately after starting the async loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.backoffMs = 1000;
    this.retryCount = 0;
    void this.pollLoop();
  }

  /**
   * Stop the Long Polling loop. The loop exits on next iteration.
   */
  stop(): void {
    this.running = false;
  }

  /** Whether the bot service is currently running. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Current backoff interval in ms (for testing). */
  get currentBackoffMs(): number {
    return this.backoffMs;
  }

  /** Current consecutive failure count (for testing). */
  get consecutiveFailures(): number {
    return this.retryCount;
  }

  // -----------------------------------------------------------------------
  // Long Polling loop
  // -----------------------------------------------------------------------

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const updates = await this.api.getUpdates(
          this.offset,
          TelegramBotService.POLL_TIMEOUT_SEC,
        );
        // Success -- reset backoff and retry counter
        this.backoffMs = 1000;
        this.retryCount = 0;

        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      } catch (err) {
        // Check if Telegram API returned 401/409 -- do not retry, stop
        if (err instanceof Error && /Telegram API error: (401|409)/.test(err.message)) {
          console.error(`Telegram Bot: fatal API error, stopping polling: ${err.message}`);
          this.running = false;
          return;
        }

        // Exponential backoff on network errors
        if (this.running) {
          this.retryCount++;
          // Log warning every 3 consecutive failures
          if (this.retryCount % 3 === 0) {
            console.warn(
              `Telegram Bot: ${this.retryCount} consecutive failures, retrying in ${this.backoffMs}ms`,
            );
          }
          await this.sleep(this.backoffMs);
          this.backoffMs = Math.min(
            this.backoffMs * 2,
            TelegramBotService.MAX_BACKOFF_MS,
          );
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Update router
  // -----------------------------------------------------------------------

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      await this.handleCallbackQuery(update);
      return;
    }
    if (update.message?.text) {
      await this.handleMessage(update.message);
    }
  }

  private async handleMessage(message: TelegramMessage): Promise<void> {
    const text = message.text?.trim() ?? '';
    if (!text.startsWith('/')) return;

    const parts = text.split(/\s+/);
    const command = parts[0]!.toLowerCase().split('@')[0]; // strip @botname suffix
    const chatId = message.chat.id;
    const username = message.from?.username;
    const msgs = getMessages(this.locale);

    // 2-Tier auth check
    const perm = this.auth.checkPermission(chatId, command!);
    if (!perm.allowed) {
      switch (perm.reason) {
        case 'not_registered':
          await this.api.sendMessage(chatId, msgs.telegram.bot_unauthorized);
          return;
        case 'pending_approval':
          await this.api.sendMessage(chatId, msgs.telegram.bot_pending_approval);
          return;
        case 'admin_only':
          await this.api.sendMessage(chatId, msgs.telegram.bot_admin_only);
          return;
      }
      return;
    }

    try {
      switch (command) {
        case '/start':
          await this.handleStart(chatId, username);
          break;
        case '/help':
          await this.handleHelp(chatId);
          break;
        case '/status':
          await this.handleStatus(chatId);
          break;
        case '/wallets':
          await this.handleWallets(chatId);
          break;
        case '/pending':
          await this.handlePending(chatId);
          break;
        case '/approve':
          await this.handleApprove(chatId, parts[1]);
          break;
        case '/reject':
          await this.handleReject(chatId, parts[1]);
          break;
        case '/killswitch':
          await this.handleKillswitch(chatId);
          break;
        case '/newsession':
          await this.handleNewSession(chatId);
          break;
        case '/sign_response':
          await this.handleSignResponse(chatId, parts[1]);
          break;
        default:
          // Unknown command -- ignore silently
          break;
      }
    } catch {
      // Swallow handler errors to keep polling alive
    }
  }

  // -----------------------------------------------------------------------
  // Callback query handler (inline keyboard)
  // -----------------------------------------------------------------------

  private async handleCallbackQuery(update: TelegramUpdate): Promise<void> {
    const cbq = update.callback_query!;
    const chatId = cbq.from.id;
    const data = cbq.data;

    if (!data) return;

    // Determine which command the callback maps to for auth check
    let command: string | null = null;
    if (data.startsWith('approve:')) command = '/approve';
    else if (data.startsWith('reject:')) command = '/reject';
    else if (data.startsWith('killswitch:')) command = '/killswitch';
    else if (data.startsWith('newsession:')) command = '/newsession';

    if (!command) return;

    // Auth check for callback queries
    const perm = this.auth.checkPermission(chatId, command);
    if (!perm.allowed) {
      const msgs = getMessages(this.locale);
      const reason = perm.reason === 'admin_only'
        ? msgs.telegram.bot_admin_only
        : perm.reason === 'pending_approval'
          ? msgs.telegram.bot_pending_approval
          : msgs.telegram.bot_unauthorized;
      await this.api.answerCallbackQuery(cbq.id, reason);
      return;
    }

    const msgs = getMessages(this.locale);

    try {
      if (data === 'killswitch:confirm') {
        await this.executeKillswitchConfirm(chatId);
        await this.api.answerCallbackQuery(cbq.id, msgs.telegram.keyboard_yes);
        return;
      }

      if (data === 'killswitch:cancel') {
        await this.api.sendMessage(chatId, msgs.telegram.bot_killswitch_cancelled);
        await this.api.answerCallbackQuery(cbq.id, msgs.telegram.keyboard_no);
        return;
      }

      if (data.startsWith('newsession:')) {
        const walletId = data.slice('newsession:'.length);
        await this.executeNewSession(chatId, walletId);
        await this.api.answerCallbackQuery(cbq.id);
        return;
      }

      if (data.startsWith('approve:')) {
        const txId = data.split(':')[1];
        if (txId) await this.handleApprove(chatId, txId);
        await this.api.answerCallbackQuery(cbq.id, msgs.telegram.keyboard_approve);
        return;
      }

      if (data.startsWith('reject:')) {
        const txId = data.split(':')[1];
        if (txId) await this.handleReject(chatId, txId);
        await this.api.answerCallbackQuery(cbq.id, msgs.telegram.keyboard_reject);
        return;
      }
    } catch {
      // Swallow errors, acknowledge callback
      await this.api.answerCallbackQuery(cbq.id);
    }
  }

  // -----------------------------------------------------------------------
  // Command handlers
  // -----------------------------------------------------------------------

  private async handleStart(chatId: number, username?: string): Promise<void> {
    const messages = getMessages(this.locale);
    const now = Math.floor(Date.now() / 1000);

    // INSERT OR IGNORE -- PK conflict means already registered
    const result = this.sqlite
      .prepare(
        'INSERT OR IGNORE INTO telegram_users (chat_id, username, role, registered_at) VALUES (?, ?, ?, ?)',
      )
      .run(chatId, username ?? null, 'PENDING', now);

    if (result.changes > 0) {
      // New registration
      await this.api.sendMessage(chatId, messages.telegram.bot_welcome);
      await this.api.sendMessage(chatId, messages.telegram.bot_pending_approval);
    } else {
      // Already registered
      await this.api.sendMessage(chatId, messages.telegram.bot_already_registered);
    }
  }

  private async handleHelp(chatId: number): Promise<void> {
    const messages = getMessages(this.locale);
    await this.api.sendMessage(chatId, messages.telegram.bot_help);
  }

  private async handleStatus(chatId: number): Promise<void> {
    const messages = getMessages(this.locale);

    // Gather status data
    const uptimeSeconds = Math.floor(process.uptime());
    const uptimeStr = this.formatUptime(uptimeSeconds);

    // Kill Switch state
    let killSwitchState = 'ACTIVE';
    try {
      if (this.killSwitchService) {
        killSwitchState = this.killSwitchService.getState().state;
      }
    } catch {
      killSwitchState = 'UNKNOWN';
    }

    // Wallet counts
    const walletRow = this.sqlite
      .prepare('SELECT COUNT(*) AS total FROM wallets')
      .get() as { total: number };
    const activeWalletRow = this.sqlite
      .prepare("SELECT COUNT(*) AS active FROM wallets WHERE status = 'ACTIVE'")
      .get() as { active: number };

    // Active sessions
    const sessionRow = this.sqlite
      .prepare(
        'SELECT COUNT(*) AS active FROM sessions WHERE revoked_at IS NULL AND expires_at > unixepoch()',
      )
      .get() as { active: number };

    // Build status message from template
    const statusBody = messages.telegram.bot_status_body
      .replace('{uptime}', escapeMarkdownV2(uptimeStr))
      .replace('{killSwitch}', escapeMarkdownV2(killSwitchState))
      .replace('{walletCount}', escapeMarkdownV2(String(walletRow.total)))
      .replace('{activeCount}', escapeMarkdownV2(String(activeWalletRow.active)))
      .replace('{sessionCount}', escapeMarkdownV2(String(sessionRow.active)));

    const header = `*${escapeMarkdownV2(messages.telegram.bot_status_header)}*`;
    await this.api.sendMessage(chatId, `${header}\n\n${statusBody}`);
  }

  // -----------------------------------------------------------------------
  // /wallets -- list all wallets
  // -----------------------------------------------------------------------

  private async handleWallets(chatId: number): Promise<void> {
    const messages = getMessages(this.locale);

    const rows = this.sqlite
      .prepare(
        'SELECT id, name, chain, environment, status FROM wallets ORDER BY created_at DESC',
      )
      .all() as Array<{
      id: string;
      name: string;
      chain: string;
      environment: string;
      status: string;
    }>;

    if (rows.length === 0) {
      await this.api.sendMessage(chatId, messages.telegram.bot_wallets_empty);
      return;
    }

    const lines = rows.map(
      (w) =>
        `\\- ${escapeMarkdownV2(w.name)} \\(${escapeMarkdownV2(w.chain)}/${escapeMarkdownV2(w.environment)}\\) \\[${escapeMarkdownV2(w.status)}\\]`,
    );

    const header = `*${escapeMarkdownV2(messages.telegram.bot_wallets_header)}*`;
    await this.api.sendMessage(chatId, `${header}\n\n${lines.join('\n')}`);
  }

  // -----------------------------------------------------------------------
  // /pending -- list pending approval transactions
  // -----------------------------------------------------------------------

  private async handlePending(chatId: number): Promise<void> {
    const messages = getMessages(this.locale);

    const rows = this.sqlite
      .prepare(
        `SELECT t.id, t.type, t.amount, t.to_address, t.chain, pa.expires_at
         FROM transactions t
         JOIN pending_approvals pa ON t.id = pa.tx_id
         WHERE t.status = 'QUEUED'
           AND pa.approved_at IS NULL
           AND pa.rejected_at IS NULL
           AND pa.expires_at > unixepoch()
         ORDER BY pa.created_at ASC`,
      )
      .all() as Array<{
      id: string;
      type: string;
      amount: string | null;
      to_address: string | null;
      chain: string;
      expires_at: number;
    }>;

    if (rows.length === 0) {
      await this.api.sendMessage(chatId, messages.telegram.bot_pending_empty);
      return;
    }

    const header = `*${escapeMarkdownV2(messages.telegram.bot_pending_list_header)}*`;

    for (const tx of rows) {
      const amountStr = tx.amount ? escapeMarkdownV2(tx.amount) : '\\-';
      const toStr = tx.to_address
        ? escapeMarkdownV2(tx.to_address.slice(0, 8) + '...' + tx.to_address.slice(-4))
        : '\\-';
      const line = `${escapeMarkdownV2(tx.type)} | ${amountStr} | ${toStr} | ${escapeMarkdownV2(tx.chain)}`;
      const txIdDisplay = escapeMarkdownV2(tx.id.slice(0, 8) + '...');

      const keyboard = buildApprovalKeyboard(tx.id, messages.telegram);

      await this.api.sendMessage(
        chatId,
        `${header}\n\n${txIdDisplay}\n${line}`,
        keyboard,
      );
    }
  }

  // -----------------------------------------------------------------------
  // /approve {txId} -- approve a pending transaction
  // -----------------------------------------------------------------------

  private async handleApprove(chatId: number, txId?: string): Promise<void> {
    const messages = getMessages(this.locale);

    if (!txId) {
      await this.api.sendMessage(chatId, messages.telegram.bot_tx_not_found);
      return;
    }

    // Verify the transaction exists and is pending approval
    const pending = this.sqlite
      .prepare(
        `SELECT pa.tx_id FROM pending_approvals pa
         JOIN transactions t ON t.id = pa.tx_id
         WHERE pa.tx_id = ? AND t.status = 'QUEUED'
           AND pa.approved_at IS NULL AND pa.rejected_at IS NULL`,
      )
      .get(txId) as { tx_id: string } | undefined;

    if (!pending) {
      await this.api.sendMessage(chatId, messages.telegram.bot_tx_not_found);
      return;
    }

    // Approve: update pending_approvals and transactions
    this.sqlite
      .prepare(
        "UPDATE pending_approvals SET approved_at = unixepoch(), approval_channel = 'telegram' WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL",
      )
      .run(txId);

    this.sqlite
      .prepare(
        "UPDATE transactions SET status = 'EXECUTING' WHERE id = ? AND status = 'QUEUED'",
      )
      .run(txId);

    // Audit log
    const now = Math.floor(Date.now() / 1000);
    this.sqlite
      .prepare(
        'INSERT INTO audit_log (timestamp, event_type, actor, tx_id, details, severity) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(now, 'TX_APPROVED_VIA_TELEGRAM', `telegram:${chatId}`, txId, JSON.stringify({ chatId, action: 'approve' }), 'info');

    await this.api.sendMessage(chatId, messages.telegram.bot_approve_success);
  }

  // -----------------------------------------------------------------------
  // /reject {txId} -- reject a pending transaction
  // -----------------------------------------------------------------------

  private async handleReject(chatId: number, txId?: string): Promise<void> {
    const messages = getMessages(this.locale);

    if (!txId) {
      await this.api.sendMessage(chatId, messages.telegram.bot_tx_not_found);
      return;
    }

    // Verify the transaction exists and is pending approval
    const pending = this.sqlite
      .prepare(
        `SELECT pa.tx_id FROM pending_approvals pa
         JOIN transactions t ON t.id = pa.tx_id
         WHERE pa.tx_id = ? AND t.status = 'QUEUED'
           AND pa.approved_at IS NULL AND pa.rejected_at IS NULL`,
      )
      .get(txId) as { tx_id: string } | undefined;

    if (!pending) {
      await this.api.sendMessage(chatId, messages.telegram.bot_tx_not_found);
      return;
    }

    // Reject: update pending_approvals and transactions
    this.sqlite
      .prepare(
        "UPDATE pending_approvals SET rejected_at = unixepoch(), approval_channel = 'telegram' WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL",
      )
      .run(txId);

    this.sqlite
      .prepare(
        "UPDATE transactions SET status = 'CANCELLED', error = 'Rejected via Telegram' WHERE id = ? AND status = 'QUEUED'",
      )
      .run(txId);

    // Audit log
    const now = Math.floor(Date.now() / 1000);
    this.sqlite
      .prepare(
        'INSERT INTO audit_log (timestamp, event_type, actor, tx_id, details, severity) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(now, 'TX_REJECTED_VIA_TELEGRAM', `telegram:${chatId}`, txId, JSON.stringify({ chatId, action: 'reject' }), 'info');

    await this.api.sendMessage(chatId, messages.telegram.bot_reject_success);
  }

  // -----------------------------------------------------------------------
  // /killswitch -- confirm dialog then activate
  // -----------------------------------------------------------------------

  private async handleKillswitch(chatId: number): Promise<void> {
    const msgs = getMessages(this.locale);

    // Check current kill switch state
    if (this.killSwitchService) {
      const state = this.killSwitchService.getState();
      if (state.state !== 'ACTIVE') {
        const msg = msgs.telegram.bot_killswitch_already_active.replace(
          '{state}',
          escapeMarkdownV2(state.state),
        );
        await this.api.sendMessage(chatId, msg);
        return;
      }
    }

    // Send confirmation dialog with Yes/No inline keyboard
    await this.api.sendMessage(
      chatId,
      msgs.telegram.bot_killswitch_confirm,
      buildConfirmKeyboard(msgs.telegram),
    );
  }

  private async executeKillswitchConfirm(chatId: number): Promise<void> {
    const msgs = getMessages(this.locale);

    if (!this.killSwitchService) {
      await this.api.sendMessage(chatId, msgs.telegram.bot_killswitch_cancelled);
      return;
    }

    const result = this.killSwitchService.activateWithCascade(`telegram:${chatId}`);
    if (result.success) {
      await this.api.sendMessage(chatId, msgs.telegram.bot_killswitch_success);
    } else {
      // Already activated between confirm dialog and button press
      const state = this.killSwitchService.getState();
      const msg = msgs.telegram.bot_killswitch_already_active.replace(
        '{state}',
        escapeMarkdownV2(state.state),
      );
      await this.api.sendMessage(chatId, msg);
    }
  }

  // -----------------------------------------------------------------------
  // /newsession -- wallet select then issue JWT
  // -----------------------------------------------------------------------

  private async handleNewSession(chatId: number): Promise<void> {
    const msgs = getMessages(this.locale);

    // Query ACTIVE wallets
    const wallets = this.sqlite
      .prepare("SELECT id, name FROM wallets WHERE status = 'ACTIVE' ORDER BY created_at DESC")
      .all() as Array<{ id: string; name: string }>;

    if (wallets.length === 0) {
      await this.api.sendMessage(chatId, msgs.telegram.bot_wallets_empty);
      return;
    }

    // Send wallet selection keyboard
    await this.api.sendMessage(
      chatId,
      msgs.telegram.bot_newsession_select,
      buildWalletSelectKeyboard(wallets),
    );
  }

  private async executeNewSession(chatId: number, walletId: string): Promise<void> {
    const msgs = getMessages(this.locale);

    // Verify wallet exists and is ACTIVE
    const wallet = this.sqlite
      .prepare("SELECT id, name FROM wallets WHERE id = ? AND status = 'ACTIVE'")
      .get(walletId) as { id: string; name: string } | undefined;

    if (!wallet) {
      await this.api.sendMessage(chatId, msgs.telegram.bot_newsession_wallet_not_found);
      return;
    }

    if (!this.jwtSecretManager) {
      await this.api.sendMessage(chatId, msgs.telegram.bot_newsession_wallet_not_found);
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = nowSec + this.sessionTtl;
    const absoluteLifetime = this.settingsService
      ? parseInt(this.settingsService.get('security.session_absolute_lifetime'), 10) || 31536000
      : 31536000;
    const absoluteExpiresAt = nowSec + absoluteLifetime;

    // Generate session ID (UUID v7 via uuidv7 package)
    const { uuidv7 } = await import('uuidv7');
    const sessionId = uuidv7();

    // Create JWT payload and sign token
    const jwtPayload: JwtPayload = {
      sub: sessionId,
      wlt: walletId,
      iat: nowSec,
      exp: expiresAt,
    };
    const token = await this.jwtSecretManager.signToken(jwtPayload);

    // Compute token hash for storage
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Insert session into DB (v26.4: session + session_wallets junction)
    this.sqlite
      .prepare(
        `INSERT INTO sessions (id, token_hash, expires_at, constraints, usage_stats, revoked_at, renewal_count, max_renewals, last_renewed_at, absolute_expires_at, created_at, source)
         VALUES (?, ?, ?, NULL, NULL, NULL, 0, ?, NULL, ?, ?, 'telegram')`,
      )
      .run(
        sessionId, tokenHash, expiresAt,
        this.settingsService
          ? parseInt(this.settingsService.get('security.session_max_renewals'), 10) || 12
          : 12,
        absoluteExpiresAt, nowSec,
      );
    this.sqlite
      .prepare(
        `INSERT INTO session_wallets (session_id, wallet_id, is_default, created_at)
         VALUES (?, ?, 1, ?)`,
      )
      .run(sessionId, walletId, nowSec);

    // Audit log
    this.sqlite
      .prepare(
        'INSERT INTO audit_log (timestamp, event_type, actor, details, severity) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        nowSec,
        'SESSION_ISSUED_VIA_TELEGRAM',
        `telegram:${chatId}`,
        JSON.stringify({ chatId, walletId, sessionId }),
        'info',
      );

    // Send token to user (monospace in MarkdownV2)
    const msg = msgs.telegram.bot_newsession_created.replace('{token}', token);
    await this.api.sendMessage(chatId, msg);
  }

  // -----------------------------------------------------------------------
  // /sign_response {encoded} -- process SignResponse from wallet app
  // -----------------------------------------------------------------------

  private async handleSignResponse(chatId: number, encodedResponse?: string): Promise<void> {
    if (!this.signResponseHandler) {
      await this.api.sendMessage(
        chatId,
        escapeMarkdownV2('Signing SDK is not enabled'),
      );
      return;
    }

    if (!encodedResponse) {
      await this.api.sendMessage(
        chatId,
        escapeMarkdownV2('Usage: /sign_response {encoded_response}'),
      );
      return;
    }

    try {
      // Decode base64url string to JSON
      const json = Buffer.from(encodedResponse, 'base64url').toString('utf-8');
      const parsed: unknown = JSON.parse(json);

      // Validate with Zod schema
      const signResponse = SignResponseSchema.parse(parsed);

      // Delegate to SignResponseHandler
      const result = await this.signResponseHandler.handle(signResponse);

      // Send confirmation
      await this.api.sendMessage(
        chatId,
        escapeMarkdownV2(`Sign response processed: ${result.action}`),
      );
    } catch (err) {
      // Handle WAIaaSError or parse errors
      const message =
        err instanceof WAIaaSError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown error processing sign response';
      await this.api.sendMessage(
        chatId,
        escapeMarkdownV2(`Error: ${message}`),
      );
    }
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  private formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
