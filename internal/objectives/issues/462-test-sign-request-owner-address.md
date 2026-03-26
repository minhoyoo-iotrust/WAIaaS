# #462 — Admin 테스트 서명 요청에 오너 주소 지정 불가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** OPEN
- **등록일:** 2026-03-26

## 현상

Admin UI에서 지갑 앱에 테스트 서명 요청(`POST /v1/admin/wallet-apps/{id}/test-sign-request`)을 보내면, `signerAddress`와 `metadata.from`이 항상 `0x0000000000000000000000000000000000000000`으로 고정되어 전송된다.

이로 인해 D'CENT 지갑 앱에서 서명 요청을 수신해도 **어떤 지갑 주소로 서명해야 할지 알 수 없다**.

## 원인

`packages/daemon/src/api/routes/wallet-apps.ts:356` 에서 테스트 `SignRequest`를 구성할 때 `signerAddress`가 zero address로 하드코딩되어 있고, request body를 받지 않는 엔드포인트이다.

```typescript
signerAddress: '0x0000000000000000000000000000000000000000',
// ...
metadata: {
  // ...
  from: '0x0000000000000000000000000000000000000000',
  to: '0x0000000000000000000000000000000000000000',
}
```

## 수정 방안

### 1. API 변경
- `POST /v1/admin/wallet-apps/{id}/test-sign-request`에 optional request body 추가:
  ```json
  { "ownerAddress": "0x1234..." }
  ```
- `ownerAddress`가 전달되면 `signerAddress`와 `metadata.from`에 해당 주소를 사용
- 미전달 시 기존 동작(zero address) 유지 (하위 호환성)

### 2. Admin UI 변경
- `packages/admin/src/pages/human-wallet-apps.tsx`의 Test Sign 버튼 영역에 owner address 입력 필드 추가
- 입력값을 `handleTestSignRequest`에서 request body로 전달

### 3. 영향 범위
- `packages/daemon/src/api/routes/wallet-apps.ts` — route 정의 + 핸들러
- `packages/daemon/src/api/routes/openapi-schemas.ts` — request body schema (필요 시)
- `packages/admin/src/pages/human-wallet-apps.tsx` — UI 입력 필드 + API 호출
- `packages/admin/src/api/types.generated.ts` — OpenAPI 타입 재생성

## 테스트 항목

- [ ] `ownerAddress` body 없이 호출 시 기존 동작(zero address) 유지 확인
- [ ] `ownerAddress` body 전달 시 Push payload의 `signerAddress`가 해당 주소로 설정되는지 확인
- [ ] Admin UI에서 owner address 입력 후 Test Sign 호출 시 정상 동작 확인
- [ ] Admin UI에서 owner address 미입력 시 기존 동작 확인
