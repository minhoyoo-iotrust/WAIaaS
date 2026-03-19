/**
 * Unit tests for DriftPerpProvider.
 *
 * Covers: metadata (DRIFT-01..08), 5 action resolve methods,
 * SDK wrapper abstraction (DRIFT-05), IPerpProvider query methods (DRIFT-06),
 * IPositionProvider compliance, and graceful degradation on SDK errors.
 */
import { describe, expect, it, vi } from 'vitest';
import { DriftPerpProvider } from '../providers/drift/index.js';
import { MockDriftSdkWrapper } from '../providers/drift/drift-sdk-wrapper.js';
import type { IDriftSdkWrapper } from '../providers/drift/drift-sdk-wrapper.js';
import { DRIFT_PROGRAM_ID } from '../providers/drift/config.js';
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

// ---------------------------------------------------------------------------
// Helpers (following kamino-provider.test.ts pattern)
// ---------------------------------------------------------------------------

function firstRequest(result: ContractCallRequest | ContractCallRequest[]): ContractCallRequest {
  return Array.isArray(result) ? result[0]! : result;
}

function asArray(result: ContractCallRequest | ContractCallRequest[]): ContractCallRequest[] {
  return Array.isArray(result) ? result : [result];
}

/**
 * Create a plain object with all MockDriftSdkWrapper methods bound.
 * Spread of class instances loses prototype methods, so we explicitly bind them.
 */
