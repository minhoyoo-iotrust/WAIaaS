# Requirements: WAIaaS v1.1 코어 인프라 + 기본 전송

**정의:** 2026-02-10
**핵심 가치:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다
**참조:** objectives/v1.1-core-infrastructure.md

## v1.1 Requirements

CLI로 init → start → SOL 전송 → 확인까지 동작하는 최소 데몬을 구현한다.

### 모노레포 인프라

- [ ] **MONO-01**: pnpm workspace + Turborepo 기반 모노레포가 구성되고, 4개 패키지(core, daemon, adapter-solana, cli)가 빌드·테스트·린트 파이프라인으로 연결된다
- [ ] **MONO-02**: 공유 tsconfig.base.json, ESLint + Prettier, Vitest 설정이 모든 패키지에 적용된다
- [ ] **MONO-03**: .nvmrc(Node.js 22 LTS)가 존재하고, 각 패키지가 ESM으로 빌드된다

### @waiaas/core 패키지

- [ ] **CORE-01**: 12개 Enum(ChainType, NetworkType, AgentStatus, TransactionStatus, TransactionType, PolicyType, PolicyTier, SessionStatus, NotificationEventType, AuditAction, KillSwitchState, OwnerState)이 as const → Zod literal union 파이프라인으로 정의된다
- [ ] **CORE-02**: Agent, Session, Transaction, Policy, Config에 대한 Zod SSoT 스키마가 정의되고 TypeScript 타입이 자동 파생된다
- [ ] **CORE-03**: 66개 에러 코드 통합 매트릭스가 error-codes.ts에 정의되고, WAIaaSError 베이스 클래스로 throw할 수 있다
- [ ] **CORE-04**: IChainAdapter(10개 메서드), ILocalKeyStore, IPolicyEngine, INotificationChannel 인터페이스가 정의된다
- [ ] **CORE-05**: i18n 메시지 템플릿 구조(en/ko)가 정의되고, getMessages(locale) 함수로 언어별 메시지를 조회할 수 있다

### SQLite + Drizzle ORM

- [ ] **DB-01**: 7개 테이블(agents, sessions, transactions, policies, pending_approvals, audit_log, key_value_store)이 Drizzle 스키마로 정의되고, Enum SSoT에서 파생된 CHECK 제약이 적용된다
- [ ] **DB-02**: PRAGMA 7개(journal_mode=WAL, foreign_keys=ON, busy_timeout=5000 등)가 데몬 시작 시 실행된다
- [ ] **DB-03**: UUID v7이 모든 ID 필드에 사용되어 ms 단위 시간순 정렬이 보장된다

### 키스토어 모듈

- [ ] **KEY-01**: AES-256-GCM으로 에이전트 개인키를 암호화하고, Argon2id(m=64MiB, t=3, p=4)로 마스터 패스워드에서 키를 파생할 수 있다
- [ ] **KEY-02**: sodium-native guarded memory로 복호화된 키가 메모리에서 보호되고, 사용 후 안전하게 해제된다
- [ ] **KEY-03**: 키스토어 파일이 포맷 v1으로 저장되고, 파일 권한 0600이 적용된다

### config.toml 로더

- [ ] **CFG-01**: smol-toml로 config.toml을 파싱하고, Zod 스키마로 17개 평탄화 키를 검증한다
- [ ] **CFG-02**: 환경변수 오버라이드(WAIAAS_{SECTION}_{KEY})가 toml 값보다 우선 적용된다 (env > toml > default)

### 데몬 라이프사이클

- [ ] **LIFE-01**: 6단계 시작 시퀀스가 구현되고, 각 단계별 타임아웃(5~30초, 90초 상한)과 fail-fast/soft 전략이 적용된다
- [ ] **LIFE-02**: 10-step 종료 시퀀스가 구현되고, SQLite WAL 체크포인트가 종료 시 완료된다
- [ ] **LIFE-03**: flock 잠금으로 다중 인스턴스가 방지되고, PID 파일이 관리된다
- [ ] **LIFE-04**: BackgroundWorkers(WAL 체크포인트, 세션 만료 정리)가 주기적으로 실행된다

### Hono API 서버

- [ ] **API-01**: OpenAPIHono 인스턴스가 127.0.0.1에 바인딩되고, 포트 3100에서 요청을 수신한다
- [ ] **API-02**: 6개 미들웨어(requestId, hostGuard, killSwitchGuard, requestLogger, errorHandler, zodValidator)가 순서대로 적용된다
- [ ] **API-03**: POST /v1/agents — 에이전트를 생성하고 키 쌍을 생성·암호화 저장한다 (201 Created)
- [ ] **API-04**: GET /v1/wallet/balance — 에이전트의 SOL 잔액을 RPC로 조회하여 반환한다 (200 OK)
- [ ] **API-05**: GET /v1/wallet/address — 에이전트의 Solana 공개키를 base58로 반환한다 (200 OK)
- [ ] **API-06**: POST /v1/transactions/send — SOL 전송 요청을 파이프라인에 투입한다 (201 Created)
- [ ] **API-07**: GET /v1/transactions/:id — 트랜잭션 상태를 단건 조회한다 (200 OK)
- [ ] **API-08**: GET /health — 데몬 상태를 반환한다 (200 OK, 인증 불필요)

