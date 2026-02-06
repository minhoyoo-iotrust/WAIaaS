# Phase 13: MEDIUM 구현 노트 - Research

**Researched:** 2026-02-06
**Domain:** v0.2 설계 문서에 구현 시 주의사항 (MEDIUM 11건) 추가
**Confidence:** HIGH

## Summary

Phase 13은 v0.3 설계 논리 일관성 확보의 마지막 단계로, Phase 10-12에서 CRITICAL 8건과 HIGH 15건을 해소한 후 남은 MEDIUM 우선순위 14건 중 11건을 구현 노트(NOTE-01~NOTE-11)로 해당 v0.2 설계 문서에 추가한다. (M1, M3, M5는 Phase 12에서 이미 해결되어 제외.)

40개 설계 문서를 직접 분석한 결과, 11건의 MEDIUM 항목은 크게 2개 영역으로 분류된다:

1. **단위 변환/매핑/패리티** (8건: NOTE-01, NOTE-03, NOTE-04, NOTE-09, NOTE-10, NOTE-11 + NOTE-02, NOTE-08): BalanceInfo.amount lamports/SOL 변환 규칙 미명시, MCP 6개 도구와 REST 31개 엔드포인트 간 기능 패리티 미검증, SDK 36개 에러 코드 매핑 전략 부재, 에이전트 생명주기 v0.1 5단계와 v0.2 agents.status 매핑 미검증, Python SDK snake_case 변환 일관성, 커서 페이지네이션 파라미터명 불일치 가능성 등.

2. **통합/인증/배포** (3건: NOTE-05, NOTE-06, NOTE-07): Tauri IPC + HTTP 이중 채널 에러 처리 전략, Setup Wizard vs CLI init 초기화 순서 미세 차이, Telegram 환경 SIWS Tier 2 인증 수행 방법 미정의 등.

모든 항목은 기존 설계를 변경하지 않고, 해당 v0.2 설계 문서에 "구현 노트" 섹션을 추가하는 방식으로 처리한다.

**Primary recommendation:** 2개 PLAN으로 분리하여 (1) 단위 변환/매핑/패리티 구현 노트 8건, (2) 통합/인증/배포 구현 노트 3건을 수행하라. 각 구현 노트는 해당 문서의 마지막에 "구현 노트" 또는 "Implementation Notes" 섹션으로 추가하되, 매트릭스/대응표가 필요한 경우 해당 섹션 내에 표로 포함한다.

---

## NOTE-01: BalanceInfo.amount 단위 변환 규칙 (M2)

### 현재 상태 분석

**BalanceInfo 타입 (CORE-04, 27-chain-adapter-interface.md:307):**
```typescript
interface BalanceInfo {
  address: string
  balance: bigint           // 최소 단위 (lamports/wei)
  decimals: number          // SOL=9, ETH=18
  symbol: string            // 'SOL', 'ETH'
  usdValue?: number         // v0.2 미구현
}
```

**REST API BalanceResponse (API-SPEC, 37-rest-api-complete-spec.md:404):**
```typescript
const BalanceResponseSchema = z.object({
  balance: z.string(),      // 최소 단위 문자열
  decimals: z.number().int(),
  symbol: z.string(),
  formatted: z.string(),    // "1.5 SOL"
  chain: z.string(),
  network: z.string(),
})
```

**DB transactions.amount (CORE-02, 25-sqlite-schema.md:248):**
- TEXT 타입, lamports/wei 단위 저장

**TransferRequest.amount (CORE-04, 27-chain-adapter-interface.md):**
- `amount: TokenAmount` (raw: bigint, 최소 단위)

### 불일치 포인트

1. BalanceInfo.balance는 `bigint` (최소 단위)인데, REST API에서 `z.string()`으로 반환. 변환 규칙이 명시적이지 않음.
2. `formatted` 필드("1.5 SOL")는 ChainAdapter에 없고 REST API에서만 존재. 변환 공식이 미문서화.
3. MCP send_token 도구 description에 "lamports for SOL: 1 SOL = 1,000,000,000 lamports" 기술되어 있으나, SDK/API 레벨의 변환 헬퍼가 미정의.
4. SDK TransferRequest.amount도 "최소 단위"를 요구하나 단위 명시가 SDK description에만 있고 스키마 검증에는 없음.

### 구현 노트 작성 방향

CORE-04 (27-chain-adapter-interface.md)에 다음을 추가:
- **저장/전송 레이어:** 모든 금액은 최소 단위(lamports/wei) bigint로 처리
- **API 레이어 변환 공식:** `formatted = (balance / 10^decimals).toFixed(decimals) + ' ' + symbol`
- **SDK 레이어:** 변환 헬퍼 함수 인터페이스 (`formatAmount`, `parseAmount`)
- **체인별 변환표:** SOL: 1 SOL = 10^9 lamports, ETH: 1 ETH = 10^18 wei

**Confidence:** HIGH -- 문서 직접 비교 완료

---

## NOTE-02: 알림 채널 최소 요구 명확화 (M4)

### 현재 상태 분석

**NOTI-ARCH (35-notification-architecture.md:7):**
- "최소 2채널 설정 필수 + 폴백 체인" (NOTI-02)
- 섹션 9.3: 채널 삭제/비활성화 시 `activeCount < 2` 검증으로 차단
- 채널 0개면 알림 기능 비활성 (INSTANT만 동작) -- "제한 모드"

