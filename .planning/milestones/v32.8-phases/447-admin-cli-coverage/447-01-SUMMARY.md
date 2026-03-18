---
phase: 447-admin-cli-coverage
plan: 01
status: complete
started: "2026-03-17T12:35:39Z"
completed: "2026-03-17T12:57:30Z"
duration: ~22min
tasks_completed: 2
tasks_total: 2
key-files:
  created:
    - packages/admin/src/__tests__/pages-functions-1.test.tsx
    - packages/admin/src/__tests__/pages-functions-2.test.tsx
decisions:
  - "Used vi.mock pattern consistent with existing admin test files (api/typed-client, toast, auth/store)"
  - "Dashboard defi positions mock uses throw to keep defiData null (avoids worstHealthFactor undefined edge case)"
---

# Phase 447 Plan 01: system/erc8004/credentials/wallet-apps/dashboard/transactions Functions Tests

Admin 6 lowest-Functions pages tested with 49 new tests covering uncovered event handlers, error paths, and API interactions.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | system/erc8004/credentials functions | d366348b | pages-functions-1.test.tsx (31 tests) |
| 2 | wallet-apps/dashboard/transactions functions | 07d26be5 | pages-functions-2.test.tsx (18 tests) |

## Key Changes

### pages-functions-1.test.tsx (31 tests)
- **system.tsx**: API key save/delete/cancel, NFT indexer section rendering, ERC-8128 fields, RPC Proxy tab switch, non-ApiError handling in fetchSettings and handleSave
- **erc8004.tsx**: handleRegister (submit + error), handleLookup reputation (success + error), loadRegistrationFile (success + error), Reputation tab agent score display
- **credentials.tsx**: handleDelete confirm + error, handleRotate confirm + error, handleAdd validation (empty name, empty value), fetchCredentials error, getTypeVariant rendering

### pages-functions-2.test.tsx (18 tests)
- **human-wallet-apps.tsx**: handleRegister submit + validation, handleSetSubToken clear/set, handleRemove cancel path, cancelTopicEdit, handleNotifToggle error, handleTestNotification error
- **dashboard.tsx**: autoProvisioned banner, updateAvailable banner, no-banner case, fetchStatus error
- **transactions.tsx**: Monitor Settings tab rendering, field change save bar, save PUT, discard, fetch error

## Deviations from Plan

None - plan executed as written.
