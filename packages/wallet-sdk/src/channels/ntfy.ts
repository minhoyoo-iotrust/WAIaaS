/**
 * ntfy channel functions for the WAIaaS Signing Protocol.
 *
 * @deprecated All functions in this module are deprecated. Use Push Relay
 * functions (sendViaRelay, registerDevice, etc.) from the relay channel instead.
 * These will be removed in the next major version.
 *
 * @see internal/design/73-signing-protocol-v1.md Section 7.4
 * @see internal/design/74-wallet-sdk-daemon-components.md Section 2.6
 */

import type { SignRequest, SignResponse, NotificationMessage } from '@waiaas/core';
import { SignRequestSchema, NotificationMessageSchema } from '@waiaas/core';

const DEFAULT_SERVER_URL = 'https://ntfy.sh';
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 5_000;

/** Parsed ntfy SSE event with optional file attachment. */
interface NtfyEvent {
  message?: string;
  title?: string;
  priority?: number;
  /** Present when message exceeds ntfy size limit (~4KB) and is auto-converted to file. */
  attachment?: { url: string };
}

/**
 * Resolve the actual encoded message from an ntfy event.
 * When payload exceeds ntfy's size limit, the message is stored as a file
 * attachment and must be downloaded to recover the original request body.
 */
async function resolveMessage(event: NtfyEvent): Promise<string | null> {
  if (event.attachment?.url) {
    const res = await fetch(event.attachment.url);
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    return typeof body.message === 'string' ? body.message : null;
  }
  return event.message ?? null;
}

/**
 * Publish a SignResponse to an ntfy response topic.
 *
 * Encodes the response as base64url and POSTs it to the ntfy server.
 *
 * @deprecated Use Push Relay functions (sendViaRelay) instead. Will be removed in next major version.
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
 * @deprecated Use Push Relay device registration instead. Will be removed in next major version.
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
            const event = JSON.parse(dataStr) as NtfyEvent;
            const message = await resolveMessage(event);
            if (!message) continue;

            const json = Buffer.from(message, 'base64url').toString(
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
    } catch (_err) {
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

/**
 * Parse and validate a base64url-encoded NotificationMessage.
 *
 * Decodes the base64url string, parses JSON, and validates against
 * NotificationMessageSchema.
 *
 * @deprecated Use Push Relay notification parsing instead. Will be removed in next major version.
 * @param data - base64url-encoded NotificationMessage JSON string
 * @returns Validated NotificationMessage object
 * @throws Error if decoding, parsing, or validation fails
 */
export function parseNotification(data: string): NotificationMessage {
  const json = Buffer.from(data, 'base64url').toString('utf-8');
  const parsed: unknown = JSON.parse(json);
  return NotificationMessageSchema.parse(parsed);
}

/**
 * Subscribe to notification events via ntfy SSE stream.
 *
 * Listens for new messages on the specified ntfy topic and parses them
 * as NotificationMessage objects via parseNotification().
 * Valid messages trigger the callback.
 *
 * @deprecated Use Push Relay device registration instead. Will be removed in next major version.
 * @param topic - ntfy topic name (e.g., 'waiaas-notify-trading-bot')
 * @param callback - Function called for each valid NotificationMessage received
 * @param serverUrl - ntfy server URL (defaults to https://ntfy.sh)
 * @returns Object with unsubscribe() method to close the SSE connection
 */
export function subscribeToNotifications(
  topic: string,
  callback: (message: NotificationMessage) => void,
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

      reconnectAttempts = 0;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!abortController.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;

          try {
            const event = JSON.parse(dataStr) as NtfyEvent;
            const message = await resolveMessage(event);
            if (!message) continue;

            const notification = parseNotification(message);
            callback(notification);
          } catch {
            // Ignore malformed messages
          }
        }
      }
    } catch (_err) {
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
