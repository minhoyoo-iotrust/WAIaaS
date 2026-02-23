/**
 * 0x Swap configuration type, defaults, and AllowanceHolder address mapping.
 *
 * Uses 0x Swap API v2 with the AllowanceHolder flow (not Permit2).
 * See: https://0x.org/docs/api#tag/Swap
 */

export interface ZeroExSwapConfig {
  enabled: boolean;
  apiBaseUrl: string;     // 'https://api.0x.org'
  apiKey: string;         // 0x-api-key header
  defaultSlippageBps: number;  // 100 (1%)
  maxSlippageBps: number;      // 500 (5%)
  requestTimeoutMs: number;    // 10_000
}

export const ZEROX_SWAP_DEFAULTS: ZeroExSwapConfig = {
  enabled: false,
  apiBaseUrl: 'https://api.0x.org',
  apiKey: '',
  defaultSlippageBps: 100,   // 1% (ZXSW-06)
  maxSlippageBps: 500,       // 5% (ZXSW-06)
  requestTimeoutMs: 10_000,  // (ZXSW-10)
};

// ---------------------------------------------------------------------------
// AllowanceHolder contract address (same on all supported chains) (ZXSW-09)
// ---------------------------------------------------------------------------

const ALLOWANCE_HOLDER_ADDRESS = '0x0000000000001fF3684f28c67538d4D072C22734';

/**
 * Supported chain IDs for 0x Swap API v2 AllowanceHolder flow.
 * Cancun 19 chains + Mantle = 20 total.
 */
export const ALLOWANCE_HOLDER_ADDRESSES: ReadonlyMap<number, string> = new Map([
  [1, ALLOWANCE_HOLDER_ADDRESS],       // Ethereum
  [10, ALLOWANCE_HOLDER_ADDRESS],      // Optimism
  [56, ALLOWANCE_HOLDER_ADDRESS],      // BNB Chain
  [130, ALLOWANCE_HOLDER_ADDRESS],     // Unichain
  [137, ALLOWANCE_HOLDER_ADDRESS],     // Polygon
  [1329, ALLOWANCE_HOLDER_ADDRESS],    // SEI
  [1868, ALLOWANCE_HOLDER_ADDRESS],    // Soneium
  [2741, ALLOWANCE_HOLDER_ADDRESS],    // Abstract
  [5000, ALLOWANCE_HOLDER_ADDRESS],    // Mantle
  [8453, ALLOWANCE_HOLDER_ADDRESS],    // Base
  [33139, ALLOWANCE_HOLDER_ADDRESS],   // Apechain
  [34443, ALLOWANCE_HOLDER_ADDRESS],   // Mode
  [42161, ALLOWANCE_HOLDER_ADDRESS],   // Arbitrum
  [42220, ALLOWANCE_HOLDER_ADDRESS],   // Celo
  [43114, ALLOWANCE_HOLDER_ADDRESS],   // Avalanche
  [57073, ALLOWANCE_HOLDER_ADDRESS],   // Ink
  [59144, ALLOWANCE_HOLDER_ADDRESS],   // Linea
  [80084, ALLOWANCE_HOLDER_ADDRESS],   // Berachain
  [81457, ALLOWANCE_HOLDER_ADDRESS],   // Blast
  [534352, ALLOWANCE_HOLDER_ADDRESS],  // Scroll
]);

/**
 * Get AllowanceHolder contract address for a given chain ID.
 * @throws Error if chain ID is not supported by 0x Swap API.
 */
export function getAllowanceHolderAddress(chainId: number): string {
  const address = ALLOWANCE_HOLDER_ADDRESSES.get(chainId);
  if (!address) {
    throw new Error(
      `Unsupported chain ID ${chainId} for 0x Swap. Supported: ${[...ALLOWANCE_HOLDER_ADDRESSES.keys()].join(', ')}`,
    );
  }
  return address;
}

// ---------------------------------------------------------------------------
// Network name -> Chain ID mapping (only networks in NETWORK_TYPES)
// ---------------------------------------------------------------------------

/**
 * Maps WAIaaS network type names to EVM chain IDs.
 * Only includes mainnet networks that are supported by both WAIaaS and 0x API.
 */
export const CHAIN_ID_MAP: Record<string, number> = {
  'ethereum-mainnet': 1,
  'polygon-mainnet': 137,
  'arbitrum-mainnet': 42161,
  'optimism-mainnet': 10,
  'base-mainnet': 8453,
};
