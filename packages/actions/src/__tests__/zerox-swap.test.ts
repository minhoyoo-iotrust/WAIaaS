/**
 * ZeroExSwapActionProvider unit tests.
 * Uses msw to intercept 0x Swap API v2 calls.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ZeroExSwapActionProvider } from '../providers/zerox-swap/index.js';
import { getAllowanceHolderAddress } from '../providers/zerox-swap/config.js';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

const ALLOWANCE_HOLDER = '0x0000000000001fF3684f28c67538d4D072C22734';

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const NATIVE_ETH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

function makeQuoteResponse(overrides: Record<string, unknown> = {}) {
  return {
    blockNumber: '21359842',
    buyAmount: '1000000',
    buyToken: USDC_ADDRESS,
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
        { address: USDC_ADDRESS, symbol: 'USDC' },
      ],
    },
    sellAmount: '1000000000000000000',
    sellToken: WETH_ADDRESS,
    totalNetworkFee: '6000000000000000',
    transaction: {
      to: ALLOWANCE_HOLDER,
      data: '0xswapdata123',
      gas: '200000',
      gasPrice: '30000000000',
      value: '0',
    },
    permit2: null,
    ...overrides,
  };
}

/** ERC-20 sell (WETH -> USDC): value=0 */
const ERC20_QUOTE_RESPONSE = makeQuoteResponse({
  sellToken: WETH_ADDRESS,
  transaction: {
    to: ALLOWANCE_HOLDER,
    data: '0xswapdata_erc20',
    gas: '200000',
    gasPrice: '30000000000',
    value: '0',
  },
});

/** Native ETH sell: value > 0 */
const ETH_QUOTE_RESPONSE = makeQuoteResponse({
  sellToken: NATIVE_ETH,
  transaction: {
    to: ALLOWANCE_HOLDER,
    data: '0xswapdata_eth',
    gas: '200000',
    gasPrice: '30000000000',
    value: '1000000000000000000',
  },
});

