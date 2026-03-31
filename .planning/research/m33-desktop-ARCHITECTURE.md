# Architecture Research: Desktop App Architecture Redesign (Tauri + Admin Web UI Reuse)

**Domain:** Desktop App Integration (Tauri 2 + Preact Admin UI)
**Researched:** 2026-03-31
**Confidence:** HIGH

## System Overview

### Current Architecture (Browser-Only)

```
Browser
  ├── http://localhost:{port}/admin/  (Admin Web UI - Preact 10.x SPA)
  │     └── fetch('/v1/...')  ────────→  Hono HTTP Server (daemon)
  │                                        ├── SQLite + Drizzle
  │                                        ├── Chain Adapters
  │                                        └── Keystore (sodium)
  └── CSP: default-src 'none', connect-src 'self'
```

### Proposed Architecture (Tauri Desktop)

```
┌──────────────────────────────────────────────────────────────────┐
│                     Tauri Desktop App                             │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Rust Backend (src-tauri/)                       │ │
│  │  ┌──────────────┐  ┌────────────┐  ┌────────────────────┐  │ │
│  │  │ Sidecar Mgr  │  │ System     │  │ Notification       │  │ │
│  │  │ (spawn/kill  │  │ Tray       │  │ Bridge (OS native) │  │ │
│  │  │ daemon proc) │  │ (3-color)  │  │                    │  │ │
│  │  └──────┬───────┘  └────────────┘  └────────────────────┘  │ │
│  │         │           ┌────────────┐  ┌────────────────────┐  │ │
│  │         │           │ Auto       │  │ IPC Commands       │  │ │
│  │         │           │ Updater    │  │ (6 commands)       │  │ │
│  │         │           └────────────┘  └────────┬───────────┘  │ │
│  └─────────┼────────────────────────────────────┼──────────────┘ │
│            │ spawn/kill                    invoke()               │
│  ┌─────────┼────────────────────────────────────┼──────────────┐ │
│  │         │      WebView (Admin Web UI)        │              │ │
│  │         │                                    │              │ │
│  │  ┌──────┴─────────────────────────────────┐  │              │ │
│  │  │  Existing Admin Web UI (Preact 10.x)   │  │              │ │
│  │  │  ├── 19 pages (unchanged)              │  │              │ │
│  │  │  ├── api/client.ts (fetch → daemon)    │  │              │ │
│  │  │  └── @preact/signals state             │  │              │ │
│  │  └────────────────────────────────────────┘  │              │ │
│  │  ┌────────────────────────────────────────┐  │              │ │
│  │  │  Desktop Extensions (conditional)      │◄─┘              │ │
│  │  │  ├── desktop/ipc-bridge.ts             │                 │ │
│  │  │  ├── desktop/setup-wizard.tsx           │                 │ │
│  │  │  └── desktop/sidecar-status.tsx         │                 │ │
│  │  └────────────────────────────────────────┘                 │ │
│  └─────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│                  WAIaaS Daemon (Sidecar Process)                  │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Hono HTTP Server → 127.0.0.1:{dynamic_port}                │ │
│  │  ├── /admin/* (static files → Admin Web UI)                  │ │
│  │  ├── /v1/*   (REST API)                                     │ │
│  │  └── /health (liveness check)                                │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decision: Load via HTTP, Not Custom Protocol

The WebView loads `http://127.0.0.1:{port}/admin/` rather than using Tauri's custom protocol (`tauri://`) or `tauri-plugin-localhost`. This is the critical architectural choice because:

1. **Existing API client uses relative paths.** `apiCall()` in `packages/admin/src/api/client.ts` calls `fetch(path)` with relative URLs like `/v1/admin/wallets`. When loaded from `http://127.0.0.1:{port}/admin/`, these resolve correctly to the same origin daemon API. No code changes needed.
2. **CSP `connect-src 'self'` works unchanged.** The daemon's CSP middleware already sets `connect-src 'self'` for `/admin/*` paths. Since the WebView origin matches the daemon origin, all API calls are same-origin. With custom protocol, `connect-src` would need `http://127.0.0.1:{port}` explicitly.
3. **No new plugin dependency.** `tauri-plugin-localhost` introduces security risks and port-binding complexity. Loading directly from the daemon's existing static file server reuses proven infrastructure.
4. **Hash-based routing works as-is.** The Admin UI uses `window.location.hash` for routing (e.g., `#/wallets`, `#/dashboard`). Hash routing is fully compatible with WebView URL loading from any origin.

