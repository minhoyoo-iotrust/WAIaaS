---
phase: 319-readonly-routes-registration-file
plan: 01
subsystem: api
tags: [erc-8004, rest-api, viem, registration-file, openapi, sessionAuth]

requires:
  - phase: 318-actionprovider-registry-client
    provides: 3 ABI consts, Erc8004Config, buildRegistrationFile, ERC8004_DEFAULTS
provides:
  - 4 ERC-8004 GET endpoints (agent info, reputation, registration file, validation)
  - 4 Zod response schemas in openapi-schemas.ts
  - erc8004Routes factory with Erc8004RouteDeps interface
  - Re-exported IDENTITY/REPUTATION/VALIDATION_REGISTRY_ABI from @waiaas/actions
  - 9 integration tests for registration file and auth enforcement
affects: [319-02, 320, 322, 323]

tech-stack:
  added: []
  patterns: [viem createPublicClient + readContract for on-chain ERC-8004 reads, ADAPTER_NOT_AVAILABLE feature gate for unconfigured registries]

key-files:
  created:
    - packages/daemon/src/api/routes/erc8004.ts
    - packages/daemon/src/__tests__/erc8004-routes.test.ts
  modified:
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/server.ts
    - packages/actions/src/index.ts

key-decisions:
  - "Used ADAPTER_NOT_AVAILABLE error code (503) for unconfigured registries instead of non-existent SERVICE_UNAVAILABLE"
  - "Re-exported 3 ABI constants from @waiaas/actions index for cross-package access"
  - "Used z.any() for registration file response schema (free-form JSON per ERC-8004 spec)"
  - "RPC fallback to https://eth.llamarpc.com when rpc.evm_ethereum_mainnet not configured"

patterns-established:
  - "ERC-8004 route pattern: getErc8004Config -> createRpcClient -> readContract with error wrapping"
  - "Registration file auto-generation from Host header + DB agent_identities"

requirements-completed: [IDEN-06, IDEN-08, REPU-03, VALD-02, API-01]

duration: 15min
completed: 2026-03-04
---

# Phase 319 Plan 01: ERC-8004 Read-Only REST API Summary

**4 GET endpoints for ERC-8004 agent info, reputation, registration file, and validation status -- with viem on-chain reads, registration file auto-generation, and 9 integration tests**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-04T08:45:21Z
- **Completed:** 2026-03-04T09:00:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- GET /v1/erc8004/agent/:agentId reads Identity Registry on-chain (tokenURI + getAgentWallet) with local DB metadata merge
- GET /v1/erc8004/agent/:agentId/reputation reads Reputation Registry getSummary with tag1/tag2 query filtering
- GET /v1/erc8004/registration-file/:walletId auto-generates ERC-8004 spec-compliant JSON from DB wallet + agent_identities
- GET /v1/erc8004/validation/:requestHash reads Validation Registry with feature gate (503 when not configured)
- 9 integration tests covering registration file generation, registrations array presence/absence, auth enforcement

## Task Commits

1. **Task 1: Zod schemas + erc8004.ts route file + server registration** - `8d1e376b` (feat)
2. **Task 2: Integration tests for 4 endpoints** - `d22cd055` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/erc8004.ts` - 4 GET route handlers with viem readContract
- `packages/daemon/src/api/routes/openapi-schemas.ts` - 4 Zod response schemas (AgentInfo, Reputation, RegistrationFile, Validation)
- `packages/daemon/src/api/routes/index.ts` - Barrel export for erc8004Routes
- `packages/daemon/src/api/server.ts` - sessionAuth /v1/erc8004/* + route registration
- `packages/actions/src/index.ts` - Re-export 3 ABI constants
- `packages/daemon/src/__tests__/erc8004-routes.test.ts` - 9 integration tests

## Decisions Made
- Used ADAPTER_NOT_AVAILABLE (503) for unconfigured registry feature gates since SERVICE_UNAVAILABLE is not a defined ErrorCode. Both Identity and Reputation registries have mainnet defaults so this only triggers for Validation Registry.
- Re-exported IDENTITY_REGISTRY_ABI, REPUTATION_REGISTRY_ABI, VALIDATION_REGISTRY_ABI from @waiaas/actions index to enable cross-package import without sub-path exports.
- Registration file response uses z.any() OpenAPI schema since the ERC-8004 spec allows free-form JSON structure.
- RPC client falls back to public https://eth.llamarpc.com endpoint when rpc.evm_ethereum_mainnet is not configured.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Changed SERVICE_UNAVAILABLE to ADAPTER_NOT_AVAILABLE**
- **Found during:** Task 1 (build verification)
- **Issue:** Plan specified `WAIaaSError('SERVICE_UNAVAILABLE')` but that error code does not exist in @waiaas/core
- **Fix:** Changed to `ADAPTER_NOT_AVAILABLE` which maps to 503 (same HTTP status intent)
- **Files modified:** packages/daemon/src/api/routes/erc8004.ts
- **Verification:** Build passes
- **Committed in:** 8d1e376b

**2. [Rule 3 - Blocking] Re-exported ABI constants from @waiaas/actions index**
- **Found during:** Task 1 (import resolution)
- **Issue:** ABI files not accessible via `@waiaas/actions` package exports (only `.` export path)
- **Fix:** Added re-exports for 3 ABI constants in packages/actions/src/index.ts
- **Files modified:** packages/actions/src/index.ts
- **Verification:** Build passes, all imports resolve
- **Committed in:** 8d1e376b

**3. [Rule 1 - Bug] Fixed registration file response type mismatch**
- **Found during:** Task 1 (build verification)
- **Issue:** `z.record(z.unknown())` return type incompatible with OpenAPIHono handler TypedResponse
- **Fix:** Changed to `z.any()` for free-form JSON response and added `as any` cast
- **Files modified:** packages/daemon/src/api/routes/openapi-schemas.ts, erc8004.ts
- **Verification:** Build passes
- **Committed in:** 8d1e376b

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All fixes essential for build correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 4 GET endpoints ready for connect-info integration (Plan 319-02)
- Registration file endpoint ready for Admin UI registration file viewer (Phase 322)
- Build passes, typecheck passes, 9 tests pass

---
*Phase: 319-readonly-routes-registration-file*
*Completed: 2026-03-04*
