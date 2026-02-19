# 081 — npm publish에서 RC 버전이 latest 태그로 배포됨

| 필드 | 값 |
|------|-----|
| **유형** | BUG |
| **심각도** | HIGH |
| **마일스톤** | v2.3 |
| **상태** | FIXED |
| **발견일** | 2026-02-18 |

## 증상

`npm install -g @waiaas/cli` 실행 시 RC 버전(`2.1.3-rc.1`)이 설치된다. `npm view @waiaas/cli dist-tags` 결과:

```
{ latest: '2.1.3-rc.1' }
```

RC 버전은 `rc` 또는 `next` 태그로 배포되어야 하며, `latest`는 정식 릴리스만 가리켜야 한다.

## 원인

`release.yml:249`에서 `--tag` 옵션 없이 publish:

```bash
npm publish --access public 2>&1
```

npm은 `--tag`를 생략하면 자동으로 `latest` 태그를 부여한다. 버전 문자열에 prerelease 접미사(`-rc`, `-beta`, `-alpha`)가 있어도 무조건 `latest`로 올라간다.

## 수정 방안

publish 전에 버전 문자열을 검사하여 `--tag` 분기:

```bash
for pkg_path in "${PACKAGES[@]}"; do
  echo "--- Publishing $pkg_path ---"
  cd "$pkg_path"
  PKG_VERSION=$(node -p "require('./package.json').version")
  if [[ "$PKG_VERSION" == *-* ]]; then
    # prerelease: -rc.1, -beta.2, -alpha.1 등
    npm publish --access public --tag rc 2>&1
  else
    # 정식 릴리스
    npm publish --access public 2>&1
  fi
  cd "$GITHUB_WORKSPACE"
done
```

semver에서 `-` 이후 문자열이 있으면 prerelease이므로 `*-*` 패턴으로 판별 가능.

## 즉시 복구

현재 `latest`가 RC를 가리키는 상태를 수동으로 복구하려면, 정식 버전이 배포된 후:

```bash
npm dist-tag add @waiaas/cli@<정식버전> latest
npm dist-tag add @waiaas/cli@2.1.3-rc.1 rc
```

또는 정식 릴리스를 한 번 publish하면 `latest`가 자동으로 정식 버전으로 이동한다.

## 영향 범위

- `.github/workflows/release.yml` — deploy job의 npm publish 단계
- 8개 패키지 전체 동일 영향: core, daemon, cli, sdk, mcp, skills, adapter-solana, adapter-evm
