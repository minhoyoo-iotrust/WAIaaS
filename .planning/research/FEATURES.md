# Feature Landscape: CAIP-19 Asset Identification Standard

**Domain:** CAIP-19 Asset Identification for WAIaaS (m27-02)
**Researched:** 2026-02-22
**Confidence:** HIGH (official CAIP specs verified, existing x402 codebase cross-referenced)

---

## Context

WAIaaS identifies tokens/assets differently across contexts: transaction requests use `{ address, decimals, symbol }` + `network`, the price oracle cache uses `${chain}:${address}`, the token registry uses `(network, address)` unique index, ALLOWED_TOKENS policy uses `tokens[].address` with optional `chain`, and x402 already uses partial CAIP-2 (`CAIP2_TO_NETWORK` 13 entries). This fragmentation prevents L2 token price resolution and creates ambiguity when the same contract address exists on multiple EVM chains.

**Existing foundations (already built):**
- `CAIP2_TO_NETWORK` / `NETWORK_TO_CAIP2` bidirectional mapping (13 entries) in `packages/core/src/interfaces/x402.types.ts`
- `parseCaip2(caip2Network)` function with namespace/reference extraction
- `resolveX402Network(caip2)` chain+network resolution
- `CAIP2_CHAIN_IDS` in WC session service for WalletConnect v2 pairing
- `TokenRefSchema` with `{ address, symbol, decimals, chain }` (no `network` field)
- `buildCacheKey(chain, address)` -> `${chain}:${normalizedAddress}`
- `AllowedTokensRules` with `tokens: Array<{ address: string }>` (no chain/network scoping)
- 13 NetworkType values: 3 Solana (`mainnet`, `devnet`, `testnet`) + 10 EVM

---

## Verified CAIP Standard Reference

### CAIP-2 Chain IDs for WAIaaS 13 Networks (HIGH confidence)

Verified against official ChainAgnostic namespace specs and existing codebase `CAIP2_TO_NETWORK`.

| WAIaaS NetworkType | CAIP-2 Chain ID | Source |
|--------------------|-----------------|--------|
| `mainnet` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | ChainAgnostic/namespaces/solana/caip2 |
| `devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | ChainAgnostic/namespaces/solana/caip2 |
| `testnet` | `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z` | ChainAgnostic/namespaces/solana/caip2 |
| `ethereum-mainnet` | `eip155:1` | EIP-155, ChainAgnostic/namespaces/eip155/caip2 |
| `ethereum-sepolia` | `eip155:11155111` | ethereum-lists/chains |
| `polygon-mainnet` | `eip155:137` | ethereum-lists/chains |
| `polygon-amoy` | `eip155:80002` | ethereum-lists/chains |
| `arbitrum-mainnet` | `eip155:42161` | ethereum-lists/chains |
| `arbitrum-sepolia` | `eip155:421614` | ethereum-lists/chains |
| `optimism-mainnet` | `eip155:10` | ethereum-lists/chains |
| `optimism-sepolia` | `eip155:11155420` | ethereum-lists/chains |
| `base-mainnet` | `eip155:8453` | ethereum-lists/chains |
| `base-sepolia` | `eip155:84532` | ethereum-lists/chains |

All 13 values match the existing `CAIP2_TO_NETWORK` in `x402.types.ts`. No corrections needed.

Solana genesis hash derivation: `truncate(genesisHash, 32)` where the full genesis hash is 44-char Base58btc. The reference values are first 32 characters of the base58-encoded genesis hash, verifiable via `getGenesisHash` JSON-RPC call.

### CAIP-19 Asset Namespaces (HIGH confidence)

| Namespace | Type | Standard | Registration Status | WAIaaS Usage |
|-----------|------|----------|---------------------|--------------|
| `slip44` | Native fungible (cross-chain) | CAIP-20 | Officially registered in CASA | ETH, SOL native assets |
| `erc20` | EVM fungible tokens | EIP-155 namespace profile | Officially registered | ERC-20 tokens (10 EVM networks) |
| `erc721` | EVM non-fungible tokens | EIP-155 namespace profile | Officially registered | NOT used (WAIaaS does not handle NFTs) |
| `token` | Solana fungible tokens | Solana namespace profile | Officially registered in CASA Solana namespace | SPL + Token-2022 fungible tokens |
| `nft` | Solana non-fungible tokens | Solana namespace profile | Officially registered | NOT used (WAIaaS does not handle NFTs) |

**Critical finding on Solana namespace:** The official ChainAgnostic Solana namespace uses `token` (NOT `spl`) as the asset namespace for fungible tokens. This is explicitly documented at `namespaces.chainagnostic.org/solana/caip19` with example: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (USDC).

**Token-2022 handling:** The Solana CAIP-19 namespace spec does NOT mention Token-2022 separately. Both SPL Token Program and Token-2022 tokens are identified by their mint account address. Since both programs produce mint accounts that serve as unique identifiers, the `token` namespace covers both. Token-2022 is a drop-in replacement -- same instruction set + extensions. No separate namespace needed.

### SLIP-44 Native Asset Coin Types (HIGH confidence)

| Coin | SLIP-44 Index | CAIP-19 Asset Type (mainnet) | Source |
|------|---------------|------------------------------|--------|
| ETH | 60 | `eip155:1/slip44:60` | CAIP-20, SatoshiLabs SLIP registry |
| SOL | 501 | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501` | CAIP-20, SatoshiLabs SLIP registry |
| MATIC | 966 | `eip155:137/slip44:966` | SatoshiLabs SLIP registry |
| BTC | 0 | `bip122:000000000019d6689c085ae165831e93/slip44:0` | CAIP-20 (reference only, WAIaaS does not support) |

