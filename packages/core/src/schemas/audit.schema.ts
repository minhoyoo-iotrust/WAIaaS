/**
 * Audit log Zod SSoT schemas.
 *
 * Defines 24 audit event types, 3 severity levels, and request/response
 * schemas for the GET /v1/audit-logs API.
 *
 * Derivation order: Zod -> TypeScript types -> OpenAPI (via @hono/zod-openapi)
 *
 * @see docs/25-sqlite-schema.md
 * @see .planning/milestones/v30.0-phases/305/DESIGN-SPEC.md (OPS-02)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// AuditEventType (26 events -- OPS-02 section 2.1 + PROVIDER_UPDATED + UserOp + WALLET_PURGED + External Action)
// ---------------------------------------------------------------------------

export const AUDIT_EVENT_TYPES = [
  'WALLET_CREATED',
  'WALLET_SUSPENDED',
  'WALLET_PURGED',
  'SESSION_CREATED',
  'SESSION_REVOKED',
  'SESSION_ISSUED_VIA_TELEGRAM',
  'TX_SUBMITTED',
  'TX_CONFIRMED',
  'TX_FAILED',
  'TX_APPROVED_VIA_TELEGRAM',
  'TX_REJECTED_VIA_TELEGRAM',
  'TX_CANCELLED_VIA_TELEGRAM',
  'UNLISTED_TOKEN_TRANSFER',
  'POLICY_DENIED',
  'KILL_SWITCH_ACTIVATED',
  'KILL_SWITCH_ESCALATED',
  'KILL_SWITCH_RECOVERED',
  'AUTO_STOP_TRIGGERED',
  'MASTER_AUTH_FAILED',
  'OWNER_REGISTERED',
  'PROVIDER_UPDATED',
  'NOTIFICATION_TOTAL_FAILURE',
  'USEROP_BUILD',
  'USEROP_SIGNED',
  'ACTION_SIGNED',
  'ACTION_HTTP_SIGNED',
] as const;

export const AuditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

// ---------------------------------------------------------------------------
// AuditSeverity (3 levels)
// ---------------------------------------------------------------------------

export const AUDIT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export const AuditSeveritySchema = z.enum(AUDIT_SEVERITIES);
export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;

// ---------------------------------------------------------------------------
// AuditLogQuerySchema (GET /v1/audit-logs query params)
// ---------------------------------------------------------------------------

export const AuditLogQuerySchema = z.object({
  wallet_id: z.string().uuid().optional(),
  event_type: AuditEventTypeSchema.optional(),
  severity: AuditSeveritySchema.optional(),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  tx_id: z.string().uuid().optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  include_total: z.coerce.boolean().default(false),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

// ---------------------------------------------------------------------------
// AuditLogItemSchema (single audit log entry)
// ---------------------------------------------------------------------------

export const AuditLogItemSchema = z.object({
  id: z.number().int(),
  timestamp: z.number().int(),
  eventType: AuditEventTypeSchema,
  actor: z.string(),
  walletId: z.string().nullable(),
  sessionId: z.string().nullable(),
  txId: z.string().nullable(),
  details: z.record(z.unknown()),
  severity: AuditSeveritySchema,
  ipAddress: z.string().nullable(),
});

export type AuditLogItem = z.infer<typeof AuditLogItemSchema>;

// ---------------------------------------------------------------------------
// AuditLogResponseSchema (API response)
// ---------------------------------------------------------------------------

export const AuditLogResponseSchema = z.object({
  data: z.array(AuditLogItemSchema),
  nextCursor: z.number().int().nullable(),
  hasMore: z.boolean(),
  total: z.number().int().optional(),
});

export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;
