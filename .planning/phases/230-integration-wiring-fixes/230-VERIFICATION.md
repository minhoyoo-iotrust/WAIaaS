---
phase: 230-integration-wiring-fixes
verified: 2026-02-22T08:25:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 230: Integration Wiring Fixes Verification Report

**Phase Goal:** 감사에서 발견된 3개 통합 버그(BUG-1 BackgroundWorkers 인스턴스 분리, BUG-2 폴링 워커 빈 핸들러, BUG-3 Gap Recovery 스텁)를 수정하여, 8개 partial 요구사항을 satisfied로 전환하고 3개 깨진 E2E 플로우를 복구하는 상태
**Verified:** 2026-02-22T08:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | IncomingTxMonitorService's 6 workers are registered to the daemon's shared BackgroundWorkers instance and start via startAll() | VERIFIED | daemon.ts pre-creates `this.workers` before Step 4c-9 (lines 757-759); Step 6 calls `this.workers.startAll()` exactly once (line 1085) |
| 2 | Polling worker 5 (Solana) calls subscriber.pollAll() via multiplexer getSubscribersForChain('solana') | VERIFIED | incoming-tx-monitor-service.ts lines 441-449: handler calls `this.multiplexer.getSubscribersForChain('solana')` and `subscriber.pollAll()` |
| 3 | Polling worker 6 (EVM) calls subscriber.pollAll() via multiplexer getSubscribersForChain('ethereum') -- the ONLY EVM detection path | VERIFIED | incoming-tx-monitor-service.ts lines 456-464: handler calls `this.multiplexer.getSubscribersForChain('ethereum')` and `subscriber.pollAll()` |
| 4 | onGapRecovery callback wires createGapRecoveryHandler via multiplexer.getSubscriberEntries() | VERIFIED | incoming-tx-monitor-service.ts lines 125-137: `createGapRecoveryHandler({ subscribers: this.multiplexer.getSubscriberEntries() })` invoked on every reconnect |
| 5 | Integration test proves monitor's 6 workers are registered to the same BackgroundWorkers instance passed via deps | VERIFIED | integration-wiring.test.ts lines 134-160: BUG-1 test asserts `workers.register` called 6 times with exact names; 7/7 tests pass |
| 6 | Integration test proves polling worker handlers invoke subscriber.pollAll() for both solana and ethereum chains | VERIFIED | integration-wiring.test.ts lines 193-342: BUG-2 tests verify Solana + EVM handlers call `mockPollAll`; error handling graceful |
| 7 | Integration test proves onGapRecovery invokes createGapRecoveryHandler which calls subscriber.pollAll() | VERIFIED | integration-wiring.test.ts lines 355-450: BUG-3 tests verify callback chain and graceful missing-chain handling |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/lifecycle/daemon.ts` | BackgroundWorkers created BEFORE Step 4c-9; removed from Step 6 | VERIFIED | Lines 757-759: `if (!this.workers) { this.workers = new BackgroundWorkers(); }` before Step 4c-9 try block; Step 6 uses double-guard `if (!this.workers)` then registers workers and calls `startAll()` once |
| `packages/daemon/src/services/incoming/subscription-multiplexer.ts` | Two accessor methods for subscriber access | VERIFIED | `getSubscriberEntries()` at lines 211-216; `getSubscribersForChain(chainPrefix)` at lines 222-236; both public methods exported on the class |
| `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` | Filled polling worker handlers + wired gap recovery callback | VERIFIED | `createGapRecoveryHandler` imported at line 33; Worker 5 handler at lines 441-449; Worker 6 handler at lines 456-464; `onGapRecovery` wired at lines 125-137 |
| `packages/daemon/src/services/incoming/__tests__/integration-wiring.test.ts` | Integration tests for BUG-1, BUG-2, BUG-3 fixes; min 100 lines | VERIFIED | 451 lines; 7 tests across 3 describe blocks; all 7 pass |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| daemon.ts Step 4c-9 | this.workers (BackgroundWorkers) | same shared instance passed to IncomingTxMonitorService | WIRED | `if (!this.workers) { this.workers = new BackgroundWorkers(); }` executes before monitor construction; `workers: this.workers ?? new BackgroundWorkers()` passes shared instance (fallback is dead code) |
| incoming-tx-monitor-service.ts Worker 5/6 | SubscriptionMultiplexer.getSubscribersForChain() | polling worker handlers call multiplexer accessor | WIRED | Both workers call `this.multiplexer.getSubscribersForChain('solana'/'ethereum')` in their handlers |
| incoming-tx-monitor-service.ts onGapRecovery | createGapRecoveryHandler + multiplexer.getSubscriberEntries() | closure captures this.multiplexer, invokes handler | WIRED | `createGapRecoveryHandler({ subscribers: this.multiplexer.getSubscriberEntries() })` then `await handler(chain, network, walletIds)` |
| integration-wiring.test.ts | IncomingTxMonitorService | imports and instantiates with mock deps, verifies worker registration and handler behavior | WIRED | Test imports `IncomingTxMonitorService`, creates with mock `workers`, calls `service.start()`, asserts `workers.register` called 6 times with correct names |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SUB-02 | 230-01, 230-02 | SolanaIncomingSubscriber polling path wired via Worker 5 + getSubscribersForChain('solana') | SATISFIED | Polling handler confirmed in incoming-tx-monitor-service.ts lines 441-449; test in integration-wiring.test.ts lines 193-239 |
| SUB-03 | 230-01, 230-02 | EvmIncomingSubscriber polling path wired via Worker 6 + getSubscribersForChain('ethereum') | SATISFIED | Polling handler confirmed in incoming-tx-monitor-service.ts lines 456-464; test in integration-wiring.test.ts lines 241-287 |
| SUB-04 | 230-01, 230-02 | WebSocket-to-polling fallback via polling workers now non-empty | SATISFIED | Workers 5/6 now invoke `subscriber.pollAll()` enabling POLLING_FALLBACK state to actually poll |
| SUB-05 | 230-01, 230-02 | Gap recovery via incoming_tx_cursors table -- onGapRecovery now wired to createGapRecoveryHandler | SATISFIED | `onGapRecovery` callback invokes `createGapRecoveryHandler` which calls `entry.subscriber.pollAll()` for the reconnected chain:network |
| STO-02 | 230-01, 230-02 | IncomingTxQueue batch flush via BackgroundWorkers -- worker 'incoming-tx-flush' now registered to shared instance | SATISFIED | All 6 monitor workers including 'incoming-tx-flush' register to the daemon's shared BackgroundWorkers; `startAll()` starts them all |
| STO-03 | 230-01, 230-02 | 2-phase confirmation worker now registered to shared BackgroundWorkers | SATISFIED | 'incoming-tx-confirm-solana' and 'incoming-tx-confirm-evm' workers registered to shared instance |
| STO-05 | 230-01, 230-02 | Retention policy worker registered to shared BackgroundWorkers | SATISFIED | 'incoming-tx-retention' worker registered to shared instance; `startAll()` starts it |
| CFG-04 | 230-01, 230-02 | DaemonLifecycle Step 4c-9 wiring now complete with shared BackgroundWorkers | SATISFIED | Step 4c-9 in daemon.ts uses shared `this.workers` instance (pre-created); `startAll()` called once in Step 6 after all registrations |

**All 8 requirements: SATISFIED**

Note: REQUIREMENTS.md coverage summary (lines 119-121) still shows stale text "Satisfied: 22, Pending: 8" from before Phase 230 ran. However, all 30 v1 requirements are individually marked `[x]` and the traceability table shows "Complete" for all 8 Phase 230 requirements. The summary statistics are a cosmetic documentation inconsistency only — no action needed for goal achievement.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| daemon.ts | 797 | `this.workers ?? new BackgroundWorkers()` — fallback is now dead code | Info | No runtime impact; `this.workers` is always set before this line due to the pre-creation guard at lines 757-759. Defensive coding per plan decision. |

No blocker or warning anti-patterns found.

---

### Human Verification Required

None. All phase goals are verifiable programmatically.

---

### Gaps Summary

No gaps. All 7 must-have truths verified, all 4 artifacts confirmed substantive and wired, all 3 key links confirmed connected, all 8 requirements satisfied.

**Commit verification:**
- `61324096` — `fix(230-01): wire BackgroundWorkers, polling workers, and gap recovery across daemon lifecycle` — 3 files changed, +70/-14 lines
- `fe182e1f` — `test(230-02): add integration wiring tests for BUG-1, BUG-2, BUG-3 fixes` — 1 file created, 451 lines

**Test result:** 2859 passed, 1 skipped — 161 test files (all daemon tests pass, including all 7 new integration-wiring tests)

---

_Verified: 2026-02-22T08:25:00Z_
_Verifier: Claude (gsd-verifier)_