**config.toml (CORE-01, 24-monorepo-data-directory.md:726):**
```toml
[notifications]
enabled = false          # 알림 시스템 활성화 여부

[notifications.telegram]
bot_token = ""
chat_id = ""
```
- `enabled = false`가 기본값으로, 알림 시스템 자체가 비활성
- 채널별 설정은 빈 문자열이 기본값 -- "설정됨/안됨"의 구분이 없음

**Setup Wizard (TAURI-DESK, 39-tauri-desktop-architecture.md:1014):**
- Step 4에서 "최소 2개 채널 구성 + 테스트 전송 성공" 요구

### 불일치 포인트

1. NOTI-ARCH에서 "최소 2채널 필수"라고 하지만 config.toml `enabled = false`가 기본이면 채널 0개로 시작
2. "제한 모드" (채널 0개: INSTANT만 동작)와 "최소 2채널 필수"가 모순적
3. 해결: "최소 2채널은 NOTIFY/DELAY/APPROVAL 티어 사용 시 필수"이고, INSTANT만 사용하면 채널 불필요임을 명시해야 함

### 구현 노트 작성 방향

NOTI-ARCH (35-notification-architecture.md)에 다음을 추가:
- **정책 엔진과의 연동 규칙:** 활성 채널 < 2이면 NOTIFY/DELAY/APPROVAL 티어 정책을 적용할 수 없음
- **config.toml과의 관계:** `enabled = true`이고 활성 채널 >= 2일 때만 전체 4-tier 정책 동작
- **초기화 시나리오별 동작:** waiaas init 직후(채널 0개) -> INSTANT만 허용, 채널 설정 후 -> 4-tier 활성화

**Confidence:** HIGH -- 문서 직접 비교 완료

---

## NOTE-03: MCP 기능 패리티 매트릭스 (M6)

### 현재 상태 분석

**MCP 도구 6개 (SDK-MCP, 38-sdk-mcp-interface.md:1832):**

| # | Tool Name | REST API Endpoint |
|---|-----------|-------------------|
| 1 | `send_token` | POST /v1/transactions/send |
| 2 | `get_balance` | GET /v1/wallet/balance |
| 3 | `get_address` | GET /v1/wallet/address |
| 4 | `list_transactions` | GET /v1/transactions |
| 5 | `get_transaction` | GET /v1/transactions/:id |
| 6 | `get_nonce` | GET /v1/nonce |

**MCP 리소스 3개:**

| # | Resource | REST API Endpoint |
|---|----------|-------------------|
| 1 | `wallet-balance` | GET /v1/wallet/balance |
| 2 | `wallet-address` | GET /v1/wallet/address |
| 3 | `system-status` | GET /health |

**REST API 전체 31개 엔드포인트 (API-SPEC, 37-rest-api-complete-spec.md:44):**

| 카테고리 | 엔드포인트 수 | MCP 커버 | 비고 |
|---------|-------------|---------|------|
| Public API | 3 | 2/3 | /health(리소스), /nonce(도구), /doc(미커버-설계상 제외) |
| Session API (Agent) | 5 | 5/5 | 도구 6개 중 5개 + 리소스 2개로 전체 커버 |
| Session Management API | 3 | 0/3 | Owner 전용 -- MCP 미노출(설계 의도) |
| Owner API | 17 | 0/17 | Owner 전용 -- MCP 미노출(설계 의도) |
| Admin API | 3 | 0/3 | Admin 전용 -- MCP 미노출(설계 의도) |

### 분석

MCP 도구 6개는 Agent API(Session Bearer)만 커버하며, Owner/Admin/Session Management API는 의도적으로 제외되었다. 이는 "MCP Pitfall 2: Tool 과다 등록 방지" 결정에 따른 것이다. MCP는 AI 에이전트가 사용하는 것이므로 에이전트 권한 범위(잔액 조회, 거래 실행, 이력 조회)만 노출하는 것이 보안상 올바르다.

### 구현 노트 작성 방향

SDK-MCP (38-sdk-mcp-interface.md)에 기능 패리티 매트릭스 표를 추가:
- 31개 REST 엔드포인트 전체를 나열하고, MCP Tool/Resource 매핑 여부를 명시
- "의도적 미커버"와 "v0.3+ 확장 후보"를 구분
- 근거 컬럼으로 보안/설계 이유 명시

**Confidence:** HIGH -- 문서 직접 비교 완료, 매트릭스 작성 가능

---

## NOTE-04: SDK 에러 타입 매핑 전략 (M7)

### 현재 상태 분석

**REST API 에러 코드 36개 (API-SPEC, 37-rest-api-complete-spec.md:2300):**

| 도메인 | 코드 수 | 주요 에러 |
|--------|--------|-----------|
| AUTH | 8 | INVALID_TOKEN, TOKEN_EXPIRED, SESSION_REVOKED, INVALID_SIGNATURE, INVALID_NONCE, INVALID_MASTER_PASSWORD, MASTER_PASSWORD_LOCKED, SYSTEM_LOCKED |
| SESSION | 4 | SESSION_NOT_FOUND, SESSION_EXPIRED, SESSION_LIMIT_EXCEEDED, CONSTRAINT_VIOLATED |
| TX | 7 | INSUFFICIENT_BALANCE, INVALID_ADDRESS, TX_NOT_FOUND, TX_EXPIRED, TX_ALREADY_PROCESSED, CHAIN_ERROR, SIMULATION_FAILED |
| POLICY | 4 | POLICY_DENIED, SPENDING_LIMIT_EXCEEDED, RATE_LIMIT_EXCEEDED, WHITELIST_DENIED |
| OWNER | 4 | OWNER_ALREADY_CONNECTED, OWNER_NOT_CONNECTED, APPROVAL_TIMEOUT, APPROVAL_NOT_FOUND |
| SYSTEM | 6 | KILL_SWITCH_ACTIVE, KILL_SWITCH_NOT_ACTIVE, KEYSTORE_LOCKED, CHAIN_NOT_SUPPORTED, SHUTTING_DOWN, ADAPTER_NOT_AVAILABLE |
| AGENT | 3 | AGENT_NOT_FOUND, AGENT_SUSPENDED, AGENT_TERMINATED |

