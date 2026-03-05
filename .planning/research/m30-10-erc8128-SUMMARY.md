# Project Research Summary

**Project:** WAIaaS v30.10 - ERC-8128 Signed HTTP Requests
**Domain:** HTTP message signing (RFC 9421 + Ethereum EIP-191) for AI agent API authentication
**Researched:** 2026-03-05
**Confidence:** MEDIUM (ERC-8128 is Draft EIP; underlying RFCs 9421/9530/8941 are finalized IETF standards)

## Executive Summary

ERC-8128 enables Ethereum wallet-based HTTP request signing by layering EIP-191 secp256k1 signatures on top of the finalized RFC 9421 HTTP Message Signatures standard. For WAIaaS, this means AI agents can cryptographically authenticate their outbound HTTP requests using their existing EVM wallet keys -- no separate key infrastructure needed. The implementation follows the same "sign-only, no proxy" pattern already established by x402 (v1.5.1): the daemon generates signature headers and returns them to the agent, which then makes the external API call directly.

The recommended approach is a self-contained implementation with only one new production dependency (`structured-headers` for RFC 8941 Structured Fields serialization). The RFC 9421 Signature Base construction is ~150 LOC of string manipulation with well-defined rules, making self-implementation preferable to adopting immature or misaligned external libraries. All crypto primitives are already available via viem (EIP-191 signMessage/recoverAddress) and Node.js crypto (SHA-256 for Content-Digest). The architecture bypasses the 6-stage transaction pipeline entirely, using dedicated route handlers with direct policy evaluation -- identical to how x402 signing works.

The primary risk is ERC-8128's Draft status: keyid format (`erc8128:<chainId>:<address>`), algorithm identifier, and nonce requirements may change. This is mitigated by isolating all spec-dependent values into dedicated modules (keyid.ts, constants.ts) so changes require single-file edits. The secondary risk category is RFC 9421 implementation correctness -- LF-only line endings in Signature Base, Structured Fields encoding rules, and Content-Digest byte-level consistency are all areas where subtle bugs cause 100% verification failure with no visible difference in output. Comprehensive test vectors from RFC 9421 Appendix B and strict use of the `structured-headers` library eliminate these risks.

## Key Findings

### Recommended Stack

Only one new production dependency is needed. The rest leverages existing WAIaaS infrastructure.

**Core technologies:**
- `structured-headers` (v2.0.2): RFC 8941 Structured Fields serialization -- required for Signature-Input/Signature header encoding. 573K weekly npm downloads, 0 dependencies, HTTP WG official test suite passing.
- `viem 2.x` (existing): EIP-191 signMessage() and recoverAddress() -- provides all crypto primitives for ERC-8128 signing and verification.
- Node.js `crypto` (built-in): SHA-256 hashing for RFC 9530 Content-Digest -- 3 lines of code, no external package needed.
- Self-implementation for RFC 9421 Signature Base: ~150 LOC string manipulation. Existing libraries are either Draft-based, lack secp256k1 support, or are unpublished on npm.

**Not adopted:** `@slicekit/erc8128` (reference only, npm unpublished, 0.x), `http-message-signatures` (Draft 13 basis, needs secp256k1 adapter), `@misskey-dev/node-http-message-signatures` (Ed25519/RSA only).

### Expected Features

**Must have (table stakes):**
- RFC 9421 Signature-Input + Signature header generation with EIP-191 signing
- Content-Digest header (RFC 9530, SHA-256)
- REST API endpoint POST /v1/erc8128/sign
- ERC8128_ALLOWED_DOMAINS policy (default-deny, domain whitelist)
- Feature gate erc8128.enabled (default false, Admin Settings)
- MCP tool erc8128_sign_request
- SDK method signHttpRequest()
- Signature verification endpoint POST /v1/erc8128/verify

**Should have (differentiators):**
- `fetchWithErc8128()` SDK helper -- one-call sign+fetch eliminates boilerplate
- Covered Components presets (minimal/standard/strict) -- agents pick security level without knowing RFC 9421
- Nonce auto-generation with optional disable
- TTL-based expiry (default 300s)
- Rate limiting per domain (in-memory, DX convenience)
- Admin UI settings section + policy form
- connect-info erc8128Support capability
- Notification events (ERC8128_SIGNATURE_CREATED, ERC8128_DOMAIN_BLOCKED)

**Defer (future milestone):**
- ERC-1271 Smart Contract Account verification -- wait for spec stabilization
- Cross-standard middleware (automatic ERC-8128 + ERC-8004 combined headers)

