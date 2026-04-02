---
phase: 468-signrequestbuilder-query-transition
plan: 01
subsystem: signing-sdk
tags: [signing, wallet-type, signing-enabled, push-relay, deprecated-setting]

requires:
  - phase: 467-db-migration-backend-service
    provides: DB v61 signing_enabled column + partial unique index + WalletAppService exclusive toggle

provides:
  - SignRequestBuilder wallet_type + signing_enabled=1 single-query pattern
  - preferred_wallet setting deprecated
  - 3 new integration tests for APPROVAL tier routing

affects: [469-admin-ui-radio-group]

tech-stack:
  added: []
  patterns: [signing_enabled DB-first query instead of settings-based wallet name lookup]

key-files:
  created: []
  modified:
    - packages/daemon/src/services/signing-sdk/sign-request-builder.ts
    - packages/daemon/src/__tests__/sign-request-builder.test.ts
    - packages/daemon/src/__tests__/signing-sdk-e2e.test.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts

key-decisions:
  - "Consolidated 3 name-based queries into 1 wallet_type + signing_enabled=1 query"
  - "preferred_wallet setting marked deprecated but kept in setting-keys for backward compatibility"
  - "subscription_token used as requestTopic when available (from same query result)"

patterns-established:
  - "signing_enabled=1 DB query pattern: single query returns name, wallet_type, push_relay_url, subscription_token"

requirements-completed: [SIG-01, SIG-02, TST-03]

duration: 3min
completed: 2026-04-02
---

# Phase 468 Plan 01: SignRequestBuilder Query Transition Summary

**SignRequestBuilder transitioned from name-based 3-query + preferred_wallet setting to wallet_type + signing_enabled=1 single DB query**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-02T12:09:53Z
- **Completed:** 2026-04-02T12:13:44Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- SignRequestBuilder uses wallet_type + signing_enabled=1 for signing app lookup (3 queries consolidated to 1)
- preferred_wallet setting completely removed from SignRequestBuilder logic, deprecated in setting-keys
- 3 new integration tests verify APPROVAL tier routing, signing_enabled=0 blocking, and preferred_wallet ignored

## Task Commits

Each task was committed atomically:

1. **Task 1: SignRequestBuilder wallet_type query + preferred_wallet deprecated** - `35d15896` (feat)
2. **Task 2: APPROVAL tier TX integration tests** - `2a9805ea` (test)

## Files Created/Modified
- `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` - Replaced preferred_wallet + 3 name-based queries with wallet_type + signing_enabled=1 single query
- `packages/daemon/src/__tests__/sign-request-builder.test.ts` - Fixed mock for explicit undefined, updated requestTopic expectation
- `packages/daemon/src/__tests__/signing-sdk-e2e.test.ts` - Added sqlite mock, 3 new integration tests for signing_enabled routing
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - Marked preferred_wallet description as [DEPRECATED]

## Decisions Made
- Consolidated 3 separate `WHERE name = ?` queries (wallet lookup, push_relay_url, subscription_token) into 1 `WHERE wallet_type = ? AND signing_enabled = 1` query
- preferred_wallet setting kept in setting-keys for backward compatibility but marked deprecated; never read by SignRequestBuilder
- subscription_token from the same signing_enabled query used as requestTopic (no separate query needed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test mock for explicit undefined signingApp**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** `createMockSqlite({ signingApp: undefined })` used `opts.signingApp !== undefined` which evaluated to false for explicit undefined, falling through to defaultApp
- **Fix:** Changed to `'signingApp' in opts` to properly detect when signingApp key is explicitly passed
- **Files modified:** packages/daemon/src/__tests__/sign-request-builder.test.ts
- **Verification:** Tests 5 and 12c now correctly throw WALLET_NOT_REGISTERED
- **Committed in:** 35d15896 (Task 1 commit)

**2. [Rule 1 - Bug] Updated requestTopic test expectation**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Test 1 expected requestTopic='dcent' but new logic returns subscription_token='tok-123' from the same signing_enabled query
- **Fix:** Updated expectation from 'dcent' to 'tok-123'
- **Files modified:** packages/daemon/src/__tests__/sign-request-builder.test.ts
- **Verification:** All 15 unit tests pass
- **Committed in:** 35d15896 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for test correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SignRequestBuilder now uses wallet_type + signing_enabled=1 for all signing app lookups
- Admin UI (Phase 469) can proceed with radio group UI for signing_enabled toggle
- All 53 signing-sdk related tests pass (15 unit + 9 e2e + 29 approval-channel-router)

---
*Phase: 468-signrequestbuilder-query-transition*
*Completed: 2026-04-02*
