# 429 — IncomingTxMonitor 구독 시 RPC Rate Limit 에러

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** OPEN
- **발견일:** 2026-03-23

## 현상

데몬 시작 시 IncomingTxMonitorService가 모든 지갑×네트워크 조합을 **지연 없이 연속으로** 구독한다.
같은 네트워크(예: `optimism-mainnet`)에 여러 지갑이 있으면 `eth_blockNumber` RPC 호출이 동시에 몰려 429 Too Many Requests 에러가 발생한다.

```
IncomingTxMonitor: failed to subscribe wallet 019c88f6-... on optimism-mainnet: RpcRequestError: RPC Request failed.
URL: https://optimism.drpc.org
Details: Too many request, try again later
```

## 원인

`IncomingTxMonitorService.start()` (incoming-tx-monitor-service.ts:176-205)에서 지갑×네트워크 루프를 돌며 `multiplexer.addWallet()`을 연속 호출한다.

- 같은 네트워크의 여러 지갑이 동시에 `eth_blockNumber`를 호출
- 네트워크별 스태거링/딜레이 없음
- RPC Pool은 polling 단계에서만 사용되고, 초기 구독 단계에서는 미사용

## 수정 방안

1. **네트워크별 구독 스태거링**: 같은 네트워크에 대한 구독 사이에 딜레이(예: 200-500ms) 추가
2. **배치 구독**: 동일 네트워크의 지갑을 그룹핑하여 blockNumber를 한 번만 조회
3. **구독 단계에서도 RPC Pool 활용**: 여러 엔드포인트로 분산

## 영향 범위

- `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts`
- `packages/daemon/src/services/incoming/subscription-multiplexer.ts`
- `packages/adapters/evm/src/evm-incoming-subscriber.ts`

## 테스트 항목

- [ ] 동일 네트워크에 N개 지갑 구독 시 RPC 호출 간 최소 딜레이 존재 확인
- [ ] 구독 실패 시 개별 지갑만 실패하고 나머지는 정상 구독되는지 확인 (현재도 동작)
- [ ] 스태거링 적용 후 대량 지갑(10+) 시나리오에서 429 미발생 확인
