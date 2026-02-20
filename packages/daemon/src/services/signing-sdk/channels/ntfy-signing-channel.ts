/**
 * NtfySigningChannel -- publishes SignRequests to ntfy and subscribes to responses via SSE.
 *
 * When a PENDING_APPROVAL transaction triggers a SignRequest:
 *   1. Publishes the request to the wallet's ntfy request topic (JSON format per doc 73 Section 7.2)
 *   2. Subscribes to the response topic via SSE
 *   3. Parses incoming SignResponse messages (base64url in ntfy message field)
 *   4. Delegates to SignResponseHandler for approval/rejection processing
 *
 * @see internal/design/73-signing-protocol-v1.md (Section 7.2, 7.3)
 * @see internal/design/74-wallet-sdk-daemon-components.md
 */

import {
  type SignRequest,
  type SignResponse,
  SignResponseSchema,
} from '@waiaas/core';
import type { SignRequestBuilder, BuildRequestParams } from '../sign-request-builder.js';
import type { SignResponseHandler } from '../sign-response-handler.js';
import type { SettingsService } from '../../../infrastructure/settings/settings-service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 5_000;
const DEFAULT_NTFY_SERVER = 'https://ntfy.sh';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NtfySigningChannelOpts {
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

interface NtfyMessage {
  id?: string;
  time?: number;
  event?: string;
  topic?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// NtfySigningChannel
// ---------------------------------------------------------------------------

export class NtfySigningChannel {
  private readonly signRequestBuilder: SignRequestBuilder;
  private readonly signResponseHandler: SignResponseHandler;
  private readonly settings: SettingsService;

  /** Active SSE subscriptions: requestId -> AbortController */
  private readonly activeSubscriptions = new Map<string, AbortController>();

  constructor(opts: NtfySigningChannelOpts) {
    this.signRequestBuilder = opts.signRequestBuilder;
    this.signResponseHandler = opts.signResponseHandler;
    this.settings = opts.settingsService;
  }

  // -------------------------------------------------------------------------
  // sendRequest -- publish to ntfy + subscribe for response
  // -------------------------------------------------------------------------

  /**
   * Publish a SignRequest to ntfy request topic and subscribe to response topic.
   *
   * @param params - Transaction metadata + walletId for topic routing
   * @returns requestId, requestTopic, responseTopic
   */
  async sendRequest(params: SendRequestParams): Promise<SendRequestResult> {
    // 1. Build SignRequest via SignRequestBuilder
    const { request, universalLinkUrl, requestTopic } =
      this.signRequestBuilder.buildRequest(params);

    // 2. Register request with SignResponseHandler for later matching
    this.signResponseHandler.registerRequest(request);

    // 3. Resolve ntfy server URL
    const ntfyServer = this.getNtfyServer();

    // 4. Publish to ntfy request topic (doc 73 Section 7.2)
    await this.publishToNtfy(ntfyServer, requestTopic, request, universalLinkUrl);

    // 5. Determine response topic
    let responseTopic: string;
    if (request.responseChannel.type === 'ntfy') {
      responseTopic = request.responseChannel.responseTopic;
    } else {
      // Fallback: construct response topic from request
      const prefix = this.settings.get('signing_sdk.ntfy_response_topic_prefix');
      responseTopic = `${prefix}-${request.requestId}`;
    }

    // 6. Subscribe to response topic via SSE (background, non-blocking)
    this.subscribeToResponseTopic(ntfyServer, responseTopic, request.requestId, request.expiresAt);

    return {
      requestId: request.requestId,
      requestTopic,
      responseTopic,
    };
  }

  // -------------------------------------------------------------------------
  // Subscription management
  // -------------------------------------------------------------------------

  /**
   * Cancel a specific SSE subscription by requestId.
   */
  cancelSubscription(requestId: string): void {
    const controller = this.activeSubscriptions.get(requestId);
    if (controller) {
      controller.abort();
      this.activeSubscriptions.delete(requestId);
    }
  }

  /**
   * Shutdown all active SSE subscriptions (daemon shutdown).
   */
  shutdown(): void {
    for (const [requestId, controller] of this.activeSubscriptions) {
      controller.abort();
      this.activeSubscriptions.delete(requestId);
    }
  }

  // -------------------------------------------------------------------------
  // Private: ntfy server URL
  // -------------------------------------------------------------------------

  private getNtfyServer(): string {
    try {
      const server = this.settings.get('notifications.ntfy_server');
      return server || DEFAULT_NTFY_SERVER;
    } catch {
      return DEFAULT_NTFY_SERVER;
    }
  }

  // -------------------------------------------------------------------------
  // Private: publish to ntfy (doc 73 Section 7.2)
  // -------------------------------------------------------------------------

  private async publishToNtfy(
    ntfyServer: string,
    requestTopic: string,
    request: SignRequest,
    universalLinkUrl: string,
  ): Promise<void> {
    const url = `${ntfyServer}/${requestTopic}`;
    const encoded = Buffer.from(JSON.stringify(request), 'utf-8').toString('base64url');
    const body = JSON.stringify({
      topic: requestTopic,
      message: encoded,
      title: request.displayMessage,
      priority: 5,
      tags: ['waiaas', 'sign'],
      actions: [
        {
          action: 'view',
          label: 'Sign in wallet',
          url: universalLinkUrl,
        },
      ],
      click: universalLinkUrl,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      throw new Error(`Failed to publish sign request to ntfy: HTTP ${res.status}`);
    }
  }

  // -------------------------------------------------------------------------
  // Private: subscribe to response topic via SSE
  // -------------------------------------------------------------------------

  private subscribeToResponseTopic(
    ntfyServer: string,
    responseTopic: string,
    requestId: string,
    expiresAt: string,
  ): void {
    const abortController = new AbortController();
    this.activeSubscriptions.set(requestId, abortController);

    // Set timeout for request expiration
    const expiresAtMs = new Date(expiresAt).getTime();
    const timeoutMs = Math.max(0, expiresAtMs - Date.now());
    const timer = setTimeout(() => {
      this.cancelSubscription(requestId);
    }, timeoutMs);

    // Unref timer so it doesn't prevent process exit
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }

    // Start SSE connection (non-blocking)
    void this.connectSse(ntfyServer, responseTopic, requestId, abortController, timer);
  }

  private async connectSse(
    ntfyServer: string,
    responseTopic: string,
    requestId: string,
    abortController: AbortController,
    expirationTimer: ReturnType<typeof setTimeout>,
    reconnectAttempt = 0,
  ): Promise<void> {
    if (abortController.signal.aborted) {
      clearTimeout(expirationTimer);
      return;
    }

    try {
      const url = `${ntfyServer}/${responseTopic}/sse`;
      const res = await fetch(url, {
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`SSE connection failed: HTTP ${res.status}`);
      }

      const reader = (res.body as ReadableStream<Uint8Array>).getReader();

      for await (const ntfyMsg of this.parseSseStream(reader, abortController.signal)) {
        if (abortController.signal.aborted) break;

        if (!ntfyMsg.message) continue;

        // ntfy message field contains base64url-encoded SignResponse
        try {
          const json = Buffer.from(ntfyMsg.message, 'base64url').toString('utf-8');
          const parsed: unknown = JSON.parse(json);
          const signResponse = SignResponseSchema.parse(parsed) as SignResponse;

          // Only process responses for this requestId
          if (signResponse.requestId !== requestId) continue;

          // Delegate to SignResponseHandler
          await this.signResponseHandler.handle(signResponse);

          // Response processed -- close subscription
          this.cancelSubscription(requestId);
          clearTimeout(expirationTimer);
          return;
        } catch {
          // Ignore malformed messages or handler errors
        }
      }
    } catch (_err) {
      // Don't reconnect if explicitly aborted
      if (abortController.signal.aborted) {
        clearTimeout(expirationTimer);
        return;
      }

      // Reconnect logic: max 3 attempts, 5s delay
      if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
        return this.connectSse(
          ntfyServer,
          responseTopic,
          requestId,
          abortController,
          expirationTimer,
          reconnectAttempt + 1,
        );
      }

      // Max reconnects exceeded -- clean up
      this.activeSubscriptions.delete(requestId);
      clearTimeout(expirationTimer);
    }
  }

  // -------------------------------------------------------------------------
  // Private: SSE stream parser
  // -------------------------------------------------------------------------

  /**
   * Parse an SSE stream into NtfyMessage objects.
   *
   * ntfy SSE format:
   *   event: message
   *   data: {"id":"...","time":...,"event":"message","topic":"...","message":"..."}
   *
   * We only care about `data:` lines containing JSON with a `message` field.
   */
  private async *parseSseStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    signal: AbortSignal,
  ): AsyncGenerator<NtfyMessage> {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last incomplete line in buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;

          try {
            const msg = JSON.parse(dataStr) as NtfyMessage;
            yield msg;
          } catch {
            // Ignore malformed JSON
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Reader may already be released
      }
    }
  }
}
