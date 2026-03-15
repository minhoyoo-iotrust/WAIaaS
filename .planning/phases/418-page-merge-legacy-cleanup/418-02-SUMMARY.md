---
phase: 418-page-merge-legacy-cleanup
plan: 02
subsystem: ui
tags: [preact, tabs, settings, rpc-proxy, legacy-cleanup, skill-file]

requires:
  - phase: 418-page-merge-legacy-cleanup
    provides: Tab merge pattern from Plan 01
provides:
  - Settings page 3-tab layout (General/API Keys/RPC Proxy)
  - RpcProxyContent named export (rpc-proxy.tsx default export removed)
  - telegram-users.tsx default export removed
  - /rpc-proxy redirect to /settings with RPC Proxy tab activation
  - Updated admin.skill.md with new navigation structure
affects: [419-trading-settings, 420-wallet-detail]

tech-stack:
  added: []
  patterns: [Settings page TabNav with GeneralTab/ApiKeysSection/RpcProxyContent]

key-files:
  modified:
    - packages/admin/src/pages/system.tsx
    - packages/admin/src/pages/rpc-proxy.tsx
    - packages/admin/src/pages/telegram-users.tsx
    - packages/admin/src/components/layout.tsx
    - packages/admin/src/__tests__/rpc-proxy.test.tsx
    - packages/admin/src/__tests__/telegram-users.test.tsx
    - skills/admin.skill.md

key-decisions:
  - "GeneralTab wraps all settings sections + danger zone as inner function component"
  - "ApiKeysSection reused directly as API Keys tab (no wrapper needed)"
  - "Shutdown modal kept outside tabs (always accessible)"

patterns-established:
  - "Settings tab structure: GeneralTab (settings categories + danger zone), ApiKeysSection, RpcProxyContent"

requirements-completed: [MERG-03, MERG-04, MERG-06, LGCY-01, LGCY-03, LGCY-04, ROUT-02]

duration: 8min
completed: 2026-03-15
---

# Phase 418 Plan 02: RPC Proxy Settings Tab Merge + Legacy Cleanup Summary

**Settings page restructured into 3-tab layout (General/API Keys/RPC Proxy), legacy default exports removed, admin.skill.md updated with navigation structure**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-15T03:45:00Z
- **Completed:** 2026-03-15T03:53:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Settings page now has 3-tab layout with TabNav and Breadcrumb
- RPC Proxy page content embedded as Settings tab via RpcProxyContent named export
- telegram-users.tsx default export removed (TelegramUsersContent remains)
- admin.skill.md documents full sidebar structure with 5 section groups and legacy route redirects
- All 907 admin tests pass

## Task Commits

1. **Task 1: Settings 3-tab structure + RPC Proxy merge** - `3aed26d8` (feat)
2. **Task 2: Legacy cleanup + layout import + redirect + skill file** - `7456f970` (feat)

## Files Created/Modified
- `packages/admin/src/pages/system.tsx` - Added SETTINGS_TABS, TabNav, Breadcrumb, GeneralTab inner component
- `packages/admin/src/pages/rpc-proxy.tsx` - Changed default export to named RpcProxyContent
- `packages/admin/src/pages/telegram-users.tsx` - Removed default TelegramUsersPage export
- `packages/admin/src/components/layout.tsx` - Removed RpcProxyPage import, redirect /rpc-proxy to /settings
- `packages/admin/src/__tests__/rpc-proxy.test.tsx` - Updated to named import
- `packages/admin/src/__tests__/telegram-users.test.tsx` - Updated to named import
- `skills/admin.skill.md` - Added Admin UI Navigation Structure, updated menu references

## Decisions Made
- Shutdown modal kept outside tab structure (accessible from any tab)
- GeneralTab is an inner function component in SystemPage (accesses parent state via closure)
- ApiKeysSection reused directly as tab content without additional wrapper

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed rpc-proxy.test.tsx and telegram-users.test.tsx default imports**
- **Found during:** Task 2 (test verification)
- **Issue:** Tests imported removed default exports
- **Fix:** Changed to named imports with aliasing
- **Files modified:** packages/admin/src/__tests__/rpc-proxy.test.tsx, packages/admin/src/__tests__/telegram-users.test.tsx
- **Verification:** All 907 tests pass
- **Committed in:** 7456f970

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix necessary for test correctness. No scope creep.

## Issues Encountered
None.

## Next Phase Readiness
- Phase 418 complete, ready for Phase 419 (Trading Settings tab removal)
- Tab merge pattern well established and can be reused

---
*Phase: 418-page-merge-legacy-cleanup*
*Completed: 2026-03-15*
