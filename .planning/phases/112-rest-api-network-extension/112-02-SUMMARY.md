---
phase: 112-rest-api-network-extension
plan: 02
subsystem: api
tags: [openapi, zod, hono, network, environment, wallet-management]

# Dependency graph
requires:
  - phase: 112-01
    provides: "balance/assets network 쿼리 파라미터, 월렛/트랜잭션 응답 environment/network 필드"
  - phase: 111-pipeline-network-resolution
    provides: "getNetworksForEnvironment, validateNetworkEnvironment 검증 함수"
provides:
  - "PUT /wallets/:id/default-network 기본 네트워크 변경 엔드포인트"
  - "GET /wallets/:id/networks 사용 가능 네트워크 목록 조회 엔드포인트"
  - "ALLOWED_NETWORKS 정책 CRUD 통합 테스트 검증"
affects: [mcp, sdk, skills]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PUT /wallets/:id/default-network: validateNetworkEnvironment 교차 검증 후 DB 업데이트"
    - "GET /wallets/:id/networks: getNetworksForEnvironment + isDefault 플래그 패턴"

key-files:
  created:
    - "packages/daemon/src/__tests__/api-wallet-network.test.ts"
  modified:
    - "packages/daemon/src/api/routes/wallets.ts"
    - "packages/daemon/src/api/routes/openapi-schemas.ts"
    - "packages/daemon/src/api/server.ts"

key-decisions:
  - "PUT default-network에서 WALLET_TERMINATED 상태도 사전 체크 (terminated 월렛 네트워크 변경 차단)"
  - "GET networks 응답에 isDefault 플래그 포함 (클라이언트 편의성)"
  - "masterAuth 미들웨어 sub-path skip 패턴: /owner, /default-network, /networks 통합 처리"

patterns-established:
  - "월렛 서브리소스 엔드포인트 패턴: /wallets/:id/{sub-resource} + masterAuth skip + 개별 등록"

# Metrics
duration: 4min
completed: 2026-02-14
---

# Phase 112 Plan 02: 월렛 네트워크 관리 엔드포인트 Summary

**PUT /wallets/:id/default-network + GET /wallets/:id/networks 엔드포인트와 ALLOWED_NETWORKS 정책 CRUD 통합 검증**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-14T12:52:42Z
- **Completed:** 2026-02-14T12:57:28Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- PUT /wallets/:id/default-network 엔드포인트: 기본 네트워크 변경 + 환경-네트워크 교차 검증
- GET /wallets/:id/networks 엔드포인트: 사용 가능 네트워크 목록 + isDefault 플래그
- OpenAPI 스키마 3개 추가 (UpdateDefaultNetworkRequest/Response, WalletNetworksResponse)
- ALLOWED_NETWORKS 정책 CRUD 통합 테스트 검증 (생성/조회/삭제)
- 전체 모노레포 빌드 + daemon 847 테스트 통과 (회귀 없음)

## Task Commits

Each task was committed atomically:

1. **Task 1: PUT /wallets/:id/default-network + GET /wallets/:id/networks 신규 엔드포인트** - `babb4d1` (feat)
2. **Task 2: 신규 엔드포인트 통합 테스트 + ALLOWED_NETWORKS CRUD 검증** - `228daa1` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/openapi-schemas.ts` - 3개 OpenAPI 스키마 추가 (UpdateDefaultNetwork*, WalletNetworks*)
- `packages/daemon/src/api/routes/wallets.ts` - PUT default-network + GET networks 라우트 정의 및 핸들러
- `packages/daemon/src/api/server.ts` - masterAuth 미들웨어 등록 (default-network, networks sub-path)
- `packages/daemon/src/__tests__/api-wallet-network.test.ts` - 8개 통합 테스트 (네트워크 관리 3 + 네트워크 목록 2 + ALLOWED_NETWORKS CRUD 3)

## Decisions Made
- **WALLET_TERMINATED 사전 체크**: PUT default-network에서 terminated 월렛에 대한 네트워크 변경을 차단. 기존 DELETE /wallets/:id 패턴과 일관성 유지.
- **isDefault 플래그 포함**: GET /wallets/:id/networks 응답에 각 네트워크의 isDefault 여부를 포함하여 클라이언트가 현재 기본 네트워크를 별도 API 호출 없이 확인 가능.
- **masterAuth sub-path 통합**: /owner, /default-network, /networks를 하나의 skip 조건으로 통합하여 중복 미들웨어 등록 방지.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 112 전체 완료 (01 + 02)
- REST API 네트워크 관리 기능 완성: 쿼리 파라미터, 기본 네트워크 변경, 네트워크 목록 조회
- MCP/SDK/Skills 동기화 준비 완료

## Self-Check: PASSED

- FOUND: packages/daemon/src/api/routes/wallets.ts
- FOUND: packages/daemon/src/api/routes/openapi-schemas.ts
- FOUND: packages/daemon/src/api/server.ts
- FOUND: packages/daemon/src/__tests__/api-wallet-network.test.ts
- FOUND: babb4d1 (Task 1 commit)
- FOUND: 228daa1 (Task 2 commit)

---
*Phase: 112-rest-api-network-extension*
*Completed: 2026-02-14*
