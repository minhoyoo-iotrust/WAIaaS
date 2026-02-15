# Project Research Summary

**Project:** WAIaaS v1.5 — DeFi Price Oracle + Action Provider Framework
**Domain:** Self-hosted AI agent wallet daemon — USD-based spending limits, multi-source price oracle, ESM plugin architecture
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

v1.5는 기존 네이티브 금액 기반 정책 엔진에 USD 환산 레이어를 추가하고, ESM 동적 임포트 기반 DeFi 액션 플러그인 프레임워크를 구축하는 마일스톤이다. 핵심 발견: **신규 외부 npm 의존성이 전혀 필요하지 않다.** Pyth Hermes와 CoinGecko는 단순 REST API로 Node.js 22 내장 `fetch()`만으로 호출 가능하며, LRU 캐시는 Map 기반 직접 구현(128항목)으로 충분하고, API 키 암호화는 기존 `settings-crypto.ts`의 HKDF+AES-256-GCM 패턴을 재사용하면 된다.

권장 접근법은 4단계 구축이다: (1) **Oracle Core** — IPriceOracle 인터페이스 + PythOracle(Zero-config Primary) + CoinGeckoOracle(opt-in Fallback) + OracleChain(2단계 fallback + 5% 편차 교차 검증), (2) **USD Policy Integration** — resolveEffectiveAmountUsd() 함수로 5-type 트랜잭션을 PriceResult discriminated union(success/oracleDown/notListed) 3가지 상태로 변환하여 기존 Stage 3 정책 평가에 주입, (3) **Action Provider Framework** — IActionProvider 인터페이스 + ActionProviderRegistry(~/.waiaas/actions/ ESM 플러그인 로드) + validate-then-trust 보안 경계, (4) **MCP/Admin Integration** — MCP Tool 자동 변환 + Admin UI Oracle Status/API Keys 섹션.

핵심 위험은 3가지이다: (1) **가격 불명 토큰의 $0 처리 우회** — PriceResult.notListed 상태로 최소 NOTIFY 격상 필수, (2) **교차 검증 편차 계산 오류** — 절대값 + 평균 기준 공식 엄수 필요, (3) **ESM 플러그인 임의 코드 실행** — validate-then-trust로 Zod 검증하되 Owner 신뢰 경계 명시 필요. 완화책: Oracle 장애 시 graceful fallback(네이티브 금액만으로 정책 평가), evaluateAndReserve() 진입 **전**에 Oracle HTTP 호출 완료(TOCTOU 보호), resolve()는 ContractCallRequest만 반환(정책 평가 필수 통과).

## Key Findings

### Recommended Stack

**신규 외부 의존성 0개.** v1.5는 기존 스택(Node.js 22, Zod, drizzle-orm, Hono, settings-crypto)만으로 구현 가능하다. Pyth Hermes와 CoinGecko는 native `fetch()`로 호출하는 REST API이며, LRU 캐시는 Map + doubly-linked list로 60줄 내 직접 구현, API 키 암호화는 기존 SettingsService의 HKDF+AES-256-GCM 패턴을 재사용한다.

**Core technologies:**
- **Pyth Hermes REST API** (Primary Oracle): Zero-config, 380+ 크로스체인 피드, 30 req/10s rate limit. `/v2/updates/price/latest` 엔드포인트로 feed ID 기반 가격 조회. 하드코딩 매핑(주요 10-15개 토큰) + 동적 검색(/v2/price_feeds) 하이브리드 전략. 공개 엔드포인트로 별도 npm 패키지 불필요.
- **CoinGecko Demo API** (Fallback Oracle): Pyth 미지원 롱테일 토큰 커버리지, opt-in(API 키 설정 시 활성화), 30 req/min + 10K req/month 제한. `/simple/token_price/{platform_id}` 엔드포인트로 컨트랙트 주소 기반 가격 조회. platformId 매핑(solana, ethereum, polygon-pos 등) 필요. Demo 키는 DB 암호화 저장.
- **InMemoryPriceCache** (LRU 직접 구현): 128항목 상한, 5분 TTL, FRESH(<5분)/AGING(5-30분)/STALE(>30분) 3단계 가격 나이 분류. Map + doubly-linked list 패턴으로 lru-cache 라이브러리 의존성 제거. cache stampede 방지(in-flight 요청 추적).
- **settings-crypto.ts** (기존 암호화 패턴 재사용): HKDF(SHA-256) + AES-256-GCM으로 API 키 암호화. 목표 문서에서 sodium-native secretbox를 명시했으나, 기존 코드 패턴 재사용이 보안 동등성(256-bit AEAD) + 일관성(마스터 패스워드 통합 관리) 측면에서 우수. CoinGecko 키는 `oracle.coingecko_api_key` 설정, Action Provider 키는 `api_keys` 테이블.
- **ESM dynamic import** (Node.js 22 내장): `import(pathToFileURL(filePath).href)` 패턴으로 ~/.waiaas/actions/ 플러그인 로드. 별도 로더 라이브러리 불필요. 캐시 특성상 핫 리로드 미지원(데몬 재시작 필요).

