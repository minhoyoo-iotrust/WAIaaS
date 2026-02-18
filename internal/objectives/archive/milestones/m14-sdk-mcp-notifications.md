# 마일스톤 m14: SDK + MCP + 알림

## 목표

AI 에이전트가 TS/Python SDK 또는 MCP로 지갑을 사용하고, Owner가 Telegram/Discord로 알림을 받는 상태.

---

## 구현 대상 설계 문서

이 마일스톤에서 구현하는 설계 문서 목록과 각 문서에서 구현할 범위를 명시한다.

| 문서 | 이름 | 구현 범위 | 전체/부분 |
|------|------|----------|----------|
| 37 | rest-api-complete-spec | 38개 엔드포인트 전체 완성. v1.1에서 6개 기본(health, agents, balance, address, transactions, tx/:id), v1.2에서 인증/정책/Owner 관련 추가 완료 후, v1.3에서 나머지 전체(자산 조회, Action API, OpenAPI /doc 등) | 전체 (완성) |
| 38 | sdk-mcp-interface | TypeScript SDK(`@waiaas/sdk`): WAIaaSClient + WAIaaSOwnerClient, 0 외부 의존성. Python SDK(`waiaas`): httpx + Pydantic v2. MCP Server(`@waiaas/mcp`): 6 도구 + 3 리소스, stdio transport | 전체 |
| 35 | notification-architecture | INotificationChannel 인터페이스, 3개 채널 어댑터(TelegramChannel, DiscordChannel, NtfyChannel), NotificationService 오케스트레이터, 17개 NotificationEventType, notification_channels + notification_log 테이블, 채널별 Rate Limit, 전달 추적 | 전체 |
| 55 | dx-improvement-spec | hint 필드 에러 응답(31/40개 에러에 hint 매핑), MCP 아키텍처 옵션(현행 stdio 유지 결정), 원격 접근 가이드(SSH tunnel, VPN, --expose) | 전체 |

**v0.9 SessionManager 참조:**

v0.9에서 설계된 MCP 세션 자동 갱신 인프라를 v1.3에서 구현한다:

| 컴포넌트 | 구현 범위 |
|----------|----------|
| SessionManager (MCP 내장) | loadToken() (파일 > 환경변수 우선순위), scheduleRenewal() (TTL 60% 경과 시 자동 갱신), renew() (PUT /v1/sessions/:id/renew 호출), persistToken() (~/.waiaas/mcp-token 파일 저장) |
| ApiClient 통합 | SessionManager.getToken()으로 항상 최신 토큰 참조. tool/resource handler가 직접 토큰을 관리하지 않음 |
| 갱신 실패 처리 | 지수 백오프 재시도 (1s/2s/4s, max 3회), 전체 실패 시 stderr 에러 로그 + 마지막 유효 토큰 유지 |
| 절대 수명 만료 대응 | SESSION_EXPIRING_SOON 알림 → Telegram /newsession 원클릭 재생성 |
| CLI mcp setup | config.json 자동 생성, 세션 토큰 발급 + mcp-token 파일 기록 |
| 동시성 제어 | 갱신 중 재진입 방지 (isRenewing flag), 409 RENEWAL_CONFLICT 시 현재 토큰 유효성 확인 |

---

## 산출물

### 패키지

| 패키지 | 내용 |
|--------|------|
| `@waiaas/sdk` | TypeScript SDK -- 0 외부 런타임 의존성, WAIaaSClient(Agent API) + WAIaaSOwnerClient(Owner API), fetch 기반 HTTP, 지수 백오프 재시도, Zod 사전 검증 |
| `@waiaas/mcp` | MCP Server -- @modelcontextprotocol/sdk 기반, 6 도구 + 3 리소스, stdio transport, SessionManager 내장, waiaas-mcp CLI 바이너리 |
| Python SDK (`waiaas`) | httpx + Pydantic v2, WAIaaSClient 동일 인터페이스, pyproject.toml + hatch 빌드, pytest 테스트 |
| 알림 시스템 | INotificationChannel 인터페이스, TelegramChannel(Bot API + MarkdownV2), DiscordChannel(Webhook + Embed), NtfyChannel(ntfy.sh + plain text), NotificationService 오케스트레이터 |
| REST API 완성 | 38개 엔드포인트 전체, OpenAPI 3.0 자동 생성 (/doc 엔드포인트) |

### TypeScript SDK 주요 구조

