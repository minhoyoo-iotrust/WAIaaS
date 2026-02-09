# SDK & MCP Server 인터페이스 설계 (SDK-MCP)

**문서 ID:** SDK-MCP
**작성일:** 2026-02-05
**v0.5 업데이트:** 2026-02-07
**v0.6 블록체인 기능 확장:** 2026-02-08
**v0.7 API 통합 프로토콜:** 2026-02-08
**v0.9 SessionManager 핵심 설계:** 2026-02-09 (Phase 37-01: 인터페이스 + 토큰 로드, Phase 37-02: 갱신 + 실패 + reload)
**v0.9 SessionManager MCP 통합 설계:** 2026-02-09 (Phase 38-01: ApiClient + tool/resource handler 통합)
**상태:** 완료
**참조:** API-SPEC (37-rest-api-complete-spec.md), CORE-06 (29-api-framework-design.md), SESS-PROTO (30-session-token-protocol.md), TX-PIPE (32-transaction-pipeline-api.md), OWNR-CONN (34-owner-wallet-connection.md), 52-auth-model-redesign.md (v0.5), 53-session-renewal-protocol.md (v0.5), 55-dx-improvement-spec.md (v0.5), 62-action-provider-architecture.md (v0.6), 57-asset-query-fee-estimation-spec.md (v0.6), 61-price-oracle-spec.md (v0.6)
**요구사항:** SDK-01 (TypeScript SDK), SDK-02 (Python SDK), MCP-01 (MCP Server), MCP-02 (Claude Desktop 통합)

---

## 1. 문서 개요

### 1.1 목적

WAIaaS v0.2의 **3가지 클라이언트 통합 경로**를 설계한다:

1. **TypeScript SDK** (`@waiaas/sdk`) -- AI 에이전트 프레임워크가 직접 호출
2. **Python SDK** (`waiaas`) -- Python 기반 에이전트 프레임워크용
3. **MCP Server** (`@waiaas/mcp`) -- Claude Desktop, Cursor 등 MCP 호환 AI 도구에서 사용

세 경로 모두 WAIaaS 데몬의 REST API (`http://127.0.0.1:3100`)를 최종 호출하며, Zod SSoT에서 타입이 파생되는 단일 파이프라인을 공유한다.

### 1.2 요구사항 매핑

| 요구사항 | 설명 | 충족 섹션 |
|---------|------|-----------|
| SDK-01 | TypeScript SDK | 섹션 3 |
| SDK-02 | Python SDK | 섹션 4 |
| MCP-01 | MCP Server 도구/리소스 | 섹션 5 |
| MCP-02 | Claude Desktop 통합 | 섹션 8 |

### 1.3 v0.1 -> v0.2 핵심 변경

| 영역 | v0.1 (Cloud) | v0.2 (Self-Hosted) |
|------|-------------|-------------------|
| 인증 | API Key (`wai_live_xxx`) 영구 | JWT 세션 토큰 (`wai_sess_xxx`) 단기 만료 |
| 서버 URL | `https://api.waiass.io/api/v1` | `http://127.0.0.1:3100` (localhost 전용) |
| SDK 초기화 | `new WAIaaSClient({ apiKey })` | `new WAIaaSClient({ baseUrl, sessionToken })` |
| Owner 관리 | 별도 관리 콘솔 | SDK `WAIaaSOwnerClient` + Tauri Desktop |
| MCP 토큰 | `WAIASS_API_KEY` 환경변수 | `WAIAAS_SESSION_TOKEN` 환경변수 |
| MCP Transport | SSE + stdio | stdio (기본) + Streamable HTTP (v0.3) |

---

## 2. Zod SSoT -> SDK 타입 파이프라인

### 2.1 단일 소스 파이프라인 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│  @waiaas/core (packages/core/src/schemas/)                      │
│                                                                  │
│  Zod Schema 정의                                                 │
│  ├── wallet.schema.ts     (BalanceResponseSchema, ...)           │
│  ├── transaction.schema.ts (TransferRequestSchema, ...)          │
│  ├── session.schema.ts    (SessionConstraintsSchema, ...)        │
│  ├── agent.schema.ts      (AgentSummarySchema, ...)              │
│  └── error.schema.ts      (ErrorResponseSchema, ...)             │
└──────────────┬───────────────────────────────────────────────────┘
               │
    ┌──────────┼──────────┬──────────────┬───────────────┐
    ▼          ▼          ▼              ▼               ▼
┌────────┐ ┌────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐
│ z.infer│ │.openapi│ │openapi-ts │ │TS SDK    │ │ MCP Tool  │
│<typeof>│ │metadata│ │타입 생성   │ │타입 직접  │ │inputSchema│
│        │ │        │ │           │ │import    │ │Zod 재사용  │
│TS 타입 │ │OpenAPI │ │SDK 타입   │ │@waiaas/  │ │@waiaas/   │
│(내부)  │ │3.0 JSON│ │(외부 배포)│ │core 참조 │ │core 참조  │
└────────┘ └────────┘ └───────────┘ └──────────┘ └───────────┘
```

### 2.2 타입 파생 전략

| 소비자 | 타입 획득 방법 | 근거 |
|--------|-------------|------|
| **데몬 내부** | `z.infer<typeof Schema>` 직접 사용 | 동일 모노레포, 런타임 + 타입 동시 제공 |
| **TypeScript SDK** | `@waiaas/core` 패키지 직접 import | 모노레포 workspace, 타입 drift 0% |
| **Python SDK** | OpenAPI JSON -> 수동 Pydantic 모델 매핑 | 별도 언어, 자동 생성 대신 설계 문서 기반 수동 매핑 (v0.2) |
| **MCP Server** | `@waiaas/core` Zod 스키마 직접 재사용 | MCP SDK가 Zod peer dependency, 동일 모노레포 |
| **외부 SDK 사용자** | npm `@waiaas/sdk` 타입 정의 (`d.ts`) | 빌드 시 `tsc` -> `dist/` 타입 배포 |

### 2.3 openapi-typescript 타입 생성 (보조 경로)

```bash
# OpenAPI JSON -> TypeScript 타입 자동 생성 (SDK 보조 타입)
npx openapi-typescript http://127.0.0.1:3100/doc -o packages/sdk/src/generated/api-types.ts
```

**이 경로는 보조적**이다. Primary 타입 소스는 `@waiaas/core` 직접 import이며, `openapi-typescript` 생성 타입은 외부 배포 시 `@waiaas/core`에 의존하지 않는 독립 타입으로 활용한다.

#### 2.4 SDK 클라이언트 사전 검증 패턴 [v0.7 보완]

`@waiaas/sdk`는 `@waiaas/core`에서 Zod 스키마를 import하여, 서버 전송 전 클라이언트에서 요청을 사전 검증한다. 이로써 서버 왕복 없이 즉시 유효성 에러를 반환할 수 있다.

```typescript
// packages/sdk/src/client.ts
import {
  TransferRequestSchema,
  TokenTransferRequestSchema,
  ContractCallRequestSchema,
  ApproveRequestSchema,
  TransactionRequestSchema,
  type TransferRequest,
  type TransactionResponse,
} from '@waiaas/core'

class WAIaaSClient {
  async sendNativeToken(request: TransferRequest): Promise<TransactionResponse> {
    // 서버 전송 전 클라이언트 사전 검증
    TransferRequestSchema.parse(request)  // 실패 시 ZodError throw
    return this.post('/v1/transactions/send', { ...request, type: 'TRANSFER' })
  }

  async sendTransaction(request: TransactionRequest): Promise<TransactionResponse> {
    // discriminatedUnion 검증 (type 필드 기반 자동 스키마 선택)
    TransactionRequestSchema.parse(request)
    return this.post('/v1/transactions/send', request)
  }
}
```

**검증 실패 시 동작:**
- `ZodError` throw (SDK에서 `WAIaaSError`로 래핑)
- 에러 메시지에 어떤 필드가 잘못되었는지 포함 (`issue.path`, `issue.message`)
- 서버에 요청이 전송되지 않음 (네트워크 비용 절약)

**검증 대상 스키마 목록 (24-monorepo-data-directory.md @waiaas/core export 참조):**

| SDK 메서드 | 사전 검증 스키마 | 설명 |
|-----------|----------------|------|
| `sendNativeToken()` | `TransferRequestSchema` | SOL/ETH 네이티브 전송 |
| `sendTokenTransfer()` | `TokenTransferRequestSchema` | SPL/ERC-20 토큰 전송 |
| `contractCall()` | `ContractCallRequestSchema` | 컨트랙트 호출 |
| `approveToken()` | `ApproveRequestSchema` | 토큰 승인 |
| `batchTransaction()` | `BatchRequestSchema` | 배치 트랜잭션 |
| `sendTransaction()` | `TransactionRequestSchema` | discriminatedUnion 5-type |
| `createSession()` | `SessionCreateRequestSchema` | 세션 생성 |

---

## 3. TypeScript SDK (`@waiaas/sdk`) -- SDK-01

### 3.1 패키지 구조

```
packages/sdk/
├── package.json          # @waiaas/sdk
├── tsconfig.json
├── src/
│   ├── index.ts          # Public exports
│   ├── client.ts         # WAIaaSClient (Agent API)
│   ├── owner-client.ts   # WAIaaSOwnerClient (Owner API)
│   ├── error.ts          # WAIaaSError
│   ├── retry.ts          # RetryPolicy + 지수 백오프
│   ├── types.ts          # Options, Response 타입 re-export
│   └── internal/
│       ├── http.ts       # 내부 HTTP 유틸리티 (fetch wrapper)
│       └── constants.ts  # 기본값, 상수
├── tests/
│   ├── client.test.ts
│   ├── owner-client.test.ts
│   └── error.test.ts
└── README.md
```

**package.json 핵심:**

```json
{
  "name": "@waiaas/sdk",
  "version": "0.2.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@waiaas/core": "workspace:*"
  },
  "peerDependencies": {
    "typescript": ">=5.0.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

**외부 런타임 의존성 0개.** `fetch`는 Node.js 22 내장, `@waiaas/core`는 모노레포 workspace 의존.

### 3.2 WAIaaSClientOptions

```typescript
// packages/sdk/src/types.ts
import type { SessionConstraints } from '@waiaas/core/schemas/session.schema.js'

/**
 * Agent SDK 클라이언트 옵션.
 * Options Bag 패턴 (Azure SDK Design Guidelines 준수).
 */
export interface WAIaaSClientOptions {
  /** 데몬 베이스 URL. 기본: 'http://127.0.0.1:3100' */
  baseUrl?: string

  /** 세션 토큰 (wai_sess_...). 초기화 시 또는 setSessionToken()으로 나중에 설정 가능 */
  sessionToken?: string

  /** 재시도 정책. 기본: maxRetries=3, baseDelay=1000, backoff='exponential' */
  retry?: RetryPolicy

  /** 요청 타임아웃 (밀리초). 기본: 30000 (30초) */
  timeout?: number

  /** AbortSignal -- 외부에서 요청 취소 가능 */
  signal?: AbortSignal
}

/**
 * 재시도 정책 설정.
 */
export interface RetryPolicy {
  /** 최대 재시도 횟수. 기본: 3 */
  maxRetries?: number

  /** 백오프 전략. 기본: 'exponential' */
  backoff?: 'exponential' | 'linear' | 'none'

  /** 기본 지연 시간 (밀리초). 기본: 1000 */
  baseDelay?: number

  /** 재시도 대상 HTTP 상태 코드. 기본: [429, 502, 503, 504] */
  retryableStatuses?: number[]
}
```

### 3.3 WAIaaSClient (Agent API)

```typescript
// packages/sdk/src/client.ts
import type {
  BalanceResponse,
  AddressResponse,
  TransactionResponse,
  TransactionListResponse,
  PendingTransactionListResponse,
  NonceResponse,
  TransferRequest,
  TransactionListQuery,
  // v0.6 추가 타입
  AssetsResponse,
  TokenTransferRequest,
  ContractCallRequest,
  ApproveRequest,
  BatchRequest,
  ActionListResponse,
  ActionDetailResponse,
  ActionResolveResponse,
} from '@waiaas/core'
import type { WAIaaSClientOptions, RetryPolicy } from './types.js'
import { WAIaaSError } from './error.js'

const DEFAULT_BASE_URL = 'http://127.0.0.1:3100'
const DEFAULT_TIMEOUT = 30_000
const DEFAULT_RETRY: Required<RetryPolicy> = {
  maxRetries: 3,
  backoff: 'exponential',
  baseDelay: 1000,
  retryableStatuses: [429, 502, 503, 504],
}

export class WAIaaSClient {
  private readonly baseUrl: string
  private readonly timeout: number
  private readonly retry: Required<RetryPolicy>
  private readonly signal?: AbortSignal
  private sessionToken: string | null

  constructor(options: WAIaaSClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.sessionToken = options.sessionToken ?? null
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT
    this.retry = { ...DEFAULT_RETRY, ...options.retry }
    this.signal = options.signal
  }

  // ── 세션 토큰 관리 ──

  /** 세션 토큰 설정 (Owner가 발급한 wai_sess_... 토큰) */
  setSessionToken(token: string): void {
    if (!token.startsWith('wai_sess_')) {
      throw new WAIaaSError(
        'INVALID_TOKEN_FORMAT',
        'Session token must start with "wai_sess_"',
        0, false
      )
    }
    this.sessionToken = token
  }

  /** 현재 세션 토큰 제거 */
  clearSessionToken(): void {
    this.sessionToken = null
  }

  // ── Wallet API ──

  /** 에이전트 지갑 잔액 조회 */
  async getBalance(options?: { signal?: AbortSignal }): Promise<BalanceResponse> {
    return this.get<BalanceResponse>('/v1/wallet/balance', options)
  }

  /** 에이전트 지갑 주소 조회 */
  async getAddress(options?: { signal?: AbortSignal }): Promise<AddressResponse> {
    return this.get<AddressResponse>('/v1/wallet/address', options)
  }

  // ── Transaction API ──

  /**
   * 토큰 전송.
   * INSTANT 티어: CONFIRMED까지 대기 (최대 30초) -> TransactionResponse
   * DELAY/APPROVAL 티어: QUEUED 즉시 반환 (202) -> TransactionResponse
   */
  async sendToken(
    request: TransferRequest,
    options?: { signal?: AbortSignal },
  ): Promise<TransactionResponse> {
    return this.post<TransactionResponse>('/v1/transactions/send', request, options)
  }

  /** 거래 이력 조회 (커서 기반 페이지네이션) */
  async listTransactions(
    query?: TransactionListQuery,
    options?: { signal?: AbortSignal },
  ): Promise<TransactionListResponse> {
    const params = this.buildQueryString(query)
    return this.get<TransactionListResponse>(`/v1/transactions${params}`, options)
  }

  /** 단일 거래 조회 */
  async getTransaction(
    txId: string,
    options?: { signal?: AbortSignal },
  ): Promise<TransactionResponse> {
    return this.get<TransactionResponse>(`/v1/transactions/${txId}`, options)
  }

  /** 대기 중인 거래 목록 (DELAY/APPROVAL 티어) */
  async listPendingTransactions(
    options?: { signal?: AbortSignal },
  ): Promise<PendingTransactionListResponse> {
    return this.get<PendingTransactionListResponse>('/v1/transactions/pending', options)
  }

  // ── Wallet API (v0.6 추가) ──

  /**
   * (v0.6 추가) 에이전트 보유 자산 목록 조회.
   * 네이티브 토큰 + SPL/ERC-20 전체 목록.
   * 정렬: 네이티브 토큰 첫 번째, 잔액 내림차순.
   */
  async getAssets(options?: { signal?: AbortSignal }): Promise<AssetsResponse> {
    return this.get<AssetsResponse>('/v1/wallet/assets', options)
  }

  // ── Transaction API (v0.6 확장: 타입별 단축 메서드) ──

  /**
   * (v0.6 추가) SPL/ERC-20 토큰 전송 단축 메서드.
   * type=TOKEN_TRANSFER로 POST /v1/transactions/send 호출.
   */
  async sendToken(
    request: TokenTransferRequest,
    options?: { signal?: AbortSignal },
  ): Promise<TransactionResponse> {
    return this.post<TransactionResponse>('/v1/transactions/send', {
      ...request,
      type: 'TOKEN_TRANSFER',
    }, options)
  }

  /**
   * (v0.6 추가) 컨트랙트 호출 단축 메서드.
   * type=CONTRACT_CALL로 POST /v1/transactions/send 호출.
   * CONTRACT_WHITELIST + METHOD_WHITELIST 기본 거부 정책 적용.
   */
  async contractCall(
    request: ContractCallRequest,
    options?: { signal?: AbortSignal },
  ): Promise<TransactionResponse> {
    return this.post<TransactionResponse>('/v1/transactions/send', {
      ...request,
      type: 'CONTRACT_CALL',
    }, options)
  }

  /**
   * (v0.6 추가) 토큰 승인 단축 메서드.
   * type=APPROVE로 POST /v1/transactions/send 호출.
   * APPROVED_SPENDERS 기본 거부 정책 적용.
   */
  async approve(
    request: ApproveRequest,
    options?: { signal?: AbortSignal },
  ): Promise<TransactionResponse> {
    return this.post<TransactionResponse>('/v1/transactions/send', {
      ...request,
      type: 'APPROVE',
    }, options)
  }

  /**
   * (v0.6 추가) Solana 배치 트랜잭션 단축 메서드.
   * type=BATCH로 POST /v1/transactions/send 호출.
   * Solana only (EVM BATCH_NOT_SUPPORTED). min 2 / max 20 instructions.
   */
  async batch(
    request: BatchRequest,
    options?: { signal?: AbortSignal },
  ): Promise<TransactionResponse> {
    return this.post<TransactionResponse>('/v1/transactions/send', {
      ...request,
      type: 'BATCH',
    }, options)
  }

  // ── Action API (v0.6 추가) ──

  /** (v0.6 추가) Action Provider 및 Action 목록 조회 */
  async listActions(options?: { signal?: AbortSignal }): Promise<ActionListResponse> {
    return this.get<ActionListResponse>('/v1/actions', options)
  }

  /** (v0.6 추가) 특정 Action 상세 조회 (inputSchema 포함) */
  async getAction(
    providerName: string,
    actionName: string,
    options?: { signal?: AbortSignal },
  ): Promise<ActionDetailResponse> {
    return this.get<ActionDetailResponse>(
      `/v1/actions/${providerName}/${actionName}`, options
    )
  }

  /** (v0.6 추가) Action resolve만 실행 (ContractCallRequest 반환, 파이프라인 미실행) */
  async resolveAction(
    providerName: string,
    actionName: string,
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<ActionResolveResponse> {
    return this.post<ActionResolveResponse>(
      `/v1/actions/${providerName}/${actionName}/resolve`,
      { params },
      options,
    )
  }

  /** (v0.6 추가) Action resolve + 파이프라인 실행 (TransactionResponse 반환) */
  async executeAction(
    providerName: string,
    actionName: string,
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<TransactionResponse> {
    return this.post<TransactionResponse>(
      `/v1/actions/${providerName}/${actionName}/execute`,
      { params },
      options,
    )
  }

  // ── Public API ──

  // ── Session API ── (v0.5 추가)

  /**
   * (v0.5 추가) 세션 갱신. 현재 세션 토큰으로 인증하여 새 토큰을 발급받는다.
   * 갱신 시점: 만료까지 남은 시간이 50% 이하일 때 권장.
   * 상세: 53-session-renewal-protocol.md 참조.
   */
  async renewSession(
    sessionId: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ token: string; expiresAt: string; renewalCount: number }> {
    return this.put(`/v1/sessions/${sessionId}/renew`, undefined, options)
  }

  /** SIWS/SIWE 서명용 nonce 조회 (인증 불필요) */
  async getNonce(options?: { signal?: AbortSignal }): Promise<NonceResponse> {
    return this.get<NonceResponse>('/v1/nonce', options, false)
  }

  // ── Internal HTTP ──

  private async get<T>(
    path: string,
    options?: { signal?: AbortSignal },
    requireAuth: boolean = true,
  ): Promise<T> {
    return this.request<T>('GET', path, undefined, options, requireAuth)
  }

  private async post<T>(
    path: string,
    body: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<T> {
    return this.request<T>('POST', path, body, options, true)
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { signal?: AbortSignal },
    requireAuth: boolean = true,
  ): Promise<T> {
    if (requireAuth && !this.sessionToken) {
      throw new WAIaaSError(
        'AUTH_TOKEN_MISSING',
        'Session token is required. Call setSessionToken() first.',
        401, false
      )
    }

    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.sessionToken && requireAuth) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`
    }

    let lastError: WAIaaSError | null = null
    const maxAttempts = 1 + this.retry.maxRetries

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = this.calculateDelay(attempt)
        await this.sleep(delay)
      }

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.timeout)
        const signal = options?.signal ?? this.signal

        const res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: signal
            ? AbortSignal.any([signal, controller.signal])
            : controller.signal,
        })

        clearTimeout(timeoutId)

        if (res.ok) {
          return await res.json() as T
        }

        // 에러 응답 파싱
        const errorBody = await res.json().catch(() => ({})) as Record<string, unknown>
        const error = (errorBody.error ?? errorBody) as Record<string, unknown>
        const waiaasError = new WAIaaSError(
          (error.code as string) ?? 'UNKNOWN_ERROR',
          (error.message as string) ?? `HTTP ${res.status}`,
          res.status,
          this.retry.retryableStatuses.includes(res.status),
          (error.requestId as string) ?? res.headers.get('X-Request-ID') ?? undefined,
          error.details as Record<string, unknown> | undefined,
        )

        if (!waiaasError.retryable || attempt === maxAttempts - 1) {
          throw waiaasError
        }

        lastError = waiaasError
      } catch (err) {
        if (err instanceof WAIaaSError) {
          if (!err.retryable || attempt === maxAttempts - 1) throw err
          lastError = err
        } else {
          // Network error, timeout 등
          const networkError = new WAIaaSError(
            'NETWORK_ERROR',
            err instanceof Error ? err.message : 'Network request failed',
            0, true
          )
          if (attempt === maxAttempts - 1) throw networkError
          lastError = networkError
        }
      }
    }

    throw lastError ?? new WAIaaSError('UNKNOWN_ERROR', 'Request failed', 0, false)
  }

  private calculateDelay(attempt: number): number {
    switch (this.retry.backoff) {
      case 'exponential':
        return this.retry.baseDelay * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5)
      case 'linear':
        return this.retry.baseDelay * attempt
      case 'none':
        return 0
    }
  }

  private buildQueryString(params?: Record<string, unknown>): string {
    if (!params) return ''
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    if (entries.length === 0) return ''
    return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
```

### 3.4 WAIaaSOwnerClient (Owner API)

> **(v0.5 변경) Owner 메서드 인증 변경:** 대부분의 Owner 메서드 인증이 ownerAuth에서 masterAuth(implicit)로 변경됨. signMessage 콜백은 approve_tx(거래 승인)와 recover(Kill Switch 복구) 2가지 액션에만 필요. 나머지 Owner 관리 API(세션 목록, 에이전트 조회, 설정 변경 등)는 localhost 접속만으로 인증 완료(masterAuth implicit). 상세: 52-auth-model-redesign.md 참조.

```typescript
// packages/sdk/src/owner-client.ts
import type {
  SessionCreateResponse,
  SessionListResponse,
  SessionRevokeResponse,
  ApproveResponse,
  RejectResponse,
  PendingApprovalsResponse,
  AgentListResponse,
  AgentDetailResponse,
  OwnerStatusResponse,
  DashboardResponse,
  SettingsResponse,
  UpdateSettingsResponse,
  KillSwitchResponse,
  RecoverResponse,
  OwnerConnectResponse,
  OwnerDisconnectResponse,
  NonceResponse,
} from '@waiaas/core'
import type { WAIaaSOwnerClientOptions, OwnerSignatureCallback } from './types.js'
import { WAIaaSError } from './error.js'

/**
 * Owner API 클라이언트.
 * Agent SDK와 달리 Owner 서명(SIWS/SIWE)으로 인증한다.
 * signMessage 콜백을 통해 지갑 서명을 위임받는다.
 */
export class WAIaaSOwnerClient {
  private readonly baseUrl: string
  private readonly signMessage: OwnerSignatureCallback
  private readonly ownerAddress: string
  private readonly chain: 'solana' | 'ethereum'
  private readonly timeout: number

  constructor(options: WAIaaSOwnerClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:3100').replace(/\/$/, '')
    this.signMessage = options.signMessage
    this.ownerAddress = options.ownerAddress
    this.chain = options.chain
    this.timeout = options.timeout ?? 30_000
  }

  // ── Session Management ──

  /**
   * 에이전트 세션 생성.
   * Owner 서명 기반 -- signMessage 콜백으로 SIWS/SIWE 서명 요청.
   */
  async createSession(params: {
    agentId: string
    expiresIn?: number
    constraints?: {
      maxAmountPerTx?: string
      maxTotalAmount?: string
      maxTransactions?: number
      allowedOperations?: string[]
      allowedDestinations?: string[]
    }
  }): Promise<SessionCreateResponse> {
    // 1. nonce 조회
    const { nonce } = await this.getNonce()

    // 2. SIWS/SIWE 메시지 구성
    const message = this.buildSignInMessage(nonce)

    // 3. Owner 지갑으로 메시지 서명 (콜백)
    const signature = await this.signMessage(message)

    // 4. 세션 생성 요청 (ownerAuth 아닌 본문 서명 방식)
    return this.postPublic<SessionCreateResponse>('/v1/sessions', {
      agentId: params.agentId,
      chain: this.chain,
      ownerAddress: this.ownerAddress,
      message,
      signature,
      expiresIn: params.expiresIn,
      constraints: params.constraints,
    })
  }

  /** 세션 목록 조회 (Owner 관점) */
  async listSessions(params?: {
    agentId?: string
    active?: boolean
    limit?: number
    cursor?: string
  }): Promise<SessionListResponse> {
    return this.ownerGet<SessionListResponse>('/v1/owner/sessions', 'manage_sessions', params)
  }

  /** 세션 즉시 폐기 */
  async revokeSession(sessionId: string): Promise<SessionRevokeResponse> {
    return this.ownerDelete<SessionRevokeResponse>(`/v1/owner/sessions/${sessionId}`, 'manage_sessions')
  }

  // ── Transaction Approval ──

  /** 대기 중인 거래 승인 */
  async approveTransaction(txId: string): Promise<ApproveResponse> {
    return this.ownerPost<ApproveResponse>(`/v1/owner/approve/${txId}`, 'approve_tx')
  }

  /** 대기 중인 거래 거절 */
  async rejectTransaction(txId: string, reason?: string): Promise<RejectResponse> {
    return this.ownerPost<RejectResponse>(
      `/v1/owner/reject/${txId}`,
      'reject_tx',
      reason ? { reason } : undefined,
    )
  }

  /** 승인 대기 거래 목록 */
  async listPendingApprovals(params?: {
    agentId?: string
    limit?: number
    cursor?: string
  }): Promise<PendingApprovalsResponse> {
    return this.ownerGet<PendingApprovalsResponse>('/v1/owner/pending-approvals', 'manage_sessions', params)
  }

  // ── Agent Management ──

  /** 에이전트 목록 조회 */
  async listAgents(): Promise<AgentListResponse> {
    return this.ownerGet<AgentListResponse>('/v1/owner/agents', 'manage_sessions')
  }

  /** 에이전트 상세 조회 */
  async getAgent(agentId: string): Promise<AgentDetailResponse> {
    return this.ownerGet<AgentDetailResponse>(`/v1/owner/agents/${agentId}`, 'manage_sessions')
  }

  // ── System Status ──

  /** Owner 연결 상태 + 시스템 요약 */
  async getStatus(): Promise<OwnerStatusResponse> {
    return this.ownerGet<OwnerStatusResponse>('/v1/owner/status', 'view_dashboard')
  }

  /** 대시보드 요약 (잔액, 거래, 세션 통계) */
  async getDashboard(): Promise<DashboardResponse> {
    return this.ownerGet<DashboardResponse>('/v1/owner/dashboard', 'view_dashboard')
  }

  // ── Settings ──

  /** 시스템 설정 조회 */
  async getSettings(): Promise<SettingsResponse> {
    return this.ownerGet<SettingsResponse>('/v1/owner/settings', 'view_dashboard')
  }

  /** 시스템 설정 변경 */
  async updateSettings(settings: {
    notifications?: { enabled?: boolean; minChannels?: number }
    autoStop?: { enabled?: boolean }
    server?: { logLevel?: 'debug' | 'info' | 'warn' | 'error' }
  }): Promise<UpdateSettingsResponse> {
    return this.ownerPut<UpdateSettingsResponse>('/v1/owner/settings', 'update_settings', settings)
  }

  // ── Kill Switch ──

  /** Kill Switch 발동 */
  async activateKillSwitch(reason: string): Promise<KillSwitchResponse> {
    return this.ownerPost<KillSwitchResponse>('/v1/owner/kill-switch', 'kill_switch', { reason })
  }

  /** Kill Switch 복구 (이중 인증: Owner 서명 + 마스터 패스워드) */
  async recover(masterPassword: string): Promise<RecoverResponse> {
    return this.ownerPostWithMasterPassword<RecoverResponse>(
      '/v1/owner/recover',
      'recover',
      { masterPassword },
      masterPassword,
    )
  }

  // ── Owner Wallet Connection ──

  /** Owner 지갑 최초 연결 (localhost 보안, 인증 불필요) */
  async connect(params?: {
    wcSessionTopic?: string
  }): Promise<OwnerConnectResponse> {
    return this.postPublic<OwnerConnectResponse>('/v1/owner/connect', {
      address: this.ownerAddress,
      chain: this.chain,
      wcSessionTopic: params?.wcSessionTopic,
    })
  }

  /** Owner 지갑 연결 해제 */
  async disconnect(): Promise<OwnerDisconnectResponse> {
    return this.ownerDelete<OwnerDisconnectResponse>('/v1/owner/disconnect', 'update_settings')
  }

  // ── Internal ──

  private async getNonce(): Promise<NonceResponse> {
    const res = await fetch(`${this.baseUrl}/v1/nonce`, {
      signal: AbortSignal.timeout(this.timeout),
    })
    if (!res.ok) throw await this.parseError(res)
    return res.json() as Promise<NonceResponse>
  }

  /**
   * ownerAuth 인증 헤더 생성.
   * 1. nonce 조회
   * 2. ownerSignaturePayload 구성
   * 3. 메시지 서명 (signMessage 콜백)
   * 4. base64url 인코딩 -> Authorization: Bearer <payload>
   */
  private async buildOwnerAuthHeader(action: string): Promise<string> {
    const { nonce } = await this.getNonce()
    const timestamp = new Date().toISOString()
    const message = `WAIaaS Owner Action: ${action}\nNonce: ${nonce}\nTimestamp: ${timestamp}`

    const signature = await this.signMessage(message)

    const payload = {
      chain: this.chain,
      address: this.ownerAddress,
      action,
      nonce,
      timestamp,
      message,
      signature,
    }

    // base64url encode
    const encoded = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    return `Bearer ${encoded}`
  }

  private async ownerGet<T>(
    path: string,
    action: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const auth = await this.buildOwnerAuthHeader(action)
    const queryString = this.buildQueryString(params)
    const res = await fetch(`${this.baseUrl}${path}${queryString}`, {
      headers: { 'Authorization': auth },
      signal: AbortSignal.timeout(this.timeout),
    })
    if (!res.ok) throw await this.parseError(res)
    return res.json() as Promise<T>
  }

  private async ownerPost<T>(
    path: string,
    action: string,
    body?: unknown,
  ): Promise<T> {
    const auth = await this.buildOwnerAuthHeader(action)
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeout),
    })
    if (!res.ok) throw await this.parseError(res)
    return res.json() as Promise<T>
  }

  private async ownerPut<T>(
    path: string,
    action: string,
    body: unknown,
  ): Promise<T> {
    const auth = await this.buildOwnerAuthHeader(action)
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    })
    if (!res.ok) throw await this.parseError(res)
    return res.json() as Promise<T>
  }

  private async ownerDelete<T>(
    path: string,
    action: string,
  ): Promise<T> {
    const auth = await this.buildOwnerAuthHeader(action)
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: { 'Authorization': auth },
      signal: AbortSignal.timeout(this.timeout),
    })
    if (!res.ok) throw await this.parseError(res)
    return res.json() as Promise<T>
  }

  private async ownerPostWithMasterPassword<T>(
    path: string,
    action: string,
    body: unknown,
    masterPassword: string,
  ): Promise<T> {
    const auth = await this.buildOwnerAuthHeader(action)
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
        'X-Master-Password': masterPassword,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    })
    if (!res.ok) throw await this.parseError(res)
    return res.json() as Promise<T>
  }

  private async postPublic<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    })
    if (!res.ok) throw await this.parseError(res)
    return res.json() as Promise<T>
  }

  private buildSignInMessage(nonce: string): string {
    const domain = new URL(this.baseUrl).host
    const uri = this.baseUrl
    const issuedAt = new Date().toISOString()
    const expirationTime = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const chainLabel = this.chain === 'solana' ? 'Solana' : 'Ethereum'

    return [
      `${domain} wants you to sign in with your ${chainLabel} account:`,
      this.ownerAddress,
      '',
      'Sign in to WAIaaS to create an agent session.',
      '',
      `URI: ${uri}`,
      'Version: 1',
      'Chain ID: 1',
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
      `Expiration Time: ${expirationTime}`,
    ].join('\n')
  }

  private async parseError(res: Response): Promise<WAIaaSError> {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    const error = (body.error ?? body) as Record<string, unknown>
    return new WAIaaSError(
      (error.code as string) ?? 'UNKNOWN_ERROR',
      (error.message as string) ?? `HTTP ${res.status}`,
      res.status,
      [429, 502, 503, 504].includes(res.status),
      (error.requestId as string) ?? res.headers.get('X-Request-ID') ?? undefined,
      error.details as Record<string, unknown> | undefined,
    )
  }

  private buildQueryString(params?: Record<string, unknown>): string {
    if (!params) return ''
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    if (entries.length === 0) return ''
    return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
  }
}
```

### 3.5 WAIaaSOwnerClientOptions

```typescript
// packages/sdk/src/types.ts (추가)

