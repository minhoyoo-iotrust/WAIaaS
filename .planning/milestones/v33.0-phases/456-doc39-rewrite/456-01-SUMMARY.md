---
phase: 456-doc39-rewrite
plan: 01
subsystem: docs
tags: [tauri, desktop, architecture, preact, admin-web-ui]

requires:
  - phase: none
    provides: first plan in phase
provides:
  - "Design doc 39 sections 2.1, 2.2, 3.1, 3.3 rewritten for Admin Web UI reuse architecture"
affects: [456-02, 457, 458]

tech-stack:
  added: []
  patterns: ["Admin Web UI WebView load architecture", "apiCall() relative path reuse"]

key-files:
  created: []
  modified:
    - "internal/design/39-tauri-desktop-architecture.md"

key-decisions:
  - "WebView loads Admin Web UI from localhost:{port}/admin instead of bundling a separate React 18 SPA"
  - "apiCall() relative path pattern reused from packages/admin/src/api/client.ts -- no Desktop-specific HTTP client needed"
  - "Desktop-only extensions use isDesktop() guard + dynamic import for conditional activation"

patterns-established:
  - "Admin Web UI reuse: WebView loads daemon-served Admin UI, no separate frontend build"
  - "apiCall() relative path: same-origin API routing works identically in browser and WebView"

requirements-completed: [DOC-01, DOC-02, DOC-03]

duration: 5min
completed: 2026-03-31
---

# Phase 456 Plan 01: Architecture + Layer + HTTP Section Rewrite Summary

**Design doc 39 sections 2.1/2.2/3.1/3.3 rewritten from React 18 SPA to Admin Web UI (Preact 10.x) WebView load architecture with apiCall() relative path reuse**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T11:00:26Z
- **Completed:** 2026-03-31T11:05:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Architecture diagram (2.1) replaced React 18 SPA with Admin Web UI (Preact 10.x) WebView load, added Desktop-only extension node
- Layer separation table (2.2) updated from React 18 + TailwindCSS 4 to Preact 10.x + @preact/signals, added Admin Web UI reuse rationale
- Communication diagram (3.1) updated WebView label and fetch pattern to apiCall() relative path
- HTTP localhost section (3.3) rewritten to describe apiCall() reuse from packages/admin/src/api/client.ts with X-Master-Password auto-attach

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite Section 2.1 Architecture Diagram + Section 2.2 Layer Separation** - `68539f4d` (docs)
2. **Task 2: Rewrite Section 3.3 HTTP localhost Communication** - `069080da` (docs)

## Files Created/Modified
- `internal/design/39-tauri-desktop-architecture.md` - Sections 2.1, 2.2, 3.1, 3.3 rewritten for Admin Web UI reuse architecture

## Decisions Made
- Kept single "React 18" reference in v33.0 change note (historical context explaining what was replaced)
- Updated section 3.1 diagram alongside 3.3 text (both reference the same communication pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sections 2.1, 2.2, 3.1, 3.3 complete and consistent
- Ready for Plan 456-02 to rewrite sections 6, 7, 13

---
*Phase: 456-doc39-rewrite*
*Completed: 2026-03-31*
