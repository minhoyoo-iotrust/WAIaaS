---
phase: 399-core-rpc-proxy-engine
plan: 03
subsystem: rpc-proxy
tags: [passthrough, method-handlers, signing, personal-sign, typed-data, rpc-pool]

requires:
  - phase: 399-core-rpc-proxy-engine/01
    provides: JSON-RPC protocol utilities, RpcTransactionAdapter
  - phase: 399-core-rpc-proxy-engine/02
    provides: SyncPipelineExecutor, CompletionWaiter, NonceTracker

provides:
  - RpcPassthrough (19 read-only methods proxied to upstream RPC)
  - RpcMethodHandlers (10 intercept methods routed to WAIaaS pipelines)
  - classifyMethod (intercept/passthrough/unsupported classification)
  - Barrel export for all rpc-proxy modules

affects: [400-route-assembly, 401-dx-integration]

tech-stack:
  added: []
  patterns: [method-classification, parameter-order-awareness]

key-files:
  created:
    - packages/daemon/src/rpc-proxy/passthrough.ts
    - packages/daemon/src/rpc-proxy/method-handlers.ts
    - packages/daemon/src/rpc-proxy/index.ts
    - packages/daemon/src/__tests__/rpc-proxy/passthrough.test.ts
    - packages/daemon/src/__tests__/rpc-proxy/method-handlers.test.ts

key-decisions:
  - "personal_sign params: [message, address]; eth_sign params: [address, message] (reversed)"
  - "eth_sendRawTransaction explicitly rejected with INVALID_PARAMS (SIGN-07)"
  - "eth_signTransaction passes JSON.stringify(params) to sign-only pipeline"

patterns-established:
  - "Method classification: intercept set + passthrough set + unsupported fallback"
  - "Upstream id preservation in passthrough responses"

requirements-completed: [SIGN-02, SIGN-03, SIGN-05, SIGN-06, SIGN-07, PASS-01, PASS-02]

duration: 10min
completed: 2026-03-13
---

# Plan 399-03: RpcPassthrough + Signing Method Handlers Summary

**19-method read passthrough via RPC Pool, 10 intercept methods routing to WAIaaS signing/transaction pipelines, and barrel export for the complete rpc-proxy module**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-13T12:13:00Z
- **Completed:** 2026-03-13T12:23:53Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- RpcPassthrough proxies 19 read-only EVM JSON-RPC methods to upstream RPC via RpcPool
- RpcMethodHandlers routes 10 intercepted methods to WAIaaS pipelines: eth_sendTransaction to 6-stage pipeline, eth_signTransaction to sign-only, personal_sign/eth_sign/eth_signTypedData_v4 to sign-message
- classifyMethod provides 3-way method classification for RpcDispatcher (Phase 400)
- eth_sendRawTransaction explicitly rejected with descriptive error (SIGN-07)
- Barrel export for all 7 rpc-proxy modules
- 27 tests for passthrough proxying and method handler routing

## Task Commits

1. **Task 1: RpcPassthrough** - `04f28852` (feat)
2. **Task 2: RpcMethodHandlers + barrel export** - `0dc82c63` (feat)

## Files Created/Modified
- `packages/daemon/src/rpc-proxy/passthrough.ts` - PASSTHROUGH_METHODS set + RpcPassthrough.forward()
- `packages/daemon/src/rpc-proxy/method-handlers.ts` - INTERCEPT_METHODS + RpcMethodHandlers + classifyMethod
- `packages/daemon/src/rpc-proxy/index.ts` - Barrel export for all rpc-proxy modules
- `packages/daemon/src/__tests__/rpc-proxy/passthrough.test.ts` - 10 tests
- `packages/daemon/src/__tests__/rpc-proxy/method-handlers.test.ts` - 17 tests

## Decisions Made
- personal_sign params order: [message, address]; eth_sign reversed: [address, message]
- eth_signTransaction passes JSON-serialized params to sign-only pipeline
- eth_sendRawTransaction returns -32602 INVALID_PARAMS with guidance to use eth_sendTransaction

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All rpc-proxy components ready for Phase 400 (RpcDispatcher, Hono route, batch processing)
- Complete module available via barrel import: `import { ... } from '../rpc-proxy/index.js'`

---
*Phase: 399-core-rpc-proxy-engine*
*Completed: 2026-03-13*
