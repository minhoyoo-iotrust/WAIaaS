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
  { id: 'wallets.rpc.evm_hyperevm_mainnet', label: 'HyperEVM Mainnet', description: 'RPC endpoint URL for HyperEVM mainnet (Hyperliquid)', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_hyperevm_mainnet', keywords: ['blockchain', 'rpc', 'evm', 'hyperevm', 'hyperliquid', 'url', 'endpoint'] },
  { id: 'wallets.rpc.evm_hyperevm_testnet', label: 'HyperEVM Testnet', description: 'RPC endpoint URL for HyperEVM testnet (Hyperliquid)', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_hyperevm_testnet', keywords: ['blockchain', 'rpc', 'evm', 'hyperevm', 'hyperliquid', 'url', 'endpoint', 'test'] },
  { id: 'wallets.rpc.xrpl_mainnet', label: 'XRPL Mainnet', description: 'RPC endpoint URL for XRP Ledger mainnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.xrpl_mainnet', keywords: ['blockchain', 'rpc', 'xrpl', 'ripple', 'xrp', 'url', 'endpoint'] },
  { id: 'wallets.rpc.xrpl_testnet', label: 'XRPL Testnet', description: 'RPC endpoint URL for XRP Ledger testnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.xrpl_testnet', keywords: ['blockchain', 'rpc', 'xrpl', 'ripple', 'xrp', 'url', 'endpoint', 'test'] },
  { id: 'wallets.rpc.xrpl_devnet', label: 'XRPL Devnet', description: 'RPC endpoint URL for XRP Ledger devnet', page: '/wallets', tab: 'rpc', fieldName: 'rpc.xrpl_devnet', keywords: ['blockchain', 'rpc', 'xrpl', 'ripple', 'xrp', 'url', 'endpoint', 'test'] },

  // --- Balance Monitoring (now in Notifications page) ---
  { id: 'notifications.balance.enabled', label: 'Enabled', description: 'Enable or disable balance monitoring', page: '/notifications', tab: 'balance', fieldName: 'monitoring.enabled', keywords: ['balance', 'monitoring', 'toggle', 'enable'] },
  { id: 'notifications.balance.check_interval_sec', label: 'Check Interval (seconds)', description: 'How often to check wallet balances', page: '/notifications', tab: 'balance', fieldName: 'monitoring.check_interval_sec', keywords: ['balance', 'monitoring', 'interval', 'frequency'] },
  { id: 'notifications.balance.low_balance_threshold_sol', label: 'Low Balance Threshold (SOL)', description: 'Alert when SOL balance drops below this amount', page: '/notifications', tab: 'balance', fieldName: 'monitoring.low_balance_threshold_sol', keywords: ['balance', 'monitoring', 'threshold', 'solana', 'alert', 'low'] },
  { id: 'notifications.balance.low_balance_threshold_eth', label: 'Low Balance Threshold (ETH)', description: 'Alert when ETH balance drops below this amount', page: '/notifications', tab: 'balance', fieldName: 'monitoring.low_balance_threshold_eth', keywords: ['balance', 'monitoring', 'threshold', 'ethereum', 'alert', 'low'] },
  { id: 'notifications.balance.cooldown_hours', label: 'Alert Cooldown (hours)', description: 'Suppress duplicate alerts for this many hours', page: '/notifications', tab: 'balance', fieldName: 'monitoring.cooldown_hours', keywords: ['balance', 'monitoring', 'cooldown', 'alert', 'suppress'] },

  // --- WalletConnect tab ---
  { id: 'wallets.walletconnect.project_id', label: 'Project ID', description: 'WalletConnect Cloud project identifier', page: '/wallets', tab: 'walletconnect', fieldName: 'walletconnect.project_id', keywords: ['walletconnect', 'project', 'cloud', 'dapp'] },
  { id: 'wallets.walletconnect.relay_url', label: 'Relay URL', description: 'WalletConnect relay server URL', page: '/wallets', tab: 'walletconnect', fieldName: 'walletconnect.relay_url', keywords: ['walletconnect', 'relay', 'websocket', 'server'] },

  // =========================================================================
  // Sessions Page
  // =========================================================================

  // --- Settings tab ---
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
  { id: 'policies.defaults.default_deny_erc8128_domains', label: 'Default Deny: ERC-8128 Domains', description: 'Deny ERC-8128 signing unless a matching domain whitelist policy exists', page: '/policies', tab: 'defaults', fieldName: 'policy.default_deny_erc8128_domains', keywords: ['erc8128', 'deny', 'domain', 'whitelist', 'policy'] },

  // =========================================================================
  // Notifications Page
  // =========================================================================

  // --- Settings tab ---
  { id: 'notifications.settings.enabled', label: 'Enabled', description: 'Enable or disable notifications globally', page: '/notifications', tab: 'settings', fieldName: 'notifications.enabled', keywords: ['notifications', 'enable', 'toggle', 'global'] },
  { id: 'notifications.settings.telegram_bot_token', label: 'Telegram Bot Token', description: 'Bot token for Telegram notifications', page: '/notifications', tab: 'settings', fieldName: 'notifications.telegram_bot_token', keywords: ['telegram', 'bot', 'token', 'notification', 'credential'] },
  { id: 'notifications.settings.telegram_chat_id', label: 'Telegram Chat ID', description: 'Chat ID for Telegram notification delivery', page: '/notifications', tab: 'settings', fieldName: 'notifications.telegram_chat_id', keywords: ['telegram', 'chat', 'notification'] },
  { id: 'notifications.settings.locale', label: 'Locale', description: 'Language for notification messages', page: '/notifications', tab: 'settings', fieldName: 'notifications.locale', keywords: ['locale', 'language', 'notification', 'i18n'] },
  { id: 'notifications.settings.discord_webhook_url', label: 'Discord Webhook URL', description: 'Webhook URL for Discord notifications', page: '/notifications', tab: 'settings', fieldName: 'notifications.discord_webhook_url', keywords: ['discord', 'webhook', 'notification', 'credential'] },

  { id: 'notifications.settings.slack_webhook_url', label: 'Slack Webhook URL', description: 'Webhook URL for Slack notifications', page: '/notifications', tab: 'settings', fieldName: 'notifications.slack_webhook_url', keywords: ['slack', 'webhook', 'notification', 'credential'] },
  { id: 'notifications.settings.rate_limit_rpm', label: 'Rate Limit (RPM)', description: 'Max notifications per minute', page: '/notifications', tab: 'settings', fieldName: 'notifications.rate_limit_rpm', keywords: ['rate', 'limit', 'rpm', 'notification', 'throttle'] },
  { id: 'notifications.settings.notify_events', label: 'Event Filter', description: 'Per-event notification filter (choose which events are delivered)', page: '/notifications', tab: 'settings', fieldName: 'notifications.notify_events', keywords: ['filter', 'event', 'category', 'notification', 'subscribe'] },
  { id: 'notifications.settings.telegram_dedicated_bot_token', label: 'Bot Token', description: 'Dedicated bot token for Telegram bot (optional, uses notification token if empty)', page: '/notifications', tab: 'settings', fieldName: 'telegram.bot_token', keywords: ['telegram', 'bot', 'token', 'credential'] },

  // =========================================================================
  // Protection Page (was Security)
  // =========================================================================

  // --- AutoStop Rules tab ---
  { id: 'protection.autostop.enabled', label: 'Enabled', description: 'Enable or disable AutoStop protection rules', page: '/protection', tab: 'autostop', fieldName: 'autostop.enabled', keywords: ['autostop', 'protection', 'enable', 'toggle', 'security'] },
  { id: 'protection.autostop.consecutive_failures_threshold', label: 'Consecutive Failures Threshold', description: 'Suspend wallet after this many consecutive failed transactions', page: '/protection', tab: 'autostop', fieldName: 'autostop.consecutive_failures_threshold', keywords: ['autostop', 'failure', 'threshold', 'suspend', 'security', 'protection'] },
  { id: 'protection.autostop.unusual_activity_threshold', label: 'Unusual Activity Threshold', description: 'Max transactions within window before triggering unusual activity alert', page: '/protection', tab: 'autostop', fieldName: 'autostop.unusual_activity_threshold', keywords: ['autostop', 'unusual', 'activity', 'threshold', 'security', 'protection'] },
  { id: 'protection.autostop.unusual_activity_window_sec', label: 'Unusual Activity Window (seconds)', description: 'Time window for unusual activity detection', page: '/protection', tab: 'autostop', fieldName: 'autostop.unusual_activity_window_sec', keywords: ['autostop', 'unusual', 'activity', 'window', 'time', 'security', 'protection'] },
  { id: 'protection.autostop.idle_timeout_sec', label: 'Idle Timeout (seconds)', description: 'Revoke sessions with no activity for this duration', page: '/protection', tab: 'autostop', fieldName: 'autostop.idle_timeout_sec', keywords: ['autostop', 'idle', 'timeout', 'session', 'revoke', 'security', 'protection'] },
  { id: 'protection.autostop.idle_check_interval_sec', label: 'Idle Check Interval (seconds)', description: 'How often to check for idle sessions', page: '/protection', tab: 'autostop', fieldName: 'autostop.idle_check_interval_sec', keywords: ['autostop', 'idle', 'check', 'interval', 'security', 'protection'] },

  // =========================================================================
  // Settings Page (was System, no tabs)
  // =========================================================================

  { id: 'settings..currency', label: 'Display Currency', description: 'Currency for USD amount conversion in dashboard and notifications', page: '/settings', tab: '', fieldName: 'display.currency', keywords: ['currency', 'display', 'usd', 'conversion', 'fiat', 'system', 'settings'] },
  { id: 'settings..rate_limit_global_ip_rpm', label: 'Global IP Rate Limit (RPM)', description: 'Maximum API requests per minute from a single IP address', page: '/settings', tab: '', fieldName: 'security.rate_limit_global_ip_rpm', keywords: ['rate', 'limit', 'rpm', 'ip', 'global', 'throttle', 'system', 'settings'] },
  { id: 'settings..log_level', label: 'Log Level', description: 'Daemon logging verbosity level', page: '/settings', tab: '', fieldName: 'daemon.log_level', keywords: ['log', 'level', 'debug', 'info', 'warn', 'error', 'daemon', 'system', 'settings'] },
  // =========================================================================
  // Transactions Page > Monitor Settings tab
  // =========================================================================

  { id: 'transactions.monitor.enabled', label: 'Monitoring Enabled', description: 'Enable or disable incoming transaction monitoring', page: '/transactions', tab: 'monitor', fieldName: 'incoming.enabled', keywords: ['incoming', 'monitoring', 'enable', 'toggle'] },
  { id: 'transactions.monitor.poll_interval', label: 'Poll Interval (seconds)', description: 'How often to poll for incoming transactions', page: '/transactions', tab: 'monitor', fieldName: 'incoming.poll_interval', keywords: ['incoming', 'poll', 'interval', 'frequency'] },
  { id: 'transactions.monitor.retention_days', label: 'Retention Days', description: 'How many days to retain incoming transaction records', page: '/transactions', tab: 'monitor', fieldName: 'incoming.retention_days', keywords: ['incoming', 'retention', 'days', 'cleanup'] },
  { id: 'transactions.monitor.suspicious_dust_usd', label: 'Suspicious Dust USD Threshold', description: 'USD threshold below which transactions are flagged as dust', page: '/transactions', tab: 'monitor', fieldName: 'incoming.suspicious_dust_usd', keywords: ['incoming', 'suspicious', 'dust', 'threshold', 'usd'] },
  { id: 'transactions.monitor.suspicious_amount_multiplier', label: 'Suspicious Amount Multiplier', description: 'Multiplier for detecting unusually large incoming amounts', page: '/transactions', tab: 'monitor', fieldName: 'incoming.suspicious_amount_multiplier', keywords: ['incoming', 'suspicious', 'amount', 'multiplier', 'large'] },
  { id: 'transactions.monitor.cooldown_minutes', label: 'Notification Cooldown (minutes)', description: 'Cooldown period between duplicate incoming TX notifications', page: '/transactions', tab: 'monitor', fieldName: 'incoming.cooldown_minutes', keywords: ['incoming', 'cooldown', 'notification', 'minutes'] },
  { id: 'transactions.monitor.wss_url', label: 'WebSocket URL', description: 'Custom WebSocket RPC URL for real-time incoming TX detection', page: '/transactions', tab: 'monitor', fieldName: 'incoming.wss_url', keywords: ['incoming', 'websocket', 'wss', 'rpc', 'url'] },

  { id: 'settings..cross_validation_threshold', label: 'Cross Validation Threshold (%)', description: 'Maximum allowed deviation between price oracle sources', page: '/settings', tab: '', fieldName: 'oracle.cross_validation_threshold', keywords: ['oracle', 'price', 'validation', 'threshold', 'deviation'] },
  { id: 'settings..signing_sdk_enabled', label: 'SDK Enabled', description: 'Enable Signing SDK for wallet app approval', page: '/settings', tab: '', fieldName: 'signing_sdk.enabled', keywords: ['signing', 'sdk', 'wallet', 'app', 'enable'] },
  { id: 'settings..signing_sdk_request_expiry', label: 'Request Expiry (min)', description: 'Minutes before a sign request expires', page: '/settings', tab: '', fieldName: 'signing_sdk.request_expiry_min', keywords: ['signing', 'sdk', 'expiry', 'timeout', 'request'] },
  { id: 'settings..signing_sdk_preferred_channel', label: 'Preferred Channel', description: 'Preferred signing channel for SDK requests', page: '/settings', tab: '', fieldName: 'signing_sdk.preferred_channel', keywords: ['signing', 'sdk', 'channel', 'push', 'relay', 'telegram'] },
  { id: 'wallet-apps..signing_sdk_notifications', label: 'Notifications Enabled', description: 'Push event notifications to wallet apps', page: '/wallet-apps', tab: '', fieldName: 'signing_sdk.notifications_enabled', keywords: ['signing', 'sdk', 'notification', 'wallet', 'push'] },

  // --- Smart Account AA global defaults on Settings page ---
  { id: 'settings..smart_account_pimlico_api_key', label: 'Pimlico API Key', description: 'Global default Pimlico bundler API key for smart accounts', page: '/settings', tab: '', fieldName: 'smart_account.pimlico.api_key', keywords: ['smart', 'account', 'pimlico', 'bundler', 'api', 'key', 'erc4337'] },
  { id: 'settings..smart_account_pimlico_policy_id', label: 'Pimlico Paymaster Policy ID', description: 'Global default Pimlico paymaster sponsorship policy ID', page: '/settings', tab: '', fieldName: 'smart_account.pimlico.paymaster_policy_id', keywords: ['smart', 'account', 'pimlico', 'paymaster', 'policy', 'erc4337'] },
  { id: 'settings..smart_account_alchemy_api_key', label: 'Alchemy API Key (AA)', description: 'Global default Alchemy bundler API key for smart accounts', page: '/settings', tab: '', fieldName: 'smart_account.alchemy.api_key', keywords: ['smart', 'account', 'alchemy', 'bundler', 'api', 'key', 'erc4337'] },
  { id: 'settings..smart_account_alchemy_policy_id', label: 'Alchemy Paymaster Policy ID', description: 'Global default Alchemy paymaster policy ID', page: '/settings', tab: '', fieldName: 'smart_account.alchemy.paymaster_policy_id', keywords: ['smart', 'account', 'alchemy', 'paymaster', 'policy', 'erc4337'] },

  // --- ERC-8128 settings on Settings page ---
  { id: 'settings..erc8128_enabled', label: 'ERC-8128 Enabled', description: 'Enable ERC-8128 HTTP message signing', page: '/settings', tab: '', fieldName: 'erc8128.enabled', keywords: ['erc8128', 'signing', 'http', 'rfc9421', 'enable'] },
  { id: 'settings..erc8128_default_preset', label: 'Default Preset', description: 'Default covered components preset for ERC-8128', page: '/settings', tab: '', fieldName: 'erc8128.default_preset', keywords: ['erc8128', 'preset', 'minimal', 'standard', 'strict'] },
  { id: 'settings..erc8128_default_ttl_sec', label: 'Default TTL', description: 'Default signature TTL in seconds', page: '/settings', tab: '', fieldName: 'erc8128.default_ttl_sec', keywords: ['erc8128', 'ttl', 'expiry', 'timeout'] },
  { id: 'settings..erc8128_default_nonce', label: 'Include Nonce', description: 'Include nonce in ERC-8128 signatures by default', page: '/settings', tab: '', fieldName: 'erc8128.default_nonce', keywords: ['erc8128', 'nonce', 'replay'] },
  { id: 'settings..erc8128_default_algorithm', label: 'Algorithm', description: 'ERC-8128 signing algorithm', page: '/settings', tab: '', fieldName: 'erc8128.default_algorithm', keywords: ['erc8128', 'algorithm', 'eip191'] },
  { id: 'settings..erc8128_default_rate_limit_rpm', label: 'Rate Limit', description: 'ERC-8128 rate limit per domain per minute', page: '/settings', tab: '', fieldName: 'erc8128.default_rate_limit_rpm', keywords: ['erc8128', 'rate', 'limit', 'throttle'] },
];
