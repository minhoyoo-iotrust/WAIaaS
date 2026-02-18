# 마일스톤 m16-03: USD 정책 확장 (누적 지출 한도 + 표시 통화)

## 목표

v1.5 가격 오라클 위에 2가지 기능을 추가한다: (1) 월렛 단위 기간별(일/월) 누적 USD 지출 추적으로 분할 전송 우회를 방지하고, (2) USD 외 사용자 선호 법정 통화(KRW, EUR, JPY 등)로 자산 가치를 환산 표시하여 다국어 DX를 개선한다.

---

## 배경

### 1. 누적 지출 한도의 필요성

v1.5에서 건별 USD 정책 평가가 도입되지만, 한도 미만 소액을 반복 전송하면 누적 지출이 의도한 한도를 초과할 수 있다:

```
instant_max_usd: $10

$9 SOL 전송 → INSTANT ✓
$9 USDC 전송 → INSTANT ✓
$9 BONK 전송 → INSTANT ✓
합계 $27 — 건별로는 모두 통과
```

누적 한도는 토큰 종류와 무관하게 **기간 내 총 USD 지출**을 제한하여 이 문제를 해결한다.

### 2. 표시 통화의 필요성

한국/일본/유럽 등 비영어권 Owner는 USD 금액의 체감이 어렵다:

```
현재: "월렛 agent-1이 3.33 SOL ($500)을 전송했습니다"
개선: "월렛 agent-1이 3.33 SOL (₩725,000)을 전송했습니다"
```

정책 평가 로직은 변경하지 않고, **표시 레이어에서만 환율 변환**을 적용하여 DX를 개선한다.

---

## Part 1: 누적 USD 지출 한도

### SpendingLimitRuleSchema 확장

기존 건별 필드(v1.5)에 누적 필드를 추가한다:

```json
{
  "type": "SPENDING_LIMIT",
  "instant_max_usd": 10,
  "notify_max_usd": 100,
  "delay_max_usd": 1000,
  "daily_limit_usd": 500,
  "monthly_limit_usd": 5000
}
```

| 필드 | 설명 |
|------|------|
| daily_limit_usd | 24시간 롤링 윈도우 내 누적 USD 지출 상한 |
| monthly_limit_usd | 30일 롤링 윈도우 내 누적 USD 지출 상한 |

### 핵심 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| 누적 추적 | 월렛별 기간 내 USD 지출 합산. transactions 테이블에서 CONFIRMED/SIGNED 상태 트랜잭션의 amount_usd를 집계 |
| 정책 평가 통합 | DatabasePolicyEngine Stage 3에서 건별 평가 후 누적 평가 추가. 건별 OK + 누적 초과 시 APPROVAL로 격상 |
| reserved_amount 연동 | 대기 중(PENDING/DELAYED) 트랜잭션의 USD 환산 금액도 누적에 포함하여 이중 지출 방지 |
| Admin UI | SpendingLimitForm에 daily_limit_usd / monthly_limit_usd 입력 필드 추가 (기존 건별 USD 필드는 v1.5.2에서 이미 구현됨). PolicyRulesSummary에 누적 한도 시각화 + 현재 사용량 표시 |

### 누적 한도 초과 시 동작

기존 4-tier 보안 모델과 일관되게, 누적 한도 초과 시 **무조건 거부가 아닌 APPROVAL 격상**으로 처리한다. Owner에게 판단 기회를 제공한다.

```
1. 건별 USD 평가 → tier_per_tx (INSTANT/NOTIFY/DELAY/APPROVAL)
2. 누적 USD 평가:
   - 기간 내 누적 + 현재 건 USD > daily_limit_usd → APPROVAL로 격상
   - 기간 내 누적 + 현재 건 USD > monthly_limit_usd → APPROVAL로 격상
3. 최종 tier = max(tier_per_tx, tier_cumulative)
```

예시 (daily_limit_usd: $500, 현재 누적 $480):

| 요청 | 예상 누적 | 건별 결과 | 누적 결과 | 최종 |
|------|----------|----------|----------|------|
| $15 전송 | $495 | INSTANT | 한도 내 | INSTANT |
| $30 전송 | $510 | INSTANT | 한도 초과 | **APPROVAL** |

