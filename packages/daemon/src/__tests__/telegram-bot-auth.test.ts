/**
 * TelegramBotService 2-Tier auth + /wallets, /pending, /approve, /reject tests.
 *
 * 25 tests covering:
 *   - TelegramAuth.getRole: unregistered null, PENDING/ADMIN/READONLY return
 *   - TelegramAuth.checkPermission: /start unregistered allowed, /status PENDING denied,
 *     /status READONLY allowed, /approve READONLY denied, /approve ADMIN allowed
 *   - TelegramAuth.updateRole: PENDING->ADMIN success, non-existent chatId false
 *   - TelegramAuth.listUsers: list returns correct entries
 *   - /wallets: 2 wallets listed, empty wallet list
 *   - /pending: 2 pending approval txs with inline keyboard, empty pending list
 *   - /approve: valid txId approved (status EXECUTING, audit log), invalid txId not found
 *   - /reject: valid txId rejected (status CANCELLED), invalid txId not found
 *   - callback_query: approve:TX-001 triggers handleApprove + answerCallbackQuery
 *   - callback_query: reject:TX-001 triggers handleReject + answerCallbackQuery
 *   - READONLY user /approve denied with bot_admin_only
 *   - PENDING user /status denied with bot_pending_approval
 *   - Unregistered user /wallets denied with bot_unauthorized
 *
 * @see packages/daemon/src/infrastructure/telegram/telegram-auth.ts
 * @see packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { TelegramBotService } from '../infrastructure/telegram/telegram-bot-service.js';
import { TelegramAuth } from '../infrastructure/telegram/telegram-auth.js';
import type { TelegramApi } from '../infrastructure/telegram/telegram-api.js';
import type { TelegramUpdate } from '../infrastructure/telegram/telegram-types.js';
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

function makeUpdate(chatId: number, text: string, updateId = 1, username?: string): TelegramUpdate {
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

function makeCallbackUpdate(chatId: number, data: string, updateId = 1): TelegramUpdate {
  return {
    update_id: updateId,
    callback_query: {
      id: `cb-${updateId}`,
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      data,
    },
  };
}

function registerUser(db: DatabaseType, chatId: number, role: string, username?: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO telegram_users (chat_id, username, role, registered_at) VALUES (?, ?, ?, ?)',
  ).run(chatId, username ?? null, role, now);
}

function insertWallet(db: DatabaseType, id: string, name: string, chain: string, env: string, status: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, name, chain, env, `pk-${id}`, status, now, now);
}

function insertPendingTx(db: DatabaseType, txId: string, walletId: string, chain: string, type: string, amount: string, toAddr: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?)",
  ).run(txId, walletId, chain, type, amount, toAddr, now);
  db.prepare(
    'INSERT INTO pending_approvals (id, tx_id, required_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(`pa-${txId}`, txId, now + 3600, now + 3600, now);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TelegramAuth', () => {
  let db: DatabaseType;
  let auth: TelegramAuth;

  beforeEach(() => {
    db = createTestDb();
    auth = new TelegramAuth(db);
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  describe('getRole', () => {
    it('returns null for unregistered user', () => {
      expect(auth.getRole(99999)).toBeNull();
    });

    it('returns PENDING for pending user', () => {
      registerUser(db, 100, 'PENDING');
      expect(auth.getRole(100)).toBe('PENDING');
    });

    it('returns ADMIN for admin user', () => {
      registerUser(db, 200, 'ADMIN');
      expect(auth.getRole(200)).toBe('ADMIN');
    });

    it('returns READONLY for readonly user', () => {
      registerUser(db, 300, 'READONLY');
      expect(auth.getRole(300)).toBe('READONLY');
    });
  });

  describe('checkPermission', () => {
    it('allows /start for unregistered user', () => {
      expect(auth.checkPermission(99999, '/start')).toEqual({ allowed: true });
    });

    it('allows /help for unregistered user', () => {
      expect(auth.checkPermission(99999, '/help')).toEqual({ allowed: true });
    });

    it('denies /status for PENDING user', () => {
      registerUser(db, 100, 'PENDING');
      expect(auth.checkPermission(100, '/status')).toEqual({ allowed: false, reason: 'pending_approval' });
    });

    it('allows /status for READONLY user', () => {
      registerUser(db, 300, 'READONLY');
      expect(auth.checkPermission(300, '/status')).toEqual({ allowed: true });
    });

    it('allows /wallets for READONLY user', () => {
      registerUser(db, 300, 'READONLY');
      expect(auth.checkPermission(300, '/wallets')).toEqual({ allowed: true });
    });

    it('denies /approve for READONLY user', () => {
      registerUser(db, 300, 'READONLY');
      expect(auth.checkPermission(300, '/approve')).toEqual({ allowed: false, reason: 'admin_only' });
    });

    it('allows /approve for ADMIN user', () => {
      registerUser(db, 200, 'ADMIN');
      expect(auth.checkPermission(200, '/approve')).toEqual({ allowed: true });
    });

    it('denies /wallets for unregistered user', () => {
      expect(auth.checkPermission(99999, '/wallets')).toEqual({ allowed: false, reason: 'not_registered' });
    });
  });

  describe('updateRole', () => {
    it('updates PENDING to ADMIN and sets approved_at', () => {
      registerUser(db, 100, 'PENDING');
      const result = auth.updateRole(100, 'ADMIN');
      expect(result).toBe(true);

      const row = db.prepare('SELECT role, approved_at FROM telegram_users WHERE chat_id = ?').get(100) as any;
      expect(row.role).toBe('ADMIN');
      expect(row.approved_at).toBeGreaterThan(0);
    });

    it('returns false for non-existent chatId', () => {
      const result = auth.updateRole(99999, 'ADMIN');
      expect(result).toBe(false);
    });
  });

  describe('listUsers', () => {
    it('returns all registered users', () => {
      registerUser(db, 100, 'PENDING', 'user1');
      registerUser(db, 200, 'ADMIN', 'user2');
      const users = auth.listUsers();
      expect(users).toHaveLength(2);
      expect(users[0]!.chat_id).toBeDefined();
      expect(users.some(u => u.username === 'user1')).toBe(true);
      expect(users.some(u => u.username === 'user2')).toBe(true);
    });
  });
});

describe('TelegramBotService auth + commands', () => {
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
    try { db.close(); } catch { /* already closed */ }
  });

  // -----------------------------------------------------------------------
  // Auth denial messages
  // -----------------------------------------------------------------------

  describe('auth enforcement', () => {
    it('sends bot_unauthorized for unregistered user on /wallets', async () => {
      const updates = [makeUpdate(99999, '/wallets', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(99999, en.telegram.bot_unauthorized);
    });

    it('sends bot_pending_approval for PENDING user on /status', async () => {
      registerUser(db, 100, 'PENDING');
      const updates = [makeUpdate(100, '/status', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(100, en.telegram.bot_pending_approval);
    });

    it('sends bot_admin_only for READONLY user on /approve', async () => {
      registerUser(db, 300, 'READONLY');
      const updates = [makeUpdate(300, '/approve TX-001', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(300, en.telegram.bot_admin_only);
    });
  });

  // -----------------------------------------------------------------------
  // /wallets command
  // -----------------------------------------------------------------------

  describe('/wallets command', () => {
    it('lists wallets with name, chain, environment, status', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-1', 'MyWallet', 'solana', 'testnet', 'ACTIVE');
      insertWallet(db, 'w-2', 'EvmWallet', 'ethereum', 'mainnet', 'SUSPENDED');

      const updates = [makeUpdate(200, '/wallets', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const text = call[1] as string;
      expect(text).toContain('Wallets');
      expect(text).toContain('MyWallet');
      expect(text).toContain('EvmWallet');
      expect(text).toContain('solana');
      expect(text).toContain('ethereum');
    });

    it('sends bot_wallets_empty when no wallets exist', async () => {
      registerUser(db, 200, 'ADMIN');
      const updates = [makeUpdate(200, '/wallets', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_wallets_empty);
    });

    it('allows READONLY user to use /wallets', async () => {
      registerUser(db, 300, 'READONLY');
      insertWallet(db, 'w-1', 'Test', 'solana', 'testnet', 'ACTIVE');

      const updates = [makeUpdate(300, '/wallets', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const text = call[1] as string;
      expect(text).toContain('Test');
    });
  });

  // -----------------------------------------------------------------------
  // /pending command
  // -----------------------------------------------------------------------

  describe('/pending command', () => {
    it('shows pending approval transactions with inline keyboard', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-1', 'MyWallet', 'solana', 'testnet', 'ACTIVE');
      insertPendingTx(db, 'TX-001', 'w-1', 'solana', 'TRANSFER', '1.5', 'addr1');
      insertPendingTx(db, 'TX-002', 'w-1', 'solana', 'TOKEN_TRANSFER', '100', 'addr2');

      const updates = [makeUpdate(200, '/pending', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(2); // one per pending tx
      }, { timeout: 3000 });
      service.stop();

      // Verify inline keyboard in the calls
      const calls = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
      for (const call of calls) {
        const keyboard = call[2];
        expect(keyboard).toBeDefined();
        expect(keyboard.inline_keyboard).toBeDefined();
        expect(keyboard.inline_keyboard[0]).toHaveLength(2);
        // Check callback_data format
        const approveBtn = keyboard.inline_keyboard[0][0];
        const rejectBtn = keyboard.inline_keyboard[0][1];
        expect(approveBtn.callback_data).toMatch(/^approve:TX-00[12]$/);
        expect(rejectBtn.callback_data).toMatch(/^reject:TX-00[12]$/);
      }
    });

    it('sends bot_pending_empty when no pending transactions', async () => {
      registerUser(db, 200, 'ADMIN');

      const updates = [makeUpdate(200, '/pending', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_pending_empty);
    });
  });

  // -----------------------------------------------------------------------
  // /approve command
  // -----------------------------------------------------------------------

  describe('/approve command', () => {
    it('approves valid pending transaction', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-1', 'MyWallet', 'solana', 'testnet', 'ACTIVE');
      insertPendingTx(db, 'TX-001', 'w-1', 'solana', 'TRANSFER', '1.5', 'addr1');

      const updates = [makeUpdate(200, '/approve TX-001', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_approve_success);

      // Verify DB state
      const pa = db.prepare('SELECT approved_at FROM pending_approvals WHERE tx_id = ?').get('TX-001') as any;
      expect(pa.approved_at).toBeGreaterThan(0);

      const tx = db.prepare('SELECT status FROM transactions WHERE id = ?').get('TX-001') as any;
      expect(tx.status).toBe('EXECUTING');

      // Verify audit log
      const log = db.prepare("SELECT * FROM audit_log WHERE event_type = 'TX_APPROVED_VIA_TELEGRAM'").get() as any;
      expect(log).toBeDefined();
      expect(log.actor).toBe('telegram:200');
      expect(log.tx_id).toBe('TX-001');
    });

    it('sends bot_tx_not_found for invalid txId', async () => {
      registerUser(db, 200, 'ADMIN');

      const updates = [makeUpdate(200, '/approve INVALID-TX', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_tx_not_found);
    });

    it('sends bot_tx_not_found when no txId provided', async () => {
      registerUser(db, 200, 'ADMIN');

      const updates = [makeUpdate(200, '/approve', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_tx_not_found);
    });
  });

  // -----------------------------------------------------------------------
  // /reject command
  // -----------------------------------------------------------------------

  describe('/reject command', () => {
    it('rejects valid pending transaction', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-1', 'MyWallet', 'solana', 'testnet', 'ACTIVE');
      insertPendingTx(db, 'TX-001', 'w-1', 'solana', 'TRANSFER', '1.5', 'addr1');

      const updates = [makeUpdate(200, '/reject TX-001', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_reject_success);

      // Verify DB state
      const pa = db.prepare('SELECT rejected_at FROM pending_approvals WHERE tx_id = ?').get('TX-001') as any;
      expect(pa.rejected_at).toBeGreaterThan(0);

      const tx = db.prepare('SELECT status, error FROM transactions WHERE id = ?').get('TX-001') as any;
      expect(tx.status).toBe('CANCELLED');
      expect(tx.error).toBe('Rejected via Telegram');

      // Verify audit log
      const log = db.prepare("SELECT * FROM audit_log WHERE event_type = 'TX_REJECTED_VIA_TELEGRAM'").get() as any;
      expect(log).toBeDefined();
      expect(log.actor).toBe('telegram:200');
    });

    it('sends bot_tx_not_found for invalid txId', async () => {
      registerUser(db, 200, 'ADMIN');

      const updates = [makeUpdate(200, '/reject INVALID-TX', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_tx_not_found);
    });
  });

  // -----------------------------------------------------------------------
  // Callback query handling
  // -----------------------------------------------------------------------

  describe('callback_query', () => {
    it('approve:TX-001 triggers handleApprove and answerCallbackQuery', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-1', 'MyWallet', 'solana', 'testnet', 'ACTIVE');
      insertPendingTx(db, 'TX-001', 'w-1', 'solana', 'TRANSFER', '1.5', 'addr1');

      const updates = [makeCallbackUpdate(200, 'approve:TX-001', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_approve_success);
      expect(api.answerCallbackQuery).toHaveBeenCalledWith('cb-1', en.telegram.keyboard_approve);

      // Verify DB
      const tx = db.prepare('SELECT status FROM transactions WHERE id = ?').get('TX-001') as any;
      expect(tx.status).toBe('EXECUTING');
    });

    it('reject:TX-001 triggers handleReject and answerCallbackQuery', async () => {
      registerUser(db, 200, 'ADMIN');
      insertWallet(db, 'w-1', 'MyWallet', 'solana', 'testnet', 'ACTIVE');
      insertPendingTx(db, 'TX-001', 'w-1', 'solana', 'TRANSFER', '1.5', 'addr1');

      const updates = [makeCallbackUpdate(200, 'reject:TX-001', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_reject_success);
      expect(api.answerCallbackQuery).toHaveBeenCalledWith('cb-1', en.telegram.keyboard_reject);

      // Verify DB
      const tx = db.prepare('SELECT status FROM transactions WHERE id = ?').get('TX-001') as any;
      expect(tx.status).toBe('CANCELLED');
    });

    it('denies callback_query for READONLY user with admin_only', async () => {
      registerUser(db, 300, 'READONLY');

      const updates = [makeCallbackUpdate(300, 'approve:TX-001', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.answerCallbackQuery).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.answerCallbackQuery).toHaveBeenCalledWith('cb-1', en.telegram.bot_admin_only);
      // sendMessage should NOT have been called (no success/error message sent)
      expect(api.sendMessage).not.toHaveBeenCalled();
    });
  });
});
