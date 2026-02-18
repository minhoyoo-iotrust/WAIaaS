# 080 — Graceful Shutdown 후 process.exit(0) 미호출로 프로세스 미종료

| 필드 | 값 |
|------|-----|
| **유형** | BUG |
| **심각도** | MEDIUM |
| **마일스톤** | v2.2 |
| **상태** | FIXED |
| **발견일** | 2026-02-18 |

## 증상

`waiaas start`로 데몬 실행 후 Ctrl+C(SIGINT)로 정지하면, 10-step 셧다운 시퀀스가 정상 완료되고 `"Shutdown complete"` 로그가 출력되지만 **프로세스가 종료되지 않아 터미널 프롬프트로 돌아오지 않는다.** 추가 Ctrl+C를 여러 번 눌러야 강제 종료된다.

## 원인

### signal-handler.ts

```ts
process.on('SIGINT', () => {
  void daemon.shutdown('SIGINT');  // await 없이 fire-and-forget
});
```

- `shutdown()` 완료 후 `process.exit(0)` 미호출.

### daemon.ts — shutdown()

```ts
async shutdown(signal: string): Promise<void> {
  // ... 10-step 정리 ...
  console.log('Shutdown complete');
  // ← process.exit(0) 없음
}
```

- HTTP 서버, proper-lockfile 업데이트 타이머, 이벤트 루프 핸들 등이 남아있어 Node.js가 자연 종료되지 않음.
- 비교: `uncaughtException`/`unhandledRejection` 핸들러는 `.finally(() => process.exit(1))`을 호출하여 정상 종료됨.

## 수정 방안

`daemon.ts`의 `shutdown()` 메서드 마지막에 `process.exit()` 추가:

```ts
console.log('Shutdown complete');
process.exit(0);
} catch (err) {
  console.error('Shutdown error:', err);
  process.exit(1);
}
```

## 재발방지 테스트

기존 `lifecycle.test.ts`의 shutdown 테스트에 `process.exit` 호출 검증 추가:

```ts
it('shutdown calls process.exit(0) on success', async () => {
  const { DaemonLifecycle } = await import('../lifecycle/daemon.js');
  const daemon = new DaemonLifecycle();
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

  await daemon.shutdown('SIGTERM');

  expect(exitSpy).toHaveBeenCalledWith(0);
  exitSpy.mockRestore();
});

it('shutdown calls process.exit(1) on error', async () => {
  const { DaemonLifecycle } = await import('../lifecycle/daemon.js');
  const daemon = new DaemonLifecycle();
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

  // DB close에서 에러를 유발하여 catch 분기 진입
  (daemon as any).sqlite = { close: () => { throw new Error('close failed'); } };

  await daemon.shutdown('SIGTERM');

  expect(exitSpy).toHaveBeenCalledWith(1);
  exitSpy.mockRestore();
});
```

- 기존 테스트(`lifecycle.test.ts:322`)에 `exitSpy`가 이미 있으나 호출 검증 assert가 없음 — 보호용 mock일 뿐이었음.
- 수정 후 기존 `exitSpy` 사용 테스트(L327, L338)에도 `expect(exitSpy).toHaveBeenCalledWith(0)` assert 추가 권장.

## 영향 범위

- `packages/daemon/src/lifecycle/daemon.ts` — `shutdown()` 메서드
- `packages/daemon/src/__tests__/lifecycle.test.ts` — 테스트 추가
- npm 직접 설치(`waiaas start`) 환경에서 발생. Docker 환경에서도 동일할 수 있으나 컨테이너는 SIGKILL로 최종 정리됨.
