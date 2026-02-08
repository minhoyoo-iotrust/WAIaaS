# 마일스톤 v0.4: 테스트 전략 및 계획 수립

## 목표

Self-Hosted 에이전트 지갑 시스템(v0.2 설계 + v0.3 일관성 확보)의 구현 품질과 보안을 보장하기 위한 테스트 전략을 수립한다. 모듈별 테스트 레벨, mock 경계, 보안 시나리오, 블록체인 테스트 방법, 배포 환경별 검증 계획을 정의하여, 구현 단계에서 "무엇을 어떻게 테스트할 것인가"가 명확한 상태를 만든다.

## 핵심 원칙

### 1. 테스트가 설계를 검증한다
- v0.2의 설계 산출물(17개 설계 문서)에 정의된 인터페이스와 동작이 테스트로 증명 가능해야 함
- v0.3의 Enum SSoT 대응표(45-enum-unified-mapping.md)가 코드에 정확히 반영되었는지 검증
- 테스트할 수 없는 설계는 수정 대상

### 2. 보안 테스트가 기능 테스트보다 우선한다
- 지갑 시스템에서 테스트 누락은 자금 손실과 직결
- 모든 보안 계층(세션, 시간 지연, Kill Switch)에 공격 시나리오 기반 테스트 필수

### 3. 블록체인 의존성을 격리한다
- 로컬 개발/CI에서 실제 네트워크 없이 동작하는 테스트가 기본
- Devnet/Testnet 테스트는 별도 단계로 분리

---

## 모듈별 테스트 전략

### 테스트 레벨 정의

| 레벨 | 범위 | 실행 환경 | 실행 빈도 |
|------|------|-----------|-----------|
| **Unit** | 단일 함수/클래스 | 로컬, CI | 매 커밋 |
| **Integration** | 모듈 간 연동 (DB, 캐시 포함) | 로컬, CI | 매 커밋 |
| **E2E** | API 엔드포인트 → 체인 어댑터 전체 흐름 | 로컬 (mock chain) | 매 PR |
| **Chain Integration** | 실제 블록체인 네트워크 연동 | Devnet/Testnet | 주기적/릴리스 전 |
| **Security** | 공격 시나리오 재현 | 로컬, CI | 매 PR |
| **Platform** | 배포 타겟별 동작 확인 | CLI/Docker/Desktop | 릴리스 전 |

### 모듈별 테스트 매트릭스

| 모듈 (패키지) | Unit | Integration | E2E | Security | 비고 |
|------|:----:|:-----------:|:---:|:--------:|------|
| 로컬 키스토어 (`@waiaas/daemon`) | O | O | - | O | 파일 변조 감지, AES-256-GCM 암호화 검증 |
| 세션 관리 Layer 1 (`@waiaas/daemon`) | O | O | O | O | JWT 위조/만료/폐기, SessionConstraints 6필드 |
| 정책 엔진 Layer 2 (`@waiaas/daemon`) | O | O | O | O | DatabasePolicyEngine 4-tier 우회 시도, TOCTOU |
| 알림 + Kill Switch Layer 3 (`@waiaas/daemon`) | O | O | O | O | 3-state 전환, 6-step cascade, 복구 절차 |
| Solana Adapter (`@waiaas/adapter-solana`) | O | O | O | - | mock RPC + Local Validator + Devnet |
| EVM Adapter (`@waiaas/adapter-evm`) | O | - | - | - | EvmAdapterStub IChainAdapter 타입 준수만 확인 |
| REST API (`@waiaas/daemon`) | O | O | O | O | 9단계 미들웨어, 31 엔드포인트, Rate Limit |
| CLI (`@waiaas/cli`) | - | O | O | - | init/start/stop/status 명령어별 동작 확인 |
| TypeScript SDK (`@waiaas/sdk`) | O | O | - | - | API 클라이언트 래핑, Owner SDK signMessage |
| Python SDK (별도 레포) | O | O | - | - | httpx + Pydantic v2 API 클라이언트 |
| MCP Server (`@waiaas/mcp`) | O | O | - | - | 6 Tool + 3 Resource → SDK 연동 |
| Telegram Bot (`@waiaas/daemon`) | O | O | - | O | 2-Tier 인증 (chatId/ownerAuth), 인라인 키보드 |
| Desktop App (Tauri) | - | - | O | - | UI 테스트는 수동 QA |

