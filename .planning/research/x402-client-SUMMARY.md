# Research Summary: x402 Client Integration

**Domain:** x402 HTTP-native payment protocol client support for WAIaaS daemon
**Researched:** 2026-02-15
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

x402 is an open payment protocol (x402 Foundation, originated at Coinbase) that leverages the HTTP 402 "Payment Required" status code to enable stablecoin micropayments directly over HTTP. The protocol has processed over 100M payments since May 2025 and received a major v2 upgrade in January 2026. WAIaaS will act as an x402 **client (buyer)**, enabling AI agents to access paid APIs and services by automatically handling the 402 payment handshake using the wallet's signing capability.

The integration creates a new `POST /v1/x402/fetch` endpoint that acts as a payment-capable HTTP proxy. When an agent requests a paid resource, the daemon: (1) validates the URL against SSRF rules and a domain allowlist, (2) makes a preflight request to discover payment requirements, (3) evaluates the payment against wallet spending policies, (4) signs an EIP-3009 authorization (gasless, off-chain), (5) retries the request with the payment signature, and (6) returns the proxied response to the agent. This is architecturally modeled after the existing sign-only pipeline -- a standalone module that reuses policy evaluation infrastructure without extending the 6-stage transaction pipeline.

The key architectural decisions are: (a) separate pipeline module rather than extending the 6-stage pipeline, because x402 is fundamentally an HTTP proxy flow, not a blockchain transaction submission; (b) reuse of `evaluateAndReserve()` for SPENDING_LIMIT with TOCTOU prevention; (c) domain allowlist via SettingsService with default deny, consistent with WAIaaS security posture; (d) DELAY/APPROVAL tiers rejected immediately (synchronous flow cannot wait minutes); (e) X402_PAYMENT as a new transaction type for audit trail, not as a new discriminatedUnion variant.

The primary risks are SSRF (WAIaaS's first feature with user-specified outbound URLs), double payment under concurrent requests (mitigated by evaluateAndReserve), and private key lifecycle management during signing (mitigated by established decrypt-use-release pattern).

## Key Findings

**Stack:** Use @x402/evm for EIP-3009 signing (official SDK), @x402/fetch for types only. Do NOT use wrapFetchWithPayment() -- WAIaaS needs control between preflight and payment for policy evaluation.

**Architecture:** Create a standalone x402 pipeline module (like sign-only.ts) with 10 steps. Reuse evaluateAndReserve() for SPENDING_LIMIT. Add X402_PAYMENT to TRANSACTION_TYPES. No new DB tables needed.

**Critical pitfall:** SSRF is the highest-priority security concern. This is WAIaaS's first feature where the daemon makes outbound HTTP requests to user-controlled URLs. Must implement DNS resolution check with private IP blocking, HTTPS-only, domain allowlist.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Phase A: Core Infrastructure** - Foundation types, SSRF guard, DB migration
   - Addresses: X402_PAYMENT type, error codes, SSRF utility, migration v12, Zod schemas
   - Avoids: Building on unstable foundation; SSRF guard must exist before any HTTP proxy capability
   - Estimated: ~15 requirements

2. **Phase B: Payment Signing + Pipeline** - x402 signing and 10-step pipeline
   - Addresses: @x402/evm integration, x402 pipeline module, payment signing, policy evaluation integration
   - Avoids: Incomplete signing implementation; EIP-3009 is x402-specific, not reusable from IChainAdapter
   - Estimated: ~20 requirements

3. **Phase C: API Surface + Integration** - REST route, Admin UI, MCP, SDK
   - Addresses: POST /v1/x402/fetch route, Admin settings panel, MCP tool, SDK method, skill file
   - Avoids: Exposing half-built features; route depends on pipeline being fully tested
   - Estimated: ~15 requirements

**Phase ordering rationale:**
- Phase A has no external package dependencies (pure types, utilities, DB)
- Phase B depends on Phase A types + @x402/evm npm install
- Phase C depends on Phase B pipeline being testable and stable
- SSRF guard MUST be in Phase A (security prerequisite for Phase B preflight fetch)
- SDK/MCP come last in Phase C because REST API must stabilize first

**Research flags for phases:**
- Phase B: Needs verification of @x402/evm lower-level API surface (x402Client.createPaymentPayload). LOW confidence on exact API -- verify with Context7 or package README at implementation time.
- Phase B: EIP-3009 signing requires constructing proper EIP-712 typed data. @x402/evm should handle this, but verify the signer interface matches viem's Account type.
- Phase A: DB migration v12 (CHECK constraint recreation) needs careful testing with existing data. Standard pattern from v6b migration applies.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | @x402/evm is the official SDK, viem already a dependency, Node.js 22 native fetch |
| Features | HIGH | Table stakes are clear from protocol spec; differentiators informed by existing architecture |
| Architecture | MEDIUM-HIGH | Pipeline separation pattern proven by sign-only.ts; x402 library API details need verification at implementation time |
| Pitfalls | HIGH | SSRF is well-documented (OWASP); TOCTOU pattern proven; key management pattern established |

## Gaps to Address

- **@x402/evm API surface verification**: The exact lower-level API (createPaymentPayload vs other methods) needs verification with the actual package at implementation time. Training data may be stale on the v2 SDK API.
- **SVM (Solana) x402 support**: Deferred. @x402/svm exists but the Solana x402 scheme may differ from EVM's EIP-3009. Research needed when SVM support is prioritized.
- **Facilitator selection**: Coinbase provides a free facilitator with 1000 tx/month free tier. Whether to make the facilitator URL configurable or hardcode the Coinbase default needs a product decision.
- **x402 payment scheme beyond "exact"**: The x402 v2 spec supports multiple schemes (exact, upto). Only "exact" is implemented initially. Future schemes may need different signing logic.
- **Response streaming**: Current design loads entire response body into memory. For large paid resources (e.g., AI model weights), streaming support may be needed in a future phase.
- **Multi-scheme/multi-network selection logic**: When a PaymentRequired contains multiple accepts entries across different networks and schemes, the selection algorithm needs careful design (prefer wallet's chain, prefer cheapest, prefer fastest settlement).
