# #375 — DriftSdkWrapper 실제 SDK 연결 구현

- **유형:** MISSING
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED

## 설명

`DriftSdkWrapper` 클래스가 모든 메서드에서 `throwNotConfigured()`만 호출하는 스텁 상태. `@drift-labs/sdk`를 동적 import하여 실제 SDK 호출을 수행하는 구현이 필요하다.

프로바이더 로직(`DriftPerpProvider`)은 5액션 resolve + 마진 검증 + IPositionProvider 전체 구현 완료. `IDriftSdkWrapper` 인터페이스(8메서드) 계약 확정. `MockDriftSdkWrapper`로 테스트 전부 통과. SDK 연결부만 비어있음.

## 구현 대상

| 메서드 | SDK 호출 |
|--------|---------|
| `buildOpenPositionInstruction()` | `DriftClient.getPlacePerpOrderIx()` |
| `buildClosePositionInstruction()` | `DriftClient.getPlacePerpOrderIx()` (close) |
| `buildAddMarginInstruction()` | `DriftClient.getDepositIx()` |
| `buildRemoveMarginInstruction()` | `DriftClient.getWithdrawIx()` |
| `buildCancelOrderInstruction()` | `DriftClient.getCancelOrderIx()` |
| `getPositions()` | `DriftClient.getUser().getPerpPositions()` |
| `getMarginInfo()` | `DriftClient.getUser().getFreeCollateral()` 등 |
| `getMarkets()` | `DriftClient.getPerpMarketAccounts()` |

## 수정 방안

```typescript
// drift-sdk-wrapper.ts — DriftSdkWrapper 클래스
private client: unknown = null;

private async loadClient() {
  if (this.client) return this.client;
  const { DriftClient, Wallet } = await import('@drift-labs/sdk');
  const { Connection } = await import('@solana/web3.js');
  const connection = new Connection(this.rpcUrl);
  // DriftClient 초기화 (read-only mode for queries, full mode for instructions)
  this.client = { DriftClient, connection };
  return this.client;
}
```

- 동적 `import()` + 인스턴스 캐싱 (lazy init)
- `TransactionInstruction` → `DriftInstruction` 변환 (programId + base64 + accounts)
- Sub-account 인덱스 지원 (`this.subAccount`)
- SDK 미설치 시 기존 `throwNotConfigured()` 유지 (graceful fallback)

## 관련 코드

- `packages/actions/src/providers/drift/drift-sdk-wrapper.ts:306-` — 스텁 클래스
- `packages/actions/src/providers/drift/drift-sdk-wrapper.ts:72-` — IDriftSdkWrapper 인터페이스
- `packages/actions/src/providers/drift/index.ts` — DriftPerpProvider (완전 구현)
- `packages/actions/src/providers/drift/drift-market-data.ts` — MarketData 클라이언트
- `packages/actions/package.json` — `@drift-labs/sdk` optionalDependencies (v32.5에서 추가)

## 테스트 항목

- [ ] SDK 설치 시 `buildOpenPositionInstruction()` 호출 → 유효한 `DriftInstruction[]` 반환
- [ ] SDK 미설치 시 기존 `throwNotConfigured()` 동작 유지
- [ ] `getPositions()` 호출 → 실제 온체인 perp 포지션 데이터 반환
- [ ] `getMarginInfo()` 호출 → 실제 마진/담보 정보 반환
- [ ] `getMarkets()` 호출 → 실제 perp 마켓 목록 반환
- [ ] Sub-account 인덱스가 DriftClient에 올바르게 전달되는지 확인
- [ ] 동적 import 캐싱 — 두 번째 호출 시 재import 없이 캐시 사용
- [ ] 기존 MockDriftSdkWrapper 단위 테스트 회귀 없음
