# Requirements: WAIaaS v33.8 XRPL DEX 지원

**Defined:** 2026-04-04
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

### Adapter Extension

- [x] **ADPT-01**: RippleAdapter.buildContractCall()이 calldata JSON에서 OfferCreate 트랜잭션을 빌드할 수 있다
- [x] **ADPT-02**: RippleAdapter.buildContractCall()이 calldata JSON에서 OfferCancel 트랜잭션을 빌드할 수 있다
- [x] **ADPT-03**: tx-parser가 OfferCreate 트랜잭션을 CONTRACT_CALL 타입으로 파싱하고 operation을 식별한다
- [x] **ADPT-04**: tx-parser가 OfferCancel 트랜잭션을 CONTRACT_CALL 타입으로 파싱하고 operation을 식별한다

### DEX Core Actions

- [ ] **DEX-01**: 에이전트가 XrplDexProvider를 통해 XRP ↔ IOU 즉시 스왑(tfImmediateOrCancel)을 실행할 수 있다
- [ ] **DEX-02**: 에이전트가 XrplDexProvider를 통해 IOU ↔ IOU 즉시 스왑을 실행할 수 있다
- [ ] **DEX-03**: 에이전트가 XrplDexProvider를 통해 지정가 주문(limit order)을 생성할 수 있다
- [ ] **DEX-04**: 에이전트가 XrplDexProvider를 통해 활성 주문을 취소할 수 있다
- [ ] **DEX-05**: 즉시 스왑 시 슬리피지 보호가 적용된다 (tfImmediateOrCancel + 최소 수량 검증)
- [ ] **DEX-06**: XRP/IOU 이중 금액 포맷이 올바르게 변환된다 (drops ↔ IOU object, 3가지 조합)
- [ ] **DEX-07**: IOU 수신 시 Trust Line이 없으면 자동으로 TrustSet을 선행 실행한다
- [ ] **DEX-08**: Offer 생성 전 계정 reserve 충족 여부를 사전 검증한다

### Orderbook Queries

- [ ] **BOOK-01**: 에이전트가 특정 토큰 쌍의 오더북(매수/매도 호가)을 조회할 수 있다
- [ ] **BOOK-02**: 오더북 조회 시 funded amount(실제 체결 가능 수량)가 포함된다
- [ ] **BOOK-03**: 에이전트가 자신의 활성 주문 목록을 조회할 수 있다

### Policy Integration

- [ ] **POL-01**: resolveEffectiveAmountUsd()가 XRPL DEX 스왑의 TakerGets 금액을 USD 지출로 인식한다
- [ ] **POL-02**: 기존 정책 엔진(SPENDING_LIMIT, ALLOWED_TOKENS)이 XRPL DEX 거래에 적용된다

### Interface Propagation

- [ ] **INTF-01**: XrplDexProvider 액션이 MCP 도구로 자동 노출된다 (mcpExpose=true)
- [ ] **INTF-02**: Admin Settings에서 XRPL DEX Provider를 활성화/비활성화할 수 있다
- [ ] **INTF-03**: Admin UI에서 XRPL DEX 거래 내역이 트랜잭션 목록에 표시된다
- [ ] **INTF-04**: SDK에서 XRPL DEX 액션을 호출할 수 있다

## v2 Requirements

### Advanced DEX Features

- **ADV-01**: 부분 체결된 지정가 주문의 체결량을 AffectedNodes 메타데이터에서 추출
- **ADV-02**: 지정가 주문 만료 시간(Expiration) 설정 지원
- **ADV-03**: tfFillOrKill 모드 지원 (전량 체결 또는 전량 취소)

## Out of Scope

| Feature | Reason |
|---------|--------|
| AMM 풀 기반 스왑 | m33-10에서 별도 구현 |
| 크로스체인 스왑 | m33-12 THORChain에서 구현 |
| 자동 마켓 메이킹 전략 | 트레이딩 봇 기능, 지갑 서비스 범위 밖 |
| tfPassive (패시브 오더) | v2 차별화 기능으로 분류 |
| XRPL IOU 토큰 USD 가격 조회 | 기존 IPriceOracle이 XRPL IOU를 아직 지원하지 않음, 별도 마일스톤 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ADPT-01 | Phase 1 | Complete |
| ADPT-02 | Phase 1 | Complete |
| ADPT-03 | Phase 1 | Complete |
| ADPT-04 | Phase 1 | Complete |
| DEX-01 | Phase 2 | Pending |
| DEX-02 | Phase 2 | Pending |
| DEX-03 | Phase 2 | Pending |
| DEX-04 | Phase 2 | Pending |
| DEX-05 | Phase 2 | Pending |
| DEX-06 | Phase 2 | Pending |
| DEX-07 | Phase 2 | Pending |
| DEX-08 | Phase 2 | Pending |
| BOOK-01 | Phase 2 | Pending |
| BOOK-02 | Phase 2 | Pending |
| BOOK-03 | Phase 2 | Pending |
| POL-01 | Phase 3 | Pending |
| POL-02 | Phase 3 | Pending |
| INTF-01 | Phase 3 | Pending |
| INTF-02 | Phase 3 | Pending |
| INTF-03 | Phase 3 | Pending |
| INTF-04 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 after roadmap creation*
