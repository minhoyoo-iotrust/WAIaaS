---
phase: 352-research-design
plan: 01
subsystem: defi
tags: [across-protocol, cross-chain-bridge, spokepool, intent-bridge, viem, zod]

# Dependency graph
requires:
  - phase: 251-lifi-bridge
    provides: IAsyncStatusTracker 2-phase polling pattern, bridge_status/bridge_metadata DB columns
provides:
  - "Design document 79: Across Protocol cross-chain bridge integration"
  - "Across API 5-endpoint specification with Zod schemas"
  - "SpokePool depositV3 12-parameter interface with chain-specific addresses"
  - "AcrossBridgeActionProvider 5-action interface design"
  - "12 design decisions (DS-01 through DS-12)"
affects: [353-api-client-bridge-provider, 354-status-tracking, 355-interface-integration, 356-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Late-bind quote pattern (fresh /suggested-fees at Stage 5)"
    - "outputAmount = inputAmount - totalRelayFee.total (absolute value, not pct)"
    - "15-second active polling (vs LI.FI 30s) for faster Across fill detection"

key-files:
  created:
    - internal/design/79-across-protocol-bridge.md
  modified: []

key-decisions:
  - "DS-01: REST API direct call (no Across SDK dependency)"
  - "DS-02: Reuse bridge_status/bridge_metadata columns (no DB migration)"
  - "DS-03: No caching for /suggested-fees, 5-min cache for /available-routes"
  - "DS-04: Late-bind quote pattern at Stage 5 to prevent quoteTimestamp expiry"
  - "DS-05: fillDeadline from API, fallback quoteTimestamp + 21600s"
  - "DS-07: outputAmount = inputAmount - totalRelayFee.total (absolute value)"
  - "DS-08: 15-second Phase 1 polling interval"
  - "DS-09: Policy evaluation based on inputAmount"
  - "DS-11: No new npm dependencies"
  - "DS-12: IncomingTxMonitor as secondary detection only"

patterns-established:
  - "Across bridge integration: AcrossApiClient + AcrossBridgeActionProvider + AcrossBridgeStatusTracker"
  - "Late-bind quote: re-fetch suggested-fees at Stage 5 execution for fresh quoteTimestamp"

requirements-completed: [DES-01, DES-02, DES-03, DES-04, DES-05, DES-06]

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 352 Plan 01: Across Protocol Bridge Design Summary

**Across Protocol intent-based bridge design doc (doc 79) with 5 API endpoints, SpokePool depositV3 interface, fee model, and 12 design decisions for implementation-ready specification**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-08T15:43:29Z
- **Completed:** 2026-03-08T15:48:40Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Design document 79 (1,285 lines) covering all Across Protocol integration aspects
- 5 Across API endpoints fully specified with request/response examples and Zod schemas
- SpokePool depositV3 12 parameters documented with viem ABI fragments and chain-specific addresses
- 12 design decisions (DS-01 through DS-12) confirmed for implementation guidance
- 15 pitfalls from research integrated as inline warnings in relevant sections

## Task Commits

Each task was committed atomically:

1. **Task 1: Across Protocol API research and Zod schema design** - `7f836181` (docs)

## Files Created/Modified

- `internal/design/79-across-protocol-bridge.md` - Complete Across Protocol bridge integration design document (doc 79, 15 sections)

## Decisions Made

- DS-01: REST API direct call over Across SDK (ethers.js dependency avoidance)
- DS-02: No DB migration needed -- bridge_status/bridge_metadata columns reused from LI.FI
- DS-03: /suggested-fees no-cache policy per Across official guidance
- DS-04: Late-bind quote pattern for Stage 5 fresh quoteTimestamp
- DS-05: fillDeadline from API with 21600s fallback buffer
- DS-07: outputAmount via totalRelayFee.total absolute value (not pct)
- DS-08: 15s active polling interval for fast Across fill detection
- DS-09: inputAmount-based policy evaluation for cross-chain transfers
- DS-11: Zero new npm dependencies (viem + Zod + ActionApiClient existing stack)
- DS-12: IncomingTxMonitor as bonus UX only, not primary tracking

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Design document 79 is complete and self-contained for Phase 353-356 implementation
- All API endpoints, Zod schemas, depositV3 parameters, and config types are specified at implementation-ready detail
- File structure and component boundaries are defined for immediate coding

---
*Phase: 352-research-design*
*Completed: 2026-03-09*
