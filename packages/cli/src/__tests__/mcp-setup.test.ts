/**
 * Tests for `waiaas mcp setup` command.
 *
 * Uses vi.stubGlobal('fetch') and mocked fs operations.
 * Tests cover all 7 CLIP requirements for multi-wallet support.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `waiaas-mcp-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function rmrf(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

// Helper: create a mock Response
function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => mockResponse(status, body),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// Standard mock responses for success flow (auto-detect single wallet)
function createSuccessFetchMock(walletId = 'wallet-1', walletName = 'Test Wallet') {
  return vi.fn((url: string | URL) => {
    const urlStr = String(url);
    if (urlStr.includes('/health')) {
      return Promise.resolve(mockResponse(200, { status: 'ok' }));
    }
    if (urlStr.includes('/v1/wallets')) {
      return Promise.resolve(mockResponse(200, {
        items: [{ id: walletId, name: walletName }],
      }));
    }
    if (urlStr.includes('/v1/sessions') && !urlStr.includes('/renew')) {
      return Promise.resolve(mockResponse(200, {
        id: 'session-123',
        token: 'jwt.token.here',
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
      }));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`));
  });
}

describe('mcpSetupCommand', () => {
  let testDir: string;
  let mockStdout: ReturnType<typeof vi.spyOn>;
  let mockStderr: ReturnType<typeof vi.spyOn>;
  const originalPlatform = process.platform;

  beforeEach(() => {
    testDir = makeTmpDir();
    mockStdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockStderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Mock process.exit to throw
    vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    // Mock resolvePassword to not require interactive input
    vi.doMock('../utils/password.js', () => ({
      resolvePassword: vi.fn().mockResolvedValue('test-master-password'),
    }));
  });

  afterEach(() => {
    rmrf(testDir);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('../utils/password.js');
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('successful setup flow: auto-detect wallet, create session, write file', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      baseUrl: 'http://127.0.0.1:3100',
      masterPassword: 'test-pw',
    });

    // Token file should exist at new mcp-tokens/<walletId> path
    const tokenPath = join(testDir, 'mcp-tokens', 'wallet-1');
    expect(existsSync(tokenPath)).toBe(true);
    expect(readFileSync(tokenPath, 'utf-8')).toBe('jwt.token.here');

    // Should print success message
    expect(mockStdout).toHaveBeenCalledWith('MCP session created successfully!');
    expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining(`Token file: ${tokenPath}`));
  });

  it('--wallet flag passed to session creation', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/wallets')) {
        // --wallet now also fetches wallets list for name lookup
        return Promise.resolve(mockResponse(200, {
          items: [{ id: 'my-custom-wallet', name: 'Custom Wallet' }],
        }));
      }
      if (urlStr.includes('/v1/sessions')) {
        // Verify wallet ID was passed
        const body = JSON.parse(init?.body as string) as { walletId: string };
        expect(body.walletId).toBe('my-custom-wallet');
        return Promise.resolve(mockResponse(200, {
          id: 'session-123',
          token: 'jwt.token.here',
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
        }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      wallet: 'my-custom-wallet',
      masterPassword: 'test-pw',
    });

    // Token file at new path
    const tokenPath = join(testDir, 'mcp-tokens', 'my-custom-wallet');
    expect(existsSync(tokenPath)).toBe(true);
  });

  it('multiple wallets without --wallet -> error', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/wallets')) {
        return Promise.resolve(mockResponse(200, {
          items: [
            { id: 'wallet-1', name: 'First' },
            { id: 'wallet-2', name: 'Second' },
          ],
        }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    }));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await expect(mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('Multiple wallets found'),
    );
  });

  it('no wallets -> error', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/wallets')) {
        return Promise.resolve(mockResponse(200, { items: [] }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    }));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await expect(mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('No wallets found'),
    );
  });

  it('daemon unreachable -> error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => {
      return Promise.reject(new TypeError('fetch failed'));
    }));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await expect(mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('Cannot reach WAIaaS daemon'),
    );
  });

  it('session creation failure (401 bad password) -> error', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/wallets')) {
        return Promise.resolve(mockResponse(200, {
          items: [{ id: 'wallet-1' }],
        }));
      }
      if (urlStr.includes('/v1/sessions')) {
        return Promise.resolve(mockResponse(401, { message: 'Invalid master password' }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    }));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await expect(mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'wrong-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create session'),
    );
  });

  it('mcp-token file written with correct content', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    // New path: mcp-tokens/<walletId>
    const tokenPath = join(testDir, 'mcp-tokens', 'wallet-1');
    const content = readFileSync(tokenPath, 'utf-8');
    expect(content).toBe('jwt.token.here');
  });

  it('config.json snippet output format', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      baseUrl: 'http://127.0.0.1:3100',
      masterPassword: 'test-pw',
    });

    // Should output JSON with mcpServers config
    const jsonCalls = mockStdout.mock.calls
      .filter((c: unknown[]) => {
        const str = String(c[0]);
        return str.includes('"mcpServers"');
      });
    expect(jsonCalls.length).toBe(1);

    const configStr = String(jsonCalls[0]![0]);
    const config = JSON.parse(configStr) as {
      mcpServers: Record<string, {
        command: string;
        args: string[];
        env: Record<string, string>;
      }>;
    };

    // Key is now waiaas-{slug} where slug = toSlug('Test Wallet') = 'test-wallet'
    const entry = config.mcpServers['waiaas-test-wallet'];
    expect(entry).toBeDefined();
    expect(entry.command).toBe('npx');
    expect(entry.args).toEqual(['@waiaas/mcp']);
    expect(entry.env['WAIAAS_DATA_DIR']).toBe(testDir);
    expect(entry.env['WAIAAS_BASE_URL']).toBe('http://127.0.0.1:3100');
    expect(entry.env['WAIAAS_WALLET_ID']).toBe('wallet-1');
    expect(entry.env['WAIAAS_WALLET_NAME']).toBe('Test Wallet');
  });

  it('platform-specific config path (darwin)', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    expect(mockStdout).toHaveBeenCalledWith(
      expect.stringContaining('~/Library/Application Support/Claude/claude_desktop_config.json'),
    );
  });

  it('platform-specific config path (linux)', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    expect(mockStdout).toHaveBeenCalledWith(
      expect.stringContaining('~/.config/Claude/claude_desktop_config.json'),
    );
  });

  it('--expires-in passed correctly', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/wallets')) {
        return Promise.resolve(mockResponse(200, {
          items: [{ id: 'wallet-1' }],
        }));
      }
      if (urlStr.includes('/v1/sessions')) {
        const body = JSON.parse(init?.body as string) as { expiresIn: number };
        expect(body.expiresIn).toBe(7200); // Custom 2h
        return Promise.resolve(mockResponse(200, {
          id: 'session-123',
          token: 'jwt.token.here',
          expiresAt: Math.floor(Date.now() / 1000) + 7200,
        }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      expiresIn: 7200,
      masterPassword: 'test-pw',
    });

    expect(mockStdout).toHaveBeenCalledWith('MCP session created successfully!');
  });

  it('file atomic write (tmp + rename pattern)', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    // Final file should exist at new path (tmp was renamed)
    const tokenPath = join(testDir, 'mcp-tokens', 'wallet-1');
    expect(existsSync(tokenPath)).toBe(true);

    // .tmp file should NOT exist (was renamed)
    expect(existsSync(`${tokenPath}.tmp`)).toBe(false);
  });

  it('wallet auto-detect sends X-Master-Password header (BUG-004)', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/wallets')) {
        // Verify X-Master-Password header is present
        const headers = init?.headers as Record<string, string> | undefined;
        expect(headers?.['X-Master-Password']).toBe('test-pw');
        return Promise.resolve(mockResponse(200, {
          items: [{ id: 'wallet-1', name: 'Test Wallet' }],
        }));
      }
      if (urlStr.includes('/v1/sessions') && !urlStr.includes('/renew')) {
        return Promise.resolve(mockResponse(200, {
          id: 'session-123',
          token: 'jwt.token.here',
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
        }));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      baseUrl: 'http://127.0.0.1:3100',
      masterPassword: 'test-pw',
    });

    // Verify /v1/wallets was called
    const walletCalls = fetchMock.mock.calls.filter(
      (c: unknown[]) => String(c[0]).includes('/v1/wallets'),
    );
    expect(walletCalls.length).toBe(1);
  });

  it('auto-detects single wallet (CLI-04)', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock('auto-wallet-42'));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('Auto-detected wallet: auto-wallet-42'),
    );
    expect(mockStdout).toHaveBeenCalledWith(
      expect.stringContaining('Wallet: auto-wallet-42'),
    );
  });

  // ===== CLIP requirement tests =====

  it('CLIP-01: --wallet stores token at mcp-tokens/<walletId>', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/wallets')) {
        return Promise.resolve(mockResponse(200, {
          items: [{ id: 'specific-wallet-id', name: 'Specific Wallet' }],
        }));
      }
      if (urlStr.includes('/v1/sessions')) {
        const body = JSON.parse(init?.body as string) as { walletId: string };
        expect(body.walletId).toBe('specific-wallet-id');
        return Promise.resolve(mockResponse(200, {
          id: 'session-456',
          token: 'specific.jwt.token',
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
        }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      wallet: 'specific-wallet-id',
      masterPassword: 'test-pw',
    });

    // Token at new mcp-tokens/<walletId> path
    expect(existsSync(join(testDir, 'mcp-tokens', 'specific-wallet-id'))).toBe(true);
    expect(readFileSync(join(testDir, 'mcp-tokens', 'specific-wallet-id'), 'utf-8')).toBe('specific.jwt.token');
    // Legacy path should NOT exist
    expect(existsSync(join(testDir, 'mcp-token'))).toBe(false);
  });

  it('CLIP-02: config snippet contains WAIAAS_WALLET_ID + WAIAAS_WALLET_NAME', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock('wallet-1', 'Test Wallet'));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      baseUrl: 'http://127.0.0.1:3100',
      masterPassword: 'test-pw',
    });

    const jsonCalls = mockStdout.mock.calls
      .filter((c: unknown[]) => String(c[0]).includes('"mcpServers"'));
    expect(jsonCalls.length).toBe(1);

    const config = JSON.parse(String(jsonCalls[0]![0])) as {
      mcpServers: Record<string, { env: Record<string, string> }>;
    };

    const entry = config.mcpServers['waiaas-test-wallet'];
    expect(entry).toBeDefined();
    expect(entry.env['WAIAAS_WALLET_ID']).toBe('wallet-1');
    expect(entry.env['WAIAAS_WALLET_NAME']).toBe('Test Wallet');
  });

  it('CLIP-03: config key is waiaas-{walletName slug}', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock('wallet-1', 'My Trading Bot'));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    const jsonCalls = mockStdout.mock.calls
      .filter((c: unknown[]) => String(c[0]).includes('"mcpServers"'));
    const config = JSON.parse(String(jsonCalls[0]![0])) as {
      mcpServers: Record<string, unknown>;
    };

    // toSlug('My Trading Bot') = 'my-trading-bot'
    expect(config.mcpServers['waiaas-my-trading-bot']).toBeDefined();
  });

  it('CLIP-04: --all creates sessions for all wallets + combined config', async () => {
    let sessionCallCount = 0;
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/wallets')) {
        return Promise.resolve(mockResponse(200, {
          items: [
            { id: 'wallet-1', name: 'Alpha' },
            { id: 'wallet-2', name: 'Beta' },
          ],
        }));
      }
      if (urlStr.includes('/v1/sessions')) {
        sessionCallCount++;
        const body = JSON.parse(init?.body as string) as { walletId: string };
        return Promise.resolve(mockResponse(200, {
          id: `session-${sessionCallCount}`,
          token: `token-for-${body.walletId}`,
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
        }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      baseUrl: 'http://127.0.0.1:3100',
      all: true,
      masterPassword: 'test-pw',
    });

    // 2 sessions created
    expect(sessionCallCount).toBe(2);

    // Token files at mcp-tokens/<walletId>
    expect(existsSync(join(testDir, 'mcp-tokens', 'wallet-1'))).toBe(true);
    expect(existsSync(join(testDir, 'mcp-tokens', 'wallet-2'))).toBe(true);
    expect(readFileSync(join(testDir, 'mcp-tokens', 'wallet-1'), 'utf-8')).toBe('token-for-wallet-1');
    expect(readFileSync(join(testDir, 'mcp-tokens', 'wallet-2'), 'utf-8')).toBe('token-for-wallet-2');

    // Combined config snippet
    const jsonCalls = mockStdout.mock.calls
      .filter((c: unknown[]) => String(c[0]).includes('"mcpServers"'));
    expect(jsonCalls.length).toBe(1);

    const config = JSON.parse(String(jsonCalls[0]![0])) as {
      mcpServers: Record<string, { env: Record<string, string> }>;
    };

    expect(config.mcpServers['waiaas-alpha']).toBeDefined();
    expect(config.mcpServers['waiaas-beta']).toBeDefined();
    expect(config.mcpServers['waiaas-alpha'].env['WAIAAS_WALLET_ID']).toBe('wallet-1');
    expect(config.mcpServers['waiaas-alpha'].env['WAIAAS_WALLET_NAME']).toBe('Alpha');
    expect(config.mcpServers['waiaas-beta'].env['WAIAAS_WALLET_ID']).toBe('wallet-2');
    expect(config.mcpServers['waiaas-beta'].env['WAIAAS_WALLET_NAME']).toBe('Beta');
  });

  it('CLIP-05: --all + 0 wallets -> error', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/wallets')) {
        return Promise.resolve(mockResponse(200, { items: [] }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    }));

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await expect(mcpSetupCommand({
      dataDir: testDir,
      all: true,
      masterPassword: 'test-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('No wallets found'),
    );
  });

  it('CLIP-06: --all + slug collision appends walletId prefix', async () => {
    let sessionCallCount = 0;
    const fetchMock = vi.fn((url: string | URL, _init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.includes('/v1/wallets')) {
        return Promise.resolve(mockResponse(200, {
          items: [
            { id: '01929abc-1111-7000-8000-000000000001', name: 'Bot' },
            { id: '01929def-2222-7000-8000-000000000002', name: 'Bot' },
          ],
        }));
      }
      if (urlStr.includes('/v1/sessions')) {
        sessionCallCount++;
        return Promise.resolve(mockResponse(200, {
          id: `session-${sessionCallCount}`,
          token: `token-${sessionCallCount}`,
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
        }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      all: true,
      masterPassword: 'test-pw',
    });

    const jsonCalls = mockStdout.mock.calls
      .filter((c: unknown[]) => String(c[0]).includes('"mcpServers"'));
    const config = JSON.parse(String(jsonCalls[0]![0])) as {
      mcpServers: Record<string, unknown>;
    };

    // Colliding slug 'bot' -> 'bot-01929abc' and 'bot-01929def'
    expect(config.mcpServers['waiaas-bot-01929abc']).toBeDefined();
    expect(config.mcpServers['waiaas-bot-01929def']).toBeDefined();
  });

  it('CLIP-07: auto-detect single wallet uses new mcp-tokens/<walletId> path', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await mcpSetupCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    // New path should exist
    expect(existsSync(join(testDir, 'mcp-tokens', 'wallet-1'))).toBe(true);
    // Legacy path should NOT exist
    expect(existsSync(join(testDir, 'mcp-token'))).toBe(false);
  });

  it('--all + --wallet simultaneously -> error', async () => {
    vi.stubGlobal('fetch', createSuccessFetchMock());

    const { mcpSetupCommand } = await import('../commands/mcp-setup.js');
    await expect(mcpSetupCommand({
      dataDir: testDir,
      all: true,
      wallet: 'some-id',
      masterPassword: 'test-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('Cannot use --all with --wallet'),
    );
  });
});
