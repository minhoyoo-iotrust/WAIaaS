# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v33.0 — Desktop App 아키텍처 재설계

**Shipped:** 2026-03-31
**Phases:** 3 | **Plans:** 6

### What Was Built
- 설계 문서 39의 6개 섹션(2.1, 2.2, 3.3, 6, 7, 13)을 React 18 SPA에서 Admin Web UI(Preact 10.x) 재사용 아키텍처로 전면 재작성
- isDesktop() 환경 감지 전략, IPC 브릿지 6개 명령 명세(Rust+TS 시그니처), Tauri Capability 설정, CSP 예외 전략
- 조건부 렌더링 패턴(desktopComponent), 모듈 경계 규칙, 4-layer tree-shaking 전략
- TCP bind(0) 동적 포트 할당 프로토콜(stdout/tempfile 이중 전달)
- m33-02 Desktop App 구현 objectives 갱신 — 새 아키텍처와 완전 정합

### What Worked
- 3-phase 파이프라인이 깨끗함: 기존 섹션 재작성(456) → 신규 설계 추가(457) → 구조 검증+정합(458)
- 설계 전용 마일스톤으로 코드 없이 아키텍처 방향 전환 — React 18 별도 구현 대비 유지보수 비용 대폭 절감
- Phase 458에서 일관성 검증이 스테일 참조(React 18, 포트 3100, desktop/src/pages/) 5건 발견 및 수정

### What Was Inefficient
- 설계 문서가 ~1,900줄로 비대함 — 전체 읽기+수정 사이클이 컨텍스트를 많이 소모
- Nyquist validation이 설계 전용 마일스톤에 미적용(MISSING) — 설계 전용 예외 기준 필요

### Patterns Established
- Admin Web UI 재사용 패턴: WebView에서 기존 Admin UI를 로드, Desktop 전용 코드는 packages/admin/src/desktop/ 격리
- isDesktop() + dynamic import 조건부 렌더링 패턴
- TCP bind(0) + stdout/tempfile 포트 전달 프로토콜

### Key Lessons
1. 설계 전용 마일스톤은 구현 마일스톤과 다른 검증 기준 필요 — VERIFICATION.md 대신 감사 보고서로 대체 가능
2. Admin Web UI 재사용 결정이 핵심 — React 18 별도 구현 대비 ~8,000줄 코드 절감 예상
3. 구조 검증 phase가 일관성 문제 5건 발견 — 대규모 설계 변경 시 필수 단계

### Cost Observations
- Model mix: 100% opus (quality profile)
- Sessions: 1
- Notable: 3 phases 같은 날 완료, 설계 전용이므로 27 files +5,772/-1,843 lines (전부 markdown)

---

## Milestone: v32.10 — 에이전트 스킬 정리 + OpenClaw 플러그인

**Shipped:** 2026-03-18
**Phases:** 4 | **Plans:** 7

### What Was Built
- docs/guides/ → docs/agent-guides/ 리네이밍 (5개 파일 git mv 히스토리 보존)
- docs/admin-manual/ 9개 파일 생성 (README 인덱스 + 8개 운영 매뉴얼, 한국어+frontmatter)
- skills/ 12개 파일에서 masterAuth 콘텐츠 완전 제거 (admin/setup 스킬 삭제, 7개 sessionAuth 전용 재작성)
- @waiaas/openclaw-plugin 패키지 (17개 sessionAuth 도구, 5그룹, fetch HTTP 클라이언트, 8-test suite)
- release-please + turbo + npm publish + smoke-test 파이프라인 통합
- openclaw-integration.md 플러그인 우선 구조 재작성 + SEO 랜딩 페이지 + 사이트 30페이지 빌드

### What Worked
- Phase 구조가 자연스러운 파이프라인: 디렉토리 리네임(452) → 콘텐츠 분리(453) → 플러그인 구현(454) → CI/CD+SEO(455)
- skills/ 정리가 admin-manual/ 생성 후에 진행되어 masterAuth 콘텐츠의 명확한 이전 대상 확보
- workspace:* 의존성이 rc 버전에서도 정상 해석 — monorepo 내부 SDK 참조 문제 회피
- site/build.mjs가 admin-manual frontmatter 기반으로 자동 포함 — EXCLUDE_DIRS 빈 배열만으로 충분

### What Was Inefficient
- REQUIREMENTS.md DOC-05~15 + SKL-01~12 체크박스 미갱신 — Phase 453 실행 완료 후 traceability 미업데이트
- Plan에서 ~22개 도구 목표였으나 실제 17개 — 사전 도구 목록 확정 부재로 plan/reality 갭
- 453 phase에서 telegram-setup.md frontmatter 누락 발견 — site build 실패로 auto-fix (예방 가능했음)

### Patterns Established
- docs/agent-guides/ + docs/admin-manual/ 2-tier 문서 구조 (에이전트/관리자 명확 분리)
- OpenClaw 플러그인 패턴: register() + 5-group tool registrar + fetch HTTP client
- site/build.mjs EXCLUDE_DIRS=[] + frontmatter 기반 자동 포함 패턴

### Key Lessons
1. 문서/스킬 파일 정리는 "이동 대상 먼저 준비" 원칙이 효과적 — admin-manual 생성 → skills 정리 순서
2. 도구 수 추정은 사전 열거 필수 — ~22 vs 17 갭은 plan 단계에서 해결 가능했음
3. site build는 모든 마크다운에 frontmatter 필수 — CI에서 사전 검증 추가 고려

### Cost Observations
- Model mix: 100% opus (quality profile)
- Sessions: 1
- Notable: 4 phases 1일 완료, 239 files 변경 but 대부분 docs/skills/config 파일 (코어 로직 변경 없음)

---

## Milestone: v32.6 — 성능 + 구조 개선

**Shipped:** 2026-03-17
**Phases:** 4 | **Plans:** 9

### What Was Built
- N+1 쿼리 6곳 배치 전환 (sessions, wallets, tokens — IN()/GROUP BY 단일 쿼리)
- sessions/policies API limit/offset 페이지네이션 + SDK listSessions/listPolicies + MCP list_sessions
- migrate.ts 분할: 3,529줄 → 285줄 러너 + schema-ddl + 6개 마이그레이션 모듈
- daemon.ts 분할: 2,412줄 → 327줄 셸 + startup/shutdown/pipeline
- database-policy-engine.ts 분할: 2,318줄 → 852줄 오케스트레이터 + 8 evaluator
- stages.ts 분할: 2,330줄 → 6 stage + pipeline-helpers + barrel re-export
- Solana mapError() 중앙화 (14 catch 패턴) + ILogger 인터페이스

### What Worked
- 순차적 의존 구조 (N+1→pagination→file split→pipeline) 가 자연스러운 빌드업 제공
- migrate.ts 분할이 깔끔하게 성공 — 버전 범위별 자연 경계 존재
- Gap closure 패턴: 첫 executor가 daemon/policy-engine 분할 건너뛴 것을 두 번째 executor가 완료
- DaemonState/ParseRulesContext 인터페이스로 private field 결합 문제 해결

### What Was Inefficient
- daemon.ts 분할에서 첫 executor가 "tight coupling" 이유로 회피 — gap closure에 추가 시간 소요
- 30+ private field가 있는 클래스 분할 시 사전 전략(인터페이스 추출) 명시 필요
- E2E 테스트 paginated response 업데이트가 audit에서 발견됨 — plan 단계에서 E2E 영향 분석 누락

### Patterns Established
- DaemonState 인터페이스: 대형 클래스 분할 시 상태를 인터페이스로 노출하는 패턴
- ParseRulesContext: 정책 evaluator에 필요한 의존성을 컨텍스트 객체로 전달
- barrel re-export: 대형 모듈 분할 후 기존 import 경로 유지
- mapError() 중앙화: 어댑터별 에러 분류 함수로 catch 중복 제거

### Key Lessons
- 대형 파일 분할 시 첫 번째 시도에서 "위험하다"고 회피하는 경향 존재 — 인터페이스 추출 전략을 plan에 명시하면 executor가 실행 가능
- 페이지네이션 추가 시 모든 소비자(daemon tests, admin UI, E2E tests, SDK, MCP) 체크리스트 필요
- 순수 리팩토링 마일스톤은 기능 마일스톤보다 빠르게 완료 (~2시간)

---

## Milestone: v32.0 — Contract Name Resolution

**Shipped:** 2026-03-15
**Phases:** 3 | **Plans:** 4 | **Sessions:** 1

### What Was Built
- ContractNameRegistry: 4-tier priority resolution (Action Provider > Well-known > Whitelist > Fallback)
- 305+ well-known contract entries across 6 networks (5 EVM + Solana)
- 17 Action Provider displayName metadata + snakeCaseToDisplayName auto-conversion
- CONTRACT_CALL notification enrichment at 7 call sites ("Protocol Name (0xabcd...1234)")
- TxDetailResponse contractName/contractNameSource API enrichment (5 endpoints)
- Admin UI contract name display in transaction list + wallet Activity tab

### What Worked
- 3 phases, 1일 완료 — 깔끔한 3-phase 분리 (데이터/노티/UI)가 의존성 체인을 명확하게 만듦
- Well-known 데이터를 정적 TypeScript const로 구현 — DB 마이그레이션 불필요, 빌드 타임 검증
- resolveNotificationTo/resolveContractFields 헬퍼 패턴이 여러 호출지점에서 재사용 가능

### What Was Inefficient
- Summary 파일에 one_liner 필드가 없어 milestone 완료 시 수동 추출 필요

### Patterns Established
- 정적 well-known 데이터 패턴: TypeScript const + 테스트 무결성 검증
- Notification enrichment 패턴: resolveNotificationTo helper로 타입별 분기 처리
- API response enrichment: resolveContractFields helper로 transaction enrichment 일관 적용

### Key Lessons
- 4-tier 우선순위 설계가 향후 확장(ENS/Etherscan) 시 계층만 추가하면 되는 확장점이 됨
- fallback source에서 null 반환하여 이미 toAddress가 raw address를 제공하는 중복을 방지

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 전체 마일스톤이 단일 autopilot 세션으로 완료 (planning + execution + audit + completion)

---

## Milestone: v31.18 — Admin UI IA 재구조화

**Shipped:** 2026-03-15
**Phases:** 4 | **Plans:** 7 | **Sessions:** 1

### What Was Built
- 사이드바 5개 섹션 헤더(Wallets/Trading/Security/Channels/System) 그룹화 + Dashboard 독립 배치
- 페이지 리네이밍(DeFi→Providers, Security→Protection, System→Settings) + 5개 레거시 경로 리다이렉트
- Tokens/RPC Proxy 독립 페이지를 Wallets/Settings 페이지 탭으로 병합
- Hyperliquid/Polymarket Settings 탭 제거 → Providers 페이지 PROVIDER_ADVANCED_SETTINGS 중앙화
- 지갑 상세 8탭→4탭(Overview/Activity/Assets/Setup) 통합 + Owner Protection 카드 인라인

### What Worked
- 4 phases 1일 완료 — 순수 프론트엔드 IA 재구조화, 백엔드 변경 없음
- NAV_SECTIONS 섹션 구조가 map() 기반 렌더링으로 간결하게 구현됨
- TabNav 공통 컴포넌트가 Hyperliquid/Polymarket 커스텀 탭을 일관성 있게 대체
- pendingNavigation 패턴이 /tokens → /wallets#tokens 탭 활성화 리다이렉트를 깔끔하게 처리
- PROVIDER_ADVANCED_SETTINGS 맵으로 Trading 설정을 한 곳에서 관리(SSoT)
- 기존 탭 함수(StakingTab, NftTab 등)를 그대로 재사용하여 ActivityTab/AssetsTab/SetupTab 래퍼만 추가

### What Was Inefficient
- SUMMARY.md one_liner 필드 여전히 미기입 — summary-extract 도구 결과 null (반복 이슈)
- Phase 419 ROADMAP.md Progress 테이블 milestone 컬럼 값 누락(1/1로 잘못 기입)
- 2개 dead code 파일(SettingsPanel.tsx, PolymarketSettings.tsx) 잔류 — 테스트 참조로 인해 삭제 보류

### Patterns Established
- **NAV_SECTIONS 섹션 구조**: `{ section: string, items: NavItem[] }[]` 배열로 사이드바 그룹 렌더링
- **탭 병합 패턴**: 독립 페이지 → named export Content + 부모 페이지 TabNav 통합
- **필터 토글 탭**: sub-tab 대신 signal 기반 필터 버튼으로 동일 탭 내 콘텐츠 전환(ActivityTab)
- **인라인 관리 패턴**: Owner Protection 카드에서 showOwnerManage signal로 관리 플로우 인라인 토글

