---
phase: 87-owner-auth-siwe
plan: 01
subsystem: auth
tags: [siwe, eip-4361, eip-191, viem, eip-55, base58, address-validation]

# Dependency graph
requires:
  - phase: 82-evm-chain-infra
    provides: "ChainType enum with 'ethereum' value, viem dependency"
provides:
  - "verifySIWE pure function for EIP-4361 + EIP-191 verification"
  - "validateOwnerAddress chain-aware address validation utility"
  - "decodeBase58 canonical export (extracted from owner-auth.ts)"
affects: [87-02-PLAN (owner-auth middleware integration)]

# Tech tracking
tech-stack:
  added: [viem/siwe (parseSiweMessage, validateSiweMessage, createSiweMessage)]
  patterns: [pure-function-first verification, chain-switch address validation]

key-files:
  created:
    - packages/daemon/src/api/middleware/siwe-verify.ts
    - packages/daemon/src/api/middleware/address-validation.ts
    - packages/daemon/src/__tests__/siwe-verify.test.ts
    - packages/daemon/src/__tests__/address-validation.test.ts
  modified: []

key-decisions:
  - "viem isAddress strict:true still accepts all-lowercase -- added manual mixed-case enforcement for EIP-55 security"
  - "No server-side nonce validation per [v1.4.1] design decision (expirationTime suffices)"
  - "decodeBase58 canonical location moved to address-validation.ts (owner-auth.ts will import in Plan 02)"

patterns-established:
  - "Pure function verification pattern: crypto functions as standalone testable modules separate from middleware"
  - "Chain-switch validation: switch(chain) with per-chain validation + normalized output"

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 87 Plan 01: SIWE Verify + Address Validation Summary

**verifySIWE pure function for EIP-4361 SIWE messages + validateOwnerAddress chain-aware utility with strict EIP-55 and base58 32-byte validation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T12:39:53Z
- **Completed:** 2026-02-12T12:43:33Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- verifySIWE validates EIP-4361 SIWE messages with EIP-191 signature verification using viem/siwe
- validateOwnerAddress validates and normalizes addresses for both Solana (base58 32B) and Ethereum (EIP-55 strict)
- 14 tests total (5 SIWE + 9 address validation), all passing with real cryptographic operations
- decodeBase58 extracted as canonical export for reuse in Plan 87-02

## Task Commits

Each task was committed atomically:

1. **Task 1: verifySIWE function with TDD (SIWE-01)** - `96f4494` (feat)
2. **Task 2: validateOwnerAddress utility with TDD (SIWE-03 partial)** - `5f4aeb5` (feat)

## Files Created/Modified
- `packages/daemon/src/api/middleware/siwe-verify.ts` - verifySIWE async pure function (parse + validate + verifyMessage)
- `packages/daemon/src/api/middleware/address-validation.ts` - validateOwnerAddress + decodeBase58 canonical export
- `packages/daemon/src/__tests__/siwe-verify.test.ts` - 5 tests: valid, expired, wrong-signer, malformed, corrupted
- `packages/daemon/src/__tests__/address-validation.test.ts` - 9 tests: Solana 3 + Ethereum 5 + unknown chain 1

## Decisions Made
- **Manual EIP-55 enforcement**: viem `isAddress({ strict: true })` still accepts all-lowercase addresses. Added explicit check requiring mixed-case checksummed format for security (prevents undetected typos).
- **No server-side nonce validation**: Per [v1.4.1] design decision, SIWE nonce is not validated (consistency with Solana owner-auth; expirationTime provides replay protection).
- **decodeBase58 canonical location**: Moved to address-validation.ts. owner-auth.ts currently has its own copy; Plan 87-02 will refactor to import from here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] viem isAddress strict:true does not reject all-lowercase addresses**
- **Found during:** Task 2 (validateOwnerAddress tests)
- **Issue:** Plan assumed `isAddress(addr, { strict: true })` rejects all-lowercase addresses. In viem v2, strict mode only validates checksum on mixed-case addresses; all-lowercase is treated as "not checksummed" and passes.
- **Fix:** Added manual check: if hex portion is all-lowercase or all-uppercase, reject. Then verify mixed-case matches EIP-55 via `getAddress()`.
- **Files modified:** packages/daemon/src/api/middleware/address-validation.ts
- **Verification:** Test "rejects all-lowercase 0x address" passes
- **Committed in:** 5f4aeb5 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correct EIP-55 enforcement. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- verifySIWE and validateOwnerAddress ready for consumption by Plan 87-02 (owner-auth middleware integration)
- decodeBase58 exported from address-validation.ts for owner-auth.ts refactoring
- All pure functions have zero side effects (no DB, no middleware)

---
*Phase: 87-owner-auth-siwe*
*Completed: 2026-02-12*

## Self-Check: PASSED

- [x] packages/daemon/src/api/middleware/siwe-verify.ts -- FOUND
- [x] packages/daemon/src/api/middleware/address-validation.ts -- FOUND
- [x] packages/daemon/src/__tests__/siwe-verify.test.ts -- FOUND
- [x] packages/daemon/src/__tests__/address-validation.test.ts -- FOUND
- [x] .planning/phases/87-owner-auth-siwe/87-01-SUMMARY.md -- FOUND
- [x] Commit 96f4494 -- FOUND
- [x] Commit 5f4aeb5 -- FOUND
