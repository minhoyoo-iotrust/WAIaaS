# v1.5-032: ActionProviderRegistry.listActions() 빌드 실패 — noUncheckedIndexedAccess 위반

## 유형

BUG

## 심각도

HIGH — 빌드 실패로 배포 불가

## 증상

`npm run build` 시 `@waiaas/daemon` 패키지에서 TypeScript 컴파일 에러 발생:

```
src/infrastructure/action/action-provider-registry.ts(130,21): error TS2322:
Type 'string | undefined' is not assignable to type 'string'.
  Type 'undefined' is not assignable to type 'string'.
```

## 원인

`tsconfig.base.json`에 `"noUncheckedIndexedAccess": true`가 설정되어 있다. 이 옵션은 배열 인덱스 접근(`arr[0]`) 결과를 `T | undefined`로 추론한다.

```typescript
// action-provider-registry.ts:128-130
const pName = key.split('/')[0];  // TypeScript 추론: string | undefined
result.push({ providerName: pName, action: entry.action });
//                           ^^^^^ string | undefined → string에 할당 불가
```

`key`는 항상 `${metadata.name}/${action.name}` 형식으로 저장(73번 줄)되므로 `split('/')[0]`이 `undefined`가 될 수 없지만, TypeScript 컴파일러는 이를 정적으로 증명할 수 없다.

## 발생 위치

- **파일**: `packages/daemon/src/infrastructure/action/action-provider-registry.ts`
- **줄**: 128-130 (`listActions` 메서드)
- **도입 커밋**: `992bb8c` (feat(128-01): ActionProviderRegistry 구현)

## 수정 방법

`split('/')[0]`에 non-null assertion 또는 fallback 값을 추가:

```typescript
const pName = key.split('/')[0] ?? key;
```

## 재발 방지 테스트

기존 `action-provider-registry.test.ts`에 `listActions` 테스트가 있으나, **런타임 동작만 검증**하고 있어 컴파일 에러를 잡지 못했다. CI 파이프라인에서 `tsc --noEmit` 또는 `npm run build`를 테스트 전에 실행하여 타입 에러를 조기에 감지해야 한다.

### 추가할 검증

1. **빌드 → 테스트 순서 보장**: CI에서 `build` 성공 후 `test` 실행. v1.5 마일스톤에서 빌드 확인 없이 아카이브된 것이 직접 원인.
2. **listActions 반환 타입 단위 테스트**: `listActions()` 결과의 `providerName`이 빈 문자열이 아닌지 assert 추가.

```typescript
// action-provider-registry.test.ts 추가
it('listActions returns providerName as non-empty string', () => {
  registry.register(mockProvider);
  const actions = registry.listActions();
  for (const entry of actions) {
    expect(typeof entry.providerName).toBe('string');
    expect(entry.providerName.length).toBeGreaterThan(0);
  }
});
```

## 영향 범위

- `listActions()`는 `GET /v1/actions` REST 라우트에서 호출됨
- 런타임 동작에는 영향 없음 (key 형식이 보장되므로)
- **빌드 불가**로 인해 배포/릴리스 차단

## 관련

- `tsconfig.base.json:19` — `noUncheckedIndexedAccess: true`
- `packages/daemon/src/__tests__/action-provider-registry.test.ts` — 기존 테스트 20개
