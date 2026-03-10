# Feature Landscape: Polymarket Prediction Market Integration

**Domain:** Prediction Market Trading (Polymarket CLOB + CTF on Polygon)
**Researched:** 2026-03-10
**Confidence:** HIGH (official Polymarket docs verified)

## Table Stakes

Features users expect. Missing = integration feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Market Discovery/Search | AI 에이전트가 거래할 마켓을 찾아야 함 | Low | Gamma API public, 인증 불필요 |
| Market Detail View | 가격/거래량/결과/만기일 필요 | Low | Gamma API events + markets 엔드포인트 |
| Limit Order (GTC) | CLOB의 기본 주문 타입 | Med | EIP-712 서명 + L2 HMAC 인증 |
| Market Order (FOK) | 즉시 체결 필요 시 | Med | FOK: 전량 체결 또는 전량 취소 |
| Order Cancellation | 미체결 주문 취소 필수 | Low | cancelOrder/cancelOrders/cancelAll |
| Position Query | 현재 보유 포지션 확인 필수 | Low | Data API GET /positions |
| Portfolio Value | 전체 포지션 가치 합산 | Low | Data API GET /value |
| CTF Redemption | 결과 확정 후 수익금 회수 | Med | 온체인 redeemPositions() 호출 (Polygon CTF 컨트랙트) |
| USDC.e Allowance Setup | 거래 전 승인 필수 사전 조건 | Low | Exchange + CTF 컨트랙트에 USDC.e approve |
| API Key Management | L1 서명으로 API 키 파생 필수 | Med | EIP-712 L1 인증 → API Key + Secret + Passphrase 파생 |
| Neg Risk Flag 지원 | 다중 결과 마켓이 전체 마켓의 대부분 | Low | negRisk: true 플래그 전달 |
| Open Orders Query | 미체결 주문 현황 확인 필수 | Low | getOpenOrders (market/asset_id 필터) |
| Trade History | 체결 이력 조회 기본 기능 | Low | getTrades/getTradesPaginated |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Market Order (FAK) | 부분 체결 허용, 유동성 부족 시 유용 | Low | FOK과 동일 인프라, orderType 차이뿐 |
| GTD (Good-Til-Date) | 만기 자동 취소, 이벤트 기반 전략 | Low | GTC와 동일 인프라, expiration 파라미터 추가 |
| Post-Only Order | 메이커 리베이트 확보, 수수료 최적화 | Low | postOnly: true 플래그 |
| Batch Orders | 다중 마켓 동시 주문 (최대 15개) | Med | postOrders() 배치 API |
| PnL Tracking | 실현/미실현 손익 계산 | Med | Data API positions avgPrice+curPrice로 계산 |
| Market Category Browse | 태그/스포츠/시리즈별 마켓 탐색 | Low | Gamma API tags/sports/series 엔드포인트 |
| Order Book Depth View | 호가창 깊이 분석으로 유동성 판단 | Low | getOrderBook 엔드포인트 |
| Mid/Spread/Last Price | 시장 상태 빠른 파악 | Low | getMidpoint/getSpread/getLastTradePrice |
| Resolution Monitoring | 마켓 결과 확정 감시 + 자동 리딤 | High | WebSocket market_resolved 이벤트 또는 폴링 |
| Maker Rewards Check | 주문이 리워드 적격인지 확인 | Low | getOrderScoringStatus |
| Closed Positions History | 과거 청산 포지션 이력 | Low | Data API closed positions 엔드포인트 |
| WebSocket Price Stream | 실시간 가격/호가 변동 수신 | High | wss://ws-subscriptions-clob.polymarket.com |
| Multi-Outcome Convert | Neg Risk No 토큰 → 타 결과 Yes 변환 | High | NegRiskAdapter 온체인 컨트랙트 호출 |
| Merge/Split Positions | Yes+No 토큰 합병/분할 | Med | CTF 컨트랙트 mergePositions/splitPositions |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Market Making Bot | WAIaaS는 거래 인프라이지 자동화 전략이 아님, heartbeat 10초 제한 | 주문 API만 제공, 전략은 에이전트가 결정 |
| Proxy Wallet 생성 | Polymarket Magic Link 전용, WAIaaS 월렛은 EOA 타입 사용 | signatureType=0 (EOA) 직접 서명 |
| USDC.e 브릿징 | Ethereum→Polygon 브릿지는 별도 도메인 | LI.FI/Across 기존 브릿지 Action Provider 활용 안내 |
| 오라클 분쟁 (UMA Dispute) | 거래 범위를 벗어난 거버넌스 행위 | resolution 상태 조회만 제공 |
| 15분 크립토 마켓 전용 수수료 최적화 | 특수 마켓 전용 fee curve는 복잡도 대비 가치 낮음 | fee_rate_bps를 주문 시 전달만 |
| Gnosis Safe 서명 타입 | WAIaaS 월렛은 EOA, Safe 연동 불필요 | signatureType=0 고정 |
| Gasless Relaying | Polymarket 자체 가스 릴레이는 Proxy Wallet 전용 | WAIaaS 월렛이 직접 Polygon 가스비 지불 (리딤 시에만) |