**L2 native asset note:** Arbitrum, Optimism, and Base use ETH as native gas token. Their CAIP-19 native asset IDs use `slip44:60`:
- Arbitrum ETH: `eip155:42161/slip44:60`
- Optimism ETH: `eip155:10/slip44:60`
- Base ETH: `eip155:8453/slip44:60`

Polygon uses MATIC (now POL) with `slip44:966` on mainnet. POL was registered in SLIP-44 under the same index 966.

### CAIP-19 Syntax Rules (HIGH confidence)

From the official CAIP-19 specification:

```
asset_type  = chain_id "/" asset_namespace ":" asset_reference
asset_id    = asset_type "/" token_id
chain_id    = namespace ":" reference

namespace        = [-a-z0-9]{3,8}
reference        = [-_a-zA-Z0-9]{1,32}
asset_namespace  = [-a-z0-9]{3,8}
asset_reference  = [-.%a-zA-Z0-9]{1,128}
token_id         = [-.%a-zA-Z0-9]{1,78}
```

Maximum total length for `asset_type`: 8 (namespace) + 1 (:) + 32 (reference) + 1 (/) + 8 (asset_namespace) + 1 (:) + 128 (asset_reference) = **179 characters**.

For WAIaaS, the longest practical CAIP-19 would be a Solana token:
`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` = **90 characters**.
DB column size of `TEXT` (SQLite) handles this natively.

---

## Table Stakes

Features users expect from a CAIP-19 implementation. Missing = the unification effort feels incomplete.

