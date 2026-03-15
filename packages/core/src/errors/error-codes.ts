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
  | 'ADMIN'
  | 'X402'
  | 'SIGNING'
  | 'CHAIN'
  | 'ERC8128'
  | 'NFT'
  | 'USEROP'
  | 'CREDENTIAL';

export interface ErrorCodeEntry {
  code: string;
  domain: ErrorDomain;
  httpStatus: number;
  retryable: boolean;
  message: string;
}

/**
 * 117 error codes from SS10.12 unified error code matrix + signing protocol + session multi-wallet + ERC-4337.
 * SSoT: 37-rest-api-complete-spec.md section 10.12 + 73-signing-protocol-v1.md
 * v29.3: +WALLET_ID_REQUIRED, +NETWORK_REQUIRED, -CANNOT_REMOVE_DEFAULT_WALLET (net +1)
 * v31.10: +INVALID_TOKEN_IDENTIFIER, +STATS_NOT_CONFIGURED (net +2)
 * v31.12: +CREDENTIAL_NOT_FOUND, +CREDENTIAL_EXPIRED, +SIGNING_SCHEME_UNSUPPORTED, +CAPABILITY_NOT_FOUND, +VENUE_NOT_ALLOWED, +EXTERNAL_ACTION_FAILED (net +6)
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

  // --- SESSION domain (12: -CANNOT_REMOVE_DEFAULT_WALLET, +WALLET_ID_REQUIRED) ---
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
  RENEWAL_NOT_REQUIRED: {
    code: 'RENEWAL_NOT_REQUIRED',
    domain: 'SESSION',
    httpStatus: 400,
    retryable: false,
    message: 'Unlimited session does not require renewal',
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
  WALLET_ACCESS_DENIED: {
    code: 'WALLET_ACCESS_DENIED',
    domain: 'SESSION',
    httpStatus: 403,
    retryable: false,
    message: 'Wallet not accessible from this session',
  },
  WALLET_ALREADY_LINKED: {
    code: 'WALLET_ALREADY_LINKED',
    domain: 'SESSION',
    httpStatus: 409,
    retryable: false,
    message: 'Wallet already linked to this session',
  },
  SESSION_REQUIRES_WALLET: {
    code: 'SESSION_REQUIRES_WALLET',
    domain: 'SESSION',
    httpStatus: 400,
    retryable: false,
    message: 'Session must have at least one wallet',
  },
  WALLET_ID_REQUIRED: {
    code: 'WALLET_ID_REQUIRED',
    domain: 'SESSION',
    httpStatus: 400,
    retryable: false,
    message: 'Wallet ID is required when session has multiple wallets',
  },

  // --- PIPELINE domain (1) ---
  PIPELINE_HALTED: {
    code: 'PIPELINE_HALTED',
    domain: 'TX',
    httpStatus: 409,
    retryable: false,
    message: 'Pipeline halted (transaction queued for delay or approval)',
  },

  // --- TX domain (26: +NETWORK_REQUIRED) ---
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
  SIMULATION_TIMEOUT: {
    code: 'SIMULATION_TIMEOUT',
    domain: 'TX',
    httpStatus: 504,
    retryable: true,
    message: 'Transaction simulation timed out',
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
  NETWORK_REQUIRED: {
    code: 'NETWORK_REQUIRED',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: 'Network is required for EVM wallets',
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
  ABI_ENCODING_FAILED: {
    code: 'ABI_ENCODING_FAILED',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: 'ABI encoding failed',
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
  OWNER_NOT_SET: {
    code: 'OWNER_NOT_SET',
    domain: 'OWNER',
    httpStatus: 400,
    retryable: false,
    message: 'Owner address must be set before this operation',
  },
  OWNER_ADDRESS_MISMATCH: {
    code: 'OWNER_ADDRESS_MISMATCH',
    domain: 'OWNER',
    httpStatus: 403,
    retryable: false,
    message: 'Connected wallet address does not match registered owner',
  },

  // --- SYSTEM domain (9) ---
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
  KILL_SWITCH_ALREADY_ACTIVE: {
    code: 'KILL_SWITCH_ALREADY_ACTIVE',
    domain: 'SYSTEM',
    httpStatus: 409,
    retryable: false,
    message: 'Kill switch transition conflict',
  },
  INVALID_STATE_TRANSITION: {
    code: 'INVALID_STATE_TRANSITION',
    domain: 'SYSTEM',
    httpStatus: 409,
    retryable: false,
    message: 'Invalid kill switch state transition',
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
  SKILL_NOT_FOUND: {
    code: 'SKILL_NOT_FOUND',
    domain: 'SYSTEM',
    httpStatus: 404,
    retryable: false,
    message: 'Skill not found',
  },
  SCHEMA_INCOMPATIBLE: {
    code: 'SCHEMA_INCOMPATIBLE',
    domain: 'SYSTEM',
    httpStatus: 503,
    retryable: false,
    message: 'Database schema version is incompatible with this code version',
  },
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    domain: 'SYSTEM',
    httpStatus: 429,
    retryable: true,
    message: 'Rate limit exceeded',
  },

  // --- WALLET domain (6) ---
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
  WALLET_NOT_TERMINATED: {
    code: 'WALLET_NOT_TERMINATED',
    domain: 'WALLET',
    httpStatus: 409,
    retryable: false,
    message: 'Wallet must be terminated before purging',
  },
  WC_SESSION_EXISTS: {
    code: 'WC_SESSION_EXISTS',
    domain: 'WALLET',
    httpStatus: 409,
    retryable: false,
    message: 'Wallet already has an active WC session',
  },
  WC_SESSION_NOT_FOUND: {
    code: 'WC_SESSION_NOT_FOUND',
    domain: 'WALLET',
    httpStatus: 404,
    retryable: false,
    message: 'No active WC session for this wallet',
  },

  // --- SYSTEM domain (WC) ---
  WC_NOT_CONFIGURED: {
    code: 'WC_NOT_CONFIGURED',
    domain: 'SYSTEM',
    httpStatus: 503,
    retryable: false,
    message: 'WalletConnect is not configured',
  },
  WC_SIGNING_FAILED: {
    code: 'WC_SIGNING_FAILED',
    domain: 'SYSTEM',
    httpStatus: 502,
    retryable: true,
    message: 'WalletConnect signing request failed',
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

  // --- ACTION domain (8) ---
  ACTION_NOT_FOUND: {
    code: 'ACTION_NOT_FOUND',
    domain: 'ACTION',
    httpStatus: 404,
    retryable: false,
    message: 'Action not found',
  },
  API_KEY_REQUIRED: {
    code: 'API_KEY_REQUIRED',
    domain: 'ACTION',
    httpStatus: 403,
    retryable: false,
    message: 'API key required for this action provider',
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

  // --- ADMIN domain (2) ---
  ROTATION_TOO_RECENT: {
    code: 'ROTATION_TOO_RECENT',
    domain: 'ADMIN',
    httpStatus: 429,
    retryable: false,
    message: 'Key rotation attempted too recently',
  },
  STATS_NOT_CONFIGURED: {
    code: 'STATS_NOT_CONFIGURED',
    domain: 'ADMIN',
    httpStatus: 503,
    retryable: false,
    message: 'Stats service not configured',
  },

  // --- X402 domain (8) ---
  X402_DISABLED: {
    code: 'X402_DISABLED',
    domain: 'X402',
    httpStatus: 403,
    retryable: false,
    message: 'x402 payments are disabled',
  },
  X402_DOMAIN_NOT_ALLOWED: {
    code: 'X402_DOMAIN_NOT_ALLOWED',
    domain: 'X402',
    httpStatus: 403,
    retryable: false,
    message: 'Domain not allowed for x402 payments',
  },
  X402_SSRF_BLOCKED: {
    code: 'X402_SSRF_BLOCKED',
    domain: 'X402',
    httpStatus: 403,
    retryable: false,
    message: 'Request blocked: target resolves to private/reserved IP',
  },
  X402_UNSUPPORTED_SCHEME: {
    code: 'X402_UNSUPPORTED_SCHEME',
    domain: 'X402',
    httpStatus: 400,
    retryable: false,
    message: 'Unsupported x402 payment scheme or network',
  },
  X402_PAYMENT_REJECTED: {
    code: 'X402_PAYMENT_REJECTED',
    domain: 'X402',
    httpStatus: 402,
    retryable: false,
    message: 'x402 payment was rejected by the resource server',
  },
  X402_DELAY_TIMEOUT: {
    code: 'X402_DELAY_TIMEOUT',
    domain: 'X402',
    httpStatus: 408,
    retryable: true,
    message: 'x402 payment exceeds request timeout (DELAY tier)',
  },
  X402_APPROVAL_REQUIRED: {
    code: 'X402_APPROVAL_REQUIRED',
    domain: 'X402',
    httpStatus: 403,
    retryable: false,
    message: 'x402 payment requires owner approval (amount too high)',
  },
  X402_SERVER_ERROR: {
    code: 'X402_SERVER_ERROR',
    domain: 'X402',
    httpStatus: 502,
    retryable: true,
    message: 'Resource server error after x402 payment',
  },

  // --- SIGNING domain (8) ---
  WALLET_NOT_REGISTERED: {
    code: 'WALLET_NOT_REGISTERED',
    domain: 'SIGNING',
    httpStatus: 404,
    retryable: false,
    message: 'Wallet not registered in signing SDK',
  },
  SIGNING_SDK_DISABLED: {
    code: 'SIGNING_SDK_DISABLED',
    domain: 'SIGNING',
    httpStatus: 403,
    retryable: false,
    message: 'Signing SDK is disabled',
  },
  SIGN_REQUEST_NOT_FOUND: {
    code: 'SIGN_REQUEST_NOT_FOUND',
    domain: 'SIGNING',
    httpStatus: 404,
    retryable: false,
    message: 'Sign request not found',
  },
  SIGN_REQUEST_EXPIRED: {
    code: 'SIGN_REQUEST_EXPIRED',
    domain: 'SIGNING',
    httpStatus: 408,
    retryable: false,
    message: 'Sign request has expired',
  },
  SIGNER_ADDRESS_MISMATCH: {
    code: 'SIGNER_ADDRESS_MISMATCH',
    domain: 'SIGNING',
    httpStatus: 403,
    retryable: false,
    message: 'Signer address does not match wallet owner',
  },
  INVALID_SIGN_RESPONSE: {
    code: 'INVALID_SIGN_RESPONSE',
    domain: 'SIGNING',
    httpStatus: 400,
    retryable: false,
    message: 'Invalid sign response format',
  },
  SIGN_REQUEST_ALREADY_PROCESSED: {
    code: 'SIGN_REQUEST_ALREADY_PROCESSED',
    domain: 'SIGNING',
    httpStatus: 409,
    retryable: false,
    message: 'Sign request has already been processed',
  },
  SIGNING_DISABLED: {
    code: 'SIGNING_DISABLED',
    domain: 'SIGNING',
    httpStatus: 403,
    retryable: false,
    message: 'Signing disabled for this wallet app',
  },

  // --- ADMIN domain (wallet apps) ---
  WALLET_APP_DUPLICATE: {
    code: 'WALLET_APP_DUPLICATE',
    domain: 'ADMIN',
    httpStatus: 409,
    retryable: false,
    message: 'Wallet app already registered',
  },
  WALLET_APP_NOT_FOUND: {
    code: 'WALLET_APP_NOT_FOUND',
    domain: 'ADMIN',
    httpStatus: 404,
    retryable: false,
    message: 'Wallet app not found',
  },

  // --- ADMIN domain (backup) ---
  INVALID_BACKUP_FORMAT: {
    code: 'INVALID_BACKUP_FORMAT',
    domain: 'ADMIN',
    httpStatus: 400,
    retryable: false,
    message: 'Not a valid WAIaaS backup file (magic number mismatch)',
  },
  UNSUPPORTED_BACKUP_VERSION: {
    code: 'UNSUPPORTED_BACKUP_VERSION',
    domain: 'ADMIN',
    httpStatus: 400,
    retryable: false,
    message: 'Unsupported backup format version',
  },
  BACKUP_CORRUPTED: {
    code: 'BACKUP_CORRUPTED',
    domain: 'ADMIN',
    httpStatus: 400,
    retryable: false,
    message: 'Backup archive is corrupted or has been tampered with',
  },
  BACKUP_NOT_FOUND: {
    code: 'BACKUP_NOT_FOUND',
    domain: 'ADMIN',
    httpStatus: 404,
    retryable: false,
    message: 'Backup file not found',
  },

  // --- ADMIN domain (webhook) ---
  WEBHOOK_NOT_FOUND: {
    code: 'WEBHOOK_NOT_FOUND',
    domain: 'ADMIN',
    httpStatus: 404,
    retryable: false,
    message: 'Webhook not found',
  },

  // --- ADMIN domain (autostop) ---
  RULE_NOT_FOUND: {
    code: 'RULE_NOT_FOUND',
    domain: 'ADMIN',
    httpStatus: 404,
    retryable: false,
    message: 'AutoStop rule not found',
  },

  // --- TX domain (ERC-4337 Account Abstraction) ---
  PAYMASTER_REJECTED: {
    code: 'PAYMASTER_REJECTED',
    domain: 'TX',
    httpStatus: 502,
    retryable: false,
    message: 'Paymaster rejected the UserOperation',
  },
  TRANSACTION_TIMEOUT: {
    code: 'TRANSACTION_TIMEOUT',
    domain: 'TX',
    httpStatus: 504,
    retryable: true,
    message: 'Transaction confirmation timed out',
  },
  TRANSACTION_REVERTED: {
    code: 'TRANSACTION_REVERTED',
    domain: 'TX',
    httpStatus: 422,
    retryable: false,
    message: 'Transaction reverted on-chain',
  },

  // --- Chain domain (1) ---
  UNSUPPORTED_CHAIN: {
    code: 'UNSUPPORTED_CHAIN',
    domain: 'CHAIN',
    httpStatus: 400,
    retryable: false,
    message: 'Operation not supported for this chain type',
  },

  // --- ERC-8128 domain (3) ---
  ERC8128_DISABLED: {
    code: 'ERC8128_DISABLED',
    domain: 'ERC8128',
    httpStatus: 403,
    retryable: false,
    message: 'ERC-8128 signed HTTP requests are disabled',
  },
  ERC8128_DOMAIN_NOT_ALLOWED: {
    code: 'ERC8128_DOMAIN_NOT_ALLOWED',
    domain: 'ERC8128',
    httpStatus: 403,
    retryable: false,
    message: 'Domain not allowed for ERC-8128 signing',
  },
  ERC8128_RATE_LIMITED: {
    code: 'ERC8128_RATE_LIMITED',
    domain: 'ERC8128',
    httpStatus: 429,
    retryable: true,
    message: 'ERC-8128 signing rate limit exceeded for this domain',
  },
  // --- NFT domain (6) ---
  NFT_NOT_FOUND: {
    code: 'NFT_NOT_FOUND',
    domain: 'NFT',
    httpStatus: 404,
    retryable: false,
    message: 'NFT not found',
  },
  INDEXER_NOT_CONFIGURED: {
    code: 'INDEXER_NOT_CONFIGURED',
    domain: 'NFT',
    httpStatus: 400,
    retryable: false,
    message: 'NFT indexer is not configured',
  },
  UNSUPPORTED_NFT_STANDARD: {
    code: 'UNSUPPORTED_NFT_STANDARD',
    domain: 'NFT',
    httpStatus: 400,
    retryable: false,
    message: 'Unsupported NFT standard',
  },
  INDEXER_API_ERROR: {
    code: 'INDEXER_API_ERROR',
    domain: 'NFT',
    httpStatus: 502,
    retryable: true,
    message: 'NFT indexer API error',
  },
  NFT_METADATA_FETCH_FAILED: {
    code: 'NFT_METADATA_FETCH_FAILED',
    domain: 'NFT',
    httpStatus: 502,
    retryable: true,
    message: 'Failed to fetch NFT metadata',
  },
  INVALID_TOKEN_IDENTIFIER: {
    code: 'INVALID_TOKEN_IDENTIFIER',
    domain: 'NFT',
    httpStatus: 400,
    retryable: false,
    message: 'Invalid NFT token identifier format',
  },
  // --- WALLET domain (deprecated factory) ---
  DEPRECATED_SMART_ACCOUNT: {
    code: 'DEPRECATED_SMART_ACCOUNT',
    domain: 'WALLET',
    httpStatus: 410,
    retryable: false,
    message: 'This Smart Account was created with a deprecated factory. Please create a new Smart Account wallet.',
  },

  // --- USEROP domain (5) -- UserOp Build/Sign API (v31.2) ---
  EXPIRED_BUILD: {
    code: 'EXPIRED_BUILD',
    domain: 'USEROP',
    httpStatus: 400,
    retryable: false,
    message: 'Build data has expired',
  },
  BUILD_NOT_FOUND: {
    code: 'BUILD_NOT_FOUND',
    domain: 'USEROP',
    httpStatus: 404,
    retryable: false,
    message: 'Build data not found',
  },
  BUILD_ALREADY_USED: {
    code: 'BUILD_ALREADY_USED',
    domain: 'USEROP',
    httpStatus: 409,
    retryable: false,
    message: 'Build data has already been used for signing',
  },
  CALLDATA_MISMATCH: {
    code: 'CALLDATA_MISMATCH',
    domain: 'USEROP',
    httpStatus: 400,
    retryable: false,
    message: 'UserOperation callData does not match build data',
  },
  SENDER_MISMATCH: {
    code: 'SENDER_MISMATCH',
    domain: 'USEROP',
    httpStatus: 400,
    retryable: false,
    message: 'UserOperation sender does not match wallet address',
  },

  // --- CREDENTIAL domain (2) --- v31.12 External Action framework
  CREDENTIAL_NOT_FOUND: {
    code: 'CREDENTIAL_NOT_FOUND',
    domain: 'CREDENTIAL',
    httpStatus: 404,
    retryable: false,
    message: 'Credential not found',
  },
  CREDENTIAL_EXPIRED: {
    code: 'CREDENTIAL_EXPIRED',
    domain: 'CREDENTIAL',
    httpStatus: 400,
    retryable: false,
    message: 'Credential has expired',
  },

  // --- ACTION domain (external action extensions) --- v31.12
  SIGNING_SCHEME_UNSUPPORTED: {
    code: 'SIGNING_SCHEME_UNSUPPORTED',
    domain: 'ACTION',
    httpStatus: 400,
    retryable: false,
    message: 'Signing scheme not supported',
  },
  CAPABILITY_NOT_FOUND: {
    code: 'CAPABILITY_NOT_FOUND',
    domain: 'ACTION',
    httpStatus: 400,
    retryable: false,
    message: 'Signer capability not found for the requested signing scheme',
  },
  VENUE_NOT_ALLOWED: {
    code: 'VENUE_NOT_ALLOWED',
    domain: 'POLICY',
    httpStatus: 403,
    retryable: false,
    message: 'Venue not in allowed list',
  },
  EXTERNAL_ACTION_FAILED: {
    code: 'EXTERNAL_ACTION_FAILED',
    domain: 'ACTION',
    httpStatus: 500,
    retryable: true,
    message: 'External action execution failed',
  },
} as const satisfies Record<string, ErrorCodeEntry>;

export type ErrorCode = keyof typeof ERROR_CODES;
