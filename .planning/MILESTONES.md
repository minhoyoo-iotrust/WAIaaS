# Project Milestones: WAIaaS

## v2.0 전 기능 완성 릴리스 (Shipped: 2026-02-18)

**Delivered:** v0.1~v1.8까지 37개 마일스톤으로 축적된 설계와 구현의 최종 검증, 문서화, 공개 릴리스를 달성. 설계 부채 0건 확인, 테스트 게이트 전수 통과, 영문 사용자 문서 완비, npm 8개 패키지 + Docker 이미지 배포 활성화, v2.0.0-rc.1 pre-release 발행.

**Phases completed:** 165-173 (9 phases, 17 plans, 25 requirements)

**Key accomplishments:**

- MIT License + npm @waiaas scope 확보 + 10개 패키지 배포 메타데이터 완비 (publishConfig, repository, homepage)
- 설계 문서 44개 구현 교차 검증 PASS + 설계 부채 0건 + OpenAPI 3.0 CI 자동 검증 (swagger-parser)
- 보안 460건 + 단위 2,482건 + 플랫폼 84건 테스트 전수 통과, 커버리지 Hard 80% 게이트 달성 (core 97.73%, daemon 86.23%)
- 이중 언어 README(en) + CONTRIBUTING + 배포 가이드(CLI/Docker) + API 레퍼런스(60+ 엔드포인트) + CHANGELOG(v1.1~v1.8) 완비
- @waiaas/skills npx 배포 패키지(7 스킬 파일) + examples/simple-agent SDK 예제 에이전트
- npm 8개 패키지 v2.0.0-rc.1 publish + Docker Hub/GHCR dual push + release.yml 6-job 파이프라인 E2E 검증

**Stats:**

- 9 phases, 17 plans, 25 requirements, 237 files changed, +13,575 LOC (net)
- ~124,830 LOC TypeScript, ~3,599 tests
- 101 commits, 2 days (2026-02-17 → 2026-02-18)
- Git range: v1.8.0 → HEAD

### Known Gaps

- INT-01: README.md/deployment.md `add --all` vs `add all` CLI 문법 불일치 (cosmetic, v2.0.5 이연)
- INT-02: examples/simple-agent/README.md 깨진 링크 + placeholder URL + 구버전 (v2.0.5 이연)
- FLOW-01/FLOW-02: Skills CLI `add --all` 흐름 + example agent setup 흐름 (cosmetic, v2.0.5 이연)
- validate-openapi.ts @see 주석 경로 불일치 (internal, v2.0.5 이연)

**What's next:** v2.0.1 거버넌스 + 신뢰 강화 or v2.0.5 DX 폴리싱

---

## v1.5.3 USD 정책 확장 (누적 지출 한도 + 표시 통화) (Shipped: 2026-02-16)

**Delivered:** 월렛 단위 24시간/30일 롤링 윈도우 누적 USD 지출 한도로 분할 전송 우회를 방지하고, 43개 법정 통화로 환산 표시하여 Admin UI/알림/REST API/MCP 전체 인터페이스에서 다국어 DX를 개선하는 상태 달성

**Phases completed:** 136-139 (8 plans total)

**Key accomplishments:**

- DB v13 마이그레이션 + 누적 USD 지출 한도 엔진 — amount_usd/reserved_amount_usd 컬럼, 24h/30d 롤링 윈도우, APPROVAL 격상, 이중 지출 방지, 80% 경고 알림
- IForexRateService + CoinGeckoForexProvider — tether vs_currencies 기반 43개 법정 통화 환율, InMemoryPriceCache 30분 TTL, graceful null fallback
- Admin CurrencySelect 드롭다운 — 43개 통화 검색 가능, 환율 미리보기, SettingsService display.currency hot-reload
- REST API display_currency 쿼리 파라미터 — transactions/balance/assets 4개 엔드포인트에 displayAmount/displayBalance/displayValue 환산 필드
- MCP 도구 + 알림 환산 통합 — 4개 MCP 조회 도구에 display_currency 파라미터, 6개 알림 템플릿에 {display_amount} 변수

**Stats:**

- 4 phases, 8 plans, 19 requirements, 98 files changed, +8,762 LOC (net)
- ~2,150 tests (~2,111 → ~2,150, +39 forex/format tests)
- Git range: feat(136-01) → feat(139-02)

---

## v1.5.2 Admin UI 정책 폼 UX 개선 (Shipped: 2026-02-16)

**Delivered:** Admin UI에서 12개 정책 타입별 구조화된 전용 폼으로 정책을 생성/수정할 수 있고, 목록에서 타입별 의미 있는 시각화(심볼 배지, req/time 포맷, tier bars)를 확인할 수 있으며, 기존 정책 수정 시 현재값이 프리필되어 수정/저장이 가능한 상태 달성

**Phases completed:** 134-135 (4 plans total)

**Key accomplishments:**

- 12개 PolicyType 전체 Zod rules 스키마 등록 — 4개 미등록 타입(WHITELIST, RATE_LIMIT, TIME_RESTRICTION, X402_ALLOWED_DOMAINS) 추가, POLICY_RULES_SCHEMAS Partial→Record 전환
- DynamicRowList + PolicyFormRouter 폼 인프라 — 재사용 가능한 동적 행 컴포넌트(generic T, renderRow 콜백), 12-type switch/case 분기 라우터
- 12개 PolicyType 전용 폼 컴포넌트 — SpendingLimitForm(3-tier 네이티브+USD), WhitelistForm, RateLimitForm, ApproveAmountLimitForm, ApproveTierOverrideForm, AllowedTokensForm, ContractWhitelistForm, MethodWhitelistForm(2단계 중첩 DynamicRowList), ApprovedSpendersForm, TimeRestrictionForm, AllowedNetworksForm, X402AllowedDomainsForm
- PolicyRulesSummary 12-type 목록 시각화 — ALLOWED_TOKENS 심볼 배지, RATE_LIMIT "100 req / 1h", SPENDING_LIMIT tier bars, APPROVE_TIER_OVERRIDE 색상 배지, 나머지 타입 개수/패턴 배지
- 수정 모달 전용 폼 프리필/저장 통합 — editRulesObj 프리필, PolicyFormRouter + validateRules 재사용, PUT API 호출

**Stats:**

- 2 phases, 4 plans, 24 requirements, 7 설계 결정
- 2,111 tests (2,058 → 2,111, +53 new tests)
- ~188,000 LOC total
- 15 commits, 1 day (2026-02-15 ~ 2026-02-16)

**Git range:** `v1.5.1` → `7d19887` (Phase 135 complete)

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---

## v1.5.1 x402 클라이언트 지원 (Shipped: 2026-02-15)

**Delivered:** AI 에이전트가 x402 프로토콜로 보호된 외부 유료 API를 자동 결제하며 사용할 수 있는 상태를 달성 — SSRF 가드 자체 구현, x402 핸들러(HTTP 402 파싱 → scheme 선택 → EVM EIP-3009/Solana TransferChecked 결제 서명), POST /v1/x402/fetch REST API, X402_ALLOWED_DOMAINS 기본 거부 정책 + SPENDING_LIMIT 4-tier USD 환산 통합, 감사 로그(X402_PAYMENT) + 알림 연동, TS/Python SDK + MCP x402_fetch 도구 + x402.skill.md 스킬 파일

**Phases completed:** 130-133 (10 plans total)

**Key accomplishments:**

- SSRF 가드 자체 구현 — RFC 5735/6890 전체 범위 사설 IP 차단, IPv4-mapped IPv6/옥탈/16진수 우회 벡터 차단, 리다이렉트 매 hop IP 재검증, HTTPS 강제, URL 정규화, 54 단위 테스트
- x402 자동 결제 파이프라인 — HTTP 402 PAYMENT-REQUIRED 헤더 파싱, (scheme, network) 쌍 자동 선택, EVM EIP-3009 transferWithAuthorization signTypedData + Solana SPL TransferChecked signBytes 결제 서명, 재요청 + 1회 재시도 제한
- X402_ALLOWED_DOMAINS 기본 거부 정책 — 와일드카드 dot-boundary 매칭, SPENDING_LIMIT 4-tier evaluateAndReserve 통합, USDC $1 직접 환산 + IPriceOracle USD 환산, DELAY request_timeout 대기/APPROVAL 즉시 거부
- POST /v1/x402/fetch REST API — sessionAuth 보호, 3-phase 오케스트레이션(validation → policy+402 → signing+retry), transactions X402_PAYMENT 기록 + TX_REQUESTED/TX_CONFIRMED/TX_FAILED 알림 연동, Kill Switch 전체 차단
- TS/Python SDK + MCP x402_fetch 도구 — WAIaaSClient.x402Fetch()/x402_fetch() 메서드, MCP x402_fetch 15번째 도구, x402.skill.md 스킬 파일 + waiaas://skills/x402 리소스, transactions.skill.md X402_PAYMENT 반영

**Stats:**

- 95 files changed, +18,160 / -252 lines
- 4 phases, 10 plans, 39 requirements, 59 설계 결정
- 2,058 tests (1,848 → 2,058, +210 new tests)
- ~187,000 LOC total
- 53 commits, 1 day (2026-02-15)

**Git range:** `v1.5.0` → `0033f0b` (Phase 133 complete)

**What's next:** v1.6 Desktop + Telegram + Docker 또는 v1.6.4 Wallet Signing SDK

---

## v1.3.3 MCP 다중 에이전트 지원 (Shipped: 2026-02-11)

**Delivered:** 하나의 WAIaaS 데몬에 등록된 여러 에이전트를 Claude Desktop(MCP)에서 동시에 사용할 수 있도록, 에이전트별 토큰 경로 분리(mcp-tokens/<agentId>), MCP 서버 이름/description 에이전트 식별, CLI `mcp setup --all` 일괄 설정을 구현

**Phases completed:** 71-72 (2 plans total)

**Key accomplishments:**

- SessionManager 에이전트별 토큰 경로 분리 — `mcp-tokens/<agentId>` 경로 + 기존 `mcp-token` fallback(ENOENT only), AgentContext DI 패턴
- MCP 서버 에이전트 식별 — `waiaas-{agentName}` 동적 서버 이름, 6 도구 + 3 리소스 `[agentName]` description prefix, withAgentPrefix 재사용 헬퍼
- CLI `mcp setup` 다중 에이전트 — `--agent` 개별 + `--all` 일괄 설정, config 스니펫에 WAIAAS_AGENT_ID/NAME 환경변수, `waiaas-{slug}` 키 이름
- Slug 유틸리티 — toSlug + resolveSlugCollisions, 충돌 시 agentId 앞 8자 접미사
- 45 신규 테스트 — 14 MCP 경로/서버 + 9 slug 단위 + 22 CLI mcp-setup 통합

**Stats:**

- 19 files changed, +961 / -125 lines
- 2 phases, 2 plans, 4 tasks, 14 requirements, 11 설계 결정
- 847 tests (816 → 847, +31 new tests)
- 44,639 LOC total
- 1 day (2026-02-11)

**Git range:** `8fd6439` (Phase 71 start) → `d147147` (Phase 72 complete)

**What's next:** v1.4 토큰 + 컨트랙트 확장 — SPL/ERC-20 토큰 전송, 컨트랙트 호출, Approve, Batch, EVM 어댑터

---

## v0.10 구현 전 설계 완결성 확보 (Shipped: 2026-02-09)

**Delivered:** v0.2~v0.9에서 작성한 30개 설계 문서의 BLOCKING 4건 + HIGH 8건 = 12건의 구현 차단 미비점을 4개 영역(정책 엔진, 에러 처리, 동시성/실행, 운영 로직)에서 전수 해소하여, 설계 문서만으로 코드를 작성할 수 있는 상태를 확립

**Phases completed:** 41-44 (10 plans total)

**Key accomplishments:**

