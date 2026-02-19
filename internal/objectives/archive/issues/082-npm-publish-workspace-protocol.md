# 082 — release.yml이 npm publish 사용하여 workspace:* 미치환 상태로 배포됨

| 필드 | 값 |
|------|-----|
| **유형** | BUG |
| **심각도** | CRITICAL |
| **마일스톤** | v2.3 |
| **상태** | FIXED |
| **발견일** | 2026-02-18 |

## 증상

`npm install -g @waiaas/cli` 실행 시 설치 실패:

```
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:*
```

배포된 패키지의 dependencies에 `workspace:*`가 그대로 남아있다:

```json
{
  "@waiaas/core": "workspace:*",
  "@waiaas/daemon": "workspace:*"
}
```

## 원인

`release.yml:249`에서 `npm publish`를 사용:

```bash
npm publish --access public 2>&1
```

`npm publish`는 pnpm의 `workspace:*` 프로토콜을 인식하지 못하고 package.json을 그대로 배포한다. `pnpm publish`를 사용해야 `workspace:*`가 실제 버전 번호(예: `^2.1.3-rc.1`)로 자동 치환된다.

## 관련 이슈

- 이슈 076 (FIXED): Smoke Test에서 동일 문제 발견 → 로컬 테스트는 `pnpm pack`으로 수정됨
- 그러나 실제 CI의 `release.yml` publish 단계에는 반영되지 않았음

## 수정 방안

`release.yml`의 npm publish를 pnpm publish로 변경:

```bash
for pkg_path in "${PACKAGES[@]}"; do
  echo "--- Publishing $pkg_path ---"
  cd "$pkg_path"
  pnpm publish --access public --no-git-checks 2>&1
  cd "$GITHUB_WORKSPACE"
done
```

`pnpm publish`는:
1. `workspace:*` → 실제 버전으로 치환
2. `workspace:^` → `^실제버전`으로 치환
3. 치환된 임시 package.json으로 publish 후 원본 복원

## 즉시 복구

현재 배포된 8개 패키지 전부 설치 불가 상태. 수정 후 재배포 필요:

```bash
# CI에서 pnpm publish로 재배포하거나, 로컬에서 수동 복구:
pnpm publish --access public --no-git-checks
```

## 영향 범위

- `.github/workflows/release.yml` — deploy job의 publish 단계
- 8개 패키지 전체: core, daemon, cli, sdk, mcp, skills, adapter-solana, adapter-evm
- **모든 사용자가 npm install로 설치 불가** — CRITICAL
