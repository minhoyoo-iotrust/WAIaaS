# Pitfalls Research

**Domain:** Tauri Desktop Shell wrapping existing Preact/Vite Admin Web UI
**Researched:** 2026-03-31
**Confidence:** HIGH (Tauri v2 official docs verified + project CSP code inspected)

## Critical Pitfalls

### Pitfall 1: CSP `connect-src` Blocks Tauri IPC

**What goes wrong:**
Tauri IPC uses `ipc:` and `http://ipc.localhost` protocols for frontend-to-Rust communication via `window.__TAURI__.invoke()`. The current WAIaaS daemon CSP middleware (`packages/daemon/src/api/middleware/csp.ts`) sets `connect-src 'self'` which only allows HTTP requests to the daemon's own origin. When Admin Web UI runs inside Tauri WebView, any `invoke()` call fails silently or throws "Refused to connect to 'http://ipc.localhost/...' because it violates the document's Content Security Policy." The app appears to load but all Desktop-specific features (sidecar status, app quit, WalletConnect deep links) are dead.

**Why it happens:**
The CSP was designed for browser-only Admin UI where `connect-src 'self'` is correct -- all API calls go to the same-origin daemon. Nobody anticipated a second protocol (`ipc:`) being needed. Tauri auto-injects CSP nonces for bundled assets but does NOT auto-modify `connect-src` when the CSP comes from an HTTP response header (as opposed to `tauri.conf.json`).

**How to avoid:**
Make CSP conditional on the runtime environment:
- Browser mode: keep current strict `connect-src 'self'`
- Desktop mode: add `ipc: http://ipc.localhost` to `connect-src`

Implementation: Either (a) the daemon detects a Tauri-specific request header and appends IPC origins, or (b) Tauri's `tauri.conf.json` overrides CSP for the WebView window (preferred -- Tauri merges its own nonces at compile time). The safest approach is to define CSP in `tauri.conf.json` for the desktop build and keep the HTTP header CSP for browser-only serving.

**Warning signs:**
- `invoke()` calls return `undefined` or throw without useful error in WebView console
- Desktop-exclusive UI elements render but clicking them does nothing
- Works in `tauri dev` (which may bypass CSP) but breaks in production build

**Phase to address:**
Phase 1 (IPC Bridge + CSP Design) -- must be resolved before any Tauri command implementation.

---

### Pitfall 2: Port Collision Between Embedded Daemon and Vite Dev Server

**What goes wrong:**
In development, three processes compete for localhost ports: (1) the WAIaaS daemon (default port from config.toml), (2) Vite HMR dev server (typically :5173), and (3) Tauri's internal dev server proxy. In production, the sidecar daemon and Tauri WebView URL both need a known port. If the daemon's configured port is already occupied (e.g., user runs a standalone daemon alongside desktop app), the sidecar crashes silently or the WebView loads a stale/wrong server.

**Why it happens:**
The daemon reads port from config.toml as a fixed value. There is no port negotiation protocol between Tauri shell and sidecar daemon. Developers test with the daemon already running standalone and forget the desktop app will also spawn one.

**How to avoid:**
1. Sidecar Manager in Rust backend must bind an ephemeral port (port 0), have the daemon report its actual port via stdout or a temp file, then pass that port to the WebView URL.
2. For dev workflow: configure Vite proxy in `vite.config.ts` to forward `/v1/*` to the daemon's port, and set Tauri's `devUrl` to Vite's address. Document the 3-process startup order.
3. Add a startup health check: Tauri Rust waits for `GET /v1/health` to return 200 before loading the WebView URL.

**Warning signs:**
- "Address already in use" errors in sidecar stderr
- WebView shows connection refused or loads wrong content
- Works on fresh machine, fails when daemon is already running

**Phase to address:**
Phase 1 (Sidecar Manager Design) -- port allocation protocol must be specified before implementation.

---

### Pitfall 3: Desktop-Only Dependencies Bloat Browser Bundle

