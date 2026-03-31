# Feature Landscape

**Domain:** Desktop App Architecture Redesign (Tauri + Admin Web UI Reuse)
**Researched:** 2026-03-31

## Table Stakes

Features that MUST exist for the Tauri Desktop App to function correctly with the existing Admin Web UI. Missing = app broken or unusable.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **WebView localhost URL Loading** | Tauri WebView must load `http://localhost:{port}/admin` to render existing Admin Web UI | Low | Sidecar port allocation | Tauri 2 natively supports `WebviewUrl::External`. `tauri-plugin-localhost` is NOT needed -- WAIaaS daemon already serves static assets via Hono. WebView simply navigates to the daemon's HTTP endpoint. |
| **Environment Detection (`isDesktop()`)** | Admin Web UI code must know if running in Tauri or browser to show/hide desktop-only features | Low | None | Tauri 2 provides `isTauri()` from `@tauri-apps/api/core`. Fallback: `'__TAURI_INTERNALS__' in window`. Single utility function in `packages/admin/src/utils/platform.ts`. |
| **IPC Bridge for Daemon Lifecycle** | WebView needs to invoke Rust commands for start/stop/restart daemon, get daemon status, get logs | Med | Tauri IPC, `@tauri-apps/api/core` invoke | Design doc 39 already defines 6 IPC commands. Use `invoke()` with typed wrappers. Only needed for operations impossible via HTTP (daemon process management). |
| **Dynamic Port Allocation** | Desktop sidecar daemon must bind to an available port (not hardcoded 3100) to avoid conflicts with other WAIaaS instances or services | Med | Sidecar Manager (Rust) | Sidecar Manager finds free port -> passes as CLI arg to daemon -> daemon binds -> Sidecar Manager updates WebView URL. Critical for multi-instance support. |
| **API Base URL Adaptation** | `apiCall()` in `packages/admin/src/api/client.ts` currently uses relative paths (`/v1/...`). In Tauri, WebView origin is the daemon URL, so relative paths work naturally. | Low | Port allocation | Current architecture is already compatible: relative fetch paths resolve against `http://localhost:{port}`, which IS the daemon. No API client changes needed. |
| **Conditional Sidebar Items** | Desktop mode should show desktop-only nav items (Setup Wizard, Sidecar Status) that don't exist in browser mode | Low | `isDesktop()` | Add items to `NAV_SECTIONS` in `layout.tsx` conditionally via `isDesktop()` guard. Hash router already supports arbitrary paths. |
| **Graceful Daemon Unavailable State** | When sidecar daemon is starting/stopping/crashed, WebView must show status instead of "Cannot connect to daemon" errors | Med | IPC Bridge, daemon status events | Current `ShutdownOverlay` in `app.tsx` handles shutdown. Extend pattern: `daemonStarting`, `daemonCrashed` signals driven by Tauri events (not HTTP polling). |

## Differentiators