### Key Lessons
1. 순수 프론트엔드 IA 재구조화는 백엔드 의존 없이 빠르게 진행 가능 — API 변경 0으로 리스크 최소
2. 탭 병합 시 Content named export + default export 제거 패턴이 기존 코드 최소 변경으로 효과적
3. 레거시 경로 리다이렉트는 pendingNavigation + hash 조합으로 탭 활성화까지 처리 가능
4. dead code는 테스트에서 참조하면 삭제가 번거로워짐 — 테스트 먼저 업데이트 후 삭제 권장

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 52 files, +3,311/-515 lines in 1 day — 기존 컴포넌트 재사용으로 높은 효율

---

## Milestone: v31.17 — OpenAPI 기반 프론트엔드 타입 자동 생성

**Shipped:** 2026-03-15
**Phases:** 5 | **Plans:** 11 | **Sessions:** ~3

### What Was Built
- Build-time OpenAPI spec 추출(createApp stub deps) + openapi-typescript v7 타입 자동 생성 파이프라인
- openapi-fetch 기반 타입 안전 API 클라이언트 + X-Master-Password 인증 미들웨어
- Admin UI 18+ 페이지 수동 interface → 생성 타입 alias 점진적 마이그레이션 (satisfies 검증)
- Provider discovery API(enabledKey/category/isEnabled) + settings schema 엔드포인트
- @waiaas/shared 상수 모듈 (정책/크레덴셜/에러 코드 브라우저 안전 re-export)
- OpenAPI spec ↔ Admin UI 필드 사용 contract test CI 게이트

### What Worked
- 5 phases 1일 완료 — Zod SSoT + OpenAPIHono 기반 인프라가 완비되어 spec 추출이 자연스럽게 동작
- createApp stub deps 패턴(412-01)이 빌드 타임 spec 추출의 핵심 — 전체 서비스 의존성 없이 라우트만 등록
- types.aliases.ts 중앙 모듈이 생성 타입 alias를 한 곳에서 관리하여 페이지별 import 최소화
- satisfies GeneratedType 패턴이 테스트 mock 객체의 구조 검증을 컴파일 타임에 보장
- @waiaas/shared 상수 모듈(pure TS, no Zod)이 브라우저+Node 양쪽에서 안전하게 사용 가능
- CI freshness gate + contract test 이중 게이트로 backend-frontend 불일치 사전 차단

### What Was Inefficient
- Phase 415 plan markers가 ROADMAP.md에서 `[ ]`로 표시되어 있었으나 실제로는 complete (표기 불일치)
- SUMMARY.md one_liner 필드 여전히 미기입 — summary-extract 도구 결과 null (이전 마일스톤과 동일 반복)
- settings/schema API 엔드포인트가 생성되었으나 Admin UI에서 소비하지 않음 (설계-구현 간 gap)
- wallets.tsx(3,417줄) 마이그레이션이 deferred — 전체 마이그레이션 목표 대비 가장 큰 페이지 미완

### Patterns Established
- **OpenAPI spec 추출 패턴**: createApp({...stubDeps}) → openapi-typescript → types.generated.ts → CI freshness
- **타입 안전 클라이언트 패턴**: openapi-fetch + middleware(auth + error) → path 기반 타입 자동 추론
- **생성 타입 alias 패턴**: types.aliases.ts 중앙 모듈에서 path-level extraction → 페이지에서 import
- **브라우저 안전 상수**: @waiaas/shared에 pure TS 상수(no Zod) → Admin UI + daemon 양쪽 사용
- **Contract test 패턴**: OpenAPI spec 응답 키 vs Admin UI 사용 키 자동 비교 CI 게이트

### Key Lessons
- Stub deps로 createApp 인스턴스를 만들면 전체 서비스 부트스트랩 없이 OpenAPI spec을 추출할 수 있다
- openapi-fetch의 미들웨어 패턴이 헤더 주입/에러 처리를 한 곳에서 관리하게 해줌
- 대규모 페이지(wallets.tsx 3,417줄)는 별도 마일스톤으로 분리하는 것이 현실적
- SUMMARY.md one_liner 필드 미기입이 반복 — 실행 시 자동 채우는 메커니즘 필요

### Cost Observations
- Model mix: 100% opus
- Sessions: ~3
- Notable: 136 files, +19,066/-4,788 lines in 1 day — 대부분 기계적 타입 전환이어서 높은 생산성

## Milestone: v31.16 — CAIP 표준 식별자 승격

**Shipped:** 2026-03-15
**Phases:** 5 | **Plans:** 8 | **Sessions:** 1

### What Was Built
- normalizeNetworkInput CAIP-2 dual-accept — 15개 네트워크 CAIP-2 매핑 + z.preprocess 전 인터페이스 자동 적용
- CAIP-19 assetId-only 토큰 특정 + 토큰 레지스트리 자동 resolve + 네트워크 자동 추론
- 모든 응답에 chainId(CAIP-2)/assetId(CAIP-19) 런타임 동적 생성 + connect-info supportedChainIds
- SDK Caip2ChainId/Caip19AssetId 타입 + TokenInfo union 확장
- MCP resolve_asset 신규 도구 + send_token/approve_token assetId-only 지원
- 스킬 파일 4종 CAIP-2/19 사용법 문서화

### What Worked
- 5 phases 1일 완료 — CAIP-2/19 인터페이스가 v27.2 CAIP-19 기반 위에 자연스럽게 확장
- z.preprocess 패턴이 단일 변경 지점으로 전 인터페이스 CAIP-2 자동 적용(REST/MCP/SDK 개별 수정 불필요)
- 응답 런타임 동적 생성 결정(D3)이 DB 마이그레이션 없이 모든 응답 CAIP 필드 추가를 가능하게 함
- 감사에서 0 gaps — 사전 요구사항 정의가 정확하여 누락 없이 완료
- enrichment-at-json-boundary 패턴이 7개 route 파일에 일관된 방식으로 적용

### What Was Inefficient
- ROADMAP.md Progress 테이블 형식 불일치(Milestone 컬럼 누락, 컬럼 순서 불일치) — 자동 생성 안 됨
- STATE.md percent 37%로 고정(중간 업데이트 누락) — 실제 100% 완료
- SUMMARY.md one_liner 필드 미기입 — summary-extract 도구 결과 null

### Patterns Established
- CAIP-2 z.preprocess: normalizeNetworkInput에 CAIP-2 → canonical 매핑 추가, z.preprocess로 전 스키마 자동 적용
- 응답 enrichment: enrichBalance/enrichAsset/enrichTransaction 등 유틸 함수, c.json() 경계에서 호출
- assetId-only: TokenInfoBaseSchema superRefine에서 assetId 존재 시 address/decimals/symbol optional 전환
- resolve middleware: resolveTokenFromAssetId 미들웨어로 레지스트리 lookup + 네트워크 추론

### Key Lessons
1. DB 마이그레이션 없는 런타임 동적 생성은 additive-only 필드 추가에 최적 — 저장 불필요한 파생 필드는 항상 런타임 선호
2. z.preprocess 단일 지점 변환은 cross-cutting concern에 매우 효과적 — 네트워크 정규화를 스키마 레벨에서 처리
3. MCP 도구는 core 의존성 최소화(local parser) 후 API 클라이언트로 풍부한 데이터 조회 — 의존성 분리 원칙 유지

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 71 files, +4,783/-119 lines, 1일 완료 — additive-only 변경이라 기존 코드 수정 최소화

---

## Milestone: v31.15 — Amount 단위 표준화 및 AI 에이전트 DX 개선

**Shipped:** 2026-03-14
**Phases:** 5 | **Plans:** 9 | **Sessions:** 1

### What Was Built
- 14개 non-CLOB provider 스키마에 명시적 단위 description(.describe()) 추가 + CLOB 3개 exchange-native 단위 문서화
- 4개 레거시 provider(Aave V3/Kamino/Lido/Jito) smallest-unit 전환 + migrateAmount() 하위 호환 자동 변환
- MCP typed schema 등록(jsonSchemaToZodParams) + GET /v1/actions/providers inputSchema JSON Schema 노출
- amountFormatted/amountDecimals/amountSymbol + balanceFormatted 런타임 응답 보강
- humanAmount XOR 파라미터 — REST API + 10 action providers + MCP 자동 노출
- SDK humanAmount 타입 + 스킬 파일 4종 단위 가이드 + E2E humanAmount 시나리오 검증

### What Worked
- 5 phases 1일 완료 — 연구 단계에서 scope가 명확히 정의되어 빠른 구현
- migrateAmount() 공유 헬퍼 패턴이 4개 provider 마이그레이션을 단순화하고 하위 호환성 유지
- per-provider humanAmount naming(humanAmount/humanSellAmount/humanAmountIn) 결정이 기존 필드명과 자연스럽게 대응
- safeZodToJsonSchema + jsonSchemaToZodParams 양방향 변환으로 MCP typed schema와 REST API 독립 유지

### What Was Inefficient
- HAMNT-01/02/03 REQUIREMENTS.md 체크박스 수동 업데이트 누락 — 감사에서 발견, 별도 커밋 필요
- 405-01-SUMMARY.md 프론트매터 requirements-completed 누락 — 자동 체크 미비
- VERIFICATION.md 전 5 phases 미생성 — verifier agent 실행 생략됨
- zero-amount regression(migrateAmount 행동 변화) 감사에서 뒤늦게 발견 — 단위 테스트 기대값 업데이트 누락

### Patterns Established
- migrateAmount() 패턴: 소수점 감지로 human-readable → smallest-unit 자동 변환 + deprecation 경고
- Provider humanAmount: per-provider 필드 명명 규칙(원본 amount 필드명에 human 접두어)
- MCP typed schema: Zod → JSON Schema → Zod 라운드트립, z.record(z.unknown()) fallback
- 응답 보강: 런타임 계산(DB 저장 없음), null fallback(decimals 불명)

### Key Lessons
1. 단위 변경은 행동 변화 — parseTokenAmount → migrateAmount 전환 시 zero-amount 검증 이동 확인 필수
2. REQUIREMENTS.md 체크박스는 코드 완료와 동시에 업데이트해야 함 — 감사 단계에서 발견은 비효율
3. humanAmount XOR 검증은 Zod superRefine보다 route handler에서 하는 것이 discriminatedUnion 호환성 유지에 적합

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 89 files, +7,834/-737 lines, 1일 완료 — 단위 표준화가 전체 인터페이스에 영향하지만 패턴이 반복적

---

## Milestone: v29.7 — D'CENT 직접 서명 + Human Wallet Apps 통합

**Shipped:** 2026-03-01
**Phases:** 6 | **Plans:** 11 | **Sessions:** 1

### What Was Built
- D'CENT preset sdk_ntfy 전환 — approval_method를 walletconnect에서 sdk_ntfy로 변경, wallet_type 기반 서명 토픽 라우팅
- Admin UI Owner 탭 개선 — Wallet Type 선택/변경 UI, approval method 미리보기, WalletConnect 조건부 표시, 상태별 읽기 전용
- wallet_apps DB 테이블(migration v31) + WalletAppService CRUD + REST API 4 엔드포인트 + signing_enabled 차단
- Human Wallet Apps Admin UI 최상위 메뉴 — 앱 카드(Signing/Alerts 토글, Used by 목록), ntfy 서버 설정, 앱 등록/삭제
- WalletNotificationChannel 앱별 토픽(waiaas-notify-{name}) 발행 전환 + Alerts 토글 반영
- Notifications ntfy 독립 FieldGroup 분리 + Human Wallet Apps 링크

### What Worked
- 6 phases 전체 1일 완료 — 설계 문서(m29-07)가 DB 스키마/API/UI까지 상세히 정의되어 빠른 구현
- wallet_apps DB 테이블 정규화 결정이 Used by 역추적, signing_enabled 차단, alerts_enabled 라우팅 전부 깔끔하게 해결
- 기존 PresetAutoSetupService의 sdk_ntfy case 분기를 재활용하여 코드 변경 최소화
- Admin UI 컴포넌트 패턴(FieldGroup, Toggle, Card) 재사용으로 293/295 구현이 빠름

