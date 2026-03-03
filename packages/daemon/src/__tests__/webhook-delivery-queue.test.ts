/**
 * WebhookDeliveryQueue unit tests.
 *
 * Tests HMAC-SHA256 signing, delivery with correct headers,
 * retry logic, 4xx stop, and log recording.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// Mocks (must be before imports)
// ---------------------------------------------------------------------------

const mockDecryptSettingValue = vi.fn().mockReturnValue('decrypted-secret-hex');
vi.mock('../infrastructure/settings/settings-crypto.js', () => ({
  decryptSettingValue: (...args: unknown[]) => mockDecryptSettingValue(...args),
}));

const mockGenerateId = vi.fn().mockReturnValue('mock-uuid-v7');
vi.mock('../infrastructure/database/id.js', () => ({
  generateId: () => mockGenerateId(),
}));

// Import after mocks
import { WebhookDeliveryQueue } from '../services/webhook-delivery-queue.js';
import type { WebhookDeliveryJob } from '../services/webhook-delivery-queue.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockSqlite() {
  const runFn = vi.fn();
  return {
    prepare: vi.fn().mockReturnValue({
      run: runFn,
      all: vi.fn().mockReturnValue([]),
      get: vi.fn(),
    }),
    exec: vi.fn(),
    _run: runFn, // exposed for assertions
  };
}

function makeJob(overrides: Partial<WebhookDeliveryJob> = {}): WebhookDeliveryJob {
  return {
    webhookId: 'wh-1',
    url: 'https://example.com/hook',
    secretEncrypted: 'encrypted-secret',
    eventType: 'TX_CONFIRMED',
    payload: {
      id: 'delivery-1',
      event: 'TX_CONFIRMED',
      timestamp: 1772525000,
      data: { txId: 'tx-1', txHash: '5RkZ...' },
    },
    deliveryId: 'delivery-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookDeliveryQueue', () => {
  let sqlite: ReturnType<typeof createMockSqlite>;
  let queue: WebhookDeliveryQueue;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sqlite = createMockSqlite();
    queue = new WebhookDeliveryQueue(
      sqlite as unknown as import('better-sqlite3').Database,
      () => 'master-password',
    );
    // Zero backoff for fast tests
    Object.defineProperty(queue, 'backoffMs', { value: [0, 0, 0, 0], writable: false });

    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    mockDecryptSettingValue.mockReturnValue('decrypted-secret-hex');
    mockGenerateId.mockReturnValue('mock-uuid-v7');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Helper to wait for async enqueue to complete all attempts
  async function waitForDelivery(expectedFetchCalls: number, maxWait = 3000): Promise<void> {
    const start = Date.now();
    while (fetchSpy.mock.calls.length < expectedFetchCalls && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 5));
    }
    // Extra wait for log writes
    await new Promise((r) => setTimeout(r, 20));
  }

  // -----------------------------------------------------------------------
  // HMAC signing
  // -----------------------------------------------------------------------

  it('sign() produces "sha256={hex}" format', () => {
    const secret = 'test-secret';
    const body = '{"event":"TX_CONFIRMED"}';

    const result = queue.sign(secret, body);

    expect(result).toMatch(/^sha256=[a-f0-9]{64}$/);

    const expected = `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
    expect(result).toBe(expected);
  });

  // -----------------------------------------------------------------------
  // Successful delivery
  // -----------------------------------------------------------------------

  it('delivers with correct 6 headers', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('OK', { status: 200 }));

    queue.enqueue(makeJob());
    await waitForDelivery(1);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers['X-WAIaaS-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(opts.headers['X-WAIaaS-Event']).toBe('TX_CONFIRMED');
    expect(opts.headers['X-WAIaaS-Delivery']).toBe('delivery-1');
    expect(opts.headers['X-WAIaaS-Timestamp']).toBeDefined();
    expect(opts.headers['User-Agent']).toBe('WAIaaS-Webhook/1.0');
  });

  it('successful delivery logs status=success with httpStatus and duration', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('OK', { status: 200 }));

    queue.enqueue(makeJob());
    await waitForDelivery(1);

    // Check webhook_logs INSERT was called
    expect(sqlite._run).toHaveBeenCalled();
    const args = sqlite._run.mock.calls[0];
    // [id, webhookId, eventType, status, httpStatus, attempt, error, requestDuration, createdAt]
    expect(args[3]).toBe('success');
    expect(args[4]).toBe(200);
    expect(args[5]).toBe(1);
    expect(args[6]).toBeNull();
    expect(typeof args[7]).toBe('number');
  });

  // -----------------------------------------------------------------------
  // 4xx stops immediately
  // -----------------------------------------------------------------------

  it('stops immediately on 4xx (no retry), logs status=failed', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Bad Request', { status: 400 }));

    queue.enqueue(makeJob());
    await waitForDelivery(1);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Log shows failed
    expect(sqlite._run).toHaveBeenCalledTimes(1);
    const args = sqlite._run.mock.calls[0];
    expect(args[3]).toBe('failed');
    expect(args[4]).toBe(400);
  });

  // -----------------------------------------------------------------------
  // 5xx retry
  // -----------------------------------------------------------------------

  it('retries up to 4 times on 5xx', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('Error', { status: 500 }))
      .mockResolvedValueOnce(new Response('Error', { status: 502 }))
      .mockResolvedValueOnce(new Response('Error', { status: 503 }))
      .mockResolvedValueOnce(new Response('Error', { status: 500 }));

    queue.enqueue(makeJob());
    await waitForDelivery(4);

    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  // -----------------------------------------------------------------------
  // Network error retry
  // -----------------------------------------------------------------------

  it('retries on network error and succeeds on retry', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));

    queue.enqueue(makeJob());
    await waitForDelivery(2);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // Each attempt creates individual log entry
  // -----------------------------------------------------------------------

  it('each attempt creates individual webhook_logs entry', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('Error', { status: 500 }))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));

    queue.enqueue(makeJob());
    await waitForDelivery(2);

    // 2 INSERT calls (one per attempt)
    expect(sqlite._run.mock.calls.length).toBe(2);
  });

  // -----------------------------------------------------------------------
  // Decrypts secret
  // -----------------------------------------------------------------------

  it('decrypts secret via decryptSettingValue for HMAC signing', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('OK', { status: 200 }));

    queue.enqueue(makeJob({ secretEncrypted: 'my-encrypted-secret' }));
    await waitForDelivery(1);

    expect(mockDecryptSettingValue).toHaveBeenCalledWith('my-encrypted-secret', 'master-password');
  });
});
