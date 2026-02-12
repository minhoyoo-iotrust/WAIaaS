# WAIaaS: AI 에이전트를 위한 Wallet-as-a-Service

## 이것이 무엇인가

중앙 서버 없이 사용자가 직접 설치하여 운영하는 AI 에이전트 지갑 시스템. 체인 무관(Chain-Agnostic) 3계층 보안 모델(세션 인증 → 시간 지연 → 모니터링)로 에이전트 해킹이나 키 유출 시에도 피해를 최소화한다. CLI Daemon / Desktop App / Docker로 배포하며, REST API, TypeScript/Python SDK, MCP 통합을 통해 모든 에이전트 프레임워크에서 사용 가능하다. v1.4에서 SPL/ERC-20 토큰 전송, 스마트 컨트랙트 호출, Approve 관리, Solana 원자적 배치가 기본 거부 정책으로 동작하며, @waiaas/adapter-evm 패키지(viem 2.x)로 EVM 체인을 지원하고, 5-type discriminatedUnion 파이프라인 + Stage 5 ChainError 카테고리별 재시도가 완전 구현되었다.

## 핵심 가치

**AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다** — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서. 서비스 제공자 의존 없이 사용자가 완전한 통제권을 보유한다.

## Current State

v1.4 토큰 + 컨트랙트 확장 shipped (2026-02-12). SPL/ERC-20 토큰 전송(ALLOWED_TOKENS 기본 거부), 컨트랙트 호출(CONTRACT_WHITELIST/METHOD_WHITELIST 기본 거부), Approve 관리(APPROVED_SPENDERS/무제한 차단), Solana 원자적 배치(2단계 합산 정책), @waiaas/adapter-evm 패키지(viem 2.x, 20메서드), ChainError 3-카테고리 + Stage 5 CONC-01 재시도, discriminatedUnion 5-type 파이프라인이 동작.

코드베이스(v1.4 기준): 9-패키지 모노레포 + Python SDK, 51,750 LOC, 1,126 테스트 통과. CLI로 init → start → 세션 생성 → 정책 설정 → SOL/SPL/ETH/ERC-20 전송 → 컨트랙트 호출 → Approve → 배치 → Owner 승인/거절 + SDK/MCP로 프로그래밍 접근 + Telegram/Discord/ntfy 알림(실제 트리거 연결) + Admin Web UI(`/admin`) 관리(알림 패널 포함) + 다중 에이전트 MCP 설정까지 동작.

**구현 로드맵:**
- ✅ v1.1 코어 인프라 + 기본 전송 — shipped 2026-02-10
- ✅ v1.2 인증 + 정책 엔진 — shipped 2026-02-10
- ✅ v1.3 SDK + MCP + 알림 — shipped 2026-02-11
- ✅ v1.3.1 Admin Web UI 설계 — shipped 2026-02-11
- ✅ v1.3.2 Admin Web UI 구현 — shipped 2026-02-11
- ✅ v1.3.3 MCP 다중 에이전트 지원 — shipped 2026-02-11
- ✅ v1.3.4 알림 이벤트 트리거 연결 + 어드민 알림 패널 — shipped 2026-02-12
- ✅ v1.4 토큰 + 컨트랙트 확장 — shipped 2026-02-12 (1,126 tests, 51,750 LOC)
- v1.5 DeFi + 가격 오라클 (IPriceOracle, Action Provider, Jupiter Swap, USD 정책)
- v1.5.1 x402 클라이언트 지원 (x402 자동 결제, X402_ALLOWED_DOMAINS 정책, facilitator 연동)
- v1.6 Desktop + Telegram + Docker (Tauri 8화면, Bot, Kill Switch, Docker)
- v1.7 품질 강화 + CI/CD (300+ 테스트, 보안 237건, 4-stage 파이프라인)
- v2.0 전 기능 완성 릴리스 (npm 8패키지, Docker, Desktop 5플랫폼, GitHub Release)

**코드베이스 현황:**
- 9-패키지 모노레포: @waiaas/core, @waiaas/daemon, @waiaas/adapter-solana, @waiaas/adapter-evm, @waiaas/cli, @waiaas/sdk, @waiaas/mcp, @waiaas/admin + waiaas (Python)
- 51,750 LOC (TypeScript/TSX + Python + CSS, ESM-only, Node.js 22)
- 1,126 테스트 (core + adapter-solana + adapter-evm + daemon + CLI + SDK + MCP + admin)
- pnpm workspace + Turborepo, Vitest, ESLint flat config, Prettier
- OpenAPIHono 36 엔드포인트 (33 + admin 알림 3), GET /doc OpenAPI 3.0 자동 생성
- IChainAdapter 20 메서드, discriminatedUnion 5-type 파이프라인, 10 PolicyType
- 설계 문서 31개 (24-67), 8 objective 문서

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

### 활성

(다음 마일스톤에서 정의)

## Next Milestone Goals

- v1.4.1 EVM 지갑 인프라 — secp256k1 키 생성, 어댑터 팩토리, Config EVM RPC
- v1.5 DeFi + 가격 오라클 — IPriceOracle, Action Provider, Jupiter Swap, USD 정책
- v1.5.1 x402 클라이언트 지원 — x402 자동 결제, X402_ALLOWED_DOMAINS 정책, facilitator 연동
- v1.6 운영 인프라 + 잔액 모니터링

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

**누적:** 20 milestones (v0.1-v1.4), 81 phases, 182 plans, 523 requirements, 31 설계 문서(24-67), 8 objective 문서, 51,750 LOC, 1,126 테스트

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

**기술 스택 (v0.2 확정, v1.4 구현 검증):**
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
- 미구현: Jupiter, Oracle, Tauri, Docker, EVM 키스토어(secp256k1)

**설계 문서:** 31개 (deliverables 24-67.md) + 대응표/테스트 전략/objective

### 알려진 이슈

- Node.js SEA + native addon (sodium-native, better-sqlite3) 크로스 컴파일 호환성 미검증 (v0.7 prebuildify 전략 설계 완료)
- @solana/kit 실제 버전 6.0.1 (설계서는 3.x 언급, API 동일)
- Pre-existing flaky lifecycle.test.ts (timer-sensitive BackgroundWorkers test) — not blocking
- Pre-existing e2e-errors.test.ts failure (expects 404, gets 401) — OpenAPIHono 전환 side effect
- Kill switch state in-memory 관리 (v1.3에서는 DB 미저장)

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

---
*최종 업데이트: 2026-02-12 after v1.4 milestone shipped*