**명시적으로 제외한 것들:**
- Chainlink Oracle: EVM 전용(Solana 미지원), Aggregator 주소 유지 부담. Pyth가 체인 무관 380+ 피드 제공.
- WebSocket/SSE 실시간 스트리밍: 5분 TTL 캐시로 충분. Hermes SSE 엔드포인트 존재하나 WAIaaS는 트랜잭션 시점 가격만 필요.
- On-chain Oracle 조회: RPC 호출 비용 + 복잡도. Hermes REST가 동일 데이터를 무료 제공.
- VM 샌드박스(vm2, isolated-vm): 구현 복잡도 HIGH + vm2는 최근 CVSS 9.8 취약점(CVE-2026-22709) 발견. v1.5는 validate-then-trust + Owner 책임 경계.
- 구체적 DeFi 프로토콜(Jupiter, 0x, Lido): v1.5는 프레임워크만 구현, 프로토콜은 v1.5.5+.

### Expected Features

**Must have (table stakes):**
- **IPriceOracle 인터페이스**(4 메서드: getPrice/getPrices/getNativePrice/getCacheStats) — USD 정책 평가의 타입 기반 (TS-01)
- **PythOracle + CoinGeckoOracle + OracleChain** — 2단계 fallback으로 단일 소스 장애 시 서비스 연속성 보장 (TS-02~04)
- **InMemoryPriceCache + 3단계 가격 나이** — API rate limit 관리 + 가격 신선도 기반 정책 분기 (TS-05~06)
- **resolveEffectiveAmountUsd()** — 5-type 트랜잭션 모두 USD 변환, PriceResult discriminated union(success/oracleDown/notListed) 반환 (TS-07)
- **SpendingLimitRuleSchema Zod + USD 필드** — instant_max_usd/notify_max_usd/delay_max_usd optional 필드. 현재 `z.record(z.unknown())` -> Zod SSoT (TS-08)
- **IActionProvider 인터페이스** — metadata/actions/resolve 3-part. resolve()는 ContractCallRequest만 반환(정책 평가 필수 통과) (TS-09)
- **ActionProviderRegistry** — ~/.waiaas/actions/ 스캔 + ESM dynamic import + validate-then-trust (Zod 인터페이스 검증) (TS-10)
- **REST API 3개** — POST /v1/actions/:provider/:action(Action 실행), GET /v1/admin/oracle-status(캐시 통계/소스 상태), CRUD /v1/admin/api-keys/:provider (TS-11~13)
- **ActionProviderApiKeyStore** — DB api_keys 테이블 + 암호화 저장(기존 settings-crypto 패턴 재사용) (TS-12)
- **MCP Tool 자동 변환** — ActionDefinition.inputSchema(Zod) -> zodToJsonSchema -> server.tool() 동적 등록. mcpExpose 플래그 필터링 (DF-04)

**Should have (competitive):**
- **교차 검증 편차 인라인(>5% STALE 격하)** — Pyth+CoinGecko 양쪽 성공 시 편차 계산. 5% 초과 시 PRICE_DEVIATION_WARNING + STALE 격하 (DF-01)
- **PriceResult 3-state discriminated union** — success(USD 금액)/oracleDown(네이티브 fallback)/notListed(최소 NOTIFY 격상). "가치 불명 != 가치 0" 보안 원칙 (DF-02)
- **Unlisted token CoinGecko 힌트** — notListed 첫 발생 시 "CoinGecko API 키 설정하면..." 안내(토큰별 1회, 스팸 방지) (DF-03)
- **Admin Oracle 설정 오버라이드** — 교차 검증 편차 임계값, 캐시 TTL 등을 SettingsService hot-reload로 조정 가능 (DF-06)

