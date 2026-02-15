---
phase: 128-action-provider-api-key
plan: 01
subsystem: action-provider
tags: [zod, action-provider, esm-plugin, registry, contract-call]

# Dependency graph
requires:
  - phase: 125-price-oracle-interface
    provides: IPriceOracle Zod SSoT 패턴 (동일 interfaces/ 디렉토리 구조)
provides:
  - IActionProvider 인터페이스 (Zod SSoT) + 3개 스키마 (ActionProviderMetadata, ActionDefinition, ActionContext)
  - ActionProviderRegistry (register/unregister/getAction/listProviders/executeResolve/loadPlugins)
  - API_KEY_REQUIRED 에러 코드 (ACTION 도메인, HTTP 403)
affects: [128-02-api-key-store, 128-03-rest-api, 128-04-admin-mcp, 129-mcp-action-tools]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IActionProvider Zod SSoT 인터페이스 패턴 (IPriceOracle과 동일 구조)"
    - "ActionProviderRegistry 등록/조회/실행 + ContractCallRequestSchema.parse() 반환값 재검증"
    - "inputSchema 덕 타이핑 검증 (typeof parse/safeParse === 'function') -- 크로스 Zod 버전 호환"
    - "ESM 플러그인 로드 (pathToFileURL + dynamic import) + fail-open 개별 실패 처리"

key-files:
  created:
    - packages/core/src/interfaces/action-provider.types.ts
    - packages/daemon/src/infrastructure/action/action-provider-registry.ts
    - packages/daemon/src/infrastructure/action/index.ts
    - packages/daemon/src/__tests__/action-provider-registry.test.ts
  modified:
    - packages/core/src/interfaces/index.ts
    - packages/core/src/index.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts

key-decisions:
  - "inputSchema를 z.any()로 정의하고 register() 시 덕 타이핑 검증 (typeof parse/safeParse === 'function') -- 크로스 Zod 버전 호환성 확보"
  - "ActionProviderRegistry를 infrastructure/action/ 디렉토리에 배치 (설계 문서 62의 services/ 대신 기존 코드베이스 컨벤션 준수)"
  - "ContractCallRequest.from 검증 스킵 (현행 스키마에 from 필드 없음, Stage 5에서 자동 설정)"
  - "ESM 플러그인 로드 시 fail-open 패턴 (개별 실패 시 warn 로그 + 건너뛰기, 전체 데몬 시작 중단 방지)"

patterns-established:
  - "resolve-then-execute: Action Provider resolve() -> ContractCallRequest -> 기존 파이프라인 Stage 1-6 주입"
  - "validate-then-trust: ESM 플러그인 로드 시 Zod 스키마 + 덕 타이핑으로 구조적 검증 후 신뢰"

# Metrics
duration: 17min
completed: 2026-02-15
---

# Phase 128 Plan 01: IActionProvider + ActionProviderRegistry Summary

**IActionProvider Zod SSoT 인터페이스 3개 스키마 + ActionProviderRegistry 등록/조회/실행/ESM 로드 구현 (20 tests)**

## Performance

- **Duration:** 17 min
- **Started:** 2026-02-15T08:33:56Z
- **Completed:** 2026-02-15T08:51:25Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- IActionProvider 인터페이스 + ActionProviderMetadataSchema/ActionDefinitionSchema/ActionContextSchema Zod SSoT 정의 (core 패키지)
- ActionProviderRegistry 구현: register/unregister/getAction/listProviders/listActions/getMcpExposedActions/executeResolve/loadPlugins 8개 메서드
- executeResolve()가 입력 검증 + resolve() 호출 + ContractCallRequestSchema.parse() 반환값 재검증으로 정책 우회 차단
- API_KEY_REQUIRED 에러 코드 추가 (ACTION 도메인, HTTP 403) + i18n en/ko 메시지
- 20개 단위 테스트 전체 통과

## Task Commits

Each task was committed atomically:

1. **Task 1: IActionProvider Zod SSoT 타입 정의 + API_KEY_REQUIRED 에러 코드** - `8625f48` (feat)
2. **Task 2: ActionProviderRegistry 구현 + 단위 테스트** - `992bb8c` (feat)