| Feature | Why Expected | Complexity | Depends On | Notes |
|---------|--------------|------------|------------|-------|
| CAIP-2 parser/formatter | Foundation for all CAIP operations. Already partially exists in x402 code. | Low | None | Generalize existing `parseCaip2()` from x402.types.ts, add `formatCaip2()` |
| CAIP-19 parser/formatter | Core CAIP-19 operations: parse URI into components, format components into URI | Low | CAIP-2 parser | New `parseCaip19()` -> `{ chainId, assetNamespace, assetReference }`, `formatCaip19()` |
| Zod validation schemas | WAIaaS uses Zod SSoT. CAIP identifiers need Zod-level validation. | Low | Syntax rules | `Caip2Schema`, `Caip19AssetTypeSchema` with regex from spec |
| NetworkType <-> CAIP-2 bidirectional map | Consolidate existing `CAIP2_TO_NETWORK` + `CAIP2_CHAIN_IDS` duplicates into single SSoT | Low | CAIP-2 parser | Move from x402.types.ts to shared `caip/network-map.ts`. Eliminate WC service duplicate |
| Native asset ID helper | `nativeAssetId('ethereum-mainnet')` -> `'eip155:1/slip44:60'` without manual construction | Low | Network map, SLIP-44 table | Lookup table: `{ 'solana': 501, 'ethereum': 60, 'polygon': 966 }` |
| Token asset ID helper | `tokenAssetId('ethereum-mainnet', '0xa0b8...')` -> `'eip155:1/erc20:0xa0b8...'` | Low | Network map, chain->namespace map | Auto-select `erc20` for EVM, `token` for Solana |
| `isNativeAsset()` predicate | Distinguish native assets (slip44) from token assets in pipeline logic | Low | CAIP-19 parser | Check `assetNamespace === 'slip44'` |
| EVM address normalization in CAIP-19 | EVM addresses must be lowercase in CAIP-19 (no EIP-55 checksum per CAIP-19 spec guidance) | Low | CAIP-19 formatter | `address.toLowerCase()` for EVM. Solana base58 kept as-is (case-sensitive) |
| TokenRef `network` field addition | Current `TokenRef` lacks `network`, making L2 tokens indistinguishable | Low | None (schema change) | Add `network: NetworkTypeEnum.optional()` to `TokenRefSchema` |
| TokenRef `assetId` optional field | Bridge between old format and CAIP-19. Enables gradual migration. | Low | CAIP-19 schema | Add `assetId: Caip19AssetTypeSchema.optional()` to `TokenRefSchema` |
| Price oracle cache key migration | `buildCacheKey` must distinguish L2 tokens. Current `${chain}:${address}` is ambiguous for same-address tokens on different L2s | Med | Network map, TokenRef.network | Change to `${network}:${normalizedAddress}` or CAIP-19. CoinGecko platform mapping must change accordingly |
| CoinGecko platform ID from CAIP-2 | CoinGecko uses platform IDs (`polygon-pos`, `arbitrum-one`, `optimistic-ethereum`, `base`). Need CAIP-2 -> platform mapping for L2 tokens | Med | Network map | New mapping table: `eip155:137` -> `polygon-pos`, etc. |
| Token registry DB `asset_id` column | token_registry needs a computed CAIP-19 `asset_id` column for unified lookup | Med | CAIP-19 formatter, DB migration | ALTER TABLE + backfill migration. Existing `(network, address)` -> CAIP-19 auto-generation |
| Transaction request `assetId` field | API consumers should be able to specify tokens via CAIP-19 in TOKEN_TRANSFER requests | Med | CAIP-19 parser, pipeline integration | Optional field on `TokenInfoSchema`. When present, `address` extracted from `assetId` |
| ALLOWED_TOKENS `assetId` support | Policy rules should support CAIP-19 for chain+network+address scoped whitelisting | Med | CAIP-19 parser | Extend `AllowedTokensRules.tokens` entries to accept `assetId` alternative |
| REST API response `assetId` fields | Token-related API responses include computed `assetId` for consumer convenience | Low | CAIP-19 formatter | Add to token registry responses, transaction detail responses |
| MCP tool `assetId` parameters | MCP tools that reference tokens accept `assetId` as an alternative to `address` | Med | CAIP-19 parser | `send_token`, `approve_token`, `get_token_balance` tools |
| SDK `assetId` support (TS + Python) | SDK methods accept and return `assetId` fields | Low | REST API changes | Follow existing SDK->API delegation pattern |
| Skills file CAIP-19 documentation | AI agents need to understand CAIP-19 format to use it in MCP tool calls | Low | Feature implementation | Update `transactions.skill.md`, `policies.skill.md`, `quickstart.skill.md` |

**Total table stakes: 19 features**

---

## Differentiators

Features that add value beyond basic CAIP-19 support. Not expected, but demonstrate maturity.

