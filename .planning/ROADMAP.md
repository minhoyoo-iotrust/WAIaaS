# Roadmap: WAIaaS

## Milestones

- ✅ **v1.4.6 멀티체인 월렛 구현** -- Phases 109-114 (shipped 2026-02-14)
- ✅ **v1.4.7 임의 트랜잭션 서명 API** -- Phases 115-119 (shipped 2026-02-15)
- ✅ **v1.4.8 Admin DX + 알림 개선** -- Phases 120-124 (shipped 2026-02-15)
- **v1.5 DeFi Price Oracle + Action Provider Framework** -- Phases 125-129 (in progress)

## Phases

<details>
<summary>v1.4.6 멀티체인 월렛 구현 (Phases 109-114) -- SHIPPED 2026-02-14</summary>

- [x] Phase 109: DB 마이그레이션 + 환경 모델 SSoT (2/2 plans) -- completed 2026-02-14
- [x] Phase 110: 스키마 전환 + 정책 엔진 (2/2 plans) -- completed 2026-02-14
- [x] Phase 111: 파이프라인 네트워크 해결 (2/2 plans) -- completed 2026-02-14
- [x] Phase 112: REST API 네트워크 확장 (2/2 plans) -- completed 2026-02-14
- [x] Phase 113: MCP + SDK + Admin UI (3/3 plans) -- completed 2026-02-14
- [x] Phase 114: CLI Quickstart + DX 통합 (2/2 plans) -- completed 2026-02-14

</details>

<details>
<summary>v1.4.7 임의 트랜잭션 서명 API (Phases 115-119) -- SHIPPED 2026-02-15</summary>

- [x] Phase 115: Core Types + DB Migration + Parsers (3/3 plans) -- completed 2026-02-15
- [x] Phase 116: Default Deny Toggles (2/2 plans) -- completed 2026-02-15
- [x] Phase 117: Sign-Only Pipeline + REST API (2/2 plans) -- completed 2026-02-15
- [x] Phase 118: EVM Calldata Encoding (2/2 plans) -- completed 2026-02-15
- [x] Phase 119: SDK + MCP + Notifications + Skill Resources (3/3 plans) -- completed 2026-02-15

</details>

<details>
<summary>v1.4.8 Admin DX + 알림 개선 (Phases 120-124) -- SHIPPED 2026-02-15</summary>

- [x] Phase 120: DB 마이그레이션 안정성 (1/1 plans) -- completed 2026-02-15
- [x] Phase 121: MCP 안정성 (1/1 plans) -- completed 2026-02-15
- [x] Phase 122: MCP 도구 + 멀티체인 DX (2/2 plans) -- completed 2026-02-15
- [x] Phase 123: Admin UI 개선 (2/2 plans) -- completed 2026-02-15
- [x] Phase 124: 알림 시스템 개선 (2/2 plans) -- completed 2026-02-15

</details>

### v1.5 DeFi Price Oracle + Action Provider Framework (In Progress)

**Milestone Goal:** USD 기준 정책 평가가 동작하고, Action Provider 프레임워크가 구축되어 DeFi 프로토콜 플러그인을 추가할 수 있는 상태. 신규 외부 npm 의존성 0개, 기존 6-stage 파이프라인 구조 변경 없이 주입점 추가 방식으로 구현한다.

#### Phase 125: Design Docs + Oracle Interfaces
**Goal**: 설계 문서가 v1.5 아키텍처를 정확히 반영하고, IPriceOracle 인터페이스/캐시/가격 나이 분류기가 외부 API 호출 없이 동작하는 상태
**Depends on**: Nothing (first phase of v1.5)
**Requirements**: DSGN-01, DSGN-02, DSGN-03, ORACL-01, ORACL-05, ORACL-06
**Success Criteria** (what must be TRUE):
  1. 설계 문서 61이 Pyth Primary + CoinGecko Fallback 구조를 반영하고 Chainlink 참조가 제거되어 있다
  2. 설계 문서 62/38이 MCP 16개 상한 제거 + 현행 14개 도구를 정확히 기술한다
  3. IPriceOracle 인터페이스가 getPrice/getPrices/getNativePrice/getCacheStats 4개 메서드를 Zod SSoT로 정의한다
  4. InMemoryPriceCache가 LRU 128항목 + 5분 TTL로 가격을 저장/조회/퇴거하고 cache stampede를 방지한다
  5. classifyPriceAge가 FRESH/AGING/STALE 3단계로 가격 나이를 판정하고 단위 테스트를 통과한다
