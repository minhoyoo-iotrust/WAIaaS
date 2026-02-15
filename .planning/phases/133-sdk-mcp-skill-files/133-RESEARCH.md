# Phase 133: SDK + MCP + 스킬 파일 - Research

**Researched:** 2026-02-15
**Domain:** SDK/MCP/Skill File 통합 패턴 (WAIaaS 내부 코드베이스)
**Confidence:** HIGH

## Summary

Phase 133은 이미 구현된 REST API 엔드포인트 `POST /v1/x402/fetch`를 TS SDK, Python SDK, MCP 도구로 래핑하고, 새로운 `x402.skill.md` 스킬 파일을 생성하며, 기존 `transactions.skill.md`에 x402 결제 내역 조회 관련 내용을 추가하는 작업이다.

코드베이스 조사 결과, SDK/MCP/스킬 파일 추가는 완전히 정립된 패턴을 따른다. TS SDK는 `WAIaaSClient` 클래스에 메서드 추가 + `types.ts`에 타입 정의 + `index.ts`에 export 추가. Python SDK는 `client.py`에 메서드 추가 + `models.py`에 Pydantic 모델 + `__init__.py`에 export. MCP는 별도 `tools/x402-fetch.ts` 파일로 register 함수 작성 + `server.ts`에 등록. 스킬 파일은 `skills/x402.skill.md` 생성 + daemon의 `VALID_SKILLS` 배열 + MCP의 `SKILL_NAMES` 배열 갱신.

**Primary recommendation:** 기존 `signTransaction`/`sign_transaction` 구현 패턴을 정확히 따라 x402Fetch/x402_fetch/x402_fetch 도구를 추가하라. 스킬 파일 등록 시 daemon과 MCP 양쪽 모두의 배열을 반드시 갱신할 것.

## Standard Stack

### Core (이미 사용 중 -- 추가 의존성 없음)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @waiaas/sdk | 내부 | TS SDK 클라이언트 | WAIaaS 공식 SDK |
| waiaas (Python) | 0.1.0 | Python SDK 클라이언트 | pydantic v2 + httpx 기반 |
| @modelcontextprotocol/sdk | MCP 표준 | MCP 서버 프레임워크 | 공식 MCP SDK |
| zod | 3.x | MCP 도구 파라미터 스키마 | Hono/MCP 양쪽에서 사용 |
| vitest | - | TS 테스트 | 프로젝트 표준 |
| pytest | - | Python 테스트 | 프로젝트 표준 |

### Supporting
새로운 의존성 추가 불필요. 모든 패키지가 이미 설치되어 있음.

**Installation:** 추가 설치 없음.

## Architecture Patterns

### TS SDK 메서드 추가 패턴 (signTransaction 기준)

**파일 수정 순서:**
1. `packages/sdk/src/types.ts` -- 요청/응답 타입 정의
2. `packages/sdk/src/client.ts` -- 메서드 추가
3. `packages/sdk/src/index.ts` -- 타입 export 추가
4. `packages/sdk/src/__tests__/client.test.ts` -- 테스트 추가

**메서드 구현 패턴:**
```typescript
// types.ts
export interface X402FetchParams {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string;
}

export interface X402PaymentInfo {
  amount: string;
  asset: string;
  network: string;
  payTo: string;
  txId: string;
}

export interface X402FetchResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  payment?: X402PaymentInfo;
}
```

```typescript
// client.ts -- 메서드 추가 패턴
async x402Fetch(params: X402FetchParams): Promise<X402FetchResponse> {
  return withRetry(
    () => this.http.post<X402FetchResponse>(
      '/v1/x402/fetch',
      params,
      this.authHeaders(),
    ),
    this.retryOptions,
  );
}
```

**핵심 규칙:**
- `withRetry()` 래퍼로 감싸기
- `this.authHeaders()` 사용 (sessionAuth)
- `this.http.post<T>()` 제네릭 타입 지정
- 파라미터 객체를 그대로 body로 전달 (내부 변환 불필요)

