# 290 — E2E 스모크 CI에서 npm global bin 경로가 PATH에 없어 waiaas 실행 실패

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** v31.8
- **발견일:** 2026-03-09
- **발견 경로:** GitHub Actions run #22852742847 로그 분석
- **상태:** OPEN

## 증상

`e2e-smoke.yml` 워크플로우에서 `npm install -g @waiaas/daemon@2.9.0`은 성공하지만, 이후 E2E 테스트 실행 시 `DaemonManager.resolveGlobalCli()`의 `which waiaas`가 실패하여 9개 테스트 suite가 전부 실패한다.

```
Error: DaemonManager: E2E_DAEMON_INSTALL_MODE=global but `waiaas` not found in PATH.
```

## 원인

GitHub Actions ubuntu 런너에서 `npm install -g`로 설치한 바이너리의 경로(예: `/usr/local/lib/node_modules/.bin`)가 PATH 환경변수에 포함되지 않는다. `pnpm`으로 셋업된 환경에서는 `PNPM_HOME`만 PATH에 추가되고, npm global prefix bin은 별도로 추가하지 않는다.

`resolveGlobalCli()`는 `which waiaas`로 바이너리를 찾으므로, PATH에 npm global bin이 없으면 항상 실패한다.

## 수정 방안

워크플로우의 "Install daemon globally" 스텝 이후에 npm global bin 경로를 PATH에 추가:

```yaml
- name: Install daemon globally
  env:
    VERSION: ${{ steps.version.outputs.version }}
  run: |
    # Add npm global bin to PATH
    NPM_GLOBAL_BIN="$(npm prefix -g)/bin"
    echo "$NPM_GLOBAL_BIN" >> "$GITHUB_PATH"

    # Retry with backoff ...
    npm install -g "@waiaas/daemon@$VERSION"
```

또는 `resolveGlobalCli()`에서 `which` 대신 `npm prefix -g` + `/bin/waiaas`로 직접 경로를 구성하는 방법도 있다.

## 영향 범위

- `.github/workflows/e2e-smoke.yml` — "Install daemon globally" 스텝
- `packages/e2e-tests/src/helpers/daemon-lifecycle.ts` — `resolveGlobalCli()` (217-226번 줄)

## 테스트 항목

1. **CI 실행 확인**: 수정 후 `workflow_dispatch`로 E2E 스모크 실행 시 `which waiaas`가 정상 동작하는지 확인
2. **경로 출력 검증**: Install 스텝에서 `npm prefix -g` 값과 `which waiaas` 결과를 로그로 출력하여 경로 일치 확인
3. **9개 suite 통과**: 이전에 전부 실패했던 9개 suite가 정상 통과하는지 확인
