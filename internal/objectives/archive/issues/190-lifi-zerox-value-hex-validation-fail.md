# 190 — LI.FI + 0x resolve() value 필드 hex→decimal 변환 누락으로 스왑/브릿지 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.7

## 현상

메인넷에서 LI.FI 크로스체인 스왑 실행 시 `ACTION_RETURN_INVALID` 에러 발생. LI.FI API 호출 자체는 성공하지만, 응답을 `ContractCallRequest`로 변환하는 과정에서 Zod 스키마 검증 실패.

## 원인

`ContractCallRequestSchema`의 `value` 필드는 `z.string().regex(/^\d+$/)` — 순수 숫자 문자열만 허용.

```typescript
// packages/core/src/schemas/transaction.schema.ts:128
value: z.string().regex(numericStringPattern).optional(), // native token value
```

외부 API가 `transactionRequest.value`를 `"0x..."` hex 형식으로 반환하면 검증 실패.

### 영향받는 프로바이더

**1. LI.FI (CRITICAL)**

```typescript
// packages/actions/src/providers/lifi/index.ts:126-131
const request: ContractCallRequest = {
  type: 'CONTRACT_CALL',
  to: quote.transactionRequest.to,
  calldata: quote.transactionRequest.data,
  value: quote.transactionRequest.value,  // ← hex 그대로 전달
};
```

LI.FI 응답 스키마 주석에도 `// native value (hex or decimal)` 명시.

**2. 0x ZeroEx (CRITICAL)**

```typescript
// packages/actions/src/providers/zerox-swap/index.ts:154-159
const swapRequest: ContractCallRequest = {
  type: 'CONTRACT_CALL',
  to: quote.transaction.to,
  calldata: quote.transaction.data,
  value: quote.transaction.value,  // ← hex 그대로 전달
};
```

0x API v2 응답도 hex value를 반환할 수 있음.

### 영향받지 않는 프로바이더

| 프로바이더 | 이유 |
|-----------|------|
| Jupiter | Solana 기반 — value 필드 미사용 (programId/instructionData 사용) |
| Lido | `amountWei.toString()` — BigInt에서 명시적 decimal 변환 |
| Jito | `amountLamports.toString()` — BigInt에서 명시적 decimal 변환 |

## 수정 방안

각 프로바이더의 `resolve()`에서 `value` 값을 decimal 문자열로 변환 후 전달:

```typescript
value: quote.transactionRequest.value
  ? BigInt(quote.transactionRequest.value).toString()
  : undefined,
```

`BigInt()`는 `"0x..."` hex와 `"123"` decimal 모두 처리 가능.

## 영향 범위

- `packages/actions/src/providers/lifi/index.ts` — resolve() value 변환
- `packages/actions/src/providers/zerox-swap/index.ts` — resolve() value 변환
- LI.FI cross_swap, bridge / 0x swap 액션 모두 영향

## 테스트 항목

- [ ] LI.FI resolve()에서 hex value(`"0x0"`, `"0x38d7ea4c68000"`) 반환 시 decimal 변환 확인
- [ ] 0x resolve()에서 hex value 반환 시 decimal 변환 확인
- [ ] decimal value(`"0"`, `"1000000000000000"`) 반환 시 그대로 통과 확인
- [ ] value 미반환(undefined) 시 undefined 유지 확인
- [ ] 변환 후 ContractCallRequestSchema 검증 통과 확인
