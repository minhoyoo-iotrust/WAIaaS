import { SignRequestSchema, NotificationMessageSchema } from '@waiaas/core';
import type { SignRequest, NotificationMessage } from '@waiaas/core';

export interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
  category: 'sign_request' | 'notification';
  priority: 'high' | 'normal';
}

export interface ParsedNtfyMessage {
  topic: string;
  message: string;
  title?: string;
  priority?: number;
  tags?: string[];
}

export function determineMessageType(
  topic: string,
  signPrefix: string,
  notifyPrefix: string,
): 'sign_request' | 'notification' | null {
  if (topic.startsWith(signPrefix)) return 'sign_request';
  if (topic.startsWith(notifyPrefix)) return 'notification';
  return null;
}

export function mapPriority(ntfyPriority: number | undefined): 'high' | 'normal' {
  return ntfyPriority === 5 ? 'high' : 'normal';
}

export function parseSignRequest(encoded: string): SignRequest {
  const json = Buffer.from(encoded, 'base64url').toString('utf-8');
  const parsed: unknown = JSON.parse(json);
  return SignRequestSchema.parse(parsed);
}

export function parseNotificationMessage(encoded: string): NotificationMessage {
  const json = Buffer.from(encoded, 'base64url').toString('utf-8');
  const parsed: unknown = JSON.parse(json);
  return NotificationMessageSchema.parse(parsed);
}

export function buildPushPayload(
  ntfyMsg: ParsedNtfyMessage,
  type: 'sign_request' | 'notification',
): PushPayload {
  if (type === 'sign_request') {
    const request = parseSignRequest(ntfyMsg.message);
    const bodyParts = [request.metadata.type];
    if (request.metadata.amount && request.metadata.symbol) {
      bodyParts.push(`${request.metadata.amount} ${request.metadata.symbol}`);
    }
    return {
      title: ntfyMsg.title ?? request.displayMessage,
      body: bodyParts.join(' '),
      data: flattenToStrings(request),
      category: 'sign_request',
      priority: mapPriority(ntfyMsg.priority),
    };
  }

  const notification = parseNotificationMessage(ntfyMsg.message);
  return {
    title: notification.title,
    body: notification.body,
    data: flattenToStrings(notification),
    category: 'notification',
    priority: mapPriority(ntfyMsg.priority),
  };
}

function flattenToStrings(obj: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = String(value);
    } else if (value !== null && value !== undefined) {
      result[key] = JSON.stringify(value);
    }
  }
  return result;
}
