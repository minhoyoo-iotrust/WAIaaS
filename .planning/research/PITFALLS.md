# Domain Pitfalls: Tauri Desktop App for WAIaaS

**Domain:** Tauri 2 Desktop wrapper over existing Preact Admin Web UI + Node.js SEA sidecar
**Researched:** 2026-03-31
**Confidence:** HIGH (Tauri v2 official docs verified, community issues cross-referenced, project CSP code inspected)

---

## Critical Pitfalls

Mistakes that cause rewrites, broken releases, or security vulnerabilities.

### Pitfall 1: Node.js SEA Native Addon Binary Mismatch

**What goes wrong:** `sodium-native` and `better-sqlite3` are C++ native addons compiled for a specific platform/arch/Node.js ABI. When the SEA binary is built on macOS arm64 and distributed to Windows x64, the bundled `.node` files crash with `ERR_DLOPEN_FAILED`. Node.js SEA does NOT make native modules cross-platform portable -- the addon binaries must match the target platform exactly.

**Why it happens:** SEA bundles JavaScript into the Node.js binary but native addons require platform-specific `.node` shared libraries. The `process.dlopen()` tempfile workaround (write `.node` asset to temp, load at runtime) only works if the binary was compiled for that exact OS/arch/ABI combination. Setting `useCodeCache: true` or `useSnapshot: true` in SEA config generates platform-specific data that silently produces corrupted binaries on other platforms.

**Consequences:** App crashes on startup on any platform where the native addon wasn't compiled. Users see cryptic `ERR_DLOPEN_FAILED` or `MODULE_NOT_FOUND` errors. Worst case: better-sqlite3 partially loads and corrupts the wallet database.

