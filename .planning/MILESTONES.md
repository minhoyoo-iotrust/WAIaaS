# Project Milestones: WAIaaS

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


