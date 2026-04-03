---
phase: 470-ssot-extension-db-migration
plan: 01
subsystem: infra
tags: [ripple, xrpl, chain-type, network-type, ssot, zod]

requires: []
provides:
  - "ripple ChainType in CHAIN_TYPES SSoT"
  - "RIPPLE_NETWORK_TYPES: xrpl-mainnet, xrpl-testnet, xrpl-devnet"
  - "ENVIRONMENT_NETWORK_MAP ripple:mainnet/testnet entries"
  - "NATIVE_DECIMALS ripple=6, NATIVE_SYMBOLS ripple=XRP"
  - "XRPL RPC defaults (wss:// WebSocket endpoints)"
affects: [471-adapter-package, 472-trust-line-token, 473-nft-integration]

tech-stack:
  added: []
  patterns:
    - "XRPL uses wss:// WebSocket for RPC (not https://)"
    - "ripple:mainnet single-network, ripple:testnet explicit selection"

key-files:
  created: []
  modified:
    - packages/shared/src/networks.ts
    - packages/shared/src/index.ts
    - packages/shared/src/__tests__/networks.test.ts
    - packages/core/src/enums/chain.ts
    - packages/core/src/utils/chain-constants.ts
    - packages/core/src/rpc/built-in-defaults.ts
    - packages/core/src/__tests__/enums.test.ts
    - packages/core/src/__tests__/rpc-pool-defaults.test.ts

key-decisions:
  - "XRPL uses wss:// WebSocket endpoints for RPC defaults (xrplcluster.com, s1/s2.ripple.com)"
  - "ripple:testnet is null in ENVIRONMENT_SINGLE_NETWORK (2 networks: testnet + devnet)"
  - "XRP SLIP-44 coin type = 144, decimals = 6 (drops)"

patterns-established:
  - "Ripple network naming: xrpl-{mainnet|testnet|devnet}"
  - "Ripple RPC config keys: xrpl_{mainnet|testnet|devnet}"

requirements-completed: [INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-08]

duration: 8min
completed: 2026-04-03
---

# Phase 470 Plan 01: Ripple ChainType/NetworkType SSoT Registration Summary

**Registered 'ripple' as 3rd ChainType with 3 XRPL NetworkTypes, environment mappings, native constants (6 decimals/XRP), and WebSocket RPC defaults**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-03T02:55:29Z
- **Completed:** 2026-04-03T03:03:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- ripple added to CHAIN_TYPES (now 3: solana, ethereum, ripple)
- XRPL networks (mainnet/testnet/devnet) added to NETWORK_TYPES (now 18)
- ENVIRONMENT_NETWORK_MAP, display names, native symbols, RPC defaults all extended
- NATIVE_DECIMALS ripple=6, NATIVE_SYMBOLS ripple=XRP in chain-constants
- Built-in XRPL WebSocket RPC endpoints (xrplcluster.com, ripple.com, rippletest.net)

## Task Commits

1. **Task 1: @waiaas/shared SSoT ripple ChainType/NetworkType** - `9374c44f` (feat)
2. **Task 2: @waiaas/core chain enum + constants + RPC defaults** - `e33e08b4` (feat)

## Files Created/Modified
- `packages/shared/src/networks.ts` - Added ripple to CHAIN_TYPES, XRPL networks, env map, display names
- `packages/shared/src/index.ts` - Re-export RIPPLE_NETWORK_TYPES, RippleNetworkType, RIPPLE_RPC_SETTING_KEYS
- `packages/core/src/enums/chain.ts` - Re-export ripple types, ENVIRONMENT_SINGLE_NETWORK, MAINNET_NETWORKS
- `packages/core/src/utils/chain-constants.ts` - NATIVE_DECIMALS/SYMBOLS for ripple
- `packages/core/src/rpc/built-in-defaults.ts` - XRPL WebSocket RPC endpoints

## Decisions Made
- XRPL uses wss:// WebSocket endpoints (not https://) per XRPL protocol requirements
- ripple:testnet=null in ENVIRONMENT_SINGLE_NETWORK because 2 networks exist (testnet + devnet)
- NATIVE_DECIMALS ripple=6 (1 XRP = 1,000,000 drops)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added shared index.ts re-exports for new Ripple types**
- **Found during:** Task 2 (core build failed)
- **Issue:** shared/src/index.ts did not re-export RIPPLE_NETWORK_TYPES, RippleNetworkType, RIPPLE_RPC_SETTING_KEYS
- **Fix:** Added re-exports to shared/src/index.ts
- **Files modified:** packages/shared/src/index.ts
- **Committed in:** e33e08b4

**2. [Rule 3 - Blocking] Added XRPL RPC defaults and updated test counts**
- **Found during:** Task 2 (core tests failed)
- **Issue:** BUILT_IN_RPC_DEFAULTS had no XRPL entries, test counts expected 15 networks
- **Fix:** Added wss:// XRPL endpoints, updated all test counts from 15 to 18
- **Files modified:** packages/core/src/rpc/built-in-defaults.ts, packages/core/src/__tests__/rpc-pool-defaults.test.ts
- **Committed in:** e33e08b4

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary to maintain test suite and build integrity with new chain type.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ripple ChainType fully recognized by Zod schemas, TypeScript types, environment mappings
- Ready for CAIP-2/CAIP-19 registration (Plan 470-02) and DB migration (Plan 470-03)

---
*Phase: 470-ssot-extension-db-migration*
*Completed: 2026-04-03*
