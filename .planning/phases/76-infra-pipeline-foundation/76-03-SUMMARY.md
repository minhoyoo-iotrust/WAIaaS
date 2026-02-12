---
phase: 76-infra-pipeline-foundation
plan: 03
subsystem: infra, api
tags: [IChainAdapter, chain-adapter, policy, zod, superRefine, solana, interface-extension]

# Dependency graph
requires:
  - phase: 76-01
    provides: ChainError 25-code enum, INSUFFICIENT_FOR_FEE domain fix
  - phase: 76-02
    provides: Migration runner, discriminatedUnion 5-type schema, TransferRequestInput type naming
provides:
  - IChainAdapter 20-method interface (11 existing + 9 new)
  - 7 new chain-adapter types (FeeEstimate, TokenInfo, SweepResult, TokenTransferParams, ContractCallParams, ApproveParams, BatchParams)
  - SolanaAdapter 20-method implementation (11 real + 9 stubs)
  - 6 PolicyType superRefine validation (ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE)
affects:
  - Phase 77 (token transfer pipeline -- uses buildTokenTransfer, estimateFee, getTokenInfo)
  - Phase 78 (contract call pipeline -- uses buildContractCall)
  - Phase 79 (approve pipeline -- uses buildApprove)
  - Phase 80 (batch pipeline -- uses buildBatch, sweepAll)
  - All future chain adapters (must implement 20-method IChainAdapter)
  - Policy API (CreatePolicyRequestSchema now validates rules for 6 new types)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IChainAdapter 20-method contract: connection(4) + balance(1) + pipeline(4) + confirm(1) + assets(1) + fee(1) + token(2) + contract(2) + batch(1) + utility(3)"
    - "Adapter stub pattern: new methods throw 'Not implemented' until Phase 78-80 implementation"
    - "superRefine pattern: POLICY_RULES_SCHEMAS map lookup for type-specific rules validation"

key-files:
  created:
    - packages/core/src/__tests__/chain-adapter-interface.test.ts
    - packages/core/src/__tests__/policy-superrefine.test.ts
  modified:
    - packages/core/src/interfaces/chain-adapter.types.ts
    - packages/core/src/interfaces/IChainAdapter.ts
    - packages/core/src/interfaces/index.ts
    - packages/core/src/index.ts
    - packages/core/src/schemas/policy.schema.ts
    - packages/adapters/solana/src/adapter.ts
    - packages/daemon/src/__tests__/api-admin-endpoints.test.ts
    - packages/daemon/src/__tests__/api-agents.test.ts
    - packages/daemon/src/__tests__/api-hint-field.test.ts
    - packages/daemon/src/__tests__/api-new-endpoints.test.ts
    - packages/daemon/src/__tests__/api-transactions.test.ts
    - packages/daemon/src/__tests__/pipeline-integration.test.ts
    - packages/daemon/src/__tests__/pipeline-notification.test.ts
    - packages/daemon/src/__tests__/pipeline-stage4.test.ts
    - packages/daemon/src/__tests__/pipeline.test.ts
    - packages/daemon/src/__tests__/session-lifecycle-e2e.test.ts
    - packages/daemon/src/__tests__/workflow-owner-e2e.test.ts

key-decisions:
  - "getCurrentNonce returns 0 for Solana (no EVM nonce concept) -- not a stub, actual implementation"
  - "superRefine uses POLICY_RULES_SCHEMAS map lookup instead of switch/case for cleaner extensibility"
  - "Rules schemas are module-level const (not exported) -- internal validation only, export later if needed"

patterns-established:
  - "IChainAdapter stub pattern: new methods throw 'Not implemented: {method} will be implemented in Phase {N}'"
  - "Mock adapter pattern: daemon test mocks must include all 20 IChainAdapter methods with // v1.4 stubs comment"
  - "Policy superRefine pattern: map-based type dispatch with safeParse + addIssue path prefixing"

# Metrics
duration: 7min
completed: 2026-02-12
---

# Phase 76 Plan 03: IChainAdapter 20-Method Extension + PolicyType superRefine Summary

**IChainAdapter extended to 20 methods with 7 new types, SolanaAdapter stubs, and Zod superRefine validation for 6 new PolicyType rules schemas**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-11T17:25:07Z
- **Completed:** 2026-02-11T17:32:24Z
- **Tasks:** 2
- **Files modified:** 19 (2 created, 17 modified)