### What Was Inefficient
- REQUIREMENTS.md traceability 상태가 대부분 Pending으로 유지된 채 아카이브 — 자동 상태 업데이트 미구현 (반복 이슈)
- Phase 291 plan 목록에 `[ ]` 체크 미갱신 (ROADMAP.md의 Plan checklist가 수동)

### Patterns Established
- wallet_apps 정규화 테이블 패턴: 앱 엔티티를 Settings key-value가 아닌 DB 테이블로 관리, FK 역추적 자연스러움
- 앱별 토픽 네이밍: signing용 `waiaas-sign-{wallet_apps.name}`, alerts용 `waiaas-notify-{wallet_apps.name}` — 동일 네임스페이스
- Admin UI 메뉴 승격 패턴: 기존 서브섹션 제거 → 최상위 메뉴 추가 + 설정 키 유지(내부 호환)

### Key Lessons
1. DB 테이블 정규화가 Settings JSON보다 확장성 높음 — CRUD + 토글 + 역추적 + 차단 로직 전부 SQL로 해결
2. 프리셋 변경은 정의 변경만으로 기존 로직 분기가 자동 활성화 — 코드 수정 최소화 설계의 가치
3. "Human Wallet Apps" 네이밍이 기술 용어("Signing SDK")보다 사용자 친화적 — 메뉴 구조가 사용자 멘탈 모델과 일치

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 73 파일, +7,424/-428 lines, 1일 완료 — DB+API+UI 풀스택 구현이 설계 문서 덕분에 빠름

---

## Milestone: v29.6 — Pendle Yield Trading + Yield 프레임워크

**Shipped:** 2026-03-01
**Phases:** 3 | **Plans:** 8 | **Sessions:** 1

### What Was Built
- IYieldProvider 인터페이스 — IActionProvider 확장, getMarkets/getPosition/getYieldForecast 3 메서드, MATURED 포지션 상태 추가
- PendleYieldProvider — 5 Yield 액션(buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity), Pendle REST API v2 Convert 엔드포인트 기반
- PendleApiClient — Pendle REST API v2 래퍼, Zod 스키마 검증, 무료 티어 100 CU/분 지원
- MaturityMonitor — IDeFiMonitor 구현, 1일 1회 폴링, 만기 7일/1일 전 경고 + 만기 후 미상환 경고, 24시간 쿨다운
- Admin Settings 7키 + MCP 5도구 자동 등록 + actions.skill.md Pendle Yield Trading 섹션
- 버그 수정: #216 Solana WSS URL prefix, #217 Lido factory default network residue

### What Worked
- v29.0 설계 문서(Phase 271 Yield 프레임워크 설계)가 구현 방향을 명확히 하여 빠른 구현 가능
- REST API Convert 엔드포인트 선택으로 SDK 의존성 없이 깔끔한 구현 — 외부 의존성 최소화 전략 유효
- 기존 ActionProvider/PositionTracker/DeFi 모니터링 프레임워크 재사용 — v29.0/v29.2에서 구축한 인프라의 가치 확인
- 50 파일 변경만으로 완전한 Yield Trading 스택 구현 — 프레임워크 추상화가 잘 작동

### What Was Inefficient
- Phase directory에 SUMMARY.md 없이 작업 완료 — GSD 추적과 실제 코드 커밋 사이 동기화 누락
- REQUIREMENTS.md traceability 상태가 Pending으로 유지된 채 아카이브 — 자동 상태 업데이트 미구현

### Patterns Established
- Yield Provider 패턴: IYieldProvider extends IActionProvider + Convert API calldata → ContractCallRequest 반환
- DeFi Provider 3-tier 구성: ApiClient(HTTP 래퍼) → Provider(IYieldProvider 구현) → Integration(Settings+MCP+Admin)
- MaturityMonitor 패턴: IDeFiMonitor + 만기 기반 경고 3단계(7일/1일/만기후) + 쿨다운

### Key Lessons
1. REST API 기반 DeFi Provider 패턴이 확립됨 — SDK 없이 HTTP calldata 빌드 → ContractCallRequest 반환이 표준 패턴
2. v29.0 설계 단계에서의 인터페이스 정의가 구현 속도를 극대화 — 설계 투자 ROI 확인
3. Pendle 무료 티어(100 CU/분)로도 기본 기능 충분 — 유료 API 키는 선택적 최적화

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 1일 완료, 50 파일 +3,940 lines — DeFi Provider 추가가 프레임워크 덕분에 빠름

---

## Milestone: v29.5 — 내부 일관성 정리

**Shipped:** 2026-02-28
**Phases:** 3 | **Plans:** 7 | **Sessions:** 1

### What Was Built
- API 키 이중 저장소 해소: ApiKeyStore 완전 제거, SettingsService SSoT 통합, DB migration v28 (api_keys→settings)
- Solana 네트워크 ID 전 스택 통일: `solana-mainnet` 형식, DB migration v29 (6 테이블 12-step recreation), 레거시 자동 변환
- Push Relay 서명 응답 릴레이: POST /v1/sign-response 엔드포인트 + sendViaRelay() SDK 함수
- normalizeNetworkInput() + NetworkTypeEnumWithLegacy Zod preprocess 하위 호환 레이어

### What Worked
- Issue-driven milestone: #214/#211/#215 세 가지 구체적 이슈에 집중하여 스코프가 명확했음
- DB migration 순서 결정(v28→v29)을 사전에 확정하여 충돌 없이 순차 적용
- Audit 선행으로 skills 파일 네트워크 예시 오류 2건 사전 수정
- 156 파일 변경에도 불구하고 5,595+ 전체 테스트 PASS — 기존 테스트 인프라의 가치 확인

### What Was Inefficient
- Phase 287 (Push Relay)은 quick task로 처리되어 phase directory/SUMMARY.md 없음 — gsd-tools roadmap analyze에서 누락
- REQUIREMENTS.md traceability 상태가 Pending으로 유지됨 (audit에서는 satisfied 확인) — 자동 업데이트 미구현

### Patterns Established
- config.toml 키 유지 + 런타임 양방향 매핑(`rpcConfigKey`/`configKeyToNetwork`) — 네이밍 변경 시 config 호환 패턴
- Zod preprocess + normalizer 조합으로 API 하위 호환 레이어 구축

### Key Lessons
1. 내부 일관성 마일스톤은 기능 추가보다 파일 변경이 광범위하지만 오래 끌리지 않음 — 1일 완료
2. 이중 저장소 문제는 발견 즉시 SSoT 통합이 최선 — dual-write나 sync보다 단일 저장소 전환
3. 네트워크 ID 리네이밍은 DB migration + Zod preprocess + config 매핑 3-layer로 하위 호환 확보 가능

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 156 파일 변경, 순 삭제(-1,220 > +3,990 중 상당수 테스트 업데이트) — 정리 마일스톤 특성

---

## Milestone: v29.0 — 고급 DeFi 프로토콜 설계

**Shipped:** 2026-02-26
**Phases:** 6 | **Plans:** 12 | **Sessions:** 1

### What Was Built
- defi_positions 통합 테이블 + PositionTracker 차등 폴링 + REST API + Admin 와이어프레임
- IDeFiMonitor 공통 프레임워크 + 3개 모니터(HealthFactor/Maturity/Margin) + 4 알림 이벤트
- ILendingProvider + IYieldProvider + IPerpProvider 3개 프레임워크 + 프로토콜 매핑(Aave/Kamino/Morpho/Pendle/Drift)
- SignableOrder EIP-712 Intent 서명 패턴 + 10-step 파이프라인 + 4-layer 보안 모델
- m29-00 설계 문서 26개 섹션, 59 설계 결정

### What Worked
- 인프라-우선 순서(positions → monitoring → frameworks → intent)로 의존성 자연 해소
- 6 phases 전체를 1 세션에 완료 — 설계 마일스톤은 실행 속도가 빠름
- 기존 IActionProvider/PolicyEngine 패턴 재사용으로 프레임워크 설계 일관성 확보
- Audit 선행으로 갭 사전 식별 (4건 low-severity, 전부 구현 시 해결 가능)

### What Was Inefficient
- SUMMARY.md 포맷 불일치 (268은 markdown, 269-273은 YAML frontmatter) — gsd-tools summary-extract 실패
- Audit에서 발견한 slug 오타(273-01 → '272-perp-framework-design') 수정 미반영

### Patterns Established
- DeFi 프레임워크 설계 패턴: IXxxProvider extends IActionProvider + XxxPolicyEvaluator + XxxMonitor + 프로토콜 매핑
- 설계 마일스톤에서 m{seq}-{sub} 설계 문서 섹션 번호 체계 활용

### Key Lessons
1. 설계 마일스톤은 6 phases도 1일 1세션에 완료 가능 — 코드 작성 없이 문서만 산출
2. 프로토콜 매핑 테이블은 구현 시 가장 유용한 산출물 — API/SDK/ABI 호출 매핑 미리 정의

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 설계 문서 전용 마일스톤은 context 효율적 (코드 변경 없음, +11,805 lines docs only)

---

## Milestone: v29.10 — ntfy 토픽 지갑별 설정 전환

**Shipped:** 2026-03-02
**Phases:** 2 | **Plans:** 4 | **Sessions:** 1

### What Was Built
- DB migration v33: wallet_apps 테이블에 sign_topic/notify_topic 컬럼 추가, 기존 행 prefix+appName 기본값 backfill
- SignRequestBuilder/WalletNotificationChannel DB 기반 per-wallet 토픽 라우팅 (NULL시 prefix fallback)
- 글로벌 NtfyChannel 인스턴스 제거 (daemon.ts, hot-reload) — per-wallet 토픽이 유일한 알림 경로
- REST API wallet-apps 엔드포인트에 sign_topic/notify_topic 필드 추가 (POST/PUT/GET)
- Admin UI Notifications 페이지 글로벌 Ntfy 카드 제거 + Human Wallet Apps per-wallet 토픽 표시/인라인 편집
- admin.skill.md per-wallet topic API 동기화

### What Worked
- v29.7에서 확립된 wallet_apps 테이블 패턴 활용으로 스키마 확장이 자연스러움 (sign_topic/notify_topic 2컬럼 추가만으로 해결)
- 2 phase 4 plan으로 범위가 명확하게 제한되어 ~1.5시간 만에 전체 완료
- NULL 토픽 = prefix fallback 전략으로 기존 동작 100% 하위호환 보장
- 글로벌 NtfyChannel 제거가 실질적 기능 손실 없이 깔끔하게 정리 (Push Relay 미구독 토픽이었으므로)

### What Was Inefficient
- 302-02 SUMMARY에서 보고된 pre-existing test failures (signing-sdk-migration, settings-service, migration-chain) — 이전 plan에서 발생한 assertion 변경이 후속 정리 안 됨
- Phase 303 ROADMAP.md에서 303-01 plan 체크박스가 unchecked(`[ ]`)인 채로 남음 — plan 완료 시 자동 반영 미구현 반복 이슈

### Patterns Established
- Per-wallet DB 토픽 라우팅 패턴: wallet_apps 컬럼 직접 저장 → channel에서 DB SELECT → NULL시 prefix 폴백
- 글로벌 설정 → 엔티티별 설정 마이그레이션 패턴: 설정 키 삭제 + DB 컬럼 추가 + backfill + fallback

### Key Lessons
- 엔티티별 설정으로 전환 시 NULL fallback 전략이 하위 호환성의 핵심 — 기존 코드가 중단 없이 동작
- Settings 키 삭제 시 hot-reload/daemon startup/admin 경로 3곳 동시 수정 필요 — 놓치면 런타임 crash

### Cost Observations
- Model mix: 100% opus (quality profile)
- Sessions: 1
- Notable: 범위가 작고 패턴이 확립되어 매우 효율적 (43 files, +2,877/-138 lines, 20 commits)

---

## Milestone: v30.0 — 운영 기능 확장 설계

**Shipped:** 2026-03-03
**Phases:** 5 | **Plans:** 11 | **Sessions:** 1

### What Was Built
- Transaction Dry-Run 설계 — SimulationResult Zod 스키마(12 warning codes, 4-axis), PipelineContext dryRun 분기, REST/SDK/MCP 스펙
- Audit Log Query API 설계 — AuditEventType 20개(9 기존 + 11 신규), cursor pagination, GET /v1/audit-logs masterAuth
- Encrypted Backup & Restore 설계 — AES-256-GCM 암호화 아카이브 포맷(60B 헤더), EncryptedBackupService, CLI 4 커맨드
- Webhook Outbound 설계 — HMAC-SHA256 서명, webhooks+webhook_logs DB, 4-attempt 재시도 큐, REST API 4 엔드포인트
- Admin Stats + AutoStop Plugin 설계 — 7-category Zod 스키마, IMetricsCounter, IAutoStopRule 플러그인, RuleRegistry

