import { z } from 'zod';

import { CAIP2_TO_NETWORK } from '../caip/network-map.js';

// ─── Import shared constants (SSoT from @waiaas/shared) ─────────────────────
import {
  CHAIN_TYPES,
  type ChainType,
  NETWORK_TYPES,
  type NetworkType,
  SOLANA_NETWORK_TYPES,
  type SolanaNetworkType,
  EVM_NETWORK_TYPES,
  type EvmNetworkType,
  RIPPLE_NETWORK_TYPES,
  type RippleNetworkType,
  ENVIRONMENT_TYPES,
  type EnvironmentType,
  ENVIRONMENT_NETWORK_MAP,
  validateChainNetwork,
  NETWORK_DISPLAY_NAMES,
  NETWORK_NATIVE_SYMBOL,
  EVM_NETWORK_OPTIONS,
  EVM_RPC_SETTING_KEYS,
  SOLANA_RPC_SETTING_KEYS,
  RIPPLE_RPC_SETTING_KEYS,
  RPC_KEY_LABELS,
} from '@waiaas/shared';

// Re-export shared constants so downstream packages (SDK, daemon) continue to work
export {
  CHAIN_TYPES,
  type ChainType,
  NETWORK_TYPES,
  type NetworkType,
  SOLANA_NETWORK_TYPES,
  type SolanaNetworkType,
  EVM_NETWORK_TYPES,
  type EvmNetworkType,
  RIPPLE_NETWORK_TYPES,
  type RippleNetworkType,
  ENVIRONMENT_TYPES,
  type EnvironmentType,
  ENVIRONMENT_NETWORK_MAP,
  validateChainNetwork,
  NETWORK_DISPLAY_NAMES,
  NETWORK_NATIVE_SYMBOL,
  EVM_NETWORK_OPTIONS,
  EVM_RPC_SETTING_KEYS,
  SOLANA_RPC_SETTING_KEYS,
  RIPPLE_RPC_SETTING_KEYS,
  RPC_KEY_LABELS,
};

// ─── Zod schemas derived from shared constants ──────────────────────────────
export const ChainTypeEnum = z.enum(CHAIN_TYPES);
export const NetworkTypeEnum = z.enum(NETWORK_TYPES);
export const EvmNetworkTypeEnum = z.enum(EVM_NETWORK_TYPES);
export const EnvironmentTypeEnum = z.enum(ENVIRONMENT_TYPES);

/**
 * Single network for each chain+environment combination.
 * Solana environments have exactly one network (auto-resolvable).
 * EVM environments have multiple networks (null = must be specified explicitly).
 */
export const ENVIRONMENT_SINGLE_NETWORK: Record<
  `${ChainType}:${EnvironmentType}`,
  NetworkType | null
> = {
  'solana:mainnet': 'solana-mainnet',
  'solana:testnet': 'solana-devnet',
  'ethereum:mainnet': null,
  'ethereum:testnet': null,
  'ripple:mainnet': 'xrpl-mainnet',
  'ripple:testnet': null, // testnet and devnet -- must be specified explicitly
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
 * Get the single network for a chain+environment combination.
 * Returns the network for Solana (single network per environment).
 * Returns null for EVM (multiple networks, must be specified explicitly).
 */
export function getSingleNetwork(
  chain: ChainType,
  env: EnvironmentType,
): NetworkType | null {
  const key = `${chain}:${env}` as const;
  return ENVIRONMENT_SINGLE_NETWORK[key];
}

/**
 * Mainnet networks (exhaustive list for deriveEnvironment).
 */
const MAINNET_NETWORKS: readonly NetworkType[] = [
  'solana-mainnet',
  'ethereum-mainnet',
  'polygon-mainnet',
  'arbitrum-mainnet',
  'optimism-mainnet',
  'base-mainnet',
  'hyperevm-mainnet',
  'xrpl-mainnet',
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

// ─── Legacy Network Name Normalization ─────────────────────────

/**
 * Legacy Solana network name mapping.
 * Auto-converts bare 'mainnet'/'devnet'/'testnet' to 'solana-mainnet'/'solana-devnet'/'solana-testnet'.
 * Emits deprecation warning on first use.
 */
const LEGACY_SOLANA_NETWORK_MAP: Record<string, NetworkType> = {
  'mainnet': 'solana-mainnet',
  'devnet': 'solana-devnet',
  'testnet': 'solana-testnet',
};

let _legacyWarned = false;

/**
 * Normalize a network input string, converting legacy Solana names to new format.
 * Returns the canonical NetworkType if valid, or the input unchanged if not a legacy name.
 * Emits a deprecation warning to stderr on first legacy conversion.
 */
export function normalizeNetworkInput(network: string): string {
  // 1. CAIP-2 mapping (standard format, no deprecation warning)
  const caip2Entry = CAIP2_TO_NETWORK[network];
  if (caip2Entry) {
    return caip2Entry.network;
  }

  // 2. Legacy Solana name mapping (deprecated)
  const mapped = LEGACY_SOLANA_NETWORK_MAP[network];
  if (mapped) {
    if (!_legacyWarned) {
      console.warn(
        `[WAIaaS DEPRECATION] Network name '${network}' is deprecated. Use '${mapped}' instead. ` +
        `Legacy names will be removed in a future release.`,
      );
      _legacyWarned = true;
    }
    return mapped;
  }

  // 3. Passthrough (canonical names or unknown strings)
  return network;
}

/** Reset the legacy warning flag (for testing only). */
export function _resetLegacyWarning(): void {
  _legacyWarned = false;
}

/**
 * Zod schema that accepts both legacy and new Solana network names.
 * Preprocesses the input through normalizeNetworkInput() before validating
 * against NetworkTypeEnum. Use for external API inputs (REST, MCP).
 * Internal code should use NetworkTypeEnum directly (strict validation).
 */
export const NetworkTypeEnumWithLegacy = z.preprocess(
  (val) => (typeof val === 'string' ? normalizeNetworkInput(val) : val),
  NetworkTypeEnum,
);
