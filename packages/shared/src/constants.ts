/**
 * Shared constants for Admin UI and daemon.
 *
 * IMPORTANT: Pure TypeScript only -- no Zod, no native modules.
 * Values must stay in sync with @waiaas/core manually.
 * Browser-safe for Admin UI bundling.
 */

// ---------------------------------------------------------------------------
// Policy Types (matches @waiaas/core/enums/policy.ts)
// ---------------------------------------------------------------------------

export const POLICY_TYPES = [
  'SPENDING_LIMIT',
  'WHITELIST',
  'TIME_RESTRICTION',
  'RATE_LIMIT',
  'ALLOWED_TOKENS',
  'CONTRACT_WHITELIST',
  'METHOD_WHITELIST',
  'APPROVED_SPENDERS',
  'APPROVE_AMOUNT_LIMIT',
  'APPROVE_TIER_OVERRIDE',
  'ALLOWED_NETWORKS',
  'X402_ALLOWED_DOMAINS',
  'LENDING_LTV_LIMIT',
  'LENDING_ASSET_WHITELIST',
  'PERP_MAX_LEVERAGE',
  'PERP_MAX_POSITION_USD',
  'PERP_ALLOWED_MARKETS',
  'REPUTATION_THRESHOLD',
  'ERC8128_ALLOWED_DOMAINS',
  'VENUE_WHITELIST',
  'ACTION_CATEGORY_LIMIT',
] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];

// ---------------------------------------------------------------------------
// Policy Type Labels (human-readable)
// ---------------------------------------------------------------------------

export const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  SPENDING_LIMIT: 'Spending Limit',
  WHITELIST: 'Whitelist',
  TIME_RESTRICTION: 'Time Restriction',
  RATE_LIMIT: 'Rate Limit',
  ALLOWED_TOKENS: 'Allowed Tokens',
  CONTRACT_WHITELIST: 'Contract Whitelist',
  METHOD_WHITELIST: 'Method Whitelist',
  APPROVED_SPENDERS: 'Approved Spenders',
  APPROVE_AMOUNT_LIMIT: 'Approve Amount Limit',
  APPROVE_TIER_OVERRIDE: 'Approve Tier Override',
  ALLOWED_NETWORKS: 'Allowed Networks',
  X402_ALLOWED_DOMAINS: 'x402 Allowed Domains',
  LENDING_LTV_LIMIT: 'Lending LTV Limit',
  LENDING_ASSET_WHITELIST: 'Lending Asset Whitelist',
  PERP_MAX_LEVERAGE: 'Perp Max Leverage',
  PERP_MAX_POSITION_USD: 'Perp Max Position USD',
  PERP_ALLOWED_MARKETS: 'Perp Allowed Markets',
  REPUTATION_THRESHOLD: 'Reputation Threshold',
  ERC8128_ALLOWED_DOMAINS: 'ERC-8128 Allowed Domains',
  VENUE_WHITELIST: 'Venue Whitelist',
  ACTION_CATEGORY_LIMIT: 'Action Category Limit',
};

// ---------------------------------------------------------------------------
// Policy Descriptions (one-liner per policy type)
// ---------------------------------------------------------------------------

export const POLICY_DESCRIPTIONS: Record<PolicyType, string> = {
  SPENDING_LIMIT: 'Set per-transaction and cumulative spending limits by security tier (instant, notify, delay, approval).',
  WHITELIST: 'Allow transfers only to pre-approved recipient addresses.',
  TIME_RESTRICTION: 'Restrict transactions to specific time windows or days of the week.',
  RATE_LIMIT: 'Limit the maximum number of transactions within a time window.',
  ALLOWED_TOKENS: 'Allow only specified tokens for transfers; all others are denied.',
  CONTRACT_WHITELIST: 'Allow contract calls only to pre-approved contract addresses.',
  METHOD_WHITELIST: 'Allow only specific contract methods (function selectors) to be called.',
  APPROVED_SPENDERS: 'Allow token approvals only for pre-approved spender addresses.',
  APPROVE_AMOUNT_LIMIT: 'Set maximum token approval amounts and optionally block unlimited approvals.',
  APPROVE_TIER_OVERRIDE: 'Force a specific security tier for all token approval transactions.',
  ALLOWED_NETWORKS: 'Restrict transactions to specific blockchain networks only.',
  X402_ALLOWED_DOMAINS: 'Allow x402 payments only to pre-approved domains.',
  LENDING_LTV_LIMIT: 'Set maximum loan-to-value ratio for lending operations.',
  LENDING_ASSET_WHITELIST: 'Allow lending operations only for pre-approved assets.',
  PERP_MAX_LEVERAGE: 'Set maximum allowed leverage for perpetual futures positions.',
  PERP_MAX_POSITION_USD: 'Set maximum position size in USD for perpetual futures.',
  PERP_ALLOWED_MARKETS: 'Allow perpetual futures trading only on pre-approved markets.',
  REPUTATION_THRESHOLD: 'Adjust security tier based on counterparty agent on-chain reputation score (ERC-8004).',
  ERC8128_ALLOWED_DOMAINS: 'Allow ERC-8128 HTTP message signing only for pre-approved API domains.',
  VENUE_WHITELIST: 'Allow external actions only from pre-approved venues (default-deny when enabled).',
  ACTION_CATEGORY_LIMIT: 'Set per-action, daily, and monthly USD limits per action category with tier escalation.',
};