### What Worked
- 5 phases 전체 ~50분 완료 — 기존 코드베이스(233K LOC)에 대한 깊은 이해로 설계 결정이 빠르게 수렴
- 각 Phase DESIGN-SPEC.md에 Zod 스키마, 인터페이스, DB 스키마, API 스펙, 테스트 시나리오를 포함하여 구현 마일스톤의 입력이 완전함
- Phase 간 의존성(305→307, 304+305→308)이 자연스럽게 이벤트 체계를 공유하도록 설계
- 기존 패턴 재활용: insertAuditLog helper(raw SQL), IMetricsCounter(IForexRateService 패턴), RuleRegistry(ActionProviderRegistry 패턴)

### What Was Inefficient
- 없음 — 설계 전용 마일스톤이라 코드 변경 없이 순수 문서 작업

### Patterns Established
- OPS-* 설계 스펙 패턴: 각 기능을 독립 DESIGN-SPEC.md로 분리하되, 이벤트 체계(AuditEventType)를 공통 기반으로 공유
- Plugin Architecture 패턴: IAutoStopRule + RuleRegistry로 하드코딩 없는 규칙 확장, ActionProvider와 동일한 등록 패턴
- Secret dual-storage 패턴: 노출 방지용 해시 + 연산용 암호화 값 이중 저장

### Key Lessons
- 설계 전용 마일스톤은 50분 내 완료 가능 — 코드베이스 이해도가 높을 때 설계 결정이 빠르게 수렴
- 이벤트 체계를 먼저 확립하면(Phase 305 → 307, 308) 하위 기능 설계가 자연스럽게 정렬됨
- VACUUM INTO는 파일 복사보다 안전한 DB 스냅샷 방법 (WAL 일관성 보장)

### Cost Observations
- Model mix: 100% opus (quality profile)
- Sessions: 1
- Notable: 설계 전용 마일스톤 — 30 파일 ~50분 완료, +8,132 lines (대부분 DESIGN-SPEC.md)

---

## Milestone: v30.6 — ERC-4337 Account Abstraction 지원

**Shipped:** 2026-03-04
**Phases:** 3 | **Plans:** 10 | **Sessions:** 1

### What Was Built
- SmartAccountService — viem toSoladySmartAccount 기반 CREATE2 주소 예측, EntryPoint v0.7 전용
- DB migration v38 — wallets 테이블에 account_type/signer_key/deployed/entry_point 4 컬럼 추가
- Admin Settings 25개 — smart_account.enabled feature gate, bundler/paymaster URL, chain-specific overrides
- UserOperation Pipeline — stage5Execute accountType 분기, BundlerClient/PaymasterClient 연동, BATCH 원자적 실행
- Paymaster Gas Sponsorship — 자동 스폰서십 + rejection 패턴 감지 + agent 직접 가스 폴백
- 전 인터페이스 확장 — CLI --account-type, SDK createWallet, MCP wallet detail, Admin UI Account Type 셀렉터

### What Worked
- 3 phases 전체 ~2h 완료 — 기존 pipeline 아키텍처가 accountType 분기만으로 확장 가능했음
- viem/account-abstraction 모듈이 검증된 SmartAccount 구현체를 제공하여 커스텀 컨트랙트 불필요
- 기존 5-type TransactionRequestSchema 변경 없이 내부 실행 경로만 분기하여 EOA 호환성 100% 유지
- On-demand settings 패턴으로 hot-reload 인프라 불필요 — SmartAccountService가 요청 시마다 settings 읽기

### What Was Inefficient
- Phase 315 SUMMARY.md 미생성 — 4개 plan 실행 후 summary 파일 누락 (executor가 생성하지 않은 것으로 추정)
- REQUIREMENTS.md traceability 상태 전부 Pending으로 아카이브 — 자동 상태 업데이트 여전히 미구현

### Patterns Established
- accountType 분기 패턴: stage5Execute에서 EOA/Smart 실행 경로 분리, 나머지 pipeline(정책, 감사, 알림) 공유
- Paymaster rejection 패턴 매칭: error message에서 'paymaster'/'PM_'/'Paymaster' 문자열 감지

### Key Lessons
- viem 라이브러리의 타입 시스템이 극도로 복잡 — SmartAccountService.client에 `any` 사용이 실용적 선택
- 기존 아키텍처가 잘 설계되어 있으면 새 기능 추가가 분기 한 줄로 가능 — accountType 분기가 전형적 사례

### Cost Observations
- Model mix: 100% opus (quality profile)
- Sessions: 1
- Notable: 3 phases, 10 plans, 21 commits, 49 files, +4,709 lines — ~2h 완료

---

## Milestone: v30.8 — ERC-8004 Trustless Agents 지원

**Shipped:** 2026-03-04
**Phases:** 7 | **Plans:** 15 | **Sessions:** 1

### What Was Built
- DB v39-40 (agent_identities, reputation_cache, approval_type, policies CHECK REPUTATION_THRESHOLD)
- Erc8004ActionProvider 8 write actions + RegistryClient viem wrapper + 3 ABI constants
- 4 read-only REST endpoints + connect-info erc8004 per-wallet extension
- ReputationCacheService 3-tier cache (memory→DB→RPC) + REPUTATION_THRESHOLD policy engine (Stage 3 position 6)
- EIP-712 typed data wallet linking + ApprovalWorkflow dual-routing (SIWE/EIP712) + WcSigningBridge
- Admin UI ERC-8004 page (Identity/Registration File/Reputation 3 tabs) + PolicyFormRouter case 13
- MCP 11 tools + SDK 11 methods + erc8004.skill.md (612 lines) + 182 tests (E1-E20)
- Notification events wiring (5 events emit + cache invalidation post-feedback)

### What Worked
- Zero new dependencies: 전체 ERC-8004 통합을 viem/Zod/Drizzle/Hono 기존 스택으로 구현 — 의존성 충돌 없음
- 7 phases 1일 완료 (50 commits, 121 files) — 설계 문서(m30-08) 상세도가 빠른 구현의 핵심
- 3-tier cache 설계가 RPC 의존성을 효과적으로 차단 — TTL 기반 자동 갱신으로 운영 부담 최소화
- milestone audit 사전 실행으로 INT-01/INT-02 갭을 아카이브 전에 수정

### What Was Inefficient
- SUMMARY.md one_liner 필드 미기재 — gsd-tools summary-extract가 null 반환, 수동 추출 필요
- EIP-712 typehash 온체인 검증(C1)이 여전히 미완 — Anvil fork 테스트 필요하지만 계속 연기

### Patterns Established
- ERC 표준 통합 패턴: ABI constants → RegistryClient → ActionProvider → REST routes → Policy Engine → Admin UI → MCP/SDK
- dual approval routing (SIWE/EIP712): approval_type DB 컬럼 + PipelineContext 분기, 향후 다른 서명 타입 확장 가능
- 3-tier cache 패턴: 인메모리 Map(TTL) → DB 폴백 → RPC 원본, 다른 외부 데이터 캐싱에 재사용 가능

### Key Lessons
1. viem 네이티브 ABI 인코딩이 ethers.js SDK보다 번들 크기·호환성 모두 우위 — ERC 표준 연동에 최적
2. maxTier 에스컬레이션 패턴(기존 티어 유지, 더 높은 것만 적용)이 복수 정책 간 충돌 방지에 효과적
3. feature gate(default false) + validation registry gate 이중 보호가 Draft EIP 통합의 안전한 전략

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 121 files, +15,921/-151 lines, 1일 완료 — 5패키지 걸친 풀스택 ERC 표준 통합

---

## Milestone: v30.9 — Smart Account DX 개선

**Shipped:** 2026-03-05
**Phases:** 3 | **Plans:** 6 | **Sessions:** 1

### What Was Built
- Per-wallet provider model — AA_PROVIDER_NAMES enum(pimlico/alchemy/custom), DB v41 4 columns, 23 global settings 제거
- Auto URL assembly — AA_PROVIDER_CHAIN_MAP(10 networks × 2 providers), API key AES-256-GCM 암호화
- Agent self-service — PUT /v1/wallets/:id/provider dual-auth, PROVIDER_UPDATED audit event
- Wallet response provider status — name/supportedChains/paymasterEnabled or null
- Admin UI — 조건부 프로바이더 필드, dashboard link 동적 전환, detail page inline edit
- Agent discovery — connect-info provider prompt, MCP get_provider_status 29th tool

### What Worked
- v30.6 Smart Account 기반이 잘 준비되어 provider 모델 전환이 명확한 리팩토링으로 완료
- 23개 글로벌 설정 일괄 제거를 clean break로 처리 — deprecated 과도기 없이 깔끔
- Dual-auth 패턴(Bearer prefix 감지)으로 sessionAuth/masterAuth 분기가 단일 엔드포인트에서 자연스럽게 동작
- buildProviderStatus 헬퍼를 wallets.ts에서 정의 후 connect-info에서 재사용(DRY)

### What Was Inefficient
- REQUIREMENTS.md 7개 checkbox가 Phase 324 구현 시 미갱신 — 감사에서 발견 후 일괄 수정 (반복 이슈)
- Skill files 업데이트가 Phase 326까지 누락 — 감사에서 HIGH severity로 발견 후 수정

### Patterns Established
- Per-wallet provider model: 글로벌 설정을 엔티티(지갑) 레벨로 내리는 패턴 (v29.10 ntfy와 동일 흐름)
- HKDF 서브키 분리: 'aa-provider-key-encryption' info string으로 settings-crypto와 독립 키 파생
- Admin UI dashboard URL 브라우저 사이드 미러: @waiaas/core 미사용 환경에서 상수 인라인

### Key Lessons
- REQUIREMENTS.md checkbox 갱신을 plan 실행 단계에서 자동화해야 반복 누락 방지 가능
- Skill files는 API 변경과 동시에 업데이트해야 함 — Phase별로 체크리스트에 포함 필요
- 글로벌→per-entity 전환 시 clean break(deprecated 없이 삭제)가 v30.6 직후라서 가능했음

### Cost Observations
- Model mix: 100% opus (quality profile)
- Sessions: 1
- Notable: 73 files, +7,214/-419 lines, 2일 완료 — DB+API+UI+MCP 풀스택 프로바이더 모델 전환

---

## Milestone: v30.10 — ERC-8128 Signed HTTP Requests

**Shipped:** 2026-03-05
**Phases:** 3 | **Plans:** 7 | **Sessions:** 1

### What Was Built
- RFC 9421 Signature Base + RFC 9530 Content-Digest + EIP-191 signing engine (packages/core/src/erc8128/, 7 modules)
- REST API 2 endpoints (POST /v1/erc8128/sign, /verify) with sessionAuth, domain policy, rate limiting
- ERC8128_ALLOWED_DOMAINS policy (default-deny, wildcard matching, per-domain rate limit 60s sliding window)
- MCP 2 tools + SDK 3 methods (signHttpRequest, verifyHttpSignature, fetchWithErc8128) + connect-info capability
- Admin UI policy form + system settings (6 keys) + erc8128.skill.md + 3 skill files updated
- 2 notification events (ERC8128_SIGNATURE_CREATED, ERC8128_DOMAIN_BLOCKED)

### What Worked
- sign-only pattern (x402 precedent) 재활용으로 트랜잭션 파이프라인 우회, 구현 범위 최소화
- ERC-8128 모듈을 @waiaas/core에 격리하여 spec-dependent 값을 keyid.ts/constants.ts에 집중 — 향후 spec 변경 시 수정 범위 제한
- Milestone audit가 DEFECT-01 (Admin UI settings key mismatch), DEFECT-02 (verify param wiring), DEFECT-03 (stale test counts) 3건을 사전 발견하여 ship 전 수정
- 3 phases 전체 1일 완료 — 설계 패턴(policy evaluator, settings keys, MCP tool wrapping)이 기존 x402/ERC-8004와 동일

### What Was Inefficient
- SUMMARY.md one_liner 필드 미기입 — summary-extract 자동 추출 실패, 수동 accomplishment 작성 필요 (반복 이슈)
- Audit가 defects 발견 후 별도 gap closure phase 없이 직접 fix commit — 프로세스 경량화는 좋지만 추적성 저하

