/**
 * ntfy channel functions for the WAIaaS Signing Protocol.
 *
 * sendViaNtfy - Publish a SignResponse to an ntfy response topic.
 * subscribeToRequests - SSE subscription for incoming sign requests.
 *
 * @see internal/design/73-signing-protocol-v1.md Section 7.4
 * @see internal/design/74-wallet-sdk-daemon-components.md Section 2.6
 */

import type { SignRequest, SignResponse } from '@waiaas/core';
import { SignRequestSchema } from '@waiaas/core';

const DEFAULT_SERVER_URL = 'https://ntfy.sh';
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 5_000;

/**
 * Publish a SignResponse to an ntfy response topic.
 *
 * Encodes the response as base64url and POSTs it to the ntfy server.
 *
 * @param response - Validated SignResponse object
 * @param responseTopic - ntfy topic name for responses
 * @param serverUrl - ntfy server URL (defaults to https://ntfy.sh)
 */
export async function sendViaNtfy(
  response: SignResponse,
  responseTopic: string,
  serverUrl: string = DEFAULT_SERVER_URL,
): Promise<void> {
  const json = JSON.stringify(response);
  const encoded = Buffer.from(json, 'utf-8').toString('base64url');

  const url = `${serverUrl}/${responseTopic}`;
  const res = await fetch(url, {
    method: 'POST',
    body: encoded,
  });

  if (!res.ok) {
    throw new Error(
      `Failed to send response to ntfy: HTTP ${String(res.status)}`,
    );
  }
}

/**
 * Subscribe to sign requests via ntfy SSE stream.
 *
 * Listens for new messages on the specified ntfy topic and parses them
 * as SignRequest objects. Valid, non-expired requests trigger the callback.
 *
 * @param topic - ntfy topic name for incoming sign requests
 * @param callback - Function called for each valid SignRequest received
 * @param serverUrl - ntfy server URL (defaults to https://ntfy.sh)
 * @returns Object with unsubscribe() method to close the SSE connection
 */
export function subscribeToRequests(
  topic: string,
  callback: (request: SignRequest) => void,
  serverUrl: string = DEFAULT_SERVER_URL,
): { unsubscribe: () => void } {
  const abortController = new AbortController();
  let reconnectAttempts = 0;

  async function connect(): Promise<void> {
    if (abortController.signal.aborted) return;

    try {
      const url = `${serverUrl}/${topic}/sse`;
      const res = await fetch(url, {
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`SSE connection failed: HTTP ${String(res.status)}`);
      }

      // Reset reconnect counter on successful connection
      reconnectAttempts = 0;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!abortController.signal.aborted) {
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
            const event = JSON.parse(dataStr) as { message?: string };
            if (!event.message) continue;

            const json = Buffer.from(event.message, 'base64url').toString(
              'utf-8',
            );
            const parsed: unknown = JSON.parse(json);
            const request = SignRequestSchema.parse(parsed);

            // Skip expired requests
            const expiresAt = new Date(request.expiresAt).getTime();
            if (expiresAt < Date.now()) {
              continue;
            }

            callback(request);
          } catch {
            // Ignore malformed messages
          }
        }
      }
    } catch (err) {
      // Don't reconnect if explicitly aborted
      if (abortController.signal.aborted) return;

      reconnectAttempts++;
      if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, RECONNECT_DELAY_MS),
        );
        void connect();
      }
    }
  }

  void connect();

  return {
    unsubscribe(): void {
      abortController.abort();
    },
  };
}
