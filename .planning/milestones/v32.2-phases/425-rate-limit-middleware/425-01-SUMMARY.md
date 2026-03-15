---
phase: 425-rate-limit-middleware
plan: 01
subsystem: api-middleware
tags: [security, rate-limit, middleware]
dependency_graph:
  requires: []
  provides: [RATE_LIMITED error code, SlidingWindowRateLimiter, 3-tier rate limit middleware]
  affects: [packages/daemon/src/api/server.ts, packages/core/src/errors/error-codes.ts]
tech_stack:
  added: []
  patterns: [sliding-window rate limiting, per-request SettingsService hot-reload]
key_files:
  created:
    - packages/daemon/src/api/middleware/rate-limiter.ts
    - packages/daemon/src/__tests__/rate-limiter.test.ts
  modified:
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/api/middleware/index.ts
    - packages/daemon/src/api/server.ts
    - packages/core/src/__tests__/errors.test.ts
    - packages/core/src/__tests__/i18n.test.ts
decisions:
  - Return 429 JSON directly (not via WAIaaSError throw) to include Retry-After header in response
  - Each factory creates its own SlidingWindowRateLimiter instance for isolation
  - Cleanup timer uses unref() to not prevent process exit
metrics:
  duration: 5min
  completed: 2026-03-15
---

# Phase 425 Plan 01: Rate Limit Middleware Summary

In-memory sliding-window rate limiter with 3-tier middleware (IP/session/TX) registered in createApp(), reading SettingsService on each request for hot-reload.

## What Was Built

### Task 1: RATE_LIMITED Error Code + SlidingWindowRateLimiter + 3-Tier Middleware (TDD)

- **RATE_LIMITED** error code added to `@waiaas/core` (SYSTEM domain, 429, retryable)
- **SlidingWindowRateLimiter** class: Map-based sliding window with auto-cleanup timer
  - `check(key, limit, windowMs)` returns `{ allowed, remaining, retryAfterSec }`
  - `cleanup()` removes expired entries, `destroy()` clears timer
- **createIpRateLimiter**: IP from `x-forwarded-for` / `x-real-ip`, reads `security.rate_limit_global_ip_rpm`
- **createSessionRateLimiter**: Session ID from context, reads `security.rate_limit_session_rpm`, skips if no session
- **createTxRateLimiter**: Session ID, reads `security.rate_limit_tx_rpm`, for transaction endpoints only
- i18n messages added for both en and ko locales
- 11 unit tests covering all behavior

### Task 2: createApp() Registration

- IP rate limiter registered globally (`app.use('*')`) after requestLogger (position 5)
- Session rate limiter registered on session-authed route patterns after auth middleware
- TX rate limiter registered on `/v1/transactions`, `/v1/actions/execute`, `/v1/admin/actions/execute`
- All gated on `deps.settingsService` availability (no rate limit in tests without it)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated error code count in core test snapshots**
- **Found during:** Verification
- **Issue:** errors.test.ts and i18n.test.ts had hardcoded count of 143 error codes
- **Fix:** Updated both to 144 to account for new RATE_LIMITED error code
- **Files modified:** `packages/core/src/__tests__/errors.test.ts`, `packages/core/src/__tests__/i18n.test.ts`
- **Commit:** 589e6103

**2. [Design] Return 429 directly instead of throwing WAIaaSError**
- **Issue:** Error handler creates new Response via `c.json()`, so headers set before throw are lost
- **Fix:** Middleware returns `c.json({code:'RATE_LIMITED',...}, 429)` directly with `c.header('Retry-After')` set before

## Verification Results

| Check | Result |
|-------|--------|
| `rate-limiter.test.ts` (11 tests) | PASS |
| `api-server.test.ts` (26 tests) | PASS (no regression) |
| `errors.test.ts` (15 tests) | PASS |
| `i18n.test.ts` (8 tests) | PASS |
| `typecheck @waiaas/daemon + @waiaas/core` | PASS |

## Commits

| Hash | Message |
|------|---------|
| 7d821448 | feat(425-01): add RATE_LIMITED error code + SlidingWindowRateLimiter + 3-tier middleware |
| 073cbc13 | feat(425-01): register 3-tier rate limit middleware in createApp() |
| 589e6103 | fix(425-01): update error code count in core tests for RATE_LIMITED |
