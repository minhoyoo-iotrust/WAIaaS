---
phase: 318-actionprovider-registry-client
plan: 01
subsystem: actions
tags: [erc-8004, viem, abi, zod, registry-client, calldata-encoding]

requires:
  - phase: 317-foundation
    provides: DB v39 migration, REPUTATION_THRESHOLD policy type, Admin Settings 9 keys
provides:
  - 3 ABI const files (Identity/Reputation/Validation Registry)
  - Erc8004RegistryClient with 9 encode* methods
  - Erc8004Config + ERC8004_DEFAULTS
  - ERC8004_MAINNET_ADDRESSES + ERC8004_TESTNET_ADDRESSES
  - 8 Zod input schemas for write actions
  - 24 unit tests for calldata encoding
affects: [318-02, 319, 320, 321, 322, 323]

tech-stack:
  added: [viem (direct dependency for @waiaas/actions)]
  patterns: [viem encodeFunctionData for ABI calldata encoding, as const ABI for type inference]

key-files:
  created:
    - packages/actions/src/providers/erc8004/identity-abi.ts
    - packages/actions/src/providers/erc8004/reputation-abi.ts
    - packages/actions/src/providers/erc8004/validation-abi.ts
    - packages/actions/src/providers/erc8004/constants.ts
    - packages/actions/src/providers/erc8004/config.ts
    - packages/actions/src/providers/erc8004/schemas.ts
    - packages/actions/src/providers/erc8004/erc8004-registry-client.ts
    - packages/actions/src/__tests__/erc8004-registry-client.test.ts
  modified:
    - packages/actions/package.json

key-decisions:
  - "Added viem as direct dependency of @waiaas/actions (previously only in daemon)"
  - "Validation Registry address defaults to empty string for feature-gate pattern"
  - "agentId uses string at Zod schema level, BigInt conversion in RegistryClient encode methods"

patterns-established:
  - "ERC-8004 ABI as const pattern for viem type inference"
  - "RegistryClient encode* methods return Hex calldata for ContractCallRequest"

requirements-completed: [PKG-01]

duration: 10min
completed: 2026-03-04
---

# Phase 318 Plan 01: Erc8004RegistryClient Summary

**3 ERC-8004 registry ABIs (as const), viem RegistryClient with 9 encode methods, 8 Zod schemas, mainnet address constants, and 24 calldata round-trip tests**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-04T08:12:47Z
- **Completed:** 2026-03-04T08:23:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Identity Registry ABI with register (2 overloads), setAgentWallet, unsetAgentWallet, setAgentURI, setMetadata, getAgentWallet, getMetadata, tokenURI + 3 events
- Reputation Registry ABI with giveFeedback, revokeFeedback, getSummary, readAllFeedback, getClients, getLastIndex + 2 events
- Validation Registry ABI with validationRequest, validationResponse, getValidationStatus, getSummary, getAgentValidations + 2 events
- Erc8004RegistryClient with 9 encode* methods using viem encodeFunctionData for type-safe calldata
- 8 Zod input schemas: RegisterAgent, SetAgentWallet, UnsetAgentWallet, SetAgentUri, SetMetadata, GiveFeedback, RevokeFeedback, RequestValidation
- 24 unit tests with decodeFunctionData round-trip verification

## Task Commits

1. **Task 1: ABI constants + addresses + config + Zod schemas** - `79085b79` (feat)
2. **Task 2: Erc8004RegistryClient + unit tests** - `8f399b4e` (feat)

## Files Created/Modified
- `packages/actions/src/providers/erc8004/identity-abi.ts` - Identity Registry ABI (10 functions + 3 events)
- `packages/actions/src/providers/erc8004/reputation-abi.ts` - Reputation Registry ABI (6 functions + 2 events)
- `packages/actions/src/providers/erc8004/validation-abi.ts` - Validation Registry ABI (5 functions + 2 events)
- `packages/actions/src/providers/erc8004/constants.ts` - Mainnet/testnet registry address constants
- `packages/actions/src/providers/erc8004/config.ts` - Erc8004Config interface + ERC8004_DEFAULTS
- `packages/actions/src/providers/erc8004/schemas.ts` - 8 Zod input schemas for write actions
- `packages/actions/src/providers/erc8004/erc8004-registry-client.ts` - viem calldata encoding client
- `packages/actions/src/__tests__/erc8004-registry-client.test.ts` - 24 unit tests
- `packages/actions/package.json` - Added viem ^2.21.0 as direct dependency

## Decisions Made
- Added viem as direct dependency of @waiaas/actions (was only in daemon package). Required for encodeFunctionData in RegistryClient and decodeFunctionData in tests.
- Validation Registry address defaults to empty string, getRegistryAddress('validation') throws ChainError when not configured (feature-gate for undeployed mainnet contract).
- MetadataEntry value strings are converted to bytes via viem toHex() in encodeSetMetadata and encodeRegisterWithMetadata.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added viem as direct dependency for @waiaas/actions**
- **Found during:** Task 2 (registry client tests)
- **Issue:** viem was not listed as a dependency of @waiaas/actions package, causing "Cannot find package 'viem'" import error
- **Fix:** Added `"viem": "^2.21.0"` to package.json dependencies
- **Files modified:** packages/actions/package.json, pnpm-lock.yaml
- **Verification:** pnpm install, build, and all 504 tests pass
- **Committed in:** 8f399b4e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for viem import resolution. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RegistryClient ready for Erc8004ActionProvider (Plan 318-02)
- All 8 Zod schemas ready for ActionProvider inputSchema references
- Build passes, 504 tests pass

---
*Phase: 318-actionprovider-registry-client*
*Completed: 2026-03-04*
