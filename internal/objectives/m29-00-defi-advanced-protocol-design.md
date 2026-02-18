# 마일스톤 m29: 고급 DeFi 프로토콜 설계 (Lending/Yield/Perp 프레임워크)

## 목표

상태를 가진 DeFi 포지션(담보/차입, 수익률 거래, 레버리지 트레이딩)을 관리하기 위한 3개 프레임워크(ILendingProvider, IYieldProvider, IPerpProvider)와 공통 인프라(PositionTracker, HealthFactorMonitor, MarginMonitor)를 설계 수준에서 정의한다. 7개 프로토콜(Aave, Kamino, Pendle, Drift, Morpho, Marinade, CoW)의 공통 설계를 확정하여 m29-01~m29-07 구현 마일스톤의 입력을 생산한다.

---

## 배경

m28-xx에서 구현되는 Action Provider(Swap/Bridge/Staking)는 모두 **단발성 트랜잭션**(요청 → 실행 → 완료)이다. m29-xx의 프로토콜은 **상태를 가진 포지션**(예치 → 이자 누적 → 상환/청산)으로, 지속적인 모니터링과 리스크 관리가 필요하다.

### m28-xx vs m29-xx 패턴 비교

```
m28-xx (단발성):  resolve() → ContractCallRequest → 실행 → 완료
m29-xx (포지션):  resolve() → ContractCallRequest → 실행 → 포지션 생성 → 모니터링 → 상환/청산
```

### 3개 프레임워크 개요

| 프레임워크 | 대상 프로토콜 | 핵심 개념 |
|-----------|-------------|----------|
| ILendingProvider | Aave V3, Kamino, Morpho | 담보/차입, 헬스 팩터, LTV |
| IYieldProvider | Pendle | PT/YT 토큰화, 만기, 고정 수익률 |
| IPerpProvider | Drift | 레버리지, 마진, PnL, 청산 가격 |

### 추가 프로바이더 (프레임워크 불필요)

| 마일스톤 | 프로토콜 | 패턴 |
|---------|----------|------|
| m29-06 | Marinade | m28-04 Staking 패턴 재사용 |
| m29-07 | CoW Protocol | Intent/EIP-712 서명 신규 패턴 |

---

## 설계 대상

### 1. ILendingProvider 프레임워크

#### 1.1 인터페이스 설계

```
ILendingProvider extends IActionProvider
  표준 액션: supply, borrow, repay, withdraw
  추가 메서드: getPosition(walletId), getHealthFactor(walletId), getMarkets()
```

#### 1.2 설계 범위

| 항목 | 내용 |
|------|------|
| 인터페이스 | ILendingProvider — IActionProvider 확장, 4개 표준 액션 + 3개 조회 메서드 |
| 포지션 모델 | type: SUPPLY / BORROW, provider, asset, amount, apy, updated_at |
| 헬스 팩터 | 담보 가치 / 차입 가치 비율. 1.0 미만 시 청산. 기본 경고 임계값 1.2 |
| 정책 확장 | LendingPolicyEvaluator — 최대 LTV 제한, 허용 담보/차입 자산 화이트리스트 |
| 대상 구현체 | Aave V3 (m29-01), Kamino (m29-02), Morpho (m29-05) |

#### 1.3 설계 산출물

- ILendingProvider 인터페이스 정의 (TypeScript)
- LendingPosition, HealthFactor 타입 정의 (Zod)
- LendingPolicyEvaluator 정책 평가 규칙
- REST API 추가: GET /v1/wallets/:id/positions, GET /v1/wallets/:id/health-factor

---

### 2. IYieldProvider 프레임워크

#### 2.1 인터페이스 설계

```
IYieldProvider extends IActionProvider
  표준 액션: buyPT, buyYT, redeemPT, addLiquidity, removeLiquidity
  추가 메서드: getMarkets(chain), getPosition(walletId), getYieldForecast(marketId)
```

#### 2.2 설계 범위

