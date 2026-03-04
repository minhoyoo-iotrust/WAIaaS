---
phase: 321-eip712-approval-wallet-linking
plan: 01
subsystem: auth
tags: [eip-712, walletconnect, viem, approval-workflow, typed-data, erc-8004]

requires:
  - phase: 320-reputation-policy-cache
    provides: ReputationCacheService, REPUTATION_THRESHOLD policy
  - phase: 317-foundation
    provides: DB v39 with pending_approvals.approval_type column

provides:
  - buildAgentWalletSetTypedData EIP-712 typed data helper
  - ApprovalWorkflow.requestApproval with approvalType/typedDataJson
  - ApprovalWorkflow.getApprovalInfo for EIP-712/SIWE detection
  - WcSigningBridge eth_signTypedData_v4 support with recoverTypedDataAddress
  - ApprovalChannelRouter EIP-712 constraint (WC/REST only)
  - DB v40 migration (typed_data_json column)
  - PipelineContext.eip712Metadata for stage4Wait routing

affects: [321-02, 322-01, 322-02, 323-02]

tech-stack:
  added: []
  patterns:
    - "EIP-712 typed data construction via buildAgentWalletSetTypedData"
    - "approval_type routing in WcSigningBridge (EIP712 vs SIWE)"
    - "EIP-712 channel constraint in ApprovalChannelRouter"

key-files:
  created:
    - packages/daemon/src/services/erc8004/eip712-typed-data.ts
    - packages/daemon/src/__tests__/eip712-approval.test.ts
  modified:
    - packages/daemon/src/workflow/approval-workflow.ts
    - packages/daemon/src/services/wc-signing-bridge.ts
    - packages/daemon/src/services/signing-sdk/approval-channel-router.ts
    - packages/daemon/src/services/signing-sdk/sign-request-builder.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/services/erc8004/index.ts

key-decisions:
  - "EIP-712 typed data stored as JSON string in pending_approvals.typed_data_json (nullable, only EIP712)"
  - "WcSigningBridge uses recoverTypedDataAddress for EIP-712 verification (not manual hashTypedData)"
  - "ApprovalChannelRouter short-circuits EIP-712 to WC/REST before explicit method check"
  - "PipelineContext.eip712Metadata propagates typed data from actions route to stage4Wait"
  - "DB v40 is a simple ALTER TABLE ADD COLUMN (no table recreation needed)"

patterns-established:
  - "EIP-712 approval type routing: approvalType field flows from actions -> pipeline -> workflow -> signing bridge"
  - "getApprovalInfo pattern: query pending_approvals for signing method detection"

requirements-completed: [IDEN-02]

duration: 8min
completed: 2026-03-04
---

# Phase 321 Plan 01: EIP-712 Typed Data + ApprovalWorkflow + WcSigningBridge Summary

**EIP-712 AgentWalletSet typed data helper with dual approval routing (SIWE/EIP712) across ApprovalWorkflow, WcSigningBridge, and ApprovalChannelRouter**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-04T09:53:28Z
- **Completed:** 2026-03-04T10:01:30Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- buildAgentWalletSetTypedData constructs complete EIP-712 typed data (4-field AgentWalletSet struct) for viem signTypedData/recoverTypedDataAddress
- ApprovalWorkflow extended with approvalType/typedDataJson options and getApprovalInfo query method
- WcSigningBridge detects EIP712 approvals and uses eth_signTypedData_v4 instead of personal_sign, verifying via recoverTypedDataAddress
- ApprovalChannelRouter restricts EIP-712 to walletconnect/rest channels only (SDK channels cannot handle structured signing)
- DB v40 migration adds typed_data_json column to pending_approvals
- 10 new tests covering typed data construction, approval storage, WC routing, signature verification, and channel routing constraint

## Task Commits

1. **Task 1: EIP-712 typed data helper + ApprovalWorkflow + WcSigningBridge + approve endpoint** - `88c8e111` (feat)
2. **Task 2: Build verification + existing test regression check** - `f0bc2e24` (test)

## Files Created/Modified
- `packages/daemon/src/services/erc8004/eip712-typed-data.ts` - EIP-712 domain, types, message builder for AgentWalletSet
- `packages/daemon/src/services/erc8004/index.ts` - Barrel export for EIP-712 helpers
- `packages/daemon/src/workflow/approval-workflow.ts` - approvalType/typedDataJson in requestApproval + getApprovalInfo
- `packages/daemon/src/services/wc-signing-bridge.ts` - EIP-712 request handling + recoverTypedDataAddress verification
- `packages/daemon/src/services/signing-sdk/approval-channel-router.ts` - EIP-712 channel constraint (WC/REST only)
- `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` - approvalType field in BuildRequestParams
- `packages/daemon/src/pipeline/stages.ts` - PipelineContext.eip712Metadata + stage4Wait EIP-712 routing
- `packages/daemon/src/infrastructure/database/schema.ts` - typedDataJson column in pendingApprovals
- `packages/daemon/src/infrastructure/database/migrate.ts` - v40 migration for typed_data_json
- `packages/daemon/src/__tests__/eip712-approval.test.ts` - 10 tests for EIP-712 approval flow
- `packages/daemon/src/__tests__/wc-signing-bridge.test.ts` - Updated mock with getApprovalInfo
- `packages/daemon/src/__tests__/migration-chain.test.ts` - Updated version assertions for v40

## Decisions Made
- EIP-712 typed data stored as JSON string in `typed_data_json` column (nullable, only populated for EIP712 approvals)
- WcSigningBridge uses viem `recoverTypedDataAddress` for verification (not manual hashTypedData)
- ApprovalChannelRouter short-circuits EIP-712 to WC/REST before checking explicit approval method
- DB v40 is a simple ALTER TABLE ADD COLUMN (no table recreation needed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added getApprovalInfo to existing WcSigningBridge test mock**
- **Found during:** Task 2 (regression check)
- **Issue:** Existing wc-signing-bridge tests failed because mock lacked getApprovalInfo method
- **Fix:** Added `getApprovalInfo: vi.fn().mockReturnValue(undefined)` to createMockApprovalWorkflow
- **Files modified:** packages/daemon/src/__tests__/wc-signing-bridge.test.ts
- **Verification:** All 32 existing tests pass
- **Committed in:** f0bc2e24 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for backward compatibility. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EIP-712 infrastructure complete, ready for Plan 321-02 (set_agent_wallet integration + calldata re-encoding)
- buildAgentWalletSetTypedData and getApprovalInfo are the key interfaces for Plan 321-02

---
*Phase: 321-eip712-approval-wallet-linking*
*Completed: 2026-03-04*