```
packages/sdk/
  src/
    index.ts          -- Public exports
    client.ts         -- WAIaaSClient (Agent API)
    owner-client.ts   -- WAIaaSOwnerClient (Owner API)
    error.ts          -- WAIaaSError (code, message, status, retryable, requestId, details, hint)
    retry.ts          -- RetryPolicy + 지수 백오프
    types.ts          -- Options, Response 타입 re-export
    internal/
      http.ts         -- fetch wrapper (Node.js 22 내장)
      constants.ts    -- 기본값, 상수
```

주요 메서드:
- `getBalance()`, `getAddress()`, `getAssets()` -- 지갑 조회
- `sendToken()`, `sendTokenTransfer()`, `contractCall()`, `approve()`, `batch()` -- 트랜잭션 (Zod 사전 검증)
- `getTransaction()`, `listTransactions()`, `listPendingTransactions()` -- 트랜잭션 이력
- `renewSession()` -- 세션 갱신
- `listActions()`, `getAction()`, `resolveAction()`, `executeAction()` -- Action API
- `setSessionToken()`, `clearSessionToken()` -- 토큰 관리

### Python SDK 주요 구조

```
python-sdk/
  waiaas/
    __init__.py
    client.py         -- WAIaaSClient (async httpx)
    owner_client.py   -- WAIaaSOwnerClient
    models.py         -- Pydantic v2 모델 (OpenAPI 기반 수동 매핑)
    errors.py         -- WAIaaSError
    retry.py          -- 지수 백오프 재시도
  tests/
    test_client.py
    test_models.py
  pyproject.toml      -- hatch 빌드
```

주요 메서드 (TS SDK와 동일 인터페이스):
- `get_balance()`, `get_address()`, `get_assets()`
- `send_token()`, `send_token_transfer()`, `contract_call()`, `approve()`, `batch()`
- `get_transaction()`, `list_transactions()`
- `renew_session()`

### MCP Server 주요 구조

```
packages/mcp/
  src/
    index.ts            -- 엔트리포인트 (stdio transport 연결)
    server.ts           -- McpServer 초기화 + tool/resource 등록
    session-manager.ts  -- SessionManager (자동 갱신, 토큰 영속화)
    tools/
      send-token.ts     -- send_token (POST /v1/transactions/send)
      get-balance.ts    -- get_balance (GET /v1/wallet/balance)
      get-address.ts    -- get_address (GET /v1/wallet/address)
      list-transactions.ts -- list_transactions (GET /v1/transactions)
      get-transaction.ts   -- get_transaction (GET /v1/transactions/:id)
      get-nonce.ts      -- get_nonce (GET /v1/nonce)
    resources/
      wallet-balance.ts -- waiaas://wallet/balance
      wallet-address.ts -- waiaas://wallet/address
      system-status.ts  -- waiaas://system/status
    internal/
      api-client.ts     -- localhost API 호출 래퍼 (SessionManager.getToken() 참조)
      config.ts         -- 환경변수, 설정
```

MCP 도구 6개:

| # | Tool Name | REST API | 설명 |
|---|-----------|----------|------|
| 1 | send_token | POST /v1/transactions/send | 토큰 전송 |
| 2 | get_balance | GET /v1/wallet/balance | 잔액 조회 |
| 3 | get_address | GET /v1/wallet/address | 주소 조회 |
| 4 | list_transactions | GET /v1/transactions | 거래 이력 |
| 5 | get_transaction | GET /v1/transactions/:id | 단일 거래 |
| 6 | get_nonce | GET /v1/nonce | nonce 조회 |

MCP 리소스 3개:

| # | Resource Name | URI | 설명 |
|---|--------------|-----|------|
| 1 | wallet-balance | waiaas://wallet/balance | 에이전트 지갑 잔액 |
| 2 | wallet-address | waiaas://wallet/address | 에이전트 지갑 주소 |
| 3 | system-status | waiaas://system/status | 데몬 상태 (health) |

### 알림 시스템 주요 구조

```
packages/daemon/src/notifications/
  interfaces/
    notification-channel.ts  -- INotificationChannel (type, name, channelId, send, healthCheck)
  channels/
    telegram.ts              -- TelegramChannel (Bot API, MarkdownV2, native fetch)
    discord.ts               -- DiscordChannel (Webhook, Embed 포맷)
    ntfy.ts                  -- NtfyChannel (ntfy.sh, plain text, Priority 매핑)
  notification-service.ts    -- NotificationService (우선순위 전송 + 폴백 체인 + broadcast)
  event-types.ts             -- NotificationEventType 17개 열거형
  templates/
    message-templates.ts     -- 채널별 메시지 포맷 템플릿 (@waiaas/core/i18n 참조)
```

#### 알림 메시지 다국어 적용

알림 메시지는 Owner(사람)가 직접 읽는 텍스트이므로, config.toml `locale` 설정에 따라 영문/한글로 전송한다.

