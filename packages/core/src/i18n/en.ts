import type { ErrorCode } from '../errors/error-codes.js';
import type { NotificationEventType } from '../enums/notification.js';

/**
 * Messages type definition. Enforces key parity across all locales.
 * Keys in errors must match ERROR_CODES keys exactly (100 error codes).
 * Notification templates cover all 22 event types.
 */
export interface Messages {
  errors: Record<ErrorCode, string>;
  notifications: Record<NotificationEventType, { title: string; body: string }>;
  system: {
    daemon_started: string;
    daemon_stopped: string;
    daemon_already_running: string;
    init_complete: string;
  };
  cli: {
    prompt_master_password: string;
    confirm_master_password: string;
    password_mismatch: string;
    status_running: string;
    status_stopped: string;
  };
  telegram: {
    bot_welcome: string;
    bot_pending_approval: string;
    bot_already_registered: string;
    bot_help: string;
    bot_status_header: string;
    bot_status_body: string;
    bot_unauthorized: string;
    bot_admin_only: string;
    bot_pending_list_header: string;
    bot_pending_empty: string;
    bot_approve_success: string;
    bot_reject_success: string;
    bot_tx_not_found: string;
    bot_killswitch_confirm: string;
    bot_killswitch_success: string;
    bot_killswitch_cancelled: string;
    bot_killswitch_already_active: string;
    bot_wallets_header: string;
    bot_wallets_empty: string;
    bot_newsession_select: string;
    bot_newsession_created: string;
    bot_newsession_wallet_not_found: string;
    keyboard_approve: string;
    keyboard_reject: string;
    keyboard_yes: string;
    keyboard_no: string;
  };
}