// ---------------------------------------------------------------------------
// MSW server setup
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get('https://api.0x.org/swap/allowance-holder/quote', ({ request }) => {
    const url = new URL(request.url);
    const sellToken = url.searchParams.get('sellToken');

    // Return appropriate response based on sellToken
    if (sellToken?.toLowerCase() === NATIVE_ETH) {
      return HttpResponse.json(ETH_QUOTE_RESPONSE);
    }
    return HttpResponse.json(ERC20_QUOTE_RESPONSE);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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

describe('ZeroExSwapActionProvider', () => {
  describe('metadata', () => {
    it('has correct provider metadata', () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true });
      expect(provider.metadata.name).toBe('zerox_swap');
      expect(provider.metadata.chains).toEqual(['ethereum']);
      expect(provider.metadata.mcpExpose).toBe(true);
      expect(provider.metadata.requiresApiKey).toBe(true);
      expect(provider.metadata.requiredApis).toEqual(['0x']);
      expect(provider.metadata.version).toBe('1.0.0');
    });

    it('exposes swap action', () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true });
      expect(provider.actions).toHaveLength(1);
      const swap = provider.actions[0]!;
      expect(swap.name).toBe('swap');
      expect(swap.chain).toBe('ethereum');
      expect(swap.riskLevel).toBe('medium');
      expect(swap.defaultTier).toBe('INSTANT');
    });
  });

  describe('ZXSW-04: ERC-20 sell returns [approve, swap]', () => {
    it('returns 2-element array for ERC-20 token sell', async () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      const result = await provider.resolve('swap', {
        sellToken: WETH_ADDRESS,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
      }, CONTEXT);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('first element is approve to AllowanceHolder with correct calldata', async () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      const result = await provider.resolve('swap', {
        sellToken: WETH_ADDRESS,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
      }, CONTEXT);

      const approve = (result as Array<{ type: string; to: string; calldata?: string; value?: string }>)[0]!;
      expect(approve.type).toBe('CONTRACT_CALL');
      expect(approve.to).toBe(WETH_ADDRESS);
      expect(approve.calldata).toMatch(/^0x095ea7b3/); // ERC-20 approve selector
      expect(approve.value).toBe('0');
    });

    it('second element is swap with quote transaction data', async () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      const result = await provider.resolve('swap', {
        sellToken: WETH_ADDRESS,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
      }, CONTEXT);

      const swap = (result as Array<{ type: string; to: string; calldata?: string; value?: string }>)[1]!;
      expect(swap.type).toBe('CONTRACT_CALL');
      expect(swap.to).toBe(ALLOWANCE_HOLDER);
      expect(swap.calldata).toBe('0xswapdata_erc20');
      expect(swap.value).toBe('0');
    });

    it('approve.to equals sellToken address', async () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      const result = await provider.resolve('swap', {
        sellToken: WETH_ADDRESS,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
      }, CONTEXT);

      const approve = (result as Array<{ type: string; to: string }>)[0]!;
      expect(approve.to).toBe(WETH_ADDRESS);
    });

    it('swap.to equals AllowanceHolder address', async () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      const result = await provider.resolve('swap', {
        sellToken: WETH_ADDRESS,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
      }, CONTEXT);

      const swap = (result as Array<{ type: string; to: string }>)[1]!;
      expect(swap.to).toBe(getAllowanceHolderAddress(1));
    });
  });

  describe('ZXSW-05: Native ETH sell returns [swap]', () => {
    it('returns 1-element array for ETH native sell', async () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      const result = await provider.resolve('swap', {
        sellToken: NATIVE_ETH,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
      }, CONTEXT);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });

    it('single element has swap calldata and value from quote', async () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      const result = await provider.resolve('swap', {
        sellToken: NATIVE_ETH,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
      }, CONTEXT);

      const swap = (result as Array<{ type: string; to: string; calldata?: string; value?: string }>)[0]!;
      expect(swap.type).toBe('CONTRACT_CALL');
      expect(swap.to).toBe(ALLOWANCE_HOLDER);
      expect(swap.calldata).toBe('0xswapdata_eth');
      expect(swap.value).toBe('1000000000000000000');
    });
  });

  describe('ZXSW-HEX: hex value conversion (#190)', () => {
    it('converts hex value to decimal string for native ETH swap', async () => {
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/quote', () => {
          return HttpResponse.json(makeQuoteResponse({
            sellToken: NATIVE_ETH,
            transaction: {
              to: ALLOWANCE_HOLDER,
              data: '0xswapdata_eth',
              gas: '200000',
              gasPrice: '30000000000',
              value: '0xde0b6b3a7640000', // 1000000000000000000 in hex (1 ETH)
            },
          }));
        }),
      );

      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      const result = await provider.resolve('swap', {
        sellToken: NATIVE_ETH,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
      }, CONTEXT);

      const swap = (result as Array<{ value?: string }>)[0]!;
      expect(swap.value).toBe('1000000000000000000');
    });

    it('converts hex "0x0" to decimal "0"', async () => {
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/quote', () => {
          return HttpResponse.json(makeQuoteResponse({
            transaction: {
              to: ALLOWANCE_HOLDER,
              data: '0xswapdata_erc20',
              gas: '200000',
              gasPrice: '30000000000',
              value: '0x0',
            },
          }));
        }),
      );

      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      const result = await provider.resolve('swap', {
        sellToken: WETH_ADDRESS,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
      }, CONTEXT);

      const swap = (result as Array<{ value?: string }>)[1]!;
      expect(swap.value).toBe('0');
    });

    it('passes decimal value through unchanged', async () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      const result = await provider.resolve('swap', {
        sellToken: NATIVE_ETH,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
      }, CONTEXT);

      const swap = (result as Array<{ value?: string }>)[0]!;
      expect(swap.value).toBe('1000000000000000000');
    });
  });

  describe('#316: gas/gasPrice optional in 0x v2 response', () => {
    it('resolves successfully when gas and gasPrice are missing from API response', async () => {
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/quote', () => {
          // Simulate 0x API v2 response without gas/gasPrice fields
          return HttpResponse.json({
            blockNumber: '21359842',
            buyAmount: '1000000',
            buyToken: USDC_ADDRESS,
            fees: {
              integratorFee: null,
              zeroExFee: { amount: '0', token: NATIVE_ETH, type: 'volume' },
              gasFee: null,
            },
            // gas and gasPrice intentionally omitted
            liquidityAvailable: true,
            minBuyAmount: '990000',
            route: {
              fills: [{ from: '0xETH', to: '0xUSDC', source: 'Uniswap_V3', proportionBps: '10000' }],
              tokens: [
                { address: NATIVE_ETH, symbol: 'ETH' },
                { address: USDC_ADDRESS, symbol: 'USDC' },
              ],
            },
            sellAmount: '1000000000000000000',
            sellToken: WETH_ADDRESS,
            totalNetworkFee: '6000000000000000',
            transaction: {
              to: ALLOWANCE_HOLDER,
              data: '0xswapdata_no_gas',
              // gas and gasPrice intentionally omitted
              value: '0',
            },
            permit2: null,
          });
        }),
      );

      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      const result = await provider.resolve('swap', {
        sellToken: WETH_ADDRESS,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
      }, CONTEXT);

      expect(result).toHaveLength(2);
      const swap = (result as Array<{ type: string; to: string; calldata?: string }>)[1]!;
      expect(swap.type).toBe('CONTRACT_CALL');
      expect(swap.to).toBe(ALLOWANCE_HOLDER);
      expect(swap.calldata).toBe('0xswapdata_no_gas');
    });
  });

  describe('ZXSW-06: Slippage clamping', () => {
    it('uses default 100bps (1%) when no slippage specified', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/quote', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(ERC20_QUOTE_RESPONSE);
        }),
      );

      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      await provider.resolve('swap', {
        sellToken: WETH_ADDRESS,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('slippageBps')).toBe('100');
    });

    it('clamps slippage exceeding max to 500bps (5%)', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/quote', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(ERC20_QUOTE_RESPONSE);
        }),
      );

      const provider = new ZeroExSwapActionProvider({
        enabled: true,
        apiKey: 'test-key',
        defaultSlippageBps: 100,
        maxSlippageBps: 500,
      });
      await provider.resolve('swap', {
        sellToken: WETH_ADDRESS,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
        slippageBps: 1000,
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('slippageBps')).toBe('500');
    });

    it('passes user-specified slippage within range', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/quote', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(ERC20_QUOTE_RESPONSE);
        }),
      );

      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      await provider.resolve('swap', {
        sellToken: WETH_ADDRESS,
        buyToken: USDC_ADDRESS,
        sellAmount: '1000000000000000000',
        slippageBps: 200,
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('slippageBps')).toBe('200');
    });
  });

  describe('ZXSW-07: Liquidity check', () => {
    it('throws when liquidityAvailable=false', async () => {
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/quote', () => {
          return HttpResponse.json(makeQuoteResponse({ liquidityAvailable: false }));
        }),
      );

      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });

      await expect(
        provider.resolve('swap', {
          sellToken: WETH_ADDRESS,
          buyToken: USDC_ADDRESS,
          sellAmount: '1000000000000000000',
        }, CONTEXT),
      ).rejects.toThrow('No liquidity');
    });
  });

  describe('error handling', () => {
    it('throws on unknown action name', async () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true });
      await expect(
        provider.resolve('unknown', {}, CONTEXT),
      ).rejects.toThrow('Unknown action');
    });

    it('throws on same-token swap (SAFE-05)', async () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });
      await expect(
        provider.resolve('swap', {
          sellToken: WETH_ADDRESS,
          buyToken: WETH_ADDRESS,
          sellAmount: '1000000000000000000',
        }, CONTEXT),
      ).rejects.toThrow('Cannot swap a token for itself');
    });

    it('throws on missing input params', async () => {
      const provider = new ZeroExSwapActionProvider({ enabled: true });
      await expect(
        provider.resolve('swap', { sellToken: '' }, CONTEXT),
      ).rejects.toThrow();
    });

    it('throws on AllowanceHolder address mismatch in quote response', async () => {
      server.use(
        http.get('https://api.0x.org/swap/allowance-holder/quote', () => {
          return HttpResponse.json(makeQuoteResponse({
            transaction: {
              to: '0xDEADBEEF00000000000000000000000000000000',
              data: '0xmalicious',
              gas: '200000',
              gasPrice: '30000000000',
              value: '0',
            },
          }));
        }),
      );

      const provider = new ZeroExSwapActionProvider({ enabled: true, apiKey: 'test-key' });

      await expect(
        provider.resolve('swap', {
          sellToken: WETH_ADDRESS,
          buyToken: USDC_ADDRESS,
          sellAmount: '1000000000000000000',
        }, CONTEXT),
      ).rejects.toThrow('AllowanceHolder address mismatch');
    });
  });
});
