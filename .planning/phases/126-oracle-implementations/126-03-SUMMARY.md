---
phase: 126-oracle-implementations
plan: 03
subsystem: infra
tags: [oracle-chain, fallback, cross-validation, price-oracle, tdd, vitest, admin-api]

# Dependency graph
requires:
  - phase: 125-design-docs-oracle-interfaces
    provides: "IPriceOracle interface, TokenRef/PriceInfo types, InMemoryPriceCache, buildCacheKey"
  - "126-01: PythOracle (primary oracle)"
  - "126-02: CoinGeckoOracle (fallback oracle), oracle-errors.ts, SettingsService oracle keys"
provides:
  - "OracleChain: composite IPriceOracle with Pyth -> CoinGecko -> Stale Cache 3-stage fallback"
  - "Cross-validation: deviation > 5% degrades to isStale=true"
  - "GET /admin/oracle-status: cache stats + source status + cross-validation config"
  - "OracleStatusResponseSchema OpenAPI schema"
  - "AdminRouteDeps.priceOracle + oracleConfig injection points"
affects: [127-usd-policy-integration, 128-admin-oracle-panel, 129-mcp-action-providers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OracleChain composite pattern: primary -> cross-validate -> fallback -> stale cache"
    - "calculateDeviation(): |primary - fallback| / primary * 100"
    - "cache.getOrFetch() fetcher에서 stale fallback 처리 (oracle 장애 시 stale 데이터로 연명)"
    - "AdminRouteDeps optional dependency injection (priceOracle?: IPriceOracle)"

key-files:
  created:
    - "packages/daemon/src/infrastructure/oracle/oracle-chain.ts"
    - "packages/daemon/src/__tests__/oracle-chain.test.ts"
  modified:
    - "packages/daemon/src/infrastructure/oracle/index.ts"
    - "packages/daemon/src/api/routes/openapi-schemas.ts"
    - "packages/daemon/src/api/routes/admin.ts"

key-decisions:
  - "OracleChain이 InMemoryPriceCache 전담 관리 -- getOrFetch() stampede prevention 통합"
  - "교차 검증은 CoinGecko fallback이 설정된 경우에만 활성화 (fallback 없으면 자동 스킵)"
  - "stale 캐시 fallback은 fetcher 내에서 처리 (getOrFetch가 throw하면 캐시 미저장이므로)"
  - "GET /admin/oracle-status는 priceOracle가 미주입 시 zeroed stats 반환 (optional dependency)"

patterns-established:
  - "Composite oracle pattern: constructor DI로 primary/fallback/cache 주입, 내부에서 fallback chain 관리"
  - "Cross-validation boundary: deviation <= threshold -> adopt, > threshold -> degrade isStale"
  - "Oracle admin endpoint: 캐시/소스/교차검증 3섹션 JSON 반환"

# Metrics
duration: 4min
completed: 2026-02-15
---

# Phase 126 Plan 03: OracleChain Summary

**OracleChain: Pyth->CoinGecko->Stale Cache 3단계 fallback + 편차>5% 교차 검증 isStale 격하 + GET /admin/oracle-status 모니터링 엔드포인트**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-15T07:18:11Z
- **Completed:** 2026-02-15T07:22:17Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- OracleChain.getPrice(): Pyth(primary) -> CoinGecko(fallback) -> Stale Cache 3단계 fallback 체인
- 교차 검증: 양쪽 성공 시 편차 > 5%이면 isStale=true 격하, CoinGecko 키 미설정 시 스킵
- cache.getOrFetch() 통합으로 stampede prevention + 자동 캐시 관리
- GET /admin/oracle-status: cache stats, source availability, cross-validation config 반환
- 15개 신규 테스트, 990개 전체 daemon 테스트 회귀 없음, tsc --noEmit 통과

## Task Commits

Each task was committed atomically (TDD: RED -> GREEN):

1. **Task 1: TDD RED -- OracleChain fallback + 교차 검증 테스트 작성**
   - `3cb7f9b` test(126-03): OracleChain 테스트 15개 작성 -- 3단계 fallback + 교차 검증 (RED)

2. **Task 2: TDD GREEN -- OracleChain 구현 + Admin oracle-status 엔드포인트**
   - `4c59e44` feat(126-03): OracleChain 3단계 fallback + 교차 검증 + GET /admin/oracle-status (GREEN)

## Files Created/Modified
- `packages/daemon/src/infrastructure/oracle/oracle-chain.ts` - OracleChain class: IPriceOracle composite with fallback chain + cross-validation
- `packages/daemon/src/__tests__/oracle-chain.test.ts` - 15개 단위 테스트 (mock oracle 패턴)
- `packages/daemon/src/infrastructure/oracle/index.ts` - OracleChain, OracleChainDeps re-export 추가
- `packages/daemon/src/api/routes/openapi-schemas.ts` - OracleStatusResponseSchema 추가
- `packages/daemon/src/api/routes/admin.ts` - GET /admin/oracle-status 엔드포인트 + AdminRouteDeps 확장

## Decisions Made
- **OracleChain 캐시 전담:** OracleChain이 InMemoryPriceCache.getOrFetch()를 사용하여 캐시 관리를 전담. PythOracle/CoinGeckoOracle는 캐시를 관리하지 않음 (ORACL-04 설계 결정 이행)
- **교차 검증 조건부 활성화:** fallback oracle가 DI로 주입된 경우에만 교차 검증 실행. CoinGecko API 키 미설정 시 OracleChain 생성자에 fallback을 전달하지 않으면 자동 스킵
- **Stale 캐시 fetcher 내부 처리:** cache.getOrFetch()의 fetcher가 throw하면 캐시에 저장되지 않으므로, stale fallback 로직을 fetcher 내부에서 처리. stale 성공 시 반환값이 새로 캐시됨 (oracle 전체 장애 시 stale 데이터로 연명하는 의도된 동작)
- **AdminRouteDeps optional pattern:** priceOracle?: IPriceOracle로 선언하여 oracle 미설정 시에도 기존 admin 라우트가 동작. zeroed stats 반환

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - OracleChain은 PythOracle(키 불필요) + CoinGeckoOracle(Admin Settings 런타임 설정)을 조합하므로 추가 설정 불필요.

## Next Phase Readiness
- Phase 126 완료: PythOracle + CoinGeckoOracle + OracleChain 3개 IPriceOracle 구현체 제공
- Phase 127(USD 정책 통합): OracleChain을 pipeline에 주입하여 evaluateAndReserve() 전 가격 조회 가능
- Phase 128(Admin Oracle Panel): GET /admin/oracle-status가 캐시/소스/교차검증 데이터 반환 준비 완료
- 외부 npm 의존성 0개 원칙 유지 (native fetch() 사용)

## Self-Check: PASSED

All 5 files verified present. All 2 commit hashes verified in git log.

---
*Phase: 126-oracle-implementations*
*Completed: 2026-02-15*
