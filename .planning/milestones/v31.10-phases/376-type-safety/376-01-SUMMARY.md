---
phase: 376-type-safety
plan: 01
subsystem: api
tags: [drizzle, typescript, type-safety, wallets]

requires: []
provides:
  - "Type-safe SmartAccount field access in wallets.ts (no as any)"
affects: []

tech-stack:
  added: []
  patterns: ["AccountType cast for Drizzle text->union narrowing"]

key-files:
  created: []
  modified:
    - packages/daemon/src/api/routes/wallets.ts

key-decisions:
  - "Use (wallet.accountType ?? 'eoa') as AccountType instead of as any for Drizzle text->union type narrowing"

patterns-established:
  - "AccountType cast pattern: Drizzle text() columns storing union values use explicit AccountType cast"

requirements-completed: [TYPE-01]

duration: 6min
completed: 2026-03-11
---

# Phase 376 Plan 01: WalletRow SmartAccount as any removal Summary

**Removed 24 `as any` casts from wallets.ts, replaced with direct Drizzle field access and AccountType narrowing**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-11T08:25:28Z
- **Completed:** 2026-03-11T08:31:28Z
- **Tasks:** 2 (1 refactor + 1 verification)
- **Files modified:** 1

## Accomplishments
- Removed all 24 `as any` casts from wallets.ts (listWalletsRoute, walletDetailRoute, createWalletRoute, updateWalletRoute, providerRoute)
- Direct Drizzle field access for accountType, signerKey, deployed, factoryAddress, aaProvider, aaPaymasterUrl
- OpenAPIHono `c.req.valid('json')` fields accessed directly (no superRefine type loss issue)
- AccountType union narrowing via explicit cast (type-safe vs as any)

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Remove as any casts + verify tests** - `38934189` (refactor)

## Files Created/Modified
- `packages/daemon/src/api/routes/wallets.ts` - Removed 24 `as any` casts, added AccountType import and narrowing

## Decisions Made
- Used `(wallet.accountType ?? 'eoa') as AccountType` pattern for Drizzle text->union narrowing. This is significantly more type-safe than `as any` while acknowledging Drizzle text() returns string.
- OpenAPIHono `c.req.valid('json')` returns proper types including accountType, aaProvider etc -- no assertion needed for parsed request body.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added AccountType cast for Drizzle text->union type mismatch**
- **Found during:** Task 1 (as any removal)
- **Issue:** Drizzle `text()` column returns `string`, but OpenAPI response schema expects `"eoa" | "smart"` union type. Removing `as any` exposed this type mismatch.
- **Fix:** Added `AccountType` import and used `(wallet.accountType ?? 'eoa') as AccountType` at 3 response locations.
- **Files modified:** packages/daemon/src/api/routes/wallets.ts
- **Verification:** typecheck passes, all 4495 daemon tests pass
- **Committed in:** 38934189

---

**Total deviations:** 1 auto-fixed (1 bug - type mismatch)
**Impact on plan:** Auto-fix necessary for typecheck to pass. Much more type-safe than original as any.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 376-02 (resolveChainId, CAIP-19 regex, NFT type guard) is independent and ready to execute

---
*Phase: 376-type-safety*
*Completed: 2026-03-11*
