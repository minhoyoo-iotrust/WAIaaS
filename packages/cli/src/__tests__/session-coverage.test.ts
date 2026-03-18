/**
 * CLI session.ts coverage tests.
 *
 * Tests sessionPromptCommand with mocked fetch and password resolution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock password utils
vi.mock('../utils/password.js', () => ({
  resolvePassword: vi.fn().mockResolvedValue('test-password'),
  promptPassword: vi.fn().mockResolvedValue('test-password'),
}));

describe('sessionPromptCommand', () => {
  const originalExit = process.exit;
  const exitMock = vi.fn() as unknown as (code?: number) => never;
  const consoleSpy = { log: vi.fn(), error: vi.fn() };
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = exitMock;
    vi.spyOn(console, 'log').mockImplementation(consoleSpy.log);
    vi.spyOn(console, 'error').mockImplementation(consoleSpy.error);
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    process.exit = originalExit;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('success: prints prompt text for new session', async () => {
    const mockResponse = {
      prompt: 'Connect to http://localhost:3100 with password abc',
      walletCount: 2,
      sessionsCreated: 1,
      sessionReused: false,
      expiresAt: 1700000000,
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const { sessionPromptCommand } = await import('../commands/session.js');
    await sessionPromptCommand({ baseUrl: 'http://localhost:3100' });

    expect(consoleSpy.log).toHaveBeenCalledWith(mockResponse.prompt);
    expect(consoleSpy.log).toHaveBeenCalledWith('(Created 1 new session)');
  });

  it('success: prints reused session message', async () => {
    const mockResponse = {
      prompt: 'Connect text',
      walletCount: 1,
      sessionsCreated: 0,
      sessionReused: true,
      expiresAt: 0,
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const { sessionPromptCommand } = await import('../commands/session.js');
    await sessionPromptCommand({ baseUrl: 'http://localhost:3100', password: 'pw' });

    expect(consoleSpy.log).toHaveBeenCalledWith('(Reused existing session)');
    expect(consoleSpy.log).toHaveBeenCalledWith('Expires: Never (unlimited)');
  });

  it('success: prints plural sessions message', async () => {
    const mockResponse = {
      prompt: 'Connect text',
      walletCount: 3,
      sessionsCreated: 3,
      sessionReused: false,
      expiresAt: 1700000000,
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const { sessionPromptCommand } = await import('../commands/session.js');
    await sessionPromptCommand({ baseUrl: 'http://localhost:3100', password: 'pw' });

    expect(consoleSpy.log).toHaveBeenCalledWith('(Created 3 new sessions)');
  });

  it('passes walletId and ttl in request body', async () => {
    const mockResponse = {
      prompt: 'text', walletCount: 1, sessionsCreated: 1,
      sessionReused: false, expiresAt: 1700000000,
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const { sessionPromptCommand } = await import('../commands/session.js');
    await sessionPromptCommand({ baseUrl: 'http://localhost:3100', password: 'pw', walletId: 'w1', ttl: 3600 });

    const fetchCall = fetchMock.mock.calls[0]!;
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.walletIds).toEqual(['w1']);
    expect(body.ttl).toBe(3600);
  });

  it('network error: prints error and exits', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    exitMock.mockImplementation((() => { throw new Error('EXIT'); }) as any);

    const { sessionPromptCommand } = await import('../commands/session.js');
    try {
      await sessionPromptCommand({ baseUrl: 'http://localhost:3100', password: 'pw' });
    } catch (e: any) {
      if (e.message !== 'EXIT') throw e;
    }

    expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('Daemon is not running'));
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('API error: prints error message and exits', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ message: 'Invalid password' }),
    } as unknown as Response);

    const { sessionPromptCommand } = await import('../commands/session.js');
    await sessionPromptCommand({ baseUrl: 'http://localhost:3100', password: 'bad' });

    expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('Invalid password'));
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('no wallets: prints error and exits', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ prompt: '', walletCount: 0, sessionsCreated: 0, sessionReused: false, expiresAt: 0 }),
    } as unknown as Response);

    const { sessionPromptCommand } = await import('../commands/session.js');
    await sessionPromptCommand({ baseUrl: 'http://localhost:3100', password: 'pw' });

    expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('No active wallets'));
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('API error with non-JSON body: uses statusText', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve(null),
    } as unknown as Response);
    exitMock.mockImplementation((() => { throw new Error('EXIT'); }) as any);

    const { sessionPromptCommand } = await import('../commands/session.js');
    try {
      await sessionPromptCommand({ baseUrl: 'http://localhost:3100', password: 'pw' });
    } catch (e: any) {
      if (e.message !== 'EXIT') throw e;
    }

    expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('Internal Server Error'));
    expect(exitMock).toHaveBeenCalledWith(1);
  });
});
