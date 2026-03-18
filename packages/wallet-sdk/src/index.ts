/**
 * @waiaas/wallet-sdk - WAIaaS Wallet Signing SDK
 *
 * Provides wallet apps with tools to integrate the WAIaaS Signing Protocol v1.
 *
 * Public API:
 *   - parseSignRequest(url) - Extract SignRequest from universal link URL
 *   - buildSignResponse(requestId, action, signature?, signerAddress) - Create SignResponse
 *   - formatDisplayMessage(request) - Human-readable transaction summary
 *   - sendViaNtfy(response, topic, serverUrl?) - (deprecated) Publish to ntfy response topic
 *   - sendViaRelay(response, topic, pushRelayUrl) - Send via Push Relay server
 *   - registerDevice(pushRelayUrl, apiKey, opts) - Register device with Push Relay
 *   - unregisterDevice(pushRelayUrl, apiKey, pushToken) - Unregister device from Push Relay
 *   - getSubscriptionToken(pushRelayUrl, apiKey, pushToken) - Get subscription token for device
 *   - sendViaTelegram(response, botUsername) - Generate Telegram deeplink URL
 *   - subscribeToRequests(topic, callback, serverUrl?) - (deprecated) SSE subscription for sign requests
 *   - subscribeToNotifications(topic, callback, serverUrl?) - (deprecated) SSE subscription for notifications
 *   - parseNotification(data) - (deprecated) Decode and validate base64url NotificationMessage
 *
 * @see internal/design/73-signing-protocol-v1.md
 * @see internal/design/74-wallet-sdk-daemon-components.md
 */

// Core functions
export { parseSignRequest } from './parse-request.js';
export { buildSignResponse } from './build-response.js';
export { formatDisplayMessage } from './display.js';

// Channel functions
export {
  sendViaNtfy,
  subscribeToRequests,
  sendViaTelegram,
  sendViaRelay,
  registerDevice,
  unregisterDevice,
  getSubscriptionToken,
  subscribeToNotifications,
  parseNotification,
} from './channels/index.js';

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
  NotificationMessage,
} from '@waiaas/core';
