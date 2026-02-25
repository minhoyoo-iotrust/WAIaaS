# #193 네트워크별 WSS URL 설정 + EVM WSS 구독 지원

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** OPEN
- **관련:** #164 (인커밍 모니터링 전체 네트워크 지원)

## 현상

현재 인커밍 트랜잭션 모니터링의 WebSocket 설정에 두 가지 제약이 있다:

1. **단일 WSS URL**: `incoming.wss_url` 하나로 모든 네트워크가 공유. 네트워크별 WSS 엔드포인트를 구분할 수 없음.
2. **Solana 전용**: `EvmIncomingSubscriber`는 WSS transport를 사용하지 않음. EVM 노드도 `eth_subscribe` (newHeads, logs)를 통한 WSS 실시간 구독을 지원하지만 활용하지 못하고 있음.

### 현재 동작 (`daemon.ts` subscriber factory)

```ts
// Solana: wss_url 사용 또는 https→wss 자동 변환
const wssUrl = settingsGet('incoming.wss_url') || rpcUrl.replace(/^https:\/\//, 'wss://');
return new SolanaIncomingSubscriber({ rpcUrl, wsUrl: wssUrl });

// EVM: WSS 미사용, HTTP RPC만 사용
return new EvmIncomingSubscriber({ rpcUrl });
```

## 개선 방안

### 1. 네트워크별 WSS URL 설정 키

기존 `incoming.wss_url` (글로벌) 대신 네트워크별 설정 키 도입:

```
incoming.wss_url.mainnet          # Solana mainnet
incoming.wss_url.devnet           # Solana devnet
incoming.wss_url.ethereum-mainnet # Ethereum mainnet
incoming.wss_url.polygon-amoy     # Polygon Amoy testnet
...
```

- 기존 `incoming.wss_url`은 하위 호환을 위해 글로벌 폴백으로 유지
- 우선순위: 네트워크별 WSS URL → 글로벌 WSS URL → RPC URL 자동 변환

### 2. EVM WSS 구독 지원

`EvmIncomingSubscriber`에 viem `webSocket` transport 지원 추가:

- WSS URL이 설정되면 `eth_subscribe('newHeads')` + `eth_subscribe('logs')` 사용
- WSS URL이 없으면 기존 HTTP 폴링 유지 (하위 호환)
- 연결 끊김 시 자동 재연결 + 폴링 폴백

### 3. Admin UI: RPC Endpoints 탭에 WSS 필드 추가

`wallets.tsx`의 RPC Endpoints 탭 → 각 네트워크 섹션(collapsible `<details>`)에 WSS URL 입력 필드 추가:

- 위치: 각 네트워크의 RPC URL 리스트 하단
- 필드: "WebSocket URL (optional)" 텍스트 입력
- placeholder: `wss://your-rpc-endpoint.com`
- 기존 Transactions → Monitor 탭의 `incoming.wss_url` 필드는 deprecated 안내 또는 제거

## 영향 범위

| 패키지 | 파일 | 변경 내용 |
|--------|------|----------|
| daemon | `infrastructure/settings/setting-keys.ts` | 네트워크별 WSS URL 설정 키 추가 |
| daemon | `lifecycle/daemon.ts` | subscriber factory에서 네트워크별 WSS URL 조회 |
| daemon | `infrastructure/settings/hot-reload.ts` | WSS 키 변경 시 모니터 재시작 트리거 |
| adapter-evm | `EvmIncomingSubscriber` | WSS transport 지원 (viem webSocket) |
| admin | `pages/wallets.tsx` | RPC Endpoints 탭에 WSS URL 필드 |
| admin | `pages/transactions.tsx` | 기존 글로벌 WSS URL 필드 정리 |
| admin | `utils/settings-search-index.ts` | WSS 검색 인덱스 항목 추가 |
| core | `infrastructure/settings/setting-keys.ts` | 설정 키 정의 |

## 테스트 항목

- [ ] 네트워크별 WSS URL 설정 시 해당 네트워크 subscriber가 지정된 WSS URL 사용
- [ ] 네트워크별 WSS URL 미설정 시 글로벌 `incoming.wss_url` 폴백
- [ ] 글로벌 WSS URL도 미설정 시 RPC URL → WSS 자동 변환 (Solana) 또는 HTTP 폴링 (EVM)
- [ ] `EvmIncomingSubscriber` WSS 연결로 `newHeads` 수신 확인
- [ ] EVM WSS 연결 끊김 시 HTTP 폴링 폴백 전환
- [ ] Admin RPC Endpoints 탭에서 네트워크별 WSS URL 입력/저장/로드
- [ ] hot-reload: WSS URL 변경 시 해당 네트워크 subscriber 재시작
- [ ] 하위 호환: 기존 `incoming.wss_url`만 설정된 환경에서 정상 동작
