---
phase: 143-telegram-bot
plan: 02
subsystem: telegram-bot
tags: [telegram, 2-tier-auth, inline-keyboard, admin-api, approval, callback-query]
dependency_graph:
  requires: [telegram-bot-service, telegram-users-table, kill-switch-service, pending-approvals]
  provides: [telegram-auth, telegram-wallets-cmd, telegram-pending-cmd, telegram-approve-reject, telegram-users-admin-api]
  affects: [admin-ui-telegram-panel, telegram-bot-plan-03, admin-routes]
tech_stack:
  added: []
  patterns: [2-tier-auth-middleware, callback-query-handler, inline-keyboard-pattern, sqlite-direct-audit-log]
key_files:
  created:
    - packages/daemon/src/infrastructure/telegram/telegram-auth.ts
    - packages/daemon/src/__tests__/telegram-bot-auth.test.ts
    - packages/daemon/src/__tests__/telegram-admin-api.test.ts
  modified:
    - packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
    - packages/daemon/src/infrastructure/telegram/index.ts
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/__tests__/telegram-bot-service.test.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
decisions:
  - i18n bot_pending_list_header/bot_pending_empty를 거래 승인 의미로 변경 (등록 대기 -> 거래 대기)
  - i18n bot_approve_success/bot_reject_success를 거래 승인/거부 의미로 변경 (사용자 -> 거래)
  - AdminRouteDeps에 sqlite 옵션 추가 (telegram_users 직접 SQL 접근, Drizzle 대신 better-sqlite3 패턴)
  - WALLET_NOT_FOUND 에러 코드를 telegram user not found에 재사용 (새 에러 코드 불필요)
  - callback_query에서도 2-Tier auth 적용 (인라인 키보드 권한 검증)
metrics:
  duration: 11m
  completed: 2026-02-16
  tasks: 2/2
  tests_added: 41
  tests_total_pass: 1495
  files_created: 3
  files_modified: 7
---

# Phase 143 Plan 02: Telegram Bot 2-Tier Auth + Commands + Admin API Summary

2-Tier 인증(PUBLIC/READONLY/ADMIN) + /wallets, /pending, /approve, /reject 명령어 + callback_query 인라인 키보드 + Admin REST API 3개 엔드포인트

## What Was Built

### Task 1: 2-Tier Auth + /wallets, /pending, /approve, /reject Commands
- **TelegramAuth**: PUBLIC_COMMANDS(/start, /help), READONLY_COMMANDS(/status, /wallets), ADMIN_COMMANDS(/pending, /approve, /reject, /killswitch, /newsession) 분류
- **checkPermission**: role별 명령 실행 권한 검증 (not_registered, pending_approval, admin_only 사유)
- **/wallets**: 전체 월렛 목록 (이름, 체인, 환경, 상태) MarkdownV2 포매팅
- **/pending**: APPROVAL 대기 거래 JOIN 쿼리 + 인라인 키보드 (Approve/Reject 버튼, callback_data: approve:txId / reject:txId)
- **/approve {txId}**: pending_approvals.approved_at 설정 + transactions.status='EXECUTING' + 감사 로그 TX_APPROVED_VIA_TELEGRAM
- **/reject {txId}**: pending_approvals.rejected_at 설정 + transactions.status='CANCELLED' + error 'Rejected via Telegram' + 감사 로그 TX_REJECTED_VIA_TELEGRAM
- **callback_query 처리**: approve:/reject: 패턴 파싱, auth 검증, handleApprove/handleReject 호출, answerCallbackQuery 피드백

### Task 2: Admin REST API -- telegram_users Management
- **GET /v1/admin/telegram-users** (masterAuth): 등록된 Telegram 사용자 목록 조회 (chat_id, username, role, registered_at, approved_at)
- **PUT /v1/admin/telegram-users/:chatId** (masterAuth): role 변경 (ADMIN/READONLY), approved_at 타임스탬프 설정
- **DELETE /v1/admin/telegram-users/:chatId** (masterAuth): 사용자 삭제
- OpenAPI Zod 스키마 등록 (TelegramUserSchema, 3개 라우트 정의)
- AdminRouteDeps.sqlite 옵션 추가, createApp에서 전달

## Commands Implemented (Plan 02)

| Command | Description | Auth Required |
|---------|-------------|---------------|
| /wallets | 전체 월렛 목록 (이름/체인/환경/상태) | READONLY+ |
| /pending | APPROVAL 대기 거래 + 인라인 키보드 | ADMIN |
| /approve {txId} | 거래 승인 + 감사 로그 | ADMIN |
| /reject {txId} | 거래 거부 + 감사 로그 | ADMIN |

## Test Coverage

41개 신규 테스트:
- TelegramAuth.getRole: 미등록 null, PENDING/ADMIN/READONLY 반환 (4)
- TelegramAuth.checkPermission: 8 경우의 수 (8)
- TelegramAuth.updateRole: PENDING->ADMIN 성공, 미존재 false (2)
- TelegramAuth.listUsers: 목록 반환 (1)
- /wallets: 2개 월렛 목록, 빈 목록, READONLY 허용 (3)
- /pending: 2건 인라인 키보드, 빈 목록 (2)
- /approve: 유효 txId 승인 + DB/감사로그 검증, 무효 txId, txId 없음 (3)
- /reject: 유효 txId 거부 + DB/감사로그 검증, 무효 txId (2)
- callback_query: approve + answerCallbackQuery, reject + answerCallbackQuery, READONLY 거부 (3)
- Auth denial: 미등록 bot_unauthorized, PENDING bot_pending_approval, READONLY bot_admin_only (3)
- Admin API: GET 빈 목록, GET 2명, PUT ADMIN, PUT READONLY, PUT 404, PUT invalid 400, DELETE 성공, DELETE 404, 401, OpenAPI 등록 (10)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] i18n bot_pending/bot_approve/bot_reject 텍스트 의미 수정**
- **Found during:** Task 1
- **Issue:** Plan 01에서 사전 정의된 i18n 키들이 "Pending Registrations" / "User approved" 의미였으나, 실제 /pending 명령은 거래 승인 대기 목록을 표시
- **Fix:** bot_pending_list_header: 'Pending Approvals', bot_pending_empty: 'No pending transactions', bot_approve_success: 'Transaction approved', bot_reject_success: 'Transaction rejected'로 변경 (en/ko 모두)
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Commit:** f601b04

**2. [Rule 3 - Blocking] 기존 telegram-bot-service.test.ts 4개 테스트 2-Tier auth 호환 수정**
- **Found during:** Task 1 (기존 테스트 실행)
- **Issue:** 2-Tier auth 도입으로 미등록 사용자의 /status, /unknown 명령이 거부됨
- **Fix:** /status 테스트에 READONLY 사용자 사전 등록 추가, unknown command 테스트에 ADMIN 사용자 등록
- **Files modified:** packages/daemon/src/__tests__/telegram-bot-service.test.ts
- **Commit:** f601b04

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** 두 수정 모두 정확성과 기존 테스트 호환성을 위해 필수. 범위 확장 없음.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | f601b04 | 2-Tier 인증 + /wallets, /pending, /approve, /reject 명령어 + callback_query |
| 2 | 173432e | Admin REST API -- telegram_users 관리 엔드포인트 3개 |

## Self-Check: PASSED

- All 3 created files verified on disk
- Both commits (f601b04, 173432e) verified in git log
- 1495/1496 tests pass (1 pre-existing api-policies failure)
- Core and daemon tsc --noEmit pass clean
