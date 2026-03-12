---
phase: 389-tracking-policy-extension
plan: 01
title: "AsyncTrackingResult 9-state + DB v57 + AsyncPollingService + Notification Events"
subsystem: actions/daemon/core
tags: [tracking, async-polling, migration, notification]
dependency_graph:
  requires: [386-01, 386-02]
  provides: [AsyncTrackingResult-9-state, DB-v57, ExternalAction-notifications]
  affects: [async-polling-service, notification-channels]
tech_stack:
  added: []
  patterns: [9-state-tracking, isTerminalState-utility]
key_files:
  created:
    - packages/actions/src/__tests__/async-tracking-state.test.ts
    - packages/daemon/src/__tests__/migration-v57.test.ts
  modified:
    - packages/actions/src/common/async-status-tracker.ts
    - packages/actions/src/index.ts
    - packages/core/src/interfaces/action-provider.types.ts
    - packages/core/src/interfaces/index.ts
    - packages/core/src/index.ts
    - packages/core/src/enums/notification.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/core/src/schemas/signing-protocol.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/services/async-polling-service.ts
    - packages/daemon/src/__tests__/async-polling-service.test.ts
decisions:
  - "ActionProviderTrackingResult inline type in core to avoid circular dependency (core -> actions)"
  - "BRIDGE_STATUS_VALUES expanded to 11 (not breaking: superset of original 6)"
  - "AsyncTrackingStateEnum separate from BridgeStatusEnum (9 vs 11 values)"
  - "trackerName preferred over tracker in resolveTrackerName for external action trackers"
metrics:
  duration: "11min"
  completed: "2026-03-12"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 29
---

# Phase 389 Plan 01: AsyncTrackingResult 9-state + DB v57 + AsyncPollingService + Notification Events Summary

AsyncTrackingResult 9-state extension with DB v57 composite index, AsyncPollingService 5-state processing, and 6 notification events for external action tracking.

## What Changed

### Task 1: AsyncTrackingResult 9-state + IActionProvider Methods
- Extended `BRIDGE_STATUS_VALUES` from 6 to 11 values (added PARTIALLY_FILLED/FILLED/CANCELED/SETTLED/EXPIRED)
- Added `AsyncTrackingStateEnum` 9-value Zod enum (excludes BRIDGE_MONITORING/REFUNDED which are bridge-specific)
- Added `isTerminalState()` and `isContinuePolling()` utility functions
- Added optional `checkStatus()` and `execute()` methods to IActionProvider interface
- Created `ActionProviderTrackingResult` inline type in core to avoid circular dependency

### Task 2: DB v57 + AsyncPollingService + Notifications
- Added v57 migration: composite index `idx_transactions_action_kind_bridge_status`
- Updated `check_bridge_status` CHECK constraint in DDL and Drizzle schema to accept 11 values
- Extended `AsyncPollingService.pollAll()` to include PARTIALLY_FILLED in polling targets
- Added processResult handling for 5 new states (PARTIALLY_FILLED/FILLED/SETTLED/CANCELED/EXPIRED)
- PARTIALLY_FILLED: updates bridge_status + emits notification + continues polling
- FILLED/SETTLED: updates bridge_status + releases reservation + emits notification
- CANCELED/EXPIRED: updates bridge_status + releases reservation + emits notification
- Registered 6 notification events in core + i18n translations (en/ko) + EVENT_CATEGORY_MAP
- Updated `resolveTrackerName()` to prefer `trackerName` over `tracker` in metadata

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 51512e3a | AsyncTrackingResult 9-state + IActionProvider optional methods |
| 2 | 9913f62c | DB v57 + AsyncPollingService 5-state + notification events 6 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DDL check_bridge_status not updated**
- **Found during:** Task 2
- **Issue:** getCreateTableStatements() in migrate.ts had 3 occurrences of old CHECK constraint that didn't include new status values
- **Fix:** Updated all DDL CHECK constraints to include 11 values
- **Files modified:** packages/daemon/src/infrastructure/database/migrate.ts

**2. [Rule 3 - Blocking] Circular dependency prevention**
- **Found during:** Task 1
- **Issue:** Importing AsyncTrackingResult from @waiaas/actions into @waiaas/core would create circular dependency
- **Fix:** Created ActionProviderTrackingResult inline type in core that mirrors the actions type
- **Files modified:** packages/core/src/interfaces/action-provider.types.ts

## Verification Results

- 16 async-tracking-state tests: PASS
- 4 migration-v57 tests: PASS
- 37 async-polling-service tests: PASS (30 existing + 7 new)
- Notification event count: 66 (60 existing + 6 new)
- LATEST_SCHEMA_VERSION: 57
