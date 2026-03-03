/**
 * AdminStatsService: aggregates 7-category operational statistics.
 *
 * Combines DB aggregate queries (transactions, sessions, wallets, notifications)
 * with in-memory counters (RPC metrics) and service status (AutoStop, system info).
 * Results are cached with a 1-minute TTL.
 *
 * @see STAT-01, STAT-02, STAT-03 requirements
 */

import type { Database } from 'better-sqlite3';
import type { IMetricsCounter } from '@waiaas/core';
import type { AdminStatsResponse } from '@waiaas/core';
import type { InMemoryCounter } from '../infrastructure/metrics/in-memory-counter.js';
import { LATEST_SCHEMA_VERSION } from '../infrastructure/database/index.js';
import { statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// AdminStatsService
// ---------------------------------------------------------------------------

export class AdminStatsService {
  private cache: AdminStatsResponse | null = null;
  private cacheExpiry = 0;
  private readonly TTL_MS = 60_000; // 1 minute

  constructor(private opts: {
    sqlite: Database;
    metricsCounter: InMemoryCounter;
    autoStopService?: { getStatus(): { enabled: boolean; config: any; rules: any }; registry?: { getRules(): Array<{ id: string; displayName: string; enabled: boolean; getStatus(): { trackedCount: number } }> } };
    startTime: number;
    version: string;
    dataDir?: string;
  }) {}

  /** Get aggregated stats. Returns cached value if within TTL. */
  getStats(): AdminStatsResponse {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiry) {
      return this.cache;
    }

    const stats = this.buildStats();
    this.cache = stats;
    this.cacheExpiry = now + this.TTL_MS;
    return stats;
  }

  /** Force cache refresh on next getStats() call. */
  invalidateCache(): void {
    this.cache = null;
  }

  // -----------------------------------------------------------------------
  // Build stats
  // -----------------------------------------------------------------------

  private buildStats(): AdminStatsResponse {
    const sqlite = this.opts.sqlite;
    const nowSec = Math.floor(Date.now() / 1000);
    const day24h = nowSec - 86400;
    const day7d = nowSec - 604800;

    // 1. Transactions
    const txTotal = (sqlite.prepare('SELECT COUNT(*) as c FROM transactions').get() as { c: number }).c;

    const txByStatus: Record<string, number> = {};
    const statusRows = sqlite.prepare('SELECT status, COUNT(*) as c FROM transactions GROUP BY status').all() as Array<{ status: string; c: number }>;
    for (const row of statusRows) {
      txByStatus[row.status] = row.c;
    }

    const txByType: Record<string, number> = {};
    const typeRows = sqlite.prepare('SELECT type, COUNT(*) as c FROM transactions GROUP BY type').all() as Array<{ type: string; c: number }>;
    for (const row of typeRows) {
      txByType[row.type] = row.c;
    }

    const tx24h = sqlite.prepare('SELECT COUNT(*) as c, SUM(CASE WHEN amount_usd IS NOT NULL THEN amount_usd ELSE 0 END) as usd FROM transactions WHERE created_at >= ?').get(day24h) as { c: number; usd: number | null };
    const tx7d = sqlite.prepare('SELECT COUNT(*) as c, SUM(CASE WHEN amount_usd IS NOT NULL THEN amount_usd ELSE 0 END) as usd FROM transactions WHERE created_at >= ?').get(day7d) as { c: number; usd: number | null };

    // 2. Sessions
    const sessTotal = (sqlite.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
    const sessActive = (sqlite.prepare('SELECT COUNT(*) as c FROM sessions WHERE revoked_at IS NULL AND expires_at > ?').get(nowSec) as { c: number }).c;
    const sessRevoked24h = (sqlite.prepare('SELECT COUNT(*) as c FROM sessions WHERE revoked_at IS NOT NULL AND revoked_at >= ?').get(day24h) as { c: number }).c;

    // 3. Wallets
    const walletTotal = (sqlite.prepare('SELECT COUNT(*) as c FROM wallets').get() as { c: number }).c;
    const walletByStatus: Record<string, number> = {};
    const walletStatusRows = sqlite.prepare('SELECT status, COUNT(*) as c FROM wallets GROUP BY status').all() as Array<{ status: string; c: number }>;
    for (const row of walletStatusRows) {
      walletByStatus[row.status] = row.c;
    }
    const walletWithOwner = (sqlite.prepare('SELECT COUNT(*) as c FROM wallets WHERE owner_address IS NOT NULL').get() as { c: number }).c;

    // 4. RPC metrics from InMemoryCounter
    const mc = this.opts.metricsCounter;
    const rpcTotalCalls = mc.getCount('rpc.calls');
    const rpcTotalErrors = mc.getCount('rpc.errors');
    const rpcAvgLatency = mc.getAvgLatency('rpc.latency');

    // Aggregate per-network RPC stats
    const rpcCallsByNetwork = mc.getCountsByPrefix('rpc.calls|');
    const rpcErrorsByNetwork = mc.getCountsByPrefix('rpc.errors|');
    const rpcLatByNetwork = mc.getLatenciesByPrefix('rpc.latency|');

    const networkSet = new Set<string>();
    for (const k of [...rpcCallsByNetwork.keys(), ...rpcErrorsByNetwork.keys(), ...rpcLatByNetwork.keys()]) {
      const match = k.match(/network=([^|]+)/);
      if (match) networkSet.add(match[1]);
    }

    const byNetwork = Array.from(networkSet).map((network) => {
      const calls = mc.getCount('rpc.calls', { network });
      const errors = mc.getCount('rpc.errors', { network });
      const avgLatencyMs = mc.getAvgLatency('rpc.latency', { network });
      return { network, calls, errors, avgLatencyMs };
    });

    // 5. AutoStop
    const autoStopStatus = this.opts.autoStopService?.getStatus();
    const triggeredTotal = (sqlite.prepare("SELECT COUNT(*) as c FROM audit_log WHERE event_type = 'AUTO_STOP_TRIGGERED'").get() as { c: number }).c;
    const lastTriggeredRow = sqlite.prepare("SELECT MAX(timestamp) as ts FROM audit_log WHERE event_type = 'AUTO_STOP_TRIGGERED'").get() as { ts: number | null };

    // Build rules list from registry if available
    const registryRules = this.opts.autoStopService?.registry?.getRules();
    const autoStopRules = registryRules
      ? registryRules.map((r) => ({
          id: r.id,
          displayName: r.displayName,
          enabled: r.enabled,
          trackedCount: r.getStatus().trackedCount,
        }))
      : [];

    // 6. Notifications
    let sentLast24h = 0;
    let failedLast24h = 0;
    try {
      const notifRows = sqlite.prepare("SELECT status, COUNT(*) as c FROM notification_logs WHERE created_at >= ? GROUP BY status").all(day24h) as Array<{ status: string; c: number }>;
      for (const row of notifRows) {
        if (row.status === 'SENT' || row.status === 'sent') sentLast24h += row.c;
        if (row.status === 'FAILED' || row.status === 'failed') failedLast24h += row.c;
      }
    } catch {
      // notification_logs table may not exist in test environments
    }

    // 7. System
    const uptimeSeconds = Math.floor((Date.now() - this.opts.startTime * 1000) / 1000);
    let dbSizeBytes = 0;
    if (this.opts.dataDir) {
      try {
        const dbPath = join(this.opts.dataDir, 'waiaas.db');
        dbSizeBytes = statSync(dbPath).size;
      } catch {
        // DB file might not exist at that path
      }
    }

    return {
      transactions: {
        total: txTotal,
        byStatus: txByStatus,
        byType: txByType,
        last24h: { count: tx24h.c, totalUsd: tx24h.usd },
        last7d: { count: tx7d.c, totalUsd: tx7d.usd },
      },
      sessions: {
        active: sessActive,
        total: sessTotal,
        revokedLast24h: sessRevoked24h,
      },
      wallets: {
        total: walletTotal,
        byStatus: walletByStatus,
        withOwner: walletWithOwner,
      },
      rpc: {
        totalCalls: rpcTotalCalls,
        totalErrors: rpcTotalErrors,
        avgLatencyMs: rpcAvgLatency,
        byNetwork,
      },
      autostop: {
        enabled: autoStopStatus?.enabled ?? false,
        triggeredTotal,
        rules: autoStopRules,
        lastTriggeredAt: lastTriggeredRow?.ts ?? null,
      },
      notifications: {
        sentLast24h,
        failedLast24h,
        channelStatus: {},
      },
      system: {
        uptimeSeconds,
        version: this.opts.version,
        schemaVersion: LATEST_SCHEMA_VERSION,
        dbSizeBytes,
        nodeVersion: process.version,
        platform: process.platform,
        timestamp: nowSec,
      },
    };
  }
}
