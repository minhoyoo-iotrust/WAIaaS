import type { NotificationEventType } from '../enums/notification.js';

/**
 * Notification payload sent to channels.
 * Contains event type, agent context, message, and timestamp.
 */
export interface NotificationPayload {
  /** Event type triggering the notification. */
  eventType: NotificationEventType;
  /** Agent ID associated with the event. */
  agentId: string;
  /** Human-readable message. */
  message: string;
  /** Additional event-specific details. */
  details?: Record<string, unknown>;
  /** Unix epoch seconds. */
  timestamp: number;
}

/**
 * Notification channel interface.
 * All notification channels (Telegram, Discord, ntfy.sh) implement this interface.
 *
 * Design reference: 35-notification-architecture.md
 */
export interface INotificationChannel {
  /** Initialize the channel (validate API keys, etc.). */
  initialize(config: Record<string, unknown>): Promise<void>;

  /** Send a notification payload. */
  send(payload: NotificationPayload): Promise<void>;

  /** Channel display name. */
  readonly name: string;
}
