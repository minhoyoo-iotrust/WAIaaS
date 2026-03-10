# Issue #302: E2E 스모크 CI에서 global waiaas CLI PATH 해결 실패 재발 — which fallback 필요

- **유형:** BUG
- **심각도:** HIGH
- **발견 경로:** CI — e2e-smoke.yml 워크플로우 연속 실패 (GitHub Actions run #22857238054 외 5건 연속)

## 현황

#290에서 npm global bin 경로를 `GITHUB_PATH`에 추가하는 수정을 했으나, 여전히 테스트 실행 시 `which waiaas`가 실패하고 있다. v31.8 마일스톤에서 5회 이상 연속 실패 중.

### 실패 체인

1. "Install daemon globally" step: `npm install -g @waiaas/daemon@2.10.0-rc.22` 성공
2. 같은 step에서 `echo "$NPM_GLOBAL_BIN" >> "$GITHUB_PATH"` 실행
3. "Run offchain E2E tests" step: `pnpm --filter @waiaas/e2e-tests test:offchain` 실행
4. vitest → `DaemonManager.resolveGlobalCli()` → `execSync('which waiaas')` 실패
5. 8개 테스트 파일 전부 동일 에러로 FAIL

### 근본 원인

`GITHUB_PATH`로 추가한 경로는 다음 step의 shell PATH에는 반영되지만, pnpm → vitest → Node.js `execSync` 체인에서 PATH가 정확히 전달되지 않을 수 있다. pnpm은 자체 shell 환경을 구성하며, `execSync`의 PATH가 step의 shell PATH와 다를 수 있다.

### 코드 위치

- `packages/e2e-tests/src/helpers/daemon-lifecycle.ts:217-226` — `resolveGlobalCli()` 메서드
- `.github/workflows/e2e-smoke.yml:56-82` — Install daemon globally step
- `.github/workflows/e2e-smoke.yml:84-88` — Run offchain E2E tests step

## 수정 사항

두 곳을 수정하여 이중 안전장치를 구성한다.

### 1. `packages/e2e-tests/src/helpers/daemon-lifecycle.ts` — resolveGlobalCli fallback

`which waiaas` 실패 시 `npm prefix -g` 기반 경로를 fallback으로 시도:

```typescript
private resolveGlobalCli(): string {
  // 1. Try `which waiaas`
  try {
    return execSync('which waiaas', { encoding: 'utf-8' }).trim();
  } catch {
    // Fall through
  }

  // 2. Fallback: npm global prefix
  try {
    const prefix = execSync('npm prefix -g', { encoding: 'utf-8' }).trim();
    const candidate = join(prefix, 'bin', 'waiaas');
    if (existsSync(candidate)) return candidate;
  } catch {
    // Fall through
  }

  throw new Error(
    'DaemonManager: E2E_DAEMON_INSTALL_MODE=global but `waiaas` not found. ' +
    'Install with `npm install -g @waiaas/daemon` or set WAIAAS_CLI_PATH.',
  );
}
```

### 2. `.github/workflows/e2e-smoke.yml` — WAIAAS_CLI_PATH 환경 변수 전달

Install step에서 실제 바이너리 경로를 output으로 캡처하고, 테스트 step에서 `WAIAAS_CLI_PATH`로 전달:

```yaml
- name: Install daemon globally
  id: install
  run: |
    # ... (기존 설치 로직)
    # 설치 성공 후 실제 경로 캡처
    CLI_PATH="$(npm prefix -g)/bin/waiaas"
    echo "cli_path=$CLI_PATH" >> "$GITHUB_OUTPUT"

- name: Run offchain E2E tests
  env:
    E2E_DAEMON_INSTALL_MODE: global
    WAIAAS_CLI_PATH: ${{ steps.install.outputs.cli_path }}
```

이렇게 하면 `WAIAAS_CLI_PATH`가 설정되어 `resolveGlobalCli`까지 도달하지 않고 line 70에서 바로 해결된다.

## #290과의 차이

#290은 `GITHUB_PATH`에 경로를 추가하는 워크플로우 수정이었지만, pnpm/vitest 체인에서 PATH 전달 문제를 해결하지 못했다. 이번 수정은 PATH에 의존하지 않고 명시적 경로를 전달하는 방식으로 근본적으로 해결한다.

## 참고

- 기존 코드에 `WAIAAS_CLI_PATH` 환경 변수 지원이 이미 구현되어 있음 (daemon-lifecycle.ts:70)
- 로컬 테스트: `E2E_DAEMON_INSTALL_MODE`를 설정하지 않으면 monorepo 모드로 동작하므로 영향 없음
- 로컬에서 global 모드 테스트: `npm install -g @waiaas/daemon && E2E_DAEMON_INSTALL_MODE=global pnpm --filter @waiaas/e2e-tests test:offchain`

## 테스트 항목

- [ ] CI에서 `WAIAAS_CLI_PATH` output이 정상 캡처되는지 확인
- [ ] CI에서 E2E 스모크 테스트 8개 파일 전부 PASS 확인
- [ ] `resolveGlobalCli` npm prefix fallback이 `which` 실패 시 정상 동작하는지 단위 테스트
- [ ] 로컬 monorepo 모드(기본) E2E 테스트 정상 동작 확인
