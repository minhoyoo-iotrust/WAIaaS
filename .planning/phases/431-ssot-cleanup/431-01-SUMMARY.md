---
phase: 431-ssot-cleanup
plan: 01
subsystem: infra
tags: [ssot, chain-constants, formatAmount, resolveRpcUrl, type-safety]

requires:
  - phase: 430-as-any-removal
    provides: typed patterns for RPC config
provides:
  - NATIVE_DECIMALS/NATIVE_SYMBOLS SSoT in @waiaas/core
  - nativeDecimals/nativeSymbol chain-aware helpers
  - resolveRpcUrl typed overload accepting RpcConfig
affects: [daemon pipeline, admin-wallets, balance-monitor, incoming-tx]

tech-stack:
  added: []
  patterns: [chain-constants SSoT, typed RPC config union]

key-files:
  created:
    - packages/core/src/utils/chain-constants.ts
  modified:
    - packages/core/src/utils/index.ts
    - packages/core/src/index.ts
    - packages/daemon/src/infrastructure/adapter-pool.ts
    - packages/daemon/src/infrastructure/config/loader.ts

key-decisions:
  - "NATIVE_DECIMALS keeps object lookup semantics (undefined for unknown chains) vs nativeDecimals() defaults to 18"
  - "resolveRpcUrl accepts Record<string, string> | RpcConfig union with internal cast for backward compat"
  - "formatAmount(bigint, decimals) replaces Number(x)/10**d for precision-safe balance display"

patterns-established:
  - "Chain constants SSoT: all NATIVE_DECIMALS/SYMBOLS must import from @waiaas/core"
  - "RpcConfig typed parameter: callers pass config.rpc directly without as unknown cast"

requirements-completed: [SSOT-01, SSOT-05, SSOT-06, SSOT-07]

duration: 15min
completed: 2026-03-16
---

# Phase 431 Plan 01: NATIVE_DECIMALS/NATIVE_SYMBOLS SSoT + formatAmount + resolveRpcUrl Summary

**Chain constants SSoT in @waiaas/core eliminates 5 local duplicates, formatAmount replaces 4 inline patterns, typed RpcConfig removes 22 as unknown casts**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-16T06:44:21Z
- **Completed:** 2026-03-16T06:59:00Z
- **Tasks:** 2
- **Files modified:** 21

## Accomplishments
- NATIVE_DECIMALS/NATIVE_SYMBOLS defined once in chain-constants.ts, imported by 5 daemon modules
- Balance formatting patterns replaced with formatAmount() for bigint precision
- resolveRpcUrl accepts RpcConfig union type, eliminating 22 as unknown casts across 10 files

## Task Commits

1. **Task 1: NATIVE_DECIMALS/NATIVE_SYMBOLS SSoT + formatAmount** - `6461ae7c` (feat)
2. **Task 2: resolveRpcUrl typed overload** - `8acc2704` (feat)

## Files Created/Modified
- `packages/core/src/utils/chain-constants.ts` - SSoT for NATIVE_DECIMALS, NATIVE_SYMBOLS, nativeDecimals(), nativeSymbol()
- `packages/core/src/utils/index.ts` - Re-export chain constants
- `packages/core/src/index.ts` - Re-export chain constants
- `packages/daemon/src/infrastructure/adapter-pool.ts` - resolveRpcUrl typed union
- `packages/daemon/src/infrastructure/config/loader.ts` - Export RpcConfig type
- 6 daemon pipeline files - Import from @waiaas/core instead of local definitions
- 10 API route/lifecycle files - Remove as unknown as Record casts

## Decisions Made
- NATIVE_DECIMALS used as object lookup (returns undefined for unknown) vs nativeDecimals() which defaults to 18
- Internal cast in resolveRpcUrl is safe since RpcConfig values are all strings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Extended resolveRpcUrl cast removal beyond plan scope**
- **Found during:** Task 2
- **Issue:** Plan listed 8 casts in 3 files but actual codebase had 22 casts across 10 files
- **Fix:** Removed all 22 casts for consistency
- **Files modified:** wallet.ts, rpc-proxy.ts, admin-actions.ts, actions.ts, server.ts (additional to plan)
- **Committed in:** 8acc2704

---

**Total deviations:** 1 auto-fixed (scope extension for completeness)
**Impact on plan:** Broader cleanup than planned, all type-safe.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Chain constants SSoT established, ready for SSoT invariant tests in Plan 03
- RpcConfig type available for future typed usage

---
*Phase: 431-ssot-cleanup*
*Completed: 2026-03-16*
