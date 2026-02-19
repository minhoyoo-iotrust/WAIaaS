# 093 — npm 패키지 페이지에 README 미표시 — 개별 패키지 디렉토리에 README.md 없음

| 필드 | 값 |
|------|-----|
| **유형** | BUG |
| **심각도** | HIGH |
| **마일스톤** | v2.3 |
| **상태** | OPEN |
| **발견일** | 2026-02-19 |

## 증상

npmjs.com의 8개 패키지 페이지에 README가 전혀 표시되지 않음. 사용자가 패키지를 발견해도 사용법을 알 수 없어 설치 전환율에 직접적 영향.

## 근본 원인

npm은 발행 시 **해당 패키지 디렉토리**의 README.md를 패키지에 포함. 루트 README.md(6,642 bytes)는 존재하지만, 9개 개별 패키지 디렉토리에 README.md가 하나도 없음:

```
packages/core/         → README.md 없음
packages/daemon/       → README.md 없음
packages/cli/          → README.md 없음
packages/sdk/          → README.md 없음
packages/mcp/          → README.md 없음
packages/admin/        → README.md 없음
packages/skills/       → README.md 없음
packages/adapters/solana/ → README.md 없음
packages/adapters/evm/    → README.md 없음
```

`files` 필드에 README.md가 명시되지 않아도 npm은 README.md를 자동 포함하지만, 파일 자체가 존재하지 않으므로 포함할 수 없음.

## 수정 방안

### 방안: 빌드 시 루트 README 복사 + 패키지별 헤더 추가

각 패키지에 개별 README를 수동 관리하면 동기화 부담이 크므로, 빌드/발행 시 루트 README를 복사하되 패키지별 헤더를 추가하는 방식:

```bash
# release.yml deploy 잡에서 publish 전 실행
for pkg_path in "${PACKAGES[@]}"; do
  PKG_NAME=$(node -p "require('./$pkg_path/package.json').name")
  PKG_DESC=$(node -p "require('./$pkg_path/package.json').description")

  # 루트 README 복사
  cp README.md "$pkg_path/README.md"

  # 패키지별 헤더 추가 (선택적)
  # sed -i "1s/^/> This is the \`$PKG_NAME\` package. See the [main repository](https:\/\/github.com\/minhoyoo-iotrust\/WAIaaS) for full documentation.\n\n/" "$pkg_path/README.md"
done
```

### 대안: 정적 README 파일 생성

각 패키지 디렉토리에 루트 README로의 심볼릭 링크 또는 정적 복사본을 배치. 단, 심볼릭 링크는 npm publish에서 실제 파일로 해석되지 않을 수 있으므로 주의.

### 권장: CI에서 복사

release.yml의 deploy 잡에서 publish 직전에 루트 README를 각 패키지로 복사. 로컬 개발 환경은 영향 없고, 발행 시에만 README가 포함됨.

## 테스트 항목

| # | 테스트 | 검증 내용 |
|---|--------|-----------|
| 1 | pnpm pack 후 README 포함 확인 | 각 패키지 tarball에 README.md가 포함되는지 `tar -tf` 로 확인 |
| 2 | README 내용 확인 | 복사된 README가 루트 README와 동일한지 diff 확인 |
| 3 | npm publish 후 페이지 확인 | 발행 후 npmjs.com 패키지 페이지에 README가 정상 표시되는지 확인 |
| 4 | 빌드 후 로컬 잔재 없음 | CI에서만 복사하므로 로컬 `git status`에 README가 나타나지 않는지 확인 |

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `.github/workflows/release.yml` | deploy 잡에 README 복사 스텝 추가 |
| 또는 `turbo.json` / `package.json` | prepublishOnly 스크립트로 루트 README 복사 |
