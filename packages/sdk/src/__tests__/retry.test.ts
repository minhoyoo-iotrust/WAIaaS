import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../retry.js';
import { WAIaaSError } from '../error.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // Success cases
  // =========================================================================

  it('should return result on first attempt (no retry needed)', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Retryable errors (429 / 5xx)
  // =========================================================================

  it('should retry on 429 and succeed on second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(
        new WAIaaSError({ code: 'RATE_LIMIT', message: 'Too many requests', status: 429, retryable: true }),
      )
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000 });
    // Advance timers to let the retry happen
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on 500 with exponential delay', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(
        new WAIaaSError({ code: 'SERVER_ERROR', message: 'Internal error', status: 500, retryable: true }),
      )
      .mockRejectedValueOnce(
        new WAIaaSError({ code: 'SERVER_ERROR', message: 'Internal error', status: 500, retryable: true }),
      )
      .mockResolvedValue('finally');

    const promise = withRetry(fn, { maxRetries: 5, baseDelayMs: 100, maxDelayMs: 10000 });
    // Advance enough time for two retries (100ms * 2^0 + 100ms * 2^1 = up to 300ms with jitter)
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toBe('finally');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should retry on 502 status', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(
        new WAIaaSError({ code: 'BAD_GATEWAY', message: 'Bad gateway', status: 502, retryable: true }),
      )
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { maxRetries: 1, baseDelayMs: 10, maxDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(50);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // =========================================================================
  // Non-retryable errors (4xx except 429)
  // =========================================================================

  it('should NOT retry on 401 (throws immediately)', async () => {
    const error = new WAIaaSError({ code: 'AUTH_FAILED', message: 'Unauthorized', status: 401, retryable: false });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 100 }),
    ).rejects.toThrow(error);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry on 403 (throws immediately)', async () => {
    const error = new WAIaaSError({ code: 'FORBIDDEN', message: 'Forbidden', status: 403, retryable: false });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 100 }),
    ).rejects.toThrow(error);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry on 400 (throws immediately)', async () => {
    const error = new WAIaaSError({ code: 'BAD_REQUEST', message: 'Bad request', status: 400, retryable: false });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 100 }),
    ).rejects.toThrow(error);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Max retries exhausted
  // =========================================================================

  it('should throw last error when max retries exhausted', async () => {
    const lastError = new WAIaaSError({ code: 'SERVER_ERROR', message: 'Attempt 4', status: 500, retryable: true });
    const fn = vi.fn()
      .mockRejectedValueOnce(new WAIaaSError({ code: 'SERVER_ERROR', message: 'Attempt 1', status: 500, retryable: true }))
      .mockRejectedValueOnce(new WAIaaSError({ code: 'SERVER_ERROR', message: 'Attempt 2', status: 500, retryable: true }))
      .mockRejectedValueOnce(new WAIaaSError({ code: 'SERVER_ERROR', message: 'Attempt 3', status: 500, retryable: true }))
      .mockRejectedValueOnce(lastError);

    // Catch the rejection eagerly to avoid unhandled rejection warning
    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 })
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000); // enough for all retries

    const result = await promise;
    expect(result).toBe(lastError);
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  // =========================================================================
  // Network errors (non-WAIaaSError)
  // =========================================================================

  it('should retry on network error (TypeError from fetch)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(50);
    const result = await promise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // =========================================================================
  // Configuration options
  // =========================================================================

  it('should respect custom retryableStatuses', async () => {
    // Custom: only retry on 503
    const error503 = new WAIaaSError({ code: 'UNAVAILABLE', message: 'Unavailable', status: 503, retryable: true });
    const error429 = new WAIaaSError({ code: 'RATE_LIMIT', message: 'Rate limited', status: 429, retryable: true });

    // 429 should NOT be retried since it's not in custom list
    const fn429 = vi.fn().mockRejectedValue(error429);
    await expect(
      withRetry(fn429, { maxRetries: 3, baseDelayMs: 10, retryableStatuses: [503] }),
    ).rejects.toThrow(error429);
    expect(fn429).toHaveBeenCalledTimes(1);

    // 503 should be retried with custom list
    const fn503 = vi.fn()
      .mockRejectedValueOnce(error503)
      .mockResolvedValue('ok');
    const promise = withRetry(fn503, { maxRetries: 1, baseDelayMs: 10, retryableStatuses: [503] });
    await vi.advanceTimersByTimeAsync(50);
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn503).toHaveBeenCalledTimes(2);
  });

  it('should disable retry when maxRetries=0', async () => {
    const error = new WAIaaSError({ code: 'SERVER_ERROR', message: 'Error', status: 500, retryable: true });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, { maxRetries: 0, baseDelayMs: 10 }),
    ).rejects.toThrow(error);

    expect(fn).toHaveBeenCalledTimes(1); // only initial attempt, no retries
  });

  // =========================================================================
  // Jitter and delay behavior
  // =========================================================================

  it('should cap delay at maxDelayMs', async () => {
    // With baseDelayMs=100 and maxDelayMs=200, attempt 3 would normally be 100*2^2=400
    // but should be capped at 200
    let resolveSecond: (() => void) | null = null;

    const fn = vi.fn()
      .mockRejectedValueOnce(new WAIaaSError({ code: 'E', message: 'E', status: 500, retryable: true }))
      .mockRejectedValueOnce(new WAIaaSError({ code: 'E', message: 'E', status: 500, retryable: true }))
      .mockImplementation(() => new Promise<string>((resolve) => {
        resolveSecond = () => resolve('done');
      }));

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 200 });

    // After 300ms, both retries should have executed (delays capped at 200ms with jitter 50-100%)
    await vi.advanceTimersByTimeAsync(500);

    // The third attempt should be in progress
    expect(fn).toHaveBeenCalledTimes(3);

    // Resolve the third attempt
    resolveSecond!();
    const result = await promise;
    expect(result).toBe('done');
  });

  // =========================================================================
  // WAIaaSError with status 0 (network/timeout)
  // =========================================================================

  it('should retry WAIaaSError with status 0 (network error)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(
        new WAIaaSError({ code: 'NETWORK_ERROR', message: 'Connection refused', status: 0, retryable: true }),
      )
      .mockResolvedValue('connected');

    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(50);
    const result = await promise;

    expect(result).toBe('connected');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
