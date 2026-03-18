/**
 * ZeroExSwapActionProvider supplementary unit tests.
 *
 * Focuses on paths not covered by existing zerox-swap.test.ts:
 * - humanSellAmount + decimals conversion
 * - chainId parameter override
 * - CHAIN_ID_MAP key-based resolution
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ZeroExSwapActionProvider } from '../index.js';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWANCE_HOLDER = '0x0000000000001fF3684f28c67538d4D072C22734';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const NATIVE_ETH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

function makeQuoteResponse(overrides: Record<string, unknown> = {}) {
  return {
    blockNumber: '21359842',
    buyAmount: '1000000',
    buyToken: USDC,
    fees: {
      integratorFee: null,
      zeroExFee: { amount: '0', token: NATIVE_ETH, type: 'volume' },
      gasFee: null,
    },
    gas: '200000',
    gasPrice: '30000000000',
    liquidityAvailable: true,
    minBuyAmount: '990000',
    route: {
      fills: [{ from: '0xETH', to: '0xUSDC', source: 'Uniswap_V3', proportionBps: '10000' }],
      tokens: [
        { address: NATIVE_ETH, symbol: 'ETH' },
        { address: USDC, symbol: 'USDC' },
      ],
    },
    sellAmount: '1000000000000000000',
    sellToken: WETH,
    totalNetworkFee: '6000000000000000',
    transaction: {
      to: ALLOWANCE_HOLDER,
      data: '0xswapdata_erc20',
      gas: '200000',
      gasPrice: '30000000000',
      value: '0',
    },
    permit2: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MSW
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get('https://api.0x.org/swap/allowance-holder/quote', () => {
    return HttpResponse.json(makeQuoteResponse());
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const CONTEXT: ActionContext = {
  walletAddress: '0x1234567890123456789012345678901234567890',
  chain: 'ethereum',
  walletId: '00000000-0000-0000-0000-000000000001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ZeroExSwapActionProvider - humanSellAmount conversion', () => {
  it('converts humanSellAmount="1.0" with decimals=18 to sellAmount="1000000000000000000"', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://api.0x.org/swap/allowance-holder/quote', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeQuoteResponse());
      }),
    );

    const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
    const result = await provider.resolve('swap', {
      sellToken: WETH,
      buyToken: USDC,
      humanSellAmount: '1.0',
      decimals: 18,
    }, CONTEXT);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    const url = new URL(capturedUrl);
    expect(url.searchParams.get('sellAmount')).toBe('1000000000000000000');
  });

  it('converts humanSellAmount="100" with decimals=6 to sellAmount="100000000"', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://api.0x.org/swap/allowance-holder/quote', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeQuoteResponse());
      }),
    );

    const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
    await provider.resolve('swap', {
      sellToken: WETH,
      buyToken: USDC,
      humanSellAmount: '100',
      decimals: 6,
    }, CONTEXT);

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('sellAmount')).toBe('100000000');
  });

  it('throws when humanSellAmount given without decimals', async () => {
    const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
    await expect(
      provider.resolve('swap', {
        sellToken: WETH,
        buyToken: USDC,
        humanSellAmount: '1.0',
      }, CONTEXT),
    ).rejects.toThrow('decimals');
  });

  it('throws when neither sellAmount nor humanSellAmount provided', async () => {
    const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
    await expect(
      provider.resolve('swap', {
        sellToken: WETH,
        buyToken: USDC,
      }, CONTEXT),
    ).rejects.toThrow();
  });
});

describe('ZeroExSwapActionProvider - chainId override', () => {
  it('uses explicit chainId parameter over default', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://api.0x.org/swap/allowance-holder/quote', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeQuoteResponse());
      }),
    );

    const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
    await provider.resolve('swap', {
      sellToken: WETH,
      buyToken: USDC,
      sellAmount: '1000000000000000000',
      chainId: 8453, // Base
    }, CONTEXT);

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('chainId')).toBe('8453');
  });
});

describe('ZeroExSwapActionProvider - API error on quote', () => {
  it('throws when API returns 400 error', async () => {
    server.use(
      http.get('https://api.0x.org/swap/allowance-holder/quote', () => {
        return HttpResponse.json({ message: 'Bad request' }, { status: 400 });
      }),
    );

    const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
    await expect(
      provider.resolve('swap', {
        sellToken: WETH,
        buyToken: USDC,
        sellAmount: '1000000000000000000',
      }, CONTEXT),
    ).rejects.toThrow();
  });
});
