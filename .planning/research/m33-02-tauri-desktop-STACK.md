# Technology Stack: Tauri 2 Desktop App

**Project:** WAIaaS Desktop App (m33-02)
**Researched:** 2026-03-31

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tauri | 2.x (latest stable) | Desktop shell, WebView, IPC | Official Rust-based desktop framework. Smaller than Electron (~10MB vs ~150MB). Native WebView per OS. Built-in updater + code signing |
| Rust | 1.80+ | Tauri backend, sidecar manager | Required by Tauri 2. Async with tokio for process management |
| tauri-plugin-shell | 2.x | Sidecar spawning + stdout capture | Official Tauri plugin for external binary management. Provides `sidecar()`, `spawn()`, stdout/stderr channels |
| tauri-plugin-notification | 2.x | OS native notifications | Official plugin. Replaces web Notification API for desktop |
| tauri-plugin-updater | 2.x | Auto-update from GitHub Releases | Built-in signature verification, `latest.json` endpoint |

### Sidecar Build

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| esbuild | 0.24+ | Bundle daemon to single .cjs | Fast, produces single file. Already in project devDeps |
| Node.js SEA | 22.x | Single executable binary | `--experimental-sea-config` converts .cjs to standalone binary. No runtime dependency |
| postject | 1.x | Inject blob into Node binary | Official Node.js tool for SEA resource injection |

### WebView Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @tauri-apps/api | 2.x | JavaScript IPC bridge (`invoke()`) | Official Tauri JS API. Required for WebView->Rust communication |
| Preact | 10.x (existing) | Admin Web UI | Already in use. No change needed |
| @preact/signals | existing | State management | Already in use. No change needed |

### Desktop-Only Features

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @reown/appkit | latest | WalletConnect v2 QR pairing | Official WalletConnect SDK (renamed from @walletconnect/web3modal). Phase 0 spike validates compatibility |

### Build & CI

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @tauri-apps/cli | 2.x | Build + dev commands | `tauri build`, `tauri dev` |
| tauri-action | v0.5+ | GitHub Actions CI | Official action for cross-platform builds. macOS/Windows/Linux matrix |
| Vite | 6.x (existing) | Admin Web UI bundling | Already used. `devUrl` for Tauri dev mode |

### Rust Dependencies (Cargo.toml)

| Crate | Version | Purpose | Why |
|-------|---------|---------|-----|
| tauri | 2.x | Core framework | features: `tray-icon` |
| tauri-plugin-shell | 2.x | Sidecar management | Spawn, kill, stdout parsing |
| tauri-plugin-notification | 2.x | OS notifications | Desktop native alerts |
| tauri-plugin-updater | 2.x | Auto-update | GitHub Releases integration |
| serde | 1.x | Serialization | IPC command args/returns |
| serde_json | 1.x | JSON handling | Status payloads |
| tokio | 1.x | Async runtime | Process management, health polling |
| reqwest | 0.12+ | HTTP client | Health check polling |
| url | 2.x | URL parsing | Dynamic port URL construction |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Desktop framework | Tauri 2 | Electron | 10x larger bundle, ships Chromium, higher memory. WAIaaS already has native Node.js daemon |
| Desktop framework | Tauri 2 | Neutralinojs | Less mature, no built-in updater/code signing, smaller ecosystem |
| Sidecar binary | Node.js SEA | pkg (by Vercel) | pkg is deprecated. SEA is official Node.js feature since v20 |
| Sidecar binary | Node.js SEA | Bun compile | Bun binary is smaller but less tested with native addons (sodium-native, better-sqlite3) |
| WalletConnect | @reown/appkit | Custom WebSocket | More work, less features. Use as Plan B only if appkit fails in WebView |
| IPC typing | Manual wrappers | taurpc | Extra dependency for 7 commands is overkill. Manual wrappers are simple and zero-dep |

## Installation

```bash
# Tauri CLI (project devDep)
pnpm add -D @tauri-apps/cli

# Tauri JavaScript API (admin package optionalDep)
pnpm --filter @waiaas/admin add --save-optional @tauri-apps/api

# WalletConnect (admin package optionalDep)
pnpm --filter @waiaas/admin add --save-optional @reown/appkit

# Rust dependencies (in apps/desktop/src-tauri/Cargo.toml)
# Managed by cargo, no pnpm needed
```

```bash
# SEA build tools (workspace devDeps)
pnpm add -D postject
# esbuild already present
```

## Sources

- [Tauri 2 Official Docs](https://v2.tauri.app/) -- HIGH confidence
- [Tauri 2 Sidecar + Node.js](https://v2.tauri.app/learn/sidecar-nodejs/) -- HIGH confidence
- [Node.js SEA Docs](https://nodejs.org/api/single-executable-applications.html) -- HIGH confidence
- [@reown/appkit](https://docs.reown.com/appkit/overview) -- MEDIUM confidence (WebView compat unverified)