/**
 * Owner 서명 콜백.
 * 지갑 라이브러리(Phantom, MetaMask)가 메시지 서명 수행.
 * @param message 서명할 메시지 (EIP-4361 포맷 또는 action 메시지)
 * @returns 서명 문자열 (Solana: base58, EVM: hex)
 */
export type OwnerSignatureCallback = (message: string) => Promise<string>

/**
 * Owner SDK 클라이언트 옵션.
 */
export interface WAIaaSOwnerClientOptions {
  /** 데몬 베이스 URL. 기본: 'http://127.0.0.1:3100' */
  baseUrl?: string

  /** Owner 서명 콜백. 지갑 연결 라이브러리에서 제공. */
  signMessage: OwnerSignatureCallback

  /** Owner 지갑 주소 (Solana: base58, EVM: 0x hex) */
  ownerAddress: string

  /** Owner 지갑 체인 */
  chain: 'solana' | 'ethereum'

  /** 요청 타임아웃 (밀리초). 기본: 30000 */
  timeout?: number
}
```

### 3.6 WAIaaSError

```typescript
// packages/sdk/src/error.ts

/**
 * WAIaaS SDK 에러.
 * API-SPEC 에러 코드 체계 (7도메인 36개)와 1:1 매핑.
 */
export class WAIaaSError extends Error {
  /** WAIaaS 에러 코드 (예: 'INVALID_TOKEN', 'INSUFFICIENT_BALANCE') */
  readonly code: string

  /** HTTP 상태 코드. 0이면 네트워크/타임아웃 에러 */
  readonly statusCode: number

  /** 재시도 가능 여부 (429, 502, 503, 504이면 true) */
  readonly retryable: boolean

  /** 서버 요청 ID (디버깅용) */
  readonly requestId?: string

  /** 추가 에러 상세 정보 */
  readonly details?: Record<string, unknown>

  constructor(
    code: string,
    message: string,
    statusCode: number,
    retryable: boolean,
    requestId?: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'WAIaaSError'
    this.code = code
    this.statusCode = statusCode
    this.retryable = retryable
    this.requestId = requestId
    this.details = details
  }

  /** JSON 직렬화 */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      requestId: this.requestId,
      details: this.details,
    }
  }
}
```

### 3.7 TypeScript SDK 사용 예시

#### 3.7.1 Agent 사용 예시

```typescript
import { WAIaaSClient } from '@waiaas/sdk'

// 1. 클라이언트 초기화
const client = new WAIaaSClient({
  baseUrl: 'http://127.0.0.1:3100',
  sessionToken: 'wai_sess_eyJhbGciOiJIUzI1NiIs...',
  retry: { maxRetries: 3, backoff: 'exponential' },
  timeout: 30_000,
})

// 2. 잔액 조회
const balance = await client.getBalance()
console.log(`Balance: ${balance.formatted}`)  // "1.5 SOL"

// 3. 주소 조회
const { address, chain, encoding } = await client.getAddress()
console.log(`Address: ${address} (${chain}, ${encoding})`)

// 4. 토큰 전송
try {
  const tx = await client.sendToken({
    to: 'So11111111111111111111111111111112',
    amount: '1000000000',  // 1 SOL
    memo: 'Payment for services',
    priority: 'medium',
  })

  if (tx.status === 'CONFIRMED') {
    console.log(`Confirmed: ${tx.txHash}`)
  } else if (tx.status === 'QUEUED') {
    console.log(`Queued (${tx.tier}): ${tx.transactionId}`)
  }
} catch (err) {
  if (err instanceof WAIaaSError) {
    console.error(`[${err.code}] ${err.message} (retryable: ${err.retryable})`)
    // [INSUFFICIENT_BALANCE] 잔액 부족 (retryable: false)
  }
}

// 5. 거래 이력 조회
const history = await client.listTransactions({
  status: 'CONFIRMED',
  limit: 10,
  order: 'desc',
})
for (const tx of history.transactions) {
  console.log(`${tx.id} | ${tx.status} | ${tx.amount}`)
}
```

#### 3.7.2 Owner 사용 예시

```typescript
import { WAIaaSOwnerClient } from '@waiaas/sdk'
import nacl from 'tweetnacl'
import bs58 from 'bs58'

// Solana Owner 지갑 서명 콜백
const ownerKeypair = nacl.sign.keyPair()  // 실제로는 Phantom 등에서 서명
const signMessage = async (message: string): Promise<string> => {
  const messageBytes = new TextEncoder().encode(message)
  const signature = nacl.sign.detached(messageBytes, ownerKeypair.secretKey)
  return bs58.encode(signature)
}

// 1. Owner 클라이언트 초기화
const owner = new WAIaaSOwnerClient({
  signMessage,
  ownerAddress: bs58.encode(ownerKeypair.publicKey),
  chain: 'solana',
})

// 2. Owner 지갑 연결
await owner.connect()

// 3. 에이전트 세션 생성
const session = await owner.createSession({
  agentId: '01950288-1a2b-3c4d-5e6f-abcdef012345',
  expiresIn: 86400,  // 24시간
  constraints: {
    maxAmountPerTx: '10000000000',   // 10 SOL
    maxTotalAmount: '100000000000',   // 100 SOL
    maxTransactions: 100,
    allowedOperations: ['TRANSFER'],
  },
})
console.log(`Session token: ${session.token}`)

// 4. 승인 대기 거래 처리
const pending = await owner.listPendingApprovals()
for (const tx of pending.transactions) {
  if (tx.tier === 'APPROVAL') {
    await owner.approveTransaction(tx.txId)
    console.log(`Approved: ${tx.txId}`)
  }
}

// 5. 대시보드 조회
const dashboard = await owner.getDashboard()
console.log(`Active sessions: ${dashboard.activeSessions}`)

// 6. Kill Switch 발동 (비상 상황)
await owner.activateKillSwitch('비정상 거래 패턴 감지')
```

---

## 4. Python SDK (`waiaas`) -- SDK-02

### 4.1 패키지 구조

```
packages/sdk-python/
├── pyproject.toml        # waiaas
├── waiaas/
│   ├── __init__.py       # Public exports
│   ├── client.py         # WAIaaSClient (Agent API)
│   ├── owner_client.py   # WAIaaSOwnerClient (Owner API)
│   ├── models.py         # Pydantic v2 모델
│   ├── error.py          # WAIaaSError
│   ├── retry.py          # RetryPolicy
│   └── _internal/
│       ├── http.py       # httpx wrapper
│       └── constants.py  # 기본값
├── tests/
│   ├── test_client.py
│   ├── test_owner_client.py
│   └── test_models.py
└── README.md
```

**pyproject.toml 핵심:**

```toml
[project]
name = "waiaas"
version = "0.2.0"
description = "WAIaaS Python SDK -- AI Agent Wallet-as-a-Service"
requires-python = ">=3.10"
dependencies = [
    "httpx>=0.27.0",
    "pydantic>=2.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.24.0",
    "respx>=0.22.0",  # httpx mocking
]
```

### 4.2 Pydantic v2 모델

```python
# waiaas/models.py
from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


# [v0.7 보완] 공통 베이스 모델 (snake_case SSoT)
class WAIaaSBaseModel(BaseModel):
    """WAIaaS Python SDK 공통 베이스 모델.

    모든 모델은 이 클래스를 상속하여 일관된 snake_case <-> camelCase 변환을 보장한다.
    - alias_generator=to_camel: snake_case 필드명 -> camelCase alias 자동 생성
    - populate_by_name=True: snake_case와 camelCase 양방향 입력 허용
    - 직렬화: model_dump(by_alias=True)로 camelCase JSON 출력
    - 기존 Field(alias=) 수동 방식을 완전 대체 (v0.7 전환)
    """
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class TransactionStatus(str, Enum):
    PENDING = "PENDING"
    QUEUED = "QUEUED"
    EXECUTING = "EXECUTING"
    SUBMITTED = "SUBMITTED"
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class Tier(str, Enum):
    INSTANT = "INSTANT"
    NOTIFY = "NOTIFY"
    DELAY = "DELAY"
    APPROVAL = "APPROVAL"


# [v0.7 보완] v0.6 확장: TransactionType enum
class TransactionType(str, Enum):
    TRANSFER = "TRANSFER"
    TOKEN_TRANSFER = "TOKEN_TRANSFER"
    CONTRACT_CALL = "CONTRACT_CALL"
    APPROVE = "APPROVE"
    BATCH = "BATCH"


class Chain(str, Enum):
    SOLANA = "solana"
    ETHEREUM = "ethereum"


# [v0.7 보완] BaseModel -> WAIaaSBaseModel 전환 (alias_generator=to_camel 자동 적용)
# 기존 Field(alias="camelCase") 수동 지정이 제거됨. 모든 alias는 to_camel에서 자동 생성.

class BalanceResponse(WAIaaSBaseModel):
    balance: str = Field(description="잔액 (최소 단위: lamports/wei)")
    decimals: int = Field(description="소수점 자릿수")
    symbol: str = Field(description="토큰 심볼")
    formatted: str = Field(description="사람이 읽기 좋은 포맷")
    chain: str
    network: str


class AddressResponse(WAIaaSBaseModel):
    address: str = Field(description="지갑 공개키")
    chain: str
    network: str
    encoding: str = Field(description="base58 | hex")


class TransferRequest(WAIaaSBaseModel):
    to: str = Field(min_length=1, description="수신자 주소")
    amount: str = Field(min_length=1, description="전송 금액 (최소 단위)")
    type: str = Field(default="TRANSFER")
    token_mint: Optional[str] = Field(default=None)  # alias: "tokenMint" (자동)
    memo: Optional[str] = Field(default=None, max_length=200)
    priority: str = Field(default="medium")


class TransactionResponse(WAIaaSBaseModel):
    transaction_id: str        # alias: "transactionId" (자동)
    status: TransactionStatus
    tier: Optional[Tier] = None
    tx_hash: Optional[str] = None  # alias: "txHash" (자동)
    estimated_fee: Optional[str] = None  # alias: "estimatedFee" (자동)
    created_at: datetime       # alias: "createdAt" (자동)


class TransactionSummary(WAIaaSBaseModel):
    id: str
    type: str
    status: TransactionStatus
    tier: Optional[Tier] = None
    amount: Optional[str] = None
    to_address: Optional[str] = None  # alias: "toAddress" (자동)
    tx_hash: Optional[str] = None  # alias: "txHash" (자동)
    created_at: datetime       # alias: "createdAt" (자동)
    executed_at: Optional[datetime] = None  # alias: "executedAt" (자동)
    error: Optional[str] = None


class TransactionListResponse(WAIaaSBaseModel):
    transactions: list[TransactionSummary]
    next_cursor: Optional[str] = None  # alias: "nextCursor" (자동)


class PendingTransactionSummary(WAIaaSBaseModel):
    id: str
    type: str
    amount: Optional[str] = None
    to_address: Optional[str] = None  # alias: "toAddress" (자동)
    tier: Tier
    queued_at: datetime        # alias: "queuedAt" (자동)
    expires_at: Optional[datetime] = None  # alias: "expiresAt" (자동)
    status: str = "QUEUED"


class PendingTransactionListResponse(WAIaaSBaseModel):
    transactions: list[PendingTransactionSummary]


class NonceResponse(WAIaaSBaseModel):
    nonce: str
    expires_at: datetime       # alias: "expiresAt" (자동)


class SessionCreateResponse(WAIaaSBaseModel):
    session_id: str            # alias: "sessionId" (자동)
    token: str
    expires_at: datetime       # alias: "expiresAt" (자동)
    constraints: dict


class SessionConstraints(WAIaaSBaseModel):
    max_amount_per_tx: Optional[str] = None      # alias: "maxAmountPerTx" (자동)
    max_total_amount: Optional[str] = None        # alias: "maxTotalAmount" (자동)
    max_transactions: Optional[int] = None        # alias: "maxTransactions" (자동)
    allowed_operations: Optional[list[str]] = None  # alias: "allowedOperations" (자동)
    allowed_destinations: Optional[list[str]] = None  # alias: "allowedDestinations" (자동)
    expires_in: Optional[int] = None              # alias: "expiresIn" (자동)


# [v0.7 보완] v0.6 확장 타입: 토큰 관련 보조 모델
class TokenIdentifier(WAIaaSBaseModel):
    """SPL/ERC-20 토큰 식별자"""
    mint: str                  # SPL mint address 또는 ERC-20 contract address
    decimals: Optional[int] = None


class AccountMeta(WAIaaSBaseModel):
    """Solana 계정 메타 (CONTRACT_CALL 트랜잭션용)"""
    pubkey: str
    is_signer: bool = False    # alias: "isSigner" (자동)
    is_writable: bool = False  # alias: "isWritable" (자동)


# [v0.7 보완] v0.6 확장: TOKEN_TRANSFER 요청
class TokenTransferRequest(WAIaaSBaseModel):
    type: Literal['TOKEN_TRANSFER'] = 'TOKEN_TRANSFER'
    to: str = Field(min_length=1, description="수신자 주소")
    amount: str = Field(min_length=1, description="전송 금액 (최소 단위)")
    token: TokenIdentifier
    memo: Optional[str] = Field(default=None, max_length=200)
    priority: str = Field(default="medium")


# [v0.7 보완] v0.6 확장: CONTRACT_CALL 요청
class ContractCallRequest(WAIaaSBaseModel):
    type: Literal['CONTRACT_CALL'] = 'CONTRACT_CALL'
    contract_address: str      # alias: "contractAddress" (자동)
    # EVM 전용
    calldata: Optional[str] = None
    value: Optional[str] = None
    method_signature: Optional[str] = None  # alias: "methodSignature" (자동)
    # Solana 전용
    program_id: Optional[str] = None  # alias: "programId" (자동)
    instruction_data: Optional[str] = None  # alias: "instructionData" (자동)
    accounts: Optional[list[AccountMeta]] = None


# [v0.7 보완] v0.6 확장: APPROVE 요청
class ApproveRequest(WAIaaSBaseModel):
    type: Literal['APPROVE'] = 'APPROVE'
    token: TokenIdentifier
    spender_address: str       # alias: "spenderAddress" (자동)
    approved_amount: str       # alias: "approvedAmount" (자동)


# [v0.7 보완] v0.6 확장: BATCH 요청 (Solana 전용)
class BatchRequest(WAIaaSBaseModel):
    type: Literal['BATCH'] = 'BATCH'
    instructions: list[TransferRequest | TokenTransferRequest | ContractCallRequest | ApproveRequest]


