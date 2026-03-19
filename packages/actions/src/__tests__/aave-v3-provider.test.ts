/**
 * Integration tests for AaveV3LendingProvider.
 *
 * Covers: 4 action resolve methods, metadata, amount parsing, network selection,
 * IPositionProvider compliance, ILendingProvider query stubs, HF simulation.
 */
import { describe, expect, it, vi } from 'vitest';
import { AaveV3LendingProvider } from '../providers/aave-v3/index.js';
import { AAVE_V3_ADDRESSES } from '../providers/aave-v3/config.js';
import type { IRpcCaller } from '../providers/aave-v3/aave-rpc.js';
import type { ActionContext, ContractCallRequest, PositionQueryContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: '0x1234567890123456789012345678901234567890',
  chain: 'ethereum',
  walletId: '00000000-0000-0000-0000-000000000001',
};

const TEST_ASSET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC-like
const ETH_POOL = AAVE_V3_ADDRESSES['ethereum-mainnet']!.pool;
const BASE_POOL = AAVE_V3_ADDRESSES['base-mainnet']!.pool;

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('AaveV3LendingProvider metadata', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('should have name aave_v3', () => {
    expect(provider.metadata.name).toBe('aave_v3');
  });

  it('should have chains including ethereum', () => {
    expect(provider.metadata.chains).toContain('ethereum');
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
    expect(names).toContain('aave_supply');
    expect(names).toContain('aave_borrow');
    expect(names).toContain('aave_repay');
    expect(names).toContain('aave_withdraw');
  });

  it('should set borrow as high risk with APPROVAL tier', () => {
    const borrow = provider.actions.find((a) => a.name === 'aave_borrow');
    expect(borrow?.riskLevel).toBe('high');
    expect(borrow?.defaultTier).toBe('APPROVAL');
  });

  it('should set withdraw as high risk with APPROVAL tier', () => {
    const withdraw = provider.actions.find((a) => a.name === 'aave_withdraw');
    expect(withdraw?.riskLevel).toBe('high');
    expect(withdraw?.defaultTier).toBe('APPROVAL');
  });

  it('should set supply as medium risk with DELAY tier', () => {
    const supply = provider.actions.find((a) => a.name === 'aave_supply');
    expect(supply?.riskLevel).toBe('medium');
    expect(supply?.defaultTier).toBe('DELAY');
  });

  it('should set repay as medium risk with DELAY tier', () => {
    const repay = provider.actions.find((a) => a.name === 'aave_repay');
    expect(repay?.riskLevel).toBe('medium');
    expect(repay?.defaultTier).toBe('DELAY');
  });
});

// ---------------------------------------------------------------------------
// resolve aave_supply
// ---------------------------------------------------------------------------

