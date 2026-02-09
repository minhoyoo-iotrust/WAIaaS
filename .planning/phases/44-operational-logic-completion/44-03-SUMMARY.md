---
phase: 44-operational-logic-completion
plan: 03
subsystem: api
tags: [price-oracle, cross-validation, stale-policy, usd-evaluation, fallback]

# Dependency graph
requires:
  - phase: 24-upper-abstraction-layer
    provides: 61-price-oracle-spec.md 원본 OracleChain 및 fallback 설계
  - phase: 43-concurrency-execution-completion
    provides: CAS 패턴 및 에러 분류 전제
provides:
  - OracleChain.getPrice() 교차 검증 동기 인라인 (10% 괴리 시 보수적 가격 채택)
  - 가격 나이별 3단계(FRESH/AGING/STALE) 정책 평가 동작 테이블
  - STALE(>30분) USD 평가 스킵 → 네이티브 금액 전용 평가 정책
  - PRICE_DEVIATION_WARNING 감사 로그 + SYSTEM_WARNING 알림 이벤트
affects: [v1.0-implementation, price-oracle-implementation, policy-evaluation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "교차 검증 동기 인라인: Primary 성공 후 Fallback 동기 호출, 10% 괴리 시 높은 가격 채택"
    - "3단계 가격 나이 분류: FRESH(<5m)/AGING(5-30m)/STALE(>30m) + UNAVAILABLE"

key-files:
  created: []
  modified:
    - docs/61-price-oracle-spec.md

key-decisions:
  - "ORACLE-05: 교차 검증을 비동기 백그라운드에서 getPrice() 동기 인라인으로 전환 (보수적 가격 채택이 반환값에 반영되어야 하므로)"
  - "ORACLE-06: 가격 나이 3단계(FRESH/AGING/STALE) 통합 테이블 신설, STALE(>30분) 시 USD 평가 스킵 → 네이티브 금액 전용 평가"

patterns-established:
  - "보수적 가격 채택: 10% 초과 괴리 시 Math.max(primaryPrice, fallbackPrice) → 더 높은 보안 티어"
  - "가격 나이별 분기: isStale 플래그(TTL 만료) vs PriceNotAvailableError(staleMaxAge 초과) 구분"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 44 Plan 03: Price Oracle 교차 검증 인라인 + 3단계 Stale 정책 Summary

**OracleChain.getPrice()에 10% 괴리 시 보수적 가격 채택을 동기 인라인하고, FRESH/AGING/STALE 3단계 가격 나이 정책 테이블을 신설하여 >30분 시 USD 평가 스킵 정책을 확정**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T12:36:19Z
- **Completed:** 2026-02-09T12:38:36Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Section 3.6 OracleChain.getPrice()에 다중 소스 교차 검증을 동기적으로 인라인 (10% 초과 괴리 시 높은 가격 채택)
- PRICE_DEVIATION_WARNING 감사 로그 + SYSTEM_WARNING 알림 이벤트를 교차 검증 코드에 포함
- Section 5.2.1에 FRESH/AGING/STALE/UNAVAILABLE 4단계 정책 평가 동작 통합 테이블 신설
- Section 6.2 resolveEffectiveAmountUsd() catch 블록에 STALE(>30분) → applyFallbackStrategy() 연결 보강
- Section 7.1.1 비동기 백그라운드 교차 검증을 [v0.10 폐기] 표기

## Task Commits

Each task was committed atomically:

1. **Task 1: Section 3.6 교차 검증 동기 인라인 + Section 5 가격 나이별 3단계 정책 테이블** - `9c11f2a` (docs)

## Files Created/Modified
- `docs/61-price-oracle-spec.md` - Section 3.6 getPrice() 교차 검증 인라인, Section 5.2.1 3단계 테이블 신설, Section 6.2 catch 주석 보강, Section 7.1.1 폐기 표기

## Decisions Made
- **ORACLE-05:** 교차 검증을 비동기 백그라운드에서 getPrice() 동기 인라인으로 전환. 보수적 가격 채택(높은 가격)이 반환값에 반영되려면 교차 검증 결과가 반환 전에 확정되어야 하므로. 최악 5초 추가 latency는 파이프라인 타임아웃(30초) 대비 허용 범위.
- **ORACLE-06:** 가격 나이 3단계(FRESH <5분, AGING 5-30분, STALE >30분) 통합 테이블 신설. STALE(>30분) 시 USD 평가를 스킵하고 네이티브 금액만으로 티어 결정. stale 가격으로 잘못된 INSTANT 판정보다 네이티브 전용 평가가 안전.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 61-price-oracle-spec.md의 교차 검증 및 stale 정책이 완결되어 구현 준비 완료
- Phase 44의 나머지 plans(01, 02)과 함께 v0.10 설계 완결성 확보에 기여

## Self-Check: PASSED

---
*Phase: 44-operational-logic-completion*
*Completed: 2026-02-09*
