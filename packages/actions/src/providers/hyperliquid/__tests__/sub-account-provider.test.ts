/**
 * Tests for HyperliquidSubAccountProvider.
 *
 * Verifies:
 * - metadata and actions definitions
 * - getSpendingAmount for each action
 * - resolve() delegates to service correctly
 * - Unknown action throws
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyperliquidSubAccountProvider } from '../sub-account-provider.js';
import type { HyperliquidSubAccountService } from '../sub-account-service.js';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

function createMockService(): HyperliquidSubAccountService {
  return {
    createSubAccount: vi.fn(),
    transfer: vi.fn(),
    listSubAccounts: vi.fn(),
    getSubAccountPositions: vi.fn(),
  } as unknown as HyperliquidSubAccountService;
}

function createContext(privateKey = '0xabcd'): ActionContext {
  return {
    privateKey,
    walletId: 'wlt-1',
    chain: 'ethereum',
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  } as unknown as ActionContext;
}

describe('HyperliquidSubAccountProvider', () => {
  let service: ReturnType<typeof createMockService>;
  let provider: HyperliquidSubAccountProvider;

  beforeEach(() => {
    service = createMockService();
    provider = new HyperliquidSubAccountProvider(service);
  });

  // -----------------------------------------------------------------------
  // metadata & actions
  // -----------------------------------------------------------------------

  describe('metadata', () => {
    it('has correct provider name and metadata', () => {
      expect(provider.metadata.name).toBe('hyperliquid_sub');
      expect(provider.metadata.mcpExpose).toBe(true);
      expect(provider.metadata.requiresSigningKey).toBe(true);
    });

    it('exposes 2 actions', () => {
      expect(provider.actions).toHaveLength(2);
      const names = provider.actions.map(a => a.name);
      expect(names).toContain('hl_create_sub_account');
      expect(names).toContain('hl_sub_transfer');
    });
  });

  // -----------------------------------------------------------------------
  // getSpendingAmount
  // -----------------------------------------------------------------------

  describe('getSpendingAmount()', () => {
    it('returns 0 for hl_create_sub_account', () => {
      const result = provider.getSpendingAmount('hl_create_sub_account', {});
      expect(result).toEqual({ amount: 0n, asset: 'USDC' });
    });

    it('parses amount for hl_sub_transfer', () => {
      const result = provider.getSpendingAmount('hl_sub_transfer', { amount: '100.5' });
      expect(result.amount).toBe(100500000n);
      expect(result.asset).toBe('USDC');
    });

    it('handles integer amount for hl_sub_transfer', () => {
      const result = provider.getSpendingAmount('hl_sub_transfer', { amount: '50' });
      expect(result.amount).toBe(50000000n);
    });

    it('returns 0 for unknown action', () => {
      const result = provider.getSpendingAmount('unknown', {});
      expect(result).toEqual({ amount: 0n, asset: 'USDC' });
    });

    it('handles missing amount gracefully', () => {
      const result = provider.getSpendingAmount('hl_sub_transfer', {});
      expect(result.amount).toBe(0n);
    });
  });

  // -----------------------------------------------------------------------
  // resolve()
  // -----------------------------------------------------------------------

  describe('resolve()', () => {
    it('creates sub-account via service', async () => {
      (service.createSubAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
        subAccountAddress: '0x1234567890abcdef',
      });

      const result = await provider.resolve(
        'hl_create_sub_account',
        { name: 'my-sub' },
        createContext(),
      );

      expect(service.createSubAccount).toHaveBeenCalledWith('my-sub', '0xabcd');
      expect(result.__apiDirect).toBe(true);
      expect(result.status).toBe('success');
      expect(result.provider).toBe('hyperliquid_sub');
      expect(result.action).toBe('hl_create_sub_account');
      expect(result.data).toEqual({ subAccountAddress: '0x1234567890abcdef' });
    });

    it('transfers USDC via service (deposit)', async () => {
      (service.transfer as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 'ok',
      });

      const result = await provider.resolve(
        'hl_sub_transfer',
        { subAccount: '0xsub', amount: '100', isDeposit: true },
        createContext(),
      );

      expect(service.transfer).toHaveBeenCalledWith({
        subAccountAddress: '0xsub',
        amount: '100',
        isDeposit: true,
        privateKey: '0xabcd',
      });
      expect(result.__apiDirect).toBe(true);
      expect(result.status).toBe('success');
      expect(result.metadata).toMatchObject({
        direction: 'master_to_sub',
        amount: '100',
      });
    });

    it('transfers USDC via service (withdrawal)', async () => {
      (service.transfer as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 'ok',
      });

      const result = await provider.resolve(
        'hl_sub_transfer',
        { subAccount: '0xsub', amount: '50', isDeposit: false },
        createContext(),
      );

      expect(result.metadata).toMatchObject({
        direction: 'sub_to_master',
      });
    });

    it('returns partial status when service returns non-ok', async () => {
      (service.transfer as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 'error',
        message: 'insufficient funds',
      });

      const result = await provider.resolve(
        'hl_sub_transfer',
        { subAccount: '0xsub', amount: '999999', isDeposit: true },
        createContext(),
      );

      expect(result.status).toBe('partial');
    });

    it('throws for unknown action', async () => {
      await expect(
        provider.resolve('unknown_action', {}, createContext()),
      ).rejects.toThrow('Unknown action: unknown_action');
    });
  });
});
