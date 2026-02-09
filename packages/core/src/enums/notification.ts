import { z } from 'zod';

// NotificationEventType: event types from 35-notification-architecture
export const NOTIFICATION_EVENT_TYPES = [
  'TX_REQUESTED',
  'TX_QUEUED',
  'TX_SUBMITTED',
  'TX_CONFIRMED',
  'TX_FAILED',
  'TX_CANCELLED',
  'TX_DOWNGRADED_DELAY',
  'POLICY_VIOLATION',
  'AGENT_SUSPENDED',
  'KILL_SWITCH_ACTIVATED',
  'KILL_SWITCH_RECOVERED',
  'SESSION_EXPIRING_SOON',
  'SESSION_EXPIRED',
  'OWNER_SET',
  'OWNER_REMOVED',
  'OWNER_VERIFIED',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
export const NotificationEventTypeEnum = z.enum(NOTIFICATION_EVENT_TYPES);