describe('resolve aave_supply', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('should return array of 2 ContractCallRequest (approve + supply)', async () => {
    const result = await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1.0' },
      CONTEXT,
    );
    expect(Array.isArray(result)).toBe(true);
    expect((result as ContractCallRequest[]).length).toBe(2);
  });

  it('should have approve calldata starting with 0x095ea7b3', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1.0' },
      CONTEXT,
    )) as ContractCallRequest[];
    expect(result[0]!.calldata!.startsWith('0x095ea7b3')).toBe(true);
  });

  it('should have supply calldata starting with 0x617ba037', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1.0' },
      CONTEXT,
    )) as ContractCallRequest[];
    expect(result[1]!.calldata!.startsWith('0x617ba037')).toBe(true);
  });

  it('should target asset address for approve', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1.0' },
      CONTEXT,
    )) as ContractCallRequest[];
    expect(result[0]!.to).toBe(TEST_ASSET);
  });

  it('should target Pool address for supply (ethereum-mainnet default)', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1.0' },
      CONTEXT,
    )) as ContractCallRequest[];
    expect(result[1]!.to).toBe(ETH_POOL);
  });

  it('should have type CONTRACT_CALL and value 0', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1.0' },
      CONTEXT,
    )) as ContractCallRequest[];
    expect(result[0]!.type).toBe('CONTRACT_CALL');
    expect(result[0]!.value).toBe('0');
    expect(result[1]!.type).toBe('CONTRACT_CALL');
    expect(result[1]!.value).toBe('0');
  });

  it('should encode 1.0 as 1e18 in calldata', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1.0' },
      CONTEXT,
    )) as ContractCallRequest[];
    // Amount is the 2nd 32-byte word of supply calldata
    const calldata = result[1]!.calldata!;
    const amountHex = calldata.slice(10 + 64, 10 + 128);
    expect(BigInt('0x' + amountHex)).toBe(10n ** 18n);
  });

  it('should include walletAddress in supply calldata (onBehalfOf)', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1.0' },
      CONTEXT,
    )) as ContractCallRequest[];
    const calldata = result[1]!.calldata!;
    expect(calldata.toLowerCase()).toContain(CONTEXT.walletAddress.slice(2).toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// resolve aave_borrow
// ---------------------------------------------------------------------------

describe('resolve aave_borrow', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('should return single ContractCallRequest', async () => {
    const result = await provider.resolve(
      'aave_borrow',
      { asset: TEST_ASSET, amount: '100.0' },
      CONTEXT,
    );
    // borrow returns a single object (not array)
    expect(Array.isArray(result)).toBe(false);
    expect((result as ContractCallRequest).type).toBe('CONTRACT_CALL');
  });

  it('should have borrow calldata starting with 0xa415bcad', async () => {
    const result = (await provider.resolve(
      'aave_borrow',
      { asset: TEST_ASSET, amount: '100.0' },
      CONTEXT,
    )) as ContractCallRequest;
    expect(result.calldata!.startsWith('0xa415bcad')).toBe(true);
  });

  it('should target Pool address', async () => {
    const result = (await provider.resolve(
      'aave_borrow',
      { asset: TEST_ASSET, amount: '100.0' },
      CONTEXT,
    )) as ContractCallRequest;
    expect(result.to).toBe(ETH_POOL);
  });

  it('should have value 0', async () => {
    const result = (await provider.resolve(
      'aave_borrow',
      { asset: TEST_ASSET, amount: '100.0' },
      CONTEXT,
    )) as ContractCallRequest;
    expect(result.value).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// resolve aave_repay
// ---------------------------------------------------------------------------

describe('resolve aave_repay', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('should return array of 2 (approve + repay)', async () => {
    const result = await provider.resolve(
      'aave_repay',
      { asset: TEST_ASSET, amount: '50.0' },
      CONTEXT,
    );
    expect(Array.isArray(result)).toBe(true);
    expect((result as ContractCallRequest[]).length).toBe(2);
  });

  it('should have repay calldata starting with 0x573ade81', async () => {
    const result = (await provider.resolve(
      'aave_repay',
      { asset: TEST_ASSET, amount: '50.0' },
      CONTEXT,
    )) as ContractCallRequest[];
    expect(result[1]!.calldata!.startsWith('0x573ade81')).toBe(true);
  });

  it('should encode max as MAX_UINT256 in repay calldata', async () => {
    const result = (await provider.resolve(
      'aave_repay',
      { asset: TEST_ASSET, amount: 'max' },
      CONTEXT,
    )) as ContractCallRequest[];
    // Repay calldata: selector + asset + amount + interestRateMode + onBehalfOf
    const repayCalldata = result[1]!.calldata!;
    const amountHex = repayCalldata.slice(10 + 64, 10 + 128);
    expect(amountHex).toBe('f'.repeat(64));
  });

  it('should encode max as MAX_UINT256 in approve calldata', async () => {
    const result = (await provider.resolve(
      'aave_repay',
      { asset: TEST_ASSET, amount: 'max' },
      CONTEXT,
    )) as ContractCallRequest[];
    // Approve calldata: selector + spender + amount
    const approveCalldata = result[0]!.calldata!;
    const amountHex = approveCalldata.slice(10 + 64, 10 + 128);
    expect(amountHex).toBe('f'.repeat(64));
  });
});

// ---------------------------------------------------------------------------
// resolve aave_withdraw
// ---------------------------------------------------------------------------

describe('resolve aave_withdraw', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('should return single ContractCallRequest', async () => {
    const result = await provider.resolve(
      'aave_withdraw',
      { asset: TEST_ASSET, amount: '25.0' },
      CONTEXT,
    );
    expect(Array.isArray(result)).toBe(false);
    expect((result as ContractCallRequest).type).toBe('CONTRACT_CALL');
  });

  it('should have withdraw calldata starting with 0x69328dec', async () => {
    const result = (await provider.resolve(
      'aave_withdraw',
      { asset: TEST_ASSET, amount: '25.0' },
      CONTEXT,
    )) as ContractCallRequest;
    expect(result.calldata!.startsWith('0x69328dec')).toBe(true);
  });

  it('should encode max as MAX_UINT256 in calldata', async () => {
    const result = (await provider.resolve(
      'aave_withdraw',
      { asset: TEST_ASSET, amount: 'max' },
      CONTEXT,
    )) as ContractCallRequest;
    // Withdraw calldata: selector + asset + amount + to
    const amountHex = result.calldata!.slice(10 + 64, 10 + 128);
    expect(amountHex).toBe('f'.repeat(64));
  });
});

// ---------------------------------------------------------------------------
// resolve unknown action
// ---------------------------------------------------------------------------

describe('resolve unknown action', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('should throw for unknown action', async () => {
    await expect(
      provider.resolve('aave_flash_loan', {}, CONTEXT),
    ).rejects.toThrow('Unknown action');
  });
});

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

describe('amount parsing', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('should throw for zero amount', async () => {
    await expect(
      provider.resolve('aave_supply', { asset: TEST_ASSET, amount: '0' }, CONTEXT),
    ).rejects.toThrow('Amount must be greater than 0');
  });

  it('should parse decimal amounts correctly (0.001)', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '0.001' },
      CONTEXT,
    )) as ContractCallRequest[];
    // 0.001 * 1e18 = 1e15
    const calldata = result[1]!.calldata!;
    const amountHex = calldata.slice(10 + 64, 10 + 128);
    expect(BigInt('0x' + amountHex)).toBe(10n ** 15n);
  });

  it('should parse large amounts correctly (100.5)', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '100.5' },
      CONTEXT,
    )) as ContractCallRequest[];
    const calldata = result[1]!.calldata!;
    const amountHex = calldata.slice(10 + 64, 10 + 128);
    // 100.5 * 1e18 = 100500000000000000000
    expect(BigInt('0x' + amountHex)).toBe(100_500_000_000_000_000_000n);
  });
});

