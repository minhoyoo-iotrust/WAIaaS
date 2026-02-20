# 마일스톤 m29-04: Solana Perp DEX (Drift) + Perp 프레임워크

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

DeFi Perp(무기한 선물) 프레임워크(레버리지 포지션 관리, 마진 모니터링, PnL 추적)를 구축하고, Drift Protocol을 첫 번째 Perp Provider로 구현하여, AI 에이전트가 Solana에서 레버리지 트레이딩을 정책 평가 하에 실행할 수 있는 상태.

---

## 배경

m29-01~m29-03에서 Lending과 Yield가 지원되지만, **레버리지 트레이딩**(무기한 선물)은 불가능하다. Perp DEX는 AI 에이전트의 자동 트레이딩 전략(헤징, 차익거래, 추세 추종)에 핵심 인프라이다.

Drift Protocol은 Solana 최대 무기한 선물 DEX로, 최대 101x 레버리지를 제공한다. TypeScript/Python SDK + HTTP Gateway가 완비되어 있어 봇/에이전트 통합에 최적화되어 있다.

### 정책 통합의 중요성

레버리지 트레이딩은 높은 위험을 수반하므로, WAIaaS의 정책 엔진이 특히 중요하다:

```
정책 예시:
- max_leverage: 5x (최대 레버리지 제한)
- max_position_usd: $10,000 (최대 포지션 크기)
- allowed_markets: ["SOL-PERP", "ETH-PERP"] (허용 시장)
- APPROVAL 요구: 레버리지 10x 이상 또는 $5,000 이상 포지션
```

---

## 구현 대상

### Perp 프레임워크 (공통 인프라)

| 컴포넌트 | 내용 |
|----------|------|
| IPerpProvider | Perp 전용 인터페이스. IActionProvider 확장. 추가 메서드: `getPosition(walletId, market)`, `getMarginInfo(walletId)`, `getMarkets()`. 표준 액션: openPosition, closePosition, modifyPosition, addMargin, withdrawMargin |
| PerpPositionTracker | 레버리지 포지션 추적. perp_positions 테이블(wallet_id, provider, market, direction[LONG/SHORT], size, entry_price, leverage, unrealized_pnl, margin, liquidation_price). PositionTracker(m28)와 통합 |
| MarginMonitor | 마진 비율 모니터링. 유지 마진 임계값 접근 시 MARGIN_WARNING 알림. 청산 가격 접근 시 LIQUIDATION_IMMINENT 경고 |
| PerpPolicyEvaluator | 레버리지 정책 평가. 최대 레버리지 제한, 최대 포지션 크기(USD), 허용 시장 화이트리스트 |

### Drift 구현체

| 컴포넌트 | 내용 |
|----------|------|
| DriftPerpProvider | IPerpProvider 구현체. @drift-labs/sdk 사용. 5개 액션: openPosition(포지션 개설), closePosition(포지션 청산), modifyPosition(크기 변경), addMargin(마진 추가), withdrawMargin(마진 출금). Program: `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` |
| DriftSdkWrapper | @drift-labs/sdk 래퍼. DriftClient 초기화, 오더 빌딩, 포지션/마진 조회 추상화 |
| DriftMarketData | Drift 시장 데이터 조회. 마켓 목록, 펀딩 레이트, 오라클 가격, 오픈 인터레스트 |
| MCP 도구 | waiaas_drift_open, waiaas_drift_close, waiaas_drift_positions, waiaas_drift_markets |
| SDK 지원 | TS/Python SDK: executeAction('drift_open', params) 등 |

### 입력 스키마

```typescript
const DriftOpenPositionInputSchema = z.object({
  market: z.string(),           // 시장 (예: "SOL-PERP")
  direction: z.enum(['long', 'short']),
  size: z.string(),             // 포지션 크기 (base asset 수량)
  leverage: z.number().min(1).max(20).default(1), // 레버리지
  orderType: z.enum(['market', 'limit']).default('market'),
  limitPrice: z.string().optional(), // limit 주문 가격
});

const DriftClosePositionInputSchema = z.object({
  market: z.string(),
  percentage: z.number().min(0).max(100).default(100), // 부분 청산 비율
});
```

### config.toml

