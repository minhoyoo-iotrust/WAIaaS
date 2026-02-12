import { z } from 'zod';

export const CHAIN_TYPES = ['solana', 'ethereum'] as const;
export type ChainType = (typeof CHAIN_TYPES)[number];
export const ChainTypeEnum = z.enum(CHAIN_TYPES);

export const NETWORK_TYPES = [
  // Solana
  'mainnet', 'devnet', 'testnet',
  // EVM Tier 1
  'ethereum-mainnet', 'ethereum-sepolia',
  'polygon-mainnet', 'polygon-amoy',
  'arbitrum-mainnet', 'arbitrum-sepolia',
  'optimism-mainnet', 'optimism-sepolia',
  'base-mainnet', 'base-sepolia',
] as const;
export type NetworkType = (typeof NETWORK_TYPES)[number];
export const NetworkTypeEnum = z.enum(NETWORK_TYPES);

export const SOLANA_NETWORK_TYPES = ['mainnet', 'devnet', 'testnet'] as const;
export type SolanaNetworkType = (typeof SOLANA_NETWORK_TYPES)[number];

export const EVM_NETWORK_TYPES = [
  'ethereum-mainnet', 'ethereum-sepolia',
  'polygon-mainnet', 'polygon-amoy',
  'arbitrum-mainnet', 'arbitrum-sepolia',
  'optimism-mainnet', 'optimism-sepolia',
  'base-mainnet', 'base-sepolia',
] as const;
export type EvmNetworkType = (typeof EVM_NETWORK_TYPES)[number];
export const EvmNetworkTypeEnum = z.enum(EVM_NETWORK_TYPES);

/**
 * Cross-validate chain + network combination.
 * Solana agents must use Solana networks (mainnet/devnet/testnet).
 * Ethereum agents must use EVM networks (ethereum-mainnet etc).
 * Throws Error on mismatch. Caller (daemon route) converts to WAIaaSError('VALIDATION_ERROR').
 */
export function validateChainNetwork(chain: ChainType, network: NetworkType): void {
  if (chain === 'solana') {
    if (!(SOLANA_NETWORK_TYPES as readonly string[]).includes(network)) {
      throw new Error(`Invalid network '${network}' for chain 'solana'. Valid: ${SOLANA_NETWORK_TYPES.join(', ')}`);
    }
  } else if (chain === 'ethereum') {
    if (!(EVM_NETWORK_TYPES as readonly string[]).includes(network)) {
      throw new Error(`Invalid network '${network}' for chain 'ethereum'. Valid EVM networks: ${EVM_NETWORK_TYPES.join(', ')}`);
    }
  }
}
