# #374 — KaminoSdkWrapper 실제 SDK 연결 구현

- **유형:** MISSING
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED

## 설명

`KaminoSdkWrapper` 클래스가 모든 메서드에서 `throwNotConfigured()`만 호출하는 스텁 상태. `@kamino-finance/klend-sdk`를 동적 import하여 실제 SDK 호출을 수행하는 구현이 필요하다.

프로바이더 로직(`KaminoLendingProvider`)은 4액션 resolve + HF 시뮬레이션 + IPositionProvider + ILendingProvider 전체 구현 완료. `IKaminoSdkWrapper` 인터페이스(6메서드) 계약 확정. `MockKaminoSdkWrapper`로 테스트 전부 통과. SDK 연결부만 비어있음.

## 구현 대상

| 메서드 | SDK 호출 |
|--------|---------|
| `buildSupplyInstruction()` | `KaminoAction.buildDepositReserveLiquidityAndObligationCollateral()` |
| `buildBorrowInstruction()` | `KaminoAction.buildBorrowObligationLiquidity()` |
| `buildRepayInstruction()` | `KaminoAction.buildRepayObligationLiquidity()` |
| `buildWithdrawInstruction()` | `KaminoAction.buildRedeemReserveCollateral()` |
| `getObligation()` | `KaminoMarket.getObligationByWallet()` |
| `getReserves()` | `KaminoMarket.getReserves()` |

## 수정 방안

```typescript
// kamino-sdk-wrapper.ts — KaminoSdkWrapper 클래스
private sdk: unknown = null;

private async loadSdk() {
  if (this.sdk) return this.sdk;
  const { KaminoMarket } = await import('@kamino-finance/klend-sdk');
  const { Connection } = await import('@solana/web3.js');
  const connection = new Connection(this.rpcUrl);
  this.sdk = { KaminoMarket, connection };
  return this.sdk;
}
```

- 동적 `import()` + 인스턴스 캐싱 (lazy init)
- `TransactionInstruction` → `KaminoInstruction` 변환 (programId + base64 + accounts)
- SDK 미설치 시 기존 `throwNotConfigured()` 유지 (graceful fallback)

## 관련 코드

- `packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts:271-333` — 스텁 클래스
- `packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts:58-95` — IKaminoSdkWrapper 인터페이스
- `packages/actions/src/providers/kamino/index.ts` — KaminoLendingProvider (완전 구현)
- `packages/actions/package.json` — `@kamino-finance/klend-sdk` optionalDependencies (v32.5에서 추가)

## 테스트 항목

- [ ] SDK 설치 시 `buildSupplyInstruction()` 호출 → 유효한 `KaminoInstruction[]` 반환
- [ ] SDK 미설치 시 기존 `throwNotConfigured()` 동작 유지
- [ ] `getObligation()` 호출 → 실제 온체인 obligation 데이터 반환
- [ ] `getReserves()` 호출 → 실제 마켓 reserve 데이터 반환
- [ ] 동적 import 캐싱 — 두 번째 호출 시 재import 없이 캐시 사용
- [ ] 기존 MockKaminoSdkWrapper 단위 테스트 회귀 없음
