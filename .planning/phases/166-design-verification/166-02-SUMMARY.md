---
phase: 166-design-verification
plan: 02
subsystem: infra
tags: [openapi, swagger-parser, ci, validation, api-spec]

# Dependency graph
requires:
  - phase: 166-design-verification
    provides: "OpenAPI 3.0 스펙을 생성하는 GET /doc 엔드포인트 (Hono OpenAPIHono)"
provides:
  - "OpenAPI 스펙 유효성 자동 검증 스크립트 (scripts/validate-openapi.ts)"
  - "CI stage2에서 OpenAPI 스펙 검증 자동 실행"
  - "pnpm run validate:openapi 로컬 실행 가능"
affects: [api, sdk, mcp]

# Tech tracking
tech-stack:
  added: ["@apidevtools/swagger-parser ^12.1.0", "@types/swagger-schema-official ^2.0.25"]
  patterns: ["createApp() 무의존성 인스턴스로 스펙 추출 후 SwaggerParser.validate() 검증"]

key-files:
  created:
    - scripts/validate-openapi.ts
  modified:
    - package.json
    - pnpm-lock.yaml
    - .github/workflows/ci.yml

key-decisions:
  - "createApp() 무의존성 호출로 스펙 추출 -- 실제 daemon 기동 없이 라우트 등록된 스펙 검증"
  - "dynamic import로 swagger-parser 로드 -- ESM/CJS 호환성 보장"
  - "CI stage2 전용 배치 -- full build 후 전체 라우트 등록 상태에서만 의미"

patterns-established:
  - "OpenAPI 검증 패턴: createApp() -> app.request('/doc') -> SwaggerParser.validate(spec)"

requirements-completed: [VERIFY-03]

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 166 Plan 02: OpenAPI Spec Validation Summary

**swagger-parser 기반 OpenAPI 3.0 스펙 자동 검증 스크립트 + CI stage2 통합**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T04:58:23Z
- **Completed:** 2026-02-17T05:00:31Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `scripts/validate-openapi.ts` 작성: createApp() -> GET /doc -> SwaggerParser.validate() 파이프라인
- `@apidevtools/swagger-parser` devDependency 도입, 현재 스펙 0 errors 통과 확인
- CI stage2에 "Validate OpenAPI Spec" step 추가 (Verify Enum SSoT 직후)
- `pnpm run validate:openapi` 로컬 실행 가능

## Task Commits

Each task was committed atomically:

1. **Task 1: swagger-parser 도입 + 검증 스크립트 작성** - `34d44a4` (feat)
2. **Task 2: CI 파이프라인에 OpenAPI 검증 step 추가** - `6da0308` (ci)

## Files Created/Modified
- `scripts/validate-openapi.ts` - OpenAPI 스펙 유효성 검증 스크립트 (createApp -> /doc -> validate)
- `package.json` - validate:openapi 스크립트 등록 + swagger-parser devDependency
- `pnpm-lock.yaml` - 의존성 잠금 파일 갱신
- `.github/workflows/ci.yml` - stage2에 "Validate OpenAPI Spec" step 추가

## Decisions Made
- createApp() 무의존성 호출로 스펙 추출 -- 실제 daemon 기동이나 DB 없이 /doc 엔드포인트에서 JSON 추출 가능
- dynamic import로 swagger-parser 로드 -- ESM/CJS 호환성 보장
- CI stage2에만 배치 -- full build 이후 전체 라우트가 등록된 상태에서 검증해야 의미 있음

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- VERIFY-03 요구사항 충족
- OpenAPI 스펙 검증이 CI에서 자동 실행되어 회귀 방지 보증
- 향후 라우트 추가 시 스펙 에러가 있으면 CI에서 즉시 감지

## Self-Check: PASSED

- FOUND: scripts/validate-openapi.ts
- FOUND: .github/workflows/ci.yml
- FOUND: 166-02-SUMMARY.md
- FOUND: commit 34d44a4
- FOUND: commit 6da0308

---
*Phase: 166-design-verification*
*Completed: 2026-02-17*
