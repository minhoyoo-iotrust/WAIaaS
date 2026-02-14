/**
 * ChainError: Chain adapter internal error with 3-category system.
 *
 * Categories:
 * - PERMANENT: Non-recoverable errors (retryable=false)
 * - TRANSIENT: Temporary infrastructure issues (retryable=true)
 * - STALE: Stale state errors (retryable=true, rebuild tx)
 *
 * Stage 5 catches ChainError and converts to WAIaaSError for API responses.
 * 29 error codes mapped to 3 categories (PERMANENT 21, TRANSIENT 4, STALE 4).
 */

export type ChainErrorCategory = 'PERMANENT' | 'TRANSIENT' | 'STALE';

/**
 * 29 chain-specific error codes for chain adapter internal use.
 * Separate from ERROR_CODES (HTTP-level error codes for API responses).
 */
export type ChainErrorCode =
  // PERMANENT (21) -- non-recoverable, do not retry
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_ADDRESS'
  | 'ACCOUNT_NOT_FOUND'
  | 'CONTRACT_EXECUTION_FAILED'
  | 'INVALID_INSTRUCTION'
  | 'PROGRAM_NOT_FOUND'
  | 'TOKEN_ACCOUNT_NOT_FOUND'
  | 'INSUFFICIENT_TOKEN_BALANCE'
  | 'SPENDER_NOT_APPROVED'
  | 'ATA_CREATION_FAILED'
  | 'INVALID_PROGRAM_DATA'
  | 'UNAUTHORIZED_SIGNER'
  | 'TRANSACTION_TOO_LARGE'
  | 'DUPLICATE_TRANSACTION'
  | 'ACCOUNT_ALREADY_EXISTS'
  | 'INVALID_TOKEN_PROGRAM'
  | 'INSUFFICIENT_FOR_FEE'
  | 'BATCH_NOT_SUPPORTED'
  | 'BATCH_SIZE_EXCEEDED'
  | 'INVALID_RAW_TRANSACTION'
  | 'WALLET_NOT_SIGNER'
  // TRANSIENT (4) -- temporary infrastructure issues, safe to retry
  | 'RPC_TIMEOUT'
  | 'RPC_CONNECTION_ERROR'
  | 'RATE_LIMITED'
  | 'NODE_BEHIND'
  // STALE (4) -- stale state, rebuild transaction and retry
  | 'BLOCKHASH_EXPIRED'
  | 'NONCE_TOO_LOW'
  | 'NONCE_ALREADY_USED'
  | 'SLOT_SKIPPED';

/**
 * Maps each ChainErrorCode to its category.
 * retryable is derived: category !== 'PERMANENT'.
 */
export const CHAIN_ERROR_CATEGORIES: Record<ChainErrorCode, ChainErrorCategory> = {
  // PERMANENT (21)
  INSUFFICIENT_BALANCE: 'PERMANENT',
  INVALID_ADDRESS: 'PERMANENT',
  ACCOUNT_NOT_FOUND: 'PERMANENT',
  CONTRACT_EXECUTION_FAILED: 'PERMANENT',
  INVALID_INSTRUCTION: 'PERMANENT',
  PROGRAM_NOT_FOUND: 'PERMANENT',
  TOKEN_ACCOUNT_NOT_FOUND: 'PERMANENT',
  INSUFFICIENT_TOKEN_BALANCE: 'PERMANENT',
  SPENDER_NOT_APPROVED: 'PERMANENT',
  ATA_CREATION_FAILED: 'PERMANENT',
  INVALID_PROGRAM_DATA: 'PERMANENT',
  UNAUTHORIZED_SIGNER: 'PERMANENT',
  TRANSACTION_TOO_LARGE: 'PERMANENT',
  DUPLICATE_TRANSACTION: 'PERMANENT',
  ACCOUNT_ALREADY_EXISTS: 'PERMANENT',
  INVALID_TOKEN_PROGRAM: 'PERMANENT',
  INSUFFICIENT_FOR_FEE: 'PERMANENT',
  BATCH_NOT_SUPPORTED: 'PERMANENT',
  BATCH_SIZE_EXCEEDED: 'PERMANENT',
  INVALID_RAW_TRANSACTION: 'PERMANENT',
  WALLET_NOT_SIGNER: 'PERMANENT',
  // TRANSIENT (4)
  RPC_TIMEOUT: 'TRANSIENT',
  RPC_CONNECTION_ERROR: 'TRANSIENT',
  RATE_LIMITED: 'TRANSIENT',
  NODE_BEHIND: 'TRANSIENT',
  // STALE (4)
  BLOCKHASH_EXPIRED: 'STALE',
  NONCE_TOO_LOW: 'STALE',
  NONCE_ALREADY_USED: 'STALE',
  SLOT_SKIPPED: 'STALE',
};

/**
 * Chain adapter internal error.
 *
 * Extends Error (not WAIaaSError) because:
 * - ChainError is internal to chain adapters, no httpStatus needed
 * - Stage 5 catches ChainError and converts to WAIaaSError for API responses
 * - Keeps chain adapter layer decoupled from HTTP concerns
 */
export class ChainError extends Error {
  readonly code: ChainErrorCode;
  readonly category: ChainErrorCategory;
  readonly chain: string;
  readonly retryable: boolean;

  constructor(
    code: ChainErrorCode,
    chain: string,
    options?: { message?: string; cause?: Error },
  ) {
    super(options?.message ?? `Chain error: ${code}`);
    this.name = 'ChainError';
    this.code = code;
    this.chain = chain;
    this.category = CHAIN_ERROR_CATEGORIES[code];
    this.retryable = this.category !== 'PERMANENT';
    if (options?.cause) this.cause = options.cause;
  }

  toJSON(): {
    code: ChainErrorCode;
    message: string;
    category: ChainErrorCategory;
    chain: string;
    retryable: boolean;
  } {
    return {
      code: this.code,
      message: this.message,
      category: this.category,
      chain: this.chain,
      retryable: this.retryable,
    };
  }
}