### Owner의 선택지

누적 한도 초과 알림을 받은 Owner는 세 가지 대응이 가능하다:

1. **건별 승인** — Admin UI/API에서 해당 트랜잭션만 승인하여 실행
2. **한도 상향** — daily_limit_usd / monthly_limit_usd 값을 조정 (hot-reload 즉시 반영)
3. **거부** — 트랜잭션 거부

### 오라클 장애 시

- 현재 건의 USD 환산 실패 → 누적 평가 스킵, 건별 네이티브 금액 평가만 수행 (v1.5 graceful fallback 동일)
- 과거 트랜잭션 amount_usd는 트랜잭션 시점에 기록되므로 누적 합산에는 영향 없음

---

## Part 2: 표시 통화 (Display Currency)

### 핵심 원칙

- **평가는 USD, 표시만 변환**: 정책 엔진은 항상 USD로 평가. 환율 변동이 정책 결과에 영향을 주지 않음
- **Zero-config 동작**: Pyth forex 피드로 환율 조회 (API 키 불필요). CoinGecko 활성 시 직접 통화 조회 가능
- **Fallback**: 환율 조회 실패 시 USD 그대로 표시 (기능 저하 없음)

### 지원 통화

Pyth forex 피드(142쌍)와 CoinGecko vs_currencies(46개)의 교집합 기반으로 43개 법정 통화를 지원한다.

#### 1차 지원 (주요 통화)

| 통화 | 코드 | Pyth FX | CoinGecko |
|------|------|---------|-----------|
| 미국 달러 | USD | - (기본) | O |
| 한국 원 | KRW | USD/KRW | O |
| 일본 엔 | JPY | USD/JPY | O |
| 유로 | EUR | EUR/USD | O |
| 영국 파운드 | GBP | GBP/USD | O |
| 중국 위안 | CNY | USD/CNY | O |
| 캐나다 달러 | CAD | USD/CAD | O |
| 호주 달러 | AUD | AUD/USD | O |
| 스위스 프랑 | CHF | USD/CHF | O |
| 싱가포르 달러 | SGD | USD/SGD | O |
| 홍콩 달러 | HKD | USD/HKD | O |
| 인도 루피 | INR | USD/INR | O |

#### 2차 지원 (지역 통화)

| 통화 | 코드 | Pyth FX | CoinGecko |
|------|------|---------|-----------|
| 대만 달러 | TWD | USD/TWD | O |
| 태국 바트 | THB | USD/THB | O |
| 말레이시아 링깃 | MYR | USD/MYR | O |
| 인도네시아 루피아 | IDR | USD/IDR | O |
| 필리핀 페소 | PHP | USD/PHP | O |
| 베트남 동 | VND | USD/VND | O |
| 브라질 헤알 | BRL | USD/BRL | O |
| 멕시코 페소 | MXN | USD/MXN | O |
| 칠레 페소 | CLP | USD/CLP | O |
| 터키 리라 | TRY | USD/TRY | O |
| 폴란드 즐로티 | PLN | USD/PLN | O |
| 체코 코루나 | CZK | USD/CZK | O |
| 헝가리 포린트 | HUF | USD/HUF | O |
| 스웨덴 크로나 | SEK | USD/SEK | O |
| 노르웨이 크로네 | NOK | USD/NOK | O |
| 덴마크 크로네 | DKK | USD/DKK | O |
| 뉴질랜드 달러 | NZD | NZD/USD | O |
| 남아공 랜드 | ZAR | USD/ZAR | O |
| 이스라엘 셰켈 | ILS | USD/ILS | O |
| 사우디 리얄 | SAR | USD/SAR | O |
| UAE 디르함 | AED | USD/AED | O |
| 쿠웨이트 디나르 | KWD | USD/KWD | O |
| 바레인 디나르 | BHD | USD/BHD | O |
| 나이지리아 나이라 | NGN | USD/NGN | O |
| 러시아 루블 | RUB | USD/RUB | O |
| 우크라이나 흐리브냐 | UAH | USD/UAH | O |
| 파키스탄 루피 | PKR | USD/PKR | O |
| 방글라데시 타카 | BDT | - | O |
| 스리랑카 루피 | LKR | - | O |
| 미얀마 챗 | MMK | - | O |
| 조지아 라리 | GEL | - | O |

