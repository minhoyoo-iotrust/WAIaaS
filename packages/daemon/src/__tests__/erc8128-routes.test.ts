import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @waiaas/core erc8128 functions
vi.mock('@waiaas/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waiaas/core')>();
  return {
    ...actual,
    signHttpMessage: vi.fn(),
    verifyHttpSignature: vi.fn(),
  };
});

// Mock domain policy
vi.mock('../../src/services/erc8128/erc8128-domain-policy.js', () => ({
  evaluateErc8128Domain: vi.fn(),
  checkErc8128RateLimit: vi.fn(),
}));

// Mock resolve-wallet-id
vi.mock('../../src/api/helpers/resolve-wallet-id.js', () => ({
  resolveWalletId: vi.fn(),
}));

// Mock network-resolver
vi.mock('../../src/pipeline/network-resolver.js', () => ({
  resolveNetwork: vi.fn().mockReturnValue('ethereum-mainnet'),
}));

import { OpenAPIHono } from '@hono/zod-openapi';
import { signHttpMessage, verifyHttpSignature, NETWORK_TO_CAIP2, WAIaaSError } from '@waiaas/core';
import { evaluateErc8128Domain, checkErc8128RateLimit } from '../services/erc8128/erc8128-domain-policy.js';
import { resolveWalletId } from '../api/helpers/resolve-wallet-id.js';
import { erc8128Routes, type Erc8128RouteDeps } from '../api/routes/erc8128.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockDeps(overrides: Partial<Erc8128RouteDeps> = {}): Erc8128RouteDeps {
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue([]),
            }),
            get: vi.fn().mockReturnValue(null),
          }),
        }),
      }),
    } as any,
    keyStore: {
      decryptPrivateKey: vi.fn().mockResolvedValue(new Uint8Array(32).fill(1)),
    } as any,
    masterPassword: 'test-password',
    notificationService: {
      notify: vi.fn(),
    } as any,
    settingsService: {
      get: vi.fn().mockImplementation((key: string) => {
        const defaults: Record<string, string> = {
          'erc8128.enabled': 'true',
          'erc8128.default_preset': 'standard',
          'erc8128.default_ttl_sec': '300',
          'erc8128.default_nonce': 'true',
          'erc8128.default_rate_limit_rpm': '60',
        };
        return defaults[key] ?? '';
      }),
    } as any,
    eventBus: {
      emit: vi.fn(),
    } as any,
    ...overrides,
  };
}

function createTestApp(deps: Erc8128RouteDeps) {
  const app = new OpenAPIHono();

  // Register error handler (same as server.ts pattern)
  app.onError((err: any, c: any) => {
    if (err instanceof WAIaaSError) {
      return c.json({ error: err.toJSON() }, err.httpStatus);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
  });

  app.route('/v1', erc8128Routes(deps));
  return app;
}

// Mock wallet data
const TEST_WALLET = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Test Wallet',
  chain: 'ethereum',
  environment: 'mainnet',
  publicKey: '0x1234567890abcdef1234567890abcdef12345678',
  status: 'ACTIVE',
};

