---
phase: 358-offchain-smoke-core
plan: 01
subsystem: e2e-tests
tags: [e2e, auth, wallet, session, offchain]
dependency_graph:
  requires: [357-01, 357-02, 357-03]
  provides: [auth-session-crud, wallet-crud, multi-wallet-session scenarios]
  affects: [packages/e2e-tests]
tech_stack:
  added: []
  patterns: [scenario-registration, daemon-lifecycle-sharing]
key_files:
  created:
    - packages/e2e-tests/src/scenarios/core-auth-wallet-session.ts
    - packages/e2e-tests/src/__tests__/core-auth-wallet-session.e2e.test.ts
  modified: []
decisions:
  - "chain: 'ethereum' (not 'evm') -- ChainTypeEnum uses 'ethereum'"
  - "GET /v1/wallets returns { items: [...] } not flat array"
  - "GET /v1/sessions/:id/wallets returns { wallets: [...] }"
  - "Token rotate test uses 1.1s delay for iat change + /v1/wallet/address (sessionAuth)"
  - "Wallet delete returns status TERMINATED, may still appear in list"
metrics:
  duration: 5min
  completed: 2026-03-09
  tests_added: 7
  files_created: 2
---

# Phase 358 Plan 01: Auth + Wallet CRUD + Multi-wallet Session E2E Summary

E2E scenarios verifying auth session lifecycle, wallet CRUD, and multi-wallet session attach/detach against a real daemon.

## What Was Done

### Task 1: Scenario Registration + E2E Tests
- Created 3 offchain scenario registrations (auth-session-crud, wallet-crud, multi-wallet-session) in global ScenarioRegistry
- 7 E2E test cases across 3 describe blocks sharing a single daemon instance

### Test Coverage
- **auth-session-crud (CORE-01):** Session creation, token rotation, session deletion with token invalidation (3 tests)
- **wallet-crud (CORE-02):** EVM/Solana wallet create, list, single get, delete (3 tests)
- **multi-wallet-session (CORE-03):** Wallet attach/detach with session_wallets state verification (1 test)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed chain type value**
- **Found during:** Task 1
- **Issue:** Plan specified `chain: 'evm'` but ChainTypeEnum uses `chain: 'ethereum'`
- **Fix:** Changed all EVM wallet creation to use `chain: 'ethereum'`

**2. [Rule 1 - Bug] Fixed wallet list response format**
- **Found during:** Task 1
- **Issue:** Plan assumed flat array response for GET /v1/wallets, but API returns `{ items: [...] }`
- **Fix:** Updated type annotations and assertions to use `body.items`

**3. [Rule 1 - Bug] Fixed session wallets response format**
- **Found during:** Task 1
- **Issue:** Plan assumed flat array for GET /v1/sessions/:id/wallets, but API returns `{ wallets: [...] }`
- **Fix:** Updated assertions to use `body.wallets`

**4. [Rule 1 - Bug] Fixed auth type for token validation**
- **Found during:** Task 1
- **Issue:** GET /v1/wallets requires masterAuth, not sessionAuth -- rotated token validation failed
- **Fix:** Changed to GET /v1/wallet/address (sessionAuth endpoint) for token validity checks

**5. [Rule 1 - Bug] Fixed attach/detach response codes**
- **Found during:** Task 1
- **Issue:** Plan expected 200 for attach and detach, but API returns 201 for attach and 204 for detach
- **Fix:** Updated expected status codes

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | c9f926ba | feat(358-01): add auth/wallet/session E2E scenarios |

## Self-Check: PASSED

All files created, all commits verified, all 7 tests passing.