- 정책 엔진 완결 — PolicyRuleSchema SSoT 교차 참조(25-sqlite↔33-time-lock), GRACE 무기한+markOwnerVerified() 배타적 전이, APPROVAL 타임아웃 3단계 우선순위(정책별>config>3600초)
- 에러 처리 체계 완결 — 66개 에러 코드 통합 매트릭스(SS10.12 SSoT), ChainError 25코드 3-카테고리 분류(PERMANENT 17/TRANSIENT 4/STALE 4), PolicyType 10개 확장+superRefine 검증
- 동시성+실행 로직 완결 — Stage 5 완전 의사코드(build→simulate→sign→submit+에러분기+재시도), 세션 갱신 낙관적 잠금(token_hash CAS), Kill Switch 4전이 CAS ACID 패턴
- 운영 로직 완결 — 데몬 6단계 시작 타임아웃(5~30초/90초 상한, fail-fast/soft), Batch 부모-자식 2계층 DB+PARTIAL_FAILURE, Oracle 교차 검증 인라인+가격 나이 3단계(FRESH/AGING/STALE)
- 12건 구현 차단 미비점 전수 해소 — 설계 문서 11개 직접 수정, 22개 설계 결정 확정

**Stats:**

- 30 files changed, +4,972 / -195 lines (Markdown design docs)
- 4 phases, 10 plans, 12 requirements, 22 설계 결정
- 1 day (2026-02-09)

**Git range:** `dd7def4` (Phase 41 start) → `4e2357e` (Phase 44 complete)

**What's next:** v1.0 구현 계획 — 설계 문서(24-64) 기반 구현 마일스톤 시작

---

## v0.9 MCP 세션 관리 자동화 설계 (Shipped: 2026-02-09)

**Delivered:** MCP 환경에서 세션 토큰의 갱신·만료·재발급을 자동화하는 메커니즘을 설계 수준에서 완전히 정의 — SessionManager 핵심 로직, MCP tool handler 통합, CLI/Telegram 외부 연동, 18개 테스트 시나리오, 7개 기존 설계 문서 v0.9 통합

**Phases completed:** 36-40 (10 plans total)

**Key accomplishments:**

- 토큰 파일 인프라 — getMcpTokenPath/writeMcpToken/readMcpToken 3개 공유 유틸리티, write-then-rename 원자적 쓰기, SESSION_EXPIRING_SOON 17번째 알림 이벤트
- SessionManager 핵심 설계 — getToken/getState/start/dispose 4개 public 메서드, 9개 내부 상태, 60% TTL 자동 갱신, safeSetTimeout(32-bit overflow 방어), 5종 에러 분기 + lazy 401 reload
- MCP 통합 설계 — ApiClient 래퍼 클래스, 6+3 tool/resource handler 통합, 50ms 대기 토큰 로테이션 동시성, 60초 polling 에러 복구, Claude Desktop isError 회피 전략
- CLI + Telegram 연동 — mcp setup(7단계)/refresh-token(8단계) 커맨드, /newsession 인라인 키보드, resolveDefaultConstraints 공용 함수
- 테스트 설계 + 문서 통합 — T-01~T-14 + S-01~S-04 시나리오 명시, pitfall 교차 참조 매트릭스, 7개 설계 문서 85개 [v0.9] 태그 통합

**Stats:**

- 47 files created/modified
- +15,463 / -470 lines (Markdown design docs)
- 5 phases, 10 plans, 21 requirements, 34 설계 결정, 7 설계 문서 수정 (85 [v0.9] 태그)
- 1 day (2026-02-09)

**Git range:** `cd8ef0a` (v0.8 complete) → `f15eed7` (Phase 40 complete)

**What's next:** v0.10 구현 계획 — 설계 문서(24-64) 기반 구현 마일스톤 시작

---

## v0.8 Owner 선택적 등록 + 점진적 보안 모델 (Shipped: 2026-02-09)

**Delivered:** Owner 지갑 등록을 필수에서 선택으로 전환하고, 등록 여부에 따라 보안 기능이 점진적으로 해금되는 모델을 설계 — 3-State 상태 머신(NONE/GRACE/LOCKED), APPROVAL→DELAY 다운그레이드, sweepAll 자금 회수 프로토콜, 14개 기존 설계 문서 v0.8 통합

**Phases completed:** 31-35 (11 plans total)

**Key accomplishments:**

- Owner 선택적 데이터 모델 — agents.owner_address nullable 전환, OwnerState(NONE/GRACE/LOCKED) 런타임 파생 타입, IChainAdapter.sweepAll 20번째 메서드 추가
- Owner 생명주기 상태 머신 — 3-State 6-전이 설계, OwnerLifecycleService, 유예/잠금 2단계 인증 분기, 보안 공격 방어 4건(C-01/C-02/H-02/H-03)
- 정책 다운그레이드 메커니즘 — evaluate() Step 9.5 APPROVAL→DELAY 다운그레이드, TX_DOWNGRADED_DELAY 16번째 알림 이벤트, 3채널 Owner 등록 안내 템플릿
- 자금 회수 프로토콜 — withdraw API(38번째 엔드포인트), sweepAll Solana 4단계 실행, HTTP 207 부분 실패, Kill Switch/세션 갱신 Owner 유무 분기
- DX + 설계 문서 통합 — 3개 신규 CLI 명령(set-owner/remove-owner/withdraw), 18x3 Owner 상태 분기 매트릭스 SSoT, 14개 설계 문서 + 3개 참조 문서 v0.8 통합(240 [v0.8] 태그)

**Stats:**

- 53 files created/modified
- +13,651 / -386 lines (Markdown design docs)
- 5 phases, 11 plans, 33 requirements, 17 설계 문서 수정 (240 [v0.8] 태그)
- 2 days (2026-02-08 → 2026-02-09)

**Git range:** `227b495` (milestone start) → `bfa407d` (Phase 35 complete)

**What's next:** v0.9 구현 준비 — 설계 문서(24-64) 기반 구현 마일스톤 시작

---

## v0.7 구현 장애 요소 해소 (Shipped: 2026-02-08)

**Delivered:** v0.1~v0.6 설계 문서 전수 분석에서 도출된 25건의 구현 장애 요소(CRITICAL 7 + HIGH 10 + MEDIUM 8)를 기존 설계 문서 9개를 직접 수정하여 해소, 코드 작성 첫날부터 차단 없이 구현 가능한 상태를 확립

**Phases completed:** 26-30 (11 plans total)

**Key accomplishments:**

- 체인 어댑터 안정화 — Solana blockhash freshness guard, IChainAdapter 17→19 메서드(EVM nonce), AES-GCM nonce 수학 정정, Priority fee TTL Nyquist 근거 + 1.5배 bump
- 데몬 보안 기반 확립 — JWT Secret dual-key rotation(5분 윈도우), flock 인스턴스 잠금(PID 폐기), Rate Limiter 2단계 분리, killSwitchGuard 503 SYSTEM_LOCKED, Master Password Argon2id 통일
- 의존성 빌드 환경 해소 — SIWE viem/siwe 전환(ethers 제거), Sidecar 5개 타겟 플랫폼 + prebuildify 네이티브 번들
- API 통합 프로토콜 완성 — Tauri sidecar 종료 35초 + integrity_check, CORS 5종 Origin, Owner disconnect cascade 5단계, TransactionType HTTP status 매트릭스, Python SDK to_camel SSoT
- 스키마 설정 확정 — config.toml 환경변수 평탄화(17키), SQLite timestamp 초 단위 통일, agents CHECK 제약, Docker UID 1001, amount TEXT 근거, 알림 채널 BEGIN IMMEDIATE

**Stats:**

- 67 files created/modified
- +12,437 / -746 lines (Markdown design docs)
- 5 phases, 11 plans, 25 requirements, 9 설계 문서 수정 (150+ [v0.7 보완] 태그)
- 1 day (2026-02-08)

**Git range:** `d09bdbb` (milestone start) → `f0a3778` (Phase 30 complete)

**What's next:** v1.0 구현 마일스톤 — 설계 문서(24-64)를 기반으로 실제 코드 구현 시작

---

## v0.6 블록체인 기능 확장 설계 (Shipped: 2026-02-08)

**Delivered:** IChainAdapter와 트랜잭션 파이프라인을 확장하여 SPL/ERC-20 토큰 전송, 임의 컨트랙트 호출, Approve 관리, 배치 트랜잭션, 가격 오라클, Action Provider 아키텍처를 설계하고, 기존 설계 문서 8개에 v0.6 변경을 통합

**Phases completed:** 22-25 (11 plans total)

**Key accomplishments:**

- 토큰 확장 설계 — TransferRequest.token 확장(SPL/ERC-20), getAssets() 복원, ALLOWED_TOKENS 정책, ATA/gas 수수료 추정
- 트랜잭션 타입 확장 — ContractCallRequest(기본 거부 opt-in), ApproveRequest(독립 정책 카테고리, 무제한 차단), BatchRequest(Solana 원자적, 2단계 합산 정책)
- 상위 추상화 레이어 — IPriceOracle(CoinGecko/Pyth/Chainlink, 5분TTL, OracleChain fallback), USD 기준 정책 평가 전환
- Action Provider 아키텍처 — IActionProvider resolve-then-execute 패턴, MCP Tool 자동 변환(16개 상한), Jupiter Swap 상세 설계
- 테스트 전략 통합 — Mock 경계 5→10개, Contract Test 5→7개, Hardhat EVM 환경, 166개 시나리오(124기능+42보안)
- 기존 문서 8개 v0.6 통합 — Enum 9→12, IChainAdapter 13→17 메서드, REST API 31→36 엔드포인트, 에러코드 40→60

**Stats:**

- 58 files created/modified
- +26,976 / -247 lines (Markdown design docs)
- 4 phases, 11 plans, 30 requirements, 17 deliverables (docs 56-64 신규 + 기존 8개 수정)
- 2 days (2026-02-07 → 2026-02-08)

**Git range:** `2571e9c` (Phase 22 start) → `54cb3d3` (Phase 25 complete)

**What's next:** 구현 마일스톤 — 설계 문서(24-64)를 기반으로 실제 코드 구현 시작

---

## v0.5 인증 모델 재설계 + DX 개선 (Shipped: 2026-02-07)

**Delivered:** masterAuth/ownerAuth/sessionAuth 3-tier 인증 모델을 재설계하고, Owner 주소를 에이전트별 속성으로 이동하며, 세션 낙관적 갱신 프로토콜과 CLI DX 개선을 설계하여, 기존 설계 문서 11개에 v0.5 변경을 통합

**Phases completed:** 19-21 (9 plans total)

**Key accomplishments:**

- 3-Tier 인증 모델 재설계 — masterAuth(로컬 관리) / ownerAuth(자금 인가, 2곳 한정) / sessionAuth(에이전트 API) 책임 분리, authRouter 통합 디스패처
- Owner 주소 에이전트별 귀속 — agents.owner_address NOT NULL, config.toml [owner] 제거, owner_wallets → wallet_connections 전환, WalletConnect 선택적
- 세션 낙관적 갱신 프로토콜 — PUT /renew sessionAuth, 5종 안전 장치(maxRenewals 30, 총 수명 30일, 50% 시점), 토큰 로테이션 + Owner 사후 거부
- CLI DX 개선 — init 2단계 간소화, --quickstart 단일 커맨드, --dev 모드, actionable 에러 hint 31/40 매핑, MCP 옵션 B 채택
- 설계 문서 11개 v0.5 통합 — 신규 4문서(52-55) + 기존 11개 수정, 통합 검증 25/25 PASSED

**Stats:**

- 54 files created/modified
- +14,928 / -696 lines (Markdown design docs)
- 3 phases, 9 plans, 24 requirements, 15 deliverables (docs 52-55 신규 + 11개 수정)
- 1 day (2026-02-07)

**Git range:** `683aace` (Phase 19 start) → `84dfef3` (audit complete)

**What's next:** 구현 마일스톤 — 설계 문서(24-55)를 기반으로 실제 코드 구현 시작

---

## v0.4 테스트 전략 및 계획 수립 (Shipped: 2026-02-07)

**Delivered:** v0.2 설계 문서(17개) + v0.3 일관성 대응표(5개)를 역방향 검증하는 테스트 전략을 수립하여, 구현 단계에서 "무엇을 어떻게 테스트할 것인가"가 명확한 상태를 확립

**Phases completed:** 14-18 (9 plans total)

**Key accomplishments:**