**적용 범위:**
- 17개 NotificationEventType 메시지 제목 + 본문 (en/ko)
- 채널별 포매팅은 언어와 독립 (MarkdownV2, Embed, plain text는 포맷 계층)

**적용 방식:**
- `@waiaas/core/i18n`의 `getMessages(locale)` 함수로 메시지 템플릿 로드
- NotificationService가 초기화 시 locale을 주입받아 전체 알림에 일관 적용
- 메시지 키 예시: `TX_APPROVAL_REQUIRED_TITLE`, `TX_APPROVAL_REQUIRED_BODY`, `KILL_SWITCH_ACTIVATED_TITLE` 등

**언어별 예시:**

| 이벤트 | 영문 (en) | 한글 (ko) |
|--------|----------|----------|
| TX_APPROVAL_REQUIRED | `🔔 *Transaction Approval Required*` | `🔔 *거래 승인 요청*` |
| KILL_SWITCH_ACTIVATED | `🚨 *Kill Switch Activated*` | `🚨 *Kill Switch 발동*` |
| SESSION_EXPIRING_SOON | `⚠️ *Session Expiring Soon*` | `⚠️ *세션 만료 임박*` |

**영문 고정 (i18n 미적용):**
- API 에러 응답 (`code`, `message`, `hint`) — AI 에이전트/SDK 소비
- MCP tool 응답 — LLM 소비
- SDK 에러 메시지 — 개발자 소비
- 서버 로그 (console.error) — 운영자 디버깅용

> **참고:** 35번 설계 문서(notification-architecture)와 40번 설계 문서(telegram-bot-docker) 간 알림 메시지 언어 불일치가 존재한다(35번은 한글, 40번은 영문). v1.3 구현 시 `@waiaas/core/i18n` 메시지 템플릿으로 통일하여 해소한다.

17개 NotificationEventType:

| 카테고리 | 이벤트 | 전송 방식 |
|----------|--------|----------|
| 거래 | TX_NOTIFY, TX_DELAY_QUEUED, TX_DOWNGRADED_DELAY, TX_DELAY_EXECUTED, TX_APPROVAL_REQUEST, TX_APPROVAL_EXPIRED, TX_CONFIRMED, TX_FAILED | notify() |
| 보안 | KILL_SWITCH_ACTIVATED, KILL_SWITCH_RECOVERED, AUTO_STOP_TRIGGERED | broadcast() |
| 세션 | SESSION_CREATED, SESSION_REVOKED, SESSION_RENEWED, SESSION_RENEWAL_REJECTED, SESSION_EXPIRING_SOON | notify() |
| 운영 | DAILY_SUMMARY | notify() |

### REST API (v1.3에서 추가하는 엔드포인트)

v1.1에서 구현하는 6개 기본 엔드포인트:
- POST /v1/agents, GET /v1/wallet/balance, GET /v1/wallet/address, POST /v1/transactions, GET /v1/transactions/:id, GET /health

v1.2에서 구현하는 인증/정책/Owner 관련 엔드포인트:
- POST /v1/sessions, GET /v1/sessions, DELETE /v1/sessions/:id, PUT /v1/sessions/:id/renew
- GET /v1/agents, GET /v1/agents/:id, PUT /v1/agents/:id, DELETE /v1/agents/:id
- POST /v1/owner/policies, GET /v1/owner/policies, PUT /v1/owner/policies/:id, DELETE /v1/owner/policies/:id
- POST /v1/owner/approve/:txId, POST /v1/owner/connect
- GET /v1/nonce, GET /v1/admin/status
- POST /v1/admin/kill-switch, GET /v1/admin/kill-switch, POST /v1/admin/recover, POST /v1/admin/shutdown
- POST /v1/owner/agents/:agentId/withdraw, POST /v1/admin/rotate-secret

v1.3에서 추가 완성하는 엔드포인트:
- GET /v1/wallet/assets -- 에이전트 보유 자산 목록 조회
- GET /v1/transactions -- 거래 이력 (커서 페이지네이션)
- GET /v1/transactions/pending -- 대기 중 거래 목록
- GET /v1/actions -- Action Provider 목록
- GET /v1/actions/:provider/:action -- Action 상세
- POST /v1/actions/:provider/:action/resolve -- Action resolve
- POST /v1/actions/:provider/:action/execute -- Action 실행
- GET /doc -- OpenAPI 3.0 JSON 스펙 (debug 모드)
- POST /v1/transactions/send -- discriminatedUnion 5-type 확장 (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH)

### OpenAPI 3.0 자동 생성