## Component Responsibilities

| Component | Responsibility | New/Modified | Location |
|-----------|---------------|--------------|----------|
| **Sidecar Manager** | Spawn/kill daemon process, port allocation, health check | New (Rust) | `apps/desktop/src-tauri/src/sidecar.rs` |
| **System Tray** | 3-color status icon, quick actions menu | New (Rust) | `apps/desktop/src-tauri/src/tray.rs` |
| **IPC Commands** | 6 invoke handlers for native ops | New (Rust) | `apps/desktop/src-tauri/src/commands.rs` |
| **Notification Bridge** | Forward daemon events to OS notifications | New (Rust) | `apps/desktop/src-tauri/src/notifications.rs` |
| **Auto Updater** | Check/apply updates via CrabNebula/GitHub | New (Rust) | `apps/desktop/src-tauri/src/updater.rs` |
| **IPC Bridge (JS)** | `window.__TAURI__.invoke()` wrapper for WebView | New (TS) | `packages/admin/src/desktop/ipc-bridge.ts` |
| **isDesktop() util** | Environment detection via `window.__TAURI__` | New (TS) | `packages/admin/src/desktop/detect.ts` |
| **Setup Wizard** | First-run setup (master password, config) | New (TSX) | `packages/admin/src/desktop/setup-wizard.tsx` |
| **Sidecar Status** | Daemon process status indicator in UI | New (TSX) | `packages/admin/src/desktop/sidecar-status.tsx` |
| **Admin Web UI (19 pages)** | All existing admin functionality | **Unchanged** | `packages/admin/src/pages/*.tsx` |
| **API client** | `fetch()` with relative URLs + masterAuth | **Unchanged** | `packages/admin/src/api/client.ts` |
| **CSP middleware** | Content-Security-Policy for `/admin/*` | **Unchanged** (same-origin) | `packages/daemon/src/api/middleware/csp.ts` |
| **CORS config** | Cross-origin allowlist | **Modified** (Tauri origins) | `packages/daemon/src/api/server.ts` |
| **Vite config** | Build config + dev proxy | **Modified** (Tauri dev) | `packages/admin/vite.config.ts` |

## Recommended Project Structure

```
apps/desktop/
├── src-tauri/
│   ├── Cargo.toml              # Tauri 2 + deps
│   ├── tauri.conf.json         # WebView URL, capabilities, bundle config
│   ├── capabilities/
│   │   └── default.json        # IPC permissions + remote URL access
│   ├── binaries/               # SEA daemon binaries (per target triple)
│   ├── src/
│   │   ├── lib.rs              # Plugin setup, app builder
│   │   ├── commands.rs         # 6 IPC invoke handlers
│   │   ├── sidecar.rs          # Sidecar Manager (spawn, kill, health)
│   │   ├── tray.rs             # System tray (3-color icon + menu)
│   │   ├── notifications.rs   # OS native notification bridge
│   │   └── updater.rs         # Auto-update logic
│   └── icons/                  # App icons + tray icons
├── package.json                # Tauri CLI scripts
└── README.md

packages/admin/
├── src/
│   ├── desktop/                # NEW: Desktop-only extensions
│   │   ├── detect.ts           # isDesktop(), isBrowser()
│   │   ├── ipc-bridge.ts       # invoke() wrapper with type safety
│   │   ├── setup-wizard.tsx    # First-run wizard (desktop only)
│   │   └── sidecar-status.tsx  # Daemon status indicator
│   ├── pages/                  # UNCHANGED: 19 existing pages
│   ├── components/             # UNCHANGED: shared components
│   ├── api/                    # UNCHANGED: client.ts, typed-client.ts
│   ├── auth/                   # UNCHANGED: store.ts, login.tsx
│   └── app.tsx                 # MODIFIED: conditional desktop features
└── vite.config.ts              # MODIFIED: Tauri dev support
```

### Structure Rationale

