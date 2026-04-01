# 431 — 데몬 시작 시 서비스 간 RPC 경합으로 429 Rate Limit 발생

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** OPEN
- **발견일:** 2026-03-23

## 현상

데몬 시작 시 여러 서비스가 동시에 RPC를 호출하여 무료/저가 엔드포인트의 rate limit을 초과한다.

```
[daemon] IncomingTxMonitor: failed to subscribe wallet ... on optimism-mainnet: HTTP request failed. (429)
Server responded with 429 Too Many Requests.  Retrying after 500ms delay...
[actions] DriftSdkWrapper.getClient: subscribe attempt 1/3 failed {"error":"429 Too Many Requests"}
```

## 원인

데몬 시작 시 다음 서비스들이 거의 동시에 RPC 호출:
1. **IncomingTxMonitor** — 8 지갑 × N 네트워크 구독 (`eth_blockNumber` 호출)
2. **PositionTracker** — `syncCategory('LENDING'|'STAKING'|'YIELD'|'PERP')` 즉시 fire-and-forget 실행 (daemon-startup.ts:1270-1275)
3. **PositionTracker PERP** → DriftPerpProvider.getPositions() → DriftSdkWrapper.getClient() → Solana RPC `Connection.subscribe()`

`syncCategory('PERP')`가 시작 직후 실행되면서 Drift SDK가 Solana RPC에 즉시 연결을 시도하고, IncomingTxMonitor의 Solana 구독과 경합하여 Helius 유료 RPC마저 rate limit → RPC Pool이 빌트인 기본값(`api.mainnet-beta.solana.com`)으로 폴백 → 거기서도 429.

Optimism도 동일: IncomingTxMonitor 구독과 다른 EVM 호출이 동시에 발생하여 `optimism.drpc.org` rate limit 초과.

### #429와의 관계

#429는 IncomingTxMonitor **내부** 스태거링을 추가하여 해결했으나, **서비스 간(cross-service)** 경합은 해결하지 않았다.

## 수정 방안

1. **PositionTracker 초기 sync 지연**: 시작 후 5초 대기 → 카테고리별 2초 간격으로 스태거링
   - `daemon-startup.ts:1270-1275` 수정
   - IncomingTxMonitor 구독이 완료된 후에 position sync 시작

2. **@solana/web3.js 429 로그 억제 검토**: `@solana/web3.js` Connection이 `console.error`로 직접 출력하는 retry 메시지(`Server responded with 429...`)는 WAIaaS에서 제어 불가. custom fetch 어댑터로 retry 로직을 오버라이드하거나, `@solana/kit` (v6) 마이그레이션으로 해결 가능한지 조사 필요.

## 영향 범위

- `packages/daemon/src/lifecycle/daemon-startup.ts` (Step 4f-6 position sync)
- `packages/actions/src/providers/drift/drift-sdk-wrapper.ts` (lazy init이지만 시작 직후 호출됨)

## 테스트 항목

- [ ] 데몬 시작 시 IncomingTxMonitor 구독 완료 후 PositionTracker sync가 시작되는지 확인
- [ ] 시작 시 429 에러 미발생 또는 현저히 감소 확인
- [ ] position sync 지연이 기능에 영향 없음 확인 (5초 후 정상 동기화)