- Hono OpenAPIHono 미들웨어 기반 자동 생성
- GET /doc 엔드포인트 (debug 모드)
- 38개 엔드포인트 전수 스키마 포함
- 66개 에러 코드 매핑

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | TypeScript SDK 빌드 | ESM-only (`"type": "module"`) | Node.js 22 기준, ESM이 표준. CJS 호환은 불필요 (AI 에이전트 프레임워크 대부분 ESM) |
| 2 | Python SDK 패키징 | pyproject.toml + hatch | PEP 517 표준, hatch가 빌드/테스트/버전 통합 관리 |
| 3 | MCP Server SDK 버전 | @modelcontextprotocol/sdk ^1.0.0 | MCP 1.0 안정 릴리스 기반, stdio transport 지원 |
| 4 | 알림 채널 설정 위치 | config.toml [notifications] 섹션 | 기존 config.toml 평탄화 17키 구조에 채널별 credentials 추가 |
| 5 | OpenAPI 3.0 생성 | Hono OpenAPIHono 미들웨어 (자동) | Zod 스키마에 .openapi() 메타데이터 부착, 런타임 자동 생성 |
| 6 | Python SDK 테스트 | pytest + httpx MockTransport | httpx의 내장 MockTransport로 HTTP 호출 모킹, 외부 의존성 없이 테스트 |
| 7 | MCP 세션 자동 갱신 초기화 | Eager (서버 시작 시 즉시) | SessionManager가 서버 초기화 시점에 토큰 로드 + 타이머 등록. 첫 tool 호출 전에 갱신 체계 준비 완료 |
| 8 | 알림 채널 HTTP 라이브러리 | Node.js 22 내장 fetch | native fetch 전용 원칙 (외부 Bot 프레임워크/HTTP 라이브러리 미사용) |
| 9 | hint 필드 언어 | 영문 (AI 에이전트 소비 기준) | LLM이 파싱하여 자율 판단에 활용. message 필드에 한글 유지 가능 |

---

## E2E 검증 시나리오

**자동화 비율: 95%+ -- `[HUMAN]` 1건**

### TypeScript SDK

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | `new WAIaaSClient({ baseUrl, sessionToken })` -> `getBalance()` -> 잔액 JSON 반환 | Vitest 통합 테스트, 실 데몬 기동 후 SDK 호출 | [L0] |
| 2 | `sendToken({ to, amount })` -> 트랜잭션 ID 반환 -> 폴링 -> CONFIRMED 대기 | 상태 전이 assert (QUEUED -> EXECUTING -> CONFIRMED) | [L0] |
| 3 | 만료된 세션 토큰으로 호출 -> WAIaaSError 예외 + code='TOKEN_EXPIRED' + hint 필드 포함 | 에러 클래스 속성 검증 | [L0] |
| 4 | `getAssets()` -> SOL + 토큰 목록 반환 | 응답 JSON 스키마 검증 | [L0] |
| 5 | Zod 사전 검증 실패 -> WAIaaSError throw (서버 요청 미전송) | 네트워크 호출 없음 assert | [L0] |
| 6 | 429 응답 -> 지수 백오프 자동 재시도 -> 최종 성공 | mock 서버 429 후 200 반환 | [L0] |

### Python SDK

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 7 | `WAIaaSClient(base_url, session_token)` -> `get_balance()` -> 잔액 반환 | pytest + httpx MockTransport | [L0] |
| 8 | `send_token(to, amount)` -> 트랜잭션 ID -> 상태 폴링 -> CONFIRMED | MockTransport 상태 전이 시뮬레이션 | [L0] |
| 9 | Pydantic 모델 검증 실패 -> ValidationError | 잘못된 입력 -> 예외 assert | [L0] |

