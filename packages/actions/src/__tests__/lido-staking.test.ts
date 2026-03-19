/**
 * LidoStakingActionProvider unit tests.
 *
 * Pure ABI encoding tests -- no MSW needed (no external API calls).
 * IPositionProvider tests use mocked fetch for eth_call RPC.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LidoStakingActionProvider } from '../providers/lido-staking/index.js';
import { LIDO_MAINNET_ADDRESSES, LIDO_TESTNET_ADDRESSES, getLidoAddresses } from '../providers/lido-staking/config.js';
import {
  encodeBalanceOfCalldata,
  encodeStEthPerTokenCalldata,
  decodeUint256Result,
  WSTETH_MAINNET,
  LIDO_NETWORK_CONFIG,
  LIDO_TESTNET_NETWORK_CONFIG,
} from '../providers/lido-staking/lido-contract.js';
import type { ActionContext, PositionQueryContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: '0x1234567890123456789012345678901234567890',
  chain: 'ethereum',
  walletId: '00000000-0000-0000-0000-000000000001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LidoStakingActionProvider', () => {
  describe('stake resolve', () => {
    it('returns ContractCallRequest with ETH value and submit() calldata', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('stake', { amount: '1.0' }, CONTEXT);

      // Single element (not array -- registry normalizes)
      const req = result as { type: string; to: string; calldata?: string; value?: string };
      expect(req.type).toBe('CONTRACT_CALL');
      expect(req.to).toBe(LIDO_MAINNET_ADDRESSES.stethAddress);
      expect(req.calldata).toMatch(/^0xa1903eab/);
      // 1 ETH = 1000000000000000000 wei
      expect(req.value).toBe('1000000000000000000');
    });
  });

  describe('unstake resolve', () => {
    it('returns [approve, requestWithdrawals] array', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('unstake', { amount: '1.0' }, CONTEXT);

      expect(Array.isArray(result)).toBe(true);
      const arr = result as Array<{ type: string; to: string; calldata?: string; value?: string }>;
      expect(arr).toHaveLength(2);

      // Element 0: approve stETH to WithdrawalQueue
      expect(arr[0]!.type).toBe('CONTRACT_CALL');
      expect(arr[0]!.calldata).toMatch(/^0x095ea7b3/);
      expect(arr[0]!.value).toBe('0');

      // Element 1: requestWithdrawals
      expect(arr[1]!.type).toBe('CONTRACT_CALL');
      expect(arr[1]!.calldata).toMatch(/^0xd669a4e2/);
      expect(arr[1]!.value).toBe('0');
    });
  });

  describe('stake with decimal amount', () => {
    it('"1.5" ETH converts to correct wei (1500000000000000000)', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('stake', { amount: '1.5' }, CONTEXT);

      const req = result as { type: string; value?: string };
      expect(req.value).toBe('1500000000000000000');
    });
  });

  describe('zero amount throws', () => {
    it('amount "0" throws ChainError', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      await expect(
        provider.resolve('stake', { amount: '0' }, CONTEXT),
      ).rejects.toThrow('Amount must be greater than 0');
    });
  });

  describe('unknown action throws', () => {
    it('throws INVALID_INSTRUCTION for unknown action name', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      await expect(
        provider.resolve('unknown_action', { amount: '1.0' }, CONTEXT),
      ).rejects.toThrow('Unknown action');
    });
  });

  describe('metadata', () => {
    it('has correct name, chains, mcpExpose, and actions count', () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      expect(provider.metadata.name).toBe('lido_staking');
      expect(provider.metadata.chains).toEqual(['ethereum']);
      expect(provider.metadata.mcpExpose).toBe(true);
      expect(provider.metadata.requiresApiKey).toBe(false);
      expect(provider.metadata.requiredApis).toEqual([]);
      expect(provider.metadata.version).toBe('1.0.0');
      expect(provider.actions).toHaveLength(2);

      const [stake, unstake] = provider.actions;
      expect(stake!.name).toBe('stake');
      expect(stake!.riskLevel).toBe('medium');
      expect(stake!.defaultTier).toBe('DELAY');
      expect(unstake!.name).toBe('unstake');
      expect(unstake!.riskLevel).toBe('medium');
      expect(unstake!.defaultTier).toBe('DELAY');
    });
  });

  describe('unstake approve targets stETH contract', () => {
    it('approve ContractCallRequest.to equals stethAddress', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('unstake', { amount: '2.0' }, CONTEXT);

      const arr = result as Array<{ to: string }>;
      expect(arr[0]!.to).toBe(LIDO_MAINNET_ADDRESSES.stethAddress);
    });
  });

  describe('unstake requestWithdrawals includes owner address', () => {
    it('encoded calldata contains walletAddress', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('unstake', { amount: '1.0' }, CONTEXT);

      const arr = result as Array<{ calldata?: string }>;
      // The owner address (without 0x prefix, lowercased) should appear in calldata
      const ownerHex = CONTEXT.walletAddress.slice(2).toLowerCase();
      expect(arr[1]!.calldata).toContain(ownerHex);
    });
  });

  describe('stake small decimal amounts', () => {
    it('"0.001" ETH -> 1000000000000000 wei', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('stake', { amount: '0.001' }, CONTEXT);

      const req = result as { value?: string };
      expect(req.value).toBe('1000000000000000');
    });
  });

  describe('unstake requestWithdrawals targets WithdrawalQueue', () => {
    it('requestWithdrawals ContractCallRequest.to equals withdrawalQueueAddress', async () => {
      const provider = new LidoStakingActionProvider({ enabled: true });
      const result = await provider.resolve('unstake', { amount: '1.0' }, CONTEXT);

      const arr = result as Array<{ to: string }>;
      expect(arr[1]!.to).toBe(LIDO_MAINNET_ADDRESSES.withdrawalQueueAddress);
    });
  });
});

// ---------------------------------------------------------------------------
// getLidoAddresses helper
// ---------------------------------------------------------------------------

describe('getLidoAddresses', () => {
  it('returns mainnet addresses for mainnet', () => {
    const addrs = getLidoAddresses('mainnet');
    expect(addrs.stethAddress).toBe(LIDO_MAINNET_ADDRESSES.stethAddress);
    expect(addrs.withdrawalQueueAddress).toBe(LIDO_MAINNET_ADDRESSES.withdrawalQueueAddress);
  });

  it('returns testnet addresses for testnet', () => {
    const addrs = getLidoAddresses('testnet');
    expect(addrs.stethAddress).toBe(LIDO_TESTNET_ADDRESSES.stethAddress);
    expect(addrs.withdrawalQueueAddress).toBe(LIDO_TESTNET_ADDRESSES.withdrawalQueueAddress);
  });
});

// ---------------------------------------------------------------------------
// ABI encoding helpers
// ---------------------------------------------------------------------------

describe('Lido ABI encoding helpers', () => {
  it('encodeBalanceOfCalldata returns 0x70a08231 + padded address', () => {
    const result = encodeBalanceOfCalldata('0x1234567890123456789012345678901234567890');
    expect(result).toBe(
      '0x70a08231' +
      '0000000000000000000000001234567890123456789012345678901234567890',
    );
  });

  it('encodeStEthPerTokenCalldata returns 0x035faf82', () => {
    const result = encodeStEthPerTokenCalldata();
    expect(result).toBe('0x035faf82');
  });

  it('decodeUint256Result parses hex to bigint', () => {
    const hex = '0x' + '0'.repeat(62) + '0a';
    expect(decodeUint256Result(hex)).toBe(10n);
  });

  it('decodeUint256Result parses 1e18 correctly', () => {
    const value = (10n ** 18n).toString(16).padStart(64, '0');
    expect(decodeUint256Result('0x' + value)).toBe(10n ** 18n);
  });

  it('WSTETH_MAINNET is correct address', () => {
    expect(WSTETH_MAINNET).toBe('0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0');
  });
});

// ---------------------------------------------------------------------------
// IPositionProvider
// ---------------------------------------------------------------------------

describe('LidoStakingActionProvider IPositionProvider', () => {
  const STETH_ADDRESS = LIDO_MAINNET_ADDRESSES.stethAddress;
  const RPC_URL = 'https://mock-rpc.example.com';
  const WALLET_ID = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';

  /** Build an ethereum PositionQueryContext for testing. */
  function makeCtx(walletId: string = WALLET_ID, chain: 'ethereum' | 'solana' = 'ethereum'): PositionQueryContext {
    return {
      walletId,
      walletAddress: walletId,
      chain,
      networks: chain === 'ethereum' ? ['ethereum-mainnet'] : ['solana-mainnet'],
      environment: 'mainnet',
      rpcUrls: chain === 'ethereum' ? { 'ethereum-mainnet': RPC_URL } : {},
    };
  }

  let fetchMock: ReturnType<typeof vi.fn>;
  let provider: LidoStakingActionProvider;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    provider = new LidoStakingActionProvider({ enabled: true, rpcUrl: RPC_URL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Helper to build a JSON-RPC success response for eth_call.
   */
  function rpcResult(hexValue: string): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexValue }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('getProviderName returns lido_staking', () => {
    expect(provider.getProviderName()).toBe('lido_staking');
  });

  it('getSupportedCategories returns [STAKING]', () => {
    expect(provider.getSupportedCategories()).toEqual(['STAKING']);
  });

  it('getPositions with stETH balance 1e18 returns 1 PositionUpdate', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const zeroBalance = '0x' + '0'.repeat(64);

    fetchMock.mockImplementation(async (_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      const calldata = body.params?.[0]?.data as string;
      const to = (body.params?.[0]?.to as string)?.toLowerCase();
      // stETH balanceOf
      if (calldata?.startsWith('0x70a08231') && to === STETH_ADDRESS.toLowerCase()) {
        return rpcResult(balance1e18);
      }
      // wstETH balanceOf
      if (calldata?.startsWith('0x70a08231') && to === WSTETH_MAINNET.toLowerCase()) {
        return rpcResult(zeroBalance);
      }
      // stEthPerToken
      if (calldata?.startsWith('0x035faf82')) {
        return rpcResult(balance1e18); // 1:1 ratio
      }
      return rpcResult(zeroBalance);
    });

    const positions = await provider.getPositions(makeCtx());
    expect(positions).toHaveLength(1);
    expect(positions[0]!.category).toBe('STAKING');
    expect(positions[0]!.provider).toBe('lido_staking');
    expect(positions[0]!.chain).toBe('ethereum');
    expect(positions[0]!.assetId).toContain('eip155:1/erc20:');
    expect(positions[0]!.amount).toBe('1.0');
    expect(positions[0]!.status).toBe('ACTIVE');
  });

  it('getPositions returns [] for solana wallet (chain guard)', async () => {
    const positions = await provider.getPositions(makeCtx(WALLET_ID, 'solana'));
    expect(positions).toEqual([]);
  });

  it('getPositions with wstETH balance 1e18 and stEthPerToken 1.15e18 returns correct underlyingAmount', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const ratio115 = '0x' + (115n * 10n ** 16n).toString(16).padStart(64, '0'); // 1.15e18
    const zeroBalance = '0x' + '0'.repeat(64);

    fetchMock.mockImplementation(async (_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      const calldata = body.params?.[0]?.data as string;
      const to = (body.params?.[0]?.to as string)?.toLowerCase();
      // stETH balanceOf -> 0
      if (calldata?.startsWith('0x70a08231') && to === STETH_ADDRESS.toLowerCase()) {
        return rpcResult(zeroBalance);
      }
      // wstETH balanceOf -> 1e18
      if (calldata?.startsWith('0x70a08231') && to === WSTETH_MAINNET.toLowerCase()) {
        return rpcResult(balance1e18);
      }
      // stEthPerToken -> 1.15e18
      if (calldata?.startsWith('0x035faf82')) {
        return rpcResult(ratio115);
      }
      return rpcResult(zeroBalance);
    });

    const positions = await provider.getPositions(makeCtx());
    expect(positions).toHaveLength(1);
    expect(positions[0]!.metadata.token).toBe('wstETH');
    // underlyingAmount = (1e18 * 1.15e18) / 1e18 = 1.15
    expect(positions[0]!.metadata.underlyingAmount).toBe('1.15');
  });

  it('getPositions with both stETH and wstETH balances returns 2 PositionUpdates', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const ratio = '0x' + (10n ** 18n).toString(16).padStart(64, '0'); // 1:1

    fetchMock.mockImplementation(async (_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      const calldata = body.params?.[0]?.data as string;
      // Both return 1e18
      if (calldata?.startsWith('0x70a08231')) return rpcResult(balance1e18);
      if (calldata?.startsWith('0x035faf82')) return rpcResult(ratio);
      return rpcResult('0x' + '0'.repeat(64));
    });

    const positions = await provider.getPositions(makeCtx());
    expect(positions).toHaveLength(2);
    const tokens = positions.map((p) => p.metadata.token);
    expect(tokens).toContain('stETH');
    expect(tokens).toContain('wstETH');
  });

  it('getPositions with zero balances returns empty array', async () => {
    const zeroBalance = '0x' + '0'.repeat(64);
    fetchMock.mockResolvedValue(rpcResult(zeroBalance));

    const positions = await provider.getPositions(makeCtx());
    expect(positions).toEqual([]);
  });

  it('getPositions returns empty array on RPC error (no throw)', async () => {
    fetchMock.mockRejectedValue(new Error('RPC connection failed'));

    const positions = await provider.getPositions(makeCtx());
    expect(positions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Multichain getPositions tests (MCHN-01)
// ---------------------------------------------------------------------------

describe('LidoStakingActionProvider Multichain Positions', () => {
  const WALLET_ID = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';
  const ETH_RPC = 'https://eth-rpc.example.com';
  const BASE_RPC = 'https://base-rpc.example.com';
  const ARB_RPC = 'https://arb-rpc.example.com';

  let fetchMock: ReturnType<typeof vi.fn>;
  let provider: LidoStakingActionProvider;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    provider = new LidoStakingActionProvider({ enabled: true, rpcUrl: ETH_RPC });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function rpcResult(hexValue: string): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexValue }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function makeMultiCtx(opts?: {
    networks?: string[];
    environment?: 'mainnet' | 'testnet';
  }): PositionQueryContext {
    return {
      walletId: WALLET_ID,
      walletAddress: WALLET_ID,
      chain: 'ethereum',
      networks: (opts?.networks ?? ['ethereum-mainnet', 'base-mainnet']) as any,
      environment: opts?.environment ?? 'mainnet',
      rpcUrls: {
        'ethereum-mainnet': ETH_RPC,
        'base-mainnet': BASE_RPC,
        'arbitrum-mainnet': ARB_RPC,
        'ethereum-sepolia': 'https://sepolia-rpc.example.com',
      },
    };
  }

  it('queries positions from multiple networks with correct CAIP-19 assetIds', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const zeroBalance = '0x' + '0'.repeat(64);

    fetchMock.mockImplementation(async (url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      const calldata = body.params?.[0]?.data as string;

      // wstETH balanceOf returns 1e18 for all networks
      if (calldata?.startsWith('0x70a08231')) {
        // stETH only on ethereum
        const to = (body.params?.[0]?.to as string)?.toLowerCase();
        const ethSteth = LIDO_NETWORK_CONFIG['ethereum-mainnet']!.stethAddress.toLowerCase();
        if (to === ethSteth && url === ETH_RPC) return rpcResult(balance1e18);
        // wstETH on both networks
        const ethWsteth = LIDO_NETWORK_CONFIG['ethereum-mainnet']!.wstethAddress.toLowerCase();
        const baseWsteth = LIDO_NETWORK_CONFIG['base-mainnet']!.wstethAddress.toLowerCase();
        if (to === ethWsteth && url === ETH_RPC) return rpcResult(balance1e18);
        if (to === baseWsteth && url === BASE_RPC) return rpcResult(balance1e18);
        return rpcResult(zeroBalance);
      }
      // stEthPerToken
      if (calldata?.startsWith('0x035faf82')) return rpcResult(balance1e18);
      return rpcResult(zeroBalance);
    });

    const ctx = makeMultiCtx({ networks: ['ethereum-mainnet', 'base-mainnet'] });
    const positions = await provider.getPositions(ctx);

    // Ethereum: stETH + wstETH, Base: wstETH only (no stETH on Base)
    expect(positions.length).toBeGreaterThanOrEqual(2);

    // Check CAIP-19 for Ethereum positions
    const ethPositions = positions.filter(p => p.network === 'ethereum-mainnet');
    expect(ethPositions.length).toBeGreaterThan(0);
    for (const p of ethPositions) {
      expect(p.assetId).toContain('eip155:1/erc20:');
    }

    // Check CAIP-19 for Base positions
    const basePositions = positions.filter(p => p.network === 'base-mainnet');
    expect(basePositions.length).toBeGreaterThan(0);
    for (const p of basePositions) {
      expect(p.assetId).toContain('eip155:8453/erc20:');
    }
  });

  it('single network RPC failure does not affect other networks (Promise.allSettled resilience)', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const zeroBalance = '0x' + '0'.repeat(64);

    fetchMock.mockImplementation(async (url: string, opts: { body: string }) => {
      // Base RPC fails
      if (url === BASE_RPC) throw new Error('Base RPC down');

      const body = JSON.parse(opts.body);
      const calldata = body.params?.[0]?.data as string;
      const to = (body.params?.[0]?.to as string)?.toLowerCase();
      const ethWsteth = LIDO_NETWORK_CONFIG['ethereum-mainnet']!.wstethAddress.toLowerCase();

      if (calldata?.startsWith('0x70a08231') && to === ethWsteth) return rpcResult(balance1e18);
      if (calldata?.startsWith('0x035faf82')) return rpcResult(balance1e18);
      return rpcResult(zeroBalance);
    });

    const ctx = makeMultiCtx({ networks: ['ethereum-mainnet', 'base-mainnet'] });
    const positions = await provider.getPositions(ctx);

    // Should still get Ethereum positions despite Base failure
    expect(positions.length).toBeGreaterThan(0);
    expect(positions.every(p => p.network === 'ethereum-mainnet')).toBe(true);
  });

  it('testnet environment uses testnet contract addresses (Holesky)', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const zeroBalance = '0x' + '0'.repeat(64);
    const sepoliaRpc = 'https://sepolia-rpc.example.com';

    fetchMock.mockImplementation(async (url: string, opts: { body: string }) => {
      if (url !== sepoliaRpc) return rpcResult(zeroBalance);
      const body = JSON.parse(opts.body);
      const calldata = body.params?.[0]?.data as string;
      const to = (body.params?.[0]?.to as string)?.toLowerCase();
      const testnetConfig = LIDO_TESTNET_NETWORK_CONFIG['ethereum-sepolia']!;

      if (calldata?.startsWith('0x70a08231') && to === testnetConfig.wstethAddress.toLowerCase()) {
        return rpcResult(balance1e18);
      }
      if (calldata?.startsWith('0x035faf82')) return rpcResult(balance1e18);
      return rpcResult(zeroBalance);
    });

    const ctx = makeMultiCtx({
      networks: ['ethereum-sepolia'],
      environment: 'testnet',
    });
    const positions = await provider.getPositions(ctx);

    expect(positions.length).toBeGreaterThan(0);
    expect(positions[0]!.assetId).toContain('eip155:11155111/erc20:');
    expect(positions[0]!.network).toBe('ethereum-sepolia');
  });

  it('filters ctx.networks to only Lido-supported networks', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const zeroBalance = '0x' + '0'.repeat(64);

    fetchMock.mockImplementation(async (_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      const calldata = body.params?.[0]?.data as string;
      const to = (body.params?.[0]?.to as string)?.toLowerCase();
      const ethWsteth = LIDO_NETWORK_CONFIG['ethereum-mainnet']!.wstethAddress.toLowerCase();

      if (calldata?.startsWith('0x70a08231') && to === ethWsteth) return rpcResult(balance1e18);
      if (calldata?.startsWith('0x035faf82')) return rpcResult(balance1e18);
      return rpcResult(zeroBalance);
    });

    // Include unsupported 'hyperevm-mainnet' -- should be silently ignored
    const ctx = makeMultiCtx({ networks: ['ethereum-mainnet', 'hyperevm-mainnet' as any] });
    const positions = await provider.getPositions(ctx);

    // Only ethereum-mainnet positions returned
    expect(positions.every(p => p.network === 'ethereum-mainnet')).toBe(true);
  });

  it('each position network field matches the queried network', async () => {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const zeroBalance = '0x' + '0'.repeat(64);

    fetchMock.mockImplementation(async (url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      const calldata = body.params?.[0]?.data as string;
      const to = (body.params?.[0]?.to as string)?.toLowerCase();

      if (calldata?.startsWith('0x70a08231')) {
        const ethWsteth = LIDO_NETWORK_CONFIG['ethereum-mainnet']!.wstethAddress.toLowerCase();
        const arbWsteth = LIDO_NETWORK_CONFIG['arbitrum-mainnet']!.wstethAddress.toLowerCase();
        if (to === ethWsteth && url === ETH_RPC) return rpcResult(balance1e18);
        if (to === arbWsteth && url === ARB_RPC) return rpcResult(balance1e18);
        return rpcResult(zeroBalance);
      }
      if (calldata?.startsWith('0x035faf82')) return rpcResult(balance1e18);
      return rpcResult(zeroBalance);
    });

    const ctx = makeMultiCtx({ networks: ['ethereum-mainnet', 'arbitrum-mainnet'] });
    const positions = await provider.getPositions(ctx);

    const ethPos = positions.filter(p => p.network === 'ethereum-mainnet');
    const arbPos = positions.filter(p => p.network === 'arbitrum-mainnet');
    expect(ethPos.length).toBeGreaterThan(0);
    expect(arbPos.length).toBeGreaterThan(0);
    // No position should have a mismatched network
    expect(positions.every(p => ['ethereum-mainnet', 'arbitrum-mainnet'].includes(p.network as string))).toBe(true);
  });
});
