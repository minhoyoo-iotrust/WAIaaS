---
phase: 326-admin-ui-mcp-connect-info
plan: 01
subsystem: ui
tags: [preact, admin-ui, smart-account, provider, erc-4337]

requires:
  - phase: 325-rest-api-agent-self-service
    provides: PUT /v1/wallets/:id/provider endpoint and provider in wallet response
provides:
  - Admin UI provider fields in wallet create form (conditional on accountType: smart)
  - Admin UI provider display and edit in wallet detail page
  - WALLET_PROVIDER endpoint helper in endpoints.ts
  - Dynamic dashboard link switching (Pimlico/Alchemy)
affects: [admin-ui, wallet-management]

tech-stack:
  added: []
  patterns: [conditional-form-fields, inline-edit-pattern, dashboard-link-guidance]

key-files:
  created:
    - packages/admin/src/__tests__/wallets-provider.test.tsx
  modified:
    - packages/admin/src/pages/wallets.tsx
    - packages/admin/src/api/endpoints.ts

key-decisions:
  - "Mirror AA_PROVIDER_DASHBOARD_URLS in admin SPA (browser-side, cannot import @waiaas/core)"
  - "Inline edit form for provider change in detail page (not modal)"

patterns-established:
  - "Provider conditional fields: show only when accountType=smart and chain=ethereum"

requirements-completed: [PROV-06, PROV-07, GUID-01, GUID-02, GUID-03]

duration: 8min
completed: 2026-03-05
---

# Phase 326 Plan 01: Admin UI Provider Fields Summary

**Admin UI wallet create form with conditional provider/API-key fields and detail page provider display + inline edit**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-04T16:05:19Z
- **Completed:** 2026-03-04T16:13:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Wallet create form shows provider select + API key/URL fields only when accountType is 'smart'
- Dashboard link dynamically switches between Pimlico and Alchemy providers
- Detail page displays provider name, supported chains, and paymaster status
- Change Provider button with inline edit form calls PUT /v1/wallets/:id/provider
- 6 tests covering create form visibility, dashboard link switching, custom URL fields, detail display, and provider edit

## Task Commits

1. **Task 1: Provider fields in wallet create form + API endpoint helper** - `e95a285d` (feat)
2. **Task 2: Provider display + edit in wallet detail page + tests** - `d6e87fda` (feat)

## Files Created/Modified
- `packages/admin/src/api/endpoints.ts` - Added WALLET_PROVIDER endpoint helper
- `packages/admin/src/pages/wallets.tsx` - Provider constants, form fields, detail display, inline edit
- `packages/admin/src/__tests__/wallets-provider.test.tsx` - 6 tests for provider UI

## Decisions Made
- Mirrored AA_PROVIDER_DASHBOARD_URLS in admin SPA since browser cannot import @waiaas/core directly
- Used inline edit form (not modal) for provider changes, consistent with existing name edit pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin UI provider management complete
- Ready for Plan 326-02 (connect-info + MCP tool)

---
*Phase: 326-admin-ui-mcp-connect-info*
*Completed: 2026-03-05*
