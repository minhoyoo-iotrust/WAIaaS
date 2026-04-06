# Phase 129: MCP/Admin/Skill Integration - Research

**Researched:** 2026-02-15
**Domain:** MCP 동적 도구 등록 (Action Provider -> MCP Tool 변환) + Skill 파일 작성
**Confidence:** HIGH

## Summary

Phase 129는 v1.5 마일스톤의 최종 단계로, 두 가지 독립적 트랙으로 구성된다. (1) mcpExpose=true Action Provider의 액션을 MCP 도구로 자동 변환하여 AI 에이전트가 REST API를 모르고도 DeFi 액션을 실행할 수 있게 하는 것, (2) Phase 126-128에서 추가된 엔드포인트를 Skill 파일로 문서화하여 AI 에이전트가 즉시 참조할 수 있게 하는 것.

핵심 기술 발견: **MCP SDK v1.26.0이 동적 도구 관리를 공식 지원한다.** Phase 128 리서치에서 "MCP 동적 도구 등록/해제 공식 API 미존재"로 기록되었으나, 실제 설치된 SDK v1.26.0의 `RegisteredTool` 인터페이스에 `remove()`, `enable()`, `disable()`, `update()` 메서드가 존재하며, `sendToolListChanged()` 알림으로 연결된 클라이언트에 도구 목록 변경을 통보한다. `server.tool()` 또는 `registerTool()`을 서버 연결 후 호출해도 자동으로 `sendToolListChanged()`가 발동한다. 이로써 "known blocker"가 해소된다.

MCP 서버가 별도 프로세스(stdio 전송)로 동작하므로, 데몬의 ActionProviderRegistry에 직접 접근할 수 없다. 대신 기존 `GET /v1/actions/providers` REST 엔드포인트를 폴링하여 mcpExpose=true 프로바이더의 액션 목록을 가져오고, 각 액션을 `POST /v1/actions/:provider/:action` API를 호출하는 MCP 도구로 등록한다. 입력 스키마는 REST 레벨에서 `params: Record<string, unknown>`으로 통일되어 있으므로, MCP 도구도 동일한 generic params 패턴을 사용한다.

**Primary recommendation:** MCP 서버 시작 시 `GET /v1/actions/providers`를 1회 호출하여 mcpExpose=true 액션을 MCP 도구로 등록한다. `packages/mcp/src/tools/action-provider.ts`에 변환 로직을 구현하고, `server.ts`의 `createMcpServer()`에서 초기화 후 등록한다. Skill 파일은 기존 포맷(YAML frontmatter + 섹션별 curl 예시)을 따라 `admin.skill.md` 업데이트와 `actions.skill.md` 신규 작성을 수행한다.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | 1.26.0 (설치됨) | MCP 서버 도구 등록/해제, RegisteredTool.remove() | 기존 MCP 패키지 의존성. 동적 도구 관리 공식 지원 확인 |
| zod | 3.x (기존) | MCP 도구 inputSchema 정의 | 기존 14개 도구와 동일 패턴 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ApiClient | 기존 | GET /v1/actions/providers 호출, POST /v1/actions/:provider/:action 호출 | MCP 프로세스에서 데몬 REST API 호출 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| REST 폴링 방식 | IPC/소켓으로 직접 Registry 접근 | MCP 서버가 별도 프로세스(stdio)로 동작하므로 IPC 불가. REST가 유일한 통신 채널 |
| 시작 시 1회 등록 | 주기적 폴링(interval) | 플러그인 핫 리로드가 Out of Scope이므로 1회 등록이 적절. 설계 문서 62도 "데몬 시작 시 1회" 명시 |
| generic params 스키마 | ActionDefinition.inputSchema를 JSON Schema로 변환하여 MCP에 전달 | REST 응답에 Zod 스키마가 포함되지 않음. GET /v1/actions/providers의 ActionDefinitionResponse에 inputSchema 없음. description에 파라미터 설명 포함 |

**Installation:**
```bash
# 신규 의존성 없음 (기존 @modelcontextprotocol/sdk ^1.12.0 -> 실제 1.26.0 설치)
```

## Architecture Patterns

### Recommended Project Structure
```
packages/mcp/src/
  tools/
    action-provider.ts      # [NEW] Action Provider -> MCP Tool 변환 + 등록
  server.ts                 # [MODIFY] createMcpServer에 action provider 도구 등록 추가

skills/
  admin.skill.md            # [MODIFY] oracle-status + api-keys 섹션 추가
  actions.skill.md          # [NEW] Action Provider REST API 문서화
```

