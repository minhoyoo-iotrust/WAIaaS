/**
 * Branch coverage tests for CLI restore + wallet commands.
 *
 * Targets uncovered branches in:
 * - wallet.ts: selectWallet, walletInfoCommand, walletCreateCommand branches
 * - restore.ts: backup validation, password mismatch, restore flow branches
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
    text: () => Promise.resolve(JSON.stringify(body)),
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
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// ---------------------------------------------------------------------------
// wallet.ts tests
// ---------------------------------------------------------------------------

vi.mock('../utils/password.js', () => ({
  resolvePassword: vi.fn().mockResolvedValue('mock-password'),
}));

import { walletInfoCommand, walletCreateCommand } from '../commands/wallet.js';

describe('walletInfoCommand', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new ExitError(code as number);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('displays wallet info for EOA wallet', async () => {
    const wallet = {
      id: 'w1',
      name: 'test-wallet',
      chain: 'ethereum',
      environment: 'mainnet',
      publicKey: '0xabc123',
      status: 'active',
      accountType: 'eoa',
    };

    // 1st call: list wallets -> single wallet
    // 2nd call: get networks
    fetchMock
      .mockResolvedValueOnce(mockResponse(200, { items: [wallet] }))
      .mockResolvedValueOnce(mockResponse(200, {
        id: 'w1',
        chain: 'ethereum',
        environment: 'mainnet',
        availableNetworks: [{ network: 'ethereum-mainnet' }, { network: 'ethereum-sepolia' }],
      }));

    await walletInfoCommand({ baseUrl: 'http://localhost:3100', password: 'test-pw' });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('test-wallet'));
  });

  it('displays smart account details', async () => {
    const wallet = {
      id: 'w2',
      name: 'smart-wallet',
      chain: 'ethereum',
      environment: 'mainnet',
      publicKey: '0xsmart',
      status: 'active',
      accountType: 'smart',
      signerKey: '0xsigner',
      deployed: true,
    };

    fetchMock
      .mockResolvedValueOnce(mockResponse(200, { items: [wallet] }))
      .mockResolvedValueOnce(mockResponse(200, {
        id: 'w2',
        chain: 'ethereum',
        environment: 'mainnet',
        availableNetworks: [],
      }));

    await walletInfoCommand({ baseUrl: 'http://localhost:3100', password: 'test-pw' });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('smart'));
  });

  it('displays smart account with no signerKey', async () => {
    const wallet = {
      id: 'w3',
      name: 'smart-nosigner',
      chain: 'ethereum',
      environment: 'mainnet',
      publicKey: '0xsmart2',
      status: 'active',
      accountType: 'smart',
      signerKey: null,
      deployed: false,
    };

    fetchMock
      .mockResolvedValueOnce(mockResponse(200, { items: [wallet] }))
      .mockResolvedValueOnce(mockResponse(200, {
        id: 'w3',
        chain: 'ethereum',
        environment: 'mainnet',
        availableNetworks: [],
      }));

    await walletInfoCommand({ baseUrl: 'http://localhost:3100', password: 'test-pw' });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('no'));
  });

  it('exits when no wallets exist', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { items: [] }));

    await expect(
      walletInfoCommand({ baseUrl: 'http://localhost:3100', password: 'pw' }),
    ).rejects.toThrow(ExitError);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('No wallets found'));
  });

  it('exits when specified wallet not found', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, {
      items: [{ id: 'w1', name: 'other' }],
    }));

    await expect(
      walletInfoCommand({ baseUrl: 'http://localhost:3100', password: 'pw', walletId: 'missing' }),
    ).rejects.toThrow(ExitError);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("'missing' not found"));
  });

  it('exits when multiple wallets and no --wallet specified', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, {
      items: [
        { id: 'w1', name: 'a', chain: 'ethereum', environment: 'mainnet' },
        { id: 'w2', name: 'b', chain: 'solana', environment: 'mainnet' },
      ],
    }));

    await expect(
      walletInfoCommand({ baseUrl: 'http://localhost:3100', password: 'pw' }),
    ).rejects.toThrow(ExitError);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Multiple wallets'));
  });

  it('exits on daemon error (non-ok response)', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(500, { message: 'Internal error' }));

    await expect(
      walletInfoCommand({ baseUrl: 'http://localhost:3100', password: 'pw' }),
    ).rejects.toThrow(ExitError);
  });

  it('handles daemon error with non-JSON body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('not JSON')),
    } as any);

    await expect(
      walletInfoCommand({ baseUrl: 'http://localhost:3100', password: 'pw' }),
    ).rejects.toThrow(ExitError);
  });
});

describe('walletCreateCommand', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new ExitError(code as number);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates a single wallet with --chain', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(201, {
        id: 'w-new', name: 'solana-mainnet', chain: 'solana', environment: 'mainnet', publicKey: 'SolPubKey',
      }))
      .mockResolvedValueOnce(mockResponse(200, {
        id: 'w-new', chain: 'solana', environment: 'mainnet', availableNetworks: [{ network: 'solana-mainnet' }],
      }));

    await walletCreateCommand({
      baseUrl: 'http://localhost:3100',
      password: 'pw',
      chain: 'solana',
    });
    expect(logSpy).toHaveBeenCalled();
  });

  it('creates wallets with --all', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(201, {
        id: 'w1', name: 'solana-mainnet', chain: 'solana', environment: 'mainnet', publicKey: 'key1',
      }))
      .mockResolvedValueOnce(mockResponse(201, {
        id: 'w2', name: 'evm-mainnet', chain: 'ethereum', environment: 'mainnet', publicKey: 'key2',
      }))
      .mockResolvedValueOnce(mockResponse(200, {
        id: 'w1', chain: 'solana', environment: 'mainnet', availableNetworks: [],
      }))
      .mockResolvedValueOnce(mockResponse(200, {
        id: 'w2', chain: 'ethereum', environment: 'mainnet', availableNetworks: [],
      }));

    await walletCreateCommand({
      baseUrl: 'http://localhost:3100',
      password: 'pw',
      all: true,
    });
  });

  it('exits when --chain and --all used together', async () => {
    await expect(
      walletCreateCommand({
        baseUrl: 'http://localhost:3100',
        password: 'pw',
        chain: 'solana',
        all: true,
      }),
    ).rejects.toThrow(ExitError);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('cannot be used together'));
  });

  it('exits when neither --chain nor --all specified', async () => {
    await expect(
      walletCreateCommand({
        baseUrl: 'http://localhost:3100',
        password: 'pw',
      }),
    ).rejects.toThrow(ExitError);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Specify --chain'));
  });

  it('exits for unsupported chain', async () => {
    await expect(
      walletCreateCommand({
        baseUrl: 'http://localhost:3100',
        password: 'pw',
        chain: 'bitcoin',
      }),
    ).rejects.toThrow(ExitError);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Unsupported chain'));
  });

  it('exits for invalid account type', async () => {
    await expect(
      walletCreateCommand({
        baseUrl: 'http://localhost:3100',
        password: 'pw',
        chain: 'ethereum',
        accountType: 'invalid',
      }),
    ).rejects.toThrow(ExitError);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid account type'));
  });

  it('handles 409 conflict (reuses existing wallet)', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(409, { message: 'Already exists' }))
      .mockResolvedValueOnce(mockResponse(200, {
        wallets: [{ id: 'w-existing', name: 'solana-mainnet', chain: 'solana', environment: 'mainnet', publicKey: 'key1' }],
      }))
      .mockResolvedValueOnce(mockResponse(200, {
        id: 'w-existing', chain: 'solana', environment: 'mainnet', availableNetworks: [],
      }));

    await walletCreateCommand({
      baseUrl: 'http://localhost:3100',
      password: 'pw',
      chain: 'solana',
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Reusing'));
  });

  it('exits on 409 when existing wallet not found in list', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(409, {}))
      .mockResolvedValueOnce(mockResponse(200, { wallets: [] }));

    await expect(
      walletCreateCommand({
        baseUrl: 'http://localhost:3100',
        password: 'pw',
        chain: 'solana',
      }),
    ).rejects.toThrow(ExitError);
  });

  it('exits on 409 when list request fails', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(409, {}))
      .mockResolvedValueOnce(mockResponse(500, {}));

    await expect(
      walletCreateCommand({
        baseUrl: 'http://localhost:3100',
        password: 'pw',
        chain: 'solana',
      }),
    ).rejects.toThrow(ExitError);
  });

  it('exits on non-409 error', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(400, { message: 'Bad request' }));

    await expect(
      walletCreateCommand({
        baseUrl: 'http://localhost:3100',
        password: 'pw',
        chain: 'ethereum',
      }),
    ).rejects.toThrow(ExitError);
  });

  it('exits when daemon is not running (fetch throws)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      walletCreateCommand({
        baseUrl: 'http://localhost:3100',
        password: 'pw',
        chain: 'solana',
      }),
    ).rejects.toThrow(ExitError);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('not running'));
  });

  it('creates smart account wallet', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(201, {
        id: 'w-smart', name: 'evm-mainnet', chain: 'ethereum', environment: 'mainnet',
        publicKey: '0xsmart', accountType: 'smart', signerKey: '0xsigner', deployed: false,
      }))
      .mockResolvedValueOnce(mockResponse(200, {
        id: 'w-smart', chain: 'ethereum', environment: 'mainnet',
        availableNetworks: [{ network: 'ethereum-mainnet' }],
      }));

    await walletCreateCommand({
      baseUrl: 'http://localhost:3100',
      password: 'pw',
      chain: 'ethereum',
      accountType: 'smart',
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('smart'));
  });

  it('creates wallet with custom name', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(201, {
        id: 'w-named', name: 'my-custom-name', chain: 'ethereum', environment: 'mainnet', publicKey: '0xkey',
      }))
      .mockResolvedValueOnce(mockResponse(200, {
        id: 'w-named', chain: 'ethereum', environment: 'mainnet', availableNetworks: [],
      }));

    await walletCreateCommand({
      baseUrl: 'http://localhost:3100',
      password: 'pw',
      chain: 'ethereum',
      name: 'my-custom-name',
    });
  });

  it('creates wallet with testnet mode', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(201, {
        id: 'w-test', name: 'solana-testnet', chain: 'solana', environment: 'testnet', publicKey: 'testkey',
      }))
      .mockResolvedValueOnce(mockResponse(200, {
        id: 'w-test', chain: 'solana', environment: 'testnet', availableNetworks: [],
      }));

    await walletCreateCommand({
      baseUrl: 'http://localhost:3100',
      password: 'pw',
      chain: 'solana',
      mode: 'testnet',
    });
  });
});
