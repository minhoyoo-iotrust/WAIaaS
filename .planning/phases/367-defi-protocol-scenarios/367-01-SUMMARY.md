---
phase: 367-defi-protocol-scenarios
plan: 01
subsystem: testing
tags: [defi, jupiter, jito, kamino, drift, solana, swap, staking, lending, perp]

requires:
  - phase: 366-testnet-transfer-scenarios
    provides: scenario template format and index structure
provides:
  - 4 Solana DeFi UAT scenarios (Jupiter, Jito, Kamino, Drift)
affects: [367-03 index update, 369 CI scenario validation]

tech-stack:
  added: []
  patterns: [DeFi scenario format with dry-run + user approval + position verification]

key-files:
  created:
    - agent-uat/defi/jupiter-swap.md
    - agent-uat/defi/jito-staking.md
    - agent-uat/defi/kamino-lending.md
    - agent-uat/defi/drift-perp.md
  modified: []

key-decisions:
  - "Perp orders use $10 limit price (10% of market) to prevent accidental fills"
  - "All DeFi scenarios include optional reverse-action dry-run as final step"

patterns-established:
  - "DeFi scenario pattern: balance check -> dry-run -> user approval -> execute -> verify position"
  - "Safe order pattern: far-from-market price for perp/spot limit orders"

requirements-completed: [DEFI-01, DEFI-06, DEFI-08, DEFI-10]

duration: 3min
completed: 2026-03-09
---

# Phase 367 Plan 01: Solana DeFi Scenarios Summary

**4 Solana DeFi scenarios: Jupiter SOL->USDC swap, Jito liquid staking, Kamino USDC lending, Drift perp trading with safe order prices**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T14:34:10Z
- **Completed:** 2026-03-09T14:37:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Jupiter Swap scenario with SOL->USDC flow, slippage control (50 bps), dry-run validation
- Jito Staking scenario with SOL->JitoSOL liquid staking and optional unstake
- Kamino Lending scenario with USDC supply, position verification, optional withdraw
- Drift Perp scenario with USDC deposit, SOL-PERP limit order at $10 (safe price), cancel flow

## Task Commits

1. **Task 1: Solana DEX + Staking (Jupiter, Jito)** - `09cafdcb` (feat)
2. **Task 2: Solana Lending + Perp (Kamino, Drift)** - `1ad1d41f` (feat)

## Files Created/Modified
- `agent-uat/defi/jupiter-swap.md` - SOL->USDC swap via Jupiter aggregator
- `agent-uat/defi/jito-staking.md` - SOL->JitoSOL liquid staking
- `agent-uat/defi/kamino-lending.md` - USDC supply to Kamino lending
- `agent-uat/defi/drift-perp.md` - USDC deposit + SOL-PERP order/cancel on Drift

## Decisions Made
- Perp orders use $10 limit price (far below market) to prevent accidental fills
- All DeFi scenarios include optional reverse-action (unstake/withdraw/sell) as dry-run only
- Consistent 6-section format with frontmatter YAML matching template spec

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- defi/ directory created with 4 Solana scenarios
- Ready for Plan 367-02 (EVM DeFi scenarios)
- Index update deferred to Plan 367-03

---
*Phase: 367-defi-protocol-scenarios*
*Completed: 2026-03-09*
