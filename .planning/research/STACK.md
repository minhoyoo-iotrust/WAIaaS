# Technology Stack: Tauri Desktop App

**Project:** WAIaaS Desktop App (m33-02 Implementation)
**Researched:** 2026-03-31
**Overall confidence:** MEDIUM-HIGH

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tauri 2 (tauri crate) | ^2.10.x | Desktop shell (Rust backend + WebView) | Stable since Oct 2024 (1.5 years). v2.10.1 latest on npm. ~10MB binary vs Electron ~150MB. System WebView reuse. First-class sidecar support via plugin-shell. Capabilities-based minimal permission model aligns with WAIaaS security principles. Frontend-agnostic -- Preact + Vite works out of the box | HIGH |
| @tauri-apps/api | ^2.10.1 | WebView-to-Rust IPC bridge (`invoke()`, events) | Core JS bridge. Version MUST match tauri CLI/crate version. `window.__TAURI_INTERNALS__` detection for Desktop environment. Admin Web UI uses dynamic import for tree-shaking | HIGH |
| @tauri-apps/cli | ^2.10.1 | Tauri CLI (`dev`, `build`, `signer generate`) | Build toolchain. Dev dependency only. `tauri dev` connects devUrl to Vite for HMR. `tauri signer generate` creates update signing keypair | HIGH |
| Rust (stable) | >= 1.77.2 | Tauri backend (Sidecar Manager, System Tray, IPC commands) | Required by Tauri 2. Minimum 1.77.2 for `rustc --print host-tuple` (sidecar target triple). Stable channel sufficient | HIGH |

### Tauri Plugins

All plugins follow **synchronized versioning**: Cargo.toml crate version must match npm JS bindings version. Install via `npm run tauri add <plugin>` to auto-sync.

| Plugin | Cargo Crate Version | npm Package Version | Purpose | Required For |
|--------|-------------------|-------------------|---------|-------------|
| Shell | tauri-plugin-shell ^2.3.5 | @tauri-apps/plugin-shell ^2.3.5 | Sidecar process spawn/manage/kill | `Command.sidecar('binaries/waiaas-daemon')` -- core of Sidecar Manager. stdout parsing for `WAIAAS_PORT={port}` protocol. Crash detection via exit event |
| Updater | tauri-plugin-updater ^2.10.0 | @tauri-apps/plugin-updater ^2.10.0 | Auto-update from GitHub Releases | Built-in signature verification. `latest.json` endpoint. Download+install+relaunch. No custom update server needed |
| Process | tauri-plugin-process ^2.3.1 | @tauri-apps/plugin-process ^2.3.1 | App exit/relaunch | `relaunch()` after updater install. `exit(0)` for `quit_app` IPC command |
| Notification | tauri-plugin-notification ^2.x | @tauri-apps/plugin-notification ^2.x | OS native notifications | `send_notification` IPC command. Optional -- can be added later |

### Node.js SEA (Sidecar Binary)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js SEA | Node 22.x `--experimental-sea-config` | Package daemon as single executable | Project targets Node 22 LTS. SEA is the official approach. `--experimental-sea-config` stable in Node 22. `assets` field supports native addon .node files | MEDIUM-HIGH |
| esbuild | existing (^0.24.x) | Bundle daemon into single .cjs before SEA | Already in devDependencies. Bundles all JS/TS into one file. Native addons marked `external` | HIGH |
| postject | ^1.0.0-alpha.6 | Inject SEA blob into Node binary | Official Node.js tool. Required for Node 22 (`--build-sea` is Node 25.5+ only). One-time injection step per platform | MEDIUM |

**Why NOT `--build-sea` (Node 25.5+):** Project targets Node 22 LTS. The newer `--build-sea` flag consolidates the multi-step postject workflow into one command, but is only available in Node 25.5+. Stick with `--experimental-sea-config` + postject for Node 22. If project upgrades to Node 25+ in the future, switch to `--build-sea`.

### Native Addon Strategy for SEA

**Critical constraint:** sodium-native and better-sqlite3 are native addons (.node files) that cannot be compiled into the SEA binary. Two approaches exist:

#### Approach A: SEA `assets` field (Recommended)

Node 22 SEA supports an `assets` field to bundle files inside the binary. Native .node files can be bundled as assets, then extracted at runtime via `sea.getAsset()` + written to temp file + loaded with `process.dlopen()`.

