# Issue #297: E2E 오프체인 Settings GET 응답 구조 불일치

- **상태:** FIXED
- **유형:** BUG
- **심각도:** MEDIUM
- **발견 경로:** E2E offchain smoke test 실행
- **관련 파일:**
  - `packages/e2e-tests/src/__tests__/interface-admin-mcp-sdk.e2e.test.ts:88`
  - `packages/daemon/src/api/routes/admin.ts` (settingsGetRoute)

## 증상

`admin-ui-settings > updates a setting via PUT and reads back` 테스트 실패:

```
AssertionError: expected undefined to be 'KRW' // Object.is equality
```

## 원인

`GET /v1/admin/settings` 응답은 카테고리별로 그룹화된 중첩 객체를 반환함:
```json
{ "display": { "currency": "KRW" }, "rpc": { ... }, ... }
```

그러나 E2E 테스트는 플랫 키로 접근하고 있음:
```typescript
expect(getRes.body['display.currency']).toBe('KRW');
```

`display.currency`는 플랫 키가 아니라 `display` 객체 안의 `currency` 필드이므로 `undefined`가 반환됨.

## 수정 방안

테스트 코드에서 중첩 객체 구조에 맞게 접근 방식을 수정:
```typescript
expect((getRes.body as Record<string, Record<string, unknown>>).display?.currency).toBe('KRW');
```

## 테스트 항목

- [ ] `pnpm --filter @waiaas/e2e-tests run test:offchain` 실행 시 `admin-ui-settings` 시나리오 전체 통과 확인
- [ ] Settings PUT → GET 라운드트립에서 값이 정상적으로 반영되는지 검증
