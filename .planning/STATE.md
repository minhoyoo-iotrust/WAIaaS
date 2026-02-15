# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 138 - Forex 환산 서비스

## Current Position

Phase: 137 of 139 (누적 한도 Admin UI + SDK/MCP)
Plan: 2 of 2 in current phase (COMPLETE)
Status: Phase 137 complete
Last activity: 2026-02-16 -- 137-02 policies.skill.md 누적 한도 문서화 + TS/Python SDK SpendingLimitRules 타입

Progress: [█████░░░░░] 50% (4/8 plans)

## Performance Metrics

**Cumulative:** 32 milestones, 135 phases, 293 plans, 831 reqs, 2,111 tests, ~188,000 LOC

**v1.5.3 Scope:** 4 phases, 8 plans, 19 requirements

## Accumulated Context

### Decisions

Full log in PROJECT.md.
Recent:
- v1.5.3: amount_usd 기록은 Stage 3에서 UPDATE (비동기 오라클 -> 동기 DB 분리)
- v1.5.3: reserved_amount_usd 컬럼으로 이중 지출 방지 (실시간 재환산 대신 기록 시점 고정)
- v1.5.3: IForexRateService를 IPriceOracle과 분리 (crypto/forex 관심사 분리)
- v1.5.3: TX_APPROVAL_REQUIRED reason 필드 확장 (별도 이벤트 대신 중복 방지)
- 136-01: amount_usd/reserved_amount_usd에 동일 값 기록 (확정용 vs 대기 집계용 분리)
- 136-01: daily_limit_usd/monthly_limit_usd는 .positive()로 0 비허용 (비활성화는 필드 미설정)
- 136-02: SIGNED 중복 방지 -- CONFIRMED/SIGNED는 amount_usd, PENDING/QUEUED는 reserved_amount_usd로 분리 집계
- 136-02: daily 초과 감지 시 monthly 평가 스킵 (중복 알림 방지)
- 136-02: APPROVAL 알림은 downgrade 전 tier 기준 -- downgraded=true면 미발송
- 137-01: handleUsdChange 재사용 -- 기존 USD 티어와 동일 빈값/0/NaN 처리
- 137-01: 사용량(current usage) 표시는 현 스코프 제외 -- PolicyRulesSummary는 설정값만 표시
- 137-02: SDK에 policy CRUD 메서드 미추가 -- 참조 타입만 제공 (스코프 외)
- 137-02: X402_ALLOWED_DOMAINS 타입 섹션 추가 (12 Types 정합성 보완)
- 137-02: approval_timeout phantom 필드 제거, delay_seconds 기본값 900 정정

### Blockers/Concerns

- Pyth forex 피드 가용성 미검증 -- Phase 138 research에서 확인 필요
- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 CLI E2E failures (E-07~09) -- daemon-harness adapter: param

## Session Continuity

Last session: 2026-02-16
Stopped at: Completed 137-02-PLAN.md (Phase 137 complete)
Resume file: None
