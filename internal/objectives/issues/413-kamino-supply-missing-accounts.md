# #413 — Kamino Supply 시 "Missing accounts for Solana contract call" 에러

- **유형**: BUG
- **심각도**: HIGH
- **영향 시나리오**: defi-08
- **컴포넌트**: `packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts`
- **선행 이슈**: #406 (programId.toBuffer — FIXED, 불완전)

## 현상

`POST /v1/actions/kamino/kamino_supply?dryRun=true` 호출 시 `Missing accounts for Solana contract call` 에러 발생. #406(programId.toBuffer) 수정 후 새로 발생한 에러.

## 원인

`SolanaAdapter.buildContractCall()`(adapter.ts:686-689)에서 `request.accounts`가 비어있거나 undefined일 때 발생:

```typescript
if (!request.accounts || request.accounts.length === 0) {
  throw new ChainError('INVALID_INSTRUCTION', 'solana', {
    message: 'Missing accounts for Solana contract call',
  });
}
```

근본 원인은 `KaminoSdkWrapper.convertInstructions()`(line 323-333)에서:
1. Kamino SDK `buildDepositTxns()`가 반환하는 instruction의 `keys` 배열이 비어있거나 null
2. `allIxs.filter()` 결과가 빈 배열 → 빈 ContractCallRequest[] 생성
3. `ix.keys`에 대한 null/empty 검증 없음

## 수정 방향

1. `convertInstructions()`에 `ix.keys` 유효성 검증 추가
2. `buildSupplyInstruction()` 결과가 비어있을 때 명확한 에러 메시지 반환
3. Kamino SDK 실제 응답 구조를 디버그 로깅으로 확인 (SDK가 특정 조건에서 빈 instruction 반환하는지)

## 테스트 항목

- [ ] Kamino supply dryRun 호출 시 정상 시뮬레이션 성공
- [ ] `convertInstructions()`가 빈 keys를 가진 instruction을 적절히 처리
- [ ] SDK가 빈 instruction 반환 시 명확한 에러 메시지 출력