**Anti-features (do NOT build):**
- HTTP proxy mode -- violates sign-only principle
- Solana chain support -- ERC-8128 is EVM-only by definition
- New discriminatedUnion type -- ERC-8128 is not a transaction
- Persistent nonce tracking in DB -- overkill for non-financial operation
- Full RFC 9421 feature coverage -- implement only the ERC-8128 subset

### Architecture Approach

ERC-8128 follows the x402 precedent: dedicated route handlers that bypass the 6-stage transaction pipeline, with policy evaluation called directly from the handler. The signing engine is a self-contained module tree under `packages/core/src/erc8128/` with clear separation of concerns.

**Major components:**
1. `http-message-signer.ts` -- Orchestrator: coordinates Content-Digest, Signature-Input construction, Signature Base assembly, and EIP-191 signing
2. `signature-input-builder.ts` -- RFC 9421 Signature Base string construction + RFC 8941 Structured Fields serialization via `structured-headers`
3. `content-digest.ts` -- RFC 9530 SHA-256 Content-Digest generation (Node.js crypto)
4. `keyid.ts` -- ERC-8128 keyid format generation/parsing (isolated for spec change resilience)
5. `verifier.ts` -- Signature verification via ecrecover + Signature Base reconstruction
6. Route handler (daemon) -- POST /v1/erc8128/sign and /verify with session auth + feature gate + domain policy
7. ERC8128_ALLOWED_DOMAINS policy -- Reuses x402 domain matching pattern with shared utility function

### Critical Pitfalls

1. **RFC 9421 Signature Base LF-only requirement** -- CRLF in Signature Base causes 100% verification failure. Force `.replace(/\r\n/g, '\n')` normalization; test with hex dump for 0x0d byte absence.
2. **Newline injection in component values** -- Unvalidated `\n` in header values enables Signature Wrapping Attack. Reject (not strip) any component value containing newline characters.
3. **Structured Fields manual serialization** -- Hand-crafting Signature-Input strings will produce encoding errors (quoting, escaping, spacing rules). Use `structured-headers` library exclusively; never concatenate strings manually.
4. **Content-Digest byte consistency** -- Content-Digest must hash the exact bytes that will be transmitted. Accept body as already-serialized string; SDK helper must serialize body before both signing and sending.
5. **ERC-8128 Draft spec instability** -- keyid format, algorithm ID, nonce requirements may change. Isolate all spec-dependent values in constants.ts and keyid.ts modules.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: HTTP Message Signing Engine
**Rationale:** Foundation -- every other feature depends on the signing engine being correct. RFC 9421 Signature Base construction is the hardest part and must be validated against test vectors before building API routes.
**Delivers:** Core signing engine modules (http-message-signer, signature-input-builder, content-digest, keyid, verifier, types, constants)
**Addresses:** RFC 9421 Signature-Input/Signature generation, Content-Digest, keyid, EIP-191 signing, verification
**Avoids:** Pitfalls 1-6 (LF/CRLF, newline injection, Structured Fields encoding, EIP-191 byte length, Content-Digest consistency, incomplete covered components)

### Phase 2: REST API + Policy + Verification
**Rationale:** API routes are the primary interface and must be paired with policy evaluation. Domain policy shares logic with x402 so they should be implemented together to extract the shared utility immediately.
**Delivers:** POST /v1/erc8128/sign, POST /v1/erc8128/verify, ERC8128_ALLOWED_DOMAINS policy, feature gate, Covered Components presets, nonce/TTL configuration
**Uses:** Signing engine from Phase 1, existing session auth, policy engine infrastructure
**Avoids:** Pitfalls 12 (pipeline bypass), 17 (x402 code duplication), 18 (Solana wallet rejection)

### Phase 3: MCP + SDK + Admin UI + Skill Files
**Rationale:** Once API is stable, extend to all interface surfaces. MCP tools, SDK methods, and Admin UI can be built in parallel since they all wrap the REST API.
**Delivers:** MCP tools (sign + verify), SDK methods (signHttpRequest, verifyHttpSignature, fetchWithErc8128), Admin UI settings + policy form, connect-info capability, notification events (2 types), skill file updates
**Avoids:** Pitfall 19 (fetchWithErc8128 body stream exhaustion -- string-only body type)

### Phase Ordering Rationale