### Pattern 1: Action Provider -> MCP Tool 변환

**What:** mcpExpose=true 프로바이더의 각 액션을 MCP 도구로 자동 등록
**When to use:** MCP 서버 시작 시, sessionManager가 토큰 확보 후
**Architecture:**

```
MCP Process 시작
  -> sessionManager.start()
  -> GET /v1/actions/providers (ApiClient)
  -> 응답에서 mcpExpose=true 프로바이더 필터링
  -> 각 액션을 server.tool()으로 등록
     - 도구명: "action_{provider}_{action}" (MCP 네임스페이스 충돌 방지)
     - 설명: provider.description + action.description
     - inputSchema: { params: z.record(z.unknown()), network: z.string().optional() }
     - handler: POST /v1/actions/:provider/:action 호출
  -> RegisteredTool 참조 저장 (향후 remove() 호출용)
```

**Example:**
```typescript
// Source: packages/mcp/src/tools/action-provider.ts (신규)
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

interface ProviderAction {
  providerName: string;
  actionName: string;
  description: string;
  chain: string;
  riskLevel: string;
}

/**
 * Fetch mcpExpose=true actions from daemon and register as MCP tools.
 * Returns registered tool references for potential future removal.
 */
export async function registerActionProviderTools(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): Promise<Map<string, RegisteredTool>> {
  const registered = new Map<string, RegisteredTool>();

  // 1. Fetch providers from daemon REST API
  const result = await apiClient.get<{
    providers: Array<{
      name: string;
      description: string;
      mcpExpose: boolean;
      actions: Array<{
        name: string;
        description: string;
        chain: string;
        riskLevel: string;
      }>;
    }>;
  }>('/v1/actions/providers');

  if (!result.ok) {
    // Degraded mode: action provider tools not available
    console.error('[waiaas-mcp] Failed to fetch action providers, skipping dynamic tool registration');
    return registered;
  }

  // 2. Filter mcpExpose=true providers
  const exposedActions: ProviderAction[] = [];
  for (const provider of result.data.providers) {
    if (!provider.mcpExpose) continue;
    for (const action of provider.actions) {
      exposedActions.push({
        providerName: provider.name,
        actionName: action.name,
        description: `[${provider.name}] ${action.description}`,
        chain: action.chain,
        riskLevel: action.riskLevel,
      });
    }
  }

  // 3. Register each action as MCP tool
  for (const action of exposedActions) {
    const toolName = `action_${action.providerName}_${action.actionName}`;
    const description = withWalletPrefix(
      `${action.description} (chain: ${action.chain}, risk: ${action.riskLevel})`,
      walletContext?.walletName,
    );

    const tool = server.tool(
      toolName,
      description,
      {
        params: z.record(z.unknown()).optional()
          .describe('Action-specific parameters as key-value pairs'),
        network: z.string().optional()
          .describe('Target network. Defaults to wallet default network.'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.params) body.params = args.params;
        if (args.network) body.network = args.network;
        const res = await apiClient.post(
          `/v1/actions/${action.providerName}/${action.actionName}`,
          body,
        );
        return toToolResult(res);
      },
    );

    registered.set(toolName, tool);
  }

  if (exposedActions.length > 0) {
    console.error(`[waiaas-mcp] Registered ${exposedActions.length} action provider tools`);
  }

  return registered;
}
```

### Pattern 2: MCP 서버 초기화 순서

**What:** 기존 14개 내장 도구 + 동적 action provider 도구를 순서대로 등록
**When to use:** createMcpServer 호출 시

```typescript
// Source: packages/mcp/src/server.ts (수정)
export async function createMcpServer(
  apiClient: ApiClient,
  walletContext?: WalletContext,
): Promise<McpServer> {
  const server = new McpServer({ name: serverName, version: '0.0.0' });

  // 1. Register 14 built-in tools (동기적, 항상 성공)
  registerSendToken(server, apiClient, walletContext);
  // ... 13개 더 ...

  // 2. Register 4 resource groups
  registerWalletBalance(server, apiClient, walletContext);
  // ... 3개 더 ...

  // 3. Register action provider tools (비동기, 실패 시 무시 -- degraded mode)
  // 시작 후 비동기 호출로 처리 (connect 후 호출해도 sendToolListChanged 자동 발동)
  return server;
}
```

