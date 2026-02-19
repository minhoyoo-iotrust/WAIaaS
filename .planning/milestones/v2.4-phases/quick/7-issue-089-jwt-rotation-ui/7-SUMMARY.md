---
phase: quick-7
plan: 1
subsystem: ui
tags: [admin-ui, preact, jwt, ux-text]

requires:
  - phase: 182-187
    provides: Admin UI Security page with JWT Rotation tab
provides:
  - User-facing JWT invalidation text in Security and Settings pages
  - Updated test assertions for new UI text
affects: [admin-ui, security]

tech-stack:
  added: []
  patterns: [user-facing-text-over-internal-terms]

key-files:
  created: []
  modified:
    - packages/admin/src/pages/security.tsx
    - packages/admin/src/pages/settings.tsx
    - packages/admin/src/__tests__/settings-coverage.test.tsx

key-decisions:
  - "Kept code comments (// JWT Rotation Tab) unchanged since they are developer-facing, not user-facing"
  - "Used regex in test assertions for modal body text to avoid fragile full-text matching"

patterns-established:
  - "User-facing UI text should describe the effect (session invalidation), not the mechanism (JWT secret rotation)"

requirements-completed: [ISSUE-089]

duration: 2min
completed: 2026-02-19
---

# Quick Task 7: Issue 089 JWT Rotation UI Text Clarity Summary

**Admin UI JWT rotation renamed to "Invalidate Sessions" with user-facing descriptions in Security and Settings pages**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T04:48:33Z
- **Completed:** 2026-02-19T04:50:43Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced all internal JWT mechanism terms with user-facing session invalidation language
- Updated both Security page (primary) and Settings page (legacy) consistently
- All 313 admin tests pass with updated text assertions

## Task Commits

Each task was committed atomically:

1. **Task 1: Update JWT rotation UI text in security.tsx and settings.tsx** - `cd1215b` (fix)
2. **Task 2: Update test assertions in settings-coverage.test.tsx** - `5ac6676` (test)

## Files Created/Modified
- `packages/admin/src/pages/security.tsx` - Tab label, section heading/description, button, modal, toast text updated
- `packages/admin/src/pages/settings.tsx` - Same text changes applied to legacy settings page
- `packages/admin/src/__tests__/settings-coverage.test.tsx` - Test assertions updated to match new UI text

## Text Changes Applied

| Element | Before | After |
|---------|--------|-------|
| Tab label | JWT Rotation | Invalidate Sessions |
| Section heading | JWT Secret Rotation | Invalidate All Session Tokens |
| Section description | Invalidate all existing JWT tokens... | Revoke all active session tokens by rotating the signing key... |
| Button | Rotate JWT Secret | Invalidate All Tokens |
| Modal title | Rotate JWT Secret | Invalidate All Session Tokens |
| Modal body | Are you sure you want to rotate the JWT secret?... | This will rotate the signing key and invalidate all active session tokens... |
| Confirm button | Rotate | Invalidate |
| Success toast | JWT secret rotated. Old tokens valid for 5 minutes. | All session tokens invalidated. Old tokens remain valid for 5 minutes. |

## Decisions Made
- Kept code comments (`// JWT Rotation Tab`, `/* JWT Rotation Confirmation Modal */`) unchanged since they are developer-facing and aid code navigation
- Used regex in test assertions for modal body text to avoid fragile full-text matching

## Deviations from Plan

None - plan executed exactly as written.

Note: The plan's verify step mentioned `pnpm --filter @waiaas/admin run typecheck` but the admin package has no typecheck script. Verified via `pnpm --filter @waiaas/admin run build` instead, which includes type checking through Vite/esbuild.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Issue 089 resolved
- No follow-up work needed

---
*Quick Task: 7-issue-089-jwt-rotation-ui*
*Completed: 2026-02-19*