---

## Mock 경계 정의

테스트 격리를 위해 mock으로 대체할 외부 의존성과 그 경계를 정의한다.

### Mock 대상

| 의존성 | Mock 방식 | Unit/Integration에서 | E2E에서 |
|--------|-----------|---------------------|---------|
| **블록체인 RPC** | Mock RPC 클라이언트 (IChainAdapter 주입) | Mock | Mock 또는 Local Validator |
| **알림 채널** (Telegram, Discord, ntfy.sh) | Mock 어댑터 (INotificationChannel) | Mock | Mock |
| **파일시스템** (키스토어, SQLite) | 임시 디렉토리 + 클린업 | 실제 파일 (tmpdir) | 실제 파일 (tmpdir) |
| **시간** (세션 만료, Time-Lock 대기) | 시간 주입 (Clock 인터페이스) | Mock Clock | Mock Clock |
| **Owner 지갑 서명** | Mock Signer | Mock | Mock |

### 설계 영향 — 인터페이스 주입 가능성

v0.2 설계에 이미 정의된 인터페이스:

```
IChainAdapter         — 체인 추상화 (CORE-04, 13 methods)
INotificationChannel  — 알림 채널 추상화 (NOTI-ARCH)
ILocalKeyStore        — 키 저장/로드 추상화 (CORE-03)
IPolicyEngine         — 정책 평가 추상화 (LOCK-MECH)
```

테스트 가능성을 위해 **구현 시 추가 필요한** 인터페이스:

```
IClock                — 현재 시간 제공 (세션 만료, Time-Lock 대기 테스트용 시간 조작)
ISigner               — 서명 요청 추상화 (Owner/Agent 공통, ownerAuth 테스트용)
```

> **참고:** `IClock`과 `ISigner`는 v0.2 설계 문서에 명시적으로 정의되지 않았으나, 테스트 격리를 위해 구현 단계에서 추가가 필요하다.

**구현 항목:**
- [ ] IClock, ISigner 인터페이스 정의 및 @waiaas/core에 추가
- [ ] 각 인터페이스의 Mock 구현체 정의
- [ ] 테스트 전용 의존성 주입 컨테이너 (또는 팩토리) 설계
- [ ] Mock과 실제 구현의 동작 일치 보장 (Contract Test 고려)

---

## 보안 테스트 시나리오

### Layer 1: 세션 인증 공격

| 시나리오 | 검증 내용 | 예상 결과 |
|----------|-----------|-----------|
| 만료된 세션 토큰 사용 | 만료 후 API 호출 | 401 거부 |
| 위조된 세션 토큰 사용 | 서명 없는/변조된 JWT | 401 거부 |
| 세션 한도 초과 (maxTotalAmount) | 누적 거래액이 세션 한도 도달 후 추가 요청 | 403 거부 |
| 단건 한도 초과 (maxAmountPerTx) | 단일 거래가 Per-TX Limit 초과 | 403 거부 |
| 폐기된 세션 토큰 재사용 | Kill Switch 후 동일 토큰 사용 | 401 거부 (sessionAuth Stage 2 DB 조회) |
| 허용되지 않은 작업 유형 | allowedOperations에 없는 작업 시도 | 403 거부 |
| 허용되지 않은 수신자 | allowedDestinations에 없는 주소로 전송 시도 | 403 거부 |
| 동시 세션 제한 | 최대 활성 세션 초과 시 신규 발급 | 정책에 따라 거부 또는 최고령 폐기 |
| Nonce 재사용 공격 | 동일 nonce로 세션 생성 재시도 | LRU 캐시(max 1000, TTL 5min)에서 차단 |

### Layer 2: 정책 우회 공격

