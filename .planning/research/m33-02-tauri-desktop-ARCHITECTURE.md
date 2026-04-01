# Architecture Patterns: Tauri 2 Desktop App Integration

**Domain:** Desktop App (Tauri 2 + Existing Admin Web UI)
**Researched:** 2026-03-31
**Confidence:** HIGH (official Tauri 2 docs verified)

## System Overview

Tauri 2 Desktop wraps the existing WAIaaS daemon as a sidecar process and loads Admin Web UI in a WebView. The architecture has three layers:

```
+----------------------------------------------------------------+
|                    Tauri Desktop App                             |
+----------------------------------------------------------------+
|  Rust Backend (apps/desktop/src-tauri/)                         |
|  +------------------+  +-------------+  +-------------------+  |
|  | SidecarManager   |  | SystemTray  |  | IPC Commands (7)  |  |
|  | - spawn/kill SEA |  | - 3-color   |  | - start/stop/     |  |
|  | - port parsing   |  | - ctx menu  |  |   restart_daemon  |  |
|  | - crash detect   |  | - 30s poll  |  | - get_status/logs |  |
|  | - state machine  |  |             |  | - notify/quit_app |  |
|  +--------+---------+  +------+------+  +---------+---------+  |
|           |                   |                    |            |
+-----------+-------------------+--------------------+------------+
|  WebView Layer                                                  |
|  +------------------------------------------------------------+ |
|  | http://localhost:{dynamic_port}/admin                       | |
|  |                                                             | |
|  | Admin Web UI (Preact 10.x) -- EXISTING, unmodified core    | |
|  |   + packages/admin/src/desktop/   -- NEW, conditional      | |
|  |     - SetupWizard (5 steps)                                | |
|  |     - WalletConnect QR                                     | |
|  |     - DesktopStatusCard                                    | |
|  |     - tauri-bridge.ts (invoke() wrapper)                   | |
|  +------------------------------------------------------------+ |
+----------------------------------------------------------------+
|  Sidecar Process (Node.js SEA binary)                          |
|  +------------------------------------------------------------+ |
|  | WAIaaS Daemon (OpenAPIHono)                                 | |
|  | - --port=0 -> OS assigns free port                         | |
|  | - stdout: WAIAAS_PORT={port}                               | |
|  | - {data_dir}/daemon.port (fallback)                        | |
|  +------------------------------------------------------------+ |
+----------------------------------------------------------------+
```

## Component Responsibilities

### 1. Sidecar Manager (`sidecar/manager.rs`)

Manages the Node.js SEA daemon process lifecycle. This is the most critical Rust component.

| Responsibility | Details |
|----------------|---------|
| Process spawn | `app.shell().sidecar("waiaas-daemon")` with `--port=0` arg |
| Port discovery | Parse stdout for `WAIAAS_PORT={port}` line, fallback to `{data_dir}/daemon.port` file |
| Health monitoring | Poll `GET http://localhost:{port}/health` every 5s |
| Crash detection | Listen for `CommandEvent::Terminated` on sidecar rx channel |
| Auto-restart | Respawn on unexpected termination (max 3 retries, backoff) |
| Graceful shutdown | `SIGTERM` -> 5s timeout -> `SIGKILL` |
| State machine | `Starting -> PortDiscovery -> HealthCheck -> Running -> Stopping -> Stopped` (+ `Crashed`, `Restarting`) |

**State Machine Design:**

```
          spawn()
  Stopped -------> Starting
    ^                 |
    |            stdout port line
    |                 v
    |           PortDiscovery
    |                 |
    |            port parsed
    |                 v
  Stopping <--- HealthCheck ----> Crashed
    ^            |      ^            |
    |       200 OK    timeout   retry < max
    |            v      |            v
    +------- Running   +------- Restarting
                |
           process exit
                v
             Crashed
```

**Rust pattern for sidecar spawn + stdout parsing:**

```rust
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[derive(Clone, serde::Serialize)]
pub struct SidecarStatus {
    pub state: String,      // "running" | "stopped" | "starting" | "crashed"
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub uptime_secs: Option<u64>,
    pub restart_count: u32,
}

pub async fn spawn_daemon(app: &AppHandle) -> Result<(u16, CommandChild), Error> {
    let (mut rx, child) = app.shell()
        .sidecar("waiaas-daemon")
        .unwrap()
        .args(&["--port", "0"])
        .spawn()
        .expect("failed to spawn daemon");

    let port = tokio::time::timeout(Duration::from_secs(30), async {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stdout(line_bytes) = event {
                let line = String::from_utf8_lossy(&line_bytes);
                if let Some(port_str) = line.strip_prefix("WAIAAS_PORT=") {
                    return port_str.trim().parse::<u16>().ok();
                }
            }
        }
        None
    }).await;

    match port {
        Ok(Some(p)) => Ok((p, child)),
        _ => Err(Error::PortDiscoveryTimeout),
    }
}
```

