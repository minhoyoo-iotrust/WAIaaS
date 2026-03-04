---
phase: 321-eip712-approval-wallet-linking
plan: 02
subsystem: actions
tags: [eip-712, erc-8004, calldata-re-encoding, wallet-linking, pipeline]

requires:
  - phase: 321-01
    provides: ApprovalWorkflow EIP-712 support, DB v40 typed_data_json, PipelineContext.eip712Metadata

provides:
  - Eip712Metadata interface in Erc8004ActionProvider resolve output
  - Actions route EIP-712 metadata extraction and pipeline propagation
  - executeFromStage5 calldata re-encoding with real Owner EIP-712 signature
  - resolveChainId helper for EVM network-to-chainId mapping
  - End-to-end set_agent_wallet EIP-712 flow

affects: [322-01, 322-02, 323-02]

tech-stack:
  added: []
  patterns:
    - "EIP-712 metadata passthrough from action resolve to pipeline context"
    - "Calldata re-encoding on approval (placeholder to real signature)"
    - "Owner address and chainId enrichment from wallet DB"

key-files:
  created:
    - packages/daemon/src/__tests__/eip712-wallet-linking.test.ts
  modified:
    - packages/actions/src/providers/erc8004/index.ts
    - packages/actions/src/index.ts
    - packages/daemon/src/api/routes/actions.ts
    - packages/daemon/src/lifecycle/daemon.ts

key-decisions:
  - "Eip712Metadata interface defined in @waiaas/actions (co-located with provider) and re-exported"
  - "Owner address enrichment happens in actions route (wallet.ownerAddress from DB)"
  - "ChainId resolution via resolveChainId helper mapping network string to numeric ID"
  - "Calldata re-encoding in executeFromStage5 reads typed_data_json + owner_signature from pending_approvals"
  - "EIP-712 metadata attached as 'eip712' property on ContractCallRequest (extra property survives Zod parse strip in direct resolve)"

patterns-established:
  - "Cross-package EIP-712 metadata: actions provider returns eip712 -> daemon route extracts -> pipeline context -> approval workflow -> re-encode on resume"

requirements-completed: [IDEN-02, IDEN-03]

duration: 6min
completed: 2026-03-04
---

# Phase 321 Plan 02: set_agent_wallet EIP-712 Integration + Pipeline Calldata Re-encoding Summary

**EIP-712 wallet linking with Owner signature injection: resolve returns typed data metadata, pipeline propagates to approval, executeFromStage5 re-encodes calldata with real signature**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-04T10:02:00Z
- **Completed:** 2026-03-04T10:12:17Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Erc8004ActionProvider.resolveSetAgentWallet now returns ContractCallRequest with eip712 metadata (approvalType, typedDataJson, agentId, newWallet, deadline)
- Actions route extracts eip712 metadata from resolve result, enriches with ownerAddress and chainId from wallet DB, and attaches to PipelineContext
- executeFromStage5 re-encodes setAgentWallet calldata with real Owner EIP-712 signature before stage5Execute
- resolveChainId helper maps 10+ EVM networks to numeric chain IDs
- 5 new tests: resolve metadata, approval propagation, calldata re-encoding, SIWE unchanged, unset_agent_wallet
- Full regression: typecheck 16/16, ERC-8004 provider 44/44, pipeline stage4 14/14, EIP-712 approval 10/10

## Task Commits

1. **Task 1: set_agent_wallet EIP-712 integration + pipeline calldata re-encoding** - `d5d5c1b0` (feat)
2. **Task 2: Build verification + full regression test** - No code changes (verification-only)

## Files Created/Modified
- `packages/actions/src/providers/erc8004/index.ts` - Eip712Metadata interface, resolveSetAgentWallet returns eip712 metadata with typed data JSON
- `packages/actions/src/index.ts` - Re-export Eip712Metadata type
- `packages/daemon/src/api/routes/actions.ts` - EIP-712 metadata extraction, ownerAddress/chainId enrichment, PipelineContext propagation, resolveChainId helper, ActionRouteDeps extended with wcSigningBridgeRef/approvalChannelRouter/eventBus
- `packages/daemon/src/lifecycle/daemon.ts` - executeFromStage5 calldata re-encoding: reads approval_type/typed_data_json/owner_signature, re-encodes setAgentWallet with real signature via viem encodeFunctionData
- `packages/daemon/src/__tests__/eip712-wallet-linking.test.ts` - 5 integration tests for wallet linking EIP-712 flow

## Decisions Made
- Eip712Metadata defined in @waiaas/actions package (co-located with the provider that produces it)
- Owner address resolved from wallet.ownerAddress in the actions route, not in the actions provider
- ChainId resolved from network string using a static mapping (resolveChainId helper)
- Calldata re-encoding happens in executeFromStage5 (when pipeline resumes after approval), not in the approve handler
- ActionRouteDeps extended with WC/channel router refs for future direct EIP-712 signing in actions route

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @waiaas/actions package rebuild required for tests**
- **Found during:** Task 1 (test execution)
- **Issue:** Test imported Erc8004ActionProvider from @waiaas/actions but built artifacts did not include eip712 metadata changes
- **Fix:** Ran `pnpm turbo run build --filter=@waiaas/actions` before test execution
- **Impact:** No code change needed, just build step

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal. Build step is standard for cross-package changes.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Verification Results
- Typecheck: 16/16 packages pass
- EIP-712 approval tests (321-01): 10/10 pass
- EIP-712 wallet linking tests (321-02): 5/5 pass
- ERC-8004 provider tests: 44/44 pass (no regressions)
- Pipeline stage4 tests: 14/14 pass (no regressions)

## Next Phase Readiness
- Full EIP-712 wallet linking flow is operational
- set_agent_wallet: action -> QUEUED -> Owner signs EIP-712 -> approve -> re-encode calldata -> Stage 5 submit
- unset_agent_wallet: standard SIWE APPROVAL tier (no EIP-712)
- Ready for Phase 322 (MCP + Admin integration)

## Self-Check: PASSED

All 7 files verified present. All 3 commits (88c8e111, f0bc2e24, d5d5c1b0) verified in git log.

---
*Phase: 321-eip712-approval-wallet-linking*
*Completed: 2026-03-04*
