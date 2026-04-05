---
phase: 30-schema-config-finalization
plan: 02
subsystem: database, infra
tags: [sqlite, check-constraint, drizzle, docker, uid, notification, begin-immediate, network-type, chain-type]

# Dependency graph
requires:
  - phase: 30-01
    provides: config.toml 평탄화, 타임스탬프 초 단위 통일 (SCHEMA-01, SCHEMA-02)
  - phase: 12-high-schema-unification
    provides: 45-enum-unified-mapping.md SSoT Enum 체계
provides:
  - agents 테이블 chain/network CHECK 제약 (ChainType, NetworkType SSoT Enum)
  - network 값 'mainnet' 통일 (mainnet-beta 제거)
  - amount TEXT 근거 보강 + amount_lamports 유보
  - Docker UID 1001 + WAIAAS_DATA_DIR + 소유권 확인 스펙
  - 알림 채널 BEGIN IMMEDIATE 동시성 보호 + 물리 삭제 금지
  - agents CHECK 추가 마이그레이션 가이드 (섹션 4.10)
affects: [구현 시 agents 테이블, Docker 배포, 알림 채널 관리]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ChainType/NetworkType SSoT: as const -> TS type -> Zod enum -> Drizzle $type -> DB CHECK"
    - "네트워크 값 체인 무관 추상화: 앱 레벨 'mainnet', RPC 매핑에서만 'mainnet-beta' 사용"
    - "BEGIN IMMEDIATE TOCTOU 방지: 읽기-쓰기 원자성 보장"
    - "물리 삭제 금지 (soft-delete only): notification_channels"

key-files:
  created: []
  modified:
    - .planning/deliverables/25-sqlite-schema.md
    - .planning/deliverables/45-enum-unified-mapping.md
    - .planning/deliverables/37-rest-api-complete-spec.md
    - .planning/deliverables/26-keystore-spec.md
    - .planning/deliverables/31-solana-adapter-detail.md
    - .planning/deliverables/29-api-framework-design.md
    - .planning/deliverables/40-telegram-bot-docker.md
    - .planning/deliverables/35-notification-architecture.md

key-decisions:
  - "agents 테이블 chain CHECK ('solana', 'ethereum') + network CHECK ('mainnet', 'devnet', 'testnet') 추가"
  - "network 값 'mainnet' 통일: 앱 레벨에서 mainnet-beta 제거, RPC URL 매핑은 config.toml/AdapterRegistry 담당"
  - "ChainType/NetworkType를 45-enum SSoT Enum으로 등록 (as const 파생 체인)"
  - "amount TEXT 유지: JS Number MAX_SAFE_INTEGER < u64 max < uint256, amount_lamports 유보"
  - "Docker UID 1001 홈 디렉토리 명시 + WAIAAS_DATA_DIR 환경변수 + VOLUME 선언"
  - "데몬 시작 시 stat(dataDir).uid 소유권 확인 경고 로그"
  - "알림 채널 물리 삭제(DELETE) 금지, soft-delete(enabled=false)만 허용"
  - "채널 비활성화를 BEGIN IMMEDIATE 트랜잭션으로 TOCTOU 방지"

patterns-established:
  - "ChainType/NetworkType SSoT Enum 파생 체인: as const -> TS type -> Zod enum -> Drizzle $type -> DB CHECK"
  - "네트워크 추상화: 앱 레벨 'mainnet'으로 통일, 체인별 실제 네트워크명은 어댑터 내부에서만 사용"
  - "BEGIN IMMEDIATE + 카운트 확인: 최소 N개 보장이 필요한 비활성화/삭제 로직의 표준 패턴"

# Metrics
duration: 8min
completed: 2026-02-08
---

# Phase 30 Plan 02: 스키마 CHECK/amount/Docker/알림 확정 Summary