```json
{
  "main": "dist/daemon-bundle.cjs",
  "output": "dist/sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useCodeCache": true,
  "assets": {
    "better_sqlite3.node": "prebuilds/better_sqlite3.node",
    "sodium.node": "prebuilds/sodium.node"
  }
}
```

```javascript
// SEA entry point -- native addon loader
const { getAsset } = require('node:sea');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadNativeAddon(assetName) {
  const tmpDir = path.join(os.tmpdir(), 'waiaas-native');
  fs.mkdirSync(tmpDir, { recursive: true });
  const addonPath = path.join(tmpDir, assetName);
  if (!fs.existsSync(addonPath)) {
    fs.writeFileSync(addonPath, getAsset(assetName));
  }
  process.dlopen(module, addonPath);
}
```

**Caveat:** Linux ARM64 Docker containers produce ELF binaries with incorrect hash tables that crash on `process.dlopen()`. Build SEA on native runners (not Docker) for Linux ARM64.

#### Approach B: Ship .node files alongside SEA binary (Fallback)

If Approach A has issues, ship native .node files next to the SEA binary and resolve via `process.execPath` dirname:

```
apps/desktop/src-tauri/binaries/
  waiaas-daemon-{target-triple}       # SEA binary
  waiaas-daemon-{target-triple}.node/ # directory with .node files
    better_sqlite3.node
    sodium.node
```

**esbuild config:**
```javascript
await build({
  entryPoints: ['packages/daemon/src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',  // SEA requires CJS in Node 22
  outfile: 'dist/daemon-sea.cjs',
  external: ['better-sqlite3', 'sodium-native'],  // native addons
});
```

| Addon | prebuild availability | Platforms |
|-------|--------------------|-----------|
| better-sqlite3 | prebuildify prebuilds in npm package | darwin-arm64, darwin-x64, linux-x64, win32-x64 |
| sodium-native | prebuildify prebuilds in npm package | darwin-arm64, darwin-x64, linux-x64, win32-x64 |
| argon2 | N-API prebuilds | darwin-arm64, darwin-x64, linux-x64, win32-x64 |

### WalletConnect Integration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @reown/appkit | ^1.8.19 | WalletConnect modal + QR code | Framework-agnostic core. `createAppKit()` vanilla JS API -- **no React dependency**. Uses Web Components (Lit-based `<w3m-modal>`). SIWX (SIWS + SIWE) built-in. Phase 0 spike required for Tauri WebView validation | MEDIUM |
| @reown/appkit-adapter-wagmi | ^1.8.19 | EVM wallet adapter (MetaMask, Rainbow) | Reuses project's existing viem 2.x. Wagmi adapter connects via WalletConnect Relay | MEDIUM |
| @reown/appkit-adapter-solana | ^1.8.19 | Solana wallet adapter (Phantom, Backpack) | Connects Solana wallets via WalletConnect. Required for SIWS Owner registration | MEDIUM |

**Preact compatibility strategy:** `@reown/appkit` core does NOT depend on React. It uses Web Components (`<w3m-modal>`, `<w3m-button>`) built with Lit. Web Components are framework-agnostic and render correctly in Preact. The React-specific `@reown/appkit/react` module is NOT needed and MUST NOT be imported.

**Initialization (vanilla JS):**
```typescript
import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { SolanaAdapter } from '@reown/appkit-adapter-solana';

const modal = createAppKit({
  projectId: 'YOUR_REOWN_PROJECT_ID',
  adapters: [new WagmiAdapter({ projectId, networks }), new SolanaAdapter()],
  networks: [mainnet, solana],
  metadata: { name: 'WAIaaS', description: '...', url: '...', icons: ['...'] },
});
// modal.open() shows QR modal, <w3m-modal> auto-injects
```

**Tauri WebView CSP requirement:** AppKit uses WebSocket to WalletConnect Relay (`wss://relay.walletconnect.com`). Tauri `tauri.conf.json` security CSP must include:
```
connect-src 'self' http://localhost:* ws://localhost:* wss://relay.walletconnect.com https://*.walletconnect.com
```

**Phase 0 spike validates:** (1) `<w3m-modal>` Web Component renders in WebKit/WebView2, (2) WebSocket to Relay connects through Tauri CSP, (3) QR scan + wallet connect + SIWS/SIWE signature works end-to-end.

