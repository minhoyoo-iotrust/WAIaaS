# DX 개선 스펙 (DX-06~DX-08)

**문서 ID:** DX-SPEC
**작성일:** 2026-02-07
**상태:** 완료
**참조:** CORE-06 (29-api-framework-design.md), SDK-MCP (38-sdk-mcp-interface.md), API-SPEC (37-rest-api-complete-spec.md), CORE-01 (24-monorepo-data-directory.md), AUTH-REDESIGN (52-auth-model-redesign.md)
**요구사항:** DX-06 (hint 필드 에러 응답), DX-07 (MCP 데몬 내장 옵션 검토), DX-08 (원격 에이전트 접근 가이드)

---

## 1. 문서 개요

### 1.1 목적

WAIaaS v0.5 DX 개선 스펙을 단일 SSoT(Single Source of Truth)로 정의한다. 3개 요구사항(DX-06~DX-08)을 다루며, 에러 응답의 actionable hint, MCP 아키텍처 옵션 검토, 원격 접근 보안 가이드를 포함한다.

**설계 원칙:**
- AI 에이전트가 에러로부터 자율 복구할 수 있도록 **actionable guidance**를 제공한다
- MCP 통합 아키텍처는 **현재 안정적인 표준**을 우선하되, 미래 확장 경로를 명시한다
- 원격 접근은 **localhost 보안 모델을 유지**하면서 운영 유연성을 확보한다

### 1.2 참조 문서

| 문서 ID | 파일 | 본 문서와의 관계 |
|---------|------|-----------------|
| CORE-06 | 29-api-framework-design.md | ErrorResponseSchema 원본 정의, 글로벌 에러 핸들러 |
| SDK-MCP | 38-sdk-mcp-interface.md | MCP Server 현재 아키텍처, SDK 에러 처리 패턴 |
| API-SPEC | 37-rest-api-complete-spec.md | 7도메인 40개 에러 코드 체계, 31 엔드포인트 |
| CORE-01 | 24-monorepo-data-directory.md | config.toml 스펙, `z.literal('127.0.0.1')` 바인딩 정책 |
| AUTH-REDESIGN | 52-auth-model-redesign.md | masterAuth implicit/explicit 이중 모드, 3-tier 인증 |

### 1.3 요구사항 매핑

| 요구사항 | 설명 | 충족 섹션 |
|---------|------|-----------|
| DX-06 | 에러 응답에 hint 필드(optional string) 추가 | 섹션 2 |
| DX-07 | MCP 데몬 내장 옵션 3가지 비교 + 채택 결정 | 섹션 3 |
| DX-08 | 원격 에이전트 접근 가이드 (SSH, VPN, --expose) | 섹션 4 |

---

## 2. hint 필드 에러 응답 (DX-06)

### 2.1 ErrorResponseSchema 확장

기존 CORE-06에서 정의한 `ErrorResponseSchema`에 `hint` 필드를 **backward-compatible 확장**으로 추가한다. `hint`는 optional string이므로 기존 클라이언트는 영향을 받지 않는다.

**v0.5 확장 스키마:**

```typescript
// packages/core/src/schemas/error.ts (v0.5 확장)
import { z } from '@hono/zod-openapi'

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().openapi({
      description: '에러 코드 (SCREAMING_SNAKE_CASE)',
      example: 'INSUFFICIENT_BALANCE',
    }),
    message: z.string().openapi({
      description: '사람이 읽을 수 있는 에러 메시지',
      example: '잔액이 부족합니다',
    }),
    details: z.record(z.unknown()).optional().openapi({
      description: '에러 관련 추가 정보',
      example: { required: '1000000000', available: '500000000' },
    }),
    requestId: z.string().openapi({
      description: '요청 추적 ID',
      example: 'req_01HV8PQXYZ9ABC2DEF3G',
    }),
    retryable: z.boolean().optional().openapi({
      description: '재시도 가능 여부 (true이면 동일 요청 재시도 가능)',
      example: false,
    }),
    // ── v0.5 추가 ──
    hint: z.string().optional().openapi({
      description: '다음 행동을 안내하는 actionable 가이드. AI 에이전트가 자율 복구에 활용.',
      example: '에이전트 지갑에 SOL을 입금하세요. 주소: {agentAddress}',
    }),
  }),
}).openapi('ErrorResponse')

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
```

**backward-compatible 확장 보장:**

| 항목 | 기존 (v0.2) | 확장 (v0.5) | 호환성 |
|------|------------|------------|--------|
| `hint` 필드 | 없음 | `z.string().optional()` | 기존 클라이언트는 무시 |
| JSON 파싱 | 기존 5필드 | 기존 5필드 + `hint` | 추가 필드 무시 (JSON 표준) |
| SDK 에러 클래스 | `WAIaaSError` 6속성 | `WAIaaSError` 7속성 (`hint` 추가) | optional 속성, 기존 코드 무영향 |
| OpenAPI 스펙 | ErrorResponse 5필드 | ErrorResponse 6필드 | additive change only |

**hint 필드 설계 원칙:**

1. **Actionable:** "다음에 무엇을 해야 하는가"를 안내 (상태 설명이 아닌 행동 지시)
2. **Context-aware:** 동적 변수(`{variable}`)로 구체적 정보 포함
3. **AI-friendly:** LLM이 파싱하여 자율 판단에 활용할 수 있는 자연어
4. **Optional:** 모든 에러에 hint가 있는 것은 아님 (명확한 복구 경로가 있는 경우에만)
5. **Locale-independent:** 영문 기반 (AI 에이전트 소비 기준), 필요 시 `message`에 한글 유지

### 2.2 주요 에러 코드별 hint 맵

7개 도메인(AUTH, SESSION, TX, POLICY, OWNER, SYSTEM, AGENT)에서 40개 에러 코드 중 **actionable한 복구 경로가 있는 에러**에 hint를 매핑한다. hint는 서버에서 에러 응답 생성 시 `errorHintMap`을 참조하여 동적으로 주입된다.

#### hint 동적 변수 패턴

hint 문자열에 `{variable}` 템플릿을 사용하여 런타임 컨텍스트를 주입한다.

