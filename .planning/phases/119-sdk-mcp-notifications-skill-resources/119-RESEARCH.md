# Phase 119: SDK + MCP + Notifications + Skill Resources - Research

**Researched:** 2026-02-15
**Domain:** TS/Python SDK sign-only 메서드, MCP sign_transaction 도구, MCP 스킬 리소스, POLICY_VIOLATION 알림 보강, 스킬 파일 업데이트
**Confidence:** HIGH

## Summary

Phase 119는 Phase 117(sign-only 파이프라인 + REST API)과 Phase 118(EVM calldata 인코딩)에서 구현된 기능을 SDK, MCP, 알림 계층으로 확장하는 통합 페이즈이다. 구체적으로 3개 영역을 다룬다: (1) TS/Python SDK에 `signTransaction()` / `sign_transaction()` 메서드 추가 및 MCP `sign_transaction` 도구 등록, (2) `waiaas://skills/{name}` URI로 5개 스킬 파일을 MCP 리소스로 노출하고 daemon에 `GET /v1/skills/:name` 엔드포인트 추가, (3) POLICY_VIOLATION 알림에 `contractAddress`, `tokenAddress`, `policyType` 필드와 Admin UI 딥링크 추가.

이 페이즈의 핵심은 새로운 기능을 구현하는 것이 아니라 기존 패턴을 따라 확장하는 것이다. TS SDK는 `sendToken()` 패턴, Python SDK는 `send_token()` 패턴, MCP 도구는 `call_contract` 패턴, MCP 리소스는 `wallet-balance` 패턴을 그대로 따른다. 알림 보강은 `stages.ts`의 `notify()` 호출에 전달하는 `vars` 레코드를 풍부하게 하는 것으로 구현된다.

신규 의존성은 없다. 모든 필요 라이브러리(@modelcontextprotocol/sdk의 ResourceTemplate, httpx/pydantic, zod, viem)가 이미 워크스페이스에 존재한다. 스킬 리소스의 파일 읽기는 daemon의 `GET /v1/skills/:name` REST API를 경유하여 MCP ApiClient 패턴과 일관성을 유지한다.

**Primary recommendation:** 3개 플랜으로 분리 -- (1) SDK + MCP sign_transaction은 기존 sendToken/call_contract 패턴 복제, (2) 스킬 리소스는 daemon skills 라우트 + MCP ResourceTemplate, (3) 알림 보강은 stages.ts의 notify vars 확장 + i18n 템플릿 업데이트. 모두 기존 패턴을 따르므로 복잡도가 낮다.

## Standard Stack

### Core (기존 의존성 -- 신규 추가 없음)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @waiaas/sdk | workspace | TS SDK signTransaction() 메서드 | 기존 WAIaaSClient 클래스 확장 |
| waiaas (Python) | 0.1.0 | Python SDK sign_transaction() 메서드 | 기존 WAIaaSClient 클래스 확장 |
| @modelcontextprotocol/sdk | 1.26.0 | MCP sign_transaction 도구 + ResourceTemplate 스킬 리소스 | 기존 MCP 서버에 도구/리소스 추가 |
| @hono/zod-openapi | workspace | GET /v1/skills/:name 라우트 | 기존 daemon 라우트 패턴 |
| @waiaas/core | workspace | NotificationEventType, i18n 템플릿 | 알림 보강에 기존 인프라 활용 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | workspace | 스킬 라우트 스키마, MCP 도구 파라미터 | 요청/응답 검증 |
| httpx | Python SDK | sign_transaction HTTP 호출 | Python SDK 메서드 |
| pydantic v2 | Python SDK | SignTransactionRequest/Response 모델 | Python SDK 타입 |
| node:fs | built-in | skills/ 디렉토리 파일 읽기 (daemon) | GET /v1/skills/:name 핸들러 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Daemon REST API로 스킬 서빙 | MCP에서 직접 파일 읽기 | REST API 경유가 ApiClient 패턴과 일관적, MCP 서버가 파일 시스템 위치를 알 필요 없음 |
| ResourceTemplate 기반 동적 리소스 | 5개 정적 resource 등록 | ResourceTemplate이 `{name}` URI 패턴을 정확히 지원하고 list/read를 통합 처리 |
| i18n 템플릿 수정 | notify 호출 시 메시지 직접 구성 | 기존 getNotificationMessage 패턴 유지, 다국어 지원 |

**Installation:**
```bash
# 신규 패키지 불필요 -- 모든 의존성 이미 존재
```

## Architecture Patterns