export const messages: Messages = {
  // Error messages (100 error codes from SS10.12 unified matrix + signing protocol)
  errors: {
    // PIPELINE domain (1)
    PIPELINE_HALTED: 'Pipeline halted (transaction queued for delay or approval)',
    // AUTH domain (8)
    INVALID_TOKEN: 'Invalid authentication token',
    TOKEN_EXPIRED: 'Authentication token has expired',
    SESSION_REVOKED: 'Session has been revoked',
    INVALID_SIGNATURE: 'Invalid signature',
    INVALID_NONCE: 'Invalid or expired nonce',
    INVALID_MASTER_PASSWORD: 'Invalid master password',
    MASTER_PASSWORD_LOCKED: 'Master password locked due to too many attempts',
    SYSTEM_LOCKED: 'System is locked (Kill Switch active)',
    // SESSION domain (8)
    SESSION_NOT_FOUND: 'Session not found',
    SESSION_EXPIRED: 'Session has expired',
    SESSION_LIMIT_EXCEEDED: 'Session limit exceeded',
    CONSTRAINT_VIOLATED: 'Session constraint violated',
    RENEWAL_LIMIT_REACHED: 'Session renewal limit reached',
    SESSION_ABSOLUTE_LIFETIME_EXCEEDED: 'Session absolute lifetime exceeded',
    RENEWAL_TOO_EARLY: 'Session renewal too early',
    SESSION_RENEWAL_MISMATCH: 'Session renewal token mismatch',
    // TX domain (25)
    INSUFFICIENT_BALANCE: 'Insufficient balance',
    INVALID_ADDRESS: 'Invalid address format',
    TX_NOT_FOUND: 'Transaction not found',
    TX_EXPIRED: 'Transaction has expired',
    TX_ALREADY_PROCESSED: 'Transaction already processed',
    CHAIN_ERROR: 'Blockchain error',
    SIMULATION_FAILED: 'Transaction simulation failed',
    TOKEN_NOT_FOUND: 'Token not found',
    TOKEN_NOT_ALLOWED: 'Token not allowed by policy',
    INSUFFICIENT_TOKEN_BALANCE: 'Insufficient token balance',
    CONTRACT_CALL_DISABLED: 'Contract calls are disabled',
    CONTRACT_NOT_WHITELISTED: 'Contract not whitelisted',
    METHOD_NOT_WHITELISTED: 'Method not whitelisted',
    APPROVE_DISABLED: 'Approve operations are disabled',
    SPENDER_NOT_APPROVED: 'Spender not approved',
    APPROVE_AMOUNT_EXCEEDED: 'Approve amount exceeded',
    UNLIMITED_APPROVE_BLOCKED: 'Unlimited approve is blocked',
    BATCH_NOT_SUPPORTED: 'Batch transactions not supported on this chain',
    BATCH_SIZE_EXCEEDED: 'Batch size exceeded',
    BATCH_POLICY_VIOLATION: 'Batch policy violation',
    ENVIRONMENT_NETWORK_MISMATCH: "Network is not allowed in this wallet's environment",
    INVALID_TRANSACTION: 'Invalid raw transaction format',
    WALLET_NOT_SIGNER: 'Wallet is not a signer in this transaction',
    UNSUPPORTED_TX_TYPE: 'Unsupported transaction type',
    CHAIN_ID_MISMATCH: 'Transaction chain ID does not match requested network',
    ABI_ENCODING_FAILED: 'ABI encoding failed',
    // POLICY domain (5)
    POLICY_NOT_FOUND: 'Policy not found',
    POLICY_DENIED: 'Policy denied',
    SPENDING_LIMIT_EXCEEDED: 'Spending limit exceeded',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
    WHITELIST_DENIED: 'Address not in whitelist',
    // OWNER domain (5)
    OWNER_ALREADY_CONNECTED: 'Owner already connected',
    OWNER_NOT_CONNECTED: 'Owner not connected',
    OWNER_NOT_FOUND: 'Owner not found',
    APPROVAL_TIMEOUT: 'Approval request has timed out',
    APPROVAL_NOT_FOUND: 'Approval request not found',
    OWNER_NOT_SET: 'Owner address must be set before this operation',
    OWNER_ADDRESS_MISMATCH: 'Connected wallet address does not match registered owner',
    // SYSTEM domain (9)
    KILL_SWITCH_ACTIVE: 'Kill switch is already active',
    KILL_SWITCH_NOT_ACTIVE: 'Kill switch is not active',
    KILL_SWITCH_ALREADY_ACTIVE: 'Kill switch transition conflict',
    INVALID_STATE_TRANSITION: 'Invalid kill switch state transition',
    KEYSTORE_LOCKED: 'Keystore is locked',
    CHAIN_NOT_SUPPORTED: 'Chain not supported',
    SHUTTING_DOWN: 'Server is shutting down',
    ADAPTER_NOT_AVAILABLE: 'Chain adapter not available',
    SKILL_NOT_FOUND: 'Skill not found',
    SCHEMA_INCOMPATIBLE: 'Database schema version is incompatible with this code version',
    // WALLET domain (6)
    WALLET_NOT_FOUND: 'Wallet not found',
    WALLET_SUSPENDED: 'Wallet is suspended',
    WALLET_TERMINATED: 'Wallet has been terminated',
    WC_SESSION_EXISTS: 'Wallet already has an active WC session',
    WC_SESSION_NOT_FOUND: 'No active WC session for this wallet',
    // SYSTEM domain (WC)
    WC_NOT_CONFIGURED: 'WalletConnect is not configured',
    WC_SIGNING_FAILED: 'WalletConnect signing request failed',
    // WITHDRAW domain (4)
    NO_OWNER: 'No owner registered for this wallet',
    WITHDRAW_LOCKED_ONLY: 'Withdrawal requires LOCKED owner state',
    SWEEP_TOTAL_FAILURE: 'All sweep operations failed',
    INSUFFICIENT_FOR_FEE: 'Insufficient balance for transaction fee',
    // ACTION domain (8)
    ACTION_NOT_FOUND: 'Action not found',
    API_KEY_REQUIRED: 'API key required for this action provider',
    ACTION_VALIDATION_FAILED: 'Action validation failed',
    ACTION_RESOLVE_FAILED: 'Action resolve failed',
    ACTION_RETURN_INVALID: 'Action return value is invalid',
    ACTION_PLUGIN_LOAD_FAILED: 'Action plugin failed to load',
    ACTION_NAME_CONFLICT: 'Action name conflict',
    ACTION_CHAIN_MISMATCH: 'Action chain mismatch',
    // ADMIN domain (1)
    ROTATION_TOO_RECENT: 'Secret rotation too recent',
    // X402 domain (8)
    X402_DISABLED: 'x402 payments are disabled',
    X402_DOMAIN_NOT_ALLOWED: 'Domain not allowed for x402 payments',
    X402_SSRF_BLOCKED: 'Request blocked: target resolves to private/reserved IP',
    X402_UNSUPPORTED_SCHEME: 'Unsupported x402 payment scheme or network',
    X402_PAYMENT_REJECTED: 'x402 payment was rejected by the resource server',
    X402_DELAY_TIMEOUT: 'x402 payment exceeds request timeout (DELAY tier)',
    X402_APPROVAL_REQUIRED: 'x402 payment requires owner approval (amount too high)',
    X402_SERVER_ERROR: 'Resource server error after x402 payment',
    // SIGNING domain (7)
    WALLET_NOT_REGISTERED: 'Wallet not registered in signing SDK',
    SIGNING_SDK_DISABLED: 'Signing SDK is disabled',
    SIGN_REQUEST_NOT_FOUND: 'Sign request not found',
    SIGN_REQUEST_EXPIRED: 'Sign request has expired',
    SIGNER_ADDRESS_MISMATCH: 'Signer address does not match wallet owner',
    INVALID_SIGN_RESPONSE: 'Invalid sign response format',
    SIGN_REQUEST_ALREADY_PROCESSED: 'Sign request has already been processed',
  },
  // Notification templates (22 event types)
  notifications: {
    TX_REQUESTED: { title: 'Transaction Requested', body: 'Wallet {walletId} requested {amount} transfer to {to} {display_amount}' },
    TX_QUEUED: { title: 'Transaction Queued', body: 'Transaction {txId} queued for processing' },
    TX_SUBMITTED: { title: 'Transaction Submitted', body: 'Transaction {txId} submitted to blockchain {display_amount}' },
    TX_CONFIRMED: { title: 'Transaction Confirmed', body: 'Transaction {txId} confirmed. Amount: {amount} {display_amount}' },
    TX_FAILED: { title: 'Transaction Failed', body: 'Transaction {txId} failed: {error} {display_amount}' },
    TX_CANCELLED: { title: 'Transaction Cancelled', body: 'Transaction {txId} cancelled' },
    TX_DOWNGRADED_DELAY: { title: 'Transaction Delayed', body: 'Transaction {txId} downgraded to delay queue ({seconds}s cooldown)' },
    TX_APPROVAL_REQUIRED: { title: 'Approval Required', body: 'Transaction {txId} requires owner approval. Amount: {amount} to {to} {display_amount}' },
    TX_APPROVAL_EXPIRED: { title: 'Approval Expired', body: 'Approval for transaction {txId} has expired' },
    POLICY_VIOLATION: { title: 'Policy Violation', body: 'Wallet {walletId} policy violation: {reason}. Policy: {policyType}. Manage: {adminLink}' },
    WALLET_SUSPENDED: { title: 'Wallet Suspended', body: 'Wallet {walletId} has been suspended: {reason}' },
    KILL_SWITCH_ACTIVATED: { title: 'Kill Switch Activated', body: 'Kill switch activated by {activatedBy}. All operations halted' },
    KILL_SWITCH_RECOVERED: { title: 'Kill Switch Recovered', body: 'Kill switch deactivated. Normal operations resumed' },
    KILL_SWITCH_ESCALATED: { title: 'Kill Switch Escalated', body: 'Kill switch escalated to LOCKED state. Immediate action required' },
    AUTO_STOP_TRIGGERED: { title: 'Auto-Stop Triggered', body: 'Wallet {walletId} auto-stopped: {reason}. Rule: {rule}' },
    SESSION_EXPIRING_SOON: { title: 'Session Expiring Soon', body: 'Session {sessionId} for wallet {walletId} expires in {minutes} minutes' },
    SESSION_EXPIRED: { title: 'Session Expired', body: 'Session {sessionId} for wallet {walletId} has expired' },
    SESSION_CREATED: { title: 'Session Created', body: 'New session created for wallet {walletId}' },
    OWNER_SET: { title: 'Owner Registered', body: 'Owner registered for wallet {walletId}: {ownerAddress}' },
    OWNER_REMOVED: { title: 'Owner Removed', body: 'Owner removed from wallet {walletId}' },
    OWNER_VERIFIED: { title: 'Owner Verified', body: 'Owner verified for wallet {walletId}' },
    DAILY_SUMMARY: { title: 'Daily Summary', body: 'Wallets: {walletCount}, Transactions: {txCount}, Sessions: {sessionCount}' },
    CUMULATIVE_LIMIT_WARNING: { title: 'Cumulative Spending Warning', body: 'Wallet {walletId} {type} spending at {ratio}% of limit (${spent} / ${limit}) {display_amount}' },
    LOW_BALANCE: { title: 'Low Balance Alert', body: 'Wallet {walletId} balance low: {balance} {currency}. Threshold: {threshold} {currency}. Please top up.' },
    APPROVAL_CHANNEL_SWITCHED: { title: 'Approval Channel Switched', body: 'Approval for transaction {txId} switched from {from_channel} to {to_channel}. Reason: {reason}' },
    UPDATE_AVAILABLE: { title: 'WAIaaS Update Available', body: 'A new version {latestVersion} is available (current: {currentVersion}). Run `waiaas update` to update.' },
  },
  // System messages
  system: {
    daemon_started: 'WAIaaS daemon started',
    daemon_stopped: 'WAIaaS daemon stopped',
    daemon_already_running: 'Daemon is already running',
    init_complete: 'WAIaaS initialized successfully',
  },
  // CLI messages
  cli: {
    prompt_master_password: 'Enter master password:',
    confirm_master_password: 'Confirm master password:',
    password_mismatch: 'Passwords do not match',
    status_running: 'Status: running',
    status_stopped: 'Status: stopped',
  },
  // Telegram Bot messages (MarkdownV2 pre-escaped where needed)
  telegram: {
    bot_welcome: 'Welcome to WAIaaS Bot\\! Your chat has been registered\\.',
    bot_pending_approval: 'Your registration is pending admin approval\\.',
    bot_already_registered: 'You are already registered\\.',
    bot_help: [
      '*Available Commands*',
      '',
      '/start \\- Register this chat',
      '/help \\- Show this help message',
      '/status \\- Show daemon status',
      '/wallets \\- List wallets',
      '/newsession \\- Create a new session',
      '/killswitch \\- Activate kill switch',
      '/pending \\- List pending registrations \\(admin\\)',
    ].join('\n'),
    bot_status_header: 'Daemon Status',
    bot_status_body: 'Uptime: {uptime}\nKill Switch: {killSwitch}\nWallets: {walletCount} \\({activeCount} active\\)\nSessions: {sessionCount} active',
    bot_unauthorized: 'You are not authorized\\. Please contact admin\\.',
    bot_admin_only: 'This command requires admin privileges\\.',
    bot_pending_list_header: 'Pending Approvals',
    bot_pending_empty: 'No pending transactions\\.',
    bot_approve_success: 'Transaction approved\\.',
    bot_reject_success: 'Transaction rejected\\.',
    bot_tx_not_found: 'Transaction not found\\.',
    bot_killswitch_confirm: 'Are you sure you want to activate the kill switch\\?',
    bot_killswitch_success: 'Kill switch activated\\. All operations halted\\.',
    bot_killswitch_cancelled: 'Kill switch activation cancelled\\.',
    bot_killswitch_already_active: 'Kill switch is already active \\(state: {state}\\)\\.',
    bot_wallets_header: 'Wallets',
    bot_wallets_empty: 'No wallets found\\.',
    bot_newsession_select: 'Select a wallet to create a session for:',
    bot_newsession_created: 'Session created\\. Token: `{token}`',
    bot_newsession_wallet_not_found: 'Wallet not found or inactive\\.',
    keyboard_approve: 'Approve',
    keyboard_reject: 'Reject',
    keyboard_yes: 'Yes',
    keyboard_no: 'No',
  },
};
