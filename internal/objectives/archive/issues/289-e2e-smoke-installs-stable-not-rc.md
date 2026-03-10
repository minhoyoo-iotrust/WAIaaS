# 289 — E2E 스모크 워크플로우가 RC 대신 stable 릴리스를 설치

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.8
- **발견일:** 2026-03-09
- **발견 경로:** e2e-smoke.yml 코드 리뷰
- **상태:** FIXED
- **수정일:** 2026-03-09

## 증상

E2E 스모크 테스트 GitHub Actions 워크플로우(`e2e-smoke.yml`)에서 자동 감지 모드(version 미지정)로 실행 시, 최신 RC 버전이 아닌 이전 stable 릴리스를 설치한다.

프로젝트가 prerelease(RC) 모드로 운영되므로, RC가 배포될 때마다 트리거되는 E2E 테스트가 실제로는 구버전 stable을 검증하게 되어 테스트 의미가 없어진다.

## 원인

`e2e-smoke.yml` 42번 줄에서 GitHub API `/releases/latest` 엔드포인트를 사용:

```yaml
TAG=$(gh api repos/${{ github.repository }}/releases/latest --jq '.tag_name' 2>/dev/null || echo "")
```

GitHub의 `/releases/latest`는 **prerelease가 아닌 최신 stable release만** 반환한다. 현재 프로젝트가 prerelease 모드(예: `v2.10.0-rc.20`)이므로 RC 릴리스는 무시되고 이전 stable 버전(예: `v2.9.0`)이 반환된다.

## 수정 방안

`/releases/latest` 대신 `/releases` 목록에서 첫 번째 항목(prerelease 포함)을 사용:

```yaml
# Before (stable only)
TAG=$(gh api repos/${{ github.repository }}/releases/latest --jq '.tag_name' 2>/dev/null || echo "")

# After (prerelease 포함 최신)
TAG=$(gh api repos/${{ github.repository }}/releases --jq '.[0].tag_name' 2>/dev/null || echo "")
```

`/releases` API는 최신순으로 정렬되며, prerelease와 stable 모두 포함하므로 항상 가장 최근 배포된 버전을 반환한다.

## 영향 범위

- `.github/workflows/e2e-smoke.yml` — "Determine version" 스텝 (42번 줄)

## 테스트 항목

1. **수동 트리거 테스트**: `workflow_dispatch`로 RC 버전(예: `2.10.0-rc.20`)을 명시 지정하여 올바르게 설치되는지 확인
2. **자동 감지 테스트**: version 미지정 `workflow_dispatch` 실행 시 `/releases` 첫 번째 항목(RC 포함)이 선택되는지 로그 확인
3. **Release 워크플로우 연동**: Release 워크플로우 완료 후 자동 트리거 시 RC 버전이 올바르게 감지되는지 확인
