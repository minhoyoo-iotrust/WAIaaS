---
phase: 126-oracle-implementations
verified: 2026-02-15T07:26:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 126: Oracle Implementations Verification Report

**Phase Goal:** Pyth Hermes Zero-config 가격 조회와 CoinGecko opt-in 롱테일 토큰 가격 조회가 OracleChain 2단계 fallback으로 동작하고, 교차 검증이 편차>5% 가격을 STALE로 격하하는 상태

**Verified:** 2026-02-15T07:26:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                          | Status      | Evidence                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| 1   | PythOracle이 Pyth Hermes REST API로 SOL/ETH/BTC 등 주요 토큰의 USD 가격을 조회한다 (API 키 불필요)            | ✓ VERIFIED  | `PythOracle.getPrice()` 구현 확인, 10개 테스트 PASS, Hermes API 호출 코드 존재                     |
| 2   | CoinGeckoOracle이 CoinGecko Demo API로 컨트랙트 주소 기반 롱테일 토큰 가격을 조회한다 (API 키 설정 시에만 활성) | ✓ VERIFIED  | `CoinGeckoOracle.getPrice()` 구현 확인, 12개 테스트 PASS, API 키 검증 로직 존재                    |
| 3   | OracleChain이 Pyth 실패 시 CoinGecko로 자동 fallback하고, 양쪽 성공 시 5% 편차 초과 가격을 STALE로 격하한다  | ✓ VERIFIED  | `OracleChain.fetchWithFallback()` 구현 확인, 15개 테스트 PASS, 교차 검증 로직 존재                 |
| 4   | GET /v1/admin/oracle-status가 캐시 적중률, 소스별 상태, 마지막 조회 시각을 반환한다                           | ✓ VERIFIED  | admin.ts에 `/admin/oracle-status` 엔드포인트 구현, OracleStatusResponseSchema 정의                 |

**Score:** 4/4 observable truths verified

### Must-Have Truths Breakdown (From Plans)

#### Plan 126-01: PythOracle

| #   | Truth                                                                                                    | Status     | Evidence                                                              |
| --- | -------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| 1   | PythOracle.getPrice()가 Pyth Hermes REST API를 호출하여 SOL/ETH/BTC USD 가격을 PriceInfo로 반환한다     | ✓ VERIFIED | `getPrice()` 메서드 구현, fetch 호출, PriceInfo 변환 로직 확인        |
| 2   | PythOracle.getPrices()가 여러 토큰을 하나의 배치 API 호출로 조회한다                                    | ✓ VERIFIED | `getPrices()` 메서드에서 `ids[]=0x${id}` 파라미터 조합 확인           |
| 3   | PythOracle.getNativePrice('solana'\|'ethereum')가 네이티브 토큰 가격을 반환한다                          | ✓ VERIFIED | `getNativePrice()` 메서드가 `getPrice()` 위임 확인                    |
| 4   | Feed ID 미등록 토큰에서 PriceNotAvailableError를 throw한다 (OracleChain의 CoinGecko fallback 트리거)     | ✓ VERIFIED | `getFeedId()` null 체크 후 `PriceNotAvailableError` throw 코드 확인   |
| 5   | Pyth API 장애 시 적절한 에러를 throw한다 (OracleChain의 fallback 트리거)                                | ✓ VERIFIED | `!res.ok` 체크 후 에러 throw 코드 확인                                |

#### Plan 126-02: CoinGeckoOracle

