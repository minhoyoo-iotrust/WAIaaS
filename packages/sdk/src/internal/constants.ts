/**
 * SDK default constants.
 */

export const DEFAULT_TIMEOUT = 30_000;
export const DEFAULT_BASE_DELAY_MS = 1000;
export const DEFAULT_MAX_DELAY_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];
export const SDK_VERSION = '0.0.0';
export const USER_AGENT = `waiaas-sdk/${SDK_VERSION}`;
