---
phase: 320-reputation-policy-cache
plan: 02
subsystem: pipeline
tags: [erc-8004, reputation, policy-engine, pipeline, maxTier]

requires:
  - phase: 320-reputation-policy-cache
    provides: ReputationCacheService for reputation score lookups
  - phase: 317-foundation
    provides: DB v39 with agent_identities table, REPUTATION_THRESHOLD PolicyType

provides:
  - REPUTATION_THRESHOLD policy evaluation at position 6 in DatabasePolicyEngine
  - prefetchReputationTier for async-to-sync bridge in evaluateAndReserve
  - resolveAgentIdFromAddress for counterparty identity lookup
  - PipelineContext.reputationCache field + wiring through daemon -> server -> transactions

affects: [321, 322, 323]

tech-stack:
  added: []
  patterns: [reputation-floor-tier-maxTier, async-prefetch-sync-txn-bridge]

key-files:
  created:
    - packages/daemon/src/__tests__/reputation-policy.test.ts
  modified:
    - packages/daemon/src/pipeline/database-policy-engine.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/api/routes/transactions.ts

key-decisions:
  - "Reputation tier is a floor, not a deny -- applied via maxTier at all exit points"
  - "evaluateAndReserve uses pre-fetched reputationFloorTier (async RPC call before IMMEDIATE txn)"
  - "resolveAgentIdFromAddress joins agent_identities + wallets with case-insensitive publicKey match"
  - "No identity in agent_identities -> treated as unrated (not denied)"

patterns-established:
  - "Reputation floor tier: stored and applied via maxTier at every allowed=true return point"
  - "Async-to-sync bridge: prefetch async data before BEGIN IMMEDIATE transaction block"

requirements-completed: [REPU-05, REPU-06, REPU-07]

duration: 8min
completed: 2026-03-04
---

# Phase 320 Plan 02: REPUTATION_THRESHOLD Policy Evaluator Summary

**REPUTATION_THRESHOLD policy evaluation at position 6 in Stage 3 pipeline with maxTier escalation, unrated handling, and async-to-sync prefetch bridge**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-04T09:34:15Z
- **Completed:** 2026-03-04T09:41:57Z
- **Tasks:** 2 (TDD + integration verification)
- **Files modified:** 6

## Accomplishments
- REPUTATION_THRESHOLD evaluates at position 6 (after APPROVED_SPENDERS, before APPROVE_AMOUNT_LIMIT)
- Below min_score triggers below_threshold_tier escalation via maxTier (never downgrades)
- Unrated agents (no identity, no cache, RPC failure) receive unrated_tier treatment
- check_counterparty=false skips evaluation entirely (default behavior preserved)
- prefetchReputationTier enables async RPC lookups before IMMEDIATE transaction block
- PipelineContext.reputationCache wired through daemon.ts -> server.ts -> transactions.ts
- 11 new unit tests + 134 existing tests pass (0 regressions)

## Task Commits

1. **Task 1: REPUTATION_THRESHOLD evaluator + PipelineContext (TDD)** - `007223e5` (feat)
2. **Task 2: Integration verification + regression tests** - no changes needed (all pass)

## Files Created/Modified
- `packages/daemon/src/pipeline/database-policy-engine.ts` - Added evaluateReputationThreshold, resolveAgentIdFromAddress, prefetchReputationTier, 4th constructor param
- `packages/daemon/src/pipeline/stages.ts` - PipelineContext.reputationCache field, prefetch in stage3Policy
- `packages/daemon/src/lifecycle/daemon.ts` - Create ReputationCacheService, pass to DatabasePolicyEngine + createApp
- `packages/daemon/src/api/server.ts` - CreateAppDeps.reputationCache, pass to transaction routes
- `packages/daemon/src/api/routes/transactions.ts` - TransactionRouteDeps.reputationCache, pass to PipelineContext
- `packages/daemon/src/__tests__/reputation-policy.test.ts` - 11 unit tests for all evaluation scenarios

## Decisions Made
- Reputation tier is a floor applied via maxTier at all allowed=true return points (never denies, only escalates)
- evaluateAndReserve receives pre-fetched reputationFloorTier since IMMEDIATE txn block is synchronous
- resolveAgentIdFromAddress uses inner join of agent_identities + wallets with case-insensitive publicKey comparison
- Counterparty without agent_identities entry is treated as unrated (not denied, applying unrated_tier)
- reputationFloorTier applied even in "no policies" early return (evaluateAndReserve step 2)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] evaluateAndReserve no-policies early return missed reputationFloorTier**
- **Found during:** Task 1 (test i. evaluateAndReserve)
- **Issue:** When no policies exist, evaluateAndReserve returned INSTANT without applying reputationFloorTier
- **Fix:** Apply maxTier(INSTANT, reputationFloorTier) at the step 2 early return
- **Files modified:** packages/daemon/src/pipeline/database-policy-engine.ts
- **Verification:** All 11 tests pass
- **Committed in:** 007223e5

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Correctness fix for edge case. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- REPUTATION_THRESHOLD policy fully operational in pipeline
- ReputationCacheService wired and available for cache invalidation
- Ready for Phase 321 (EIP-712 Approval + Wallet Linking)

---
*Phase: 320-reputation-policy-cache*
*Completed: 2026-03-04*
