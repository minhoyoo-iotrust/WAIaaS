---
phase: 311-encrypted-backup-restore
plan: 01
subsystem: infra
tags: [aes-256-gcm, argon2id, backup, sqlite, vacuum-into, binary-format, hono]

# Dependency graph
requires:
  - phase: 306-design-spec
    provides: OPS-03 Encrypted Backup design (archive format, KDF params, REST API)
provides:
  - EncryptedBackupService (createBackup, listBackups, inspectBackup, pruneBackups, decryptBackup)
  - 60-byte binary archive format (WAIAAS magic + metadata + AES-256-GCM payload)
  - POST /v1/admin/backup and GET /v1/admin/backups REST API endpoints
  - backup-format.ts binary utilities (writeArchive, readArchiveHeader, readArchiveMetadata, encodeEntries, decodeEntries)
  - config.toml [backup] section (dir, interval, retention_count)
affects: [311-02, 311-03, admin-ui, cli]

# Tech tracking
tech-stack:
  added: []
  patterns: [VACUUM INTO for atomic DB snapshots, 60B fixed binary header, plaintext metadata + encrypted payload]

key-files:
  created:
    - packages/daemon/src/infrastructure/backup/backup-format.ts
    - packages/daemon/src/infrastructure/backup/encrypted-backup-service.ts
    - packages/daemon/src/__tests__/backup-format.test.ts
    - packages/daemon/src/__tests__/encrypted-backup-service.test.ts
    - packages/daemon/src/__tests__/api-admin-backup.test.ts
  modified:
    - packages/daemon/src/infrastructure/backup/index.ts
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts

key-decisions:
  - "Used BACKUP_CORRUPTED error code for VACUUM INTO failures instead of non-existent INTERNAL_ERROR"
  - "Added config.toml [backup] section early (pulled forward from 311-03) to fix typecheck blocking on DaemonConfig.backup property"
  - "Added retryable field to OpenAPI error responses to satisfy ErrorResponseSchema type requirements"
  - "Filename format uses milliseconds (YYYYMMDD-HHmmssSSS) to prevent timestamp collision in rapid backup creation"

patterns-established:
  - "Binary archive format: 60B header (magic+version+reserved+metadataLen+salt+nonce+authTag) + plaintext JSON metadata + encrypted payload"
  - "Entry encoding: [nameLen:uint16 LE][name:UTF-8][dataLen:uint64 LE][data:bytes] for forward-compatible file packing"
  - "VACUUM INTO for atomic SQLite snapshot without blocking WAL writers"

requirements-completed: [BKUP-01, BKUP-02, BKUP-05]

# Metrics
duration: 45min
completed: 2026-03-03
---

# Phase 311 Plan 01: EncryptedBackupService + Binary Archive Format + REST API Summary

**AES-256-GCM encrypted backup service with 60B binary header, VACUUM INTO atomic DB snapshots, and POST/GET admin API endpoints**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-03-03
- **Completed:** 2026-03-03
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Implemented 60-byte fixed binary archive format with WAIAAS magic bytes, plaintext metadata, and encrypted payload
- Built EncryptedBackupService with createBackup (VACUUM INTO + AES-256-GCM), listBackups, inspectBackup, pruneBackups, decryptBackup
- Added POST /v1/admin/backup and GET /v1/admin/backups REST API endpoints with masterAuth
- Wired EncryptedBackupService into DaemonLifecycle (Step 4h, fail-soft) and createApp deps
- Added 4 backup error codes to @waiaas/core (INVALID_BACKUP_FORMAT, UNSUPPORTED_BACKUP_VERSION, BACKUP_CORRUPTED, BACKUP_NOT_FOUND)
- 32 tests passing (12 format + 14 service + 6 API)

## Task Commits

Each task was committed atomically:

