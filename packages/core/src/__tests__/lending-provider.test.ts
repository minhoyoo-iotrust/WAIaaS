/**
 * Tests for ILendingProvider, IPositionProvider interfaces and Zod SSoT schemas.
 *
 * Tests cover:
 * 1. LendingPositionSummarySchema validation (valid/invalid inputs)
 * 2. HealthFactorSchema validation (all status values)
 * 3. MarketInfoSchema validation (required fields)
 * 4. ILendingProvider type conformance (extends IActionProvider)
 * 5. IPositionProvider type conformance (method signatures)
 * 6. PositionUpdate type conformance (matches defi_positions columns)
 *
 * @see packages/core/src/interfaces/lending-provider.types.ts
 * @see packages/core/src/interfaces/position-provider.types.ts
 */
import { describe, it, expect } from 'vitest';
import {
  LendingPositionSummarySchema,
  HealthFactorSchema,
  MarketInfoSchema,
  type ILendingProvider,
  type IPositionProvider,
  type PositionUpdate,
  type LendingPositionSummary,
  type HealthFactor,
  type MarketInfo,
} from '../interfaces/index.js';

// ---------------------------------------------------------------------------
// LendingPositionSummarySchema
// ---------------------------------------------------------------------------

describe('LendingPositionSummarySchema', () => {
  it('validates valid supply position', () => {
    const result = LendingPositionSummarySchema.parse({
      asset: 'USDC',
      positionType: 'SUPPLY',
      amount: '1000000000',
      amountUsd: 1000.0,
      apy: 0.035,
    });
    expect(result.asset).toBe('USDC');
    expect(result.positionType).toBe('SUPPLY');
    expect(result.amount).toBe('1000000000');
    expect(result.amountUsd).toBe(1000.0);
    expect(result.apy).toBe(0.035);
  });

  it('validates valid borrow position', () => {
    const result = LendingPositionSummarySchema.parse({
      asset: 'WETH',
      positionType: 'BORROW',
      amount: '500000000000000000',
      amountUsd: 1500.0,
      apy: 0.055,
    });
    expect(result.positionType).toBe('BORROW');
  });

  it('rejects invalid positionType', () => {
    const result = LendingPositionSummarySchema.safeParse({
      asset: 'USDC',
      positionType: 'INVALID',
      amount: '1000',
      amountUsd: null,
      apy: null,
    });
    expect(result.success).toBe(false);
  });

  it('allows null amountUsd and apy', () => {
    const result = LendingPositionSummarySchema.parse({
      asset: 'DAI',
      positionType: 'SUPPLY',
      amount: '5000000000000000000',
      amountUsd: null,
      apy: null,
    });
    expect(result.amountUsd).toBeNull();
    expect(result.apy).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HealthFactorSchema
// ---------------------------------------------------------------------------

describe('HealthFactorSchema', () => {
  it('validates safe health factor', () => {
    const result = HealthFactorSchema.parse({
      factor: 2.5,
      totalCollateralUsd: 10000,
      totalDebtUsd: 4000,
      currentLtv: 0.4,
      status: 'safe',
    });
    expect(result.factor).toBe(2.5);
    expect(result.status).toBe('safe');
  });

  it('validates all status values', () => {
    const statuses = ['safe', 'warning', 'danger', 'critical'] as const;
    for (const status of statuses) {
      const result = HealthFactorSchema.parse({
        factor: 1.5,
        totalCollateralUsd: 5000,
        totalDebtUsd: 3000,
        currentLtv: 0.6,
        status,
      });
      expect(result.status).toBe(status);
    }
  });

  it('rejects invalid status', () => {
    const result = HealthFactorSchema.safeParse({
      factor: 1.0,
      totalCollateralUsd: 1000,
      totalDebtUsd: 1000,
      currentLtv: 1.0,
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MarketInfoSchema
// ---------------------------------------------------------------------------

describe('MarketInfoSchema', () => {
  it('validates valid market data', () => {
    const result = MarketInfoSchema.parse({
      asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      supplyApy: 0.035,
      borrowApy: 0.055,
      ltv: 0.825,
      availableLiquidity: '500000000000',
    });
    expect(result.symbol).toBe('USDC');
    expect(result.ltv).toBe(0.825);
  });

  it('requires all fields', () => {
    const result = MarketInfoSchema.safeParse({
      asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      // missing symbol
      supplyApy: 0.035,
      borrowApy: 0.055,
      ltv: 0.825,
      availableLiquidity: '500000000000',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ILendingProvider type conformance
// ---------------------------------------------------------------------------

describe('ILendingProvider type conformance', () => {
  it('extends IActionProvider with lending-specific methods', () => {
    // Type-level test: this compiles only if ILendingProvider correctly
    // extends IActionProvider and adds getPosition/getHealthFactor/getMarkets.
    const _typeCheck: ILendingProvider = {
      metadata: {
        name: 'aave_v3',
        description: 'Aave V3 lending protocol provider',
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
      getPosition: async () => [],
      getHealthFactor: async () => ({
        factor: 2.0,
        totalCollateralUsd: 10000,
        totalDebtUsd: 5000,
        currentLtv: 0.5,
        status: 'safe' as const,
      }),
      getMarkets: async () => [],
    };

    // Verify the mock has the expected shape
    expect(_typeCheck.metadata.name).toBe('aave_v3');
    expect(typeof _typeCheck.getPosition).toBe('function');
    expect(typeof _typeCheck.getHealthFactor).toBe('function');
    expect(typeof _typeCheck.getMarkets).toBe('function');
    expect(typeof _typeCheck.resolve).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// IPositionProvider type conformance
// ---------------------------------------------------------------------------

describe('IPositionProvider type conformance', () => {
  it('defines correct method signatures', () => {
    // Type-level test: this compiles only if IPositionProvider has the
    // correct method signatures for PositionTracker integration.
    const _typeCheck: IPositionProvider = {
      getPositions: async () => [],
      getProviderName: () => 'aave_v3',
      getSupportedCategories: () => ['LENDING'],
    };

    expect(typeof _typeCheck.getPositions).toBe('function');
    expect(_typeCheck.getProviderName()).toBe('aave_v3');
    expect(_typeCheck.getSupportedCategories()).toEqual(['LENDING']);
  });

  it('PositionUpdate matches defi_positions columns', () => {
    // Type-level test: this compiles only if PositionUpdate uses
    // PositionCategory and PositionStatus from SSoT enums.
    const _update: PositionUpdate = {
      walletId: 'w1',
      category: 'LENDING',
      provider: 'aave_v3',
      chain: 'evm',
      network: 'ethereum-mainnet',
      assetId: 'caip19:eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      amount: '1000000000',
      amountUsd: 1000.0,
      metadata: { apy: 0.035, positionType: 'SUPPLY' },
      status: 'ACTIVE',
      openedAt: 1709000000,
    };

    expect(_update.walletId).toBe('w1');
    expect(_update.category).toBe('LENDING');
    expect(_update.status).toBe('ACTIVE');
  });

  it('PositionUpdate allows optional fields to be null', () => {
    const _update: PositionUpdate = {
      walletId: 'w2',
      category: 'STAKING',
      provider: 'jito',
      chain: 'solana',
      network: null,
      assetId: null,
      amount: '5000000000',
      amountUsd: null,
      metadata: {},
      status: 'CLOSED',
      openedAt: 1709000000,
      closedAt: 1709100000,
    };

    expect(_update.network).toBeNull();
    expect(_update.assetId).toBeNull();
    expect(_update.amountUsd).toBeNull();
    expect(_update.closedAt).toBe(1709100000);
  });
});

// ---------------------------------------------------------------------------
// Cross-type consistency
// ---------------------------------------------------------------------------

describe('Cross-type consistency', () => {
  it('LendingPositionSummary is assignable from parse result', () => {
    const parsed: LendingPositionSummary = LendingPositionSummarySchema.parse({
      asset: 'WETH',
      positionType: 'SUPPLY',
      amount: '1000000000000000000',
      amountUsd: 3000.0,
      apy: 0.02,
    });
    expect(parsed.asset).toBe('WETH');
  });

  it('HealthFactor is assignable from parse result', () => {
    const parsed: HealthFactor = HealthFactorSchema.parse({
      factor: 1.8,
      totalCollateralUsd: 8000,
      totalDebtUsd: 4444,
      currentLtv: 0.5555,
      status: 'warning',
    });
    expect(parsed.status).toBe('warning');
  });

  it('MarketInfo is assignable from parse result', () => {
    const parsed: MarketInfo = MarketInfoSchema.parse({
      asset: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      supplyApy: 0.04,
      borrowApy: 0.06,
      ltv: 0.75,
      availableLiquidity: '100000000000',
    });
    expect(parsed.symbol).toBe('USDT');
  });
});
