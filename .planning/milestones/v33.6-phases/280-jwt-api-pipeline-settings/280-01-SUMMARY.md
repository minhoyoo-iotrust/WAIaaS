---
phase: 280-jwt-api-pipeline-settings
plan: "01"
subsystem: auth
tags: [jwt, session, telegram, middleware, openapi]

# Dependency graph
requires:
  - phase: 279-db-core-resolution
    provides: session_wallets without is_default column, wallets without default_network, resolveWalletId 2-priority
provides:
  - JwtPayload without wlt claim (sub/iat/exp only)
  - session-auth middleware without defaultWalletId context
  - owner-auth middleware using route param only
  - Session creation/renewal without default wallet logic
  - Telegram bot JWT and session_wallets without wlt/is_default
  - setDefaultWalletRoute deleted (404)
affects: [280-02, 280-03, admin-ui, sdk, mcp]

# Tech tracking
tech-stack:
  added: []
  patterns: [jwt-payload-minimal, wallet-resolution-at-request-time]

key-files:
  modified:
    - packages/daemon/src/infrastructure/jwt/jwt-secret-manager.ts
    - packages/daemon/src/api/middleware/session-auth.ts
    - packages/daemon/src/api/middleware/owner-auth.ts
    - packages/daemon/src/api/routes/sessions.ts
    - packages/daemon/src/api/routes/mcp.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/__tests__/session-response-compat.test.ts
    - packages/daemon/src/__tests__/session-lifecycle-e2e.test.ts
    - packages/daemon/src/__tests__/session-auth.test.ts
    - packages/daemon/src/__tests__/jwt-secret-manager.test.ts

key-decisions:
  - "Kept walletId field in session create/list response (value: first wallet, not default)"
  - "Old JWTs with wlt claim silently ignored by jose (no migration needed)"
  - "signTestToken keeps walletId param as _walletId for API compatibility"

patterns-established:
  - "JWT payload minimal: sub/iat/exp only, no wallet info cached in token"
  - "Wallet resolved at request time via resolveWalletId, never from JWT"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05]

# Metrics
duration: 15min
completed: 2026-02-27
---

# Phase 280 Plan 01: JWT/Auth Middleware + Telegram Bot Default Wallet Logic Removal Summary

**Removed wlt claim from JWT, defaultWalletId from auth middleware, isDefault from session routes/Telegram bot, and deleted setDefaultWalletRoute**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-27T10:24:47Z
- **Completed:** 2026-02-27T10:39:30Z
- **Tasks:** 2
- **Files modified:** 25

## Accomplishments
- JwtPayload reduced to 3 fields (sub, iat, exp) -- wlt claim removed
- session-auth middleware no longer sets defaultWalletId context variable
- owner-auth middleware uses route param only (no defaultWalletId fallback)
- All JWT creation sites (sessions, MCP, Telegram, admin) updated to omit wlt
- setDefaultWalletRoute (PATCH /sessions/:id/wallets/:walletId/default) deleted
- CANNOT_REMOVE_DEFAULT_WALLET check removed from wallet removal
- 19 test files updated to remove wlt from JwtPayload literals
- session-response-compat.test.ts rewritten for v29.3 behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove wlt from JwtPayload + session-auth + owner-auth middleware** - `73060424` (fix)
2. **Task 2: Remove wlt/defaultWalletId/isDefault from sessions.ts + Telegram bot** - `ab44bcfe` (fix)

## Files Created/Modified
- `packages/daemon/src/infrastructure/jwt/jwt-secret-manager.ts` - JwtPayload interface (wlt removed), signToken/verifyToken updated
- `packages/daemon/src/api/middleware/session-auth.ts` - Removed defaultWalletId context set
- `packages/daemon/src/api/middleware/owner-auth.ts` - Uses route param only for walletId
- `packages/daemon/src/api/routes/sessions.ts` - Removed defaultWalletId, isDefault, setDefaultWalletRoute
- `packages/daemon/src/api/routes/mcp.ts` - Removed wlt from JWT, isDefault from session_wallets insert
- `packages/daemon/src/api/server.ts` - Removed /default-network middleware guard
- `packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts` - Removed wlt from JWT, is_default from INSERT
- `packages/daemon/src/api/routes/openapi-schemas.ts` - Removed isDefault from session schemas, deleted SessionDefaultWalletSchema
- `packages/daemon/src/__tests__/session-response-compat.test.ts` - Rewritten for v29.3 (no isDefault, no wlt, 404 for setDefault)
- `packages/daemon/src/__tests__/session-lifecycle-e2e.test.ts` - Updated assertions, removed CANNOT_REMOVE_DEFAULT_WALLET tests
- `packages/daemon/src/__tests__/session-auth.test.ts` - Updated for no defaultWalletId context
- `packages/daemon/src/__tests__/jwt-secret-manager.test.ts` - Removed wlt from all payload literals
- 11 additional test files - Removed wlt from JwtPayload type assertions