### Recommended File Changes
```
Plan 119-01: SDK + MCP sign_transaction
  packages/sdk/src/
    client.ts             # ADD: signTransaction() 메서드
    types.ts              # ADD: SignTransactionParams, SignTransactionResponse
    validation.ts         # ADD: validateSignTransaction (optional)
    index.ts              # ADD: export new types
    __tests__/client.test.ts  # ADD: signTransaction 테스트

  python-sdk/waiaas/
    client.py             # ADD: sign_transaction() 메서드
    models.py             # ADD: SignTransactionRequest, SignTransactionResponse
    __init__.py           # ADD: export new models
    tests/test_models.py  # ADD: sign_transaction 모델 테스트

  packages/mcp/src/
    tools/sign-transaction.ts  # NEW: sign_transaction 도구
    server.ts                  # ADD: registerSignTransaction import + 등록
    __tests__/tools.test.ts    # ADD: sign_transaction 도구 테스트

Plan 119-02: MCP 스킬 리소스
  packages/daemon/src/api/routes/
    skills.ts             # NEW: GET /v1/skills/:name 라우트
    index.ts              # ADD: skillsRoutes export
    openapi-schemas.ts    # ADD: SkillResponseSchema

  packages/daemon/src/api/
    server.ts             # ADD: skills 라우트 등록 (public, no auth)

  packages/mcp/src/
    resources/skills.ts   # NEW: waiaas://skills/{name} ResourceTemplate
    server.ts             # ADD: registerSkillResources import + 등록
    __tests__/resources.test.ts  # ADD: 스킬 리소스 테스트

Plan 119-03: 알림 보강 + 스킬 파일 업데이트
  packages/daemon/src/pipeline/
    stages.ts             # MODIFY: POLICY_VIOLATION notify vars 확장

  packages/core/src/i18n/
    en.ts                 # MODIFY: POLICY_VIOLATION 템플릿 확장
    ko.ts                 # MODIFY: POLICY_VIOLATION 템플릿 확장

  skills/
    transactions.skill.md # MODIFY: sign-only API 섹션 추가
```

### Pattern 1: TS SDK signTransaction() 메서드
**What:** 기존 `sendToken()` 패턴을 따라 `POST /v1/transactions/sign`을 호출하는 메서드
**When to use:** 외부 dApp이 구성한 unsigned tx를 서명만 필요할 때
**Example:**
```typescript
// Source: packages/sdk/src/client.ts (기존 sendToken 패턴 참고)
async signTransaction(params: SignTransactionParams): Promise<SignTransactionResponse> {
  return withRetry(
    () => this.http.post<SignTransactionResponse>(
      '/v1/transactions/sign',
      params,
      this.authHeaders(),
    ),
    this.retryOptions,
  );
}
```

### Pattern 2: Python SDK sign_transaction() 메서드
**What:** 기존 `send_token()` 패턴을 따라 `POST /v1/transactions/sign`을 호출하는 async 메서드
**When to use:** Python 에이전트에서 sign-only API 사용 시
**Example:**
```python
# Source: python-sdk/waiaas/client.py (기존 send_token 패턴 참고)
async def sign_transaction(
    self,
    transaction: str,
    *,
    chain: Optional[str] = None,
    network: Optional[str] = None,
) -> SignTransactionResponse:
    """POST /v1/transactions/sign -- Sign an unsigned transaction."""
    request = SignTransactionRequest(
        transaction=transaction, chain=chain, network=network
    )
    body = request.model_dump(exclude_none=True, by_alias=True)
    resp = await self._request("POST", "/v1/transactions/sign", json_body=body)
    return SignTransactionResponse.model_validate(resp.json())
```

### Pattern 3: MCP sign_transaction 도구
**What:** 기존 `call_contract` 도구 패턴을 따라 `POST /v1/transactions/sign`을 호출하는 MCP 도구
**When to use:** AI 에이전트가 MCP를 통해 외부 트랜잭션 서명 시
**Example:**
```typescript
// Source: packages/mcp/src/tools/sign-transaction.ts (기존 call_contract 패턴 참고)
export function registerSignTransaction(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'sign_transaction',
    withWalletPrefix(
      'Sign an unsigned transaction built by an external dApp. Parses the transaction, evaluates policies, and returns signed bytes. Does NOT submit to blockchain.',
      walletContext?.walletName,
    ),
    {
      transaction: z.string().describe('Unsigned transaction (base64 for Solana, 0x-hex for EVM)'),
      network: z.string().optional().describe('Target network. Defaults to wallet default network.'),
    },
    async (args) => {
      const body: Record<string, unknown> = { transaction: args.transaction };
      if (args.network !== undefined) body.network = args.network;
      const result = await apiClient.post('/v1/transactions/sign', body);
      return toToolResult(result);
    },
  );
}
```