- 테스트 기반 확립 — 6개 테스트 레벨, 9x6 모듈 매트릭스, 4-tier 커버리지 목표, IClock/IOwnerSigner 인터페이스 + 5개 Contract Test 전략
- 보안 시나리오 71건 — 3계층 공격 47건 + 경계값 19건 + E2E 연쇄 체인 5건, Given-When-Then 테스트 케이스 수준
- 블록체인 테스트 격리 — Solana 3단계(Mock RPC 13건 / Local Validator 5흐름 / Devnet 3건), Enum SSoT 빌드타임 파생 체인
- CI/CD 파이프라인 설계 — 4단계(push/PR/nightly/release), GitHub Actions 4 YAML + 1 composite action, Soft/Hard 커버리지 게이트
- 배포 타겟별 테스트 118건 — CLI 32 + Docker 18 + Tauri 34(자동 6+수동 28) + Telegram 34 시나리오

**Stats:**

- 44 files created/modified
- 9,432 lines of test strategy docs (Markdown)
- 5 phases, 9 plans, 26 requirements, 11 deliverables (docs 41-51)
- 2 days (2026-02-06 → 2026-02-07)

**Git range:** `a0214e1` (Phase 14 start) → `725f083` (Phase 18 complete)

**What's next:** v0.5 구현 — 테스트 전략 문서를 참조하여 테스트 코드, Mock 구현, CI 워크플로우 작성 시작

---

## v0.3 설계 논리 일관성 확보 (Shipped: 2026-02-06)

**Delivered:** v0.1(23개) + v0.2(17개) = 40개 설계 문서를 크로스체크하여 37개 비일관성(8 CRITICAL + 15 HIGH + 14 MEDIUM)을 모두 해소, 구현 단계 진입을 위한 Single Source of Truth 확립

**Phases completed:** 10-13 (8 plans total)

**Key accomplishments:**

- v0.1 잔재 정리 — 6개 문서 SUPERSEDED 표기, v0.1→v0.2 변경 매핑 문서 + 3개 용어 대응표(인터페이스/에러코드/에스컬레이션) 작성
- CRITICAL 4건 의사결정 확정 — 포트 3100 통일, TransactionStatus 8개 SSoT, Docker hostname 오버라이드(WAIAAS_DAEMON_HOSTNAME), 자금 충전 모델(Owner→Agent 직접 전송)
- Enum/상태값 9개 통합 대응표 작성(45-enum-unified-mapping.md) + config.toml 누락 설정 11개 추가 (jwt_secret, rate_limit 3-level, auto_stop, kill_switch, policy_defaults)
- REST API↔API Framework 6건 스펙 통일 (CORS, Health, ownerAuth 9단계, memo 이중 검증) + 11개 구현 노트를 8개 설계 문서에 추가
- 37/37 요구사항 완료, 5/5 E2E 문서 플로우 검증, 0건 기술 부채

**Stats:**

- 35 files created/modified
- +6,856 / -314 lines (Markdown design docs)
- 4 phases, 8 plans, 37 requirements
- 1 day (2026-02-06)

**Git range:** `8f5203d` (Phase 10 start) → `a027142` (audit complete)

**What's next:** v0.4 Implementation — 통일된 설계 문서를 기반으로 실제 코드 구현 시작

---

## v0.2 Self-Hosted Secure Wallet Design (Shipped: 2026-02-05)

**Delivered:** Self-Hosted AI 에이전트 지갑의 상세 설계를 완성 -- 3계층 보안 모델, 17개 설계 문서, 45개 요구사항을 구현 가능한 수준으로 정의

**Phases completed:** 6-9 (16 plans total)

**Key accomplishments:**

- 암호화 키스토어 바이트 수준 스펙 (AES-256-GCM + Argon2id + sodium guarded memory) + SQLite 7-table 스키마 + 데몬 라이프사이클 설계
- JWT 세션 프로토콜 (SIWS/SIWE 서명), 6단계 거래 파이프라인, SolanaAdapter 13 메서드 상세 설계
- 3계층 보안: 4-tier 정책 엔진 + WalletConnect v2 Owner 인증 + 멀티 채널 알림 + Kill Switch 캐스케이드
- REST API 31 엔드포인트 + TypeScript/Python SDK + MCP 6 도구 + Tauri Desktop 8화면 + Telegram Bot + Docker 배포 스펙
- 45개 요구사항 전체 충족, 교차 페이즈 통합 43건 검증, E2E 6개 핵심 플로우 완전

**Stats:**

- 74 files created/modified
- 32,158 lines of design docs (Markdown deliverables)
- 4 phases, 16 plans, 17 deliverables
- 1 day (same-day completion, 2026-02-05)

**Git range:** `5be4181` (Phase 6 start) → `fec9f88` (audit complete)

**What's next:** v0.3 Implementation -- 설계 문서를 기반으로 실제 코드 구현 시작

---

## v0.1 Research & Design (Shipped: 2026-02-05)

**Delivered:** AI 에이전트용 Wallet-as-a-Service의 전체 설계 문서 완성 — 기술 스택부터 API 스펙까지.

**Phases completed:** 1-5 (15 plans total)

**Key accomplishments:**

- 기술 스택 확정 — TypeScript 5.x/Fastify 5.x/PostgreSQL/Redis, Solana @solana/kit 3.x 개발 환경
- 커스터디 모델 확정 — AWS KMS + Nitro Enclaves + Squads Protocol 하이브리드 아키텍처 (직접 구축, 외부 프로바이더 배제)
- Dual Key 아키텍처 설계 — Owner Key(KMS)/Agent Key(Enclave) 분리, 3중 정책 검증 레이어
- 소유자-에이전트 관계 모델 — 5단계 에이전트 라이프사이클, Budget Pool 자금 관리, Hub-and-Spoke 멀티 에이전트
- API 스펙 완성 — 33개 REST 엔드포인트, 46개 에러 코드, 31개 SDK 메서드, 9개 MCP Tools
- 보안 위협 모델링 — 10개 위협 식별, 4단계 대응 체계, Circuit Breaker 패턴

**Stats:**

- 78 files created
- 38,262 lines of Markdown
- 5 phases, 15 plans, 23 requirements
- 2 days from start to ship (2026-02-04 → 2026-02-05)

**Git range:** first commit → `fbceed0`

**What's next:** 구현 마일스톤 — 코어 지갑 서비스, 트랜잭션 서비스, 정책 엔진, API 서버 구현

---



## v1.1 코어 인프라 + 기본 전송 (Shipped: 2026-02-10)

**Delivered:** CLI로 init → start → SOL 전송 → 확인까지 동작하는 최소 데몬 구현 — 모노레포 스캐폴드, SQLite 7-table, AES-256-GCM 키스토어, 6단계 데몬 라이프사이클, Hono API 서버, SolanaAdapter, 6-stage 트랜잭션 파이프라인, CLI 4개 명령어, 281개 테스트 통과

**Phases completed:** 48-51 (12 plans total)

**Key accomplishments:**

- 모노레포 스캐폴드 — pnpm workspace + Turborepo 4-패키지 (core, daemon, adapter-solana, cli), ESLint flat config, Vitest workspace, ESM-only TypeScript
- @waiaas/core 패키지 완성 — 12 Enum SSoT (as const→Zod pipeline), 5 Zod 스키마, 66 에러 코드 통합 매트릭스, WAIaaSError, 4 인터페이스, i18n (en/ko), 65 단위 테스트
- 데몬 인프라 — SQLite 7-table Drizzle ORM + CHECK 제약, AES-256-GCM 키스토어 (Argon2id KDF, sodium guarded memory), config.toml 로더 (smol-toml + Zod), DaemonLifecycle (6-step 시작/10-step 종료/flock 잠금/BackgroundWorkers)
- API + SolanaAdapter — Hono 4.x 서버 (5 미들웨어 + errorHandler), SolanaAdapter 10개 IChainAdapter 메서드 (@solana/kit 6.x), 에이전트/지갑 라우트, 167 데몬 테스트
- 트랜잭션 파이프라인 — 6-stage (validate→auth→policy→wait→execute→confirm), DefaultPolicyEngine INSTANT 패스스루, async fire-and-forget (201 즉시 반환), guarded memory release
- CLI + E2E — commander 13.x CLI 4개 명령어 (init/start/stop/status), 12 E2E 통합 테스트 (MockChainAdapter), 전체 281 테스트 통과

**Stats:**

- 97 TypeScript files, 10,925 LOC
- 4 phases, 12 plans, 24 tasks, 46 requirements
- 281 tests (65 core + 17 adapter + 167 daemon + 32 CLI)
- 40 commits, 1 day (2026-02-10)

**Git range:** `fffcb2f` (Phase 48 start) → `3bf9d8d` (Phase 51 complete)

**What's next:** v1.2 인증 + 정책 엔진 — 3-tier 인증 (masterAuth/ownerAuth/sessionAuth), 4-tier 정책, Owner 상태 머신

---

## v1.0 구현 계획 수립 (Shipped: 2026-02-09)

**Delivered:** v0.1~v0.10 설계 완료 후 구현 착수를 위한 8개 마일스톤별 objective 문서(v1.1~v2.0) 생성, 설계 부채 추적 체계 초기화, 37개 설계 문서 전수 매핑 검증

**Phases completed:** 45-47 (5 plans total)

**Key accomplishments:**

- objective 문서 8개 (v1.1~v2.0) — 7-section 부록 구조로 목표/설계문서/산출물/기술결정/E2E/의존/리스크 통일
- 설계 부채 추적 — objectives/design-debt.md, Tier 1~3 분류, v2.0 전 0건 목표
- 설계 문서 매핑 검증 — 37개 설계 문서→구현 마일스톤 양방향 교차 검증 완료
- 구현 마일스톤 8개 순서 확정 — 의존 그래프: 코어→인증→SDK→토큰→DeFi→클라이언트→품질→릴리스

**Stats:**

- 3 phases, 5 plans, 10 requirements, 28 설계 결정
- 1 day (2026-02-09)

**What's next:** v1.1 코어 인프라 + 기본 전송 — 모노레포, SQLite, 키스토어, 데몬, CLI, 파이프라인 구현

---


## v1.2 인증 + 정책 엔진 (Shipped: 2026-02-10)

**Delivered:** v1.1 코어 인프라 위에 3-tier 인증 체계(sessionAuth JWT HS256 + masterAuth Argon2id + ownerAuth Ed25519)와 4-tier 정책 엔진(DatabasePolicyEngine)을 구현하여, 세션 기반 에이전트 접근 제어, 금액별 보안 분류, DELAY/APPROVAL 워크플로우, Owner 3-State 점진적 보안 해금이 동작하는 상태를 달성

**Phases completed:** 52-57 (13 plans total)

**Key accomplishments:**

- 3-Tier 인증 체계 구축 — sessionAuth(JWT HS256 dual-key rotation) + masterAuth(Argon2id) + ownerAuth(Ed25519 서명) 미들웨어, 전 엔드포인트 인증 적용 (37 tests)
- 세션 관리 API 완성 — CRUD(create/list/revoke) + 낙관적 갱신(5종 안전 장치: maxRenewals 30, absoluteExpiresAt 30일, 50% TTL, token_hash CAS, revocation check) (21 tests)
- DatabasePolicyEngine 4-tier 분류 — SPENDING_LIMIT BigInt + WHITELIST 대소문자 무관 평가, 정책 CRUD API, TOCTOU 방지(BEGIN IMMEDIATE + reserved_amount) (28 tests)
- DELAY/APPROVAL 워크플로우 — DelayQueue 쿨다운 자동 실행 + ApprovalWorkflow Owner 서명 승인/거절/3단계 타임아웃 만료, BackgroundWorkers 통합 (25 tests)
- Owner 3-State 상태 머신 — NONE/GRACE/LOCKED 점진적 보안 해금, resolveOwnerState 순수 함수, APPROVAL→DELAY 자동 다운그레이드, ownerAuth 성공 시 GRACE→LOCKED 자동 전이 (18 tests)
- 파이프라인 전 구간 통합 + 457 테스트 — Stage 2(Auth) sessionId + Stage 3(Policy) evaluateAndReserve + Stage 4(Wait) DELAY/APPROVAL 분기, E2E 통합 검증 29건, 전체 457 테스트 통과

