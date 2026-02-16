---
phase: 140-event-bus-kill-switch
plan: 02
subsystem: services
tags: [kill-switch, state-machine, cas, acid, sqlite, better-sqlite3, migration]

# Dependency graph
requires:
  - phase: 140-event-bus-kill-switch
    provides: "EventBus 인프라 (Plan 01)"
provides:
  - "KillSwitchService 3-state 상태 머신 (ACTIVE/SUSPENDED/LOCKED)"
  - "CAS ACID 패턴 (BEGIN IMMEDIATE + UPDATE WHERE) 원자적 상태 전이"
  - "DB v14 마이그레이션 (NORMAL->ACTIVE, ACTIVATED->SUSPENDED, RECOVERING->ACTIVE)"
affects: [140-03-integration, admin-kill-switch, kill-switch-guard]

# Tech tracking
tech-stack:
  added: []
  patterns: [cas-acid-state-machine, begin-immediate-exclusive-lock]

key-files:
  created:
    - packages/daemon/src/services/kill-switch-service.ts
    - packages/daemon/src/__tests__/kill-switch-service.test.ts
    - packages/daemon/src/__tests__/migration-v14.test.ts
  modified:
    - packages/core/src/enums/system.ts
    - packages/core/src/enums/audit.ts
    - packages/core/src/enums/notification.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/__tests__/migration-chain.test.ts
    - packages/daemon/src/__tests__/migration-runner.test.ts
    - packages/daemon/src/__tests__/migration-v6-v8.test.ts
    - packages/daemon/src/__tests__/notification-channels.test.ts
    - packages/daemon/src/__tests__/settings-schema-migration.test.ts

key-decisions:
  - "CAS ACID 패턴: BEGIN IMMEDIATE + UPDATE WHERE value = expectedState로 원자적 전이"
  - "RECOVERING 상태를 ACTIVE로 통합 (3-state: ACTIVE/SUSPENDED/LOCKED)"
  - "메타데이터(activated_at, activated_by)를 같은 CAS 트랜잭션에서 UPSERT"
  - "i18n 파일(en.ts, ko.ts)에 새 에러 코드 + 알림 이벤트 템플릿 동시 추가"

patterns-established:
  - "CAS ACID 패턴: BEGIN IMMEDIATE -> UPDATE WHERE -> changes() === 0 확인 -> ROLLBACK/COMMIT"
  - "key_value_store 기반 상태 머신: 상태 + 메타데이터(activated_at, activated_by)를 key_value_store에 저장"

# Metrics
duration: 10min
completed: 2026-02-16
---

# Phase 140 Plan 02: KillSwitchService Summary

**KillSwitchService 3-state 상태 머신(ACTIVE/SUSPENDED/LOCKED) + CAS ACID 원자적 전이 + DB v14 마이그레이션**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-16T05:09:00Z
- **Completed:** 2026-02-16T05:18:25Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- KillSwitchService 3-state 상태 머신 구현 (ACTIVE/SUSPENDED/LOCKED, 4 valid transitions)
- CAS ACID 패턴(BEGIN IMMEDIATE + UPDATE WHERE value = expectedState)으로 동시성 제어
- KILL_SWITCH_STATES SSoT 갱신 + AUDIT_ACTIONS/NOTIFICATION_EVENT_TYPES 확장 + 에러 코드 추가
- DB v14 마이그레이션: 기존 NORMAL->ACTIVE, ACTIVATED->SUSPENDED, RECOVERING->ACTIVE 값 변환
- 31개 새 테스트 (KillSwitchService 22 + migration-v14 9) + 기존 테스트 전체 호환

## Task Commits

Each task was committed atomically:

1. **Task 1: Core 타입 업데이트 + KillSwitchService 3-state 상태 머신 + CAS ACID** - `ba86248` (feat)
2. **Task 2: DB v14 마이그레이션 + 마이그레이션 테스트** - `11467f6` (feat)

