# Feature Landscape: Hyperliquid Ecosystem Integration

**Domain:** Hyperliquid DEX (Perp + Spot + Sub-accounts) on HyperEVM
**Researched:** 2026-03-08
**Overall confidence:** HIGH (official docs verified)

---

## Table Stakes

Features users expect from a Hyperliquid integration. Missing = integration feels incomplete.

### Perp Trading

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Market Order (Open/Close) | 가장 기본적인 주문 타입. 모든 Perp DEX에서 필수 | Low | HyperliquidExchangeClient, EIP-712 서명 | `action: "order"`, orderType: `{limit: {tif: "Ioc"}}` 으로 구현 (Hyperliquid는 market order를 IoC limit으로 처리) |
| Limit Order (GTC/IoC/Post-Only) | 가격 지정 주문. Perp 트레이더의 핵심 도구 | Low | HyperliquidExchangeClient | `orderType: {limit: {tif: "Gtc" | "Ioc" | "Alo"}}` |
| Stop-Loss (Stop Market) | 리스크 관리 필수 기능. 자동화 에이전트에게 특히 중요 | Med | Perp 주문 기반 | `orderType: {trigger: {triggerPx, isMarket: true, tpsl: "sl"}}` |
| Take-Profit (Take Market) | 이익 실현 자동화. Stop-Loss와 쌍으로 기대됨 | Med | Perp 주문 기반 | `orderType: {trigger: {triggerPx, isMarket: true, tpsl: "tp"}}` |
| 포지션 조회 | 미실현 PnL, 레버리지, 마진, 청산가 확인 | Low | Info API `clearinghouseState` | 기존 `IPerpProvider.getPosition()` 패턴 그대로 매핑 |
| 레버리지 설정 | Cross/Isolated 마진 모드 + 배율 설정 | Low | Exchange API `updateLeverage` | `isCross: boolean`, `leverage: number` |
| 주문 취소 | 단건/다건 취소, cloid 기반 취소 | Low | Exchange API `cancel`/`cancelByCloid` | 배치 취소도 지원 (`action: "cancel"` with array) |
| 주문 상태 조회 | 대기/체결/취소/거부 상태 확인 | Low | Info API `orderStatus` | oid 또는 cloid로 조회 가능 |
| 펀딩 레이트 조회 | Perp 포지션 비용 예측에 필수 | Low | Info API perpetuals endpoint | `IPerpProvider.getMarkets()` 에 fundingRate 포함 |
| 마진 정보 조회 | 여유 마진, 마진 비율, 위험 수준 확인 | Low | Info API `clearinghouseState` | `IPerpProvider.getMarginInfo()` 매핑 |
| 마켓 정보 조회 | 거래 가능 마켓 목록, 최대 레버리지, OI, 오라클 가격 | Low | Info API `meta` + perpetuals | `IPerpProvider.getMarkets()` 매핑 |

### Spot Trading

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Market Order | Spot 거래 기본. 즉시 체결 | Low | HyperliquidExchangeClient (Perp와 공유) | `action: "order"` with spot asset index |
| Limit Order (GTC/IoC/Post-Only) | 가격 지정 Spot 주문 | Low | HyperliquidExchangeClient | Perp와 동일 구조, asset만 spot 인덱스 |
| 잔액 조회 (Spot) | Spot 계정 토큰 보유량 확인 | Low | Info API `spotClearinghouseState` | account abstraction 모드에 따라 조회 방법 다름 |
| 주문 취소/상태 조회 | Perp와 동일한 UX 기대 | Low | Exchange API | Perp 주문 관리와 코드 공유 가능 |
| Spot 마켓 정보 조회 | 거래 가능 Spot 페어, 가격, 거래량 | Low | Info API `spotMeta` + `spotMetaAndAssetCtxs` | 별도 spot 마켓 메타데이터 API |

### Account State

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Perp/Spot 잔액 통합 조회 | 전체 계정 상태 파악 | Low | Info API 두 endpoint 조합 | `clearinghouseState` + `spotClearinghouseState` |
| 오픈 주문 조회 | 대기 중인 모든 주문 확인 | Low | Info API `frontendOpenOrders` | orderType, triggerCondition, reduceOnly 포함 |
| 거래 이력 조회 | 최근 체결 내역 확인 | Low | Info API `userFills` | 최대 2000건, aggregateByTime 옵션 |
| Spot-Perp 잔액 이동 | USDC를 Spot과 Perp 계정 간 이동 | Low | Exchange API `usdClassTransfer` | `toPerp: boolean`, `amount` |

### HyperEVM Chain

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| HyperEVM Mainnet/Testnet 체인 등록 | EVM 지갑으로 HyperEVM 네트워크 사용 | Low | viem chain definitions | Chain ID 999/998, 네이티브 토큰 HYPE |
| 기존 EVM 기능 호환 | ETH 전송, 토큰 전송, 컨트랙트 호출 등 | None | 기존 EvmAdapter | EVM 호환이므로 추가 구현 불필요 |

