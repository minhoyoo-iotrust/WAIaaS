---
phase: 83-keystore-multicurve
plan: 01
subsystem: keystore
tags: [secp256k1, ed25519, viem, eip-55, aes-256-gcm, multicurve, keystore]

# Dependency graph
requires:
  - phase: 82-config-networktype-evm-deps
    provides: "ChainType enum, NetworkType enum, EVM RPC config, validateChainNetwork"
provides:
  - "ILocalKeyStore.generateKeyPair with 4-param (agentId, chain, network, masterPassword)"
  - "secp256k1 key generation for EVM chains"
  - "EIP-55 checksum address derivation via viem privateKeyToAccount"
  - "KeystoreFileV1 curve field ('ed25519' | 'secp256k1')"
  - "Actual network value in keystore files (no more hardcoded 'devnet')"
  - "Backward compat: curve-less keystore files default to ed25519"
affects:
  - 83-02 (agent route generateKeyPair network param integration)
  - 84 (adapter pool - needs keystore EVM keys)
  - 86 (owner-auth SIWE - needs EVM agent addresses)

# Tech tracking
tech-stack:
  added: ["viem (in @waiaas/daemon)"]
  patterns: ["chain-based key generation dispatch", "curve field in keystore format"]

key-files:
  created: []
  modified:
    - "packages/core/src/interfaces/ILocalKeyStore.ts"
    - "packages/daemon/src/infrastructure/keystore/keystore.ts"
    - "packages/daemon/src/__tests__/keystore.test.ts"
    - "packages/daemon/package.json"
    - "packages/daemon/src/api/routes/agents.ts"

key-decisions:
  - "viem privateKeyToAccount used for EIP-55 address derivation (not Node.js crypto)"
  - "crypto.randomBytes(32) for secp256k1 private key entropy (CSPRNG)"
  - "curve field backward compat: missing = 'ed25519' (pre-v1.4.1 files)"
  - "network parameter replaces hardcoded 'devnet' in keystore files"
  - "sodium.sodium_memzero used for secp256k1 plaintext zeroing (same pattern as ed25519)"

patterns-established:
  - "Chain dispatch in generateKeyPair: chain === 'ethereum' -> secp256k1, chain === 'solana' -> ed25519"
  - "Private helper methods for each curve: generateSecp256k1KeyPair(), generateEd25519KeyPair()"

# Metrics
duration: 6min
completed: 2026-02-12
---

# Phase 83 Plan 01: secp256k1 Keystore Multicurve Summary

**secp256k1 key generation with EIP-55 address derivation via viem, curve/network fields in KeystoreFileV1, backward compat for ed25519-only files**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-12T08:59:22Z
- **Completed:** 2026-02-12T09:05:16Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- ILocalKeyStore.generateKeyPair upgraded to 4-param signature (agentId, chain, network, masterPassword)
- secp256k1 private key generation with EIP-55 checksum address via viem privateKeyToAccount
- KeystoreFileV1 extended with `curve` field ('ed25519' | 'secp256k1')
- Actual network value written to keystore files (hardcoded 'devnet' removed)
- Backward compat: keystore files without curve field default to 'ed25519'
- All 39 keystore tests pass (32 existing + 7 new multicurve tests)
- Full daemon regression: 604 tests pass across 38 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Install viem + RED failing tests** - `dc562e4` (test)
2. **Task 2: Implement multicurve keystore GREEN** - `71bb6e1` (feat)
3. **Task 3: Verify interface contract + full regression** - no code changes (verification only)

## Files Created/Modified
- `packages/core/src/interfaces/ILocalKeyStore.ts` - generateKeyPair 4-param interface contract
- `packages/daemon/src/infrastructure/keystore/keystore.ts` - secp256k1 + ed25519 dual-curve implementation, curve field, network param
- `packages/daemon/src/__tests__/keystore.test.ts` - 7 new EVM multicurve tests + existing tests updated to 4-param
- `packages/daemon/package.json` - viem dependency added
- `packages/daemon/src/api/routes/agents.ts` - generateKeyPair call updated to 4-param

## Decisions Made
- Used viem `privateKeyToAccount` for EIP-55 address derivation (per objective doc decision #1, #2)
- Used `crypto.randomBytes(32)` for secp256k1 key entropy (Node.js CSPRNG)
- `curve` field defaults to 'ed25519' for backward compat with pre-v1.4.1 keystore files (decision #7)
- `network` parameter replaces hardcoded 'devnet' in keystore files (decision #15)
- sodium.sodium_memzero used for secp256k1 plaintext zeroing (same security pattern as ed25519)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated agents.ts route generateKeyPair caller**
- **Found during:** Task 2 (TypeScript compilation check)
- **Issue:** `agents.ts` still called generateKeyPair with 3 params after interface changed to 4 params
- **Fix:** Added `network` parameter to the generateKeyPair call in the POST /agents route
- **Files modified:** packages/daemon/src/api/routes/agents.ts
- **Verification:** `pnpm --filter @waiaas/daemon run typecheck` passes
- **Committed in:** 71bb6e1 (Task 2 commit)

**2. [Rule 1 - Bug] Updated "rejects unsupported chain" test**
- **Found during:** Task 2 (existing test used 'ethereum' which is now supported)
- **Issue:** Test asserted that chain='ethereum' throws error, but ethereum is now supported
- **Fix:** Changed test to use 'bitcoin' (truly unsupported chain) to preserve test coverage
- **Files modified:** packages/daemon/src/__tests__/keystore.test.ts
- **Verification:** Test passes, unsupported chain rejection still works
- **Committed in:** 71bb6e1 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for compilation and test correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ILocalKeyStore 4-param generateKeyPair contract verified -- Plan 02 can safely depend on it
- Agent route already passes network to generateKeyPair -- Plan 02 needs integration tests
- EVM keystore files include curve:'secp256k1' and actual network -- ready for adapter pool (Phase 84)
- Pre-existing flaky tests (lifecycle.test.ts, e2e-errors.test.ts) remain but are not blocking

## Self-Check: PASSED

---
*Phase: 83-keystore-multicurve*
*Completed: 2026-02-12*
