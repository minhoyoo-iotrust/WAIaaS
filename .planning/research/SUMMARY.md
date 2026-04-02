# Project Research Summary

**Project:** WAIaaS - XRP Ledger (Ripple) Mainnet Support (m33-06)
**Domain:** 3rd ChainType integration into existing multi-chain AI Agent Wallet-as-a-Service
**Researched:** 2026-04-03
**Confidence:** HIGH

## Executive Summary

XRP Ledger integration into WAIaaS follows a clean additive pattern: add `'ripple'` as the 3rd `ChainType` alongside `'ethereum'` and `'solana'`, implement a new `@waiaas/adapter-ripple` package with a single `xrpl` npm dependency (v4.6.0, XRPLF official), and extend SSoT enum arrays in `@waiaas/shared`. The existing `IChainAdapter` interface covers ~21 of 25 methods directly; 4 are thrown as NOT_SUPPORTED because XRPL has no smart contracts, no batch transactions, no NFT approval mechanism, and full-sweep is blocked by the reserve system. The pipeline remains completely chain-agnostic — zero stage modifications needed.

The recommended approach is: extend SSoT enums first (shared → core → DB migration v62), then implement `@waiaas/adapter-ripple`, then wire into `AdapterPool` and `KeyStore` in the daemon. Key generation reuses the existing `sodium-native` Ed25519 path identical to Solana; only the address derivation differs (`0xED`-prefixed public key → RIPEMD-160 → Base58Check r-address via `ripple-keypairs.deriveAddress()`). The `xrpl.Client` uses WebSocket as its primary transport, which requires explicit reconnection management unlike the HTTP-based EVM and Solana adapters.

The primary risks cluster around XRPL-specific concepts absent in EVM/Solana: the reserve system (base 1 XRP + 0.2 XRP per owned object) must be reflected in `getBalance()` as an `available` field or AI agents will generate transfer failures; the Destination Tag field is separate from `memo` and its omission silently loses funds at exchanges; Trust Lines require `tfSetNoRipple` flag on all `TrustSet` transactions to prevent unintended rippling; and all transactions must include `LastLedgerSequence` (via `autofill()`) to avoid permanent pending states. These are correctness requirements, not edge cases — each must be addressed in Phase 1 of implementation.

## Key Findings

### Recommended Stack

The entire XRPL integration requires one new npm package: `xrpl@^4.6.0`. This is the official XRPLF TypeScript SDK and internally bundles `ripple-keypairs` (address derivation), `ripple-address-codec` (Base58Check), and `ripple-binary-codec` (transaction serialization). No additional libraries are needed. The existing `sodium-native` continues to handle Ed25519 key generation (same as Solana), `xrpl` handles address derivation and RPC interaction, and `viem`/`@solana/kit` are untouched.

**Core technologies:**
- `xrpl@^4.6.0`: XRPL WebSocket client, transaction building, signing, and address derivation — the only new dependency
- `sodium-native` (existing): Ed25519 key generation, reused identically from the Solana path
- `ripple-keypairs` (bundled in `xrpl`): `deriveAddress()` for r-address from `0xED`-prefixed public key
- `drizzle` + SQLite (existing): DB migration v62 adding `'ripple'` to CHECK constraints on 4 tables

**Critical version note:** xrpl versions 4.2.1–4.2.4 were compromised in a supply chain attack (April 2025). Use v4.6.0 (released 2025-02-12) which is confirmed safe. Never lock to any version in the 4.2.1–4.2.4 range.

### Expected Features

**Must have (table stakes):**
- XRP native transfer (Payment TX) with drops unit and Destination Tag support
- Reserve-aware balance query — `available = total - (base_reserve + owner_count * owner_reserve)`
- Fee estimation via `fee` RPC command (dynamic, typically 10–12 drops)
- Sequence number management via `account_info` (analogous to EVM nonce)
- Transaction simulation (dry-run via `autofill` + `submit({fail_hard: false})`)
- Transaction finality confirmation polling until `validated: true` or LastLedgerSequence exceeded
- Trust Line token transfer (IOU Payment with `{currency, issuer, value}` Amount object)
- Trust Line setup / TrustSet mapped to `buildApprove()` — always with `tfSetNoRipple` flag
- Asset listing: native XRP + Trust Lines via `account_lines`
- Ed25519 key generation + r-address derivation (KeyStore extension)
- CAIP-2/CAIP-19 identifiers: `xrpl:0/1/2`, `slip44:144`, `token:{currency}.{issuer}`, `xls20:{id}`
- DB migration v62 (CHECK constraints expanded on 4 tables + ENVIRONMENT_NETWORK_MAP)
- REST/MCP/SDK routing for `chain=ripple`

