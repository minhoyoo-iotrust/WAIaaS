---
phase: 457-desktop-ipc
plan: 01
subsystem: design
tags: [tauri, ipc, csp, environment-detection, conditional-rendering, desktop]

requires:
  - phase: 456-doc39-rewrite
    provides: "Rewritten design doc 39 sections (2.1, 2.2, 3.3, 6, 7, 13) with Admin Web UI reuse architecture"
provides:
  - "isDesktop() environment detection strategy (Section 3.5)"
  - "IPC bridge detailed spec for 6 commands with Rust + TypeScript signatures (Section 3.6)"
  - "Tauri CapabilityBuilder.remote() URL patterns and capabilities (Section 3.7)"
  - "CSP exception strategy with platform-specific rules (Section 3.8)"
  - "Conditional rendering patterns for 3 Desktop-only components (Section 3.9)"
affects: [457-02-PLAN, 458-structural-validation, m33-02-desktop-implementation]

tech-stack:
  added: []
  patterns: [isDesktop-guard, desktopComponent-lazy-loader, tauri-ipc-invoke-wrapper]

key-files:
  created: []
  modified:
    - "internal/design/39-tauri-desktop-architecture.md"

key-decisions:
  - "isDesktop() uses window.__TAURI_INTERNALS__ (not __TAURI__) for Tauri 2.x detection with module-level caching"
  - "IPC errors are string-typed (Rust Result::Err(String)) with structured prefixes like AlreadyRunning, PortInUse"
  - "CapabilityBuilder.remote() uses http://127.0.0.1:*/* pattern with #[cfg(not(dev))] guard"
  - "CSP override via tauri.conf.json security.csp (overrides HTML meta CSP in WebView)"
  - "desktopComponent() helper combines lazy() + Suspense + isDesktop() for zero-cost browser rendering"

patterns-established:
  - "isDesktop() guard: all Desktop-only code entry points must use this guard"
  - "desktopComponent() helper: standardized lazy loading pattern for Desktop components"
  - "IPC invoke wrapper: async functions in tauri-bridge.ts that dynamic-import @tauri-apps/api/core"

requirements-completed: [IPC-01, IPC-02, IPC-03, IPC-04, IPC-05]

duration: 8min
completed: 2026-03-31
---

# Phase 457 Plan 01: IPC Bridge + Environment Detection + CSP + Conditional Rendering Summary

**isDesktop() environment detection, 6-command IPC bridge spec with Rust/TS signatures, Tauri Capability settings, CSP exception strategy, and desktopComponent() conditional rendering pattern for 3 Desktop-only components**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-31T11:18:28Z
- **Completed:** 2026-03-31T11:26:30Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- isDesktop() environment detection with __TAURI_INTERNALS__ check, module-level caching, and SSR safety guard
- 6 IPC commands fully specified with Rust struct definitions, TypeScript interfaces, error cases, and timeout policies
- CapabilityBuilder.remote() configuration with capabilities/default.json example for least-privilege IPC access
- CSP exception strategy with platform-specific differences (macOS/Linux vs Windows) and tauri.conf.json example
- Conditional rendering patterns with desktopComponent() helper for Setup Wizard, Sidecar Status Panel, and WalletConnect QR
- Section 13.3 updated with cross-references to eliminate duplication

## Task Commits

1. **Task 1: isDesktop() + IPC bridge + Capability settings** - `c7c2a509` (docs)
2. **Task 2: CSP exception + conditional rendering** - `16795a31` (docs)

## Files Created/Modified
- `internal/design/39-tauri-desktop-architecture.md` - Added sections 3.5-3.9, updated 3.2 cross-ref and 13.3

## Decisions Made
- isDesktop() uses `window.__TAURI_INTERNALS__` (Tauri 2.x internal IPC object, not 1.x `__TAURI__`)
- Module-level caching for isDesktop() since runtime environment never changes
- IPC errors as structured string prefixes (e.g., "PortInUse:", "SpawnFailed:") for simple error handling
- CapabilityBuilder.remote() only in production (`#[cfg(not(dev))]`) since dev mode auto-allows localhost
- CSP `'wasm-unsafe-eval'` instead of `'unsafe-eval'` as preventive measure for @reown/appkit WASM usage
- desktopComponent() returns `() => null` in browser for zero rendering cost

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sections 3.5-3.9 provide the IPC/detection/CSP/rendering foundation
- Plan 457-02 can now add bundle boundary and tree-shaking sections (6.4-6.7) without conflicts

---
*Phase: 457-desktop-ipc*
*Completed: 2026-03-31*