**총 43개 법정 통화** 지원. Pyth 미지원 통화(BDT, LKR, MMK, GEL)는 CoinGecko 활성 시에만 지원.

### 설정

기본값은 config.toml, 런타임 변경은 Admin Settings:

```toml
[display]
currency = "USD"   # 기본값
```

환경변수: `WAIAAS_DISPLAY_CURRENCY=KRW`

Admin Settings에서 변경 시 SettingsService를 통해 hot-reload 즉시 반영.

### Admin Settings 통화 선택 UI

| 항목 | 내용 |
|------|------|
| 위치 | Admin Settings 페이지 > Display 섹션 |
| UI | 드롭다운(검색 가능). 통화 코드 + 이름 + 기호 표시 (예: "KRW - 한국 원 (₩)") |
| 적용 | 선택 즉시 hot-reload. 페이지 새로고침 없이 모든 금액 표시 갱신 |
| 현재 환율 | 드롭다운 옆에 현재 환율 미리보기 표시 (예: "1 USD = ₩1,450") |

### 환율 서비스 (ForexRateService)

| 항목 | 내용 |
|------|------|
| 인터페이스 | `getRate(from: "USD", to: CurrencyCode): Promise<ForexRate>` |
| Primary 소스 | Pyth Hermes forex 피드 (Zero-config, 38쌍 이상) |
| Fallback 소스 | CoinGecko vs_currencies (opt-in, 46개 통화) |
| 캐시 | 기존 InMemoryPriceCache 재사용. 환율 TTL: 30분 (forex는 crypto보다 변동폭 작음) |
| 장애 시 | 환율 조회 실패 → USD 그대로 표시 (표시 기능 저하, 정책 영향 없음) |

### 적용 범위

#### Admin UI (서버 설정 display_currency 자동 적용)

| 위치 | 변환 대상 | 예시 |
|------|----------|------|
| Admin 대시보드 | 자산 잔고, 총 자산 가치 | SOL: 12.5 (₩1,875,000) |
| Admin 정책 폼 | USD 임계값 옆에 환산 표시 | instant_max_usd: $10 (≈₩14,500) |
| Admin 트랜잭션 | 트랜잭션 금액 | 3.33 SOL (≈₩725,000) |
| Admin Settings | 통화 드롭다운 + 환율 미리보기 | 1 USD = ₩1,450 |

#### 알림 (서버 설정 display_currency 자동 적용)

| 위치 | 변환 대상 | 예시 |
|------|----------|------|
| 알림 메시지 | 전송/정책 위반 금액 | "≈₩725,000 상당의 SOL 전송" |

#### REST API (`?display_currency=KRW` 쿼리 파라미터 opt-in)

> **적용 범위 한정**: 아래 4개 엔드포인트에만 `display_currency` 쿼리 파라미터를 지원한다. 모든 엔드포인트에 적용하면 과도한 오라클 호출이 발생하므로, 금액 표시가 의미 있는 엔드포인트만 선별한다.

| 엔드포인트 | display_amount 포함 위치 | 예시 |
|-----------|----------------------|------|
| `GET /v1/wallets/:id/transactions` | 각 트랜잭션 객체에 `display_amount` 필드 | `"display_amount": "≈₩725,000"` |
| `GET /v1/wallets/:id/balance` | 잔고 응답에 `display_balance` 필드 | `"display_balance": "≈₩1,875,000"` |
| `GET /v1/wallets/:id/assets` | 각 자산에 `display_value` 필드 | `"display_value": "≈₩500,000"` |
| `POST /v1/transactions` 응답 | 트랜잭션 결과에 `display_amount` 필드 | `"display_amount": "≈₩725,000"` |

`display_currency` 미지정 시 기존 응답 그대로 (하위 호환). 서버 설정 `display.currency`가 기본값으로 사용되며, 쿼리 파라미터가 우선한다.

#### MCP 도구 (서버 설정 display_currency 자동 적용)

| 위치 | 변환 대상 | 예시 |
|------|----------|------|
| MCP 도구 응답 | 금액 표시에 환산 포함 | "3.33 SOL (≈₩725,000)" |

### 통화 포매팅

