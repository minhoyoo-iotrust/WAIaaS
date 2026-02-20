---
phase: 202-signing-protocol-daemon-sdk-ntfy
plan: 03
subsystem: sdk
tags: [wallet-sdk, signing-protocol, ntfy, telegram, sse, base64url, zod]

# Dependency graph
requires:
  - phase: 202-01
    provides: "SignRequest/SignResponse Zod schemas, encodeSignRequest/decodeSignRequest, WalletLinkConfig type"
provides:
  - "@waiaas/wallet-sdk npm package with 6 public functions for signing protocol integration"
  - "parseSignRequest: inline data + ntfy remote fetch URL parsing"
  - "buildSignResponse: validated SignResponse creation with approve/reject"
  - "formatDisplayMessage: human-readable transaction summary"
  - "sendViaNtfy: ntfy topic POST publishing"
  - "sendViaTelegram: Telegram deeplink URL generation"
  - "subscribeToRequests: ntfy SSE subscription with auto-reconnect"
  - "3 custom error classes (InvalidSignRequestUrlError, SignRequestExpiredError, SignRequestValidationError)"
affects: [202-04, 203]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wallet SDK package pattern: ESM-only, @waiaas/core dependency, node>=18 for React Native compat"
    - "ntfy SSE subscription with ReadableStream parsing and auto-reconnect (3 attempts, 5s delay)"
    - "base64url encoding for cross-channel SignResponse transport (ntfy body, Telegram URL parameter)"

key-files:
  created:
    - "packages/wallet-sdk/package.json"
    - "packages/wallet-sdk/tsconfig.json"
    - "packages/wallet-sdk/tsconfig.build.json"
    - "packages/wallet-sdk/vitest.config.ts"
    - "packages/wallet-sdk/src/index.ts"
    - "packages/wallet-sdk/src/errors.ts"
    - "packages/wallet-sdk/src/parse-request.ts"
    - "packages/wallet-sdk/src/build-response.ts"
    - "packages/wallet-sdk/src/display.ts"
    - "packages/wallet-sdk/src/channels/ntfy.ts"
    - "packages/wallet-sdk/src/channels/telegram.ts"
    - "packages/wallet-sdk/src/channels/index.ts"
    - "packages/wallet-sdk/src/__tests__/parse-request.test.ts"
    - "packages/wallet-sdk/src/__tests__/build-response.test.ts"
    - "packages/wallet-sdk/src/__tests__/display.test.ts"
    - "packages/wallet-sdk/src/__tests__/channels.test.ts"
  modified: []

key-decisions:
  - "node>=18 engine requirement (vs >=22 for other packages) for broader wallet app compatibility (React Native)"
  - "subscribeToRequests uses ReadableStream line-by-line parsing instead of EventSource API for cross-platform compatibility"
  - "sendViaTelegram returns URL string only (no platform detection); wallet app handles scheme selection"

patterns-established:
  - "Wallet SDK channel pattern: encode as base64url, transport via channel, decode and validate with Zod on receive"
  - "SSE reconnect pattern: max 3 attempts with 5-second delay, AbortController for clean shutdown"

requirements-completed: [SDK-01, SDK-02, SDK-03, SDK-04, SDK-05, SDK-06]

# Metrics
duration: ~5min
completed: 2026-02-20
---

# Phase 202 Plan 03: @waiaas/wallet-sdk Summary

**New @waiaas/wallet-sdk npm package with 6 public functions (parseSignRequest, buildSignResponse, formatDisplayMessage, sendViaNtfy, sendViaTelegram, subscribeToRequests) for wallet apps to integrate WAIaaS Signing Protocol v1**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-20T03:04:55Z
- **Completed:** 2026-02-20T03:10:00Z
- **Tasks:** 2/2
- **Files created:** 16