### Pattern 4: MCP 스킬 리소스 (ResourceTemplate)
**What:** `waiaas://skills/{name}` URI 패턴으로 5개 스킬 파일을 MCP 리소스로 등록
**When to use:** AI 에이전트가 API 문서를 in-context로 참조할 때
**Example:**
```typescript
// Source: packages/mcp/src/resources/skills.ts (NEW)
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toResourceResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

const SKILL_NAMES = ['quickstart', 'wallet', 'transactions', 'policies', 'admin'];

export function registerSkillResources(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  const skillTemplate = new ResourceTemplate(
    'waiaas://skills/{name}',
    {
      list: async () => ({
        resources: SKILL_NAMES.map(name => ({
          uri: `waiaas://skills/${name}`,
          name: `${name} skill`,
          description: withWalletPrefix(`API reference: ${name}`, walletContext?.walletName),
          mimeType: 'text/markdown',
        })),
      }),
    },
  );

  server.resource(
    'API Skills',
    skillTemplate,
    {
      description: withWalletPrefix('WAIaaS API skill reference files', walletContext?.walletName),
      mimeType: 'text/markdown',
    },
    async (uri, { name }) => {
      // Fetch from daemon REST API via ApiClient
      const result = await apiClient.get(`/v1/skills/${name as string}`);
      if ('ok' in result && result.ok) {
        const data = result.data as { content: string };
        return {
          contents: [{
            uri: uri.href,
            text: data.content,
            mimeType: 'text/markdown',
          }],
        };
      }
      return toResourceResult(uri.href, result);
    },
  );
}
```

### Pattern 5: Daemon GET /v1/skills/:name 라우트
**What:** skills/ 디렉토리에서 마크다운 파일을 읽어 JSON 응답으로 반환하는 stateless 라우트
**When to use:** MCP 스킬 리소스의 데이터 소스
**Example:**
```typescript
// Source: packages/daemon/src/api/routes/skills.ts (NEW)
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { WAIaaSError } from '@waiaas/core';
import { openApiValidationHook, buildErrorResponses } from './openapi-schemas.js';

// Resolve skills/ directory relative to daemon package root
const __filename = fileURLToPath(import.meta.url);
const SKILLS_DIR = resolve(dirname(__filename), '..', '..', '..', '..', '..', 'skills');

const VALID_SKILLS = ['quickstart', 'wallet', 'transactions', 'policies', 'admin'];

const getSkillRoute = createRoute({
  method: 'get',
  path: '/skills/{name}',
  tags: ['Skills'],
  summary: 'Get skill file content',
  request: {
    params: z.object({ name: z.string() }),
  },
  responses: {
    200: {
      description: 'Skill content',
      content: {
        'application/json': {
          schema: z.object({
            name: z.string(),
            content: z.string(),
          }),
        },
      },
    },
    ...buildErrorResponses(['RESOURCE_NOT_FOUND']),
  },
});

export function skillsRoutes(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(getSkillRoute, (c) => {
    const { name } = c.req.valid('param');
    if (!VALID_SKILLS.includes(name)) {
      throw new WAIaaSError('RESOURCE_NOT_FOUND', {
        message: `Skill '${name}' not found`,
      });
    }

    const filePath = resolve(SKILLS_DIR, `${name}.skill.md`);
    if (!existsSync(filePath)) {
      throw new WAIaaSError('RESOURCE_NOT_FOUND', {
        message: `Skill file '${name}.skill.md' not found`,
      });
    }

    const content = readFileSync(filePath, 'utf-8');
    return c.json({ name, content }, 200);
  });

  return router;
}
```

### Pattern 6: POLICY_VIOLATION 알림 보강
**What:** stages.ts의 stage3Policy에서 POLICY_VIOLATION notify 호출 시 vars에 상세 필드 추가
**When to use:** 정책 위반 시 알림에 contractAddress, tokenAddress, policyType 포함
**Example:**
```typescript
// Source: packages/daemon/src/pipeline/stages.ts (수정)
// 현재 코드 (L292-297):
void ctx.notificationService?.notify('POLICY_VIOLATION', ctx.walletId, {
  reason: evaluation.reason ?? 'Policy denied',
  amount: getRequestAmount(ctx.request),
  to: getRequestTo(ctx.request),
}, { txId: ctx.txId });