---

## Differentiators

Features that set the integration apart. Not expected, but valued.

### Advanced Order Types

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| TWAP (Time-Weighted Average Price) | 대량 주문 분할 실행. 슬리피지 최소화. AI 에이전트에게 매우 유용 | Med | Exchange API `twapOrder` | 30초 간격 분할, 최대 3% 슬리피지, randomize 옵션. `twapCancel`로 취소 |
| Stop-Limit / Take-Limit | Market 대비 정밀한 트리거 주문 | Low | Perp 주문 기반 | `isMarket: false` + limit price 지정 |
| Scale Orders | 가격 범위 내 다수 주문 배치 | Med | 다건 limit order 생성 | 클라이언트 측에서 가격 범위를 N개 주문으로 분할하여 batch 주문 |
| 주문 수정 (Modify) | 취소/재주문 없이 가격/수량 변경 | Low | Exchange API `modify`/`batchModify` | 원자적 수정, 기존 주문 우선순위 유지 |
| Reduce-Only 플래그 | 포지션 축소만 허용. 리스크 관리 | Low | 주문 파라미터 | `reduceOnly: true` |

### Sub-account Management

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Sub-account 생성 | 전략/용도별 자금 분리. AI 에이전트 격리에 유용 | Med | Exchange API `createSubAccount` | 최대 10개/마스터, $100K 거래량 요건 (testnet 제한 확인 필요) |
| Master-Sub 자금 이동 | 계정 간 USDC/토큰 이동 | Med | Exchange API `subAccountTransfer` / `sendAsset` | fromSubAccount 파라미터로 방향 지정 |
| Sub-account별 포지션/잔액 조회 | 서브 계정 상태 독립 모니터링 | Low | Info API with sub-account address | sub-account address로 직접 조회 |
| WAIaaS 월렛-Sub-account 매핑 | 1 WAIaaS wallet = 1 Hyperliquid sub-account 매핑 | High | DB 스키마 확장, 월렛 모델 연동 | 설계 핵심 결정 사항. Master wallet에서 sub-account 서명 대행 |

### Operational Features

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Dead Man's Switch (scheduleCancel) | 연결 끊김 시 자동 전체 주문 취소. 안전장치 | Low | Exchange API `scheduleCancel` | 최소 5초 후, 일 10회 제한 |
| Account Abstraction 모드 설정 | Standard/Unified/Portfolio Margin 선택 | Low | Exchange API `userSetAbstraction` | Unified: 잔액 통합, Portfolio Margin: 최고 자본 효율 (pre-alpha) |
| API Wallet (Agent) 등록 | 별도 서명 키로 거래. 마스터 키 노출 방지 | Med | Exchange API `approveAgent` | 마스터당 1 unnamed + 3 named, sub-account당 2 추가 |
| 수수료 정보 조회 | 볼륨 기반 수수료 티어, 할인 확인 | Low | Info API `userFees` | Perp: 0.045%/0.015% base, Spot: 0.07%/0.04% base |
| Rate Limit 상태 조회 | API 사용량 모니터링 | Low | Info API `userRateLimit` | 1200 weight/minute, 요청별 가중치 상이 |

### Policy Engine Integration

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Perp 거래 금액 정책 적용 | 기존 지출 한도 정책을 Perp 주문에 적용 | High | 정책 엔진 확장 | notional value = size * price, USDC 기준 환산 |
| Spot 거래 금액 정책 적용 | 기존 지출 한도 정책을 Spot 주문에 적용 | Med | 정책 엔진 확장 | 주문 금액을 USD로 환산하여 기존 정책 평가 |
| 레버리지 상한 정책 | 최대 허용 레버리지 제한 | Med | 신규 정책 타입 | MAX_LEVERAGE 정책으로 위험 관리 |
| 마켓 화이트리스트 | 거래 허용 마켓 제한 | Med | 신규 정책 타입 | ALLOWED_MARKETS 정책 |

