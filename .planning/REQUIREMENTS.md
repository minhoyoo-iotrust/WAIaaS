# Requirements: WAIaaS v31.3 DCent Swap Aggregator 통합

**Defined:** 2026-03-06
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다

## v31.3 Requirements

Requirements for DCent Swap Aggregator integration. Each maps to roadmap phases.

### Research & Design (RSRCH)

- [x] **RSRCH-01**: DCent Swap API 엔드포인트 7개의 응답 구조를 심층 리서치하고 WAIaaS 통합 설계 문서를 작성한다
- [x] **RSRCH-02**: CAIP-19 자산 식별자 ↔ DCent Currency ID 양방향 변환 매핑 전략을 설계한다
- [x] **RSRCH-03**: Exchange(payInAddress) 플로우 → WAIaaS TRANSFER 파이프라인 매핑을 설계한다
- [x] **RSRCH-04**: DEX Swap(txdata) 플로우 → WAIaaS CONTRACT_CALL + BATCH 파이프라인 매핑을 설계한다
- [x] **RSRCH-05**: DCent API의 multi-hop 자체 지원 여부를 검증하여 Phase 3(자동 라우팅) 범위를 확정한다
- [x] **RSRCH-06**: DcentSwapActionProvider 인터페이스와 MCP/SDK/정책 통합 설계를 완성한다

### Currency Mapping (CMAP)

- [ ] **CMAP-01**: CAIP-19 → DCent Currency ID 변환 함수를 구현한다 (eip155:1/erc20:0x... → ERC20/0x...)
- [ ] **CMAP-02**: DCent Currency ID → CAIP-19 역방향 변환 함수를 구현한다
- [ ] **CMAP-03**: 네이티브 토큰 매핑을 지원한다 (ETHEREUM ↔ eip155:1/slip44:60, SOLANA ↔ solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501 등)
- [ ] **CMAP-04**: DCent get_supported_currencies 응답을 조회하고 24h TTL로 캐싱한다

### DEX Swap (DSWP)

- [ ] **DSWP-01**: User can request DEX swap quotes from DCent API and see provider-by-provider comparison
- [ ] **DSWP-02**: User can execute DEX swap via approve + txdata BATCH pipeline (ERC20 approve calldata + swap txdata)
- [ ] **DSWP-03**: Swap execution validates amount against min/max limits from quote
- [ ] **DSWP-04**: User receives optimal quote recommendation based on rate, fee, and estimatedTime

### Exchange (XCHG)

- [ ] **XCHG-01**: User can request exchange quotes for cross-chain swaps from DCent API
- [ ] **XCHG-02**: User can execute exchange via create_exchange_transaction → payInAddress TRANSFER pipeline
- [ ] **XCHG-03**: Exchange transaction status is tracked via get_transactions_status polling
- [ ] **XCHG-04**: User is notified of exchange completion/failure via notification channels

### Auto Routing (ROUT)

- [ ] **ROUT-01**: 직접 경로 없는 페어에 대해 중간 토큰 후보를 선정한다 (ETH, USDC, USDT 등)
- [ ] **ROUT-02**: 2-hop 경로를 탐색하고 총 비용(수수료 + 슬리피지 누적)을 계산한다
- [ ] **ROUT-03**: 최적 2-hop 경로를 BATCH 파이프라인으로 순차 실행한다
- [ ] **ROUT-04**: 부분 실패 처리 시 중간 토큰 잔액을 사용자에게 안내한다
- [ ] **ROUT-05**: 2-hop 경로임을 명시하여 수수료 투명성을 보장한다

### Integration (INTG)

- [ ] **INTG-01**: DcentSwapActionProvider를 IActionProvider 패턴으로 구현한다
- [ ] **INTG-02**: MCP 도구를 노출한다 (dcent_get_quotes, dcent_swap, dcent_exchange, dcent_swap_status)
- [ ] **INTG-03**: SDK 메서드를 추가한다 (getDcentQuotes, dcentSwap, dcentExchange, getDcentSwapStatus)
- [ ] **INTG-04**: 정책 엔진과 통합한다 (스왑 한도, CONTRACT_WHITELIST, ALLOWED_TOKENS)
- [ ] **INTG-05**: Admin Settings에 DCent Swap 설정 키를 추가한다 (dcent_swap.enabled, dcent_swap.api_url 등)
- [ ] **INTG-06**: connect-info에 dcent_swap capability를 노출한다
- [ ] **INTG-07**: 스킬 파일을 업데이트한다 (transactions.skill.md 등)

