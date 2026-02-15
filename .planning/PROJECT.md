# WAIaaS: AI 에이전트를 위한 Wallet-as-a-Service

## 이것이 무엇인가

중앙 서버 없이 사용자가 직접 설치하여 운영하는 AI 에이전트 지갑 시스템. 체인 무관(Chain-Agnostic) 3계층 보안 모델(세션 인증 → 시간 지연 → 모니터링)로 에이전트 해킹이나 키 유출 시에도 피해를 최소화한다. CLI Daemon / Desktop App / Docker로 배포하며, REST API, TypeScript/Python SDK, MCP 통합을 통해 모든 에이전트 프레임워크에서 사용 가능하다. 멀티체인 환경 모델(1 월렛 = 1 체인 + 1 환경)로 하나의 EVM 월렛이 5개 네트워크에서 동작하며, ALLOWED_NETWORKS 정책으로 네트워크를 제한할 수 있다.

## 핵심 가치

**AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다** — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서. 서비스 제공자 의존 없이 사용자가 완전한 통제권을 보유한다.

## Current State

v1.4.8 Admin DX + 알림 개선 shipped (2026-02-15). 9-패키지 모노레포 + Python SDK, ~178,176 LOC, ~1,618 테스트 통과. CLI로 init → start → quickstart --mode testnet/mainnet → 세션 생성 → 정책 설정 → SOL/SPL/ETH/ERC-20 전송(네트워크 선택) → 컨트랙트 호출 → Approve → 배치 → 외부 dApp unsigned tx 서명(sign-only) → Owner 승인/거절(SIWS/SIWE) + SDK/MCP로 프로그래밍 접근(network 파라미터, signTransaction/encodeCalldata, **set_default_network, wallet info, network=all 잔액**) + Telegram/Discord/ntfy/**Slack** 알림(실제 트리거 연결, POLICY_VIOLATION enrichment, **메시지 저장/조회**) + Admin Web UI(`/admin`) 관리(환경 모델 + ALLOWED_NETWORKS 정책 + 기본 거부 토글 3개 + 설정 관리 + 알림 패널(**채널별 테스트 + Slack**) + MCP 토큰 발급 + **대시보드 확장 + 월렛 잔액/트랜잭션 + 세션 전체 조회**) + 다중 지갑 MCP 설정(**14 도구** + 스킬 리소스) + 토큰 레지스트리 관리 + API 스킬 파일(skills/) 제공까지 동작.

**구현 로드맵:**
- ✅ v1.1 코어 인프라 + 기본 전송 — shipped 2026-02-10
- ✅ v1.2 인증 + 정책 엔진 — shipped 2026-02-10
- ✅ v1.3 SDK + MCP + 알림 — shipped 2026-02-11
- ✅ v1.3.1 Admin Web UI 설계 — shipped 2026-02-11
- ✅ v1.3.2 Admin Web UI 구현 — shipped 2026-02-11
- ✅ v1.3.3 MCP 다중 에이전트 지원 — shipped 2026-02-11
- ✅ v1.3.4 알림 이벤트 트리거 연결 + 어드민 알림 패널 — shipped 2026-02-12
- ✅ v1.4 토큰 + 컨트랙트 확장 — shipped 2026-02-12 (1,126 tests, 51,750 LOC)
- ✅ v1.4.1 EVM 지갑 인프라 + REST API 5-type 통합 + Owner Auth SIWE — shipped 2026-02-12 (1,313 tests, 65,074 LOC)
- ✅ v1.4.2 용어 변경 (agent → wallet) — shipped 2026-02-13 (1,326 tests, 56,808 LOC)
- ✅ v1.4.3 EVM 토큰 레지스트리 + MCP/Admin DX + 버그 수정 — shipped 2026-02-13 (1,357 tests, 59,993 LOC)
- ✅ v1.4.4 Admin Settings + MCP 5-type + Skill Files — shipped 2026-02-14 (1,467 tests, 62,296 LOC)
- ✅ v1.4.5 멀티체인 월렛 모델 설계 — shipped 2026-02-14 (설계 문서 5개, 설계 결정 31개)
- ✅ v1.4.6 멀티체인 월렛 구현 — shipped 2026-02-14 (1,580 tests, ~73,000 LOC)
- ✅ v1.4.7 임의 트랜잭션 서명 API — shipped 2026-02-15 (1,636 tests, ~175,480 LOC)
- ✅ v1.4.8 Admin DX + 알림 개선 — shipped 2026-02-15 (~1,618 tests, ~178,176 LOC)
- v1.5 DeFi + 가격 오라클 (IPriceOracle, Action Provider, Jupiter Swap, USD 정책)
- v1.5.1 x402 클라이언트 지원 (x402 자동 결제, X402_ALLOWED_DOMAINS 정책, 결제 서명 생성)
- v1.6 Desktop + Telegram + Docker (Tauri 8화면, Bot, Kill Switch, Docker)
- v1.7 품질 강화 + CI/CD (300+ 테스트, 보안 237건, 4-stage 파이프라인)
- v2.0 전 기능 완성 릴리스 (npm 8패키지, Docker, Desktop 5플랫폼, GitHub Release)

**코드베이스 현황:**
- 9-패키지 모노레포: @waiaas/core, @waiaas/daemon, @waiaas/adapter-solana, @waiaas/adapter-evm, @waiaas/cli, @waiaas/sdk, @waiaas/mcp, @waiaas/admin + waiaas (Python)
- ~178,176 LOC (TypeScript/TSX + Python + CSS, ESM-only, Node.js 22)
- ~1,618 테스트 (core + adapter-solana + adapter-evm + daemon + CLI + SDK + MCP + admin)
- pnpm workspace + Turborepo, Vitest, ESLint flat config, Prettier
- OpenAPIHono 46 엔드포인트 (44 + POST /transactions/sign + POST /utils/encode-calldata), GET /doc OpenAPI 3.0 자동 생성
- 5개 API 스킬 파일 (skills/ 디렉토리) — AI 에이전트 즉시 사용 가능 + MCP 스킬 리소스(waiaas://skills/{name})
- IChainAdapter 22 메서드 (parseTransaction/signExternalTransaction 추가), discriminatedUnion 5-type 파이프라인, 11 PolicyType
- AdapterPool 멀티체인 (Solana + EVM), secp256k1 멀티커브 키스토어, Owner Auth SIWE/SIWS
- EnvironmentType SSoT (testnet/mainnet) + 환경-네트워크 매핑 + resolveNetwork() 파이프라인
- TokenRegistryService: 5 EVM 메인넷 24개 내장 토큰 + 커스텀 토큰 CRUD
- MCP 14개 도구 (+ set_default_network) + 5개 스킬 리소스
- 기본 거부 정책 토글 3개 (default_deny_tokens/contracts/spenders)
- 알림 4채널 (Telegram/Discord/ntfy/Slack) + 메시지 저장/조회 + DB v10
- pushSchema 3-step 순서 (tables→migrations→indexes) + 마이그레이션 체인 테스트
- MCP graceful shutdown (stdin 감지 + force-exit 타임아웃)
- 설계 문서 36개 (24-72), 8 objective 문서

## 요구사항

### 검증됨

- ✓ AI 에이전트 vs 사람 사용자: WaaS 설계 차이점 분석 — v0.1 (CUST-02)
- ✓ 에이전트 지갑 생성/사용 방식 설계 — v0.1 (ARCH-01, ARCH-02)
- ✓ 커스터디 모델 비교 연구 — v0.1 (CUST-01, CUST-03, CUST-04)
- ✓ 주인-에이전트 관계 모델 설계 — v0.1 (REL-01~05)
- ✓ Solana 생태계 기술 스택 조사 — v0.1 (TECH-01, TECH-02, TECH-03)
- ✓ 활용 가능한 오픈소스 및 기존 솔루션 조사 — v0.1 (CUST-03)
- ✓ 에이전트 프레임워크 통합 방안 조사 — v0.1 (API-05, API-06)
- ✓ 세션 기반 인증 시스템 설계 (JWT HS256, SIWS/SIWE, 세션 제약) — v0.2 (SESS-01~05)
- ✓ 시간 지연 + 승인 정책 엔진 설계 (4-tier, DatabasePolicyEngine) — v0.2 (LOCK-01~04)
- ✓ 실시간 알림 + 긴급 정지 설계 (멀티 채널, Kill Switch, AutoStop) — v0.2 (NOTI-01~05)
- ✓ Owner 지갑 연결 설계 (WalletConnect v2, ownerAuth) — v0.2 (OWNR-01~03)
- ✓ 체인 추상화 계층 설계 (IChainAdapter, SolanaAdapter, EvmStub) — v0.2 (CHAIN-01~03)
- ✓ 코어 지갑 서비스 설계 (AES-256-GCM 키스토어, sodium guarded memory) — v0.2 (KEYS-01~04)
- ✓ REST API 서버 설계 (Hono, 31 엔드포인트, OpenAPI 3.0) — v0.2 (API-01~06)
- ✓ CLI Daemon 설계 (init/start/stop/status, 데몬 라이프사이클) — v0.2 (CLI-01~04)
- ✓ TypeScript SDK + Python SDK 인터페이스 설계 — v0.2 (SDK-01~02)
- ✓ MCP Server 설계 (6 도구, 3 리소스, stdio) — v0.2 (MCP-01~02)
- ✓ Desktop App 아키텍처 설계 (Tauri 2, Sidecar, 8 화면) — v0.2 (DESK-01~04)
- ✓ Docker 배포 스펙 설계 (compose, named volume) — v0.2 (DOCK-01)
- ✓ Telegram Bot 설계 (2-Tier 인증, 인라인 키보드) — v0.2 (TGBOT-01~02)
- ✓ 로컬 스토리지 설계 (SQLite 7-table, Drizzle ORM) — v0.2 (CORE-02)
- ✓ v0.1→v0.2 변경 매핑 및 SUPERSEDED 표기 — v0.3 (LEGACY-01~09)
- ✓ CRITICAL 의사결정 확정 (포트, Enum, Docker, 자금충전) — v0.3 (CRIT-01~04)
- ✓ Enum/상태값 통합 대응표 + config.toml 보완 — v0.3 (ENUM-01~04, CONF-01~05)
- ✓ REST API↔API Framework 스펙 통일 — v0.3 (API-01~06)
- ✓ 11개 구현 노트 추가 — v0.3 (NOTE-01~11)
- ✓ 테스트 레벨/모듈 매트릭스/커버리지 목표 정의 — v0.4 (TLVL-01~03, MOCK-01~04)
- ✓ 보안 공격 시나리오 71건 정의 (3계층 + 키스토어 + 경계값 + E2E 체인) — v0.4 (SEC-01~05)
- ✓ 블록체인 3단계 테스트 환경 + Enum SSoT 빌드타임 검증 — v0.4 (CHAIN-01~04, ENUM-01~03)
- ✓ CI/CD 4단계 파이프라인 + 커버리지 게이트 설계 — v0.4 (CICD-01~03)
- ✓ 배포 타겟별 테스트 118건 시나리오 — v0.4 (PLAT-01~04)
- ✓ masterAuth/ownerAuth/sessionAuth 3-tier 인증 책임 분리 — v0.5 (AUTH-01~05)
- ✓ Owner 주소 에이전트별 귀속 + WalletConnect 선택적 전환 — v0.5 (OWNR-01~06)
- ✓ 세션 낙관적 갱신 프로토콜 (PUT /renew, 5종 안전 장치) — v0.5 (SESS-01~05)
- ✓ CLI DX 개선 (init 간소화, --quickstart, --dev, hint, MCP 검토, 원격 접근) — v0.5 (DX-01~08)
- ✓ 기존 설계 문서 11개 v0.5 통합 반영 — v0.5 (Phase 21)
- ✓ SPL/ERC-20 토큰 전송 확장 + ALLOWED_TOKENS 정책 + getAssets() 복원 — v0.6 (TOKEN-01~05)
- ✓ ContractCallRequest + CONTRACT_WHITELIST 기본 거부 정책 — v0.6 (CONTRACT-01~05)
- ✓ ApproveRequest 독립 정책 카테고리 + 무제한 approve 차단 — v0.6 (APPROVE-01~03)
- ✓ BatchRequest Solana 원자적 배치 + 2단계 합산 정책 — v0.6 (BATCH-01~03)
- ✓ IPriceOracle + USD 기준 정책 평가 전환 — v0.6 (ORACLE-01~04)
- ✓ IActionProvider resolve-then-execute + MCP 자동 변환 + Jupiter Swap — v0.6 (ACTION-01~05)
- ✓ 확장 기능 테스트 전략 166건 + 기존 문서 8개 v0.6 통합 — v0.6 (TEST-01~03, INTEG-01~02)
- ✓ 구현 장애 요소 25건 해소 (CRITICAL 7 + HIGH 10 + MEDIUM 8) — v0.7 (CHAIN-01~04, DAEMON-01~06, DEPS-01~02, API-01~07, SCHEMA-01~06)
- ✓ Owner 선택적 등록 스펙 (3-State 상태 머신, 6전이, 유예/잠금 구간, 보안 공격 방어 4건) — v0.8 (OWNER-01~08)
- ✓ 점진적 보안 해금 모델 (APPROVAL→DELAY 다운그레이드, TX_DOWNGRADED_DELAY 이벤트, 3채널 알림) — v0.8 (POLICY-01~03, NOTIF-01~02)
- ✓ 자금 회수 프로토콜 (withdraw API 38번째 엔드포인트, sweepAll 20번째 메서드, HTTP 207 부분 실패) — v0.8 (WITHDRAW-01~08)
- ✓ Kill Switch/세션 보안 Owner 유무 분기 (복구 24h vs 30min, 세션 갱신 [거부하기]) — v0.8 (SECURITY-01~04, NOTIF-03)
- ✓ DX 변경 스펙 (set-owner/remove-owner/withdraw CLI 3개, --quickstart 간소화, agent info 안내) — v0.8 (DX-01~05)
- ✓ 14개 설계 문서 v0.8 통합 + 18x3 Owner 상태 분기 매트릭스 SSoT — v0.8 (INTEG-01~02)
- ✓ SessionManager 핵심 설계 (인터페이스, 토큰 로드, 자동 갱신, 실패 처리, lazy 401 reload) — v0.9 (SMGR-01~07)
- ✓ MCP tool handler 통합 설계 (ApiClient, 동시성, 프로세스 생명주기, Claude Desktop 에러 처리) — v0.9 (SMGI-01~04)
- ✓ CLI mcp setup/refresh-token + Telegram /newsession 연동 설계 — v0.9 (CLIP-01~02, TGSN-01~02)
- ✓ SESSION_EXPIRING_SOON 알림 이벤트 + 만료 임박 판단 로직 설계 — v0.9 (NOTI-01~02)
- ✓ 18개 테스트 시나리오 명시 + 7개 설계 문서 v0.9 통합(85 [v0.9] 태그) — v0.9 (TEST-01~02, INTEG-01~02)
- ✓ PolicyRuleSchema ↔ 25-sqlite 교차 참조 + APPROVAL 타임아웃 3단계 우선순위 — v0.10 (PLCY-01, PLCY-03)
- ✓ Owner GRACE→LOCKED 상태 전이 + 다운그레이드 우선순위 양방향 확정 — v0.10 (PLCY-02)
- ✓ 66개 에러 코드 통합 매트릭스 + PolicyType 10개 확장 + superRefin 검증 — v0.10 (ERRH-01, ERRH-03)
- ✓ ChainError 3-카테고리(PERMANENT/TRANSIENT/STALE) 분류 + 복구 전략 — v0.10 (ERRH-02)
- ✓ Stage 5 완전 의사코드 + 티어별 타임아웃 — v0.10 (CONC-01)
- ✓ 세션 갱신 낙관적 잠금(token_hash CAS) + RENEWAL_CONFLICT(409) — v0.10 (CONC-02)
- ✓ Kill Switch 4전이 CAS ACID 패턴 — v0.10 (CONC-03)
- ✓ 데몬 6단계 시작 타임아웃 + fail-fast/soft — v0.10 (OPER-01)
- ✓ Batch 부모-자식 2계층 DB + PARTIAL_FAILURE — v0.10 (OPER-02)
- ✓ Price Oracle 교차 검증 인라인 + 가격 나이 3단계 stale 정책 — v0.10 (OPER-03)

- ✓ v1.1~v2.0 마일스톤별 objective 문서 8개 생성 — v1.0
- ✓ 설계 부채 추적 체계 초기화 (objectives/design-debt.md) — v1.0
- ✓ 설계 문서 37개 → 구현 마일스톤 매핑 확정 + 양방향 교차 검증 — v1.0

- ✓ 모노레포 인프라 구축 (pnpm workspace + Turborepo, 4 패키지, ESM-only) — v1.1 (MONO-01~03)
- ✓ @waiaas/core 패키지 (12 Enum SSoT, 5 Zod 스키마, 66 에러 코드, 4 인터페이스, i18n en/ko) — v1.1 (CORE-01~05)
- ✓ SQLite 7-table Drizzle ORM + CHECK 제약 + UUID v7 + WAL 모드 — v1.1 (DB-01~03)
- ✓ AES-256-GCM 키스토어 + Argon2id KDF + sodium guarded memory — v1.1 (KEY-01~03)
- ✓ config.toml 로더 (smol-toml + Zod 17키 검증 + 환경변수 오버라이드) — v1.1 (CFG-01~02)
- ✓ 데몬 라이프사이클 (6단계 시작/10-step 종료/flock 잠금/PID/BackgroundWorkers) — v1.1 (LIFE-01~04)
- ✓ Hono API 서버 (5 미들웨어 + errorHandler + 6 엔드포인트) — v1.1 (API-01~08)
- ✓ SolanaAdapter 10개 IChainAdapter 메서드 (@solana/kit 6.x) — v1.1 (SOL-01~06)
- ✓ 6-stage 트랜잭션 파이프라인 (DefaultPolicyEngine INSTANT, async fire-and-forget) — v1.1 (PIPE-01~04)
- ✓ CLI 4개 명령어 (init/start/stop/status, commander 13.x) — v1.1 (CLI-01~04)
- ✓ E2E 통합 검증 12건 (MockChainAdapter, 281 total tests) — v1.1 (E2E-01~04)

- ✓ sessionAuth JWT HS256 미들웨어 + dual-key rotation + DB session lookup — v1.2 (AUTH-01, SESS-06)
- ✓ masterAuth Argon2id 미들웨어 + ownerAuth Ed25519 서명 검증 미들웨어 — v1.2 (AUTH-02~05)
- ✓ 세션 CRUD API (create/list/revoke) + masterAuth 보호 — v1.2 (SESS-01~03)
- ✓ 세션 낙관적 갱신 + 5종 안전 장치 (maxRenewals, absoluteExpiresAt, 50% TTL, CAS, revocation) — v1.2 (SESS-04~05)
- ✓ DatabasePolicyEngine 4-tier 분류 (SPENDING_LIMIT BigInt + WHITELIST) + 정책 CRUD API — v1.2 (PLCY-01~04)
- ✓ TOCTOU 방지 (BEGIN IMMEDIATE + reserved_amount) — v1.2 (PLCY-05)
- ✓ DelayQueue 쿨다운 자동 실행 + 취소 — v1.2 (FLOW-01, FLOW-06)
- ✓ ApprovalWorkflow Owner 승인/거절 + 3단계 타임아웃 만료 — v1.2 (FLOW-02~05)
- ✓ Owner 3-State 상태 머신 (resolveOwnerState 순수 함수, NONE/GRACE/LOCKED) — v1.2 (OWNR-01~05)
- ✓ APPROVAL→DELAY 자동 다운그레이드 (TX_DOWNGRADED_DELAY 이벤트) — v1.2 (OWNR-06)
- ✓ 파이프라인 Stage 2(Auth) + Stage 3(Policy) + Stage 4(Wait) 실제 구현 — v1.2 (PIPE-01~04)
- ✓ 인증/정책/세션/워크플로우/Owner 통합 테스트 457건 — v1.2 (TEST-01~05)

- ✓ OpenAPIHono 전면 전환 — 33 엔드포인트 createRoute() + GET /doc OpenAPI 3.0 자동 생성 + 68개 에러 코드 매핑 — v1.3 (OAPI-01~04)
- ✓ IChainAdapter getAssets() + SolanaAdapter 구현 — v1.3 (CHAIN-01~02)
- ✓ REST API 15개 추가 (누적 33개) — assets, transactions, agents CRUD, admin 6종, error hint 32개 — v1.3 (API-01~15)
- ✓ 3채널 알림 시스템 — Telegram/Discord/ntfy, NotificationService 우선순위 폴백, 21 이벤트 en/ko 템플릿 — v1.3 (NOTIF-01~08)
- ✓ TypeScript SDK (@waiaas/sdk) — WAIaaSClient 9 메서드 + WAIaaSOwnerClient 4 메서드, 0 외부 의존성 — v1.3 (TSDK-01~08)
- ✓ Python SDK (waiaas) — async httpx + Pydantic v2, 동일 인터페이스 — v1.3 (PYDK-01~06)
- ✓ MCP Server (@waiaas/mcp) — 6 도구 + 3 리소스, SessionManager 자동 갱신, CLI mcp setup — v1.3 (MCP-01~06)

- ✓ Admin Web UI 전체 설계 문서 67(10개 섹션) — Preact 10.x + Vite 6.x + CSS Variables — v1.3.1 (PAGE-01~05, AUTH-01~02, INFRA-01~04, APIC-01~03, COMP-01~03, SEC-01)
- ✓ 5개 페이지 화면 설계 (Dashboard/Agents/Sessions/Policies/Settings) — 와이어프레임, 컴포넌트 계층, API 매핑, 상호작용 흐름 — v1.3.1
- ✓ masterAuth 로그인 흐름 + @preact/signals Auth Store + 15분 비활성 타임아웃 + 4종 로그아웃 — v1.3.1
- ✓ Hono serveStatic SPA 서빙 + CSP(default-src 'none') + 캐시 정책 + admin_ui 토글 — v1.3.1
- ✓ 8개 공통 컴포넌트 인터페이스 + CSS Variables 디자인 토큰 + 폼 유효성 검증 전략 — v1.3.1
- ✓ fetch 래퍼 + 68개 에러 코드 전체 매핑 + 로딩/빈/에러/셧다운 UX 패턴 — v1.3.1

- ✓ @waiaas/admin Preact + Vite 패키지 스캐폴드 + 빌드 파이프라인 + CSP + Kill Switch bypass — v1.3.2 (INFRA-01~07)
- ✓ masterAuth 로그인 + Auth Store + 비활성 타임아웃 + API Client fetch 래퍼 + 70 에러 코드 매핑 — v1.3.2 (AUTH-01~03, COMP-01~03)
- ✓ Dashboard/Agents/Sessions/Policies/Settings 5개 페이지 구현 + 4-tier SPENDING_LIMIT 시각화 — v1.3.2 (PAGE-01~05)
- ✓ Admin UI 통합 테스트 27건 (인증 4 + 유틸 6 + 페이지 14 + 보안/서빙 4) — v1.3.2 (TEST-01~03)

- ✓ 에이전트별 토큰 경로 분리 (mcp-tokens/<agentId>) + 기존 mcp-token fallback + 토큰 갱신 경로 격리 — v1.3.3 (TOKEN-01~04)
- ✓ MCP 서버 에이전트 식별 — waiaas-{agentName} 동적 이름 + 도구/리소스 description prefix + 하위 호환 — v1.3.3 (MCPS-01~03)
- ✓ CLI mcp setup 다중 에이전트 — --agent 개별 + --all 일괄 설정 + waiaas-{slug} config 키 + slug 충돌 해소 + 자동 감지 새 경로 — v1.3.3 (CLIP-01~07)

- ✓ 파이프라인 8개 이벤트 알림 트리거 연결 — TX_REQUESTED/TX_SUBMITTED/TX_CONFIRMED/TX_FAILED/POLICY_VIOLATION/SESSION_CREATED/SESSION_EXPIRED/OWNER_SET fire-and-forget — v1.3.4 (TRIG-01~08)
- ✓ notification_logs 테이블 증분 마이그레이션 + 발송 성공/실패 로깅 — schema_version 기반, MIG-01 준수 — v1.3.4 (LOG-01~03)
- ✓ 어드민 알림 API 3개 엔드포인트 — GET status(credential 마스킹)/POST test/GET log(페이지네이션) — v1.3.4 (API-01~03)
- ✓ 어드민 알림 패널 UI — 채널 상태 카드, 테스트 발송, 발송 로그, config.toml 안내 — v1.3.4 (UI-01~04)

- ✓ SPL/ERC-20 토큰 전송 + ALLOWED_TOKENS 기본 거부 정책 — v1.4 (TOKEN-01~06)
- ✓ 컨트랙트 호출 + CONTRACT_WHITELIST/METHOD_WHITELIST 기본 거부 — v1.4 (CONTRACT-01~04)
- ✓ Approve 관리 + APPROVED_SPENDERS/무제한 차단/TIER_OVERRIDE — v1.4 (APPROVE-01~04)
- ✓ Solana 원자적 배치 + 2단계 합산 정책 + EVM BATCH_NOT_SUPPORTED — v1.4 (BATCH-01~04)
- ✓ @waiaas/adapter-evm (viem 2.x, 20메서드, EIP-1559, gas 1.2x, nonce) — v1.4 (EVM-01~06)
- ✓ ChainError 3-카테고리 + DB 마이그레이션 러너 + discriminatedUnion 5-type — v1.4 (INFRA-01~05)
- ✓ Stage 5 CONC-01 재시도 + buildByType 5-type 라우팅 + 6개 PolicyType superRefine — v1.4 (PIPE-01~06)

- ✓ NetworkType 13값 확장 + EVM_CHAIN_MAP 10 네트워크 + DaemonConfig EVM RPC 16키 + validateChainNetwork — v1.4.1 (CONF-01~06)
- ✓ secp256k1 멀티커브 키스토어 + EIP-55 주소 파생 + curve/network 필드 + AES-256-GCM — v1.4.1 (KEYS-01~04)
- ✓ AdapterPool lazy init + 캐싱 + agent.chain 기반 어댑터 자동 선택 + 데몬 라이프사이클 전환 — v1.4.1 (POOL-01~04)
- ✓ managesOwnTransaction + schema_version 2 마이그레이션 + agents CHECK EVM 확장 — v1.4.1 (MIGR-01~03)
- ✓ REST API 5-type 통합 + route schema separation 방안 C + oneOf 6-variant OpenAPI — v1.4.1 (API-01~04)
- ✓ MCP send_token type/token + TS/Python SDK 5-type 확장 + CONTRACT_CALL/APPROVE/BATCH 보안 차단 — v1.4.1 (MCPSDK-01~04)
- ✓ verifySIWE(EIP-4361) + owner-auth chain 분기 + setOwner 주소 형식 검증 + Solana 회귀 없음 — v1.4.1 (SIWE-01~04)

- ✓ DB schema_version 3 마이그레이션 (agents→wallets, FK 5개, 인덱스 10개, enum 데이터 5건) — v1.4.2 (DB-01~05)
- ✓ Zod 스키마/Enum/에러 코드/i18n 전체 wallet 용어 rename — v1.4.2 (SCHEMA-01~04, ERR-01~04, I18N-01~03)
- ✓ REST API /v1/wallets 엔드포인트 + JWT wlt claim + OpenAPI 스키마 + Config — v1.4.2 (API-01~05, CONF-01)
- ✓ MCP WalletContext + CLI --wallet + WAIAAS_WALLET_ID + SDK walletId — v1.4.2 (MCP-01~05, SDK-01~02)
- ✓ Admin UI Wallets 페이지 + Dashboard/Sessions/Policies walletId — v1.4.2 (ADMIN-01~04)
- ✓ 설계 문서 15개 + README 갱신 + grep 전수 검사 0건 + 1,326 테스트 통과 — v1.4.2 (DOCS-01~02, VERIFY-01~03)

- ✓ EVM 네트워크별 내장 ERC-20 토큰 레지스트리 (5 네트워크 24 토큰) + 커스텀 토큰 CRUD — v1.4.3 (REGISTRY-01~03)
- ✓ getAssets() ERC-20 잔액 자동 조회 (레지스트리 ∪ ALLOWED_TOKENS 합집합) — v1.4.3 (ASSETS-01~02)
- ✓ POST /v1/mcp/tokens 원스톱 MCP 프로비저닝 API + Admin UI MCP Setup 섹션 — v1.4.3 (MCP-01~03)
- ✓ EVM/Solana waitForConfirmation fallback 패턴 (타임아웃 시 receipt 조회, SUBMITTED→FAILED 오판 방지) — v1.4.3 (PIPE-01~03)
- ✓ tag-release.sh 모노레포 버전 관리 + 9 패키지 1.4.3 적용 — v1.4.3 (DX-01~02)

- ✓ Admin UI 설정 관리 — 알림/RPC/보안 파라미터 DB 저장 + hot-reload, 5개 카테고리 섹션 — v1.4.4
- ✓ WalletConnect 설정 — project_id Admin UI 입력 + DB 저장 — v1.4.4
- ✓ MCP 5-type feature parity — call_contract/approve_token/send_batch MCP 도구 추가, BUG-017 해소 — v1.4.4
- ✓ API 스킬 파일 — quickstart/wallet/transactions/policies/admin 5개 마크다운 — v1.4.4
- ✓ Settings DB 인프라 — AES-GCM 암호화, fallback 체인, config.toml 자동 import — v1.4.4
- ✓ HotReloadOrchestrator — 알림 채널 재생성, RPC 어댑터 evict, 보안 즉시 반영 — v1.4.4

- ✓ 멀티체인 월렛 환경 모델 설계 (EnvironmentType SSoT, 환경-네트워크 매핑 4함수, 설계 결정 8개) — v1.4.5
- ✓ DB 마이그레이션 전략 설계 (v6a transactions.network ADD COLUMN + v6b wallets 12-step 재생성) — v1.4.5
- ✓ 트랜잭션 레벨 네트워크 지정 설계 (NetworkResolver 순수 함수, PipelineContext 확장, Stage 1~6 흐름도) — v1.4.5
- ✓ ALLOWED_NETWORKS 정책 + 네트워크 스코프 정책 설계 (11번째 PolicyType, 4단계 override, policies 테이블 v8) — v1.4.5
- ✓ REST API 7개 엔드포인트 network/environment 파라미터 + 3-Layer 하위호환 전략 설계 — v1.4.5
- ✓ MCP 6개 도구 + TS/Python SDK network 파라미터 확장 설계 — v1.4.5
- ✓ Quickstart --mode testnet/mainnet 워크플로우 설계 (Solana+EVM 2월렛 일괄 생성) — v1.4.5

- ✓ DB 마이그레이션 v6a/v6b/v8 (wallets.network→environment, transactions.network, policies.network) — v1.4.6
- ✓ EnvironmentType Zod SSoT + 환경-네트워크 매핑 함수 4개 (getNetworksForEnvironment, getDefaultNetwork, deriveEnvironment, validateNetworkEnvironment) — v1.4.6
- ✓ resolveNetwork() 순수 함수 + ENVIRONMENT_NETWORK_MISMATCH 에러 코드 + PipelineContext 확장 + Stage 1~5 통합 — v1.4.6
- ✓ ALLOWED_NETWORKS 11번째 PolicyType + permissive default + 네트워크 스코프 4단계 override — v1.4.6
- ✓ REST API 7개 엔드포인트 network/environment 파라미터 + PUT /default-network + GET /networks 신규 2개 (44 엔드포인트) — v1.4.6
- ✓ MCP 6개 도구 network 파라미터 + get_wallet_info 신규 도구 (11 도구) + TS/Python SDK network 확장 — v1.4.6
- ✓ Admin UI 환경 모델 전환 + ALLOWED_NETWORKS 정책 UI + 네트워크 관리 UI — v1.4.6
- ✓ CLI quickstart --mode testnet/mainnet 원스톱 Solana+EVM 2월렛 생성 — v1.4.6
- ✓ Skill 파일 4개 동기화 (quickstart, wallet, transactions, policies) — v1.4.6

- ✓ Sign-only 파이프라인 — POST /v1/transactions/sign (unsigned tx 파싱 → 기존 정책 평가 → 동기 서명 반환), DELAY/APPROVAL 즉시 거부, reserved_amount SIGNED 이중 지출 방지 — v1.4.7 (SIGN-01~15)
- ✓ Solana/EVM unsigned tx 파서 — IChainAdapter parseTransaction/signExternalTransaction 22메서드, ParsedOperationType 5종, DB 마이그레이션 v9 — v1.4.7 (SIGN-02~05,09,14)
- ✓ EVM calldata 인코딩 유틸리티 — POST /v1/utils/encode-calldata, TS/Python SDK encodeCalldata, MCP encode_calldata 도구 — v1.4.7 (ENCODE-01~05)
- ✓ 기본 거부 정책 3개 토글 — default_deny_tokens/contracts/spenders ON/OFF, SettingsService DI, hot-reload — v1.4.7 (TOGGLE-01~05)
- ✓ MCP 스킬 리소스 — waiaas://skills/{name} ResourceTemplate 5개, SKILL_NOT_FOUND 에러 — v1.4.7 (MCPRES-01~03)
- ✓ POLICY_VIOLATION 알림 보강 — policyType/contractAddress/tokenAddress/adminLink vars enrichment — v1.4.7 (NOTIF-01~02)

- ✓ pushSchema 3-step 순서 수정 (tables→migrations→indexes) + 마이그레이션 체인 테스트 23개 — v1.4.8 (MIGR-01~03)
- ✓ MCP graceful shutdown + stdin 종료 감지 + 3초 force-exit — v1.4.8 (MCPS-01~03)
- ✓ MCP set_default_network 도구 + CLI wallet 서브커맨드 + TS/Python SDK 메서드 — v1.4.8 (MCDX-01~03)
- ✓ network=all 잔액/자산 집계 + Promise.allSettled 부분 실패 + MCP/SDK 지원 — v1.4.8 (MCDX-04~07)
- ✓ Admin 대시보드 확장 (StatCard 링크, 추가 카드, 최근 활동) + 월렛 잔액/트랜잭션 + 세션 전체 조회 — v1.4.8 (ADUI-01~07)
- ✓ 알림 테스트 SYSTEM_LOCKED 수정 + 채널별 테스트 + 메시지 저장 + Slack Webhook — v1.4.8 (NOTF-01~06)
- ✓ wallet.skill.md + admin.skill.md 인터페이스 동기화 — v1.4.8 (SKIL-01~02)

### 활성

## Next Milestone Goals

- v1.5 DeFi + 가격 오라클 — IPriceOracle, Action Provider, Jupiter Swap, USD 정책
- v1.5.1 x402 클라이언트 지원 — x402 자동 결제, X402_ALLOWED_DOMAINS 정책, 결제 서명 생성
- v1.6 Desktop + Telegram + Docker — Tauri 8화면, Bot, Kill Switch, Docker

### 범위 외

- SaaS 버전 (클라우드 호스팅) — Self-Hosted 우선, 클라우드는 추후 확장
- 온체인 스마트 컨트랙트 정책 (Squads 등) — 체인 무관 로컬 정책 엔진 우선
- 모바일 앱 — Desktop/CLI 우선
- ML 기반 이상 탐지 — 규칙 기반으로 시작
- 가격/비즈니스 모델 — 기술 구현 완료 후 별도 검토
- 하드웨어 지갑 직접 연결 (Ledger/D'CENT) — WalletConnect 간접 연결
- 크로스체인 브릿지 — 별도 마일스톤으로 분리
- NFT 민팅/마켓플레이스 통합 — Action Provider로 향후 추가 가능
- Account Abstraction / Smart Wallet — EVM 배치 문제 해결, 별도 마일스톤
- Liquid Staking 상세 설계 — Swap Action 패턴 검증 후

## 컨텍스트

**누적:** 28 milestones (v0.1-v1.4.8), 124 phases, 265 plans, 739 requirements, 36 설계 문서(24-72), 8 objective 문서, ~178,176 LOC, ~1,618 테스트

v0.1~v0.10 설계 완료 (2026-02-05~09). 44 페이즈, 110 플랜, 286 요구사항, 30 설계 문서(24-64).
v1.0 구현 계획 수립 완료 (2026-02-09). 8개 objective 문서, 설계 부채 추적, 문서 매핑 검증.
v1.1 코어 인프라 + 기본 전송 shipped (2026-02-10). 4 페이즈, 12 플랜, 46 요구사항, 10,925 LOC, 281 테스트.
v1.2 인증 + 정책 엔진 shipped (2026-02-10). 6 페이즈, 13 플랜, 35 요구사항, 25,526 LOC, 457 테스트.
v1.3 SDK + MCP + 알림 shipped (2026-02-11). 6 페이즈, 11 플랜, 49 요구사항, 33,929 LOC, 784 테스트.
v1.3.1 Admin Web UI 설계 shipped (2026-02-11). 2 페이즈, 2 플랜, 18 요구사항, 설계 문서 67(10섹션).
v1.3.2 Admin Web UI 구현 shipped (2026-02-11). 5 페이즈, 10 플랜, 22 요구사항, 45,332 LOC, 816 테스트.
v1.3.3 MCP 다중 에이전트 지원 shipped (2026-02-11). 2 페이즈, 2 플랜, 14 요구사항, 44,639 LOC, 847 테스트.
v1.3.4 알림 트리거 + 어드민 알림 패널 shipped (2026-02-12). 3 페이즈, 5 플랜, 18 요구사항, 42,123 LOC, 895 테스트.
v1.4 토큰 + 컨트랙트 확장 shipped (2026-02-12). 6 페이즈, 12 플랜, 35 요구사항, 51,750 LOC, 1,126 테스트.
v1.4.1 EVM 지갑 인프라 + REST API 5-type 통합 + Owner Auth SIWE shipped (2026-02-12). 7 페이즈, 15 플랜, 29 요구사항, 65,074 LOC, 1,313 테스트.
v1.4.2 용어 변경 (agent → wallet) shipped (2026-02-13). 6 페이즈, 11 플랜, 38 요구사항, 56,808 LOC, 1,326 테스트.
v1.4.3 EVM 토큰 레지스트리 + MCP/Admin DX + 버그 수정 shipped (2026-02-13). 5 페이즈, 8 플랜, 13 요구사항, 59,993 LOC, 1,357 테스트.
v1.4.4 Admin Settings + MCP 5-type + Skill Files shipped (2026-02-14). 5 페이즈, 10 플랜, 24 요구사항, 62,296 LOC, 1,467 테스트.
v1.4.5 멀티체인 월렛 모델 설계 shipped (2026-02-14). 4 페이즈, 6 플랜, 19 요구사항, 설계 문서 5개(68-72), 설계 결정 31개.
v1.4.6 멀티체인 월렛 구현 shipped (2026-02-14). 6 페이즈, 13 플랜, 35 요구사항, ~73,000 LOC, 1,580 테스트, 38 설계 결정.
v1.4.7 임의 트랜잭션 서명 API shipped (2026-02-15). 5 페이즈, 12 플랜, 30 요구사항, ~175,480 LOC, 1,636 테스트, 33 설계 결정.
v1.4.8 Admin DX + 알림 개선 shipped (2026-02-15). 5 페이즈, 8 플랜, 28 요구사항, ~178,176 LOC, ~1,618 테스트, 18 설계 결정.

**기술 스택 (v0.2 확정, v1.4.1 구현 검증):**
- Runtime: Node.js 22 LTS (ESM-only)
- Server: OpenAPIHono 4.x (@hono/zod-openapi)
- DB: SQLite (better-sqlite3) + Drizzle ORM
- Crypto: sodium-native (guarded memory), argon2 (KDF)
- Auth: jose (JWT HS256), sodium-native (Ed25519 ownerAuth)
- Chain: @solana/kit 6.0.1 + @solana-program/token (Solana), viem 2.x (EVM, @waiaas/adapter-evm 구현)
- SDK: @waiaas/sdk (TS, 0 의존성), waiaas (Python, httpx + Pydantic v2)
- MCP: @waiaas/mcp (@modelcontextprotocol/sdk, stdio transport)
- Build: pnpm workspace + Turborepo, tsc only
- Test: Vitest (forks pool for sodium mprotect)
- Schema: Zod SSoT → TypeScript → OpenAPI → Drizzle CHECK
- Admin: Preact 10.x + @preact/signals + Vite 6.x, @testing-library/preact
- 미구현: Jupiter, Oracle, Tauri, Docker

**설계 문서:** 36개 (deliverables 24-72.md) + 대응표/테스트 전략/objective

### 알려진 이슈

- Node.js SEA + native addon (sodium-native, better-sqlite3) 크로스 컴파일 호환성 미검증 (v0.7 prebuildify 전략 설계 완료)
- @solana/kit 실제 버전 6.0.1 (설계서는 3.x 언급, API 동일)
- Pre-existing flaky lifecycle.test.ts (timer-sensitive BackgroundWorkers test) — not blocking
- Pre-existing e2e-errors.test.ts failure (expects 404, gets 401) — OpenAPIHono 전환 side effect
- Pre-existing 3 CLI E2E failures (E-07, E-08, E-09) — daemon-harness uses old adapter: param, not adapterPool:
- Kill switch state in-memory 관리 (v1.3에서는 DB 미저장)
- BUG-013~016 RESOLVED in v1.4.3 (Admin MCP 토큰, EVM getAssets, EVM confirmation timeout, 패키지 버전)

## 제약사항

- **배포**: Self-Hosted 전용 — 중앙 서버 의존 없이 사용자 로컬에서 완전 동작
- **보안**: 체인 무관(Chain-Agnostic) — 특정 블록체인 프로토콜에 의존하지 않는 보안 모델
- **블록체인**: Solana 1순위, EVM 2순위 — ChainAdapter로 추상화
- **언어**: 모든 기획 문서 한글 작성
- **의사결정 방식**: 질문 최소화, 직접 판단하여 최선의 방법 제시

## 주요 결정

| 결정 | 근거 | 결과 |
|------|------|------|
| Solana 우선 타겟 | 빠른 속도, 낮은 수수료, AI 에이전트 생태계 활발 | ✓ Good |
| API 우선 설계 | 에이전트는 UI가 아닌 API로 상호작용 | ✓ Good |
| Hono + SQLite (v0.2 전환) | Self-Hosted 경량화, 외부 의존 최소화 | ✓ Good |
| Dual Key 아키텍처 | Owner(통제) + Agent(자율) 역할 분리, defense-in-depth | ✓ Good |
| Cloud → Self-Hosted 전환 | 서비스 제공자 의존 제거, 사용자 완전 통제 | ✓ Good |
| 3계층 보안 (세션→시간지연→모니터링) | 다층 방어, 키 유출 시에도 피해 최소화 | ✓ Good |
| 체인 무관 정책 엔진 | Squads 등 온체인 의존 제거, 모든 체인에 동일 보안 | ✓ Good |
| 세션 기반 에이전트 인증 | 영구 키 대신 단기 JWT, 유출 시 만료로 자동 무효화 | ✓ Good |
| Zod SSoT | 스키마 → 타입 + OpenAPI + 런타임 검증 통합 | ✓ Good |
| masterAuth/ownerAuth 책임 분리 | Owner 서명은 자금 영향 시에만 요구 | ✓ Good — v1.2 구현 검증 |
| Owner 선택적 등록 (3-State) | 자율 에이전트 시나리오 지원, 초기 마찰 제거 | ✓ Good — v1.2 구현 검증 |
| APPROVAL→DELAY 다운그레이드 | Owner 없어도 차단 없이 DELAY로 대체 | ✓ Good — v1.2 구현 검증 |
| tsc only (빌드 도구 불필요) | ESM 단일 출력, 번들러 불필요 | ✓ Good — v1.1 구현 |
| jose for JWT HS256 | ESM-native, Buffer.from(hex) 대칭키 | ✓ Good — v1.2 구현 |
| BigInt for amount comparisons | floating point 정밀도 이슈 방지 | ✓ Good — v1.2 구현 |
| BEGIN IMMEDIATE + reserved_amount | TOCTOU 방지, SQLite 동시 정책 평가 | ✓ Good — v1.2 구현 |
| resolveOwnerState 순수 함수 | DB 비저장, 런타임 파생, 재사용 가능 | ✓ Good — v1.2 구현 |
| PIPELINE_HALTED 에러 코드 | DELAY/APPROVAL 의도적 중단 표현 (409) | ✓ Good — v1.2 구현 |
| ownerAuth 성공 시 자동 GRACE→LOCKED | 별도 전이 엔드포인트 불필요 | ✓ Good — v1.2 구현 |
| server-level auth middleware | sub-router 레벨 대신 app.use() 적용 | ✓ Good — v1.2 구현 |
| IChainAdapter 저수준 유지 | DeFi 지식은 Action Provider에 분리 | ✓ Good — v0.6 설계 |
| resolve-then-execute 패턴 | Action Provider가 요청 생성 → 파이프라인 실행 | ✓ Good — v0.6 설계 |
| config.toml 중첩 금지 | WAIAAS_{SECTION}_{KEY} 1:1 매핑 | ✓ Good — v0.7 해소 |
| SQLite 타임스탬프 초 단위 | UUID v7 ms가 동일 초 내 순서 보장 | ✓ Good — v0.7 해소 |
| OpenAPIHono 전면 전환 | Zod SSoT → OpenAPI 자동 생성, 타입 안전 라우팅 | ✓ Good — v1.3 구현 |
| @hono/zod-openapi v0.19.10 | v1.x는 zod@^4.0.0 필요, 프로젝트는 zod@3.x | ✓ Good — v1.3 구현 |
| TS SDK 0 외부 의존성 | Node.js 22 내장 fetch, 번들 크기 최소화 | ✓ Good — v1.3 구현 |
| Python SDK httpx + Pydantic v2 | 비동기 HTTP + 타입 안전 모델 | ✓ Good — v1.3 구현 |
| MCP SessionManager eager init | 서버 시작 시 즉시 토큰 로드 + 갱신 타이머 | ✓ Good — v1.3 구현 |
| 알림 채널 native fetch | 외부 Bot 프레임워크 미사용, 의존성 최소화 | ✓ Good — v1.3 구현 |
| Error hint resolveHint() | AI 에이전트 자율 복구용 32개 hint 매핑 | ✓ Good — v1.3 구현 |
| 커서 페이지네이션 UUID v7 | createdAt 대신 ID 컬럼 사용, 순서 보장 | ✓ Good — v1.3 구현 |
| Admin UI masterAuth only (JWT 미사용) | 관리 도구 저빈도 요청, Argon2id 300ms/req 허용 | ✓ Good — v1.3.1 설계 |
| Preact 10.x (3KB gzip) + @preact/signals | 경량 SPA, React 호환 API, 시그널 기반 상태 관리 | ✓ Good — v1.3.1 설계 |
| CSP default-src 'none' + CSRF 토큰 불필요 | 가장 엄격한 CSP 기본값, 커스텀 헤더로 CSRF 방어 | ✓ Good — v1.3.1 설계 |
| 클라이언트 검증 Zod 미임포트 | ~13KB gzip 절약, 빌드 커플링 제거 | ✓ Good — v1.3.1 설계 |
| 68 에러 코드 전체 매핑 | Admin UI 미사용 코드 포함, 향후 견고성 확보 | ✓ Good — v1.3.1 설계 |
| All Preact/Vite deps as devDependencies | 빌드 타임만 필요, 런타임 번들에 미포함 | ✓ Good — v1.3.2 구현 |
| CSP default-src 'none' 최엄격 정책 | XSS 방어 극대화, script-src/style-src/img-src 'self' 개별 허용 | ✓ Good — v1.3.2 구현 |
| Custom hash routing (@preact/signals) | preact-router 의존 제거, hashchange 이벤트 + signal 단순 구현 | ✓ Good — v1.3.2 구현 |
| Preact signal reset via beforeEach | module-level signals 테스트 격리, 상태 누수 방지 | ✓ Good — v1.3.2 구현 |
| Type-to-confirm 데몬 종료 패턴 | 실수 방지, "SHUTDOWN" 입력 필수 | ✓ Good — v1.3.2 구현 |
| isInitialLoad 패턴 (스켈레톤 vs 스테일 데이터) | 첫 로드만 스켈레톤, 이후 폴링은 stale 데이터 위 에러 표시 | ✓ Good — v1.3.2 구현 |
| 프로세스 분리 방식 (에이전트당 MCP 서버 1개) | MCP 프로토콜 표준 부합, 서버 단위 capability 노출 | ✓ Good — v1.3.3 구현 |
| mcp-tokens/<agentId> 서브디렉토리 격리 | 동일 디렉토리 파일명 패턴보다 깨끗한 분리 | ✓ Good — v1.3.3 구현 |
| AgentContext DI 패턴 (글로벌 상태 아님) | 테스트 용이, 모듈 간 의존 최소화 | ✓ Good — v1.3.3 구현 |
| CLI 토큰 경로 항상 mcp-tokens/<agentId> | 단일 에이전트도 새 경로 사용, 일관성 확보 | ✓ Good — v1.3.3 구현 |
| toSlug + resolveSlugCollisions 유틸리티 | 에이전트 이름→config-safe 키 변환, 충돌 시 agentId 접미사 | ✓ Good — v1.3.3 구현 |
| schema_version 테이블로 DB 마이그레이션 추적 | INTEGER PK 버전 순서, MIG-01~06 준수 | ✓ Good — v1.3.4 구현 |
| fire-and-forget notify() 패턴 (void + optional chaining) | 알림이 파이프라인 실행을 차단하지 않음, 역방향 호환 | ✓ Good — v1.3.4 구현 |
| 어드민 UI 알림 설정 읽기 전용 | config.toml SSoT 유지, 설정 변경은 파일 직접 수정 | ✓ Good — v1.3.4 구현 |
| credential 마스킹 (boolean enabled만 반환) | bot token/webhook URL 미노출, 보안 원칙 준수 | ✓ Good — v1.3.4 구현 |
| getChannels() + channel.send() 직접 호출 (테스트 발송) | rate limiter 우회, notify() 수정 불필요 | ✓ Good — v1.3.4 구현 |
| Drizzle count() + offset/limit 페이지네이션 | 알림 로그 역순 조회, 간단하고 효과적 | ✓ Good — v1.3.4 구현 |
| ChainError extends Error (not WAIaaSError) | chain adapter 내부 에러, Stage 5에서 WAIaaSError 변환 | ✓ Good — v1.4 구현 |
| ChainError 3-카테고리 retryable 자동 파생 | category !== 'PERMANENT' → retryable, 일관된 재시도 로직 | ✓ Good — v1.4 구현 |
| schema_version 기반 증분 마이그레이션 | ALTER TABLE only, DB 삭제 금지, MIG-01~06 준수 | ✓ Good — v1.4 구현 |
| discriminatedUnion 5-type (type 필드 기반) | TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH 자동 식별 | ✓ Good — v1.4 구현 |
| 기본 거부 정책 원칙 (ALLOWED_TOKENS/CONTRACT_WHITELIST/APPROVED_SPENDERS) | 정책 미설정 시 deny, opt-in 화이트리스트 | ✓ Good — v1.4 구현 |
| Gas safety margin (estimatedGas * 120n) / 100n | BigInt 산술로 1.2x 배수, 모든 build 메서드 일관 적용 | ✓ Good — v1.4 구현 |
| viem 에러 메시지 패턴 매칭 (mapError 헬퍼) | typed error 미제공 대응, ChainError 자동 분류 | ✓ Good — v1.4 구현 |
| Token-2022 mint account owner 필드 감지 | SPL_TOKEN_PROGRAM_ID vs TOKEN_2022_PROGRAM_ID 판별 | ✓ Good — v1.4 구현 |
| evaluateBatch 2단계 (개별 + 합산) | 소액 분할 우회 방지, All-or-Nothing | ✓ Good — v1.4 구현 |
| CONC-01 TRANSIENT retry rebuilds from Stage 5a | 단순한 루프 구조, build/sign은 로컬 ops | ✓ Good — v1.4 구현 |
| buildByType 5-type adapter 라우팅 | type별 IChainAdapter 메서드 디스패치 | ✓ Good — v1.4 구현 |
| sleep() extracted to pipeline/sleep.ts | vi.mock 테스트 가능성, 모듈 레벨 분리 | ✓ Good — v1.4 구현 |
| chain='ethereum' EVM 전체 포괄 | ChainType enum 확장 없이 EVM 호환 체인 지원 | ✓ Good — v1.4.1 구현 |
| AdapterPool lazy init + 캐싱 | 데몬 시작 시 전체 초기화 아닌 요청 시 생성 | ✓ Good — v1.4.1 구현 |
| Route schema separation 방안 C | OpenAPI doc과 실제 Zod 검증 분리, stage1Validate SSoT | ✓ Good — v1.4.1 구현 |
| SIWE nonce 미검증 | Solana owner-auth 일관성, expirationTime 의존 | ✓ Good — v1.4.1 구현 |
| SIWE message base64 인코딩 | 멀티라인 EIP-4361 HTTP 헤더 호환 | ✓ Good — v1.4.1 구현 |
| managesOwnTransaction 마이그레이션 플래그 | 테이블 재생성 시 자체 PRAGMA/트랜잭션 관리 | ✓ Good — v1.4.1 구현 |
| EVM_CHAIN_MAP Record<EvmNetworkType> | 컴파일 타임 완전성 보장, 네트워크 누락 방지 | ✓ Good — v1.4.1 구현 |
| 엔티티 이름 wallet 확정 | 서비스명 WaaS와 일치, 관리 대상의 실체(지갑) 반영 | ✓ Good — v1.4.2 구현 |
| API v1 유지 (breaking change) | 외부 소비자 없음 (self-hosted 내부), 깔끔하게 일괄 변경 | ✓ Good — v1.4.2 구현 |
| 하위 호환 shim 미제공 | 외부 배포 전이므로 불필요, deprecated alias 없이 직접 변경 | ✓ Good — v1.4.2 구현 |
| MCP 기존 토큰 폐기 + 재설정 안내 | JWT claim 변경(agt→wlt)으로 기존 토큰 자동 무효화 | ✓ Good — v1.4.2 구현 |
| AI agent 개념 참조 보존 | 설계 문서에서 코드 식별자만 rename, AI agent 설명은 유지 | ✓ Good — v1.4.2 구현 |
| 한국어 용어 에이전트→지갑 (관리 엔티티) | AI agent 개념은 에이전트 유지, 관리 대상은 지갑으로 변경 | ✓ Good — v1.4.2 구현 |
| 내장 토큰 레지스트리 merge layer | DB custom + built-in 병합, custom 우선, source 필드 구분 | ✓ Good — v1.4.3 구현 |
| 레지스트리 ≠ 전송 허용 역할 분리 | 레지스트리(UX 조회용) vs ALLOWED_TOKENS(보안 전송 허용) 분리 | ✓ Good — v1.4.3 구현 |
| waitForConfirmation never throws | fallback receipt 조회, return-value 3-way branching | ✓ Good — v1.4.3 구현 |
| POST /v1/mcp/tokens 원스톱 프로비저닝 | 세션 + 토큰 파일 + Claude Desktop config 단일 응답 | ✓ Good — v1.4.3 구현 |
| tag-release.sh 모노레포 버전 관리 | jq in-place + git tag + git commit 일괄 처리 | ✓ Good — v1.4.3 구현 |
| duck-typing adapter 감지 (getAssets) | instanceof 대신 메서드 존재 확인으로 registry 주입 | ✓ Good — v1.4.3 구현 |
| HKDF(SHA-256) settings 암호화 | Argon2id 대비 경량, 빈번한 읽기에 적합 | ✓ Good — v1.4.4 구현 |
| Settings fallback 체인 (DB>config>env>default) | DaemonConfig 재활용, importFromConfig 자동 | ✓ Good — v1.4.4 구현 |
| HotReloadOrchestrator prefix/set 분류 | 알림/RPC/보안 3개 서브시스템별 reload 액션 | ✓ Good — v1.4.4 구현 |
| MCP Feature Parity 원칙 (MCPSDK-04 철회) | MCP/SDK/API 동일 공격 면적, 정책 엔진이 보안 담당 | ✓ Good — v1.4.4 구현 |
| 스킬 파일 5개 분리 (단일 파일 대체) | 컨텍스트 윈도우 절약, 용도별 로드 | ✓ Good — v1.4.4 구현 |
| EnvironmentType 2값 하드코딩 (testnet/mainnet) | 제3 환경 수요 없음, YAGNI 원칙 | ✓ Good — v1.4.5 설계 |
| 환경-네트워크 매핑 순수 함수 (DB 조회 없음) | 13 NETWORK_TYPES 하드코딩 가능, 성능 우선 | ✓ Good — v1.4.5 설계 |
| default_network nullable (NULL=환경 기본값) | 사용자 미지정 시 환경 기본값 자동 사용 | ✓ Good — v1.4.5 설계 |
| DB 마이그레이션 2단계 분리 (v6a ADD COLUMN, v6b 12-step 재생성) | 의존 순서 명확, 실패 시 개별 롤백 | ✓ Good — v1.4.5 설계 |
| resolveNetwork() 순수 함수 (클래스 아님) | 테스트 용이, 모듈 분리 | ✓ Good — v1.4.5 설계 |
| ENVIRONMENT_NETWORK_MISMATCH 별도 에러 코드 | TX 도메인 명확한 에러 분류 | ✓ Good — v1.4.5 설계 |
| ALLOWED_NETWORKS permissive default | 기존 월렛 하위호환, opt-in 제한 | ✓ Good — v1.4.5 설계 |
| policies.network DB 컬럼 (not rules JSON) | SQL 쿼리 최적화 | ✓ Good — v1.4.5 설계 |
| REST API environment optional + deriveEnvironment fallback | breaking change 방지 | ✓ Good — v1.4.5 설계 |
| MCP network "omit for default" 패턴 | LLM 혼란 방지 | ✓ Good — v1.4.5 설계 |
| quickstart 에러 시 rollback 없음 (멱등성) | 복잡성 감소, 재실행으로 해결 | ✓ Good — v1.4.5 설계 |
| EnvironmentType Zod SSoT chain.ts 배치 | 기존 SSoT와 동일 위치, 코드 응집도 | ✓ Good — v1.4.6 구현 |
| ALLOWED_NETWORKS permissive default 구현 | 기존 월렛 하위호환, ALLOWED_TOKENS과 반대 철학 | ✓ Good — v1.4.6 구현 |
| resolveNetwork() 순수 함수 별도 파일 | stages.ts 비대 방지, 테스트 용이 | ✓ Good — v1.4.6 구현 |
| ENVIRONMENT_NETWORK_MISMATCH 별도 에러 코드 | 보안 중요도 높은 에러 명시적 분류 | ✓ Good — v1.4.6 구현 |
| 4단계 override 우선순위 (wallet+network > wallet+null > global+network > global+null) | 가장 구체적인 정책이 우선, 직관적 | ✓ Good — v1.4.6 구현 |
| evaluateAndReserve raw SQL network 바인딩 | Drizzle ORM 제약 우회, 성능 최적화 | ✓ Good — v1.4.6 구현 |
| daemon.ts tx.network DB 값 직접 사용 | Stage 5 재실행 시 안전성 보장 | ✓ Good — v1.4.6 구현 |
| GET /networks 응답 isDefault 플래그 | 클라이언트 기본 네트워크 시각적 표시 | ✓ Good — v1.4.6 구현 |
| get_wallet_info 파라미터 없는 MCP 도구 | address + networks 2단계 API 호출 조합 | ✓ Good — v1.4.6 구현 |
| Python SDK keyword-only network 파라미터 | 기존 positional args 하위호환 유지 | ✓ Good — v1.4.6 구현 |
| quickstart buildConfigEntry 인라인 복제 | 공통 유틸 추출은 scope 외, YAGNI | ✓ Good — v1.4.6 구현 |
| DELAY/APPROVAL tier sign-only 즉시 거부 | 동기 API에서 blockhash/nonce 만료 위험 | ✓ Good — v1.4.7 구현 |
| 파싱 실패 = DENY 원칙 | 알려진 패턴만 통과, 보안 기본값 | ✓ Good — v1.4.7 구현 |
| ParsedOperationType 5종 | NATIVE_TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/UNKNOWN | ✓ Good — v1.4.7 구현 |
| sign-only 파이프라인 별도 모듈 분리 | stages.ts 수정 없음, 독립 모듈 | ✓ Good — v1.4.7 구현 |
| reservation SUM 쿼리에 SIGNED 포함 | 이중 지출 방지, TOCTOU 일관성 | ✓ Good — v1.4.7 구현 |
| settingsService 선택적 3번째 파라미터 DI | 하위 호환, null-safe 패턴 | ✓ Good — v1.4.7 구현 |
| skills 라우트 public (인증 불필요) | nonce/health와 동일 레벨 | ✓ Good — v1.4.7 구현 |
| ResourceTemplate list callback 정적 나열 | VALID_SKILLS 배열 기반, 동적 조회 불필요 | ✓ Good — v1.4.7 구현 |
| SKILL_NOT_FOUND SYSTEM 도메인 배치 | 스킬은 시스템 리소스 | ✓ Good — v1.4.7 구현 |
| pushSchema 3-step 순서 (tables→migrations→indexes) | 인덱스가 최신 컬럼 참조, 마이그레이션 후 생성해야 안전 | ✓ Good — v1.4.8 구현 |
| createShutdownHandler 팩토리 패턴 | DI exit 함수 주입으로 테스트 가능, idempotent once guard | ✓ Good — v1.4.8 구현 |
| 세션 스코프 PUT /v1/wallet/default-network | MCP sessionAuth로 기본 네트워크 변경, masterAuth 미러링 | ✓ Good — v1.4.8 구현 |
| getAllBalances()/getAllAssets() 별도 메서드 | 반환 타입 다름, 타입 안전성 우선 | ✓ Good — v1.4.8 구현 |
| Promise.allSettled 부분 실패 패턴 | 환경 내 네트워크별 병렬 RPC, 성공/실패 각각 표시 | ✓ Good — v1.4.8 구현 |
| Slack Incoming Webhook attachments 형식 | Block Kit 대신 범용 호환성 우선 | ✓ Good — v1.4.8 구현 |
| notification_logs.message nullable TEXT | pre-v10 로그 하위호환 보장 | ✓ Good — v1.4.8 구현 |

---
*최종 업데이트: 2026-02-15 after v1.4.8 milestone shipped*
