---
phase: 327-http-message-signing-engine
plan: 02
subsystem: signing
tags: [erc8128, eip191, viem, http-signing, ecrecover, rfc9421]

requires:
  - phase: 327-01
    provides: types, constants, keyid, content-digest, signature-input-builder

provides:
  - Complete HTTP message signing via signHttpMessage (EIP-191 + RFC 9421)
  - Signature verification via verifyHttpSignature (ecrecover + Content-Digest + TTL)
  - Public API barrel export from @waiaas/core erc8128 namespace

affects: [328, 329]

tech-stack:
  added: []
  patterns: [EIP-191 signMessage for HTTP signing, ecrecover for signature verification, sig1=:base64: format]

key-files:
  created:
    - packages/core/src/erc8128/http-message-signer.ts
    - packages/core/src/erc8128/verifier.ts
    - packages/core/src/erc8128/index.ts
    - packages/core/src/erc8128/__tests__/http-message-signer.test.ts
    - packages/core/src/erc8128/__tests__/verifier.test.ts
  modified:
    - packages/core/src/index.ts

key-decisions:
  - "signHttpMessage takes raw privateKey (caller decrypts from keystore) keeping signer pure with no keystore dependency"
  - "Signature header format: sig1=:base64: (base64-encoded EIP-191 signature bytes)"
  - "Auto-adjusts coveredComponents for bodyless requests (removes content-digest and content-type)"

patterns-established:
  - "ERC-8128 sign flow: resolve components -> Content-Digest -> Signature-Input -> Signature Base -> EIP-191 sign -> base64 encode"
  - "ERC-8128 verify flow: parse Signature-Input -> check TTL -> check Content-Digest -> rebuild Signature Base -> ecrecover -> compare keyid"

requirements-completed: [ENG-01, VER-01, VER-02]

duration: 5min
completed: 2026-03-05
---

# Phase 327 Plan 02: HTTP Message Signer, Verifier, Barrel Export Summary

**EIP-191 HTTP message signing and ecrecover verification with full sign-verify roundtrip, exported from @waiaas/core erc8128 namespace**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-05T05:32:00Z
- **Completed:** 2026-03-05T05:37:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- signHttpMessage: complete ERC-8128 signing flow (EIP-191 via viem privateKeyToAccount + signMessage)
- verifyHttpSignature: full verification with ecrecover, Content-Digest integrity, TTL expiry, keyid match
- Barrel export from @waiaas/core erc8128 namespace (all public APIs)
- 48 total tests across 5 test files, all passing
- TypeScript strict mode clean

## Task Commits

Each task was committed atomically:

1. **Task 1: HTTP Message Signer with EIP-191** - `4f528280` (feat)
2. **Task 2: Verifier, barrel export, wire into @waiaas/core** - `601315d7` (feat)

## Files Created/Modified
- `packages/core/src/erc8128/http-message-signer.ts` - Complete signing flow
- `packages/core/src/erc8128/verifier.ts` - Verification with ecrecover
- `packages/core/src/erc8128/index.ts` - Public API barrel export
- `packages/core/src/erc8128/__tests__/http-message-signer.test.ts` - 10 signing tests
- `packages/core/src/erc8128/__tests__/verifier.test.ts` - 7 verification tests
- `packages/core/src/index.ts` - Added erc8128 namespace export

## Decisions Made
- signHttpMessage takes raw privateKey directly (daemon route handler decrypts from keystore before calling)
- Auto-removes content-digest and content-type from coveredComponents for bodyless GET requests
- Signature-Input parsing is string-based (no structured-headers library needed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode errors across all erc8128 modules**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** 12 TypeScript strict mode errors: unused imports, possibly undefined array elements from split/regex, Record type indexing returning undefined
- **Fix:** Added non-null assertions for regex match groups, used optional chaining for match results, removed unused imports (vi, Hex)
- **Files modified:** keyid.ts, http-message-signer.ts, verifier.ts, http-message-signer.test.ts
- **Verification:** `pnpm run typecheck` passes clean
- **Committed in:** 601315d7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** TypeScript strict mode compliance is required. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ERC-8128 signing engine complete (Phase 327 done)
- All modules exported from @waiaas/core erc8128 namespace
- Ready for Phase 328: REST API + Policy + Settings

---
*Phase: 327-http-message-signing-engine*
*Completed: 2026-03-05*