- **`apps/desktop/`:** Tauri shell lives as a separate app, not a package. It contains only Rust code and configuration. No duplicate frontend.
- **`packages/admin/src/desktop/`:** Desktop-only TypeScript code lives within the admin package, guarded by `isDesktop()`. This keeps the admin package as the single UI codebase while allowing desktop extensions. Dynamic imports ensure these modules are tree-shaken in browser builds.
- **No `apps/desktop/src/pages/`:** This is the entire point of the redesign. The 8 React pages from design doc 39 are eliminated. All UI comes from `packages/admin/`.

## Architectural Patterns

### Pattern 1: Environment Detection Guard

**What:** `isDesktop()` checks `window.__TAURI__` to conditionally render desktop-only UI and load desktop-only modules.
**When to use:** Any component that should behave differently in Tauri WebView vs browser.
**Trade-offs:** Simple and reliable. `window.__TAURI__` is injected by Tauri runtime and unavailable in browsers. No build-time flag needed.

```typescript
// packages/admin/src/desktop/detect.ts
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export function isBrowser(): boolean {
  return !isDesktop();
}
```

### Pattern 2: Conditional Dynamic Import

**What:** Desktop-only modules loaded via `import()` only when `isDesktop()` is true. Vite tree-shakes these out of the browser bundle.
**When to use:** Loading desktop-specific components (Setup Wizard, Sidecar Status, IPC Bridge).
**Trade-offs:** Adds async loading boundary. Use signal-based loading state for consistent Preact patterns.

```typescript
// packages/admin/src/app.tsx (modified)
import { isDesktop } from './desktop/detect';

function App() {
  if (daemonShutdown.value) return <ShutdownOverlay />;

  // Desktop: show setup wizard on first run
  if (isDesktop() && needsSetup.value) {
    return <DesktopSetupWizard />;
  }

  if (!isAuthenticated.value) return <Login />;

  return (
    <>
      <Layout />
      {isDesktop() && <SidecarStatusBar />}
      <ToastContainer />
    </>
  );
}
```

### Pattern 3: IPC Bridge with Type-Safe Wrapper

**What:** Typed wrapper around `window.__TAURI__.invoke()` that provides compile-time safety and graceful fallback in browser context.
**When to use:** All WebView-to-Rust communication (daemon lifecycle, OS notifications).
**Trade-offs:** Requires maintaining type definitions matching Rust command signatures. `@tauri-apps/api` is a devDependency of `packages/admin/` -- guarded at runtime, never imported in browser bundle due to dynamic import.

```typescript
// packages/admin/src/desktop/ipc-bridge.ts
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './detect';

interface DaemonStatus {
  running: boolean;
  pid: number | null;
  port: number | null;
  uptime_secs: number | null;
}

export async function getDaemonStatus(): Promise<DaemonStatus | null> {
  if (!isDesktop()) return null;
  return invoke<DaemonStatus>('get_daemon_status');
}

export async function startDaemon(): Promise<DaemonStatus | null> {
  if (!isDesktop()) return null;
  return invoke<DaemonStatus>('start_daemon');
}

export async function stopDaemon(): Promise<void> {
  if (!isDesktop()) return;
  await invoke('stop_daemon');
}

export async function sendOsNotification(title: string, body: string): Promise<void> {
  if (!isDesktop()) return;
  await invoke('send_notification', { title, body });
}
```

### Pattern 4: Sidecar Dynamic Port Allocation

**What:** Sidecar Manager finds an available port at startup, passes it to the daemon process as an argument, and configures the WebView URL accordingly.
**When to use:** Desktop mode to avoid port conflicts with other services.
**Trade-offs:** Port is dynamic per launch; WebView URL must be set after port discovery. Health check must use the allocated port.

```rust
// Pseudocode for sidecar.rs
fn allocate_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap().port()
}

fn start_daemon(port: u16) -> Child {
    Command::new(sidecar_path())
        .args(&["--port", &port.to_string()])
        .spawn()
        .expect("Failed to start daemon sidecar")
}
```

## Data Flow

### Browser Mode (Unchanged)

```
User → Admin UI (Preact)
         │
         └── fetch('/v1/admin/wallets')  (same-origin, relative URL)
                │
                └── Hono Server → SQLite → Response
```

### Desktop Mode

