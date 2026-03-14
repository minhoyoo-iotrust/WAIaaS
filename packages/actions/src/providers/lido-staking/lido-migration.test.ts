/**
 * Unit tests for Lido provider smallest-unit migration.
 *
 * Verifies that:
 * - Smallest-unit integer inputs (wei) pass through as BigInt
 * - Legacy decimal inputs trigger migrateAmount auto-conversion + deprecation warning
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LidoStakingActionProvider } from './index.js';
import type { ActionContext, ContractCallRequest } from '@waiaas/core';

const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const TEST_CONTEXT: ActionContext = {
  walletAddress: TEST_WALLET,
  walletId: 'test-wallet',
  chain: 'ethereum',
};

describe('Lido smallest-unit migration', () => {
  let provider: LidoStakingActionProvider;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    provider = new LidoStakingActionProvider();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('stake', () => {
    it('uses smallest-unit (wei) integer directly', async () => {
      const result = (await provider.resolve(
        'stake',
        { amount: '1000000000000000000' },
        TEST_CONTEXT,
      )) as ContractCallRequest;

      // value should be the wei amount string
      expect(result.value).toBe('1000000000000000000');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('auto-converts legacy decimal input with deprecation warning', async () => {
      const result = (await provider.resolve(
        'stake',
        { amount: '1.0' },
        TEST_CONTEXT,
      )) as ContractCallRequest;

      expect(result.value).toBe('1000000000000000000');
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]![0]).toContain('DEPRECATION');
    });
  });

  describe('unstake', () => {
    it('uses smallest-unit (wei) integer directly', async () => {
      const result = (await provider.resolve(
        'unstake',
        { amount: '500000000000000000' },
        TEST_CONTEXT,
      )) as ContractCallRequest[];

      // Should produce approve + requestWithdrawals (2 elements)
      expect(result).toHaveLength(2);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('auto-converts legacy decimal input', async () => {
      const result = (await provider.resolve(
        'unstake',
        { amount: '0.5' },
        TEST_CONTEXT,
      )) as ContractCallRequest[];

      expect(result).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]![0]).toContain('DEPRECATION');
    });
  });
});
