---
phase: 125-design-docs-oracle-interfaces
plan: 02
subsystem: infra
tags: [zod, price-oracle, lru-cache, vitest, tdd]

# Dependency graph
requires: []
provides:
  - "IPriceOracle interface (Zod SSoT) with getPrice/getPrices/getNativePrice/getCacheStats"
  - "TokenRefSchema, PriceInfoSchema Zod schemas in @waiaas/core"
  - "InMemoryPriceCache: LRU 128, 5min TTL, 30min staleMax, stampede prevention"
  - "classifyPriceAge: FRESH(<5min)/AGING(5-30min)/STALE(>=30min)"
  - "buildCacheKey: EVM lowercase normalization"
affects: [126-oracle-implementations, 127-usd-policy-integration, 128-admin-oracle-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Map-based LRU cache (delete+set for O(1) touch)"
    - "Inflight Promise Map for cache stampede prevention"
    - "PriceAge 3-state classification (FRESH/AGING/STALE)"

key-files:
  created:
    - "packages/core/src/interfaces/price-oracle.types.ts"
    - "packages/daemon/src/infrastructure/oracle/price-age.ts"
    - "packages/daemon/src/infrastructure/oracle/price-cache.ts"
    - "packages/daemon/src/infrastructure/oracle/index.ts"
    - "packages/daemon/src/__tests__/price-age.test.ts"
    - "packages/daemon/src/__tests__/price-cache.test.ts"
  modified:
    - "packages/core/src/interfaces/index.ts"
    - "packages/core/src/index.ts"

key-decisions:
  - "PriceAge 타입을 daemon 패키지에 배치 (core 승격은 후속 필요시)"
  - "source enum을 'pyth'|'coingecko'|'cache' 3가지로 제한 (v1.5 결정 준수)"
  - "staleMax 30min을 별도 파라미터로 분리 (TTL 5min과 독립 제어)"

patterns-established:
  - "Map 기반 LRU: delete+set으로 접근 순서 갱신, keys().next().value로 oldest 퇴거"
  - "Inflight Promise 공유: 동일 키 동시 요청 합침, finally에서 inflight 해제"
  - "now 파라미터 주입: classifyPriceAge에서 Date.now() 대신 now 인자로 테스트 시간 제어"

# Metrics
duration: 5min
completed: 2026-02-15
---

# Phase 125 Plan 02: IPriceOracle Types + Cache + Price Age Summary

**IPriceOracle Zod SSoT 인터페이스 + Map 기반 LRU 캐시(128항목, 5min TTL, stampede 방지) + classifyPriceAge 3단계 분류기를 TDD로 구현**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-15T06:29:34Z
- **Completed:** 2026-02-15T06:34:55Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- TokenRefSchema, PriceInfoSchema Zod SSoT로 core 패키지에 IPriceOracle 인터페이스 정의
- InMemoryPriceCache: LRU 128항목, 5분 TTL, 30분 staleMax, getOrFetch stampede 방지
- classifyPriceAge: FRESH(<5min), AGING(5-30min), STALE(>=30min) 경계값 포함 11개 테스트
- 25개 신규 테스트, 953개 기존 daemon 테스트 회귀 없음

## Task Commits

Each task was committed atomically (TDD: RED -> GREEN):

1. **Task 1: TDD -- IPriceOracle Zod SSoT types + classifyPriceAge**
   - `995af4a` test(125-02): add failing price-age tests (RED)
   - `8ab3e64` feat(125-02): implement IPriceOracle types + classifyPriceAge (GREEN)

2. **Task 2: TDD -- InMemoryPriceCache (LRU 128, 5min TTL, stampede prevention)**
   - `9a92a96` test(125-02): add failing price-cache tests (RED)
   - `318b043` feat(125-02): implement InMemoryPriceCache (GREEN)

## Files Created/Modified
- `packages/core/src/interfaces/price-oracle.types.ts` - TokenRefSchema, PriceInfoSchema, CacheStats, IPriceOracle (Zod SSoT)
- `packages/core/src/interfaces/index.ts` - v1.5 price oracle type/schema exports 추가
- `packages/core/src/index.ts` - TokenRef, PriceInfo, CacheStats, IPriceOracle, TokenRefSchema, PriceInfoSchema re-export
- `packages/daemon/src/infrastructure/oracle/price-age.ts` - classifyPriceAge, PriceAgeEnum, PRICE_AGE_THRESHOLDS
- `packages/daemon/src/infrastructure/oracle/price-cache.ts` - InMemoryPriceCache, buildCacheKey
- `packages/daemon/src/infrastructure/oracle/index.ts` - oracle 모듈 barrel export
- `packages/daemon/src/__tests__/price-age.test.ts` - classifyPriceAge 11개 테스트
- `packages/daemon/src/__tests__/price-cache.test.ts` - InMemoryPriceCache 14개 테스트

## Decisions Made
- **PriceAge 타입 위치:** daemon 패키지 (`infrastructure/oracle/price-age.ts`)에 배치. 현재 소비자가 모두 daemon 내부이므로 core 승격은 후속 필요시 수행
- **source enum 3가지:** `'pyth' | 'coingecko' | 'cache'`로 제한. v1.5 결정(Chainlink 제거, Jupiter 범위 외) 준수
- **staleMax 파라미터 분리:** TTL(5min)과 staleMax(30min)를 독립 생성자 인자로 분리하여 테스트 및 런타임 조정 가능

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- core 패키지 dist/ 재빌드 필요: daemon의 `@waiaas/core` import가 dist/ 기준으로 해석되므로 core tsc 재빌드 후 daemon 타입 체크 통과. 일회성 문제이며 CI에서는 빌드 순서가 보장됨

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- IPriceOracle 인터페이스 + InMemoryPriceCache + classifyPriceAge 완비: Phase 126(PythOracle/CoinGeckoOracle 구현체)에서 직접 사용 가능
- buildCacheKey로 EVM 주소 정규화 보장: CoinGecko API 응답과 사용자 입력 간 case 불일치 해결
- 외부 npm 의존성 0개 원칙 유지

## Self-Check: PASSED

All 8 files verified present. All 4 commit hashes verified in git log.

---
*Phase: 125-design-docs-oracle-interfaces*
*Completed: 2026-02-15*
