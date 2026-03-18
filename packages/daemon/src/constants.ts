/**
 * Daemon package shared constants.
 * Extracted from repeated magic numbers across daemon services.
 */

/** Oracle HTTP request timeout (coingecko, pyth). */
export const ORACLE_TIMEOUT_MS = 5_000;

/** Signing channel (push-relay, wallet-notification) HTTP fetch timeout. */
export const SIGNING_CHANNEL_FETCH_TIMEOUT_MS = 10_000;

/** Default max retries for HTTP clients (nft-indexer, etc). */
export const DEFAULT_MAX_RETRIES = 3;

/** Gas safety margin numerator (120% = 120n/100n). Per CLAUDE.md mandate. */
export const GAS_SAFETY_NUMERATOR = 120n;

/** Gas safety margin denominator. */
export const GAS_SAFETY_DENOMINATOR = 100n;

/** Worker: graceful shutdown deadline (ms). */
export const WORKER_SHUTDOWN_DEADLINE_MS = 5_000;
