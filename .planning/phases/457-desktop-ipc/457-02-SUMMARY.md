---
phase: 457-desktop-ipc
plan: 02
subsystem: design
tags: [vite, tauri, tree-shaking, bundle, desktop, build-config]

requires:
  - phase: 456-doc39-rewrite
    provides: "Rewritten section 6 project structure with packages/admin/src/desktop/ directory"
  - phase: 457-desktop-ipc plan 01
    provides: "isDesktop() detection and IPC bridge specs (sections 3.5-3.9)"
provides:
  - "Module boundary rules with ESLint enforcement (Section 6.4)"
  - "Desktop-only dependency list with optional peer dep strategy (Section 6.5)"
  - "4-layer tree-shaking strategy with CI verification (Section 6.6)"
  - "Vite build config changes and Tauri dev workflow (Section 6.7)"
affects: [458-structural-validation, m33-02-desktop-implementation]

tech-stack:
  added: []
  patterns: [optional-peer-deps, vite-define-desktop, rollup-external, ci-bundle-verification]

key-files:
  created: []
  modified:
    - "internal/design/39-tauri-desktop-architecture.md"

key-decisions:
  - "Optional peerDependencies strategy: Desktop deps declared as optional peers in admin, installed only in apps/desktop"
  - "4-layer tree-shaking: dynamic import + peer deps + build constant + CI verification"
  - "Single build output (no dual build): runtime branching via isDesktop() + code splitting via dynamic import"
  - "HMR-first dev workflow: Vite dev server (option A) over Daemon direct load (option B)"
  - "Vite mode=desktop flag for Desktop-specific build constants"

patterns-established:
  - "rollupOptions.external for optional peer deps: prevents build errors when Desktop deps are not installed"
  - "CI bundle verification script: scans browser bundle for forbidden Desktop-only strings"
  - "Vite mode=desktop: enables __DESKTOP__=true for Desktop builds while keeping false for browser"

requirements-completed: [BLD-01, BLD-02, BLD-03, BLD-04]

duration: 6min
completed: 2026-03-31
---

# Phase 457 Plan 02: Bundle Boundaries + Tree-Shaking + Vite/Tauri Workflow Summary

**Module boundary rules with ESLint enforcement, 6 Desktop-only dependencies as optional peers, 4-layer tree-shaking strategy, and HMR-first Tauri development workflow with Vite mode=desktop**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-31T11:27:00Z
- **Completed:** 2026-03-31T11:33:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Module boundary rules for packages/admin/src/desktop/ with ESLint no-restricted-imports enforcement
- Desktop-only dependency list (6 packages) with versions, gzip sizes, and optional peer dep installation strategy
- 4-layer tree-shaking strategy: dynamic import code splitting, optional peer deps, build-time constants, CI bundle verification
- Vite build config changes with __DESKTOP__ define and rollupOptions.external for 7 Desktop modules
- tauri.conf.json example with devUrl, beforeDevCommand, beforeBuildCommand, CSP, and window settings
- Dev/production workflow sequences documented
- Cross-reference added to section 6.2

## Task Commits

1. **Task 1: Bundle boundaries + tree-shaking + deps** - `611f0992` (docs)
2. **Task 2: Vite build config + Tauri workflow** - `c178c6a6` (docs)

## Files Created/Modified
- `internal/design/39-tauri-desktop-architecture.md` - Added sections 6.4-6.7, updated 6.2 cross-ref

## Decisions Made
- Optional peerDependencies over regular dependencies for Desktop deps (ensures browser build never resolves them)
- Single build output strategy (no separate browser/Desktop builds) for pipeline simplicity
- HMR-first development (devUrl -> Vite dev server) for fast iteration
- Vite mode=desktop flag to control __DESKTOP__ build constant per environment
- CI bundle verification as final safety net (forbidden string scan in browser main bundle)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All IPC/bundle/tree-shaking design sections complete (3.5-3.9, 6.4-6.7)
- Phase 458 can now validate structural consistency and update m33-02 objectives

---
*Phase: 457-desktop-ipc*
*Completed: 2026-03-31*