**Stats:**

- 238 TypeScript files, 25,526 LOC (10,925 → 25,526, +14,601)
- 6 phases, 13 plans, 35 requirements
- 457 tests (281 → 457, +176 new tests)
- 50 commits, ~6 hours (14:29 → 20:37 KST, 2026-02-10)
- 99 files changed, +16,828 / -181 lines

**Git range:** `v1.1` → `gsd/phase-57-integration-tests`

**What's next:** v1.3 SDK + MCP + 알림 — TypeScript/Python SDK, MCP Server, SessionManager, 알림 3채널

---


## v1.3 SDK + MCP + 알림 (Shipped: 2026-02-11)

**Delivered:** v1.2 인증+정책 엔진 위에 OpenAPIHono 전면 전환(33 엔드포인트 + OpenAPI 3.0 자동 생성), REST API 15개 추가, 3채널 알림 시스템, TypeScript/Python SDK, MCP Server를 구현하여, AI 에이전트가 SDK 또는 MCP로 지갑을 프로그래밍 방식으로 사용하고 Owner가 실시간 알림을 받을 수 있는 상태를 달성

**Phases completed:** 58-63 (11 plans total)

**Key accomplishments:**

- OpenAPIHono 전면 전환 — 기존 18 라우트 createRoute() 리팩터링 + 신규 15 작성 = 33 엔드포인트, GET /doc OpenAPI 3.0 JSON 자동 생성, 68개 에러 코드 OpenAPI 매핑, IChainAdapter.getAssets() 선행 구현
- REST API 확장 — 15개 신규 엔드포인트(assets, transactions, pending, nonce, agents CRUD, admin 6종), error hint 32개(AI 에이전트 자율 복구용 resolveHint), 커서 페이지네이션(UUID v7)
- 3채널 알림 시스템 — TelegramChannel(Bot API MarkdownV2), DiscordChannel(Webhook Embed), NtfyChannel(plain text Priority), NotificationService 우선순위 폴백 + broadcast, 21개 이벤트 en/ko 템플릿, config.toml 8키 확장
- TypeScript SDK (@waiaas/sdk) — WAIaaSClient 9 메서드 + WAIaaSOwnerClient 4 메서드, 0 외부 의존성(Node.js 22 fetch), WAIaaSError 구조화 에러, 지수 백오프 재시도, 인라인 사전 검증
- Python SDK (waiaas) — async httpx WAIaaSClient, 10 Pydantic v2 모델, snake_case↔camelCase dual access, 지수 백오프 재시도, TS SDK 동일 인터페이스
- MCP Server (@waiaas/mcp) — 6 도구 + 3 리소스, SessionManager(토큰 로드 + 60% TTL 자동 갱신 + 지수 백오프 재시도 + 409 CONFLICT 처리 + 복구 루프), CLI `waiaas mcp setup` 원클릭 설정

**Stats:**

- 32,337 TypeScript LOC + 1,592 Python LOC = 33,929 총 LOC
- 6 phases, 11 plans, 49 requirements
- 784 tests (457 → 784, +327 new tests)
- 41 commits, 104 files changed, +13,392 / -171 lines
- 7 days (2026-02-04 → 2026-02-11)

**Git range:** `v1.2` → `gsd/phase-63-mcp-server`

**What's next:** v1.4 토큰 + 컨트랙트 확장 — SPL/ERC-20 토큰 전송, 컨트랙트 호출, Approve, Batch, EVM 어댑터

---


## v1.3.1 Admin Web UI 설계 (Shipped: 2026-02-11)

**Delivered:** 데몬 내장 경량 관리 웹 UI(5 페이지 SPA)의 전체 설계 문서(67-admin-web-ui-spec.md, 10개 섹션)를 작성하여 v1.3.2에서 즉시 구현 착수할 수 있는 상태를 확립

**Phases completed:** 64-65 (2 plans total)

**Key accomplishments:**

- Hono serveStatic SPA 서빙 + CSP 보안(default-src 'none') + 캐시 정책(해시 immutable + no-cache) + admin_ui 토글 설계
- masterAuth 로그인 흐름 + @preact/signals Auth Store + 15분 비활성 타임아웃 + 4종 로그아웃 트리거 설계
- 5개 페이지 화면 설계 (Dashboard/Agents/Sessions/Policies/Settings) — ASCII 와이어프레임, 컴포넌트 계층, API 매핑, 상호작용 흐름
- CSS Variables 디자인 토큰(색상/간격/타이포/티어) + 8개 공통 컴포넌트 인터페이스(Table/Form/Modal/Toast/Button/Badge/CopyButton/EmptyState)
- 68개 에러 코드 전체 매핑 + fetch 래퍼(X-Master-Password 자동 주입, 10초 타임아웃) + 로딩/빈/에러/셧다운 4종 UX 패턴

**Stats:**

- 1 file created (docs/67-admin-web-ui-spec.md, 10 sections)
- 2 phases, 2 plans, 4 tasks, 18 requirements, 13 설계 결정
- 1 day (2026-02-11)

**Git range:** `8f8bddc` (Phase 64 start) → `fb012b0` (Phase 65 complete)

**What's next:** v1.3.2 Admin Web UI 구현 — 설계 문서 67 기반 Preact SPA 구현

---


## v1.3.2 Admin Web UI 구현 (Shipped: 2026-02-11)

**Delivered:** v1.3.1 설계 문서 67(10섹션) 기반으로 Preact 10.x + Vite 6.x Admin Web UI SPA를 구현하여, 브라우저에서 `http://127.0.0.1:{port}/admin`으로 에이전트 등록, 세션 관리, 정책 설정 등 핵심 관리 기능을 수행할 수 있는 상태를 달성

**Phases completed:** 66-70 (10 plans total)

**Key accomplishments:**

- Preact + Vite 빌드 파이프라인 — @waiaas/admin 패키지 스캐폴드, postbuild daemon/public/admin/ 복사, CSP(default-src 'none') 미들웨어, Kill Switch bypass, admin_ui/admin_timeout config 확장
- masterAuth 로그인 + Auth Store — @preact/signals 기반 상태 관리, 비활성 타임아웃 자동 로그아웃, fetch 래퍼(X-Master-Password 자동 주입), 70 에러 코드 사용자 친화적 매핑
- Dashboard/Agents/Sessions 페이지 — 6-카드 데몬 상태 요약 + 30초 폴링, 에이전트 CRUD + Owner 상태 읽기 전용, 세션 생성/조회/폐기 + JWT 토큰 원타임 표시
- Policies/Settings 페이지 — 10 유형 정책 CRUD + 4-tier SPENDING_LIMIT 시각화(초록/파랑/노랑/빨강), Kill Switch 토글, JWT 회전, 데몬 종료(type-to-confirm)
- Vitest + Testing Library 27 테스트 — 인증 4건, 유틸 6건, 페이지 14건(Dashboard 3 + Agents 5 + Sessions 3 + Policies 3 + Settings 3), 보안/서빙 4건(CSP, admin_ui toggle, Kill Switch bypass)

**Stats:**

- 79 files changed, +13,046 / -47 lines
- @waiaas/admin: 4,440 LOC (TSX/TS/CSS)
- Total project: 45,332 LOC
- 5 phases, 10 plans, 22 requirements, 32 구현 결정
- 816 tests (784 → 816, +32 new admin tests)
- 37 commits, ~4 hours (15:34 → 19:39 KST, 2026-02-11)

**Git range:** `3f5b57f` (Phase 66 start) → `afd7ca8` (Phase 70 complete)

**What's next:** v1.4 토큰 + 컨트랙트 확장 — SPL/ERC-20 토큰 전송, 컨트랙트 호출, Approve, Batch, EVM 어댑터

---


## v1.3.4 알림 이벤트 트리거 연결 + 어드민 알림 패널 (Shipped: 2026-02-12)

**Delivered:** v1.3 알림 인프라(NotificationService, 3채널, 21 이벤트 템플릿)를 파이프라인/라우트에 실제 연결하고, notification_logs DB 테이블 + 어드민 UI 알림 패널을 추가하여, 데몬에서 발생하는 주요 이벤트가 실제로 사용자에게 알림으로 전달되고 어드민이 브라우저에서 상태를 확인/테스트/로그 조회할 수 있는 상태를 달성

**Phases completed:** 73-75 (5 plans total)

**Key accomplishments:**

- notification_logs DB 테이블 + 증분 마이그레이션 — schema_version 기반 MIG-01 준수, fire-and-forget logDelivery(), 채널별 sent/failed 개별 기록
- 파이프라인 5개 이벤트 트리거 — Stage 1 TX_REQUESTED, Stage 3 POLICY_VIOLATION, Stage 5 TX_SUBMITTED/TX_FAILED, Stage 6 TX_CONFIRMED, void notify() fire-and-forget 패턴
- 라우트/워커 3개 이벤트 트리거 — POST /sessions SESSION_CREATED, PUT /agents/:id/owner OWNER_SET, session-cleanup worker SESSION_EXPIRED
- 어드민 알림 API 3개 엔드포인트 — GET /admin/notifications/status (credential 마스킹), POST /admin/notifications/test, GET /admin/notifications/log (Drizzle 페이지네이션)
- 어드민 알림 패널 UI — 3-column 채널 상태 카드, 테스트 발송 버튼, 발송 로그 테이블(20건/페이지), config.toml 안내 info box

**Stats:**

- 42 files changed, +5,590 / -52 lines
- 3 phases, 5 plans, 10 tasks, 18 requirements, 13 설계 결정
- 895 tests (847 → 895, +48 new tests)
- 42,123 LOC total
- 2 hours (2026-02-11 22:39 → 2026-02-12 00:38)

**Git range:** `0fe6723` (Phase 73 start) → `2891558` (Phase 75 complete)

**What's next:** v1.4 토큰 + 컨트랙트 확장 — SPL/ERC-20 토큰 전송, 컨트랙트 호출, Approve, Batch, EVM 어댑터

---


## v1.4 토큰 + 컨트랙트 확장 (Shipped: 2026-02-12)

**Delivered:** v1.3.4 알림 인프라 위에 5가지 트랜잭션 타입(TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH)을 지원하는 완전한 블록체인 기능 확장을 구현하여, SPL/ERC-20 토큰 전송, 스마트 컨트랙트 호출, Approve 관리, Solana 원자적 배치가 기본 거부 정책으로 동작하고, @waiaas/adapter-evm 패키지가 viem 2.x 기반으로 IChainAdapter 20메서드를 구현하며, Stage 5가 ChainError 카테고리별 재시도를 수행하는 상태를 달성

**Phases completed:** 76-81 (12 plans total)

**Key accomplishments:**

- ChainError 3-카테고리 시스템 + DB 마이그레이션 러너 — 27개 에러 코드 PERMANENT/TRANSIENT/STALE 자동 분류, schema_version 기반 증분 마이그레이션, discriminatedUnion 5-type TransactionRequestSchema, IChainAdapter 11→20 메서드 확장, 6개 PolicyType superRefine 검증
- @waiaas/adapter-evm 패키지 — viem 2.x Client/Action 패턴으로 IChainAdapter 20메서드 구현(17 실제 + 3 스텁), EIP-1559 네이티브 전송, ERC-20 전송/approve, gas 추정 1.2x, nonce 관리, ChainError viem 에러 패턴 매칭
- SPL/ERC-20 토큰 전송 + ALLOWED_TOKENS 정책 — SolanaAdapter buildTokenTransfer(Token-2022 분기, ATA 자동 생성), EvmAdapter buildTokenTransfer(ERC-20 calldata), ALLOWED_TOKENS 기본 거부 정책, getAssets 토큰 잔액 포함(네이티브 첫 번째 + 잔액 내림차순), getTokenInfo/estimateFee 구현
- 컨트랙트 호출 + Approve 관리 — buildContractCall(EVM calldata/Solana programId+instructionData), CONTRACT_WHITELIST/METHOD_WHITELIST 기본 거부 정책, buildApprove(EVM ERC-20/Solana SPL ApproveChecked), APPROVED_SPENDERS/APPROVE_AMOUNT_LIMIT/APPROVE_TIER_OVERRIDE 정책, 무제한 approve 차단
- Solana 원자적 배치 + 2단계 합산 정책 — buildBatch(min 2/max 20 instructions), evaluateBatch(개별 평가 + 합산 SPENDING_LIMIT, All-or-Nothing), classifyInstruction 필드 기반 union 판별, EVM BATCH_NOT_SUPPORTED
- Stage 5 CONC-01 + discriminatedUnion 파이프라인 — Stage 1 type 필드 기반 5-type 파싱, Stage 3 type별 정책 필터링(10 PolicyType), Stage 5 build→simulate→sign→submit 재시도 루프(PERMANENT 즉시 실패/TRANSIENT 지수 백오프/STALE 재빌드), buildByType 5-type adapter 라우팅

