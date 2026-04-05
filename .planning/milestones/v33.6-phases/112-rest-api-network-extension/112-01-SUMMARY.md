---
phase: 112-rest-api-network-extension
plan: 01
subsystem: api
tags: [openapi, zod, hono, network, environment, query-parameter]

# Dependency graph
requires:
  - phase: 110-schema-policy-engine
    provides: "environment/defaultNetwork 스키마, CreateWalletRequestSchema environment 파라미터"
  - phase: 111-pipeline-network-resolution
    provides: "resolveNetwork 순수 함수, validateNetworkEnvironment 검증"
provides:
  - "GET /wallet/balance?network=X 쿼리 파라미터"
  - "GET /wallet/assets?network=X 쿼리 파라미터"
  - "트랜잭션 응답 network 필드"
  - "월렛 응답 environment 필드 (required)"
affects: [112-02, mcp, sdk, skills]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "network 쿼리 파라미터 + validateNetworkEnvironment 교차 검증 패턴"
    - "응답 스키마 environment 필드 필수화 패턴"

key-files:
  created: []
  modified:
    - "packages/daemon/src/api/routes/wallet.ts"
    - "packages/daemon/src/api/routes/wallets.ts"
    - "packages/daemon/src/api/routes/transactions.ts"
    - "packages/daemon/src/api/routes/openapi-schemas.ts"
    - "packages/daemon/src/__tests__/api-agents.test.ts"

key-decisions:
  - "트랜잭션 응답 network 필드를 Task 1에서 함께 추가 (빌드 차단 해결, Rule 3)"
  - "WalletCrudResponseSchema/WalletOwnerResponseSchema/WalletDetailResponseSchema environment 필드 required로 전환"
  - "api-agents 테스트 6개를 environment 기반으로 전환 (network 파라미터 제거)"

patterns-established:
  - "balance/assets 쿼리 파라미터 패턴: queryNetwork ?? wallet.defaultNetwork fallback"
  - "network 쿼리 시 validateNetworkEnvironment 교차 검증 -> ENVIRONMENT_NETWORK_MISMATCH 에러"

# Metrics
duration: 6min
completed: 2026-02-14
---

# Phase 112 Plan 01: REST API 네트워크 확장 Summary

**balance/assets 엔드포인트 network 쿼리 파라미터 + 월렛/트랜잭션 응답 environment/network 필드 보강**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-14T12:44:39Z
- **Completed:** 2026-02-14T12:50:39Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- GET /wallet/balance?network=X, GET /wallet/assets?network=X 쿼리 파라미터 추가
- 쿼리 파라미터 지정 시 validateNetworkEnvironment 교차 검증, 미지정 시 defaultNetwork fallback
- 트랜잭션 목록/상세/pending 응답에 network 필드 추가
- 월렛 CRUD/상세/owner 응답에 environment 필드 추가 (required)
- api-agents.test.ts 6개 pre-existing 실패 해결
- 전체 daemon 839 테스트 PASS

## Task Commits

Each task was committed atomically:

1. **Task 1: balance/assets network 쿼리 파라미터 + 응답 스키마 보강** - `5bf7d10` (feat)
2. **Task 2: 테스트 수정 + 회귀 확인** - `10fd66a` (fix)

## Files Created/Modified
- `packages/daemon/src/api/routes/openapi-schemas.ts` - TxDetailResponseSchema network 필드, environment required
- `packages/daemon/src/api/routes/wallet.ts` - balance/assets network 쿼리 파라미터 + 검증 로직
- `packages/daemon/src/api/routes/wallets.ts` - POST/GET/PUT /wallets 응답 environment 필드
- `packages/daemon/src/api/routes/transactions.ts` - 목록/상세/pending 응답 network 필드
- `packages/daemon/src/__tests__/api-agents.test.ts` - 6개 테스트 environment 기반으로 전환

## Decisions Made
- **트랜잭션 응답 network 추가를 Task 1에 포함**: TxDetailResponseSchema에 network 필드를 추가하면 transactions.ts 핸들러도 해당 필드를 반환해야 빌드가 통과됨. Rule 3 (blocking issue)로 Task 1에서 함께 처리.
- **environment 필드 required 전환**: optional에서 required로 변경. Phase 110에서 모든 월렛이 environment를 가지므로 nullable일 필요 없음.
- **테스트 환경 파라미터 전환**: 기존 `network` 파라미터 테스트를 `environment` 기반으로 변경. Cross-chain validation 테스트는 invalid environment 검증으로 대체.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 트랜잭션 응답 network 필드를 Task 1에서 추가**
- **Found during:** Task 1 (빌드 검증)
- **Issue:** TxDetailResponseSchema에 network 필드를 추가했으나, TxListResponseSchema/TxPendingListResponseSchema가 이를 참조하여 transactions.ts 핸들러도 network 반환 필요
- **Fix:** transactions.ts GET /transactions, /pending, /:id 응답에 `network: tx.network ?? null` 추가
- **Files modified:** packages/daemon/src/api/routes/transactions.ts
- **Verification:** `pnpm --filter @waiaas/daemon build` 성공
- **Committed in:** 5bf7d10 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Task 2의 트랜잭션 응답 작업을 Task 1에서 선행. Task 2에서 중복 작업 없음. 스코프 변동 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 112-02 (OpenAPI 문서 + 신규 테스트) 진행 준비 완료
- balance/assets 네트워크 쿼리 파라미터 동작 확인
- 전체 빌드/테스트 회귀 없음

---
*Phase: 112-rest-api-network-extension*
*Completed: 2026-02-14*
