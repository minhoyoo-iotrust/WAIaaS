---
phase: 390-pipeline-routing-query-api
plan: 01
subsystem: pipeline
tags: [signedData, signedHttp, kind-routing, audit, external-action, tdd]

requires:
  - phase: 387-signer-capability-registry
    provides: ISignerCapabilityRegistry.resolve() for auto-selecting signer by scheme
  - phase: 388-credential-vault
    provides: ICredentialVault.get() for credential decryption
  - phase: 389-tracking-policy-extension
    provides: VENUE_WHITELIST + ACTION_CATEGORY_LIMIT policy evaluation

provides:
  - executeSignedDataAction pipeline function (credential -> policy -> DB -> sign -> track -> audit)
  - executeSignedHttpAction pipeline function (sign -> provider.execute() callback -> audit)
  - Kind-based routing in POST /v1/actions/:provider/:action
  - ACTION_SIGNED + ACTION_HTTP_SIGNED audit event types

affects: [390-02-query-api, 391-admin-ui, 392-mcp-sdk]

tech-stack:
  added: []
  patterns: [kind-based-pipeline-routing, external-action-pipeline-deps]

key-files:
  created:
    - packages/daemon/src/pipeline/external-action-pipeline.ts
    - packages/daemon/src/__tests__/external-action-pipeline.test.ts
  modified:
    - packages/core/src/schemas/audit.schema.ts
    - packages/core/src/__tests__/schemas/audit.schema.test.ts
    - packages/daemon/src/api/routes/actions.ts
    - packages/daemon/src/infrastructure/action/action-provider-registry.ts

key-decisions:
  - "signedData/signedHttp results skip ContractCallRequestSchema.parse() in executeResolve and pass through with kind field preserved"
  - "Off-chain actions use type=CONTRACT_CALL + toAddress=external:{venue} for DB compatibility with existing transaction queries"
  - "keyStore.decryptPrivateKey/releaseKey with try/finally pattern ensures key cleanup even on error"
  - "Policy evaluation uses type=TRANSFER to avoid CONTRACT_WHITELIST default-deny interference"

patterns-established:
  - "Kind-based routing: resolve result with kind field routes to external pipeline, without kind falls through to existing 6-stage pipeline"
  - "ExternalActionPipelineDeps: standardized dependency injection for off-chain action execution"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06]

duration: 8min
completed: 2026-03-12
---

# Phase 390 Plan 01: signedData/signedHttp Pipeline + Kind-Based Routing Summary

**Two off-chain pipeline functions (signedData/signedHttp) with kind-based routing in actions.ts, credential/policy/sign/track/audit flow, and 2 new audit events**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-12T05:12:00Z
- **Completed:** 2026-03-12T05:24:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- executeSignedDataAction: credential decrypt -> policy evaluate -> DB insert -> signer sign -> tracking enroll -> audit log
- executeSignedHttpAction: sign -> provider.execute() callback -> tracking -> audit log
- Kind-based routing in POST /v1/actions/:provider/:action (signedData/signedHttp to new pipeline, contractCall to existing)
- ACTION_SIGNED + ACTION_HTTP_SIGNED audit event types (24 -> 26)
- executeResolve preserves kind field for signedData/signedHttp (skip ContractCallRequestSchema validation)
- keyStore.releaseKey() always called in finally block
- 24 tests passing (11 pipeline + 13 existing api-actions backward compat)

## Task Commits

1. **Task 1: executeSignedDataAction + executeSignedHttpAction + audit events** - `f154d5e0` (feat)
2. **Task 2: kind-based routing in actions.ts + executeResolve** - `08c97822` (feat)

## Files Created/Modified
- `packages/daemon/src/pipeline/external-action-pipeline.ts` - 2 pipeline functions + SigningParams builders
- `packages/daemon/src/__tests__/external-action-pipeline.test.ts` - 11 tests
- `packages/core/src/schemas/audit.schema.ts` - ACTION_SIGNED + ACTION_HTTP_SIGNED events
- `packages/core/src/__tests__/schemas/audit.schema.test.ts` - Updated count 24->26, 2 new parse tests
- `packages/daemon/src/api/routes/actions.ts` - Kind-based routing + credentialVault/signerRegistry deps
- `packages/daemon/src/infrastructure/action/action-provider-registry.ts` - Preserve kind field in executeResolve

## Decisions Made
- signedData/signedHttp bypass ContractCallRequestSchema.parse() in executeResolve
- Off-chain actions stored as CONTRACT_CALL type with toAddress=external:{venue}
- try/finally pattern for keyStore.decryptPrivateKey/releaseKey
- Policy evaluation uses TRANSFER type to avoid CONTRACT_WHITELIST default-deny

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed keyStore method name: getPrivateKey -> decryptPrivateKey**
- **Found during:** Task 1 typecheck
- **Issue:** Plan referenced getPrivateKey but actual LocalKeyStore API uses decryptPrivateKey
- **Fix:** Changed to decryptPrivateKey in pipeline and tests
- **Files modified:** external-action-pipeline.ts, external-action-pipeline.test.ts

**2. [Rule 3 - Blocking] Added chain field to transactions INSERT**
- **Found during:** Task 2 typecheck
- **Issue:** transactions.chain is notNull() -- INSERT without chain fails type check
- **Fix:** Added chain: deps.wallet.chain to both INSERT blocks
- **Files modified:** external-action-pipeline.ts

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both essential for type safety. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Pipeline functions ready for Plan 390-02 (query API + connect-info)
- Both pipeline functions available for Plan 391 (Admin UI) and Plan 392 (MCP/SDK)

---
*Phase: 390-pipeline-routing-query-api*
*Completed: 2026-03-12*
