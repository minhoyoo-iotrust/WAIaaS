# v1.6-037: Admin Table 컴포넌트 undefined data 크래시

## 유형: BUG

## 심각도: MEDIUM

## 현상

`packages/admin/src/components/table.tsx:44`에서 `data.length`를 참조할 때 `data`가 `undefined`이면 크래시 발생.

```
TypeError: Cannot read properties of undefined (reading 'length')
 > x.constructor src/components/table.tsx:44:20
```

## 원인

`Table<T>` 컴포넌트의 `data` prop이 `T[]` 타입으로 선언되어 있지만, 비동기 API 응답이 실패하거나 mock이 소진되면 `undefined`가 전달될 수 있음. Preact signal의 `.value`가 비동기 상태 변환 중 일시적으로 `undefined`가 되는 케이스를 방어하지 못함.

### 영향 범위

- `sessions.test.tsx` 3개 테스트 실패 (Unhandled Rejection)
- 실제 런타임에서 API 에러 시 sessions 페이지 크래시 가능

## 수정 방안

`table.tsx:44`를 방어적으로 변경:

```typescript
// Before
) : data.length === 0 ? (

// After
) : !data || data.length === 0 ? (
```

또는 `sessions.tsx`에서 `fetchSessions()` 실패 시 `sessions.value`를 `[]`로 유지하도록 보장.

## 테스트 수정

`sessions.test.tsx`의 mock 개수도 수정 필요 — `useEffect` 2개가 마운트 시 동시 실행되어 `fetchSessions()`가 2회 호출됨. 각 테스트에 초기 세션 로드용 mock (`[]`) 추가 필요.

## 발견

- v1.6 마일스톤 완료 후 `pnpm test` 실행 시 발견
- `@waiaas/admin` sessions.test.tsx 3개 테스트 모두 실패
