# Requirements: WAIaaS v1.5

**Defined:** 2026-02-15
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1.5 Requirements

USD 기준 정책 평가가 동작하고, Action Provider 프레임워크가 구축되어 DeFi 프로토콜 플러그인을 추가할 수 있는 상태.

### Oracle Core (ORACL)

- [ ] **ORACL-01**: IPriceOracle 인터페이스가 getPrice/getPrices/getNativePrice/getCacheStats 4개 메서드를 정의한다
- [ ] **ORACL-02**: PythOracle이 Pyth Hermes REST API로 Zero-config 가격 조회를 수행한다
- [ ] **ORACL-03**: CoinGeckoOracle이 CoinGecko Demo API로 opt-in 롱테일 토큰 가격을 조회한다
- [ ] **ORACL-04**: OracleChain이 Pyth→CoinGecko 2단계 fallback으로 가격을 제공한다
- [ ] **ORACL-05**: InMemoryPriceCache가 5분 TTL LRU 128항목으로 가격을 캐싱한다
- [ ] **ORACL-06**: classifyPriceAge가 FRESH/AGING/STALE 3단계로 가격 나이를 판정한다
- [ ] **ORACL-07**: OracleChain이 CoinGecko 키 설정 시 교차 검증으로 편차>5% 가격을 STALE로 격하한다
- [ ] **ORACL-08**: GET /v1/admin/oracle-status가 오라클 캐시 통계와 소스별 상태를 반환한다

### USD 정책 (USDPL)

- [ ] **USDPL-01**: resolveEffectiveAmountUsd가 5-type 트랜잭션의 금액을 USD로 환산한다
- [ ] **USDPL-02**: SpendingLimitRuleSchema가 Zod SSoT로 instant_max_usd/notify_max_usd/delay_max_usd 필드를 검증한다
- [ ] **USDPL-03**: PriceResult가 success/oracleDown/notListed 3-state discriminated union으로 결과를 구분한다
- [ ] **USDPL-04**: 가격 불명 토큰 전송 시 최소 NOTIFY로 격상하고 UNLISTED_TOKEN_TRANSFER 감사 로그를 기록한다
- [ ] **USDPL-05**: 오라클 장애 시 네이티브 금액만으로 정책 평가를 계속한다 (graceful fallback)
- [ ] **USDPL-06**: 가격 불명 토큰 + CoinGecko 키 미설정 시 최초 1회 키 안내 힌트를 포함한다

### Action Provider (ACTNP)

- [ ] **ACTNP-01**: IActionProvider 인터페이스가 metadata/actions/resolve 3개 메서드를 정의한다
- [ ] **ACTNP-02**: ActionProviderRegistry가 ~/.waiaas/actions/에서 ESM 플러그인을 발견/로드/검증한다
- [ ] **ACTNP-03**: resolve() 반환값을 ContractCallRequestSchema로 Zod 검증하여 정책 우회를 차단한다
- [ ] **ACTNP-04**: POST /v1/actions/:provider/:action이 Action Provider resolve → 파이프라인 실행한다
- [ ] **ACTNP-05**: ActionDefinition→MCP Tool 자동 변환으로 mcpExpose=true 프로바이더가 MCP에 노출된다
- [ ] **ACTNP-06**: 프로바이더 등록/해제 시 MCP 도구가 동적으로 추가/제거된다

### API 키 관리 (APIKY)

- [ ] **APIKY-01**: api_keys 테이블이 프로바이더별 API 키를 DB 암호화 저장한다 (DB v11 마이그레이션)
- [ ] **APIKY-02**: GET/PUT/DELETE /v1/admin/api-keys API가 키 CRUD를 수행한다 (조회 시 마스킹)
- [ ] **APIKY-03**: requiresApiKey=true 프로바이더가 키 미설정 시 액션을 비활성화하고 안내를 반환한다
- [ ] **APIKY-04**: Admin UI API Keys 섹션에서 프로바이더별 키를 설정/수정/삭제한다

### 설계 문서 수정 (DSGN)

- [ ] **DSGN-01**: 설계 문서 61을 Pyth Primary + CoinGecko Fallback + Chainlink 제거로 수정한다
- [ ] **DSGN-02**: 설계 문서 62를 MCP 16개 상한 제거 + 기존 14개 도구 현행화로 수정한다
- [ ] **DSGN-03**: 설계 문서 38을 MCP 상한 제거 + 현행화로 수정한다

### Skill 파일 (SKIL)

- [ ] **SKIL-01**: admin.skill.md에 oracle-status, api-keys 엔드포인트를 추가한다
- [ ] **SKIL-02**: actions.skill.md를 신규 생성하여 Action Provider REST API를 문서화한다

## Future Requirements

### DeFi 프로토콜 연동

- **SWAP-01**: Jupiter Swap Action Provider가 Solana 토큰 스왑을 수행한다
- **SWAP-02**: 0x Swap Action Provider가 EVM 토큰 스왑을 수행한다
- **BRIDGE-01**: LiFi 크로스체인 브릿지 Action Provider
- **STAKE-01**: Liquid Staking Action Provider (Lido, Marinade)

### 표시 통화

- **DISP-01**: Admin UI에서 USD 외 표시 통화(KRW, EUR 등) 선택

## Out of Scope

| Feature | Reason |
|---------|--------|
| Jupiter Swap 구현 | v1.5.5에서 별도 구현 -- v1.5는 프레임워크만 |
| 0x EVM Swap 구현 | v1.5.6에서 별도 구현 |
| Chainlink Oracle | EVM 전용으로 커버리지 편향, Pyth가 380+ 피드로 충분 |
| VM 격리 (플러그인 샌드박스) | validate-then-trust로 v1.5 충분, 향후 검토 |
| 플러그인 핫 리로드 | ESM 캐시 제약, 데몬 재시작으로 대체 |
| 온체인 가격 피드 직접 호출 | Hermes REST API가 더 단순하고 체인 무관 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ORACL-01 | Phase 125 | Pending |
| ORACL-02 | Phase 126 | Pending |
| ORACL-03 | Phase 126 | Pending |
| ORACL-04 | Phase 126 | Pending |
| ORACL-05 | Phase 125 | Pending |
| ORACL-06 | Phase 125 | Pending |
| ORACL-07 | Phase 126 | Pending |
| ORACL-08 | Phase 126 | Pending |
| USDPL-01 | Phase 127 | Pending |
| USDPL-02 | Phase 127 | Pending |
| USDPL-03 | Phase 127 | Pending |
| USDPL-04 | Phase 127 | Pending |
| USDPL-05 | Phase 127 | Pending |
| USDPL-06 | Phase 127 | Pending |
| ACTNP-01 | Phase 128 | Pending |
| ACTNP-02 | Phase 128 | Pending |
| ACTNP-03 | Phase 128 | Pending |
| ACTNP-04 | Phase 128 | Pending |
| ACTNP-05 | Phase 129 | Pending |
| ACTNP-06 | Phase 129 | Pending |
| APIKY-01 | Phase 128 | Pending |
| APIKY-02 | Phase 128 | Pending |
| APIKY-03 | Phase 128 | Pending |
| APIKY-04 | Phase 128 | Pending |
| DSGN-01 | Phase 125 | Pending |
| DSGN-02 | Phase 125 | Pending |
| DSGN-03 | Phase 125 | Pending |
| SKIL-01 | Phase 129 | Pending |
| SKIL-02 | Phase 129 | Pending |

**Coverage:**
- v1.5 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-02-15*
*Last updated: 2026-02-15 after roadmap creation*
