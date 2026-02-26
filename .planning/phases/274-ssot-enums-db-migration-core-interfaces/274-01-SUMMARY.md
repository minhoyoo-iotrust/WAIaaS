---
phase: 274-ssot-enums-db-migration-core-interfaces
plan: 01
subsystem: enums, notifications, i18n
tags: [zod, ssot, defi, notification, i18n, enum]

requires:
  - phase: none
    provides: first plan of phase 274
provides:
  - POSITION_CATEGORIES (LENDING/YIELD/PERP/STAKING) and POSITION_STATUSES (ACTIVE/CLOSED/LIQUIDATED) SSoT enums with Zod validation
  - 4 DeFi notification events (LIQUIDATION_WARNING, MATURITY_WARNING, MARGIN_WARNING, LIQUIDATION_IMMINENT)
  - defi_monitoring notification category in NOTIFICATION_CATEGORIES
  - English and Korean i18n templates for all 4 DeFi events
  - LIQUIDATION_IMMINENT in BROADCAST_EVENTS for unconditional delivery
affects: [274-02 (DB migration uses POSITION_CATEGORIES/POSITION_STATUSES), 274-03 (interfaces use PositionCategory/PositionStatus types)]

tech-stack:
  added: []
  patterns: [DeFi enum SSoT derivation (Zod -> TS type -> CHECK constraint)]

key-files:
  created:
    - packages/core/src/enums/defi.ts
  modified:
    - packages/core/src/enums/notification.ts
    - packages/core/src/enums/index.ts
    - packages/core/src/schemas/signing-protocol.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/core/src/index.ts
    - packages/daemon/src/notifications/notification-service.ts
    - packages/core/src/__tests__/enums.test.ts
    - packages/core/src/__tests__/signing-protocol.test.ts

key-decisions:
  - "LIQUIDATION_IMMINENT mapped to security_alert category (not defi_monitoring) for broadcast to ALL channels"
  - "Other 3 DeFi events (LIQUIDATION_WARNING, MATURITY_WARNING, MARGIN_WARNING) mapped to defi_monitoring category"

patterns-established:
  - "DeFi enum pattern: as const array -> type derivation -> Zod enum in packages/core/src/enums/defi.ts"

requirements-completed: [ENUM-01, ENUM-02, ENUM-03, ENUM-05]

duration: 8min
completed: 2026-02-27
---

# Plan 274-01: SSoT DeFi Enums + Notification Events + i18n Summary

**DeFi SSoT enums (POSITION_CATEGORIES, POSITION_STATUSES) with Zod validation, 4 DeFi notification events, defi_monitoring category, and bilingual i18n templates**

## Performance

- **Duration:** 8 min
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Created packages/core/src/enums/defi.ts with 6 exports (2 arrays, 2 types, 2 Zod enums)
- Extended NOTIFICATION_EVENT_TYPES from 44 to 48 entries with 4 DeFi monitoring events
- Added defi_monitoring as 7th notification category with correct event mappings
- Added LIQUIDATION_IMMINENT to BROADCAST_EVENTS for unconditional delivery
- Added English and Korean i18n templates for all 4 DeFi events
- Updated all tests (enum counts, DeFi enum validation, category mapping assertions)

## Task Commits

1. **Task 1+2: DeFi enums + notifications + i18n + tests** - `431c31cd` (feat)

## Files Created/Modified
- `packages/core/src/enums/defi.ts` - New DeFi SSoT enum file (POSITION_CATEGORIES, POSITION_STATUSES)
- `packages/core/src/enums/notification.ts` - Added 4 DeFi notification events
- `packages/core/src/enums/index.ts` - Re-export defi.ts symbols
- `packages/core/src/schemas/signing-protocol.ts` - Added defi_monitoring category, event mappings, descriptions
- `packages/core/src/i18n/en.ts` - English templates for 4 DeFi events
- `packages/core/src/i18n/ko.ts` - Korean templates for 4 DeFi events
- `packages/core/src/index.ts` - Re-export POSITION_CATEGORIES/POSITION_STATUSES
- `packages/daemon/src/notifications/notification-service.ts` - Added LIQUIDATION_IMMINENT to BROADCAST_EVENTS
- `packages/core/src/__tests__/enums.test.ts` - DeFi enum tests + count updates
- `packages/core/src/__tests__/signing-protocol.test.ts` - DeFi category mapping tests

## Decisions Made
- LIQUIDATION_IMMINENT mapped to security_alert (not defi_monitoring) because imminent fund loss warrants broadcast to ALL channels
- Combined Task 1 and Task 2 into single commit since they are tightly coupled (notification events need i18n templates to compile)

## Deviations from Plan
- Added POSITION_CATEGORIES/POSITION_STATUSES to core/src/index.ts (explicit re-export needed since core uses explicit exports, not wildcard)

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DeFi enum types available for import via @waiaas/core
- Plan 274-02 (DB migration) can now use POSITION_CATEGORIES/POSITION_STATUSES for CHECK constraints
- Plan 274-03 (interfaces) can now use PositionCategory/PositionStatus types

---
*Phase: 274-ssot-enums-db-migration-core-interfaces*
*Completed: 2026-02-27*
