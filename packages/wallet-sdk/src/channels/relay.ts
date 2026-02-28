/**
 * Push Relay channel function for the WAIaaS Signing Protocol.
 *
 * Sends a SignResponse via the Push Relay server, which forwards it to ntfy.
 * This allows wallet apps to only know the Push Relay URL, without needing
 * direct access to the ntfy server.
 *
 * @see internal/design/73-signing-protocol-v1.md Section 7.4
 */

import type { SignResponse } from '@waiaas/core';

/**
 * Send a SignResponse via Push Relay.
 *
 * Posts the response to the Push Relay's `/v1/sign-response` endpoint,
 * which relays it to the ntfy response topic for the daemon to receive.
 *
 * @param response - Validated SignResponse object
 * @param responseTopic - ntfy response topic name (from SignRequest.responseChannel.responseTopic)
 * @param pushRelayUrl - Push Relay server URL (e.g., "https://push-relay.example.com")
 */
export async function sendViaRelay(
  response: SignResponse,
  responseTopic: string,
  pushRelayUrl: string,
): Promise<void> {
  const url = `${pushRelayUrl.replace(/\/$/, '')}/v1/sign-response`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: response.requestId,
      action: response.action,
      ...(response.signature !== undefined ? { signature: response.signature } : {}),
      signerAddress: response.signerAddress,
      responseTopic,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to send response via Push Relay: HTTP ${String(res.status)}`,
    );
  }
}
