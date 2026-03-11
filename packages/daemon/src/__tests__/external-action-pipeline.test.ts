/**
 * Tests for executeSignedDataAction and executeSignedHttpAction pipeline functions.
 *
 * Uses mocked dependencies (vi.fn()) for all pipeline deps.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SignedDataAction, SignedHttpAction } from '@waiaas/core';
import type { ExternalActionPipelineDeps } from '../pipeline/external-action-pipeline.js';
import { executeSignedDataAction, executeSignedHttpAction } from '../pipeline/external-action-pipeline.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockDeps(overrides: Partial<ExternalActionPipelineDeps> = {}): ExternalActionPipelineDeps {
  return {
    db: {
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ run: vi.fn() }) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ run: vi.fn() }) }) }),
    } as any,
    sqlite: {
      prepare: vi.fn().mockReturnValue({ run: vi.fn() }),
    } as any,
    keyStore: {
      decryptPrivateKey: vi.fn().mockResolvedValue(Buffer.from('a'.repeat(64), 'hex')),
      releaseKey: vi.fn(),
    } as any,
    credentialVault: {
      get: vi.fn().mockResolvedValue({ id: 'cred-1', value: 'secret-key-value', type: 'api_key', name: 'test', walletId: null, metadata: {}, expiresAt: null, createdAt: 0, updatedAt: 0 }),
    } as any,
    signerRegistry: {
      resolve: vi.fn().mockReturnValue({
        scheme: 'eip712',
        canSign: vi.fn().mockReturnValue(true),
        sign: vi.fn().mockResolvedValue({ signature: '0xabcdef1234567890', metadata: {} }),
      }),
    } as any,
    policyEngine: {
      evaluate: vi.fn().mockResolvedValue({ tier: 'INSTANT', allowed: true }),
    } as any,
    masterPassword: 'test-password',
    walletId: 'wallet-001',
    wallet: { publicKey: '0xWallet', chain: 'evm', environment: 'mainnet' },
    sessionId: 'session-001',
    settingsService: {
      get: vi.fn().mockReturnValue('false'),
    } as any,
    actionProviderKey: 'test-provider',
    actionName: 'test-action',
    ...overrides,
  };
}

function createSignedDataAction(overrides: Partial<SignedDataAction> = {}): SignedDataAction {
  return {
    kind: 'signedData',
    signingScheme: 'eip712',
    payload: { domain: {}, types: {}, primaryType: 'Order', value: { amount: '100' } },
    venue: 'test-venue',
    operation: 'place_order',
    ...overrides,
  } as SignedDataAction;
}

function createSignedHttpAction(overrides: Partial<SignedHttpAction> = {}): SignedHttpAction {
  return {
    kind: 'signedHttp',
    method: 'POST',
    url: 'https://api.example.com/v1/orders',
    headers: { 'Content-Type': 'application/json' },
    body: '{"amount":"100"}',
    signingScheme: 'erc8128',
    venue: 'test-venue',
    operation: 'submit_order',
    ...overrides,
  } as SignedHttpAction;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeSignedDataAction', () => {
  let deps: ExternalActionPipelineDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('executes full pipeline: credential -> sign -> DB -> audit', async () => {
    const action = createSignedDataAction({ credentialRef: 'my-api-key' });
    const result = await executeSignedDataAction(deps, action);

    // Should have called credentialVault.get
    expect(deps.credentialVault.get).toHaveBeenCalledWith('my-api-key', 'wallet-001');

    // Should have resolved signer
    expect(deps.signerRegistry.resolve).toHaveBeenCalledWith(action);

    // Should have gotten private key and released it
    expect(deps.keyStore.decryptPrivateKey).toHaveBeenCalledWith('wallet-001', 'test-password');
    expect(deps.keyStore.releaseKey).toHaveBeenCalled();

    // Should have inserted into transactions
    expect(deps.db.insert).toHaveBeenCalled();

    // Should return success
    expect(result.status).toBe('CONFIRMED');
    expect(result.id).toBeTruthy();
  });

  it('skips credential when credentialRef is absent', async () => {
    const action = createSignedDataAction(); // no credentialRef
    await executeSignedDataAction(deps, action);

    expect(deps.credentialVault.get).not.toHaveBeenCalled();
  });

  it('evaluates policy when policyContext is present', async () => {
    const action = createSignedDataAction({
      policyContext: {
        actionCategory: 'trade',
        notionalUsd: 500,
      } as any,
    });
    await executeSignedDataAction(deps, action);

    expect(deps.policyEngine.evaluate).toHaveBeenCalled();
  });

  it('throws POLICY_DENIED when policy denies', async () => {
    deps.policyEngine.evaluate = vi.fn().mockResolvedValue({ tier: 'INSTANT', allowed: false, reason: 'Venue not allowed' });
    const action = createSignedDataAction({
      policyContext: { actionCategory: 'trade', notionalUsd: 100 } as any,
    });

    await expect(executeSignedDataAction(deps, action)).rejects.toThrow('Venue not allowed');
  });

  it('enrolls tracking when tracking field is present', async () => {
    const action = createSignedDataAction({
      tracking: {
        trackerName: 'test-tracker',
        metadata: { orderId: '123' },
      } as any,
    });
    const result = await executeSignedDataAction(deps, action);

    // Update should be called for tracking enrollment
    expect(deps.db.update).toHaveBeenCalled();
    expect(result.status).toBe('CONFIRMED');
  });

  it('records ACTION_SIGNED audit log', async () => {
    const action = createSignedDataAction();
    await executeSignedDataAction(deps, action);

    // sqlite.prepare should be called for audit log insertion
    expect(deps.sqlite!.prepare).toHaveBeenCalled();
  });

  it('releases key even on error', async () => {
    const signer = {
      scheme: 'eip712' as const,
      canSign: vi.fn().mockReturnValue(true),
      sign: vi.fn().mockRejectedValue(new Error('Signing failed')),
    };
    deps.signerRegistry.resolve = vi.fn().mockReturnValue(signer);

    const action = createSignedDataAction();
    await expect(executeSignedDataAction(deps, action)).rejects.toThrow('Signing failed');

    // releaseKey must still be called
    expect(deps.keyStore.releaseKey).toHaveBeenCalled();
  });
});

describe('executeSignedHttpAction', () => {
  let deps: ExternalActionPipelineDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('executes full pipeline and calls provider.execute()', async () => {
    const action = createSignedHttpAction();
    const mockProvider = {
      metadata: { name: 'test-provider' },
      resolve: vi.fn(),
      execute: vi.fn().mockResolvedValue({ externalId: 'ext-123', status: 'SUBMITTED' }),
    };

    const result = await executeSignedHttpAction(deps, action, mockProvider as any);

    // Should resolve signer
    expect(deps.signerRegistry.resolve).toHaveBeenCalledWith(action);

    // Should call provider.execute with signed request
    expect(mockProvider.execute).toHaveBeenCalled();

    expect(result.status).toBe('CONFIRMED');
    expect(result.id).toBeTruthy();
  });

  it('returns signed request when provider has no execute()', async () => {
    const action = createSignedHttpAction();

    const result = await executeSignedHttpAction(deps, action);

    // No provider execute, but should still complete
    expect(result.status).toBe('CONFIRMED');
    expect(result.id).toBeTruthy();
  });

  it('records ACTION_HTTP_SIGNED audit log', async () => {
    const action = createSignedHttpAction();
    await executeSignedHttpAction(deps, action);

    expect(deps.sqlite!.prepare).toHaveBeenCalled();
  });

  it('releases key even on error', async () => {
    const signer = {
      scheme: 'erc8128' as const,
      canSign: vi.fn().mockReturnValue(true),
      sign: vi.fn().mockRejectedValue(new Error('HTTP signing failed')),
    };
    deps.signerRegistry.resolve = vi.fn().mockReturnValue(signer);

    const action = createSignedHttpAction();
    await expect(executeSignedHttpAction(deps, action)).rejects.toThrow('HTTP signing failed');

    expect(deps.keyStore.releaseKey).toHaveBeenCalled();
  });
});
