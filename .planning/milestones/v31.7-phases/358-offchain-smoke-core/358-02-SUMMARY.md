---
phase: 358-offchain-smoke-core
plan: 02
subsystem: e2e-tests
tags: [e2e, policy, dry-run, simulate, offchain]
dependency_graph:
  requires: [357-01, 357-02, 357-03]
  provides: [policy-crud-dryrun scenario]
  affects: [packages/e2e-tests]
tech_stack:
  added: []
  patterns: [spending-limit-policy, dry-run-simulate]
key_files:
  created:
    - packages/e2e-tests/src/scenarios/core-policy.ts
    - packages/e2e-tests/src/__tests__/core-policy.e2e.test.ts
  modified: []
decisions:
  - "Used SPENDING_LIMIT (not DAILY_LIMIT/TRANSACTION_LIMIT) -- actual PolicyTypeEnum value"
  - "Simulate uses { type: 'TRANSFER', to, amount } body format (not { to, value })"
  - "Simulate response has policyEvaluation.tier and policyEvaluation.allowed fields"
metrics:
  duration: 2min
  completed: 2026-03-09
  tests_added: 8
  files_created: 2
---

# Phase 358 Plan 02: Policy CRUD + Dry-run Simulate E2E Summary

E2E scenario verifying SPENDING_LIMIT policy lifecycle and transaction dry-run simulation evaluation.

## What Was Done

### Task 1: Policy CRUD + Dry-run E2E
- Created 1 offchain scenario registration (policy-crud-dryrun) in global ScenarioRegistry
- 8 E2E test cases in 2 describe groups: CRUD lifecycle (6) + dry-run simulate (2)

### Test Coverage
- **CRUD:** Create SPENDING_LIMIT -> list (verify present) -> update rules -> verify update -> delete -> verify gone
- **Dry-run:** Simulate within instant_max (INSTANT tier, allowed) + simulate exceeding delay_max (denied)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed policy type name**
- **Found during:** Task 1
- **Issue:** Plan specified DAILY_LIMIT/TRANSACTION_LIMIT but actual PolicyTypeEnum has SPENDING_LIMIT
- **Fix:** Used SPENDING_LIMIT with instant_max/notify_max/delay_max rules

**2. [Rule 1 - Bug] Fixed simulate request body schema**
- **Found during:** Task 1
- **Issue:** Plan used `{ to, value }` but actual TransferRequest schema requires `{ type: 'TRANSFER', to, amount }`
- **Fix:** Adapted simulate body to match TransactionRequestSchema

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | cec1add3 | feat(358-02): add policy CRUD + dry-run simulate E2E scenarios |

## Self-Check: PASSED

All files created, all commits verified, all 8 tests passing.
