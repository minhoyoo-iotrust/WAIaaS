# WAIaaS: AI 에이전트를 위한 Wallet-as-a-Service

## 이것이 무엇인가

중앙 서버 없이 사용자가 직접 설치하여 운영하는 AI 에이전트 지갑 시스템. 체인 무관(Chain-Agnostic) 3계층 보안 모델(세션 인증 → 시간 지연 → 모니터링)로 에이전트 해킹이나 키 유출 시에도 피해를 최소화한다. CLI Daemon / Desktop App / Docker로 배포하며, REST API, TypeScript/Python SDK, MCP 통합을 통해 모든 에이전트 프레임워크에서 사용 가능하다.

## 핵심 가치

**AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다** — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서. 서비스 제공자 의존 없이 사용자가 완전한 통제권을 보유한다.

## Current Milestone: v1.1 코어 인프라 + 기본 전송

**목표:** CLI로 init → start → SOL 전송 → 확인까지 동작하는 최소 데몬

**구현 대상:**
- 모노레포 구조 (pnpm workspace + Turborepo, 4 패키지)
- SQLite 7-table 스키마 (Drizzle ORM, UUID v7, WAL 모드)
- AES-256-GCM 키스토어 (Argon2id KDF, sodium guarded memory)
- 데몬 라이프사이클 (6단계 시작, 10-step 종료, flock 잠금)
- Hono API 서버 (6개 미들웨어, 6개 엔드포인트)
- SolanaAdapter SOL 전송 (6개 메서드, @solana/kit 3.x)
- 6-stage 트랜잭션 파이프라인 골격 (Stage 2~4 패스스루)
- CLI 4개 명령어 (init, start, stop, status)
- 12 Enum SSoT (as const → Zod → Drizzle CHECK)

## Current State

v1.1 코어 인프라 구현 착수 (2026-02-10). 전체 설계+계획 단계 완료 (v0.1~v1.0, 11 milestones). 첫 번째 구현 마일스톤.

**구현 로드맵 (v1.1~v2.0):**
- v1.1 코어 인프라 + 기본 전송 (모노레포, SQLite, 키스토어, 데몬, CLI, 6-stage 파이프라인, SOL 전송)
- v1.2 인증 + 정책 엔진 (3-tier 인증, 4-tier 정책, Owner 상태 머신, 세션 관리)
- v1.3 SDK + MCP + 알림 (TS/Python SDK, MCP Server, 알림 3채널, SessionManager)
- v1.4 토큰 + 컨트랙트 확장 (SPL/ERC-20, 컨트랙트 호출, Approve, Batch, EVM 어댑터)
- v1.5 DeFi + 가격 오라클 (IPriceOracle, Action Provider, Jupiter Swap, USD 정책)
- v1.6 Desktop + Telegram + Docker (Tauri 8화면, Bot, Kill Switch, Docker)
- v1.7 품질 강화 + CI/CD (300+ 테스트, 보안 237건, 4-stage 파이프라인)
- v2.0 전 기능 완성 릴리스 (npm 7패키지, Docker, Desktop 5플랫폼, GitHub Release)

## 현재 상태

v0.1~v0.10 완료 (2026-02-09). 110개 플랜, 276개 요구사항, 44개 페이즈, 10개 마일스톤, 30개 설계 문서(24-64). 전체 설계 단계 완료, 구현 착수 차단 미비점 12건 전수 해소. 설계 문서만으로 코드를 작성할 수 있는 상태.

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
- ✓ 66개 에러 코드 통합 매트릭스 + PolicyType 10개 확장 + superRefine 검증 — v0.10 (ERRH-01, ERRH-03)
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

### 활성

(v1.1 REQUIREMENTS.md에서 상세 정의 — 아래는 카테고리 요약)

