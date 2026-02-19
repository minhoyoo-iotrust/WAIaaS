# 098 — Admin Owner 주소 등록 후 ownerState가 즉시 반영되지 않음

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v2.5
- **상태:** OPEN
- **등록일:** 2026-02-19

## 현상

Admin UI 지갑 상세에서 Owner 주소를 등록하면, 성공 토스트는 뜨지만 페이지 내 Owner 상태 뱃지(NONE → GRACE)와 조건부 UI(WalletConnect 페어링 버튼, Verify 버튼 등)가 즉시 갱신되지 않는다. 페이지를 나갔다 다시 들어오면 정상 표시된다.

## 원인

`handleSaveOwner` 성공 후 서버 응답을 기존 `wallet.value`에 머지하는데, `PUT /wallets/:id/owner` 응답에 `ownerState` 필드가 포함되지 않는다.

```typescript
// packages/admin/src/pages/wallets.tsx:411-416
const result = await apiPut<Partial<WalletDetail>>(API.WALLET_OWNER(id), {
  owner_address: editOwnerAddress.value.trim(),
});
wallet.value = { ...wallet.value!, ...result };
// result에 ownerState 없음 → 이전 값 'NONE' 유지
```

서버 응답 (`packages/daemon/src/api/routes/wallets.ts:609-623`):
- 포함: `id`, `name`, `chain`, `network`, `environment`, `publicKey`, `status`, `ownerAddress`, `ownerVerified`, `updatedAt`
- **미포함: `ownerState`** ← `resolveOwnerState()`로 계산되는 파생 필드

반면 `GET /wallets/:id` (fetchWallet)에서는 `ownerState`가 포함되어, 페이지 재진입 시 정상 표시된다.

## 수정 방안

`handleSaveOwner` 성공 후 `await fetchWallet()`을 호출하여 전체 지갑 데이터를 다시 가져온다. 이미 `handleChangeDefaultNetwork`에서 동일한 패턴을 사용 중이다.

```typescript
// 변경 전
const result = await apiPut<Partial<WalletDetail>>(API.WALLET_OWNER(id), {
  owner_address: editOwnerAddress.value.trim(),
});
wallet.value = { ...wallet.value!, ...result };

// 변경 후
await apiPut(API.WALLET_OWNER(id), {
  owner_address: editOwnerAddress.value.trim(),
});
await fetchWallet();
```

### 영향 범위

- `packages/admin/src/pages/wallets.tsx` — `handleSaveOwner` 함수 1곳 수정

## 테스트 항목

### 단위 테스트
1. `handleSaveOwner` 성공 후 `fetchWallet`이 호출되는지 확인
2. Owner 주소 등록 후 `wallet.value.ownerState`가 `'GRACE'`로 갱신되는지 확인

### 수동 검증
3. Admin UI에서 Owner 주소 등록 후 NONE → GRACE 뱃지가 즉시 변경되는지 확인
4. GRACE 상태 관련 UI(WalletConnect 페어링 버튼, Verify 버튼)가 즉시 나타나는지 확인
