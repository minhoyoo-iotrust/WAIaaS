# 097 — Admin Owner 주소 등록 실패 시 구체적 에러 사유 미표시

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v2.5
- **상태:** OPEN
- **등록일:** 2026-02-19

## 현상

Admin UI 지갑 상세에서 Owner 주소를 잘못된 포맷으로 등록 시도하면 등록은 정상적으로 차단되지만, 토스트 메시지로 **"Action input validation failed."** 라는 일반적인 문구만 표시된다.

서버가 반환하는 구체적 에러 사유(예: `"Invalid owner address for ethereum: Invalid EIP-55 checksum"`, `"missing 0x prefix"`, `"Base58 decode failed"` 등)가 사용자에게 전달되지 않아, 어떤 이유로 등록이 실패했는지 알 수 없다.

## 원인

`handleSaveOwner`의 catch 블록에서 `getErrorMessage(e.code)`만 호출하고 `e.serverMessage`를 사용하지 않는다.

```typescript
// packages/admin/src/pages/wallets.tsx:418-420
catch (err) {
  const e = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Unknown error');
  showToast('error', getErrorMessage(e.code));  // → "Action input validation failed."
  // e.serverMessage에 구체적 사유가 있으나 무시됨
}
```

`ApiError`에는 서버 응답의 `message` 필드가 `serverMessage`로 저장되어 있다:

```typescript
// packages/admin/src/api/client.ts:3-11
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly serverMessage: string,  // ← 여기에 구체적 사유 존재
  ) { ... }
}
```

## 기대 동작

검증 실패 에러(`ACTION_VALIDATION_FAILED` 등 서버 메시지가 유의미한 코드)의 경우, 일반 매핑 메시지 대신 **서버가 반환한 구체적 사유(`serverMessage`)를 토스트로 표시**한다.

예시:
- `"Invalid owner address for ethereum: missing 0x prefix"`
- `"Invalid owner address for ethereum: Invalid EIP-55 checksum: all-lowercase or all-uppercase addresses are not accepted, use checksummed format"`
- `"Invalid owner address for solana: Base58 decode failed: Invalid Base58 character: 0"`

## 수정 범위

### 접근 방식

`getErrorMessage` 함수를 확장하여 `serverMessage`를 선택적으로 전달받고, 특정 에러 코드에 대해서는 서버 메시지를 우선 표시하도록 변경한다.

```typescript
// 변경 전
showToast('error', getErrorMessage(e.code));

// 변경 후
showToast('error', getErrorMessage(e.code, e.serverMessage));
```

`getErrorMessage`에서 서버 메시지가 유의미한 코드 목록(예: `ACTION_VALIDATION_FAILED`, `CONSTRAINT_VIOLATED` 등)에 대해서는 `serverMessage`를 반환하고, 그 외에는 기존 매핑 메시지를 유지한다.

### 영향 범위

- `packages/admin/src/utils/error-messages.ts` — `getErrorMessage` 시그니처 확장
- `packages/admin/src/pages/wallets.tsx` — `handleSaveOwner` catch 블록 수정
- 동일 패턴을 사용하는 다른 catch 블록도 일괄 적용 검토 (Owner Verify, WalletConnect 등)

## 테스트 항목

### 단위 테스트
1. `getErrorMessage('ACTION_VALIDATION_FAILED', 'custom message')` → `'custom message'` 반환
2. `getErrorMessage('ACTION_VALIDATION_FAILED')` → 기존 매핑 메시지 반환 (fallback)
3. `getErrorMessage('WALLET_NOT_FOUND', 'some message')` → 기존 매핑 메시지 반환 (서버 메시지 무시)

### 통합 테스트
4. 잘못된 EIP-55 주소 등록 시 토스트에 체크섬 관련 구체적 안내 표시 확인
5. 잘못된 Solana Base58 주소 등록 시 토스트에 디코딩 실패 구체적 안내 표시 확인
