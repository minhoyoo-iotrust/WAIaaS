---
phase: 354-status-tracking-daemon-integration
plan: 01
subsystem: actions/across, daemon
tags: [across, bridge, status-tracker, async-polling]
dependency_graph:
  requires: [353-01, 353-02]
  provides: [AcrossBridgeStatusTracker, AcrossBridgeMonitoringTracker, daemon-tracker-registration, bridge-enrollment]
  affects: [async-polling-service, bridge-status-tracking]
tech_stack:
  added: []
  patterns: [IAsyncStatusTracker-2phase-polling, bridge-enrollment]
key_files:
  created:
    - packages/actions/src/providers/across/bridge-status-tracker.ts
  modified:
    - packages/actions/src/index.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/api/routes/actions.ts
decisions:
  - "Tracker name 'across-bridge' (not 'bridge') to avoid LI.FI collision"
  - "Skip originChainId conversion at enrollment; store chain names, tracker handles optional originChainId"
  - "No DB migration: reuse bridge_status/bridge_metadata columns"
metrics:
  duration: 150s
  completed: "2026-03-09"
---

# Phase 354 Plan 01: AcrossBridgeStatusTracker 2-phase Polling + Daemon Integration Summary

2-phase polling status tracker (15s active + 5min monitoring, 24h total) for Across bridge deposits with daemon startup registration and execute enrollment.

## What Was Done

### Task 1: AcrossBridgeStatusTracker + AcrossBridgeMonitoringTracker
- Created `bridge-status-tracker.ts` with 2 tracker classes implementing `IAsyncStatusTracker`
- `AcrossBridgeStatusTracker`: name='across-bridge', 15s poll, 480 attempts (2h), timeout -> BRIDGE_MONITORING
- `AcrossBridgeMonitoringTracker`: name='across-bridge-monitoring', 5min poll, 264 attempts (22h), timeout -> TIMEOUT
- `mapAcrossStatus()` maps Across 4-state (filled/expired/refunded/pending) to AsyncTrackingResult
- Exported from `@waiaas/actions` index
- **Commit:** bc23ebf1

### Task 2: Daemon Tracker Registration + Bridge Enrollment
- Added Step 4f-2a in `daemon.ts`: registers both trackers when `actions.across_bridge_enabled=true`
- Added enrollment in `actions.ts`: after `across_bridge` execute, sets `bridgeStatus='PENDING'` with `tracker='across-bridge'` metadata
- Enrollment stores txHash, fromChain, toChain, inputToken, outputToken, inputAmount for status tracking
- No DB migration needed (reuses existing bridge_status/bridge_metadata columns)
- **Commit:** 6aaacb71

## Deviations from Plan

### Minor Adjustments

**1. [Rule 3 - Simplification] Skipped chainId conversion at enrollment**
- **Found during:** Task 2
- **Issue:** Plan suggested `getAcrossChainId()` conversion at enrollment time, but this adds complexity and the tracker's `checkStatus` handles optional originChainId
- **Fix:** Store chain names as-is in metadata; tracker uses originChainId only if present as number
- **Impact:** Simpler enrollment code, no functional difference

## Verification Results

1. `pnpm turbo run typecheck --filter=@waiaas/actions` -- PASS
2. `pnpm turbo run typecheck --filter=@waiaas/daemon` -- PASS
3. Export confirmed in index.ts
4. Tracker registration confirmed in daemon.ts
5. Bridge enrollment confirmed in actions.ts

## Self-Check: PASSED
