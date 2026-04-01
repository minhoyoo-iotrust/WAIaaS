# Domain Pitfalls: Tauri 2 Desktop App

**Domain:** Desktop App (Tauri 2 + Sidecar + WebView)
**Researched:** 2026-03-31

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: IPC Loss on External URL Navigation

**What goes wrong:** Navigating WebView to `http://localhost:{port}/admin` (the daemon) loses `window.__TAURI_INTERNALS__` and all IPC capability.
**Why it happens:** By default, Tauri only injects IPC bridge for content served from `tauri://localhost` (bundled assets). External URLs are treated as untrusted.
**Consequences:** `invoke()` calls fail silently or throw. Desktop-only features (status card, tray control from UI) completely broken.
**Prevention:** Configure `remote.urls` in capabilities:
```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": ["core:default", "shell:allow-spawn", "shell:allow-execute"],
  "remote": {
    "urls": ["http://localhost:*"]
  }
}
```
This explicitly allows IPC from any localhost port. Wildcard port is needed because of dynamic allocation.
**Detection:** If `isDesktop()` returns false when running in Tauri WebView, capability config is wrong. Test this immediately in Phase 1.

### Pitfall 2: SEA Binary Native Addon Failures

**What goes wrong:** Node.js SEA binary crashes on startup because `sodium-native` or `better-sqlite3` native addons fail to load.
**Why it happens:** SEA bundles JS into the Node binary but native .node addons must be shipped alongside. esbuild cannot bundle .node files. Path resolution differs between SEA and regular Node.
**Consequences:** Daemon fails to start. Desktop app shows splash forever.
**Prevention:**
1. Use prebuildify to include platform-specific .node binaries in the SEA resource directory
2. Override `process.execPath` or use `__dirname` workaround for addon path resolution in SEA mode
3. Test SEA binary on each target platform in CI before publishing
4. Consider `--use-snapshot` or `--use-code-cache` for faster startup
**Detection:** SidecarManager sees process exit code != 0 within first 5 seconds. Log stderr for addon loading errors.

### Pitfall 3: Port Discovery Race Condition

**What goes wrong:** Sidecar stdout parsing misses the `WAIAAS_PORT={port}` line because daemon prints other output first, or the line arrives split across multiple events.
**Why it happens:** stdout is line-buffered but Tauri's `CommandEvent::Stdout` delivers raw bytes. Long startup logs may push the port line past the initial buffer.
**Consequences:** WebView stays on splash forever. SidecarManager times out.
**Prevention:**
1. Daemon should print `WAIAAS_PORT={port}` as the FIRST stdout line before any other output
2. Parse every stdout line, not just the first one (accumulate lines until port found or timeout)
3. Implement tempfile fallback: read `{data_dir}/daemon.port` if stdout parsing fails
4. Set reasonable timeout (30s) with clear error state
**Detection:** PortDiscovery state that lasts > 10s should trigger warning. > 30s transitions to Crashed.

### Pitfall 4: WebView CSS Rendering Differences

**What goes wrong:** Admin Web UI looks broken in Tauri WebView on certain platforms, especially Linux (WebKitGTK) and older Windows (WebView2 version).
**Why it happens:** Each OS uses a different WebView engine: macOS = WebKit, Windows = WebView2 (Chromium), Linux = WebKitGTK. CSS features may differ.
**Consequences:** Layout breaks, modals misaligned, scrolling issues. Users lose trust in the app.
**Prevention:**
1. Test on all 3 platforms early (Phase 1, not Phase 4)
2. Avoid CSS features with poor WebKitGTK support (some newer CSS Grid features, backdrop-filter)
3. Add `webkit-` prefixes where needed
4. Admin Web UI already uses conservative CSS (no TailwindCSS, plain styles) which helps
**Detection:** E2E [HUMAN] #16 covers this. Run manual checks on each platform after Phase 1.

## Moderate Pitfalls

### Pitfall 5: WalletConnect in Tauri WebView

**What goes wrong:** @reown/appkit fails to initialize in Tauri's WebView due to missing browser APIs or CORS restrictions.
**Why it happens:** WalletConnect SDK assumes a standard browser environment. Tauri WebView may restrict certain APIs (IndexedDB in some configurations, WebSocket from non-standard origins).
**Prevention:** Phase 0 spike is specifically designed to catch this. If Plan A fails, Plan B (direct WebSocket to WalletConnect Relay + custom QR) is the fallback. Do not invest in WalletConnect integration before the spike passes.