## Accomplishments
- Created @waiaas/wallet-sdk package scaffolding with ESM-only config, node>=18 engine, and workspace dependency on @waiaas/core
- Implemented 3 core functions: parseSignRequest (inline data + ntfy remote fetch), buildSignResponse (validated approve/reject), formatDisplayMessage (human-readable summary)
- Implemented 3 channel functions: sendViaNtfy (POST to ntfy topic), sendViaTelegram (deeplink URL), subscribeToRequests (SSE with auto-reconnect)
- Created 3 custom error classes for precise error handling in wallet apps
- Added 29 tests across 4 test files covering all 6 functions with mocked fetch

## Task Commits

Each task was committed atomically:

1. **Task 1: Package scaffolding + parseSignRequest + buildSignResponse + formatDisplayMessage** - `228519a` (feat)
2. **Task 2: Channel functions (sendViaNtfy, sendViaTelegram, subscribeToRequests) + index integration** - `c69dafb` (feat)

## Files Created/Modified

### Created
- `packages/wallet-sdk/package.json` - @waiaas/wallet-sdk npm package config (v0.1.0, ESM, node>=18)
- `packages/wallet-sdk/tsconfig.json` - TypeScript config extending tsconfig.base.json
- `packages/wallet-sdk/tsconfig.build.json` - Build config excluding tests
- `packages/wallet-sdk/vitest.config.ts` - Vitest config with coverage thresholds
- `packages/wallet-sdk/src/index.ts` - Barrel export: 6 functions + 3 errors + 3 types
- `packages/wallet-sdk/src/errors.ts` - InvalidSignRequestUrlError, SignRequestExpiredError, SignRequestValidationError
- `packages/wallet-sdk/src/parse-request.ts` - parseSignRequest: URL parsing, base64url decode, Zod validation, expiry check, ntfy fetch
- `packages/wallet-sdk/src/build-response.ts` - buildSignResponse: validated SignResponse creation
- `packages/wallet-sdk/src/display.ts` - formatDisplayMessage: human-readable transaction summary
- `packages/wallet-sdk/src/channels/ntfy.ts` - sendViaNtfy (POST) + subscribeToRequests (SSE with reconnect)
- `packages/wallet-sdk/src/channels/telegram.ts` - sendViaTelegram: https://t.me deeplink URL builder
- `packages/wallet-sdk/src/channels/index.ts` - Channel barrel exports
- `packages/wallet-sdk/src/__tests__/parse-request.test.ts` - 10 tests: valid URLs, base64url errors, expiry, Zod validation, deeplinks, ntfy fetch
- `packages/wallet-sdk/src/__tests__/build-response.test.ts` - 5 tests: approve/reject, signature required, ISO 8601 format
- `packages/wallet-sdk/src/__tests__/display.test.ts` - 4 tests: amount present/absent, all fields, edge cases
- `packages/wallet-sdk/src/__tests__/channels.test.ts` - 10 tests: ntfy POST/error, Telegram URL, SSE parse/unsubscribe/expired

## Decisions Made
- Set node>=18 engine requirement (vs >=22 for daemon/core packages) for broader wallet app and React Native compatibility
- Used ReadableStream line-by-line parsing for SSE instead of EventSource API for cross-platform compatibility (Node.js + React Native)
- sendViaTelegram returns URL string only; platform-specific scheme handling (tg:// vs https://t.me) is delegated to the wallet app
- subscribeToRequests silently drops expired requests (no callback) and ignores malformed SSE messages

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- @waiaas/wallet-sdk package ready for npm publish (dist/ builds successfully)
- SDK functions ready for integration testing with daemon signing endpoints (Plan 202-02)
- sendViaNtfy and subscribeToRequests ready for NtfySigningChannel integration (Plan 202-04)
- All 6 public functions exported with full TypeScript declarations

---
*Phase: 202-signing-protocol-daemon-sdk-ntfy*
*Completed: 2026-02-20*

## Self-Check: PASSED

All 16 claimed files exist. Both commit hashes (228519a, c69dafb) verified in git log.