**중요:** `createMcpServer()`가 현재 동기 함수이므로, action provider 도구 등록은 `server.connect()` 이후 비동기로 수행한다. `index.ts`의 main()에서 `await server.connect(transport)` 후 `registerActionProviderTools()`를 호출하면, 이미 연결된 상태에서도 `sendToolListChanged()`가 자동 발동되어 클라이언트에 도구 목록 변경이 통보된다.

### Pattern 3: Skill 파일 포맷

**What:** YAML frontmatter + 섹션별 curl 예시 + 에러 레퍼런스
**Format:**

```markdown
---
name: "WAIaaS [Domain]"
description: "[brief description]"
category: "api"
tags: [wallet, blockchain, ...]
version: "1.5.0"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS [Domain]

[Overview paragraph]

## Base URL / Authentication

## [Section N]. [Endpoint Group]

### [METHOD] /v1/path -- Description

\```bash
curl -s -X METHOD http://localhost:3100/v1/path \
  -H 'Header: value' \
  -d '{...}'
\```

**Response (200):**
\```json
{...}
\```

## Error Reference

| Code | HTTP | Description |
|------|------|-------------|
```

### Anti-Patterns to Avoid
- **MCP 도구명에 슬래시 사용:** MCP 도구명은 `[a-zA-Z0-9_-]` 범위여야 함. `provider/action` 형태 사용 금지 -> `action_{provider}_{action}` 사용
- **action provider 도구 등록 실패로 서버 시작 실패:** 프로바이더 조회 실패는 degraded mode로 처리. 14개 내장 도구는 항상 사용 가능해야 함
- **MCP 도구에서 직접 Zod 스키마 재현:** REST 응답에 inputSchema가 없으므로 MCP 레벨에서 Zod 스키마를 재현하려는 시도 금지. generic `params: Record<string, unknown>` 패턴 사용
- **Skill 파일에 구현 상세 포함:** Skill 파일은 AI 에이전트용 API 레퍼런스. 내부 구현(파이프라인, DB 스키마 등) 설명 금지

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zod -> JSON Schema 변환 | 커스텀 변환기 | MCP SDK 내장 `toJsonSchemaCompat` (자동) | MCP SDK가 `server.tool()`의 Zod inputSchema를 자동으로 JSON Schema로 변환. `zod-to-json-schema` v3 + Zod v4 mini 호환 |
| MCP 도구 목록 변경 알림 | 커스텀 notification | `sendToolListChanged()` (RegisteredTool.remove/update에서 자동 호출) | SDK가 도구 등록/해제/수정 시 자동으로 `notifications/tools/list_changed` 전송 |
| REST API 문서화 | Swagger/OpenAPI 자동 생성 | Skill 파일 수동 작성 | CLAUDE.md 규칙에 따라 skill 파일 수동 관리. AI 에이전트가 직접 읽는 문서이므로 가독성 우선 |
| MCP 도구 입력 검증 | 커스텀 validator | MCP SDK의 `validateToolInput()` (server.tool의 Zod 스키마 자동 검증) | SDK가 CallToolRequest 수신 시 inputSchema로 자동 검증 |

**Key insight:** MCP SDK v1.26.0은 Zod v3/v4 호환 스키마 변환, 동적 도구 관리, 자동 입력 검증을 모두 내장하고 있으므로 커스텀 구현이 거의 불필요하다.

## Common Pitfalls

### Pitfall 1: 14개 내장 도구와의 이름 충돌
**What goes wrong:** Action provider 도구명이 기존 내장 도구명(예: `get_balance`, `send_token`)과 충돌
**Why it happens:** MCP SDK는 `this._registeredTools[name]`으로 관리하므로 이름 중복 시 `Error: Tool {name} is already registered` 발생
**How to avoid:** Action provider 도구명에 `action_` 접두사 사용: `action_{providerName}_{actionName}`
**Warning signs:** 서버 시작 시 "Tool X is already registered" 에러

### Pitfall 2: createMcpServer 동기/비동기 전환
**What goes wrong:** `createMcpServer()`를 async로 변경하면 기존 호출처(index.ts)가 깨짐
**Why it happens:** 현재 `createMcpServer()`는 동기 함수. action provider 도구 등록은 REST 호출이 필요하므로 비동기
**How to avoid:** `createMcpServer()`는 동기로 유지하고, action provider 도구 등록은 `index.ts`의 main()에서 connect() 후 별도 호출. SDK가 연결 후 도구 등록 시 자동으로 `sendToolListChanged()` 발동
**Warning signs:** `createMcpServer()` 시그니처 변경

