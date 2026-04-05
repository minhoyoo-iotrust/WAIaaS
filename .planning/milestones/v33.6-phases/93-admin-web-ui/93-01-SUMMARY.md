---
phase: 93-admin-web-ui
plan: 01
subsystem: ui
tags: [preact, admin, wallet, rename, terminology]

# Dependency graph
requires:
  - phase: 92-mcp-cli-sdk
    provides: MCP/CLI/SDK wallet terminology rename
provides:
  - Admin Web UI with wallet terminology (15 files renamed)
  - Wallets page (renamed from Agents)
  - API endpoint constants /v1/wallets
  - Error messages WALLET_NOT_FOUND/SUSPENDED/TERMINATED
affects: [documentation, admin-web-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - packages/admin/src/pages/wallets.tsx (renamed from agents.tsx)
    - packages/admin/src/__tests__/wallets.test.tsx (renamed from agents.test.tsx)
    - packages/admin/src/api/endpoints.ts
    - packages/admin/src/components/layout.tsx
    - packages/admin/src/pages/dashboard.tsx
    - packages/admin/src/pages/sessions.tsx
    - packages/admin/src/pages/policies.tsx
    - packages/admin/src/pages/notifications.tsx
    - packages/admin/src/pages/settings.tsx
    - packages/admin/src/utils/error-messages.ts
    - packages/admin/src/styles/global.css

key-decisions:
  - "Admin UI wallet terminology matches backend /v1/wallets API (zero shimming)"

patterns-established: []

# Metrics
duration: 8min
completed: 2026-02-13
---

# Phase 93 Plan 01: Admin Web UI Wallet Terminology Rename Summary

**Admin UI agent->wallet rename across 15 files: endpoints, pages, tests, CSS selectors, error messages**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-13T01:55:16Z
- **Completed:** 2026-02-13T02:03:31Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Renamed agents.tsx to wallets.tsx with comprehensive content changes (interfaces, signals, functions, JSX, exports)
- Updated all 10 Admin UI source files: endpoints, layout, dashboard, sessions, policies, notifications, settings, error-messages, global.css
- Renamed agents.test.tsx to wallets.test.tsx, updated 4 other test files with wallet fixtures
- All 40 admin tests pass (8 test files)
- Zero stale agent references remaining in admin package (verified by grep)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename agent -> wallet in Admin UI source files (11 files)** - `2e9aee8` (feat)
2. **Task 2: Rename agent -> wallet in Admin test files (5 files)** - `34cf5cb` (test)

## Files Created/Modified
- `packages/admin/src/pages/wallets.tsx` - Wallets list + detail page (renamed from agents.tsx)
- `packages/admin/src/__tests__/wallets.test.tsx` - Wallets page tests (renamed from agents.test.tsx)
- `packages/admin/src/api/endpoints.ts` - WALLETS/WALLET endpoint constants
- `packages/admin/src/components/layout.tsx` - Navigation, routes, page titles using /wallets
- `packages/admin/src/pages/dashboard.tsx` - walletCount stat card
- `packages/admin/src/pages/sessions.tsx` - Wallet select dropdown, walletId in session creation
- `packages/admin/src/pages/policies.tsx` - Wallet filter, walletId in policy form
- `packages/admin/src/pages/notifications.tsx` - walletId in log entry display
- `packages/admin/src/pages/settings.tsx` - "wallet operations" text in kill switch description
- `packages/admin/src/utils/error-messages.ts` - WALLET_NOT_FOUND/SUSPENDED/TERMINATED error codes
- `packages/admin/src/styles/global.css` - .wallet-detail, .session-wallet-select CSS selectors
- `packages/admin/src/__tests__/dashboard.test.tsx` - walletCount fixture
- `packages/admin/src/__tests__/sessions.test.tsx` - walletId fixtures, Wallet label assertions
- `packages/admin/src/__tests__/policies.test.tsx` - walletId fixtures, mockWallets
- `packages/admin/src/__tests__/notifications.test.tsx` - walletId in log entry fixtures

## Decisions Made
- Admin UI wallet terminology matches backend /v1/wallets API directly (no backward-compat shims needed since admin is bundled with daemon)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin Web UI fully aligned with wallet terminology
- All packages in the monorepo now use wallet terminology consistently
- Ready for documentation cleanup or further feature development

## Self-Check: PASSED

- FOUND: packages/admin/src/pages/wallets.tsx
- FOUND: packages/admin/src/__tests__/wallets.test.tsx
- CONFIRMED: agents.tsx removed
- CONFIRMED: agents.test.tsx removed
- FOUND: commit 2e9aee8
- FOUND: commit 34cf5cb

---
*Phase: 93-admin-web-ui*
*Completed: 2026-02-13*
