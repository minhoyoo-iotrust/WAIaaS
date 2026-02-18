// ---------------------------------------------------------------------------
// Settings Search Index
// Static search index of all setting fields across 6 pages for Ctrl+K search.
// ---------------------------------------------------------------------------

export interface SearchIndexEntry {
  id: string;           // unique: "page.tab.fieldName" e.g. "wallets.rpc.solana_mainnet"
  label: string;        // display label
  description: string;  // brief help text
  page: string;         // hash path: "/wallets", "/sessions", etc.
  tab: string;          // tab key: "rpc", "settings", etc.
  fieldName: string;    // the form field name attribute e.g. "rpc.solana_mainnet"
  keywords: string[];   // extra search terms
}

export const SETTINGS_SEARCH_INDEX: SearchIndexEntry[] = [
  // =========================================================================
  // Wallets Page
  // =========================================================================

  // --- RPC Endpoints tab ---
  { id: 'wallets.rpc.solana_mainnet', label: 'Solana Mainnet', description: 'RPC endpoint URL for Solana mainnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.solana_mainnet', keywords: ['blockchain', 'rpc', 'solana', 'url', 'endpoint'] },
  { id: 'wallets.rpc.solana_devnet', label: 'Solana Devnet', description: 'RPC endpoint URL for Solana devnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.solana_devnet', keywords: ['blockchain', 'rpc', 'solana', 'url', 'endpoint', 'test'] },
  { id: 'wallets.rpc.solana_testnet', label: 'Solana Testnet', description: 'RPC endpoint URL for Solana testnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.solana_testnet', keywords: ['blockchain', 'rpc', 'solana', 'url', 'endpoint', 'test'] },
  { id: 'wallets.rpc.evm_ethereum_mainnet', label: 'Ethereum Mainnet', description: 'RPC endpoint URL for Ethereum mainnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_ethereum_mainnet', keywords: ['blockchain', 'rpc', 'evm', 'ethereum', 'url', 'endpoint'] },
  { id: 'wallets.rpc.evm_ethereum_sepolia', label: 'Ethereum Sepolia', description: 'RPC endpoint URL for Ethereum Sepolia testnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_ethereum_sepolia', keywords: ['blockchain', 'rpc', 'evm', 'ethereum', 'url', 'endpoint', 'test'] },
  { id: 'wallets.rpc.evm_polygon_mainnet', label: 'Polygon Mainnet', description: 'RPC endpoint URL for Polygon mainnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_polygon_mainnet', keywords: ['blockchain', 'rpc', 'evm', 'polygon', 'matic', 'url', 'endpoint'] },
  { id: 'wallets.rpc.evm_polygon_amoy', label: 'Polygon Amoy', description: 'RPC endpoint URL for Polygon Amoy testnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_polygon_amoy', keywords: ['blockchain', 'rpc', 'evm', 'polygon', 'url', 'endpoint', 'test'] },
  { id: 'wallets.rpc.evm_arbitrum_mainnet', label: 'Arbitrum Mainnet', description: 'RPC endpoint URL for Arbitrum mainnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_arbitrum_mainnet', keywords: ['blockchain', 'rpc', 'evm', 'arbitrum', 'l2', 'url', 'endpoint'] },
  { id: 'wallets.rpc.evm_arbitrum_sepolia', label: 'Arbitrum Sepolia', description: 'RPC endpoint URL for Arbitrum Sepolia testnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_arbitrum_sepolia', keywords: ['blockchain', 'rpc', 'evm', 'arbitrum', 'l2', 'url', 'endpoint', 'test'] },
  { id: 'wallets.rpc.evm_optimism_mainnet', label: 'Optimism Mainnet', description: 'RPC endpoint URL for Optimism mainnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_optimism_mainnet', keywords: ['blockchain', 'rpc', 'evm', 'optimism', 'l2', 'url', 'endpoint'] },
  { id: 'wallets.rpc.evm_optimism_sepolia', label: 'Optimism Sepolia', description: 'RPC endpoint URL for Optimism Sepolia testnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_optimism_sepolia', keywords: ['blockchain', 'rpc', 'evm', 'optimism', 'l2', 'url', 'endpoint', 'test'] },
  { id: 'wallets.rpc.evm_base_mainnet', label: 'Base Mainnet', description: 'RPC endpoint URL for Base mainnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_base_mainnet', keywords: ['blockchain', 'rpc', 'evm', 'base', 'coinbase', 'l2', 'url', 'endpoint'] },
  { id: 'wallets.rpc.evm_base_sepolia', label: 'Base Sepolia', description: 'RPC endpoint URL for Base Sepolia testnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_base_sepolia', keywords: ['blockchain', 'rpc', 'evm', 'base', 'coinbase', 'l2', 'url', 'endpoint', 'test'] },
  { id: 'wallets.rpc.evm_default_network', label: 'Default EVM Network', description: 'Default EVM network for new wallets', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_default_network', keywords: ['blockchain', 'evm', 'default', 'network'] },

  // --- Balance Monitoring tab ---
  { id: 'wallets.monitoring.enabled', label: 'Enabled', description: 'Enable or disable balance monitoring', page: '/wallets', tab: 'monitoring', fieldName: 'monitoring.enabled', keywords: ['balance', 'monitoring', 'toggle', 'enable'] },
  { id: 'wallets.monitoring.check_interval_sec', label: 'Check Interval (seconds)', description: 'How often to check wallet balances', page: '/wallets', tab: 'monitoring', fieldName: 'monitoring.check_interval_sec', keywords: ['balance', 'monitoring', 'interval', 'frequency'] },
  { id: 'wallets.monitoring.low_balance_threshold_sol', label: 'Low Balance Threshold (SOL)', description: 'Alert when SOL balance drops below this amount', page: '/wallets', tab: 'monitoring', fieldName: 'monitoring.low_balance_threshold_sol', keywords: ['balance', 'monitoring', 'threshold', 'solana', 'alert', 'low'] },
  { id: 'wallets.monitoring.low_balance_threshold_eth', label: 'Low Balance Threshold (ETH)', description: 'Alert when ETH balance drops below this amount', page: '/wallets', tab: 'monitoring', fieldName: 'monitoring.low_balance_threshold_eth', keywords: ['balance', 'monitoring', 'threshold', 'ethereum', 'alert', 'low'] },
  { id: 'wallets.monitoring.cooldown_hours', label: 'Alert Cooldown (hours)', description: 'Suppress duplicate alerts for this many hours', page: '/wallets', tab: 'monitoring', fieldName: 'monitoring.cooldown_hours', keywords: ['balance', 'monitoring', 'cooldown', 'alert', 'suppress'] },

  // --- WalletConnect tab ---
  { id: 'wallets.walletconnect.project_id', label: 'Project ID', description: 'WalletConnect Cloud project identifier', page: '/wallets', tab: 'walletconnect', fieldName: 'walletconnect.project_id', keywords: ['walletconnect', 'project', 'cloud', 'dapp'] },
  { id: 'wallets.walletconnect.relay_url', label: 'Relay URL', description: 'WalletConnect relay server URL', page: '/wallets', tab: 'walletconnect', fieldName: 'walletconnect.relay_url', keywords: ['walletconnect', 'relay', 'websocket', 'server'] },

  // =========================================================================
  // Sessions Page
  // =========================================================================

  // --- Settings tab ---
  { id: 'sessions.settings.session_ttl', label: 'Session TTL (seconds)', description: 'How long a session token is valid before renewal', page: '/sessions', tab: 'settings', fieldName: 'security.session_ttl', keywords: ['session', 'ttl', 'lifetime', 'expiry', 'timeout'] },
  { id: 'sessions.settings.session_absolute_lifetime', label: 'Absolute Lifetime (seconds)', description: 'Maximum total session duration regardless of renewals', page: '/sessions', tab: 'settings', fieldName: 'security.session_absolute_lifetime', keywords: ['session', 'lifetime', 'absolute', 'maximum'] },
  { id: 'sessions.settings.session_max_renewals', label: 'Max Renewals', description: 'Maximum number of times a session can be renewed', page: '/sessions', tab: 'settings', fieldName: 'security.session_max_renewals', keywords: ['session', 'renewal', 'limit', 'maximum'] },
  { id: 'sessions.settings.max_sessions_per_wallet', label: 'Max Sessions per Wallet', description: 'Maximum concurrent sessions for a single wallet', page: '/sessions', tab: 'settings', fieldName: 'security.max_sessions_per_wallet', keywords: ['session', 'limit', 'concurrent', 'wallet'] },
  { id: 'sessions.settings.max_pending_tx', label: 'Max Pending Transactions', description: 'Maximum in-flight transactions per session', page: '/sessions', tab: 'settings', fieldName: 'security.max_pending_tx', keywords: ['transaction', 'pending', 'limit', 'queue'] },
  { id: 'sessions.settings.rate_limit_session_rpm', label: 'Session Rate Limit (RPM)', description: 'Max requests per minute per session', page: '/sessions', tab: 'settings', fieldName: 'security.rate_limit_session_rpm', keywords: ['rate', 'limit', 'rpm', 'session', 'throttle'] },
  { id: 'sessions.settings.rate_limit_tx_rpm', label: 'Transaction Rate Limit (RPM)', description: 'Max transaction requests per minute per session', page: '/sessions', tab: 'settings', fieldName: 'security.rate_limit_tx_rpm', keywords: ['rate', 'limit', 'rpm', 'transaction', 'throttle'] },

  // =========================================================================
  // Policies Page
  // =========================================================================

  // --- Defaults tab ---
  { id: 'policies.defaults.policy_defaults_delay_seconds', label: 'Policy Delay (seconds)', description: 'Default delay before executing delayed-tier transactions', page: '/policies', tab: 'defaults', fieldName: 'security.policy_defaults_delay_seconds', keywords: ['policy', 'delay', 'default', 'seconds', 'timer'] },
  { id: 'policies.defaults.policy_defaults_approval_timeout', label: 'Approval Timeout (seconds)', description: 'How long to wait for owner approval before timeout', page: '/policies', tab: 'defaults', fieldName: 'security.policy_defaults_approval_timeout', keywords: ['policy', 'approval', 'timeout', 'owner', 'default'] },
  { id: 'policies.defaults.default_deny_tokens', label: 'Default Deny: Token Transfers', description: 'Deny token transfers unless a matching whitelist policy exists', page: '/policies', tab: 'defaults', fieldName: 'policy.default_deny_tokens', keywords: ['policy', 'deny', 'token', 'transfer', 'default', 'security'] },
  { id: 'policies.defaults.default_deny_contracts', label: 'Default Deny: Contract Calls', description: 'Deny contract calls unless a matching whitelist policy exists', page: '/policies', tab: 'defaults', fieldName: 'policy.default_deny_contracts', keywords: ['policy', 'deny', 'contract', 'call', 'default', 'security'] },
  { id: 'policies.defaults.default_deny_spenders', label: 'Default Deny: Token Approvals', description: 'Deny token approvals unless a matching whitelist policy exists', page: '/policies', tab: 'defaults', fieldName: 'policy.default_deny_spenders', keywords: ['policy', 'deny', 'spender', 'approval', 'default', 'security'] },

  // =========================================================================
  // Notifications Page
  // =========================================================================

  // --- Settings tab ---
  { id: 'notifications.settings.enabled', label: 'Enabled', description: 'Enable or disable notifications globally', page: '/notifications', tab: 'settings', fieldName: 'notifications.enabled', keywords: ['notifications', 'enable', 'toggle', 'global'] },
  { id: 'notifications.settings.telegram_bot_token', label: 'Telegram Bot Token', description: 'Bot token for Telegram notifications', page: '/notifications', tab: 'settings', fieldName: 'notifications.telegram_bot_token', keywords: ['telegram', 'bot', 'token', 'notification', 'credential'] },
  { id: 'notifications.settings.telegram_chat_id', label: 'Telegram Chat ID', description: 'Chat ID for Telegram notification delivery', page: '/notifications', tab: 'settings', fieldName: 'notifications.telegram_chat_id', keywords: ['telegram', 'chat', 'notification'] },
  { id: 'notifications.settings.locale', label: 'Locale', description: 'Language for notification messages', page: '/notifications', tab: 'settings', fieldName: 'notifications.locale', keywords: ['locale', 'language', 'notification', 'i18n'] },
  { id: 'notifications.settings.discord_webhook_url', label: 'Discord Webhook URL', description: 'Webhook URL for Discord notifications', page: '/notifications', tab: 'settings', fieldName: 'notifications.discord_webhook_url', keywords: ['discord', 'webhook', 'notification', 'credential'] },
  { id: 'notifications.settings.ntfy_server', label: 'Ntfy Server', description: 'Server URL for ntfy notifications', page: '/notifications', tab: 'settings', fieldName: 'notifications.ntfy_server', keywords: ['ntfy', 'server', 'push', 'notification'] },
  { id: 'notifications.settings.ntfy_topic', label: 'Ntfy Topic', description: 'Topic name for ntfy notifications', page: '/notifications', tab: 'settings', fieldName: 'notifications.ntfy_topic', keywords: ['ntfy', 'topic', 'push', 'notification'] },
  { id: 'notifications.settings.slack_webhook_url', label: 'Slack Webhook URL', description: 'Webhook URL for Slack notifications', page: '/notifications', tab: 'settings', fieldName: 'notifications.slack_webhook_url', keywords: ['slack', 'webhook', 'notification', 'credential'] },
  { id: 'notifications.settings.rate_limit_rpm', label: 'Rate Limit (RPM)', description: 'Max notifications per minute', page: '/notifications', tab: 'settings', fieldName: 'notifications.rate_limit_rpm', keywords: ['rate', 'limit', 'rpm', 'notification', 'throttle'] },
  { id: 'notifications.settings.telegram_bot_enabled', label: 'Bot Enabled', description: 'Enable or disable the Telegram bot', page: '/notifications', tab: 'settings', fieldName: 'telegram.enabled', keywords: ['telegram', 'bot', 'enable', 'toggle'] },
  { id: 'notifications.settings.telegram_dedicated_bot_token', label: 'Bot Token', description: 'Dedicated bot token for Telegram bot (optional, uses notification token if empty)', page: '/notifications', tab: 'settings', fieldName: 'telegram.bot_token', keywords: ['telegram', 'bot', 'token', 'credential'] },

  // =========================================================================
  // Security Page
  // =========================================================================

  // --- AutoStop Rules tab ---
  { id: 'security.autostop.enabled', label: 'Enabled', description: 'Enable or disable AutoStop protection rules', page: '/security', tab: 'autostop', fieldName: 'autostop.enabled', keywords: ['autostop', 'protection', 'enable', 'toggle', 'security'] },
  { id: 'security.autostop.consecutive_failures_threshold', label: 'Consecutive Failures Threshold', description: 'Suspend wallet after this many consecutive failed transactions', page: '/security', tab: 'autostop', fieldName: 'autostop.consecutive_failures_threshold', keywords: ['autostop', 'failure', 'threshold', 'suspend', 'security'] },
  { id: 'security.autostop.unusual_activity_threshold', label: 'Unusual Activity Threshold', description: 'Max transactions within window before triggering unusual activity alert', page: '/security', tab: 'autostop', fieldName: 'autostop.unusual_activity_threshold', keywords: ['autostop', 'unusual', 'activity', 'threshold', 'security'] },
  { id: 'security.autostop.unusual_activity_window_sec', label: 'Unusual Activity Window (seconds)', description: 'Time window for unusual activity detection', page: '/security', tab: 'autostop', fieldName: 'autostop.unusual_activity_window_sec', keywords: ['autostop', 'unusual', 'activity', 'window', 'time', 'security'] },
  { id: 'security.autostop.idle_timeout_sec', label: 'Idle Timeout (seconds)', description: 'Revoke sessions with no activity for this duration', page: '/security', tab: 'autostop', fieldName: 'autostop.idle_timeout_sec', keywords: ['autostop', 'idle', 'timeout', 'session', 'revoke', 'security'] },
  { id: 'security.autostop.idle_check_interval_sec', label: 'Idle Check Interval (seconds)', description: 'How often to check for idle sessions', page: '/security', tab: 'autostop', fieldName: 'autostop.idle_check_interval_sec', keywords: ['autostop', 'idle', 'check', 'interval', 'security'] },

  // =========================================================================
  // System Page (no tabs)
  // =========================================================================

  { id: 'system..currency', label: 'Display Currency', description: 'Currency for USD amount conversion in dashboard and notifications', page: '/system', tab: '', fieldName: 'display.currency', keywords: ['currency', 'display', 'usd', 'conversion', 'fiat'] },
  { id: 'system..rate_limit_global_ip_rpm', label: 'Global IP Rate Limit (RPM)', description: 'Maximum API requests per minute from a single IP address', page: '/system', tab: '', fieldName: 'security.rate_limit_global_ip_rpm', keywords: ['rate', 'limit', 'rpm', 'ip', 'global', 'throttle'] },
  { id: 'system..log_level', label: 'Log Level', description: 'Daemon logging verbosity level', page: '/system', tab: '', fieldName: 'daemon.log_level', keywords: ['log', 'level', 'debug', 'info', 'warn', 'error', 'daemon'] },
  { id: 'system..cross_validation_threshold', label: 'Cross Validation Threshold (%)', description: 'Maximum allowed deviation between price oracle sources', page: '/system', tab: '', fieldName: 'oracle.cross_validation_threshold', keywords: ['oracle', 'price', 'validation', 'threshold', 'deviation'] },
];