**Plans**: 2 plans

Plans:
- [x] 125-01: 설계 문서 61/62/38 v1.5 수정
- [x] 125-02: IPriceOracle 인터페이스 + InMemoryPriceCache + classifyPriceAge 구현

#### Phase 126: Oracle Implementations
**Goal**: Pyth Hermes Zero-config 가격 조회와 CoinGecko opt-in 롱테일 토큰 가격 조회가 OracleChain 2단계 fallback으로 동작하고, 교차 검증이 편차>5% 가격을 STALE로 격하하는 상태
**Depends on**: Phase 125
**Requirements**: ORACL-02, ORACL-03, ORACL-04, ORACL-07, ORACL-08
**Success Criteria** (what must be TRUE):
  1. PythOracle이 Pyth Hermes REST API로 SOL/ETH/BTC 등 주요 토큰의 USD 가격을 조회한다 (API 키 불필요)
  2. CoinGeckoOracle이 CoinGecko Demo API로 컨트랙트 주소 기반 롱테일 토큰 가격을 조회한다 (API 키 설정 시에만 활성)
  3. OracleChain이 Pyth 실패 시 CoinGecko로 자동 fallback하고, 양쪽 성공 시 5% 편차 초과 가격을 STALE로 격하한다
  4. GET /v1/admin/oracle-status가 캐시 적중률, 소스별 상태, 마지막 조회 시각을 반환한다
**Plans**: 3 plans

Plans:
- [x] 126-01: PythOracle 구현 (Hermes REST API + Feed ID 매핑)
- [x] 126-02: CoinGeckoOracle 구현 (Demo API + platformId 매핑)
- [x] 126-03: OracleChain fallback + 교차 검증 + GET /v1/admin/oracle-status

#### Phase 127: USD Policy Integration
**Goal**: 5-type 트랜잭션의 금액이 USD로 환산되어 정책 평가에 반영되고, 가격 불명 토큰이 안전하게 처리되며, 오라클 장애 시 graceful fallback이 동작하는 상태
**Depends on**: Phase 126
**Requirements**: USDPL-01, USDPL-02, USDPL-03, USDPL-04, USDPL-05, USDPL-06
**Success Criteria** (what must be TRUE):
  1. resolveEffectiveAmountUsd가 TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH 5-type의 금액을 USD로 환산한다
  2. SpendingLimitRuleSchema가 instant_max_usd/notify_max_usd/delay_max_usd 필드를 Zod SSoT로 검증하고 USD 기준 정책 평가가 동작한다
  3. 가격 불명 토큰(notListed) 전송 시 최소 NOTIFY로 격상되고 UNLISTED_TOKEN_TRANSFER 감사 로그가 기록된다
  4. 오라클 전체 장애(oracleDown) 시 네이티브 금액만으로 정책 평가가 계속된다
  5. 가격 불명 토큰 + CoinGecko 키 미설정 시 키 안내 힌트가 최초 1회 포함된다
**Plans**: 3 plans

Plans:
- [x] 127-01: PriceResult 3-state + resolveEffectiveAmountUsd 구현
- [x] 127-02: SpendingLimitRuleSchema USD 필드 + evaluateSpendingLimit USD 분기
- [x] 127-03: Stage 3 파이프라인 통합 + graceful fallback + notListed 격상

