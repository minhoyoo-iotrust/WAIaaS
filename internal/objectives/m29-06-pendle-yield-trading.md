# 마일스톤 m29-06: Yield Trading (Pendle) + Yield 프레임워크

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

DeFi Yield 프레임워크(수익률 추적, 만기 관리, PT/YT 포지션 모니터링)를 구축하고, Pendle Finance를 첫 번째 Yield Provider로 구현하여, AI 에이전트가 고정 수익률 전략을 정책 평가 하에 실행할 수 있는 상태.

---

## 배경

m29-02~m29-04에서 Lending(변동 이자율)이 지원되지만, **고정 수익률**(fixed yield)은 불가능하다. Pendle은 수익률을 PT(원금 토큰)와 YT(수익 토큰)로 분리하여 거래할 수 있게 한다.

- **PT 구매**: 만기까지 보유하면 원금 100% 회수 + 고정 수익률 확보 (채권과 유사)
- **YT 구매**: 변동 수익률에 레버리지 노출 (수익률 상승 시 이익)

Pendle은 TVL ~$4B으로 수익률 거래 분야 선두이며, 10개 EVM 체인(Ethereum, Arbitrum, Base, Optimism, BNB, Mantle, Sonic, Berachain 등)을 지원한다. REST API가 무료 티어(100 CU/분, 200,000 CU/주)로 제공되어 트랜잭션 빌드까지 API 호출만으로 가능하다.

### 사용 시나리오

```
AI 에이전트: "stETH를 Pendle에서 고정 5% 수익률로 예치해줘"

1. Pendle API: /markets (stETH pool, 만기 2026-06, implied APY 5.2%)
2. stETH → PT-stETH 구매 (할인 가격)
3. 만기(2026-06)에 PT-stETH → stETH 1:1 상환 → 고정 5.2% 수익 확보
```

---

## 구현 대상

### Yield 프레임워크 (공통 인프라)

| 컴포넌트 | 내용 |
|----------|------|
| IYieldProvider | Yield 전용 인터페이스. IActionProvider 확장. 추가 메서드: `getMarkets(chain)`, `getPosition(walletId)`, `getYieldForecast(marketId)`. 표준 액션: buyPT, buyYT, redeemPT, addLiquidity, removeLiquidity |
| YieldPositionTracker | 월렛별 Yield 포지션 추적. m29-02 통합 positions 테이블(category=YIELD) 확장 사용. Yield 전용 데이터(market_id, token_type[PT/YT/LP], entry_price, maturity, apy)는 기존 `metadata` JSON 컬럼에 저장 (Aave/Kamino와 동일 패턴, DDL 변경 없음). PositionTracker(m29-02)와 통합 |
| MaturityMonitor | 만기 접근 알림. 만기 7일 전, 1일 전 알림 발송. 만기 후 미상환 경고 |

### Pendle 구현체

