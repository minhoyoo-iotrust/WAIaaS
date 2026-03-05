# Feature Landscape: ERC-8128 Signed HTTP Requests

**Domain:** HTTP message signing for AI agent API authentication using Ethereum wallets
**Researched:** 2026-03-05
**Confidence:** MEDIUM (ERC-8128 is Draft status; RFC 9421 is finalized IETF standard)

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|-------------|-------|
| RFC 9421 Signature-Input + Signature header generation | Core of ERC-8128 spec; without it nothing works | Med | viem signMessage (EIP-191) | Structured Fields encoding (RFC 8941) is the tricky part |
| Content-Digest header (RFC 9530) | Required for POST/PUT body integrity; spec mandates SHA-256 | Low | None (Node.js crypto) | `sha-256=:base64:` format |
| keyid generation (`erc8128:<chainId>:<address>`) | Spec-defined signer identification | Low | Wallet address + chainId | Format may change (see Pitfalls); CAIP-10 variant under discussion |
| Covered Components selection | Agents must specify which HTTP parts to sign | Low | None | @method, @target-uri, @authority, content-digest, content-type, etc. |
| EIP-191 personal_sign signing | EOA signature algorithm specified by ERC-8128 | Low | viem 2.x signMessage | Already used in SIGN pipeline |
| Signature verification (ecrecover round-trip) | Agents need to test/debug their signed requests | Low | viem recoverMessageAddress | Testing/debugging utility, not production auth |
| REST API endpoint (POST /v1/erc8128/sign) | Primary interface for agents to request signatures | Med | Session auth, policy engine | Follows x402 pattern (sign-only, no proxy) |
| ERC8128_ALLOWED_DOMAINS policy | Default-deny domain whitelisting; consistent with WAIaaS security model | Med | Policy engine infrastructure | Reuses X402_ALLOWED_DOMAINS pattern exactly |
| Feature gate (erc8128.enabled) | Admin must opt-in; Draft standard should not be on by default | Low | Admin Settings infrastructure | connect-info capabilities.erc8128Support linked |
| MCP tool (erc8128_sign_request) | AI agents interact via MCP; missing = half the user base blocked | Low | MCP server infrastructure | 1 sign tool minimum |
| SDK method (signHttpRequest) | TypeScript SDK users expect programmatic access | Low | SDK client infrastructure | Type-safe wrapper over REST |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|-------------|-------|
| fetchWithErc8128() SDK helper | One-call sign+fetch eliminates boilerplate; x402 has no equivalent helper | Low | SDK signHttpRequest | sign -> merge headers -> fetch in one call |
| Covered Components presets (minimal/standard/strict) | Agents don't need to know RFC 9421 internals; pick a security level | Low | None | minimal (GET), standard (POST), strict (high-security) |
| Nonce auto-generation + optional disable | Replay protection by default, horizontal scaling flexibility when disabled | Low | None | UUID v4 nonce; `nonce: false` for stateless verifiers |
| TTL-based expiry (default 300s, configurable 10-3600s) | Prevents stale signature reuse without server-side nonce tracking | Low | None | `expires` param in Signature-Input |
| Rate limiting per domain (rate_limit_per_minute) | Prevents runaway agent from spamming signatures to a single domain | Low | In-memory counter | Resets on daemon restart (intentional; no financial risk) |
| Wildcard domain matching (*.example.com) | Convenient for APIs with multiple subdomains (api.openai.com, files.openai.com) | Low | None | Already proven in X402_ALLOWED_DOMAINS |
| Verification REST endpoint (POST /v1/erc8128/verify) | Debug/test tool for agents building ERC-8128 integrations | Low | Verifier module | Not for production auth of WAIaaS itself |
| ERC-8128 + ERC-8004 layered auth narrative | Unique: sign request (8128) -> verify identity (8004) -> check reputation -> authorize | None (docs) | ERC-8004 shipped in v30.8 | Skill file examples showing combined flow |
| Admin UI ERC-8128 section (System page) | Visual toggle/config for non-CLI users | Med | Admin UI infrastructure | 5 settings: enabled, preset, ttl, nonce, algorithm |
| Admin UI ERC8128_ALLOWED_DOMAINS policy form | Tag-based domain list entry with default_deny checkbox | Med | Policy form infrastructure | Clone X402 form pattern |
| Notification events (2 types) | ERC8128_SIGNATURE_CREATED (info/low) + ERC8128_DOMAIN_BLOCKED (security/high) | Low | Notification system | Minimal events; no financial risk so low priority |
| connect-info erc8128Support capability | Agent self-discovery of ERC-8128 availability without trial-and-error | Low | connect-info route | Boolean flag, linked to erc8128.enabled |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| HTTP proxy mode (daemon calls external API on behalf of agent) | Opens external network attack surface on daemon; violates sign-only principle | Return signature headers only; agent calls external API directly (same as x402 pattern) |
| ERC-1271 Smart Contract Account verification | ERC-8128 spec is Draft; SCA signing adds complexity (on-chain isValidSignature call); EOA covers 95%+ of use cases | Support EOA (EIP-191) only; add SCA in a future milestone when spec stabilizes |
| Solana chain support | ERC-8128 is explicitly an Ethereum standard; keyid uses EIP-155 chain IDs | EVM-only; Solana has no equivalent standard |
| Replace WAIaaS API auth with ERC-8128 | WAIaaS uses masterAuth/sessionAuth internally; changing auth model is scope creep | ERC-8128 is for external API calls only |
| Persistent nonce tracking in DB | Adds statefulness for a non-financial operation; in-memory counter resets on restart are acceptable | TTL-based expiry + optional UUID nonce; no DB table needed |
| New discriminatedUnion type for ERC-8128 | ERC-8128 is not a transaction; adding a 6th union type pollutes the pipeline | Dedicated route handler bypasses 6-stage pipeline; policy evaluated directly in handler |
| Full RFC 9421 feature coverage | RFC 9421 is extensive (multiple signers, derived components, request-response binding); ERC-8128 uses a subset | Implement only the ERC-8128 subset: single signer, request-only, standard components |
| Automatic external API key management | Some may want daemon to store/rotate API keys for external services | Out of scope; daemon signs HTTP requests, doesn't manage third-party credentials |

