# Requirements: WAIaaS v1.5.3

**Defined:** 2026-02-16
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1.5.3 Requirements

### 누적 지출 한도 (Cumulative Spending Limit)

- [ ] **CUMUL-01**: transactions 테이블에 amount_usd / reserved_amount_usd 컬럼이 추가되고, DB v13 마이그레이션이 기존 데이터를 보존하며 적용된다
- [ ] **CUMUL-02**: 트랜잭션 Stage 3에서 resolveEffectiveAmountUsd() 결과가 amount_usd / reserved_amount_usd로 DB에 기록된다
- [ ] **CUMUL-03**: SpendingLimitRuleSchema에 daily_limit_usd / monthly_limit_usd 필드가 추가되고, Zod 검증이 작동한다
- [ ] **CUMUL-04**: evaluateAndReserve()에서 24시간/30일 롤링 윈도우 내 누적 USD 지출을 집계하여 한도 초과 시 APPROVAL로 격상한다
- [ ] **CUMUL-05**: PENDING/QUEUED/SIGNED 상태의 reserved_amount_usd가 누적 합산에 포함되어 이중 지출이 방지된다
- [ ] **CUMUL-06**: 누적 지출이 한도의 80%에 도달하면 CUMULATIVE_LIMIT_WARNING 알림이 발송된다
- [ ] **CUMUL-07**: TX_APPROVAL_REQUIRED 이벤트에 reason 필드(per_tx / cumulative_daily / cumulative_monthly)가 추가되어 격상 사유가 구분된다
- [ ] **CUMUL-08**: Admin SpendingLimitForm에서 daily_limit_usd / monthly_limit_usd 값을 입력/수정할 수 있다
- [ ] **CUMUL-09**: PolicyRulesSummary에서 누적 한도 설정값과 현재 사용량이 시각화된다
- [ ] **CUMUL-10**: TS/Python SDK와 MCP에서 누적 한도 필드를 포함한 정책을 생성/조회할 수 있다

### 표시 통화 (Display Currency)

- [ ] **DISP-01**: IForexRateService 인터페이스로 USD→법정 통화 환율을 조회할 수 있다
- [ ] **DISP-02**: Pyth Hermes forex 피드 또는 CoinGecko vs_currencies로 환율이 조회되고, InMemoryPriceCache에 30분 TTL로 캐시된다
- [ ] **DISP-03**: SettingsService에 display 카테고리가 추가되고, display.currency 설정이 hot-reload로 즉시 반영된다
- [ ] **DISP-04**: Admin Settings에서 통화 드롭다운(검색 가능)으로 표시 통화를 선택할 수 있고, 현재 환율 미리보기가 표시된다
- [ ] **DISP-05**: Admin 대시보드/정책 폼/트랜잭션 목록에서 금액이 선택한 통화로 환산 표시된다
- [ ] **DISP-06**: 알림 메시지에 선택한 통화로 환산한 금액이 포함된다
- [ ] **DISP-07**: REST API 4개 엔드포인트(transactions/balance/assets/POST transactions)에서 ?display_currency 쿼리 파라미터로 환산 필드를 받을 수 있다
- [ ] **DISP-08**: MCP 도구 응답에 서버 설정 표시 통화로 환산한 금액이 포함된다
- [ ] **DISP-09**: Intl.NumberFormat 기반으로 통화별 올바른 기호/소수점/포맷이 적용되고, USD 외 통화에는 "≈" 접두사가 붙는다

## Future Requirements

### 표시 통화 고급

- **DISP-F01**: 트랜잭션 기록 시점 환율로 과거 환산 금액을 표시한다 (현재는 현재 환율만 사용)
- **DISP-F02**: REST API 전체 엔드포인트에 display_currency를 확장한다

### 누적 한도 고급

- **CUMUL-F01**: 누적 사용량 리셋 API를 제공하여 Owner가 수동으로 누적 카운터를 초기화할 수 있다
- **CUMUL-F02**: 주별 누적 한도(weekly_limit_usd)를 추가한다

## Out of Scope

| Feature | Reason |
|---------|--------|
| 환율 변동 알림 | 표시 통화는 UX 편의 기능. 환율 알림은 트레이딩 도구 영역 |
| 멀티 통화 동시 표시 | 하나의 display_currency만 지원. 복수 통화는 과도한 오라클 호출 |
| 과거 트랜잭션 amount_usd 백필 | v1.5.3 이전 데이터는 NULL 허용. 백필은 선택사항으로 유보 |
| 법정 통화 기준 정책 평가 | 정책은 항상 USD. 표시만 변환. KRW 기준 한도 설정은 환율 변동 리스크 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CUMUL-01 | — | Pending |
| CUMUL-02 | — | Pending |
| CUMUL-03 | — | Pending |
| CUMUL-04 | — | Pending |
| CUMUL-05 | — | Pending |
| CUMUL-06 | — | Pending |
| CUMUL-07 | — | Pending |
| CUMUL-08 | — | Pending |
| CUMUL-09 | — | Pending |
| CUMUL-10 | — | Pending |
| DISP-01 | — | Pending |
| DISP-02 | — | Pending |
| DISP-03 | — | Pending |
| DISP-04 | — | Pending |
| DISP-05 | — | Pending |
| DISP-06 | — | Pending |
| DISP-07 | — | Pending |
| DISP-08 | — | Pending |
| DISP-09 | — | Pending |

**Coverage:**
- v1.5.3 requirements: 19 total
- Mapped to phases: 0
- Unmapped: 19

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after initial definition*