```typescript
// packages/daemon/src/server/error-hints.ts

/**
 * 에러 코드별 hint 템플릿 맵.
 * {variable}는 에러 생성 시 details 또는 컨텍스트에서 치환.
 */
export const errorHintMap: Record<string, string> = {
  // ── AUTH 도메인 (8개 중 6개 hint) ──
  'INVALID_TOKEN':
    'Session token is invalid or malformed. Create a new session: POST /v1/sessions with masterAuth.',
  'TOKEN_EXPIRED':
    'Session token has expired. Create a new session or renew the current one: PUT /v1/sessions/{sessionId}/renew.',
  'SESSION_REVOKED':
    'This session was revoked by the owner or system. Create a new session: POST /v1/sessions.',
  'INVALID_SIGNATURE':
    'Owner SIWS/SIWE signature verification failed. Ensure the message matches the expected format and the correct wallet is signing.',
  'INVALID_NONCE':
    'Nonce is expired or already used. Request a fresh nonce: GET /v1/nonce, then retry with the new nonce.',
  'INVALID_MASTER_PASSWORD':
    'Master password is incorrect. Verify the password and retry. After 5 consecutive failures, a 30-minute lockout applies.',

  // MASTER_PASSWORD_LOCKED: hint 없음 (30분 대기만 가능, 행동 불가)
  // SYSTEM_LOCKED: hint 없음 (Kill Switch 상태, Owner 복구 필요 -- 에이전트 범위 밖)

  // ── SESSION 도메인 (8개 중 7개 hint) ──
  'SESSION_NOT_FOUND':
    'No session found with this ID. List active sessions: GET /v1/sessions, or create a new one: POST /v1/sessions.',
  'SESSION_EXPIRED':
    'Session has expired. Create a new session: POST /v1/sessions with the desired constraints.',
  'SESSION_LIMIT_EXCEEDED':
    'Session constraint exceeded (amount, count, or address limit). Check current usage via GET /v1/sessions/{sessionId} and request a new session with higher limits if needed.',
  'CONSTRAINT_VIOLATED':
    'Operation or destination not in the allowed list. Check session constraints via GET /v1/sessions/{sessionId}. Allowed operations: {allowedOperations}.',
  'RENEWAL_LIMIT_REACHED':
    'Maximum renewal count ({maxRenewals}) reached. Create a new session: POST /v1/sessions.',
  'SESSION_ABSOLUTE_LIFETIME_EXCEEDED':
    'Session has reached its absolute lifetime ({absoluteLifetime}). Create a new session: POST /v1/sessions.',
  'RENEWAL_TOO_EARLY':
    'Session renewal is only allowed after 50% of the current period has elapsed. Current period remaining: {remainingTime}. Retry after {retryAfter}.',

  // SESSION_RENEWAL_MISMATCH: hint 없음 (보안 문제, 의도적 차단)

  // ── TX 도메인 (7개 중 6개 hint) ──
  'INSUFFICIENT_BALANCE':
    'Insufficient balance. Required: {required}, available: {available}. Fund the agent wallet at address: {agentAddress}.',
  'INVALID_ADDRESS':
    'Destination address format is invalid. Solana addresses must be base58 (32-44 chars). EVM addresses must be 0x-prefixed hex (42 chars).',
  'TX_NOT_FOUND':
    'Transaction not found. Verify the transaction ID and check history: GET /v1/transactions.',
  'TX_EXPIRED':
    'Transaction expired (approval timeout or blockhash expiry). Submit a new transaction: POST /v1/transactions/send.',
  'TX_ALREADY_PROCESSED':
    'This transaction was already processed. Check its final status: GET /v1/transactions/{transactionId}.',
  'CHAIN_ERROR':
    'Blockchain RPC error (retryable). The node may be temporarily unavailable. Retry after {retryAfter} seconds.',

  // SIMULATION_FAILED: 자세한 시뮬레이션 에러는 details에 포함되므로 별도 hint 불필요

  // ── POLICY 도메인 (4개 중 3개 hint) ──
  'POLICY_DENIED':
    'Transaction denied by policy engine. Rule: {ruleName}. Adjust the transaction parameters or contact the owner to update policies.',
  'SPENDING_LIMIT_EXCEEDED':
    'Spending limit exceeded. Tier: {tier}, limit: {limit}, used: {used}. Wait for the limit window to reset or request owner approval.',
  'RATE_LIMIT_EXCEEDED':
    'API rate limit exceeded. Retry after {retryAfter} seconds. Current limit: {limit} requests per {window}.',

  // WHITELIST_DENIED: hint 없음 (보안상 화이트리스트 내용 노출 불가)

  // ── OWNER 도메인 (4개 중 3개 hint) ──
  'OWNER_NOT_CONNECTED':
    'No owner wallet is connected. The owner must register first via waiaas agent create --owner <address>.',
  'APPROVAL_TIMEOUT':
    'Owner approval timed out for transaction {transactionId}. Submit a new transaction: POST /v1/transactions/send.',
  'APPROVAL_NOT_FOUND':
    'No pending approval found for this transaction. Check pending approvals list or verify the transaction status.',

  // OWNER_ALREADY_CONNECTED: hint 없음 (상태 확인만, 복구 행동 없음)

  // ── SYSTEM 도메인 (6개 중 4개 hint) ──
  'KEYSTORE_LOCKED':
    'Keystore is locked (daemon still initializing). Retry after a few seconds.',
  'CHAIN_NOT_SUPPORTED':
    'Chain "{chain}" is not supported. Supported chains: solana, ethereum (EVM stub).',
  'SHUTTING_DOWN':
    'Daemon is shutting down. Wait for restart and retry. Check status: GET /health.',
  'ADAPTER_NOT_AVAILABLE':
    'Chain adapter for "{chain}" is not initialized. Check daemon logs for adapter initialization errors.',

  // KILL_SWITCH_ACTIVE: hint 없음 (에이전트가 복구 불가, Owner 전용)
  // KILL_SWITCH_NOT_ACTIVE: hint 없음 (정보 확인만)

  // ── AGENT 도메인 (3개 중 2개 hint) ──
  'AGENT_NOT_FOUND':
    'Agent not found or ownership mismatch. List available agents or create a new one: waiaas agent create --owner <address>.',
  'AGENT_SUSPENDED':
    'Agent is suspended. Contact the owner to reactivate the agent.',

  // AGENT_TERMINATED: hint 없음 (영구 종료, 복구 불가)
}
```

#### hint 맵 통계

| 도메인 | 전체 에러 코드 | hint 매핑 | hint 없음 | 비율 |
|--------|-------------|----------|----------|------|
| AUTH | 8 | 6 | 2 | 75% |
| SESSION | 8 | 7 | 1 | 88% |
| TX | 7 | 6 | 1 | 86% |
| POLICY | 4 | 3 | 1 | 75% |
| OWNER | 4 | 3 | 1 | 75% |
| SYSTEM | 6 | 4 | 2 | 67% |
| AGENT | 3 | 2 | 1 | 67% |
| **합계** | **40** | **31** | **9** | **78%** |

**hint 미제공 에러 (9개) 사유:**

| 에러 코드 | 미제공 사유 |
|----------|-----------|
| `MASTER_PASSWORD_LOCKED` | 30분 대기만 가능, 에이전트가 취할 행동 없음 |
| `SYSTEM_LOCKED` | Kill Switch 활성, Owner만 복구 가능 |
| `SESSION_RENEWAL_MISMATCH` | 보안 위반 시도, 의도적 차단 |
| `SIMULATION_FAILED` | details에 시뮬레이션 에러 상세 포함 (hint 중복) |
| `WHITELIST_DENIED` | 보안상 화이트리스트 내용 노출 불가 |
| `OWNER_ALREADY_CONNECTED` | 이미 연결 상태, 추가 행동 불필요 |
| `KILL_SWITCH_ACTIVE` | Owner 전용 복구, 에이전트 범위 밖 |
| `KILL_SWITCH_NOT_ACTIVE` | 정보성 에러, 복구 행동 없음 |
| `AGENT_TERMINATED` | 영구 종료, 복구 불가 |

