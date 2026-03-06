---
phase: 339-userop-build-api
plan: 01
subsystem: api
tags: [erc-4337, userop, smart-account, viem, openapi]

requires:
  - phase: 338-foundation
    provides: Zod schemas (UserOpBuild*), error codes (USEROP domain), DB v45 userop_builds table, Lite/Full mode helpers
provides:
  - POST /v1/wallets/:id/userop/build endpoint returning unsigned UserOp skeleton
  - userOpRoutes factory with OpenAPI spec
  - @waiaas/core UserOp schema exports
affects: [340-userop-sign-api, 341-interface-integration]

tech-stack:
  added: []
  patterns: [EntryPoint v0.7 nonce via publicClient.readContract, SmartAccount.encodeCalls for callData, factory detection via getCode + getFactoryArgs]

key-files:
  created:
    - packages/daemon/src/api/routes/userop.ts
    - packages/daemon/src/__tests__/userop-build-api.test.ts
  modified:
    - packages/core/src/index.ts
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/server.ts

key-decisions:
  - "D6: Nonce read from EntryPoint v0.7 readContract (no Bundler dependency)"
  - "D7: releaseKey takes Uint8Array privateKey, not walletId string"
  - "D8: Factory detection: getCode on-chain check before getFactoryArgs, update deployed=true in DB"

patterns-established:
  - "UserOp route pattern: load wallet -> validate smart+evm -> resolve RPC -> decrypt key -> create SmartAccount -> build callData -> persist build -> return skeleton"

requirements-completed: [BUILD-01, BUILD-02, BUILD-03, BUILD-04, BUILD-05, BUILD-06, BUILD-07, BUILD-08, BUILD-09, BUILD-10, BUILD-11]

duration: 6min
completed: 2026-03-06
---

# Phase 339 Plan 01: UserOp Build Endpoint Summary

**POST /v1/wallets/:id/userop/build returns unsigned ERC-4337 v0.7 UserOp skeleton with sender/nonce/callData/entryPoint/buildId, factory detection for undeployed accounts, and 10-min TTL persistence**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-06T09:01:09Z
- **Completed:** 2026-03-06T09:07:30Z
- **Tasks:** 1 (TDD: RED+GREEN)
- **Files modified:** 5

## Accomplishments
- Created POST /v1/wallets/:id/userop/build endpoint with OpenAPI spec
- TransactionRequest (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL) correctly converted to callData via buildUserOpCalls + SmartAccount.encodeCalls
- Nonce read from EntryPoint v0.7 contract via publicClient.readContract (no Bundler dependency)
- Factory detection: undeployed accounts include factory/factoryData, deployed status auto-detected via getCode
- Solana/EOA wallets rejected with ACTION_VALIDATION_FAILED
- Build data persisted to userop_builds table with 10-min TTL
- No gas/paymaster fields in response (platform fills those)

## Task Commits

1. **Task 1: POST /v1/wallets/:id/userop/build endpoint** - `5901f139` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/userop.ts` - UserOp Build route with OpenAPI spec
- `packages/daemon/src/__tests__/userop-build-api.test.ts` - 14 tests for build endpoint
- `packages/core/src/index.ts` - Export UserOp schemas from @waiaas/core
- `packages/daemon/src/api/routes/index.ts` - Barrel export for userOpRoutes
- `packages/daemon/src/api/server.ts` - Wire userOpRoutes into app

## Decisions Made
- D6: Nonce read from EntryPoint v0.7 readContract (no Bundler dependency) -- avoids requiring bundler provider for Lite mode
- D7: releaseKey takes Uint8Array privateKey (not walletId) -- matches LocalKeyStore.releaseKey signature for guarded memory zero-fill
- D8: Factory detection uses on-chain getCode before getFactoryArgs, updates deployed=true in DB when bytecode found

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] UserOp schemas not exported from @waiaas/core index**
- **Found during:** Task 1 (test RED phase)
- **Issue:** UserOpBuildRequestSchema defined in core/schemas but not re-exported from core/index.ts
- **Fix:** Added all 5 UserOp schema exports + types to core/src/index.ts
- **Files modified:** packages/core/src/index.ts
- **Verification:** Tests import and use schemas successfully
- **Committed in:** 5901f139

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for correct module access. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Build endpoint complete and functional
- Build data persisted with TTL for 339-02 cleanup worker
- Ready for Plan 339-02: Build data cleanup worker

---
*Phase: 339-userop-build-api*
*Completed: 2026-03-06*
