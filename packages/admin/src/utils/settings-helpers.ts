// ---------------------------------------------------------------------------
// Shared types and helpers for settings pages (Security, System, Settings)
// Extracted from settings.tsx for reuse across multiple pages.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SettingsData = Record<string, Record<string, string | boolean>>;

export interface KillSwitchState {
  state: string;
  activatedAt: number | null;
  activatedBy: string | null;
}

export interface ApiKeyEntry {
  providerName: string;
  hasKey: boolean;
  maskedKey: string | null;
  requiresApiKey: boolean;
  updatedAt: string | null;
}

export interface RpcTestResult {
  success: boolean;
  latencyMs: number;
  blockNumber?: number;
  error?: string;
}

export interface NotifTestResult {
  channel: string;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Credential fields come back as boolean from GET. These are the known credential keys. */
export const CREDENTIAL_KEYS = new Set([
  'notifications.telegram_bot_token',
  'notifications.discord_webhook_url',
  'notifications.slack_webhook_url',
  'telegram.bot_token',
]);

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export function isCredentialField(fullKey: string): boolean {
  return CREDENTIAL_KEYS.has(fullKey);
}

/** Human-readable label from a setting key */
export function keyToLabel(key: string): string {
  const map: Record<string, string> = {
    enabled: 'Enabled',
    telegram_bot_token: 'Telegram Bot Token',
    telegram_chat_id: 'Telegram Chat ID',
    discord_webhook_url: 'Discord Webhook URL',
    ntfy_server: 'Ntfy Server',
    ntfy_topic: 'Ntfy Topic',
    locale: 'Locale',
    rate_limit_rpm: 'Rate Limit (RPM)',
    solana_mainnet: 'Solana Mainnet',
    solana_devnet: 'Solana Devnet',
    solana_testnet: 'Solana Testnet',
    evm_ethereum_mainnet: 'Ethereum Mainnet',
    evm_ethereum_sepolia: 'Ethereum Sepolia',
    evm_polygon_mainnet: 'Polygon Mainnet',
    evm_polygon_amoy: 'Polygon Amoy',
    evm_arbitrum_mainnet: 'Arbitrum Mainnet',
    evm_arbitrum_sepolia: 'Arbitrum Sepolia',
    evm_optimism_mainnet: 'Optimism Mainnet',
    evm_optimism_sepolia: 'Optimism Sepolia',
    evm_base_mainnet: 'Base Mainnet',
    evm_base_sepolia: 'Base Sepolia',
    evm_default_network: 'Default EVM Network',
    session_ttl: 'Session TTL (seconds)',
    max_sessions_per_wallet: 'Max Sessions per Wallet',
    max_pending_tx: 'Max Pending Transactions',
    rate_limit_global_ip_rpm: 'Global IP Rate Limit (RPM)',
    rate_limit_session_rpm: 'Session Rate Limit (RPM)',
    rate_limit_tx_rpm: 'Transaction Rate Limit (RPM)',
    policy_defaults_delay_seconds: 'Policy Delay (seconds)',
    policy_defaults_approval_timeout: 'Approval Timeout (seconds)',
    default_deny_tokens: 'Default Deny: Token Transfers',
    default_deny_contracts: 'Default Deny: Contract Calls',
    default_deny_spenders: 'Default Deny: Token Approvals',
    project_id: 'Project ID',
    log_level: 'Log Level',
    currency: 'Display Currency',
    // autostop keys
    consecutive_failures_threshold: 'Consecutive Failures Threshold',
    unusual_activity_threshold: 'Unusual Activity Threshold',
    unusual_activity_window_sec: 'Unusual Activity Window (seconds)',
    idle_timeout_sec: 'Idle Timeout (seconds)',
    idle_check_interval_sec: 'Idle Check Interval (seconds)',
    // monitoring keys
    check_interval_sec: 'Check Interval (seconds)',
    low_balance_threshold_sol: 'Low Balance Threshold (SOL)',
    low_balance_threshold_eth: 'Low Balance Threshold (ETH)',
    cooldown_hours: 'Alert Cooldown (hours)',
    // telegram bot keys
    bot_token: 'Bot Token',
  };
  return map[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Settings value helpers (pure functions, no signal access)
// ---------------------------------------------------------------------------

/** Get effective display value for a field, considering dirty overrides */
export function getEffectiveValue(
  settings: SettingsData,
  dirty: Record<string, string>,
  category: string,
  shortKey: string,
): string {
  const fullKey = `${category}.${shortKey}`;
  if (dirty[fullKey] !== undefined) {
    return dirty[fullKey];
  }
  const catData = settings[category];
  if (!catData) return '';
  const catValue = catData[shortKey];
  if (typeof catValue === 'boolean') {
    // Credential fields: boolean indicates presence, not actual value
    if (isCredentialField(fullKey)) return '';
    return String(catValue);
  }
  return catValue ?? '';
}

/** Get effective boolean value (for checkbox fields) */
export function getEffectiveBoolValue(
  settings: SettingsData,
  dirty: Record<string, string>,
  category: string,
  shortKey: string,
): boolean {
  const fullKey = `${category}.${shortKey}`;
  if (dirty[fullKey] !== undefined) {
    return dirty[fullKey] === 'true';
  }
  const catData = settings[category];
  if (!catData) return false;
  const catValue = catData[shortKey];
  if (typeof catValue === 'boolean') return catValue;
  return catValue === 'true';
}

/** Check if a credential field is configured (GET returned true) */
export function isCredentialConfigured(
  settings: SettingsData,
  dirty: Record<string, string>,
  category: string,
  shortKey: string,
): boolean {
  const fullKey = `${category}.${shortKey}`;
  if (dirty[fullKey] !== undefined) return false; // user is editing
  const catData = settings[category];
  if (!catData) return false;
  return catData[shortKey] === true;
}
