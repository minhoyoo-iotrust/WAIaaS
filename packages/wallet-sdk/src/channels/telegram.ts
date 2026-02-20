/**
 * Telegram channel function for the WAIaaS Signing Protocol.
 *
 * Generates a Telegram deeplink URL for sending a SignResponse to a bot.
 * The actual Telegram app opening is the wallet app's responsibility.
 *
 * @see internal/design/73-signing-protocol-v1.md Section 8.5
 */

import type { SignResponse } from '@waiaas/core';

/**
 * Generate a Telegram deeplink URL for sending a SignResponse to a bot.
 *
 * Creates a https://t.me/{botUsername}?text={encoded} URL.
 * Platform-specific scheme handling (tg:// vs https://t.me) is left to the wallet app.
 *
 * @param response - Validated SignResponse object
 * @param botUsername - Telegram bot username (without @)
 * @returns Telegram deeplink URL string
 */
export function sendViaTelegram(
  response: SignResponse,
  botUsername: string,
): string {
  const json = JSON.stringify(response);
  const encoded = Buffer.from(json, 'utf-8').toString('base64url');
  const text = `/sign_response ${encoded}`;
  return `https://t.me/${botUsername}?text=${encodeURIComponent(text)}`;
}