### Pitfall 6: Tauri Dev vs Build Behavior Mismatch

**What goes wrong:** App works perfectly in `tauri dev` mode but fails after `tauri build`.
**Why it happens:** In dev mode, `devUrl` points to Vite dev server (bundled assets with HMR). In production, WebView navigates to the daemon URL. CSP, CORS, and IPC capability behavior may differ.
**Prevention:**
1. Test `tauri build` early and often, not just `tauri dev`
2. Ensure capability `remote.urls` is configured for production, not just dev
3. Dev mode should also test the splash->navigate flow (even if devUrl is faster)
**Detection:** CI should run `tauri build` on every PR to catch build-only failures.

### Pitfall 7: Sidecar Zombie Process on Crash

**What goes wrong:** If Tauri app crashes (Rust panic, SIGKILL), the sidecar daemon keeps running as an orphan process.
**Why it happens:** Sidecar is a child process. On abnormal parent exit, OS may not send SIGTERM to children (platform-dependent behavior).
**Consequences:** Next app launch fails because the port file still exists and/or the old daemon occupies a port.
**Prevention:**
1. On startup, check for stale `{data_dir}/daemon.port` file and try to connect. If unreachable, delete it.
2. Use PID file alongside port file. On startup, check if PID is alive.
3. Consider using process groups so OS kills children with parent.
**Detection:** Daemon startup logs showing "address already in use" indicate zombie from previous run.

### Pitfall 8: Cross-Platform SEA Binary Naming

**What goes wrong:** Tauri sidecar can't find the binary because the target triple suffix doesn't match.
**Why it happens:** Tauri requires exact `{name}-{target-triple}` format. `rustc --print host-tuple` may output a different triple than expected.
**Consequences:** App launches but sidecar spawn fails immediately.
**Prevention:**
1. Use a build script that runs `rustc --print host-tuple` and renames accordingly
2. Test the exact binary name in CI for each platform
3. The rename script from Tauri's Node.js sidecar guide provides the correct pattern

## Minor Pitfalls

### Pitfall 9: Bundle Size Bloat from Desktop Dependencies

**What goes wrong:** @tauri-apps/api and @reown/appkit end up in the browser Admin Web UI bundle.
**Prevention:** 4-layer tree-shaking strategy. CI bundle size check as regression gate.

### Pitfall 10: Tray Icon Not Visible on Some Linux DEs

**What goes wrong:** System tray icon doesn't show on some Linux desktop environments (e.g., GNOME without extensions).
**Prevention:** Tray is a convenience, not critical path. App should work fine with just the window. Document that some Linux DEs need AppIndicator extension.

### Pitfall 11: macOS Code Signing + Notarization

**What goes wrong:** macOS Gatekeeper blocks the app with "developer cannot be verified" error.
**Prevention:** Set up Apple Developer ID certificate in CI. Use `tauri-action` built-in notarization support. Budget for Apple Developer Program ($99/year).

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 0: WalletConnect Spike | #5 WalletConnect in WebView | Spike-first approach, Plan A/B |
| Phase 1: Sidecar Manager | #2 Native addon failures, #3 Port race condition | SEA test matrix, stdout-first protocol |
| Phase 1: WebView Navigate | #1 IPC loss on external URL | `remote.urls` capability config |
| Phase 2: IPC + Tray | #7 Zombie process | PID file + stale detection |
| Phase 3: Desktop Extensions | #9 Bundle bloat | 4-layer tree-shaking |
| Phase 4: CI + Release | #4 CSS differences, #8 Binary naming, #11 Code signing | Platform matrix testing |

## Sources

- [Tauri capability docs](https://v2.tauri.app/reference/acl/capability/) -- IPC loss prevention (HIGH)
- [GitHub #5088: __TAURI__ on remote URLs](https://github.com/tauri-apps/tauri/issues/5088) -- confirms IPC behavior (HIGH)
- [GitHub #1974: plugin-localhost + v2](https://github.com/tauri-apps/plugins-workspace/issues/1974) -- capability workaround (HIGH)
- [Tauri sidecar docs](https://v2.tauri.app/develop/sidecar/) -- binary naming requirements (HIGH)
- [Node.js SEA docs](https://nodejs.org/api/single-executable-applications.html) -- native addon limitations (HIGH)