**Stats:**

- 50 files changed, +9,814 / -187 lines
- @waiaas/adapter-evm: 신규 패키지 (9패키지 모노레포)
- Total project: 51,750 LOC (42,123 → 51,750, +9,627)
- 6 phases, 12 plans, 35 requirements, 50+ 설계 결정
- 1,126 tests (895 → 1,126, +231 new tests)
- 1 day (2026-02-12)

**Git range:** `a9ba1e1` (Phase 76 start) → `34c2aec` (Phase 81 complete)

**What's next:** v1.4.1 EVM 지갑 인프라 — secp256k1 키 생성, 어댑터 팩토리, Config EVM RPC

---


## v1.4.1 EVM 지갑 인프라 + REST API 5-type 통합 + Owner Auth SIWE (Shipped: 2026-02-12)

**Delivered:** v1.4 EVM 어댑터를 데몬에 연결하여 EVM 에이전트 생성(secp256k1)부터 트랜잭션 실행까지 풀 라이프사이클이 동작하고, REST API가 5가지 트랜잭션 타입을 수용하며, Owner Auth SIWE(EIP-4361)가 지원되는 상태를 달성

**Phases completed:** 82-88 (15 plans total)

**Key accomplishments:**

- EVM 네트워크 인프라 — NetworkType 13값 확장, EVM_CHAIN_MAP 10 네트워크→viem Chain 매핑, DaemonConfig EVM RPC 16키(drpc.org 기본값), evm_default_network, validateChainNetwork 교차 검증
- secp256k1 멀티커브 키스토어 — EVM 에이전트 생성 시 0x EIP-55 체크섬 주소 파생, AES-256-GCM 암호화 + sodium_memzero, curve 필드 하위 호환(missing=ed25519), network 파라미터 연결
- AdapterPool 어댑터 팩토리 — agent.chain/network 기반 SolanaAdapter/EvmAdapter 자동 선택, lazy init + 캐싱, disconnectAll Promise.all fail-soft, 데몬/서버/라우트 adapterPool 패턴 전환
- DB 마이그레이션 v2 — managesOwnTransaction 플래그(자체 PRAGMA/트랜잭션), agents CHECK 제약 EVM 네트워크 확장, 12-step 테이블 재생성, foreign_key_check 검증
- REST API 5-type 통합 — route schema separation 방안 C(OpenAPI oneOf 6-variant + stage1Validate Zod SSoT), 레거시 하위호환(type 미지정→TRANSFER), MCP send_token type/token + TS/Python SDK 5-type 확장
- Owner Auth SIWE — verifySIWE(viem/siwe EIP-4361+EIP-191), owner-auth 미들웨어 chain 분기(ethereum=SIWE/solana=Ed25519), setOwner chain별 주소 형식 검증(EIP-55/base58)
- E2E 통합 검증 — EVM 풀 라이프사이클(생성→잔액→전송→CONFIRMED), 듀얼 체인 동시 운용, 5-type 파이프라인 E2E, MCP/SDK 통합, 전체 회귀 1,310 pass / 0 new failures

**Stats:**

- 94 files changed, +11,604 / -389 lines
- Total project: 65,074 LOC (63,174 TS/TSX + 950 Python + 950 CSS)
- 7 phases, 15 plans, 29 requirements, 50+ 설계 결정
- 1,313 tests (1,126 → 1,313, +187 new tests)
- 53 commits, 1 day (2026-02-12)

**Git range:** `d966065` (Phase 82 start) → `343d90f` (Phase 88 complete)

**What's next:** v1.5 DeFi + 가격 오라클 또는 v1.5.1 x402 클라이언트 지원

---


## v1.4.2 용어 변경 (agent -> wallet) (Shipped: 2026-02-13)

**Delivered:** 코드베이스 전체에서 "agent"를 "wallet"으로 일괄 변경하여 WAIaaS가 관리하는 엔티티의 실체(AI 에이전트가 사용하는 지갑)를 정확히 반영 — DB schema_version 3 마이그레이션, REST API /v1/wallets, JWT wlt claim, Zod/Enum/에러코드/i18n rename, MCP/CLI/SDK/Admin UI 전체 용어 통일, 설계 문서 15개 갱신, grep 전수 검사 0건 확인

**Phases completed:** 89-94 (11 plans total)

**Key accomplishments:**

- DB schema_version 3 마이그레이션 — agents → wallets 테이블 + FK 5개 + 인덱스 10개 + enum 데이터 5건, Drizzle 스키마 갱신
- @waiaas/core 전체 rename — Zod 스키마(WalletSchema, CreateWalletRequestSchema), Enum(WALLET_STATUSES), 에러 코드(WALLET_NOT_FOUND/SUSPENDED/TERMINATED), i18n en/ko 템플릿 {walletId}/{walletCount}, 19파일 137 테스트
- REST API + JWT + Config — /v1/wallets 6개 CRUD 엔드포인트, JWT wlt claim, PipelineContext.walletId, OpenAPI Wallet 스키마, max_sessions_per_wallet config, 65파일 681 테스트
- MCP + CLI + SDK — WalletContext + withWalletPrefix, CLI --wallet, WAIAAS_WALLET_ID/WAIAAS_WALLET_NAME 환경변수, TS/Python SDK walletId/wallet_id 필드, 30파일 159 테스트
- Admin Web UI — Wallets 페이지 + Dashboard walletCount + Sessions/Policies/Notifications walletId, 15파일 40 테스트
- 설계 문서 15개 + README 갱신 + grep 전수 검사 의도적 잔존 외 0건 + 1,326 테스트 통과 + OpenAPI agentId 0건

**Stats:**

- 194 files changed, +10,015 / -2,892 lines
- 6 phases, 11 plans, 22 tasks, 38 requirements, 30+ 설계 결정
- 1,326 tests (1,313 → 1,326, +13 tests, 3 pre-existing CLI E2E excluded)
- 56,808 LOC total
- 1 day (2026-02-13)

**Git range:** `bc17415` (Phase 89 start) → `45f8607` (Phase 94 complete)

**What's next:** v1.5 DeFi + 가격 오라클 또는 EVM 토큰 레지스트리 + MCP DX 개선

---


## v1.4.3 EVM 토큰 레지스트리 + MCP/Admin DX 개선 + 버그 수정 (Shipped: 2026-02-13)

**Delivered:** EVM 지갑의 토큰 자산 조회 한계를 해소하고, Admin UI에서 MCP 토큰 발급까지 원스톱 처리 가능한 상태를 달성 — 체인별 내장 토큰 레지스트리(5 네트워크 24 토큰), getAssets() ERC-20 연동, POST /v1/mcp/tokens API + Admin UI MCP 섹션, EVM/Solana 확인 타임아웃 fallback, 패키지 버전 관리 스크립트, BUG-013~016 전수 해소

**Phases completed:** 95-99 (8 plans total)

**Key accomplishments:**

- 패키지 버전 관리 — tag-release.sh 모노레포 일괄 버전 갱신, 9 패키지 1.4.3 적용 (BUG-016)
- 파이프라인 확인 fallback — EVM waitForConfirmation fallback receipt 조회 + stage6Confirm 3-way 분기, Solana 동일 패턴 적용, SUBMITTED→FAILED 오판 방지 (BUG-015)
- EVM 토큰 레지스트리 — 5개 EVM 메인넷 24개 내장 ERC-20 토큰, tokenRegistry DB 테이블 + migration v4, TokenRegistryService merge layer, GET/POST/DELETE /v1/tokens REST API
- getAssets ERC-20 연동 — 토큰 레지스트리 ∪ ALLOWED_TOKENS 합집합 ERC-20 잔액 자동 조회, case-insensitive 주소 dedup (BUG-014)
- MCP 토큰 관리 API + Admin UI — POST /v1/mcp/tokens 원스톱 프로비저닝 (세션 생성 + 토큰 파일 + Claude Desktop 설정), Admin UI MCP Setup 섹션 (BUG-013)

**Stats:**

- 64 files changed, +5,691 / -104 lines
- 5 phases, 8 plans, 13 requirements, 9 설계 결정
- 1,357 tests (1,326 → 1,357, +31 new tests)
- 59,993 LOC total
- 1 day (2026-02-13)

**Git range:** `345acf1` (Phase 95 start) → `fb27115` (Phase 99 complete)

**What's next:** v1.5 DeFi + 가격 오라클 — IPriceOracle, Action Provider, Jupiter Swap, USD 정책

---


## v1.4.4 Admin Settings + MCP 5-type + Skill Files (Shipped: 2026-02-14)

**Delivered:** Admin UI에서 운영 설정을 DB 기반으로 관리하고(hot-reload), MCP가 REST API/SDK와 동등하게 5가지 트랜잭션 타입을 지원하며, AI 에이전트가 5개 스킬 파일을 로드하여 즉시 API를 사용할 수 있는 상태를 달성

**Phases completed:** 100-104 (10 plans total)

**Key accomplishments:**

- Settings DB 인프라 — settings key-value 테이블 + AES-GCM 암호화(HKDF SHA-256) + DB>config.toml>env>default fallback 체인 + 최초 기동 시 자동 import
- Settings REST API + Hot-Reload — GET/PUT /v1/admin/settings + POST test-rpc 3개 엔드포인트, HotReloadOrchestrator(알림 채널 재생성/RPC 어댑터 evict/보안 즉시 반영)
- Admin UI Settings 페이지 — 알림/RPC/보안/WalletConnect/log_level 5개 카테고리 섹션, credential 마스킹, RPC 테스트 버튼, 알림 테스트 발송, dirty tracking + save/discard bar
- MCP 5-type Feature Parity — call_contract/approve_token/send_batch 3개 MCP 도구 추가, MCPSDK-04 설계 결정 철회, Feature Parity 원칙 확립, BUG-017 해소
- API 스킬 파일 5개 — quickstart(7-step 온보딩), wallet(17+ 엔드포인트), transactions(5-type), policies(10 PolicyType), admin(12 엔드포인트) + 기존 파일 deprecation

**Stats:**

- 5 phases, 10 plans, 20 tasks, 24 requirements, 20 설계 결정
- 1,467 tests (1,357 → 1,467, +110 new tests)
- 62,296 LOC total
- 2 days (2026-02-13 → 2026-02-14)

**Git range:** `6b4e3b3` (Phase 100 start) → `177f78a` (Phase 104 complete)

**What's next:** v1.5 DeFi + 가격 오라클 — IPriceOracle, Action Provider, Jupiter Swap, USD 정책

---


## v1.4.5 멀티체인 월렛 모델 설계 (Shipped: 2026-02-14)

**Delivered:** "1 월렛 = 1 체인 + 1 네트워크" 모델을 "1 월렛 = 1 체인 + 1 환경(testnet/mainnet)" 모델로 전환하는 아키텍처를 4개 설계 문서(docs/68-72)로 완전히 정의 — 데이터 모델, DB 마이그레이션, 파이프라인, 정책 엔진, REST API, MCP, SDK, Quickstart 인터페이스까지 포괄

**Phases completed:** 105-108 (6 plans total)

**Key accomplishments:**

