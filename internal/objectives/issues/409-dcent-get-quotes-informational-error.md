# 409 — DCent get_quotes informational 액션이 ACTION_RESOLVE_FAILED로 반환됨

- **유형:** BUG
- **심각도:** MEDIUM
- **발견일:** 2026-03-19
- **발견 경로:** Agent UAT defi-14 (DCent 2-hop Auto-Routing)
- **상태:** FIXED (ApiDirectResult 반환으로 전환)
- **수정일:** 2026-03-19
- **잔여 문제:** get_quotes 응답에 quotes 데이터 누락 (아래 참조)

## 증상 (수정 전)

`POST /v1/actions/dcent_swap/get_quotes` 호출 시 결과 데이터는 포함되지만 에러로 반환됨:

```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "Action resolve failed: get_quotes is informational. Use queryQuotes() query method. Result: {\"dexProviders\":6,\"bestDexProvider\":\"sushi_swap\"}"
}
```

## 수정 내용

ChainError throw → `ApiDirectResult` 반환으로 전환 (index.ts:162-180):

```typescript
case 'get_quotes': {
  const input = GetQuotesInputSchema.parse(rp);
  const result = await getDcentQuotes(this.getClient(), {...});
  return {
    __apiDirect: true as const,
    externalId: `dcent-quotes-${Date.now()}`,
    status: 'success' as const,
    provider: 'dcent_swap',
    action: 'get_quotes',
    data: {
      dexProviders: result.dexProviders,
      bestDexProvider: result.bestDexProvider ?? null,
      totalProviders: result.dexProviders.length,
    },
  };
}
```

## 잔여 문제: 응답에서 quotes 데이터 누락

2026-03-19 UAT (v2.12.0-rc)에서 get_quotes 호출 시:

```json
{"id":"dcent-quotes-1773932300305","status":"success"}
```

**기대 응답**:
```json
{
  "id": "dcent-quotes-...",
  "status": "success",
  "provider": "dcent_swap",
  "action": "get_quotes",
  "data": {
    "dexProviders": [...],
    "bestDexProvider": {...},
    "totalProviders": 6
  }
}
```

**원인 추정**: REST API 라우트 핸들러(`actions.ts`)가 `ApiDirectResult` 반환 시 `data` 필드를 포함하지 않고 `{id, status}`만 반환. 또는 `ApiDirectResult`를 `action_results` 테이블에 저장하고 별도 조회가 필요한 패턴.

**실행 경로**:
```
POST /v1/actions/dcent_swap/get_quotes
  → DCentSwapProvider.resolve('get_quotes', params, context)
    [index.ts:162-180] — ApiDirectResult 반환
  → ActionProviderRegistry.executeResolve()
    → ApiDirectResult 감지 (isApiDirectResult)
  → actions.ts route handler
    → ApiDirectResult를 {id, status}로 축소 반환  ← data 필드 누락?
```

**확인 필요**:
- `packages/daemon/src/api/routes/actions.ts`에서 `ApiDirectResult` 처리 로직
- `data` 필드가 응답에 포함되는지, 또는 `GET /v1/wallets/{id}/actions/{actionId}`로 별도 조회해야 하는지

## 테스트 항목

- [x] get_quotes 호출 시 200 OK 반환 (이전: ACTION_RESOLVE_FAILED → 수정됨)
- [ ] 응답에 `data.dexProviders` 배열이 포함되어 있음
- [ ] 각 프로바이더별 `expectedAmount`, `status`가 포함된 상세 견적
- [ ] SDK `getDcentQuotes()` 호출 시 정상 결과 수신
- [ ] MCP `get_quotes` 도구 호출 시 정상 결과 수신