// 보강 코드:
void ctx.notificationService?.notify('POLICY_VIOLATION', ctx.walletId, {
  reason: evaluation.reason ?? 'Policy denied',
  amount: getRequestAmount(ctx.request),
  to: getRequestTo(ctx.request),
  policyType: extractPolicyType(evaluation.reason),
  tokenAddress: ctx.request.tokenAddress ?? '',
  contractAddress: ctx.request.contractAddress ?? '',
  adminLink: '/admin/policies',
}, { txId: ctx.txId });
```

### Anti-Patterns to Avoid
- **MCP에서 파일 시스템 직접 접근:** MCP 서버는 daemon과 별도 프로세스. skills/ 파일 경로를 알 수 없음. 반드시 daemon REST API 경유.
- **스킬 리소스를 정적 URI 5개로 등록:** `ResourceTemplate`을 사용하면 `resources/list`에서 5개가 한번에 나열되고 `{name}` 패턴으로 읽기 가능. 5개 개별 등록은 코드 중복.
- **POLICY_VIOLATION 알림 템플릿에 모든 필드를 하드코딩:** 기존 `{key}` interpolation 패턴을 활용해 vars에 필드만 추가하면 됨. 새 템플릿 엔진 불필요.
- **sign_transaction MCP 도구에 chain 파라미터 노출:** chain은 wallet에서 자동 추론됨. 불필요한 파라미터는 AI 에이전트를 혼란하게 함.
- **Python SDK에서 camelCase JSON 키를 직접 사용:** Pydantic `Field(alias=...)` 패턴으로 snake_case ↔ camelCase 변환. 기존 패턴과 동일하게.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP 동적 리소스 목록+읽기 | 커스텀 URI 라우팅 | `ResourceTemplate` 클래스 | list callback + URI 패턴 매칭을 자동 처리 |
| 알림 메시지 구성 | 직접 문자열 조합 | `getNotificationMessage()` + vars interpolation | 다국어 지원, 기존 패턴 일관성 |
| Python SDK HTTP 요청 | requests 라이브러리 | `httpx.AsyncClient` + `with_retry` | 기존 retry 래퍼, async context manager 패턴 |
| TS SDK HTTP 요청 | fetch 직접 호출 | `HttpClient` + `withRetry` | 기존 retry, timeout, error 핸들링 패턴 |
| 스킬 파일 경로 해석 | 하드코딩 경로 | `node:path`의 `resolve` + `dirname` | 상대 경로 기반 해석, 배포 환경 무관 |

**Key insight:** Phase 119는 순수 통합 페이즈이다. 모든 구현은 기존 패턴(SDK 메서드, MCP 도구, MCP 리소스, 알림 vars)의 복제. 새로운 패턴이나 아키텍처 결정이 필요하지 않다.

## Common Pitfalls

### Pitfall 1: RESOURCE_NOT_FOUND 에러 코드 미등록
**What goes wrong:** `WAIaaSError('RESOURCE_NOT_FOUND', ...)` 호출 시 에러 코드가 `error-codes.ts`에 없어 런타임 에러 발생.
**Why it happens:** 새 에러 코드를 사용할 때 등록을 잊음.
**How to avoid:** Plan 119-02에서 라우트 구현 전에 `@waiaas/core`에 `RESOURCE_NOT_FOUND` 에러 코드 추가. 기존 에러 코드 목록에 이미 존재하는지 먼저 확인 (NOT_FOUND가 이미 있으면 그것을 재사용).
**Warning signs:** TypeScript 컴파일 에러 또는 런타임 "Unknown error code" 에러.

### Pitfall 2: MCP ResourceTemplate list 콜백 누락
**What goes wrong:** ResourceTemplate 생성 시 `list` 콜백을 제공하지 않으면 `resources/list`에 스킬이 나타나지 않음.
**Why it happens:** ResourceTemplate 생성자의 두 번째 인자에 `list` 콜백이 필수.
**How to avoid:** 연구에서 확인한 ResourceTemplate API: `new ResourceTemplate(uriTemplate, { list: async () => ({ resources: [...] }) })`. list 콜백이 5개 스킬의 URI/name/description/mimeType을 반환해야 함.
**Warning signs:** `resources/list` 응답에 `waiaas://skills/*` URI가 없음.

### Pitfall 3: skills/ 디렉토리 경로가 빌드 후 달라짐
**What goes wrong:** 개발 환경에서는 `../../skills/`로 접근 가능하지만, `npm pack` 배포나 Docker 빌드 후 경로가 달라짐.
**Why it happens:** daemon은 `packages/daemon/dist/api/routes/skills.js`에서 실행되지만 `skills/`는 모노레포 루트에 위치.
**How to avoid:** (1) daemon 빌드 시 skills/ 파일을 dist/에 복사하는 빌드 스크립트 추가, 또는 (2) `WAIAAS_SKILLS_DIR` 환경변수로 경로를 주입받도록 구현, 또는 (3) CLI daemon 시작 시 프로세스 CWD가 프로젝트 루트이므로 `process.cwd()/skills/`를 기본 경로로 사용. 현재 프로젝트는 CLI 기반 로컬 데몬이므로 (3)이 가장 실용적.
**Warning signs:** 배포 환경에서 `GET /v1/skills/transactions` 요청 시 404 또는 파일 읽기 에러.

### Pitfall 4: POLICY_VIOLATION 알림에서 policyType 추출 실패
**What goes wrong:** `evaluation.reason` 문자열에서 policyType을 파싱하는데, reason 형식이 일관되지 않아 추출 실패.
**Why it happens:** 기존 DatabasePolicyEngine의 denial reason 문자열이 다양한 형식: "Token not in allowed list: 0x...", "Contract not whitelisted: 0x...", "Address 0x... not in whitelist", "Network 'polygon' not in allowed networks list" 등.
**How to avoid:** `evaluation.reason` 문자열의 키워드를 기반으로 policyType을 추출하는 `extractPolicyType()` 헬퍼 함수를 작성. "not in allowed list" + TOKEN_TRANSFER → `ALLOWED_TOKENS`, "not whitelisted" + CONTRACT_CALL → `CONTRACT_WHITELIST`, "not in approved list" → `APPROVED_SPENDERS` 등 매핑. 완벽한 파싱이 불가능하면 `UNKNOWN`으로 폴백.
**Warning signs:** 알림에 `policyType: ""` 또는 `policyType: "UNKNOWN"`이 포함됨.