# 직렬화 예시:
# response.model_dump(by_alias=True) -> {"transactionId": "...", "txHash": "...", ...}
# TransactionResponse(transaction_id="abc", status="CONFIRMED") -> OK (populate_by_name)
# TransactionResponse(**{"transactionId": "abc", "status": "CONFIRMED"}) -> OK (alias)
```

#### 4.2.1 snake_case -> camelCase 변환 대조표 [v0.7 보완]

`to_camel` 함수(pydantic.alias_generators)의 변환 결과와 REST API의 실제 camelCase 필드명을 대조한다. 불일치 시 해당 필드만 `Field(alias="...")` 수동 지정이 필요하나, 현재 모든 필드가 일치한다.

| # | Python 필드 (snake_case) | to_camel 결과 | API 필드 (camelCase) | 일치 |
|---|-------------------------|--------------|---------------------|------|
| 1 | `transaction_id` | `transactionId` | `transactionId` | O |
| 2 | `tx_hash` | `txHash` | `txHash` | O |
| 3 | `estimated_fee` | `estimatedFee` | `estimatedFee` | O |
| 4 | `created_at` | `createdAt` | `createdAt` | O |
| 5 | `executed_at` | `executedAt` | `executedAt` | O |
| 6 | `to_address` | `toAddress` | `toAddress` | O |
| 7 | `next_cursor` | `nextCursor` | `nextCursor` | O |
| 8 | `queued_at` | `queuedAt` | `queuedAt` | O |
| 9 | `expires_at` | `expiresAt` | `expiresAt` | O |
| 10 | `session_id` | `sessionId` | `sessionId` | O |
| 11 | `max_amount_per_tx` | `maxAmountPerTx` | `maxAmountPerTx` | O |
| 12 | `max_total_amount` | `maxTotalAmount` | `maxTotalAmount` | O |
| 13 | `max_transactions` | `maxTransactions` | `maxTransactions` | O |
| 14 | `allowed_operations` | `allowedOperations` | `allowedOperations` | O |
| 15 | `allowed_destinations` | `allowedDestinations` | `allowedDestinations` | O |
| 16 | `expires_in` | `expiresIn` | `expiresIn` | O |
| 17 | `token_mint` | `tokenMint` | `tokenMint` | O |
| 18 | `usd_value` | `usdValue` | `usdValue` | O |
| 19 | `contract_address` | `contractAddress` | `contractAddress` | O |
| 20 | `method_signature` | `methodSignature` | `methodSignature` | O |
| 21 | `spender_address` | `spenderAddress` | `spenderAddress` | O |
| 22 | `approved_amount` | `approvedAmount` | `approvedAmount` | O |
| 23 | `instruction_data` | `instructionData` | `instructionData` | O |
| 24 | `is_signer` | `isSigner` | `isSigner` | O |
| 25 | `is_writable` | `isWritable` | `isWritable` | O |
| 26 | `program_id` | `programId` | `programId` | O |
| 27 | `max_daily_amount` | `maxDailyAmount` | `maxDailyAmount` | O |
| 28 | `allowed_addresses` | `allowedAddresses` | `allowedAddresses` | O |
| 29 | `session_token` | `sessionToken` | `sessionToken` | O |

**결론:** v0.2 기존 17개 필드 + v0.6 확장 12개 필드, 총 29개 필드 전부 `to_camel` 변환 결과와 API 필드명이 일치한다. `Field(alias="...")` 수동 지정이 필요한 필드는 없다.

#### 4.2.2 Python SDK 검증: Pydantic field_validator 수동 매핑 [v0.7 보완]

Python SDK는 Zod 스키마를 자동 변환하지 않는다. OpenAPI 스키마의 `format`/`pattern` 제약조건을 참조하여 Pydantic `field_validator`로 수동 매핑한다. 이는 Zod -> Pydantic 자동 생성 도구를 사용하지 않는 설계 결정이다.

```python
from pydantic import field_validator

class TransferRequest(WAIaaSBaseModel):
    type: Literal['TRANSFER'] = 'TRANSFER'
    to: str
    amount: str
    memo: str | None = None
    priority: Literal['low', 'medium', 'high'] = 'medium'

    @field_validator('to')
    @classmethod
    def validate_to(cls, v: str) -> str:
        if not v:
            raise ValueError('to address must not be empty')
        return v

    @field_validator('amount')
    @classmethod
    def validate_amount(cls, v: str) -> str:
        if not v:
            raise ValueError('amount must not be empty')
        # 양수 검증 (lamports/wei 문자열)
        try:
            if int(v) <= 0:
                raise ValueError('amount must be positive')
        except (ValueError, TypeError):
            raise ValueError('amount must be a numeric string')
        return v

    @field_validator('memo')
    @classmethod
    def validate_memo(cls, v: str | None) -> str | None:
        if v is not None and len(v) > 200:
            raise ValueError('memo must be 200 characters or less')
        return v
```

**원칙:**
- Zod 스키마의 `.min()`, `.max()`, `.regex()` 등을 `field_validator`로 대응
- OpenAPI 3.0 spec의 `format`/`pattern` 참조 (37-rest-api-complete-spec.md)
- **자동 생성이 아닌 수동 매핑** (Zod -> Pydantic 자동 변환 도구 미사용)
- 변환 정확성은 테스트(51-platform-test-scenarios.md)에서 검증
- 필드명 변환(snake_case <-> camelCase)은 `WAIaaSBaseModel`의 `alias_generator=to_camel`이 담당하고, 값 검증은 `field_validator`가 담당하는 관심사 분리

**Zod -> Pydantic 매핑 규칙:**

| Zod 검증 | Pydantic 대응 | 예시 |
|---------|-------------|------|
| `z.string().min(1)` | `field_validator` + `if not v` | 필수 문자열 필드 |
| `z.string().max(200)` | `field_validator` + `len(v) > 200` | memo 길이 제한 |
| `z.string().regex(...)` | `field_validator` + `re.match(...)` | 주소 형식 검증 |
| `z.number().positive()` | `field_validator` + `int(v) > 0` | 금액 양수 검증 |
| `z.enum([...])` | `Literal['a', 'b', 'c']` | priority, type |
| `z.union([...])` | `Union[A, B, C]` | 복합 타입 |

### 4.3 WAIaaSClient (Python)

```python
# waiaas/client.py
from __future__ import annotations
import httpx
from typing import Optional, Any
from .models import (
    BalanceResponse,
    AddressResponse,
    TransactionResponse,
    TransactionListResponse,
    PendingTransactionListResponse,
    NonceResponse,
    TransferRequest,
)
from .error import WAIaaSError


class WAIaaSClient:
    """
    WAIaaS Agent SDK for Python.
    async/await 기반, httpx.AsyncClient 사용.
    """

    def __init__(
        self,
        *,
        base_url: str = "http://127.0.0.1:3100",
        session_token: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._session_token = session_token
        self._timeout = timeout
        self._max_retries = max_retries
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> WAIaaSClient:
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
            transport=httpx.AsyncHTTPTransport(retries=self._max_retries),
        )
        return self

    async def __aexit__(self, *args: Any) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    def set_session_token(self, token: str) -> None:
        """세션 토큰 설정 (wai_sess_...)"""
        if not token.startswith("wai_sess_"):
            raise WAIaaSError(
                code="INVALID_TOKEN_FORMAT",
                message='Session token must start with "wai_sess_"',
                status_code=0,
                retryable=False,
            )
        self._session_token = token

    def clear_session_token(self) -> None:
        """세션 토큰 제거"""
        self._session_token = None

    # ── Wallet API ──

    async def get_balance(self) -> BalanceResponse:
        """잔액 조회"""
        data = await self._get("/v1/wallet/balance")
        return BalanceResponse.model_validate(data)

    async def get_address(self) -> AddressResponse:
        """주소 조회"""
        data = await self._get("/v1/wallet/address")
        return AddressResponse.model_validate(data)

    # ── Transaction API ──

    async def send_token(self, request: TransferRequest) -> TransactionResponse:
        """토큰 전송"""
        data = await self._post(
            "/v1/transactions/send",
            json=request.model_dump(by_alias=True, exclude_none=True),
        )
        return TransactionResponse.model_validate(data)

    async def list_transactions(
        self,
        *,
        status: Optional[str] = None,
        limit: int = 20,
        cursor: Optional[str] = None,
        order: str = "desc",
    ) -> TransactionListResponse:
        """거래 이력 조회"""
        params: dict[str, Any] = {"limit": limit, "order": order}
        if status:
            params["status"] = status
        if cursor:
            params["cursor"] = cursor
        data = await self._get("/v1/transactions", params=params)
        return TransactionListResponse.model_validate(data)

    async def get_transaction(self, tx_id: str) -> TransactionResponse:
        """단일 거래 조회"""
        data = await self._get(f"/v1/transactions/{tx_id}")
        return TransactionResponse.model_validate(data)

    async def list_pending_transactions(self) -> PendingTransactionListResponse:
        """대기 중인 거래 목록"""
        data = await self._get("/v1/transactions/pending")
        return PendingTransactionListResponse.model_validate(data)

    # ── Wallet API (v0.6 추가) ──

    async def get_assets(self) -> dict[str, Any]:
        """(v0.6) 보유 자산 목록 (네이티브 + SPL/ERC-20)"""
        return await self._get("/v1/wallet/assets")

    # ── Transaction API (v0.6 확장: 타입별 단축 메서드) ──

    async def send_token_transfer(
        self, *, to: str, amount: str, token_mint: str, decimals: Optional[int] = None,
        memo: Optional[str] = None, priority: str = "medium",
    ) -> TransactionResponse:
        """(v0.6) SPL/ERC-20 토큰 전송 단축 메서드"""
        body: dict[str, Any] = {
            "type": "TOKEN_TRANSFER", "to": to, "amount": amount,
            "token": {"mint": token_mint},
            "priority": priority,
        }
        if decimals is not None:
            body["token"]["decimals"] = decimals
        if memo:
            body["memo"] = memo
        data = await self._post("/v1/transactions/send", json=body)
        return TransactionResponse.model_validate(data)

    async def contract_call(
        self, *, contract_address: str, **kwargs: Any,
    ) -> TransactionResponse:
        """(v0.6) 컨트랙트 호출 단축 메서드"""
        body: dict[str, Any] = {"type": "CONTRACT_CALL", "contractAddress": contract_address, **kwargs}
        data = await self._post("/v1/transactions/send", json=body)
        return TransactionResponse.model_validate(data)

    async def approve_token(
        self, *, token_mint: str, spender: str, amount: str, **kwargs: Any,
    ) -> TransactionResponse:
        """(v0.6) 토큰 승인 단축 메서드"""
        body: dict[str, Any] = {
            "type": "APPROVE", "token": {"mint": token_mint},
            "spender": spender, "amount": amount, **kwargs,
        }
        data = await self._post("/v1/transactions/send", json=body)
        return TransactionResponse.model_validate(data)

    async def batch_transaction(
        self, *, instructions: list[dict[str, Any]], **kwargs: Any,
    ) -> TransactionResponse:
        """(v0.6) Solana 배치 트랜잭션 단축 메서드"""
        body: dict[str, Any] = {"type": "BATCH", "instructions": instructions, **kwargs}
        data = await self._post("/v1/transactions/send", json=body)
        return TransactionResponse.model_validate(data)

    # ── Action API (v0.6 추가) ──

    async def list_actions(self) -> dict[str, Any]:
        """(v0.6) Action Provider 및 Action 목록"""
        return await self._get("/v1/actions")

    async def get_action(self, provider: str, action: str) -> dict[str, Any]:
        """(v0.6) Action 상세 (inputSchema 포함)"""
        return await self._get(f"/v1/actions/{provider}/{action}")

    async def resolve_action(
        self, provider: str, action: str, params: dict[str, Any],
    ) -> dict[str, Any]:
        """(v0.6) Action resolve만 실행"""
        return await self._post(f"/v1/actions/{provider}/{action}/resolve", json={"params": params})

    async def execute_action(
        self, provider: str, action: str, params: dict[str, Any],
    ) -> TransactionResponse:
        """(v0.6) Action resolve + 파이프라인 실행"""
        data = await self._post(f"/v1/actions/{provider}/{action}/execute", json={"params": params})
        return TransactionResponse.model_validate(data)

    # ── Public API ──

    async def get_nonce(self) -> NonceResponse:
        """nonce 조회 (인증 불필요)"""
        data = await self._get("/v1/nonce", require_auth=False)
        return NonceResponse.model_validate(data)

    # ── Internal ──

    @property
    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError(
                "Client not initialized. Use 'async with WAIaaSClient() as client:'"
            )
        return self._client

    def _auth_headers(self) -> dict[str, str]:
        if not self._session_token:
            raise WAIaaSError(
                code="AUTH_TOKEN_MISSING",
                message="Session token required. Call set_session_token() first.",
                status_code=401,
                retryable=False,
            )
        return {"Authorization": f"Bearer {self._session_token}"}

    async def _get(
        self,
        path: str,
        *,
        params: Optional[dict[str, Any]] = None,
        require_auth: bool = True,
    ) -> dict[str, Any]:
        headers = self._auth_headers() if require_auth else {}
        response = await self._http.get(path, params=params, headers=headers)
        return self._handle_response(response)

    async def _post(
        self,
        path: str,
        *,
        json: Optional[dict[str, Any]] = None,
        require_auth: bool = True,
    ) -> dict[str, Any]:
        headers = self._auth_headers() if require_auth else {}
        response = await self._http.post(path, json=json, headers=headers)
        return self._handle_response(response)

    def _handle_response(self, response: httpx.Response) -> dict[str, Any]:
        if response.is_success:
            return response.json()  # type: ignore[no-any-return]

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
        )
```

### 4.4 WAIaaSOwnerClient (Python)

```python
# waiaas/owner_client.py
from __future__ import annotations
import base64
import json
from datetime import datetime, timezone
from typing import Optional, Any, Callable, Awaitable
import httpx
from .models import (
    SessionCreateResponse,
    NonceResponse,
    SessionConstraints,
)
from .error import WAIaaSError

# Owner 서명 콜백 타입
SignMessageCallback = Callable[[str], Awaitable[str]]