### SolanaAdapter

- [ ] **SOL-01**: @solana/kit 3.x 기반 SolanaAdapter가 IChainAdapter를 구현하고, connect/disconnect/isConnected/getHealth 4개 연결 관리 메서드가 동작한다
- [ ] **SOL-02**: getBalance로 네이티브 SOL 잔액을 lamports 단위로 조회할 수 있다
- [ ] **SOL-03**: buildTransaction으로 SystemProgram.transfer 기반 SOL 전송 트랜잭션을 pipe 패턴으로 빌드할 수 있다
- [ ] **SOL-04**: simulateTransaction으로 빌드된 트랜잭션을 RPC 시뮬레이션하여 사전 검증할 수 있다
- [ ] **SOL-05**: signTransaction으로 키스토어에서 복호화한 개인키로 트랜잭션에 서명할 수 있다
- [ ] **SOL-06**: submitTransaction + waitForConfirmation으로 서명된 트랜잭션을 제출하고 온체인 확정을 대기할 수 있다

### 트랜잭션 파이프라인

- [ ] **PIPE-01**: 6-stage 파이프라인 골격이 구현되고, Stage 1(Zod 검증 + DB INSERT)이 동작한다
- [ ] **PIPE-02**: Stage 2(인증)와 Stage 4(대기)는 패스스루로 구현되고, Stage 3은 INSTANT 고정(DefaultPolicyEngine)으로 구현된다
- [ ] **PIPE-03**: Stage 5(온체인 실행)가 IChainAdapter 4단계(build→simulate→sign→submit)를 순차 호출한다
- [ ] **PIPE-04**: Stage 6(확정 대기)가 waitForConfirmation 후 DB를 CONFIRMED 또는 FAILED로 업데이트한다

### CLI 명령어

- [ ] **CLI-01**: `waiaas init`이 데이터 디렉토리(~/.waiaas/), config.toml 기본값, keystore/ 디렉토리를 생성한다
- [ ] **CLI-02**: `waiaas start`가 마스터 패스워드를 입력받아 데몬을 시작하고, health check로 정상 기동을 확인한다
- [ ] **CLI-03**: `waiaas stop`이 데몬을 graceful 종료하고, PID 파일을 정리한다
- [ ] **CLI-04**: `waiaas status`가 데몬 실행 여부(running/stopped)와 포트를 표시한다

### 통합 검증

- [ ] **E2E-01**: init → start → stop → status 라이프사이클이 정상 동작한다 (E-01~E-04)
- [ ] **E2E-02**: 에이전트 생성 → 주소 조회 → 잔액 조회가 정상 동작한다 (E-05~E-07)
- [ ] **E2E-03**: SOL 전송 요청 → 트랜잭션 폴링 → CONFIRMED 전이가 완료된다 (E-08~E-09)
- [ ] **E2E-04**: 잘못된 config, 미존재 에이전트, 중복 시작 에러가 올바르게 처리된다 (E-10~E-12)

## v1.2+ Requirements (이연)

### 인증 + 정책 (v1.2)

- **AUTH-01**: sessionAuth JWT HS256 검증 미들웨어
- **AUTH-02**: masterAuth explicit 헤더 검증 미들웨어
- **AUTH-03**: ownerAuth SIWS/SIWE 서명 검증 미들웨어
- **POLICY-01**: 4-tier 정책 엔진 (INSTANT/NOTIFY/DELAY/APPROVAL)
- **POLICY-02**: Owner 3-State 상태 머신 (NONE/GRACE/LOCKED)

### 확장 CLI (v1.2~v1.3)

- **CLI-05**: `waiaas agent create/list/info` 명령어
- **CLI-06**: `waiaas session create/list/revoke` 명령어
- **CLI-07**: `--quickstart`, `--dev` 모드

### 확장 체인 (v1.4)

- **SOL-07**: SPL 토큰 전송, 컨트랙트 호출, 배치, Approve
- **CHAIN-01**: IChainAdapter 나머지 14개 메서드

## Out of Scope

| 기능 | 사유 |
|------|------|
| sessionAuth / ownerAuth 인증 | v1.2에서 구현 — v1.1은 masterAuth implicit |
| 4-tier 정책 엔진 | v1.2에서 구현 — v1.1은 INSTANT 고정 |
| SPL/ERC-20 토큰 전송 | v1.4에서 구현 — v1.1은 네이티브 SOL만 |
| EVM 체인 어댑터 | v1.4에서 구현 — v1.1은 Solana만 |
| SDK / MCP / 알림 | v1.3에서 구현 |
| Desktop / Telegram / Docker | v1.6에서 구현 |
| CI/CD 파이프라인 | v1.7에서 구현 — v1.1은 로컬 빌드·테스트만 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| (로드맵 생성 시 매핑) | | |

**Coverage:**
- v1.1 requirements: 37 total
- Mapped to phases: 0
- Unmapped: 37

---
*Requirements defined: 2026-02-10*
*Last updated: 2026-02-10 after initial definition*
