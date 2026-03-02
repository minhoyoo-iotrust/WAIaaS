# #221 SignRequestSchema chain 열거값 불일치 — `'evm'` vs `'ethereum'`

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v29.9
- **상태:** FIXED
- **발견일:** 2026-03-02
- **수정일:** 2026-03-02
- **컴포넌트:** `@waiaas/core` (signing-protocol), `@waiaas/daemon` (signing-sdk)

## 증상

EVM 지갑에서 APPROVAL 정책 트리거 시 Unhandled rejection으로 데몬이 종료됨:

```
ZodError: Invalid enum value. Expected 'solana' | 'evm', received 'ethereum'
  at SignRequestBuilder.buildRequest (sign-request-builder.js:88)
  at NtfySigningChannel.sendRequest (ntfy-signing-channel.js:46)
  at ApprovalChannelRouter.route (approval-channel-router.js:80)
  at stage4Wait (stages.js:615)
```

## 원인

`SignRequestSchema.chain`이 `z.enum(['solana', 'evm'])`으로 하드코딩되어 있으나, 프로젝트 SSoT인 `ChainTypeEnum`은 `['solana', 'ethereum']`을 사용.

- SSoT (`packages/core/src/enums/chain.ts`): `CHAIN_TYPES = ['solana', 'ethereum']`
- 버그 (`packages/core/src/schemas/signing-protocol.ts:78`): `chain: z.enum(['solana', 'evm'])`

파이프라인 `stages.ts:796`에서 `ctx.wallet.chain`(DB 값 = `'ethereum'`)을 `as 'solana' | 'evm'`으로 캐스팅하지만, 실제 값은 `'ethereum'`이므로 Zod 파싱에서 실패.

## 영향 범위

1. **`packages/core/src/schemas/signing-protocol.ts:78`** — `SignRequestSchema.chain` 하드코딩
2. **`packages/daemon/src/services/signing-sdk/sign-request-builder.ts:31`** — `BuildRequestParams.chain` 타입 하드코딩
3. **`packages/daemon/src/services/signing-sdk/sign-response-handler.ts:281,343`** — `request.chain === 'evm'` 비교
4. **`packages/daemon/src/pipeline/stages.ts:796`** — `as 'solana' | 'evm'` 타입 캐스팅

## 수정 방안

1. `signing-protocol.ts:78`: `z.enum(['solana', 'evm'])` → `ChainTypeEnum` 사용 (SSoT 준수)
2. `sign-request-builder.ts:31`: `chain: 'solana' | 'evm'` → `chain: ChainType` 변경
3. `sign-response-handler.ts:281,343`: `request.chain === 'evm'` → `request.chain === 'ethereum'` 변경
4. `stages.ts:796`: `as 'solana' | 'evm'` 타입 캐스팅 제거

## 재현 조건

- EVM 지갑에 APPROVAL 정책이 설정된 상태
- 해당 지갑으로 트랜잭션 전송 시 stage4Wait에서 SDK signing channel 라우팅 발생
- `ctx.wallet.chain` = `'ethereum'`이 Zod 파싱에 전달되어 실패

## 테스트 항목

1. `sign-request-builder.test.ts`: EVM 지갑(`chain: 'ethereum'`)으로 `buildRequest()` 호출 시 정상 SignRequest 생성 확인
2. `sign-response-handler.test.ts`: `chain: 'ethereum'` SignRequest에 대한 EVM 서명 검증 분기 정상 동작 확인
3. `signing-protocol.test.ts`: `SignRequestSchema.parse()`가 `chain: 'ethereum'` 허용, `chain: 'evm'` 거부 확인
4. E2E: EVM 지갑 APPROVAL 정책 트랜잭션에서 데몬 크래시 없이 정상 라우팅 확인
