/**
 * DCent Auto Router unit tests (2-hop fallback routing).
 * Uses msw to intercept DCent Swap API calls.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { DcentSwapApiClient } from '../providers/dcent-swap/dcent-api-client.js';
import {
  findTwoHopRoutes,
  INTERMEDIATE_TOKENS,
} from '../providers/dcent-swap/auto-router.js';
import { tryGetDcentQuotes } from '../providers/dcent-swap/dex-swap.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://agent-swap.dcentwallet.com';

const ETH_CAIP19 = 'eip155:1/slip44:60';
const USDC_CAIP19 = 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const LINK_CAIP19 = 'eip155:1/erc20:0x514910771af9ca656af840dff83e8264ecf986ca';
const UNI_CAIP19 = 'eip155:1/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';

const SUSHI_SPENDER = '0xAC4c6e212A361c968F1725b4d055b47E63F80b75';

// ---------------------------------------------------------------------------
// Mock response helpers
// ---------------------------------------------------------------------------

function makeSuccessQuote(opts: {
  providerId?: string;
  expectedAmount?: string;
  providerType?: 'swap' | 'cross_swap' | 'exchange';
  depositFee?: string;
}) {
  return {
    id: opts.providerId ?? 'sushi_swap',
    status: 'success',
    providerId: opts.providerId ?? 'sushi_swap',
    providerType: opts.providerType ?? 'swap',
    name: 'Sushi',
    fromAmount: '1000000000000000000',
    quoteType: 'flexible',
    expectedAmount: opts.expectedAmount ?? '2000000000',
    spenderContractAddress: SUSHI_SPENDER,
    providerFee: opts.depositFee ? { depositFee: opts.depositFee } : {},
  };
}

function makeQuotesSuccess(providers: ReturnType<typeof makeSuccessQuote>[]) {
  return {
    status: 'success',
    fromId: 'ETHEREUM',
    toId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    providers: {
      bestOrder: providers.map(p => p.providerId),
      common: providers,
    },
  };
}

function makeNoRoute() {
  return { status: 'fail_no_available_provider' };
}

const CURRENCIES_RESPONSE = [
  { currencyId: 'ETHEREUM', tokenDeviceId: 'ERC20', currencyName: 'Ethereum' },
  { currencyId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', tokenDeviceId: 'ERC20', currencyName: 'USDC' },
  { currencyId: 'ERC20/0xdac17f958d2ee523a2206206994597c13d831ec7', tokenDeviceId: 'ERC20', currencyName: 'USDT' },
  { currencyId: 'ERC20/0x514910771af9ca656af840dff83e8264ecf986ca', tokenDeviceId: 'ERC20', currencyName: 'LINK' },
  { currencyId: 'ERC20/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', tokenDeviceId: 'ERC20', currencyName: 'UNI' },
];

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get(`${BASE_URL}/api/swap/v3/get_supported_currencies`, () => {
    return HttpResponse.json(CURRENCIES_RESPONSE);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createClient(): DcentSwapApiClient {
  return new DcentSwapApiClient({ apiBaseUrl: BASE_URL });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dcent-auto-router', () => {
  describe('tryGetDcentQuotes', () => {
    it('returns result when route exists', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return HttpResponse.json(makeQuotesSuccess([
            makeSuccessQuote({ expectedAmount: '2000000000' }),
          ]));
        }),
      );

      const client = createClient();
      const res = await tryGetDcentQuotes(client, {
        fromAsset: ETH_CAIP19,
        toAsset: USDC_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 6,
      });

      expect('result' in res).toBe(true);
      if ('result' in res) {
        expect(res.result.dexProviders).toHaveLength(1);
      }
    });

    it('returns noRoute when no providers available', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return HttpResponse.json(makeNoRoute());
        }),
      );

      const client = createClient();
      const res = await tryGetDcentQuotes(client, {
        fromAsset: UNI_CAIP19,
        toAsset: LINK_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 18,
      });

      expect('noRoute' in res).toBe(true);
    });
  });

  describe('INTERMEDIATE_TOKENS', () => {
    it('contains per-chain intermediate tokens for Ethereum', () => {
      const ethIntermediates = INTERMEDIATE_TOKENS['eip155:1'];
      expect(ethIntermediates).toBeDefined();
      expect(ethIntermediates!.length).toBeGreaterThanOrEqual(3);
      const symbols = ethIntermediates!.map(t => t.symbol);
      expect(symbols).toContain('ETH');
      expect(symbols).toContain('USDC');
      expect(symbols).toContain('USDT');
    });

    it('contains Solana mainnet intermediate tokens (SOL, USDC, USDT)', () => {
      const solIntermediates = INTERMEDIATE_TOKENS['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'];
      expect(solIntermediates).toBeDefined();
      expect(solIntermediates!.length).toBe(3);

      const symbols = solIntermediates!.map(t => t.symbol);
      expect(symbols).toContain('SOL');
      expect(symbols).toContain('USDC');
      expect(symbols).toContain('USDT');

      // Verify SOL details
      const sol = solIntermediates!.find(t => t.symbol === 'SOL')!;
      expect(sol.caip19).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501');
      expect(sol.decimals).toBe(9);

      // Verify USDC details
      const usdc = solIntermediates!.find(t => t.symbol === 'USDC')!;
      expect(usdc.caip19).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(usdc.decimals).toBe(6);

      // Verify USDT details
      const usdt = solIntermediates!.find(t => t.symbol === 'USDT')!;
      expect(usdt.caip19).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
      expect(usdt.decimals).toBe(6);
    });
  });

  describe('findTwoHopRoutes', () => {
    it('returns empty array when direct route exists (no fallback needed)', async () => {
      // Direct route succeeds — no 2-hop needed
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return HttpResponse.json(makeQuotesSuccess([
            makeSuccessQuote({ expectedAmount: '2000000000' }),
          ]));
        }),
      );

      const client = createClient();
      const result = await findTwoHopRoutes(client, {
        fromAsset: UNI_CAIP19,
        toAsset: LINK_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 18,
      });

      expect(result.routes).toHaveLength(0);
      expect(result.bestRoute).toBeNull();
    });

    it('returns 2-hop routes via intermediate when direct route fails', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;

          // Direct UNI -> LINK: no route
          if (body.fromId === 'ERC20/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' &&
              body.toId === 'ERC20/0x514910771af9ca656af840dff83e8264ecf986ca') {
            return HttpResponse.json(makeNoRoute());
          }

          // Hop 1: UNI -> ETH (intermediate)
          if (body.fromId === 'ERC20/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' &&
              body.toId === 'ETHEREUM') {
            return HttpResponse.json(makeQuotesSuccess([
              makeSuccessQuote({ expectedAmount: '500000000000000000', depositFee: '1000000000000000' }),
            ]));
          }

          // Hop 2: ETH -> LINK
          if (body.fromId === 'ETHEREUM' &&
              body.toId === 'ERC20/0x514910771af9ca656af840dff83e8264ecf986ca') {
            return HttpResponse.json(makeQuotesSuccess([
              makeSuccessQuote({ expectedAmount: '8000000000000000000', depositFee: '500000000000000' }),
            ]));
          }

          // Other intermediates: USDC or USDT hops — return no route for simplicity
          return HttpResponse.json(makeNoRoute());
        }),
      );

      const client = createClient();
      const result = await findTwoHopRoutes(client, {
        fromAsset: UNI_CAIP19,
        toAsset: LINK_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 18,
      });

      expect(result.routes.length).toBeGreaterThanOrEqual(1);
      expect(result.bestRoute).not.toBeNull();

      const route = result.bestRoute!;
      expect(route.intermediateToken.symbol).toBe('ETH');
      expect(route.isMultiHop).toBe(true);
      expect(route.hopCount).toBe(2);
    });

    it('returns routes via multiple intermediates sorted by total output descending', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;

          // Direct: no route
          if (body.fromId === 'ERC20/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' &&
              body.toId === 'ERC20/0x514910771af9ca656af840dff83e8264ecf986ca') {
            return HttpResponse.json(makeNoRoute());
          }

          // Via ETH: hop1 output 500000, hop2 output 7000000000 (lower)
          if (body.toId === 'ETHEREUM' || body.fromId === 'ETHEREUM') {
            if (body.fromId === 'ERC20/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984') {
              return HttpResponse.json(makeQuotesSuccess([
                makeSuccessQuote({ expectedAmount: '500000000000000000', depositFee: '1000000000000' }),
              ]));
            }
            return HttpResponse.json(makeQuotesSuccess([
              makeSuccessQuote({ expectedAmount: '7000000000000000000', depositFee: '500000000000' }),
            ]));
          }

          // Via USDC: hop1 output 2000000, hop2 output 9000000000 (higher)
          if (body.toId === 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' ||
              body.fromId === 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48') {
            if (body.fromId === 'ERC20/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984') {
              return HttpResponse.json(makeQuotesSuccess([
                makeSuccessQuote({ expectedAmount: '2000000', depositFee: '1000' }),
              ]));
            }
            return HttpResponse.json(makeQuotesSuccess([
              makeSuccessQuote({ expectedAmount: '9000000000000000000', depositFee: '500' }),
            ]));
          }

          // Other intermediates (USDT): no route
          return HttpResponse.json(makeNoRoute());
        }),
      );

      const client = createClient();
      const result = await findTwoHopRoutes(client, {
        fromAsset: UNI_CAIP19,
        toAsset: LINK_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 18,
      });

      expect(result.routes.length).toBeGreaterThanOrEqual(2);
      // Best route should have highest finalExpectedAmount
      const amounts = result.routes.map(r => BigInt(r.finalExpectedAmount));
      for (let i = 1; i < amounts.length; i++) {
        expect(amounts[i - 1]!).toBeGreaterThanOrEqual(amounts[i]!);
      }
    });

    it('includes cumulative cost and transparency metadata in each route', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;

          // Direct: no route
          if (body.fromId === 'ERC20/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' &&
              body.toId === 'ERC20/0x514910771af9ca656af840dff83e8264ecf986ca') {
            return HttpResponse.json(makeNoRoute());
          }

          // Via ETH
          if (body.toId === 'ETHEREUM') {
            return HttpResponse.json(makeQuotesSuccess([
              makeSuccessQuote({ expectedAmount: '500000000000000000', depositFee: '10000000000000000' }),
            ]));
          }
          if (body.fromId === 'ETHEREUM') {
            return HttpResponse.json(makeQuotesSuccess([
              makeSuccessQuote({ expectedAmount: '8000000000000000000', depositFee: '5000000000000000' }),
            ]));
          }

          return HttpResponse.json(makeNoRoute());
        }),
      );

      const client = createClient();
      const result = await findTwoHopRoutes(client, {
        fromAsset: UNI_CAIP19,
        toAsset: LINK_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 18,
      });

      expect(result.routes.length).toBeGreaterThanOrEqual(1);
      const route = result.routes[0]!;

      // Transparency metadata (ROUT-05)
      expect(route.isMultiHop).toBe(true);
      expect(route.hopCount).toBe(2);
      expect(route.intermediateToken.caip19).toBe(ETH_CAIP19);
      expect(route.intermediateToken.symbol).toBe('ETH');

      // Cost breakdown
      expect(route.totalFees.hop1Fee).toBe('10000000000000000');
      expect(route.totalFees.hop2Fee).toBe('5000000000000000');
      expect(route.totalFees.totalFee).toBe('15000000000000000');

      // Final expected amount
      expect(route.finalExpectedAmount).toBe('8000000000000000000');

      // Hop details
      expect(route.hop1.fromAsset).toBe(UNI_CAIP19);
      expect(route.hop1.toAsset).toBe(ETH_CAIP19);
      expect(route.hop2.fromAsset).toBe(ETH_CAIP19);
      expect(route.hop2.toAsset).toBe(LINK_CAIP19);
    });

    it('skips intermediates that are same as fromAsset or toAsset', async () => {
      const quoteCallArgs: Array<{ fromId: string; toId: string }> = [];
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          quoteCallArgs.push({ fromId: body.fromId as string, toId: body.toId as string });

          // Direct: no route
          if (body.fromId === 'ETHEREUM' && body.toId === 'ERC20/0x514910771af9ca656af840dff83e8264ecf986ca') {
            return HttpResponse.json(makeNoRoute());
          }

          // All other calls: no route
          return HttpResponse.json(makeNoRoute());
        }),
      );

      const client = createClient();
      // fromAsset = ETH (which is an intermediate), should skip ETH as intermediate
      await findTwoHopRoutes(client, {
        fromAsset: ETH_CAIP19,
        toAsset: LINK_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 18,
      });

      // Should NOT call hop1 with toId = ETHEREUM (same as fromAsset)
      const hop1Calls = quoteCallArgs.filter(c => c.fromId === 'ETHEREUM' && c.toId === 'ETHEREUM');
      expect(hop1Calls).toHaveLength(0);
    });

    it('returns empty array when no intermediate route is available', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
          return HttpResponse.json(makeNoRoute());
        }),
      );

      const client = createClient();
      const result = await findTwoHopRoutes(client, {
        fromAsset: UNI_CAIP19,
        toAsset: LINK_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 18,
      });

      expect(result.routes).toHaveLength(0);
      expect(result.bestRoute).toBeNull();
    });

    it('cost calculation correctly accumulates providerFee for each hop', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;

          // Direct: no route
          if (body.fromId === 'ERC20/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' &&
              body.toId === 'ERC20/0x514910771af9ca656af840dff83e8264ecf986ca') {
            return HttpResponse.json(makeNoRoute());
          }

          // Via ETH with specific fees
          if (body.toId === 'ETHEREUM') {
            return HttpResponse.json(makeQuotesSuccess([
              makeSuccessQuote({ expectedAmount: '500000000000000000', depositFee: '12345678901234' }),
            ]));
          }
          if (body.fromId === 'ETHEREUM') {
            return HttpResponse.json(makeQuotesSuccess([
              makeSuccessQuote({ expectedAmount: '7500000000000000000', depositFee: '98765432109876' }),
            ]));
          }

          return HttpResponse.json(makeNoRoute());
        }),
      );

      const client = createClient();
      const result = await findTwoHopRoutes(client, {
        fromAsset: UNI_CAIP19,
        toAsset: LINK_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 18,
      });

      expect(result.routes.length).toBeGreaterThanOrEqual(1);
      const route = result.routes[0]!;
      expect(route.totalFees.hop1Fee).toBe('12345678901234');
      expect(route.totalFees.hop2Fee).toBe('98765432109876');

      // Total = hop1Fee + hop2Fee
      const expectedTotal = (BigInt('12345678901234') + BigInt('98765432109876')).toString();
      expect(route.totalFees.totalFee).toBe(expectedTotal);
    });

    it('route includes transparency metadata with hop count, intermediate token, and fee breakdown', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;

          if (body.fromId === 'ERC20/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' &&
              body.toId === 'ERC20/0x514910771af9ca656af840dff83e8264ecf986ca') {
            return HttpResponse.json(makeNoRoute());
          }

          // Via USDC (only available intermediate)
          if (body.toId === 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48') {
            return HttpResponse.json(makeQuotesSuccess([
              makeSuccessQuote({ expectedAmount: '3000000', depositFee: '500' }),
            ]));
          }
          if (body.fromId === 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48') {
            return HttpResponse.json(makeQuotesSuccess([
              makeSuccessQuote({ expectedAmount: '12000000000000000000', depositFee: '200' }),
            ]));
          }

          return HttpResponse.json(makeNoRoute());
        }),
      );

      const client = createClient();
      const result = await findTwoHopRoutes(client, {
        fromAsset: UNI_CAIP19,
        toAsset: LINK_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 18,
      });

      const route = result.routes.find(r => r.intermediateToken.symbol === 'USDC');
      expect(route).toBeDefined();
      expect(route!.isMultiHop).toBe(true);
      expect(route!.hopCount).toBe(2);
      expect(route!.intermediateToken.caip19).toBe(USDC_CAIP19);
      expect(route!.intermediateToken.symbol).toBe('USDC');
      expect(route!.intermediateToken.decimals).toBe(6);
      expect(route!.hop1.provider.providerId).toBeDefined();
      expect(route!.hop2.provider.providerId).toBeDefined();
    });
  });
});
