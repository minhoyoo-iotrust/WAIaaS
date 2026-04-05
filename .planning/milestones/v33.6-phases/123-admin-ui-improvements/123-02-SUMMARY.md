---
phase: 123-admin-ui-improvements
plan: 02
subsystem: ui, api
tags: [admin, preact, signals, wallet-balance, sessions, drizzle, openapi]

requires:
  - phase: 123-01
    provides: StatCard 링크 + 대시보드 개선
provides:
  - Admin 월렛 잔액/트랜잭션 API (GET /admin/wallets/:id/balance, /transactions)
  - 세션 전체 조회 (walletId 미지정 시 전체 반환) + walletName JOIN
  - 세션 UI 전체 목록 즉시 조회 + Wallet 컬럼
  - 월렛 상세 Balance 섹션 + Recent Transactions 테이블
affects: [admin-ui, sessions, wallet-detail]

tech-stack:
  added: []
  patterns:
    - Admin 월렛 하위 리소스 API 패턴 (/admin/wallets/:id/*)
    - leftJoin으로 관계 데이터 조회 (sessions -> wallets)

key-files:
  created: []
  modified:
    - packages/daemon/src/api/routes/sessions.ts
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/server.ts
    - packages/admin/src/api/endpoints.ts
    - packages/admin/src/pages/sessions.tsx
    - packages/admin/src/pages/wallets.tsx

key-decisions:
  - "walletId 미지정 세션 조회에서 leftJoin으로 walletName 포함 -- 프론트엔드 추가 요청 최소화"
  - "getAssets()로 토큰 잔액 조회 -- tokenRegistry 별도 조회 불필요"
  - "잔액 API 실패 시 200 + error 필드 반환 -- 에러 격리로 UI 안정성 확보"
  - "wallet.defaultNetwork ?? getDefaultNetwork(chain, environment) 폴백 -- 기존 네트워크 해석 패턴 유지"

patterns-established:
  - "Admin 월렛 하위 리소스 API: /admin/wallets/:id/* 패턴으로 masterAuth 와일드카드 적용"
  - "세션 조회 optional walletId: 조건 배열에 동적 push로 필터 구성"

duration: 6min
completed: 2026-02-15
---

# Phase 123 Plan 02: Admin 월렛 잔액/트랜잭션 + 세션 전체 조회 Summary

**월렛 상세에 네이티브/토큰 잔액 + 트랜잭션 테이블 추가, 세션 페이지에서 전체 세션 즉시 조회 + walletName 컬럼 표시**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-15T01:05:30Z
- **Completed:** 2026-02-15T01:12:16Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- GET /v1/sessions에서 walletId 미지정 시 전체 세션 반환 + walletName JOIN 추가
- GET /v1/admin/wallets/:id/balance (네이티브+토큰 잔액) 및 /transactions (최근 내역) API 추가
- 세션 페이지 진입 시 전체 세션 즉시 표시, Wallet 컬럼으로 어느 월렛 세션인지 확인 가능
- 월렛 상세에 Balance 섹션 (네이티브 + 토큰) 및 Recent Transactions 테이블 추가

## Task Commits

1. **Task 1: 세션 전체 조회 API + walletName + Admin 월렛 잔액/트랜잭션 API** - `a41b8a7` (feat)
2. **Task 2: 세션 전체 조회 UI + 월렛 상세 잔액/트랜잭션 UI** - `72c7572` (feat)

## Files Created/Modified

- `packages/daemon/src/api/routes/sessions.ts` - walletId optional 분기 + leftJoin wallets + walletName 응답 추가
- `packages/daemon/src/api/routes/admin.ts` - GET /admin/wallets/:id/balance + /transactions 2개 엔드포인트 추가
- `packages/daemon/src/api/routes/openapi-schemas.ts` - SessionListItemSchema에 walletName 필드 추가
- `packages/daemon/src/api/server.ts` - adminRoutes에 adapterPool/daemonConfig 전달 + masterAuth 와일드카드
- `packages/admin/src/api/endpoints.ts` - ADMIN_WALLET_BALANCE, ADMIN_WALLET_TRANSACTIONS 상수 추가
- `packages/admin/src/pages/sessions.tsx` - 전체 세션 즉시 조회 + Wallet 컬럼 + "All Wallets" 드롭다운
- `packages/admin/src/pages/wallets.tsx` - Balance 섹션 + Recent Transactions 테이블 추가

## Decisions Made

- walletId 미지정 세션 조회에서 leftJoin으로 walletName 포함 -- 프론트엔드 추가 요청 최소화
- getAssets()로 토큰 잔액 조회 -- tokenRegistry 별도 조회 불필요, IChainAdapter 인터페이스 활용
- 잔액 API 실패 시 200 + error 필드 반환 -- 에러 격리로 UI 안정성 확보 (RPC 연결 실패해도 크래시 없음)
- wallet.defaultNetwork ?? getDefaultNetwork(chain, environment) 폴백 -- 기존 네트워크 해석 패턴 유지

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] wallet.network 필드 부재 수정**
- **Found during:** Task 1
- **Issue:** Plan에서 `wallet.network` 참조했으나 wallets 테이블에는 `network` 컬럼 없음 (v1.4.5에서 `defaultNetwork`으로 통합)
- **Fix:** `wallet.defaultNetwork ?? getDefaultNetwork(chain, environment)` 폴백 패턴 사용
- **Files modified:** packages/daemon/src/api/routes/admin.ts
- **Verification:** `pnpm --filter @waiaas/daemon build` 성공
- **Committed in:** a41b8a7

**2. [Rule 3 - Blocking] tokenRegistry import 제거**
- **Found during:** Task 1
- **Issue:** Plan에서 tokenRegistry import 지시했으나 getAssets() 사용으로 불필요 -- unused import 빌드 에러
- **Fix:** tokenRegistry import 제거, getAssets()만 사용
- **Files modified:** packages/daemon/src/api/routes/admin.ts
- **Verification:** 빌드 성공, getAssets()로 동일 기능 제공
- **Committed in:** a41b8a7

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** 두 수정 모두 빌드 성공을 위해 필수. 기능 범위 변경 없음.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 123 (Admin UI 개선) 전체 완료
- ADUI-04 ~ ADUI-07 요구사항 충족
- 다음 phase로 진행 가능

## Self-Check: PASSED

- All 7 modified files exist on disk
- Both task commits (a41b8a7, 72c7572) verified in git log
- All 5 must_have artifact patterns verified

---
*Phase: 123-admin-ui-improvements*
*Completed: 2026-02-15*
