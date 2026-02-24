/**
 * LidoStakingActionProvider unit tests.
 *
 * Pure ABI encoding tests -- no MSW needed (no external API calls).
 */
import { describe, it, expect } from 'vitest';
import { LidoStakingActionProvider } from '../providers/lido-staking/index.js';
import { LIDO_MAINNET_ADDRESSES } from '../providers/lido-staking/config.js';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: '0x1234567890123456789012345678901234567890',
  chain: 'ethereum',
  walletId: '00000000-0000-0000-0000-000000000001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LidoStakingActionProvider', () => {
  describe('stake resolve', () => {
    it('returns ContractCallRequest with ETH value and submit() calldata', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('stake', { amount: '1.0' }, CONTEXT);

      // Single element (not array -- registry normalizes)
      const req = result as { type: string; to: string; calldata?: string; value?: string };
      expect(req.type).toBe('CONTRACT_CALL');
      expect(req.to).toBe(LIDO_MAINNET_ADDRESSES.stethAddress);
      expect(req.calldata).toMatch(/^0xa1903eab/);
      // 1 ETH = 1000000000000000000 wei
      expect(req.value).toBe('1000000000000000000');
    });
  });

  describe('unstake resolve', () => {
    it('returns [approve, requestWithdrawals] array', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('unstake', { amount: '1.0' }, CONTEXT);

      expect(Array.isArray(result)).toBe(true);
      const arr = result as Array<{ type: string; to: string; calldata?: string; value?: string }>;
      expect(arr).toHaveLength(2);

      // Element 0: approve stETH to WithdrawalQueue
      expect(arr[0]!.type).toBe('CONTRACT_CALL');
      expect(arr[0]!.calldata).toMatch(/^0x095ea7b3/);
      expect(arr[0]!.value).toBe('0');

      // Element 1: requestWithdrawals
      expect(arr[1]!.type).toBe('CONTRACT_CALL');
      expect(arr[1]!.calldata).toMatch(/^0xd669a4e2/);
      expect(arr[1]!.value).toBe('0');
    });
  });

  describe('stake with decimal amount', () => {
    it('"1.5" ETH converts to correct wei (1500000000000000000)', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('stake', { amount: '1.5' }, CONTEXT);

      const req = result as { type: string; value?: string };
      expect(req.value).toBe('1500000000000000000');
    });
  });

  describe('zero amount throws', () => {
    it('amount "0" throws ChainError', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      await expect(
        provider.resolve('stake', { amount: '0' }, CONTEXT),
      ).rejects.toThrow('Amount must be greater than 0');
    });
  });

  describe('unknown action throws', () => {
    it('throws INVALID_INSTRUCTION for unknown action name', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      await expect(
        provider.resolve('unknown_action', { amount: '1.0' }, CONTEXT),
      ).rejects.toThrow('Unknown action');
    });
  });

  describe('metadata', () => {
    it('has correct name, chains, mcpExpose, and actions count', () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      expect(provider.metadata.name).toBe('lido_staking');
      expect(provider.metadata.chains).toEqual(['ethereum']);
      expect(provider.metadata.mcpExpose).toBe(true);
      expect(provider.metadata.requiresApiKey).toBe(false);
      expect(provider.metadata.requiredApis).toEqual([]);
      expect(provider.metadata.version).toBe('1.0.0');
      expect(provider.actions).toHaveLength(2);

      const [stake, unstake] = provider.actions;
      expect(stake!.name).toBe('stake');
      expect(stake!.riskLevel).toBe('medium');
      expect(stake!.defaultTier).toBe('DELAY');
      expect(unstake!.name).toBe('unstake');
      expect(unstake!.riskLevel).toBe('medium');
      expect(unstake!.defaultTier).toBe('DELAY');
    });
  });

  describe('unstake approve targets stETH contract', () => {
    it('approve ContractCallRequest.to equals stethAddress', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('unstake', { amount: '2.0' }, CONTEXT);

      const arr = result as Array<{ to: string }>;
      expect(arr[0]!.to).toBe(LIDO_MAINNET_ADDRESSES.stethAddress);
    });
  });

  describe('unstake requestWithdrawals includes owner address', () => {
    it('encoded calldata contains walletAddress', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('unstake', { amount: '1.0' }, CONTEXT);

      const arr = result as Array<{ calldata?: string }>;
      // The owner address (without 0x prefix, lowercased) should appear in calldata
      const ownerHex = CONTEXT.walletAddress.slice(2).toLowerCase();
      expect(arr[1]!.calldata).toContain(ownerHex);
    });
  });

  describe('stake small decimal amounts', () => {
    it('"0.001" ETH -> 1000000000000000 wei', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('stake', { amount: '0.001' }, CONTEXT);

      const req = result as { value?: string };
      expect(req.value).toBe('1000000000000000');
    });
  });

  describe('unstake requestWithdrawals targets WithdrawalQueue', () => {
    it('requestWithdrawals ContractCallRequest.to equals withdrawalQueueAddress', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('unstake', { amount: '1.0' }, CONTEXT);

      const arr = result as Array<{ to: string }>;
      expect(arr[1]!.to).toBe(LIDO_MAINNET_ADDRESSES.withdrawalQueueAddress);
    });
  });
});