| 컴포넌트 | 내용 |
|----------|------|
| PendleYieldProvider | IYieldProvider 구현체. Pendle REST API v2 호출. 5개 액션: buyPT(고정 수익률 확보), buyYT(변동 수익률 레버리지), redeemPT(만기 상환), addLiquidity(LP 추가), removeLiquidity(LP 제거) |
| PendleApiClient | Pendle REST API v2 래퍼 (https://api-v2.pendle.finance). 조회: `/v1/markets/all`, `/v1/sdk/{chainId}/markets/{market}/swapping-prices`. 트랜잭션: `/v2/sdk/{chainId}/convert` 통합 엔드포인트(buyPT/buyYT/redeem/addLiq/removeLiq 모두 처리). 무료 티어(100 CU/분, 유료 $10/주 가능). 응답 Zod 스키마 검증 |
| MCP 도구 | action_pendle_buy_pt, action_pendle_buy_yt, action_pendle_redeem_pt, action_pendle_add_liquidity, action_pendle_remove_liquidity (ActionProvider `mcpExpose=true` 동적 등록) |
| SDK 지원 | TS/Python SDK: executeAction('pendle_buy_pt', params) 등 |

### 입력 스키마

Convert API 기반. 모든 액션이 동일한 `/v2/sdk/{chainId}/convert` 엔드포인트를 사용하며, `tokensIn`/`tokensOut` 조합으로 액션을 구분한다.

```typescript
const PendleBuyPTInputSchema = z.object({
  market: z.string(),           // Pendle market 주소 (마켓 조회용, PT 토큰 주소 resolve에 사용)
  tokenIn: z.string(),          // 입력 토큰 주소 (예: stETH)
  amountIn: z.string(),         // 입력 수량 (wei)
  slippage: z.number().default(0.01), // 슬리피지 (1%)
});
// Provider가 내부적으로 market → PT 토큰 주소를 resolve하여
// Convert API의 tokensIn/tokensOut/amountsIn/receiver 파라미터로 변환
```

### Admin Settings (Actions 페이지)

빌트인 프로바이더는 기본 활성화 상태. Admin UI > Actions 페이지에서 런타임 설정 변경 가능 (#158).

| 설정 키 | 기본값 | 설명 |
|---------|--------|------|
| `actions.pendle_enabled` | `true` | 프로바이더 활성화 |
| `actions.pendle_api_base_url` | `"https://api-v2.pendle.finance"` | API base URL |
| `actions.pendle_default_slippage_pct` | `0.01` | 기본 슬리피지 (1%) |
| `actions.pendle_maturity_warning_days` | `7` | 만기 경고 (7일 전) |
| `actions.pendle_api_key` | `""` | API 키 (유료 플랜 사용 시, 빈 값이면 무료 티어) |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | Pendle 통합 방식 | REST API v2 Convert 엔드포인트 (`/v2/sdk/{chainId}/convert`) | 무료 티어(100 CU/분), 문서화 우수, calldata 직접 반환. 개별 swap/addLiq/removeLiq 대신 통합 Convert API 사용. SDK 의존성 불필요. Jupiter/0x와 동일한 REST → calldata 패턴 |
| 2 | Yield 프레임워크 분리 | IYieldProvider (ILendingProvider와 별도) | Yield는 만기(maturity) 개념이 있어 Lending과 근본적으로 다름. PT/YT 토큰화도 Lending에 없는 개념. 별도 인터페이스가 명확 |
| 3 | 만기 모니터링 | 폴링 기반 (1일 1회) | 만기는 초 단위 추적이 불필요. 일 1회 체크로 7일/1일 전 경고 충분 |
| 4 | 지원 체인 | Ethereum, Arbitrum, Base 우선 | Pendle의 주요 유동성이 집중된 3개 체인. 나머지 7개 체인(Optimism, BNB, Mantle, Sonic, Berachain 등)은 config로 활성화 가능 |
| 5 | API Rate Limit 대응 | 무료 티어 사용, RpcPool 패턴 적용 | 무료 100 CU/분으로 일반 사용 충분. 대량 호출 시 유료 플랜($10/주, 500 CU/분) 전환 가능. API base URL을 Admin Settings로 관리 |
| 6 | Yield 포지션 데이터 저장 | `metadata` JSON 컬럼 활용 (DDL 변경 없음) | 기존 Aave/Kamino Lending이 `metadata` JSON에 provider별 데이터를 저장하는 패턴과 동일. market_id, token_type, maturity 등을 JSON에 저장하여 스키마 유연성 확보 |
| 7 | `MATURED` 포지션 상태 추가 | `PositionStatusEnum`에 `'MATURED'` 추가 | m29-00 설계(YieldPositionSummary)에서 `MATURED` 상태 명시. 현재 enum은 `ACTIVE/CLOSED/LIQUIDATED`만 존재하여 갭 발생. DB CHECK 제약 조건 + enum 동시 업데이트 필요 |

---

## E2E 검증 시나리오

**자동화 비율: 95%+ -- `[HUMAN]` 1건**

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | buyPT resolve -> ContractCallRequest 반환 | mock Pendle Convert API 응답 -> PendleYieldProvider.resolve('buyPT') -> ContractCallRequest assert | [L0] |
| 2 | buyPT 실행 -> PT 포지션 생성 | mock 실행 -> defi_positions 테이블(category=YIELD)에 PT 포지션(만기 포함) 기록 assert | [L0] |
| 3 | buyYT resolve -> ContractCallRequest 반환 | resolve('buyYT') -> YT 구매 calldata assert | [L0] |
| 4 | redeemPT -> 만기 도래 PT 상환 | 만기 지난 PT -> redeem -> 원금 토큰 수령 assert | [L0] |
| 5 | 만기 미도래 PT redeem -> 시장 매도 경로 | 만기 전 redeem 시도 -> Convert API로 PT→원금토큰 시장 매도 경로 assert (DEC-YIELD-03 auto-detection) | [L0] |
| 6 | 만기 7일 전 경고 알림 | mock 만기 6일 후 PT -> MaturityMonitor -> MATURITY_WARNING 알림 assert | [L0] |
| 7 | GET /v1/wallets/:id/positions -> Yield 포지션 포함 | Aave SUPPLY + Pendle PT -> 통합 포지션 목록에 모두 포함 assert | [L0] |
| 8 | 시장 목록 조회 | getMarkets('ethereum') -> Pendle 마켓 목록(APY, 만기 포함) 반환 assert | [L0] |
| 9 | Pendle API 실 호출 | Ethereum에서 /v1/markets/all 실 호출 -> 마켓 목록 성공 확인 | [HUMAN] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m29-00 (고급 DeFi 프로토콜 설계) | IYieldProvider 인터페이스, MaturityMonitor 설계 (DEFI-11, DEFI-14) |
| m29-02 (Lending 프레임워크) | PositionTracker 통합, Admin 포트폴리오 뷰 확장, 정책 평가 인프라 |
| v1.5 (가격 오라클) | PT/YT 토큰 USD 환산 |
| v1.4 (EVM 인프라) | EvmAdapter, ContractCallRequest |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | PT/YT 개념 복잡도 | AI 에이전트/Owner가 PT/YT 개념을 이해하기 어려움 | MCP 도구 설명에 "고정 수익률(buyPT)" vs "변동 수익률 레버리지(buyYT)" 명시. 스킬 파일에 예시 시나리오 추가 |
| 2 | 만기 관리 부재 시 손실 | 만기 후 미상환 PT는 수익률을 놓칠 수 있음 | MaturityMonitor로 경고. 만기 도래 시 자동 상환 옵션(Admin Settings auto_redeem=true) |
| 3 | Pendle 유동성 변동 | 만기 접근 시 유동성 감소로 슬리피지 증가 | 만기 14일 전부터 슬리피지 경고. 유동성 부족 시 거래 거부 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2-3개 (Yield 프레임워크 + DB 1 / Pendle Provider + API Client 1 / MCP+만기 모니터링+Admin 1) |
| 신규/수정 파일 | 15-20개 |
| 테스트 | 40-60개 (PendleApiClient, PendleYieldProvider, MaturityMonitor 단위 테스트 + E2E 9건. Aave 109 commits/Kamino 83 tests 규모 참고) |
| DB 마이그레이션 | `PositionStatusEnum`에 `'MATURED'` 추가 (ALTER TABLE 또는 enum 확장). `category=YIELD`는 이미 존재. `metadata` JSON 활용으로 DDL 변경 최소화 |

---

*생성일: 2026-02-15*
*수정일: 2026-03-01 — Pendle Convert API 반영, rate limit 명시, E2E #5 만기 전 매도 경로로 수정, MATURED 상태 갭 명시, metadata JSON 저장 방식 확정, 테스트 규모 현실화*
*선행: m29-02 (Lending 프레임워크)*
*관련: Pendle API (https://api-v2.pendle.finance/core/docs), 개발 문서 (https://docs.pendle.finance/pendle-v2/Developers/Backend/HostedSdk)*