### Python SDK 메서드 추가 패턴 (sign_transaction 기준)

**파일 수정 순서:**
1. `python-sdk/waiaas/models.py` -- Pydantic 모델 정의
2. `python-sdk/waiaas/client.py` -- 메서드 추가
3. `python-sdk/waiaas/__init__.py` -- export 추가
4. `python-sdk/tests/test_client.py` -- 테스트 추가

**모델 패턴:**
```python
# models.py
class X402FetchRequest(BaseModel):
    url: str
    method: Optional[str] = None
    headers: Optional[dict[str, str]] = None
    body: Optional[str] = None

    model_config = {"populate_by_name": True}

class X402PaymentInfo(BaseModel):
    amount: str
    asset: str
    network: str
    pay_to: str = Field(alias="payTo")
    tx_id: str = Field(alias="txId")

    model_config = {"populate_by_name": True}

class X402FetchResponse(BaseModel):
    status: int
    headers: dict[str, str]
    body: str
    payment: Optional[X402PaymentInfo] = None

    model_config = {"populate_by_name": True}
```

**클라이언트 메서드 패턴:**
```python
# client.py
async def x402_fetch(
    self,
    url: str,
    *,
    method: Optional[str] = None,
    headers: Optional[dict[str, str]] = None,
    body: Optional[str] = None,
) -> X402FetchResponse:
    """POST /v1/x402/fetch -- Fetch URL with x402 auto-payment."""
    request = X402FetchRequest(url=url, method=method, headers=headers, body=body)
    body_dict = request.model_dump(exclude_none=True, by_alias=True)
    resp = await self._request("POST", "/v1/x402/fetch", json_body=body_dict)
    return X402FetchResponse.model_validate(resp.json())
```

**핵심 규칙:**
- `model_dump(exclude_none=True, by_alias=True)` 로 직렬화
- `model_validate(resp.json())` 로 역직렬화
- `Field(alias="camelCase")` 로 JSON camelCase ↔ Python snake_case 매핑
- `_request()` 내부에서 retry + 에러 처리 자동 적용

### MCP 도구 추가 패턴 (sign_transaction 기준)

**파일 추가/수정:**
1. `packages/mcp/src/tools/x402-fetch.ts` -- 새 파일 생성
2. `packages/mcp/src/server.ts` -- import + register 추가
3. `packages/mcp/src/__tests__/tools.test.ts` -- 테스트 추가

**도구 등록 패턴:**
```typescript
// tools/x402-fetch.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerX402Fetch(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'x402_fetch',
    withWalletPrefix(
      'Fetch a URL with automatic x402 payment. If the server responds with HTTP 402, automatically sign a payment and retry. Returns the response along with payment details if payment was made.',
      walletContext?.walletName,
    ),
    {
      url: z.string().url().describe('Target URL to fetch'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional()
        .describe('HTTP method (default: GET)'),
      headers: z.record(z.string()).optional()
        .describe('Additional HTTP headers'),
      body: z.string().optional()
        .describe('Request body string'),
    },
    async (args) => {
      const requestBody: Record<string, unknown> = { url: args.url };
      if (args.method) requestBody['method'] = args.method;
      if (args.headers) requestBody['headers'] = args.headers;
      if (args.body) requestBody['body'] = args.body;
      const result = await apiClient.post('/v1/x402/fetch', requestBody);
      return toToolResult(result);
    },
  );
}
```

**server.ts 수정 패턴:**
```typescript
// 1. import 추가
import { registerX402Fetch } from './tools/x402-fetch.js';

// 2. register 호출 추가 (다른 register 호출 이후)
registerX402Fetch(server, apiClient, walletContext);
```

