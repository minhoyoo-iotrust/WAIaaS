---
phase: 398-type-system-infra-foundation
plan: 01
subsystem: core
tags: [zod, enum, discriminatedUnion, transaction-types, pipeline, policy-engine]

# Dependency graph
requires: []
provides:
  - "CONTRACT_DEPLOY as 9th transaction type in TRANSACTION_TYPES SSoT"
  - "ContractDeployRequestSchema with bytecode field"
  - "7-type TransactionRequestSchema discriminatedUnion"
  - "nullable TransactionSchema.toAddress"
  - "Pipeline switch/case for CONTRACT_DEPLOY in buildTransactionParam, buildByType, buildUserOpCalls"
  - "CONTRACT_DEPLOY default APPROVAL tier in policy engine"
affects: [399-core-rpc-proxy-engine, 400-route-assembly-async-approval]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CONTRACT_DEPLOY uses adapter.buildContractCall with to='' for deploy semantics"
    - "bytecodeHash (keccak256) logged in TX_SUBMITTED audit trail"

key-files:
  created:
    - packages/core/src/__tests__/contract-deploy-schema.test.ts
  modified:
    - packages/core/src/enums/transaction.ts
    - packages/core/src/schemas/transaction.schema.ts
    - packages/core/src/schemas/index.ts
    - packages/core/src/index.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/pipeline/database-policy-engine.ts
    - packages/daemon/src/pipeline/resolve-effective-amount-usd.ts
    - packages/core/src/__tests__/enums.test.ts
    - scripts/verify-enum-ssot.ts

key-decisions:
  - "CONTRACT_DEPLOY uses adapter.buildContractCall with to='' rather than a new adapter method -- Phase 399 RpcTransactionAdapter will handle the to=undefined conversion"
  - "CONTRACT_DEPLOY defaults to APPROVAL tier with Settings override via rpc_proxy.deploy_default_tier"
  - "resolve-effective-amount-usd treats CONTRACT_DEPLOY same as CONTRACT_CALL (value field as native ETH)"

patterns-established:
  - "New transaction types follow the same SSoT propagation: enum -> Zod schema -> discriminatedUnion -> pipeline switch/case -> policy engine"

requirements-completed: [DEPL-01, DEPL-02, DEPL-04, DEPL-05, DEPL-06]

# Metrics
duration: 20min
completed: 2026-03-13
---

# Phase 398 Plan 01: CONTRACT_DEPLOY Zod SSoT Extension Summary

**CONTRACT_DEPLOY added as 9th transaction type with Zod schema, 7-type discriminatedUnion, pipeline cases, and default APPROVAL policy tier**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-13T10:54:47Z
- **Completed:** 2026-03-13T11:14:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- TRANSACTION_TYPES extended to 9 elements with CONTRACT_DEPLOY
- ContractDeployRequestSchema with required bytecode field, optional constructorArgs/value
- TransactionRequestSchema expanded to 7-type discriminatedUnion
- Pipeline switch/case coverage in buildTransactionParam, buildByType, buildUserOpCalls
- DATABASE_POLICY_ENGINE: CONTRACT_DEPLOY defaults to APPROVAL tier with Settings override
- bytecodeHash (keccak256) audit logging for contract deployment traceability

## Task Commits

Each task was committed atomically:

1. **Task 1: CONTRACT_DEPLOY enum + Zod schema + discriminatedUnion** - `60973025` (feat)
2. **Task 2: Pipeline switch/case + policy engine integration** - `e084c731` (feat)

## Files Created/Modified
- `packages/core/src/enums/transaction.ts` - Added CONTRACT_DEPLOY to TRANSACTION_TYPES array
- `packages/core/src/schemas/transaction.schema.ts` - ContractDeployRequestSchema + 7-type union + nullable toAddress
- `packages/core/src/schemas/index.ts` - Export ContractDeployRequestSchema
- `packages/core/src/index.ts` - Export ContractDeployRequestSchema + type
- `packages/daemon/src/pipeline/stages.ts` - CONTRACT_DEPLOY cases in 3 builder functions + bytecodeHash audit
- `packages/daemon/src/pipeline/database-policy-engine.ts` - CONTRACT_DEPLOY default APPROVAL tier
- `packages/daemon/src/pipeline/resolve-effective-amount-usd.ts` - CONTRACT_DEPLOY USD resolution
- `packages/core/src/__tests__/contract-deploy-schema.test.ts` - 6 schema validation tests
- `packages/core/src/__tests__/enums.test.ts` - Updated TransactionType count to 9
- `scripts/verify-enum-ssot.ts` - Updated expectedCount to 9

## Decisions Made
- CONTRACT_DEPLOY uses adapter.buildContractCall with to='' rather than a new adapter method
- Default APPROVAL tier with Settings override path (rpc_proxy.deploy_default_tier)
- bytecodeHash logged via dynamic import of viem keccak256

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CONTRACT_DEPLOY type system fully propagated through SSoT chain
- Phase 399 RpcTransactionAdapter can use ContractDeployRequest type
- Policy engine ready to evaluate CONTRACT_DEPLOY transactions

---
*Phase: 398-type-system-infra-foundation*
*Completed: 2026-03-13*
