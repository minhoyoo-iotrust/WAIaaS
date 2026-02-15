---
phase: 125-design-docs-oracle-interfaces
plan: 01
subsystem: docs
tags: [oracle, pyth, coingecko, mcp, action-provider, price-oracle]

# Dependency graph
requires:
  - phase: 24-upper-abstraction-layer
    provides: "설계 문서 61/62 원본 (Oracle + Action Provider 아키텍처)"
provides:
  - "설계 문서 61: Pyth Primary + CoinGecko Fallback 2단계 Oracle 아키텍처"
  - "설계 문서 62: MCP Tool 16개 상한 제거, mcpExpose 플래그 제어"
  - "설계 문서 38: MCP 내장 도구 14개 현행화, 상한 검사 제거"
affects: [125-02, 126, 127, 128, 129]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pyth Zero-config Primary + CoinGecko Opt-in Fallback 2단계 Oracle"
    - "교차 검증 편차 5% 임계값 + CoinGecko 키 설정 시에만 활성화"
    - "MCP Tool 도구 수 상한 없음, mcpExpose 플래그로 노출 범위 제어"

key-files:
  created: []
  modified:
    - docs/61-price-oracle-spec.md
    - docs/62-action-provider-architecture.md
    - .planning/deliverables/38-sdk-mcp-interface.md

key-decisions:
  - "Chainlink 제거: EVM 전용 커버리지 편향, Pyth가 체인 무관 380+ 피드 제공"
  - "PriceCache maxEntries 1000->128: Self-hosted 환경 보수적 상한"
  - "교차 검증 편차 10%->5%: 더 엄격한 가격 일관성 검증"
  - "편차 초과 시 STALE 격하: 기존 높은 가격 채택에서 변경"
  - "MCP Tool 상한 제거: MCP 프로토콜에 도구 수 제한 없음"

patterns-established:
  - "설계 문서 섹션 제거 시 '[제거됨]' NOTE 처리 (기존 참조 보존)"
  - "v1.5 업데이트 이력을 문서 하단에 변경 요약으로 추가"

# Metrics
duration: 9min
completed: 2026-02-15
---

# Phase 125 Plan 01: 설계 문서 v1.5 수정 Summary

**설계 문서 61/62/38을 v1.5 아키텍처에 맞게 수정: Pyth Primary + CoinGecko Fallback 2단계 Oracle, Chainlink 제거, MCP 16개 상한 제거 + 14개 도구 현행화**

## Performance

- **Duration:** 9min
- **Started:** 2026-02-15T06:30:08Z
- **Completed:** 2026-02-15T06:39:13Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- 설계 문서 61을 Pyth Primary + CoinGecko Opt-in Fallback 2단계 구조로 전환하고 Chainlink 전체 제거
- PriceInfoSchema.source enum을 ['pyth', 'coingecko', 'cache'] 3가지로 축소, maxEntries 128, 교차 검증 5%
- 설계 문서 62/38에서 MCP 16개 상한 관련 모든 코드/에러/테스트/부록 제거 + 기존 도구 14개 현행화

## Task Commits

Each task was committed atomically:

1. **Task 1: 설계 문서 61 v1.5 수정 (Oracle 아키텍처 변경)** - `6f7cca9` (docs)
2. **Task 2: 설계 문서 62/38 v1.5 수정 (MCP Tool 상한 제거 + 14개 현행화)** - `01ad3da` (docs)

## Files Created/Modified
- `docs/61-price-oracle-spec.md` - Oracle 아키텍처를 Pyth Primary + CoinGecko Fallback 2단계로 변경, Chainlink 제거
- `docs/62-action-provider-architecture.md` - MCP 16개 상한 제거, mcpExpose 플래그 제어, 기존 도구 14개 현행화
- `.planning/deliverables/38-sdk-mcp-interface.md` - MCP_TOOL_MAX 상수/상한 검사 제거, BUILT_IN_TOOL_COUNT 14

## Decisions Made
- Chainlink 제거: EVM 전용으로 커버리지 편향, Aggregator 주소 매핑 유지 부담, Pyth가 체인 무관 380+ 피드 제공
- PriceCache maxEntries: 1,000 -> 128 (Self-hosted 환경 보수적 상한)
- 교차 검증 편차: 10% -> 5% 하향, CoinGecko 키 설정 시에만 활성화
- 편차 초과 시 동작: 높은 가격 채택 -> STALE 격하로 변경 (resolveEffectiveAmountUsd에서 보수적 티어 상향 자동 적용)
- MCP Tool 도구 수 상한: 16개 -> 없음 (MCP 프로토콜에 제한 없음, mcpExpose 플래그로 노출 범위만 제어)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 설계 문서 61/62/38이 v1.5 아키텍처를 정확히 반영하여 구현자(Phase 125-02, 126, 127)가 참조 가능
- 125-02 Plan(IPriceOracle 인터페이스 + 구현체 코드 구현)으로 진행 준비 완료

## Self-Check: PASSED

- [x] docs/61-price-oracle-spec.md - FOUND
- [x] docs/62-action-provider-architecture.md - FOUND
- [x] .planning/deliverables/38-sdk-mcp-interface.md - FOUND
- [x] .planning/phases/125-design-docs-oracle-interfaces/125-01-SUMMARY.md - FOUND
- [x] Commit 6f7cca9 (Task 1) - FOUND
- [x] Commit 01ad3da (Task 2) - FOUND

---
*Phase: 125-design-docs-oracle-interfaces*
*Completed: 2026-02-15*
