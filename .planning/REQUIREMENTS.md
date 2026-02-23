# Requirements: WAIaaS v28.1 Jupiter Swap

**Defined:** 2026-02-23
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v28.1. Each maps to roadmap phases.

### Core Swap

- [x] **SWAP-01**: JupiterApiClient가 Quote API v1(GET /swap/v1/quote)을 호출하여 최적 경로, outAmount, priceImpactPct를 반환한다
- [x] **SWAP-02**: JupiterApiClient가 /swap-instructions API(POST /swap/v1/swap-instructions)를 호출하여 개별 instruction(swapInstruction, computeBudgetInstructions, setupInstructions)을 반환한다
- [x] **SWAP-03**: JupiterSwapActionProvider.resolve()가 swapInstruction을 ContractCallRequest(programId/instructionData/accounts)로 변환한다
- [x] **SWAP-04**: Jupiter API 응답(QuoteResponse, SwapInstructionsResponse)을 Zod 스키마로 런타임 검증하여 API drift를 조기 감지한다
- [x] **SWAP-05**: swapInstruction.programId가 Jupiter 프로그램 주소(JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4)와 일치하는지 검증한다
- [x] **SWAP-06**: Quote API 호출 시 restrictIntermediateTokens=true로 안전한 중간 토큰만 라우팅한다

### Safety & Protection

- [x] **SAFE-01**: 슬리피지 기본 50bps(0.5%) 적용, config.toml [actions.jupiter_swap] default_slippage_bps로 오버라이드 가능
- [x] **SAFE-02**: 슬리피지 상한 500bps(5%) 적용 — 사용자 요청이 상한 초과 시 상한으로 클램프
- [x] **SAFE-03**: priceImpactPct가 config 상한(기본 1.0%) 초과 시 PRICE_IMPACT_TOO_HIGH 에러로 거부한다
- [x] **SAFE-04**: Jito MEV 보호 tip(기본 1000 lamports)을 /swap-instructions 요청의 prioritizationFeeLamports.jitoTipLamports에 포함한다
- [x] **SAFE-05**: inputMint === outputMint 동일 토큰 스왑 요청을 사전 차단한다

### Policy Integration

- [ ] **PLCY-01**: CONTRACT_WHITELIST에 Jupiter 프로그램 주소 미등록 시 기존 정책 엔진이 거부한다
- [ ] **PLCY-02**: 스왑 입력 금액을 기존 IPriceOracle로 USD 환산하여 SPENDING_LIMIT 정책을 평가한다

### Developer Experience

- [ ] **DX-01**: MCP에 jupiter_swap 도구가 자동 노출된다 (mcpExpose=true, ActionProviderRegistry → MCP Tool 자동 변환)
- [ ] **DX-02**: config.toml [actions.jupiter_swap] 섹션으로 enabled/api_base_url/default_slippage_bps/max_slippage_bps/max_price_impact_pct/jito_tip_lamports/request_timeout_ms를 오버라이드한다
- [ ] **DX-03**: 데몬 시작 시 JupiterSwapActionProvider가 내장 프로바이더로 자동 등록된다 (ActionProviderRegistry.register)
- [ ] **DX-04**: transactions.skill.md에 Jupiter Swap 사용법(REST API, MCP, SDK 예시)을 문서화한다

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Extended Swap

- **XSWAP-01**: Jupiter DCA(Dollar Cost Averaging) Action Provider
- **XSWAP-02**: Jupiter Limit Order Action Provider
- **XSWAP-03**: /swap fallback 경로 (swap-instructions 장애 시 직렬화 트랜잭션 역직렬화)

### EVM DEX

- **EVMDEX-01**: Uniswap V3 Action Provider (EVM DEX swap)
- **EVMDEX-02**: 1inch Aggregator Action Provider

## Out of Scope

| Feature | Reason |
|---------|--------|
| Jupiter SDK (@jup-ag/api) 사용 | native fetch로 2개 엔드포인트 충분. 불필요한 의존성 증가 |
| /swap 엔드포인트 사용 | 직렬화된 전체 트랜잭션 반환 — ContractCallRequest 변환 불가 |
| dynamicSlippage 사용 | Jupiter 서버 측 슬리피지 조절 — 정책 엔진 우회 가능성 |
| Token symbol 입력 지원 | 동명 토큰 충돌 위험. Mint address(Base58)만 허용 |
| Route visualization (Admin UI) | m28-01 스코프 외. 향후 확장 가능 |
| Jito block engine 직접 전송 | Jupiter API가 jitoTipLamports로 내부 처리 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SWAP-01 | Phase 246 | Done |
| SWAP-02 | Phase 246 | Done |
| SWAP-03 | Phase 246 | Done |
| SWAP-04 | Phase 246 | Done |
| SWAP-05 | Phase 246 | Done |
| SWAP-06 | Phase 246 | Done |
| SAFE-01 | Phase 246 | Done |
| SAFE-02 | Phase 246 | Done |
| SAFE-03 | Phase 246 | Done |
| SAFE-04 | Phase 246 | Done |
| SAFE-05 | Phase 246 | Done |
| PLCY-01 | Phase 247 | Pending |
| PLCY-02 | Phase 247 | Pending |
| DX-01 | Phase 247 | Pending |
| DX-02 | Phase 247 | Pending |
| DX-03 | Phase 247 | Pending |
| DX-04 | Phase 247 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after roadmap creation*