**Defer (v2+):**
- 토큰별 교차 검증 임계값 커스텀
- Pyth `/v2/price_feeds` 전체 목록 시작 시 로드(동적 검색 대신)
- 플러그인 핫 리로드(ESM 캐시 무효화 시 메모리 누수)
- Action Provider VM 샌드박스(복잡도 vs 보안 효과)
- 구체적 DeFi 프로토콜 플러그인(v1.5.5+)

### Architecture Approach

v1.5는 **기존 6-stage 파이프라인을 변경하지 않고** 새로운 컴포넌트를 주입점에 추가하는 방식이다. DaemonContext에 `priceOracle: OracleChain`, `actionRegistry: ActionProviderRegistry`, `apiKeyStore: ActionProviderApiKeyStore` 3개 필드 추가. PipelineContext에 `priceOracle?` 옵셔널 필드 추가하여 Stage 3에서 USD 변환 호출.

**Major components:**
1. **OracleChain**(daemon/oracle/) — Chain of Responsibility + Cross-Validation 패턴. Pyth->CoinGecko fallback, 5% 편차 인라인 검증, InMemoryPriceCache 공유. OracleChain이 3개 구현체(PythOracle, CoinGeckoOracle, Cache)를 조율.
2. **resolveEffectiveAmountUsd**(daemon/pipeline/) — PipelineInput(5-type) -> PriceResult(3-state) 변환. **evaluateAndReserve() 진입 전**에 호출(better-sqlite3 동기 트랜잭션 내 비동기 HTTP 불가). Stage 3 정책 평가에서 USD 금액을 TransactionParam에 주입.
3. **ActionProviderRegistry**(daemon/action/) — ESM `import()` 플러그인 발견/로드. validate-then-trust: Zod로 metadata/actions 검증 + resolve() 반환값 재검증. McpToolConverter에 프로바이더 목록 제공하여 MCP 도구 자동 등록/해제.
4. **API Integration Layer** — POST /v1/actions/:provider/:action 라우트에서 resolve() 결과(ContractCallRequest) -> TransactionRequest 변환 어댑터 레이어. 기존 파이프라인 Stage 1 Zod 검증과 호환.

**Key data flows:**
- **USD 정책 플로우**: Transaction Request -> Stage 3 -> resolveEffectiveAmountUsd() -> OracleChain.getPrice() -> (Cache hit FRESH) 즉시 반환 or (Cache miss) Pyth API -> (실패) CoinGecko API -> (양쪽 성공) 교차 검증 -> PriceResult -> evaluateSpendingLimit(USD 분기) -> max(nativeTier, usdTier) -> DELAY/APPROVAL/INSTANT
- **Action Provider 플로우**: POST /v1/actions/:p/:a -> ActionProviderRegistry.getProvider() -> requiresApiKey 검증(ApiKeyStore) -> provider.resolve() (Zod inputSchema 검증) -> ContractCallRequest(Zod 재검증) -> 파이프라인 Stage 1~6(정책 평가 포함) -> TransactionResult
- **MCP 동적 도구 플로우**: DaemonLifecycle.start() -> ActionProviderRegistry.loadPlugins() -> mcpExpose=true 필터 -> ActionDefinition -> zodToJsonSchema -> server.tool() 등록(14 기존 도구 유지 + N 동적 도구)

### Critical Pitfalls

1. **가격 불명 토큰을 $0로 처리하여 USD 한도 우회(C-01)** — Pyth+CoinGecko 모두 미등록 토큰의 가격을 `usdAmount: 0` 반환 시 USD 기반 SPENDING_LIMIT 완전 무력화. **방지:** PriceResult discriminated union으로 `notListed` 상태 명시, 최소 NOTIFY 격상. `resolveEffectiveAmountUsd()`는 `number | null`이 아닌 tagged union 반환 필수.

