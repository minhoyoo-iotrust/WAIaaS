# Issue #164: 인커밍 모니터링이 환경 기본 네트워크만 구독

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **발견 버전:** v28.2
- **상태:** OPEN

## 현상

`IncomingTxMonitorService.start()`와 `syncSubscriptions()`가 지갑의 `environment` 값을 네트워크 파라미터로 직접 전달하여, 각 지갑당 하나의 네트워크만 모니터링한다.

예: ethereum:testnet 지갑 → base-sepolia만 구독. ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia는 무시됨.

## 원인

```typescript
// incoming-tx-monitor-service.ts start() line ~155
await this.multiplexer.addWallet(
  wallet.chain,
  wallet.environment,  // ← "testnet"을 네트워크로 사용
  wallet.id,
  wallet.public_key,
);
```

`getNetworksForEnvironment(chain, environment)`를 호출하지 않고 environment를 그대로 전달.

## 기대 동작

지갑이 지원하는 **모든 네트워크**에 대해 구독해야 한다:
- `solana:testnet` → devnet, testnet (2개)
- `solana:mainnet` → mainnet (1개)
- `ethereum:testnet` → ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia, base-sepolia (5개)
- `ethereum:mainnet` → ethereum-mainnet, polygon-mainnet, arbitrum-mainnet, optimism-mainnet, base-mainnet (5개)

## 수정 방안

`start()`와 `syncSubscriptions()`에서 `getNetworksForEnvironment()`를 호출하여 전체 네트워크에 대해 `addWallet()` 루프:

```typescript
import { getNetworksForEnvironment } from '@waiaas/core';

for (const wallet of wallets) {
  const networks = getNetworksForEnvironment(wallet.chain, wallet.environment);
  for (const network of networks) {
    await this.multiplexer.addWallet(wallet.chain, network, wallet.id, wallet.public_key);
  }
}
```

하위 인프라(SubscriptionMultiplexer, DB 스키마, 커서, Workers, Subscribers)는 이미 멀티 네트워크를 지원하므로 추가 변경 불필요.

## 영향 분석

- 커넥션 수 증가: ethereum 지갑 기존 1개 → 최대 5개 네트워크 커넥션 (동일 네트워크는 지갑 간 공유)
- RPC 부하: 폴링 주기(기본 30초)당 네트워크 수만큼 호출 증가
- DB 스키마 변경 없음

## 수정 대상 파일

- `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts`

## 테스트 항목

- [ ] ethereum:testnet 지갑이 5개 네트워크 모두 구독되는지 확인
- [ ] solana:testnet 지갑이 devnet + testnet 2개 구독되는지 확인
- [ ] syncSubscriptions() 호출 시 신규 네트워크가 추가되는지 확인
- [ ] 기존 단일 네트워크 테스트가 깨지지 않는지 확인
