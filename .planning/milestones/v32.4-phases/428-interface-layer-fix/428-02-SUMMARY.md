---
phase: 428-interface-layer-fix
plan: 02
subsystem: infra
tags: [layer-architecture, auth, siwe, address-validation, error-codes]

requires:
  - phase: 427
    provides: "VALIDATION_FAILED error code in ERROR_CODES registry"
provides:
  - "infrastructure/auth/ canonical location for verifySIWE, decodeBase58, MasterPasswordRef"
  - "Re-export bridges in api/middleware/ for backward compatibility"
  - "0 layer violations (services/ and infrastructure/ importing from api/)"
  - "Correct VALIDATION_FAILED usage for Zod parse errors"
affects: [wc-signing-bridge, settings-service, owner-auth, sign-message, dry-run]

tech-stack:
  added: []
  patterns: ["re-export bridge for backward-compatible layer migration"]

key-files:
  created:
    - packages/daemon/src/infrastructure/auth/siwe-verify.ts
    - packages/daemon/src/infrastructure/auth/address-validation.ts
    - packages/daemon/src/infrastructure/auth/types.ts
  modified:
    - packages/daemon/src/api/middleware/siwe-verify.ts
    - packages/daemon/src/api/middleware/address-validation.ts
    - packages/daemon/src/api/middleware/master-auth.ts
    - packages/daemon/src/services/wc-signing-bridge.ts
    - packages/daemon/src/infrastructure/settings/settings-service.ts
    - packages/daemon/src/pipeline/sign-message.ts
    - packages/daemon/src/pipeline/dry-run.ts

key-decisions:
  - "Re-export bridge pattern: keep api/middleware/ files as thin re-exports for backward compatibility"
  - "MasterAuthDeps stays in api/middleware/master-auth.ts (only used by api layer)"
  - "ACTION_VALIDATION_FAILED kept for action-specific constraints (signTypedData EVM-only, gas pending limit)"

patterns-established:
  - "Re-export bridge: move implementation to lower layer, re-export from higher layer for backward compat"

requirements-completed: [LAYER-04, LAYER-05, LAYER-08, LAYER-09]

duration: 8min
completed: 2026-03-16
---

# Phase 428 Plan 02: Layer Violation Fixes Summary

**verifySIWE/decodeBase58/MasterPasswordRef moved to infrastructure/auth/ with re-export bridges, eliminating 3 layer violations and correcting 2 error code misuses**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T05:30:00Z
- **Completed:** 2026-03-16T05:38:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Created infrastructure/auth/ directory as canonical location for shared auth utilities
- Moved verifySIWE, decodeBase58/validateOwnerAddress, and MasterPasswordRef to infrastructure layer
- Converted api/middleware/ files to thin re-export bridges (zero breaking changes)
- Eliminated all 3 layer violations (services/ and infrastructure/ importing from api/)
- Replaced 2 ACTION_VALIDATION_FAILED misuses with VALIDATION_FAILED for Zod parse errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Move utilities to infrastructure/auth/ + re-export bridges** - `d4bcd377` (refactor)
2. **Task 2: ACTION_VALIDATION_FAILED replacement + layer violation verification** - `82e7ab2c` (fix)

## Files Created/Modified
- `packages/daemon/src/infrastructure/auth/siwe-verify.ts` - Canonical verifySIWE location
- `packages/daemon/src/infrastructure/auth/address-validation.ts` - Canonical decodeBase58 + validateOwnerAddress location
- `packages/daemon/src/infrastructure/auth/types.ts` - MasterPasswordRef type definition
- `packages/daemon/src/api/middleware/siwe-verify.ts` - Converted to re-export bridge
- `packages/daemon/src/api/middleware/address-validation.ts` - Converted to re-export bridge
- `packages/daemon/src/api/middleware/master-auth.ts` - MasterPasswordRef re-exported from infrastructure
- `packages/daemon/src/services/wc-signing-bridge.ts` - Import paths updated to infrastructure/auth/
- `packages/daemon/src/infrastructure/settings/settings-service.ts` - Import path updated to ../auth/types.js
- `packages/daemon/src/pipeline/sign-message.ts` - Zod parse error uses VALIDATION_FAILED
- `packages/daemon/src/pipeline/dry-run.ts` - Zod parse error uses VALIDATION_FAILED

## Decisions Made
- Used re-export bridge pattern to maintain backward compatibility for all existing api/ layer imports
- MasterAuthDeps interface kept in master-auth.ts (middleware-specific, not needed by lower layers)
- ACTION_VALIDATION_FAILED preserved for action-specific constraints (signTypedData EVM-only check, gas condition pending limit)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All layer violations resolved, infrastructure/auth/ established as canonical auth utility location
- Ready for Phase 429 (DatabasePolicyEngine Zod validation) and Phase 430 (as any removal)

---
*Phase: 428-interface-layer-fix*
*Completed: 2026-03-16*
