---
phase: 151-coverage-mock-infra
plan: 02
subsystem: test-infrastructure
tags: [mock, msw, price-oracle, action-provider, test-isolation]
dependency_graph:
  requires: []
  provides:
    - "M6 Jupiter API msw handlers"
    - "M7 Price API msw handlers (Pyth + CoinGecko)"
    - "M8 MockOnchainOracle"
    - "M9 MockPriceOracle (IPriceOracle)"
    - "M10 MockActionProvider (IActionProvider)"
  affects:
    - "Phase 153-157 Contract/Security/Extension tests"
tech_stack:
  added: ["msw 2.x"]
  patterns: ["msw http handler factory", "vi.fn() interface mock", "Zod schema validation in tests"]
key_files:
  created:
    - packages/daemon/src/__tests__/mocks/jupiter-msw-handlers.ts
    - packages/daemon/src/__tests__/mocks/price-api-msw-handlers.ts
    - packages/daemon/src/__tests__/mocks/mock-onchain-oracle.ts
    - packages/daemon/src/__tests__/mocks/mock-price-oracle.ts
    - packages/daemon/src/__tests__/mocks/mock-action-provider.ts
    - packages/daemon/src/__tests__/mocks/index.ts
    - packages/daemon/src/__tests__/mocks/mock-price-oracle.test.ts
    - packages/daemon/src/__tests__/mocks/mock-action-provider.test.ts
  modified:
    - packages/daemon/package.json
    - pnpm-lock.yaml
decisions:
  - "PriceInfo source를 'mock' 대신 'cache'로 설정 — Zod enum 'pyth'|'coingecko'|'cache' 준수"
  - "MockOnchainOracle은 IPriceOracle 미구현 — Pyth 온체인 피드 데이터 전용 시뮬레이터"
  - "msw 핸들러 factory 패턴 채택 — overrides로 테스트별 응답 커스터마이징"
metrics:
  duration: "4min 47s"
  completed: "2026-02-16"
  tasks: 2
  tests_added: 29
  files_created: 8
  files_modified: 2
---

# Phase 151 Plan 02: Mock 경계 인프라 (M6~M10) Summary

msw 2.x + 5개 mock 경계 모듈로 외부 API(Jupiter/Pyth/CoinGecko) 완전 격리 + IPriceOracle/IActionProvider vi.fn() mock 구현

## What Was Built

### M6: Jupiter API msw Handlers
- `createJupiterHandlers(overrides?)` — /v6/quote + /v6/swap-instructions 인터셉트
- `createJupiterErrorHandlers(statusCode)` — 에러 시나리오 (400, 404, 500 등)
- 기본 canned response: SOL->USDC quote + Whirlpool routePlan + swap instructions

### M7: Price API msw Handlers
- `createPythHandlers(overrides?)` — Pyth Hermes /v2/updates/price/latest 인터셉트
- `createCoinGeckoHandlers(overrides?)` — CoinGecko token_price + simple/price 인터셉트
- `createPriceApiErrorHandlers()` — Pyth 503 + CoinGecko 429 에러 시나리오
- `priceApiHandlers` — 편의 export (Pyth + CoinGecko 결합)

### M8: MockOnchainOracle
- Pyth 온체인 가격 피드 데이터 인메모리 시뮬레이터
- `createMockPythFeed()` — SOL/USD ~184.13 기본값
- `toPriceInfo()` — MockPythFeed -> PriceInfo 변환 (PythOracle 동일 공식)
- setFeed/getFeed/removeFeed/reset 관리 메서드

### M9: MockPriceOracle (implements IPriceOracle)
- 4개 메서드 모두 vi.fn() 스파이: getPrice, getPrices, getNativePrice, getCacheStats
- `setPrice(chain, address, overrides)` / `setNativePrice(chain, overrides)` 헬퍼
- 체인별 기본 가격: solana=184.0, ethereum=3400.0
- CacheStats.size가 저장된 가격 수 반영
- 13개 검증 테스트 통과

### M10: MockActionProvider (implements IActionProvider)
- metadata/actions/resolve 모두 생성자 override 지원
- resolve() vi.fn() — action name 검증 + inputSchema.parse() validation
- `setResolveResult()` / `setResolveError()` 헬퍼
- ACTION_NOT_FOUND + ZodError 에러 시나리오 지원
- 16개 검증 테스트 통과

### Barrel Export
- `packages/daemon/src/__tests__/mocks/index.ts`에서 M6~M10 전체 export
- `import { MockPriceOracle, createJupiterHandlers, ... } from '../mocks/index.js'`

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | 46a01da | msw 2.x 설치 + Jupiter/가격 API msw 핸들러 (M6, M7) |
| 2 | bc27c0d | MockOnchainOracle + MockPriceOracle + MockActionProvider (M8-M10) + barrel + tests |

## Test Results

- 29 tests added (13 MockPriceOracle + 16 MockActionProvider)
- All pass in 355ms
- PriceInfo Zod schema validation 포함

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PriceInfo source 'mock' -> 'cache' 변경**
- **Found during:** Task 2 (MockPriceOracle 구현)
- **Issue:** 플랜에서 `source: 'mock'`을 사용했으나 PriceInfoSchema의 source enum은 `'pyth' | 'coingecko' | 'cache'`만 허용
- **Fix:** `source: 'cache'`로 변경하여 Zod 스키마 준수. 'cache'는 mock 특성(실제 API 미호출)과 의미적으로 부합
- **Files modified:** packages/daemon/src/__tests__/mocks/mock-price-oracle.ts
- **Commit:** bc27c0d

## Requirements Coverage

| Requirement | Status |
| ----------- | ------ |
| MOCK-01: M6 Jupiter msw handlers | Done |
| MOCK-01: M7 Price API msw handlers | Done |
| MOCK-01: M8 MockOnchainOracle | Done |
| MOCK-01: M9 MockPriceOracle (IPriceOracle) | Done |
| MOCK-01: M10 MockActionProvider (IActionProvider) | Done |

## Self-Check: PASSED

- 8 created files: All FOUND
- 2 commits (46a01da, bc27c0d): All FOUND
- 29 tests: All passing
