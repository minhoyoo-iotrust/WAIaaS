# Requirements: WAIaaS v31.4 Hyperliquid 생태계 통합

**Defined:** 2026-03-08
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v31.4 Requirements

Requirements for Hyperliquid ecosystem integration. Each maps to roadmap phases.

### HyperEVM Chain

- [ ] **HCHAIN-01**: HyperEVM Mainnet (Chain ID 999) 체인이 EVM_CHAIN_MAP에 등록된다
- [ ] **HCHAIN-02**: HyperEVM Testnet (Chain ID 998) 체인이 EVM_CHAIN_MAP에 등록된다
- [ ] **HCHAIN-03**: 기존 EVM 지갑이 HyperEVM 네트워크에서 ETH 전송/토큰 전송/컨트랙트 호출이 동작한다

### Hyperliquid Design

- [ ] **HDESIGN-01**: Hyperliquid L1 DEX API와 WAIaaS 파이프라인 통합 방안을 설계 문서로 확정한다
- [ ] **HDESIGN-02**: EIP-712 서명 플로우 (Phantom Agent + User-Signed Action) 매핑을 설계한다
- [ ] **HDESIGN-03**: HyperliquidExchangeClient 공유 구조를 설계한다
- [ ] **HDESIGN-04**: Sub-account ↔ WAIaaS 월렛 모델 매핑을 설계한다
- [ ] **HDESIGN-05**: MCP 도구/SDK 메서드/Admin Settings/Admin UI 표시를 설계한다
- [ ] **HDESIGN-06**: DB 스키마 변경 범위 (주문 이력, Sub-account 매핑)를 설계한다
- [ ] **HDESIGN-07**: 정책 엔진 적용 방안 (API 기반 거래에 지출 한도/토큰별 한도)을 설계한다

### Hyperliquid Perp

- [ ] **HPERP-01**: User가 Hyperliquid Perp Market 주문을 생성할 수 있다
- [ ] **HPERP-02**: User가 Hyperliquid Perp Limit 주문 (GTC/IoC/Post-Only)을 생성할 수 있다
- [ ] **HPERP-03**: User가 Stop-Loss 주문을 설정할 수 있다
- [ ] **HPERP-04**: User가 Take-Profit 주문을 설정할 수 있다
- [ ] **HPERP-05**: User가 미실현 PnL, 레버리지, 마진, 청산가를 포함한 포지션을 조회할 수 있다
- [ ] **HPERP-06**: User가 Cross/Isolated 마진 모드와 레버리지 배율을 설정할 수 있다
- [ ] **HPERP-07**: User가 단건/다건 주문을 취소할 수 있다
- [ ] **HPERP-08**: User가 주문 상태 (대기/체결/취소/거부)를 조회할 수 있다
- [ ] **HPERP-09**: User가 펀딩 레이트를 조회할 수 있다
- [ ] **HPERP-10**: User가 마진 정보 (여유 마진, 마진 비율)를 조회할 수 있다
- [ ] **HPERP-11**: User가 거래 가능 마켓 목록, 최대 레버리지, OI를 조회할 수 있다
- [ ] **HPERP-12**: Perp 기능이 MCP 도구 + SDK 메서드로 노출된다
- [ ] **HPERP-13**: Perp 기능이 Admin UI에 포지션/주문 현황으로 표시된다
- [ ] **HPERP-14**: HyperliquidPerpActionProvider가 IActionProvider로 등록된다

### Hyperliquid Spot

- [ ] **HSPOT-01**: User가 Hyperliquid Spot Market 주문을 생성할 수 있다
- [ ] **HSPOT-02**: User가 Hyperliquid Spot Limit 주문 (GTC/IoC/Post-Only)을 생성할 수 있다
- [ ] **HSPOT-03**: User가 Spot 계정 토큰 잔액을 조회할 수 있다
- [ ] **HSPOT-04**: User가 Spot 주문을 취소하고 상태를 조회할 수 있다
- [ ] **HSPOT-05**: User가 Spot 마켓 정보 (페어, 가격, 거래량)를 조회할 수 있다
- [ ] **HSPOT-06**: Spot 기능이 MCP 도구 + SDK 메서드로 노출된다
- [ ] **HSPOT-07**: HyperliquidSpotActionProvider가 IActionProvider로 등록된다

### Sub-account

- [ ] **HSUB-01**: User가 Hyperliquid Sub-account를 생성할 수 있다
- [ ] **HSUB-02**: User가 Master ↔ Sub-account 간 자금 이동 (USDC/토큰)을 할 수 있다
- [ ] **HSUB-03**: User가 Sub-account별 포지션/잔액을 조회할 수 있다
- [ ] **HSUB-04**: Sub-account 기능이 MCP 도구 + SDK 메서드로 노출된다

### Account State

