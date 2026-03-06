/**
 * DCent Swap configuration.
 *
 * Defines the DcentSwapConfig interface and default values.
 * Design source: doc 77 section 10.4 (Admin Settings keys).
 */

export interface DcentSwapConfig {
  /** DCent Swap Backend API base URL (DS-01). */
  apiBaseUrl: string;
  /** HTTP request timeout in milliseconds. */
  requestTimeoutMs: number;
  /** Default slippage in basis points (1 bps = 0.01%). */
  defaultSlippageBps: number;
  /** Maximum slippage in basis points. */
  maxSlippageBps: number;
  /** Currency cache TTL in milliseconds (DS-05). */
  currencyCacheTtlMs: number;
}

/**
 * Default configuration values.
 *
 * - DS-01: swapbuy-beta endpoint (includes Exchange providers)
 * - DS-05: 24h currency cache TTL, 15s request timeout
 */
export const DCENT_SWAP_DEFAULTS: DcentSwapConfig = {
  apiBaseUrl: 'https://swapbuy-beta.dcentwallet.com',
  requestTimeoutMs: 15_000,
  defaultSlippageBps: 100,  // 1%
  maxSlippageBps: 500,      // 5%
  currencyCacheTtlMs: 86_400_000, // 24 hours
};
