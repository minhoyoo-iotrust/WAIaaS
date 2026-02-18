/**
 * Unit tests for `commands/wallet.ts`.
 *
 * Covers walletInfoCommand, walletSetDefaultNetworkCommand,
 * and internal helpers (selectWallet, daemonRequest, getMasterPassword).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class ExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

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

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const WALLET_A = {
  id: 'w-aaa',
  name: 'sol-test',
  chain: 'solana',
  network: 'devnet',
  environment: 'testnet',
  publicKey: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  status: 'active',
};

const WALLET_B = {
  id: 'w-bbb',
  name: 'evm-test',
  chain: 'ethereum',
  network: 'sepolia',
  environment: 'testnet',
  publicKey: '0xabcdef1234567890',
  status: 'active',
};

const BASE = 'http://127.0.0.1:3100';
const TEST_PW = 'test-master-password';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('wallet commands', () => {
  let mockStdout: ReturnType<typeof vi.spyOn>;
  let mockStderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockStdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockStderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new ExitError(code);
    }) as never);

    vi.doMock('../utils/password.js', () => ({
      resolvePassword: vi.fn().mockResolvedValue(TEST_PW),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('../utils/password.js');
  });

  // -----------------------------------------------------------------------
  // selectWallet (tested indirectly via walletInfoCommand)
  // -----------------------------------------------------------------------

  describe('selectWallet', () => {
    it('auto-selects single wallet', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/networks')) {
          return Promise.resolve(mockResponse(200, {
            id: 'w-aaa',
            chain: 'solana',
            environment: 'testnet',
            defaultNetwork: 'devnet',
            availableNetworks: [{ network: 'devnet', isDefault: true }],
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await walletInfoCommand({ baseUrl: BASE, password: TEST_PW });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('sol-test'));
    });

    it('selects wallet by --wallet id', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A, WALLET_B] }));
        }
        if (u.includes('/networks')) {
          return Promise.resolve(mockResponse(200, {
            id: 'w-bbb',
            chain: 'ethereum',
            environment: 'testnet',
            defaultNetwork: 'sepolia',
            availableNetworks: [{ network: 'sepolia', isDefault: true }],
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await walletInfoCommand({ baseUrl: BASE, password: TEST_PW, walletId: 'w-bbb' });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('evm-test'));
    });

    it('selects wallet by --wallet name', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A, WALLET_B] }));
        }
        if (u.includes('/networks')) {
          return Promise.resolve(mockResponse(200, {
            id: 'w-aaa',
            chain: 'solana',
            environment: 'testnet',
            defaultNetwork: 'devnet',
            availableNetworks: [{ network: 'devnet', isDefault: true }],
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await walletInfoCommand({ baseUrl: BASE, password: TEST_PW, walletId: 'sol-test' });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('sol-test'));
    });

    it('exits when no wallets found', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [] }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await expect(walletInfoCommand({ baseUrl: BASE, password: TEST_PW }))
        .rejects.toThrow(ExitError);

      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('No wallets found'));
    });

    it('exits when wallet not found by --wallet id', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await expect(walletInfoCommand({ baseUrl: BASE, password: TEST_PW, walletId: 'nonexistent' }))
        .rejects.toThrow(ExitError);

      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining("'nonexistent' not found"));
    });

    it('exits with listing when multiple wallets and no --wallet', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A, WALLET_B] }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await expect(walletInfoCommand({ baseUrl: BASE, password: TEST_PW }))
        .rejects.toThrow(ExitError);

      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('Multiple wallets found'));
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('w-aaa'));
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('w-bbb'));
    });
  });

  // -----------------------------------------------------------------------
  // daemonRequest error handling
  // -----------------------------------------------------------------------

  describe('daemonRequest', () => {
    it('non-ok with JSON error body: prints message', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(403, { message: 'Forbidden' }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await expect(walletInfoCommand({ baseUrl: BASE, password: TEST_PW }))
        .rejects.toThrow(ExitError);

      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('Forbidden'));
    });

    it('non-ok with non-JSON body: falls back to statusText', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            json: () => Promise.reject(new Error('not json')),
            headers: new Headers(),
            redirected: false,
            type: 'basic',
            url: '',
            clone: () => mockResponse(502, null),
            body: null,
            bodyUsed: false,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
            blob: () => Promise.resolve(new Blob()),
            formData: () => Promise.resolve(new FormData()),
            text: () => Promise.resolve('not json'),
            bytes: () => Promise.resolve(new Uint8Array()),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await expect(walletInfoCommand({ baseUrl: BASE, password: TEST_PW }))
        .rejects.toThrow(ExitError);

      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('Bad Gateway'));
    });
  });

  // -----------------------------------------------------------------------
  // getMasterPassword
  // -----------------------------------------------------------------------

  describe('getMasterPassword', () => {
    it('uses opts.password when provided', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/networks')) {
          return Promise.resolve(mockResponse(200, {
            id: 'w-aaa',
            chain: 'solana',
            environment: 'testnet',
            defaultNetwork: 'devnet',
            availableNetworks: [{ network: 'devnet', isDefault: true }],
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await walletInfoCommand({ baseUrl: BASE, password: 'direct-pw' });

      // Verify the direct password was used in fetch calls
      const calls = fetchMock.mock.calls;
      for (const call of calls) {
        const init = call[1] as RequestInit | undefined;
        if (init?.headers) {
          const headers = init.headers as Record<string, string>;
          expect(headers['X-Master-Password']).toBe('direct-pw');
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // walletInfoCommand
  // -----------------------------------------------------------------------

  describe('walletInfoCommand', () => {
    it('happy path: displays wallet details and networks', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/networks')) {
          return Promise.resolve(mockResponse(200, {
            id: 'w-aaa',
            chain: 'solana',
            environment: 'testnet',
            defaultNetwork: 'devnet',
            availableNetworks: [
              { network: 'devnet', isDefault: true },
              { network: 'testnet', isDefault: false },
            ],
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await walletInfoCommand({ baseUrl: BASE, password: TEST_PW });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Wallet: sol-test'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('ID:               w-aaa'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Chain:            solana'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Environment:      testnet'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Address:          7xKXtg'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Default Network:  devnet'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Available:        devnet, testnet'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Status:           active'));
    });

    it('no default in availableNetworks: falls back to wallet.network', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/networks')) {
          return Promise.resolve(mockResponse(200, {
            id: 'w-aaa',
            chain: 'solana',
            environment: 'testnet',
            defaultNetwork: null,
            availableNetworks: [
              { network: 'devnet', isDefault: false },
              { network: 'testnet', isDefault: false },
            ],
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await walletInfoCommand({ baseUrl: BASE, password: TEST_PW });

      // Falls back to wallet.network which is 'devnet'
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Default Network:  devnet'));
    });

    it('empty availableNetworks: shows "none"', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/networks')) {
          return Promise.resolve(mockResponse(200, {
            id: 'w-aaa',
            chain: 'solana',
            environment: 'testnet',
            defaultNetwork: null,
            availableNetworks: [],
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await walletInfoCommand({ baseUrl: BASE, password: TEST_PW });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Available:        none'));
    });
  });

  // -----------------------------------------------------------------------
  // walletSetDefaultNetworkCommand
  // -----------------------------------------------------------------------

  describe('walletSetDefaultNetworkCommand', () => {
    it('happy path: changes default network', async () => {
      const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/default-network') && init?.method === 'PUT') {
          return Promise.resolve(mockResponse(200, {
            id: 'w-aaa',
            defaultNetwork: 'testnet',
            previousNetwork: 'devnet',
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletSetDefaultNetworkCommand } = await import('../commands/wallet.js');
      await walletSetDefaultNetworkCommand({ baseUrl: BASE, password: TEST_PW }, 'testnet');

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining("Default network changed for wallet 'sol-test'"));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Previous: devnet'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Current:  testnet'));
    });

    it('previous network is null: displays "(none)"', async () => {
      const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/default-network') && init?.method === 'PUT') {
          return Promise.resolve(mockResponse(200, {
            id: 'w-aaa',
            defaultNetwork: 'mainnet-beta',
            previousNetwork: null,
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletSetDefaultNetworkCommand } = await import('../commands/wallet.js');
      await walletSetDefaultNetworkCommand({ baseUrl: BASE, password: TEST_PW }, 'mainnet-beta');

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Previous: (none)'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Current:  mainnet-beta'));
    });

    it('sends correct body with network name', async () => {
      const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/default-network') && init?.method === 'PUT') {
          const body = JSON.parse(init.body as string) as { network: string };
          expect(body.network).toBe('testnet');
          return Promise.resolve(mockResponse(200, {
            id: 'w-aaa',
            defaultNetwork: 'testnet',
            previousNetwork: 'devnet',
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletSetDefaultNetworkCommand } = await import('../commands/wallet.js');
      await walletSetDefaultNetworkCommand({ baseUrl: BASE, password: TEST_PW }, 'testnet');

      // Verify the PUT was called
      const putCalls = fetchMock.mock.calls.filter(
        (c: unknown[]) => (c[1] as RequestInit | undefined)?.method === 'PUT',
      );
      expect(putCalls.length).toBe(1);
    });
  });
});