```toml
[actions.drift]
enabled = true
max_leverage = 5                             # 기본 최대 레버리지
max_position_usd = 10000                     # 기본 최대 포지션 크기 (USD)
margin_warning_threshold_pct = 0.15          # 마진 비율 15% 이하 경고
position_sync_interval_sec = 60              # 포지션 동기화 간격 (1분, Perp는 빈번한 변동)
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | Drift 통합 방식 | @drift-labs/sdk | Drift 프로토콜 호출이 복잡(유저 계정 초기화, 오라클 계정 포함 등). SDK가 instruction 빌딩과 계정 관리를 추상화. HTTP Gateway도 대안이나 SDK가 더 유연 |
| 2 | Perp 프레임워크 분리 | IPerpProvider (ILendingProvider와 별도) | Perp는 방향(long/short), 레버리지, 펀딩 레이트, PnL 등 Lending/Yield에 없는 개념. 별도 인터페이스 필수 |
| 3 | 포지션 동기화 주기 | 1분 (Lending 5분 대비 짧음) | Perp 포지션은 가격 변동에 민감. 1분 간격으로 마진/PnL 업데이트. Drift는 Solana 기반이라 RPC 조회 비용 낮음 |
| 4 | 레버리지 기본 제한 | 5x (Drift 최대 101x 대비 보수적) | AI 에이전트의 자동 트레이딩에 높은 레버리지는 위험. Owner가 config에서 상향 가능. 10x 이상은 APPROVAL 정책 권장 |
| 5 | Spot 거래 제외 | Perp만 지원 (Drift Spot은 제외) | Spot 거래는 Jupiter/0x로 이미 지원. Drift Spot은 유동성이 DEX 애그리게이터 대비 제한적 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | openPosition resolve -> instruction 반환 | DriftPerpProvider.resolve('openPosition', {market: 'SOL-PERP', direction: 'long', size: '10', leverage: 3}) -> ContractCallRequest assert | [L0] |
| 2 | 포지션 개설 -> perp_positions 기록 | mock 실행 -> perp_positions 테이블에 LONG 포지션 기록(entry_price, leverage, liquidation_price) assert | [L0] |
| 3 | closePosition -> 포지션 청산 | resolve('closePosition', {market: 'SOL-PERP', percentage: 100}) -> 청산 instruction assert | [L0] |
| 4 | 부분 청산 (50%) | percentage=50 -> 포지션 크기 절반 감소 assert | [L0] |
| 5 | 레버리지 제한 초과 -> 정책 거부 | max_leverage=5 + 10x 요청 -> 정책 거부 또는 APPROVAL 격상 assert | [L0] |
| 6 | 포지션 크기 USD 제한 초과 -> APPROVAL | max_position_usd=$10,000 + $15,000 포지션 -> APPROVAL assert | [L0] |
| 7 | 마진 비율 경고 | mock 마진 비율 12% -> MarginMonitor -> MARGIN_WARNING 알림 assert | [L0] |
| 8 | PnL 추적 | 포지션 개설 후 가격 변동 mock -> unrealized_pnl 업데이트 assert | [L0] |
| 9 | GET /v1/wallets/:id/positions -> Perp 포지션 포함 | Aave + Kamino + Drift 포지션 -> 통합 목록 반환 assert | [L0] |
| 10 | 시장 목록 조회 | getMarkets() -> SOL-PERP, ETH-PERP 등 Drift 마켓 목록 반환 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m29-01 (Lending 프레임워크) | PositionTracker 통합, Admin 포트폴리오 뷰, 정책 평가 인프라 |
| v1.5 (가격 오라클) | 포지션 USD 환산, PnL 계산 |
| v1.4.6 (Solana 인프라) | SolanaAdapter, ContractCallRequest(Solana) |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 레버리지 트레이딩 손실 | AI 에이전트의 자동 트레이딩이 큰 손실 발생 가능 | 보수적 기본 레버리지(5x), 최대 포지션 크기 제한, APPROVAL 정책 연동. Owner가 명시적으로 위험을 수용해야 활성화 |
| 2 | 청산 감지 지연 | 1분 폴링 간격 동안 급격한 가격 변동 시 청산 발생 | Drift의 온체인 청산 메커니즘이 자동 동작. MarginMonitor는 사전 경고용. 실제 청산 방지는 보수적 레버리지로 대응 |
| 3 | Drift SDK 의존성 크기 | @drift-labs/sdk가 무거울 수 있음 | SDK를 래퍼로 감싸서 필요한 기능만 사용. 대안으로 HTTP Gateway 활용 가능 |
| 4 | 펀딩 레이트 비용 | long/short 불균형 시 펀딩 레이트가 포지션 비용에 영향 | 펀딩 레이트를 포지션 조회에 포함. 높은 펀딩 레이트(>0.1%/8h) 경고 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3개 (Perp 프레임워크 + DB 1 / Drift Provider + SDK 래퍼 1 / MCP+마진 모니터링+Admin+정책 1) |
| 신규/수정 파일 | 18-24개 |
| 테스트 | 10-16개 |
| DB 마이그레이션 | perp_positions 테이블 추가 (또는 positions 확장) |

---

*생성일: 2026-02-15*
*선행: m29-01 (Lending 프레임워크)*
*관련: Drift (https://docs.drift.trade/sdk-documentation), @drift-labs/sdk*