| 시나리오 | 검증 내용 | 예상 결과 |
|----------|-----------|-----------|
| 금액 분할 공격 | DELAY/APPROVAL 등급을 피하기 위해 소액 다건 전송 | maxTotalAmount 세션 한도에서 차단 |
| 시간 조작 | 시스템 시간 변경으로 만료 우회 시도 | IClock 기반 서버 시간 사용, 무효 |
| 대기 중 거래 변조 | QUEUED 상태 거래의 수신자/금액 변경 시도 | 불변 트랜잭션, 재서명 필요 |
| 승인 대기 타임아웃 | Owner 승인 없이 방치 시 자동 취소 확인 | ApprovalTimeoutWorker가 1h 후 EXPIRED 처리 |
| 동시 고액 요청 (TOCTOU) | 동시에 여러 승인 필요 거래 제출 | BEGIN IMMEDIATE + reserved_amount로 이중 차감 방지 |
| DELAY 대기 중 Owner 취소 | Owner가 DELAY 큐의 거래를 reject | CANCELLED 상태 전환 |

### Layer 3: Kill Switch 및 복구

| 시나리오 | 검증 내용 | 예상 결과 |
|----------|-----------|-----------|
| Kill Switch 중 동시 거래 요청 | ACTIVATED 상태에서 거래 요청 | 거래 거부 (6-step cascade: 세션→tx→에이전트→키스토어→알림→감사) |
| AutoStopEngine 트리거 | 연속 N회 실패 (consecutive_failures 룰) | NORMAL→ACTIVATED 전환, 전 세션 폐기 |
| AutoStopEngine 시간대 감지 | anomaly_hours 룰: 허용 시간 외 거래 시도 | 경고 알림 + 자동 ACTIVATED 전환 |
| AutoStopEngine 속도 감지 | velocity 룰: 비정상 거래 빈도 감지 | 경고 알림 + 자동 ACTIVATED 전환 |
| 정지 후 복구 시도 (Agent) | ACTIVATED 상태에서 에이전트가 직접 복구 시도 | 거부 (Owner dual-auth만 복구 가능) |
| Kill Switch 복구 | Owner SIWS + 마스터 패스워드 dual-auth로 복구 | 30min 최소 쿨다운 후 RECOVERING→NORMAL 전환 |

### 키스토어 보안

| 시나리오 | 검증 내용 | 예상 결과 |
|----------|-----------|-----------|
| 키스토어 파일 변조 | AES-256-GCM 암호화 파일의 바이트 수정 후 로드 | GCM 인증 태그 검증 실패, 로드 거부 |
| 잘못된 패스워드 | 틀린 패스워드로 Argon2id KDF → 복호화 시도 | 복호화 실패, 재시도 제한 |
| 키스토어 파일 권한 | 읽기 전용이 아닌 파일 권한 감지 | 경고 로그 출력 |
| 메모리 내 키 노출 | 서명 후 메모리에서 키 잔존 여부 | sodium_memzero로 사용 직후 zero-fill |

**구현 항목:**
- [ ] 보안 시나리오별 테스트 케이스 작성 (최소 위 25개)
- [ ] 공격 시나리오 자동화 (CI에서 매 PR 실행)
- [ ] 경계값 테스트 (한도 ±1, 만료 직전/직후, 4-tier 경계: 0.1/1/10 SOL)

---

## 블록체인 테스트 전략

### 환경 분리

| 환경 | 용도 | 실행 위치 | 네트워크 비용 |
|------|------|-----------|--------------|
| **Mock RPC** | Unit/Integration 테스트 | CI, 로컬 | 없음 |
| **Local Validator** | E2E 테스트 (솔라나 전용) | CI, 로컬 | 없음 |
| **Devnet** | 체인 통합 테스트 | 수동, 스케줄 CI | 없음 (Airdrop) |
| **Testnet** | 프로덕션 전 최종 검증 | 수동 | 소액 |

### Solana 테스트 계획

**Mock RPC (기본):**
- 잔액 조회, 트랜잭션 빌드, 서명 검증 등 단위 동작
- 네트워크 오류 시뮬레이션 (타임아웃, RPC 에러 코드)
- Blockhash 만료 시나리오 (expiresAt=now+50s)

