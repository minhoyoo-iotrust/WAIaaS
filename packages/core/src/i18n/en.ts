import type { ErrorCode } from '../errors/error-codes.js';
import type { NotificationEventType } from '../enums/notification.js';

/**
 * Messages type definition. Enforces key parity across all locales.
 * Keys in errors must match ERROR_CODES keys exactly (74 error codes).
 * Notification templates cover all 21 event types.
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
}

export const messages: Messages = {
  // Error messages (74 error codes from SS10.12 unified matrix)
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
    // SYSTEM domain (7)
    KILL_SWITCH_ACTIVE: 'Kill switch is already active',
    KILL_SWITCH_NOT_ACTIVE: 'Kill switch is not active',
    KEYSTORE_LOCKED: 'Keystore is locked',
    CHAIN_NOT_SUPPORTED: 'Chain not supported',
    SHUTTING_DOWN: 'Server is shutting down',
    ADAPTER_NOT_AVAILABLE: 'Chain adapter not available',
    SKILL_NOT_FOUND: 'Skill not found',
    // WALLET domain (3)
    WALLET_NOT_FOUND: 'Wallet not found',
    WALLET_SUSPENDED: 'Wallet is suspended',
    WALLET_TERMINATED: 'Wallet has been terminated',
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
  },
  // Notification templates (21 event types)
  notifications: {
    TX_REQUESTED: { title: 'Transaction Requested', body: 'Wallet {walletId} requested {amount} transfer to {to}' },
    TX_QUEUED: { title: 'Transaction Queued', body: 'Transaction {txId} queued for processing' },
    TX_SUBMITTED: { title: 'Transaction Submitted', body: 'Transaction {txId} submitted to blockchain' },
    TX_CONFIRMED: { title: 'Transaction Confirmed', body: 'Transaction {txId} confirmed. Amount: {amount}' },
    TX_FAILED: { title: 'Transaction Failed', body: 'Transaction {txId} failed: {error}' },
    TX_CANCELLED: { title: 'Transaction Cancelled', body: 'Transaction {txId} cancelled' },
    TX_DOWNGRADED_DELAY: { title: 'Transaction Delayed', body: 'Transaction {txId} downgraded to delay queue ({seconds}s cooldown)' },
    TX_APPROVAL_REQUIRED: { title: 'Approval Required', body: 'Transaction {txId} requires owner approval. Amount: {amount} to {to}' },
    TX_APPROVAL_EXPIRED: { title: 'Approval Expired', body: 'Approval for transaction {txId} has expired' },
    POLICY_VIOLATION: { title: 'Policy Violation', body: 'Wallet {walletId} policy violation: {reason}. Policy: {policyType}. Manage: {adminLink}' },
    WALLET_SUSPENDED: { title: 'Wallet Suspended', body: 'Wallet {walletId} has been suspended: {reason}' },
    KILL_SWITCH_ACTIVATED: { title: 'Kill Switch Activated', body: 'Kill switch activated by {activatedBy}. All operations halted' },
    KILL_SWITCH_RECOVERED: { title: 'Kill Switch Recovered', body: 'Kill switch deactivated. Normal operations resumed' },
    AUTO_STOP_TRIGGERED: { title: 'Auto-Stop Triggered', body: 'Daemon auto-stopped after {failures} consecutive failures' },
    SESSION_EXPIRING_SOON: { title: 'Session Expiring Soon', body: 'Session {sessionId} for wallet {walletId} expires in {minutes} minutes' },
    SESSION_EXPIRED: { title: 'Session Expired', body: 'Session {sessionId} for wallet {walletId} has expired' },
    SESSION_CREATED: { title: 'Session Created', body: 'New session created for wallet {walletId}' },
    OWNER_SET: { title: 'Owner Registered', body: 'Owner registered for wallet {walletId}: {ownerAddress}' },
    OWNER_REMOVED: { title: 'Owner Removed', body: 'Owner removed from wallet {walletId}' },
    OWNER_VERIFIED: { title: 'Owner Verified', body: 'Owner verified for wallet {walletId}' },
    DAILY_SUMMARY: { title: 'Daily Summary', body: 'Wallets: {walletCount}, Transactions: {txCount}, Sessions: {sessionCount}' },
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
};