describe('POST /v1/erc8128/sign', () => {
  let deps: Erc8128RouteDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();

    // Default mocks
    vi.mocked(resolveWalletId).mockReturnValue(TEST_WALLET.id);
    vi.mocked(evaluateErc8128Domain).mockReturnValue(null); // allowed
    vi.mocked(checkErc8128RateLimit).mockReturnValue(true); // under limit

    // Mock DB: wallet lookup returns test wallet
    const mockGet = vi.fn().mockReturnValue(TEST_WALLET);
    const mockAll = vi.fn().mockReturnValue([]);
    (deps.db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({ all: mockAll }),
          get: mockGet,
        }),
      }),
    });

    // Mock signHttpMessage
    vi.mocked(signHttpMessage).mockResolvedValue({
      headers: {
        'Signature-Input': 'sig1=("@method" "@target-uri");created=1000;expires=1300',
        'Signature': 'sig1=:base64signature:',
        'Content-Digest': 'sha-256=:digest:',
      },
      keyid: 'erc8128:1:0x1234567890abcdef1234567890abcdef12345678',
      algorithm: 'ethereum-eip191',
      created: 1000,
      expires: 1300,
      coveredComponents: ['@method', '@target-uri'],
    });
  });

  it('returns 200 with signature headers on valid request', async () => {
    const app = createTestApp(deps);
    const res = await app.request('/v1/erc8128/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://api.example.com/data',
        method: 'GET',
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.signatureInput).toBeDefined();
    expect(json.signature).toBeDefined();
    expect(json.keyid).toContain('erc8128:');
    expect(json.algorithm).toBe('ethereum-eip191');
    expect(json.coveredComponents).toBeInstanceOf(Array);
  });

  it('returns ERC8128_DISABLED when feature gate is off', async () => {
    (deps.settingsService!.get as any).mockImplementation((key: string) =>
      key === 'erc8128.enabled' ? 'false' : '',
    );

    const app = createTestApp(deps);
    const res = await app.request('/v1/erc8128/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://api.example.com/data',
        method: 'GET',
      }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('ERC8128_DISABLED');
  });

  it('returns ERC8128_DOMAIN_NOT_ALLOWED when domain is blocked', async () => {
    vi.mocked(evaluateErc8128Domain).mockReturnValue({
      allowed: false,
      tier: 'INSTANT',
      reason: 'Domain not in allowed list',
    });

    const app = createTestApp(deps);
    const res = await app.request('/v1/erc8128/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://evil.com/data',
        method: 'GET',
      }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('ERC8128_DOMAIN_NOT_ALLOWED');
  });

  it('fires ERC8128_DOMAIN_BLOCKED notification when domain is blocked', async () => {
    vi.mocked(evaluateErc8128Domain).mockReturnValue({
      allowed: false,
      tier: 'INSTANT',
      reason: 'blocked',
    });

    const app = createTestApp(deps);
    await app.request('/v1/erc8128/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://evil.com/data',
        method: 'GET',
      }),
    });

    expect(deps.notificationService!.notify).toHaveBeenCalledWith(
      'ERC8128_DOMAIN_BLOCKED',
      TEST_WALLET.id,
      expect.objectContaining({ domain: 'evil.com' }),
    );
  });

  it('returns ERC8128_RATE_LIMITED when rate limit exceeded', async () => {
    vi.mocked(checkErc8128RateLimit).mockReturnValue(false);

    const app = createTestApp(deps);
    const res = await app.request('/v1/erc8128/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://api.example.com/data',
        method: 'GET',
      }),
    });

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.code).toBe('ERC8128_RATE_LIMITED');
  });

  it('fires ERC8128_SIGNATURE_CREATED notification on success', async () => {
    const app = createTestApp(deps);
    await app.request('/v1/erc8128/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://api.example.com/data',
        method: 'POST',
        preset: 'strict',
      }),
    });

    expect(deps.notificationService!.notify).toHaveBeenCalledWith(
      'ERC8128_SIGNATURE_CREATED',
      TEST_WALLET.id,
      expect.objectContaining({
        domain: 'api.example.com',
        method: 'POST',
        preset: 'strict',
      }),
    );
  });

  it('rejects non-EVM wallets with UNSUPPORTED_CHAIN', async () => {
    // Override wallet to be Solana
    const solanaWallet = { ...TEST_WALLET, chain: 'solana' };
    const mockGet = vi.fn().mockReturnValue(solanaWallet);
    (deps.db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]) }),
          get: mockGet,
        }),
      }),
    });

    const app = createTestApp(deps);
    const res = await app.request('/v1/erc8128/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://api.example.com/data',
        method: 'GET',
      }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('UNSUPPORTED_CHAIN');
  });

  it('zeroes private key bytes after signing', async () => {
    const pkBytes = new Uint8Array(32).fill(0xAB);
    (deps.keyStore.decryptPrivateKey as any).mockResolvedValue(pkBytes);

    const app = createTestApp(deps);
    await app.request('/v1/erc8128/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://api.example.com/data',
        method: 'GET',
      }),
    });

    // After signing, pkBytes should be zeroed
    expect(pkBytes.every((b) => b === 0)).toBe(true);
  });
});

describe('POST /v1/erc8128/verify', () => {
  let deps: Erc8128RouteDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
  });

  it('returns valid=true for valid signed request', async () => {
    vi.mocked(verifyHttpSignature).mockResolvedValue({
      valid: true,
      recoveredAddress: '0x1234567890abcdef1234567890abcdef12345678',
      keyid: 'erc8128:1:0x1234567890abcdef1234567890abcdef12345678',
    });

    const app = createTestApp(deps);
    const res = await app.request('/v1/erc8128/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://api.example.com/data',
        method: 'GET',
        headers: {
          'Signature-Input': 'sig1=("@method");created=1000',
          'Signature': 'sig1=:abc:',
        },
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.valid).toBe(true);
    expect(json.recoveredAddress).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });

  it('returns valid=false for invalid signature', async () => {
    vi.mocked(verifyHttpSignature).mockResolvedValue({
      valid: false,
      recoveredAddress: null,
      keyid: '',
      error: 'Signature expired',
    });

    const app = createTestApp(deps);
    const res = await app.request('/v1/erc8128/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://api.example.com/data',
        method: 'GET',
        headers: {
          'Signature-Input': 'sig1=("@method");created=1000',
          'Signature': 'sig1=:invalid:',
        },
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.valid).toBe(false);
    expect(json.error).toBe('Signature expired');
  });

  it('returns ERC8128_DISABLED when feature gate is off', async () => {
    (deps.settingsService!.get as any).mockImplementation((key: string) =>
      key === 'erc8128.enabled' ? 'false' : '',
    );

    const app = createTestApp(deps);
    const res = await app.request('/v1/erc8128/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://api.example.com/data',
        method: 'GET',
        headers: { 'Signature-Input': 'test', 'Signature': 'test' },
      }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('ERC8128_DISABLED');
  });
});