## Accomplishments
- Extended IChainAdapter from 11 to 20 methods with full type signatures for fee estimation, token ops, contract ops, batch, and utility operations
- Added 7 new types to chain-adapter.types.ts: FeeEstimate, TokenInfo, SweepResult, TokenTransferParams, ContractCallParams, ApproveParams, BatchParams
- SolanaAdapter implements all 20 methods (getCurrentNonce returns 0, 8 others throw 'Not implemented')
- Added superRefine to CreatePolicyRequestSchema validating rules for 6 new PolicyTypes while preserving free-form rules for existing 4 types
- Updated 11 daemon test mock adapters to include v1.4 stub methods
- 23 new tests (4 chain-adapter-interface + 19 policy-superrefine), all 660 tests pass across core + adapter-solana + daemon

## Task Commits

Each task was committed atomically:

1. **Task 1: IChainAdapter 20 method extension + SolanaAdapter stubs** - `1d7f420` (feat)
2. **Task 2: 6 PolicyType superRefine validation + tests** - `11da774` (feat)

## Files Created/Modified
- `packages/core/src/interfaces/chain-adapter.types.ts` - Added 7 new types (FeeEstimate, TokenInfo, SweepResult, TokenTransferParams, ContractCallParams, ApproveParams, BatchParams)
- `packages/core/src/interfaces/IChainAdapter.ts` - Extended from 11 to 20 methods with 9 new method signatures
- `packages/core/src/interfaces/index.ts` - Added 7 new type exports
- `packages/core/src/index.ts` - Added 7 new type exports to top-level barrel
- `packages/core/src/schemas/policy.schema.ts` - Added 6 rules schemas + POLICY_RULES_SCHEMAS map + superRefine chain
- `packages/adapters/solana/src/adapter.ts` - Added 9 stub methods implementing IChainAdapter 20-method contract
- `packages/core/src/__tests__/chain-adapter-interface.test.ts` - 4 tests: 20-method count, type imports, compile-time verification
- `packages/core/src/__tests__/policy-superrefine.test.ts` - 19 tests: 6 types valid/invalid rules + 4 backward compatibility
- `packages/daemon/src/__tests__/*.test.ts` (11 files) - Added v1.4 stub methods to mock adapters

## Decisions Made
- **getCurrentNonce returns 0 for Solana:** This is not a stub but actual implementation -- Solana doesn't use EVM-style nonces. The method exists for cross-chain adapter contract consistency.
- **POLICY_RULES_SCHEMAS map-based dispatch:** Instead of a switch/case in superRefine, used a `Record<string, ZodTypeAny>` map for cleaner extensibility. Adding new policy types requires only adding a map entry.
- **Rules schemas not exported:** The 6 individual rules schemas (AllowedTokensRulesSchema etc.) are module-level const, not exported. They're internal validation logic. Can be exported later if consumers need them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated 11 daemon test mock adapters for IChainAdapter 20-method contract**
- **Found during:** Task 1 (build verification)
- **Issue:** All 11 daemon test files creating mock IChainAdapter objects failed type check because they only had 11 methods, missing the 9 new methods
- **Fix:** Added 9 v1.4 stub methods to each of the 11 mock adapter functions
- **Files modified:** 11 daemon test files (api-admin-endpoints, api-agents, api-hint-field, api-new-endpoints, api-transactions, pipeline, pipeline-integration, pipeline-notification, pipeline-stage4, session-lifecycle-e2e, workflow-owner-e2e)
- **Verification:** `pnpm turbo build` succeeds, all 513 daemon tests pass
- **Committed in:** 1d7f420 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to maintain type safety across monorepo. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- IChainAdapter 20-method contract ready for Phase 77-80 implementations
- SolanaAdapter stubs ready to be replaced with real implementations in Phase 78 (token), 79 (contract/approve), 80 (batch/sweep)
- PolicyType superRefine validates rules at creation time, preventing invalid policy configurations before they reach the policy engine
- All 660 tests pass (124 core + 23 adapter-solana + 513 daemon), full monorepo build clean

## Self-Check: PASSED

---
*Phase: 76-infra-pipeline-foundation*
*Completed: 2026-02-12*
