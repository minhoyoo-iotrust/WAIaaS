---
phase: 202-signing-protocol-daemon-sdk-ntfy
plan: 02
subsystem: services
tags: [signing-sdk, sign-request, sign-response, approval, signature-verification, viem, solana-kit]

# Dependency graph
requires:
  - "202-01: SIGNING error codes, SignRequest/SignResponse Zod schemas, WalletLinkRegistry, signing_sdk settings keys"
provides:
  - "SignRequestBuilder class: PENDING_APPROVAL TX -> SignRequest + universal link URL generation"
  - "SignResponseHandler class: SignResponse parsing, signature verification (EVM/Solana), direct DB approve/reject"
  - "Injectable signature verification pattern (EvmVerifyFn, SolanaVerifyFn) for testability"
affects: [202-03, 202-04, 203]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injectable verify functions for testability (EvmVerifyFn, SolanaVerifyFn interfaces)"
    - "ApprovalWorkflow bypass pattern: direct DB update for signing_sdk channel (same as Telegram bot)"
    - "In-memory pendingRequests Map with auto-expiry timers for 1-shot request lifecycle"
    - "doc 73 Section 5 signing message template with conditional Amount line"

key-files:
  created:
    - "packages/daemon/src/services/signing-sdk/sign-request-builder.ts"
    - "packages/daemon/src/services/signing-sdk/sign-response-handler.ts"
    - "packages/daemon/src/__tests__/sign-request-builder.test.ts"
    - "packages/daemon/src/__tests__/sign-response-handler.test.ts"
  modified: []

key-decisions:
  - "SignResponseHandler uses injectable EvmVerifyFn/SolanaVerifyFn interfaces instead of direct viem/solana-kit imports for testability"
  - "ApprovalWorkflow intentionally bypassed -- signing SDK performs its own cryptographic verification (same pattern as Telegram bot)"
  - "Solana verification uses @solana/kit (getPublicKeyFromAddress + verifySignature) not tweetnacl (tweetnacl not in project deps)"
  - "Default ntfy.sh serverUrl omitted from response channel to keep URLs compact (only included for custom servers)"

patterns-established:
  - "Signing SDK service pattern: inject SettingsService for config, WalletLinkRegistry for wallet lookup"
  - "Injectable crypto verification for unit testing: mock verify functions, test all error paths"

requirements-completed: [PROTO-01, PROTO-03, PROTO-04, PROTO-05]

# Metrics
duration: ~30min
completed: 2026-02-20
---

# Phase 202 Plan 02: SignRequestBuilder + SignResponseHandler Summary

**SignRequestBuilder generates SignRequest + universal link URL from PENDING_APPROVAL transactions; SignResponseHandler verifies EVM/Solana signatures and directly updates DB for approve/reject (ApprovalWorkflow bypass)**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-02-20
- **Completed:** 2026-02-20
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments
- SignRequestBuilder.buildRequest() generates complete SignRequest with doc 73 Section 5 signing message template, ntfy/telegram response channel, and universal link URL
- SignResponseHandler.handle() processes approve/reject with full signature verification (EVM via viem, Solana via @solana/kit), signer address matching, expiry checks, and direct DB updates
- 22 total tests (10 for builder, 12 for handler) covering all error codes: SIGNING_SDK_DISABLED, WALLET_NOT_REGISTERED, SIGN_REQUEST_NOT_FOUND, SIGN_REQUEST_EXPIRED, INVALID_SIGNATURE, SIGNER_ADDRESS_MISMATCH, INVALID_SIGN_RESPONSE, SIGN_REQUEST_ALREADY_PROCESSED

## Task Commits

Each task was committed atomically:

1. **Task 1: SignRequestBuilder implementation** - `cd76243` (feat)
2. **Task 2: SignResponseHandler implementation** - `a58eb28` (feat)

## Files Created/Modified