### Pitfall 5: Python SDK SignTransactionResponse의 camelCase 필드 매핑
**What goes wrong:** sign-only API 응답의 JSON 필드명(`signedTransaction`, `txHash`, `policyResult`)이 Python의 snake_case 컨벤션과 불일치.
**Why it happens:** Python SDK는 `pydantic.Field(alias="camelCase")`로 매핑하는데, 중첩 객체(policyResult)의 경우 추가 모델 정의가 필요.
**How to avoid:** `SignTransactionResponse` 모델에 `model_config = {"populate_by_name": True}`를 설정하고, `PolicyResult` 중첩 모델도 별도 정의. 기존 `TransactionDetail` 모델과 동일한 패턴.
**Warning signs:** `sign_transaction()` 호출 시 `ValidationError: field required` pydantic 에러.

### Pitfall 6: MCP 스킬 리소스의 mimeType 불일치
**What goes wrong:** 스킬 파일은 마크다운이지만 응답에 `application/json`을 설정하면 AI 에이전트가 내용을 올바르게 해석하지 못함.
**Why it happens:** 기존 3개 리소스(wallet-balance, wallet-address, system-status)가 모두 `application/json`을 사용하여 복붙 시 mimeType을 수정하지 않음.
**How to avoid:** 스킬 리소스의 `mimeType`을 `text/markdown`으로 명시적 설정. ResourceTemplate 등록과 handler 응답 모두에서 일관되게 설정.
**Warning signs:** AI 에이전트가 스킬 파일 내용을 JSON으로 파싱 시도.

### Pitfall 7: GET /v1/skills/:name 인증 여부 결정
**What goes wrong:** sessionAuth를 적용하면 MCP ApiClient가 토큰 없이 호출할 수 없고, 인증 없이 열면 보안 문제가 될 수 있음.
**Why it happens:** 스킬 파일은 공개 문서이지만, 다른 API 엔드포인트와의 일관성 고려.
**How to avoid:** 스킬 파일은 이미 Git에 커밋된 공개 문서이므로 `GET /v1/skills/:name`은 인증 불필요 (nonce, health와 동일). MCP ApiClient는 항상 토큰을 포함하므로 어느 쪽이든 작동하지만, 인증 없이 열어두면 에이전트가 세션 만료 상태에서도 API 문서를 참조 가능.
**Warning signs:** 세션 만료된 MCP 서버에서 스킬 리소스 조회가 `session_expired`로 실패.

## Code Examples

### TS SDK SignTransactionParams/Response 타입
```typescript
// Source: packages/sdk/src/types.ts (추가)
export interface SignTransactionParams {
  /** Unsigned transaction (base64 for Solana, 0x-hex for EVM) */
  transaction: string;
  /** Target network (optional -- resolved from wallet defaults) */
  network?: string;
}

export interface SignTransactionOperation {
  type: string;
  to?: string | null;
  amount?: string | null;
  token?: string | null;
  programId?: string | null;
  method?: string | null;
}

export interface SignTransactionResponse {
  id: string;
  signedTransaction: string;
  txHash: string | null;
  operations: SignTransactionOperation[];
  policyResult: {
    tier: string;
  };
}
```

### Python SDK SignTransactionRequest/Response 모델
```python
# Source: python-sdk/waiaas/models.py (추가)
class SignTransactionRequest(BaseModel):
    transaction: str = Field(description="Unsigned transaction (base64/hex)")
    chain: Optional[str] = None
    network: Optional[str] = None

    model_config = {"populate_by_name": True}


class SignTransactionOperation(BaseModel):
    type: str
    to: Optional[str] = None
    amount: Optional[str] = None
    token: Optional[str] = None
    program_id: Optional[str] = Field(default=None, alias="programId")
    method: Optional[str] = None

    model_config = {"populate_by_name": True}


class PolicyResult(BaseModel):
    tier: str


class SignTransactionResponse(BaseModel):
    id: str
    signed_transaction: str = Field(alias="signedTransaction")
    tx_hash: Optional[str] = Field(default=None, alias="txHash")
    operations: list[SignTransactionOperation]
    policy_result: PolicyResult = Field(alias="policyResult")

    model_config = {"populate_by_name": True}
```

