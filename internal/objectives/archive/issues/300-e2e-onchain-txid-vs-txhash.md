# Issue #300: E2E 온체인 전송 테스트 txId 필드명 불일치 — 실제 API는 txHash 반환

- **유형:** BUG
- **심각도:** HIGH
- **발견 경로:** E2E onchain smoke test 실행

## 증상

ETH/SOL 네이티브 전송 테스트가 트랜잭션 CONFIRMED 후 `result.txId` 검증에서 실패:

```
AssertionError: expected undefined to be truthy
```

## 원인

`GET /v1/transactions/:id` 응답의 트랜잭션 해시 필드명은 `txHash`이지만, E2E 테스트 코드가 `txId`로 참조:

```typescript
// pollTxStatus 반환 타입 (onchain-transfer.e2e.test.ts:51)
Promise<{ status: string; txId?: string }>

// 실제 API 응답
{ "status": "CONFIRMED", "txHash": "0x4fbb..." }
```

## 관련 파일

- `packages/e2e-tests/src/__tests__/onchain-transfer.e2e.test.ts:51-55` — pollTxStatus 타입 및 반환
- `packages/e2e-tests/src/__tests__/onchain-transfer.e2e.test.ts:123,149` — txId assertion

## 수정 방안

`pollTxStatus` 함수와 assertion에서 `txId`를 `txHash`로 변경:

```typescript
async function pollTxStatus(...): Promise<{ status: string; txHash?: string }> {
  const { status, body } = await http.get<{ id: string; status: string; txHash?: string }>(...);
  ...
}

expect(result.txHash).toBeTruthy();
expect(result.txHash!.startsWith('0x')).toBe(true);
```

## 테스트 항목

- [ ] ETH self-transfer (Sepolia) 테스트에서 txHash 검증 통과
- [ ] SOL self-transfer (Devnet) 테스트에서 txHash 검증 통과