| Feature | Value Proposition | Complexity | Depends On | Notes |
|---------|-------------------|------------|------------|-------|
| L2 token price resolution | Polygon USDC, Arbitrum USDC etc. currently cannot be priced because CoinGecko needs L2-specific platform IDs. CAIP-19 provides the missing network context. | Med | CoinGecko platform mapping, TokenRef.network | **Highest value differentiator.** Unlocks multi-chain DeFi price feeds |
| x402 CAIP code consolidation | Eliminate duplicate CAIP-2 maps in x402.types.ts and wc-session-service.ts. Single SSoT in `caip/` module | Low | Network map | Reduces maintenance burden, eliminates divergence risk |
| WalletConnect CAIP alignment | WalletConnect v2 uses CAIP-2 for session namespaces and CAIP-10 for accounts. Full CAIP-19 in WAIaaS aligns with WC Pay which uses CAIP-19 for asset identification | Low | Network map | Future WalletConnect Pay integration becomes trivial |
| CAIP-19 policy scoping for L2 tokens | ALLOWED_TOKENS with `assetId` enables per-L2 token whitelisting. Currently `address`-only means allowing USDC on Ethereum also allows it on Arbitrum (same address) | Med | ALLOWED_TOKENS extension | Closes security gap where token whitelist cannot distinguish L2 chains |
| `assetId` -> `address` auto-extraction | When API receives `assetId`, automatically extract `address`, `chain`, `network`, `decimals` (from registry lookup). Zero manual field population. | Med | CAIP-19 parser, token registry | Superior DX: AI agent sends one field instead of four |
| ActionProvider CAIP-19 input standard | Future ActionProviders (Jupiter, 0x, LI.FI) receive tokens as CAIP-19. Each provider maps internally to protocol-specific IDs. Standard input format across all providers. | Low (interface only) | CAIP-19 types | No current ActionProvider uses this yet, but sets the standard |
| Native asset `'native'` -> CAIP-19 migration | Replace ad-hoc `mint: 'native'` patterns with canonical `slip44:60` / `slip44:501` | Low | Native asset helpers | Eliminates magic string, adds type safety |
| Incoming TX `assetId` tagging | Incoming transactions detected in v27.1 can be tagged with CAIP-19 `assetId` for consistent identification | Low | Incoming TX schema | Adds `asset_id` column to `incoming_transactions` if not present |
| Admin UI CAIP-19 display | Token registry and policy UI show CAIP-19 asset IDs alongside human-readable names | Low | REST API assetId | Visual confirmation of CAIP-19 adoption |

**Total differentiators: 9 features**

---

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| ERC-721/ERC-1155 NFT CAIP-19 support | WAIaaS is a fungible-asset wallet. NFT asset IDs require `token_id` suffix (CAIP-19 3-part format) adding schema complexity for unused functionality | Only implement `asset_type` (2-part: namespace:reference). No `asset_id` with `token_id` |
| `address`-only deprecation | Too early. Existing SDK/MCP consumers rely on `address` field. Forced migration causes breaking changes | Keep `address` fully supported. `assetId` is additive/optional. Deprecation in a future major version |
| Cross-chain asset equivalence mapping | USDC on Ethereum vs Polygon are different CAIP-19 URIs by design. Mapping "same token across chains" is an application concern, not identification | Each deployment gets its own CAIP-19 URI. Cross-chain equivalence is for future DeFi aggregation features |
| Wrapped token relationship encoding | WETH<->ETH, WBTC<->BTC relationships cannot be expressed in CAIP-19 | Leave as separate assets. Relationship is application logic, not identification |
| CAIP-10 account ID integration | CAIP-10 (`namespace:chainId:address`) is for account identification. WAIaaS uses wallet IDs + session model. Adding CAIP-10 complicates the identity model without benefit | Continue using wallet UUID + blockchain address. CAIP-10 only for WalletConnect interop (already handled) |
| External CAIP parser library (`caip` npm) | The `caip` npm package (v1.1.1, last published 2024-03-20) is maintained but adds an external dependency for ~50 lines of regex/parse logic. WAIaaS already has a working `parseCaip2()`. | Build internally in `packages/core/src/caip/`. Zero external dependencies. Regex patterns from official spec are straightforward |
| Dynamic namespace registry | Making namespace mappings (erc20, token, slip44) configurable at runtime. Overkill -- WAIaaS supports two chain families with well-defined namespaces | Hardcode namespace selection: EVM -> `erc20`, Solana -> `token`, Native -> `slip44`. Add namespaces only when new chain families are supported |
| CAIP-19 as primary key in token_registry | Replacing `(network, address)` unique index with `asset_id` primary key. Risky migration, breaks foreign key patterns | Add `asset_id` as computed/indexed column. Keep `(network, address)` as unique index for backward compatibility |
| Solana devnet/testnet genesis hash dynamic resolution | Fetching genesis hash at runtime via `getGenesisHash` RPC call instead of hardcoded values | Hardcode the 3 known values (matching existing code). Solana devnet/testnet genesis hashes have been stable since 2021. Document manual update procedure if reset occurs |