### POLICY_VIOLATION policyType 추출 헬퍼
```typescript
// Source: packages/daemon/src/pipeline/stages.ts (추가)
function extractPolicyType(reason: string | undefined): string {
  if (!reason) return '';
  if (reason.includes('not in allowed list') || reason.includes('Token transfer not allowed')) return 'ALLOWED_TOKENS';
  if (reason.includes('not whitelisted') || reason.includes('Contract calls disabled')) return 'CONTRACT_WHITELIST';
  if (reason.includes('Method not whitelisted')) return 'METHOD_WHITELIST';
  if (reason.includes('not in approved list') || reason.includes('Token approvals disabled')) return 'APPROVED_SPENDERS';
  if (reason.includes('not in whitelist') || reason.includes('not in allowed addresses')) return 'WHITELIST';
  if (reason.includes('not in allowed networks')) return 'ALLOWED_NETWORKS';
  if (reason.includes('exceeds limit') || reason.includes('Unlimited token approval')) return 'APPROVE_AMOUNT_LIMIT';
  if (reason.includes('Spending limit')) return 'SPENDING_LIMIT';
  return '';
}
```

### i18n 템플릿 업데이트
```typescript
// Source: packages/core/src/i18n/en.ts (수정)
// 현재:
POLICY_VIOLATION: { title: 'Policy Violation', body: 'Wallet {walletId} policy violation: {reason}' },

// 보강:
POLICY_VIOLATION: {
  title: 'Policy Violation',
  body: 'Wallet {walletId} policy violation: {reason}. Policy: {policyType}. Token: {tokenAddress}. Contract: {contractAddress}. Admin: {adminLink}',
},
```