1. **Task 1: backup-format.ts + EncryptedBackupService (TDD)** - `6fed576c` (feat)
2. **Task 2: POST /admin/backup + GET /admin/backups REST API** - `71a97085` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/backup/backup-format.ts` - Binary archive format: MAGIC, HEADER_SIZE, writeArchive, readArchiveHeader, readArchiveMetadata, encodeEntries, decodeEntries
- `packages/daemon/src/infrastructure/backup/encrypted-backup-service.ts` - EncryptedBackupService: createBackup (VACUUM INTO + AES-256-GCM), listBackups, inspectBackup, pruneBackups, decryptBackup
- `packages/daemon/src/infrastructure/backup/index.ts` - Re-exports for EncryptedBackupService and backup-format utilities
- `packages/daemon/src/api/routes/admin.ts` - POST /admin/backup and GET /admin/backups route handlers with encryptedBackupService in AdminRouteDeps
- `packages/daemon/src/api/routes/openapi-schemas.ts` - BackupInfoResponseSchema and BackupListResponseSchema
- `packages/daemon/src/api/server.ts` - encryptedBackupService in CreateAppDeps, masterAuth middleware for backup endpoints
- `packages/daemon/src/lifecycle/daemon.ts` - Step 4h: EncryptedBackupService instantiation (fail-soft)
- `packages/daemon/src/infrastructure/config/loader.ts` - [backup] section in DaemonConfigSchema + KNOWN_SECTIONS
- `packages/core/src/errors/error-codes.ts` - 4 new ADMIN domain error codes for backup operations
- `packages/core/src/i18n/en.ts` - English translations for backup error codes
- `packages/core/src/i18n/ko.ts` - Korean translations for backup error codes
- `packages/daemon/src/__tests__/backup-format.test.ts` - 12 tests for binary format utilities
- `packages/daemon/src/__tests__/encrypted-backup-service.test.ts` - 14 tests for service (round-trip, VACUUM INTO, prune, wrong password)
- `packages/daemon/src/__tests__/api-admin-backup.test.ts` - 6 tests for REST API (Hono app.request)

## Decisions Made
- Used BACKUP_CORRUPTED error code for VACUUM INTO failures (no INTERNAL_ERROR in error-codes.ts)
- Pulled [backup] config section forward from Plan 311-03 to fix typecheck blocking (DaemonConfig.backup property needed by admin.ts and daemon.ts)
- Filename timestamps include milliseconds (YYYYMMDD-HHmmssSSS) to prevent collision when multiple backups created within same second
- Added retryable: false to non-200 route responses to satisfy ErrorResponseSchema type contract
- Used Host header in Hono app.request() tests to pass hostGuard middleware

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added 4 error codes to @waiaas/core**
- **Found during:** Task 1 (backup-format.ts)
- **Issue:** WAIaaSError constructor requires valid error codes from error-codes.ts; INVALID_BACKUP_FORMAT, UNSUPPORTED_BACKUP_VERSION, BACKUP_CORRUPTED, BACKUP_NOT_FOUND not defined
- **Fix:** Added error codes with i18n translations (en.ts, ko.ts)
- **Files modified:** packages/core/src/errors/error-codes.ts, packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Verification:** Tests pass, typecheck passes
- **Committed in:** 6fed576c (Task 1 commit)

**2. [Rule 3 - Blocking] Pulled config.toml [backup] section from Plan 311-03**
- **Found during:** Task 2 (REST API typecheck)
- **Issue:** admin.ts references `deps.daemonConfig?.backup?.retention_count` and daemon.ts references `this._config!.backup?.dir` but backup section not yet in DaemonConfigSchema
- **Fix:** Added backup section to DaemonConfigSchema and 'backup' to KNOWN_SECTIONS (originally Plan 311-03 Task 1)
- **Files modified:** packages/daemon/src/infrastructure/config/loader.ts
- **Verification:** Typecheck passes, all tests pass
- **Committed in:** 71a97085 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed OpenAPI route handler type mismatches**
- **Found during:** Task 2 (REST API typecheck)
- **Issue:** ErrorResponseSchema requires `retryable` field; 501/401 responses missing it. Also needed to add 501/401 to OpenAPI route response definitions.
- **Fix:** Added `retryable: false` to error response objects; added 401/501 response schemas to route definitions; imported ErrorResponseSchema
- **Files modified:** packages/daemon/src/api/routes/admin.ts
- **Verification:** Typecheck passes
- **Committed in:** 71a97085 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All auto-fixes necessary for correctness and compilation. [backup] config section pulled forward from Plan 311-03 reduces that plan's scope.

## Issues Encountered
- WAIaaSError assertion pattern: `.toThrow('CODE')` checks message not code; switched to try/catch with `err.code` check
- Hono app.request() silently fails without Host header due to hostGuard middleware returning 503; fixed by adding explicit Host header
- pushSchema requires raw better-sqlite3 instance (conn.sqlite), not Drizzle DB

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- EncryptedBackupService ready for CLI commands (Plan 311-02)
- [backup] config section already added; Plan 311-03 only needs BackupWorker + config tests
- All backup-format utilities exported for CLI import

---
*Phase: 311-encrypted-backup-restore*
*Completed: 2026-03-03*
