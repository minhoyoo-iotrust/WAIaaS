# Requirements: WAIaaS v29.6 — Pendle Yield Trading + Yield 프레임워크

**Defined:** 2026-03-01
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v29.6. Each maps to roadmap phases.

### Yield Framework

- [ ] **YIELD-01**: IYieldProvider 인터페이스 정의 — IActionProvider 확장, getMarkets(chain)/getPosition(walletId)/getYieldForecast(marketId) 추가 메서드, 표준 액션(buyPT, buyYT, redeemPT, addLiquidity, removeLiquidity)
- [ ] **YIELD-02**: YieldPositionTracker — 월렛별 Yield 포지션 추적, positions 테이블(category=YIELD) + metadata JSON 활용(market_id, token_type[PT/YT/LP], entry_price, maturity, apy)
- [ ] **YIELD-03**: PositionStatusEnum에 MATURED 상태 추가 — DB CHECK 제약 조건 + Zod enum 동시 업데이트, DB migration
- [ ] **YIELD-04**: MaturityMonitor — 만기 7일/1일 전 경고 알림 발송, 만기 후 미상환 경고, 1일 1회 폴링, EventBus MATURITY_WARNING 이벤트
- [ ] **YIELD-05**: GET /v1/wallets/:id/positions에서 Yield 포지션(category=YIELD) 포함 반환 — Aave SUPPLY + Pendle PT 등 통합 포지션 목록

### Pendle Provider

- [ ] **PNDL-01**: PendleApiClient — Pendle REST API v2 래퍼, 시장 조회(/v1/markets/all) + Convert 엔드포인트(/v2/sdk/{chainId}/convert), Zod 응답 스키마 검증, 무료 티어(100 CU/분) 지원
- [ ] **PNDL-02**: PendleYieldProvider — IYieldProvider 구현체, 5개 액션(buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity), Convert API로 calldata 빌드 → ContractCallRequest 반환
- [ ] **PNDL-03**: buyPT 액션 — market+tokenIn+amountIn → Convert API(tokensIn/tokensOut) → ContractCallRequest 반환, PT 포지션 생성(만기 포함)
- [ ] **PNDL-04**: buyYT 액션 — market+tokenIn+amountIn → Convert API → ContractCallRequest 반환, YT 포지션 생성
- [ ] **PNDL-05**: redeemPT 액션 — 만기 도래 PT 상환, 만기 전 시도 시 시장 매도 경로 자동 감지(Convert API)
- [ ] **PNDL-06**: addLiquidity 액션 — Convert API 활용, LP 포지션 생성
- [ ] **PNDL-07**: removeLiquidity 액션 — Convert API 활용, LP 포지션 종료

### Integration

- [ ] **INTG-01**: MCP 도구 5개 자동 등록 — action_pendle_buy_pt/buy_yt/redeem_pt/add_liquidity/remove_liquidity (ActionProvider mcpExpose=true)
- [ ] **INTG-02**: Admin Settings 5개 — pendle_enabled, api_base_url, default_slippage_pct, maturity_warning_days, api_key (SettingsService SSoT)
- [ ] **INTG-03**: Admin UI Actions 페이지 Pendle Yield Trading 카드 추가 — 마켓 정보 표시
- [ ] **INTG-04**: actions.skill.md Pendle Yield Trading 섹션 추가 — REST/MCP/SDK 예시 포함, 보안 안내 포함
- [ ] **INTG-05**: registerBuiltInProviders에 PendleYieldProvider 등록 — 기본 활성화, Admin Settings로 비활성화 가능
- [ ] **INTG-06**: PositionTracker 통합 — Pendle 포지션 duck-type 자동 등록, HealthFactorMonitor 호환 (Yield는 HF 개념 없음, 만기 기반 모니터링)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Yield Extensions

- **YEXT-01**: 추가 Yield Provider — Morpho, EigenLayer 등
- **YEXT-02**: 자동 만기 상환 옵션(auto_redeem=true) — Admin Settings로 활성화
- **YEXT-03**: Yield 포트폴리오 대시보드 — Admin UI에서 전체 Yield 포지션 만기/수익률 시각화

## Out of Scope

| Feature | Reason |
|---------|--------|
| Pendle SDK 직접 사용 | REST API v2 Convert 엔드포인트로 충분, SDK 의존성 불필요 (DEC-1) |
| 7개 추가 체인 지원 (Optimism, BNB, Mantle 등) | Ethereum/Arbitrum/Base 3개 체인에 주요 유동성 집중, 나머지는 config로 추후 활성화 가능 (DEC-4) |
| PT/YT 가격 오라클 통합 | 기존 IPriceOracle이 PT/YT를 native 지원하지 않음, 별도 마일스톤에서 처리 |
| 실시간 수익률 모니터링 | 1일 1회 폴링으로 충분, 실시간 WebSocket 불필요 (DEC-3) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| YIELD-01 | Phase 288 | Pending |
| YIELD-02 | Phase 288 | Pending |
| YIELD-03 | Phase 288 | Pending |
| YIELD-04 | Phase 290 | Pending |
| YIELD-05 | Phase 288 | Pending |
| PNDL-01 | Phase 289 | Pending |
| PNDL-02 | Phase 289 | Pending |
| PNDL-03 | Phase 289 | Pending |
| PNDL-04 | Phase 289 | Pending |
| PNDL-05 | Phase 289 | Pending |
| PNDL-06 | Phase 289 | Pending |
| PNDL-07 | Phase 289 | Pending |
| INTG-01 | Phase 290 | Pending |
| INTG-02 | Phase 290 | Pending |
| INTG-03 | Phase 290 | Pending |
| INTG-04 | Phase 290 | Pending |
| INTG-05 | Phase 290 | Pending |
| INTG-06 | Phase 290 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after roadmap creation — all 18 requirements mapped to phases 288-290*
