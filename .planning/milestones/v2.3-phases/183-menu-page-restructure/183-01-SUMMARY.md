---
phase: 183-menu-page-restructure
plan: 01
subsystem: ui
tags: [preact, sidebar, layout, settings, routing]

# Dependency graph
requires:
  - phase: 182-ui-shared-components
    provides: TabNav, FieldGroup, Breadcrumb shared components
provides:
  - 7-menu sidebar layout (Dashboard, Wallets, Sessions, Policies, Notifications, Security, System)
  - Route redirects for legacy /settings and /walletconnect URLs
  - Shared settings-helpers.ts utility module with pure helper functions
  - SecurityPage and SystemPage placeholder routing
affects: [183-02-security-page, 183-03-system-page]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-function extraction for signal-based helpers, placeholder routing for incremental page delivery]

key-files:
  created:
    - packages/admin/src/utils/settings-helpers.ts
  modified:
    - packages/admin/src/components/layout.tsx
    - packages/admin/src/pages/settings.tsx
    - packages/admin/src/__tests__/breadcrumb.test.tsx
    - packages/admin/src/__tests__/zero-coverage.test.tsx

key-decisions:
  - "Extract signal-based helpers as pure functions taking settings+dirty params, wrap in signal accessors inside SettingsPage"
  - "Use inline placeholder components for SecurityPage/SystemPage instead of creating stub files"
  - "Remove unused TelegramUsersPage import since redirect returns NotificationsPage directly"

patterns-established:
  - "Pure settings helpers: getEffectiveValue/getEffectiveBoolValue/isCredentialConfigured take plain data params for reuse across pages"
  - "Route redirect pattern: redirect legacy URLs via window.location.hash assignment and return target page component"

requirements-completed: [MENU-01, MENU-02, MENU-03]

# Metrics
duration: 6min
completed: 2026-02-18
---

# Phase 183 Plan 01: Sidebar + Shared Settings Summary

**7-menu sidebar with Security/System replacing Settings/WalletConnect, plus shared settings-helpers.ts pure utility module for cross-page reuse**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-18T08:06:21Z
- **Completed:** 2026-02-18T08:12:11Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Extracted shared settings types (SettingsData, KillSwitchState, ApiKeyEntry, etc.) and pure helper functions to `settings-helpers.ts`
- Restructured sidebar from 7 items (with WalletConnect/Settings) to 7 items (with Security/System)
- Added route redirects: `/settings` -> `/dashboard`, `/walletconnect` -> `/wallets`
- Added placeholder routing for Security and System pages (to be replaced by plans 02/03)
- All 313 existing admin tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract shared settings helpers to utils/settings-helpers.ts** - `f80bf31` (refactor)
2. **Task 2: Update layout.tsx for 7-menu sidebar + route redirects** - `47cc832` (feat)

## Files Created/Modified
- `packages/admin/src/utils/settings-helpers.ts` - Shared types, constants, and pure helper functions extracted from settings.tsx
- `packages/admin/src/components/layout.tsx` - 7-menu sidebar, placeholder routing for Security/System, legacy URL redirects
- `packages/admin/src/pages/settings.tsx` - Imports from settings-helpers instead of inline definitions
- `packages/admin/src/__tests__/breadcrumb.test.tsx` - Updated subtitle test paths from walletconnect/settings to security/system
- `packages/admin/src/__tests__/zero-coverage.test.tsx` - Updated layout tests for new nav items and redirect behavior

## Decisions Made
- Extracted signal-based helpers as pure functions with explicit parameters (settings, dirty, category, shortKey) so they can be reused in Security and System pages without signal coupling
- Used inline placeholder components in layout.tsx rather than creating separate stub files, since plans 02 and 03 will create the real page components
- Removed unused TelegramUsersPage, WalletConnectPage, and SettingsPage imports from layout.tsx

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated tests referencing removed nav items and routes**
- **Found during:** Task 2 (layout update)
- **Issue:** breadcrumb.test.tsx and zero-coverage.test.tsx had hardcoded nav labels ('WalletConnect', 'Settings') and route expectations (getByTestId('page-walletconnect'))
- **Fix:** Updated test assertions to match new 7-menu structure (Security/System) and redirect behavior
- **Files modified:** packages/admin/src/__tests__/breadcrumb.test.tsx, packages/admin/src/__tests__/zero-coverage.test.tsx
- **Verification:** All 313 tests pass
- **Committed in:** 47cc832 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary test update for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shared settings-helpers.ts ready for import by Security page (plan 02) and System page (plan 03)
- Layout.tsx placeholder components ready to be replaced with real SecurityPage and SystemPage imports
- All routing infrastructure in place for new pages

---
*Phase: 183-menu-page-restructure*
*Completed: 2026-02-18*
