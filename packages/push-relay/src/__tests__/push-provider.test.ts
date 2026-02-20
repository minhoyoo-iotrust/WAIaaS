import { describe, it, expect } from 'vitest';
import { withRetry, isRetryableHttpError } from '../providers/push-provider.js';

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(async () => 42, () => true, 3);
    expect(result).toBe(42);
  });

  it('retries on retryable error and succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('retryable');
        return 'ok';
      },
      () => true,
      3,
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws immediately on non-retryable error', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error('fatal');
        },
        () => false,
        3,
      ),
    ).rejects.toThrow('fatal');
    expect(attempts).toBe(1);
  });

  it('throws after max retries exhausted', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error('always fails');
        },
        () => true,
        0,
      ),
    ).rejects.toThrow('always fails');
    expect(attempts).toBe(1);
  });
});

describe('isRetryableHttpError', () => {
  it('returns true for 5xx status codes', () => {
    expect(isRetryableHttpError(500)).toBe(true);
    expect(isRetryableHttpError(502)).toBe(true);
    expect(isRetryableHttpError(503)).toBe(true);
    expect(isRetryableHttpError(599)).toBe(true);
  });

  it('returns false for non-5xx status codes', () => {
    expect(isRetryableHttpError(200)).toBe(false);
    expect(isRetryableHttpError(400)).toBe(false);
    expect(isRetryableHttpError(401)).toBe(false);
    expect(isRetryableHttpError(404)).toBe(false);
    expect(isRetryableHttpError(429)).toBe(false);
  });
});
