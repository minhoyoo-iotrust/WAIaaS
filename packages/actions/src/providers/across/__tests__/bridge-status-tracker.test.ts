/**
 * Across Bridge Status Tracker tests.
 * Tests 2-phase polling: AcrossBridgeStatusTracker (active) + AcrossBridgeMonitoringTracker (reduced).
 * Verifies status mapping: filled->COMPLETED, pending->PENDING, expired->FAILED, refunded->COMPLETED.
 *
 * @see internal/design/79-across-protocol-bridge.md (section 6)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  AcrossBridgeStatusTracker,
  AcrossBridgeMonitoringTracker,
} from '../bridge-status-tracker.js';
import { ACROSS_DEFAULTS } from '../config.js';

// ---------------------------------------------------------------------------
// MSW server setup
// ---------------------------------------------------------------------------

const BASE_URL = 'https://app.across.to/api';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setMockStatus(status: string, extra: Record<string, unknown> = {}): void {
  server.use(
    http.get(`${BASE_URL}/deposit/status`, () => {
      return HttpResponse.json({ status, ...extra });
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests: AcrossBridgeStatusTracker (Active Phase)
// ---------------------------------------------------------------------------

describe('AcrossBridgeStatusTracker', () => {
  describe('properties', () => {
    it('name is "across-bridge"', () => {
      const tracker = new AcrossBridgeStatusTracker(ACROSS_DEFAULTS);
      expect(tracker.name).toBe('across-bridge');
    });

    it('maxAttempts is 480', () => {
      const tracker = new AcrossBridgeStatusTracker(ACROSS_DEFAULTS);
      expect(tracker.maxAttempts).toBe(480);
    });

    it('pollIntervalMs is 15_000', () => {
      const tracker = new AcrossBridgeStatusTracker(ACROSS_DEFAULTS);
      expect(tracker.pollIntervalMs).toBe(15_000);
    });

    it('timeoutTransition is BRIDGE_MONITORING', () => {
      const tracker = new AcrossBridgeStatusTracker(ACROSS_DEFAULTS);
      expect(tracker.timeoutTransition).toBe('BRIDGE_MONITORING');
    });
  });

  describe('checkStatus', () => {
    it('filled -> returns {state: COMPLETED} with details', async () => {
      setMockStatus('filled', {
        fillTxHash: '0xfillhash123',
        destinationChainId: 42161,
        depositId: 99,
      });

      const tracker = new AcrossBridgeStatusTracker(ACROSS_DEFAULTS);
      const result = await tracker.checkStatus('tx-123', { txHash: '0xdeposit123' });

      expect(result.state).toBe('COMPLETED');
      expect(result.details?.fillTxHash).toBe('0xfillhash123');
      expect(result.details?.destinationChainId).toBe(42161);
      expect(result.details?.depositId).toBe(99);
    });

    it('pending -> returns {state: PENDING}', async () => {
      setMockStatus('pending');

      const tracker = new AcrossBridgeStatusTracker(ACROSS_DEFAULTS);
      const result = await tracker.checkStatus('tx-123', { txHash: '0xdeposit123' });

      expect(result.state).toBe('PENDING');
    });

    it('expired -> returns {state: FAILED} with reason', async () => {
      setMockStatus('expired');

      const tracker = new AcrossBridgeStatusTracker(ACROSS_DEFAULTS);
      const result = await tracker.checkStatus('tx-123', { txHash: '0xdeposit123' });

      expect(result.state).toBe('FAILED');
      expect(result.details?.reason).toMatch(/expired/i);
    });

    it('refunded -> returns {state: COMPLETED} with refunded:true', async () => {
      setMockStatus('refunded');

      const tracker = new AcrossBridgeStatusTracker(ACROSS_DEFAULTS);
      const result = await tracker.checkStatus('tx-123', { txHash: '0xdeposit123' });

      expect(result.state).toBe('COMPLETED');
      expect(result.details?.refunded).toBe(true);
    });

    it('missing txHash in metadata -> returns {state: PENDING} with error', async () => {
      const tracker = new AcrossBridgeStatusTracker(ACROSS_DEFAULTS);
      const result = await tracker.checkStatus('tx-123', {});

      expect(result.state).toBe('PENDING');
      expect(result.details?.error).toBeDefined();
    });

    it('passes originChainId from metadata when present', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/deposit/status`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ status: 'pending' });
        }),
      );

      const tracker = new AcrossBridgeStatusTracker(ACROSS_DEFAULTS);
      await tracker.checkStatus('tx-123', { txHash: '0xdeposit123', originChainId: 1 });

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('originChainId')).toBe('1');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: AcrossBridgeMonitoringTracker (Reduced Phase)
// ---------------------------------------------------------------------------

describe('AcrossBridgeMonitoringTracker', () => {
  describe('properties', () => {
    it('name is "across-bridge-monitoring"', () => {
      const tracker = new AcrossBridgeMonitoringTracker(ACROSS_DEFAULTS);
      expect(tracker.name).toBe('across-bridge-monitoring');
    });

    it('maxAttempts is 264', () => {
      const tracker = new AcrossBridgeMonitoringTracker(ACROSS_DEFAULTS);
      expect(tracker.maxAttempts).toBe(264);
    });

    it('pollIntervalMs is 300_000', () => {
      const tracker = new AcrossBridgeMonitoringTracker(ACROSS_DEFAULTS);
      expect(tracker.pollIntervalMs).toBe(300_000);
    });

    it('timeoutTransition is TIMEOUT', () => {
      const tracker = new AcrossBridgeMonitoringTracker(ACROSS_DEFAULTS);
      expect(tracker.timeoutTransition).toBe('TIMEOUT');
    });
  });

  describe('checkStatus', () => {
    it('filled -> returns {state: COMPLETED}', async () => {
      setMockStatus('filled', { fillTxHash: '0xfill' });

      const tracker = new AcrossBridgeMonitoringTracker(ACROSS_DEFAULTS);
      const result = await tracker.checkStatus('tx-123', { txHash: '0xdeposit123' });

      expect(result.state).toBe('COMPLETED');
    });

    it('pending -> returns {state: PENDING}', async () => {
      setMockStatus('pending');

      const tracker = new AcrossBridgeMonitoringTracker(ACROSS_DEFAULTS);
      const result = await tracker.checkStatus('tx-123', { txHash: '0xdeposit123' });

      expect(result.state).toBe('PENDING');
    });

    it('expired -> returns {state: FAILED}', async () => {
      setMockStatus('expired');

      const tracker = new AcrossBridgeMonitoringTracker(ACROSS_DEFAULTS);
      const result = await tracker.checkStatus('tx-123', { txHash: '0xdeposit123' });

      expect(result.state).toBe('FAILED');
    });

    it('missing txHash -> returns PENDING with error', async () => {
      const tracker = new AcrossBridgeMonitoringTracker(ACROSS_DEFAULTS);
      const result = await tracker.checkStatus('tx-123', {});

      expect(result.state).toBe('PENDING');
      expect(result.details?.error).toBeDefined();
    });
  });
});