### 2. IPC Commands (`commands/mod.rs`)

Seven Tauri commands exposed to the WebView via `invoke()`.

| Command | Args | Returns | Behavior |
|---------|------|---------|----------|
| `start_daemon` | none | `SidecarStatus` | Spawn sidecar if stopped |
| `stop_daemon` | none | `SidecarStatus` | SIGTERM daemon, app stays running |
| `restart_daemon` | none | `SidecarStatus` | stop + start sequence |
| `get_sidecar_status` | none | `SidecarStatus` | Current state machine state |
| `get_daemon_logs` | `{ lines: u32 }` | `Vec<String>` | Last N log lines from ringbuffer |
| `send_notification` | `{ title, body }` | `()` | OS native notification |
| `quit_app` | none | never | stop_daemon + `app.exit(0)` |

**Rust command pattern:**

```rust
#[tauri::command]
async fn get_sidecar_status(
    state: tauri::State<'_, SidecarState>,
) -> Result<SidecarStatus, String> {
    let manager = state.lock().await;
    Ok(manager.status())
}

#[tauri::command]
async fn stop_daemon(
    state: tauri::State<'_, SidecarState>,
) -> Result<SidecarStatus, String> {
    let mut manager = state.lock().await;
    manager.stop().await.map_err(|e| e.to_string())?;
    Ok(manager.status())
}
```

### 3. System Tray (`main.rs`)

Three-color status indicator + context menu.

```rust
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState};
use tauri::menu::{Menu, MenuItem};

fn setup_tray(app: &App) -> Result<(), Box<dyn Error>> {
    let open = MenuItem::with_id(app, "open", "Open Dashboard", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause Daemon", true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume", "Resume Daemon", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &pause, &resume, &quit])?;

    TrayIconBuilder::new()
        .icon(load_icon("green"))    // initial: running
        .menu(&menu)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "quit" => { /* invoke quit_app logic */ }
                "pause" => { /* invoke stop_daemon */ }
                "resume" => { /* invoke start_daemon */ }
                "open" => { /* show/focus main window */ }
                _ => {}
            }
        })
        .build(app)?;
    Ok(())
}
```

Icon state transitions follow daemon state:
- Green: `Running` state, health OK
- Orange: `Starting`, `Restarting`, `PortDiscovery`, `HealthCheck`
- Red: `Stopped`, `Crashed`

### 4. WebView + IPC Bridge

