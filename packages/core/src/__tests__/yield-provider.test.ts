/**
 * Tests for IYieldProvider interface and Zod SSoT schemas.
 *
 * Tests cover:
 * 1. YieldMarketInfoSchema validation (valid/invalid inputs)
 * 2. YieldPositionSummarySchema validation (tokenType enum, maturity)
 * 3. YieldForecastSchema validation (required fields)
 * 4. IYieldProvider type conformance (extends IActionProvider)
 * 5. MATURED status in PositionStatusEnum
 *
 * @see packages/core/src/interfaces/yield-provider.types.ts
 * @see packages/core/src/enums/defi.ts
 */
import { describe, it, expect } from 'vitest';
import {
  YieldMarketInfoSchema,
  YieldPositionSummarySchema,
  YieldForecastSchema,
  type IYieldProvider,
  type YieldMarketInfo,
  type YieldPositionSummary,
  type YieldForecast,
} from '../interfaces/index.js';
import { PositionStatusEnum, POSITION_STATUSES } from '../enums/defi.js';

// ---------------------------------------------------------------------------
// YieldMarketInfoSchema
// ---------------------------------------------------------------------------

describe('YieldMarketInfoSchema', () => {
  it('validates valid yield market', () => {
    const result = YieldMarketInfoSchema.parse({
      marketAddress: '0x1234567890abcdef1234567890abcdef12345678',
      asset: 'stETH',
      symbol: 'PT-stETH-26JUN2026',
      impliedApy: 0.052,
      underlyingApy: 0.035,
      maturity: 1782000000,
      tvl: 150000000,
      chain: 'ethereum',
    });
    expect(result.marketAddress).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(result.symbol).toBe('PT-stETH-26JUN2026');
    expect(result.impliedApy).toBe(0.052);
    expect(result.maturity).toBe(1782000000);
  });

  it('allows null tvl', () => {
    const result = YieldMarketInfoSchema.parse({
      marketAddress: '0xabcdef',
      asset: 'USDC',
      symbol: 'PT-USDC',
      impliedApy: 0.04,
      underlyingApy: 0.03,
      maturity: 1785000000,
      tvl: null,
      chain: 'arbitrum',
    });
    expect(result.tvl).toBeNull();
  });

  it('requires all fields', () => {
    const result = YieldMarketInfoSchema.safeParse({
      marketAddress: '0x1234',
      asset: 'stETH',
      // missing symbol
      impliedApy: 0.05,
      underlyingApy: 0.03,
      maturity: 1782000000,
      tvl: null,
      chain: 'ethereum',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// YieldPositionSummarySchema
// ---------------------------------------------------------------------------

describe('YieldPositionSummarySchema', () => {
  it('validates PT position', () => {
    const result = YieldPositionSummarySchema.parse({
      asset: 'PT-stETH-26JUN2026',
      tokenType: 'PT',
      amount: '1000000000000000000',
      amountUsd: 3200.0,
      apy: 0.052,
      maturity: 1782000000,
      marketId: '0xmarket123',
    });
    expect(result.tokenType).toBe('PT');
    expect(result.amount).toBe('1000000000000000000');
  });

  it('validates YT position', () => {
    const result = YieldPositionSummarySchema.parse({
      asset: 'YT-stETH-26JUN2026',
      tokenType: 'YT',
      amount: '500000000000000000',
      amountUsd: 50.0,
      apy: null,
      maturity: 1782000000,
      marketId: '0xmarket123',
    });
    expect(result.tokenType).toBe('YT');
    expect(result.apy).toBeNull();
  });

  it('validates LP position', () => {
    const result = YieldPositionSummarySchema.parse({
      asset: 'LP-stETH-26JUN2026',
      tokenType: 'LP',
      amount: '2000000000000000000',
      amountUsd: null,
      apy: 0.08,
      maturity: 1782000000,
      marketId: '0xmarket123',
    });
    expect(result.tokenType).toBe('LP');
    expect(result.amountUsd).toBeNull();
  });

  it('rejects invalid tokenType', () => {
    const result = YieldPositionSummarySchema.safeParse({
      asset: 'stETH',
      tokenType: 'INVALID',
      amount: '1000',
      amountUsd: null,
      apy: null,
      maturity: 1782000000,
      marketId: '0xmarket123',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// YieldForecastSchema
// ---------------------------------------------------------------------------

describe('YieldForecastSchema', () => {
  it('validates valid forecast', () => {
    const result = YieldForecastSchema.parse({
      marketId: '0xmarket123',
      impliedApy: 0.052,
      underlyingApy: 0.035,
      ptPrice: 0.95,
      ytPrice: 0.05,
      maturityDate: 1782000000,
    });
    expect(result.impliedApy).toBe(0.052);
    expect(result.ptPrice).toBe(0.95);
    expect(result.ytPrice).toBe(0.05);
  });

  it('requires all fields', () => {
    const result = YieldForecastSchema.safeParse({
      marketId: '0xmarket123',
      impliedApy: 0.05,
      // missing underlyingApy, ptPrice, ytPrice, maturityDate
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// IYieldProvider type conformance
// ---------------------------------------------------------------------------

describe('IYieldProvider type conformance', () => {
  it('extends IActionProvider with yield-specific methods', () => {
    const _typeCheck: IYieldProvider = {
      metadata: {
        name: 'pendle',
        description: 'Pendle Finance yield trading protocol provider',
        version: '1.0.0',
        chains: ['ethereum'],
        mcpExpose: true,
        requiresApiKey: false,
        requiredApis: [],
        requiresSigningKey: false,
      },
      actions: [],
      resolve: async () => ({
        type: 'CONTRACT_CALL' as const,
        to: '0x1234567890abcdef1234567890abcdef12345678',
        data: '0x',
        value: '0',
      }),
      getMarkets: async () => [],
      getPosition: async () => [],
      getYieldForecast: async () => ({
        marketId: '0x',
        impliedApy: 0,
        underlyingApy: 0,
        ptPrice: 0,
        ytPrice: 0,
        maturityDate: 0,
      }),
    };

    expect(_typeCheck.metadata.name).toBe('pendle');
    expect(typeof _typeCheck.getMarkets).toBe('function');
    expect(typeof _typeCheck.getPosition).toBe('function');
    expect(typeof _typeCheck.getYieldForecast).toBe('function');
    expect(typeof _typeCheck.resolve).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// MATURED status in PositionStatusEnum
// ---------------------------------------------------------------------------

describe('PositionStatusEnum MATURED support', () => {
  it('includes MATURED in POSITION_STATUSES', () => {
    expect(POSITION_STATUSES).toContain('MATURED');
  });

  it('PositionStatusEnum parses MATURED', () => {
    const result = PositionStatusEnum.parse('MATURED');
    expect(result).toBe('MATURED');
  });

  it('PositionStatusEnum has 4 values', () => {
    expect(POSITION_STATUSES).toHaveLength(4);
    expect(POSITION_STATUSES).toEqual(['ACTIVE', 'CLOSED', 'LIQUIDATED', 'MATURED']);
  });
});

// ---------------------------------------------------------------------------
// Cross-type consistency
// ---------------------------------------------------------------------------

describe('Yield cross-type consistency', () => {
  it('YieldMarketInfo is assignable from parse result', () => {
    const parsed: YieldMarketInfo = YieldMarketInfoSchema.parse({
      marketAddress: '0xabc',
      asset: 'USDC',
      symbol: 'PT-USDC',
      impliedApy: 0.04,
      underlyingApy: 0.03,
      maturity: 1785000000,
      tvl: 50000000,
      chain: 'base',
    });
    expect(parsed.symbol).toBe('PT-USDC');
  });

  it('YieldPositionSummary is assignable from parse result', () => {
    const parsed: YieldPositionSummary = YieldPositionSummarySchema.parse({
      asset: 'PT-stETH',
      tokenType: 'PT',
      amount: '1000',
      amountUsd: 1000,
      apy: 0.05,
      maturity: 1782000000,
      marketId: '0x',
    });
    expect(parsed.tokenType).toBe('PT');
  });

  it('YieldForecast is assignable from parse result', () => {
    const parsed: YieldForecast = YieldForecastSchema.parse({
      marketId: '0xmarket',
      impliedApy: 0.055,
      underlyingApy: 0.04,
      ptPrice: 0.948,
      ytPrice: 0.052,
      maturityDate: 1782000000,
    });
    expect(parsed.impliedApy).toBe(0.055);
  });
});