**TS SDK WAIaaSError (SDK-MCP, 38-sdk-mcp-interface.md:866):**
```typescript
class WAIaaSError extends Error {
  readonly code: string      // 에러 코드 (예: 'INVALID_TOKEN')
  readonly statusCode: number
  readonly retryable: boolean
  readonly requestId?: string
  readonly details?: Record<string, unknown>
}
```

**Python SDK WAIaaSError (SDK-MCP, 38-sdk-mcp-interface.md:1676):**
```python
class WAIaaSError(Exception):
    code: str
    status_code: int
    retryable: bool
    request_id: Optional[str]
    details: Optional[dict[str, Any]]
```

### 분석

현재 SDK는 `code`를 `string` 타입으로 저장한다. 36개 에러 코드를 타입 수준에서 매핑하는 전략이 없다. TS SDK에서 `error.code === 'INSUFFICIENT_BALANCE'`와 같은 문자열 비교만 가능하며, 자동완성/타입 체크가 불가능하다.

### 구현 노트 작성 방향

SDK-MCP (38-sdk-mcp-interface.md)에 다음을 추가:
- **TS SDK:** `WAIaaSErrorCode` const enum 또는 union type 정의 (36개 코드)
- **Python SDK:** `ErrorCode` string literal enum (36개 코드)
- **도메인별 에러 서브클래스 불필요:** 단일 `WAIaaSError`에 `code` 필드로 구분 (현행 유지)
- **retryable 판정 로직:** HTTP 상태 코드 기반 (429, 502, 503, 504)으로 현행 유지
- **MCP 에러 매핑:** MCP Tool은 에러 시 `isError: true`와 함께 JSON text로 code/message 반환 (현행 유지)

**Confidence:** HIGH -- 문서 직접 비교 완료

---

## NOTE-05: Tauri IPC + HTTP 이중 채널 전략 (M8)

### 현재 상태 분석

**TAURI-DESK (39-tauri-desktop-architecture.md):**

두 가지 통신 경로가 하이브리드로 사용된다:

| 경로 | 용도 | 메커니즘 |
|------|------|----------|
| Tauri IPC (`invoke()`) | 데몬 프로세스 관리 | Rust 함수 직접 호출 |
| HTTP localhost | API 호출 | `@waiaas/sdk` fetch |

**IPC 커맨드 (39-tauri-desktop-architecture.md:136):**
- `start_daemon` -> DaemonStatus
- `stop_daemon` -> ()
- `restart_daemon` -> DaemonStatus
- `get_daemon_status` -> DaemonStatus
- `get_daemon_logs` -> string
- `send_notification` -> ()

**HTTP API:** @waiaas/sdk WAIaaSOwnerClient 사용, fetch 기반

### 분석

현재 에러 처리에 대한 통합 전략이 없다:
1. IPC 에러: Rust `tauri::Error` -> WebView JS에서 catch
2. HTTP 에러: `WAIaaSError` (SDK 에러 클래스)
3. 데몬 미실행 시: HTTP 요청이 `ECONNREFUSED` 에러를 반환하지만, 사용자에게 "데몬을 시작해주세요"로 변환해야 함
4. IPC + HTTP 시퀀스 에러: 예를 들어 start_daemon(IPC) 성공 후 API 호출(HTTP) 실패 시 상태 불일치

### 구현 노트 작성 방향

TAURI-DESK (39-tauri-desktop-architecture.md)에 다음을 추가:
- **에러 분류 표:** IPC 에러 vs HTTP 에러 vs 혼합 에러
- **ECONNREFUSED 처리:** 데몬 미실행 감지 -> 자동 시작 시도 또는 사용자 안내
- **상태 동기화:** IPC DaemonStatus와 HTTP /health 응답의 조합으로 최종 상태 결정
- **에러 전파 패턴:** React hook에서 두 채널의 에러를 통합 표시하는 패턴

**Confidence:** HIGH -- 문서 직접 분석 완료

---

## NOTE-06: Setup Wizard vs CLI init 순서 정리 (M9)

### 현재 상태 분석

**CLI `waiaas init` (CORE-05, 28-daemon-lifecycle-cli.md:1137):**
4단계:
1. Step 1: 마스터 비밀번호 설정 (최소 12자)
2. Step 2: 첫 번째 에이전트 생성? (선택적)
3. Step 3: 알림 채널 설정? (선택적, Phase 8에서 상세)
4. Step 4: Owner 지갑 주소 등록? (선택적, Phase 8에서 상세)

실행 순서: 디렉토리 생성 -> config.toml -> SQLite 초기화 -> 키스토어 초기화 -> (에이전트 생성)

