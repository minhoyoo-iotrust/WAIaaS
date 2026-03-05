---
phase: 325-rest-api-agent-self-service
plan: 01
subsystem: api
tags: [openapi, zod, dual-auth, smart-account, aa-provider, encryption]

requires:
  - phase: 324-db-core-provider-model
    provides: aa_provider DB columns, encryptProviderApiKey, AA_PROVIDER_CHAIN_MAP

provides:
  - PUT /v1/wallets/:id/provider endpoint with dual-auth
  - SetProviderRequestSchema + SetProviderResponseSchema (Zod SSoT)
  - buildProviderStatus helper for deriving provider status from DB record
  - PROVIDER_UPDATED audit event type

affects: [326-admin-ui-mcp-connect-info, wallet-detail-response, mcp-tools]

tech-stack:
  added: []
  patterns: [dual-auth-middleware-for-wallet-subpath, superRefine-provider-validation]

key-files:
  created:
    - packages/daemon/src/__tests__/wallet-provider-api.test.ts
  modified:
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/wallets.ts
    - packages/daemon/src/api/server.ts
    - packages/core/src/schemas/audit.schema.ts
    - packages/core/src/__tests__/schemas/audit.schema.test.ts

key-decisions:
  - "Dual-auth via Bearer token detection: sessionAuth if Bearer wai_sess_ prefix, masterAuth otherwise"
  - "PROVIDER_UPDATED added as 21st audit event type"
  - "Preset providers don't store URLs in DB (derived at runtime from chain mapping)"

patterns-established:
  - "Wallet sub-path dual-auth: skip in parent /v1/wallets/:id, register separate middleware for /v1/wallets/:id/provider"

requirements-completed: [PROV-08, ASSR-01, ASSR-02, ASSR-03, ASSR-04]

duration: 8min
completed: 2026-03-05
---

# Phase 325 Plan 01: PUT /v1/wallets/:id/provider Summary

**PUT /v1/wallets/:id/provider with dual-auth (masterAuth + sessionAuth), Zod superRefine validation, and AES-256-GCM API key encryption**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-04T15:43:05Z
- **Completed:** 2026-03-04T15:51:00Z
- **Tasks:** 2 (TDD Task 1 + Task 2 merged into implementation)
- **Files modified:** 6

## Accomplishments
- PUT /v1/wallets/:id/provider supports preset (pimlico/alchemy with apiKey) and custom (bundlerUrl + optional paymasterUrl)
- Dual-auth middleware: sessionAuth for agent self-service, masterAuth for admin
- SessionAuth enforces wallet ownership via verifyWalletAccess (403 for other wallets)
- API key encrypted with AES-256-GCM (HKDF subkey) before DB storage
- 11 tests covering all validation, auth, and encryption scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests** - `7709cf29` (test)
2. **Task 1+2 (GREEN): Implementation** - `72475d1b` (feat)
3. **Type fixes + audit event** - `b96682f8` (fix)

## Files Created/Modified
- `packages/daemon/src/__tests__/wallet-provider-api.test.ts` - 11 test cases for PUT provider endpoint
- `packages/daemon/src/api/routes/openapi-schemas.ts` - SetProviderRequestSchema, SetProviderResponseSchema, ProviderStatusSchema
- `packages/daemon/src/api/routes/wallets.ts` - setProviderRoute handler + buildProviderStatus helper
- `packages/daemon/src/api/server.ts` - Dual-auth middleware for /v1/wallets/:id/provider
- `packages/core/src/schemas/audit.schema.ts` - PROVIDER_UPDATED event type (21 total)
- `packages/core/src/__tests__/schemas/audit.schema.test.ts` - Updated count expectation

## Decisions Made
- Dual-auth pattern: detect Bearer wai_sess_ prefix to route to sessionAuth, otherwise masterAuth
- PROVIDER_UPDATED added as new audit event type (was missing from the 20 existing types)
- Preset providers (pimlico/alchemy) don't store bundler/paymaster URLs in DB; they are derived at runtime from chain mapping and API key

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] buildProviderStatus return type mismatch**
- **Found during:** Typecheck verification
- **Issue:** `provider.name` typed as `string` but OpenAPI schema expects `AaProviderName` union
- **Fix:** Changed return type to use `AaProviderName` and added `as const` assertions
- **Files modified:** packages/daemon/src/api/routes/wallets.ts
- **Committed in:** b96682f8

**2. [Rule 2 - Missing Critical] PROVIDER_UPDATED audit event type**
- **Found during:** Typecheck verification
- **Issue:** `PROVIDER_UPDATED` not in AUDIT_EVENT_TYPES, causing TS error
- **Fix:** Added to AUDIT_EVENT_TYPES (20 -> 21), updated test count
- **Files modified:** packages/core/src/schemas/audit.schema.ts, packages/core/src/__tests__/schemas/audit.schema.test.ts
- **Committed in:** b96682f8

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes necessary for type safety and audit logging. No scope creep.

## Issues Encountered
- Wallet test seed required unique public_key per wallet (UNIQUE constraint) - fixed by parameterizing address
- Chain column must be 'ethereum' not 'evm' (CHECK constraint) - fixed in test helpers

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PUT /v1/wallets/:id/provider endpoint fully functional
- buildProviderStatus helper ready for reuse in Plan 325-02 (wallet detail/list responses)
- ProviderStatusSchema available for response schema extensions

---
*Phase: 325-rest-api-agent-self-service*
*Completed: 2026-03-05*
