// ---------------------------------------------------------------------------
// Network & Chain Constants — Single Source of Truth
// Pure TypeScript, no external dependencies.
// ---------------------------------------------------------------------------

// ─── Chain Types ─────────────────────────────────────────────────────────────

export const CHAIN_TYPES = ['solana', 'ethereum', 'ripple'] as const;
export type ChainType = (typeof CHAIN_TYPES)[number];

// ─── Network Types (all supported networks) ─────────────────────────────────

export const NETWORK_TYPES = [
  // Solana
  'solana-mainnet', 'solana-devnet', 'solana-testnet',
  // EVM Tier 1
  'ethereum-mainnet', 'ethereum-sepolia',
  'polygon-mainnet', 'polygon-amoy',
  'arbitrum-mainnet', 'arbitrum-sepolia',
  'optimism-mainnet', 'optimism-sepolia',
  'base-mainnet', 'base-sepolia',
  // HyperEVM (Hyperliquid)
  'hyperevm-mainnet', 'hyperevm-testnet',
  // XRPL (Ripple)
  'xrpl-mainnet', 'xrpl-testnet', 'xrpl-devnet',
] as const;
export type NetworkType = (typeof NETWORK_TYPES)[number];

// ─── Solana Network Types ───────────────────────────────────────────────────

export const SOLANA_NETWORK_TYPES = ['solana-mainnet', 'solana-devnet', 'solana-testnet'] as const;
export type SolanaNetworkType = (typeof SOLANA_NETWORK_TYPES)[number];

// ─── Ripple Network Types ───────────────────────────────────────────────────

export const RIPPLE_NETWORK_TYPES = ['xrpl-mainnet', 'xrpl-testnet', 'xrpl-devnet'] as const;
export type RippleNetworkType = (typeof RIPPLE_NETWORK_TYPES)[number];

// ─── EVM Network Types ──────────────────────────────────────────────────────

export const EVM_NETWORK_TYPES = [
  'ethereum-mainnet', 'ethereum-sepolia',
  'polygon-mainnet', 'polygon-amoy',
  'arbitrum-mainnet', 'arbitrum-sepolia',
  'optimism-mainnet', 'optimism-sepolia',
  'base-mainnet', 'base-sepolia',
  'hyperevm-mainnet', 'hyperevm-testnet',
] as const;
export type EvmNetworkType = (typeof EVM_NETWORK_TYPES)[number];

// ─── Environment Types ──────────────────────────────────────────────────────

export const ENVIRONMENT_TYPES = ['testnet', 'mainnet'] as const;
export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];

// ─── Environment-Network Mapping ────────────────────────────────────────────

export const ENVIRONMENT_NETWORK_MAP: Record<
  `${ChainType}:${EnvironmentType}`,
  readonly NetworkType[]
> = {
  'solana:mainnet': ['solana-mainnet'],
  'solana:testnet': ['solana-devnet', 'solana-testnet'],
  'ethereum:mainnet': [
    'ethereum-mainnet',
    'polygon-mainnet',
    'arbitrum-mainnet',
    'optimism-mainnet',
    'base-mainnet',
    'hyperevm-mainnet',
  ],
  'ethereum:testnet': [
    'ethereum-sepolia',
    'polygon-amoy',
    'arbitrum-sepolia',
    'optimism-sepolia',
    'base-sepolia',
    'hyperevm-testnet',
  ],
  'ripple:mainnet': ['xrpl-mainnet'],
  'ripple:testnet': ['xrpl-testnet', 'xrpl-devnet'],
} as const;

// ─── Validate Chain + Network ───────────────────────────────────────────────

/**
 * Cross-validate chain + network combination.
 * Solana wallets must use Solana networks; Ethereum wallets must use EVM networks.
 * Throws Error on mismatch.
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
  } else if (chain === 'ripple') {
    if (!(RIPPLE_NETWORK_TYPES as readonly string[]).includes(network)) {
      throw new Error(`Invalid network '${network}' for chain 'ripple'. Valid: ${RIPPLE_NETWORK_TYPES.join(', ')}`);
    }
  }
}

// ─── Network Display Names ──────────────────────────────────────────────────

/**
 * Human-readable display names for all networks.
 * Used by Admin UI and anywhere a user-facing label is needed.
 */