**Should have (differentiators):**
- Reserve-aware balance with detailed `reserved` breakdown in API response (base + owner * N objects)
- X-address automatic parsing to r-address + embedded Destination Tag extraction
- XLS-20 NFT transfer (2-step CreateOffer + AcceptOffer) returning `pending_accept` status with offer ID
- Trust Line dual currency code format (3-char ISO vs 40-char hex) transparent handling
- WebSocket reconnection manager with exponential backoff and request concurrency limit (max 10)

**Defer to later milestones:**
- XRPL DEX (OfferCreate/OfferCancel) — m33-08
- XRPL AMM (XLS-30) — m33-10
- Incoming transaction monitoring (IChainSubscriber XRPL impl) — separate milestone
- RPC Pool multi-endpoint failover — separate milestone
- Payment Channels, Escrow, Checks, Hooks (niche or unavailable on mainnet)

### Architecture Approach

The integration is purely additive: `@waiaas/adapter-ripple` is a new package following the `@waiaas/adapter-solana` / `@waiaas/adapter-evm` pattern. SSoT enum arrays in `@waiaas/shared` are extended first, propagating automatically to Zod schemas, DB CHECK constraints, and UI dropdowns. `AdapterPool` gets one new `chain === 'ripple'` branch using dynamic import. `KeyStore.generateKeyPair()` adds a `chain === 'ripple'` branch that is near-identical to the Solana path. The pipeline stages require zero changes because they dispatch through `IChainAdapter` polymorphically.

**Major components:**
1. `@waiaas/adapter-ripple` — new package; `RippleAdapter` implements `IChainAdapter`; `xrpl.Client` WebSocket management; address derivation utilities; 21 implemented + 4 NOT_SUPPORTED methods
2. `@waiaas/shared` SSoT extension — `CHAIN_TYPES`, `NETWORK_TYPES`, `RIPPLE_NETWORK_TYPES`, `ENVIRONMENT_NETWORK_MAP` additions; single point of change for all downstream validation
3. `@waiaas/core` CAIP maps — `xrpl:0/1/2` to network mapping, CAIP-19 `slip44:144`/`token:{}.{}`/`xls20:{}` asset IDs; existing regex already compatible with XRPL formats
4. `@waiaas/daemon` KeyStore — `generateRippleEd25519KeyPair()` method (sodium-native key gen + ripple-keypairs address derivation); KeystoreFileV1 `curve: 'ed25519'` field already supports ripple
5. `@waiaas/daemon` DB migration v62 — `wallets`, `incoming_transactions`, `defi_positions`, `nft_metadata_cache` CHECK constraint expansion using existing table-recreate pattern

### Critical Pitfalls

1. **Reserve calculation error in getBalance()** — Returning only `balance` without subtracting base reserve (1 XRP) + owner reserves (0.2 XRP per owned object) causes AI agents to generate `tecINSUFFICIENT_XRP` failures. Reserve values must be queried dynamically from `server_info` — hardcoded values broke in December 2024 when reserves were lowered. Prevention: add `available` field to `BalanceInfo`; query `validated_ledger.reserve_base_xrp` and `reserve_inc_xrp` from `server_info` with 5-minute cache.

2. **Destination Tag omission** — Sending XRP to an exchange address without a Destination Tag causes the exchange to be unable to credit the correct user account; funds are not automatically recoverable. Prevention: add `destinationTag?: number` to `TransferRequest`; auto-parse X-addresses to extract embedded tags; pre-check `RequireDest` flag on recipient account.

