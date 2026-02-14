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

// ─── EnvironmentType SSoT (Zod 파생 체인 Step 1~3) ─────────────

export const ENVIRONMENT_TYPES = ['testnet', 'mainnet'] as const;
export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];
export const EnvironmentTypeEnum = z.enum(ENVIRONMENT_TYPES);

// ─── Environment-Network Mapping Constants ──────────────────────

/**
 * Environment-network mapping: which networks are allowed in each environment.
 * Key format: `${chain}:${environment}`
 */
export const ENVIRONMENT_NETWORK_MAP: Record<
  `${ChainType}:${EnvironmentType}`,
  readonly NetworkType[]
> = {
  'solana:mainnet': ['mainnet'],
  'solana:testnet': ['devnet', 'testnet'],
  'ethereum:mainnet': [
    'ethereum-mainnet',
    'polygon-mainnet',
    'arbitrum-mainnet',
    'optimism-mainnet',
    'base-mainnet',
  ],
  'ethereum:testnet': [
    'ethereum-sepolia',
    'polygon-amoy',
    'arbitrum-sepolia',
    'optimism-sepolia',
    'base-sepolia',
  ],
} as const;

/**
 * Default network for each chain+environment combination.
 */
export const ENVIRONMENT_DEFAULT_NETWORK: Record<
  `${ChainType}:${EnvironmentType}`,
  NetworkType
> = {
  'solana:mainnet': 'mainnet',
  'solana:testnet': 'devnet',
  'ethereum:mainnet': 'ethereum-mainnet',
  'ethereum:testnet': 'ethereum-sepolia',
} as const;

// ─── Environment Mapping Functions ──────────────────────────────

/**
 * Get allowed networks for a chain+environment combination.
 */
export function getNetworksForEnvironment(
  chain: ChainType,
  env: EnvironmentType,
): readonly NetworkType[] {
  const key = `${chain}:${env}` as const;
  return ENVIRONMENT_NETWORK_MAP[key];
}

/**
 * Get the default network for a chain+environment combination.
 */
export function getDefaultNetwork(
  chain: ChainType,
  env: EnvironmentType,
): NetworkType {
  const key = `${chain}:${env}` as const;
  return ENVIRONMENT_DEFAULT_NETWORK[key];
}

/**
 * Mainnet networks (exhaustive list for deriveEnvironment).
 */
const MAINNET_NETWORKS: readonly NetworkType[] = [
  'mainnet',
  'ethereum-mainnet',
  'polygon-mainnet',
  'arbitrum-mainnet',
  'optimism-mainnet',
  'base-mainnet',
];

/**
 * Derive environment from a network value (reverse mapping).
 * Used in DB migration CASE WHEN logic and runtime resolution.
 */
export function deriveEnvironment(network: NetworkType): EnvironmentType {
  if ((MAINNET_NETWORKS as readonly string[]).includes(network)) {
    return 'mainnet';
  }
  return 'testnet';
}

/**
 * Validate that a network is allowed for a given chain+environment combination.
 * Throws Error on mismatch. Caller (daemon route) converts to WAIaaSError('VALIDATION_ERROR').
 */
export function validateNetworkEnvironment(
  chain: ChainType,
  env: EnvironmentType,
  network: NetworkType,
): void {
  const allowed = getNetworksForEnvironment(chain, env);
  if (!(allowed as readonly string[]).includes(network)) {
    throw new Error(
      `Invalid network '${network}' for chain '${chain}' in environment '${env}'. Valid: ${allowed.join(', ')}`,
    );
  }
}
