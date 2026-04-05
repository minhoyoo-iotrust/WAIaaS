---
phase: 248-provider-infrastructure
plan: 01
subsystem: infra
tags: [settings-service, notification, action-provider, admin-settings]

# Dependency graph
requires:
  - phase: 246-jupiter-foundation
    provides: "JupiterSwapActionProvider, registerBuiltInProviders, ActionProviderRegistry"
provides:
  - "actions settings category (13 keys) in SettingsService SSoT"
  - "SettingsReader interface for registerBuiltInProviders"
  - "ACTION_API_KEY_REQUIRED notification event (31st event)"
  - "0x swap config keys in DaemonConfigSchema (forward compat)"
affects: [248-02-PLAN, 248-03-PLAN, 249-zerrox-provider, 250-admin-defi]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SettingsReader interface for decoupled config reading", "Notification-before-throw pattern for actionable error guidance"]

key-files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/actions/src/index.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/api/routes/actions.ts
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/core/src/enums/notification.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/core/src/schemas/signing-protocol.ts
    - packages/core/src/__tests__/enums.test.ts
    - packages/daemon/src/__tests__/settings-service.test.ts

key-decisions:
  - "SettingsReader interface (get(key): string) as minimal contract between @waiaas/actions and daemon SettingsService"
  - "0x swap factory returns null (placeholder) until ZeroExSwapActionProvider is implemented"
  - "Reordered actions route: walletId resolution before API key check for notification context"
  - "ACTION_API_KEY_REQUIRED categorized as 'system' in EVENT_CATEGORY_MAP"

patterns-established:
  - "SettingsReader: minimal interface for reading settings without importing full SettingsService"
  - "Notify-before-throw: fire notification before error throw for actionable admin guidance"

requirements-completed: [PINF-01, PINF-02, PINF-03, PINF-05]

# Metrics
duration: 7min
completed: 2026-02-23
---

# Phase 248 Plan 01: Provider Infrastructure Summary

**Actions settings category (13 keys) in Admin Settings SSoT with SettingsReader-based provider registration and ACTION_API_KEY_REQUIRED notification**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-23T13:35:33Z
- **Completed:** 2026-02-23T13:42:13Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Added 'actions' category to SettingsService with 13 setting definitions (8 Jupiter, 5 0x)
- Migrated registerBuiltInProviders from raw config object to SettingsReader interface
- Added ACTION_API_KEY_REQUIRED notification event (31st event) with en/ko i18n templates
- Actions route fires notification before throwing API_KEY_REQUIRED for actionable admin guidance

## Task Commits

Each task was committed atomically:

1. **Task 1: Add actions settings category + ACTION_API_KEY_REQUIRED notification event** - `0ffc2a0a` (feat)
2. **Task 2: Migrate registerBuiltInProviders to SettingsService + fire notification** - `de183fde` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - Added 'actions' category with 13 setting definitions
- `packages/actions/src/index.ts` - SettingsReader interface, refactored registerBuiltInProviders
- `packages/daemon/src/lifecycle/daemon.ts` - Pass SettingsService instead of manually-built actionsConfig
- `packages/daemon/src/api/routes/actions.ts` - Reordered steps, added ACTION_API_KEY_REQUIRED notification
- `packages/daemon/src/infrastructure/config/loader.ts` - Added zerox_swap_* fields for forward compat
- `packages/core/src/enums/notification.ts` - Added ACTION_API_KEY_REQUIRED (31 events)
- `packages/core/src/i18n/en.ts` - English template with provider/adminUrl fields
- `packages/core/src/i18n/ko.ts` - Korean template for ACTION_API_KEY_REQUIRED
- `packages/core/src/schemas/signing-protocol.ts` - EVENT_CATEGORY_MAP + EVENT_DESCRIPTIONS entries
- `packages/core/src/__tests__/enums.test.ts` - Updated event count from 30 to 31
- `packages/daemon/src/__tests__/settings-service.test.ts` - 7 new tests for actions category

## Decisions Made
- Used SettingsReader interface (get(key): string) as minimal contract -- avoids importing full SettingsService into @waiaas/actions
- 0x swap factory returns null (skips registration) until ZeroExSwapActionProvider is implemented in Plan 248-02
- Reordered actions route execution: walletId resolution before API key check so notification has wallet context
- ACTION_API_KEY_REQUIRED categorized as 'system' (not 'security_alert') since it's operational guidance

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added ACTION_API_KEY_REQUIRED to ko.ts and signing-protocol.ts**
- **Found during:** Task 1 (core build)
- **Issue:** Adding a new NotificationEventType requires updates to ko.ts (Messages type) and signing-protocol.ts (EVENT_CATEGORY_MAP, EVENT_DESCRIPTIONS) -- plan only listed en.ts and notification.ts
- **Fix:** Added Korean i18n template and EVENT_CATEGORY_MAP/EVENT_DESCRIPTIONS entries
- **Files modified:** packages/core/src/i18n/ko.ts, packages/core/src/schemas/signing-protocol.ts
- **Verification:** Core build passes, all 470 core tests pass
- **Committed in:** 0ffc2a0a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for type safety -- Messages interface enforces key parity across locales. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Actions settings category ready for Admin Settings UI integration
- SettingsReader interface ready for ZeroExSwapActionProvider (Plan 248-02)
- 0x config keys present in DaemonConfigSchema for config.toml forward compat
- ACTION_API_KEY_REQUIRED notification available for all action providers

---
*Phase: 248-provider-infrastructure*
*Completed: 2026-02-23*
