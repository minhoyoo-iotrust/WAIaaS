# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 138 - Forex 환산 서비스

## Current Position

Phase: 138 of 139 (Forex 환산 서비스)
Plan: 2 of 2 in current phase (COMPLETE)
Status: 138-01 complete, 138-02 complete -- Phase 138 done
Last activity: 2026-02-16 -- 138-02 SettingsService display + CurrencySelect + daemon ForexRateService 통합

Progress: [████████░░] 75% (6/8 plans)

## Performance Metrics

**Cumulative:** 32 milestones, 135 phases, 293 plans, 831 reqs, 2,150 tests, ~189,000 LOC

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
- 138-01: tether vs_currencies 방식으로 USD→법정통화 환율 조회 (BTC 비율 계산 대신 단일 API 호출)
- 138-01: InMemoryPriceCache 별도 인스턴스(30분 TTL) -- crypto 캐시와 분리
- 138-01: Intl.NumberFormat en-US locale 통일 -- 일관된 숫자 형식
- 138-01: ZERO_DECIMAL_CURRENCIES Set -- getCurrencyMeta 의존 없이 core에서 독립 판단
- 138-01: forexRateService optional dep -- 138-02에서 daemon bootstrap 통합
- 138-02: display.currency는 DB 직접 읽기 -- hot-reload 시 subsystem 재시작 불필요
- 138-02: CurrencySelect 43개 통화 인라인 -- CSP로 daemon import 불가
- 138-02: GET/PUT /admin/settings 응답에 oracle+display 포함 (기존 누락 보완)
- 138-02: /v1/admin/forex/* masterAuth 등록 (138-01 누락 보안 수정)

### Blockers/Concerns

- Pyth forex 피드 -- CoinGecko tether 방식 채택으로 불필요 (138-01 해소)
- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 CLI E2E failures (E-07~09) -- daemon-harness adapter: param

## Session Continuity

Last session: 2026-02-16
Stopped at: Completed 138-02-PLAN.md (Phase 138 done)
Resume file: None