**Local Validator (E2E):**
- `solana-test-validator` 기반 실제 트랜잭션 실행
- 잔액 변동 검증, 트랜잭션 확정 대기 (polling 2s/60s)
- 전체 흐름: 세션 생성 → 정책 검증 (DatabasePolicyEngine) → 서명 → 전송 → 확인

**Devnet (주기적):**
- 실제 네트워크 지연, 수수료 확인
- RPC 프로바이더(Helius) 호환성 테스트
- 장시간 운영 안정성 (세션 만료/갱신 사이클)

**구현 항목:**
- [ ] Mock RPC 클라이언트 구현 (성공/실패/지연 시나리오)
- [ ] Local Validator 자동 시작/종료 (Vitest globalSetup)
- [ ] Devnet 테스트 스크립트 및 CI 스케줄 잡

### EVM 테스트 (인터페이스 단계)

- EvmAdapterStub의 IChainAdapter 13 methods 준수 여부를 타입 레벨에서 검증
- 모든 메서드가 CHAIN_NOT_SUPPORTED 에러를 throw하는지 확인
- 실제 EVM 네트워크 연동 테스트는 EVM Adapter 본 구현 시 정의

---

## 배포 타겟별 테스트

### CLI Daemon

| 테스트 항목 | 방법 | 자동화 |
|-------------|------|--------|
| `waiaas init` 초기 설정 | 임시 디렉토리에서 실행 → ~/.waiaas/ 생성, config.toml 확인 | CI |
| `waiaas start` 데몬 시작 | 프로세스 기동 → /v1/health 헬스체크 → 종료 | CI |
| `waiaas stop` 데몬 종료 | 10-step graceful shutdown, 데이터 무결성 확인 | CI |
| `waiaas status` 상태 확인 | 데몬 실행 중/미실행 시 출력 확인 | CI |
| 시그널 처리 (SIGTERM, SIGINT) | 정상 종료, ILocalKeyStore.lock() + sodium_memzero 확인 | CI |
| Windows HTTP 종료 fallback | /v1/admin/shutdown 호출로 정상 종료 | CI (Windows) |

### Docker

| 테스트 항목 | 방법 | 자동화 |
|-------------|------|--------|
| 이미지 빌드 | `docker build` 성공 (non-root waiaas:1001) | CI |
| 컨테이너 기동 | `docker-compose up` → 헬스체크 | CI |
| Named Volume 마운트 | 데이터 디렉토리 영속성 확인 | CI |
| 환경 변수 + Secrets | 설정 오버라이드 + _FILE 패턴 동작 확인 | CI |
| hostname 오버라이드 | 0.0.0.0 바인딩 (Docker 환경 기본 127.0.0.1 → 0.0.0.0) | CI |
| stop_grace_period | 35s (30s daemon + 5s margin) 내 정상 종료 | CI |

### Desktop App (Tauri 2.x)

| 테스트 항목 | 방법 | 자동화 |
|-------------|------|--------|
| 앱 빌드 | macOS/Linux/Windows 빌드 성공 | CI |
| Sidecar (Node.js SEA) | 데몬 자동 시작, crash 감지 2회 → auto-restart max 3x | CI |
| 8개 화면 렌더링 | Dashboard, Pending Approvals, Sessions, Agents, Transactions, Settings, System Status, Setup Wizard | 수동 QA |
| Setup Wizard 5-step | 마스터 패스워드 → 체인 선택 → 에이전트 → Owner 연결 → 완료 | 수동 QA |
| Owner 지갑 연결 | WalletConnect v2 QR 코드 → 서명 → 연결 확인 | 수동 QA |
| 시스템 트레이 | 3-color 아이콘 (Green/Yellow/Red), 메뉴, 알림 | 수동 QA |

### Telegram Bot

| 테스트 항목 | 방법 | 자동화 |
|-------------|------|--------|
| Long Polling 연결 | native fetch 기반 Telegram API 연결 확인 | CI (mock) |
| Tier 1 인증 (chatId) | 등록된 chatId로 /status, /sessions 조회 | CI (mock) |
| Tier 2 인증 (ownerAuth) | 미등록 chatId의 approve/kill-switch 시도 → 거부 | CI (mock) |
| 인라인 키보드 응답 | 승인/거부 버튼 클릭 → 콜백 처리 | CI (mock) |

