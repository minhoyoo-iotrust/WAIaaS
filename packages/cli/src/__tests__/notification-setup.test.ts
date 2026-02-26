/**
 * Unit tests for `waiaas notification setup` command.
 *
 * Tests cover all 12 items from issue #195.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock password utils
vi.mock('../utils/password.js', () => ({
  resolvePassword: vi.fn().mockResolvedValue('test-master-pw'),
  promptPassword: vi.fn().mockResolvedValue('123456:ABC-bottoken'),
}));

// Mock prompt utils
vi.mock('../utils/prompt.js', () => ({
  promptText: vi.fn().mockResolvedValue('12345678'),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Capture console output
let mockLog: ReturnType<typeof vi.spyOn>;
let mockError: ReturnType<typeof vi.spyOn>;

// Mock process.exit
class ExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let mockExit: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.clearAllMocks();

  // Re-apply module mock implementations (clearAllMocks preserves, but safety)
  const pw = await import('../utils/password.js');
  vi.mocked(pw.resolvePassword).mockResolvedValue('test-master-pw');
  vi.mocked(pw.promptPassword).mockResolvedValue('123456:ABC-bottoken');
  const pr = await import('../utils/prompt.js');
  vi.mocked(pr.promptText).mockResolvedValue('12345678');

  mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
  mockExit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
    throw new ExitError(code);
  }) as never);
});

afterEach(() => {
  mockLog.mockRestore();
  mockError.mockRestore();
  mockExit.mockRestore();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function setupHealthyDaemon(): void {
  // Health check OK
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
  } as Response);
}

function setupSuccessfulPut(): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ updated: 6 }),
  } as unknown as Response);
}

function setupTestNotificationSuccess(): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      results: [{ channel: 'telegram', success: true }],
    }),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('notificationSetupCommand', () => {
  it('succeeds with all options provided (health → PUT settings → output)', async () => {
    setupHealthyDaemon();
    setupSuccessfulPut();

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await notificationSetupCommand({
      baseUrl: 'http://127.0.0.1:3100',
      botToken: 'bot-token-123',
      chatId: '99887766',
      locale: 'en',
      password: 'master-pw',
    });

    // Verify PUT /v1/admin/settings was called
    const putCall = mockFetch.mock.calls[1]!;
    expect(putCall[0]).toBe('http://127.0.0.1:3100/v1/admin/settings');
    expect(putCall[1]!.method).toBe('PUT');

    // Success output
    const allLog = mockLog.mock.calls.map((c) => c[0]).join('\n');
    expect(allLog).toContain('configured successfully');
    expect(allLog).toContain('99887766');
  });

  it('PUT request body includes 6 setting keys', async () => {
    setupHealthyDaemon();
    setupSuccessfulPut();

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await notificationSetupCommand({
      botToken: 'tok123',
      chatId: '111',
      locale: 'ko',
      password: 'pw',
    });

    const putCall = mockFetch.mock.calls[1]!;
    const body = JSON.parse(putCall[1]!.body as string) as { settings: Array<{ key: string; value: string }> };
    expect(body.settings).toHaveLength(6);

    const keys = body.settings.map((s) => s.key);
    expect(keys).toContain('notifications.enabled');
    expect(keys).toContain('notifications.telegram_bot_token');
    expect(keys).toContain('notifications.telegram_chat_id');
    expect(keys).toContain('notifications.locale');
    expect(keys).toContain('telegram.bot_token');
    expect(keys).toContain('telegram.locale');

    // Verify values
    const tokenSettings = body.settings.filter((s) => s.key.includes('bot_token'));
    for (const s of tokenSettings) {
      expect(s.value).toBe('tok123');
    }
    const localeSettings = body.settings.filter((s) => s.key.includes('locale'));
    for (const s of localeSettings) {
      expect(s.value).toBe('ko');
    }
  });

  it('sends X-Master-Password header', async () => {
    setupHealthyDaemon();
    setupSuccessfulPut();

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await notificationSetupCommand({
      botToken: 'tok',
      chatId: '123',
      password: 'my-secret',
    });

    const putCall = mockFetch.mock.calls[1]!;
    const headers = putCall[1]!.headers as Record<string, string>;
    expect(headers['X-Master-Password']).toBe('my-secret');
  });

  it('--test success sends test notification and shows success message', async () => {
    setupHealthyDaemon();
    setupSuccessfulPut();
    setupTestNotificationSuccess();

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await notificationSetupCommand({
      botToken: 'tok',
      chatId: '123',
      password: 'pw',
      test: true,
    });

    // Should have called POST /v1/admin/notifications/test
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const testCall = mockFetch.mock.calls[2]!;
    expect(testCall[0]).toBe('http://127.0.0.1:3100/v1/admin/notifications/test');
    expect(testCall[1]!.method).toBe('POST');

    const allLog = mockLog.mock.calls.map((c) => c[0]).join('\n');
    expect(allLog).toContain('Test notification sent');
    expect(allLog).toContain('successfully');
  });

  it('--test failure shows error message without process.exit', async () => {
    setupHealthyDaemon();
    setupSuccessfulPut();

    // Test notification fails
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ channel: 'telegram', success: false, error: 'Bot blocked by user' }],
      }),
    } as unknown as Response);

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    // Should NOT throw (no process.exit)
    await notificationSetupCommand({
      botToken: 'tok',
      chatId: '123',
      password: 'pw',
      test: true,
    });

    const allError = mockError.mock.calls.map((c) => c[0]).join('\n');
    expect(allError).toContain('failed');
    expect(allError).toContain('Bot blocked by user');
  });

  it('--test HTTP error shows error message without process.exit', async () => {
    setupHealthyDaemon();
    setupSuccessfulPut();

    // Test endpoint returns 500
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ message: 'Notification service down' }),
    } as unknown as Response);

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await notificationSetupCommand({
      botToken: 'tok',
      chatId: '123',
      password: 'pw',
      test: true,
    });

    const allError = mockError.mock.calls.map((c) => c[0]).join('\n');
    expect(allError).toContain('Test notification failed');
  });

  it('interactive mode: prompts for bot-token (hidden) and chat-id (visible)', async () => {
    setupHealthyDaemon();
    setupSuccessfulPut();

    const { promptPassword } = await import('../utils/password.js');
    const { promptText } = await import('../utils/prompt.js');
    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await notificationSetupCommand({
      password: 'pw',
    });

    // promptPassword called for bot token
    expect(promptPassword).toHaveBeenCalledWith('Telegram bot token: ');
    // promptText called for chat ID
    expect(promptText).toHaveBeenCalledWith('Telegram chat ID: ');
  });

  it('daemon not running exits with error', async () => {
    // Health check fails (fetch throws)
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await expect(notificationSetupCommand({
      botToken: 'tok',
      chatId: '123',
      password: 'pw',
    })).rejects.toThrow(ExitError);

    const allError = mockError.mock.calls.map((c) => c[0]).join('\n');
    expect(allError).toContain('Cannot reach WAIaaS daemon');
  });

  it('PUT 401 (wrong password) exits with error', async () => {
    setupHealthyDaemon();

    // PUT returns 401
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Invalid master password' }),
    } as unknown as Response);

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await expect(notificationSetupCommand({
      botToken: 'tok',
      chatId: '123',
      password: 'wrong-pw',
    })).rejects.toThrow(ExitError);

    const allError = mockError.mock.calls.map((c) => c[0]).join('\n');
    expect(allError).toContain('401');
    expect(allError).toContain('Invalid master password');
  });

  it('invalid locale exits with error', async () => {
    setupHealthyDaemon();

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await expect(notificationSetupCommand({
      botToken: 'tok',
      chatId: '123',
      password: 'pw',
      locale: 'fr',
    })).rejects.toThrow(ExitError);

    const allError = mockError.mock.calls.map((c) => c[0]).join('\n');
    expect(allError).toContain("Invalid locale 'fr'");
    expect(allError).toContain("'en' or 'ko'");
  });

  it('empty chat-id input exits with error', async () => {
    setupHealthyDaemon();

    const { promptText } = await import('../utils/prompt.js');
    vi.mocked(promptText).mockResolvedValueOnce('');

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await expect(notificationSetupCommand({
      botToken: 'tok',
      password: 'pw',
      // chatId not provided → prompt returns empty string
    })).rejects.toThrow(ExitError);

    const allError = mockError.mock.calls.map((c) => c[0]).join('\n');
    expect(allError).toContain('Chat ID cannot be empty');
  });

  it('non-interactive mode (all options given) does not prompt for test', async () => {
    setupHealthyDaemon();
    setupSuccessfulPut();

    const { promptText } = await import('../utils/prompt.js');
    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await notificationSetupCommand({
      botToken: 'tok',
      chatId: '123',
      password: 'pw',
      // test not set → should NOT prompt when all options provided
    });

    // promptText should NOT be called for test prompt
    // (it was not called at all since botToken and chatId were provided)
    expect(promptText).not.toHaveBeenCalled();
    // Only 2 fetch calls (health + PUT), no test notification
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('--password flag prevents resolvePassword from being called', async () => {
    setupHealthyDaemon();
    setupSuccessfulPut();

    const { resolvePassword } = await import('../utils/password.js');
    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await notificationSetupCommand({
      botToken: 'tok',
      chatId: '123',
      password: 'explicit-pw',
    });

    expect(resolvePassword).not.toHaveBeenCalled();
  });

  it('test notification network error is handled gracefully', async () => {
    setupHealthyDaemon();
    setupSuccessfulPut();

    // Test notification fetch throws
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    // Should NOT throw
    await notificationSetupCommand({
      botToken: 'tok',
      chatId: '123',
      password: 'pw',
      test: true,
    });

    const allError = mockError.mock.calls.map((c) => c[0]).join('\n');
    expect(allError).toContain('Failed to send test notification');
  });

  it('strips trailing slashes from base URL', async () => {
    setupHealthyDaemon();
    setupSuccessfulPut();

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await notificationSetupCommand({
      baseUrl: 'http://127.0.0.1:3100///',
      botToken: 'tok',
      chatId: '123',
      password: 'pw',
    });

    const healthCall = mockFetch.mock.calls[0]!;
    expect(healthCall[0]).toBe('http://127.0.0.1:3100/health');
  });

  it('locale defaults to "en" when not provided', async () => {
    setupHealthyDaemon();
    setupSuccessfulPut();

    const { notificationSetupCommand } = await import('../commands/notification-setup.js');

    await notificationSetupCommand({
      botToken: 'tok',
      chatId: '123',
      password: 'pw',
    });

    const putCall = mockFetch.mock.calls[1]!;
    const body = JSON.parse(putCall[1]!.body as string) as { settings: Array<{ key: string; value: string }> };
    const localeSetting = body.settings.find((s) => s.key === 'notifications.locale');
    expect(localeSetting?.value).toBe('en');
  });
});
