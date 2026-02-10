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
 * Checks:
 * - params is a non-null object
 * - `to` is a non-empty string
 * - `amount` is a numeric string (digits only, lamports/wei)
 * - `memo` (optional) is a string with max 256 characters
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

  if (typeof p['to'] !== 'string' || p['to'].length === 0) {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: 'sendToken: "to" must be a non-empty string',
      status: 0,
      retryable: false,
    });
  }

  if (typeof p['amount'] !== 'string' || !/^\d+$/.test(p['amount'])) {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: 'sendToken: "amount" must be a numeric string (lamports/wei)',
      status: 0,
      retryable: false,
    });
  }

  if (p['memo'] !== undefined && (typeof p['memo'] !== 'string' || p['memo'].length > 256)) {
    throw new WAIaaSError({
      code: 'VALIDATION_ERROR',
      message: 'sendToken: "memo" must be a string with max 256 characters',
      status: 0,
      retryable: false,
    });
  }
}
