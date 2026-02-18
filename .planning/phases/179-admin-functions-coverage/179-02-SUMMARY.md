---
phase: 179-admin-functions-coverage
plan: 02
subsystem: testing
tags: [vitest, preact, coverage, admin-ui, policy-forms, toast, layout, client]

requires:
  - phase: 179-admin-functions-coverage
    provides: "Plan 01 coverage tests for settings.tsx, wallets.tsx, dashboard.tsx"
provides:
  - "106 new admin UI tests covering policies, notifications, client, toast, layout, copy-button, display-currency, and 5 policy form components"
  - "Admin function coverage raised from 57.95% to 77.87%, exceeding 70% threshold"
  - "All previously 0% coverage files now have function tests"
affects: [admin-coverage-gate, ci-quality-gates]

tech-stack:
  added: []
  patterns:
    - "Dynamic import pattern for testing modules that conflict with vi.mock hoisting"
    - "Fake timers pattern for toast auto-dismiss and clipboard copy revert tests"

key-files:
  created:
    - packages/admin/src/__tests__/policies-coverage.test.tsx
    - packages/admin/src/__tests__/notifications-coverage.test.tsx
    - packages/admin/src/__tests__/zero-coverage.test.tsx
  modified: []

key-decisions:
  - "Used vi.mock for page components in layout tests to avoid heavy rendering, accepting walletconnect.tsx stays at 0% in same file scope"
  - "Tested client.ts with real implementation (no mock) to exercise actual fetch/error handling code paths"
  - "Used container.querySelector for form field access when getByLabelText fails due to required asterisk in label text"

patterns-established:
  - "Section-based test organization: group related component tests by coverage domain in a single file"

requirements-completed: [ADM-03, ADM-04]

duration: 12min
completed: 2026-02-18
---

# Phase 179 Plan 02: Admin Functions Coverage - Policies, Notifications & Zero-Coverage Files

**106 new tests covering policies CRUD/validation, notifications pagination/expand, and all 0%-coverage admin files (client.ts, toast.tsx, copy-button.tsx, layout.tsx, display-currency.ts, 5 policy form components)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-18T03:39:15Z
- **Completed:** 2026-02-18T03:51:28Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- policies.tsx function coverage: 64.86% -> 86.48% with handleCreate (structured + JSON), openEdit/handleEdit, handleEditJsonToggle, openDelete/handleDelete, handleTypeChange, handleJsonToggle, validateRules for all 12 types, filter by wallet
- notifications.tsx function coverage: 68.75% -> 100% with handleTestChannel (per-channel), handlePrevPage/handleNextPage, handleRowClick expand/collapse/switch, tab switching
- client.ts: 0% -> 100% with ApiError, apiCall success/timeout/network-error/401/500, apiGet/Post/Put/Delete
- toast.tsx: 0% -> 100% with showToast, dismissToast, auto-dismiss, empty container
- copy-button.tsx: 0% -> 100% with render, clipboard copy, fallback execCommand
- layout.tsx: 0% -> 100% with nav items, PageRouter routing for all pages, getPageTitle, active link, logout
- display-currency.ts: 25% -> 100% with formatWithDisplay (null/USD/KRW/JPY), fetchDisplayCurrency (USD/error)
- ApproveAmountLimitForm, ApprovedSpendersForm, X402AllowedDomainsForm, ContractWhitelistForm, AllowedNetworksForm: all 0% -> tested with add/remove/change interactions
- Overall admin function coverage: 57.95% -> 77.87% (exceeds 70% threshold)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add policies.tsx + notifications.tsx function coverage tests** - `62bddcd` (test)
2. **Task 2: Add tests for 0% coverage files + uncovered policy forms** - `6524d0b` (test)