---

## Feature Dependencies

```
Caip2Schema + Caip19AssetTypeSchema (Zod validation)
  |
  +---> parseCaip2() / formatCaip2() [generalize from x402]
  |       |
  |       +---> parseCaip19() / formatCaip19() [new]
  |               |
  |               +---> nativeAssetId(network) [slip44 lookup]
  |               +---> tokenAssetId(network, address) [namespace auto-select]
  |               +---> isNativeAsset(caip19) [namespace check]
  |
  +---> NetworkType <-> CAIP-2 map (consolidate x402 + WC duplicates)
          |
          +---> TokenRef extension (assetId + network fields)
          |       |
          |       +---> Price oracle cache key migration
          |       |       +---> CoinGecko L2 platform mapping
          |       |       +---> L2 token price resolution [HIGHEST VALUE]
          |       |
          |       +---> Token registry DB migration (asset_id column)
          |               +---> Backfill (network, address) -> CAIP-19
          |               +---> REST API assetId in responses
          |               +---> Admin UI CAIP-19 display
          |
          +---> Transaction request assetId field
          |       +---> assetId -> address auto-extraction
          |       +---> Pipeline integration (Stage 1 validation)
          |
          +---> ALLOWED_TOKENS assetId support
          |       +---> L2-scoped token whitelisting
          |       +---> Policy evaluation chain+network+address comparison
          |
          +---> MCP tool assetId parameters
          |       +---> SDK assetId support (TS + Python)
          |       +---> Skills file documentation
          |
          +---> x402 + WC code consolidation
                  +---> x402.types.ts imports from caip/
                  +---> wc-session-service.ts imports from caip/
```

---

## Complexity Assessment by Implementation Area

### Low Complexity (follow existing patterns, <50 LOC each)

| Area | LOC Estimate | Rationale |
|------|-------------|-----------|
| Caip2Schema / Caip19AssetTypeSchema (Zod) | ~20 | Two regex-based z.string() schemas |
| parseCaip2 / formatCaip2 | ~25 | Generalize existing x402 `parseCaip2()`, add format |
| parseCaip19 / formatCaip19 | ~40 | Split on `/` and `:`, validate parts, reassemble |
| nativeAssetId / tokenAssetId | ~30 | Lookup tables + formatCaip19 call |
| isNativeAsset | ~5 | `parseCaip19(id).assetNamespace === 'slip44'` |
| NetworkType <-> CAIP-2 map | ~40 | Consolidate CAIP2_TO_NETWORK + CAIP2_CHAIN_IDS |
| TokenRef schema extension | ~10 | Add 2 optional fields to Zod schema |
| REST API assetId in responses | ~30 | Compute in response mapper |
| SDK assetId (TS + Python) | ~40 | Pass-through, type updates |
| Skills file updates | ~60 | Documentation text |
| Admin UI CAIP display | ~30 | Show assetId in token list |
| x402 + WC code consolidation | ~30 | Import redirect, delete duplicates |

### Medium Complexity (cross-cutting changes, 50-150 LOC each)

