---
phase: 471-adapter-package-native-xrp-transfer
plan: 01
subsystem: chain-adapter
tags: [xrpl, ripple, xrp, adapter, websocket, ed25519, keystore]

requires:
  - phase: 470-ssot-extension-db-migration
    provides: ripple ChainType/NetworkType/CAIP registration and DB v62

provides:
  - "@waiaas/adapter-ripple package with RippleAdapter implementing IChainAdapter"
  - "Address utilities for X-address decode, r-address validation, drops/XRP conversion"
  - "Transaction parser for XRPL Payment/TrustSet types"
  - "KeyStore ripple branch for Ed25519 keypair + r-address derivation"
  - "XRPL WebSocket RPC config.toml defaults"

affects: [471-02, 472, 473, adapter-pool, keystore]

tech-stack:
  added: [xrpl v4.x, ripple-keypairs v2.x]
  patterns: [xrpl.Client WebSocket RPC, drops bigint conversion, X-address decode]

key-files:
  created:
    - packages/adapters/ripple/package.json
    - packages/adapters/ripple/src/adapter.ts
    - packages/adapters/ripple/src/address-utils.ts
    - packages/adapters/ripple/src/tx-parser.ts
    - packages/adapters/ripple/src/index.ts
    - packages/adapters/ripple/tsconfig.json
    - packages/adapters/ripple/tsconfig.build.json
    - packages/adapters/ripple/vitest.config.ts
  modified:
    - packages/daemon/src/infrastructure/keystore/keystore.ts
    - packages/daemon/src/infrastructure/config/loader.ts

key-decisions:
  - "Used xrpl.Client WebSocket for RPC (native XRPL transport, not HTTP)"
  - "Wallet.fromEntropy with ECDSA.ed25519 for signing (matches KeyStore Ed25519 seed storage)"
  - "Reserve values fetched from server_info, not hardcoded (XRP-09 compliance)"
  - "Fee safety margin: (baseFee * 120n) / 100n bigint arithmetic per project convention"
  - "KeyStore stores 32-byte Ed25519 seed (not full 64-byte secret key) with ED-prefixed public key hex for ripple-keypairs"

patterns-established:
  - "XRPL adapter: JSON serialization for UnsignedTransaction (TextEncoder/TextDecoder)"
  - "Destination Tag parsed from memo field (numeric string or JSON with destinationTag)"
  - "X-address auto-decode throughout adapter methods"

requirements-completed: [ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-04, ADAPT-06, XRP-02, XRP-05, XRP-06, XRP-09, XRP-10]

duration: 8min
completed: 2026-04-03
---

# Phase 471 Plan 01: Package Scaffold + Core Adapter Summary

**@waiaas/adapter-ripple package with RippleAdapter (25 IChainAdapter methods), KeyStore ripple Ed25519 key generation, and XRPL WebSocket RPC config**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-03T04:19:39Z
- **Completed:** 2026-04-03T04:28:00Z
- **Tasks:** 2 (combined into 1 commit since adapter.ts was part of scaffold)
- **Files modified:** 11

## Accomplishments
- Created @waiaas/adapter-ripple package with xrpl v4.x dependency
- Implemented RippleAdapter with all 25 IChainAdapter methods (connection, balance, fee, nonce, full tx pipeline, unsupported stubs)
- Added address-utils for X-address decode, r-address validation, drops/XRP conversion
- Added tx-parser for XRPL transaction parsing (Payment native/IOU, TrustSet, unknown)
- Added KeyStore ripple branch: Ed25519 keypair via sodium + ripple-keypairs r-address derivation
- Added XRPL WebSocket RPC defaults to config.toml (mainnet/testnet/devnet)

## Task Commits

1. **Task 1+2: Package scaffold + RippleAdapter class** - `e67f7378` (feat)

## Files Created/Modified
- `packages/adapters/ripple/package.json` - Package definition with xrpl + ripple-keypairs deps
- `packages/adapters/ripple/src/adapter.ts` - RippleAdapter implementing all 25 IChainAdapter methods
- `packages/adapters/ripple/src/address-utils.ts` - X-address decode, drops/XRP conversion
- `packages/adapters/ripple/src/tx-parser.ts` - XRPL transaction parser for sign-only
- `packages/adapters/ripple/src/index.ts` - Package exports
- `packages/daemon/src/infrastructure/keystore/keystore.ts` - Added ripple key generation branch
- `packages/daemon/src/infrastructure/config/loader.ts` - Added xrpl_mainnet/testnet/devnet RPC entries

## Decisions Made
- Combined Plan 01 Task 1 (scaffold) and Task 2 (adapter class) into a single commit since adapter.ts was created as part of the initial scaffold
- Used ECDSA.ed25519 from xrpl for Wallet.fromEntropy algorithm parameter
- Typed submit/tx response results as `unknown` then cast to Record to avoid strict xrpl type conflicts with generic record access

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed ECDSA enum import for Wallet.fromEntropy**
- **Found during:** Task 2 (adapter build)
- **Issue:** String literal 'ed25519' not assignable to ECDSA enum type
- **Fix:** Imported ECDSA from 'xrpl' and used ECDSA.ed25519
- **Files modified:** packages/adapters/ripple/src/adapter.ts
- **Verification:** Build passes
- **Committed in:** e67f7378

**2. [Rule 3 - Blocking] Fixed xrpl submit/tx response type casting**
- **Found during:** Task 2 (adapter build)
- **Issue:** xrpl response types don't have index signature, can't cast to Record<string, unknown> directly
- **Fix:** Cast through `unknown` first, then to Record<string, unknown>
- **Files modified:** packages/adapters/ripple/src/adapter.ts
- **Verification:** Build passes
- **Committed in:** e67f7378

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both were type-system issues resolved during build verification. No scope change.

## Issues Encountered
None beyond the type fixes documented above.

## Next Phase Readiness
- RippleAdapter is fully implemented with all pipeline methods
- Plan 471-02 will wire AdapterPool integration and add unit tests
- Phase 472 will implement Trust Line token support (buildTokenTransfer, getTokenInfo, buildApprove)
- Phase 473 will implement XLS-20 NFT support

---
*Phase: 471-adapter-package-native-xrp-transfer*
*Completed: 2026-04-03*