**What goes wrong:**
Desktop-specific imports (`@tauri-apps/api`, `@reown/appkit` for WalletConnect, Tauri plugin APIs) get tree-shaken incorrectly or bundled into the browser build of Admin Web UI. `@reown/appkit` alone is ~500KB+ minified. The browser-served Admin UI at `http://localhost:{port}/admin` ships megabytes of dead code that also breaks in non-Tauri contexts (referencing `window.__TAURI__` at import time).

**Why it happens:**
Vite's tree-shaking operates at ES module level. If a shared component imports a desktop module at the top level (even behind an `if (isDesktop())` guard), the bundler includes the entire dependency. Conditional `import()` is the only reliable boundary, but developers forget and use static imports for convenience.

**How to avoid:**
1. Enforce a strict module boundary: `packages/admin/src/desktop/` directory that is NEVER statically imported from `packages/admin/src/` main code.
2. All desktop imports use `const mod = await import('./desktop/foo')` behind `isDesktop()` checks.
3. Vite build config: create two build targets or use `define` to dead-code-eliminate desktop paths in browser builds (`__DESKTOP__: false`).
4. CI check: bundle analysis step that fails if browser build contains `@tauri-apps` or `@reown/appkit` strings.

**Warning signs:**
- Browser Admin UI bundle size jumps from ~200KB to 700KB+
- Console errors about `window.__TAURI__` being undefined in browser
- `npm run build` succeeds but browser users download unnecessary code

**Phase to address:**
Phase 1 (Bundle Optimization Strategy Design) -- must define import boundaries before any desktop code is written.

---

### Pitfall 4: WebView Rendering Differences Across Platforms

**What goes wrong:**
Tauri uses three different rendering engines: WKWebView (macOS), WebView2/Chromium (Windows), WebKitGTK (Linux). CSS that works on macOS breaks on Linux (WebKitGTK lags behind on CSS features, has different font rendering). The Admin Web UI was developed and tested exclusively in Chrome/Firefox browsers. Moving to system WebViews exposes rendering bugs: CSS Grid gaps render differently, `backdrop-filter` unsupported on older WebKitGTK, scrollbar styling varies, custom properties inheritance differs.

**Why it happens:**
Browser development normalizes rendering through consistent Chromium/Firefox engines. System WebViews are version-locked to the OS -- users on Ubuntu 22.04 get WebKitGTK 2.38 (2022 vintage) which lacks features available in Safari 17+. Windows WebView2 auto-updates but Linux WebKitGTK does not. The Admin UI's Preact components were never tested against WebKit engine variants.

