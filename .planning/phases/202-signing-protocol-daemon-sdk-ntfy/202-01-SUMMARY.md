---
phase: 202-signing-protocol-daemon-sdk-ntfy
plan: 01
subsystem: infra
tags: [zod, signing-protocol, sqlite-migration, settings, base64url, wallet-link-registry]

# Dependency graph
requires: []
provides:
  - "SIGNING domain error codes (7 codes: WALLET_NOT_REGISTERED, SIGNING_SDK_DISABLED, SIGN_REQUEST_NOT_FOUND, SIGN_REQUEST_EXPIRED, SIGNER_ADDRESS_MISMATCH, INVALID_SIGN_RESPONSE, SIGN_REQUEST_ALREADY_PROCESSED)"
  - "SignRequest/SignResponse Zod schemas with base64url encode/decode and universal link URL builder"
  - "APPROVAL_METHODS array and ApprovalMethodSchema (sdk_ntfy, sdk_telegram, walletconnect, telegram_bot, rest)"
  - "DB migration v18: wallets.owner_approval_method column with CHECK constraint"
  - "signing_sdk settings category (7 keys: enabled, request_expiry_min, preferred_channel, preferred_wallet, ntfy_request_topic_prefix, ntfy_response_topic_prefix, wallets)"
  - "WalletLinkRegistry service for wallet link config CRUD + universal link URL generation"
affects: [202-02, 202-03, 202-04, 203]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "base64url encoding via Node.js 22 Buffer (no external deps)"
    - "discriminatedUnion on 'type' for ResponseChannel (ntfy/telegram)"
    - "SettingsService JSON array storage for WalletLinkRegistry"

key-files:
  created:
    - "packages/core/src/schemas/signing-protocol.ts"
    - "packages/daemon/src/services/signing-sdk/wallet-link-registry.ts"
    - "packages/core/src/__tests__/signing-protocol.test.ts"
    - "packages/daemon/src/__tests__/signing-sdk-migration.test.ts"
    - "packages/daemon/src/__tests__/wallet-link-registry.test.ts"
  modified:
    - "packages/core/src/errors/error-codes.ts"
    - "packages/core/src/index.ts"
    - "packages/core/src/i18n/en.ts"
    - "packages/core/src/i18n/ko.ts"
    - "packages/daemon/src/infrastructure/database/migrate.ts"
    - "packages/daemon/src/infrastructure/database/schema.ts"
    - "packages/daemon/src/infrastructure/settings/setting-keys.ts"

key-decisions:
  - "Error codes count is 100 (not 81 as plan suggested) because existing codebase already had 93 codes, not 74"
  - "Added CHECK constraint to fresh DDL for owner_approval_method (5 valid values + NULL) matching APPROVAL_METHODS array"
  - "WalletLinkRegistry stores config as JSON array in SettingsService rather than separate DB table"
  - "Added i18n messages (en/ko) for all 7 SIGNING error codes"

patterns-established:
  - "Signing SDK service pattern: inject SettingsService, store JSON in setting key, parse with Zod on read"
  - "base64url encode/decode for protocol data in URL query parameters"

requirements-completed: [PROTO-02, WALLET-01, WALLET-02, WALLET-03, CONF-01, CONF-02]

# Metrics
duration: ~45min
completed: 2026-02-20
---

# Phase 202 Plan 01: Signing Protocol Infrastructure Summary

**SIGNING domain error codes, SignRequest/SignResponse Zod schemas with base64url encoding, DB migration v18 (wallets.owner_approval_method), 7 signing_sdk settings keys, and WalletLinkRegistry service**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-02-20
- **Completed:** 2026-02-20
- **Tasks:** 2/2
- **Files modified:** 17

## Accomplishments
- Registered 7 SIGNING domain error codes with i18n support (en/ko), bringing total to 100 error codes across 12 domains
- Created complete Signing Protocol Zod schemas (SignRequest, SignResponse, WalletLinkConfig, ApprovalMethod, ResponseChannel) with base64url encode/decode and universal link URL builder
- Added DB migration v18 adding wallets.owner_approval_method column with 5-value CHECK constraint
- Registered 7 signing_sdk settings keys enabling runtime configuration via Admin UI
- Created WalletLinkRegistry service for wallet link config CRUD with URL generation

## Task Commits

Each task was committed atomically:

1. **Task 1: Signing SDK error codes + Signing Protocol Zod schemas + base64url utilities** - `8c7f927` (feat)
2. **Task 2: DB migration v18 + Settings keys + WalletLinkRegistry** - `777bf94` (feat)

## Files Created/Modified