| 항목 | 내용 |
|------|------|
| 인터페이스 | IYieldProvider — IActionProvider 확장, 5개 표준 액션 + 3개 조회 메서드 |
| 포지션 모델 | token_type: PT / YT / LP, market_id, amount, entry_price, maturity, apy |
| 만기 관리 | MaturityMonitor — 만기 7일 전/1일 전 알림, 만기 후 미상환 경고 |
| 대상 구현체 | Pendle (m29-03) |

#### 2.3 설계 산출물

- IYieldProvider 인터페이스 정의
- YieldPosition, MaturityInfo 타입 정의 (Zod)
- MaturityMonitor 폴링 설계 (1일 1회)
- yield_positions 테이블 스키마 (또는 positions 확장)

---

### 3. IPerpProvider 프레임워크

#### 3.1 인터페이스 설계

```
IPerpProvider extends IActionProvider
  표준 액션: openPosition, closePosition, modifyPosition, addMargin, withdrawMargin
  추가 메서드: getPosition(walletId, market), getMarginInfo(walletId), getMarkets()
```

#### 3.2 설계 범위

| 항목 | 내용 |
|------|------|
| 인터페이스 | IPerpProvider — IActionProvider 확장, 5개 표준 액션 + 3개 조회 메서드 |
| 포지션 모델 | direction: LONG / SHORT, market, size, entry_price, leverage, unrealized_pnl, margin, liquidation_price |
| 마진 모니터링 | MarginMonitor — 유지 마진 임계값 접근 시 MARGIN_WARNING, 청산 가격 접근 시 LIQUIDATION_IMMINENT |
| 정책 확장 | PerpPolicyEvaluator — 최대 레버리지 제한, 최대 포지션 크기(USD), 허용 시장 화이트리스트 |
| 대상 구현체 | Drift (m29-04) |

#### 3.3 설계 산출물

- IPerpProvider 인터페이스 정의
- PerpPosition, MarginInfo 타입 정의 (Zod)
- MarginMonitor 폴링 설계 (1분 간격)
- PerpPolicyEvaluator 정책 평가 규칙
- perp_positions 테이블 스키마 (또는 positions 확장)

---

### 4. 공통 인프라: PositionTracker

3개 프레임워크의 포지션을 통합 관리하는 서비스를 설계한다.

#### 4.1 설계 범위

| 항목 | 내용 |
|------|------|
| 역할 | 월렛별 DeFi 포지션 통합 조회 + DB 캐시 + 주기적 동기화 |
| 저장소 | positions 테이블 (wallet_id, provider, category[LENDING/YIELD/PERP/STAKING], ...) |
| 동기화 주기 | Lending 5분, Perp 1분, Yield 1시간 (config.toml 오버라이드) |
| 조회 방식 | 정책 평가 = 온체인 실시간, Admin UI = DB 캐시 |
| REST API | GET /v1/wallets/:id/positions — Lending + Yield + Perp + Staking 통합 반환 |
| Admin UI | 포트폴리오 섹션 — 프로토콜별 포지션, USD 환산, APY, 헬스 팩터 표시 |

#### 4.2 설계 산출물

- positions 테이블 통합 스키마 (카테고리별 discriminatedUnion)
- PositionTracker 동기화 스케줄러 설계
- GET /v1/wallets/:id/positions 응답 스키마 (Zod)
- Admin 포트폴리오 뷰 와이어프레임

---

### 5. 모니터링 통합: HealthFactor + Maturity + Margin

3개 모니터의 공통 패턴과 알림 연동을 설계한다.

#### 5.1 설계 범위

| 모니터 | 대상 | 폴링 주기 | 알림 이벤트 |
|--------|------|----------|-----------|
| HealthFactorMonitor | Lending (Aave/Kamino/Morpho) | 5분 | LIQUIDATION_WARNING |
| MaturityMonitor | Yield (Pendle) | 1일 | MATURITY_WARNING |
| MarginMonitor | Perp (Drift) | 1분 | MARGIN_WARNING, LIQUIDATION_IMMINENT |

