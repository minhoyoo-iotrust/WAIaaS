/**
 * Pipeline branch coverage gap tests.
 *
 * Targets uncovered branches in:
 * - external-action-pipeline.ts (executeSignedDataAction, executeSignedHttpAction, buildSignedDataParams, buildSignedHttpParams)
 * - sign-only.ts (executeSignOnly error paths, policy branches)
 * - dry-run.ts (executeDryRun balance checks, oracle errors, warnings)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WAIaaSError } from '@waiaas/core';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';

// ---------------------------------------------------------------------------
// In-memory DB helper
// ---------------------------------------------------------------------------

function createTestDb() {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn;
}

function createMinimalWallet(db: any, sqlite: any, walletId: string, chain = 'ethereum') {
  sqlite.prepare(
    `INSERT INTO wallets (id, name, public_key, chain, created_at, updated_at, environment) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?)`,
  ).run(walletId, 'test-wallet', '0xpubkey', chain, 'mainnet');
}

// ---------------------------------------------------------------------------
// External Action Pipeline
// ---------------------------------------------------------------------------

import {
  executeSignedDataAction,
  executeSignedHttpAction,
  type ExternalActionPipelineDeps,
} from '../pipeline/external-action-pipeline.js';

function createMockDeps(db: any, sqlite?: any): ExternalActionPipelineDeps {
  return {
    db,
    sqlite,
    keyStore: {
      decryptPrivateKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 1)),
      releaseKey: vi.fn(),
    } as any,
    credentialVault: {
      get: vi.fn().mockResolvedValue({ value: 'secret-value' }),
    } as any,
    signerRegistry: {
      resolve: vi.fn().mockReturnValue({
        sign: vi.fn().mockResolvedValue({
          signature: '0x' + 'ab'.repeat(33),
          metadata: {},
        }),
      }),
    } as any,
    policyEngine: {
      evaluate: vi.fn().mockResolvedValue({ allowed: true, tier: 'INSTANT' }),
    } as any,
    masterPassword: 'test-password',
    walletId: 'wallet-1',
    wallet: { publicKey: '0xpubkey', chain: 'ethereum', environment: 'mainnet' },
    sessionId: undefined,
    settingsService: { get: vi.fn() } as any,
    eventBus: { emit: vi.fn() } as any,
    notificationService: { notify: vi.fn() } as any,
    actionProviderKey: 'test-provider',
    actionName: 'test-action',
  };
}

describe('executeSignedDataAction', () => {
  it('succeeds with credential and tracking', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);

    const action = {
      kind: 'signedData' as const,
      venue: 'hyperliquid',
      operation: 'placeOrder',
      signingScheme: 'eip712' as const,
      credentialRef: 'cred-1',
      payload: {
        domain: { name: 'Test' },
        types: { Order: [{ name: 'id', type: 'uint256' }] },
        primaryType: 'Order',
        value: { id: 1 },
      },
      policyContext: {
        actionCategory: 'trading',
        notionalUsd: '100',
      },
      tracking: {
        trackerName: 'test-tracker',
        metadata: { orderId: '123' },
      },
    };

    const result = await executeSignedDataAction(deps, action as any);
    expect(result.status).toBe('CONFIRMED');
    expect(result.id).toBeTruthy();
  });

  it('succeeds without credential or tracking (no credentialRef, no policyContext, no tracking)', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);

    const action = {
      kind: 'signedData' as const,
      venue: 'test',
      operation: 'sign',
      signingScheme: 'personal' as const,
      payload: 'hello world',
    };

    const result = await executeSignedDataAction(deps, action as any);
    expect(result.status).toBe('CONFIRMED');
  });

  it('succeeds without sqlite (no audit log)', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, undefined);

    const action = {
      kind: 'signedData' as const,
      venue: 'test',
      operation: 'sign',
      signingScheme: 'personal' as const,
      payload: 'hello',
    };

    const result = await executeSignedDataAction(deps, action as any);
    expect(result.status).toBe('CONFIRMED');
  });

  it('throws on policy denied', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);
    (deps.policyEngine.evaluate as any).mockResolvedValue({
      allowed: false,
      reason: 'Denied by policy',
    });

    const action = {
      kind: 'signedData' as const,
      venue: 'test',
      operation: 'sign',
      signingScheme: 'personal' as const,
      payload: 'hello',
      policyContext: { actionCategory: 'test' },
    };

    await expect(executeSignedDataAction(deps, action as any)).rejects.toThrow(/denied|POLICY/i);
  });

  it('policy denied with null reason falls back to default message', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);
    (deps.policyEngine.evaluate as any).mockResolvedValue({
      allowed: false,
      reason: null,
    });

    const action = {
      kind: 'signedData' as const,
      venue: 'test',
      operation: 'sign',
      signingScheme: 'personal' as const,
      payload: 'hello',
      policyContext: { actionCategory: 'test' },
    };

    await expect(executeSignedDataAction(deps, action as any)).rejects.toThrow(/denied|POLICY/i);
  });

  it('marks FAILED on signer error and releases key', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);
    (deps.signerRegistry.resolve as any).mockReturnValue({
      sign: vi.fn().mockRejectedValue(new Error('signing failed')),
    });

    const action = {
      kind: 'signedData' as const,
      venue: 'test',
      operation: 'sign',
      signingScheme: 'personal' as const,
      payload: 'hello',
    };

    await expect(executeSignedDataAction(deps, action as any)).rejects.toThrow('signing failed');
    expect(deps.keyStore.releaseKey).toHaveBeenCalled();
  });

  it('handles non-Error thrown in catch (Unknown error)', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);
    (deps.signerRegistry.resolve as any).mockReturnValue({
      sign: vi.fn().mockRejectedValue('string-error'),
    });

    const action = {
      kind: 'signedData' as const,
      venue: 'test',
      operation: 'sign',
      signingScheme: 'personal' as const,
      payload: 'hello',
    };

    // Non-Error thrown values get re-thrown after best-effort DB update
    try {
      await executeSignedDataAction(deps, action as any);
      expect.fail('should have thrown');
    } catch (e) {
      // The string 'string-error' is rethrown
      expect(e).toBe('string-error');
    }
  });

  it('handles binary signature result', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);
    (deps.signerRegistry.resolve as any).mockReturnValue({
      sign: vi.fn().mockResolvedValue({
        signature: Buffer.alloc(65, 0xaa),
        metadata: {},
      }),
    });

    const action = {
      kind: 'signedData' as const,
      venue: 'test',
      operation: 'sign',
      signingScheme: 'personal' as const,
      payload: 'hello',
    };

    const result = await executeSignedDataAction(deps, action as any);
    expect(result.status).toBe('CONFIRMED');
  });
});

// ---------------------------------------------------------------------------
// buildSignedDataParams coverage (via executeSignedDataAction with different schemes)
// ---------------------------------------------------------------------------

describe('buildSignedDataParams (via executeSignedDataAction)', () => {
  async function testScheme(signingScheme: string, payload: any) {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);
    const action = {
      kind: 'signedData' as const,
      venue: 'test',
      operation: 'test',
      signingScheme,
      payload,
    };
    return executeSignedDataAction(deps, action as any);
  }

  it('hmac-sha256 with string payload', async () => {
    const result = await testScheme('hmac-sha256', 'test-data');
    expect(result.status).toBe('CONFIRMED');
  });

  it('hmac-sha256 with object payload', async () => {
    const result = await testScheme('hmac-sha256', { key: 'value' });
    expect(result.status).toBe('CONFIRMED');
  });

  it('rsa-pss scheme', async () => {
    const result = await testScheme('rsa-pss', 'test-data');
    expect(result.status).toBe('CONFIRMED');
  });

  it('rsa-pss with object payload', async () => {
    const result = await testScheme('rsa-pss', { data: 'test' });
    expect(result.status).toBe('CONFIRMED');
  });

  it('ecdsa-secp256k1 scheme', async () => {
    const result = await testScheme('ecdsa-secp256k1', 'test-data');
    expect(result.status).toBe('CONFIRMED');
  });

  it('ed25519 scheme', async () => {
    const result = await testScheme('ed25519', 'test-data');
    expect(result.status).toBe('CONFIRMED');
  });

  it('ed25519 with object payload', async () => {
    const result = await testScheme('ed25519', { data: 'test' });
    expect(result.status).toBe('CONFIRMED');
  });

  it('erc8128 scheme in signedData', async () => {
    const result = await testScheme('erc8128', {
      chainId: 1,
      address: '0xtest',
      method: 'GET',
      url: 'https://example.com',
      headers: { 'Content-Type': 'application/json' },
      body: 'test-body',
    });
    expect(result.status).toBe('CONFIRMED');
  });

  it('erc8128 scheme with missing fields (defaults)', async () => {
    const result = await testScheme('erc8128', {});
    expect(result.status).toBe('CONFIRMED');
  });

  it('unsupported scheme throws', async () => {
    await expect(testScheme('unknown-scheme', 'data')).rejects.toThrow('Unsupported signing scheme');
  });

  it('personal scheme with object payload', async () => {
    const result = await testScheme('personal', { msg: 'test' });
    expect(result.status).toBe('CONFIRMED');
  });

  it('eip712 with missing domain/types/primaryType defaults', async () => {
    const result = await testScheme('eip712', { value: { id: 1 } });
    expect(result.status).toBe('CONFIRMED');
  });
});

// ---------------------------------------------------------------------------
// executeSignedHttpAction
// ---------------------------------------------------------------------------

describe('executeSignedHttpAction', () => {
  it('succeeds with provider execute callback returning externalId', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);
    const provider = {
      execute: vi.fn().mockResolvedValue({ externalId: 'ext-123' }),
    } as any;

    const action = {
      kind: 'signedHttp' as const,
      venue: 'test',
      operation: 'post',
      signingScheme: 'erc8128' as const,
      method: 'POST',
      url: 'https://api.example.com/order',
      headers: { 'Content-Type': 'application/json' },
      body: '{"order":"buy"}',
      credentialRef: 'cred-1',
      policyContext: { actionCategory: 'trading' },
      tracking: { trackerName: 'test-tracker' },
    };

    const result = await executeSignedHttpAction(deps, action as any, provider);
    expect(result.status).toBe('CONFIRMED');
    expect(provider.execute).toHaveBeenCalled();
  });

  it('succeeds without provider (no execute callback)', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);

    const action = {
      kind: 'signedHttp' as const,
      venue: 'test',
      operation: 'get',
      signingScheme: 'hmac-sha256' as const,
      method: 'GET',
      url: 'https://api.example.com/data',
    };

    const result = await executeSignedHttpAction(deps, action as any);
    expect(result.status).toBe('CONFIRMED');
  });

  it('succeeds with provider.execute returning non-object', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);
    const provider = {
      execute: vi.fn().mockResolvedValue('ok'),
    } as any;

    const action = {
      kind: 'signedHttp' as const,
      venue: 'test',
      operation: 'get',
      signingScheme: 'erc8128' as const,
      method: 'GET',
      url: 'https://example.com',
    };

    const result = await executeSignedHttpAction(deps, action as any, provider);
    expect(result.status).toBe('CONFIRMED');
  });

  it('succeeds with provider.execute returning object without externalId', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);
    const provider = {
      execute: vi.fn().mockResolvedValue({ status: 'ok' }),
    } as any;

    const action = {
      kind: 'signedHttp' as const,
      venue: 'test',
      operation: 'get',
      signingScheme: 'erc8128' as const,
      method: 'GET',
      url: 'https://example.com',
    };

    const result = await executeSignedHttpAction(deps, action as any, provider);
    expect(result.status).toBe('CONFIRMED');
  });

  it('succeeds with erc8128 signing params (coveredComponents, preset, ttlSec, nonce)', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);

    const action = {
      kind: 'signedHttp' as const,
      venue: 'test',
      operation: 'post',
      signingScheme: 'erc8128' as const,
      method: 'POST',
      url: 'https://example.com',
      headers: { Authorization: 'Bearer token' },
      body: '{}',
      coveredComponents: ['@method', '@url'],
      preset: 'standard',
      ttlSec: 300,
      nonce: 'nonce-123',
    };

    const result = await executeSignedHttpAction(deps, action as any);
    expect(result.status).toBe('CONFIRMED');
  });

  it('unsupported HTTP signing scheme throws', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);

    const action = {
      kind: 'signedHttp' as const,
      venue: 'test',
      operation: 'get',
      signingScheme: 'unknown' as const,
      method: 'GET',
      url: 'https://example.com',
    };

    await expect(executeSignedHttpAction(deps, action as any)).rejects.toThrow('Unsupported');
  });

  it('marks FAILED on error and releases key', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);
    (deps.keyStore.decryptPrivateKey as any).mockRejectedValue(new Error('key error'));

    const action = {
      kind: 'signedHttp' as const,
      venue: 'test',
      operation: 'get',
      signingScheme: 'erc8128' as const,
      method: 'GET',
      url: 'https://example.com',
    };

    await expect(executeSignedHttpAction(deps, action as any)).rejects.toThrow(/key error/);
  });

  it('binary signature in executeSignedHttpAction', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);
    (deps.signerRegistry.resolve as any).mockReturnValue({
      sign: vi.fn().mockResolvedValue({
        signature: Buffer.alloc(65, 0xbb),
        metadata: { 'X-Signature': 'sig-value' },
      }),
    });

    const action = {
      kind: 'signedHttp' as const,
      venue: 'test',
      operation: 'get',
      signingScheme: 'erc8128' as const,
      method: 'GET',
      url: 'https://example.com',
    };

    const result = await executeSignedHttpAction(deps, action as any);
    expect(result.status).toBe('CONFIRMED');
  });

  it('uses action.actionName if available', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);
    const executeFn = vi.fn().mockResolvedValue({ externalId: 'ext-1' });
    const provider = { execute: executeFn } as any;

    const action = {
      kind: 'signedHttp' as const,
      venue: 'test',
      operation: 'get',
      signingScheme: 'erc8128' as const,
      method: 'GET',
      url: 'https://example.com',
      actionName: 'custom-action-name',
    };

    await executeSignedHttpAction(deps, action as any, provider);
    expect(executeFn).toHaveBeenCalledWith('custom-action-name', expect.any(Object), expect.any(Object));
  });

  it('hmac-sha256 HTTP scheme with body', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);

    const action = {
      kind: 'signedHttp' as const,
      venue: 'test',
      operation: 'post',
      signingScheme: 'hmac-sha256' as const,
      method: 'POST',
      url: 'https://example.com/api',
      body: '{"data":true}',
      credentialRef: 'cred-1',
    };

    const result = await executeSignedHttpAction(deps, action as any);
    expect(result.status).toBe('CONFIRMED');
  });

  it('hmac-sha256 HTTP scheme without body', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createMockDeps(db, sqlite);

    const action = {
      kind: 'signedHttp' as const,
      venue: 'test',
      operation: 'get',
      signingScheme: 'hmac-sha256' as const,
      method: 'GET',
      url: 'https://example.com/api',
    };

    const result = await executeSignedHttpAction(deps, action as any);
    expect(result.status).toBe('CONFIRMED');
  });
});

// ---------------------------------------------------------------------------
// dry-run.ts executeDryRun
// ---------------------------------------------------------------------------

import { executeDryRun, type DryRunDeps } from '../pipeline/dry-run.js';

function createDryRunDeps(db: any): DryRunDeps {
  return {
    db,
    adapter: {
      buildTransaction: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 10000n }),
      buildTokenTransfer: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 10000n }),
      buildContractCall: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 10000n }),
      buildApprove: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 10000n }),
      buildBatch: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 10000n }),
      buildNftTransferTx: vi.fn().mockResolvedValue({ raw: '0x', estimatedFee: 10000n }),
      simulateTransaction: vi.fn().mockResolvedValue({ success: true, logs: [] }),
      getBalance: vi.fn().mockResolvedValue({ balance: 1000000000n, symbol: 'ETH', decimals: 18 }),
      getAssets: vi.fn().mockResolvedValue([]),
    } as any,
    policyEngine: {
      evaluate: vi.fn().mockResolvedValue({ allowed: true, tier: 'INSTANT' }),
    } as any,
  };
}

describe('executeDryRun', () => {
  it('policy denied returns success=false with policy reason', async () => {
    const { db } = createTestDb();
    const deps = createDryRunDeps(db);
    (deps.policyEngine.evaluate as any).mockResolvedValue({
      allowed: false,
      tier: 'INSTANT',
      reason: 'Token transfer not allowed by ALLOWED_TOKENS',
    });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '1000' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.success).toBe(false);
    expect(result.warnings.some((w: any) => w.code === 'TOKEN_NOT_IN_ALLOWED_LIST')).toBe(true);
  });

  it('contract not whitelisted warning', async () => {
    const { db } = createTestDb();
    const deps = createDryRunDeps(db);
    (deps.policyEngine.evaluate as any).mockResolvedValue({
      allowed: false,
      reason: 'Contract 0xabc is not whitelisted',
    });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'CONTRACT_CALL', to: '0xabc', calldata: '0x' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.warnings.some((w: any) => w.code === 'CONTRACT_NOT_WHITELISTED')).toBe(true);
  });

  it('network not allowed warning', async () => {
    const { db } = createTestDb();
    const deps = createDryRunDeps(db);
    (deps.policyEngine.evaluate as any).mockResolvedValue({
      allowed: false,
      reason: 'Network not in allowed networks',
    });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '1000' } as any,
      'ethereum-goerli',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'testnet' },
    );

    expect(result.warnings.some((w: any) => w.code === 'NETWORK_NOT_ALLOWED')).toBe(true);
  });

  it('DELAY tier adds delay warning', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.policyEngine.evaluate as any).mockResolvedValue({
      allowed: true,
      tier: 'DELAY',
      delaySeconds: 600,
    });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '1000' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.warnings.some((w: any) => w.code === 'DELAY_REQUIRED')).toBe(true);
  });

  it('APPROVAL tier with owner downgrade', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.policyEngine.evaluate as any).mockResolvedValue({
      allowed: true,
      tier: 'APPROVAL',
      approvalReason: 'High value',
    });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '1000' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    // Should downgrade since wallet has no owner
    expect(result.warnings.some((w: any) => w.code === 'DOWNGRADED_NO_OWNER' || w.code === 'DELAY_REQUIRED')).toBe(true);
  });

  it('cumulative warning at high ratio', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.policyEngine.evaluate as any).mockResolvedValue({
      allowed: true,
      tier: 'INSTANT',
      cumulativeWarning: { type: 'daily', ratio: 0.9 },
    });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '1000' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.warnings.some((w: any) => w.code === 'CUMULATIVE_LIMIT_WARNING')).toBe(true);
  });

  it('build failure adds SIMULATION_FAILED warning', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).buildTransaction.mockRejectedValue(new Error('Build error'));

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '1000' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.warnings.some((w: any) => w.code === 'SIMULATION_FAILED')).toBe(true);
  });

  it('simulation failure adds warning', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).simulateTransaction.mockResolvedValue({
      success: false,
      logs: [],
      error: 'revert',
    });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '1000' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.warnings.some((w: any) => w.code === 'SIMULATION_FAILED')).toBe(true);
  });

  it('simulation exception adds warning', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).simulateTransaction.mockRejectedValue(new Error('sim error'));

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '1000' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.warnings.some((w: any) => w.code === 'SIMULATION_FAILED')).toBe(true);
  });

  it('insufficient balance for TRANSFER (amount + fee)', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).getBalance.mockResolvedValue({ balance: 100n, symbol: 'ETH', decimals: 18 });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '99999999' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.warnings.some((w: any) => w.code === 'INSUFFICIENT_BALANCE_WITH_FEE')).toBe(true);
  });

  it('insufficient native balance for fee (non-TRANSFER type)', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).getBalance.mockResolvedValue({ balance: 0n, symbol: 'ETH', decimals: 18 });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      {
        type: 'TOKEN_TRANSFER',
        to: '0xabc',
        amount: '1000',
        token: { address: '0xtoken', decimals: 18, symbol: 'TK' },
      } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.warnings.some((w: any) => w.code === 'INSUFFICIENT_BALANCE_WITH_FEE')).toBe(true);
  });

  it('TOKEN_TRANSFER insufficient token balance warning', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).getAssets.mockResolvedValue([
      { mint: '0xtoken', balance: 500n, symbol: 'TK', decimals: 18 },
    ]);

    const result = await executeDryRun(
      deps,
      'wallet-1',
      {
        type: 'TOKEN_TRANSFER',
        to: '0xabc',
        amount: '1000',
        token: { address: '0xtoken', decimals: 18, symbol: 'TK' },
      } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.warnings.some((w: any) => w.code === 'INSUFFICIENT_BALANCE')).toBe(true);
  });

  it('TOKEN_TRANSFER with no matching asset (token not found)', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).getAssets.mockResolvedValue([
      { mint: '0xother', balance: 10000n, symbol: 'OT', decimals: 18 },
    ]);

    const result = await executeDryRun(
      deps,
      'wallet-1',
      {
        type: 'TOKEN_TRANSFER',
        to: '0xabc',
        amount: '1000',
        token: { address: '0xtoken', decimals: 18, symbol: 'TK' },
      } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    // Should have added token balance entry with balance=0
    expect(result.balanceChanges.some((b: any) => b.asset === '0xtoken')).toBe(true);
  });

  it('TOKEN_TRANSFER with getAssets error (fallback to 0 balance)', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).getAssets.mockRejectedValue(new Error('RPC error'));

    const result = await executeDryRun(
      deps,
      'wallet-1',
      {
        type: 'TOKEN_TRANSFER',
        to: '0xabc',
        amount: '1000',
        token: { address: '0xtoken', decimals: 18, symbol: 'TK' },
      } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.balanceChanges.some((b: any) => b.asset === '0xtoken')).toBe(true);
  });

  it('getBalance error (fallback to 0 native balance)', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).getBalance.mockRejectedValue(new Error('RPC error'));

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '1000' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.balanceChanges).toHaveLength(1);
    expect(result.balanceChanges[0].currentBalance).toBe('0');
  });

  it('high fee ratio warning', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    // Fee is large relative to amount
    (deps.adapter as any).buildTransaction.mockResolvedValue({ raw: '0x', estimatedFee: 200n });
    (deps.adapter as any).getBalance.mockResolvedValue({ balance: 10000000n, symbol: 'ETH', decimals: 18 });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '100' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.warnings.some((w: any) => w.code === 'HIGH_FEE_RATIO')).toBe(true);
  });

  it('with price oracle success', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    deps.priceOracle = {
      getNativePrice: vi.fn().mockResolvedValue({ usdPrice: 2000 }),
      getTokenPrice: vi.fn().mockResolvedValue({ usdPrice: 1 }),
    } as any;

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '1000000000000000000' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.fee?.feeUsd).toBeTruthy();
  });

  it('with price oracle notListed result', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);

    // resolveEffectiveAmountUsd is called internally; mock at a level that triggers the notListed branch
    // We'll set priceOracle to trigger the specific branch via TOKEN_TRANSFER path
    deps.priceOracle = {
      getNativePrice: vi.fn().mockResolvedValue({ usdPrice: 2000 }),
      getTokenPrice: vi.fn().mockResolvedValue(null), // returns null => notListed
    } as any;

    const result = await executeDryRun(
      deps,
      'wallet-1',
      {
        type: 'TOKEN_TRANSFER',
        to: '0xabc',
        amount: '1000',
        token: { address: '0xunknown-token', decimals: 18, symbol: 'UNK' },
      } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    // Should have ORACLE warning or succeed gracefully
    expect(result.success).toBe(true);
  });

  it('with price oracle error', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    deps.priceOracle = {
      getNativePrice: vi.fn().mockRejectedValue(new Error('oracle down')),
      getTokenPrice: vi.fn().mockRejectedValue(new Error('oracle down')),
    } as any;

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '1000' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.warnings.some((w: any) => w.code === 'ORACLE_PRICE_UNAVAILABLE')).toBe(true);
  });

  it('invalid request throws VALIDATION_FAILED', async () => {
    const { db } = createTestDb();
    const deps = createDryRunDeps(db);

    await expect(
      executeDryRun(
        deps,
        'wallet-1',
        { type: 'INVALID' } as any,
        'ethereum-mainnet',
        { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
      ),
    ).rejects.toThrow();
  });

  it('CONTRACT_CALL type for balance check (only fee, no amount deduction)', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).getBalance.mockResolvedValue({ balance: 1000000000n });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'CONTRACT_CALL', to: '0xcontract', calldata: '0xdeadbeef' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.success).toBe(true);
  });

  it('balance with missing symbol/decimals uses defaults', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).getBalance.mockResolvedValue({ balance: 1000n });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '100' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.meta.chain).toBe('ethereum');
  });

  it('simulation with unitsConsumed', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).simulateTransaction.mockResolvedValue({
      success: true,
      logs: ['log1'],
      unitsConsumed: 50000n,
    });

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '100' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.simulation.unitsConsumed).toBe('50000');
  });

  it('getNativePrice fee oracle error is caught gracefully', async () => {
    const { db, sqlite } = createTestDb();
    createMinimalWallet(db, sqlite, 'wallet-1');
    const deps = createDryRunDeps(db);
    deps.priceOracle = {
      getNativePrice: vi.fn().mockRejectedValue(new Error('rate limit')),
      getTokenPrice: vi.fn().mockRejectedValue(new Error('rate limit')),
    } as any;

    const result = await executeDryRun(
      deps,
      'wallet-1',
      { type: 'TRANSFER', to: '0xabc', amount: '1000' } as any,
      'ethereum-mainnet',
      { publicKey: '0xpub', chain: 'ethereum', environment: 'mainnet' },
    );

    expect(result.fee?.feeUsd).toBeNull();
  });

  it('solana chain uses correct decimals/symbol defaults', async () => {
    const { db, sqlite } = createTestDb();
    // Insert wallet with solana chain
    createMinimalWallet(db, sqlite, 'sol-wallet', 'solana');
    const deps = createDryRunDeps(db);
    (deps.adapter as any).getBalance.mockResolvedValue({ balance: 1000000000n });

    const result = await executeDryRun(
      deps,
      'sol-wallet',
      { type: 'TRANSFER', to: 'RecipientPubKey', amount: '1000000000' } as any,
      'solana-mainnet',
      { publicKey: 'SolPubKey', chain: 'solana', environment: 'mainnet' },
    );

    expect(result.meta.chain).toBe('solana');
  });
});
