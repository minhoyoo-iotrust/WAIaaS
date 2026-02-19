# 100 — npm publish가 workspace:* 미치환 상태로 배포됨 (RC 버전)

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** v2.5
- **상태:** FIXED
- **등록일:** 2026-02-19

## 현상

`@waiaas/cli@2.3.0-rc.1`을 글로벌 설치하면 `workspace:*` 프로토콜 에러로 설치 실패한다.

```
npm install -g @waiaas/cli@2.3.0-rc.1
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:*
```

npm 레지스트리에 배포된 패키지의 dependencies에 `workspace:*`가 그대로 남아있다:

```json
{
  "@waiaas/core": "workspace:*",
  "@waiaas/daemon": "workspace:*"
}
```

2.2.1 (stable)은 정상이나, 2.3.0-rc 이후 RC 버전이 모두 깨져있다.

## 원인

v2.4 마일스톤에서 OIDC Trusted Publishing 전환 시, 실제 배포 스텝을 `pnpm publish`에서 `npm publish --provenance`로 변경했다. `npm`은 pnpm의 `workspace:*` 프로토콜을 이해하지 못하여 치환 없이 그대로 배포된다.

```yaml
# .github/workflows/release.yml:298-306
# 실제 배포 — npm publish (workspace:* 미치환)
for pkg_path in "${PACKAGES[@]}"; do
  cd "$pkg_path"
  npm publish --provenance --access public --tag rc 2>&1
  cd "$GITHUB_WORKSPACE"
done
```

반면 dry-run 스텝(160행)은 `pnpm publish --dry-run`을 사용하여 문제가 검출되지 않았다.

| 스텝 | 도구 | workspace:* 치환 | 문제 |
|------|------|-----------------|------|
| dry-run (160행) | `pnpm publish` | O | 검증 통과 |
| 실제 배포 (303행) | `npm publish` | **X** | 깨진 패키지 배포 |

## 기대 동작

npm 레지스트리에 배포되는 패키지의 `workspace:*`가 실제 버전 번호로 치환되어야 한다.

## 수정 방안

### 방안 1: 배포 전 workspace:* → 실제 버전 치환 스크립트 추가

`npm publish` 전에 각 패키지의 `package.json`에서 `workspace:*`를 해당 패키지의 실제 버전으로 치환한다.

```bash
# 각 패키지 배포 전
node -e "
  const pkg = require('./package.json');
  const version = pkg.version;
  for (const [dep, ver] of Object.entries(pkg.dependencies || {})) {
    if (ver === 'workspace:*' && dep.startsWith('@waiaas/')) {
      pkg.dependencies[dep] = version;
    }
  }
  require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
npm publish --provenance --access public --tag rc
```

### 방안 2: pnpm publish + --provenance 조합 확인

pnpm 9.x에서 `--provenance` 플래그를 지원하는지 확인하고, 지원하면 `pnpm publish --provenance`로 되돌린다.

### 방안 3: pnpm pack → npm publish 2단계

`pnpm pack`으로 tarball 생성(workspace:* 치환됨) → `npm publish <tarball> --provenance`로 배포.

## 즉시 조치 필요

현재 2.3.0-rc.1이 설치 불가 상태이므로, 수정 후 재배포하거나 해당 버전을 deprecate 처리해야 한다.

## 테스트 항목

### CI 테스트
1. release.yml의 publish 스텝에서 배포된 패키지에 `workspace:*`가 없는지 검증 추가
2. `npm install -g @waiaas/cli@<new-version>` 글로벌 설치 성공 확인
3. `npm view @waiaas/cli@<new-version> dependencies`에 실제 버전 번호 표시 확인

### 수동 검증
4. RC 배포 후 `npx @waiaas/cli start` 정상 실행 확인