```
User → Admin UI in WebView
         │
         ├── fetch('/v1/admin/wallets')  (same-origin to daemon, relative URL)
         │     └── Hono Server → SQLite → Response
         │
         └── invoke('get_daemon_status') (Tauri IPC → Rust Backend)
               └── Sidecar Manager → Process status → Response
```

### Startup Flow (Desktop)

```
1. Tauri app launches
2. Sidecar Manager allocates dynamic port (e.g., 51234)
3. Sidecar Manager spawns daemon binary: waiaas-daemon --port 51234
4. Sidecar Manager polls GET http://127.0.0.1:51234/health (5s intervals)
5. Once healthy, WebView navigates to http://127.0.0.1:51234/admin/
6. Admin UI renders login page (masterAuth)
7. (If first run) Setup Wizard overlays via isDesktop() guard
```

### Key Data Flows

1. **API calls (unchanged):** `apiCall()` uses relative paths (`/v1/...`). Since the WebView loads from the daemon's HTTP server, all API calls are same-origin. No proxy, no CORS, no code changes.
2. **IPC calls (new):** Desktop-only features use `invoke()` through the IPC bridge. These are exclusively for native operations: daemon lifecycle, OS notifications, auto-update triggers.
3. **State management (unchanged):** `@preact/signals` manages all UI state. Desktop extensions add new signals (e.g., `sidecarStatus`) but do not modify existing ones.

## CSP Analysis

### Current CSP (Browser) -- Daemon Middleware

```
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
connect-src 'self';
img-src 'self' data: https://ipfs.io https://cloudflare-ipfs.com https://w3s.link https://nftstorage.link https://arweave.net;
font-src 'self';
base-uri 'self';
form-action 'self'
```

### Required CSP Modifications

**None for the daemon-side CSP.** Because the WebView loads from `http://127.0.0.1:{port}/admin/`, the origin is the daemon itself. `'self'` already covers all API calls and static assets. The existing CSP works without modification.

However, Tauri's own CSP configuration in `tauri.conf.json` must be set to avoid conflicts:

```json
{
  "app": {
    "security": {
      "csp": null
    }
  }
}
```

Setting `csp` to `null` in Tauri config disables Tauri's CSP injection because:
- The daemon already injects its own CSP via `cspMiddleware`
- Tauri's CSP only applies to custom protocol (`tauri://`) or bundled assets
- Since we load from `http://localhost`, Tauri's CSP layer is bypassed anyway
- IPC communication uses `postMessage` fallback when custom protocol CSP conflicts

### CORS Adjustments

**CORS is not needed for same-origin requests.** Since the WebView loads from the daemon's HTTP server (same origin), no CORS headers are required for API calls. However, Tauri WebView on Windows may use platform-specific origins (`http://tauri.localhost`) for certain internal requests. Add Tauri-specific origins to the daemon's CORS allowlist as a safety measure:

```typescript
// Additional CORS origins for desktop mode
const TAURI_ORIGINS = [
  'tauri://localhost',           // macOS, Linux (WKWebView, WebKitGTK)
  'http://tauri.localhost',      // Windows (WebView2)
  'https://tauri.localhost',     // Windows (WebView2 HTTPS mode)
];
```

This is already documented in design doc 39 section 3.4. The daemon's dynamic CORS origin list via `security.cors_origins` setting can be updated at runtime via Admin Settings to include these origins.

## Tauri Capability Configuration

Remote domain IPC access must be explicitly granted for `http://127.0.0.1:*`:

```json
{
  "identifier": "default",
  "description": "Default capability for WAIaaS Desktop",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-execute",
    "notification:default",
    "updater:default"
  ],
  "remote": {
    "urls": ["http://127.0.0.1:*/*"]
  }
}
```

The `remote.urls` pattern allows IPC access from any `127.0.0.1` port, accommodating dynamic port allocation. This is safe because only local processes can bind to `127.0.0.1`.

## Vite Configuration for Tauri Development

### Development Workflow

```
Terminal 1: pnpm --filter @waiaas/daemon dev    (daemon on port 3100)
Terminal 2: pnpm --filter @waiaas/admin dev     (Vite dev server on port 5173)
Terminal 3: cd apps/desktop && cargo tauri dev   (Tauri shell)
```

During development, the Tauri WebView points to the Vite dev server for HMR:

```json
{
  "build": {
    "devUrl": "http://localhost:5173/admin/",
    "frontendDist": "../../packages/admin/dist"
  }
}
```

