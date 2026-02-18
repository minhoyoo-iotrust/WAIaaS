# 마일스톤 m29-02: Solana Lending (Kamino)

## 목표

m28에서 구축된 Lending 프레임워크 위에 Kamino K-Lend를 Solana Lending Provider로 구현하여, AI 에이전트가 Solana 체인에서 자산 예치/차입을 정책 평가 하에 실행할 수 있는 상태.

---

## 배경

m29-01에서 ILendingProvider 인터페이스, PositionTracker, HealthFactorMonitor가 EVM(Aave) 기반으로 구축된다. m29-02는 동일 프레임워크를 **Solana에 적용**하여 멀티체인 Lending을 완성한다.

Kamino는 TVL ~$3.5B으로 Solana 최대 대출 프로토콜이다. K-Lend V2는 대출/차입, 자동 유동성 관리, 레버리지 수익 전략을 제공하며, 풀스택 TypeScript SDK(`@kamino-finance/klend-sdk`)로 프로그래밍 통합이 용이하다.

---

## 구현 대상

### 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| KaminoLendingProvider | ILendingProvider 구현체 (Solana). 4개 표준 액션: supply(예치), borrow(차입), repay(상환), withdraw(출금). @kamino-finance/klend-sdk 사용. Program ID: `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` |
| KaminoMarketData | Kamino REST API + SDK로 시장 데이터 조회. 자산별 APY, LTV, 유동성, 리저브 정보 |
| Solana PositionTracker 확장 | m28 PositionTracker를 Solana 포지션 동기화로 확장. Kamino obligation 계정에서 담보/차입 포지션 조회 |
| MCP 도구 | waiaas_kamino_supply, waiaas_kamino_borrow, waiaas_kamino_repay, waiaas_kamino_withdraw, waiaas_kamino_positions |
| SDK 지원 | TS/Python SDK: executeAction('kamino_supply', params) 등 |

### 입력 스키마

```typescript
const KaminoSupplyInputSchema = z.object({
  asset: z.string(),            // 토큰 mint 주소
  amount: z.string(),           // 예치 수량
  market: z.string().optional(), // Kamino market (기본: main market)
});

const KaminoBorrowInputSchema = z.object({
  asset: z.string(),            // 차입 토큰 mint 주소
  amount: z.string(),           // 차입 수량
  market: z.string().optional(),
});
```

### 파일/모듈 구조

```
packages/actions/src/
  providers/
    kamino/
      index.ts                   # KaminoLendingProvider
      kamino-sdk-wrapper.ts      # @kamino-finance/klend-sdk 래퍼
      market-data.ts             # 시장 데이터 조회
      schemas.ts                 # 입력 Zod 스키마
      config.ts                  # KaminoConfig 타입
```

### config.toml

```toml
[actions.kamino]
enabled = true
market = "main"                              # 기본 market
health_factor_warning_threshold = 1.2        # m28 프레임워크 공유
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 통합 방식 | @kamino-finance/klend-sdk | Kamino는 Solana 프로그램 호출이 복잡(obligation 계정, reserve 조회 등). SDK가 instruction 빌딩을 추상화. ABI 직접 호출보다 SDK가 효율적 |
| 2 | Lending 프레임워크 호환 | ILendingProvider 구현 | m29-01에서 정의한 supply/borrow/repay/withdraw 4개 표준 액션 + getPosition/getHealthFactor. Aave와 동일 인터페이스로 Admin UI/정책이 프로토콜 무관하게 동작 |
| 3 | Market 선택 | config.toml로 기본 market 지정 | Kamino는 Main/JLP/Altcoin 등 복수 market 운영. 기본값은 main market, 액션 파라미터로 오버라이드 가능 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | Kamino supply resolve -> instruction 반환 | KaminoLendingProvider.resolve('supply', {asset, amount}) -> ContractCallRequest(Kamino deposit instruction) assert | [L0] |
| 2 | Supply 실행 -> 포지션 생성 | mock SolanaAdapter + supply -> positions 테이블 SUPPLY 기록 assert | [L0] |
| 3 | Borrow resolve -> instruction 반환 | resolve('borrow', {asset, amount}) -> Kamino borrow instruction assert | [L0] |
| 4 | Repay/Withdraw 정상 동작 | repay/withdraw resolve -> 올바른 instruction assert | [L0] |
| 5 | 헬스 팩터 조회 -> Kamino obligation에서 계산 | getHealthFactor() -> Kamino obligation 데이터 기반 헬스 팩터 반환 assert | [L0] |
| 6 | 포지션 조회 -> Aave+Kamino 통합 목록 | GET /v1/wallets/:id/positions -> Aave(EVM) + Kamino(Solana) 포지션 통합 반환 assert | [L0] |
| 7 | Admin 포트폴리오에 Kamino 포지션 표시 | Kamino SUPPLY + BORROW -> Admin 포지션 섹션에 Solana 렌딩 표시 assert | [L0] |
| 8 | LTV 제한 초과 -> 정책 거부 | 담보 부족 상태 borrow -> Lending 정책 거부 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m29-01 (Aave + Lending 프레임워크) | ILendingProvider, PositionTracker, HealthFactorMonitor, LendingPolicyEvaluator, positions 테이블 |
| v1.5 (가격 오라클) | Kamino 포지션 USD 환산 |
| v1.4.6 (Solana 인프라) | SolanaAdapter, ContractCallRequest(Solana) |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Kamino SDK 의존성 | @kamino-finance/klend-sdk 버전 변경 시 호환성 이슈 | SDK 래퍼로 추상화. 버전 핀닝(package.json) |
| 2 | Solana 포지션 조회 복잡도 | Kamino obligation 계정 구조가 Aave 대비 복잡 | SDK의 getObligation() 메서드로 추상화. 직접 계정 파싱 불필요 |
| 3 | Multi-market 혼란 | Kamino의 복수 market 개념이 사용자에게 혼란 | 기본 market 자동 선택. MCP 도구 설명에 market 개념 안내 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2개 (KaminoLendingProvider + SDK 래퍼 1 / MCP+SDK+Admin UI 확장 1) |
| 신규/수정 파일 | 10-14개 |
| 테스트 | 8-12개 |
| DB 마이그레이션 | 없음 (m29-01 positions 테이블 재사용) |

---

*생성일: 2026-02-15*
*선행: m29-01 (Aave V3 + Lending 프레임워크)*
*관련: Kamino (https://docs.kamino.finance/), @kamino-finance/klend-sdk*