### Patterns Established
- ERC 표준 3종 세트 통합 패턴: x402(결제) + ERC-8004(신원) + ERC-8128(API 인증) — 각각 sign-only, ActionProvider, core module 방식
- connect-info capabilities 동적 확장 패턴: settingsService.get('{feature}.enabled') → capabilities 배열 추가

### Key Lessons
- RFC 표준 자체 구현이 외부 라이브러리보다 안정적일 수 있다 (structured-headers 의존 제거, ~150 LOC 자체 구현)
- Milestone audit의 E2E flow 검증이 DEFECT-01(설정 키 불일치) 같은 integration 결함을 설계/단위 테스트에서 발견하기 어려운 문제를 포착

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 3 phases + audit + defect fix all in 1 session, ~76 files +7,280 lines

## Milestone: v30.11 — Admin UI DX 개선

**Shipped:** 2026-03-05
**Phases:** 3 | **Plans:** 5 | **Sessions:** 1

### What Was Built
- Admin UI 메뉴 DeFi/Agent Identity 재명명 + 라우트 변경 + 레거시 리다이렉트
- ERC-8004 Agent Identity 페이지에 활성화/비활성화 토글 통합
- 전체 10개 액션 프로바이더 기본 활성화 + DB v42 마이그레이션 (INSERT OR IGNORE)
- 액션별 보안 Tier 오버라이드 — Settings 기반 동적 키 + 파이프라인 floor 에스컬레이션
- Admin UI Description 컬럼 + Tier 드롭다운 + 오버라이드 인디케이터 + Reset to default
- 4개 스킬 파일 동기화 (admin/erc8004/actions/policies)

### What Worked
- 3 phases 전체 1일 완료 — 기존 Admin UI 패턴(SettingsData, FieldGroup) 재활용으로 빠른 구현
- INSERT OR IGNORE 마이그레이션 전략이 기존 운영자 설정을 안전하게 존중하면서 신규 기본값 적용
- 동적 tier key regex 패턴으로 30+ 정적 설정 정의 없이 유연한 확장 달성
- Audit 27/27 requirements + 8/8 integration + 4/4 flows 전체 패스

### What Was Inefficient
- ROADMAP.md의 Plan checklist에서 332-01이 `[ ]` 미갱신 상태로 아카이브 (반복 이슈)

### Patterns Established
- 동적 Settings 키 패턴: `actions.{provider}_{action}_tier` regex 기반 해석, 30+ 정적 키 대신 런타임 동적 생성
- Tier floor 에스컬레이션: max(policyTier, actionTier) — 오버라이드는 항상 상향만 가능

### Key Lessons
- INSERT OR IGNORE가 마이그레이션에서 기존 설정 존중 + 신규 기본값 시딩을 동시에 해결하는 안전한 패턴
- native `<select>` 드롭다운이 커스텀 컴포넌트보다 Admin UI 맥락에서 충분하고 더 빠름

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 48 files, 23 commits in ~1 day — small focused milestone

---

## Milestone: v31.0 — NFT 지원 (EVM + Solana)

**Shipped:** 2026-03-06
**Phases:** 5 | **Plans:** 12 | **Sessions:** 1

### What Was Built
- NFT_TRANSFER 6번째 discriminatedUnion type + APPROVE nft 확장 + DB v44 마이그레이션 + CAIP-19 NFT 네임스페이스
- INftIndexer 인터페이스 + Alchemy(EVM) + Helius(Solana) 인덱서 구현체 + NftIndexerClient 재시도/캐싱
- IChainAdapter 25 메서드 확장 — ERC-721/1155 safeTransferFrom + ERC-165 감지 + Metaplex SPL transfer
- NFT Query API — 커서 페이지네이션, 컬렉션 그룹핑, 메타데이터 24h TTL DB 캐싱, IPFS/Arweave 게이트웨이
- NFT_TRANSFER 6-stage 파이프라인 + Smart Account UserOp + 정책(RATE_LIMIT nft_count, CONTRACT_WHITELIST)
- MCP 3도구 + SDK 3메서드 + Admin UI NFT 탭 + 인덱서 설정 UI + 스킬 파일 3개

### What Worked
- 5 phases 전체 1일 완료 (10:21→12:56, ~2.5시간) — 기존 패턴(파이프라인 dispatch, 인덱서 프레임워크, Admin UI 탭) 완전 재활용
- INftIndexer 인터페이스 설계가 Alchemy/Helius 차이를 깔끔하게 추상화 — chain-specific 코드가 구현체에만 존재
- NFT_TRANSFER를 기존 /v1/transactions/send 파이프라인에 통합하여 새 엔드포인트 불필요
- APPROVE nft 확장이 기존 APPROVE 인프라를 완전히 재활용

### What Was Inefficient
- NFT REST 라우트 server.ts 마운트 누락 (CRITICAL-01) — Phase 335에서 구현했으나 server.ts wiring이 Phase 337에서 빠짐, 감사에서 발견
- IChainAdapter 테스트 목 미업데이트 (CRITICAL-02) — 인터페이스 25 메서드 확장 시 기존 목 업데이트 누락으로 typecheck 실패
- REQUIREMENTS.md traceability 상태 반영 누락 (반복 이슈) — Phase 337 완료 후 Pending 상태 유지

### Patterns Established
- INftIndexer 프로바이더 패턴: 체인별 인덱서 구현체 + NftIndexerClient 통합 클라이언트 + 재시도/캐시 일괄 적용
- NftTokenInfoSchema: 기존 TokenInfoSchema와 분리 (NFT에는 decimals/symbol이 불필요)
- tokenIdentifier 파싱: lastIndexOf(':') for EVM(address:tokenId), direct mint for Solana

### Key Lessons
- server.ts 라우트 마운트는 가장 마지막 통합 단계에서 빠지기 쉬움 — Phase 별 체크리스트에 "server.ts wiring 확인" 추가 필요
- 인터페이스 메서드 확장 시 모든 기존 테스트 목 업데이트를 자동화/체크하는 패턴 필요
- 기존 파이프라인에 새 타입을 추가하는 것이 새 파이프라인보다 훨씬 효율적 (NFT_TRANSFER → 기존 6-stage 재활용)

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 112 files, 38 commits in ~2.5 hours — medium-sized focused milestone

---

## Milestone: v31.2 — UserOp Build/Sign API

**Shipped:** 2026-03-06
**Phases:** 4 | **Plans:** 8 | **Sessions:** 1

### What Was Built
- Provider Lite/Full 모드 — Smart Account 프로바이더 없이 생성(Lite), aaProvider 설정 시 Full 전환
- UserOp Build API — unsigned UserOp 구성 (nonce EntryPoint v0.7 직접 조회, factory 자동 감지, Bundler 불필요)
- UserOp Sign API — callData 이중 검증 + sender 일치 + INSTANT 정책 + 서명 + 감사 로그
- DB v45 userop_builds 테이블 (TTL 10분) + cleanup 워커
- MCP build_userop/sign_userop + SDK buildUserOp()/signUserOp() + Admin UI Lite/Full 배지

### What Worked
- 4 phases 1일 완료 (27 commits, 64 files) — 기존 SmartAccount 인프라(v30.6/v30.9) 위에 구축하여 빠른 구현
- build→sign 분리 아키텍처가 플랫폼 대납 패턴에 자연스럽게 매핑 — Bundler 의존성 완전 제거
- callData 이중 검증 설계가 보안과 UX를 동시에 충족 — build 시점 정책 검증 + sign 시점 재검증
- userop capability와 smart_account capability 분리로 기능별 세밀한 노출 가능

### What Was Inefficient
- REQUIREMENTS.md traceability 상태 반영 누락 (반복 이슈) — Phase 341 완료 후 ADMIN/INTF/SKILL 요구사항이 Pending 상태 유지
- ROADMAP.md Phase 341 plan checkboxes `[ ]` 미갱신 (반복 이슈) — 감사에서 발견

### Patterns Established
- build-sign 분리 패턴: unsigned UserOp 구성 → 외부에서 gas/paymaster 채움 → 서명만 WAIaaS 담당
- buildId DB 트래킹: TTL 기반 일회성 build 레코드 + callData 무결성 검증 + 주기적 cleanup

### Key Lessons
- REQUIREMENTS.md / ROADMAP.md 상태 동기화 자동화가 여전히 미구현 — 매 마일스톤 반복되는 이슈
- Lite/Full 모드 같은 기능 분기는 첫 단계에서 helper 함수로 격리하면 후속 단계에서 일관된 조건 판단 가능
- userop_builds 테이블에 network 컬럼 미포함 → sign 시 heuristic 네트워크 해결 필요 (향후 개선 권장)

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 64 files, 27 commits in ~1.5 hours — small focused milestone on existing infrastructure

---

## Milestone: v31.3 — DCent Swap Aggregator 통합

**Shipped:** 2026-03-07
**Phases:** 5 | **Plans:** 9 | **Sessions:** 1

### What Was Built
- DCent Swap API 7-endpoint deep research + 936-line design doc (doc 77, 17 design decisions)
- CAIP-19 ↔ DCent Currency ID bidirectional converter (8 native token mappings, 24h stale-while-revalidate cache)
- DEX Swap execution: approve+txdata BATCH pipeline, min/max validation, provider sorting by rate
- Cross-chain Exchange: payInAddress TRANSFER + ExchangeStatusTracker polling + 4 EXCHANGE_* notification events
- 2-hop auto-routing fallback: 6 EVM chains intermediate tokens, isNoRouteError guard, partial failure handling
- DcentSwapActionProvider (IActionProvider, 4 actions) + 4 MCP tools + 4 SDK methods + 7 Admin Settings + connect-info capability

### What Worked
- 5 phases 전체 1일 완료 (54 commits, 110 files) — 기존 ActionProvider/pipeline 패턴 완전 재활용
- Phase 342 리서치에서 DCent API의 multi-hop 자체 지원(DS-04) 확인으로 Phase 345 범위를 폴백으로 축소 — 불필요한 구현 제거
- settings-driven factory 패턴으로 DcentSwapActionProvider 등록이 기존 erc8004_agent 패턴과 일관됨
- MSW(Mock Service Worker) 도입으로 HTTP-level DCent API 모킹이 깔끔하게 구현

### What Was Inefficient
- ExchangeStatusTracker 구현 후 daemon 라이프사이클 등록 누락 — 감사에서 XCHG-03/XCHG-04 partial 발견 후 별도 fix commit
- hot-reload BUILTIN_NAMES에 dcent_swap 미등록 — 감사에서 발견 후 수정 (erc8004_agent도 동일 이슈, pre-existing)
- VERIFICATION.md 5 phases 전부 미생성 — 프로세스 갭 (코드 품질에는 영향 없음)

### Patterns Established
- DCent Swap dual-flow 패턴: DEX(txdata→BATCH[approve,CONTRACT_CALL]) vs Exchange(payInAddress→TRANSFER+polling)
- Currency mapper 패턴: 하드코딩 네이티브 토큰 맵 + 규칙 기반 토큰 변환(token standard prefix + address)
- auto-routing fallback 패턴: isNoRouteError guard → Promise.allSettled intermediate probing → 2-hop BATCH

### Key Lessons
1. ExchangeStatusTracker 등록 누락처럼 "구현은 했지만 wiring 누락"이 반복됨 — 체크리스트에 "daemon lifecycle registration" 항목 필수
2. buildCaip19 내부 헬퍼 도입으로 Zod v3 compat 문제 회피 — 테스트 환경과 런타임 Zod 버전 차이 주의
3. DCent Swap 같은 외부 API aggregator 통합 시 리서치 phase가 구현 범위를 정확히 잡아줌 — Phase 345 축소 결정이 대표 사례

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 110 files, +11,612/-211 lines, 1일 완료 — 외부 API 통합 마일스톤이 리서치 선행으로 빠르게 수렴

---

## Milestone: v31.4 — Hyperliquid 생태계 통합

**Shipped:** 2026-03-08
**Phases:** 5 | **Plans:** 12 | **Sessions:** 1

### What Was Built
- HyperEVM Mainnet/Testnet (Chain ID 999/998) 체인 등록 — 기존 EVM 지갑 즉시 동작
- ApiDirectResult 패턴 — off-chain DEX API를 Stage 5에서 on-chain TX 없이 CONFIRMED 처리
- Hyperliquid Perp Trading (7 actions, margin 기반 정책), Spot Trading (3 actions, asset index 10000+ 매핑)
- Sub-account 관리 (Create/Transfer User-Signed EIP-712, DB v52)
- 22 MCP tools + 22 SDK methods + 9 Admin Settings + Admin UI 5-tab page + connect-info