export const NETWORK_DISPLAY_NAMES: Record<NetworkType, string> = {
  'solana-mainnet': 'Solana Mainnet',
  'solana-devnet': 'Solana Devnet',
  'solana-testnet': 'Solana Testnet',
  'ethereum-mainnet': 'Ethereum Mainnet',
  'ethereum-sepolia': 'Ethereum Sepolia',
  'polygon-mainnet': 'Polygon Mainnet',
  'polygon-amoy': 'Polygon Amoy',
  'arbitrum-mainnet': 'Arbitrum Mainnet',
  'arbitrum-sepolia': 'Arbitrum Sepolia',
  'optimism-mainnet': 'Optimism Mainnet',
  'optimism-sepolia': 'Optimism Sepolia',
  'base-mainnet': 'Base Mainnet',
  'base-sepolia': 'Base Sepolia',
  'hyperevm-mainnet': 'HyperEVM Mainnet',
  'hyperevm-testnet': 'HyperEVM Testnet',
  'xrpl-mainnet': 'XRPL Mainnet',
  'xrpl-testnet': 'XRPL Testnet',
  'xrpl-devnet': 'XRPL Devnet',
};

// ─── Network Native Token Symbols ───────────────────────────────────────────

/**
 * Native token symbol for each network.
 * Used by Admin UI policy forms and transaction displays.
 */
export const NETWORK_NATIVE_SYMBOL: Record<NetworkType, string> = {
  'solana-mainnet': 'SOL',
  'solana-devnet': 'SOL',
  'solana-testnet': 'SOL',
  'ethereum-mainnet': 'ETH',
  'ethereum-sepolia': 'ETH',
  'polygon-mainnet': 'POL',
  'polygon-amoy': 'POL',
  'arbitrum-mainnet': 'ETH',
  'arbitrum-sepolia': 'ETH',
  'optimism-mainnet': 'ETH',
  'optimism-sepolia': 'ETH',
  'base-mainnet': 'ETH',
  'base-sepolia': 'ETH',
  'hyperevm-mainnet': 'HYPE',
  'hyperevm-testnet': 'HYPE',
  'xrpl-mainnet': 'XRP',
  'xrpl-testnet': 'XRP',
  'xrpl-devnet': 'XRP',
};

// ─── Derived Helpers for Admin UI ───────────────────────────────────────────

/**
 * EVM network options for <select> dropdowns.
 * Derived from EVM_NETWORK_TYPES + NETWORK_DISPLAY_NAMES.
 */
export const EVM_NETWORK_OPTIONS: readonly { label: string; value: EvmNetworkType }[] =
  EVM_NETWORK_TYPES.map((n) => ({ label: NETWORK_DISPLAY_NAMES[n], value: n }));

/**
 * RPC setting keys for EVM networks (underscore format used in settings API).
 * e.g. 'ethereum-mainnet' → 'evm_ethereum_mainnet'
 */
export const EVM_RPC_SETTING_KEYS: readonly string[] =
  EVM_NETWORK_TYPES.map((n) => `evm_${n.replace(/-/g, '_')}`);

/**
 * RPC setting keys for Solana networks (underscore format used in settings API).
 * e.g. 'solana-mainnet' → 'solana_mainnet'
 */
export const SOLANA_RPC_SETTING_KEYS: readonly string[] =
  SOLANA_NETWORK_TYPES.map((n) => n.replace(/-/g, '_'));

/**
 * RPC setting keys for Ripple (XRPL) networks (underscore format used in settings API).
 * e.g. 'xrpl-mainnet' → 'xrpl_mainnet'
 */
export const RIPPLE_RPC_SETTING_KEYS: readonly string[] =
  RIPPLE_NETWORK_TYPES.map((n) => n.replace(/-/g, '_'));

/**
 * Map from RPC setting key (underscore format) to human-readable label.
 * Covers both Solana and EVM keys for the keyToLabel function.
 */
export const RPC_KEY_LABELS: Record<string, string> = Object.fromEntries([
  ...SOLANA_NETWORK_TYPES.map((n) => [n.replace(/-/g, '_'), NETWORK_DISPLAY_NAMES[n]]),
  ...EVM_NETWORK_TYPES.map((n) => [`evm_${n.replace(/-/g, '_')}`, NETWORK_DISPLAY_NAMES[n]]),
  ...RIPPLE_NETWORK_TYPES.map((n) => [n.replace(/-/g, '_'), NETWORK_DISPLAY_NAMES[n]]),
]);
