/**
 * Unit tests for Kamino provider smallest-unit migration.
 *
 * Verifies that:
 * - Smallest-unit integer inputs pass through as BigInt
 * - Legacy decimal inputs trigger migrateAmount auto-conversion + deprecation warning
 * - 'max' keyword works for repay/withdraw
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KaminoLendingProvider } from './index.js';
import type { IKaminoSdkWrapper, KaminoInstruction } from './kamino-sdk-wrapper.js';
import type { ActionContext } from '@waiaas/core';

const TEST_ASSET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
const TEST_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const TEST_CONTEXT: ActionContext = {
  walletAddress: TEST_WALLET,
  walletId: 'test-wallet',
  chain: 'solana',
};

/** Mock SDK wrapper that captures the amount passed to each method. */
class CapturingSdkWrapper implements IKaminoSdkWrapper {
  lastAmount: bigint | 'max' = 0n;

  private fakeInstruction(): KaminoInstruction[] {
    return [
      {
        programId: 'KLend2g3cP87ber8Sjf2DAcpRPfQwMsQZCR2jDg5mez',
        instructionData: Buffer.from([0]).toString('base64'),
        accounts: [],
      },
    ];
  }

  async buildSupplyInstruction(params: { amount: bigint }): Promise<KaminoInstruction[]> {
    this.lastAmount = params.amount;
    return this.fakeInstruction();
  }

  async buildBorrowInstruction(params: { amount: bigint }): Promise<KaminoInstruction[]> {
    this.lastAmount = params.amount;
    return this.fakeInstruction();
  }

  async buildRepayInstruction(params: { amount: bigint | 'max' }): Promise<KaminoInstruction[]> {
    this.lastAmount = params.amount;
    return this.fakeInstruction();
  }

  async buildWithdrawInstruction(params: { amount: bigint | 'max' }): Promise<KaminoInstruction[]> {
    this.lastAmount = params.amount;
    return this.fakeInstruction();
  }

  async getObligation(): Promise<null> {
    return null;
  }

  async getReserves(): Promise<never[]> {
    return [];
  }
}

describe('Kamino smallest-unit migration', () => {
  let provider: KaminoLendingProvider;
  let sdk: CapturingSdkWrapper;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sdk = new CapturingSdkWrapper();
    provider = new KaminoLendingProvider(undefined, sdk);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('kamino_supply', () => {
    it('uses smallest-unit integer directly', async () => {
      await provider.resolve('kamino_supply', { asset: TEST_ASSET, amount: '1000000' }, TEST_CONTEXT);
      expect(sdk.lastAmount).toBe(1000000n);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('auto-converts legacy decimal input with deprecation warning', async () => {
      await provider.resolve('kamino_supply', { asset: TEST_ASSET, amount: '100.5' }, TEST_CONTEXT);
      expect(sdk.lastAmount).toBe(100_500000n);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]![0]).toContain('DEPRECATION');
    });
  });

  describe('kamino_borrow', () => {
    it('uses smallest-unit integer directly', async () => {
      await provider.resolve('kamino_borrow', { asset: TEST_ASSET, amount: '500000' }, TEST_CONTEXT);
      expect(sdk.lastAmount).toBe(500000n);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('kamino_repay', () => {
    it('passes max keyword to SDK wrapper', async () => {
      await provider.resolve('kamino_repay', { asset: TEST_ASSET, amount: 'max' }, TEST_CONTEXT);
      expect(sdk.lastAmount).toBe('max');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('uses smallest-unit integer directly for non-max', async () => {
      await provider.resolve('kamino_repay', { asset: TEST_ASSET, amount: '1000000' }, TEST_CONTEXT);
      expect(sdk.lastAmount).toBe(1000000n);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('kamino_withdraw', () => {
    it('passes max keyword to SDK wrapper', async () => {
      await provider.resolve('kamino_withdraw', { asset: TEST_ASSET, amount: 'max' }, TEST_CONTEXT);
      expect(sdk.lastAmount).toBe('max');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