`Intl.NumberFormat` API를 활용하여 locale 기반 자동 포매팅:

| 통화 | 포맷 | 예시 |
|------|------|------|
| KRW | ₩#,### (소수점 없음) | ≈₩725,000 |
| JPY | ¥#,### (소수점 없음) | ≈¥75,000 |
| USD | $#,###.## | $500.00 |
| EUR | €#,###.## | ≈€465.50 |
| GBP | £#,###.## | ≈£395.25 |

USD 외 통화는 환율 환산 근사치이므로 "≈" 접두사를 붙인다.

---

## 산출물 요약

### Part 1: 누적 지출 한도

| 항목 | 내용 |
|------|------|
| DB | transactions 테이블에 amount_usd 컬럼 추가 (트랜잭션 시점 USD 환산 금액 기록) |
| 정책 스키마 | daily_limit_usd, monthly_limit_usd 필드 |
| 정책 엔진 | 누적 USD 집계 쿼리 + APPROVAL 격상 로직 |
| Admin UI | 누적 한도 설정 폼 + 현재 사용량 표시 + 한도 상향 기능 |
| SDK/MCP | 정책 생성 시 누적 필드 지원 |
| 알림 | 누적 한도 80% 도달 시 CUMULATIVE_LIMIT_WARNING 경고 알림, 초과 시 TX_APPROVAL_REQUIRED(reason=cumulative) 알림 |

### Part 2: 표시 통화

| 항목 | 내용 |
|------|------|
| ForexRateService | Pyth forex Primary + CoinGecko Fallback, 30분 캐시 |
| Admin Settings | Display 섹션에 통화 드롭다운 + 환율 미리보기 |
| Admin UI | 대시보드/정책 폼/트랜잭션 전체 환산 표시 |
| 알림 | 환산 금액 포함 메시지 |
| REST API | display_amount 필드 opt-in |

---

## 구현 전 확인 사항 (Pre-Implementation Checklist)

### Phase Research에서 반드시 검증할 항목

#### 1. Pyth forex 피드 실제 가용성 확인

문서에서 "Pyth forex 142쌍 지원"을 전제하지만, Pyth Hermes API에서 forex feed ID가 실제로 사용 가능한지 검증이 필요하다. Pyth는 crypto 위주라 forex 피드가 제한적이거나 별도 asset_type일 수 있다.

**검증 방법**: phase research에서 Hermes API 실 호출로 확인
```
GET https://hermes.pyth.network/v2/price_feeds?query=USD/KRW&asset_type=fx
GET https://hermes.pyth.network/v2/price_feeds?query=EUR/USD&asset_type=fx
```

**Fallback 전략 (우선순위)**:

1. **Pyth forex 지원 시**: Pyth Hermes forex 피드를 Primary로 사용 (Zero-config)
2. **Pyth forex 미지원 시**: 아래 대안 평가 후 결정

| 대안 | 장점 | 단점 |
|------|------|------|
| CoinGecko `vs_currencies` | 기존 인프라 재사용, 46개 통화 | Demo API 월 10,000 call 제한. crypto 가격 + forex를 모두 CoinGecko로 처리하면 할당량 초과 위험 |
| frankfurter.app | 완전 무료, rate limit 없음, ECB 기반 | 33개 통화만 지원, KRW 미지원, 주말 미갱신 |
| exchangerate.host | 무료 tier 월 100 call | 상용 전환 필요 가능성 |
| 하드코딩 환율 테이블 | 외부 의존성 없음 | 수동 갱신 필요, 정확도 낮음 |

> **Phase research에서 결정**: Pyth forex 가용성 확인 후, 미지원 시 CoinGecko rate limit 예산 분배(crypto 70% + forex 30%) 또는 대안 API 채택 여부를 결정한다. CoinGecko를 forex에도 사용할 경우 crypto 가격 캐시 TTL을 5분→10분으로 늘려 호출 횟수를 줄이는 방안도 검토한다.

### 확정된 기술 결정

#### 2. amount_usd 기록 시점 — Stage 3 산출값을 UPDATE로 기록