// ---------------------------------------------------------------------------
// Network parameter
// ---------------------------------------------------------------------------

describe('network selection', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('should use base-mainnet pool when network is specified', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1.0', network: 'base-mainnet' },
      CONTEXT,
    )) as ContractCallRequest[];
    expect(result[1]!.to).toBe(BASE_POOL);
    expect(result[1]!.to).not.toBe(ETH_POOL);
  });

  it('should default to ethereum-mainnet when network is not specified', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1.0' },
      CONTEXT,
    )) as ContractCallRequest[];
    expect(result[1]!.to).toBe(ETH_POOL);
  });

  it('should throw for unsupported network', async () => {
    await expect(
      provider.resolve(
        'aave_supply',
        { asset: TEST_ASSET, amount: '1.0', network: 'solana-mainnet' },
        CONTEXT,
      ),
    ).rejects.toThrow('Unsupported network');
  });
});

// ---------------------------------------------------------------------------
// IPositionProvider compliance
// ---------------------------------------------------------------------------

describe('IPositionProvider compliance', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('should return aave_v3 as provider name', () => {
    expect(provider.getProviderName()).toBe('aave_v3');
  });

  it('should return LENDING as supported category', () => {
    expect(provider.getSupportedCategories()).toEqual(['LENDING']);
  });

  it('should return empty positions when no rpcCaller', async () => {
    const ctx: PositionQueryContext = { walletId: 'test-wallet', walletAddress: 'test-wallet', chain: 'ethereum', networks: ['ethereum-mainnet'], environment: 'mainnet', rpcUrls: {} };
    const positions = await provider.getPositions(ctx);
    expect(positions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ILendingProvider query stubs
// ---------------------------------------------------------------------------

describe('ILendingProvider query stubs', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('should return empty positions when no rpcCaller', async () => {
    const positions = await provider.getPosition('test-wallet', CONTEXT);
    expect(positions).toEqual([]);
  });

  it('should return default safe health factor when no rpcCaller', async () => {
    const hf = await provider.getHealthFactor('test-wallet', CONTEXT);
    expect(hf.factor).toBe(Infinity);
    expect(hf.status).toBe('safe');
    expect(hf.totalCollateralUsd).toBe(0);
    expect(hf.totalDebtUsd).toBe(0);
  });

  it('should return empty markets', async () => {
    const markets = await provider.getMarkets('ethereum');
    expect(markets).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// HF simulation on borrow
// ---------------------------------------------------------------------------

describe('HF simulation on borrow', () => {
  // Build a mock response for getUserAccountData
  // collateral=100000 USD (8 dec), debt=50000, threshold=8250, ltv=8000, HF=1.65
  function buildAccountDataHex(
    collateral: bigint,
    debt: bigint,
    availBorrow: bigint,
    threshold: bigint,
    ltv: bigint,
    hf: bigint,
  ): string {
    return '0x' + [collateral, debt, availBorrow, threshold, ltv, hf]
      .map((v) => v.toString(16).padStart(64, '0'))
      .join('');
  }

  it('should allow borrow when HF stays safe', async () => {
    const safeHex = buildAccountDataHex(
      100_000_00_000_000n,  // 100,000 USD
      10_000_00_000_000n,   // 10,000 USD debt
      70_000_00_000_000n,
      8250n,
      8000n,
      8_250_000_000_000_000_000n, // HF 8.25
    );

    const mockRpc: IRpcCaller = {
      call: vi.fn().mockResolvedValue(safeHex),
    };

    const provider = new AaveV3LendingProvider({ enabled: true }, mockRpc);
    // Small borrow that keeps HF safe
    const result = await provider.resolve(
      'aave_borrow',
      { asset: TEST_ASSET, amount: '0.000000000001' },
      CONTEXT,
    );
    expect((result as ContractCallRequest).type).toBe('CONTRACT_CALL');
  });

  it('should block borrow that would cause liquidation', async () => {
    const lowCollateralHex = buildAccountDataHex(
      10_000_00_000_000n,    // 10,000 USD collateral
      9_000_00_000_000n,     // 9,000 USD debt (already near liquidation)
      500_00_000_000n,
      8250n,
      8000n,
      916_666_666_666_666_666n, // HF ~0.917 (below 1.0)
    );

    const mockRpc: IRpcCaller = {
      call: vi.fn().mockResolvedValue(lowCollateralHex),
    };

    const provider = new AaveV3LendingProvider({ enabled: true }, mockRpc);
    // Any borrow when already near liquidation should be blocked
    await expect(
      provider.resolve(
        'aave_borrow',
        { asset: TEST_ASSET, amount: '1000.0' },
        CONTEXT,
      ),
    ).rejects.toThrow('liquidation threshold');
  });

  it('should skip simulation when no rpcCaller', async () => {
    const provider = new AaveV3LendingProvider({ enabled: true });
    // Should succeed without rpcCaller (no simulation)
    const result = await provider.resolve(
      'aave_borrow',
      { asset: TEST_ASSET, amount: '1000.0' },
      CONTEXT,
    );
    expect((result as ContractCallRequest).type).toBe('CONTRACT_CALL');
  });
});

// ---------------------------------------------------------------------------
// registerBuiltInProviders integration
// ---------------------------------------------------------------------------

describe('registerBuiltInProviders includes aave_v3', () => {
  it('should register aave_v3 when enabled', async () => {
    const { registerBuiltInProviders } = await import('../index.js');
    const registered: Array<{ metadata: { name: string } }> = [];
    const registry = {
      register: (provider: unknown) => registered.push(provider as { metadata: { name: string } }),
    };
    const settingsReader = {
      get: (key: string) => {
        if (key === 'actions.aave_v3_enabled') return 'true';
        return '';
      },
    };

    const result = registerBuiltInProviders(registry, settingsReader);
    expect(result.loaded).toContain('aave_v3');
    expect(registered.some((p) => p.metadata.name === 'aave_v3')).toBe(true);
  });

  it('should skip aave_v3 when disabled', async () => {
    const { registerBuiltInProviders } = await import('../index.js');
    const registered: unknown[] = [];
    const registry = { register: (provider: unknown) => registered.push(provider) };
    const settingsReader = { get: (_key: string) => '' };

    const result = registerBuiltInProviders(registry, settingsReader);
    expect(result.skipped).toContain('aave_v3');
  });
});
