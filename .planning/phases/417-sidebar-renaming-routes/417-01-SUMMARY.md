---
phase: 417-sidebar-renaming-routes
plan: 01
subsystem: ui
tags: [preact, sidebar, navigation, routing, search]

requires:
  - phase: none
    provides: first phase in milestone
provides:
  - NAV_SECTIONS 5-section sidebar grouping (Wallets/Trading/Security/Channels/System)
  - Route renaming (DeFi->Providers, Security->Protection, System->Settings)
  - Legacy route redirects (/defi, /security, /system -> new paths)
  - Updated Ctrl+K search index with new paths
affects: [418-page-merge, 419-trading-settings, 420-wallet-detail]

tech-stack:
  added: []
  patterns: [NAV_SECTIONS sectioned sidebar with inline-styled headers]

key-files:
  created: []
  modified:
    - packages/admin/src/components/layout.tsx
    - packages/admin/src/utils/settings-search-index.ts
    - packages/admin/src/components/settings-search.tsx

key-decisions:
  - "Sidebar section headers use inline styles (existing admin UI pattern, no CSS file changes)"
  - "Dashboard kept outside all sections as independent top-level item"
  - "Legacy /tokens and /rpc-proxy pages retained in PAGE_TITLES (Phase 418 will merge them)"

patterns-established:
  - "NAV_SECTIONS: sectioned sidebar with NavSection[] interface for grouped navigation"
  - "renderNavLink helper: extracted reusable nav link renderer with dirty guard support"

requirements-completed: [SIDE-01, SIDE-02, SIDE-03, SIDE-04, SIDE-05, SIDE-06, SIDE-07, SIDE-08, ROUT-01, ROUT-02, ROUT-03, ROUT-04, ROUT-05, ROUT-06, ROUT-07]

duration: 10min
completed: 2026-03-15
---

# Phase 417 Plan 01: NAV_SECTIONS Sidebar + Renaming + Redirects Summary

**5-section grouped sidebar (Wallets/Trading/Security/Channels/System), 4 menu renames, 3 route redirects, Ctrl+K search index sync**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-15T03:13:16Z
- **Completed:** 2026-03-15T03:24:00Z
- **Tasks:** 2
- **Files modified:** 6 (3 source + 3 test)

## Accomplishments
- Converted flat 17-item NAV_ITEMS to 5-section NAV_SECTIONS with uppercase section headers
- Renamed DeFi->Providers, Security->Protection, System->Settings, Human Wallet Apps->Wallet Apps
- Added legacy route redirects: /defi->/providers, /security->/protection, /system->/settings
- Updated SETTINGS_SEARCH_INDEX page paths and PAGE_LABELS for Ctrl+K search consistency

## Task Commits

Each task was committed atomically:

1. **Task 1: NAV_SECTIONS + sidebar rendering + renaming + route redirects** - `175bc66d` (feat)
2. **Task 2: Ctrl+K search index + PAGE_LABELS update** - `817aca11` (feat)

## Files Created/Modified
- `packages/admin/src/components/layout.tsx` - NAV_SECTIONS, PageRouter redirects, renderNavLink helper
- `packages/admin/src/utils/settings-search-index.ts` - Updated page paths and entry IDs
- `packages/admin/src/components/settings-search.tsx` - Updated PAGE_LABELS for breadcrumb display
- `packages/admin/src/__tests__/zero-coverage.test.tsx` - Updated route/title test expectations
- `packages/admin/src/__tests__/settings-search.test.tsx` - Updated mock data and expected values
- `packages/admin/src/__tests__/breadcrumb.test.tsx` - Updated subtitle test paths

## Decisions Made
- Sidebar section headers use inline styles following existing admin UI pattern (no CSS file changes needed)
- Dashboard kept as independent top-level item outside all sections
- Legacy /tokens and /rpc-proxy pages retained in PAGE_TITLES/PAGE_SUBTITLES since Phase 418 will merge them

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated 3 test files for new route paths and titles**
- **Found during:** Task 1 verification
- **Issue:** Tests referenced old route paths (/security, /system) and old page titles (Security, System)
- **Fix:** Updated test expectations, added page mocks for SystemPage and SecurityPage
- **Files modified:** zero-coverage.test.tsx, settings-search.test.tsx, breadcrumb.test.tsx
- **Verification:** All 907 admin tests pass
- **Committed in:** ffbd403a

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test fix was necessary consequence of route renaming. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Section sidebar structure ready for Phase 418 page merging
- Route redirects preserve backward compatibility for existing bookmarks

---
*Phase: 417-sidebar-renaming-routes*
*Completed: 2026-03-15*
