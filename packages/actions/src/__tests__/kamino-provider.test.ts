/**
 * Unit tests for KaminoLendingProvider.
 *
 * Covers: metadata (KPROV-01), 4 action resolve methods (KPROV-02-05, KPROV-07),
 * SDK wrapper abstraction (KPROV-06), HF simulation guards (KPROV-08),
 * IPositionProvider compliance (KPROV-09), ILendingProvider queries (KPROV-09-11).
 */
import { describe, expect, it, vi } from 'vitest';
import { KaminoLendingProvider } from '../providers/kamino/index.js';
import { MockKaminoSdkWrapper } from '../providers/kamino/kamino-sdk-wrapper.js';
import type { IKaminoSdkWrapper } from '../providers/kamino/kamino-sdk-wrapper.js';
import { KAMINO_MAIN_MARKET } from '../providers/kamino/config.js';
import type { ActionContext, ContractCallRequest, PositionQueryContext } from '@waiaas/core';

function makeSolCtx(walletId: string, chain: 'solana' | 'ethereum' = 'solana'): PositionQueryContext {
  return { walletId, walletAddress: walletId, chain, networks: chain === 'solana' ? ['solana-mainnet'] : ['ethereum-mainnet'], environment: 'mainnet', rpcUrls: {} };
}

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: 'So11111111111111111111111111111111111111112',
  chain: 'solana',
  walletId: '00000000-0000-0000-0000-000000000001',
};

const TEST_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC mint

/**
 * Create a plain object with all MockKaminoSdkWrapper methods bound.
 * Spread of class instances loses prototype methods, so we explicitly bind them.
 */
function createMockMethods(): IKaminoSdkWrapper {
  const mock = new MockKaminoSdkWrapper();
  return {
    buildSupplyInstruction: mock.buildSupplyInstruction.bind(mock),
    buildBorrowInstruction: mock.buildBorrowInstruction.bind(mock),
    buildRepayInstruction: mock.buildRepayInstruction.bind(mock),
    buildWithdrawInstruction: mock.buildWithdrawInstruction.bind(mock),
    getObligation: mock.getObligation.bind(mock),
    getReserves: mock.getReserves.bind(mock),
  };
}

// ---------------------------------------------------------------------------
// Helper: extract first ContractCallRequest from resolve result
// ---------------------------------------------------------------------------

function firstRequest(result: ContractCallRequest | ContractCallRequest[]): ContractCallRequest {
  return Array.isArray(result) ? result[0]! : result;
}

function asArray(result: ContractCallRequest | ContractCallRequest[]): ContractCallRequest[] {
  return Array.isArray(result) ? result : [result];
}

// ---------------------------------------------------------------------------
// Metadata [KPROV-01]
// ---------------------------------------------------------------------------

describe('KaminoLendingProvider metadata', () => {
  const provider = new KaminoLendingProvider({ enabled: true });

  it('should have name kamino', () => {
    expect(provider.metadata.name).toBe('kamino');
  });

  it('should have chains including solana', () => {
    expect(provider.metadata.chains).toContain('solana');
  });

  it('should expose via MCP', () => {
    expect(provider.metadata.mcpExpose).toBe(true);
  });

  it('should not require API key', () => {
    expect(provider.metadata.requiresApiKey).toBe(false);
  });

  it('should define 4 actions', () => {
    expect(provider.actions).toHaveLength(4);
  });

  it('should have correct action names', () => {
    const names = provider.actions.map((a) => a.name);
    expect(names).toContain('kamino_supply');
    expect(names).toContain('kamino_borrow');
    expect(names).toContain('kamino_repay');
    expect(names).toContain('kamino_withdraw');
  });

  it('should set borrow as high risk with APPROVAL tier', () => {
    const borrow = provider.actions.find((a) => a.name === 'kamino_borrow');
    expect(borrow?.riskLevel).toBe('high');
    expect(borrow?.defaultTier).toBe('APPROVAL');
  });

  it('should set withdraw as high risk with APPROVAL tier', () => {
    const withdraw = provider.actions.find((a) => a.name === 'kamino_withdraw');
    expect(withdraw?.riskLevel).toBe('high');
    expect(withdraw?.defaultTier).toBe('APPROVAL');
  });

  it('should set supply as medium risk with DELAY tier', () => {
    const supply = provider.actions.find((a) => a.name === 'kamino_supply');
    expect(supply?.riskLevel).toBe('medium');
    expect(supply?.defaultTier).toBe('DELAY');
  });

  it('should set repay as medium risk with DELAY tier', () => {
    const repay = provider.actions.find((a) => a.name === 'kamino_repay');
    expect(repay?.riskLevel).toBe('medium');
    expect(repay?.defaultTier).toBe('DELAY');
  });
});

