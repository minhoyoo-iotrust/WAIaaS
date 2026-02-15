/**
 * x402 USD Resolver unit tests.
 *
 * Tests cover:
 * 1. USDC direct conversion (6 decimals, $1 per USDC)
 * 2. Non-USDC token conversion via IPriceOracle
 * 3. No oracle fallback (returns 0)
 * 4. Oracle error fallback (returns 0)
 * 5. Solana USDC direct conversion
 * 6. Multiple EVM chain USDC support
 * 7. Case-insensitive asset address matching
 */

import { describe, it, expect, vi } from 'vitest';
import type { IPriceOracle, PriceInfo } from '@waiaas/core';

import { resolveX402UsdAmount } from '../services/x402/x402-usd-resolver.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal mock IPriceOracle. */
function createMockOracle(usdPrice: number): IPriceOracle {
  return {
    getPrice: vi.fn().mockResolvedValue({
      usdPrice,
      source: 'coingecko',
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      isStale: false,
    } satisfies PriceInfo),
    getPrices: vi.fn(),
    getNativePrice: vi.fn(),
    getCacheStats: vi.fn(),
  };
}

/** Create a mock oracle that throws on getPrice. */
function createThrowingOracle(): IPriceOracle {
  return {
    getPrice: vi.fn().mockRejectedValue(new Error('Oracle network error')),
    getPrices: vi.fn(),
    getNativePrice: vi.fn(),
    getCacheStats: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveX402UsdAmount', () => {
  // ─── USDC Direct Conversion ($1 = 1 USDC) ────────────────

  describe('USDC direct conversion', () => {
    it('converts 1 USDC (1_000_000 raw) to $1.00 on Base mainnet', async () => {
      const result = await resolveX402UsdAmount(
        '1000000',
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        'eip155:8453',
        createMockOracle(9999), // should NOT be called
      );
      expect(result).toBe(1.0);
    });

    it('converts 0.5 USDC (500_000 raw) to $0.50', async () => {
      const result = await resolveX402UsdAmount(
        '500000',
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        'eip155:8453',
      );
      expect(result).toBe(0.5);
    });

    it('converts 100 USDC (100_000_000 raw) to $100.00 on Ethereum mainnet', async () => {
      const result = await resolveX402UsdAmount(
        '100000000',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'eip155:1',
      );
      expect(result).toBe(100.0);
    });

    it('converts USDC on Base Sepolia testnet', async () => {
      const result = await resolveX402UsdAmount(
        '2500000',
        '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        'eip155:84532',
      );
      expect(result).toBe(2.5);
    });

    it('converts USDC on Polygon mainnet', async () => {
      const result = await resolveX402UsdAmount(
        '10000000',
        '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        'eip155:137',
      );
      expect(result).toBe(10.0);
    });

    it('converts USDC on Arbitrum One', async () => {
      const result = await resolveX402UsdAmount(
        '5000000',
        '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        'eip155:42161',
      );
      expect(result).toBe(5.0);
    });

    it('converts USDC on Optimism', async () => {
      const result = await resolveX402UsdAmount(
        '750000',
        '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        'eip155:10',
      );
      expect(result).toBe(0.75);
    });

    it('does NOT call oracle for USDC conversion', async () => {
      const oracle = createMockOracle(9999);
      await resolveX402UsdAmount(
        '1000000',
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        'eip155:8453',
        oracle,
      );
      expect(oracle.getPrice).not.toHaveBeenCalled();
    });

    it('handles case-insensitive USDC address matching', async () => {
      const result = await resolveX402UsdAmount(
        '1000000',
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // lowercase
        'eip155:1',
      );
      expect(result).toBe(1.0);
    });
  });

  // ─── Solana USDC ──────────────────────────────────────────

  describe('Solana USDC', () => {
    it('converts 1 USDC (1_000_000 raw) to $1.00 on Solana mainnet', async () => {
      const result = await resolveX402UsdAmount(
        '1000000',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      );
      expect(result).toBe(1.0);
    });

    it('converts 50 USDC (50_000_000 raw) to $50.00 on Solana mainnet', async () => {
      const result = await resolveX402UsdAmount(
        '50000000',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      );
      expect(result).toBe(50.0);
    });

    it('converts Solana devnet USDC', async () => {
      const result = await resolveX402UsdAmount(
        '3000000',
        '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      );
      expect(result).toBe(3.0);
    });
  });

  // ─── Non-USDC Token (IPriceOracle) ─────────────────────────

  describe('non-USDC token via IPriceOracle', () => {
    it('converts 1 ETH worth token at $2000 price', async () => {
      const oracle = createMockOracle(2000);
      const result = await resolveX402UsdAmount(
        '1000000000000000000', // 1e18 (18 decimals)
        '0xOtherToken',
        'eip155:1',
        oracle,
      );
      expect(result).toBe(2000.0);
      expect(oracle.getPrice).toHaveBeenCalledWith({
        address: '0xOtherToken',
        decimals: 18,
        chain: 'ethereum',
      });
    });

    it('converts Solana non-USDC token (9 decimals default)', async () => {
      const oracle = createMockOracle(150);
      const result = await resolveX402UsdAmount(
        '1000000000', // 1e9 (9 decimals)
        'SomeRandomMint111111111111111111111111111111',
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        oracle,
      );
      expect(result).toBe(150.0);
      expect(oracle.getPrice).toHaveBeenCalledWith({
        address: 'SomeRandomMint111111111111111111111111111111',
        decimals: 9,
        chain: 'solana',
      });
    });
  });

  // ─── No Oracle Fallback ────────────────────────────────────

  describe('no oracle fallback', () => {
    it('returns 0 when oracle is undefined for non-USDC token', async () => {
      const result = await resolveX402UsdAmount(
        '1000000000000000000',
        '0xOtherToken',
        'eip155:1',
        undefined,
      );
      expect(result).toBe(0);
    });

    it('returns 0 when oracle is undefined for unknown Solana token', async () => {
      const result = await resolveX402UsdAmount(
        '1000000000',
        'UnknownMint11111111111111111111111111111111',
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        undefined,
      );
      expect(result).toBe(0);
    });
  });

  // ─── Oracle Error Fallback ─────────────────────────────────

  describe('oracle error fallback', () => {
    it('returns 0 when oracle.getPrice throws', async () => {
      const oracle = createThrowingOracle();
      const result = await resolveX402UsdAmount(
        '1000000000000000000',
        '0xOtherToken',
        'eip155:1',
        oracle,
      );
      expect(result).toBe(0);
    });
  });

  // ─── Unknown Network ──────────────────────────────────────

  describe('unknown network', () => {
    it('returns 0 for non-USDC token on unknown network without oracle', async () => {
      const result = await resolveX402UsdAmount(
        '1000000',
        '0xSomeToken',
        'eip155:999999',
        undefined,
      );
      expect(result).toBe(0);
    });
  });
});
