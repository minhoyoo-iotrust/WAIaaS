# 마일스톤 m29-01: EVM Lending (Aave V3) + Lending 프레임워크

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

DeFi Lending 프레임워크(포지션 추적, 헬스 팩터 모니터링, 담보/차입 관리)를 구축하고, Aave V3를 첫 번째 Lending Provider로 구현하여, AI 에이전트가 EVM 체인에서 자산 예치/차입을 정책 평가 하에 실행할 수 있는 상태.

---

## 배경

v1.5.x에서 스왑/브릿지/스테이킹이 지원되지만, 이들은 모두 **단발성 트랜잭션**(요청 → 실행 → 완료)이다. Lending은 **상태를 가진 포지션**(담보 예치 → 차입 → 이자 누적 → 상환/청산)으로, 지속적인 모니터링이 필요하다.

Aave V3는 TVL ~$37B으로 DeFi 최대 대출 프로토콜이며, 10+ EVM 체인을 지원한다. supply/borrow/repay/withdraw 4개 핵심 액션으로 모델링되어 Lending 프레임워크의 기반을 확립하기에 적합하다.

### v1.5.x ActionProvider와의 차이

```
v1.5.x (단발성):  resolve() → ContractCallRequest → 실행 → 완료
m29-01+ (포지션):  resolve() → ContractCallRequest → 실행 → 포지션 생성 → 모니터링 → 상환/청산
```

---

## 구현 대상

### Lending 프레임워크 (공통 인프라)

| 컴포넌트 | 내용 |
|----------|------|
| ILendingProvider | Lending 전용 인터페이스. IActionProvider 확장. 추가 메서드: `getPosition(walletId)`, `getHealthFactor(walletId)`, `getMarkets()`. 4개 표준 액션: supply, borrow, repay, withdraw |
| PositionTracker | 월렛별 DeFi 포지션 추적 서비스. positions 테이블(wallet_id, provider, asset, type[SUPPLY/BORROW], amount, apy, updated_at). 주기적 동기화(5분 간격) |
| HealthFactorMonitor | 헬스 팩터 모니터링. 임계값(기본 1.2) 미만 시 LIQUIDATION_WARNING 알림 발송. Owner에게 상환/담보 추가 권고 |
| LendingPolicyEvaluator | 차입 정책 평가. 최대 차입 비율(LTV) 제한, 허용 담보/차입 자산 화이트리스트, USD 기준 차입 한도 |
| Admin 포트폴리오 뷰 | Admin 대시보드에 DeFi 포지션 섹션 추가. 예치/차입 현황, 헬스 팩터, APY 표시 |
| REST API | GET /v1/wallets/:id/positions — 포지션 조회. GET /v1/wallets/:id/health-factor — 헬스 팩터 조회 |

### Aave V3 구현체

| 컴포넌트 | 내용 |
|----------|------|
| AaveV3LendingProvider | ILendingProvider 구현체. Aave V3 Pool 컨트랙트 ABI 호출. 4개 액션: supply(담보 예치 → aToken 수령), borrow(차입 → 변동/고정 이자율 선택), repay(상환), withdraw(담보 출금) |
| AaveContractHelper | Aave V3 컨트랙트 ABI 인코딩. viem 사용. Pool, PoolDataProvider, Oracle 컨트랙트 주소 매핑(체인별). Ethereum, Base, Arbitrum, Optimism, Polygon 지원 |
| AaveMarketData | Aave GraphQL API(AaveKit) 또는 온체인 PoolDataProvider로 시장 데이터 조회. 자산별 APY, LTV, 유동성 정보 |
| MCP 도구 | waiaas_aave_supply, waiaas_aave_borrow, waiaas_aave_repay, waiaas_aave_withdraw, waiaas_aave_positions |
| SDK 지원 | TS/Python SDK: executeAction('aave_supply', params) 등 |

### 입력 스키마

