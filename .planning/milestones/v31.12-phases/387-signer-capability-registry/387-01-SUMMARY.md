---
phase: 387-signer-capability-registry
plan: 01
subsystem: signing
tags: [viem, node-crypto, eip712, erc8128, hmac, rsa-pss, ecdsa, ed25519, tdd]

requires:
  - phase: 386-type-system-errors-db
    provides: SigningSchemeEnum 7-scheme, ResolvedAction 3-kind, error codes

provides:
  - ISignerCapability interface with canSign()/sign() contract
  - SigningParams 7-variant discriminated union
  - SigningError class with scheme/code/cause
  - 7 signing capability implementations (Eip712/Personal/Erc8128/Hmac/RsaPss/Ecdsa/Ed25519)

affects: [387-02-registry, 390-pipeline-routing]

tech-stack:
  added: []
  patterns: [ISignerCapability canSign/sign contract, SigningError extends Error (not WAIaaSError)]

key-files:
  created:
    - packages/daemon/src/signing/types.ts
    - packages/daemon/src/signing/signing-error.ts
    - packages/daemon/src/signing/capabilities/eip712-signer.ts
    - packages/daemon/src/signing/capabilities/personal-signer.ts
    - packages/daemon/src/signing/capabilities/erc8128-signer.ts
    - packages/daemon/src/signing/capabilities/hmac-signer.ts
    - packages/daemon/src/signing/capabilities/rsa-pss-signer.ts
    - packages/daemon/src/signing/capabilities/ecdsa-signer.ts
    - packages/daemon/src/signing/capabilities/ed25519-signer.ts
    - packages/daemon/src/signing/capabilities/index.ts
    - packages/daemon/src/signing/index.ts
    - packages/daemon/src/__tests__/signer-capabilities.test.ts
  modified: []

key-decisions:
  - "Ed25519 uses node:crypto natively (PKCS8 DER construction) instead of adding @noble/ed25519 dependency"
  - "ECDSA secp256k1 uses viem signMessage with raw hash for EIP-191 compatible signing"
  - "ERC-8128 signer returns JSON.stringify(headers) as signature + parsed headers as metadata"

patterns-established:
  - "ISignerCapability: canSign() checks scheme + required fields, sign() wraps errors in SigningError"
  - "SigningError extends Error (converted to WAIaaSError at pipeline Stage 5)"

requirements-completed: [SIGN-01, SIGN-02, SIGN-03, SIGN-04, SIGN-05, SIGN-06]

duration: 5min
completed: 2026-03-12
---

# Phase 387 Plan 01: ISignerCapability Types + 7 Signing Capabilities Summary

**ISignerCapability 7-scheme signing layer with TDD: EIP-712/Personal/ERC-8128 (viem), HMAC-SHA256/RSA-PSS/Ed25519 (node:crypto), ECDSA secp256k1 (viem keccak256)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T18:16:35Z
- **Completed:** 2026-03-11T18:21:35Z
- **Tasks:** 1
- **Files modified:** 12

## Accomplishments
- ISignerCapability interface defining canSign()/sign() contract for 7 signing schemes
- SigningParams 7-variant discriminated union with scheme-specific typed fields
- SigningError class with scheme, code, and cause for debugging context
- 7 capability implementations covering all SigningScheme enum values
- 39 TDD tests with real cryptographic verification (RSA-PSS verify, Ed25519 verify, HMAC known vectors)

## Task Commits

Each task was committed atomically:

1. **Task 1: ISignerCapability types + SigningError + 7 Capability implementations** - `908a5046` (feat)

## Files Created/Modified
- `packages/daemon/src/signing/types.ts` - ISignerCapability, SigningParams union, SigningResult
- `packages/daemon/src/signing/signing-error.ts` - SigningError class with scheme/code/cause
- `packages/daemon/src/signing/capabilities/eip712-signer.ts` - EIP-712 via viem signTypedData
- `packages/daemon/src/signing/capabilities/personal-signer.ts` - personal_sign via viem signMessage
- `packages/daemon/src/signing/capabilities/erc8128-signer.ts` - ERC-8128 via @waiaas/core signHttpMessage
- `packages/daemon/src/signing/capabilities/hmac-signer.ts` - HMAC-SHA256 via node:crypto createHmac
- `packages/daemon/src/signing/capabilities/rsa-pss-signer.ts` - RSA-PSS via node:crypto sign
- `packages/daemon/src/signing/capabilities/ecdsa-signer.ts` - secp256k1 via viem keccak256 + signMessage
- `packages/daemon/src/signing/capabilities/ed25519-signer.ts` - Ed25519 via node:crypto PKCS8 DER
- `packages/daemon/src/signing/capabilities/index.ts` - Re-exports all 7 capabilities
- `packages/daemon/src/signing/index.ts` - Module barrel export
- `packages/daemon/src/__tests__/signer-capabilities.test.ts` - 39 TDD tests

## Decisions Made
- Ed25519 uses node:crypto natively with PKCS8 DER header construction instead of adding @noble/ed25519 as a new dependency -- Node.js 22 has built-in ed25519 support
- ECDSA secp256k1 uses viem signMessage with raw hash (EIP-191 compatible), hashData option controls keccak256 pre-hashing
- ERC-8128 signer returns JSON.stringify(headers) as signature field and parsed headers as metadata for maximum flexibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused viem toHex import**
- **Found during:** Task 1 (typecheck)
- **Issue:** `toHex` was imported from viem but unused in ecdsa-signer.ts
- **Fix:** Removed the unused import
- **Files modified:** packages/daemon/src/signing/capabilities/ecdsa-signer.ts
- **Committed in:** 908a5046 (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial cleanup, no scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 7 capability implementations ready for registry registration (Plan 387-02)
- ISignerCapability interface established for SignerCapabilityRegistry.resolve()
- All existing signing pipelines (sign-message, sign-only, ERC-8128 routes) unchanged

---
*Phase: 387-signer-capability-registry*
*Completed: 2026-03-12*
