---
phase: 50-api-solana-pipeline
plan: 04
subsystem: pipeline
tags: [transaction-pipeline, 6-stage, policy-engine, hono-routes, send-transfer, status-query]

# Dependency graph
requires:
  - phase: 50-api-solana-pipeline (50-01)
    provides: createApp() factory, middleware, error handler
  - phase: 50-api-solana-pipeline (50-02)
    provides: SolanaAdapter implementing IChainAdapter (build/simulate/sign/submit)
  - phase: 50-api-solana-pipeline (50-03)
    provides: Agent/wallet routes, DaemonLifecycle Steps 4-5, resolveAgent pattern
  - phase: 49-daemon-infra
    provides: LocalKeyStore, createDatabase, pushSchema, generateId, WAIaaSError
provides:
  - TransactionPipeline class with executeSend() and getTransaction()
  - DefaultPolicyEngine (IPolicyEngine, INSTANT passthrough)
  - 6 stage functions (validate, auth, policy, wait, execute, confirm)
  - POST /v1/transactions/send route (async pipeline execution)
  - GET /v1/transactions/:id route (transaction status query)
affects: [51-integration-testing, future policy engine plans, future async pipeline plans]

# Tech tracking
tech-stack:
  added: []
  patterns: ["async fire-and-forget pipeline (Stage 1 sync response, stages 2-6 background)", "PipelineContext accumulating state through sequential stages", "private key guarded memory release in finally block"]

key-files:
  created:
    - packages/daemon/src/pipeline/pipeline.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/pipeline/default-policy-engine.ts
    - packages/daemon/src/pipeline/index.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/__tests__/pipeline.test.ts
    - packages/daemon/src/__tests__/api-transactions.test.ts
  modified:
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/api/index.ts
    - packages/daemon/src/index.ts

key-decisions:
  - "Async pipeline: POST /send runs Stage 1 synchronously (DB INSERT, 201 response), stages 2-6 fire-and-forget"
  - "CANCELLED status for policy-denied transactions (REJECTED not in TRANSACTION_STATUSES enum)"
  - "PipelineContext pattern: mutable context object accumulating state through 6 sequential stages"
  - "Private key release in finally block inside stage5Execute (keyStore.releaseKey)"
  - "createApp extended with policyEngine dep for conditional transaction route registration"

patterns-established:
  - "Pipeline stage pattern: async function stageNName(ctx: PipelineContext): Promise<void> modifying ctx"
  - "Async fire-and-forget: void (async () => { try { stages } catch { updateFailed } })()"
  - "TransactionRouteDeps: db + adapter + keyStore + policyEngine + masterPassword"

# Metrics
duration: 7min
completed: 2026-02-10
---

# Phase 50 Plan 04: Transaction Pipeline + API Routes Summary

