/**
 * Unit tests for `commands/owner.ts`.
 *
 * Covers ownerConnectCommand, ownerDisconnectCommand, ownerStatusCommand,
 * and their internal helpers (selectWallet, daemonRequest, getMasterPassword).
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

describe('owner commands', () => {
  let mockStdout: ReturnType<typeof vi.spyOn>;
  let mockStderr: ReturnType<typeof vi.spyOn>;
  let mockStdoutWrite: ReturnType<typeof vi.spyOn>;
  let mockExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockStdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockStderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockStdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    mockExit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new ExitError(code);
    }) as never);

    vi.doMock('../utils/password.js', () => ({
      resolvePassword: vi.fn().mockResolvedValue(TEST_PW),
    }));

    vi.doMock('qrcode', () => ({
      default: {
        toString: vi.fn().mockResolvedValue('MOCK_QR_CODE'),
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('../utils/password.js');
    vi.doUnmock('qrcode');
  });

  // -----------------------------------------------------------------------
  // selectWallet (tested indirectly via commands)
  // -----------------------------------------------------------------------

  describe('selectWallet', () => {
    it('auto-selects single wallet when no --wallet provided', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/wc/pair')) {
          return Promise.resolve(mockResponse(200, { uri: 'wc:test', qrCode: '', expiresAt: 0 }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { ownerConnectCommand } = await import('../commands/owner.js');
      await ownerConnectCommand({ baseUrl: BASE, password: TEST_PW, poll: false });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('sol-test'));
    });

    it('selects wallet by --wallet id', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A, WALLET_B] }));
        }
        if (u.includes('/wc/pair')) {
          return Promise.resolve(mockResponse(200, { uri: 'wc:test', qrCode: '', expiresAt: 0 }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { ownerConnectCommand } = await import('../commands/owner.js');
      await ownerConnectCommand({ baseUrl: BASE, password: TEST_PW, walletId: 'w-bbb', poll: false });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('evm-test'));
    });

    it('selects wallet by --wallet name', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A, WALLET_B] }));
        }
        if (u.includes('/wc/pair')) {
          return Promise.resolve(mockResponse(200, { uri: 'wc:test', qrCode: '', expiresAt: 0 }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { ownerConnectCommand } = await import('../commands/owner.js');
      await ownerConnectCommand({ baseUrl: BASE, password: TEST_PW, walletId: 'sol-test', poll: false });

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

      const { ownerConnectCommand } = await import('../commands/owner.js');
      await expect(ownerConnectCommand({ baseUrl: BASE, password: TEST_PW }))
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

      const { ownerConnectCommand } = await import('../commands/owner.js');
      await expect(ownerConnectCommand({ baseUrl: BASE, password: TEST_PW, walletId: 'nonexistent' }))
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

      const { ownerConnectCommand } = await import('../commands/owner.js');
      await expect(ownerConnectCommand({ baseUrl: BASE, password: TEST_PW }))
        .rejects.toThrow(ExitError);

      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('Multiple wallets found'));
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('w-aaa'));
      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('w-bbb'));
    });
  });

  // -----------------------------------------------------------------------
  // daemonRequest error handling (tested indirectly)
  // -----------------------------------------------------------------------

  describe('daemonRequest', () => {
    it('non-ok response with JSON error body: prints message', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(403, { message: 'Invalid master password' }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { ownerConnectCommand } = await import('../commands/owner.js');
      await expect(ownerConnectCommand({ baseUrl: BASE, password: TEST_PW }))
        .rejects.toThrow(ExitError);

      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('Invalid master password'));
    });

    it('non-ok response with non-JSON body: falls back to statusText', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: () => Promise.reject(new Error('not json')),
            headers: new Headers(),
            redirected: false,
            type: 'basic',
            url: '',
            clone: () => mockResponse(500, null),
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

      const { ownerConnectCommand } = await import('../commands/owner.js');
      await expect(ownerConnectCommand({ baseUrl: BASE, password: TEST_PW }))
        .rejects.toThrow(ExitError);

      expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('Internal Server Error'));
    });
  });

  // -----------------------------------------------------------------------
  // getMasterPassword (tested indirectly)
  // -----------------------------------------------------------------------

  describe('getMasterPassword', () => {
    it('uses opts.password when provided (no resolvePassword call)', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/wc/session')) {
          return Promise.resolve(mockResponse(200, {
            walletId: 'w-aaa',
            topic: 'topic-1',
            peerName: 'TestPeer',
            peerUrl: 'https://test.example.com',
            chainId: 'solana:devnet',
            ownerAddress: '7xKXtg',
            expiry: 1700000000,
            createdAt: 1699000000,
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { ownerStatusCommand } = await import('../commands/owner.js');
      await ownerStatusCommand({ baseUrl: BASE, password: 'direct-pw' });

      // Verify the fetch was called with the direct password
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
  // ownerConnectCommand
  // -----------------------------------------------------------------------

  describe('ownerConnectCommand', () => {
    it('happy path without polling: prints URI and QR code', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/wc/pair') && !u.includes('/status')) {
          return Promise.resolve(mockResponse(200, {
            uri: 'wc:abc123@2?relay-protocol=irn&symKey=xyz',
            qrCode: '',
            expiresAt: Math.floor(Date.now() / 1000) + 300,
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { ownerConnectCommand } = await import('../commands/owner.js');
      await ownerConnectCommand({ baseUrl: BASE, password: TEST_PW, poll: false });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Initiating WalletConnect pairing'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('URI: wc:abc123'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Scan with'));
    });

    it('polling: connected status prints peer info', async () => {
      let pollCount = 0;
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/wc/pair/status')) {
          pollCount++;
          if (pollCount >= 2) {
            return Promise.resolve(mockResponse(200, {
              status: 'connected',
              session: {
                walletId: 'w-aaa',
                topic: 'topic-1',
                peerName: 'MetaMask',
                ownerAddress: '0xOwner',
                chainId: 'eip155:1',
                expiry: 1700000000,
                createdAt: 1699000000,
              },
            }));
          }
          return Promise.resolve(mockResponse(200, { status: 'pending', session: null }));
        }
        if (u.includes('/wc/pair')) {
          return Promise.resolve(mockResponse(200, { uri: 'wc:test', qrCode: '', expiresAt: 0 }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      vi.useFakeTimers();

      const { ownerConnectCommand } = await import('../commands/owner.js');
      const promise = ownerConnectCommand({ baseUrl: BASE, password: TEST_PW, poll: true });

      // Advance through setTimeout(3000) calls
      await vi.advanceTimersByTimeAsync(3000); // poll 1 -> pending
      await vi.advanceTimersByTimeAsync(3000); // poll 2 -> connected

      await promise;

      vi.useRealTimers();

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Connected! Peer: MetaMask'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Owner Address: 0xOwner'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Chain ID: eip155:1'));
    });

    it('polling: expired status causes process.exit(1)', async () => {
      // The expired branch calls process.exit(1) which throws ExitError.
      // However, it's inside a try/catch that catches errors and writes 'x'.
      // So ExitError gets caught by the catch, loop continues, and eventually
      // the function either: keeps looping (catching errors) or times out.
      // We need to make process.exit actually stop the loop.
      // Approach: don't throw, just record the call and have daemonRequest
      // return expired only once, then all subsequent calls throw to break out.
      let pollCount = 0;
      let exitCalled = false;
      mockExit.mockRestore();
      mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
        exitCalled = true;
        // Don't throw -- just record, but we need to stop execution.
        // Throw a special object that won't be caught by the generic catch
        // Actually the catch catches everything. So we cannot prevent it.
        // Instead, let's use a different approach: after exit is called,
        // subsequent fetches should also fail in a way that eventually ends the loop.
      }) as never);

      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/wc/pair/status')) {
          pollCount++;
          if (pollCount === 1) {
            return Promise.resolve(mockResponse(200, { status: 'expired', session: null }));
          }
          // After expired was returned, return connected to end the loop
          return Promise.resolve(mockResponse(200, {
            status: 'connected',
            session: {
              walletId: 'w-aaa',
              topic: 'topic-1',
              peerName: 'Peer',
              ownerAddress: '0x',
              chainId: 'eip155:1',
              expiry: 1700000000,
              createdAt: 1699000000,
            },
          }));
        }
        if (u.includes('/wc/pair')) {
          return Promise.resolve(mockResponse(200, { uri: 'wc:test', qrCode: '', expiresAt: 0 }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      vi.useFakeTimers();

      const { ownerConnectCommand } = await import('../commands/owner.js');
      const promise = ownerConnectCommand({ baseUrl: BASE, password: TEST_PW, poll: true });

      await vi.advanceTimersByTimeAsync(3000); // poll 1 -> expired -> exit called
      await vi.advanceTimersByTimeAsync(3000); // poll 2 -> connected (to end the loop)

      await promise;

      vi.useRealTimers();

      expect(exitCalled).toBe(true);
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Pairing expired'));
    });

    it('polling: network error writes "x" and continues', async () => {
      let pollCount = 0;
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/wc/pair/status')) {
          pollCount++;
          if (pollCount === 1) {
            return Promise.reject(new Error('Network error'));
          }
          return Promise.resolve(mockResponse(200, {
            status: 'connected',
            session: {
              walletId: 'w-aaa',
              topic: 'topic-1',
              peerName: 'Phantom',
              ownerAddress: '0xOwner',
              chainId: 'solana:devnet',
              expiry: 1700000000,
              createdAt: 1699000000,
            },
          }));
        }
        if (u.includes('/wc/pair')) {
          return Promise.resolve(mockResponse(200, { uri: 'wc:test', qrCode: '', expiresAt: 0 }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      vi.useFakeTimers();

      const { ownerConnectCommand } = await import('../commands/owner.js');
      const promise = ownerConnectCommand({ baseUrl: BASE, password: TEST_PW, poll: true });

      await vi.advanceTimersByTimeAsync(3000); // poll 1 -> network error -> 'x'
      await vi.advanceTimersByTimeAsync(3000); // poll 2 -> connected

      await promise;

      vi.useRealTimers();

      expect(mockStdoutWrite).toHaveBeenCalledWith('x');
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Connected! Peer: Phantom'));
    });

    it('polling: pending status writes "." to stdout', async () => {
      let pollCount = 0;
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/wc/pair/status')) {
          pollCount++;
          if (pollCount <= 2) {
            return Promise.resolve(mockResponse(200, { status: 'pending', session: null }));
          }
          return Promise.resolve(mockResponse(200, {
            status: 'connected',
            session: {
              walletId: 'w-aaa',
              topic: 'topic-1',
              peerName: 'Wallet',
              ownerAddress: '0xOwner',
              chainId: 'eip155:1',
              expiry: 1700000000,
              createdAt: 1699000000,
            },
          }));
        }
        if (u.includes('/wc/pair')) {
          return Promise.resolve(mockResponse(200, { uri: 'wc:test', qrCode: '', expiresAt: 0 }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      vi.useFakeTimers();

      const { ownerConnectCommand } = await import('../commands/owner.js');
      const promise = ownerConnectCommand({ baseUrl: BASE, password: TEST_PW, poll: true });

      await vi.advanceTimersByTimeAsync(3000); // poll 1 -> pending -> '.'
      await vi.advanceTimersByTimeAsync(3000); // poll 2 -> pending -> '.'
      await vi.advanceTimersByTimeAsync(3000); // poll 3 -> connected

      await promise;

      vi.useRealTimers();

      const dotCalls = mockStdoutWrite.mock.calls.filter((c) => c[0] === '.');
      expect(dotCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('polling: connected session with null fields uses fallbacks', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/wc/pair/status')) {
          return Promise.resolve(mockResponse(200, {
            status: 'connected',
            session: {
              walletId: 'w-aaa',
              topic: 'topic-1',
              peerName: null,
              ownerAddress: null,
              chainId: null,
              expiry: 1700000000,
              createdAt: 1699000000,
            },
          }));
        }
        if (u.includes('/wc/pair')) {
          return Promise.resolve(mockResponse(200, { uri: 'wc:test', qrCode: '', expiresAt: 0 }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      vi.useFakeTimers();

      const { ownerConnectCommand } = await import('../commands/owner.js');
      const promise = ownerConnectCommand({ baseUrl: BASE, password: TEST_PW, poll: true });

      await vi.advanceTimersByTimeAsync(3000);

      await promise;

      vi.useRealTimers();

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Peer: Unknown'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Owner Address: N/A'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Chain ID: N/A'));
    });
  });

  // -----------------------------------------------------------------------
  // ownerDisconnectCommand
  // -----------------------------------------------------------------------

  describe('ownerDisconnectCommand', () => {
    it('happy path: sends DELETE and prints confirmation', async () => {
      const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/wc/session') && init?.method === 'DELETE') {
          return Promise.resolve(mockResponse(200, { success: true }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { ownerDisconnectCommand } = await import('../commands/owner.js');
      await ownerDisconnectCommand({ baseUrl: BASE, password: TEST_PW });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('session disconnected'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('sol-test'));
    });
  });

  // -----------------------------------------------------------------------
  // ownerStatusCommand
  // -----------------------------------------------------------------------

  describe('ownerStatusCommand', () => {
    it('happy path: displays session details', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/wc/session')) {
          return Promise.resolve(mockResponse(200, {
            walletId: 'w-aaa',
            topic: 'topic-123',
            peerName: 'MetaMask',
            peerUrl: 'https://metamask.io',
            chainId: 'eip155:1',
            ownerAddress: '0xOwnerAddr',
            expiry: 1700000000,
            createdAt: 1699000000,
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { ownerStatusCommand } = await import('../commands/owner.js');
      await ownerStatusCommand({ baseUrl: BASE, password: TEST_PW });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining("WalletConnect Session for 'sol-test'"));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Peer:           MetaMask'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Peer URL:       https://metamask.io'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Owner Address:  0xOwnerAddr'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Chain ID:       eip155:1'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Expires:'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Created:'));
    });

    it('session with null peerName/peerUrl: displays Unknown/N/A', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/wc/session')) {
          return Promise.resolve(mockResponse(200, {
            walletId: 'w-aaa',
            topic: 'topic-123',
            peerName: null,
            peerUrl: null,
            chainId: 'solana:devnet',
            ownerAddress: '7xKXtg',
            expiry: 1700000000,
            createdAt: 1699000000,
          }));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { ownerStatusCommand } = await import('../commands/owner.js');
      await ownerStatusCommand({ baseUrl: BASE, password: TEST_PW });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Peer:           Unknown'));
      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('Peer URL:       N/A'));
    });

    it('no session / error: catch prints "No active WalletConnect session"', async () => {
      const fetchMock = vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/v1/wallets')) {
          return Promise.resolve(mockResponse(200, { items: [WALLET_A] }));
        }
        if (u.includes('/wc/session')) {
          // Throw a network-level error (not an HTTP error response)
          // This bypasses daemonRequest's process.exit and reaches the catch block
          return Promise.reject(new Error('Network unreachable'));
        }
        return Promise.reject(new Error(`Unexpected: ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { ownerStatusCommand } = await import('../commands/owner.js');
      await ownerStatusCommand({ baseUrl: BASE, password: TEST_PW });

      expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('No active WalletConnect session'));
    });
  });
});
