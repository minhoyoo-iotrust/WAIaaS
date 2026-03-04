/**
 * Admin Stats + AutoStop Rules Zod SSoT schemas.
 *
 * AdminStatsResponseSchema: 7-category operational statistics.
 * AutoStopRulesResponseSchema: AutoStop rule list with per-rule status.
 * UpdateAutoStopRuleRequestSchema: Per-rule enable/config update.
 *
 * @see STAT-01, PLUG-03 requirements
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Stats sub-schemas (7 categories)
// ---------------------------------------------------------------------------

export const AdminStatsTransactionsSchema = z.object({
  total: z.number(),
  byStatus: z.record(z.number()),
  byType: z.record(z.number()),
  last24h: z.object({ count: z.number(), totalUsd: z.number().nullable() }),
  last7d: z.object({ count: z.number(), totalUsd: z.number().nullable() }),
});

export const AdminStatsSessionsSchema = z.object({
  active: z.number(),
  total: z.number(),
  revokedLast24h: z.number(),
});

export const AdminStatsWalletsSchema = z.object({
  total: z.number(),
  byStatus: z.record(z.number()),
  withOwner: z.number(),
});

export const AdminStatsRpcSchema = z.object({
  totalCalls: z.number(),
  totalErrors: z.number(),
  avgLatencyMs: z.number(),
  byNetwork: z.array(z.object({
    network: z.string(),
    calls: z.number(),
    errors: z.number(),
    avgLatencyMs: z.number(),
  })),
});

export const AdminStatsAutoStopSchema = z.object({
  enabled: z.boolean(),
  triggeredTotal: z.number(),
  rules: z.array(z.object({
    id: z.string(),
    displayName: z.string(),
    enabled: z.boolean(),
    trackedCount: z.number(),
  })),
  lastTriggeredAt: z.number().nullable(),
});

export const AdminStatsNotificationsSchema = z.object({
  sentLast24h: z.number(),
  failedLast24h: z.number(),
  channelStatus: z.record(z.string()),
});

export const AdminStatsSystemSchema = z.object({
  uptimeSeconds: z.number(),
  version: z.string(),
  schemaVersion: z.number(),
  dbSizeBytes: z.number(),
  nodeVersion: z.string(),
  platform: z.string(),
  timestamp: z.number(),
});

// ---------------------------------------------------------------------------
// AdminStatsResponse (7 categories combined)
// ---------------------------------------------------------------------------

export const AdminStatsResponseSchema = z.object({
  transactions: AdminStatsTransactionsSchema,
  sessions: AdminStatsSessionsSchema,
  wallets: AdminStatsWalletsSchema,
  rpc: AdminStatsRpcSchema,
  autostop: AdminStatsAutoStopSchema,
  notifications: AdminStatsNotificationsSchema,
  system: AdminStatsSystemSchema,
});

export type AdminStatsResponse = z.infer<typeof AdminStatsResponseSchema>;

// ---------------------------------------------------------------------------
// AutoStop Rule Info
// ---------------------------------------------------------------------------

export const AutoStopRuleInfoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  subscribedEvents: z.array(z.string()),
  config: z.record(z.unknown()),
  state: z.record(z.unknown()),
});

export type AutoStopRuleInfo = z.infer<typeof AutoStopRuleInfoSchema>;

// ---------------------------------------------------------------------------
// AutoStop Rules Response
// ---------------------------------------------------------------------------

export const AutoStopRulesResponseSchema = z.object({
  globalEnabled: z.boolean(),
  rules: z.array(AutoStopRuleInfoSchema),
});

export type AutoStopRulesResponse = z.infer<typeof AutoStopRulesResponseSchema>;

// ---------------------------------------------------------------------------
// Update AutoStop Rule Request
// ---------------------------------------------------------------------------

export const UpdateAutoStopRuleRequestSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export type UpdateAutoStopRuleRequest = z.infer<typeof UpdateAutoStopRuleRequestSchema>;