- EnvironmentType Zod SSoT 파생 체인 + 환경-네트워크 매핑 테이블 설계 (13 NETWORK_TYPES 전수, 매핑 함수 4개, 설계 결정 8개)
- DB 마이그레이션 v6a/v6b(12-step 재생성) 전략 설계 — wallets.network → environment 전환, transactions.network 추가, FK dependent 4개 테이블 함께 재생성
- NetworkResolver 순수 함수 + PipelineContext 확장 + ENVIRONMENT_NETWORK_MISMATCH 에러 코드 + Stage 1~6 데이터 흐름도 설계
- ALLOWED_NETWORKS 11번째 PolicyType + 네트워크 스코프 정책 4단계 override 우선순위 + policies 테이블 v8 마이그레이션 설계
- REST API 7개 엔드포인트 network/environment 파라미터 + 3-Layer 하위호환 전략 + 멀티네트워크 잔액 집계 설계
- MCP 6개 도구 + TS/Python SDK network 파라미터 확장 + Quickstart --mode testnet/mainnet 워크플로우 설계

**Stats:**

- 24 files changed, +10,642 / -30 lines (설계 문서)
- 4 phases, 6 plans, 11 tasks, 19 requirements, 31 설계 결정
- 설계 문서: docs/68 (EnvironmentType), docs/69 (DB 마이그레이션), docs/70 (파이프라인), docs/71 (정책 엔진), docs/72 (API/인터페이스)
- 26 commits, 1 day (2026-02-14)

**Git range:** `0eef0e1` (Phase 105 start) → `29439d3` (Phase 108 complete)

**What's next:** v1.4.6 멀티체인 월렛 모델 구현 — 설계 문서 68-72 기반 코드 구현

---


## v1.4.6 멀티체인 월렛 구현 (Shipped: 2026-02-14)

**Delivered:** v1.4.5에서 설계한 멀티체인 월렛 모델(1 월렛 = 1 체인 + 1 환경)을 전 레이어에 구현하여, 하나의 EVM 월렛이 testnet/mainnet 5개 네트워크에서 트랜잭션을 실행하고, ALLOWED_NETWORKS 정책으로 네트워크를 제한하며, REST API/MCP/SDK/Admin UI/CLI 모든 인터페이스에서 네트워크를 선택할 수 있는 상태를 달성

**Phases completed:** 109-114 (13 plans total)

**Key accomplishments:**

- EnvironmentType Zod SSoT + DB 마이그레이션 3건 — v6a/v6b/v8로 wallets.network→environment 전환, transactions.network/policies.network 추가, 환경-네트워크 매핑 함수 4개
- ALLOWED_NETWORKS 11번째 PolicyType — permissive default + 4단계 override 우선순위 (wallet+network > wallet+null > global+network > global+null)
- resolveNetwork() 파이프라인 네트워크 해결 — 3단계 우선순위 순수 함수 + ENVIRONMENT_NETWORK_MISMATCH 에러 코드 + Stage 1~5 전 구간 통합
- REST API 네트워크 확장 — 7개 엔드포인트 network/environment 파라미터 + PUT /default-network + GET /networks 신규 2개 (44 엔드포인트)
- MCP + SDK + Admin UI 멀티체인 — MCP 6개 도구 network 파라미터 + get_wallet_info 신규(11 도구) + TS/Python SDK network 확장 + Admin UI 환경 모델 전환
- CLI quickstart --mode + 스킬 파일 동기화 — testnet/mainnet 원스톱 Solana+EVM 2월렛 생성 + 4개 스킬 파일 환경 모델 반영

**Stats:**

- 122 files changed, +10,922 / -370 lines
- 6 phases, 13 plans, 26 tasks, 35 requirements, 38 설계 결정
- 1,580 tests (1,467 → 1,580, +113 new tests)
- ~73,000 LOC total
- ~6 hours (17:08 → 22:58 KST, 2026-02-14)

**Git range:** `8429893` (Phase 109 start) → `506cf80` (Phase 114 complete)

**What's next:** v1.5 DeFi + 가격 오라클 — IPriceOracle, Action Provider, Jupiter Swap, USD 정책

---


## v1.4.7 임의 트랜잭션 서명 API (Shipped: 2026-02-15)

**Delivered:** 외부 dApp/프로토콜이 빌드한 unsigned 트랜잭션을 WAIaaS가 정책 평가 후 서명하여 반환하는 sign-only API를 구현 — Solana/EVM unsigned tx 파서, 기본 거부 정책 3개 토글, EVM calldata 인코딩 유틸리티, MCP 스킬 리소스 노출, 정책 거부 알림 보강까지 REST API + TS/Python SDK + MCP 전체 인터페이스 완성

**Phases completed:** 115-119 (12 plans total)

**Key accomplishments:**

- Solana/EVM unsigned tx 파서 — IChainAdapter parseTransaction/signExternalTransaction 22메서드, ParsedOperationType 5종(NATIVE_TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/UNKNOWN), DB 마이그레이션 v9 (SIGNED/SIGN SSoT)
- 기본 거부 정책 3개 토글 — default_deny_tokens/contracts/spenders ON/OFF, SettingsService DI, 화이트리스트 정책 공존 시 토글 무시, hot-reload 즉시 반영
- Sign-only 파이프라인 + REST API — POST /v1/transactions/sign (접수→파싱→정책→서명→반환), DELAY/APPROVAL 즉시 거부, reserved_amount SIGNED 누적 이중 지출 방지
- EVM calldata 인코딩 유틸리티 — POST /v1/utils/encode-calldata (viem encodeFunctionData), ABI_ENCODING_FAILED 에러 코드
- TS/Python SDK + MCP 13개 도구 — signTransaction/encodeCalldata SDK 메서드, MCP sign_transaction(13번째)/encode_calldata(12번째) 도구
- MCP 스킬 리소스 + 알림 보강 — waiaas://skills/{name} ResourceTemplate 5개, POLICY_VIOLATION 알림 enrichment (policyType/contractAddress/tokenAddress/adminLink)

**Stats:**

- 54 files changed, +4,356 / -73 lines
- 5 phases, 12 plans, 30 requirements, 33 설계 결정
- 1,636 tests (1,580 → 1,636, +56 new tests)
- ~175,480 LOC total
- 1 day (2026-02-14 → 2026-02-15)

**Git range:** `9acdc6e` (Phase 115 start) → `3641cc3` (Phase 119 complete)

**What's next:** v1.4.8 Admin DX + 알림 개선 또는 v1.5 DeFi + 가격 오라클

---


## v1.4.8 Admin DX + 알림 개선 (Shipped: 2026-02-15)

**Delivered:** OPEN 이슈 12건(020~031) 일괄 해소 — DB 마이그레이션 순서 버그 수정, MCP 고아 프로세스 방지, MCP/CLI/SDK 멀티체인 DX 도구 확장, Admin 대시보드/월렛 상세/세션 개선, 알림 테스트 버그 수정 + Slack 채널 + 메시지 저장

**Phases completed:** 120-124 (8 plans total)

**Key accomplishments:**

- pushSchema 3-step 순서 수정 — 테이블 → 마이그레이션 → 인덱스 분리로 기존 DB 시작 차단 버그 해결, v1/v5 스냅샷 기반 23개 마이그레이션 체인 테스트 추가
- MCP graceful shutdown — stdin end/close 감지 + 3초 force-exit 타임아웃으로 Claude Desktop 종료 시 고아 프로세스 방지, createShutdownHandler 팩토리 패턴
- MCP/CLI/SDK 멀티체인 DX — set_default_network 14번째 MCP 도구 + CLI wallet 서브커맨드 + TS/Python SDK, network=all 잔액/자산 집계 + Promise.allSettled 부분 실패 처리
- Admin 대시보드 확장 — StatCard 클릭 링크, Policies/Recent Txns/Failed Txns 카드, 최근 활동 5건 테이블, 월렛 상세 잔액/트랜잭션, 세션 전체 조회 + walletName JOIN
- 알림 시스템 개선 — apiPost 빈 body SYSTEM_LOCKED 버그 수정, 채널별 개별 Test 버튼, Delivery Log 메시지 확장 패널, Slack Incoming Webhook 채널 구현, DB v10 message 컬럼
- wallet.skill.md + admin.skill.md 동기화 — network=all, set_default_network, wallet info, Slack 채널 반영

**Stats:**

- 83 files changed, +9,312 / -468 lines
- 5 phases, 8 plans, 14 tasks, 28 requirements, 18 설계 결정
- ~1,618 tests (cumulative), ~178,176 LOC total
- 42 commits, 1 day (2026-02-15)

**Git range:** `0509c60` (milestone start) → `ec4aa93` (Phase 124 complete)

**What's next:** v1.5 DeFi + 가격 오라클 또는 v1.4.8 후속 이슈 대응

---


## v1.5 DeFi Price Oracle + Action Provider Framework (Shipped: 2026-02-15)

**Delivered:** USD 기준 정책 평가가 동작하고, Action Provider 프레임워크가 구축되어 DeFi 프로토콜 플러그인을 추가할 수 있는 상태를 달성 — Pyth Hermes + CoinGecko OracleChain fallback, resolveEffectiveAmountUsd 5-type USD 환산, 가격 불명 토큰 NOTIFY 격상, IActionProvider ESM 플러그인 프레임워크, API 키 DB 암호화 저장, MCP Tool 자동 변환, 신규 외부 npm 의존성 0개

**Phases completed:** 125-129 (14 plans total)

**Key accomplishments:**

- IPriceOracle 가격 오라클 — Pyth Hermes Zero-config Primary + CoinGecko Opt-in Fallback, OracleChain 2단계 fallback + 교차 검증(5% 편차 STALE 격하), InMemoryPriceCache LRU 128항목 + 5분 TTL + stampede prevention, classifyPriceAge 3단계(FRESH/AGING/STALE)
- USD 정책 평가 통합 — resolveEffectiveAmountUsd() 5-type 트랜잭션 USD 환산, SpendingLimitRuleSchema instant_max_usd/notify_max_usd/delay_max_usd Zod SSoT, PriceResult 3-state discriminated union(success/oracleDown/notListed), 가격 불명 토큰 NOTIFY 격상 + UNLISTED_TOKEN_TRANSFER 감사 로그, 오라클 장애 시 graceful fallback
- IActionProvider ESM 플러그인 프레임워크 — metadata/actions/resolve 3메서드 인터페이스, ActionProviderRegistry ~/.waiaas/actions/ ESM 플러그인 발견/로드/검증, resolve() → ContractCallRequestSchema Zod 재검증 → 기존 파이프라인 Stage 1~6 실행
- API 키 관리 + Admin UI — api_keys 테이블 DB v11 암호화 저장(HKDF+AES-256-GCM), GET/PUT/DELETE /v1/admin/api-keys CRUD, requiresApiKey=true 비활성화, Admin UI API Keys 섹션 입력/수정/삭제 + 경고 배지
- MCP Tool 자동 변환 + Skill 파일 — registerActionProviderTools action_{provider}_{action} MCP 도구 자동 생성(mcpExpose=true), fire-and-forget 패턴(14개 내장 도구 유지), admin.skill.md v1.5.0(oracle-status + api-keys 4개 엔드포인트), actions.skill.md 신규 생성

**Stats:**

- 68 commits, 149 files changed, +25,633 / -1,933 lines (+7,701 / -131 code)
- 5 phases, 14 plans, 29 requirements, 84 설계 결정
- 1,848 tests (~1,618 → 1,848, +230 new tests)
- ~185,000 LOC total
- 1 day (2026-02-15)

**Git range:** `v1.4.8` → `bbc62c7` (Phase 129 complete)

**What's next:** v1.5.1 x402 클라이언트 지원 또는 v1.6 Desktop + Telegram + Docker

---


## v1.5.2 Admin UI 정책 폼 UX 개선 (Shipped: 2026-02-16)

**Delivered:** Admin UI에서 12개 정책 타입별 구조화된 전용 폼으로 정책을 생성/수정할 수 있고, 목록에서 타입별 의미 있는 시각화를 확인할 수 있으며, 기존 정책 수정 시 현재값이 프리필되어 수정/저장이 가능한 상태 달성

**Phases completed:** 134-135 (4 plans total)

**Key accomplishments:**

- 12개 PolicyType Zod rules 스키마 전체 등록 + DynamicRowList + PolicyFormRouter 폼 인프라
- 12개 PolicyType 전용 폼 컴포넌트 (SpendingLimitForm~X402AllowedDomainsForm)
- PolicyRulesSummary 12-type 목록 시각화 (심볼 배지, req/time, tier bars)
- 수정 모달 전용 폼 프리필/저장 통합

