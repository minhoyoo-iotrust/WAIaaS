---
phase: 126-oracle-implementations
plan: 02
subsystem: infra
tags: [coingecko, price-oracle, fetch, vitest, tdd, settings]

# Dependency graph
requires:
  - "125-02: IPriceOracle interface, InMemoryPriceCache, buildCacheKey"
  - "126-01: PythOracle, oracle-errors.ts (PriceNotAvailableError)"
provides:
  - "CoinGeckoOracle: IPriceOracle implementation for Demo API (getPrice/getPrices/getNativePrice)"
  - "COINGECKO_PLATFORM_MAP: solana/ethereum platformId + nativeCoinId mapping"
  - "oracle.coingecko_api_key, oracle.cross_validation_threshold SettingsService keys"
  - "CoinGeckoNotConfiguredError: API key missing error class"
affects: [126-03-oracle-chain, 127-usd-policy-integration, 128-admin-oracle-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CoinGecko Demo API x-cg-demo-api-key header auth"
    - "Chain-grouped comma-separated batch token price query"
    - "EVM address lowercase normalization for CoinGecko API consistency"

key-files:
  created:
    - "packages/daemon/src/infrastructure/oracle/coingecko-platform-ids.ts"
    - "packages/daemon/src/infrastructure/oracle/coingecko-oracle.ts"
    - "packages/daemon/src/infrastructure/oracle/oracle-errors.ts"
    - "packages/daemon/src/__tests__/coingecko-oracle.test.ts"
  modified:
    - "packages/daemon/src/infrastructure/settings/setting-keys.ts"
    - "packages/daemon/src/__tests__/settings-service.test.ts"

key-decisions:
  - "oracle-errors.ts 공유 모듈: PriceNotAvailableError + CoinGeckoNotConfiguredError를 별도 파일로 추출하여 PythOracle/CoinGeckoOracle 공유"
  - "Solana 주소 case 보존: CoinGecko API에서 Solana 주소는 원본 보존, EVM만 lowercase 정규화"
  - "oracle 카테고리 SettingsService 등록: coingecko_api_key (credential, AES-GCM), cross_validation_threshold (5%)"

patterns-established:
  - "CoinGecko API 호출 패턴: fetchJson() 헬퍼로 headers + timeout + error handling 통합"
  - "체인별 그룹화 배치 조회: getPrices()에서 Map<chain, TokenRef[]>로 그룹화 후 chain별 1회 API 호출"
  - "Oracle 에러 공유 모듈: oracle-errors.ts에서 모든 oracle 공통 에러 정의, 개별 oracle에서 re-export"

# Metrics
duration: 10min
completed: 2026-02-15
---

# Phase 126 Plan 02: CoinGeckoOracle Summary

**CoinGecko Demo API 기반 IPriceOracle 구현: SPL/ERC-20 토큰 + 네이티브(SOL/ETH) 가격 조회 + 체인별 배치 + oracle SettingsService 키 2개 등록**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-15T07:04:52Z
- **Completed:** 2026-02-15T07:14:50Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- CoinGeckoOracle: getPrice (SPL/ERC-20), getNativePrice (SOL/ETH), getPrices (체인별 comma-separated 배치 조회)
- oracle-errors.ts: PriceNotAvailableError + CoinGeckoNotConfiguredError 공유 에러 모듈
- COINGECKO_PLATFORM_MAP: solana/ethereum platformId + nativeCoinId 정적 매핑
- oracle 카테고리 SettingsService 키 2개 (coingecko_api_key, cross_validation_threshold)
- 12개 신규 테스트, 975개 전체 daemon 테스트 회귀 없음

## Task Commits

Each task was committed atomically (TDD: RED -> GREEN):

1. **Task 1: TDD RED -- CoinGeckoOracle + platformId mapping + oracle settings tests**
   - `ba6f8b7` test(126-02): add failing CoinGeckoOracle tests + platformId mapping + oracle settings (RED)

2. **Task 2: TDD GREEN -- CoinGeckoOracle implementation**
   - `93097d1` feat(126-02): CoinGeckoOracle implements IPriceOracle -- Demo API (GREEN)

## Files Created/Modified
- `packages/daemon/src/infrastructure/oracle/coingecko-platform-ids.ts` - CoinGecko platformId/nativeCoinId mapping (solana, ethereum)
- `packages/daemon/src/infrastructure/oracle/oracle-errors.ts` - PriceNotAvailableError + CoinGeckoNotConfiguredError 공유 에러
- `packages/daemon/src/infrastructure/oracle/coingecko-oracle.ts` - CoinGeckoOracle implements IPriceOracle (getPrice/getPrices/getNativePrice/getCacheStats)
- `packages/daemon/src/__tests__/coingecko-oracle.test.ts` - 12개 테스트 (fetch mock 기반)
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - oracle 카테고리 + 2개 키 추가
- `packages/daemon/src/__tests__/settings-service.test.ts` - oracle 카테고리 + credential 키 assertion 수정

## Decisions Made
- **oracle-errors.ts 공유 모듈:** 126-01에서 pyth-oracle.ts에 정의된 PriceNotAvailableError를 oracle-errors.ts로 이동하여 PythOracle/CoinGeckoOracle이 동일 에러 클래스 공유. 126-01이 이미 pyth-oracle.ts에서 oracle-errors.ts import + re-export 패턴을 적용한 상태였음
- **Solana 주소 case 보존:** CoinGecko API 응답에서 Solana 주소는 원본 base58 그대로 반환. EVM 주소만 lowercase 정규화 적용 (getPrice에서 lookupKey 분기)
- **oracle 카테고리 SettingsService:** coingecko_api_key는 isCredential=true (AES-GCM 암호화 저장), cross_validation_threshold는 기본값 '5' (%)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] settings-service.test.ts assertion 수정**
- **Found during:** Task 2 (GREEN 단계 전체 테스트 실행)
- **Issue:** oracle 카테고리 2개 키 추가로 SETTING_DEFINITIONS 개수 36->38, credential 키 목록에 oracle.coingecko_api_key 미포함, validCategories에 'oracle' 누락
- **Fix:** 3개 assertion 수정 (개수 38, credential 목록 확장, category set 확장)
- **Files modified:** packages/daemon/src/__tests__/settings-service.test.ts
- **Verification:** 975개 전체 테스트 PASS
- **Committed in:** 93097d1 (Task 2 commit)

