/**
 * Unit tests for Jito provider smallest-unit migration.
 *
 * Verifies that:
 * - Smallest-unit integer inputs (lamports) pass through as BigInt
 * - Legacy decimal inputs trigger migrateAmount auto-conversion + deprecation warning
 * - JITO_MIN_DEPOSIT_LAMPORTS check works correctly with smallest-unit input
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JitoStakingActionProvider } from './index.js';
import { JITO_MIN_DEPOSIT_LAMPORTS } from './config.js';
import type { ActionContext } from '@waiaas/core';

const TEST_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const TEST_CONTEXT: ActionContext = {
  walletAddress: TEST_WALLET,
  walletId: 'test-wallet',
  chain: 'solana',
};

describe('Jito smallest-unit migration', () => {
  let provider: JitoStakingActionProvider;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    provider = new JitoStakingActionProvider();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('stake', () => {
    it('uses smallest-unit (lamports) integer directly', async () => {
      const result = await provider.resolve(
        'stake',
        { amount: '1500000000' }, // 1.5 SOL in lamports
        TEST_CONTEXT,
      );

      expect(result.value).toBe('1500000000');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('auto-converts legacy decimal input with deprecation warning', async () => {
      const result = await provider.resolve(
        'stake',
        { amount: '1.5' },
        TEST_CONTEXT,
      );

      expect(result.value).toBe('1500000000');
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]![0]).toContain('DEPRECATION');
    });

    it('rejects amount below minimum deposit', async () => {
      const belowMin = (JITO_MIN_DEPOSIT_LAMPORTS - 1n).toString();
      await expect(
        provider.resolve('stake', { amount: belowMin }, TEST_CONTEXT),
      ).rejects.toThrow(/Minimum Jito stake deposit/);
    });
  });

  describe('unstake', () => {
    it('uses smallest-unit (lamports) integer directly', async () => {
      const result = await provider.resolve(
        'unstake',
        { amount: '1000000000' }, // 1 SOL in lamports
        TEST_CONTEXT,
      );

      expect(result.type).toBe('CONTRACT_CALL');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