class WAIaaSOwnerClient:
    """
    WAIaaS Owner SDK for Python.
    Owner 서명(SIWS/SIWE) 기반 인증.
    """

    def __init__(
        self,
        *,
        sign_message: SignMessageCallback,
        owner_address: str,
        chain: str,  # "solana" | "ethereum"
        base_url: str = "http://127.0.0.1:3100",
        timeout: float = 30.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._sign_message = sign_message
        self._owner_address = owner_address
        self._chain = chain
        self._timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> WAIaaSOwnerClient:
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
        )
        return self

    async def __aexit__(self, *args: Any) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    # ── Session Management ──

    async def create_session(
        self,
        *,
        agent_id: str,
        expires_in: int = 86400,
        constraints: Optional[SessionConstraints] = None,
    ) -> SessionCreateResponse:
        """에이전트 세션 생성 (Owner SIWS/SIWE 서명)"""
        nonce_resp = await self._get_nonce()
        message = self._build_sign_in_message(nonce_resp.nonce)
        signature = await self._sign_message(message)

        body: dict[str, Any] = {
            "agentId": agent_id,
            "chain": self._chain,
            "ownerAddress": self._owner_address,
            "message": message,
            "signature": signature,
            "expiresIn": expires_in,
        }
        if constraints:
            body["constraints"] = constraints.model_dump(by_alias=True, exclude_none=True)

        data = await self._post_public("/v1/sessions", json=body)
        return SessionCreateResponse.model_validate(data)

    async def list_sessions(
        self,
        *,
        agent_id: Optional[str] = None,
        active: Optional[bool] = None,
        limit: int = 20,
        cursor: Optional[str] = None,
    ) -> dict[str, Any]:
        """세션 목록 조회"""
        params: dict[str, Any] = {"limit": limit}
        if agent_id:
            params["agentId"] = agent_id
        if active is not None:
            params["active"] = str(active).lower()
        if cursor:
            params["cursor"] = cursor
        return await self._owner_get("/v1/owner/sessions", "manage_sessions", params=params)

    async def revoke_session(self, session_id: str) -> dict[str, Any]:
        """세션 폐기"""
        return await self._owner_delete(f"/v1/owner/sessions/{session_id}", "manage_sessions")

    # ── Transaction Approval ──

    async def approve_transaction(self, tx_id: str) -> dict[str, Any]:
        """거래 승인"""
        return await self._owner_post(f"/v1/owner/approve/{tx_id}", "approve_tx")

    async def reject_transaction(self, tx_id: str, *, reason: Optional[str] = None) -> dict[str, Any]:
        """거래 거절"""
        body = {"reason": reason} if reason else None
        return await self._owner_post(f"/v1/owner/reject/{tx_id}", "reject_tx", json=body)

    async def list_pending_approvals(self, **kwargs: Any) -> dict[str, Any]:
        """승인 대기 목록"""
        return await self._owner_get("/v1/owner/pending-approvals", "manage_sessions", params=kwargs)

    # ── Agent Management ──

    async def list_agents(self) -> dict[str, Any]:
        """에이전트 목록"""
        return await self._owner_get("/v1/owner/agents", "manage_sessions")

    async def get_agent(self, agent_id: str) -> dict[str, Any]:
        """에이전트 상세"""
        return await self._owner_get(f"/v1/owner/agents/{agent_id}", "manage_sessions")

    # ── System ──

    async def get_status(self) -> dict[str, Any]:
        """Owner 상태 + 시스템 요약"""
        return await self._owner_get("/v1/owner/status", "view_dashboard")

    async def get_dashboard(self) -> dict[str, Any]:
        """대시보드"""
        return await self._owner_get("/v1/owner/dashboard", "view_dashboard")

    async def get_settings(self) -> dict[str, Any]:
        """설정 조회"""
        return await self._owner_get("/v1/owner/settings", "view_dashboard")

    async def update_settings(self, settings: dict[str, Any]) -> dict[str, Any]:
        """설정 변경"""
        return await self._owner_put("/v1/owner/settings", "update_settings", json=settings)

    async def activate_kill_switch(self, reason: str) -> dict[str, Any]:
        """Kill Switch 발동"""
        return await self._owner_post("/v1/owner/kill-switch", "kill_switch", json={"reason": reason})

    async def recover(self, master_password: str) -> dict[str, Any]:
        """Kill Switch 복구 (이중 인증)"""
        auth = await self._build_owner_auth("recover")
        response = await self._http.post(
            "/v1/owner/recover",
            json={"masterPassword": master_password},
            headers={
                "Authorization": auth,
                "X-Master-Password": master_password,
            },
        )
        return self._handle_response(response)

    async def connect(self, *, wc_session_topic: Optional[str] = None) -> dict[str, Any]:
        """Owner 지갑 연결"""
        body: dict[str, Any] = {
            "address": self._owner_address,
            "chain": self._chain,
        }
        if wc_session_topic:
            body["wcSessionTopic"] = wc_session_topic
        return await self._post_public("/v1/owner/connect", json=body)

    async def disconnect(self) -> dict[str, Any]:
        """Owner 지갑 해제"""
        return await self._owner_delete("/v1/owner/disconnect", "update_settings")

    # ── Internal ──

    @property
    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("Client not initialized. Use 'async with WAIaaSOwnerClient() as client:'")
        return self._client

    async def _get_nonce(self) -> NonceResponse:
        response = await self._http.get("/v1/nonce")
        data = self._handle_response(response)
        return NonceResponse.model_validate(data)

    async def _build_owner_auth(self, action: str) -> str:
        nonce_resp = await self._get_nonce()
        timestamp = datetime.now(timezone.utc).isoformat()
        message = f"WAIaaS Owner Action: {action}\nNonce: {nonce_resp.nonce}\nTimestamp: {timestamp}"
        signature = await self._sign_message(message)

        payload = {
            "chain": self._chain,
            "address": self._owner_address,
            "action": action,
            "nonce": nonce_resp.nonce,
            "timestamp": timestamp,
            "message": message,
            "signature": signature,
        }

        encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
        return f"Bearer {encoded}"

    async def _owner_get(self, path: str, action: str, *, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        auth = await self._build_owner_auth(action)
        response = await self._http.get(path, params=params, headers={"Authorization": auth})
        return self._handle_response(response)

    async def _owner_post(self, path: str, action: str, *, json: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        auth = await self._build_owner_auth(action)
        response = await self._http.post(path, json=json, headers={"Authorization": auth})
        return self._handle_response(response)

    async def _owner_put(self, path: str, action: str, *, json: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        auth = await self._build_owner_auth(action)
        response = await self._http.put(path, json=json, headers={"Authorization": auth})
        return self._handle_response(response)

    async def _owner_delete(self, path: str, action: str) -> dict[str, Any]:
        auth = await self._build_owner_auth(action)
        response = await self._http.delete(path, headers={"Authorization": auth})
        return self._handle_response(response)

    async def _post_public(self, path: str, *, json: dict[str, Any]) -> dict[str, Any]:
        response = await self._http.post(path, json=json)
        return self._handle_response(response)

    def _build_sign_in_message(self, nonce: str) -> str:
        from urllib.parse import urlparse
        parsed = urlparse(self._base_url)
        domain = parsed.netloc
        issued_at = datetime.now(timezone.utc).isoformat()
        expiration = datetime.fromtimestamp(
            datetime.now(timezone.utc).timestamp() + 300, tz=timezone.utc
        ).isoformat()
        chain_label = "Solana" if self._chain == "solana" else "Ethereum"

        return "\n".join([
            f"{domain} wants you to sign in with your {chain_label} account:",
            self._owner_address,
            "",
            "Sign in to WAIaaS to create an agent session.",
            "",
            f"URI: {self._base_url}",
            "Version: 1",
            "Chain ID: 1",
            f"Nonce: {nonce}",
            f"Issued At: {issued_at}",
            f"Expiration Time: {expiration}",
        ])

    def _handle_response(self, response: httpx.Response) -> dict[str, Any]:
        if response.is_success:
            return response.json()  # type: ignore[no-any-return]
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
        )
```

### 4.5 WAIaaSError (Python)

```python
# waiaas/error.py
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
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.retryable = retryable
        self.request_id = request_id
        self.details = details

    def __repr__(self) -> str:
        return f"WAIaaSError(code={self.code!r}, message={self.message!r}, status_code={self.status_code})"

    @property
    def message(self) -> str:
        return str(self)
```

### 4.6 Python SDK 사용 예시

```python
import asyncio
from waiaas import WAIaaSClient, WAIaaSError
from waiaas.models import TransferRequest

async def main():
    async with WAIaaSClient(
        base_url="http://127.0.0.1:3100",
        session_token="wai_sess_eyJhbGciOiJIUzI1NiIs...",
    ) as client:
        # 잔액 조회
        balance = await client.get_balance()
        print(f"Balance: {balance.formatted}")  # "1.5 SOL"

        # 주소 조회
        address = await client.get_address()
        print(f"Address: {address.address}")

        # 토큰 전송
        try:
            tx = await client.send_token(TransferRequest(
                to="So11111111111111111111111111111112",
                amount="1000000000",
                memo="Payment",
            ))
            print(f"Status: {tx.status}, Hash: {tx.tx_hash}")
        except WAIaaSError as e:
            print(f"[{e.code}] {e.message} (retryable: {e.retryable})")

        # 거래 이력
        history = await client.list_transactions(status="CONFIRMED", limit=10)
        for tx in history.transactions:
            print(f"{tx.id} | {tx.status} | {tx.amount}")

asyncio.run(main())
```

---

## 5. MCP Server (`@waiaas/mcp`) -- MCP-01

> **(v0.5 검토) MCP 데몬 내장 옵션 검토 결과:** MCP 데몬 내장 옵션(Streamable HTTP 옵션 A, 하이브리드 stdio 옵션 C)을 검토하였으나, 현행 별도 stdio 프로세스(옵션 B)를 유지하기로 결정. 근거: MCP 호스트 생태계가 stdio 기반이며, sessionAuth 보장 + 관심사 분리가 유리. 마이그레이션 경로: B -> B+자동화 -> C(--mcp-stdio) -> A 재검토. 상세: 55-dx-improvement-spec.md 섹션 3 참조.

### 5.1 패키지 구조

```
packages/mcp/
├── package.json          # @waiaas/mcp
├── tsconfig.json
├── src/
│   ├── index.ts          # MCP Server 엔트리포인트
│   ├── server.ts         # McpServer 초기화 + tool/resource 등록
│   ├── tools/
│   │   ├── send-token.ts
│   │   ├── get-balance.ts
│   │   ├── get-address.ts
│   │   ├── list-transactions.ts
│   │   ├── get-transaction.ts
│   │   └── get-nonce.ts
│   ├── resources/
│   │   ├── wallet-balance.ts
│   │   ├── wallet-address.ts
│   │   └── system-status.ts
│   └── internal/
│       ├── api-client.ts   # localhost API 호출 래퍼
│       └── config.ts       # 환경변수, 설정
├── tests/
│   ├── tools.test.ts
│   └── resources.test.ts
└── README.md
```

**package.json 핵심:**

```json
{
  "name": "@waiaas/mcp",
  "version": "0.2.0",
  "type": "module",
  "bin": {
    "waiaas-mcp": "./dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@waiaas/core": "workspace:*",
    "zod": "^3.25.0"
  }
}
```

### 5.2 MCP Server 초기화

```typescript
// packages/mcp/src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

// 환경변수에서 설정 로드
const BASE_URL = process.env.WAIAAS_BASE_URL ?? 'http://127.0.0.1:3100'
const SESSION_TOKEN = process.env.WAIAAS_SESSION_TOKEN ?? ''

if (!SESSION_TOKEN) {
  console.error('[waiaas-mcp] WAIAAS_SESSION_TOKEN 환경변수가 설정되지 않았습니다.')
  process.exit(1)
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'waiaas-wallet',
    version: '0.2.0',
  })

  // Tools 등록 (섹션 5.3)
  registerTools(server)

  // Resources 등록 (섹션 5.4)
  registerResources(server)

  return server
}
```

### 5.3 MCP Tools (6개)

AI 에이전트가 직접 호출하는 **행동(Action)** 도구. Agent API(Session Bearer)에 1:1 매핑.

#### 5.3.1 전체 도구 목록

| # | Tool Name | REST API | 설명 | 입력 파라미터 |
|---|-----------|----------|------|-------------|
| 1 | `send_token` | POST /v1/transactions/send | 토큰 전송 | to, amount, memo?, priority? |
| 2 | `get_balance` | GET /v1/wallet/balance | 잔액 조회 | (없음) |
| 3 | `get_address` | GET /v1/wallet/address | 주소 조회 | (없음) |
| 4 | `list_transactions` | GET /v1/transactions | 거래 이력 | status?, limit?, cursor?, order? |
| 5 | `get_transaction` | GET /v1/transactions/:id | 단일 거래 | transaction_id |
| 6 | `get_nonce` | GET /v1/nonce | nonce 조회 | (없음) |

**도구 선정 기준:**
- Agent API 엔드포인트만 Tool로 노출 (Owner API, Admin API 미노출)
- 6개로 제한 (MCP Pitfall 2: Tool 과다 등록 방지, LLM 컨텍스트 절약)
- 관리 작업(세션/정책/킬스위치)은 Tauri Desktop 또는 REST API 직접 호출

> **(v0.5 변경) MCP tool 호출 인증:** MCP tool은 WAIAAS_SESSION_TOKEN(sessionAuth)으로 인증. 세션 생성은 masterAuth(implicit)이므로 MCP 프로세스 외부에서 수행. 세션 토큰 불편함 완화 방안으로 `mcp setup` 커맨드, 세션 자동 갱신, env 파일 생성을 검토 중.
>
> **(v0.5 참고) 세션 갱신:** 에이전트가 세션 갱신을 자율적으로 수행 가능. MCP tool에 `renew_session` 추가 검토 가능 (미래 확장).
>
> **[v0.9] SessionManager 자동 갱신:** MCP Server 내부의 SessionManager가 TTL 60% 경과 시점에 자동 갱신을 수행한다. tool handler에서 `sessionManager.getToken()`으로 항상 최신 토큰을 참조한다. 상세: 섹션 6.4.

#### 5.3.2 send_token

```typescript
// packages/mcp/src/tools/send-token.ts
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerSendToken(server: McpServer): void {
  server.tool(
    'send_token',
    'Send SOL or tokens from the agent wallet to a destination address. ' +
    'Amount is in the smallest unit (lamports for SOL: 1 SOL = 1_000_000_000 lamports). ' +
    'Returns transaction ID and status. INSTANT tier returns CONFIRMED with txHash, ' +
    'DELAY/APPROVAL tier returns QUEUED for owner action.',
    {
      to: z.string().describe('Destination wallet address (Solana: base58, EVM: 0x hex)'),
      amount: z.string().describe('Amount in smallest unit (lamports/wei as string)'),
      memo: z.string().optional().describe('Optional transaction memo (max 200 chars)'),
      priority: z.enum(['low', 'medium', 'high']).optional()
        .describe('Fee priority: low=minimum, medium=average, high=maximum. Default: medium'),
    },
    async ({ to, amount, memo, priority }) => {
      const body: Record<string, unknown> = { to, amount }
      if (memo) body.memo = memo
      if (priority) body.priority = priority

      const res = await fetch(`${BASE_URL}/v1/transactions/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()

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
            }),
          }],
          isError: true,
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(data),
        }],
      }
    },
  )
}
```

#### 5.3.3 get_balance

```typescript
// packages/mcp/src/tools/get-balance.ts
export function registerGetBalance(server: McpServer): void {
  server.tool(
    'get_balance',
    'Get the current balance of the agent wallet. ' +
    'Returns balance in smallest unit (lamports/wei), decimals, symbol, and formatted string.',
    {},
    async () => {
      const res = await fetch(`${BASE_URL}/v1/wallet/balance`, {
        headers: { 'Authorization': `Bearer ${SESSION_TOKEN}` },
      })
      const data = await res.json()

      if (!res.ok) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.error ?? data) }],
          isError: true,
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      }
    },
  )
}
```

#### 5.3.4 get_address

```typescript
// packages/mcp/src/tools/get-address.ts
export function registerGetAddress(server: McpServer): void {
  server.tool(
    'get_address',
    'Get the public address of the agent wallet. ' +
    'Returns the wallet address, chain, network, and encoding format.',
    {},
    async () => {
      const res = await fetch(`${BASE_URL}/v1/wallet/address`, {
        headers: { 'Authorization': `Bearer ${SESSION_TOKEN}` },
      })
      const data = await res.json()

      if (!res.ok) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.error ?? data) }],
          isError: true,
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      }
    },
  )
}
```

#### 5.3.5 list_transactions

```typescript
// packages/mcp/src/tools/list-transactions.ts
export function registerListTransactions(server: McpServer): void {
  server.tool(
    'list_transactions',
    'List transaction history with cursor-based pagination. ' +
    'Filter by status, control page size and sort order.',
    {
      status: z.enum([
        'PENDING', 'QUEUED', 'EXECUTING', 'SUBMITTED',
        'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED',
      ]).optional().describe('Filter by transaction status'),
      limit: z.number().int().min(1).max(100).optional()
        .describe('Page size (1-100, default 20)'),
      cursor: z.string().optional()
        .describe('Cursor from previous response for next page'),
      order: z.enum(['asc', 'desc']).optional()
        .describe('Sort order: asc (oldest first) or desc (newest first, default)'),
    },
    async ({ status, limit, cursor, order }) => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (limit) params.set('limit', String(limit))
      if (cursor) params.set('cursor', cursor)
      if (order) params.set('order', order)

      const query = params.toString() ? `?${params.toString()}` : ''
      const res = await fetch(`${BASE_URL}/v1/transactions${query}`, {
        headers: { 'Authorization': `Bearer ${SESSION_TOKEN}` },
      })
      const data = await res.json()

      if (!res.ok) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.error ?? data) }],
          isError: true,
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      }
    },
  )
}
```

#### 5.3.6 get_transaction

```typescript
// packages/mcp/src/tools/get-transaction.ts
export function registerGetTransaction(server: McpServer): void {
  server.tool(
    'get_transaction',
    'Get details of a specific transaction by its ID. ' +
    'Returns full transaction info including status, tier, txHash, and timestamps.',
    {
      transaction_id: z.string().describe('Transaction UUID (e.g. 019502c0-1a2b-...)'),
    },
    async ({ transaction_id }) => {
      const res = await fetch(`${BASE_URL}/v1/transactions/${transaction_id}`, {
        headers: { 'Authorization': `Bearer ${SESSION_TOKEN}` },
      })
      const data = await res.json()

      if (!res.ok) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.error ?? data) }],
          isError: true,
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      }
    },
  )
}
```

#### 5.3.7 get_nonce

```typescript
// packages/mcp/src/tools/get-nonce.ts
export function registerGetNonce(server: McpServer): void {
  server.tool(
    'get_nonce',
    'Get a one-time nonce for SIWS/SIWE message signing. ' +
    'The nonce expires in 5 minutes. No authentication required.',
    {},
    async () => {
      const res = await fetch(`${BASE_URL}/v1/nonce`)
      const data = await res.json()

      if (!res.ok) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.error ?? data) }],
          isError: true,
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      }
    },
  )
}
```

### 5.3.8 Action Provider -> MCP Tool 자동 변환 (v0.6 추가)

> **(v0.6 추가)** Action Provider가 등록한 ActionDefinition을 MCP Tool로 자동 변환하는 메커니즘. 62-action-provider-architecture.md 섹션 7.3 참조.

**변환 규칙:**

| ActionDefinition 필드 | MCP Tool 필드 | 변환 방식 |
|---------------------|--------------|----------|
| `name` | `tool.name` | `{providerName}_{actionName}` 접두어 결합 |
| `description` | `tool.description` | 그대로 전달 |
| `inputSchema` (Zod) | `tool.inputSchema` (JSON Schema) | `zodToJsonSchema()` 자동 변환 |
| `mcpExpose` | (등록 여부) | `mcpExpose: true`인 Action만 MCP Tool로 등록 |

**MCP_TOOL_MAX = 16 상한:**

```typescript
/**
 * MCP Tool 최대 등록 수.
 * - 기존 6개 MCP Tool (send_token, get_balance, get_address, list_transactions, get_transaction, get_nonce)
 * - + Action에서 변환된 Tool 최대 10개
 * - = 총 16개 상한
 *
 * 근거: LLM 컨텍스트 오버플로 방지 (62-action-provider-architecture.md 섹션 7.3 결정)
 * 16개 초과 시 mcpExpose=true인 Action 중 우선순위 순 선택, 나머지 경고 로그.
 */
const MCP_TOOL_MAX = 16
const BUILT_IN_TOOL_COUNT = 6
const MAX_ACTION_TOOLS = MCP_TOOL_MAX - BUILT_IN_TOOL_COUNT  // = 10
```

**변환 프로세스:**

```typescript
// packages/mcp/src/server.ts (v0.6 확장)
async function registerActionTools(server: McpServer, apiBaseUrl: string): Promise<void> {
  // 1. Action Provider 목록 조회
  const res = await fetch(`${apiBaseUrl}/v1/actions`, {
    headers: { 'Authorization': `Bearer ${SESSION_TOKEN}` },
  })
  const { providers } = await res.json()

  // 2. mcpExpose=true인 Action 수집
  const exposedActions: Array<{ provider: string; action: ActionSummary }> = []
  for (const provider of providers) {
    for (const action of provider.actions) {
      if (action.mcpExpose) {
        exposedActions.push({ provider: provider.name, action })
      }
    }
  }

  // 3. MCP_TOOL_MAX 검사 (기존 6개 + Action Tool)
  if (exposedActions.length > MAX_ACTION_TOOLS) {
    console.warn(
      `[waiaas-mcp] ${exposedActions.length} action tools exceed limit ${MAX_ACTION_TOOLS}. ` +
      `Only first ${MAX_ACTION_TOOLS} will be registered.`
    )
  }
  const toRegister = exposedActions.slice(0, MAX_ACTION_TOOLS)

  // 4. 각 Action을 MCP Tool로 등록
  for (const { provider, action } of toRegister) {
    const toolName = `${provider}_${action.name}`  // 예: jupiter-swap_swap
    const detailRes = await fetch(
      `${apiBaseUrl}/v1/actions/${provider}/${action.name}`,
      { headers: { 'Authorization': `Bearer ${SESSION_TOKEN}` } },
    )
    const detail = await detailRes.json()

    server.tool(
      toolName,
      action.description,
      detail.inputSchema,  // JSON Schema (Zod -> JSON Schema 변환 결과)
      async (params) => {
        // execute 엔드포인트 호출 (resolve + 파이프라인)
        const execRes = await fetch(
          `${apiBaseUrl}/v1/actions/${provider}/${action.name}/execute`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SESSION_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ params }),
          },
        )
        const data = await execRes.json()
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
          isError: !execRes.ok,
        }
      },
    )
  }
}
```

**MCP Tool 등록 순서:**
1. 기존 6개 내장 Tool 등록 (send_token, get_balance, get_address, list_transactions, get_transaction, get_nonce)
2. Action Provider API 조회 -> mcpExpose=true인 Action Tool 등록 (최대 10개)
3. 총 Tool 수가 MCP_TOOL_MAX(16)을 초과하면 경고 로그 + 초과분 미등록

**MCP Tool 총 현황 (v0.6):**

| 구분 | 수 | 예시 |
|------|---|------|
| 기존 내장 Tool | 6 | send_token, get_balance, get_address, list_transactions, get_transaction, get_nonce |
| Action 변환 Tool | 0~10 | jupiter-swap_swap (등록된 Action Provider에 따라 동적) |
| **최대** | **16** | MCP_TOOL_MAX 상한 |

---

### 5.4 MCP Resources (3개)

AI 에이전트가 참조하는 **데이터(Context)** 리소스. LLM이 컨텍스트에 로드하여 참조.

| # | Resource Name | URI | MIME Type | 설명 |
|---|--------------|-----|-----------|------|
| 1 | `wallet-balance` | `waiaas://wallet/balance` | `application/json` | 에이전트 지갑 잔액 |
| 2 | `wallet-address` | `waiaas://wallet/address` | `application/json` | 에이전트 지갑 주소 |
| 3 | `system-status` | `waiaas://system/status` | `application/json` | 데몬 상태 (health) |

#### 5.4.1 wallet-balance 리소스

```typescript
// packages/mcp/src/resources/wallet-balance.ts
export function registerWalletBalanceResource(server: McpServer): void {
  server.resource(
    'wallet-balance',
    'waiaas://wallet/balance',
    {
      description: 'Current balance of the agent wallet. Returns balance in lamports/wei, ' +
        'human-readable format, chain, and network.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const res = await fetch(`${BASE_URL}/v1/wallet/balance`, {
        headers: { 'Authorization': `Bearer ${SESSION_TOKEN}` },
      })

      if (!res.ok) {
        const error = await res.json()
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: error.error ?? error }),
          }],
        }
      }

      const data = await res.json()
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data),
        }],
      }
    },
  )
}
```

#### 5.4.2 wallet-address 리소스

```typescript
// packages/mcp/src/resources/wallet-address.ts
export function registerWalletAddressResource(server: McpServer): void {
  server.resource(
    'wallet-address',
    'waiaas://wallet/address',
    {
      description: 'Public address of the agent wallet. Returns address, chain, network, and encoding.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const res = await fetch(`${BASE_URL}/v1/wallet/address`, {
        headers: { 'Authorization': `Bearer ${SESSION_TOKEN}` },
      })

      if (!res.ok) {
        const error = await res.json()
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: error.error ?? error }),
          }],
        }
      }

      const data = await res.json()
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data),
        }],
      }
    },
  )
}
```

#### 5.4.3 system-status 리소스

```typescript
// packages/mcp/src/resources/system-status.ts
export function registerSystemStatusResource(server: McpServer): void {
  server.resource(
    'system-status',
    'waiaas://system/status',
    {
      description: 'WAIaaS daemon health status. Returns status (ok/degraded/error), version, uptime.',
      mimeType: 'application/json',
    },
    async (uri) => {
      // health 엔드포인트는 인증 불필요
      const res = await fetch(`${BASE_URL}/health`)

      if (!res.ok) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ status: 'error', message: `HTTP ${res.status}` }),
          }],
        }
      }

      const data = await res.json()
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data),
        }],
      }
    },
  )
}
```

### 5.5 Tool 응답 형식

모든 MCP Tool은 **JSON text** 형식으로 응답한다. MCP 프로토콜의 `TextContent` 타입 사용.

```typescript
// 성공 응답
{
  content: [{
    type: 'text',
    text: '{"balance":"1500000000","decimals":9,"symbol":"SOL","formatted":"1.5 SOL","chain":"solana","network":"mainnet-beta"}'
  }]
}

// 에러 응답
{
  content: [{
    type: 'text',
    text: '{"error":true,"code":"INSUFFICIENT_BALANCE","message":"잔액 부족","retryable":false}'
  }],
  isError: true
}
```

**설계 결정:**
- `type: 'text'` + JSON 문자열: LLM이 구조화된 데이터를 쉽게 파싱 가능
- `isError: true`: MCP 프로토콜 수준에서 에러 응답 표시 (LLM이 재시도 판단에 활용)
- WAIaaS 에러 코드(`code`)를 그대로 전달하여 LLM이 에러 유형별 대응 가능

---

## 6. MCP 세션 토큰 전달 메커니즘

### 6.1 MCP 전용 장기 세션 발급

MCP Server는 Claude Desktop 등에서 프로세스로 실행되며, 환경변수를 통해 세션 토큰을 전달받는다. 일반 에이전트 세션(기본 24시간)과 달리 MCP 전용으로 **장기 세션(최대 7일)**을 발급하는 것을 권장한다.

```bash
# MCP 전용 세션 발급 (Owner CLI로)
waiaas session create \
  --agent-id 01950288-1a2b-3c4d-5e6f-abcdef012345 \
  --expires-in 604800 \
  --constraints '{"maxAmountPerTx":"1000000000","allowedOperations":["TRANSFER","BALANCE_CHECK"]}'

# 출력: wai_sess_eyJhbGciOiJIUzI1NiIs...
```

**MCP 세션 특성:**

| 항목 | 일반 에이전트 세션 | MCP 전용 세션 |
|------|-------------------|-------------|
| 만료 | 기본 24시간 | 최대 7일 (604800초) |
| 제약 | 사용 패턴별 최적화 | 보수적 제한 (MCP 도구 범위 내) |
| 갱신 | SDK에서 자동 교체 가능 | [v0.9] SessionManager 자동 갱신 -- scheduleRenewal + 5종 실패 대응 + lazy 401 reload (섹션 6.4.3~6.4.7 참조) |
| 주체 | AI 에이전트 프레임워크 | Claude Desktop, Cursor 등 |

### 6.2 Claude Desktop 설정 예시

```json
{
  "mcpServers": {
    "waiaas-wallet": {
      "command": "npx",
      "args": ["@waiaas/mcp"],
      "env": {
        "WAIAAS_SESSION_TOKEN": "wai_sess_eyJhbGciOiJIUzI1NiIs...",
        "WAIAAS_BASE_URL": "http://127.0.0.1:3100"
      }
    }
  }
}
```

**macOS 기본 경로:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows 기본 경로:** `%APPDATA%\Claude\claude_desktop_config.json`

### 6.3 토큰 만료 시 동작

MCP Server가 만료된 세션 토큰으로 API를 호출하면:

1. WAIaaS 데몬이 `401 AUTH_TOKEN_EXPIRED` 에러 반환
2. MCP Tool이 `isError: true`와 함께 에러 메시지 반환
3. LLM이 사용자에게 "세션 토큰이 만료되었습니다. 새 토큰을 설정해 주세요." 안내
4. 사용자가 Owner CLI로 새 세션 발급 후 Claude Desktop 설정 업데이트
5. MCP Server 재시작 (Claude Desktop이 프로세스 재생성)

> **[v0.9] SessionManager 도입으로 위 수동 흐름이 자동화됨.** SessionManager가 토큰 갱신을 자동 수행하고, 외부 갱신(CLI/Telegram)에 대해서는 lazy 401 reload로 무중단 토큰 전환을 수행한다. 상세는 섹션 6.4 참조.

---

### 6.4 [v0.9] SessionManager 핵심 설계

MCP Server 프로세스 내부에 SessionManager를 추가하여 세션 토큰의 로드, 갱신, 교체, 영속화를 자동 처리하는 구조를 설계한다. 섹션 6.3의 수동 토큰 갱신 흐름을 대체한다.

#### 6.4.1 [v0.9] SessionManager 클래스 인터페이스 (SMGR-01)

**파일 위치:** `packages/mcp/src/session-manager.ts`

**SessionManagerOptions 인터페이스:**

```typescript
interface SessionManagerOptions {
  baseUrl?: string    // 데몬 베이스 URL (기본값: 'http://127.0.0.1:3100')
  dataDir?: string    // 데이터 디렉토리 (기본값: '~/.waiaas')
  envToken?: string   // 환경변수 토큰 (WAIAAS_SESSION_TOKEN, 테스트 주입용)
}
```

**SessionState 타입:**

```typescript
type SessionState = 'active' | 'expired' | 'error'
```

| 값 | 설명 |
|----|------|
| `active` | 토큰이 유효하고 갱신 스케줄이 동작 중 |
| `expired` | 토큰이 만료됨. 외부 갱신(CLI/Telegram) 대기 |
| `error` | 토큰 로드 실패 또는 복구 불가 에러 |

**내부 상태 9개:**

| # | 필드 | 타입 | 설명 |
|---|------|------|------|
| 1 | `token` | `string` | 현재 유효 JWT (`wai_sess_` 접두어 포함) |
| 2 | `sessionId` | `string` | JWT claims의 `sid` |
| 3 | `expiresAt` | `number` | epoch ms (서버 응답 기준, 드리프트 보정용) |
| 4 | `expiresIn` | `number` | original TTL ms (갱신 스케줄 계산용) |
| 5 | `renewalCount` | `number` | 현재 갱신 횟수 (초기값 0, 첫 갱신 응답에서 업데이트) |
| 6 | `maxRenewals` | `number` | 최대 갱신 횟수 (초기값 Infinity, 첫 갱신 응답에서 업데이트) |
| 7 | `timer` | `NodeJS.Timeout \| null` | 갱신 타이머 핸들 |
| 8 | `isRenewing` | `boolean` | 갱신 진행 중 플래그 (중복 갱신 방지) |
| 9 | `state` | `SessionState` | 현재 세션 상태 |

**Public 메서드 3개:**

| 메서드 | 시그니처 | 설명 |
|--------|---------|------|
| `getToken()` | `getToken(): string` | 현재 유효 토큰 반환. 모든 tool handler가 이 메서드 사용. 갱신 중에도 현재(구) 토큰 반환, 갱신 완료 후 다음 호출부터 새 토큰 |
| `start()` | `async start(): Promise<void>` | `loadToken()` + `scheduleRenewal()` 호출. 프로세스 시작 시 1회 호출. 데몬 미기동 시 graceful degradation (로컬 JWT exp 기준 동작) |
| `dispose()` | `dispose(): void` | `clearTimeout(timer)` + `timer = null`. SIGTERM 시 호출. inflight 갱신이 있으면 `renewPromise` 완료 대기(최대 5초) |

**내부 메서드 5개 (Plan 37-02에서 상세 설계):**

| 메서드 | 시그니처 | 설명 |
|--------|---------|------|
| `loadToken()` | `private loadToken(): void` | 토큰 로드 + JWT 디코딩 + 내부 상태 설정 (상세: 섹션 6.4.2) |
| `scheduleRenewal()` | `private scheduleRenewal(): void` | 갱신 타이머 설정 (safeSetTimeout, 서버 응답 기준 드리프트 보정) |
| `renew()` | `private async renew(): Promise<void>` | PUT /renew 호출 + 파일 쓰기 + 메모리 교체. 순서: 파일 먼저, 메모리 나중 (H-02 방어) |
| `handleRenewalError()` | `private handleRenewalError(error: RenewalError): void` | 5종 에러 분기 (RENEWAL_TOO_EARLY, RENEWAL_LIMIT_REACHED, SESSION_ABSOLUTE_LIFETIME_EXCEEDED, NETWORK_ERROR, AUTH_TOKEN_EXPIRED) |
| `handleUnauthorized()` | `async handleUnauthorized(): Promise<boolean>` | lazy 401 reload -- 파일 재로드 + 토큰 비교 + 갱신 스케줄 재설정 |

**상수:**

| 상수 | 값 | 설명 |
|------|-----|------|
| `RENEWAL_RATIO` | `0.6` | TTL의 60% 경과 시점에 갱신 |
| `MAX_TIMEOUT_MS` | `2_147_483_647` | setTimeout 32-bit 상한 (2^31 - 1) |
| `TOKEN_PREFIX` | `'wai_sess_'` | 토큰 접두어 |

**TypeScript 의사 코드 (설계 문서 수준):**

```typescript
// packages/mcp/src/session-manager.ts
// [v0.9] SessionManager -- MCP SDK(@modelcontextprotocol/sdk)와 완전 독립, Composition 패턴

import { decodeJwt } from 'jose'
import {
  readMcpToken,
  writeMcpToken,
  getMcpTokenPath,
} from '@waiaas/core/utils/token-file.js'

// ── 상수 ──
const RENEWAL_RATIO = 0.6
const MAX_TIMEOUT_MS = 2_147_483_647  // 2^31 - 1
const TOKEN_PREFIX = 'wai_sess_'

// ── 타입 ──
type SessionState = 'active' | 'expired' | 'error'

interface SessionManagerOptions {
  baseUrl?: string
  dataDir?: string
  envToken?: string
}

// ── safeSetTimeout 래퍼 (C-01 방어) ──
function safeSetTimeout(
  callback: () => void,
  delayMs: number,
): NodeJS.Timeout {
  if (delayMs > MAX_TIMEOUT_MS) {
    return setTimeout(
      () => safeSetTimeout(callback, delayMs - MAX_TIMEOUT_MS),
      MAX_TIMEOUT_MS,
    )
  }
  return setTimeout(callback, Math.max(delayMs, 0))
}

class SessionManager {
  // ── 내부 상태 (9개) ──
  private token: string = ''
  private sessionId: string = ''
  private expiresAt: number = 0       // epoch ms
  private expiresIn: number = 0       // original TTL (ms)
  private renewalCount: number = 0
  private maxRenewals: number = Infinity
  private timer: NodeJS.Timeout | null = null
  private isRenewing: boolean = false
  private state: SessionState = 'active'

  // ── 내부 보조 필드 ──
  private renewPromise: Promise<void> | null = null
  private readonly tokenFilePath: string
  private readonly baseUrl: string

  constructor(options: SessionManagerOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:3100')
      .replace(/\/$/, '')
    this.tokenFilePath = getMcpTokenPath(options.dataDir)
  }

  // ── Public: 현재 유효 토큰 반환 ──
  getToken(): string {
    return this.token
  }

  // ── Public: 갱신 스케줄러 시작 ──
  async start(): Promise<void> {
    this.loadToken()
    this.scheduleRenewal()
    console.error(
      `[waiaas-mcp] SessionManager started (sid=${this.sessionId}, ` +
      `expires=${new Date(this.expiresAt).toISOString()})`,
    )
  }

  // ── Public: 정리 (타이머 해제) ──
  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    // inflight 갱신 완료 대기 (최대 5초)
    if (this.renewPromise) {
      const timeout = new Promise<void>(r => setTimeout(r, 5000))
      Promise.race([this.renewPromise, timeout])
    }
  }

  // ── Private: loadToken (섹션 6.4.2 참조) ──
  private loadToken(): void { /* ... */ }

  // ── Private: scheduleRenewal (Plan 37-02에서 상세 설계) ──
  private scheduleRenewal(): void { /* ... */ }

  // ── Private: renew (Plan 37-02에서 상세 설계) ──
  private async renew(): Promise<void> { /* ... */ }

  // ── Private: handleRenewalError (Plan 37-02에서 상세 설계) ──
  private handleRenewalError(error: RenewalError): void { /* ... */ }

  // ── handleUnauthorized: lazy 401 reload (Plan 37-02에서 상세 설계) ──
  async handleUnauthorized(): Promise<boolean> { /* ... */ }
}
```

**MCP Server 통합 (Composition 패턴):**

```typescript
// packages/mcp/src/index.ts (엔트리포인트에서 SessionManager 초기화)
import { SessionManager } from './session-manager.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const sessionManager = new SessionManager({
  baseUrl: process.env.WAIAAS_BASE_URL,
  dataDir: process.env.WAIAAS_DATA_DIR,
  envToken: process.env.WAIAAS_SESSION_TOKEN,
})

await sessionManager.start()

// Tool handler에서 토큰 참조
const token = sessionManager.getToken()

// SIGTERM 시 정리
process.on('SIGTERM', () => {
  sessionManager.dispose()
  process.exit(0)
})
```

> **MCP SDK 독립 근거:** MCP SDK v1.x에는 세션/인증 lifecycle hook이 없다. SessionManager를 독립 클래스로 설계하고 tool handler에서 `getToken()`을 참조하는 composition 패턴을 사용한다. MCP SDK v2 마이그레이션 시에도 SessionManager는 변경 없이 사용 가능하다.

#### 6.4.2 [v0.9] 토큰 로드 전략 (SMGR-03)

`loadToken()` 메서드는 MCP Server 프로세스 시작 시 호출되어, 토큰 파일 또는 환경변수에서 JWT를 로드하고 내부 상태를 설정한다.

**토큰 로드 8-Step 절차:**

| Step | 동작 | 실패 시 |
|------|------|---------|
| 1 | `readMcpToken(this.tokenFilePath)` 호출 (Phase 36-01 확정 유틸리티) | Step 2로 이동 |
| 2 | 파일 없으면 `process.env.WAIAAS_SESSION_TOKEN ?? null` fallback | Step 3으로 이동 |
| 3 | 둘 다 없으면 `Error('[waiaas-mcp] No session token found')` throw | 프로세스 시작 실패 |
| 4 | `wai_sess_` 접두어 제거 후 `jose decodeJwt(jwt)` 호출 | JWT 파싱 에러 throw |
| 5 | 필수 claim 추출 -- `sid` (string), `exp` (number, epoch seconds), `iat` (number, epoch seconds) | Step 6 에러 |
| 6 | **방어적 범위 검증 (C-03 대응)** -- exp가 과거 10년 ~ 미래 1년 범위 내인지 확인 | 범위 외 에러 throw |
| 7 | 만료 확인 -- `exp <= Math.floor(Date.now() / 1000)` 이면 `state = 'expired'` + throw | 만료 에러 throw |
| 8 | 내부 상태 설정 -- `token`, `sessionId`, `expiresAt` (exp * 1000), `expiresIn` ((exp - iat) * 1000), `state = 'active'` | - |

**토큰 로드 우선순위:**

```
프로세스 시작
  |
  v
  1. ~/.waiaas/mcp-token 파일 존재?
     |-- Yes --> 파일에서 토큰 로드 (readMcpToken)
     +-- No  --> 2. WAIAAS_SESSION_TOKEN 환경변수에서 로드
                    |-- Yes --> 환경변수 토큰 사용
                    +-- No  --> Error: No session token found
  |
  v
  3. wai_sess_ 접두어 제거
  4. jose decodeJwt(jwt) -- 서명 검증 없이 payload base64url 디코딩
  5. 필수 claim 추출: sid, exp, iat
  6. 방어적 범위 검증 (C-03 대응)
  7. 만료 여부 확인
  8. 내부 상태 설정 --> scheduleRenewal()
```

**TypeScript 의사 코드:**

```typescript
// SessionManager 내부 메서드
// [v0.9] Phase 36-01 readMcpToken 유틸리티 + jose decodeJwt 연동

private loadToken(): void {
  // Step 1: 파일 우선 로드 (Phase 36-01 확정 유틸리티)
  let rawToken = readMcpToken(this.tokenFilePath)

  if (rawToken) {
    console.error(
      `[waiaas-mcp] Token loaded from file (${this.tokenFilePath})`,
    )
  }

  // Step 2: 파일 없으면 환경변수 fallback
  if (!rawToken) {
    rawToken = process.env.WAIAAS_SESSION_TOKEN ?? null
    if (rawToken) {
      console.error(
        '[waiaas-mcp] Token loaded from WAIAAS_SESSION_TOKEN env var',
      )
    }
  }

  // Step 3: 둘 다 없으면 에러
  if (!rawToken) {
    throw new Error('[waiaas-mcp] No session token found')
  }

  // Step 4: wai_sess_ 접두어 제거 + jose decodeJwt
  const jwt = rawToken.startsWith(TOKEN_PREFIX)
    ? rawToken.slice(TOKEN_PREFIX.length)
    : rawToken
  const payload = decodeJwt(jwt)

  // Step 5: 필수 claim 추출
  const sid = (payload as Record<string, unknown>).sid as string | undefined
  const exp = payload.exp   // epoch seconds
  const iat = payload.iat   // epoch seconds

  if (!sid || typeof exp !== 'number' || typeof iat !== 'number') {
    throw new Error('[waiaas-mcp] Invalid JWT: missing sid/exp/iat')
  }

  // Step 6: 방어적 범위 검증 (C-03 대응)
  // exp가 과거 10년(315,360,000초) ~ 미래 1년(31,536,000초) 범위 내인지 확인
  const nowSec = Math.floor(Date.now() / 1000)
  if (exp < nowSec - 315_360_000 || exp > nowSec + 31_536_000) {
    throw new Error(
      `[waiaas-mcp] JWT exp out of reasonable range: ` +
      `${new Date(exp * 1000).toISOString()}`,
    )
  }

  // Step 7: 만료 확인
  if (exp <= nowSec) {
    this.state = 'expired'
    console.error(
      `[waiaas-mcp] Token expired at ` +
      `${new Date(exp * 1000).toISOString()}. ` +
      `Waiting for external refresh.`,
    )
    throw new Error(
      `[waiaas-mcp] Token expired: ` +
      `${new Date(exp * 1000).toISOString()}`,
    )
  }

  // Step 8: 내부 상태 설정
  this.token = rawToken
  this.sessionId = sid
  this.expiresAt = exp * 1000           // epoch ms
  this.expiresIn = (exp - iat) * 1000   // original TTL (ms)
  this.state = 'active'

  console.error(
    `[waiaas-mcp] Token loaded from file ` +
    `(expires: ${new Date(this.expiresAt).toISOString()})`,
  )
}
```

**에러 케이스 3종:**

| # | 조건 | 에러 메시지 | state 변경 |
|---|------|-----------|-----------|
| 1 | 토큰 미존재 (파일 + env var 모두 없음) | `[waiaas-mcp] No session token found` | - (throw, 프로세스 미시작) |
| 2 | JWT 파싱 실패 (sid/exp/iat 누락 또는 범위 초과) | `[waiaas-mcp] Invalid JWT: missing sid/exp/iat` 또는 `JWT exp out of reasonable range` | - (throw, 프로세스 미시작) |
| 3 | 토큰 만료 | `[waiaas-mcp] Token expired: {iso8601}` | `state = 'expired'` |

**로그 출력 (console.error 기반):**

| 상황 | 로그 메시지 |
|------|-----------|
| 파일 로드 성공 | `[waiaas-mcp] Token loaded from file (expires: {iso8601})` |
| 환경변수 fallback | `[waiaas-mcp] Token loaded from WAIAAS_SESSION_TOKEN env var` |
| 만료 경고 | `[waiaas-mcp] Token expired at {iso8601}. Waiting for external refresh.` |
| SessionManager 시작 | `[waiaas-mcp] SessionManager started (sid={sid}, expires={iso8601})` |

> **Phase 36 연결:** `readMcpToken()` 함수는 Phase 36-01에서 확정된 `@waiaas/core` `utils/token-file.ts`의 공유 유틸리티이다. symlink 거부, 형식 검증, 동기 API(readFileSync)가 내장되어 있다. 상세 사양은 24-monorepo-data-directory.md 섹션 4.2 참조.

> **jose decodeJwt 사용 근거:** MCP Server에는 JWT 서명 비밀키가 없어 서명 검증이 불가하다. `jose` `decodeJwt()`는 서명 검증 없이 payload만 base64url 디코딩하며, base64url 패딩 처리와 타입 안전성을 제공한다. 수동 `JSON.parse(atob(...))` 대신 jose를 사용하여 10+ 엣지 케이스를 방어한다. 프로젝트에 이미 jose가 의존성으로 포함되어 있으므로 추가 설치가 불필요하다.

> **방어적 범위 검증 (C-03 대응):** JWT payload 무검증 디코딩의 보안 한계를 보완한다. 조작된 토큰이 mcp-token 파일에 심어지더라도, exp 범위가 과거 10년 ~ 미래 1년 범위를 벗어나면 로드를 거부한다. 실제 API 호출은 데몬에서 서명 검증으로 거부되지만, SessionManager 내부 상태 오염을 방지하는 추가 방어선이다.

#### 6.4.3 [v0.9] safeSetTimeout 래퍼 (C-01 Pitfall 대응) (SMGR-04)

`setTimeout`에 2,147,483,647ms(약 24.85일, 2^31 - 1) 초과 딜레이를 전달하면 Node.js 내부적으로 signed 32-bit 정수로 처리하여 **즉시 실행**된다. 기본 7일 TTL의 60%=4.2일은 안전하지만, `config.toml`에서 `expiresIn`을 42일 이상으로 설정하면 오버플로우가 발생한다.

**safeSetTimeout 함수 명세:**

```typescript
// packages/mcp/src/session-manager.ts 내 모듈 스코프 함수
// [v0.9] C-01 Pitfall 대응: 32-bit 정수 오버플로우 방지

const MAX_TIMEOUT_MS = 2_147_483_647  // 2^31 - 1

function safeSetTimeout(callback: () => void, delayMs: number): NodeJS.Timeout {
  if (delayMs > MAX_TIMEOUT_MS) {
    // 체이닝: MAX_TIMEOUT_MS만큼 대기 후 남은 시간으로 재스케줄
    return setTimeout(() => {
      safeSetTimeout(callback, delayMs - MAX_TIMEOUT_MS)
    }, MAX_TIMEOUT_MS)
  }
  return setTimeout(callback, Math.max(delayMs, 0))
}
```

**사용 위치:**

| 메서드 | 용도 |
|--------|------|
| `scheduleRenewal()` | 다음 갱신 시점까지 대기 타이머 설정 |
| `handleRenewalError()` | RENEWAL_TOO_EARLY 30초 재시도 타이머 |
| `retryRenewal()` | NETWORK_ERROR 60초 재시도 타이머 |

**파일 위치:** `packages/mcp/src/session-manager.ts` 내 모듈 스코프 함수 (클래스 외부, export하지 않음)

**오버플로우 발생 조건 테이블:**

| TTL | 갱신 시점 (60%) | 잔여 시간 | delayMs | safeSetTimeout 체이닝 필요 |
|-----|----------------|----------|---------|--------------------------|
| 1시간 | 36분 후 | 24분 | 2,160,000ms | 아니오 |
| 7일 | 4.2일 후 | 2.8일 | 362,880,000ms | 아니오 |
| 30일 | 18일 후 | 12일 | 1,555,200,000ms | 아니오 |
| 42일+ | 25.2일+ 후 | 16.8일+ | 2,177,280,000ms+ | **예** (체이닝) |

> **설계 결정 SM-08:** safeSetTimeout 래퍼로 32-bit overflow 방어. 10줄 래퍼 함수로 충분하며, 외부 라이브러리(`safe-timers` 등) 추가 불필요.

#### 6.4.4 [v0.9] 자동 갱신 스케줄 (SMGR-04)

SessionManager는 TTL의 60% 경과 시점에 자동 갱신을 수행한다. 서버 응답의 `expiresAt`을 기준으로 다음 갱신 시점을 절대 시간으로 재계산하여, setTimeout 누적 드리프트를 매 갱신마다 0으로 리셋한다 (self-correcting timer).

**scheduleRenewal() 메서드 설계:**

```typescript
// [v0.9] SessionManager 내부 메서드
// 갱신 스케줄 설정 -- 절대 시간 기준 + 드리프트 보정 + safeSetTimeout

private scheduleRenewal(): void {
  // Step 1: 기존 타이머 해제
  if (this.timer) clearTimeout(this.timer)

  // Step 2: 절대 시간 기준 갱신 시점 계산 (드리프트 보정)
  //   renewAtMs = expiresAt - (잔여 40% 구간)
  //   = expiresAt - (expiresIn * (1 - RENEWAL_RATIO))
  //   = expiresAt - (expiresIn * 0.4)
  const renewAtMs = this.expiresAt - (this.expiresIn * (1 - RENEWAL_RATIO))
  const delayMs = Math.max(renewAtMs - Date.now(), 0)

  // Step 3: delayMs === 0이면 즉시 갱신 (이미 갱신 시점 경과)
  if (delayMs === 0) {
    setImmediate(() => this.renew())
    return
  }

  // Step 4: safeSetTimeout으로 갱신 타이머 설정 (C-01 대응)
  this.timer = safeSetTimeout(() => this.renew(), delayMs)

  // Step 5: unref() -- 프로세스 종료를 막지 않음
  this.timer.unref()

  const minutesUntilRenewal = Math.round(delayMs / 60_000)
  console.error(
    `[waiaas-mcp] Next renewal scheduled in ${minutesUntilRenewal}m`,
  )
}
```

**드리프트 보정 원리:**

```
갱신 성공 시:
  서버 응답: { token, expiresAt, renewalCount, maxRenewals }
                          |
                          v
  this.expiresAt = new Date(data.expiresAt).getTime()  <-- 서버 시간 기준
  this.expiresIn = this.expiresAt - Date.now()          <-- 드리프트 보정된 TTL
                          |
                          v
  scheduleRenewal() --> renewAtMs = this.expiresAt - (this.expiresIn * 0.4)
                                    ^^^^^^^^^^^^^^^^^
                                    서버 절대 시간 기준

매 갱신마다:
  1. 서버 응답 expiresAt = 새로운 절대 기준점
  2. 로컬 Date.now()와의 차이 = 새로운 expiresIn
  3. 다음 갱신 시점 = expiresAt 기반 절대 시간 계산
  → 누적 드리프트가 0으로 리셋 (self-correcting)
  → 응답 전송 지연(수십 ms)은 무시 가능 (ms 단위 vs 시간 단위 갱신 주기)
```

**50% 규칙과의 관계:**

| 주체 | 규칙 | 역할 |
|------|------|------|
| 서버 (데몬) | 잔여 50% 이하에서만 갱신 허용 (53-session-renewal-protocol.md) | Safety guard |
| 클라이언트 (SessionManager) | 60% 경과(= 잔여 40%)에 시도 | 갱신 트리거 |

SessionManager의 60% 경과 시점은 서버 safety guard(잔여 50% 이하)를 만족한다 (잔여 40% < 50%).

**갱신 주기 예시 테이블:**

| TTL | 갱신 시점 (60% 경과) | 잔여 시간 | delayMs | safeSetTimeout 필요 |
|-----|---------------------|----------|---------|-------------------|
| 1시간 | 36분 후 | 24분 | 2,160,000ms | 아니오 |
| 7일 (기본) | 4.2일 후 | 2.8일 | 362,880,000ms | 아니오 |
| 30일 | 18일 후 | 12일 | 1,555,200,000ms | 아니오 |
| 42일+ | 25.2일+ 후 | 16.8일+ | 2,177,280,000ms+ | 예 (체이닝) |

> **설계 결정 SM-09:** 서버 응답 `expiresAt` 기준 절대 시간 갱신 스케줄 (self-correcting timer, H-01 대응). 로컬 상대 시간(`expiresIn * 0.6`) 대신 서버-클라이언트 간 절대 시간 동기화로 누적 드리프트 제거.

#### 6.4.5 [v0.9] 갱신 실행 -- renew() 메서드 (SMGR-04)

`renew()` 메서드는 `PUT /v1/sessions/{sessionId}/renew` API를 호출하여 토큰을 갱신한다. **파일-우선 쓰기 순서** (H-02 Pitfall 대응)를 준수한다.

**renew() 메서드 설계:**

```typescript
// [v0.9] SessionManager 내부 메서드
// 갱신 실행 -- 파일-우선 쓰기 (H-02 방어) + 중복 방지

private async renew(): Promise<void> {
  // Step 1: 중복 갱신 방지
  if (this.isRenewing) return
  // Step 2: 갱신 플래그 설정
  this.isRenewing = true

  console.error(
    `[waiaas-mcp] Renewing session ${this.sessionId} ` +
    `(count: ${this.renewalCount}/${this.maxRenewals})`,
  )

  try {
    // Step 3: PUT /v1/sessions/{sessionId}/renew 호출
    const res = await fetch(
      `${this.baseUrl}/v1/sessions/${this.sessionId}/renew`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.token}` },
      },
    )

    if (res.ok) {
      // Step 4: 200 OK 성공
      const data = await res.json() as {
        token: string
        expiresAt: string      // ISO 8601
        renewalCount: number
        maxRenewals: number
      }

      // Step 4a: 파일 먼저 쓰기 (H-02 방어)
      // writeMcpToken = Phase 36-01 확정 @waiaas/core 유틸리티
      await writeMcpToken(this.tokenFilePath, data.token)

      // Step 4b: 메모리 교체 (파일 쓰기 완료 후)
      this.token = data.token
      this.expiresAt = new Date(data.expiresAt).getTime()
      this.renewalCount = data.renewalCount
      this.maxRenewals = data.maxRenewals

      // Step 4c: expiresIn 재계산 (드리프트 보정)
      this.expiresIn = this.expiresAt - Date.now()

      // Step 4d: 다음 갱신 스케줄
      this.scheduleRenewal()

      const minutesLeft = Math.round(this.expiresIn / 60_000)
      console.error(
        `[waiaas-mcp] Session renewed. Next renewal in ${minutesLeft}m`,
      )
    } else {
      // Step 5: 에러 응답
      const errorData = await res.json().catch(() => ({}))
      console.error(
        `[waiaas-mcp] Renewal failed: ` +
        `${(errorData as Record<string, any>)?.error?.code ?? 'UNKNOWN'} ` +
        `(HTTP ${res.status})`,
      )
      this.handleRenewalError({
        status: res.status,
        code: (errorData as Record<string, any>)?.error?.code ?? 'UNKNOWN',
      })
    }
  } catch (err) {
    // Step 6: 네트워크 에러 (fetch 실패)
    console.error(
      `[waiaas-mcp] Renewal failed: NETWORK_ERROR (HTTP 0)`,
    )
    this.handleRenewalError({ status: 0, code: 'NETWORK_ERROR' })
  } finally {
    // Step 7: 갱신 플래그 해제
    this.isRenewing = false
  }
}
```

**파일-우선 쓰기 순서 (H-02 Pitfall 대응):**

```
PUT /v1/sessions/{id}/renew → 200 OK
  |
  v
  1. await writeMcpToken(파일)    <-- 먼저 (SIGTERM 대비)
  |
  v
  2. this.token = data.token     <-- 나중 (메모리 교체)
  |
  v
  3. scheduleRenewal()           <-- 다음 갱신 스케줄