### What Worked
- 설계 문서(Phase 348) 2 plans가 구현 방향을 명확히 정의하여 Phase 349-351 구현이 빠름
- ApiDirectResult 패턴이 기존 파이프라인 변경을 최소화하면서 off-chain API 통합을 깔끔하게 해결
- 공유 인프라(ExchangeClient/Signer/MarketData/RateLimiter) 팩토리 패턴으로 3개 프로바이더 간 리소스 효율적 공유
- Phase 350/351 병렬 가능 구조 — Phase 349 인프라만 의존하므로 독립 진행

### What Was Inefficient
- gsd-tools summary-extract one_liner 필드가 null 반환 — SUMMARY 포맷이 도구 기대와 불일치 (반복 이슈)
- Phase 348 설계 결정이 27개 — 일부 세부 결정은 구현 시 자연스럽게 도출될 수 있었음

### Patterns Established
- ApiDirectResult 패턴: on-chain TX가 아닌 외부 API 호출 결과를 파이프라인에 통합하는 범용 패턴 (향후 다른 off-chain 서비스에 재사용 가능)
- requiresSigningKey 메타데이터: 파이프라인 Stage 5 전에 키 복호화를 트리거하는 선언적 플래그
- 팩토리 co-registration: 하나의 팩토리에서 여러 프로바이더를 동시 등록하고 공유 리소스 주입

### Key Lessons
- EIP-712 서명은 domain/types/value 순서가 바이트 레벨에서 중요 — TypedData 스키마를 설계 시점에 확정하는 것이 필수
- Off-chain DEX는 "API 호출 = 거래 실행"이므로 dry-run 불가 — 정책 평가가 유일한 사전 차단 수단
- 3개 프로바이더 co-registration 시 factory init 순서와 공유 자원 생명주기 관리가 핵심

### Cost Observations
- Model mix: ~90% opus, ~10% haiku
- Sessions: 1
- Notable: 12 plans (설계 3 + 구현 9) 완료, ~3시간 총 실행 시간

## Milestone: v31.6 — Across Protocol 크로스체인 브릿지

**Shipped:** 2026-03-09
**Phases:** 5 | **Plans:** 8 | **Sessions:** 1

### What Was Built
- Across Protocol 설계 문서(doc 79) — 5 API endpoints, SpokePool depositV3, fee model, 12 design decisions
- AcrossApiClient(5 REST endpoints) + AcrossBridgeActionProvider(5 actions: quote/execute/status/routes/limits)
- Late-bind quote pattern — Stage 5 직전 fresh /suggested-fees 재조회로 stale quote 방지
- 2-phase polling status tracker(15s active + 5min monitoring) — bridge_status/bridge_metadata 재사용
- 7 Admin Settings + connect-info + 4 SDK methods + Admin UI BUILTIN_PROVIDERS + skill file
- 110 tests(67 unit + 43 integration) — calldata encoding, pipeline flow, error handling 검증

### What Worked
- LI.FI(v28.3) 선례 패턴 완전 활용 — bridge_status/bridge_metadata 재사용, IAsyncStatusTracker, bridge enrollment 패턴 모두 기존 코드 참조
- DB 마이그레이션 0건 + npm 의존성 0건 추가 — 기존 인프라만으로 완전한 브릿지 통합
- REST API 직접 호출 결정(@across-protocol/sdk ethers.js 의존 회피)이 번들 크기와 의존성 트리 깔끔하게 유지
- mcpExpose=true 자동 도구 노출 — 별도 MCP 코드 작성 없이 4개 도구 즉시 등록

### What Was Inefficient
- ROADMAP.md의 352-01 Plan checklist `[ ]` 미갱신 (수동 체크리스트 반복 이슈)
- SUMMARY.md one_liner 필드 미작성 — gsd-tools summary-extract 자동 추출 불가

### Patterns Established
- Late-bind quote pattern: 견적 API 응답에 시간 의존적 값이 있을 때 Stage 5 직전 재조회하여 freshness 보장
- Tracker naming convention: provider별 고유 이름(across-bridge, lifi-bridge, dcent-exchange) 충돌 방지

### Key Lessons
- Intent 기반 브릿지는 outputAmount 계산이 핵심 — absolute fee 차감 방식이 percentage 방식보다 정확
- 15s polling이 LI.FI 30s 대비 Across fill 감지에 더 적합 (Relayer 선지급 구조 때문)

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 5 phases in ~2 days, 66 files changed

---

## Milestone: v31.7 — E2E 자동 검증 체계

**Shipped:** 2026-03-09
**Phases:** 8 | **Plans:** 21 | **Sessions:** 1

### What Was Built
- @waiaas/e2e-tests 독립 패키지 — E2EScenario 타입, DaemonManager/PushRelayManager 라이프사이클, SessionManager/E2EHttpClient 헬퍼
- 오프체인 E2E 스모크 15개 시나리오 — 코어(인증/지갑/세션/정책), 인터페이스(Admin/MCP/SDK/알림/토큰/백업), 고급(Smart Account/UserOp/x402/ERC-8004/8128/DeFi/Push Relay)
- CI/CD 통합 — e2e-smoke.yml RC publish 트리거, 실패 시 GitHub Issue 자동 생성, vitest CI 리포터
- 온체인 E2E — PreconditionChecker(데몬/지갑/잔액 확인), 5 testnet 시나리오(전송/스테이킹/Hyperliquid/NFT), skip 유틸리티
- E2E 시나리오 등록 강제 — Provider↔시나리오/API↔시나리오 매핑 검증, CI fail on gap, 빈 파일 방지
- 이슈 해결 — #282 네트워크 설정 키 완전성 테스트, #283 README 동적 테스트 배지

### What Worked
- 8 phases 전체 1일 완료 — 마일스톤 감사 사전 통과 상태에서 시작하여 47/47 요구사항 100% 충족
- 데몬 라이프사이클 관리자 패턴(fork+healthCheck+cleanup)이 모든 후속 시나리오에서 재사용됨
- 오프체인/온체인 트랙 분리 설계로 CI(offchain만)와 로컬(onchain 포함) 실행 경로를 깔끔하게 분리
- Phase 359/360 병렬 실행으로 시간 절약

### What Was Inefficient
- ROADMAP.md의 Phase 364 plan 체크박스가 수동 업데이트 누락 (반복 이슈 — 364-01/02가 [ ]로 남음)
- VERIFICATION.md 파일이 전 phase에서 생성 안됨 (verification 단계 스킵)
- 23/47 요구사항 ID가 SUMMARY frontmatter에서 비표준 포맷 사용

### Patterns Established
- E2E 시나리오 레지스트리 패턴: 시나리오를 타입으로 등록하고 리포터가 자동 집계
- PreconditionChecker 패턴: 온체인 테스트 전 환경 검증, CI auto-select, 대화형 프롬프트
- CI 커버리지 강제 패턴: 기능 추가 시 E2E 시나리오 누락을 CI에서 자동 감지

### Key Lessons
- E2E 테스트 인프라를 먼저 구축하면 시나리오 작성 속도가 급격히 빨라진다 (Phase 357 인프라 → 358-364 시나리오)
- 오프체인/온체인 분리가 CI 통합의 핵심 — 온체인은 외부 의존성(잔액, 네트워크)으로 skip이 필수
- 커버리지 강제는 "테스트를 더 작성해야 한다"보다 "테스트 없으면 CI fail"이 훨씬 효과적

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 8 phases, 21 plans, 122 files, 1일 완료 (~1.2시간 실행 시간)

---

## Milestone: v31.8 — Agent UAT (메인넷 인터랙티브 검증)

**Shipped:** 2026-03-10
**Phases:** 5 | **Plans:** 12 | **Sessions:** 1

### What Was Built
- Agent UAT 마크다운 시나리오 포맷 — 6-section 표준(Metadata/Prerequisites/Steps/Verification/Cost/Troubleshooting), YAML 프론트매터
- `/agent-uat` skill 파일 — help/run/run testnet/mainnet/defi/admin 서브커맨드, 인터랙티브 실행 프로토콜
- 45개 시나리오: Testnet 8 + Mainnet 전송 6 + DeFi 12 + Advanced 6 + Admin 13
- CI 시나리오 등록 강제 — Provider 매핑/포맷/인덱스/Admin 라우트 4개 검증 스크립트 + ci.yml Stage 1

### What Worked
- 5 phases 1일 완료 (89 files, +10,962 lines) — 문서 전용 마일스톤이라 빌드/테스트 오버헤드 없음
- 기존 E2E(v31.7)와 Agent UAT의 명확한 역할 분리: 오프체인 자동 vs 온체인 인터랙티브
- 시나리오 포맷 정의(Phase 365)가 후속 3개 phase의 작성 패턴을 완전히 결정하여 병렬 작성 가능
- CI 검증 스크립트가 즉시 45개 시나리오 전체를 PASS하여 별도 수정 불필요

### What Was Inefficient
- ROADMAP.md Phase 369 plan 체크박스 미갱신 (수동 마크 누락 반복 이슈)
- SUMMARY.md에 one_liner 필드가 누락되어 milestone complete 시 자동 추출 실패

### Patterns Established
- Agent UAT 시나리오 포맷: YAML frontmatter + 6 mandatory sections, `^##` regex 파싱 가능
- Self-transfer 패턴: 메인넷 UAT 안전성 확보, to=own address로 자금 손실 위험 제거
- CI 시나리오 등록 강제: Provider/시나리오 매핑 → 기능 추가 시 자동 차단

### Key Lessons
- 문서 전용 마일스톤도 CI 검증이 중요 — 시나리오 포맷 일관성을 수동 검토 대신 스크립트로 보장
- SUMMARY.md one_liner 필드를 표준화하면 milestone complete 자동화 정확도 향상

### Cost Observations
- Sessions: 1
- Notable: 12 plans, 89 files, ~0.5시간 실행 시간

---

## Milestone: v31.9 — Polymarket 예측 시장 통합

**Shipped:** 2026-03-11
**Phases:** 5 | **Plans:** 14

### What Was Built
- Polymarket CLOB 주문 인프라 (EIP-712 3-domain 서명, OrderBuilder, RateLimiter)
- Gamma API 마켓 조회 + CTF 온체인 리딤 5 actions
- PositionTracker + PnlCalculator + ResolutionMonitor
- 전 인터페이스 통합 (Admin UI 5탭, MCP 8도구, SDK 15메서드, 정책 17 tests)
- E2E 4시나리오 + Agent UAT defi-13

### What Worked
- Hyperliquid v31.4 패턴 재활용 — ApiDirectResult, dual provider, infrastructure factory, Admin UI 5-tab 구조가 그대로 적용되어 구현 속도 극대화
- 설계 문서 doc 80 (1,345 lines)을 먼저 완성한 후 구현에 착수하여 API 조사 시간 최소화
- DB split v53/v54 전략으로 orders/positions/api_keys 독립 마이그레이션 가능

### What Was Inefficient
- ResolutionMonitor notification callback을 daemon.ts에서 와이어링 누락 (FIND-01) — 테스트가 mock으로 통과하여 실제 런타임 연결 미검증
- Python SDK Polymarket 미구현 — TS SDK와 병행 구현 프로세스 부재

### Patterns Established
- 예측 시장 프로바이더 패턴: OrderProvider(off-chain CLOB) + CtfProvider(on-chain settlement) dual provider
- Zod .passthrough() for 외부 API schemas — undocumented fields 허용으로 Gamma API 호환성 확보
- ResolutionMonitor polling 패턴 — 데몬 백그라운드가 아닌 on-demand 폴링 기반 해결 감지

### Key Lessons
- Factory 함수의 optional callback 매개변수는 daemon 와이어링에서 누락되기 쉽다 — 필수 매개변수로 설계하거나 통합 테스트에서 daemon-level 검증 필요
- 외부 API Zod 스키마는 .strict() 대신 .passthrough()가 안전 — API 응답에 문서화되지 않은 필드가 자주 추가됨

### Cost Observations
- Sessions: 1
- Notable: 14 plans, 93 files, ~1.8시간 실행 시간, 2일 완료

---

## Milestone: v31.10 — 코드베이스 품질 개선

**Shipped:** 2026-03-11
**Phases:** 5 | **Plans:** 8 | **Sessions:** 1

