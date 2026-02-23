---
phase: 252-lifi-actionprovider-정책-연동-알림
plan: 03
status: complete
started: 2026-02-24T02:42:00Z
completed: 2026-02-24T02:50:00Z
---

## Summary

Created BridgeStatusTracker (2-phase polling) with notification event emission and SPENDING_LIMIT reservation release callbacks in AsyncPollingService. Added 5 bridge notification event types with en/ko i18n templates and daemon lifecycle integration.

## Key Files

### Created
- `packages/actions/src/providers/lifi/bridge-status-tracker.ts` — BridgeStatusTracker (30s x 240 = 2h) + BridgeMonitoringTracker (5min x 264 = 22h) with shared mapLiFiStatus()
- `packages/actions/src/__tests__/bridge-status-tracker.test.ts` — 14 msw-based unit tests

### Modified
- `packages/actions/src/index.ts` — Added BridgeStatusTracker/BridgeMonitoringTracker exports
- `packages/core/src/enums/notification.ts` — Added 5 bridge event types (36 total)
- `packages/core/src/i18n/en.ts` — 5 bridge notification templates (English)
- `packages/core/src/i18n/ko.ts` — 5 bridge notification templates (Korean)
- `packages/core/src/schemas/signing-protocol.ts` — 5 entries in EVENT_CATEGORY_MAP and EVENT_DESCRIPTIONS
- `packages/daemon/src/services/async-polling-service.ts` — AsyncPollingCallbacks interface, emitNotification + releaseReservation callbacks, walletId propagation
- `packages/daemon/src/lifecycle/daemon.ts` — Callbacks wiring (notify + DB reservation reset), bridge tracker registration (Step 4f-2)
- `packages/daemon/src/__tests__/async-polling-service.test.ts` — 8 new callback integration tests (25 total)

## Test Results

14 bridge-status-tracker unit tests + 8 callback integration tests = 22 new tests:

Bridge Status Tracker (14):
- BridgeStatusTracker: correct config, DONE->COMPLETED, PENDING with substatus, FAILED, REFUNDED, NOT_FOUND, INVALID, no txHash, API params (9)
- BridgeMonitoringTracker: correct config, DONE->COMPLETED, FAILED, REFUNDED, no txHash (5)

AsyncPollingService Callbacks (8):
- COMPLETED: emits BRIDGE_COMPLETED + releases reservation
- REFUNDED: sets REFUNDED status + emits BRIDGE_REFUNDED + releases reservation
- FAILED: emits BRIDGE_FAILED + releases reservation
- BRIDGE_MONITORING: emits BRIDGE_MONITORING_STARTED + no release
- TIMEOUT: emits BRIDGE_TIMEOUT + no release
- No callbacks: no crash (backward compat)
- Tracker switch: sets tracker='bridge-monitoring' in metadata

## Commits
- `feat(252-03): add BridgeStatusTracker, notifications, and reservation release`

## Self-Check: PASSED
- [x] BridgeStatusTracker: name='bridge', 30s, 240 attempts, timeoutTransition='BRIDGE_MONITORING'
- [x] BridgeMonitoringTracker: name='bridge-monitoring', 5min, 264 attempts, timeoutTransition='TIMEOUT'
- [x] LI.FI status mapping: DONE->COMPLETED, FAILED->FAILED, REFUNDED->COMPLETED(refunded=true), NOT_FOUND/INVALID->PENDING
- [x] AsyncPollingCallbacks interface with emitNotification + releaseReservation
- [x] COMPLETED/FAILED/REFUNDED release reservation, BRIDGE_MONITORING/TIMEOUT retain
- [x] 5 notification events: BRIDGE_COMPLETED/FAILED/MONITORING_STARTED/TIMEOUT/REFUNDED
- [x] EVENT_CATEGORY_MAP and EVENT_DESCRIPTIONS updated (36 entries)
- [x] en.ts + ko.ts have all 5 bridge templates
- [x] Daemon registers bridge trackers when lifi is enabled
- [x] BRIDGE_MONITORING sets metadata.tracker='bridge-monitoring' for BridgeMonitoringTracker pickup
- [x] All 98 actions tests pass, all 25 async-polling tests pass
- [x] Full monorepo typecheck (16 tasks) + lint (0 errors) pass