**Stats:**

- 2 phases, 4 plans, 24 requirements, 7 설계 결정
- 2,111 tests, ~188,000 LOC total

**Git range:** `v1.5.1` → `7d19887` (Phase 135 complete)

---


## v1.6 운영 인프라 + 잔액 모니터링 (Shipped: 2026-02-16)

**Delivered:** Kill Switch 3-state 상태 머신(CAS ACID + 6-step cascade + dual-auth 복구), AutoStop 4-규칙 자동 정지 엔진, BalanceMonitorService 잔액 체크 + LOW_BALANCE 알림, Telegram Bot Long Polling(10개 명령어 + 2-Tier 인증 + i18n), Admin UI 통합(Kill Switch 3-state + Telegram Users + AutoStop/Monitoring Settings), Docker 원클릭 배포(Multi-stage + Secrets + non-root)가 동작하는 상태 달성

**Phases completed:** 140-145 (14 plans total)

**Key accomplishments:**

- EventBus 인프라 + Kill Switch 3-state 상태 머신 — EventEmitter 이벤트 버스, CAS ACID 패턴(BEGIN IMMEDIATE + UPDATE WHERE), 6-step cascade(세션 무효화→거래 중단→월렛 정지→API 503→알림→감사 로그), dual-auth 복구(Owner+Master), DB v14 마이그레이션(NORMAL→ACTIVE, ACTIVATED→SUSPENDED, LOCKED 신규)
- AutoStop 4-규칙 자동 정지 엔진 — CONSECUTIVE_FAILURES(5회)/UNUSUAL_ACTIVITY/IDLE_TIMEOUT/MANUAL_TRIGGER, EventBus 구독, config.toml + Admin Settings hot-reload, AUTOSTOP_TRIGGERED i18n 알림
- BalanceMonitorService 잔액 체크 + LOW_BALANCE 알림 — 5분 주기 폴링, SOL 0.01/ETH 0.005 임계값, 24시간 중복 방지 + 회복 감지, monitoring Admin Settings 카테고리
- Telegram Bot Long Polling + 10개 명령어 + 2-Tier 인증 + i18n — /start, /help, /status, /wallets, /pending, /approve, /reject, /killswitch, /newsession, 인라인 키보드, ADMIN/READONLY/PENDING 권한, en/ko, DB v15 마이그레이션
- Admin UI Kill Switch 3-state 관리 + Telegram Users 관리 + AutoStop/Monitoring Settings — 3-state UI 리팩토링, Approve/Delete 액션, fields map 배열 패턴
- Docker 원클릭 배포 — Multi-stage Dockerfile(node:22-slim, non-root UID 1001), docker-compose.yml(named volume, HEALTHCHECK, 127.0.0.1:3100), Docker Secrets _FILE 패턴

**Stats:**

- 6 phases, 14 plans, 49 requirements, 45 설계 결정
- 115 files changed, +16,313 / -260 lines
- ~2,294 tests, ~207,902 LOC total
- 23 commits, 1 day (2026-02-16)

**Git range:** `d666c46` (feat(140-01)) → `23b2b31` (feat(145-02))

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---


## v1.6.1 WalletConnect Owner 승인 (Shipped: 2026-02-16)

**Delivered:** WalletConnect v2 경유 Owner 승인 워크플로우가 동작하는 상태 달성 — QR 페어링으로 외부 지갑(MetaMask/Phantom) 연결, APPROVAL 거래 시 WC 서명 요청 자동 전송, WC 실패 시 Telegram Bot 자동 전환, Admin UI/MCP/SDK/CLI 전체 인터페이스 통합

**Phases completed:** 146-150 (10 plans total)

**Key accomplishments:**

- WalletConnect SignClient 인프라 — DB v16 마이그레이션(wc_sessions/wc_store/approval_channel), SqliteKeyValueStorage IKeyValueStorage 영속 세션, DaemonLifecycle Step 4c-6 fail-soft 초기화, Admin Settings hot-reload
- QR 페어링 + REST API 4개 엔드포인트 — createPairing URI→QR base64 dataURL, CAIP-2 13개 네트워크 매핑, Admin UI QR 모달 3초 폴링, CLI owner connect/disconnect/status 명령
- WcSigningBridge 서명 요청 통합 — stage4Wait fire-and-forget WC 연동, EVM personal_sign + Solana solana_signMessage 서명 검증, approve/reject 자동 반영, WC expiry 동기화
- Telegram Fallback 자동 전환 — WC 세션 없음/타임아웃/에러 시 Telegram Bot 자동 전환, 단일 승인 소스 원칙(isApprovalStillPending), APPROVAL_CHANNEL_SWITCHED 알림 이벤트
- DX 전체 인터페이스 통합 — Admin WC 전용 관리 페이지, MCP 3개 도구(wc_connect/wc_status/wc_disconnect), TS/Python SDK WC 메서드, wallet.skill.md WalletConnect 섹션

**Stats:**

- 5 phases, 10 plans, 24 requirements, 105 files changed, +12,099 LOC (net)
- ~2,510 tests (~2,294 → ~2,510, +87 WC tests)
- Git range: feat(146-01) → 623d9dc
- Timeline: 2026-02-16 (~3 hours)

---


## v1.7 품질 강화 + CI/CD (Shipped: 2026-02-17)

**Delivered:** 설계 문서(46-51, 64) 기반 ~999건 신규 테스트와 GitHub Actions 4-stage CI/CD 파이프라인으로 보안 ~249건 시나리오, 확장 기능 154건, 플랫폼 84건, Contract Test 7개 인터페이스, 블록체인 3단계, Enum SSoT 빌드타임 검증을 달성하고 push→PR→nightly→release 지속적 품질 게이트를 확보한 상태

**Phases completed:** 151-159 (19 plans total)

**Key accomplishments:**

- 테스트 인프라 구축 — Vitest v8 커버리지(패키지별 Hard 임계값) + Turborepo 5개 태스크 분리(unit/integration/security/chain/platform) + Mock 10개 경계(M1-M10, msw 2.x/MockPriceOracle/MockActionProvider)
- Enum SSoT 빌드타임 검증 — 16개 Enum 4단계 방어(as const→TS→Zod→Drizzle→DB CHECK) + config.toml 12건 + NOTE 매핑 22건
- Contract Test 7개 인터페이스 — IChainAdapter(Mock vs Solana vs EVM 22 메서드)/IPolicyEngine/INotificationChannel/IClock/IPriceOracle/IActionProvider Mock-실제 동일성 검증
- 보안 테스트 ~460+ it-blocks — 3계층 보안 71건(세션20/정책9/Kill Switch8/키스토어10/경계값24) + 확장 보안 ~178건(토큰32/컨트랙트28/Approve24/배치22/Oracle20/Action16/Swap12/ChainError12/x402 12)
- 확장 기능 154건 + 플랫폼 84건 — 토큰32/컨트랙트28/Approve24/배치22/Oracle20/Action16/ChainError12 기능 검증 + CLI Daemon32/Docker18/Telegram34 배포 품질 검증
- 4-stage CI/CD 파이프라인 — Composite Action(Node.js 22+pnpm+Turborepo cache) + ci.yml(Stage1 --affected/Stage2 full suite+coverage) + nightly.yml(local-validator+devnet) + release.yml(4-job 품질 게이트+Docker+npm dry-run) + coverage-gate.sh(Soft/Hard)

**Stats:**

- 9 phases, 19 plans, 48 requirements, 66 설계 결정
- 92 files changed, +24,004 LOC
- 3,509 tests (~2,510 → 3,509, +~999 new tests)
- ~237,013 LOC total
- 49 commits, 1 day (2026-02-16 → 2026-02-17)

**Git range:** `46a01da` (Phase 151 start) → `5b7cf57` (Phase 159 complete)

**What's next:** v1.8 업그레이드 + 배포 (/gsd:new-milestone)

---


## v1.8 업그레이드 + 배포 인프라 (Shipped: 2026-02-17)

**Delivered:** 설치된 WAIaaS가 새 버전 출시를 자동 감지하여 사용자에게 알리고, `waiaas upgrade`로 7단계 시퀀스(확인-중지-백업-업데이트-마이그레이션-검증-재시작)로 안전하게 업그레이드할 수 있는 상태 달성. npm/Docker 2개 채널 업그레이드 경로 동작, DB 호환성 매트릭스가 자동 마이그레이션/시작 거부를 판별. release-please 기반 2-게이트 릴리스 모델 구축 완료.

**Phases completed:** 160-164 (12 plans total)

**Key accomplishments:**

- VersionCheckService + Health API 확장 — npm registry 최신 버전 자동 조회(24h 주기, fail-soft), GET /health에 latestVersion/updateAvailable/schemaVersion 필드 추가
- CLI 업그레이드 알림 + upgrade 명령 — stderr 알림 박스(24h dedup, --quiet 억제), waiaas upgrade 7단계 시퀀스(--check/--to/--rollback/--no-start)
- BackupService — DB+WAL/SHM+config.toml 자동 백업/복원, 5개 보존 정책, --rollback으로 직전 백업 복원
- 호환성 매트릭스 + Docker — checkSchemaCompatibility 3-시나리오(migrate/reject-code_too_old/reject-schema_too_old), Dockerfile OCI+Watchtower 라벨, GHCR 3-tier 태깅(latest/semver/major)
- release-please 2-게이트 릴리스 모델 — Conventional Commits → Release PR 자동 생성(게이트 1) → 품질 게이트 → deploy environment: production 수동 승인(게이트 2), CHANGELOG 자동 생성
- SDK/MCP/스킬 파일 동기화 + 19건 E2E 통합 테스트 — HealthResponse 타입 export, 4개 영역 업그레이드 파이프라인 검증

**Stats:**