### MCP server.ts 등록 패턴 (도구 + 리소스 추가)
```typescript
// Source: packages/mcp/src/server.ts (수정)
import { registerSignTransaction } from './tools/sign-transaction.js';
import { registerSkillResources } from './resources/skills.js';

// ... 기존 등록 후:
registerSignTransaction(server, apiClient, walletContext);  // 13th tool
registerSkillResources(server, apiClient, walletContext);   // 4th+ resource group
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SDK에 sign-only 없음 | signTransaction() / sign_transaction() | v1.4.7 (이 페이즈) | SDK에서 외부 tx 서명 가능 |
| MCP 3개 리소스 (JSON) | 3개 + 5개 스킬 리소스 (markdown) | v1.4.7 (이 페이즈) | AI 에이전트 자체 API 문서 학습 |
| POLICY_VIOLATION 알림 generic | 상세 필드 + Admin 딥링크 | v1.4.7 (이 페이즈) | 관리자 즉시 대응 가능 |
| 12개 MCP 도구 | 13개 MCP 도구 (sign_transaction 추가) | v1.4.7 (이 페이즈) | 외부 dApp tx 서명 MCP 지원 |

## Open Questions

1. **RESOURCE_NOT_FOUND 에러 코드가 이미 존재하는가?**
   - What we know: 기존 69+ 에러 코드에 `NOT_FOUND`, `TX_NOT_FOUND`, `WALLET_NOT_FOUND`, `POLICY_NOT_FOUND` 등이 있음
   - What's unclear: `RESOURCE_NOT_FOUND`가 별도로 필요한지 또는 기존 `NOT_FOUND` 재사용 가능한지
   - Recommendation: 기존 `NOT_FOUND`를 재사용하되, 에러 메시지에 "Skill 'xxx' not found"를 명시. 별도 에러 코드가 필요하면 추가하되 최소한의 변경으로.

2. **skills/ 디렉토리 경로를 어떻게 해결하는가?**
   - What we know: daemon은 `packages/daemon/dist/`에서 실행, skills/는 모노레포 루트에 위치. CLI daemon 시작 시 CWD는 프로젝트 루트.
   - What's unclear: Docker, Tauri Desktop 빌드에서 skills/ 파일이 포함되는지
   - Recommendation: `process.cwd()` 기반 기본 경로 + `WAIAAS_SKILLS_DIR` 환경변수 오버라이드. 현재 로컬 데몬 시나리오에서는 CWD 기반으로 충분. Docker/Tauri는 v1.6+ 범위.

3. **POLICY_VIOLATION 알림 템플릿의 빈 필드 처리**
   - What we know: tokenAddress/contractAddress는 거래 유형에 따라 일부만 존재. TRANSFER 거래 거부 시 tokenAddress가 빈 문자열.
   - What's unclear: 빈 필드를 템플릿에서 어떻게 처리할지 (빈 문자열 표시 vs 조건부 숨김)
   - Recommendation: 기존 interpolation은 `{key}`를 빈 문자열로 대체. 이는 ". Token: . Contract: ."처럼 어색한 결과를 낳을 수 있음. 빈 필드는 vars에 추가하지 않고, 템플릿을 조건 분기 없이 기본 정보(reason, policyType, adminLink)만 포함하도록 설계. tokenAddress/contractAddress는 details 레코드(notification payload의 metadata)로 전달하여 알림 채널이 선택적으로 표시.

## Sources

### Primary (HIGH confidence)
- Codebase: `packages/sdk/src/client.ts` -- WAIaaSClient 11개 메서드 패턴 (sendToken, getBalance, encodeCalldata 등)
- Codebase: `packages/sdk/src/types.ts` -- SDK 타입 정의 패턴 (SendTokenParams, EncodeCalldataParams 등)
- Codebase: `packages/mcp/src/tools/call-contract.ts` -- MCP 도구 등록 패턴 (registerCallContract)
- Codebase: `packages/mcp/src/resources/system-status.ts` -- MCP 리소스 등록 패턴 (registerSystemStatus)
- Codebase: `packages/mcp/src/server.ts` -- createMcpServer 12 도구 + 3 리소스 등록
- Codebase: `packages/mcp/src/api-client.ts` -- ApiClient GET/POST + toToolResult/toResourceResult
- Codebase: `python-sdk/waiaas/client.py` -- Python SDK async 클라이언트 패턴 (encode_calldata, send_token)
- Codebase: `python-sdk/waiaas/models.py` -- Pydantic v2 모델 + Field(alias=...) 패턴
- Codebase: `packages/daemon/src/pipeline/stages.ts` L292-297 -- POLICY_VIOLATION notify 호출 패턴
- Codebase: `packages/core/src/i18n/en.ts` L127 -- POLICY_VIOLATION 알림 템플릿
- Codebase: `packages/daemon/src/api/routes/utils.ts` -- stateless 라우트 패턴 (utilsRoutes)
- Codebase: `packages/daemon/src/api/server.ts` -- 라우트 등록, auth 미들웨어 패턴
- Research: `.planning/research/STACK.md` L191-260 -- ResourceTemplate API 검증 (1.26.0)
- Research: `.planning/research/FEATURES.md` DF-04, DF-07 -- 스킬 리소스 및 알림 보강 설계
- Phase 117 RESEARCH.md -- sign-only API 응답 포맷, 파이프라인 흐름
- Phase 118 RESEARCH.md -- encode-calldata SDK/MCP 패턴 (이미 구현됨)

### Secondary (MEDIUM confidence)
- Research: `.planning/research/ARCHITECTURE.md` L560-635 -- 스킬 리소스 아키텍처 설계
- Research: `.planning/research/PITFALLS.md` -- MCP 리소스 확장 시 주의사항

### Tertiary (LOW confidence)
- None -- 모든 findings가 직접 코드베이스 분석에 기반

## Metadata

**Confidence breakdown:**
- SDK signTransaction (TS/Python): HIGH -- 기존 sendToken/encode_calldata 패턴의 정확한 복제, 코드 분석 완료
- MCP sign_transaction 도구: HIGH -- 기존 12개 도구 패턴과 동일, call_contract 패턴 참조
- MCP 스킬 리소스: HIGH -- ResourceTemplate API가 STACK.md에서 검증됨, daemon skills 라우트는 utils 패턴 복제
- 알림 보강: HIGH -- stages.ts L292-297의 notify vars 확장만 필요, evaluation.reason에서 policyType 추출 로직 필요
- 스킬 파일 업데이트: HIGH -- transactions.skill.md에 sign-only 섹션 추가는 기존 문서 형식 따름

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- 내부 코드베이스 패턴, 고정 의존성 버전)

## Detailed Findings for Planner

### 1. Plan 119-01 파일 변경 (SDK + MCP sign_transaction)

| File | Action | Lines | Complexity |
|------|--------|-------|------------|
| `packages/sdk/src/types.ts` | MODIFY | ~30 | LOW -- 신규 타입 추가 |
| `packages/sdk/src/client.ts` | MODIFY | ~10 | LOW -- signTransaction() 1개 메서드 |
| `packages/sdk/src/index.ts` | MODIFY | ~5 | LOW -- export 추가 |
| `packages/sdk/src/__tests__/client.test.ts` | MODIFY | ~50 | LOW -- signTransaction 테스트 |
| `python-sdk/waiaas/models.py` | MODIFY | ~30 | LOW -- 신규 모델 추가 |
| `python-sdk/waiaas/client.py` | MODIFY | ~20 | LOW -- sign_transaction() 메서드 |
| `python-sdk/waiaas/__init__.py` | MODIFY | ~5 | LOW -- export 추가 |
| `python-sdk/tests/test_models.py` | MODIFY | ~20 | LOW -- 모델 테스트 |
| `packages/mcp/src/tools/sign-transaction.ts` | CREATE | ~35 | LOW -- 기존 패턴 복제 |
| `packages/mcp/src/server.ts` | MODIFY | ~5 | LOW -- import + 등록 |
| `packages/mcp/src/__tests__/tools.test.ts` | MODIFY | ~40 | LOW -- 도구 테스트 추가 |

### 2. Plan 119-02 파일 변경 (스킬 리소스)

| File | Action | Lines | Complexity |
|------|--------|-------|------------|
| `packages/daemon/src/api/routes/skills.ts` | CREATE | ~50 | LOW -- stateless 파일 서빙 |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | MODIFY | ~10 | LOW -- SkillResponse 스키마 |
| `packages/daemon/src/api/routes/index.ts` | MODIFY | ~2 | LOW -- export 추가 |
| `packages/daemon/src/api/server.ts` | MODIFY | ~5 | LOW -- 라우트 등록 |
| `packages/core/src/errors/error-codes.ts` | MODIFY | ~5 | LOW -- RESOURCE_NOT_FOUND (필요 시) |
| `packages/mcp/src/resources/skills.ts` | CREATE | ~50 | MEDIUM -- ResourceTemplate 패턴 |
| `packages/mcp/src/server.ts` | MODIFY | ~5 | LOW -- import + 등록 |
| `packages/mcp/src/__tests__/resources.test.ts` | MODIFY | ~60 | MEDIUM -- 스킬 리소스 테스트 |

### 3. Plan 119-03 파일 변경 (알림 보강 + 스킬 업데이트)

| File | Action | Lines | Complexity |
|------|--------|-------|------------|
| `packages/daemon/src/pipeline/stages.ts` | MODIFY | ~20 | LOW -- notify vars 확장 + extractPolicyType |
| `packages/core/src/i18n/en.ts` | MODIFY | ~5 | LOW -- 템플릿 업데이트 |
| `packages/core/src/i18n/ko.ts` | MODIFY | ~5 | LOW -- 템플릿 업데이트 |
| `packages/daemon/src/__tests__/pipeline-notification.test.ts` | MODIFY | ~30 | LOW -- vars 검증 추가 |
| `skills/transactions.skill.md` | MODIFY | ~80 | LOW -- sign-only 섹션 추가 |

### 4. 의존성 그래프

```
Plan 119-01 (SDK + MCP sign_transaction)
  depends on: Phase 117 (POST /v1/transactions/sign 라우트)
  no internal dependencies

