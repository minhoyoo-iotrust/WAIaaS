/**
 * TelegramBotService: Long Polling bot with /start, /help, /status commands.
 *
 * Uses better-sqlite3 directly for DB access (same pattern as KillSwitchService).
 * Long Polling with exponential backoff (1s -> 2s -> 4s -> ... -> 30s max).
 * MarkdownV2 escape for all user-facing text.
 *
 * Commands:
 *   /start   - Register chat_id as PENDING user
 *   /help    - Show available commands
 *   /status  - Show daemon status, wallet count, session count
 *
 * @see packages/daemon/src/services/kill-switch-service.ts (SQLite direct pattern)
 * @see packages/daemon/src/services/autostop-service.ts (service start/stop pattern)
 */

import type { Database } from 'better-sqlite3';
import type { SupportedLocale } from '@waiaas/core';
import { getMessages } from '@waiaas/core';
import type { TelegramApi } from './telegram-api.js';
import type { TelegramUpdate, TelegramMessage } from './telegram-types.js';
import type { KillSwitchService } from '../../services/kill-switch-service.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { SettingsService } from '../settings/settings-service.js';

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
}

// ---------------------------------------------------------------------------
// TelegramBotService
// ---------------------------------------------------------------------------

export class TelegramBotService {
  private sqlite: Database;
  private api: TelegramApi;
  private locale: SupportedLocale;
  private killSwitchService?: KillSwitchService;
  private running = false;
  private offset = 0;
  private backoffMs = 1000;
  private static readonly MAX_BACKOFF_MS = 30_000;
  private static readonly POLL_TIMEOUT_SEC = 30;

  constructor(opts: TelegramBotServiceOptions) {
    this.sqlite = opts.sqlite;
    this.api = opts.api;
    this.locale = opts.locale ?? 'en';
    this.killSwitchService = opts.killSwitchService;
  }

  /**
   * Start the Long Polling loop (fire-and-forget, runs in background).
   * Does NOT block -- returns immediately after starting the async loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.backoffMs = 1000;
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
        // Success -- reset backoff
        this.backoffMs = 1000;

        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      } catch {
        // Exponential backoff on error
        if (this.running) {
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
    if (update.message?.text) {
      await this.handleMessage(update.message);
    }
    // callback_query handling is a stub for Plan 02
  }

  private async handleMessage(message: TelegramMessage): Promise<void> {
    const text = message.text?.trim() ?? '';
    if (!text.startsWith('/')) return;

    const parts = text.split(/\s+/);
    const command = parts[0]!.toLowerCase().split('@')[0]; // strip @botname suffix
    const chatId = message.chat.id;
    const username = message.from?.username;

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
        default:
          // Unknown command -- ignore silently
          break;
      }
    } catch {
      // Swallow handler errors to keep polling alive
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