## Feature Dependencies

```
API Key Derivation (L1 EIP-712) → 모든 거래 기능의 전제 조건
USDC.e Allowance Setup → Limit/Market Order, CTF Redemption
                       ↓
Market Discovery (Gamma API, 인증 불필요)
                       ↓
Order Placement (GTC/GTD/FOK/FAK) → Open Orders Query
                                  → Trade History
                                  → Position Query → PnL Tracking
                                  → Portfolio Value
                       ↓
Market Resolution Monitoring → CTF Redemption (온체인)
```

### 핵심 의존성 상세

1. **API Key Derivation** → 모든 CLOB 거래 작업
   - L1: EIP-712 서명으로 API Key/Secret/Passphrase 파생
   - L2: HMAC-SHA256으로 이후 모든 요청 서명
   - WAIaaS 기존 EIP-712 인프라 재활용 가능 (Hyperliquid 패턴)

2. **USDC.e Approval** → 주문 실행
   - Exchange 컨트랙트 + CTF 컨트랙트에 각각 approve
   - 기존 APPROVE 트랜잭션 타입으로 처리 가능

3. **Gamma API** → CLOB 거래
   - condition_id, token_id 조회에 Gamma 필수
   - CLOB은 token_id로만 거래 (market slug 아님)

4. **Position Tracking** → PnL 계산
   - Data API positions의 avgPrice, curPrice 기반
   - 실현 PnL = (exitPrice - avgPrice) * size
   - 미실현 PnL = (curPrice - avgPrice) * currentSize

5. **Market Resolution** → CTF Redemption
   - UMA Oracle reportPayouts() 완료 후
   - redeemPositions(conditionId, indexSets=[1,2]) 온체인 호출
   - USDC.e 1:1 환수 (승리 토큰만)

## User Workflows

### Workflow 1: Buy Position (마켓 진입)

```
1. [Gamma API] 마켓 검색/조회 → condition_id, token_id 확보
2. [CLOB] USDC.e allowance 확인 (getBalanceAllowance)
   2a. 미승인 시 → Exchange + CTF approve 트랜잭션 (APPROVE 타입)
3. [CLOB] 주문 생성 (createAndPostOrder)
   - tokenID: Yes 또는 No 토큰 ID
   - price: 0.01~0.99 (확률 = 가격)
   - size: 구매 수량 (conditional 토큰 단위)
   - side: BUY
   - negRisk: true/false (마켓 타입에 따라)
4. [CLOB] 주문 상태 확인
   - matched → 즉시 체결
   - live → 오더북에 대기
5. [Data API] 포지션 확인 (/positions)
```

### Workflow 2: Sell Position (포지션 청산)

```
1. [Data API] 현재 포지션 조회 → 보유 토큰 확인
2. [CLOB] 매도 주문 (createAndPostOrder)
   - tokenID: 보유 토큰 ID
   - side: SELL
   - size: 매도 수량
   - price: 매도 희망 가격 (limit) 또는 FOK/FAK (market)
3. [CLOB] 체결 확인 (getTrades)
4. [Data API] 포지션 변동 확인
```

### Workflow 3: Redeem Winnings (결과 확정 후 수익 회수)

```
1. [Gamma API 또는 WebSocket] 마켓 resolution 상태 확인
   - resolved: true 여부
2. [온체인] CTF redeemPositions() 호출
   - conditionId: 마켓의 condition ID
   - indexSets: [1, 2] (양쪽 결과 모두 제출, 승리분만 지급)
   - parentCollectionId: 0x000...000
   - collateralToken: USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)
3. [결과] 승리 토큰 → USDC.e 1:1 환수, 패배 토큰 → 소각
```

### Workflow 4: Cancel Orders (주문 취소)

```
1. [CLOB] getOpenOrders() → 미체결 주문 목록
2. [CLOB] cancelOrder(orderID) 또는 cancelOrders([ids]) 또는 cancelAll()
3. [CLOB] 취소 확인 (canceled[] 응답)
```

## Order Type Matrix

