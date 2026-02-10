---
phase: 52-auth-foundation
plan: 01
subsystem: auth
tags: [jwt, jose, hs256, middleware, hono, session, dual-key-rotation]

# Dependency graph
requires:
  - phase: 51-basic-transfer
    provides: "Hono middleware pattern (createMiddleware, errorHandler), SQLite schema (key_value_store, sessions), WAIaaSError with error codes"
provides:
  - "JwtSecretManager class with key_value_store persistence and dual-key 5-min rotation"
  - "createSessionAuth middleware factory for wai_sess_ Bearer token validation"
  - "JwtPayload interface (sub, agt, iat, exp)"
affects: [52-02-masterAuth-ownerAuth, 53-session-management, 54-cli-flow]

# Tech tracking
tech-stack:
  added: [jose ^6.1.3]
  patterns: [JWT HS256 dual-key rotation, wai_sess_ token prefix, middleware factory with DI deps]

key-files:
  created:
    - packages/daemon/src/infrastructure/jwt/jwt-secret-manager.ts
    - packages/daemon/src/infrastructure/jwt/index.ts
    - packages/daemon/src/api/middleware/session-auth.ts
    - packages/daemon/src/__tests__/jwt-secret-manager.test.ts
    - packages/daemon/src/__tests__/session-auth.test.ts
  modified:
    - packages/daemon/package.json
    - pnpm-lock.yaml
    - packages/daemon/src/api/middleware/index.ts

key-decisions:
  - "jose library for JWT: ESM-native, minimal API, HS256 symmetric key from Buffer.from(hex, 'hex')"
  - "Dual-key rotation window: current secret stored at jwt_secret_current, previous at jwt_secret_previous in key_value_store"
  - "wai_sess_ prefix on all session JWT tokens for visual identification"
  - "ROTATION_TOO_RECENT error (429) blocks rotation within 5-minute window"
  - "sessionAuth middleware uses factory pattern (createSessionAuth) with JwtSecretManager + DB deps injection"

patterns-established:
  - "JwtSecretManager: in-memory cache + DB persistence, initialize() idempotent, dual-key getValidSecrets()"
  - "Token format: wai_sess_ + JWT (HS256), verifyToken strips prefix before jose jwtVerify"
  - "sessionAuth middleware: header check -> JWT verify -> DB session lookup -> context set"

# Metrics
duration: 5min
completed: 2026-02-10
---

# Phase 52 Plan 01: JWT Secret + sessionAuth Middleware Summary

**JWT secret management with dual-key 5-min rotation via jose HS256, sessionAuth middleware validating wai_sess_ tokens against DB sessions**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-10T06:22:22Z
- **Completed:** 2026-02-10T06:27:18Z
- **Tasks:** 2/2
- **Files modified:** 8

## Accomplishments
- JwtSecretManager class stores/loads 256-bit secrets in key_value_store with Drizzle ORM
- Dual-key rotation: old secret valid for 5 minutes after rotation, ROTATION_TOO_RECENT guard
- signToken produces wai_sess_ prefixed HS256 JWTs, verifyToken validates against current + previous secrets
- createSessionAuth middleware: validates Bearer header, verifies JWT, checks DB session revocation, sets sessionId/agentId context
- 20 new tests (12 JwtSecretManager + 8 sessionAuth), all 187 daemon tests pass, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Install jose + implement JwtSecretManager with dual-key rotation + tests** - `b5b47b3` (feat)
2. **Task 2: Implement createSessionAuth middleware factory + tests** - `d8216ef` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/jwt/jwt-secret-manager.ts` - JwtSecretManager class with secret CRUD, dual-key rotation, sign/verify
- `packages/daemon/src/infrastructure/jwt/index.ts` - Barrel export for JwtSecretManager and JwtPayload
- `packages/daemon/src/api/middleware/session-auth.ts` - createSessionAuth middleware factory
- `packages/daemon/src/api/middleware/index.ts` - Updated barrel with createSessionAuth export
- `packages/daemon/package.json` - Added jose ^6.1.3 dependency
- `pnpm-lock.yaml` - Lock file updated
- `packages/daemon/src/__tests__/jwt-secret-manager.test.ts` - 12 unit tests for JwtSecretManager
- `packages/daemon/src/__tests__/session-auth.test.ts` - 8 unit tests for sessionAuth middleware

## Decisions Made
- **jose over jsonwebtoken:** jose is ESM-native, smaller, and used by Edge runtimes. HS256 symmetric key created from Buffer.from(hexSecret, 'hex').
- **key_value_store for secrets:** JWT secrets stored as JSON in the existing key_value_store table (jwt_secret_current, jwt_secret_previous keys). No new tables needed.
- **wai_sess_ prefix:** All session tokens prefixed with wai_sess_ for visual identification and format validation before JWT parsing.
- **In-memory cache:** JwtSecretManager caches secrets in memory after initialize() to avoid DB reads on every verify. Cache refreshed only on rotateSecret().
- **c.get type handling:** Used `as never` cast pattern for untyped Hono context variables (sessionId, agentId) in tests, matching existing error-handler.ts pattern.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
- **Hono context typing:** `c.get('sessionId')` produces TypeScript error because Hono's default context has no typed variables. Fixed in test code using `c.get('sessionId' as never) as string | undefined` pattern, consistent with existing `c.get('requestId') as string | undefined` in error-handler.ts.
- **WAIaaSError assertion:** Initial tests used `toThrow('ROTATION_TOO_RECENT')` which matches against `message`, not `code`. Changed to `toMatchObject({ code: 'ROTATION_TOO_RECENT' })` for correct property matching.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness
- JWT infrastructure ready for Plan 52-02 (masterAuth + ownerAuth middleware)
- JwtSecretManager.signToken() ready for session creation (Phase 53)
- createSessionAuth available in middleware barrel for route protection
- No blockers for next plan

## Self-Check: PASSED

---
*Phase: 52-auth-foundation*
*Completed: 2026-02-10*
