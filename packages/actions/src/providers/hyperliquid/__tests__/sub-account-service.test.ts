/**
 * Tests for HyperliquidSubAccountService.
 *
 * Plan 351-01 Task 1: Sub-account service unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyperliquidSubAccountService } from '../sub-account-service.js';
import { HyperliquidSigner } from '../signer.js';
import { ChainError } from '@waiaas/core';
import type { Hex } from 'viem';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExchange = vi.fn();
const mockInfo = vi.fn();
const mockClient = {
  exchange: mockExchange,
  info: mockInfo,
} as any;

const mockGetSubAccounts = vi.fn();
const mockGetPositions = vi.fn();
const mockGetSubAccountPositions = vi.fn();
const mockMarketData = {
  getSubAccounts: mockGetSubAccounts,
  getPositions: mockGetPositions,
  getSubAccountPositions: mockGetSubAccountPositions,
} as any;

const TEST_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;
const TEST_WALLET = '0xabc1230000000000000000000000000000000001' as Hex;
const TEST_SUB_ADDR = '0xdef4560000000000000000000000000000000002' as Hex;
const MOCK_SIGNATURE = { r: '0x01' as Hex, s: '0x02' as Hex, v: 27 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HyperliquidSubAccountService', () => {
  let service: HyperliquidSubAccountService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HyperliquidSigner, 'signUserSignedAction').mockResolvedValue(MOCK_SIGNATURE);
    service = new HyperliquidSubAccountService(mockClient, mockMarketData, true);
  });

  // ── createSubAccount ──────────────────────────────────────────────────

  describe('createSubAccount', () => {
    it('signs CreateSubAccount and calls client.exchange', async () => {
      mockExchange.mockResolvedValue({
        status: 'ok',
        response: {
          type: 'default',
          data: { subAccountUser: '0xNewSub123' },
        },
      });

      const result = await service.createSubAccount('Trend Following', TEST_PRIVATE_KEY);

      expect(HyperliquidSigner.signUserSignedAction).toHaveBeenCalledWith(
        'CreateSubAccount',
        expect.objectContaining({
          hyperliquidChain: 'Mainnet',
          name: 'Trend Following',
          time: expect.any(Number),
        }),
        true,
        TEST_PRIVATE_KEY,
      );

      expect(mockExchange).toHaveBeenCalledWith({
        action: { type: 'createSubAccount', name: 'Trend Following' },
        nonce: expect.any(Number),
        signature: MOCK_SIGNATURE,
      });

      expect(result.subAccountAddress).toBe('0xNewSub123');
    });

    it('uses Testnet chain for non-mainnet', async () => {
      const testnetService = new HyperliquidSubAccountService(mockClient, mockMarketData, false);
      mockExchange.mockResolvedValue({
        status: 'ok',
        response: { type: 'default', data: { subAccountUser: '0xSub' } },
      });

      await testnetService.createSubAccount('Test', TEST_PRIVATE_KEY);

      expect(HyperliquidSigner.signUserSignedAction).toHaveBeenCalledWith(
        'CreateSubAccount',
        expect.objectContaining({ hyperliquidChain: 'Testnet' }),
        false,
        TEST_PRIVATE_KEY,
      );
    });

    it('wraps exchange errors in ChainError', async () => {
      mockExchange.mockRejectedValue(new Error('network failure'));

      await expect(
        service.createSubAccount('Fail', TEST_PRIVATE_KEY),
      ).rejects.toThrow(ChainError);
    });

    it('propagates existing ChainError unchanged', async () => {
      const chainErr = new ChainError('ACTION_RATE_LIMITED', 'HYPERLIQUID', {
        message: 'rate limited',
      });
      mockExchange.mockRejectedValue(chainErr);

      await expect(
        service.createSubAccount('Fail', TEST_PRIVATE_KEY),
      ).rejects.toBe(chainErr);
    });
  });

  // ── transfer ──────────────────────────────────────────────────────────

  describe('transfer', () => {
    it('transfers master -> sub (isDeposit=true) with correct USD conversion', async () => {
      mockExchange.mockResolvedValue({ status: 'ok' });

      await service.transfer({
        subAccountAddress: TEST_SUB_ADDR,
        amount: '1000.50',
        isDeposit: true,
        privateKey: TEST_PRIVATE_KEY,
      });

      expect(HyperliquidSigner.signUserSignedAction).toHaveBeenCalledWith(
        'SubAccountTransfer',
        expect.objectContaining({
          hyperliquidChain: 'Mainnet',
          subAccountUser: TEST_SUB_ADDR,
          isDeposit: true,
          usd: 1000500000, // 1000.50 * 1e6
          time: expect.any(Number),
        }),
        true,
        TEST_PRIVATE_KEY,
      );

      expect(mockExchange).toHaveBeenCalledWith({
        action: {
          type: 'subAccountTransfer',
          subAccountUser: TEST_SUB_ADDR,
          isDeposit: true,
          amount: 1000500000,
        },
        nonce: expect.any(Number),
        signature: MOCK_SIGNATURE,
      });
    });

    it('transfers sub -> master (isDeposit=false)', async () => {
      mockExchange.mockResolvedValue({ status: 'ok' });

      await service.transfer({
        subAccountAddress: TEST_SUB_ADDR,
        amount: '500',
        isDeposit: false,
        privateKey: TEST_PRIVATE_KEY,
      });

      expect(HyperliquidSigner.signUserSignedAction).toHaveBeenCalledWith(
        'SubAccountTransfer',
        expect.objectContaining({
          isDeposit: false,
          usd: 500000000, // 500 * 1e6
        }),
        true,
        TEST_PRIVATE_KEY,
      );
    });

    it('wraps exchange errors in ChainError', async () => {
      mockExchange.mockRejectedValue(new Error('timeout'));

      await expect(
        service.transfer({
          subAccountAddress: TEST_SUB_ADDR,
          amount: '100',
          isDeposit: true,
          privateKey: TEST_PRIVATE_KEY,
        }),
      ).rejects.toThrow(ChainError);
    });
  });

  // ── listSubAccounts ───────────────────────────────────────────────────

  describe('listSubAccounts', () => {
    it('delegates to marketData.getSubAccounts', async () => {
      const mockSubs = [
        { subAccountUser: '0xSub1', name: 'Alpha', master: TEST_WALLET },
        { subAccountUser: '0xSub2', name: 'Beta', master: TEST_WALLET },
      ];
      mockGetSubAccounts.mockResolvedValue(mockSubs);

      const result = await service.listSubAccounts(TEST_WALLET);

      expect(mockGetSubAccounts).toHaveBeenCalledWith(TEST_WALLET);
      expect(result).toEqual(mockSubs);
      expect(result).toHaveLength(2);
    });
  });

  // ── getSubAccountPositions ────────────────────────────────────────────

  describe('getSubAccountPositions', () => {
    it('delegates to marketData.getSubAccountPositions', async () => {
      const mockPositions = [
        { coin: 'ETH', szi: '1.5', entryPx: '2000' },
        { coin: 'BTC', szi: '-0.1', entryPx: '60000' },
      ];
      mockGetSubAccountPositions.mockResolvedValue(mockPositions);

      const result = await service.getSubAccountPositions(TEST_WALLET, TEST_SUB_ADDR);

      expect(mockGetSubAccountPositions).toHaveBeenCalledWith(TEST_WALLET, TEST_SUB_ADDR);
      expect(result).toEqual(mockPositions);
      expect(result).toHaveLength(2);
    });
  });
});
