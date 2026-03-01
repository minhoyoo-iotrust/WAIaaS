# Requirements: WAIaaS v29.8

**Defined:** 2026-03-01
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v29.8 Requirements

Requirements for Solana Perp DEX (Drift) + Perp 프레임워크. Each maps to roadmap phases.

### Perp Framework

- [x] **PERP-01**: IPerpProvider 인터페이스가 IActionProvider를 확장하여 getPosition/getMarginInfo/getMarkets 메서드와 5 표준 액션(open_position/close_position/modify_position/add_margin/withdraw_margin)을 정의한다
- [x] **PERP-02**: PerpPositionTracker가 defi_positions 테이블(category='PERP')에 포지션을 기록하며, metadata JSON에 market/direction/size/entry_price/leverage/unrealized_pnl/margin/liquidation_price를 저장한다
- [x] **PERP-03**: MarginMonitor가 마진 비율을 주기적으로 모니터링하고, 유지 마진 임계값 접근 시 MARGIN_WARNING 알림을 발행한다
- [x] **PERP-04**: MarginMonitor가 청산 가격 접근 시 LIQUIDATION_IMMINENT 경고를 발행하고, 임계값 근접 시 폴링 간격을 단축한다
- [x] **PERP-05**: PerpPolicyEvaluator가 max_leverage 초과 시 정책 거부 또는 APPROVAL 격상을 수행한다
- [x] **PERP-06**: PerpPolicyEvaluator가 max_position_usd 초과 시 APPROVAL 격상을 수행한다
- [x] **PERP-07**: PerpPolicyEvaluator가 allowed_markets 화이트리스트에 없는 시장 요청을 거부한다

### Drift Provider

- [ ] **DRIFT-01**: DriftPerpProvider가 IPerpProvider를 구현하여 open_position 액션으로 Drift 포지션을 개설한다
- [ ] **DRIFT-02**: DriftPerpProvider가 close_position 액션으로 포지션을 청산하며, percentage 파라미터로 부분 청산을 지원한다
- [ ] **DRIFT-03**: DriftPerpProvider가 modify_position 액션으로 포지션 크기 및 레버리지를 변경한다
- [ ] **DRIFT-04**: DriftPerpProvider가 add_margin/withdraw_margin 액션으로 마진을 추가/출금한다
- [x] **DRIFT-05**: DriftSdkWrapper가 @drift-labs/sdk를 래핑하여 DriftClient 초기화, 오더 빌딩, 포지션/마진 조회를 추상화한다
- [ ] **DRIFT-06**: DriftMarketData가 Drift 시장 목록, 펀딩 레이트, 오라클 가격, 오픈 인터레스트를 조회한다
- [x] **DRIFT-07**: DriftPerpProvider가 market/limit 주문 타입을 지원하며, limit 주문 시 limitPrice를 전달한다
- [x] **DRIFT-08**: DriftSdkWrapper가 @solana/web3.js 1.x와 @solana/kit 6.x 호환성을 격리하여 타입 변환을 처리한다

### Integration

- [ ] **INTG-01**: MCP 5개 도구(action_drift_open_position/close_position/modify_position/add_margin/withdraw_margin)가 mcpExpose=true로 자동 노출된다
- [ ] **INTG-02**: Admin Settings 5키(drift_enabled/drift_max_leverage/drift_max_position_usd/drift_margin_warning_threshold_pct/drift_position_sync_interval_sec)가 런타임 조정 가능하다
- [ ] **INTG-03**: Admin UI Actions 페이지에 Drift Perp Trading 카드가 표시되어 활성화 상태와 설정을 관리한다
- [ ] **INTG-04**: actions.skill.md에 Drift Perp Trading 섹션이 추가되어 REST/MCP/SDK 사용 예시를 제공한다
- [ ] **INTG-05**: TS/Python SDK에서 executeAction('open_position', { provider: 'drift', ... })으로 Drift Perp 액션을 실행할 수 있다
- [ ] **INTG-06**: GET /v1/wallets/:id/positions에서 Perp 포지션(category='PERP')이 Lending/Yield 포지션과 함께 통합 반환된다
- [ ] **INTG-07**: registerBuiltInProviders에서 DriftPerpProvider가 자동 등록되며, actions.drift_enabled 설정으로 활성화/비활성화된다

## Future Requirements

### Perp 확장

- **PERP-F01**: EVM Perp Provider (GMX/dYdX 등)
- **PERP-F02**: 고급 주문 유형 (TP/SL, 트레일링 스톱)
- **PERP-F03**: 포지션 헤징 전략 자동화
- **PERP-F04**: 펀딩 레이트 차익거래 전략 지원

## Out of Scope

| Feature | Reason |
|---------|--------|
| Drift Spot 거래 | Jupiter/0x로 이미 Spot 지원. Drift Spot은 유동성 제한적 |
| EVM Perp (GMX/dYdX) | Solana Perp 먼저 구현 후 확장 |
| 자동 트레이딩 전략 실행 | 프로바이더는 도구 제공만. 전략 실행은 에이전트 책임 |
| WebSocket 실시간 포지션 업데이트 | 1분 폴링으로 충분. WebSocket은 복잡성 대비 가치 낮음 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PERP-01 | Phase 297 | Complete |
| PERP-02 | Phase 297 | Complete |
| PERP-03 | Phase 297 | Complete |
| PERP-04 | Phase 297 | Complete |
| PERP-05 | Phase 297 | Complete |
| PERP-06 | Phase 297 | Complete |
| PERP-07 | Phase 297 | Complete |
| DRIFT-01 | Phase 298 | Pending |
| DRIFT-02 | Phase 298 | Pending |
| DRIFT-03 | Phase 298 | Pending |
| DRIFT-04 | Phase 298 | Pending |
| DRIFT-05 | Phase 298 | Complete |
| DRIFT-06 | Phase 298 | Pending |
| DRIFT-07 | Phase 298 | Complete |
| DRIFT-08 | Phase 298 | Complete |
| INTG-01 | Phase 299 | Pending |
| INTG-02 | Phase 299 | Pending |
| INTG-03 | Phase 299 | Pending |
| INTG-04 | Phase 299 | Pending |
| INTG-05 | Phase 299 | Pending |
| INTG-06 | Phase 299 | Pending |
| INTG-07 | Phase 299 | Pending |

**Coverage:**
- v29.8 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after roadmap creation (traceability updated)*
