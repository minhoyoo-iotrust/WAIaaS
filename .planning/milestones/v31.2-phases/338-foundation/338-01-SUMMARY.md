---
phase: 338-foundation
plan: 01
subsystem: api
tags: [smart-account, lite-mode, provider, wallet, erc-4337]

requires:
  - phase: none
    provides: first plan of v31.2

provides:
  - Smart Account Lite mode (provider-less wallet creation)
  - isLiteModeSmartAccount() and getLiteModeError() helper exports
  - Lite mode send blocking with userop API guidance
affects: [338-02, 339-01, 339-02, 340-01, 341-01]

tech-stack:
  added: []
  patterns: [lite-full-mode-pattern]

key-files:
  created:
    - packages/daemon/src/__tests__/wallet-provider-lite-mode.test.ts
  modified:
    - packages/core/src/schemas/wallet.schema.ts
    - packages/daemon/src/api/routes/wallets.ts
    - packages/daemon/src/api/routes/transactions.ts

key-decisions:
  - "Lite mode detection via isLiteModeSmartAccount() helper exported from wallets.ts"
  - "CHAIN_ERROR used for Lite mode send blocking (matches plan spec, retryable=true)"
  - "Preset providers (pimlico/alchemy) always have paymasterEnabled=true"

patterns-established:
  - "Lite/Full mode: accountType='smart' + aaProvider=null is Lite, aaProvider set is Full"
  - "Send blocking: check before pipeline entry, not inside pipeline stages"

requirements-completed: [PROV-01, PROV-02, PROV-03, PROV-04, PROV-05]

duration: 5min
completed: 2026-03-06
---

# Phase 338 Plan 01: Provider Lite/Full Mode Summary

**Smart Account Lite mode allowing provider-less wallet creation with send blocking and userop API guidance**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T08:37:55Z
- **Completed:** 2026-03-06T08:43:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Smart Account wallets can now be created without aaProvider (Lite mode)
- Lite mode wallets get CHAIN_ERROR with userop/build and userop/sign API guidance when trying to send
- Full mode (provider set) wallets retain all existing AA functionality
- 12 unit tests covering schema validation, buildProviderStatus, isLiteModeSmartAccount, and getLiteModeError

## Task Commits

1. **Task 1: CreateWalletRequestSchema aaProvider validation removal + Lite mode** - `ae0f5147` (feat)
2. **Task 2: Lite mode send blocking + CHAIN_ERROR response** - `ef52df38` (feat)

## Files Created/Modified
- `packages/core/src/schemas/wallet.schema.ts` - Remove aaProvider required check for smart accounts
- `packages/daemon/src/api/routes/wallets.ts` - Remove provider guard, add isLiteModeSmartAccount/getLiteModeError exports
- `packages/daemon/src/api/routes/transactions.ts` - Add Lite mode send blocking before pipeline entry
- `packages/daemon/src/__tests__/wallet-provider-lite-mode.test.ts` - 12 unit tests for Lite/Full mode

## Decisions Made
- Used isLiteModeSmartAccount() as reusable helper rather than inline check
- CHAIN_ERROR chosen for Lite mode send blocking (per plan spec)
- Preset providers always report paymasterEnabled=true (existing behavior preserved)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Lite/Full mode infrastructure ready for Plan 338-02 (Zod schemas + DB migration)
- isLiteModeSmartAccount and getLiteModeError exported for use in Phase 339-340 userop endpoints

---
*Phase: 338-foundation*
*Completed: 2026-03-06*
