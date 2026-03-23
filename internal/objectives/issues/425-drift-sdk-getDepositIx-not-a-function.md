# #425 — Drift SDK `getDepositIx` 메서드 호환성 에러 — client.getDepositIx is not a function

- **유형**: BUG
- **심각도**: HIGH
- **영향 시나리오**: defi-10 (Drift add_margin)
- **컴포넌트**: `packages/actions/src/providers/drift/drift-sdk-wrapper.ts`

## 현상

유료 Solana RPC(Helius) 설정 후 Drift `drift_add_margin` 호출 시 RPC 연결은 성공하지만, SDK 메서드 호출에서 에러 발생:

```
ACTION_RESOLVE_FAILED: client.getDepositIx is not a function
```

## 원인

`drift-sdk-wrapper.ts` 531행에서 `client.getDepositIx()` 를 호출하지만, 현재 설치된 `@drift-labs/sdk` 버전에서 해당 메서드가 제거되었거나 이름이 변경된 것으로 추정.

```typescript
// drift-sdk-wrapper.ts:531
const ix = await client.getDepositIx(amount, 0, new sdk.PublicKey(params.walletAddress));
```

## 수정 방향

1. 현재 설치된 `@drift-labs/sdk` 버전 확인
2. SDK changelog에서 `getDepositIx` 대체 메서드 확인 (예: `createDepositInstruction`, `deposit`, `getDepositCollateralIx` 등)
3. `DriftSdkWrapper`의 deposit/withdraw/openPosition/closePosition 메서드 전체를 현재 SDK 버전에 맞게 업데이트
4. 관련 UAT 시나리오(defi-10) 재검증

## 테스트 항목

- [ ] `@drift-labs/sdk` 현재 버전에서 deposit 관련 메서드명 확인
- [ ] `drift_add_margin` dryRun 정상 완료
- [ ] `drift_open_position` (LIMIT order) 정상 완료
- [ ] `drift_withdraw_margin` dryRun 정상 완료
- [ ] defi-10 UAT 시나리오 전체 PASS