```

| 순서 | 이유 |
|------|------|
| **파일 먼저** | SIGTERM이 메모리 교체 전에 오면, 파일에 새 토큰이 이미 저장됨. 프로세스 재시작 시 파일에서 유효 토큰 복원 가능 |
| **역순(메모리 먼저) 금지** | SIGTERM 시 새 토큰 유실. 데몬 DB에서 구 token_hash 이미 교체 → 영구 인증 실패 |

> **설계 결정 SM-10:** 파일-우선 쓰기 순서 (`writeMcpToken` -> 메모리 교체, H-02 대응). SIGTERM race condition에서 토큰 유실 방지.

**갱신 중 tool 호출 동시성 (Pitfall 5 대응):**

| 상황 | getToken() 반환 | 근거 |
|------|-----------------|------|
| 갱신 시작 전 | 현재 토큰 | 갱신 미발생 |
| 갱신 진행 중 | 현재(구) 토큰 | 갱신 API 자체가 구 토큰의 sessionAuth 사용. inflight tool 호출과 동일 토큰 |
| 갱신 완료 후 | 새 토큰 | 메모리 교체 완료. 다음 getToken() 호출부터 새 토큰 |

> **설계 결정 SM-14:** 갱신 중 `getToken()`은 구 토큰 반환 (동시성 안전). 갱신 API와 inflight tool 호출이 동일 토큰을 사용하므로, 토큰 로테이션에 의한 inflight 실패가 발생하지 않음.

**로그 출력:**

| 상황 | 로그 메시지 |
|------|-----------|
| 갱신 시도 | `[waiaas-mcp] Renewing session {sessionId} (count: {renewalCount}/{maxRenewals})` |
| 갱신 성공 | `[waiaas-mcp] Session renewed. Next renewal in {minutes}m` |
| 갱신 실패 | `[waiaas-mcp] Renewal failed: {code} (HTTP {status})` |

#### 6.4.6 [v0.9] 5종 갱신 실패 대응 -- handleRenewalError + retryRenewal (SMGR-05)

갱신 API 응답의 에러 코드에 따라 5종 분기 처리를 수행한다. 각 에러마다 재시도 정책, 상태 전이, 알림 관계가 정의되어 있다.

**RenewalError 인터페이스:**

```typescript
// [v0.9] 갱신 에러 정보
interface RenewalError {
  status: number  // HTTP 상태 코드 (0 = fetch 실패)
  code: string    // 서버 에러 코드
}
```

**handleRenewalError 분기 테이블:**

| # | 에러 코드 | HTTP 상태 | 대응 전략 | 재시도 | 상태 전이 | 알림 |
|---|-----------|----------|----------|--------|----------|------|
| 1 | `RENEWAL_TOO_EARLY` | 400 | 30초 후 1회 재시도 (서버 시간 차이 보정) | 1회 | 유지 (`active`) | 없음 |
| 2 | `RENEWAL_LIMIT_REACHED` | 403 | 갱신 포기, 현재 토큰으로 만료까지 사용 | 없음 | 유지 (`active`) | 데몬이 SESSION_EXPIRING_SOON 자동 발송 (NOTI-01) |
| 3 | `SESSION_ABSOLUTE_LIFETIME_EXCEEDED` | 403 | 갱신 포기, 현재 토큰으로 만료까지 사용 | 없음 | 유지 (`active`) | 데몬이 SESSION_EXPIRING_SOON 자동 발송 (NOTI-01) |
| 4 | `NETWORK_ERROR` | 0 (fetch 실패) | 60초 후 재시도, 최대 3회 | 최대 3회 | 3회 실패 시 `error` | 없음 (일시적) |
| 5 | `AUTH_TOKEN_EXPIRED` 등 401 | 401 | `handleUnauthorized()` 호출 (lazy reload) | 조건부 | 조건부 (`expired`/`active`) | 없음 |

**handleRenewalError 메서드 설계:**

```typescript
// [v0.9] SessionManager 내부 메서드
// 5종 갱신 실패 에러 분기 처리

private handleRenewalError(error: RenewalError): void {
  switch (error.code) {
    // ── 에러 #1: RENEWAL_TOO_EARLY ──
    case 'RENEWAL_TOO_EARLY':
      // 원인: 서버-클라이언트 시간 차이로 60% 미달
      // 30초 대기 후 1회만 재시도 (무한 루프 방지)
      // 2회째도 TOO_EARLY면 다음 정규 스케줄까지 대기
      console.error(
        '[waiaas-mcp] Renewal too early. Retrying in 30s (1 attempt).',
      )
      this.retryRenewal(30_000, 1)
      break

    // ── 에러 #2: RENEWAL_LIMIT_REACHED ──
    case 'RENEWAL_LIMIT_REACHED':
      // 갱신 스케줄 중단 (타이머 설정 없음)
      // 현재 토큰으로 잔여 TTL만큼 사용
      // SESSION_EXPIRING_SOON 알림은 데몬이 자동 처리 (Phase 36-02, NOTI-01)
      // MCP SessionManager는 알림을 직접 발송하지 않음
      console.error(
        '[waiaas-mcp] Renewal limit reached. ' +
        'Session will expire naturally.',
      )
      break

    // ── 에러 #3: SESSION_ABSOLUTE_LIFETIME_EXCEEDED ──
    case 'SESSION_ABSOLUTE_LIFETIME_EXCEEDED':
      // 절대 수명 초과. 갱신 포기
      // 데몬이 SESSION_EXPIRING_SOON 알림 자동 발송 (NOTI-01)
      console.error(
        '[waiaas-mcp] Absolute lifetime exceeded. ' +
        'Session will expire naturally.',
      )
      break

    // ── 에러 #4: NETWORK_ERROR ──
    case 'NETWORK_ERROR':
      // 데몬 프로세스 미응답 또는 네트워크 단절
      // 60초 간격, 최대 3회
      // 3회 실패 → state = 'error'
      // error 상태에서도 getToken()은 현재 토큰 반환 (유효 기간 내라면 사용 가능)
      console.error(
        '[waiaas-mcp] Network error. Retrying in 60s (max 3 attempts).',
      )
      this.retryRenewal(60_000, 3)
      break

    // ── 에러 #5: AUTH_TOKEN_EXPIRED 또는 기타 401 ──
    default:
      if (error.status === 401) {
        // handleUnauthorized()로 lazy reload 시도
        this.handleUnauthorized().then(canRetry => {
          if (canRetry) {
            // 외부 갱신 감지 → 새 토큰으로 갱신 재시도
            this.renew()
          }
          // canRetry === false: handleUnauthorized 내부에서 state 변경 완료
        })
      } else {
        // 알 수 없는 에러
        console.error(
          `[waiaas-mcp] Unknown renewal error: ${error.code} ` +
          `(HTTP ${error.status}). Entering error state.`,
        )
        this.state = 'error'
      }
      break
  }
}
```

**retryRenewal 메서드 설계:**

```typescript
// [v0.9] 갱신 재시도 -- safeSetTimeout + 최대 횟수 제한