**Setup Wizard (TAURI-DESK, 39-tauri-desktop-architecture.md:988):**
5단계:
1. Step 1: 마스터 패스워드 설정 (8자 이상)
2. Step 2: 체인 선택 + 에이전트 생성 (필수)
3. Step 3: Owner 지갑 연결 (WalletConnect QR, 필수)
4. Step 4: 알림 채널 설정 (최소 2개, 필수)
5. Step 5: 완료 확인

백엔드 연동: Step 1-2는 `waiaas init` CLI, Step 3은 POST /v1/owner/connect, Step 4는 PUT /v1/owner/settings

### 불일치 포인트

| 항목 | CLI init | Setup Wizard | 차이 |
|------|----------|-------------|------|
| 패스워드 최소 길이 | 12자 | 8자 | 불일치 |
| 에이전트 생성 | 선택적 | 필수 | Setup Wizard가 더 엄격 |
| Owner 지갑 | 선택적 | 필수 (WalletConnect) | Setup Wizard가 더 엄격 |
| 알림 채널 | 선택적 | 필수 (최소 2개) | Setup Wizard가 더 엄격 |
| 단계 수 | 4단계 | 5단계 | 완료 확인 차이 |
| 순서 | 패스워드 -> 에이전트 -> 알림 -> Owner | 패스워드 -> 에이전트 -> Owner -> 알림 | Owner와 알림 순서 역전 |

### 구현 노트 작성 방향

CORE-05 (28-daemon-lifecycle-cli.md)와 TAURI-DESK (39-tauri-desktop-architecture.md) 양쪽에 추가:
- **패스워드 최소 길이 통일:** 12자로 통일 (보안 우선)
- **CLI = 최소 초기화, Wizard = 완전 초기화:** CLI는 데몬 실행 가능한 최소 상태(패스워드 + 데이터 디렉토리)만 설정, 나머지는 API로 나중에 설정 가능
- **Wizard는 CLI init + 추가 API 호출:** Step 1-2는 CLI init 실행, Step 3-4는 데몬 시작 후 API 호출
- **초기화 순서 차이 근거:** Owner 지갑 연결(Step 3)은 데몬이 실행 중이어야 하므로 CLI init 범위 밖

**Confidence:** HIGH -- 문서 직접 비교 완료

---

## NOTE-07: Telegram SIWS 서명 방안 (M10)

### 현재 상태 분석

**2-Tier 인증 모델 (TGBOT-DOCKER, 40-telegram-bot-docker.md:1114):**

| Tier | 인증 방법 | 허용 동작 |
|------|----------|----------|
| Tier 1 (chatId) | 등록된 Owner chatId 검증 | reject, revoke, kill switch activate, 읽기 |
| Tier 2 (ownerAuth) | SIWS/SIWE per-request 서명 | approve, recover, create, settings |

**현재 결론 (40-telegram-bot-docker.md:1145):**
- Tier 2 동작은 "Desktop/CLI 필수"로 분류
- Telegram에서 [Approve] 누르면 TELEGRAM_PRE_APPROVED 중간 상태로 전이
- 최종 승인은 Desktop/CLI에서 ownerAuth로 수행

### 분석

Telegram 환경에서 SIWS 서명을 수행하는 것은 기술적으로 불가능하지 않으나 UX가 매우 복잡하다:
1. Telegram Mini App으로 WalletConnect QR 표시 -> Phantom/MetaMask로 서명 -> 서명 결과를 Bot에 전달
2. 이 흐름은 UX가 복잡하고, Mini App 개발이 추가로 필요

현재 설계의 TELEGRAM_PRE_APPROVED 패턴은 실질적으로 합리적이다:
- Tier 1으로 "거부"만 가능 (방어적 동작)
- "승인"은 Desktop/CLI로 유도 (보안 원칙 유지)
- 사용자가 Telegram에서 [Pre-Approve] -> Desktop 알림 -> Desktop에서 최종 승인

### 구현 노트 작성 방향

TGBOT-DOCKER (40-telegram-bot-docker.md)에 다음을 추가:
- **v0.2 결정:** Telegram에서 Tier 2(SIWS) 서명 미지원. TELEGRAM_PRE_APPROVED 패턴으로 대체
- **v0.3+ 확장 후보:** Telegram Mini App + WalletConnect DeepLink 연동
- **Pre-Approve 흐름 상세:** 상태 전이 다이어그램 (QUEUED -> TELEGRAM_PRE_APPROVED -> Desktop에서 APPROVED -> EXECUTING)
- **보안 근거:** Tier 2 동작은 자금 이동/시스템 복구이므로 지갑 서명 필수 원칙 유지

**Confidence:** HIGH -- 문서에 이미 2-Tier 결론이 내려져 있음, 구현 노트로 명시화만 필요

---

## NOTE-08: Docker graceful shutdown 검증 (M11)

### 현재 상태 분석

**10단계 Graceful Shutdown (CORE-05, 28-daemon-lifecycle-cli.md:464):**

| Step | 동작 | 시간 소요 |
|------|------|----------|
| 1 | 시그널 수신 + 플래그 설정 | ~0ms |
| 2 | HTTP 서버 신규 연결 거부 (server.close()) | ~0ms |
| 3 | Connection: close 헤더 설정 | ~0ms |
| 4 | In-flight HTTP 요청 완료 대기 | 최대 30초 (shutdown_timeout) |
| 5 | 진행 중 서명 작업 완료 (CRITICAL) | Solana 60초 blockhash 수명 내 |
| 6 | Pending queue 상태 저장 | ~100ms |
| 7 | 백그라운드 워커 중지 | ~1초 |
| 8 | WAL 최종 체크포인트 | ~100ms |
| 9 | 키스토어 잠금 (sodium_memzero) | ~10ms |
| 10 | 최종 정리 (DB close, PID 삭제) | ~0ms |