## Files Created/Modified
- `packages/core/src/interfaces/action-provider.types.ts` - IActionProvider, ActionProviderMetadata/ActionDefinition/ActionContext Zod SSoT
- `packages/daemon/src/infrastructure/action/action-provider-registry.ts` - ActionProviderRegistry 8개 메서드 (register/unregister/getAction/listProviders/listActions/getMcpExposedActions/executeResolve/loadPlugins)
- `packages/daemon/src/infrastructure/action/index.ts` - barrel export
- `packages/daemon/src/__tests__/action-provider-registry.test.ts` - 20개 단위 테스트
- `packages/core/src/interfaces/index.ts` - action-provider.types re-export 추가
- `packages/core/src/index.ts` - IActionProvider/ActionProviderMetadata/ActionDefinition/ActionContext type + 3개 Schema re-export 추가
- `packages/core/src/errors/error-codes.ts` - API_KEY_REQUIRED 에러 코드 추가 (ACTION domain 7->8)
- `packages/core/src/i18n/en.ts` - API_KEY_REQUIRED English message
- `packages/core/src/i18n/ko.ts` - API_KEY_REQUIRED Korean message

## Decisions Made
- **inputSchema 덕 타이핑 검증:** z.instanceof(z.ZodObject) 대신 typeof parse/safeParse === 'function' 검사. 플러그인이 다른 zod 버전을 사용해도 호환됨
- **infrastructure/action/ 디렉토리:** 설계 문서 62가 services/ 제안했으나, 코드베이스에 services/ 패턴이 없으므로 기존 infrastructure/ 컨벤션 준수
- **from 필드 검증 스킵:** ContractCallRequestSchema에 from 필드가 없으므로 설계 문서 62의 from 검증 의사코드 미적용. 파이프라인 Stage 5에서 지갑 publicKey로 자동 설정
- **ESM 플러그인 fail-open:** 개별 플러그인 로드 실패 시 전체 데몬 시작을 중단하지 않고 warn 로그 후 건너뛰기

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n 파일에 API_KEY_REQUIRED 메시지 누락**
- **Found during:** Task 1 (타입 체크)
- **Issue:** error-codes.ts에 API_KEY_REQUIRED 추가 후 tsc --noEmit 실패 -- en.ts/ko.ts의 Record<ErrorCode, string> 타입에 새 키가 누락
- **Fix:** en.ts에 'API key required for this action provider', ko.ts에 '이 액션 프로바이더에 API 키가 필요합니다' 메시지 추가
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Verification:** tsc --noEmit 성공
- **Committed in:** 8625f48 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** i18n 파일 업데이트는 에러 코드 추가 시 필수 동반 작업. 범위 확장 없음.

## Issues Encountered
- 이 브랜치에 Plan 02의 DB v11 마이그레이션 커밋(4f1c113)이 이미 존재하여 migration-runner.test.ts/settings-schema-migration.test.ts에서 12개 pre-existing 실패 발생. Plan 01의 변경과 무관한 기존 상태.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- IActionProvider 인터페이스와 ActionProviderRegistry가 완성되어 Plan 02(API Key Store)와 Plan 03(REST API)의 토대가 마련됨
- ContractCallRequestSchema.parse()로 resolve() 반환값을 재검증하는 보안 메커니즘이 동작
- ESM 플러그인 로드 메커니즘이 준비되어 ~/.waiaas/actions/ 디렉토리 기반 사용자 플러그인 지원 가능

## Self-Check: PASSED

- [x] packages/core/src/interfaces/action-provider.types.ts -- FOUND
- [x] packages/daemon/src/infrastructure/action/action-provider-registry.ts -- FOUND
- [x] packages/daemon/src/infrastructure/action/index.ts -- FOUND
- [x] packages/daemon/src/__tests__/action-provider-registry.test.ts -- FOUND
- [x] Commit 8625f48 -- FOUND
- [x] Commit 992bb8c -- FOUND

---
*Phase: 128-action-provider-api-key*
*Plan: 01*
*Completed: 2026-02-15*