The existing Vite proxy config already forwards `/v1` to the daemon:

```typescript
// packages/admin/vite.config.ts (existing, no change needed)
server: {
  proxy: {
    '/v1': {
      target: 'http://127.0.0.1:3100',
      changeOrigin: true,
    },
  },
}
```

### Production Build

In production, Tauri does not bundle the frontend separately. The daemon's sidecar binary already includes the Admin UI static files in `public/admin/`. The WebView loads from the daemon's HTTP server.

`frontendDist` serves as a fallback for the splash/loading screen displayed while the daemon starts up. For normal operation, the WebView URL is set programmatically to the daemon's HTTP server after health check passes.

## Conditional Rendering Strategy

### Desktop-Only Components

| Component | Trigger | How Loaded |
|-----------|---------|------------|
| Setup Wizard | `isDesktop() && !hasConfig()` | Dynamic import on app init |
| Sidecar Status Bar | `isDesktop()` always | Dynamic import in Layout |
| OS Notification Preferences | `isDesktop()` in Settings page | Conditional section render |
| Auto-Update Banner | `isDesktop() && updateAvailable` | Dynamic import in header |
| Quit/Restart buttons | `isDesktop()` in System page | Conditional render |

### Desktop-Aware Sidebar Extension

The existing `NAV_SECTIONS` array in `layout.tsx` can be extended conditionally:

```typescript
// In layout.tsx
import { isDesktop } from '../desktop/detect';

const desktopSystemItems: NavItem[] = isDesktop()
  ? [{ path: '/desktop-status', label: 'Desktop' }]
  : [];

// Extend System section at runtime
```

### What NOT to Change

- **Login flow:** masterAuth via `X-Master-Password` header works identically in browser and WebView.
- **Hash routing:** `window.location.hash` routing works unchanged in WebView.
- **API client:** `apiCall()` with relative paths works same-origin in both contexts.
- **Signal state:** All `@preact/signals` state management is context-agnostic.
- **All 19 existing pages:** No modifications needed.
- **WalletConnect:** Already API-mediated (server-side pairing via QR code). No `@reown/appkit` in frontend. Works identically in WebView.

## Anti-Patterns

### Anti-Pattern 1: Dual Frontend Codebase

**What people do:** Build a separate React/Svelte frontend for Tauri and maintain both alongside the Admin Web UI.
**Why it's wrong:** 2x maintenance cost, feature drift, inconsistent UX. The original doc 39 design had this problem with 8 React pages duplicating Admin UI functionality.
**Do this instead:** Load the existing Admin Web UI in the WebView. Extend with conditional desktop-only components. Single codebase, single truth.

### Anti-Pattern 2: Proxying All API Calls Through IPC

**What people do:** Route all API calls through `invoke()` so Rust handles HTTP requests.
**Why it's wrong:** Unnecessary Rust-side HTTP client implementation, breaks `@waiaas/sdk` compatibility, adds latency, duplicates auth logic.
**Do this instead:** Use HTTP localhost for API calls (existing `apiCall()`), IPC only for native operations (daemon lifecycle, OS features).

### Anti-Pattern 3: Using tauri-plugin-localhost

**What people do:** Use the localhost plugin to serve bundled assets on a local port.
**Why it's wrong:** The daemon already serves Admin UI on its HTTP server. Adding another localhost server creates port conflicts, security risks, and redundant serving.
**Do this instead:** WebView loads directly from the daemon's existing `/admin/` static file server.

### Anti-Pattern 4: Build-Time Environment Flags

**What people do:** Use `process.env.TAURI` or Vite define to conditionally compile desktop features.
**Why it's wrong:** Creates two different builds of the admin package. The browser build and Tauri build diverge, making testing harder.
**Do this instead:** Runtime detection with `window.__TAURI__` + dynamic imports. Single build output works in both contexts.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| WalletConnect Relay | WebSocket from daemon (server-side) | Already API-mediated in admin UI. No `@reown/appkit` in frontend. No change needed. |
| CrabNebula/GitHub Releases | Rust updater plugin | New, desktop-only. `tauri-plugin-updater`. |
| OS Notification Center | Rust notification plugin | New, desktop-only. `tauri-plugin-notification`. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| WebView <-> Daemon | HTTP fetch (same-origin) | Existing `apiCall()`, unchanged |
| WebView <-> Rust Backend | Tauri IPC `invoke()` | New, desktop-only, 6 commands |
| Rust Backend <-> Daemon Process | Process spawn/kill + HTTP health | New, sidecar management |
| Layout <-> Desktop Extensions | `isDesktop()` guard + dynamic import | New, conditional rendering |

