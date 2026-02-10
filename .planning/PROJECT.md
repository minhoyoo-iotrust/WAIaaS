# WAIaaS: AI 에이전트를 위한 Wallet-as-a-Service

## 이것이 무엇인가

중앙 서버 없이 사용자가 직접 설치하여 운영하는 AI 에이전트 지갑 시스템. 체인 무관(Chain-Agnostic) 3계층 보안 모델(세션 인증 → 시간 지연 → 모니터링)로 에이전트 해킹이나 키 유출 시에도 피해를 최소화한다. CLI Daemon / Desktop App / Docker로 배포하며, REST API, TypeScript/Python SDK, MCP 통합을 통해 모든 에이전트 프레임워크에서 사용 가능하다.

## 핵심 가치

**AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다** — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서. 서비스 제공자 의존 없이 사용자가 완전한 통제권을 보유한다.

## Current Milestone: v1.3 SDK + MCP + 알림

**Goal:** AI 에이전트가 TS/Python SDK 또는 MCP로 지갑을 사용하고, Owner가 Telegram/Discord/ntfy로 알림을 받는 상태. OpenAPIHono 전환으로 전 엔드포인트 타입 안전 라우팅 + OpenAPI 3.0 자동 생성 완성.

**Target features:**
- TypeScript SDK (`@waiaas/sdk`) — WAIaaSClient + WAIaaSOwnerClient, 0 외부 의존성, fetch 기반
- Python SDK (`waiaas`) — httpx + Pydantic v2, 동일 인터페이스
- MCP Server (`@waiaas/mcp`) — 6 도구 + 3 리소스, SessionManager 내장, stdio transport
- 알림 시스템 — Telegram/Discord/ntfy 3채널, NotificationService, 21개 이벤트
- OpenAPIHono 전면 전환 — 기존 18 + 신규 15 = 33 엔드포인트, GET /doc OpenAPI 자동 생성
- REST API 15개 추가 (누적 33개)
- IChainAdapter getAssets() 선행 구현

## Current State

v1.2 인증 + 정책 엔진 shipped (2026-02-10). 238 TypeScript 파일, 25,526 LOC, 457 테스트 통과. CLI로 init → start → 세션 생성 → 정책 설정 → SOL 전송(INSTANT/DELAY/APPROVAL 분류) → Owner 승인/거절 → 확인까지 동작하는 인증+정책 적용 데몬 완성.

**구현 로드맵 (v1.3~v2.0):**
- ✅ v1.1 코어 인프라 + 기본 전송 — shipped 2026-02-10
- ✅ v1.2 인증 + 정책 엔진 — shipped 2026-02-10
- **→ v1.3 SDK + MCP + 알림 (TS/Python SDK, MCP Server, 알림 3채널, SessionManager)**
- v1.4 토큰 + 컨트랙트 확장 (SPL/ERC-20, 컨트랙트 호출, Approve, Batch, EVM 어댑터)
- v1.5 DeFi + 가격 오라클 (IPriceOracle, Action Provider, Jupiter Swap, USD 정책)
- v1.6 Desktop + Telegram + Docker (Tauri 8화면, Bot, Kill Switch, Docker)
- v1.7 품질 강화 + CI/CD (300+ 테스트, 보안 237건, 4-stage 파이프라인)
- v2.0 전 기능 완성 릴리스 (npm 7패키지, Docker, Desktop 5플랫폼, GitHub Release)

**코드베이스 현황:**
- 4-패키지 모노레포: @waiaas/core, @waiaas/daemon, @waiaas/adapter-solana, @waiaas/cli
- 238 TypeScript 파일, 25,526 LOC (ESM-only, Node.js 22)
- 457 테스트 (core + adapter + daemon + CLI)
- pnpm workspace + Turborepo, Vitest, ESLint flat config, Prettier

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

### 활성

(v1.3 — REQUIREMENTS.md에서 상세 정의)

- [ ] TypeScript SDK (@waiaas/sdk) — WAIaaSClient + WAIaaSOwnerClient, 0 외부 의존성
- [ ] Python SDK (waiaas) — httpx + Pydantic v2, 동일 인터페이스
- [ ] MCP Server (@waiaas/mcp) — 6 도구 + 3 리소스, SessionManager 자동 갱신
- [ ] 알림 시스템 — Telegram/Discord/ntfy 3채널, NotificationService, 21 이벤트
- [ ] OpenAPIHono 전면 전환 — 33 엔드포인트, GET /doc OpenAPI 3.0 자동 생성
- [ ] REST API 15개 추가 (누적 33개)
- [ ] IChainAdapter getAssets() + GET /v1/wallet/assets

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

**누적:** 14 milestones (v0.1-v1.2), 57 phases, 140 plans, 367 requirements, 30 설계 문서, 8 objective 문서, 25,526 LOC TypeScript, 457 테스트

v0.1~v0.10 설계 완료 (2026-02-05~09). 44 페이즈, 110 플랜, 286 요구사항, 30 설계 문서(24-64).
v1.0 구현 계획 수립 완료 (2026-02-09). 8개 objective 문서, 설계 부채 추적, 문서 매핑 검증.
v1.1 코어 인프라 + 기본 전송 shipped (2026-02-10). 4 페이즈, 12 플랜, 46 요구사항, 97 TS 파일, 10,925 LOC, 281 테스트.
v1.2 인증 + 정책 엔진 shipped (2026-02-10). 6 페이즈, 13 플랜, 35 요구사항, 238 TS 파일, 25,526 LOC, 457 테스트.

**기술 스택 (v0.2 확정, v1.2 구현 검증):**
- Runtime: Node.js 22 LTS (ESM-only)
- Server: Hono 4.x
- DB: SQLite (better-sqlite3) + Drizzle ORM
- Crypto: sodium-native (guarded memory), argon2 (KDF)
- Auth: jose (JWT HS256), sodium-native (Ed25519 ownerAuth)
- Chain: @solana/kit 6.0.1 (Solana), viem 2.x (EVM stub, 미구현)
- Build: pnpm workspace + Turborepo, tsc only
- Test: Vitest (forks pool for sodium mprotect)
- Schema: Zod SSoT → TypeScript → Drizzle CHECK
- 미구현: @solana-program/token (SPL), Jupiter, Oracle, Tauri, Docker

**설계 문서:** 30개 (deliverables 24-64.md) + 대응표/테스트 전략/objective

### 알려진 이슈

- Node.js SEA + native addon (sodium-native, better-sqlite3) 크로스 컴파일 호환성 미검증 (v0.7 prebuildify 전략 설계 완료)
- @solana/kit 실제 버전 6.0.1 (설계서는 3.x 언급, API 동일)
- Pre-existing flaky lifecycle.test.ts (timer-sensitive BackgroundWorkers test) — not blocking

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

---
*최종 업데이트: 2026-02-10 after v1.3 milestone started*