---

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| WebSocket 실시간 구독 (v1) | 복잡도 급증. 데몬 프로세스에 영구 WS 연결 관리 필요. 1000 구독 제한. 초기 구현에서 불필요 | REST polling으로 충분. 주문 상태/포지션은 요청 시 조회. 향후 v2에서 WS 추가 검토 |
| Vault 운용 (Vault Manager) | Vault는 자금 풀 관리 도구로 WAIaaS의 개별 월렛 모델과 근본적으로 다름. 구현 복잡도 대비 수요 낮음 | Sub-account로 전략 격리 달성. Vault는 향후 별도 마일스톤으로 검토 |
| Builder Fee 수취 | WAIaaS는 오픈소스 자체 호스팅 도구. 빌더 수수료 수취는 핵심 가치와 충돌 | Builder fee 승인 API는 사용자가 직접 다른 빌더에 승인할 때만 노출 |
| Portfolio Margin 모드 자동 전환 | Pre-alpha 상태. 지원 자산 제한적 (HYPE, BTC, USDH, USDC). API 불안정 가능 | Standard/Unified만 지원. Portfolio Margin은 사용자가 수동으로 설정 |
| Staking/Delegation 기능 | Hyperliquid DEX 거래와 무관한 별도 도메인. 7일 unstaking 등 복잡한 상태 관리 | 기존 Lido/Jito 스테이킹과 별도 마일스톤으로 검토 |
| 전체 거래 이력 DB 저장 | Hyperliquid Info API가 최대 2000건 이력 제공. 별도 DB 저장은 동기화 복잡도 증가 | Info API에서 on-demand 조회. WAIaaS 자체 트랜잭션 로그로 충분 |
| Borrow/Lend 기능 | 별도 DeFi 도메인 (기존 Aave/Kamino 패턴). Hyperliquid DEX 통합 범위 초과 | 필요 시 별도 마일스톤으로 ILendingProvider 구현 |
| HyperEVM 스마트 컨트랙트 DEX 연동 | L1 DEX API가 핵심. HyperEVM 위의 별도 DEX(예: HyperSwap)는 범위 초과 | HyperEVM 체인 추가로 기존 EVM DEX 통합(0x 등)이 자동으로 동작할 수 있음 |

---

## Feature Dependencies

```
HyperEVM 체인 등록 (독립, Phase 1)
    |
    v
HyperliquidExchangeClient (EIP-712 서명 + REST client)
    |
    +---> Perp Trading (Market/Limit/SL/TP)
    |         |
    |         +---> TWAP Orders
    |         +---> Scale Orders
    |         +---> Modify Orders
    |         +---> Dead Man's Switch
    |
    +---> Spot Trading (Market/Limit)
    |         |
    |         +---> Spot-Perp Transfer
    |
    +---> Sub-account Management
    |         |
    |         +---> Sub-account별 Perp/Spot 거래 (vaultAddress 설정)
    |         +---> Master-Sub 자금 이동
    |
    +---> Account State Queries (positions, balances, orders, fills)
    |
    +---> Policy Engine Integration
              |
              +---> 금액 정책 (notional value 환산)
              +---> 레버리지 상한 정책
              +---> 마켓 화이트리스트 정책

기존 의존성:
- EIP-712 서명 → 기존 EvmAdapter.signTypedData (v1.4.1에서 구현 완료)
- IPerpProvider → 기존 Drift Perp 인터페이스 (v29.8에서 정의 완료)
- IActionProvider → 기존 Action Provider 프레임워크 (v1.5에서 구현 완료)
- Admin Settings → 기존 SettingsService (v1.4.4에서 구현 완료)
- MCP/SDK 자동 노출 → 기존 auto-expose 패턴 (v1.5에서 구현 완료)
```

---

## MVP Recommendation

### Phase 1: HyperEVM Chain (독립)

체인 등록만으로 기존 EVM 기능 즉시 활용 가능. 복잡도 최소.

1. `EvmNetworkType` enum에 `hyper-evm-mainnet` / `hyper-evm-testnet` 추가
2. `EVM_CHAIN_MAP`에 viem chain import 추가
3. 빌트인 프리셋에 HyperEVM 환경 추가

### Phase 2: 설계 문서 (Perp/Spot/Sub-account 아키텍처 확정)

HyperliquidExchangeClient 공유 구조, 6-stage 파이프라인과의 통합 방안, discriminatedUnion 타입 매핑, 정책 엔진 적용 방안 확정.

### Phase 3: Perp Trading (핵심 MVP)

Prioritize:
1. **HyperliquidExchangeClient** -- EIP-712 서명, nonce 관리, 에러 핸들링, rate limit 준수
2. **Market/Limit 주문** -- 기본 주문 생성/취소/조회
3. **Stop-Loss / Take-Profit** -- 리스크 관리 필수
4. **포지션/마진/마켓 조회** -- IPerpProvider 인터페이스 구현
5. **레버리지/마진 모드 설정** -- Cross/Isolated 선택
6. **MCP 도구 + SDK 메서드** -- 전 인터페이스 노출
7. **Admin UI 포지션/주문 현황** -- 운영 가시성

### Phase 4: Spot Trading

Prioritize:
1. **Market/Limit 주문** -- HyperliquidExchangeClient 재활용
2. **Spot 잔액 조회** -- spotClearinghouseState
3. **Spot-Perp 잔액 이동** -- usdClassTransfer
4. **MCP 도구 + SDK 메서드**

