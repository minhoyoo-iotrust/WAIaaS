---
phase: 264-monitoring-alerts
verified: 2026-02-25T11:35:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 264: Monitoring Alerts Verification Report

**Phase Goal:** 관리자가 RPC 상태를 API로 확인하고 장애/복구 시 자동 알림을 받는다
**Verified:** 2026-02-25T11:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                      | Status     | Evidence                                                                                  |
|----|--------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------|
| 1  | RPC_ALL_FAILED and RPC_RECOVERED exist as NotificationEventType values                     | VERIFIED  | `packages/core/src/enums/notification.ts` lines 44-45 contain both values                |
| 2  | RpcPool emits onEvent callback when an endpoint enters cooldown (RPC_HEALTH_DEGRADED)       | VERIFIED  | `rpc-pool.ts` line 186-189: `this.onEvent?.({ type: 'RPC_HEALTH_DEGRADED', ... })`       |
| 3  | RpcPool emits onEvent callback when all endpoints for a network are in cooldown             | VERIFIED  | `rpc-pool.ts` lines 199-202: `this.onEvent?.({ type: 'RPC_ALL_FAILED', ... })`           |
| 4  | RpcPool emits onEvent callback when a previously-failed endpoint recovers (RPC_RECOVERED)  | VERIFIED  | `rpc-pool.ts` lines 224-227: `this.onEvent?.({ type: 'RPC_RECOVERED', ... })`            |
| 5  | When RpcPool fires an event, daemon's NotificationService.notify is called                 | VERIFIED  | `daemon.ts` lines 379-394: onEvent callback invokes `notificationService.notify`          |
| 6  | RpcPoolEvent type is exported from @waiaas/core                                            | VERIFIED  | `packages/core/src/index.ts` line 296: `type RpcPoolEvent`                               |
| 7  | English and Korean i18n templates exist for RPC_ALL_FAILED and RPC_RECOVERED               | VERIFIED  | `en.ts` lines 220-221, `ko.ts` lines 166-167: both templates present                    |
| 8  | EVENT_CATEGORY_MAP and EVENT_DESCRIPTIONS cover new events                                 | VERIFIED  | `signing-protocol.ts` lines 225-226, 276-277: system category + descriptions present     |
| 9  | Integration tests verify MNTR-01 through MNTR-04 end-to-end                               | VERIFIED  | `rpc-pool-notification.test.ts` exists with 9 test blocks                                |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact                                                                  | Provides                                             | Status    | Details                                            |
|---------------------------------------------------------------------------|------------------------------------------------------|-----------|----------------------------------------------------|
| `packages/core/src/enums/notification.ts`                                 | RPC_ALL_FAILED and RPC_RECOVERED event types         | VERIFIED | Lines 44-45 confirmed present                      |
| `packages/core/src/rpc/rpc-pool.ts`                                       | RpcPoolEvent type and onEvent callback option        | VERIFIED | Interface at line 42, onEvent at lines 24, 85, 92  |
| `packages/core/src/i18n/en.ts`                                            | English notification templates for both new events   | VERIFIED | Lines 220-221 confirmed                            |
| `packages/core/src/i18n/ko.ts`                                            | Korean notification templates for both new events    | VERIFIED | Lines 166-167 confirmed                            |
| `packages/core/src/schemas/signing-protocol.ts`                           | EVENT_CATEGORY_MAP and EVENT_DESCRIPTIONS entries    | VERIFIED | Lines 225-226 (category), 276-277 (descriptions)   |
| `packages/core/src/index.ts`                                              | RpcPoolEvent exported for external consumers         | VERIFIED | Line 296: `type RpcPoolEvent`                      |
| `packages/daemon/src/lifecycle/daemon.ts`                                 | RpcPool onEvent wiring to NotificationService        | VERIFIED | Lines 379-394: onEvent callback present and wired  |
| `packages/daemon/src/__tests__/rpc-pool-notification.test.ts`             | Integration tests for MNTR-01 through MNTR-04        | VERIFIED | File exists, 9 test blocks confirmed               |