2. **교차 검증 편차 계산 오류로 조작 가격 채택(C-02)** — 편차 계산에서 절대값 누락 또는 분모 잘못(pythPrice 단독 vs 평균) 시 STALE 격하 미발동. 예: `(pythPrice - cgPrice) / pythPrice`가 음수일 때 -20% < 5% 조건 통과. **방지:** `Math.abs(p1 - p2) / ((p1 + p2) / 2)` 공식 엄수. 교차 검증 결과를 감사 로그에 항상 기록(성공/실패/스킵).

3. **ESM 플러그인 resolve()가 부수 효과 실행(C-03)** — `import()` 시점에 top-level 코드 실행(파일 접근, 네트워크 호출, 프로세스 종료). Node.js ESM은 샌드박스 없음. **방지:** validate-then-trust(Zod 검증) + resolve() 타임아웃(Promise.race 5초) + 감사 로그. Owner 신뢰 경계 문서화. 향후 VM 격리 검토(v1.5 범위 외).

4. **evaluateAndReserve() 내 비동기 Oracle 호출 시도(H-04)** — better-sqlite3의 `transaction(() => {}).immediate()` 패턴은 동기 콜백만 지원. 트랜잭션 내 `await oracle.getPrice()`는 TOCTOU 보호 파괴. **방지:** Oracle 호출은 Stage 3 진입 전에 완료, `TransactionParam.usdAmount` 필드로 전달. evaluateAndReserve()는 이미 계산된 USD 금액만 참조.

5. **Action Provider resolve() 반환값이 파이프라인 비호환(H-05)** — ContractCallRequest와 TransactionRequest 스키마 불일치 시 Stage 1 Zod 검증 실패 또는 Stage 5 빌드 에러. **방지:** POST /v1/actions 라우트에 변환 어댑터 레이어 구현. ContractCallRequest -> TransactionRequest 매핑 후 기존 파이프라인 주입.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Oracle Core
**Rationale:** USD 정책 평가의 기반 인프라. 의존성 없이 독립 구축 가능. Pyth Zero-config 원칙으로 설치 직후 동작 필수.
**Delivers:** IPriceOracle 인터페이스, InMemoryPriceCache(LRU 128 + 5분 TTL), PythOracle(Hermes REST), CoinGeckoOracle(opt-in), OracleChain(fallback + 교차 검증)
**Addresses:** TS-01~06 (인터페이스, 캐시, 두 오라클, fallback 체인, 가격 나이 3단계)
**Avoids:** C-01(가격 불명 $0 우회) 방지 설계 포함, C-02(편차 계산 오류) 방지 공식 명시
**Research flags:**
- Pyth Feed ID 매핑 전략 확정 필요(하드코딩 vs 동적 검색 비율)
- CoinGecko platformId 전체 체인 매핑 검증 필요
- 캐시 stampede 방지(in-flight 추적) 패턴 구현 세부사항

### Phase 2: USD Policy Integration
**Rationale:** Phase 1의 Oracle을 기존 파이프라인에 주입. Stage 3 정책 평가 확장.
**Delivers:** resolveEffectiveAmountUsd(), PriceResult discriminated union, SpendingLimitRuleSchema Zod 신규 생성(USD 필드 optional), DatabasePolicyEngine USD 분기 추가
**Addresses:** TS-07~08 (USD 변환, Zod 스키마)
**Uses:** OracleChain(Phase 1), 기존 Pipeline Stage 3
**Implements:** evaluateSpendingLimit() 수정(USD 필드 존재 시 USD 비교, 미존재 시 네이티브 비교. max(nativeTier, usdTier) 규칙)
**Avoids:** H-04(evaluateAndReserve 내 비동기 호출) — Oracle 호출을 Stage 3 진입 전에 완료
**Research flags:**
- TransactionType별 금액 추출 로직(TOKEN_TRANSFER의 amount, CONTRACT_CALL의 value, BATCH 합산 등) 세부 구현 확인
- PriceResult 3-state 처리 분기(success/oracleDown/notListed) 각각의 정책 평가 로직 명확화

