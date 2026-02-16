---
phase: 140-event-bus-kill-switch
plan: 01
subsystem: core/events, daemon/pipeline
tags: [event-bus, eventEmitter, pipeline-events, infrastructure]
dependency-graph:
  requires: []
  provides: [EventBus, WaiaasEventMap, pipeline-event-emission]
  affects: [pipeline/stages, pipeline/sign-only, routes/x402, routes/sessions, routes/wallets, lifecycle/daemon]
tech-stack:
  added: [EventBus (node:events wrapper)]
  patterns: [typed-eventEmitter, fire-and-forget, listener-error-isolation, optional-chaining-emit]
key-files:
  created:
    - packages/core/src/events/event-types.ts
    - packages/core/src/events/event-bus.ts
    - packages/core/src/events/index.ts
    - packages/daemon/src/__tests__/event-bus.test.ts
  modified:
    - packages/core/src/index.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/pipeline/sign-only.ts
    - packages/daemon/src/api/routes/x402.ts
    - packages/daemon/src/api/routes/sessions.ts
    - packages/daemon/src/api/routes/wallets.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/lifecycle/daemon.ts
decisions:
  - "EventBus는 EventEmitter 기반 typed wrapper -- 최소한의 추상화로 Node.js 기본 메커니즘 활용"
  - "emit()에서 리스너별 try/catch로 에러 격리 -- EventEmitter 기본 동작(동기 호출 시 에러 전파) 대신 안전한 방식 선택"
  - "eventBus는 optional chaining(?.)으로 호출 -- 기존 코드 무중단, 테스트에서도 eventBus 없이 동작"
  - "DaemonLifecycle에서 단일 EventBus 인스턴스 생성, createApp deps로 전달"
metrics:
  duration: 12m
  completed: 2026-02-16
  tasks: 2/2
  tests-added: 17
  files-created: 4
  files-modified: 9
---

# Phase 140 Plan 01: Event Bus 인프라 + 파이프라인 이벤트 발행 Summary

EventEmitter 기반 typed EventBus를 @waiaas/core에 구축하고 기존 파이프라인 전체 notify() 호출 지점에서 이벤트를 동시 발행

## What Was Done

### Task 1: @waiaas/core EventBus 인프라 + 이벤트 타입 정의 (d666c46)

- `packages/core/src/events/event-types.ts`: 3가지 이벤트 타입 정의
  - `TransactionCompletedEvent`: txHash, amount, network, type 포함
  - `TransactionFailedEvent`: error, network, type 포함
  - `WalletActivityEvent`: activity enum (TX_REQUESTED, SESSION_CREATED, OWNER_SET, TX_SUBMITTED)
  - `WaiaasEventMap`: typed key->payload 매핑
- `packages/core/src/events/event-bus.ts`: EventBus 클래스
  - Node.js `EventEmitter` 기반 typed wrapper
  - `on<K>()`, `emit<K>()`, `removeAllListeners()`, `listenerCount()` 메서드
  - emit()에서 리스너별 try/catch로 에러 격리 (한 리스너 실패 시 다른 리스너 정상 실행)
  - constructor에서 `error` 이벤트 리스너 등록 (unhandled rejection 방지)
- 17개 단위 테스트: 생성, emit/on (3 이벤트 타입), 다중 리스너, 에러 격리, removeAllListeners, listenerCount, 이벤트 간 격리

### Task 2: 파이프라인 + 라우트에서 EventBus 이벤트 동시 발행 (fe11fba)

- `PipelineContext`에 `eventBus?: EventBus` 필드 추가
- **stages.ts** (6-stage 파이프라인):
  - Stage 1: TX_REQUESTED -> `wallet:activity` 발행
  - Stage 5: TX_SUBMITTED -> `wallet:activity` 발행, 실패 시(simulation/permanent/transient/stale) -> `transaction:failed` 발행
  - Stage 6: TX_CONFIRMED -> `transaction:completed` 발행, on-chain revert -> `transaction:failed` 발행
- **sign-only.ts**: TX_REQUESTED/TX_SUBMITTED -> `wallet:activity` 발행
- **x402.ts**: TX_REQUESTED -> `wallet:activity`, TX_CONFIRMED -> `transaction:completed`, 7개 실패 지점 -> `transaction:failed`
- **sessions.ts**: SESSION_CREATED -> `wallet:activity` 발행
- **wallets.ts**: OWNER_SET -> `wallet:activity` 발행
- **daemon.ts**: `EventBus` 인스턴스 생성, `createApp()` deps 주입, executeFromStage5 pipeline ctx 주입, shutdown 시 `removeAllListeners()`
- **server.ts**: `CreateAppDeps`에 `eventBus?` 추가, walletCrudRoutes/sessionRoutes/transactionRoutes/x402Routes에 전달

## Deviations from Plan

None -- plan executed exactly as written.

## Key Integration Points

| 이벤트 발행 지점 | 이벤트 타입 | 파일 |
|---|---|---|
| Stage 1 TX_REQUESTED | wallet:activity | stages.ts |
| Stage 5 TX_SUBMITTED | wallet:activity | stages.ts |
| Stage 5 TX_FAILED (5개 지점) | transaction:failed | stages.ts |
| Stage 6 TX_CONFIRMED | transaction:completed | stages.ts |
| Stage 6 TX_FAILED (revert) | transaction:failed | stages.ts |
| Sign-only TX_REQUESTED | wallet:activity | sign-only.ts |
| Sign-only TX_SUBMITTED | wallet:activity | sign-only.ts |
| x402 TX_REQUESTED | wallet:activity | x402.ts |
| x402 TX_CONFIRMED | transaction:completed | x402.ts |
| x402 TX_FAILED (7개 지점) | transaction:failed | x402.ts |
| SESSION_CREATED | wallet:activity | sessions.ts |
| OWNER_SET | wallet:activity | wallets.ts |

## Verification Results

- `pnpm --filter @waiaas/core build`: 성공
- `pnpm --filter @waiaas/daemon build`: 성공
- EventBus 단위 테스트: 17/17 통과
- 전체 daemon 테스트: 1,342/1,343 통과 (1개 기존 실패: api-policies.test.ts -- 본 변경과 무관)

## Self-Check: PASSED

- All 4 created files exist on disk
- Task 1 commit d666c46 verified
- Task 2 commit fe11fba verified

## Next Steps

- Phase 141 (AutoStop Engine): EventBus 구독하여 `transaction:completed`/`transaction:failed` 기반 자동 중지 로직 구현
- Phase 142 (Balance Monitoring): EventBus 구독하여 `transaction:completed` 기반 잔액 모니터링 구현