### Phase 5: Sub-accounts

Prioritize:
1. **Sub-account 생성/조회**
2. **Master-Sub 자금 이동**
3. **Sub-account별 거래** (vaultAddress 설정)

Defer:
- **TWAP 주문**: Nice-to-have. Perp MVP 이후 추가
- **Scale Orders**: 클라이언트 측 구현으로 복잡도 높음. Defer
- **Dead Man's Switch**: 운영 기능. Perp MVP 이후 추가
- **API Wallet 등록**: 보안 강화 기능. Sub-account 이후 추가
- **정책 엔진 확장 (레버리지 상한, 마켓 화이트리스트)**: 기본 금액 정책 적용 후 별도 이터레이션
- **WebSocket 실시간 구독**: v2 scope

---

## Hyperliquid 고유 특성 (구현 시 주의)

### 1. API 기반 거래 (온체인 TX 아님)

Hyperliquid L1 DEX 거래는 블록체인 트랜잭션이 아니라 EIP-712 서명 + REST API 호출이다. 기존 WAIaaS 6-stage 파이프라인(Build TX -> Validate -> Policy -> Delay -> Sign -> Broadcast)과 근본적으로 다르다.

**설계 결정 필요:** SIGN type 재활용 vs 신규 discriminatedUnion type 추가 vs 파이프라인 우회(ActionProvider 직접 실행).

### 2. Nonce = 밀리초 타임스탬프

Hyperliquid nonce는 순차적 정수가 아니라 밀리초 타임스탬프이다. 최근 100개 nonce를 저장하며, (T-2일, T+1일) 범위 내여야 한다. 동일 밀리초에 다중 요청 시 충돌 가능.

### 3. Sub-account 서명 모델

Sub-account는 private key가 없다. 마스터 계정이 `vaultAddress` 필드에 sub-account 주소를 설정하여 대리 서명한다. Sub-account별 별도 API wallet 권장 (nonce 충돌 방지).

### 4. Account Abstraction 모드

Standard(분리)/Unified(통합)/Portfolio Margin(포트폴리오) 3가지 모드. API 응답 구조가 모드에 따라 달라진다. Unified 모드에서는 spot clearinghouse에서 모든 잔액 조회, 개별 perp dex 상태는 무의미.

### 5. Rate Limit 구조

- IP 기반: 배치 요청은 1건으로 카운트
- 주소 기반: 배치 내 개별 주문이 각각 카운트. 누적 거래량 1 USDC당 1 요청 허용. 초기 버퍼 10,000건
- Info 요청: weight 2~60 (endpoint별 상이), 1200 weight/minute

### 6. Spot 거래 수수료

Spot은 Perp보다 수수료가 높다 (Taker 0.07% vs 0.045%). 볼륨 기반 티어 할인은 Spot 거래량이 2배로 카운트.

---

## Existing WAIaaS Pattern Mapping

| Hyperliquid Feature | WAIaaS Pattern | Reuse Level | Notes |
|---------------------|----------------|-------------|-------|
| Perp Market/Limit/SL/TP | IPerpProvider (Drift) | Interface reuse | open_position, close_position, modify_position 액션 매핑 |
| Spot Market/Limit | ISwapProvider는 부적합 | New interface | ISpotProvider 또는 HyperliquidSpotProvider 직접 구현 |
| EIP-712 서명 | EvmAdapter.signTypedData | Direct reuse | 기존 EIP-712 서명 인프라 그대로 활용 |
| Sub-account | 없음 | New concept | DB 스키마 + 월렛 모델 확장 필요 |
| API 클라이언트 | DcentSwapApiClient 패턴 | Pattern reuse | 싱글톤 클라이언트, 에러 핸들링, 캐싱 |
| Admin Settings | SettingsService | Direct reuse | API endpoint, testnet 전환, rate limit 등 |
| MCP/SDK 자동 노출 | IActionProvider auto-expose | Direct reuse | HyperliquidPerpActionProvider 등록 |
| 정책 적용 | Policy engine (USD 환산) | Extend | notional value 환산 로직 추가 필요 |

---

## Sources

- [Hyperliquid Exchange API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint) -- HIGH confidence
- [Hyperliquid Info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint) -- HIGH confidence
- [Hyperliquid Order Types](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types) -- HIGH confidence
- [Hyperliquid Rate Limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits) -- HIGH confidence
- [Hyperliquid Nonces and API Wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets) -- HIGH confidence
- [Hyperliquid Account Abstraction Modes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes) -- HIGH confidence
- [Hyperliquid Fees](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees) -- HIGH confidence
- [Hyperliquid TP/SL](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl) -- HIGH confidence
- [Turnkey x Hyperliquid EIP-712 Signing](https://www.turnkey.com/blog/hyperliquid-secure-eip-712-signing) -- MEDIUM confidence
