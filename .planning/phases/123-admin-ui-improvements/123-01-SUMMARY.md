---
phase: 123-admin-ui-improvements
plan: 01
subsystem: ui, api
tags: [preact, admin-dashboard, openapi, drizzle, stat-card, table]

# Dependency graph
requires:
  - phase: 81-admin-ui
    provides: 기본 대시보드 StatCard 컴포넌트, Table 컴포넌트
  - phase: 104-admin-settings
    provides: AdminStatusResponseSchema, statusRoute 핸들러
provides:
  - 확장된 /admin/status API (policyCount, recentTxCount, failedTxCount, recentTransactions)
  - 클릭 가능한 StatCard (href prop으로 페이지 이동)
  - 대시보드 추가 카드 (Policies, Recent Txns, Failed Txns)
  - 최근 활동 5건 테이블
affects: [admin-dashboard, admin-api, dashboard-enhancement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "StatCard href prop: <a> 래핑으로 hash 라우팅 연동"
    - "LEFT JOIN wallets로 트랜잭션에 walletName 포함"

key-files:
  created: []
  modified:
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/admin/src/pages/dashboard.tsx

key-decisions:
  - "StatCard href는 hash 라우팅(#/wallets 등) 사용 -- SPA 라우팅과 일치"
  - "createdAt 필드를 epoch seconds로 변환하여 응답 -- 기존 API 패턴 유지"
  - "Failed Txns 뱃지: 0건=success, 1건+=danger -- 시각적 즉시 인지 가능"

patterns-established:
  - "StatCard with optional href: 링크가 필요한 카드는 href prop만 추가"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 123 Plan 01: Dashboard Enhancement Summary

**admin/status API에 정책/트랜잭션 통계 추가 + 대시보드 StatCard 링크/추가 카드/최근 활동 테이블 구현**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T00:59:06Z
- **Completed:** 2026-02-15T01:02:31Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- GET /v1/admin/status에 policyCount, recentTxCount, failedTxCount, recentTransactions 필드 추가
- Wallets/Sessions/Policies StatCard 클릭 시 해당 관리 페이지로 이동
- Policies, Recent Txns (24h), Failed Txns (24h) 추가 StatCard 표시
- 최근 트랜잭션 5건을 Table 컴포넌트로 표시 (시간, 월렛, 타입, 금액, 상태)
- Failed Txns 0건이면 success 뱃지, 1건 이상이면 danger 뱃지

## Task Commits

Each task was committed atomically:

1. **Task 1: /admin/status API 응답 확장** - `2413907` (feat)
2. **Task 2: 대시보드 StatCard 링크 + 추가 카드 + 최근 활동 UI** - `c1422fb` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/openapi-schemas.ts` - AdminStatusResponseSchema에 policyCount/recentTxCount/failedTxCount/recentTransactions 추가
- `packages/daemon/src/api/routes/admin.ts` - statusRoute 핸들러에 policies/transactions 쿼리 추가, LEFT JOIN으로 walletName 포함
- `packages/admin/src/pages/dashboard.tsx` - StatCard href prop, 추가 카드 3개, Recent Activity 테이블

## Decisions Made
- StatCard href는 hash 라우팅(`#/wallets` 등)을 사용하여 SPA 라우팅과 일치시킴
- createdAt는 epoch seconds로 변환하여 응답 (기존 API 패턴 일관성)
- Failed Txns 뱃지는 0건=success, 1건+=danger로 즉시 시각적 인지 가능하게 함
- StatCard 링크에 화살표 힌트(`→`) 추가하여 클릭 가능함을 표시

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 대시보드 개선 완료, 다음 플랜(123-02)으로 진행 가능
- 기존 17개 admin 테스트 모두 통과 확인

## Self-Check: PASSED

- FOUND: packages/daemon/src/api/routes/admin.ts
- FOUND: packages/daemon/src/api/routes/openapi-schemas.ts
- FOUND: packages/admin/src/pages/dashboard.tsx
- FOUND: commit 2413907 (Task 1)
- FOUND: commit c1422fb (Task 2)

---
*Phase: 123-admin-ui-improvements*
*Completed: 2026-02-15*
