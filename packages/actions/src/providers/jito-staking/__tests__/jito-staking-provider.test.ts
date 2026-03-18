/**
 * JitoStakingActionProvider supplementary unit tests.
 *
 * Focuses on paths not covered by existing jito-staking.test.ts:
 * - humanAmount + decimals conversion
 * - Minimum deposit validation (JITO_MIN_DEPOSIT_LAMPORTS)
 * - humanAmount without decimals error
 */
import { describe, it, expect } from 'vitest';
import { JitoStakingActionProvider } from '../index.js';
import { JITO_MIN_DEPOSIT_SOL } from '../config.js';
import type { ActionContext, ContractCallRequest } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: 'So11111111111111111111111111111111111111112',
  chain: 'solana',
  walletId: '00000000-0000-0000-0000-000000000001',
};

// ---------------------------------------------------------------------------
// humanAmount conversion tests
// ---------------------------------------------------------------------------

describe('JitoStakingActionProvider - humanAmount conversion', () => {
  it('stake: humanAmount="2.0" with decimals=9 converts to 2000000000 lamports', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true });
    const result = await provider.resolve('stake', {
      humanAmount: '2.0',
      decimals: 9,
    }, CONTEXT);

    const req = result as ContractCallRequest;
    expect(req.type).toBe('CONTRACT_CALL');
    // Verify the value field carries the lamport amount
    expect(req.value).toBe('2000000000');
  });

  it('unstake: humanAmount="1.0" with decimals=9 converts to 1000000000 lamports', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true });
    const result = await provider.resolve('unstake', {
      humanAmount: '1.0',
      decimals: 9,
    }, CONTEXT);

    const req = result as ContractCallRequest;
    expect(req.type).toBe('CONTRACT_CALL');
  });

  it('stake: throws when humanAmount given without decimals', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true });
    await expect(
      provider.resolve('stake', { humanAmount: '2.0' }, CONTEXT),
    ).rejects.toThrow('decimals');
  });

  it('unstake: throws when humanAmount given without decimals', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true });
    await expect(
      provider.resolve('unstake', { humanAmount: '1.0' }, CONTEXT),
    ).rejects.toThrow('decimals');
  });

  it('stake: throws when neither amount nor humanAmount provided', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true });
    await expect(
      provider.resolve('stake', {}, CONTEXT),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Minimum deposit validation tests
// ---------------------------------------------------------------------------

describe('JitoStakingActionProvider - minimum deposit', () => {
  it('stake below minimum (0.01 SOL = 10000000 lamports) throws with minimum message', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true });
    await expect(
      provider.resolve('stake', { amount: '10000000' }, CONTEXT),
    ).rejects.toThrow(`Minimum Jito stake deposit is ${JITO_MIN_DEPOSIT_SOL} SOL`);
  });

  it('stake at exact minimum (0.05 SOL = 50000000 lamports) succeeds', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true });
    const result = await provider.resolve('stake', { amount: '50000000' }, CONTEXT);
    const req = result as ContractCallRequest;
    expect(req.type).toBe('CONTRACT_CALL');
  });

  it('stake above minimum (1.0 SOL) succeeds', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true });
    const result = await provider.resolve('stake', { amount: '1000000000' }, CONTEXT);
    const req = result as ContractCallRequest;
    expect(req.type).toBe('CONTRACT_CALL');
  });

  it('humanAmount stake below minimum throws', async () => {
    const provider = new JitoStakingActionProvider({ enabled: true });
    await expect(
      provider.resolve('stake', { humanAmount: '0.01', decimals: 9 }, CONTEXT),
    ).rejects.toThrow('Minimum');
  });
});
