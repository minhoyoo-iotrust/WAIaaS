---
phase: 430-as-any-removal
plan: 01
subsystem: infra
tags: [typescript, as-any, zod, type-safety, safeJsonParse]

requires:
  - phase: 427
    provides: safeJsonParse utility, POLICY_RULES_SCHEMAS
provides:
  - typed DB client extraction via getSqliteClient() helper
  - NULL_POLICY_ENGINE null-object pattern for stage 5-6 re-entry
  - Zod-validated JSON.parse in daemon, notification, JWT secret manager
  - as any removal from WC, daemon, signing files (21 sites)
affects: [430-03, 431]

tech-stack:
  added: []
  patterns: [getSqliteClient typed helper, NULL_POLICY_ENGINE null-object, safeJsonParse for DB JSON]

key-files:
  created: []
  modified:
    - packages/daemon/src/api/routes/wc.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/services/wc-session-service.ts
    - packages/daemon/src/signing/capabilities/eip712-signer.ts
    - packages/daemon/src/services/x402/payment-signer.ts
    - packages/daemon/src/notifications/notification-service.ts
    - packages/daemon/src/infrastructure/jwt/jwt-secret-manager.ts

key-decisions:
  - "getSqliteClient uses (db as unknown as { $client }) pattern since .$client is available but not exposed in BetterSQLite3Database generic"
  - "NULL_POLICY_ENGINE returns { allowed: true, tier: 'INSTANT' } for stages 5-6 re-entry where policy is already evaluated"
  - "Solana @solana/kit branded type uses @ts-expect-error (not as any) per CAST-07 convention"
  - "EIP-712 domain/types/message cast to Record<string, unknown> instead of as any for viem signTypedData"

patterns-established:
  - "getSqliteClient(db): typed helper for raw better-sqlite3 client extraction from Drizzle"
  - "NULL_POLICY_ENGINE: null-object for IPolicyEngine when policy evaluation is not needed"

requirements-completed: [CAST-01, CAST-03, CAST-05, CAST-06, CAST-08, ZOD-10, ZOD-11, ZOD-12]

duration: 15min
completed: 2026-03-16
---

# Phase 430 Plan 01: WC/Daemon/Signing as any Removal + JSON.parse Zod Validation

**Removed 21 as any casts from wc.ts, daemon.ts, wc-session-service.ts, signing files and added Zod validation to 7 JSON.parse calls**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-16T06:05:16Z
- **Completed:** 2026-03-16T06:20:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Replaced 8 (db as any).session?.client with getSqliteClient() typed helper in wc.ts
- Replaced server as any with http.Server cast and policyEngine null as any with NULL_POLICY_ENGINE
- Added Zod safeParse to 7 JSON.parse calls (keystore, tx metadata, typed_data_json, notify events/categories, JWT secrets)

## Task Commits

1. **Task 1: wc.ts DB client + daemon.ts + wc-session-service.ts + signing as any removal** - `19c92f58` (fix)
2. **Task 2: JSON.parse Zod validation** - `c00c125e` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/wc.ts` - getSqliteClient helper, 8 as any removed
- `packages/daemon/src/lifecycle/daemon.ts` - http.Server cast, NULL_POLICY_ENGINE, Zod keystore/metadata validation
- `packages/daemon/src/services/wc-session-service.ts` - typed ESM interop, IKeyValueStorage cast
- `packages/daemon/src/signing/capabilities/eip712-signer.ts` - Record<string, unknown> assertions
- `packages/daemon/src/services/x402/payment-signer.ts` - @ts-expect-error for Solana branded types
- `packages/daemon/src/notifications/notification-service.ts` - safeJsonParse for notify_events/categories
- `packages/daemon/src/infrastructure/jwt/jwt-secret-manager.ts` - StoredSecretSchema validation

## Decisions Made
- Used (db as unknown as { $client }) instead of Drizzle .$client directly due to generic limitations
- NULL_POLICY_ENGINE pattern chosen over IPolicyEngine | null to avoid null checks in stage code
- Solana branded types use @ts-expect-error per established CAST-07 convention

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Plan 01 as any removals complete, ready for Plan 02/03

---
*Phase: 430-as-any-removal*
*Completed: 2026-03-16*
