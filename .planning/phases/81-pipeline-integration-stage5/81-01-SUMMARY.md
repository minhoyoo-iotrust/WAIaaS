---
phase: 81-pipeline-integration-stage5
plan: 01
subsystem: pipeline
tags: [discriminatedUnion, zod, policy-engine, stage1, stage3, evaluateBatch, TDD]

# Dependency graph
requires:
  - phase: 76-infra-pipeline-foundation
    provides: TransactionRequestSchema discriminatedUnion 5-type
  - phase: 78-token-policy
    provides: ALLOWED_TOKENS policy engine
  - phase: 79-contract-approve-policy
    provides: CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE
  - phase: 80-batch-transactions
    provides: evaluateBatch 2-stage policy, buildBatch, classifyInstruction
provides:
  - Stage 1 discriminatedUnion 5-type parsing (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH)
  - Stage 3 type-based policy routing with TransactionParam enrichment
  - BATCH evaluateBatch integration in pipeline
  - Backward-compatible SendTransactionRequest handling
affects: [81-02 Stage 5 on-chain execution, route handler discriminatedUnion OpenAPI support]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildTransactionParam helper for type-specific policy evaluation params"
    - "safe request accessor helpers (getRequestAmount/To/Memo) for union type"
    - "discriminatedUnion schema branching in stage1Validate (type field presence check)"

key-files:
  created:
    - packages/daemon/src/__tests__/pipeline-stage1-stage3.test.ts
  modified:
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/pipeline/pipeline.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/__tests__/pipeline-notification.test.ts

key-decisions:
  - "Stage 1 uses type field presence to branch: type present -> TransactionRequestSchema, absent -> SendTransactionRequestSchema"
  - "Route handler keeps SendTransactionRequestOpenAPI for now; discriminatedUnion OpenAPI schema is future work"
  - "Safe accessor helpers (getRequestAmount/To/Memo) for union type fields in Stages 5/6"
  - "BATCH in Stage 3 routes to evaluateBatch directly, skipping evaluateAndReserve"
  - "TX_REQUESTED notification includes type field for discriminatedUnion requests"

patterns-established:
  - "buildTransactionParam: centralized type->TransactionParam mapping for policy evaluation"
  - "Union request accessor pattern: getRequestAmount/To/Memo for safe field extraction from SendTransactionRequest | TransactionRequest"

# Metrics
duration: 8min
completed: 2026-02-12
---

# Phase 81 Plan 01: Stage 1 + Stage 3 Pipeline Integration Summary

**Stage 1 discriminatedUnion 5-type parsing with Stage 3 type-based policy routing via buildTransactionParam helper and evaluateBatch delegation for BATCH**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-12T03:57:28Z
- **Completed:** 2026-02-12T04:05:28Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Stage 1 now parses all 5 transaction types (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH) via discriminatedUnion schema and INSERTs the correct type to DB
- Stage 3 builds type-specific TransactionParam with tokenAddress, contractAddress, selector, spenderAddress, approveAmount -- routing to appropriate policy evaluators
- BATCH requests in Stage 3 route to evaluateBatch for 2-stage policy evaluation (per-instruction + aggregate)
- Full backward compat maintained: legacy SendTransactionRequest (no type field) defaults to TRANSFER
- 16 TDD tests, 567 total daemon tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD RED -- Stage 1 discriminatedUnion + Stage 3 type-based policy tests** - `2170a19` (test)
2. **Task 2: TDD GREEN -- Stage 1 + Stage 3 implementation** - `534534f` (feat)

## Files Created/Modified
- `packages/daemon/src/__tests__/pipeline-stage1-stage3.test.ts` - 16 TDD tests: 8 Stage 1 (5-type parsing, backward compat, validation) + 8 Stage 3 (type-based policy routing, evaluateBatch)
- `packages/daemon/src/pipeline/stages.ts` - stage1Validate discriminatedUnion branching, stage3Policy type-based TransactionParam + BATCH evaluateBatch, buildTransactionParam helper, safe request accessors
- `packages/daemon/src/pipeline/pipeline.ts` - executeSend accepts SendTransactionRequest | TransactionRequest
- `packages/daemon/src/api/routes/transactions.ts` - No functional change (route handler keeps legacy schema for now)
- `packages/daemon/src/__tests__/pipeline-notification.test.ts` - Updated TX_REQUESTED assertion to include type field

## Decisions Made
- **Stage 1 branching by type field presence:** If request has `type` field, parse with TransactionRequestSchema (discriminatedUnion). If not, use SendTransactionRequestSchema. This avoids breaking any existing callers.
- **Route handler keeps SendTransactionRequestOpenAPI:** The OpenAPI route still validates with the legacy schema. When discriminatedUnion support is needed for the REST API, the OpenAPI schema will be updated separately. Pipeline integration via TransactionPipeline.executeSend already supports both.
- **BATCH skips evaluateAndReserve:** BATCH requests go through evaluateBatch directly (not evaluateAndReserve), since batch evaluation is fundamentally different (per-instruction + aggregate).
- **Safe accessor helpers pattern:** Added getRequestAmount/getRequestTo/getRequestMemo to avoid TypeScript errors when accessing fields that don't exist on all union variants (e.g., CONTRACT_CALL has no `amount`, APPROVE has no `to`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pipeline-notification.test.ts assertion for TX_REQUESTED payload**
- **Found during:** Task 2 (implementation)
- **Issue:** TX_REQUESTED notification now includes `type` field, breaking existing test assertion
- **Fix:** Updated test expectation to include `type: 'TRANSFER'` in expected payload
- **Files modified:** packages/daemon/src/__tests__/pipeline-notification.test.ts
- **Verification:** All 567 daemon tests pass
- **Committed in:** 534534f (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test assertion update for new notification payload field. No scope creep.

## Issues Encountered
- TypeScript union type narrowing issues with `SendTransactionRequest | TransactionRequest` -- resolved by adding safe accessor helper functions instead of direct property access
- OpenAPI route type inference conflicts when using conditional field access -- resolved by keeping route handler's inline Stage 1 unchanged (uses legacy schema only)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Stage 1 and Stage 3 pipeline integration complete for all 5 transaction types
- Ready for Phase 81 Plan 02 (if exists) or subsequent pipeline integration work
- Route handler discriminatedUnion OpenAPI support deferred (not blocking)

## Self-Check: PASSED

---
*Phase: 81-pipeline-integration-stage5*
*Completed: 2026-02-12*
