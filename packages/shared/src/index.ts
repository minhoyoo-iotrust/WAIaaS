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

  // Ripple (XRPL) network types
  RIPPLE_NETWORK_TYPES,
  type RippleNetworkType,

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
  RIPPLE_RPC_SETTING_KEYS,
  RPC_KEY_LABELS,
} from './networks.js';

export {
  // Policy constants
  POLICY_TYPES,
  type PolicyType,
  POLICY_TYPE_LABELS,
  POLICY_DESCRIPTIONS,
  POLICY_TIERS,
  type PolicyTier,

  // Credential constants
  CREDENTIAL_TYPES,
  type CredentialType,
  CREDENTIAL_TYPE_LABELS,

  // Error message constants
  ERROR_MESSAGE_MAP,
  SERVER_MESSAGE_PREFERRED_CODES,
} from './constants.js';
