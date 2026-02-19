---
phase: quick-1-issue-090
plan: 1
subsystem: auth
tags: [argon2id, master-password, keystore, fail-fast, daemon-lifecycle]

# Dependency graph
requires:
  - phase: daemon-lifecycle
    provides: DaemonLifecycle._startInternal 6-step startup
provides:
  - "Step 2b master password validation (3-way: DB hash / keystore migration / first install)"
  - "6 unit tests for password validation scenarios"
affects: [daemon-startup, keystore, key_value_store]

# Tech tracking
tech-stack:
  added: []
  patterns: ["fail-fast password validation at daemon startup before keystore unlock"]

key-files:
  created:
    - packages/daemon/src/__tests__/master-password-validation.test.ts
  modified:
    - packages/daemon/src/lifecycle/daemon.ts

key-decisions:
  - "Step 2b placement (after DB init, before keystore unlock) ensures DB is available for hash lookup"
  - "Direct file read for keystore migration instead of LocalKeyStore instance (not created until Step 3)"
  - "onConflictDoNothing for hash insert to safely handle race/retry cases"

patterns-established:
  - "3-way password validation: DB hash -> keystore decrypt -> first install"

requirements-completed: [ISSUE-090]

# Metrics
duration: 3min
completed: 2026-02-19
---

# Quick Task 1: Issue 090 Fix Summary

**Fail-fast master password validation at daemon startup via 3-way check (DB Argon2id hash / keystore AES-GCM decrypt / first-install store)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T04:04:24Z
- **Completed:** 2026-02-19T04:07:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added Step 2b password validation between DB init and keystore unlock in daemon.ts
- Three validation paths: DB hash verification, keystore file migration, first-install hash storage
- Wrong password now causes immediate process.exit(1) instead of silent failure at signing time
- 6 unit tests covering all validation paths (first install, correct/wrong DB hash, correct/wrong migration, path switch after migration)

## Task Commits

Each task was committed atomically:

1. **Task 1: daemon.ts Step 2b master password validation** - `b91d2b3` (fix)
2. **Task 2: 6 unit tests for password validation** - `1866e1b` (test)

## Files Created/Modified
- `packages/daemon/src/lifecycle/daemon.ts` - Added Step 2b password validation block with 3-way branching, new imports (readdirSync, readFileSync, eq, keyValueStore, decrypt)
- `packages/daemon/src/__tests__/master-password-validation.test.ts` - 6 unit tests using real SQLite DB, Argon2id, and AES-256-GCM (no mocks)

## Decisions Made
- Placed validation at Step 2b (after DB init, before keystore unlock) because both DB and keystore directory are needed
- Used direct file read + crypto.decrypt instead of LocalKeyStore.decryptPrivateKey because LocalKeyStore is not instantiated until Step 3
- Argon2id params for Step 2b hash match Step 4c params (memoryCost: 19456, timeCost: 2, parallelism: 1) for consistency
- onConflictDoNothing on hash insert to handle edge cases safely

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict indexing error**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** `keystoreFiles[0]` typed as `string | undefined` with noUncheckedIndexedAccess
- **Fix:** Added non-null assertion `keystoreFiles[0]!` (safe since guarded by `length > 0` check)
- **Files modified:** packages/daemon/src/lifecycle/daemon.ts
- **Verification:** `pnpm turbo run typecheck --filter=@waiaas/daemon` passes
- **Committed in:** b91d2b3 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed test assertion for WAIaaSError message**
- **Found during:** Task 2 (test 5 failure)
- **Issue:** `toThrow('INVALID_MASTER_PASSWORD')` failed because error code is on WAIaaSError object, not in message string
- **Fix:** Changed assertion to `toThrow('Decryption failed')` matching actual error message
- **Files modified:** packages/daemon/src/__tests__/master-password-validation.test.ts
- **Verification:** All 6 tests pass
- **Committed in:** 1866e1b (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bug fix is complete and verified
- Issue 090 can be marked as RESOLVED in TRACKER.md

## Self-Check: PASSED

- [x] daemon.ts exists and contains Step 2b
- [x] master-password-validation.test.ts exists (357 lines, 6 tests)
- [x] Commit b91d2b3 exists (fix: daemon.ts)
- [x] Commit 1866e1b exists (test: 6 unit tests)
- [x] SUMMARY.md exists

---
*Quick Task: 1-issue-090*
*Completed: 2026-02-19*
