import { z } from 'zod';

// AuditAction: event types from 25-sqlite-schema section 2.8
export const AUDIT_ACTIONS = [
  'WALLET_CREATED',
  'WALLET_ACTIVATED',
  'WALLET_SUSPENDED',
  'WALLET_TERMINATED',
  'SESSION_ISSUED',
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
  'TX_REQUESTED',
  'TX_QUEUED',
  'TX_SUBMITTED',
  'TX_CONFIRMED',
  'TX_FAILED',
  'TX_CANCELLED',
  'POLICY_VIOLATION',
  'POLICY_UPDATED',
  'KEYSTORE_UNLOCKED',
  'KEYSTORE_LOCKED',
  'KEY_ROTATED',
  'KILL_SWITCH_ACTIVATED',
  'DAEMON_STARTED',
  'DAEMON_STOPPED',
  'AUTH_FAILED',
  'RATE_LIMIT_EXCEEDED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export const AuditActionEnum = z.enum(AUDIT_ACTIONS);
