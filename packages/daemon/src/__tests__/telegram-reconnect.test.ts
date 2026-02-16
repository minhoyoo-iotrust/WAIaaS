/**
 * TelegramBotService Long Polling reconnect + exponential backoff tests.
 *
 * Tests cover:
 *   - Exponential backoff progression: 1s, 2s, 4s, 8s, 16s, max 30s
 *   - Success resets backoff to 1s and retryCount to 0
 *   - Telegram API 401 error: stop polling, no retry
 *   - Telegram API 409 error: stop polling, no retry
 *   - stop() exits polling loop immediately
 *   - Network error then success: normal update processing continues
 *   - 3 consecutive failures: console.warn log emitted
 *   - Logging throttle: warn only every 3 failures (not every failure)
 *
 * Uses mock TelegramApi to control getUpdates success/failure sequences.
 * Uses vi.useFakeTimers to control backoff sleep durations.
 *
 * Backoff flow per error:
 *   1. retryCount++
 *   2. sleep(backoffMs)             <-- blocks until timer advances
 *   3. backoffMs = min(backoffMs*2, MAX_BACKOFF)
 *   4. next getUpdates call
 *
 * So after N errors and their sleep timers complete:
 *   - Error 1: sleep 1s  -> backoff becomes 2s
 *   - Error 2: sleep 2s  -> backoff becomes 4s
 *   - Error 3: sleep 4s  -> backoff becomes 8s
 *   - Error 4: sleep 8s  -> backoff becomes 16s
 *   - Error 5: sleep 16s -> backoff becomes 30s (capped)
 *   - Error 6: sleep 30s -> backoff stays 30s (capped)
 *
 * @see packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { TelegramBotService } from '../infrastructure/telegram/telegram-bot-service.js';
import type { TelegramApi } from '../infrastructure/telegram/telegram-api.js';
import type { TelegramUpdate } from '../infrastructure/telegram/telegram-types.js';
import type { Database as DatabaseType } from 'better-sqlite3';

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

function makeUpdate(chatId: number, text: string, updateId = 1): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: 1,
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      chat: { id: chatId, type: 'private' },
      text,
      date: Math.floor(Date.now() / 1000),
    },
  };
}

// ---------------------------------------------------------------------------
// Exponential backoff tests
// ---------------------------------------------------------------------------

describe('TelegramBotService Long Polling reconnect', () => {
  let db: DatabaseType;
  let api: TelegramApi;

  beforeEach(() => {
    db = createTestDb();
    api = createMockApi();
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    try { db.close(); } catch { /* already closed */ }
  });

  it('first network error: retryCount=1, sleeps 1s, then backoff=2s', async () => {
    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockImplementation(() => new Promise(() => {}));

    service.start();

    // Let the first getUpdates reject and start sleep(1000)
    await vi.advanceTimersByTimeAsync(0);

    expect(service.consecutiveFailures).toBe(1);
    // backoffMs is still 1000 (doubling happens after sleep completes)
    expect(service.currentBackoffMs).toBe(1000);

    // Complete the 1s sleep -> backoff doubles to 2000
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.currentBackoffMs).toBe(2000);
  });

  it('second consecutive error: sleeps 2s, then backoff=4s', async () => {
    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockImplementation(() => new Promise(() => {}));

    service.start();

    // Error 1: reject + sleep(1s)
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000); // complete 1s sleep -> backoff=2s

    // Error 2 rejects immediately, starts sleep(2s)
    await vi.advanceTimersByTimeAsync(0);
    expect(service.consecutiveFailures).toBe(2);

    // Complete 2s sleep -> backoff doubles to 4s
    await vi.advanceTimersByTimeAsync(2000);
    expect(service.currentBackoffMs).toBe(4000);
  });

  it('third consecutive error: sleeps 4s, then backoff=8s', async () => {
    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockRejectedValueOnce(new Error('e3'))
      .mockImplementation(() => new Promise(() => {}));

    service.start();

    // Error 1: sleep 1s
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    // Error 2: sleep 2s
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    // Error 3: sleep 4s
    await vi.advanceTimersByTimeAsync(0);
    expect(service.consecutiveFailures).toBe(3);

    await vi.advanceTimersByTimeAsync(4000);
    expect(service.currentBackoffMs).toBe(8000);
  });

  it('fifth consecutive error: sleeps 16s, then backoff=30s (capped)', async () => {
    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockRejectedValueOnce(new Error('e3'))
      .mockRejectedValueOnce(new Error('e4'))
      .mockRejectedValueOnce(new Error('e5'))
      .mockImplementation(() => new Promise(() => {}));

    service.start();

    // Error 1: sleep 1s -> 2s
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    // Error 2: sleep 2s -> 4s
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    // Error 3: sleep 4s -> 8s
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4000);
    // Error 4: sleep 8s -> 16s
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(8000);
    // Error 5: sleep 16s -> min(32000, 30000) = 30000
    await vi.advanceTimersByTimeAsync(0);
    expect(service.consecutiveFailures).toBe(5);

    await vi.advanceTimersByTimeAsync(16000);
    expect(service.currentBackoffMs).toBe(30_000);
  });

  it('backoff caps at 30s after 6+ consecutive errors', async () => {
    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockRejectedValueOnce(new Error('e3'))
      .mockRejectedValueOnce(new Error('e4'))
      .mockRejectedValueOnce(new Error('e5'))
      .mockRejectedValueOnce(new Error('e6'))
      .mockImplementation(() => new Promise(() => {}));

    service.start();

    // Advance through 5 errors: 0+1000 + 0+2000 + 0+4000 + 0+8000 + 0+16000
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(8000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(16000);

    // Error 6: sleep 30s (already capped)
    await vi.advanceTimersByTimeAsync(0);
    expect(service.consecutiveFailures).toBe(6);

    // After 6th sleep completes: min(30000*2, 30000) = 30000 (stays capped)
    await vi.advanceTimersByTimeAsync(30000);
    expect(service.currentBackoffMs).toBe(30_000);
  });

  it('success after errors resets backoff to 1s and retryCount to 0', async () => {
    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockRejectedValueOnce(new Error('e3'))
      .mockResolvedValueOnce([]) // success!
      .mockImplementation(() => new Promise(() => {}));

    service.start();

    // 3 errors then success
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4000);
    // After 4s sleep, error 3's backoff completes, next getUpdates succeeds
    await vi.advanceTimersByTimeAsync(0);

    expect(service.consecutiveFailures).toBe(0);
    expect(service.currentBackoffMs).toBe(1000);
  });

  it('Telegram API 401 error stops polling without retry', async () => {
    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Telegram API error: 401'));

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    // Give the pollLoop time to process the rejection fully
    await vi.advanceTimersByTimeAsync(0);

    expect(service.isRunning).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('fatal API error'),
    );
    // Only called once (no retries)
    expect(api.getUpdates).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('Telegram API 409 Conflict error stops polling without retry', async () => {
    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Telegram API error: 409'));

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(service.isRunning).toBe(false);
    expect(api.getUpdates).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('stop() exits polling loop', async () => {
    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockImplementation(() => new Promise(() => {}));

    service.start();
    expect(service.isRunning).toBe(true);

    // Process first getUpdates
    await vi.advanceTimersByTimeAsync(0);

    service.stop();
    expect(service.isRunning).toBe(false);
  });

  it('processes updates normally after network error recovery', async () => {
    // Register a user so /help will respond
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      'INSERT INTO telegram_users (chat_id, username, role, registered_at) VALUES (?, ?, ?, ?)',
    ).run(300, null, 'ADMIN', now);

    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });

    const helpUpdate = makeUpdate(300, '/help', 1);

    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce([helpUpdate])
      .mockImplementation(() => new Promise(() => {}));

    service.start();

    // Error 1: reject + sleep(1s)
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    // Success: process the help update
    await vi.advanceTimersByTimeAsync(0);

    expect(api.sendMessage).toHaveBeenCalled();
    const call = (api.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe(300);
    expect(call[1]).toContain('Available Commands');
  });

  it('emits console.warn every 3 consecutive failures (throttled logging)', async () => {
    const service = new TelegramBotService({ sqlite: db, api, locale: 'en' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    (api.getUpdates as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockRejectedValueOnce(new Error('e3'))
      .mockRejectedValueOnce(new Error('e4'))
      .mockRejectedValueOnce(new Error('e5'))
      .mockRejectedValueOnce(new Error('e6'))
      .mockImplementation(() => new Promise(() => {}));

    service.start();

    // Advance through 6 errors with their sleep timers
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(8000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(16000);
    await vi.advanceTimersByTimeAsync(0);

    service.stop();

    // warn called at failure 3 and failure 6 (every 3rd), NOT at 1,2,4,5
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('3 consecutive failures'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('6 consecutive failures'),
    );

    warnSpy.mockRestore();
  });
});