## Feature Dependencies

```
erc8128.enabled (Admin Setting)
  -> POST /v1/erc8128/sign (REST API)
     -> erc8128_sign_request (MCP tool)
     -> signHttpRequest() (SDK method)
        -> fetchWithErc8128() (SDK helper)
  -> POST /v1/erc8128/verify (REST API)
     -> erc8128_verify_signature (MCP tool)
     -> verifyHttpSignature() (SDK method)
  -> connect-info capabilities.erc8128Support

ERC8128_ALLOWED_DOMAINS policy
  -> POST /v1/erc8128/sign (evaluated in route handler)
  -> Admin UI policy form
  -> skills/policies.skill.md update

HTTP Message Signing Engine (packages/core/src/erc8128/)
  -> signature-input-builder.ts (RFC 9421 Structured Fields)
  -> content-digest.ts (RFC 9530 SHA-256)
  -> keyid.ts (erc8128:<chainId>:<address>)
  -> http-message-signer.ts (orchestrates all above)
  -> verifier.ts (ecrecover verification)

Notification Events
  -> ERC8128_SIGNATURE_CREATED (after successful sign)
  -> ERC8128_DOMAIN_BLOCKED (after policy rejection)
```

## MVP Recommendation

Prioritize (Phase 1 - Core Engine + API):
1. HTTP message signing engine (RFC 9421 subset for ERC-8128)
2. REST API endpoint POST /v1/erc8128/sign
3. ERC8128_ALLOWED_DOMAINS policy with default-deny
4. Feature gate erc8128.enabled (default false)
5. Covered Components presets (minimal/standard/strict)