- [ ] 모노레포 인프라 구축 (pnpm workspace, Turborepo, tsconfig, ESLint+Prettier, Vitest)
- [ ] @waiaas/core 패키지 (Zod 스키마, 12 Enum SSoT, 66 에러 코드, 인터페이스, i18n)
- [ ] SQLite 스키마 + Drizzle ORM (7 테이블, PRAGMA, 마이그레이션)
- [ ] 키스토어 모듈 (AES-256-GCM, Argon2id, sodium guarded memory, 파일 포맷 v1)
- [ ] config.toml 로더 (smol-toml, Zod 검증, 환경변수 오버라이드)
- [ ] 데몬 라이프사이클 (6단계 시작, 10-step 종료, flock, PID, BackgroundWorkers)
- [ ] Hono API 서버 (6개 미들웨어, 6개 엔드포인트, masterAuth implicit)
- [ ] SolanaAdapter 네이티브 SOL 전송 (6 메서드, @solana/kit 3.x)
- [ ] 6-stage 트랜잭션 파이프라인 골격 (Stage 2~4 패스스루)
- [ ] CLI 4개 명령어 (init, start, stop, status)
- [ ] E2E 검증 12건 (라이프사이클 4 + 에이전트 3 + 트랜잭션 2 + 에러 3)

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

v0.1 Research & Design 완료 (2026-02-05). 5개 페이즈, 15개 플랜, 23개 요구사항.
v0.2 Self-Hosted Secure Wallet Design 완료 (2026-02-05). 4개 페이즈, 16개 플랜, 45개 요구사항, 17개 설계 문서.
v0.3 설계 논리 일관성 확보 완료 (2026-02-06). 4개 페이즈, 8개 플랜, 37개 요구사항, 5개 대응표/매핑 문서.
v0.4 테스트 전략 및 계획 수립 완료 (2026-02-07). 5개 페이즈, 9개 플랜, 26개 요구사항, 11개 테스트 전략 문서 (docs 41-51).
v0.5 인증 모델 재설계 + DX 개선 완료 (2026-02-07). 3개 페이즈, 9개 플랜, 24개 요구사항, 4개 신규 문서(52-55) + 11개 기존 문서 수정.
v0.6 블록체인 기능 확장 설계 완료 (2026-02-08). 4개 페이즈, 11개 플랜, 30개 요구사항, 9개 신규 문서(56-64) + 기존 8개 문서 v0.6 통합.
v0.7 구현 장애 요소 해소 완료 (2026-02-08). 5개 페이즈, 11개 플랜, 25개 요구사항, 기존 9개 설계 문서 직접 수정.
v0.8 Owner 선택적 등록 + 점진적 보안 모델 완료 (2026-02-09). 5개 페이즈, 11개 플랜, 33개 요구사항, 14개 설계 문서 v0.8 통합(240 [v0.8] 태그).
v0.9 MCP 세션 관리 자동화 설계 완료 (2026-02-09). 5개 페이즈, 10개 플랜, 21개 요구사항, 7개 설계 문서 v0.9 통합(85 [v0.9] 태그), 34 설계 결정.

v0.10 구현 전 설계 완결성 확보 완료 (2026-02-09). 4개 페이즈, 10개 플랜, 12개 요구사항, 설계 문서 11개 직접 수정, 22 설계 결정.

v1.0 구현 계획 수립 완료 (2026-02-09). 3개 페이즈, 5개 플랜, 10개 요구사항, 8개 objective 문서(v1.1~v2.0), 설계 부채 추적 초기화, 37개 설계 문서 전수 매핑 검증.

**누적:** 11 milestones (v0.1-v1.0), 47 phases, 115 plans, 286 requirements, 30 설계 문서 (24-64), 8 objective 문서

**기술 스택 (v0.2 확정, v0.6 확장 설계 완료, v0.7 의존성 정리):**
- Runtime: Node.js 22 LTS
- Server: Hono 4.x (OpenAPIHono)
- DB: SQLite (better-sqlite3) + Drizzle ORM
- Crypto: sodium-native (guarded memory), argon2 (KDF), jose (JWT)
- Chain: @solana/kit 3.x (Solana), viem 2.x (EVM stub)
- Chain 확장: @solana-program/token (SPL), Jupiter Aggregator API
- Oracle: CoinGecko API, Pyth Network, Chainlink (v0.6 설계)
- Test: Hardhat/Anvil (EVM 로컬 노드, v0.6 설계)
- Desktop: Tauri 2.x + React 18 + TailwindCSS 4
- Schema: Zod SSoT → TypeScript → OpenAPI 3.0

