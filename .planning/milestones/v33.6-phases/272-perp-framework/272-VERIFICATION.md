---
phase: 272-perp-framework
status: passed
verified: 2026-02-26
---

# Phase 272: Perp Framework Design Verification

## Goal
IPerpProvider interface and margin/leverage policies are finalized so that Drift implementation (m29-08) can add a provider without modifying the framework.

## Success Criteria Verification

### 1. IPerpProvider defines 5 standard actions + 3 query methods
**Status: PASSED**
- Section 21.1: IPerpProvider extends IActionProvider with getPosition, getMarginInfo, getMarkets
- Section 21.2: 5 ActionDefinitions — open_position, close_position, modify_position, add_margin, withdraw_margin
- All with Zod input schemas and .describe() annotations

### 2. PerpPosition Zod schema + MarginInfo type specified
**Status: PASSED**
- Section 22.1: PerpPositionSummarySchema includes direction (LONG/SHORT), leverage, unrealizedPnl, liquidationPrice, markPrice, fundingRate, marginUsed, status
- Section 22.2: MarginInfoSchema includes totalCollateral, usedMargin, availableMargin, maintenanceMargin, marginRatio, accountLeverage, liquidatable

### 3. PerpPolicyEvaluator with 3 policy types + PolicyEngine integration
**Status: PASSED**
- Section 22.4.1: PERP_LEVERAGE_LIMIT (account-level, warning -> DELAY tier)
- Section 22.4.2: PERP_POSITION_SIZE_LIMIT (per-market + total USD)
- Section 22.4.3: PERP_MARKET_WHITELIST (default-deny)
- Section 22.4.4: PolicyEngine steps 4h-c, 4h-d, 4h-e with full evaluation order table

### 4. MarginMonitor integration design
**Status: PASSED**
- Section 23.5: 5-stage data flow (DriftProvider -> PositionTracker -> defi_positions -> MarginMonitor -> notification)
- Dual evaluation: margin ratio check + liquidation price proximity
- WARNING -> MARGIN_WARNING, CRITICAL -> LIQUIDATION_IMMINENT
- PerpMetadataSchema completeness verified: 7 fields, all sufficient for MarginMonitor.evaluate()

## Requirements Traceability

| Requirement | Description | Verified |
|---|---|---|
| PERP-01 | IPerpProvider 5 standard actions | YES — Section 21.2 |
| PERP-02 | 3 query methods | YES — Section 21.1 |
| PERP-03 | PerpPosition Zod schema | YES — Section 22.1 |
| PERP-04 | MarginInfo type | YES — Section 22.2 |
| PERP-05 | Max leverage limit policy | YES — Section 22.4.1 |
| PERP-06 | Position size + market whitelist | YES — Sections 22.4.2, 22.4.3 |
| PERP-07 | MarginMonitor 1-min polling design | YES — Section 23.5 |

## Design Decisions
18 total design decisions (DEC-PERP-01 through DEC-PERP-18) recorded across sections 21-23.

## Artifacts Produced
- m29-00 Section 21: IPerpProvider interface (5 actions + 3 queries + dual pattern)
- m29-00 Section 22: PerpPosition/MarginInfo/PerpMarketInfo types + PerpPolicyEvaluator (3 policies)
- m29-00 Section 23: MarginMonitor integration + Drift V2 mapping + cross-protocol comparison

## Result: PASSED
All 4 success criteria met. All 7 requirements satisfied. Phase 272 design complete.