### CI/CD: GitHub Releases

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| tauri-apps/tauri-action | @v0 | Build + release 3 platforms | Official Tauri CI action. Auto-creates GitHub Release. Generates updater artifacts (`latest.json`). Uses node v24 runner (min runner v2.327.1). `__VERSION__` placeholder auto-replaced | HIGH |
| actions/checkout | @v4 | Git checkout | Standard | HIGH |
| actions/setup-node | @v4 | Node.js 22 setup + pnpm cache | Standard | HIGH |
| dtolnay/rust-toolchain | @stable | Rust toolchain | Standard for Tauri CI | HIGH |
| swatinem/rust-cache | @v2 | Cargo build cache | 50-70% Rust compile time reduction on CI | HIGH |

**Build matrix (5 targets):**

| Runner | Target Triple | Output |
|--------|--------------|--------|
| macos-latest (ARM) | aarch64-apple-darwin | .dmg (universal) |
| macos-13 (Intel) | x86_64-apple-darwin | .dmg |
| ubuntu-22.04 | x86_64-unknown-linux-gnu | .AppImage, .deb |
| windows-latest | x86_64-pc-windows-msvc | .msi, .nsis |

**Tag trigger:** `desktop-v*` (independent from release-please daemon tags).

**Updater integration:** tauri-action automatically generates `latest.json` and uploads to GitHub Release. The updater plugin fetches this endpoint to check for updates.

---

## Version Compatibility Matrix

All Tauri ecosystem packages MUST be version-synchronized. Pin to same minor.

| Component | Cargo Crate | npm Package | Current Version |
|-----------|------------|-------------|-----------------|
| Tauri Core | tauri | @tauri-apps/api | 2.10.x |
| Tauri CLI | tauri-cli | @tauri-apps/cli | 2.10.x |
| Shell Plugin | tauri-plugin-shell | @tauri-apps/plugin-shell | 2.3.x |
| Updater Plugin | tauri-plugin-updater | @tauri-apps/plugin-updater | 2.10.x |
| Process Plugin | tauri-plugin-process | @tauri-apps/plugin-process | 2.3.x |

**Update rule:** When updating Tauri core, update ALL plugins simultaneously. Use `npm run tauri add <plugin>` or check Tauri release notes for compatible versions.

---

## Installation

### Monorepo Changes

```yaml
# pnpm-workspace.yaml -- add apps/* workspace
packages:
  - "packages/*"
  - "packages/adapters/*"
  - "apps/*"           # NEW: for apps/desktop
```

### Rust Dependencies (apps/desktop/src-tauri/Cargo.toml)

```toml
[dependencies]
tauri = { version = "2.10", features = ["tray-icon", "image-png"] }
tauri-plugin-shell = "2.3"
tauri-plugin-updater = "2.10"
tauri-plugin-process = "2.3"
tauri-plugin-notification = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }

[build-dependencies]
tauri-build = { version = "2.10", features = [] }
```

### JavaScript Dependencies (apps/desktop/package.json or packages/admin/package.json)

```bash
# Tauri core + plugins
pnpm add @tauri-apps/api@^2.10.1
pnpm add @tauri-apps/plugin-shell@^2.3.5
pnpm add @tauri-apps/plugin-updater@^2.10.0
pnpm add @tauri-apps/plugin-process@^2.3.1

# WalletConnect (Desktop-only, dynamic import -- tree-shaken from browser build)
pnpm add @reown/appkit@^1.8.19
pnpm add @reown/appkit-adapter-wagmi@^1.8.19
pnpm add @reown/appkit-adapter-solana@^1.8.19

# Dev tools
pnpm add -D @tauri-apps/cli@^2.10.1

# SEA build tools (root or packages/daemon devDependencies)
pnpm add -D postject@^1.0.0-alpha.6
```

### Tauri Project Init

