---
phase: 341-interface-integration
plan: 01
subsystem: ui
tags: [preact, admin-ui, smart-account, lite-mode, erc-4337]

requires:
  - phase: 340-userop-sign-api
    provides: UserOp Build/Sign API endpoints
provides:
  - Provider None (Lite mode) option in create form
  - Lite/Full mode badges in wallet detail and list
  - Type column (EOA/Smart Full/Smart Lite) in wallet list
affects: [admin-ui, smart-account]

tech-stack:
  added: []
  patterns: [lite-full-mode-badge-pattern]

key-files:
  created: []
  modified:
    - packages/admin/src/pages/wallets.tsx
    - packages/admin/src/__tests__/wallets-provider.test.tsx

key-decisions:
  - "D13: Default provider is None (Lite mode) for new Smart Account wallets"
  - "D14: Mode badge uses success/warning variants (Full=green, Lite=yellow)"

patterns-established:
  - "Lite/Full mode display: provider presence determines mode"

requirements-completed: [ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04]

duration: 5min
completed: 2026-03-06
---

# Phase 341 Plan 01: Admin UI Lite/Full Mode Summary

**Smart Account Lite/Full mode UI with None provider option, mode badges in detail/list, and 7 new tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T09:34:02Z
- **Completed:** 2026-03-06T09:39:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added None (Lite mode) as first option in Provider dropdown for Smart Account creation
- API Key/URL fields hidden when None selected; create body sends only accountType=smart
- Mode row (Lite/Full badge) in wallet detail Overview with UserOp guidance text
- Type column in wallet list showing EOA/Smart (Full)/Smart (Lite) badges
- 7 new Lite/Full mode tests + 3 existing tests fixed for new default

## Task Commits

Each task was committed atomically:

1. **Task 1: Provider None option + Lite/Full badges** - `08b3798c` (feat)
2. **Task 2: Lite/Full mode Admin UI tests** - `9eed372e` (test)

## Files Created/Modified
- `packages/admin/src/pages/wallets.tsx` - None option, mode badges, Type column
- `packages/admin/src/__tests__/wallets-provider.test.tsx` - 7 new tests, 3 existing fixed

## Decisions Made
- D13: Default provider changed from 'pimlico' to 'none' (Lite mode) for new Smart Account wallets
- D14: Mode badge uses success variant for Full, warning variant for Lite

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 3 existing tests broken by default provider change**
- **Found during:** Task 2 (test writing)
- **Issue:** Existing tests assumed default provider was 'pimlico', now 'none'
- **Fix:** Updated tests to explicitly select pimlico before checking API Key field
- **Files modified:** packages/admin/src/__tests__/wallets-provider.test.tsx
- **Verification:** All 15 wallets-provider tests pass
- **Committed in:** 9eed372e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary test fix for new default behavior. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin UI complete, ready for MCP/SDK/Skill file integration (341-02)

---
*Phase: 341-interface-integration*
*Completed: 2026-03-06*
