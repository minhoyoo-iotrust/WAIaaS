/**
 * Unit tests for `commands/wallet.ts`.
 *
 * Covers walletInfoCommand, walletCreateCommand,
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
            availableNetworks: [{ network: 'devnet' }],
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
            availableNetworks: [{ network: 'sepolia' }],
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
            availableNetworks: [{ network: 'devnet' }],
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
            availableNetworks: [{ network: 'devnet' }],
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
            availableNetworks: [
              { network: 'devnet' },
              { network: 'testnet' },
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
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Available:        devnet, testnet'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Status:           active'));
    });

    it('displays available networks without default network line', async () => {
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
            availableNetworks: [
              { network: 'devnet' },
              { network: 'testnet' },
            ],
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await walletInfoCommand({ baseUrl: BASE, password: TEST_PW });

      // No Default Network line shown
      const allCalls = mockStdout.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(allCalls.every((msg: string) => !msg.includes('Default Network:'))).toBe(true);
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Available:        devnet, testnet'));
    });

    it('displays smart account fields (accountType, signerKey, deployed)', async () => {
      const smartWallet = {
        ...WALLET_B,
        accountType: 'smart',
        signerKey: '0xsigner123',
        deployed: false,
      };
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [smartWallet] }));
        }
        if (u.includes('/networks')) {
          return Promise.resolve(mockResponse(200, {
            id: 'w-bbb',
            chain: 'ethereum',
            environment: 'testnet',
            availableNetworks: [{ network: 'sepolia' }],
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await walletInfoCommand({ baseUrl: BASE, password: TEST_PW });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Account Type:     smart'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Signer Key:       0xsigner123'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Deployed:         no'));
    });

    it('displays eoa account type for standard wallet', async () => {
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
            availableNetworks: [{ network: 'devnet' }],
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletInfoCommand } = await import('../commands/wallet.js');
      await walletInfoCommand({ baseUrl: BASE, password: TEST_PW });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Account Type:     eoa'));
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
  // walletCreateCommand
  // -----------------------------------------------------------------------

  describe('walletCreateCommand', () => {
    it('sends accountType in POST body when --account-type smart', async () => {
      let capturedBody: string | undefined;
      const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets') && init?.method === 'POST') {
          capturedBody = init?.body as string;
          return Promise.resolve(mockResponse(201, {
            id: 'w-smart',
            name: 'smart-test',
            chain: 'ethereum',
            environment: 'testnet',
            publicKey: '0xsmart123',
            accountType: 'smart',
            signerKey: '0xsigner456',
            deployed: false,
          }));
        }
        if (u.includes('/networks')) {
          return Promise.resolve(mockResponse(200, {
            id: 'w-smart',
            chain: 'ethereum',
            environment: 'testnet',
            availableNetworks: [{ network: 'sepolia' }],
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletCreateCommand } = await import('../commands/wallet.js');
      await walletCreateCommand({
        baseUrl: BASE,
        password: TEST_PW,
        chain: 'ethereum',
        name: 'smart-test',
        accountType: 'smart',
      });

      expect(capturedBody).toBeDefined();
      const parsed = JSON.parse(capturedBody!);
      expect(parsed.accountType).toBe('smart');
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Account Type:     smart'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Signer Key:'));
    });

    it('does not send accountType when not specified', async () => {
      let capturedBody: string | undefined;
      const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets') && init?.method === 'POST') {
          capturedBody = init?.body as string;
          return Promise.resolve(mockResponse(201, {
            id: 'w-eoa',
            name: 'eoa-test',
            chain: 'solana',
            environment: 'testnet',
            publicKey: '7xKXtg',
          }));
        }
        if (u.includes('/networks')) {
          return Promise.resolve(mockResponse(200, {
            id: 'w-eoa',
            chain: 'solana',
            environment: 'testnet',
            availableNetworks: [{ network: 'devnet' }],
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { walletCreateCommand } = await import('../commands/wallet.js');
      await walletCreateCommand({
        baseUrl: BASE,
        password: TEST_PW,
        chain: 'solana',
        name: 'eoa-test',
      });

      expect(capturedBody).toBeDefined();
      const parsed = JSON.parse(capturedBody!);
      expect(parsed.accountType).toBeUndefined();
    });

    it('exits with error for invalid accountType', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { walletCreateCommand } = await import('../commands/wallet.js');
      await expect(walletCreateCommand({
        baseUrl: BASE,
        password: TEST_PW,
        chain: 'ethereum',
        name: 'bad-type',
        accountType: 'invalid',
      })).rejects.toThrow(ExitError);

      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('Invalid account type'));
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

});
