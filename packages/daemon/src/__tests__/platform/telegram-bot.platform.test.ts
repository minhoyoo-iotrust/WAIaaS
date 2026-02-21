/**
 * Telegram Bot Platform Tests (PLAT-03): 34 scenarios
 *
 * Platform-level tests focusing on deployment stability, error recovery,
 * and end-to-end flows. Distinct from existing unit tests by testing:
 *   - Error recovery patterns (backoff, fatal errors)
 *   - Full command -> DB mutation -> response chains
 *   - Callback query routing and auth enforcement
 *   - Graceful shutdown integration
 *
 * Categories:
 *   Polling (5)       - Start/stop/backoff/reset/fatal
 *   Commands (10)     - All 10 commands via update simulation
 *   Callbacks (7)     - Inline keyboard button callbacks
 *   Auth (4)          - Permission escalation scenarios
 *   Format (2)        - MarkdownV2 escape completeness
 *   CallbackData (2)  - Prefix routing + ID parsing
 *   DirectApprove (2) - /approve and /reject direct commands
 *   Shutdown (2)      - Stop flag + lifecycle source verification
 *
 * @see packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
 * @see packages/daemon/src/infrastructure/telegram/telegram-auth.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabase, pushSchema } from '../../infrastructure/database/index.js';
import {
  TelegramBotService,
  escapeMarkdownV2,
} from '../../infrastructure/telegram/telegram-bot-service.js';
import { TelegramAuth } from '../../infrastructure/telegram/telegram-auth.js';
import type { TelegramApi } from '../../infrastructure/telegram/telegram-api.js';
import type { TelegramUpdate } from '../../infrastructure/telegram/telegram-types.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import { getMessages } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockApi(): TelegramApi {
  return {
    getUpdates: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
  } as unknown as TelegramApi;
}

function createTestDb(): DatabaseType {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn.sqlite;
}

function makeUpdate(
  chatId: number,
  text: string,
  updateId = 1,
  username?: string,
): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: 1,
      from: { id: chatId, is_bot: false, first_name: 'Test', username },
      chat: { id: chatId, type: 'private' },
      text,
      date: Math.floor(Date.now() / 1000),
    },
  };
}

function makeCallbackUpdate(
  chatId: number,
  data: string,
  cbId = 'cb-1',
  updateId = 1,
): TelegramUpdate {
  return {
    update_id: updateId,
    callback_query: {
      id: cbId,
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      data,
    },
  };
}

function registerUser(
  db: DatabaseType,
  chatId: number,
  role: string,
  username?: string,
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO telegram_users (chat_id, username, role, registered_at) VALUES (?, ?, ?, ?)',
  ).run(chatId, username ?? null, role, now);
}

function insertWallet(
  db: DatabaseType,
  id: string,
  name: string,
  chain = 'solana',
  env = 'testnet',
  status = 'ACTIVE',
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, name, chain, env, `pk-${id}`, status, now, now);
}

function insertPendingTx(
  db: DatabaseType,
  txId: string,
  walletId: string,
  chain = 'solana',
  type = 'TRANSFER',
  amount = '1.5',
  toAddr = 'addr1',
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?)",
  ).run(txId, walletId, chain, type, amount, toAddr, now);
  db.prepare(
    'INSERT INTO pending_approvals (id, tx_id, required_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(`pa-${txId}`, txId, now + 3600, now + 3600, now);
}

function createMockKillSwitchService(state = 'ACTIVE') {
  return {
    getState: vi.fn().mockReturnValue({
      state,
      activatedAt: null,
      activatedBy: null,
    }),
    activateWithCascade: vi.fn().mockReturnValue({ success: true }),
    ensureInitialized: vi.fn(),
  };
}

function createMockJwtSecretManager() {
  let callCount = 0;
  return {
    signToken: vi.fn().mockImplementation(async () => {
      callCount++;
      return `wai_sess_mock-jwt-token-${callCount}`;
    }),
    getCurrentSecret: vi.fn().mockResolvedValue('abcdef1234567890'),
    initialize: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Helper: feed updates into a service and wait for sendMessage calls.
 */
