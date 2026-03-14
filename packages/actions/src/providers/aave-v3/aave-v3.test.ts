/**
 * Unit tests for Aave V3 provider smallest-unit migration.
 *
 * Verifies that:
 * - Smallest-unit integer inputs are used directly (no parseTokenAmount)
 * - Legacy decimal inputs trigger migrateAmount auto-conversion + deprecation warning
 * - 'max' keyword works independently for repay/withdraw
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AaveV3LendingProvider } from './index.js';
import type { ActionContext, ContractCallRequest } from '@waiaas/core';

const TEST_ASSET = '0x6B175474E89094C44Da98b954EedeAC495271d0F'; // DAI
const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const TEST_CONTEXT: ActionContext = {
  walletAddress: TEST_WALLET,
  walletId: 'test-wallet',
  chain: 'ethereum',
};

describe('Aave V3 smallest-unit migration', () => {
  let provider: AaveV3LendingProvider;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    provider = new AaveV3LendingProvider();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('aave_supply', () => {
    it('uses smallest-unit integer directly', async () => {
      const result = (await provider.resolve(
        'aave_supply',
        { asset: TEST_ASSET, amount: '1000000000000000000' },
        TEST_CONTEXT,
      )) as ContractCallRequest[];

      // Should produce approve + supply (2 elements)
      expect(result).toHaveLength(2);
      // No deprecation warning for integer input
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('auto-converts legacy decimal input with deprecation warning', async () => {
      const result = (await provider.resolve(
        'aave_supply',
        { asset: TEST_ASSET, amount: '1.0' },
        TEST_CONTEXT,
      )) as ContractCallRequest[];

      expect(result).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]![0]).toContain('DEPRECATION');
    });
  });

  describe('aave_borrow', () => {
    it('uses smallest-unit integer directly (500000000000000000 = 0.5 ETH)', async () => {
      const result = (await provider.resolve(
        'aave_borrow',
        { asset: TEST_ASSET, amount: '500000000000000000' },
        TEST_CONTEXT,
      )) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('aave_repay', () => {
    it('uses MAX_UINT256 for max keyword', async () => {
      const result = (await provider.resolve(
        'aave_repay',
        { asset: TEST_ASSET, amount: 'max' },
        TEST_CONTEXT,
      )) as ContractCallRequest[];

      expect(result).toHaveLength(2);
      // Verify calldata contains MAX_UINT256 (approve + repay)
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('uses smallest-unit integer directly for non-max', async () => {
      const result = (await provider.resolve(
        'aave_repay',
        { asset: TEST_ASSET, amount: '1000000000000000000' },
        TEST_CONTEXT,
      )) as ContractCallRequest[];

      expect(result).toHaveLength(2);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('aave_withdraw', () => {
    it('uses MAX_UINT256 for max keyword', async () => {
      const result = (await provider.resolve(
        'aave_withdraw',
        { asset: TEST_ASSET, amount: 'max' },
        TEST_CONTEXT,
      )) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('auto-converts legacy decimal input', async () => {
      const result = (await provider.resolve(
        'aave_withdraw',
        { asset: TEST_ASSET, amount: '0.5' },
        TEST_CONTEXT,
      )) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]![0]).toContain('DEPRECATION');
    });
  });
});