### Created
- `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` - SignRequestBuilder class with buildRequest(), signing message template, display message generation
- `packages/daemon/src/services/signing-sdk/sign-response-handler.ts` - SignResponseHandler class with handle(), registerRequest(), injectable verify functions, in-memory request tracking with auto-expiry
- `packages/daemon/src/__tests__/sign-request-builder.test.ts` - 10 tests: TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL message formats, disabled SDK, missing wallet, expiry, custom ntfy server
- `packages/daemon/src/__tests__/sign-response-handler.test.ts` - 12 tests: approve/reject flows, all 7 error codes, duplicate detection, auto-expiry timer

### Modified
None -- this plan only created new files.

## Decisions Made
- **Injectable verify functions**: SignResponseHandler accepts optional EvmVerifyFn and SolanaVerifyFn via constructor opts, defaulting to real implementations (viem.verifyMessage for EVM, @solana/kit verifySignature for Solana). This enables full unit testing without real crypto operations.
- **ApprovalWorkflow bypass**: Direct DB updates to pending_approvals and transactions tables, matching the Telegram bot approval pattern. Signing SDK performs its own cryptographic signature verification, making ApprovalWorkflow redundant.
- **@solana/kit for Solana verification**: Used getPublicKeyFromAddress() + verifySignature() from @solana/kit instead of tweetnacl (which is not a project dependency). Dynamic import via `await import('@solana/kit')` to avoid loading Solana deps when not needed.
- **ntfy.sh serverUrl omission**: When the ntfy server is the default https://ntfy.sh, the serverUrl field is omitted from the response channel to keep universal link URLs compact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DB chain column uses 'ethereum' not 'evm'**
- **Found during:** Task 2 (SignResponseHandler tests)
- **Issue:** Test insertTestData used 'evm' for the chain column, but the wallets table CHECK constraint only allows 'solana' or 'ethereum' (from CHAIN_TYPES enum). The signing protocol schema uses 'evm' for the chain field, but DB uses 'ethereum'.
- **Fix:** Changed test fixture chain default from 'evm' to 'ethereum'
- **Files modified:** packages/daemon/src/__tests__/sign-response-handler.test.ts
- **Verification:** All 12 tests pass
- **Committed in:** a58eb28 (Task 2 commit)

**2. [Rule 1 - Bug] @solana/keys and @solana/addresses not directly importable**
- **Found during:** Task 2 (typecheck)
- **Issue:** TypeScript could not resolve `@solana/keys` and `@solana/addresses` as direct imports. These packages are re-exported through `@solana/kit` but not directly available as separate packages in the daemon's dependencies.
- **Fix:** Changed dynamic imports from `@solana/keys` and `@solana/addresses` to `@solana/kit` (which re-exports all needed functions)
- **Files modified:** packages/daemon/src/services/signing-sdk/sign-response-handler.ts
- **Verification:** TypeScript typecheck passes, all tests pass
- **Committed in:** a58eb28 (Task 2 commit)

**3. [Rule 1 - Bug] Unused variable from destructuring**
- **Found during:** Task 2 (typecheck)
- **Issue:** `signature` was destructured from `signResponse` in the `handle()` method but not used there (used in handleApprove/handleReject via the full response object)
- **Fix:** Removed `signature` from destructuring assignment
- **Files modified:** packages/daemon/src/services/signing-sdk/sign-response-handler.ts
- **Verification:** TypeScript typecheck passes with no errors
- **Committed in:** a58eb28 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All auto-fixes were necessary for correctness and type safety. No scope creep.

## Issues Encountered
None -- all issues were caught during typecheck/test runs and auto-fixed inline.

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- SignRequestBuilder ready for NtfySigningChannel integration (Plan 202-04) to publish requests to ntfy topics
- SignResponseHandler ready for NtfySigningChannel to feed incoming responses
- Both services ready for @waiaas/wallet-sdk (Plan 202-03) to consume SignRequest and produce SignResponse
- 2546 daemon tests pass (140 test files, 0 failures)

---
*Phase: 202-signing-protocol-daemon-sdk-ntfy*
*Completed: 2026-02-20*

## Self-Check: PASSED

All 4 claimed files exist. Both commit hashes (cd76243, a58eb28) verified in git log.
