import type { NotificationEventType } from '../enums/notification.js';

/**
 * Notification payload sent to channels.
 * Contains event type, wallet context, message, and timestamp.
 */
export interface NotificationPayload {
  /** Event type triggering the notification. */
  eventType: NotificationEventType;
  /** Wallet ID associated with the event. */
  walletId: string;
  /** Notification title (short, human-readable). */
  title: string;
  /** Notification body (detailed message). */
  body: string;
  /** Human-readable message (title + body combined, for logging). */
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
