/**
 * formatDisplayMessage - Create a human-readable transaction summary.
 *
 * @see internal/design/74-wallet-sdk-daemon-components.md Section 2.4
 */

import type { SignRequest } from '@waiaas/core';

/**
 * Format a SignRequest into a human-readable display message.
 *
 * @param request - Validated SignRequest
 * @returns Multi-line string summary of the transaction
 */
export function formatDisplayMessage(request: SignRequest): string {
  const lines: string[] = [
    'Transaction Approval Request',
    '',
    `Type: ${request.metadata.type}`,
    `From: ${request.metadata.from}`,
    `To: ${request.metadata.to}`,
  ];

  if (request.metadata.amount && request.metadata.symbol) {
    lines.push(`Amount: ${request.metadata.amount} ${request.metadata.symbol}`);
  }

  lines.push(`Network: ${request.network}`);
  lines.push(`Policy: ${request.metadata.policyTier}`);
  lines.push(`Expires: ${request.expiresAt}`);

  return lines.join('\n');
}
