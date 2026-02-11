/**
 * User-friendly error messages for all 68 server error codes + 2 client-side codes.
 * Standalone mapping — does NOT import from @waiaas/core (admin is a frontend package).
 */
const ERROR_MESSAGES: Record<string, string> = {
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

  // OWNER domain (5)
  OWNER_ALREADY_CONNECTED: 'An owner wallet is already connected to this agent.',
  OWNER_NOT_CONNECTED: 'No owner wallet is connected to this agent.',
  OWNER_NOT_FOUND: 'Owner not found.',
  APPROVAL_TIMEOUT: 'The approval request has timed out.',
  APPROVAL_NOT_FOUND: 'Approval request not found.',

  // SYSTEM domain (6)
  KILL_SWITCH_ACTIVE: 'Kill switch is active. All operations are suspended.',
  KILL_SWITCH_NOT_ACTIVE: 'Kill switch is not currently active.',
  KEYSTORE_LOCKED: 'The keystore is locked. Please try again.',
  CHAIN_NOT_SUPPORTED: 'This blockchain is not supported.',
  SHUTTING_DOWN: 'The daemon is shutting down.',
  ADAPTER_NOT_AVAILABLE: 'Chain adapter is not available. Please try again.',

  // AGENT domain (3)
  AGENT_NOT_FOUND: 'Agent not found.',
  AGENT_SUSPENDED: 'This agent is currently suspended.',
  AGENT_TERMINATED: 'This agent has been terminated.',

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

/**
 * Get user-friendly error message for an error code.
 * Falls back to the code itself if not mapped.
 */
export function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? `An error occurred (${code}).`;
}