| #   | Truth                                                                                           | Status     | Evidence                                                                       |
| --- | ----------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| 1   | CoinGeckoOracle.getPrice()가 CoinGecko Demo API로 컨트랙트 주소 기반 토큰 가격을 반환한다      | ✓ VERIFIED | `/simple/token_price/${platformId}` API 호출 코드 확인                         |
| 2   | CoinGeckoOracle.getNativePrice()가 /simple/price 엔드포인트로 SOL/ETH 네이티브 가격을 반환한다 | ✓ VERIFIED | `/simple/price?ids=${nativeCoinId}` API 호출 코드 확인                         |
| 3   | CoinGeckoOracle.getPrices()가 comma-separated 배치 조회로 여러 토큰을 한 번에 조회한다         | ✓ VERIFIED | `contract_addresses=${addresses.join(',')}` 코드 확인                          |
| 4   | API 키 미설정 시 CoinGeckoOracle이 에러를 throw한다                                            | ✓ VERIFIED | `ensureConfigured()` 메서드에서 `CoinGeckoNotConfiguredError` throw 코드 확인  |
| 5   | SettingsService에 oracle.coingecko_api_key, oracle.cross_validation_threshold 설정 키 등록     | ✓ VERIFIED | `setting-keys.ts` 라인 98-99에 두 설정 키 존재 확인                            |

#### Plan 126-03: OracleChain

| #   | Truth                                                                                 | Status     | Evidence                                                                      |
| --- | ------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| 1   | OracleChain.getPrice()가 Pyth 성공 시 Pyth 가격을 캐시하고 반환한다                  | ✓ VERIFIED | `cache.getOrFetch()` 호출 확인, primary 성공 시 반환 로직 확인                |
| 2   | OracleChain.getPrice()가 Pyth 실패 시 CoinGecko로 자동 fallback한다                  | ✓ VERIFIED | `fetchWithFallback()` Stage 2b에서 fallback 시도 로직 확인                    |
| 3   | 양쪽 성공 시 편차>5%이면 반환되는 PriceInfo의 isStale=true로 격하된다                | ✓ VERIFIED | `calculateDeviation()` 호출 후 `deviation > threshold` 체크 로직 확인         |
| 4   | 양쪽 성공 시 편차<=5%이면 Pyth 가격을 그대로 반환한다 (isStale=false)                | ✓ VERIFIED | 편차 검증 통과 시 `primaryResult` 반환 로직 확인                              |
| 5   | CoinGecko 키 미설정 시 교차 검증을 건너뛰고 Pyth 가격만 사용한다                     | ✓ VERIFIED | `if (this.fallback)` 체크로 교차 검증 조건부 실행 확인                        |
| 6   | 모두 실패 시 stale 캐시에서 fallback한다                                             | ✓ VERIFIED | `cache.getStale()` 호출 및 stale 데이터 반환 로직 확인                        |
| 7   | stale 캐시도 없으면 PriceNotAvailableError를 throw한다                               | ✓ VERIFIED | Stage 4에서 `throw new PriceNotAvailableError(cacheKey)` 코드 확인            |
| 8   | GET /v1/admin/oracle-status가 캐시 적중률, 소스별 상태, 교차검증 설정을 반환한다     | ✓ VERIFIED | admin.ts에 엔드포인트 구현, cache/sources/crossValidation 3섹션 반환 코드 확인 |

**Total Must-Haves:** 18 truths across 3 plans
**Verified:** 18/18 (100%)

### Required Artifacts

