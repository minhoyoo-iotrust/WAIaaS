/**
 * BridgeStatusTracker & BridgeMonitoringTracker unit tests.
 * Uses msw to intercept LI.FI /status API calls.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { BridgeStatusTracker, BridgeMonitoringTracker } from '../providers/lifi/bridge-status-tracker.js';
import type { LiFiConfig } from '../providers/lifi/config.js';

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

const STATUS_DONE = {
  status: 'DONE',
  receiving: { txHash: '0xdest123', chainId: 137 },
  lifiExplorerLink: 'https://explorer.li.fi/tx/0xabc',
  tool: 'stargate',
};

const STATUS_PENDING = {
  status: 'PENDING',
  substatus: 'BRIDGE_NOT_AVAILABLE',
  substatusMessage: 'Bridge transfer in progress',
};

const STATUS_FAILED = {
  status: 'FAILED',
  substatus: 'UNKNOWN_ERROR',
  substatusMessage: 'Bridge transfer failed due to unknown error',
  lifiExplorerLink: 'https://explorer.li.fi/tx/0xfail',
};

const STATUS_REFUNDED = {
  status: 'FAILED',
  substatus: 'REFUNDED',
  substatusMessage: 'Tokens have been refunded to the sender',
  lifiExplorerLink: 'https://explorer.li.fi/tx/0xrefund',
};

const STATUS_NOT_FOUND = {
  status: 'NOT_FOUND',
};

const STATUS_INVALID = {
  status: 'INVALID',
};

// ---------------------------------------------------------------------------
// msw server setup
// ---------------------------------------------------------------------------

const BASE_URL = 'https://li.quest/v1';

const handlers = [
  http.get(`${BASE_URL}/status`, ({ request }) => {
    const url = new URL(request.url);
    const txHash = url.searchParams.get('txHash');

    switch (txHash) {
      case '0xDONE':
        return HttpResponse.json(STATUS_DONE);
      case '0xPENDING':
        return HttpResponse.json(STATUS_PENDING);
      case '0xFAILED':
        return HttpResponse.json(STATUS_FAILED);
      case '0xREFUNDED':
        return HttpResponse.json(STATUS_REFUNDED);
      case '0xNOTFOUND':
        return HttpResponse.json(STATUS_NOT_FOUND);
      case '0xINVALID':
        return HttpResponse.json(STATUS_INVALID);
      default:
        return HttpResponse.json(STATUS_PENDING);
    }
  }),
];

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const config: LiFiConfig = {
  enabled: true,
  apiBaseUrl: BASE_URL,
  apiKey: '',
  defaultSlippagePct: 0.03,
  maxSlippagePct: 0.05,
  requestTimeoutMs: 5_000,
};

// ---------------------------------------------------------------------------
// BridgeStatusTracker tests
// ---------------------------------------------------------------------------

describe('BridgeStatusTracker', () => {
  it('should have correct configuration', () => {
    const tracker = new BridgeStatusTracker(config);
    expect(tracker.name).toBe('bridge');
    expect(tracker.maxAttempts).toBe(240);
    expect(tracker.pollIntervalMs).toBe(30_000);
    expect(tracker.timeoutTransition).toBe('BRIDGE_MONITORING');
  });

  it('should return COMPLETED for DONE status', async () => {
    const tracker = new BridgeStatusTracker(config);
    const result = await tracker.checkStatus('tx-1', { txHash: '0xDONE' });
    expect(result.state).toBe('COMPLETED');
    expect(result.details).toEqual({
      destTxHash: '0xdest123',
      destChainId: 137,
      lifiExplorerLink: 'https://explorer.li.fi/tx/0xabc',
      tool: 'stargate',
    });
  });

  it('should return PENDING for PENDING status with substatus', async () => {
    const tracker = new BridgeStatusTracker(config);
    const result = await tracker.checkStatus('tx-2', { txHash: '0xPENDING' });
    expect(result.state).toBe('PENDING');
    expect(result.details).toEqual({
      substatus: 'BRIDGE_NOT_AVAILABLE',
      substatusMessage: 'Bridge transfer in progress',
    });
  });

  it('should return FAILED for FAILED status', async () => {
    const tracker = new BridgeStatusTracker(config);
    const result = await tracker.checkStatus('tx-3', { txHash: '0xFAILED' });
    expect(result.state).toBe('FAILED');
    expect(result.details).toEqual({
      substatusMessage: 'Bridge transfer failed due to unknown error',
      substatus: 'UNKNOWN_ERROR',
      lifiExplorerLink: 'https://explorer.li.fi/tx/0xfail',
    });
  });

  it('should return COMPLETED (refunded) for FAILED + REFUNDED substatus', async () => {
    const tracker = new BridgeStatusTracker(config);
    const result = await tracker.checkStatus('tx-4', { txHash: '0xREFUNDED' });
    expect(result.state).toBe('COMPLETED');
    expect(result.details).toEqual({
      refunded: true,
      substatusMessage: 'Tokens have been refunded to the sender',
      lifiExplorerLink: 'https://explorer.li.fi/tx/0xrefund',
    });
  });

  it('should return PENDING for NOT_FOUND status', async () => {
    const tracker = new BridgeStatusTracker(config);
    const result = await tracker.checkStatus('tx-5', { txHash: '0xNOTFOUND' });
    expect(result.state).toBe('PENDING');
    expect(result.details).toBeUndefined();
  });

  it('should return PENDING for INVALID status', async () => {
    const tracker = new BridgeStatusTracker(config);
    const result = await tracker.checkStatus('tx-6', { txHash: '0xINVALID' });
    expect(result.state).toBe('PENDING');
    expect(result.details).toBeUndefined();
  });

  it('should return PENDING with error when no txHash in metadata', async () => {
    const tracker = new BridgeStatusTracker(config);
    const result = await tracker.checkStatus('tx-7', {});
    expect(result.state).toBe('PENDING');
    expect(result.details).toEqual({ error: 'No txHash in metadata' });
  });

  it('should pass bridge and chain params to API', async () => {
    let capturedUrl: URL | null = null;
    server.use(
      http.get(`${BASE_URL}/status`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json(STATUS_PENDING);
      }),
    );

    const tracker = new BridgeStatusTracker(config);
    await tracker.checkStatus('tx-8', {
      txHash: '0xTEST',
      bridge: 'stargate',
      fromChainId: 1,
      toChainId: 137,
    });

    expect(capturedUrl).not.toBeNull();
    expect(capturedUrl!.searchParams.get('txHash')).toBe('0xTEST');
    expect(capturedUrl!.searchParams.get('bridge')).toBe('stargate');
    expect(capturedUrl!.searchParams.get('fromChain')).toBe('1');
    expect(capturedUrl!.searchParams.get('toChain')).toBe('137');
  });
});

// ---------------------------------------------------------------------------
// BridgeMonitoringTracker tests
// ---------------------------------------------------------------------------

describe('BridgeMonitoringTracker', () => {
  it('should have correct configuration', () => {
    const tracker = new BridgeMonitoringTracker(config);
    expect(tracker.name).toBe('bridge-monitoring');
    expect(tracker.maxAttempts).toBe(264);
    expect(tracker.pollIntervalMs).toBe(300_000);
    expect(tracker.timeoutTransition).toBe('TIMEOUT');
  });

  it('should return COMPLETED for DONE status (same mapping as Phase 1)', async () => {
    const tracker = new BridgeMonitoringTracker(config);
    const result = await tracker.checkStatus('tx-1', { txHash: '0xDONE' });
    expect(result.state).toBe('COMPLETED');
    expect(result.details?.destTxHash).toBe('0xdest123');
  });

  it('should return FAILED for FAILED status (same mapping)', async () => {
    const tracker = new BridgeMonitoringTracker(config);
    const result = await tracker.checkStatus('tx-2', { txHash: '0xFAILED' });
    expect(result.state).toBe('FAILED');
    expect(result.details?.substatus).toBe('UNKNOWN_ERROR');
  });

  it('should handle REFUNDED same as BridgeStatusTracker', async () => {
    const tracker = new BridgeMonitoringTracker(config);
    const result = await tracker.checkStatus('tx-3', { txHash: '0xREFUNDED' });
    expect(result.state).toBe('COMPLETED');
    expect(result.details?.refunded).toBe(true);
  });

  it('should return PENDING with error when no txHash', async () => {
    const tracker = new BridgeMonitoringTracker(config);
    const result = await tracker.checkStatus('tx-4', {});
    expect(result.state).toBe('PENDING');
    expect(result.details?.error).toBe('No txHash in metadata');
  });
});
