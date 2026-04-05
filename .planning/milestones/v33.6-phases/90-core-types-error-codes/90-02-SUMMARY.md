---
phase: 90-core-types-error-codes
plan: 02
subsystem: core
tags: [i18n, wallet-terminology, notifications, localization, tests]

# Dependency graph
requires:
  - phase: 90-core-types-error-codes
    plan: 01
    provides: "Renamed schemas/enums/error-codes to wallet terminology, initial i18n key renames"
provides:
  - "i18n en/ko notification templates with {walletId}/{walletCount} placeholders"
  - "i18n notification text says Wallet/지갑 (not Agent/에이전트)"
  - "NO_OWNER error message text updated for wallet context"
  - "All 137 core tests passing with wallet terminology"
affects: [91-daemon-routes, 92-sdk-mcp-cli, 93-admin-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: ["wallet terminology consistent across all @waiaas/core i18n and tests"]

key-files:
  created: []
  modified:
    - "packages/core/src/i18n/en.ts"
    - "packages/core/src/i18n/ko.ts"

key-decisions:
  - "Korean particle: 지갑 {walletId}이 (consonant ending) instead of 에이전트 {agentId}가 (vowel ending)"
  - "Error code count comment corrected from 67 to 68 in both i18n files"
  - "Task 2 (test updates) verified as already complete from Plan 90-01 -- no duplicate commit needed"

patterns-established:
  - "wallet terminology: all @waiaas/core i18n strings use wallet/지갑 (zero agent/에이전트 remaining)"
  - "notification placeholders: {walletId} and {walletCount} (zero {agentId}/{agentCount})"

# Metrics
duration: 2min
completed: 2026-02-13
---

# Phase 90 Plan 02: i18n + Tests Wallet Terminology Summary

**Updated all i18n notification templates (en/ko) to wallet terminology with {walletId}/{walletCount} placeholders, verified 137/137 core tests passing**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-12T15:54:41Z
- **Completed:** 2026-02-12T15:57:24Z
- **Tasks:** 2 (1 executed, 1 verified as already complete)
- **Files modified:** 2

## Accomplishments
- Replaced all {agentId} with {walletId} in en/ko notification templates (10 occurrences each)
- Replaced {agentCount} with {walletCount} in DAILY_SUMMARY (both locales)
- Replaced "Agent"/"에이전트" with "Wallet"/"지갑" in all notification body/title text
- Updated NO_OWNER error message text in both locales (agent -> wallet/지갑)
- Fixed error code count comments (67 -> 68) in both i18n files
- Verified all 5 core test files already updated by Plan 90-01, all 137 tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Update i18n en/ko templates for wallet terminology** - `3741a8d` (feat)
2. **Task 2: Update all core test files + run tests** - Already complete from Plan 90-01 (commits 54661c7, 4d45b6b)

## Files Created/Modified
- `packages/core/src/i18n/en.ts` - Notification templates updated: {walletId}/{walletCount}, "Wallet" text, NO_OWNER message, error count comment
- `packages/core/src/i18n/ko.ts` - Notification templates updated: {walletId}/{walletCount}, "지갑" text, NO_OWNER message, error count comment

## Decisions Made
- Korean particle correction: "지갑 {walletId}이" (consonant ending ㅂ requires particle 이) vs. previous "에이전트 {agentId}가" (vowel ending requires 가)
- Error code count comment fixed from 67 to 68 -- matches actual ERROR_CODES keys and test assertions
- Task 2 (test file updates) was already completed as a deviation in Plan 90-01 -- verified rather than redone

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed error code count comments (67 -> 68)**
- **Found during:** Task 1
- **Issue:** en.ts Messages interface comment and errors section comment both said "67 error codes" but actual count is 68 (matching ERROR_CODES and test assertions)
- **Fix:** Changed comments to "68 error codes" in both en.ts and ko.ts
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Verification:** Count matches ERROR_CODES (68 keys), i18n.test.ts assertion (68), errors.test.ts assertion (68)
- **Committed in:** 3741a8d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in comment)
**Impact on plan:** Minor comment accuracy fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 90 complete: all @waiaas/core exports use wallet terminology
- Zero agent/Agent/에이전트/{agentId}/{agentCount} references in core/src/
- 137/137 core tests passing, tsc --noEmit clean
- Ready for Phase 91 (daemon routes) to update downstream packages

## Self-Check: PASSED

All modified files exist, commit hash 3741a8d verified, 137/137 tests pass.

---
*Phase: 90-core-types-error-codes*
*Completed: 2026-02-13*
