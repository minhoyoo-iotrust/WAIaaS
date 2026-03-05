/**
 * AA Provider chain mapping: WAIaaS networkId -> provider-specific chainId.
 *
 * Each preset provider (Pimlico, Alchemy) uses different chain identifiers
 * in their API URLs. This module maps WAIaaS networkIds to provider chainIds
 * and constructs bundler/paymaster URLs automatically.
 *
 * @see internal/objectives/m30-09-smart-account-dx.md
 */

import type { AaProviderName } from '../enums/wallet.js';

// ---------------------------------------------------------------------------
// Chain mapping: WAIaaS networkId -> provider chainId
// ---------------------------------------------------------------------------

/**
 * Mapping from WAIaaS networkId to provider-specific chainId.
 * 10 EVM networks supported by both Pimlico and Alchemy.
 */
export const AA_PROVIDER_CHAIN_MAP: Record<'pimlico' | 'alchemy', Record<string, string>> = {
  pimlico: {
    'ethereum-mainnet': 'ethereum',
    'ethereum-sepolia': 'sepolia',
    'polygon-mainnet': 'polygon',
    'polygon-amoy': 'polygon-amoy',
    'arbitrum-mainnet': 'arbitrum',
    'arbitrum-sepolia': 'arbitrum-sepolia',
    'optimism-mainnet': 'optimism',
    'optimism-sepolia': 'optimism-sepolia',
    'base-mainnet': 'base',
    'base-sepolia': 'base-sepolia',
  },
  alchemy: {
    'ethereum-mainnet': 'eth-mainnet',
    'ethereum-sepolia': 'eth-sepolia',
    'polygon-mainnet': 'polygon-mainnet',
    'polygon-amoy': 'polygon-amoy',
    'arbitrum-mainnet': 'arb-mainnet',
    'arbitrum-sepolia': 'arb-sepolia',
    'optimism-mainnet': 'opt-mainnet',
    'optimism-sepolia': 'opt-sepolia',
    'base-mainnet': 'base-mainnet',
    'base-sepolia': 'base-sepolia',
  },
};

/**
 * Resolve a provider-specific chainId from a WAIaaS networkId.
 *
 * @returns Provider chainId, or null if the provider does not support this network
 *          (including 'custom' which has no mapping).
 */
export function resolveProviderChainId(
  provider: AaProviderName,
  networkId: string,
): string | null {
  if (provider === 'custom') return null;
  const map = AA_PROVIDER_CHAIN_MAP[provider];
  return map?.[networkId] ?? null;
}

/**
 * Build a bundler URL for a preset provider.
 *
 * For Pimlico and Alchemy, the bundler URL also serves as the paymaster URL
 * (unified endpoint with the same API key).
 *
 * @param provider - 'pimlico' or 'alchemy'
 * @param chainId - Provider-specific chain ID (from resolveProviderChainId)
 * @param apiKey - Provider API key
 * @returns Fully constructed bundler URL
 */
export function buildProviderBundlerUrl(
  provider: 'pimlico' | 'alchemy',
  chainId: string,
  apiKey: string,
): string {
  switch (provider) {
    case 'pimlico':
      return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${apiKey}`;
    case 'alchemy':
      return `https://${chainId}.g.alchemy.com/v2/${apiKey}`;
  }
}

/**
 * Dashboard URLs for obtaining API keys from each provider.
 */
export const AA_PROVIDER_DASHBOARD_URLS: Record<'pimlico' | 'alchemy', string> = {
  pimlico: 'https://dashboard.pimlico.io',
  alchemy: 'https://dashboard.alchemy.com',
};