### What Was Built
- parseTokenAmount/contract-encoding 공통 유틸리티 모듈 추출 — 7개 프로바이더 중복 제거, ~260줄 삭제
- WalletRow SmartAccount 타입 확장 + `as any` 24곳 제거, resolveChainId/CAIP-19 regex 통합, NFT 인터페이스 타입 가드
- admin.ts 5개 도메인 모듈 분할(auth/settings/notifications/wallets/monitoring) — 3,107줄→98줄 thin aggregator
- WAIaaSError 패턴 통일 — nft-approvals/sessions/erc8004/admin-monitoring 비표준 패턴 교체
- daemon/cli/admin 3개 constants.ts 생성 — 10개 명명 상수 추출, 22개 소스 파일 매직 넘버 교체

### What Worked
- 5 phases 전부 독립적(D3)으로 설계하여 순서 무관 실행 가능 — 병렬 실행 용이
- 순수 리팩토링 마일스톤 컨셉: 행위 변경 없음, API 변경 없음, DB 마이그레이션 없음 — 전체 테스트 스위트가 안전망 역할
- 매 Phase 완료 시 `pnpm turbo run lint && typecheck && test` 전체 통과 필수 규칙으로 회귀 방지
- admin.ts thin aggregator 패턴이 3,107줄을 98줄로 96.8% 축소하면서 기존 import 경로 유지

### What Was Inefficient
- openapi-schemas.ts (1,606줄) 분할을 검토했으나 32개 파일 import 분석 후 분할 불필요 판단 — 사전 분석에 시간 소요

### Patterns Established
- Package-level constants.ts 패턴: 2회 이상 사용되는 매직 넘버를 패키지별 constants 파일로 추출
- admin route thin aggregator 패턴: 타입 export + register 함수 호출만 담당, 실제 핸들러는 도메인별 분리
- INftApprovalQuery 인터페이스 + hasNftApprovalQuery 타입 가드로 optional adapter capability 패턴

### Key Lessons
- 순수 리팩토링은 전체 테스트 스위트가 존재할 때 안전하게 수행 가능 — 테스트 없는 리팩토링은 위험
- 독립 Phase 설계가 실행 효율을 높임 — 의존성 없으면 병렬화/순서 자유

### Cost Observations
- Sessions: 1
- Notable: 8 plans, 89 files, +6,742/-3,472 lines, 1일 완료

---

## Milestone: v31.11 — External Action 프레임워크 설계

**Shipped:** 2026-03-12
**Phases:** 6 | **Plans:** 11 | **Sessions:** 1

### What Was Built
- ResolvedAction 3종 Zod union 타입 시스템 (contractCall/signedData/signedHttp kind 기반 분기)
- ISignerCapability 통합 인터페이스 (기존 4종 래핑 + HMAC/RSA-PSS/signBytes, 7종 Registry)
- CredentialVault 인프라 설계 (per-wallet AES-256-GCM, HKDF 도메인 분리, REST 8 endpoints)
- 3-way 파이프라인 라우팅 (kind별 분기 + off-chain DB 기록, DB v55-v57)
- 정책 확장 (VENUE_WHITELIST + ACTION_CATEGORY_LIMIT + TransactionParam 확장)
- AsyncTrackingResult 9-state 확장 + AsyncPollingService 쿼리 확장
- doc-81 통합 설계 문서 (1,184줄, 19 Zod 스키마, 4-Wave 구현 계획, 40+ pitfall 체크리스트)

### What Worked
- 6 phases 전체 ~1.1시간 완료 — 설계 전용 마일스톤으로 구현 코드 없이 빠른 진행
- Phase 분리가 효과적: 타입(380) → 자격증명(381) → 서명(382) → 파이프라인(383) → 정책(384) → 통합(385) 흐름이 자연스러움
- 기존 패턴 재활용 결정이 설계 복잡도 대폭 감소: CONTRACT_WHITELIST→VENUE_WHITELIST, bridge_status/bridge_metadata→off-chain tracking
- 13개 기존 ActionProvider 무변경 하위 호환 분석을 Phase 380에서 선행하여 나머지 phases에서 안심하고 확장 가능

### What Was Inefficient
- doc-77 → doc-81 번호 변경이 뒤늦게 결정되어 일부 SUMMARY 파일에 doc-77 참조 잔존 (cosmetic)
- 설계 전용이라 SUMMARY frontmatter의 one_liner 필드 미기재 — 자동 추출 실패

### Patterns Established
- Design-only milestone 패턴: 구현 코드 없이 Zod 스키마 초안 + 설계 문서만 산출, 구현 마일스톤의 입력으로 사용
- Widening strategy: 기존 파이프라인/타입 무변경, optional kind 필드로 새 분기만 추가
- 기존 인프라 100% 재활용 원칙: bridge_status/bridge_metadata/AsyncPollingService 그대로 사용

### Key Lessons
- 설계 마일스톤은 타입 시스템부터 시작하여 점진적으로 확장하는 것이 효과적 (타입 → 인프라 → 파이프라인 → 정책)
- normalizeResolvedAction() 단일 정규화 지점 설계가 하위 호환을 깔끔하게 보장

### Cost Observations
- Sessions: 1
- Notable: 설계 전용, 11 plans, 60 files, +13,039/-1,582 lines, ~1.1시간 완료

---

## Milestone: v31.12 — External Action 프레임워크 구현

**Shipped:** 2026-03-12
**Phases:** 7 | **Plans:** 15 | **Sessions:** 1

### What Was Built
- ResolvedAction 3-kind Zod discriminatedUnion (contractCall/signedData/signedHttp) with backward-compatible normalize utility
- ISignerCapability 7-scheme registry (EIP-712/PersonalSign/ERC-8128 어댑터 + HMAC/RSA-PSS/ECDSA/Ed25519 신규)
- CredentialVault (AES-256-GCM, HKDF 도메인 분리, per-wallet/global scope, REST 8 endpoints, re-encrypt on password change)
- Venue Whitelist + Action Category Limit 정책 (default-deny venue, daily/monthly/per_action USD 한도)
- Kind-based 파이프라인 라우팅 (signedData/signedHttp → credential→policy→DB→sign→track→audit)
- Full-stack 통합: Admin UI 4페이지 + MCP 2도구 + SDK 6메서드 + skill files 4종

### What Worked
- doc-81 설계 문서(1,184줄)가 Zod 스키마/DB 컬럼/API 경로까지 정의 — 구현 시 설계 판단 거의 불필요
- 4-Wave 순서(타입→서명/Vault/정책→파이프라인→UI/통합)가 자연스러운 의존성 흐름 생성
- 기존 패턴 재사용 — CredentialVault의 HKDF+AES-GCM은 settings-crypto.ts와 동일 패턴, PolicyFormRouter 기존 인프라 재활용
- ~4.5시간에 7 phases 15 plans 완료 — 설계 전용 마일스톤(v31.11) 선행의 효과

### What Was Inefficient
- bootstrapSignerCapabilities() wiring 누락 (FINDING-01) — optional 파라미터가 컴파일 시점 검출 방지, 런타임에서만 발견
- REQUIREMENTS.md TRACK-* 체크박스 미갱신 — 실제 구현과 문서 상태 불일치 (반복 이슈)
- TRACK-02/03/05 의도적 편차가 REQUIREMENTS.md에 사전 기록되지 않음 — 편차 결정 시점에 즉시 문서화 필요

### Patterns Established
- ResolvedAction normalization 패턴: kind 없는 레거시 반환값을 contractCall로 자동 정규화 — 기존 13개 Provider 무변경
- HKDF domain separation: 동일 master password에서 용도별 독립 키 파생 (credential-vault vs settings)
- AAD binding: {id}:{scope}:{type} 포맷으로 cross-credential 치환 공격 방지
- optional dependency에서 runtime wiring 누락 방지: feature가 optional이어도 startup에서 명시적 instantiation 필요

### Key Lessons
1. optional 파라미터로 선언된 의존성은 TypeScript 컴파일러가 누락을 잡지 못함 — feature gate가 필요하면 required로 선언하고 null/undefined 처리가 나음
2. 설계 전용 마일스톤 → 구현 마일스톤 2단계 분리가 효율 극대화 — v31.11(설계 1.1h) + v31.12(구현 4.5h) = 총 5.6h
3. 의도적 편차(deferred requirement)는 결정 시점에 REQUIREMENTS.md에 즉시 마킹해야 아카이브 시 혼선 방지

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 144 파일, +15,780/-263 lines, ~4.5시간 완료 — 7 phases 전체를 1 세션에 완료, 설계 문서의 정밀도가 핵심 요인

---

## Milestone: v31.13 — DeFi 포지션 대시보드 완성

**Shipped:** 2026-03-12
**Phases:** 5 | **Plans:** 8 | **Sessions:** 1

### What Was Built
- Lido stETH/wstETH + Jito jitoSOL 스테이킹 포지션 추적 (wstETH→stETH/jitoSOL→SOL 환산 비율, duck-type 자동 등록)
- Aave V3 Supply/Borrow 포지션 추적 (aToken/debtToken, Health Factor, Aave Oracle USD 환산)
- Pendle PT/YT Yield 포지션 추적 (balanceOf 조회, MATURED 자동 전환, implied APY)
- Hyperliquid Perp 오픈 포지션 + Spot 잔액 신규 구현 (Info API 기반, 8 metadata 필드, mid-price USD)
- Admin Dashboard UX: 카테고리 필터(5탭), 프로바이더 그룹핑, 카테고리별 맞춤 상세 컬럼, HF 경고 배너, 지갑 필터, 30초 새로고침

### What Worked
- IPositionProvider duck-type 패턴 재사용 — 5개 프로바이더 모두 동일 패턴으로 빠르게 구현
- raw fetch + manual ABI 인코딩 패턴(Lido에서 확립)이 Aave/Pendle에서 그대로 재사용 — viem/SDK 의존 없이 경량 구현
- 기존 PositionTracker 인프라가 프로바이더 추가만으로 자동 작동 — daemon.ts duck-type 감지가 등록 자동화
- Admin Dashboard 기존 signal 패턴 재활용으로 필터/새로고침 빠르게 구현

### What Was Inefficient
- summary-extract CLI가 null 반환 — SUMMARY.md frontmatter 포맷이 도구와 불일치, 수동 추출 필요
- ROADMAP.md Phase 397 plan 체크박스 미갱신 상태로 남음 — 수동 수정 필요 (반복 이슈)

### Patterns Established
- raw fetch eth_call 패턴: viem 없이 EVM RPC 직접 호출 + manual ABI encode/decode — 경량 의존성
- SPL Stake Pool u64 LE 파싱: byte offset 258/266에서 exchange rate 직접 추출
- 프로바이더별 Oracle 가격 패턴: 각 프로바이더 내부 가격 소스 사용 (Aave Oracle, mid-price 등)
- Admin Dashboard 카테고리별 컬럼 빌더: buildCategoryColumns switch 패턴

### Key Lessons
1. duck-type 자동 등록은 Provider 추가 시 boilerplate를 제거 — 새 프로바이더가 인터페이스만 맞추면 자동 통합
2. 프로바이더별 내장 오라클 활용이 통합 가격 서비스보다 실용적 — 프로토콜별 가격 소스가 더 정확하고 추가 의존성 없음
3. 포지션 추적은 DB/API 변경 없이 프로바이더 로직만으로 완성 가능 — 기존 인프라 설계의 확장성 입증

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 44 파일, +5,985/-139 lines, ~5시간 완료 — 5 phases 전체 1세션 완료, 기존 IPositionProvider 인프라 재활용이 핵심

---

## Milestone: v31.14 — EVM RPC 프록시 모드

**Shipped:** 2026-03-13
**Phases:** 4 | **Plans:** 11 | **Sessions:** 1

### What Was Built
- CONTRACT_DEPLOY 9번째 트랜잭션 타입 — Zod SSoT 전체 전파 (enum, schema, pipeline, policy, DB v58)
- EVM JSON-RPC proxy engine — 10 signing intercept + 19 passthrough + batch 지원
- CompletionWaiter + SyncPipelineExecutor — DELAY/APPROVAL Long-poll 비동기 승인 (기존 파이프라인 zero modification)
- RpcTransactionAdapter — eth_sendTransaction 파라미터를 5종 WAIaaS TransactionRequest로 자동 분류
- Admin Settings 7키 (rpc_proxy.*) + Admin UI RPC Proxy 페이지 (상태, 설정, 감사 로그)
- MCP get_rpc_proxy_url + SDK getRpcProxyUrl() + connect-info rpcProxyBaseUrl 에이전트 자동 발견

