/**
 * LI.FI cross-chain bridge configuration type, defaults, and chain ID mapping.
 *
 * Uses LI.FI API v1 for cross-chain bridge and swap aggregation.
 * See: https://docs.li.fi/li.fi-api/get-a-quote
 */

export interface LiFiConfig {
  enabled: boolean;
  apiBaseUrl: string;           // 'https://li.quest/v1'
  apiKey: string;               // x-lifi-api-key header (optional, relaxes rate limits)
  defaultSlippagePct: number;   // 0.03 (3%)
  maxSlippagePct: number;       // 0.05 (5%)
  requestTimeoutMs: number;     // 15_000 (cross-chain route calculation takes longer)
}

export const LIFI_DEFAULTS: LiFiConfig = {
  enabled: false,
  apiBaseUrl: 'https://li.quest/v1',
  apiKey: '',
  defaultSlippagePct: 0.03,     // 3% (cross-chain needs higher slippage)
  maxSlippagePct: 0.05,         // 5%
  requestTimeoutMs: 15_000,     // LI.FI route computation is slower than single-chain
};

// ---------------------------------------------------------------------------
// Chain ID mapping: WAIaaS chain names -> LI.FI chain IDs
// ---------------------------------------------------------------------------

/**
 * Maps WAIaaS chain/network names to LI.FI chain IDs.
 * LI.FI uses numeric chain IDs for EVM and special numeric IDs for non-EVM.
 * See: https://docs.li.fi/list-chains-bridges-dexs-solvers
 */
export const LIFI_CHAIN_MAP: ReadonlyMap<string, number> = new Map([
  // Solana
  ['solana', 1151111081099710],
  ['solana-mainnet', 1151111081099710],
  // EVM
  ['ethereum', 1],
  ['ethereum-mainnet', 1],
  ['polygon', 137],
  ['polygon-mainnet', 137],
  ['arbitrum', 42161],
  ['arbitrum-mainnet', 42161],
  ['optimism', 10],
  ['optimism-mainnet', 10],
  ['base', 8453],
  ['base-mainnet', 8453],
]);

/**
 * Get LI.FI chain ID for a WAIaaS chain name.
 * @throws Error if chain is not supported by LI.FI integration.
 */
export function getLiFiChainId(chain: string): number {
  const id = LIFI_CHAIN_MAP.get(chain.toLowerCase());
  if (id === undefined) {
    throw new Error(
      `Unsupported chain '${chain}' for LI.FI. Supported: ${[...LIFI_CHAIN_MAP.keys()].filter((k) => !k.includes('-')).join(', ')}`,
    );
  }
  return id;
}