### Testing (TEST)

- [ ] **TEST-01**: Currency ID 변환 (CAIP-19 ↔ DCent) 양방향 단위 테스트를 작성한다
- [ ] **TEST-02**: Mock API 기반 DEX Swap 플로우 (approve + txdata) 통합 테스트를 작성한다
- [ ] **TEST-03**: Mock API 기반 Exchange 플로우 (payInAddress → TRANSFER) 통합 테스트를 작성한다
- [ ] **TEST-04**: 자동 라우팅 경로 탐색/실행 테스트를 작성한다 (ROUT phase 구현 시)
- [ ] **TEST-05**: 에러 핸들링 테스트를 작성한다 (empty providers, min/max amount, rate expired, insufficient liquidity)
- [ ] **TEST-06**: 정책 엔진 연동 (스왑 한도) 테스트를 작성한다
- [ ] **TEST-07**: MCP 도구 + SDK 메서드 통합 테스트를 작성한다

## Future Requirements

### Admin UI

- **ADMIN-01**: Admin UI에 DCent Swap 대시보드 추가 (스왑 이력, 프로바이더 통계)
- **ADMIN-02**: Admin UI에 Currency ID 매핑 관리 UI 추가

## Out of Scope

| Feature | Reason |
|---------|--------|
| DCent Swap 이외 aggregator (1inch, Paraswap) | DCent 단일 통합으로 다중 프로바이더 커버 |
| Fiat on/off ramp | DCent Swap은 crypto-to-crypto만 |
| DCent 하드웨어 지갑 직접 통합 | 이미 v29.7에서 D'CENT 서명 지원 완료 |
| 실시간 WebSocket 상태 스트리밍 | 폴링 방식으로 충분 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RSRCH-01 | Phase 342 | Complete |
| RSRCH-02 | Phase 342 | Complete |
| RSRCH-03 | Phase 342 | Complete |
| RSRCH-04 | Phase 342 | Complete |
| RSRCH-05 | Phase 342 | Complete |
| RSRCH-06 | Phase 342 | Complete |
| CMAP-01 | Phase 343 | Pending |
| CMAP-02 | Phase 343 | Pending |
| CMAP-03 | Phase 343 | Pending |
| CMAP-04 | Phase 343 | Pending |
| DSWP-01 | Phase 343 | Pending |
| DSWP-02 | Phase 343 | Pending |
| DSWP-03 | Phase 343 | Pending |
| DSWP-04 | Phase 343 | Pending |
| XCHG-01 | Phase 344 | Pending |
| XCHG-02 | Phase 344 | Pending |
| XCHG-03 | Phase 344 | Pending |
| XCHG-04 | Phase 344 | Pending |
| ROUT-01 | Phase 345 | Pending |
| ROUT-02 | Phase 345 | Pending |
| ROUT-03 | Phase 345 | Pending |
| ROUT-04 | Phase 345 | Pending |
| ROUT-05 | Phase 345 | Pending |
| INTG-01 | Phase 346 | Pending |
| INTG-02 | Phase 346 | Pending |
| INTG-03 | Phase 346 | Pending |
| INTG-04 | Phase 346 | Pending |
| INTG-05 | Phase 346 | Pending |
| INTG-06 | Phase 346 | Pending |
| INTG-07 | Phase 346 | Pending |
| TEST-01 | Phase 346 | Pending |
| TEST-02 | Phase 346 | Pending |
| TEST-03 | Phase 346 | Pending |
| TEST-04 | Phase 346 | Pending |
| TEST-05 | Phase 346 | Pending |
| TEST-06 | Phase 346 | Pending |
| TEST-07 | Phase 346 | Pending |

**Coverage:**
- v31.3 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0

---
*Requirements defined: 2026-03-06*
*Last updated: 2026-03-06 after roadmap creation*