**Critical architecture decision:** The WebView loads `http://localhost:{port}/admin` (an external URL from Tauri's perspective). This requires special capability configuration for IPC to work.

### 5. Desktop Extensions (`packages/admin/src/desktop/`)

New directory within the existing Admin Web UI package. All files are conditionally loaded via dynamic import behind `isDesktop()` guard.

| Module | Purpose |
|--------|---------|
| `utils/platform.ts` | `isDesktop()` -- checks `window.__TAURI_INTERNALS__` |
| `utils/tauri-bridge.ts` | Type-safe `invoke()` wrappers for 7 commands |
| `pages/setup-wizard.tsx` | 5-step first-run wizard |
| `components/wallet-connect.tsx` | @reown/appkit QR pairing |
| `components/desktop-status.tsx` | Sidecar status card for dashboard |
| `hooks/useDaemon.ts` | Sidecar state polling hook |
| `hooks/useWalletConnect.ts` | WC session management |

## Project Structure

```
WAIaaS/
  apps/
    desktop/
      src-tauri/
        src/
          main.rs                  # Tauri entry: setup, tray, splash->navigate
          lib.rs                   # Command registration, plugin init
          commands/
            mod.rs                 # 7 IPC commands
          sidecar/
            manager.rs             # State machine, spawn, port parsing
            health.rs              # Health check polling
        Cargo.toml                 # tauri, tauri-plugin-shell, serde, tokio
        tauri.conf.json            # sidecar config, capabilities, window
        capabilities/
          default.json             # IPC permissions + remote localhost access
        icons/
          tray-green.png
          tray-orange.png
          tray-red.png
        binaries/                  # SEA binaries (per-platform suffix)
          waiaas-daemon-{target-triple}
      splash.html                  # Loading screen while sidecar starts

  packages/
    admin/
      src/
        desktop/                   # NEW: Desktop-only extensions
          utils/
            platform.ts            # isDesktop()
            tauri-bridge.ts        # invoke() typed wrappers
          pages/
            setup-wizard.tsx       # 5-step wizard
          components/
            wallet-connect.tsx     # WC QR pairing
            desktop-status.tsx     # Sidecar status card
          hooks/
            useDaemon.ts           # IPC state hook
            useWalletConnect.ts    # WC session hook
            useOwnerApi.ts         # Owner registration
          lib/
            wallet-connect.ts      # @reown/appkit init
            updater.ts             # Tauri auto-update check
        app.tsx                    # MODIFIED: conditional desktop route
        pages/                     # EXISTING: unmodified
        components/                # EXISTING: unmodified
```

## Architectural Patterns

### Pattern 1: Splash-then-Navigate (Dynamic Port Resolution)

**What:** WebView starts on a bundled splash page, then navigates to the daemon URL once the sidecar is ready.
**Why:** `tauri.conf.json` cannot contain a dynamic port. The daemon assigns its own port at runtime via `bind(0)`.

```
tauri.conf.json:
  window.url = "tauri://localhost/splash.html"    // bundled asset

Runtime sequence:
  1. Tauri starts -> shows splash.html
  2. SidecarManager spawns daemon with --port=0
  3. Parses stdout for WAIAAS_PORT={port}
  4. Rust calls: webview_window.navigate(Url::parse(
       &format!("http://localhost:{}/admin", port)
     ))
  5. WebView loads Admin UI from daemon
```

**Configuration for IPC on external localhost URL:**

```json
// capabilities/default.json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-spawn",
    "shell:allow-execute",
    "notification:default"
  ],
  "remote": {
    "urls": ["http://localhost:*"]
  }
}
```

The `remote.urls` pattern `http://localhost:*` allows IPC `invoke()` from any localhost port. This is essential because the port is dynamic. **Confidence: HIGH** -- verified via official Tauri 2 capability docs and plugin-localhost pattern.

### Pattern 2: 4-Layer Tree-Shaking

**What:** Desktop-only code is excluded from browser Admin Web UI bundle through four independent mechanisms.
**Why:** WalletConnect library (~200KB+) and Tauri bridge code must not bloat the browser build.

```
Layer 1: Dynamic Import
  if (isDesktop()) {
    const { SetupWizard } = await import('./desktop/pages/setup-wizard');
    // Only loaded at runtime in Tauri WebView
  }

Layer 2: Optional Peer Dependencies (package.json)
  "optionalDependencies": {
    "@reown/appkit": "^x.y.z",
    "@tauri-apps/api": "^2.x"
  }
  // Not installed in daemon-only deployments

Layer 3: Build Constant (vite.config.ts)
  define: {
    __DESKTOP__: JSON.stringify(process.env.TAURI_ENV_PLATFORM !== undefined)
  }
  // Dead code elimination at build time

Layer 4: CI Verification
  // ESLint no-restricted-imports rule
  // + bundle size check in CI
  // Ensures no static import of desktop/ from non-desktop code
```

### Pattern 3: IPC Command Pattern (Type-Safe Bridge)

**What:** TypeScript wrappers over Tauri `invoke()` with full type safety.
**Why:** Raw `invoke()` is stringly typed. Wrappers prevent typos and provide autocomplete.

```typescript
// packages/admin/src/desktop/utils/tauri-bridge.ts
import { invoke } from '@tauri-apps/api/core';

export interface SidecarStatus {
  state: 'running' | 'stopped' | 'starting' | 'crashed' | 'restarting';
  pid: number | null;
  port: number | null;
  uptime_secs: number | null;
  restart_count: number;
}

export const daemon = {
  start: () => invoke<SidecarStatus>('start_daemon'),
  stop: () => invoke<SidecarStatus>('stop_daemon'),
  restart: () => invoke<SidecarStatus>('restart_daemon'),
  status: () => invoke<SidecarStatus>('get_sidecar_status'),
  logs: (lines: number) => invoke<string[]>('get_daemon_logs', { lines }),
  notify: (title: string, body: string) => invoke<void>('send_notification', { title, body }),
  quit: () => invoke<never>('quit_app'),
};
```

### Pattern 4: Sidecar State Machine with Managed State

**What:** Rust `Arc<Mutex<SidecarManager>>` managed via `tauri::State`.
**Why:** Multiple IPC commands and the tray poll need concurrent access to sidecar state.

```rust
use std::sync::Arc;
use tokio::sync::Mutex;

type SidecarState = Arc<Mutex<SidecarManager>>;

fn main() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(SidecarManager::new())))
        .invoke_handler(tauri::generate_handler![
            start_daemon, stop_daemon, restart_daemon,
            get_sidecar_status, get_daemon_logs,
            send_notification, quit_app
        ])
        .setup(|app| {
            // Auto-start daemon on app launch
            let state = app.state::<SidecarState>().clone();
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut mgr = state.lock().await;
                mgr.start(&handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
```

### Pattern 5: Conditional Desktop Route Integration

**What:** Existing Admin Web UI router adds desktop-only routes behind `isDesktop()` guard.
**Why:** Setup Wizard and desktop features need routes but must not exist in browser builds.

```typescript
// packages/admin/src/app.tsx (modified)
import { isDesktop } from './desktop/utils/platform';

function App() {
  const [desktopRoutes, setDesktopRoutes] = useState<ComponentType[]>([]);

  useEffect(() => {
    if (isDesktop()) {
      import('./desktop/pages/setup-wizard').then(m => {
        setDesktopRoutes([m.SetupWizard]);
      });
    }
  }, []);

  return (
    <Router>
      {/* Existing routes */}
      <Route path="/admin/dashboard" component={Dashboard} />
      <Route path="/admin/wallets" component={Wallets} />
      {/* ... */}

      {/* Desktop-only routes (empty array in browser) */}
      {desktopRoutes.map(Route => <Route key={Route.name} />)}
    </Router>
  );
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Static Import of Desktop Modules

**What:** `import { SetupWizard } from './desktop/pages/setup-wizard'` at top level.
**Why bad:** Bundles WalletConnect, Tauri API, and all desktop code into browser build. +200KB+ dead weight.
**Instead:** Always use `isDesktop()` guard + dynamic `import()`.

### Anti-Pattern 2: Fixed Port in tauri.conf.json

**What:** Setting `window.url` to `http://localhost:3000/admin`.
**Why bad:** Port conflicts with other instances, daemon may not be on 3000.
**Instead:** Use splash page + `navigate()` after port discovery.

### Anti-Pattern 3: Polling Sidecar Status from WebView

**What:** JavaScript `setInterval` calling `GET /health` to check daemon status.
**Why bad:** The daemon could be down, making HTTP unreachable. Circular dependency.
**Instead:** Use IPC `invoke('get_sidecar_status')` which goes through Rust, not HTTP.

### Anti-Pattern 4: iframe for IPC Preservation

**What:** Loading daemon URL in iframe to keep Tauri IPC on parent frame.
**Why bad:** CSP conflicts, double scrollbar, modal z-index issues, no SPA routing.
**Instead:** Use `remote.urls` capability to enable IPC on localhost URLs directly.

### Anti-Pattern 5: Bundling Node.js Runtime Separately

**What:** Shipping node binary + JS files instead of SEA binary.
**Why bad:** Larger bundle, JS source visible, dependency version conflicts.
**Instead:** esbuild -> single .cjs -> Node.js SEA config -> postject -> platform-suffixed binary.

## Data Flow

### Startup Sequence

```
1. User launches Desktop App
   |
2. Tauri main.rs::setup()
   |-> Load splash.html in WebView
   |-> Initialize SidecarManager (state: Stopped)
   |-> Setup system tray (icon: orange/starting)
   |
3. SidecarManager::start()
   |-> Spawn SEA binary: waiaas-daemon --port=0
   |-> State: Starting -> PortDiscovery
   |-> Listen stdout for WAIAAS_PORT={port}
   |
4. Port discovered (e.g., 54321)
   |-> State: HealthCheck
   |-> Poll GET http://localhost:54321/health
   |
5. Health OK (200)
   |-> State: Running
   |-> webview_window.navigate("http://localhost:54321/admin")
   |-> Tray icon: green
   |
6. Admin Web UI loads in WebView
   |-> isDesktop() returns true (__TAURI_INTERNALS__ exists)
   |-> Dynamic import desktop/ modules
   |-> Check if first run -> redirect to Setup Wizard if needed
```

### IPC Data Flow (WebView -> Rust -> WebView)

```
WebView (JavaScript)                    Rust Backend
  |                                       |
  | invoke('get_sidecar_status')          |
  |-------------------------------------->|
  |     ipc://localhost (custom protocol) |
  |                                       | SidecarState.lock()
  |                                       | manager.status()
  |                                       |
  |          SidecarStatus JSON           |
  |<--------------------------------------|
  |                                       |
  | Promise resolves with typed result    |
```

### Tray State Sync Flow

```
30-second polling loop (Rust):
  SidecarManager.status()
    |
    +--> state == Running && health OK  --> tray.set_icon(green)
    +--> state == Starting/Restarting   --> tray.set_icon(orange)
    +--> state == Stopped/Crashed       --> tray.set_icon(red)
    |
    +--> Update menu items enabled/disabled state
         (Pause enabled when Running, Resume enabled when Stopped)
```

## Integration Points with Existing Codebase

### 1. Admin Web UI (packages/admin/)

| Integration | Type | Details |
|-------------|------|---------|
| `app.tsx` | Modified | Add conditional desktop route loading |
| `pages/dashboard.tsx` | Modified | Render `<DesktopStatusCard>` when `isDesktop()` |
| `pages/wallet-detail.tsx` | Modified | Show WalletConnect button when `isDesktop()` |
| `vite.config.ts` | Modified | Add `__DESKTOP__` define, ESLint rule |
| `package.json` | Modified | Add `@tauri-apps/api`, `@reown/appkit` as optional deps |

### 2. Daemon (packages/daemon/)

| Integration | Type | Details |
|-------------|------|---------|
| `--port=0` support | Existing | TCP bind(0) already supported |
| `stdout WAIAAS_PORT=` | New | Print port line on startup for sidecar parsing |
| Health endpoint | Existing | `GET /health` already exists |

### 3. Build Pipeline (turbo + Vite)

| Integration | Type | Details |
|-------------|------|---------|
| `turbo.json` | Modified | Add `apps/desktop` to pipeline |
| SEA build script | New | `scripts/build-sea.ts` -- esbuild + node SEA config |
| Platform binaries | New | CI matrix builds SEA for 3 targets |

### 4. CI/CD

| Integration | Type | Details |
|-------------|------|---------|
| `desktop-release.yml` | New | `tauri-action` 3-platform build matrix |
| Existing `release.yml` | Unmodified | npm/Docker release stays independent |
| Tag scheme | New | `desktop-v*` tags (separate from npm `v*` tags) |

## Scalability Considerations

| Concern | Current Design | Future |
|---------|---------------|--------|
| Multiple daemon instances | Single sidecar per app | Could support --data-dir isolation |
| Large log buffers | Ring buffer (1000 lines) | Consider log rotation/file output |
| WebView memory | Single Preact SPA | Acceptable, same as browser |
| SEA binary size | ~50-80MB (Node.js + daemon) | Could explore Bun for smaller binary |

## Sources

- [Tauri 2 Sidecar Docs](https://v2.tauri.app/develop/sidecar/) -- HIGH confidence, official docs
- [Tauri 2 Calling Rust](https://v2.tauri.app/develop/calling-rust/) -- HIGH confidence, IPC command patterns
- [Tauri 2 System Tray](https://v2.tauri.app/learn/system-tray/) -- HIGH confidence, TrayIconBuilder API
- [Tauri 2 Node.js Sidecar](https://v2.tauri.app/learn/sidecar-nodejs/) -- HIGH confidence, SEA binary guide
- [Tauri 2 Capability Reference](https://v2.tauri.app/reference/acl/capability/) -- HIGH confidence, remote URL IPC
- [Tauri IPC Architecture (DeepWiki)](https://deepwiki.com/tauri-apps/tauri/3.1-ipc-protocol-and-invoke()-system) -- MEDIUM confidence
- [GitHub Issue #5088: __TAURI__ injection on remote URLs](https://github.com/tauri-apps/tauri/issues/5088) -- HIGH confidence, confirms IPC on localhost
- [GitHub Issue #1974: plugin-localhost + Tauri v2](https://github.com/tauri-apps/plugins-workspace/issues/1974) -- HIGH confidence, capability config pattern
- [tauri-sidecar-manager crate](https://github.com/radical-data/tauri-sidecar-manager) -- LOW confidence, community reference
- [Evil Martians: Rust + Tauri + Sidecar](https://evilmartians.com/chronicles/making-desktop-apps-with-revved-up-potential-rust-tauri-sidecar) -- MEDIUM confidence, architecture patterns