**30초 강제 종료 타이머:** Step 1에서 `setTimeout(() => process.exit(1), 30_000)` 설정

**Docker stop_grace_period (TGBOT-DOCKER, 40-telegram-bot-docker.md):**
- `stop_grace_period: 35s` (30초 daemon + 5초 마진)
- Docker 기본값 10초 -> 35초로 오버라이드

### 검증

| 시나리오 | 소요 시간 | 35초 내? |
|---------|----------|---------|
| 정상 종료 (요청 없음) | Step 1-3(~0ms) + Step 6-10(~1.2초) = ~1.2초 | OK |
| In-flight 요청 있음 | Step 4 최대 30초 + Step 5-10(~1.5초) = ~31.5초 | OK (5초 마진) |
| 서명 진행 중 | Step 4 + Step 5(최대 수 초) + Step 6-10 = ~33초 | OK (2초 마진) |
| 최악 케이스 | Step 4(30초) + Step 5 길어질 경우 | 30초 강제 타이머 발동 -> exit(1) |

**문제점:** Step 5(서명 작업 완료)가 Step 4(30초 타임아웃)와 **순차적**이지만, 30초 강제 종료 타이머가 Step 1에서 시작되므로 Step 4가 30초 소요하면 Step 5부터는 강제 종료 대상이 된다. 실제로는 Step 4와 Step 5가 겹칠 수 있어 문제없으나, 명시적 검증이 필요하다.

### 구현 노트 작성 방향

CORE-05 (28-daemon-lifecycle-cli.md)와 TGBOT-DOCKER (40-telegram-bot-docker.md) 양쪽에 추가:
- **타임라인 다이어그램:** 30초 강제 타이머 vs 10단계 합산 시간의 관계
- **Step 4-5 병렬성 명시:** In-flight 요청 중 서명 작업이 포함되면 Step 4에서 이미 대기, Step 5는 추가 대기 불필요
- **Docker stop_grace_period 35초 근거:** 30초 강제 타이머 + 5초 마진 (SIGKILL 전 여유)
- **Telegram Bot 종료:** Long Polling getUpdates 요청의 30초 timeout 내 자연 종료

**Confidence:** HIGH -- 코드 수준 분석 완료

---

## NOTE-09: 에이전트 생명주기 매핑 (M12)

### 현재 상태 분석

**v0.1 에이전트 상태 모델 (REL-03, 15-agent-lifecycle-management.md:74):**
5단계: CREATING -> ACTIVE -> SUSPENDED -> TERMINATING -> TERMINATED

| v0.1 상태 | v0.1 DB 값 | v0.1 온체인(Squads) |
|----------|-----------|-------------------|
| CREATING | `creating` | 멤버 추가 중 |
| ACTIVE | `active` | 멤버 등록됨, SpendingLimit 활성 |
| SUSPENDED | `suspended` | 멤버 유지, SpendingLimit 비활성화 |
| TERMINATING | `terminating` | 멤버 제거 진행 중 |
| TERMINATED | `terminated` | 멤버 아님 |

**v0.2 에이전트 상태 (CORE-02, 25-sqlite-schema.md:91):**
5개 값: `CREATING, ACTIVE, SUSPENDED, TERMINATING, TERMINATED`

**v0.2 상태 전이 규칙:**
- Squads/온체인 의존성 제거 (Self-Hosted 로컬)
- 상태 전이 트리거 변경: Circuit Breaker -> AutoStopEngine, Squads 멤버 관리 -> 로컬 키스토어
- suspension_reason 컬럼 추가 (kill_switch, policy_violation, manual, auto_stop)

### 매핑 결과

| v0.1 | v0.2 | 동일? | 차이점 |
|------|------|------|-------|
| CREATING (creating) | CREATING (CREATING) | 값 동일, 케이스 다름 | v0.1: lowercase, v0.2: UPPERCASE. v0.1: Squads 멤버 등록 포함, v0.2: 키 생성 + 지갑 주소 생성만 |
| ACTIVE (active) | ACTIVE (ACTIVE) | 값 동일, 케이스 다름 | v0.1: SpendingLimit 활성, v0.2: 정책 엔진 활성 |
| SUSPENDED (suspended) | SUSPENDED (SUSPENDED) | 값 동일, 케이스 다름 | v0.1: SpendingLimit 비활성화(온체인), v0.2: 로컬 정책으로 요청 차단 + suspension_reason 추가 |
| TERMINATING (terminating) | TERMINATING (TERMINATING) | 값 동일, 케이스 다름 | v0.1: Squads 멤버 제거 + 자금 회수, v0.2: 키스토어 제거 + 잔액 반환 안내 |
| TERMINATED (terminated) | TERMINATED (TERMINATED) | 값 동일, 케이스 다름 | 양쪽 모두 불가역 최종 상태 |

### 구현 노트 작성 방향

CORE-02 (25-sqlite-schema.md) agents 테이블 섹션에 추가:
- **v0.1 -> v0.2 상태 매핑표:** 5단계 동일, 대문자 표기 통일 확인
- **의미 변경 요약:** Squads 온체인 -> 로컬 키스토어/정책 엔진으로 전환
- **SUPERSEDED 참조:** v0.1 15-agent-lifecycle-management.md는 이미 SUPERSEDED 표기됨
- **suspension_reason 확장:** v0.2에서 추가된 SUSPENDED 세분화 (kill_switch, policy_violation, manual, auto_stop)