| Area | LOC Estimate | Rationale |
|------|-------------|-----------|
| Price oracle cache key migration | ~80 | Change buildCacheKey, update all callers, maintain backward compat during transition |
| CoinGecko L2 platform mapping | ~60 | New CAIP-2 -> CoinGecko platform ID table, integrate into CoinGeckoOracle |
| Token registry DB migration | ~80 | ALTER TABLE, backfill query, migration test |
| Transaction request assetId field | ~100 | Schema change, pipeline Stage 1 extraction, validation |
| ALLOWED_TOKENS assetId support | ~80 | Rules schema extension, evaluation logic, backward compat |
| MCP tool assetId parameters | ~100 | ~10 tools need assetId alternative parameter + resolution logic |
| assetId -> address auto-extraction | ~60 | Parse CAIP-19, lookup registry for decimals/symbol, populate TokenInfo |

**Estimated total: ~920 LOC implementation + ~600 LOC tests = ~1,500 LOC**

---

## Complete CAIP-19 URI Reference for WAIaaS

### Native Assets (13 networks)

| Network | CAIP-19 Asset Type |
|---------|--------------------|
| `mainnet` (Solana) | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501` |
| `devnet` (Solana) | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501` |
| `testnet` (Solana) | `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z/slip44:501` |
| `ethereum-mainnet` | `eip155:1/slip44:60` |
| `ethereum-sepolia` | `eip155:11155111/slip44:60` |
| `polygon-mainnet` | `eip155:137/slip44:966` |
| `polygon-amoy` | `eip155:80002/slip44:966` |
| `arbitrum-mainnet` | `eip155:42161/slip44:60` |
| `arbitrum-sepolia` | `eip155:421614/slip44:60` |
| `optimism-mainnet` | `eip155:10/slip44:60` |
| `optimism-sepolia` | `eip155:11155420/slip44:60` |
| `base-mainnet` | `eip155:8453/slip44:60` |
| `base-sepolia` | `eip155:84532/slip44:60` |

Note: Arbitrum, Optimism, Base use ETH (slip44:60) as native gas token. Polygon uses MATIC/POL (slip44:966).

### Token Asset Examples

| Token | Network | CAIP-19 Asset Type |
|-------|---------|-------------------|
| USDC (Ethereum) | `ethereum-mainnet` | `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` |
| USDC (Polygon) | `polygon-mainnet` | `eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359` |
| USDC (Arbitrum) | `arbitrum-mainnet` | `eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831` |
| USDC (Base) | `base-mainnet` | `eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` |
| USDC (Solana) | `mainnet` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

---

## Backward Compatibility Strategy

### Principle: Additive Fields, Never Remove

1. **Phase 1 (this milestone):** `assetId` is an optional field everywhere. All existing address-based flows continue to work unchanged.
2. **Phase 2 (future):** `assetId` becomes the preferred identifier. API responses always include it. Documentation guides consumers toward `assetId`.
3. **Phase 3 (future major version):** `address`-only fields are deprecated with deprecation warnings. `assetId` required for new features.

### Resolution Priority

When both `assetId` and `address` are provided:
1. Parse `assetId` to extract `{ chainId, namespace, reference }`
2. Validate that extracted `reference` matches provided `address`
3. If mismatch, return validation error (never silently prefer one over the other)
4. If only `address` provided, use it as-is (backward compatible)
5. If only `assetId` provided, extract all needed fields from it

### Policy Backward Compatibility

Current ALLOWED_TOKENS rules:
```json
{ "tokens": [{ "address": "0xa0b8..." }] }
```

Extended format:
```json
{ "tokens": [
  { "address": "0xa0b8..." },
  { "assetId": "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" }
] }
```

Evaluation logic:
- If entry has `assetId`: match chain + network + address (full scoping)
- If entry has only `address`: match address only (existing behavior, cross-chain)
- Both formats can coexist in the same policy

---

## MVP Recommendation

Build in this order, each phase independently testable:

