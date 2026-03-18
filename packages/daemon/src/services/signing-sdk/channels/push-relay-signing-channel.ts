/**
 * PushRelaySigningChannel -- sends SignRequests via Push Relay HTTP POST
 * and receives responses via long-polling.
 *
 * When a PENDING_APPROVAL transaction triggers a SignRequest:
 *   1. POSTs the request to Push Relay /v1/push with API key auth
 *   2. Starts long-polling GET /v1/sign-response/:requestId for the response
 *   3. Parses incoming SignResponse (base64url encoded)
 *   4. Delegates to SignResponseHandler for approval/rejection processing
 *
 * Error handling (ERR-01, ERR-02):
 *   - POST failure: logs error, does NOT throw (transaction stays PENDING_APPROVAL)
 *   - Long-polling error: retries with exponential backoff (max 3 error retries)
 *   - Long-polling 204: continues polling (not counted as error)
 *
 * @see internal/design/73-signing-protocol-v1.md
 * @see internal/design/74-wallet-sdk-daemon-components.md
 */

import {
  type SignResponse,
  SignResponseSchema,
} from '@waiaas/core';
import type { SignRequestBuilder, BuildRequestParams } from '../sign-request-builder.js';
import type { SignResponseHandler } from '../sign-response-handler.js';
import type { SettingsService } from '../../../infrastructure/settings/settings-service.js';
import { SIGNING_CHANNEL_FETCH_TIMEOUT_MS } from '../../../constants.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LONG_POLL_TIMEOUT_S = 30;
const MAX_ERROR_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushRelaySigningChannelOpts {
  signRequestBuilder: SignRequestBuilder;
  signResponseHandler: SignResponseHandler;
  settingsService: SettingsService;
}

export interface SendRequestParams extends BuildRequestParams {
  walletId: string;
}

export interface SendRequestResult {
  requestId: string;
  requestTopic: string;
  responseTopic: string;
}

// ---------------------------------------------------------------------------
// PushRelaySigningChannel
// ---------------------------------------------------------------------------

export class PushRelaySigningChannel {
  private readonly signRequestBuilder: SignRequestBuilder;
  private readonly signResponseHandler: SignResponseHandler;
  private readonly settings: SettingsService;

  /** Active long-polling subscriptions: requestId -> AbortController */
  private readonly activeSubscriptions = new Map<string, AbortController>();

  constructor(opts: PushRelaySigningChannelOpts) {
    this.signRequestBuilder = opts.signRequestBuilder;
    this.signResponseHandler = opts.signResponseHandler;
    this.settings = opts.settingsService;
  }

  // -------------------------------------------------------------------------
  // sendRequest -- POST to Push Relay + start long-polling
  // -------------------------------------------------------------------------

  /**
   * Send a SignRequest via Push Relay HTTP POST and start long-polling for response.
   *
   * @param params - Transaction metadata + walletId
   * @returns requestId, requestTopic, responseTopic (empty for push relay)
   */
  async sendRequest(params: SendRequestParams): Promise<SendRequestResult> {
    // 1. Build SignRequest via SignRequestBuilder
    const { request, universalLinkUrl, requestTopic } =
      this.signRequestBuilder.buildRequest(params);

    // 2. Register request with SignResponseHandler for later matching
    this.signResponseHandler.registerRequest(request);

    // 3. Extract pushRelayUrl from responseChannel
    const pushRelayUrl =
      request.responseChannel.type === 'push_relay'
        ? request.responseChannel.pushRelayUrl
        : '';

    // 4. POST to Push Relay /v1/push (non-throwing per ERR-01)
    if (pushRelayUrl) {
      try {
        const apiKey = this.settings.get('signing_sdk.push_relay_api_key');
        const encoded = Buffer.from(JSON.stringify(request), 'utf-8').toString('base64url');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SIGNING_CHANNEL_FETCH_TIMEOUT_MS);
        try {
          const res = await fetch(`${pushRelayUrl}/v1/push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': apiKey,
            },
            body: JSON.stringify({
              subscriptionToken: requestTopic,
              category: 'sign_request',
              payload: {
                request: encoded,
                universalLinkUrl,
              },
            }),
            signal: controller.signal,
          });

          if (!res.ok) {
            throw new Error(`Push Relay POST failed: HTTP ${res.status}`);
          }
        } finally {
          clearTimeout(timeoutId);
        }

        // 5. Start long-polling in background (non-blocking)
        void this.pollForResponse(pushRelayUrl, request.requestId, request.expiresAt);
      } catch (err) {
        // ERR-01: Log error but do NOT throw -- transaction stays PENDING_APPROVAL
        console.error('[PushRelaySigningChannel] Failed to send request:', err);
      }
    } else {
      console.error('[PushRelaySigningChannel] Failed to send request:', new Error('Missing pushRelayUrl'));
    }

    return {
      requestId: request.requestId,
      requestTopic,
      responseTopic: '',
    };
  }

  // -------------------------------------------------------------------------
  // Subscription management
  // -------------------------------------------------------------------------

  /**
   * Cancel a specific long-polling subscription by requestId.
   */
  cancelSubscription(requestId: string): void {
    const controller = this.activeSubscriptions.get(requestId);
    if (controller) {
      controller.abort();
      this.activeSubscriptions.delete(requestId);
    }
  }

  /**
   * Shutdown all active long-polling subscriptions (daemon shutdown).
   */
  shutdown(): void {
    for (const [requestId, controller] of this.activeSubscriptions) {
      controller.abort();
      this.activeSubscriptions.delete(requestId);
    }
  }

  // -------------------------------------------------------------------------
  // Private: long-polling for sign response
  // -------------------------------------------------------------------------

  private async pollForResponse(
    pushRelayUrl: string,
    requestId: string,
    expiresAt: string,
  ): Promise<void> {
    const abortController = new AbortController();
    this.activeSubscriptions.set(requestId, abortController);

    // Set expiration timer
    const expiresAtMs = new Date(expiresAt).getTime();
    const timeoutMs = Math.max(0, expiresAtMs - Date.now());
    const timer = setTimeout(() => {
      this.cancelSubscription(requestId);
    }, timeoutMs);

    // Unref timer so it doesn't prevent process exit
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }

    let errorRetries = 0;

    try {
      while (!abortController.signal.aborted && errorRetries < MAX_ERROR_RETRIES) {
        try {
          const res = await fetch(
            `${pushRelayUrl}/v1/sign-response/${requestId}?timeout=${LONG_POLL_TIMEOUT_S}`,
            { signal: abortController.signal },
          );

          if (abortController.signal.aborted) break;

          if (res.status === 200) {
            // Response found -- parse and handle
            const body = (await res.json()) as { response: string };
            const json = Buffer.from(body.response, 'base64url').toString('utf-8');
            const parsed: unknown = JSON.parse(json);
            const signResponse = SignResponseSchema.parse(parsed) as SignResponse;

            await this.signResponseHandler.handle(signResponse);

            // Clean up
            this.activeSubscriptions.delete(requestId);
            clearTimeout(timer);
            return;
          }

          if (res.status === 204) {
            // No response yet -- continue polling (NOT counted as error retry)
            continue;
          }

          // Non-2xx error -- count as error retry
          throw new Error(`Long-poll failed: HTTP ${res.status}`);
        } catch (_err) {
          if (abortController.signal.aborted) break;

          errorRetries++;
          if (errorRetries < MAX_ERROR_RETRIES) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = BASE_BACKOFF_MS * Math.pow(2, errorRetries - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    } finally {
      // Clean up after max retries or abort
      this.activeSubscriptions.delete(requestId);
      clearTimeout(timer);
    }
  }
}
