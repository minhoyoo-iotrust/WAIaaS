# Technology Stack: x402 Client Integration

**Project:** WAIaaS x402 Client Support
**Researched:** 2026-02-15

## Recommended Stack

### Core x402 Libraries

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@x402/evm` | latest (v2) | EVM payment signing (EIP-3009 transferWithAuthorization) | Official x402 SDK for EVM scheme, handles EIP-712 typed data signing, maintained by x402 Foundation |
| `@x402/svm` | latest (v2) | Solana payment signing (future phase) | Official x402 SDK for SVM scheme. Defer to Phase 2 if SVM support needed |
| `@x402/fetch` | latest (v2) | x402Client class + PaymentRequired/PaymentPayload types | Import types and x402Client for createPaymentPayload(). Do NOT use wrapFetchWithPayment() |
| `@x402/core` | latest (v2) | Core types (PaymentRequired, PaymentPayload, PaymentRequirements) | Shared type definitions across x402 packages |

### Existing Stack (No Changes)

| Technology | Version | Purpose | Why Already Suitable |
|------------|---------|---------|---------------------|
| `viem` | 2.x | EVM signing infrastructure | @x402/evm uses viem internally; already a WAIaaS dependency |
| `zod` | 4.x | Request/response schema validation | SSoT pattern, x402 request schemas follow existing pattern |
| `@hono/zod-openapi` | 0.x | OpenAPI route definitions | POST /v1/x402/fetch route follows existing pattern |
| `better-sqlite3` | latest | DB transactions (BEGIN IMMEDIATE for evaluateAndReserve) | TOCTOU prevention already works for x402 |
| `drizzle-orm` | latest | ORM for transactions table INSERT/UPDATE | Existing schema handles X402_PAYMENT type |
| `sodium-native` | latest | Key management (decryptPrivateKey, releaseKey) | Same key lifecycle as sign-only pipeline |

### Node.js Built-in Modules

| Module | Purpose | Why |
|--------|---------|-----|
| `node:net` (isIP) | SSRF guard: detect IP addresses as hostnames | Built-in, no dependency needed |
| `node:dns/promises` | SSRF guard: DNS resolution for private IP detection | Built-in, async DNS resolution |
| `node:crypto` | Base64 encoding for PAYMENT-SIGNATURE header | Built-in |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| x402 SDK | @x402/evm (lower-level API) | wrapFetchWithPayment (@x402/fetch) | No insertion point for policy evaluation, key management, SSRF guard between preflight and payment |
| x402 SDK | @x402/evm (official) | Manual EIP-3009 signing with viem | Re-implementing protocol-specific signing logic that @x402/evm already handles correctly; maintenance burden |
| SSRF protection | Built-in DNS check + IP blocklist | ssrf-req-filter npm package | Additional dependency for simple functionality; built-in approach is more transparent and WAIaaS-specific |
| HTTP client | Node.js native fetch | axios, got, undici | Node.js 22 has native fetch with full API; no dependency needed. @x402/axios exists but we don't use axios |
| x402 payment type | Reuse transactions table | New x402_payments table | Fragments audit trail, breaks evaluateAndReserve reservation query |

## Installation

```bash
# New x402 dependencies (daemon package)
cd packages/daemon
npm install @x402/evm @x402/fetch @x402/core

# Optional: SVM support (defer to future phase)
# npm install @x402/svm

# No additional dev dependencies needed
```

## Version Compatibility Notes

- **x402 v2**: The x402 ecosystem recently upgraded from v1 to v2 (January 2026). v2 uses standardized headers (PAYMENT-REQUIRED, PAYMENT-SIGNATURE, PAYMENT-RESPONSE) instead of v1's deprecated X-* headers. The SDK is backward compatible with v1 servers.
- **viem 2.x**: @x402/evm depends on viem 2.x which is already a WAIaaS dependency via @waiaas/adapter-evm. No version conflict expected.
- **Node.js 22**: Native fetch API is stable. Used for outbound HTTP requests (preflight + payment retry). No polyfill needed.

## Sources

- [@x402/evm npm](https://www.npmjs.com/package/@x402/evm) -- HIGH confidence
- [@x402/fetch npm](https://www.npmjs.com/package/@x402/fetch) -- HIGH confidence
- [@x402/core npm](https://www.npmjs.com/package/@x402/core) -- HIGH confidence
- [x402 GitHub examples/typescript/clients](https://github.com/coinbase/x402/tree/main/examples/typescript/clients) -- HIGH confidence
- [x402 v2 migration guide](https://docs.cdp.coinbase.com/x402/migration-guide) -- MEDIUM confidence