## Suggested Build Order

### Phase 1: Tauri Shell Scaffold + Sidecar Manager

Create `apps/desktop/` with Rust backend. Implement sidecar manager (spawn, kill, health check, dynamic port). System tray with 3-color status. WebView points to daemon's HTTP server. No Admin UI code changes.

**Deliverables:** Working Tauri app that starts daemon and loads Admin UI in WebView.
**Risk:** Low. Independent of frontend code.

### Phase 2: Desktop Environment Detection + IPC Bridge

Add `packages/admin/src/desktop/` directory. Implement `detect.ts` (isDesktop), `ipc-bridge.ts` (typed invoke wrapper). Verify all 19 existing pages render unchanged in WebView.

**Deliverables:** `isDesktop()` utility, IPC bridge, zero regression on existing pages.
**Risk:** Low. Additive only, no existing code modified.

### Phase 3: CORS/Capability Configuration

Add Tauri origins to CORS allowlist. Configure Tauri capabilities (`remote.urls` for localhost). Test IPC invoke from WebView loaded via HTTP. Verify CSP compatibility (daemon CSP sufficient, Tauri CSP disabled).

**Deliverables:** IPC commands work from HTTP-loaded WebView. Cross-platform origin verification.
**Risk:** Medium. Platform-specific WebView behavior differences (macOS vs Windows vs Linux).

### Phase 4: Desktop-Only UI Extensions

Implement Setup Wizard, Sidecar Status Bar, OS notification preferences, auto-update banner, quit/restart buttons. All behind `isDesktop()` guard + dynamic imports.

**Deliverables:** Desktop-enhanced UI that degrades gracefully to browser mode.
**Risk:** Low. All additive, guarded by runtime detection.

### Phase 5: Build Pipeline + Distribution

SEA binary bundling for daemon sidecar, Tauri cross-platform builds (macOS/Windows/Linux), CI/CD pipeline. Auto-update configuration.

**Deliverables:** Distributable desktop app installers for 3 platforms.
**Risk:** Medium. Native addon bundling (sodium-native, better-sqlite3, argon2) per platform.

### Build Dependencies

```
Phase 1 (Tauri Shell) ─→ Phase 2 (Detection) ─→ Phase 3 (CORS/Capability)
                                                         │
                                                         ↓
                              Phase 4 (Desktop UI) ─→ Phase 5 (Build Pipeline)
```

Phase 1 is independent of Admin UI changes. Phases 2-4 modify `packages/admin/` but preserve all existing behavior. Phase 5 depends on all prior phases.

## Sources

- [Tauri 2 CSP Documentation](https://v2.tauri.app/security/csp/)
- [Tauri 2 Capability Configuration](https://v2.tauri.app/reference/acl/capability/)
- [Tauri 2 localhost Plugin](https://v2.tauri.app/plugin/localhost/)
- [Tauri 2 Vite Integration](https://v2.tauri.app/start/frontend/vite/)
- [Tauri 2 Security Model](https://v2.tauri.app/security/)
- [Tauri 2 Capabilities](https://v2.tauri.app/security/capabilities/)
- [Tauri IPC Protocol Implementation](https://deepwiki.com/tauri-apps/tauri/3.1-ipc-protocol-and-invoke()-system)
- Design doc 39: `internal/design/39-tauri-desktop-architecture.md`
- Milestone objective: `internal/objectives/m33-00-desktop-architecture-redesign.md`
- Current Admin UI: `packages/admin/src/` (19 pages, Preact 10.x, hash routing)
- Current CSP: `packages/daemon/src/api/middleware/csp.ts`
- Current API client: `packages/admin/src/api/client.ts`
- Current static serving: `packages/daemon/src/api/server.ts` (lines 1086-1105)

---
*Architecture research for: Desktop App Redesign (Tauri 2 + Admin Web UI Reuse)*
*Researched: 2026-03-31*