Features that add desktop-specific value beyond the browser Admin Web UI. Not required for basic function, but expected in a desktop app.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Setup Wizard** | First-run experience: create master password, configure first wallet, optional owner setup. Browser Admin UI has no onboarding flow because it assumes daemon is already running with password set. | Med | `isDesktop()`, IPC, hash route `/wizard` | Desktop-only page. Lazy-loaded via `import()`. Wizard calls IPC to initialize daemon config before normal Admin UI flow begins. |
| **WalletConnect QR in Desktop** | Owner approval via QR scan directly in desktop app, instead of requiring Telegram Bot fallback | High | `@reown/appkit`, `isDesktop()`, lazy loading | Already designed in doc 39 section 8. `@reown/appkit` is ~200KB+ -- MUST be lazy-loaded. Only imported when `isDesktop() && route === '/walletconnect'`. WalletConnect protocol flow unchanged from v1.6.1. |
| **Sidecar Status Panel** | Visual indicator of daemon process health, memory usage, uptime, log viewer | Med | IPC `get_daemon_status`, `get_daemon_logs`, Tauri events | Desktop-only page or Dashboard widget. Uses IPC (not HTTP) because status must be available when daemon is down. Pairs with system tray 3-color icon. |
| **OS Native Notifications Bridge** | Desktop notifications for pending approvals, completed transactions, security alerts | Low | IPC `send_notification`, `isDesktop()` | Daemon emits notification events -> Tauri Rust backend -> OS Notification Center. Already designed in doc 39 section 9. Supplements (not replaces) existing Push Relay channel. |
| **System Tray Integration** | 3-color status icon (green/yellow/red), quick actions menu (open/pause/quit) | Low | Rust Backend only | Pure Rust implementation, no WebView interaction needed. Already designed in doc 39 section 5. Communicates daemon status via IPC events to WebView. |
| **Auto-Update** | Desktop app self-update via CrabNebula or GitHub Releases | Med | Tauri updater plugin, CI/CD | Already designed in doc 39 section 10. Separate from npm/Docker update flow. Requires GitHub Releases CI pipeline (partially covered by m33-02/03). |
| **Vite Build Mode Toggle** | Single Vite config produces both browser bundle (served by daemon) and desktop bundle (includes Tauri IPC imports) | Med | Vite env vars, conditional imports | `VITE_TAURI=true` env var enables desktop code paths. Tree-shaking removes Tauri imports from browser build. Prevents bundle size regression. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Separate React 18 SPA** | Duplicates all 19 pages of Admin Web UI. 3x maintenance cost vs original 8-page estimate. This is the entire reason for the architecture redesign. | Reuse existing Preact Admin Web UI in Tauri WebView. |
| **`tauri-plugin-localhost` for Asset Serving** | Plugin brings "considerable security risks" (official Tauri docs). Unnecessary because WAIaaS daemon already serves `/admin` static assets via Hono. Adding another localhost server is redundant. | WebView loads `http://localhost:{port}/admin` directly from the daemon's existing Hono server. |
| **Tauri Custom Protocol (`tauri://`)** | Would require rewriting all API calls to use Tauri's custom protocol instead of HTTP fetch. Breaks compatibility with existing `apiCall()` client that uses relative paths. | HTTP localhost pattern. WebView loads from daemon URL, all fetch calls use relative paths naturally. |
| **TauRPC / Tauri Bindgen for Type-Safe IPC** | Only 6 IPC commands needed (daemon lifecycle). Overkill for this scope. Adds Rust codegen dependency. | Manual typed wrappers: `export async function startDaemon(): Promise<DaemonStatus> { return invoke('start_daemon'); }` in a single `ipc.ts` file. |
| **Desktop-Only State Management** | Preact signals already handle all Admin UI state. Adding a separate state layer for desktop features fragments the codebase. | Extend existing `@preact/signals` pattern. Add `daemonStatus`, `sidecarPort` signals alongside `masterPassword`, `isAuthenticated`. |
| **Embedding Node.js Runtime** | Tauri's sidecar pattern already handles Node.js binary. Do not attempt to compile Node.js into the Tauri binary or use `tauri-plugin-js`. | SEA (Single Executable Application) binary as sidecar, already designed in doc 39 section 11. |
| **Multi-Window WebView** | Multiple windows add complexity (shared state sync, window lifecycle). All 19 pages + desktop extensions fit in a single WebView. | Single WebView with hash router. System tray menu opens/focuses the main window. |

## Feature Dependencies

```
Dynamic Port Allocation -> WebView URL Loading (port must be known before WebView navigates)
Dynamic Port Allocation -> API Base URL Adaptation (fetch targets the allocated port)
isDesktop() -> Conditional Sidebar Items
isDesktop() -> Setup Wizard (lazy load)
isDesktop() -> WalletConnect QR (lazy load)
isDesktop() -> Sidecar Status Panel
isDesktop() -> OS Native Notifications Bridge
IPC Bridge -> Sidecar Status Panel
IPC Bridge -> Setup Wizard (init daemon config)
IPC Bridge -> Graceful Daemon Unavailable State
Vite Build Mode Toggle -> isDesktop() (tree-shaking)
Vite Build Mode Toggle -> WalletConnect QR (lazy load exclusion from browser build)
```