#### hint 치환 구현 패턴

```typescript
// packages/daemon/src/server/error-hints.ts (계속)

/**
 * 에러 코드에 대한 hint를 생성한다.
 * 템플릿 변수를 details 또는 context에서 치환.
 *
 * @param code 에러 코드
 * @param variables 치환 변수 맵 (details + 추가 컨텍스트)
 * @returns 치환된 hint 문자열 또는 undefined
 */
export function resolveHint(
  code: string,
  variables?: Record<string, string | number>,
): string | undefined {
  const template = errorHintMap[code]
  if (!template) return undefined
  if (!variables) return template

  return template.replace(
    /\{(\w+)\}/g,
    (match, key) => {
      const value = variables[key]
      return value !== undefined ? String(value) : match
    },
  )
}
```

**사용 예시 (글로벌 에러 핸들러 확장):**

```typescript
// packages/daemon/src/server/error-handler.ts (v0.5 확장)
import { resolveHint } from './error-hints.js'

// WaiaasError 처리 부분 확장
if (err instanceof WaiaasError) {
  const hint = resolveHint(err.code, {
    ...err.details,
    agentAddress: c.get('agentAddress'),
    sessionId: c.get('sessionId'),
  })

  return c.json({
    error: {
      code: err.code,
      message: err.message,
      details: err.details,
      requestId,
      retryable: err.retryable,
      ...(hint && { hint }),  // hint가 있을 때만 포함
    },
  }, err.statusCode)
}
```

**hint 포함 에러 응답 예시:**

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "잔액이 부족합니다.",
    "details": {
      "required": "1000000000",
      "available": "500000000",
      "chain": "solana",
      "symbol": "SOL"
    },
    "requestId": "req_01HV8PQABC2DEF3GHI4J",
    "retryable": false,
    "hint": "Insufficient balance. Required: 1000000000, available: 500000000. Fund the agent wallet at address: 7xKXtg2CnVRzfR4Xm1cHjZHp..."
  }
}
```

### 2.3 SDK/MCP 통합 패턴

hint 필드가 AI 에이전트에게 전달되는 3가지 경로를 정의한다.

#### 2.3.1 TypeScript SDK (`@waiaas/sdk`)

`WAIaaSError` 클래스에 `hint` 속성을 추가한다.

```typescript
// packages/sdk/src/error.ts (v0.5 확장)

export class WAIaaSError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly retryable: boolean
  readonly requestId?: string
  readonly details?: Record<string, unknown>
  readonly hint?: string  // v0.5 추가

  constructor(
    code: string,
    message: string,
    statusCode: number,
    retryable: boolean,
    requestId?: string,
    details?: Record<string, unknown>,
    hint?: string,  // v0.5 추가
  ) {
    super(message)
    this.name = 'WAIaaSError'
    this.code = code
    this.statusCode = statusCode
    this.retryable = retryable
    this.requestId = requestId
    this.details = details
    this.hint = hint
  }

  /** AI 에이전트용 요약 (hint 포함) */
  toAgentSummary(): string {
    const parts = [`[${this.code}] ${this.message}`]
    if (this.hint) parts.push(`Hint: ${this.hint}`)
    if (this.retryable) parts.push('(retryable)')
    return parts.join(' | ')
  }
}
```

**에러 파싱 코드 확장 (http.ts):**

```typescript
// packages/sdk/src/internal/http.ts (에러 파싱 부분 확장)
const waiaasError = new WAIaaSError(
  (error.code as string) ?? 'UNKNOWN_ERROR',
  (error.message as string) ?? `HTTP ${res.status}`,
  res.status,
  this.retry.retryableStatuses.includes(res.status),
  (error.requestId as string) ?? res.headers.get('X-Request-ID') ?? undefined,
  error.details as Record<string, unknown> | undefined,
  (error.hint as string) ?? undefined,  // v0.5 추가
)
```

**사용 예시:**

```typescript
try {
  await client.sendToken({ to, amount })
} catch (err) {
  if (err instanceof WAIaaSError) {
    console.error(err.toAgentSummary())
    // [INSUFFICIENT_BALANCE] 잔액이 부족합니다. | Hint: Insufficient balance. Required: 1000000000, available: 500000000. Fund the agent wallet at address: 7xKXtg2... | (retryable: false)

    if (err.hint) {
      // AI 에이전트가 hint를 기반으로 자율 판단
      // 예: 잔액 부족 -> 입금 요청 또는 금액 조정
    }
  }
}
```

#### 2.3.2 MCP Server (`@waiaas/mcp`)

MCP Tool의 에러 응답에 hint를 포함하여 LLM이 직접 참조할 수 있도록 한다.

```typescript
// packages/mcp/src/tools/send-token.ts (v0.5 확장)

// 에러 응답 부분
if (!res.ok) {
  const error = data.error ?? data
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        error: true,
        code: error.code,
        message: error.message,
        retryable: error.retryable ?? false,
        ...(error.hint && { hint: error.hint }),  // v0.5: hint 전달
      }),
    }],
    isError: true,
  }
}
```

**MCP 에러 응답에서 hint 활용 패턴:**

LLM은 MCP Tool 호출 실패 시 `isError: true`인 응답의 `content[0].text`를 JSON으로 파싱한다. `hint` 필드가 존재하면 복구 행동을 자율적으로 결정한다.

```
[MCP Tool 호출 실패]
  ↓
content[0].text = '{"error":true,"code":"INSUFFICIENT_BALANCE","message":"잔액 부족","retryable":false,"hint":"Insufficient balance. Required: 1000000000, available: 500000000. Fund the agent wallet at address: 7xKXtg2..."}'
  ↓
LLM이 hint를 파싱하여:
  - "입금이 필요하다" 판단
  - get_address Tool 호출하여 주소 확인
  - 사용자에게 입금 안내 또는 금액 조정 후 재시도
```

**MCP 에러 응답 공통 헬퍼:**

```typescript
// packages/mcp/src/internal/error-response.ts (v0.5 신규)

/**
 * MCP Tool 에러 응답 생성 헬퍼.
 * 서버 에러 응답에서 hint를 추출하여 LLM에 전달.
 */