**agents 테이블 chain/network CHECK 제약 + NetworkType 'mainnet' 통일 + Docker UID 1001 정합성 + 알림 채널 BEGIN IMMEDIATE TOCTOU 방지**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-08T12:18:26Z
- **Completed:** 2026-02-08T12:26:08Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- agents 테이블에 chain/network CHECK 제약 추가 (DDL + Drizzle ORM + 마이그레이션 가이드)
- ChainType(2값), NetworkType(3값)을 45-enum SSoT Enum으로 등록
- 4개 문서에서 'mainnet-beta' 직접 참조를 'mainnet'으로 통일
- amount TEXT 유지 근거를 JS Number/u64/uint256 비교표로 보강
- Docker Dockerfile에 홈 디렉토리/WAIAAS_DATA_DIR/VOLUME 명시, docker-compose에 user: "1001:1001" 추가
- 알림 채널 물리 삭제 금지 + BEGIN IMMEDIATE 동시성 보호 확정

## Task Commits

Each task was committed atomically:

1. **Task 1: agents CHECK 제약 + network 값 통일 + amount TEXT 근거 (SCHEMA-03, SCHEMA-05)** - `6b9bbfa` (feat)
2. **Task 2: Docker UID 1001 정합성 + 알림 채널 BEGIN IMMEDIATE (SCHEMA-04, SCHEMA-06)** - `0537e2d` (feat)

## Files Created/Modified
- `.planning/deliverables/25-sqlite-schema.md` - agents CHECK (chain/network), amount TEXT 근거, 마이그레이션 가이드 4.10
- `.planning/deliverables/45-enum-unified-mapping.md` - ChainType(2값), NetworkType(3값) SSoT Enum 추가
- `.planning/deliverables/37-rest-api-complete-spec.md` - network 값 'mainnet' 통일 (7건)
- `.planning/deliverables/26-keystore-spec.md` - network 값 'mainnet' 통일, NetworkType 참조
- `.planning/deliverables/31-solana-adapter-detail.md` - network 매핑 주석, SolanaAdapterConfig 타입 변경
- `.planning/deliverables/29-api-framework-design.md` - network 예시 'mainnet' 통일
- `.planning/deliverables/40-telegram-bot-docker.md` - UID 1001 명시, WAIAAS_DATA_DIR, 소유권 확인 스펙
- `.planning/deliverables/35-notification-architecture.md` - BEGIN IMMEDIATE, 물리 삭제 금지

## Decisions Made

| 결정 | 근거 | SCHEMA |
|------|------|--------|
| agents chain CHECK ('solana', 'ethereum') | 체인 식별자 데이터 무결성 확보 | SCHEMA-03 |
| agents network CHECK ('mainnet', 'devnet', 'testnet') | 네트워크 값 체인 무관 추상화 | SCHEMA-03 |
| network 'mainnet' 통일 (mainnet-beta 제거) | 클라이언트가 체인별 명명 규칙 몰라도 됨, RPC URL은 AdapterRegistry가 매핑 | SCHEMA-03 |
| amount TEXT 유지 + amount_lamports 유보 | JS Number < u64 < uint256, TEXT가 유일하게 체인 무관 안전 | SCHEMA-05 |
| Docker adduser -h /home/waiaas + ENV WAIAAS_DATA_DIR | 홈 디렉토리 미지정 시 Alpine에서 /로 설정됨 | SCHEMA-04 |
| docker-compose user: "1001:1001" | Dockerfile USER와 일치, named volume 소유권 보장 | SCHEMA-04 |
| stat(dataDir).uid 소유권 확인 | bind mount 등 UID 불일치 시 경고로 사전 감지 | SCHEMA-04 |
| 알림 채널 물리 삭제 금지 (soft-delete only) | notification_log FK 보존, 전달 이력 추적 보장 | SCHEMA-06 |
| BEGIN IMMEDIATE 채널 비활성화 | 동시 비활성화 요청으로 최소 2채널 정책 우회 방지 (TOCTOU) | SCHEMA-06 |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 30 (2/2 plans) 완료 -- v0.7 마일스톤의 마지막 페이즈
- SCHEMA-01~06 전체 해소 완료
- 모든 설계 문서 정합성 확보, 구현 준비 완료

## Self-Check: PASSED

---
*Phase: 30-schema-config-finalization*
*Completed: 2026-02-08*
