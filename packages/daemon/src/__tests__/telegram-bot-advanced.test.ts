/**
 * TelegramBotService advanced tests: /killswitch, /newsession, inline keyboard, i18n.
 *
 * Tests cover:
 *   - buildConfirmKeyboard: Yes/No buttons + callback_data
 *   - buildWalletSelectKeyboard: wallet list -> multi-row keyboard
 *   - buildApprovalKeyboard: Approve/Reject buttons with txId
 *   - /killswitch: ACTIVE state -> confirm keyboard sent
 *   - /killswitch: SUSPENDED state -> already active message
 *   - callback killswitch:confirm -> activateWithCascade + success message
 *   - callback killswitch:cancel -> cancelled message
 *   - /newsession: ACTIVE wallets -> wallet selection keyboard
 *   - /newsession: no wallets -> empty message
 *   - callback newsession:{walletId} -> session created + token sent
 *   - callback newsession:{walletId} -> sessions table record inserted
 *   - callback newsession:{invalidId} -> wallet not found
 *   - i18n locale='en' -> English messages
 *   - i18n locale='ko' -> Korean messages (keyboard_approve = "승인")
 *   - /pending uses buildApprovalKeyboard
 *
 * @see packages/daemon/src/infrastructure/telegram/telegram-keyboard.ts
 * @see packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { TelegramBotService } from '../infrastructure/telegram/telegram-bot-service.js';
import {
  buildConfirmKeyboard,
  buildWalletSelectKeyboard,
  buildApprovalKeyboard,
} from '../infrastructure/telegram/telegram-keyboard.js';
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

function registerUser(db: DatabaseType, chatId: number, role: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO telegram_users (chat_id, username, role, registered_at) VALUES (?, ?, ?, ?)',
  ).run(chatId, null, role, now);
}

function insertWallet(db: DatabaseType, id: string, name: string, status = 'ACTIVE'): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, name, 'solana', 'testnet', `pk-${id}`, status, now, now);
}

function insertPendingTx(db: DatabaseType, txId: string, walletId: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?)",
  ).run(txId, walletId, 'solana', 'TRANSFER', '1.5', 'addr1', now);
  db.prepare(
    'INSERT INTO pending_approvals (id, tx_id, required_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(`pa-${txId}`, txId, now + 3600, now + 3600, now);
}

function createMockKillSwitchService(state = 'ACTIVE') {
  return {
    getState: vi.fn().mockReturnValue({ state, activatedAt: null, activatedBy: null }),
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

// ---------------------------------------------------------------------------
// Keyboard builder tests
// ---------------------------------------------------------------------------

describe('Telegram keyboard builders', () => {
  describe('buildConfirmKeyboard', () => {
    it('builds Yes/No buttons with killswitch callback_data', () => {
      const en = getMessages('en');
      const keyboard = buildConfirmKeyboard(en.telegram);

      expect(keyboard.inline_keyboard).toHaveLength(1);
      expect(keyboard.inline_keyboard[0]).toHaveLength(2);
      expect(keyboard.inline_keyboard[0]![0]!.text).toBe('Yes');
      expect(keyboard.inline_keyboard[0]![0]!.callback_data).toBe('killswitch:confirm');
      expect(keyboard.inline_keyboard[0]![1]!.text).toBe('No');
      expect(keyboard.inline_keyboard[0]![1]!.callback_data).toBe('killswitch:cancel');
    });

    it('uses Korean text when ko locale provided', () => {
      const ko = getMessages('ko');
      const keyboard = buildConfirmKeyboard(ko.telegram);

      expect(keyboard.inline_keyboard[0]![0]!.text).toBe(ko.telegram.keyboard_yes);
      expect(keyboard.inline_keyboard[0]![1]!.text).toBe(ko.telegram.keyboard_no);
    });
  });

  describe('buildWalletSelectKeyboard', () => {
    it('builds one row per wallet', () => {
      const wallets = [
        { id: 'w-1', name: 'Alpha' },
        { id: 'w-2', name: 'Beta' },
        { id: 'w-3', name: 'Gamma' },
      ];
      const keyboard = buildWalletSelectKeyboard(wallets);

      expect(keyboard.inline_keyboard).toHaveLength(3);
      expect(keyboard.inline_keyboard[0]![0]!.text).toBe('Alpha');
      expect(keyboard.inline_keyboard[0]![0]!.callback_data).toBe('newsession:w-1');
      expect(keyboard.inline_keyboard[1]![0]!.text).toBe('Beta');
      expect(keyboard.inline_keyboard[1]![0]!.callback_data).toBe('newsession:w-2');
      expect(keyboard.inline_keyboard[2]![0]!.text).toBe('Gamma');
      expect(keyboard.inline_keyboard[2]![0]!.callback_data).toBe('newsession:w-3');
    });

    it('returns empty keyboard for no wallets', () => {
      const keyboard = buildWalletSelectKeyboard([]);
      expect(keyboard.inline_keyboard).toHaveLength(0);
    });
  });

  describe('buildApprovalKeyboard', () => {
    it('builds Approve/Reject buttons with txId', () => {
      const en = getMessages('en');
      const keyboard = buildApprovalKeyboard('TX-001-long-uuid', en.telegram);

      expect(keyboard.inline_keyboard).toHaveLength(1);
      expect(keyboard.inline_keyboard[0]).toHaveLength(2);
      expect(keyboard.inline_keyboard[0]![0]!.text).toContain('Approve');
      expect(keyboard.inline_keyboard[0]![0]!.text).toContain('TX-001-l');
      expect(keyboard.inline_keyboard[0]![0]!.callback_data).toBe('approve:TX-001-long-uuid');
      expect(keyboard.inline_keyboard[0]![1]!.text).toContain('Reject');
      expect(keyboard.inline_keyboard[0]![1]!.callback_data).toBe('reject:TX-001-long-uuid');
    });
  });
});

// ---------------------------------------------------------------------------
// /killswitch command tests
// ---------------------------------------------------------------------------

describe('TelegramBotService /killswitch', () => {
  let db: DatabaseType;
  let api: TelegramApi;

  beforeEach(() => {
    db = createTestDb();
    api = createMockApi();
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('sends confirm keyboard when kill switch is ACTIVE', async () => {
    registerUser(db, 200, 'ADMIN');
    const ks = createMockKillSwitchService('ACTIVE');
    const service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'en',
      killSwitchService: ks as any,
    });

    const updates = [makeUpdate(200, '/killswitch', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    const en = getMessages('en');
    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1]).toBe(en.telegram.bot_killswitch_confirm);
    // Should have inline keyboard
    const keyboard = call[2];
    expect(keyboard).toBeDefined();
    expect(keyboard.inline_keyboard[0][0].callback_data).toBe('killswitch:confirm');
    expect(keyboard.inline_keyboard[0][1].callback_data).toBe('killswitch:cancel');
  });

  it('sends already-active message when kill switch is SUSPENDED', async () => {
    registerUser(db, 200, 'ADMIN');
    const ks = createMockKillSwitchService('SUSPENDED');
    const service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'en',
      killSwitchService: ks as any,
    });

    const updates = [makeUpdate(200, '/killswitch', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(ks.getState).toHaveBeenCalled();
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1]).toContain('SUSPENDED');
  });

  it('callback killswitch:confirm triggers activateWithCascade and success message', async () => {
    registerUser(db, 200, 'ADMIN');
    const ks = createMockKillSwitchService('ACTIVE');
    const service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'en',
      killSwitchService: ks as any,
    });

    const updates = [makeCallbackUpdate(200, 'killswitch:confirm', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    expect(ks.activateWithCascade).toHaveBeenCalledWith('telegram:200');

    const en = getMessages('en');
    expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_killswitch_success);
    expect(api.answerCallbackQuery).toHaveBeenCalledWith('cb-1', en.telegram.keyboard_yes);
  });

  it('callback killswitch:cancel sends cancelled message', async () => {
    registerUser(db, 200, 'ADMIN');
    const ks = createMockKillSwitchService('ACTIVE');
    const service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'en',
      killSwitchService: ks as any,
    });

    const updates = [makeCallbackUpdate(200, 'killswitch:cancel', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    const en = getMessages('en');
    expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_killswitch_cancelled);
    expect(api.answerCallbackQuery).toHaveBeenCalledWith('cb-1', en.telegram.keyboard_no);
  });
});

// ---------------------------------------------------------------------------
// /newsession command tests
// ---------------------------------------------------------------------------

describe('TelegramBotService /newsession', () => {
  let db: DatabaseType;
  let api: TelegramApi;

  beforeEach(() => {
    db = createTestDb();
    api = createMockApi();
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('sends wallet selection keyboard with ACTIVE wallets', async () => {
    registerUser(db, 200, 'ADMIN');
    insertWallet(db, 'w-1', 'Alpha', 'ACTIVE');
    insertWallet(db, 'w-2', 'Beta', 'ACTIVE');
    insertWallet(db, 'w-3', 'Gamma', 'SUSPENDED');

    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    const updates = [makeUpdate(200, '/newsession', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    const en = getMessages('en');
    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1]).toBe(en.telegram.bot_newsession_select);
    const keyboard = call[2];
    expect(keyboard).toBeDefined();
    // Only 2 ACTIVE wallets should appear
    expect(keyboard.inline_keyboard).toHaveLength(2);
    expect(keyboard.inline_keyboard[0][0].callback_data).toMatch(/^newsession:w-/);
  });

  it('sends bot_wallets_empty when no ACTIVE wallets', async () => {
    registerUser(db, 200, 'ADMIN');
    insertWallet(db, 'w-1', 'Alpha', 'SUSPENDED');

    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    const updates = [makeUpdate(200, '/newsession', 1)];
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

  it('callback newsession:{walletId} creates session and sends token', async () => {
    registerUser(db, 200, 'ADMIN');
    insertWallet(db, 'w-1', 'Alpha', 'ACTIVE');
    const jwt = createMockJwtSecretManager();

    const service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'en',
      jwtSecretManager: jwt as any,
    });

    const updates = [makeCallbackUpdate(200, 'newsession:w-1', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    // Should have called signToken
    expect(jwt.signToken).toHaveBeenCalledTimes(1);

    // Verify token was sent
    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1]).toContain('wai_sess_');

    // answerCallbackQuery should have been called
    expect(api.answerCallbackQuery).toHaveBeenCalledWith('cb-1');
  });

  it('callback newsession:{walletId} inserts session record in DB', async () => {
    registerUser(db, 200, 'ADMIN');
    insertWallet(db, 'w-1', 'Alpha', 'ACTIVE');
    const jwt = createMockJwtSecretManager();

    const service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'en',
      jwtSecretManager: jwt as any,
    });

    const updates = [makeCallbackUpdate(200, 'newsession:w-1', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    // Verify session was inserted (session_wallets junction table)
    const sw = db.prepare('SELECT * FROM session_wallets WHERE wallet_id = ?').get('w-1') as any;
    expect(sw).toBeDefined();
    expect(sw.wallet_id).toBe('w-1');
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sw.session_id) as any;
    expect(session).toBeDefined();
    expect(session.token_hash).toBeDefined();
    expect(session.token_hash.length).toBe(64); // SHA-256 hex
    expect(session.renewal_count).toBe(0);
    expect(session.max_renewals).toBe(12);
    expect(session.revoked_at).toBeNull();

    // Verify audit log
    const log = db.prepare("SELECT * FROM audit_log WHERE event_type = 'SESSION_ISSUED_VIA_TELEGRAM'").get() as any;
    expect(log).toBeDefined();
    expect(log.actor).toBe('telegram:200');
  });

  it('callback newsession:{invalidId} sends wallet not found', async () => {
    registerUser(db, 200, 'ADMIN');
    const jwt = createMockJwtSecretManager();

    const service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'en',
      jwtSecretManager: jwt as any,
    });

    const updates = [makeCallbackUpdate(200, 'newsession:nonexistent', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    const en = getMessages('en');
    expect(api.sendMessage).toHaveBeenCalledWith(200, en.telegram.bot_newsession_wallet_not_found);
  });
});

// ---------------------------------------------------------------------------
// i18n integration
// ---------------------------------------------------------------------------

describe('TelegramBotService i18n for advanced commands', () => {
  let db: DatabaseType;
  let api: TelegramApi;

  beforeEach(() => {
    db = createTestDb();
    api = createMockApi();
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('locale en: /killswitch sends English confirm message', async () => {
    registerUser(db, 200, 'ADMIN');
    const ks = createMockKillSwitchService('ACTIVE');
    const service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'en',
      killSwitchService: ks as any,
    });

    const updates = [makeUpdate(200, '/killswitch', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    const en = getMessages('en');
    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1]).toBe(en.telegram.bot_killswitch_confirm);
    // Keyboard Yes/No in English
    const keyboard = call[2];
    expect(keyboard.inline_keyboard[0][0].text).toBe('Yes');
    expect(keyboard.inline_keyboard[0][1].text).toBe('No');
  });

  it('locale ko: /killswitch sends Korean confirm message', async () => {
    registerUser(db, 200, 'ADMIN');
    const ks = createMockKillSwitchService('ACTIVE');
    const service = new TelegramBotService({
      sqlite: db,
      api,
      locale: 'ko',
      killSwitchService: ks as any,
    });

    const updates = [makeUpdate(200, '/killswitch', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    const ko = getMessages('ko');
    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1]).toBe(ko.telegram.bot_killswitch_confirm);
    // Keyboard in Korean
    const keyboard = call[2];
    expect(keyboard.inline_keyboard[0][0].text).toBe(ko.telegram.keyboard_yes);
    expect(keyboard.inline_keyboard[0][1].text).toBe(ko.telegram.keyboard_no);
  });
});

// ---------------------------------------------------------------------------
// /pending with buildApprovalKeyboard
// ---------------------------------------------------------------------------

describe('TelegramBotService /pending with buildApprovalKeyboard', () => {
  let db: DatabaseType;
  let api: TelegramApi;

  beforeEach(() => {
    db = createTestDb();
    api = createMockApi();
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it('/pending sends approval keyboard built by buildApprovalKeyboard', async () => {
    registerUser(db, 200, 'ADMIN');
    insertWallet(db, 'w-1', 'MyWallet', 'ACTIVE');
    insertPendingTx(db, 'TX-001', 'w-1');

    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    const updates = [makeUpdate(200, '/pending', 1)];
    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(updates)
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    await vi.waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
    service.stop();

    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const keyboard = call[2];
    expect(keyboard).toBeDefined();
    expect(keyboard.inline_keyboard[0][0].callback_data).toBe('approve:TX-001');
    expect(keyboard.inline_keyboard[0][1].callback_data).toBe('reject:TX-001');
    // Verify button text matches the buildApprovalKeyboard format
    expect(keyboard.inline_keyboard[0][0].text).toContain('Approve');
    expect(keyboard.inline_keyboard[0][1].text).toContain('Reject');
  });
});
