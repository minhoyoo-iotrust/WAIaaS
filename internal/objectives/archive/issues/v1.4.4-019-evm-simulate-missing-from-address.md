# 019: EVM simulateTransaction에서 from 주소 누락 — ERC-20 전송 시뮬레이션 실패

## 심각도

**HIGH** — EVM에서 TOKEN_TRANSFER, CONTRACT_CALL, APPROVE 타입 트랜잭션이 시뮬레이션 단계에서 실패하여 전송 불가.

## 증상

- EVM ERC-20 TOKEN_TRANSFER 전송 시 FAILED 상태로 종료
- 에러: `ERC20: transfer from the zero address`
- TRANSFER(네이티브 ETH)는 정상 동작

## 재현

```
POST /v1/transactions/send (sessionAuth, EVM 월렛)
{
  "type": "TOKEN_TRANSFER",
  "to": "0x...",
  "amount": "1000000000000000000",
  "token": { "address": "0x779877a7b0d9e8603169ddbd7836e478b4624789", "decimals": 18, "symbol": "LINK" }
}

→ 트랜잭션 ID: 019c57df-ba9c-7490-abab-c6e56a91386a
→ status: FAILED
→ error: "ERC20: transfer from the zero address"
```

## 원인

`EvmAdapter.simulateTransaction()`이 `eth_call`의 `account` 파라미터를 `tx.metadata.from`에서 가져오지만, 모든 `build*` 메서드가 metadata에 `from` 필드를 포함하지 않음.

### simulateTransaction (adapter.ts:322-327)

```typescript
await client.call({
  to: parsed.to!,
  value: parsed.value,
  data: parsed.data,
  account: tx.metadata.from as `0x${string}` | undefined,  // undefined!
});
```

### buildTokenTransfer metadata (adapter.ts:546-556)

```typescript
metadata: {
  nonce,
  chainId,
  maxFeePerGas,
  maxPriorityFeePerGas,
  gasLimit,
  type: 'eip1559',
  tokenAddress: request.token.address,
  recipient: request.to,
  tokenAmount: request.amount,
  // from 필드 없음!
},
```

### 영향 범위

`from` 누락은 모든 `build*` 메서드에 해당:

| 메서드 | metadata에 from | 시뮬레이션 영향 |
|--------|----------------|---------------|
| buildTransaction (TRANSFER) | **없음** | ETH 전송은 account 없이도 통과 가능 |
| buildTokenTransfer (TOKEN_TRANSFER) | **없음** | msg.sender=0x0 → `transfer from zero address` revert |
| buildContractCall (CONTRACT_CALL) | **없음** | msg.sender=0x0 → 컨트랙트 권한 체크 실패 가능 |
| buildApprove (APPROVE) | **없음** | msg.sender=0x0 → `approve from zero address` revert |

### TRANSFER가 성공하는 이유

네이티브 ETH 전송의 `eth_call`은 `account`가 없어도 단순 값 전송이므로 revert 되지 않음. 반면 ERC-20 `transfer()`는 `msg.sender`의 잔액을 차감하므로 zero address에서는 반드시 실패.

## 수정안

모든 `build*` 메서드의 반환 metadata에 `from` 필드를 추가한다.

```typescript
// buildTransaction, buildTokenTransfer, buildContractCall, buildApprove
metadata: {
  from: request.from,  // ← 추가
  nonce,
  chainId,
  // ...
},
```

## 재발 방지 테스트

현재 `simulateTransaction` 테스트가 `metadata.from` 없이 더미 데이터로만 검증하고 있어 이 버그를 잡지 못했다. 다음 테스트를 추가한다:

### T-1: build → simulate 연쇄 테스트

각 `build*` 메서드의 반환값을 `simulateTransaction`에 그대로 전달하여, `eth_call`의 `account` 파라미터가 올바르게 설정되는지 검증.

```
buildTokenTransfer({ from: '0xABC...' }) → tx
simulateTransaction(tx) → eth_call({ account: '0xABC...' }) 확인
```

### T-2: metadata.from 존재 검증

모든 `build*` 메서드 반환값의 `metadata.from`이 `request.from`과 일치하는지 assert.

```
buildTransaction({ from }) → expect(result.metadata.from).toBe(from)
buildTokenTransfer({ from }) → expect(result.metadata.from).toBe(from)
buildContractCall({ from }) → expect(result.metadata.from).toBe(from)
buildApprove({ from }) → expect(result.metadata.from).toBe(from)
```

### T-3: simulateTransaction account=undefined 시 경고/실패

`simulateTransaction`이 `metadata.from`이 없는 UnsignedTransaction을 받았을 때, `account`가 zero address가 되지 않도록 방어. 명시적으로 에러를 발생시키거나 경고를 남기는 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | `packages/adapters/evm/src/adapter.ts` — 4개 build 메서드 metadata에 `from` 추가 |
| 테스트 파일 | `packages/adapters/evm/src/__tests__/evm-adapter.test.ts` — T-1~T-3 추가 |
| 영향 기능 | EVM TOKEN_TRANSFER, CONTRACT_CALL, APPROVE 시뮬레이션 정상화 |
| Solana | 영향 없음 — SolanaAdapter는 별도 시뮬레이션 로직 사용 |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.4*
*상태: FIXED*
*유형: BUG*
*관련: `packages/adapters/evm/src/adapter.ts` simulateTransaction, buildTokenTransfer, buildContractCall, buildApprove*
