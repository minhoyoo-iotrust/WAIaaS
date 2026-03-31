---
phase: 456-doc39-rewrite
plan: 02
subsystem: docs
tags: [tauri, desktop, architecture, preact, admin-web-ui, isDesktop, setup-wizard]

requires:
  - phase: 456-01
    provides: "Sections 2.1, 2.2, 3.1, 3.3 rewritten for Admin Web UI reuse"
provides:
  - "Design doc 39 sections 6, 7, 13 rewritten for Admin Web UI reuse + Desktop extensions"
  - "Section 7: 19 existing pages + 3 Desktop-only extensions (Wizard, Sidecar, WalletConnect)"
  - "Section 13.3: Admin Web UI reuse considerations (isDesktop, dynamic import, CSP)"
affects: [457, 458]

tech-stack:
  added: []
  patterns: ["isDesktop() guard for conditional rendering", "dynamic import for Desktop-only modules", "Admin Web UI page reuse in WebView"]

key-files:
  created: []
  modified:
    - "internal/design/39-tauri-desktop-architecture.md"

key-decisions:
  - "Removed 8-screen separate React frontend -- replaced with Admin Web UI 19 pages reuse"
  - "Desktop-only extensions limited to 3: Setup Wizard, Sidecar Status Panel, WalletConnect QR"
  - "Setup Wizard steps updated to match m33-02 objectives (wallets instead of agents, Owner optional)"
  - "Section 13.3 added with isDesktop(), dynamic import, CSP, and auth considerations"

patterns-established:
  - "Desktop extensions in packages/admin/src/desktop/ with isDesktop() guard"
  - "Desktop-only pages in packages/admin/src/pages/ (setup-wizard.tsx)"
  - "Desktop-only components in packages/admin/src/components/ (desktop-status.tsx)"

requirements-completed: [DOC-04, DOC-05, DOC-06]

duration: 8min
completed: 2026-03-31
---

# Phase 456 Plan 02: Project Structure + UI Flows + Implementation Notes Rewrite Summary

**Design doc 39 sections 6/7/13 rewritten: 8-screen React frontend replaced with Admin Web UI 19-page reuse + 3 Desktop-only extensions (Setup Wizard, Sidecar Status, WalletConnect QR)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-31T11:05:00Z
- **Completed:** 2026-03-31T11:13:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Section 6 project structure rewritten: packages/desktop/src/ 8-page React frontend removed, replaced with apps/desktop/ Rust shell + packages/admin/src/ extensions
- Section 7 UI flows rewritten: 8 separate screen designs (with full layouts) condensed to Admin Web UI 19 pages + 3 Desktop-only extensions with focused specifications
- Section 13 implementation notes updated: React references replaced with Admin Web UI + isDesktop() patterns, new section 13.3 added for reuse considerations
- Net reduction of ~280 lines from removing redundant React screen layouts while preserving all critical Desktop-specific content

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite Section 6 Project Structure** - `5f001acf` (docs)
2. **Task 2: Rewrite Section 7 UI Flows + Section 13 Implementation Notes** - `6333eb4a` (docs)

## Files Created/Modified
- `internal/design/39-tauri-desktop-architecture.md` - Sections 6, 7, 13 rewritten for Admin Web UI reuse architecture

## Decisions Made
- Condensed sections 7.2-7.9 (8 screens with full ASCII layouts) into 7.2-7.4 (3 Desktop-only extensions) since existing 19 pages are documented in design doc 67
- Updated Setup Wizard steps to align with m33-02 objectives: "agents" -> "wallets", Owner connection made optional (skippable)
- Added section 13.3 for Admin Web UI reuse considerations including CSP adjustment notes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 target sections (2.1, 2.2, 3.3, 6, 7, 13) of design doc 39 have been rewritten
- Sections 3.1 diagram also updated (bonus consistency fix)
- Ready for Phase 457 (Desktop environment detection + IPC + bundle design)
- Ready for Phase 458 (structural validation + objectives sync)

---
*Phase: 456-doc39-rewrite*
*Completed: 2026-03-31*
