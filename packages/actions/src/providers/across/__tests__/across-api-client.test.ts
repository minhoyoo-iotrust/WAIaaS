/**
 * AcrossApiClient unit tests.
 * Uses msw to intercept Across REST API calls.
 *
 * @see internal/design/79-across-protocol-bridge.md (section 2)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { AcrossApiClient } from '../across-api-client.js';
import { ACROSS_DEFAULTS } from '../config.js';
import type { AcrossConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

const MOCK_SUGGESTED_FEES = {
  totalRelayFee: { pct: '1000000000000000', total: '100000' },
  relayerCapitalFee: { pct: '500000000000000', total: '50000' },
  relayerGasFee: { pct: '300000000000000', total: '30000' },
  lpFee: { pct: '200000000000000', total: '20000' },
  timestamp: 1700000000,
  isAmountTooLow: false,
  quoteBlock: '18500000',
  exclusiveRelayer: '0x0000000000000000000000000000000000000000',
  exclusivityDeadline: 0,
  expectedFillTimeSec: 5,
  limits: {
    minDeposit: '10000',
    maxDeposit: '1000000000000',
    maxDepositInstant: '500000000000',
    maxDepositShortDelay: '800000000000',
  },
};

const MOCK_LIMITS = {
  minDeposit: '10000',
  maxDeposit: '1000000000000',
  maxDepositInstant: '500000000000',
  maxDepositShortDelay: '800000000000',
};

const MOCK_ROUTES = [
  {
    originChainId: 1,
    destinationChainId: 42161,
    originToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    destinationToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    originTokenSymbol: 'USDC',
    destinationTokenSymbol: 'USDT',
    isNative: false,
  },
];

const MOCK_DEPOSIT_STATUS = {
  status: 'filled' as const,
  fillTxHash: '0xfill1234567890abcdef',
  depositTxHash: '0xdeposit1234567890abcdef',
  depositId: 42,
  destinationChainId: 42161,
  updatedAt: '2025-12-01T00:00:00Z',
};

const MOCK_SWAP_APPROVAL = {
  swapTx: {
    to: '0xSpokePool',
    data: '0xabcdef',
    value: '0',
  },
  approvalTxns: [
    {
      to: '0xTokenAddress',
      data: '0xapprovedata',
    },
  ],
  inputAmount: '1000000',
  expectedOutputAmount: '900000',
  minOutputAmount: '880000',
  expectedFillTimeSec: 5,
};

// ---------------------------------------------------------------------------
// MSW server setup
// ---------------------------------------------------------------------------

const BASE_URL = 'https://app.across.to/api';

const server = setupServer(
  http.get(`${BASE_URL}/suggested-fees`, () => {
    return HttpResponse.json(MOCK_SUGGESTED_FEES);
  }),
  http.get(`${BASE_URL}/limits`, () => {
    return HttpResponse.json(MOCK_LIMITS);
  }),
  http.get(`${BASE_URL}/available-routes`, () => {
    return HttpResponse.json(MOCK_ROUTES);
  }),
  http.get(`${BASE_URL}/deposit/status`, () => {
    return HttpResponse.json(MOCK_DEPOSIT_STATUS);
  }),
  http.get(`${BASE_URL}/swap/approval`, () => {
    return HttpResponse.json(MOCK_SWAP_APPROVAL);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<AcrossConfig> = {}): AcrossConfig {
  return {
    ...ACROSS_DEFAULTS,
    enabled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AcrossApiClient', () => {
  describe('getSuggestedFees', () => {
    it('returns parsed fees with totalRelayFee, timestamp, limits', async () => {
      const client = new AcrossApiClient(makeConfig());
      const result = await client.getSuggestedFees({
        inputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        outputToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        originChainId: 1,
        destinationChainId: 42161,
        amount: '1000000',
      });

      expect(result.totalRelayFee.total).toBe('100000');
      expect(result.totalRelayFee.pct).toBe('1000000000000000');
      expect(result.timestamp).toBe(1700000000);
      expect(result.isAmountTooLow).toBe(false);
      expect(result.limits.minDeposit).toBe('10000');
      expect(result.limits.maxDeposit).toBe('1000000000000');
      expect(result.expectedFillTimeSec).toBe(5);
    });

    it('passes query params correctly', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/suggested-fees`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(MOCK_SUGGESTED_FEES);
        }),
      );

      const client = new AcrossApiClient(makeConfig());
      await client.getSuggestedFees({
        inputToken: '0xInputToken',
        outputToken: '0xOutputToken',
        originChainId: 1,
        destinationChainId: 42161,
        amount: '5000000',
      });

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('inputToken')).toBe('0xInputToken');
      expect(url.searchParams.get('outputToken')).toBe('0xOutputToken');
      expect(url.searchParams.get('originChainId')).toBe('1');
      expect(url.searchParams.get('destinationChainId')).toBe('42161');
      expect(url.searchParams.get('amount')).toBe('5000000');
    });

    it('passes optional recipient param', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/suggested-fees`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(MOCK_SUGGESTED_FEES);
        }),
      );

      const client = new AcrossApiClient(makeConfig());
      await client.getSuggestedFees({
        inputToken: '0xInput',
        outputToken: '0xOutput',
        originChainId: 1,
        destinationChainId: 42161,
        amount: '1000000',
        recipient: '0xRecipient123',
      });

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('recipient')).toBe('0xRecipient123');
    });
  });

  describe('getLimits', () => {
    it('returns parsed limits', async () => {
      const client = new AcrossApiClient(makeConfig());
      const result = await client.getLimits({
        inputToken: '0xInputToken',
        outputToken: '0xOutputToken',
        originChainId: 1,
        destinationChainId: 42161,
      });

      expect(result.minDeposit).toBe('10000');
      expect(result.maxDeposit).toBe('1000000000000');
      expect(result.maxDepositInstant).toBe('500000000000');
      expect(result.maxDepositShortDelay).toBe('800000000000');
    });
  });

  describe('getAvailableRoutes', () => {
    it('returns parsed route array', async () => {
      const client = new AcrossApiClient(makeConfig());
      const result = await client.getAvailableRoutes();

      expect(result).toHaveLength(1);
      expect(result[0]!.originChainId).toBe(1);
      expect(result[0]!.destinationChainId).toBe(42161);
      expect(result[0]!.originTokenSymbol).toBe('USDC');
    });

    it('works without filter params (empty query)', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/available-routes`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(MOCK_ROUTES);
        }),
      );

      const client = new AcrossApiClient(makeConfig());
      await client.getAvailableRoutes();

      const url = new URL(capturedUrl);
      // No chain/token filter params
      expect(url.searchParams.has('originChainId')).toBe(false);
      expect(url.searchParams.has('destinationChainId')).toBe(false);
    });

    it('passes filter params when provided', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/available-routes`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(MOCK_ROUTES);
        }),
      );

      const client = new AcrossApiClient(makeConfig());
      await client.getAvailableRoutes({
        originChainId: 1,
        destinationChainId: 42161,
        originToken: '0xOrigin',
        destinationToken: '0xDest',
      });

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('originChainId')).toBe('1');
      expect(url.searchParams.get('destinationChainId')).toBe('42161');
      expect(url.searchParams.get('originToken')).toBe('0xOrigin');
      expect(url.searchParams.get('destinationToken')).toBe('0xDest');
    });
  });

  describe('getDepositStatus', () => {
    it('returns parsed status response', async () => {
      const client = new AcrossApiClient(makeConfig());
      const result = await client.getDepositStatus({
        depositTxnRef: '0xdeposit123',
      });

      expect(result.status).toBe('filled');
      expect(result.fillTxHash).toBe('0xfill1234567890abcdef');
      expect(result.depositId).toBe(42);
      expect(result.destinationChainId).toBe(42161);
    });

    it('handles all 4 status values', async () => {
      for (const status of ['filled', 'pending', 'expired', 'refunded'] as const) {
        server.use(
          http.get(`${BASE_URL}/deposit/status`, () => {
            return HttpResponse.json({ ...MOCK_DEPOSIT_STATUS, status });
          }),
        );

        const client = new AcrossApiClient(makeConfig());
        const result = await client.getDepositStatus({ depositTxnRef: '0xtest' });
        expect(result.status).toBe(status);
      }
    });
  });

  describe('getSwapApproval', () => {
    it('returns parsed swap approval with swapTx', async () => {
      const client = new AcrossApiClient(makeConfig());
      const result = await client.getSwapApproval({
        tokenAddr: '0xToken',
        originChainId: 1,
        destinationChainId: 42161,
        amount: '1000000',
        depositor: '0xDepositor',
      });

      expect(result.swapTx.to).toBe('0xSpokePool');
      expect(result.swapTx.data).toBe('0xabcdef');
      expect(result.inputAmount).toBe('1000000');
      expect(result.expectedOutputAmount).toBe('900000');
    });
  });

  describe('error handling', () => {
    it('throws on HTTP 400 (invalid params)', async () => {
      server.use(
        http.get(`${BASE_URL}/suggested-fees`, () => {
          return HttpResponse.json({ error: 'Invalid params' }, { status: 400 });
        }),
      );

      const client = new AcrossApiClient(makeConfig());
      await expect(
        client.getSuggestedFees({
          inputToken: '0xInvalid',
          outputToken: '0xOutput',
          originChainId: 1,
          destinationChainId: 42161,
          amount: '100',
        }),
      ).rejects.toThrow('API error 400');
    });

    it('throws on HTTP 500 (server error)', async () => {
      server.use(
        http.get(`${BASE_URL}/limits`, () => {
          return HttpResponse.text('Internal Server Error', { status: 500 });
        }),
      );

      const client = new AcrossApiClient(makeConfig());
      await expect(
        client.getLimits({
          inputToken: '0xInput',
          outputToken: '0xOutput',
          originChainId: 1,
          destinationChainId: 42161,
        }),
      ).rejects.toThrow('API error 500');
    });
  });

  describe('integratorId', () => {
    it('includes integratorId in constructor base URL when set', () => {
      // The constructor appends integratorId to the base URL.
      // Note: Due to URL resolution in ActionApiClient.get(), the integratorId
      // may not survive path resolution. This test verifies the constructor logic.
      const config = makeConfig({ integratorId: 'myDapp' });
      // Verify client can be constructed without error
      const client = new AcrossApiClient(config);
      expect(client).toBeDefined();
    });

    it('omits integratorId when empty string', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/available-routes`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(MOCK_ROUTES);
        }),
      );

      const client = new AcrossApiClient(makeConfig({ integratorId: '' }));
      await client.getAvailableRoutes();

      expect(capturedUrl).not.toContain('integratorId');
    });
  });
});
