# Requirements: WAIaaS v31.9 Polymarket 예측 시장 통합

**Defined:** 2026-03-11
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for v31.9 milestone. Each maps to roadmap phases.

### Design & Research

- [x] **DSGN-01**: Polymarket CLOB API, CTF 컨트랙트, Proxy Wallet, Neg Risk 심층 리서치 완료
- [x] **DSGN-02**: EIP-712 3개 도메인(ClobAuth, CTF Exchange, Neg Risk Exchange) 서명 구조 설계
- [x] **DSGN-03**: Hyperliquid EIP-712 패턴과 공통 추상화 범위 분석 및 결정
- [x] **DSGN-04**: 설계 문서 doc 80 (Polymarket 예측 시장 통합) 작성

### CLOB Trading

- [x] **CLOB-01**: User can create Polymarket API Key (EIP-712 L1 서명 기반, 지갑별 자격증명 저장)
- [x] **CLOB-02**: User can place GTC limit order (EIP-712 Order 서명 → CLOB API 제출)
- [x] **CLOB-03**: User can place FOK market order (즉시 체결, 미체결 시 취소)
- [x] **CLOB-04**: User can cancel active order
- [x] **CLOB-05**: User can query order status and history
- [x] **CLOB-06**: User can view orderbook (bid/ask, spread, depth)
- [x] **CLOB-07**: User can place GTD timed limit order (만료 시간 지정)
- [ ] **CLOB-08**: User can place FAK partial fill order
- [ ] **CLOB-09**: User can submit batch orders (다중 주문 일괄 제출)
- [x] **CLOB-10**: USDC approve to CTF Exchange / Neg Risk CTF Exchange 컨트랙트
- [x] **CLOB-11**: Neg Risk 시장 vs 바이너리 시장 자동 라우팅

### Market Discovery

- [x] **MRKT-01**: User can browse active markets (카테고리/상태/유동성 필터)
- [x] **MRKT-02**: User can view market details (설명, 아웃컴, 가격, 거래량, 해결 기한)
- [x] **MRKT-03**: User can search markets by keyword

### Position & Settlement

- [x] **SETL-01**: User can view positions (보유 토큰, 평균 진입가, 현재 가치, PnL)
- [x] **SETL-02**: User can redeem winning tokens after market resolution (CTF 온체인 리딤)
- [x] **SETL-03**: User can track market resolution status
- [x] **SETL-04**: User receives notification when market resolves (자동 리딤 제안 포함)
- [x] **SETL-05**: PnL calculation for open and closed positions

### Integration

- [x] **INTG-01**: Admin Settings에 Polymarket API Key/Secret 설정 항목 추가
- [x] **INTG-02**: MCP 도구 (주문/마켓/포지션/리딤 등)
- [x] **INTG-03**: TypeScript/Python SDK 메서드 추가
- [x] **INTG-04**: Admin UI 예측 시장 탭 (포지션, 마켓, 주문 내역)
- [x] **INTG-05**: 정책 엔진 연동 (지출 한도, 마켓 거래 허용, Polygon 네트워크 검증)
- [x] **INTG-06**: DB 마이그레이션 (polymarket_orders, polymarket_api_keys 테이블)
- [x] **INTG-07**: connect-info polymarket capability 확장
- [ ] **INTG-08**: E2E 스모크 시나리오 등록 (오프체인 CLOB 플로우)
- [ ] **INTG-09**: Agent UAT 시나리오 작성 (6-section 포맷, DeFi 카테고리)
- [x] **INTG-10**: Skill 파일 업데이트/생성

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Trading

- **ADVT-01**: WebSocket 실시간 가격/주문 업데이트 피드
- **ADVT-02**: Smart Account (ERC-4337) signatureType=2 Polymarket 지원
- **ADVT-03**: 자동 리딤 실행 (마켓 해결 감지 → 자동 CTF redeemPositions)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Proxy Wallet 생성/관리 | EOA signatureType=0으로 충분, 프로그래밍 API 접근에서는 불필요 |
| Polymarket 웹 UI 연동 | 자체 Admin UI + MCP/SDK로 충분 |
| 다른 예측 시장 프로토콜 (Azuro 등) | Polymarket 집중, 추후 확장 가능 |
| 마켓 생성/해결 | Polymarket 자체 기능, WAIaaS는 거래자 관점만 |
| Polygon 외 네트워크 지원 | Polymarket은 Polygon 전용 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DSGN-01 | Phase 370 | Complete |
| DSGN-02 | Phase 370 | Complete |
| DSGN-03 | Phase 370 | Complete |
| DSGN-04 | Phase 370 | Complete |
| CLOB-01 | Phase 371 | Complete |
| CLOB-02 | Phase 371 | Complete |
| CLOB-03 | Phase 371 | Complete |
| CLOB-04 | Phase 371 | Complete |
| CLOB-05 | Phase 371 | Complete |
| CLOB-06 | Phase 371 | Complete |
| CLOB-07 | Phase 371 | Complete |
| CLOB-08 | Phase 371 | Pending |
| CLOB-09 | Phase 371 | Pending |
| CLOB-10 | Phase 371 | Complete |
| CLOB-11 | Phase 371 | Complete |
| MRKT-01 | Phase 372 | Complete |
| MRKT-02 | Phase 372 | Complete |
| MRKT-03 | Phase 372 | Complete |
| SETL-01 | Phase 372 | Complete |
| SETL-02 | Phase 372 | Complete |
| SETL-03 | Phase 372 | Complete |
| SETL-04 | Phase 372 | Complete |
| SETL-05 | Phase 372 | Complete |
| INTG-01 | Phase 373 | Complete |
| INTG-02 | Phase 373 | Complete |
| INTG-03 | Phase 373 | Complete |
| INTG-04 | Phase 373 | Complete |
| INTG-05 | Phase 373 | Complete |
| INTG-06 | Phase 371 | Complete |
| INTG-07 | Phase 373 | Complete |
| INTG-08 | Phase 374 | Pending |
| INTG-09 | Phase 374 | Pending |
| INTG-10 | Phase 373 | Complete |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after initial definition*