**설계 문서:** 30개 (deliverables 24-64.md) + 5개 대응표 (41-45.md) + 11개 테스트 전략 (41-51.md) + 1개 확장 테스트 전략 (64.md)
- v0.7 보완: ethers/siwe → viem/siwe 전환, 5개 타겟 플랫폼 확정, prebuildify 네이티브 번들 전략
- v0.8 통합: Owner 선택적 등록(3-State), APPROVAL 다운그레이드, sweepAll, withdraw API, 18x3 매트릭스 SSoT
- v0.9 통합: SessionManager 핵심/MCP 통합, CLI mcp/Telegram /newsession, SESSION_EXPIRING_SOON, 7개 문서 85 [v0.9] 태그

### 알려진 이슈

- Node.js SEA + native addon (sodium-native, better-sqlite3) 크로스 컴파일 호환성 미검증 (v0.4 스파이크, v0.7 prebuildify 전략 설계 완료)

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
| AWS KMS + Nitro Enclaves + Squads 하이브리드 | 5년 36% 비용 절감, 벤더 락인 방지 | ✓ Good → Self-Hosted로 전환 (v0.2) |
| Turnkey 결정 철회 → 직접 구축 | Phase 2 분석 결과 직접 구축이 비용/기능 모두 우위 | ✓ Good |
| Hono + SQLite (v0.2 전환) | Self-Hosted 경량화, 외부 의존 최소화 | ✓ Good |
| Dual Key 아키텍처 | Owner(통제) + Agent(자율) 역할 분리, defense-in-depth | ✓ Good |
| Cloud → Self-Hosted 전환 | 서비스 제공자 의존 제거, 사용자 완전 통제 | ✓ Good — v0.2 설계 완성 |
| 3계층 보안 (세션→시간지연→모니터링) | 다층 방어, 키 유출 시에도 피해 최소화 | ✓ Good — v0.2 설계 완성 |
| 체인 무관 정책 엔진 | Squads 등 온체인 의존 제거, 모든 체인에 동일 보안 | ✓ Good — v0.2 설계 완성 |
| 세션 기반 에이전트 인증 | 영구 키 대신 단기 JWT, 유출 시 만료로 자동 무효화 | ✓ Good — v0.2 설계 완성 |
| Zod SSoT | 스키마 → 타입 + OpenAPI + 런타임 검증 통합 | ✓ Good |
| Budget Pool + Hub-and-Spoke | 다수 에이전트 효율적 관리, 예산 격리 | ✓ Good |
| 기본 포트 3100 | 3000/3001/8080 충돌 회피 | ✓ Good — v0.3 통일 |
| DB 8개 TransactionStatus SSoT | 클라이언트 표시는 상태+tier 조합 | ✓ Good — v0.3 통일 |
| Docker hostname z.union | 기본 127.0.0.1, Docker 0.0.0.0 오버라이드 | ✓ Good — v0.3 통일 |
| Enum SSoT 대응표 | DB CHECK = Drizzle = Zod = TypeScript 1:1 | ✓ Good — v0.3 통일 |
| config.toml 중첩 섹션 | security.auto_stop, policy_defaults, kill_switch | ✓ Good — v0.3 통일 |
| rate_limit 3-level | global 100, session 300, tx 10 RPM | ✓ Good — v0.3 통일 |
| ownerAuth 9단계 미들웨어 | 라우트 레벨 미들웨어로 분리 | ✓ Good — v0.3 통일 |
| MCP 의도적 미커버 24개 | 보안 원칙: AI 에이전트에 Owner/Admin 권한 미노출 | ✓ Good — v0.3 확정 |
| Telegram Tier 2 TELEGRAM_PRE_APPROVED | SIWS는 Desktop/CLI 필수, Telegram은 알림+방어 채널 | ✓ Good — v0.3 확정 |

