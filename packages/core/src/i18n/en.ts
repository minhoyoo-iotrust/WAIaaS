import type { ErrorCode } from '../errors/error-codes.js';

/**
 * Messages type definition. Enforces key parity across all locales.
 * Keys in errors must match ERROR_CODES keys exactly (67 error codes).
 */
export interface Messages {
  errors: Record<ErrorCode, string>;
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
  // Error messages (67 error codes from SS10.12 unified matrix)
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
    // TX domain (20)
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
    // SYSTEM domain (6)
    KILL_SWITCH_ACTIVE: 'Kill switch is already active',
    KILL_SWITCH_NOT_ACTIVE: 'Kill switch is not active',
    KEYSTORE_LOCKED: 'Keystore is locked',
    CHAIN_NOT_SUPPORTED: 'Chain not supported',
    SHUTTING_DOWN: 'Server is shutting down',
    ADAPTER_NOT_AVAILABLE: 'Chain adapter not available',
    // AGENT domain (3)
    AGENT_NOT_FOUND: 'Agent not found',
    AGENT_SUSPENDED: 'Agent is suspended',
    AGENT_TERMINATED: 'Agent has been terminated',
    // WITHDRAW domain (4)
    NO_OWNER: 'No owner registered for this agent',
    WITHDRAW_LOCKED_ONLY: 'Withdrawal requires LOCKED owner state',
    SWEEP_TOTAL_FAILURE: 'All sweep operations failed',
    INSUFFICIENT_FOR_FEE: 'Insufficient balance for transaction fee',
    // ACTION domain (7)
    ACTION_NOT_FOUND: 'Action not found',
    ACTION_VALIDATION_FAILED: 'Action validation failed',
    ACTION_RESOLVE_FAILED: 'Action resolve failed',
    ACTION_RETURN_INVALID: 'Action return value is invalid',
    ACTION_PLUGIN_LOAD_FAILED: 'Action plugin failed to load',
    ACTION_NAME_CONFLICT: 'Action name conflict',
    ACTION_CHAIN_MISMATCH: 'Action chain mismatch',
    // ADMIN domain (1)
    ROTATION_TOO_RECENT: 'Secret rotation too recent',
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
