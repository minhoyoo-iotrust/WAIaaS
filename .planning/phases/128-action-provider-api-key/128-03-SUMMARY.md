---
phase: 128-action-provider-api-key
plan: 03
subsystem: api, lifecycle, pipeline
tags: [rest-api, openapi, action-provider, pipeline-integration, daemon-lifecycle]

# Dependency graph
requires:
  - phase: 128-01
    provides: ActionProviderRegistry (register/getAction/listProviders/executeResolve)
  - phase: 128-02
    provides: ApiKeyStore (set/get/has/delete/listAll)
provides:
  - POST /v1/actions/:provider/:action REST API (resolve -> 6-stage pipeline)
  - GET /v1/actions/providers REST API (프로바이더 목록 + API 키 상태)
  - DaemonLifecycle Step 4f (ActionProviderRegistry + ApiKeyStore fail-soft 초기화)
  - CreateAppDeps에 actionProviderRegistry/apiKeyStore optional 추가
affects: [128-04 (Admin UI + MCP), 129 (MCP Action Tools)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolve-then-pipeline: ActionProviderRegistry.executeResolve() -> ContractCallRequest -> 기존 Stage 1-6 파이프라인 주입"
    - "sessionAuth + actionRoutes: /v1/actions/* 경로 sessionAuth 미들웨어 보호"
    - "Step 4f fail-soft: DaemonLifecycle에서 ActionProviderRegistry + ApiKeyStore 초기화 실패 시 데몬 시작 중단 없음"

key-files:
  created:
    - packages/daemon/src/api/routes/actions.ts
    - packages/daemon/src/__tests__/api-actions.test.ts
  modified:
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/lifecycle/daemon.ts

key-decisions:
  - "ContractCallRequest를 PipelineContext.request로 직접 주입 -- Stage 1이 type: CONTRACT_CALL 5-type 스키마로 검증"
  - "Stages 2-6는 transactions/send와 동일한 fire-and-forget 비동기 패턴 (201 즉시 반환)"
  - "resolve() 실패 시 WAIaaSError가 아닌 에러는 ACTION_RESOLVE_FAILED(502)로 래핑"
  - "GET /actions/providers에서 apiKeyStore.has()로 각 프로바이더의 키 설정 여부 포함"

patterns-established:
  - "action-route-pattern: sessionAuth -> 액션 조회 -> API키 확인 -> resolve() -> 네트워크 해석 -> 파이프라인 주입"
  - "Step 4f: ESM 플러그인 디렉토리 존재 시 loadPlugins() 호출, 없으면 스킵"

# Metrics
duration: 6min
completed: 2026-02-15
---

# Phase 128 Plan 03: POST /v1/actions/:provider/:action REST API + DaemonLifecycle Step 4f Summary

**Actions REST API 2개 라우트 + DaemonLifecycle Step 4f 초기화 + 11개 통합 테스트 (pipeline 연동 포함)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-15T08:58:12Z
- **Completed:** 2026-02-15T09:04:02Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- POST /v1/actions/:provider/:action 라우트: resolve() -> ContractCallRequest -> 기존 6-stage 파이프라인 주입 (sessionAuth 보호)
- GET /v1/actions/providers 라우트: 등록 프로바이더 목록 + 액션 정보 + hasApiKey 상태 반환
- DaemonLifecycle Step 4f: ActionProviderRegistry + ApiKeyStore fail-soft 초기화 + ESM 플러그인 로드
- CreateAppDeps에 actionProviderRegistry/apiKeyStore optional 필드 추가
- 에러 처리: ACTION_NOT_FOUND(404), API_KEY_REQUIRED(403), ACTION_VALIDATION_FAILED(400), ACTION_RESOLVE_FAILED(502)
- 11개 통합 테스트 전체 통과 + 기존 daemon 1080개 테스트 회귀 없음

## Task Commits

Each task was committed atomically:

1. **Task 1: DaemonLifecycle Step 4f + CreateAppDeps 확장 + actions.ts 라우트** - `a0c9aa3` (feat)
2. **Task 2: Actions REST API 통합 테스트 11개** - `cf8dc2c` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/actions.ts` - actions.ts 신규 (GET /actions/providers, POST /actions/:provider/:action)
- `packages/daemon/src/api/server.ts` - CreateAppDeps 확장 + sessionAuth /v1/actions/* + actionRoutes 등록
- `packages/daemon/src/lifecycle/daemon.ts` - Step 4f: ActionProviderRegistry + ApiKeyStore fail-soft 초기화
- `packages/daemon/src/__tests__/api-actions.test.ts` - 11개 통합 테스트 신규

## Decisions Made
- **ContractCallRequest 직접 주입:** resolve() 결과를 PipelineContext.request로 직접 전달. Stage 1에서 5-type discriminatedUnion으로 검증됨 (type: CONTRACT_CALL)
- **fire-and-forget 비동기:** transactions/send와 동일 패턴 -- Stage 1 후 201 반환, Stages 2-6 비동기 실행
- **ACTION_RESOLVE_FAILED 래핑:** resolve()에서 WAIaaSError가 아닌 예외 발생 시 502 ACTION_RESOLVE_FAILED로 변환
- **hasApiKey 포함:** GET /actions/providers에서 각 프로바이더의 apiKeyStore.has() 결과를 포함하여 UI에서 키 설정 여부 표시 가능

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing tsc error in action-provider-registry.ts line 130 (string | undefined type) -- Plan 01에서 발생한 것으로 현재 변경과 무관

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- actions.ts 라우트와 DaemonLifecycle Step 4f가 완성되어 Plan 04 (Admin UI API 키 관리 + MCP 도구 노출)의 토대가 마련됨
- CreateAppDeps에 actionProviderRegistry/apiKeyStore가 추가되어 adminRoutes에서도 접근 가능

## Self-Check: PASSED

- [x] packages/daemon/src/api/routes/actions.ts -- FOUND
- [x] packages/daemon/src/__tests__/api-actions.test.ts -- FOUND
- [x] Commit a0c9aa3 -- FOUND
- [x] Commit cf8dc2c -- FOUND

---
*Phase: 128-action-provider-api-key*
*Plan: 03*
*Completed: 2026-02-15*