> ⚠️ **코드베이스 검증 결과** (2026-02-16): `resolveEffectiveAmountUsd()`는 Stage 1이 아닌 **Stage 3(`stage3Policy`, stages.ts:278)**에서 호출된다. Stage 1(`stage1Validate`)에서 트랜잭션을 INSERT한 후, Stage 3에서 비동기 오라클을 호출하여 USD 환산값을 계산한다. 이는 better-sqlite3의 동기 트랜잭션(`evaluateAndReserve`) 내부에서 비동기 HTTP 오라클 호출이 불가능하기 때문이다.

따라서 amount_usd 기록은 **Stage 3에서 USD 계산 후 UPDATE**로 수행한다:

```
Stage 1: transactions INSERT (amount_usd = NULL)
Stage 3: resolveEffectiveAmountUsd() → usdAmount 산출 (비동기 오라클 호출)
       → evaluateAndReserve() 내부에서 UPDATE transactions SET amount_usd = ?, reserved_amount_usd = ? WHERE id = ?
       → 동일 BEGIN IMMEDIATE 트랜잭션 안에서 누적 집계 + 기록
```

이 방식은 정책 평가와 동일한 시점의 가격을 사용하므로 일관성이 보장되며, 기존 파이프라인 Stage 순서 변경이 불필요하다.

#### 3. reserved_amount_usd 컬럼 추가 (이중 지출 방지)

대기 중(PENDING/QUEUED/DELAYED) 트랜잭션의 USD 금액을 누적에 포함하기 위해, `reserved_amount_usd` 컬럼을 추가한다. 실시간 재환산 대신 기록 시점의 USD 값을 사용하여 환율 변동에 의한 불일치를 방지한다.

| 옵션 | 방식 | 선택 |
|------|------|------|
| **A. reserved_amount_usd 컬럼** | INSERT 시 USD 환산 값 기록. 집계 시 SUM만 수행 | **채택** |
| B. 실시간 재환산 | 집계 시마다 오라클 호출하여 재환산 | 환율 변동으로 불일치, 오라클 부하 |

누적 집계 쿼리:

> ⚠️ **TOCTOU 방지**: 아래 누적 집계 쿼리와 `reserved_amount_usd` UPDATE는 반드시 기존 `evaluateAndReserve()`의 **`BEGIN IMMEDIATE` 동기 트랜잭션 내부**에서 수행한다. 현재 `reserved_amount` SUM + UPDATE가 동일 트랜잭션에서 실행되는 것과 동일한 패턴이다. 트랜잭션 밖에서 수행하면 동시 요청에 의한 이중 지출이 발생할 수 있다.

```sql
-- evaluateAndReserve() BEGIN IMMEDIATE 트랜잭션 내부에서 실행:

-- 1. 확정된 트랜잭션 누적 (롤링 윈도우)
SELECT COALESCE(SUM(amount_usd), 0) FROM transactions
  WHERE wallet_id = ? AND status IN ('CONFIRMED', 'SIGNED')
  AND created_at >= ? AND amount_usd IS NOT NULL

-- 2. 대기 중 트랜잭션 예약분 (이중 지출 방지)
+ SELECT COALESCE(SUM(reserved_amount_usd), 0) FROM transactions
  WHERE wallet_id = ? AND status IN ('PENDING', 'QUEUED', 'SIGNED')
  AND reserved_amount_usd IS NOT NULL

-- 3. 누적 평가 후 현재 건의 USD 예약 기록
UPDATE transactions SET amount_usd = ?, reserved_amount_usd = ? WHERE id = ?
```

#### 4. ForexRateService — IPriceOracle과 분리

IPriceOracle은 crypto 자산 가격 전용으로 유지한다. forex 환율은 관심사가 다르므로 별도 `IForexRateService` 인터페이스를 추가한다. `InMemoryPriceCache`는 `forex:USD/KRW` 키 패턴으로 재사용 가능.

```
IPriceOracle (crypto 전용, 변경 없음)
  ├── PythOracleProvider
  └── CoinGeckoOracleProvider

IForexRateService (신규, forex 전용)
  ├── PythForexProvider (Hermes API 동일 엔드포인트, forex feed ID)
  └── CoinGeckoForexProvider (vs_currencies 파라미터)
```

#### 5. 누적 한도 알림 이벤트 — 1개 추가 + 기존 이벤트 확장