**핵심 규칙:**
- `server.tool(name, description, schema, handler)` 4-arg 패턴
- `withWalletPrefix()` 로 멀티월렛 지원
- `toToolResult()` 로 ApiResult → CallToolResult 변환
- 옵셔널 필드는 `if (args.xxx) body['xxx'] = args.xxx;` 패턴
- 도구 이름은 snake_case (`x402_fetch`)

### 스킬 파일 추가 패턴

**파일 추가/수정:**
1. `skills/x402.skill.md` -- 새 스킬 파일 생성
2. `packages/daemon/src/api/routes/skills.ts` -- `VALID_SKILLS` 배열에 `'x402'` 추가
3. `packages/mcp/src/resources/skills.ts` -- `SKILL_NAMES` 배열에 `'x402'` 추가

**스킬 파일 형식 (frontmatter):**
```yaml
---
name: "WAIaaS x402"
description: "x402 auto-payment protocol: fetch URLs with automatic cryptocurrency payments"
category: "api"
tags: [wallet, blockchain, x402, payments, waiass]
version: "1.5.1"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---
```

**CRITICAL 발견: 두 곳 모두 갱신해야 MCP 리소스로 노출됨**
- `VALID_SKILLS` (daemon): `GET /v1/skills/x402` 엔드포인트 활성화
- `SKILL_NAMES` (MCP): `waiaas://skills/x402` 리소스 노출

### Anti-Patterns to Avoid
- **Python snake_case 필드명 직접 전송:** `by_alias=True` 없이 model_dump 사용하면 camelCase 대신 snake_case가 전송되어 API 호환성 깨짐
- **MCP 도구에서 직접 fetch 호출:** 반드시 `apiClient.post()` 통해 호출 (토큰 관리, 에러 처리 자동화)
- **스킬 파일만 생성하고 배열 갱신 안 함:** daemon과 MCP 양쪽의 VALID_SKILLS/SKILL_NAMES 배열을 모두 갱신해야 함
- **SDK 타입을 @waiaas/core에서 import:** SDK는 zero-dependency -- 타입을 자체 정의해야 함

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP retry 로직 | 커스텀 retry | `withRetry()` (TS) / `with_retry()` (Python) | 지수 백오프, 재시도 가능 상태코드 판별 내장 |
| 인증 헤더 주입 | 수동 헤더 구성 | `authHeaders()` (TS) / `_build_headers()` (Python) | 토큰 누락 시 에러 처리 포함 |
| MCP 결과 변환 | 수동 JSON 래핑 | `toToolResult()` | isError/expired/networkError 분기 자동 처리 (H-04) |
| Zod 스키마 → MCP 파라미터 | 수동 JSON Schema | `z.string()`, `z.record()` 직접 사용 | MCP SDK가 Zod 네이티브 지원 |

## Common Pitfalls

### Pitfall 1: 스킬 파일 등록 누락
**What goes wrong:** `x402.skill.md`를 `skills/` 디렉토리에 생성했지만 `VALID_SKILLS`나 `SKILL_NAMES` 배열을 갱신하지 않음
**Why it happens:** 두 개의 다른 패키지(daemon, mcp)에 동일한 상수 배열이 존재
**How to avoid:** daemon `skills.ts`의 `VALID_SKILLS` + MCP `skills.ts`의 `SKILL_NAMES` 양쪽 모두 갱신
**Warning signs:** `GET /v1/skills/x402` 가 404 반환, `waiaas://skills/x402` MCP 리소스 목록에 미노출

### Pitfall 2: Python 모델의 alias 누락
**What goes wrong:** `payTo`, `txId` 같은 camelCase JSON 필드를 snake_case로 정의만 하고 `Field(alias="...")` 미지정
**Why it happens:** Python에서 snake_case가 관례라 alias 필요성을 간과
**How to avoid:** 모든 camelCase JSON 필드에 `Field(alias="camelCase")` + `model_config = {"populate_by_name": True}` 적용
**Warning signs:** `model_validate()` 시 필드 누락 또는 None