### Created
- `packages/core/src/schemas/signing-protocol.ts` - SignRequest/SignResponse Zod schemas, APPROVAL_METHODS, base64url utilities, buildUniversalLinkUrl
- `packages/daemon/src/services/signing-sdk/wallet-link-registry.ts` - WalletLinkRegistry class with CRUD + URL generation
- `packages/core/src/__tests__/signing-protocol.test.ts` - 40 tests for schemas, encoding, URL builder
- `packages/daemon/src/__tests__/signing-sdk-migration.test.ts` - v18 migration verification tests
- `packages/daemon/src/__tests__/wallet-link-registry.test.ts` - Registry CRUD and error handling tests

### Modified
- `packages/core/src/errors/error-codes.ts` - Added SIGNING domain (7 error codes), ErrorDomain union
- `packages/core/src/index.ts` - Re-exports for signing-protocol schemas/types/utilities
- `packages/core/src/i18n/en.ts` - English messages for 7 SIGNING error codes
- `packages/core/src/i18n/ko.ts` - Korean messages for 7 SIGNING error codes
- `packages/core/src/__tests__/errors.test.ts` - Updated counts (100 codes, 12 domains)
- `packages/core/src/__tests__/i18n.test.ts` - Updated message count to 100
- `packages/core/src/__tests__/package-exports.test.ts` - Updated ERROR_CODES length to 100
- `packages/daemon/src/infrastructure/database/migrate.ts` - LATEST_SCHEMA_VERSION 18, v18 migration, updated DDL
- `packages/daemon/src/infrastructure/database/schema.ts` - Added ownerApprovalMethod to wallets
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - Added signing_sdk category + 7 keys
- `packages/daemon/src/__tests__/database.test.ts` - Updated wallets column count 13->14
- `packages/daemon/src/__tests__/enum-db-consistency.test.ts` - Updated CHECK count 12->13
- `packages/daemon/src/__tests__/migration-runner.test.ts` - Version references 17->18
- `packages/daemon/src/__tests__/migration-v14.test.ts` - LATEST_SCHEMA_VERSION 17->18
- `packages/daemon/src/__tests__/migration-v6-v8.test.ts` - LATEST_SCHEMA_VERSION 17->18
- `packages/daemon/src/__tests__/migration-chain.test.ts` - Final version 17->18
- `packages/daemon/src/__tests__/settings-schema-migration.test.ts` - Schema version 17->18
- `packages/daemon/src/__tests__/settings-service.test.ts` - Added signing_sdk category, count 56->63

## Decisions Made
- Error codes total is 100 (plan estimated 81 based on outdated count of 74; actual baseline was 93)
- Added CHECK constraint to fresh DDL for owner_approval_method matching APPROVAL_METHODS array (5 valid values + NULL for global fallback)
- WalletLinkRegistry stores config as JSON array in SettingsService ('signing_sdk.wallets') rather than a separate DB table, keeping the pattern lightweight
- Added i18n messages (en/ko) for all 7 SIGNING error codes to maintain parity with existing error code convention

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated 8 existing test files for LATEST_SCHEMA_VERSION bump**
- **Found during:** Task 2
- **Issue:** Bumping LATEST_SCHEMA_VERSION from 17 to 18 caused cascading failures across 8 test files that hardcoded version numbers
- **Fix:** Updated all version references in migration-runner.test.ts, migration-v14.test.ts, migration-v6-v8.test.ts, migration-chain.test.ts, settings-schema-migration.test.ts, database.test.ts, enum-db-consistency.test.ts, settings-service.test.ts
- **Files modified:** 8 test files
- **Verification:** All 2524 daemon tests pass
- **Committed in:** 777bf94 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added i18n messages for SIGNING error codes**
- **Found during:** Task 1
- **Issue:** Plan did not mention i18n messages but existing convention requires en.ts/ko.ts entries for all error codes; i18n tests would fail without them
- **Fix:** Added 7 English and 7 Korean messages for SIGNING domain error codes
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Verification:** i18n.test.ts passes with count 100
- **Committed in:** 8c7f927 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both auto-fixes necessary for test suite integrity. No scope creep.

## Issues Encountered
None - all issues were anticipated cascading effects from version bump and error code additions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SIGNING error codes available for SignRequestBuilder and SignResponseHandler (Plan 202-02)
- SignRequest/SignResponse Zod schemas ready for @waiaas/wallet-sdk (Plan 202-03)
- WalletLinkRegistry ready for NtfySigningChannel integration (Plan 202-04)
- signing_sdk settings keys ready for runtime configuration
- DB migration v18 ready for owner_approval_method usage in Phase 203

---
*Phase: 202-signing-protocol-daemon-sdk-ntfy*
*Completed: 2026-02-20*

## Self-Check: PASSED

All 12 claimed files exist. Both commit hashes (8c7f927, 777bf94) verified in git log.