- 5 phases, 12 plans, 30 requirements, ~87 신규 테스트
- 3,599 tests total, ~124,712 LOC TypeScript
- Git range: feat(160-01) → fix(#053-#057)
- Timeline: 2026-02-17 (1일)

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---


## v2.2 테스트 커버리지 강화 (Shipped: 2026-02-18)

**Delivered:** v1.7에서 설정한 커버리지 Hard 게이트 중 임시 하향된 3개 패키지(adapter-solana branches, admin functions, cli lines/statements)의 임계값을 원래 수준으로 복원하여 전체 패키지의 커버리지 품질을 균일하게 유지하는 상태 달성.

**Phases completed:** 178-181 (4 phases, 6 plans, 12 tasks, 11 requirements)

**Key accomplishments:**

- adapter-solana 브랜치 커버리지 65% → 84.87% 향상 — convertBatchInstruction 4-type dispatch, signExternalTransaction edge case, tx-parser 엣지 케이스, Error instanceof 분기 등 49 신규 테스트
- admin 함수 커버리지 57.95% → 77.87% 향상 — settings/wallets/dashboard/policies/notifications + 0% 그룹(client.ts, toast.tsx, copy-button.tsx, layout.tsx, display-currency.ts, 5 정책 폼) 195 신규 테스트
- CLI 라인/구문 커버리지 68.09% → 91.88% 향상 — owner.ts/wallet.ts/password.ts 37 신규 테스트
- 3개 패키지 vitest 커버리지 임계값 원래 수준 복원 (branches 65→75, functions 55→70, lines/statements 65→70)
- 전체 모노레포 테스트 스위트 ~2,490 테스트 0건 실패 검증 + 이슈 #060~#062 해소

**Stats:**

- 4 phases, 6 plans, 12 tasks, 11 requirements
- 53 files changed, +10,714 lines
- 281 신규 테스트 (49 + 195 + 37), ~142,639 LOC TypeScript
- 30 commits, 1 day (2026-02-18)
- Git range: 330dc92..a8374e9

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---


## v2.3 Admin UI 기능별 메뉴 재구성 (Shipped: 2026-02-18)

**Delivered:** 모놀리식 Settings 페이지를 해체하여 7개 기능별 메뉴(Dashboard/Wallets/Sessions/Policies/Notifications/Security/System)로 재배치하고, Ctrl+K 설정 검색 + 미저장 경고 다이얼로그 + 전 필드 description help text로 Admin UI DX를 개선한 상태 달성.

**Phases completed:** 182-187 (6 phases, 11 plans, 39 requirements)

**Key accomplishments:**

- TabNav/FieldGroup/Breadcrumb/FormField description 공용 UI 컴포넌트 구축 (5개 페이지에서 재사용)
- 사이드바 7-메뉴 재구성 — Settings/WalletConnect 제거, Security(3탭)/System 신규 페이지 생성, 기존 4개 페이지 탭 구조 적용
- 기존 Settings 항목을 Wallets(3탭)/Sessions(1탭)/Policies(1탭)/Notifications(1탭) Settings 탭으로 분산 배치 + 독립적 dirty/save 상태
- Ctrl+K 설정 검색 — 54개 필드 정적 인덱스, 클릭 시 페이지+탭 네비게이션 + 2s 필드 하이라이트 애니메이션
- 미저장 경고 다이얼로그 — 글로벌 dirty guard 레지스트리, 3버튼(저장 후 이동/저장 없이 이동/취소) 탭+사이드바 인터셉트
- 전 필드 description help text 47개 + README 7-메뉴 구조 갱신

**Stats:**

- 6 phases, 11 plans, 39 requirements, 64 files changed, +9,339 LOC (net)
- ~145,784 LOC TypeScript (Admin UI: 19,152 LOC)
- 50 commits, 1 day (2026-02-18)
- Git range: feat(182-01) → docs(187-01)

---


## v2.4 npm Trusted Publishing 전환 (Shipped: 2026-02-19)

**Delivered:** npm 패키지 발행을 Classic Automation Token(NPM_TOKEN)에서 OIDC Trusted Publishing으로 전환하여, 장기 시크릿 없이 GitHub Actions OIDC 인증 + Sigstore provenance 배지를 확보한 supply chain 보안 강화 상태 달성. 병행하여 8건 품질/DX 이슈 수정 완료.

**Phases completed:** 188-190 (3 phases, 4 plans, 12 requirements)

**Key accomplishments:**

- npm Trusted Publishing (OIDC) 전환 — 8개 패키지 장기 시크릿(NPM_TOKEN) 제거, GitHub Actions OIDC 인증으로 전환
- Sigstore provenance 배지 확보 — 8개 패키지 모두 "Built and signed on GitHub Actions" 표시
- v2.3.0-rc E2E 검증 완료 — release-please prerelease versioning으로 RC 릴리스 OIDC 발행 검증
- Deploy summary provenance 메타데이터 추가 — Source/Commit/Workflow/Sigstore 링크 자동 생성
- 8건 이슈 수정 — 마스터 패스워드 검증(#090), NotificationService always-init(#088), npm README 복사(#093), homepage/bugs URL(#092), 스킬 버전 동기화(#085), AI 연결 프롬프트(#087), JWT UI 텍스트(#089), quickset 별칭(#091)
- 이슈 #094-095 등록 — Admin UI 개선 항목 다음 마일스톤으로 이관

**Stats:**

- 3 phases, 4 plans, 7 tasks + 8 quick tasks, 12 requirements
- 66 files changed, +3,740 / -180 lines
- ~146,464 LOC TypeScript
- 40 commits, 1 day (2026-02-19)
- Git range: ee51276..5d80fb6

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---


## v2.4.1 Admin UI 테스트 커버리지 복원 (Shipped: 2026-02-19)

**Delivered:** Admin UI v2.3 메뉴 재구성 후 신규/이동 페이지의 테스트 커버리지를 70% 임계값 이상으로 복원. Security/WalletConnect/System 페이지 + 공용 컴포넌트 5개에 대해 186건의 신규 테스트 추가. vitest 커버리지: 92% lines, 84% branches, 77% functions.

**Phases completed:** 191-193 (3 phases, 5 plans, 22 requirements)

**Key accomplishments:**

- Security 페이지 3-tab (Kill Switch/AutoStop/JWT Rotation) 27 테스트 + WalletConnect 페이지 16 테스트
- System 페이지 6-섹션 34 테스트 (API Keys CRUD/Daemon 설정/Danger Zone)
- 공용 컴포넌트 5개 65 테스트 (EmptyState/dirty-guard/UnsavedDialog/SettingsSearch/PolicyRulesSummary)
- 기존 페이지(sessions/notifications/wallets) 44 추가 테스트 커버리지 개선
- vitest 커버리지 임계값 70% 복원 (실제: 92% lines, 84% branches, 77% functions)

**Stats:**

- 3 phases, 5 plans, 22 requirements, ~186 신규 테스트
- ~151,015 LOC TypeScript

**What's next:** v2.5 DX 품질 개선

---

## v2.5 DX 품질 개선 (Shipped: 2026-02-19)

**Delivered:** README/예시 코드를 복붙하면 바로 동작하는 상태 달성. CLI 첫 실행(버전/엔진/init), 데몬 시작(포트 충돌/로그/URL), quickstart(영문/멱등성/필드), Docker(GHCR 이미지/환경변수), Python SDK(버전/포트), npm 패키지 README 등 첫 5분 경험에서 발견된 28건의 마찰 제거.

**Phases completed:** 194-197 (4 phases, 8 plans, 23 requirements)

**Key accomplishments:**

- CLI --version 동적 버전 (createRequire ESM 패턴) + engines.node >= 22 + init 패스워드 안내/config 템플릿/권한 에러
- 데몬 시작 EADDRINUSE 포트 충돌 감지 + Step 로그 console.debug 하향 + Admin UI URL 한 줄 요약
- quickstart 영문 전환 + 409 멱등성 (기존 지갑 재사용 + 세션 재발급) + 만료 시점 표시 + availableNetworks 필드 수정
- MCP setup 에러 시 "Run waiaas quickstart first" 안내 + 기본 만료(24h) 경고 + --expires-in 옵션 가이드
- README SDK 코드 예시 필드 수정 (balance.balance, tx.id) + skill 파일 14개 버전 자동 치환
- CLI/SDK npm 패키지 README 작성 + docker-compose GHCR 이미지 기본값 + .env.example
- Python SDK 버전 pyproject.toml 동기화 + README/client 포트 3100 수정 + .venv gitignore
- 179건 CLI 테스트 통과 (13건 신규)

**Stats:**

- 4 phases, 8 plans, 23 requirements
- 58 files changed, +3,333 / -192 lines
- 34 commits, 1 day (2026-02-19)
- Git range: 839b22a..c2da7a2

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---


## v2.6 Wallet SDK 설계 (Shipped: 2026-02-20)

**Delivered:** 지갑 개발사(D'CENT 등)가 WAIaaS와 통합하기 위한 Wallet Signing SDK, 개방형 서명 프로토콜, 지갑 앱 알림 채널, Push Relay Server의 공통 설계를 확정. 설계 문서 3개 신규(73/74/75) + 기존 4개(35/37/25/67) 갱신, 교차 검증 5항목 PASS, 설계 부채 0건 유지.

**Phases completed:** 198-201 (4 phases, 7 plans, 15 tasks, 23 requirements)

**Key accomplishments:**

- WAIaaS Signing Protocol v1 설계서 완성 (doc 73, 12개 섹션 1,465줄 — SignRequest/SignResponse Zod 스키마, EIP-191/Ed25519 서명 포맷, 유니버셜 링크, ntfy/Telegram 채널 프로토콜, 5가지 위협 분석 보안 모델, 8개 에러 코드)
- @waiaas/wallet-sdk + 데몬 컴포넌트 설계서 완성 (doc 74, 11개 섹션 ~2,450줄 — SDK 8개 공개 API 시그니처, WalletLinkConfig Zod 스키마, ISigningChannel 공통 인터페이스, ApprovalChannelRouter 5단계 fallback)
- 알림 채널 + Push Relay Server 설계서 완성 (doc 75, 13개 섹션 ~2,500줄 — 서명/알림 토픽 분리, NotificationMessage 6카테고리, IPushProvider 인터페이스, Pushwoosh/FCM, ntfy SSE, Docker 멀티스테이지)
- 기존 설계 문서 4개(35/37/25/67) v2.6 통합 + 교차 검증 5항목 PASS, 설계 부채 0건 유지
- 34개 설계 결정 확정 (프로토콜 11 + SDK 4 + 데몬 7 + 알림 7 + Push Relay 5)

**Stats:**

- 4 phases, 7 plans, 15 tasks, 23 requirements
- 33 commits, 55 files changed, +10,435 / -324 lines
- Timeline: 1 day (2026-02-19 → 2026-02-20)
- Git range: d91a92f → af0999d

**What's next:** 후속 구현 마일스톤 (m26-01 Wallet Signing SDK 구현, m26-02 알림 채널 구현, m26-03 Push Relay Server 구현)

---


## v2.6.1 WAIaaS Wallet Signing SDK (Shipped: 2026-02-20)

**Delivered:** v2.6 설계(docs 73-75)를 코드로 실현하여, @waiaas/wallet-sdk 패키지를 통해 지갑 개발사가 서명 프로토콜을 통합하고, Owner가 ntfy/Telegram 채널을 통해 트랜잭션을 승인/거부할 수 있는 상태 달성. 5단계 우선순위 채널 라우팅 + 데몬 라이프사이클 완전 연결 + Admin Settings 런타임 관리.

**Phases completed:** 202-205 (4 phases, 13 plans, 27 requirements)

**Key accomplishments:**

- Signing Protocol v1 구현 — SignRequest/SignResponse Zod 스키마, base64url 인코딩, DB migration v18 (owner_approval_method), 7개 도메인 에러 코드
- @waiaas/wallet-sdk 신규 npm 패키지 — 6개 공개 함수 (parseSignRequest, buildSignResponse, formatDisplayMessage, sendViaNtfy, sendViaTelegram, subscribeToRequests) + SSE 자동 재연결
- 다중 서명 채널 — NtfySigningChannel (양방향 SSE) + TelegramSigningChannel (인라인 버튼 + /sign_response) + ApprovalChannelRouter 5단계 우선순위 fallback
- 데몬 라이프사이클 연결 — 6개 signing SDK 클래스 daemon.ts 인스턴스화, pipeline PENDING_APPROVAL → 채널 라우팅 fire-and-forget 통합
- Admin Settings + Skills 동기화 — GET/PUT /admin/settings 11개 카테고리 노출, signing_sdk UI 섹션, skill files v2.6.1 버전 동기화

**Stats:**

- 4 phases, 13 plans, 27 requirements, 206 files changed, +16,137/-332 lines
- ~138,051 LOC TypeScript, 4,323 tests (29 new in @waiaas/wallet-sdk)
- 67 commits, 2 days (2026-02-19 → 2026-02-20)
- Git range: milestone/v2.6..milestone/v2.6.1

### Known Gaps

- Phase 202/203 VERIFICATION.md 누락 (절차적 갭, 코드 갭 아님 — 27/27 reqs 구현 완료 + integration 27/27 wired)
- 2 E2E flows need human testing with live infra (ntfy/Telegram SDK signing)

**What's next:** Wallet SDK 설계 고도화 or 추가 서명 채널 (Slack/Discord)

---


## v2.7 지갑 앱 알림 채널 (Shipped: 2026-02-20)

**Delivered:** 지갑 앱(D'CENT 등)이 Telegram 없이 모든 알림 이벤트(26개)를 ntfy 사이드 채널로 수신하고, 카테고리별 필터링과 우선순위 기반 전송으로 긴급도를 구분하는 상태 달성

**Phases completed:** 206 (1 phase, 4 plans, 7 tasks)

**Key accomplishments:**

- NotificationMessageSchema Zod SSoT + EVENT_CATEGORY_MAP (26 events → 6 categories) 정의
- WalletNotificationChannel 사이드 채널 구현 (기존 알림 시스템과 독립 병행, security_alert priority 5)
- subscribeToNotifications/parseNotification SDK 함수 추가 (ntfy SSE + base64url Zod 검증)
- Admin Settings 알림 카테고리 멀티셀렉트 체크박스 UI + wallet.skill.md Section 13 동기화

**Stats:**

- 1 phase, 4 plans, 16 requirements, 34 files changed, +3,722/-91 lines
- ~161,634 LOC TypeScript, 2,637+ tests
- Git range: feat(206-01) → feat(206-04)

---

