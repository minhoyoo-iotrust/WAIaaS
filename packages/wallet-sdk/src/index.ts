/**
 * @waiaas/wallet-sdk - WAIaaS Wallet Signing SDK
 *
 * Provides wallet apps with tools to integrate the WAIaaS Signing Protocol v1.
 *
 * Public API:
 *   - parseSignRequest(url) - Extract SignRequest from universal link URL
 *   - buildSignResponse(requestId, action, signature?, signerAddress) - Create SignResponse
 *   - formatDisplayMessage(request) - Human-readable transaction summary
 *   - sendViaNtfy(response, topic, serverUrl?) - Publish to ntfy response topic
 *   - sendViaTelegram(response, botUsername) - Generate Telegram deeplink URL
 *   - subscribeToRequests(topic, callback, serverUrl?) - SSE subscription for sign requests
 *
 * @see internal/design/73-signing-protocol-v1.md
 * @see internal/design/74-wallet-sdk-daemon-components.md
 */

// Core functions
export { parseSignRequest } from './parse-request.js';
export { buildSignResponse } from './build-response.js';
export { formatDisplayMessage } from './display.js';

// Error classes
export {
  InvalidSignRequestUrlError,
  SignRequestExpiredError,
  SignRequestValidationError,
} from './errors.js';

// Re-export types from @waiaas/core for convenience
export type {
  SignRequest,
  SignResponse,
  WalletLinkConfig,
} from '@waiaas/core';