| Artifact                                                                | Expected                                                           | Status     | Details                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------ |
| `packages/daemon/src/infrastructure/oracle/pyth-feed-ids.ts`           | SOL/ETH/USDC/USDT/BTC feed ID 하드코딩 맵 + 네이티브 토큰 맵      | ✓ VERIFIED | 67 lines, PYTH_FEED_IDS Map with 5 entries, getFeedId/getNativeFeedId helpers       |
| `packages/daemon/src/infrastructure/oracle/pyth-oracle.ts`             | PythOracle class implementing IPriceOracle                         | ✓ VERIFIED | 217 lines, implements IPriceOracle, Hermes API integration, 10 tests PASS           |
| `packages/daemon/src/__tests__/pyth-oracle.test.ts`                    | PythOracle 단위 테스트 (fetch mock 기반)                           | ✓ VERIFIED | 10 tests, all PASS, covers getPrice/getPrices/getNativePrice/error handling         |
| `packages/daemon/src/infrastructure/oracle/coingecko-platform-ids.ts` | CoinGecko platformId + nativeCoinId 매핑                           | ✓ VERIFIED | 67 lines, COINGECKO_PLATFORM_MAP with solana/ethereum entries                       |
| `packages/daemon/src/infrastructure/oracle/coingecko-oracle.ts`       | CoinGeckoOracle class implementing IPriceOracle                    | ✓ VERIFIED | 268 lines, implements IPriceOracle, Demo API integration, 12 tests PASS             |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts`          | oracle 카테고리 설정 키 (coingecko_api_key, cross_validation_threshold) | ✓ VERIFIED | Lines 98-99, oracle.coingecko_api_key (credential), oracle.cross_validation_threshold (default '5') |
| `packages/daemon/src/__tests__/coingecko-oracle.test.ts`              | CoinGeckoOracle 단위 테스트 (fetch mock 기반)                      | ✓ VERIFIED | 12 tests, all PASS, covers batch queries, native prices, API key validation         |
| `packages/daemon/src/infrastructure/oracle/oracle-chain.ts`           | OracleChain class implementing IPriceOracle with fallback + cross-validation | ✓ VERIFIED | 212 lines, 3-stage fallback, calculateDeviation(), 15 tests PASS                    |
| `packages/daemon/src/__tests__/oracle-chain.test.ts`                  | OracleChain 단위 테스트                                            | ✓ VERIFIED | 15 tests, all PASS, covers all fallback/cross-validation scenarios                  |
| `packages/daemon/src/api/routes/openapi-schemas.ts`                   | OracleStatusResponseSchema                                         | ✓ VERIFIED | Lines 789+, OracleStatusResponseSchema with cache/sources/crossValidation sections  |
| `packages/daemon/src/api/routes/admin.ts`                              | GET /admin/oracle-status 엔드포인트                                | ✓ VERIFIED | Lines 286-290 route definition, 924+ handler implementation                          |

**Artifact Score:** 11/11 artifacts verified (100%)

### Key Link Verification

| From                                     | To                                        | Via                                       | Status   | Details                                                        |
| ---------------------------------------- | ----------------------------------------- | ----------------------------------------- | -------- | -------------------------------------------------------------- |
| `pyth-oracle.ts`                         | `pyth-feed-ids.ts`                        | `getFeedId()` import and usage            | ✓ WIRED  | Line 16 import, lines 72, 119 usage in getPrice/getPrices     |
| `pyth-oracle.ts`                         | `IPriceOracle` interface                  | `implements IPriceOracle`                 | ✓ WIRED  | Line 57 class declaration                                      |
| `coingecko-oracle.ts`                    | `coingecko-platform-ids.ts`               | `getCoinGeckoPlatform()` import and usage | ✓ WIRED  | Line 13 import, lines 58, 157, 235 usage                       |
| `coingecko-oracle.ts`                    | `IPriceOracle` interface                  | `implements IPriceOracle`                 | ✓ WIRED  | Line 38 class declaration                                      |
| `oracle-chain.ts`                        | `pyth-oracle.ts`                          | IPriceOracle DI (primary)                 | ✓ WIRED  | Constructor deps.primary: IPriceOracle, line 171 usage         |
| `oracle-chain.ts`                        | `coingecko-oracle.ts`                     | IPriceOracle DI (fallback)                | ✓ WIRED  | Constructor deps.fallback?: IPriceOracle, line 180 usage       |
| `oracle-chain.ts`                        | `price-cache.ts`                          | `cache.getOrFetch()` for stampede prevention | ✓ WIRED  | Line 96 `cache.getOrFetch(cacheKey, async () => ...)`         |
| `admin.ts`                               | `oracle-chain.ts`                         | `AdminRouteDeps.priceOracle`              | ✓ WIRED  | Line 925 `deps.priceOracle?.getCacheStats()`                   |

**Key Links Score:** 8/8 links verified (100%)

### Requirements Coverage

Phase 126 implements requirements from milestone v1.5:
- REQ-ORACL-01: Pyth Hermes Zero-config 가격 조회 ✓ SATISFIED
- REQ-ORACL-02: CoinGecko opt-in 롱테일 토큰 지원 ✓ SATISFIED
- REQ-ORACL-03: 2단계 fallback (Pyth → CoinGecko) ✓ SATISFIED
- REQ-ORACL-04: 5% 편차 교차 검증 with STALE 격하 ✓ SATISFIED
- REQ-ORACL-05: Admin oracle-status 모니터링 엔드포인트 ✓ SATISFIED

**Requirements Score:** 5/5 requirements satisfied (100%)

### Anti-Patterns Found

None found.

**Scan results:**
- No TODO/FIXME/PLACEHOLDER comments in implementation files
- No empty implementations (return null/{}[])
- No console.log-only implementations
- All methods have substantive implementations with proper error handling

### Test Coverage

| Test Suite                    | Tests | Status | Coverage Areas                                                    |
| ----------------------------- | ----- | ------ | ----------------------------------------------------------------- |
| `pyth-oracle.test.ts`         | 10    | ✓ PASS | API calls, batch queries, native prices, error handling, timeouts |
| `coingecko-oracle.test.ts`    | 12    | ✓ PASS | Token/native prices, batch queries, API key validation, headers   |
| `oracle-chain.test.ts`        | 15    | ✓ PASS | 3-stage fallback, cross-validation, cache integration, edge cases |

**Total Oracle Tests:** 37 tests
**Overall Daemon Tests:** 990 tests (63 test files)
**Test Status:** All PASS, no regressions

### Commit History Verification

All commits from SUMMARY files verified in git log:

| Commit  | Message                                                                 | Plan   |
| ------- | ----------------------------------------------------------------------- | ------ |
| 3fd1771 | test(126-01): PythOracle 테스트 10개 + pyth-feed-ids 하드코딩 맵 (RED) | 126-01 |
| c16b022 | feat(126-01): PythOracle implements IPriceOracle -- Hermes REST API (GREEN) | 126-01 |
| ba6f8b7 | test(126-02): add failing CoinGeckoOracle tests + platformId mapping + oracle settings (RED) | 126-02 |
| 93097d1 | feat(126-02): CoinGeckoOracle implements IPriceOracle -- Demo API (GREEN) | 126-02 |
| 3cb7f9b | test(126-03): OracleChain 테스트 15개 작성 -- 3단계 fallback + 교차 검증 (RED) | 126-03 |
| 4c59e44 | feat(126-03): OracleChain 3단계 fallback + 교차 검증 + GET /admin/oracle-status (GREEN) | 126-03 |

**All 6 commits present and in correct TDD sequence (RED → GREEN)**

### Human Verification Required

None required. All aspects of the implementation are programmatically verifiable through:
- Unit tests with fetch mocks (no external API dependencies)
- Static code analysis of fallback logic
- Interface compliance verification (implements IPriceOracle)
- Admin endpoint schema validation (OracleStatusResponseSchema)

The phase goal is fully achieved without requiring manual testing.

## Overall Assessment

**Status:** ✓ PASSED

**Summary:** Phase 126 완전히 달성. PythOracle, CoinGeckoOracle, OracleChain 3개 IPriceOracle 구현체가 모두 정상 동작하며, 2단계 fallback + 5% 교차 검증 로직이 완벽하게 구현됨. Admin oracle-status 엔드포인트로 모니터링 가능. 37개 신규 테스트 추가, 990개 전체 테스트 회귀 없음.

**Ready for next phase:** Phase 127 (USD 정책 통합) 진행 가능.

---

*Verified: 2026-02-15T07:26:00Z*
*Verifier: Claude (gsd-verifier)*
