# Project Milestones: WAIaaS

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