## Decisions Made
- Kept `walletId` field in session create/list response as backward-compat field (value = first wallet, not "default")
- Old JWTs with wlt claim are silently ignored by jose library (no error, no migration needed)
- `signTestToken` helper keeps `walletId` parameter as `_walletId` for API compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed wlt references in admin.ts JWT creation and session_wallets insert**
- **Found during:** Task 2
- **Issue:** admin.ts had 2 JWT creation sites with `wlt:` and 1 session_wallets insert with `isDefault:`
- **Fix:** Removed wlt from JWT payloads, isDefault from insert, removed defaultWallet query for session re-sign
- **Files modified:** packages/daemon/src/api/routes/admin.ts
- **Verification:** `grep wlt admin.ts` returns no matches; typecheck passes
- **Committed in:** ab44bcfe (handled by parallel plan 280-02)

**2. [Rule 3 - Blocking] Fixed wlt references in mcp.ts JWT creation and session_wallets insert**
- **Found during:** Task 2
- **Issue:** mcp.ts had JWT payload with `wlt:` and session_wallets insert with `isDefault:`
- **Fix:** Removed wlt from JWT payload, isDefault from insert
- **Files modified:** packages/daemon/src/api/routes/mcp.ts
- **Committed in:** ab44bcfe

**3. [Rule 3 - Blocking] Fixed wlt in 19 test files and security test helpers**
- **Found during:** Task 2
- **Issue:** 19 test files had `wlt: walletId` in JwtPayload literals, causing TS2353 type errors
- **Fix:** Removed wlt from all test JWT payload literals, updated assertions
- **Files modified:** 19 test files
- **Committed in:** ab44bcfe

**4. [Rule 3 - Blocking] Fixed OpenAPI schemas with isDefault and SessionDefaultWalletSchema**
- **Found during:** Task 2
- **Issue:** OpenAPI response schemas still had isDefault fields and SessionDefaultWalletSchema
- **Fix:** Removed isDefault from SessionCreateResponse, SessionListItem, SessionWallet, SessionWalletList; deleted SessionDefaultWalletSchema
- **Files modified:** packages/daemon/src/api/routes/openapi-schemas.ts
- **Committed in:** ab44bcfe (handled by parallel plan 280-02)

**5. [Rule 3 - Blocking] Fixed default_network in test seed SQL**
- **Found during:** Task 2
- **Issue:** session-auth.test.ts and session-lifecycle-e2e.test.ts seed SQL referenced default_network column (removed in migration v27)
- **Fix:** Removed default_network from INSERT statements
- **Files modified:** session-auth.test.ts, session-lifecycle-e2e.test.ts
- **Committed in:** ab44bcfe

---

**Total deviations:** 5 auto-fixed (all Rule 3 - blocking)
**Impact on plan:** All auto-fixes were necessary for type safety and test correctness. No scope creep -- these were downstream consequences of the planned JWT/session changes.

## Issues Encountered
None -- typecheck passes with 0 errors after all changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- JWT auth layer is clean (no wlt, no defaultWalletId)
- Plans 280-02 and 280-03 can proceed (API endpoints, pipeline, admin settings)
- All session-related tests updated for v29.3 behavior

---
*Phase: 280-jwt-api-pipeline-settings*
*Completed: 2026-02-27*

## Self-Check: PASSED
- 280-01-SUMMARY.md: FOUND
- Commit 73060424 (Task 1): FOUND
- Commit ab44bcfe (Task 2): FOUND
