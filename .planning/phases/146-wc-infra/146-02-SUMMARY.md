---
phase: 146-wc-infra
plan: 02
subsystem: daemon/wc-infra
tags: [walletconnect, hot-reload, settings, tests, migration-chain]
dependency_graph:
  requires:
    - "146-01: WcSessionService, SqliteKeyValueStorage, DB v16"
  provides:
    - walletconnect hot-reload 변경 감지
    - SqliteKeyValueStorage 단위 테스트 (12개)
    - WcSessionService 세션 복원/삭제 테스트 (7개)
    - migration-chain v16 테스트 (8개)
  affects:
    - packages/daemon/src/infrastructure/settings/hot-reload.ts
    - packages/daemon/src/__tests__/migration-chain.test.ts
tech_stack:
  added: []
  patterns:
    - HotReloadOrchestrator walletconnect prefix 감지 + 로그 출력
    - "(service as any)" private method access for unit testing
key_files:
  created:
    - packages/daemon/src/__tests__/wc-storage.test.ts
    - packages/daemon/src/__tests__/wc-session-service.test.ts
  modified:
    - packages/daemon/src/infrastructure/settings/hot-reload.ts
    - packages/daemon/src/__tests__/migration-chain.test.ts
decisions:
  - "walletconnect hot-reload는 로그만 출력 (SignClient 재초기화 불필요, 데몬 재시작 권장)"
  - "WcSessionService private 메서드는 (service as any) 캐스팅으로 테스트"
  - "setting-keys.ts/loader.ts는 146-01에서 이미 relay_url 추가됨 -- 중복 변경 없음"
metrics:
  duration: 6min
  completed: 2026-02-16
  tasks: 2/2
  tests_added: 27
  total_tests: 1551
---

# Phase 146 Plan 02: Admin Settings 확장 + WC 테스트 Summary

walletconnect hot-reload 변경 감지 + SqliteKeyValueStorage/WcSessionService/migration-chain v16 테스트 27개 작성

## Tasks Completed

### Task 1: hot-reload walletconnect 키 변경 감지

- `WALLETCONNECT_KEYS_PREFIX` 상수 추가
- `handleChangedKeys`에 walletconnect 카테고리 변경 감지 추가
- 변경 시 안내 로그 출력 (project_id 변경은 데몬 재시작 필요)
- setting-keys.ts와 loader.ts는 146-01에서 이미 relay_url 포함 상태

### Task 2: 테스트 작성 (27개)

**wc-storage.test.ts (12개):**
- setItem + getItem: string, number, object, array 값 저장/조회
- setItem 덮어쓰기: 같은 key에 새 값 저장 후 최신 값 반환
- removeItem: 삭제 후 undefined 반환, 존재하지 않는 key 삭제 안전
- getKeys: 여러 항목 key 목록, 빈 DB 빈 배열
- getEntries: [key, value] 쌍, 빈 DB 빈 배열
- getItem 존재하지 않는 key: undefined

**wc-session-service.test.ts (7개):**
- hasActiveSession: 빈 상태 false
- restoreSessions: wc_sessions DB -> sessionMap 복원, 빈 테이블 안전
- handleSessionDelete: topic 기반 DB + sessionMap 동시 삭제, 미존재 topic 안전, 선택적 삭제 보존
- getSignClient: 초기화 전 null

**migration-chain.test.ts v16 추가 (8개):**
- T-16a: v15 -> v16 wc_sessions/wc_store 테이블 생성
- T-16b: approval_channel 컬럼 추가
- T-16c: wc_sessions INSERT/SELECT
- T-16d: wc_store INSERT/SELECT
- T-16e: approval_channel 기본값 rest_api
- T-16f: fresh DB에 wc_sessions/wc_store/approval_channel 존재
- T-16g: v16 마이그레이션 스키마 동등성 (migrated vs fresh)
- T-16h: v1 -> v16 전체 체인 (wc_sessions + wc_store + approval_channel)

ALL_TABLES 13 -> 15개, EXPECTED_INDEXES 32 -> 33개 업데이트

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] setting-keys.ts/loader.ts 변경 불필요**
- **Found during:** Task 1
- **Issue:** Plan에서 setting-keys.ts에 relay_url 추가, loader.ts에 relay_url 추가를 지시했으나, 146-01에서 이미 완료됨
- **Fix:** 중복 변경 없이 hot-reload.ts만 수정
- **Files modified:** hot-reload.ts만

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 6513dda | feat(146-02): hot-reload에 walletconnect 키 변경 감지 추가 |
| 2 | d04c8b5 | test(146-02): SqliteKeyValueStorage + WcSessionService + migration-chain v16 테스트 |

## Verification Results

- pnpm build --filter=@waiaas/daemon: PASS
- pnpm test --filter=@waiaas/daemon: 94 files, 1,551 tests PASS
- wc-storage.test.ts: 12/12 PASS
- wc-session-service.test.ts: 7/7 PASS
- migration-chain.test.ts: 46/46 PASS (was 38, +8 for v16)
