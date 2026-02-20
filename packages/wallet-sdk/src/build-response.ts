/**
 * buildSignResponse - Create a SignResponse object.
 *
 * @see internal/design/74-wallet-sdk-daemon-components.md Section 2.2
 */

import type { SignResponse } from '@waiaas/core';
import { SignResponseSchema } from '@waiaas/core';

/**
 * Build a validated SignResponse.
 *
 * @param requestId - UUID of the original SignRequest
 * @param action - 'approve' or 'reject'
 * @param signature - Hex-encoded signature (required for 'approve')
 * @param signerAddress - Address of the signer
 * @returns Validated SignResponse
 * @throws Error if action is 'approve' but signature is missing
 */
export function buildSignResponse(
  requestId: string,
  action: 'approve' | 'reject',
  signature: string | undefined,
  signerAddress: string,
): SignResponse {
  if (action === 'approve' && !signature) {
    throw new Error('signature required for approve action');
  }

  const response = {
    version: '1' as const,
    requestId,
    action,
    ...(signature !== undefined ? { signature } : {}),
    signerAddress,
    signedAt: new Date().toISOString(),
  };

  return SignResponseSchema.parse(response);
}
