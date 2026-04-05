---
phase: 49-daemon-infra
plan: 02
subsystem: infra
tags: [aes-256-gcm, argon2id, sodium-native, keystore, guarded-memory, ed25519]

# Dependency graph
requires:
  - phase: 48-monorepo-scaffold-core
    provides: ILocalKeyStore interface, WAIaaSError, ChainType enum
provides:
  - AES-256-GCM encryption/decryption with Argon2id KDF
  - Sodium-native guarded memory management
  - LocalKeyStore class implementing ILocalKeyStore (5 methods + lockAll)
  - Keystore file format v1 (JSON, 0600 permissions, atomic write)
  - 32 keystore tests covering all 7 categories
affects: [49-03-config-lifecycle, 50-solana-adapter, 51-api-daemon]

# Tech tracking
tech-stack:
  added: [argon2@0.44.0, sodium-native@4.3.3]
  patterns: [createRequire for CJS native modules in ESM, atomic write-then-rename, guarded memory lifecycle]

key-files:
  created:
    - packages/daemon/src/infrastructure/keystore/crypto.ts
    - packages/daemon/src/infrastructure/keystore/memory.ts
    - packages/daemon/src/infrastructure/keystore/keystore.ts
    - packages/daemon/src/infrastructure/keystore/index.ts
    - packages/daemon/src/types/sodium-native.d.ts
    - packages/daemon/src/__tests__/keystore.test.ts
  modified:
    - packages/daemon/vitest.config.ts

key-decisions:
  - "createRequire(import.meta.url) for sodium-native CJS import in ESM context"
  - "Vitest forks pool for sodium mprotect compatibility (threads crash on SIGSEGV)"
  - "INVALID_MASTER_PASSWORD error code for GCM authTag mismatch (wrong password)"
  - "Base58 encoding inline (no external dependency) for Solana public key format"
  - "KEYSTORE_LOCKED error code for unsupported keystore version (closest available)"

patterns-established:
  - "Native CJS module import: createRequire(import.meta.url) pattern for ESM"
  - "Guarded memory lifecycle: allocate -> write -> readonly -> zero -> noaccess"
  - "Atomic file write: writeFile to .tmp -> rename to target"
  - "Keystore file v1: JSON with version/crypto/metadata, 0600 permissions"

# Metrics
duration: 9min
completed: 2026-02-10
---

# Phase 49 Plan 02: Keystore Summary

**AES-256-GCM keystore with Argon2id KDF (m=64MiB, t=3, p=4), sodium-native guarded memory, and 32 tests covering encrypt/decrypt/sign round-trip**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-09T16:57:55Z
- **Completed:** 2026-02-09T17:06:35Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Crypto module: AES-256-GCM encrypt/decrypt with Argon2id key derivation (doc 26 compliant)
- Memory module: sodium-native guarded memory (allocate, writeToGuarded, zeroAndRelease)
- LocalKeyStore: implements ILocalKeyStore with generateKeyPair (Solana Ed25519), decryptPrivateKey, releaseKey, hasKey, deleteKey, lockAll
- Keystore file format v1: JSON with version/id/chain/network/publicKey/crypto/metadata, atomic writes, 0600 permissions
- 32 test assertions covering: KDF, encrypt/decrypt, wrong password, file format, permissions, full round-trip with signing, guarded memory

## Task Commits

Each task was committed atomically:

1. **Task 1: Crypto + memory + LocalKeyStore class** - `17d5c96` (feat)
2. **Task 2: Keystore tests** - `ea97694` (test)

## Files Created/Modified
- `packages/daemon/src/infrastructure/keystore/crypto.ts` - AES-256-GCM encrypt/decrypt + Argon2id KDF (deriveKey, encrypt, decrypt)
- `packages/daemon/src/infrastructure/keystore/memory.ts` - Sodium guarded memory (allocateGuarded, writeToGuarded, zeroAndRelease, isAvailable)
- `packages/daemon/src/infrastructure/keystore/keystore.ts` - LocalKeyStore class implementing ILocalKeyStore with Ed25519 keypair generation, file I/O, base58
- `packages/daemon/src/infrastructure/keystore/index.ts` - Barrel export for keystore module
- `packages/daemon/src/types/sodium-native.d.ts` - TypeScript declarations for sodium-native (no @types package exists)
- `packages/daemon/src/__tests__/keystore.test.ts` - 32 tests across 7 categories
- `packages/daemon/vitest.config.ts` - Added forks pool for sodium mprotect compatibility

## Decisions Made
- **createRequire for native CJS modules:** sodium-native is CJS-only; used `createRequire(import.meta.url)` pattern for ESM compatibility with `verbatimModuleSyntax`
- **Vitest forks pool:** sodium's mprotect_noaccess/mprotect_readonly cause SIGSEGV (not catchable JS error) which crashes thread workers; forks pool isolates each test file in its own process
- **INVALID_MASTER_PASSWORD for wrong password:** Mapped GCM authTag mismatch to the existing `INVALID_MASTER_PASSWORD` error code from @waiaas/core
- **Inline base58 encoding:** Avoided adding a dependency for a simple encoding function; implemented Bitcoin-alphabet base58 directly
- **Custom sodium-native type declarations:** sodium-native has no @types package; created minimal .d.ts covering only the APIs used by keystore module

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
- **Sodium SIGSEGV in thread workers:** Vitest default `threads` pool caused `Channel closed` errors because sodium's mprotect operations trigger SIGSEGV when accessed after noaccess/readonly. Resolved by switching to `forks` pool.
- **No @types/sodium-native:** Created custom type declarations in `src/types/sodium-native.d.ts` covering the subset of APIs used.

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- Keystore module complete, ready for integration with daemon lifecycle (49-03)
- LocalKeyStore.lockAll() ready for graceful shutdown integration
- Ed25519 key generation ready for Solana adapter (Phase 50)
- All native addon dependencies (sodium-native, argon2) verified working

## Self-Check: PASSED

---
*Phase: 49-daemon-infra*
*Completed: 2026-02-10*