> ⚠️ **중복 알림 방지**: 누적 한도 초과로 APPROVAL 격상 시 기존 `TX_APPROVAL_REQUIRED` 이벤트가 발생한다. 별도 `CUMULATIVE_LIMIT_EXCEEDED` 이벤트를 추가하면 Owner에게 중복 알림이 발송된다.

**결정**: 기존 `TX_APPROVAL_REQUIRED`에 `reason` 필드를 추가하여 격상 사유를 구분한다. 신규 이벤트는 80% 경고 1개만 추가한다.

| 이벤트 | 설명 |
|--------|------|
| CUMULATIVE_LIMIT_WARNING (신규) | 누적 한도 80% 도달 시 경고 (APPROVAL 격상 전 사전 알림) |
| TX_APPROVAL_REQUIRED (기존 확장) | `reason` 필드 추가: `"per_tx"` (건별 한도) / `"cumulative_daily"` (일별 누적) / `"cumulative_monthly"` (월별 누적). 알림 메시지에 누적 사용량 포함 (예: "일별 누적 $510/$500 초과") |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 누적 윈도우 | 24시간/30일 롤링 (UTC) | 고정 날짜 기준이 아닌 슬라이딩 윈도우로 타임존 모호함 제거 |
| 2 | 누적 초과 시 동작 | APPROVAL 격상 | 4-tier 보안 모델 일관성. 무조건 거부보다 Owner 판단 기회 제공 |
| 3 | 환율 소스 | Pyth forex Primary + CoinGecko Fallback | v1.5 오라클 구조와 동일 패턴. 단, Pyth forex 가용성은 phase research에서 검증 필요 |
| 4 | 환율 캐시 TTL | 30분 | Forex는 crypto 대비 변동폭 작음. 5분은 과도, 1시간은 부정확할 수 있음 |
| 5 | 포매팅 | Intl.NumberFormat | Node.js 내장 API, 외부 의존성 없음. locale별 자동 처리 |
| 6 | API 응답 포함 | display_amount 필드 opt-in | 기본 응답은 USD 유지 (하위 호환). ?display_currency=KRW 쿼리 파라미터 지원 |
| 7 | 설정 변경 방식 | SettingsService + Admin UI | 기존 Settings 인프라(v1.4.4) 재사용. hot-reload 즉시 반영 |
| 8 | amount_usd 기록 시점 | Stage 3에서 USD 계산 후 UPDATE로 기록 | `resolveEffectiveAmountUsd()`가 Stage 3에서 호출되므로 (비동기 오라클 → 동기 DB 분리), `evaluateAndReserve()` 내부에서 UPDATE. Stage 1 INSERT 시에는 NULL |
| 9 | reserved_amount USD | reserved_amount_usd 컬럼 추가 | 실시간 재환산보다 기록 시점 고정이 일관적. 오라클 부하 없음 |
| 10 | 환율 서비스 분리 | IForexRateService (IPriceOracle과 별도) | crypto 가격과 forex 환율은 관심사 분리. InMemoryPriceCache는 공유 |
| 11 | 누적 집계 TOCTOU 방지 | evaluateAndReserve BEGIN IMMEDIATE 내부 | 기존 reserved_amount SUM과 동일 패턴. 트랜잭션 외부 실행 시 이중 지출 위험 |
| 12 | 누적 한도 초과 알림 | TX_APPROVAL_REQUIRED reason 필드 확장 | 별도 CUMULATIVE_LIMIT_EXCEEDED 이벤트는 TX_APPROVAL_REQUIRED와 중복. reason 필드로 사유 구분 |
| 13 | display_currency API 범위 | 4개 엔드포인트 한정 | transactions/balance/assets/POST transactions. 과도한 오라클 호출 방지 |

---

## E2E 검증 시나리오

