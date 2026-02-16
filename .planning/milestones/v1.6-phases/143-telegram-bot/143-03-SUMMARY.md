---
phase: 143-telegram-bot
plan: 03
subsystem: telegram-bot
tags: [telegram, inline-keyboard, killswitch, newsession, jwt, exponential-backoff, i18n, reconnect]
dependency_graph:
  requires: [telegram-bot-service, telegram-auth, kill-switch-service, jwt-secret-manager]
  provides: [telegram-keyboard-builder, killswitch-confirm-dialog, newsession-wallet-select, reconnect-backoff-tests]
  affects: [telegram-bot-service, pending-command]
tech_stack:
  added: []
  patterns: [inline-keyboard-builder, confirm-dialog-pattern, jwt-session-issue-via-telegram, exponential-backoff-testing]
key_files:
  created:
    - packages/daemon/src/infrastructure/telegram/telegram-keyboard.ts
    - packages/daemon/src/__tests__/telegram-bot-advanced.test.ts
    - packages/daemon/src/__tests__/telegram-reconnect.test.ts
  modified:
    - packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
    - packages/daemon/src/infrastructure/telegram/index.ts
decisions:
  - "인라인 키보드 빌더를 telegram-keyboard.ts로 분리하여 재사용성 확보"
  - "/newsession에서 JWT 직접 발급 (jwtSecretManager.signToken + sessions INSERT + 감사 로그)"
  - "vi.waitFor 대신 vi.useFakeTimers로 backoff 테스트 제어 (flaky 방지)"
  - "/pending에서 buildApprovalKeyboard 리팩토링으로 인라인 키보드 일관성 확보"
metrics:
  duration: 7m
  completed: 2026-02-16
  tasks_completed: 2
  tests_added: 28
  files_created: 3
  files_modified: 2
---

# Phase 143 Plan 03: Kill Switch 확인 대화 + 세션 발급 + 재연결 테스트 Summary

인라인 키보드 빌더 3개 유틸(confirm/wallet-select/approval), /killswitch 확인 대화(Yes/No), /newsession JWT 세션 발급, Long Polling 지수 백오프 테스트 11개 구현으로 Phase 143 Telegram Bot 전체 완성.

## What Was Done

### Task 1: 인라인 키보드 빌더 + /killswitch + /newsession (9cf709d)

1. **telegram-keyboard.ts** (신규): 3개 인라인 키보드 빌더 유틸
   - `buildConfirmKeyboard(msgs)`: Kill Switch Yes/No 버튼 (`killswitch:confirm`/`killswitch:cancel`)
   - `buildWalletSelectKeyboard(wallets)`: 월렛별 1행 (`newsession:{walletId}`)
   - `buildApprovalKeyboard(txId, msgs)`: Approve/Reject 버튼 (`approve:{txId}`/`reject:{txId}`)

2. **telegram-bot-service.ts**: /killswitch + /newsession 명령어 + callback_query 처리
   - `/killswitch`: Kill Switch 상태 확인 -> ACTIVE이면 확인 키보드, 아니면 이미 활성화 메시지
   - `killswitch:confirm` callback: `activateWithCascade('telegram:{chatId}')` 호출
   - `killswitch:cancel` callback: 취소 메시지 전송
   - `/newsession`: ACTIVE 월렛 선택 키보드 표시
   - `newsession:{walletId}` callback: JWT 토큰 생성 (jose HS256) + sessions INSERT + 감사 로그
   - `/pending`: `buildApprovalKeyboard()` 리팩토링 적용

3. **telegram-bot-advanced.test.ts** (신규): 17개 테스트
   - 키보드 빌더 5개 (confirm Yes/No, wallet 3행, approval Approve/Reject, empty, ko locale)
   - /killswitch 4개 (ACTIVE->confirm, SUSPENDED->already, confirm callback, cancel callback)
   - /newsession 5개 (wallet list, empty, session create, DB insert, invalid wallet)
   - i18n 2개 (en/ko /killswitch 확인 메시지)
   - /pending 1개 (buildApprovalKeyboard 사용 확인)

### Task 2: Long Polling 재연결 지수 백오프 테스트 (de4212a)

1. **telegram-reconnect.test.ts** (신규): 11개 테스트 (vi.useFakeTimers)
   - 지수 백오프 진행 5개: 1s->2s->4s->8s->16s->30s(cap) 확인
   - 성공 시 리셋: backoff=1s, retryCount=0
   - 401/409 에러: 재시도 없이 즉시 정지 (2개)
   - stop() polling 종료 확인
   - 에러 후 정상 업데이트 처리 확인
   - console.warn 3회 주기 스로틀링 확인

## TGBOT 요구사항 최종 매핑

| 요구사항 | 구현 위치 | 상태 |
|---------|----------|------|
| TGBOT-01 Long Polling | Plan 01 | DONE |
| TGBOT-02 /start | Plan 01 | DONE |
| TGBOT-03 /status | Plan 01 | DONE |
| TGBOT-04 /pending | Plan 02 | DONE |
| TGBOT-05 /approve | Plan 02 | DONE |
| TGBOT-06 /reject | Plan 02 | DONE |
| TGBOT-07 /killswitch | Plan 03 | DONE |
| TGBOT-08 /wallets | Plan 02 | DONE |
| TGBOT-09 /newsession | Plan 03 | DONE |
| TGBOT-10 /help | Plan 01 | DONE |
| TGBOT-11 2-Tier auth | Plan 02 | DONE |
| TGBOT-12 지수 백오프 | Plan 03 | DONE |
| TGBOT-13 i18n | Plan 01+03 | DONE |
| TGBOT-14 DB migration | Plan 01 | DONE |

## Test Coverage

| 테스트 파일 | 테스트 수 | Plan |
|------------|----------|------|
| telegram-bot-service.test.ts | 15 | 01 |
| telegram-bot-auth.test.ts | 26 | 02 |
| telegram-admin-api.test.ts | 10 | 02 |
| telegram-bot-advanced.test.ts | 17 | 03 |
| telegram-reconnect.test.ts | 11 | 03 |
| **총계** | **79** | |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.waitFor 타이밍 이슈 수정**
- **Found during:** Task 1 테스트 검증
- **Issue:** `vi.waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1))` 가 /killswitch SUSPENDED 상태 테스트에서 3초 타임아웃
- **Fix:** `vi.waitFor` 내 조건에 `expect(ks.getState).toHaveBeenCalled()` 선행 확인 추가로 안정화
- **Files modified:** telegram-bot-advanced.test.ts
- **Commit:** 9cf709d

## Verification Results

- [x] `pnpm -C packages/core exec tsc --noEmit` -- PASS
- [x] `pnpm -C packages/daemon exec tsc --noEmit` -- PASS
- [x] telegram-bot-service.test.ts -- 15/15 PASS
- [x] telegram-bot-auth.test.ts -- 26/26 PASS
- [x] telegram-bot-advanced.test.ts -- 17/17 PASS
- [x] telegram-reconnect.test.ts -- 11/11 PASS
- [x] telegram-admin-api.test.ts -- 10/10 PASS
- [x] daemon 전체 테스트 -- 1523/1524 PASS (1 pre-existing failure in api-policies.test.ts)