## Files Created/Modified
- `packages/daemon/src/services/kill-switch-service.ts` - KillSwitchService 3-state 상태 머신 (getState, activate, escalate, recoverFromSuspended, recoverFromLocked, ensureInitialized)
- `packages/daemon/src/__tests__/kill-switch-service.test.ts` - 22개 단위 테스트 (CAS ACID, 잘못된 전이, 동시성, 메타데이터)
- `packages/daemon/src/__tests__/migration-v14.test.ts` - 9개 마이그레이션 테스트 (NORMAL->ACTIVE, ACTIVATED->SUSPENDED, RECOVERING->ACTIVE, 엣지 케이스)
- `packages/core/src/enums/system.ts` - KILL_SWITCH_STATES: ['ACTIVE', 'SUSPENDED', 'LOCKED']
- `packages/core/src/enums/audit.ts` - KILL_SWITCH_RECOVERED, KILL_SWITCH_ESCALATED 추가
- `packages/core/src/enums/notification.ts` - KILL_SWITCH_ESCALATED 추가
- `packages/core/src/errors/error-codes.ts` - KILL_SWITCH_ALREADY_ACTIVE, INVALID_STATE_TRANSITION 추가
- `packages/core/src/i18n/en.ts` - 새 에러 메시지 + 알림 템플릿
- `packages/core/src/i18n/ko.ts` - 새 에러 메시지 + 알림 템플릿
- `packages/daemon/src/infrastructure/database/migrate.ts` - LATEST_SCHEMA_VERSION 14, v14 마이그레이션
- `packages/daemon/src/__tests__/migration-chain.test.ts` - 버전 13->14 어서션 업데이트
- `packages/daemon/src/__tests__/migration-runner.test.ts` - 테스트 마이그레이션 버전 15/16/17로 범프
- `packages/daemon/src/__tests__/migration-v6-v8.test.ts` - LATEST_SCHEMA_VERSION 14 + 스키마 등가 테스트 수정
- `packages/daemon/src/__tests__/notification-channels.test.ts` - EVENT_TYPES 22->23 업데이트
- `packages/daemon/src/__tests__/settings-schema-migration.test.ts` - 버전 12->14 업데이트

## Decisions Made
- **CAS ACID 패턴 구현:** BEGIN IMMEDIATE로 exclusive lock 획득 후, UPDATE WHERE value = expectedState로 CAS 체크. changes() === 0이면 CAS 실패로 ROLLBACK. v0.10 CONC-03 설계를 정확히 반영.
- **RECOVERING 상태 제거:** 기존 3-state(NORMAL/ACTIVATED/RECOVERING)에서 새 3-state(ACTIVE/SUSPENDED/LOCKED)로 전환. RECOVERING은 ACTIVE로 통합 (복구 = 정상 상태로 돌아감).
- **메타데이터 트랜잭션 통합:** activated_at, activated_by를 CAS 전이와 같은 BEGIN IMMEDIATE 트랜잭션에서 UPSERT하여 일관성 보장. 복구 시 metadata 초기화.
- **i18n 동기화:** en.ts/ko.ts에 KILL_SWITCH_ALREADY_ACTIVE, INVALID_STATE_TRANSITION 에러 메시지 + KILL_SWITCH_ESCALATED 알림 템플릿을 TypeScript Record 타입 체계에 맞게 추가.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n 파일 누락으로 Core 빌드 실패**
- **Found during:** Task 1 (Core 타입 업데이트)
- **Issue:** ERROR_CODES에 새 키를 추가했지만 en.ts/ko.ts에 해당 메시지가 없어 TypeScript Record 타입 에러로 빌드 실패
- **Fix:** en.ts와 ko.ts에 KILL_SWITCH_ALREADY_ACTIVE, INVALID_STATE_TRANSITION 에러 메시지 + KILL_SWITCH_ESCALATED 알림 템플릿 추가
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Verification:** `pnpm --filter @waiaas/core build` 성공
- **Committed in:** ba86248 (Task 1 commit)

**2. [Rule 1 - Bug] 기존 마이그레이션 테스트들의 하드코딩된 버전 번호**
- **Found during:** Task 2 (DB v14 마이그레이션 + 테스트)
- **Issue:** migration-chain.test.ts, migration-runner.test.ts, migration-v6-v8.test.ts, settings-schema-migration.test.ts, notification-channels.test.ts에서 LATEST_SCHEMA_VERSION이 13으로 하드코딩되어 v14 추가 후 실패
- **Fix:** 총 6개 테스트 파일에서 버전 어서션 갱신 (13->14), migration-runner.test.ts의 테스트 마이그레이션 버전을 15/16/17로 범프, migration-v6-v8.test.ts의 스키마 등가 테스트에서 전체 마이그레이션 실행하도록 수정
- **Files modified:** 5개 테스트 파일 (위 목록 참조)
- **Verification:** `pnpm --filter @waiaas/daemon exec vitest run` 전체 테스트 통과 (1342 passed, 1 pre-existing failure)
- **Committed in:** 11467f6 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** 모두 정상 동작을 위한 필수 수정. 스코프 크립 없음.

## Issues Encountered
- api-policies.test.ts 1개 테스트 실패는 main 브랜치에서도 존재하는 pre-existing failure로 본 계획 변경과 무관함

## User Setup Required
None - 외부 서비스 설정 불필요.

## Next Phase Readiness
- KillSwitchService가 독립적으로 동작하며 Plan 03(Integration)에서 kill-switch-guard 미들웨어와 Admin API에 연결 예정
- EventBus(Plan 01)와 KillSwitchService(Plan 02)가 모두 완료되어 통합 준비 완료
- DB v14 마이그레이션이 기존 데이터 호환성을 보장하므로 업그레이드 경로 안전

## Self-Check: PASSED

- 15/15 files found
- 2/2 commits found (ba86248, 11467f6)

---
*Phase: 140-event-bus-kill-switch*
*Completed: 2026-02-16*
