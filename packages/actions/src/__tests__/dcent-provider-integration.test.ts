/**
 * DcentSwapActionProvider integration tests.
 *
 * Tests resolve() method, query methods, and error handling
 * at the provider class level using msw HTTP mocks.
 *
 * Phase 346-03 Task 1: TEST-05, TEST-07
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { DcentSwapActionProvider } from '../providers/dcent-swap/index.js';
import { ChainError } from '@waiaas/core';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://agent-swap.dcentwallet.com';
const ETH_CAIP19 = 'eip155:1/slip44:60';
const USDC_CAIP19 = 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

const SUSHI_SPENDER = '0xAC4c6e212A361c968F1725b4d055b47E63F80b75';
const WALLET_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

const CONTEXT: ActionContext = {
  chain: 'ethereum',
  walletAddress: WALLET_ADDRESS,
  walletId: 'test-wallet-uuid',
};

// ---------------------------------------------------------------------------
// Mock responses
// ---------------------------------------------------------------------------

function makeQuotesResponse() {
  return {
    status: 'success',
    fromId: 'ETHEREUM',
    toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    providers: {
      bestOrder: ['sushi_swap', 'uniswap_swap'],
      common: [
        {
          id: 'sushi_swap',
          status: 'success',
          providerId: 'sushi_swap',
          providerType: 'swap',
          name: 'Sushi',
          fromAmount: '1000000000000000000',
          quoteType: 'flexible',
          expectedAmount: '2049257221',
          spenderContractAddress: SUSHI_SPENDER,
        },
      ],
    },
  };
}

function makeTxDataResponse() {
  return {
    status: 'success',
    txdata: {
      from: WALLET_ADDRESS,
      to: SUSHI_SPENDER,
      data: '0x5f3bd1c8000000000000000000000000',
      value: '1000000000000000000',
    },
    networkFee: { gas: '275841', gasPrice: '121236406' },
  };
}

function makeNoRouteResponse() {
  return {
    status: 'fail_no_available_provider',
    fromId: 'ERC20/0xabc',
    toId: 'ERC20/0xdef',
    providers: { bestOrder: [], common: [] },
  };
}


// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () =>
    HttpResponse.json([
      { currencyId: 'ETHEREUM', tokenDeviceId: 'ERC20', providers: ['sushi_swap'] },
    ]),
  ),
  http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () =>
    HttpResponse.json(makeQuotesResponse()),
  ),
  http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () =>
    HttpResponse.json(makeTxDataResponse()),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Provider instance
// ---------------------------------------------------------------------------

function createProvider(): DcentSwapActionProvider {
  return new DcentSwapActionProvider({
    apiBaseUrl: BASE_URL,
    requestTimeoutMs: 5_000,
    defaultSlippageBps: 100,
    maxSlippageBps: 500,
    currencyCacheTtlMs: 86_400_000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DcentSwapActionProvider resolve()', () => {
  describe('resolve dex_swap', () => {
    it('returns single ContractCallRequest for native sell (ETH -> USDC)', async () => {
      const provider = createProvider();
      const result = await provider.resolve('dex_swap', {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      }, CONTEXT);

      // Native sell returns single ContractCallRequest (no approve needed)
      expect('__apiDirect' in (result as object)).toBe(false);
      const requests = Array.isArray(result) ? result : [result];
      expect(requests.length).toBe(1);
      const req0 = requests[0] as { to: string; calldata: string; value: string };
      expect(req0.to.toLowerCase()).toBe(SUSHI_SPENDER.toLowerCase());
      expect(req0.calldata).toContain('0x');
      expect(req0.value).toBe('1000000000000000000');
    });

    it('returns two ContractCallRequests for ERC-20 sell (USDC -> ETH)', async () => {
      // Override get_quotes to return USDC -> ETH with spenderContractAddress
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () =>
          HttpResponse.json({
            status: 'success',
            fromId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            toId: 'ETHEREUM',
            providers: {
              bestOrder: ['sushi_swap'],
              common: [{
                id: 'sushi_swap',
                status: 'success',
                providerId: 'sushi_swap',
                providerType: 'swap',
                name: 'Sushi',
                fromAmount: '2000000000',
                quoteType: 'flexible',
                expectedAmount: '900000000000000000',
                spenderContractAddress: SUSHI_SPENDER,
              }],
            },
          }),
        ),
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () =>
          HttpResponse.json({
            status: 'success',
            txdata: {
              from: WALLET_ADDRESS,
              to: SUSHI_SPENDER,
              data: '0xswapdata',
              value: '0',
            },
            networkFee: { gas: '200000' },
          }),
        ),
      );

      const provider = createProvider();
      const result = await provider.resolve('dex_swap', {
        fromAsset: USDC_CAIP19,
        toAsset: ETH_CAIP19,
        amount: '2000000000',
        fromDecimals: 6,
        toDecimals: 18,
      }, CONTEXT);

      expect('__apiDirect' in (result as object)).toBe(false);
      const requests = Array.isArray(result) ? result : [result];
      expect(requests.length).toBe(2);

      // First = approve
      const approve = requests[0] as { to: string; calldata: string };
      expect(approve.to.toLowerCase()).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
      expect(approve.calldata).toContain('0x095ea7b3'); // approve selector

      // Second = swap
      const swap = requests[1] as { to: string };
      expect(swap.to.toLowerCase()).toBe(SUSHI_SPENDER.toLowerCase());
    });

    it('attempts 2-hop routing fallback when no direct route', async () => {
      // All calls return no-route (simulates complete failure after fallback attempt)
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () =>
          HttpResponse.json(makeNoRouteResponse()),
        ),
      );

      const provider = createProvider();
      // Should eventually throw after attempting 2-hop fallback
      await expect(
        provider.resolve('dex_swap', {
          fromAsset: 'eip155:1/erc20:0x0000000000000000000000000000000000000abc',
          toAsset: 'eip155:1/erc20:0x0000000000000000000000000000000000000def',
          amount: '1000000000',
          fromDecimals: 18,
          toDecimals: 18,
        }, CONTEXT),
      ).rejects.toThrow('No 2-hop swap route available');
    });
  });

  describe('resolve informational actions', () => {
    it('resolve get_quotes returns ApiDirectResult with quote data', async () => {
      const provider = createProvider();
      const result = await provider.resolve('get_quotes', {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      }, CONTEXT);

      // Should return ApiDirectResult, not throw
      expect(result).toBeDefined();
      expect((result as any).__apiDirect).toBe(true);
      expect((result as any).status).toBe('success');
      expect((result as any).externalId).toMatch(/^dcent-quotes-/);
      expect((result as any).data.totalProviders).toBeGreaterThanOrEqual(1);
      expect((result as any).data.bestDexProvider).toBeDefined();
      expect((result as any).data.dexProviders).toBeInstanceOf(Array);
    });

    it('resolve unknown_action throws INVALID_INSTRUCTION', async () => {
      const provider = createProvider();
      await expect(
        provider.resolve('unknown_action', {}, CONTEXT),
      ).rejects.toThrow(ChainError);
    });
  });

  describe('query methods', () => {
    it('queryQuotes returns structured DcentQuoteResult', async () => {
      const provider = createProvider();
      const result = await provider.queryQuotes({
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      });

      expect(result.dexProviders).toBeDefined();
      expect(result.dexProviders.length).toBeGreaterThanOrEqual(1);
      expect(result.bestDexProvider).toBeDefined();
      expect(result.bestDexProvider?.providerId).toBe('sushi_swap');
    });

  });

  describe('error handling', () => {
    it('rejects with ChainError on empty providers', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () =>
          HttpResponse.json({
            status: 'fail_no_available_provider',
            fromId: 'UNKNOWN_TOKEN_A',
            toId: 'UNKNOWN_TOKEN_B',
            providers: { bestOrder: [], common: [] },
          }),
        ),
      );

      const provider = createProvider();
      await expect(
        provider.queryQuotes({
          fromAsset: 'eip155:1/erc20:0x1111',
          toAsset: 'eip155:1/erc20:0x2222',
          amount: '1000',
          fromDecimals: 18,
          toDecimals: 18,
        }),
      ).rejects.toThrow();
    });

    it('handles HTTP error gracefully', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () =>
          HttpResponse.json({ error: 'Internal Server Error' }, { status: 500 }),
        ),
      );

      const provider = createProvider();
      await expect(
        provider.queryQuotes({
          fromAsset: ETH_CAIP19,
          toAsset: USDC_CAIP19,
          amount: '1000000000000000000',
          fromDecimals: 18,
          toDecimals: 6,
        }),
      ).rejects.toThrow();
    });

    it('validates invalid params with Zod', async () => {
      const provider = createProvider();
      await expect(
        provider.resolve('dex_swap', {
          fromAsset: '',  // invalid: min(1)
          toAsset: USDC_CAIP19,
          amount: '1000',
          fromDecimals: 18,
          toDecimals: 6,
        }, CONTEXT),
      ).rejects.toThrow();
    });
  });

  describe('decimals auto-resolution (#404)', () => {
    it('auto-resolves fromDecimals/toDecimals for well-known tokens', async () => {
      const provider = createProvider();
      // ETH=18, USDC=6 — both well-known in INTERMEDIATE_TOKENS
      const result = await provider.resolve('dex_swap', {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        // No fromDecimals/toDecimals provided
      }, CONTEXT);

      const requests = Array.isArray(result) ? result : [result];
      expect(requests.length).toBeGreaterThanOrEqual(1);
    });

    it('throws clear error for unknown asset without explicit decimals', async () => {
      const provider = createProvider();
      await expect(
        provider.resolve('dex_swap', {
          fromAsset: 'eip155:1/erc20:0x0000000000000000000000000000000000099999',
          toAsset: USDC_CAIP19,
          amount: '1000',
          // No fromDecimals — unknown token
        }, CONTEXT),
      ).rejects.toThrow('fromDecimals');
    });

    it('accepts explicit decimals even for known tokens', async () => {
      const provider = createProvider();
      const result = await provider.resolve('dex_swap', {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      }, CONTEXT);

      const requests = Array.isArray(result) ? result : [result];
      expect(requests.length).toBeGreaterThanOrEqual(1);
    });
  });
});
