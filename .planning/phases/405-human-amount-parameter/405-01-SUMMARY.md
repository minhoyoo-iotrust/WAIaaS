---
phase: 405-human-amount-parameter
plan: 01
status: complete
duration: 7min
completed: 2026-03-14
tasks_completed: 1
tasks_total: 1
dependency_graph:
  requires: ["Phase 404 (typed MCP schemas + format-amount)"]
  provides: ["humanAmount XOR Zod schema", "resolveHumanAmount helper", "validateAmountXOR helper"]
  affects: ["packages/core/schemas/transaction.schema.ts", "packages/daemon/api/routes/transactions.ts", "packages/daemon/pipeline/stages.ts"]
tech_stack:
  patterns: ["Route-level XOR validation (discriminatedUnion compat)", "parseAmount for human->smallest-unit conversion"]
key_files:
  created:
    - packages/daemon/src/__tests__/human-amount.test.ts
  modified:
    - packages/core/src/schemas/transaction.schema.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/pipeline/stages.ts
decisions:
  - "XOR validation at route level, not schema superRefine, to preserve discriminatedUnion compatibility"
  - "amount made optional in Zod schema; pipeline stages use non-null assertions (amount always set by route handler)"
  - "Used ACTION_VALIDATION_FAILED error code for XOR validation errors"
metrics:
  tests_added: 19
  tests_passing: 19
  files_modified: 4
commits:
  - hash: b0a264ee
    message: "feat(405-01): add humanAmount XOR parameter for TRANSFER/TOKEN_TRANSFER/APPROVE"
---

# Phase 405 Plan 01: Core XOR Zod refinement + REST API humanAmount Summary

Route-level humanAmount XOR validation with parseAmount-based human-readable to smallest-unit conversion for TRANSFER/TOKEN_TRANSFER/APPROVE.

## What Was Done

### Task 1: Zod XOR schema + resolveHumanAmount helper (TDD)

**Schema changes (packages/core/src/schemas/transaction.schema.ts):**
- Added `humanAmount: z.string().min(1).optional()` with `.describe()` to TransferRequestSchema, TokenTransferRequestSchema, ApproveRequestSchema
- Made `amount` optional in all three schemas (was required)
- Kept schemas as `ZodObject` (not `ZodEffects`) to preserve `z.discriminatedUnion` compatibility

**Route-level validation (packages/daemon/src/api/routes/transactions.ts):**
- Added `validateAmountXOR()` - throws ACTION_VALIDATION_FAILED when both or neither amount/humanAmount present
- Added `resolveHumanAmount()` - converts humanAmount to smallest-unit string via `parseAmount()`
- Integrated conversion in POST /transactions/send handler: TRANSFER uses native token decimals (getNativeTokenInfo), TOKEN_TRANSFER/APPROVE uses token.decimals
- Same conversion added to POST /transactions/simulate handler
- After conversion, humanAmount is deleted from request and amount is set, so pipeline receives standard format

**Type fixes (packages/daemon/src/pipeline/stages.ts):**
- Added non-null assertions (`req.amount!`) for BigInt conversions since amount is now optional in the type but always set by route handler

**Tests (19 passing):**
- 4 XOR validation tests (amount only, humanAmount only, both, neither)
- 4 TransferRequestSchema acceptance tests
- 2 TokenTransferRequestSchema/ApproveRequestSchema tests
- 2 discriminatedUnion compatibility tests
- 5 resolveHumanAmount conversion tests (18/6/9 decimals)
- 2 edge case tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] discriminatedUnion incompatibility with superRefine**
- **Found during:** Task 1 implementation
- **Issue:** `z.discriminatedUnion` requires `ZodObject` branches; `superRefine` produces `ZodEffects` which is rejected
- **Fix:** Moved XOR validation to route handler level (`validateAmountXOR`), kept schema fields as plain optional
- **Files modified:** packages/daemon/src/api/routes/transactions.ts

**2. [Rule 1 - Bug] Invalid WAIaaSError code 'VALIDATION_FAILED'**
- **Found during:** Task 1 test run
- **Issue:** 'VALIDATION_FAILED' error code doesn't exist in error registry
- **Fix:** Changed to 'ACTION_VALIDATION_FAILED' which exists in error codes
- **Files modified:** packages/daemon/src/api/routes/transactions.ts

**3. [Rule 1 - Bug] Type errors from optional amount in pipeline stages**
- **Found during:** Task 1 typecheck
- **Issue:** 4 BigInt() calls received `string | undefined` after making amount optional
- **Fix:** Added non-null assertions (`req.amount!`) since route handler always resolves amount before pipeline
- **Files modified:** packages/daemon/src/pipeline/stages.ts

## Self-Check: PASSED
