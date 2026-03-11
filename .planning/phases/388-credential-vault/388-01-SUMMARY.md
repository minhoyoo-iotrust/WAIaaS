---
phase: 388-credential-vault
plan: 01
subsystem: infra
tags: [aes-256-gcm, hkdf, credential-vault, zod, drizzle]

requires:
  - phase: 386-type-system-errors-db
    provides: wallet_credentials DB table (v55), CREDENTIAL_NOT_FOUND/CREDENTIAL_EXPIRED error codes
provides:
  - ICredentialVault interface and LocalCredentialVault implementation
  - AES-256-GCM credential crypto with HKDF domain separation
  - CredentialTypeEnum 5-type Zod SSoT
  - reEncryptCredentials() for master password change integration
affects: [388-02, 389, 390, 391, 392]

tech-stack:
  added: []
  patterns: [credential-crypto domain separation via HKDF salt/info, AAD-bound encryption per credential]

key-files:
  created:
    - packages/core/src/schemas/credential.schema.ts
    - packages/daemon/src/infrastructure/credential/credential-crypto.ts
    - packages/daemon/src/infrastructure/credential/credential-vault.ts
    - packages/daemon/src/infrastructure/credential/index.ts
    - packages/daemon/src/__tests__/credential-vault.test.ts
  modified:
    - packages/core/src/schemas/index.ts
    - packages/core/src/index.ts
    - packages/daemon/src/infrastructure/keystore/re-encrypt.ts
    - packages/daemon/src/api/routes/admin-auth.ts
    - packages/daemon/src/__tests__/re-encrypt.test.ts

key-decisions:
  - "HKDF domain separation: credential-vault salt/info vs settings-crypto salt/info ensures same master password derives different keys"
  - "AAD format {id}:{walletId|global}:{type} prevents cross-credential substitution attacks"
  - "ACTION_VALIDATION_FAILED error code for duplicate credential name (not a new error code) to maintain existing error code set"
  - "Pre-check for duplicate names before INSERT (SQLite NULL != NULL for unique indexes on global credentials)"

patterns-established:
  - "Credential crypto pattern: HKDF key derivation -> AES-256-GCM with AAD -> zero key from memory"
  - "ICredentialVault interface: create/get/list/delete/rotate with per-wallet priority resolution"

requirements-completed: [CRED-01, CRED-02, CRED-03, CRED-04, CRED-07, CRED-08, CRED-10, CRED-11]

duration: 12min
completed: 2026-03-12
---

# Phase 388 Plan 01: ICredentialVault + Crypto + LocalCredentialVault Summary

**AES-256-GCM credential vault with HKDF domain-separated encryption, per-wallet/global priority resolution, and master password re-encrypt integration**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-11T18:47:56Z
- **Completed:** 2026-03-11T19:00:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- CredentialTypeEnum 5-type Zod SSoT with full type derivation chain
- AES-256-GCM credential encryption with HKDF domain separation from settings-crypto and AAD binding
- LocalCredentialVault with create/get/list/delete/rotate and per-wallet > global priority resolution
- reEncryptCredentials() integrated into changeMasterPassword API (keystore + settings + credentials 3-way re-encrypt)
- 25 new tests (21 vault + 4 re-encrypt) all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Credential Zod schemas + crypto + LocalCredentialVault (TDD)** - `56c7469f` (feat)
2. **Task 2: Master Password re-encrypt integration** - `830c74ad` (feat)

## Files Created/Modified
- `packages/core/src/schemas/credential.schema.ts` - CredentialTypeEnum, CreateCredentialParams, CredentialMetadata, DecryptedCredential Zod schemas
- `packages/daemon/src/infrastructure/credential/credential-crypto.ts` - deriveCredentialKey, encryptCredential, decryptCredential with HKDF domain separation
- `packages/daemon/src/infrastructure/credential/credential-vault.ts` - ICredentialVault interface + LocalCredentialVault implementation
- `packages/daemon/src/infrastructure/credential/index.ts` - barrel export
- `packages/daemon/src/infrastructure/keystore/re-encrypt.ts` - added reEncryptCredentials()
- `packages/daemon/src/api/routes/admin-auth.ts` - integrated reEncryptCredentials in changeMasterPassword handler

## Decisions Made
- Used HKDF domain separation (different salt/info from settings-crypto) to ensure same master password derives different keys for credentials vs settings
- AAD format "{id}:{walletId|global}:{type}" binds each ciphertext to its credential context
- Used ACTION_VALIDATION_FAILED for duplicate credential conflict (existing error code, no new code needed)
- Added pre-INSERT duplicate check for global credentials (SQLite NULL != NULL in unique index)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SQLite NULL unique index bypass for global credentials**
- **Found during:** Task 1 (LocalCredentialVault.create)
- **Issue:** `uniqueIndex('idx_wallet_credentials_wallet_name').on(walletId, name)` does not prevent duplicate global credentials because SQLite treats NULL != NULL in unique constraints
- **Fix:** Added pre-INSERT existence check for same-scope credential name
- **Files modified:** packages/daemon/src/infrastructure/credential/credential-vault.ts
- **Verification:** Test "should throw conflict on duplicate name for same walletId" passes
- **Committed in:** 56c7469f

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ICredentialVault and crypto utilities ready for Plan 388-02 (REST API endpoints)
- reEncryptCredentials integrated, ready for end-to-end password change flow

---
*Phase: 388-credential-vault*
*Completed: 2026-03-12*
