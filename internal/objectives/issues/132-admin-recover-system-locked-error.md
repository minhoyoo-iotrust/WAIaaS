# 132 — Admin UI에서 킬 스위치 Recover 시 SYSTEM_LOCKED 에러 발생

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v27.0
- **상태:** FIXED
- **등록일:** 2026-02-21

## 현상

Admin UI Security 페이지에서 킬 스위치를 SUSPENDED로 활성화한 후 "Recover" 버튼을 클릭하면, "시스템이 잠겨 있습니다(SYSTEM_LOCKED)" 에러가 표시되며 복구가 되지 않는다.

## 원인

두 가지 문제가 겹쳐 있다.

### 원인 1: apiPost가 빈 body + Content-Type: application/json 전송

`security.tsx:89`에서 `apiPost(API.ADMIN_RECOVER)`를 body 없이 호출한다:

```typescript
// security.tsx:89
await apiPost(API.ADMIN_RECOVER);  // body 없음
```

`client.ts:64-65`의 `apiPost` 구현:

```typescript
export const apiPost = <T>(path: string, body?: unknown) =>
  apiCall<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
```

`apiCall`은 항상 `Content-Type: application/json` 헤더를 설정(`client.ts:16`)하지만, body는 `undefined`이다. 서버의 recover 핸들러(`admin.ts:899`)에서 `c.req.json()`을 호출할 때 Hono가 빈 body를 JSON으로 파싱하려다 에러를 던지고, error-handler(`error-handler.ts:53`)가 이를 `SYSTEM_LOCKED` 코드로 래핑하여 반환한다.

```
apiPost(path) → Content-Type: application/json + body: undefined
→ c.req.json() 파싱 실패 → Error("Malformed JSON")
→ error-handler → { code: "SYSTEM_LOCKED", message: "Malformed JSON in request body" }
```

### 원인 2: Owner 등록 시 dual-auth 서명 미전송

body 파싱이 성공하더라도(`{}`), 지갑에 owner가 등록된 상태에서는 `admin.ts:915-921`의 dual-auth 검증이 작동한다:

```typescript
if (hasOwners) {
  if (!body.ownerSignature || !body.ownerAddress || !body.message) {
    throw new WAIaaSError('INVALID_SIGNATURE', {
      message: 'Owner signature required for recovery (dual-auth)...',
    });
  }
}
```

Admin UI의 recover 핸들러는 owner 서명을 수집하는 UI가 없으므로 항상 실패한다.

## 수정 범위

### 1. apiPost 빈 body 문제 수정

`security.tsx:89`에서 빈 객체를 명시적으로 전달:

```typescript
await apiPost(API.ADMIN_RECOVER, {});
```

또는 `client.ts`의 `apiPost`에서 body 미전달 시 빈 객체 기본값:

```typescript
export const apiPost = <T>(path: string, body?: unknown) =>
  apiCall<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
```

### 2. error-handler 일반 에러 코드 변경

`error-handler.ts:53`에서 일반 에러를 `SYSTEM_LOCKED`로 래핑하는 것은 오해를 유발한다. 킬 스위치와 무관한 파싱 에러가 "시스템 잠김"으로 표시된다. `INTERNAL_ERROR` 등 별도 코드로 변경:

```typescript
// error-handler.ts:53 — 현재
code: 'SYSTEM_LOCKED',
// → 수정
code: 'INTERNAL_ERROR',
```

### 3. Admin UI dual-auth 복구 지원

Owner가 등록된 환경에서 recover 시 WalletConnect 서명 흐름을 추가하거나, master-only 복구 옵션을 제공해야 한다. 범위가 크므로 별도 이슈로 분리 가능.

단기 대안: owner 미등록 환경에서는 master password만으로 복구 가능하므로, 에러 메시지에 "Owner signature required" 안내를 명확히 표시.

### 영향 범위

- `packages/admin/src/pages/security.tsx` — recover 호출 시 빈 body 전달
- `packages/admin/src/api/client.ts` — apiPost 기본값 (선택)
- `packages/daemon/src/api/middleware/error-handler.ts` — 일반 에러 코드 변경

## 테스트 항목

### 단위 테스트

1. SUSPENDED 상태에서 `POST /v1/admin/recover`에 빈 JSON body(`{}`) 전송 시 정상 복구되는지 확인 (owner 미등록 환경)
2. LOCKED 상태에서 `POST /v1/admin/recover`에 빈 JSON body 전송 시 정상 복구되는지 확인 (owner 미등록 환경)
3. body 없이(undefined) `POST /v1/admin/recover` 전송 시 `SYSTEM_LOCKED`가 아닌 적절한 에러 코드가 반환되는지 확인
4. Owner 등록 환경에서 서명 없이 recover 시 `INVALID_SIGNATURE` 에러와 함께 dual-auth 안내 메시지가 반환되는지 확인
5. Admin UI Security 페이지에서 Recover 클릭 시 정상 복구되는지 확인 (owner 미등록 환경)

### 회귀 테스트

6. 킬 스위치 활성화(ACTIVE → SUSPENDED) 기능이 정상 동작하는지 확인
7. 에스컬레이션(SUSPENDED → LOCKED) 기능이 정상 동작하는지 확인
8. error-handler의 일반 에러 처리가 기존 에러 응답 형식을 유지하는지 확인
