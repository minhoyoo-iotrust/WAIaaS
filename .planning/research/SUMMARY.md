# Project Research Summary

**Project:** WAIaaS CAIP-19 Asset Identification (m27-02)
**Domain:** Multi-chain asset identification standard integration into existing wallet infrastructure
**Researched:** 2026-02-22
**Confidence:** HIGH

## Executive Summary

WAIaaS currently fragments token identification across multiple representations: `{address, decimals, symbol}` + `chain` in transaction requests, `${chain}:${address}` as price oracle cache keys, `(network, address)` as the token registry primary index, and a partial CAIP-2 mapping already used for x402 and WalletConnect. This fragmentation directly causes the inability to resolve L2 token prices (Polygon USDC, Arbitrum USDC) because the oracle cannot distinguish same-address tokens deployed on different EVM chains. CAIP-19 (`chainId/namespace:reference`) is the industry-standard solution, with the ChainAgnostic Improvement Proposals providing exact specifications for all 13 WAIaaS networks across both Solana and EVM chains.

The recommended approach is a custom ~240 LOC CAIP module (`packages/core/src/caip/`) with zero new npm dependencies. All four evaluated external libraries were rejected: the leading `caip` npm package (v1.1.1) has an incorrect regex that omits `.` and `%` from `asset_reference`, is effectively unmaintained (last real update 2022), and uses an OOP API incompatible with WAIaaS's Zod SSoT discipline; `@shapeshiftoss/caip` is 4.36 MB and drags in axios; the remaining two candidates are pre-release (v0.1.x) with no track record. The implementation consolidates the existing `CAIP2_TO_NETWORK` map from `x402.types.ts` into the new module, eliminating duplication between x402 types and the WalletConnect session service. All integration points use optional additive fields, preserving backward compatibility for all existing SDK and MCP consumers.

The highest-risk area is not the CAIP parser itself (trivial string manipulation) but the transition layer: EVM address case normalization must happen at CAIP construction time or cache misses and policy bypass vulnerabilities emerge; the DB migration that auto-populates `asset_id` must enumerate all 13 networks correctly or produce silent data corruption; and the policy engine must handle all four address/assetId matching combinations or a silent security regression occurs. A 4-phase build order — Core CAIP module, Oracle/TokenRef, DB/Registry/Schema, Pipeline/Policy/API/MCP — mirrors the natural dependency chain and isolates risk at each step.

## Key Findings

### Recommended Stack

Zero new npm dependencies are required. The custom `caip/` module uses the existing Zod 3.x infrastructure for schema validation via two regex-based schemas (`Caip2Schema`, `Caip19AssetTypeSchema`). The CAIP-19 spec's exact regexes have been verified against the official ChainAgnostic standards site and differ meaningfully from what the `caip` npm package implements (the npm package incorrectly uses `[-a-zA-Z0-9]` for `asset_reference`, missing `.` and `%`). The existing CoinGecko platform ID map (`coingecko-platform-ids.ts`) needs to be extended with 4 L2 mainnet entries keyed by CAIP-2 chain ID rather than by chain type string.

**Core technologies:**
- Custom `packages/core/src/caip/` module (5 files, ~240 LOC): CAIP-2 and CAIP-19 parsing/formatting — zero-dependency, spec-compliant, integrates with Zod SSoT. Existing `parseCaip2()` in `x402.types.ts` is the proof-of-concept foundation.
- Zod 3.x (existing): CAIP URI validation — regex-based schemas maintain the Zod SSoT derivation chain (Zod -> TS -> OpenAPI -> Drizzle).
- `coingecko-platform-ids.ts` (extend existing): L2 price oracle mapping — extend with `polygon-pos`, `arbitrum-one`, `optimistic-ethereum`, `base` platform IDs keyed by CAIP-2 string.

### Expected Features