private retryRenewal(
  delayMs: number,
  maxRetries: number,
  attempt: number = 0,
): void {
  if (attempt >= maxRetries) {
    console.error(
      `[waiaas-mcp] Renewal failed after ${maxRetries} retries. ` +
      `Entering error state.`,
    )
    this.state = 'error'
    return
  }

  this.timer = safeSetTimeout(() => {
    this.renew().catch(() => {
      this.retryRenewal(delayMs, maxRetries, attempt + 1)
    })
  }, delayMs)
  this.timer.unref()
}
```

**에러별 상세 설명:**

**#1 RENEWAL_TOO_EARLY 재시도:**
- 원인: 서버-클라이언트 시간 차이로 safety guard(잔여 50% 이하) 미충족
- 30초 대기 후 1회만 재시도 (무한 루프 방지)
- 2회째도 TOO_EARLY면 retryRenewal이 `state = 'error'` 설정하지만, 실제로는 다음 정규 스케줄에서 재시도 가능 (renew 내부에서 scheduleRenewal 호출)
- **주의:** TOO_EARLY는 retryRenewal의 catch에서 다시 handleRenewalError를 호출하므로, 무한 재귀 방지를 위해 maxRetries=1로 제한

**#2 RENEWAL_LIMIT_REACHED / #3 LIFETIME_EXCEEDED:**
- 갱신 스케줄 중단 (타이머 설정 없음)
- 현재 토큰으로 잔여 TTL만큼 사용
- SESSION_EXPIRING_SOON 알림은 데몬이 자동 처리 (Phase 36-02 설계, NOTI-01)
- MCP SessionManager는 알림을 **직접 발송하지 않음** (설계 결정 SM-13)

**#4 NETWORK_ERROR 재시도:**
- 데몬 프로세스 미응답 또는 localhost 연결 실패
- 60초 간격, 최대 3회
- 3회 실패 → `state = 'error'`
- `error` 상태에서도 `getToken()`은 현재 토큰 반환 (유효 기간 내라면 API 호출 자체는 가능)

**#5 401 lazy reload:**
- 이미 만료된 토큰으로 갱신 시도 시 401 수신
- `handleUnauthorized()` 호출로 파일에서 새 토큰 확인 (6.4.7 참조)
- 새 토큰 발견 시 교체 후 갱신 재시도
- 같은 토큰이면 진짜 만료 → `state = 'expired'`

> **설계 결정 SM-11:** 5종 에러 분기 -- TOO_EARLY 30초x1회, LIMIT/LIFETIME 포기, NETWORK 60초x3회, EXPIRED lazy reload. 각 에러의 재시도 횟수와 상태 전이가 명확히 정의됨.

> **설계 결정 SM-13:** MCP SessionManager는 알림을 직접 발송하지 않음. 데몬이 갱신 API 처리 시 자동으로 SESSION_EXPIRING_SOON 알림 발송 여부를 판단 (Phase 36-02, NOTI-01).

#### 6.4.7 [v0.9] Lazy 401 Reload -- handleUnauthorized (SMGR-06)

API 호출이 401을 반환할 때, 토큰 파일을 재로드하여 외부에서 갱신된 토큰(Telegram `/newsession` 또는 CLI `mcp refresh-token`으로 생성)을 감지하는 메커니즘이다.

**handleUnauthorized() 메서드 설계 (4-Step 절차):**

```typescript
// [v0.9] SessionManager 내부 메서드
// Lazy 401 Reload -- 파일 재로드 + 토큰 비교 + 교체/에러

async handleUnauthorized(): Promise<boolean> {
  console.error(
    '[waiaas-mcp] 401 received. Reloading token from file...',
  )

  // Step 1: 파일 재로드
  // readMcpToken = Phase 36-01 확정 @waiaas/core 유틸리티
  const fileToken = readMcpToken(this.tokenFilePath)

  // Step 2: 파일 없음 → error 상태
  if (!fileToken) {
    console.error(
      '[waiaas-mcp] Token file not found. Entering error state.',
    )
    this.state = 'error'
    return false
  }

  // Step 3: 파일 토큰 === 현재 토큰 → 진짜 만료
  if (fileToken === this.token) {
    console.error(
      '[waiaas-mcp] Token in file is same as current. ' +
      'Session truly expired.',
    )
    this.state = 'expired'
    return false
  }

  // Step 4: 파일 토큰 !== 현재 토큰 → 외부 갱신 감지
  console.error(
    '[waiaas-mcp] New token detected from file. Switching session.',
  )

  // 새 토큰 JWT 디코딩 (loadToken과 동일 절차)
  const jwt = fileToken.startsWith(TOKEN_PREFIX)
    ? fileToken.slice(TOKEN_PREFIX.length)
    : fileToken
  const payload = decodeJwt(jwt)

  const sid = (payload as Record<string, unknown>).sid as string | undefined
  const exp = payload.exp
  const iat = payload.iat

  if (!sid || typeof exp !== 'number' || typeof iat !== 'number') {
    console.error(
      '[waiaas-mcp] New token has invalid JWT. Entering error state.',
    )
    this.state = 'error'
    return false
  }

  // 내부 상태 교체
  this.token = fileToken
  this.sessionId = sid
  this.expiresAt = exp * 1000
  this.expiresIn = (exp - iat) * 1000
  this.renewalCount = 0          // 새 세션이므로 카운터 리셋
  this.maxRenewals = Infinity    // 첫 갱신 응답에서 업데이트
  this.state = 'active'

  // 갱신 스케줄 재설정
  this.scheduleRenewal()

  return true  // 재시도 가능
}
```

**4-Step 절차 플로우:**

```
401 수신 (tool handler API 호출 또는 renew 응답)
  |
  v
  Step 1: readMcpToken(파일) 재로드
  |
  +-- 파일 없음 ──> Step 2: state = 'error', return false
  |
  +-- 파일 있음
       |
       +-- 파일 토큰 === 현재 토큰 ──> Step 3: state = 'expired', return false
       |                                         (진짜 만료)
       |
       +-- 파일 토큰 !== 현재 토큰 ──> Step 4: 외부 갱신 감지
            |
            v
            JWT 디코딩 + 내부 상태 교체
            + scheduleRenewal() 재설정
            + return true (재시도 가능)
```

**호출 시점:**

| 호출자 | 상황 | 설명 |
|--------|------|------|
| `handleRenewalError()` | 갱신 API 401 응답 | 갱신 중 토큰 만료 감지 |
| tool handler (Phase 38) | API 호출 401 응답 | tool 실행 중 토큰 만료 감지. Phase 38에서 상세 통합 설계 |

**외부 갱신 시나리오:**

```
시나리오 A: CLI에서 토큰 교체
  Owner: waiaas mcp refresh-token --agent-id trading-bot
    → 새 세션 생성 → mcp-token 파일 교체
    → SessionManager의 현재 토큰은 구 세션
    → 다음 API 호출 → 401 수신
    → handleUnauthorized() → 파일 재로드 → 새 토큰 감지 → 교체
    → API 재시도 → 성공

시나리오 B: Telegram에서 새 세션
  Owner: /newsession → 에이전트 선택 → 새 세션 생성
    → mcp-token 파일 교체
    → (동일 플로우)
```

**로그 출력:**

| 상황 | 로그 메시지 |
|------|-----------|
| 파일 재로드 시도 | `[waiaas-mcp] 401 received. Reloading token from file...` |
| 새 토큰 감지 | `[waiaas-mcp] New token detected from file. Switching session.` |
| 진짜 만료 | `[waiaas-mcp] Token in file is same as current. Session truly expired.` |
| 파일 없음 | `[waiaas-mcp] Token file not found. Entering error state.` |
| 새 토큰 JWT 에러 | `[waiaas-mcp] New token has invalid JWT. Entering error state.` |

> **설계 결정 SM-12:** `handleUnauthorized` 4-step (파일 재로드 -> 비교 -> 교체/에러). `fs.watch` 미사용, lazy reload 방식으로 플랫폼별 불안정성 회피.

> **Phase 36 연결:** `readMcpToken()` 함수는 Phase 36-01에서 확정된 `@waiaas/core` `utils/token-file.ts`의 공유 유틸리티이다. symlink 거부, 형식 검증이 내장되어 있으므로 handleUnauthorized에서 추가 검증 불필요.

> **Phase 36-02 연결:** SESSION_EXPIRING_SOON 알림은 데몬이 갱신 API 처리 시 자동 발송한다 (NOTI-01). MCP SessionManager가 RENEWAL_LIMIT_REACHED/LIFETIME_EXCEEDED를 수신해도 별도 알림 호출 없이 로그만 출력한다.

### 6.5 [v0.9] SessionManager MCP 통합 설계 (Phase 38)

Phase 37에서 확정된 SessionManager(getToken/start/dispose, 9개 내부 상태, 5개 내부 메서드)를 MCP tool/resource handler와 실제로 통합하기 위한 설계이다. MCP SDK v1.x에 미들웨어/hook 시스템이 없으므로, 모든 데몬 API 호출을 캡슐화하는 **ApiClient 래퍼 클래스**를 도입하여 인증 헤더 관리, 401 자동 재시도, 세션 만료 graceful 응답을 한 곳에 집중시킨다.

**Phase 38 목표:**
1. **ApiClient 래퍼 클래스** -- 9개 handler(6 tool + 3 resource)의 인증/재시도/에러 처리를 단일 클래스에 캡슐화 (SMGI-01)
2. **Tool handler 통합** -- 기존 환경변수+직접 fetch 패턴을 apiClient.get()/post() + toToolResult() 공통 변환으로 리팩토링
3. **Resource handler 통합** -- 동일 ApiClient + toResourceResult() 패턴으로 리소스 핸들러도 통합

#### 6.5.1 [v0.9] SessionManager.getState() 추가 (Phase 38 확장)

Phase 37에서 `state` 필드가 private으로 정의되었으나(SM-03), ApiClient가 API 호출 전 세션 상태를 사전 확인하려면 public 접근이 필요하다.

**getState() public 메서드:**

| 항목 | 내용 |
|------|------|
| 시그니처 | `getState(): SessionState` |
| 반환 타입 | `'active' \| 'expired' \| 'error'` |
| 동작 | 현재 내부 `state` 필드를 그대로 반환 (순수 getter, 부수효과 없음) |
| 호출자 | `ApiClient.request()` -- API 호출 전 세션 상태 확인용 |

```typescript
// SessionManager에 추가되는 4번째 public 메서드
getState(): SessionState {
  return this.state
}
```

> **설계 결정 SMGI-D01:** `getState()`를 4번째 public 메서드로 추가. Phase 37의 3-public(getToken/start/dispose)에서 4-public(getToken/getState/start/dispose)으로 확장. Research Open Question 1 해결.

> **섹션 6.4.1 업데이트 노트:** Phase 38에서 getState() public 메서드가 추가되어 Public 메서드 테이블이 3개에서 4개로 확장된다. 전체 Public 메서드는 getToken, getState, start, dispose이다.

**Public 메서드 4개 (Phase 38 확장 후):**

| 메서드 | 시그니처 | 설명 |
|--------|---------|------|
| `getToken()` | `getToken(): string` | 현재 유효 토큰 반환. 갱신 중에도 구 토큰 반환 (SM-14) |
| `getState()` | `getState(): SessionState` | 현재 세션 상태 반환 (`'active' \| 'expired' \| 'error'`). Phase 38 추가 (SMGI-D01) |
| `start()` | `async start(): Promise<void>` | loadToken() + scheduleRenewal(). 프로세스 시작 시 1회 호출 |
| `dispose()` | `dispose(): void` | clearTimeout(timer) + 정리. SIGTERM 시 호출 |

#### 6.5.2 [v0.9] ApiClient 래퍼 클래스 설계 (SMGI-01)

**파일 위치:** `packages/mcp/src/internal/api-client.ts`

모든 MCP tool/resource handler가 데몬 REST API를 호출할 때 사용하는 공통 래퍼 클래스이다. 개별 handler는 인증 헤더, 401 재시도, 세션 만료 처리를 직접 다루지 않고 ApiClient에 위임한다.

##### 6.5.2.1 ApiResult<T> Discriminated Union 타입

```typescript
/**
 * [v0.9] ApiClient 응답 타입 -- 4종 분기 discriminated union
 * 모든 ApiClient 메서드의 반환 타입
 */
type ApiResult<T = unknown> =
  | { ok: true; data: T; status: number }                                    // 성공 (2xx)
  | { ok: false; error: { code: string; message: string }; status: number }  // API 에러 (4xx/5xx)
  | { ok: false; expired: true }                                             // 세션 만료/에러 상태
  | { ok: false; networkError: true }                                        // 네트워크 에러 (ECONNREFUSED 등)
```

**4종 분기 설명:**

| 분기 | 조건 | 설명 | 후속 처리 |
|------|------|------|-----------|
| 성공 | `ok: true` | 데몬 API가 2xx를 반환 | `data`를 JSON.stringify하여 tool result로 반환 |
| API 에러 | `ok: false, error` | 데몬 API가 4xx/5xx를 반환 (400 Bad Request, 403 Forbidden 등) | `isError: true`로 tool result 반환 |
| 세션 만료 | `ok: false, expired: true` | SessionManager가 expired/error 상태이거나, 401 복구 실패 | `isError` 미설정으로 안내 메시지 반환 (H-04) |
| 네트워크 에러 | `ok: false, networkError: true` | fetch 자체가 throw (ECONNREFUSED, DNS 실패 등) | `isError` 미설정으로 안내 메시지 반환 |

##### 6.5.2.2 ApiClient 클래스 인터페이스

```typescript
class ApiClient {
  constructor(sessionManager: SessionManager, baseUrl: string)

  // ── Public 메서드 (3개) ──
  async get<T>(path: string): Promise<ApiResult<T>>              // GET 요청
  async post<T>(path: string, body?: unknown): Promise<ApiResult<T>>  // POST 요청
  async put<T>(path: string, body?: unknown): Promise<ApiResult<T>>   // PUT 요청

  // ── Private 메서드 (4개) ──
  private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>>
  private async handle401<T>(method: string, path: string, originalToken: string, body?: unknown): Promise<ApiResult<T>>
  private async doFetch(method: string, path: string, token: string, body?: unknown): Promise<Response>
  private parseResponse<T>(res: Response): Promise<ApiResult<T>>
}
```

**메서드 요약:**

| # | 메서드 | 가시성 | 역할 |
|---|--------|--------|------|
| 1 | `get<T>(path)` | public | GET 요청. `request('GET', path)` 위임 |
| 2 | `post<T>(path, body?)` | public | POST 요청. `request('POST', path, body)` 위임 |
| 3 | `put<T>(path, body?)` | public | PUT 요청. `request('PUT', path, body)` 위임 |
| 4 | `request<T>(method, path, body?)` | private | 공통 요청 처리. 7-step 절차 |
| 5 | `handle401<T>(method, path, originalToken, body?)` | private | 401 재시도. 3-step 절차 |
| 6 | `doFetch(method, path, token, body?)` | private | 실제 fetch 호출 |
| 7 | `parseResponse<T>(res)` | private | Response -> ApiResult 변환 |

##### 6.5.2.3 request() 메서드 7-Step 절차

| Step | 동작 | 실패 시 | 참조 |
|------|------|---------|------|
| 1 | `getState()` 확인 | `expired` 또는 `error`이면 즉시 `{ ok: false, expired: true }` 반환 | SMGI-D01 |
| 2 | `getToken()`으로 현재 토큰 획득 | - | SM-02 |
| 3 | `doFetch(method, path, token, body)`로 API 호출 | fetch throw 시 Step 6으로 | - |
| 4 | 401 응답이면 `handle401(method, path, token, body)` 호출 | handle401 결과 반환 | H-05 |
| 5 | 기타 응답이면 `parseResponse(res)` 호출 | 파싱 결과 반환 | - |
| 6 | fetch 실패(ECONNREFUSED 등)이면 `{ ok: false, networkError: true }` 반환 | - | Pitfall 3 |
| 7 | 결과 반환 | - | - |

##### 6.5.2.4 handle401() 메서드 3-Step 재시도 절차

| Step | 동작 | 설명 | 참조 |
|------|------|------|------|
| 1 | 50ms 대기 | 갱신 중일 수 있음. SM-14에서 갱신 중 getToken()은 구 토큰을 반환하므로 갱신 완료를 대기 | SM-14 |
| 2 | `getToken()` 재호출 + `originalToken`과 비교 | **다르면:** 갱신 완료. 새 토큰으로 `doFetch()` 1회 재시도 후 `parseResponse()` 반환. **같으면:** Step 3으로 | H-05 |
| 3 | `sessionManager.handleUnauthorized()` 호출 | **recovered=true:** 새 토큰으로 `doFetch()` 1회 재시도 후 반환. **recovered=false:** `{ ok: false, expired: true }` 반환 | SM-12 |

**handle401 플로우:**

```
401 수신
  |
  v
  Step 1: await 50ms (갱신 완료 대기)
  |
  v
  Step 2: getToken() 재호출
  |
  +-- token !== originalToken ──> 새 토큰으로 doFetch() 재시도 ──> parseResponse()
  |
  +-- token === originalToken ──> Step 3
       |
       v
       Step 3: handleUnauthorized() (파일 재로드)
       |
       +-- recovered: true ──> getToken() → doFetch() 재시도 → parseResponse()
       |
       +-- recovered: false ──> { ok: false, expired: true }
```

##### 6.5.2.5 parseResponse() 동작

| 응답 | 처리 | 반환 |
|------|------|------|
| 2xx | JSON 파싱 성공 | `{ ok: true, data: parsed, status: res.status }` |
| 4xx/5xx | JSON 파싱 성공 | `{ ok: false, error: { code: parsed.error?.code ?? 'UNKNOWN', message: parsed.error?.message ?? 'Unknown error' }, status: res.status }` |
| JSON 파싱 실패 | catch | `{ ok: false, error: { code: 'PARSE_ERROR', message: 'Failed to parse response' }, status: res.status }` |

##### 6.5.2.6 doFetch() 동작

```typescript
private async doFetch(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${this.baseUrl}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}
```

fetch 자체가 throw(ECONNREFUSED, DNS 실패, 타임아웃 등)하면 상위 `request()`의 try-catch에서 `{ ok: false, networkError: true }`로 변환한다.

##### 6.5.2.7 TypeScript 의사 코드 (전체)

```typescript
// packages/mcp/src/internal/api-client.ts
// [v0.9] Phase 38 -- MCP tool/resource handler 통합용 API 클라이언트
// 참조: 38-RESEARCH.md Example 1, SM-12, SM-14, H-04, H-05

import type { SessionManager } from '../session-manager.js'

// ── ApiResult discriminated union ──

type ApiResult<T = unknown> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: { code: string; message: string }; status: number }
  | { ok: false; expired: true }
  | { ok: false; networkError: true }

// ── ApiClient 클래스 ──

class ApiClient {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly baseUrl: string,
  ) {}

  // ── Public 메서드 ──

  async get<T>(path: string): Promise<ApiResult<T>> {
    return this.request<T>('GET', path)
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request<T>('POST', path, body)
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request<T>('PUT', path, body)
  }

  // ── Private: 공통 요청 처리 (7-Step) ──

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    // Step 1: 세션 상태 사전 확인 (SMGI-D01)
    const state = this.sessionManager.getState()
    if (state === 'expired' || state === 'error') {
      return { ok: false, expired: true }
    }

    try {
      // Step 2: 현재 토큰 획득
      const token = this.sessionManager.getToken()

      // Step 3: API 호출
      const res = await this.doFetch(method, path, token, body)

      // Step 4: 401 처리
      if (res.status === 401) {
        return await this.handle401<T>(method, path, token, body)
      }

      // Step 5: 응답 파싱
      return await this.parseResponse<T>(res)
    } catch (err) {
      // Step 6: 네트워크 에러
      console.error(
        `[waiaas-mcp:api-client] Network error: ${method} ${path}`,
        err,
      )
      return { ok: false, networkError: true }
    }
    // Step 7: 결과는 각 Step에서 직접 반환
  }

  // ── Private: 401 재시도 (3-Step) ──

  private async handle401<T>(
    method: string,
    path: string,
    originalToken: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    console.error(
      `[waiaas-mcp:api-client] 401 received for ${method} ${path}. ` +
      'Starting retry sequence.',
    )

    // Step 1: 50ms 대기 (갱신 중일 수 있음, SM-14)
    await new Promise(r => setTimeout(r, 50))

    // Step 2: 토큰 변경 확인
    const freshToken = this.sessionManager.getToken()
    if (freshToken !== originalToken) {
      // 갱신 완료됨 -- 새 토큰으로 1회 재시도
      console.error(
        '[waiaas-mcp:api-client] Token changed during wait. ' +
        'Retrying with fresh token.',
      )
      try {
        const retryRes = await this.doFetch(method, path, freshToken, body)
        return await this.parseResponse<T>(retryRes)
      } catch {
        return { ok: false, networkError: true }
      }
    }

    // Step 3: handleUnauthorized (파일 재로드, SM-12)
    console.error(
      '[waiaas-mcp:api-client] Token unchanged. ' +
      'Calling handleUnauthorized for file reload.',
    )
    const recovered = await this.sessionManager.handleUnauthorized()
    if (recovered) {
      const newToken = this.sessionManager.getToken()
      console.error(
        '[waiaas-mcp:api-client] Recovered via file reload. ' +
        'Retrying with new token.',
      )
      try {
        const retryRes = await this.doFetch(method, path, newToken, body)
        return await this.parseResponse<T>(retryRes)
      } catch {
        return { ok: false, networkError: true }
      }
    }

    // 복구 실패
    console.error(
      '[waiaas-mcp:api-client] Recovery failed. Session expired.',
    )
    return { ok: false, expired: true }
  }

  // ── Private: 실제 fetch 호출 ──

  private async doFetch(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  // ── Private: 응답 파싱 ──

  private async parseResponse<T>(res: Response): Promise<ApiResult<T>> {
    try {
      const data = await res.json()

      if (res.ok) {
        return { ok: true, data: data as T, status: res.status }
      }

      // API 에러 (4xx/5xx)
      const error = data.error ?? data
      return {
        ok: false,
        error: {
          code: error.code ?? 'UNKNOWN',
          message: error.message ?? 'Unknown error',
        },
        status: res.status,
      }
    } catch {
      // JSON 파싱 실패
      return {
        ok: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Failed to parse response body as JSON',
        },
        status: res.status,
      }
    }
  }
}

