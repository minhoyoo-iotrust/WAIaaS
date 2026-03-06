---
phase: 336-nft-transfer-approval-pipeline
plan: 02
subsystem: pipeline, api, policy
tags: [nft, approve, erc721, erc1155, metaplex, policy, contract-whitelist, rate-limit, approval-tier]

requires:
  - phase: 333-nft-foundation
    provides: ApproveRequestSchema nft field, NftApproveParams
  - phase: 334-indexer-chain-adapter
    provides: IChainAdapter.approveNft, NftApproveParams
  - phase: 336-nft-transfer-approval-pipeline/01
    provides: ERC721_USEROP_ABI, ERC1155_USEROP_ABI, buildUserOpCalls walletAddress param
provides:
  - APPROVE+nft routing to adapter.approveNft in buildByType and buildUserOpCalls
  - CONTRACT_WHITELIST evaluation for NFT_TRANSFER
  - NFT_TRANSFER default tier APPROVAL
  - GET /wallet/nfts/:tokenIdentifier/approvals API route
  - nftApprovalRoutes exported from route index
affects: [337-interface-integration]

tech-stack:
  added: []
  patterns: [NFT approval dispatch via nft field presence, on-chain approval status query]

key-files:
  created:
    - packages/daemon/src/api/routes/nft-approvals.ts
    - packages/daemon/src/__tests__/nft-approval-policy.test.ts
    - packages/daemon/src/__tests__/nft-approval-api.test.ts
  modified:
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/pipeline/database-policy-engine.ts
    - packages/daemon/src/api/routes/index.ts

key-decisions:
  - "APPROVE+nft: amount=0 means single token approve, amount!=0 means setApprovalForAll"
  - "CONTRACT_WHITELIST now evaluates both CONTRACT_CALL and NFT_TRANSFER"
  - "NFT_TRANSFER default tier APPROVAL with try/catch for unregistered settings key"
  - "nft-approvals.ts as separate route file from nfts.ts for separation of concerns"

patterns-established:
  - "NFT approval routing: nft field presence on APPROVE request triggers approveNft adapter path"
  - "Token identifier parsing: supports both CAIP-19 and {address}-{tokenId} formats"

requirements-completed: [NFTA-01, NFTA-02, NFTA-03, NFTA-05, PLCY-01, PLCY-02, PLCY-03]

duration: 4min
completed: 2026-03-06
---

# Phase 336 Plan 02: NFT Approval + Policy Summary

**NFT approval routing (approve/setApprovalForAll/delegate), CONTRACT_WHITELIST for NFT_TRANSFER, default APPROVAL tier, and approval status query API**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-06T02:59:00Z
- **Completed:** 2026-03-06T03:04:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- APPROVE+nft routes to adapter.approveNft with single/all approval type distinction
- buildUserOpCalls encodes NFT approve/setApprovalForAll for Smart Account
- CONTRACT_WHITELIST policy now evaluates NFT_TRANSFER contract addresses
- NFT_TRANSFER default tier is APPROVAL (owner approval required)
- GET /wallet/nfts/:tokenIdentifier/approvals API route with CAIP-19 and address-tokenId parsing
- All 126 tests pass (16 new + 110 existing regression)

## Task Commits

1. **Task 1: APPROVE+nft routing + NFT policy evaluation** - `075c99d3` (feat)
2. **Task 2: NFT approval status query API** - `04704f8d` (feat)

## Files Created/Modified
- `packages/daemon/src/pipeline/stages.ts` - APPROVE+nft routing in buildByType and buildUserOpCalls
- `packages/daemon/src/pipeline/database-policy-engine.ts` - CONTRACT_WHITELIST for NFT_TRANSFER, default APPROVAL tier
- `packages/daemon/src/api/routes/nft-approvals.ts` - Approval status query route
- `packages/daemon/src/api/routes/index.ts` - Barrel export for nft-approvals
- `packages/daemon/src/__tests__/nft-approval-policy.test.ts` - 12 tests for approval routing + policy
- `packages/daemon/src/__tests__/nft-approval-api.test.ts` - 4 tests for approval API

## Decisions Made
- APPROVE amount=0 triggers single NFT approve, amount!=0 triggers setApprovalForAll (convention consistent with ERC-721 approve vs setApprovalForAll semantic)
- policy.nft_transfer_default_tier setting accessed with try/catch since setting key not yet registered (will be added in Phase 337 settings UI)
- Separate nft-approvals.ts route file rather than adding to nfts.ts for clean separation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SettingsService.get throws on unregistered setting key**
- **Found during:** Task 1 (policy evaluation test)
- **Issue:** `policy.nft_transfer_default_tier` not registered in settings definitions, causing WAIaaSError
- **Fix:** Wrapped SettingsService.get call in try/catch, defaulting to 'APPROVAL' when key not found
- **Files modified:** packages/daemon/src/pipeline/database-policy-engine.ts
- **Verification:** Test passes with APPROVAL tier default
- **Committed in:** 075c99d3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for correctness. No scope creep.

## Issues Encountered
- Pre-existing type errors in alchemy-nft-indexer.ts, helius-nft-indexer.ts, nfts.ts from Phase 334/335 -- out of scope

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All NFT pipeline + approval + policy features complete
- Ready for Phase 337 (MCP, SDK, Admin UI, skill files integration)
- Route mounting in server.ts deferred to Phase 337

---
*Phase: 336-nft-transfer-approval-pipeline*
*Completed: 2026-03-06*
