---
phase: 449-foundation-core-db-push-relay
plan: 02
subsystem: daemon-db
tags: [migration, push-relay, database]
dependency-graph:
  requires: [449-01]
  provides: [wallet_apps.push_relay_url, schema-v60]
  affects: [daemon/wallet-apps-api, admin/wallet-apps]
tech-stack:
  added: []
  patterns: [v60-migration]
key-files:
  created:
    - packages/daemon/src/__tests__/migration-v60.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/migrations/v51-v59.ts
    - packages/daemon/src/infrastructure/database/schema-ddl.ts
    - packages/daemon/src/infrastructure/database/schema.ts
decisions:
  - Keep sign_topic/notify_topic columns in DDL (deprecation, not column drop) to avoid 12-step table recreation
  - v60 migration file added to existing v51-v59.ts to minimize import disruption
metrics:
  duration: ~3min
  completed: 2026-03-18
---

# Phase 449 Plan 02: DB v60 Migration Summary

Add push_relay_url column, clear ntfy topics, rename sdk_ntfy to sdk_push in wallets.

## One-liner

DB v60 migration: wallet_apps.push_relay_url + dcent auto-URL + sign_topic/notify_topic NULL + sdk_ntfy->sdk_push

## What was done

### Task 1: v60 Migration + DDL + Drizzle (TDD)
- Added v60 migration to migrations array:
  1. Add `push_relay_url TEXT` column to wallet_apps
  2. Auto-set dcent wallet_type to 'https://waiaas-push.dcentwallet.com'
  3. Clear sign_topic and notify_topic to NULL
  4. Rename 'sdk_ntfy' to 'sdk_push' in wallets.owner_approval_method
- Updated LATEST_SCHEMA_VERSION to 60
- Updated wallet_apps DDL to include push_relay_url
- Added pushRelayUrl to Drizzle walletApps schema
- Created 6 migration tests (column add, dcent URL, topic clear, rename, idempotency, no-overwrite)
- Commit: `5d081e63`

## Verification

- 6 migration tests pass
- LATEST_SCHEMA_VERSION = 60 confirmed
- push_relay_url in DDL and Drizzle schema confirmed

## Deviations from Plan

None -- plan executed exactly as written.
