# #207 — 파이프라인 재진입 시 notificationService 누락으로 텔레그램 알림 미발송

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v29.3
- **상태:** FIXED
- **발견일:** 2026-02-27

## 현상

DELAY 대기(시간 지연 정책) 또는 GAS_WAITING 대기(가스 조건부 실행) 상태의 트랜잭션이 실행되었을 때, `TX_SUBMITTED` / `TX_CONFIRMED` / `TX_FAILED` 알림이 텔레그램·Discord·ntfy·Slack 등 모든 알림 채널로 발송되지 않는다.

즉시 실행(INSTANT/NOTIFY 티어)되는 트랜잭션은 정상적으로 알림이 발송된다.

## 원인

`daemon.ts`의 파이프라인 재진입 메서드 2곳에서 `PipelineContext`를 구성할 때 `notificationService` 필드를 포함하지 않는다:

1. **`executeFromStage4()`** (1667행) — 가스 조건 충족 후 Stage 5-6 재개
2. **`executeFromStage5()`** (1765행) — DELAY 타이머 만료 후 Stage 5-6 재개

`stages.ts`에서는 `ctx.notificationService?.notify(...)` 형태로 호출하므로, `notificationService`가 `undefined`이면 옵셔널 체이닝에 의해 조용히 무시된다.

`eventBus`는 정상 설정되어 `transaction:completed` 등 EventBus 이벤트는 발생하지만, 외부 알림 채널(텔레그램, Discord, ntfy, Slack)은 `NotificationService`를 통해서만 동작하므로 알림이 전달되지 않는다.

## 영향 범위

| 시나리오 | TX_SUBMITTED 알림 | TX_CONFIRMED 알림 |
|---|---|---|
| 즉시 실행 (INSTANT/NOTIFY) | O | O |
| DELAY 대기 후 실행 | **X** | **X** |
| GAS_WAITING 대기 후 실행 | **X** | **X** |

## 수정 방안

두 재진입 메서드의 `PipelineContext` 구성에 `notificationService` 추가:

```typescript
// executeFromStage4() — 1667행
// executeFromStage5() — 1765행
const ctx: PipelineContext = {
  // ... 기존 필드 ...
  eventBus: this.eventBus,
  notificationService: this.notificationService ?? undefined,  // 추가
};
```

## 관련 파일

- `packages/daemon/src/lifecycle/daemon.ts` — `executeFromStage4()`, `executeFromStage5()`
- `packages/daemon/src/pipeline/stages.ts` — `stage5Execute()`, `stage6Confirm()`
- `packages/daemon/src/notifications/notification-service.ts`

## 테스트 항목

1. **DELAY 재진입 알림 테스트**: DELAY 티어 트랜잭션이 타이머 만료 후 `executeFromStage5()`를 통해 실행될 때 `notificationService.notify('TX_SUBMITTED', ...)` 및 `notify('TX_CONFIRMED', ...)`가 호출되는지 검증
2. **GAS_WAITING 재진입 알림 테스트**: 가스 조건 충족 후 `executeFromStage4()`를 통해 실행될 때 `notificationService.notify('TX_SUBMITTED', ...)` 및 `notify('TX_CONFIRMED', ...)`가 호출되는지 검증
3. **실패 케이스 알림 테스트**: 재진입 파이프라인에서 트랜잭션 실패 시 `notify('TX_FAILED', ...)`가 정상 호출되는지 검증
4. **notificationService null 안전성**: `notificationService`가 null일 때(알림 미설정 환경) 재진입이 에러 없이 동작하는지 검증
