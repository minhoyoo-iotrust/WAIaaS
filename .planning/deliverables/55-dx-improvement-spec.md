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
