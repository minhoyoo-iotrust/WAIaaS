import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveTokenFromAssetId } from '../api/middleware/resolve-asset.js';
import { WAIaaSError } from '@waiaas/core';

// Mock TokenRegistryService
function createMockRegistry(tokens: Array<{ address: string; decimals: number; symbol: string; name: string }> = []) {
  return {
    getTokensForNetwork: vi.fn().mockResolvedValue(
      tokens.map((t) => ({ ...t, source: 'builtin' as const, assetId: null })),
    ),
  } as any;
}

describe('resolveTokenFromAssetId', () => {
  const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const USDC_ASSET_ID = `eip155:1/erc20:${USDC_ADDRESS}`;

  const registryWithUSDC = () =>
    createMockRegistry([
      { address: USDC_ADDRESS, decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    ]);

  describe('no assetId (passthrough)', () => {
    it('returns token and network unchanged when assetId is absent', async () => {
      const token = { address: '0xabc', decimals: 18, symbol: 'TKN' };
      const result = await resolveTokenFromAssetId(token, 'ethereum-mainnet', createMockRegistry());
      expect(result.token.address).toBe('0xabc');
      expect(result.token.decimals).toBe(18);
      expect(result.token.symbol).toBe('TKN');
      expect(result.network).toBe('ethereum-mainnet');
    });
  });

  describe('assetId with registry match', () => {
    it('resolves address/decimals/symbol from registry', async () => {
      const token = { assetId: USDC_ASSET_ID };
      const result = await resolveTokenFromAssetId(token, undefined, registryWithUSDC());
      expect(result.token.address).toBe(USDC_ADDRESS);
      expect(result.token.decimals).toBe(6);
      expect(result.token.symbol).toBe('USDC');
      expect(result.network).toBe('ethereum-mainnet');
    });

    it('infers network from assetId when network is undefined', async () => {
      const token = { assetId: USDC_ASSET_ID };
      const result = await resolveTokenFromAssetId(token, undefined, registryWithUSDC());
      expect(result.network).toBe('ethereum-mainnet');
    });

    it('keeps existing network when it matches assetId network', async () => {
      const token = { assetId: USDC_ASSET_ID };
      const result = await resolveTokenFromAssetId(token, 'ethereum-mainnet', registryWithUSDC());
      expect(result.network).toBe('ethereum-mainnet');
    });
  });

  describe('assetId with registry miss', () => {
    it('extracts address from assetId, leaves decimals/symbol undefined', async () => {
      const token = { assetId: 'eip155:1/erc20:0xunknownaddresshere1234567890abcdef12345678' };
      const result = await resolveTokenFromAssetId(token, undefined, createMockRegistry());
      expect(result.token.address).toBe('0xunknownaddresshere1234567890abcdef12345678');
      expect(result.token.decimals).toBeUndefined();
      expect(result.token.symbol).toBeUndefined();
    });
  });

  describe('network mismatch', () => {
    it('throws VALIDATION_ERROR when assetId network differs from request network', async () => {
      const token = { assetId: USDC_ASSET_ID }; // eip155:1 = ethereum-mainnet
      await expect(
        resolveTokenFromAssetId(token, 'polygon-mainnet', registryWithUSDC()),
      ).rejects.toThrow(WAIaaSError);

      try {
        await resolveTokenFromAssetId(token, 'polygon-mainnet', registryWithUSDC());
      } catch (e: any) {
        expect(e.code).toBe('ACTION_VALIDATION_FAILED');
        expect(e.message).toContain('network mismatch');
      }
    });
  });

  describe('address cross-validation', () => {
    it('allows matching address (case-insensitive)', async () => {
      const token = {
        assetId: USDC_ASSET_ID,
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // checksummed
      };
      const result = await resolveTokenFromAssetId(token, 'ethereum-mainnet', registryWithUSDC());
      expect(result.token.decimals).toBe(6);
    });

    it('throws on address mismatch', async () => {
      const token = {
        assetId: USDC_ASSET_ID,
        address: '0x1111111111111111111111111111111111111111',
      };
      await expect(
        resolveTokenFromAssetId(token, 'ethereum-mainnet', registryWithUSDC()),
      ).rejects.toThrow(WAIaaSError);
    });
  });

  describe('native asset (slip44)', () => {
    it('throws error for native assetId', async () => {
      const token = { assetId: 'eip155:1/slip44:60' };
      await expect(
        resolveTokenFromAssetId(token, 'ethereum-mainnet', createMockRegistry()),
      ).rejects.toThrow('Native assets');
    });
  });

  describe('token with existing values (no override)', () => {
    it('preserves existing decimals/symbol when already provided', async () => {
      const token = {
        assetId: USDC_ASSET_ID,
        decimals: 8, // user explicitly provided
        symbol: 'MYTKN',
      };
      const result = await resolveTokenFromAssetId(token, 'ethereum-mainnet', registryWithUSDC());
      // User-provided values take precedence
      expect(result.token.decimals).toBe(8);
      expect(result.token.symbol).toBe('MYTKN');
    });
  });

  describe('Solana token', () => {
    it('resolves Solana token from assetId', async () => {
      const solanaAssetId =
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const mockRegistry = createMockRegistry([
        {
          address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin',
        },
      ]);
      const result = await resolveTokenFromAssetId(
        { assetId: solanaAssetId },
        undefined,
        mockRegistry,
      );
      expect(result.token.address).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(result.network).toBe('solana-mainnet');
    });
  });
});