export { ApiClient, type ApiResult }
```

##### 6.5.2.8 console.error 통일 규칙

| 규칙 | 내용 |
|------|------|
| 출력 대상 | `console.error` 전용 (stdout 오염 방지, Pitfall 4) |
| 로그 접두사 | `[waiaas-mcp:api-client]` |
| 사용 금지 | `console.log`, `console.info`, `console.warn` |
| 근거 | MCP stdio transport에서 JSON-RPC 메시지만 stdout으로 전달되어야 함. 로그가 stdout에 출력되면 Claude Desktop의 JSON 파서가 깨짐 |

**로그 메시지 목록:**

| 상황 | 메시지 |
|------|--------|
| 네트워크 에러 | `[waiaas-mcp:api-client] Network error: {method} {path}` |
| 401 수신 | `[waiaas-mcp:api-client] 401 received for {method} {path}. Starting retry sequence.` |
| 토큰 변경 감지 | `[waiaas-mcp:api-client] Token changed during wait. Retrying with fresh token.` |
| 토큰 미변경 | `[waiaas-mcp:api-client] Token unchanged. Calling handleUnauthorized for file reload.` |
| 파일 재로드 복구 | `[waiaas-mcp:api-client] Recovered via file reload. Retrying with new token.` |
| 복구 실패 | `[waiaas-mcp:api-client] Recovery failed. Session expired.` |

> **참조:** 38-RESEARCH.md Pattern 1 (ApiClient 래퍼 패턴), Pattern 2 (Tool Handler에서 ApiClient 사용). SM-12 (handleUnauthorized 4-step), SM-14 (갱신 중 구 토큰 반환). v0.9-PITFALLS.md H-04 (isError 회피), H-05 (401 자동 재시도), Pitfall 4 (stdout 오염).

#### 6.5.3 [v0.9] Tool Handler 통합 패턴 (SMGI-01)

기존 tool handler(섹션 5.3.2~5.3.7)는 환경변수 `SESSION_TOKEN`을 직접 참조하고 `fetch`를 인라인 호출하는 구조이다. Phase 38에서 이를 `ApiClient.get()/post()` + `toToolResult()` 공통 변환 패턴으로 리팩토링한다.

##### 6.5.3.1 toToolResult() 공통 변환 함수

`ApiResult<T>`를 MCP SDK의 `CallToolResult` 타입으로 변환하는 함수이다. 4가지 분기를 처리한다.

| # | 분기 | isError | 응답 내용 | 근거 |
|---|------|---------|-----------|------|
| (a) | `expired: true` | **미설정** | `{ status: 'session_expired', message: '...', retryable: true }` | H-04: Claude Desktop 연결 해제 방지 |
| (b) | `networkError: true` | **미설정** | `{ status: 'daemon_unavailable', message: '...', retryable: true }` | 일시적 에러, 연결 유지 |
| (c) | `ok: false` (API 에러) | `true` | `{ error: true, code, message }` | 클라이언트/서버 에러는 isError 적합 |
| (d) | `ok: true` (성공) | 미설정 | `JSON.stringify(data)` | 정상 응답 |

**핵심 설계: (a), (b)에서 `isError`를 설정하지 않는다.** Claude Desktop은 반복적인 `isError: true` 응답을 감지하면 MCP 서버 연결을 해제할 수 있다 (H-04). 세션 만료와 네트워크 에러는 MCP 서버 자체의 오류가 아니므로 정상 응답으로 안내 메시지를 반환하여 LLM이 사용자에게 상황을 설명하도록 한다.

```typescript
// packages/mcp/src/internal/tool-result.ts
// [v0.9] Phase 38 -- H-04 대응: ApiResult -> CallToolResult 변환

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ApiResult } from './api-client.js'

function toToolResult<T>(result: ApiResult<T>): CallToolResult {
  // (a) 세션 만료/에러 -- isError 미설정
  if ('expired' in result && result.expired) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'session_expired',
          message: 'Session has expired. The owner has been notified. '
            + 'Please try again in a few minutes after a new session is created.',
          retryable: true,
        }),
      }],
      // isError를 설정하지 않음! Claude Desktop 연결 해제 방지 (H-04)
    }
  }

  // (b) 네트워크 에러 -- isError 미설정 (일시적)
  if ('networkError' in result && result.networkError) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'daemon_unavailable',
          message: 'WAIaaS daemon is not responding. '
            + 'Please check if the daemon is running.',
          retryable: true,
        }),
      }],
    }
  }

  // (c) API 에러 (400, 403 등) -- isError 설정
  if (!result.ok) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: true,
          code: result.error.code,
          message: result.error.message,
        }),
      }],
      isError: true,
    }
  }

  // (d) 성공
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result.data),
    }],
  }
}

export { toToolResult }
```

##### 6.5.3.2 Tool Handler Factory 패턴

각 tool을 `registerXxx(server: McpServer, apiClient: ApiClient): void` 형태의 독립 함수로 모듈화한다. 기존 패턴에서 `apiClient` 파라미터가 추가되고, 내부 구현이 ApiClient + toToolResult로 단순화된다.

**6개 Tool Handler 리팩토링 전후 비교:**

| # | Tool | Before (v0.2: 환경변수 + 직접 fetch) | After (v0.9: ApiClient + toToolResult) |
|---|------|---------------------------------------|----------------------------------------|
| 1 | `send_token` | `process.env.WAIAAS_SESSION_TOKEN` + `fetch(POST)` + 인라인 에러 분기 | `apiClient.post('/v1/transactions/send', body)` + `toToolResult(result)` |
| 2 | `get_balance` | `SESSION_TOKEN` + `fetch(GET)` + 인라인 에러 | `apiClient.get('/v1/wallet/balance')` + `toToolResult(result)` |
| 3 | `get_address` | `SESSION_TOKEN` + `fetch(GET)` + 인라인 에러 | `apiClient.get('/v1/wallet/address')` + `toToolResult(result)` |
| 4 | `list_transactions` | `SESSION_TOKEN` + `fetch(GET)` + 쿼리 파라미터 조립 + 인라인 에러 | `apiClient.get('/v1/transactions?...')` + `toToolResult(result)` |
| 5 | `get_transaction` | `SESSION_TOKEN` + `fetch(GET)` + 인라인 에러 | `` apiClient.get(`/v1/transactions/${id}`) `` + `toToolResult(result)` |
| 6 | `get_nonce` | `SESSION_TOKEN` + `fetch(GET)` + 인라인 에러 | `apiClient.get('/v1/nonce')` + `toToolResult(result)` |

**코드 변화 요약:**
- 각 handler에서 `Authorization` 헤더 설정, `res.ok` 분기, `isError` 판단 로직 제거
- 인증/재시도/만료 처리가 ApiClient에 위임되어 handler 코드 ~50% 감소
- **기존 도구 이름, 파라미터, 설명은 변경 없음** (MCP 호환성 유지)

**send_token 리팩토링 예시 (가장 복잡한 케이스):**

```typescript
// packages/mcp/src/tools/send-token.ts
// [v0.9] Phase 38 리팩토링 -- ApiClient 사용

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from '../internal/api-client.js'
import { toToolResult } from '../internal/tool-result.js'

export function registerSendToken(
  server: McpServer,
  apiClient: ApiClient,
): void {
  server.tool(
    'send_token',
    'Send SOL or tokens from the agent wallet to a destination address. ' +
    'Amount is in the smallest unit (lamports for SOL: 1 SOL = 1_000_000_000 lamports). ' +
    'Returns transaction ID and status. INSTANT tier returns CONFIRMED with txHash, ' +
    'DELAY/APPROVAL tier returns QUEUED for owner action.',
    {
      to: z.string().describe('Destination wallet address (Solana: base58, EVM: 0x hex)'),
      amount: z.string().describe('Amount in smallest unit (lamports/wei as string)'),
      memo: z.string().optional().describe('Optional transaction memo (max 200 chars)'),
      priority: z.enum(['low', 'medium', 'high']).optional()
        .describe('Fee priority: low=minimum, medium=average, high=maximum. Default: medium'),
    },
    async ({ to, amount, memo, priority }) => {
      const body: Record<string, unknown> = { to, amount }
      if (memo) body.memo = memo
      if (priority) body.priority = priority

      const result = await apiClient.post('/v1/transactions/send', body)
      return toToolResult(result)
    },
  )
}
```

**get_balance 리팩토링 예시 (단순 GET):**

```typescript
// packages/mcp/src/tools/get-balance.ts
// [v0.9] Phase 38 리팩토링

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from '../internal/api-client.js'
import { toToolResult } from '../internal/tool-result.js'

export function registerGetBalance(
  server: McpServer,
  apiClient: ApiClient,
): void {
  server.tool(
    'get_balance',
    'Get the current balance of the agent wallet. ' +
    'Returns balance in smallest unit (lamports/wei), decimals, symbol, and formatted string.',
    {},
    async () => {
      const result = await apiClient.get('/v1/wallet/balance')
      return toToolResult(result)
    },
  )
}
```

##### 6.5.3.3 createMcpServer() 함수 설계

MCP Server 생성과 tool/resource 등록을 캡슐화하는 팩토리 함수이다. ApiClient를 DI 패턴으로 전달받아 6개 tool + 3개 resource를 등록한다.

```typescript
// packages/mcp/src/server.ts
// [v0.9] Phase 38 -- MCP Server 팩토리 + DI

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from './internal/api-client.js'

// Tool handlers
import { registerSendToken } from './tools/send-token.js'
import { registerGetBalance } from './tools/get-balance.js'
import { registerGetAddress } from './tools/get-address.js'
import { registerListTransactions } from './tools/list-transactions.js'
import { registerGetTransaction } from './tools/get-transaction.js'
import { registerGetNonce } from './tools/get-nonce.js'

// Resource handlers (Phase 38에서 동일 패턴 적용)
import { registerWalletBalance } from './resources/wallet-balance.js'
import { registerWalletAddress } from './resources/wallet-address.js'
import { registerSystemStatus } from './resources/system-status.js'

export function createMcpServer(apiClient: ApiClient): McpServer {
  const server = new McpServer({
    name: 'waiaas-mcp',
    version: '0.2.0',
  })

  // 6개 Tool 등록
  registerSendToken(server, apiClient)
  registerGetBalance(server, apiClient)
  registerGetAddress(server, apiClient)
  registerListTransactions(server, apiClient)
  registerGetTransaction(server, apiClient)
  registerGetNonce(server, apiClient)

  // 3개 Resource 등록
  registerWalletBalance(server, apiClient)
  registerWalletAddress(server, apiClient)
  registerSystemStatus(server, apiClient)

  return server
}
```

**DI 패턴의 이점:**
- 테스트 시 mock ApiClient 주입 가능
- ApiClient 생성 책임이 index.ts(엔트리포인트)에 집중
- tool/resource handler가 SessionManager에 직접 의존하지 않음

##### 6.5.3.4 기존 섹션 5.3 코드와의 관계

| 항목 | 설명 |
|------|------|
| 기존 5.3.2~5.3.7 | v0.2 원본 설계. 환경변수 + 직접 fetch 패턴 |
| v0.9 리팩토링 | ApiClient 기반으로 전환. 코드 라인 수 ~50% 감소 |
| 호환성 | **기존 도구 이름, 파라미터, 설명 등은 변경 없음**. MCP 프로토콜 수준의 호환성 완전 유지 |
| 동작 차이 | 401 자동 재시도, 세션 만료 시 isError 회피 (v0.2에서는 isError: true) |
| 기존 코드 유지 | v0.2 구현 코드는 참조용으로 유지. v0.9 리팩토링 코드가 실제 구현 기준 |

#### 6.5.4 [v0.9] Resource Handler 통합 패턴 (SMGI-01)

MCP Resource(섹션 5.4.1~5.4.3)도 동일한 ApiClient 패턴을 적용한다. Resource는 tool과 달리 `isError` 개념이 없고 `contents` 배열로 반환하므로, 별도의 `toResourceResult()` 변환 함수를 사용한다.

##### 6.5.4.1 toResourceResult() 공통 변환 함수

`ApiResult<T>`를 MCP SDK의 `ReadResourceResult` 타입으로 변환한다.

| # | 분기 | 응답 내용 | 설명 |
|---|------|-----------|------|
| (a) | `expired: true` | 안내 텍스트: "Session expired. Please create a new session..." | 만료 안내가 resource 내용 자체가 됨 |
| (b) | `networkError: true` | 안내 텍스트: "WAIaaS daemon is not responding..." | 데몬 미응답 안내 |
| (c) | `ok: true` | `JSON.stringify(data)` | 정상 데이터 |
| (d) | `ok: false` (API 에러) | `JSON.stringify({ error: true, code, message })` | 에러 JSON 텍스트 |

**Resource는 `isError` 개념이 없다.** MCP Resource의 `ReadResourceResult`는 `contents` 배열을 반환하며, 에러 플래그가 존재하지 않는다. 따라서 만료/에러 시에도 안내 텍스트가 resource 내용으로 직접 반환된다. LLM이 이 텍스트를 컨텍스트로 읽고 상황을 파악한다.

```typescript
// packages/mcp/src/internal/resource-result.ts
// [v0.9] Phase 38 -- ApiResult -> ReadResourceResult 변환

import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import type { ApiResult } from './api-client.js'

function toResourceResult<T>(
  result: ApiResult<T>,
  uri: string,
): ReadResourceResult {
  // (a) 세션 만료/에러
  if ('expired' in result && result.expired) {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          status: 'session_expired',
          message: 'Session expired. Please create a new session '
            + 'via CLI (waiaas mcp setup) or Telegram (/newsession).',
        }),
      }],
    }
  }

  // (b) 네트워크 에러
  if ('networkError' in result && result.networkError) {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          status: 'daemon_unavailable',
          message: 'WAIaaS daemon is not responding. '
            + 'Please check if the daemon is running.',
        }),
      }],
    }
  }

  // (c) 성공
  if (result.ok) {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(result.data),
      }],
    }
  }

  // (d) API 에러
  return {
    contents: [{
      uri,
      mimeType: 'application/json',
      text: JSON.stringify({
        error: true,
        code: result.error.code,
        message: result.error.message,
      }),
    }],
  }
}

export { toResourceResult }
```

##### 6.5.4.2 3개 Resource Handler 리팩토링

| # | Resource | API 경로 | 변환 |
|---|----------|----------|------|
| 1 | `wallet-balance` | `apiClient.get('/v1/wallet/balance')` | `toResourceResult(result, uri.href)` |
| 2 | `wallet-address` | `apiClient.get('/v1/wallet/address')` | `toResourceResult(result, uri.href)` |
| 3 | `system-status` | `apiClient.get('/v1/system/status')` | `toResourceResult(result, uri.href)` |

**대표 예시: wallet-balance 리팩토링:**

```typescript
// packages/mcp/src/resources/wallet-balance.ts
// [v0.9] Phase 38 리팩토링 -- ApiClient 사용

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from '../internal/api-client.js'
import { toResourceResult } from '../internal/resource-result.js'

export function registerWalletBalance(
  server: McpServer,
  apiClient: ApiClient,
): void {
  server.resource(
    'wallet-balance',
    'waiaas://wallet/balance',
    {
      description: 'Current balance of the agent wallet. Returns balance in lamports/wei, ' +
        'human-readable format, chain, and network.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const result = await apiClient.get('/v1/wallet/balance')
      return toResourceResult(result, uri.href)
    },
  )
}
```

**기존 5.4.1 코드와의 비교:** 기존 코드에서 `fetch` + `SESSION_TOKEN` + `res.ok` 분기 + 인라인 에러 처리가 모두 제거되고, `apiClient.get()` + `toResourceResult()` 2줄로 대체된다.

##### 6.5.4.3 Open Question 해결 기록

Phase 38 설계 과정에서 38-RESEARCH.md의 Open Question들을 다음과 같이 해결하였다:

| # | Open Question | 해결 방법 | 결정 ID |
|---|---------------|-----------|---------|
| 1 | SessionManager.getState() public 메서드 추가 여부 | `getState(): SessionState` 4번째 public 메서드로 추가 | SMGI-D01 (섹션 6.5.1) |
| 3 | Resource handler의 세션 만료 처리 | 동일 ApiClient + toResourceResult() 패턴. 만료 시 안내 텍스트를 resource 내용으로 반환 | 섹션 6.5.4.1 |
| 4 | previous_token_hash 유예 기간 (H-05 데몬 측 대응) | v0.9에서는 MCP 측 401 재시도로 대응 (ApiClient handle401). 데몬 측 유예 기간은 EXT-04로 이연 확정 | 섹션 6.5.2.4 |

> **Open Question 2 (에러 복구 루프):** SessionManager에 `startRecoveryLoop()` 추가는 Phase 38-02에서 설계 예정 (SMGI-03 프로세스 생명주기).

---

## 7. MCP Transport 설계

### 7.1 stdio Transport (기본, v0.2)

WAIaaS MCP Server는 **stdio transport**를 기본으로 사용한다. Claude Desktop, Cursor 등 데스크톱 AI 도구가 MCP 서버를 자식 프로세스로 실행하고, stdin/stdout을 통해 JSON-RPC 메시지를 교환한다.

```typescript
// packages/mcp/src/index.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from './server.js'

const server = createMcpServer()
const transport = new StdioServerTransport()

await server.connect(transport)
```

**stdio 선택 근거:**
- Claude Desktop, Cursor, Windsurf 등 주요 AI 도구가 stdio를 기본 지원
- localhost 전용 WAIaaS 데몬과 동일 머신에서 실행 -- 네트워크 필요 없음
- 설정이 단순 (command + args + env만 지정)
- 보안: 프로세스 간 통신이므로 네트워크 노출 없음

### 7.2 Streamable HTTP Transport (v0.3 확장)

v0.3에서 원격 MCP 클라이언트를 위한 Streamable HTTP transport를 추가할 수 있다.

```typescript
// v0.3 확장 -- packages/mcp/src/transports/http.ts (미래)
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from '../server.js'

// Hono 라우트로 MCP Streamable HTTP 노출
// 주의: localhost 전용, 외부 네트워크 미노출
app.all('/mcp', async (c) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,  // stateless
  })
  const server = createMcpServer()
  await server.connect(transport)
  return transport.handleRequest(c.req.raw)
})
```

**v0.3 Streamable HTTP 사용 시나리오:**
- Docker 컨테이너 내부에서 MCP Server 실행
- SSH 터널을 통한 원격 MCP 클라이언트 연결
- 웹 기반 AI 도구에서 HTTP를 통한 MCP 연결

**v0.2에서는 미구현.** stdio만 공식 지원하며, Streamable HTTP는 설계만 문서화.

---

## 8. Claude Desktop 통합 시나리오 -- MCP-02

### 8.1 통합 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│ Claude Desktop                                            │
│                                                           │
│  ┌────────────────┐     ┌───────────────────────────────┐│
│  │ Claude LLM      │     │ MCP Client (내장)             ││
│  │                 │◄───►│ - Tool discovery               ││
│  │ "잔액 확인해줘" │     │ - Tool invocation              ││
│  │                 │     │ - Resource reading             ││
│  └────────────────┘     └──────────────┬────────────────┘│
│                                         │ stdio (JSON-RPC) │
│                          ┌──────────────┴────────────────┐│
│                          │ @waiaas/mcp (자식 프로세스)     ││
│                          │ - 6 Tools + 3 Resources         ││
│                          │ - WAIAAS_SESSION_TOKEN env      ││
│                          └──────────────┬────────────────┘│
│                                         │ HTTP localhost    │
│                          ┌──────────────┴────────────────┐│
│                          │ WAIaaS Daemon                   ││
│                          │ http://127.0.0.1:3100           ││
│                          └────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### 8.2 사용자 시나리오

#### 시나리오 1: 잔액 확인

```
사용자: "내 에이전트 지갑 잔액 확인해줘"

Claude: [MCP tool: get_balance 호출]

응답: 에이전트 지갑 잔액은 1.5 SOL (1,500,000,000 lamports)입니다.
- 체인: Solana
- 네트워크: mainnet-beta
```

#### 시나리오 2: 토큰 전송

```
사용자: "So1111...1112 주소로 0.5 SOL 보내줘"

Claude: [MCP tool: send_token 호출]
  to: "So11111111111111111111111111111112"
  amount: "500000000"

응답: 전송이 완료되었습니다.
- 트랜잭션 ID: 019502c0-1a2b-3c4d-5e6f-abcdef012345
- 상태: CONFIRMED
- 온체인 해시: 4vJ9JU1bJJE96FW...
- 티어: INSTANT
```

#### 시나리오 3: 거래 이력 확인

```
사용자: "최근 거래 내역 보여줘"

Claude: [MCP tool: list_transactions 호출]
  limit: 5
  order: "desc"

응답: 최근 5건의 거래 내역입니다:

| # | 상태 | 금액 | 수신자 | 시간 |
|---|------|------|--------|------|
| 1 | CONFIRMED | 0.5 SOL | So111...112 | 2분 전 |
| 2 | CONFIRMED | 1.0 SOL | DezX...B263 | 1시간 전 |
| 3 | FAILED | 2.0 SOL | 7xKX...gAsU | 3시간 전 |
```

#### 시나리오 4: 대기 거래 + APPROVAL 티어

```
사용자: "50 SOL을 DezX...B263 주소로 보내줘"

Claude: [MCP tool: send_token 호출]
  to: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
  amount: "50000000000"

응답: 이 거래는 APPROVAL 티어로 분류되어 Owner 승인이 필요합니다.
- 트랜잭션 ID: 019502c0-1a2b-3c4d-5e6f-abcdef012345
- 상태: QUEUED
- 티어: APPROVAL
- 승인 기한: 1시간

Tauri Desktop 또는 CLI에서 Owner 서명으로 승인해 주세요.
```

### 8.3 설정 단계 (사용자 가이드)

1. **WAIaaS 데몬 실행 확인**

```bash
waiaas status
# 출력: WAIaaS daemon running on http://127.0.0.1:3100
```

2. **MCP 전용 세션 토큰 발급**

```bash
waiaas session create --agent-id <agent-uuid> --expires-in 604800
# 출력: wai_sess_eyJhbGciOiJIUzI1NiIs...
```

3. **Claude Desktop 설정 파일 수정**

```bash
# macOS
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

4. **MCP 서버 항목 추가**

```json
{
  "mcpServers": {
    "waiaas-wallet": {
      "command": "npx",
      "args": ["@waiaas/mcp"],
      "env": {
        "WAIAAS_SESSION_TOKEN": "wai_sess_eyJhbGciOiJIUzI1NiIs...",
        "WAIAAS_BASE_URL": "http://127.0.0.1:3100"
      }
    }
  }
}
```

5. **Claude Desktop 재시작** -- MCP 서버 자동 연결 확인

---

## 9. SDK vs MCP 기능 매트릭스

### 9.1 Agent 기능 비교

| 기능 | TS SDK | Python SDK | MCP Tool | REST API |
|------|--------|-----------|----------|----------|
| 잔액 조회 | `getBalance()` | `get_balance()` | `get_balance` | GET /v1/wallet/balance |
| 주소 조회 | `getAddress()` | `get_address()` | `get_address` | GET /v1/wallet/address |
| 자산 목록 (v0.6) | `getAssets()` | `get_assets()` | -- | GET /v1/wallet/assets |
| 네이티브 전송 | `sendToken()` | `send_token()` | `send_token` | POST /v1/transactions/send |
| 토큰 전송 (v0.6) | `sendToken()` | `send_token_transfer()` | `send_token` (type 지정) | POST /v1/transactions/send (TOKEN_TRANSFER) |
| 컨트랙트 호출 (v0.6) | `contractCall()` | `contract_call()` | -- | POST /v1/transactions/send (CONTRACT_CALL) |
| 토큰 승인 (v0.6) | `approve()` | `approve_token()` | -- | POST /v1/transactions/send (APPROVE) |
| 배치 (v0.6) | `batch()` | `batch_transaction()` | -- | POST /v1/transactions/send (BATCH) |
| 거래 목록 | `listTransactions()` | `list_transactions()` | `list_transactions` | GET /v1/transactions |
| 거래 조회 | `getTransaction()` | `get_transaction()` | `get_transaction` | GET /v1/transactions/:id |
| 대기 거래 | `listPendingTransactions()` | `list_pending_transactions()` | -- | GET /v1/transactions/pending |
| nonce 조회 | `getNonce()` | `get_nonce()` | `get_nonce` | GET /v1/nonce |
| Action 목록 (v0.6) | `listActions()` | `list_actions()` | -- (동적 Tool로 노출) | GET /v1/actions |
| Action 상세 (v0.6) | `getAction()` | `get_action()` | -- | GET /v1/actions/:p/:a |
| Action resolve (v0.6) | `resolveAction()` | `resolve_action()` | -- | POST /v1/actions/:p/:a/resolve |
| Action 실행 (v0.6) | `executeAction()` | `execute_action()` | `{provider}_{action}` (자동 변환) | POST /v1/actions/:p/:a/execute |

### 9.2 Owner 기능 비교

| 기능 | TS SDK Owner | Python SDK Owner | MCP | REST API |
|------|-------------|-----------------|-----|----------|
| 세션 생성 | `createSession()` | `create_session()` | -- | POST /v1/sessions |
| 세션 목록 | `listSessions()` | `list_sessions()` | -- | GET /v1/owner/sessions |
| 세션 폐기 | `revokeSession()` | `revoke_session()` | -- | DELETE /v1/owner/sessions/:id |
| 거래 승인 | `approveTransaction()` | `approve_transaction()` | -- | POST /v1/owner/approve/:txId |
| 거래 거절 | `rejectTransaction()` | `reject_transaction()` | -- | POST /v1/owner/reject/:txId |
| 에이전트 목록 | `listAgents()` | `list_agents()` | -- | GET /v1/owner/agents |
| 설정 조회 | `getSettings()` | `get_settings()` | -- | GET /v1/owner/settings |
| Kill Switch | `activateKillSwitch()` | `activate_kill_switch()` | -- | POST /v1/owner/kill-switch |
| 복구 | `recover()` | `recover()` | -- | POST /v1/owner/recover |
| 대시보드 | `getDashboard()` | `get_dashboard()` | -- | GET /v1/owner/dashboard |

### 9.3 MCP Resource 비교