#### 5.2 설계 산출물

- IDeFiMonitor 공통 인터페이스
- 알림 이벤트 추가: LIQUIDATION_WARNING, MATURITY_WARNING, MARGIN_WARNING, LIQUIDATION_IMMINENT
- 모니터 라이프사이클 (데몬 시작/정지 시 등록/해제)
- config.toml [monitoring] 섹션 (임계값, 폴링 주기)

---

### 6. Intent/서명 패턴 설계 (CoW Protocol)

기존 ContractCallRequest 패턴과 다른 Intent/EIP-712 서명 패턴을 설계한다.

#### 6.1 설계 범위

| 항목 | 내용 |
|------|------|
| 패턴 | resolve() → SignableOrder → EIP-712 서명 → 릴레이어 제출 → 솔버 실행 |
| ActionProviderRegistry 확장 | 'intent' 타입 지원 추가 |
| 서명 | viem signTypedData() — 트랜잭션이 아닌 메시지 서명 |
| 상태 추적 | 주문 OPEN → FULFILLED / EXPIRED 폴링 |
| Gasless | 솔버가 가스비 부담 — ETH 잔고 없는 월렛에서도 ERC-20 스왑 가능 |

#### 6.2 설계 산출물

- SignableOrder 타입 정의 (Zod)
- ActionProviderRegistry intent 타입 확장 설계
- 서명 → API 제출 → 상태 추적 파이프라인
- 기존 ContractCallRequest 파이프라인과의 분기점

---

## 신규 산출물

| ID | 산출물 | 설명 |
|----|--------|------|
| DEFI-10 | ILendingProvider 프레임워크 설계 | 인터페이스, 포지션 모델, 헬스 팩터, 정책 |
| DEFI-11 | IYieldProvider 프레임워크 설계 | 인터페이스, PT/YT 모델, 만기 관리 |
| DEFI-12 | IPerpProvider 프레임워크 설계 | 인터페이스, 레버리지 모델, 마진 관리, 정책 |
| DEFI-13 | PositionTracker 공통 인프라 설계 | 통합 포지션 테이블, 동기화, API, Admin UI |
| DEFI-14 | 모니터링 통합 설계 | IDeFiMonitor, 3개 모니터, 알림 이벤트 |
| DEFI-15 | Intent/서명 패턴 설계 | SignableOrder, Registry 확장, CoW 패턴 |

---

## 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 62 (action-provider-architecture) | ILendingProvider/IYieldProvider/IPerpProvider 인터페이스, intent 타입 |
| 25 (sqlite) | positions 테이블 추가 |
| 33 (policy) | LendingPolicyEvaluator, PerpPolicyEvaluator |
| 35 (notification) | LIQUIDATION_WARNING, MATURITY_WARNING, MARGIN_WARNING 이벤트 |
| 37 (rest-api) | /positions, /health-factor 엔드포인트 추가 |
| 67 (admin-ui) | 포트폴리오 섹션 와이어프레임 |

---

## 성공 기준

1. 3개 프레임워크의 인터페이스가 확정되어 m29-01에서 바로 구현 가능
2. positions 테이블 스키마가 Lending/Yield/Perp/Staking을 통합 수용
3. 모니터링 패턴이 3개 모니터에 일관되게 적용 가능
4. Intent 패턴이 기존 ContractCallRequest 패턴과 공존하는 구조 확정
5. 7개 프로토콜 구현 시 프레임워크 수정 없이 Provider만 추가하면 되는 설계

---

*생성일: 2026-02-15*
*범위: 설계 마일스톤 — 코드 구현은 m29-01~m29-07에서 수행*
*선행: m28 (기본 DeFi 프로토콜 설계), v1.5 (Action Provider 프레임워크)*
*관련: 설계 문서 62 (action-provider-architecture)*
