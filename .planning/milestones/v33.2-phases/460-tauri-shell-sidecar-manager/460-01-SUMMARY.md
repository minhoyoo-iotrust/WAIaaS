---
phase: 460-tauri-shell-sidecar-manager
plan: 01
subsystem: desktop
tags: [tauri, rust, sidecar, ipc, process-management]

requires:
  - phase: 456-458 (v33.0)
    provides: Desktop app architecture design (doc-39)
provides:
  - Tauri 2 project structure (apps/desktop/)
  - SidecarManager Rust implementation (spawn, port discovery, health check, crash restart, graceful shutdown)
  - 6 IPC command handlers (start/stop/restart/status/logs/notification)
  - PID lockfile management
  - Splash HTML page with loading states
  - Tauri capabilities and CSP configuration
affects: [460-02, 460-03, 461, 462, 463]

tech-stack:
  added: [tauri 2, tauri-plugin-shell, tauri-plugin-notification, tauri-plugin-process, reqwest, regex, tokio, dirs-next, libc]
  patterns: [sidecar process management, stdout port discovery protocol, Tauri IPC commands, remote WebView capabilities]

key-files:
  created:
    - apps/desktop/package.json
    - apps/desktop/src-tauri/Cargo.toml
    - apps/desktop/src-tauri/tauri.conf.json
    - apps/desktop/src-tauri/capabilities/default.json
    - apps/desktop/src-tauri/src/main.rs
    - apps/desktop/src-tauri/src/sidecar.rs
    - apps/desktop/src-tauri/src/commands.rs
    - apps/desktop/src-tauri/src/types.rs
    - apps/desktop/src-tauri/src/lockfile.rs
    - apps/desktop/src/splash.html
  modified: []

key-decisions:
  - "Tauri 2.x app commands use generate_handler (not plugin system) -- remote capability handled via capabilities/default.json remote block"
  - "SidecarManager uses tauri-plugin-shell Command::sidecar() for Tauri 2.x compatibility"
  - "Crash auto-restart emits sidecar-crashed event for main.rs to handle (avoids circular reference)"
  - "Placeholder RGBA PNG icons generated for cargo check -- real icons deferred to later phase"

patterns-established:
  - "Sidecar stdout protocol: WAIAAS_PORT={port} regex parsing with file fallback"
  - "Tauri event system for splash screen status updates (sidecar-status event)"
  - "Windows Job Object setup via conditional compilation (#[cfg(windows)])"

requirements-completed: [SIDE-01, SIDE-02, SIDE-03, SIDE-04, SIDE-05, SIDE-06, VIEW-03]

duration: 12min
completed: 2026-03-31
---

# Phase 460 Plan 01: Tauri 2 Project Scaffolding + SidecarManager Summary

**Tauri 2 project with Rust SidecarManager for daemon lifecycle management (spawn, stdout port parsing, health polling, crash restart, PID lockfile, graceful shutdown)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-31T15:23:51Z
- **Completed:** 2026-03-31T15:35:51Z
- **Tasks:** 1
- **Files modified:** 16

## Accomplishments
- Tauri 2 project scaffolded at apps/desktop/ with full Rust backend
- SidecarManager implements complete daemon lifecycle: spawn via shell plugin, stdout WAIAAS_PORT regex parsing with file fallback, /health polling (30s timeout, 2s interval), crash detection with auto-restart (max 3), graceful shutdown (POST /shutdown -> kill)
- 6 IPC commands registered: start_daemon, stop_daemon, restart_daemon, get_daemon_status, get_daemon_logs, send_notification
- PID lockfile management with stale lockfile detection (kill(pid, 0) on Unix, OpenProcess on Windows)
- Windows Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE for zombie prevention
- Splash HTML with CSS-only spinner, status progression, error retry, and log viewer

## Task Commits

1. **Task 1: Tauri 2 project scaffolding + SidecarManager** - `8fb9b4e4` (feat)

## Files Created/Modified
- `apps/desktop/package.json` - @waiaas/desktop package definition
- `apps/desktop/src-tauri/Cargo.toml` - Rust dependencies (tauri 2, plugins, tokio, reqwest)
- `apps/desktop/src-tauri/tauri.conf.json` - Tauri config (CSP, externalBin, window settings)
- `apps/desktop/src-tauri/capabilities/default.json` - IPC permissions + remote URLs
- `apps/desktop/src-tauri/src/main.rs` - App entry point with setup, auto-start, navigate
- `apps/desktop/src-tauri/src/sidecar.rs` - SidecarManager (290+ lines)
- `apps/desktop/src-tauri/src/commands.rs` - 6 IPC command handlers (70+ lines)
- `apps/desktop/src-tauri/src/types.rs` - Shared types (DaemonStatus, DaemonState, HealthStatus)
- `apps/desktop/src-tauri/src/lockfile.rs` - PID lockfile management
- `apps/desktop/src/splash.html` - Splash page with loading states and error UI
- `apps/desktop/src-tauri/build.rs` - tauri_build::build()
- `apps/desktop/src-tauri/binaries/.gitignore` - Exclude generated sidecar binaries

## Decisions Made
- Used `tauri::Emitter` trait (Tauri 2.x) instead of Manager for event emission
- App-level IPC commands via generate_handler (not custom plugin) -- simpler for initial scaffolding, plugin-style permissions deferred to Phase 461
- Crash recovery emits `sidecar-crashed` event rather than self-restarting (avoids Arc self-reference)
- Placeholder RGBA PNG icons for cargo check pass -- proper icons in later phase

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Tauri 2.x permission system compatibility**
- **Found during:** Task 1 (cargo check)
- **Issue:** `waiaas:allow-*` custom permissions don't exist for app-level commands (only for plugins)
- **Fix:** Removed custom permission references from capabilities/default.json, added core:event:default and shell:allow-spawn. Removed CapabilityBuilder from main.rs setup.
- **Files modified:** capabilities/default.json, main.rs
- **Verification:** cargo check passes

**2. [Rule 3 - Blocking] Fixed missing Emitter trait import**
- **Found during:** Task 1 (cargo check)
- **Issue:** Tauri 2.x moved `emit()` to `Emitter` trait, not on `Manager`
- **Fix:** Changed `use tauri::Manager` to `use tauri::Emitter` in sidecar.rs, added both in main.rs
- **Files modified:** sidecar.rs, main.rs
- **Verification:** cargo check passes

**3. [Rule 3 - Blocking] Created RGBA PNG icons and placeholder sidecar binary**
- **Found during:** Task 1 (cargo check)
- **Issue:** generate_context!() macro panicked on missing icon files and sidecar binary
- **Fix:** Generated minimal RGBA PNG icons (32x32, 128x128, 256x256), created placeholder sidecar binary, added .gitignore for binaries
- **Files modified:** icons/*.png, binaries/.gitignore
- **Verification:** cargo check passes

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All fixes necessary for cargo check to pass. No scope creep.

## Issues Encountered
None beyond the auto-fixed blocking issues above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tauri project builds successfully (cargo check)
- SidecarManager ready for integration with SEA binary (Plan 02)
- Splash -> navigate flow ready for integration (Plan 03)
- Real sidecar binary will be generated by Plan 02 (build-sea.mjs)

---
*Phase: 460-tauri-shell-sidecar-manager*
*Completed: 2026-03-31*