**Confidence:** HIGH -- 양쪽 문서 직접 비교 완료

---

## NOTE-10: Python SDK 네이밍 검증 (M13)

### 현재 상태 분석

**REST API 응답 필드 (camelCase):**
- `transactionId`, `txHash`, `estimatedFee`, `createdAt`, `executedAt`, `toAddress`, `nextCursor`, `queuedAt`, `expiresAt`, `sessionId`, `maxAmountPerTx`, `maxTotalAmount`, `maxTransactions`, `allowedOperations`, `allowedDestinations`, `expiresIn`, `tokenMint`

**Python SDK Pydantic 모델 (snake_case + alias):**
```python
class TransactionResponse(BaseModel):
    transaction_id: str = Field(alias="transactionId")
    tx_hash: Optional[str] = Field(default=None, alias="txHash")
    estimated_fee: Optional[str] = Field(default=None, alias="estimatedFee")
    created_at: datetime = Field(alias="createdAt")
    model_config = {"populate_by_name": True}
```

### 검증 결과

| REST API 필드 (camelCase) | Python 모델 필드 (snake_case) | alias 설정? | 일관성 |
|--------------------------|------------------------------|------------|--------|
| `transactionId` | `transaction_id` | alias="transactionId" | OK |
| `txHash` | `tx_hash` | alias="txHash" | OK |
| `estimatedFee` | `estimated_fee` | alias="estimatedFee" | OK |
| `createdAt` | `created_at` | alias="createdAt" | OK |
| `executedAt` | `executed_at` | alias="executedAt" | OK |
| `toAddress` | `to_address` | alias="toAddress" | OK |
| `nextCursor` | `next_cursor` | alias="nextCursor" | OK |
| `queuedAt` | `queued_at` | alias="queuedAt" | OK |
| `expiresAt` | `expires_at` | alias="expiresAt" | OK |
| `sessionId` | `session_id` | alias="sessionId" | OK |
| `maxAmountPerTx` | `max_amount_per_tx` | alias="maxAmountPerTx" | OK |
| `maxTotalAmount` | `max_total_amount` | alias="maxTotalAmount" | OK |
| `maxTransactions` | `max_transactions` | alias="maxTransactions" | OK |
| `allowedOperations` | `allowed_operations` | alias="allowedOperations" | OK |
| `allowedDestinations` | `allowed_destinations` | alias="allowedDestinations" | OK |
| `expiresIn` | `expires_in` | alias="expiresIn" | OK |
| `tokenMint` | `token_mint` | alias="tokenMint" | OK |

**에러 코드 (UPPER_SNAKE_CASE):**
- API: `INVALID_TOKEN`, `INSUFFICIENT_BALANCE` 등 36개
- Python SDK: `WAIaaSError.code`는 `str` 타입으로 원본 그대로 전달 (변환 없음)
- 에러 코드는 이미 UPPER_SNAKE_CASE이므로 Python 관례와 일치

### 구현 노트 작성 방향

SDK-MCP (38-sdk-mcp-interface.md) Python SDK 섹션에 추가:
- **네이밍 규칙 정리표:** REST API camelCase -> Python snake_case 변환 완전성 검증 결과
- **Pydantic `model_config = {"populate_by_name": True}` 필수:** 모든 alias 모델에 설정 확인
- **에러 코드 무변환 원칙:** UPPER_SNAKE_CASE 에러 코드는 Python에서도 그대로 사용
- **누락 필드 점검:** Owner API 응답 모델 (Python Owner SDK 미설계 상태 -- v0.2에서는 TS Owner SDK만)

**Confidence:** HIGH -- 문서 내 Pydantic 모델 직접 검증 완료

---

## NOTE-11: 커서 페이지네이션 파라미터 통일 (M14)

### 현재 상태 분석

**TX-PIPE (32-transaction-pipeline-api.md):**
```typescript
// GET /v1/transactions
cursor: z.string().optional()  // "커서 기반 페이지네이션 (이전 응답의 nextCursor)"
// GET /v1/sessions
cursor: z.string().optional()  // "커서 기반 페이지네이션 (이전 응답의 nextCursor)"
```

**API-SPEC (37-rest-api-complete-spec.md):**
```typescript
// GET /v1/transactions
cursor: z.string().optional()  // "커서 (이전 응답의 nextCursor, UUID v7 시간순)"
// GET /v1/owner/sessions
cursor: z.string().optional()  // "커서 기반 페이지네이션"
```

**응답 패턴:**
```typescript
// 모든 리스트 응답
nextCursor: z.string().optional()  // "다음 페이지 커서"
```

**공통 패턴 (API-SPEC:2322):**
```typescript
// 패턴: WHERE id < cursor ORDER BY id DESC LIMIT n+1
{
  data: T[],
  nextCursor: string | null,
}
```

### 검증 결과

| 엔드포인트 | 요청 파라미터 | 응답 필드 | 일관성 |
|-----------|-------------|----------|--------|
| GET /v1/transactions | `cursor` | `nextCursor` | OK |
| GET /v1/owner/sessions | `cursor` | `nextCursor` | OK |
| GET /v1/owner/agents | (미명시 -- 목록 크기 작아 불필요) | - | N/A |
| GET /v1/owner/pending-approvals | (미명시) | - | N/A |

