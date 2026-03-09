# 293 — E2E Settings PUT 테스트가 잘못된 설정 키(display_currency) 사용 — 실제 키는 display.currency

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v31.8
- **발견일:** 2026-03-09
- **발견 경로:** 오프체인 E2E 테스트 실행 결과
- **상태:** FIXED
- **수정일:** 2026-03-09

## 증상

`interface-admin-mcp-sdk.e2e.test.ts`의 `updates a setting via PUT and reads back` 테스트가 400으로 실패:

```
expected 400 to be 200 // Object.is equality
```

## 원인

테스트에서 `display_currency` 키를 사용하지만, `SETTING_DEFINITIONS`에 등록된 실제 키는 `display.currency`이다.

테스트 코드 (`interface-admin-mcp-sdk.e2e.test.ts` 77줄):
```typescript
{ settings: [{ key: 'display_currency', value: 'KRW' }] }
```

서버의 설정 키 정의 (`packages/daemon/src/infrastructure/settings/setting-keys.ts` 122줄):
```typescript
{ key: 'display.currency', category: 'display', configPath: 'display.currency', ... }
```

서버의 PUT 핸들러(`admin.ts` 1603줄)에서 `getSettingDefinition(entry.key)`가 `display_currency`를 찾지 못하고 `Unknown setting key` 에러를 반환하여 400이 된다.

## 수정 방안

테스트에서 올바른 설정 키를 사용:

```typescript
// Before
{ settings: [{ key: 'display_currency', value: 'KRW' }] }

// After
{ settings: [{ key: 'display.currency', value: 'KRW' }] }
```

읽기 확인도 동일하게 수정:
```typescript
// Before
expect(getRes.body['display_currency']).toBe('KRW');

// After
expect(getRes.body['display.currency']).toBe('KRW');
```

## 영향 범위

- `packages/e2e-tests/src/__tests__/interface-admin-mcp-sdk.e2e.test.ts` — 71-96줄

## 테스트 항목

1. 수정 후 PUT `/v1/admin/settings`가 200 반환하는지 확인
2. GET으로 읽어온 설정 값이 `KRW`로 변경되었는지 확인
3. 테스트 종료 시 `USD`로 원복되는지 확인