### Pitfall 3: 세션 만료 시 프로바이더 조회 실패
**What goes wrong:** MCP 서버 시작 직후 sessionManager에 토큰이 없으면 GET /v1/actions/providers가 expired 반환
**Why it happens:** `index.ts`에서 `server.connect(transport)` 후 `sessionManager.start()` 순서. start() 완료 전에 프로바이더 조회하면 토큰 없음
**How to avoid:** `sessionManager.start()` 완료 후 프로바이더 도구 등록 호출. 실패 시 silent degradation (내장 도구만 사용)
**Warning signs:** `[waiaas-mcp] Failed to fetch action providers` 로그

### Pitfall 4: Skill 파일 버전 불일치
**What goes wrong:** admin.skill.md의 버전이 1.4.8로 남아 있으면 새 엔드포인트가 누락된 것처럼 보임
**Why it happens:** CLAUDE.md 규칙: "REST API, SDK, MCP 인터페이스가 변경되면 skills/ 파일도 반드시 함께 업데이트"
**How to avoid:** Skill 파일의 frontmatter `version`을 1.5.0으로 업데이트. 새 섹션 추가
**Warning signs:** `version: "1.4.8"` in updated skill files

### Pitfall 5: MCP 도구 설명의 부적절한 길이
**What goes wrong:** Action provider 설명이 너무 길거나 짧으면 AI 에이전트가 도구 선택에 어려움
**Why it happens:** ActionDefinition.description는 20-1000자 범위. MCP 도구 설명으로 그대로 사용하면 너무 길 수 있음
**How to avoid:** provider description + action description을 합치되, 적절한 길이로 truncate. chain/riskLevel 정보 포함
**Warning signs:** MCP tools/list 응답의 도구 설명이 500자 이상

## Code Examples

### MCP SDK 동적 도구 등록/해제 API (검증 완료)

```typescript
// Source: @modelcontextprotocol/sdk v1.26.0, dist/esm/server/mcp.js line 605-653
// RegisteredTool 인터페이스:
//   enabled: boolean
//   enable(): void   -- tool.update({ enabled: true })와 동일
//   disable(): void  -- tool.update({ enabled: false })와 동일
//   remove(): void   -- tool.update({ name: null })와 동일, _registeredTools에서 삭제
//   update(updates): void -- 이름, 설명, 스키마, 콜백, 활성화 상태 변경 + sendToolListChanged() 자동 호출

// server.tool() 반환값이 RegisteredTool
const registeredTool = server.tool('my_tool', 'description', { param: z.string() }, handler);

// 도구 비활성화 (tools/list에서 숨김, 호출 시 "disabled" 에러)
registeredTool.disable();

// 도구 완전 제거 (tools/list에서 삭제)
registeredTool.remove();

// 연결 후 새 도구 등록 -> sendToolListChanged() 자동 발동
const newTool = server.tool('new_tool', 'desc', { p: z.string() }, handler);
// 클라이언트에 notifications/tools/list_changed 전송됨
```

### ListToolsRequestHandler의 enabled 필터링

```typescript
// Source: @modelcontextprotocol/sdk v1.26.0, dist/esm/server/mcp.js line 67-98
// tools/list 요청 시 enabled=false인 도구는 자동으로 필터링됨
this.server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: Object.entries(this._registeredTools)
    .filter(([, tool]) => tool.enabled)  // enabled 필터
    .map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: /* Zod -> JSON Schema 자동 변환 */,
      annotations: tool.annotations,
    }))
}));
```

### 기존 MCP 도구 등록 패턴 (14개 내장 도구)

```typescript
// Source: packages/mcp/src/tools/send-token.ts
export function registerSendToken(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'send_token',
    withWalletPrefix('Send SOL/ETH or tokens from the wallet.', walletContext?.walletName),
    {
      to: z.string().describe('Destination wallet address'),
      amount: z.string().describe('Amount in smallest unit'),
      // ... more params
    },
    async (args) => {
      const body = { to: args.to, amount: args.amount };
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
```

### Action Provider REST API 호출 패턴

