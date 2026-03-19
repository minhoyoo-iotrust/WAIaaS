# 406 — Kamino Supply programId.toBuffer is not a function

- **유형:** BUG
- **심각도:** HIGH
- **발견일:** 2026-03-19
- **발견 경로:** Agent UAT defi-08 (Kamino Lending USDC Supply)
- **상태:** OPEN

## 증상

`POST /v1/actions/kamino/kamino_supply?dryRun=true` 호출 시 `ACTION_RESOLVE_FAILED`:

```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "Action resolve failed: programId.toBuffer is not a function"
}
```

## 근본 원인

**`KAMINO_PROGRAM_ID` (문자열)를 `VanillaObligation` 생성자에 직접 전달 — `PublicKey` 인스턴스가 필요.**

| 파일 | 위치 | 문제 |
|------|------|------|
| `packages/actions/src/providers/kamino/config.ts` | 상수 정의 | `KAMINO_PROGRAM_ID = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD'` (문자열) |
| `packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts:346` | `buildSupplyInstruction()` | `new sdk.VanillaObligation(KAMINO_PROGRAM_ID)` ← 문자열 전달 |
| `packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts:363` | `buildBorrowInstruction()` | 동일 패턴 |
| `packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts:381` | `buildRepayInstruction()` | 동일 패턴 |
| `packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts:399` | `buildWithdrawInstruction()` | 동일 패턴 |
| `packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts:413` | `getObligation()` | 동일 패턴 |

### 상세 분석

1. **`VanillaObligation` 생성자 시그니처** (`@kamino-finance/klend-sdk`):
   ```typescript
   constructor(programId: PublicKey) // @solana/web3.js PublicKey 필요
   ```
2. `KAMINO_PROGRAM_ID`는 **문자열**이므로 `toBuffer()` 메서드가 없음
3. SDK 내부에서 `programId.toBuffer()`를 호출할 때 런타임 에러 발생
4. **5개 메서드 모두** 동일한 패턴으로 영향받아 supply/borrow/repay/withdraw/getObligation 전부 실패

### Drift SDK와 비교 (정상 구현)

`packages/actions/src/providers/drift/drift-sdk-wrapper.ts:371`:
```typescript
programID: new sdk.PublicKey(DRIFT_PROGRAM_ID), // ← 올바르게 변환
```

Drift는 문자열 → PublicKey 변환을 수행하지만, Kamino는 누락됨.

## 수정 방향

5개 메서드에서 `KAMINO_PROGRAM_ID` → `new sdk.PublicKey(KAMINO_PROGRAM_ID)` 변환 추가:
```typescript
new sdk.VanillaObligation(new sdk.PublicKey(KAMINO_PROGRAM_ID))
```

또는 `config.ts`에서 상수 자체를 PublicKey로 정의.

## 테스트 항목

- [ ] Kamino supply dryRun 호출 시 정상 응답 반환
- [ ] Kamino withdraw dryRun 호출 시 정상 응답 반환
- [ ] Kamino borrow/repay 액션도 동일 수정 적용 확인
- [ ] `VanillaObligation` 생성자에 PublicKey 인스턴스가 전달되는지 단위 테스트