- [ ] **HACCT-01**: User가 Perp/Spot 잔액을 통합 조회할 수 있다
- [ ] **HACCT-02**: User가 모든 오픈 주문을 조회할 수 있다
- [ ] **HACCT-03**: User가 최근 거래 이력을 조회할 수 있다
- [ ] **HACCT-04**: User가 USDC를 Spot과 Perp 계정 간 이동할 수 있다

### Policy Integration

- [ ] **HPOL-01**: Perp 거래에 기존 지출 한도 정책이 notional value 기준으로 적용된다
- [ ] **HPOL-02**: Spot 거래에 기존 지출 한도 정책이 주문 금액 기준으로 적용된다

### Integration

- [ ] **HINT-01**: Admin Settings에 Hyperliquid 관련 키가 등록된다 (API endpoint, testnet 전환 등)
- [ ] **HINT-02**: connect-info에 hyperliquid capability가 포함된다
- [ ] **HINT-03**: Skill 파일 (transactions.skill.md 등)이 업데이트된다

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Order Types

- **HADV-01**: TWAP (Time-Weighted Average Price) 주문
- **HADV-02**: Scale Orders (가격 범위 내 다수 주문 배치)
- **HADV-03**: 주문 수정 (Modify) — 취소/재주문 없이 가격/수량 변경
- **HADV-04**: Dead Man's Switch (scheduleCancel)

### Advanced Policy

- **HPOL-03**: MAX_LEVERAGE 정책 (최대 허용 레버리지 제한)
- **HPOL-04**: ALLOWED_MARKETS 정책 (거래 허용 마켓 제한)

### Operational

- **HOPS-01**: API Wallet (Agent) 등록 — 별도 서명 키로 거래
- **HOPS-02**: WebSocket 실시간 주문/포지션 구독
- **HOPS-03**: Account Abstraction 모드 설정 (Standard/Unified/Portfolio)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| WebSocket 실시간 구독 (v1) | 복잡도 급증, 데몬 프로세스에 영구 WS 연결 관리 필요, REST polling으로 충분 |
| Vault 운용 (Vault Manager) | WAIaaS 개별 월렛 모델과 근본적으로 다름, 별도 마일스톤으로 검토 |
| Builder Fee 수취 | 오픈소스 자체 호스팅 도구의 핵심 가치와 충돌 |
| Portfolio Margin 모드 | Pre-alpha 상태, 지원 자산 제한적, API 불안정 가능 |
| Staking/Delegation | Hyperliquid DEX 거래와 무관한 별도 도메인 |
| 전체 거래 이력 DB 저장 | Info API on-demand 조회로 충분, 동기화 복잡도 증가 |
| HyperEVM 스마트 컨트랙트 DEX 연동 | L1 DEX API가 핵심, 기존 0x 등이 HyperEVM에서 자동 동작 가능 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HCHAIN-01 | — | Pending |
| HCHAIN-02 | — | Pending |
| HCHAIN-03 | — | Pending |
| HDESIGN-01 | — | Pending |
| HDESIGN-02 | — | Pending |
| HDESIGN-03 | — | Pending |
| HDESIGN-04 | — | Pending |
| HDESIGN-05 | — | Pending |
| HDESIGN-06 | — | Pending |
| HDESIGN-07 | — | Pending |
| HPERP-01 | — | Pending |
| HPERP-02 | — | Pending |
| HPERP-03 | — | Pending |
| HPERP-04 | — | Pending |
| HPERP-05 | — | Pending |
| HPERP-06 | — | Pending |
| HPERP-07 | — | Pending |
| HPERP-08 | — | Pending |
| HPERP-09 | — | Pending |
| HPERP-10 | — | Pending |
| HPERP-11 | — | Pending |
| HPERP-12 | — | Pending |
| HPERP-13 | — | Pending |
| HPERP-14 | — | Pending |
| HSPOT-01 | — | Pending |
| HSPOT-02 | — | Pending |
| HSPOT-03 | — | Pending |
| HSPOT-04 | — | Pending |
| HSPOT-05 | — | Pending |
| HSPOT-06 | — | Pending |
| HSPOT-07 | — | Pending |
| HSUB-01 | — | Pending |
| HSUB-02 | — | Pending |
| HSUB-03 | — | Pending |
| HSUB-04 | — | Pending |
| HACCT-01 | — | Pending |
| HACCT-02 | — | Pending |
| HACCT-03 | — | Pending |
| HACCT-04 | — | Pending |
| HPOL-01 | — | Pending |
| HPOL-02 | — | Pending |
| HINT-01 | — | Pending |
| HINT-02 | — | Pending |
| HINT-03 | — | Pending |

**Coverage:**
- v31.4 requirements: 44 total
- Mapped to phases: 0
- Unmapped: 44 ⚠️

---
*Requirements defined: 2026-03-08*
*Last updated: 2026-03-08 after initial definition*