| 리소스 | MCP Resource | SDK 동등 메서드 | REST API |
|--------|-------------|----------------|----------|
| 지갑 잔액 | `waiaas://wallet/balance` | `getBalance()` | GET /v1/wallet/balance |
| 지갑 주소 | `waiaas://wallet/address` | `getAddress()` | GET /v1/wallet/address |
| 시스템 상태 | `waiaas://system/status` | -- (직접 health 호출) | GET /health |

### 9.4 통합 경로 선택 가이드

| 시나리오 | 권장 경로 | 근거 |
|----------|---------|------|
| TypeScript 에이전트 프레임워크 | **TS SDK** | 타입 안전, retry 내장, 모든 API 접근 |
| Python 에이전트 프레임워크 | **Python SDK** | async/httpx, Pydantic 모델, 모든 API 접근 |
| Claude Desktop / Cursor | **MCP Server** | stdio 자동 연결, Tool discovery, 설정만으로 사용 |
| Tauri Desktop 앱 | **TS SDK** (Owner) | Owner API 필요, CORS tauri://localhost 지원 |
| Telegram Bot | **REST API 직접** | native fetch, Owner 인증은 별도 메커니즘 |
| Docker/CI/CD | **REST API 직접** | curl/httpie, 스크립트 자동화 |
| 다른 언어 (Go, Rust 등) | **REST API 직접** | OpenAPI 3.0 스펙으로 코드 생성 가능 |

---

## 10. 보안 고려사항

### 10.1 세션 토큰 보호

| 위협 | SDK 대응 | MCP 대응 |
|------|---------|---------|
| 토큰 노출 (로그) | Authorization 헤더만 사용, 토큰 값 미로깅 | 환경변수에서 읽기, stdout 미출력 |
| 토큰 탈취 (메모리) | `clearSessionToken()` 지원, 프로세스 종료 시 GC | 프로세스 종료 시 자동 정리 |
| 토큰 만료 | WAIaaSError code 기반 감지, 재발급 안내 | `isError: true` 반환, LLM이 사용자 안내 |
| 토큰 재사용 (replay) | HTTPS 불필요 (localhost), 세션 ID 고유 | stdio 프로세스 간 통신 (네트워크 미사용) |

### 10.2 MCP 보안 경계

```
┌─────────────────────────────────────────────────────┐
│ Security Boundary: Same Machine (localhost)           │
│                                                       │
│  Claude Desktop   ←── stdio ──→   @waiaas/mcp        │
│  (신뢰)                            (신뢰)             │
│                                       │               │
│                              HTTP 127.0.0.1:3100      │
│                                       │               │
│                              WAIaaS Daemon             │
│                              (hostValidation 보호)     │
└─────────────────────────────────────────────────────┘
```

**MCP Server가 노출하지 않는 것:**
- Owner API: 세션/에이전트/정책 관리는 MCP를 통해 접근 불가
- Admin API: Kill Switch, Shutdown은 MCP 미노출
- 마스터 패스워드: MCP 환경변수에 마스터 패스워드 미포함
- 키스토어 직접 접근: MCP는 REST API만 사용, 파일 시스템 미접근

### 10.3 SDK 에러 코드 -> 행동 매핑

| 에러 코드 | SDK 행동 | 사용자 안내 |
|----------|---------|-----------|
| `AUTH_TOKEN_MISSING` | 즉시 에러, 재시도 없음 | `setSessionToken()` 호출 필요 |
| `AUTH_TOKEN_EXPIRED` | 즉시 에러, 재시도 없음 | 새 세션 토큰 발급 필요 |
| `AUTH_TOKEN_INVALID` | 즉시 에러, 재시도 없음 | 토큰 값 확인 |
| `SESSION_REVOKED` | 즉시 에러, 재시도 없음 | Owner가 세션 폐기함 |
| `SESSION_LIMIT_EXCEEDED` | 즉시 에러, 재시도 없음 | 세션 제약 초과 (단건/누적/횟수) |
| `INSUFFICIENT_BALANCE` | 즉시 에러, 재시도 없음 | 잔액 부족 |
| `POLICY_DENIED` | 즉시 에러, 재시도 없음 | 정책 엔진 거부 |
| `SYSTEM_LOCKED` | 즉시 에러, 재시도 없음 | Kill Switch 활성 |
| `RATE_LIMITED` | 자동 재시도 (Retry-After 헤더 참조) | 요청 속도 제한 |
| `ADAPTER_NOT_AVAILABLE` | 자동 재시도 (최대 3회) | 체인 어댑터 일시 불가 |
| `CHAIN_ERROR` | 자동 재시도 (최대 3회) | RPC 노드 오류 |
| `KEYSTORE_LOCKED` | 자동 재시도 (최대 3회) | 키스토어 아직 열리지 않음 |

### 10.4 SDK/MCP 미래 보안 강화 (v0.3)

| 항목 | v0.2 (현재) | v0.3 (계획) |
|------|-----------|-----------|
| MCP 토큰 갱신 | 수동 (환경변수 재설정) → **[v0.9 설계 완료]** SessionManager 자동 갱신 (섹션 6.4.3~6.4.7) | 자동 갱신 (Owner 서명 내장) |
| SDK 토큰 로테이션 | 수동 (`setSessionToken`) | 자동 로테이션 (만료 전 갱신) |
| MCP 인증 | 세션 토큰 only | OAuth 2.1 (Streamable HTTP) |
| SDK Transport | HTTP only | HTTP + WebSocket (실시간 알림) |

---

## 11. 구현 노트

### 11.1 MCP <-> REST API 기능 패리티 매트릭스 (NOTE-03) (v0.6 변경)

36개 REST 엔드포인트 전체에 대한 MCP Tool/Resource 매핑 현황이다. MCP는 AI 에이전트 권한 범위(세션 Bearer)만 노출하며, Owner/Admin API는 보안상 의도적으로 제외한다.

**Public API (3개)**

| # | REST 엔드포인트 | MCP 매핑 | 커버 상태 | 근거 |
|---|----------------|---------|----------|------|
| 1 | GET /health | 리소스: `waiaas://system/status` | 커버됨 | 시스템 상태 확인 |
| 2 | GET /doc | - | 의도적 미커버 | Swagger UI는 브라우저 전용 |
| 3 | GET /v1/nonce | 도구: `get_nonce` | 커버됨 | 세션 생성 전 nonce 조회 |

**Session API -- Agent 인증 (5개)**

| # | REST 엔드포인트 | MCP 매핑 | 커버 상태 | 근거 |
|---|----------------|---------|----------|------|
| 4 | GET /v1/wallet/balance | 도구: `get_balance` + 리소스: `waiaas://wallet/balance` | 커버됨 | 잔액 조회 |
| 5 | GET /v1/wallet/address | 도구: `get_address` + 리소스: `waiaas://wallet/address` | 커버됨 | 주소 조회 |
| 6 | POST /v1/transactions/send | 도구: `send_token` | 커버됨 | 토큰 전송 |
| 7 | GET /v1/transactions | 도구: `list_transactions` | 커버됨 | 거래 이력 |
| 8 | GET /v1/transactions/:id | 도구: `get_transaction` | 커버됨 | 거래 상세 |

**Session API -- 추가 (1개, 부분 커버)**

| # | REST 엔드포인트 | MCP 매핑 | 커버 상태 | 근거 |
|---|----------------|---------|----------|------|
| 9 | GET /v1/transactions/pending | - | 의도적 미커버 | 대기 거래는 Agent가 조회할 필요 적음. list_transactions로 대체 가능 |

**Session Management API -- Owner 인증 (3개)**

| # | REST 엔드포인트 | MCP 매핑 | 커버 상태 | 근거 |
|---|----------------|---------|----------|------|
| 10 | POST /v1/sessions | - | 의도적 미커버 | 세션 생성은 Owner 권한 |
| 11 | GET /v1/sessions | - | 의도적 미커버 | 세션 관리는 Owner 권한 |
| 12 | DELETE /v1/sessions/:id | - | 의도적 미커버 | 세션 폐기는 Owner 권한 |

**Owner API (17개)**

| # | REST 엔드포인트 | MCP 매핑 | 커버 상태 | 근거 |
|---|----------------|---------|----------|------|
| 13-28 | /v1/owner/* (16개) | - | 의도적 미커버 | Owner API 전체는 보안상 MCP 미노출 |
| 29 | GET /v1/owner/dashboard | - | 의도적 미커버 | 대시보드는 Desktop/CLI 전용 |

**Admin API (3개)**

| # | REST 엔드포인트 | MCP 매핑 | 커버 상태 | 근거 |
|---|----------------|---------|----------|------|
| 30 | POST /v1/admin/kill-switch | - | 의도적 미커버 | Kill Switch는 Master 권한 |
| 31 | POST /v1/admin/shutdown | - | 의도적 미커버 | 시스템 종료는 Master 권한 |
| 32 | GET /v1/admin/status | - | 의도적 미커버 | Admin 상태는 Master 권한 |

**v0.6 추가 엔드포인트 (5개)**

| # | REST 엔드포인트 | MCP 매핑 | 커버 상태 | 근거 |
|---|----------------|---------|----------|------|
| 33 | GET /v1/wallet/assets | - | 의도적 미커버 | get_balance로 핵심 정보 커버. 전체 자산 목록은 SDK 사용 권장 |
| 34 | GET /v1/actions | - | 간접 커버 | Action Tool 자동 등록으로 간접 노출 (5.3.8 참조) |
| 35 | GET /v1/actions/:p/:a | - | 간접 커버 | MCP Tool description에 Action 정보 포함 |
| 36 | POST /v1/actions/:p/:a/resolve | - | 의도적 미커버 | resolve만 사용하는 시나리오는 Agent 고급 사용, SDK 권장 |
| 37 | POST /v1/actions/:p/:a/execute | 동적 도구: `{provider}_{action}` | 커버됨 | Action -> MCP Tool 자동 변환 (mcpExpose=true, MCP_TOOL_MAX=16) |

**요약:**
- 커버됨: 7개 내장 + 동적 Action Tool (도구 6 + 리소스 3, 일부 중복 + Action Tool 최대 10개)
- 의도적 미커버: 27개 (Owner 17 + Admin 3 + Session Mgmt 3 + doc 1 + assets 1 + resolve 1 + actions list 1)
- MCP_TOOL_MAX = 16 (내장 6 + Action 최대 10) -- 62-action-provider-architecture.md 결정
- v0.3+ 확장 후보: Streamable HTTP transport 도입 시 MCP 도구 확장 검토

### 11.2 SDK 에러 코드 타입 매핑 전략 (NOTE-04) (v0.6 변경)

현재 SDK의 `WAIaaSError.code`는 `string` 타입이다. 구현 시 60개 에러 코드(v0.6: +20개)를 타입 수준에서 매핑하여 자동완성과 타입 체크를 활성화해야 한다.

**TS SDK 타입 매핑:**

```typescript
// @waiaas/sdk에서 정의
type WAIaaSErrorCode =
  // AUTH (8)
  | 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'SESSION_REVOKED'
  | 'INVALID_SIGNATURE' | 'INVALID_NONCE' | 'INVALID_MASTER_PASSWORD'
  | 'MASTER_PASSWORD_LOCKED' | 'SYSTEM_LOCKED'
  // SESSION (4)
  | 'SESSION_NOT_FOUND' | 'SESSION_EXPIRED'
  | 'SESSION_LIMIT_EXCEEDED' | 'CONSTRAINT_VIOLATED'
  // TX (7)
  | 'INSUFFICIENT_BALANCE' | 'INVALID_ADDRESS' | 'TX_NOT_FOUND'
  | 'TX_EXPIRED' | 'TX_ALREADY_PROCESSED' | 'CHAIN_ERROR' | 'SIMULATION_FAILED'
  // POLICY (4)
  | 'POLICY_DENIED' | 'SPENDING_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED' | 'WHITELIST_DENIED'
  // OWNER (4)
  | 'OWNER_ALREADY_CONNECTED' | 'OWNER_NOT_CONNECTED'
  | 'APPROVAL_TIMEOUT' | 'APPROVAL_NOT_FOUND'
  // SYSTEM (6)
  | 'KILL_SWITCH_ACTIVE' | 'KILL_SWITCH_NOT_ACTIVE'
  | 'KEYSTORE_LOCKED' | 'CHAIN_NOT_SUPPORTED'
  | 'SHUTTING_DOWN' | 'ADAPTER_NOT_AVAILABLE'
  // AGENT (3)
  | 'AGENT_NOT_FOUND' | 'AGENT_SUSPENDED' | 'AGENT_TERMINATED'
  // v0.6 TX 확장 (13)
  | 'TOKEN_NOT_FOUND' | 'TOKEN_NOT_ALLOWED' | 'INSUFFICIENT_TOKEN_BALANCE'
  | 'CONTRACT_CALL_DISABLED' | 'CONTRACT_NOT_WHITELISTED' | 'METHOD_NOT_WHITELISTED'
  | 'APPROVE_DISABLED' | 'SPENDER_NOT_APPROVED' | 'APPROVE_AMOUNT_EXCEEDED' | 'UNLIMITED_APPROVE_BLOCKED'
  | 'BATCH_NOT_SUPPORTED' | 'BATCH_SIZE_EXCEEDED' | 'BATCH_POLICY_VIOLATION'
  // v0.6 ACTION (7)
  | 'ACTION_NOT_FOUND' | 'ACTION_VALIDATION_FAILED' | 'ACTION_RESOLVE_FAILED'
  | 'ACTION_RETURN_INVALID' | 'ACTION_PLUGIN_LOAD_FAILED' | 'ACTION_NAME_CONFLICT' | 'ACTION_CHAIN_MISMATCH'

// WAIaaSError.code 필드 타입 변경
class WAIaaSError extends Error {
  readonly code: WAIaaSErrorCode  // string -> WAIaaSErrorCode
  // ... 나머지 동일
}
```

**Python SDK 타입 매핑:**

```python
from enum import Enum

class ErrorCode(str, Enum):
    # AUTH (8)
    INVALID_TOKEN = "INVALID_TOKEN"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    SESSION_REVOKED = "SESSION_REVOKED"
    INVALID_SIGNATURE = "INVALID_SIGNATURE"
    INVALID_NONCE = "INVALID_NONCE"
    INVALID_MASTER_PASSWORD = "INVALID_MASTER_PASSWORD"
    MASTER_PASSWORD_LOCKED = "MASTER_PASSWORD_LOCKED"
    SYSTEM_LOCKED = "SYSTEM_LOCKED"
    # SESSION (4)
    SESSION_NOT_FOUND = "SESSION_NOT_FOUND"
    SESSION_EXPIRED = "SESSION_EXPIRED"
    SESSION_LIMIT_EXCEEDED = "SESSION_LIMIT_EXCEEDED"
    CONSTRAINT_VIOLATED = "CONSTRAINT_VIOLATED"
    # TX (7 + v0.6 13 = 20)
    INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE"
    INVALID_ADDRESS = "INVALID_ADDRESS"
    TX_NOT_FOUND = "TX_NOT_FOUND"
    TX_EXPIRED = "TX_EXPIRED"
    TX_ALREADY_PROCESSED = "TX_ALREADY_PROCESSED"
    CHAIN_ERROR = "CHAIN_ERROR"
    SIMULATION_FAILED = "SIMULATION_FAILED"
    # v0.6 TX 확장 (13)
    TOKEN_NOT_FOUND = "TOKEN_NOT_FOUND"
    TOKEN_NOT_ALLOWED = "TOKEN_NOT_ALLOWED"
    INSUFFICIENT_TOKEN_BALANCE = "INSUFFICIENT_TOKEN_BALANCE"
    CONTRACT_CALL_DISABLED = "CONTRACT_CALL_DISABLED"
    CONTRACT_NOT_WHITELISTED = "CONTRACT_NOT_WHITELISTED"
    METHOD_NOT_WHITELISTED = "METHOD_NOT_WHITELISTED"
    APPROVE_DISABLED = "APPROVE_DISABLED"
    SPENDER_NOT_APPROVED = "SPENDER_NOT_APPROVED"
    APPROVE_AMOUNT_EXCEEDED = "APPROVE_AMOUNT_EXCEEDED"
    UNLIMITED_APPROVE_BLOCKED = "UNLIMITED_APPROVE_BLOCKED"
    BATCH_NOT_SUPPORTED = "BATCH_NOT_SUPPORTED"
    BATCH_SIZE_EXCEEDED = "BATCH_SIZE_EXCEEDED"
    BATCH_POLICY_VIOLATION = "BATCH_POLICY_VIOLATION"
    # POLICY (4)
    POLICY_DENIED = "POLICY_DENIED"
    SPENDING_LIMIT_EXCEEDED = "SPENDING_LIMIT_EXCEEDED"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    WHITELIST_DENIED = "WHITELIST_DENIED"
    # OWNER (4)
    OWNER_ALREADY_CONNECTED = "OWNER_ALREADY_CONNECTED"
    OWNER_NOT_CONNECTED = "OWNER_NOT_CONNECTED"
    APPROVAL_TIMEOUT = "APPROVAL_TIMEOUT"
    APPROVAL_NOT_FOUND = "APPROVAL_NOT_FOUND"
    # SYSTEM (6)
    KILL_SWITCH_ACTIVE = "KILL_SWITCH_ACTIVE"
    KILL_SWITCH_NOT_ACTIVE = "KILL_SWITCH_NOT_ACTIVE"
    KEYSTORE_LOCKED = "KEYSTORE_LOCKED"
    CHAIN_NOT_SUPPORTED = "CHAIN_NOT_SUPPORTED"
    SHUTTING_DOWN = "SHUTTING_DOWN"
    ADAPTER_NOT_AVAILABLE = "ADAPTER_NOT_AVAILABLE"
    # AGENT (3)
    AGENT_NOT_FOUND = "AGENT_NOT_FOUND"
    AGENT_SUSPENDED = "AGENT_SUSPENDED"
    AGENT_TERMINATED = "AGENT_TERMINATED"
    # v0.6 ACTION (7)
    ACTION_NOT_FOUND = "ACTION_NOT_FOUND"
    ACTION_VALIDATION_FAILED = "ACTION_VALIDATION_FAILED"
    ACTION_RESOLVE_FAILED = "ACTION_RESOLVE_FAILED"
    ACTION_RETURN_INVALID = "ACTION_RETURN_INVALID"
    ACTION_PLUGIN_LOAD_FAILED = "ACTION_PLUGIN_LOAD_FAILED"
    ACTION_NAME_CONFLICT = "ACTION_NAME_CONFLICT"
    ACTION_CHAIN_MISMATCH = "ACTION_CHAIN_MISMATCH"

# WAIaaSError.code 필드 타입 변경
class WAIaaSError(Exception):
    code: ErrorCode  # str -> ErrorCode
```

**9개 도메인별 에러 코드 전체 목록 (v0.6 변경: 7 -> 9 도메인, 36 -> 60 코드):**

| 도메인 | 코드 수 | 에러 코드 |
|--------|--------|----------|
| AUTH | 8 | INVALID_TOKEN, TOKEN_EXPIRED, SESSION_REVOKED, INVALID_SIGNATURE, INVALID_NONCE, INVALID_MASTER_PASSWORD, MASTER_PASSWORD_LOCKED, SYSTEM_LOCKED |
| SESSION | 4 | SESSION_NOT_FOUND, SESSION_EXPIRED, SESSION_LIMIT_EXCEEDED, CONSTRAINT_VIOLATED |
| TX | 20 | INSUFFICIENT_BALANCE, INVALID_ADDRESS, TX_NOT_FOUND, TX_EXPIRED, TX_ALREADY_PROCESSED, CHAIN_ERROR, SIMULATION_FAILED + (v0.6) TOKEN_NOT_FOUND, TOKEN_NOT_ALLOWED, INSUFFICIENT_TOKEN_BALANCE, CONTRACT_CALL_DISABLED, CONTRACT_NOT_WHITELISTED, METHOD_NOT_WHITELISTED, APPROVE_DISABLED, SPENDER_NOT_APPROVED, APPROVE_AMOUNT_EXCEEDED, UNLIMITED_APPROVE_BLOCKED, BATCH_NOT_SUPPORTED, BATCH_SIZE_EXCEEDED, BATCH_POLICY_VIOLATION |
| POLICY | 4 | POLICY_DENIED, SPENDING_LIMIT_EXCEEDED, RATE_LIMIT_EXCEEDED, WHITELIST_DENIED |
| OWNER | 4 | OWNER_ALREADY_CONNECTED, OWNER_NOT_CONNECTED, APPROVAL_TIMEOUT, APPROVAL_NOT_FOUND |
| SYSTEM | 6 | KILL_SWITCH_ACTIVE, KILL_SWITCH_NOT_ACTIVE, KEYSTORE_LOCKED, CHAIN_NOT_SUPPORTED, SHUTTING_DOWN, ADAPTER_NOT_AVAILABLE |
| AGENT | 3 | AGENT_NOT_FOUND, AGENT_SUSPENDED, AGENT_TERMINATED |
| ACTION | 7 | (v0.6) ACTION_NOT_FOUND, ACTION_VALIDATION_FAILED, ACTION_RESOLVE_FAILED, ACTION_RETURN_INVALID, ACTION_PLUGIN_LOAD_FAILED, ACTION_NAME_CONFLICT, ACTION_CHAIN_MISMATCH |
| SESSION (Phase 20) | 4 | RENEWAL_LIMIT_REACHED, SESSION_ABSOLUTE_LIFETIME_EXCEEDED, RENEWAL_TOO_EARLY, SESSION_RENEWAL_MISMATCH |

**추가 결정 사항:**
- 도메인별 에러 서브클래스 불필요: 단일 `WAIaaSError` + `code` 필드로 구분 (현행 유지)
- retryable 판정: HTTP 429, 502, 503, 504 -> `retryable=true`, 나머지 `false` (현행 유지)
- MCP 에러: `isError: true` + JSON text `{code, message}` 반환 (현행 유지)

### 11.3 Python SDK snake_case 변환 검증 (NOTE-10)

> **[v0.7 보완]** `alias_generator=to_camel` 전환으로 인해 `Field(alias=)` 수동 지정이 제거됨. 전수 검증 결과는 섹션 4.2.1 대조표 참조. 아래는 요약.

REST API camelCase 필드 -> Python SDK snake_case 필드 변환의 일관성을 검증한 결과이다. v0.2 기존 17개 + v0.6 확장 12개, **총 29개 필드** 전부 `to_camel` 자동 변환과 일치 확인 OK.

**v0.7 전환 요약:**
- **이전:** 각 모델에 `Field(alias="camelCase")` 수동 지정 + 모델별 `model_config = {"populate_by_name": True}`
- **이후:** `WAIaaSBaseModel` 상속으로 `ConfigDict(alias_generator=to_camel, populate_by_name=True)` 자동 적용. 수동 alias 불필요.
- **전수 검증:** 섹션 4.2.1 대조표에서 29개 필드 모두 `to_camel` 결과 = API 필드명 일치 확인

**에러 코드 무변환 원칙:**
- UPPER_SNAKE_CASE 에러 코드(INVALID_TOKEN, INSUFFICIENT_BALANCE 등)는 Python에서도 그대로 사용
- 이미 Python 관례(상수 = UPPER_SNAKE_CASE)와 일치하므로 변환 불필요
- Enum 값(PENDING, CONFIRMED, TRANSFER, TOKEN_TRANSFER 등)은 alias_generator 대상이 아님

**Owner API Python SDK:**
- v0.2에서는 TS Owner SDK만 설계됨. Python Owner SDK는 v0.3+ 확장 시 동일 WAIaaSBaseModel 상속 규칙 적용

---

*문서 ID: SDK-MCP*
*작성일: 2026-02-05*
*v0.5 업데이트: 2026-02-07*
*v0.9 SessionManager 핵심 설계: 2026-02-09 -- Phase 37-01 (인터페이스 + 토큰 로드), Phase 37-02 (갱신 + 실패 + reload)*
*Phase: 09-integration-client-interface-design*
*상태: 완료*

### v0.5 참조 문서

- 52-auth-model-redesign.md -- masterAuth/ownerAuth/sessionAuth 3-tier 인증 (Owner 메서드 인증 변경)
- 53-session-renewal-protocol.md -- 세션 낙관적 갱신 프로토콜 (sessions.renew() 메서드)
- 55-dx-improvement-spec.md -- MCP 내장 옵션 검토 결과, hint 필드

### v0.9 참조 문서

- 24-monorepo-data-directory.md 섹션 4 -- mcp-token 파일 사양 (Phase 36-01 확정)
- 53-session-renewal-protocol.md 섹션 5.6 -- shouldNotifyExpiringSession 순수 함수 (Phase 36-02 확정)
- 53-session-renewal-protocol.md 섹션 3.7 -- 5종 갱신 에러 코드 및 HTTP 상태 (Phase 37-02 연동)
- 35-notification-architecture.md -- SESSION_EXPIRING_SOON 알림 이벤트 (Phase 36-02 확정, NOTI-01)
- 35-notification-architecture.md -- SESSION_EXPIRING_SOON 이벤트 (Phase 36-02 확정)
- 38-RESEARCH.md -- Phase 38 ApiClient 래퍼 패턴, tool/resource handler 통합 패턴, 프로세스 생명주기 리서치 (Phase 38-01 참조)