**How to avoid:**
1. Establish minimum WebView version requirements: macOS 13+ (Safari 16.4+), Windows 10+ (WebView2 auto-updates), Linux WebKitGTK 2.42+.
2. Audit Admin UI CSS for WebKit-incompatible features: check `backdrop-filter`, `container queries`, `:has()` selector, `color-mix()`.
3. Add a WebKitGTK CI test step (or at minimum, manual testing matrix).
4. Use CSS feature queries (`@supports`) for progressive enhancement rather than assuming feature availability.
5. Set explicit `-webkit-` prefixes where needed (Vite's Autoprefixer handles most but not WebKitGTK-specific quirks).

**Warning signs:**
- Layout breaks reported only on Linux
- Fonts render at wrong sizes on one platform
- CSS animations stutter on WebKitGTK but smooth on macOS/Windows
- "Works in browser, broken in desktop" reports

**Phase to address:**
Phase 2 (Cross-Platform Testing) -- test on all three platforms before first beta release.

---

### Pitfall 5: Node.js SEA Sidecar Binary Size and Startup Delay

**What goes wrong:**
Node.js Single Executable Application (SEA) embeds the entire Node.js runtime (~100MB for a 10MB JS bundle). The WAIaaS daemon with all dependencies (better-sqlite3 native addon, sodium-native, viem, @solana/kit) will produce a sidecar binary of 150-250MB per platform. Startup time increases to 3-8 seconds as the SEA unpacks and initializes. Users perceive the desktop app as slow compared to the instant-loading WebView shell.

**Why it happens:**
SEA bundles the full Node.js runtime regardless of which Node APIs are used. Native addons (better-sqlite3, sodium-native) require platform-specific compilation and cannot share binaries across architectures. The WAIaaS daemon's dependency tree is substantial (~327K LOC TS, 13 packages).

**How to avoid:**
1. Accept the size trade-off but optimize startup UX: show a native splash screen from Tauri Rust while sidecar initializes, with progress indicators from sidecar stdout.
2. Evaluate `pkg` (Vercel) or `bun build --compile` as alternatives to Node.js SEA -- they may produce smaller binaries.
3. Lazy-load non-essential daemon services: DeFi providers, incoming TX monitors, action providers can initialize after the core HTTP server responds to health checks.
4. Pre-build platform-specific binaries in CI (x86_64 + aarch64 for macOS, x86_64 for Windows/Linux = 5 targets minimum).
5. Use Tauri's resource system to ship the JS bundle separately from the Node runtime, allowing delta updates.

**Warning signs:**
- Desktop app takes 5+ seconds from click to usable UI
- Download size exceeds 200MB per platform
- CI build times balloon to 30+ minutes for cross-platform compilation

**Phase to address:**
Phase 2 (Sidecar Packaging Implementation) -- prototype binary size and startup time early, before committing to a specific bundling strategy.

---

### Pitfall 6: Tauri IPC Command Over-Exposure

**What goes wrong:**
Developers expose all Tauri commands to the WebView without proper capability scoping. Since the Admin Web UI is loaded from `http://localhost:{port}`, any JavaScript running in that context (including potential XSS payloads) can invoke Tauri commands like file system access, shell execution, or sidecar management. The Tauri v2 capability system requires explicit opt-in, but developers often grant blanket `core:default` permissions during development and forget to restrict them for production.

**Why it happens:**
Tauri v2's capability system is more complex than v1's simple allowlist. Capabilities are defined in JSON files under `src-tauri/capabilities/` and must be explicitly scoped to specific windows. During development, it's tempting to use `"permissions": ["core:default", "shell:default"]` which grants broad access. The Admin Web UI already handles authentication (masterAuth) but Tauri IPC bypasses HTTP authentication entirely.

**How to avoid:**
1. Define minimal capabilities: only `sidecar:status`, `sidecar:restart`, `app:quit`, `notification:show`, `updater:check`, `updater:install`. No file system, no shell, no unrestricted process commands.
2. Use Tauri's isolation pattern: load IPC bridge through a separate isolation origin that validates all messages before forwarding to Rust.
3. Never expose raw `shell:execute` -- wrap every native operation in a typed Rust command with input validation.
4. Capability audit in CI: parse `capabilities/*.json` and fail if any `*:default` permission is present.

**Warning signs:**
- `capabilities/default.json` contains `"permissions": ["core:default"]`
- WebView can access local filesystem via Tauri APIs
- No per-window capability scoping (all windows share same permissions)

**Phase to address:**
Phase 1 (IPC Security Design) -- capability definitions must be finalized before implementing any Tauri commands.

---

### Pitfall 7: Vite HMR + Tauri Dev Server Startup Race

**What goes wrong:**
`tauri dev` starts the Rust backend which immediately opens the WebView pointing to the Vite dev server URL. If Vite hasn't finished starting (especially on first run with cold cache), the WebView loads a connection-refused page. Reloading sometimes works, sometimes doesn't. Additionally, Vite's file watcher includes `src-tauri/target/` by default, causing 45-second startup delays and spurious reloads when Rust recompiles.

**Why it happens:**
Tauri's `beforeDevCommand` runs Vite but doesn't wait for the server to be ready before opening the WebView. Vite's default watcher configuration watches all files in the project root, including `src-tauri/target/` which contains thousands of Rust build artifacts.

**How to avoid:**
1. Configure Vite to exclude `src-tauri/` from file watching:
   ```typescript
   server: { watch: { ignored: ['**/src-tauri/**'] } }
   ```
2. Use Tauri's `waitForPort` configuration (available in `tauri.conf.json` devUrl settings) to delay WebView load until Vite responds.
3. Keep Tauri Rust rebuild and Vite HMR as separate concerns: frontend changes hot-reload without Rust rebuild, Rust changes rebuild only the Tauri shell.
4. Document the dev workflow: `pnpm dev:admin` (Vite only, browser testing) vs `pnpm dev:desktop` (Tauri + Vite, full desktop testing).

**Warning signs:**
- "Connection refused" on first `tauri dev` launch
- Dev startup takes 30+ seconds
- WebView reloads unexpectedly during Rust compilation
- Port conflict errors on second `tauri dev` invocation (stale Vite process)

**Phase to address:**
Phase 1 (Development Workflow Design) -- establish dev scripts and Vite config before implementation begins.

---

### Pitfall 8: Auto-Update Signing Key Mismanagement

**What goes wrong:**
Tauri's updater requires Ed25519 signature verification that cannot be disabled. The public key is embedded in the binary at compile time. If the private key is lost, no further updates can be delivered to existing installations -- users must manually download and reinstall. If the key is committed to the repository, anyone can sign malicious updates.

**Why it happens:**
The signing key is generated once during initial Tauri setup (`tauri signer generate`) and developers store it inconsistently. Unlike code signing certificates (which have institutional recovery), Tauri's updater key is a standalone Ed25519 keypair with no recovery mechanism. The release-please + GitHub Actions pipeline (already used by WAIaaS) needs the private key as a GitHub secret, but there's no documented backup/rotation procedure.

**How to avoid:**
1. Generate the signing key offline, store the private key in a hardware security module or encrypted vault (not just GitHub Secrets).
2. Back up the private key to at least two physically separate locations.
3. Document key rotation procedure: ship an update signed with the old key that includes the new public key, then switch to the new key.
4. Integrate signing into the existing release-please pipeline: `TAURI_SIGNING_PRIVATE_KEY` GitHub secret, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` for encrypted keys.
5. Test the full update cycle (check -> download -> verify -> install -> restart) in CI, not just the build step.

**Warning signs:**
- Signing key exists only in one developer's machine
- `TAURI_SIGNING_PRIVATE_KEY` secret is set but nobody knows the password
- Update tests only verify "build succeeds" not "signature validates"

**Phase to address:**
Phase 3 (Auto-Update Implementation) -- key generation and backup must happen before first public release.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single Vite build for both browser and desktop | Simpler build config | Desktop deps leak into browser bundle, larger downloads | Never -- use build-time flags from day one |
| `core:default` Tauri capabilities | Fast prototyping | Over-exposed IPC surface, security audit failure | Development only, must be replaced before any beta |
| Hardcoded daemon port in WebView URL | Avoids port negotiation complexity | Port collision when user runs standalone daemon alongside desktop | Never -- use dynamic port from sidecar startup |
| Skip Linux WebKitGTK testing | Faster release cycle | Linux users report layout bugs, lose trust | Only if Linux is explicitly unsupported in v1 |
| Embed Node.js runtime without lazy init | Simpler sidecar packaging | 5+ second startup, 200MB+ binary | MVP only -- optimize before public release |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Tauri IPC + existing HTTP API | Duplicating API calls through IPC when HTTP works fine | Use IPC only for native-only operations (tray, quit, sidecar). Keep all wallet/tx/policy calls through HTTP API client as-is |
| WalletConnect (@reown/appkit) in WebView | Static import in shared component -- bloats browser build | Dynamic import behind `isDesktop()` check, separate chunk |
| Tauri auto-updater + release-please | Two separate release pipelines that drift | Single GitHub Actions workflow: release-please triggers Tauri build + sign + publish to GitHub Releases |
| Sidecar SQLite + Tauri app data | Sidecar writes to CWD which varies by launch method | Use Tauri's `appDataDir` resolved in Rust, passed to sidecar via CLI argument |
| Admin UI masterAuth + Desktop context | Desktop users re-enter master password on every app restart | Cache auth token in Tauri's secure store (platform keychain), auto-login on app launch |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| WebView reloads full page on sidecar restart | 3-5 second blank screen when daemon restarts | Use reconnection logic in API client with retry + loading overlay instead of full reload | Every daemon restart |
| Polling sidecar health on interval | CPU usage 5-10% idle from 1-second health checks | Use Tauri event system: Rust side sends `sidecar-status-changed` event, frontend subscribes | Immediately on launch |
| Loading all DeFi position providers at sidecar startup | Desktop app takes 10+ seconds to become responsive | Lazy-load DeFi providers after core HTTP + auth services are ready | With current 13-provider stack |
| Bundling all Admin UI routes eagerly in desktop | 2MB+ initial JS load, slow first paint | Route-based code splitting (already in Vite, verify it works in WebView context) | At current 19-page scale |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Serving Admin UI on 0.0.0.0 in desktop mode | Any device on the network can access the wallet daemon | Sidecar must bind to 127.0.0.1 only when launched by desktop app. Tauri Rust should verify this |
| IPC bridge passes raw user input to shell commands | Command injection via crafted wallet names or transaction memos | Typed Rust commands with Serde deserialization, never `Command::new("sh").arg(user_input)` |
| Storing master password in Tauri's secure store | Keychain compromise gives full daemon access | Store only the session token (time-limited), not the master password. Re-authenticate for sensitive operations |
| Auto-updater without rollback mechanism | Failed update leaves app in broken state | Tauri supports version comparison override for rollback. Ship rollback metadata in update manifest |
| WebView loads external URLs (WalletConnect redirect) | Phishing via malicious dApp redirect URLs | Validate all navigation URLs against allowlist. Use Tauri's `on_navigation` handler to block unexpected URLs |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No splash screen during sidecar startup | User clicks app icon, nothing happens for 5-8 seconds, clicks again | Tauri native splash window with progress indicator, dismiss when health check passes |
| System tray icon without tooltip/status | User cannot tell if daemon is running, syncing, or errored | Tray icon changes color/badge based on daemon state (green=healthy, yellow=syncing, red=error) |
| Desktop "Setup Wizard" duplicates browser onboarding | User who already set up via CLI/browser is forced through wizard again | Detect existing config (config.toml + DB exists) and skip wizard, show dashboard directly |
| Closing window kills the daemon | User loses in-progress transactions, incoming TX monitoring stops | Minimize to tray on close (with first-time notification), explicit "Quit" in tray menu kills daemon |
| Auto-update interrupts active operations | Transaction in DELAY state gets lost during update | Check for pending transactions before applying update, warn user, defer update if needed |

## "Looks Done But Isn't" Checklist

- [ ] **CSP policy:** Works in `tauri dev` but IPC blocked in production build -- verify with `tauri build` + install
- [ ] **Sidecar lifecycle:** App launches sidecar but doesn't handle sidecar crash -- verify crash recovery restarts sidecar automatically
- [ ] **Port allocation:** Works on dev machine but port 3727 is taken on user's machine -- verify ephemeral port allocation + health check
- [ ] **Auto-update:** Build signs correctly but signature validation fails on different platform -- verify update cycle on all 3 OS
- [ ] **Linux rendering:** App "works" but CSS grid layout is broken on Ubuntu 22.04 WebKitGTK -- verify on oldest supported WebKitGTK version
- [ ] **Bundle split:** Desktop build passes but browser build includes `@tauri-apps/api` (fails at runtime) -- verify browser bundle with bundle analyzer
- [ ] **Tray icon:** Shows on macOS but invisible on Linux (no tray support in Wayland) -- verify with fallback to window-based status
- [ ] **Secure store:** Auth token cached in keychain on macOS/Windows but no equivalent on Linux -- verify `libsecret` availability or fallback
- [ ] **Native modules:** better-sqlite3 + sodium-native compiled for dev machine architecture but sidecar targets different arch -- verify cross-compilation CI matrix

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| CSP blocks IPC in production | LOW | Add `ipc: http://ipc.localhost` to CSP, rebuild + ship update |
| Port collision | LOW | Switch to ephemeral port allocation, update sidecar manager |
| Browser bundle bloat | MEDIUM | Restructure imports to use dynamic import boundaries, add CI bundle size check |
| WebView rendering bugs | MEDIUM | Add `-webkit-` prefixes, fallback CSS, or set minimum WebKitGTK version requirement |
| Lost signing key | HIGH | Cannot push updates to existing installs. Must release new app with new identity, users must reinstall manually |
| Over-exposed IPC commands | MEDIUM | Audit capabilities, restrict to minimal set, ship security update |
| SEA binary too large | HIGH | Requires switching bundling strategy (SEA to pkg/bun), rewriting CI pipeline, retesting all platforms |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| CSP blocks IPC | Phase 1: IPC Bridge Design | `tauri build` + production install test passes IPC calls |
| Port collision | Phase 1: Sidecar Manager Design | Desktop app launches while standalone daemon is running on default port |
| Bundle bloat | Phase 1: Bundle Optimization Design | CI bundle analyzer shows 0 bytes of `@tauri-apps` in browser build |
| WebView rendering | Phase 2: Cross-Platform Testing | Visual regression tests on macOS, Windows, Ubuntu |
| SEA binary size | Phase 2: Sidecar Packaging | Binary size < 200MB, startup < 5 seconds measured on all platforms |
| IPC over-exposure | Phase 1: IPC Security Design | Capability audit: no `*:default` permissions, all commands typed + validated |
| Dev workflow friction | Phase 1: Dev Workflow Setup | `pnpm dev:desktop` cold-start < 10 seconds, HMR < 500ms |
| Signing key loss | Phase 3: Auto-Update Pipeline | Key backed up to 2+ locations, full update cycle tested in CI |

## Sources

- [Tauri v2 CSP Documentation](https://v2.tauri.app/security/csp/) -- official CSP configuration and IPC requirements
- [Tauri v2 Capabilities](https://v2.tauri.app/security/capabilities/) -- permission system for IPC commands
- [Tauri v2 Sidecar with Node.js](https://v2.tauri.app/learn/sidecar-nodejs/) -- official sidecar packaging guide
- [Tauri v2 Embedding External Binaries](https://v2.tauri.app/develop/sidecar/) -- platform target triple requirements
- [Tauri v2 WebView Versions](https://v2.tauri.app/reference/webview-versions/) -- platform WebView engine reference
- [Tauri v2 Updater Plugin](https://v2.tauri.app/plugin/updater/) -- auto-update signature verification
- [Tauri v2 Isolation Pattern](https://v2.tauri.app/concept/inter-process-communication/isolation/) -- IPC security isolation
- [Tauri CSP IPC bug #8476](https://github.com/tauri-apps/tauri/issues/8476) -- external URL CSP issues
- [Tauri CSP pagehide bug #14707](https://github.com/tauri-apps/tauri/issues/14707) -- IPC blocked by CSP during lifecycle events
- [Vite watching src-tauri bug #8362](https://github.com/tauri-apps/tauri/issues/8362) -- 45-second dev startup from watching Rust build artifacts
- [WebKitGTK cross-platform discussion #12311](https://github.com/tauri-apps/tauri/discussions/12311) -- layout and rendering differences
- [Node.js SEA v25.5 --build-sea](https://nodejs.org/api/single-executable-applications.html) -- SEA binary creation
- [Tauri v2 App Size](https://v2.tauri.app/concept/size/) -- bundle size optimization reference
- WAIaaS `packages/daemon/src/api/middleware/csp.ts` -- current CSP policy (inspected directly)

---
*Pitfalls research for: Tauri Desktop Shell + Admin Web UI Integration*
*Researched: 2026-03-31*
