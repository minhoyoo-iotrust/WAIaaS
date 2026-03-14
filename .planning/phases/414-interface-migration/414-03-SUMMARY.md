---
phase: 414-interface-migration
plan: 03
subsystem: admin-ui
tags: [migration, types, openapi, typed-client, deferred]
dependency_graph:
  requires: [414-01, 414-02]
  provides: [wallets-page-migration, full-verification]
  affects: [admin-ui]
key_files:
  modified: []
decisions:
  - Deferred to follow-up: wallets.tsx (3417 lines, 16 interfaces, 37 api calls) requires dedicated session
  - Test mock return value wrapping deferred from 414-02
metrics:
  duration: 0min
  completed: null
---

# Phase 414 Plan 03: wallets.tsx Migration + Full Verification Summary

**Status: DEFERRED** - wallets.tsx migration and full verification deferred to follow-up session.

## Reason for Deferral
- wallets.tsx is 3417 lines with 16 interfaces and 37 API calls -- requires dedicated session
- 7 test files need migration alongside the page
- Test mock return value wrapping from Plan 414-02 needs completion first
- Full verification (typecheck, all tests, MIG-08 drift test) depends on above completions

## Remaining Work
1. wallets.tsx: migrate 16 interfaces + 37 API calls to typed client
2. 7 wallets test files: update mocks
3. SettingsPanel.tsx, PolymarketSettings.tsx: component-level client migration
4. Complete test mock { data: ... } wrapping for all 414-02 test files
5. Full typecheck and test suite verification
6. MIG-08 drift test (remove field from types.generated.ts, verify typecheck fails)
