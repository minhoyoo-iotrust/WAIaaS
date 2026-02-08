# SDK & MCP Server 인터페이스 설계 (SDK-MCP)

**문서 ID:** SDK-MCP
**작성일:** 2026-02-05
**v0.5 업데이트:** 2026-02-07
**v0.6 블록체인 기능 확장:** 2026-02-08
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
from typing import Optional
from pydantic import BaseModel, Field


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


class Chain(str, Enum):
    SOLANA = "solana"
    ETHEREUM = "ethereum"


class BalanceResponse(BaseModel):
    balance: str = Field(description="잔액 (최소 단위: lamports/wei)")
    decimals: int = Field(description="소수점 자릿수")
    symbol: str = Field(description="토큰 심볼")
    formatted: str = Field(description="사람이 읽기 좋은 포맷")
    chain: str
    network: str


class AddressResponse(BaseModel):
    address: str = Field(description="지갑 공개키")
    chain: str
    network: str
    encoding: str = Field(description="base58 | hex")


class TransferRequest(BaseModel):
    to: str = Field(min_length=1, description="수신자 주소")
    amount: str = Field(min_length=1, description="전송 금액 (최소 단위)")
    type: str = Field(default="TRANSFER")
    token_mint: Optional[str] = Field(default=None, alias="tokenMint")
    memo: Optional[str] = Field(default=None, max_length=200)
    priority: str = Field(default="medium")


class TransactionResponse(BaseModel):
    transaction_id: str = Field(alias="transactionId")
    status: TransactionStatus
    tier: Optional[Tier] = None
    tx_hash: Optional[str] = Field(default=None, alias="txHash")
    estimated_fee: Optional[str] = Field(default=None, alias="estimatedFee")
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}


class TransactionSummary(BaseModel):
    id: str
    type: str
    status: TransactionStatus
    tier: Optional[Tier] = None
    amount: Optional[str] = None
    to_address: Optional[str] = Field(default=None, alias="toAddress")
    tx_hash: Optional[str] = Field(default=None, alias="txHash")
    created_at: datetime = Field(alias="createdAt")
    executed_at: Optional[datetime] = Field(default=None, alias="executedAt")
    error: Optional[str] = None

    model_config = {"populate_by_name": True}


class TransactionListResponse(BaseModel):
    transactions: list[TransactionSummary]
    next_cursor: Optional[str] = Field(default=None, alias="nextCursor")

    model_config = {"populate_by_name": True}


class PendingTransactionSummary(BaseModel):
    id: str
    type: str
    amount: Optional[str] = None
    to_address: Optional[str] = Field(default=None, alias="toAddress")
    tier: Tier
    queued_at: datetime = Field(alias="queuedAt")
    expires_at: Optional[datetime] = Field(default=None, alias="expiresAt")
    status: str = "QUEUED"

    model_config = {"populate_by_name": True}


class PendingTransactionListResponse(BaseModel):
    transactions: list[PendingTransactionSummary]


class NonceResponse(BaseModel):
    nonce: str
    expires_at: datetime = Field(alias="expiresAt")

    model_config = {"populate_by_name": True}


class SessionCreateResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    token: str
    expires_at: datetime = Field(alias="expiresAt")
    constraints: dict

    model_config = {"populate_by_name": True}


class SessionConstraints(BaseModel):
    max_amount_per_tx: Optional[str] = Field(default=None, alias="maxAmountPerTx")
    max_total_amount: Optional[str] = Field(default=None, alias="maxTotalAmount")
    max_transactions: Optional[int] = Field(default=None, alias="maxTransactions")
    allowed_operations: Optional[list[str]] = Field(default=None, alias="allowedOperations")
    allowed_destinations: Optional[list[str]] = Field(default=None, alias="allowedDestinations")
    expires_in: Optional[int] = Field(default=None, alias="expiresIn")

    model_config = {"populate_by_name": True}
```

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
| 갱신 | SDK에서 자동 교체 가능 | 수동 갱신 (환경변수 재설정) |
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

**v0.3 확장 계획:** MCP Server 내장 토큰 갱신 메커니즘 (Owner 서명 자동화)

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
| MCP 토큰 갱신 | 수동 (환경변수 재설정) | 자동 갱신 (Owner 서명 내장) |
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

REST API camelCase 필드 -> Python SDK snake_case 필드 변환의 일관성을 검증한 결과이다. 17개 주요 필드 전부 일관성 OK.

**검증 결과:**

| # | REST API (camelCase) | Python SDK (snake_case) | alias 설정 | 일관성 |
|---|---------------------|------------------------|-----------|--------|
| 1 | `transactionId` | `transaction_id` | `alias="transactionId"` | OK |
| 2 | `txHash` | `tx_hash` | `alias="txHash"` | OK |
| 3 | `estimatedFee` | `estimated_fee` | `alias="estimatedFee"` | OK |
| 4 | `createdAt` | `created_at` | `alias="createdAt"` | OK |
| 5 | `executedAt` | `executed_at` | `alias="executedAt"` | OK |
| 6 | `toAddress` | `to_address` | `alias="toAddress"` | OK |
| 7 | `nextCursor` | `next_cursor` | `alias="nextCursor"` | OK |
| 8 | `queuedAt` | `queued_at` | `alias="queuedAt"` | OK |
| 9 | `expiresAt` | `expires_at` | `alias="expiresAt"` | OK |
| 10 | `sessionId` | `session_id` | `alias="sessionId"` | OK |
| 11 | `maxAmountPerTx` | `max_amount_per_tx` | `alias="maxAmountPerTx"` | OK |
| 12 | `maxTotalAmount` | `max_total_amount` | `alias="maxTotalAmount"` | OK |
| 13 | `maxTransactions` | `max_transactions` | `alias="maxTransactions"` | OK |
| 14 | `allowedOperations` | `allowed_operations` | `alias="allowedOperations"` | OK |
| 15 | `allowedDestinations` | `allowed_destinations` | `alias="allowedDestinations"` | OK |
| 16 | `expiresIn` | `expires_in` | `alias="expiresIn"` | OK |
| 17 | `tokenMint` | `token_mint` | `alias="tokenMint"` | OK |

**Pydantic 규칙:**
- 모든 alias 모델에 `model_config = {"populate_by_name": True}` 필수 설정
- 이 설정이 없으면 Python 코드에서 snake_case 필드명으로 인스턴스 생성이 불가

**에러 코드 무변환 원칙:**
- UPPER_SNAKE_CASE 에러 코드(INVALID_TOKEN, INSUFFICIENT_BALANCE 등)는 Python에서도 그대로 사용
- 이미 Python 관례(상수 = UPPER_SNAKE_CASE)와 일치하므로 변환 불필요

**Owner API Python SDK:**
- v0.2에서는 TS Owner SDK만 설계됨. Python Owner SDK는 v0.3+ 확장 시 동일 snake_case 규칙 적용

---

*문서 ID: SDK-MCP*
*작성일: 2026-02-05*
*v0.5 업데이트: 2026-02-07*
*Phase: 09-integration-client-interface-design*
*상태: 완료*

### v0.5 참조 문서

- 52-auth-model-redesign.md -- masterAuth/ownerAuth/sessionAuth 3-tier 인증 (Owner 메서드 인증 변경)
- 53-session-renewal-protocol.md -- 세션 낙관적 갱신 프로토콜 (sessions.renew() 메서드)
- 55-dx-improvement-spec.md -- MCP 내장 옵션 검토 결과, hint 필드