export function mcpErrorResponse(data: Record<string, unknown>) {
  const error = (data.error ?? data) as Record<string, unknown>
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        error: true,
        code: error.code ?? 'UNKNOWN_ERROR',
        message: error.message ?? 'Unknown error',
        retryable: error.retryable ?? false,
        ...(error.hint && { hint: error.hint }),
      }),
    }],
    isError: true,
  }
}
```

이 헬퍼를 모든 MCP Tool에서 공통 사용하여 일관된 에러+hint 전달을 보장한다.

#### 2.3.3 Python SDK (`waiaas`)

Python SDK의 `WAIaaSError`에 `hint` 속성을 추가한다.

```python
# waiaas/error.py (v0.5 확장)
from typing import Optional, Any


class WAIaaSError(Exception):
    """WAIaaS SDK 에러. API-SPEC 에러 코드 체계와 1:1 매핑."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int,
        retryable: bool,
        request_id: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
        hint: Optional[str] = None,  # v0.5 추가
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.retryable = retryable
        self.request_id = request_id
        self.details = details
        self.hint = hint

    def to_agent_summary(self) -> str:
        """AI 에이전트용 요약 (hint 포함)."""
        parts = [f"[{self.code}] {self.message}"]
        if self.hint:
            parts.append(f"Hint: {self.hint}")
        if self.retryable:
            parts.append("(retryable)")
        return " | ".join(parts)
```

**에러 파싱 확장 (_handle_response):**

```python
# waiaas/client.py (v0.5 에러 파싱 확장)
def _handle_response(self, response: httpx.Response) -> dict[str, Any]:
    if response.is_success:
        return response.json()
    try:
        body = response.json()
        error = body.get("error", body)
    except Exception:
        error = {}

    raise WAIaaSError(
        code=error.get("code", "UNKNOWN_ERROR"),
        message=error.get("message", f"HTTP {response.status_code}"),
        status_code=response.status_code,
        retryable=response.status_code in (429, 502, 503, 504),
        request_id=error.get("requestId"),
        details=error.get("details"),
        hint=error.get("hint"),  # v0.5 추가
    )
```

**사용 예시:**

```python
try:
    tx = await client.send_token(TransferRequest(to=addr, amount="1000000000"))
except WAIaaSError as e:
    print(e.to_agent_summary())
    # [INSUFFICIENT_BALANCE] 잔액이 부족합니다. | Hint: Insufficient balance. Required: 1000000000, available: 500000000. Fund the agent wallet at address: 7xKXtg2... | (retryable: false)

    if e.hint:
        # AI 에이전트 프레임워크에 hint 전달
        agent.process_error_hint(e.hint)
```

#### 2.3.4 hint 전달 경로 요약

```
                    ┌─────────────────────────┐
                    │  WAIaaS Daemon           │
                    │  ErrorResponseSchema     │
                    │  + hint (optional)       │
                    └───────┬─────────────────┘
                            │ JSON response
               ┌────────────┼────────────────┐
               ▼            ▼                ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ TS SDK       │ │ MCP Server   │ │ Python SDK   │
    │ error.hint   │ │ content hint │ │ error.hint   │
    │ ↓            │ │ ↓            │ │ ↓            │
    │ toAgent      │ │ LLM 직접    │ │ to_agent     │
    │ Summary()    │ │ 파싱 활용   │ │ _summary()   │
    └──────────────┘ └──────────────┘ └──────────────┘
               │            │                │
               ▼            ▼                ▼
         ┌─────────────────────────────────────┐
         │        AI 에이전트 / LLM            │
         │  hint를 기반으로 자율 복구 판단     │
         └─────────────────────────────────────┘
```

---

## 3. MCP 데몬 내장 옵션 검토 (DX-07)

### 3.1 검토 배경

현재 WAIaaS의 MCP 아키텍처는 SDK-MCP (38-sdk-mcp-interface.md) 섹션 5에서 정의된 **별도 stdio 프로세스** 모델을 따른다.

**현재 아키텍처 요약:**

```
┌──────────────────┐     stdio      ┌──────────────────┐     HTTP      ┌──────────────────┐
│ Claude Desktop   │ ◀──────────▶  │ @waiaas/mcp      │ ─────────▶  │ WAIaaS Daemon    │
│ (MCP Host)       │   JSON-RPC    │ (별도 프로세스)    │  localhost   │ :3100            │
└──────────────────┘               └──────────────────┘              └──────────────────┘
```

| 항목 | 현재 값 |
|------|--------|
| 패키지 | `@waiaas/mcp` (packages/mcp/) |
| Transport | stdio (stdin/stdout JSON-RPC) |
| 인증 | `WAIAAS_SESSION_TOKEN` 환경변수 |
| 프로세스 | MCP Host(Claude Desktop)가 별도 프로세스로 spawn |
| API 호출 | `http://127.0.0.1:3100` (localhost HTTP) |
| Tools | 6개 (send_token, get_balance, get_address, list_transactions, get_transaction, get_nonce) |
| Resources | 3개 (wallet-balance, wallet-address, system-status) |

**검토 동기:**
- `WAIAAS_SESSION_TOKEN` 수동 설정의 불편함 (토큰 만료 시 재설정 필요)
- 데몬과 MCP Server가 별도 프로세스로 관리되는 운영 복잡성
- MCP 프로토콜 진화 (Streamable HTTP transport 도입, 2025-03-26 spec)

### 3.2 옵션 A: 데몬 내장 MCP (Streamable HTTP) -- 기각

**개념:** WAIaaS 데몬이 REST API 서버와 MCP Streamable HTTP 서버를 동시에 호스팅한다.

```
┌──────────────────┐   Streamable HTTP  ┌──────────────────────────────┐
│ Claude Desktop   │ ◀────────────────▶ │ WAIaaS Daemon                │
│ (MCP Host)       │    :3101           │ :3100 (REST) + :3101 (MCP)  │
└──────────────────┘                    └──────────────────────────────┘
```

**구현 구조:**

```typescript
// 개념적 코드 (구현하지 않음)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

// 데몬 시작 시 MCP Server도 함께 초기화
export function startDaemonWithMcp(config: DaemonConfig) {
  // 1. REST API 서버 (기존)
  const app = createApp(deps)
  serve({ fetch: app.fetch, port: 3100, hostname: '127.0.0.1' })

  // 2. MCP Streamable HTTP 서버 (추가)
  const mcpServer = createMcpServer()
  const mcpTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
  mcpServer.connect(mcpTransport)
  // Hono 또는 별도 HTTP 서버에서 /mcp 경로로 서빙
}
```

**장점:**

| 장점 | 설명 |
|------|------|
| 세션 토큰 불필요 | 데몬 내부에서 직접 서비스 호출, `WAIAAS_SESSION_TOKEN` 환경변수 불필요 |
| 프로세스 1개 관리 | 데몬 하나만 시작하면 REST + MCP 모두 사용 가능 |
| 내부 호출 최적화 | HTTP 왕복 없이 직접 서비스 함수 호출 가능 |

**단점 (기각 근거):**

| 단점 | 심각도 | 설명 |
|------|--------|------|
| MCP Host 호환성 | HIGH | Claude Desktop, Cursor 등 주요 MCP Host는 **stdio transport를 기본 지원**하며, Streamable HTTP 지원은 불완전하거나 미지원 (2026-02 기준) |
| SDK 안정성 | HIGH | `@modelcontextprotocol/sdk`의 Streamable HTTP Server transport는 1.10.0+에서 도입되었으나, stdio 대비 프로덕션 사례 부족 |
| 데몬 비대화 | MEDIUM | MCP Server 로직이 데몬에 결합되어 단일 책임 원칙 위반, 테스트/배포 복잡성 증가 |
| 인증 모델 충돌 | MEDIUM | 데몬 내장 시 masterAuth implicit 범위에서 MCP 호출이 발생하여, sessionAuth 기반 제약(금액 한도, 허용 작업)이 우회될 수 있음 |
| 포트 추가 | LOW | MCP용 별도 포트(3101) 또는 경로(/mcp) 필요, 방화벽/프록시 설정 추가 |

**기각 결정:**

> 옵션 A는 **MCP Host 호환성 부족**과 **인증 모델 충돌**이 핵심 기각 사유이다. 현재 시점에서 대부분의 MCP Host는 stdio를 기본으로 사용하며, Streamable HTTP를 지원하더라도 안정성이 검증되지 않았다. 또한 sessionAuth 제약을 우회하는 내부 호출 모델은 WAIaaS의 보안 설계(세션별 금액 한도, 허용 작업 제한)와 충돌한다.

### 3.3 옵션 B: 현행 유지 (별도 stdio 프로세스) -- 채택

**개념:** 현재 SDK-MCP에서 설계된 `@waiaas/mcp` 별도 패키지 + stdio transport를 유지한다.

```
┌──────────────────┐     stdio      ┌──────────────────┐     HTTP      ┌──────────────────┐
│ Claude Desktop   │ ◀──────────▶  │ @waiaas/mcp      │ ─────────▶  │ WAIaaS Daemon    │
│ (MCP Host)       │   JSON-RPC    │ (별도 프로세스)    │  localhost   │ :3100            │
└──────────────────┘               └──────────────────┘              └──────────────────┘
```

**채택 근거:**

| 근거 | 설명 |
|------|------|
| **MCP Host 표준** | Claude Desktop, Cursor, Cline 등 모든 주요 MCP Host가 stdio transport를 기본 지원 |
| **설계 완료** | SDK-MCP (38-sdk-mcp-interface.md)에서 6 Tools + 3 Resources가 이미 상세 설계됨 |
| **관심사 분리** | MCP Server와 데몬이 독립적으로 배포/테스트/업데이트 가능 |
| **sessionAuth 보장** | MCP Server가 `WAIAAS_SESSION_TOKEN`으로 sessionAuth를 통과하므로 세션 제약(금액, 작업, 주소) 준수 |
| **프로세스 격리** | MCP Server 크래시가 데몬에 영향 없음 (stdio 프로세스 재시작만 필요) |

**세션 토큰 불편함 완화 방안:**

현행 유지의 주된 단점인 `WAIAAS_SESSION_TOKEN` 수동 설정을 완화하기 위한 3가지 방안을 정의한다.

**방안 B-1: `waiaas mcp setup` 자동화 커맨드**

```bash
# 세션 토큰 자동 발급 + claude_desktop_config.json 생성
waiaas mcp setup --agent my-bot --expires-in 604800

# 출력:
# Created session token for agent 'my-bot' (expires in 7 days)
# Updated: ~/Library/Application Support/Claude/claude_desktop_config.json
# Restart Claude Desktop to apply changes.
```

**구현 개요:**

```typescript
// packages/cli/src/commands/mcp-setup.ts
async function runMcpSetup(args: string[]): Promise<void> {
  const options = parseMcpSetupOptions(args)

  // 1. masterAuth implicit으로 세션 생성
  const session = await fetch(`http://127.0.0.1:${port}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: options.agentId,
      expiresIn: options.expiresIn ?? 604800,  // 기본 7일
    }),
  })

  // 2. claude_desktop_config.json 업데이트
  const configPath = getClaudeDesktopConfigPath()
  const config = JSON.parse(await readFile(configPath, 'utf-8').catch(() => '{}'))

  config.mcpServers = config.mcpServers ?? {}
  config.mcpServers.waiaas = {
    command: 'npx',
    args: ['waiaas-mcp'],
    env: {
      WAIAAS_SESSION_TOKEN: session.token,
      WAIAAS_BASE_URL: `http://127.0.0.1:${port}`,
    },
  }

  await writeFile(configPath, JSON.stringify(config, null, 2))
  console.log(`MCP config updated at ${configPath}`)
  console.log('Restart Claude Desktop to apply changes.')
}
```

**방안 B-2: 세션 갱신 자동화 (v0.5 연동)**

Phase 20에서 정의한 세션 갱신 프로토콜(53-session-renewal-protocol.md)과 연동하여, MCP Server가 세션 토큰 만료 전에 자동 갱신한다.

```typescript
// packages/mcp/src/internal/session-manager.ts (v0.5 확장)

/**
 * MCP Server 세션 자동 갱신.
 * 세션 만료 50% 시점에 PUT /v1/sessions/:id/renew 호출.
 */
export class McpSessionManager {
  private token: string
  private sessionId: string
  private renewalTimer?: NodeJS.Timeout

  constructor(initialToken: string) {
    this.token = initialToken
    this.sessionId = this.extractSessionId(initialToken)
    this.scheduleRenewal()
  }

  getToken(): string {
    return this.token
  }

  private async renewSession(): Promise<void> {
    try {
      const res = await fetch(
        `${BASE_URL}/v1/sessions/${this.sessionId}/renew`,
        {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${this.token}` },
        },
      )
      if (res.ok) {
        const data = await res.json()
        this.token = data.token
        this.sessionId = data.sessionId
        this.scheduleRenewal()
        console.error('[waiaas-mcp] Session renewed successfully')
      }
    } catch (err) {
      console.error('[waiaas-mcp] Session renewal failed:', err)
    }
  }

  private scheduleRenewal(): void {
    // JWT에서 exp 추출, 50% 시점에 갱신 스케줄
    const payload = JSON.parse(
      Buffer.from(this.token.split('.')[1], 'base64url').toString(),
    )
    const expiresAt = payload.exp * 1000
    const issuedAt = payload.iat * 1000
    const halfLife = (expiresAt - issuedAt) / 2
    const renewAt = issuedAt + halfLife - Date.now()

    if (renewAt > 0) {
      this.renewalTimer = setTimeout(() => this.renewSession(), renewAt)
    }
  }

  private extractSessionId(token: string): string {
    const jwt = token.replace('wai_sess_', '')
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
    return payload.sid
  }

  destroy(): void {
    if (this.renewalTimer) clearTimeout(this.renewalTimer)
  }
}
```

**방안 B-3: 환경변수 파일 자동 로드**

```bash
# ~/.waiaas/.mcp-env 파일에 토큰 저장 (waiaas mcp setup이 생성)
WAIAAS_SESSION_TOKEN=wai_sess_eyJhbGciOiJIUzI1NiIs...
WAIAAS_BASE_URL=http://127.0.0.1:3100
```

MCP Server 시작 시 `~/.waiaas/.mcp-env` 파일을 자동으로 로드한다.

```typescript
// packages/mcp/src/internal/config.ts (v0.5 확장)
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

function loadMcpEnv(): void {
  const envPath = join(homedir(), '.waiaas', '.mcp-env')
  if (!existsSync(envPath)) return

  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [key, ...valueParts] = trimmed.split('=')
    const value = valueParts.join('=')
    if (key && value && !process.env[key]) {
      process.env[key] = value
    }
  }
}

// MCP Server 시작 전 호출
loadMcpEnv()
```

### 3.4 옵션 C: 하이브리드 (--mcp-stdio) -- 미래 확장

**개념:** 데몬 프로세스가 내부적으로 MCP Server를 생성하고, stdin/stdout으로 직접 stdio transport를 제공한다. 세션 토큰 없이 데몬 내부 서비스를 직접 호출한다.

```
┌──────────────────┐     stdio      ┌───────────────────────────────────┐
│ Claude Desktop   │ ◀──────────▶  │ WAIaaS Daemon --mcp-stdio         │
│ (MCP Host)       │   JSON-RPC    │ REST(:3100) + MCP(stdin/stdout)   │
└──────────────────┘               └───────────────────────────────────┘
```

**구현 개요:**

```bash
# 데몬을 MCP stdio 모드로 시작
waiaas start --mcp-stdio --agent my-bot

# Claude Desktop config
{
  "mcpServers": {
    "waiaas": {
      "command": "waiaas",
      "args": ["start", "--mcp-stdio", "--agent", "my-bot"]
    }
  }
}
```

```typescript
// 개념적 코드 (v0.5에서는 구현하지 않음)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

async function startDaemonMcpStdio(config: DaemonConfig, agentId: string) {
  // 1. 데몬 초기화 (DB, KeyStore, Adapters 등)
  const deps = await initializeDaemon(config)

  // 2. REST API 서버 시작 (기존, 백그라운드)
  startServer(createApp(deps), config)

  // 3. MCP Server를 데몬 내부 서비스에 직접 연결
  const mcpServer = createInternalMcpServer(deps, agentId)

  // 4. stdin/stdout으로 stdio transport 연결
  const transport = new StdioServerTransport()
  await mcpServer.connect(transport)

  // 주의: console.log는 stdout을 사용하므로 모든 로그를 stderr로 리다이렉트
  // console.log = (...args) => console.error(...args)
}
```

**장점:**

| 장점 | 설명 |
|------|------|
| 세션 토큰 불필요 | 데몬 내부 서비스 직접 호출, sessionAuth 건너뜀 |
| 단일 프로세스 | Claude Desktop이 데몬을 직접 MCP Server로 실행 |
| stdio 호환 | MCP Host의 stdio 지원 활용 (옵션 A의 Streamable HTTP 호환성 문제 없음) |

**단점:**

| 단점 | 심각도 | 설명 |
|------|--------|------|
| stdout 충돌 | HIGH | MCP stdio는 stdout을 JSON-RPC 전용으로 사용. 데몬 로그가 stdout에 출력되면 프로토콜 파손. 모든 로그를 stderr로 리다이렉트해야 함 |
| foreground 전용 | MEDIUM | stdout이 MCP 프로토콜에 점유되므로 `--daemon` (백그라운드) 모드와 병용 불가 |
| sessionAuth 우회 | MEDIUM | 내부 직접 호출 시 세션 제약(금액 한도, 허용 작업)이 우회됨. 별도 제약 메커니즘 필요 |
| 에이전트 고정 | LOW | `--agent` 플래그로 단일 에이전트 바인딩, MCP 세션 중 에이전트 전환 불가 |

**claude_desktop_config.json 예시:**

```json
{
  "mcpServers": {
    "waiaas": {
      "command": "waiaas",
      "args": ["start", "--mcp-stdio", "--agent", "my-bot"],
      "env": {
        "WAIAAS_MASTER_PASSWORD": "your-master-password"
      }
    }
  }
}
```

> **보안 주의:** `--mcp-stdio` 모드에서는 `WAIAAS_MASTER_PASSWORD` 환경변수가 필요하다(데몬 시작 시 키스토어 잠금 해제). claude_desktop_config.json에 패스워드가 평문으로 저장되므로 파일 권한(0o600)을 반드시 설정해야 한다.

**미래 확장 정의:**

| 항목 | 정의 |
|------|------|
| 구현 시기 | v0.6 이후 (v0.5 설계 범위 외) |
| 전제 조건 | 로그 시스템이 stderr 전용으로 전환, 내부 호출 제약 메커니즘 설계 |
| 우선순위 | 방안 B의 3가지 완화책(mcp setup, 세션 자동 갱신, env 파일)이 충분히 DX를 개선하므로 낮음 |

### 3.5 결론 및 마이그레이션 경로

**채택 결정: 옵션 B (현행 유지)**

| 시점 | 선택 | 조치 |
|------|------|------|
| **현재 (v0.5)** | **옵션 B** | 현행 유지 + 완화책 3가지(mcp setup, 세션 자동 갱신, env 파일) |
| 단기 (v0.5~v0.6) | 옵션 B + 자동화 | `waiaas mcp setup` CLI 커맨드 구현, McpSessionManager 세션 자동 갱신 |
| 중기 (v0.6~v0.7) | 옵션 C 검토 | `--mcp-stdio` 플래그 프로토타입, stderr 로그 전환 완료 후 |
| 장기 (v0.8+) | 옵션 A 재검토 | Streamable HTTP가 MCP Host 표준으로 안착하면 데몬 내장 방식 재평가 |

**마이그레이션 경로 다이어그램:**

```
v0.5 (현재)                    v0.6                     v0.7+
┌──────────┐               ┌──────────────┐         ┌───────────────┐
│ 옵션 B   │    mcp setup  │ 옵션 B       │  실험   │ 옵션 C        │
│ 별도     │ ─────────────▶│ + 자동화     │ ──────▶│ --mcp-stdio   │
│ stdio    │    세션 갱신   │ + 세션 갱신  │         │ (선택적)      │
│ 프로세스 │    env 파일    │ + env 파일   │         │               │
└──────────┘               └──────────────┘         └───────────────┘
                                                           │
                                                     Streamable HTTP
                                                     안정화 시점
                                                           │
                                                           ▼
                                                    ┌──────────────┐
                                                    │ 옵션 A 재검토│
                                                    │ 데몬 내장    │
                                                    └──────────────┘
```

**결정 사유 요약:**

1. **stdio는 현재 MCP 표준이다.** 모든 주요 MCP Host(Claude Desktop, Cursor, Cline)가 stdio를 기본 지원한다.
2. **sessionAuth 보장이 보안 설계의 핵심이다.** 내장 옵션(A, C)은 sessionAuth 우회 문제를 수반하므로 별도 제약 메커니즘 설계가 선행되어야 한다.
3. **세션 토큰 불편함은 자동화로 해결 가능하다.** `waiaas mcp setup` + 세션 자동 갱신으로 DX를 충분히 개선할 수 있다.

---

## 4. 원격 에이전트 접근 가이드 (DX-08)

### 4.1 배경

WAIaaS 데몬은 보안 설계상 `127.0.0.1`에만 바인딩된다 (CORE-01, `z.literal('127.0.0.1')`). 이 정책은 masterAuth implicit의 전제 조건이다: "localhost 접근 = 물리적 머신 접근 = 인증된 운영자"로 간주한다 (52-auth-model-redesign.md 섹션 2.1).

그러나 실제 운영 환경에서는 원격 서버에서 데몬을 실행하고 로컬 머신에서 접근해야 하는 시나리오가 빈번하다.

**시나리오 예시:**

| 시나리오 | 설명 |
|---------|------|
| 클라우드 서버 운영 | AWS EC2/GCP VM에서 데몬 실행, 로컬 개발 머신에서 SDK/MCP 사용 |
| Headless 서버 | GUI 없는 서버에서 데몬 실행, 노트북에서 Claude Desktop MCP 연결 |
| 팀 공유 환경 | 팀 내부 서버에서 데몬 공유, 팀원 각자의 머신에서 접근 |
| Docker 원격 | Docker 컨테이너에서 데몬 실행, 호스트 머신 밖에서 접근 |

**핵심 원칙:** localhost 바인딩 정책을 유지하면서 원격 접근을 안전하게 지원한다. 데몬 자체를 외부에 노출하지 않고, 암호화된 터널을 통해 localhost 접근을 원격으로 확장한다.

### 4.2 SSH 터널 (추천)

SSH 터널링은 **추가 인프라 없이** 기존 SSH 인증을 재사용하여 데몬에 안전하게 접근하는 가장 간단한 방법이다.

#### 4.2.1 기본 설정

```bash
# ── 원격 서버 (daemon 실행) ──
# 데몬 시작 (127.0.0.1:3100)
waiaas start

# ── 로컬 머신 (접근) ──
# SSH 터널 설정: 로컬 3100 -> 원격 127.0.0.1:3100
ssh -L 3100:127.0.0.1:3100 user@remote-server

# 이제 로컬에서 http://127.0.0.1:3100 으로 접근 가능
curl http://127.0.0.1:3100/health
# {"status":"healthy","version":"0.2.0","uptime":12345}
```

**작동 원리:**

```
┌─────────────────┐                          ┌──────────────────────────┐
│ 로컬 머신        │                          │ 원격 서버                 │
│                  │                          │                          │
│  SDK/MCP ───▶   │                          │                          │
│  127.0.0.1:3100 │ ──── SSH 암호화 터널 ────▶│ 127.0.0.1:3100           │
│  (로컬 포트)     │                          │ (WAIaaS Daemon)          │
└─────────────────┘                          └──────────────────────────┘
```

**장점:**
- 추가 인프라 불필요 (SSH만 있으면 됨)
- SSH 키/패스워드로 기존 인증 재사용
- 트래픽 암호화 보장 (SSH 터널)
- localhost 바인딩 정책 유지 (데몬은 여전히 127.0.0.1)
- masterAuth implicit 유효 (로컬에서 localhost로 접근)

#### 4.2.2 MCP 원격 사용 예시

SSH 터널을 통해 원격 서버의 데몬을 로컬 MCP로 사용하는 전체 플로우.

```bash
# Step 1: SSH 터널 설정 (백그라운드)
ssh -fNL 3100:127.0.0.1:3100 user@remote-server

# Step 2: 세션 토큰 발급 (터널을 통해 로컬에서 접근)
TOKEN=$(curl -s -X POST http://127.0.0.1:3100/v1/sessions \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"my-bot","expiresIn":604800}' | jq -r '.token')

# Step 3: Claude Desktop config 업데이트
cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "waiaas": {
      "command": "npx",
      "args": ["waiaas-mcp"],
      "env": {
        "WAIAAS_SESSION_TOKEN": "${TOKEN}",
        "WAIAAS_BASE_URL": "http://127.0.0.1:3100"
      }
    }
  }
}
EOF

# 또는 waiaas mcp setup 사용 (v0.5 방안 B-1)
waiaas mcp setup --agent my-bot --expires-in 604800
```

#### 4.2.3 autossh 자동 재연결

SSH 터널이 끊어졌을 때 자동으로 재연결하는 설정.

```bash
# autossh 설치
# macOS: brew install autossh
# Ubuntu: apt install autossh

# 자동 재연결 SSH 터널
autossh -M 0 -fNL 3100:127.0.0.1:3100 \
  -o "ServerAliveInterval=30" \
  -o "ServerAliveCountMax=3" \
  user@remote-server

# systemd 서비스로 등록 (Linux)
# /etc/systemd/system/waiaas-tunnel.service
# [Unit]
# Description=WAIaaS SSH Tunnel
# After=network.target
#
# [Service]
# Type=simple
# ExecStart=/usr/bin/autossh -M 0 -NL 3100:127.0.0.1:3100 \
#   -o "ServerAliveInterval=30" -o "ServerAliveCountMax=3" \
#   -i /home/user/.ssh/id_ed25519 user@remote-server
# Restart=always
# RestartSec=10
#
# [Install]
# WantedBy=multi-user.target
```

#### 4.2.4 SSH Config 간소화

```
# ~/.ssh/config
Host waiaas-remote
    HostName remote-server.example.com
    User deployer
    IdentityFile ~/.ssh/id_ed25519
    LocalForward 3100 127.0.0.1:3100
    ServerAliveInterval 30
    ServerAliveCountMax 3
```

```bash
# 간소화된 접근
ssh -fN waiaas-remote
# 이제 http://127.0.0.1:3100 사용 가능
```

### 4.3 VPN (WireGuard)

VPN은 **다중 서비스 접근**이나 **팀 환경**에 적합하다. WireGuard를 예시로 사용한다.

#### 4.3.1 적합 시나리오

| 시나리오 | SSH 터널 | VPN | 추천 |
|---------|---------|-----|------|
| 단일 서버, 1명 접근 | 간단 | 과도 | SSH |
| 단일 서버, 팀 접근 | 포트 충돌 | 네트워크 공유 | VPN |
| 다중 서비스 (데몬 + DB + 모니터링) | 여러 터널 필요 | 단일 VPN | VPN |
| 일시적 접근 (디버깅) | 즉시 설정 | 초기 설정 필요 | SSH |
| 상시 연결 (운영) | autossh 필요 | 네이티브 지원 | VPN |

#### 4.3.2 WireGuard 설정 개요

```bash
# ── 원격 서버 (WireGuard Peer A) ──
# /etc/wireguard/wg0.conf
[Interface]
PrivateKey = <server-private-key>
Address = 10.0.0.1/24
ListenPort = 51820

[Peer]
PublicKey = <client-public-key>
AllowedIPs = 10.0.0.2/32

# ── 로컬 머신 (WireGuard Peer B) ──
# /etc/wireguard/wg0.conf
[Interface]
PrivateKey = <client-private-key>
Address = 10.0.0.2/24

[Peer]
PublicKey = <server-public-key>
Endpoint = remote-server:51820
AllowedIPs = 10.0.0.1/32
PersistentKeepalive = 25
```

**WAIaaS 접근 방식 (VPN + SSH 터널 조합):**

VPN이 연결되어도 데몬은 여전히 `127.0.0.1`에 바인딩되어 있으므로, VPN 네트워크(10.0.0.x)에서 직접 접근은 불가능하다. SSH 터널을 VPN 내에서 사용한다.

```bash
# VPN 연결 후
ssh -L 3100:127.0.0.1:3100 user@10.0.0.1

# 또는 VPN + socat (SSH 없이)
# 원격 서버에서:
socat TCP4-LISTEN:3100,bind=10.0.0.1,fork TCP4:127.0.0.1:3100
# 로컬에서:
# http://10.0.0.1:3100 접근 (VPN 내부에서만)
# 주의: socat 사용 시 masterAuth implicit이 깨질 수 있음 (non-localhost 접근)
```

> **주의:** VPN 내 socat 포워딩 시 데몬은 `10.0.0.1`에서 오는 요청을 localhost로 인식하지 않는다. masterAuth implicit이 동작하지 않으므로 explicit 인증(`X-Master-Password` 헤더)이 필요하다. 이 문제를 피하려면 VPN + SSH 터널 조합을 권장한다.

### 4.4 --expose 플래그 (향후 Phase, 위험성 문서화)

`--expose`는 데몬을 `127.0.0.1` 외의 인터페이스에 바인딩하는 **향후 구현 기능**이다. v0.5에서는 스펙만 정의하고 구현하지 않는다.

#### 4.4.1 개념

```bash
# 모든 인터페이스에 바인딩 (가장 위험)
waiaas start --expose 0.0.0.0

# 특정 네트워크에만 바인딩
waiaas start --expose 10.0.0.0/24

# VPN 인터페이스에만 바인딩
waiaas start --expose 10.0.0.1
```

#### 4.4.2 보안 위험

**--expose 사용 시 발생하는 보안 위험:**

| 위험 | 심각도 | 설명 |
|------|--------|------|
| **masterAuth implicit 붕괴** | CRITICAL | localhost 보안 모델이 무효화됨. "물리적 접근 = 인증"이 더 이상 성립하지 않음 |
| **무인증 접근** | CRITICAL | masterAuth implicit 엔드포인트(16개 System Management API)에 네트워크상 누구나 접근 가능 |
| **평문 HTTP 노출** | HIGH | localhost에서는 TLS 불필요했으나, 네트워크 노출 시 도청/중간자 공격에 취약 |
| **세션 토큰 탈취** | HIGH | 네트워크 트래픽에서 Bearer 토큰 스니핑 가능 |
| **브루트포스 공격** | MEDIUM | 마스터 패스워드 브루트포스 시도 가능 (5회 lockout이 있으나 네트워크 스케일에서 부족) |

#### 4.4.3 미래 구현 요구사항

`--expose` 구현 시 반드시 충족해야 하는 보안 요구사항을 정의한다.

**필수 요구사항 (--expose 구현 전제 조건):**

| # | 요구사항 | 설명 |
|---|---------|------|
| 1 | masterAuth implicit 비활성화 | --expose 시 모든 masterAuth 엔드포인트에 explicit 인증(`X-Master-Password`) 강제 |
| 2 | TLS 필수 | --expose 시 TLS 인증서 경로 필수 (`--tls-cert`, `--tls-key`). 평문 HTTP 차단 |
| 3 | IP 화이트리스트 | 접근 허용 IP/CIDR 목록 필수 (`--allow-from 10.0.0.0/24`) |
| 4 | Rate Limit 강화 | 네트워크 노출 환경에 맞는 공격 방어 rate limit (브루트포스 방지) |
| 5 | 감사 로그 강화 | 원격 접근 시 source IP 기록, 인증 실패 알림 |
| 6 | 시작 경고 | `--expose` 사용 시 보안 경고 배너 출력 + 감사 로그 기록 |

**config.toml 확장 (미래):**

```toml
# 향후 Phase에서 추가
[daemon]
# expose = "0.0.0.0"       # --expose 플래그와 동일
# tls_cert = "/path/to/cert.pem"
# tls_key = "/path/to/key.pem"
# allow_from = ["10.0.0.0/24", "192.168.1.0/24"]
```

#### 4.4.4 현재 권장사항

> **v0.5 권장:** `--expose`는 사용하지 않는다. SSH 터널 또는 VPN을 통해 localhost 접근을 원격으로 확장하는 것이 보안적으로 안전하며, 추가 인프라 없이 즉시 사용 가능하다. `--expose`는 mTLS + IP 화이트리스트 + masterAuth explicit 강제가 구현된 후에만 안전하게 사용할 수 있다.

### 4.5 보안 고려사항 요약 테이블

| 접근 방법 | 데몬 바인딩 | 암호화 | masterAuth implicit | 추가 인프라 | 보안 수준 | 추천 |
|----------|-----------|--------|---------------------|------------|----------|------|
| **SSH 터널** | 127.0.0.1 (유지) | SSH (기본 제공) | 유효 | 없음 (SSH만) | HIGH | **추천** |
| **VPN + SSH** | 127.0.0.1 (유지) | VPN + SSH 이중 | 유효 | WireGuard 등 VPN | HIGH | 팀 환경 추천 |
| **VPN + socat** | 127.0.0.1 (유지, socat 포워딩) | VPN | **비유효** (non-localhost) | VPN + socat | MEDIUM | 주의 필요 |
| **--expose (미래)** | 0.0.0.0 또는 지정 IP | TLS 필수 | **비활성화** (explicit 강제) | TLS 인증서 | 구현에 따라 | v0.5 미지원 |
| **직접 노출 (금지)** | 0.0.0.0 | 없음 | **붕괴** | 없음 | CRITICAL RISK | **절대 금지** |

**접근 방법 선택 가이드:**

```
원격 서버에서 데몬을 사용해야 하나요?
  │
  ├── 1명이 사용 → SSH 터널 (4.2절)
  │
  ├── 팀이 사용 → VPN + SSH 터널 (4.3절)
  │
  ├── 다중 서비스 접근 → VPN (4.3절)
  │
  └── 직접 노출 필요 → 현재 미지원.
      SSH 터널로 대체하거나, 향후 --expose + mTLS 구현 대기 (4.4절)
```
