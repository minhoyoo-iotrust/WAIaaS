---
phase: 170-deploy-prerelease
plan: 03
subsystem: infra
tags: [release-please, rc, prerelease, npm-publish, docker, pipeline]

requires:
  - phase: 170-deploy-prerelease/170-01
    provides: "8개 패키지 npm publish 준비 완료"
  - phase: 170-deploy-prerelease/170-02
    provides: "release.yml 8 패키지 + Docker Hub 이중 레지스트리"
provides:
  - "v2.0.0-rc.1 pre-release 발행 완료 (npm 8개 + Docker 2 레지스트리)"
  - "release-please RC 설정 활성화"
  - "릴리스 파이프라인 E2E 검증 완료"
affects: [release, deploy]

tech-stack:
  added: []
  patterns: ["release-as 명시적 RC 버전", "Anza 공식 Solana 인스톨러", "turbo build 필터 Docker 최적화"]

key-files:
  created: []
  modified:
    - "release-please-config.json"
    - ".github/workflows/release-please.yml"
    - ".github/workflows/release.yml"
    - "Dockerfile"

key-decisions:
  - "release-as + prerelease-type 미결합 -- release-as: '2.0.0-rc.1' 명시적 설정 필요"
  - "GITHUB_TOKEN → RELEASE_PAT 전환 -- GITHUB_TOKEN은 다른 워크플로를 트리거할 수 없음"
  - "googleapis/release-please-action@v4 사용 -- google-github-actions 버전은 deprecated"
  - "metadaoproject/setup-solana@v1.2 → Anza 공식 인스톨러 -- 액션 scripts/channel-info.sh 누락 버그"
  - "Docker builder에서 daemon+cli+mcp+sdk 명시적 빌드 -- skills 제외 (Docker 이미지 불필요)"
  - "Fine-grained PAT + GraphQL API 불안정 -- 수동 릴리스 생성으로 우회"

patterns-established:
  - "release-as로 RC 버전 명시: prerelease-type은 release-as와 결합 불가"
  - "Docker turbo 필터: 이미지에 포함될 패키지만 빌드 (skills 제외)"
  - "릴리스 파이프라인 6-job: test → chain-integration → platform → publish-check → docker-publish → deploy"

requirements-completed: [DEPLOY-04, RELEASE-03]

duration: 3h (CI 디버깅 포함)
completed: 2026-02-18
---

# Phase 170 Plan 03: v2.0.0-rc.1 Pre-release 발행 Summary

**v2.0.0-rc.1 RC 릴리스 전체 파이프라인 E2E 검증 완료 — npm 8개 패키지 + Docker GHCR/Hub 발행 성공**

## Performance

- **Duration:** ~3h (CI 디버깅 다수 포함)
- **Started:** 2026-02-17
- **Completed:** 2026-02-18
- **Tasks:** 2 (auto + checkpoint)
- **Files modified:** 4

## Accomplishments
- release-please RC 설정: `release-as: "2.0.0-rc.1"`, `prerelease: true`
- RELEASE_PAT로 cross-workflow 트리거 활성화
- release.yml 6-job 파이프라인 E2E 검증 (test/chain/platform/publish-check/docker/deploy)
- npm 8개 패키지 v2.0.0-rc.1 발행 완료
- Docker 이미지 GHCR + Docker Hub 이중 레지스트리 push 완료
- Solana CI 설정을 Anza 공식 인스톨러로 교체
- Dockerfile 빌드 필터 최적화 (daemon+cli+mcp+sdk만 빌드)

## Task Commits

1. **Task 1: release-please RC 설정** - `44135cc` (feat)
2. **Task 2 (CI 수정):**
   - Solana 인스톨러 교체 - `d882e77` (fix)
   - Docker builder 전체 빌드 → 필터 - `78ee4aa` (fix)
   - Docker builder sdk 추가 - `640e907` (fix)

