/**
 * Inline pre-validation for SDK method parameters.
 *
 * Catches invalid inputs before making HTTP requests.
 * Uses zero external dependencies (no Zod) to maintain the SDK's
 * zero-runtime-dependency guarantee.
 *
 * Decision: TSDK-06 specifies "Zod pre-validation" but the intent is
 * "validate before network call". Inline validation achieves the same
 * outcome without adding a runtime dependency.
 */

import { WAIaaSError } from './error.js';

/**
 * Validate sendToken parameters before making the HTTP request.
 *
 * Supports all 5 transaction types:
 * - TRANSFER (default): to + amount required
 * - TOKEN_TRANSFER: to + amount + token required
 * - CONTRACT_CALL: to required
 * - APPROVE: spender + token + amount required
 * - BATCH: instructions required (array with >= 2 items)
 *
 * @throws WAIaaSError with code VALIDATION_ERROR if invalid
 */
export function validateSendToken(params: unknown): void {
  if (!params || typeof params !== 'object') {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: 'sendToken params must be an object',
      status: 0,
      retryable: false,
    });
  }

  const p = params as Record<string, unknown>;
  const txType = p['type'] as string | undefined;

  // Validate type if present
  const validTypes = ['TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE', 'BATCH'];
  if (txType !== undefined && !validTypes.includes(txType)) {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: `sendToken: "type" must be one of ${validTypes.join(', ')}`,
      status: 0,
      retryable: false,
    });
  }

  // Type-specific validation
  switch (txType) {
    case 'APPROVE':
      validateNonEmptyString(p, 'spender');
      validateTokenInfo(p);
      validateAmount(p);
      break;

    case 'BATCH':
      validateInstructions(p);
      break;

    case 'CONTRACT_CALL':
      validateNonEmptyString(p, 'to');
      break;

    case 'TOKEN_TRANSFER':
      validateNonEmptyString(p, 'to');
      validateAmount(p);
      validateTokenInfo(p);
      validateMemo(p);
      break;

    case 'TRANSFER':
    default:
      // Legacy / TRANSFER: to + amount required
      validateNonEmptyString(p, 'to');
      validateAmount(p);
      validateMemo(p);
      break;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validateNonEmptyString(p: Record<string, unknown>, field: string): void {
  if (typeof p[field] !== 'string' || (p[field] as string).length === 0) {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: `sendToken: "${field}" must be a non-empty string`,
      status: 0,
      retryable: false,
    });
  }
}

function validateAmount(p: Record<string, unknown>): void {
  if (typeof p['amount'] !== 'string' || !/^\d+$/.test(p['amount'])) {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: 'sendToken: "amount" must be a numeric string (lamports/wei)',
      status: 0,
      retryable: false,
    });
  }
}

function validateMemo(p: Record<string, unknown>): void {
  if (p['memo'] !== undefined && (typeof p['memo'] !== 'string' || p['memo'].length > 256)) {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: 'sendToken: "memo" must be a string with max 256 characters',
      status: 0,
      retryable: false,
    });
  }
}

function validateTokenInfo(p: Record<string, unknown>): void {
  const token = p['token'];
  if (!token || typeof token !== 'object') {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: 'sendToken: "token" must be an object with address, decimals, and symbol',
      status: 0,
      retryable: false,
    });
  }
  const t = token as Record<string, unknown>;
  if (typeof t['address'] !== 'string' || (t['address'] as string).length === 0) {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: 'sendToken: "token.address" must be a non-empty string',
      status: 0,
      retryable: false,
    });
  }
  if (typeof t['decimals'] !== 'number') {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: 'sendToken: "token.decimals" must be a number',
      status: 0,
      retryable: false,
    });
  }
  if (typeof t['symbol'] !== 'string' || (t['symbol'] as string).length === 0) {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: 'sendToken: "token.symbol" must be a non-empty string',
      status: 0,
      retryable: false,
    });
  }
}

function validateInstructions(p: Record<string, unknown>): void {
  const instructions = p['instructions'];
  if (!Array.isArray(instructions) || instructions.length < 2) {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: 'sendToken: "instructions" must be an array with at least 2 items',
      status: 0,
      retryable: false,
    });
  }
}