| 테스트 전략 선행 수립 | 구현 전 "무엇을 테스트할지" 확정 → 테스트 불가 설계 사전 발견 | ✓ Good — v0.4 완성 (300+ 시나리오) |
| IClock/ISigner 인터페이스 추가 | 테스트 격리를 위한 시간/서명 추상화 필요 | ✓ Good — v0.4 스펙 확정 |
| Enum SSoT 단방향 파생 체인 | as const -> TS -> Zod -> Drizzle -> DB CHECK | ✓ Good — v0.4 빌드타임 검증 |
| CI/CD 4단계 파이프라인 | push/PR/nightly/release 분리 | ✓ Good — v0.4 설계 |
| Soft/Hard 커버리지 게이트 | 초기 유연성 후 점진적 엄격화 | ✓ Good — v0.4 전환 우선순위 6단계 |
| masterAuth/ownerAuth 책임 분리 | Owner 서명은 자금 영향 시에만 요구, 로컬 관리는 마스터 패스워드 | ✓ Good — v0.5 설계 완성 |
| Owner 주소 에이전트별 귀속 | 멀티Owner/멀티체인 자연 지원, 에이전트간 Owner 격리 | ✓ Good — v0.5 설계 완성 |
| 세션 낙관적 갱신 | 에이전트 자율성 보장 + Owner 사후 거부권 | ✓ Good — v0.5 설계 완성 |
| WalletConnect 선택적 전환 | 초기 설정 마찰 제거, CLI 수동 서명으로 모든 기능 동작 | ✓ Good — v0.5 설계 완성 |

| IChainAdapter 저수준 유지 | 어댑터는 실행 엔진, DeFi 지식은 Action Provider에 분리 | ✓ Good — v0.6 설계 완성 |
| resolve-then-execute 패턴 | Action Provider가 요청 생성 → 파이프라인이 정책 평가 후 실행 | ✓ Good — v0.6 설계 완성 |
| 임의 컨트랙트 기본 거부 | CONTRACT_WHITELIST 비어있으면 모든 호출 거부 (opt-in) | ✓ Good — v0.6 설계 완성 |
| approve 독립 정책 카테고리 | 권한 위임은 전송보다 위험, 별도 정책 규칙 필요 | ✓ Good — v0.6 설계 완성 |
| USD 기준 정책 평가 | 토큰 종류 무관하게 달러 금액으로 티어 분류 | ✓ Good — v0.6 설계 완성 |

| Solana blockhash freshness guard | sign 직전 잔여 수명 < 20초이면 갱신, 경쟁 조건 제거 | ✓ Good — v0.7 해소 |
| AES-GCM nonce 충돌 구조적 불가능 | 매번 새 salt→새 AES 키→n=1, Birthday Problem 전제 미충족 | ✓ Good — v0.7 정정 |
| JWT Secret dual-key 5분 윈도우 | 로테이션 시 기존 세션 즉시 무효화 방지, 운영 단순성 | ✓ Good — v0.7 해소 |
| flock 기반 인스턴스 잠금 | OS 커널 원자적 잠금, PID TOCTOU 제거, Windows 포트 바인딩 fallback | ✓ Good — v0.7 해소 |
| Rate Limiter 2단계 분리 | 미인증 공격자가 인증 사용자 rate limit 소진 불가 | ✓ Good — v0.7 해소 |
| Master Password Argon2id 통일 | SHA-256 폐기, X-Master-Password 평문 (localhost only) | ✓ Good — v0.7 해소 |
| SIWE viem/siwe 전환 | ethers 130KB+ 제거, 3단계 검증 (parse→validate→verify) | ✓ Good — v0.7 해소 |
| Tauri sidecar 종료 35초 | 데몬 30초 + 5초 마진, SQLite WAL 손상 방지 | ✓ Good — v0.7 해소 |
| config.toml 중첩 섹션 금지 | WAIAAS_{SECTION}_{KEY} 1:1 매핑 단순성 | ✓ Good — v0.7 해소 |
| SQLite 타임스탬프 초 단위 통일 | UUID v7 ms 정밀도가 동일 초 내 순서 보장 | ✓ Good — v0.7 해소 |

