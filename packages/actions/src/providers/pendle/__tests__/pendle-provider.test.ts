/**
 * PendleYieldProvider unit tests.
 * Tests buyPT, buyYT action resolution via mock PendleApiClient.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { PendleYieldProvider } from '../index.js';
import type { ActionContext, PositionQueryContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_MARKET = {
  address: '0xMarketAddr',
  name: 'PT-stETH-26DEC2025',
  expiry: '2025-12-26T00:00:00Z',
  pt: '0xPTAddr',
  yt: '0xYTAddr',
  sy: '0xSYAddr',
  underlyingAsset: {
    address: '0xUnderlying',
    symbol: 'stETH',
    decimals: 18,
  },
  chainId: 1,
  details: {
    impliedApy: 0.045,
    underlyingApy: 0.032,
    liquidity: 150000000,
  },
};

const CONVERT_RESPONSE = {
  tx: {
    to: '0xPendleRouter',
    data: '0xcalldata123',
    value: '0',
  },
  amountOut: '950000000000000000',
};

const CONTEXT: ActionContext = {
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  chain: 'ethereum',
  walletId: '00000000-0000-0000-0000-000000000001',
};

const BASE_URL = 'https://api-v2.pendle.finance/core';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get(`${BASE_URL}/v1/markets/all`, () => {
    return HttpResponse.json([MOCK_MARKET]);
  }),
  http.get(`${BASE_URL}/v2/sdk/1/convert`, () => {
    return HttpResponse.json(CONVERT_RESPONSE);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PendleYieldProvider', () => {
  describe('metadata', () => {
    it('has correct provider name', () => {
      const provider = new PendleYieldProvider();
      expect(provider.metadata.name).toBe('pendle_yield');
    });

    it('has 5 actions', () => {
      const provider = new PendleYieldProvider();
      expect(provider.actions).toHaveLength(5);
    });

    it('exposes expected action names', () => {
      const provider = new PendleYieldProvider();
      const names = provider.actions.map((a) => a.name);
      expect(names).toEqual(['buy_pt', 'buy_yt', 'redeem_pt', 'add_liquidity', 'remove_liquidity']);
    });

    it('mcpExpose is true', () => {
      const provider = new PendleYieldProvider();
      expect(provider.metadata.mcpExpose).toBe(true);
    });

    it('chains includes ethereum', () => {
      const provider = new PendleYieldProvider();
      expect(provider.metadata.chains).toContain('ethereum');
    });
  });

  describe('buy_pt', () => {
    it('returns ContractCallRequest with correct fields', async () => {
      const provider = new PendleYieldProvider();
      const result = await provider.resolve('buy_pt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000000000000000',
      }, CONTEXT);

      expect(Array.isArray(result)).toBe(true);
      const calls = result as Array<{ type: string; to: string; calldata: string }>;
      expect(calls).toHaveLength(1);
      const call = calls[0]!;
      expect(call.type).toBe('CONTRACT_CALL');
      expect(call.to).toBe('0xPendleRouter');
      expect(call.calldata).toBe('0xcalldata123');
    });

    it('sends PT address as tokensOut to Convert API', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('buy_pt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('tokensOut')).toBe('0xPTAddr');
      expect(url.searchParams.get('tokensIn')).toBe('0xUnderlying');
    });

    it('sends receiver as wallet address', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('buy_pt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('receiver')).toBe(CONTEXT.walletAddress);
    });

    it('throws on unknown market', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('buy_pt', {
          market: '0xNonExistent',
          tokenIn: '0xUnderlying',
          amountIn: '1000000',
        }, CONTEXT),
      ).rejects.toThrow('market not found');
    });

    it('applies default slippage when not specified', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('buy_pt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('slippage')).toBe('0.01'); // 100bps = 1%
    });

    it('clamps user slippage to max', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('buy_pt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000',
        slippageBps: 1000, // 10% — should be clamped to max 5%
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('slippage')).toBe('0.05'); // 500bps = 5%
    });
  });

  describe('buy_yt', () => {
    it('returns ContractCallRequest for YT purchase', async () => {
      const provider = new PendleYieldProvider();
      const result = await provider.resolve('buy_yt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000000000000000',
      }, CONTEXT);

      const calls = result as Array<{ type: string; to: string }>;
      expect(calls).toHaveLength(1);
      expect(calls[0]!.type).toBe('CONTRACT_CALL');
    });

    it('sends YT address as tokensOut', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('buy_yt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('tokensOut')).toBe('0xYTAddr');
    });
  });

  describe('unknown action', () => {
    it('throws on unknown action name', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('unknown_action', {}, CONTEXT),
      ).rejects.toThrow('Unknown Pendle action');
    });
  });

  describe('input validation', () => {
    it('rejects buy_pt with missing market', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('buy_pt', { tokenIn: '0xA', amountIn: '100' }, CONTEXT),
      ).rejects.toThrow();
    });

    it('rejects buy_pt with missing amountIn', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('buy_pt', { market: '0xM', tokenIn: '0xA' }, CONTEXT),
      ).rejects.toThrow();
    });

    it('rejects buy_yt with missing tokenIn', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('buy_yt', { market: '0xM', amountIn: '100' }, CONTEXT),
      ).rejects.toThrow();
    });
  });

  describe('IPositionProvider', () => {
    it('getProviderName returns pendle', () => {
      const provider = new PendleYieldProvider();
      expect(provider.getProviderName()).toBe('pendle');
    });

    it('getSupportedCategories returns YIELD', () => {
      const provider = new PendleYieldProvider();
      expect(provider.getSupportedCategories()).toEqual(['YIELD']);
    });
  });

  // ---------------------------------------------------------------------------
  // getPositions() tests
  // ---------------------------------------------------------------------------

  describe('getPositions', () => {
    const MOCK_RPC_URL = 'http://localhost:9999';
    const WALLET_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

    function makeCtx(
      chain: 'ethereum' | 'solana' = 'ethereum',
      opts?: { emptyRpcUrls?: boolean },
    ): PositionQueryContext {
      const rpcUrls: Record<string, string> = opts?.emptyRpcUrls
        ? {}
        : chain === 'ethereum'
          ? { 'ethereum-mainnet': MOCK_RPC_URL }
          : {};
      return {
        walletId: WALLET_ADDRESS,
        walletAddress: WALLET_ADDRESS,
        chain,
        networks: chain === 'ethereum' ? ['ethereum-mainnet'] : ['solana-mainnet'],
        environment: 'mainnet',
        rpcUrls,
      };
    }

    // Future expiry (2027-12-26) for ACTIVE positions
    const FUTURE_EXPIRY = '2027-12-26T00:00:00Z';
    // Past expiry for MATURED positions
    const PAST_EXPIRY = '2024-01-01T00:00:00Z';

    const ACTIVE_MARKET = {
      ...MOCK_MARKET,
      expiry: FUTURE_EXPIRY,
    };

    const MATURED_MARKET = {
      ...MOCK_MARKET,
      address: '0xMaturedMarket',
      name: 'PT-stETH-01JAN2024',
      expiry: PAST_EXPIRY,
      pt: '0xMaturedPT',
      yt: '0xMaturedYT',
    };

    // Encode a non-zero uint256 as hex result (1e18 = 1 token)
    const ONE_TOKEN_HEX = '0x' + (10n ** 18n).toString(16).padStart(64, '0');
    const ZERO_HEX = '0x' + '0'.repeat(64);

    /**
     * Create an MSW handler for RPC eth_call that responds based on the
     * target contract address in the request body.
     */
    function createRpcHandler(balanceMap: Record<string, string>) {
      return http.post(MOCK_RPC_URL, async ({ request }) => {
        const body = await request.json() as { params: [{ to: string }, string] };
        const toAddress = body.params[0].to.toLowerCase();
        const result = balanceMap[toAddress] ?? ZERO_HEX;
        return HttpResponse.json({ jsonrpc: '2.0', id: 1, result });
      });
    }

    it('returns [] when rpcUrl is not configured', async () => {
      const provider = new PendleYieldProvider({ enabled: true });
      const positions = await provider.getPositions(makeCtx('ethereum', { emptyRpcUrls: true }));
      expect(positions).toEqual([]);
    });

    it('returns [] for solana wallet (chain guard)', async () => {
      const provider = new PendleYieldProvider({ enabled: true, rpcUrl: MOCK_RPC_URL });
      const positions = await provider.getPositions(makeCtx('solana'));
      expect(positions).toEqual([]);
    });

    it('returns PT position with correct metadata for non-zero balance', async () => {
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, () => HttpResponse.json([ACTIVE_MARKET])),
        createRpcHandler({
          [ACTIVE_MARKET.pt.toLowerCase()]: ONE_TOKEN_HEX,
          [ACTIVE_MARKET.yt.toLowerCase()]: ZERO_HEX,
        }),
      );

      const provider = new PendleYieldProvider({ enabled: true, rpcUrl: MOCK_RPC_URL });
      const positions = await provider.getPositions(makeCtx());

      expect(positions).toHaveLength(1);
      const pos = positions[0]!;
      expect(pos.category).toBe('YIELD');
      expect(pos.provider).toBe('pendle');
      expect(pos.chain).toBe('ethereum');
      expect(pos.network).toBe('ethereum-mainnet');
      expect(pos.status).toBe('ACTIVE');
      expect(pos.metadata.tokenType).toBe('PT');
      expect(pos.metadata.maturity).toBe(Math.floor(new Date(FUTURE_EXPIRY).getTime() / 1000));
      expect(pos.metadata.underlyingAsset).toBe('stETH');
      expect(pos.metadata.impliedApy).toBe(0.045);
      expect(pos.metadata.marketAddress).toBe(ACTIVE_MARKET.address);
      expect(pos.amount).toBe('1.0');
    });

    it('returns YT position with correct metadata for non-zero balance', async () => {
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, () => HttpResponse.json([ACTIVE_MARKET])),
        createRpcHandler({
          [ACTIVE_MARKET.pt.toLowerCase()]: ZERO_HEX,
          [ACTIVE_MARKET.yt.toLowerCase()]: ONE_TOKEN_HEX,
        }),
      );

      const provider = new PendleYieldProvider({ enabled: true, rpcUrl: MOCK_RPC_URL });
      const positions = await provider.getPositions(makeCtx());

      expect(positions).toHaveLength(1);
      const pos = positions[0]!;
      expect(pos.category).toBe('YIELD');
      expect(pos.metadata.tokenType).toBe('YT');
      expect(pos.metadata.maturity).toBe(Math.floor(new Date(FUTURE_EXPIRY).getTime() / 1000));
      expect(pos.metadata.underlyingAsset).toBe('stETH');
      expect(pos.metadata.impliedApy).toBe(0.045);
      expect(pos.status).toBe('ACTIVE');
    });

    it('returns MATURED status when expiry is in the past', async () => {
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, () => HttpResponse.json([MATURED_MARKET])),
        createRpcHandler({
          [MATURED_MARKET.pt.toLowerCase()]: ONE_TOKEN_HEX,
          [MATURED_MARKET.yt.toLowerCase()]: ZERO_HEX,
        }),
      );

      const provider = new PendleYieldProvider({ enabled: true, rpcUrl: MOCK_RPC_URL });
      const positions = await provider.getPositions(makeCtx());

      expect(positions).toHaveLength(1);
      expect(positions[0]!.status).toBe('MATURED');
    });

    it('skips zero-balance PT/YT tokens', async () => {
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, () => HttpResponse.json([ACTIVE_MARKET])),
        createRpcHandler({
          [ACTIVE_MARKET.pt.toLowerCase()]: ZERO_HEX,
          [ACTIVE_MARKET.yt.toLowerCase()]: ZERO_HEX,
        }),
      );

      const provider = new PendleYieldProvider({ enabled: true, rpcUrl: MOCK_RPC_URL });
      const positions = await provider.getPositions(makeCtx());
      expect(positions).toEqual([]);
    });

    it('returns multiple positions from multiple markets', async () => {
      const secondMarket = {
        ...MOCK_MARKET,
        address: '0xMarket2',
        name: 'PT-USDC-27MAR2028',
        expiry: '2028-03-27T00:00:00Z',
        pt: '0xPT2',
        yt: '0xYT2',
        underlyingAsset: { address: '0xUSDC', symbol: 'USDC', decimals: 18 },
      };

      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, () => HttpResponse.json([ACTIVE_MARKET, secondMarket])),
        createRpcHandler({
          [ACTIVE_MARKET.pt.toLowerCase()]: ONE_TOKEN_HEX,
          [ACTIVE_MARKET.yt.toLowerCase()]: ZERO_HEX,
          [secondMarket.pt.toLowerCase()]: ONE_TOKEN_HEX,
          [secondMarket.yt.toLowerCase()]: ZERO_HEX,
        }),
      );

      const provider = new PendleYieldProvider({ enabled: true, rpcUrl: MOCK_RPC_URL });
      const positions = await provider.getPositions(makeCtx());

      expect(positions).toHaveLength(2);
      expect(positions[0]!.metadata.underlyingAsset).toBe('stETH');
      expect(positions[1]!.metadata.underlyingAsset).toBe('USDC');
    });

    it('assetId uses CAIP-19 format', async () => {
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, () => HttpResponse.json([ACTIVE_MARKET])),
        createRpcHandler({
          [ACTIVE_MARKET.pt.toLowerCase()]: ONE_TOKEN_HEX,
          [ACTIVE_MARKET.yt.toLowerCase()]: ZERO_HEX,
        }),
      );

      const provider = new PendleYieldProvider({ enabled: true, rpcUrl: MOCK_RPC_URL });
      const positions = await provider.getPositions(makeCtx());

      expect(positions).toHaveLength(1);
      // CAIP-19 format: eip155:1/erc20:0xPTAddr
      expect(positions[0]!.assetId).toContain('eip155:1/erc20:');
      expect(positions[0]!.assetId).toContain(ACTIVE_MARKET.pt);
    });

    it('returns [] on RPC error (resilient)', async () => {
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, () => HttpResponse.json([ACTIVE_MARKET])),
        http.post(MOCK_RPC_URL, () => HttpResponse.error()),
      );

      const provider = new PendleYieldProvider({ enabled: true, rpcUrl: MOCK_RPC_URL });
      const positions = await provider.getPositions(makeCtx());
      expect(positions).toEqual([]);
    });
  });
});
