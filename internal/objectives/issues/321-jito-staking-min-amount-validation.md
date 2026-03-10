# #321 — Jito Staking 최소 금액 검증 누락 — InstructionError Custom(1)

- **Type:** BUG
- **Severity:** MEDIUM
- **Status:** OPEN
- **Component:** `packages/actions/src/providers/jito-staking/`

## 증상

소액(0.005 SOL) Jito 스테이킹 시 트랜잭션이 온체인에서 실패:

```json
{"InstructionError":["0",{"Custom":"1"}]}
```

## 재현 절차

```bash
curl -s -X POST http://localhost:3100/v1/actions/jito_staking/stake \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<SOLANA_WALLET_ID>",
    "params": { "amount": "0.005" },
    "network": "solana-mainnet"
  }'
```

## 원인

SPL Stake Pool 프로그램의 `Custom(1)` 에러는 **최소 deposit 금액 미달**을 의미. Jito Stake Pool은 최소 ~0.05 SOL(50,000,000 lamports) 이상의 deposit을 요구하나, WAIaaS의 Jito action provider에 최소 금액 검증이 없어 소액 트랜잭션이 온체인까지 진행 후 실패함.

## 관련 코드

- `packages/actions/src/providers/jito-staking/index.ts` (line 31-33): 입력 검증에 최소 금액 체크 없음
- `packages/actions/src/providers/jito-staking/jito-stake-pool.ts` (line 309-323): `parseSolAmount()`에 최소값 검증 없음
- `packages/actions/src/providers/jito-staking/config.ts`: 최소 금액 상수 미정의

## 수정 방향

1. `config.ts`에 `JITO_MIN_DEPOSIT_SOL = 0.05` 상수 추가
2. 입력 Zod 스키마에 `.refine()` 또는 resolve 함수 초반에 최소 금액 검증 추가
3. 최소 금액 미달 시 명확한 에러 메시지 반환 (예: `"Minimum deposit is 0.05 SOL"`)
4. 온체인 실패 전에 클라이언트 측에서 차단하여 가스비 낭비 방지

## 테스트 항목

- [ ] 0.005 SOL deposit 시 명확한 최소 금액 에러 반환 (온체인 실패 아님)
- [ ] 0.05 SOL 이상 deposit 시 정상 동작
- [ ] 에러 메시지에 최소 금액 명시
- [ ] 최소 금액 검증이 resolve 단계에서 수행됨 (트랜잭션 생성 전)