| Owner 선택적 등록 | 자율 에이전트 시나리오 지원, 초기 온보딩 마찰 제거 | ✓ Good — v0.8 설계 완성 |
| 점진적 보안 해금 (3-State) | NONE/GRACE/LOCKED 3단계, ownerAuth 사용 시점 기반 전이 | ✓ Good — v0.8 설계 완성 |
| APPROVAL→DELAY 다운그레이드 | Owner 없어도 차단 없이 DELAY로 대체, 알림에 등록 안내 포함 | ✓ Good — v0.8 설계 완성 |
| sweepAll masterAuth만 | 수신 주소 = owner_address 고정이므로 공격자 이득 없음 | ✓ Good — v0.8 설계 완성 |
| Kill Switch withdraw 허용 (방안 A) | killSwitchGuard 5번째 허용 경로, Owner 자금 회수 보장 | ✓ Good — v0.8 설계 완성 |
| OwnerState 런타임 파생 | DB 비저장, resolveOwnerState() 순수 함수로 SSoT 유지 | ✓ Good — v0.8 설계 완성 |
| write-then-rename 원자적 쓰기 | Node.js 내장 API, 외부 의존 없이 POSIX rename 원자성 활용 | ✓ Good — v0.9 설계 완성 |
| SessionManager Composition 패턴 | MCP SDK 독립, 단일 클래스 4 public 메서드 | ✓ Good — v0.9 설계 완성 |
| safeSetTimeout 32-bit overflow 방어 | setTimeout 24.8일 한계 회피, 재귀 분할 래퍼 | ✓ Good — v0.9 설계 완성 |
| 파일-우선 쓰기 순서 | writeMcpToken → 메모리 교체, 프로세스 kill 복구 보장 | ✓ Good — v0.9 설계 완성 |
| Mutex 미사용, 50ms 대기 | Node.js 단일 스레드, 차단 지연 방지 | ✓ Good — v0.9 설계 완성 |
| console.error 통일 (stdout 금지) | stdio stdout 오염 → JSON-RPC 파싱 실패 방지 | ✓ Good — v0.9 설계 완성 |
| resolveDefaultConstraints 공용 함수 | CLI + Telegram constraints 결정 규칙 SSoT | ✓ Good — v0.9 설계 완성 |
| APPROVAL 타임아웃 3단계 우선순위 | 정책별 > config > 3600초 하드코딩 fallback | ✓ Good — v0.10 완결 |
| ChainError category 3-카테고리 | PERMANENT/TRANSIENT/STALE, category→retryable 자동 파생 | ✓ Good — v0.10 완결 |
| 에러 코드 통합 매트릭스 SS10.12 SSoT | 도메인별 분산에서 단일 통합 테이블로 | ✓ Good — v0.10 완결 |
| Stage 5 TRANSIENT 재시도 실패 단계 재진입 | 5b/5d 실패 시 해당 단계에서만 재시도 | ✓ Good — v0.10 완결 |
| 세션 갱신 token_hash CAS 낙관적 잠금 | RENEWAL_CONFLICT(409) retryable:false | ✓ Good — v0.10 완결 |
| Kill Switch CAS BEGIN IMMEDIATE 첫 문장 원칙 | 모든 상태 전이 원자성 보장 | ✓ Good — v0.10 완결 |
| 데몬 Step 4만 fail-soft | 체인 어댑터 부분 실패 허용, 나머지 fail-fast | ✓ Good — v0.10 완결 |
| Batch 부모-자식 2계층 DB | metadata JSON→정규화, ON DELETE CASCADE | ✓ Good — v0.10 완결 |
| Oracle 교차 검증 동기 인라인 | 비동기 백그라운드→getPrice() 동기 인라인 전환 | ✓ Good — v0.10 완결 |
| 가격 나이 3단계 FRESH/AGING/STALE | STALE(>30분) USD 평가 스킵→네이티브 전용 | ✓ Good — v0.10 완결 |
| 구현 마일스톤 8개 순서 확정 | 의존 그래프: 코어→인증→SDK→토큰→DeFi→클라이언트→품질→릴리스 | ✓ Good — v1.0 계획 |
| objective 문서 7-section 부록 구조 | 목표/설계문서/산출물/기술결정/E2E/의존/리스크 통일 | ✓ Good — v1.0 계획 |
| 설계 부채 Tier 1~3 추적 체계 | 매 마일스톤 리뷰, v2.0 전 0건 달성 목표 | ✓ Good — v1.0 계획 |

---
*최종 업데이트: 2026-02-10 after v1.1 milestone start*
