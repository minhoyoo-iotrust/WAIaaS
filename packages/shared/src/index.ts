// @waiaas/shared — pure TypeScript constants shared across packages
// No native dependencies, safe for browser (Admin UI) and Node.js (core/daemon).

export {
  // Chain types
  CHAIN_TYPES,
  type ChainType,

  // Network types (all)
  NETWORK_TYPES,
  type NetworkType,

  // Solana network types
  SOLANA_NETWORK_TYPES,
  type SolanaNetworkType,

  // EVM network types
  EVM_NETWORK_TYPES,
  type EvmNetworkType,

  // Environment types
  ENVIRONMENT_TYPES,
  type EnvironmentType,

  // Environment-network mapping
  ENVIRONMENT_NETWORK_MAP,

  // Validation
  validateChainNetwork,

  // Display helpers
  NETWORK_DISPLAY_NAMES,
  NETWORK_NATIVE_SYMBOL,

  // Admin UI derived helpers
  EVM_NETWORK_OPTIONS,
  EVM_RPC_SETTING_KEYS,
  SOLANA_RPC_SETTING_KEYS,
  RPC_KEY_LABELS,
} from './networks.js';