## Files Modified
- `release-please-config.json` - release-as: 2.0.0-rc.1, prerelease: true
- `.github/workflows/release-please.yml` - googleapis action + RELEASE_PAT
- `.github/workflows/release.yml` - Anza Solana 인스톨러
- `Dockerfile` - turbo build 필터 (daemon+cli+mcp+sdk)

## Decisions Made
- release-as와 prerelease-type은 결합 불가: `release-as: "2.0.0-rc.1"` 명시적 설정
- GITHUB_TOKEN은 다른 워크플로를 트리거할 수 없음: Fine-grained PAT(RELEASE_PAT) 필요
- google-github-actions/release-please-action@v4는 deprecated: googleapis/ 사용
- Fine-grained PAT + release-please GraphQL 호환성 불안정: 수동 릴리스 생성으로 우회
- Docker builder에서 skills 제외: Docker 이미지에 불필요, @types/node 미설치 빌드 실패 방지
- npm Classic Automation Token 사용: 2FA bypass 필요, Trusted Publishing은 v2.0.4에서 전환 예정

## Deviations from Plan

### 1. [Blocker] release-as + prerelease-type 미결합
- **Issue:** `release-as: "2.0.0"` + `prerelease-type: "rc"` 조합이 `2.0.0-rc.1`이 아닌 `2.0.0`을 생성
- **Fix:** `release-as: "2.0.0-rc.1"` 명시적 설정, prerelease-type 제거

### 2. [Blocker] GITHUB_TOKEN cross-workflow 트리거 불가
- **Issue:** release-please가 GITHUB_TOKEN으로 Release를 생성해도 release.yml이 트리거되지 않음
- **Fix:** Fine-grained PAT(RELEASE_PAT) 설정 + release-please.yml token 전환

### 3. [Blocker] metadaoproject/setup-solana@v1.2 깨짐
- **Issue:** scripts/channel-info.sh 파일 누락으로 Solana CLI 설치 실패
- **Fix:** Anza 공식 인스톨러 (`release.anza.xyz/stable/install`) 직접 사용

### 4. [Blocker] Docker builder에서 sdk/cli/mcp dist 미생성
- **Issue:** `--filter=@waiaas/daemon...`이 daemon 의존성만 빌드, cli/mcp/sdk 미포함
- **Fix:** `--filter=@waiaas/daemon... --filter=@waiaas/cli... --filter=@waiaas/mcp... --filter=@waiaas/sdk...`

### 5. [Blocker] npm ENEEDAUTH → E403
- **Issue:** NPM_TOKEN 미설정 → 설정 후 Classic Publish 토큰이 2FA bypass 불가
- **Fix:** Classic Automation Token으로 교체

**Total deviations:** 5 blockers (모두 해결)

## Verification Results

| 항목 | 결과 |
|------|------|
| npm @waiaas/core 2.0.0-rc.1 | PASS |
| npm @waiaas/daemon 2.0.0-rc.1 | PASS |
| npm @waiaas/cli 2.0.0-rc.1 | PASS |
| npm @waiaas/sdk 2.0.0-rc.1 | PASS |
| npm @waiaas/mcp 2.0.0-rc.1 | PASS |
| npm @waiaas/skills 2.0.0-rc.1 | PASS |
| npm @waiaas/adapter-solana 2.0.0-rc.1 | PASS |
| npm @waiaas/adapter-evm 2.0.0-rc.1 | PASS |
| Docker GHCR push | PASS |
| Docker Hub push | PASS |
| GitHub Release (Pre-release) | PASS |

## Next Steps (v2.0.0 정식 릴리스 전환)

1. **3일 관찰:** npm install + docker run 정상 동작 확인, 이슈 모니터링
2. **정식 릴리스:** release-please-config.json에서 `release-as`, `prerelease` 제거 → 커밋 → Release PR → 머지 → v2.0.0
3. **Trusted Publishing 전환:** v2.0.4 마일스톤에서 NPM_TOKEN → OIDC 전환

---
*Phase: 170-deploy-prerelease*
*Completed: 2026-02-18*