**파라미터명 통일 상태:**
- 요청: `cursor` (소문자 단일 단어)
- 응답: `nextCursor` (camelCase)
- 정렬: `order` (asc/desc)
- 크기: `limit` (1~100, 기본 20)

모든 페이지네이션 엔드포인트에서 `cursor`/`nextCursor`/`limit`/`order` 4개 파라미터가 일관되게 사용되고 있다.

### 구현 노트 작성 방향

API-SPEC (37-rest-api-complete-spec.md) 공통 응답 스키마 섹션에 추가:
- **커서 페이지네이션 표준 파라미터:** `cursor`, `nextCursor`, `limit`, `order` 4개 고정
- **UUID v7 커서 구현 규칙:** `WHERE id < cursor ORDER BY id DESC LIMIT n+1`, 오버페치로 hasMore 판단
- **페이지네이션 미적용 엔드포인트:** agents(소규모), pending-approvals(소규모)는 전체 반환
- **클라이언트 구현 가이드:** `nextCursor`가 null이면 마지막 페이지, 첫 요청은 cursor 생략

**Confidence:** HIGH -- 문서 직접 비교 완료

---

## Architecture Patterns

### 패턴 1: 구현 노트 섹션 추가 패턴

**What:** 기존 v0.2 설계 문서의 마지막(요구사항 매핑 총괄 전)에 "구현 노트" 섹션을 추가
**When to use:** 설계 변경 없이 구현 시 주의사항을 명시할 때
**Example:**
```markdown
---

## N. 구현 노트

### N.1 [주제]

**배경:** [왜 이 노트가 필요한지]

**구현 규칙:**
1. [규칙 1]
2. [규칙 2]

**참조:** [관련 문서/섹션]
```

### 패턴 2: 매트릭스/대응표 포맷

**What:** 기능 패리티, 에러 매핑 등 N:M 관계를 표로 문서화
**When to use:** 두 시스템 간 대응 관계를 명시할 때
**Example:**
```markdown
| Source A | Source B | 커버 여부 | 근거 |
|----------|---------|----------|------|
| item 1   | mapped  | OK       | 설계 의도 |
| item 2   | -       | 미커버   | v0.3+ 확장 |
```

---

## Don't Hand-Roll

이 Phase는 설계 문서 편집만 수행하므로 라이브러리/도구 관련 "Don't Hand-Roll" 항목은 없다.

| 문제 | 하지 말 것 | 대신 할 것 | 이유 |
|------|-----------|-----------|------|
| 단위 변환 공식 | 임의의 변환 규칙 창작 | 체인별 공식 decimals 사용 | SOL=10^9, ETH=10^18은 표준 |
| 에러 코드 재분류 | 새로운 에러 도메인 추가 | 기존 7도메인 36개 유지 | v0.2 설계 변경 불가 |
| 상태 전이 규칙 변경 | 새 상태 추가 | 기존 5단계 유지 + 노트 추가 | v0.2 설계 변경 불가 |

---

## Common Pitfalls

### Pitfall 1: 구현 노트가 설계 변경이 되는 것

**What goes wrong:** "구현 시 주의사항"을 넘어 새로운 인터페이스나 타입을 정의하게 됨
**Why it happens:** 불일치 해소 과정에서 새로운 설계가 자연스럽게 생겨남
**How to avoid:** 구현 노트는 "구현 시 이것을 참고하라" 수준으로 제한. 새 타입/인터페이스는 v0.4 구현 단계에서 정의
**Warning signs:** 구현 노트에 TypeScript 인터페이스 전체 코드가 나오면 과도한 것

### Pitfall 2: 중복 정보

**What goes wrong:** 다른 문서에 이미 있는 정보를 구현 노트에 복사해옴
**Why it happens:** 크로스레퍼런스 대신 내용을 가져오면 편리
**How to avoid:** 구현 노트에서는 "참조: 문서X 섹션Y" 형태로 링크하고, 핵심 결정사항만 기술
**Warning signs:** 동일 내용이 3곳 이상에 존재하면 SSoT 위반

### Pitfall 3: 문서 간 순서 의존성 무시

**What goes wrong:** NOTE-06(Setup Wizard vs CLI init)을 처리하면서 CLI init 쪽만 수정하고 Tauri 쪽을 빼먹음
**Why it happens:** 한 항목이 여러 문서에 걸쳐있을 때
**How to avoid:** 각 NOTE 처리 시 영향받는 문서 목록을 미리 나열하고 전부 수정

---

## 대상 문서 영향도 분석

### NOTE별 수정 대상 문서

| NOTE | 주 대상 문서 | 보조 대상 문서 | 추가 산출물 |
|------|-----------|-------------|-----------|
| NOTE-01 | 27-chain-adapter-interface.md (CORE-04) | 37-rest-api-complete-spec.md | 변환 규칙표 |
| NOTE-02 | 35-notification-architecture.md (NOTI-ARCH) | 24-monorepo-data-directory.md | 정책 연동 규칙 |
| NOTE-03 | 38-sdk-mcp-interface.md (SDK-MCP) | - | 패리티 매트릭스 표 |
| NOTE-04 | 38-sdk-mcp-interface.md (SDK-MCP) | - | 에러 코드 매핑표 |
| NOTE-05 | 39-tauri-desktop-architecture.md (TAURI-DESK) | - | 에러 분류표 |
| NOTE-06 | 28-daemon-lifecycle-cli.md (CORE-05) | 39-tauri-desktop-architecture.md | 순서 비교표 |
| NOTE-07 | 40-telegram-bot-docker.md (TGBOT-DOCKER) | - | Pre-Approve 흐름 |
| NOTE-08 | 28-daemon-lifecycle-cli.md (CORE-05) | 40-telegram-bot-docker.md | 타임라인 검증표 |
| NOTE-09 | 25-sqlite-schema.md (CORE-02) | - | v0.1-v0.2 매핑표 |
| NOTE-10 | 38-sdk-mcp-interface.md (SDK-MCP) | - | 네이밍 검증표 |
| NOTE-11 | 37-rest-api-complete-spec.md (API-SPEC) | - | 파라미터 통일표 |

