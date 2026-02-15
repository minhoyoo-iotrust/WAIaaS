import { z } from 'zod';

// NotificationEventType: event types from 35-notification-architecture (22 total)
export const NOTIFICATION_EVENT_TYPES = [
  'TX_REQUESTED',
  'TX_QUEUED',
  'TX_SUBMITTED',
  'TX_CONFIRMED',
  'TX_FAILED',
  'TX_CANCELLED',
  'TX_DOWNGRADED_DELAY',
  'TX_APPROVAL_REQUIRED',
  'TX_APPROVAL_EXPIRED',
  'POLICY_VIOLATION',
  'WALLET_SUSPENDED',
  'KILL_SWITCH_ACTIVATED',
  'KILL_SWITCH_RECOVERED',
  'AUTO_STOP_TRIGGERED',
  'SESSION_EXPIRING_SOON',
  'SESSION_EXPIRED',
  'SESSION_CREATED',
  'OWNER_SET',
  'OWNER_REMOVED',
  'OWNER_VERIFIED',
  'DAILY_SUMMARY',
  'CUMULATIVE_LIMIT_WARNING',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
export const NotificationEventTypeEnum = z.enum(NOTIFICATION_EVENT_TYPES);

// NotificationLogStatus: delivery result status for notification_logs table
export const NOTIFICATION_LOG_STATUSES = ['sent', 'failed'] as const;
export type NotificationLogStatus = (typeof NOTIFICATION_LOG_STATUSES)[number];
export const NotificationLogStatusEnum = z.enum(NOTIFICATION_LOG_STATUSES);