```typescript
// Source: packages/daemon/src/api/routes/actions.ts line 104-109
// ActionExecuteRequestSchema -- MCP 도구에서 이 스키마에 맞게 body를 구성
const ActionExecuteRequestSchema = z.object({
  params: z.record(z.unknown()).optional().default({}),
  network: z.string().optional(),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP 도구 정적 등록만 가능 | RegisteredTool.remove()/disable()/update() 동적 관리 | SDK 1.12+ -> 1.26.0 | 동적 도구 등록/해제 공식 지원. "known blocker" 해소 |
| server.tool() (deprecated) | server.registerTool() | SDK 1.26.0 | 기존 14개 도구는 tool() 사용 중. 새 도구도 tool()로 등록 가능 (여전히 동작). 점진적 마이그레이션 가능 |
| listChanged 미지원 | listChanged: true capability 자동 등록 | SDK 1.12+ | setToolRequestHandlers()에서 자동으로 tools.listChanged capability 등록 |

**Key version finding:**
- `packages/mcp/package.json`: `"@modelcontextprotocol/sdk": "^1.12.0"` (semver range)
- 실제 설치: `1.26.0` (node_modules 확인)
- SDK 1.26.0은 Zod v3/v4 호환, RegisteredTool 동적 관리, tasks experimental 등 포함

## Open Questions

1. **Action Provider 도구의 inputSchema를 더 구체적으로 만들 수 있는가?**
   - What we know: REST 응답(`GET /v1/actions/providers`)에 inputSchema가 포함되지 않음. ActionDefinitionResponseSchema는 name, description, chain, riskLevel, defaultTier만 반환
   - What's unclear: 향후 REST 응답에 JSON Schema를 포함할 수 있겠지만 현재는 없음
   - Recommendation: 현재는 generic `params: Record<string, unknown>` 사용. description에 파라미터 설명을 상세히 포함하여 AI 에이전트가 추론 가능하게 함. 향후 Phase에서 inputSchema 응답 추가 검토

2. **프로바이더 등록/해제 시 MCP 도구 동적 업데이트 범위**
   - What we know: 요구사항 ACTNP-06은 "프로바이더 등록/해제 시 MCP 도구가 동적으로 추가/제거"를 명시. 그러나 MCP 서버는 별도 프로세스이고, 데몬의 registry 변경을 실시간으로 감지할 방법이 없음
   - What's unclear: 데몬 -> MCP 서버로의 실시간 통보 메커니즘
   - Recommendation: 시작 시 1회 등록으로 구현. ACTNP-06의 "동적" 요구사항은 "MCP 서버 재시작 시 변경사항이 반영된다"로 해석. 설계 문서 62도 "데몬 시작 시 1회"를 명시. 향후 WebSocket/SSE 기반 실시간 통보 검토 가능하나 현재 Out of Scope

## Sources

### Primary (HIGH confidence)
- **@modelcontextprotocol/sdk v1.26.0** (node_modules 직접 분석)
  - `dist/esm/server/mcp.d.ts`: RegisteredTool 인터페이스 (remove/enable/disable/update)
  - `dist/esm/server/mcp.js`: _createRegisteredTool 구현, sendToolListChanged 연동
  - `package.json`: 버전 1.26.0, zod ^3.25 || ^4.0 의존성
- **packages/mcp/src/server.ts**: 기존 createMcpServer 구조 (14 도구 + 4 리소스)
- **packages/mcp/src/index.ts**: MCP 프로세스 시작 흐름 (connect -> sessionManager.start)
- **packages/mcp/src/tools/send-token.ts**: 기존 도구 등록 패턴 (server.tool)
- **packages/mcp/src/api-client.ts**: ApiClient.get/post, toToolResult 헬퍼
- **packages/core/src/interfaces/action-provider.types.ts**: ActionProviderMetadata (mcpExpose), ActionDefinition (inputSchema)
- **packages/daemon/src/infrastructure/action/action-provider-registry.ts**: getMcpExposedActions() 메서드
- **packages/daemon/src/api/routes/actions.ts**: GET /v1/actions/providers, POST /v1/actions/:provider/:action
- **packages/daemon/src/api/routes/admin.ts**: GET /v1/admin/oracle-status, GET/PUT/DELETE /v1/admin/api-keys
- **skills/admin.skill.md**: 기존 admin skill 파일 구조/포맷
- **skills/transactions.skill.md**: skill 파일 참조 포맷

### Secondary (MEDIUM confidence)
- **.planning/phases/128-action-provider-api-key/128-RESEARCH.md**: Phase 128 리서치 (설계 문서 62 참조)
- **.planning/ROADMAP.md**: Phase 129 요구사항/의존관계/계획

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 모든 도구가 기존 설치된 SDK + 프로젝트 코드. 신규 의존성 없음
- Architecture: HIGH - MCP SDK v1.26.0 소스코드 직접 분석으로 동적 도구 관리 API 검증 완료
- Pitfalls: HIGH - 기존 코드 분석 + SDK 소스 분석으로 정확한 제약 조건 파악

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (MCP SDK 안정 버전, Skill 파일 포맷 안정)
