---
phase: 153-contract-test
plan: 02
subsystem: testing
tags: [contract-test, mock-real-parity, policy-engine, notification, clock, price-oracle, action-provider]
dependency-graph:
  requires: [IPolicyEngine, INotificationChannel, IPriceOracle, IActionProvider, MockPriceOracle(M9), MockActionProvider(M10)]
  provides: [policyEngineContractTests, notificationChannelContractTests, clockContractTests, priceOracleContractTests, actionProviderContractTests]
  affects: [packages/core/__tests__/contracts, packages/daemon/__tests__/contracts]
tech-stack:
  added: [IClock/FakeClock/SystemClock inline, TestESMPlugin fixture]
  patterns: [contract-test-factory, initConfig-option, relative-path-cross-package-import]
key-files:
  created:
    - packages/core/src/__tests__/contracts/policy-engine.contract.ts
    - packages/core/src/__tests__/contracts/policy-engine.contract.test.ts
    - packages/core/src/__tests__/contracts/notification-channel.contract.ts
    - packages/core/src/__tests__/contracts/notification-channel.contract.test.ts
    - packages/core/src/__tests__/contracts/clock.contract.ts
    - packages/core/src/__tests__/contracts/clock.contract.test.ts
    - packages/core/src/__tests__/contracts/price-oracle.contract.ts
    - packages/core/src/__tests__/contracts/price-oracle.contract.test.ts
    - packages/core/src/__tests__/contracts/action-provider.contract.ts
    - packages/core/src/__tests__/contracts/action-provider.contract.test.ts
    - packages/daemon/src/__tests__/contracts/policy-engine-impl.contract.test.ts
    - packages/daemon/src/__tests__/contracts/notification-channel-impl.contract.test.ts
    - packages/daemon/src/__tests__/contracts/price-oracle-impl.contract.test.ts
    - packages/daemon/src/__tests__/contracts/action-provider-impl.contract.test.ts
  modified: []
decisions:
  - "daemon에서 core 테스트 파일 import 시 @waiaas/core 패키지 export에 테스트 경로 미포함으로 상대 경로(../../../../core/src/__tests__/...) 사용"
  - "INotificationChannel contract test에 initConfig 옵션 추가 (TelegramChannel은 재초기화 시 config 필수)"
  - "IClock/FakeClock/SystemClock은 core에 아직 없으므로 clock.contract.ts 내 인라인 정의"
  - "IPriceOracle core 테스트에 vi.fn 의존 없는 InlineMockPriceOracle 사용 (core는 vitest spy 불필요)"
  - "IActionProvider core 테스트에 InlineMockActionProvider + TestESMPlugin 인라인 구현"
metrics:
  duration: 6min
  completed: 2026-02-16
  tests-added: 109
  files-created: 14
---

# Phase 153 Plan 02: 5-Interface Contract Test Summary

5개 핵심 인터페이스(IPolicyEngine, INotificationChannel, IClock, IPriceOracle, IActionProvider)에 대한 Contract Test 공유 스위트를 작성하고, Mock 구현체와 실제 구현체 모두 동일한 계약을 통과하도록 검증 완료.

## Commits

| Task | Commit  | Description                                                   |
| ---- | ------- | ------------------------------------------------------------- |
| 1    | a01c76a | IPolicyEngine + INotificationChannel + IClock Contract Test   |
| 2    | 23388d5 | IPriceOracle + IActionProvider Contract Test                  |

## Task Details

### Task 1: CT-3/CT-4/CT-5 (3 interfaces, 34 tests)

**CT-3 IPolicyEngine:**
- 공유 스위트: `policyEngineContractTests(factory, options?)` -- evaluate() 반환 형태, tier/allowed/reason/delaySeconds 6개 검증
- MockPolicyEngine (인라인): defaultDecision + nextDecisions 큐 패턴
- DefaultPolicyEngine (daemon): INSTANT passthrough
- DatabasePolicyEngine (daemon): in-memory SQLite + pushSchema, 정책 없는 기본 상태 검증

**CT-4 INotificationChannel:**
- 공유 스위트: `notificationChannelContractTests(factory, options?)` -- name/initialize/send 4개 검증
- MockNotificationChannel (인라인): sentPayloads 배열 기록
- TelegramChannel (daemon): msw로 Telegram Bot API 모킹, `initConfig` 옵션으로 재초기화 config 전달

**CT-5 IClock:**
- 공유 스위트: `clockContractTests(factory)` -- now() Date 반환, NaN 불가, 역행 불가, 참조 독립 4개 검증
- FakeClock (인라인): advance(ms), setTime(date) 지원
- SystemClock (인라인): `new Date()` 위임

### Task 2: CT-6/CT-7 (2 interfaces, 75 tests)

**CT-6 IPriceOracle:**
- 공유 스위트: `priceOracleContractTests(factory)` -- getPrice 6개 + getPrices 3개 + getNativePrice 2개 + getCacheStats 2개 = 13개 검증
- InlineMockPriceOracle (core): vi.fn 없는 순수 구현
- MockPriceOracle M9 (daemon): vi.fn() 기반 기존 mock
- OracleChain (daemon): MockPriceOracle primary + InMemoryPriceCache

**CT-7 IActionProvider:**
- 공유 스위트: `actionProviderContractTests(factory, options?)` -- metadata 4개 + actions 4개 + resolve 3개 = 11개(x N providers) 검증
- InlineMockActionProvider (core): vi.fn 없는 순수 구현
- TestESMPlugin (core): fixture ESM 플러그인 (amount + recipient params)
- MockActionProvider M10 (daemon): vi.fn() 기반 기존 mock

## Test Results

**Total: 109 tests, 9 files, all passing**

| Package  | Files | Tests |
| -------- | ----- | ----- |
| core     | 5     | 55    |
| daemon   | 4     | 54    |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @waiaas/core 패키지 export에 테스트 경로 미포함**
- **Found during:** Task 1
- **Issue:** daemon에서 `@waiaas/core/src/__tests__/contracts/...` import 시 Vite 해석 실패 (package.json exports에 미정의)
- **Fix:** 상대 경로 import `../../../../core/src/__tests__/contracts/...` 패턴 사용
- **Files modified:** policy-engine-impl.contract.test.ts, notification-channel-impl.contract.test.ts, price-oracle-impl.contract.test.ts, action-provider-impl.contract.test.ts
- **Commit:** a01c76a, 23388d5

**2. [Rule 1 - Bug] TelegramChannel initialize() 재호출 시 빈 config 오류**
- **Found during:** Task 1
- **Issue:** Contract test에서 `initialize({})` 재호출 시 TelegramChannel이 bot_token/chat_id 누락으로 throw
- **Fix:** notificationChannelContractTests에 `initConfig` 옵션 추가, TelegramChannel 테스트에서 유효한 config 전달
- **Files modified:** notification-channel.contract.ts, notification-channel-impl.contract.test.ts
- **Commit:** a01c76a

## Requirements Satisfied

- CTST-03: MockPolicyEngine vs DefaultPolicyEngine vs DatabasePolicyEngine 4-tier 평가 동일성 검증 완료
- CTST-04: MockNotificationChannel vs TelegramChannel 전송 동일성 검증 완료
- CTST-05: FakeClock vs SystemClock now() 반환 타입 동일성 검증 완료
- CTST-06: MockPriceOracle vs OracleChain getPrice/getPrices/getNativePrice 동일성 검증 완료
- CTST-07: MockActionProvider vs TestESMPlugin metadata/actions/resolve 동일성 검증 완료

## Self-Check: PASSED

- 15/15 files found on disk
- 2/2 task commits found in git log (a01c76a, 23388d5)