### Key Link Verification

| From                                    | To                           | Via                                  | Status    | Details                                                           |
|-----------------------------------------|------------------------------|--------------------------------------|-----------|-------------------------------------------------------------------|
| `packages/core/src/rpc/rpc-pool.ts`     | onEvent callback             | reportFailure -> RPC_HEALTH_DEGRADED | VERIFIED | `this.onEvent?.` pattern found at line 186                        |
| `packages/core/src/rpc/rpc-pool.ts`     | onEvent callback             | reportFailure -> RPC_ALL_FAILED      | VERIFIED | `this.onEvent?.` with type 'RPC_ALL_FAILED' at line 199           |
| `packages/core/src/rpc/rpc-pool.ts`     | onEvent callback             | reportSuccess -> RPC_RECOVERED       | VERIFIED | `this.onEvent?.` with type 'RPC_RECOVERED' at line 224            |
| `packages/daemon/src/lifecycle/daemon.ts` | NotificationService.notify | RpcPool onEvent -> notify call       | VERIFIED | onEvent at line 381, notify call at line 392                      |
| `packages/core/src/index.ts`            | RpcPoolEvent (type export)   | re-export from rpc module            | VERIFIED | `type RpcPoolEvent` at line 296                                   |

### Requirements Coverage

| Requirement | Source Plan | Description                                              | Status    | Evidence                                                       |
|-------------|-------------|----------------------------------------------------------|-----------|----------------------------------------------------------------|
| MNTR-01     | 264-01, 264-02 | GET /admin/rpc-status returns per-network RPC status   | VERIFIED | Pre-existing endpoint (Phase 263-01); integration test confirms |
| MNTR-02     | 264-01, 264-02 | RPC_HEALTH_DEGRADED fires when an endpoint enters cooldown | VERIFIED | rpc-pool.ts line 186; integration test covers this scenario    |
| MNTR-03     | 264-01, 264-02 | RPC_ALL_FAILED fires when all network endpoints fail    | VERIFIED | rpc-pool.ts line 199; integration test covers this scenario    |
| MNTR-04     | 264-01, 264-02 | RPC_RECOVERED fires when a cooldown endpoint recovers   | VERIFIED | rpc-pool.ts line 224; integration test covers this scenario    |

### Anti-Patterns Found

No anti-patterns detected. All event emission sites use real logic (cooldown state checks) rather than stubs. The onEvent callback is optional and uses the safe optional-chaining pattern (`this.onEvent?.(...)`).

### Human Verification Required

None. All MNTR requirements are verifiable programmatically through code inspection and integration tests.

### Gaps Summary

No gaps. All must-haves for phase 264 are present, substantive, and wired:

- Plan 264-01 delivered the core building blocks: `RPC_ALL_FAILED` and `RPC_RECOVERED` in the NotificationEventType enum, English and Korean i18n templates, `signing-protocol.ts` category/description entries, the `RpcPoolEvent` interface, and the `onEvent` optional callback in `RpcPool` with correct emission logic in `reportFailure` (HEALTH_DEGRADED + ALL_FAILED) and `reportSuccess` (RECOVERED).
- Plan 264-02 completed the pipeline: the `onEvent` callback is wired in `daemon.ts` to call `NotificationService.notify` with the correct event type and `'system'` walletId; `RpcPoolEvent` is exported from `@waiaas/core`; 9 integration test blocks in `rpc-pool-notification.test.ts` cover all four MNTR requirements end-to-end.

The phase goal is fully achieved: administrators can check RPC status via the API (`GET /admin/rpc-status`, MNTR-01) and receive automatic notifications on degradation (MNTR-02), total failure (MNTR-03), and recovery (MNTR-04).

---

_Verified: 2026-02-25T11:35:00Z_
_Verifier: Claude (gsd-verifier)_
