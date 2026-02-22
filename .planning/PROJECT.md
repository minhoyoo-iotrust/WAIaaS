# WAIaaS: AI 에이전트를 위한 Wallet-as-a-Service

## 이것이 무엇인가

중앙 서버 없이 사용자가 직접 설치하여 운영하는 오픈소스(MIT) AI 에이전트 지갑 시스템. 체인 무관(Chain-Agnostic) 3계층 보안 모델(세션 인증 → 시간 지연+AutoStop → 모니터링+Kill Switch)로 에이전트 해킹이나 키 유출 시에도 피해를 최소화한다. npm(`@waiaas/*` 10개 패키지) / Docker(`waiaas/daemon`, `waiaas/push-relay`) / CLI로 배포하며, REST API(60+ 엔드포인트), TypeScript/Python SDK, MCP 통합(18+ 도구), Telegram Bot 원격 관리를 통해 모든 에이전트 프레임워크에서 사용 가능하다. 멀티체인 환경 모델(1 월렛 = 1 체인 + 1 환경)로 하나의 EVM 월렛이 5개 네트워크에서 동작하며, ALLOWED_NETWORKS 정책으로 네트워크를 제한할 수 있다. **1:N 멀티 지갑 세션 모델**로 하나의 세션 토큰이 여러 지갑에 접근하고, GET /v1/connect-info 자기 발견 엔드포인트로 에이전트가 마스터 패스워드 없이 접근 가능 지갑/정책/capabilities를 파악한다. WalletConnect v2로 외부 지갑(MetaMask/Phantom) 연결하여 QR 스캔 기반 Owner 승인이 가능하며, WC 실패 시 Telegram Bot으로 자동 전환된다. Admin Web UI(`/admin`)는 7개 기능별 메뉴(Dashboard/Wallets/Sessions/Policies/Notifications/Security/System)로 구성되며, Ctrl+K 설정 검색/미저장 경고/필드 description help text 등 DX를 제공한다. @waiaas/push-relay로 ntfy 토픽을 기존 푸시 인프라(Pushwoosh/FCM)로 변환·전달하여, 지갑 앱이 기존 푸시 파이프라인만으로 서명 요청과 알림을 수신할 수 있다. CAIP-19 표준 자산 식별자로 토큰을 체인/네트워크/주소 차원에서 고유하게 식별하며, DB/정책/오라클/API 전 레이어가 assetId를 지원한다(하위 호환 유지). 자동 버전 체크 + CLI update 7단계 시퀀스로 안전한 업그레이드가 가능하고, release-please 2-게이트 릴리스 모델 + workflow_dispatch RC 승격 자동화로 배포를 지원한다. v2.0.0-rc.1 pre-release 발행 완료.

## 핵심 가치

**AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다** — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서. 서비스 제공자 의존 없이 사용자가 완전한 통제권을 보유한다.

## Current State

v27.2 CAIP-19 자산 식별 표준 shipped (2026-02-22). 11-패키지 모노레포 + Python SDK, ~157,584 LOC TypeScript, 4,396+ 테스트 통과. MIT 라이선스, npm 10개 패키지(@waiaas/push-relay 추가) OIDC Trusted Publishing 발행, Sigstore provenance 배지 확보, Docker Hub/GHCR dual push(daemon + push-relay), 설계 문서 47개(신규 73/74/75 + 기존 44개 갱신) 교차 검증 PASS, 설계 부채 0건, 영문 README + CONTRIBUTING + 배포 가이드 + API 레퍼런스 + CHANGELOG 완비, @waiaas/skills npx 패키지 + examples/simple-agent 예제. CLI로 init → start → quickstart --mode testnet/mainnet → 세션 생성 → 정책 설정(USD 기준, 12개 타입별 전용 폼, 누적 지출 한도 daily/monthly, 표시 통화 43개) → SOL/SPL/ETH/ERC-20 전송(네트워크 선택, USD 환산 정책 평가) → 컨트랙트 호출 → Approve → 배치 → 외부 dApp unsigned tx 서명(sign-only) → Action Provider 플러그인 실행 → x402 유료 API 자동 결제 → Owner 승인/거절(SIWS/SIWE + WalletConnect v2 QR 페어링 + 서명 요청 + Telegram Fallback 자동 전환) + Kill Switch 3-state 긴급 정지(6-step cascade + dual-auth 복구) + AutoStop 4-규칙 자동 정지 엔진 + 잔액 모니터링(LOW_BALANCE 사전 알림) + Telegram Bot 원격 관리(10개 명령어 + 2-Tier 인증 + i18n) + SDK/MCP로 프로그래밍 접근(18개 도구 + 스킬 리소스 + Action Provider 동적 도구) + Telegram/Discord/ntfy/Slack 알림(APPROVAL_CHANNEL_SWITCHED 추가) + Admin Web UI(`/admin`) 관리(Kill Switch 3-state UI + WalletConnect 세션 관리 페이지 + Telegram Users 관리 + AutoStop/Monitoring Settings + 12개 정책 폼 + PolicyRulesSummary 시각화) + Docker 원클릭 배포(Multi-stage + Secrets + non-root) + 토큰 레지스트리 관리 + API 스킬 파일(skills/ 7개) 제공까지 동작. **v1.8에서 추가:** VersionCheckService npm registry 24h 주기 자동 체크 + CLI stderr 업그레이드 알림(24h dedup, --quiet) + `waiaas upgrade` 7단계 시퀀스(--check/--to/--rollback) + BackupService DB+config 백업/복원(5개 보존) + 호환성 매트릭스(코드-DB 스키마 3-시나리오 판별) + Health API 확장(latestVersion/updateAvailable/schemaVersion) + Docker Watchtower+OCI 라벨 + GHCR 3-tier 태깅 + release-please 2-게이트 릴리스(Conventional Commits→Release PR→deploy 수동 승인) + SDK HealthResponse 타입 + 19건 E2E 통합 테스트.

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
- ✅ v1.5 DeFi Price Oracle + Action Provider Framework — shipped 2026-02-15 (1,848 tests, ~185,000 LOC)
- ✅ v1.5.1 x402 클라이언트 지원 — shipped 2026-02-15 (2,058 tests, ~187,000 LOC)
- ✅ v1.5.2 Admin UI 정책 폼 UX 개선 — shipped 2026-02-16 (2,111 tests, ~188,000 LOC)
- ✅ v1.5.3 USD 정책 확장 (누적 지출 한도 + 표시 통화) — shipped 2026-02-16 (~2,150 tests, ~191,000 LOC)
- ✅ v1.6 운영 인프라 + 잔액 모니터링 — shipped 2026-02-16 (~2,294 tests, ~207,902 LOC)
- ✅ v1.6.1 WalletConnect Owner 승인 — shipped 2026-02-16 (~2,510 tests, ~220,000 LOC)
- ✅ v1.7 품질 강화 + CI/CD — shipped 2026-02-17 (3,509 tests, ~237,000 LOC)
- ✅ v1.8 업그레이드 + 배포 인프라 — shipped 2026-02-17 (3,599 tests, ~124,712 LOC TS)
- ✅ v2.0 전 기능 완성 릴리스 — shipped 2026-02-18 (~3,599 tests, ~124,830 LOC TS)
- ✅ v2.2 테스트 커버리지 강화 — shipped 2026-02-18 (281 신규 tests, ~142,639 LOC TS)
- ✅ v2.3 Admin UI 기능별 메뉴 재구성 — shipped 2026-02-18 (11 plans, 39 requirements, ~145,784 LOC TS)
- ✅ v2.4 npm Trusted Publishing 전환 — shipped 2026-02-19 (4 plans, 12 requirements, ~146,464 LOC TS)
- ✅ v2.4.1 Admin UI 테스트 커버리지 복원 — shipped 2026-02-19 (5 plans, 22 requirements, ~151,015 LOC TS)
- ✅ v2.5 DX 품질 개선 — shipped 2026-02-19 (8 plans, 23 requirements)
- ✅ v2.6 Wallet SDK 설계 — shipped 2026-02-20 (7 plans, 23 requirements, 34 설계 결정, 설계 문서 3개 신규)
- ✅ v2.6.1 WAIaaS Wallet Signing SDK — shipped 2026-02-20 (13 plans, 27 requirements, 4,323 tests, ~138,051 LOC TS)
- ✅ v2.7 지갑 앱 알림 채널 — shipped 2026-02-20 (4 plans, 16 requirements, ~161,634 LOC TS)
- ✅ v26.3 Push Relay Server — shipped 2026-02-20 (8 plans, 25 requirements, ~163,416 LOC TS)
- ✅ v26.4 멀티 지갑 세션 + 에이전트 자기 발견 — shipped 2026-02-21 (15 plans, 30 requirements, ~145,704 LOC TS)
- ✅ v27.0 수신 트랜잭션 모니터링 설계 — shipped 2026-02-21 (16 plans, 29 requirements, 26 설계 결정, docs 76)
- ✅ v27.1 수신 트랜잭션 모니터링 구현 — shipped 2026-02-22 (18 plans, 30 requirements, ~155,540 LOC TS)
- ✅ v27.2 CAIP-19 자산 식별 표준 — shipped 2026-02-22 (9 plans, 31 requirements, ~157,584 LOC TS)

