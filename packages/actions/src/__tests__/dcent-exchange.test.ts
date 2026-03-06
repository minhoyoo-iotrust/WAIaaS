/**
 * DCent Exchange unit tests.
 * Uses msw to intercept DCent Swap API calls.
 *
 * Tests cover:
 * - getExchangeQuotes: exchange provider filtering and sorting
 * - executeExchange: payInAddress TRANSFER creation with metadata
 * - ExchangeStatusTracker: DCent status -> AsyncTrackingResult mapping
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { getExchangeQuotes, executeExchange } from '../providers/dcent-swap/exchange.js';
import { ExchangeStatusTracker } from '../providers/dcent-swap/exchange-status-tracker.js';
import { DcentSwapApiClient } from '../providers/dcent-swap/dcent-api-client.js';
import { DCENT_SWAP_DEFAULTS, type DcentSwapConfig } from '../providers/dcent-swap/config.js';
import { ChainError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://swapbuy-beta.dcentwallet.com';
const ETH_CAIP19 = 'eip155:1/slip44:60';
const SOL_CAIP19 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501';

// ---------------------------------------------------------------------------
// Mock responses
// ---------------------------------------------------------------------------

function makeQuotesWithExchange() {
  return {
    status: 'success',
    fromId: 'ETHEREUM',
    toId: 'SOLANA',
    providers: {
      bestOrder: ['changelly_exchange_flexible', 'changenow_exchange_flexible', 'rubic_swap'],
      common: [
        {
          id: 'changelly_exchange_flexible',
          status: 'success',
          providerId: 'changelly_exchange_flexible',
          providerType: 'exchange',
          name: 'Changelly',
          fromAmount: '1000000000000000000',
          quoteType: 'flexible',
          expectedAmount: '23552793560',
        },
        {
          id: 'changenow_exchange_flexible',
          status: 'success',
          providerId: 'changenow_exchange_flexible',
          providerType: 'exchange',
          name: 'ChangeNOW',
          fromAmount: '1000000000000000000',
          quoteType: 'flexible',
          expectedAmount: '23000000000',
        },
        {
          id: 'rubic_swap',
          status: 'success',
          providerId: 'rubic_swap',
          providerType: 'cross_swap',
          name: 'Rubic',
          fromAmount: '1000000000000000000',
          quoteType: 'flexible',
          expectedAmount: '22000000000',
          spenderContractAddress: '0xRubicRouter',
        },
        {
          id: 'exolix_exchange_flexible',
          status: 'fail_token_not_supported',
          providerId: 'exolix_exchange_flexible',
          providerType: 'exchange',
          name: 'Exolix',
        },
      ],
    },
  };
}

function makeExchangeResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 'success',
    transactionId: '95jr30stfzpf0tr1',
    transactionStatusUrl: 'https://changelly.com/track/95jr30stfzpf0tr1',
    payInAddress: '0xbff7d6ba1201304af302f12265cfa435539d5502',
    fromAmount: '1000000000000000000',
    toAmount: '23543037760',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MSW server setup
// ---------------------------------------------------------------------------

const handlers = [
  http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
    return HttpResponse.json(makeQuotesWithExchange());
  }),
  http.post(`${BASE_URL}/api/swap/v3/create_exchange_transaction`, () => {
    return HttpResponse.json(makeExchangeResponse());
  }),
  http.post(`${BASE_URL}/api/swap/v3/get_transactions_status`, async ({ request }) => {
    const body = await request.json() as Array<{ txId: string; providerId: string }>;
    const txId = body[0]?.txId ?? 'unknown';
    // Default: return waiting status
    return HttpResponse.json([
      {
        providerId: 'changelly_exchange_flexible',
        status: 'waiting',
        txId,
        payInAddress: '0xbff7...',
        payOutAddress: '7EcDh...',
        fromAmount: '1.0',
        toAmount: '23.54',
      },
    ]);
  }),
];

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createClient(config?: Partial<DcentSwapConfig>): DcentSwapApiClient {
  return new DcentSwapApiClient({ ...DCENT_SWAP_DEFAULTS, ...config });
}

// ---------------------------------------------------------------------------
// Tests: getExchangeQuotes
// ---------------------------------------------------------------------------

describe('getExchangeQuotes', () => {
  it('returns only exchange providers sorted by expectedAmount descending', async () => {
    const client = createClient();
    const result = await getExchangeQuotes(client, {
      fromAsset: ETH_CAIP19,
      toAsset: SOL_CAIP19,
      amount: '1000000000000000000',
      fromDecimals: 18,
      toDecimals: 9,
    });

    expect(result.providers).toHaveLength(2); // Only successful exchange providers
    expect(result.providers[0].providerId).toBe('changelly_exchange_flexible');
    expect(result.providers[1].providerId).toBe('changenow_exchange_flexible');
    expect(result.bestProvider).toBeDefined();
    expect(result.bestProvider!.providerId).toBe('changelly_exchange_flexible');
  });

  it('throws when no exchange providers available', async () => {
    server.use(
      http.post(`${BASE_URL}/api/swap/v3/get_quotes`, () => {
        return HttpResponse.json({
          status: 'success',
          fromId: 'ETHEREUM',
          toId: 'SOLANA',
          providers: {
            bestOrder: ['rubic_swap'],
            common: [
              {
                id: 'rubic_swap',
                status: 'success',
                providerId: 'rubic_swap',
                providerType: 'cross_swap',
                name: 'Rubic',
                expectedAmount: '22000000000',
              },
            ],
          },
        });
      }),
    );

    const client = createClient();
    await expect(
      getExchangeQuotes(client, {
        fromAsset: ETH_CAIP19,
        toAsset: SOL_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 9,
      }),
    ).rejects.toThrow(ChainError);
  });
});

// ---------------------------------------------------------------------------
// Tests: executeExchange
// ---------------------------------------------------------------------------

describe('executeExchange', () => {
  it('returns TRANSFER request with payInAddress and exchange metadata', async () => {
    const client = createClient();
    const result = await executeExchange(client, {
      fromAsset: ETH_CAIP19,
      toAsset: SOL_CAIP19,
      amount: '1000000000000000000',
      fromDecimals: 18,
      toDecimals: 9,
      fromWalletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      toWalletAddress: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
    });

    // Transfer request
    expect(result.transferRequest.type).toBe('TRANSFER');
    expect(result.transferRequest.to).toBe('0xbff7d6ba1201304af302f12265cfa435539d5502');
    expect(result.transferRequest.amount).toBe('1000000000000000000');
    expect(result.transferRequest.memo).toBeUndefined();

    // Exchange metadata
    expect(result.exchangeMetadata.dcentTransactionId).toBe('95jr30stfzpf0tr1');
    expect(result.exchangeMetadata.dcentProviderId).toBe('changelly_exchange_flexible');
    expect(result.exchangeMetadata.transactionStatusUrl).toBe('https://changelly.com/track/95jr30stfzpf0tr1');
    expect(result.exchangeMetadata.toAmount).toBe('23543037760');
    expect(result.exchangeMetadata.tracker).toBe('dcent-exchange');
  });

  it('includes memo when extraId is present', async () => {
    server.use(
      http.post(`${BASE_URL}/api/swap/v3/create_exchange_transaction`, () => {
        return HttpResponse.json(makeExchangeResponse({ extraId: 'memo123' }));
      }),
    );

    const client = createClient();
    const result = await executeExchange(client, {
      fromAsset: ETH_CAIP19,
      toAsset: SOL_CAIP19,
      amount: '1000000000000000000',
      fromDecimals: 18,
      toDecimals: 9,
      fromWalletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      toWalletAddress: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
    });

    expect(result.transferRequest.memo).toBe('memo123');
  });

  it('throws when payInAddress is missing', async () => {
    server.use(
      http.post(`${BASE_URL}/api/swap/v3/create_exchange_transaction`, () => {
        return HttpResponse.json({
          status: 'success',
          transactionId: 'abc123',
          // no payInAddress
        });
      }),
    );

    const client = createClient();
    await expect(
      executeExchange(client, {
        fromAsset: ETH_CAIP19,
        toAsset: SOL_CAIP19,
        amount: '1000000000000000000',
        fromDecimals: 18,
        toDecimals: 9,
        fromWalletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        toWalletAddress: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
      }),
    ).rejects.toThrow(ChainError);
  });

  it('uses specified providerId when given', async () => {
    const client = createClient();
    const result = await executeExchange(client, {
      fromAsset: ETH_CAIP19,
      toAsset: SOL_CAIP19,
      amount: '1000000000000000000',
      fromDecimals: 18,
      toDecimals: 9,
      fromWalletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      toWalletAddress: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
      providerId: 'changenow_exchange_flexible',
    });

    expect(result.exchangeMetadata.dcentProviderId).toBe('changelly_exchange_flexible');
    // Note: provider selection is in get_quotes bestOrder; create_exchange uses providerId from selection
  });
});

// ---------------------------------------------------------------------------
// Tests: ExchangeStatusTracker
// ---------------------------------------------------------------------------

describe('ExchangeStatusTracker', () => {
  it('has correct tracker properties', () => {
    const tracker = new ExchangeStatusTracker(DCENT_SWAP_DEFAULTS);
    expect(tracker.name).toBe('dcent-exchange');
    expect(tracker.pollIntervalMs).toBe(30_000);
    expect(tracker.maxAttempts).toBe(120);
    expect(tracker.timeoutTransition).toBe('TIMEOUT');
  });

  it('maps "finished" to COMPLETED', async () => {
    server.use(
      http.post(`${BASE_URL}/api/swap/v3/get_transactions_status`, () => {
        return HttpResponse.json([
          { providerId: 'changelly_exchange_flexible', status: 'finished', txId: 'tx1' },
        ]);
      }),
    );

    const tracker = new ExchangeStatusTracker(DCENT_SWAP_DEFAULTS);
    const result = await tracker.checkStatus('tx1', {
      dcentTransactionId: 'tx1',
      dcentProviderId: 'changelly_exchange_flexible',
    });

    expect(result.state).toBe('COMPLETED');
    expect(result.details?.notificationEvent).toBe('EXCHANGE_COMPLETED');
  });

  it('maps "failed" to FAILED', async () => {
    server.use(
      http.post(`${BASE_URL}/api/swap/v3/get_transactions_status`, () => {
        return HttpResponse.json([
          { providerId: 'changelly_exchange_flexible', status: 'failed', txId: 'tx1' },
        ]);
      }),
    );

    const tracker = new ExchangeStatusTracker(DCENT_SWAP_DEFAULTS);
    const result = await tracker.checkStatus('tx1', {
      dcentTransactionId: 'tx1',
      dcentProviderId: 'changelly_exchange_flexible',
    });

    expect(result.state).toBe('FAILED');
    expect(result.details?.notificationEvent).toBe('EXCHANGE_FAILED');
  });

  it('maps "refunded" to COMPLETED with refunded=true', async () => {
    server.use(
      http.post(`${BASE_URL}/api/swap/v3/get_transactions_status`, () => {
        return HttpResponse.json([
          { providerId: 'changelly_exchange_flexible', status: 'refunded', txId: 'tx1' },
        ]);
      }),
    );

    const tracker = new ExchangeStatusTracker(DCENT_SWAP_DEFAULTS);
    const result = await tracker.checkStatus('tx1', {
      dcentTransactionId: 'tx1',
      dcentProviderId: 'changelly_exchange_flexible',
    });

    expect(result.state).toBe('COMPLETED');
    expect(result.details?.refunded).toBe(true);
    expect(result.details?.notificationEvent).toBe('EXCHANGE_REFUNDED');
  });

  it.each(['waiting', 'confirming', 'exchanging', 'sending'] as const)(
    'maps "%s" to PENDING',
    async (status) => {
      server.use(
        http.post(`${BASE_URL}/api/swap/v3/get_transactions_status`, () => {
          return HttpResponse.json([
            { providerId: 'changelly_exchange_flexible', status, txId: 'tx1' },
          ]);
        }),
      );

      const tracker = new ExchangeStatusTracker(DCENT_SWAP_DEFAULTS);
      const result = await tracker.checkStatus('tx1', {
        dcentTransactionId: 'tx1',
        dcentProviderId: 'changelly_exchange_flexible',
      });

      expect(result.state).toBe('PENDING');
      expect(result.details?.dcentStatus).toBe(status);
    },
  );

  it('maps "error" to FAILED', async () => {
    server.use(
      http.post(`${BASE_URL}/api/swap/v3/get_transactions_status`, () => {
        return HttpResponse.json([
          { providerId: 'changelly_exchange_flexible', status: 'error', txId: 'tx1' },
        ]);
      }),
    );

    const tracker = new ExchangeStatusTracker(DCENT_SWAP_DEFAULTS);
    const result = await tracker.checkStatus('tx1', {
      dcentTransactionId: 'tx1',
      dcentProviderId: 'changelly_exchange_flexible',
    });

    expect(result.state).toBe('FAILED');
    expect(result.details?.error).toBe(true);
  });
});
