---
phase: 144-admin-ui-integration
plan: 01
subsystem: admin-ui
tags: [admin, kill-switch, telegram, preact, ui]
dependency-graph:
  requires: [daemon-admin-routes, kill-switch-service, telegram-users-table]
  provides: [kill-switch-3state-ui, telegram-users-page]
  affects: [settings-page, layout-navigation]
tech-stack:
  added: []
  patterns: [3-state-kill-switch-ui, telegram-user-management]
key-files:
  created:
    - packages/admin/src/pages/telegram-users.tsx
    - packages/admin/src/__tests__/telegram-users.test.tsx
  modified:
    - packages/admin/src/pages/settings.tsx
    - packages/admin/src/api/endpoints.ts
    - packages/admin/src/components/layout.tsx
    - packages/admin/src/__tests__/settings.test.tsx
decisions:
  - "Kill Switch 3-state(ACTIVE/SUSPENDED/LOCKED)에 맞게 settings-section에서 settings-category 패턴으로 교체"
  - "Telegram Users 페이지에 Table + Badge + Modal 패턴 적용 (sessions.tsx 패턴 참조)"
  - "Approve 모달에서 ADMIN/READONLY select 제공, Delete 확인 모달 danger variant"
metrics:
  duration: 6m
  completed: 2026-02-16
  tasks: 2/2
  tests-added: 12
  tests-total: 26 (settings 19 + telegram-users 7)
---

# Phase 144 Plan 01: Kill Switch 3-state UI + Telegram Users Page Summary

Kill Switch 2-state 토글을 3-state(ACTIVE/SUSPENDED/LOCKED) UI로 리팩토링하고 Telegram Users 관리 페이지를 신규 추가.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | e974d2a | Kill Switch 3-state UI 리팩토링 + API 엔드포인트 추가 |
| 2 | f10dd49 | Telegram Users 관리 페이지 + 사이드바 라우트 추가 |

## Task 1: Kill Switch 3-state UI 리팩토링

### Changes
- **endpoints.ts**: `ADMIN_KILL_SWITCH_ESCALATE`, `ADMIN_TELEGRAM_USERS`, `ADMIN_TELEGRAM_USER` 3개 엔드포인트 추가
- **settings.tsx**: `handleKillSwitchToggle` 삭제 -> `handleKillSwitchActivate`, `handleKillSwitchEscalate`, `handleKillSwitchRecover` 3개 함수로 교체
- **settings.tsx**: `isActivated` 삭제 -> `isActive`, `isSuspended`, `isLocked` 3개 상태 변수
- **settings.tsx**: Kill Switch 섹션을 `settings-section`에서 `settings-category` 패턴으로 변경
- Badge variant: ACTIVE=success, SUSPENDED=warning, LOCKED=danger
- 상태별 적절한 버튼: ACTIVE->Activate, SUSPENDED->Recover+Escalate, LOCKED->Recover(5s wait)
- SUSPENDED/LOCKED 상태에서 정보 박스 표시

### Tests (19 total, 5 new)
- Test 13: ACTIVE 상태 Activate Kill Switch 버튼 렌더 확인
- Test 15: SUSPENDED 상태 Recover + Escalate to LOCKED 버튼 렌더 확인
- Test 16: LOCKED 상태 Recover from LOCKED (5s wait) 버튼 렌더 확인
- Test 17: Activate 클릭 -> POST /v1/admin/kill-switch 호출 확인
- Test 18: Escalate 클릭 -> POST /v1/admin/kill-switch/escalate 호출 확인
- Test 19: Recover 클릭 -> POST /v1/admin/recover 호출 확인

## Task 2: Telegram Users 관리 페이지

### Changes
- **telegram-users.tsx** (248줄): Table + Badge + Modal 패턴으로 구현
  - 6개 컬럼: Chat ID, Username, Role(Badge), Registered, Approved, Actions
  - PENDING 사용자: Approve 버튼 -> 모달에서 ADMIN/READONLY 선택
  - 모든 사용자: Delete 버튼 -> 확인 모달
  - EmptyState: "No Telegram users registered..."
- **layout.tsx**: TelegramUsersPage import, NAV_ITEMS에 Telegram 추가, /telegram-users 라우트

### Tests (7 total, all new)
- Test 1: 3명 사용자 목록 렌더 + Badge variant 확인
- Test 2: 빈 목록 EmptyState 메시지
- Test 3: PENDING 사용자 Approve -> apiPut 호출 확인
- Test 4: 사용자 Delete -> apiDelete 호출 확인
- Test 5: apiPut 실패 시 에러 toast 확인
- Test 6: 초기 로딩 상태 확인
- Test 7: null username -> dash("-") 표시 확인

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing settings test mock에 api-keys 엔드포인트 누락**
- **Found during:** Task 1
- **Issue:** mockApiCalls()에서 /v1/admin/api-keys 경로를 처리하지 않아 apiKeys.value가 undefined, 재렌더 시 length 접근 에러
- **Fix:** mockApiCalls에 `if (path === '/v1/admin/api-keys') return { keys: [] };` 추가
- **Files modified:** packages/admin/src/__tests__/settings.test.tsx
- **Commit:** e974d2a

**2. [Rule 1 - Bug] Pre-existing notification test body 인자 불일치**
- **Found during:** Task 1
- **Issue:** 컴포넌트는 apiPost(path, {})로 호출하지만 테스트는 apiPost(path)만 검증
- **Fix:** 테스트에서 .toHaveBeenCalledWith('/v1/admin/notifications/test', {})로 수정
- **Files modified:** packages/admin/src/__tests__/settings.test.tsx
- **Commit:** e974d2a

## Pre-existing Issues (Not Fixed)

- sessions.test.tsx 3개 테스트 실패 (pre-existing, 이 플랜과 무관)

## Self-Check: PASSED

- All 6 key files exist
- Both commits (e974d2a, f10dd49) verified in git log
- ADMIN_TELEGRAM_USERS found in endpoints.ts
- SUSPENDED/LOCKED/ACTIVE states found in settings.tsx
- telegram-users route found 4 times in layout.tsx
- telegram-users.tsx is 248 lines (min_lines: 100 satisfied)
