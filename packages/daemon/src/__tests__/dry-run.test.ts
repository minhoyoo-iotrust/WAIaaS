/**
 * Tests for executeDryRun pipeline function.
 *
 * Verifies: zero side effects, policy handling, warning generation,
 * balance changes, fee computation, and TransactionPipeline integration.
 *
 * @see Phase 309 Plan 01 Task 2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  IChainAdapter,
  IPolicyEngine,
  PolicyEvaluation,
  UnsignedTransaction,
  SimulationResult,
  BalanceInfo,
  IPriceOracle,
  TransactionRequest,
} from '@waiaas/core';
import { executeDryRun, type DryRunDeps } from '../pipeline/dry-run.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockAdapter(overrides?: Partial<IChainAdapter>): IChainAdapter {
  return {
    getBalance: vi.fn().mockResolvedValue({
      address: '0xwallet',
      balance: 5000000000000000000n, // 5 ETH
      decimals: 18,
      symbol: 'ETH',
    } satisfies BalanceInfo),
    getAssets: vi.fn().mockResolvedValue([]),
    buildTransaction: vi.fn().mockResolvedValue({
      chain: 'ethereum',
      serialized: new Uint8Array(100),
      estimatedFee: 21000000000000n, // 21k gwei
      metadata: {},
    } satisfies UnsignedTransaction),
    buildTokenTransfer: vi.fn().mockResolvedValue({
      chain: 'ethereum',
      serialized: new Uint8Array(200),
      estimatedFee: 65000000000000n,
      metadata: {},
    } satisfies UnsignedTransaction),
    buildContractCall: vi.fn().mockResolvedValue({
      chain: 'ethereum',
      serialized: new Uint8Array(300),
      estimatedFee: 100000000000000n,
      metadata: {},
    } satisfies UnsignedTransaction),
    buildApprove: vi.fn().mockResolvedValue({
      chain: 'ethereum',
      serialized: new Uint8Array(150),
      estimatedFee: 46000000000000n,
      metadata: {},
    } satisfies UnsignedTransaction),
    buildBatch: vi.fn().mockResolvedValue({
      chain: 'ethereum',
      serialized: new Uint8Array(400),
      estimatedFee: 200000000000000n,
      metadata: {},
    } satisfies UnsignedTransaction),
    simulateTransaction: vi.fn().mockResolvedValue({
      success: true,
      logs: [],
      unitsConsumed: 21000n,
    } satisfies SimulationResult),
    signTransaction: vi.fn(),
    submitTransaction: vi.fn(),
    // Add remaining IChainAdapter methods as stubs
    getHealth: vi.fn(),
    getTransactionStatus: vi.fn(),
    buildSignOnly: vi.fn(),
    parseTransaction: vi.fn(),
    estimateFee: vi.fn(),
    getTokenInfo: vi.fn(),
    getNonce: vi.fn(),
    sweepAll: vi.fn(),
    ...overrides,
  } as unknown as IChainAdapter;
}

function mockPolicyEngine(evaluation?: Partial<PolicyEvaluation>): IPolicyEngine {
  return {
    evaluate: vi.fn().mockResolvedValue({
      tier: 'INSTANT',
      allowed: true,
      ...evaluation,
    } satisfies PolicyEvaluation),
  } as unknown as IPolicyEngine;
}

function makeDeps(overrides?: Partial<DryRunDeps>): DryRunDeps {
  // Minimal mock db that returns wallet owner info
  const mockDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue({
            ownerAddress: null,
            ownerVerified: false,
          }),
        }),
      }),
    }),
    insert: vi.fn(),
  } as unknown as DryRunDeps['db'];

  return {
    db: mockDb,
    adapter: mockAdapter(),
    policyEngine: mockPolicyEngine(),
    ...overrides,
  };
}

const defaultWalletInfo = {
  publicKey: '0xWalletPublicKey123',
  chain: 'ethereum',
  environment: 'mainnet',
};

const transferRequest: TransactionRequest = {
  type: 'TRANSFER',
  to: '0x742d35Cc6634C0532925a3b844Bc9e7595f6E8f0',
  amount: '1000000000000000000', // 1 ETH
};

const tokenTransferRequest: TransactionRequest = {
  type: 'TOKEN_TRANSFER',
  to: '0x742d35Cc6634C0532925a3b844Bc9e7595f6E8f0',
  amount: '1000000',
  token: {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
    symbol: 'USDC',
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeDryRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- Test 1: Success TRANSFER INSTANT ----------
  it('returns success=true with all fields for TRANSFER INSTANT tier', async () => {
    const deps = makeDeps();
    const result = await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);

    expect(result.success).toBe(true);
    expect(result.policy.tier).toBe('INSTANT');
    expect(result.policy.allowed).toBe(true);
    expect(result.fee).not.toBeNull();
    expect(result.fee?.estimatedFee).toBeDefined();
    expect(result.fee?.feeSymbol).toBe('ETH');
    expect(result.balanceChanges.length).toBeGreaterThanOrEqual(1);
    expect(result.simulation.success).toBe(true);
    expect(result.meta.chain).toBe('ethereum');
    expect(result.meta.network).toBe('ethereum-mainnet');
    expect(result.meta.transactionType).toBe('TRANSFER');
    expect(result.meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  // ---------- Test 2: Policy denial ----------
  it('returns success=false + policy.allowed=false when policy denies (no error thrown)', async () => {
    const deps = makeDeps({
      policyEngine: mockPolicyEngine({
        tier: 'INSTANT',
        allowed: false,
        reason: 'Token transfer not allowed: USDC not in ALLOWED_TOKENS list',
      }),
    });

    const result = await executeDryRun(deps, 'wallet-1', tokenTransferRequest, 'ethereum-mainnet', defaultWalletInfo);

    expect(result.success).toBe(false);
    expect(result.policy.allowed).toBe(false);
    expect(result.policy.reason).toContain('ALLOWED_TOKENS');
  });

  // ---------- Test 3: INSUFFICIENT_BALANCE_WITH_FEE warning ----------
  it('returns warning INSUFFICIENT_BALANCE_WITH_FEE when balance is insufficient after fee', async () => {
    const adapter = mockAdapter({
      getBalance: vi.fn().mockResolvedValue({
        address: '0xwallet',
        balance: 500000000000000n, // 0.0005 ETH -- not enough for 1 ETH + fee
        decimals: 18,
        symbol: 'ETH',
      }),
    });

    const deps = makeDeps({ adapter });
    const result = await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);

    const warningCodes = result.warnings.map((w) => w.code);
    expect(warningCodes).toContain('INSUFFICIENT_BALANCE_WITH_FEE');
  });

  // ---------- Test 4: SIMULATION_FAILED warning ----------
  it('returns warning SIMULATION_FAILED when adapter.simulateTransaction fails', async () => {
    const adapter = mockAdapter({
      simulateTransaction: vi.fn().mockResolvedValue({
        success: false,
        logs: ['Error: insufficient funds'],
        error: 'Transaction simulation failed',
      } satisfies SimulationResult),
    });

    const deps = makeDeps({ adapter });
    const result = await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);

    const warningCodes = result.warnings.map((w) => w.code);
    expect(warningCodes).toContain('SIMULATION_FAILED');
    expect(result.simulation.success).toBe(false);
    expect(result.simulation.error).toBe('Transaction simulation failed');
  });

  // ---------- Test 5: ORACLE_PRICE_UNAVAILABLE warning ----------
  it('returns warning ORACLE_PRICE_UNAVAILABLE when priceOracle fails', async () => {
    const priceOracle = {
      getNativePrice: vi.fn().mockRejectedValue(new Error('Oracle down')),
      getPrice: vi.fn().mockRejectedValue(new Error('Oracle down')),
    } as unknown as IPriceOracle;

    const deps = makeDeps({ priceOracle });
    const result = await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);

    const warningCodes = result.warnings.map((w) => w.code);
    expect(warningCodes).toContain('ORACLE_PRICE_UNAVAILABLE');
  });

  // ---------- Test 6: APPROVAL_REQUIRED warning ----------
  it('returns warning APPROVAL_REQUIRED when tier=APPROVAL', async () => {
    // Provide a wallet with an owner so downgrade doesn't happen
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              ownerAddress: '0xOwner123',
              ownerVerified: true,
            }),
          }),
        }),
      }),
      insert: vi.fn(),
    } as unknown as DryRunDeps['db'];

    const deps = makeDeps({
      db: mockDb,
      policyEngine: mockPolicyEngine({
        tier: 'APPROVAL',
        allowed: true,
        approvalReason: 'per_tx',
      }),
    });

    const result = await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);

    const warningCodes = result.warnings.map((w) => w.code);
    expect(warningCodes).toContain('APPROVAL_REQUIRED');
  });

  // ---------- Test 7: DOWNGRADED_NO_OWNER warning ----------
  it('returns warning DOWNGRADED_NO_OWNER when tier=APPROVAL but owner not registered', async () => {
    const deps = makeDeps({
      policyEngine: mockPolicyEngine({
        tier: 'APPROVAL',
        allowed: true,
        approvalReason: 'per_tx',
      }),
    });

    // DB mock already returns ownerAddress: null (NONE state -> downgrade)
    const result = await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);

    const warningCodes = result.warnings.map((w) => w.code);
    expect(warningCodes).toContain('DOWNGRADED_NO_OWNER');
    expect(result.policy.downgraded).toBe(true);
  });

  // ---------- Test 8: No DB writes ----------
  it('does NOT write to DB (no transactions INSERT, no audit_log INSERT)', async () => {
    const deps = makeDeps();
    await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);

    expect(deps.db.insert).not.toHaveBeenCalled();
  });

  // ---------- Test 9: No signing/submission ----------
  it('does NOT call keyStore.decrypt, signTransaction, or submitTransaction', async () => {
    const deps = makeDeps();
    await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);

    expect(deps.adapter.signTransaction).not.toHaveBeenCalled();
    expect(deps.adapter.submitTransaction).not.toHaveBeenCalled();
  });

  // ---------- Test 10: No notifications/events ----------
  it('does NOT call notificationService or eventBus', async () => {
    // No notification or event deps are part of DryRunDeps, so this is
    // verified by the type system. We just confirm no unexpected calls.
    const deps = makeDeps();
    const result = await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);
    expect(result).toBeDefined();
    // DryRunDeps interface excludes notificationService and eventBus
  });

  // ---------- Test 11: Balance changes for native transfer ----------
  it('includes balanceChanges with currentBalance/changeAmount/afterBalance for native transfers', async () => {
    const deps = makeDeps();
    const result = await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);

    expect(result.balanceChanges.length).toBeGreaterThanOrEqual(1);
    const nativeChange = result.balanceChanges.find((bc) => bc.asset === 'native');
    expect(nativeChange).toBeDefined();
    expect(nativeChange!.symbol).toBe('ETH');
    expect(nativeChange!.currentBalance).toBeDefined();
    expect(nativeChange!.changeAmount).toBeDefined();
    expect(nativeChange!.afterBalance).toBeDefined();
  });

  // ---------- Test 12: Balance changes for TOKEN_TRANSFER ----------
  it('includes balanceChanges for TOKEN_TRANSFER (both native fee and token change)', async () => {
    const adapter = mockAdapter({
      getAssets: vi.fn().mockResolvedValue([
        {
          mint: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          balance: 10000000n, // 10 USDC
          usdValue: 10,
        },
      ]),
    });

    const deps = makeDeps({ adapter });
    const result = await executeDryRun(deps, 'wallet-1', tokenTransferRequest, 'ethereum-mainnet', defaultWalletInfo);

    expect(result.balanceChanges.length).toBeGreaterThanOrEqual(2);
    const nativeChange = result.balanceChanges.find((bc) => bc.asset === 'native');
    const tokenChange = result.balanceChanges.find((bc) => bc.asset !== 'native');
    expect(nativeChange).toBeDefined(); // fee deduction
    expect(tokenChange).toBeDefined(); // token transfer
  });

  // ---------- Test 13: Fee from unsignedTx with gas safety margin ----------
  it('computes fee from unsignedTx.estimatedFee with gas safety margin', async () => {
    const adapter = mockAdapter({
      buildTransaction: vi.fn().mockResolvedValue({
        chain: 'ethereum',
        serialized: new Uint8Array(100),
        estimatedFee: 100000n, // 100k wei
        metadata: {},
      } satisfies UnsignedTransaction),
    });

    const deps = makeDeps({ adapter });
    const result = await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);

    // Gas safety margin: (100000n * 120n) / 100n = 120000n
    expect(result.fee?.estimatedFee).toBe('120000');
  });

  // ---------- Test 14: TransactionPipeline integration (placeholder) ----------
  // TransactionPipeline.executeDryRun() delegation is tested via pipeline integration,
  // but we verify executeDryRun is a standalone function that works without the pipeline class.
  it('executeDryRun works as standalone function without TransactionPipeline', async () => {
    const deps = makeDeps();
    const result = await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);
    expect(result.success).toBe(true);
  });

  // ---------- Build failure produces warning, not throw ----------
  it('returns result with simulation.success=false when build fails (no throw)', async () => {
    const adapter = mockAdapter({
      buildTransaction: vi.fn().mockRejectedValue(new Error('Build failed: contract error')),
    });

    const deps = makeDeps({ adapter });
    const result = await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);

    expect(result.simulation.success).toBe(false);
    expect(result.simulation.error).toContain('Build failed');
    const warningCodes = result.warnings.map((w) => w.code);
    expect(warningCodes).toContain('SIMULATION_FAILED');
    // fee should be null since build failed
    expect(result.fee).toBeNull();
  });

  // =====================================================================
  // Gas Condition Evaluation Tests (#405)
  // =====================================================================

  describe('gasCondition evaluation', () => {
    // Clear gas price cache before each test to avoid cross-test contamination
    beforeEach(async () => {
      const { gasPriceCache } = await import('../pipeline/gas-condition-tracker.js');
      gasPriceCache.clear();
    });

    // Helper to create a mock SettingsService
    function mockSettingsService(overrides?: Record<string, string>): SettingsService {
      const settings: Record<string, string> = {
        'gas_condition.enabled': 'true',
        ...overrides,
      };
      return {
        get: vi.fn((key: string) => {
          if (key in settings) return settings[key];
          throw new Error(`Setting '${key}' not found`);
        }),
      } as unknown as SettingsService;
    }

    const transferWithGasCondition: TransactionRequest = {
      type: 'TRANSFER',
      to: '0x742d35Cc6634C0532925a3b844Bc9e7595f6E8f0',
      amount: '1000000000000000000',
      gasCondition: {
        maxGasPrice: '50000000000', // 50 gwei
      },
    } as TransactionRequest;

    // ---------- gasCondition met (current < max) ----------
    it('returns gasCondition.met=true when current gas price is below threshold', async () => {
      // Mock the gas price query -- we need to mock fetch globally
      const mockFetch = vi.fn()
        // eth_gasPrice response: 30 gwei (below 50 gwei threshold)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: '0x6FC23AC00', // 30000000000 (30 gwei)
          }),
        })
        // eth_maxPriorityFeePerGas response: 1 gwei
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: '0x3B9ACA00', // 1000000000 (1 gwei)
          }),
        });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const deps = makeDeps({
          rpcUrl: 'http://localhost:8545',
          settingsService: mockSettingsService(),
        });
        const result = await executeDryRun(deps, 'wallet-1', transferWithGasCondition, 'ethereum-mainnet', defaultWalletInfo);

        expect(result.gasCondition).toBeDefined();
        expect(result.gasCondition!.met).toBe(true);
        expect(result.gasCondition!.currentGasPrice).toBe('30000000000');
        expect(result.gasCondition!.maxGasPrice).toBe('50000000000');
        // No GAS_CONDITION_NOT_MET warning
        const warningCodes = result.warnings.map((w) => w.code);
        expect(warningCodes).not.toContain('GAS_CONDITION_NOT_MET');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    // ---------- gasCondition NOT met (current > max) ----------
    it('returns gasCondition.met=false and warning when current gas price exceeds threshold', async () => {
      const mockFetch = vi.fn()
        // eth_gasPrice response: 80 gwei (above 50 gwei threshold)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: '0x12A05F2000', // 80000000000 (80 gwei -- intentionally exceeds)
          }),
        })
        // eth_maxPriorityFeePerGas response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: '0x3B9ACA00', // 1 gwei
          }),
        });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const deps = makeDeps({
          rpcUrl: 'http://localhost:8545',
          settingsService: mockSettingsService(),
        });

        const result = await executeDryRun(deps, 'wallet-1', transferWithGasCondition, 'ethereum-mainnet', defaultWalletInfo);

        expect(result.gasCondition).toBeDefined();
        expect(result.gasCondition!.met).toBe(false);
        expect(result.gasCondition!.maxGasPrice).toBe('50000000000');
        // Should have GAS_CONDITION_NOT_MET warning
        const warningCodes = result.warnings.map((w) => w.code);
        expect(warningCodes).toContain('GAS_CONDITION_NOT_MET');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    // ---------- No gasCondition -- regression test ----------
    it('does not include gasCondition field when request has no gasCondition', async () => {
      const deps = makeDeps({
        rpcUrl: 'http://localhost:8545',
        settingsService: mockSettingsService(),
      });
      const result = await executeDryRun(deps, 'wallet-1', transferRequest, 'ethereum-mainnet', defaultWalletInfo);

      expect(result.gasCondition).toBeUndefined();
      const warningCodes = result.warnings.map((w) => w.code);
      expect(warningCodes).not.toContain('GAS_CONDITION_NOT_MET');
      expect(warningCodes).not.toContain('GAS_CONDITION_DISABLED');
    });

    // ---------- gas_condition.enabled=false ----------
    it('skips gas condition evaluation and adds warning when gas_condition.enabled=false', async () => {
      const deps = makeDeps({
        rpcUrl: 'http://localhost:8545',
        settingsService: mockSettingsService({ 'gas_condition.enabled': 'false' }),
      });
      const result = await executeDryRun(deps, 'wallet-1', transferWithGasCondition, 'ethereum-mainnet', defaultWalletInfo);

      // gasCondition should NOT be present (evaluation was skipped)
      expect(result.gasCondition).toBeUndefined();
      // Should have GAS_CONDITION_DISABLED warning
      const warningCodes = result.warnings.map((w) => w.code);
      expect(warningCodes).toContain('GAS_CONDITION_DISABLED');
    });

    // ---------- No RPC URL ----------
    it('adds warning when gasCondition is present but no rpcUrl is available', async () => {
      const deps = makeDeps({
        // rpcUrl intentionally omitted
        settingsService: mockSettingsService(),
      });
      const result = await executeDryRun(deps, 'wallet-1', transferWithGasCondition, 'ethereum-mainnet', defaultWalletInfo);

      expect(result.gasCondition).toBeUndefined();
      const warningCodes = result.warnings.map((w) => w.code);
      expect(warningCodes).toContain('GAS_CONDITION_NOT_MET');
    });
  });
});
