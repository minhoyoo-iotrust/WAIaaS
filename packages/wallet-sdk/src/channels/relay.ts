/**
 * Push Relay channel function for the WAIaaS Signing Protocol.
 *
 * Sends a SignResponse via the Push Relay server.
 *
 * @see internal/design/73-signing-protocol-v1.md Section 7.4
 */

import type { SignResponse } from '@waiaas/core';

/**
 * Send a SignResponse via Push Relay.
 *
 * Posts the response to the Push Relay's `/v1/sign-response` endpoint.
 * The relay stores it for the daemon to retrieve via long-polling.
 *
 * @param response - Validated SignResponse object
 * @param pushRelayUrl - Push Relay server URL (e.g., "https://push-relay.example.com")
 * @param apiKey - Push Relay API key (`X-API-Key`)
 */
export async function sendViaRelay(
  response: SignResponse,
  pushRelayUrl: string,
  apiKey: string,
): Promise<void> {
  const url = `${pushRelayUrl.replace(/\/$/, '')}/v1/sign-response`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({
      requestId: response.requestId,
      action: response.action,
      ...(response.signature !== undefined ? { signature: response.signature } : {}),
      signerAddress: response.signerAddress,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to send response via Push Relay: HTTP ${String(res.status)}`,
    );
  }
}

/**
 * Register a device with the Push Relay server.
 *
 * Posts the device push token to `/devices` so the relay can deliver
 * sign requests and notifications via native push (FCM / Pushwoosh).
 *
 * @param pushRelayUrl - Push Relay server URL
 * @param apiKey       - Push Relay API key (`X-API-Key`)
 * @param opts         - Device registration options
 * @returns Object containing the subscription token issued by the relay
 */
export async function registerDevice(
  pushRelayUrl: string,
  apiKey: string,
  opts: { walletName: string; pushToken: string; platform: 'ios' | 'android' },
): Promise<{ subscriptionToken: string }> {
  const url = `${pushRelayUrl.replace(/\/$/, '')}/devices`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      pushToken: opts.pushToken,
      walletName: opts.walletName,
      platform: opts.platform,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to register device with Push Relay: HTTP ${String(res.status)}`,
    );
  }

  const body = (await res.json()) as { subscription_token: string };
  return { subscriptionToken: body.subscription_token };
}

/**
 * Unregister a device from the Push Relay server.
 *
 * Sends `DELETE /devices/:pushToken` to remove the device registration.
 *
 * @param pushRelayUrl - Push Relay server URL
 * @param apiKey       - Push Relay API key (`X-API-Key`)
 * @param pushToken    - The device push token to unregister
 */
export async function unregisterDevice(
  pushRelayUrl: string,
  apiKey: string,
  pushToken: string,
): Promise<void> {
  const url = `${pushRelayUrl.replace(/\/$/, '')}/devices/${encodeURIComponent(pushToken)}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'X-API-Key': apiKey },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to unregister device from Push Relay: HTTP ${String(res.status)}`,
    );
  }
}

/**
 * Retrieve the subscription token for a registered device.
 *
 * Sends `GET /devices/:pushToken/subscription-token`.
 * Returns `null` if the device is not registered (HTTP 404).
 *
 * @param pushRelayUrl - Push Relay server URL
 * @param apiKey       - Push Relay API key (`X-API-Key`)
 * @param pushToken    - The device push token to look up
 * @returns The subscription token string, or `null` if not found
 */
export async function getSubscriptionToken(
  pushRelayUrl: string,
  apiKey: string,
  pushToken: string,
): Promise<string | null> {
  const url = `${pushRelayUrl.replace(/\/$/, '')}/devices/${encodeURIComponent(pushToken)}/subscription-token`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(
      `Failed to get subscription token from Push Relay: HTTP ${String(res.status)}`,
    );
  }

  const body = (await res.json()) as { subscription_token: string };
  return body.subscription_token;
}
