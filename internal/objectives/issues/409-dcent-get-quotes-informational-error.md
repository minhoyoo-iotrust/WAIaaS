# 409 — DCent get_quotes informational 액션이 ACTION_RESOLVE_FAILED로 반환됨

- **유형:** BUG
- **심각도:** MEDIUM
- **발견일:** 2026-03-19
- **발견 경로:** Agent UAT defi-14 (DCent 2-hop Auto-Routing)
- **상태:** FIXED

## 증상

`POST /v1/actions/dcent_swap/get_quotes` 호출 시 결과 데이터는 포함되지만 에러로 반환됨:

```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "Action resolve failed: get_quotes is informational. Use queryQuotes() query method. Result: {\"dexProviders\":6,\"bestDexProvider\":\"sushi_swap\"}"
}
```

## 근본 원인

**설계 의도(DS-07)와 REST API 구현 간 불일치 — informational 액션이 의도적으로 ChainError를 throw하지만 REST API가 이를 에러로 처리.**

### 코드 경로

| 파일 | 위치 | 역할 |
|------|------|------|
| `packages/actions/src/providers/dcent-swap/index.ts:151-164` | `resolve()` get_quotes case | 견적 조회 후 **의도적으로 ChainError throw** |
| `packages/daemon/src/api/routes/actions.ts:374-392` | 액션 라우트 에러 핸들러 | catch에서 모든 에러를 `ACTION_RESOLVE_FAILED`로 래핑 |
| `packages/daemon/src/infrastructure/action/action-provider-registry.ts:169-241` | `executeResolve()` | informational 구분 없이 에러 전파 |

### 상세 분석

1. **설계 문서 77 (DS-07)**:
   > "get_quotes와 swap_status는 정보성 액션이므로 resolve()에서 ContractCallRequest를 반환하지 않는다. 별도 query 메서드를 노출하고 MCP/SDK에서 직접 호출한다."

2. **프로바이더** (`index.ts:151-164`): 견적을 정상적으로 조회한 뒤, 결과를 에러 메시지에 포함하여 `ChainError`를 throw:
   ```typescript
   const result = await getDcentQuotes(...);
   throw new ChainError('INVALID_INSTRUCTION', context.chain, {
     message: `get_quotes is informational. Use queryQuotes()... Result: ${JSON.stringify({...})}`,
   });
   ```

3. **라우트 핸들러** (`actions.ts:374-392`): `executeResolve()`의 모든 에러를 catch하여 `ACTION_RESOLVE_FAILED`로 반환. informational 결과와 실제 에러를 구분하지 않음

4. **`queryQuotes()` 메서드** (`index.ts:208-210`): 정상 동작하는 쿼리 메서드가 존재하지만, REST API에서 이를 호출하는 경로가 없음

5. **SDK** (`sdk/client.ts:923`): `getDcentQuotes()`가 `executeAction()`을 호출하여 REST API를 경유하므로 동일 에러 발생

### 설계 불일치

- `resolve()`는 `ContractCallRequest[]`을 반환하도록 타입이 정해져 있어 informational 결과를 반환할 방법이 없음
- `ApiDirectResult` 패턴(Hyperliquid에서 사용)이 존재하지만 query-only 액션에는 적용되지 않음
- 현재 `InformationalResult` 같은 타입이 없음

## 수정 방향

**Option A (권장)**: informational 액션을 `ApiDirectResult`로 반환
- `get_quotes`의 resolve()에서 `ApiDirectResult` 형태로 견적 데이터를 반환
- 라우트 핸들러에서 `ApiDirectResult`를 200 OK로 직접 반환

**Option B**: 전용 REST 엔드포인트 추가
- `GET /v1/providers/dcent_swap/quotes`로 `queryQuotes()`를 직접 노출
- `get_quotes`를 액션 목록에서 제거

## 테스트 항목

- [ ] get_quotes 호출 시 견적 결과가 200 OK로 반환
- [ ] 각 프로바이더별 outputAmount, status가 포함된 상세 견적 반환
- [ ] SDK `getDcentQuotes()` 호출 시 정상 결과 수신
- [ ] MCP `get_quotes` 도구 호출 시 정상 결과 수신