### Part 1: 누적 지출 한도 (10개)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 일별 누적 한도 내 → 건별 평가 유지 | daily_limit_usd=$500, 누적 $400 + $50 전송 → 건별 INSTANT 유지 assert | [L0] |
| 2 | 일별 누적 한도 초과 → APPROVAL 격상 | daily_limit_usd=$500, 누적 $480 + $30 전송 → APPROVAL 격상 assert | [L0] |
| 3 | 월별 누적 한도 초과 → APPROVAL 격상 | monthly_limit_usd=$5000, 누적 $4900 + $200 전송 → APPROVAL 격상 assert | [L0] |
| 4 | 일별+월별 동시 설정 → 더 엄격한 쪽 적용 | daily=$500, monthly=$5000, 일 누적 $490 + $20 → 일별 초과 → APPROVAL assert | [L0] |
| 5 | Owner 승인 후 실행 → 누적에 반영 | APPROVAL 격상 → Owner 승인 → CONFIRMED → 누적 합산에 포함 assert | [L0] |
| 6 | Owner 한도 상향 → hot-reload 즉시 반영 | daily_limit_usd $500→$1000 변경 → 다음 요청에서 새 한도 적용 assert | [L0] |
| 7 | PENDING 트랜잭션 reserved_amount 포함 | $400 PENDING + $150 요청 → 예상 누적 $550 → APPROVAL 격상 assert | [L0] |
| 8 | 24시간 롤링 윈도우 → 오래된 건 제외 | 25시간 전 $300 + 현재 $400 → 누적 $400 (25시간 전 건 제외) assert | [L0] |
| 9 | 오라클 장애 → 누적 평가 스킵 → 건별 네이티브 fallback | 오라클 실패 + 전송 → 누적 미평가 + 건별 네이티브 평가만 수행 assert | [L0] |
| 10 | 누적 80% 도달 → CUMULATIVE_LIMIT_WARNING 알림 발송 | daily=$500, 누적 $400 ($9 전송으로 $409 도달) → 80% 경고 알림 assert | [L0] |
| 10a | 누적 초과 APPROVAL → TX_APPROVAL_REQUIRED reason="cumulative_daily" | daily=$500, 누적 $480 + $30 → TX_APPROVAL_REQUIRED 알림에 reason="cumulative_daily" + 누적 사용량 포함 assert | [L0] |

### Part 2: 표시 통화 (11개)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 11 | Admin Settings에서 KRW 선택 → 전체 UI 원화 표시 | Settings 드롭다운 KRW 선택 → 대시보드 잔고 ₩ 표시 assert | [L0] |
| 12 | Admin Settings 변경 → hot-reload 즉시 반영 | USD→KRW 변경 → 페이지 새로고침 없이 금액 갱신 assert | [L0] |
| 13 | 환율 조회 성공 → 알림에 환산 금액 포함 | mock ForexRate(USD/KRW=1450) + SOL 전송 알림 → "≈₩725,000" 포함 assert | [L0] |
| 14 | 환율 조회 실패 → USD 그대로 표시 (graceful fallback) | mock forex 실패 + 알림 → "$500.00" 표시 assert | [L0] |
| 15 | display_currency=JPY → ¥ 기호 + 소수점 없음 포맷 | config JPY + 환산 표시 → "≈¥75,000" 포맷 assert | [L0] |
| 16 | display_currency=EUR → € 기호 + 소수점 2자리 포맷 | config EUR + 환산 표시 → "≈€465.50" 포맷 assert | [L0] |
| 17 | 정책 폼에 USD 임계값 + 환산 동시 표시 | instant_max_usd=10 입력 → 옆에 "(≈₩14,500)" 표시 assert | [L0] |
| 18 | REST API ?display_currency=KRW → display_amount 필드 포함 | GET /v1/wallets/:id/transactions?display_currency=KRW → display_amount 필드 assert | [L0] |
| 19 | Pyth forex 미지원 통화(BDT) + CoinGecko 활성 → 정상 환산 | Settings BDT 선택 + CoinGecko 키 설정 → 환산 표시 assert | [L0] |
| 20 | Pyth forex 미지원 통화(BDT) + CoinGecko 미활성 → USD fallback + 안내 | Settings BDT 선택 + CoinGecko 미설정 → USD 표시 + "CoinGecko API 키 필요" 안내 assert | [L0] |
| 21 | 통화 드롭다운에 환율 미리보기 표시 | Settings 드롭다운 KRW 선택 → "1 USD = ₩1,450" 미리보기 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.5 (DeFi + 가격 오라클) | IPriceOracle, InMemoryPriceCache, resolveEffectiveAmountUsd(), SpendingLimitRuleSchema USD 필드, Pyth Hermes 인프라 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 누적 집계 쿼리 성능 | 트랜잭션 수가 많아지면 기간 내 SUM 쿼리 비용 증가 | transactions 테이블에 (wallet_id, created_at, amount_usd) 복합 인덱스 추가. 롤링 윈도우 집계를 인메모리 캐시로 최적화 가능 |
| 2 | 과거 트랜잭션 USD 미기록 | v1.5.3 이전 트랜잭션에는 amount_usd가 없음 | NULL 허용, 누적 집계에서 NULL 제외. 마이그레이션 시 과거 데이터 백필은 선택사항 |
| 3 | 타임존/윈도우 기준 | "일별"의 기준 시점이 모호 | 24시간/30일 롤링 윈도우(UTC) 사용. 슬라이딩 윈도우로 구현 |
| 4 | Pyth forex 시장 시간 제한 | FX 피드는 시장 시간에만 갱신. 주말/공휴일에 stale 가능 | 마지막 유효 환율을 캐시에서 사용. 표시 용도이므로 약간의 지연 허용 |
| 5 | 환율 변동으로 표시 금액 혼란 | 같은 트랜잭션이 시점에 따라 다른 원화 금액으로 표시 | 트랜잭션 목록은 기록 시점 환율 사용. 실시간 잔고는 현재 환율. "≈" 접두사로 근사치 명시 |
| 6 | CoinGecko Demo API rate limit | Pyth forex 미지원 시 CoinGecko가 crypto + forex 모두 담당하면 월 10,000 call 초과 위험 | Phase research에서 Pyth forex 가용성 확인. 미지원 시 rate limit 예산 분배(crypto 70% + forex 30%) 또는 대안 API(frankfurter.app 등) 채택 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3-4개 (누적 한도 엔진 / 누적 Admin UI / 환율 서비스 + 표시 / 통합 테스트) |
| 신규 파일 | 8-12개 |
| 수정 파일 | 10-15개 |
| 테스트 | 21개 |
| DB 마이그레이션 | 1개 (amount_usd + reserved_amount_usd 컬럼 추가) |