### Pitfall 3: TS SDK index.ts export 누락
**What goes wrong:** 새 타입을 `types.ts`에 정의했지만 `index.ts`의 `export type` 목록에 추가하지 않음
**Why it happens:** 단순 누락
**How to avoid:** 새 타입 추가 시 반드시 `index.ts`의 export 블록 확인
**Warning signs:** SDK 사용자가 import 시 타입을 찾지 못함

### Pitfall 4: MCP server.ts 등록 누락
**What goes wrong:** `tools/x402-fetch.ts`를 생성했지만 `server.ts`에 import + register 호출 추가하지 않음
**Why it happens:** 파일 생성과 등록이 별개 단계
**How to avoid:** 도구 파일 생성 → server.ts import → register 호출 → 테스트 순서로 작업
**Warning signs:** MCP 서버에 도구가 나타나지 않음

### Pitfall 5: x402 응답 스키마의 payment 필드 Optional 처리
**What goes wrong:** `payment` 필드를 required로 정의하면 402가 아닌 일반 응답(passthrough)에서 파싱 실패
**Why it happens:** x402 API는 402 응답 시에만 `payment` 필드를 포함함. 일반 passthrough 시 `payment` 없음
**How to avoid:** `payment?: X402PaymentInfo` (TS) / `payment: Optional[X402PaymentInfo] = None` (Python)
**Warning signs:** 일반 HTTP 요청(비-402) 시 SDK 에러 발생

## Code Examples

### TS SDK x402Fetch 메서드 (signTransaction 패턴 기준)
```typescript
// Source: packages/sdk/src/client.ts (signTransaction 패턴 적용)
async x402Fetch(params: X402FetchParams): Promise<X402FetchResponse> {
  return withRetry(
    () => this.http.post<X402FetchResponse>(
      '/v1/x402/fetch',
      params,
      this.authHeaders(),
    ),
    this.retryOptions,
  );
}
```

### Python SDK x402_fetch 메서드 (sign_transaction 패턴 기준)
```python
# Source: python-sdk/waiaas/client.py (sign_transaction 패턴 적용)
async def x402_fetch(
    self,
    url: str,
    *,
    method: Optional[str] = None,
    headers: Optional[dict[str, str]] = None,
    body: Optional[str] = None,
) -> X402FetchResponse:
    """POST /v1/x402/fetch -- Fetch URL with x402 auto-payment.

    Args:
        url: Target URL to fetch.
        method: HTTP method (GET, POST, PUT, DELETE, PATCH). Defaults to GET.
        headers: Additional HTTP headers to include.
        body: Request body string.

    Returns:
        X402FetchResponse with status, headers, body, and optional payment info.
    """
    request = X402FetchRequest(url=url, method=method, headers=headers, body=body)
    body_dict = request.model_dump(exclude_none=True, by_alias=True)
    resp = await self._request("POST", "/v1/x402/fetch", json_body=body_dict)
    return X402FetchResponse.model_validate(resp.json())
```

### MCP x402_fetch 도구 (sign_transaction 패턴 기준)
```typescript
// Source: packages/mcp/src/tools/sign-transaction.ts 패턴 적용
export function registerX402Fetch(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'x402_fetch',
    withWalletPrefix(
      'Fetch a URL with automatic x402 payment...',
      walletContext?.walletName,
    ),
    {
      url: z.string().url().describe('Target URL to fetch'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().describe('HTTP method'),
      headers: z.record(z.string()).optional().describe('Additional HTTP headers'),
      body: z.string().optional().describe('Request body string'),
    },
    async (args) => {
      const requestBody: Record<string, unknown> = { url: args.url };
      if (args.method) requestBody['method'] = args.method;
      if (args.headers) requestBody['headers'] = args.headers;
      if (args.body) requestBody['body'] = args.body;
      const result = await apiClient.post('/v1/x402/fetch', requestBody);
      return toToolResult(result);
    },
  );
}
```

