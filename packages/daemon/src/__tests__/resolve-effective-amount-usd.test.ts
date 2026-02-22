/**
 * resolveEffectiveAmountUsd unit tests.
 *
 * Tests the 5-type transaction USD conversion logic:
 * TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH.
 *
 * PriceResult 3-state discriminated union:
 * - success: USD conversion succeeded
 * - oracleDown: Oracle entirely unavailable
 * - notListed: Token not found in any oracle source
 *
 * Security principle: "unknown price != price of 0"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IPriceOracle, PriceInfo, CacheStats } from '@waiaas/core';
import { PriceNotAvailableError } from '../infrastructure/oracle/oracle-errors.js';
import {
  resolveEffectiveAmountUsd,
  type PriceResultSuccess,
  type PriceResultNotListed,
} from '../pipeline/resolve-effective-amount-usd.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockOracle(overrides?: Partial<IPriceOracle>): IPriceOracle {
  return {
    getPrice: vi.fn().mockRejectedValue(new Error('not implemented')),
    getPrices: vi.fn().mockResolvedValue(new Map()),
    getNativePrice: vi.fn().mockRejectedValue(new Error('not implemented')),
    getCacheStats: vi.fn().mockReturnValue({
      hits: 0,
      misses: 0,
      staleHits: 0,
      size: 0,
      evictions: 0,
    } satisfies CacheStats),
    ...overrides,
  };
}

function buildPrice(
  usdPrice: number,
  source: 'pyth' | 'coingecko' | 'cache' = 'pyth',
  isStale = false,
): PriceInfo {
  const now = Date.now();
  return {
    usdPrice,
    source,
    fetchedAt: now,
    expiresAt: now + 300_000,
    isStale,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveEffectiveAmountUsd', () => {
  let oracle: IPriceOracle;

  beforeEach(() => {
    oracle = createMockOracle();
  });

  // -----------------------------------------------------------------------
  // 1. TRANSFER: 1 SOL (9 decimals), nativePrice $100 -> success, usdAmount=100
  // -----------------------------------------------------------------------
  it('TRANSFER: converts 1 SOL to $100 USD', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockResolvedValue(buildPrice(100)),
    });

    const request = { to: 'abc123', amount: '1000000000' }; // 1 SOL = 10^9 lamports
    const result = await resolveEffectiveAmountUsd(request, 'TRANSFER', 'solana', mockOracle);

    expect(result.type).toBe('success');
    const success = result as PriceResultSuccess;
    expect(success.usdAmount).toBeCloseTo(100, 2);
    expect(success.isStale).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 2. TRANSFER: 1 ETH (18 decimals), nativePrice $3000 -> success, usdAmount=3000
  // -----------------------------------------------------------------------
  it('TRANSFER: converts 1 ETH to $3000 USD', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockResolvedValue(buildPrice(3000)),
    });

    const request = { to: '0xabc', amount: '1000000000000000000' }; // 1 ETH = 10^18 wei
    const result = await resolveEffectiveAmountUsd(request, 'TRANSFER', 'ethereum', mockOracle);

    expect(result.type).toBe('success');
    const success = result as PriceResultSuccess;
    expect(success.usdAmount).toBeCloseTo(3000, 2);
    expect(success.isStale).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 3. TOKEN_TRANSFER: 1 USDC (6 decimals), tokenPrice $1 -> success, usdAmount=1
  // -----------------------------------------------------------------------
  it('TOKEN_TRANSFER: converts 1 USDC to $1 USD', async () => {
    const mockOracle = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(1)),
    });

    const request = {
      to: 'abc123',
      amount: '1000000', // 1 USDC = 10^6
      token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
    };
    const result = await resolveEffectiveAmountUsd(request, 'TOKEN_TRANSFER', 'solana', mockOracle);

    expect(result.type).toBe('success');
    const success = result as PriceResultSuccess;
    expect(success.usdAmount).toBeCloseTo(1, 2);
    expect(success.isStale).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 4. TOKEN_TRANSFER: getPrice throws PriceNotAvailableError -> notListed
  // -----------------------------------------------------------------------
  it('TOKEN_TRANSFER: returns notListed when getPrice throws PriceNotAvailableError', async () => {
    const mockOracle = createMockOracle({
      getPrice: vi.fn().mockRejectedValue(
        new PriceNotAvailableError('solana:SomeUnknownToken'),
      ),
    });

    const request = {
      to: 'abc123',
      amount: '1000000',
      token: { address: 'SomeUnknownToken', decimals: 6, symbol: 'UNKNOWN' },
    };
    const result = await resolveEffectiveAmountUsd(request, 'TOKEN_TRANSFER', 'solana', mockOracle);

    expect(result.type).toBe('notListed');
    const notListed = result as PriceResultNotListed;
    expect(notListed.tokenAddress).toBe('SomeUnknownToken');
    expect(notListed.chain).toBe('solana');
  });

  // -----------------------------------------------------------------------
  // 5. CONTRACT_CALL: value 500000000 (0.5 SOL), nativePrice $100 -> success, usdAmount=50
  // -----------------------------------------------------------------------
  it('CONTRACT_CALL: converts 0.5 SOL value to $50 USD', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockResolvedValue(buildPrice(100)),
    });

    const request = { to: 'contractAddr', calldata: '0x12345678', value: '500000000' }; // 0.5 SOL
    const result = await resolveEffectiveAmountUsd(request, 'CONTRACT_CALL', 'solana', mockOracle);

    expect(result.type).toBe('success');
    const success = result as PriceResultSuccess;
    expect(success.usdAmount).toBeCloseTo(50, 2);
    expect(success.isStale).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 6. CONTRACT_CALL: value undefined or '0' -> success, usdAmount=0, isStale=false
  // -----------------------------------------------------------------------
  it('CONTRACT_CALL: returns $0 when value is undefined', async () => {
    const request = { to: 'contractAddr', calldata: '0x12345678' };
    const result = await resolveEffectiveAmountUsd(request, 'CONTRACT_CALL', 'solana', oracle);

    expect(result.type).toBe('success');
    const success = result as PriceResultSuccess;
    expect(success.usdAmount).toBe(0);
    expect(success.isStale).toBe(false);
  });

  it('CONTRACT_CALL: returns $0 when value is "0"', async () => {
    const request = { to: 'contractAddr', calldata: '0x12345678', value: '0' };
    const result = await resolveEffectiveAmountUsd(request, 'CONTRACT_CALL', 'solana', oracle);

    expect(result.type).toBe('success');
    const success = result as PriceResultSuccess;
    expect(success.usdAmount).toBe(0);
    expect(success.isStale).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 7. APPROVE: always success, usdAmount=0, isStale=false
  // -----------------------------------------------------------------------
  it('APPROVE: returns success with $0 always', async () => {
    const request = {
      spender: 'spenderAddr',
      amount: '999999999',
      token: { address: 'tokenAddr', decimals: 6, symbol: 'TKN' },
    };
    const result = await resolveEffectiveAmountUsd(request, 'APPROVE', 'solana', oracle);

    expect(result.type).toBe('success');
    const success = result as PriceResultSuccess;
    expect(success.usdAmount).toBe(0);
    expect(success.isStale).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 8. BATCH: 2x TRANSFER (1 SOL each at $100) -> success, usdAmount=200
  // -----------------------------------------------------------------------
  it('BATCH: sums 2 TRANSFER instructions to $200', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockResolvedValue(buildPrice(100)),
    });

    const request = {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '1000000000' }, // 1 SOL = $100
        { to: 'addr2', amount: '1000000000' }, // 1 SOL = $100
      ],
    };
    const result = await resolveEffectiveAmountUsd(request, 'BATCH', 'solana', mockOracle);

    expect(result.type).toBe('success');
    const success = result as PriceResultSuccess;
    expect(success.usdAmount).toBeCloseTo(200, 2);
  });

  // -----------------------------------------------------------------------
  // 9. BATCH: TRANSFER + TOKEN_TRANSFER(notListed) -> notListed (failedCount=1)
  // -----------------------------------------------------------------------
  it('BATCH: returns notListed with failedCount when TOKEN_TRANSFER price fails', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockResolvedValue(buildPrice(100)),
      getPrice: vi.fn().mockRejectedValue(
        new PriceNotAvailableError('solana:UnknownToken'),
      ),
    });

    const request = {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '1000000000' }, // TRANSFER: 1 SOL
        {
          to: 'addr2',
          amount: '1000000',
          token: { address: 'UnknownToken', decimals: 6, symbol: 'UNK' },
        }, // TOKEN_TRANSFER: notListed
      ],
    };
    const result = await resolveEffectiveAmountUsd(request, 'BATCH', 'solana', mockOracle);

    expect(result.type).toBe('notListed');
    const notListed = result as PriceResultNotListed;
    expect(notListed.failedCount).toBe(1);
    expect(notListed.tokenAddress).toBe('UnknownToken');
    expect(notListed.chain).toBe('solana');
  });

  // -----------------------------------------------------------------------
  // 10. BATCH: getNativePrice fails -> oracleDown
  // -----------------------------------------------------------------------
  it('BATCH: returns oracleDown when getNativePrice fails', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockRejectedValue(new Error('Oracle down')),
    });

    const request = {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '1000000000' },
      ],
    };
    const result = await resolveEffectiveAmountUsd(request, 'BATCH', 'solana', mockOracle);

    expect(result.type).toBe('oracleDown');
  });

  // -----------------------------------------------------------------------
  // 11. TRANSFER: getNativePrice throws -> oracleDown
  // -----------------------------------------------------------------------
  it('TRANSFER: returns oracleDown when getNativePrice throws', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockRejectedValue(new Error('API timeout')),
    });

    const request = { to: 'abc123', amount: '1000000000' };
    const result = await resolveEffectiveAmountUsd(request, 'TRANSFER', 'solana', mockOracle);

    expect(result.type).toBe('oracleDown');
  });

  // -----------------------------------------------------------------------
  // 12. Unknown type -> oracleDown
  // -----------------------------------------------------------------------
  it('unknown transaction type returns oracleDown', async () => {
    const request = { to: 'abc123', amount: '100' };
    const result = await resolveEffectiveAmountUsd(request, 'UNKNOWN_TYPE', 'solana', oracle);

    expect(result.type).toBe('oracleDown');
  });

  // -----------------------------------------------------------------------
  // 13. TRANSFER: isStale=true price -> success, isStale=true
  // -----------------------------------------------------------------------
  it('TRANSFER: propagates isStale=true from price info', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockResolvedValue(buildPrice(100, 'cache', true)),
    });

    const request = { to: 'abc123', amount: '1000000000' };
    const result = await resolveEffectiveAmountUsd(request, 'TRANSFER', 'solana', mockOracle);

    expect(result.type).toBe('success');
    const success = result as PriceResultSuccess;
    expect(success.usdAmount).toBeCloseTo(100, 2);
    expect(success.isStale).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 14. TOKEN_TRANSFER: getPrice throws non-PriceNotAvailableError -> oracleDown
  // -----------------------------------------------------------------------
  it('TOKEN_TRANSFER: returns oracleDown for non-PriceNotAvailableError', async () => {
    const mockOracle = createMockOracle({
      getPrice: vi.fn().mockRejectedValue(new Error('Network timeout')),
    });

    const request = {
      to: 'abc123',
      amount: '1000000',
      token: { address: 'someToken', decimals: 6, symbol: 'TKN' },
    };
    const result = await resolveEffectiveAmountUsd(request, 'TOKEN_TRANSFER', 'solana', mockOracle);

    expect(result.type).toBe('oracleDown');
  });

  // -----------------------------------------------------------------------
  // 15. BATCH: all success + APPROVE included -> success (APPROVE is $0)
  // -----------------------------------------------------------------------
  it('BATCH: APPROVE instruction contributes $0 to total', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockResolvedValue(buildPrice(100)),
      getPrice: vi.fn().mockResolvedValue(buildPrice(1)),
    });

    const request = {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '1000000000' }, // TRANSFER: 1 SOL = $100
        {
          to: 'addr2',
          amount: '1000000',
          token: { address: 'USDCAddr', decimals: 6, symbol: 'USDC' },
        }, // TOKEN_TRANSFER: 1 USDC = $1
        {
          spender: 'spenderAddr',
          amount: '999999999',
          token: { address: 'TokenAddr', decimals: 6, symbol: 'TKN' },
        }, // APPROVE: $0
      ],
    };
    const result = await resolveEffectiveAmountUsd(request, 'BATCH', 'solana', mockOracle);

    expect(result.type).toBe('success');
    const success = result as PriceResultSuccess;
    expect(success.usdAmount).toBeCloseTo(101, 2); // $100 + $1 + $0
  });

  // -----------------------------------------------------------------------
  // 16. TOKEN_TRANSFER: network parameter is forwarded to oracle getPrice
  // -----------------------------------------------------------------------
  it('TOKEN_TRANSFER: passes network to oracle getPrice for L2 tokens', async () => {
    const mockOracle = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(1)),
    });

    const request = {
      to: '0xrecipient',
      amount: '1000000',
      token: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, symbol: 'USDC' },
    };
    const result = await resolveEffectiveAmountUsd(
      request, 'TOKEN_TRANSFER', 'ethereum', mockOracle, 'polygon-mainnet',
    );

    expect(result.type).toBe('success');
    // Verify oracle received network in TokenRef
    expect(mockOracle.getPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        decimals: 6,
        chain: 'ethereum',
        network: 'polygon-mainnet',
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 17. TOKEN_TRANSFER: backward compatibility -- no network -> undefined
  // -----------------------------------------------------------------------
  it('TOKEN_TRANSFER: backward compatible without network parameter', async () => {
    const mockOracle = createMockOracle({
      getPrice: vi.fn().mockResolvedValue(buildPrice(1)),
    });

    const request = {
      to: 'abc123',
      amount: '1000000',
      token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
    };
    // No network parameter (5th arg omitted)
    const result = await resolveEffectiveAmountUsd(request, 'TOKEN_TRANSFER', 'solana', mockOracle);

    expect(result.type).toBe('success');
    // Verify oracle received undefined network (resolveNetwork handles default)
    expect(mockOracle.getPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        chain: 'solana',
        network: undefined,
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 18a. BATCH: non-PriceNotAvailableError in TOKEN_TRANSFER -> oracleDown
  // -----------------------------------------------------------------------
  it('BATCH: returns oracleDown when TOKEN_TRANSFER throws non-PriceNotAvailableError', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockResolvedValue(buildPrice(100)),
      getPrice: vi.fn().mockRejectedValue(new Error('Network timeout')),
    });

    const request = {
      type: 'BATCH',
      instructions: [
        {
          to: 'addr1',
          amount: '1000000',
          token: { address: 'someToken', decimals: 6, symbol: 'TKN' },
        },
      ],
    };
    const result = await resolveEffectiveAmountUsd(request, 'BATCH', 'solana', mockOracle);

    expect(result.type).toBe('oracleDown');
  });

  // -----------------------------------------------------------------------
  // 18b. BATCH: CONTRACT_CALL with value='0' -> $0 contribution
  // -----------------------------------------------------------------------
  it('BATCH: CONTRACT_CALL with value "0" contributes $0 to total', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockResolvedValue(buildPrice(100)),
    });

    const request = {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '1000000000' }, // TRANSFER: 1 SOL = $100
        { to: 'contractAddr', calldata: '0x12345678', value: '0' }, // CONTRACT_CALL: $0
      ],
    };
    const result = await resolveEffectiveAmountUsd(request, 'BATCH', 'solana', mockOracle);

    expect(result.type).toBe('success');
    const success = result as PriceResultSuccess;
    expect(success.usdAmount).toBeCloseTo(100, 2); // Only TRANSFER contributes
  });

  // -----------------------------------------------------------------------
  // 18c. BATCH: CONTRACT_CALL with non-zero value -> adds to total
  // -----------------------------------------------------------------------
  it('BATCH: CONTRACT_CALL with non-zero value adds native amount to total', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockResolvedValue(buildPrice(100)),
    });

    const request = {
      type: 'BATCH',
      instructions: [
        { to: 'contractAddr', calldata: '0x12345678', value: '500000000' }, // 0.5 SOL = $50
      ],
    };
    const result = await resolveEffectiveAmountUsd(request, 'BATCH', 'solana', mockOracle);

    expect(result.type).toBe('success');
    const success = result as PriceResultSuccess;
    expect(success.usdAmount).toBeCloseTo(50, 2);
  });

  // -----------------------------------------------------------------------
  // 18. BATCH: network is forwarded to TOKEN_TRANSFER instructions
  // -----------------------------------------------------------------------
  it('BATCH: passes network to TOKEN_TRANSFER getPrice calls', async () => {
    const mockOracle = createMockOracle({
      getNativePrice: vi.fn().mockResolvedValue(buildPrice(100)),
      getPrice: vi.fn().mockResolvedValue(buildPrice(1)),
    });

    const request = {
      type: 'BATCH',
      instructions: [
        {
          to: '0xaddr',
          amount: '1000000',
          token: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, symbol: 'USDC' },
        },
      ],
    };
    await resolveEffectiveAmountUsd(request, 'BATCH', 'ethereum', mockOracle, 'polygon-mainnet');

    // Verify getPrice was called with network
    expect(mockOracle.getPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: 'ethereum',
        network: 'polygon-mainnet',
      }),
    );
  });
});