---

## 코드베이스 현황 참조 (v1.5.2 기준)

> 2026-02-16 코드베이스 검증 결과. Phase research에서 최신 코드와 재검증 필요.

| 항목 | 현재 상태 | v1.5.3 작업 |
|------|----------|------------|
| SpendingLimitRuleSchema USD 필드 | ✅ instant_max_usd/notify_max_usd/delay_max_usd 존재 (v1.5) | daily_limit_usd/monthly_limit_usd 추가 |
| resolveEffectiveAmountUsd() | ✅ Stage 3에서 호출 (stages.ts:278) | 반환값을 DB에 기록하는 UPDATE 추가 |
| evaluateAndReserve() | ✅ usdAmount 파라미터 존재 (v1.5) | 누적 집계 쿼리 + reserved_amount_usd UPDATE 추가 |
| transactions.amount_usd | ❌ 컬럼 없음 | v13 마이그레이션으로 추가 |
| transactions.reserved_amount_usd | ❌ 컬럼 없음 | v13 마이그레이션으로 추가 |
| SpendingLimitForm (Admin) | ✅ 건별 USD 입력 필드 존재 (v1.5.2) | daily/monthly 누적 필드만 추가 |
| PolicyRulesSummary | ❌ USD 시각화 없음 (네이티브만 표시) | 누적 한도 시각화 추가 |
| PythOracle/CoinGeckoOracle | ❌ forex 미지원 (crypto USD 전용) | IForexRateService 신규 추가 |
| NotificationEventType | ✅ 21개 이벤트 | CUMULATIVE_LIMIT_WARNING 1개 추가 |
| SettingsService 카테고리 | ✅ 6개 (notifications/rpc/security/daemon/walletconnect/oracle) | display 카테고리 추가 |
| DB schema_version | v12 | v13으로 마이그레이션 |

---

*최종 업데이트: 2026-02-16 코드베이스 검증 반영 — amount_usd 기록 시점 수정(Stage 3 UPDATE), TOCTOU 명시, 알림 중복 해소, display_currency API 범위 한정, Pyth forex fallback 보완, Admin UI scope 명확화.*
*선행: v1.5 (DeFi + 가격 오라클)*
