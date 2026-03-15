---
phase: 419-trading-settings
plan: 01
subsystem: ui
tags: [preact, admin-ui, tab-nav, provider-settings]

requires:
  - phase: 417-sidebar-sections
    provides: TabNav component and section-based sidebar
provides:
  - Settings tab removed from Hyperliquid page (4 tabs only)
  - Settings tab removed from Polymarket page (4 tabs only)
  - Providers page advanced settings for hyperliquid (8 keys) and polymarket (6 keys)
  - Configure in Providers link on both trading pages
affects: [actions, hyperliquid, polymarket]

tech-stack:
  added: []
  patterns: [provider-advanced-settings centralization]

key-files:
  created: []
  modified:
    - packages/admin/src/pages/hyperliquid.tsx
    - packages/admin/src/pages/polymarket.tsx
    - packages/admin/src/pages/actions.tsx
    - packages/admin/src/__tests__/hyperliquid.test.tsx
    - packages/admin/src/__tests__/polymarket.test.tsx

key-decisions:
  - "Settings managed centrally in Providers page via PROVIDER_ADVANCED_SETTINGS map"
  - "SettingsPanel.tsx and PolymarketSettings.tsx kept as dead code (imports removed, not bundled)"
  - "Prediction category added to CATEGORY_ORDER for Polymarket sorting"

patterns-established:
  - "Trading page settings centralization: all provider config via Providers page PROVIDER_ADVANCED_SETTINGS"

requirements-completed: [TRAD-01, TRAD-02, TRAD-03, TRAD-04, TRAD-05]

duration: 2min
completed: 2026-03-15
---

# Phase 419 Plan 01: Settings Tab Removal Summary

**Hyperliquid/Polymarket Settings tab removed, 14 setting keys migrated to Providers page PROVIDER_ADVANCED_SETTINGS**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T03:52:39Z
- **Completed:** 2026-03-15T03:55:04Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Removed Settings tab from Hyperliquid (5 tabs -> 4: Overview/Orders/Spot/Sub-accounts)
- Removed Settings tab from Polymarket (5 tabs -> 4: Overview/Markets/Orders/Positions)
- Added "Configure in Trading > Providers" link at top of both pages
- Migrated 8 Hyperliquid + 6 Polymarket setting keys to PROVIDER_ADVANCED_SETTINGS in actions.tsx
- Added 'Prediction' to CATEGORY_ORDER for proper Polymarket category sorting

## Task Commits

Each task was committed atomically:

1. **Task 1: Settings tab removal + Providers link + settings migration** - `e762b881` (feat)
2. **Task 2: Test updates** - `ec7cc9c6` (test)

## Files Created/Modified
- `packages/admin/src/pages/hyperliquid.tsx` - Removed Settings tab, added Providers link
- `packages/admin/src/pages/polymarket.tsx` - Removed Settings tab, added Providers link
- `packages/admin/src/pages/actions.tsx` - Added hyperliquid/polymarket to PROVIDER_ADVANCED_SETTINGS, added Prediction category
- `packages/admin/src/__tests__/hyperliquid.test.tsx` - Replaced Settings tab test with Providers link test
- `packages/admin/src/__tests__/polymarket.test.tsx` - Replaced Settings tab test with Providers link test

## Decisions Made
- Settings managed centrally in Providers page via PROVIDER_ADVANCED_SETTINGS map (existing pattern)
- SettingsPanel.tsx and PolymarketSettings.tsx kept as dead code -- imports removed so not bundled, can be cleaned up separately
- Prediction category added to CATEGORY_ORDER before Other for proper Polymarket sorting

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 419 complete, ready for Phase 420 (wallet detail tab restructuring)
- No blockers or concerns

---
*Phase: 419-trading-settings*
*Completed: 2026-03-15*