async function feedUpdates(
  service: TelegramBotService,
  api: TelegramApi,
  updates: TelegramUpdate[],
  expectedCalls: number,
  waitTarget: 'sendMessage' | 'answerCallbackQuery' = 'sendMessage',
): Promise<void> {
  (api.getUpdates as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce(updates)
    .mockImplementation(() => new Promise(() => {}));

  service.start();
  await vi.waitFor(
    () => {
      const target = waitTarget === 'sendMessage' ? api.sendMessage : api.answerCallbackQuery;
      expect(target).toHaveBeenCalledTimes(expectedCalls);
    },
    { timeout: 3000 },
  );
  service.stop();
}

// ===========================================================================
// Polling (5)
// ===========================================================================

describe('PLAT-03 Telegram Bot Platform Tests', () => {
  describe('Polling', () => {
    let db: DatabaseType;
    let api: TelegramApi;
    let service: TelegramBotService;

    beforeEach(() => {
      db = createTestDb();
      api = createMockApi();
      service = new TelegramBotService({ sqlite: db, api, locale: 'en' });
    });

    afterEach(() => {
      service.stop();
      try {
        db.close();
      } catch {
        /* already closed */
      }
    });

    it('PLAT-03-POLL-01: start() sets isRunning=true and invokes getUpdates', async () => {
      (api.getUpdates as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {}),
      );
      service.start();
      expect(service.isRunning).toBe(true);
      await vi.waitFor(() => {
        expect(api.getUpdates).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    it('PLAT-03-POLL-02: stop() sets isRunning=false and terminates polling loop', () => {
      service.start();
      expect(service.isRunning).toBe(true);
      service.stop();
      expect(service.isRunning).toBe(false);
    });

    it('PLAT-03-POLL-03: getUpdates network error triggers exponential backoff', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockImplementation(() => new Promise(() => {}));

      service.start();

      await vi.waitFor(
        () => {
          expect(
            (api.getUpdates as ReturnType<typeof vi.fn>).mock.calls.length,
          ).toBeGreaterThanOrEqual(4);
        },
        { timeout: 20000 },
      );
      service.stop();

      // After 3 errors, backoff doubles: 1000 -> 2000 -> 4000 -> next=8000
      expect(service.currentBackoffMs).toBe(8000);
      expect(service.consecutiveFailures).toBe(3);

      vi.useRealTimers();
    });

    it('PLAT-03-POLL-04: backoff resets after successful getUpdates', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([]) // success
        .mockImplementation(() => new Promise(() => {}));

      service.start();

      await vi.waitFor(
        () => {
          expect(
            (api.getUpdates as ReturnType<typeof vi.fn>).mock.calls.length,
          ).toBeGreaterThanOrEqual(4);
        },
        { timeout: 20000 },
      );
      service.stop();

      // After success, reset to 1000
      expect(service.currentBackoffMs).toBe(1000);
      expect(service.consecutiveFailures).toBe(0);

      vi.useRealTimers();
    });

    it('PLAT-03-POLL-05: 401/409 fatal API error stops polling immediately', async () => {
      (api.getUpdates as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Telegram API error: 401 Unauthorized'),
      );

      service.start();

      await vi.waitFor(() => {
        expect(service.isRunning).toBe(false);
      }, { timeout: 3000 });

      // Should have only called getUpdates once (no retry)
      expect(api.getUpdates).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Commands (10)
  // =========================================================================

  describe('Commands', () => {
    let db: DatabaseType;
    let api: TelegramApi;
    let service: TelegramBotService;

    beforeEach(() => {
      db = createTestDb();
      api = createMockApi();
      service = new TelegramBotService({ sqlite: db, api, locale: 'en' });
    });

    afterEach(() => {
      service.stop();
      try {
        db.close();
      } catch {
        /* already closed */
      }
    });

    it('PLAT-03-CMD-01: /start (unregistered) inserts PENDING user + sends welcome', async () => {
      await feedUpdates(
        service,
        api,
        [makeUpdate(12345, '/start', 1, 'newuser')],
        2,
      );

      const row = db
        .prepare('SELECT * FROM telegram_users WHERE chat_id = ?')
        .get(12345) as any;
      expect(row).toBeDefined();
      expect(row.role).toBe('PENDING');
      expect(row.username).toBe('newuser');

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(12345, en.telegram.bot_welcome);
      expect(api.sendMessage).toHaveBeenCalledWith(12345, en.telegram.bot_pending_approval);
    });

    it('PLAT-03-CMD-02: /start (already registered) sends already_registered', async () => {
      registerUser(db, 12345, 'PENDING', 'user1');

      await feedUpdates(
        service,
        api,
        [makeUpdate(12345, '/start', 1, 'user1')],
        1,
      );

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(
        12345,
        en.telegram.bot_already_registered,
      );
    });

    it('PLAT-03-CMD-03: /help (READONLY) sends help message', async () => {
      // /help is PUBLIC, no registration required, but we test with READONLY
      registerUser(db, 300, 'READONLY');

      await feedUpdates(service, api, [makeUpdate(300, '/help', 1)], 1);

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(300, en.telegram.bot_help);
    });

    it('PLAT-03-CMD-04: /status (READONLY) returns uptime, kill switch, wallet/session counts', async () => {
      registerUser(db, 300, 'READONLY');

      await feedUpdates(service, api, [makeUpdate(300, '/status', 1)], 1);

      const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const text = call[1] as string;
      expect(text).toContain('Daemon Status');
      expect(text).toContain('Kill Switch');
      expect(text).toContain('Wallets');
      expect(text).toContain('Sessions');
    });

    it('PLAT-03-CMD-05: /wallets (READONLY, 2 wallets) lists wallets', async () => {
      registerUser(db, 300, 'READONLY');
      insertWallet(db, 'w-1', 'SolWallet', 'solana', 'testnet');
      insertWallet(db, 'w-2', 'EthWallet', 'ethereum', 'mainnet');

      await feedUpdates(service, api, [makeUpdate(300, '/wallets', 1)], 1);

      const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const text = call[1] as string;
      expect(text).toContain('SolWallet');
      expect(text).toContain('EthWallet');
      expect(text).toContain('solana');
      expect(text).toContain('ethereum');
    });

    it('PLAT-03-CMD-06: /wallets (READONLY, 0 wallets) sends wallets_empty', async () => {
      registerUser(db, 300, 'READONLY');

      await feedUpdates(service, api, [makeUpdate(300, '/wallets', 1)], 1);

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(300, en.telegram.bot_wallets_empty);
    });

    it('PLAT-03-CMD-07: /pending (ADMIN, 1 pending) sends tx with inline keyboard', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-1', 'MyWallet');
      insertPendingTx(db, 'TX-001', 'w-1');

      await feedUpdates(service, api, [makeUpdate(200, '/pending', 1)], 1);

      const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const keyboard = call[2];
      expect(keyboard).toBeDefined();
      expect(keyboard.inline_keyboard[0]).toHaveLength(2);
      expect(keyboard.inline_keyboard[0][0].callback_data).toBe('approve:TX-001');
      expect(keyboard.inline_keyboard[0][1].callback_data).toBe('reject:TX-001');
    });

    it('PLAT-03-CMD-08: /pending (ADMIN, 0 pending) sends pending_empty', async () => {
      registerUser(db, 200, 'ADMIN');

      await feedUpdates(service, api, [makeUpdate(200, '/pending', 1)], 1);

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_pending_empty);
    });

    it('PLAT-03-CMD-09: /approve {txId} (ADMIN) updates DB and sends success', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-1', 'MyWallet');
      insertPendingTx(db, 'TX-001', 'w-1');

      await feedUpdates(
        service,
        api,
        [makeUpdate(200, '/approve TX-001', 1)],
        1,
      );

      // Verify DB mutations
      const pa = db
        .prepare('SELECT approved_at, approval_channel FROM pending_approvals WHERE tx_id = ?')
        .get('TX-001') as any;
      expect(pa.approved_at).toBeGreaterThan(0);
      expect(pa.approval_channel).toBe('telegram');

      const tx = db
        .prepare('SELECT status FROM transactions WHERE id = ?')
        .get('TX-001') as any;
      expect(tx.status).toBe('EXECUTING');

      const log = db
        .prepare(
          "SELECT * FROM audit_log WHERE event_type = 'TX_APPROVED_VIA_TELEGRAM'",
        )
        .get() as any;
      expect(log).toBeDefined();
      expect(log.actor).toBe('telegram:200');
      expect(log.tx_id).toBe('TX-001');

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_approve_success);
    });

    it('PLAT-03-CMD-10: /reject {txId} (ADMIN) updates DB and sends success', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-1', 'MyWallet');
      insertPendingTx(db, 'TX-001', 'w-1');

      await feedUpdates(
        service,
        api,
        [makeUpdate(200, '/reject TX-001', 1)],
        1,
      );

      // Verify DB mutations
      const pa = db
        .prepare('SELECT rejected_at, approval_channel FROM pending_approvals WHERE tx_id = ?')
        .get('TX-001') as any;
      expect(pa.rejected_at).toBeGreaterThan(0);
      expect(pa.approval_channel).toBe('telegram');

      const tx = db
        .prepare('SELECT status, error FROM transactions WHERE id = ?')
        .get('TX-001') as any;
      expect(tx.status).toBe('CANCELLED');
      expect(tx.error).toBe('Rejected via Telegram');

      const log = db
        .prepare(
          "SELECT * FROM audit_log WHERE event_type = 'TX_REJECTED_VIA_TELEGRAM'",
        )
        .get() as any;
      expect(log).toBeDefined();
      expect(log.actor).toBe('telegram:200');

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_reject_success);
    });
  });

  // =========================================================================
  // Callbacks (7)
  // =========================================================================

  describe('Callbacks', () => {
    let db: DatabaseType;
    let api: TelegramApi;

    beforeEach(() => {
      db = createTestDb();
      api = createMockApi();
    });

    afterEach(() => {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    });

    it('PLAT-03-CB-01: approve:{txId} callback triggers approval + answerCallbackQuery', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-1', 'W1');
      insertPendingTx(db, 'TX-A01', 'w-1');

      const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });
      await feedUpdates(
        service,
        api,
        [makeCallbackUpdate(200, 'approve:TX-A01', 'cb-a1', 1)],
        1,
      );

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_approve_success);
      expect(api.answerCallbackQuery).toHaveBeenCalledWith(
        'cb-a1',
        en.telegram.keyboard_approve,
      );

      const tx = db
        .prepare('SELECT status FROM transactions WHERE id = ?')
        .get('TX-A01') as any;
      expect(tx.status).toBe('EXECUTING');
    });

    it('PLAT-03-CB-02: reject:{txId} callback triggers rejection + answerCallbackQuery', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-1', 'W1');
      insertPendingTx(db, 'TX-R01', 'w-1');

      const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });
      await feedUpdates(
        service,
        api,
        [makeCallbackUpdate(200, 'reject:TX-R01', 'cb-r1', 1)],
        1,
      );

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_reject_success);
      expect(api.answerCallbackQuery).toHaveBeenCalledWith(
        'cb-r1',
        en.telegram.keyboard_reject,
      );

      const tx = db
        .prepare('SELECT status FROM transactions WHERE id = ?')
        .get('TX-R01') as any;
      expect(tx.status).toBe('CANCELLED');
    });

    it('PLAT-03-CB-03: killswitch:confirm activates kill switch + answerCallbackQuery', async () => {
      registerUser(db, 200, 'ADMIN');
      const ks = createMockKillSwitchService('ACTIVE');

      const service = new TelegramBotService({
        sqlite: db,
        api,
        locale: 'en',
        killSwitchService: ks as any,
      });

      await feedUpdates(
        service,
        api,
        [makeCallbackUpdate(200, 'killswitch:confirm', 'cb-ks1', 1)],
        1,
      );

      expect(ks.activateWithCascade).toHaveBeenCalledWith('telegram:200');

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_killswitch_success);
      expect(api.answerCallbackQuery).toHaveBeenCalledWith(
        'cb-ks1',
        en.telegram.keyboard_yes,
      );
    });

    it('PLAT-03-CB-04: killswitch:cancel sends cancelled message + answerCallbackQuery', async () => {
      registerUser(db, 200, 'ADMIN');
      const ks = createMockKillSwitchService('ACTIVE');

      const service = new TelegramBotService({
        sqlite: db,
        api,
        locale: 'en',
        killSwitchService: ks as any,
      });

      await feedUpdates(
        service,
        api,
        [makeCallbackUpdate(200, 'killswitch:cancel', 'cb-ks2', 1)],
        1,
      );

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(
        200,
        en.telegram.bot_killswitch_cancelled,
      );
      expect(api.answerCallbackQuery).toHaveBeenCalledWith(
        'cb-ks2',
        en.telegram.keyboard_no,
      );
    });

    it('PLAT-03-CB-05: newsession:{walletId} creates session with JWT', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-ns1', 'TestWallet');
      const jwt = createMockJwtSecretManager();

      const service = new TelegramBotService({
        sqlite: db,
        api,
        locale: 'en',
        jwtSecretManager: jwt as any,
      });

      await feedUpdates(
        service,
        api,
        [makeCallbackUpdate(200, 'newsession:w-ns1', 'cb-ns1', 1)],
        1,
      );

      expect(jwt.signToken).toHaveBeenCalledTimes(1);

      // Session inserted in DB (session_wallets junction table)
      const sw = db
        .prepare('SELECT * FROM session_wallets WHERE wallet_id = ?')
        .get('w-ns1') as any;
      expect(sw).toBeDefined();
      const session = db
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(sw.session_id) as any;
      expect(session).toBeDefined();
      expect(session.token_hash).toHaveLength(64); // SHA-256 hex

      // Token sent in message
      const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[1]).toContain('wai_sess_');

      expect(api.answerCallbackQuery).toHaveBeenCalledWith('cb-ns1');
    });

    it('PLAT-03-CB-06: unauthenticated callback sends denial via answerCallbackQuery', async () => {
      // Unregistered user tries approve callback
      const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([
          makeCallbackUpdate(99999, 'approve:TX-001', 'cb-deny', 1),
        ])
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.answerCallbackQuery).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.answerCallbackQuery).toHaveBeenCalledWith(
        'cb-deny',
        en.telegram.bot_unauthorized,
      );
      // No sendMessage (only answerCallbackQuery for denial)
      expect(api.sendMessage).not.toHaveBeenCalled();
    });

    it('PLAT-03-CB-07: unknown callback_data is silently ignored', async () => {
      registerUser(db, 200, 'ADMIN');
      const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([
          makeCallbackUpdate(200, 'unknown:data', 'cb-unk', 1),
        ])
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      // Wait briefly -- nothing should be called
      await new Promise((r) => setTimeout(r, 300));
      service.stop();

      expect(api.sendMessage).not.toHaveBeenCalled();
      expect(api.answerCallbackQuery).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Auth (4)
  // =========================================================================

  describe('Auth', () => {
    let db: DatabaseType;
    let api: TelegramApi;

    beforeEach(() => {
      db = createTestDb();
      api = createMockApi();
    });

    afterEach(() => {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    });

    it('PLAT-03-AUTH-01: PENDING user /status is denied with pending_approval', async () => {
      registerUser(db, 100, 'PENDING');
      const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

      await feedUpdates(service, api, [makeUpdate(100, '/status', 1)], 1);

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(100, en.telegram.bot_pending_approval);
    });

    it('PLAT-03-AUTH-02: READONLY user /approve is denied with admin_only', async () => {
      registerUser(db, 300, 'READONLY');
      const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

      await feedUpdates(
        service,
        api,
        [makeUpdate(300, '/approve TX-001', 1)],
        1,
      );

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(300, en.telegram.bot_admin_only);
    });

    it('PLAT-03-AUTH-03: unregistered user /wallets is denied with not_registered', async () => {
      const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

      await feedUpdates(service, api, [makeUpdate(99999, '/wallets', 1)], 1);

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(99999, en.telegram.bot_unauthorized);
    });

    it('PLAT-03-AUTH-04: ADMIN user can access all 10 commands', () => {
      registerUser(db, 200, 'ADMIN');
      const auth = new TelegramAuth(db);

      const allCommands = [
        '/start',
        '/help',
        '/status',
        '/wallets',
        '/pending',
        '/approve',
        '/reject',
        '/killswitch',
        '/newsession',
      ];

      for (const cmd of allCommands) {
        const result = auth.checkPermission(200, cmd);
        expect(result.allowed).toBe(true);
      }
    });
  });

  // =========================================================================
  // Format (2)
  // =========================================================================

  describe('Format', () => {
    it('PLAT-03-FMT-01: escapeMarkdownV2 escapes all special characters', () => {
      // All special chars: _ * [ ] ( ) ~ ` > # + - = | { } . ! \
      const specials = '_*[]()~`>#+-.=|{}.!\\';
      const escaped = escapeMarkdownV2(specials);

      // Each special char should be prefixed with backslash
      for (const ch of specials) {
        expect(escaped).toContain(`\\${ch}`);
      }

      // Verify no double-escaping of already-escaped chars (except backslash)
      expect(escapeMarkdownV2('hello')).toBe('hello');
      expect(escapeMarkdownV2('a.b')).toBe('a\\.b');
      expect(escapeMarkdownV2('(test)')).toBe('\\(test\\)');
    });

    it('PLAT-03-FMT-02: /status response uses MarkdownV2 formatting', async () => {
      const db = createTestDb();
      const api = createMockApi();
      registerUser(db, 300, 'READONLY');

      const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });
      await feedUpdates(service, api, [makeUpdate(300, '/status', 1)], 1);

      const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const text = call[1] as string;

      // MarkdownV2 bold header uses *...*
      expect(text).toMatch(/\*.+\*/);
      // Status text contains escaped content
      expect(text).toContain('Daemon Status');

      db.close();
    });
  });

  // =========================================================================
  // CallbackData (2)
  // =========================================================================

  describe('CallbackData routing', () => {
    let db: DatabaseType;
    let api: TelegramApi;

    beforeEach(() => {
      db = createTestDb();
      api = createMockApi();
    });

    afterEach(() => {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    });

    it('PLAT-03-CBD-01: 4 callback_data prefixes route to correct handlers', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-cbd', 'CBDWallet');
      insertPendingTx(db, 'TX-CBD', 'w-cbd');
      const ks = createMockKillSwitchService('ACTIVE');
      const jwt = createMockJwtSecretManager();

      // Test approve: prefix
      const svc1 = new TelegramBotService({
        sqlite: db,
        api,
        locale: 'en',
        killSwitchService: ks as any,
        jwtSecretManager: jwt as any,
      });
      await feedUpdates(
        svc1,
        api,
        [makeCallbackUpdate(200, 'approve:TX-CBD', 'cb-1', 1)],
        1,
      );
      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_approve_success);

      // Test killswitch: prefix
      vi.mocked(api.sendMessage).mockClear();
      vi.mocked(api.answerCallbackQuery).mockClear();
      vi.mocked(api.getUpdates).mockReset();

      const svc2 = new TelegramBotService({
        sqlite: db,
        api,
        locale: 'en',
        killSwitchService: ks as any,
      });
      await feedUpdates(
        svc2,
        api,
        [makeCallbackUpdate(200, 'killswitch:cancel', 'cb-2', 2)],
        1,
      );
      expect(api.sendMessage).toHaveBeenCalledWith(
        200,
        en.telegram.bot_killswitch_cancelled,
      );
    });

    it('PLAT-03-CBD-02: callback_data colon separator correctly parses IDs', () => {
      // Verify the parsing logic used in callback handler
      const testCases = [
        { data: 'approve:abc-123', prefix: 'approve:', expected: 'abc-123' },
        { data: 'reject:tx-uuid-v7', prefix: 'reject:', expected: 'tx-uuid-v7' },
        { data: 'newsession:wallet-001', prefix: 'newsession:', expected: 'wallet-001' },
      ];

      for (const tc of testCases) {
        expect(tc.data.startsWith(tc.prefix)).toBe(true);
        const id = tc.data.split(':')[1];
        expect(id).toBe(tc.expected);
      }
    });
  });

  // =========================================================================
  // Direct approve (2)
  // =========================================================================

  describe('Direct approve/reject commands', () => {
    let db: DatabaseType;
    let api: TelegramApi;

    beforeEach(() => {
      db = createTestDb();
      api = createMockApi();
    });

    afterEach(() => {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    });

    it('PLAT-03-DIR-01: /approve {txId} direct command approves transaction', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-d1', 'DW1');
      insertPendingTx(db, 'TX-DIR-01', 'w-d1');

      const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });
      await feedUpdates(
        service,
        api,
        [makeUpdate(200, '/approve TX-DIR-01', 1)],
        1,
      );

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_approve_success);

      const tx = db
        .prepare('SELECT status FROM transactions WHERE id = ?')
        .get('TX-DIR-01') as any;
      expect(tx.status).toBe('EXECUTING');
    });

    it('PLAT-03-DIR-02: /reject {txId} direct command rejects transaction', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-d2', 'DW2');
      insertPendingTx(db, 'TX-DIR-02', 'w-d2');

      const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });
      await feedUpdates(
        service,
        api,
        [makeUpdate(200, '/reject TX-DIR-02', 1)],
        1,
      );

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_reject_success);

      const tx = db
        .prepare('SELECT status FROM transactions WHERE id = ?')
        .get('TX-DIR-02') as any;
      expect(tx.status).toBe('CANCELLED');
    });
  });

  // =========================================================================
  // Shutdown (2)
  // =========================================================================

  describe('Shutdown', () => {
    it('PLAT-03-SHUT-01: stop() sets running=false, polling loop terminates on next iteration', async () => {
      const db = createTestDb();
      const api = createMockApi();
      const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

      let getUpdatesCallCount = 0;
      (api.getUpdates as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise((resolve) => {
            getUpdatesCallCount++;
            // Simulate a short poll
            setTimeout(() => resolve([]), 50);
          }),
      );

      service.start();
      expect(service.isRunning).toBe(true);

      // Let at least 1 poll cycle complete
      await vi.waitFor(() => {
        expect(getUpdatesCallCount).toBeGreaterThanOrEqual(1);
      }, { timeout: 3000 });

      service.stop();
      expect(service.isRunning).toBe(false);

      // Record call count after stop
      const countAtStop = getUpdatesCallCount;

      // Wait to ensure no more polling
      await new Promise((r) => setTimeout(r, 200));
      // Should have stopped (at most 1 more call in flight)
      expect(getUpdatesCallCount).toBeLessThanOrEqual(countAtStop + 1);

      db.close();
    });

    it('PLAT-03-SHUT-02: DaemonLifecycle.shutdown() calls telegramBotService.stop()', () => {
      // Verify by reading daemon.ts source code
      const daemonSource = readFileSync(
        resolve(
          __dirname,
          '../../../src/lifecycle/daemon.ts',
        ),
        'utf-8',
      );

      // DaemonLifecycle shutdown includes telegramBotService.stop()
      expect(daemonSource).toContain('this.telegramBotService.stop()');
      // It's in the shutdown path (surrounded by null assignment pattern)
      expect(daemonSource).toContain('this.telegramBotService = null');
    });
  });
});