- **Engine before API:** The signing engine must produce RFC 9421-compliant output verified against test vectors before any API surface exposes it. A buggy engine behind a working API is worse than no API.
- **API + Policy together:** The domain policy is trivially thin (clone x402 pattern) but must be present from day one due to default-deny security model. Shipping API without policy violates WAIaaS security principles.
- **Interfaces last:** MCP, SDK, Admin UI are thin wrappers over the REST API. Building them after the API stabilizes avoids rework. They can be parallelized since they are independent.
- **Draft spec isolation throughout:** keyid.ts and constants.ts are created in Phase 1 and referenced everywhere, ensuring spec changes propagate from a single source.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Engine):** RFC 9421 Section 2.5 Signature Base construction rules are precise and non-obvious. The @slicekit/erc8128 reference implementation should be studied alongside the RFC. Test vectors from RFC 9421 Appendix B are essential for validation.

Phases with standard patterns (skip research-phase):
- **Phase 2 (API + Policy):** Direct clone of x402 patterns (dedicated route, domain policy, feature gate). Well-established in WAIaaS codebase.
- **Phase 3 (Interfaces):** MCP tool, SDK method, Admin UI section all follow existing patterns with no novel elements.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 1 new dependency (structured-headers, 573K downloads). All other primitives already in project. Clear rationale for rejecting alternatives. |
| Features | MEDIUM | Table stakes are clear from spec. Differentiators are well-scoped. Anti-features are decisive. However, ERC-8128 ecosystem adoption is near-zero, so "what users expect" is partially speculative. |
| Architecture | HIGH | x402 precedent provides proven pattern. Pipeline bypass is a sound decision. Component boundaries are clean and well-justified. |
| Pitfalls | HIGH | 19 pitfalls identified with concrete prevention strategies. RFC 9421 pitfalls are well-documented in the RFC itself. Integration pitfalls leverage WAIaaS-specific knowledge. |

**Overall confidence:** MEDIUM -- The implementation approach is high-confidence (proven patterns, finalized RFCs, minimal new dependencies), but ERC-8128's Draft status introduces spec instability risk that cannot be fully mitigated by engineering. The keyid format and nonce requirements may change before finalization.

### Gaps to Address

- **ERC-8128 keyid format finalization:** Currently `erc8128:<chainId>:<address>`, but CAIP-10 variant under discussion. Monitor Ethereum Magicians thread. Mitigated by keyid.ts isolation.
- **Nonce mandatory vs optional:** Community discussing making nonce optional for stateless verifiers. Current implementation: mandatory by default, configurable to disable. No action needed until spec changes.
- **No real-world ERC-8128 verifier to test against:** No production API service currently requires ERC-8128. Verification is self-contained (round-trip test only). This is acceptable for a Draft-stage feature behind a feature gate.
- **Shared domain matching utility:** x402 domain matching logic should be extracted to a shared utility during Phase 2, but the existing x402 code must be verified for compatibility first.

## Sources

### Primary (HIGH confidence)
- [RFC 9421: HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421) -- Signature Base construction, security considerations
- [RFC 9530: Digest Fields](https://www.rfc-editor.org/rfc/rfc9530) -- Content-Digest format and empty body handling
- [RFC 8941/9651: Structured Field Values](https://www.rfc-editor.org/rfc/rfc8941) -- Serialization rules for Signature-Input/Signature headers
- [EIP-191: Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191) -- Message length encoding rules
- [structured-headers npm](https://www.npmjs.com/package/structured-headers) -- 573K weekly downloads, HTTP WG test suite

### Secondary (MEDIUM confidence)
- [ERC-8128 EIP (Draft)](https://eip.tools/eip/8128) -- keyid format, algorithm definition
- [ERC-8128 Discussion (Ethereum Magicians)](https://ethereum-magicians.org/t/erc-8128-signed-http-requests-with-ethereum/27515) -- Ongoing spec discussion
- [A Review of ERC-8128 (Four Pillars)](https://4pillars.io/en/comments/a-review-of-erc-8128) -- Ecosystem analysis
- [Cloudflare Web Bot Auth](https://blog.cloudflare.com/web-bot-auth/) -- Parallel standard using RFC 9421 + Ed25519
- [OpenBotAuth RFC 9421 Guide](https://openbotauth.com/blog/http-message-signatures-rfc-9421-guide) -- Implementation reference

### Tertiary (LOW confidence)
- [@slicekit/erc8128 (GitHub)](https://github.com/slice-so/erc8128) -- Reference implementation, npm unpublished, 0.2.0
- [erc8128 Rust crate](https://docs.rs/erc8128/latest/erc8128/) -- v0.1.0, minimal docs

---
*Research completed: 2026-03-05*
*Ready for roadmap: yes*
