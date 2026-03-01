import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WAIaaSClient } from '../client.js';
import { WAIaaSError } from '../error.js';

/**
 * Tests for WAIaaSClient.connect() — auto-discovery + optional auto-start.
 *
 * @see internal/objectives/issues/218-sdk-auto-connect.md
 */

// Mock child_process and fs modules
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  access: vi.fn(),
}));

import { execSync, spawn } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';

const mockedExecSync = vi.mocked(execSync);
const mockedSpawn = vi.mocked(spawn);
const mockedReadFile = vi.mocked(readFile);
const mockedAccess = vi.mocked(access);

describe('WAIaaSClient.connect()', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Direct connection (token provided) ---

  it('should skip auto-discovery when token is explicitly provided', async () => {
    const client = await WAIaaSClient.connect({
      token: 'wai_sess_test123',
      baseUrl: 'http://my-daemon:3100',
    });

    expect(client).toBeInstanceOf(WAIaaSClient);
    // No health check or file read should happen
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockedReadFile).not.toHaveBeenCalled();
  });

  // --- Daemon running, auto-discover token ---

  it('should auto-discover token when daemon is running', async () => {
    // Health check succeeds
    fetchSpy.mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));

    // Token file read
    mockedReadFile.mockResolvedValueOnce('wai_sess_discovered');

    const client = await WAIaaSClient.connect();

    expect(client).toBeInstanceOf(WAIaaSClient);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3100/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('should use custom baseUrl for health check', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    mockedReadFile.mockResolvedValueOnce('wai_sess_custom');

    await WAIaaSClient.connect({ baseUrl: 'http://custom:4000' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://custom:4000/health',
      expect.anything(),
    );
  });

  it('should trim trailing slashes from baseUrl', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    mockedReadFile.mockResolvedValueOnce('wai_sess_trimmed');

    await WAIaaSClient.connect({ baseUrl: 'http://localhost:3100///' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3100/health',
      expect.anything(),
    );
  });

  // --- Daemon not running, autoStart: false ---

  it('should throw with setup instructions when daemon is not running and autoStart=false', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(WAIaaSClient.connect()).rejects.toThrow(WAIaaSError);
    await expect(WAIaaSClient.connect()).rejects.toMatchObject({
      code: 'DAEMON_NOT_RUNNING',
    });
  });

  it('should include setup instructions in error message', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

    try {
      await WAIaaSClient.connect();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      const e = err as WAIaaSError;
      expect(e.message).toContain('npx @waiaas/cli init --auto-provision');
      expect(e.message).toContain('npx @waiaas/cli start');
      expect(e.message).toContain('npx @waiaas/cli quickset');
    }
  });

  // --- Token file errors ---

  it('should throw TOKEN_NOT_FOUND when token file is missing', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    mockedReadFile.mockRejectedValueOnce(new Error('ENOENT'));

    await expect(WAIaaSClient.connect()).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
    });
  });

  it('should throw TOKEN_NOT_FOUND when token file is empty', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    mockedReadFile.mockResolvedValueOnce('   ');

    await expect(WAIaaSClient.connect()).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
    });
  });

  // --- resolveCliCommand() ---

  it('should prefer global waiaas CLI when available', async () => {
    // daemon not running
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    // which waiaas succeeds
    mockedExecSync.mockReturnValueOnce(Buffer.from('/usr/local/bin/waiaas'));

    // data dir exists
    mockedAccess.mockResolvedValueOnce(undefined);

    // spawn for start
    const mockChild = {
      unref: vi.fn(),
      on: vi.fn(),
      stderr: null,
    };
    mockedSpawn.mockReturnValueOnce(mockChild as never);

    // readiness polling — first fail, then succeed
    fetchSpy.mockRejectedValueOnce(new Error('not ready'));
    fetchSpy.mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));

    // token file exists
    mockedAccess.mockResolvedValueOnce(undefined);

    // read token
    mockedReadFile.mockResolvedValueOnce('wai_sess_auto');

    await WAIaaSClient.connect({ autoStart: true, startTimeoutMs: 5000 });

    // spawn should use 'waiaas' not 'npx'
    expect(mockedSpawn).toHaveBeenCalledWith(
      'waiaas',
      ['start', '--data-dir', expect.any(String)],
      expect.objectContaining({ detached: true }),
    );
  });

  it('should fall back to npx when global CLI is not installed', async () => {
    // daemon not running
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    // which waiaas fails
    mockedExecSync.mockImplementationOnce(() => { throw new Error('not found'); });

    // data dir exists
    mockedAccess.mockResolvedValueOnce(undefined);

    // spawn for start
    const mockChild = {
      unref: vi.fn(),
      on: vi.fn(),
      stderr: null,
    };
    mockedSpawn.mockReturnValueOnce(mockChild as never);

    // readiness succeeds immediately
    fetchSpy.mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));

    // token file exists
    mockedAccess.mockResolvedValueOnce(undefined);

    // read token
    mockedReadFile.mockResolvedValueOnce('wai_sess_npx');

    await WAIaaSClient.connect({ autoStart: true, startTimeoutMs: 5000 });

    expect(mockedSpawn).toHaveBeenCalledWith(
      'npx',
      ['@waiaas/cli', 'start', '--data-dir', expect.any(String)],
      expect.objectContaining({ detached: true }),
    );
  });

  // --- autoStart: init when data dir missing ---

  it('should run init when data dir does not exist', async () => {
    // daemon not running
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    // which waiaas fails → npx fallback
    mockedExecSync.mockImplementationOnce(() => { throw new Error('not found'); });

    // data dir does NOT exist
    mockedAccess.mockRejectedValueOnce(new Error('ENOENT'));

    // spawn for init
    const initChild = {
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'close') cb(0);
      }),
      stderr: { on: vi.fn() },
    };
    mockedSpawn.mockReturnValueOnce(initChild as never);

    // spawn for start (detached)
    const startChild = {
      unref: vi.fn(),
      on: vi.fn(),
      stderr: null,
    };
    mockedSpawn.mockReturnValueOnce(startChild as never);

    // readiness succeeds
    fetchSpy.mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));

    // token file does NOT exist → run quickset
    mockedAccess.mockRejectedValueOnce(new Error('ENOENT'));

    // spawn for quickset
    const quicksetChild = {
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'close') cb(0);
      }),
      stderr: { on: vi.fn() },
    };
    mockedSpawn.mockReturnValueOnce(quicksetChild as never);

    // read token after quickset
    mockedReadFile.mockResolvedValueOnce('wai_sess_init');

    await WAIaaSClient.connect({
      autoStart: true,
      dataDir: '/tmp/test-waiaas',
      startTimeoutMs: 5000,
    });

    // init should have been called
    expect(mockedSpawn).toHaveBeenCalledWith(
      'npx',
      ['@waiaas/cli', 'init', '--auto-provision', '--data-dir', '/tmp/test-waiaas'],
      expect.objectContaining({ stdio: 'pipe' }),
    );
  });

  // --- autoStart timeout ---

  it('should throw START_TIMEOUT when daemon does not become ready', async () => {
    // daemon not running
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    mockedExecSync.mockImplementationOnce(() => { throw new Error('not found'); });
    mockedAccess.mockResolvedValueOnce(undefined);

    const mockChild = {
      unref: vi.fn(),
      on: vi.fn(),
      stderr: null,
    };
    mockedSpawn.mockReturnValueOnce(mockChild as never);

    // readiness never succeeds
    fetchSpy.mockRejectedValue(new Error('not ready'));

    await expect(
      WAIaaSClient.connect({ autoStart: true, startTimeoutMs: 1000 }),
    ).rejects.toMatchObject({
      code: 'START_TIMEOUT',
    });
  }, 10_000);

  // --- Already running + autoStart: true (no duplicate spawn) ---

  it('should not spawn daemon when already running with autoStart=true', async () => {
    // Health check succeeds (daemon already running)
    fetchSpy.mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    mockedReadFile.mockResolvedValueOnce('wai_sess_existing');

    await WAIaaSClient.connect({ autoStart: true });

    // spawn should NOT have been called
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  // --- WAIAAS_DATA_DIR env var ---

  it('should use WAIAAS_DATA_DIR env var for data dir', async () => {
    process.env['WAIAAS_DATA_DIR'] = '/custom/data';

    fetchSpy.mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    mockedReadFile.mockResolvedValueOnce('wai_sess_env');

    await WAIaaSClient.connect();

    expect(mockedReadFile).toHaveBeenCalledWith('/custom/data/mcp-token', 'utf-8');

    delete process.env['WAIAAS_DATA_DIR'];
  });

  // --- Custom dataDir option overrides env var ---

  it('should prefer dataDir option over env var', async () => {
    process.env['WAIAAS_DATA_DIR'] = '/env/data';

    fetchSpy.mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    mockedReadFile.mockResolvedValueOnce('wai_sess_opt');

    await WAIaaSClient.connect({ dataDir: '/option/data' });

    expect(mockedReadFile).toHaveBeenCalledWith('/option/data/mcp-token', 'utf-8');

    delete process.env['WAIAAS_DATA_DIR'];
  });
});
