---
phase: 363-onchain-e2e-scenarios
plan: "01"
subsystem: e2e-tests
tags: [e2e, onchain, transfer, skip-utility]
dependency_graph:
  requires: [362-02]
  provides: [onchain-skip-helpers, vitest-onchain-project, transfer-e2e]
  affects: [363-02, 363-03]
tech_stack:
  added: []
  patterns: [skipIf-shouldSkipNetwork, vitest-workspace-projects, self-transfer-balance-preservation]
key_files:
  created:
    - packages/e2e-tests/src/helpers/onchain-skip.ts
    - packages/e2e-tests/src/scenarios/onchain-transfer.ts
    - packages/e2e-tests/src/__tests__/onchain-transfer.e2e.test.ts
  modified:
    - packages/e2e-tests/src/helpers/index.ts
    - packages/e2e-tests/vitest.config.ts
decisions:
  - vitest workspace config with offchain/onchain projects for --project filtering
  - onchain project uses 120s testTimeout, 60s hookTimeout, maxForks 1 (sequential)
  - Token transfer tests use graceful return (not test.skip) when API returns 4xx
metrics:
  duration: 3min
  completed: "2026-03-09"
---

# Phase 363 Plan 01: Skip Utility + ETH/SOL/ERC-20/SPL Transfer E2E Summary

Onchain skip utility with ONCHAIN_SKIP_NETWORKS env parsing, vitest workspace dual-project config, and 4 testnet transfer E2E tests with self-transfer balance preservation.

## What was done

### Task 1: Skip Utility + vitest onchain project config
- Created `onchain-skip.ts` with `shouldSkipNetwork()`, `getSkipReason()`, `SELF_ADDRESS_PLACEHOLDER`
- Re-exported from `helpers/index.ts`
- Updated `vitest.config.ts` with workspace config: `offchain` project (excludes onchain-*), `onchain` project (includes onchain-*, 120s timeout, single fork)

### Task 2: ETH/SOL/ERC-20/SPL transfer E2E tests
- Registered 4 scenarios: `eth-transfer`, `sol-transfer`, `erc20-transfer`, `spl-transfer`
- Test connects to already-running daemon via `WAIAAS_E2E_DAEMON_URL`
- Creates sessions for existing funded wallets (no DaemonManager)
- ETH/SOL: self-transfer minimal amount, poll tx status, verify txId format
- ERC-20/SPL: graceful skip on 4xx or FAILED status (no token balance)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | a6e91024 | Skip utilities + vitest onchain project config |
| 2 | 3474f625 | ETH/SOL/ERC-20/SPL transfer E2E tests |

## Deviations from Plan

None - plan executed exactly as written.
