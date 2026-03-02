---
phase: 303-admin-ui-skill-files
plan: 01
subsystem: ui
tags: [preact, admin, ntfy, wallet-apps, topic-management]

# Dependency graph
requires:
  - phase: 302-per-wallet-topic-backend
    provides: "sign_topic/notify_topic columns in wallet_apps, REST API topic fields"
provides:
  - "Notifications page without global ntfy_topic field, with per-wallet topic guidance"
  - "Human Wallet Apps page with sign_topic/notify_topic display and inline editing"
  - "Tests T-HWUI-10 and T-HWUI-11 for topic display and edit"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline edit pattern with signals: topicEditing record keyed by app.id"
    - "View/edit mode toggle using ternary on signal record presence"

key-files:
  created: []
  modified:
    - "packages/admin/src/pages/notifications.tsx"
    - "packages/admin/src/pages/human-wallet-apps.tsx"
    - "packages/admin/src/__tests__/human-wallet-apps.test.tsx"

key-decisions:
  - "Show '(default)' for null topic values instead of empty string"
  - "Use inline edit with Save/Cancel buttons (not modal) for topic editing"
  - "Send null for empty topic strings to allow runtime fallback"

patterns-established:
  - "Inline edit with signals pattern: useSignal<Record<id, editState>> for per-card editing"

requirements-completed: [ADUI-01, ADUI-02, ADUI-03, ADUI-04]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 303 Plan 01: Admin UI Per-Wallet Topic Management Summary

**Notifications ntfy_topic field removed with guidance link, Human Wallet Apps inline sign_topic/notify_topic display and editing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T05:45:09Z
- **Completed:** 2026-03-02T05:48:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Removed global ntfy_topic FormField from Notifications Settings ntfy section
- Added guidance text pointing users to Human Wallet Apps for per-wallet topic management
- Added sign_topic/notify_topic to WalletAppApi interface and each app card (view + edit mode)
- Added 2 new tests (T-HWUI-10, T-HWUI-11) for topic display and PUT-based editing

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove ntfy_topic field from Notifications + add guidance** - `9fd9ff07` (feat)
2. **Task 2: Add topic display/edit to Human Wallet Apps + update tests** - `7d227029` (feat)

## Files Created/Modified
- `packages/admin/src/pages/notifications.tsx` - Removed ntfy_topic FormField, updated info box with per-wallet topic guidance
- `packages/admin/src/pages/human-wallet-apps.tsx` - Added sign_topic/notify_topic to interface, view mode with (default) fallback, edit mode with Save/Cancel
- `packages/admin/src/__tests__/human-wallet-apps.test.tsx` - Added topic fields to mockApps, T-HWUI-10 display test, T-HWUI-11 edit/PUT test

## Decisions Made
- Show "(default)" for null topic values -- visually clear that runtime fallback applies
- Inline edit pattern using signals record keyed by app.id -- consistent with existing page patterns
- Send null for empty topic strings on save -- preserves runtime fallback behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin UI fully reflects per-wallet topic model from Phase 302
- Notifications page cleanly directs users to Human Wallet Apps for topic management
- Plan 303-02 (skill files) can proceed independently

## Self-Check: PASSED

- FOUND: packages/admin/src/pages/notifications.tsx
- FOUND: packages/admin/src/pages/human-wallet-apps.tsx
- FOUND: packages/admin/src/__tests__/human-wallet-apps.test.tsx
- FOUND: .planning/phases/303-admin-ui-skill-files/303-01-SUMMARY.md
- FOUND: commit 9fd9ff07
- FOUND: commit 7d227029

---
*Phase: 303-admin-ui-skill-files*
*Completed: 2026-03-02*
