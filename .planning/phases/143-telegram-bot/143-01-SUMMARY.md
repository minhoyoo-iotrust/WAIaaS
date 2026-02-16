---
phase: 143-telegram-bot
plan: 01
subsystem: telegram-bot
tags: [telegram, long-polling, i18n, migration, daemon-lifecycle]
dependency_graph:
  requires: [kill-switch-service, settings-service, migration-v14]
  provides: [telegram-bot-service, telegram-users-table, telegram-api]
  affects: [daemon-lifecycle, i18n-messages, settings-definitions, config-schema]
tech_stack:
  added: [telegram-bot-api-long-polling]
  patterns: [sqlite-direct-sql, fail-soft-init, exponential-backoff, markdownv2-escape]
key_files:
  created:
    - packages/daemon/src/infrastructure/telegram/telegram-types.ts
    - packages/daemon/src/infrastructure/telegram/telegram-api.ts
    - packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
    - packages/daemon/src/infrastructure/telegram/index.ts
    - packages/daemon/src/__tests__/telegram-bot-service.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/lifecycle/daemon.ts
decisions:
  - telegram.bot_token을 notifications.telegram_bot_token과 별도 섹션으로 분리 (Bot 수신 vs 알림 발송 독립 제어)
  - KillSwitchService.getState().state 문자열로 상태 표시 (KillSwitchStateInfo 구조체 접근)
  - MarkdownV2 이스케이프 유틸 TelegramChannel 패턴 재사용 (telegram-bot-service.ts에 독립 정의)
metrics:
  duration: 16m
  completed: 2026-02-16
  tasks: 2/2
  tests_added: 20
  tests_total_pass: 1454
  files_created: 5
  files_modified: 8
---

# Phase 143 Plan 01: TelegramBotService Core Infrastructure Summary

TelegramBotService Long Polling 코어 인프라 + DB 마이그레이션 v15 + /start, /help, /status 명령어 + DaemonLifecycle 통합

## What Was Built

### Task 1: DB Migration v15 + Config/Settings Extension
- **telegram_users 테이블**: `chat_id` INTEGER PK, `username` TEXT, `role` CHECK('PENDING','ADMIN','READONLY'), `registered_at`, `approved_at`
- **LATEST_SCHEMA_VERSION**: 14 -> 15
- **Drizzle 스키마**: `telegramUsers` 테이블 정의 (Table 12)
- **DaemonConfigSchema**: `telegram` 섹션 추가 (enabled, bot_token, locale)
- **SETTING_DEFINITIONS**: telegram 카테고리 3개 키 (enabled, bot_token, locale)
- **KNOWN_SECTIONS**: 'telegram' 추가 (10개 섹션)

### Task 2: TelegramBotService + DaemonLifecycle + i18n
- **TelegramBotService**: Long Polling 루프, 지수 백오프 (1s~30s max), /start /help /status 핸들러
- **TelegramApi**: Node.js 22 내장 fetch 래퍼 (외부 라이브러리 없음), AbortSignal.timeout
- **telegram-types.ts**: TelegramUpdate, TelegramMessage, TelegramUser, TelegramChat 등 내부 타입
- **i18n**: Messages.telegram 섹션 24개 키 (en/ko), Plan 02/03용 키도 미리 정의
- **DaemonLifecycle Step 4c-5**: fail-soft 초기화, shutdown 정리
- **MarkdownV2 이스케이프**: escapeMarkdownV2 유틸 (기존 TelegramChannel 패턴 동일)

## Commands Implemented

| Command | Description | Auth Required |
|---------|-------------|---------------|
| /start | chat_id를 PENDING으로 등록, 중복 시 기등록 메시지 | No |
| /help | 사용 가능한 명령어 목록 (MarkdownV2) | No |
| /status | 데몬 uptime, Kill Switch 상태, 월렛/세션 수 | No |

## Test Coverage

20개 신규 테스트:
- /start: 신규 등록 (PENDING + welcome), 중복 등록, @botname 접미사
- /help: 명령어 목록 전송
- /status: uptime/월렛/세션 표시, KillSwitchService 상태 연동
- Long Polling: offset 증가, 지수 백오프 (1s->2s->4s), 성공 시 리셋, stop()
- i18n: ko 로케일 (start, help, status)
- 엣지: 텍스트 없는 메시지, 알 수 없는 명령, callback_query 스텁, 중복 start()
- escapeMarkdownV2: 특수문자, 빈 문자열, 일반 문자열

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] notification-channels 이벤트 수 23->24 수정**
- **Found during:** Task 2 (전체 테스트 실행)
- **Issue:** LOW_BALANCE 이벤트 타입이 v1.6에서 추가되었으나 테스트가 23개로 고정
- **Fix:** `has exactly 23 event types` -> `has exactly 24 event types`
- **Files modified:** packages/daemon/src/__tests__/notification-channels.test.ts
- **Commit:** 430205a

**2. [Rule 3 - Blocking] 기존 테스트 v14->v15 스키마 버전 갱신**
- **Found during:** Task 2 (전체 테스트 실행)
- **Issue:** 9개 테스트 파일에서 LATEST_SCHEMA_VERSION=14, 테스트 migration 버전 15+ 충돌
- **Fix:** 모든 하드코딩된 14를 15로, 테스트 migration 버전 15->16, 16->17, 17->18로 변경
- **Files modified:** database.test.ts, migration-runner.test.ts, migration-v6-v8.test.ts, migration-v14.test.ts, settings-schema-migration.test.ts, settings-service.test.ts, notification-log.test.ts
- **Commit:** 430205a

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 215bdd8 | DB 마이그레이션 v15 + Drizzle 스키마 + config/settings 확장 |
| 2 | 430205a | TelegramBotService Long Polling + /start, /help, /status + DaemonLifecycle + i18n |

## Self-Check: PASSED

- All 5 created files verified on disk
- Both commits (215bdd8, 430205a) verified in git log
- 1454/1455 tests pass (1 pre-existing api-policies failure)
- Core and daemon tsc --noEmit pass clean