```bash
cd apps/desktop
pnpm tauri init
# Creates src-tauri/ with Cargo.toml, tauri.conf.json, main.rs, etc.
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Desktop framework | Tauri 2 | Electron 33 | 150MB+ binary vs ~10MB. Chromium bundling unnecessary. Already decided in design doc 39 |
| Desktop framework | Tauri 2 | Neutralinojs | Smaller ecosystem, no plugin system, no updater. Missing CI tooling |
| Node packaging | Node 22 SEA | @yao-pkg/pkg | Community fork of deprecated Vercel pkg. SEA is official Node.js feature |
| Node packaging | Node 22 SEA | nexe | Last major update 2022. Unmaintained |
| WalletConnect | @reown/appkit vanilla JS | @walletconnect/web3modal v3 | Deprecated. Renamed to @reown/appkit |
| WalletConnect | @reown/appkit (Plan A) | Raw WebSocket to Relay (Plan B) | Plan A first -- AppKit handles QR, sessions, SIWX. Plan B is fallback if WebView incompatible |
| CI | tauri-apps/tauri-action@v0 | Manual cargo build | tauri-action handles signing, notarization, Release creation, updater artifacts. Manual = 200+ lines YAML |
| Updater | tauri-plugin-updater | CrabNebula Cloud | CrabNebula is paid. GitHub Releases is free + integrates with existing release workflow |
| WebView URL | External localhost | tauri-plugin-localhost | tauri-plugin-localhost serves Tauri assets as localhost. Daemon already serves Admin UI. Unnecessary layer |

---

## What NOT to Use

| Technology | Why Avoid | Use Instead |
|------------|-----------|-------------|
| React 18 | Design doc 39 v33.0 explicitly rejected. Would create dual UI maintenance burden. Admin Web UI already uses Preact 10.x | Reuse existing Admin Web UI (Preact 10.x) via WebView |
| TailwindCSS | Admin Web UI uses plain CSS with CSP `style-src 'self'`. Would conflict with existing style architecture | Existing Admin CSS |
| @reown/appkit/react | React JSX runtime conflicts with Preact. Bundle size increase for unused React | `@reown/appkit` vanilla JS + Web Components |
| @reown/appkit-adapter-react | Same React dependency issue | @reown/appkit-adapter-wagmi (framework-agnostic) |
| preact-compat + React libs | Compat layer is fragile. WalletConnect modal could break | Vanilla JS AppKit mode |
| @walletconnect/web3modal | Deprecated (renamed to @reown/appkit) | @reown/appkit ^1.8.x |
| @yao-pkg/pkg / nexe | Deprecated / unmaintained | Node.js 22 SEA (official) |
| Electron | Already decided against. Too heavy for this use case | Tauri 2 |
| Tauri 1.x | EOL. Plugin APIs completely different from 2.x | Tauri 2.10.x |
| node --build-sea | Node 25.5+ only. Project targets Node 22 | --experimental-sea-config + postject |
| tauri-plugin-localhost | Daemon already serves Admin UI. Would add port conflicts | WebviewUrl::External(localhost) |

---

## Key Architecture Integration Points

### 1. WebView loads External localhost URL

Tauri WebView loads `http://localhost:{dynamic_port}/admin` from sidecar daemon. NOT Tauri's own asset serving.

**Critical: Remote URL IPC permissions.** External URLs do NOT get `window.__TAURI_INTERNALS__` injected by default. Must use `CapabilityBuilder::new().remote(url).permission(...)` in Rust to grant IPC access to the localhost origin.

**Daemon CORS:** Add Tauri WebView origins to existing Hono CORS config:
- `tauri://localhost` (macOS WebKit, Linux WebKitGTK)
- `http://tauri.localhost` (Windows WebView2)
- `https://tauri.localhost` (Windows WebView2 with useHttpsScheme)

### 2. Dynamic Import Boundary for Tree-Shaking

All `@tauri-apps/*` and `@reown/appkit` imports MUST use dynamic `import()` inside `isDesktop()` guards. Vite code splitting auto-creates separate chunks. Browser build never loads these chunks.

| Module | Approx Size | Load Condition |
|--------|------------|----------------|
| @tauri-apps/api | ~15KB | `isDesktop()` true |
| @tauri-apps/plugin-shell | ~5KB | Sidecar status query |
| @tauri-apps/plugin-updater | ~5KB | Update check |
| @reown/appkit + adapters | ~200KB+ | WalletConnect page (Desktop only) |

### 3. SEA Build Pipeline (CI per-platform)

```
1. esbuild: bundle daemon TS -> single .cjs (native addons external)
2. Download prebuild .node files for target platform
3. node --experimental-sea-config sea-config.json (generate blob with assets)
4. cp $(which node) waiaas-daemon-{target-triple}
5. postject inject blob into binary
6. codesign (macOS: Developer ID, Windows: optional)
7. Place in apps/desktop/src-tauri/binaries/
```

