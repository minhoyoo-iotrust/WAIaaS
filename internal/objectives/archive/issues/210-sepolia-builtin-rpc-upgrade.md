# 210 — Sepolia 빌트인 RPC 엔드포인트 확장 및 교체

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **마일스톤:** v29.4
- **상태:** FIXED

## 증상

데몬 장시간 운영 시 EVM IncomingTxMonitor가 Sepolia 네트워크에서 반복 실패:

1. **drpc.org 408 타임아웃**: 무료 티어 요청 제한 도달 → `eth_getBlockByNumber` 실패
2. **publicnode.com 주소 수 초과**: `eth_getLogs` 호출 시 address 배열 10개를 거부 ("specify less number of addresses")

두 엔드포인트 모두 실패하면 Sepolia 수신 모니터링이 완전 중단됨.

## 원인

`packages/core/src/rpc/built-in-defaults.ts`의 `ethereum-sepolia` 빌트인 기본값이 2개뿐이고, 둘 다 무료 티어 제한이 엄격한 프로바이더:

```typescript
'ethereum-sepolia': [
  'https://sepolia.drpc.org',           // 408 timeout (free tier)
  'https://ethereum-sepolia-rpc.publicnode.com',  // address count limit
],
```

RPC Pool 로테이션(v28.6)이 있지만 풀 자체에 후보가 2개뿐이라 모두 cooldown에 들어가면 복구 불가.

## 수정 방안

[chainlist.org](https://chainlist.org) 기준 Score + Privacy 평가를 반영하여 빌트인 기본값을 5개로 확장:

| 우선순위 | URL | Latency | Score | Privacy |
|---------|-----|---------|-------|---------|
| 1 | `https://1rpc.io/sepolia` | 0.079s | ✅ | ✅ |
| 2 | `https://0xrpc.io/sep` | 0.294s | ✅ | ✅ |
| 3 | `https://ethereum-sepolia-rpc.publicnode.com` | 0.378s | ✅ | ✅ |
| 4 | `https://sepolia.drpc.org` | 0.345s | ✅ | - |
| 5 | `https://eth-sepolia-testnet.api.pocket.network` | 0.554s | ✅ | ✅ |

- 기존 2개 유지 (순위 하향)
- 신규 3개 추가 (1rpc.io, 0xrpc.io, pocket.network)
- Privacy 녹색 우선, Latency 낮은 순 정렬

## 영향 범위

- `packages/core/src/rpc/built-in-defaults.ts` — `ethereum-sepolia` 배열 교체
- Admin UI RPC Status에 자동 반영 (빌트인 URL은 API 기반 조회, #197 FIXED)

## 테스트 항목

1. **빌트인 기본값 검증**: `BUILT_IN_RPC_DEFAULTS['ethereum-sepolia']` 배열이 5개 URL 포함 확인
2. **우선순위 순서 검증**: 인덱스 0이 `1rpc.io`, 마지막이 `pocket.network`인지 확인
3. **RPC Pool 통합 검증**: RpcPool에 5개 엔드포인트가 로드되고 failover 동작 확인
4. **Admin UI 표시 검증**: `/v1/admin/rpc-status`에서 Sepolia 빌트인 5개 표시 확인