**코드베이스 현황:**
- 11-패키지 모노레포: @waiaas/core, @waiaas/daemon, @waiaas/adapter-solana, @waiaas/adapter-evm, @waiaas/cli, @waiaas/sdk, @waiaas/wallet-sdk, @waiaas/mcp, @waiaas/admin, @waiaas/push-relay + waiaas (Python)
- ~157,584 LOC TypeScript (ESM-only, Node.js 22, Admin UI ~20,000 LOC, Push Relay ~1,782 LOC)
- 4,396+ 테스트 (core + adapter-solana + adapter-evm + daemon + CLI + SDK + wallet-sdk + MCP + admin + push-relay)
- pnpm workspace + Turborepo, Vitest, ESLint flat config, Prettier
- OpenAPIHono 50 엔드포인트, GET /doc OpenAPI 3.0 자동 생성
- 7개 API 스킬 파일 (skills/ 디렉토리) — quickstart/wallet/transactions/policies/admin/actions/x402 + MCP 스킬 리소스(waiaas://skills/{name})
- IChainAdapter 22 메서드, discriminatedUnion 5-type 파이프라인, 12 PolicyType, WalletConnect v2 서명 요청
- IPriceOracle — Pyth Hermes + CoinGecko OracleChain fallback, USD 기준 정책 평가
- IActionProvider — ESM 플러그인 프레임워크, ActionProviderRegistry, MCP Tool 자동 변환
- AdapterPool 멀티체인 (Solana + EVM), secp256k1 멀티커브 키스토어, Owner Auth SIWE/SIWS
- EnvironmentType SSoT (testnet/mainnet) + 환경-네트워크 매핑 + resolveNetwork() 파이프라인
- TokenRegistryService: 5 EVM 메인넷 24개 내장 토큰 + 커스텀 토큰 CRUD
- MCP 23개 내장 도구 (수신 TX 조회 2개 추가) + Action Provider 동적 도구 + 7개 스킬 리소스
- 기본 거부 정책 토글 3개 (default_deny_tokens/contracts/spenders)
- IForexRateService CoinGecko tether 기반 43개 법정 통화 환산 + display_currency
- 누적 USD 지출 한도 (CUMULATIVE_SPENDING_DAILY/MONTHLY 롤링 윈도우, APPROVAL 격상, 80% 경고)
- 알림 4채널 (Telegram/Discord/ntfy/Slack) + 지갑 앱 ntfy 사이드 채널(6 카테고리, priority 기반) + 메시지 저장/조회 + DB v13
- API 키 관리 — DB 암호화 저장(HKDF+AES-256-GCM), Admin UI CRUD
- pushSchema 3-step 순서 (tables→migrations→indexes) + 마이그레이션 체인 테스트
- MCP graceful shutdown (stdin 감지 + force-exit 타임아웃)
- EventBus(EventEmitter) + Kill Switch 3-state(ACTIVE/SUSPENDED/LOCKED, CAS ACID, 6-step cascade)
- AutoStopService 4-규칙 자동 정지 (CONSECUTIVE_FAILURES/UNUSUAL_ACTIVITY/IDLE_TIMEOUT/MANUAL_TRIGGER)
- BalanceMonitorService 5분 주기 잔액 체크 + LOW_BALANCE 알림 (24h 중복 방지)
- TelegramBotService Long Polling + 10개 명령어 + 2-Tier 인증(ADMIN/READONLY/PENDING) + i18n(en/ko)
- Docker 배포 (Multi-stage Dockerfile, docker-compose.yml, Docker Secrets _FILE 패턴, non-root UID 1001)
- @waiaas/wallet-sdk (8개 공개 함수, SSE 자동 재연결, node>=18 engine) — subscribeToNotifications/parseNotification 추가
- Signing Protocol v1 (SignRequest/SignResponse, base64url, owner_approval_method 5-value)
- WalletNotificationChannel 사이드 채널 (26 이벤트 → 6 카테고리, priority 기반, 기존 채널과 독립 병행)
- ApprovalChannelRouter 5단계 우선순위 (SDK ntfy > SDK Telegram > WC > Telegram Bot > REST)
- DB v19 마이그레이션 (session_wallets junction + sessions.wallet_id 제거)
- 1:N 세션 모델 (session_wallets junction, resolveWalletId 3단계 우선순위)
- GET /v1/connect-info 자기 발견 (capabilities 동적 결정, 자연어 프롬프트)
- IChainSubscriber 6-method + SolanaIncomingSubscriber/EvmIncomingSubscriber + IncomingTxMonitorService (큐+멀티플렉서+안전규칙+KillSwitch)
- incoming_transactions/incoming_tx_cursors DB v21 + wallets.monitor_incoming opt-in
- GET /v1/wallet/incoming + /summary REST API + TS/Python SDK + MCP 2 tools + Admin IncomingSettings
- CAIP-19 자산 식별: caip/ 모듈(~240 LOC), 13-네트워크 양방향 맵, TokenRef assetId 확장, DB v22 token_registry.asset_id, 4-시나리오 ALLOWED_TOKENS 매칭, 가격 오라클 L2(Polygon/Arbitrum/Optimism/Base) 지원
- 설계 문서 40개 (24-76), 8 objective 문서

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

(v1.1~v1.8 구현 검증됨 — 상세 생략, milestones/ 아카이브 참조)

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

- ✓ IPriceOracle 인터페이스 (getPrice/getPrices/getNativePrice/getCacheStats Zod SSoT) — v1.5 (ORACL-01)
- ✓ PythOracle Pyth Hermes REST API Zero-config 가격 조회 — v1.5 (ORACL-02)
- ✓ CoinGeckoOracle Demo API opt-in 롱테일 토큰 가격 조회 — v1.5 (ORACL-03)
- ✓ OracleChain Pyth→CoinGecko 2단계 fallback 가격 제공 — v1.5 (ORACL-04)
- ✓ InMemoryPriceCache 5분 TTL LRU 128항목 + stampede prevention — v1.5 (ORACL-05)
- ✓ classifyPriceAge FRESH/AGING/STALE 3단계 판정 — v1.5 (ORACL-06)
- ✓ OracleChain 교차 검증 편차>5% STALE 격하 — v1.5 (ORACL-07)
- ✓ GET /v1/admin/oracle-status 오라클 캐시 통계 + 소스별 상태 — v1.5 (ORACL-08)
- ✓ resolveEffectiveAmountUsd 5-type USD 환산 — v1.5 (USDPL-01)
- ✓ SpendingLimitRuleSchema instant_max_usd/notify_max_usd/delay_max_usd Zod SSoT — v1.5 (USDPL-02)
- ✓ PriceResult success/oracleDown/notListed 3-state discriminated union — v1.5 (USDPL-03)
- ✓ 가격 불명 토큰 NOTIFY 격상 + UNLISTED_TOKEN_TRANSFER 감사 로그 — v1.5 (USDPL-04)
- ✓ 오라클 장애 시 graceful fallback (네이티브 금액만 정책 평가) — v1.5 (USDPL-05)
- ✓ 가격 불명 토큰 + CoinGecko 키 미설정 시 최초 1회 힌트 — v1.5 (USDPL-06)
- ✓ IActionProvider metadata/actions/resolve 3메서드 인터페이스 — v1.5 (ACTNP-01)
- ✓ ActionProviderRegistry ~/.waiaas/actions/ ESM 플러그인 발견/로드/검증 — v1.5 (ACTNP-02)
- ✓ resolve() ContractCallRequestSchema Zod 재검증 정책 우회 차단 — v1.5 (ACTNP-03)
- ✓ POST /v1/actions/:provider/:action Action Provider resolve → 파이프라인 실행 — v1.5 (ACTNP-04)
- ✓ ActionDefinition→MCP Tool 자동 변환 mcpExpose=true — v1.5 (ACTNP-05)
- ✓ 프로바이더 등록/해제 시 MCP 도구 동적 추가/제거 — v1.5 (ACTNP-06)
- ✓ api_keys 테이블 DB v11 암호화 저장 — v1.5 (APIKY-01)
- ✓ GET/PUT/DELETE /v1/admin/api-keys CRUD (마스킹) — v1.5 (APIKY-02)
- ✓ requiresApiKey=true 프로바이더 키 미설정 시 비활성화 — v1.5 (APIKY-03)
- ✓ Admin UI API Keys 섹션 설정/수정/삭제 — v1.5 (APIKY-04)
- ✓ 설계 문서 61 Pyth Primary + CoinGecko Fallback + Chainlink 제거 — v1.5 (DSGN-01)
- ✓ 설계 문서 62 MCP 16개 상한 제거 + 14개 도구 현행화 — v1.5 (DSGN-02)
- ✓ 설계 문서 38 MCP 상한 제거 + 현행화 — v1.5 (DSGN-03)
- ✓ admin.skill.md oracle-status + api-keys 엔드포인트 문서화 — v1.5 (SKIL-01)
- ✓ actions.skill.md Action Provider REST API 문서화 신규 생성 — v1.5 (SKIL-02)

- ✓ x402 자동 결제 파이프라인 — SSRF 가드, HTTP 402 파싱, EIP-3009/TransferChecked 결제 서명, POST /v1/x402/fetch REST API — v1.5.1
- ✓ X402_ALLOWED_DOMAINS 기본 거부 정책 + SPENDING_LIMIT 4-tier USD 환산 통합 — v1.5.1
- ✓ TS/Python SDK x402Fetch/x402_fetch + MCP x402_fetch 도구 + x402.skill.md — v1.5.1

- ✓ 12개 PolicyType Zod rules 스키마 전체 등록 (4개 미등록 타입 추가) — v1.5.2 (VALID-01)
- ✓ DynamicRowList 재사용 컴포넌트 + PolicyFormRouter 12-type 분기 라우터 — v1.5.2 (FORM-01~04)
- ✓ 12개 PolicyType 전용 폼 컴포넌트 (SPENDING_LIMIT~X402_ALLOWED_DOMAINS) — v1.5.2 (PFORM-01~12)
- ✓ 폼 실시간 유효성 검증 + 에러 표시 — v1.5.2 (VALID-02~03)
- ✓ PolicyRulesSummary 12-type 목록 시각화 (심볼 배지, req/time, tier bars) — v1.5.2 (VIS-01~03)
- ✓ 수정 모달 전용 폼 프리필/저장 통합 — v1.5.2 (EDIT-01~02)

- ✓ CUMULATIVE_SPENDING_DAILY/MONTHLY 12번째 PolicyType 추가 — v1.5.3 (CUMUL-01~04)
- ✓ 롤링 윈도우 USD 누적 지출 계산 + APPROVAL 격상 + 80% 경고 알림 — v1.5.3 (CUMUL-05~08)
- ✓ IForexRateService CoinGecko tether 기반 43개 법정 통화 환산 — v1.5.3 (FOREX-01~04)
- ✓ display_currency 월렛별 표시 통화 + Admin UI 설정 — v1.5.3 (FOREX-05~07)
- ✓ DB 마이그레이션 v13 (amount_usd, reserved_amount_usd 컬럼) — v1.5.3 (DB-01)

- ✓ EventBus 이벤트 인프라 + 파이프라인/라우트 이벤트 발행 (EVNT-01~03) — v1.6
- ✓ Kill Switch 3-state 상태 머신 + CAS ACID + 6-step cascade + dual-auth 복구 + REST API + 미들웨어 (KILL-01~10) — v1.6
- ✓ AutoStop 4-규칙 자동 정지 엔진 + config/Admin Settings hot-reload + 알림 통합 (AUTO-01~06) — v1.6
- ✓ BalanceMonitorService 잔액 체크 + LOW_BALANCE 알림 + 중복 방지 + config/Admin Settings (BMON-01~06) — v1.6
- ✓ Telegram Bot Long Polling + 10개 명령어 + 2-Tier 인증 + i18n + DB v15 마이그레이션 (TGBOT-01~14) — v1.6
- ✓ Admin UI Kill Switch 3-state + Telegram Users 관리 + AutoStop/Monitoring Settings (ADUI-01~04) — v1.6
- ✓ Docker Multi-stage + docker-compose + Secrets + HEALTHCHECK + non-root (DOCK-01~06) — v1.6

- ✓ WalletConnect SignClient 인프라 — DB v16, SqliteKeyValueStorage, DaemonLifecycle fail-soft, Admin Settings hot-reload (INFRA-01~05) — v1.6.1
- ✓ QR 페어링 + REST API 4개 엔드포인트 — pairing URI→QR base64, CAIP-2 13 네트워크, Admin QR 모달, CLI owner connect (PAIR-01~06) — v1.6.1
- ✓ WcSigningBridge 서명 요청 — stage4Wait fire-and-forget WC 연동, SIWE/Ed25519 검증, approve/reject (SIGN-01~06) — v1.6.1
- ✓ Telegram Fallback 자동 전환 — WC→Telegram 자동 전환, 단일 승인 소스, APPROVAL_CHANNEL_SWITCHED 알림 (FALL-01~03) — v1.6.1
- ✓ WC DX 전체 인터페이스 — Admin WC 관리 페이지, MCP 3 도구, TS/Python SDK WC 메서드, Skill 파일 업데이트 (DX-01~04) — v1.6.1

- ✓ Vitest v8 커버리지 인프라 + Turborepo 5개 태스크 분리 + Mock 10개 경계(M1-M10) 완성 — v1.7 (COV-01~03, MOCK-01)
- ✓ 16개 Enum SSoT 4단계 빌드타임 검증 + config.toml 12건 + NOTE 매핑 22건 — v1.7 (ENUM-01~03)
- ✓ 7개 인터페이스 Contract Test (IChainAdapter/IPolicyEngine/INotificationChannel/IClock/IPriceOracle/IActionProvider) — v1.7 (CTST-01~07)
- ✓ 블록체인 3단계 테스트 (Mock RPC 13건 + Solana Local Validator 5건 + EVM Anvil 3건 + Devnet 3건) — v1.7 (CHAIN-01~04)
- ✓ 3계층 보안 테스트 71건 (세션20/정책9/Kill Switch8/키스토어10/경계값24) — v1.7 (SEC-01~05)
- ✓ 확장 보안 테스트 ~178건 (토큰32/컨트랙트28/Approve24/배치22/Oracle20/Action16/Swap12/ChainError12/x402 12) — v1.7 (SEC-06~14)
- ✓ 확장 기능 테스트 154건 (토큰32/컨트랙트28/Approve24/배치22/Oracle20/Action16/ChainError12) — v1.7 (EXT-01~07)
- ✓ 플랫폼 테스트 84건 (CLI Daemon32/Docker18/Telegram34) — v1.7 (PLAT-01~03)
- ✓ GitHub Actions 4-stage CI/CD (push→PR→nightly→release) + Composite Action + coverage-gate.sh — v1.7 (CICD-01~06)

- ✓ VersionCheckService npm registry 24h 주기 버전 체크 + fail-soft + key_value_store 저장 — v1.8 (VCHK-01~04)
- ✓ Health API 확장 — latestVersion, updateAvailable, schemaVersion 3필드 + createHealthRoute DI — v1.8 (HLTH-01~02)
- ✓ CLI 업그레이드 알림 — stderr 박스, 24h 파일 mtime dedup, --quiet/WAIAAS_NO_UPDATE_NOTIFY 억제 — v1.8 (VCHK-05~07)
- ✓ BackupService DB+WAL/SHM+config.toml 백업/복원, 5개 보존 정책 — v1.8 (UPGR-03~04,06)
- ✓ waiaas upgrade 7단계 시퀀스 (--check/--to/--rollback/--no-start) — v1.8 (UPGR-01~02,05,07)
- ✓ 호환성 매트릭스 — checkSchemaCompatibility 3-시나리오(migrate/reject-code_too_old/reject-schema_too_old) + daemon Step 2 통합 — v1.8 (CMPT-01~03)
- ✓ Docker Watchtower+OCI 라벨 + GHCR 3-tier 태깅(latest/semver/major) — v1.8 (DOCK-01~02)
- ✓ release-please 2-게이트 릴리스 모델 — manifest+config+워크플로우, deploy environment: production, BREAKING CHANGE major 범프 — v1.8 (RLSE-01~08)
- ✓ SDK HealthResponse 타입 + 스킬 파일 동기화 + 19건 E2E 통합 테스트 — v1.8 (SYNC-01)

- ✓ 설계 문서 44개 구현 교차 검증 PASS + 설계 부채 0건 확인 — v2.0 (VERIFY-01~03)
- ✓ 보안 460건 + 커버리지 80%+ + Enum SSoT 16개 + 플랫폼 84건 + 블록체인 통합 테스트 전수 통과 — v2.0 (TEST-01~05)
- ✓ 문서 재편성(docs/사용자, docs-internal/설계) + README(en) + CONTRIBUTING + 배포 가이드 + API 레퍼런스 + CHANGELOG 완비 — v2.0 (DOC-01~08)
- ✓ @waiaas/skills npx 배포 패키지 + examples/simple-agent SDK 예제 — v2.0 (PKG-01~02)
- ✓ npm 8개 패키지 publish + Docker Hub push + release.yml 활성화 + v2.0.0-rc.1 pre-release — v2.0 (DEPLOY-01~04, RELEASE-01~03)
- ✓ adapter-solana 브랜치 커버리지 65% → 84.87% (49 신규 테스트) — v2.2 (SOL-01~04)
- ✓ admin 함수 커버리지 57.95% → 77.87% (195 신규 테스트) — v2.2 (ADM-01~04)
- ✓ CLI 라인/구문 커버리지 68.09% → 91.88% (37 신규 테스트) — v2.2 (CLI-01~02)
- ✓ 3개 패키지 커버리지 임계값 원래 수준 복원 (branches 65→75, functions 55→70, lines/statements 65→70) — v2.2 (GATE-01)

- ✓ Admin UI 7-메뉴 재구성 (Dashboard/Wallets/Sessions/Policies/Notifications/Security/System) — v2.3 (MENU-01~03)
- ✓ TabNav 공용 컴포넌트 + 5개 페이지 탭 적용 (Wallets 4탭/Sessions 2탭/Policies 2탭/Notifications 3탭/Security 3탭) — v2.3 (TAB-01~06)
- ✓ Security 페이지 (Kill Switch/AutoStop Rules/JWT Rotation 3탭) + System 페이지 — v2.3 (SEC-01~04, SYS-01~02)
- ✓ Settings 분산 배치 — 13개 항목을 Wallets/Sessions/Policies/Notifications 탭으로 이동 + 독립 dirty/save — v2.3 (DIST-01~06, NEW-01~03)
- ✓ Ctrl+K 설정 검색 — 54개 필드 정적 인덱스, 페이지+탭 네비게이션, 필드 하이라이트 — v2.3 (SRCH-01~03)
- ✓ FieldGroup fieldset+legend 시맨틱 래퍼 + Sessions/Notifications/Security 그룹화 — v2.3 (FGRP-01~04)
- ✓ Breadcrumb 네비게이션 (5개 탭 페이지에 페이지명 > 탭명 표시) — v2.3 (BCMB-01~03)
- ✓ PageHeader subtitle + FormField description help text 전 필드 적용 — v2.3 (DESC-01~02)
- ✓ 미저장 경고 3버튼 다이얼로그 (탭 전환 + 사이드바 메뉴 전환 인터셉트) — v2.3 (DIRTY-01~02)
- ✓ README Admin UI 섹션 7-메뉴 구조 갱신 — v2.3 (DOC-01)

- ✓ npm Trusted Publishing (OIDC) 전환 — 8개 패키지 NPM_TOKEN 제거, GitHub Actions OIDC 인증 — v2.4 (PREP-01~03, OIDC-01~05)
- ✓ Sigstore provenance 배지 확보 — 8개 패키지 "Built and signed on GitHub Actions" — v2.4 (VERIFY-01~02)
- ✓ NPM_TOKEN 시크릿 제거 + Deploy summary provenance 메타데이터 추가 — v2.4 (VERIFY-03~04)
- ✓ 8건 이슈 수정 — 마스터 패스워드 검증(#090), NotificationService always-init(#088), npm README 복사(#093), homepage/bugs URL(#092), 스킬 버전 동기화(#085), AI 연결 프롬프트(#087), JWT UI 텍스트(#089), quickset 별칭(#091) — v2.4 (quick tasks)

- ✓ security.tsx 3-tab (Kill Switch/AutoStop/JWT Rotation) 27 테스트 + walletconnect.tsx 16 테스트 — v2.4.1 (NEWPG-01~04, NEWPG-10~12)
- ✓ system.tsx 6-섹션 34 테스트 (API Keys CRUD/Daemon 설정/Danger Zone) — v2.4.1 (NEWPG-05~09)
- ✓ 공용 컴포넌트 5개 65 테스트 (EmptyState/dirty-guard/UnsavedDialog/SettingsSearch/PolicyRulesSummary) — v2.4.1 (COMP-01~05)
- ✓ 기존 페이지(sessions/notifications/wallets) 44 추가 테스트 커버리지 개선 — v2.4.1 (EXIST-01~03)
- ✓ vitest 커버리지 임계값 70% 복원 (실제: 92% lines, 84% branches, 77% functions) — v2.4.1 (INFRA-01~02)

- ✓ CLI --version 동적 버전 + engines.node >= 22 + init 패스워드 안내/config 템플릿/권한 에러 — v2.5 (CLI-01~05)
- ✓ 데몬 시작 EADDRINUSE 감지 + Step 로그 debug 하향 + Admin UI URL 한 줄 요약 — v2.5 (DAEMON-01~03)
- ✓ quickstart 영문 전환 + 409 멱등성 + 만료 표시 + availableNetworks 필드 수정 — v2.5 (QS-01~04)
- ✓ MCP setup 에러 안내 + 기본 만료(24h) 경고 + --expires-in 옵션 가이드 — v2.5 (DAEMON-04, MCP-01)
- ✓ README SDK 코드 필드 수정 + skill 파일 14개 버전 자동 치환 — v2.5 (README-01~02)
- ✓ CLI/SDK npm 패키지 README + docker-compose GHCR 이미지 + .env.example — v2.5 (SDK-01~02, DOCK-01~02)
- ✓ Python SDK 버전/포트 수정 + .venv gitignore — v2.5 (PY-01~03)

- ✓ WAIaaS Signing Protocol v1 설계 (SignRequest/SignResponse Zod 스키마, 유니버셜 링크, ntfy/Telegram 채널, 보안 모델) — v2.6 (PROTO-01~04)
- ✓ @waiaas/wallet-sdk 공개 API 6개 함수 시그니처 + WalletLinkConfig + 패키지 구조 확정 — v2.6 (WSDK-01~03)
- ✓ 데몬 서명 컴포넌트 인터페이스 확정 (SignRequestBuilder/SignResponseHandler/ISigningChannel/ApprovalChannelRouter 5단계 fallback) — v2.6 (DMON-01~05)
- ✓ 알림 채널 토픽 분리 + NotificationMessage + WalletNotificationChannel 통합 설계 — v2.6 (NOTIF-01~03)
- ✓ Push Relay Server 설계 (IPushProvider/Pushwoosh/FCM + ntfy SSE + Docker) — v2.6 (RELAY-01~04)
- ✓ 기존 설계 문서 4개(35/37/25/67) v2.6 갱신 + 교차 검증 5항목 PASS — v2.6 (DOCS-01~04)

- ✓ Signing Protocol v1 구현 (SignRequest/SignResponse Zod 스키마, base64url, DB v18 owner_approval_method, 7 에러 코드) — v2.6.1 (PROTO-01~05)
- ✓ NtfySigningChannel 양방향 SSE 서명 채널 + TelegramSigningChannel 인라인 버튼 + /sign_response — v2.6.1 (CHAN-01~07)
- ✓ @waiaas/wallet-sdk npm 패키지 — 6개 공개 함수 (parseSignRequest, buildSignResponse, formatDisplayMessage, sendViaNtfy, sendViaTelegram, subscribeToRequests) — v2.6.1 (SDK-01~06)
- ✓ WalletLinkRegistry + SettingsService signing_sdk.* 6개 키 + owner_approval_method REST/Admin UI — v2.6.1 (WALLET-01~07)
- ✓ ApprovalChannelRouter 5단계 우선순위 라우팅 + SDK 비활성 fallback + 데몬 라이프사이클 완전 연결 — v2.6.1 (CHAN-05~07)
- ✓ GET/PUT /admin/settings 11개 카테고리 노출 + Admin UI signing_sdk 설정 관리 + Skills 동기화 — v2.6.1 (CONF-01~02, WALLET-07)

- ✓ NotificationMessageSchema Zod SSoT + EVENT_CATEGORY_MAP (26 events → 6 categories) — v2.7 (SCHEMA-01~03)
- ✓ WalletNotificationChannel 사이드 채널 (sdk_ntfy 지갑 대상, 기존 채널과 독립 병행, priority 기반) — v2.7 (DAEMON-01~06)
- ✓ subscribeToNotifications/parseNotification SDK 함수 (ntfy SSE + base64url Zod 검증) — v2.7 (SDK-01~02)
- ✓ signing_sdk.notifications_enabled/notify_categories 설정 + Admin UI 멀티셀렉트 체크박스 — v2.7 (SETTINGS-01~03, ADMIN-01)
- ✓ wallet.skill.md Section 13 SDK 알림 함수 문서화 — v2.7 (SYNC-01)

- ✓ NtfySigningChannel base64url 인코딩 통일 + wallet-sdk 호환성 검증 — v26.3 (ENCODE-01~03)
- ✓ @waiaas/push-relay ntfy SSE 구독 + 메시지 파서 + config.toml/Zod 검증 — v26.3 (SUB-01~04, INFRA-05~06)
- ✓ IPushProvider + PushwooshProvider + FcmProvider (지수 백오프 재시도, invalid token 자동 삭제) — v26.3 (PUSH-01~07)
- ✓ Device Token Registry SQLite + REST API + API Key 인증 — v26.3 (REG-01~05)
- ✓ npm 패키지 빌드 + Docker 이미지 + release-please + CI/CD 파이프라인 통합 — v26.3 (INFRA-01~04)
- ✓ 1:N 세션 모델 (session_wallets junction, DB v19) + 세션-지갑 CRUD 4 API — v26.4 (SESS-01~10)
- ✓ walletId 선택적 파라미터 + resolveWalletId 3단계 우선순위 + 하위 호환 — v26.4 (API-01~06)
- ✓ GET /v1/connect-info 자기 발견 (지갑/정책/capabilities/prompt) + agent-prompt 통합 — v26.4 (DISC-01~04)
- ✓ SDK/MCP/Admin UI/CLI 멀티 지갑 세션 + connect-info 통합 + 이슈 #119-#120 — v26.4 (INTG-01~10)

- ✓ IChainSubscriber 6-메서드 인터페이스 + IncomingTransaction 타입 + incoming_transactions DDL(v21) 완성 — v27.0 (MON-01, DATA-01~04)
- ✓ Solana logsSubscribe(mentions) + getTransaction(jsonParsed) SOL/SPL/Token-2022 이중 감지 + ATA 자동 감지 전략 설계 — v27.0 (MON-02, MON-08)
- ✓ EVM getLogs Transfer + getBlock(includeTransactions) ETH/ERC-20 이중 감지 + token_registry 오탐 방지 전략 설계 — v27.0 (MON-03)
- ✓ 3-state WebSocket 상태 머신 + SubscriptionMultiplexer 연결 공유 + 블라인드 구간 복구 설계 — v27.0 (MON-04~07, MON-09)
- ✓ INCOMING_TX_DETECTED/SUSPICIOUS 이벤트 + IIncomingSafetyRule 3규칙 + i18n(en/ko) + 5채널 알림 연동 명세 — v27.0 (EVT-01~05)
- ✓ REST API(GET /v1/wallet/incoming + /summary) + SDK/MCP 인터페이스 Zod SSoT 명세 — v27.0 (API-01~05)
- ✓ config.toml [incoming] 6키 + 지갑별 monitor_incoming opt-in + 환경변수 매핑 — v27.0 (CFG-01~03)
- ✓ 기존 설계 문서 9개 영향 분석 + 17개 검증 시나리오 + 교차 검증 PASS — v27.0 (VER-01~03)
- ✓ 감사 갭 9건 전량 해결 (IChainSubscriber connect()/waitForDisconnect(), 폴링 BackgroundWorker 등록, is_suspicious 컬럼, eventBus 타입 통일, FLOW-2 E2E, NOTIFY-1 priority 라우팅, getDecimals 헬퍼, doc 31 PATCH, skills/ 업데이트) — v27.0 (Phase 222-223)

- ✓ IChainSubscriber 6-method interface + DB v21 migration (incoming_transactions, incoming_tx_cursors, wallets.monitor_incoming) — v27.1 (SUB-01, STO-01)
- ✓ SolanaIncomingSubscriber WebSocket logsSubscribe + SOL/SPL/Token-2022 파서 + 60s heartbeat keepalive — v27.1 (SUB-02, SUB-07)
- ✓ EvmIncomingSubscriber getLogs ERC-20 Transfer + getBlock native ETH 폴링 감지 — v27.1 (SUB-03)
- ✓ WebSocket-to-polling 자동 폴백 3-state connection machine + SubscriptionMultiplexer 연결 공유 — v27.1 (SUB-04, SUB-06)
- ✓ Gap recovery via incoming_tx_cursors + blind gap recovery after reconnection — v27.1 (SUB-05)
- ✓ IncomingTxQueue Map dedup + BackgroundWorkers batch flush + ON CONFLICT DO NOTHING — v27.1 (STO-02, STO-04)
- ✓ Retention policy worker auto-delete older than incoming_retention_days — v27.1 (STO-05)
- ✓ GET /v1/wallet/incoming 커서 페이지네이션 + GET /summary 기간별 집계 + PATCH monitorIncoming 토글 — v27.1 (API-01~03)
- ✓ TypeScript/Python SDK listIncomingTransactions + getIncomingTransactionSummary — v27.1 (API-04, API-05)
- ✓ MCP list-incoming-transactions + get-incoming-summary 2 tools (total 23) — v27.1 (API-06, API-07)
- ✓ EventBus transaction:incoming + transaction:incoming:suspicious + 3 safety rules (dust/unknownToken/largeAmount) — v27.1 (EVT-01, EVT-03)
- ✓ TX_INCOMING/TX_INCOMING_SUSPICIOUS NotificationEventType + en/ko i18n templates — v27.1 (EVT-02, EVT-06)
- ✓ KillSwitch SUSPENDED/LOCKED 알림 억제 + per-wallet cooldown — v27.1 (EVT-04, EVT-05)
- ✓ config.toml [incoming] 7키 Zod 검증 + WAIAAS_INCOMING_* env var + SettingsService + HotReload — v27.1 (CFG-01~05)
- ✓ DaemonLifecycle Step 4c-9 IncomingTxMonitorService fail-soft 초기화 — v27.1 (CFG-04)
- ✓ 3개 통합 버그 수정 (BackgroundWorkers 공유, polling worker handlers, gap recovery wiring) — v27.1 (Phase 230)
- ✓ 20개 통합 테스트 6대 피트폴 검증 (listener leak, SQLite contention, dedup, shutdown drain, EVM reorg, gap recovery) — v27.1 (Phase 229)

- ✓ CAIP-2/19 파서/포매터 + Zod 스키마 + 13-네트워크 양방향 맵 (CAIP-01~10) — v27.2 (Phase 231)
- ✓ TokenRef assetId(CAIP-19) + network(NetworkType) 확장 (TOKN-01) — v27.2 (Phase 231)
- ✓ 가격 오라클 CAIP-19 캐시 키 전환 + CoinGecko L2 플랫폼 매핑 + Pyth 피드 ID 원자적 전환 (ORCL-01~04) — v27.2 (Phase 232)
- ✓ DB v22 마이그레이션: token_registry.asset_id + CAIP-19 backfill + Token API assetId (TOKN-02~04) — v27.2 (Phase 233)
- ✓ TokenInfoSchema assetId cross-validation + TransactionParam assetId 전파 (TXSC-01~03) — v27.2 (Phase 233)
- ✓ ALLOWED_TOKENS 4-시나리오 정책 매칭 매트릭스 (PLCY-01~04) — v27.2 (Phase 233)
- ✓ MCP 토큰 도구 assetId 파라미터 + TS/Python SDK 타입 확장 + 3개 스킬 파일 문서화 (MCPS-01~04, SKIL-01~02) — v27.2 (Phase 234)

### 활성

## Current Milestone: v27.3 토큰별 지출 한도 정책

**Goal:** SPENDING_LIMIT 정책에 CAIP-19 기반 token_limits를 추가하여, 토큰별 사람 읽기 단위 금액 한도를 설정할 수 있도록 확장

**Target features:**
- raw 필드(instant_max/notify_max/delay_max) optional 전환 + Zod superRefine 검증
- token_limits 필드 추가 (CAIP-19 키 매칭: asset ID → native:{chain} → native 폴백)
- evaluateTokenTier 신규 함수 + 3곳 호출부 tokenContext 전달
- TransactionParam 인터페이스 3곳 동기화 (tokenDecimals 추가)
- Admin UI spending-limit-form 재구성 (USD 우선 + 토큰별 한도 편집 + Legacy deprecated)
- 스킬 파일 문서화

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
- 다크 모드 Admin UI — 현재 CSS Variables 기반 향후 확장 가능
- Admin UI 다국어 i18n — 현재 영어 전용

## 컨텍스트

**누적:** 53 milestones (v0.1-v27.2), 234 phases, 505 plans, 1,362 requirements, 40 설계 문서(24-76), 8 objective 문서, ~157,584 LOC TS, 4,396+ 테스트

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
v1.5 DeFi Price Oracle + Action Provider Framework shipped (2026-02-15). 5 페이즈, 14 플랜, 29 요구사항, ~185,000 LOC, 1,848 테스트, 84 설계 결정.
v1.5.1 x402 클라이언트 지원 shipped (2026-02-15). 4 페이즈, 10 플랜, 39 요구사항, ~187,000 LOC, 2,058 테스트, 59 설계 결정.
v1.5.2 Admin UI 정책 폼 UX 개선 shipped (2026-02-16). 2 페이즈, 4 플랜, 24 요구사항, ~188,000 LOC, 2,111 테스트, 7 설계 결정.
v1.5.3 USD 정책 확장 (누적 지출 한도 + 표시 통화) shipped (2026-02-16). 4 페이즈, 8 플랜, 19 요구사항, ~191,000 LOC, ~2,150 테스트.
v1.6 운영 인프라 + 잔액 모니터링 shipped (2026-02-16). 6 페이즈, 14 플랜, 49 요구사항, ~207,902 LOC, ~2,294 테스트, 45 설계 결정.
v1.6.1 WalletConnect Owner 승인 shipped (2026-02-16). 5 페이즈, 10 플랜, 24 요구사항, ~220,000 LOC, ~2,510 테스트, 28 설계 결정.
v1.7 품질 강화 + CI/CD shipped (2026-02-17). 9 페이즈, 19 플랜, 48 요구사항, ~237,000 LOC, 3,509 테스트, 66 설계 결정.
v1.8 업그레이드 + 배포 인프라 shipped (2026-02-17). 5 페이즈, 12 플랜, 30 요구사항, ~124,712 LOC TS, 3,599 테스트, 16 설계 결정.
v2.0 전 기능 완성 릴리스 shipped (2026-02-18). 9 페이즈, 17 플랜, 25 요구사항, ~124,830 LOC TS, ~3,599 테스트, 39 설계 결정.
v2.2 테스트 커버리지 강화 shipped (2026-02-18). 4 페이즈, 6 플랜, 11 요구사항, ~142,639 LOC TS, ~3,880 테스트, 9 설계 결정.
v2.3 Admin UI 기능별 메뉴 재구성 shipped (2026-02-18). 6 페이즈, 11 플랜, 39 요구사항, ~145,784 LOC TS, 31 설계 결정.
v2.4 npm Trusted Publishing 전환 shipped (2026-02-19). 3 페이즈, 4 플랜, 12 요구사항, ~146,464 LOC TS, 7 설계 결정. + 8건 이슈 수정.
v2.4.1 Admin UI 테스트 커버리지 복원 shipped (2026-02-19). 3 페이즈, 5 플랜, 22 요구사항, ~151,015 LOC TS, ~186 신규 테스트.
v2.5 DX 품질 개선 shipped (2026-02-19). 4 페이즈, 8 플랜, 23 요구사항, 58 파일 변경, +3,333/-192 lines, 34 커밋.
v2.6 Wallet SDK 설계 shipped (2026-02-20). 4 페이즈, 7 플랜, 23 요구사항, 55 파일 변경, +10,435/-324 lines, 33 커밋, 34 설계 결정, 설계 문서 3개 신규(73/74/75) + 4개(35/37/25/67) 갱신.
v2.6.1 WAIaaS Wallet Signing SDK shipped (2026-02-20). 4 페이즈, 13 플랜, 27 요구사항, 206 파일 변경, +16,137/-332 lines, 67 커밋, 43 설계 결정.
v2.7 지갑 앱 알림 채널 shipped (2026-02-20). 1 페이즈, 4 플랜, 16 요구사항, 34 파일 변경, +3,722/-91 lines, 6 설계 결정.
v26.3 Push Relay Server shipped (2026-02-20). 3 페이즈, 8 플랜, 25 요구사항, 45 파일 변경, +2,589/-26 lines, 6 설계 결정. @waiaas/push-relay 신규 패키지.
v26.4 멀티 지갑 세션 + 에이전트 자기 발견 shipped (2026-02-21). 5 페이즈, 15 플랜, 30 요구사항, ~145,704 LOC TS, 4,396+ 테스트, 5 설계 결정.
v27.0 수신 트랜잭션 모니터링 설계 shipped (2026-02-21). 9 페이즈, 16 플랜, 29 요구사항, 101 파일 변경, +8,058/-2,158 lines, 26 설계 결정. 설계 문서 76(~2,300줄, 8섹션).
v27.1 수신 트랜잭션 모니터링 구현 shipped (2026-02-22). 7 페이즈, 18 플랜, 30 요구사항, 189 파일 변경, +23,969/-5,834 lines, 102 커밋, ~155,540 LOC TS. Known gap: STO-03 (Confirmation Worker RPC 콜백 미주입).
v27.2 CAIP-19 자산 식별 표준 shipped (2026-02-22). 4 페이즈, 9 플랜, 31 요구사항, 135 파일 변경, +12,997/-2,406 lines, 62 커밋, ~157,584 LOC TS.

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
- Test: Vitest (forks pool for sodium mprotect) + v8 coverage + msw 2.x (mock HTTP)
- Schema: Zod SSoT → TypeScript → OpenAPI → Drizzle CHECK
- Admin: Preact 10.x + @preact/signals + Vite 6.x, @testing-library/preact
- 미구현: Jupiter Swap, Tauri

**설계 문서:** 40개 (24-76) + 대응표/테스트 전략/objective

### 알려진 이슈

- Node.js SEA + native addon (sodium-native, better-sqlite3) 크로스 컴파일 호환성 미검증 (v0.7 prebuildify 전략 설계 완료)
- @solana/kit 실제 버전 6.0.1 (설계서는 3.x 언급, API 동일)
- Pre-existing flaky lifecycle.test.ts (timer-sensitive BackgroundWorkers test) — not blocking
- Pre-existing e2e-errors.test.ts failure (expects 404, gets 401) — OpenAPIHono 전환 side effect
- Pre-existing 3 CLI E2E failures (E-07, E-08, E-09) — daemon-harness uses old adapter: param, not adapterPool:
- Kill Switch 3-state DB 저장 (v1.6에서 DB v14 마이그레이션 완료, CAS ACID 패턴)
- BUG-013~016 RESOLVED in v1.4.3 (Admin MCP 토큰, EVM getAssets, EVM confirmation timeout, 패키지 버전)
- STO-03: Confirmation Worker RPC 콜백(getBlockNumber, checkSolanaFinalized) 미주입 — DETECTED→CONFIRMED 상태 전환 미작동 (v27.1 known gap, 다음 마일스톤에서 수정)

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
| Pyth Primary + CoinGecko Fallback (Chainlink 제거) | Pyth 380+ 피드 체인 무관, EVM 전용 불필요 | ✓ Good — v1.5 구현 |
| PriceResult 3-state discriminated union | success/oracleDown/notListed로 "가격 불명 ≠ 가격 0" 보안 원칙 | ✓ Good — v1.5 구현 |
| evaluateAndReserve 진입 전 Oracle HTTP 호출 | better-sqlite3 동기 트랜잭션 내 비동기 호출 불가 | ✓ Good — v1.5 구현 |
| 신규 외부 npm 의존성 0개 | Pyth/CoinGecko native fetch, LRU 직접 구현, 암호화 settings-crypto 재사용 | ✓ Good — v1.5 구현 |
| IActionProvider resolve-then-execute ESM 플러그인 | ContractCallRequestSchema Zod 재검증으로 정책 우회 차단 | ✓ Good — v1.5 구현 |
| ActionProviderRegistry infrastructure/action/ 배치 | 기존 컨벤션 준수 (설계 문서 services/ 대신) | ✓ Good — v1.5 구현 |
| MCP 도구명 action_{provider}_{action} | 기존 14개 내장 도구와 네임스페이스 충돌 방지 | ✓ Good — v1.5 구현 |
| fire-and-forget 패턴 registerActionProviderTools | 실패 시에도 MCP 서버 정상 동작, degraded mode | ✓ Good — v1.5 구현 |
| OracleChain 캐시 전담 (Oracle 개별 캐시 미관리) | 단일 캐시 레이어로 일관된 TTL/LRU 관리 | ✓ Good — v1.5 구현 |
| 교차 검증 CoinGecko DI 주입 시에만 활성화 | 키 미설정 → fallback 미주입 → 자동 스킵 | ✓ Good — v1.5 구현 |
| @x402/core 단일 의존성 추가 | Zod SSoT 호환, PaymentRequirements/PaymentPayload 재정의 불필요 | ✓ Good — v1.5.1 구현 |
| SSRF 가드 자체 구현 (node:dns + node:net) | 외부 라이브러리 CVE 회피, RFC 5735/6890 전체 범위 차단 | ✓ Good — v1.5.1 구현 |
| x402-handler 독립 파이프라인 | 기존 6-stage 미확장, sign-only 패턴 참조한 별도 오케스트레이션 | ✓ Good — v1.5.1 구현 |
| DELAY/APPROVAL 즉시 거부 (x402) | 동기 HTTP에서 Owner 승인 대기 불가 | ✓ Good — v1.5.1 구현 |
| IChainAdapter 미경유 결제 서명 | EIP-3009 typed data 서명은 IChainAdapter 책임 외 | ✓ Good — v1.5.1 구현 |
| X402_ALLOWED_DOMAINS DatabasePolicyEngine 외부 모듈 | 독립 평가 로직, 정책 엔진 수정 최소화 | ✓ Good — v1.5.1 구현 |
| USDC $1 직접 환산 + 비-USDC IPriceOracle | USDC 안정성 활용, 오라클 호출 최소화 | ✓ Good — v1.5.1 구현 |
| parse402Response + selectPaymentRequirement + signPayment 직접 조합 | handleX402Fetch 단일 함수 대신 조합 가능한 빌딩 블록 | ✓ Good — v1.5.1 구현 |
| POLICY_RULES_SCHEMAS Partial→Record 전환 | 12개 전체 등록, 타입 안전성 강화 | ✓ Good — v1.5.2 구현 |
| PolicyFormRouter switch/case 타입별 분기 | 12개 타입 독립 폼 컴포넌트, 확장 용이 | ✓ Good — v1.5.2 구현 |
| DynamicRowList generic T 재사용 컴포넌트 | renderRow 콜백 패턴으로 다양한 행 형태 지원 | ✓ Good — v1.5.2 구현 |
| chain/network 옵션 로컬 상수 (core import 불가) | core는 Node.js 전용, admin은 브라우저 빌드 | ✓ Good — v1.5.2 구현 |
| METHOD_WHITELIST 2단계 중첩 DynamicRowList | contractAddress + selectors[] Zod 구조 반영 | ✓ Good — v1.5.2 구현 |
| TierVisualization → PolicyRulesSummary 이동 | 단일 책임 원칙, 시각화 전담 컴포넌트 분리 | ✓ Good — v1.5.2 구현 |
| PolicyFormRouter + validateRules 수정 모달 재사용 | 생성/수정 동일 폼, 코드 중복 방지, 일관된 UX | ✓ Good — v1.5.2 구현 |
| CUMULATIVE_SPENDING_DAILY/MONTHLY 롤링 윈도우 | 고정 달력 기간 대신 24h/30d 슬라이딩 윈도우 | ✓ Good — v1.5.3 구현 |
| 누적 한도 80% 경고 CUMULATIVE_LIMIT_WARNING | 한도 소진 전 사전 경고, 22번째 NotificationEventType | ✓ Good — v1.5.3 구현 |
| IForexRateService CoinGecko tether 기반 | USD→법정통화 환산, stablecoin 가격으로 간접 환율 | ✓ Good — v1.5.3 구현 |
| display_currency 월렛별 표시 통화 | 정책 평가는 항상 USD, 표시만 로컬 통화 | ✓ Good — v1.5.3 구현 |
| Kill Switch 3-state (ACTIVE/SUSPENDED/LOCKED) | RECOVERING 제거, 단순화, CAS ACID | ✓ Good — v1.6 구현 |
| EventBus emit() 리스너별 try/catch 격리 | 파이프라인 안전성, 하나의 리스너 오류가 전체 차단 방지 | ✓ Good — v1.6 구현 |
| eventBus optional chaining(?.) 패턴 | 기존 코드 무중단 호환, 이벤트 버스 미초기화 시 안전 | ✓ Good — v1.6 구현 |
| AutoStop 규칙 트리거 후 카운터 리셋 | 재축적 필요, 연속 실패 5회 리셋 후 재카운트 | ✓ Good — v1.6 구현 |
| MANUAL_TRIGGER → Kill Switch 전체, 나머지 → 개별 월렛 | 수동은 전역, 자동은 격리 정지 | ✓ Good — v1.6 구현 |
| BalanceMonitorService setInterval 폴링 (5분) | EventBus 구독 대신 주기적 체크, 단순하고 예측 가능 | ✓ Good — v1.6 구현 |
| Telegram Bot native fetch (외부 프레임워크 미사용) | telegraf/grammy 의존 제거, 최소 의존성 | ✓ Good — v1.6 구현 |
| telegram.bot_token 별도 TOML 섹션 | Bot 수신 vs 알림 발송 독립 제어 | ✓ Good — v1.6 구현 |
| 2-Tier 인증 (ADMIN/READONLY/PENDING) | 관리 명령은 ADMIN만, 조회는 READONLY 허용 | ✓ Good — v1.6 구현 |
| node:22-slim Docker 베이스 이미지 | glibc 호환, native addon prebuildify 지원 | ✓ Good — v1.6 구현 |
| Docker Secrets _FILE 패턴 | 환경변수 대신 파일 기반 시크릿 주입, compose 오버라이드 | ✓ Good — v1.6 구현 |
| 127.0.0.1:3100 포트 매핑 | 외부 네트워크 노출 방지, localhost 전용 | ✓ Good — v1.6 구현 |
| WC "선호 채널" 위치 (REST API 절대 유지) | self-hosted 철학, 외부 relay 의존 최소화 | ✓ Good — v1.6.1 설계 |
| 3중 승인 채널 (WC > Telegram > REST) | 편의성 순서, fallback 자동 전환 | ✓ Good — v1.6.1 구현 |
| SqliteKeyValueStorage (WC SDK 세션 영속화) | WC keyvaluestorage 의존성 대신 직접 구현, pnpm strict 호환 | ✓ Good — v1.6.1 구현 |
| 서버사이드 QR 생성 (CSP 변경 불필요) | qrcode.toDataURL → base64 data URL | ✓ Good — v1.6.1 구현 |
| fire-and-forget WC 서명 요청 | stage4Wait 비차단, void prefix 패턴 | ✓ Good — v1.6.1 구현 |
| 서명 검증 실패 시 reject 안 함 | Owner REST API 재시도 가능 | ✓ Good — v1.6.1 구현 |
| WC fallback에 isApprovalStillPending guard | 이미 처리된 approval 보호, 단일 승인 소스 | ✓ Good — v1.6.1 구현 |
| 사용자 명시적 거부(4001/5000)는 fallback 없음 | 의도적 거부는 존중 | ✓ Good — v1.6.1 구현 |
| notificationService/eventBus optional DI | WC 없이도 데몬 정상 동작 | ✓ Good — v1.6.1 구현 |
| v8 coverage thresholds --coverage 플래그 실행 시에만 활성화 | vitest run 기본 실행 성능 유지 | ✓ Good — v1.7 구현 |
| msw 핸들러 factory 패턴 (overrides 커스터마이징) | 테스트별 응답 분기 가능, 재사용 극대화 | ✓ Good — v1.7 구현 |
| Contract Test factory skipMethods 패턴 | RPC 의존 복잡 메서드 격리, shape 검증 집중 | ✓ Good — v1.7 구현 |
| describe.skipIf(!validatorRunning) 패턴 | Local Validator 미실행 시 graceful skip | ✓ Good — v1.7 구현 |
| coverage-gate.sh Soft/Hard 모드 | v1.7 초기 soft, 안정화 후 hard 전환 | ✓ Good — v1.7 구현 |
| ci.yml Stage 1 --affected / Stage 2 full suite | push 시 빠른 피드백, PR 시 전체 검증 | ✓ Good — v1.7 구현 |
| nightly devnet job continue-on-error: true | devnet 불안정성 격리, 빌드 중단 방지 | ✓ Good — v1.7 구현 |
| release Docker 빌드 GHA cache (type=gha, mode=max) | 레이어 캐시 재활용, 빌드 시간 최소화 | ✓ Good — v1.7 구현 |
| BackgroundWorkers runImmediately 옵션 | fire-and-forget 즉시 1회 실행 후 interval 반복 | ✓ Good — v1.8 구현 |
| semver 패키지 npm registry 버전 비교 | AbortSignal.timeout(5000) fetch 타임아웃, fail-soft | ✓ Good — v1.8 구현 |
| createHealthRoute 팩토리 DI 패턴 | VersionCheckService 선택적 주입, backward compatibility 유지 | ✓ Good — v1.8 구현 |
| 파일 기반 mtime dedup (.last-update-notify) | 데몬 비실행 시에도 CLI 독립적 24h 중복 방지 | ✓ Good — v1.8 구현 |
| process.stderr.write CLI 알림 | stdout 파이프 안전성 확보, 2초 타임아웃 | ✓ Good — v1.8 구현 |
| BackupService copyFileSync 개별 파일 복사 | 명시적 파일 단위, DB+WAL/SHM+config.toml, 5개 보존 | ✓ Good — v1.8 구현 |
| execSync('npm install -g') upgrade 실행 | npm CLI 직접 호출, Step 5 마이그레이션 데몬 위임 | ✓ Good — v1.8 구현 |
| checkSchemaCompatibility 3-시나리오 판별 | ok/migrate/reject, MIN_COMPATIBLE_SCHEMA_VERSION=1 | ✓ Good — v1.8 구현 |
| SCHEMA_INCOMPATIBLE 에러 코드 (503) | SYSTEM 도메인, non-retryable, upgrade 안내 | ✓ Good — v1.8 구현 |
| docker/metadata-action@v5 3-tier 태깅 | GHCR latest/semver/major 자동 생성 | ✓ Good — v1.8 구현 |
| Watchtower 라벨 이미지 기본 포함 | 사용자 opt-in 간소화 | ✓ Good — v1.8 구현 |
| 모노레포 단일 버전 전략 (release-please) | 루트 패키지가 9개 서브패키지 대표, Self-Hosted 특성 | ✓ Good — v1.8 구현 |
| bump-minor-pre-major: false | 1.x에서도 BREAKING CHANGE → major 범프 | ✓ Good — v1.8 구현 |
| 2-gate release model | Release PR 머지(게이트 1) → 품질 게이트 → deploy 수동 승인(게이트 2) | ✓ Good — v1.8 구현 |
| contract test 패턴 (cross-package 의존성 검증) | health 응답 스키마 계약으로 패키지 경계 존중 | ✓ Good — v1.8 구현 |
| MIT 라이선스 채택 | 오픈소스 표준, 상업 사용 허용, 기여 장벽 최소화 | ✓ Good — v2.0 구현 |
| npm @waiaas Organization scope | 패키지 네임스페이스 확보, 일관된 브랜딩 | ✓ Good — v2.0 구현 |
| OpenAPI swagger-parser CI 자동 검증 | 스펙 유효성 빌드타임 보장, 수동 검증 불필요 | ✓ Good — v2.0 구현 |
| docs/ vs docs-internal/ 분리 | 사용자 문서와 내부 설계 문서 독립 관리 | ✓ Good — v2.0 구현 |
| zero-dependency skills CLI | process.argv 직접 파싱, 외부 라이브러리 미사용 | ✓ Good — v2.0 구현 |
| publishConfig.access: public | scoped 패키지 npm publish 필수 설정 | ✓ Good — v2.0 구현 |
| admin 패키지 private:true | daemon에 번들, 별도 publish 불필요 | ✓ Good — v2.0 구현 |
| release-as "2.0.0-rc.1" 명시적 | release-as와 prerelease-type 결합 불가 | ✓ Good — v2.0 구현 |
| GITHUB_TOKEN → RELEASE_PAT | GITHUB_TOKEN은 다른 워크플로 트리거 불가 | ✓ Good — v2.0 구현 |
| npm Classic Automation Token | Trusted Publishing은 v2.0.4에서 전환 | ✓ Good — v2.0 구현, v2.4에서 OIDC 전환 완료 |
| Dead code it.skip 문서화 패턴 | 도달 불가 코드는 강제 실행 대신 skip+설명 주석 | ✓ Good — v2.2 테스트 |
| Branch-focused 별도 테스트 파일 | 기존 happy-path 테스트와 중복 없이 분기 집중 | ✓ Good — v2.2 테스트 |
| Coverage 별도 테스트 파일 (mock 충돌 회피) | 기존 test와 mock 설정 충돌 방지 | ✓ Good — v2.2 테스트 |
| client.ts real fetch 테스트 (no mock) | 실제 코드 경로 정확한 커버리지 측정 | ✓ Good — v2.2 테스트 |
| Non-throwing process.exit mock | try/catch 내 exit 호출 catch 블록 커버리지 | ✓ Good — v2.2 테스트 |
| PassThrough stream stdin mock | forks pool에서 readline mock 불안정 대체 | ✓ Good — v2.2 테스트 |
| Settings 분산 전략 — 재배치(이동), 재작성 아님 | 기존 컴포넌트를 탭 단위로 이동, 로직 변경 최소화 | ✓ Good — v2.3 구현 |
| 5-phase 구조 (공용→메뉴→설정→UX→마무리) | 점진적 빌드업, 각 단계 독립 검증 가능 | ✓ Good — v2.3 구현 |
| HTML fieldset+legend 시맨틱 FieldGroup | div 래퍼 대신 접근성 표준 요소 사용 | ✓ Good — v2.3 구현 |
| 정적 SearchIndexEntry 배열 (서버 API 아님) | 수십 개 설정 항목에 클라이언트 사이드 검색 충분 | ✓ Good — v2.3 구현 |
| Module-level signal (highlightField/pendingNavigation) | prop drilling 없이 cross-component 통신 | ✓ Good — v2.3 구현 |
| Module-level signal registry (dirty guard) | 각 탭이 isDirty/save/discard 클로저 등록 | ✓ Good — v2.3 구현 |
| 3-button unsaved dialog (저장 후 이동/저장 없이 이동/취소) | 모든 UX 시나리오 커버 | ✓ Good — v2.3 구현 |
| Record<string, string> 맵 기반 field description | 동적 렌더링, settings-search-index.ts와 일관성 유지 | ✓ Good — v2.3 구현 |
| Hidden input 패턴 (CurrencySelect name discovery) | FormField 외부 커스텀 컴포넌트의 querySelector 발견 지원 | ✓ Good — v2.3 구현 |
| 각 Settings 탭 독립적 signal 상태 | 탭 간 상태 간섭 방지, 독립 dirty/save/load | ✓ Good — v2.3 구현 |
| Job-level permissions (workflow-level 아닌) | OIDC scope를 deploy job에만 제한 | ✓ Good — v2.4 구현 |
| npm publish 직접 호출 (pnpm 위임 대신) | OIDC 토큰 전달 경로 확실성 | ✓ Good — v2.4 구현 |
| publish-check에서 --provenance 사용 금지 | dry-run + provenance 비호환 | ✓ Good — v2.4 구현 |
| NPM_TOKEN은 OIDC E2E 검증 후에만 제거 | 롤백 가능성 유지 | ✓ Good — v2.4 구현 |
| release-please prerelease versioning (rc type) | RC 릴리스로 OIDC 검증 수행 | ✓ Good — v2.4 구현 |
| homepage 필드는 provenance 범위 밖 유지 | repository.url만 Sigstore에 사용 | ✓ Good — v2.4 구현 |
| NotificationService always-init (0 channels) | Admin UI hot-reload 런타임 활성화 지원 | ✓ Good — v2.4 quick-4 |
| message 필드 UTF-8 원문 + 인코딩은 체인 라이브러리 | SignRequest 가독성 + 검증 가능성 확보 | ✓ Good — v2.6 설계 |
| requestId(UUID v7) 재사용 Nonce | 별도 nonce 생성 불필요, 1회성 보장 | ✓ Good — v2.6 설계 |
| ntfy 응답 토픽 requestId 기반 1회용 (122비트 엔트로피) | 토픽 자체가 인증 역할, 추측 불가 | ✓ Good — v2.6 설계 |
| Telegram 3중 보안 (chatId + signerAddress + 서명) | 위조 방지 계층적 보안 | ✓ Good — v2.6 설계 |
| parseSignRequest 동기/비동기 2모드 반환 | 인라인(URL data) vs ntfy 조회 fallback 지원 | ✓ Good — v2.6 설계 |
| zod만 peerDependency (SDK 의존성 최소화) | React Native/Electron/Node.js 환경 호환 | ✓ Good — v2.6 설계 |
| ISigningChannel 공통 인터페이스 (sendRequest + waitForResponse) | ntfy/telegram 채널 교체 가능, Slack/Discord 확장 | ✓ Good — v2.6 설계 |
| WalletLinkRegistry SettingsService JSON 배열 저장 | 별도 DB 테이블 불필요 (1-3개 지갑) | ✓ Good — v2.6 설계 |
| ApprovalChannelRouter 5단계 fallback | ownerApprovalMethod > SDK > WC > Telegram Bot > REST | ✓ Good — v2.6 설계 |
| 서명/알림 토픽 분리 (waiaas-sign-*/waiaas-notify-*) | 동일 ntfy 서버, 접두어로 구분 | ✓ Good — v2.6 설계 |
| IPushProvider send+validateConfig 2메서드 | 프로바이더 확장 가능, createProvider 팩토리 | ✓ Good — v2.6 설계 |
| FCM HTTP v1 단건 전송 + Promise.allSettled | sendAll deprecated 대비, 병렬 처리 | ✓ Good — v2.6 설계 |
| Push Relay 별도 패키지 중첩 config.toml 허용 | WAIaaS flat-key 정책 미적용 (독립 패키지) | ✓ Good — v2.6 설계 |
| INotificationChannel type에 'WALLET_NTFY' 추가 | 4번째 채널 타입, 타입 안전성 유지 | ✓ Good — v2.6 설계 |
| DB migration v18 owner_approval_method CHECK 제약 | fresh DDL에만 CHECK, 기존 ALTER ADD COLUMN은 무제약 | ✓ Good — v2.6.1 구현 |
| Injectable verify functions (EvmVerifyFn/SolanaVerifyFn) | 테스트 가능성 확보, mock 주입 용이 | ✓ Good — v2.6.1 구현 |
| node>=18 engine for wallet SDK | React Native/Electron 호환, ReadableStream SSE 파싱 | ✓ Good — v2.6.1 구현 |
| AsyncGenerator SSE parsing for NtfySigningChannel | 재연결 max 3회 5s 딜레이, requestId 필터링 | ✓ Good — v2.6.1 구현 |
| TelegramSigningChannel one-way push (no SSE) | /sign_response bot 명령어로 응답, ADMIN tier 필요 | ✓ Good — v2.6.1 구현 |
| Three-state approval_method protocol (undefined/null/string) | preserve/clear/save 명확한 의미 분리 | ✓ Good — v2.6.1 구현 |
| ApprovalChannelRouter raw better-sqlite3 | wallet lookup 성능 최적화, Drizzle ORM 우회 | ✓ Good — v2.6.1 구현 |
| Late-binding setter for signResponseHandler injection | VersionCheckService 일관 패턴, 순환 의존 회피 | ✓ Good — v2.6.1 구현 |
| Signing SDK fail-soft lifecycle (fire-and-forget) | enabled=false 시 스킵, 데몬 정상 동작 보장 | ✓ Good — v2.6.1 구현 |
| Direct getAllMasked() return (z.infer assertion) | 카테고리 체리피킹 대신 직접 반환, 11개 카테고리 자동 노출 | ✓ Good — v2.6.1 구현 |
| Side channel BEFORE channels.length guard | 기존 채널 0개여도 사이드 채널은 동작해야 함 | ✓ Good — v2.7 구현 |
| Fire-and-forget .catch() 사이드 채널 격리 | 사이드 채널 실패가 기존 채널에 무영향 | ✓ Good — v2.7 구현 |
| notify_categories 빈 배열 = 전체 카테고리 | 명시적 필터링 opt-in, 기본값은 모든 알림 수신 | ✓ Good — v2.7 구현 |
| SSE subscribeToNotifications reuse pattern | subscribeToRequests와 동일한 AbortController/재연결 패턴 재사용 | ✓ Good — v2.7 구현 |
| Wallet App Notifications as subgroup under Signing SDK | 관련 SDK 설정과 함께 배치, 별도 카테고리 아닌 하위 그룹 | ✓ Good — v2.7 구현 |
| JSON array string for notify_categories | 멀티셀렉트 체크박스 → JSON.stringify/parse, SettingsService 기존 패턴 | ✓ Good — v2.7 구현 |
| NtfySigningChannel base64url 인코딩 통일 | 서명/알림 모두 동일 인코딩, Relay 파서 단일 로직 | ✓ Good — v26.3 구현 |
| push-relay 독립 Dockerfile (daemon과 분리) | 지갑사 자체 운영 서버, daemon 배포와 독립 | ✓ Good — v26.3 구현 |
| IPushProvider + withRetry 지수 백오프 | 5xx 재시도 3회, 401/403 즉시 에러, invalid token 자동 삭제 | ✓ Good — v26.3 구현 |
| better-sqlite3 WAL mode Device Registry | daemon과 동일 DB 패턴, 동시 읽기 최적화 | ✓ Good — v26.3 구현 |
| ntfy SSE subscriber 지수 백오프 재연결 (1s→60s) | 네트워크 불안정 대응, cap 60초 | ✓ Good — v26.3 구현 |
| TOML 중첩 config 허용 (push-relay 전용) | WAIaaS flat-key 정책 미적용, 독립 패키지 | ✓ Good — v26.3 구현 |
| session_wallets junction 테이블 (JWT에 지갑 배열 넣지 않음) | DB 기반 동적 관리, 토큰 재발급 불필요 | ✓ Good — v26.4 구현 |
| walletId 선택적 파라미터 (미지정 시 기본 지갑 자동) | 하위 호환 100%, 기존 클라이언트 무변경 | ✓ Good — v26.4 구현 |
| connect-info sessionAuth 전용 (마스터 패스워드 불필요) | 에이전트 자율 발견, 보안 경계 유지 | ✓ Good — v26.4 구현 |
| MCP 단일 인스턴스 (지갑별 인스턴스 제거) | connect-info로 발견, MCP config 단순화 | ✓ Good — v26.4 구현 |
| workflow_dispatch RC 승격 자동화 | 로컬 수동 편집 제거, 모노레포 전 패키지 일괄 처리 | ✓ Good — v26.4 구현 |
| IChainSubscriber를 IChainAdapter와 별도 인터페이스 | 구독(수신 감지)과 어댑터(발신 TX) 책임 분리 | ✓ Good — v27.0 설계 |
| UNIQUE(tx_hash, wallet_id) 복합 제약 | 동일 TX 다른 지갑 허용, 같은 지갑 중복 차단 | ✓ Good — v27.0 설계 |
| 2단계 상태 DETECTED/CONFIRMED | finality 수준 추적, 거래소급 안전성 | ✓ Good — v27.0 설계 |
| 메모리 큐 + 5초 flush (SQLite 보호) | 단일 라이터 병목 해소, 배치 INSERT | ✓ Good — v27.0 설계 |
| Solana logsSubscribe({ mentions }) 단일 구독 | SOL+SPL+Token-2022 통합 감지, mentions로 ATA 자동 포함 | ✓ Good — v27.0 설계 |
| EVM 폴링(getLogs) 우선 | WebSocket 불안정 EVM RPC 대응, 폴백 아닌 주방식 | ✓ Good — v27.0 설계 |
| 3-state 연결 상태 머신 (WS_ACTIVE/POLLING_FALLBACK/RECONNECTING) | 명확한 전환 조건, 복구 자동화 | ✓ Good — v27.0 설계 |
| 체인별 WebSocket 공유 멀티플렉서 | 같은 체인 N개 지갑이 1개 연결 공유 | ✓ Good — v27.0 설계 |
| config.toml [incoming] 6키 flat | 기존 flat-key 패턴 일관성, hot-reload 가능 | ✓ Good — v27.0 설계 |
| 전역 게이트 + 지갑별 opt-in 2단계 | 글로벌 enabled → 지갑별 monitor_incoming | ✓ Good — v27.0 설계 |
| IChainSubscriber connect()/waitForDisconnect() 필수 | reconnectLoop에서 호출 가능, 인터페이스 완전성 | ✓ Good — v27.0 갭 해결 |
| flush() 반환 IncomingTransaction[] + 개별/집계 이벤트 분리 | eventBus 타입 안전성, 개별 TX 이벤트 + 집계 카운트 분리 | ✓ Good — v27.0 갭 해결 |
| is_suspicious 컬럼 (별도 테이블 아님) | incoming_transactions 단일 테이블, JOIN 불필요, Summary SQL 정합 | ✓ Good — v27.0 갭 해결 |
| 폴링 BackgroundWorker Step 6 등록 | incoming-tx-poll-solana/evm 2개, DaemonLifecycle 완전 통합 | ✓ Good — v27.0 갭 해결 |
| SUSPICIOUS priority:high 채널 내부 eventType 매핑 | NotificationPayload 변경 없이 priority 라우팅 | ✓ Good — v27.0 갭 해결 |
| SafetyRuleContext.decimals + getDecimals() 헬퍼 | IncomingTransaction 타입 변경 없이 decimals 전달 | ✓ Good — v27.0 갭 해결 |

| IncomingTransaction interface + Zod schema 이중 정의 | interface는 코드 계약, Zod는 검증/OpenAPI SSoT | ✓ Good — v27.1 구현 |
| Custom CAIP-2/19 모듈 (~240 LOC, 외부 의존성 0) | 4개 외부 라이브러리 평가 후 과잉 의존성 판단 | ✓ Good — v27.2 구현 |
| `token` namespace for Solana SPL/Token-2022 (NOT `spl`) | CAIP-19 표준 준수, SPL은 비표준 | ✓ Good — v27.2 구현 |
| slip44: ETH=60, SOL=501, POL=966 (Polygon NOT 60) | SLIP-44 표준 coin type 준수 | ✓ Good — v27.2 구현 |
| EVM addresses lowercase at CAIP construction time | Solana base58은 NEVER lowercased, 체인별 정규화 | ✓ Good — v27.2 구현 |
| InMemoryPriceCache volatile — 캐시 키 마이그레이션 제로 비용 | 재시작 시 자동 적용, 데이터 마이그레이션 불필요 | ✓ Good — v27.2 구현 |
| DB v22 application-level backfill (SELECT+loop+UPDATE) | established v6b 패턴 재사용 | ✓ Good — v27.2 구현 |
| 4-scenario ALLOWED_TOKENS 정책 매칭 매트릭스 | assetId↔assetId, assetId↔legacy, legacy↔assetId, legacy↔legacy 전환 기간 호환 | ✓ Good — v27.2 구현 |
| CAIP-19 assetId optional additive (하위 호환) | 기존 address-only 경로 전부 유지, 점진적 전환 | ✓ Good — v27.2 구현 |
| network-map.ts SSoT for CAIP-2/NetworkType 양방향 맵 | x402.types.ts, wc-session-service.ts 모두 여기서 import | ✓ Good — v27.2 구현 |
| resolveNetwork(chain, network?) 하위호환 패턴 | 오라클 호출자 시그니처 점진적 마이그레이션 | ✓ Good — v27.2 구현 |
| MCP tools 내 CAIP-19 validation 없음 | 데몬 Caip19Schema superRefine이 단일 검증 지점 | ✓ Good — v27.2 구현 |
| CREATE TABLE IF NOT EXISTS v21 마이그레이션 | pushSchema DDL 실행 순서 호환, 기존 패턴 일관 | ✓ Good — v27.1 구현 |
| generateId DI 주입 (crypto.randomUUID default) | 테스트 가능성 확보, Phase 226에서 UUID v7 사용 | ✓ Good — v27.1 구현 |
| EVM polling-first (connect no-op) | EVM WebSocket 불안정 대응, 설계(D-06) 충실 구현 | ✓ Good — v27.1 구현 |
| Duck-typed subscriber 파라미터 (reconnectLoop) | IChainSubscriber 순환 의존 회피 | ✓ Good — v27.1 구현 |
| 큐 flush 시 generateId() 호출 (UUID v7 time ordering) | 삽입 시점 기준 정렬, 감지 시점과 분리 | ✓ Good — v27.1 구현 |
| Composite cursor base64url JSON {d, i} | keyset 페이지네이션, offset 없이 안정적 | ✓ Good — v27.1 구현 |
| Summary JS BigInt 집계 (SQL SUM 미사용) | SQLite bigint 정밀도 이슈 방지 | ✓ Good — v27.1 구현 |
| Duck-typed incomingTxMonitorService (순환 의존 회피) | HotReloadDeps/CreateAppDeps에서 일관 적용 | ✓ Good — v27.1 구현 |
| BackgroundWorkers pre-created double guard | daemon Step 4c-9 전 + Step 6 내부, 방어적 코딩 | ✓ Good — v27.1 구현 |
| Polling workers structural typing cast | pollAll()이 IChainSubscriber interface에 없음, as unknown as 캐스트 | ✓ Good — v27.1 구현 |
| TX_INCOMING_SUSPICIOUS → security_alert 카테고리 | 전 채널 브로드캐스트, TX_INCOMING은 transaction 카테고리 | ✓ Good — v27.1 구현 |

## Shipped: v27.2 CAIP-19 자산 식별 표준

v27.2 shipped. WAIaaS 전체 코드베이스의 토큰/자산 식별 체계를 CAIP-19 표준으로 통일. Custom CAIP-2/19 파서 모듈(~240 LOC, 외부 의존성 0), 13-네트워크 양방향 맵, 가격 오라클 L2 지원(Polygon/Arbitrum/Optimism/Base), DB v22 마이그레이션(token_registry.asset_id + 자동 backfill), 4-시나리오 ALLOWED_TOKENS 정책 매칭 매트릭스, MCP 토큰 도구 assetId + TS/Python SDK 타입 확장 + 3개 스킬 파일 문서화. 모든 변경 additive(하위 호환). 31/31 requirements PASS.

---
*최종 업데이트: 2026-02-22 after v27.2 milestone complete*