```typescript
const AaveSupplyInputSchema = z.object({
  asset: z.string(),            // 예치 자산 주소 (0x...)
  amount: z.string(),           // 예치 수량
});

const AaveBorrowInputSchema = z.object({
  asset: z.string(),            // 차입 자산 주소
  amount: z.string(),           // 차입 수량
  interestRateMode: z.enum(['variable', 'stable']).default('variable'),
});

const AaveRepayInputSchema = z.object({
  asset: z.string(),            // 상환 자산 주소
  amount: z.string(),           // 상환 수량 (max로 전액 상환)
});

const AaveWithdrawInputSchema = z.object({
  asset: z.string(),            // 출금 자산 주소
  amount: z.string(),           // 출금 수량 (max로 전액 출금)
});
```

### 파일/모듈 구조

```
packages/core/src/interfaces/
  lending-provider.types.ts      # ILendingProvider, Position, HealthFactor

packages/daemon/src/services/
  defi/
    position-tracker.ts          # PositionTracker (포지션 동기화)
    health-factor-monitor.ts     # HealthFactorMonitor (청산 경고)
    lending-policy-evaluator.ts  # Lending 정책 평가

packages/actions/src/
  providers/
    aave-v3/
      index.ts                   # AaveV3LendingProvider
      aave-contracts.ts          # ABI + 체인별 주소 매핑
      market-data.ts             # 시장 데이터 조회
      schemas.ts                 # 입력 Zod 스키마
      config.ts                  # AaveConfig 타입

packages/daemon/src/routes/
  wallets.ts                     # GET /v1/wallets/:id/positions, /health-factor 추가
```

### config.toml