**2. [Rule 1 - Bug] Solana 주소 lowercase 조회 오류 수정**
- **Found during:** Task 2 (GREEN 단계 첫 테스트 실행)
- **Issue:** getPrice()에서 `data[address.toLowerCase()]` 사용 시 Solana base58 주소가 잘못 변환되어 CoinGecko 응답에서 매칭 실패
- **Fix:** chain === 'ethereum'일 때만 lowercase 적용, Solana는 원본 주소로 조회
- **Files modified:** packages/daemon/src/infrastructure/oracle/coingecko-oracle.ts
- **Verification:** 12개 CoinGecko 테스트 PASS
- **Committed in:** 93097d1 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** 모두 정확성을 위한 필수 수정. 범위 변경 없음.

## Issues Encountered
- 126-01이 이미 index.ts에 CoinGeckoOracle/oracle-errors.ts export를 선언하고 pyth-oracle.ts에서 oracle-errors.ts import를 적용한 상태. 파일 자체는 미커밋이어서 126-02에서 생성 및 커밋 처리

## User Setup Required

None - no external service configuration required. CoinGecko API key는 Admin Settings에서 런타임 설정.

## Next Phase Readiness
- CoinGeckoOracle + PythOracle 모두 IPriceOracle 구현 완료: 126-03 OracleChain에서 Pyth(primary) -> CoinGecko(fallback) 체인 구성 가능
- oracle.coingecko_api_key SettingsService 등록: OracleChain에서 CoinGecko 활성화 여부 런타임 판단 가능
- oracle.cross_validation_threshold 설정: OracleChain 교차 검증 편차 임계값 조회 가능

## Self-Check: PASSED

All 6 files verified present. All 2 commit hashes verified in git log.

---
*Phase: 126-oracle-implementations*
*Completed: 2026-02-15*