### 4. Tauri Capabilities (Permissions)

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "WAIaaS Desktop capabilities",
  "windows": ["main"],
  "permissions": [
    {
      "identifier": "shell:allow-execute",
      "allow": [
        { "name": "binaries/waiaas-daemon", "sidecar": true, "args": true }
      ]
    },
    "shell:allow-spawn",
    "shell:allow-kill",
    "shell:allow-stdin-write",
    "updater:default",
    "notification:default",
    "process:default"
  ]
}
```

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Tauri 2.x core + plugins | HIGH | Stable 1.5 years. v2.10.1 latest. Official docs comprehensive. Sidecar, tray, updater all well-documented |
| tauri-action CI/CD | HIGH | Official action. @v0 latest. Multi-platform matrix well-tested |
| Auto-updater (GitHub Releases) | HIGH | plugin-updater official. GitHub Releases as endpoint is documented pattern |
| Node.js 22 SEA basic | HIGH | Official Node.js feature. Well-documented |
| SEA + native addon (assets) | MEDIUM | Assets field exists in Node 22 but few production reports of bundling complex native addons (sodium-native, better-sqlite3). dlopen from temp file pattern works but needs CI validation per platform |
| postject reliability | MEDIUM | postject marked as going unmaintained (replaced by --build-sea in Node 25.5+). Still works for Node 22 but no new fixes expected. Alpha version (1.0.0-alpha.6) |
| @reown/appkit vanilla JS | MEDIUM | Official vanilla JS mode. Web Components work in Preact. But no Preact-specific examples or Tauri WebView confirmed reports |
| @reown/appkit in Tauri WebView | LOW | No confirmed reports of this combination. WebSocket to relay should work. Web Components should render. But CSP + WebKit quirks unknown. **Phase 0 spike required** |

---

## Sources

### HIGH Confidence (Official Documentation, npm verified)
- [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/) -- Oct 2024 stable
- [Tauri Node.js Sidecar Guide](https://v2.tauri.app/learn/sidecar-nodejs/) -- Official SEA sidecar tutorial
- [Tauri Shell Plugin](https://v2.tauri.app/plugin/shell/) -- Sidecar spawn API, permissions
- [Tauri Updater Plugin](https://v2.tauri.app/plugin/updater/) -- Setup, latest.json, signing, JS API
- [Tauri GitHub Actions Guide](https://v2.tauri.app/distribute/pipelines/github/) -- tauri-action@v0 workflow
- [Node.js SEA Documentation](https://nodejs.org/api/single-executable-applications.html) -- Assets, dlopen, caveats
- [@tauri-apps/cli npm v2.10.1](https://www.npmjs.com/package/@tauri-apps/cli)
- [@tauri-apps/api npm v2.10.1](https://www.npmjs.com/package/@tauri-apps/api)
- [@tauri-apps/plugin-shell npm v2.3.5](https://www.npmjs.com/package/@tauri-apps/plugin-shell)
- [@tauri-apps/plugin-updater npm v2.10.0](https://www.npmjs.com/package/@tauri-apps/plugin-updater)
- [@tauri-apps/plugin-process npm v2.3.1](https://www.npmjs.com/package/@tauri-apps/plugin-process)
- [tauri-apps/tauri-action GitHub](https://github.com/tauri-apps/tauri-action)

### MEDIUM Confidence (Official docs + WebSearch)
- [Reown AppKit Overview](https://docs.reown.com/appkit/overview) -- Framework-agnostic, JS/React/Vue
- [Reown AppKit npm v1.8.19](https://www.npmjs.com/package/@reown/appkit)
- [Reown AppKit Web Examples](https://github.com/reown-com/appkit-web-examples) -- Vanilla JS examples
- [Reown AppKit Installation (JS)](https://docs.reown.com/appkit/javascript/core/installation)
- [Node.js 25.5 --build-sea](https://progosling.com/en/dev-digest/2026-01/nodejs-25-5-build-sea-single-executable) -- Context for why postject is being replaced
- [Improving SEA Building (Joyee Cheung)](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/) -- postject deprecation context
- [esbuild native .node modules issue](https://github.com/evanw/esbuild/issues/1051) -- External strategy for native addons
- [Tauri Sidecar Lifecycle Feature Request](https://github.com/tauri-apps/plugins-workspace/issues/3062) -- No official lifecycle plugin yet

### LOW Confidence (Needs Validation)
- @reown/appkit rendering in Tauri WebView (WebKit/WebView2) -- No confirmed reports
- postject on macOS ARM64 CI runners -- Should work (caveat is Linux ARM64 Docker only)
- SEA assets + dlopen for all three native addons simultaneously -- Needs CI matrix validation
