# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 237 -- Admin UI Token Limits

## Current Position

Milestone: v27.3 토큰별 지출 한도 정책
Phase: 237 (3 of 4) (Admin UI Token Limits)
Plan: 2 of 2 in current phase
Status: Phase 237 complete
Last activity: 2026-02-22 -- Completed 237-02 (CAIP-19 token limit rows with registry integration)

Progress: [████████░░] 86%

## Performance Metrics

**Cumulative:** 53 milestones, 235 phases, 506 plans, 1,368 reqs, 4,396+ tests, ~157,584 LOC TS

**v27.3 Velocity:**
- Total plans completed: 6/7
- Average duration: 4min
- Total execution time: 0.35 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 235 | 1/1 | 3min | 3min |
| 236 | 3/3 | 13min | 4.3min |
| 237 | 2/2 | 5min | 2.5min |
| 238 | 0/1 | - | - |

## Accumulated Context

### Decisions

- v27.2에서 CAIP-19 자산 식별 체계 도입 -- token_limits 키 형식으로 재활용
- TransactionParam이 3곳 중복 정의 -- 모두 동기화 필수
- APPROVE_TIER_OVERRIDE가 설정된 경우 token_limits 무시 (의도된 동작)
- [235-01] CAIP-19 regex를 policy.schema.ts에 인라인 복제 -- caip/ 모듈과의 순환 의존성 방지
- [235-01] evaluateNativeTier에 non-null assertion 사용 -- Phase 236에서 proper undefined guards로 교체 예정
- [235-01] token_limits 키 검증: native | native:{solana|ethereum} | CAIP-19 형식
- [236-01] sign-only mapOperationToParam does not pass tokenDecimals -- ParsedOperation lacks decimals field
- [236-01] assetId: undefined explicitly set in sign-only TOKEN_TRANSFER case for interface consistency
- [236-02] APPROVE without APPROVE_TIER_OVERRIDE now falls through to SPENDING_LIMIT for token_limits evaluation
- [236-02] NATIVE_DECIMALS duplicated in database-policy-engine.ts to avoid cross-file dependency
- [236-02] parseDecimalToBigInt uses fixed-point multiplication for precision-safe comparison
- [236-02] evaluateBatch APPROVE_TIER_OVERRIDE default kept unchanged (APPROVAL) -- only single-evaluate updated
- [236-03] evaluate() + evaluateAndReserve() tokenContext wiring completed in plan 02 via buildTokenContext -- plan 03 verified
- [236-03] evaluateBatch tokenContext intentionally omitted (BATCH aggregates native amounts, raw/USD only)
- [237-01] NETWORK_NATIVE_SYMBOL is an inline constant in spending-limit-form.tsx -- no cross-module dependency
- [237-01] token_limits['native'] key removed entirely when all 3 fields are empty
- [237-01] DEFAULT_RULES.SPENDING_LIMIT stripped of raw fields -- new policies default to USD/token_limits only
- [237-02] Token registry fetched only for EVM networks (10 networks) -- Solana lacks token registry API
- [237-02] CAIP-19 asset ID used directly from registry response as token_limits key -- no manual construction
- [237-02] Manual CAIP-19 entry via prompt() for non-registry tokens or non-EVM networks
- [237-02] Token symbol display derived from registry match or parsed from CAIP-19 key suffix

### Blockers/Concerns

- STO-03: Confirmation Worker RPC 콜백 미주입 (v27.1 known gap, unrelated to token_limits)

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 237-02-PLAN.md (CAIP-19 token limit rows with registry integration)
Resume file: None
