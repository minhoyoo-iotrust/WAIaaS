# #194 데몬 장시간 실행 시 응답 불능 — reconnectLoop 무지연 루프 + fetch 타임아웃 부재

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **관련:** #185 (EVM IncomingSubscriber RPC 타임아웃), #169 (인커밍 모니터 RPC rate limit)

## 현상

데몬을 장시간 실행하면 어느 시점부터 모든 API 요청에 응답하지 않는 상태가 된다.

- CPU 73%, 메모리 2GB
- `/health` 엔드포인트 5초 타임아웃
- 이벤트 루프 완전 블로킹
- ntfy.sh TCP 연결 2개 CLOSED 상태

## 원인 분석

### 1차 원인: reconnectLoop 무지연 루프 (CRITICAL)

**파일:** `packages/core/src/interfaces/connection-state.ts` (reconnectLoop)
**파일:** `packages/adapters/solana/src/solana-incoming-subscriber.ts` (connect/waitForDisconnect)

Solana WebSocket 연결이 즉시 실패할 때, `reconnectLoop`에 delay가 적용되지 않는 경로가 존재:

```
reconnectLoop while 루프:
  1. connect()              → 항상 성공 (fire-and-forget WS 시작)
  2. attempt = 0            → 성공으로 카운터 리셋
  3. waitForDisconnect()    → this.disconnectResolve 세팅
  4. WS 즉시 실패           → disconnectResolve() 호출 → promise resolve
  5. catch 안 탐            → delay 없이 1번으로 복귀 ← 문제
```

- `connect()`는 WS 연결을 fire-and-forget으로 시작하므로 항상 성공 (throw 안 함)
- WS가 즉시 실패하면 `disconnectResolve()`가 호출되어 `waitForDisconnect()`가 즉시 resolve
- try 블록이 정상 완료되므로 catch의 exponential backoff 로직을 타지 않음
- 매 iteration마다: heartbeat 타이머 재생성 + WS 연결 시도 + async generator 생성
- 결과: 마이크로태스크 폭풍 + 메모리 누적 → 이벤트 루프 블로킹

### 2차 원인: fetch() 타임아웃 부재 (HIGH)

**파일:** `packages/daemon/src/services/signing-sdk/channels/ntfy-signing-channel.ts`

- `publishToNtfy()` (line 187): AbortSignal 없이 fetch → ntfy.sh 미응답 시 영구 대기
- `connectSse()` SSE fetch (line 242): abortController.signal 있으나 자체 타임아웃 없음
- ntfy.sh 장애 시 hanging promise 누적

### 3차 원인: SSE 정상 종료 시 구독 미정리 (MEDIUM)

**파일:** `packages/daemon/src/services/signing-sdk/channels/ntfy-signing-channel.ts`

SSE 스트림이 정상 종료(reader.read() done:true)되면 for-await 루프 완료 후 함수가 return되는데, `activeSubscriptions`에서 requestId를 삭제하지 않음. 만료 타이머가 최종 정리하지만 그 사이에 dead 구독이 Map에 남아있음.

## 수정 방안

### Fix 1: reconnectLoop에 최소 지연 추가

`waitForDisconnect()`가 빠르게 resolve될 경우(connect 후 N초 이내) 최소 delay 적용:

```ts
// connection-state.ts reconnectLoop 내부
const connectTime = Date.now();
await subscriber.connect();
// ...
await subscriber.waitForDisconnect();
// 빠른 disconnect = WS 즉시 실패 → delay 적용
const elapsed = Date.now() - connectTime;
if (elapsed < 5000) {
  const delay = calculateDelay(attempt, config);
  attempt++;
  await sleep(delay);
}
```

### Fix 2: 모든 fetch()에 타임아웃 AbortSignal 추가

```ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10_000);
try {
  const res = await fetch(url, { signal: controller.signal, ... });
} finally {
  clearTimeout(timeoutId);
}
```

적용 대상:
- `ntfy-signing-channel.ts` publishToNtfy() (line 187)
- `wallet-notification-channel.ts` 알림 전송 fetch

### Fix 3: SSE 정상 종료 시 구독 정리

```ts
// for-await 루프 종료 후 (line 276 이후, catch 전)
this.activeSubscriptions.delete(requestId);
clearTimeout(expirationTimer);
```

## 영향 범위

| 패키지 | 파일 | 변경 내용 |
|--------|------|----------|
| core | `interfaces/connection-state.ts` | reconnectLoop 빠른 disconnect 감지 + 최소 delay |
| daemon | `services/signing-sdk/channels/ntfy-signing-channel.ts` | fetch 타임아웃 + SSE 종료 시 정리 |
| daemon | `services/notification/wallet-notification-channel.ts` | fetch 타임아웃 |

## 테스트 항목

- [ ] reconnectLoop: connect 후 즉시 disconnect 시 backoff delay 적용 확인
- [ ] reconnectLoop: 정상 disconnect(장시간 연결 후)에서는 즉시 재연결 확인
- [ ] NtfySigningChannel: fetch 타임아웃 10초 초과 시 AbortError 발생
- [ ] NtfySigningChannel: SSE 스트림 정상 종료 후 activeSubscriptions에서 제거 확인
- [ ] 장시간 실행 시나리오: 불안정 RPC 환경에서 CPU/메모리 안정 확인
