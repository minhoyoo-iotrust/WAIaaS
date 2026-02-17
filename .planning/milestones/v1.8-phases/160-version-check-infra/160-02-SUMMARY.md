---
phase: 160-version-check-infra
plan: 02
subsystem: api
tags: [health-endpoint, version-check, semver, schema-version, openapi]

# Dependency graph
requires:
  - phase: 160-01
    provides: VersionCheckService (npm registry latest version check, getLatest/getCheckedAt)
provides:
  - Extended HealthResponseSchema with latestVersion, updateAvailable, schemaVersion
  - createHealthRoute factory function with VersionCheckService DI
  - createApp versionCheckService dependency injection
  - daemon.ts Step 4g (VersionCheckService before HTTP server)
affects: [161-cli-notification-upgrade, 162-compatibility-docker, 164-sync-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [createHealthRoute factory with DI, semver.gt for update detection]

key-files:
  created: []
  modified:
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/health.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/__tests__/api-server.test.ts

key-decisions:
  - "health.ts를 createHealthRoute 팩토리 함수로 리팩토링, 기존 export { health }는 backward compatibility 유지"
  - "daemon.ts에서 VersionCheckService 인스턴스를 Step 4g로 이동 (Step 5 createApp 전)"
  - "semver.gt()로 updateAvailable 판별 (latestVersion이 null이면 항상 false)"

patterns-established:
  - "createHealthRoute DI: health route가 deps 없이도 동작하되, versionCheckService 주입 시 버전 정보 노출"
  - "Step 4g 패턴: Health endpoint에 필요한 서비스는 Step 5(HTTP server) 전에 생성"

requirements-completed: [HLTH-01, HLTH-02]

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 160 Plan 02: Health Endpoint Version Check Summary

**GET /health에 latestVersion(nullable), updateAvailable(bool), schemaVersion(int) 필드 추가 + createHealthRoute 팩토리 DI 패턴**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T00:14:44Z
- **Completed:** 2026-02-17T00:16:45Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- HealthResponseSchema에 latestVersion, updateAvailable, schemaVersion 3개 필드 추가
- health.ts를 createHealthRoute 팩토리 함수로 리팩토링 (VersionCheckService DI, backward compatibility 유지)
- createApp deps에 versionCheckService 추가, createHealthRoute로 전달
- daemon.ts에서 VersionCheckService 인스턴스를 Step 4g로 이동 (Step 5 전에 생성하여 Health endpoint에 제공)
- 4개 신규 테스트 + 1개 기존 테스트 확장 (전체 26개 통과)

## Task Commits

Each task was committed atomically:

1. **Task 1: HealthResponseSchema 확장 + health route 변경 + createApp deps 연결 + 테스트** - `57352eb` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `packages/daemon/src/api/routes/openapi-schemas.ts` - HealthResponseSchema에 latestVersion, updateAvailable, schemaVersion 추가
- `packages/daemon/src/api/routes/health.ts` - createHealthRoute 팩토리 함수 (semver.gt 비교, LATEST_SCHEMA_VERSION 반환)
- `packages/daemon/src/api/server.ts` - CreateAppDeps에 versionCheckService 추가, createHealthRoute 호출로 변경
- `packages/daemon/src/lifecycle/daemon.ts` - Step 4g로 VersionCheckService 생성 이동, createApp에 전달
- `packages/daemon/src/__tests__/api-server.test.ts` - 4개 신규 테스트 (mock service, null service, update available/not available)

## Decisions Made
- health.ts를 createHealthRoute 팩토리 함수로 리팩토링하면서, 기존 `export { health }`는 backward compatibility를 위해 유지 (default export는 빈 deps로 생성)
- VersionCheckService 인스턴스를 daemon.ts Step 4g로 이동 (기존 Step 6에서 생성하던 것을 Step 5 전으로). Step 6에서는 이미 생성된 인스턴스의 check() 핸들러만 worker로 등록
- semver.gt()로 updateAvailable 판별: latestVersion이 null이면 항상 false 반환

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- pre-existing tsc 에러 1건 (security-test-helpers.ts의 crypto_sign_seed_keypair) -- 본 변경과 무관, 기존 알려진 이슈

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- GET /health 응답에 latestVersion, updateAvailable, schemaVersion 필드가 포함됨 -> CLI가 이를 읽어서 업그레이드 알림 표시 가능
- OpenAPI /doc 스펙에 새 필드가 자동 반영됨 -> SDK/MCP가 타입 안전하게 소비 가능
- Phase 160 (버전 체크 인프라) 완료 -> Phase 161 (CLI 알림 + upgrade) 진행 가능

## Self-Check: PASSED

- [x] openapi-schemas.ts contains latestVersion field
- [x] health.ts contains createHealthRoute function
- [x] server.ts contains versionCheckService dep
- [x] daemon.ts contains Step 4g
- [x] api-server.test.ts contains 4 new tests
- [x] Commit 57352eb exists

---
*Phase: 160-version-check-infra*
*Completed: 2026-02-17*
