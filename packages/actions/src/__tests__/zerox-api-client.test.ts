/**
 * ZeroExApiClient unit tests.
 * Uses msw to intercept 0x Swap API v2 calls.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { ZeroExApiClient } from '../providers/zerox-swap/zerox-api-client.js';
import {
  ALLOWANCE_HOLDER_ADDRESSES,
  getAllowanceHolderAddress,
  CHAIN_ID_MAP,
  ZEROX_SWAP_DEFAULTS,
} from '../providers/zerox-swap/config.js';
import type { ZeroExSwapConfig } from '../providers/zerox-swap/config.js';

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

const PRICE_RESPONSE = {
  blockNumber: '21359842',
  buyAmount: '1000000',           // 1 USDC (6 decimals)
  buyToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',  // USDC
  fees: {
    integratorFee: null,
    zeroExFee: { amount: '0', token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', type: 'volume' },
    gasFee: null,
  },
  gas: '200000',
  gasPrice: '30000000000',
  liquidityAvailable: true,
  minBuyAmount: '990000',
  route: {
    fills: [{ from: '0xETH', to: '0xUSDC', source: 'Uniswap_V3', proportionBps: '10000' }],
    tokens: [
      { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH' },
      { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC' },
    ],
  },
  sellAmount: '1000000000000000000',  // 1 ETH in wei
  sellToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  totalNetworkFee: '6000000000000000',
};

const QUOTE_RESPONSE = {
  ...PRICE_RESPONSE,
  transaction: {
    to: '0x0000000000001fF3684f28c67538d4D072C22734',  // AllowanceHolder
    data: '0xabcdef1234567890',
    gas: '200000',
    gasPrice: '30000000000',
    value: '1000000000000000000',  // ETH value for native sell
  },
  permit2: null,
};

// ---------------------------------------------------------------------------
// MSW server setup
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get('https://api.0x.org/swap/allowance-holder/price', () => {
    return HttpResponse.json(PRICE_RESPONSE);
  }),
  http.get('https://api.0x.org/swap/allowance-holder/quote', () => {
    return HttpResponse.json(QUOTE_RESPONSE);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<ZeroExSwapConfig> = {}): ZeroExSwapConfig {
  return {
    ...ZEROX_SWAP_DEFAULTS,
    enabled: true,
    apiKey: 'test-api-key-123',
    ...overrides,
  };
}

const DEFAULT_PARAMS = {
  sellToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  buyToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  sellAmount: '1000000000000000000',
  taker: '0x1234567890abcdef1234567890abcdef12345678',
  slippageBps: 100,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ZeroExApiClient', () => {
  describe('ZXSW-01: API request format', () => {
    it('sends chainId as query parameter', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/price', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(PRICE_RESPONSE);
        }),
      );

      const client = new ZeroExApiClient(makeConfig(), 1);
      await client.getPrice(DEFAULT_PARAMS);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('chainId')).toBe('1');
    });

    it('sends 0x-api-key header when configured', async () => {
      let capturedHeaders: Record<string, string> = {};
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/price', ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json(PRICE_RESPONSE);
        }),
      );

      const client = new ZeroExApiClient(makeConfig({ apiKey: 'my-secret-key' }), 1);
      await client.getPrice(DEFAULT_PARAMS);

      expect(capturedHeaders['0x-api-key']).toBe('my-secret-key');
    });

    it('sends 0x-version: v2 header', async () => {
      let capturedHeaders: Record<string, string> = {};
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/price', ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json(PRICE_RESPONSE);
        }),
      );

      const client = new ZeroExApiClient(makeConfig(), 1);
      await client.getPrice(DEFAULT_PARAMS);

      expect(capturedHeaders['0x-version']).toBe('v2');
    });

    it('does NOT send 0x-api-key header when apiKey is empty', async () => {
      let capturedHeaders: Record<string, string> = {};
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/price', ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json(PRICE_RESPONSE);
        }),
      );

      const client = new ZeroExApiClient(makeConfig({ apiKey: '' }), 1);
      await client.getPrice(DEFAULT_PARAMS);

      expect(capturedHeaders['0x-api-key']).toBeUndefined();
    });
  });

  describe('ZXSW-02: getPrice Zod validation', () => {
    it('returns validated PriceResponse on success', async () => {
      const client = new ZeroExApiClient(makeConfig(), 1);
      const result = await client.getPrice(DEFAULT_PARAMS);

      expect(result.liquidityAvailable).toBe(true);
      expect(result.buyAmount).toBe('1000000');
      expect(result.sellAmount).toBe('1000000000000000000');
      expect(result.route.fills).toHaveLength(1);
      expect(result.route.tokens).toHaveLength(2);
    });

    it('passes sellToken, buyToken, sellAmount, taker, slippageBps as query params', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/price', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(PRICE_RESPONSE);
        }),
      );

      const client = new ZeroExApiClient(makeConfig(), 137);
      await client.getPrice({
        sellToken: '0xSELL',
        buyToken: '0xBUY',
        sellAmount: '999',
        taker: '0xTAKER',
        slippageBps: 50,
      });

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('sellToken')).toBe('0xSELL');
      expect(url.searchParams.get('buyToken')).toBe('0xBUY');
      expect(url.searchParams.get('sellAmount')).toBe('999');
      expect(url.searchParams.get('taker')).toBe('0xTAKER');
      expect(url.searchParams.get('slippageBps')).toBe('50');
      expect(url.searchParams.get('chainId')).toBe('137');
    });
  });

  describe('ZXSW-03: getQuote Zod validation', () => {
    it('returns validated QuoteResponse with transaction field', async () => {
      const client = new ZeroExApiClient(makeConfig(), 1);
      const result = await client.getQuote(DEFAULT_PARAMS);

      expect(result.transaction).toBeDefined();
      expect(result.liquidityAvailable).toBe(true);
      expect(result.permit2).toBeNull();
    });

    it('transaction.to, transaction.data, transaction.value are present', async () => {
      const client = new ZeroExApiClient(makeConfig(), 1);
      const result = await client.getQuote(DEFAULT_PARAMS);

      expect(result.transaction.to).toBe('0x0000000000001fF3684f28c67538d4D072C22734');
      expect(result.transaction.data).toBe('0xabcdef1234567890');
      expect(result.transaction.value).toBe('1000000000000000000');
      expect(result.transaction.gas).toBe('200000');
      expect(result.transaction.gasPrice).toBe('30000000000');
    });
  });

  describe('ZXSW-08: API error handling', () => {
    it('throws ACTION_API_ERROR on 400 response', async () => {
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/price', () => {
          return HttpResponse.json({ reason: 'VALIDATION_FAILED' }, { status: 400 });
        }),
      );

      const client = new ZeroExApiClient(makeConfig(), 1);
      await expect(client.getPrice(DEFAULT_PARAMS)).rejects.toThrow('API error 400');
    });

    it('throws ACTION_API_ERROR on 500 response', async () => {
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/quote', () => {
          return HttpResponse.text('Internal Server Error', { status: 500 });
        }),
      );

      const client = new ZeroExApiClient(makeConfig(), 1);
      await expect(client.getQuote(DEFAULT_PARAMS)).rejects.toThrow('API error 500');
    });

    it('error message includes response body text', async () => {
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/price', () => {
          return HttpResponse.json({ reason: 'TOKEN_NOT_SUPPORTED' }, { status: 400 });
        }),
      );

      const client = new ZeroExApiClient(makeConfig(), 1);
      await expect(client.getPrice(DEFAULT_PARAMS)).rejects.toThrow('TOKEN_NOT_SUPPORTED');
    });
  });

  describe('ZXSW-10: Timeout', () => {
    it('throws ACTION_API_TIMEOUT when request exceeds timeout', async () => {
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/price', async () => {
          await delay(500);
          return HttpResponse.json(PRICE_RESPONSE);
        }),
      );

      // Use very short timeout to trigger abort
      const client = new ZeroExApiClient(makeConfig({ requestTimeoutMs: 50 }), 1);
      await expect(client.getPrice(DEFAULT_PARAMS)).rejects.toThrow('timeout');
    });
  });

  describe('ZXSW-09: AllowanceHolder mapping', () => {
    it('returns correct address for Ethereum (chainId 1)', () => {
      expect(getAllowanceHolderAddress(1)).toBe('0x0000000000001fF3684f28c67538d4D072C22734');
    });

    it('returns correct address for Polygon (chainId 137)', () => {
      expect(getAllowanceHolderAddress(137)).toBe('0x0000000000001fF3684f28c67538d4D072C22734');
    });

    it('returns correct address for Arbitrum (chainId 42161)', () => {
      expect(getAllowanceHolderAddress(42161)).toBe('0x0000000000001fF3684f28c67538d4D072C22734');
    });

    it('returns correct address for Mantle (chainId 5000)', () => {
      expect(getAllowanceHolderAddress(5000)).toBe('0x0000000000001fF3684f28c67538d4D072C22734');
    });

    it('throws for unsupported chainId', () => {
      expect(() => getAllowanceHolderAddress(99999)).toThrow('Unsupported chain ID 99999');
    });

    it('has exactly 20 supported chains', () => {
      expect(ALLOWANCE_HOLDER_ADDRESSES.size).toBe(20);
    });

    it('CHAIN_ID_MAP maps known networks correctly', () => {
      expect(CHAIN_ID_MAP['ethereum-mainnet']).toBe(1);
      expect(CHAIN_ID_MAP['polygon-mainnet']).toBe(137);
      expect(CHAIN_ID_MAP['arbitrum-mainnet']).toBe(42161);
      expect(CHAIN_ID_MAP['optimism-mainnet']).toBe(10);
      expect(CHAIN_ID_MAP['base-mainnet']).toBe(8453);
    });
  });
});
