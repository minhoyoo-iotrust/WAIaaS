---
phase: 360-offchain-smoke-advanced
plan: "01"
subsystem: e2e-tests
tags: [e2e, smart-account, userop, owner-auth, offchain-smoke]
dependency_graph:
  requires: [358-01, 358-02]
  provides: [smart-account-crud, userop-build-sign, owner-auth-challenge]
  affects: [packages/e2e-tests]
tech_stack:
  added: []
  patterns: [e2e-smoke-offchain, admin-settings-array-format, eip55-checksum-validation]
key_files:
  created:
    - packages/e2e-tests/src/scenarios/advanced-smart-account-userop-owner.ts
    - packages/e2e-tests/src/__tests__/advanced-smart-account-userop-owner.e2e.test.ts
  modified: []
decisions:
  - Admin Settings API uses { settings: [{ key, value }] } array format, not flat object
  - Owner address requires EIP-55 checksummed format (all-lowercase rejected)
  - approval_method values are sdk_ntfy/sdk_telegram/walletconnect/telegram_bot/rest (not SIWE/SIWS)
metrics:
  duration: 4min
  completed: "2026-03-09"
  tasks: 1
  tests_added: 9
  files_created: 2
---

# Phase 360 Plan 01: Smart Account/UserOp/Owner Auth E2E Summary

Smart Account E2E (create/retrieve + Lite mode), UserOp Build/Sign (RPC error expected + EOA rejection), Owner Auth (nonce + registration + invalid signature rejection)

## Tasks Completed

### Task 1: Scenario Registration + E2E Tests

- Created 3 scenario registrations: `smart-account-crud`, `userop-build-sign`, `owner-auth-challenge`
- 9 test cases across 3 describe blocks, all passing
- Commit: 945d6b25

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Admin Settings API body format**
- **Found during:** Task 1
- **Issue:** Plan specified flat JSON body `{ "smart_account.enabled": "true" }`, but API requires `{ settings: [{ key, value }] }`
- **Fix:** Changed all admin settings calls to use array format
- **Files modified:** advanced-smart-account-userop-owner.e2e.test.ts

**2. [Rule 1 - Bug] Owner address EIP-55 checksum required**
- **Found during:** Task 1
- **Issue:** Plan used lowercase address `0x1234...`, but daemon requires EIP-55 checksummed format
- **Fix:** Used known checksummed address `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`

**3. [Rule 1 - Bug] Owner set request field names**
- **Found during:** Task 1
- **Issue:** Plan used `{ address, method: 'SIWE' }`, but actual schema uses `{ owner_address, approval_method }` with values like `rest`
- **Fix:** Corrected field names and used valid approval_method value `rest`

## Verification

```
9 tests passed (9 passed, 0 failed)
- smart-account-crud: 4 tests (enable setting, create, retrieve, connect-info)
- userop-build-sign: 2 tests (smart account build, EOA rejection)
- owner-auth-challenge: 3 tests (nonce, register owner, invalid verify)
```
