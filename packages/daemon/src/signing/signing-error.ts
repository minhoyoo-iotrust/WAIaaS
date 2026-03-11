/**
 * SigningError class for signer capability errors.
 *
 * SSoT: doc-81 D2.3 (External Action Framework design).
 *
 * @since v31.12
 */
import type { SigningScheme } from '@waiaas/core';

/** Error codes specific to signing operations. */
export type SigningErrorCode =
  | 'INVALID_KEY'
  | 'INVALID_PARAMS'
  | 'CREDENTIAL_MISSING'
  | 'SIGNING_FAILED'
  | 'KEY_NOT_SUPPORTED'
  | 'CAPABILITY_NOT_FOUND';

/**
 * Error thrown by ISignerCapability implementations.
 * Extends Error (not WAIaaSError) per doc-81 design -- converted to WAIaaSError at Stage 5.
 */
export class SigningError extends Error {
  override readonly name = 'SigningError';

  constructor(
    message: string,
    public readonly scheme: SigningScheme,
    public readonly code: SigningErrorCode,
    public override readonly cause?: Error,
  ) {
    super(message);
  }
}
