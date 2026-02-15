---
phase: 138-forex-display-currency
plan: "01"
subsystem: oracle/forex
tags: [forex, currency, formatting, coingecko, cache, intl]
dependency_graph:
  requires: [price-cache, coingecko-oracle-pattern]
  provides: [IForexRateService, ForexRateService, CoinGeckoForexProvider, formatDisplayCurrency, CURRENCY_META]
  affects: [admin-routes, admin-settings, display-currency]
tech_stack:
  added: [Intl.NumberFormat]
  patterns: [forex-cache-30min, tether-proxy, graceful-null-fallback]
key_files:
  created:
    - packages/core/src/interfaces/forex-rate.types.ts
    - packages/core/src/utils/format-currency.ts
    - packages/core/src/utils/index.ts
    - packages/daemon/src/infrastructure/oracle/forex-currencies.ts
    - packages/daemon/src/infrastructure/oracle/coingecko-forex.ts
    - packages/daemon/src/infrastructure/oracle/forex-rate-service.ts
    - packages/core/src/__tests__/format-currency.test.ts
    - packages/daemon/src/__tests__/coingecko-forex.test.ts
    - packages/daemon/src/__tests__/forex-rate-service.test.ts
  modified:
    - packages/core/src/interfaces/index.ts
    - packages/core/src/index.ts
    - packages/daemon/src/infrastructure/oracle/oracle-errors.ts
    - packages/daemon/src/infrastructure/oracle/index.ts
    - packages/daemon/src/api/routes/admin.ts
decisions:
  - "tether vs_currencies 방식으로 USD→법정통화 환율 조회 (BTC 비율 계산 대신 단일 API 호출)"
  - "InMemoryPriceCache 별도 인스턴스(30분 TTL) -- crypto 캐시와 분리"
  - "Intl.NumberFormat en-US locale 통일 -- 일관된 숫자 형식"
  - "ZERO_DECIMAL_CURRENCIES Set -- getCurrencyMeta 의존 없이 core에서 독립 판단"
  - "forexRateService optional dep -- 138-02에서 daemon bootstrap 통합"
metrics:
  duration: "10m 8s"
  completed: "2026-02-16"
  tasks: 2
  tests_added: 39
  files_created: 9
  files_modified: 5
---

# Phase 138 Plan 01: ForexRateService + 통화 포매팅 유틸리티 Summary

IForexRateService 인터페이스와 CoinGecko tether 기반 forex 환율 조회 + InMemoryPriceCache 30분 캐시 + Intl.NumberFormat 통화 포매팅

## What Was Built

### 1. IForexRateService 인터페이스 (Zod SSoT)

`packages/core/src/interfaces/forex-rate.types.ts`:
- **CurrencyCodeSchema**: 43개 법정 통화 Zod enum (USD, KRW, JPY, EUR, GBP, ...)
- **ForexRateSchema**: 환율 데이터 타입 (from: USD, to, rate, source, fetchedAt, expiresAt)
- **IForexRateService**: getRate(to) -> ForexRate | null, getRates(currencies) -> Map
- IPriceOracle과 분리 (crypto vs forex 관심사 분리 -- 기술 결정 #10)

### 2. CoinGeckoForexProvider

`packages/daemon/src/infrastructure/oracle/coingecko-forex.ts`:
- CoinGecko `/simple/price?ids=tether&vs_currencies=...` 엔드포인트 사용
- USDT ~ 1 USD 근사로 법정 통화 환율 조회 (단일 API 호출)
- API 키 미설정 시 빈 Map 반환 (graceful degradation)
- 기존 CoinGeckoOracle과 동일한 HTTP 패턴 (x-cg-demo-api-key, AbortSignal.timeout 5초)

### 3. ForexRateService

`packages/daemon/src/infrastructure/oracle/forex-rate-service.ts`:
- IForexRateService 구현, CoinGeckoForexProvider + InMemoryPriceCache(30분 TTL) 통합
- 캐시 키: `forex:USD/{currency}` (crypto `chain:address`와 충돌 없음)
- USD -> USD: rate=1 즉시 반환 (API 미호출)
- 실패 시 null 반환 (graceful fallback, throw하지 않음)
- getRates(): 배치 최적화 -- 캐시 미스 통화만 CoinGecko 호출

### 4. 통화 메타데이터 (43개)

`packages/daemon/src/infrastructure/oracle/forex-currencies.ts`:
- CURRENCY_META: code, name, symbol, decimals, locale
- 0자리: KRW, JPY, VND, CLP, HUF, PKR
- 2자리: 대부분 (USD, EUR, GBP, ...)
- 3자리: KWD, BHD
- getCurrencyMeta(): O(1) Map 조회

### 5. formatDisplayCurrency / formatRatePreview

`packages/core/src/utils/format-currency.ts`:
- Intl.NumberFormat 기반 통화 포매팅
- USD: `$500.00` (접두사 없음)
- 비-USD: `≈₩725,000`, `≈¥75,000`, `≈€465.00` (≈ 접두사)
- en-US locale 통일 (일관된 1,000.00 형식)
- ZERO_DECIMAL_CURRENCIES / THREE_DECIMAL_CURRENCIES Set으로 소수점 결정

### 6. GET /admin/forex/rates 엔드포인트

`packages/daemon/src/api/routes/admin.ts`:
- `GET /admin/forex/rates?currencies=KRW,JPY,EUR`
- Response: `{ rates: { KRW: { rate: 1450, preview: "1 USD = ₩1,450" }, ... } }`
- AdminRouteDeps.forexRateService 옵션 (미주입 시 빈 rates 반환)
- 138-02에서 daemon bootstrap 통합

### 7. 테스트 39개

- **format-currency.test.ts (21)**: USD/KRW/JPY/VND/EUR/GBP/CAD/KWD/BHD/HUF/CLP/PKR 포매팅, formatRatePreview
- **coingecko-forex.test.ts (8)**: 정상 응답, API 키 미설정, HTTP 오류, 부분 응답, 음수/0 rate 무시
- **forex-rate-service.test.ts (10)**: USD 즉시, 캐시 히트/미스, TTL 만료 재조회, graceful fallback, 배치 조회

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | fd19184 | IForexRateService + CoinGeckoForexProvider + ForexRateService + 43개 통화 메타데이터 |
| 2 | 932c8d0 | formatDisplayCurrency + GET /admin/forex/rates + 테스트 39개 |

## Requirements Satisfied

- **DISP-01**: IForexRateService 인터페이스 (getRate/getRates)
- **DISP-02**: CoinGecko + 30분 캐시 (InMemoryPriceCache 재사용)
- **DISP-09**: Intl.NumberFormat 기반 통화 포매팅 (≈ 접두사, 소수점 자릿수)

## Self-Check: PASSED

- 9 created files: all FOUND
- 2 task commits: fd19184, 932c8d0 -- all verified
- 39 new tests: all passing
- Full build: SUCCESS (8/8 tasks)
- Regression: 0 new failures (26 pre-existing)
