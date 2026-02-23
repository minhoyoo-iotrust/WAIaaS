---
phase: 245-runtime-behavior-design
plan: 02
subsystem: api
tags: [defi, safety, mev, jito, wsteth, stale-calldata, api-drift, gas-condition, re-resolve]

# Dependency graph
requires:
  - phase: 244-core-design-foundation
    provides: "DEFI-01/02 confirmed package structure and API patterns, DEFI-03 policy integration"
  - phase: research
    provides: "m28-defi-protocol-PITFALLS (P2 MEV, P5 stETH rebase, P6 nonce starvation, P14 RPC failure)"
provides:
  - "SAFE-01: Jito MEV fail-closed design (JITO_UNAVAILABLE, no public RPC fallback, JITO_DEGRADED alerting)"
  - "SAFE-02: wstETH adoption for Lido (BATCH stake/unstake, 3 contract addresses, USD evaluation chain)"
  - "SAFE-03: stale calldata re-resolve pattern (providerName+originalParams in bridge_metadata, per-wallet limit, nonce sequencing)"
  - "SAFE-04: API drift 3-layer defense (Zod validation, version-pinned URLs, failure logging with API_SCHEMA_DRIFT alerting)"
  - "SAFE-04 auxiliary: RPC failure timeout clock pause via effectiveWaitTime"
  - "PLCY-02 wstETH address added to Lido whitelist bundle"
affects: [m28-01, m28-02, m28-03, m28-04, m28-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-closed MEV protection: JITO_UNAVAILABLE error, never fallback to public mempool"
    - "wstETH wrapping: BATCH type for submit()+wrap() atomic execution"
    - "re-resolve pattern: store originalParams in bridge_metadata, re-call resolve() on gas condition met"
    - "API drift 3-layer defense: Zod parse + version-pinned URL + redirect:'error' + API_SCHEMA_DRIFT alerting"
    - "effectiveWaitTime: total elapsed - RPC failure seconds for fair timeout evaluation"

key-files:
  created: []
  modified:
    - "internal/objectives/m28-00-defi-basic-protocol-design.md"

key-decisions:
  - "SAFE-01: Jito fail-closed -- never fallback to public RPC, JITO_UNAVAILABLE + JITO_DEGRADED alerting"
  - "SAFE-02: wstETH adopted over stETH -- eliminates rebase, dust, L2 compatibility issues"
  - "SAFE-03: re-resolve calldata on gas condition met -- store providerName+originalParams, not stale calldata"
  - "SAFE-03: per-wallet gas wait limit max_per_wallet=5, per-wallet lock for nonce sequencing"
  - "SAFE-04: Zod non-strict (allow new fields), version-pinned URLs, redirect:'error', API_SCHEMA_DRIFT after 3 consecutive failures"
  - "SAFE-04: RPC failure pauses timeout clock via effectiveWaitTime calculation"

patterns-established:
  - "Fail-closed pattern: external dependency unavailable -> immediate FAILED, no degraded fallback"
  - "re-resolve pattern: bridge_metadata stores ActionProvider params for deferred re-execution"
  - "effectiveWaitTime: fair timeout calculation excluding infrastructure failures"

requirements-completed: [SAFE-01, SAFE-02, SAFE-03, SAFE-04]

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 245 Plan 02: Safety Design Summary

**4 safety designs confirmed: Jito MEV fail-closed, wstETH adoption, stale calldata re-resolve pattern, and API drift 3-layer defense with effectiveWaitTime RPC failure handling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T05:07:39Z
- **Completed:** 2026-02-23T05:11:04Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- SAFE-01 (Jito MEV fail-closed) and SAFE-02 (wstETH adoption) confirmed with data flow diagrams, contract addresses, and policy evaluation rules
- SAFE-03 (stale calldata re-resolve) confirmed with bridge_metadata storage schema, GasConditionWorker re-resolve flow, per-wallet limits, and EVM nonce sequencing
- SAFE-04 (API drift defense) confirmed with 3-layer design (Zod + version pinning + failure logging), redirect:'error', API_SCHEMA_DRIFT alerting, and RPC failure effectiveWaitTime
- PLCY-02 whitelist bundle updated with wstETH address for Lido provider

## Task Commits

Each task was committed atomically:

1. **Task 1: Jito MEV fail-closed + stETH/wstETH architecture decision** - `8600a98e` (feat)
2. **Task 2: Stale calldata re-resolve + API drift defense** - `90d42f30` (feat)

## Files Created/Modified

- `internal/objectives/m28-00-defi-basic-protocol-design.md` - Added "6. Safety Design (confirmed)" section with SAFE-01~04, updated PLCY-02 Lido whitelist bundle with wstETH address

## Decisions Made

1. **Jito fail-closed** -- When Jito block engine is unavailable, transaction immediately FAILED with JITO_UNAVAILABLE. No public RPC fallback under any circumstances. Operator must explicitly remove Jito URL to switch to public RPC (conscious choice, not automatic degradation).
2. **wstETH over stETH** -- All Lido integration uses wstETH (non-rebasing). BATCH type for atomic submit()+wrap(). Eliminates rebase tracking, 1-2 wei dust, L2 incompatibility. PLCY-02 Lido bundle updated to 3 addresses (stETH + wstETH + WithdrawalQueue).
3. **re-resolve pattern** -- GAS_WAITING stores providerName + actionName + originalParams in bridge_metadata. On condition met, GasConditionWorker calls executeResolve() to get fresh calldata. Per-wallet limit of 5 prevents slot monopolization.
4. **API drift non-strict Zod** -- schema.parse() without strict mode (allow new fields). 3 consecutive Zod failures trigger API_SCHEMA_DRIFT notification. redirect:'error' prevents silent URL migration.
5. **effectiveWaitTime** -- Total elapsed minus rpcFailureSeconds for fair timeout evaluation. RPC infrastructure failures do not consume user's gas condition timeout budget.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 safety designs (SAFE-01~04) confirmed in m28-00, ready for consumption by m28-01~m28-05 implementation milestones
- m28-04 objective needs tech decision #7 updated to "wstETH adopted" (noted in SAFE-02, to be applied during implementation milestone)
- Phase 245 Plan 03 can proceed with remaining design work

## Self-Check: PASSED

- [x] m28-00-defi-basic-protocol-design.md exists
- [x] 245-02-SUMMARY.md exists
- [x] Commit 8600a98e (Task 1) found
- [x] Commit 90d42f30 (Task 2) found

---
*Phase: 245-runtime-behavior-design*
*Completed: 2026-02-23*
