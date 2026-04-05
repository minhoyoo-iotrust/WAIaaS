---
phase: 66-infra-build-pipeline
plan: 01
subsystem: infra
tags: [preact, vite, turborepo, build-pipeline, spa, admin-ui]

# Dependency graph
requires:
  - phase: 65-admin-web-ui-design
    provides: Admin UI specification (doc 67) with Preact SPA architecture
provides:
  - "@waiaas/admin package with Vite + Preact build pipeline"
  - "turbo.json build ordering (admin before daemon)"
  - "postbuild copy to daemon/public/admin/"
  - "gitignore for build artifacts"
affects: [67-auth-app-shell, 68-dashboard-wallet, 69-policy-settings, 70-activity-status]

# Tech tracking
tech-stack:
  added: [preact@10.25, "@preact/preset-vite@2.9", "@preact/signals@2.0", preact-router@4.1, vite@6.1]
  patterns: [vite-build-pipeline, postbuild-artifact-copy, turbo-explicit-task-dependency]

key-files:
  created:
    - packages/admin/package.json
    - packages/admin/tsconfig.json
    - packages/admin/vite.config.ts
    - packages/admin/index.html
    - packages/admin/src/main.tsx
    - packages/admin/src/app.tsx
    - packages/admin/src/styles/global.css
  modified:
    - turbo.json
    - .gitignore
    - packages/daemon/package.json
    - pnpm-lock.yaml

key-decisions:
  - "All Preact/Vite deps as devDependencies (0 runtime deps for admin package)"
  - "modulePreload polyfill disabled for CSP script-src 'self' compatibility"
  - "base path set to /admin/ for daemon static serving"
  - "Explicit turbo task override for admin (no ^build) and daemon (depends on admin#build)"

patterns-established:
  - "postbuild copy pattern: admin dist/* -> daemon/public/admin/"
  - "turbo.json package-specific task overrides for cross-package build artifacts"
  - "Preact tsconfig extends base with jsx/jsxImportSource overrides and verbatimModuleSyntax disabled"

# Metrics
duration: 2min
completed: 2026-02-11
---

# Phase 66 Plan 01: Admin Build Pipeline Summary

**Preact + Vite SPA scaffold with turbo.json build ordering and postbuild copy to daemon/public/admin/**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-11T06:32:50Z
- **Completed:** 2026-02-11T06:35:14Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Scaffolded @waiaas/admin package with Preact 10.25 + Vite 6.1 build pipeline
- Build produces dist/index.html (0.41 KB) + assets/*.js (10.76 KB) + assets/*.css (0.39 KB)
- postbuild automatically copies build output to packages/daemon/public/admin/
- turbo.json ensures admin builds before daemon via explicit @waiaas/daemon#build dependency
- Build artifacts in daemon/public/ are git-ignored

## Task Commits

Each task was committed atomically:

1. **Task 1: Create @waiaas/admin package with Vite + Preact build config** - `3f5b57f` (feat)
2. **Task 2: Configure turbo.json build dependency + gitignore + daemon package.json** - `ae29dcd` (chore)

**Plan metadata:** `ff9a63c` (docs: complete plan)

## Files Created/Modified
- `packages/admin/package.json` - Admin package definition with Vite build scripts and Preact devDependencies
- `packages/admin/tsconfig.json` - TypeScript config extending base with Preact JSX overrides
- `packages/admin/vite.config.ts` - Vite build config with Preact preset, base=/admin/, modulePreload disabled
- `packages/admin/index.html` - SPA entry HTML with root div and module script
- `packages/admin/src/main.tsx` - Preact render mount point
- `packages/admin/src/app.tsx` - Minimal placeholder App component
- `packages/admin/src/styles/global.css` - CSS reset + dark mode CSS variables
- `turbo.json` - Added @waiaas/admin#build and @waiaas/daemon#build task overrides
- `.gitignore` - Added packages/daemon/public/ exclusion
- `packages/daemon/package.json` - Added "public" to files array
- `pnpm-lock.yaml` - Updated with Preact/Vite dependencies

## Decisions Made
- All Preact/Vite dependencies as devDependencies (0 runtime deps) -- admin is a build-only package, never imported by other packages
- modulePreload polyfill disabled for CSP script-src 'self' compatibility (tech decision #15 from design doc)
- base path `/admin/` so assets resolve correctly when served by daemon at /admin/ route
- Explicit turbo task overrides: admin#build has no ^build (no workspace deps), daemon#build depends on admin#build + ^build
- tsconfig disables verbatimModuleSyntax (incompatible with Preact JSX transform) and strict unused checks (development convenience)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in `packages/daemon/src/__tests__/notification-service.test.ts` cause `pnpm build` (full turbo build) to fail at the daemon build step. This is NOT related to admin changes -- the admin build completes successfully, and the turbo build ordering correctly executes admin before daemon. The daemon TS errors are a pre-existing issue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Admin build pipeline is fully operational for Phase 67 (auth + app shell)
- CSS variables and global reset ready for UI component development
- Preact signals and preact-router devDependencies installed for routing/state work
- Pre-existing daemon build errors should be addressed separately (not blocking admin development)

## Self-Check: PASSED

---
*Phase: 66-infra-build-pipeline*
*Completed: 2026-02-11*
