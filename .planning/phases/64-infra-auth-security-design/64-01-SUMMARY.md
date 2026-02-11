---
phase: 64-infra-auth-security-design
plan: 01
subsystem: ui
tags: [preact, vite, hono-servestatic, csp, masterauth, admin-ui, design-doc]

# Dependency graph
requires:
  - phase: 58-63 (v1.3)
    provides: "33 REST endpoints, masterAuth middleware, Hono API framework"
provides:
  - "Design doc 67 sections 1-7: Admin Web UI infra, auth, security specs"
  - "Hono serveStatic SPA serving design (INFRA-01, INFRA-04)"
  - "packages/admin directory layout and Vite build strategy (INFRA-02)"
  - "config.toml admin_ui/admin_timeout extension (INFRA-03)"
  - "masterAuth login/logout/timeout flow design (AUTH-01, AUTH-02)"
  - "CSP, memory-only password, XSS/CSRF defense design (SEC-01)"
affects: ["65-page-component-api-design", "v1.3.2-admin-ui-impl"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Preact 10.x SPA with hash router (preact-iso) for static serving compatibility"
    - "@preact/signals for auth store (global signal) + component local state"
    - "Hono serveStatic with CSP middleware and cache policy differentiation"
    - "masterAuth X-Master-Password header injection via fetch wrapper"
    - "config.toml flat key extension pattern (admin_ui, admin_timeout)"

key-files:
  created:
    - "docs/67-admin-web-ui-spec.md"
  modified: []

key-decisions:
  - "Admin UI uses masterAuth only (no JWT sessions) - X-Master-Password header per request"
  - "SPA served via Hono serveStatic, admin_ui=false disables serving (404), API always available"
  - "Password stored in memory-only (@preact/signals), never localStorage/cookie"
  - "Inactivity timeout default 900s (15min), configurable 60-7200s via admin_timeout"
  - "CSP: script-src 'self', default-src 'none' — strictest baseline"
  - "admin_timeout delivered via GET /v1/admin/status response field (no extra endpoint)"
  - "Build artifacts copied to daemon/public/admin/ via postbuild, git-ignored"

patterns-established:
  - "Design doc sectioning: overview -> tech stack -> infra -> package -> config -> auth -> security"
  - "Pseudo-code in design docs references actual Hono 4.x / Preact API for implementability"

# Metrics
duration: 5min
completed: 2026-02-11
---

# Phase 64 Plan 01: Admin Web UI Infra/Auth/Security Design Summary

**Preact SPA serving via Hono serveStatic, masterAuth-only login with @preact/signals auth store, CSP/memory-only password/XSS-CSRF defense in design doc 67 sections 1-7**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-11T04:03:10Z
- **Completed:** 2026-02-11T04:08:39Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Created design doc 67 with 7 sections covering Admin Web UI infrastructure, authentication, and security
- Defined Hono serveStatic SPA serving with CSP middleware, cache policies (immutable for hashed assets, no-cache for index.html), and admin_ui=false 404 behavior
- Specified packages/admin directory layout (20+ files), Vite 6.x build config, postbuild copy strategy, and Turborepo dependency chain
- Designed masterAuth login flow using @preact/signals Auth Store with inactivity timeout (15min default, configurable), automatic 401 redirect, and 4 logout triggers
- Documented comprehensive security model: CSP policy, memory-only password storage, sensitive data exposure prevention, Docker port forwarding considerations, XSS/CSRF multi-layer defense

## Task Commits

Each task was committed atomically:

1. **Task 1: Sections 1-3 (overview, tech stack, Hono serving)** - `9df9d89` (docs)
2. **Task 2: Sections 4-7 (package structure, config, auth, security)** - `f071545` (docs)

## Files Created/Modified

- `docs/67-admin-web-ui-spec.md` - Admin Web UI design document sections 1-7 (overview, tech stack, Hono serving, package structure, config extension, masterAuth auth flow, security considerations)

## Decisions Made

1. **masterAuth only, no JWT sessions**: Admin UI sends X-Master-Password header per request. Argon2id verification per request is acceptable for admin tool request frequency (~300ms/req)
2. **admin_timeout via /v1/admin/status response**: Avoids adding a new endpoint. SPA reads adminTimeout field on login success, uses client default 900s before login
3. **Build artifacts git-ignored**: `packages/daemon/public/admin/` added to .gitignore. CI builds admin package then packages daemon
4. **CSP default-src 'none'**: Most restrictive baseline. Only explicitly needed resource types are allowed
5. **No CSRF token needed**: Custom header (X-Master-Password) + no CORS configuration = cross-origin requests blocked by browser

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Design doc 67 sections 1-7 complete, providing the infrastructure/auth/security foundation
- Phase 65 can proceed to add sections 8-10 (page designs, common components, API integration patterns)
- All 7 requirements (INFRA-01~04, AUTH-01~02, SEC-01) addressed in the design document

## Self-Check: PASSED

---
*Phase: 64-infra-auth-security-design*
*Completed: 2026-02-11*
