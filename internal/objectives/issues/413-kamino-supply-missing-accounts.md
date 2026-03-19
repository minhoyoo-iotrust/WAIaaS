# #413 — Kamino Supply 시 "Missing accounts for Solana contract call" 에러

- **유형**: BUG
- **심각도**: HIGH
- **영향 시나리오**: defi-08
- **컴포넌트**: `packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts`
- **선행 이슈**: #406 (programId.toBuffer — FIXED, 불완전)
- **상태**: OPEN
- **재현 확인**: 2026-03-19 v2.12.0-rc (rc.27에서도 동일)

## 현상

`POST /v1/actions/kamino/kamino_supply?dryRun=true` 호출 시:
```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "Action resolve failed: Missing accounts for Solana contract call",
  "details": { "actionKey": "kamino/kamino_supply" }
}
```

RPC 429 이후 재시도 시 위 에러 발생. #406(programId.toBuffer) 수정 후 새로 나타난 에러.

## 실행 경로

```
POST /v1/actions/kamino/kamino_supply?dryRun=true
  → KaminoLendingProvider.resolve('kamino_supply', params, context)
    [packages/actions/src/providers/kamino/index.ts:136-155]
  → KaminoLendingProvider.resolveSupply(params, context)
    [index.ts:161-181]
  → KaminoSdkWrapper.buildSupplyInstruction(params)
    [kamino-sdk-wrapper.ts:338-363]
    → loadSdk()                          [line 347] — lazy import @kamino-finance/klend-sdk
    → loadMarket(params.market)          [line 348] — new Connection(rpcUrl), KaminoMarket.load()
    → sdk.KaminoAction.buildDepositTxns( [lines 351-353]
        market, amount.toString(), mint, wallet,
        new sdk.VanillaObligation(new sdk.PublicKey(KAMINO_PROGRAM_ID))
      )
    → allIxs = [...setupIxs, ...lendingIxs, ...cleanupIxs]  [line 354]
    → filtered = allIxs.filter(ix => ix != null)              [line 355]
    → result = this.convertInstructions(filtered)             [line 356]
  → instructionsToRequests(result, marketAddress)
    [index.ts:55-67]
  → SolanaAdapter.buildContractCall(request)
    [packages/adapters/solana/src/adapter.ts:680-689]
    → if (!request.accounts || request.accounts.length === 0)  ← ERROR HERE
```

## 원인 분석

### 1차 원인: convertInstructions() 검증 누락

**파일**: `kamino-sdk-wrapper.ts:326-336`

```typescript
private convertInstructions(ixs: any[]): KaminoInstruction[] {
  return ixs.map((ix) => ({
    programId: ix.programId.toBase58(),
    instructionData: Buffer.from(ix.data).toString('base64'),
    accounts: ix.keys.map((k: {...}) => ({     // ← ix.keys가 빈 배열이면 accounts: [] 생성
      pubkey: k.pubkey.toBase58(),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
  }));
}
```

- `ix.keys`가 빈 배열 `[]`이면 `.map()` 결과도 `[]` → `{ accounts: [] }` 생성
- `ix.keys`가 `undefined`/`null`이면 `.map()` 호출 시 TypeError
- 어느 경우든 **검증 없이 빈 accounts가 다음 단계로 전달**

### 2차 원인: SDK가 빈 keys를 가진 instruction 반환

Kamino SDK `KaminoAction.buildDepositTxns()` 반환 구조:
```typescript
{
  setupIxs: TransactionInstruction[],    // ATA 생성 등 — 상황에 따라 빈 keys 가능
  lendingIxs: TransactionInstruction[],  // 핵심 lending instruction
  cleanupIxs: TransactionInstruction[],  // 정리 instruction — placeholder일 수 있음
}
```

현재 SDK 호출 시 선택적 파라미터 5개만 전달하고 8개는 기본값 사용:
```typescript
await sdk.KaminoAction.buildDepositTxns(
  market, amount.toString(), mint, wallet,
  new sdk.VanillaObligation(...)
  // includeAtaIxns, requestElevationGroup, includeUserMetadata 등 미전달
);
```

`includeAtaIxns` 기본값이 `false`여서 ATA 생성 instruction에 빈 keys가 포함될 수 있음.

### 3차 원인: 검증 체인 전체에 gap 존재