### Phase 1: CAIP Parser + Network Map (Core Foundation)
1. `packages/core/src/caip/caip2.ts` -- parser/formatter
2. `packages/core/src/caip/caip19.ts` -- parser/formatter
3. `packages/core/src/caip/network-map.ts` -- consolidated from x402 + WC
4. `packages/core/src/caip/asset-helpers.ts` -- nativeAssetId, tokenAssetId, isNativeAsset
5. Zod schemas: `Caip2Schema`, `Caip19AssetTypeSchema`
6. Consolidate x402.types.ts and wc-session-service.ts to import from `caip/`
7. TokenRef extension: add `assetId` and `network` optional fields

### Phase 2: Oracle + Registry + DB
1. Price oracle cache key migration (network-aware)
2. CoinGecko L2 platform ID mapping
3. Token registry DB migration (asset_id column + backfill)
4. Token registry REST API: assetId in responses

### Phase 3: API + Policy + MCP + Skills
1. Transaction request schema: assetId optional field
2. Pipeline Stage 1: assetId -> address extraction
3. ALLOWED_TOKENS: assetId support in rules + evaluation
4. MCP tools: assetId parameter on token-related tools
5. SDK (TS + Python): assetId field support
6. Skills files: CAIP-19 documentation

**Defer:**
- ActionProvider CAIP-19 input standard: No current provider. Define interface now, implement when providers exist.
- Incoming TX assetId tagging: Minor enhancement, can be done in a quick follow-up.
- Admin UI CAIP display: Low priority, minimal user value vs API/MCP consumers.

---

## Sources

### Official Specifications (HIGH confidence)
- [CAIP-2: Blockchain ID Specification](https://standards.chainagnostic.org/CAIPs/caip-2) -- chain ID format: `namespace:reference`
- [CAIP-19: Asset Type and Asset ID Specification](https://standards.chainagnostic.org/CAIPs/caip-19) -- asset URI format, syntax rules
- [CAIP-20: Asset Reference for SLIP44 Namespace](https://standards.chainagnostic.org/CAIPs/caip-20) -- native asset coin types
- [Solana CAIP-2 Namespace](https://namespaces.chainagnostic.org/solana/caip2) -- genesis hash truncation, chain IDs for mainnet/devnet/testnet
- [Solana CAIP-19 Namespace](https://namespaces.chainagnostic.org/solana/caip19) -- `token` and `nft` namespaces, mint address as reference
- [EIP-155 CAIP-19 Namespace](https://namespaces.chainagnostic.org/eip155/caip19) -- `erc20`, `erc721` namespaces
- [SLIP-0044 Registry](https://github.com/satoshilabs/slips/blob/master/slip-0044.md) -- coin type indices (ETH=60, SOL=501, MATIC=966)
- [EIP-155 Chain ID Specification](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-155.md) -- EVM chain ID standard

### Ecosystem (MEDIUM confidence)
- [WalletConnect v2 Namespaces Spec](https://specs.walletconnect.com/2.0/specs/clients/sign/namespaces) -- CAIP-2 for session chains
- [WalletConnect Pay](https://docs.walletconnect.network/payments/wallet-implementation) -- CAIP-19 for asset identification in payment requests
- [Portal Chain ID Formatting](https://docs.portalhq.io/resources/chain-id-formatting) -- CAIP-2 chain IDs for EVM L2s

### Libraries (MEDIUM confidence)
- [caip npm package](https://www.npmjs.com/package/caip) -- v1.1.1 (2024-03-20), zero deps, ChainAgnostic official. Evaluated and decided against: too thin to justify external dependency
- [caip-js GitHub](https://github.com/ChainAgnostic/caip-js) -- official JS reference implementation

### WAIaaS Codebase (verified)
- `packages/core/src/interfaces/x402.types.ts` -- existing CAIP2_TO_NETWORK (13 entries), parseCaip2()
- `packages/daemon/src/services/wc-session-service.ts` -- duplicate CAIP2_CHAIN_IDS
- `packages/core/src/interfaces/price-oracle.types.ts` -- TokenRefSchema (address, symbol, decimals, chain)
- `packages/daemon/src/infrastructure/oracle/price-cache.ts` -- buildCacheKey(chain, address)
- `packages/daemon/src/pipeline/database-policy-engine.ts` -- AllowedTokensRules with address-only matching
