---
phase: 298-drift-provider
plan: 01
subsystem: defi
tags: [perp, drift, zod, sdk-wrapper, solana, interface]

# Dependency graph
requires:
  - phase: 297-perp-framework
    provides: "IPerpProvider interface, PerpPositionSummary/MarginInfo/PerpMarketInfo Zod schemas"
provides:
  - "DriftConfig type, DRIFT_PROGRAM_ID, DRIFT_DEFAULTS"
  - "5 Zod input schemas (OpenPosition, ClosePosition, ModifyPosition, AddMargin, WithdrawMargin)"
  - "IDriftSdkWrapper interface with 5 build + 3 query methods"
  - "DriftInstruction, DriftPosition, DriftMarginInfo, DriftMarketInfo intermediate types"
  - "MockDriftSdkWrapper for testing, DriftSdkWrapper stub for real SDK"
affects: [298-02-PLAN, 298-03-PLAN, 299-perp-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [IDriftSdkWrapper mirrors IKaminoSdkWrapper pattern, encodeMockInstructionData uses UTF-8 for string amounts]

key-files:
  created:
    - packages/actions/src/providers/drift/config.ts
    - packages/actions/src/providers/drift/schemas.ts
    - packages/actions/src/providers/drift/drift-sdk-wrapper.ts
  modified: []

key-decisions:
  - "DriftInstruction uses same structure as KaminoInstruction (programId + base64 instructionData + accounts array)"
  - "Mock instruction data uses UTF-8 encoding for size strings (not bigint LE like Kamino) since Drift uses string amounts"
  - "DriftSdkWrapper stores both rpcUrl and subAccount constructor params for future real SDK integration"

patterns-established:
  - "Drift SDK wrapper pattern: IDriftSdkWrapper isolates @drift-labs/sdk behind plain JS type boundary"
  - "Mock data: SOL-PERP LONG position (size 100, leverage 5, entryPrice 150) + 3 markets (SOL/BTC/ETH)"

requirements-completed: [DRIFT-05, DRIFT-07, DRIFT-08]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 298 Plan 01: DriftSdkWrapper + IDriftSdkWrapper Interface Summary

**IDriftSdkWrapper abstraction layer with 5 build + 3 query methods, MockDriftSdkWrapper deterministic test data, DriftConfig, and 5 Zod input schemas for Drift Perp**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T15:55:59Z
- **Completed:** 2026-03-01T15:59:09Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- IDriftSdkWrapper interface defining complete SDK abstraction boundary with 5 build methods and 3 query methods, all plain JS types
- DriftInstruction intermediate type matching KaminoInstruction format (programId + base64 + accounts)
- MockDriftSdkWrapper with deterministic mock data: SOL-PERP LONG position, 3 markets, margin info
- DriftSdkWrapper stub that gracefully throws ChainError when @drift-labs/sdk is not installed
- 5 Zod SSoT input schemas with LIMIT order refinement and ModifyPosition at-least-one validation
- DriftConfig + DRIFT_PROGRAM_ID + DRIFT_DEFAULTS configuration foundation
- Zero @solana/web3.js type imports in any drift provider file (type isolation verified)

## Task Commits

Each task was committed atomically:

1. **Task 1: DriftConfig + Zod input schemas** - `80caef6a` (feat)
2. **Task 2: IDriftSdkWrapper interface + Mock + Real stub** - `f90f7418` (feat)

## Files Created/Modified
- `packages/actions/src/providers/drift/config.ts` - DriftConfig interface, DRIFT_PROGRAM_ID, DRIFT_DEFAULTS
- `packages/actions/src/providers/drift/schemas.ts` - 5 Zod SSoT input schemas for perp actions
- `packages/actions/src/providers/drift/drift-sdk-wrapper.ts` - IDriftSdkWrapper, DriftInstruction/Position/MarginInfo/MarketInfo types, MockDriftSdkWrapper, DriftSdkWrapper

## Decisions Made
- DriftInstruction uses the same structure as KaminoInstruction (programId + base64 instructionData + accounts array) for consistency across SDK wrappers
- Mock instruction data uses UTF-8 encoding for size strings instead of bigint LE (Kamino pattern) since Drift uses string amounts throughout
- DriftSdkWrapper stores both rpcUrl and subAccount constructor parameters for future real SDK integration (DEC-PERP-15)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- IDriftSdkWrapper ready for DriftPerpProvider to consume in Plan 298-02
- MockDriftSdkWrapper ready for unit tests in Plan 298-03
- 5 Zod schemas ready for ActionDefinition inputSchema assignment in DriftPerpProvider
- DriftConfig ready for integration with Admin Settings in Phase 299

## Self-Check: PASSED

- [x] `packages/actions/src/providers/drift/config.ts` - FOUND
- [x] `packages/actions/src/providers/drift/schemas.ts` - FOUND
- [x] `packages/actions/src/providers/drift/drift-sdk-wrapper.ts` - FOUND
- [x] Commit `80caef6a` - FOUND
- [x] Commit `f90f7418` - FOUND

---
*Phase: 298-drift-provider*
*Completed: 2026-03-02*