### 문서별 수정 횟수

| 문서 | 수정 횟수 | 해당 NOTE |
|------|---------|-----------|
| 38-sdk-mcp-interface.md | 3 | NOTE-03, NOTE-04, NOTE-10 |
| 28-daemon-lifecycle-cli.md | 2 | NOTE-06, NOTE-08 |
| 39-tauri-desktop-architecture.md | 2 | NOTE-05, NOTE-06 |
| 40-telegram-bot-docker.md | 2 | NOTE-07, NOTE-08 |
| 37-rest-api-complete-spec.md | 2 | NOTE-01, NOTE-11 |
| 27-chain-adapter-interface.md | 1 | NOTE-01 |
| 35-notification-architecture.md | 1 | NOTE-02 |
| 24-monorepo-data-directory.md | 1 | NOTE-02 |
| 25-sqlite-schema.md | 1 | NOTE-09 |

---

## PLAN 분할 전략

### 13-01-PLAN: 단위 변환/매핑/패리티 구현 노트

**대상:** NOTE-01, NOTE-03, NOTE-04, NOTE-09, NOTE-10, NOTE-11, NOTE-02, NOTE-08
**문서 수:** 8개 문서 수정 (38-sdk-mcp x3, 37-rest-api x2, 27-chain-adapter, 35-notification, 25-sqlite, 28-daemon, 24-monorepo, 40-telegram)
**특성:** 표/매트릭스 작성이 주 작업. 데이터 정합성 검증이 핵심.

### 13-02-PLAN: 통합/인증/배포 구현 노트

**대상:** NOTE-05, NOTE-06, NOTE-07
**문서 수:** 4개 문서 수정 (39-tauri-desktop x2, 28-daemon-lifecycle, 40-telegram-bot)
**특성:** 흐름/시퀀스 설명이 주 작업. 설계 결정 문서화가 핵심.

---

## Open Questions

1. **NOTE-01 formatted 변환 정밀도:** SOL은 소수점 9자리이지만 REST API 예시에서 "1.5 SOL"로 축약 표시. 표시 정밀도 규칙(trailing zeros 처리)을 어디까지 정의할지 -- 구현 노트에서 규칙만 명시하고 세부 구현은 v0.4로 이연하는 것이 적절.

2. **NOTE-03 MCP v0.3 확장:** Streamable HTTP transport가 v0.3 예정이라면, MCP 도구 수 확장도 v0.3에서 할 가능성이 있음. 현재 패리티 매트릭스에 "v0.3+ 확장 후보" 컬럼을 포함할지 -- 포함하되 범위는 현재 31개 엔드포인트 기준.

3. **NOTE-06 패스워드 최소 길이:** CLI 12자 vs Wizard 8자 불일치를 구현 노트에서 "12자로 통일"이라고 명시하면 사실상 설계 변경. v0.3 범위(설계 변경 불가)와 충돌하는지 -- 이는 구현 노트("12자를 권장")로 처리하고, Wizard 코드 수정은 v0.4에서 수행.

---

## Sources

### Primary (HIGH confidence)
- 27-chain-adapter-interface.md (CORE-04) -- BalanceInfo, TokenAmount, getBalance() 분석
- 25-sqlite-schema.md (CORE-02) -- agents.status CHECK, transactions.amount TEXT 분석
- 37-rest-api-complete-spec.md (API-SPEC) -- 31 endpoints, 36 error codes, pagination 분석
- 38-sdk-mcp-interface.md (SDK-MCP) -- MCP 6 tools, SDK error classes, Python models 분석
- 39-tauri-desktop-architecture.md (TAURI-DESK) -- IPC commands, Setup Wizard 5-step 분석
- 40-telegram-bot-docker.md (TGBOT-DOCKER) -- 2-Tier auth, graceful shutdown, Docker config 분석
- 28-daemon-lifecycle-cli.md (CORE-05) -- 10-step shutdown, waiaas init 4-step 분석
- 35-notification-architecture.md (NOTI-ARCH) -- 최소 2채널, config 표현 분석
- 24-monorepo-data-directory.md (CORE-01) -- config.toml notifications 섹션 분석
- 15-agent-lifecycle-management.md (REL-03) -- v0.1 5단계 상태 모델 분석
- 45-enum-unified-mapping.md -- AgentStatus 5개 값 SSoT 확인

### Secondary (MEDIUM confidence)
- 32-transaction-pipeline-api.md (TX-PIPE) -- 커서 페이지네이션 파라미터 확인

---

## Metadata

**Confidence breakdown:**
- NOTE 분석: HIGH -- 모든 대상 문서 직접 읽기 완료, 불일치 포인트 명확
- 구현 노트 방향: HIGH -- 기존 설계를 변경하지 않는 범위에서 주의사항 추가
- PLAN 분할: HIGH -- NOTE별 대상 문서와 작업 유형 분석 완료

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (설계 문서 정리 작업으로 안정적)