**구현 항목:**
- [ ] CLI 통합 테스트 스위트 (spawn + assert)
- [ ] Docker smoke test (docker-compose 기반)
- [ ] Desktop App 수동 QA 체크리스트 (8 화면 + Setup Wizard)
- [ ] Telegram Bot mock 테스트 (Long Polling 시뮬레이션)

---

## 커버리지 기준

| 패키지 | 목표 커버리지 | 근거 |
|--------|-------------|------|
| `@waiaas/core` (도메인, 인터페이스, Zod 스키마) | 90%+ | SSoT Enum/스키마, 보안 인터페이스 정의 |
| `@waiaas/daemon` (키스토어, 정책엔진, 세션, API, Kill Switch) | 90%+ | 보안 핵심 로직 전체 포함, 가장 높은 신뢰 필요 |
| `@waiaas/adapter-solana` (SolanaAdapter) | 80%+ | 외부 의존성(RPC) 비중 높음, mock 한계 |
| `@waiaas/adapter-evm` (EvmAdapterStub) | 50%+ | Stub만 존재, IChainAdapter 타입 준수 확인 |
| `@waiaas/cli` (CLI 명령어) | 70%+ | 프로세스 관리 코드는 통합 테스트 위주 |
| `@waiaas/sdk` (TypeScript SDK) | 80%+ | 공개 인터페이스, 타입 안정성 |
| Python SDK (waiaas-python, 별도 레포) | 80%+ | httpx + Pydantic v2, 공개 인터페이스 |
| `@waiaas/mcp` (MCP Server) | 70%+ | SDK 위의 얇은 레이어 (6 tools, 3 resources) |
| Desktop App (Tauri) | 측정 제외 | UI는 수동 QA 중심 |

**구현 항목:**
- [ ] Vitest 커버리지 설정 (v8 또는 istanbul)
- [ ] CI에서 커버리지 게이트 (기준 미달 시 실패)
- [ ] 커버리지 리포트 자동 생성

---

## Enum / 설정값 일관성 테스트

v0.3에서 확보한 9개 Enum SSoT(45-enum-unified-mapping.md)와 config.toml 통합(24-monorepo)이 구현 코드에 정확히 반영되었는지 검증한다.

### Enum SSoT 검증

| Enum | DB CHECK | Drizzle | Zod | TypeScript | 검증 방법 |
|------|:--------:|:-------:|:---:|:----------:|-----------|
| TransactionStatus (8값) | O | O | O | O | 스키마 동기화 테스트 |
| TransactionTier (4값) | O | O | O | O | 스키마 동기화 테스트 |
| AgentStatus (5값) | O | O | O | O | 스키마 동기화 테스트 |
| PolicyType (4값) | O | O | O | O | 스키마 동기화 테스트 |
| NotificationChannelType (3값) | O | O | O | O | 스키마 동기화 테스트 |
| AuditLogSeverity (3값) | O | O | O | O | 스키마 동기화 테스트 |
| AuditLogEventType (23+값) | O | O | O | O | 스키마 동기화 테스트 |
| KillSwitchStatus (3값) | O | O | O | O | 스키마 동기화 테스트 |
| AutoStopRuleType (5값) | O | O | O | O | 스키마 동기화 테스트 |

### config.toml 검증

- [ ] 기본값 테스트: config.toml 없이 시작 시 모든 기본값 적용 확인
- [ ] 부분 오버라이드: 일부 값만 지정 시 나머지 기본값 유지 확인
- [ ] Zod 검증: 잘못된 설정값 (범위 초과, 타입 불일치) 거부 확인
- [ ] Docker 환경변수 오버라이드: 환경변수 > config.toml > 기본값 우선순위 확인
- [ ] 중첩 섹션: security.auto_stop, policy_defaults, kill_switch 등 올바르게 파싱

### 구현 노트 참조 (v0.3 NOTE-01~11)