### TS SDK 테스트 패턴 (client.test.ts signTransaction 기준)
```typescript
// Source: packages/sdk/src/__tests__/client.test.ts
describe('x402Fetch', () => {
  it('should call POST /v1/x402/fetch with correct body', async () => {
    const client = new WAIaaSClient({
      baseUrl: 'http://localhost:3000',
      sessionToken: mockToken,
    });

    const expected = {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"data": "result"}',
      payment: {
        amount: '1000000',
        asset: 'USDC',
        network: 'eip155:8453',
        payTo: '0x...',
        txId: 'tx-001',
      },
    };

    fetchSpy.mockResolvedValue(mockResponse(expected));

    const result = await client.x402Fetch({ url: 'https://api.example.com/data' });
    expect(result).toEqual(expected);

    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toBe('http://localhost:3000/v1/x402/fetch');
  });
});
```

### Python SDK 테스트 패턴 (test_client.py 기준)
```python
# Source: python-sdk/tests/test_client.py
class TestX402Fetch:
    async def test_fetch_with_payment(self):
        handler = make_handler({
            ("POST", "/v1/x402/fetch"): (200, {
                "status": 200,
                "headers": {"content-type": "application/json"},
                "body": '{"data": "result"}',
                "payment": {
                    "amount": "1000000",
                    "asset": "USDC",
                    "network": "eip155:8453",
                    "payTo": "0x...",
                    "txId": "tx-001",
                },
            }),
        })
        client = make_client(handler)
        result = await client.x402_fetch("https://api.example.com/data")
        assert isinstance(result, X402FetchResponse)
        assert result.payment is not None
        assert result.payment.amount == "1000000"
```

