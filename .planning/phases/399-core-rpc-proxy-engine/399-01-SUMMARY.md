---
phase: 399-core-rpc-proxy-engine
plan: 01
subsystem: rpc-proxy
tags: [json-rpc, evm, transaction-adapter, protocol]

requires:
  - phase: 398-type-system-infra-foundation
    provides: CONTRACT_DEPLOY Zod SSoT, EVM_CHAIN_ID_TO_NETWORK

provides:
  - JSON-RPC 2.0 protocol utilities (parse, response builders, error codes)
  - RpcTransactionAdapter (eth_sendTransaction params to WAIaaS TransactionRequest)
  - toHexChainId and hexToDecimal utility functions

affects: [399-02, 399-03, 400-route-assembly]

tech-stack:
  added: []
  patterns: [json-rpc-2.0-protocol, erc20-selector-classification]

key-files:
  created:
    - packages/daemon/src/rpc-proxy/json-rpc.ts
    - packages/daemon/src/rpc-proxy/tx-adapter.ts
    - packages/daemon/src/__tests__/rpc-proxy/json-rpc.test.ts
    - packages/daemon/src/__tests__/rpc-proxy/tx-adapter.test.ts

key-decisions:
  - "ABI decoding inline (no viem dependency) for ERC-20 transfer/approve selectors"
  - "transferFrom (0x23b872dd) falls through to CONTRACT_CALL per Pitfall 14"
  - "Notification detection: undefined id (not null) per JSON-RPC 2.0 spec"

patterns-established:
  - "JSON-RPC response mutual exclusivity: result OR error, never both"
  - "ERC-20 selector-based classification matches tx-parser.ts constants"

requirements-completed: [RPC-03, RPC-04, SIGN-01]

duration: 12min
completed: 2026-03-13
---

# Plan 399-01: JSON-RPC 2.0 Protocol Utilities + RpcTransactionAdapter Summary

**JSON-RPC 2.0 protocol layer with single/batch parsing, 5-type transaction classification from eth_sendTransaction params, and hex chain ID utilities**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-13T11:56:37Z
- **Completed:** 2026-03-13T12:08:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- JSON-RPC 2.0 protocol utilities: parse single/batch requests, build success/error responses with id type preservation, notification detection
- RpcTransactionAdapter classifies eth_sendTransaction params into 5 WAIaaS transaction types (TRANSFER, TOKEN_TRANSFER, APPROVE, CONTRACT_CALL, CONTRACT_DEPLOY)
- toHexChainId and hexToDecimal utility functions for JSON-RPC responses
- 40 tests covering all protocol edge cases

## Task Commits

1. **Task 1: JSON-RPC 2.0 Protocol Utilities** - `bfdc761c` (feat)
2. **Task 2: RpcTransactionAdapter** - `7ed36d06` (feat)

## Files Created/Modified
- `packages/daemon/src/rpc-proxy/json-rpc.ts` - JSON-RPC 2.0 types, parse, response builders, error codes
- `packages/daemon/src/rpc-proxy/tx-adapter.ts` - EthTransactionParams to WAIaaS TransactionRequest conversion
- `packages/daemon/src/__tests__/rpc-proxy/json-rpc.test.ts` - 22 protocol tests
- `packages/daemon/src/__tests__/rpc-proxy/tx-adapter.test.ts` - 18 adapter tests

## Decisions Made
- Inline ABI decoding for ERC-20 selectors (no viem dependency at this layer)
- transferFrom (0x23b872dd) intentionally falls through to CONTRACT_CALL per Pitfall 14

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Protocol utilities and transaction adapter ready for RpcMethodHandlers (399-03) and RpcDispatcher (Phase 400)

---
*Phase: 399-core-rpc-proxy-engine*
*Completed: 2026-03-13*