### Phase 3: Action Provider Framework
**Rationale:** Oracle과 독립적으로 구축 가능. 플러그인 프레임워크의 핵심.
**Delivers:** IActionProvider 인터페이스, ActionProviderRegistry(ESM plugin load), ActionProviderApiKeyStore(DB v11 + 암호화), POST /v1/actions/:provider/:action API
**Addresses:** TS-09~12 (인터페이스, 레지스트리, API 엔드포인트, 키 저장)
**Uses:** settings-crypto.ts 기존 암호화 함수 재사용, DB 마이그레이션 v11
**Implements:** validate-then-trust 패턴(Zod metadata/actions 검증 + resolve() 반환값 재검증), ContractCallRequest -> TransactionRequest 변환 어댑터
**Avoids:** C-03(악성 플러그인) — 타임아웃 + Zod 검증 + Owner 책임 문서화. H-05(파이프라인 비호환) — 변환 어댑터 레이어
**Research flags:**
- ESM import() 경로 정규화(pathToFileURL) 실제 동작 검증 필요
- 플러그인 디렉토리 미존재/권한 에러 핸들링 시나리오 확인
- ContractCallRequest Zod 스키마가 Solana/EVM 양쪽 필드를 모두 포함하는지 확인

### Phase 4: MCP/Admin/API Integration
**Rationale:** Phase 2~3 완료 후 외부 인터페이스 확장. MCP 도구는 ActionProviderRegistry에 의존.
**Delivers:** McpToolConverter(ActionDefinition -> MCP Tool 자동 변환), Admin Oracle Status 페이지/섹션, Admin API Keys 섹션, skill 파일 동기화
**Addresses:** DF-04(MCP 자동 변환), TS-13(oracle-status 엔드포인트), DF-05(Admin API Keys UI), DF-06(Oracle 설정 오버라이드)
**Uses:** ActionProviderRegistry(Phase 3), OracleChain.getCacheStats()(Phase 1), SettingsService 확장
**Implements:** zodToJsonSchema 변환 + server.tool() 동적 등록, 기존 14개 도구 유지 + N 동적 도구, HotReloadOrchestrator oracle 키 핸들러 추가
**Avoids:** H-06(MCP 도구 등록/해제 시 내장 도구 손실) — 이름 공간 분리(`waiaas_{provider}_{action}` 접두사)
**Research flags:**
- MCP SDK의 동적 도구 등록/해제 공식 API 미존재 — 대안 패턴(disable/enable) 검증 필요
- zodToJsonSchema 변환 시 정보 손실(transform/refine 등) 가능성 확인
- Admin Settings > Oracle 섹션 UI 레이아웃 최종 결정(별도 페이지 vs 섹션)

### Phase Ordering Rationale

- **Phase 1(Oracle Core) 우선**: USD 정책 평가의 전제 조건. 의존성 없이 독립 구축 가능. Pyth Zero-config 원칙으로 CoinGecko 키 미설정 상태에서도 동작 필수.
- **Phase 2(USD Policy)는 Phase 1 의존**: resolveEffectiveAmountUsd()가 OracleChain을 호출. Stage 3 수정은 파이프라인 안정성에 영향. Oracle 자체가 먼저 검증되어야 안전.
- **Phase 3(Action Provider)는 Phase 1~2와 독립**: 플러그인 프레임워크는 Oracle과 무관. 병렬 개발 가능하나, 순차 개발 시 Phase 2 완료 후 Oracle 안정화 확인하고 시작이 안전.
- **Phase 4(MCP/Admin)는 Phase 2~3 의존**: MCP 도구 변환은 ActionProviderRegistry 필요, Oracle Status는 OracleChain 필요. 외부 인터페이스는 내부 구현 완료 후 노출이 순서상 자연스러움.
- **아키텍처 기반 분리**: Oracle과 Action Provider는 서로 다른 서브시스템. 각각 독립적인 Phase로 분리하여 실패 격리 + 테스트 용이성 확보.
- **함정 회피 기반 순서**: Oracle Core 먼저 구축하면 C-01(가격 불명 $0), C-02(편차 계산) 방지 설계를 초기에 확립. USD Policy Integration에서 H-04(비동기 호출) 함정을 Stage 3 수정 시점에 집중 회피. Action Provider에서 C-03(악성 플러그인), H-05(파이프라인 비호환)을 독립 Phase에서 검증.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Oracle Core):** Pyth Feed ID 매핑 — 하드코딩할 토큰 목록 확정, /v2/price_feeds API 동적 검색 결과 구조 확인, 심볼 충돌 해결 전략.
- **Phase 2 (USD Policy Integration):** 5-type별 금액 추출 — TOKEN_TRANSFER의 amount 필드 vs CONTRACT_CALL의 value 필드, BATCH의 개별 instruction 합산 로직. PriceResult 3-state 각각의 evaluateSpendingLimit() 분기 로직.
- **Phase 3 (Action Provider Framework):** ESM import() 에러 핸들링 — 디렉토리 미존재, 잘못된 파일, 심볼릭 링크, 권한 에러 시나리오별 graceful degradation. ContractCallRequest Zod 스키마가 Solana/EVM 공통 필드를 어떻게 처리하는지 확인.
- **Phase 4 (MCP/Admin Integration):** MCP 동적 도구 등록 — @modelcontextprotocol/sdk의 server.tool() 등록 후 해제 메커니즘 부재, notifications/tools/list_changed 알림 전송 타이밍, 클라이언트 갱신 동작.

