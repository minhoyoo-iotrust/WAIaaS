/**
 * Custom error classes for @waiaas/wallet-sdk.
 *
 * These errors are thrown by SDK functions to indicate specific failure modes
 * when parsing, validating, or processing signing protocol data.
 */

/**
 * Thrown when the URL passed to parseSignRequest is invalid or missing
 * required parameters (neither 'data' nor 'requestId' found).
 */
export class InvalidSignRequestUrlError extends Error {
  override readonly name = 'InvalidSignRequestUrlError';

  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown when a SignRequest has expired (expiresAt < now).
 */
export class SignRequestExpiredError extends Error {
  override readonly name = 'SignRequestExpiredError';
  readonly expiresAt: string;

  constructor(expiresAt: string) {
    super(`Sign request expired at ${expiresAt}`);
    this.expiresAt = expiresAt;
  }
}

/**
 * Thrown when the decoded data fails Zod schema validation.
 */
export class SignRequestValidationError extends Error {
  override readonly name = 'SignRequestValidationError';

  constructor(zodMessage: string) {
    super(`Sign request validation failed: ${zodMessage}`);
  }
}
