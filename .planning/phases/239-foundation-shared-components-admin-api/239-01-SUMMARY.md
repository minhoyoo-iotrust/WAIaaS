---
phase: 239-foundation-shared-components-admin-api
plan: 01
subsystem: ui
tags: [preact, admin, explorer-link, filter-bar, search-input, debounce, url-sync]

# Dependency graph
requires: []
provides:
  - ExplorerLink component for block explorer tx links (13 networks)
  - FilterBar component with URL hash query param sync
  - SearchInput component with debounced text search
affects: [240-transactions-admin-ui, 241-token-registry-admin-ui, 242-incoming-tx-admin-ui, 243-wallet-detail-admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [inlined explorer URL map for admin SPA isolation, hash-based URL param sync for filter state]

key-files:
  created:
    - packages/admin/src/components/explorer-link.tsx
    - packages/admin/src/components/filter-bar.tsx
    - packages/admin/src/components/search-input.tsx
    - packages/admin/src/__tests__/shared-ui-components.test.tsx
  modified: []

key-decisions:
  - "Inlined EXPLORER_MAP instead of importing from @waiaas/core (admin SPA cannot import backend packages)"
  - "FilterBar uses hash-based URL param sync matching existing preact-router hash routing"

patterns-established:
  - "Admin shared components use functional Preact components with explicit props interfaces"
  - "URL filter sync via hash query params with replaceState (no history pollution)"
  - "Debounced inputs use useRef for timer ID with controlled component pattern"

requirements-completed: [COMP-01, COMP-02, COMP-03]

# Metrics
duration: 3min
completed: 2026-02-22
---

# Phase 239 Plan 01: Shared UI Components Summary

**ExplorerLink (13-network block explorer links), FilterBar (URL-synced select/date filters), and SearchInput (debounced text search with clear) as reusable Preact primitives for Admin UI pages**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-22T14:34:29Z
- **Completed:** 2026-02-22T14:37:08Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created ExplorerLink component supporting all 13 networks from EXPLORER_MAP with truncated hash display and external link rendering
- Created FilterBar component with generic select/date fields, URL hash query param sync, and clear functionality
- Created SearchInput component with configurable debounce, clear button, and controlled input pattern
- 15 tests covering all core behaviors (ExplorerLink: 6, FilterBar: 5, SearchInput: 4)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ExplorerLink, FilterBar, and SearchInput components** - `f1473570` (feat)
2. **Task 2: Write tests for ExplorerLink, FilterBar, and SearchInput** - `fb7eb2f0` (test)

## Files Created/Modified
- `packages/admin/src/components/explorer-link.tsx` - ExplorerLink component with inlined 13-network EXPLORER_MAP, truncation helper, external link rendering
- `packages/admin/src/components/filter-bar.tsx` - Generic FilterBar with select/date fields, URL hash param read/write, clear button
- `packages/admin/src/components/search-input.tsx` - SearchInput with debounced onSearch callback, clear button, controlled input
- `packages/admin/src/__tests__/shared-ui-components.test.tsx` - 15 tests covering all component behaviors

## Decisions Made
- Inlined EXPLORER_MAP from @waiaas/core because admin SPA is a frontend package that cannot import backend core directly (consistent with existing codebase pattern for display-currency, error-messages, chain enums)
- FilterBar uses hash-based URL param sync (parseHashParams/updateHashParams) matching existing preact-router hash routing pattern
- Used replaceState for URL updates to avoid polluting browser history with filter changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Inlined explorer URL map instead of importing from @waiaas/core**
- **Found during:** Task 1 (ExplorerLink implementation)
- **Issue:** Plan specified `import getExplorerTxUrl from @waiaas/core`, but admin SPA cannot import backend packages (no @waiaas/core in admin devDependencies, existing pattern is to inline/mirror)
- **Fix:** Inlined EXPLORER_MAP and getExplorerTxUrl function directly in explorer-link.tsx with comment explaining the mirroring
- **Files modified:** packages/admin/src/components/explorer-link.tsx
- **Verification:** TypeScript compiles, tests pass
- **Committed in:** f1473570 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for correct package isolation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Three shared components ready for use in Phase 240-243 pages
- FilterBar supports any combination of select/date fields via generic FilterField interface
- SearchInput debounce is configurable (default 300ms)
- ExplorerLink handles all 13 supported networks

## Self-Check: PASSED

- [x] explorer-link.tsx exists
- [x] filter-bar.tsx exists
- [x] search-input.tsx exists
- [x] shared-ui-components.test.tsx exists
- [x] Commit f1473570 found
- [x] Commit fb7eb2f0 found

---
*Phase: 239-foundation-shared-components-admin-api*
*Completed: 2026-02-22*
