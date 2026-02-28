---
plan: 283-02
status: complete
started: 2026-02-28T02:02:00Z
completed: 2026-02-28T02:03:00Z
---

## Summary

Created the HF simulation module and integrated it into KaminoLendingProvider's borrow/withdraw resolve methods.

## What Was Built

- **hf-simulation.ts**: Pure functions for HF calculation and simulation
  - `calculateHealthFactor(collateral, debt, threshold)` -- returns Infinity for zero debt
  - `simulateKaminoHealthFactor(obligation, action, amountUsd, threshold)` -- simulates post-action HF
  - `hfToStatus(hf)` -- maps HF to safe/warning/danger/critical
  - Constants: KAMINO_LIQUIDATION_THRESHOLD (1.0), KAMINO_DEFAULT_HF_THRESHOLD (1.2)
- Refactored KaminoLendingProvider to use extracted simulation functions
- checkBorrowSafety and checkWithdrawSafety now delegate to simulateKaminoHealthFactor
- getHealthFactor now uses calculateHealthFactor and hfToStatus

## Commits

1. `feat(283-02,283-03): add HF simulation module and register Kamino exports`

## Key Decisions

- Number arithmetic (not bigint) for HF calculation -- Kamino SDK provides USD floats, not 18-decimal precision
- Graceful degradation: SDK failures silently skip simulation, only ChainError propagates
- Skip HF check for 'max' withdrawals (closing position entirely)

## Key Files

### key-files.created
- packages/actions/src/providers/kamino/hf-simulation.ts

### key-files.modified
- packages/actions/src/providers/kamino/index.ts

## Self-Check: PASSED
