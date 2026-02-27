/**
 * Aave V3 configuration type, defaults, and 5-chain contract address map.
 *
 * Supports: Ethereum, Arbitrum, Optimism, Polygon, Base mainnets.
 * Addresses verified from bgd-labs/aave-address-book GitHub repository.
 */
import { ChainError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Config type
// ---------------------------------------------------------------------------

export interface AaveV3Config {
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Chain address type
// ---------------------------------------------------------------------------

export interface AaveChainAddresses {
  pool: string;
  dataProvider: string;
  oracle: string;
  chainId: number;
}

// ---------------------------------------------------------------------------
// 5-chain address map (verified from aave-address-book 2026-02-27)
// ---------------------------------------------------------------------------

export const AAVE_V3_ADDRESSES: Record<string, AaveChainAddresses> = {
  'ethereum-mainnet': {
    pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    dataProvider: '0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD',
    oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
    chainId: 1,
  },
  'arbitrum-mainnet': {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    dataProvider: '0x243Aa95cAC2a25651eda86e80bEe66114413c43b',
    oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    chainId: 42161,
  },
  'optimism-mainnet': {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    dataProvider: '0x243Aa95cAC2a25651eda86e80bEe66114413c43b',
    oracle: '0xD81eb3728a631871a7eBBaD631b5f424909f0c77',
    chainId: 10,
  },
  'polygon-mainnet': {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    dataProvider: '0x243Aa95cAC2a25651eda86e80bEe66114413c43b',
    oracle: '0xb023e699F5a33916Ea823A16485e259257cA8Bd1',
    chainId: 137,
  },
  'base-mainnet': {
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    dataProvider: '0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A',
    oracle: '0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156',
    chainId: 8453,
  },
};

// ---------------------------------------------------------------------------
// Network name -> Chain ID mapping (matches WAIaaS network type names)
// ---------------------------------------------------------------------------

export const AAVE_CHAIN_ID_MAP: Record<string, number> = {
  'ethereum-mainnet': 1,
  'polygon-mainnet': 137,
  'arbitrum-mainnet': 42161,
  'optimism-mainnet': 10,
  'base-mainnet': 8453,
};

// ---------------------------------------------------------------------------
// Defaults (disabled)
// ---------------------------------------------------------------------------

export const AAVE_V3_DEFAULTS: AaveV3Config = {
  enabled: false,
};

// ---------------------------------------------------------------------------
// Helper to get addresses by network name
// ---------------------------------------------------------------------------

/**
 * Get Aave V3 contract addresses for a given WAIaaS network name.
 *
 * @param network - WAIaaS network type (e.g., 'ethereum-mainnet', 'base-mainnet')
 * @throws ChainError if network is not supported by Aave V3
 */
export function getAaveAddresses(network: string): AaveChainAddresses {
  const addresses = AAVE_V3_ADDRESSES[network];
  if (!addresses) {
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: `Unsupported network for Aave V3: ${network}. Supported: ${Object.keys(AAVE_V3_ADDRESSES).join(', ')}`,
    });
  }
  return addresses;
}
