import type { PushPayload } from '../subscriber/message-parser.js';

export interface PushResult {
  sent: number;
  failed: number;
  invalidTokens: string[];
}

export interface IPushProvider {
  readonly name: string;
  send(tokens: string[], payload: PushPayload): Promise<PushResult>;
  validateConfig(): Promise<boolean>;
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1_000;

export async function withRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries || !shouldRetry(err)) throw err;
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export function isRetryableHttpError(status: number): boolean {
  return status >= 500 && status <= 599;
}
