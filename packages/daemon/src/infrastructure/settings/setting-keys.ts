/**
 * Setting key definitions (SSoT) for daemon operational settings.
 *
 * Each setting has a key (DB storage), category, configPath (for config.toml lookup),
 * defaultValue (matching DaemonConfigSchema .default()), and isCredential flag.
 *
 * Categories: notifications, rpc, security, daemon, walletconnect, oracle, display, autostop, monitoring, telegram, signing_sdk, incoming, actions
 *
 * @see packages/daemon/src/infrastructure/config/loader.ts for DaemonConfigSchema defaults
 */

import { z } from 'zod';

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
  'telegram',
  'signing_sdk',
  'incoming',
  'actions',
  'policy',
  'gas_condition',
  'rpc_pool',
  'position_tracker',
  'smart_account',
  'erc8128',
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
  // notifications.ntfy_topic removed in v29.10 -- per-wallet topics are now stored in wallet_apps table
  { key: 'notifications.slack_webhook_url', category: 'notifications', configPath: 'notifications.slack_webhook_url', defaultValue: '', isCredential: true },
  { key: 'notifications.locale', category: 'notifications', configPath: 'notifications.locale', defaultValue: 'en', isCredential: false },
  { key: 'notifications.rate_limit_rpm', category: 'notifications', configPath: 'notifications.rate_limit_rpm', defaultValue: '20', isCredential: false },
  { key: 'notifications.notify_categories', category: 'notifications', configPath: 'notifications.notify_categories', defaultValue: '[]', isCredential: false },
  { key: 'notifications.notify_events', category: 'notifications', configPath: 'notifications.notify_events', defaultValue: '[]', isCredential: false },

  // --- rpc category (Solana 3 + EVM 10) ---
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

  // --- security category ---
  { key: 'security.max_sessions_per_wallet', category: 'security', configPath: 'security.max_sessions_per_wallet', defaultValue: '5', isCredential: false },
  { key: 'security.max_pending_tx', category: 'security', configPath: 'security.max_pending_tx', defaultValue: '10', isCredential: false },
  { key: 'security.rate_limit_global_ip_rpm', category: 'security', configPath: 'security.rate_limit_global_ip_rpm', defaultValue: '1000', isCredential: false },
  { key: 'security.rate_limit_session_rpm', category: 'security', configPath: 'security.rate_limit_session_rpm', defaultValue: '300', isCredential: false },
  { key: 'security.rate_limit_tx_rpm', category: 'security', configPath: 'security.rate_limit_tx_rpm', defaultValue: '10', isCredential: false },
  { key: 'security.policy_defaults_delay_seconds', category: 'security', configPath: 'security.policy_defaults_delay_seconds', defaultValue: '300', isCredential: false },
  { key: 'security.policy_defaults_approval_timeout', category: 'security', configPath: 'security.policy_defaults_approval_timeout', defaultValue: '3600', isCredential: false },

  // --- policy default deny toggles (Phase 116) ---
  { key: 'policy.default_deny_tokens', category: 'policy', configPath: 'security.default_deny_tokens', defaultValue: 'true', isCredential: false },
  { key: 'policy.default_deny_contracts', category: 'policy', configPath: 'security.default_deny_contracts', defaultValue: 'true', isCredential: false },
  { key: 'policy.default_deny_spenders', category: 'policy', configPath: 'security.default_deny_spenders', defaultValue: 'true', isCredential: false },
  { key: 'policy.default_deny_x402_domains', category: 'policy', configPath: 'security.default_deny_x402_domains', defaultValue: 'true', isCredential: false },
  { key: 'policy.default_deny_erc8128_domains', category: 'policy', configPath: 'security.default_deny_erc8128_domains', defaultValue: 'true', isCredential: false },

  // --- daemon category ---
  { key: 'daemon.log_level', category: 'daemon', configPath: 'daemon.log_level', defaultValue: 'info', isCredential: false },

  // --- walletconnect category ---
  { key: 'walletconnect.project_id', category: 'walletconnect', configPath: 'walletconnect.project_id', defaultValue: '', isCredential: false },
  { key: 'walletconnect.relay_url', category: 'walletconnect', configPath: 'walletconnect.relay_url', defaultValue: 'wss://relay.walletconnect.com', isCredential: false },

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

  // --- autostop per-rule enable (PLUG-04) ---
  { key: 'autostop.rule.consecutive_failures.enabled', category: 'autostop', configPath: 'security.autostop_rule_consecutive_failures_enabled', defaultValue: 'true', isCredential: false },
  { key: 'autostop.rule.unusual_activity.enabled', category: 'autostop', configPath: 'security.autostop_rule_unusual_activity_enabled', defaultValue: 'true', isCredential: false },
  { key: 'autostop.rule.idle_timeout.enabled', category: 'autostop', configPath: 'security.autostop_rule_idle_timeout_enabled', defaultValue: 'true', isCredential: false },

  // --- monitoring category (BMON-05 runtime-overridable) ---
  { key: 'monitoring.check_interval_sec', category: 'monitoring', configPath: 'security.monitoring_check_interval_sec', defaultValue: '300', isCredential: false },
  { key: 'monitoring.low_balance_threshold_sol', category: 'monitoring', configPath: 'security.monitoring_low_balance_threshold_sol', defaultValue: '0.01', isCredential: false },
  { key: 'monitoring.low_balance_threshold_eth', category: 'monitoring', configPath: 'security.monitoring_low_balance_threshold_eth', defaultValue: '0.005', isCredential: false },
  { key: 'monitoring.cooldown_hours', category: 'monitoring', configPath: 'security.monitoring_cooldown_hours', defaultValue: '24', isCredential: false },
  { key: 'monitoring.enabled', category: 'monitoring', configPath: 'security.monitoring_enabled', defaultValue: 'true', isCredential: false },

  // --- telegram category (Bot service settings) ---
  { key: 'telegram.bot_token', category: 'telegram', configPath: 'telegram.bot_token', defaultValue: '', isCredential: true },
  { key: 'telegram.locale', category: 'telegram', configPath: 'telegram.locale', defaultValue: 'en', isCredential: false },

  // --- signing_sdk category (CONF-01: 6 operational keys, CONF-02: 1 wallets JSON key) ---
  { key: 'signing_sdk.enabled', category: 'signing_sdk', configPath: 'signing_sdk.enabled', defaultValue: 'false', isCredential: false },
  { key: 'signing_sdk.request_expiry_min', category: 'signing_sdk', configPath: 'signing_sdk.request_expiry_min', defaultValue: '30', isCredential: false },
  { key: 'signing_sdk.preferred_channel', category: 'signing_sdk', configPath: 'signing_sdk.preferred_channel', defaultValue: 'ntfy', isCredential: false },
  { key: 'signing_sdk.preferred_wallet', category: 'signing_sdk', configPath: 'signing_sdk.preferred_wallet', defaultValue: '', isCredential: false },
  { key: 'signing_sdk.ntfy_request_topic_prefix', category: 'signing_sdk', configPath: 'signing_sdk.ntfy_request_topic_prefix', defaultValue: 'waiaas-sign', isCredential: false },
  { key: 'signing_sdk.ntfy_response_topic_prefix', category: 'signing_sdk', configPath: 'signing_sdk.ntfy_response_topic_prefix', defaultValue: 'waiaas-response', isCredential: false },
  { key: 'signing_sdk.wallets', category: 'signing_sdk', configPath: 'signing_sdk.wallets', defaultValue: '[]', isCredential: false },
  { key: 'signing_sdk.notifications_enabled', category: 'signing_sdk', configPath: 'signing_sdk.notifications_enabled', defaultValue: 'true', isCredential: false },

  // --- incoming category (Incoming TX monitor settings) ---
  { key: 'incoming.enabled', category: 'incoming', configPath: 'incoming.enabled', defaultValue: 'false', isCredential: false },
  { key: 'incoming.poll_interval', category: 'incoming', configPath: 'incoming.poll_interval', defaultValue: '30', isCredential: false },
  { key: 'incoming.retention_days', category: 'incoming', configPath: 'incoming.retention_days', defaultValue: '90', isCredential: false },
  { key: 'incoming.suspicious_dust_usd', category: 'incoming', configPath: 'incoming.suspicious_dust_usd', defaultValue: '0.01', isCredential: false },
  { key: 'incoming.suspicious_amount_multiplier', category: 'incoming', configPath: 'incoming.suspicious_amount_multiplier', defaultValue: '10', isCredential: false },
  { key: 'incoming.cooldown_minutes', category: 'incoming', configPath: 'incoming.cooldown_minutes', defaultValue: '5', isCredential: false },
  { key: 'incoming.wss_url', category: 'incoming', configPath: 'incoming.wss_url', defaultValue: '', isCredential: false },
  // Per-network WSS URL overrides (#193): takes priority over global incoming.wss_url
  { key: 'incoming.wss_url.solana-mainnet', category: 'incoming', configPath: 'incoming.wss_url.solana-mainnet', defaultValue: '', isCredential: false },
  { key: 'incoming.wss_url.solana-devnet', category: 'incoming', configPath: 'incoming.wss_url.solana-devnet', defaultValue: '', isCredential: false },
  { key: 'incoming.wss_url.solana-testnet', category: 'incoming', configPath: 'incoming.wss_url.solana-testnet', defaultValue: '', isCredential: false },
  { key: 'incoming.wss_url.ethereum-mainnet', category: 'incoming', configPath: 'incoming.wss_url.ethereum-mainnet', defaultValue: '', isCredential: false },
  { key: 'incoming.wss_url.ethereum-sepolia', category: 'incoming', configPath: 'incoming.wss_url.ethereum-sepolia', defaultValue: '', isCredential: false },
  { key: 'incoming.wss_url.arbitrum-mainnet', category: 'incoming', configPath: 'incoming.wss_url.arbitrum-mainnet', defaultValue: '', isCredential: false },
  { key: 'incoming.wss_url.arbitrum-sepolia', category: 'incoming', configPath: 'incoming.wss_url.arbitrum-sepolia', defaultValue: '', isCredential: false },
  { key: 'incoming.wss_url.optimism-mainnet', category: 'incoming', configPath: 'incoming.wss_url.optimism-mainnet', defaultValue: '', isCredential: false },
  { key: 'incoming.wss_url.optimism-sepolia', category: 'incoming', configPath: 'incoming.wss_url.optimism-sepolia', defaultValue: '', isCredential: false },
  { key: 'incoming.wss_url.base-mainnet', category: 'incoming', configPath: 'incoming.wss_url.base-mainnet', defaultValue: '', isCredential: false },
  { key: 'incoming.wss_url.base-sepolia', category: 'incoming', configPath: 'incoming.wss_url.base-sepolia', defaultValue: '', isCredential: false },
  { key: 'incoming.wss_url.polygon-mainnet', category: 'incoming', configPath: 'incoming.wss_url.polygon-mainnet', defaultValue: '', isCredential: false },
  { key: 'incoming.wss_url.polygon-amoy', category: 'incoming', configPath: 'incoming.wss_url.polygon-amoy', defaultValue: '', isCredential: false },

  // --- actions category (DeFi action providers) ---
  { key: 'actions.jupiter_swap_enabled', category: 'actions', configPath: 'actions.jupiter_swap_enabled', defaultValue: 'true', isCredential: false },
  { key: 'actions.jupiter_swap_api_base_url', category: 'actions', configPath: 'actions.jupiter_swap_api_base_url', defaultValue: 'https://api.jup.ag/swap/v1', isCredential: false },
  { key: 'actions.jupiter_swap_api_key', category: 'actions', configPath: 'actions.jupiter_swap_api_key', defaultValue: '', isCredential: true },
  { key: 'actions.jupiter_swap_default_slippage_bps', category: 'actions', configPath: 'actions.jupiter_swap_default_slippage_bps', defaultValue: '50', isCredential: false },
  { key: 'actions.jupiter_swap_max_slippage_bps', category: 'actions', configPath: 'actions.jupiter_swap_max_slippage_bps', defaultValue: '500', isCredential: false },
  { key: 'actions.jupiter_swap_max_price_impact_pct', category: 'actions', configPath: 'actions.jupiter_swap_max_price_impact_pct', defaultValue: '1', isCredential: false },
  { key: 'actions.jupiter_swap_jito_tip_lamports', category: 'actions', configPath: 'actions.jupiter_swap_jito_tip_lamports', defaultValue: '1000', isCredential: false },
  { key: 'actions.jupiter_swap_request_timeout_ms', category: 'actions', configPath: 'actions.jupiter_swap_request_timeout_ms', defaultValue: '10000', isCredential: false },
  { key: 'actions.zerox_swap_enabled', category: 'actions', configPath: 'actions.zerox_swap_enabled', defaultValue: 'true', isCredential: false },
  { key: 'actions.zerox_swap_api_key', category: 'actions', configPath: 'actions.zerox_swap_api_key', defaultValue: '', isCredential: true },
  { key: 'actions.zerox_swap_default_slippage_bps', category: 'actions', configPath: 'actions.zerox_swap_default_slippage_bps', defaultValue: '100', isCredential: false },
  { key: 'actions.zerox_swap_max_slippage_bps', category: 'actions', configPath: 'actions.zerox_swap_max_slippage_bps', defaultValue: '500', isCredential: false },
  { key: 'actions.zerox_swap_request_timeout_ms', category: 'actions', configPath: 'actions.zerox_swap_request_timeout_ms', defaultValue: '10000', isCredential: false },
  { key: 'actions.lifi_enabled', category: 'actions', configPath: 'actions.lifi_enabled', defaultValue: 'true', isCredential: false },
  { key: 'actions.lifi_api_key', category: 'actions', configPath: 'actions.lifi_api_key', defaultValue: '', isCredential: true },
  { key: 'actions.lifi_api_base_url', category: 'actions', configPath: 'actions.lifi_api_base_url', defaultValue: 'https://li.quest/v1', isCredential: false },
  { key: 'actions.lifi_default_slippage_pct', category: 'actions', configPath: 'actions.lifi_default_slippage_pct', defaultValue: '0.03', isCredential: false },
  { key: 'actions.lifi_max_slippage_pct', category: 'actions', configPath: 'actions.lifi_max_slippage_pct', defaultValue: '0.05', isCredential: false },

  // --- Lido Staking ---
  { key: 'actions.lido_staking_enabled', category: 'actions', configPath: 'actions.lido_staking_enabled', defaultValue: 'true', isCredential: false },
  { key: 'actions.lido_staking_steth_address', category: 'actions', configPath: 'actions.lido_staking_steth_address', defaultValue: '', isCredential: false },
  { key: 'actions.lido_staking_withdrawal_queue_address', category: 'actions', configPath: 'actions.lido_staking_withdrawal_queue_address', defaultValue: '', isCredential: false },

  // --- Jito Staking ---
  { key: 'actions.jito_staking_enabled', category: 'actions', configPath: 'actions.jito_staking_enabled', defaultValue: 'true', isCredential: false },
  { key: 'actions.jito_staking_stake_pool_address', category: 'actions', configPath: 'actions.jito_staking_stake_pool_address', defaultValue: '', isCredential: false },
  { key: 'actions.jito_staking_jitosol_mint', category: 'actions', configPath: 'actions.jito_staking_jitosol_mint', defaultValue: '', isCredential: false },

  // --- Aave V3 Lending ---
  { key: 'actions.aave_v3_enabled', category: 'actions', configPath: 'actions.aave_v3_enabled', defaultValue: 'true', isCredential: false },
  { key: 'actions.aave_v3_health_factor_warning_threshold', category: 'actions', configPath: 'actions.aave_v3_health_factor_warning_threshold', defaultValue: '1.2', isCredential: false },
  { key: 'actions.aave_v3_position_sync_interval_sec', category: 'actions', configPath: 'actions.aave_v3_position_sync_interval_sec', defaultValue: '300', isCredential: false },
  { key: 'actions.aave_v3_max_ltv_pct', category: 'actions', configPath: 'actions.aave_v3_max_ltv_pct', defaultValue: '0.8', isCredential: false },

  // --- Kamino Lending ---
  { key: 'actions.kamino_enabled', category: 'actions', configPath: 'actions.kamino_enabled', defaultValue: 'true', isCredential: false },
  { key: 'actions.kamino_market', category: 'actions', configPath: 'actions.kamino_market', defaultValue: 'main', isCredential: false },
  { key: 'actions.kamino_hf_threshold', category: 'actions', configPath: 'actions.kamino_hf_threshold', defaultValue: '1.2', isCredential: false },

  // --- Pendle Yield ---
  { key: 'actions.pendle_yield_enabled', category: 'actions', configPath: 'actions.pendle_yield_enabled', defaultValue: 'true', isCredential: false },
  { key: 'actions.pendle_yield_api_base_url', category: 'actions', configPath: 'actions.pendle_yield_api_base_url', defaultValue: 'https://api-v2.pendle.finance', isCredential: false },
  { key: 'actions.pendle_yield_api_key', category: 'actions', configPath: 'actions.pendle_yield_api_key', defaultValue: '', isCredential: true },
  { key: 'actions.pendle_yield_default_slippage_bps', category: 'actions', configPath: 'actions.pendle_yield_default_slippage_bps', defaultValue: '100', isCredential: false },
  { key: 'actions.pendle_yield_max_slippage_bps', category: 'actions', configPath: 'actions.pendle_yield_max_slippage_bps', defaultValue: '500', isCredential: false },
  { key: 'actions.pendle_yield_request_timeout_ms', category: 'actions', configPath: 'actions.pendle_yield_request_timeout_ms', defaultValue: '10000', isCredential: false },
  { key: 'actions.pendle_yield_maturity_warning_days', category: 'actions', configPath: 'actions.pendle_yield_maturity_warning_days', defaultValue: '7', isCredential: false },

  // --- Drift Perp ---
  { key: 'actions.drift_enabled', category: 'actions', configPath: 'actions.drift_enabled', defaultValue: 'true', isCredential: false },
  { key: 'actions.drift_max_leverage', category: 'actions', configPath: 'actions.drift_max_leverage', defaultValue: '5', isCredential: false },
  { key: 'actions.drift_max_position_usd', category: 'actions', configPath: 'actions.drift_max_position_usd', defaultValue: '10000', isCredential: false },
  { key: 'actions.drift_margin_warning_threshold_pct', category: 'actions', configPath: 'actions.drift_margin_warning_threshold_pct', defaultValue: '0.15', isCredential: false },
  { key: 'actions.drift_position_sync_interval_sec', category: 'actions', configPath: 'actions.drift_position_sync_interval_sec', defaultValue: '60', isCredential: false },

  // --- gas_condition category (Gas conditional execution) ---
  { key: 'gas_condition.enabled', category: 'gas_condition', configPath: 'gas_condition.enabled', defaultValue: 'true', isCredential: false },
  { key: 'gas_condition.poll_interval_sec', category: 'gas_condition', configPath: 'gas_condition.poll_interval_sec', defaultValue: '30', isCredential: false },
  { key: 'gas_condition.default_timeout_sec', category: 'gas_condition', configPath: 'gas_condition.default_timeout_sec', defaultValue: '3600', isCredential: false },
  { key: 'gas_condition.max_timeout_sec', category: 'gas_condition', configPath: 'gas_condition.max_timeout_sec', defaultValue: '86400', isCredential: false },
  { key: 'gas_condition.max_pending_count', category: 'gas_condition', configPath: 'gas_condition.max_pending_count', defaultValue: '100', isCredential: false },

  // --- rpc_pool category (per-network URL lists managed via Admin Settings API) ---
  { key: 'rpc_pool.solana-mainnet', category: 'rpc_pool', configPath: 'rpc_pool.solana-mainnet', defaultValue: '[]', isCredential: false },
  { key: 'rpc_pool.solana-devnet', category: 'rpc_pool', configPath: 'rpc_pool.solana-devnet', defaultValue: '[]', isCredential: false },
  { key: 'rpc_pool.solana-testnet', category: 'rpc_pool', configPath: 'rpc_pool.solana-testnet', defaultValue: '[]', isCredential: false },
  { key: 'rpc_pool.ethereum-mainnet', category: 'rpc_pool', configPath: 'rpc_pool.ethereum-mainnet', defaultValue: '[]', isCredential: false },
  { key: 'rpc_pool.ethereum-sepolia', category: 'rpc_pool', configPath: 'rpc_pool.ethereum-sepolia', defaultValue: '[]', isCredential: false },
  { key: 'rpc_pool.arbitrum-mainnet', category: 'rpc_pool', configPath: 'rpc_pool.arbitrum-mainnet', defaultValue: '[]', isCredential: false },
  { key: 'rpc_pool.arbitrum-sepolia', category: 'rpc_pool', configPath: 'rpc_pool.arbitrum-sepolia', defaultValue: '[]', isCredential: false },
  { key: 'rpc_pool.optimism-mainnet', category: 'rpc_pool', configPath: 'rpc_pool.optimism-mainnet', defaultValue: '[]', isCredential: false },
  { key: 'rpc_pool.optimism-sepolia', category: 'rpc_pool', configPath: 'rpc_pool.optimism-sepolia', defaultValue: '[]', isCredential: false },
  { key: 'rpc_pool.base-mainnet', category: 'rpc_pool', configPath: 'rpc_pool.base-mainnet', defaultValue: '[]', isCredential: false },
  { key: 'rpc_pool.base-sepolia', category: 'rpc_pool', configPath: 'rpc_pool.base-sepolia', defaultValue: '[]', isCredential: false },
  { key: 'rpc_pool.polygon-mainnet', category: 'rpc_pool', configPath: 'rpc_pool.polygon-mainnet', defaultValue: '[]', isCredential: false },
  { key: 'rpc_pool.polygon-amoy', category: 'rpc_pool', configPath: 'rpc_pool.polygon-amoy', defaultValue: '[]', isCredential: false },

  // --- position_tracker category (DeFi position sync) ---
  { key: 'position_tracker.enabled', category: 'position_tracker', configPath: 'position_tracker.enabled', defaultValue: 'true', isCredential: false },

  // --- smart_account category (ERC-4337 Account Abstraction) ---
  // v30.9: enabled default changed to 'true' (DFLT-01). bundler_url/paymaster_url/paymaster_api_key
  // and all per-chain overrides removed (23 keys) -- replaced by per-wallet provider model (PROV-09).
  { key: 'smart_account.enabled', category: 'smart_account', configPath: 'smart_account.enabled', defaultValue: 'true', isCredential: false },
  { key: 'smart_account.entry_point', category: 'smart_account', configPath: 'smart_account.entry_point', defaultValue: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', isCredential: false },

  // --- ERC-8004 Agent Identity ---
  { key: 'actions.erc8004_agent_enabled', category: 'actions', configPath: 'actions.erc8004_agent_enabled', defaultValue: 'true', isCredential: false },
  { key: 'actions.erc8004_identity_registry_address', category: 'actions', configPath: 'actions.erc8004_identity_registry_address', defaultValue: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', isCredential: false },
  { key: 'actions.erc8004_reputation_registry_address', category: 'actions', configPath: 'actions.erc8004_reputation_registry_address', defaultValue: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63', isCredential: false },
  { key: 'actions.erc8004_validation_registry_address', category: 'actions', configPath: 'actions.erc8004_validation_registry_address', defaultValue: '', isCredential: false },
  { key: 'actions.erc8004_registration_file_base_url', category: 'actions', configPath: 'actions.erc8004_registration_file_base_url', defaultValue: '', isCredential: false },
  { key: 'actions.erc8004_auto_publish_registration', category: 'actions', configPath: 'actions.erc8004_auto_publish_registration', defaultValue: 'true', isCredential: false },
  { key: 'actions.erc8004_reputation_cache_ttl_sec', category: 'actions', configPath: 'actions.erc8004_reputation_cache_ttl_sec', defaultValue: '300', isCredential: false },
  { key: 'actions.erc8004_min_reputation_score', category: 'actions', configPath: 'actions.erc8004_min_reputation_score', defaultValue: '0', isCredential: false },
  { key: 'actions.erc8004_reputation_rpc_timeout_ms', category: 'actions', configPath: 'actions.erc8004_reputation_rpc_timeout_ms', defaultValue: '3000', isCredential: false },

  // --- NFT Indexer ---
  { key: 'actions.alchemy_nft_api_key', category: 'actions', configPath: 'actions.alchemy_nft_api_key', defaultValue: '', isCredential: true },
  { key: 'actions.helius_das_api_key', category: 'actions', configPath: 'actions.helius_das_api_key', defaultValue: '', isCredential: true },
  { key: 'actions.nft_indexer_cache_ttl_sec', category: 'actions', configPath: 'actions.nft_indexer_cache_ttl_sec', defaultValue: '300', isCredential: false },

  // --- erc8128 category (ERC-8128 Signed HTTP Requests) ---
  { key: 'erc8128.enabled', category: 'erc8128', configPath: 'erc8128.enabled', defaultValue: 'false', isCredential: false },
  { key: 'erc8128.default_preset', category: 'erc8128', configPath: 'erc8128.default_preset', defaultValue: 'standard', isCredential: false },
  { key: 'erc8128.default_ttl_sec', category: 'erc8128', configPath: 'erc8128.default_ttl_sec', defaultValue: '300', isCredential: false },
  { key: 'erc8128.default_nonce', category: 'erc8128', configPath: 'erc8128.default_nonce', defaultValue: 'true', isCredential: false },
  { key: 'erc8128.default_algorithm', category: 'erc8128', configPath: 'erc8128.default_algorithm', defaultValue: 'ethereum-eip191', isCredential: false },
  { key: 'erc8128.default_rate_limit_rpm', category: 'erc8128', configPath: 'erc8128.default_rate_limit_rpm', defaultValue: '60', isCredential: false },
] as const;

// ---------------------------------------------------------------------------
// [Phase 331] Action tier override Zod schema
// ---------------------------------------------------------------------------

/** Valid values for action tier override: INSTANT/NOTIFY/DELAY/APPROVAL or '' (use provider default). */
export const ActionTierOverrideSchema = z.enum(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL', '']);

// ---------------------------------------------------------------------------
// [Phase 331] Dynamic tier key pattern
// ---------------------------------------------------------------------------

/**
 * Regex matching dynamic tier override keys: `actions.{providerKey}_{actionName}_tier`
 * e.g. `actions.jupiter_swap_swap_tier`, `actions.erc8004_agent_register_agent_tier`
 */
const TIER_KEY_PATTERN = /^actions\.[a-z][a-z0-9_]*_tier$/;

/**
 * Generate a dynamic SettingDefinition for an action tier override key.
 * Returns undefined if the key doesn't match the tier key pattern.
 */
function getDynamicTierDefinition(key: string): SettingDefinition | undefined {
  if (!TIER_KEY_PATTERN.test(key)) return undefined;
  return {
    key,
    category: 'actions',
    configPath: key,
    defaultValue: '',
    isCredential: false,
  };
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Map from key -> SettingDefinition for O(1) lookup */
const definitionMap = new Map<string, SettingDefinition>(
  SETTING_DEFINITIONS.map((def) => [def.key, def]),
);

/** Get a setting definition by key, or undefined if not found.
 * Checks static definitions first, then falls back to dynamic tier key pattern. */
export function getSettingDefinition(key: string): SettingDefinition | undefined {
  return definitionMap.get(key) ?? getDynamicTierDefinition(key);
}
