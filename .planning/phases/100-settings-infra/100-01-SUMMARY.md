---
phase: 100-settings-infra
plan: 01
subsystem: database
tags: [drizzle, sqlite, aes-gcm, hkdf, migration, settings, crypto]

# Dependency graph
requires:
  - phase: 95-token-registry
    provides: "v4 migration pattern, token_registry table"
provides:
  - "settings Drizzle ORM table (Table 10) with key/value/encrypted/category/updated_at"
  - "v5 schema migration for existing DB upgrades"
  - "settings-crypto AES-256-GCM encrypt/decrypt with HKDF key derivation"
  - "CREDENTIAL_KEYS set for sensitive settings identification"
affects: [100-02-settings-service, admin-settings-api, notifications-config]

# Tech tracking
tech-stack:
  added: []
  patterns: [HKDF-SHA256 lightweight key derivation for settings, fixed salt deterministic subkey]

key-files:
  created:
    - packages/daemon/src/infrastructure/settings/settings-crypto.ts
    - packages/daemon/src/__tests__/settings-schema-migration.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/daemon/src/__tests__/migration-runner.test.ts

key-decisions:
  - "HKDF(SHA-256) with fixed salt for settings encryption -- lightweight vs Argon2id (300ms+) for frequent reads"
  - "Encrypted format: base64(JSON({iv,ct,tag})) with hex-encoded fields for DB text storage"
  - "CREDENTIAL_KEYS set defines which settings keys require encryption at rest"

patterns-established:
  - "Settings credential encryption: HKDF subkey from master password, AES-256-GCM per-value with random IV"
  - "v5 migration: simple CREATE TABLE (no 12-step recreation needed)"

# Metrics
duration: 4min
completed: 2026-02-13
---

# Phase 100 Plan 01: Settings Infra Summary

**Settings key-value table (Drizzle + v5 migration) with AES-256-GCM HKDF credential encryption for operational config DB storage**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-13T14:04:31Z
- **Completed:** 2026-02-13T14:09:05Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Settings table (Table 10) added to Drizzle schema with key, value, encrypted, category, updated_at columns
- Schema version 5 migration registered for existing DB upgrades; LATEST_SCHEMA_VERSION bumped to 5
- settings-crypto module provides HKDF(SHA-256) key derivation + AES-256-GCM encrypt/decrypt for credential values
- 21 new tests covering v5 migration, fresh DB, data preservation, crypto round-trip, wrong password, unicode, CREDENTIAL_KEYS

## Task Commits

Each task was committed atomically:

1. **Task 1: settings table Drizzle schema + DDL + v5 migration** - `cf221ea` (feat)
2. **Task 2: settings-crypto AES-GCM module + integration tests** - `15db6a9` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/schema.ts` - Added settings table (Table 10) Drizzle definition
- `packages/daemon/src/infrastructure/database/migrate.ts` - Added settings DDL, v5 migration, LATEST_SCHEMA_VERSION=5
- `packages/daemon/src/infrastructure/database/index.ts` - Added settings to barrel export
- `packages/daemon/src/infrastructure/settings/settings-crypto.ts` - AES-256-GCM encrypt/decrypt + HKDF + CREDENTIAL_KEYS
- `packages/daemon/src/__tests__/settings-schema-migration.test.ts` - 21 tests for migration + crypto
- `packages/daemon/src/__tests__/migration-runner.test.ts` - Updated version expectations from 4 to 5

## Decisions Made
- Used HKDF(SHA-256) instead of Argon2id for settings key derivation -- settings are read frequently on every admin page load, so the lightweight KDF (vs 300ms+ Argon2id) is appropriate. Security is adequate since the master password already passes Argon2id verification at daemon start.
- Fixed HKDF salt ('waiaas-settings-v1') ensures deterministic key derivation from the same master password, enabling decrypt without per-entry salt storage.
- Encrypted value format uses base64-wrapped JSON with hex-encoded fields for clean storage in TEXT columns.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated migration-runner.test.ts version expectations from 4 to 5**
- **Found during:** Task 1 (verification step)
- **Issue:** Existing tests hardcoded `getMaxVersion().toBe(4)` which failed after LATEST_SCHEMA_VERSION bump to 5
- **Fix:** Updated 3 test expectations from 4 to 5, added v5 to the "skip already applied" test
- **Files modified:** packages/daemon/src/__tests__/migration-runner.test.ts
- **Verification:** All 19 migration-runner tests pass
- **Committed in:** cf221ea (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test fix was necessary consequence of version bump. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Settings table and crypto module ready for Plan 02 (SettingsService CRUD layer)
- CREDENTIAL_KEYS set ready for SettingsService to auto-encrypt/decrypt sensitive values
- v5 migration tested for both fresh DB and existing v4 DB upgrade paths

## Self-Check: PASSED

All 7 files verified present. Both commit hashes (cf221ea, 15db6a9) confirmed in git log.

---
*Phase: 100-settings-infra*
*Completed: 2026-02-13*
