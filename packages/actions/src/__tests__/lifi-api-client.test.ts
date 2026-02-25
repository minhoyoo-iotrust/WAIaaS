/**
 * LiFiApiClient unit tests.
 * Uses msw to intercept LI.FI API v1 calls.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { LiFiApiClient } from '../providers/lifi/lifi-api-client.js';
import {
  LIFI_DEFAULTS,
  getLiFiChainId,
} from '../providers/lifi/config.js';
import type { LiFiConfig } from '../providers/lifi/config.js';

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

const QUOTE_RESPONSE = {
  id: 'quote-123',
  type: 'lifi',
  tool: 'stargate',
  toolDetails: { key: 'stargate', name: 'Stargate' },
  action: {
    fromChainId: 1,
    toChainId: 8453,
    fromToken: {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      decimals: 6,
      chainId: 1,
    },
    toToken: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
      decimals: 6,
      chainId: 8453,
    },
    fromAmount: '1000000',
    slippage: 0.03,
    fromAddress: '0x1234567890abcdef1234567890abcdef12345678',
    toAddress: '0x1234567890abcdef1234567890abcdef12345678',
  },
  estimate: {
    fromAmount: '1000000',
    toAmount: '995000',
    toAmountMin: '965000',
    approvalAddress: '0xApproval',
    executionDuration: 120,
    feeCosts: [],
    gasCosts: [],
  },
  transactionRequest: {
    data: '0xabcdef1234567890',
    to: '0xBridgeContract',
    value: '0',
    from: '0x1234567890abcdef1234567890abcdef12345678',
    chainId: 1,
    gasLimit: '300000',
    gasPrice: '30000000000',
  },
  includedSteps: [],
};

const STATUS_DONE_RESPONSE = {
  transactionId: 'tx-done-123',
  sending: {
    txHash: '0xSendingHash',
    txLink: 'https://etherscan.io/tx/0xSendingHash',
    chainId: 1,
    amount: '1000000',
  },
  receiving: {
    txHash: '0xReceivingHash',
    txLink: 'https://basescan.org/tx/0xReceivingHash',
    chainId: 8453,
    amount: '995000',
  },
  lifiExplorerLink: 'https://explorer.li.fi/tx/tx-done-123',
  status: 'DONE' as const,
  tool: 'stargate',
};

const STATUS_PENDING_RESPONSE = {
  transactionId: 'tx-pending-456',
  sending: {
    txHash: '0xPendingSendHash',
    chainId: 1,
  },
  status: 'PENDING' as const,
  substatus: 'WAIT_SOURCE_CONFIRMATIONS',
  substatusMessage: 'Waiting for source chain confirmations',
};

const STATUS_FAILED_RESPONSE = {
  transactionId: 'tx-failed-789',
  sending: {
    txHash: '0xFailedSendHash',
    chainId: 1,
  },
  status: 'FAILED' as const,
  substatus: 'BRIDGE_ERROR',
  substatusMessage: 'Bridge transfer failed due to insufficient liquidity',
};

// ---------------------------------------------------------------------------
// MSW server setup
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get('https://li.quest/v1/quote', () => {
    return HttpResponse.json(QUOTE_RESPONSE);
  }),
  http.get('https://li.quest/v1/status', () => {
    return HttpResponse.json(STATUS_DONE_RESPONSE);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<LiFiConfig> = {}): LiFiConfig {
  return {
    ...LIFI_DEFAULTS,
    enabled: true,
    ...overrides,
  };
}

const DEFAULT_QUOTE_PARAMS = {
  fromChain: 1,
  toChain: 8453,
  fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  fromAmount: '1000000',
  fromAddress: '0x1234567890abcdef1234567890abcdef12345678',
  slippage: 0.03,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LiFiApiClient', () => {
  describe('LIFI-01: getQuote', () => {
    it('calls /quote with correct params and returns Zod-validated response', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://li.quest/v1/quote', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(QUOTE_RESPONSE);
        }),
      );

      const client = new LiFiApiClient(makeConfig());
      const result = await client.getQuote(DEFAULT_QUOTE_PARAMS);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('fromChain')).toBe('1');
      expect(url.searchParams.get('toChain')).toBe('8453');
      expect(url.searchParams.get('fromToken')).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
      expect(url.searchParams.get('toToken')).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
      expect(url.searchParams.get('fromAmount')).toBe('1000000');
      expect(url.searchParams.get('fromAddress')).toBe('0x1234567890abcdef1234567890abcdef12345678');
      expect(url.searchParams.get('slippage')).toBe('0.03');

      expect(result.id).toBe('quote-123');
      expect(result.transactionRequest.data).toBe('0xabcdef1234567890');
      expect(result.transactionRequest.to).toBe('0xBridgeContract');
      expect(result.estimate.toAmount).toBe('995000');
    });

    it('sends x-lifi-api-key header when apiKey is configured', async () => {
      let capturedHeaders: Record<string, string> = {};
      server.use(
        http.get('https://li.quest/v1/quote', ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json(QUOTE_RESPONSE);
        }),
      );

      const client = new LiFiApiClient(makeConfig({ apiKey: 'test-lifi-key' }));
      await client.getQuote(DEFAULT_QUOTE_PARAMS);

      expect(capturedHeaders['x-lifi-api-key']).toBe('test-lifi-key');
    });

    it('throws ACTION_API_ERROR on 4xx response', async () => {
      server.use(
        http.get('https://li.quest/v1/quote', () => {
          return HttpResponse.json({ message: 'Bad Request' }, { status: 400 });
        }),
      );

      const client = new LiFiApiClient(makeConfig());
      await expect(client.getQuote(DEFAULT_QUOTE_PARAMS)).rejects.toThrow('API error 400');
    });

    it('throws ACTION_API_TIMEOUT on timeout', async () => {
      server.use(
        http.get('https://li.quest/v1/quote', async () => {
          await delay(500);
          return HttpResponse.json(QUOTE_RESPONSE);
        }),
      );

      const client = new LiFiApiClient(makeConfig({ requestTimeoutMs: 50 }));
      await expect(client.getQuote(DEFAULT_QUOTE_PARAMS)).rejects.toThrow('timeout');
    });

    it('throws ACTION_RATE_LIMITED on 429 response', async () => {
      server.use(
        http.get('https://li.quest/v1/quote', () => {
          return HttpResponse.text('Rate limit exceeded', { status: 429 });
        }),
      );

      const client = new LiFiApiClient(makeConfig());
      await expect(client.getQuote(DEFAULT_QUOTE_PARAMS)).rejects.toThrow('Rate limited');
    });
  });

  describe('LIFI-02: getStatus', () => {
    it('calls /status with txHash and returns Zod-validated response', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://li.quest/v1/status', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(STATUS_DONE_RESPONSE);
        }),
      );

      const client = new LiFiApiClient(makeConfig());
      const result = await client.getStatus({ txHash: '0xSendingHash' });

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('txHash')).toBe('0xSendingHash');
      expect(result.status).toBe('DONE');
      expect(result.receiving?.txHash).toBe('0xReceivingHash');
    });

    it('returns PENDING status', async () => {
      server.use(
        http.get('https://li.quest/v1/status', () => {
          return HttpResponse.json(STATUS_PENDING_RESPONSE);
        }),
      );

      const client = new LiFiApiClient(makeConfig());
      const result = await client.getStatus({ txHash: '0xPendingSendHash' });

      expect(result.status).toBe('PENDING');
      expect(result.substatus).toBe('WAIT_SOURCE_CONFIRMATIONS');
    });

    it('returns FAILED status', async () => {
      server.use(
        http.get('https://li.quest/v1/status', () => {
          return HttpResponse.json(STATUS_FAILED_RESPONSE);
        }),
      );

      const client = new LiFiApiClient(makeConfig());
      const result = await client.getStatus({ txHash: '0xFailedSendHash' });

      expect(result.status).toBe('FAILED');
      expect(result.substatusMessage).toBe('Bridge transfer failed due to insufficient liquidity');
    });

    it('passes bridge and chain params when provided', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://li.quest/v1/status', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(STATUS_DONE_RESPONSE);
        }),
      );

      const client = new LiFiApiClient(makeConfig());
      await client.getStatus({
        txHash: '0xTestHash',
        bridge: 'stargate',
        fromChain: 1,
        toChain: 8453,
      });

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('txHash')).toBe('0xTestHash');
      expect(url.searchParams.get('bridge')).toBe('stargate');
      expect(url.searchParams.get('fromChain')).toBe('1');
      expect(url.searchParams.get('toChain')).toBe('8453');
    });
  });

  describe('LIFI-09: Config and chain mapping', () => {
    it('getLiFiChainId: returns correct ID for supported chains', () => {
      expect(getLiFiChainId('solana')).toBe(1151111081099710);
      expect(getLiFiChainId('ethereum')).toBe(1);
      expect(getLiFiChainId('base')).toBe(8453);
      expect(getLiFiChainId('arbitrum-mainnet')).toBe(42161);
      expect(getLiFiChainId('polygon')).toBe(137);
      expect(getLiFiChainId('optimism')).toBe(10);
    });

    it('getLiFiChainId: throws for unsupported chain with supported list', () => {
      expect(() => getLiFiChainId('bitcoin')).toThrow('Unsupported chain');
      expect(() => getLiFiChainId('bitcoin')).toThrow('Supported:');
    });

    it('LIFI_DEFAULTS: has correct default values', () => {
      expect(LIFI_DEFAULTS.apiBaseUrl).toBe('https://li.quest/v1');
      expect(LIFI_DEFAULTS.defaultSlippagePct).toBe(0.03);
      expect(LIFI_DEFAULTS.maxSlippagePct).toBe(0.05);
      expect(LIFI_DEFAULTS.requestTimeoutMs).toBe(15_000);
      expect(LIFI_DEFAULTS.enabled).toBe(false);
      expect(LIFI_DEFAULTS.apiKey).toBe('');
    });
  });
});
