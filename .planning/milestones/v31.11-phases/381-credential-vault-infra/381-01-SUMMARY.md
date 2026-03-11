---
phase: 381-credential-vault-infra
plan: 01
subsystem: auth
tags: [credential-vault, aes-256-gcm, hkdf, zod, sqlite, drizzle]

requires:
  - phase: 380-resolved-action-type-system
    provides: credentialRef field in SignedDataAction/SignedHttpAction, SigningParams credential injection point
provides:
  - ICredentialVault CRUD+rotate 5-method interface
  - 5 credential types (api-key, hmac-secret, rsa-private-key, session-token, custom)
  - wallet_credentials DB schema (AES-256-GCM, HKDF domain separation)
  - per-wallet -> global fallback scope model
  - credentialRef UUID/{walletId}:{name} resolution logic
  - credential lifecycle (create/rotate/expire/delete)
  - sessionAuth+masterAuth authentication model
  - REST API mapping (7 endpoints)
  - re-encrypt/backup integration paths
affects: [382-signer-capabilities, 383-pipeline-routing, 385-design-doc-integration]

tech-stack:
  added: []
  patterns: [AES-256-GCM per-record encryption, HKDF domain-separated subkey derivation, AAD context binding]

key-files:
  created:
    - .planning/phases/381-credential-vault-infra/design/credential-vault-design.md
  modified: []

key-decisions:
  - "auth_tag stored as separate column for debuggability (not concatenated with ciphertext)"
  - "node:crypto for credential encryption (not sodium-native) to limit dependency scope"
  - "AAD includes credentialId for cipher text relocation attack prevention"
  - "credential history preservation deferred to v2 (v1 overwrites on rotate)"
  - "expiry check at get() time (lazy evaluation) rather than periodic scan"
  - "ON DELETE CASCADE for wallet FK to prevent orphan credentials"

patterns-established:
  - "CredentialVault per-record encryption: AES-256-GCM with HKDF subkey + 12-byte random IV + AAD binding"
  - "credentialRef resolution: UUID direct lookup or walletId:name -> per-wallet first -> global fallback"
  - "masterAuth required for credential lifecycle changes (create/delete/rotate)"

requirements-completed: [CRED-01, CRED-02, CRED-03, CRED-04, CRED-05, CRED-06, CRED-07]

duration: 8min
completed: 2026-03-11
---

# Phase 381 Plan 01: CredentialVault Design Summary

**ICredentialVault CRUD interface with AES-256-GCM per-record encryption, HKDF domain separation, per-wallet/global scope model, and credentialRef resolution logic**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-11T14:47:31Z
- **Completed:** 2026-03-11T14:55:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- ICredentialVault interface with 5 methods (create/get/list/delete/rotate) fully designed
- 5 credential types with Zod enum and per-type metadata structures
- wallet_credentials DB schema (v55) with AES-256-GCM encryption, HKDF domain separation, AAD binding
- per-wallet -> global fallback scope model with credentialRef resolution (UUID and walletId:name)
- Credential lifecycle (create/rotate/expire/delete) with state diagram
- sessionAuth+masterAuth authentication model with 7 REST API endpoints
- re-encrypt/backup integration paths documented
- SignedDataAction/SignedHttpAction connection flow (credential injection at sign() time)

## Task Commits

Each task was committed atomically:

1. **Task 1: CredentialVault design document** - `1e02134c` (feat)

## Files Created/Modified
- `.planning/phases/381-credential-vault-infra/design/credential-vault-design.md` - Complete CredentialVault infrastructure design (13 sections)

## Decisions Made
- auth_tag as separate DB column (not concatenated) for debuggability
- node:crypto for AES-256-GCM (not sodium-native) to limit dependency scope
- AAD includes credentialId to prevent cipher text relocation attacks
- Credential history preservation deferred to v2 (v1 overwrites on rotate)
- Expiry check at get() time (lazy evaluation)
- ON DELETE CASCADE on wallet FK to prevent orphan credentials
- masterAuth required for all credential lifecycle changes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CredentialVault design complete, ready for Phase 382 (Signer Capabilities) and Phase 383 (Pipeline Routing)
- credentialRef resolution logic ready for pipeline integration

---
*Phase: 381-credential-vault-infra*
*Completed: 2026-03-11*
