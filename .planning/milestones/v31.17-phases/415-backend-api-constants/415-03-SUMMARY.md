---
phase: 415-backend-api-constants
plan: 03
subsystem: admin-ui
tags: [admin-ui, hardcoding-removal, api-driven, shared-constants]
dependency_graph:
  requires: [415-01, 415-02]
  provides: [zero-hardcoded-constants]
  affects: [admin-ui]
tech_stack:
  added: []
  patterns: [api-driven-ui, shared-import]
key_files:
  created: []
  modified:
    - packages/admin/src/pages/actions.tsx
    - packages/admin/src/pages/policies.tsx
    - packages/admin/src/pages/wallets.tsx
    - packages/admin/src/utils/error-messages.ts
    - packages/admin/src/__tests__/actions.test.tsx
    - packages/admin/src/__tests__/actions-aave-v3.test.tsx
    - packages/admin/src/__tests__/actions-kamino.test.tsx
    - packages/admin/src/__tests__/erc8004-reputation.test.tsx
    - packages/admin/src/api/types.generated.ts
decisions:
  - PROVIDER_ADVANCED_SETTINGS map replaces per-provider conditional blocks
  - Provider display name derived from API name via title-case transform
  - Category sort order preserved via CATEGORY_ORDER constant (static, not API)
  - Test mocks updated to return { data: ... } format for typed-client
metrics:
  duration: 8min
  completed: "2026-03-15"
---

# Phase 415 Plan 03: Admin UI Hardcoding Removal Summary

Replaced all hardcoded constants (BUILTIN_PROVIDERS, POLICY_TYPES, CRED_TYPES, ERROR_MESSAGES) with API responses and @waiaas/shared imports.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace BUILTIN_PROVIDERS with API-driven listing | 800faf5a | actions.tsx, erc8004 test, types.generated.ts |
| 2 | Replace policy/credential/error hardcoding with shared imports | 01b610c8 | policies.tsx, wallets.tsx, error-messages.ts, 3 test files |

## Key Changes

1. **actions.tsx**: Removed 14-item BUILTIN_PROVIDERS array, BuiltinProvider interface, CATEGORY_ORDER static array, isEnabled()/isRegistered() helpers. Now uses provider.enabledKey, provider.category, provider.isEnabled from API.
2. **policies.tsx**: POLICY_TYPES derived from POLICY_TYPE_LABELS, POLICY_DESCRIPTIONS from @waiaas/shared
3. **wallets.tsx**: CRED_TYPES derived from CREDENTIAL_TYPE_LABELS from @waiaas/shared
4. **error-messages.ts**: Entire ERROR_MESSAGES object replaced with ERROR_MESSAGE_MAP import from @waiaas/shared
5. **Test updates**: 3 action test files updated with proper mock data including new fields and { data: ... } wrapper format

## Verification

- `grep -r "BUILTIN_PROVIDERS" packages/admin/src/` (non-test) = 0 results
- `grep -rn "const POLICY_TYPES = [" packages/admin/src/pages/` = 0 results
- `grep -rn "const ERROR_MESSAGES:" packages/admin/src/` = 0 results
- 39 action tests passing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock return format mismatch**
- **Found during:** Task 2
- **Issue:** Action test mocks returned raw data instead of { data: ... } wrapper expected by typed-client
- **Fix:** Updated mockApiCalls in all 3 action test files to wrap returns with { data: ... }
- **Files modified:** actions.test.tsx, actions-aave-v3.test.tsx, actions-kamino.test.tsx

## Self-Check: PASSED
