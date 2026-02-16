---
phase: 146-wc-infra
plan: 01
subsystem: daemon/wc-infra
tags: [walletconnect, db-migration, lifecycle, sqlite-storage]
dependency_graph:
  requires: []
  provides:
    - WcSessionService (SignClient lifecycle wrapper)
    - SqliteKeyValueStorage (IKeyValueStorage SQLite implementation)
    - DB v16 migration (wc_sessions, wc_store, approval_channel)
    - DaemonLifecycle Step 4c-6 (WC fail-soft init)
    - CreateAppDeps.wcSessionService
  affects:
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
tech_stack:
  added:
    - "@walletconnect/sign-client@^2.23.5"
    - "qrcode@^1.5.4"
    - "@types/qrcode@^1.5.6 (dev)"
  patterns:
    - SqliteKeyValueStorage implements IKeyValueStorage (wc_store table)
    - WcSessionService wraps SignClient with fail-soft lifecycle
    - DB v16 ALTER TABLE + CREATE TABLE migration
key_files:
  created:
    - packages/daemon/src/services/wc-storage.ts
    - packages/daemon/src/services/wc-session-service.ts
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/package.json
    - pnpm-lock.yaml
decisions:
  - IKeyValueStorage 인터페이스를 로컬 정의 (pnpm strict 모드에서 transitive dep 접근 불가)
  - walletconnect.relay_url 설정 키 추가 (런타임 오버라이드 가능)
  - SignClient.init() storage 옵션에 as any 캐스팅 사용 (abstract class vs interface 호환)
metrics:
  duration: "12min"
  completed: "2026-02-16"
  tasks: 2
  files_changed: 13
  tests_updated: 8
---

# Phase 146 Plan 01: WC 인프라 세팅 Summary

**One-liner:** WalletConnect SignClient를 SQLite 스토리지 기반으로 DaemonLifecycle에 fail-soft 통합 + DB v16 마이그레이션

## What Was Built

### SqliteKeyValueStorage (wc-storage.ts)
- `IKeyValueStorage` 인터페이스 5개 메서드 구현 (getKeys, getEntries, getItem, setItem, removeItem)
- `wc_store` 테이블 대상으로 동작 (INSERT OR REPLACE + JSON.stringify/parse)
- WC SDK의 기본 FileSystemStorage 대신 SQLite에 통합하여 Docker 볼륨 일원화

### WcSessionService (wc-session-service.ts)
- `SignClient.init()` 래퍼: projectId, relayUrl, SqliteKeyValueStorage 주입
- session_delete, session_expire 이벤트 리스너로 자동 세션 정리
- `restoreSessions()`: wc_sessions 테이블에서 walletId->topic 매핑 복원
- `shutdown()`: WebSocket relay 연결 해제 (try/catch, best-effort)
- `getSignClient()`: Phase 147 라우트 핸들러용 getter

### DB v16 Migration
- `pending_approvals.approval_channel TEXT DEFAULT 'rest_api'` 컬럼 추가
- `wc_sessions` 테이블 생성 (wallet_id PK, topic UNIQUE, FK cascade)
- `wc_store` 테이블 생성 (key-value, IKeyValueStorage용)
- DDL, Drizzle 스키마, v16 migration 3-way 동기화 완료
- LATEST_SCHEMA_VERSION 15 -> 16

### DaemonLifecycle Integration
- Step 4c-6: WC fail-soft 초기화 (TelegramBot 직후, PriceOracle 직전)
- projectId 미설정 시 "WalletConnect disabled" 로그
- 초기화 실패 시 경고 로그 + `wcSessionService = null` (데몬 정상 시작)
- shutdown()에서 WcSessionService.shutdown() 호출 (EventBus cleanup 전)
- CreateAppDeps에 `wcSessionService?: WcSessionService` 등록

### Config & Settings
- `walletconnect.relay_url` 설정 키 추가 (기본값: wss://relay.walletconnect.com)
- DaemonConfigSchema walletconnect 섹션에 relay_url 필드 추가

## Decisions Made

1. **IKeyValueStorage 로컬 정의**: pnpm strict 모드에서 `keyvaluestorage-interface` 패키지가 호이스트되지 않아 transitive dependency로 접근 불가. 5개 메서드 시그니처를 로컬 인터페이스로 정의.
2. **storage as any 캐스팅**: WC SDK의 IKeyValueStorage는 abstract class인데, 우리 구현은 interface + class. 타입 호환을 위해 `as any` 사용. 런타임에는 정상 동작.
3. **walletconnect.relay_url 설정 키 추가**: Admin Settings에서 런타임으로 relay URL 변경 가능. Phase 147에서 실제 사용.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] IKeyValueStorage import 불가**
- **Found during:** Task 1
- **Issue:** `@walletconnect/keyvaluestorage` 패키지가 pnpm strict 모드에서 직접 import 불가 (transitive dep)
- **Fix:** 로컬 IKeyValueStorage 인터페이스 정의 (plan에서 이미 대안으로 명시)
- **Files modified:** packages/daemon/src/services/wc-storage.ts

**2. [Rule 1 - Bug] 기존 테스트 LATEST_SCHEMA_VERSION 기대값 불일치**
- **Found during:** Task 1 verification
- **Issue:** 8개 테스트 파일에서 LATEST_SCHEMA_VERSION=15, 테이블 수=13, 설정 수=53 기대
- **Fix:** 모든 기대값을 v16 기준으로 갱신 (16, 15 tables, 54 settings)
- **Files modified:** migration-chain.test.ts, migration-runner.test.ts, migration-v14.test.ts, migration-v6-v8.test.ts, settings-schema-migration.test.ts, database.test.ts, notification-log.test.ts, settings-service.test.ts

**3. [Rule 2 - Missing] walletconnect.relay_url 설정 키 누락**
- **Found during:** Task 1
- **Issue:** WcSessionService가 relay_url을 settingsService에서 읽지만, 설정 키가 미등록
- **Fix:** setting-keys.ts + config loader에 relay_url 추가
- **Files modified:** setting-keys.ts, loader.ts

## Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | SqliteKeyValueStorage + WcSessionService + DB v16 | 676454b | wc-storage.ts, wc-session-service.ts, migrate.ts, schema.ts |
| 2 | DaemonLifecycle 통합 + CreateAppDeps | 112c4da | daemon.ts, server.ts |

## Verification Results

- Build: pnpm build --filter=@waiaas/daemon -- PASSED
- Tests: 1524 passed, 0 failed (92 test files)
- Migration chain: v1 -> v16 full chain -- PASSED (96 migration tests)
- LATEST_SCHEMA_VERSION: 16
- DDL pending_approvals: approval_channel 존재
- Drizzle schema: wcSessions, wcStore, approvalChannel 정의 존재
- daemon.ts: Step 4c-6 존재
- server.ts: wcSessionService 필드 존재

## Self-Check: PASSED
