---
phase: 128-action-provider-api-key
plan: 04
subsystem: api, admin-ui
tags: [admin, api-keys, crud, masterAuth, preact, openapi]

# Dependency graph
requires:
  - phase: 128-02
    provides: ApiKeyStore (set/get/getMasked/has/delete/listAll)
  - phase: 128-01
    provides: ActionProviderRegistry (listProviders)
provides:
  - GET /v1/admin/api-keys (프로바이더별 키 상태 마스킹 반환)
  - PUT /v1/admin/api-keys/:provider (API 키 암호화 저장)
  - DELETE /v1/admin/api-keys/:provider (API 키 삭제)
  - Admin UI API Keys 섹션 (입력/수정/삭제 + 경고 배지)
affects: [128-03 (Action Provider 실행 시 API 키 주입)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AdminRouteDeps 확장 패턴: optional DI로 apiKeyStore/actionProviderRegistry 주입"
    - "ApiKeysSection: useSignal 기반 상태 + fetchApiKeys/handleSaveApiKey/handleDeleteApiKey"

key-files:
  created:
    - packages/daemon/src/__tests__/api-admin-api-keys.test.ts
  modified:
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/server.ts
    - packages/admin/src/api/endpoints.ts
    - packages/admin/src/pages/settings.tsx

key-decisions:
  - "AdminRouteDeps에 apiKeyStore/actionProviderRegistry를 optional로 추가하여 하위 호환 유지"
  - "GET /admin/api-keys에서 registry.listProviders()와 apiKeyStore.listAll()을 조합하여 프로바이더별 상태 반환"
  - "DELETE 미존재 키 시 ACTION_NOT_FOUND(404) 반환 -- 기존 에러 코드 재사용"
  - "ApiKeysSection을 DaemonSettings 아래에 배치 -- 프로바이더 미등록 시 자동 숨김"

patterns-established:
  - "admin.ts에서 ActionProviderRegistry + ApiKeyStore 조합 패턴"
  - "Admin UI settings.tsx에서 독립 fetch/save/delete API Keys 섹션"

# Metrics
duration: 6min
completed: 2026-02-15
---

# Phase 128 Plan 04: Admin UI API Keys CRUD + REST API Summary

**Admin UI API Keys 섹션 + GET/PUT/DELETE /v1/admin/api-keys REST API (masterAuth 보호, 마스킹 반환, 10 tests)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-15T08:58:25Z
- **Completed:** 2026-02-15T09:04:18Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- admin.ts에 3개 API Keys 라우트 추가 (GET 목록 + PUT 설정/수정 + DELETE 삭제)
- server.ts에 masterAuth 미들웨어 등록 (/v1/admin/api-keys, /v1/admin/api-keys/*)
- Admin UI settings.tsx에 ApiKeysSection 컴포넌트 추가 (프로바이더별 키 입력/수정/삭제)
- requiresApiKey=true + 키 미설정 시 "Required" 경고 배지 표시
- endpoints.ts에 ADMIN_API_KEYS/ADMIN_API_KEY 상수 추가
- 10개 통합 테스트 작성 (CRUD 7 + 인증 3) + 기존 1059개 테스트 전체 통과

## Task Commits

Each task was committed atomically:

1. **Task 1: GET/PUT/DELETE /v1/admin/api-keys REST API + 통합 테스트** - `d5702ac` (feat)
2. **Task 2: Admin UI API Keys 섹션 + 엔드포인트 상수** - `c6ad400` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/admin.ts` - 3개 API Keys 라우트 + AdminRouteDeps 확장
- `packages/daemon/src/api/server.ts` - masterAuth 등록 + apiKeyStore/registry 전달
- `packages/daemon/src/__tests__/api-admin-api-keys.test.ts` - 10개 통합 테스트 (NEW)
- `packages/admin/src/api/endpoints.ts` - ADMIN_API_KEYS/ADMIN_API_KEY 상수 추가
- `packages/admin/src/pages/settings.tsx` - ApiKeysSection 컴포넌트 + API Keys 상태/핸들러

## Decisions Made
- AdminRouteDeps에 apiKeyStore/actionProviderRegistry를 optional로 추가하여 하위 호환 유지
- GET /admin/api-keys에서 registry.listProviders()와 apiKeyStore.listAll()을 조합하여 프로바이더별 상태 반환
- DELETE 미존재 키 시 ACTION_NOT_FOUND(404) 반환 -- 기존 에러 코드 재사용
- ApiKeysSection을 DaemonSettings 아래에 배치 -- 프로바이더 미등록 시 자동 숨김 (length === 0)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ActionDefinition mock에 chain/riskLevel/defaultTier 필드 추가**
- **Found during:** Task 1 (테스트 실행)
- **Issue:** Mock IActionProvider의 ActionDefinition에 필수 필드 누락으로 Zod 검증 실패
- **Fix:** createMockProvider에 chain: 'solana', riskLevel: 'low', defaultTier: 'INSTANT' 추가
- **Files modified:** api-admin-api-keys.test.ts
- **Committed in:** d5702ac (Task 1 commit)

**2. [Rule 1 - Bug] FormField에 필수 label 속성 추가**
- **Found during:** Task 2 (TypeScript 타입 체크)
- **Issue:** FormField 컴포넌트의 label 속성이 required인데 API Key 입력 필드에서 누락
- **Fix:** label="API Key" 추가
- **Files modified:** settings.tsx
- **Committed in:** c6ad400 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** 테스트/타입 검증 시 발견된 필수 필드 누락. 범위 확장 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API Keys CRUD가 완전히 동작하여 Action Provider 실행 시 키 주입 준비 완료
- Admin UI에서 프로바이더별 키 관리 가능

---
*Phase: 128-action-provider-api-key*
*Completed: 2026-02-15*
