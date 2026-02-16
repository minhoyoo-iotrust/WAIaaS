/**
 * Integration tests: stage4Wait + WcSigningBridge fire-and-forget behavior.
 *
 * Verifies that stage4Wait's APPROVAL branch calls wcSigningBridge.requestSignature
 * as fire-and-forget (non-blocking), and that other tiers (INSTANT/DELAY) are
 * not affected by WcSigningBridge presence.
 *
 * Uses mocked PipelineContext with spy-based wcSigningBridge and approvalWorkflow.
 */

import { describe, it, expect, vi } from 'vitest';
import { WAIaaSError } from '@waiaas/core';
import { stage4Wait, type PipelineContext } from '../pipeline/stages.js';

// ---------------------------------------------------------------------------
// Minimal mock factories
// ---------------------------------------------------------------------------

function createMockApprovalWorkflow() {
  return {
    requestApproval: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    processExpiredApprovals: vi.fn(),
  };
}

function createMockWcSigningBridge() {
  return {
    requestSignature: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockDelayQueue() {
  return {
    queueDelay: vi.fn(),
    processExpired: vi.fn(),
  };
}

/**
 * Build a minimal PipelineContext for stage4Wait testing.
 * Only fields used by stage4Wait are populated.
 */
function buildCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    // Required fields (unused by stage4Wait but needed for type satisfaction)
    db: {} as any,
    adapter: {} as any,
    keyStore: {} as any,
    policyEngine: {} as any,
    masterPassword: 'test',
    walletId: 'test-wallet-001',
    wallet: {
      publicKey: 'pk-test',
      chain: 'ethereum',
      environment: 'testnet',
      defaultNetwork: 'ethereum-sepolia',
    },
    resolvedNetwork: 'ethereum-sepolia',
    request: { to: '0xRecipient', amount: '1000' } as any,
    txId: 'test-tx-001',
    // Overridable fields
    ...overrides,
  } as PipelineContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stage4Wait WC integration', () => {
  it('should call wcSigningBridge.requestSignature in APPROVAL tier', async () => {
    const mockApproval = createMockApprovalWorkflow();
    const mockBridge = createMockWcSigningBridge();

    const ctx = buildCtx({
      tier: 'APPROVAL',
      approvalWorkflow: mockApproval as any,
      wcSigningBridge: mockBridge as any,
    });

    try {
      await stage4Wait(ctx);
      expect.unreachable('stage4Wait should throw PIPELINE_HALTED');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('PIPELINE_HALTED');
    }

    // requestSignature should have been called
    expect(mockBridge.requestSignature).toHaveBeenCalledWith(
      'test-wallet-001',
      'test-tx-001',
      'ethereum',
    );
  });

  it('should call requestApproval before requestSignature', async () => {
    const callOrder: string[] = [];
    const mockApproval = createMockApprovalWorkflow();
    mockApproval.requestApproval.mockImplementation(() => {
      callOrder.push('requestApproval');
    });

    const mockBridge = createMockWcSigningBridge();
    mockBridge.requestSignature.mockImplementation(() => {
      callOrder.push('requestSignature');
      return Promise.resolve();
    });

    const ctx = buildCtx({
      tier: 'APPROVAL',
      approvalWorkflow: mockApproval as any,
      wcSigningBridge: mockBridge as any,
    });

    try {
      await stage4Wait(ctx);
    } catch {
      // PIPELINE_HALTED expected
    }

    expect(callOrder[0]).toBe('requestApproval');
    expect(callOrder[1]).toBe('requestSignature');
  });

  it('should not block pipeline when requestSignature is slow', async () => {
    const mockApproval = createMockApprovalWorkflow();

    // requestSignature takes 1 second -- but pipeline should not wait
    let resolveSlowRequest: () => void;
    const slowPromise = new Promise<void>((resolve) => {
      resolveSlowRequest = resolve;
    });
    const mockBridge = {
      requestSignature: vi.fn().mockReturnValue(slowPromise),
    };

    const ctx = buildCtx({
      tier: 'APPROVAL',
      approvalWorkflow: mockApproval as any,
      wcSigningBridge: mockBridge as any,
    });

    // stage4Wait should throw PIPELINE_HALTED immediately, not wait for slow request
    const start = Date.now();
    try {
      await stage4Wait(ctx);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('PIPELINE_HALTED');
    }
    const elapsed = Date.now() - start;

    // Pipeline should complete in well under 100ms (not waiting for 1s slow request)
    expect(elapsed).toBeLessThan(100);

    // Clean up the pending promise
    resolveSlowRequest!();
  });

  it('should work without wcSigningBridge (backward compatibility)', async () => {
    const mockApproval = createMockApprovalWorkflow();

    const ctx = buildCtx({
      tier: 'APPROVAL',
      approvalWorkflow: mockApproval as any,
      // wcSigningBridge is undefined (not provided)
    });

    try {
      await stage4Wait(ctx);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('PIPELINE_HALTED');
    }

    // requestApproval should still be called
    expect(mockApproval.requestApproval).toHaveBeenCalledWith('test-tx-001');
  });

  it('should not call requestSignature for INSTANT tier', async () => {
    const mockBridge = createMockWcSigningBridge();

    const ctx = buildCtx({
      tier: 'INSTANT',
      wcSigningBridge: mockBridge as any,
    });

    // INSTANT should return normally (no throw)
    await stage4Wait(ctx);

    expect(mockBridge.requestSignature).not.toHaveBeenCalled();
  });

  it('should not call requestSignature for DELAY tier', async () => {
    const mockBridge = createMockWcSigningBridge();
    const mockDelay = createMockDelayQueue();

    const ctx = buildCtx({
      tier: 'DELAY',
      delayQueue: mockDelay as any,
      wcSigningBridge: mockBridge as any,
    });

    try {
      await stage4Wait(ctx);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('PIPELINE_HALTED');
    }

    // Delay queue should be called, but NOT wcSigningBridge
    expect(mockDelay.queueDelay).toHaveBeenCalled();
    expect(mockBridge.requestSignature).not.toHaveBeenCalled();
  });

  it('should pass wallet.chain to requestSignature', async () => {
    const mockApproval = createMockApprovalWorkflow();
    const mockBridge = createMockWcSigningBridge();

    const ctx = buildCtx({
      tier: 'APPROVAL',
      approvalWorkflow: mockApproval as any,
      wcSigningBridge: mockBridge as any,
      wallet: {
        publicKey: 'pk-sol',
        chain: 'solana',
        environment: 'testnet',
        defaultNetwork: 'devnet',
      },
    });

    try {
      await stage4Wait(ctx);
    } catch {
      // PIPELINE_HALTED expected
    }

    // Third argument should be 'solana' (from wallet.chain)
    expect(mockBridge.requestSignature).toHaveBeenCalledWith(
      'test-wallet-001',
      'test-tx-001',
      'solana',
    );
  });
});