구현 시 다음 노트의 제약사항이 테스트에 반영되어야 한다:
- [ ] 각 구현 노트의 제약/경고를 테스트 케이스로 변환
- [ ] 노트에서 식별된 엣지케이스가 보안 테스트에 포함되었는지 검증

---

## CI/CD 테스트 파이프라인

### 매 커밋 (Push)
```
lint → type-check → unit tests → coverage check
```

### 매 PR (Pull Request)
```
lint → type-check → unit tests → integration tests → e2e tests (mock chain) → security tests → enum consistency check → coverage gate
```

### 주기적 (Nightly/Weekly)
```
Devnet chain integration tests → 장시간 운영 테스트 (세션 사이클)
```

### 릴리스 전
```
전체 테스트 스위트 → Docker smoke test → CLI 통합 테스트 → Telegram Bot mock test → Desktop QA 체크리스트 → Devnet 전체 흐름
```

**구현 항목:**
- [ ] GitHub Actions 워크플로우 정의 (push, PR, nightly)
- [ ] 테스트 단계별 타임아웃 설정
- [ ] 실패 시 알림 (Slack/Discord)

---

## 성공 기준

### 전략 완성도
- [ ] 모든 구현 모듈(7개 모노레포 패키지 + Python SDK + Desktop)에 대해 테스트 레벨과 방법이 정의됨
- [ ] Mock 경계가 명확히 정의되고, 기존 인터페이스 4개 + 신규 인터페이스 2개가 식별됨
- [ ] 보안 시나리오 25개 이상 정의됨

### 구현 준비도
- [ ] 테스트 전략이 v0.2 설계의 인터페이스에 피드백을 주어, 테스트 불가능한 설계가 수정됨
- [ ] v0.3 Enum SSoT 일관성 검증 방법이 확정됨
- [ ] CI 파이프라인 구조가 확정되어 구현 첫날부터 테스트 실행 가능
- [ ] 커버리지 기준이 패키지별로 합의됨

### 블록체인 테스트
- [ ] Mock RPC / Local Validator / Devnet 3단계 환경이 정의됨
- [ ] 각 환경에서 실행할 테스트 범위가 명확함

---

## 마일스톤 범위 외 (Out of Scope)

- 테스트 코드 자체의 구현 (구현 마일스톤에서 수행)
- 성능/부하 테스트 (별도 마일스톤으로 분리 가능)
- Formal verification (수학적 증명)
- 외부 보안 감사 (펜테스트 업체)

---

## 선행 마일스톤과의 관계

본 마일스톤(v0.4)의 산출물은 v0.2 설계와 v0.3 일관성 확보를 **역방향으로 검증**한다:

```
v0.2 (설계, 17개 문서)              v0.4 (테스트 전략)
──────────────────                  ─────────────────
IChainAdapter 등 인터페이스  ←────  Mock 가능 여부 확인
3계층 보안 설계              ←────  공격 시나리오 도출 (25+개)
SolanaAdapter / EvmStub      ←────  블록체인 테스트 환경 정의
CLI / Docker / Desktop       ←────  플랫폼별 테스트 범위 정의

v0.3 (일관성 확보, 5개 대응표)      v0.4 (테스트 전략)
──────────────────────────          ─────────────────
9개 Enum SSoT 대응표         ←────  Enum 일관성 자동 검증
config.toml 통합             ←────  설정값 검증 테스트
11개 구현 노트 (NOTE-01~11)  ←────  엣지케이스 테스트 케이스화
```

테스트 전략 수립 과정에서 발견된 설계 개선 사항(IClock, ISigner 인터페이스 추가 등)은 구현 시 반영한다.

---

## 기본 규칙

- 모든 설계 문서는 한글로 작성
- 테스트 전략은 "무엇을 테스트하는가"에 집중 (구현 방법은 구현 단계에서)
- 보안 테스트는 기능 테스트보다 우선하여 정의
- 과도한 테스트 계획보다 핵심 경로의 높은 커버리지를 추구

---

*작성일: 2026-02-05*
*최종 수정: 2026-02-06 (v0.2/v0.3 설계 정합성 반영)*
*상태: 초안*
