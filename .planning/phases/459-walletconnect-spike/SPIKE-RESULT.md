# WalletConnect Spike Result

**Date:** 2026-03-31
**Decision:** PENDING (manual verification required before Phase 462)

## Test Environment
- Tauri version: 2.x (@tauri-apps/cli 2.10.1, @tauri-apps/api 2.10.1)
- @reown/appkit version: 1.7.x (installed: 1.7.8 via appkit-ui)
- OS: macOS 26.3.1 arm64
- WebView engine: WebKit (macOS)
- Rust: 1.94.0

## Project Setup Verification

| Check | Result | Notes |
|-------|--------|-------|
| Tauri 2 project scaffolding | PASS | `pnpm tauri info` succeeds |
| @reown/appkit installed | PASS | appkit + solana-adapter + wagmi-adapter |
| CSP configured | PASS | relay.walletconnect.com, rpc.walletconnect.com, pulse.walletconnect.org, web3modal domains |
| Vite dev server config | PASS | port 1420, host: true |
| TypeScript compiles | PASS | No type errors in main.ts |

## Test Results (Awaiting Manual Verification)

| Test | Result | Notes |
|------|--------|-------|
| w3m-button rendering | PENDING | Requires `pnpm tauri dev` |
| QR code display | PENDING | Requires valid projectId from Reown Cloud |
| WebSocket relay connection | PENDING | CSP allows wss://relay.walletconnect.com |
| CSP violations | PENDING | May need additional domains at runtime |
| QR scan pairing | PENDING | Requires mobile wallet (Phantom/MetaMask) |
| SIWS signature (Solana) | PENDING | Requires Phantom mobile |
| SIWE signature (EVM) | PENDING | Requires MetaMask mobile |

## CSP Configuration

Current CSP in `tauri.conf.json`:
```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
connect-src 'self' wss://relay.walletconnect.com https://rpc.walletconnect.com https://pulse.walletconnect.org https://*.infura.io https://*.alchemy.com https://api.web3modal.org https://api.web3modal.com;
img-src 'self' data: https:;
font-src 'self' data:;
frame-src https://secure.walletconnect.com https://secure.web3modal.com
```

**Known potential CSP additions needed at runtime:**
- `https://explorer-api.walletconnect.com` (wallet explorer)
- `https://keys.walletconnect.com` (key server)
- Additional Reown Cloud API domains

## How to Complete Verification

1. Get projectId from https://cloud.reown.com/
2. Create `packages/desktop-spike/.env` with `VITE_WC_PROJECT_ID=xxx`
3. Run `cd packages/desktop-spike && pnpm tauri dev`
4. Verify w3m-button renders, QR displays, pairing works
5. Test SIWS/SIWE signing with mobile wallet
6. Update this document with actual results
7. Set Decision to GO / PARTIAL-GO / NO-GO

## Decision Rationale

Spike infrastructure is ready. The Tauri project compiles, CSP is pre-configured for WalletConnect domains, and @reown/appkit is integrated with both Solana and EVM adapters. Manual verification with `pnpm tauri dev` is required to confirm WebView compatibility.

**Key risk areas:**
- Lit-based Web Components (@reown/appkit uses lit) may have WebKit shadow DOM quirks
- WebSocket upgrade in WebKit may behave differently than Chromium
- WASM modules in appkit may need `'wasm-unsafe-eval'` (already configured)

## Impact on Phase 462

- **If GO:** Phase 462 uses @reown/appkit as-is. Integrate directly into Admin Web UI with `isDesktop()` guard.
- **If PARTIAL-GO:** Document CSP fixes, adapter workarounds. Apply fixes before Phase 462 starts.
- **If NO-GO:** Switch to Plan B (WC Relay WebSocket direct connection). Phase 462 plan must be rewritten to use `@walletconnect/core` + `@walletconnect/sign-client` directly instead of @reown/appkit UI components.