3. **Trust Line rippling** — Omitting `tfSetNoRipple` from `TrustSet` transactions allows the account to act as an intermediary in cross-user payments, causing unintended balance changes. Prevention: always include `Flags: TrustSetFlags.tfSetNoRipple` in `buildApprove()`.

4. **LastLedgerSequence not set** — Transactions without `LastLedgerSequence` remain permanently pending in congestion scenarios, blocking all subsequent transactions on the same account. Prevention: always use `autofill()` which automatically sets `LastLedgerSequence = current_ledger + 20`.

5. **WebSocket connection instability** — xrpl.js `Client` has known issues with concurrent requests (100+ causes `DisconnectedError`) and reconnection loops after network interruptions. Prevention: wrap `Client` in a `RippleConnectionManager` with exponential backoff, limit concurrent requests to 10, and handle `disconnected` events explicitly.

6. **drops unit confusion** — XRP uses drops (1 XRP = 1,000,000 drops; 6 decimals), but IOU amounts use decimal strings. Mixing them causes 1,000,000x over/under payment. Prevention: register `ripple: 6` in `NATIVE_DECIMALS` SSoT; always use `autofill()` for Fee field; validate that all API amounts for native XRP are in drops.

## Implications for Roadmap

Based on combined research, the natural build order follows the dependency chain identified in ARCHITECTURE.md and the feature dependencies in FEATURES.md.

### Phase 1: SSoT Extension + DB Migration
**Rationale:** All downstream code (adapter, daemon, UI) derives from enum arrays and Zod schemas. Extending SSoT first means DB CHECK constraints, Zod validators, and CAIP maps are all correct before any adapter code is written. DB v62 must exist before any `chain='ripple'` rows can be inserted.
**Delivers:** `'ripple'` recognized as valid chain across all validation layers; DB accepts ripple wallets; CAIP-2 `xrpl:0/1/2` and CAIP-19 `slip44:144`/`token:{}.{}` identifiers functional
**Addresses:** DB migration table stake, CAIP standard compliance
**Avoids:** Cascading validation failures if adapter is wired before SSoT is extended

### Phase 2: Adapter Package + Core Transaction Methods
**Rationale:** Core infrastructure (connect, getBalance with reserve, estimateFee, getCurrentNonce, buildTransaction, simulateTransaction, signTransaction, submitTransaction, waitForConfirmation) is the foundation for all subsequent features. The reserve-calculation pitfall and LastLedgerSequence pitfall must be resolved here — not deferred. WebSocket connection manager must be built here, not retrofitted.
**Delivers:** Functional XRP native transfers end-to-end; `@waiaas/adapter-ripple` package with CI and tests; KeyStore `generateRippleEd25519KeyPair()` method; AdapterPool `chain === 'ripple'` branch; Destination Tag support in TransferRequest
**Uses:** `xrpl@^4.6.0`, `sodium-native` (existing), `ripple-keypairs.deriveAddress()`
**Avoids:** Reserve calculation errors (Pitfall 1), Destination Tag omission (Pitfall 2), LastLedgerSequence missing (Pitfall 4), WebSocket instability (Pitfall 5), drops unit confusion (Pitfall 6)

### Phase 3: Trust Line Token Support
**Rationale:** Trust Lines are XRPL's token model — analogous to ERC-20 but fundamentally different. This phase adds `buildApprove()` (TrustSet with mandatory `tfSetNoRipple`), `buildTokenTransfer()` (IOU Payment), `getAssets()` (XRP + Trust Lines), and `getTokenInfo()`. The rippling pitfall is resolved here through enforced flag inclusion.
**Delivers:** Full Trust Line token lifecycle (set Trust Line → transfer IOU → query assets); currency code dual-format handler (3-char ISO vs 40-char hex); Trust Line pre-validation (freeze check, receiver Trust Line existence check)
**Avoids:** Rippling pitfall (Pitfall 3); Trust Line deletion when balance > 0; `tecPATH_DRY` errors from missing receiver Trust Line

