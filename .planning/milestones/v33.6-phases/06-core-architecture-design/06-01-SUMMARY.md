---
phase: 06-core-architecture-design
plan: 01
subsystem: database, infra
tags: [monorepo, pnpm, turborepo, sqlite, drizzle-orm, better-sqlite3, toml, smol-toml]

requires:
  - phase: v0.1 (03-system-architecture)
    provides: ARCH-02 패키지 구조 원본 (v0.2에서 리팩터링)
provides:
  - 7-패키지 모노레포 구조 (core, daemon, adapters/solana, adapters/evm, cli, sdk, mcp)
  - ~/.waiaas/ 데이터 디렉토리 레이아웃 (config.toml, data/, keystore/, logs/, backups/, drizzle/)
  - TOML 설정 스펙 (daemon, keystore, rpc, database, notifications, security 섹션)
  - SQLite 7-테이블 스키마 (agents, sessions, transactions, policies, audit_log, pending_approvals, notification_channels)
  - drizzle-kit generate + migrate() 마이그레이션 전략
affects: [06-02 (키스토어 경로), 06-03 (ChainAdapter 패키지 구조), 06-04 (데몬 라이프사이클 + CLI), 06-05 (API 프레임워크), Phase 7 (sessions/transactions 상세화), Phase 8 (policies/notifications 상세화)]

tech-stack:
  added: [drizzle-orm, better-sqlite3, drizzle-kit, smol-toml, pnpm, turborepo]
  patterns: [pnpm workspace, turbo dependsOn build, WAL mode SQLite, TOML config + env override, Zod config validation]

key-files:
  created:
    - .planning/deliverables/24-monorepo-data-directory.md
    - .planning/deliverables/25-sqlite-schema.md
  modified: []

key-decisions:
  - "UUID v7을 모든 PK에 사용 (시간 정렬 가능, 분산 생성 안전)"
  - "amount를 TEXT로 저장 (uint256 안전, 체인 무관)"
  - "audit_log FK 없음 (엔티티 삭제 후에도 로그 영구 보존)"
  - "hostname z.literal('127.0.0.1') 강제 (config/env로 변경 불가)"
  - "PRAGMA cache_size 64MB + mmap_size 256MB (에이전트 10개 기준 최적)"

patterns-established:
  - "설정 로드 3단계: 하드코딩 기본값 -> config.toml -> 환경변수"
  - "환경변수 매핑: WAIAAS_{SECTION}_{KEY} -> [section].key"
  - "데이터 디렉토리 해석: $WAIAAS_DATA_DIR || $XDG_DATA_HOME/waiaas || ~/.waiaas"
  - "타임스탬프: Unix epoch 초 단위 정수 (Drizzle mode: 'timestamp')"
  - "JSON 컬럼: TEXT 타입 + 애플리케이션 레벨 파싱"

duration: 8min
completed: 2026-02-05
---

# Phase 6 Plan 1: 모노레포 구조 + SQLite 스키마 설계 Summary

**7-패키지 모노레포 구조, ~/.waiaas/ 데이터 디렉토리, TOML 설정 스펙, SQLite 7-테이블 스키마를 Drizzle ORM 코드 수준으로 설계**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-05T08:35:53Z
- **Completed:** 2026-02-05T08:44:14Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- v0.1 ARCH-02의 4-패키지 구조(core/cloud/selfhost/api)를 v0.2 7-패키지 구조(core/daemon/adapters/cli/sdk/mcp)로 리팩터링 완료
- 데이터 디렉토리 레이아웃을 파일 권한(600/700), 생성 시점, 초기화 절차까지 정의
- TOML 설정 파일을 6개 섹션(daemon/keystore/database/rpc/notifications/security), 30+ 키-값으로 정의. 환경변수 오버라이드 규칙 포함
- SQLite 7개 테이블을 Drizzle ORM TypeScript + SQL DDL + 인덱스 + FK 정책으로 완전 정의
- WAL 운영 가이드(체크포인트, 백업, 크기 추정, 성능 분석) 포함

## Task Commits

Each task was committed atomically:

1. **Task 1: 모노레포 패키지 구조 + 데이터 디렉토리 + TOML 설정 설계** - `21615b2` (docs)
2. **Task 2: SQLite 전체 스키마 설계** - `56ddd3e` (docs)

## Files Created/Modified

- `.planning/deliverables/24-monorepo-data-directory.md` - CORE-01: 모노레포 7-패키지 구조, ~/.waiaas/ 데이터 디렉토리, TOML config.toml 스펙
- `.planning/deliverables/25-sqlite-schema.md` - CORE-02: SQLite 7-테이블 Drizzle ORM 정의, SQL DDL, ERD, 마이그레이션 전략, 운영 가이드

## Decisions Made

1. **UUID v7 PK:** 모든 테이블의 기본키에 UUID v7 사용. 시간 순 정렬 가능하고 분산 생성에 안전. AUTOINCREMENT는 audit_log에만 사용 (단조 증가 보장 목적)
2. **amount TEXT 저장:** 트랜잭션 금액을 TEXT로 저장. SQLite INTEGER(64bit)는 EVM wei(uint256) 표현 불가. TEXT는 체인 무관 안전 저장
3. **audit_log FK 없음:** 감사 로그는 참조 엔티티 삭제 후에도 영구 보존. FK CASCADE가 로그를 삭제하면 감사 목적 무효화
4. **hostname 강제 고정:** z.literal('127.0.0.1')로 Zod 스키마에서 강제. C-04 (0.0.0.0 Day) 피트폴 원천 차단
5. **config.toml에 [database] 섹션 추가:** 플랜 원안의 [daemon] 섹션에 DB 설정을 넣는 대신, 별도 [database] 섹션으로 분리하여 WAL 체크포인트 주기, busy_timeout, cache_size 등을 독립 관리

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 06-02 (키스토어 스펙): `keystore/<agent-id>.json` 경로와 agents 테이블 구조 확정. Argon2id 파라미터가 config.toml [keystore] 섹션에 정의됨
- 06-03 (ChainAdapter): adapters/solana, adapters/evm 패키지 구조 확정. agents.chain/network 컬럼으로 체인 바인딩 모델 정의됨
- 06-04 (데몬 라이프사이클): daemon 패키지 구조, config.toml 로드, DB 초기화 패턴 확정. daemon.pid, shutdown_timeout 설정 포함
- 06-05 (API 프레임워크): daemon/server/ 디렉토리 구조, Hono + @hono/zod-openapi 의존성 확정. security.cors_origins, rate_limit_rpm 설정 포함
- 차단 요소 없음

---
*Phase: 06-core-architecture-design*
*Completed: 2026-02-05*
