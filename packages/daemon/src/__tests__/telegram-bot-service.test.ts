/**
 * TelegramBotService unit tests.
 *
 * Tests cover:
 *   - /start: new registration (PENDING) + welcome message
 *   - /start: duplicate registration (already registered message)
 *   - /help: command list display
 *   - /status: daemon status with uptime, kill switch, wallet/session counts
 *   - Long Polling: offset advancement
 *   - Long Polling: exponential backoff on error
 *   - Long Polling: backoff reset on success
 *   - stop(): running flag toggle
 *   - i18n: locale='ko' Korean messages
 *   - Unknown command: silently ignored
 *   - Message without text: silently ignored
 *   - MarkdownV2 escape utility
 *   - /start with @botname suffix
 *   - /status with kill switch service
 *   - handleUpdate with callback_query (stub, no crash)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { TelegramBotService, escapeMarkdownV2 } from '../infrastructure/telegram/telegram-bot-service.js';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TelegramBotService', () => {
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
  // /start command
  // -----------------------------------------------------------------------

  describe('/start command', () => {
    it('registers new user with PENDING role and sends welcome + pending messages', async () => {
      const updates = [makeUpdate(12345, '/start', 1, 'testuser')];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {})); // block forever after first batch

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(2);
      }, { timeout: 3000 });
      service.stop();

      // Verify DB record
      const row = db.prepare('SELECT * FROM telegram_users WHERE chat_id = ?').get(12345) as any;
      expect(row).toBeDefined();
      expect(row.role).toBe('PENDING');
      expect(row.username).toBe('testuser');
      expect(row.registered_at).toBeGreaterThan(0);

      // Verify messages sent
      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(12345, en.telegram.bot_welcome);
      expect(api.sendMessage).toHaveBeenCalledWith(12345, en.telegram.bot_pending_approval);
    });

    it('sends already-registered message for duplicate /start', async () => {
      // Pre-register user
      const now = Math.floor(Date.now() / 1000);
      db.prepare('INSERT INTO telegram_users (chat_id, username, role, registered_at) VALUES (?, ?, ?, ?)')
        .run(12345, 'testuser', 'PENDING', now);

      const updates = [makeUpdate(12345, '/start', 1, 'testuser')];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(12345, en.telegram.bot_already_registered);
    });

    it('handles /start@botname suffix correctly', async () => {
      const updates = [makeUpdate(12345, '/start@MyBot', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalled();
      }, { timeout: 3000 });
      service.stop();

      // Should have registered successfully
      const row = db.prepare('SELECT * FROM telegram_users WHERE chat_id = ?').get(12345) as any;
      expect(row).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // /help command
  // -----------------------------------------------------------------------

  describe('/help command', () => {
    it('sends help message with command list', async () => {
      const updates = [makeUpdate(12345, '/help', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      service.stop();

      const en = getMessages('en');
      expect(api.sendMessage).toHaveBeenCalledWith(12345, en.telegram.bot_help);
    });
  });

  // -----------------------------------------------------------------------
  // /status command
  // -----------------------------------------------------------------------

  describe('/status command', () => {
    it('sends status message with uptime, wallets, sessions', async () => {
      const updates = [makeUpdate(12345, '/status', 1)];
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
      // Should contain header and body sections
      expect(text).toContain('Daemon Status');
      expect(text).toContain('Kill Switch');
      expect(text).toContain('Wallets');
      expect(text).toContain('Sessions');
    });

    it('shows kill switch state from killSwitchService', async () => {
      const mockKillSwitch = {
        getState: vi.fn().mockReturnValue({ state: 'SUSPENDED', activatedAt: null, activatedBy: null }),
      };
      const svcWithKs = new TelegramBotService({
        sqlite: db,
        api,
        locale: 'en',
        killSwitchService: mockKillSwitch as any,
      });

      const updates = [makeUpdate(12345, '/status', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      svcWithKs.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      svcWithKs.stop();

      const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const text = call[1] as string;
      expect(text).toContain('SUSPENDED');
    });
  });

  // -----------------------------------------------------------------------
  // Long Polling mechanics
  // -----------------------------------------------------------------------

  describe('Long Polling', () => {
    it('advances offset after processing updates', async () => {
      const updates = [
        makeUpdate(111, '/help', 100),
        makeUpdate(222, '/help', 101),
      ];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(2);
      }, { timeout: 3000 });
      service.stop();

      // On next call, offset should be 102 (101 + 1)
      // Check that getUpdates was called with updated offset on second call
      const calls = (api.getUpdates as ReturnType<typeof vi.fn>).mock.calls;
      // First call with offset 0
      expect(calls[0]![0]).toBe(0);
      // Second call (blocked) with offset 102
      expect(calls[1]![0]).toBe(102);
    });

    it('applies exponential backoff on error (1s -> 2s -> 4s)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockImplementation(() => new Promise(() => {}));

      service.start();

      // After 3 errors, backoff should be 1000 -> 2000 -> 4000 -> (next would be 8000)
      await vi.waitFor(() => {
        expect((api.getUpdates as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(4);
      }, { timeout: 15000 });
      service.stop();

      // The backoff should have doubled each time
      // After 3 errors the internal backoff should be 8000 (1000*2*2*2)
      expect(service.currentBackoffMs).toBe(8000);

      vi.useRealTimers();
    });

    it('resets backoff on success after errors', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([]) // success
        .mockImplementation(() => new Promise(() => {}));

      service.start();

      await vi.waitFor(() => {
        expect((api.getUpdates as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(4);
      }, { timeout: 15000 });
      service.stop();

      // After success, backoff should be reset to 1000
      expect(service.currentBackoffMs).toBe(1000);

      vi.useRealTimers();
    });

    it('stop() sets running to false', () => {
      service.start();
      expect(service.isRunning).toBe(true);
      service.stop();
      expect(service.isRunning).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // i18n
  // -----------------------------------------------------------------------

  describe('i18n', () => {
    it('sends Korean messages when locale is ko', async () => {
      const koService = new TelegramBotService({ sqlite: db, api, locale: 'ko' });

      const updates = [makeUpdate(12345, '/start', 1, 'testuser')];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      koService.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(2);
      }, { timeout: 3000 });
      koService.stop();

      const ko = getMessages('ko');
      expect(api.sendMessage).toHaveBeenCalledWith(12345, ko.telegram.bot_welcome);
      expect(api.sendMessage).toHaveBeenCalledWith(12345, ko.telegram.bot_pending_approval);
    });

    it('sends Korean help message', async () => {
      const koService = new TelegramBotService({ sqlite: db, api, locale: 'ko' });

      const updates = [makeUpdate(12345, '/help', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      koService.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      koService.stop();

      const ko = getMessages('ko');
      expect(api.sendMessage).toHaveBeenCalledWith(12345, ko.telegram.bot_help);
    });

    it('sends Korean status message', async () => {
      const koService = new TelegramBotService({ sqlite: db, api, locale: 'ko' });

      const updates = [makeUpdate(12345, '/status', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      koService.start();
      await vi.waitFor(() => {
        expect(api.sendMessage).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      koService.stop();

      const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const text = call[1] as string;
      // Korean status header
      const ko = getMessages('ko');
      expect(text).toContain(escapeMarkdownV2(ko.telegram.bot_status_header));
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('ignores messages without text', async () => {
      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 123, is_bot: false, first_name: 'Test' },
          chat: { id: 123, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          // no text
        },
      };
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([update])
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      // Wait a bit, no sendMessage should be called
      await new Promise((r) => setTimeout(r, 200));
      service.stop();

      expect(api.sendMessage).not.toHaveBeenCalled();
    });

    it('ignores unknown commands', async () => {
      const updates = [makeUpdate(12345, '/unknown', 1)];
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(updates)
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await new Promise((r) => setTimeout(r, 200));
      service.stop();

      expect(api.sendMessage).not.toHaveBeenCalled();
    });

    it('handles callback_query without crashing (stub)', async () => {
      const update: TelegramUpdate = {
        update_id: 1,
        callback_query: {
          id: 'cb-1',
          from: { id: 123, is_bot: false, first_name: 'Test' },
          data: 'test',
        },
      };
      (api.getUpdates as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([update])
        .mockImplementation(() => new Promise(() => {}));

      service.start();
      await new Promise((r) => setTimeout(r, 200));
      service.stop();

      // Should not crash and no sendMessage called
      expect(api.sendMessage).not.toHaveBeenCalled();
    });

    it('does not start twice when start() called twice', () => {
      service.start();
      service.start(); // second call should be no-op
      expect(service.isRunning).toBe(true);
      service.stop();
    });
  });

  // -----------------------------------------------------------------------
  // MarkdownV2 escape utility
  // -----------------------------------------------------------------------

  describe('escapeMarkdownV2', () => {
    it('escapes special characters', () => {
      expect(escapeMarkdownV2('hello_world')).toBe('hello\\_world');
      expect(escapeMarkdownV2('test*bold*')).toBe('test\\*bold\\*');
      expect(escapeMarkdownV2('count (5)')).toBe('count \\(5\\)');
      expect(escapeMarkdownV2('a.b.c')).toBe('a\\.b\\.c');
      expect(escapeMarkdownV2('line-break')).toBe('line\\-break');
    });

    it('handles empty string', () => {
      expect(escapeMarkdownV2('')).toBe('');
    });

    it('handles string with no special characters', () => {
      expect(escapeMarkdownV2('hello world 123')).toBe('hello world 123');
    });
  });
});