Plan 119-02 (MCP 스킬 리소스)
  depends on: skills/ 파일 존재 (이미 있음)
  daemon skills route -> MCP skills resource (순차)

Plan 119-03 (알림 보강 + 스킬 업데이트)
  depends on: Phase 117 (sign-only 문서화 대상), Phase 118 (encode-calldata 문서화 대상)
  no internal dependencies
```

Wave 1: 119-01, 119-02 (병렬 가능)
Wave 2: 119-03 (119-01/02 완료 후 스킬 파일 최종 업데이트)

### 5. TransactionParam 매핑 (stages.ts의 기존 ctx.request 필드)

POLICY_VIOLATION 알림 보강에 필요한 필드들이 이미 `ctx.request`에 존재:

| ctx.request 필드 | 용도 | 알림 vars 키 |
|-----------------|------|-------------|
| `tokenAddress` | TOKEN_TRANSFER 시 토큰 주소 | `tokenAddress` |
| `contractAddress` | CONTRACT_CALL 시 컨트랙트 주소 | `contractAddress` |
| `spenderAddress` | APPROVE 시 스펜더 주소 | (details에 포함) |
| `type` | 거래 유형 | (reason에 이미 포함) |

`evaluation.reason` 문자열에서 policyType을 추출하는 것이 유일한 신규 로직. 나머지는 ctx에서 직접 읽기 가능.

### 6. MCP ResourceTemplate API 시그니처 (검증됨)

```typescript
// @modelcontextprotocol/sdk 1.26.0
class ResourceTemplate {
  constructor(
    uriTemplate: string | UriTemplate,
    callbacks: {
      list: ListResourcesCallback | undefined;
      complete?: { [variable: string]: CompleteResourceTemplateCallback };
    },
  );
}

// server.resource() template overload:
server.resource(
  name: string,
  template: ResourceTemplate,
  metadata: { description?: string; mimeType?: string },
  handler: (uri: URL, params: Record<string, string>) => Promise<ReadResourceResult>,
);
```

### 7. 테스트 전략

**Plan 119-01 테스트:**
- TS SDK: signTransaction() 호출 → fetch mock → POST /v1/transactions/sign 검증
- Python SDK: sign_transaction() 모델 직렬화/역직렬화 검증
- MCP: sign_transaction 도구 → ApiClient.post('/v1/transactions/sign') 호출 검증

**Plan 119-02 테스트:**
- Daemon: GET /v1/skills/transactions → 200 + content 검증, GET /v1/skills/invalid → 404 검증
- MCP: 스킬 리소스 목록 (5개), 스킬 리소스 읽기 (text/markdown), 존재하지 않는 스킬 에러 검증

**Plan 119-03 테스트:**
- Pipeline: POLICY_VIOLATION notify 시 vars에 policyType, tokenAddress, contractAddress, adminLink 포함 검증
- extractPolicyType: 각 denial reason → policyType 매핑 검증
- Skill file: transactions.skill.md에 /v1/transactions/sign 섹션 존재 검증