| Order Type | Time-in-Force | Quantity 해석 | Use Case |
|-----------|--------------|--------------|----------|
| GTC | 취소 시까지 유지 | Conditional 토큰 수량 | 기본 지정가 주문 |
| GTD | 지정 시각까지 유지 | Conditional 토큰 수량 | 이벤트 전 자동 취소 |
| FOK | 즉시 전량 또는 취소 | BUY=USDC 금액, SELL=토큰 수량 | 시장가 매수 |
| FAK | 즉시 가능분만 체결 | BUY=USDC 금액, SELL=토큰 수량 | 부분 체결 허용 시장가 |

## Market Type Matrix

| Market Type | negRisk | 결과 수 | 특징 | Redemption |
|------------|---------|--------|------|-----------|
| Binary | false | 2 (Yes/No) | 독립 마켓, 단순 구조 | CTF redeemPositions |
| Multi-Outcome (Neg Risk) | true | 3+ | 상호 배타적, 최대 1개 Yes | NegRiskAdapter 경유 CTF |
| Augmented Neg Risk | true | 동적 | 결과 추가 가능, Placeholder 존재 | NegRiskAdapter 경유 CTF |

## CLOB API Endpoint Summary

### Trading (인증 필요: L2 HMAC)
| Method | Endpoint/Function | Purpose |
|--------|------------------|---------|
| POST | createAndPostOrder | 지정가 주문 생성+서명+제출 |
| POST | createAndPostMarketOrder | 시장가 주문 생성+서명+제출 |
| POST | postOrder | 사전 서명된 주문 제출 |
| POST | postOrders | 배치 주문 제출 (최대 15) |
| DELETE | cancelOrder | 단건 취소 |
| DELETE | cancelOrders | 다건 취소 |
| DELETE | cancelAll | 전체 취소 |
| DELETE | cancelMarketOrders | 마켓별 취소 |

### Query (인증 필요: L2 HMAC)
| Method | Endpoint/Function | Purpose |
|--------|------------------|---------|
| GET | getOrder | 주문 상세 조회 |
| GET | getOpenOrders | 미체결 주문 목록 |
| GET | getTrades | 체결 이력 |
| GET | getTradesPaginated | 페이지네이션 체결 이력 |
| GET | getBalanceAllowance | 잔액/승인 상태 |
| GET | getApiKeys | API 키 목록 |
| GET | getNotifications | 알림 |

### Market Data (인증 불필요)
| Method | Endpoint | Purpose |
|--------|---------|---------|
| GET | Gamma /events | 이벤트(마켓 그룹) 조회 |
| GET | Gamma /markets | 마켓 조회 |
| GET | Gamma /public-search | 마켓/이벤트 검색 |
| GET | Gamma /tags | 카테고리 태그 |
| GET | CLOB getOrderBook | 호가창 |
| GET | CLOB getMidpoint | 중간가 |
| GET | CLOB getSpread | 스프레드 |

### Data API (인증 불필요, 주소 기반)
| Method | Endpoint | Purpose |
|--------|---------|---------|
| GET | /positions?user={addr} | 현재 포지션 |
| GET | /value?user={addr} | 포트폴리오 가치 |
| GET | /activity?user={addr} | 온체인 활동 이력 |

## MVP Recommendation

### Phase 1 (Core): 최소 거래 가능 상태

필수 구현 (Table Stakes 중 핵심):
1. **API Key Management** - L1 EIP-712 파생 + L2 HMAC 서명 + DB 저장
2. **USDC.e Allowance Setup** - Exchange/CTF 컨트랙트 approve
3. **Market Discovery** - Gamma API 마켓/이벤트 조회 + 검색
4. **Limit Order (GTC)** - 기본 지정가 매수/매도
5. **Market Order (FOK)** - 즉시 체결 시장가
6. **Order Cancellation** - 단건/일괄/전체 취소
7. **Position Query** - Data API 포지션 조회
8. **Open Orders Query** - 미체결 주문 목록

### Phase 2 (Settlement): 포지션 라이프사이클 완성

9. **CTF Redemption** - 온체인 redeemPositions() (Binary + Neg Risk)
10. **Trade History** - 체결 이력 조회
11. **Portfolio Value** - 전체 포지션 가치 조회
12. **PnL Tracking** - 실현/미실현 손익 계산

### Phase 3 (Advanced): DX + 고급 주문

13. **GTD Orders** - 시간 제한 주문
14. **FAK Orders** - 부분 체결 시장가
15. **Batch Orders** - 다중 주문 일괄 제출 (최대 15)
16. **Post-Only Orders** - 메이커 수수료 최적화
17. **Order Book Depth** - 호가창 조회
18. **Category/Tag Browse** - 태그별 마켓 탐색

