---
phase: 161-cli-upgrade
plan: 01
subsystem: cli
tags: [update-notify, stderr, fetch, dedup, fire-and-forget]

# Dependency graph
requires:
  - phase: 160-version-check-infra
    provides: "VersionCheckService + /health endpoint에 latestVersion, updateAvailable 필드"
provides:
  - "checkAndNotifyUpdate 유틸리티 (CLI 업그레이드 알림)"
  - "--quiet 플래그 및 WAIAAS_NO_UPDATE_NOTIFY 환경변수 억제"
  - "24시간 파일 기반 중복 방지"
affects: [162-compat-docker, 161-02 upgrade 명령어]

# Tech tracking
tech-stack:
  added: []
  patterns: ["fire-and-forget async (non-blocking CLI)", "file mtime dedup", "stderr-only output"]

key-files:
  created:
    - packages/cli/src/utils/update-notify.ts
    - packages/cli/src/__tests__/update-notify.test.ts
  modified:
    - packages/cli/src/index.ts

key-decisions:
  - "파일 기반 mtime dedup 사용 (.last-update-notify) -- 데몬 비실행 시에도 동작"
  - "AbortSignal.timeout(2000) 페치 타임아웃 -- CLI 응답성 2초 이내 보장"
  - "process.stderr.write로 출력 -- stdout 파이프 안전성 확보"

patterns-established:
  - "fire-and-forget async: checkAndNotifyUpdate().catch(() => {}) 패턴"
  - "resolvePort: config.toml에서 regex로 포트 파싱 (TOML 파서 의존성 회피)"

requirements-completed: [VCHK-05, VCHK-06, VCHK-07]

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 161 Plan 01: CLI Update Notify Summary

**CLI 실행 시 /health에서 updateAvailable 확인 후 stderr 알림 박스 출력, 24시간 파일 기반 dedup + quiet/env 억제**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T00:31:03Z
- **Completed:** 2026-02-17T00:33:03Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- checkAndNotifyUpdate 유틸리티: /health fetch -> updateAvailable 확인 -> stderr 알림 박스
- 24시간 .last-update-notify 파일 mtime 기반 중복 방지
- --quiet 및 WAIAAS_NO_UPDATE_NOTIFY=1 환경변수 억제 지원
- CLI index.ts에 fire-and-forget 통합 (parseAsync 전, 비차단)
- 11개 단위 테스트 전체 통과

## Task Commits

Each task was committed atomically:

1. **Task 1: update-notify 모듈 + CLI 통합 + 테스트** - `b03eba2` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `packages/cli/src/utils/update-notify.ts` - CLI 업그레이드 알림 모듈 (checkAndNotifyUpdate export)
- `packages/cli/src/index.ts` - fire-and-forget 알림 호출 + --quiet argv 사전 파싱
- `packages/cli/src/__tests__/update-notify.test.ts` - 11개 단위 테스트 (알림, dedup, quiet, env, 포트, 에러)

## Decisions Made
- 파일 기반 mtime dedup (.last-update-notify) 채택: 데몬이 꺼져 있어도 CLI는 독립적으로 dedup 가능
- AbortSignal.timeout(2000ms) 페치 타임아웃: CLI 시작 지연을 2초 이내로 제한
- process.stderr.write 사용: stdout을 오염시키지 않아 파이프/리다이렉트 안전
- resolvePort에 간단한 regex 파싱 사용: TOML 파서 의존성 추가 없이 config.toml에서 포트 확인

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- update-notify 모듈 완성, 161-02 (upgrade 명령어)에서 `waiaas upgrade` 구현 시 활용 가능
- /health endpoint가 updateAvailable=true를 반환하면 알림이 자동 출력됨

## Self-Check: PASSED

All created files verified on disk. Commit b03eba2 exists in git log.

---
*Phase: 161-cli-upgrade*
*Completed: 2026-02-17*
