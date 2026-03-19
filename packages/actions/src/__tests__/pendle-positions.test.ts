/**
 * Pendle IPositionProvider multichain getPositions tests (MCHN-03).
 *
 * Tests cover: multi-network PT/YT position queries, per-network CAIP-19,
 * RPC failure resilience, and unsupported network filtering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PendleYieldProvider } from '../providers/pendle/index.js';
import type { PositionQueryContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WALLET_ID = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';
const ETH_RPC = 'https://eth-rpc.example.com';
const ARB_RPC = 'https://arb-rpc.example.com';

const MOCK_MARKET = {
  address: '0xMarket1111111111111111111111111111111111',
  pt: '0xPT11111111111111111111111111111111111111',
  yt: '0xYT11111111111111111111111111111111111111',
  sy: '0xSY11111111111111111111111111111111111111',
  name: 'PT-wstETH-28MAR2026',
  expiry: '2026-03-28T00:00:00.000Z',
  chainId: 1,
  underlyingAsset: { address: '0xUnderlying1111111111111111111111111111', symbol: 'wstETH' },
  details: { impliedApy: 0.05, underlyingApy: 0.03, liquidity: 1000000 },
};

function makeMultiCtx(opts?: {
  networks?: string[];
}): PositionQueryContext {
  return {
    walletId: WALLET_ID,
    walletAddress: WALLET_ID,
    chain: 'ethereum',
    networks: (opts?.networks ?? ['ethereum-mainnet', 'arbitrum-mainnet']) as any,
    environment: 'mainnet',
    rpcUrls: {
      'ethereum-mainnet': ETH_RPC,
      'arbitrum-mainnet': ARB_RPC,
    },
  };
}

function rpcResult(hexValue: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexValue }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PendleYieldProvider Multichain Positions', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let provider: PendleYieldProvider;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    provider = new PendleYieldProvider({ enabled: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Mock fetch to handle both Pendle API calls (getMarkets) and RPC calls (balanceOf).
   */
  function setupMocks(opts?: { arbFails?: boolean }): void {
    const balance1e18 = '0x' + (10n ** 18n).toString(16).padStart(64, '0');

    fetchMock.mockImplementation(async (url: string, reqOpts?: { body?: string; method?: string }) => {
      // Pendle API calls (GET requests to api-v2.pendle.finance)
      if (typeof url === 'string' && url.includes('api-v2.pendle.finance')) {
        return new Response(JSON.stringify({ results: [MOCK_MARKET] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // RPC calls (POST)
      if (reqOpts?.body) {
        // Arbitrum RPC failure
        if (url === ARB_RPC && opts?.arbFails) {
          throw new Error('Arbitrum RPC down');
        }

        const body = JSON.parse(reqOpts.body);
        const calldata = body.params?.[0]?.data as string;

        // balanceOf -> return 1e18 for PT, 0 for YT
        if (calldata?.startsWith('0x70a08231')) {
          const to = (body.params?.[0]?.to as string)?.toLowerCase();
          if (to === MOCK_MARKET.pt.toLowerCase()) return rpcResult(balance1e18);
          return rpcResult('0x' + '0'.repeat(64));
        }
      }

      return rpcResult('0x' + '0'.repeat(64));
    });
  }

  it('Test 1: queries both Ethereum and Arbitrum networks and returns combined PT/YT positions', async () => {
    setupMocks();

    const ctx = makeMultiCtx();
    const positions = await provider.getPositions(ctx);

    // Should have positions from both networks (PT balance > 0 on each)
    expect(positions.length).toBeGreaterThanOrEqual(2);

    const ethPositions = positions.filter(p => p.network === 'ethereum-mainnet');
    const arbPositions = positions.filter(p => p.network === 'arbitrum-mainnet');

    expect(ethPositions.length).toBeGreaterThan(0);
    expect(arbPositions.length).toBeGreaterThan(0);
  });

  it('Test 2: each position has correct CAIP-19 assetId using that network chainId', async () => {
    setupMocks();

    const ctx = makeMultiCtx();
    const positions = await provider.getPositions(ctx);

    const ethPositions = positions.filter(p => p.network === 'ethereum-mainnet');
    const arbPositions = positions.filter(p => p.network === 'arbitrum-mainnet');

    for (const p of ethPositions) {
      expect(p.assetId).toContain('eip155:1/erc20:');
    }
    for (const p of arbPositions) {
      expect(p.assetId).toContain('eip155:42161/erc20:');
    }
  });

  it('Test 3: single network RPC failure returns positions from the other network', async () => {
    setupMocks({ arbFails: true });

    const ctx = makeMultiCtx();
    const positions = await provider.getPositions(ctx);

    expect(positions.length).toBeGreaterThan(0);
    expect(positions.every(p => p.network === 'ethereum-mainnet')).toBe(true);
  });

  it('Test 4: unsupported networks in ctx.networks are silently ignored', async () => {
    setupMocks();

    const ctx = makeMultiCtx({ networks: ['ethereum-mainnet', 'polygon-mainnet', 'base-mainnet'] });
    const positions = await provider.getPositions(ctx);

    // Only ethereum-mainnet positions (polygon and base not in PENDLE_POSITION_NETWORKS)
    expect(positions.every(p => p.network === 'ethereum-mainnet')).toBe(true);
  });

  it('Test 5: each position network field matches the queried network', async () => {
    setupMocks();

    const ctx = makeMultiCtx();
    const positions = await provider.getPositions(ctx);

    for (const p of positions) {
      expect(['ethereum-mainnet', 'arbitrum-mainnet']).toContain(p.network);
    }
  });
});
