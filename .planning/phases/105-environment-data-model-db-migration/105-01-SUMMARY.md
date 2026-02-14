---
phase: 105-environment-data-model-db-migration
plan: 01
subsystem: database
tags: [zod, environment, network-mapping, wallet-schema, keystore, sqlite, migration-design]

# Dependency graph
requires:
  - phase: 104-admin-settings-mcp-5type-skill-files
    provides: "v1.4.4 코드베이스 (13 NETWORK_TYPES, WalletSchema, 키스토어)"
provides:
  - "EnvironmentType Zod SSoT 파생 체인 정의 (5단계)"
  - "환경-네트워크 매핑 테이블 (4행 x 13네트워크 전수)"
  - "매핑 함수 4개 설계 (시그니처 + 의사코드 + 에러 케이스)"
  - "WalletSchema/CreateWalletRequestSchema/TransactionSchema 변경 설계"
  - "키스토어 영향 분석 결론 (변경 불필요)"
  - "설계 결정 8개 (ENV-01~ENV-08)"
affects: [105-02-db-migration, 106-pipeline, 107-policy, 108-api]

# Tech tracking
tech-stack:
  added: []
  patterns: ["EnvironmentType Zod SSoT 파생 체인 (동일 chain.ts 파일 확장)", "환경-네트워크 정적 매핑 (순수 함수, DB 조회 없음)", "default_network nullable 패턴 (NULL=환경 기본값, NOT NULL=사용자 지정)"]

key-files:
  created: ["docs/68-environment-model-design.md"]
  modified: []

key-decisions:
  - "ENV-01: EnvironmentType 2값(testnet/mainnet) 하드코딩, 제3 환경 배제"
  - "ENV-03: 환경-네트워크 매핑은 순수 함수로 구현 (DB 조회 아님)"
  - "ENV-04: Solana testnet 기본 네트워크는 devnet"
  - "ENV-07: default_network nullable (NULL=환경 기본값, NOT NULL=사용자 지정)"
  - "ENV-08: 키스토어 변경 불필요 (코드 참조 3개로 확인)"

patterns-established:
  - "EnvironmentType SSoT: ENVIRONMENT_TYPES -> EnvironmentTypeEnum -> EnvironmentType -> CHECK -> Drizzle"
  - "환경-네트워크 매핑: ENVIRONMENT_NETWORK_MAP + ENVIRONMENT_DEFAULT_NETWORK 상수"
  - "default_network nullable 정책: NULL=getDefaultNetwork() 런타임 해결"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 105 Plan 01: Environment 데이터 모델 설계 Summary

**EnvironmentType(testnet/mainnet) Zod SSoT 파생 체인, 13개 네트워크 전수 매핑, WalletSchema 변경 설계, 키스토어 영향 분석을 단일 설계 문서(docs/68)로 확립**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T00:52:23Z
- **Completed:** 2026-02-14T00:56:05Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- EnvironmentType Zod SSoT 파생 체인 5단계 정의 (ENVIRONMENT_TYPES -> EnvironmentTypeEnum -> EnvironmentType -> DB CHECK -> Drizzle)
- 환경-네트워크 매핑 테이블 4행(2 chain x 2 environment) x 13 네트워크 전수 커버리지 (누락 0)
- 매핑 함수 4개 시그니처, 의사코드, 입출력 예시, 에러 케이스 완전 설계
- WalletSchema/CreateWalletRequestSchema/TransactionSchema 변경 전/후를 Zod 수준으로 명시
- default_network nullable 정책 확정 (DB CHECK: `IS NULL OR IN (...)`, Zod: `NetworkTypeEnum.nullable()`)
- 키스토어 변경 불필요 확정 (경로=walletId만, network=메타데이터, 복호화=미사용)
- 설계 결정 8개(ENV-01~ENV-08) 근거와 영향 범위 테이블 정리

## Task Commits

Each task was committed atomically:

1. **Task 1: EnvironmentType SSoT + 환경-네트워크 매핑 + WalletSchema 변경 설계** - `0eef0e1` (feat)

## Files Created/Modified

- `docs/68-environment-model-design.md` - EnvironmentType SSoT 정의, 환경-네트워크 매핑, WalletSchema 변경, 키스토어 분석, 설계 결정 요약 (6개 섹션 + 3개 부록)

## Decisions Made

- **ENV-01:** EnvironmentType 2값(testnet/mainnet) 하드코딩. 제3 환경 배제 -- 블록체인 이분법
- **ENV-02:** chain.ts에 추가 (별도 파일 분리 없음) -- 기존 CHAIN_TYPES/NETWORK_TYPES와 동일 위치
- **ENV-03:** 환경-네트워크 매핑은 순수 함수 -- DB 조회 없이 코드 상수로 하드코딩
- **ENV-04:** Solana testnet 기본 네트워크 = devnet -- Solana testnet은 불안정
- **ENV-05:** wallets.network 제거, environment + default_network으로 대체
- **ENV-06:** transactions.network 컬럼 추가 (nullable) -- 실행 네트워크 감사/추적
- **ENV-07:** default_network nullable. NULL=환경 기본값(getDefaultNetwork), NOT NULL=사용자 지정
- **ENV-08:** 키스토어 변경 불필요 -- keystorePath(walletId), generateKeyPair(network 메타데이터), decryptPrivateKey(network 미사용)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 105-02 (DB 마이그레이션 v6a/v6b 설계)가 이 문서의 deriveEnvironment() 로직과 CASE SQL을 직접 참조 가능
- Phase 106 (파이프라인), 107 (정책), 108 (API/DX)가 이 문서만 참조하여 구현 설계 가능
- 키스토어 관련 설계 불필요 확정으로 Phase 106~108 범위 축소

## Self-Check: PASSED

- FOUND: `docs/68-environment-model-design.md`
- FOUND: `105-01-SUMMARY.md`
- FOUND: commit `0eef0e1`

---
*Phase: 105-environment-data-model-db-migration*
*Completed: 2026-02-14*
