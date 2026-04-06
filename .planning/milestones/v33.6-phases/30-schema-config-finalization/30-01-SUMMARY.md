---
phase: 30-schema-config-finalization
plan: 01
subsystem: config, database
tags: [toml, config, sqlite, timestamp, zod, env-vars, flattening]

# Dependency graph
requires:
  - phase: 29-api-integration-protocol
    provides: config.toml v0.7 보완 (nonce_storage, rate_limit 등)
  - phase: 08-security-layers
    provides: 35-notification-architecture 섹션 12.4 확장 키
provides:
  - 평탄화된 config.toml 구조 (중첩 섹션 금지, 7개 1단계 섹션만 허용)
  - WAIAAS_{SECTION}_{KEY} 환경변수 1:1 매핑 규칙 확정
  - ConfigSchema Zod 스키마 평탄화 (중첩 z.object 제거)
  - detectNestedSections() 중첩 감지 유틸리티
  - SQLite 타임스탬프 전체 초 단위 확정 (UUID v7 순서 보장)
affects:
  - 구현 전체 (config 로드, 환경변수 오버라이드)
  - 30-02 (추가 스키마 설정 확정)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 평탄화된 TOML 설정 구조 (중첩 섹션 금지)
    - WAIAAS_{SECTION}_{KEY} 환경변수 1:1 매핑
    - detectNestedSections() 중첩 감지 패턴
    - UUID v7 시간 정밀도로 동일 초 내 순서 보장

key-files:
  created: []
  modified:
    - .planning/deliverables/24-monorepo-data-directory.md
    - .planning/deliverables/25-sqlite-schema.md

key-decisions:
  - "config.toml 중첩 섹션 금지: [rpc.solana] 같은 dotted section 허용하지 않음, 평탄화된 snake_case 키만 사용"
  - "환경변수 매핑: WAIAAS_{SECTION}_{KEY} 1:1 대응, applyEnvOverrides 1단계 섹션/필드 분리"
  - "SQLite 타임스탬프: 전체 테이블 초 단위 통일, audit_log 밀리초 고려 삭제, UUID v7 ms 정밀도로 대체"
  - "35-notification 확장 키(min_channels, health_check_interval, log_retention_days, dedup_ttl) [notifications] 섹션 통합"

patterns-established:
  - "Config 평탄화: 모든 TOML 설정은 [section] 내 평탄 키, 중첩 사용 시 detectNestedSections()가 에러 반환"
  - "타임스탬프: 예외 없이 { mode: 'timestamp' } (초), 동일 초 순서는 UUID v7 정렬"

# Metrics
duration: 6min
completed: 2026-02-08
---

# Phase 30 Plan 01: 스키마 설정 확정 Summary

**config.toml 17개 중첩 키 평탄화 + WAIAAS_{SECTION}_{KEY} 환경변수 1:1 매핑 확정 + SQLite 타임스탬프 전체 초 단위 통일**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-08T12:08:42Z
- **Completed:** 2026-02-08T12:14:48Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- config.toml의 17개 중첩 키([rpc.solana], [notifications.telegram] 등)를 모두 평탄화하여 환경변수 WAIAAS_{SECTION}_{KEY} 1:1 매핑 보장
- ConfigSchema Zod 스키마에서 중첩 z.object 제거, detectNestedSections() 유틸리티로 중첩 사용 시 명시적 에러 반환
- 35-notification-architecture.md 섹션 12.4의 확장 키(min_channels, health_check_interval, log_retention_days, dedup_ttl)를 [notifications] 섹션에 통합
- SQLite 타임스탬프를 audit_log 포함 전체 테이블 초 단위로 통일 확정, 밀리초 고려 주석 삭제

## Task Commits

Each task was committed atomically:

1. **Task 1: config.toml 중첩 섹션 평탄화 + 환경변수 매핑 규칙 확정 (SCHEMA-01)** - `81a8008` (feat)
2. **Task 2: SQLite 타임스탬프 전체 초 단위 통일 확정 (SCHEMA-02)** - `0c8ddc1` (feat)

## Files Created/Modified
- `.planning/deliverables/24-monorepo-data-directory.md` -- 섹션 3.2~3.5 전면 수정: 중첩 섹션 금지 규칙, 평탄화 매핑 테이블, ConfigSchema Zod 평탄화, detectNestedSections(), applyEnvOverrides 단순화
- `.planning/deliverables/25-sqlite-schema.md` -- 섹션 1.3 타임스탬프 전략 초 단위 확정, 섹션 2.5 audit_log timestamp 컬럼 설명 갱신

## Decisions Made
- **config.toml 중첩 섹션 금지:** 환경변수 매핑의 1:1 단순성 보장을 위해 dotted section 완전 금지. 기존 [rpc.solana], [notifications.telegram], [security.auto_stop] 등 모두 평탄화
- **환경변수 매핑 규칙:** `WAIAAS_` + SECTION(대문자) + `_` + KEY(대문자, 언더스코어 구분). applyEnvOverrides는 첫 번째 언더스코어 이후를 field로 처리 (section='rpc', field='solana_mainnet')
- **notifications 확장 키 통합:** 35-notification-architecture.md의 min_channels, health_check_interval, log_retention_days, dedup_ttl을 [notifications] 평탄 섹션에 포함. DB 기반 채널 관리와 분리된 시스템 레벨 설정
- **SQLite 타임스탬프 초 단위 확정:** audit_log 밀리초 고려 주석 삭제. UUID v7의 ms 정밀도가 동일 초 내 이벤트 순서를 보장하므로 별도 밀리초 컬럼 불필요

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness
- SCHEMA-01 (환경변수 중첩 매핑 규칙) 완전 해소
- SCHEMA-02 (SQLite timestamp 정밀도) 완전 해소
- 30-02 플랜 (추가 스키마 설정 확정) 실행 대기

## Self-Check: PASSED

---
*Phase: 30-schema-config-finalization*
*Completed: 2026-02-08*
