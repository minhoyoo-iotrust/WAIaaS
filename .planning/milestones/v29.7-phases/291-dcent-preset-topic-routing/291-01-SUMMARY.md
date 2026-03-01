---
phase: 291-dcent-preset-topic-routing
plan: 01
subsystem: signing
tags: [ntfy, preset, wallet-type, topic-routing, approval-channel]

requires:
  - phase: 267-builtin-wallet-preset
    provides: PresetAutoSetupService with sdk_ntfy case branch
provides:
  - D'CENT preset changed from walletconnect to sdk_ntfy approval method
  - wallet_type-based topic routing in ApprovalChannelRouter
  - Admin UI D'CENT description updated to push notification signing
affects: [291-02, signing-sdk, preset-auto-setup]

tech-stack:
  added: []
  patterns: [wallet_type DB enrichment for per-wallet topic routing]

key-files:
  created: []
  modified:
    - packages/core/src/schemas/wallet-preset.ts
    - packages/daemon/src/services/signing-sdk/approval-channel-router.ts
    - packages/admin/src/pages/wallets.tsx

key-decisions:
  - "wallet_type enrichment happens before method dispatch so all paths (explicit + fallback) get per-wallet topic"
  - "Falsy wallet_type (null/empty) leaves walletName undefined, preserving preferred_wallet fallback chain"

patterns-established:
  - "DB enrichment pattern: query extra columns from wallets table and inject into params before channel dispatch"

requirements-completed: [SIGN-01, SIGN-02, SIGN-03, SIGN-04, SIGN-05, SIGN-06]

duration: 5min
completed: 2026-03-01
---

# Plan 291-01: D'CENT Preset + Topic Routing Summary

**D'CENT preset switched to sdk_ntfy with wallet_type-based ntfy topic routing in ApprovalChannelRouter**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-01T09:40:00Z
- **Completed:** 2026-03-01T09:45:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- D'CENT preset approvalMethod changed from walletconnect to sdk_ntfy, automatically activating PresetAutoSetupService's preferred_channel=ntfy branch
- ApprovalChannelRouter.route() now queries wallet_type from DB and enriches params.walletName for per-wallet topic routing
- Admin UI preset description updated to reflect push notification signing

## Task Commits

Each task was committed atomically:

1. **Task 1+2: D'CENT preset + topic routing** - `d38a6196` (feat)

## Files Created/Modified
- `packages/core/src/schemas/wallet-preset.ts` - D'CENT preset: approvalMethod walletconnect->sdk_ntfy, description updated
- `packages/daemon/src/services/signing-sdk/approval-channel-router.ts` - wallet_type DB lookup + enrichedParams with walletName
- `packages/admin/src/pages/wallets.tsx` - WALLET_PRESETS description updated to push notification signing

## Decisions Made
- Combined both tasks into single commit since they are tightly coupled changes forming one logical unit
- wallet_type enrichment placed before method dispatch so both explicit routing and global fallback paths benefit

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Implementation complete, ready for Plan 291-02 (TDD tests)
- All 86 existing tests pass, typecheck clean

---
*Phase: 291-dcent-preset-topic-routing*
*Completed: 2026-03-01*