### MCP 도구 테스트 패턴 (tools.test.ts 기준)
```typescript
// Source: packages/mcp/src/__tests__/tools.test.ts
describe('x402_fetch tool', () => {
  it('calls POST /v1/x402/fetch with correct params', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/x402/fetch', { ok: true, data: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: '{"result": true}',
      } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerX402Fetch, apiClient);

    const result = await handler({ url: 'https://api.example.com' });
    expect(apiClient.post).toHaveBeenCalledWith('/v1/x402/fetch', {
      url: 'https://api.example.com',
    });
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 5개 스킬 파일 (VALID_SKILLS) | 6개 이상 (actions 미등록 발견) | v1.5.0 | actions.skill.md 존재하지만 VALID_SKILLS 미포함 |
| 14 MCP 도구 | 15+ (x402_fetch 추가 시) | 이번 Phase | MCP 도구 수 증가 |

**주의: `actions.skill.md` 미등록 이슈**
- `skills/actions.skill.md` 파일이 디스크에 존재하지만 `VALID_SKILLS`와 `SKILL_NAMES` 배열에 `'actions'`가 포함되어 있지 않음
- x402 스킬 파일 추가 시 `'actions'`도 함께 추가하는 것을 권장 (별도 이슈로 추적 가능)

## REST API 엔드포인트 상세 (x402.ts 기준)

**POST /v1/x402/fetch** (sessionAuth)

요청:
```json
{
  "url": "https://api.example.com/premium/data",
  "method": "GET",
  "headers": {"Accept": "application/json"},
  "body": null
}
```

응답 (비-402 passthrough):
```json
{
  "status": 200,
  "headers": {"content-type": "application/json"},
  "body": "{\"data\": \"free content\"}"
}
```

응답 (402 결제 후):
```json
{
  "status": 200,
  "headers": {"content-type": "application/json"},
  "body": "{\"data\": \"premium content\"}",
  "payment": {
    "amount": "1000000",
    "asset": "USDC",
    "network": "eip155:8453",
    "payTo": "0xPaymentReceiver",
    "txId": "01958f3c-9999-7000-8000-abcdef999999"
  }
}
```

에러 코드: `X402_DISABLED`, `X402_DOMAIN_NOT_ALLOWED`, `X402_SSRF_BLOCKED`, `X402_UNSUPPORTED_SCHEME`, `X402_PAYMENT_REJECTED`, `X402_DELAY_TIMEOUT`, `X402_APPROVAL_REQUIRED`, `X402_SERVER_ERROR`, `WALLET_NOT_FOUND`, `POLICY_DENIED`

## transactions.skill.md 업데이트 포인트

기존 `transactions.skill.md`에 x402 결제 내역 조회 관련 내용을 추가해야 할 영역:
1. **Section 1 (Overview)**: X402_PAYMENT 타입을 테이블에 추가
2. **Section 7 (Transaction Lifecycle)**: X402_PAYMENT 트랜잭션의 lifecycle 설명
3. **Section 9 (Error Reference)**: x402 관련 에러 코드 추가
4. **새 Section**: "x402 결제 내역 조회" -- `GET /v1/transactions?type=X402_PAYMENT` (type 필터가 있다면) 또는 list_transactions로 X402_PAYMENT 타입 조회 설명

## Open Questions

1. **transactions API의 type 필터링 지원 여부**
   - What we know: `GET /v1/transactions`는 `limit`과 `cursor` 파라미터만 지원
   - What's unclear: `type` 쿼리 파라미터로 X402_PAYMENT 필터링이 가능한지
   - Recommendation: 현재는 type 필터 없음. transactions.skill.md에는 listTransactions로 조회 후 type 필드로 X402_PAYMENT 식별하라고 안내

2. **`actions.skill.md` 미등록 이슈**
   - What we know: 파일은 존재하지만 VALID_SKILLS/SKILL_NAMES에 미포함
   - What's unclear: 의도적 누락인지 버그인지
   - Recommendation: x402 등록 시 actions도 함께 추가 (총 7개로 갱신)

## Sources

### Primary (HIGH confidence)
- `packages/sdk/src/client.ts` -- TS SDK 메서드 패턴 (signTransaction)
- `packages/sdk/src/types.ts` -- TS SDK 타입 정의 패턴
- `packages/sdk/src/index.ts` -- TS SDK export 패턴
- `packages/sdk/src/__tests__/client.test.ts` -- TS SDK 테스트 패턴
- `packages/sdk/src/internal/http.ts` -- HttpClient post/get 패턴
- `python-sdk/waiaas/client.py` -- Python SDK 메서드 패턴 (sign_transaction)
- `python-sdk/waiaas/models.py` -- Python Pydantic 모델 패턴
- `python-sdk/waiaas/__init__.py` -- Python export 패턴
- `python-sdk/tests/test_client.py` -- Python 테스트 패턴
- `packages/mcp/src/tools/sign-transaction.ts` -- MCP 도구 등록 패턴
- `packages/mcp/src/server.ts` -- MCP 서버 도구 등록 순서
- `packages/mcp/src/api-client.ts` -- ApiClient + toToolResult 패턴
- `packages/mcp/src/resources/skills.ts` -- MCP 스킬 리소스 등록 (SKILL_NAMES)
- `packages/daemon/src/api/routes/skills.ts` -- daemon 스킬 라우트 (VALID_SKILLS)
- `packages/daemon/src/api/routes/x402.ts` -- x402 API 엔드포인트 구현 상세
- `skills/transactions.skill.md` -- 기존 transactions 스킬 파일 구조
- `skills/actions.skill.md` -- 최근 추가된 스킬 파일 형식 참고

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 코드베이스 내 패턴 직접 확인
- Architecture: HIGH -- 기존 구현체(signTransaction, sign_transaction, sign_transaction MCP) 패턴 정확히 파악
- Pitfalls: HIGH -- 코드 분석으로 실제 미등록 이슈(actions.skill.md) 발견

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (내부 코드베이스 패턴, 안정적)