Phases with standard patterns (skip research-phase):
- **Phase 2 (USD Policy Integration — 일부):** DatabasePolicyEngine 수정은 기존 evaluateSpendingLimit() 패턴 확장. Zod 스키마 생성은 기존 패턴 준수.
- **Phase 4 (Admin UI 확장):** Admin Settings 섹션 추가, 엔드포인트 CRUD는 기존 Preact + Hono 패턴 재사용. HotReloadOrchestrator 확장은 기존 hot-reload.ts 패턴 준수.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Pyth/CoinGecko 공식 문서 직접 검증, Node.js 22 fetch() 내장 기능 확인, 기존 settings-crypto.ts 패턴 코드베이스 직접 분석. 신규 의존성 0개 결론은 각 기술의 공식 API 문서 교차 확인으로 뒷받침. |
| Features | **HIGH** | 목표 문서 v1.5 객체 분석 + Pyth/CoinGecko API 기능 범위 확인 + 기존 코드베이스(SPENDING_LIMIT, Pipeline Stage 3) 직접 분석. Table stakes vs differentiators 구분은 DeFi 오라클 보안 best practice 문서 + Coinbase AgentKit architecture 비교 기반. |
| Architecture | **HIGH** | 기존 6-stage 파이프라인 코드 직접 분석(stages.ts, pipeline.ts, database-policy-engine.ts), DaemonContext 패턴 확인, SettingsService/hot-reload 메커니즘 확인. OracleChain fallback 패턴은 Pyth/CoinGecko API 동작 + Chain of Responsibility 패턴. |
| Pitfalls | **HIGH** | C-01~03은 DeFi 오라클 조작 공격 사례 연구 + ESM 보안 연구 교차 확인. H-04는 better-sqlite3 동기 트랜잭션 제약 코드 직접 확인. H-05는 기존 buildByType() 코드 직접 분석. |

**Overall confidence:** **HIGH**

모든 핵심 결정(신규 의존성 0개, Oracle 2단계 fallback, USD 정책 통합 시점, ESM 플러그인 보안 경계)이 공식 문서 또는 기존 코드베이스 직접 분석으로 뒷받침됨. Pyth Feed ID 매핑 전략, MCP 동적 도구 등록/해제 메커니즘은 phase planning에서 확정 필요하나 대안 경로 명확.

### Gaps to Address

- **Pyth Feed ID 주요 토큰 목록 확정**: SOL/ETH/BTC는 HIGH confidence로 feedId 확인했으나, USDC/USDT/DAI 등 stablecoin, 주요 DeFi 토큰(UNI, AAVE, LINK)의 정확한 feedId는 phase planning에서 `/v2/price_feeds` API로 검증 필요. 하드코딩 맵에 포함할 토큰 목록(10-15개) 최종 결정.

- **CoinGecko platformId 전체 체인 매핑**: solana, ethereum, polygon-pos는 공식 문서에서 확인했으나, 향후 지원 체인(arbitrum-one, base, avalanche 등)의 정확한 platformId는 `/asset_platforms` API로 검증 필요. ChainType -> platformId 매핑 테이블 완성.

- **API 키 암호화 패턴 최종 결정**: 목표 문서에서 sodium-native secretbox를 명시했으나, 리서치에서 기존 HKDF+AES-256-GCM 재사용을 권장(보안 동등성 + 일관성). Phase planning에서 최종 결정 필요. CoinGecko 키는 SettingsService vs api_keys 테이블 저장소 선택.

