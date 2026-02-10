/**
 * Exponential backoff retry wrapper for transient failures.
 *
 * Retries on 429 (rate limited) and 5xx (server errors).
 * Non-retryable errors (4xx except 429) are thrown immediately.
 * Network errors (fetch failures) are also retried.
 *
 * Jitter: Each delay is randomized between 50-100% of the computed delay
 * to prevent thundering herd on concurrent retries.
 */

import { WAIaaSError } from './error.js';
import type { RetryOptions } from './types.js';
import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
  DEFAULT_RETRYABLE_STATUSES,
} from './internal/constants.js';

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const retryableStatuses = options?.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;

      if (err instanceof WAIaaSError) {
        // Non-retryable WAIaaSError (4xx except those in retryableStatuses) -> throw immediately
        if (!retryableStatuses.includes(err.status) && err.status !== 0) {
          throw err;
        }
        // status 0 means network/timeout error -> always retryable
      }
      // Unknown errors (non-WAIaaSError) are treated as retryable (network failures etc.)

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = delay * (0.5 + Math.random() * 0.5); // 50-100% of delay
      await new Promise((r) => setTimeout(r, jitter));
    }
  }
  throw lastError;
}
