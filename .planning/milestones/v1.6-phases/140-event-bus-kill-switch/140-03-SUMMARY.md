---
phase: 140-event-bus-kill-switch
plan: 03
subsystem: kill-switch
tags: [kill-switch, cascade, rest-api, dual-auth, middleware]
dependency_graph:
  requires: ["140-01", "140-02"]
  provides: ["kill-switch-cascade", "kill-switch-api", "kill-switch-middleware", "dual-auth-recovery"]
  affects: ["admin-routes", "daemon-lifecycle", "event-bus"]
tech_stack:
  added: []
  patterns: ["6-step-cascade", "CAS-ACID-with-cascade", "dual-auth-recovery", "3-state-middleware"]
key_files:
  created:
    - packages/daemon/src/__tests__/kill-switch-cascade.test.ts
    - packages/daemon/src/__tests__/kill-switch-api.test.ts
  modified:
    - packages/daemon/src/services/kill-switch-service.ts
    - packages/daemon/src/api/middleware/kill-switch-guard.ts
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/core/src/events/event-types.ts
    - packages/core/src/events/index.ts
    - packages/daemon/src/__tests__/kill-switch-service.test.ts
    - packages/daemon/src/__tests__/api-server.test.ts
    - packages/daemon/src/__tests__/api-admin-endpoints.test.ts
    - packages/daemon/src/__tests__/api-hint-field.test.ts
    - packages/daemon/src/__tests__/admin-serving.test.ts
decisions:
  - "LOCKED 복구 대기 시간 5초 (config 조정 가능하게 하되 기본값 5000ms)"
  - "Owner 미등록 시 Master 패스워드만으로 복구 허용 (dual-auth owner 부분 skip)"
  - "kill-switch:state-changed EventBus 이벤트 추가 (AutoStop/BalanceMonitor 구독용)"
  - "기존 ACTIVATED 상태명을 SUSPENDED로, NORMAL을 ACTIVE로 전환 (4개 기존 테스트 업데이트)"
metrics:
  duration: 16m
  completed: 2026-02-16
---

# Phase 140 Plan 03: Kill Switch 6-step Cascade + REST API + Middleware Summary

Kill Switch 6-step cascade 로직, REST API(admin + owner), dual-auth 복구 API, killSwitch 미들웨어 3-state 리팩토링 구현 완료. 발동 시 세션 무효화/거래 중단/월렛 정지/API 차단/알림/감사로그가 순차 실행되며, masterAuth 또는 ownerAuth로 발동, dual-auth로 복구.

## What Was Done

### Task 1: 6-step Cascade + killSwitch Middleware 3-state Refactoring

**KillSwitchService 확장** (`packages/daemon/src/services/kill-switch-service.ts`):
- `executeCascade(activatedBy)`: 6-step cascade 순차 실행
  - Step 1: 모든 활성 세션 revoked_at 설정 (세션 무효화)
  - Step 2: PENDING/QUEUED/EXECUTING 거래 -> CANCELLED 상태 전환
  - Step 3: 모든 ACTIVE 월렛 -> SUSPENDED 상태 전환
  - Step 4: API 503은 미들웨어가 처리 (KillSwitchService 상태 기반)
  - Step 5: KILL_SWITCH_ACTIVATED 알림 발송 (NotificationService)
  - Step 6: audit_log INSERT (severity: critical)
- `activateWithCascade(activatedBy)`: CAS activate + executeCascade
- `escalateWithCascade(escalatedBy)`: CAS escalate + KILL_SWITCH_ESCALATED 알림 + 감사 로그
- constructor를 `{ sqlite, notificationService?, eventBus? }` 형태로 변경
- `kill-switch:state-changed` EventBus 이벤트 emit

**killSwitch 미들웨어 리팩토링** (`packages/daemon/src/api/middleware/kill-switch-guard.ts`):
- `ACTIVATED` 체크 -> `SUSPENDED || LOCKED` 체크로 변경 (3-state)
- 에러: `KILL_SWITCH_ACTIVE` -> `SYSTEM_LOCKED` (503)
- `/v1/owner/*` 경로 bypass 추가 (Owner kill-switch 발동 + 복구)

