---
phase: 270-lending-framework
plan: 02
subsystem: defi
tags: [lending, rest-api, health-factor, aave, kamino, morpho, protocol-mapping]

requires:
  - phase: 270-lending-framework
    plan: 01
    provides: ILendingProvider interface, LendingPosition/HealthFactor/MarketInfo types, LendingPolicyEvaluator
  - phase: 268-position-infra-design
    provides: defi_positions table, positions API (section 7)
provides:
  - GET /v1/wallets/:id/health-factor endpoint specification
  - HealthFactorResponseSchema (Zod, aggregated + per-provider)
  - Aave V3 IPool ABI → ILendingProvider method mapping
  - Kamino klend-sdk → ILendingProvider method mapping
  - Morpho Blue IMorpho ABI → ILendingProvider method mapping
  - Protocol comparison table (position model, health factor computation, market discovery)
affects: [aave-v3-implementation, kamino-implementation, morpho-implementation, m29-02, m29-04, m29-10]

tech-stack:
  added: []
  patterns: [aggregated-health-factor-endpoint, per-market-health-factor-aggregation, protocol-mapping-table]

key-files:
  created: []
  modified:
    - internal/objectives/m29-00-defi-advanced-protocol-design.md

key-decisions:
  - "DEC-LEND-12: Single aggregated /health-factor endpoint (not per-provider)"
  - "DEC-LEND-13: healthFactor null when no debt (not infinity)"
  - "DEC-LEND-14: lastSyncedAt from defi_positions.updated_at"
  - "DEC-LEND-15: Morpho getMarkets() uses config-based curated list"
  - "DEC-LEND-16: Kamino resolve() converts klend-sdk to SolanaTransactionRequest"
  - "DEC-LEND-17: Aave V3 interestRateMode defaults to 2 (variable)"
  - "DEC-LEND-18: Morpho health factor aggregation uses min()"

patterns-established:
  - "Protocol mapping table: ILendingProvider method → protocol ABI/SDK function with notes"
  - "Cross-protocol comparison: side-by-side differences in position model, health factor, market discovery"
  - "Health factor endpoint: aggregated worst-case + per-provider breakdown in single response"

requirements-completed: [LEND-07, LEND-08, LEND-09]

duration: 7min
completed: 2026-02-26
---

# Plan 270-02: REST API Health-Factor Endpoint + Protocol Mapping Summary

**GET /v1/wallets/:id/health-factor endpoint with HealthFactorResponseSchema, plus complete Aave V3/Kamino/Morpho Blue protocol-to-ILendingProvider method mapping tables**

## Performance

- **Duration:** 7 min
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Specified GET /v1/wallets/:id/health-factor with aggregated worst-case + per-provider breakdown, sessionAuth, provider filter query parameter
- Defined HealthFactorResponseSchema (Zod) with OpenAPI annotation, documented relationship to Phase 268 positions API
- Mapped Aave V3 IPool ABI (7 methods: supply/borrow/repay/withdraw/getUserAccountData/getReservesList/getReserveData) to ILendingProvider
- Mapped Kamino klend-sdk (7 methods: buildDepositTxns/buildBorrowTxns/buildRepayTxns/buildWithdrawTxns/getObligationByWallet/stats/loadReserves) to ILendingProvider
- Mapped Morpho Blue IMorpho ABI (7 methods: supplyCollateral/borrow/repay/withdrawCollateral/position + per-market health factor computation) to ILendingProvider
- Created cross-protocol comparison table covering 10 dimensions
- Recorded 7 design decisions (DEC-LEND-12 through DEC-LEND-18)

## Task Commits

1. **Task 1+2: Sections 16-17 (API + protocol mapping)** - `9d43b8f1` (docs)

## Files Created/Modified
- `internal/objectives/m29-00-defi-advanced-protocol-design.md` - Added sections 16, 17 with REST API spec and 3 protocol mappings

## Decisions Made
Followed plan as specified. 7 design decisions recorded (DEC-LEND-12 through DEC-LEND-18).

## Deviations from Plan
None - plan executed as specified.

## Issues Encountered
None

## Next Phase Readiness
- Phase 270 Lending framework design complete (sections 13-17)
- 18 design decisions (DEC-LEND-01 through DEC-LEND-18) recorded
- Implementation milestones (m29-02 Aave, m29-04 Kamino, m29-10 Morpho) can proceed by reading mapping tables
- Ready for Phase 271 (Yield framework) and Phase 272 (Perp framework)

---
*Phase: 270-lending-framework*
*Completed: 2026-02-26*
