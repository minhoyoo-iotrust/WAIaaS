---
phase: 210-session-model-restructure
plan: 03
subsystem: api
tags: [hono, session, multi-wallet, cascade, is_default, invariant, drizzle, junction-table]

# Dependency graph
requires:
  - phase: 210-02
    provides: session_wallets CRUD endpoints, session-auth dual context, session_wallets insert in wallets.ts
provides:
  - TERMINATE handler cascade defense (auto-promote + auto-revoke)
  - is_default invariant guarantee across all wallet deletion scenarios
  - 7 cascade edge case tests covering multi-session, sequential deletion, promotion order
affects: [211-01, 211-02, 211-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [cascade-defense-before-state-change, per-session-loop-with-promote-or-revoke]

key-files:
  created:
    - packages/daemon/src/__tests__/session-wallet-cascade.test.ts
  modified:
    - packages/daemon/src/api/routes/wallets.ts

key-decisions:
  - "Cascade defense runs BEFORE wallet status change (session_wallets processing -> cancel txs -> TERMINATED)"
  - "Auto-promote selects earliest-linked wallet (created_at ASC) as new default"
  - "Last wallet removal auto-revokes session (sets revokedAt, then deletes junction rows)"
  - "Per-session loop handles multi-session scenarios independently"

patterns-established:
  - "Cascade defense pattern: query affected rows, per-entity decision (promote/revoke), bulk delete, then state change"

requirements-completed: [SESS-10]

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 210 Plan 03: Cascade Defense Summary

**TERMINATE handler cascade defense with auto-promote (created_at ASC) and auto-revoke, 7 edge case tests verifying is_default invariant**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-20T16:35:36Z
- **Completed:** 2026-02-20T16:39:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- TERMINATE handler reordered: cascade defense first, then cancel pending txs, then set TERMINATED
- Auto-promote selects earliest-linked wallet (created_at ASC) when default wallet is terminated
- Auto-revoke session when its last wallet is terminated
- 7 comprehensive cascade defense tests covering all edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: TERMINATE handler cascade defense logic** - `9608028` (feat)
2. **Task 2: cascade defense + is_default invariant edge case tests** - `287539f` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/wallets.ts` - Cascade defense logic in DELETE handler (query linked sessions, per-session promote/revoke, bulk delete junction rows)
- `packages/daemon/src/__tests__/session-wallet-cascade.test.ts` - 7 test scenarios: auto-promote, no-change, auto-revoke, multi-session, sequential deletions, promotion order, full API integration

## Decisions Made
- Cascade defense runs BEFORE wallet status change to ensure junction table data is intact during processing
- Auto-promote uses created_at ASC ordering (earliest-linked wallet promoted first)
- Per-session loop processes each session independently (one may promote, another may revoke)
- Last wallet removal triggers session revoke by setting revokedAt (not deleting session)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All cascade defense scenarios verified with tests
- is_default invariant guaranteed across all wallet deletion scenarios
- Phase 211 can proceed with API layer wallet selection migration
- Session model restructure (Phase 210) is complete

## Self-Check: PASSED

- File `packages/daemon/src/api/routes/wallets.ts` verified present
- File `packages/daemon/src/__tests__/session-wallet-cascade.test.ts` verified present
- Commit 9608028 (Task 1) verified in git log
- Commit 287539f (Task 2) verified in git log
- Typecheck passes
- 7/7 cascade defense tests pass
- 17/17 session-lifecycle E2E tests pass (no regression)

---
*Phase: 210-session-model-restructure*
*Completed: 2026-02-21*