| 위치 | 파일:라인 | 검증 | 상태 |
|------|----------|------|------|
| convertInstructions() | kamino-sdk-wrapper.ts:326-336 | ix.keys 존재/비어있지 않음 | **없음** |
| buildSupplyInstruction() | kamino-sdk-wrapper.ts:356-362 | 변환 결과 유효성 | **없음** |
| instructionsToRequests() | index.ts:55-67 | accounts 비어있지 않음 | **없음** |
| resolveSupply() | index.ts:180 | 반환값 유효성 | **없음** |
| SolanaAdapter.buildContractCall() | adapter.ts:686-689 | accounts 비어있지 않음 | **있음 (에러 발생 지점)** |

### 디버그 로그 확인 포인트

`buildSupplyInstruction()` (line 357-361)에 디버그 로그 존재:
```typescript
this.logger?.debug('KaminoSdkWrapper.buildSupplyInstruction result', {
  setupIxs: action.setupIxs?.length ?? 0,
  lendingIxs: action.lendingIxs?.length ?? 0,
  cleanupIxs: action.cleanupIxs?.length ?? 0,
  totalFiltered: filtered.length,
  resultAccounts: result.map((ix) => ix.accounts.length),  // ← 빈 accounts가 보일 것
});
```

`resultAccounts`에 `[5, 0]` 같은 패턴이 있으면 두 번째 instruction의 keys가 비어있음.

### 테스트 한계

현재 테스트 (`packages/actions/src/__tests__/kamino-sdk-wrapper.test.ts`)의 mock instruction:
```typescript
const mockIx = {
  programId: mockPubkey(KAMINO_PROGRAM_ID),
  data: Buffer.from('test-data'),
  keys: [  // ← 항상 비어있지 않은 keys
    { pubkey: mockPubkey(WALLET), isSigner: true, isWritable: true },
    { pubkey: mockPubkey(MARKET), isSigner: false, isWritable: true },
  ],
};
```

**mock이 항상 non-empty keys를 사용하므로 빈 keys 시나리오를 검출 못함.**

## 수정 방향

### 1단계: convertInstructions()에 keys 검증 추가

```typescript
private convertInstructions(ixs: any[]): KaminoInstruction[] {
  return ixs
    .filter((ix) => ix.keys && ix.keys.length > 0)  // 빈 keys instruction 필터링
    .map((ix) => ({
      programId: ix.programId.toBase58(),
      instructionData: Buffer.from(ix.data).toString('base64'),
      accounts: ix.keys.map((k: {...}) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
    }));
}
```

### 2단계: buildSupplyInstruction() 결과 검증

```typescript
const result = this.convertInstructions(filtered);
if (result.length === 0) {
  throw new ChainError('INVALID_INSTRUCTION', 'solana', {
    message: 'Kamino SDK returned no valid instructions with accounts',
  });
}
```

### 3단계: 빈 keys instruction 디버그 로깅

```typescript
const emptyKeysCount = filtered.filter(ix => !ix.keys || ix.keys.length === 0).length;
if (emptyKeysCount > 0) {
  this.logger?.warn('Kamino SDK returned instructions with empty keys', {
    emptyKeysCount,
    totalInstructions: filtered.length,
    labels: {
      setup: action.setupIxsLabels,
      lending: action.lendingIxsLabels,
      cleanup: action.cleanupIxsLabels,
    },
  });
}
```

### 4단계: 테스트에 빈 keys 시나리오 추가

```typescript
const mockEmptyKeysIx = {
  programId: mockPubkey(KAMINO_PROGRAM_ID),
  data: Buffer.from('empty'),
  keys: [],  // 빈 keys
};
const mockAction = {
  setupIxs: [mockEmptyKeysIx],
  lendingIxs: [mockIx],  // 정상
  cleanupIxs: [],
};
// → convertInstructions가 빈 keys를 필터링하고 정상 instruction만 반환
```

## 테스트 항목

- [ ] convertInstructions()가 빈 keys instruction을 필터링
- [ ] buildSupplyInstruction() 결과가 모두 빈 keys일 때 명확한 에러 메시지
- [ ] 디버그 로그에 빈 keys instruction 경고 출력
- [ ] 정상 instruction이 포함된 경우 빈 keys만 필터링하고 나머지는 정상 처리
- [ ] Kamino supply dryRun 호출 시 메인넷에서 정상 시뮬레이션 성공
