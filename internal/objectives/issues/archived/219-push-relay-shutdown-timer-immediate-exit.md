# #219 Push Relay 서버 시작 10초 후 강제 종료 — Shutdown 타이머 즉시 시작 버그

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **마일스톤:** v29.8
- **발견일:** 2026-03-01

## 증상

Push Relay 서버를 로컬에서 실행하면 정상 시작 후 약 10초 뒤 "Shutdown timeout, forcing exit" 메시지와 함께 강제 종료된다.

```
[push-relay] Loading config from /path/to/config.toml
[push-relay] Push provider: Pushwoosh
[push-relay] Subscribing to 1 wallet(s): my-wallet
[push-relay] Server listening on 0.0.0.0:3200
[push-relay] Shutdown timeout, forcing exit
```

## 원인 분석

`packages/push-relay/src/bin.ts:118-122`에서 graceful shutdown 안전장치 타이머(10초)가 **서버 시작 시점에 즉시** 생성된다. 이 타이머는 shutdown 시그널(SIGTERM/SIGINT) 수신 후가 아니라 `main()` 실행 시점부터 카운트다운을 시작하므로, 정상 운영 중인 서버를 10초 후 무조건 `process.exit(1)`로 강제 종료시킨다.

```typescript
// 문제 코드 (bin.ts:118-122)
const shutdownTimer = setTimeout(() => {
  console.error('[push-relay] Shutdown timeout, forcing exit');
  process.exit(1);
}, SHUTDOWN_TIMEOUT_MS);
shutdownTimer.unref();
```

`.unref()` 호출로 타이머가 이벤트 루프를 유지하지는 않지만, HTTP 서버가 이벤트 루프를 유지하고 있으므로 10초 후 콜백이 실행되어 프로세스를 종료한다.

## 수정 방안

Shutdown 타이머를 `shutdown()` 함수 내부로 이동하여, 실제로 종료 시그널을 수신한 후에만 타이머를 시작하도록 변경한다. 정상 종료 완료 시 `clearTimeout()`으로 타이머를 해제한다.

```typescript
async function shutdown(signal: string): Promise<void> {
  console.log(`[push-relay] ${signal} received, shutting down...`);

  const shutdownTimer = setTimeout(() => {
    console.error('[push-relay] Shutdown timeout, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  shutdownTimer.unref();

  await subscriber.stop();
  server.close();
  registry.close();

  clearTimeout(shutdownTimer);
  console.log('[push-relay] Shutdown complete');
  process.exit(0);
}
```

## 영향 범위

- `packages/push-relay/src/bin.ts` — `main()` 함수 내 shutdown 타이머 위치

## 테스트 항목

1. **타이머 위치 단위 테스트**: shutdown 타이머가 `shutdown()` 호출 전에는 생성되지 않는지 검증
2. **정상 시작 지속 테스트**: 서버 시작 후 10초 이상 프로세스가 유지되는지 확인
3. **정상 종료 테스트**: SIGTERM 수신 시 subscriber.stop() → server.close() → registry.close() 순서로 정리 후 종료되는지 확인
4. **종료 타임아웃 테스트**: shutdown 중 subscriber.stop()이 10초 이상 걸릴 경우 강제 종료가 동작하는지 확인
