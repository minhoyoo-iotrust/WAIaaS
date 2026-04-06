---
phase: 87-owner-auth-siwe
plan: 02
subsystem: auth
tags: [siwe, eip-4361, eip-191, owner-auth, chain-branching, address-validation, eip-55, base58]

# Dependency graph
requires:
  - phase: 87-owner-auth-siwe
    plan: 01
    provides: "verifySIWE pure function, validateOwnerAddress utility, decodeBase58 export"
  - phase: 82-evm-chain-infra
    provides: "ChainType enum, viem dependency, agent.chain='ethereum' support"
provides:
  - "Chain-branching owner-auth middleware (solana=Ed25519, ethereum=SIWE)"
  - "Chain-aware setOwner address validation (reject invalid addresses per chain)"
  - "Base64-encoded SIWE message transport for HTTP headers"
affects: [SDK owner-auth docs, MCP owner verification flows, CLI owner registration]

# Tech tracking
tech-stack:
  added: []
  patterns: [chain-branching middleware, base64 SIWE message header transport, normalized address storage]

key-files:
  created:
    - packages/daemon/src/__tests__/owner-auth-siwe.test.ts
  modified:
    - packages/daemon/src/api/middleware/owner-auth.ts
    - packages/daemon/src/api/routes/agents.ts
    - packages/daemon/src/__tests__/api-new-endpoints.test.ts

key-decisions:
  - "SIWE message base64-encoded in X-Owner-Message header (multi-line EIP-4361 messages invalid as raw HTTP headers)"
  - "setOwner stores normalized address (EIP-55 checksummed for EVM, as-is for Solana)"
  - "Chain branching via agent.chain field: ethereum=SIWE, else=Ed25519 (default Solana path unchanged)"

patterns-established:
  - "Base64 SIWE header transport: clients must base64-encode X-Owner-Message for EVM agents"
  - "Normalized address storage: setOwner validates and normalizes before DB write"

# Metrics
duration: 7min
completed: 2026-02-12
---

# Phase 87 Plan 02: Owner-Auth Chain Branching + setOwner Validation Summary

**Chain-branching owner-auth middleware (solana=Ed25519, ethereum=SIWE) with chain-aware setOwner address validation rejecting invalid addresses per chain type**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-12T12:45:44Z
- **Completed:** 2026-02-12T12:52:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Owner-auth middleware branches verification by agent.chain: ethereum uses SIWE (EIP-4361+EIP-191), solana uses Ed25519 (unchanged)
- setOwner route validates owner_address format by chain: Solana=base58 32B, Ethereum=EIP-55 strict checksum
- 9 new tests (5 SIWE middleware + 4 setOwner integration), all 6 existing Solana tests pass unchanged (SIWE-04)
- Removed inline decodeBase58 from owner-auth.ts, imported from canonical address-validation.ts location
- Full daemon test suite passes: 658 tests, 42 files, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor owner-auth middleware with chain branching (SIWE-02)** - `8804151` (feat)
2. **Task 2: setOwner chain-aware address validation (SIWE-03)** - `1afd857` (feat)

## Files Created/Modified
- `packages/daemon/src/api/middleware/owner-auth.ts` - Chain-branching middleware: verifySIWE for ethereum, Ed25519 for solana; imports decodeBase58 from address-validation.ts
- `packages/daemon/src/api/routes/agents.ts` - setOwner validates+normalizes address by agent.chain before DB write
- `packages/daemon/src/__tests__/owner-auth-siwe.test.ts` - 9 tests: 5 SIWE middleware + 4 setOwner integration
- `packages/daemon/src/__tests__/api-new-endpoints.test.ts` - Fixed ownerState=GRACE test to use valid Solana address

## Decisions Made
- **Base64-encoded SIWE message in header**: SIWE messages are multi-line (EIP-4361 format with newlines). Raw newlines are invalid HTTP header values (RFC 7230). The middleware base64-decodes X-Owner-Message for ethereum chain before passing to verifySIWE. Clients must base64-encode the SIWE message.
- **Normalized address storage**: setOwner stores the validated+normalized address (EIP-55 checksummed for EVM). This ensures consistent comparison in owner-auth middleware.
- **Default chain path unchanged**: The else branch handles all non-ethereum chains (currently only solana), preserving backward compatibility. Future chains would need explicit cases.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SIWE multi-line message cannot be sent as raw HTTP header value**
- **Found during:** Task 1 (SIWE integration tests)
- **Issue:** SIWE messages (EIP-4361) contain newlines. Hono's Headers.append() rejects values with newline characters per HTTP spec (RFC 7230). Tests failed with "is an invalid header value" error.
- **Fix:** Base64-encode the SIWE message before setting X-Owner-Message header. Middleware decodes base64 for ethereum chain before passing to verifySIWE. Solana path unchanged (simple UTF-8 strings).
- **Files modified:** packages/daemon/src/api/middleware/owner-auth.ts, packages/daemon/src/__tests__/owner-auth-siwe.test.ts
- **Verification:** All 5 SIWE tests pass with base64-encoded messages
- **Committed in:** 8804151 (Task 1 commit)

**2. [Rule 1 - Bug] api-new-endpoints test used invalid Solana address for setOwner**
- **Found during:** Task 2 (full daemon test suite verification)
- **Issue:** Existing test used `'owner-wallet-address'` as owner_address for a Solana agent. This string is not a valid base58 32-byte address. With new chain-aware validation, setOwner now rejects it (400 ACTION_VALIDATION_FAILED), causing the ownerState=GRACE test to fail.
- **Fix:** Replaced with valid Solana address `'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'` (32-byte base58 public key).
- **Files modified:** packages/daemon/src/__tests__/api-new-endpoints.test.ts
- **Verification:** Full daemon suite passes (658 tests)
- **Committed in:** 1afd857 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correct operation. Base64 encoding is a transport-layer concern required by HTTP spec. Test fix updates stale test data to match new validation. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 87 (Owner Auth SIWE) fully complete: both plans shipped
- SIWE-01 (verifySIWE pure function), SIWE-02 (middleware chain branching), SIWE-03 (address validation), SIWE-04 (regression) all verified
- EVM owners can now authenticate via SIWE and register addresses via setOwner
- SDK/MCP clients need to base64-encode SIWE messages for X-Owner-Message header

---
*Phase: 87-owner-auth-siwe*
*Completed: 2026-02-12*

## Self-Check: PASSED

- [x] packages/daemon/src/api/middleware/owner-auth.ts -- FOUND
- [x] packages/daemon/src/api/routes/agents.ts -- FOUND
- [x] packages/daemon/src/__tests__/owner-auth-siwe.test.ts -- FOUND
- [x] packages/daemon/src/__tests__/api-new-endpoints.test.ts -- FOUND
- [x] .planning/phases/87-owner-auth-siwe/87-02-SUMMARY.md -- FOUND
- [x] Commit 8804151 -- FOUND
- [x] Commit 1afd857 -- FOUND
