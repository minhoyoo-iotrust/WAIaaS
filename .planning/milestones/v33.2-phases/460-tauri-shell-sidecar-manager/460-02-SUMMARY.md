---
phase: 460-tauri-shell-sidecar-manager
plan: 02
subsystem: infra
tags: [sea, esbuild, native-addon, node-sea, postject, sidecar]

requires:
  - phase: 456-458 (v33.0)
    provides: SEA binary architecture design (doc-39 section 4.1)
provides:
  - SEA build script (build-sea.mjs) for daemon single binary
  - sea-config.json with native addon assets
  - native-loader.ts for SEA/non-SEA native addon loading
  - WAIAAS_PORT stdout protocol in daemon-startup.ts
  - daemon.port file fallback
affects: [460-03, 461, 463]

tech-stack:
  added: [esbuild, postject, node:sea]
  patterns: [SEA binary build pipeline, native addon extraction via dlopen, stdout port discovery protocol]

key-files:
  created:
    - packages/daemon/scripts/build-sea.mjs
    - packages/daemon/sea-config.json
    - packages/daemon/src/infrastructure/native-loader.ts
  modified:
    - packages/daemon/src/lifecycle/daemon-startup.ts
    - packages/daemon/package.json

key-decisions:
  - "CLI entry point (packages/cli/src/index.ts) used as esbuild entry for SEA bundle"
  - "Native addons externalized from esbuild, loaded via process.dlopen in SEA mode"
  - "WAIAAS_PORT stdout output added after server.listen resolves for sidecar port discovery"
  - "daemon.port file written as fallback when stdout parsing fails"

patterns-established:
  - "SEA build pipeline: esbuild CJS -> SEA blob -> postject injection -> Tauri copy"
  - "native-loader.ts: async loadNativeAddon() with SEA/non-SEA branching"

requirements-completed: [SIDE-07, SIDE-08]

duration: 8min
completed: 2026-03-31
---

# Phase 460 Plan 02: SEA Binary Build Pipeline Summary

**Node.js SEA build pipeline with esbuild bundling, native addon dlopen loader, and WAIAAS_PORT stdout protocol for sidecar port discovery**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-31T15:36:00Z
- **Completed:** 2026-03-31T15:44:00Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Created build-sea.mjs with 5-step pipeline: esbuild CJS bundle -> native addon prebuild copy -> SEA blob generation -> postject injection -> Tauri externalBin copy
- Implemented native-loader.ts for SEA/non-SEA native addon loading via process.dlopen with temp file extraction
- Added WAIAAS_PORT stdout protocol and daemon.port file fallback to daemon-startup.ts
- Added esbuild and postject as devDependencies, build:sea script

## Task Commits

1. **Task 1: SEA build script + native-loader + port output** - `6c4e8ca9` (feat)

## Files Created/Modified
- `packages/daemon/scripts/build-sea.mjs` - SEA build pipeline (230+ lines)
- `packages/daemon/sea-config.json` - SEA config with native addon assets
- `packages/daemon/src/infrastructure/native-loader.ts` - SEA/non-SEA native addon loader
- `packages/daemon/src/lifecycle/daemon-startup.ts` - WAIAAS_PORT stdout + daemon.port file
- `packages/daemon/package.json` - build:sea script + esbuild/postject devDeps

## Decisions Made
- esbuild entry is CLI index (packages/cli/src/index.ts) since that's the daemon startup path
- Native addons (sodium-native, better-sqlite3, argon2) externalized from esbuild and embedded as SEA assets
- Port discovery uses server.address().port after listen completes for accurate port reporting

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript compilation errors in native-loader.ts**
- **Found during:** Task 1 (daemon build)
- **Issue:** process.dlopen type mismatch (Record<string, unknown> vs NodeJS.Module)
- **Fix:** Changed to { exports: {} } as NodeJS.Module pattern
- **Verification:** pnpm build passes

**2. [Rule 1 - Bug] Fixed AddressInfo import in daemon-startup.ts**
- **Found during:** Task 1 (daemon build)
- **Issue:** Dynamic import of AddressInfo from node:net caused unused variable and type errors
- **Fix:** Used server.address() with typeof check instead of importing AddressInfo
- **Verification:** pnpm build passes

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SEA build pipeline ready (build-sea.mjs)
- WAIAAS_PORT stdout protocol implemented for SidecarManager
- daemon.port file fallback written
- Integration with Tauri SidecarManager ready for Plan 03

---
*Phase: 460-tauri-shell-sidecar-manager*
*Completed: 2026-03-31*
