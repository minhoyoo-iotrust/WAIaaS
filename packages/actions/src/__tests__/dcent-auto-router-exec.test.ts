/**
 * DCent Auto Router execution tests (2-hop BATCH + partial failure).
 * Uses msw to intercept DCent Swap API calls.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { DcentSwapApiClient } from '../providers/dcent-swap/dcent-api-client.js';
import { DCENT_SWAP_DEFAULTS, type DcentSwapConfig } from '../providers/dcent-swap/config.js';
import { executeTwoHopSwap, type TwoHopRoute } from '../providers/dcent-swap/auto-router.js';
import { ChainError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://swapbuy-beta.dcentwallet.com';

const ETH_CAIP19 = 'eip155:1/slip44:60';
const USDC_CAIP19 = 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const UNI_CAIP19 = 'eip155:1/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
const LINK_CAIP19 = 'eip155:1/erc20:0x514910771af9ca656af840dff83e8264ecf986ca';

const SUSHI_SPENDER = '0xAC4c6e212A361c968F1725b4d055b47E63F80b75';
const WALLET_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeSuccessQuote(opts: {
  providerId?: string;
  expectedAmount?: string;
  depositFee?: string;
}) {
  return {
    id: opts.providerId ?? 'sushi_swap',
    status: 'success',
    providerId: opts.providerId ?? 'sushi_swap',
    providerType: 'swap' as const,
    name: 'Sushi',
    fromAmount: '1000000000000000000',
    quoteType: 'flexible' as const,
    expectedAmount: opts.expectedAmount ?? '2000000000',
    spenderContractAddress: SUSHI_SPENDER,
    providerFee: opts.depositFee ? { depositFee: opts.depositFee } : {},
  };
}

function makeTxDataResponse(to?: string, data?: string, value?: string) {
  return {
    status: 'success',
    txdata: {
      from: WALLET_ADDRESS,
      to: to ?? SUSHI_SPENDER,
      data: data ?? '0xswapdata_hop',
      value: value ?? '0',
    },
    networkFee: { gas: '200000', gasPrice: '100000000' },
  };
}

const CURRENCIES_RESPONSE = [
  { currencyId: 'ETHEREUM', tokenDeviceId: 'ERC20', currencyName: 'Ethereum' },
  { currencyId: 'ERC20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', tokenDeviceId: 'ERC20', currencyName: 'USDC' },
  { currencyId: 'ERC20/0xdac17f958d2ee523a2206206994597c13d831ec7', tokenDeviceId: 'ERC20', currencyName: 'USDT' },
  { currencyId: 'ERC20/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', tokenDeviceId: 'ERC20', currencyName: 'UNI' },
  { currencyId: 'ERC20/0x514910771af9ca656af840dff83e8264ecf986ca', tokenDeviceId: 'ERC20', currencyName: 'LINK' },
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

const DEFAULT_CONFIG: DcentSwapConfig = { ...DCENT_SWAP_DEFAULTS, apiBaseUrl: BASE_URL };

function makeRoute(opts: {
  intermediate: { caip19: string; symbol: string; decimals: number };
  hop1ExpectedAmount: string;
  hop2ExpectedAmount: string;
  hop1Fee?: string;
  hop2Fee?: string;
}): TwoHopRoute {
  return {
    intermediateToken: opts.intermediate,
    hop1: {
      provider: makeSuccessQuote({ expectedAmount: opts.hop1ExpectedAmount, depositFee: opts.hop1Fee ?? '0' }),
      fromAsset: UNI_CAIP19,
      toAsset: opts.intermediate.caip19,
    },
    hop2: {
      provider: makeSuccessQuote({ expectedAmount: opts.hop2ExpectedAmount, depositFee: opts.hop2Fee ?? '0' }),
      fromAsset: opts.intermediate.caip19,
      toAsset: LINK_CAIP19,
    },
    finalExpectedAmount: opts.hop2ExpectedAmount,
    totalFees: {
      hop1Fee: opts.hop1Fee ?? '0',
      hop2Fee: opts.hop2Fee ?? '0',
      totalFee: (BigInt(opts.hop1Fee ?? '0') + BigInt(opts.hop2Fee ?? '0')).toString(),
    },
    isMultiHop: true,
    hopCount: 2,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dcent-auto-router-exec', () => {
  describe('executeTwoHopSwap', () => {
    it('returns flat ContractCallRequest[] combining hop1 and hop2 requests', async () => {
      // UNI (ERC-20) -> ETH (native) -> LINK (ERC-20)
      // Hop 1: UNI -> ETH => [approve, swap] (ERC-20 sell)
      // Hop 2: ETH -> LINK => [swap] (native sell)
      let txCallCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          return HttpResponse.json({
            status: 'success',
            fromId: body.fromId,
            toId: body.toId,
            providers: {
              bestOrder: ['sushi_swap'],
              common: [makeSuccessQuote({ expectedAmount: '500000000000000000' })],
            },
          });
        }),
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          txCallCount++;
          return HttpResponse.json(makeTxDataResponse(
            SUSHI_SPENDER,
            `0xswapdata_hop${txCallCount}`,
            txCallCount === 1 ? '0' : '500000000000000000',
          ));
        }),
      );

      const route = makeRoute({
        intermediate: { caip19: ETH_CAIP19, symbol: 'ETH', decimals: 18 },
        hop1ExpectedAmount: '500000000000000000',
        hop2ExpectedAmount: '8000000000000000000',
        hop1Fee: '1000000',
        hop2Fee: '500000',
      });

      const client = createClient();
      const result = await executeTwoHopSwap(
        client,
        {
          fromAsset: UNI_CAIP19,
          toAsset: LINK_CAIP19,
          amount: '1000000000000000000',
          fromDecimals: 18,
          toDecimals: 18,
          walletAddress: WALLET_ADDRESS,
        },
        DEFAULT_CONFIG,
        route,
      );

      // UNI is ERC-20 sell: [approve, swap] + ETH is native sell: [swap]
      // Total: 3 requests
      expect(result.requests.length).toBeGreaterThanOrEqual(2);
      // All should be CONTRACT_CALL
      for (const req of result.requests) {
        expect(req.type).toBe('CONTRACT_CALL');
      }
    });

    it('returns [swap1, approve2, swap2] for native->token->token route', async () => {
      // ETH (native) -> USDC (token) -> LINK (token)
      // Hop 1: ETH -> USDC => [swap] (native sell, no approve)
      // Hop 2: USDC -> LINK => [approve, swap] (ERC-20 sell)
      let txCallCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          return HttpResponse.json({
            status: 'success',
            fromId: body.fromId,
            toId: body.toId,
            providers: {
              bestOrder: ['sushi_swap'],
              common: [makeSuccessQuote({ expectedAmount: '2000000' })],
            },
          });
        }),
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          txCallCount++;
          return HttpResponse.json(makeTxDataResponse(
            SUSHI_SPENDER,
            `0xswapdata_hop${txCallCount}`,
            txCallCount === 1 ? '1000000000000000000' : '0',
          ));
        }),
      );

      const route = makeRoute({
        intermediate: { caip19: USDC_CAIP19, symbol: 'USDC', decimals: 6 },
        hop1ExpectedAmount: '2000000',
        hop2ExpectedAmount: '5000000000000000000',
      });

      const client = createClient();
      const result = await executeTwoHopSwap(
        client,
        {
          fromAsset: ETH_CAIP19,
          toAsset: LINK_CAIP19,
          amount: '1000000000000000000',
          fromDecimals: 18,
          toDecimals: 18,
          walletAddress: WALLET_ADDRESS,
        },
        DEFAULT_CONFIG,
        route,
      );

      // ETH native sell: [swap] + USDC ERC-20 sell: [approve, swap]
      // Total: 3 requests
      expect(result.requests).toHaveLength(3);
      // First request: swap (native sell, no approve)
      expect(result.requests[0]!.calldata).toBe('0xswapdata_hop1');
      // Second request: approve (ERC-20 approve for hop 2)
      expect(result.requests[1]!.calldata).toMatch(/^0x095ea7b3/);
      // Third request: swap hop 2
      expect(result.requests[2]!.calldata).toBe('0xswapdata_hop2');
    });

    it('returns [approve1, swap1, swap2] for token->native->token route (native hop2 has no approve)', async () => {
      // UNI (token) -> ETH (native intermediate) -> LINK (token)
      // But wait: hop2 sells ETH (native) to buy LINK -> no approve needed for hop2
      let txCallCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          return HttpResponse.json({
            status: 'success',
            fromId: body.fromId,
            toId: body.toId,
            providers: {
              bestOrder: ['sushi_swap'],
              common: [makeSuccessQuote({ expectedAmount: '500000000000000000' })],
            },
          });
        }),
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          txCallCount++;
          return HttpResponse.json(makeTxDataResponse(
            SUSHI_SPENDER,
            `0xswapdata_hop${txCallCount}`,
            txCallCount === 2 ? '500000000000000000' : '0',
          ));
        }),
      );

      const route = makeRoute({
        intermediate: { caip19: ETH_CAIP19, symbol: 'ETH', decimals: 18 },
        hop1ExpectedAmount: '500000000000000000',
        hop2ExpectedAmount: '8000000000000000000',
      });

      const client = createClient();
      const result = await executeTwoHopSwap(
        client,
        {
          fromAsset: UNI_CAIP19,
          toAsset: LINK_CAIP19,
          amount: '1000000000000000000',
          fromDecimals: 18,
          toDecimals: 18,
          walletAddress: WALLET_ADDRESS,
        },
        DEFAULT_CONFIG,
        route,
      );

      // UNI ERC-20 sell: [approve, swap] + ETH native sell: [swap]
      // Total: 3 requests
      expect(result.requests).toHaveLength(3);
      // First: approve (ERC-20 for hop 1)
      expect(result.requests[0]!.calldata).toMatch(/^0x095ea7b3/);
      // Second: swap hop 1
      expect(result.requests[1]!.calldata).toBe('0xswapdata_hop1');
      // Third: swap hop 2 (native sell, no approve)
      expect(result.requests[2]!.calldata).toBe('0xswapdata_hop2');
    });

    it('result metadata includes isMultiHop, intermediateToken info, fee breakdown', async () => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          return HttpResponse.json({
            status: 'success',
            fromId: body.fromId,
            toId: body.toId,
            providers: {
              bestOrder: ['sushi_swap'],
              common: [makeSuccessQuote({ expectedAmount: '500000000000000000' })],
            },
          });
        }),
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          return HttpResponse.json(makeTxDataResponse());
        }),
      );

      const route = makeRoute({
        intermediate: { caip19: ETH_CAIP19, symbol: 'ETH', decimals: 18 },
        hop1ExpectedAmount: '500000000000000000',
        hop2ExpectedAmount: '8000000000000000000',
        hop1Fee: '1000000',
        hop2Fee: '500000',
      });

      const client = createClient();
      const result = await executeTwoHopSwap(
        client,
        {
          fromAsset: UNI_CAIP19,
          toAsset: LINK_CAIP19,
          amount: '1000000000000000000',
          fromDecimals: 18,
          toDecimals: 18,
          walletAddress: WALLET_ADDRESS,
        },
        DEFAULT_CONFIG,
        route,
      );

      expect(result.metadata.isMultiHop).toBe(true);
      expect(result.metadata.hopCount).toBe(2);
      expect(result.metadata.intermediateToken.caip19).toBe(ETH_CAIP19);
      expect(result.metadata.intermediateToken.symbol).toBe('ETH');
      expect(result.metadata.intermediateToken.decimals).toBe(18);
      expect(result.metadata.hop1ExpectedAmount).toBe('500000000000000000');
      expect(result.metadata.finalExpectedAmount).toBe('8000000000000000000');
      expect(result.metadata.totalFees.hop1Fee).toBe('1000000');
      expect(result.metadata.totalFees.hop2Fee).toBe('500000');
      expect(result.metadata.totalFees.totalFee).toBe('1500000');
    });

    it('throws PARTIAL_SWAP_FAILURE with intermediate token info when hop2 fails', async () => {
      let txCallCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          // Hop 1 quotes succeed
          if (body.fromId === 'ERC20/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984') {
            return HttpResponse.json({
              status: 'success',
              fromId: body.fromId,
              toId: body.toId,
              providers: {
                bestOrder: ['sushi_swap'],
                common: [makeSuccessQuote({ expectedAmount: '500000000000000000' })],
              },
            });
          }
          // Hop 2 quotes succeed too (txdata will fail)
          return HttpResponse.json({
            status: 'success',
            fromId: body.fromId,
            toId: body.toId,
            providers: {
              bestOrder: ['sushi_swap'],
              common: [makeSuccessQuote({ expectedAmount: '8000000000000000000' })],
            },
          });
        }),
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          txCallCount++;
          if (txCallCount === 1) {
            // Hop 1 txdata succeeds
            return HttpResponse.json(makeTxDataResponse());
          }
          // Hop 2 txdata fails
          return HttpResponse.json({ status: 'fail', error: 'Internal error' }, { status: 500 });
        }),
      );

      const route = makeRoute({
        intermediate: { caip19: ETH_CAIP19, symbol: 'ETH', decimals: 18 },
        hop1ExpectedAmount: '500000000000000000',
        hop2ExpectedAmount: '8000000000000000000',
      });

      const client = createClient();
      try {
        await executeTwoHopSwap(
          client,
          {
            fromAsset: UNI_CAIP19,
            toAsset: LINK_CAIP19,
            amount: '1000000000000000000',
            fromDecimals: 18,
            toDecimals: 18,
            walletAddress: WALLET_ADDRESS,
          },
          DEFAULT_CONFIG,
          route,
        );
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ChainError);
        const error = err as ChainError;
        expect(error.message).toContain('2-hop swap partially completed');
        expect(error.message).toContain('Hop 1 succeeded but Hop 2 failed');
      }
    });

    it('partial failure message includes intermediate token CAIP-19, symbol, and hop1 expected amount', async () => {
      let txCallCount = 0;
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_quotes`, async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          return HttpResponse.json({
            status: 'success',
            fromId: body.fromId,
            toId: body.toId,
            providers: {
              bestOrder: ['sushi_swap'],
              common: [makeSuccessQuote({ expectedAmount: '500000000000000000' })],
            },
          });
        }),
        http.post(`${BASE_URL}/api/swap/v3/get_dex_swap_transaction_data`, () => {
          txCallCount++;
          if (txCallCount === 1) {
            return HttpResponse.json(makeTxDataResponse());
          }
          // Hop 2 fails
          return HttpResponse.json({ status: 'fail' }, { status: 500 });
        }),
      );

      const route = makeRoute({
        intermediate: { caip19: USDC_CAIP19, symbol: 'USDC', decimals: 6 },
        hop1ExpectedAmount: '2000000',
        hop2ExpectedAmount: '5000000000000000000',
      });

      const client = createClient();
      try {
        await executeTwoHopSwap(
          client,
          {
            fromAsset: UNI_CAIP19,
            toAsset: LINK_CAIP19,
            amount: '1000000000000000000',
            fromDecimals: 18,
            toDecimals: 18,
            walletAddress: WALLET_ADDRESS,
          },
          DEFAULT_CONFIG,
          route,
        );
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ChainError);
        const error = err as ChainError;
        expect(error.message).toContain('USDC');
        expect(error.message).toContain(USDC_CAIP19);
        expect(error.message).toContain('2000000');
        expect(error.message).toContain('swap the intermediate token manually');
      }
    });
  });
});