### What Worked
- PIPELINE_HALTED catch 패턴이 기존 6-stage 파이프라인 코드 변경 없이 동기 JSON-RPC 응답 변환을 해결 — 핵심 아키텍처 결정
- EVM_CHAIN_ID_TO_NETWORK 모듈 로드 시 자동 파생 — SSoT(EVM_CHAIN_MAP)만 관리, 역방향 조회 비용 0
- validateAndFillFrom 별도 export — SEC-02/SEC-03 테스트 용이성 확보, 19개 단위 테스트로 보안 검증
- 4 phases 모두 1세션(~4시간)에 완료 — 리서치 문서가 Pitfall/Anti-Pattern을 사전 식별하여 구현 시 rework 없음

### What Was Inefficient
- summary-extract CLI가 null 반환 (v31.13과 동일 이슈) — SUMMARY.md frontmatter 포맷이 도구와 불일치
- ADMIN-02 (allowed_methods), ADMIN-05 (max_gas_limit) settings 정의만 하고 route handler에서 미사용 — feature stub 상태

### Patterns Established
- PIPELINE_HALTED catch + CompletionWaiter 패턴: 기존 파이프라인 수정 없이 동기 HTTP 응답으로 브릿지
- RPC method 3-way classification: intercept(signing) / passthrough(read) / unsupported — dispatcher 패턴
- eth_sendRawTransaction 명시적 거부: 서명 우회 방지, 정책 엔진 보안 유지
- Route factory deps lazy-init: EventBus nullable 패턴으로 테스트 환경 호환

### Key Lessons
1. 기존 파이프라인 래핑(zero modification)이 새 파이프라인 구현보다 안전하고 빠름 — PIPELINE_HALTED 패턴 성공
2. JSON-RPC 프록시는 프로토콜 유틸(파싱, 응답 빌드, 에러 코드)을 먼저 구현하면 나머지가 쉬움
3. 보안 검증(from validation, bytecode limit)을 route handler 레벨에서 inline 처리가 미들웨어보다 명확

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 82 파일, +9,485/-190 lines, ~4시간 완료 — 4 phases 전체 1세션, 리서치 문서의 Pitfall 사전 식별이 핵심

---

## Milestone: v32.7 — SEO/AEO 최적화

**Shipped:** 2026-03-17
**Phases:** 5 | **Plans:** 7

### What Was Built
- ESM 빌드 파이프라인 (`site/build.mjs`) — gray-matter + marked + highlight.js로 19개 마크다운→CRT 테마 HTML 변환
- Blog/Docs 목록 페이지 + 활성 네비게이션 + 259개 내부 링크 빌드타임 검증
- sitemap.xml (22 URL) + JSON-LD (Article/TechArticle + BreadcrumbList) + canonical URL
- llms-full.txt (188KB) AEO 최적화 + 20개 FAQ Q&A (FAQPage 스키마)
- GitHub Actions CI 파이프라인 (docs/** 자동 빌드 + GitHub Pages 배포)
- SEO 랜딩 페이지 3종 + SUBMISSION_KIT (7 플랫폼) + 커뮤니티 포스팅 초안 4개

### What Worked
- 순차적 빌드업 구조 (빌드→콘텐츠→SEO→CI→랜딩)가 각 phase에서 이전 산출물을 자연스럽게 소비
- Autopilot으로 5 phases 전체를 ~30분 만에 계획+실행+감사 완료
- 기존 CRT 테마 디자인 시스템 재활용으로 일관된 사이트 완성
- Front-matter SSoT 패턴: title/description/date/section/slug 하나로 메타태그+URL+목록+sitemap 모두 결정

### What Was Inefficient
- 없음 — 콘텐츠 마일스톤은 런타임 코드/테스트 의존이 없어서 순조롭게 진행

### Patterns Established
- `site/` 디렉토리에 정적 사이트 빌드 인프라 표준화 (build.mjs + template.html + article.css)
- `docs/seo/` 디렉토리에 SEO 전용 콘텐츠 배치, `site/distribution/`에 외부 배포 자료 배치
- `{{PLACEHOLDER}}` 패턴으로 template.html에 빌드타임 데이터 주입 (JSON_LD, ACTIVE_BLOG 등)

### Key Lessons
- 콘텐츠 전용 마일스톤은 테스트/CI 의존이 없어서 autopilot 1회에 완료 가능
- llms-full.txt + FAQ JSON-LD + pillar-cluster 링크가 AEO 3종 세트로 함께 적용되면 효과적

---

## Milestone: v32.9 — Push Relay 직접 연동 (ntfy.sh 제거)

**Shipped:** 2026-03-18
**Phases:** 3 | **Plans:** 7

### What Was Built
- ResponseChannelSchema에서 ntfy 타입 제거, push_relay 타입 추가
- APPROVAL_METHODS sdk_ntfy → sdk_push 전환
- Push Relay 서버 자체 sign_responses DB + long-polling API (POST /v1/sign-response, GET /v1/sign-response/:requestId)
- PushRelaySigningChannel: HTTP POST 서명 요청 + long-polling 응답 수신 (지수 백오프 재시도)
- NtfyChannel / ntfy config / settings / hot-reload 코드 전량 삭제
- DB v60: wallet_apps.push_relay_url 컬럼, DCent 프리셋 자동 설정
- Wallet SDK ntfy 함수 @deprecated 처리
- Admin UI Approval Method "Wallet App (Push)" 라벨 + Push Relay URL 관리

### What Worked
- 3-phase 구조 (Foundation → Daemon → Client)가 의존성을 깔끔하게 분리
- ntfy 코드 전량 삭제가 118 파일에 걸쳐 있었지만 타입 시스템이 삭제 범위를 정확히 가이드
- Push Relay long-polling 패턴이 SSE보다 구현이 단순하고 방화벽 친화적

### What Was Inefficient
- Audit에서 발견된 residual ntfy 참조(테스트/Admin UI) — 삭제 대상 grep을 plan에 포함했으면 첫 pass에서 처리 가능
- sign_topic/notify_topic 컬럼은 NULL로 비웠지만 DROP하지 않음 — 추후 cleanup 필요

### Patterns Established
- ntfy→Push Relay 전환 완료: 이후 서명/알림 채널은 모두 HTTP POST + long-polling 기반
- Wallet SDK deprecated 함수: @deprecated JSDoc으로 표시 후 다음 메이저에서 제거하는 패턴

### Key Lessons
- 의존성 제거 마일스톤은 타입 시스템이 컴파일 에러로 모든 참조를 잡아줘서 누락 위험이 낮음
- ~2시간 내 완료 — 설계가 명확하고 범위가 좁은 마일스톤의 이상적 크기

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v29.0 | 1 | 6 | 설계 전용 마일스톤, 1일 완료 |
| v29.5 | 1 | 3 | 이슈 기반 정리 마일스톤, 156 파일 변경 1일 완료 |
| v29.6 | 1 | 3 | Yield Provider 패턴 확립, 50 파일 1일 완료 |
| v29.7 | 1 | 6 | 풀스택(DB+API+UI) 구현, 73 파일 1일 완료 |
| v29.10 | 1 | 2 | 글로벌→per-entity 설정 전환, 43 파일 1.5시간 완료 |
| v30.0 | 1 | 5 | 운영 기능 6개 설계 전용, 30 파일 50분 완료 |
| v30.6 | 1 | 3 | ERC-4337 Smart Account, 49 파일 ~2h 완료 |
| v30.8 | 1 | 7 | ERC-8004 Trustless Agents 5-package 통합, 121 파일 1일 완료 |
| v30.9 | 1 | 3 | Smart Account DX 개선 per-wallet provider 전환, 73 파일 2일 완료 |
| v30.10 | 1 | 3 | ERC-8128 Signed HTTP Requests, 76 파일 1일 완료 |
| v30.11 | 1 | 3 | Admin UI DX 개선, 48 파일 1일 완료 |
| v31.0 | 1 | 5 | NFT 풀스택(타입+인덱서+어댑터+파이프라인+UI), 112 파일 2.5시간 완료 |
| v31.2 | 1 | 4 | UserOp Build/Sign API, 64 파일 1.5시간 완료 |
| v31.3 | 1 | 5 | DCent Swap Aggregator 통합, 110 파일 1일 완료 |
| v31.4 | 1 | 5 | Hyperliquid 생태계(Perp/Spot/Sub-account), 112 파일 ~3시간 완료 |
| v31.6 | 1 | 5 | Across Protocol 브릿지, 66 파일 2일 완료 |
| v31.7 | 1 | 8 | E2E 자동 검증 체계, 122 파일 1일 완료 |
| v31.8 | 1 | 5 | Agent UAT 시나리오 체계, 89 파일 1일 완료 |
| v31.9 | 1 | 5 | Polymarket 예측 시장 통합, 93 파일 2일 완료 |
| v31.10 | 1 | 5 | 코드베이스 품질 개선(순수 리팩토링), 89 파일 1일 완료 |
| v31.11 | 1 | 6 | 설계 전용(External Action 프레임워크), 60 파일 1.1시간 완료 |
| v31.12 | 1 | 7 | External Action 프레임워크 구현(풀스택), 144 파일 4.5시간 완료 |
| v31.13 | 1 | 5 | DeFi 포지션 대시보드 완성(5개 프로바이더 getPositions), 44 파일 5시간 완료 |
| v31.14 | 1 | 4 | EVM RPC 프록시 모드(JSON-RPC proxy + CONTRACT_DEPLOY 9-type), 82 파일 4시간 완료 |
| v32.7 | 1 | 5 | SEO/AEO 최적화(정적 사이트 빌드), 53 파일 30분 완료 |
| v32.9 | 1 | 3 | Push Relay 직접 연동(ntfy 제거), 118 파일 2시간 완료 |
| v32.10 | 1 | 4 | 에이전트 스킬 정리 + OpenClaw 플러그인, 239 파일 1일 완료 |

### Cumulative Quality

| Milestone | Tests | Coverage | Design Decisions |
|-----------|-------|----------|-----------------|
| v29.0 | ~5,000 (unchanged) | unchanged | +59 decisions |
| v29.5 | ~5,595 (+512) | maintained | +5 decisions |
| v29.6 | ~5,595 (unchanged) | maintained | +4 decisions |
| v29.7 | ~5,595 (unchanged) | maintained | +7 decisions |
| v29.10 | ~5,737 (+142) | maintained | +8 decisions |
| v30.0 | ~5,737 (unchanged) | unchanged | +40 decisions |
| v30.6 | ~6,486 (+749) | maintained | +8 decisions |
| v30.8 | ~6,668 (+182) | maintained | +36 decisions |
| v30.9 | ~6,742 (+74) | maintained | +12 decisions |
| v30.10 | ~6,822 (+80) | maintained | +11 decisions |
| v30.11 | ~6,822 (unchanged) | maintained | +9 decisions |
| v31.0 | ~6,930 (+108) | maintained | +24 decisions |
| v31.2 | ~6,993 (+63) | maintained | +15 decisions |
| v31.3 | ~7,109 (+116) | maintained | +17 decisions |
| v31.4 | ~7,109 (unchanged) | maintained | +27 decisions |
| v31.6 | ~7,219 (+110) | maintained | +12 decisions |
| v31.7 | ~7,219 (unchanged) | maintained | +30 decisions |
| v31.8 | ~7,219 (unchanged) | maintained | +14 decisions |
| v31.9 | ~7,454 (+235) | maintained | +12 decisions |
| v31.10 | ~7,454 (unchanged) | maintained | +12 decisions |
| v31.11 | ~7,454 (unchanged) | unchanged | +36 decisions |
| v31.12 | ~7,673 (+219) | maintained | +23 decisions |
| v31.13 | ~7,861 (+188) | maintained | +21 decisions |
| v31.14 | ~8,050 (+189) | maintained | +10 decisions |
| v32.7 | ~8,050 (unchanged) | maintained | +15 decisions |
| v32.9 | ~8,050 (unchanged) | maintained | +17 decisions |
| v32.10 | ~8,058 (+8) | maintained | +10 decisions |

### Top Lessons (Verified Across Milestones)

1. 인프라-우선 설계 순서가 프레임워크 간 의존성을 자연스럽게 해소한다
2. 프로토콜 매핑 테이블을 설계 시점에 완성하면 구현 시 API 조사 시간이 절약된다
3. 이중 저장소 발견 시 즉각 SSoT 통합이 최선 — 동기화 레이어보다 단일 저장소 전환이 안정적
