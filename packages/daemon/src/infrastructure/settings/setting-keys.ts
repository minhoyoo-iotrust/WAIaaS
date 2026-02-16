/**
 * Setting key definitions (SSoT) for daemon operational settings.
 *
 * Each setting has a key (DB storage), category, configPath (for config.toml lookup),
 * defaultValue (matching DaemonConfigSchema .default()), and isCredential flag.
 *
 * Categories: notifications, rpc, security, daemon, walletconnect, oracle, display, autostop
 *
 * @see packages/daemon/src/infrastructure/config/loader.ts for DaemonConfigSchema defaults
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettingDefinition {
  /** DB storage key, e.g. 'notifications.telegram_bot_token' */
  key: string;
  /** Category for grouping, e.g. 'notifications' */
  category: string;
  /** Path in config.toml, e.g. 'notifications.telegram_bot_token' */
  configPath: string;
  /** Default value (string, matching DaemonConfigSchema .default()) */
  defaultValue: string;
  /** If true, value is AES-GCM encrypted before DB storage */
  isCredential: boolean;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const SETTING_CATEGORIES = [
  'notifications',
  'rpc',
  'security',
  'daemon',
  'walletconnect',
  'oracle',
  'display',
  'autostop',
  'monitoring',
] as const;

export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Setting Definitions
// ---------------------------------------------------------------------------

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  // --- notifications category ---
  { key: 'notifications.enabled', category: 'notifications', configPath: 'notifications.enabled', defaultValue: 'false', isCredential: false },
  { key: 'notifications.telegram_bot_token', category: 'notifications', configPath: 'notifications.telegram_bot_token', defaultValue: '', isCredential: true },
  { key: 'notifications.telegram_chat_id', category: 'notifications', configPath: 'notifications.telegram_chat_id', defaultValue: '', isCredential: false },
  { key: 'notifications.discord_webhook_url', category: 'notifications', configPath: 'notifications.discord_webhook_url', defaultValue: '', isCredential: true },
  { key: 'notifications.ntfy_server', category: 'notifications', configPath: 'notifications.ntfy_server', defaultValue: 'https://ntfy.sh', isCredential: false },
  { key: 'notifications.ntfy_topic', category: 'notifications', configPath: 'notifications.ntfy_topic', defaultValue: '', isCredential: false },
  { key: 'notifications.slack_webhook_url', category: 'notifications', configPath: 'notifications.slack_webhook_url', defaultValue: '', isCredential: true },
  { key: 'notifications.locale', category: 'notifications', configPath: 'notifications.locale', defaultValue: 'en', isCredential: false },
  { key: 'notifications.rate_limit_rpm', category: 'notifications', configPath: 'notifications.rate_limit_rpm', defaultValue: '20', isCredential: false },

  // --- rpc category (Solana 3 + EVM 10 + evm_default_network) ---
  { key: 'rpc.solana_mainnet', category: 'rpc', configPath: 'rpc.solana_mainnet', defaultValue: 'https://api.mainnet-beta.solana.com', isCredential: false },
  { key: 'rpc.solana_devnet', category: 'rpc', configPath: 'rpc.solana_devnet', defaultValue: 'https://api.devnet.solana.com', isCredential: false },
  { key: 'rpc.solana_testnet', category: 'rpc', configPath: 'rpc.solana_testnet', defaultValue: 'https://api.testnet.solana.com', isCredential: false },
  { key: 'rpc.evm_ethereum_mainnet', category: 'rpc', configPath: 'rpc.evm_ethereum_mainnet', defaultValue: 'https://eth.drpc.org', isCredential: false },
  { key: 'rpc.evm_ethereum_sepolia', category: 'rpc', configPath: 'rpc.evm_ethereum_sepolia', defaultValue: 'https://sepolia.drpc.org', isCredential: false },
  { key: 'rpc.evm_polygon_mainnet', category: 'rpc', configPath: 'rpc.evm_polygon_mainnet', defaultValue: 'https://polygon.drpc.org', isCredential: false },
  { key: 'rpc.evm_polygon_amoy', category: 'rpc', configPath: 'rpc.evm_polygon_amoy', defaultValue: 'https://polygon-amoy.drpc.org', isCredential: false },
  { key: 'rpc.evm_arbitrum_mainnet', category: 'rpc', configPath: 'rpc.evm_arbitrum_mainnet', defaultValue: 'https://arbitrum.drpc.org', isCredential: false },
  { key: 'rpc.evm_arbitrum_sepolia', category: 'rpc', configPath: 'rpc.evm_arbitrum_sepolia', defaultValue: 'https://arbitrum-sepolia.drpc.org', isCredential: false },
  { key: 'rpc.evm_optimism_mainnet', category: 'rpc', configPath: 'rpc.evm_optimism_mainnet', defaultValue: 'https://optimism.drpc.org', isCredential: false },
  { key: 'rpc.evm_optimism_sepolia', category: 'rpc', configPath: 'rpc.evm_optimism_sepolia', defaultValue: 'https://optimism-sepolia.drpc.org', isCredential: false },
  { key: 'rpc.evm_base_mainnet', category: 'rpc', configPath: 'rpc.evm_base_mainnet', defaultValue: 'https://base.drpc.org', isCredential: false },
  { key: 'rpc.evm_base_sepolia', category: 'rpc', configPath: 'rpc.evm_base_sepolia', defaultValue: 'https://base-sepolia.drpc.org', isCredential: false },
  { key: 'rpc.evm_default_network', category: 'rpc', configPath: 'rpc.evm_default_network', defaultValue: 'ethereum-sepolia', isCredential: false },

  // --- security category ---
  { key: 'security.session_ttl', category: 'security', configPath: 'security.session_ttl', defaultValue: '86400', isCredential: false },
  { key: 'security.max_sessions_per_wallet', category: 'security', configPath: 'security.max_sessions_per_wallet', defaultValue: '5', isCredential: false },
  { key: 'security.max_pending_tx', category: 'security', configPath: 'security.max_pending_tx', defaultValue: '10', isCredential: false },
  { key: 'security.rate_limit_global_ip_rpm', category: 'security', configPath: 'security.rate_limit_global_ip_rpm', defaultValue: '1000', isCredential: false },
  { key: 'security.rate_limit_session_rpm', category: 'security', configPath: 'security.rate_limit_session_rpm', defaultValue: '300', isCredential: false },
  { key: 'security.rate_limit_tx_rpm', category: 'security', configPath: 'security.rate_limit_tx_rpm', defaultValue: '10', isCredential: false },
  { key: 'security.policy_defaults_delay_seconds', category: 'security', configPath: 'security.policy_defaults_delay_seconds', defaultValue: '300', isCredential: false },
  { key: 'security.policy_defaults_approval_timeout', category: 'security', configPath: 'security.policy_defaults_approval_timeout', defaultValue: '3600', isCredential: false },

  // --- policy default deny toggles (Phase 116) ---
  { key: 'policy.default_deny_tokens', category: 'security', configPath: 'security.default_deny_tokens', defaultValue: 'true', isCredential: false },
  { key: 'policy.default_deny_contracts', category: 'security', configPath: 'security.default_deny_contracts', defaultValue: 'true', isCredential: false },
  { key: 'policy.default_deny_spenders', category: 'security', configPath: 'security.default_deny_spenders', defaultValue: 'true', isCredential: false },

  // --- daemon category ---
  { key: 'daemon.log_level', category: 'daemon', configPath: 'daemon.log_level', defaultValue: 'info', isCredential: false },

  // --- walletconnect category ---
  { key: 'walletconnect.project_id', category: 'walletconnect', configPath: 'walletconnect.project_id', defaultValue: '', isCredential: false },

  // --- oracle category ---
  { key: 'oracle.coingecko_api_key', category: 'oracle', configPath: 'oracle.coingecko_api_key', defaultValue: '', isCredential: true },
  { key: 'oracle.cross_validation_threshold', category: 'oracle', configPath: 'oracle.cross_validation_threshold', defaultValue: '5', isCredential: false },

  // --- display category ---
  { key: 'display.currency', category: 'display', configPath: 'display.currency', defaultValue: 'USD', isCredential: false },

  // --- autostop category (AUTO-05 runtime-overridable) ---
  { key: 'autostop.consecutive_failures_threshold', category: 'autostop', configPath: 'security.autostop_consecutive_failures_threshold', defaultValue: '5', isCredential: false },
  { key: 'autostop.unusual_activity_threshold', category: 'autostop', configPath: 'security.autostop_unusual_activity_threshold', defaultValue: '20', isCredential: false },
  { key: 'autostop.unusual_activity_window_sec', category: 'autostop', configPath: 'security.autostop_unusual_activity_window_sec', defaultValue: '300', isCredential: false },
  { key: 'autostop.idle_timeout_sec', category: 'autostop', configPath: 'security.autostop_idle_timeout_sec', defaultValue: '3600', isCredential: false },
  { key: 'autostop.idle_check_interval_sec', category: 'autostop', configPath: 'security.autostop_idle_check_interval_sec', defaultValue: '60', isCredential: false },
  { key: 'autostop.enabled', category: 'autostop', configPath: 'security.autostop_enabled', defaultValue: 'true', isCredential: false },

  // --- monitoring category (BMON-05 runtime-overridable) ---
  { key: 'monitoring.check_interval_sec', category: 'monitoring', configPath: 'security.monitoring_check_interval_sec', defaultValue: '300', isCredential: false },
  { key: 'monitoring.low_balance_threshold_sol', category: 'monitoring', configPath: 'security.monitoring_low_balance_threshold_sol', defaultValue: '0.01', isCredential: false },
  { key: 'monitoring.low_balance_threshold_eth', category: 'monitoring', configPath: 'security.monitoring_low_balance_threshold_eth', defaultValue: '0.005', isCredential: false },
  { key: 'monitoring.cooldown_hours', category: 'monitoring', configPath: 'security.monitoring_cooldown_hours', defaultValue: '24', isCredential: false },
  { key: 'monitoring.enabled', category: 'monitoring', configPath: 'security.monitoring_enabled', defaultValue: 'true', isCredential: false },
] as const;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Map from key -> SettingDefinition for O(1) lookup */
const definitionMap = new Map<string, SettingDefinition>(
  SETTING_DEFINITIONS.map((def) => [def.key, def]),
);

/** Get a setting definition by key, or undefined if not found */
export function getSettingDefinition(key: string): SettingDefinition | undefined {
  return definitionMap.get(key);
}
