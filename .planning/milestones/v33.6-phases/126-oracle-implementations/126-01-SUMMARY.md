---
phase: 126-oracle-implementations
plan: 01
subsystem: infra
tags: [pyth, hermes-api, price-oracle, tdd, vitest, fetch-mock]

# Dependency graph
requires:
  - phase: 125-design-docs-oracle-interfaces
    provides: "IPriceOracle interface, TokenRef/PriceInfo types, InMemoryPriceCache, buildCacheKey"
provides:
  - "PythOracle class implementing IPriceOracle (Hermes REST API)"
  - "PYTH_FEED_IDS hardcoded map (SOL/ETH/USDC/USDT/BTC)"
  - "PriceNotAvailableError for feed ID miss (OracleChain fallback trigger)"
  - "getFeedId/getNativeFeedId helper functions"
affects: [126-oracle-implementations, 127-usd-policy-integration, 128-admin-oracle-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pyth Hermes REST API fetch with AbortSignal.timeout(5000)"
    - "Feed ID hardcoded map (cacheKey -> hex ID) for zero-config"
    - "Price conversion: Number(price) * 10^expo for USD value"
    - "Confidence ratio: 1 - (confUsd / usdPrice)"

key-files:
  created:
    - "packages/daemon/src/infrastructure/oracle/pyth-feed-ids.ts"
    - "packages/daemon/src/infrastructure/oracle/pyth-oracle.ts"
    - "packages/daemon/src/__tests__/pyth-oracle.test.ts"
  modified:
    - "packages/daemon/src/infrastructure/oracle/index.ts"

key-decisions:
  - "PriceNotAvailableError를 oracle-errors.ts 공유 모듈에서 import (CoinGeckoOracle와 공유)"
  - "PythOracle은 캐시를 직접 관리하지 않음 -- OracleChain이 InMemoryPriceCache 전담"
  - "Pyth feed ID 동적 검색(/v2/price_feeds)은 v1.5 범위 외 -- 하드코딩 맵만 사용"
  - "BTC feed ID를 ethereum:native_btc 키로 매핑 (BTC 범위 가격 변환 테스트 포함)"

patterns-established:
  - "Pyth Hermes API: /v2/updates/price/latest?ids[]=0x{feedId}&parsed=true"
  - "배치 조회: 여러 ids[] 파라미터를 하나의 URL에 조합"
  - "Feed ID -> cacheKey 역매핑: getPrices()에서 응답의 feed.id로 cacheKey 결정"

# Metrics
duration: 5min
completed: 2026-02-15
---

# Phase 126 Plan 01: PythOracle Summary

**PythOracle: Pyth Hermes REST API 기반 IPriceOracle 구현체 -- SOL/ETH/BTC 등 5개 토큰 feed ID 하드코딩 + fetch mock 기반 10개 테스트 TDD**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-15T07:04:21Z
- **Completed:** 2026-02-15T07:10:03Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- PythOracle.getPrice()가 Pyth Hermes /v2/updates/price/latest 엔드포인트를 호출하여 SOL/ETH/BTC USD 가격을 PriceInfo로 변환
- PythOracle.getPrices()가 여러 토큰을 하나의 배치 API 호출로 조회 (ids[] 파라미터 조합)
- PriceNotAvailableError로 feed ID 미등록 토큰 처리 (OracleChain의 CoinGecko fallback 트리거)
- pyth-feed-ids.ts에 SOL/ETH/USDC/USDT/BTC 5개 토큰 feed ID 하드코딩 + getNativeFeedId 헬퍼
- 10개 신규 테스트 (fetch mock 기반), daemon 기존 테스트 회귀 없음, tsc --noEmit 통과

## Task Commits

Each task was committed atomically (TDD: RED -> GREEN):

1. **Task 1: TDD RED -- PythOracle + pyth-feed-ids 테스트 작성**
   - `3fd1771` test(126-01): PythOracle 테스트 10개 + pyth-feed-ids 하드코딩 맵 (RED)

2. **Task 2: TDD GREEN -- PythOracle 구현**
   - `c16b022` feat(126-01): PythOracle implements IPriceOracle -- Hermes REST API (GREEN)

## Files Created/Modified
- `packages/daemon/src/infrastructure/oracle/pyth-feed-ids.ts` - SOL/ETH/USDC/USDT/BTC feed ID 하드코딩 맵 + getFeedId/getNativeFeedId 헬퍼
- `packages/daemon/src/infrastructure/oracle/pyth-oracle.ts` - PythOracle class (IPriceOracle implements), Hermes API 호출 + PriceInfo 변환
- `packages/daemon/src/__tests__/pyth-oracle.test.ts` - PythOracle 단위 테스트 10개 (fetch mock 기반)
- `packages/daemon/src/infrastructure/oracle/index.ts` - PythOracle, feed ID 헬퍼 re-export 추가

## Decisions Made
- **PriceNotAvailableError 위치:** oracle-errors.ts 공유 모듈에서 import (plan 126-02의 CoinGeckoOracle와 공유). 이전 버전에서 pyth-oracle.ts에 co-locate했으나 linter가 공유 모듈로 리팩토링
- **캐시 미관리:** PythOracle은 InMemoryPriceCache를 import하지 않음. getCacheStats()는 모든 카운터 0 반환. 캐시 관리는 OracleChain 전담 (설계 결정 ORACL-04)
- **BTC feed ID 매핑:** `ethereum:native_btc` 키에 BTC/USD feed ID 등록. 실제 BTC 토큰 주소 매핑은 향후 확장

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 미사용 import 제거 (getNativeFeedId)**
- **Found during:** Task 2 (PythOracle 구현)
- **Issue:** pyth-oracle.ts에서 getNativeFeedId를 import했으나 getNativePrice()가 getPrice()에 위임하므로 미사용
- **Fix:** unused import 제거하여 tsc --noEmit 통과
- **Files modified:** packages/daemon/src/infrastructure/oracle/pyth-oracle.ts
- **Verification:** tsc --noEmit 에러 없음
- **Committed in:** c16b022 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** 미사용 import 제거. 기능 변경 없음.

## Issues Encountered
- Linter가 PriceNotAvailableError를 oracle-errors.ts 공유 모듈에서 import하도록 자동 수정함. 이는 plan 126-02의 coingecko-oracle 작업이 동일 브랜치에 이미 존재하여 공유 에러 모듈이 생성되었기 때문. 테스트에서 import 경로가 변경되지 않아 (PythOracle에서 re-export하므로) 기능에 영향 없음

## User Setup Required

None - Pyth Hermes API는 API 키 불필요 (공개 인스턴스).

## Next Phase Readiness
- PythOracle이 IPriceOracle을 구현: OracleChain에서 primary oracle로 사용 준비 완료
- PriceNotAvailableError 패턴 확립: CoinGeckoOracle fallback 트리거 경로 보장
- 배치 조회 패턴 확립: getPrices()에서 하나의 URL로 여러 토큰 조회
- 외부 npm 의존성 0개 원칙 유지 (native fetch() 사용)

## Self-Check: PASSED

All 4 files verified present. All 2 commit hashes verified in git log.

---
*Phase: 126-oracle-implementations*
*Completed: 2026-02-15*
