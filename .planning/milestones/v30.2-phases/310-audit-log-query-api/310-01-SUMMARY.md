---
phase: 310-audit-log-query-api
plan: 01
subsystem: database
tags: [zod, audit-log, sqlite, migration, best-effort]

requires:
  - phase: 309-transaction-dry-run
    provides: DB schema v35, pipeline context with sqlite

provides:
  - AuditEventTypeSchema (20 events) + AuditSeveritySchema (3 levels) Zod SSoT
  - insertAuditLog best-effort helper function
  - AuditLogQuerySchema, AuditLogItemSchema, AuditLogResponseSchema for API
  - DB migration v36 (idx_audit_log_tx_id index)
  - 20 audit events inserted via insertAuditLog across 8 service files

affects: [310-02-audit-logs-api, 311-encrypted-backup, 313-admin-stats]

tech-stack:
  added: []
  patterns: [insertAuditLog best-effort helper pattern]

key-files:
  created:
    - packages/core/src/schemas/audit.schema.ts
    - packages/daemon/src/infrastructure/database/audit-helper.ts
    - packages/core/src/__tests__/schemas/audit.schema.test.ts
    - packages/daemon/src/__tests__/audit-helper.test.ts
  modified:
    - packages/core/src/schemas/index.ts
    - packages/core/src/index.ts
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/services/kill-switch-service.ts
    - packages/daemon/src/services/autostop-service.ts
    - packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
    - packages/daemon/src/api/middleware/master-auth.ts
    - packages/daemon/src/api/routes/wallets.ts
    - packages/daemon/src/api/routes/sessions.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/api/server.ts

key-decisions:
  - "notification-service.ts keeps Drizzle insert for NOTIFICATION_TOTAL_FAILURE (no raw sqlite access, event string matches Zod enum)"
  - "sqlite passed as optional dep to master-auth and session routes for audit logging"
  - "TX_FAILED audit logged at key failure points (simulation, permanent error, on-chain revert) not every retry"

patterns-established:
  - "insertAuditLog best-effort pattern: import from audit-helper.js, pass sqlite + AuditEntry, never blocks main logic"

requirements-completed: [AUDIT-02, AUDIT-03]

duration: 12min
completed: 2026-03-03
---

# Phase 310 Plan 01: Audit Event Type Expansion + insertAuditLog Helper Summary

**20 audit event types via Zod SSoT with best-effort insertAuditLog helper, DB migration v36 (idx_audit_log_tx_id), and unified audit logging across 8 service files**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-03T11:14:02Z
- **Completed:** 2026-03-03T11:26:00Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- 20 audit event types defined in AuditEventTypeSchema Zod SSoT (9 existing + 11 new)
- insertAuditLog best-effort helper that never blocks main logic
- DB migration v36 adds idx_audit_log_tx_id index for tx_id filter queries
- All 9 existing raw SQL INSERT calls unified to use insertAuditLog helper
- 11 new audit events inserted at appropriate service points
- 18 tests passing (11 schema + 7 helper/migration)

## Task Commits

1. **Task 1: AuditEventType Zod SSoT + insertAuditLog helper + DB migration v36** - `dca30bc9` (feat)
2. **Task 2: 11 new events + unify existing 9 raw SQL to insertAuditLog** - `7d91d856` (feat)

## Files Created/Modified

- `packages/core/src/schemas/audit.schema.ts` - 20 event types, 3 severities, query/response/item Zod schemas
- `packages/daemon/src/infrastructure/database/audit-helper.ts` - insertAuditLog best-effort helper
- `packages/daemon/src/infrastructure/database/migrate.ts` - Migration v36, LATEST_SCHEMA_VERSION=36
- `packages/daemon/src/infrastructure/database/schema.ts` - idx_audit_log_tx_id Drizzle index
- `packages/daemon/src/services/kill-switch-service.ts` - Replaced 2 raw SQL + added KILL_SWITCH_RECOVERED
- `packages/daemon/src/services/autostop-service.ts` - Replaced 1 raw SQL
- `packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts` - Replaced 4 raw SQL
- `packages/daemon/src/api/middleware/master-auth.ts` - Added MASTER_AUTH_FAILED with sqlite dep
- `packages/daemon/src/api/routes/wallets.ts` - Added WALLET_CREATED, WALLET_SUSPENDED, OWNER_REGISTERED
- `packages/daemon/src/api/routes/sessions.ts` - Added SESSION_CREATED, SESSION_REVOKED with sqlite dep
- `packages/daemon/src/pipeline/stages.ts` - Added TX_SUBMITTED, TX_CONFIRMED, TX_FAILED, POLICY_DENIED; refactored UNLISTED_TOKEN_TRANSFER

## Decisions Made

- notification-service.ts keeps Drizzle insert for NOTIFICATION_TOTAL_FAILURE since it lacks raw sqlite access. Event string already matches Zod enum.
- sqlite passed as optional dep to master-auth.ts and sessions.ts (guarded with `if (deps.sqlite)`)
- TX_FAILED audit logged at key failure points (simulation, permanent error, on-chain revert), not at every transient retry attempt

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused auditLog import from stages.ts**
- **Found during:** Task 2 (typecheck)
- **Issue:** After refactoring UNLISTED_TOKEN_TRANSFER from Drizzle to insertAuditLog, the `auditLog` import became unused, causing TS6133
- **Fix:** Removed `auditLog` from the import statement
- **Files modified:** packages/daemon/src/pipeline/stages.ts
- **Verification:** typecheck passes
- **Committed in:** 7d91d856 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor import cleanup, no scope change.

## Issues Encountered

- Pre-existing lint error in simulate-api.test.ts (DryRunSimulationResult unused import from Phase 309). Logged to deferred-items.md, not in scope for Phase 310.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 20 audit event types defined and active
- insertAuditLog helper ready for use in any service
- AuditLogQuerySchema, AuditLogItemSchema, AuditLogResponseSchema ready for Plan 310-02 (GET /v1/audit-logs API)
- DB migration v36 provides idx_audit_log_tx_id for efficient tx_id filtering

---
*Phase: 310-audit-log-query-api*
*Completed: 2026-03-03*
