# Phase 38: SessionManager MCP 통합 설계 - Research

**Researched:** 2026-02-09
**Domain:** MCP tool handler와 SessionManager 통합 -- ApiClient 리팩토링, 토큰 로테이션 동시성, 프로세스 생명주기, Claude Desktop 에러 처리
**Confidence:** HIGH

## Summary

Phase 38은 Phase 37에서 확정된 SessionManager 핵심 설계(인터페이스, 토큰 로드, 갱신, 실패 처리, lazy reload)를 MCP tool/resource handler와 실제로 통합하는 방법을 설계하는 페이즈이다. 4개 요구사항(SMGI-01~04)이 각각 (1) ApiClient 리팩토링을 통한 tool handler 통합, (2) 토큰 로테이션 중 동시성 처리, (3) Claude Desktop 재시작/프로세스 kill 시 생명주기, (4) 세션 만료 시 에러 응답 형식과 연결 해제 방지를 다룬다.

핵심 설계 과제는 현재 tool handler들이 `SESSION_TOKEN` 환경변수를 직접 참조하고 `fetch`를 직접 호출하는 구조(38-sdk-mcp-interface.md 섹션 5.3)를 `sessionManager.getToken()` + `ApiClient` 래퍼 기반으로 전환하는 것이다. MCP SDK(@modelcontextprotocol/sdk) v1.x에는 미들웨어/hook 시스템이 없으므로(feature request #1238 진행 중, 미완성), 모든 tool handler에서 공통으로 사용하는 `ApiClient` 클래스에 401 자동 재시도와 세션 만료 graceful response를 캡슐화하는 패턴이 유일한 현실적 접근이다.

**Primary recommendation:** `packages/mcp/src/internal/api-client.ts`에 `ApiClient` 클래스를 설계하되, (1) 모든 HTTP 호출에서 `sessionManager.getToken()`으로 토큰을 동적 획득, (2) 401 응답 시 `handleUnauthorized()` + 50ms 대기 + 재시도 자동 수행, (3) 세션 만료(`state === 'expired'`) 시 `isError` 없이 안내 메시지 반환의 3가지 핵심 기능을 제공한다. Tool handler는 `apiClient.get()`/`apiClient.post()`만 호출하고, 인증/재시도/에러 처리는 ApiClient에 위임한다.

---

## Standard Stack

Phase 38은 설계 마일스톤이므로 새로운 라이브러리 추가가 없다. Phase 37에서 확정된 스택을 그대로 활용한다.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | ^1.0.0 (v1.x) | McpServer, StdioServerTransport, tool/resource 등록 | MCP 표준 SDK. v2는 pre-alpha이므로 v1.x 사용 |
| Node.js `fetch` | 22.x built-in | localhost API 호출 | 외부 HTTP 클라이언트 불필요 |
| `@waiaas/core` | workspace:* | Zod 스키마, readMcpToken, writeMcpToken | 모노레포 공유 패키지 |
| `jose` | 6.1.x | decodeJwt() JWT 디코딩 | Phase 37 확정 |
| SessionManager | Phase 37 설계 | getToken/start/dispose | Phase 37-01, 37-02 확정 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `process` | 22.x built-in | SIGTERM/SIGINT 핸들링, process.exit | 프로세스 생명주기 |
| Node.js `setTimeout` | 22.x built-in | 401 재시도 대기(50ms), safeSetTimeout | 동시성 처리 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ApiClient 래퍼 | MCP SDK 미들웨어 | SDK v1.x에 미들웨어 미지원 (feature request #1238). v2에서 가능할 수 있으나 pre-alpha 상태 |
| 401 대기 후 재시도 | Mutex/Lock 패턴 | 갱신 중 모든 tool 호출을 블로킹하면 지연 발생. Node.js 단일 스레드이므로 메모리 내 lock은 불필요, 50ms 대기 + getToken() 재호출이 더 단순 |
| isError 회피 | isError: true 사용 | Claude Desktop이 반복 에러 시 MCP 서버 연결 해제 가능성 (H-04). 안내 메시지로 반환하면 연결 유지 |
| 프로세스 내 ApiClient | SDK 외부 HTTP 프록시 | 과도한 아키텍처 복잡성. localhost 직접 호출이 Self-Hosted 환경에 적합 |

---

## Architecture Patterns

### Recommended File Structure (Phase 38 변경 후)

```
packages/mcp/src/
├── index.ts                # 엔트리포인트: SessionManager + ApiClient 초기화, SIGTERM 핸들링
├── server.ts               # McpServer 초기화 + tool/resource 등록
├── session-manager.ts      # [Phase 37] SessionManager 클래스
├── tools/
│   ├── send-token.ts       # [Phase 38 리팩토링] apiClient.post() 사용
│   ├── get-balance.ts      # [Phase 38 리팩토링] apiClient.get() 사용
│   ├── get-address.ts      # [Phase 38 리팩토링] apiClient.get() 사용
│   ├── list-transactions.ts
│   ├── get-transaction.ts
│   └── get-nonce.ts
├── resources/
│   ├── wallet-balance.ts   # [Phase 38 리팩토링] apiClient.get() 사용
│   ├── wallet-address.ts
│   └── system-status.ts
└── internal/
    ├── api-client.ts       # [Phase 38 핵심] ApiClient 클래스 -- 인증/재시도/에러 래퍼
    └── config.ts           # 환경변수, 설정
```

### Pattern 1: ApiClient 래퍼 패턴 (Authentication Proxy)

**What:** 모든 데몬 API 호출을 ApiClient 클래스로 캡슐화한다. 개별 tool handler는 인증 헤더, 401 재시도, 세션 만료 처리를 직접 다루지 않는다.

**When to use:** MCP tool handler 내부에서 데몬 API를 호출할 때 항상.

**Why:** MCP SDK v1.x에 미들웨어가 없으므로, 공통 로직을 별도 클래스에 캡슐화하는 것이 유일한 DRY 방법이다. 6개 tool + 3개 resource = 9개 handler가 동일한 인증/에러 로직을 공유한다.

**Example (설계 수준 의사 코드):**
```typescript
// packages/mcp/src/internal/api-client.ts
class ApiClient {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly baseUrl: string,
  ) {}

  async get<T>(path: string): Promise<ApiResult<T>> {
    return this.request('GET', path)
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request('POST', path, body)
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    // 1. 세션 상태 확인
    if (this.sessionManager.getState() === 'expired') {
      return { ok: false, expired: true }
    }

    // 2. 현재 토큰으로 API 호출
    const token = this.sessionManager.getToken()
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    // 3. 401 처리 -- handleUnauthorized + 재시도
    if (res.status === 401) {
      const recovered = await this.sessionManager.handleUnauthorized()
      if (recovered) {
        // 새 토큰으로 재시도 (1회만)
        const freshToken = this.sessionManager.getToken()
        const retryRes = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            'Authorization': `Bearer ${freshToken}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        })
        return this.parseResponse(retryRes)
      }
      return { ok: false, expired: true }
    }

    return this.parseResponse(res)
  }
}
```

**Source:** v0.9-PITFALLS.md H-05 (401 자동 재시도 권장), SM-14 (갱신 중 구 토큰 반환)

### Pattern 2: Tool Handler에서 ApiClient 사용

**What:** tool handler 콜백에서 ApiClient 메서드만 호출하고, 에러 처리는 공통 래퍼 함수(`toToolResult`)에 위임한다.

**When to use:** 모든 tool/resource handler 등록 시.

**Example (설계 수준):**
```typescript
// packages/mcp/src/tools/get-balance.ts
export function registerGetBalance(
  server: McpServer,
  apiClient: ApiClient,
): void {
  server.tool('get_balance', 'Get wallet balance...', {}, async () => {
    const result = await apiClient.get('/v1/wallet/balance')
    return toToolResult(result)
  })
}
```

```typescript
// 공통 변환 함수
function toToolResult(result: ApiResult): CallToolResult {
  if (result.expired) {
    // isError 미설정 -- 연결 해제 방지 (H-04)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'session_expired',
          message: 'Session has expired. Please create a new session via CLI or Telegram.',
          retryable: true,
        }),
      }],
    }
  }
  if (!result.ok) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result.error),
      }],
      isError: true,
    }
  }
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result.data),
    }],
  }
}
```

**Source:** v0.9-PITFALLS.md H-04 (isError 회피), MCP 프로토콜 스펙 (tools/call result format)

### Pattern 3: 프로세스 생명주기 관리

**What:** MCP Server 엔트리포인트에서 SessionManager/ApiClient 초기화, SIGTERM/SIGINT 핸들링, graceful shutdown을 관리한다.

**When to use:** `packages/mcp/src/index.ts` 엔트리포인트.

**Example (설계 수준):**
```typescript
// packages/mcp/src/index.ts
const sessionManager = new SessionManager({ ... })
const apiClient = new ApiClient(sessionManager, BASE_URL)