**Must have (table stakes) — 19 features total:**
- CAIP-2 parser/formatter (generalize existing `parseCaip2()` from x402.types.ts, add `formatCaip2()`)
- CAIP-19 parser/formatter with spec-compliant regex including `.` and `%` in `asset_reference`
- Zod validation schemas `Caip2Schema` and `Caip19AssetTypeSchema`
- Consolidated NetworkType <-> CAIP-2 bidirectional map (eliminate x402 + WC session service duplicates)
- `nativeAssetId(network)`, `tokenAssetId(network, address)`, `isNativeAsset()` helpers
- EVM address lowercase normalization at CAIP-19 construction (Solana MUST NOT be lowercased — base58 is case-sensitive)
- TokenRef extension with optional `assetId` and `network` fields
- Price oracle cache key migration to CAIP-19 format (network-aware, atomic with PYTH_FEED_IDS update)
- CoinGecko L2 platform ID mapping for all 5 EVM mainnets
- Token registry DB migration v22 with `asset_id` column and application-level backfill
- Transaction request `assetId` optional field with Stage 1 extraction and cross-validation against `address`
- ALLOWED_TOKENS policy: `assetId` support in rules and 4-scenario evaluation logic
- MCP tools: `assetId` parameter on `send_token`, `approve_token`, `get_token_balance`
- SDK (TS + Python): optional `assetId` field support
- Skills files: CAIP-19 documentation for AI agents

**Should have (differentiators — highest priority first):**
- L2 token price resolution — the primary business value: Polygon USDC, Arbitrum USDC, Base USDC prices now resolvable via CoinGecko L2 platform mapping
- CAIP-19 policy scoping — closes L2 address collision security gap (same USDC address on Ethereum vs Polygon treated as distinct assets)
- `assetId` -> auto-extraction of `{address, chain, network}` — superior DX: AI agent sends one field instead of four
- x402 + WalletConnect CAIP-2 code consolidation — maintenance debt elimination, single SSoT

**Defer to follow-up:**
- ActionProvider CAIP-19 input standard (no current ActionProvider to retrofit; define interface now, implement later)
- Incoming TX `asset_id` column backfill (minor enhancement, quick follow-up task after v27.1 known gap STO-03 resolution)
- Admin UI CAIP-19 display (low priority vs API/MCP consumers)
- NFT support (erc721, nft namespace) — explicitly out of scope for fungible-asset wallet

### Architecture Approach

The integration is a widening operation: a single new module (`packages/core/src/caip/`) becomes the canonical identification layer, and 14 existing files are modified to flow `assetId`/`network` context through the stack. The caip module has clean internal dependency ordering (caip2 -> caip19 -> network-map -> asset-helpers -> index) with no circular dependencies. The existing CAIP-2 foundation in `x402.types.ts` is re-exported from the new module for backward compatibility, eliminating duplication without breaking existing imports. The adapter layer (SolanaAdapter, EvmAdapter) is intentionally not touched — CAIP-19 is resolved to raw `{address, chain}` before reaching adapters, preserving their single responsibility.

**Major components:**
1. `packages/core/src/caip/` (NEW, 5 files, ~240 LOC) — canonical CAIP-2/19 parsing, formatting, validation, and network mapping; consolidates existing x402.types.ts maps
2. Price oracle chain (MODIFY 4 files: `price-cache.ts`, `coingecko-platform-ids.ts`, `coingecko-oracle.ts`, `oracle-chain.ts`) — TokenRef gains `network`, cache keys become CAIP-19, CoinGecko platform map gains 4 L2 entries
3. DB migration v22 + token registry (MODIFY 3 files: `schema.ts`, `migrate.ts`, `token-registry-service.ts`) — `asset_id` column with application-level backfill for all 13 networks
4. Schema extensions (MODIFY 2 files: `transaction.schema.ts`, `policy.schema.ts`) — optional `assetId` on `TokenInfoSchema` and `AllowedTokensRulesSchema`
5. Pipeline/policy/API/MCP/SDK/Skills (MODIFY 7+ files) — optional `assetId` integration at all consumer-facing touch points
6. x402.types.ts + wc-session-service.ts (MODIFY 2 files) — re-export from caip/ module, eliminating duplication

**Key patterns to follow:**
- Optional field with priority resolution: `assetId` takes priority when present; legacy `address`+`chain` path unchanged when absent
- Cache key migration via volatile cache: in-memory cache clears on restart, so format changes require no data migration
- DB column addition with application-level backfill: SELECT + loop + UPDATE in migration runner (follows established v6b pattern)

### Critical Pitfalls

