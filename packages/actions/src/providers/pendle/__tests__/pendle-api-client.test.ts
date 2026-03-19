/**
 * PendleApiClient unit tests.
 * Uses msw to intercept Pendle REST API v2 calls.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { PendleApiClient } from '../pendle-api-client.js';
import { PENDLE_DEFAULTS, PENDLE_CHAIN_ID_MAP, getPendleChainId } from '../config.js';
import type { PendleConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

const MOCK_MARKET = {
  address: '0xMarketAddress123',
  name: 'PT-stETH-26DEC2025',
  expiry: '2025-12-26T00:00:00Z',
  pt: '0xPTAddress123',
  yt: '0xYTAddress123',
  sy: '0xSYAddress123',
  underlyingAsset: {
    address: '0xUnderlyingAddress',
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

const MARKETS_RESPONSE = [MOCK_MARKET];

const CONVERT_RESPONSE = {
  tx: {
    to: '0xPendleRouter',
    data: '0xabcdef1234567890',
    value: '0',
  },
  amountOut: '1000000000000000000',
};

const SWAPPING_PRICES_RESPONSE = {
  ptPrice: 0.95,
  ytPrice: 0.05,
};

// ---------------------------------------------------------------------------
// MSW server setup
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api-v2.pendle.finance/core';

const server = setupServer(
  http.get(`${BASE_URL}/v1/markets/all`, () => {
    return HttpResponse.json(MARKETS_RESPONSE);
  }),
  http.get(`${BASE_URL}/v2/sdk/1/convert`, () => {
    return HttpResponse.json(CONVERT_RESPONSE);
  }),
  http.get(`${BASE_URL}/v1/sdk/1/markets/:market/swapping-prices`, () => {
    return HttpResponse.json(SWAPPING_PRICES_RESPONSE);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<PendleConfig> = {}): PendleConfig {
  return {
    ...PENDLE_DEFAULTS,
    enabled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PendleApiClient', () => {
  describe('getMarkets', () => {
    it('sends chainId as query parameter', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(MARKETS_RESPONSE);
        }),
      );

      const client = new PendleApiClient(makeConfig(), 1);
      await client.getMarkets();

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('chainId')).toBe('1');
    });

    it('returns validated markets array on success', async () => {
      const client = new PendleApiClient(makeConfig(), 1);
      const result = await client.getMarkets();

      expect(result).toHaveLength(1);
      const market = result[0]!;
      expect(market.address).toBe('0xMarketAddress123');
      expect(market.pt).toBe('0xPTAddress123');
      expect(market.yt).toBe('0xYTAddress123');
      expect(market.underlyingAsset.symbol).toBe('stETH');
      expect(market.details?.impliedApy).toBe(0.045);
    });

    it('returns markets from paginated response with data key', async () => {
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, () => {
          return HttpResponse.json({ data: [MOCK_MARKET], total: 1 });
        }),
      );

      const client = new PendleApiClient(makeConfig(), 1);
      const result = await client.getMarkets();

      expect(result).toHaveLength(1);
      expect(result[0]!.address).toBe('0xMarketAddress123');
    });

    it('validates response schema (rejects invalid data)', async () => {
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, () => {
          return HttpResponse.json([{ invalid: true }]);
        }),
      );

      const client = new PendleApiClient(makeConfig(), 1);
      await expect(client.getMarkets()).rejects.toThrow();
    });
  });

  describe('convert', () => {
    it('sends all parameters as query params', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const client = new PendleApiClient(makeConfig(), 1);
      await client.convert({
        tokensIn: '0xTokenIn',
        amountsIn: '1000000',
        tokensOut: '0xPT',
        slippage: '0.01',
        receiver: '0xWallet',
      });

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('tokensIn')).toBe('0xTokenIn');
      expect(url.searchParams.get('amountsIn')).toBe('1000000');
      expect(url.searchParams.get('tokensOut')).toBe('0xPT');
      expect(url.searchParams.get('slippage')).toBe('0.01');
      expect(url.searchParams.get('receiver')).toBe('0xWallet');
    });

    it('uses correct chainId in URL path', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/42161/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const client = new PendleApiClient(makeConfig(), 42161);
      await client.convert({
        tokensIn: '0xA',
        amountsIn: '100',
        tokensOut: '0xB',
        slippage: '0.01',
        receiver: '0xC',
      });

      expect(capturedUrl).toContain('/v2/sdk/42161/convert');
    });

    it('returns validated convert response', async () => {
      const client = new PendleApiClient(makeConfig(), 1);
      const result = await client.convert({
        tokensIn: '0xA',
        amountsIn: '100',
        tokensOut: '0xB',
        slippage: '0.01',
        receiver: '0xC',
      });

      expect(result.tx.to).toBe('0xPendleRouter');
      expect(result.tx.data).toBe('0xabcdef1234567890');
      expect(result.tx.value).toBe('0');
      expect(result.amountOut).toBe('1000000000000000000');
    });

    it('normalizes array response to single object (#403)', async () => {
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, () => {
          return HttpResponse.json([CONVERT_RESPONSE]);
        }),
      );

      const client = new PendleApiClient(makeConfig(), 1);
      const result = await client.convert({
        tokensIn: '0xA',
        amountsIn: '100',
        tokensOut: '0xB',
        slippage: '0.01',
        receiver: '0xC',
      });

      expect(result.tx.to).toBe('0xPendleRouter');
      expect(result.amountOut).toBe('1000000000000000000');
    });
  });

  describe('convert — extra fields tolerance (#407)', () => {
      it('accepts object response with extra fields in tx', async () => {
        server.use(
          http.get(`${BASE_URL}/v2/sdk/1/convert`, () => {
            return HttpResponse.json({
              tx: {
                to: '0xPendleRouter',
                data: '0xabcdef',
                value: '0',
                gasLimit: '350000',
                chainId: 1,
                type: 2,
              },
              amountOut: '500',
              priceImpact: 0.002,
              route: { steps: 3 },
            });
          }),
        );

        const client = new PendleApiClient(makeConfig(), 1);
        const result = await client.convert({
          tokensIn: '0xA',
          amountsIn: '100',
          tokensOut: '0xB',
          slippage: '0.01',
          receiver: '0xC',
        });

        expect(result.tx.to).toBe('0xPendleRouter');
        expect(result.tx.data).toBe('0xabcdef');
        expect(result.amountOut).toBe('500');
      });

      it('accepts array response with extra fields in tx', async () => {
        server.use(
          http.get(`${BASE_URL}/v2/sdk/1/convert`, () => {
            return HttpResponse.json([{
              tx: {
                to: '0xRouter',
                data: '0x1234',
                value: '0',
                gasLimit: '500000',
                maxFeePerGas: '30000000000',
              },
              amountOut: '999',
              bonus: { amount: '10' },
            }]);
          }),
        );

        const client = new PendleApiClient(makeConfig(), 1);
        const result = await client.convert({
          tokensIn: '0xA',
          amountsIn: '100',
          tokensOut: '0xB',
          slippage: '0.01',
          receiver: '0xC',
        });

        expect(result.tx.to).toBe('0xRouter');
        expect(result.amountOut).toBe('999');
      });
    });

    describe('getSwappingPrices', () => {
    it('returns validated swapping prices', async () => {
      const client = new PendleApiClient(makeConfig(), 1);
      const result = await client.getSwappingPrices('0xMarketAddress123');

      expect(result.ptPrice).toBe(0.95);
      expect(result.ytPrice).toBe(0.05);
    });

    it('includes market address in URL path', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v1/sdk/1/markets/:market/swapping-prices`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(SWAPPING_PRICES_RESPONSE);
        }),
      );

      const client = new PendleApiClient(makeConfig(), 1);
      await client.getSwappingPrices('0xMyMarket');

      expect(capturedUrl).toContain('0xMyMarket');
    });
  });

  describe('Authorization header', () => {
    it('sends Authorization Bearer when apiKey is configured', async () => {
      let capturedHeaders: Record<string, string> = {};
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json(MARKETS_RESPONSE);
        }),
      );

      const client = new PendleApiClient(makeConfig({ apiKey: 'my-api-key' }), 1);
      await client.getMarkets();

      expect(capturedHeaders['authorization']).toBe('Bearer my-api-key');
    });

    it('does NOT send Authorization when apiKey is empty', async () => {
      let capturedHeaders: Record<string, string> = {};
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json(MARKETS_RESPONSE);
        }),
      );

      const client = new PendleApiClient(makeConfig({ apiKey: '' }), 1);
      await client.getMarkets();

      expect(capturedHeaders['authorization']).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('throws ACTION_API_ERROR on 400 response', async () => {
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, () => {
          return HttpResponse.json({ reason: 'INVALID_CHAIN' }, { status: 400 });
        }),
      );

      const client = new PendleApiClient(makeConfig(), 1);
      await expect(client.getMarkets()).rejects.toThrow('API error 400');
    });

    it('throws ACTION_API_ERROR on 500 response', async () => {
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, () => {
          return HttpResponse.text('Internal Server Error', { status: 500 });
        }),
      );

      const client = new PendleApiClient(makeConfig(), 1);
      await expect(
        client.convert({
          tokensIn: '0xA',
          amountsIn: '100',
          tokensOut: '0xB',
          slippage: '0.01',
          receiver: '0xC',
        }),
      ).rejects.toThrow('API error 500');
    });

    it('throws ACTION_RATE_LIMITED on 429 response', async () => {
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, () => {
          return HttpResponse.text('Too Many Requests', { status: 429 });
        }),
      );

      const client = new PendleApiClient(makeConfig(), 1);
      await expect(client.getMarkets()).rejects.toThrow('Rate limited');
    });

    it('throws ACTION_API_TIMEOUT on timeout', async () => {
      server.use(
        http.get(`${BASE_URL}/v1/markets/all`, async () => {
          await delay(500);
          return HttpResponse.json(MARKETS_RESPONSE);
        }),
      );

      const client = new PendleApiClient(makeConfig({ requestTimeoutMs: 50 }), 1);
      await expect(client.getMarkets()).rejects.toThrow('timeout');
    });
  });

  describe('Config: PENDLE_CHAIN_ID_MAP', () => {
    it('maps ethereum-mainnet to 1', () => {
      expect(PENDLE_CHAIN_ID_MAP['ethereum-mainnet']).toBe(1);
    });

    it('maps arbitrum-mainnet to 42161', () => {
      expect(PENDLE_CHAIN_ID_MAP['arbitrum-mainnet']).toBe(42161);
    });

    it('maps base-mainnet to 8453', () => {
      expect(PENDLE_CHAIN_ID_MAP['base-mainnet']).toBe(8453);
    });

    it('getPendleChainId throws for unsupported network', () => {
      expect(() => getPendleChainId('solana-mainnet')).toThrow('Unsupported network');
    });

    it('getPendleChainId returns correct chain ID', () => {
      expect(getPendleChainId('ethereum-mainnet')).toBe(1);
    });
  });
});
