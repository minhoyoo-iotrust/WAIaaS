import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the stage functions
vi.mock('../../pipeline/stages.js', () => ({
  stage1Validate: vi.fn().mockResolvedValue(undefined),
  stage2Auth: vi.fn().mockResolvedValue(undefined),
  stage3Policy: vi.fn().mockResolvedValue(undefined),
  stageGasCondition: vi.fn().mockResolvedValue(undefined),
  stage4Wait: vi.fn().mockResolvedValue(undefined),
  stage5Execute: vi.fn().mockResolvedValue(undefined),
  stage6Confirm: vi.fn().mockResolvedValue(undefined),
}));

import { SyncPipelineExecutor } from '../../rpc-proxy/sync-pipeline.js';
import { WAIaaSError } from '@waiaas/core';
import {
  stage1Validate,
  stage2Auth,
  stage3Policy,
  stageGasCondition,
  stage4Wait,
  stage5Execute,
  stage6Confirm,
} from '../../pipeline/stages.js';

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    db: {},
    adapter: {},
    keyStore: {},
    policyEngine: {},
    masterPassword: 'test',
    walletId: 'w1',
    wallet: { publicKey: '0x1', chain: 'ethereum', environment: 'mainnet' },
    resolvedNetwork: 'ethereum-mainnet',
    request: { type: 'TRANSFER', to: '0x1', amount: '100', network: 'ethereum-mainnet' },
    txId: 'tx-1',
    tier: 'INSTANT',
    submitResult: { txHash: '0xabc123', receipt: null },
    ...overrides,
  } as any;
}

describe('SyncPipelineExecutor', () => {
  let completionWaiter: { waitForCompletion: ReturnType<typeof vi.fn> };
  let settingsService: { get: ReturnType<typeof vi.fn> };
  let executor: SyncPipelineExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    completionWaiter = { waitForCompletion: vi.fn().mockResolvedValue('0xwaited') };
    settingsService = { get: vi.fn().mockReturnValue(undefined) };
    executor = new SyncPipelineExecutor(completionWaiter as any, settingsService as any);
  });

  it('runs stage1-6 and returns txHash for INSTANT tier', async () => {
    const ctx = createMockCtx();
    const result = await executor.execute(ctx);

    expect(stage1Validate).toHaveBeenCalledWith(ctx);
    expect(stage2Auth).toHaveBeenCalledWith(ctx);
    expect(stage3Policy).toHaveBeenCalledWith(ctx);
    expect(stageGasCondition).toHaveBeenCalledWith(ctx);
    expect(stage4Wait).toHaveBeenCalledWith(ctx);
    expect(stage5Execute).toHaveBeenCalledWith(ctx);
    expect(stage6Confirm).toHaveBeenCalledWith(ctx);
    expect(result).toBe('0xabc123');
  });

  it('catches PIPELINE_HALTED and delegates to CompletionWaiter for DELAY tier', async () => {
    const ctx = createMockCtx({ tier: 'DELAY' });
    vi.mocked(stage4Wait).mockRejectedValueOnce(
      new WAIaaSError('PIPELINE_HALTED', { message: 'Halted for delay' }),
    );

    const result = await executor.execute(ctx);

    expect(completionWaiter.waitForCompletion).toHaveBeenCalledWith('tx-1', 300_000);
    expect(result).toBe('0xwaited');
    expect(stage5Execute).not.toHaveBeenCalled();
  });

  it('catches PIPELINE_HALTED and delegates to CompletionWaiter for APPROVAL tier', async () => {
    const ctx = createMockCtx({ tier: 'APPROVAL' });
    vi.mocked(stage4Wait).mockRejectedValueOnce(
      new WAIaaSError('PIPELINE_HALTED', { message: 'Halted for approval' }),
    );

    const result = await executor.execute(ctx);

    expect(completionWaiter.waitForCompletion).toHaveBeenCalledWith('tx-1', 600_000);
    expect(result).toBe('0xwaited');
  });

  it('uses custom DELAY timeout from settings', async () => {
    settingsService.get.mockImplementation((key: string) => {
      if (key === 'rpc_proxy.delay_timeout_seconds') return '120';
      return undefined;
    });
    const ctx = createMockCtx({ tier: 'DELAY' });
    vi.mocked(stage4Wait).mockRejectedValueOnce(
      new WAIaaSError('PIPELINE_HALTED'),
    );

    await executor.execute(ctx);

    expect(completionWaiter.waitForCompletion).toHaveBeenCalledWith('tx-1', 120_000);
  });

  it('uses custom APPROVAL timeout from settings', async () => {
    settingsService.get.mockImplementation((key: string) => {
      if (key === 'rpc_proxy.approval_timeout_seconds') return '900';
      return undefined;
    });
    const ctx = createMockCtx({ tier: 'APPROVAL' });
    vi.mocked(stage4Wait).mockRejectedValueOnce(
      new WAIaaSError('PIPELINE_HALTED'),
    );

    await executor.execute(ctx);

    expect(completionWaiter.waitForCompletion).toHaveBeenCalledWith('tx-1', 900_000);
  });

  it('re-throws non-PIPELINE_HALTED errors', async () => {
    vi.mocked(stage4Wait).mockRejectedValueOnce(new Error('Some other error'));

    const ctx = createMockCtx();
    await expect(executor.execute(ctx)).rejects.toThrow('Some other error');
  });

  it('sets source to rpc-proxy on context', async () => {
    const ctx = createMockCtx();
    await executor.execute(ctx);
    expect((ctx as any).source).toBe('rpc-proxy');
  });

  it('returns empty string when submitResult has no txHash', async () => {
    const ctx = createMockCtx({ submitResult: { receipt: null } });
    const result = await executor.execute(ctx);
    expect(result).toBe('');
  });
});
