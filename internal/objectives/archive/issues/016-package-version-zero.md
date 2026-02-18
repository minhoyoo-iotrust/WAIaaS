# BUG-016: 모든 패키지 버전이 0.0.0 — Admin UI/OpenAPI에 잘못된 버전 표시

## 심각도

**LOW** — 기능 영향 없으나, Admin UI 대시보드와 OpenAPI 문서에 버전이 0.0.0으로 표시되어 운영 중 현재 배포 버전을 식별할 수 없음.

## 증상

- Admin UI 대시보드 Version: **0.0.0**
- `GET /v1/admin/status` 응답: `{ "version": "0.0.0" }`
- `GET /doc` OpenAPI 스키마: `{ "info": { "version": "0.0.0" } }`

## 원인

### 모든 패키지의 package.json version이 초기값 그대로

| 패키지 | version |
|--------|---------|
| @waiaas/core | 0.0.0 |
| @waiaas/daemon | 0.0.0 |
| @waiaas/admin | 0.0.0 |
| @waiaas/cli | 0.0.0 |
| @waiaas/sdk | 0.0.0 |
| @waiaas/mcp | 0.0.0 |

### 데몬이 package.json에서 버전을 읽는 구조

`packages/daemon/src/api/server.ts` 30행:

```typescript
const { version: DAEMON_VERSION } = require('../../package.json') as { version: string };
```

이 값이 두 곳에서 사용됨:
- `/admin/status` 응답 (`server.ts:292`): `version: DAEMON_VERSION`
- OpenAPI 스키마 (`server.ts:305`): `info: { version: DAEMON_VERSION }`

### 버전 관리가 git tag에만 존재

프로젝트 버전은 git tag(`v1.1`, `v1.2`, ..., `v1.4.1`)와 objectives 문서로 관리되지만, package.json은 v1.1 초기 생성 이후 한 번도 갱신되지 않음.

## 수정안

### 1. `scripts/tag-release.sh` 생성

tag 생성 시 package.json 버전 갱신 + commit + tag를 한 번에 처리하는 스크립트:

```bash
#!/bin/bash
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: ./scripts/tag-release.sh v1.4.2"
  exit 1
fi

TAG="$1"
VERSION="${TAG#v}"  # v1.4.2 → 1.4.2

# Validate semver format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: Invalid version format '$VERSION'. Expected: X.Y.Z"
  exit 1
fi

echo "Bumping all packages to $VERSION..."
pnpm -r exec -- npm version "$VERSION" --no-git-tag-version

git add packages/*/package.json
git commit -m "chore: bump version to $VERSION"
git tag "$TAG"

echo "Done: package.json → $VERSION, tag → $TAG"
```

### 2. `CLAUDE.md` 프로젝트 규칙 추가 (영문)

프로젝트 루트에 `CLAUDE.md`를 생성하여 Claude Code 세션에서 규칙을 강제:

```markdown
## Version Management

- Do NOT use `git tag` directly.
- Always use `./scripts/tag-release.sh v{VERSION}` to create release tags.
- This script bumps all package.json versions, commits, and creates the git tag in one step.
```

### 3. 즉시 조치: 현재 버전 갱신

최신 태그 `v1.4.1`에 맞춰 일괄 갱신:

```bash
pnpm -r exec -- npm version 1.4.1 --no-git-tag-version
```

## 영향 범위

| 항목 | 내용 |
|------|------|
| 신규 파일 | `scripts/tag-release.sh`, `CLAUDE.md` |
| 수정 파일 | `packages/*/package.json` (6개) — 즉시 조치 |
| API 영향 | `GET /v1/admin/status` version 필드, `GET /doc` OpenAPI info.version |
| Admin UI | 대시보드 Version 카드 |
| 기능 영향 | 없음 — 버전 표시 + 워크플로우 개선 |

---

*발견일: 2026-02-13*
*마일스톤: v1.4.1*
*상태: FIXED*
*수정일: 2026-02-13*
*관련: 없음*