### MCP Server

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 10 | stdio transport 연결 -> tool 목록 조회 -> 6 도구 확인 | MCP 클라이언트 라이브러리로 자동 테스트 | [L0] |
| 11 | `get_balance` 호출 -> JSON 응답 (잔액 포함) | tool 호출 결과 JSON 파싱 + 검증 | [L0] |
| 12 | `send_token` 호출 -> 트랜잭션 실행 -> ID 반환 | tool 호출 결과 txId 존재 assert | [L0] |
| 13 | resource 목록 조회 -> 3 리소스 확인 (waiaas://wallet/balance, waiaas://wallet/address, waiaas://system/status) | MCP resource listing assert | [L0] |
| 14 | 세션 만료 -> SessionManager 자동 갱신 -> 중단 없이 계속 동작 | TTL 단축(5초) + 갱신 후 tool 호출 성공 assert | [L0] |
| 15 | 갱신 실패 (데몬 일시 다운) -> 에러 로그(stderr) + 지수 백오프 재시도 -> 데몬 복구 후 성공 | stderr 캡처 + 최종 갱신 성공 assert | [L0] |
| 16 | 갱신 동시성: 갱신 중 재진입 -> isRenewing flag로 중복 방지 | 동시 2개 요청 -> 1회만 갱신 수행 assert | [L0] |
| 17 | 409 RENEWAL_CONFLICT -> 현재 토큰 유효성 확인 -> 갱신 완료로 간주 | mock 409 응답 -> 이후 tool 호출 성공 | [L0] |

### 알림 시스템

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 18 | SOL 전송 (NOTIFY 티어) -> TelegramChannel mock 수신 검증 | INotificationChannel mock + TX_NOTIFY 이벤트 assert | [L0] |
| 19 | APPROVAL 대기 거래 생성 -> Discord webhook mock 검증 | TX_APPROVAL_REQUEST 이벤트 + Embed 포맷 assert | [L0] |
| 20 | Kill Switch 활성화 -> ntfy.sh mock 검증 + broadcast (전 채널) | KILL_SWITCH_ACTIVATED + broadcast() 전 채널 호출 assert | [L0] |
| 21 | SESSION_EXPIRING_SOON -> 알림 발송 (Telegram) | SessionManager 만료 임박 -> notify() 호출 assert | [L0] |
| 22 | 채널 1 실패 -> 폴백 채널 2 전송 성공 | TelegramChannel 실패 mock -> DiscordChannel 성공 assert | [L0] |
| 23 | 전 채널 실패 -> audit_log CRITICAL 기록 | 모든 채널 실패 mock -> DB audit_log 레코드 assert | [L0] |

### REST API

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 24 | GET /doc -> 유효한 OpenAPI 3.0 JSON 반환 | JSON 파싱 + openapi 버전 필드 + paths 38개 확인 | [L0] |
| 25 | 38개 엔드포인트 전수 호출 -> 정의된 응답 코드 | 각 엔드포인트별 기대 HTTP 상태 코드 assert | [L0] |
| 26 | hint 필드 에러 응답: INSUFFICIENT_BALANCE -> hint 문자열 포함 | 에러 응답 JSON에 hint 필드 존재 + 내용 검증 | [L0] |

### HUMAN 검증

| # | 시나리오 | 태그 |
|---|---------|------|
| 27 | Claude Desktop에서 MCP 서버 연결 -> 도구 목록 확인 -> get_balance / send_token 실제 호출 -> UI에서 결과 확인 | [HUMAN] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.2 (인증 + 정책 엔진) | SDK/MCP가 sessionAuth로 인증하고, 정책 평가 결과(INSTANT/DELAY/APPROVAL)에 따라 동작. Owner API(ownerAuth)가 v1.2에서 완성 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | MCP SDK 버전 업데이트 속도 | @modelcontextprotocol/sdk API 변경 시 tool/resource 등록 코드 수정 필요 | ^1.0.0 고정, 마이너 업데이트만 허용. 메이저 변경 시 설계 삽입(v1.3d) |
| 2 | Python SDK 외부 의존성 관리 | httpx/Pydantic 버전 호환성 | pyproject.toml에 버전 범위 고정 (httpx>=0.27, pydantic>=2.0) |
| 3 | 알림 채널 외부 API 의존성 | Telegram Bot API, Discord Webhook, ntfy.sh 장애 시 알림 실패 | 폴백 체인 + broadcast 패턴으로 단일 장애점 방지. 최소 2채널 설정 필수 |
| 4 | Claude Desktop MCP 통합 테스트 자동화 불가 | [HUMAN] 항목으로 남음 | 기능 정합성은 L0 자동화, UI 통합만 수동 확인 |
| 5 | REST API 38개 엔드포인트 전수 구현 범위 확인 | v1.1/v1.2 구현분과 v1.3 추가분 경계 | 본 문서 산출물 섹션에 엔드포인트별 구현 마일스톤을 명시 |
| 6 | SessionManager 토큰 파일 권한 | ~/.waiaas/mcp-token 파일이 다른 프로세스에 노출 시 세션 탈취 | 파일 권한 0600 (소유자만 읽기/쓰기), 생성 시 umask 확인 |
| 7 | MCP 세션 절대 수명 만료 | 30일 후 갱신 불가, SSH + CLI 필요 | Telegram /newsession 원클릭 재생성으로 원격 대응 |

---

*최종 업데이트: 2026-02-09 v1.0 구현 계획 기반 생성, 알림 메시지 다국어(en/ko) 적용 범위 추가, doc 35/40 언어 불일치 해소 방안 명시*
