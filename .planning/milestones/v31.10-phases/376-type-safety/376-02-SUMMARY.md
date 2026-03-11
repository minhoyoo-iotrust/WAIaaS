---
phase: 376-type-safety
plan: 02
subsystem: api
tags: [typescript, type-safety, deduplication, caip-19, nft, type-guard]

requires: []
provides:
  - "Shared resolveChainId helper at daemon/helpers/resolve-chain-id.ts"
  - "CAIP19_REGEX single source of truth in core/caip/caip19.ts"
  - "INftApprovalQuery interface and hasNftApprovalQuery type guard in @waiaas/core"
affects: []

tech-stack:
  added: []
  patterns: ["Type guard pattern for optional adapter capabilities (INftApprovalQuery)"]

key-files:
  created:
    - packages/daemon/src/api/helpers/resolve-chain-id.ts
  modified:
    - packages/daemon/src/api/routes/actions.ts
    - packages/daemon/src/api/routes/admin-actions.ts
    - packages/core/src/caip/caip19.ts
    - packages/core/src/caip/index.ts
    - packages/core/src/schemas/policy.schema.ts
    - packages/core/src/interfaces/IChainAdapter.ts
    - packages/core/src/interfaces/index.ts
    - packages/core/src/index.ts
    - packages/daemon/src/api/routes/nft-approvals.ts

key-decisions:
  - "resolveChainId extracted to daemon/helpers/ (not core) since it is daemon-specific EVM chain ID mapping"
  - "INftApprovalQuery defined as separate interface (not added to IChainAdapter) since not all adapters support it"
  - "hasNftApprovalQuery uses Record<string, unknown> cast inside type guard body (avoids as any in call sites)"

patterns-established:
  - "Optional adapter capability: Define separate interface + type guard function, export from @waiaas/core"
  - "Regex SSoT: Define regex as exported const, import where needed (no inline duplication)"

requirements-completed: [TYPE-02, TYPE-03, TYPE-04]

duration: 8min
completed: 2026-03-11
---

# Phase 376 Plan 02: resolveChainId dedup, CAIP-19 regex dedup, NFT type guard Summary

**Unified resolveChainId into shared helper, CAIP19_REGEX into single constant, and replaced adapter as any with INftApprovalQuery type guard**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-11T08:31:28Z
- **Completed:** 2026-03-11T08:39:28Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- resolveChainId consolidated from 2 duplicate definitions to 1 shared helper
- CAIP19_REGEX extracted as exported constant, policy.schema.ts imports instead of duplicating
- INftApprovalQuery interface + hasNftApprovalQuery type guard eliminates as any in nft-approvals.ts
- All exports properly chained through core/interfaces/index.ts and core/index.ts

## Task Commits

Each task was committed atomically:

1. **Task 1+2: resolveChainId + CAIP-19 + NFT type guard** - `a2fc8dd8` (refactor)

## Files Created/Modified
- `packages/daemon/src/api/helpers/resolve-chain-id.ts` - New shared helper for EVM chain ID resolution
- `packages/daemon/src/api/routes/actions.ts` - Removed local resolveChainId, added import
- `packages/daemon/src/api/routes/admin-actions.ts` - Removed local resolveChainId, added import
- `packages/core/src/caip/caip19.ts` - Extracted CAIP19_REGEX as exported constant
- `packages/core/src/caip/index.ts` - Added CAIP19_REGEX re-export
- `packages/core/src/schemas/policy.schema.ts` - Import CAIP19_REGEX instead of local duplicate
- `packages/core/src/interfaces/IChainAdapter.ts` - Added INftApprovalQuery interface and hasNftApprovalQuery type guard
- `packages/core/src/interfaces/index.ts` - Added INftApprovalQuery and hasNftApprovalQuery exports
- `packages/core/src/index.ts` - Added CAIP19_REGEX, hasNftApprovalQuery, INftApprovalQuery exports
- `packages/daemon/src/api/routes/nft-approvals.ts` - Replaced (adapter as any) with hasNftApprovalQuery type guard

## Decisions Made
- resolveChainId placed in daemon/helpers/ (not core) since it is daemon-specific routing logic
- INftApprovalQuery as separate interface (not extending IChainAdapter) since it is optional capability
- Type guard body uses Record<string, unknown> instead of as any for internal check

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 376 complete, all type safety improvements applied
- Phase 377 (large file splitting) ready to execute independently

---
*Phase: 376-type-safety*
*Completed: 2026-03-11*
