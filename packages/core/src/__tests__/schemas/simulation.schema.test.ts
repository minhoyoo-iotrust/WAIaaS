import { describe, it, expect } from 'vitest';
import {
  DryRunSimulationResultSchema,
  SimulationWarningCodeEnum,
  PolicyResultSchema,
  FeeEstimateResultSchema,
  BalanceChangeSchema,
  SimulationWarningSchema,
  SimulationDetailSchema,
  SimulationMetaSchema,
} from '../../index.js';

describe('DryRunSimulationResult Zod SSoT', () => {
  // ---------- Test 1: Complete success response ----------
  it('parses a complete success response with all 6 fields present', () => {
    const input = {
      success: true,
      policy: { tier: 'INSTANT', allowed: true },
      fee: {
        estimatedFee: '21000000000000',
        feeSymbol: 'ETH',
        feeDecimals: 18,
        feeUsd: 0.05,
      },
      balanceChanges: [
        {
          asset: 'native',
          symbol: 'ETH',
          decimals: 18,
          currentBalance: '5000000000000000000',
          changeAmount: '-1021000000000000000',
          afterBalance: '3979000000000000000',
        },
      ],
      warnings: [],
      simulation: {
        success: true,
        logs: [],
        unitsConsumed: '21000',
        error: null,
      },
      meta: {
        chain: 'ethereum',
        network: 'ethereum-mainnet',
        transactionType: 'TRANSFER',
        durationMs: 342,
      },
    };

    const result = DryRunSimulationResultSchema.parse(input);
    expect(result.success).toBe(true);
    expect(result.policy.tier).toBe('INSTANT');
    expect(result.fee?.estimatedFee).toBe('21000000000000');
    expect(result.balanceChanges).toHaveLength(1);
    expect(result.simulation.success).toBe(true);
    expect(result.meta.chain).toBe('ethereum');
  });

  // ---------- Test 2: Policy-denied response ----------
  it('parses a policy-denied response (success=false, fee=null)', () => {
    const input = {
      success: false,
      policy: {
        tier: 'INSTANT',
        allowed: false,
        reason: 'Token transfer not allowed: USDC not in ALLOWED_TOKENS list',
      },
      fee: null,
      balanceChanges: [],
      warnings: [
        {
          code: 'TOKEN_NOT_IN_ALLOWED_LIST',
          message: 'USDC is not in the allowed tokens list',
          severity: 'error',
        },
      ],
      simulation: {
        success: false,
        logs: [],
        unitsConsumed: null,
        error: 'Skipped: policy denied',
      },
      meta: {
        chain: 'ethereum',
        network: 'ethereum-mainnet',
        transactionType: 'TOKEN_TRANSFER',
        durationMs: 15,
      },
    };

    const result = DryRunSimulationResultSchema.parse(input);
    expect(result.success).toBe(false);
    expect(result.policy.allowed).toBe(false);
    expect(result.policy.reason).toBe('Token transfer not allowed: USDC not in ALLOWED_TOKENS list');
    expect(result.fee).toBeNull();
  });

  // ---------- Test 3: PolicyResultSchema with all optional fields ----------
  it('accepts all 4 tiers + optional fields in PolicyResultSchema', () => {
    for (const tier of ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'] as const) {
      expect(() => PolicyResultSchema.parse({ tier, allowed: true })).not.toThrow();
    }

    const full = PolicyResultSchema.parse({
      tier: 'APPROVAL',
      allowed: true,
      reason: 'High amount',
      delaySeconds: 900,
      approvalReason: 'per_tx',
      downgraded: true,
      cumulativeWarning: {
        type: 'daily',
        ratio: 0.85,
        spent: 850,
        limit: 1000,
      },
    });
    expect(full.downgraded).toBe(true);
    expect(full.cumulativeWarning?.ratio).toBe(0.85);
  });

  // ---------- Test 4: FeeEstimateResultSchema ----------
  it('validates FeeEstimateResultSchema digit-string fields and optional ATA fields', () => {
    const basic = FeeEstimateResultSchema.parse({
      estimatedFee: '5000',
      feeSymbol: 'SOL',
      feeDecimals: 9,
      feeUsd: 0.001,
    });
    expect(basic.estimatedFee).toBe('5000');

    const withAta = FeeEstimateResultSchema.parse({
      estimatedFee: '5000',
      feeSymbol: 'SOL',
      feeDecimals: 9,
      feeUsd: null,
      needsAtaCreation: true,
      ataRentCost: '2039280',
    });
    expect(withAta.needsAtaCreation).toBe(true);
    expect(withAta.ataRentCost).toBe('2039280');
  });

  // ---------- Test 5: BalanceChangeSchema ----------
  it('validates BalanceChangeSchema with all required fields', () => {
    const result = BalanceChangeSchema.parse({
      asset: 'native',
      symbol: 'ETH',
      decimals: 18,
      currentBalance: '5000000000000000000',
      changeAmount: '-1000000000000000000',
      afterBalance: '4000000000000000000',
    });
    expect(result.asset).toBe('native');
    expect(result.symbol).toBe('ETH');
    expect(result.decimals).toBe(18);
  });

  // ---------- Test 6: SimulationWarningCodeEnum contains all 14 codes ----------
  it('contains all 14 warning codes', () => {
    const codes = SimulationWarningCodeEnum.options;
    expect(codes).toHaveLength(14);
    expect(codes).toContain('INSUFFICIENT_BALANCE');
    expect(codes).toContain('INSUFFICIENT_BALANCE_WITH_FEE');
    expect(codes).toContain('ORACLE_PRICE_UNAVAILABLE');
    expect(codes).toContain('SIMULATION_FAILED');
    expect(codes).toContain('HIGH_FEE_RATIO');
    expect(codes).toContain('APPROVAL_REQUIRED');
    expect(codes).toContain('DELAY_REQUIRED');
    expect(codes).toContain('CUMULATIVE_LIMIT_WARNING');
    expect(codes).toContain('TOKEN_NOT_IN_ALLOWED_LIST');
    expect(codes).toContain('CONTRACT_NOT_WHITELISTED');
    expect(codes).toContain('NETWORK_NOT_ALLOWED');
    expect(codes).toContain('DOWNGRADED_NO_OWNER');
    expect(codes).toContain('GAS_CONDITION_NOT_MET');
    expect(codes).toContain('GAS_CONDITION_DISABLED');
  });

  // ---------- Test 7: SimulationWarningSchema ----------
  it('validates SimulationWarningSchema with code/message/severity', () => {
    for (const severity of ['info', 'warning', 'error'] as const) {
      const result = SimulationWarningSchema.parse({
        code: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient balance',
        severity,
      });
      expect(result.severity).toBe(severity);
    }

    expect(() =>
      SimulationWarningSchema.parse({
        code: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient balance',
        severity: 'critical', // invalid
      }),
    ).toThrow();
  });

  // ---------- Test 8: SimulationDetailSchema ----------
  it('validates SimulationDetailSchema with success/logs/unitsConsumed/error', () => {
    const success = SimulationDetailSchema.parse({
      success: true,
      logs: ['log1', 'log2'],
      unitsConsumed: '21000',
      error: null,
    });
    expect(success.unitsConsumed).toBe('21000');
    expect(success.error).toBeNull();

    const failure = SimulationDetailSchema.parse({
      success: false,
      logs: [],
      unitsConsumed: null,
      error: 'Simulation failed',
    });
    expect(failure.unitsConsumed).toBeNull();
    expect(failure.error).toBe('Simulation failed');
  });

  // ---------- Test 9: SimulationMetaSchema ----------
  it('validates SimulationMetaSchema with chain/network/transactionType/durationMs', () => {
    const result = SimulationMetaSchema.parse({
      chain: 'solana',
      network: 'solana-mainnet',
      transactionType: 'TOKEN_TRANSFER',
      durationMs: 512,
    });
    expect(result.chain).toBe('solana');
    expect(result.network).toBe('solana-mainnet');
    expect(result.transactionType).toBe('TOKEN_TRANSFER');
    expect(result.durationMs).toBe(512);
  });

  // ---------- Test 10: Rejects invalid input ----------
  it('rejects invalid input (missing required fields)', () => {
    // Missing success field
    expect(() =>
      DryRunSimulationResultSchema.parse({
        policy: { tier: 'INSTANT', allowed: true },
        fee: null,
        balanceChanges: [],
        warnings: [],
        simulation: { success: true, logs: [], unitsConsumed: null, error: null },
        meta: { chain: 'solana', network: 'solana-mainnet', transactionType: 'TRANSFER', durationMs: 1 },
      }),
    ).toThrow();

    // Missing policy field
    expect(() =>
      DryRunSimulationResultSchema.parse({
        success: true,
        fee: null,
        balanceChanges: [],
        warnings: [],
        simulation: { success: true, logs: [], unitsConsumed: null, error: null },
        meta: { chain: 'solana', network: 'solana-mainnet', transactionType: 'TRANSFER', durationMs: 1 },
      }),
    ).toThrow();

    // Invalid tier
    expect(() =>
      DryRunSimulationResultSchema.parse({
        success: true,
        policy: { tier: 'INVALID_TIER', allowed: true },
        fee: null,
        balanceChanges: [],
        warnings: [],
        simulation: { success: true, logs: [], unitsConsumed: null, error: null },
        meta: { chain: 'solana', network: 'solana-mainnet', transactionType: 'TRANSFER', durationMs: 1 },
      }),
    ).toThrow();

    // Invalid chain in meta
    expect(() =>
      DryRunSimulationResultSchema.parse({
        success: true,
        policy: { tier: 'INSTANT', allowed: true },
        fee: null,
        balanceChanges: [],
        warnings: [],
        simulation: { success: true, logs: [], unitsConsumed: null, error: null },
        meta: { chain: 'bitcoin', network: 'bitcoin-mainnet', transactionType: 'TRANSFER', durationMs: 1 },
      }),
    ).toThrow();
  });
});