Prioritize (Phase 2 - Full Interface Integration):
1. MCP tools (sign + verify)
2. SDK methods + fetchWithErc8128 helper
3. Verification endpoint POST /v1/erc8128/verify
4. connect-info erc8128Support capability
5. Admin UI settings + policy form
6. Notification events (2 types)
7. Skill file updates

Defer to future milestone:
- ERC-1271 Smart Contract Account signing: Wait for ERC-8128 spec to finalize and SCA signing requirements to stabilize
- Cross-standard middleware (automatic ERC-8128 + ERC-8004 combined header injection): Interesting but premature

## Ecosystem Context

### Competitive Landscape

ERC-8128 is in its early adoption phase. The ecosystem is small but growing:

| Project | Approach | Relationship to ERC-8128 |
|---------|----------|--------------------------|
| **Cloudflare Web Bot Auth** | RFC 9421 + Ed25519 + JWKS directory | Parallel standard; uses RFC 9421 but NOT Ethereum keys. Uses `web-bot-auth` npm package |
| **OpenBotAuth** | RFC 9421 + JWKS for AI crawlers | WordPress plugin + verifier service; no Ethereum connection |
| **Slice.so** | ERC-8128 reference implementation | Original ERC-8128 proposer; Rust crate (v0.1.0) on crates.io |
| **Stytch** | Web Bot Auth verification | Supports Cloudflare's Web Bot Auth for agent verification |
| **Akamai** | Bot authentication | Supports RFC 9421 bot verification |

**Key insight:** The broader HTTP signing ecosystem (Cloudflare, OpenBotAuth, Akamai) is converging on RFC 9421 with Ed25519/JWKS. ERC-8128 differentiates by using Ethereum keys (secp256k1/EIP-191) instead, enabling wallet-native authentication without separate key infrastructure. WAIaaS is well-positioned because it already manages wallet keys.

### Adoption Signals

- **Cloudflare Web Bot Auth**: Production-ready, major CDN support -- but uses Ed25519, not Ethereum
- **ERC-8128**: Draft status, no major API service requires it yet
- **RFC 9421**: Finalized IETF standard, ActivityPub federation already uses it (Misskey)
- **Agent-to-agent authentication**: Emerging use case where ERC-8128 + ERC-8004 combination is unique

### Interoperability Note

WAIaaS should implement the full RFC 9421 subset correctly so that if a server only validates RFC 9421 (without caring about Ethereum keys), the signed request still validates structurally. The ERC-8128 layer adds Ethereum-specific keyid and algorithm on top.

## Sources

- [ERC-8128 EIP (Draft)](https://eip.tools/eip/8128) -- MEDIUM confidence (Draft status)
- [ERC-8128 Discussion -- Ethereum Magicians](https://ethereum-magicians.org/t/erc-8128-signed-http-requests-with-ethereum/27515) -- MEDIUM confidence
- [RFC 9421: HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421) -- HIGH confidence (finalized IETF standard)
- [RFC 9530: Digest Fields](https://www.rfc-editor.org/rfc/rfc9530) -- HIGH confidence (finalized IETF standard)
- [A Review of ERC-8128 -- Four Pillars](https://4pillars.io/en/comments/a-review-of-erc-8128) -- MEDIUM confidence
- [Cloudflare Web Bot Auth](https://blog.cloudflare.com/web-bot-auth/) -- HIGH confidence (production system)
- [OpenBotAuth RFC 9421 Guide](https://openbotauth.com/blog/http-message-signatures-rfc-9421-guide) -- MEDIUM confidence
- [erc8128 Rust crate](https://docs.rs/erc8128/latest/erc8128/) -- LOW confidence (v0.1.0, minimal docs)
- [@misskey-dev/node-http-message-signatures](https://github.com/misskey-dev/node-http-message-signatures) -- MEDIUM confidence (RFC 9421 JS impl)
- [Cloudflare web-bot-auth npm](https://www.npmjs.com/package/web-bot-auth) -- MEDIUM confidence
