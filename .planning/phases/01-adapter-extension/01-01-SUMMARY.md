---
phase: 01-adapter-extension
plan: 01
subsystem: chain-adapter
tags: [xrpl, dex, offer-create, offer-cancel, contract-call, calldata-json]

requires:
  - phase: "v33.6 (Phase 473)"
    provides: "RippleAdapter with buildContractCall stub (INVALID_INSTRUCTION)"
provides:
  - "buildContractCall() OfferCreate/OfferCancel routing via calldata JSON"
  - "buildXrplNativeTx() private helper (shared autofill/fee/serialize pattern)"
affects: ["02-xrpldex-provider-core", "03-policy-interface-integration"]

tech-stack:
  added: []
  patterns: ["calldata JSON routing via xrplTxType discriminator", "buildXrplNativeTx shared helper for XRPL native tx types"]

key-files:
  created: []
  modified:
    - "packages/adapters/ripple/src/adapter.ts"
    - "packages/adapters/ripple/src/__tests__/ripple-adapter.test.ts"

key-decisions:
  - "OfferCreate/OfferCancel typed as union parameter for buildXrplNativeTx (not Transaction) to satisfy xrpl.Client.autofill SubmittableTransaction constraint"
  - "calldata JSON uses xrplTxType discriminator field for routing, matching CONTRACT_CALL pattern"

patterns-established:
  - "XRPL calldata JSON: { xrplTxType: 'OfferCreate'|'OfferCancel', ...fields } -- reusable for future XRPL tx types"

requirements-completed: [ADPT-01, ADPT-02]

duration: 4min
completed: 2026-04-04
---

# Phase 1 Plan 1: buildContractCall() OfferCreate/OfferCancel Summary

**RippleAdapter.buildContractCall() extended with calldata JSON routing for OfferCreate/OfferCancel via shared buildXrplNativeTx helper**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-04T00:46:04Z
- **Completed:** 2026-04-04T00:50:30Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- buildContractCall() parses calldata JSON, routes by xrplTxType to OfferCreate/OfferCancel
- buildXrplNativeTx() private helper encapsulates shared autofill/fee-margin/serialize pattern
- Optional fields (Flags, Expiration, OfferSequence) preserved through to autofill
- Backward compatible: no-calldata and invalid calldata still throw INVALID_INSTRUCTION
- 6 new tests covering all routing paths, 136 total tests passing

## Task Commits

1. **Task 1: Extend buildContractCall() with OfferCreate/OfferCancel routing** - `135ed5ee` (feat)

## Files Created/Modified
- `packages/adapters/ripple/src/adapter.ts` - Added buildXrplNativeTx helper, replaced buildContractCall stub with calldata JSON router
- `packages/adapters/ripple/src/__tests__/ripple-adapter.test.ts` - Added 6 tests in buildContractCall XRPL native tx routing describe block

## Decisions Made
- Used `OfferCreate | OfferCancel` union type for buildXrplNativeTx parameter instead of `Transaction` to satisfy xrpl.Client.autofill's `SubmittableTransaction` constraint
- Kept existing no-calldata error path for backward compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SubmittableTransaction type mismatch**
- **Found during:** Task 1 (type check verification)
- **Issue:** `client.autofill()` accepts `SubmittableTransaction`, not `Transaction` -- tsc error
- **Fix:** Changed buildXrplNativeTx parameter from `Transaction` to `OfferCreate | OfferCancel`
- **Files modified:** packages/adapters/ripple/src/adapter.ts
- **Verification:** `npx tsc --noEmit` passes cleanly

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type-level fix only, no behavioral change.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- buildContractCall() ready for XrplDexProvider to call with OfferCreate/OfferCancel calldata
- tx-parser extension (Plan 01-02) can proceed independently

---
*Phase: 01-adapter-extension*
*Completed: 2026-04-04*
