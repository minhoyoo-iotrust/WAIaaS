---
phase: 328-rest-api-policy-settings
plan: 02
subsystem: api, security
tags: [erc8128, rest-api, rfc9421, eip191, openapi, hono]

# Dependency graph
requires:
  - phase: 327-http-message-signing-engine
    provides: signHttpMessage, verifyHttpSignature core functions
  - phase: 328-rest-api-policy-settings/01
    provides: ERC8128_ALLOWED_DOMAINS policy, domain evaluator, rate limiter, settings, notifications
provides:
  - POST /v1/erc8128/sign endpoint with sessionAuth
  - POST /v1/erc8128/verify endpoint with sessionAuth
  - Server wiring with feature gate, domain policy, rate limiting
  - UNSUPPORTED_CHAIN error code for chain-specific operations
affects: [329-mcp-sdk-admin-ui, skill-files]

# Tech tracking
tech-stack:
  added: []
  patterns: [erc8128Core namespace import from @waiaas/core, 4-level policy override resolution]

key-files:
  created:
    - packages/daemon/src/api/routes/erc8128.ts
    - packages/daemon/src/__tests__/erc8128-routes.test.ts
  modified:
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/server.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/core/src/__tests__/i18n.test.ts

key-decisions:
  - "Import erc8128 as namespace (erc8128Core) since @waiaas/core exports it as namespace not flat"
  - "Added UNSUPPORTED_CHAIN as new generic error code (reusable beyond ERC-8128)"
  - "Added CHAIN and ERC8128 as new ErrorDomain types"

patterns-established:
  - "ERC-8128 route pattern: feature gate -> wallet resolve -> domain policy -> rate limit -> key decrypt -> sign -> zero-fill"

requirements-completed: [API-01, API-02]

# Metrics
duration: 12min
completed: 2026-03-05
---

# Phase 328 Plan 02: ERC-8128 REST API Endpoints Summary

**POST /v1/erc8128/sign and /v1/erc8128/verify REST API endpoints with feature gate, domain policy, rate limiting, and server wiring**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-05T05:52:00Z
- **Completed:** 2026-03-05T06:04:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- POST /v1/erc8128/sign endpoint: sessionAuth, feature gate, EVM-only check, domain policy evaluation, per-domain rate limiting, private key zero-fill
- POST /v1/erc8128/verify endpoint: sessionAuth, feature gate, signature verification with address recovery
- Server wiring with sessionAuth on /v1/erc8128/* wildcard
- 4 new error codes: UNSUPPORTED_CHAIN, ERC8128_DISABLED, ERC8128_DOMAIN_NOT_ALLOWED, ERC8128_RATE_LIMITED
- 11 route integration tests covering all behaviors

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /v1/erc8128/sign + POST /v1/erc8128/verify endpoints** - `5c80b105` (feat)
2. **Task 2: Route barrel export + server wiring** - `0a3f77d4` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/erc8128.ts` - ERC-8128 sign + verify REST API endpoints with OpenAPI schemas
- `packages/daemon/src/__tests__/erc8128-routes.test.ts` - 11 route integration tests
- `packages/daemon/src/api/routes/index.ts` - Added erc8128Routes barrel export
- `packages/daemon/src/api/server.ts` - Registered ERC-8128 routes with sessionAuth middleware
- `packages/core/src/errors/error-codes.ts` - Added UNSUPPORTED_CHAIN, ERC8128_DISABLED, ERC8128_DOMAIN_NOT_ALLOWED, ERC8128_RATE_LIMITED error codes + CHAIN/ERC8128 ErrorDomain types
- `packages/core/src/i18n/en.ts` - Added error messages for 4 new error codes
- `packages/core/src/i18n/ko.ts` - Added Korean error messages for 4 new error codes
- `packages/core/src/__tests__/i18n.test.ts` - Updated error code count (123 total)

## Decisions Made
- erc8128 functions imported via namespace (`erc8128Core.signHttpMessage`) because @waiaas/core exports erc8128 as namespace module, not flat exports
- Added `UNSUPPORTED_CHAIN` as a generic error code (reusable for any chain-specific operation rejection)
- Added `CHAIN` and `ERC8128` as new ErrorDomain types to support the new error codes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added UNSUPPORTED_CHAIN and ERC8128_* error codes to ERROR_CODES**
- **Found during:** Task 1 (route creation)
- **Issue:** Plan referenced `UNSUPPORTED_CHAIN`, `ERC8128_DISABLED`, `ERC8128_DOMAIN_NOT_ALLOWED`, `ERC8128_RATE_LIMITED` in buildErrorResponses but these error codes didn't exist
- **Fix:** Added all 4 error codes to error-codes.ts with proper ErrorDomain types, i18n messages in en/ko
- **Files modified:** packages/core/src/errors/error-codes.ts, en.ts, ko.ts, i18n.test.ts
- **Committed in:** 5c80b105

**2. [Rule 3 - Blocking] Added CHAIN and ERC8128 to ErrorDomain union type**
- **Found during:** Task 1 (TypeScript build)
- **Issue:** New error code domains 'CHAIN' and 'ERC8128' were not in the ErrorDomain type union
- **Fix:** Added both to ErrorDomain type in error-codes.ts
- **Committed in:** 5c80b105

**3. [Rule 3 - Blocking] Fixed erc8128 import to namespace pattern**
- **Found during:** Task 2 (TypeScript typecheck)
- **Issue:** @waiaas/core exports erc8128 as namespace (`export * as erc8128`), not flat exports
- **Fix:** Changed to `import { erc8128 as erc8128Core }` and updated all function calls
- **Committed in:** 0a3f77d4

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All fixes necessary for compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ERC-8128 REST API fully functional with feature gate, domain policy, and rate limiting
- Ready for MCP + SDK + Admin UI integration (Phase 329)
- Skill files will need updating to document new endpoints

---
*Phase: 328-rest-api-policy-settings*
*Completed: 2026-03-05*
