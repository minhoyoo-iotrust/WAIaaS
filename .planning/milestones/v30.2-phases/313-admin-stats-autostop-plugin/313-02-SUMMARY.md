---
phase: 313-admin-stats-autostop-plugin
plan: 02
subsystem: admin-stats
tags: [metrics, stats, api, admin]
dependency_graph:
  requires: [admin-stats.schema.ts from 313-01]
  provides: [IMetricsCounter, InMemoryCounter, AdminStatsService, GET /admin/stats]
  affects: [daemon lifecycle, admin routes, core package]
tech_stack:
  added: [IMetricsCounter, InMemoryCounter, AdminStatsService]
  patterns: [label-aware counters, TTL cache, fail-soft lifecycle wiring]
key_files:
  created:
    - packages/core/src/metrics/metrics-counter.ts
    - packages/daemon/src/infrastructure/metrics/in-memory-counter.ts
    - packages/daemon/src/services/admin-stats-service.ts
    - packages/daemon/src/__tests__/admin-stats.test.ts
  modified:
    - packages/core/src/index.ts
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/lifecycle/daemon.ts
decisions:
  - "IMetricsCounter in @waiaas/core for future extensibility (Prometheus, OpenTelemetry)"
  - "InMemoryCounter uses composite keys: name|label1=value1|label2=value2"
  - "AdminStatsService uses 1-minute TTL cache for performance"
  - "Duck-typed autoStopService dep in AdminStatsService to avoid circular imports"
  - "Daemon lifecycle creates InMemoryCounter/AdminStatsService in fail-soft step 4c-3b"
metrics:
  duration: ~8min
  completed: 2026-03-03
---

# Phase 313 Plan 02: IMetricsCounter + AdminStatsService + Stats API Summary

IMetricsCounter interface with label-aware InMemoryCounter, AdminStatsService aggregating 7 categories (DB + in-memory + service status), and GET /admin/stats endpoint wired through daemon lifecycle.

## Tasks Completed

### Task 1: IMetricsCounter + InMemoryCounter + AdminStatsService (TDD)
- **Commit:** d21ec8d1
- Created `IMetricsCounter` interface in `@waiaas/core` (increment, recordLatency, getCount, getAvgLatency, snapshot, reset)
- Created `InMemoryCounter` with Map-based storage, label-aware composite keys (`name|label=value`), and prefix-based querying
- Created `AdminStatsService` aggregating 7 categories: transactions, sessions, wallets, RPC, AutoStop, notifications, system
- DB aggregate queries for transactions/sessions/wallets/notifications/audit_log
- In-memory counters for RPC metrics (calls, errors, latency per network)
- AutoStop status from service getStatus() + registry getRules()
- System info from process.version, LATEST_SCHEMA_VERSION, statSync
- 1-minute TTL cache with invalidation support
- 13 tests: 8 InMemoryCounter + 5 AdminStatsService (including Zod schema validation)

### Task 2: GET /admin/stats REST endpoint + Daemon lifecycle wiring
- **Commit:** fd352605
- Added `adminStatsService` and `autoStopService` to `AdminRouteDeps` interface
- Added GET /admin/stats route with masterAuth protection
- Added `adminStatsService` and `autoStopService` to `CreateAppDeps` interface in server.ts
- Wired dependencies through CreateAppDeps -> adminRoutes chain
- Created InMemoryCounter + AdminStatsService in daemon lifecycle (fail-soft step 4c-3b, after AutoStop engine)
- Fixed unused import (IMetricsCounter) and strict null check (match[1] -> match?.[1])

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused import and strict null type errors**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** admin-stats-service.ts had unused `IMetricsCounter` import and `match[1]` not null-checked
- **Fix:** Removed unused import, changed `match` to `match?.[1]` for strict TypeScript
- **Files modified:** packages/daemon/src/services/admin-stats-service.ts
- **Commit:** fd352605

## Verification

- 13 admin-stats tests passing (InMemoryCounter + AdminStatsService)
- 49 autostop tests passing (no regressions)
- Daemon typecheck passing with zero errors
