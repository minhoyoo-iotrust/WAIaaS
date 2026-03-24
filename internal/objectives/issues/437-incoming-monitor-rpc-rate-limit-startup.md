# 437: IncomingTxMonitor RPC Rate Limit — 시작 시 + WebSocket 429 폭주

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-24
- **관련 이슈:** #429 (기존 수정 불충분), #431 (서비스 간 RPC 경합)

## 증상

### 증상 1: 시작 시 optimism-mainnet 구독 실패

최신 RC 버전에서 데몬 시작 시 optimism-mainnet 구독에서 Rate Limit 에러 발생:

```
IncomingTxMonitor: failed to subscribe wallet 019c88f6-... on optimism-mainnet: RPC Request failed. (Too many request, try again later)
IncomingTxMonitor: failed to subscribe wallet 019cd671-... on optimism-mainnet: RPC Request failed. (Too many request, try again later)
IncomingTxMonitorService started: 8 wallets, 37 network subscriptions
```

동일 네트워크의 두 번째 지갑도 실패하는 것은 cascading failure 때문.

### 증상 2: Solana WebSocket 429 로그 폭주

데몬 실행 중 아래 로그가 대량으로 반복 출력됨:

```
ws error: Unexpected server response: 429
ws error: Unexpected server response: 429
ws error: Unexpected server response: 429
... (수십~수백 회 반복)
```

이 메시지는 WAIaaS 코드가 아닌 `ws` 라이브러리(v8.18.3)가 stderr에 직접 출력하는 것임.
`@solana/kit`의 `logsNotifications().subscribe()`가 Solana RPC WebSocket 핸드셰이크 시
HTTP 429를 받으면 `ws`가 자체적으로 에러를 출력하며, 재연결 반복 시 로그가 폭주함.

**경로:** `SolanaIncomingSubscriber.startWebSocketSubscription()` → `@solana/kit` → `ws` library → stderr

## 원인 분석

### 1. 네트워크 간 딜레이 불충분 (500ms)
- `#429`에서 500ms 스태거 추가했으나, 무료 RPC 프로바이더(drpc.org 등)의 rate limit에 여전히 부족
- 37개 구독 중 고유 네트워크 ~10개 × 500ms = ~4.5초 부팅 지연 발생 중

### 2. 실패한 연결 엔트리 미정리 (cascading failure)
- `SubscriptionMultiplexer.addWallet()`에서 `subscriber.connect()` 실패 시 `this.connections`에 깨진 엔트리가 남음
  - L103: 연결 전에 Map에 추가
  - L114: `connect()` 실패 시 Map에서 제거하지 않음
- 같은 네트워크의 후속 지갑은 깨진 subscriber를 재사용하여 연쇄 실패

## 수정 방안 (B안: 구독 비동기화 — 권장)

### 핵심 아이디어
`start()`에서 `addWallet()`의 `connect()`를 fire-and-forget으로 실행하여 부팅을 블록하지 않음. 실패한 구독은 기존 reconnectLoop이 자동 복구.

### 근거
1. **이미 gap recovery 인프라가 있음** — reconnectLoop + `onGapRecovery` 콜백이 늦은 연결의 TX gap을 복구
2. **부팅 시간 0초 증가** — 지갑/네트워크 수와 무관하게 즉시 부팅 완료
3. **rate limit 근본 회피** — 동시 connect 없이 reconnectLoop의 exponential backoff가 자연스럽게 분산
4. **현재 구조와 일관** — 이미 실패를 warn으로 무시하고 넘어가는 구조이나, 실패 후 재시도가 없음. reconnectLoop에 위임하면 자동 복구

### 함께 수정
- `SubscriptionMultiplexer.addWallet()`에서 `connect()` 실패 시 `this.connections.delete(key)` 추가 (어느 방안이든 필수)

### 부팅 시간 비교

| 방안 | 10개 네트워크 | 20개 네트워크 | 확장성 |
|:--:|:--:|:--:|:--:|
| 현재 (500ms 스태거) | ~4.5초 | ~9.5초 | 선형 증가 |
| A안 (backoff 재시도) | ~4.5초 + 실패분 1~3초 | ~9.5초 + 실패분 | 선형 증가 |
| **B안 (비동기화)** | **~0초** | **~0초** | **무관** |

## 수정 파일

- `packages/daemon/src/services/incoming/subscription-multiplexer.ts` — connect() 실패 시 엔트리 정리
- `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` — addWallet을 fire-and-forget으로 변경, 기존 스태거 로직 제거
- `packages/adapters/solana/src/solana-incoming-subscriber.ts` — WebSocket 에러 핸들링 개선 (429 시 backoff 적용, ws 라이브러리 stderr 출력 억제 검토)

## 테스트 항목

1. **connect() 실패 시 엔트리 정리:** connect()가 throw하면 connections Map에서 해당 key가 제거되는지 확인
2. **cascading failure 방지:** 같은 네트워크의 첫 번째 지갑 connect 실패 후, 두 번째 지갑이 새로운 connection을 시도하는지 확인
3. **비동기 구독 완료:** start()가 connect() 완료를 기다리지 않고 즉시 반환하는지 확인
4. **reconnectLoop 복구:** connect 실패 후 reconnectLoop이 자동으로 재연결하는지 확인
5. **gap recovery 연동:** 늦은 연결 시 gap recovery 콜백이 호출되어 누락 TX를 복구하는지 확인
6. **WebSocket 429 로그 폭주 억제:** Solana RPC WebSocket 429 발생 시 무제한 재연결이 아닌 exponential backoff가 적용되는지 확인
