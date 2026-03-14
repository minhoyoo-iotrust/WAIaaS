---
phase: 403-provider-unit-migration
plan: 02
subsystem: actions
tags: [kamino, lido, jito, smallest-unit, migrateAmount, backward-compatibility]

requires:
  - phase: 403-provider-unit-migration
    provides: migrateAmount() shared helper (plan 01)
provides:
  - Kamino provider migrated to smallest-unit input (4 actions)
  - Lido provider migrated to smallest-unit input (2 actions)
  - Jito provider migrated to smallest-unit input (2 actions)
  - All 14 non-CLOB providers now accept smallest-unit input consistently
affects: [404, 405, 406]

tech-stack:
  added: []
  patterns: [migrateAmount pattern applied to Solana providers with 9/6 decimals]

key-files:
  created:
    - packages/actions/src/providers/kamino/kamino-migration.test.ts
    - packages/actions/src/providers/lido-staking/lido-migration.test.ts
    - packages/actions/src/providers/jito-staking/jito-migration.test.ts
  modified:
    - packages/actions/src/providers/kamino/index.ts
    - packages/actions/src/providers/kamino/schemas.ts
    - packages/actions/src/providers/lido-staking/index.ts
    - packages/actions/src/providers/jito-staking/index.ts

key-decisions:
  - "Jito uses migrateAmount(amount, 9) replacing parseSolAmount -- parseSolAmount kept in jito-stake-pool.ts as export but unused by provider"
  - "Kamino uses 6 decimals for all actions (USDC-centric market)"

patterns-established:
  - "All non-CLOB providers now follow migrateAmount pattern for backward-compatible smallest-unit migration"

requirements-completed: [UNIT-01, UNIT-02, UNIT-03, UNIT-05, TEST-01, TEST-02, TEST-07]

duration: 3min
completed: 2026-03-14
---

# Phase 403 Plan 02: Kamino + Lido + Jito Migration Summary

**Kamino 4-action + Lido 2-action + Jito 2-action smallest-unit migration completing all 14 non-CLOB provider standardization**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T07:08:00Z
- **Completed:** 2026-03-14T07:11:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Migrated Kamino 4 actions (supply, borrow, repay, withdraw) from parseTokenAmount to migrateAmount with max keyword preservation
- Migrated Lido 2 actions (stake, unstake) from parseTokenAmount to migrateAmount
- Migrated Jito 2 actions (stake, unstake) from parseSolAmount to migrateAmount with minimum deposit check preserved
- Updated all 3 provider schemas with smallest-unit descriptions
- 14 new tests (6 Kamino + 4 Lido + 4 Jito), 28 total migration tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Kamino provider smallest-unit migration** - `0d522d2e` (feat)
2. **Task 2: Lido + Jito provider smallest-unit migration** - `dd26791a` (feat)

## Files Created/Modified
- `packages/actions/src/providers/kamino/index.ts` - Replaced parseTokenAmount with migrateAmount in 4 resolve methods
- `packages/actions/src/providers/kamino/schemas.ts` - Updated amount descriptions to smallest-unit format
- `packages/actions/src/providers/kamino/kamino-migration.test.ts` - 6 tests: integer passthrough, decimal convert, max keyword
- `packages/actions/src/providers/lido-staking/index.ts` - Replaced parseTokenAmount with migrateAmount, updated schemas
- `packages/actions/src/providers/lido-staking/lido-migration.test.ts` - 4 tests: stake/unstake with wei + legacy decimal
- `packages/actions/src/providers/jito-staking/index.ts` - Replaced parseSolAmount with migrateAmount(amount, 9), updated schemas
- `packages/actions/src/providers/jito-staking/jito-migration.test.ts` - 4 tests: lamports passthrough, legacy decimal, min deposit

## Decisions Made
- Jito uses migrateAmount(amount, 9) replacing parseSolAmount -- parseSolAmount remains exported from jito-stake-pool.ts but is no longer used by the provider
- Kamino uses 6 decimals for all actions (USDC-centric Solana market)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 14 non-CLOB providers now accept smallest-unit input consistently
- migrateAmount backward compatibility ensures zero breaking changes for existing callers
- Ready for Phase 404 (Typed MCP Schemas + Response Enrichment)

---
*Phase: 403-provider-unit-migration*
*Completed: 2026-03-14*
