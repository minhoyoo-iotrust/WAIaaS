# 359 — IncomingTxMonitor 시작 시 중복 getBlockNumber 호출로 429 Rate Limit 발생

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-16

## 현상

데몬 시작 시 IncomingTxMonitor가 optimism-mainnet 등에서 429 Too Many Requests 에러 발생. dRPC 무료 티어 rate limit에 걸림.

```
IncomingTxMonitor: failed to subscribe wallet 019c88f6-... on optimism-mainnet: HttpRequestError: HTTP request failed.
Status: 429
URL: https://optimism.drpc.org/
Request body: {"method":"eth_blockNumber"}
```

## 원인

`EvmIncomingSubscriber.subscribe()`가 지갑 추가 시마다 `getBlockNumber()`를 호출함. 같은 네트워크에 8개 지갑이 있으면 동일 엔드포인트에 8번 호출.

- 8 지갑 × 6 EVM 네트워크 = 48개 RPC 호출이 ~2초 안에 발사
- RPC Pool이 항상 첫 번째 엔드포인트를 반환 (round-robin 아님)
- 같은 네트워크의 요청이 모두 동일 URL로 집중

## 수정 방안

`EvmIncomingSubscriber`에서 네트워크당 최초 구독 시에만 `getBlockNumber()`를 호출하고, 이후 같은 네트워크에 지갑 추가 시에는 이미 조회한 블록 번호를 재사용. 48회 → 6회로 감소.

## 대상 파일

- `packages/adapters/evm/src/evm-incoming-subscriber.ts` — subscribe() 내 getBlockNumber() 중복 제거

## 테스트 항목

- 같은 네트워크에 복수 지갑 구독 시 getBlockNumber()가 1회만 호출되는지 확인
- 첫 번째 지갑 구독 후 두 번째 지갑이 동일 블록 번호로 구독되는지 확인
- 다른 네트워크 구독 시에는 별도로 getBlockNumber()가 호출되는지 확인
