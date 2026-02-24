# #172 EVM IncomingTxMonitor getBlock(includeTransactions:true)가 L2 체인에서 타임아웃

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.3
- **상태:** FIXED

---

## 증상

Arbitrum mainnet에서 `EVM poll failed` 에러 반복 발생:

1. **408 Request Timeout** — dRPC "Request timeout on the free tier, please upgrade" (code 30)
2. **JSON 잘림** — "Unterminated string in JSON at position 45951" — 응답 ~45KB에서 절단

모든 에러가 `arbitrum.drpc.org`의 `eth_getBlockByNumber(includeTransactions:true)` 호출에서 발생.

---

## 근본 원인

`EvmIncomingSubscriber.pollNativeETH()`가 `getBlock({ includeTransactions: true })`로 블록 전체 트랜잭션을 가져와 `tx.to` 매칭으로 네이티브 수신을 감지한다. Arbitrum 등 L2는 블록당 500-2000+ TX로 응답이 200KB-1MB에 달해 무료 RPC의 응답 크기/시간 제한을 초과한다.

10블록 범위 × Arbitrum 블록 = 2MB~10MB 응답 데이터 → 타임아웃 불가피.

**#169와의 차이:** #169는 호출 빈도(rate limit) 문제. 본 이슈는 **단일 호출의 응답 크기**가 한계 초과하는 문제로, 백오프만으로는 해결 불가.

---

## 해결 방안 (권장: 체인별 폴링 전략 분기)

L2 체인은 `pollNativeETH` 건너뛰고 ERC-20 감지(`getLogs`)만 실행:

```typescript
const L2_CHAINS = ['arbitrum', 'optimism', 'base'];
if (L2_CHAINS.some(c => network.includes(c))) {
  await this.pollERC20(walletId, address, fromBlock, toBlock); // 경량
} else {
  await this.pollERC20(walletId, address, fromBlock, toBlock);
  await this.pollNativeETH(walletId, address, fromBlock, toBlock); // L1만
}
```

**수정 파일:** `packages/adapters/evm/src/evm-incoming-subscriber.ts`

---

## 재발 방지

새 EVM 체인 추가 시 블록당 TX 수/응답 크기 사전 평가. L2에서 `getBlock(includeTransactions:true)` 사용 금지.

---

## 테스트 항목

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | Arbitrum에서 pollNativeETH 스킵 | network='arbitrum-mainnet' → pollNativeETH 미호출 assert | [L0] |
| 2 | Ethereum L1에서 pollNativeETH 유지 | network='ethereum-mainnet' → pollNativeETH 호출 assert | [L0] |
| 3 | Optimism/Base도 L2 분기 적용 | pollNativeETH 스킵 assert | [L0] |

---

*발견일: 2026-02-24*
*관련: #169 (rate limit), EvmIncomingSubscriber.pollNativeETH()*
