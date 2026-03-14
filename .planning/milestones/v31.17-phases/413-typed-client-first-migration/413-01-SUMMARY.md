---
phase: 413-typed-client-first-migration
plan: 01
subsystem: admin-api-client
tags: [openapi-fetch, typed-client, middleware, auth]
dependency_graph:
  requires: [412-01, 412-02]
  provides: [typed-client, createTypedClient, ApiError-reexport]
  affects: [admin-pages, admin-tests]
tech_stack:
  added: [openapi-fetch@0.17.0]
  patterns: [openapi-fetch-middleware, createTypedClient-factory]
key_files:
  created:
    - packages/admin/src/api/typed-client.ts
    - packages/admin/src/__tests__/typed-client.test.ts
  modified:
    - packages/admin/package.json
    - pnpm-lock.yaml
decisions:
  - "createTypedClient factory exported for testability -- accepts custom fetch"
  - "onError returns ApiError (extends Error) per openapi-fetch middleware contract"
  - "baseUrl derived from globalThis.location.origin for browser/jsdom compatibility"
metrics:
  duration: 6min
  completed: "2026-03-15"
---

# Phase 413 Plan 01: openapi-fetch typed client + auth middleware Summary

openapi-fetch v0.17 client with request/response middleware for auth header injection, 401 auto-logout, and error normalization.

## What Was Done

### Task 1: Install openapi-fetch and create typed-client.ts with auth middleware (TDD)

**RED**: Created 10 failing unit tests covering all middleware behaviors.
**GREEN**: Implemented `createTypedClient` factory and `api` singleton.
**Commit**: 57ac3ca4

Key implementation details:
- `createTypedClient(customFetch?)` factory enables test injection of mock fetch
- Request middleware: injects `X-Master-Password` header from `masterPassword.value` signal
- Response middleware: 401 triggers `logout()` for `/v1/admin/*` paths, throws `ApiError` for all non-ok responses
- Error middleware: returns `ApiError` instances (TIMEOUT for AbortError, NETWORK_ERROR for others)
- `ApiError` re-exported from `./client` (zero duplication)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] openapi-fetch captures globalThis.fetch at createClient() time**
- **Found during:** TDD GREEN phase
- **Issue:** vi.spyOn(globalThis, 'fetch') after module import doesn't affect openapi-fetch's internal fetch reference
- **Fix:** Created `createTypedClient(customFetch?)` factory that passes fetch to createClient options, enabling test injection
- **Files modified:** typed-client.ts, typed-client.test.ts
- **Commit:** 57ac3ca4

**2. [Rule 3 - Blocking] openapi-fetch onError must return Error, not throw**
- **Found during:** TDD GREEN phase
- **Issue:** openapi-fetch middleware contract requires onError to return Response|Error, not throw
- **Fix:** Changed `throw new ApiError(...)` to `return new ApiError(...)` in onError handler
- **Files modified:** typed-client.ts
- **Commit:** 57ac3ca4

## Verification Results

- `pnpm --filter @waiaas/admin test -- --run typed-client` -- 10/10 tests pass
- typed-client.ts compiles without type errors
- `api.GET('/v1/admin/status')` infers AdminStatusResponse return type
