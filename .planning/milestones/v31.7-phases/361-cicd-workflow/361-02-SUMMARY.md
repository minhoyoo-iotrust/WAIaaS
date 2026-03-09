---
phase: 361-cicd-workflow
plan: 02
subsystem: testing, ci
tags: [network-keys, ssot, badge, nightly]
dependency_graph:
  requires: [packages/core/src/enums/chain.ts, packages/daemon/src/infrastructure/settings/setting-keys.ts]
  provides: [network-keys-completeness-test, dynamic-badge]
  affects: [.github/workflows/nightly.yml, README.md]
tech_stack:
  added: [schneegans/dynamic-badges-action@v1.7.0]
  patterns: [ssot-driven-test, dynamic-badge-gist]
key_files:
  created:
    - packages/daemon/src/__tests__/network-setting-keys-completeness.test.ts
  modified:
    - .github/workflows/nightly.yml
    - README.md
    - packages/daemon/src/__tests__/config-loader.test.ts
decisions:
  - "Used NETWORK_TYPES as SSoT with it.each pattern for dynamic test generation"
  - "Badge in nightly.yml (option C) for accurate full-suite counts without CI load"
  - "Gist ID placeholder in README -- requires user setup (GIST_SECRET, TEST_BADGE_GIST_ID)"
metrics:
  duration: 5min
  completed: 2026-03-09
---

# Phase 361 Plan 02: #282 Network Setting Keys Completeness + #283 README Dynamic Badge

NETWORK_TYPES SSoT-based setting key completeness test (67 cases) + nightly dynamic badge update via Gist

## What Was Done

### Task 1: #282 Network Setting Keys Completeness Test (TDD)
- Created `network-setting-keys-completeness.test.ts` with 67 test cases
- Verifies all 15 networks in NETWORK_TYPES have:
  - `rpc.*` keys (using rpcConfigKey for correct key construction)
  - `rpc_pool.*` keys (direct network name)
  - `incoming.wss_url.*` keys (per-network WSS URL)
  - `BUILT_IN_RPC_DEFAULTS` entries
- Count cross-checks: each category key count == NETWORK_TYPES.length
- Added `// Superseded by` comment to config-loader.test.ts CFG-02 test
- All 67 tests pass (4,385 total tests in daemon package)

### Task 2: #283 README Dynamic Badge
- Added `Collect test counts` + `Update test badge` steps to nightly.yml full-suite job
- Uses `schneegans/dynamic-badges-action@v1.7.0` with Gist-based badge JSON
- Badge updates only on success (`if: success()`)
- Replaced hardcoded README badge (`Tests-3,599_passing`) with shields.io endpoint URL
- Gist ID placeholder `<GIST_ID>` in README -- requires user setup

## User Setup Required

1. Create a GitHub Gist (private, with `waiaas-test-badge.json` file containing `{}`)
2. Create a PAT with Gist write scope -> add as Repository Secret `GIST_SECRET`
3. Add Repository Variable `TEST_BADGE_GIST_ID` with the Gist ID
4. Replace `<GIST_ID>` in README.md with the actual Gist ID

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- Test passes: `pnpm --filter @waiaas/daemon test:unit -- --run network-setting-keys-completeness` (67 tests, 8ms)
- nightly.yml contains `dynamic-badges-action` (1 match)
- README.md contains `endpoint?url=` (1 match)
