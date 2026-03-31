---
phase: 461-ipc-bridge-system-tray
plan: 01
subsystem: desktop
tags: [tauri, ipc, tree-shaking, vite, typescript]

requires:
  - phase: 460-tauri-shell-sidecar-manager
    provides: Tauri app with 6 IPC commands and SidecarManager
provides:
  - isDesktop() environment detection utility
  - TypeScript IPC bridge with 7 typed invoke wrappers
  - quit_app Rust IPC command (graceful shutdown + exit)
  - 4-layer tree-shaking configuration for browser/desktop code separation
  - CI bundle verification script
affects: [461-02, 462, desktop-ui]

tech-stack:
  added: []
  patterns: [dynamic-import-ipc, isDesktop-guard, 4-layer-tree-shaking, optional-peer-deps]

key-files:
  created:
    - packages/admin/src/utils/platform.ts
    - packages/admin/src/desktop/bridge/types.ts
    - packages/admin/src/desktop/bridge/tauri-bridge.ts
    - packages/admin/scripts/verify-browser-bundle.sh
  modified:
    - apps/desktop/src-tauri/src/commands.rs
    - apps/desktop/src-tauri/src/main.rs
    - packages/admin/vite.config.ts
    - packages/admin/package.json

key-decisions:
  - "Dynamic import(@tauri-apps/api/core) inside getInvoke() for tree-shaking safety"
  - "Removed 'walletconnect' from forbidden bundle patterns -- legitimate Admin UI settings content"
  - "Optional peer dependency only for @tauri-apps/api (other Tauri plugins are Rust-side only)"

patterns-established:
  - "isDesktop() guard: check window.__TAURI_INTERNALS__ with cached result"
  - "IPC bridge pattern: dynamic import -> getInvoke() -> typed invoke<T>('command_name')"
  - "4-layer tree-shaking: (1) dynamic import, (2) rollup externals, (3) __DESKTOP__ define, (4) CI verification"

requirements-completed: [IPC-01, IPC-02, IPC-03, IPC-04, IPC-05, IPC-06, IPC-07, VIEW-02, VIEW-04]

duration: 6min
completed: 2026-03-31
---

# Phase 461 Plan 01: IPC Bridge TS Wrappers Summary

**7 typed IPC command wrappers with isDesktop() detection and 4-layer tree-shaking ensuring Desktop code never leaks to browser builds**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-31T16:08:13Z
- **Completed:** 2026-03-31T16:14:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- quit_app Rust IPC command added (graceful daemon shutdown then app exit)
- isDesktop() utility detects Tauri WebView via __TAURI_INTERNALS__ with cached result
- TypeScript bridge with 7 typed async invoke wrappers using dynamic import pattern
- 4-layer tree-shaking: dynamic import, rollup externals, __DESKTOP__ define, CI verification script
- Browser build verified clean with verify-browser-bundle.sh

## Task Commits

Each task was committed atomically:

1. **Task 1: quit_app Rust command + isDesktop() + TS bridge** - `24b43f1f` (feat)
2. **Task 2: Vite tree-shaking + CI bundle verification + peer deps** - `2aae71be` (feat)

## Files Created/Modified
- `packages/admin/src/utils/platform.ts` - isDesktop() environment detection
- `packages/admin/src/desktop/bridge/types.ts` - TS types mirroring Rust DaemonStatus/args
- `packages/admin/src/desktop/bridge/tauri-bridge.ts` - 7 async invoke wrappers
- `packages/admin/scripts/verify-browser-bundle.sh` - CI bundle purity check
- `apps/desktop/src-tauri/src/commands.rs` - Added quit_app command
- `apps/desktop/src-tauri/src/main.rs` - Registered quit_app in invoke_handler
- `packages/admin/vite.config.ts` - __DESKTOP__ define + rollup externals
- `packages/admin/package.json` - Optional @tauri-apps/api peer dependency

## Decisions Made
- Used dynamic import for @tauri-apps/api/core inside getInvoke() helper to ensure tree-shaking
- Removed 'walletconnect' from forbidden bundle patterns since it appears legitimately in Admin UI settings forms
- Only @tauri-apps/api added as optional peer dep (other Tauri plugins used only on Rust side)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed verify-browser-bundle.sh false positive on 'walletconnect'**
- **Found during:** Task 2 (CI bundle verification)
- **Issue:** 'walletconnect' string appears in Admin UI settings form content (WalletConnect provider config), causing false positive
- **Fix:** Removed 'walletconnect' from forbidden patterns list, keeping only module import patterns (@tauri-apps, __TAURI_INTERNALS__, @reown/appkit)
- **Files modified:** packages/admin/scripts/verify-browser-bundle.sh
- **Verification:** verify-browser-bundle.sh passes after build
- **Committed in:** 2aae71be

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary fix to prevent false CI failures. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- IPC bridge ready for System Tray (Plan 02) to use SidecarManager state
- isDesktop() available for conditional rendering in Phase 462
- Tree-shaking verified for all future Desktop-only code additions

---
*Phase: 461-ipc-bridge-system-tray*
*Completed: 2026-03-31*
