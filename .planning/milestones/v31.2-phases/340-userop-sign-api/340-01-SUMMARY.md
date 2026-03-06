---
phase: 340-userop-sign-api
plan: 01
subsystem: api
tags: [erc-4337, userop, sign, smart-account, viem, audit, notification]

requires:
  - phase: 339-userop-build-api
    provides: build endpoint, userop_builds table, SmartAccountService
provides:
  - POST /v1/wallets/:id/userop/sign endpoint
  - USEROP_BUILD + USEROP_SIGNED audit event types
  - Build-time audit log + notifications
  - callData/sender validation, policy evaluation
affects: [341-interface-integration, admin-ui, mcp, sdk]

tech-stack:
  added: []
  patterns: [userop-sign-pipeline, build-record-validation]

key-files:
  created:
    - packages/daemon/src/__tests__/userop-sign-api.test.ts
  modified:
    - packages/core/src/schemas/audit.schema.ts
    - packages/core/src/__tests__/schemas/audit.schema.test.ts
    - packages/daemon/src/api/routes/userop.ts
    - packages/daemon/src/api/server.ts

key-decisions:
  - "D10: Policy evaluation uses CONTRACT_CALL param with sender as target (self-call) for INSTANT tier check"
  - "D11: Network resolution for sign uses RPC config key parsing as build record does not store network"

patterns-established:
  - "Build-then-sign pattern: build creates DB record with callData/sender, sign validates against it"
  - "USEROP_BUILD/USEROP_SIGNED audit events parallel existing TX_SUBMITTED pattern"

requirements-completed: [SIGN-01, SIGN-02, SIGN-03, SIGN-04, SIGN-05, SIGN-06, SIGN-07, SIGN-08, SIGN-09, SIGN-10, NTFY-01, NTFY-02, NTFY-03, NTFY-04]

duration: 5min
completed: 2026-03-06
---

# Phase 340 Plan 01: UserOp Sign API Summary

**POST /v1/wallets/:id/userop/sign endpoint with callData verification, 5 error codes, policy evaluation, audit logging, and notifications**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T09:18:28Z
- **Completed:** 2026-03-06T09:24:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added USEROP_BUILD + USEROP_SIGNED audit event types (21 -> 23 total)
- Implemented sign endpoint with full callData/sender/build-record validation
- 5 error scenarios: BUILD_NOT_FOUND, EXPIRED_BUILD, BUILD_ALREADY_USED, CALLDATA_MISMATCH, SENDER_MISMATCH
- Policy evaluation rejects non-INSTANT tiers (DELAY/APPROVAL)
- Audit logs and notifications on both build and sign operations
- 32 tests total (19 sign + 13 audit schema)

## Task Commits

1. **Task 1: Add USEROP_BUILD + USEROP_SIGNED audit event types** - `657fea60` (test)
2. **Task 2: POST /v1/wallets/:id/userop/sign endpoint** - `0f52247a` (feat)

## Files Created/Modified
- `packages/core/src/schemas/audit.schema.ts` - Added 2 new audit event types
- `packages/core/src/__tests__/schemas/audit.schema.test.ts` - Updated count to 23, added parse tests
- `packages/daemon/src/api/routes/userop.ts` - Added sign route, audit/notification to build route
- `packages/daemon/src/__tests__/userop-sign-api.test.ts` - 19 tests for sign endpoint
- `packages/daemon/src/api/server.ts` - Wire policyEngine/notificationService/eventBus to userOpRoutes

## Decisions Made
- D10: Policy evaluation uses CONTRACT_CALL with sender as target (evaluating the SmartAccount self-call) for INSTANT tier check
- D11: Network resolution for sign reads from RPC config keys since build record doesn't store network directly

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sign endpoint fully functional, ready for connect-info integration (Plan 02)
- All audit/notification infrastructure in place

---
*Phase: 340-userop-sign-api*
*Completed: 2026-03-06*