// 1. SessionManager 시작 (토큰 로드 + 갱신 스케줄)
await sessionManager.start()

// 2. MCP Server 생성 + tool/resource 등록
const server = createMcpServer(apiClient)

// 3. stdio transport 연결
const transport = new StdioServerTransport()
await server.connect(transport)

// 4. graceful shutdown
const shutdown = () => {
  sessionManager.dispose()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

**Source:** 38-sdk-mcp-interface.md 섹션 5.2 (현재 구조), SM-01 (Composition 패턴)

### Anti-Patterns to Avoid

- **개별 tool handler에서 직접 fetch 호출:** 현재 설계(38-sdk-mcp-interface.md 5.3.2~5.3.7)의 패턴. 인증 헤더, 401 처리, 에러 형식을 9개 handler가 각각 구현하면 불일치 위험과 코드 중복 발생.
- **환경변수 SESSION_TOKEN 직접 참조:** Phase 37 이후 토큰은 SessionManager가 관리. `process.env.WAIAAS_SESSION_TOKEN`은 최초 부트스트랩용이며 갱신 후 유효하지 않음.
- **세션 만료 시 isError: true 반환:** Claude Desktop이 반복 에러를 감지하여 MCP 서버 연결을 해제할 수 있음 (H-04). `isError` 없이 안내 메시지를 반환해야 함.
- **갱신 중 Mutex로 tool 호출 차단:** Node.js 단일 스레드에서 불필요한 복잡성. getToken()이 구 토큰을 반환하고 401 시 재시도하는 패턴이 충분.
- **MCP Server 시작 전 SessionManager 실패 시 process.exit(1):** 만료된 토큰으로도 시작은 가능해야 함 (파일 감시 없이 lazy reload로 복구).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 인증 헤더 관리 | 각 tool handler에서 `Authorization: Bearer` 직접 설정 | ApiClient 래퍼 | 9개 handler에 동일 코드 중복 제거 |
| 401 재시도 | 각 handler에서 개별 재시도 로직 | ApiClient.request() 내부 자동 재시도 | 재시도 정책 일관성 보장 |
| 세션 만료 응답 | 각 handler에서 isError 판단 | toToolResult() 공통 변환 | H-04 위반 방지, 응답 형식 통일 |
| SIGTERM 핸들링 | 각 모듈에서 개별 정리 | index.ts 단일 shutdown 함수 | 정리 순서 보장 (SessionManager dispose -> process.exit) |
| 동시성 제어 | Mutex/Lock 직접 구현 | SM-14 패턴 (구 토큰 반환) + 401 재시도 | Node.js 단일 스레드에서 Lock 불필요 |

**Key insight:** 모든 공통 로직을 ApiClient 한 곳에 집중시키는 것이 핵심이다. MCP SDK v1.x에 미들웨어가 없는 상황에서 ApiClient가 사실상 미들웨어 역할을 한다.

---

## Common Pitfalls

### Pitfall 1: 갱신 중 tool 호출의 토큰 불일치 (H-05)
**What goes wrong:** 갱신 API가 서버에서 token_hash를 교체한 직후, 아직 메모리에 구 토큰을 보유한 tool handler가 API를 호출하면 401이 발생한다.
**Why it happens:** 토큰 로테이션은 데몬 DB에서 즉시 적용되지만, MCP 프로세스의 메모리 교체는 네트워크 왕복 후에 발생한다. 이 사이(수십ms)에 tool 호출이 들어오면 구 토큰으로 요청이 전송된다.
**How to avoid:** ApiClient에서 401 수신 시 50ms 대기 후 `getToken()` 재호출. 토큰이 변경되었으면(갱신 완료) 새 토큰으로 재시도. 동일하면 handleUnauthorized() 호출.
**Warning signs:** 갱신 직후 간헐적 401 에러가 단 1회 발생하고 재시도에서 성공.

### Pitfall 2: Claude Desktop 반복 에러 시 MCP 연결 해제 (H-04)
**What goes wrong:** 세션 만료 상태에서 모든 tool 호출이 `isError: true`를 반환하면, Claude Desktop이 MCP 서버를 비정상으로 판단하고 연결을 해제한다.
**Why it happens:** Claude Desktop의 내부 로직이 연속 에러 수를 추적하는 것으로 추정 (공식 문서에 명시되어 있지 않음). MCP 프로토콜 자체는 isError에 대한 연결 해제 동작을 정의하지 않지만, Claude Desktop 구현에서 발생.
**How to avoid:** 세션 만료/에러 상태에서 `isError` 플래그를 설정하지 않고 정상 응답으로 안내 메시지를 반환한다. LLM이 메시지를 읽고 사용자에게 상황을 설명한다.
**Warning signs:** 세션 만료 후 Claude Desktop UI에서 MCP 서버가 "disconnected" 표시.

### Pitfall 3: 프로세스 재시작 시 만료된 환경변수 토큰 (M-03)
**What goes wrong:** Claude Desktop config.json의 `WAIAAS_SESSION_TOKEN`은 최초 설정 이후 갱신되지 않는다. 토큰 파일이 삭제된 상태에서 MCP Server가 재시작되면 구 환경변수 토큰을 로드하여 이미 만료된 세션으로 시작한다.
**Why it happens:** 환경변수는 프로세스 시작 시 고정. 파일 기반 토큰이 primary이지만 파일이 없으면 fallback으로 환경변수 사용.
**How to avoid:** 만료 상태에서도 주기적 파일 확인 루프 (에러 복구). 60초마다 파일을 확인하여 외부에서 새 토큰이 저장되었는지 감지.
**Warning signs:** MCP Server 시작 로그에 "Token expired" 메시지 후 모든 tool 호출이 만료 안내 반환.

### Pitfall 4: stdout 오염으로 MCP 연결 끊김
**What goes wrong:** MCP stdio transport에서 JSON-RPC 메시지만 stdout으로 가야 한다. SessionManager나 ApiClient의 로그가 `console.log`(stdout)으로 출력되면 Claude Desktop의 JSON 파서가 깨진다.
**Why it happens:** Node.js의 `console.log`는 stdout, `console.error`는 stderr로 출력. SessionManager와 ApiClient의 모든 로그는 반드시 `console.error`를 사용해야 한다.
**How to avoid:** SessionManager/ApiClient의 모든 로그를 `console.error`로 통일. `console.log` 사용 금지.
**Warning signs:** Claude Desktop에서 "Server disconnected" 오류. MCP Server 로그에 JSON 파싱 에러.

### Pitfall 5: SessionManager.start() 실패 시 MCP Server 미시작
**What goes wrong:** 토큰 파일과 환경변수 모두 없으면 `loadToken()`이 throw하여 MCP Server가 시작조차 못한다. Claude Desktop은 프로세스가 즉시 종료되면 재시도 후 포기한다.
**Why it happens:** Phase 37 설계에서 토큰 미존재 시 `Error` throw로 정의 (6.4.2 에러 케이스 1번).
**How to avoid:** 토큰 미존재/만료 시에도 MCP Server는 시작한다. tool 호출 시 세션 상태를 확인하여 안내 메시지를 반환하는 구조가 필요. SessionManager.start()가 실패해도 MCP Server 자체는 정상 기동해야 한다.
**Warning signs:** `waiaas mcp setup` 미실행 상태에서 Claude Desktop에 MCP 서버가 표시되지 않음.

---

## Code Examples

### Example 1: ApiClient 핵심 구조 (설계 수준)

```typescript
// packages/mcp/src/internal/api-client.ts
// [v0.9] Phase 38 -- MCP tool handler 통합용 API 클라이언트

type ApiResult<T = unknown> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: { code: string; message: string }; status: number }
  | { ok: false; expired: true }
  | { ok: false; networkError: true }

class ApiClient {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly baseUrl: string,
  ) {}

  async get<T>(path: string): Promise<ApiResult<T>> {
    return this.request('GET', path)
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request('POST', path, body)
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request('PUT', path, body)
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    // 세션 만료/에러 상태 사전 확인
    const state = this.sessionManager.getState()
    if (state === 'expired' || state === 'error') {
      return { ok: false, expired: true }
    }

    try {
      const token = this.sessionManager.getToken()
      const res = await this.doFetch(method, path, token, body)

      if (res.status === 401) {
        return await this.handle401(method, path, token, body)
      }

      return this.parseResponse<T>(res)
    } catch {
      return { ok: false, networkError: true }
    }
  }

  private async handle401<T>(
    method: string,
    path: string,
    originalToken: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    // Step 1: 50ms 대기 (갱신 중일 수 있음)
    await new Promise(r => setTimeout(r, 50))

    // Step 2: 토큰 변경 확인
    const freshToken = this.sessionManager.getToken()
    if (freshToken !== originalToken) {
      // 갱신 완료됨 -- 새 토큰으로 재시도
      const retryRes = await this.doFetch(method, path, freshToken, body)
      return this.parseResponse<T>(retryRes)
    }

    // Step 3: handleUnauthorized (파일 재로드)
    const recovered = await this.sessionManager.handleUnauthorized()
    if (recovered) {
      const newToken = this.sessionManager.getToken()
      const retryRes = await this.doFetch(method, path, newToken, body)
      return this.parseResponse<T>(retryRes)
    }

    // Step 4: 복구 실패
    return { ok: false, expired: true }
  }
}
```

**Source:** v0.9-PITFALLS.md H-05 (401 자동 재시도), SM-12 (handleUnauthorized 4-step), SM-14 (갱신 중 구 토큰 반환)

### Example 2: Tool Handler 리팩토링 전후 비교

**Before (현재 설계, 38-sdk-mcp-interface.md 5.3.2):**
```typescript
// 환경변수 직접 참조, fetch 직접 호출, 에러 처리 인라인
const SESSION_TOKEN = process.env.WAIAAS_SESSION_TOKEN ?? ''
server.tool('get_balance', '...', {}, async () => {
  const res = await fetch(`${BASE_URL}/v1/wallet/balance`, {
    headers: { 'Authorization': `Bearer ${SESSION_TOKEN}` },
  })
  const data = await res.json()
  if (!res.ok) {
    return { content: [{ type: 'text', text: JSON.stringify(data.error) }], isError: true }
  }
  return { content: [{ type: 'text', text: JSON.stringify(data) }] }
})
```

**After (Phase 38 리팩토링):**
```typescript
// ApiClient 사용, SessionManager에 인증 위임, 공통 에러 처리
export function registerGetBalance(server: McpServer, apiClient: ApiClient): void {
  server.tool('get_balance', '...', {}, async () => {
    const result = await apiClient.get('/v1/wallet/balance')
    return toToolResult(result)
  })
}
```

### Example 3: 세션 만료 시 안내 메시지 (isError 회피)

```typescript
// [v0.9] Phase 38 -- H-04 대응: isError 없이 안내 메시지 반환
function toToolResult(result: ApiResult): CallToolResult {
  // 세션 만료/에러 -- isError 미설정
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
      // isError를 설정하지 않음! Claude Desktop 연결 해제 방지
    }
  }

  // 네트워크 에러 -- isError 미설정 (일시적)
  if ('networkError' in result && result.networkError) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'daemon_unavailable',
          message: 'WAIaaS daemon is not responding. Please check if the daemon is running.',
          retryable: true,
        }),
      }],
    }
  }

  // API 에러 (400, 403 등) -- isError 설정
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

  // 성공
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result.data),
    }],
  }
}
```

**Source:** v0.9-PITFALLS.md H-04, MCP 프로토콜 스펙 (isError는 tool execution error용)

### Example 4: 프로세스 생명주기 (Graceful Startup + Shutdown)

```typescript
// packages/mcp/src/index.ts
// [v0.9] Phase 38 -- 프로세스 생명주기 설계

import { SessionManager } from './session-manager.js'
import { ApiClient } from './internal/api-client.js'
import { createMcpServer } from './server.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

async function main(): Promise<void> {
  const sessionManager = new SessionManager({
    baseUrl: process.env.WAIAAS_BASE_URL,
    dataDir: process.env.WAIAAS_DATA_DIR,
    envToken: process.env.WAIAAS_SESSION_TOKEN,
  })

  // SessionManager 시작 (실패해도 MCP Server는 기동)
  try {
    await sessionManager.start()
  } catch (err) {
    console.error(`[waiaas-mcp] SessionManager start failed: ${err}`)
    console.error('[waiaas-mcp] MCP Server will start in degraded mode.')
    // MCP Server는 시작하되, tool 호출 시 세션 만료 안내 반환
  }

  const apiClient = new ApiClient(sessionManager, BASE_URL)
  const server = createMcpServer(apiClient)

  // stdio transport 연결
  const transport = new StdioServerTransport()
  await server.connect(transport)

  // graceful shutdown
  const shutdown = () => {
    sessionManager.dispose()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error(`[waiaas-mcp] Fatal: ${err}`)
  process.exit(1)
})
```

---

## State of the Art

| Old Approach (현재 38-sdk-mcp) | Current Approach (Phase 38 설계) | When Changed | Impact |
|-------------------------------|--------------------------------|--------------|--------|
| `SESSION_TOKEN` 환경변수 직접 참조 | `sessionManager.getToken()` 동적 획득 | v0.9 Phase 38 | 토큰 갱신/교체가 tool handler에 투명 |
| 각 tool handler에서 fetch 직접 호출 | ApiClient 래퍼 메서드 사용 | v0.9 Phase 38 | 인증/재시도/에러 처리 일원화 |
| 401 시 isError: true 반환 | 401 자동 재시도 + handleUnauthorized | v0.9 Phase 38 | 사용자에게 투명한 토큰 전환 |
| 세션 만료 시 isError: true | isError 미설정 + 안내 메시지 | v0.9 Phase 38 | Claude Desktop 연결 해제 방지 |
| SIGTERM 시 즉시 exit | SessionManager.dispose() 호출 후 exit | v0.9 Phase 38 | inflight 갱신 파일 쓰기 보장 |
| 토큰 미존재 시 process.exit(1) | degraded mode로 시작 | v0.9 Phase 38 | MCP 서버 연결 유지, 에러 복구 가능 |

---

## Open Questions

Phase 38 설계에서 추가 확인이 필요한 사항:

1. **SessionManager.getState() public 메서드 추가 여부**
   - What we know: Phase 37에서 `state` 필드는 private이며 getToken()만 public. ApiClient가 세션 상태를 확인하려면 state 접근이 필요
   - What's unclear: getState() 메서드 추가 vs getToken()이 empty string일 때 만료로 판단
   - Recommendation: `getState(): SessionState` public 메서드 추가가 명확. Phase 38에서 결정

2. **에러 복구 루프 (만료 상태에서 주기적 파일 확인) 범위**
   - What we know: M-03 pitfall에서 에러 복구 루프 필요성 제기. 60초마다 파일 확인 제안
   - What's unclear: 이 로직이 SessionManager에 속하는지 ApiClient에 속하는지
   - Recommendation: SessionManager에 `startRecoveryLoop()` 추가. 만료/에러 상태 진입 시 자동 시작, active 복귀 시 중단. Phase 38에서 설계

3. **Resource handler의 세션 만료 처리**
   - What we know: MCP Resources(wallet-balance, wallet-address, system-status)도 데몬 API 호출. 세션 만료 시 동일 문제 발생
   - What's unclear: Resource는 LLM이 context로 사용하므로 에러 형식이 tool과 다를 수 있음
   - Recommendation: Resource도 ApiClient 사용. 만료 시 "세션 만료" 텍스트를 resource 내용으로 반환

4. **`previous_token_hash` 유예 기간 (H-05 데몬 측 대응)**
   - What we know: v0.9-PITFALLS.md H-05에서 데몬 측 유예 기간(5초간 previous_token_hash 보관) 제안
   - What's unclear: 이 변경이 v0.9 범위인지, 구현 단계(v1.x)에서 결정할지
   - Recommendation: v0.9에서는 MCP 측 401 재시도로 대응 (ApiClient). 데몬 측 유예 기간은 EXT-04로 이연 (이미 REQUIREMENTS.md에 명시)

---

## Sources

### Primary (HIGH confidence)
- `.planning/deliverables/38-sdk-mcp-interface.md` -- MCP Server 설계 원본 (섹션 5: tool handler, 섹션 6.4: SessionManager)
- `.planning/phases/37-sessionmanager-core-design/37-01-SUMMARY.md` -- SessionManager 인터페이스 설계 결과
- `.planning/phases/37-sessionmanager-core-design/37-02-SUMMARY.md` -- 갱신/실패/reload 설계 결과
- `.planning/research/v0.9-PITFALLS.md` -- 11개 pitfall (C-01~C-03, H-01~H-05, M-01~M-06)
- [MCP Protocol Tools Specification](https://modelcontextprotocol.io/docs/concepts/tools) -- isError 스펙, tool result format
- `.planning/deliverables/53-session-renewal-protocol.md` -- 토큰 회전, 5종 안전 장치
- `.planning/REQUIREMENTS.md` -- SMGI-01~04 요구사항

### Secondary (MEDIUM confidence)
- [MCP TypeScript SDK Middleware Feature Request #1238](https://github.com/modelcontextprotocol/typescript-sdk/issues/1238) -- 미들웨어 미지원 확인
- [MCP TypeScript SDK Server Documentation](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) -- tool registration pattern
- [MCPcat Error Handling Guide](https://mcpcat.io/guides/error-handling-custom-mcp-servers/) -- isError 사용 가이드
- [MCP Server Disconnection Discussion](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1231) -- stdout 오염 연결 끊김

### Tertiary (LOW confidence)
- [Claude Code MCP 16h hang issue #15945](https://github.com/anthropics/claude-code/issues/15945) -- MCP 반복 에러 연결 해제 추정 근거
- [Claude Code auto-reconnect #15904](https://github.com/anthropics/claude-code/issues/15904) -- 연결 해제 후 복구 어려움 확인

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Phase 37에서 확정된 스택 그대로 사용, 새로운 라이브러리 없음
- Architecture: HIGH - ApiClient 래퍼 패턴은 MCP SDK 미들웨어 부재로 인한 유일한 현실적 접근. 프로젝트 내부 문서와 MCP 스펙으로 교차 검증
- Pitfalls: HIGH - v0.9-PITFALLS.md에서 11개 함정이 이미 식별되어 있고, Phase 37에서 C-01/C-03/H-01/H-02/H-05 대응이 완료됨. Phase 38에서 H-04/H-05(tool handler 측)/M-03 대응 필요

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (MCP SDK v2 출시 시 재검토 필요)
