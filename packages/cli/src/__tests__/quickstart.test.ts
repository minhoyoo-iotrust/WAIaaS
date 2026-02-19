/**
 * Tests for `waiaas quickset` command (formerly quickstart).
 *
 * Uses vi.stubGlobal('fetch') to mock HTTP calls.
 * Tests cover testnet/mainnet modes, error handling, and graceful degradation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `waiaas-qs-test-${randomUUID()}`);
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

// Default mock wallet responses
const SOLANA_WALLET = {
  id: 'sol-wallet-1',
  name: 'solana-testnet',
  chain: 'solana',
  environment: 'testnet',
  publicKey: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  defaultNetwork: 'devnet',
};

const EVM_WALLET = {
  id: 'evm-wallet-1',
  name: 'evm-testnet',
  chain: 'ethereum',
  environment: 'testnet',
  publicKey: '0x1234567890abcdef1234567890abcdef12345678',
  defaultNetwork: 'ethereum-sepolia',
};

const SESSION_EXPIRES_AT = Math.floor(Date.now() / 1000) + 86400;

const SOLANA_NETWORKS = {
  availableNetworks: [
    { network: 'devnet', isDefault: true },
    { network: 'testnet', isDefault: false },
  ],
};

const EVM_NETWORKS = {
  availableNetworks: [
    { network: 'ethereum-sepolia', isDefault: true },
    { network: 'polygon-amoy', isDefault: false },
    { network: 'arbitrum-sepolia', isDefault: false },
    { network: 'optimism-sepolia', isDefault: false },
    { network: 'base-sepolia', isDefault: false },
  ],
};

/** Create a full success fetch mock for quickstart flow. */
function createQuickstartFetchMock(mode = 'testnet') {
  let sessionCallCount = 0;

  return vi.fn((url: string | URL, init?: RequestInit) => {
    const urlStr = String(url);

    if (urlStr.includes('/health')) {
      return Promise.resolve(mockResponse(200, { status: 'ok' }));
    }

    // POST /v1/wallets -- include session in response (daemon auto-creates session)
    if (urlStr.endsWith('/v1/wallets') && init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as { chain: string; name: string; environment: string };
      if (body.chain === 'solana') {
        const wallet = {
          ...SOLANA_WALLET,
          environment: mode,
          name: `solana-${mode}`,
          session: { id: 'session-1', token: 'jwt.token.1', expiresAt: SESSION_EXPIRES_AT },
        };
        return Promise.resolve(mockResponse(200, wallet));
      }
      const wallet = {
        ...EVM_WALLET,
        environment: mode,
        name: `evm-${mode}`,
        session: { id: 'session-2', token: 'jwt.token.2', expiresAt: SESSION_EXPIRES_AT },
      };
      return Promise.resolve(mockResponse(200, wallet));
    }

    // GET /v1/wallets/:id/networks
    if (urlStr.includes('/networks')) {
      if (urlStr.includes('sol-wallet')) {
        return Promise.resolve(mockResponse(200, SOLANA_NETWORKS));
      }
      return Promise.resolve(mockResponse(200, EVM_NETWORKS));
    }

    // POST /v1/sessions (fallback path for reused wallets or older daemons)
    if (urlStr.includes('/v1/sessions') && init?.method === 'POST') {
      sessionCallCount++;
      return Promise.resolve(mockResponse(200, {
        id: `session-${sessionCallCount}`,
        token: `jwt.token.${sessionCallCount}`,
        expiresAt: SESSION_EXPIRES_AT,
      }));
    }

    return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`));
  });
}

describe('quicksetCommand (formerly quickstart)', () => {
  let testDir: string;
  let mockStdout: ReturnType<typeof vi.spyOn>;
  let mockStderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testDir = makeTmpDir();
    mockStdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockStderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    vi.doMock('../utils/password.js', () => ({
      resolvePassword: vi.fn().mockResolvedValue('test-master-password'),
    }));
  });

  afterEach(() => {
    rmrf(testDir);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('../utils/password.js');
  });

  it('testnet mode: creates 2 wallets, fetches networks, writes tokens', async () => {
    const fetchMock = createQuickstartFetchMock('testnet');
    vi.stubGlobal('fetch', fetchMock);

    const { quickstartCommand } = await import('../commands/quickstart.js');
    await quickstartCommand({
      dataDir: testDir,
      baseUrl: 'http://127.0.0.1:3100',
      mode: 'testnet',
      masterPassword: 'test-pw',
    });

    // Verify fetch call sequence
    const calls = fetchMock.mock.calls;
    const urls = calls.map((c: unknown[]) => String(c[0]));

    // 1 health + 2 wallet POST (with session) + 2 networks GET = 5
    expect(calls.length).toBe(5);

    // Health check
    expect(urls[0]).toContain('/health');

    // POST wallets (solana first, then ethereum)
    expect(urls[1]).toContain('/v1/wallets');
    const solanaBody = JSON.parse((calls[1] as [string, RequestInit])[1].body as string) as Record<string, string>;
    expect(solanaBody.chain).toBe('solana');
    expect(solanaBody.environment).toBe('testnet');

    // Networks for solana
    expect(urls[2]).toContain('/networks');

    // POST wallets (ethereum)
    expect(urls[3]).toContain('/v1/wallets');
    const evmBody = JSON.parse((calls[3] as [string, RequestInit])[1].body as string) as Record<string, string>;
    expect(evmBody.chain).toBe('ethereum');
    expect(evmBody.environment).toBe('testnet');

    // Networks for evm
    expect(urls[4]).toContain('/networks');

    // Output checks
    expect(mockStdout).toHaveBeenCalledWith('WAIaaS Quickset Complete!');
    expect(mockStdout).toHaveBeenCalledWith('Mode: testnet');
    expect(mockStdout).toHaveBeenCalledWith('Solana Wallet:');
    expect(mockStdout).toHaveBeenCalledWith('EVM Wallet:');
    expect(mockStdout).toHaveBeenCalledWith('  Available Networks: devnet, testnet');
    expect(mockStdout).toHaveBeenCalledWith('  Available Networks: ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia, base-sepolia');

    // Expires at output (QS-02)
    const expiresCalls = mockStdout.mock.calls.filter(
      (c: unknown[]) => String(c[0]).includes('Expires at:'),
    );
    expect(expiresCalls.length).toBe(2); // one per wallet
    for (const call of expiresCalls) {
      expect(String(call[0])).toMatch(/Expires at: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    }

    // MCP token files
    expect(existsSync(join(testDir, 'mcp-tokens', 'sol-wallet-1'))).toBe(true);
    expect(existsSync(join(testDir, 'mcp-tokens', 'evm-wallet-1'))).toBe(true);

    // MCP config snippet with English label
    expect(mockStdout).toHaveBeenCalledWith('(Add to your claude_desktop_config.json)');

    const jsonCalls = mockStdout.mock.calls
      .filter((c: unknown[]) => String(c[0]).includes('"mcpServers"'));
    expect(jsonCalls.length).toBe(1);

    const config = JSON.parse(String(jsonCalls[0]![0])) as {
      mcpServers: Record<string, { env: Record<string, string> }>;
    };
    expect(config.mcpServers['waiaas-solana-testnet']).toBeDefined();
    expect(config.mcpServers['waiaas-evm-testnet']).toBeDefined();
  });

  it('mainnet mode: passes environment mainnet to wallet creation', async () => {
    const fetchMock = createQuickstartFetchMock('mainnet');
    vi.stubGlobal('fetch', fetchMock);

    const { quickstartCommand } = await import('../commands/quickstart.js');
    await quickstartCommand({
      dataDir: testDir,
      mode: 'mainnet',
      masterPassword: 'test-pw',
    });

    // Verify POST /v1/wallets bodies contain environment: 'mainnet'
    const walletCalls = fetchMock.mock.calls.filter(
      (c: unknown[]) => String(c[0]).endsWith('/v1/wallets') && (c[1] as RequestInit | undefined)?.method === 'POST',
    );
    expect(walletCalls.length).toBe(2);

    for (const call of walletCalls) {
      const body = JSON.parse((call as [string, RequestInit])[1].body as string) as { environment: string };
      expect(body.environment).toBe('mainnet');
    }

    expect(mockStdout).toHaveBeenCalledWith('Mode: mainnet');
  });

  it('defaults to testnet when mode is not specified', async () => {
    const fetchMock = createQuickstartFetchMock('testnet');
    vi.stubGlobal('fetch', fetchMock);

    const { quickstartCommand } = await import('../commands/quickstart.js');
    await quickstartCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
      // mode not specified
    });

    // Verify environment: 'testnet' in wallet creation calls
    const walletCalls = fetchMock.mock.calls.filter(
      (c: unknown[]) => String(c[0]).endsWith('/v1/wallets') && (c[1] as RequestInit | undefined)?.method === 'POST',
    );

    for (const call of walletCalls) {
      const body = JSON.parse((call as [string, RequestInit])[1].body as string) as { environment: string };
      expect(body.environment).toBe('testnet');
    }

    expect(mockStdout).toHaveBeenCalledWith('Mode: testnet');
  });

  it('daemon unreachable: exits with error message', async () => {
    vi.stubGlobal('fetch', vi.fn(() => {
      return Promise.reject(new TypeError('fetch failed'));
    }));

    const { quickstartCommand } = await import('../commands/quickstart.js');
    await expect(quickstartCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith('Error: Cannot reach WAIaaS daemon.');
    expect(mockStderr).toHaveBeenCalledWith('  Make sure the daemon is running: waiaas start');
  });

  it('wallet creation failure: exits with error message', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.endsWith('/v1/wallets') && init?.method === 'POST') {
        return Promise.resolve(mockResponse(400, { message: 'Wallet name already exists' }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { quickstartCommand } = await import('../commands/quickstart.js');
    await expect(quickstartCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create solana wallet (HTTP 400)'),
    );
  });

  it('networks API failure: graceful degradation with empty networks', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.endsWith('/v1/wallets') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string) as { chain: string };
        if (body.chain === 'solana') {
          return Promise.resolve(mockResponse(200, {
            ...SOLANA_WALLET,
            session: { id: 'session-1', token: 'jwt.token.1', expiresAt: SESSION_EXPIRES_AT },
          }));
        }
        return Promise.resolve(mockResponse(200, {
          ...EVM_WALLET,
          session: { id: 'session-2', token: 'jwt.token.2', expiresAt: SESSION_EXPIRES_AT },
        }));
      }
      // Networks API returns 500
      if (urlStr.includes('/networks')) {
        return Promise.resolve(mockResponse(500, { message: 'Internal error' }));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { quickstartCommand } = await import('../commands/quickstart.js');

    // Should NOT throw -- continues with empty networks
    await quickstartCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    expect(mockStdout).toHaveBeenCalledWith('WAIaaS Quickset Complete!');

    // Should NOT have printed 'Available Networks:' lines
    const networkCalls = mockStdout.mock.calls.filter(
      (c: unknown[]) => String(c[0]).includes('Available Networks:'),
    );
    expect(networkCalls.length).toBe(0);
  });

  it('outputs MCP config snippet with correct structure', async () => {
    vi.stubGlobal('fetch', createQuickstartFetchMock());

    const { quickstartCommand } = await import('../commands/quickstart.js');
    await quickstartCommand({
      dataDir: testDir,
      baseUrl: 'http://127.0.0.1:3100',
      masterPassword: 'test-pw',
    });

    const jsonCalls = mockStdout.mock.calls
      .filter((c: unknown[]) => String(c[0]).includes('"mcpServers"'));
    expect(jsonCalls.length).toBe(1);

    const config = JSON.parse(String(jsonCalls[0]![0])) as {
      mcpServers: Record<string, {
        command: string;
        args: string[];
        env: Record<string, string>;
      }>;
    };

    // Two entries: solana and evm
    const keys = Object.keys(config.mcpServers);
    expect(keys.length).toBe(2);

    const solanaEntry = config.mcpServers['waiaas-solana-testnet'];
    expect(solanaEntry).toBeDefined();
    expect(solanaEntry.command).toBe('npx');
    expect(solanaEntry.args).toEqual(['@waiaas/mcp']);
    expect(solanaEntry.env['WAIAAS_WALLET_ID']).toBe('sol-wallet-1');
    expect(solanaEntry.env['WAIAAS_WALLET_NAME']).toBe('solana-testnet');
    expect(solanaEntry.env['WAIAAS_DATA_DIR']).toBe(testDir);
    expect(solanaEntry.env['WAIAAS_BASE_URL']).toBe('http://127.0.0.1:3100');

    const evmEntry = config.mcpServers['waiaas-evm-testnet'];
    expect(evmEntry).toBeDefined();
    expect(evmEntry.env['WAIAAS_WALLET_ID']).toBe('evm-wallet-1');
  });

  it('wallet creation 500 error: exits with HTTP status in message', async () => {
    let callCount = 0;
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }
      if (urlStr.endsWith('/v1/wallets') && init?.method === 'POST') {
        callCount++;
        // First wallet succeeds, second fails
        if (callCount === 1) {
          return Promise.resolve(mockResponse(200, {
            ...SOLANA_WALLET,
            session: { id: 'session-1', token: 'jwt.token.1', expiresAt: SESSION_EXPIRES_AT },
          }));
        }
        return Promise.resolve(mockResponse(500, { message: 'Internal server error' }));
      }
      if (urlStr.includes('/networks')) {
        return Promise.resolve(mockResponse(200, SOLANA_NETWORKS));
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { quickstartCommand } = await import('../commands/quickstart.js');
    await expect(quickstartCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    })).rejects.toThrow('process.exit(1)');

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create ethereum wallet (HTTP 500)'),
    );
  });

  it('QS-01: all output is English only (no Korean characters)', async () => {
    const fetchMock = createQuickstartFetchMock('testnet');
    vi.stubGlobal('fetch', fetchMock);

    const { quickstartCommand } = await import('../commands/quickstart.js');
    await quickstartCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    // Check all console.log and console.error calls for Korean characters
    const koreanPattern = /[\uAC00-\uD7AF\u1100-\u11FF]/;
    const allLogCalls = mockStdout.mock.calls.map((c: unknown[]) => String(c[0]));
    const allErrCalls = mockStderr.mock.calls.map((c: unknown[]) => String(c[0]));

    for (const msg of [...allLogCalls, ...allErrCalls]) {
      expect(msg).not.toMatch(koreanPattern);
    }
  });

  it('QS-02: displays session expiry in YYYY-MM-DD HH:mm format', async () => {
    const fetchMock = createQuickstartFetchMock('testnet');
    vi.stubGlobal('fetch', fetchMock);

    const { quickstartCommand } = await import('../commands/quickstart.js');
    await quickstartCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    // Should have 2 "Expires at:" lines (one per wallet)
    const expiresCalls = mockStdout.mock.calls.filter(
      (c: unknown[]) => String(c[0]).includes('Expires at:'),
    );
    expect(expiresCalls.length).toBe(2);

    for (const call of expiresCalls) {
      const msg = String(call[0]);
      // Format: "  Expires at: YYYY-MM-DD HH:mm"
      expect(msg).toMatch(/Expires at: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    }
  });

  it('QS-03: 409 conflict reuses existing wallet and creates new session', async () => {
    let sessionCallCount = 0;

    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);

      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }

      // POST /v1/wallets -> both return 409
      if (urlStr.endsWith('/v1/wallets') && init?.method === 'POST') {
        return Promise.resolve(mockResponse(409, { message: 'Wallet name already exists' }));
      }

      // GET /v1/wallets -> list existing wallets
      if (urlStr.endsWith('/v1/wallets') && (!init?.method || init.method === 'GET')) {
        return Promise.resolve(mockResponse(200, {
          wallets: [
            { ...SOLANA_WALLET, name: 'solana-testnet' },
            { ...EVM_WALLET, name: 'evm-testnet' },
          ],
        }));
      }

      // GET /v1/wallets/:id/networks
      if (urlStr.includes('/networks')) {
        if (urlStr.includes('sol-wallet')) {
          return Promise.resolve(mockResponse(200, SOLANA_NETWORKS));
        }
        return Promise.resolve(mockResponse(200, EVM_NETWORKS));
      }

      // POST /v1/sessions (fallback for reused wallets)
      if (urlStr.includes('/v1/sessions') && init?.method === 'POST') {
        sessionCallCount++;
        return Promise.resolve(mockResponse(200, {
          id: `session-${sessionCallCount}`,
          token: `jwt.token.${sessionCallCount}`,
          expiresAt: SESSION_EXPIRES_AT,
        }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { quickstartCommand } = await import('../commands/quickstart.js');
    await quickstartCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    // "Reusing existing wallet:" should appear twice
    const reuseCalls = mockStdout.mock.calls.filter(
      (c: unknown[]) => String(c[0]).includes('Reusing existing wallet:'),
    );
    expect(reuseCalls.length).toBe(2);
    expect(String(reuseCalls[0]![0])).toContain('solana-testnet');
    expect(String(reuseCalls[1]![0])).toContain('evm-testnet');

    // Sessions should be created via fallback (2 POST /v1/sessions)
    expect(sessionCallCount).toBe(2);

    // Wallet list should be fetched (2 GET /v1/wallets for each 409)
    const listCalls = fetchMock.mock.calls.filter(
      (c: unknown[]) => String(c[0]).endsWith('/v1/wallets') && (!(c[1] as RequestInit | undefined)?.method || (c[1] as RequestInit | undefined)?.method === 'GET'),
    );
    expect(listCalls.length).toBe(2);

    // MCP token files should still be created
    expect(existsSync(join(testDir, 'mcp-tokens', 'sol-wallet-1'))).toBe(true);
    expect(existsSync(join(testDir, 'mcp-tokens', 'evm-wallet-1'))).toBe(true);

    // Completion message
    expect(mockStdout).toHaveBeenCalledWith('WAIaaS Quickset Complete!');
  });

  it('QS-04: parses availableNetworks field correctly (not networks)', async () => {
    // This mock returns ONLY availableNetworks (no legacy "networks" key)
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const urlStr = String(url);

      if (urlStr.includes('/health')) {
        return Promise.resolve(mockResponse(200, { status: 'ok' }));
      }

      if (urlStr.endsWith('/v1/wallets') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string) as { chain: string };
        if (body.chain === 'solana') {
          return Promise.resolve(mockResponse(200, {
            ...SOLANA_WALLET,
            session: { id: 'session-1', token: 'jwt.token.1', expiresAt: SESSION_EXPIRES_AT },
          }));
        }
        return Promise.resolve(mockResponse(200, {
          ...EVM_WALLET,
          session: { id: 'session-2', token: 'jwt.token.2', expiresAt: SESSION_EXPIRES_AT },
        }));
      }

      // Networks endpoint returns ONLY availableNetworks (no "networks" key)
      if (urlStr.includes('/networks')) {
        if (urlStr.includes('sol-wallet')) {
          return Promise.resolve(mockResponse(200, {
            availableNetworks: [{ network: 'devnet', isDefault: true }],
          }));
        }
        return Promise.resolve(mockResponse(200, {
          availableNetworks: [{ network: 'ethereum-sepolia', isDefault: true }],
        }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { quickstartCommand } = await import('../commands/quickstart.js');
    await quickstartCommand({
      dataDir: testDir,
      masterPassword: 'test-pw',
    });

    // Networks should be parsed correctly from availableNetworks
    expect(mockStdout).toHaveBeenCalledWith('  Available Networks: devnet');
    expect(mockStdout).toHaveBeenCalledWith('  Available Networks: ethereum-sepolia');
  });
});
