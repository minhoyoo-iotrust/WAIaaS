---
phase: 25-test-strategy-doc-integration
plan: 01
subsystem: testing
tags: [jest, hardhat, bankrun, msw, mock, contract-test, coverage, security-scenarios]

# Dependency graph
requires:
  - phase: 14-test-framework
    provides: "v0.4 6개 테스트 레벨, 9모듈 매트릭스, Mock 경계 5개, Contract Test 5개"
  - phase: 22-token-extension
    provides: "CHAIN-EXT-01~02 토큰 전송/자산 조회 테스트 시나리오"
  - phase: 23-transaction-type-extension
    provides: "CHAIN-EXT-03~05 컨트랙트/Approve/배치 테스트 시나리오"
  - phase: 24-higher-abstraction-layer
    provides: "CHAIN-EXT-06~08 오라클/Action/Swap 테스트 시나리오"
provides:
  - "CHAIN-EXT-09 확장 기능 테스트 전략 통합 문서 (docs/64)"
  - "Mock 경계 10개 (v0.4 5개 + 5개 신규)"
  - "Contract Test 7개 (v0.4 5개 + IPriceOracle + IActionProvider)"
  - "Hardhat EVM 테스트 환경 설계"
  - "124개 기능 + 42개 보안 = ~166개 시나리오 통합"
  - "@waiaas/actions 80%+, oracle 80%+, adapter-evm 80%+ 커버리지 기준"
affects: [25-02, 25-03, 25-04, implementation-phase]

# Tech tracking
tech-stack:
  added: [hardhat, "@nomicfoundation/hardhat-viem", bankrun, msw-2.x]
  patterns: ["Mock 경계 10x6 매트릭스", "도메인 접두어 시나리오 번호 (TOK/CTR/APR/BAT/ORC/ACT/SWP)", "Contract Test factory 함수 패턴"]

key-files:
  created:
    - docs/64-extension-test-strategy.md
  modified: []

key-decisions:
  - "Hardhat inline 모드 (독립 프로세스 불요, viem publicClient 직접 통합)"
  - "Mock 경계 5개 신규: Aggregator(Jupiter), Price API(CoinGecko), On-chain Oracle, IPriceOracle, IActionProvider"
  - "Contract Test 2개 추가: IPriceOracle 4메서드, IActionProvider validate-then-trust"
  - "7개 도메인 번호 체계 (TOK/CTR/APR/BAT/ORC/ACT/SWP) + 레벨 접미어 (U/I/C/S)"
  - "adapter-evm 50%->80% 상향 (Stub에서 실제 빌드 로직으로 전환)"

patterns-established:
  - "도메인 접두어 시나리오 번호: {DOMAIN}-{LEVEL}{NN} 형식으로 소스 추적"
  - "보안 시나리오 SEC-{DOMAIN}-{NN}: v0.4 43-47 형식과 일관"
  - "Mock 경계 매트릭스: 10x6 (Mock x TestLevel) 테이블로 사용 범위 명시"

# Metrics
duration: ~15min
completed: 2026-02-08
---

# Phase 25 Plan 01: 확장 기능 테스트 전략 통합 Summary

**v0.4 테스트 프레임워크에 Mock 경계 5->10개, Contract Test 5->7개 확장 + Hardhat EVM 환경 + 124개 기능/42개 보안 시나리오 7개 도메인 통합 (1577줄)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-08T05:25:00Z
- **Completed:** 2026-02-08T05:41:40Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Mock 경계 5개 신규 추가 (M6 Aggregator, M7 Price API, M8 On-chain Oracle, M9 IPriceOracle, M10 IActionProvider) -- 10x6 매트릭스 포함
- IPriceOracle + IActionProvider Contract Test 전략 명시 (factory 함수 패턴, validate-then-trust 경계 검증)
- Hardhat Network EVM 테스트 환경 설계 (inline 모드 + fork 모드, TestERC20.sol, Uniswap V3 fork)
- 커버리지 재설정: adapter-evm 50%->80%, @waiaas/actions 80%+, oracle 80%+ 신규
- 124개 기능 시나리오를 7개 도메인(TOK/CTR/APR/BAT/ORC/ACT/SWP)으로 통합 분류
- 42개 보안 시나리오 + v0.4 71건 교차 참조 = 총 ~113건 보안 커버리지 확인
- 도메인 간 교차 시나리오 6건(X-01~X-06) 식별

## Task Commits

Each task was committed atomically:

1. **Task 1: Mock 경계 확장 + Contract Test + EVM 환경 + 커버리지 재설정** - `7099dec` (feat)
2. **Task 2: 테스트 시나리오 통합 + 보안 교차 참조 + 부록** - `f066a62` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `docs/64-extension-test-strategy.md` - CHAIN-EXT-09 확장 기능 테스트 전략 통합 문서 (1577줄, 8개 섹션)

## Decisions Made

1. **Hardhat inline 모드 선택:** 별도 노드 프로세스 불요, hardhat-viem 플러그인으로 viem 기반 어댑터와 일관된 테스트 가능
2. **Mock 경계 5개 신규 설계:** msw 2.x 기반 HTTP Mock (Jupiter, CoinGecko), Bankrun/Hardhat 기반 온체인 Mock, 클래스/객체 기반 인터페이스 Mock
3. **7개 도메인 번호 체계:** 원본 문서의 시나리오를 통합하되 소스 추적 가능한 체계 수립 (소스 컬럼 포함)
4. **보안 시나리오 분류:** 기능 시나리오 내 보안 관련 항목과 순수 보안 시나리오를 구분 (기능 124 + 순수 보안 42 = ~166건)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CHAIN-EXT-09 문서 완성으로 Phase 25의 첫 번째 산출물 확보
- Plan 02 (기존 문서 v0.6 통합), Plan 03-04 (INTEG-01~02 문서 통합) 진행 가능
- 64 문서의 시나리오 번호 체계(TOK/CTR/APR/BAT/ORC/ACT/SWP)가 Plan 02-04에서 참조될 예정
- 차단 요소 없음

## Self-Check: PASSED

---
*Phase: 25-test-strategy-doc-integration*
*Completed: 2026-02-08*