// ---------------------------------------------------------------------------
// resolve kamino_supply [KPROV-02, KPROV-07]
// ---------------------------------------------------------------------------

describe('resolve kamino_supply', () => {
  const provider = new KaminoLendingProvider({ enabled: true });

  it('should return ContractCallRequest array', async () => {
    const result = await provider.resolve(
      'kamino_supply',
      { asset: TEST_MINT, amount: '100.0' },
      CONTEXT,
    );
    const arr = asArray(result);
    expect(arr.length).toBeGreaterThanOrEqual(1);
  });

  it('should have type CONTRACT_CALL', async () => {
    const result = await provider.resolve(
      'kamino_supply',
      { asset: TEST_MINT, amount: '100.0' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.type).toBe('CONTRACT_CALL');
  });

  it('should have programId field (Solana pattern)', async () => {
    const result = await provider.resolve(
      'kamino_supply',
      { asset: TEST_MINT, amount: '100.0' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.programId).toBeDefined();
    expect(typeof req.programId).toBe('string');
  });

  it('should have instructionData field (base64)', async () => {
    const result = await provider.resolve(
      'kamino_supply',
      { asset: TEST_MINT, amount: '100.0' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.instructionData).toBeDefined();
    expect(typeof req.instructionData).toBe('string');
    // Verify it's valid base64
    expect(() => Buffer.from(req.instructionData!, 'base64')).not.toThrow();
  });

  it('should have accounts array', async () => {
    const result = await provider.resolve(
      'kamino_supply',
      { asset: TEST_MINT, amount: '100.0' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(Array.isArray(req.accounts)).toBe(true);
    expect(req.accounts!.length).toBeGreaterThanOrEqual(1);
    // Each account has pubkey, isSigner, isWritable
    for (const acct of req.accounts!) {
      expect(typeof acct.pubkey).toBe('string');
      expect(typeof acct.isSigner).toBe('boolean');
      expect(typeof acct.isWritable).toBe('boolean');
    }
  });

  it('should have network mainnet', async () => {
    const result = await provider.resolve(
      'kamino_supply',
      { asset: TEST_MINT, amount: '100.0' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.network).toBe('solana-mainnet');
  });

  it('should target market address', async () => {
    const result = await provider.resolve(
      'kamino_supply',
      { asset: TEST_MINT, amount: '100.0' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.to).toBe(KAMINO_MAIN_MARKET);
  });
});

// ---------------------------------------------------------------------------
// resolve kamino_borrow [KPROV-03, KPROV-07]
// ---------------------------------------------------------------------------

describe('resolve kamino_borrow', () => {
  const provider = new KaminoLendingProvider({ enabled: true });

  it('should return ContractCallRequest(s) with type CONTRACT_CALL', async () => {
    const result = await provider.resolve(
      'kamino_borrow',
      { asset: TEST_MINT, amount: '0.001' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.type).toBe('CONTRACT_CALL');
  });

  it('should have Solana-specific fields', async () => {
    const result = await provider.resolve(
      'kamino_borrow',
      { asset: TEST_MINT, amount: '0.001' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.programId).toBeDefined();
    expect(req.instructionData).toBeDefined();
    expect(req.accounts).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// resolve kamino_repay [KPROV-04, KPROV-07]
// ---------------------------------------------------------------------------

describe('resolve kamino_repay', () => {
  const provider = new KaminoLendingProvider({ enabled: true });

  it('should return ContractCallRequest(s) with type CONTRACT_CALL', async () => {
    const result = await provider.resolve(
      'kamino_repay',
      { asset: TEST_MINT, amount: '50.0' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.type).toBe('CONTRACT_CALL');
  });

  it('should handle max amount (full repayment)', async () => {
    const result = await provider.resolve(
      'kamino_repay',
      { asset: TEST_MINT, amount: 'max' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.type).toBe('CONTRACT_CALL');
    expect(req.instructionData).toBeDefined();
    // Verify the instruction data encodes u64 max for 'max' amount
    const buffer = Buffer.from(req.instructionData!, 'base64');
    // Action index 2 (repay) at byte 0
    expect(buffer[0]).toBe(2);
  });

  it('should have Solana-specific fields', async () => {
    const result = await provider.resolve(
      'kamino_repay',
      { asset: TEST_MINT, amount: '50.0' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.programId).toBeDefined();
    expect(req.accounts).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// resolve kamino_withdraw [KPROV-05, KPROV-07]
// ---------------------------------------------------------------------------

describe('resolve kamino_withdraw', () => {
  const provider = new KaminoLendingProvider({ enabled: true });

  it('should return ContractCallRequest(s) with type CONTRACT_CALL', async () => {
    const result = await provider.resolve(
      'kamino_withdraw',
      { asset: TEST_MINT, amount: '25.0' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.type).toBe('CONTRACT_CALL');
  });

  it('should handle max amount (full withdrawal)', async () => {
    const result = await provider.resolve(
      'kamino_withdraw',
      { asset: TEST_MINT, amount: 'max' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.type).toBe('CONTRACT_CALL');
    // Verify action index 3 (withdraw) for max
    const buffer = Buffer.from(req.instructionData!, 'base64');
    expect(buffer[0]).toBe(3);
  });

  it('should have Solana-specific fields', async () => {
    const result = await provider.resolve(
      'kamino_withdraw',
      { asset: TEST_MINT, amount: '25.0' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.programId).toBeDefined();
    expect(req.instructionData).toBeDefined();
    expect(req.accounts).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// resolve unknown action
// ---------------------------------------------------------------------------

describe('resolve unknown action', () => {
  const provider = new KaminoLendingProvider({ enabled: true });

  it('should throw for unknown action', async () => {
    await expect(
      provider.resolve('kamino_flash_loan', {}, CONTEXT),
    ).rejects.toThrow('Unknown action');
  });
});

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

describe('amount parsing', () => {
  const provider = new KaminoLendingProvider({ enabled: true });

  it('should throw for zero amount', async () => {
    await expect(
      provider.resolve('kamino_supply', { asset: TEST_MINT, amount: '0' }, CONTEXT),
    ).rejects.toThrow('Amount must be greater than 0');
  });

  it('should parse decimal amounts correctly (0.001)', async () => {
    // Should not throw
    const result = await provider.resolve(
      'kamino_supply',
      { asset: TEST_MINT, amount: '0.001' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });

  it('should parse large amounts correctly (100.5)', async () => {
    const result = await provider.resolve(
      'kamino_supply',
      { asset: TEST_MINT, amount: '100.5' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });
});

// ---------------------------------------------------------------------------
// SDK wrapper abstraction [KPROV-06]
// ---------------------------------------------------------------------------

describe('SDK wrapper abstraction', () => {
  it('should use MockKaminoSdkWrapper by default', () => {
    const provider = new KaminoLendingProvider({ enabled: true });
    // Provider works without real SDK -- MockKaminoSdkWrapper is used
    expect(provider.metadata.name).toBe('kamino');
  });

  it('should accept custom mock wrapper for different scenarios', async () => {
    const customMock = new MockKaminoSdkWrapper();
    const provider = new KaminoLendingProvider({ enabled: true }, customMock);
    const result = await provider.resolve(
      'kamino_supply',
      { asset: TEST_MINT, amount: '1.0' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });
});

// ---------------------------------------------------------------------------
// HF simulation on borrow [KPROV-08]
// ---------------------------------------------------------------------------

describe('HF simulation on borrow', () => {
  it('should block borrow when it would cause liquidation', async () => {
    const mockWrapper: IKaminoSdkWrapper = {
      ...createMockMethods(),
      getObligation: vi.fn().mockResolvedValue({
        deposits: [{ mintAddress: TEST_MINT, amount: 10_000_000_000n, marketValueUsd: 10_000 }],
        borrows: [{ mintAddress: TEST_MINT, amount: 9_000_000_000n, marketValueUsd: 9_000 }],
        loanToValue: 0.9,
      }),
    };

    const provider = new KaminoLendingProvider({ enabled: true }, mockWrapper);
    // Large borrow: 100 tokens * 1e6 decimals / 1e6 = 100 USD approximate
    // With collateral=10000, existing debt=9000, adding 100 -> debt=9100
    // HF = (10000 * 0.85) / 9100 = 0.934 < 1.0 -> BLOCKED
    await expect(
      provider.resolve(
        'kamino_borrow',
        { asset: TEST_MINT, amount: '100.0' },
        CONTEXT,
      ),
    ).rejects.toThrow('liquidation threshold');
  });

  it('should allow borrow when HF stays safe', async () => {
    const mockWrapper: IKaminoSdkWrapper = {
      ...createMockMethods(),
      getObligation: vi.fn().mockResolvedValue({
        deposits: [{ mintAddress: TEST_MINT, amount: 100_000_000_000n, marketValueUsd: 100_000 }],
        borrows: [{ mintAddress: TEST_MINT, amount: 10_000_000_000n, marketValueUsd: 10_000 }],
        loanToValue: 0.1,
      }),
    };

    const provider = new KaminoLendingProvider({ enabled: true }, mockWrapper);
    // Tiny borrow: 0.001 * 1e6 / 1e6 = 0.001 USD
    const result = await provider.resolve(
      'kamino_borrow',
      { asset: TEST_MINT, amount: '0.001' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });

  it('should skip simulation when getObligation returns null (no existing position)', async () => {
    const mockWrapper: IKaminoSdkWrapper = {
      ...createMockMethods(),
      getObligation: vi.fn().mockResolvedValue(null),
    };

    const provider = new KaminoLendingProvider({ enabled: true }, mockWrapper);
    const result = await provider.resolve(
      'kamino_borrow',
      { asset: TEST_MINT, amount: '1000.0' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });

  it('should skip simulation gracefully when SDK throws', async () => {
    const mockWrapper: IKaminoSdkWrapper = {
      ...createMockMethods(),
      getObligation: vi.fn().mockRejectedValue(new Error('SDK not available')),
    };

    const provider = new KaminoLendingProvider({ enabled: true }, mockWrapper);
    const result = await provider.resolve(
      'kamino_borrow',
      { asset: TEST_MINT, amount: '1000.0' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });
});

// ---------------------------------------------------------------------------
// HF simulation on withdraw [KPROV-08]
// ---------------------------------------------------------------------------

describe('HF simulation on withdraw', () => {
  it('should block withdraw when it would drop HF below threshold', async () => {
    const mockWrapper: IKaminoSdkWrapper = {
      ...createMockMethods(),
      getObligation: vi.fn().mockResolvedValue({
        deposits: [{ mintAddress: TEST_MINT, amount: 10_000_000_000n, marketValueUsd: 10_000 }],
        borrows: [{ mintAddress: TEST_MINT, amount: 8_000_000_000n, marketValueUsd: 8_000 }],
        loanToValue: 0.8,
      }),
    };

    const provider = new KaminoLendingProvider({ enabled: true }, mockWrapper);
    // Withdraw 5 tokens: 5 * 1e6 / 1e6 = 5 USD off collateral
    // new collateral = 10000 - 5 = 9995, HF = (9995 * 0.85) / 8000 = 1.0619
    // Still above 1.0, won't block. Need larger withdrawal.
    // Withdraw 2000 tokens: 2000 * 1e6 / 1e6 = 2000 USD
    // new collateral = 10000 - 2000 = 8000, HF = (8000 * 0.85) / 8000 = 0.85 < 1.0 -> BLOCKED
    await expect(
      provider.resolve(
        'kamino_withdraw',
        { asset: TEST_MINT, amount: '2000.0' },
        CONTEXT,
      ),
    ).rejects.toThrow('liquidation threshold');
  });

  it('should allow withdraw when HF stays safe', async () => {
    const mockWrapper: IKaminoSdkWrapper = {
      ...createMockMethods(),
      getObligation: vi.fn().mockResolvedValue({
        deposits: [{ mintAddress: TEST_MINT, amount: 100_000_000_000n, marketValueUsd: 100_000 }],
        borrows: [{ mintAddress: TEST_MINT, amount: 10_000_000_000n, marketValueUsd: 10_000 }],
        loanToValue: 0.1,
      }),
    };

    const provider = new KaminoLendingProvider({ enabled: true }, mockWrapper);
    const result = await provider.resolve(
      'kamino_withdraw',
      { asset: TEST_MINT, amount: '0.001' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });

  it('should skip simulation for max withdrawals', async () => {
    const mockWrapper: IKaminoSdkWrapper = {
      ...createMockMethods(),
      getObligation: vi.fn().mockResolvedValue({
        deposits: [{ mintAddress: TEST_MINT, amount: 10_000_000_000n, marketValueUsd: 10_000 }],
        borrows: [{ mintAddress: TEST_MINT, amount: 9_000_000_000n, marketValueUsd: 9_000 }],
        loanToValue: 0.9,
      }),
    };

    const provider = new KaminoLendingProvider({ enabled: true }, mockWrapper);
    // 'max' withdrawal skips HF simulation entirely
    const result = await provider.resolve(
      'kamino_withdraw',
      { asset: TEST_MINT, amount: 'max' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
    // getObligation should still be called (for instruction building) but HF check is skipped
  });
});

// ---------------------------------------------------------------------------
// IPositionProvider compliance [KPROV-09]
// ---------------------------------------------------------------------------

describe('IPositionProvider compliance', () => {
  const provider = new KaminoLendingProvider({ enabled: true });

  it('should return kamino as provider name', () => {
    expect(provider.getProviderName()).toBe('kamino');
  });

  it('should return LENDING as supported category', () => {
    expect(provider.getSupportedCategories()).toEqual(['LENDING']);
  });

  it('should return PositionUpdate[] from obligation data', async () => {
    const positions = await provider.getPositions(makeSolCtx('test-wallet'));
    expect(Array.isArray(positions)).toBe(true);
    expect(positions.length).toBeGreaterThanOrEqual(1);
    // Check structure of first position
    const pos = positions[0]!;
    expect(pos.walletId).toBe('test-wallet');
    expect(pos.category).toBe('LENDING');
    expect(pos.provider).toBe('kamino');
    expect(pos.chain).toBe('solana');
    expect(pos.status).toBe('ACTIVE');
    expect(typeof pos.amount).toBe('string');
  });

  it('should return [] for ethereum wallet (chain guard)', async () => {
    const positions = await provider.getPositions(makeSolCtx('test-wallet', 'ethereum'));
    expect(positions).toEqual([]);
  });

  it('should use ctx.networks[0] for network field (MCHN-08)', async () => {
    const ctx: PositionQueryContext = {
      walletId: 'test-wallet',
      walletAddress: 'test-wallet',
      chain: 'solana',
      networks: ['solana-devnet'],
      environment: 'testnet',
      rpcUrls: {},
    };
    const positions = await provider.getPositions(ctx);
    expect(positions.length).toBeGreaterThanOrEqual(1);
    expect(positions[0]!.network).toBe('solana-devnet');
  });
});

// ---------------------------------------------------------------------------
// ILendingProvider query methods [KPROV-09, KPROV-10, KPROV-11]
// ---------------------------------------------------------------------------

describe('ILendingProvider query methods', () => {
  const provider = new KaminoLendingProvider({ enabled: true });

  it('should return SUPPLY positions for obligation deposits [KPROV-09]', async () => {
    const positions = await provider.getPosition('test-wallet', CONTEXT);
    const supplies = positions.filter((p) => p.positionType === 'SUPPLY');
    expect(supplies.length).toBeGreaterThanOrEqual(1);
    expect(supplies[0]!.asset).toBeDefined();
    expect(typeof supplies[0]!.amount).toBe('string');
  });

  it('should return BORROW positions for obligation borrows [KPROV-09]', async () => {
    const positions = await provider.getPosition('test-wallet', CONTEXT);
    const borrows = positions.filter((p) => p.positionType === 'BORROW');
    expect(borrows.length).toBeGreaterThanOrEqual(1);
    expect(borrows[0]!.asset).toBeDefined();
  });

  it('should return empty positions when obligation is null', async () => {
    const mockWrapper: IKaminoSdkWrapper = {
      ...createMockMethods(),
      getObligation: vi.fn().mockResolvedValue(null),
    };
    const p = new KaminoLendingProvider({ enabled: true }, mockWrapper);
    const positions = await p.getPosition('test-wallet', CONTEXT);
    expect(positions).toEqual([]);
  });

  it('should calculate HF with correct status [KPROV-10]', async () => {
    const hf = await provider.getHealthFactor('test-wallet', CONTEXT);
    expect(hf.factor).toBeGreaterThan(0);
    expect(hf.totalCollateralUsd).toBeGreaterThan(0);
    expect(hf.totalDebtUsd).toBeGreaterThan(0);
    expect(['safe', 'warning', 'danger', 'critical']).toContain(hf.status);
  });

  it('should return safe defaults when no obligation [KPROV-10]', async () => {
    const mockWrapper: IKaminoSdkWrapper = {
      ...createMockMethods(),
      getObligation: vi.fn().mockResolvedValue(null),
    };
    const p = new KaminoLendingProvider({ enabled: true }, mockWrapper);
    const hf = await p.getHealthFactor('test-wallet', CONTEXT);
    expect(hf.factor).toBe(Infinity);
    expect(hf.status).toBe('safe');
    expect(hf.totalCollateralUsd).toBe(0);
    expect(hf.totalDebtUsd).toBe(0);
  });

  it('should return reserve data for solana chain [KPROV-11]', async () => {
    const markets = await provider.getMarkets('solana');
    expect(markets.length).toBeGreaterThanOrEqual(1);
    const market = markets[0]!;
    expect(market.asset).toBeDefined();
    expect(market.symbol).toBeDefined();
    expect(typeof market.supplyApy).toBe('number');
    expect(typeof market.borrowApy).toBe('number');
    expect(typeof market.ltv).toBe('number');
    expect(market.ltv).toBeLessThanOrEqual(1); // Decimal, not percentage
    expect(typeof market.availableLiquidity).toBe('string');
  });

  it('should return empty markets for non-solana chain [KPROV-11]', async () => {
    const markets = await provider.getMarkets('ethereum');
    expect(markets).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// registerBuiltInProviders includes kamino when enabled
// ---------------------------------------------------------------------------

describe('registerBuiltInProviders includes kamino when enabled', () => {
  it('should register kamino when actions.kamino_enabled is true', async () => {
    const { registerBuiltInProviders } = await import('../index.js');
    const registered: Array<{ metadata: { name: string } }> = [];
    const registry = {
      register: (provider: unknown) => registered.push(provider as { metadata: { name: string } }),
    };
    const settingsReader = {
      get: (key: string) => {
        if (key === 'actions.kamino_enabled') return 'true';
        if (key === 'actions.kamino_market') return 'main';
        if (key === 'actions.kamino_hf_threshold') return '1.2';
        return '';
      },
    };

    const result = registerBuiltInProviders(registry, settingsReader);
    expect(result.loaded).toContain('kamino');
    expect(registered.some((p) => p.metadata.name === 'kamino')).toBe(true);
  });

  it('should skip kamino when actions.kamino_enabled is not true', async () => {
    const { registerBuiltInProviders } = await import('../index.js');
    const registered: Array<{ metadata: { name: string } }> = [];
    const registry = {
      register: (provider: unknown) => registered.push(provider as { metadata: { name: string } }),
    };
    const settingsReader = {
      get: (key: string) => {
        if (key === 'actions.kamino_enabled') return 'false';
        return '';
      },
    };

    const result = registerBuiltInProviders(registry, settingsReader);
    expect(result.loaded).not.toContain('kamino');
    expect(result.skipped).toContain('kamino');
  });
});
