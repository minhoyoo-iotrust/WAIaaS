# BUG-006: mcp setup 에이전트 자동 감지 시 API 응답 필드 불일치 (items vs agents)

## 심각도

**MEDIUM** — `--agent` 옵션 없이 실행 시 에이전트가 존재해도 "No agents found" 에러로 종료. `--agent` 수동 지정으로 우회 가능.

## 증상

`waiaas mcp setup --password test1234` 실행 시 (`--agent` 미지정) 에이전트가 DB에 존재함에도 자동 감지 실패:

```
Error: No agents found. Run waiaas init first.
```

## 재현 방법

```bash
# 1. 에이전트 존재 확인
curl -s -H "X-Master-Password: test1234" http://127.0.0.1:3100/v1/agents
# → {"items":[{"id":"019c47d6-...","name":"test-agent",...}]}

# 2. --agent 없이 mcp setup 실행
node packages/cli/dist/index.js mcp setup --password test1234 --data-dir ~/.waiaas
# → "Error: No agents found. Run waiaas init first."

# 3. --agent 지정 시 정상 동작
node packages/cli/dist/index.js mcp setup --password test1234 \
  --agent 019c47d6-51ef-7f43-a76b-d50e875d95f4 --data-dir ~/.waiaas
# → "MCP session created successfully!"
```

## 원인

`packages/cli/src/commands/mcp-setup.ts` 66-67행에서 API 응답을 `agents` 필드로 파싱:

```typescript
const agentsData = await agentsRes.json() as { agents: Array<{ id: string; name?: string }> };
const agents = agentsData.agents ?? [];
// agentsData.agents === undefined → agents = [] → "No agents found"
```

실제 `GET /v1/agents` API 응답 (`packages/daemon/src/api/routes/agents.ts` 186-197행):

```typescript
return c.json({
  items: allAgents.map((a) => ({   // ← 'items' 필드
    id: a.id,
    name: a.name,
    chain: a.chain,
    network: a.network,
    publicKey: a.publicKey,
    status: a.status,
    createdAt: a.createdAt,
  })),
}, 200);
```

OpenAPI 스키마 (`packages/daemon/src/api/routes/openapi-schemas.ts` AgentListResponseSchema):

```typescript
export const AgentListResponseSchema = z.object({
  items: z.array(AgentResponseSchema),   // ← 'items'로 정의
}).openapi('AgentListResponse');
```

CLI가 `agents` 필드를 기대하지만, API는 `items` 필드를 반환. `agentsData.agents`는 항상 `undefined`.

## 수정안

`packages/cli/src/commands/mcp-setup.ts` 66-67행 수정:

```typescript
// Before — 존재하지 않는 'agents' 필드 참조
const agentsData = await agentsRes.json() as { agents: Array<{ id: string; name?: string }> };
const agents = agentsData.agents ?? [];

// After — 실제 API 응답의 'items' 필드 참조
const agentsData = await agentsRes.json() as { items: Array<{ id: string; name?: string }> };
const agents = agentsData.items ?? [];
```

## 영향 범위

| 항목 | 내용 |
|------|------|
| 파일 | `packages/cli/src/commands/mcp-setup.ts` (66-67행) |
| 기능 영향 | 에이전트 자동 감지 완전 불가 — 항상 빈 배열로 처리 |
| 우회 방법 | `--agent <id>` 옵션으로 에이전트 ID 직접 지정 |

## 기존 테스트가 통과한 이유

`packages/cli/src/__tests__/mcp-setup.test.ts`에서 에이전트 목록 API mock이 `agents` 필드로 응답을 구성:

```typescript
// 테스트 mock
fetchMock.mockResolvedValueOnce(
  Response.json({ agents: [{ id: 'agent-1', name: 'test' }] })
);
```

실제 API 응답 구조(`{ items: [...] }`)와 불일치. 테스트가 실제 API 스키마를 반영하지 않음.

## 재발 방지 테스트

### 1. 테스트 mock을 실제 API 응답 구조로 변경 (필수)

```typescript
it('에이전트 자동 감지 시 실제 API 응답 구조(items)를 파싱한다', async () => {
  // 실제 GET /v1/agents 응답 구조
  fetchMock.mockResolvedValueOnce(
    Response.json({ items: [{ id: 'agent-1', name: 'test' }] })
  );

  await mcpSetupCommand({ dataDir: tmpDir, masterPassword: 'test' });

  // 세션 생성 요청의 agentId 확인
  const sessionCall = fetchMock.mock.calls.find(c => c[0].includes('/v1/sessions'));
  const body = JSON.parse(sessionCall[1].body);
  expect(body.agentId).toBe('agent-1');
});
```

### 2. OpenAPI 스키마 기반 응답 타입 공유 (권장)

CLI와 데몬 간 응답 타입을 `@waiaas/core`에서 공유하여 필드명 불일치 방지:

```typescript
// packages/core/src/types/api-responses.ts
export interface AgentListResponse {
  items: Array<{
    id: string;
    name: string;
    chain: string;
    network: string;
    publicKey: string;
    status: string;
    createdAt: number;
  }>;
}
```

### 3. 계약 테스트(Contract Test) 도입 (권장)

CLI가 기대하는 API 응답 구조와 실제 데몬 응답 구조의 일치를 검증하는 계약 테스트:

```typescript
describe('CLI ↔ Daemon API contract', () => {
  it('GET /v1/agents 응답이 CLI 파서와 호환된다', async () => {
    const res = await fetch('http://127.0.0.1:3100/v1/agents', {
      headers: { 'X-Master-Password': 'test1234' },
    });
    const data = await res.json();

    // CLI가 기대하는 구조 검증
    expect(data).toHaveProperty('items');
    expect(Array.isArray(data.items)).toBe(true);
    if (data.items.length > 0) {
      expect(data.items[0]).toHaveProperty('id');
      expect(typeof data.items[0].id).toBe('string');
    }
  });
});
```

---

*발견일: 2026-02-11*
*마일스톤: v1.3*
*상태: FIXED*
*수정일: 2026-02-11*
*관련: BUG-004 (같은 에이전트 자동 감지 흐름의 후속 버그)*
