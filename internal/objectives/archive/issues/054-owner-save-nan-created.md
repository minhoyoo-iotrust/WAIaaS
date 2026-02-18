# v1.7-054: Owner 주소 저장 후 Created 시각이 NaN으로 표시

## 유형: BUG
## 상태: FIXED

## 심각도: LOW

## 현상

Admin UI 월렛 상세 페이지에서 Owner 주소를 설정(Save)하면, **Created** 행이 `NaN-NaN-NaN NaN:NaN`으로 표시되고 **Owner State** 뱃지가 빈 값("—")으로 변경된다. 페이지 새로고침 시 정상 복구.

## 원인

`PUT /v1/wallets/:id/owner` 응답(`WalletOwnerResponseSchema`)에 `createdAt`과 `ownerState` 필드가 포함되어 있지 않음.

Admin UI `handleSaveOwner`(`wallets.tsx:390-393`)에서 PUT 응답을 `wallet.value = result`로 통째로 덮어쓰기하여, 기존 `createdAt`/`ownerState` 값이 `undefined`로 손실됨.

- `formatDate(undefined)` → `new Date(NaN)` → `"NaN-NaN-NaN NaN:NaN"`
- `ownerState` → `undefined` → Badge 빈 값 렌더 → "—" 표시

## 수정 방안

`wallets.tsx` `handleSaveOwner`에서 응답을 통째 할당 대신 기존 값에 병합:

```tsx
// Before (덮어쓰기)
wallet.value = result;

// After (병합)
wallet.value = { ...wallet.value!, ...result };
```

### 변경 대상 파일

- `packages/admin/src/pages/wallets.tsx` — `handleSaveOwner` 1줄 수정

### 재발 방지 테스트

- `packages/admin/src/__tests__/wallets.test.tsx` — Owner 저장 후 `createdAt`/`ownerState`가 유지되는지 검증하는 테스트 추가

| # | 시나리오 | 검증 방법 |
|---|---------|----------|
| 1 | Owner 저장 후 createdAt 유지 | handleSaveOwner 후 wallet.createdAt이 원래 값과 동일한지 assert |
| 2 | Owner 저장 후 ownerState 유지 | handleSaveOwner 후 wallet.ownerState이 undefined가 아닌지 assert |

## 재현 절차

1. Admin UI → Wallets → 월렛 상세 진입
2. Owner Address 편집 아이콘 클릭
3. 유효한 주소 입력 후 Save
4. Created 행이 `NaN-NaN-NaN NaN:NaN`으로 변경됨

## 발견

- WalletConnect 수동 테스트 중 Owner 주소 설정 단계에서 발견
