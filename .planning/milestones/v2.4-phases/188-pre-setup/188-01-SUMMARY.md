---
phase: 188-pre-setup
plan: 01
subsystem: infra
tags: [npm, provenance, trusted-publishing, ci, release, package.json]

# Dependency graph
requires: []
provides:
  - "9 package.json with correct repository.url for Sigstore provenance"
  - "npm CLI >= 11.5.1 guarantee in release.yml deploy job"
affects: [189-oidc-publish, release.yml]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sort -V semantic version comparison in CI steps"

key-files:
  created: []
  modified:
    - "package.json"
    - "packages/core/package.json"
    - "packages/daemon/package.json"
    - "packages/cli/package.json"
    - "packages/sdk/package.json"
    - "packages/mcp/package.json"
    - "packages/skills/package.json"
    - "packages/admin/package.json"
    - "packages/adapters/solana/package.json"
    - "packages/adapters/evm/package.json"
    - ".github/workflows/release.yml"

key-decisions:
  - "homepage 필드는 이번 scope 밖으로 유지 (provenance에 영향 없음, repository.url만 중요)"
  - "publish-check 잡은 dry-run이므로 npm 업그레이드 스텝 불필요"

patterns-established:
  - "repository.url format: git+https://github.com/minhoyoo-iotrust/WAIaaS.git"

requirements-completed: [PREP-01, PREP-02, PREP-03]

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 188 Plan 01: Pre-Setup Summary

**9개 package.json repository.url을 minhoyoo-iotrust/WAIaaS에 맞추고, release.yml deploy 잡에 npm >= 11.5.1 버전 가드 추가**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-18T23:17:40Z
- **Completed:** 2026-02-18T23:19:44Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- 9개 package.json의 repository.url을 `git+https://github.com/minhoyoo-iotrust/WAIaaS.git`으로 통일 (provenance Sigstore 검증 필수 조건)
- 루트 package.json에 repository 필드 신규 추가 (object 형식, directory 없음)
- release.yml deploy 잡에 npm >= 11.5.1 버전 확인 및 자동 업그레이드 스텝 삽입 (Trusted Publishing OIDC 필수)

## Task Commits

Each task was committed atomically:

1. **Task 1: 9개 package.json repository 필드 수정** - `ee51276` (chore)
2. **Task 2: release.yml deploy 잡에 npm CLI 버전 보장 스텝 추가** - `a4d8e2d` (ci)

**Plan metadata:** `a7b4706` (docs: complete plan)

## Files Created/Modified
- `package.json` - 루트에 repository 필드 추가
- `packages/core/package.json` - repository.url 변경
- `packages/daemon/package.json` - repository.url 변경
- `packages/cli/package.json` - repository.url 변경
- `packages/sdk/package.json` - repository.url 변경
- `packages/mcp/package.json` - repository.url 변경
- `packages/skills/package.json` - repository.url 변경
- `packages/admin/package.json` - repository.url 변경
- `packages/adapters/solana/package.json` - repository.url 변경
- `packages/adapters/evm/package.json` - repository.url 변경
- `.github/workflows/release.yml` - deploy 잡에 npm 버전 가드 스텝 추가

## Decisions Made
- homepage 필드는 plan 범위 밖으로 유지 -- provenance 검증에 영향 없음, repository.url만 Sigstore에 사용
- publish-check 잡에는 npm 업그레이드 스텝 미추가 -- dry-run이므로 provenance 불필요 (유저 결정 반영)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 9개 package.json의 repository.url이 GitHub 원격과 정확히 일치하여 Phase 189 OIDC 전환 준비 완료
- npm CLI >= 11.5.1이 deploy 잡에서 보장되어 `--provenance` 플래그 사용 가능
- homepage 필드의 old URL은 별도 정리 가능 (provenance와 무관)

## Self-Check: PASSED

All 12 files verified present. Both task commits (ee51276, a4d8e2d) verified in git log.

---
*Phase: 188-pre-setup*
*Completed: 2026-02-19*
