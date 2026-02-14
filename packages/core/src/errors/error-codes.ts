export type ErrorDomain =
  | 'AUTH'
  | 'SESSION'
  | 'TX'
  | 'POLICY'
  | 'OWNER'
  | 'SYSTEM'
  | 'WALLET'
  | 'WITHDRAW'
  | 'ACTION'
  | 'ADMIN';

export interface ErrorCodeEntry {
  code: string;
  domain: ErrorDomain;
  httpStatus: number;
  retryable: boolean;
  message: string;
}

/**
 * 73 error codes from SS10.12 unified error code matrix.
 * SSoT: 37-rest-api-complete-spec.md section 10.12
 */
export const ERROR_CODES = {
  // --- AUTH domain (8) ---
  INVALID_TOKEN: {
    code: 'INVALID_TOKEN',
    domain: 'AUTH',
    httpStatus: 401,
    retryable: false,
    message: 'Invalid authentication token',
  },
  TOKEN_EXPIRED: {
    code: 'TOKEN_EXPIRED',
    domain: 'AUTH',
    httpStatus: 401,
    retryable: false,
    message: 'Authentication token has expired',
  },
  SESSION_REVOKED: {
    code: 'SESSION_REVOKED',
    domain: 'AUTH',
    httpStatus: 401,
    retryable: false,
    message: 'Session has been revoked',
  },
  INVALID_SIGNATURE: {
    code: 'INVALID_SIGNATURE',
    domain: 'AUTH',
    httpStatus: 401,
    retryable: false,
    message: 'Invalid cryptographic signature',
  },
  INVALID_NONCE: {
    code: 'INVALID_NONCE',
    domain: 'AUTH',
    httpStatus: 401,
    retryable: false,
    message: 'Invalid or expired nonce',
  },
  INVALID_MASTER_PASSWORD: {
    code: 'INVALID_MASTER_PASSWORD',
    domain: 'AUTH',
    httpStatus: 401,
    retryable: false,
    message: 'Invalid master password',
  },
  MASTER_PASSWORD_LOCKED: {
    code: 'MASTER_PASSWORD_LOCKED',
    domain: 'AUTH',
    httpStatus: 429,
    retryable: false,
    message: 'Master password locked due to too many failed attempts',
  },
  SYSTEM_LOCKED: {
    code: 'SYSTEM_LOCKED',
    domain: 'AUTH',
    httpStatus: 503,
    retryable: false,
    message: 'System is locked',
  },

  // --- SESSION domain (8) ---
  SESSION_NOT_FOUND: {
    code: 'SESSION_NOT_FOUND',
    domain: 'SESSION',
    httpStatus: 404,
    retryable: false,
    message: 'Session not found',
  },
  SESSION_EXPIRED: {
    code: 'SESSION_EXPIRED',
    domain: 'SESSION',
    httpStatus: 401,
    retryable: false,
    message: 'Session has expired',
  },
  SESSION_LIMIT_EXCEEDED: {
    code: 'SESSION_LIMIT_EXCEEDED',
    domain: 'SESSION',
    httpStatus: 403,
    retryable: false,
    message: 'Maximum session limit exceeded',
  },
  CONSTRAINT_VIOLATED: {
    code: 'CONSTRAINT_VIOLATED',
    domain: 'SESSION',
    httpStatus: 403,
    retryable: false,
    message: 'Session constraint violated',
  },
  RENEWAL_LIMIT_REACHED: {
    code: 'RENEWAL_LIMIT_REACHED',
    domain: 'SESSION',
    httpStatus: 403,
    retryable: false,
    message: 'Session renewal limit reached',
  },
  SESSION_ABSOLUTE_LIFETIME_EXCEEDED: {
    code: 'SESSION_ABSOLUTE_LIFETIME_EXCEEDED',
    domain: 'SESSION',
    httpStatus: 403,
    retryable: false,
    message: 'Session absolute lifetime exceeded',
  },
  RENEWAL_TOO_EARLY: {
    code: 'RENEWAL_TOO_EARLY',
    domain: 'SESSION',
    httpStatus: 403,
    retryable: true,
    message: 'Session renewal attempted too early',
  },
  SESSION_RENEWAL_MISMATCH: {
    code: 'SESSION_RENEWAL_MISMATCH',
    domain: 'SESSION',
    httpStatus: 403,
    retryable: false,
    message: 'Session renewal count mismatch',
  },

  // --- PIPELINE domain (1) ---
  PIPELINE_HALTED: {
    code: 'PIPELINE_HALTED',
    domain: 'TX',
    httpStatus: 409,
    retryable: false,
    message: 'Pipeline halted (transaction queued for delay or approval)',
  },

  // --- TX domain (24) ---
  INSUFFICIENT_BALANCE: {
    code: 'INSUFFICIENT_BALANCE',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: 'Insufficient balance for transaction',
  },
  INVALID_ADDRESS: {
    code: 'INVALID_ADDRESS',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: 'Invalid blockchain address',
  },
  TX_NOT_FOUND: {
    code: 'TX_NOT_FOUND',
    domain: 'TX',
    httpStatus: 404,
    retryable: false,
    message: 'Transaction not found',
  },
  TX_EXPIRED: {
    code: 'TX_EXPIRED',
    domain: 'TX',
    httpStatus: 410,
    retryable: false,
    message: 'Transaction has expired',
  },
  TX_ALREADY_PROCESSED: {
    code: 'TX_ALREADY_PROCESSED',
    domain: 'TX',
    httpStatus: 409,
    retryable: false,
    message: 'Transaction has already been processed',
  },
  CHAIN_ERROR: {
    code: 'CHAIN_ERROR',
    domain: 'TX',
    httpStatus: 502,
    retryable: true,
    message: 'Blockchain RPC error',
  },
  SIMULATION_FAILED: {
    code: 'SIMULATION_FAILED',
    domain: 'TX',
    httpStatus: 422,
    retryable: false,
    message: 'Transaction simulation failed',
  },
  TOKEN_NOT_FOUND: {
    code: 'TOKEN_NOT_FOUND',
    domain: 'TX',
    httpStatus: 404,
    retryable: false,
    message: 'Token not found',
  },
  TOKEN_NOT_ALLOWED: {
    code: 'TOKEN_NOT_ALLOWED',
    domain: 'TX',
    httpStatus: 403,
    retryable: false,
    message: 'Token not in allowed list',
  },
  INSUFFICIENT_TOKEN_BALANCE: {
    code: 'INSUFFICIENT_TOKEN_BALANCE',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: 'Insufficient token balance',
  },
  CONTRACT_CALL_DISABLED: {
    code: 'CONTRACT_CALL_DISABLED',
    domain: 'TX',
    httpStatus: 403,
    retryable: false,
    message: 'Contract calls are disabled (no CONTRACT_WHITELIST configured)',
  },
  CONTRACT_NOT_WHITELISTED: {
    code: 'CONTRACT_NOT_WHITELISTED',
    domain: 'TX',
    httpStatus: 403,
    retryable: false,
    message: 'Contract address not whitelisted',
  },
  METHOD_NOT_WHITELISTED: {
    code: 'METHOD_NOT_WHITELISTED',
    domain: 'TX',
    httpStatus: 403,
    retryable: false,
    message: 'Method selector not whitelisted',
  },
  APPROVE_DISABLED: {
    code: 'APPROVE_DISABLED',
    domain: 'TX',
    httpStatus: 403,
    retryable: false,
    message: 'Token approvals are disabled (no APPROVED_SPENDERS configured)',
  },
  SPENDER_NOT_APPROVED: {
    code: 'SPENDER_NOT_APPROVED',
    domain: 'TX',
    httpStatus: 403,
    retryable: false,
    message: 'Spender address not in approved list',
  },
  APPROVE_AMOUNT_EXCEEDED: {
    code: 'APPROVE_AMOUNT_EXCEEDED',
    domain: 'TX',
    httpStatus: 403,
    retryable: false,
    message: 'Approve amount exceeds limit',
  },
  UNLIMITED_APPROVE_BLOCKED: {
    code: 'UNLIMITED_APPROVE_BLOCKED',
    domain: 'TX',
    httpStatus: 403,
    retryable: false,
    message: 'Unlimited token approval is blocked',
  },
  BATCH_NOT_SUPPORTED: {
    code: 'BATCH_NOT_SUPPORTED',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: 'Batch transactions not supported on this chain',
  },
  BATCH_SIZE_EXCEEDED: {
    code: 'BATCH_SIZE_EXCEEDED',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: 'Batch instruction count exceeds maximum (20)',
  },
  BATCH_POLICY_VIOLATION: {
    code: 'BATCH_POLICY_VIOLATION',
    domain: 'TX',
    httpStatus: 403,
    retryable: false,
    message: 'Policy violation in batch transaction',
  },
  ENVIRONMENT_NETWORK_MISMATCH: {
    code: 'ENVIRONMENT_NETWORK_MISMATCH',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: "Network is not allowed in this wallet's environment",
  },
  INVALID_TRANSACTION: {
    code: 'INVALID_TRANSACTION',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: 'Invalid raw transaction format',
  },
  WALLET_NOT_SIGNER: {
    code: 'WALLET_NOT_SIGNER',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: 'Wallet is not a signer in this transaction',
  },
  UNSUPPORTED_TX_TYPE: {
    code: 'UNSUPPORTED_TX_TYPE',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: 'Unsupported transaction type',
  },
  CHAIN_ID_MISMATCH: {
    code: 'CHAIN_ID_MISMATCH',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: 'Transaction chain ID does not match requested network',
  },

  // --- POLICY domain (5) ---
  POLICY_NOT_FOUND: {
    code: 'POLICY_NOT_FOUND',
    domain: 'POLICY',
    httpStatus: 404,
    retryable: false,
    message: 'Policy not found',
  },
  POLICY_DENIED: {
    code: 'POLICY_DENIED',
    domain: 'POLICY',
    httpStatus: 403,
    retryable: false,
    message: 'Transaction denied by policy',
  },
  SPENDING_LIMIT_EXCEEDED: {
    code: 'SPENDING_LIMIT_EXCEEDED',
    domain: 'POLICY',
    httpStatus: 403,
    retryable: false,
    message: 'Spending limit exceeded',
  },
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    domain: 'POLICY',
    httpStatus: 429,
    retryable: true,
    message: 'Rate limit exceeded',
  },
  WHITELIST_DENIED: {
    code: 'WHITELIST_DENIED',
    domain: 'POLICY',
    httpStatus: 403,
    retryable: false,
    message: 'Address not in whitelist',
  },

  // --- OWNER domain (5) ---
  OWNER_ALREADY_CONNECTED: {
    code: 'OWNER_ALREADY_CONNECTED',
    domain: 'OWNER',
    httpStatus: 409,
    retryable: false,
    message: 'Owner wallet already connected',
  },
  OWNER_NOT_CONNECTED: {
    code: 'OWNER_NOT_CONNECTED',
    domain: 'OWNER',
    httpStatus: 404,
    retryable: false,
    message: 'Owner wallet not connected',
  },
  OWNER_NOT_FOUND: {
    code: 'OWNER_NOT_FOUND',
    domain: 'OWNER',
    httpStatus: 404,
    retryable: false,
    message: 'Owner not found',
  },
  APPROVAL_TIMEOUT: {
    code: 'APPROVAL_TIMEOUT',
    domain: 'OWNER',
    httpStatus: 410,
    retryable: false,
    message: 'Approval request has timed out',
  },
  APPROVAL_NOT_FOUND: {
    code: 'APPROVAL_NOT_FOUND',
    domain: 'OWNER',
    httpStatus: 404,
    retryable: false,
    message: 'Approval request not found',
  },

  // --- SYSTEM domain (6) ---
  KILL_SWITCH_ACTIVE: {
    code: 'KILL_SWITCH_ACTIVE',
    domain: 'SYSTEM',
    httpStatus: 409,
    retryable: false,
    message: 'Kill switch is active, all operations suspended',
  },
  KILL_SWITCH_NOT_ACTIVE: {
    code: 'KILL_SWITCH_NOT_ACTIVE',
    domain: 'SYSTEM',
    httpStatus: 409,
    retryable: false,
    message: 'Kill switch is not active',
  },
  KEYSTORE_LOCKED: {
    code: 'KEYSTORE_LOCKED',
    domain: 'SYSTEM',
    httpStatus: 503,
    retryable: true,
    message: 'Keystore is locked',
  },
  CHAIN_NOT_SUPPORTED: {
    code: 'CHAIN_NOT_SUPPORTED',
    domain: 'SYSTEM',
    httpStatus: 400,
    retryable: false,
    message: 'Blockchain chain type not supported',
  },
  SHUTTING_DOWN: {
    code: 'SHUTTING_DOWN',
    domain: 'SYSTEM',
    httpStatus: 503,
    retryable: false,
    message: 'System is shutting down',
  },
  ADAPTER_NOT_AVAILABLE: {
    code: 'ADAPTER_NOT_AVAILABLE',
    domain: 'SYSTEM',
    httpStatus: 503,
    retryable: true,
    message: 'Chain adapter not available',
  },

  // --- WALLET domain (3) ---
  WALLET_NOT_FOUND: {
    code: 'WALLET_NOT_FOUND',
    domain: 'WALLET',
    httpStatus: 404,
    retryable: false,
    message: 'Wallet not found',
  },
  WALLET_SUSPENDED: {
    code: 'WALLET_SUSPENDED',
    domain: 'WALLET',
    httpStatus: 409,
    retryable: false,
    message: 'Wallet is suspended',
  },
  WALLET_TERMINATED: {
    code: 'WALLET_TERMINATED',
    domain: 'WALLET',
    httpStatus: 410,
    retryable: false,
    message: 'Wallet has been terminated',
  },

  // --- WITHDRAW domain (4) ---
  NO_OWNER: {
    code: 'NO_OWNER',
    domain: 'WITHDRAW',
    httpStatus: 404,
    retryable: false,
    message: 'No owner connected for withdrawal',
  },
  WITHDRAW_LOCKED_ONLY: {
    code: 'WITHDRAW_LOCKED_ONLY',
    domain: 'WITHDRAW',
    httpStatus: 403,
    retryable: false,
    message: 'Withdrawal only available in LOCKED owner state',
  },
  SWEEP_TOTAL_FAILURE: {
    code: 'SWEEP_TOTAL_FAILURE',
    domain: 'WITHDRAW',
    httpStatus: 500,
    retryable: true,
    message: 'All sweep operations failed',
  },
  INSUFFICIENT_FOR_FEE: {
    code: 'INSUFFICIENT_FOR_FEE',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: 'Insufficient balance for transaction fee',
  },

  // --- ACTION domain (7) ---
  ACTION_NOT_FOUND: {
    code: 'ACTION_NOT_FOUND',
    domain: 'ACTION',
    httpStatus: 404,
    retryable: false,
    message: 'Action not found',
  },
  ACTION_VALIDATION_FAILED: {
    code: 'ACTION_VALIDATION_FAILED',
    domain: 'ACTION',
    httpStatus: 400,
    retryable: false,
    message: 'Action input validation failed',
  },
  ACTION_RESOLVE_FAILED: {
    code: 'ACTION_RESOLVE_FAILED',
    domain: 'ACTION',
    httpStatus: 502,
    retryable: true,
    message: 'Action resolve failed (external API error)',
  },
  ACTION_RETURN_INVALID: {
    code: 'ACTION_RETURN_INVALID',
    domain: 'ACTION',
    httpStatus: 500,
    retryable: false,
    message: 'Action resolve return value schema validation failed',
  },
  ACTION_PLUGIN_LOAD_FAILED: {
    code: 'ACTION_PLUGIN_LOAD_FAILED',
    domain: 'ACTION',
    httpStatus: 500,
    retryable: false,
    message: 'Action plugin failed to load',
  },
  ACTION_NAME_CONFLICT: {
    code: 'ACTION_NAME_CONFLICT',
    domain: 'ACTION',
    httpStatus: 409,
    retryable: false,
    message: 'Action name already registered',
  },
  ACTION_CHAIN_MISMATCH: {
    code: 'ACTION_CHAIN_MISMATCH',
    domain: 'ACTION',
    httpStatus: 400,
    retryable: false,
    message: 'Request chain does not match action provider supported chains',
  },

  // --- ADMIN domain (1) ---
  ROTATION_TOO_RECENT: {
    code: 'ROTATION_TOO_RECENT',
    domain: 'ADMIN',
    httpStatus: 429,
    retryable: false,
    message: 'Key rotation attempted too recently',
  },
} as const satisfies Record<string, ErrorCodeEntry>;

export type ErrorCode = keyof typeof ERROR_CODES;
