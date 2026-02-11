# BUG-004: mcp setup 에이전트 목록 조회 시 X-Master-Password 헤더 누락

## 심각도

**MEDIUM** — `--agent` 옵션 없이 실행 시 에이전트 자동 감지 불가, CLI가 에러로 종료

## 증상

`waiaas mcp setup --password test1234` 실행 시 (`--agent` 미지정) Step 2에서 에이전트 목록을 조회하지만, `X-Master-Password` 헤더를 포함하지 않아 masterAuth 미들웨어에 의해 401 반환. CLI는 이를 일반 에러로 처리하여 종료:

```
Error: Failed to list agents (401)
```

## 재현 방법

```bash
# --agent 옵션 없이 실행 (자동 감지 시도)
waiaas mcp setup --password test1234
# → "Warning: daemon returned 401 on health check"  (BUG-003)
# → "Error: Failed to list agents (401)"             (BUG-004)
```

```bash
# --agent 옵션으로 우회 시 정상 동작
waiaas mcp setup --password test1234 --agent <agent-id>
# → "MCP session created successfully!"
```

## 원인

`packages/cli/src/commands/mcp-setup.ts`에서 마스터 패스워드 해석(Step 3)이 에이전트 목록 조회(Step 2) 이후에 수행됨:

```typescript
// Step 2: Resolve agent ID (패스워드 없이 호출)
if (!agentId) {
  const agentsRes = await fetch(`${baseUrl}/v1/agents`, {
    headers: { 'Accept': 'application/json' },
    // ❌ X-Master-Password 헤더 누락
  });
  // ...
}

// Step 3: Resolve master password (Step 2 이후에야 패스워드 확보)
const password = opts.masterPassword ?? await resolvePassword();
```

`GET /v1/agents`는 masterAuth가 필요한 엔드포인트 (`server.ts` 98행):

```typescript
app.use('/v1/agents', masterAuth);
```

## 수정안

패스워드 해석을 Step 2 이전으로 이동하고, 에이전트 목록 조회 시 헤더에 포함:

```typescript
// Step 2: Resolve master password (에이전트 조회보다 먼저)
const password = opts.masterPassword ?? await resolvePassword();

// Step 3: Resolve agent ID (패스워드 헤더 포함)
let agentId = opts.agent;

if (!agentId) {
  const agentsRes = await fetch(`${baseUrl}/v1/agents`, {
    headers: {
      'Accept': 'application/json',
      'X-Master-Password': password,  // ← 추가
    },
  });
  // ...
}
```

동시에 Step 4(세션 생성)의 패스워드 변수 참조도 유지.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 파일 | `packages/cli/src/commands/mcp-setup.ts` (47-91행) |
| 기능 영향 | 에이전트가 1개일 때 자동 감지 불가 — 반드시 `--agent` 수동 지정 필요 |
| 우회 방법 | `--agent <id>` 옵션으로 에이전트 ID 직접 지정 |

## 테스트 보완

기존 `packages/cli/src/__tests__/mcp-setup.test.ts`에서 에이전트 목록 조회 mock이 masterAuth 없이 성공하도록 설정되어 있어 발견되지 않음. masterAuth 검증 포함 테스트 추가 필요:

```typescript
it('에이전트 자동 감지 시 X-Master-Password 헤더가 전송됨', async () => {
  // mock에서 X-Master-Password 헤더 존재 여부 검증
  fetchMock.mockImplementation((url, opts) => {
    if (url.includes('/v1/agents')) {
      expect(opts.headers['X-Master-Password']).toBe('test1234');
      return Response.json({ agents: [{ id: 'agent-1' }] });
    }
    // ...
  });
});
```

---

*발견일: 2026-02-11*
*마일스톤: v1.3*
*상태: FIXED*
*수정일: 2026-02-11*
*관련: BUG-003 (같은 명령어의 인증 관련 버그)*
