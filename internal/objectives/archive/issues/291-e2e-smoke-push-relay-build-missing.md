# 291 — E2E 스모크 CI에서 push-relay 빌드 누락으로 bin.js 미존재 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.8
- **발견일:** 2026-03-09
- **발견 경로:** GitHub Actions run #22852742847 로그 분석
- **상태:** FIXED
- **수정일:** 2026-03-09

## 증상

`e2e-smoke.yml`의 `push-relay-device-lifecycle` 테스트가 다음 에러로 실패:

```
Error: PushRelayManager: bin not found at /home/runner/work/WAIaaS/WAIaaS/packages/push-relay/dist/bin.js.
Build with 'pnpm turbo run build --filter=@waiaas/push-relay' or set PUSH_RELAY_BIN_PATH.
```

## 원인

워크플로우의 빌드 스텝이 `@waiaas/e2e-tests`만 빌드한다:

```yaml
- name: Build e2e-tests package
  run: pnpm turbo run build --filter=@waiaas/e2e-tests
```

`@waiaas/push-relay`는 `@waiaas/e2e-tests`의 turbo 의존성에 포함되지 않으므로 빌드되지 않는다. push-relay 관련 E2E 테스트(`advanced-defi-settings-push-relay.e2e.test.ts`)는 로컬 `dist/bin.js`를 직접 참조하므로 빌드가 필요하다.

단, CI 스모크 환경에서는 `E2E_DAEMON_INSTALL_MODE=global`로 설치된 데몬을 사용하는데, push-relay는 별도 프로세스이므로 global 설치와 무관하게 로컬 빌드가 필요하다.

## 수정 방안

빌드 스텝에서 push-relay도 함께 빌드:

```yaml
- name: Build e2e-tests package
  run: pnpm turbo run build --filter=@waiaas/e2e-tests --filter=@waiaas/push-relay
```

또는 push-relay 테스트를 CI 스모크에서 제외하고 `E2E_PUSH_RELAY_INSTALL_MODE=global`을 지원하는 방안도 고려할 수 있다.

## 영향 범위

- `.github/workflows/e2e-smoke.yml` — "Build e2e-tests package" 스텝 (54번 줄)
- `packages/e2e-tests/src/helpers/push-relay-lifecycle.ts` — `resolveMonorepoBin()` (68-79번 줄)

## 테스트 항목

1. **빌드 확인**: 수정 후 CI에서 `packages/push-relay/dist/bin.js` 존재 여부 확인
2. **push-relay 테스트 통과**: `push-relay-device-lifecycle` suite가 정상 통과하는지 확인
3. **빌드 시간 영향**: push-relay 추가 빌드로 인한 CI 시간 증가가 합리적인지 확인
