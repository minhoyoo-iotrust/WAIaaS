# 285 — E2E DaemonManager가 E2E_DAEMON_INSTALL_MODE=global 미지원

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.8
- **발견일:** 2026-03-09
- **수정일:** 2026-03-09
- **발견 경로:** GitHub Actions run #22850819564

## 증상

E2E Smoke 워크플로우(`e2e-smoke.yml`)에서 오프체인 테스트 8개 suite가 전부 실패. 모든 테스트가 `beforeAll`에서 데몬 시작 실패로 skip 처리됨.

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '/home/runner/work/WAIaaS/WAIaaS/packages/cli/dist/index.js'
  imported from /home/runner/work/WAIaaS/WAIaaS/packages/cli/bin/waiaas
```

Push Relay 테스트도 동일 패턴:
```
PushRelayManager: bin not found at
  /home/runner/work/WAIaaS/WAIaaS/packages/push-relay/dist/bin.js
```

## 원인

`DaemonManager.resolveMonorepoCli()`가 항상 모노레포 내부 경로(`packages/cli/bin/waiaas`)를 반환함. CI 워크플로우에서 `E2E_DAEMON_INSTALL_MODE=global` 환경변수를 설정하지만, `daemon-lifecycle.ts` 코드에서 이 환경변수를 읽는 로직이 없음.

CI 실행 흐름:
1. `pnpm turbo run build --filter=@waiaas/e2e-tests` — e2e-tests만 빌드 (cli 빌드 안 함)
2. `npm install -g @waiaas/daemon@$VERSION` — npm에서 글로벌 설치 (성공)
3. 테스트 실행 → `resolveMonorepoCli()` → `packages/cli/dist/index.js` 찾음 → 없음 → 실패

즉, 글로벌 설치된 `waiaas` 바이너리를 사용해야 하는데, 항상 빌드 안 된 모노레포 경로를 참조하는 것이 근본 원인.

`PushRelayManager`도 동일 — 글로벌/외부 설치 경로를 지원하지 않음.

## 수정 방안

`DaemonManager`가 `E2E_DAEMON_INSTALL_MODE` 환경변수를 읽어 CLI 경로를 결정하도록 수정:

1. **`daemon-lifecycle.ts`**: `resolveMonorepoCli()` 전에 `E2E_DAEMON_INSTALL_MODE=global`이면 `which waiaas` 결과를 사용
2. **`push-relay-lifecycle.ts`**: 동일하게 `E2E_PUSH_RELAY_INSTALL_MODE=global` 또는 `PUSH_RELAY_BIN_PATH` 환경변수로 글로벌 설치 경로 지원

```typescript
// daemon-lifecycle.ts 수정 예시
private resolveCliPath(explicitPath?: string): string {
  if (explicitPath) return explicitPath;
  if (process.env['WAIAAS_CLI_PATH']) return process.env['WAIAAS_CLI_PATH'];
  if (process.env['E2E_DAEMON_INSTALL_MODE'] === 'global') {
    // 글로벌 설치된 waiaas 바이너리 사용
    const globalBin = execSync('which waiaas', { encoding: 'utf-8' }).trim();
    if (globalBin) return globalBin;
  }
  return this.resolveMonorepoCli();
}
```

## 영향 범위

- `packages/e2e-tests/src/helpers/daemon-lifecycle.ts` — CLI 경로 해석 로직
- `packages/e2e-tests/src/helpers/push-relay-lifecycle.ts` — Push Relay 바이너리 경로 해석 로직
- `.github/workflows/e2e-smoke.yml` — 워크플로우 변경 불필요 (코드 수정만으로 해결)

## 테스트 항목

1. `E2E_DAEMON_INSTALL_MODE=global` + `waiaas` 글로벌 설치 시 데몬 정상 시작 확인
2. 환경변수 미설정 시 기존 모노레포 경로 폴백 동작 확인
3. `WAIAAS_CLI_PATH` 명시적 경로 우선순위 확인
4. Push Relay도 동일하게 글로벌 모드 동작 확인
5. CI에서 E2E Smoke 워크플로우 정상 통과 확인
