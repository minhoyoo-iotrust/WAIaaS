/**
 * Across Protocol bridge configuration type, defaults, and chain/address mapping.
 *
 * Uses Across Protocol REST API for intent-based cross-chain EVM bridging.
 * See: design doc 79 sections 8.6-8.8
 */
import { ChainError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AcrossConfig {
  enabled: boolean;
  apiBaseUrl: string;           // 'https://app.across.to/api'
  integratorId: string;         // Across integrator ID (recommended, optional)
  fillDeadlineBufferSec: number; // default 21600 (6 hours)
  defaultSlippagePct: number;   // 0.01 (1%)
  maxSlippagePct: number;       // 0.03 (3%)
  requestTimeoutMs: number;     // 10_000
}

export const ACROSS_DEFAULTS: AcrossConfig = {
  enabled: false,
  apiBaseUrl: 'https://app.across.to/api',
  integratorId: '',
  fillDeadlineBufferSec: 21_600,  // 6 hours
  defaultSlippagePct: 0.01,       // 1% (same-token bridge = low slippage)
  maxSlippagePct: 0.03,           // 3%
  requestTimeoutMs: 10_000,       // 10 seconds
};

// ---------------------------------------------------------------------------
// Chain ID mapping: WAIaaS chain names -> EVM chain IDs
// ---------------------------------------------------------------------------

/**
 * Maps WAIaaS chain/network names to Across-supported EVM chain IDs.
 * See: design doc 79 section 8.7
 */
export const ACROSS_CHAIN_MAP: ReadonlyMap<string, number> = new Map([
  ['ethereum', 1],
  ['ethereum-mainnet', 1],
  ['arbitrum', 42161],
  ['arbitrum-mainnet', 42161],
  ['optimism', 10],
  ['optimism-mainnet', 10],
  ['base', 8453],
  ['base-mainnet', 8453],
  ['polygon', 137],
  ['polygon-mainnet', 137],
  ['linea', 59144],
  ['linea-mainnet', 59144],
]);

/**
 * Get EVM chain ID for a WAIaaS chain name.
 * @throws ChainError if chain is not supported by Across integration.
 */
export function getAcrossChainId(chain: string): number {
  const id = ACROSS_CHAIN_MAP.get(chain.toLowerCase());
  if (id === undefined) {
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: `Unsupported chain '${chain}' for Across bridge. Supported: ${[...ACROSS_CHAIN_MAP.keys()].filter((k) => !k.includes('-')).join(', ')}`,
    });
  }
  return id;
}

// ---------------------------------------------------------------------------
// SpokePool addresses (design doc 79 section 4.5)
// ---------------------------------------------------------------------------

/**
 * Chain ID -> SpokePool proxy address.
 * These are UUPS proxies; addresses are stable but may need updates for new chains.
 */
export const SPOKE_POOL_ADDRESSES: ReadonlyMap<number, string> = new Map([
  [1, '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5'],       // Ethereum
  [42161, '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A'],   // Arbitrum
  [10, '0x6f26Bf09B1C792e3228e5467807a900A503c0281'],      // Optimism
  [8453, '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64'],    // Base
  [137, '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096'],     // Polygon
  [59144, '0x7E63A5f1a8F0B4d0934B2f2327DaED3F6bb2ee75'],  // Linea
]);

/**
 * Get SpokePool address for a chain ID.
 * @throws ChainError if chain has no known SpokePool address.
 */
export function getSpokePoolAddress(chainId: number): string {
  const addr = SPOKE_POOL_ADDRESSES.get(chainId);
  if (!addr) {
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: `No SpokePool address for chain ${chainId}`,
    });
  }
  return addr;
}

// ---------------------------------------------------------------------------
// WETH addresses (design doc 79 section 4.6)
// ---------------------------------------------------------------------------

/**
 * Chain ID -> Wrapped native token (WETH/WMATIC) address.
 * Used for native token bridge detection (inputToken == WETH -> native bridge).
 */
export const WETH_ADDRESSES: ReadonlyMap<number, string> = new Map([
  [1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],       // Ethereum WETH
  [42161, '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'],   // Arbitrum WETH
  [10, '0x4200000000000000000000000000000000000006'],        // Optimism WETH
  [8453, '0x4200000000000000000000000000000000000006'],      // Base WETH
  [137, '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'],     // Polygon WMATIC
  [59144, '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f'],   // Linea WETH
]);

/**
 * Get WETH (wrapped native) address for a chain ID.
 * @throws ChainError if chain has no known WETH address.
 */
export function getWethAddress(chainId: number): string {
  const addr = WETH_ADDRESSES.get(chainId);
  if (!addr) {
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: `No WETH address for chain ${chainId}`,
    });
  }
  return addr;
}

/**
 * Check if inputToken is the wrapped native token for the given chain.
 * Case-insensitive comparison.
 */
export function isNativeTokenBridge(inputToken: string, chainId: number): boolean {
  const weth = WETH_ADDRESSES.get(chainId);
  if (!weth) return false;
  return inputToken.toLowerCase() === weth.toLowerCase();
}