**EventBus 이벤트 타입** (`packages/core/src/events/event-types.ts`):
- `KillSwitchStateChangedEvent` 인터페이스 추가
- `WaiaasEventMap`에 `kill-switch:state-changed` 이벤트 추가

### Task 2: Kill Switch REST API + dual-auth Recovery + DaemonLifecycle

**REST API** (`packages/daemon/src/api/routes/admin.ts`):
- `POST /v1/admin/kill-switch`: KillSwitchService.activateWithCascade('master') 호출, SUSPENDED 반환
- `POST /v1/admin/kill-switch/escalate`: KillSwitchService.escalateWithCascade('master') 호출, LOCKED 반환
- `GET /v1/admin/kill-switch`: KillSwitchService.getState() 기반 상태 조회
- `POST /v1/admin/recover`: dual-auth 복구 (Owner 등록 시 ownerAddress 매칭 필수, 미등록 시 master-only)
  - LOCKED 복구 시 5초 추가 대기 시간
  - KILL_SWITCH_RECOVERED 알림 발송
- `POST /v1/owner/kill-switch`: ownerAuth 보호, Owner가 직접 Kill Switch 발동

**OpenAPI 스키마** (`packages/daemon/src/api/routes/openapi-schemas.ts`):
- `KillSwitchActivateResponseSchema`: state를 'SUSPENDED'로 변경
- `KillSwitchEscalateResponseSchema`: `{ state: 'LOCKED', escalatedAt }` 신규
- `RecoverResponseSchema`: state를 'ACTIVE'로 변경
- `KillSwitchRecoverRequestSchema`: dual-auth body 스키마 신규
- `OwnerKillSwitchResponseSchema`: `{ state: 'SUSPENDED', activatedAt }` 신규

**Server 통합** (`packages/daemon/src/api/server.ts`):
- `CreateAppDeps`에 `killSwitchService` 추가
- killSwitchGuard에 KillSwitchService.getState().state 기반 상태 전달
- Owner kill-switch 라우트 등록 + ownerAuth 미들웨어 적용
- `/v1/admin/kill-switch/escalate`에 masterAuth 미들웨어 적용

**DaemonLifecycle 통합** (`packages/daemon/src/lifecycle/daemon.ts`):
- Step 4c-2: KillSwitchService 인스턴스 생성 + ensureInitialized()
- NotificationService 초기화 후 KillSwitchService 재생성 (notificationService 연결)
- createApp()에 killSwitchService 전달

**기존 테스트 마이그레이션** (4개 파일):
- `api-server.test.ts`: ACTIVATED -> SUSPENDED, 409 -> 503, KILL_SWITCH_ACTIVE -> SYSTEM_LOCKED
- `api-admin-endpoints.test.ts`: ACTIVATED -> SUSPENDED, NORMAL -> ACTIVE/NORMAL, 409 -> 503
- `api-hint-field.test.ts`: KILL_SWITCH_ACTIVE -> SYSTEM_LOCKED, 409 -> 503
- `admin-serving.test.ts`: ACTIVATED -> SUSPENDED, 409 -> 503

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 기존 테스트 ACTIVATED/NORMAL 상태명 마이그레이션**
- **Found during:** Task 2
- **Issue:** 기존 테스트가 ACTIVATED/NORMAL 상태명과 409 KILL_SWITCH_ACTIVE 에러를 사용
- **Fix:** 4개 테스트 파일에서 SUSPENDED/LOCKED + 503 SYSTEM_LOCKED로 업데이트
- **Files modified:** api-server.test.ts, api-admin-endpoints.test.ts, api-hint-field.test.ts, admin-serving.test.ts
- **Commit:** 6c1348c

## Test Results

- **kill-switch-cascade.test.ts**: 14/14 passed (신규)
- **kill-switch-api.test.ts**: 15/15 passed (신규)
- **kill-switch-service.test.ts**: 22/22 passed (기존, constructor 변경 적용)
- **전체 daemon 테스트**: 1371/1372 passed (1개 pre-existing: api-policies 400 vs 404)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | d014554 | Kill Switch 6-step cascade + killSwitch 미들웨어 3-state 리팩토링 |
| 2 | 6c1348c | Kill Switch REST API + dual-auth 복구 + DaemonLifecycle 통합 |

## Self-Check: PASSED

All 9 key files verified present. Both commits (d014554, 6c1348c) confirmed in git log.
