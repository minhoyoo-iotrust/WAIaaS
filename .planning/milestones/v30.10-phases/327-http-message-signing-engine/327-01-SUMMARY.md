---
phase: 327-http-message-signing-engine
plan: 01
subsystem: signing
tags: [erc8128, rfc9421, rfc9530, http-signing, viem, zod]

requires:
  - phase: none
    provides: first phase of v30.10

provides:
  - Zod SSoT schemas for ERC-8128 signing (SignHttpRequest, VerifyResult, CoveredComponentsPreset, SignatureParams)
  - Algorithm constants and covered components presets (minimal/standard/strict)
  - keyid generation/parsing (erc8128:<chainId>:<address> format)
  - RFC 9530 Content-Digest (SHA-256) generation
  - RFC 9421 Signature-Input and Signature Base construction

affects: [327-02, 328, 329]

tech-stack:
  added: [viem (added to @waiaas/core for getAddress checksum)]
  patterns: [RFC 9421 Signature Base construction, RFC 9530 Content-Digest format]

key-files:
  created:
    - packages/core/src/erc8128/types.ts
    - packages/core/src/erc8128/constants.ts
    - packages/core/src/erc8128/keyid.ts
    - packages/core/src/erc8128/content-digest.ts
    - packages/core/src/erc8128/signature-input-builder.ts
    - packages/core/src/erc8128/__tests__/keyid.test.ts
    - packages/core/src/erc8128/__tests__/content-digest.test.ts
    - packages/core/src/erc8128/__tests__/signature-input-builder.test.ts
  modified:
    - packages/core/package.json

key-decisions:
  - "Added viem as production dependency to @waiaas/core for getAddress checksum normalization in keyid module"
  - "Self-implemented RFC 9421 Signature Base construction via string formatting (no structured-headers library needed)"

patterns-established:
  - "ERC-8128 keyid format: erc8128:<chainId>:<checksumAddress> with viem getAddress normalization"
  - "Content-Digest format: sha-256=:<base64>: per RFC 9530"
  - "Signature-Input: sig1=(<components>);created=T;keyid='...';alg='...';expires=T[;nonce='...']"

requirements-completed: [ENG-02, ENG-03, ENG-04, ENG-05]

duration: 4min
completed: 2026-03-05
---

# Phase 327 Plan 01: Types, Constants, KeyId, Content-Digest, Signature-Input Builder Summary

**RFC 9421/9530 foundation modules for ERC-8128 HTTP message signing: Zod types, keyid builder, Content-Digest SHA-256, and Signature-Input/Base construction**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-05T05:27:30Z
- **Completed:** 2026-03-05T05:31:45Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- 4 Zod SSoT schemas with inferred TypeScript types (SignHttpRequest, SignatureParams, CoveredComponentsPreset, VerifyResult)
- keyid build/parse roundtrip with viem getAddress checksum normalization
- Content-Digest SHA-256 in RFC 9530 sha-256=:base64: format
- Signature-Input builder with all 3 presets (minimal/standard/strict) and optional nonce
- Signature Base construction per RFC 9421 section 2.5 with derived components (@method, @target-uri, @authority, @request-target)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Zod types, constants, keyid, Content-Digest** - `72b922c9` (feat)
2. **Task 2: Create Signature-Input builder and Signature Base** - `1047d519` (feat)

## Files Created/Modified
- `packages/core/src/erc8128/types.ts` - Zod SSoT schemas for ERC-8128
- `packages/core/src/erc8128/constants.ts` - Algorithm registry, presets, signature label
- `packages/core/src/erc8128/keyid.ts` - keyid generation and parsing
- `packages/core/src/erc8128/content-digest.ts` - RFC 9530 Content-Digest SHA-256
- `packages/core/src/erc8128/signature-input-builder.ts` - RFC 9421 Signature-Input and Signature Base
- `packages/core/src/erc8128/__tests__/keyid.test.ts` - 10 tests for keyid
- `packages/core/src/erc8128/__tests__/content-digest.test.ts` - 5 tests for Content-Digest
- `packages/core/src/erc8128/__tests__/signature-input-builder.test.ts` - 16 tests for Signature-Input/Base
- `packages/core/package.json` - Added viem dependency

## Decisions Made
- Added viem ^2.21.0 as production dependency to @waiaas/core (needed for getAddress in keyid module, and signMessage/recoverMessageAddress in Plan 02)
- Self-implemented RFC 9421 format via string formatting rather than using structured-headers library (simpler, avoids dependency for construction)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added viem dependency to @waiaas/core**
- **Found during:** Task 1 (keyid module implementation)
- **Issue:** keyid.ts imports getAddress from viem, but @waiaas/core had no viem dependency
- **Fix:** Added viem ^2.21.0 to dependencies (matching daemon package version)
- **Files modified:** packages/core/package.json, pnpm-lock.yaml
- **Verification:** Import resolves, tests pass
- **Committed in:** 72b922c9 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for keyid checksum normalization. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All foundation modules ready for Plan 02 (HTTP Message Signer + Verifier)
- buildSignatureInput and buildSignatureBase exported for composition
- viem available for EIP-191 signing in Plan 02

---
*Phase: 327-http-message-signing-engine*
*Completed: 2026-03-05*