1. **EVM address case normalization (C-01, CRITICAL)** — EVM addresses must be lowercased at `formatCaip19()` / `tokenAssetId()` construction time. The existing codebase already lowercases in `price-cache.ts:38-41`, `coingecko-oracle.ts:67`, and `database-policy-engine.ts:927`. If CAIP-19 strings are constructed with EIP-55 checksum addresses (mixed case) but compared against lowercase cache keys, cache misses and policy bypass vulnerabilities emerge. Prevention: canonicalize when `chainNamespace === 'eip155'` in the formatter; never compare raw CAIP-19 strings.

2. **Solana base58 must never be lowercased (C-02, CRITICAL)** — Base58 is case-sensitive: lowercasing `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (USDC mint) produces an invalid and different address. Prevention: branch on CAIP-2 namespace — lowercase only when `namespace === 'eip155'`; add explicit "NEVER lowercase Solana addresses" comment; existing security test `policy-bypass-attacks.security.test.ts:313` documents this exact scenario.

3. **Policy evaluation 4-scenario correctness (C-03, CRITICAL)** — During the dual-support period, the policy engine encounters four matching combinations: (address policy, address tx), (address policy, assetId tx), (assetId policy, address tx), (assetId policy, assetId tx). Missing any scenario creates a default-deny bypass security gap. Prevention: normalize both policy rule and transaction to a `(chain, network, address)` tuple before comparison; 16+ test cases minimum for ALLOWED_TOKENS alone.

4. **DB migration auto-population errors (C-04, CRITICAL)** — The migration SQL CASE statement must enumerate all 13 networks explicitly. A missing branch silently produces NULL or wrong `asset_id` values. After the unique index is created, wrong values cause constraint violations on future inserts. CAIP-2 mapping lives in JavaScript, not SQL — use application-level SELECT + loop + UPDATE (established WAIaaS pattern from migration v6b). Prevention: write a TypeScript round-trip verification test after migration runs; handle NULLs gracefully for any unmappable rows.

5. **Price oracle cache key atomic switchover (C-05, CRITICAL)** — Changing `buildCacheKey()` from `${chain}:${address}` to CAIP-19 format orphans `PYTH_FEED_IDS` map keys (currently `solana:native`, `ethereum:0x...`). Prevention: update `buildCacheKey()`, `PYTH_FEED_IDS`, and `COINGECKO_PLATFORM_MAP` in the same Phase 2 commit. The cache is volatile (in-memory only, clears on restart) so no persistent data migration is needed; a daemon restart after deploy is sufficient.

## Implications for Roadmap

Based on research, the natural dependency chain drives a 4-phase build order. Every subsequent phase imports from the caip module, so Phase 1 is an unblockable prerequisite. The oracle changes (Phase 2) are independent of the DB changes (Phase 3), but both must be complete before Phase 4 pipeline integration can be tested end-to-end.

### Phase 1: Core CAIP Module + Network Map Consolidation

**Rationale:** Every other phase depends on `packages/core/src/caip/`. Build this first with comprehensive unit tests so downstream phases have a reliable, independently-verified foundation. Consolidating `CAIP2_TO_NETWORK` from x402 and WC in this phase prevents duplication drift (Pitfall L-06) and makes the SSoT canonical from the start.

**Delivers:** `caip2.ts` (parser/formatter/Zod schema), `caip19.ts` (parser/formatter/Zod schema with spec-compliant `.%` in asset_reference), `network-map.ts` (consolidated 13-network bidirectional map), `asset-helpers.ts` (`nativeAssetId`, `tokenAssetId`, `isNativeAsset`, `extractAddress`, `resolveAssetId`), `index.ts` (barrel export). Modified files: `x402.types.ts` (re-export from caip/), `wc-session-service.ts` (import from caip/), `price-oracle.types.ts` (optional `assetId` + `network` on TokenRef).

**Addresses (from FEATURES.md):** All 7 table-stakes parser/formatter/schema/map features; x402 + WC code consolidation differentiator; TokenRef extension.

**Avoids (from PITFALLS.md):** C-01 (EVM lowercase at construction), C-02 (Solana preservation via namespace branch), M-01 (spec-compliant regex including `_` in CAIP-2 reference and `.%` in CAIP-19 reference), M-02 (use `token` namespace for both SPL and Token-2022), L-05 (slip44 native asset convention with ETH=60, SOL=501), L-06 (x402 duplication eliminated via re-export).

### Phase 2: Oracle L2 Support + Cache Key Migration

**Rationale:** The primary business value of this milestone is L2 token price resolution. This phase activates that capability immediately after the CAIP module is available. Cache key migration is isolated here because it is volatile (no persistent data risk). The atomic switchover requirement (C-05) means all oracle touch points must land in one commit.

**Delivers:** Extended `coingecko-platform-ids.ts` with 5 CAIP-2 keyed mainnet entries (`polygon-pos`, `arbitrum-one`, `optimistic-ethereum`, `base`, `solana`), updated `buildCacheKey()` producing CAIP-19 format when network context is available with legacy fallback, updated `PYTH_FEED_IDS` keys to CAIP-19 format, `coingecko-oracle.ts` passing `token.network` for L2 platform resolution, `oracle-chain.ts` and `resolve-effective-amount-usd.ts` propagating `network` through TokenRef.

**Uses (from STACK.md):** `coingecko-platform-ids.ts` extended with CAIP-2 keyed entries; Zod SSoT for platform map type safety.

**Implements (from ARCHITECTURE.md):** Price oracle chain component modifications; `getCoinGeckoPlatform(chain, network?)` signature change.

**Avoids (from PITFALLS.md):** C-05 (atomic cache key + PYTH_FEED_IDS + CoinGecko map update in single commit), M-05 (CoinGecko L2 platform IDs must be added in this phase — not deferred — or the primary goal fails).

### Phase 3: DB Migration v22 + Token Registry + Schema Extensions

**Rationale:** DB migration is the highest-risk persistent operation and needs the CAIP module (Phase 1) to run the application-level backfill. Completing schema extensions here ensures the pipeline/policy changes in Phase 4 have stable Zod schemas to build against.

**Delivers:** DB migration v22 (`asset_id TEXT` column on `token_registry` + application-level backfill for all 13 networks + unique index after population), updated Drizzle schema (`schema.ts`), `token-registry-service.ts` returning `assetId` in responses, `TokenInfoSchema` with optional `assetId` field (`transaction.schema.ts`), `AllowedTokensRulesSchema` with optional `assetId` field (`policy.schema.ts`), REST API token responses including `assetId`.

**Addresses (from FEATURES.md):** Token registry DB migration with asset_id column, transaction request assetId field, REST API response assetId fields, ALLOWED_TOKENS schema extension.

**Avoids (from PITFALLS.md):** C-04 (exhaustive 13-network application-level backfill, TypeScript round-trip verification test after migration, NULL for unmappable rows), L-01 (no extra `.max()` constraint — Zod regex handles 178-char spec maximum), L-04 (incoming_transactions NULL token_address -> native CAIP-19 in backfill).

### Phase 4: Pipeline Integration + Policy Engine + API + MCP + SDK + Skills

**Rationale:** Integration layer that ties all prior phases together. Must come last because it depends on extended Zod schemas (Phase 3), CAIP module (Phase 1), and network-aware TokenRef (Phase 2). This phase carries the highest security risk and requires the policy evaluation 4-scenario test matrix to be completed and passing before merge.

**Delivers:** Updated `database-policy-engine.ts` with 4-scenario ALLOWED_TOKENS matching (assetId-priority, address fallback, cross-validation between rule and transaction), updated `stages.ts` extracting `assetId` from transaction request into `TransactionParam`, MCP tool updates (`send_token`, `approve_token`, `get_token_balance` accepting optional `assetId`), SDK TS standalone types updated with optional `assetId` on `AssetInfo`/`TokenInfo`/`TransactionResponse`, Python SDK updated, skills file documentation (CAIP-19 format, assetId vs token precedence rules for AI agents).

**Addresses (from FEATURES.md):** ALLOWED_TOKENS assetId support in policy evaluation, Pipeline Stage 1 assetId extraction, MCP tool assetId parameters, SDK support, skills files.

**Avoids (from PITFALLS.md):** C-03 (4-scenario policy evaluation matrix with 16+ test cases; normalize to tuple before comparison), M-04 (CAIP-19 policies fix L2 address collision — document as security improvement, not breaking change), M-06 (additive fields only, snapshot tests for all API response types), L-02 (SDK standalone types updated with optional assetId — no core dependency introduced), L-03 (clear assetId > token precedence rule in MCP tools with consistency validation).

### Phase Ordering Rationale

- Phase 1 is the prerequisite for all others — no imports before the module exists, no Zod schemas before `Caip19Schema` is defined.
- Phase 2 before Phase 3 because oracle changes are independent and deliver the primary business value faster; demonstrating L2 price resolution early validates the entire approach.
- Phase 3 before Phase 4 because the pipeline and policy changes require the extended Zod schemas (`TokenInfoSchema.assetId`, `AllowedTokensRulesSchema.assetId`) and the DB `asset_id` column to be in place for meaningful end-to-end testing.
- Phase 4 last because it is the integration test surface — all components must be complete to write meaningful E2E tests including the 4-scenario policy evaluation matrix.
- This ordering matches the recommendation in both FEATURES.md (Phases 1-3) and ARCHITECTURE.md (Phases 1-4 with identical rationale).
- Estimated scope: ~920 LOC implementation + ~600 LOC tests = ~1,500 LOC total across 5 new files and 14 modified files.

### Research Flags

Phases with well-documented patterns (skip research-phase):
- **Phase 1 (Core CAIP Module):** Spec is fully verified at standards.chainagnostic.org. Implementation is straightforward string manipulation + Zod regex. All code patterns follow established WAIaaS conventions. No further research needed.
- **Phase 3 (DB Migration):** Application-level backfill pattern established in existing migration v6b. DB schema changes (ALTER TABLE ADD COLUMN) are well-understood in the WAIaaS migration system. No further research needed.
- **Phase 4 (Pipeline/Policy/SDK/Skills):** All modification patterns (optional Zod fields, pipeline stage extraction, SDK type updates, MCP tool parameter addition) follow established WAIaaS codebase patterns. No further research needed.

Phases needing runtime validation during implementation:
- **Phase 2 — CoinGecko L2 platform IDs (MEDIUM confidence):** Platform IDs `polygon-pos`, `arbitrum-one`, `optimistic-ethereum`, `base` are documented in CoinGecko API docs but not directly tested. During Phase 2 implementation, verify with a live `GET /api/v3/asset_platforms` call before hardcoding the map. STACK.md explicitly flags this as MEDIUM confidence.
- **Phase 4 — MCP tool parameter interaction:** The interaction between legacy `token` parameter and new `assetId` parameter needs review against actual agent query patterns before finalizing the precedence and error messaging in tools.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All 4 library candidates evaluated via npm registry + source code inspection + spec cross-reference. Custom implementation decision is unambiguous. Zero new dependencies confirmed. One MEDIUM item: CoinGecko L2 platform IDs verified via docs but not live API call. |
| Features | HIGH | All 19 table-stakes features traced to official CAIP specs and verified against existing codebase patterns. Differentiator features validated against actual code gaps (coingecko-platform-ids.ts comment explicitly says "L2 out of scope"). Anti-features have clear rationale. |
| Architecture | HIGH | 19 files identified (5 new, 14 modified) via direct codebase analysis. Dependency graph verified with no circular dependencies. Migration approach follows established WAIaaS v6b pattern confirmed in migrate.ts. Component boundaries are non-overlapping. |
| Pitfalls | HIGH | 5 critical and 6 moderate pitfalls each traced to specific file/line numbers in codebase (e.g., C-01 traces to price-cache.ts:38-41, coingecko-oracle.ts:67, database-policy-engine.ts:927). CAIP spec regex inconsistencies verified against official specifications. Security test at policy-bypass-attacks.security.test.ts:313 confirms C-02 is real. |

**Overall confidence:** HIGH

### Gaps to Address

- **CoinGecko L2 platform IDs (MEDIUM):** `polygon-pos`, `arbitrum-one`, `optimistic-ethereum`, `base` are documented in CoinGecko API docs but not live-tested. During Phase 2 implementation, make one `GET /api/v3/asset_platforms` call to confirm exact platform ID strings before hardcoding the map. Handle gracefully if any ID differs.

- **Token-2022 CAIP-19 namespace (MEDIUM):** The Solana CAIP-19 spec uses `token` namespace for fungible assets without explicitly addressing Token-2022. Community consensus is that Token-2022 tokens use the same `token` namespace since both programs use mint accounts as identifiers. This is the correct approach but not formally spec-documented — monitor the CASA Solana namespace registry for any update before implementation completes.

- **Polygon native asset (MATIC/POL):** Polygon uses `slip44:966` (MATIC/POL coin type) as its native asset, unlike other EVM L2s that use `slip44:60` (ETH). The `nativeAssetId()` helper must have a lookup table that correctly maps `polygon-mainnet` to `slip44:966` and `polygon-amoy` to `slip44:966`. Confirm this edge case is handled in the `NATIVE_SLIP44` map within `asset-helpers.ts`.

- **PYTH_FEED_IDS key format during Phase 2:** The existing `pyth-feed-ids.ts` uses `solana:native` and `ethereum:0x...` style keys. These must be updated to CAIP-19 format in the same commit as `buildCacheKey()` changes. This is required by C-05 (atomic switchover) and must be explicitly tracked during Phase 2 implementation — it is easy to miss this file when updating the oracle chain.

## Sources

### Primary (HIGH confidence)
- [CAIP-2 Specification](https://standards.chainagnostic.org/CAIPs/caip-2) — namespace regex `[-a-z0-9]{3,8}`, reference regex `[-_a-zA-Z0-9]{1,32}` (note: underscore included)
- [CAIP-19 Specification](https://standards.chainagnostic.org/CAIPs/caip-19) — asset_type format, asset_reference regex `[-.%a-zA-Z0-9]{1,128}` (note: period and percent included)
- [CAIP-20 SLIP44 Namespace](https://standards.chainagnostic.org/CAIPs/caip-20) — ETH coin type 60, SOL coin type 501
- [Solana CAIP-19 Namespace](https://namespaces.chainagnostic.org/solana/caip19) — `token` namespace for SPL + Token-2022, mint address as reference
- [Solana CAIP-2 Namespace](https://namespaces.chainagnostic.org/solana/caip2) — genesis hash truncated to 32 chars for mainnet/devnet/testnet
- [EIP-155 CAIP-19 Namespace](https://namespaces.chainagnostic.org/eip155/caip19) — `erc20` namespace, 0x-prefixed 40-char address
- [SLIP-0044 Registry](https://github.com/satoshilabs/slips/blob/master/slip-0044.md) — ETH=60, SOL=501, MATIC=966
- WAIaaS codebase (direct inspection): `x402.types.ts` (CAIP2_TO_NETWORK 13 entries), `price-cache.ts` (buildCacheKey format), `coingecko-platform-ids.ts` (2-entry map with L2 TODO comment), `coingecko-oracle.ts` (getPrice address handling), `database-policy-engine.ts` (ALLOWED_TOKENS evaluation lines 892-938), `schema.ts` (token_registry + incoming_transactions), `migrate.ts` (v6b application-level backfill pattern), `token-registry-service.ts`, `transaction.schema.ts`, `policy.schema.ts`, `sdk/types.ts`, `policy-bypass-attacks.security.test.ts:313`

### Secondary (MEDIUM confidence)
- [CoinGecko Asset Platforms API](https://docs.coingecko.com/reference/asset-platforms-list) — `polygon-pos`, `arbitrum-one`, `optimistic-ethereum`, `base` platform IDs (documented, not live-tested)
- [WalletConnect Pay](https://docs.walletconnect.network/payments/wallet-implementation) — CAIP-19 asset format in payment requests (confirms ecosystem adoption)
- [caip npm package](https://www.npmjs.com/package/caip) — v1.1.1, evaluated and rejected: incorrect `asset_reference` regex missing `.%`, OOP API incompatible with Zod SSoT, near-zero maintenance velocity
- [@shapeshiftoss/caip npm](https://www.npmjs.com/package/@shapeshiftoss/caip) — v8.16.7, evaluated and rejected: 4.36 MB unpacked, axios runtime dependency

### Tertiary (informational)
- [Solana Testnet Restart 2024-01-02](https://github.com/anza-xyz/agave/wiki/2024%E2%80%9001%E2%80%9002-Testnet-Rollback-and-Restart) — confirms devnet/testnet genesis hash instability risk (Pitfall M-03)
- [EIP-55 Checksum Address Encoding](https://eips.ethereum.org/EIPS/eip-55) — mixed-case checksum scheme (relevant to C-01 normalization decision)
- [Axelar CREATE2 Cross-Chain Tutorial](https://www.axelar.network/blog/same-address-cross-chain-tutorial) — same address on different EVM chains (explains M-04 address collision pitfall)

---
*Research completed: 2026-02-22*
*Ready for roadmap: yes*