- **MCP 동적 도구 등록/해제 메커니즘**: @modelcontextprotocol/sdk 1.26.0에 server.tool() 등록 API는 있으나 공식 해제 API는 부재. 내부 도구 맵 조작 또는 disable/enable 패턴 중 선택 필요. notifications/tools/list_changed 알림 전송 타이밍 확인 필요.

- **ContractCallRequest Zod 스키마 Solana/EVM 공존**: 기존 schemas/transaction.schema.ts의 ContractCallRequest가 Solana(programId/instructionData/accounts)와 EVM(to/calldata/abi/value) 필드를 어떻게 처리하는지 확인 필요. Action Provider의 resolve() 반환값이 체인별로 다른 필드를 가질 수 있으므로 스키마가 유연해야 함.

## Sources

### Primary (HIGH confidence)
- **Pyth Hermes API Reference** — https://docs.pyth.network/price-feeds/core/api-reference — /v2/updates/price/latest 엔드포인트 사양, 응답 구조(parsed/binary), rate limits(30 req/10s)
- **Pyth Fetch Price Updates Guide** — https://docs.pyth.network/price-feeds/core/fetch-price-updates — HermesResponse 인터페이스, price/conf/expo 필드 설명
- **Pyth Rate Limits** — https://docs.pyth.network/price-feeds/core/rate-limits — 30 req/10s per IP, 60s cooldown on 429
- **CoinGecko Simple Token Price API** — https://docs.coingecko.com/reference/simple-token-price — /simple/token_price/{platform_id} 엔드포인트, contract_addresses 배치 지원
- **CoinGecko Rate Limits** — https://docs.coingecko.com/docs/common-errors-rate-limit — Demo 30/min + 10K/month, Pro 500-1000/min
- **WAIaaS 기존 코드베이스** — pipeline/stages.ts, database-policy-engine.ts, settings-crypto.ts, hot-reload.ts 직접 분석
- **WAIaaS 목표 문서** — objectives/v1.5-defi-price-oracle.md — 기술 결정 #1~6(Zero-config, LRU 직접 구현, Chainlink 제외 등)
- **WAIaaS 설계 문서** — docs/61-price-oracle-spec.md, docs/62-action-provider-architecture.md — IPriceOracle 인터페이스, IActionProvider 인터페이스, resolve-then-execute 패턴
- **Node.js ESM Documentation** — https://nodejs.org/api/esm.html — import() 동작, 모듈 캐시, pathToFileURL 사용
- **MDN AbortSignal.timeout** — https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static — fetch() 타임아웃 패턴

### Secondary (MEDIUM confidence)
- **DeFi Oracle Security Best Practices** — CertiK, Cyfrin, Halborn 오라클 조작 공격 사례 연구 — 교차 검증, 다중 소스, "가격 불명 != 가격 0" 원칙
- **Coinbase AgentKit Architecture** — https://docs.cdp.coinbase.com/agent-kit/core-concepts/architecture-explained — Action Provider 패턴 참조, @CreateAction 데코레이터 vs 인터페이스 기반 비교
- **Pyth Price Feed IDs** — https://docs.pyth.network/price-feeds/core/price-feeds — 380+ 피드 목록, SOL/ETH/BTC feedId 교차 확인
- **sodium-native secretbox** — https://sodium-friends.github.io/docs/docs/secretkeyboxencryption — crypto_secretbox_easy API, KEYBYTES/NONCEBYTES 상수

### Tertiary (LOW confidence)
- **Pyth Feed ID 동적 검색(/v2/price_feeds)** — 문서에서 엔드포인트 존재 확인했으나 실제 응답 구조는 미검증. phase planning에서 실제 호출 필요.
- **CoinGecko platformId 전체 목록** — 주요 체인 8개는 확인했으나 전체 목록은 /asset_platforms API로 phase planning에서 확인 필요.
- **MCP 동적 도구 등록/해제** — GitHub Issue #682에서 제약 사항 확인했으나 공식 해결 방법은 부재. 대안 패턴 phase planning에서 검증 필요.

---
*Research completed: 2026-02-15*
*Ready for roadmap: yes*