**6-stage transaction pipeline (validate/auth/policy/wait/execute/confirm) with DefaultPolicyEngine INSTANT passthrough, POST /send returning 201 async, GET /:id status query, 21 new tests (167 total)**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-10T02:46:18Z
- **Completed:** 2026-02-10T02:53:50Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- 6-stage TransactionPipeline class with executeSend() orchestrating validate -> auth -> policy -> wait -> execute -> confirm
- DefaultPolicyEngine returning INSTANT/allowed for all transactions (v1.1 passthrough)
- POST /v1/transactions/send: Stage 1 runs synchronously (returns 201 with txId), stages 2-6 run asynchronously
- GET /v1/transactions/:id: Returns full transaction status JSON with all expected fields
- Private key always released in finally block (stage5Execute) preventing memory leaks
- 14 pipeline tests covering all 6 stages + 2 integration tests
- 7 API tests covering send (4) + status query (3)
- 167 total daemon tests (146 existing + 21 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: 6-stage pipeline + DefaultPolicyEngine + transaction routes** - `b0514dd` (feat)
2. **Task 2: Pipeline + transaction API tests** - `43f42bb` (test)

## Files Created/Modified
- `packages/daemon/src/pipeline/pipeline.ts` - TransactionPipeline class with executeSend() and getTransaction()
- `packages/daemon/src/pipeline/stages.ts` - 6 stage functions + PipelineContext type
- `packages/daemon/src/pipeline/default-policy-engine.ts` - DefaultPolicyEngine (INSTANT passthrough)
- `packages/daemon/src/pipeline/index.ts` - Pipeline module barrel export
- `packages/daemon/src/api/routes/transactions.ts` - POST /send + GET /:id transaction routes
- `packages/daemon/src/api/routes/index.ts` - Added transactionRoutes export
- `packages/daemon/src/api/server.ts` - Extended createApp with policyEngine dep, conditional tx route registration
- `packages/daemon/src/api/index.ts` - Added transactionRoutes export
- `packages/daemon/src/index.ts` - Added TransactionPipeline, DefaultPolicyEngine, PipelineDeps exports
- `packages/daemon/src/__tests__/pipeline.test.ts` - 14 pipeline stage + integration tests
- `packages/daemon/src/__tests__/api-transactions.test.ts` - 7 transaction API route tests

## Decisions Made
- **Async pipeline execution:** POST /send runs Stage 1 synchronously (DB INSERT returns 201 with txId immediately), then stages 2-6 execute asynchronously via fire-and-forget. This matches the "submit to pipeline" semantic -- client polls GET /:id for status updates rather than waiting 30+ seconds for confirmation.
- **CANCELLED for policy denial:** The plan specified 'REJECTED' status, but TRANSACTION_STATUSES enum does not include 'REJECTED'. Used 'CANCELLED' as the closest semantic match (policy denied = transaction cancelled before execution).
- **PipelineContext mutable state:** Each stage mutates the shared context object (txId, tier, unsignedTx, signedTx, submitResult) rather than returning values, keeping the stage function signatures uniform and composable.
- **Private key finally block:** stage5Execute wraps decryptPrivateKey/signTransaction in try/finally to ensure keyStore.releaseKey() always runs, even on sign failure.
- **createApp conditional registration:** Transaction routes registered only when all pipeline deps (db, keyStore, masterPassword, adapter, policyEngine) are available, maintaining test flexibility.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] REJECTED status not in TRANSACTION_STATUSES enum**
- **Found during:** Task 2 (pipeline tests)
- **Issue:** Plan specified UPDATE tx status to 'REJECTED' for policy denial, but TRANSACTION_STATUSES = ['PENDING','QUEUED','EXECUTING','SUBMITTED','CONFIRMED','FAILED','CANCELLED','EXPIRED','PARTIAL_FAILURE']. No 'REJECTED' value. SQLite CHECK constraint rejected the UPDATE.
- **Fix:** Changed 'REJECTED' to 'CANCELLED' in stage3Policy and tests. 'CANCELLED' is the closest semantic match for policy-denied transactions.
- **Files modified:** packages/daemon/src/pipeline/stages.ts, packages/daemon/src/__tests__/pipeline.test.ts, packages/daemon/src/api/routes/transactions.ts
- **Verification:** All 167 tests pass, CHECK constraint satisfied
- **Committed in:** 43f42bb (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial enum mismatch fix. No scope creep.

## Issues Encountered
- Pre-existing lint error in `packages/daemon/src/lifecycle/workers.ts` (unused `_name` variable) not related to this plan. All files created/modified in this plan pass lint cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete SOL transfer flow operational: API -> 6-stage pipeline -> on-chain execution -> status queryable
- Phase 50 success criteria #4 fulfilled: end-to-end transaction pipeline
- Ready for Phase 51 integration testing (full daemon startup + real adapter + pipeline)
- DefaultPolicyEngine is placeholder; v1.2+ will add DatabasePolicyEngine with DB-backed rules
- Async pipeline pattern established; v1.2+ can add job queue for better reliability

## Self-Check: PASSED