#### Phase 128: Action Provider + API Key
**Goal**: IActionProvider 인터페이스 기반 ESM 플러그인 프레임워크가 구축되어 ~/.waiaas/actions/에서 플러그인을 로드하고, API 키가 DB 암호화 저장되며, POST /v1/actions/:provider/:action으로 액션을 실행할 수 있는 상태
**Depends on**: Phase 125 (인터페이스), Phase 127 (선택적 -- Oracle 없이도 동작하나 순차 실행 권장)
**Requirements**: ACTNP-01, ACTNP-02, ACTNP-03, ACTNP-04, APIKY-01, APIKY-02, APIKY-03, APIKY-04
**Success Criteria** (what must be TRUE):
  1. IActionProvider 인터페이스가 metadata/actions/resolve 3개 메서드를 정의하고 Zod로 검증한다
  2. ActionProviderRegistry가 ~/.waiaas/actions/에서 ESM 플러그인을 발견/로드하고 resolve() 반환값을 ContractCallRequestSchema로 재검증한다
  3. POST /v1/actions/:provider/:action이 resolve() 결과를 기존 파이프라인(Stage 1~6)으로 실행한다
  4. api_keys 테이블(DB v11)이 프로바이더별 API 키를 암호화 저장하고 requiresApiKey=true 프로바이더가 키 미설정 시 비활성화된다
  5. Admin UI API Keys 섹션에서 프로바이더별 키를 설정/수정/삭제하고 GET/PUT/DELETE API가 키를 마스킹 반환한다
**Plans**: 4 plans

Plans:
- [ ] 128-01: IActionProvider 인터페이스 + ActionProviderRegistry (ESM 플러그인 로드)
- [ ] 128-02: api_keys DB v11 마이그레이션 + ActionProviderApiKeyStore
- [ ] 128-03: POST /v1/actions/:provider/:action REST API + 파이프라인 연동
- [ ] 128-04: Admin UI API Keys CRUD + GET/PUT/DELETE /v1/admin/api-keys

#### Phase 129: MCP/Admin/Skill Integration
**Goal**: Action Provider의 MCP Tool 자동 변환이 동작하고, Skill 파일이 새로운 엔드포인트를 문서화하는 상태
**Depends on**: Phase 126 (Oracle Status), Phase 128 (Action Provider)
**Requirements**: ACTNP-05, ACTNP-06, SKIL-01, SKIL-02
**Success Criteria** (what must be TRUE):
  1. mcpExpose=true Action Provider의 액션이 MCP 도구로 자동 변환되어 AI 에이전트가 사용할 수 있다
  2. 프로바이더 등록/해제 시 MCP 도구가 동적으로 추가/제거되고 기존 14개 내장 도구가 유지된다
  3. admin.skill.md에 oracle-status, api-keys 엔드포인트가 문서화되어 있다
  4. actions.skill.md가 Action Provider REST API를 문서화하여 AI 에이전트가 즉시 사용 가능하다
**Plans**: 2 plans

Plans:
- [ ] 129-01: ActionDefinition -> MCP Tool 자동 변환 + 동적 등록/해제
- [ ] 129-02: admin.skill.md + actions.skill.md 작성/동기화

## Progress

**Execution Order:**
Phases execute in numeric order: 125 -> 126 -> 127 -> 128 -> 129
(Phase 128은 Phase 125 이후 독립 실행 가능하나, 순차 실행 권장)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 125. Design Docs + Oracle Interfaces | v1.5 | 2/2 | ✓ Complete | 2026-02-15 |
| 126. Oracle Implementations | v1.5 | 3/3 | ✓ Complete | 2026-02-15 |
| 127. USD Policy Integration | v1.5 | 3/3 | ✓ Complete | 2026-02-15 |
| 128. Action Provider + API Key | v1.5 | 0/4 | Not started | - |
| 129. MCP/Admin/Skill Integration | v1.5 | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-15*
*Last updated: 2026-02-15*