// ---------------------------------------------------------------------------
// Policy Tiers
// ---------------------------------------------------------------------------

export const POLICY_TIERS = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'] as const;
export type PolicyTier = (typeof POLICY_TIERS)[number];

// ---------------------------------------------------------------------------
// Credential Types (matches @waiaas/core/schemas/credential.schema.ts)
// ---------------------------------------------------------------------------

export const CREDENTIAL_TYPES = [
  'api-key',
  'hmac-secret',
  'rsa-private-key',
  'session-token',
  'custom',
] as const;

export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  'api-key': 'API Key',
  'hmac-secret': 'HMAC Secret',
  'rsa-private-key': 'RSA Private Key',
  'session-token': 'Session Token',
  'custom': 'Custom',
};

// ---------------------------------------------------------------------------
// Error Message Map (canonical UI error messages)
// ---------------------------------------------------------------------------

export const ERROR_MESSAGE_MAP: Record<string, string> = {
  // AUTH domain (8)
  INVALID_TOKEN: 'Your authentication token is invalid. Please log in again.',
  TOKEN_EXPIRED: 'Your session token has expired. Please log in again.',
  SESSION_REVOKED: 'Your session has been revoked by an administrator.',
  INVALID_SIGNATURE: 'The cryptographic signature is invalid.',
  INVALID_NONCE: 'The authentication nonce is invalid or has expired.',
  INVALID_MASTER_PASSWORD: 'Invalid master password. Please try again.',
  MASTER_PASSWORD_LOCKED: 'Master password is locked due to too many failed attempts. Please wait.',
  SYSTEM_LOCKED: 'The system is currently locked.',

  // SESSION domain (8)
  SESSION_NOT_FOUND: 'Session not found.',
  SESSION_EXPIRED: 'The session has expired.',
  SESSION_LIMIT_EXCEEDED: 'Maximum number of sessions reached.',
  CONSTRAINT_VIOLATED: 'A session constraint was violated.',
  RENEWAL_LIMIT_REACHED: 'Session renewal limit has been reached. Create a new session.',
  SESSION_ABSOLUTE_LIFETIME_EXCEEDED: 'Session has exceeded its maximum lifetime.',
  RENEWAL_TOO_EARLY: 'Session renewal attempted too early. Please wait.',
  SESSION_RENEWAL_MISMATCH: 'Session renewal count mismatch. The session may have been renewed elsewhere.',

  // TX domain (21)
  PIPELINE_HALTED: 'Transaction is queued for delay or approval.',
  INSUFFICIENT_BALANCE: 'Insufficient balance for this transaction.',
  INVALID_ADDRESS: 'The blockchain address is invalid.',
  TX_NOT_FOUND: 'Transaction not found.',
  TX_EXPIRED: 'The transaction has expired.',
  TX_ALREADY_PROCESSED: 'This transaction has already been processed.',
  CHAIN_ERROR: 'A blockchain network error occurred. Please try again.',
  SIMULATION_FAILED: 'Transaction simulation failed. The transaction may revert.',
  TOKEN_NOT_FOUND: 'Token not found.',
  TOKEN_NOT_ALLOWED: 'This token is not in the allowed list.',
  INSUFFICIENT_TOKEN_BALANCE: 'Insufficient token balance.',
  CONTRACT_CALL_DISABLED: 'Contract calls are disabled. Configure a CONTRACT_WHITELIST policy first.',
  CONTRACT_NOT_WHITELISTED: 'This contract address is not whitelisted.',
  METHOD_NOT_WHITELISTED: 'This contract method is not whitelisted.',
  APPROVE_DISABLED: 'Token approvals are disabled. Configure an APPROVED_SPENDERS policy first.',
  SPENDER_NOT_APPROVED: 'This spender address is not in the approved list.',
  APPROVE_AMOUNT_EXCEEDED: 'The approve amount exceeds the configured limit.',
  UNLIMITED_APPROVE_BLOCKED: 'Unlimited token approvals are blocked by policy.',
  BATCH_NOT_SUPPORTED: 'Batch transactions are not supported on this chain.',
  BATCH_SIZE_EXCEEDED: 'Batch contains too many instructions (maximum 20).',
  BATCH_POLICY_VIOLATION: 'A policy violation occurred in the batch transaction.',

  // POLICY domain (5)
  POLICY_NOT_FOUND: 'Policy not found.',
  POLICY_DENIED: 'Transaction denied by policy.',
  SPENDING_LIMIT_EXCEEDED: 'Spending limit has been exceeded.',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please wait before retrying.',
  WHITELIST_DENIED: 'The destination address is not in the whitelist.',

  // OWNER domain (5+2)
  OWNER_ALREADY_CONNECTED: 'An owner wallet is already connected to this wallet.',
  OWNER_NOT_CONNECTED: 'No owner wallet is connected to this wallet.',
  OWNER_NOT_FOUND: 'Owner not found.',
  APPROVAL_TIMEOUT: 'The approval request has timed out.',
  APPROVAL_NOT_FOUND: 'Approval request not found.',
  OWNER_NOT_SET: 'Owner address must be set before connecting WalletConnect.',
  OWNER_ADDRESS_MISMATCH: 'Connected wallet address does not match registered owner.',

  // SYSTEM domain (6)
  KILL_SWITCH_ACTIVE: 'Kill switch is active. All operations are suspended.',
  KILL_SWITCH_NOT_ACTIVE: 'Kill switch is not currently active.',
  KEYSTORE_LOCKED: 'The keystore is locked. Please try again.',
  CHAIN_NOT_SUPPORTED: 'This blockchain is not supported.',
  SHUTTING_DOWN: 'The daemon is shutting down.',
  ADAPTER_NOT_AVAILABLE: 'Chain adapter is not available. Please try again.',

  // WALLET domain (3 + 4 WC)
  WALLET_NOT_FOUND: 'Wallet not found.',
  WALLET_SUSPENDED: 'This wallet is currently suspended.',
  WALLET_TERMINATED: 'This wallet has been terminated.',
  WALLET_NOT_TERMINATED: 'Wallet must be terminated before purging.',
  WC_NOT_CONFIGURED: 'WalletConnect is not configured. Set the Project ID in Settings first.',
  WC_SESSION_NOT_FOUND: 'No active WalletConnect session.',
  WC_SESSION_EXISTS: 'A WalletConnect session already exists. Disconnect first.',
  WC_SIGNING_FAILED: 'WalletConnect signing request failed.',

  // WITHDRAW domain (4)
  NO_OWNER: 'No owner connected. Withdrawal requires an owner wallet.',
  WITHDRAW_LOCKED_ONLY: 'Withdrawal is only available when the owner state is LOCKED.',
  SWEEP_TOTAL_FAILURE: 'All sweep operations failed. Please try again.',
  INSUFFICIENT_FOR_FEE: 'Insufficient balance to cover transaction fees.',

  // ACTION domain (7)
  ACTION_NOT_FOUND: 'Action not found.',
  ACTION_VALIDATION_FAILED: 'Action input validation failed.',
  ACTION_RESOLVE_FAILED: 'Action failed due to an external API error. Please try again.',
  ACTION_RETURN_INVALID: 'Action returned an invalid result.',
  ACTION_PLUGIN_LOAD_FAILED: 'Failed to load the action plugin.',
  ACTION_NAME_CONFLICT: 'An action with this name already exists.',
  ACTION_CHAIN_MISMATCH: 'The request chain does not match the action provider.',

  // ADMIN domain (1)
  ROTATION_TOO_RECENT: 'Key rotation was attempted too recently. Please wait.',

  // Client-side codes (2)
  NETWORK_ERROR: 'Cannot connect to the daemon. Check if it is running.',
  TIMEOUT: 'Request timed out. The daemon may be busy.',
};

// ---------------------------------------------------------------------------
// Server Message Preferred Codes
// ---------------------------------------------------------------------------

/**
 * Error codes where the server-provided message is more useful than
 * the generic mapping (e.g. validation errors with field-specific reasons).
 */
export const SERVER_MESSAGE_PREFERRED_CODES = [
  'ACTION_VALIDATION_FAILED',
  'CONSTRAINT_VIOLATED',
  'INVALID_ADDRESS',
  'INVALID_SIGNATURE',
] as const;