```toml
[actions.aave_v3]
enabled = true
health_factor_warning_threshold = 1.2    # 헬스 팩터 경고 임계값
position_sync_interval_sec = 300         # 포지션 동기화 간격 (5분)
max_ltv_pct = 0.8                        # 최대 LTV (80%)
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | Lending 프레임워크 인터페이스 | ILendingProvider extends IActionProvider | 기존 ActionProvider 인프라 재사용. supply/borrow/repay/withdraw 4개 표준 액션 + getPosition/getHealthFactor 추가 메서드 |
| 2 | 포지션 추적 방식 | 온체인 조회 + DB 캐시 | aToken/debtToken 잔고를 온체인 조회하되, 5분 간격으로 positions 테이블에 캐시. Admin UI는 캐시에서 읽고, 정책 평가는 온체인 실시간 조회 |
| 3 | Aave 통합 방식 | 컨트랙트 ABI 직접 호출 (viem) | Aave SDK 의존성 추가 대신 ABI 인코딩으로 충분. Pool 컨트랙트의 supply/borrow/repay/withdraw는 단일 함수 호출 |
| 4 | 헬스 팩터 모니터링 | 폴링 기반 (5분 간격) | WebSocket 기반 실시간 모니터링은 RPC 비용 과다. 5분 간격 폴링으로 청산 위험 조기 감지 가능. 급격한 가격 변동은 가격 오라클(v1.5)이 STALE 경고로 보완 |
| 5 | 청산 경고 임계값 | 헬스 팩터 1.2 (기본) | Aave 청산 임계값은 1.0. 1.2에서 경고하면 Owner가 상환/담보 추가할 여유 확보. config.toml에서 오버라이드 가능 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### Supply / Withdraw

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | Aave supply resolve -> ContractCallRequest 반환 | AaveV3LendingProvider.resolve('supply', {asset, amount}) -> ContractCallRequest(Pool.supply calldata) assert | [L0] |
| 2 | Supply 실행 -> 포지션 생성 | mock EvmAdapter + supply 실행 -> positions 테이블에 SUPPLY 포지션 기록 assert | [L0] |
| 3 | Withdraw resolve -> ContractCallRequest 반환 | resolve('withdraw', {asset, amount}) -> Pool.withdraw calldata assert | [L0] |
| 4 | 잔고 부족 -> INSUFFICIENT_BALANCE 에러 | 잔고 초과 supply 요청 -> 에러 assert | [L0] |

### Borrow / Repay

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 5 | Borrow resolve -> ContractCallRequest 반환 | resolve('borrow', {asset, amount, interestRateMode: 'variable'}) -> Pool.borrow calldata assert | [L0] |
| 6 | Borrow 실행 -> BORROW 포지션 생성 | mock 차입 실행 -> positions 테이블에 BORROW 포지션 기록 assert | [L0] |
| 7 | Repay resolve -> ContractCallRequest 반환 | resolve('repay', {asset, amount}) -> Pool.repay calldata assert | [L0] |
| 8 | 담보 없이 차입 -> 에러 | 담보 미예치 상태에서 borrow -> INSUFFICIENT_COLLATERAL 에러 assert | [L0] |

### 헬스 팩터 모니터링

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 9 | 헬스 팩터 > 1.2 -> 정상 | mock 헬스 팩터 2.5 -> 경고 없음 assert | [L0] |
| 10 | 헬스 팩터 < 1.2 -> LIQUIDATION_WARNING 알림 | mock 헬스 팩터 1.15 -> LIQUIDATION_WARNING 알림 발송 assert | [L0] |
| 11 | 헬스 팩터 조회 API | GET /v1/wallets/:id/health-factor -> {factor: 2.5, status: 'safe'} assert | [L0] |

### 포지션 조회

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 12 | GET /v1/wallets/:id/positions -> 포지션 목록 | supply USDC $5000 + borrow ETH $2000 -> positions 배열 2개 + USD 환산 assert | [L0] |
| 13 | Admin 대시보드 포지션 표시 | 포지션 데이터 -> Admin 포트폴리오 섹션 렌더링 assert | [L0] |

### 정책 연동

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 14 | Supply 금액 USD 환산 -> SPENDING_LIMIT 평가 | mock oracle + 10,000 USDC supply -> SPENDING_LIMIT 평가 assert | [L0] |
| 15 | Borrow 금액 LTV 제한 초과 -> 정책 거부 | max_ltv_pct=0.8 + 담보 $10,000 + $9,000 차입 -> LTV 90% > 80% -> 거부 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.5 (Action Provider 프레임워크) | IActionProvider, ActionProviderRegistry, MCP Tool 자동 변환 |
| v1.5 (가격 오라클) | 포지션 USD 환산, 헬스 팩터 계산에 IPriceOracle 필요 |
| v1.4 (EVM 인프라) | EvmAdapter, ContractCallRequest, CONTRACT_WHITELIST |
| m26 (운영 기능 설계) | Audit Log API로 포지션 변동 이력 기록 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 청산 위험 감지 지연 | 5분 폴링 간격 동안 급격한 가격 하락 시 청산 발생 가능 | 가격 오라클(v1.5)의 STALE 경고와 연동. 급격한 가격 변동 감지 시 폴링 주기 단축(1분). Owner에게 보수적 LTV 권장 |
| 2 | Aave V3 체인별 컨트랙트 주소 관리 | 10+ 체인에 대해 Pool, Oracle, DataProvider 주소 매핑 필요 | 체인별 주소를 Aave GitHub에서 조회하여 hardcoded 매핑. Aave PoolAddressesProvider 컨트랙트로 동적 조회도 가능 |
| 3 | 포지션 동기화 정확도 | aToken 리베이스(이자 누적)로 잔고가 지속 변동 | 온체인 실시간 조회(balanceOf)가 정확. DB 캐시는 표시용. 정책 평가는 항상 온체인 조회 |
| 4 | Lending 프레임워크 과설계 | 첫 구현에서 과도한 추상화로 복잡도 증가 | Aave 구현과 함께 프레임워크를 만들어 실용성 검증. Kamino(m29-02) 통합 시 인터페이스 조정 허용 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3-4개 (Lending 프레임워크 + DB 1 / Aave Provider + 컨트랙트 1 / 헬스팩터 모니터링 + 알림 1 / Admin UI + API + MCP 1) |
| 신규/수정 파일 | 20-28개 |
| 테스트 | 15-25개 |
| DB 마이그레이션 | positions 테이블 추가 |

---

*생성일: 2026-02-15*
*선행: v1.5 (Action Provider 프레임워크 + 가격 오라클)*
*관련: Aave V3 (https://docs.aave.com/developers), 설계 문서 62 (action-provider-architecture)*