### Phase 4: NFT + Integration Completeness
**Rationale:** XLS-20 NFT support and the full cross-interface wiring (REST API, MCP, SDK, Admin UI, skill files) complete the milestone scope. NFT is a differentiator, not table stakes, so it follows core functionality. Interface wiring is bundled here because it is mostly automatic once SSoT is extended.
**Delivers:** XLS-20 NFT transfer (2-step CreateOffer + AcceptOffer with `pending_accept` status and offer ID); `chain=ripple` support across REST/MCP/SDK; Admin UI wallet creation with Ripple chain option; Trust Line display; skill file for AI agents explaining XRPL concepts; sign-only external transaction support (`parseTransaction` + `signExternalTransaction`)
**Avoids:** NFT 2-step async pitfall (explicit `pending_accept` return, mandatory Expiration on offers); Destination-less NFT offer sniping (always set `Destination` on NFT offers)

### Phase Ordering Rationale

- SSoT first because `CHAIN_TYPES` drives CHECK constraints, Zod discriminatedUnion members, and CAIP namespace lookups — building the adapter before SSoT creates ordering bugs that mask real failures
- Reserve + LastLedgerSequence + WebSocket reconnection addressed in Phase 2 (not deferred) because they are correctness requirements; deferring them means all subsequent testing is on a broken foundation
- Trust Lines before NFT because owner reserve tracking (required for NFT reserve understanding) is established in Phase 3, and Trust Line is table stakes while NFT is a differentiator
- Interface wiring (REST/MCP/SDK/Admin UI) is bundled with Phase 4 rather than Phase 2 because the integration is largely automatic via SSoT; main manual work is Admin UI Ripple-specific components and skill file prose

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (WebSocket connection manager):** xrpl.js has known GitHub issues with reconnection (Issue #1185). The implementation strategy for `RippleConnectionManager` (concurrency limit of 10, backoff algorithm, client instance recycling on irrecoverable loop) warrants a pre-implementation spike before committing to a specific design.
- **Phase 3 (currency code dual format + CAIP-19):** The 3-char ISO vs 40-char hex encoding for IOU currency codes has edge cases in CAIP-19 asset ID formatting. The `parseAssetId()` function in `asset-resolve.ts` needs verification with real Trust Line data against a live testnet node.
- **Phase 4 (NFT auto-accept within same WAIaaS instance):** Auto-chaining sell offer + accept when both wallets are in the same WAIaaS instance is not documented in xrpl.js. Needs implementation research before coding.

Phases with standard patterns (skip additional research):
- **Phase 1 (SSoT + DB migration):** Exact table-recreate pattern used 15+ times in prior milestones (v61-v70.ts). CHECK constraint expansion is well-established.
- **Phase 2 (KeyStore extension):** `generateRippleEd25519KeyPair()` is structurally identical to `generateEd25519KeyPair()` with one `deriveAddress()` call added. No unknowns.
- **Phase 4 (REST/MCP/SDK wiring):** SSoT-driven routing is automatic once `CHAIN_TYPES` is extended. AdapterPool branch + rpcConfigKey mapping are thin mechanical changes.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `xrpl@^4.6.0` npm-verified; XRPLF official SDK; TypeDoc and source confirmed for key APIs (Wallet constructor, deriveAddress, autofill, submitAndWait) |
| Features | HIGH | All feature decisions backed by official XRPL documentation; CAIP-2/19 namespaces from chainagnostic.org official specs; existing CAIP-19 regex confirmed compatible |
| Architecture | HIGH | Integration pattern directly mirrors existing adapter packages; existing codebase files verified by reading (adapter-pool.ts, keystore.ts, stage5-execute.ts, network-map.ts) |
| Pitfalls | HIGH | Reserve values confirmed from December 2024 amendment; xrpl.js issues from GitHub Issues tracker; supply chain advisory from XRPLF official blog |

**Overall confidence:** HIGH

### Gaps to Address

- **Trust Line freeze state detection:** `buildTokenTransfer()` should pre-check freeze status via `account_lines` before submitting. The exact `account_lines` response fields for frozen Trust Lines need validation against a live testnet node during Phase 3 implementation.
- **CAIP-19 `token:` namespace spelling:** One minor inconsistency in PITFALLS.md suggests `trustline:` format; ARCHITECTURE.md and official chainagnostic.org spec both use `token:`. The official spec (`token:{CURRENCY}.{ISSUER}`) is authoritative.
- **DB migration v62 network-column constraints:** ARCHITECTURE.md identifies 4 tables with `chain` CHECK constraints. Network-column constraints (where they exist separately) need a complete scan of schema-ddl.ts during Phase 1 — research identified the pattern but did not enumerate all affected columns exhaustively.
- **`simulate` RPC command availability in xrpl v4.6.0:** ARCHITECTURE.md notes using `submit({fail_hard: false})` for dry-run as the primary approach. Whether the `simulate` command is available and stable in v4.6.0 should be confirmed during Phase 2 implementation.

## Sources

### Primary (HIGH confidence)
- [xrpl npm package v4.6.0](https://www.npmjs.com/package/xrpl) — version confirmation, TypeScript SDK
- [xrpl.js Wallet class API](https://js.xrpl.org/classes/Wallet.html) — constructor signature, Ed25519 default
- [ripple-keypairs (GitHub)](https://github.com/XRPLF/xrpl.js/tree/main/packages/ripple-keypairs) — `deriveAddress()` function
- [XRPL Cryptographic Keys](https://xrpl.org/docs/concepts/accounts/cryptographic-keys) — Ed25519 `0xED` prefix format
- [XRPL Addresses](https://xrpl.org/docs/concepts/accounts/addresses) — r-address derivation algorithm
- [XRPL Reserves](https://xrpl.org/docs/concepts/accounts/reserves) — base reserve + owner reserve system
- [Lower Reserves Dec 2024](https://xrpl.org/blog/2024/lower-reserves-are-in-effect) — current reserve values (1 XRP base, 0.2 XRP owner)
- [XRPL CAIP-2 Namespace](https://namespaces.chainagnostic.org/xrpl/caip2) — `xrpl:0` mainnet, `xrpl:1` testnet, `xrpl:2` devnet
- [XRPL CAIP-19 Assets](https://namespaces.chainagnostic.org/xrpl/caip19) — `slip44:144`, `token:{}.{}`, `xls20:{}`
- [TrustSet Transaction](https://xrpl.org/docs/references/protocol/transactions/types/trustset) — Trust Line setup + NoRipple flag
- [Trust Line Tokens](https://xrpl.org/docs/concepts/tokens/fungible-tokens/trust-line-tokens) — IOU token model + rippling mechanism
- [Non-Fungible Tokens](https://xrpl.org/docs/concepts/tokens/nfts) — XLS-20 NFT overview
- [NFTokenCreateOffer](https://xrpl.org/docs/references/protocol/transactions/types/nftokencreateoffer) — NFT offer creation
- [NFTokenAcceptOffer](https://xrpl.org/docs/references/protocol/transactions/types/nftokenacceptoffer) — NFT offer acceptance
- [Reliable Transaction Submission](https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission) — LastLedgerSequence pattern
- [Transaction Cost](https://xrpl.org/docs/concepts/transactions/transaction-cost) — fee model (drops)
- [Partial Payments](https://xrpl.org/docs/concepts/payment-types/partial-payments) — `delivered_amount` security
- [Source and Destination Tags](https://xrpl.org/docs/concepts/transactions/source-and-destination-tags) — Destination Tag uint32

### Secondary (MEDIUM confidence)
- [xrpl.js GitHub Issue #1185](https://github.com/XRPLF/xrpl.js/issues/1185) — WebSocket reconnection loop bug
- [xrpl.js GitHub Issue #903](https://github.com/XRPLF/xrpl.js/issues/903) — 100+ concurrent requests disconnect
- [xrpl.js Supply Chain Advisory](https://xrpl.org/blog/2025/vulnerabilitydisclosurereport-bug-apr2025) — v4.2.1–4.2.4 compromised, v4.6.0 safe
- Existing codebase: `adapter-pool.ts`, `keystore.ts`, `stage5-execute.ts`, `network-map.ts`, `networks.ts` — verified by reading

---
*Research completed: 2026-04-03*
*Ready for roadmap: yes*
