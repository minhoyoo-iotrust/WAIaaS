# Issue #298: E2E 온체인 사전 조건 잔액 체크에 network 파라미터 누락

- **유형:** BUG
- **심각도:** HIGH
- **발견 경로:** E2E onchain precondition checker 실행
- **관련 파일:**
  - `packages/e2e-tests/src/helpers/precondition-checker.ts:202`

## 증상

`run-onchain.ts` 사전 조건 체크 시 EVM 네트워크(ethereum-sepolia, ethereum-holesky) 잔액 조회가 HTTP 400으로 실패:

```
[FAIL] balance-ethereum-sepolia
       Required: 10000000000000000
       Actual:   unknown
       Failed to get balance: HTTP 400
```

Solana는 단일 네트워크 지갑이라 우연히 통과하지만, 멀티 네트워크 지갑에서는 동일 문제 발생 가능.

## 원인

v29.3에서 기본 네트워크 개념이 제거된 이후, `GET /v1/wallet/balance` 호출 시 `network` 쿼리 파라미터가 필수 (`NETWORK_REQUIRED` 에러 반환).

`PreconditionChecker.checkBalance()`가 `network` 인자를 받고 있지만 API 호출에 전달하지 않음:
```typescript
// line 202 — network 파라미터 누락
const { status, body } = await sessionClient.get<{...}>('/v1/wallet/balance');
```

영향 범위 확인 결과, `/v1/wallet/balance`를 network 없이 호출하는 곳은 이 **한 곳만** 해당.

## 수정 방안

```typescript
const { status, body } = await sessionClient.get<{...}>(
  `/v1/wallet/balance?network=${encodeURIComponent(network)}`
);
```

## 테스트 항목

- [ ] `WAIAAS_E2E_MASTER_PASSWORD=<pw> npx tsx src/run-onchain.ts` 실행 시 balance-ethereum-sepolia, balance-ethereum-holesky 체크 PASS 확인
- [ ] Solana 잔액 체크도 network 파라미터 추가 후 정상 동작 확인