## Files Created/Modified
- `packages/admin/src/__tests__/policies-coverage.test.tsx` - 37 tests: CRUD, validation for all 12 types, edit/delete modals, JSON toggle, wallet filter
- `packages/admin/src/__tests__/notifications-coverage.test.tsx` - 12 tests: per-channel test, pagination, row expand/collapse, tab switching
- `packages/admin/src/__tests__/zero-coverage.test.tsx` - 57 tests: client.ts, toast.tsx, copy-button.tsx, layout.tsx, display-currency.ts, 5 policy form components

## Decisions Made
- Tested client.ts without mocking to exercise real fetch/error handling code paths, only mocking auth/store and globalThis.fetch
- Used vi.mock for page components in layout tests, which means walletconnect.tsx stays at 0% in this test file (module-level mock hoisting prevents unmocking per-describe)
- Used container.querySelector('#field-*') for form field access when getByLabelText fails due to required asterisk span in label text

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed multiple-element query errors in test assertions**
- **Found during:** Task 1 (policies-coverage.test.tsx, notifications-coverage.test.tsx)
- **Issue:** `screen.getByText()` threw when multiple matching elements existed (e.g., "Spending Limit" in table + edit modal, "TX_CONFIRMED" in table + detail header)
- **Fix:** Changed to `screen.getAllByText()` and indexed into the array for the correct element
- **Files modified:** policies-coverage.test.tsx, notifications-coverage.test.tsx
- **Verification:** All 49 tests pass
- **Committed in:** 62bddcd (Task 1 commit)

**2. [Rule 1 - Bug] Fixed toast signal state leakage between tests**
- **Found during:** Task 2 (toast.tsx tests)
- **Issue:** Toasts from previous tests persisted in shared signal state, causing dismissToast and empty-container tests to fail
- **Fix:** Added vi.advanceTimersByTime(10000) before each test to clear leftover toasts, used beforeEach/afterEach with fake timers
- **Files modified:** zero-coverage.test.tsx
- **Verification:** All 4 toast tests pass
- **Committed in:** 6524d0b (Task 2 commit)

**3. [Rule 3 - Blocking] Fixed missing document.execCommand in jsdom**
- **Found during:** Task 2 (copy-button.tsx fallback test)
- **Issue:** jsdom doesn't define document.execCommand, causing test to throw
- **Fix:** Added runtime check and mock definition before spying
- **Files modified:** zero-coverage.test.tsx
- **Verification:** Fallback test passes, execCommand called with 'copy'
- **Committed in:** 6524d0b (Task 2 commit)

**4. [Rule 1 - Bug] Fixed getByLabelText failures with required-field asterisks**
- **Found during:** Task 2 (X402AllowedDomainsForm and AllowedNetworksForm tests)
- **Issue:** Label text "Domain 1 *" (with required asterisk span) not matched by getByLabelText('Domain 1')
- **Fix:** Used container.querySelector('#field-id') to access form elements by ID instead
- **Files modified:** zero-coverage.test.tsx
- **Verification:** Form tests pass
- **Committed in:** 6524d0b (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 blocking)
**Impact on plan:** All fixes required for test correctness. No scope creep.

## Issues Encountered
- walletconnect.tsx remains at 0% function coverage because vi.mock hoisting prevents testing the real module in the same file as layout tests that mock all pages. This is a known vitest limitation with module-level mocks. The overall coverage target (77.87% > 70%) is still met.
- Pre-existing coverage file write race condition (ENOENT on coverage/.tmp) in vitest v8 provider -- transient, does not affect test results.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Admin function coverage at 77.87%, well above the 70% threshold needed for Phase 181 coverage gate restoration
- Combined with Plan 01 gains, all major admin pages (settings, wallets, dashboard, policies, notifications) have 80%+ function coverage
- walletconnect.tsx at 0% can be addressed in a future phase if higher coverage is needed

## Self-Check: PASSED

All 3 created test files verified on disk. Both task commits (62bddcd, 6524d0b) verified in git log.

---
*Phase: 179-admin-functions-coverage*
*Completed: 2026-02-18*
