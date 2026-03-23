/**
 * D'CENT Swap Aggregator configuration.
 *
 * Defines the DcentSwapConfig interface and default values.
 * Design source: doc 77 section 10.4 (Admin Settings keys).
 */

export interface DcentSwapConfig {
  /** D'CENT Swap Aggregator API base URL (DS-01). */
  apiBaseUrl: string;
  /** HTTP request timeout in milliseconds. */
  requestTimeoutMs: number;
  /** Default slippage in basis points (1 bps = 0.01%). */
  defaultSlippageBps: number;
  /** Maximum slippage in basis points. */
  maxSlippageBps: number;
  /** Currency cache TTL in milliseconds (DS-05). */
  currencyCacheTtlMs: number;
  /** Debug dump directory for API request/response logging (#419). Disabled when undefined. */
  debugDumpDir?: string;
}

/**
 * Default configuration values.
 *
 * - DS-01: agent-swap endpoint (DEX-only)
 * - DS-05: 24h currency cache TTL, 15s request timeout
 */
export const DCENT_SWAP_DEFAULTS: DcentSwapConfig = {
  apiBaseUrl: 'https://agent-swap.dcentwallet.com',
  requestTimeoutMs: 15_000,
  defaultSlippageBps: 100,  // 1%
  maxSlippageBps: 500,      // 5%
  currencyCacheTtlMs: 86_400_000, // 24 hours
};
