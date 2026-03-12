# Requirements: WAIaaS v31.13 — DeFi 포지션 대시보드 완성

**Defined:** 2026-03-12
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v31.13 Requirements

미구현 5개 DeFi 프로바이더의 `getPositions()` 로직을 구현하고 Admin Dashboard UX를 개선한다.

### Staking

- [x] **STAK-01**: Lido `LidoStakingActionProvider`에 `IPositionProvider` 구현, stETH/wstETH 잔액 → STAKING 포지션 반환 (CAIP-19 assetId, USD 환산)
- [x] **STAK-02**: wstETH → stETH 환산 비율 반영 (래핑 토큰이므로 실제 스테이킹 수량 계산)
- [x] **STAK-03**: Jito `JitoStakingActionProvider`에 `IPositionProvider` 구현, jitoSOL 잔액 → STAKING 포지션 반환 (CAIP-19 assetId, USD 환산)
- [x] **STAK-04**: jitoSOL → SOL 환산 비율 반영 (실제 스테이킹 SOL 수량 계산)
- [x] **STAK-05**: Lido/Jito PositionTracker 자동 등록 (duck-type 감지: `getPositions` + `getSupportedCategories` + `getProviderName`)

### Lending

- [x] **LEND-01**: Aave V3 Supply 포지션 추출 — aToken 잔액 조회, `metadata.positionType: 'SUPPLY'`, APY 포함
- [x] **LEND-02**: Aave V3 Borrow 포지션 추출 — debtToken(variableDebt/stableDebt) 잔액 조회, `metadata.positionType: 'BORROW'`, interestRateMode 포함
- [x] **LEND-03**: Health Factor 계산 — Aave Pool `getUserAccountData()` 호출 → `metadata.healthFactor` 포함
- [x] **LEND-04**: Aave Oracle 가격 활용 — `getAssetPrice()` 호출로 USD 환산 (별도 가격 오라클 호출 최소화)

### Yield

- [ ] **YIELD-01**: Pendle PT(Principal Token) 잔액 조회 → YIELD 포지션 반환 (`metadata.tokenType: 'PT'`, maturity, underlyingAsset, impliedApy)
- [ ] **YIELD-02**: Pendle YT(Yield Token) 잔액 조회 → YIELD 포지션 반환 (`metadata.tokenType: 'YT'`, maturity, underlyingAsset, impliedApy)
- [ ] **YIELD-03**: 만기 정보 포함 — 만기일 경과 시 `status: 'MATURED'` 자동 전환

### Perp

- [ ] **PERP-01**: `HyperliquidPerpProvider`에 `IPositionProvider` 인터페이스 신규 구현
- [ ] **PERP-02**: `getPositions()` 신규 작성 — Hyperliquid Info API로 오픈 포지션 조회 (`metadata`: market, side, entryPrice, markPrice, leverage, unrealizedPnl, liquidationPrice, marginUsed)
- [ ] **PERP-03**: `HyperliquidSpotProvider`에 `IPositionProvider` 인터페이스 신규 구현 (spot 잔액 포지션)
- [ ] **PERP-04**: Hyperliquid PositionTracker 자동 등록 (duck-type 감지)

### Dashboard

- [ ] **DASH-01**: 카테고리별 필터 탭 — STAKING / LENDING / YIELD / PERP / ALL
- [ ] **DASH-02**: 프로바이더별 그룹핑 — 같은 프로바이더 포지션을 묶어서 표시
- [ ] **DASH-03**: 카테고리별 맞춤 포지션 상세 UI (STAKING: 프로토콜+APR, LENDING: Supply/Borrow+HF, YIELD: PT/YT+만기+APY, PERP: Long/Short+PnL+청산가)
- [ ] **DASH-04**: Health Factor 글로벌 경고 배너 — worst health factor가 임계값 미만일 때 대시보드 상단 경고
- [ ] **DASH-05**: 지갑별 필터 — 특정 지갑의 DeFi 포지션만 조회
- [ ] **DASH-06**: 30초 자동 새로고침 (기존 대시보드 패턴 유지)

### Test

- [ ] **TEST-01**: 각 프로바이더 `getPositions()` 단위 테스트 (모킹된 RPC/API 응답 기반)
- [ ] **TEST-02**: PositionTracker 통합 테스트 — 신규 프로바이더 등록 후 동기화 확인
- [ ] **TEST-03**: Admin API 테스트 — 카테고리별 필터링, 집계 정확성
- [ ] **TEST-04**: Admin UI 컴포넌트 테스트 — 필터 탭, 그룹핑, 경고 배너

## Out of Scope

| Feature | Reason |
|---------|--------|
| DB 마이그레이션 | 기존 defi_positions 테이블로 충분 |
| 새 API 엔드포인트 | 기존 `/v1/admin/defi/positions`로 충분 |
| 통합 가격 오라클 서비스 | 각 프로바이더 내부 가격 소스 사용 |
| DCent Swap/Across/LI.FI 포지션 | 스왑/브릿지는 일회성 거래, 지속 포지션 아님 |
| MCP/SDK 포지션 조회 확장 | 기존 세션 API `/v1/wallet/positions` 이미 존재 |
| 알림 연동 (HF 경고 푸시) | Dashboard 표시만 범위 내 |
| Drift 포지션 | 이미 구현 완료 + PositionTracker 연결됨 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STAK-01 | Phase 393 | Complete |
| STAK-02 | Phase 393 | Complete |
| STAK-03 | Phase 393 | Complete |
| STAK-04 | Phase 393 | Complete |
| STAK-05 | Phase 393 | Complete |
| LEND-01 | Phase 394 | Complete |
| LEND-02 | Phase 394 | Complete |
| LEND-03 | Phase 394 | Complete |
| LEND-04 | Phase 394 | Complete |
| YIELD-01 | Phase 395 | Pending |
| YIELD-02 | Phase 395 | Pending |
| YIELD-03 | Phase 395 | Pending |
| PERP-01 | Phase 396 | Pending |
| PERP-02 | Phase 396 | Pending |
| PERP-03 | Phase 396 | Pending |
| PERP-04 | Phase 396 | Pending |
| DASH-01 | Phase 397 | Pending |
| DASH-02 | Phase 397 | Pending |
| DASH-03 | Phase 397 | Pending |
| DASH-04 | Phase 397 | Pending |
| DASH-05 | Phase 397 | Pending |
| DASH-06 | Phase 397 | Pending |
| TEST-01 | Phase 393-396 | Pending |
| TEST-02 | Phase 393-396 | Pending |
| TEST-03 | Phase 397 | Pending |
| TEST-04 | Phase 397 | Pending |

**Coverage:**
- v31.13 requirements: 27 total
- Mapped to phases: 27/27
- Unmapped: 0

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 after roadmap creation*
