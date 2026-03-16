/**
 * Pendle Yield Trading configuration type, defaults, and chain ID mapping.
 *
 * Uses Pendle REST API v2 Convert endpoint for all actions.
 * See: https://api-v2.pendle.finance/core/docs
 */

export interface PendleConfig {
  enabled: boolean;
  apiBaseUrl: string;          // 'https://api-v2.pendle.finance/core'
  apiKey: string;              // Authorization Bearer token (optional)
  defaultSlippageBps: number;  // 100 (1%)
  maxSlippageBps: number;      // 500 (5%)
  requestTimeoutMs: number;    // 10_000
  rpcUrl?: string;             // EVM RPC endpoint for balanceOf queries (position tracking)
}

export const PENDLE_DEFAULTS: PendleConfig = {
  enabled: false,
  apiBaseUrl: 'https://api-v2.pendle.finance/core',
  apiKey: '',
  defaultSlippageBps: 100,   // 1%
  maxSlippageBps: 500,       // 5%
  requestTimeoutMs: 10_000,
};

// ---------------------------------------------------------------------------
// Network name -> Chain ID mapping (only networks supported by Pendle)
// ---------------------------------------------------------------------------

/**
 * Maps WAIaaS network type names to EVM chain IDs used by Pendle API.
 */
export const PENDLE_CHAIN_ID_MAP: Record<string, number> = {
  'ethereum-mainnet': 1,
  'arbitrum-mainnet': 42161,
  'base-mainnet': 8453,
};

/** Networks where Pendle position queries are supported (MCHN-03). */
export const PENDLE_POSITION_NETWORKS = ['ethereum-mainnet', 'arbitrum-mainnet'] as const;

/**
 * Get Pendle chain ID for a WAIaaS network name.
 * @throws Error if network is not supported by Pendle.
 */
export function getPendleChainId(network: string): number {
  const chainId = PENDLE_CHAIN_ID_MAP[network];
  if (chainId === undefined) {
    throw new Error(
      `Unsupported network '${network}' for Pendle. Supported: ${Object.keys(PENDLE_CHAIN_ID_MAP).join(', ')}`,
    );
  }
  return chainId;
}
