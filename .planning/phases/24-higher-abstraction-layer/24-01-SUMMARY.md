---
phase: 24-higher-abstraction-layer
plan: 01
subsystem: price-oracle
tags: [price-oracle, coingecko, pyth, chainlink, usd-policy, caching, fallback]

dependency-graph:
  requires: [phase-22, phase-23]
  provides: [IPriceOracle, USD-SPENDING_LIMIT, PriceCache, OracleChain]
  affects: [phase-25-integ]

tech-stack:
  added: []
  patterns: [OracleChain-fallback, stale-while-revalidate, cross-source-validation, conservative-tier-escalation]

key-files:
  created:
    - docs/61-price-oracle-spec.md
  modified: []

decisions:
  - id: ORACLE-01
    decision: "IPriceOracle 4개 메서드 (getPrice/getPrices/getNativePrice/getCacheStats), 서비스 레이어 위치 (IChainAdapter 독립)"
  - id: ORACLE-02
    decision: "5분 TTL + 30분 staleMaxAge, OracleChain 패턴 (CoinGecko -> Pyth/Chainlink -> stale cache)"
  - id: ORACLE-03
    decision: "SpendingLimitRuleSchema에 instant_max_usd/notify_max_usd/delay_max_usd optional 필드 추가, 네이티브+USD 병행 평가에서 보수적 티어 채택"
  - id: ORACLE-04
    decision: "다중 소스 +-10% 교차 검증, +-50% 급변동 시 한 단계 티어 상향, stale 가격 INSTANT->NOTIFY 상향"

metrics:
  duration: ~20min
  completed: 2026-02-08
---

# Phase 24 Plan 01: 가격 오라클 스펙 Summary

IPriceOracle 인터페이스와 CoinGecko/Pyth/Chainlink 3개 구현체를 OracleChain 패턴으로 설계하고, 5분 TTL 인메모리 캐싱 + 30분 stale fallback으로 외부 API 장애를 대비하며, resolveEffectiveAmountUsd()로 5개 TransactionType 모두의 USD 기준 SPENDING_LIMIT 정책 평가를 설계했다.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | IPriceOracle 인터페이스 + 구현체 설계 + 캐싱/fallback + USD 정책 확장 | d5e480e | docs/61-price-oracle-spec.md |

## Verification Results

| # | Check | Result |
|---|-------|--------|
| 1 | docs/61-price-oracle-spec.md 존재 + 1200줄 이상 (2149줄) | PASS |
| 2 | ORACLE-01~04 4개 요구사항 섹션 매핑 | PASS |
| 3 | IPriceOracle 4개 메서드 정의 | PASS |
| 4 | TokenRef, PriceInfo Zod 스키마 정의 | PASS |
| 5 | CoinGecko/Pyth/Chainlink 3개 구현체 | PASS |
| 6 | 5분 TTL + staleMaxAge 30분 캐싱 | PASS |
| 7 | resolveEffectiveAmountUsd() 5개 TransactionType | PASS |
| 8 | SpendingLimitRuleSchema USD 필드 3개 | PASS |
| 9 | 보안 시나리오 12개 (>= 10) | PASS |
| 10 | Phase 22-23 과도기 전략 fallback 명시 | PASS |

## Decisions Made

1. **IPriceOracle 서비스 레이어 위치**: IChainAdapter와 같은 레벨이 아닌, TransactionService 내부 DI로 주입. 어댑터는 가격 정보를 알 필요 없음
2. **OracleChain 패턴**: 다중 소스 순차 시도 -- CoinGecko(Primary) -> Pyth(Solana)/Chainlink(EVM) -> stale cache. 순환 참조 방지
3. **USD + 네이티브 병행 평가**: 두 기준 모두 적용 가능하면 더 높은(보수적) 티어 채택. maxTier(nativeTier, usdTier)
4. **stale 가격 보수적 상향**: stale 가격으로 INSTANT 판정 시 NOTIFY로 상향
5. **가격 급변동 감지**: 이전 캐시 대비 +-50% 변동 시 한 단계 티어 상향 + PriceSpikeWarning
6. **완전 장애 fallback**: 모든 소스 실패 + stale 없음 시 Phase 22-23 과도기 전략 적용 (TOKEN_TRANSFER=NOTIFY, APPROVE=TIER_OVERRIDE 독립)
7. **SpendingLimitRuleSchema 하위 호환**: USD 필드 모두 optional. 미설정 시 기존 네이티브 기준 유지
8. **APPROVE USD는 참고값**: APPROVE는 TIER_OVERRIDE가 독립이므로 USD 변환은 감사 로그 기록용

## Deviations from Plan

None -- plan executed exactly as written.

## Next Phase Readiness

Phase 25에서 기존 문서 8개에 v0.6 확장 반영 시, 이 문서의 섹션 9 "Phase 25 수정 가이드"를 참조한다. HIGH 우선순위 수정 대상: 33-time-lock (SpendingLimitRuleSchema + evaluate() 세분화), 32-transaction-pipeline (Stage 3 IPriceOracle 주입).

## Self-Check: PASSED