**Prevention:**
1. CI build matrix MUST compile native addons on each target platform (macOS arm64, macOS x64, Windows x64, Linux x64) -- never cross-compile native addons.
2. Use `prebuildify` to bundle prebuilt binaries for all targets, then SEA config includes the correct `.node` file per platform.
3. Set `useCodeCache: false` and `useSnapshot: false` in SEA config -- these are platform-specific and cause silent failures on other platforms.
4. Smoke test: after SEA build, run `./waiaas-sea --version` on each target platform in CI before packaging into Tauri sidecar.
5. Pin Node.js version across all CI runners -- ABI mismatch between Node.js 22.x patch versions has caused better-sqlite3 failures ([#1384](https://github.com/WiseLibs/better-sqlite3/issues/1384)).

**Detection:** CI green on one OS but crashes on others. `Error: The module was compiled against a different Node.js version` in daemon logs. Binary works in dev but fails after Tauri packaging.

**Phase mapping:** Phase 1 (Tauri Shell + Sidecar Manager) -- must be resolved before any other phase can test end-to-end.

**Confidence:** HIGH -- documented Node.js SEA limitation + better-sqlite3 ABI issues widely reported.

---

### Pitfall 2: Sidecar Zombie Processes on App Crash/Force-Quit

**What goes wrong:** When the Tauri app crashes, is force-quit (Force Quit on macOS, Task Manager on Windows), or the OS kills it (OOM), the sidecar daemon process keeps running. On next launch, a second daemon starts -- now two daemons compete for the SQLite database, causing `SQLITE_BUSY` or data corruption.

**Why it happens:** Tauri's `RunEvent::Exit` hook only fires on graceful shutdown. Force-kill sends SIGKILL to the Tauri process without running cleanup. Windows is especially problematic -- it doesn't have Unix-style process groups, so child processes aren't automatically terminated when the parent dies. Tauri's shell plugin spawns the sidecar but doesn't use Windows Job Objects for automatic cleanup.

**Consequences:** Orphaned daemon processes consuming CPU/memory. Multiple daemons writing to same SQLite DB. Port conflicts if the old daemon holds the allocated port. Users must manually kill processes via Task Manager/Activity Monitor.

**Prevention:**
1. **PID lockfile**: Daemon writes PID to `{data_dir}/daemon.pid` on startup, checks+kills stale process on start.
2. **Port file health check**: On startup, read `{data_dir}/daemon.port`, try `GET /v1/health` on that port. If a daemon is already running and healthy, connect to it instead of spawning a new one.
3. **Windows Job Objects**: In Rust Sidecar Manager, use `CreateJobObject` with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` to auto-terminate sidecar when parent exits. This is the ONLY reliable cleanup mechanism on Windows.
4. **Sidecar Manager startup sequence**: `check_existing() -> kill_stale() -> cleanup_port_file() -> spawn_new() -> verify_health()`.
5. **SQLite WAL mode**: Already used, but add `PRAGMA busy_timeout=5000` to handle brief contention during the kill-and-restart window.

**Detection:** Users report "port already in use" errors on app restart. Two `waiaas` processes visible in task manager. `SQLITE_BUSY` errors in daemon logs.

**Phase mapping:** Phase 1 (Sidecar Manager) -- PID lockfile + stale process cleanup must be in initial implementation.

**Confidence:** HIGH -- multiple Tauri issues: [#5611](https://github.com/tauri-apps/tauri/issues/5611), [#1896](https://github.com/tauri-apps/tauri/issues/1896), [#3273](https://github.com/tauri-apps/tauri/discussions/3273).

---

### Pitfall 3: CSP Conflict Between Daemon HTTP Headers and Tauri WebView

**What goes wrong:** The daemon serves Admin UI with strict CSP headers (`default-src 'none'; script-src 'self'; connect-src 'self'`). When the Tauri WebView loads `http://localhost:{port}/admin`, two CSP problems arise:

1. **IPC blocked**: Tauri's `invoke()` uses `ipc:` and `http://ipc.localhost` protocols. `connect-src 'self'` only allows the daemon's HTTP origin. All IPC calls fail silently.
2. **Tauri bridge scripts blocked**: Tauri injects inline scripts for the IPC bridge that violate `script-src 'self'`. Console shows `Refused to execute inline script`.

**Why it happens:** The existing CSP (`packages/daemon/src/api/middleware/csp.ts`) was designed for browser-only access where all scripts and connections originate from the same HTTP origin. Tauri WebView has a dual-origin model: HTTP content from the daemon + IPC scripts from Tauri's native layer. Tauri auto-injects CSP nonces for bundled assets (when CSP is in `tauri.conf.json`) but does NOT modify `connect-src` when CSP comes from HTTP response headers.

**Consequences:** Admin UI appears to load but all Desktop-specific features (Sidecar status, Setup Wizard IPC, quit_app) are silently broken. Works in `tauri dev` (which may bypass CSP) but breaks in production `tauri build`.

**Prevention:**
1. **Preferred approach**: Define Desktop CSP in `tauri.conf.json` `security.csp` which overrides HTTP CSP headers for the WebView. Leave HTTP CSP headers for browser access unchanged:
   ```json
   {
     "security": {
       "csp": "default-src 'self' ipc: http://ipc.localhost; script-src 'self' 'unsafe-inline'; connect-src 'self' ipc: http://ipc.localhost; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://ipfs.io https://cloudflare-ipfs.com; font-src 'self'"
     }
   }
   ```
2. **Alternative**: Conditional CSP in daemon middleware, detecting Desktop requests via custom header:
   ```typescript
   const isDesktopRequest = c.req.header('X-Tauri-Desktop') === 'true';
   const cspValue = isDesktopRequest ? DESKTOP_CSP_VALUE : BROWSER_CSP_VALUE;
   ```
3. **Never** disable CSP entirely or set `default-src *` -- that defeats security for all users.

**Detection:** Desktop app loads Admin UI but IPC commands return `undefined` or throw. Console shows CSP violation warnings. Works in `tauri dev` but fails after `tauri build`.

**Phase mapping:** Phase 2 (IPC Bridge) -- CSP must be adjusted when IPC commands are first tested in production build.

**Confidence:** HIGH -- verified from actual CSP implementation in `packages/daemon/src/api/middleware/csp.ts`.

---

### Pitfall 4: macOS Code Signing + Notarization Pipeline Failures

**What goes wrong:** macOS Catalina+ requires both code signing AND notarization for apps to run without Gatekeeper warnings. Missing or incorrect entitlements cause the app to crash on launch AFTER notarization (not before). The crash is post-notarization specific because notarization enables Hardened Runtime which restricts JIT compilation -- and Tauri's WKWebView requires JIT for JavaScript execution.

**Why it happens:** Tauri uses WKWebView which requires JIT compilation. Without the `com.apple.security.cs.allow-jit` entitlement, the app passes notarization but crashes at runtime when the WebView tries to JIT-compile JavaScript. This is a Tauri-specific trap that doesn't exist in Electron (which bundles its own Chromium). Additionally, notarization takes 2-5 minutes per build and can timeout silently in CI.

**Consequences:** CI builds succeed, notarization succeeds, but the .dmg crashes immediately on user's machine. Users see "WAIaaS Desktop quit unexpectedly" with zero actionable error.

**Prevention:**
1. **Entitlements file** (`entitlements.plist`) must include:
   ```xml
   <key>com.apple.security.cs.allow-jit</key><true/>
   <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
   <key>com.apple.security.cs.disable-library-validation</key><true/>
   ```
2. Use App Store Connect API key (not Apple ID password) for notarization in CI -- avoids 2FA issues and timeout problems.
3. Store signing certificate as base64-encoded CI secret, import into a temporary keychain during build. Delete keychain after build.
4. **Test the signed+notarized artifact**, not just the unsigned build. CI should download the .dmg, mount it, and verify the app launches.
5. A free Apple Developer account CANNOT notarize -- a paid $99/year Apple Developer Program membership is required.

**Detection:** App works fine in development and unsigned builds. After CI builds with signing, macOS users report crash on launch. No error in Tauri logs -- crash happens at the OS level before the app's code runs.

**Phase mapping:** Phase 4 (GitHub Releases CI) -- signing must be configured and tested before first public release.

**Confidence:** HIGH -- documented in [Tauri macOS signing docs](https://v2.tauri.app/distribute/sign/macos/) and [DEV community guide](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-code-signing-for-macos-and-windows-part-12-3o9n).

---

### Pitfall 5: Tauri Updater Key Loss = Bricked Update Channel

**What goes wrong:** Tauri's built-in updater uses Ed25519 signature verification that CANNOT be disabled. The public key is compiled into the app binary at build time. If the private signing key is lost, no further updates can be delivered to existing installations -- users must manually download and reinstall. There is no key rotation mechanism.

**Why it happens:** The signing key is generated once during initial Tauri setup (`tauri signer generate`). Unlike code signing certificates (which have institutional recovery), Tauri's updater key is a standalone Ed25519 keypair with no recovery path. The private key must be in environment variables during CI builds -- `.env` files do NOT work with the Tauri signer.

**Consequences:** Permanent inability to push updates to existing users. Complete loss of the auto-update channel. All users must be notified to manually reinstall.

**Prevention:**
1. Generate key with `tauri signer generate -w ~/.tauri/waiaas.key`.
2. Store private key in **two** independent secure locations (e.g., GitHub Secrets + encrypted backup in team password manager).
3. Store public key in `tauri.conf.json` and document it in the repo.
4. **Test key recovery** during initial setup -- simulate restoring from backup, build with restored key, and verify a full update cycle (check -> download -> verify -> install).
5. NEVER store the private key in the repo, in `.env` files, or in any unencrypted location.
6. Document the key's fingerprint so you can verify which key is in use.

**Detection:** Cannot be detected until the key is needed and missing. By then it's too late.

**Phase mapping:** Phase 4 (Auto-updater) -- key must be generated, backed up, and tested before first release.

**Confidence:** HIGH -- explicitly stated in [Tauri updater docs](https://v2.tauri.app/plugin/updater/).

---

## Technical Debt Patterns

### TD-1: WalletConnect localStorage Wiped on Port Change

**What goes wrong:** WalletConnect SDK stores session data in `localStorage`. Because the daemon uses dynamic port allocation (`--port=0`), each app launch may get a different port. The WebView treats `localhost:3847` and `localhost:4912` as different origins with separate `localStorage` -- all WalletConnect sessions are lost on restart.

**Why it happens:** Web same-origin policy treats different ports as different origins. Dynamic ports mean the origin changes every launch. This is confirmed by [Tauri issue #896](https://github.com/tauri-apps/tauri/issues/896) -- localStorage data is lost when the server runs on a different port.

**Consequences:** Users must re-scan WalletConnect QR code every time they restart the desktop app. Owner connection state is lost. Severely degrades the Desktop UX advantage.

**Prevention:**
1. **Pin the port after first launch**: Save the port to `{data_dir}/daemon.port.preferred` on first successful start. On subsequent launches, try that port first; only fall back to `--port=0` if it's occupied.
2. **Alternative**: Use Tauri's `tauri-plugin-store` for WalletConnect session persistence instead of browser `localStorage`. Intercept WalletConnect's storage adapter with a custom implementation backed by Tauri filesystem.
3. **Alternative**: Store WalletConnect session server-side in the daemon DB and restore it on reconnect.

**Phase mapping:** Phase 0 (WalletConnect Spike) must evaluate this. Phase 3 (WalletConnect integration) must solve it.

**Confidence:** HIGH -- confirmed by Tauri issues [#896](https://github.com/tauri-apps/tauri/issues/896) and [#10981](https://github.com/tauri-apps/tauri/issues/10981). Additionally, on Linux, localStorage doesn't sync between multiple WebView windows and only one window's data is saved on exit.

### TD-2: Crash Restart Loop Without Backoff

**What goes wrong:** Sidecar Manager detects daemon crash and immediately restarts. If the crash is deterministic (corrupted DB, invalid config, missing native addon), this creates a tight restart loop consuming 100% CPU. The system tray icon rapidly flickers between states.

**Prevention:** Exponential backoff: 1s -> 2s -> 4s, max 3 retries in 60 seconds. After max retries, show error dialog to user with (a) last 50 lines of daemon logs, (b) "Open data directory" button, (c) "Retry" button. Set tray icon to red/error state.

**Phase mapping:** Phase 1 (Sidecar Manager).

### TD-3: Windows SmartScreen Reputation Cold Start

**What goes wrong:** Even with OV code signing, new apps start with zero SmartScreen reputation. Users see "Windows protected your PC" warning -- most non-technical users interpret this as malware and refuse to install. Since June 2023, OV certificates must be stored on HSM (Azure Key Vault minimum) and are NOT exported as `.pfx` files.

**Prevention:**
- EV certificates get instant SmartScreen reputation but cost $300-500/year and require HSM.
- After first release with OV cert, submit signed binary to [Microsoft's malware analysis portal](https://www.microsoft.com/en-us/wdsi/filesubmission).
- Document the SmartScreen bypass in installation guide ("Click More Info -> Run Anyway").
- SmartScreen reputation builds over time as more users install -- no shortcut.

**Phase mapping:** Phase 4 (CI/release) -- post-release action item.

### TD-4: Single Vite Build for Both Browser and Desktop

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single Vite build for both browser and desktop | Simpler build config | Desktop deps leak into browser bundle, larger downloads | Never -- use build-time `__DESKTOP__` flag from day one |
| `core:default` Tauri capabilities | Fast prototyping | Over-exposed IPC surface, security audit failure | Development only, must be restricted before any beta |
| Hardcoded daemon port in WebView URL | Avoids port negotiation | Port collision, localStorage loss | Never -- use dynamic port with pinning strategy |
| Skip Linux WebKitGTK testing | Faster release | Linux users report layout bugs, lose trust | Only if Linux is explicitly unsupported |

---

## Integration Gotchas

### IG-1: WebView CSS Rendering Differences Across OS

**What goes wrong:** Admin Web UI renders correctly in Chrome but breaks in Tauri WebView. macOS uses WKWebView (WebKit/Safari engine), Windows uses WebView2 (Chromium), Linux uses WebKitGTK (often outdated WebKit). CSS that works on Windows (Chromium) produces different results on macOS/Linux (WebKit).

**Specific risks for WAIaaS Admin UI:**
- `backdrop-filter: blur()` -- unsupported or buggy in older WebKitGTK
- CSS Grid `subgrid` -- WebKitGTK lags behind Chrome
- `scrollbar-gutter` -- different behavior per engine
- `color-mix()` -- WebKitGTK may not support it depending on distro version
- `:has()` selector -- limited WebKitGTK support
- CRT theme custom properties -- may render differently
- Font rendering -- WebKit and Chromium use different font rasterizers

**Prevention:**
1. Test on all 3 OS early (Phase 1, not Phase 4).
2. Use CSS feature queries (`@supports`) for progressive enhancement.
3. Target lowest common denominator: WebKitGTK on Ubuntu 22.04 LTS (ships WebKitGTK ~4.12, circa 2022).
4. Add `data-platform` attribute to `<html>` for platform-specific CSS overrides.
5. Document minimum OS versions: macOS 13+, Windows 10+, Ubuntu 22.04+.

**Phase mapping:** Phase 1 (first WebView load) -- catch early when fixing is cheapest.

### IG-2: `connect-src 'self'` Blocks WebSocket for WalletConnect

**What goes wrong:** WalletConnect v2 uses WebSocket connections to `wss://relay.walletconnect.com`. The daemon's CSP `connect-src 'self'` blocks these connections. The WebSocket handshake fails silently, and WalletConnect shows "Connection failed" with no useful error.

**Prevention:** When serving to Desktop WebView (via `tauri.conf.json` CSP or conditional middleware), add:
```
connect-src 'self' ipc: http://ipc.localhost wss://relay.walletconnect.com wss://relay.walletconnect.org https://api.web3modal.com https://*.walletconnect.com
```

**Phase mapping:** Phase 0 (WalletConnect Spike) -- must be discovered and documented during spike.

### IG-3: Tauri IPC `invoke()` Error Swallowing

**What goes wrong:** `invoke()` returns a Promise that rejects with a **string** (not an Error object). If `tauri-bridge.ts` uses `try/catch` with `(e as Error).message`, it gets `undefined` because the error is a plain string. The error appears caught but the diagnostic message is lost.

**Prevention:** In `tauri-bridge.ts`, always handle invoke errors as `unknown`:
```typescript
export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(typeof e === 'string' ? e : String(e));
  }
}
```

**Phase mapping:** Phase 2 (IPC Bridge).

### IG-4: Tauri IPC Duplicates HTTP API Surface

**What goes wrong:** Developers create IPC commands for operations that already work via the HTTP API (e.g., `invoke('create_wallet')` when `POST /v1/wallets` works fine from the WebView). This creates a parallel API surface that must be maintained, tested, and kept in sync.

**Prevention:** IPC commands should ONLY be for native-only operations that cannot be done via HTTP:
- `start_daemon`, `stop_daemon`, `restart_daemon` -- process management
- `get_sidecar_status` -- Rust-side state
- `get_daemon_logs` -- filesystem access
- `send_notification` -- OS native notifications
- `quit_app` -- Tauri process lifecycle

All wallet/transaction/policy/session operations use the existing HTTP API client, same as browser mode.

**Phase mapping:** Phase 2 (IPC Bridge design) -- establish the boundary before implementation.

### IG-5: Vite HMR + Tauri Dev Server Startup Race

**What goes wrong:** `tauri dev` starts the Rust backend which immediately opens the WebView pointing to Vite's dev URL. If Vite hasn't finished starting, the WebView loads a connection-refused page. Additionally, Vite's file watcher includes `src-tauri/target/` by default, causing 45-second startup delays and spurious reloads when Rust recompiles.

**Prevention:**
1. Configure Vite: `server: { watch: { ignored: ['**/src-tauri/**'] } }`
2. Use `beforeDevCommand` with a port-check script that waits for Vite.
3. Document dev workflow: `pnpm dev:admin` (browser only) vs `pnpm dev:desktop` (Tauri + Vite).

**Phase mapping:** Phase 1 (Development Workflow Setup).

---

## Performance Traps

### PT-1: Desktop Code Leaking into Browser Bundle (Tree-Shaking Failure)

**What goes wrong:** Despite `dynamic import()` guards, Vite/Rollup bundles Desktop-only modules (`@reown/appkit` ~500KB+, `@tauri-apps/api`, WalletConnect SDK) into the browser production build. Browser users download megabytes of unused code that also fails at runtime (referencing `window.__TAURI_INTERNALS__`).

**Why it happens:**
1. A developer adds a top-level `import { invoke } from '@tauri-apps/api/core'` in a shared file.
2. Barrel files (`desktop/index.ts`) re-export everything, defeating tree-shaking.
3. Side effects in Desktop modules (e.g., `@reown/appkit` initializes on import) prevent dead code elimination.
4. Vite's dynamic import analysis may follow `import()` paths eagerly in certain configurations ([#14145](https://github.com/vitejs/vite/issues/14145)).

**Prevention (4-layer strategy from design doc 39):**
1. **Layer 1 - Dynamic import**: All `desktop/` imports use `await import('./desktop/...')` inside `isDesktop()` guards. ESLint `no-restricted-imports` rule blocks static imports from `desktop/`.
2. **Layer 2 - Optional peer deps**: `@tauri-apps/api`, `@reown/appkit` are `optionalDependencies` in `packages/admin/package.json`, not `dependencies`.
3. **Layer 3 - Build constant**: `define: { __DESKTOP__: false }` for browser builds. Desktop-only code wrapped in `if (__DESKTOP__)` is dead-code-eliminated.
4. **Layer 4 - CI verification**: Post-build script checks browser bundle for Desktop code:
   ```bash
   if grep -r "@tauri-apps\|__TAURI__\|@reown/appkit\|walletconnect" dist/admin/assets/*.js; then
     echo "FAIL: Desktop code leaked into browser bundle"
     exit 1
   fi
   ```

**Detection:** Browser bundle size increases from ~200KB to 700KB+. Console errors about `window.__TAURI_INTERNALS__` in browser.

**Phase mapping:** Phase 2 (when Desktop modules are first added). Layer 4 CI gate in Phase 4.

### PT-2: Sidecar Binary Size Bloat

**What goes wrong:** Node.js SEA binary = Node.js runtime (~40MB) + bundled JS + native addons. Tauri shell (~10-15MB) + WebView is separate. Total app: 80-150MB per platform. Users expect desktop apps to be <50MB.

**Prevention:**
1. `esbuild --minify --tree-shaking=true` for JS bundle before SEA packaging.
2. `strip` the SEA binary on Linux/macOS to remove debug symbols.
3. Consider UPX compression (test for Windows antivirus false positives).
4. Document expected size in release notes to set user expectations.
5. Use Tauri's resource system for JS bundle if delta updates are needed.

**Phase mapping:** Phase 1 (SEA build pipeline) -- measure early.

### PT-3: WebView Full-Page Reload on Sidecar Restart

**What goes wrong:** When the daemon restarts (crash recovery, manual restart via IPC), the WebView loses its entire state because the HTTP server goes down briefly. Users see a blank page for 3-5 seconds, then the app reloads from scratch, losing form state, navigation position, etc.

**Prevention:** API client with reconnection logic: detect `ECONNREFUSED`, show loading overlay (not blank page), retry health check every 500ms, restore previous route when daemon is back. The splash page should only be used on initial startup, not on reconnection.

**Phase mapping:** Phase 2 (WebView navigation logic).

---

## Security Mistakes

### SM-1: Updater MITM via HTTP Endpoint

**What goes wrong:** A misconfigured endpoint URL (typo `http://` instead of `https://`) allows MITM of the `latest.json` update manifest. The attacker can serve a malicious `latest.json` pointing to their binary. Tauri's signature verification catches tampered binaries, but an attacker could serve an older vulnerable version that passes signature verification (downgrade attack).

**Prevention:**
1. Hard-code HTTPS-only URL in `tauri.conf.json` updater config.
2. Pin to GitHub Releases URL (`https://github.com/OWNER/REPO/releases/latest/download/latest.json`) -- GitHub enforces HTTPS.
3. Implement version downgrade protection: updater refuses to install a version older than current.

**Phase mapping:** Phase 4 (Updater configuration).

### SM-2: Sidecar Binary Not Verified Before Launch

**What goes wrong:** If an attacker replaces the sidecar binary in an unprotected install directory (especially on Linux where AppImage extraction is writable), the Tauri app launches the malicious binary with user permissions.

**Prevention:**
1. Compute SHA-256 hash of sidecar at build time, embed in Rust code.
2. Verify hash before spawning the sidecar process.
3. On macOS/Windows, code signing provides this guarantee (OS verifies bundle integrity). On Linux, manual hash verification is necessary since [AppImage does not validate signatures](https://v2.tauri.app/distribute/sign/linux/).

**Phase mapping:** Phase 1 (Sidecar Manager).

### SM-3: Desktop CSP Relaxation Exposes Browser Users

**What goes wrong:** When relaxing CSP for Tauri WebView (adding `wss://relay.walletconnect.com`, `'unsafe-inline'`), the relaxed CSP accidentally applies to browser users too, widening the attack surface for XSS.

**Prevention:** CSP relaxation must be Desktop-only:
- **Best**: Use `tauri.conf.json` `security.csp` which only affects the WebView. HTTP CSP headers in daemon middleware remain strict for browser access.
- **Alternative**: Conditional CSP in middleware with Desktop detection header.

**Phase mapping:** Phase 2 (CSP adjustment).

### SM-4: IPC Command Over-Exposure

**What goes wrong:** Developers grant blanket `core:default` or `shell:default` Tauri capabilities during development. Since the WebView loads from `http://localhost`, any XSS payload can invoke Tauri commands (filesystem access, shell execution, etc.) that bypass HTTP authentication.

**Prevention:**
1. Define minimal capabilities in `src-tauri/capabilities/`: only the 7 defined IPC commands + `notification:default` + `updater:default`.
2. No `shell:execute` ever -- every native operation is a typed Rust command with Serde input validation.
3. CI audit: parse `capabilities/*.json` and fail if any `*:default` permission is present in production config.

**Phase mapping:** Phase 1 (Tauri project setup).

### SM-5: Daemon Binds to 0.0.0.0 in Desktop Mode

**What goes wrong:** If the daemon's sidecar inherits a config with `host = "0.0.0.0"`, anyone on the local network can access the wallet daemon. Desktop users assume "local app" means "safe", but network-accessible daemon + masterAuth password brute-force = wallet compromise.

**Prevention:** Sidecar Manager must always pass `--host=127.0.0.1` when spawning the daemon, regardless of config.toml. Validate in Rust before spawning.

**Phase mapping:** Phase 1 (Sidecar Manager).

---

## UX Pitfalls

### UX-1: Splash Screen Stuck on Sidecar Failure

**What goes wrong:** The WebView shows `tauri://localhost/splash.html` while waiting for the sidecar. If the sidecar fails (port conflict, corrupted binary, missing permissions), the splash stays forever. No error, no way to diagnose.

**Prevention:**
1. 15-second timeout on splash screen.
2. After timeout, show error panel with: (a) failure reason, (b) last 50 lines of daemon logs, (c) "Retry" button, (d) "Open data directory" button.
3. Splash HTML is bundled in Tauri (not served by daemon), so it works even when daemon is down.

**Phase mapping:** Phase 1 (splash + navigation).

### UX-2: System Tray Icon Invisible on Dark/Light Theme

**What goes wrong:** Green/orange/red status icons designed for light backgrounds are invisible on macOS dark mode (dark menu bar). Or vice versa.

**Prevention:** Use `SystemTray::with_icon_as_template(true)` on macOS to let the OS handle light/dark adaptation. For Windows/Linux, provide two icon sets and detect theme. Test on both dark and light mode during development.

**Phase mapping:** Phase 2 (System Tray).

### UX-3: Window Close Kills the Daemon

**What goes wrong:** User clicks the window close button expecting to minimize. Instead, the daemon shuts down, killing in-progress transactions and incoming TX monitoring.

**Prevention:** Minimize to system tray on close (with first-time notification explaining behavior). Explicit "Quit" in tray menu -> `quit_app` IPC -> daemon graceful shutdown -> app exit. Check for pending transactions before quit, warn user.

**Phase mapping:** Phase 2 (System Tray + Window lifecycle).

### UX-4: Setup Wizard Re-Triggers After Daemon Reset

**What goes wrong:** Wizard checks if daemon is configured (master password set, wallet exists). If user resets daemon (delete DB), wizard re-triggers for experienced users who don't need it.

**Prevention:** Add "Skip Wizard" button on first screen. Store wizard-complete state in Tauri's plugin-store (Desktop-side), not solely in daemon state.

**Phase mapping:** Phase 3 (Setup Wizard).

### UX-5: Auto-Update Interrupts Active Operations

**What goes wrong:** Update triggers while a transaction is in DELAY state or pending Owner approval. The daemon shuts down mid-operation, the transaction is lost or stuck.

**Prevention:** Before applying update, query `GET /v1/transactions?status=PENDING,DELAY,AWAITING_APPROVAL`. If any exist, show warning dialog and defer update. Let user choose "Update Now" (acknowledging risk) or "Update Later".

**Phase mapping:** Phase 4 (Auto-updater UX).

---

## "Looks Done But Isn't" Checklist

| Item | Looks done when... | Actually done when... |
|------|--------------------|-----------------------|
| SEA binary builds | CI compiles on one platform | CI compiles AND smoke-tests on all 3 platforms with native addon load verification |
| Sidecar lifecycle | Daemon starts when app opens | Daemon starts, survives app crash, cleans up zombies on next launch, handles port conflicts, has backoff on crash loop |
| WalletConnect | QR code appears in WebView | QR works, session persists across restarts (port change doesn't lose localStorage), CSP allows WebSocket, relay connection stable |
| Tree-shaking | `@tauri-apps/api` is in dynamic import | CI bundle analysis confirms zero Desktop code in browser build (Layer 4 gate passes) |
| Code signing | macOS build doesn't show unsigned warning | macOS notarized + entitlements correct (no JIT crash), Windows signed + SmartScreen submitted |
| Auto-updater | Update downloads and installs | Update verifies signature, refuses downgrades, key backed up in 2 locations, pending TX check before update |
| CSP compatibility | Admin UI loads in WebView | Admin UI loads AND IPC works AND WalletConnect WebSocket connects AND browser CSP is unchanged |
| System tray | Tray icon shows green | Icons visible in light mode, dark mode, high-DPI, all 3 OS, minimize-to-tray works |
| Dynamic port | Daemon starts on random port | WebView navigates to correct port, port pinned for subsequent launches, port file cleaned on exit |

---

## Pitfall-to-Phase Mapping

| Phase | Likely Pitfalls | Mitigation |
|-------|----------------|------------|
| **Phase 0: WalletConnect Spike** | TD-1 (localStorage wiped on port change), IG-2 (CSP blocks WebSocket) | Test with pinned port. Document CSP requirements. Evaluate Tauri plugin-store as storage adapter |
| **Phase 1: Tauri Shell + Sidecar** | Pitfall 1 (native addon binary mismatch), Pitfall 2 (zombie processes), PT-2 (binary bloat), SM-2 (binary tampering), SM-4 (IPC over-exposure), SM-5 (0.0.0.0 binding), UX-1 (stuck splash), IG-5 (dev startup race), TD-2 (crash loop) | CI matrix build per platform, PID lockfile + Job Objects, hash verification, minimal capabilities, 127.0.0.1 enforcement, splash timeout, Vite watcher exclusion, exponential backoff |
| **Phase 2: IPC + System Tray** | Pitfall 3 (CSP conflict), IG-3 (invoke error swallowing), IG-4 (IPC duplicates HTTP), PT-1 (bundle leak), PT-3 (reload on restart), SM-3 (CSP exposes browser), UX-2 (tray icon theme), UX-3 (close kills daemon) | Tauri.conf.json CSP, error normalization, IPC-only-for-native rule, ESLint guard + build flag, reconnection logic, tray template icon, minimize-to-tray |
| **Phase 3: Wizard + WalletConnect** | TD-1 (localStorage loss), IG-1 (CSS differences), UX-4 (wizard re-trigger) | Port pinning or Tauri store adapter, CSS @supports + platform testing, skip button + Desktop-side state |
| **Phase 4: CI + Updater** | Pitfall 4 (macOS notarization crash), Pitfall 5 (key loss), TD-3 (SmartScreen), SM-1 (MITM), PT-1 Layer 4 (CI bundle gate), UX-5 (update interrupts TX) | Entitlements file, key backup x2, SmartScreen submission, HTTPS-only endpoint, bundle string grep, pending TX check |

---

## Sources

- [Tauri v2 WebView Versions](https://v2.tauri.app/reference/webview-versions/) -- WebKit/WebView2/WebKitGTK engine details
- [Tauri v2 CSP Documentation](https://v2.tauri.app/security/csp/) -- WebView CSP configuration
- [Tauri v2 Capabilities](https://v2.tauri.app/security/capabilities/) -- permission system for IPC commands
- [Tauri v2 macOS Code Signing](https://v2.tauri.app/distribute/sign/macos/) -- Notarization + entitlements
- [Tauri v2 Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/) -- SmartScreen + HSM requirements
- [Tauri v2 Linux Code Signing](https://v2.tauri.app/distribute/sign/linux/) -- AppImage signature limitations
- [Tauri v2 Updater Plugin](https://v2.tauri.app/plugin/updater/) -- Signature verification, key management
- [Tauri v2 Sidecar with Node.js](https://v2.tauri.app/learn/sidecar-nodejs/) -- Sidecar packaging guide
- [Tauri Sidecar Zombie Process #5611](https://github.com/tauri-apps/tauri/issues/5611) -- Windows process cleanup failure
- [Tauri Sidecar Survives Exit #1896](https://github.com/tauri-apps/tauri/issues/1896) -- Sidecar outlives main process
- [Tauri Kill Process Discussion #3273](https://github.com/tauri-apps/tauri/discussions/3273) -- Community process cleanup workarounds
- [Tauri Sidecar Lifecycle Plugin Request #3062](https://github.com/tauri-apps/plugins-workspace/issues/3062) -- Production lifecycle management needs
- [Tauri Sidecar Manager (community)](https://github.com/radical-data/tauri-sidecar-manager) -- Reference lifecycle management
- [Tauri Cross-Platform Rendering #12311](https://github.com/tauri-apps/tauri/discussions/12311) -- CSS layout differences
- [Tauri localStorage #896](https://github.com/tauri-apps/tauri/issues/896) -- localStorage not persisting across port changes
- [Tauri localStorage Linux Bug #10981](https://github.com/tauri-apps/tauri/issues/10981) -- localStorage sync failure
- [Tauri v2 Code Signing Guide](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-code-signing-for-macos-and-windows-part-12-3o9n) -- CI signing setup
- [Tauri v2 Release Automation](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7) -- tauri-action CI pipeline
- [Node.js SEA Documentation](https://nodejs.org/api/single-executable-applications.html) -- Native addon tempfile workaround
- [Improving SEA Building](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/) -- SEA core improvements
- [Node.js 25.5 --build-sea](https://progosling.com/en/dev-digest/2026-01/nodejs-25-5-build-sea-single-executable) -- One-step SEA build
- [better-sqlite3 Node 24 ABI Issue #1384](https://github.com/WiseLibs/better-sqlite3/issues/1384) -- Prebuild binary mismatch
- [Vite Dynamic Import Tree-Shaking #14145](https://github.com/vitejs/vite/issues/14145) -- Dynamic imports not tree-shaken
- WAIaaS `packages/daemon/src/api/middleware/csp.ts` -- Existing CSP configuration (verified locally, `connect-src 'self'`)
- WAIaaS `internal/objectives/m33-02-desktop-app.md` -- Risk section, phase structure, architecture decisions

---
*Pitfalls research for: Tauri Desktop App (v33.2 milestone)*
*Researched: 2026-03-31, updated with comprehensive web research*