## Critical Path

```
1. Dynamic Port Allocation (Rust Sidecar Manager)
   |
2. WebView localhost URL Loading (Rust WebviewBuilder)
   |
3. isDesktop() + IPC Bridge (TypeScript utilities)
   |
4. Conditional Rendering + Sidebar Extension (Preact components)
   |
5. Vite Build Mode Toggle (build config)
   |
6. Desktop-Only Features (Wizard, WalletConnect, Sidecar Panel)
```

## MVP Recommendation

**Phase 1 -- Table Stakes (design doc 39 update):**
1. WebView localhost URL loading architecture
2. Dynamic port allocation design
3. `isDesktop()` environment detection pattern
4. IPC bridge for 6 daemon lifecycle commands
5. Conditional rendering strategy (lazy import boundaries)
6. Vite build mode toggle design

**Phase 1 scope is design-only** (m33-00 is a design milestone). The above defines the architectural patterns that will be implemented in m33-02.

**Defer to m33-02 (implementation):**
- Setup Wizard (new page)
- WalletConnect QR integration (lazy load @reown/appkit)
- Sidecar Status Panel (new component)
- Auto-Update integration

**Defer indefinitely:**
- OS Native Notifications Bridge -- Push Relay (v32.9) already handles this. Desktop notifications are nice-to-have, not blocking.

## Complexity Assessment

| Feature Category | Estimated Effort | Risk |
|-----------------|-----------------|------|
| WebView + Port Allocation | Low | Low -- well-documented Tauri patterns |
| isDesktop() + Conditional Rendering | Low | Low -- single utility function + lazy import |
| IPC Bridge (6 commands) | Med | Low -- Tauri invoke is straightforward, only 6 commands |
| Vite Build Mode Toggle | Med | Med -- must verify tree-shaking removes Tauri imports from browser bundle |
| WalletConnect QR Lazy Load | High | Med -- @reown/appkit bundle size, Preact compatibility (not React) |
| Setup Wizard | Med | Low -- standard form flow, IPC for daemon init |

## Key Insight: Minimal Code Changes to Admin Web UI

The existing Admin Web UI architecture is already well-suited for Tauri embedding:

1. **Relative API paths** -- `apiCall()` uses `/v1/...` not `http://localhost:3100/v1/...`. When WebView loads from daemon URL, relative paths resolve correctly.
2. **Hash-based routing** -- `window.location.hash` router works identically in Tauri WebView and browser.
3. **No CORS issues** -- WebView origin = daemon origin (same localhost port). No cross-origin configuration needed.
4. **Signal-based state** -- `@preact/signals` works in any environment, no browser-specific dependencies.
5. **CSP compatible** -- Admin UI already uses `default-src 'none'` CSP. Tauri WebView respects CSP headers.

The primary changes are **additive** (new utility functions, new lazy-loaded pages) not **modifications** to existing code.

## Sources

- [Tauri 2 Localhost Plugin](https://v2.tauri.app/plugin/localhost/) -- security warning, port configuration
- [Tauri 2 Embedding External Binaries (Sidecar)](https://v2.tauri.app/develop/sidecar/) -- sidecar configuration, lifecycle
- [Tauri 2 Calling Rust from Frontend](https://v2.tauri.app/develop/calling-rust/) -- IPC invoke pattern, commands, events
- [Tauri Discussion #6119: Detecting Browser vs Tauri](https://github.com/tauri-apps/tauri/discussions/6119) -- `isTauri()` from `@tauri-apps/api/core`, `__TAURI_INTERNALS__`
- [Tauri Discussion #6941: Desktop Mode Detection](https://github.com/tauri-apps/tauri/discussions/6941) -- runtime detection patterns
- [Tauri 2 WebviewBuilder Docs](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html) -- WebviewUrl::External
- Design doc 39 (`internal/design/39-tauri-desktop-architecture.md`) -- existing Tauri architecture, sections 2-13
- Milestone objective `m33-00-desktop-architecture-redesign.md` -- redesign scope and rationale
