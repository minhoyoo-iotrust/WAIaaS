/**
 * LidoStakingActionProvider supplementary unit tests.
 *
 * Focuses on paths not covered by existing lido-staking.test.ts:
 * - humanAmount + decimals conversion for stake/unstake
 * - humanAmount without decimals error
 * - network parameter for resolve (network-specific addresses)
 */
import { describe, it, expect } from 'vitest';
import { LidoStakingActionProvider } from '../index.js';
import { LIDO_MAINNET_ADDRESSES } from '../config.js';
import type { ActionContext, ContractCallRequest } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: '0x1234567890123456789012345678901234567890',
  chain: 'ethereum',
  walletId: '00000000-0000-0000-0000-000000000001',
};

// ---------------------------------------------------------------------------
// humanAmount conversion tests
// ---------------------------------------------------------------------------

describe('LidoStakingActionProvider - humanAmount conversion', () => {
  it('stake: humanAmount="2.5" with decimals=18 converts to 2500000000000000000 wei', async () => {
    const provider = new LidoStakingActionProvider({ enabled: true });
    const result = await provider.resolve('stake', {
      humanAmount: '2.5',
      decimals: 18,
    }, CONTEXT);

    const req = result as { type: string; value?: string };
    expect(req.type).toBe('CONTRACT_CALL');
    expect(req.value).toBe('2500000000000000000');
  });

  it('stake: humanAmount="0.01" with decimals=18 converts to 10000000000000000 wei', async () => {
    const provider = new LidoStakingActionProvider({ enabled: true });
    const result = await provider.resolve('stake', {
      humanAmount: '0.01',
      decimals: 18,
    }, CONTEXT);

    const req = result as { value?: string };
    expect(req.value).toBe('10000000000000000');
  });

  it('unstake: humanAmount="1.0" with decimals=18 returns [approve, requestWithdrawals]', async () => {
    const provider = new LidoStakingActionProvider({ enabled: true });
    const result = await provider.resolve('unstake', {
      humanAmount: '1.0',
      decimals: 18,
    }, CONTEXT);

    expect(Array.isArray(result)).toBe(true);
    const arr = result as ContractCallRequest[];
    expect(arr).toHaveLength(2);
    expect(arr[0]!.calldata).toMatch(/^0x095ea7b3/);
    expect(arr[1]!.calldata).toMatch(/^0xd669a4e2/);
  });

  it('stake: throws when humanAmount given without decimals', async () => {
    const provider = new LidoStakingActionProvider({ enabled: true });
    await expect(
      provider.resolve('stake', { humanAmount: '1.0' }, CONTEXT),
    ).rejects.toThrow('decimals');
  });

  it('unstake: throws when humanAmount given without decimals', async () => {
    const provider = new LidoStakingActionProvider({ enabled: true });
    await expect(
      provider.resolve('unstake', { humanAmount: '1.0' }, CONTEXT),
    ).rejects.toThrow('decimals');
  });

  it('stake: throws when neither amount nor humanAmount provided', async () => {
    const provider = new LidoStakingActionProvider({ enabled: true });
    await expect(
      provider.resolve('stake', {}, CONTEXT),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Network parameter tests
// ---------------------------------------------------------------------------

describe('LidoStakingActionProvider - network parameter', () => {
  it('stake with network=ethereum-mainnet uses mainnet stETH address', async () => {
    const provider = new LidoStakingActionProvider({ enabled: true });
    const result = await provider.resolve('stake', {
      amount: '1.0',
      network: 'ethereum-mainnet',
    }, CONTEXT);

    const req = result as { to: string };
    expect(req.to).toBe(LIDO_MAINNET_ADDRESSES.stethAddress);
  });

  it('unstake targets correct withdrawalQueue and stETH addresses on mainnet', async () => {
    const provider = new LidoStakingActionProvider({ enabled: true });
    const result = await provider.resolve('unstake', {
      amount: '1.0',
    }, CONTEXT);

    const arr = result as Array<{ to: string }>;
    expect(arr[0]!.to).toBe(LIDO_MAINNET_ADDRESSES.stethAddress);
    expect(arr[1]!.to).toBe(LIDO_MAINNET_ADDRESSES.withdrawalQueueAddress);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('LidoStakingActionProvider - edge cases', () => {
  it('negative amount throws', async () => {
    const provider = new LidoStakingActionProvider({ enabled: true });
    await expect(
      provider.resolve('stake', { amount: '-1.0' }, CONTEXT),
    ).rejects.toThrow();
  });

  it('very large amount is faithfully encoded', async () => {
    const provider = new LidoStakingActionProvider({ enabled: true });
    const result = await provider.resolve('stake', { amount: '1000.0' }, CONTEXT);
    const req = result as { value?: string };
    expect(req.value).toBe('1000000000000000000000');
  });
});
