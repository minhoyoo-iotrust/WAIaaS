---
phase: 330-ui-restructure-feature-gate
plan: 01
subsystem: daemon/settings
tags: [settings, migration, defaults, feature-gate]
dependency_graph:
  requires: []
  provides: [all-providers-default-true, db-v42-migration]
  affects: [packages/daemon/src/infrastructure/settings/setting-keys.ts, packages/daemon/src/infrastructure/database/migrate.ts]
tech_stack:
  added: []
  patterns: [INSERT-OR-IGNORE-for-safe-seeding]
key_files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/__tests__/settings-service.test.ts
    - packages/daemon/src/__tests__/migration-runner.test.ts
    - packages/daemon/src/__tests__/migration-chain.test.ts
    - packages/daemon/src/__tests__/migration-v34-v35.test.ts
    - packages/daemon/src/__tests__/migration-v33.test.ts
    - packages/daemon/src/__tests__/migration-v14.test.ts
    - packages/daemon/src/__tests__/migration-v6-v8.test.ts
    - packages/daemon/src/__tests__/signing-sdk-migration.test.ts
    - packages/daemon/src/__tests__/settings-schema-migration.test.ts
    - packages/daemon/src/__tests__/admin-stats.test.ts
    - packages/daemon/src/__tests__/audit-helper.test.ts
    - packages/daemon/src/__tests__/schema-compatibility.test.ts
decisions:
  - INSERT OR IGNORE chosen over UPSERT to preserve existing operator settings
  - v42 migration seeds all 10 keys even though 6 were already true (idempotent)
metrics:
  duration: 25m
  completed: 2026-03-05
---

# Phase 330 Plan 01: Backend Provider Defaults + DB v42 Migration Summary

All 10 action provider _enabled settings now default to true with INSERT OR IGNORE seeding via DB v42 migration.

## What Changed

### Task 1: Default Values + Migration
- Changed `defaultValue` from `'false'` to `'true'` for 4 provider settings:
  - `actions.kamino_enabled`
  - `actions.pendle_yield_enabled`
  - `actions.drift_enabled`
  - `actions.erc8004_agent_enabled`
- Created DB v42 migration using `INSERT OR IGNORE INTO settings` for all 10 `_enabled` keys
- `LATEST_SCHEMA_VERSION` bumped from 41 to 42
- Commit: `cb6c89fa`

### Task 2: Test Updates
- Updated LATEST_SCHEMA_VERSION assertions from 41 to 42 across 12 test files
- Updated migration-runner test fixture versions from 42+ to 43+ (avoid conflict with real v42)
- Changed `erc8004_agent_enabled` default assertion from `'false'` to `'true'`
- Added v42 migration test: verifies INSERT OR IGNORE preserves manually-set `'false'` values while seeding new keys as `'true'`
- All 4,051 daemon tests pass, 548 actions tests pass
- Commit: `d87c6f39`

## Deviations from Plan

None - plan executed exactly as written, except for correcting the settings table column names (plan had `source` column, actual schema uses `encrypted` + `category`).

## Decisions Made

1. **INSERT OR IGNORE vs UPSERT**: INSERT OR IGNORE chosen because it safely skips existing keys, preserving any operator-customized values. UPSERT would overwrite them.
2. **Seed all 10 keys**: Even though 6 were already `true`, the migration seeds all 10 for consistency and to handle edge cases where a fresh DB might not have some keys in the settings table yet.