function createMockMethods(): IDriftSdkWrapper {
  const mock = new MockDriftSdkWrapper();
  return {
    buildOpenPositionInstruction: mock.buildOpenPositionInstruction.bind(mock),
    buildClosePositionInstruction: mock.buildClosePositionInstruction.bind(mock),
    buildModifyPositionInstruction: mock.buildModifyPositionInstruction.bind(mock),
    buildDepositInstruction: mock.buildDepositInstruction.bind(mock),
    buildWithdrawInstruction: mock.buildWithdrawInstruction.bind(mock),
    getPositions: mock.getPositions.bind(mock),
    getMarginInfo: mock.getMarginInfo.bind(mock),
    getMarkets: mock.getMarkets.bind(mock),
  };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('DriftPerpProvider metadata', () => {
  const provider = new DriftPerpProvider({ enabled: true });

  it('should have name drift_perp', () => {
    expect(provider.metadata.name).toBe('drift_perp');
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

  it('should define 5 actions', () => {
    expect(provider.actions).toHaveLength(5);
  });

  it('should have correct action names', () => {
    const names = provider.actions.map((a) => a.name);
    expect(names).toContain('drift_open_position');
    expect(names).toContain('drift_close_position');
    expect(names).toContain('drift_modify_position');
    expect(names).toContain('drift_add_margin');
    expect(names).toContain('drift_withdraw_margin');
  });

  it('should set drift_open_position as high risk with APPROVAL tier', () => {
    const action = provider.actions.find((a) => a.name === 'drift_open_position');
    expect(action?.riskLevel).toBe('high');
    expect(action?.defaultTier).toBe('APPROVAL');
  });

  it('should set drift_close_position as medium risk with DELAY tier', () => {
    const action = provider.actions.find((a) => a.name === 'drift_close_position');
    expect(action?.riskLevel).toBe('medium');
    expect(action?.defaultTier).toBe('DELAY');
  });

  it('should set drift_add_margin as low risk with INSTANT tier', () => {
    const action = provider.actions.find((a) => a.name === 'drift_add_margin');
    expect(action?.riskLevel).toBe('low');
    expect(action?.defaultTier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// resolve drift_open_position [DRIFT-01, DRIFT-07]
// ---------------------------------------------------------------------------

describe('resolve drift_open_position', () => {
  const provider = new DriftPerpProvider({ enabled: true });

  it('should return ContractCallRequest[] with type CONTRACT_CALL (MARKET order)', async () => {
    const result = await provider.resolve(
      'drift_open_position',
      { market: 'SOL-PERP', direction: 'LONG', size: '100', orderType: 'MARKET' },
      CONTEXT,
    );
    const arr = asArray(result);
    expect(arr.length).toBeGreaterThanOrEqual(1);
    expect(arr[0]!.type).toBe('CONTRACT_CALL');
  });

  it('should have programId === DRIFT_PROGRAM_ID', async () => {
    const result = await provider.resolve(
      'drift_open_position',
      { market: 'SOL-PERP', direction: 'LONG', size: '100', orderType: 'MARKET' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.programId).toBe(DRIFT_PROGRAM_ID);
  });

  it('should have valid base64 instructionData', async () => {
    const result = await provider.resolve(
      'drift_open_position',
      { market: 'SOL-PERP', direction: 'LONG', size: '100', orderType: 'MARKET' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(typeof req.instructionData).toBe('string');
    expect(() => Buffer.from(req.instructionData!, 'base64')).not.toThrow();
  });

  it('should have accounts array with at least 1 entry', async () => {
    const result = await provider.resolve(
      'drift_open_position',
      { market: 'SOL-PERP', direction: 'LONG', size: '100', orderType: 'MARKET' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(Array.isArray(req.accounts)).toBe(true);
    expect(req.accounts!.length).toBeGreaterThanOrEqual(1);
  });

  it('should have network solana-mainnet', async () => {
    const result = await provider.resolve(
      'drift_open_position',
      { market: 'SOL-PERP', direction: 'LONG', size: '100', orderType: 'MARKET' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.network).toBe('solana-mainnet');
  });

  it('should have to === DRIFT_PROGRAM_ID', async () => {
    const result = await provider.resolve(
      'drift_open_position',
      { market: 'SOL-PERP', direction: 'LONG', size: '100', orderType: 'MARKET' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.to).toBe(DRIFT_PROGRAM_ID);
  });

  it('should handle LIMIT order with limitPrice [DRIFT-07]', async () => {
    const result = await provider.resolve(
      'drift_open_position',
      { market: 'SOL-PERP', direction: 'SHORT', size: '50', orderType: 'LIMIT', limitPrice: '155.0' },
      CONTEXT,
    );
    const arr = asArray(result);
    expect(arr.length).toBeGreaterThanOrEqual(1);
    expect(arr[0]!.type).toBe('CONTRACT_CALL');
  });
});

// ---------------------------------------------------------------------------
// resolve drift_close_position [DRIFT-02]
// ---------------------------------------------------------------------------

describe('resolve drift_close_position', () => {
  const provider = new DriftPerpProvider({ enabled: true });

  it('should return CONTRACT_CALL for full close (no size)', async () => {
    const result = await provider.resolve(
      'drift_close_position',
      { market: 'SOL-PERP' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });

  it('should return CONTRACT_CALL for partial close (with size)', async () => {
    const result = await provider.resolve(
      'drift_close_position',
      { market: 'SOL-PERP', size: '50' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });

  it('should have correct Solana fields (programId, instructionData, accounts)', async () => {
    const result = await provider.resolve(
      'drift_close_position',
      { market: 'SOL-PERP' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.programId).toBe(DRIFT_PROGRAM_ID);
    expect(typeof req.instructionData).toBe('string');
    expect(Array.isArray(req.accounts)).toBe(true);
  });

  it('should have network solana-mainnet', async () => {
    const result = await provider.resolve(
      'drift_close_position',
      { market: 'SOL-PERP' },
      CONTEXT,
    );
    expect(firstRequest(result).network).toBe('solana-mainnet');
  });
});

// ---------------------------------------------------------------------------
// resolve drift_modify_position [DRIFT-03]
// ---------------------------------------------------------------------------

describe('resolve drift_modify_position', () => {
  const provider = new DriftPerpProvider({ enabled: true });

  it('should return CONTRACT_CALL with newSize', async () => {
    const result = await provider.resolve(
      'drift_modify_position',
      { market: 'SOL-PERP', newSize: '200' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });

  it('should return CONTRACT_CALL with newLimitPrice', async () => {
    const result = await provider.resolve(
      'drift_modify_position',
      { market: 'SOL-PERP', newLimitPrice: '160.0' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });

  it('should return CONTRACT_CALL with both newSize and newLimitPrice', async () => {
    const result = await provider.resolve(
      'drift_modify_position',
      { market: 'SOL-PERP', newSize: '300', newLimitPrice: '170.0' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });
});

// ---------------------------------------------------------------------------
// resolve drift_add_margin [DRIFT-04]
// ---------------------------------------------------------------------------

describe('resolve drift_add_margin', () => {
  const provider = new DriftPerpProvider({ enabled: true });

  it('should return CONTRACT_CALL with Solana fields', async () => {
    const result = await provider.resolve(
      'drift_add_margin',
      { amount: '500', asset: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.type).toBe('CONTRACT_CALL');
    expect(req.programId).toBeDefined();
    expect(req.instructionData).toBeDefined();
    expect(req.accounts).toBeDefined();
  });

  it('should have correct programId', async () => {
    const result = await provider.resolve(
      'drift_add_margin',
      { amount: '500', asset: 'USDC' },
      CONTEXT,
    );
    expect(firstRequest(result).programId).toBe(DRIFT_PROGRAM_ID);
  });

  it('should have network solana-mainnet', async () => {
    const result = await provider.resolve(
      'drift_add_margin',
      { amount: '500', asset: 'USDC' },
      CONTEXT,
    );
    expect(firstRequest(result).network).toBe('solana-mainnet');
  });
});

// ---------------------------------------------------------------------------
// resolve drift_withdraw_margin [DRIFT-04]
// ---------------------------------------------------------------------------

describe('resolve drift_withdraw_margin', () => {
  const provider = new DriftPerpProvider({ enabled: true });

  it('should return CONTRACT_CALL with Solana fields', async () => {
    const result = await provider.resolve(
      'drift_withdraw_margin',
      { amount: '200', asset: 'USDC' },
      CONTEXT,
    );
    const req = firstRequest(result);
    expect(req.type).toBe('CONTRACT_CALL');
    expect(req.programId).toBeDefined();
    expect(req.instructionData).toBeDefined();
    expect(req.accounts).toBeDefined();
  });

  it('should have correct programId', async () => {
    const result = await provider.resolve(
      'drift_withdraw_margin',
      { amount: '200', asset: 'USDC' },
      CONTEXT,
    );
    expect(firstRequest(result).programId).toBe(DRIFT_PROGRAM_ID);
  });

  it('should have network solana-mainnet', async () => {
    const result = await provider.resolve(
      'drift_withdraw_margin',
      { amount: '200', asset: 'USDC' },
      CONTEXT,
    );
    expect(firstRequest(result).network).toBe('solana-mainnet');
  });
});

// ---------------------------------------------------------------------------
// resolve unknown action
// ---------------------------------------------------------------------------

describe('resolve unknown action', () => {
  const provider = new DriftPerpProvider({ enabled: true });

  it('should throw for unknown action name', async () => {
    await expect(
      provider.resolve('drift_flash_loan', {}, CONTEXT),
    ).rejects.toThrow('Unknown action');
  });
});

// ---------------------------------------------------------------------------
// SDK wrapper abstraction [DRIFT-05]
// ---------------------------------------------------------------------------

describe('SDK wrapper abstraction', () => {
  it('should use MockDriftSdkWrapper by default (provider works without real SDK)', () => {
    const provider = new DriftPerpProvider({ enabled: true });
    expect(provider.metadata.name).toBe('drift_perp');
  });

  it('should accept custom mock wrapper via constructor', async () => {
    const customMock = new MockDriftSdkWrapper();
    const provider = new DriftPerpProvider({ enabled: true }, customMock);
    const result = await provider.resolve(
      'drift_open_position',
      { market: 'SOL-PERP', direction: 'LONG', size: '100', orderType: 'MARKET' },
      CONTEXT,
    );
    expect(firstRequest(result).type).toBe('CONTRACT_CALL');
  });
});

// ---------------------------------------------------------------------------
// IPerpProvider query methods [DRIFT-06]
// ---------------------------------------------------------------------------

describe('IPerpProvider query methods', () => {
  const provider = new DriftPerpProvider({ enabled: true });

  it('should return PerpPositionSummary[] with correct structure from getPosition', async () => {
    const positions = await provider.getPosition('test-wallet', CONTEXT);
    expect(Array.isArray(positions)).toBe(true);
    expect(positions.length).toBeGreaterThanOrEqual(1);
    const pos = positions[0]!;
    expect(typeof pos.market).toBe('string');
    expect(typeof pos.direction).toBe('string');
    expect(typeof pos.size).toBe('string');
    expect(typeof pos.leverage).toBe('number');
  });

  it('should have market, direction, size, leverage fields on positions', async () => {
    const positions = await provider.getPosition('test-wallet', CONTEXT);
    const pos = positions[0]!;
    expect(pos.market).toBe('SOL-PERP');
    expect(pos.direction).toBe('LONG');
    expect(pos.size).toBe('100');
    expect(pos.leverage).toBe(5);
  });

  it('should return empty array when wrapper returns empty positions', async () => {
    const mockWrapper: IDriftSdkWrapper = {
      ...createMockMethods(),
      getPositions: vi.fn().mockResolvedValue([]),
    };
    const p = new DriftPerpProvider({ enabled: true }, mockWrapper);
    const positions = await p.getPosition('test-wallet', CONTEXT);
    expect(positions).toEqual([]);
  });

  it('should return MarginInfo with status field from getMarginInfo', async () => {
    const info = await provider.getMarginInfo('test-wallet', CONTEXT);
    expect(info).toBeDefined();
    expect(typeof info.totalMargin).toBe('number');
    expect(typeof info.freeMargin).toBe('number');
    expect(typeof info.marginRatio).toBe('number');
    expect(typeof info.status).toBe('string');
  });

  it('should have status as one of safe/warning/danger/critical', async () => {
    const info = await provider.getMarginInfo('test-wallet', CONTEXT);
    expect(['safe', 'warning', 'danger', 'critical']).toContain(info.status);
  });

  it('should map marginRatio=0.3 to warning status (at boundary)', async () => {
    // MockDriftSdkWrapper returns marginRatio: 0.3
    const info = await provider.getMarginInfo('test-wallet', CONTEXT);
    expect(info.marginRatio).toBe(0.3);
    expect(info.status).toBe('warning');
  });

  it('should return PerpMarketInfo[] from getMarkets for solana chain', async () => {
    const markets = await provider.getMarkets('solana');
    expect(markets.length).toBeGreaterThanOrEqual(1);
    const m = markets[0]!;
    expect(typeof m.market).toBe('string');
    expect(typeof m.baseAsset).toBe('string');
    expect(typeof m.maxLeverage).toBe('number');
  });

  it('should return empty array from getMarkets for non-solana chain', async () => {
    const markets = await provider.getMarkets('ethereum');
    expect(markets).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// IPositionProvider compliance
// ---------------------------------------------------------------------------

describe('IPositionProvider compliance', () => {
  const provider = new DriftPerpProvider({ enabled: true });

  it('should return drift_perp as provider name', () => {
    expect(provider.getProviderName()).toBe('drift_perp');
  });

  it('should return PERP as supported category', () => {
    expect(provider.getSupportedCategories()).toEqual(['PERP']);
  });

  it('should return PositionUpdate[] with category=PERP from getPositions', async () => {
    const positions = await provider.getPositions(makeSolCtx('test-wallet'));
    expect(Array.isArray(positions)).toBe(true);
    expect(positions.length).toBeGreaterThanOrEqual(1);
    const pos = positions[0]!;
    expect(pos.category).toBe('PERP');
  });

  it('should have correct provider/chain/network on position updates', async () => {
    const positions = await provider.getPositions(makeSolCtx('test-wallet'));
    const pos = positions[0]!;
    expect(pos.provider).toBe('drift_perp');
    expect(pos.chain).toBe('solana');
    expect(pos.network).toBe('solana-mainnet');
    expect(pos.walletId).toBe('test-wallet');
  });

  it('should have direction, leverage, market in position metadata', async () => {
    const positions = await provider.getPositions(makeSolCtx('test-wallet'));
    const pos = positions[0]!;
    expect(pos.metadata.direction).toBe('LONG');
    expect(pos.metadata.leverage).toBe(5);
    expect(pos.metadata.market).toBe('SOL-PERP');
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
// Graceful degradation
// ---------------------------------------------------------------------------

describe('graceful degradation', () => {
  it('should return [] from getPosition when wrapper throws', async () => {
    const mockWrapper: IDriftSdkWrapper = {
      ...createMockMethods(),
      getPositions: vi.fn().mockRejectedValue(new Error('SDK error')),
    };
    const provider = new DriftPerpProvider({ enabled: true }, mockWrapper);
    const positions = await provider.getPosition('test-wallet', CONTEXT);
    expect(positions).toEqual([]);
  });

  it('should return safe defaults from getMarginInfo when wrapper throws', async () => {
    const mockWrapper: IDriftSdkWrapper = {
      ...createMockMethods(),
      getMarginInfo: vi.fn().mockRejectedValue(new Error('SDK error')),
    };
    const provider = new DriftPerpProvider({ enabled: true }, mockWrapper);
    const info = await provider.getMarginInfo('test-wallet', CONTEXT);
    expect(info.totalMargin).toBe(0);
    expect(info.freeMargin).toBe(0);
    expect(info.marginRatio).toBe(Infinity);
    expect(info.status).toBe('safe');
  });

  it('should return [] from getMarkets when wrapper throws', async () => {
    const mockWrapper: IDriftSdkWrapper = {
      ...createMockMethods(),
      getMarkets: vi.fn().mockRejectedValue(new Error('SDK error')),
    };
    const provider = new DriftPerpProvider({ enabled: true }, mockWrapper);
    const markets = await provider.getMarkets('solana');
    expect(markets).toEqual([]);
  });
});
