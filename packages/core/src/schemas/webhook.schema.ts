/**
 * Webhook Outbound Zod SSoT schemas.
 *
 * Defines webhook CRUD request/response schemas, delivery log schemas,
 * and event type reuse from audit event types.
 *
 * Derivation order: Zod -> TypeScript types -> OpenAPI (via @hono/zod-openapi)
 *
 * @see .planning/milestones/v30.0-phases/307/DESIGN-SPEC.md (OPS-04)
 */

import { z } from 'zod';
import { AUDIT_EVENT_TYPES } from './audit.schema.js';

// ---------------------------------------------------------------------------
// Webhook Event Types (reuse AuditEventType -- same 20 events)
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENT_TYPES = AUDIT_EVENT_TYPES;
export const WebhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

// ---------------------------------------------------------------------------
// CreateWebhookRequestSchema (POST /v1/webhooks body)
// ---------------------------------------------------------------------------

export const CreateWebhookRequestSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(WebhookEventTypeSchema).default([]),
  description: z.string().max(256).optional(),
});

export type CreateWebhookRequest = z.infer<typeof CreateWebhookRequestSchema>;

// ---------------------------------------------------------------------------
// WebhookResponseSchema (GET /v1/webhooks list item -- no secret)
// ---------------------------------------------------------------------------

export const WebhookResponseSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  events: z.array(z.string()),
  description: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type WebhookResponse = z.infer<typeof WebhookResponseSchema>;

// ---------------------------------------------------------------------------
// CreateWebhookResponseSchema (POST /v1/webhooks response -- includes secret)
// ---------------------------------------------------------------------------

export const CreateWebhookResponseSchema = WebhookResponseSchema.extend({
  secret: z.string(), // 64-char hex -- returned only once
});

export type CreateWebhookResponse = z.infer<typeof CreateWebhookResponseSchema>;

// ---------------------------------------------------------------------------
// Webhook Log schemas
// ---------------------------------------------------------------------------

export const WEBHOOK_LOG_STATUSES = ['success', 'failed'] as const;

export const WebhookLogSchema = z.object({
  id: z.string().uuid(),
  webhookId: z.string().uuid(),
  eventType: z.string(),
  status: z.enum(WEBHOOK_LOG_STATUSES),
  httpStatus: z.number().int().nullable(),
  attempt: z.number().int(),
  error: z.string().nullable(),
  requestDuration: z.number().int().nullable(),
  createdAt: z.number().int(),
});

export type WebhookLog = z.infer<typeof WebhookLogSchema>;

// ---------------------------------------------------------------------------
// WebhookLogQuerySchema (GET /v1/webhooks/:id/logs query params)
// ---------------------------------------------------------------------------

export const WebhookLogQuerySchema = z.object({
  status: z.enum(WEBHOOK_LOG_STATUSES).optional(),
  event_type: WebhookEventTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

export type WebhookLogQuery = z.infer<typeof WebhookLogQuerySchema>;