Defer:
- **WebSocket Price Stream**: 실시간 스트림은 에이전트 사용 시나리오에서 우선순위 낮음, REST 폴링으로 충분
- **Multi-Outcome Convert**: NegRiskAdapter 온체인 호출은 복잡도 높고 사용 빈도 낮음
- **Merge/Split Positions**: CTF 고급 기능, MVP에 불필요

## WAIaaS 기존 인프라 재활용 매핑

| Polymarket 요구사항 | 기존 WAIaaS 인프라 | 재활용 방식 |
|-------------------|-------------------|-----------|
| EIP-712 L1 서명 | HyperliquidSigner (v31.4) | 동일 패턴, Polymarket 도메인/타입 변경 |
| HMAC-SHA256 L2 서명 | 신규 구현 필요 | PolymarketApiClient에 L2 서명 내장 |
| Off-chain 주문 → CONFIRMED | ApiDirectResult 패턴 (v31.4) | Stage 5 분기 그대로 활용 |
| USDC.e Approve | APPROVE 트랜잭션 타입 (기존) | 기존 파이프라인으로 처리 |
| 온체인 Redemption | CONTRACT_CALL 타입 (기존) | CTF redeemPositions() calldata 구성 |
| 정책 평가 (BUY 금액) | 기존 정책 엔진 (spending limits) | price * size → USD 환산 정책 평가 |
| API Key DB 저장 | hyperliquid_orders 패턴 (v31.4) | polymarket_api_keys 테이블 신규 |
| Admin UI DeFi 탭 | Hyperliquid 5-tab 패턴 (v31.4) | Polymarket 전용 탭 추가 |
| MCP 도구 | 기존 Action Provider 동적 도구 | PolymarketActionProvider 등록 |

## Confidence Assessment

| Feature Area | Confidence | Basis |
|-------------|-----------|-------|
| CLOB Order Types (GTC/GTD/FOK/FAK) | HIGH | Polymarket 공식 문서 직접 확인 |
| API Key L1/L2 인증 | HIGH | 공식 문서 + py-clob-client 소스 |
| CTF Redemption | HIGH | 공식 문서 redeemPositions() 파라미터 확인 |
| Neg Risk 마켓 처리 | HIGH | 공식 advanced/neg-risk 문서 확인 |
| Data API (positions/value/activity) | MEDIUM | 엔드포인트 존재 확인, 응답 스키마 상세 미확인 |
| 수수료 구조 | MEDIUM | 대부분 무료, 15분 크립토 마켓만 동적 수수료 |
| WebSocket 스트림 | MEDIUM | 엔드포인트 확인, 구현 세부 사항 미검증 |

## Sources

- [Polymarket CLOB Introduction](https://docs.polymarket.com/developers/CLOB/introduction) - CLOB 아키텍처, 인증 체계
- [Polymarket Orders Overview](https://docs.polymarket.com/developers/CLOB/orders/orders) - 주문 타입, 주문 생명주기
- [Polymarket L2 Methods](https://docs.polymarket.com/developers/CLOB/clients/methods-l2) - 전체 클라이언트 메서드 목록
- [Polymarket CTF Redemption](https://docs.polymarket.com/developers/CTF/redeem) - 토큰 리딤 파라미터 및 절차
- [Polymarket Neg Risk Markets](https://docs.polymarket.com/advanced/neg-risk) - 다중 결과 마켓, NegRiskAdapter
- [Polymarket Gamma API Overview](https://docs.polymarket.com/developers/gamma-markets-api/overview) - 마켓 데이터 구조
- [Polymarket Fees](https://docs.polymarket.com/trading/fees) - 수수료 구조
- [Polymarket WebSocket Overview](https://docs.polymarket.com/market-data/websocket/overview) - 실시간 데이터 스트림
- [Polymarket Data API Positions](https://docs.polymarket.com/developers/misc-endpoints/data-api-get-positions) - 포지션 조회
- [Polymarket Data API Value](https://docs.polymarket.com/developers/misc-endpoints/data-api-value) - 포트폴리오 가치
- [Polymarket py-clob-client](https://github.com/Polymarket/py-clob-client) - Python 클라이언트 레퍼런스
- [Polymarket CTF Exchange](https://github.com/Polymarket/ctf-exchange) - Exchange 컨트랙트 소스
- [Polymarket Neg Risk Adapter](https://github.com/Polymarket/neg-risk-ctf-adapter) - NegRiskAdapter 소스
- [Polymarket Documentation Index](https://docs.polymarket.com/llms.txt) - 전체 문서 인덱스
