# 479 — MCP listTools() 레이스 컨디션: Action Provider 도구 누락

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** OPEN

## 증상

MCP stdio 서버 연결 직후 `listTools()`를 호출하면 action provider 도구(`action_*`)가 포함되지 않음.
연결 후 3~5초 대기 후 재호출하면 정상 반환.

| 시점 | 도구 수 | `action_*` |
|------|---------|------------|
| `connect()` 직후 | 60 | **0** |
| 5초 후 | 114 | **54** |

외부 클라이언트(Crawdefi 등)가 연결 후 도구 목록을 캐시하는 패턴 사용 시, swap/bridge/stake 등 모든 action 실행이 `Tool not found` 에러로 실패.

```
Tool not found for jupiter_swap/swap. Tried: action_jupiter_swap_swap,
jupiter_swap_swap, swap. Available action tools: (empty)
```

## 원인

`packages/mcp/src/index.ts:128`에서 `registerActionProviderTools()`가 **await 없이 fire-and-forget으로 호출**됨.

```typescript
// index.ts:128-131
registerActionProviderTools(server, apiClient, { walletName: WALLET_NAME })
  .catch((err: unknown) => {
    console.error('[waiaas-mcp] Action provider tool registration failed:', ...);
  });
```

서버 시작 시퀀스:
1. `server.connect(transport)` — await 완료 → 클라이언트 연결 가능
2. `sessionManager.start()` — await 완료
3. `registerActionProviderTools()` — **NOT awaited** → 비동기 실행
4. `main()` 종료

`server.connect()` 완료 시점부터 클라이언트가 `listTools()`를 호출할 수 있지만, action provider 등록은 REST API 호출(`/v1/actions/providers`) 왕복 시간만큼 지연됨.

MCP SDK가 `server.tool()` 호출 시 `sendToolListChanged()` notification을 자동 발행하나, 클라이언트가 이 notification을 수신/처리하지 않으면 무의미.

## 수정 방향

`registerActionProviderTools()`를 `server.connect()` 호출 **전에** await하여, 서버 연결 시점에 모든 도구가 등록된 상태를 보장.

```typescript
// Before (현재)
await server.connect(transport);
await sessionManager.start();
registerActionProviderTools(...).catch(...);  // fire-and-forget

// After (수정)
await registerActionProviderTools(...);  // await first
await server.connect(transport);
await sessionManager.start();
```

또는 `server.connect()` 후에 await해도 됨 (서버 시작 3~5초 지연 수용):
```typescript
await server.connect(transport);
await sessionManager.start();
await registerActionProviderTools(...);  // now awaited
```

## 테스트 항목

- [ ] `connect()` 직후 `listTools()` 호출 시 `action_*` 도구가 포함되는지 확인
- [ ] action provider REST API 실패 시 서버가 정상 시작되는지 확인 (graceful degradation)
- [ ] `tools/list_changed` notification이 정상 발행되는지 확인

## 리포터

Crawdefi (외부 MCP 클라이언트)
