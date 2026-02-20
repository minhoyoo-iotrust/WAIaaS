/**
 * signing-sdk module -- unified exports for the daemon signing SDK.
 *
 * Provides:
 *   - SignRequestBuilder: builds SignRequest from PENDING_APPROVAL transactions
 *   - SignResponseHandler: processes wallet app SignResponse (approve/reject)
 *   - WalletLinkRegistry: manages registered wallet configurations
 *   - NtfySigningChannel: ntfy-based publish/subscribe signing channel
 *   - ISigningChannel: channel interface for future channel implementations
 *
 * @see internal/design/73-signing-protocol-v1.md
 * @see internal/design/74-wallet-sdk-daemon-components.md
 */

// Core services
export { SignRequestBuilder } from './sign-request-builder.js';
export type { BuildRequestParams, BuildRequestResult } from './sign-request-builder.js';

export { SignResponseHandler } from './sign-response-handler.js';
export type { SignResponseHandlerDeps, HandleResult } from './sign-response-handler.js';

export { WalletLinkRegistry } from './wallet-link-registry.js';

// Channels
export { NtfySigningChannel } from './channels/index.js';
export type { NtfySigningChannelOpts, SendRequestParams, SendRequestResult } from './channels/index.js';

export { TelegramSigningChannel } from './channels/index.js';
export type { TelegramSigningChannelOpts } from './channels/index.js';

// ---------------------------------------------------------------------------
// ISigningChannel interface (for future TelegramSigningChannel, etc.)
// ---------------------------------------------------------------------------

import type { SendRequestParams as _SendRequestParams } from './channels/index.js';

export interface ISigningChannel {
  sendRequest(params: _SendRequestParams): Promise<{ requestId: string }>;
  shutdown(): void;
}
