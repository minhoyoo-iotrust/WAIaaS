# Domain Pitfalls: CAIP-19 Asset Identification Integration

**Domain:** Adding CAIP-19 asset identification to existing multi-chain wallet system (WAIaaS)
**Researched:** 2026-02-22
**Overall confidence:** HIGH (verified against CAIP specs, existing codebase, and ecosystem patterns)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or security regressions. Must be addressed before merging.

---

### Pitfall C-01: EVM Address Case Normalization Inconsistency in CAIP-19

**Severity:** CRITICAL
**Phase:** Phase 2 (CAIP parser + mapping)

**What goes wrong:**
CAIP-19 spec defines `asset_reference` as `[-.%a-zA-Z0-9]{1,128}` -- both uppercase and lowercase are valid. The EIP-155 CAIP-19 namespace shows asset_reference as `0x[a-fA-F0-9]{40}`, accepting mixed case. However, WAIaaS already normalizes EVM addresses to lowercase in multiple locations:
- `buildCacheKey()` in `price-cache.ts` lowercases EVM addresses (line 38-41)
- `CoinGeckoOracle.getPrice()` lowercases for API calls (line 66-68)
- `DatabasePolicyEngine.evaluateAllowedTokens()` uses `toLowerCase()` for comparison (line 927)
- `TokenRegistryService` merges on `address.toLowerCase()` (line 43, 47)

If CAIP-19 asset IDs are stored with EIP-55 checksum addresses (e.g., `eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`) while cache keys use lowercase, the same asset will generate different cache keys depending on the code path.

**Why it happens:**
The CAIP-19 spec is intentionally case-permissive. Different libraries and APIs return addresses in different cases (CoinGecko returns lowercase, EIP-55 returns mixed-case). Without a single normalization point, different entry points produce different CAIP-19 strings for the same asset.

**Consequences:**
- Cache misses: price lookups fail because `eip155:1/erc20:0xA0b8...` !== `eip155:1/erc20:0xa0b8...`
- Policy bypass: ALLOWED_TOKENS rule with checksum address fails to match a request with lowercase address in CAIP-19 format
- Duplicate token registry entries: same token stored with different case variants
- Oracle stampede: cache misses trigger redundant API calls, burning CoinGecko rate limit quota (30 req/min)

**Prevention:**
1. **Canonicalize EVM addresses to lowercase at CAIP-19 construction time.** The `formatCaip19()` and `tokenAssetId()` functions MUST lowercase the asset_reference when `namespace === 'eip155'`. This matches the existing codebase convention.
2. **Validate on parse.** `parseCaip19()` should normalize EVM addresses to lowercase in the returned result.
3. **Document the convention** in the CAIP module: "WAIaaS stores EVM addresses in lowercase in CAIP-19 identifiers (diverges from EIP-55 checksum but matches existing cache/DB convention)."
4. **Never compare raw CAIP-19 strings** -- always compare via parsed, normalized components or ensure both sides are canonicalized.

**Detection:**
- Test: construct CAIP-19 with EIP-55 checksum address, verify `formatCaip19()` returns lowercase
- Test: parse CAIP-19 with mixed-case, verify parsed result has lowercase reference
- Test: cache lookup with checksum vs lowercase produces same result

**Confidence:** HIGH (verified in codebase: `price-cache.ts:38-41`, `database-policy-engine.ts:927`, `coingecko-oracle.ts:67`)

---

### Pitfall C-02: Solana Base58 Address MUST NOT Be Lowercased

**Severity:** CRITICAL
**Phase:** Phase 2 (CAIP parser + mapping)

**What goes wrong:**
If the EVM lowercase normalization from Pitfall C-01 is applied naively to all chains (e.g., `address.toLowerCase()` without checking chain type), Solana base58 addresses will be corrupted. Base58 is case-sensitive: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (USDC) lowercased becomes an entirely different (and invalid) address.

**Why it happens:**
Developers copy the EVM normalization pattern (`toLowerCase()`) without realizing Solana uses a different encoding. The existing codebase already handles this correctly in `buildCacheKey()` (which only lowercases when `chain === 'ethereum'`), but a new developer writing CAIP-19 normalization might not follow the same pattern.

**Consequences:**
- Invalid token addresses: Solana transactions fail with "account not found"
- Policy bypass: ALLOWED_TOKENS cannot match lowercased Solana addresses
- Data corruption: DB migration auto-populating `asset_id` with lowercased Solana addresses renders them unusable

**Prevention:**
1. Normalization function must branch on CAIP-2 namespace: `if (chainNamespace === 'eip155') lowercase(); else preserveOriginal();`
2. Add explicit "NEVER lowercase Solana addresses" comment at the normalization point
3. **Regression test:** Create CAIP-19 for Solana USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, verify the reference is preserved exactly

**Detection:**
- Test: `tokenAssetId('mainnet', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')` must contain the exact original address
- Existing security test `policy-bypass-attacks.security.test.ts:313` already documents this: "toLowerCase() changes the Base58 address to an invalid/different one"

**Confidence:** HIGH (verified in codebase, documented in existing security test)

---

### Pitfall C-03: Policy Evaluation Correctness During Dual-Support Period

**Severity:** CRITICAL
**Phase:** Phase 4 (API + MCP + policy)

**What goes wrong:**
During the transition period where both `address`-only and `assetId` policies coexist, the policy engine must match tokens correctly regardless of how the rule was created. If a policy has `tokens: [{ address: "0xa0b8..." }]` (legacy) and a transaction comes in with `assetId: "eip155:1/erc20:0xa0b8..."`, the engine must still evaluate correctly. Conversely, a policy with `tokens: [{ assetId: "eip155:1/erc20:0xa0b8..." }]` must match a legacy transaction that only provides `tokenAddress`.

**Why it happens:**
The current `evaluateAllowedTokens()` compares `t.address.toLowerCase() === tokenAddress.toLowerCase()`. Adding `assetId` creates 4 comparison scenarios:
1. Policy has `address`, tx has `tokenAddress` (current, works)
2. Policy has `address`, tx has `assetId` (must extract address from CAIP-19)
3. Policy has `assetId`, tx has `tokenAddress` (must construct CAIP-19 from tx context)
4. Policy has `assetId`, tx has `assetId` (direct CAIP-19 comparison)

Missing any scenario creates a security gap where transactions bypass policy.

**Consequences:**
- **Security regression:** Tokens slip through ALLOWED_TOKENS policy (default-deny bypass)
- **False denials:** Legitimate transactions blocked because matching logic fails
- CONTRACT_WHITELIST has the same 4-scenario problem for contract addresses

**Prevention:**
1. **Normalize to a single comparison form** in the policy engine. Before comparison, always extract `(chain, network, address)` tuple from both policy rule and transaction, then compare tuples. Never compare raw CAIP-19 strings.
2. **Add `assetId` to TransactionParam interface** alongside existing `tokenAddress`. The engine resolves both to the same normalized form.
3. **Exhaustive test matrix:** 4 scenarios x 2 chains (EVM + Solana) x 2 case variants = 16 test cases minimum for ALLOWED_TOKENS alone.
4. **Same approach for CONTRACT_WHITELIST and APPROVED_SPENDERS.**

**Detection:**
- Test: Policy with `address` only, transaction with `assetId` only -- must still match
- Test: Policy with `assetId` containing EIP-55 checksum, transaction with lowercase `tokenAddress` -- must match
- Test: Cross-chain scenario -- Polygon USDC assetId must NOT match Ethereum USDC address-only policy (this is the L2 disambiguation benefit)

**Confidence:** HIGH (verified `database-policy-engine.ts:892-938` current logic, all comparison points use `toLowerCase()`)

---

### Pitfall C-04: DB Migration Auto-Population Errors for Existing Records

**Severity:** CRITICAL
**Phase:** Phase 3 (Oracle + Registry + DB migration)

**What goes wrong:**
The migration must add `asset_id` column to `token_registry` and auto-populate it for existing rows by computing `CAIP-19 = f(network, address)`. Several edge cases can corrupt data:

1. **Network-to-CAIP-2 mapping must be exhaustive.** If a row has `network = 'polygon-amoy'` and the migration SQL doesn't have a CASE branch for it, the computed `asset_id` is NULL or wrong.
2. **Solana token_registry rows.** The current `token_registry` is documented as "ERC-20 token management" only (`schema.ts:329`). If any Solana tokens exist in the table (edge case from custom additions), the migration must handle the `solana` namespace with genesis hash references.
3. **SQLite string concatenation in migration.** Building CAIP-19 strings in raw SQL (`'eip155:' || chain_id || '/erc20:' || lower(address)`) is error-prone. A missing `lower()` or wrong chain_id constant breaks all rows.

**Why it happens:**
The migration runs as raw SQL (not through the CAIP TypeScript module), so the normalization logic must be duplicated in SQL. Any divergence between the SQL migration and the TypeScript `formatCaip19()` creates permanent data inconsistency.

**Consequences:**
- `asset_id` values in DB don't match what the runtime code generates, causing cache misses and policy evaluation failures
- If `asset_id` gets a UNIQUE index, wrong values create constraint violations on future inserts
- Rollback is impossible after migration (SQLite ALTER TABLE ADD COLUMN is permanent)

**Prevention:**
1. **Enumerate every NETWORK_TYPE in migration SQL CASE statement.** Use the `NETWORK_TO_CAIP2` mapping (all 13 networks in `x402.types.ts:20-36`) as reference. All networks must have explicit branches.
2. **Lowercase EVM addresses in SQL:** `lower(address)` for EVM networks.
3. **Use the `token` namespace for Solana** (not `spl`): `'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:' || address` for mainnet.
4. **Write migration verification test:** After migration, iterate all rows and verify `asset_id = formatCaip19(network, address)` using TypeScript. This is the canonical check.
5. **Handle NULL gracefully:** If any row can't be mapped, set `asset_id = NULL` rather than a corrupt value. The runtime can lazily compute it.
6. **Test with real data:** Seed a test DB with tokens for each of the 10 EVM networks + 3 Solana networks before running migration.

**Detection:**
- Migration chain test: seed DB with tokens on all 13 networks, run migration, assert `asset_id` for each
- Round-trip test: `parseCaip19(row.asset_id)` must produce valid result for every non-NULL `asset_id`
- Existing `migration-chain.test.ts` pattern should be extended

**Confidence:** HIGH (verified migration system in `migrate.ts:1547-1629`, current schema version 21, token_registry schema at `schema.ts:332-349`)

---

### Pitfall C-05: Price Oracle Cache Key Format Change Breaks In-Flight Cache

**Severity:** CRITICAL
**Phase:** Phase 3 (Oracle cache key transition)

**What goes wrong:**
The current cache key format is `${chain}:${address}` (e.g., `ethereum:0xa0b8...`, `solana:native`). Changing to CAIP-19 format (e.g., `eip155:1/erc20:0xa0b8...`) during a running daemon causes:
1. All existing cache entries become orphaned (unreachable by new keys)
2. Pyth feed ID lookup breaks because `PYTH_FEED_IDS` map uses `chain:address` keys (`pyth-feed-ids.ts:21-32`)
3. CoinGecko platform lookup breaks because `getCoinGeckoPlatform()` takes `ChainType` not CAIP-2

**Why it happens:**
The cache is in-memory (no persistence across restarts), so a daemon restart clears it. But during rolling deployment or if the format changes mid-execution, the `getOrFetch()` stampede prevention breaks: the old inflight promise is keyed by the old format, but the new code looks up by the new format.

**Consequences:**
- 100% cache miss rate after upgrade, triggering rate limit exhaustion on CoinGecko (30 req/min)
- Pyth oracle fails for all tokens (feed ID lookup returns `undefined`)
- OracleChain fallback to CoinGecko also fails if platform mapping isn't updated simultaneously
- USD spending limit calculation returns `PriceNotAvailableError`, causing all transactions to get APPROVAL tier

**Prevention:**
Two viable strategies (choose one):

**Strategy A -- Atomic Switchover (recommended):**
1. Update `buildCacheKey()`, `PYTH_FEED_IDS`, and `COINGECKO_PLATFORM_MAP` in the same phase/commit
2. Clear cache on daemon startup after schema version bump (or accept cold start)
3. Update `PYTH_FEED_IDS` keys from `solana:native` to CAIP-19 format
4. Expand `COINGECKO_PLATFORM_MAP` to use NetworkType keys, enabling L2 support

**Strategy B -- Internal Key Unchanged (safer):**
1. Keep `buildCacheKey()` as `${chain}:${address}` internally
2. Only use CAIP-19 at the API/SDK boundary
3. Convert CAIP-19 <-> cache key at the oracle interface level
4. This minimizes disruption but misses the L2 price lookup opportunity

**Detection:**
- Test: `buildCacheKey()` output format matches `PYTH_FEED_IDS` keys
- Test: After format change, `getPrice()` still resolves for all hardcoded Pyth feed tokens
- Integration test: price lookup for L2 tokens (Polygon USDC) returns valid price

**Confidence:** HIGH (verified `price-cache.ts:37-42`, `pyth-feed-ids.ts:21-32`, `coingecko-platform-ids.ts:26-29`)

---

## Moderate Pitfalls

Cause significant rework or subtle bugs, but not data loss or security issues.

---

### Pitfall M-01: CAIP-19 Regex Validation Rejects Valid Assets or Accepts Invalid Ones

**Severity:** MODERATE
**Phase:** Phase 2 (CAIP parser)

**What goes wrong:**
The objective file proposes this regex for CAIP-2 reference:
```
[-a-zA-Z0-9]{1,32}
```

But the CAIP-2 spec defines reference as `[-_a-zA-Z0-9]{1,32}` (includes **underscore**). The proposed regex omits underscore, which would reject chains like `starknet:SN_GOERLI`. While WAIaaS doesn't support StarkNet, the parser should be spec-compliant for future extensibility and interoperability (e.g., WalletConnect sessions might reference other chains).

Additionally, the CAIP-19 asset_reference allows `[-.%a-zA-Z0-9]{1,128}` which includes period and percent sign. These are valid per spec and needed for URL-encoded references.

**Prevention:**
1. Use the exact CAIP spec regexes:
   - CAIP-2 namespace: `[-a-z0-9]{3,8}`
   - CAIP-2 reference: `[-_a-zA-Z0-9]{1,32}`
   - CAIP-19 asset_namespace: `[-a-z0-9]{3,8}`
   - CAIP-19 asset_reference: `[-.%a-zA-Z0-9]{1,128}`
2. Full combined CAIP-19 regex:
   ```
   /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$/
   ```
3. Test with boundary cases: max-length reference (128 chars), period in reference, percent-encoded reference, underscore in CAIP-2 reference

**Detection:**
- Test: CAIP-2 with underscore in reference (valid) is accepted
- Test: asset_reference with 128 characters is accepted
- Test: asset_reference with 129 characters is rejected
- Test: empty namespace or reference is rejected
- Test: colon, slash, backslash in asset_reference are rejected

**Confidence:** HIGH (verified against CAIP-2 spec: `[-_a-zA-Z0-9]{1,32}` and CAIP-19 spec: `[-.%a-zA-Z0-9]{1,128}` on standards.chainagnostic.org)

---

### Pitfall M-02: Solana SPL vs Token-2022 Namespace Ambiguity

**Severity:** MODERATE
**Phase:** Phase 1 (Research) and Phase 2 (Parser)

**What goes wrong:**
The Solana CAIP-19 namespace spec defines `token` (not `spl`) as the asset namespace for fungible tokens, and `nft` for non-fungibles. Solana has two token programs:
- **SPL Token:** `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`
- **Token-2022:** `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`

The CAIP-19 namespace spec makes **no distinction** between these two programs. Both use the `token` namespace with the mint address as reference. This means `solana:5eykt.../token:EPjFWdd5...` is the same CAIP-19 identifier regardless of which program manages the token.

**Why it matters:**
WAIaaS already supports both SPL and Token-2022 tokens via `IChainAdapter.getTokenInfo()`. The chain adapter distinguishes them internally (different program addresses for transaction construction). If the system needs to route to different programs based on CAIP-19 alone, it can't -- it needs the additional context of which token program owns the mint.

**Prevention:**
1. **Use `token` namespace for both SPL and Token-2022.** This matches the CAIP-19 Solana namespace spec. Do NOT create a custom `spl` or `token2022` namespace.
2. **Resolve the token program at runtime** via `getTokenInfo()`, not from the CAIP-19 identifier. The CAIP-19 ID identifies the asset; the adapter determines the program.
3. **Document this decision** in CAIP module: "The `token` namespace covers both SPL Token and Token-2022 programs. Program resolution is a runtime concern, not an identification concern."

**Detection:**
- Test: Token-2022 USDC mint produces the same CAIP-19 format as SPL USDC (`solana:.../token:...`)
- Test: `parseCaip19()` result for a Token-2022 token has `assetNamespace === 'token'`

**Confidence:** MEDIUM (CAIP-19 Solana namespace spec confirmed `token` namespace; Token-2022 not explicitly addressed in spec, but community consensus is to use `token` for all fungible Solana assets)

---

### Pitfall M-03: Solana CAIP-2 Genesis Hash Instability on Devnet/Testnet

**Severity:** MODERATE
**Phase:** Phase 2 (Network mapping)

**What goes wrong:**
Solana CAIP-2 uses truncated genesis hashes (first 32 base58 chars) as chain references:
- mainnet: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (full: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dUhiR9`)
- devnet: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (full: `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`)
- testnet: `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z` (full: `4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY`)

Solana devnet and testnet can be reset by the Solana Foundation/Anza. A January 2024 testnet rollback-and-restart event was documented. While the genesis hash has remained stable through known restarts (it persists as a constant once the cluster is initialized), the Solana Foundation **can** create a fresh cluster with a new genesis hash.

**Consequences:**
- DB `asset_id` column values become stale for affected network
- Policy rules with `assetId` targeting devnet/testnet stop matching
- Incoming transaction monitoring fails to identify tokens on the reset network

**Prevention:**
1. **Store the mapping table in config** (`network-map.ts`), not as impossible-to-change hardcoded constants. When a genesis hash changes, only the mapping needs updating.
2. **Mainnet genesis hash is stable** -- it has never changed since Solana's launch. Focus concern only on devnet/testnet.
3. **Add a health check** that queries the RPC `getGenesisHash` at daemon startup and warns if the stored hash doesn't match the live cluster.
4. **DB migration consideration:** If a hash changes, a data migration would need to update all `asset_id` values containing the old hash. Design the migration system to support this (pattern: `UPDATE WHERE asset_id LIKE 'solana:OLD_HASH%'`).
5. **WAIaaS already has these exact hashes** in `CAIP2_TO_NETWORK` (`x402.types.ts:33-35`). These are the currently correct values.

**Detection:**
- Test: `networkToCaip2('mainnet')` returns `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`
- Runtime: daemon startup verifies genesis hash via RPC (warn on mismatch, don't hard-fail)

**Confidence:** MEDIUM (genesis hashes confirmed via official Solana docs and existing WAIaaS code; reset risk is theoretical but documented for testnet)

---

### Pitfall M-04: L2 Token Address Collision (CREATE2 Same Address on Different Chains)

**Severity:** MODERATE
**Phase:** Phase 4 (Policy evaluation)

**What goes wrong:**
EVM CREATE2 opcode allows deploying contracts to the same address on different chains. USDC, for example, intentionally uses the same contract address across multiple chains for UX consistency. Currently, WAIaaS ALLOWED_TOKENS only compares `address` (with optional `chain` at ChainType level), which means a policy allowing USDC on Ethereum also allows USDC on Polygon/Arbitrum/Base/Optimism -- same address, different chains.

CAIP-19 solves this by including the chain in the identifier: `eip155:1/erc20:0xa0b8...` (Ethereum) vs `eip155:137/erc20:0xa0b8...` (Polygon). But during the dual-support period, legacy policies without `assetId` still use address-only matching, which cannot distinguish L2 tokens.

**Why it happens:**
The existing `AllowedTokensRulesSchema` has `tokens: Array<{ address, symbol?, chain? }>` where `chain` is optional and at ChainType level (`'solana' | 'ethereum'`), not NetworkType. Even when provided, `chain: 'ethereum'` matches ALL EVM networks indiscriminately.

**Consequences:**
- A policy intended to allow USDC only on Ethereum mainnet inadvertently allows it on all L2s
- This is the **current behavior** (pre-CAIP-19), so it's not a regression from the integration itself
- But it means the CAIP-19 migration must be presented as a security improvement

**Prevention:**
1. **CAIP-19 policies naturally fix this** -- `eip155:1/erc20:0xa0b8...` only matches Ethereum mainnet.
2. **During migration, DO NOT auto-convert legacy address-only policy rules to CAIP-19** with a guessed chain. Keep them as-is with address-only matching (preserving current behavior).
3. **Document the security improvement:** "Policies using `assetId` provide chain+network-specific matching. Policies using `address` only provide address-level matching (legacy behavior, less precise)."
4. **Add an audit log entry** when a legacy address-only policy matches across multiple chains, to encourage migration to `assetId`.

**Detection:**
- Test: CAIP-19 ALLOWED_TOKENS policy for `eip155:1/erc20:0xa0b8...` must NOT match a Polygon transaction for the same address
- Test: Legacy address-only ALLOWED_TOKENS policy must still match across chains (backward compat)

**Confidence:** HIGH (verified `database-policy-engine.ts:926-928` comparison logic, `policy.schema.ts:24-28` schema)

---

### Pitfall M-05: CoinGecko Platform ID Mapping Gap for L2 Networks

**Severity:** MODERATE
**Phase:** Phase 3 (Oracle + CAIP-19 transition)

**What goes wrong:**
The current `COINGECKO_PLATFORM_MAP` only has entries for `solana` and `ethereum` (ChainType level). The comment in `coingecko-platform-ids.ts:8-9` explicitly says "L2 networks (Polygon, Arbitrum, etc.) will be added when TokenRef gains a network field."

CAIP-19 integration adds the `network` field to TokenRef. But if the CoinGecko platform map isn't simultaneously expanded, L2 token price lookups still fail silently -- the oracle returns `PriceNotAvailableError` for Polygon USDC, Arbitrum USDC, etc.

**Why it matters:**
The objective states that CAIP-19 enables "L2 token price lookup." If the CoinGecko mapping isn't expanded in the same phase, the promised capability doesn't actually work.

**Prevention:**
1. **Expand COINGECKO_PLATFORM_MAP** to include all 10 EVM networks (or at least all 5 mainnets):
   - `polygon-mainnet` -> `{ platformId: 'polygon-pos', nativeCoinId: 'matic-network' }`
   - `arbitrum-mainnet` -> `{ platformId: 'arbitrum-one', nativeCoinId: 'ethereum' }`
   - `optimism-mainnet` -> `{ platformId: 'optimistic-ethereum', nativeCoinId: 'ethereum' }`
   - `base-mainnet` -> `{ platformId: 'base', nativeCoinId: 'ethereum' }`
   - Testnet networks map to mainnet counterpart (prices are the same) or return undefined
2. **Update `getCoinGeckoPlatform()` signature** to accept `NetworkType` (or CAIP-2 string) instead of `ChainType`.
3. **Phase 3 must include this expansion.** It's not a "nice to have" -- it's the primary motivation for the CAIP-19 migration.

**Detection:**
- Test: `getCoinGeckoPlatform('polygon-mainnet')` returns `{ platformId: 'polygon-pos', ... }`
- Integration test: Price lookup for Polygon USDC returns a valid price
- Verify platform IDs against CoinGecko API: `GET /api/v3/asset_platforms`

**Confidence:** HIGH (verified `coingecko-platform-ids.ts:26-29`, explicit TODO comment in source)

---

### Pitfall M-06: Backward-Incompatible API Response Schema Change

**Severity:** MODERATE
**Phase:** Phase 4 (API + SDK)

**What goes wrong:**
Adding `assetId` to API responses is backward-compatible (new optional field). But if the implementation accidentally changes the shape of existing fields (e.g., removing `mint` from `AssetInfo`, renaming `address` to `assetId` in `TokenInfo`, or changing `token_address` to `asset_id` in DB query results), existing SDK consumers break silently -- they receive `undefined` for expected fields.

**Why it happens:**
During refactoring to use CAIP-19 internally, developers may "improve" the API by using `assetId` everywhere, inadvertently removing the legacy fields that SDK v2.x consumers depend on.

**Consequences:**
- SDK `getAssets()` returns `{ mint: undefined }` instead of the expected token address
- MCP tools fail because agents provide `assetId` but the daemon version doesn't support it yet (or vice versa)
- TypeScript SDK consumers get runtime errors on accessing removed fields

**Prevention:**
1. **Add, never remove.** `assetId` is additive. All existing fields (`mint`, `address`, `token_address`, `tokenAddress`) must continue to be returned.
2. **Write a snapshot test** for every API response type: serialize current response, add `assetId`, verify all previous fields still present.
3. **SDK version gate:** SDK v2.x should work with daemons that don't return `assetId` (field is `undefined`). SDK v3.x can require `assetId`.
4. **MCP tools must accept both** `assetId` and legacy `token` parameter simultaneously.

**Detection:**
- Snapshot test: current API response + new fields = backward-compatible
- Integration test: SDK v2.x client against CAIP-19-enabled daemon works without changes
- Test: API response with `assetId` still contains `mint`, `address` fields

**Confidence:** HIGH

---

## Minor Pitfalls

Cause inconvenience, confusion, or small rework.

---

### Pitfall L-01: CAIP-19 DB Column Size Decision

**Severity:** MINOR
**Phase:** Phase 3 (DB migration)

**What goes wrong:**
The maximum CAIP-19 string length is: namespace(8) + `:` + reference(32) + `/` + asset_namespace(8) + `:` + asset_reference(128) = 178 characters. SQLite TEXT columns have no practical length limit, so storage is not an issue. The pitfall is in the Zod schema validation -- if `Caip19Schema` sets a max length that's too restrictive (e.g., 100 chars), it could reject valid CAIP-19 identifiers from future chains.

Practical lengths for WAIaaS:
- EVM token: `eip155:11155111/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` = ~62 chars
- Solana token: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` = ~83 chars
- Solana native: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501` = ~48 chars
- EVM native: `eip155:1/slip44:60` = ~18 chars

**Prevention:**
1. Use the spec-compliant regex (max 178 chars) without an additional `.max()` constraint
2. SQLite TEXT column needs no explicit length constraint
3. Test with the longest possible CAIP-19 string (178 chars)

**Confidence:** HIGH

---

### Pitfall L-02: SDK Zero-Dependency Constraint and CAIP-19 Types

**Severity:** MINOR
**Phase:** Phase 4 (SDK update)

**What goes wrong:**
The WAIaaS SDK (`@waiaas/sdk`) has zero dependency on `@waiaas/core` -- types are standalone duplicates. Adding `assetId` to API responses means the SDK types must be manually updated. If the SDK types diverge from core types (e.g., missing `assetId` on `AssetInfo`), TypeScript consumers won't see the new field.

**Prevention:**
1. Update SDK `types.ts` to add `assetId?: string` to all relevant interfaces: `AssetInfo`, `TokenInfo`, `TransactionResponse`, `PolicyResponse`
2. Keep `assetId` optional in SDK (backward-compatible: old daemons won't return it)
3. Update SDK methods to accept optional `assetId` parameter in token operations

**Confidence:** HIGH (verified `packages/sdk/src/types.ts` -- standalone types, no core dependency)

---

### Pitfall L-03: MCP Tool Parameter Explosion

**Severity:** MINOR
**Phase:** Phase 4 (MCP tool update)

**What goes wrong:**
Adding `assetId` as an optional parameter to every token-related MCP tool (send_token, approve_token, get_token_balance, etc.) creates a confusing DX: agents must choose between providing `{token: {address, decimals, symbol}}` OR `{assetId: "eip155:1/erc20:0xa0b8..."}`. If both are provided, which takes precedence? If they conflict, which error is shown?

**Prevention:**
1. **Clear precedence rule:** `assetId` takes precedence when provided. If both `assetId` and `token` are present, validate that they're consistent (extract address from CAIP-19 and compare with `token.address`). Warn but don't error on mismatch.
2. **Document in skill files:** "Use `assetId` for chain-specific token identification. Use `token` for backward compatibility."
3. **Consider a transitional phase** where MCP tools resolve `assetId` to `token` internally, and the downstream pipeline sees only the legacy format.

**Confidence:** HIGH

---

### Pitfall L-04: Incoming Transaction Monitoring Asset ID Backfill

**Severity:** MINOR
**Phase:** Phase 3 (DB migration)

**What goes wrong:**
The `incoming_transactions` table stores `token_address` (nullable) + `chain` + `network`. Adding an `asset_id` column requires backfilling existing rows. Unlike `token_registry`, incoming transactions may have `token_address = NULL` (native transfers), which needs special handling: native transfers should get `slip44:60` (ETH) or `slip44:501` (SOL) as the asset namespace, not `erc20:null`.

**Prevention:**
1. Migration SQL handles NULL `token_address` separately: generate native asset CAIP-19 based on chain+network combination
2. Non-NULL `token_address` + chain + network -> CAIP-19 token asset ID (EVM: `erc20`, Solana: `token`)
3. Test both paths in migration chain test
4. Consider making `asset_id` nullable on `incoming_transactions` (less important than `token_registry`)

**Confidence:** HIGH (verified `incoming_transactions` schema at `schema.ts:436-461`)

---

### Pitfall L-05: Native Asset `'native'` String Convention Breaks After CAIP-19

**Severity:** MINOR
**Phase:** Phase 2 (Asset helpers)

**What goes wrong:**
Native assets use `slip44` namespace with SLIP-44 coin type numbers:
- ETH: `eip155:1/slip44:60`
- SOL: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501`

But the current codebase represents native tokens as `address: 'native'` in TokenRef and `token_address: NULL` in incoming_transactions. The `isNativeAsset()` helper must check for `slip44` namespace, NOT check if the address is `'native'`. If code anywhere does `if (address === 'native')` after CAIP-19 migration, it will silently fail to detect native assets passed as CAIP-19 IDs.

**Prevention:**
1. `isNativeAsset(caip19: string)` checks parsed `assetNamespace === 'slip44'`
2. Search codebase for all `=== 'native'` comparisons and ensure they still work (legacy path should remain valid for backward compat)
3. Keep `address: 'native'` as valid input for backward compatibility, but convert to CAIP-19 at the boundary
4. Add `toTokenRef(caip19: string)` helper that converts CAIP-19 back to `{ address, chain, decimals }` for legacy code paths

**Detection:**
- Grep for `=== 'native'` and `address.*native` to inventory all comparison points (found in `coingecko-oracle.ts:54`, `pyth-feed-ids.ts:23-24`)
- Test: `isNativeAsset('eip155:1/slip44:60')` returns true
- Test: `isNativeAsset('eip155:1/erc20:0xa0b8...')` returns false

**Confidence:** HIGH

---

### Pitfall L-06: x402.types.ts CAIP-2 Mapping Duplication

**Severity:** MINOR
**Phase:** Phase 2 (Network mapping)

**What goes wrong:**
`packages/core/src/interfaces/x402.types.ts` already exports `CAIP2_TO_NETWORK`, `NETWORK_TO_CAIP2`, and `parseCaip2()`. The new `packages/core/src/caip/network-map.ts` will define the same mapping. If both modules exist with separate mapping tables, they can drift out of sync (e.g., new network added to one but not the other).

**Prevention:**
1. **Single source of truth:** Move `CAIP2_TO_NETWORK` and `NETWORK_TO_CAIP2` from `x402.types.ts` to `caip/network-map.ts`. Re-export from `x402.types.ts` for backward compatibility.
2. The objective doc already notes this: "Phase 2 `network-map.ts` implementation must integrate/reuse this mapping to prevent duplication."
3. Search for all imports of `CAIP2_TO_NETWORK` and `NETWORK_TO_CAIP2` to ensure the migration is complete.

**Detection:**
- Grep for `CAIP2_TO_NETWORK` imports -- all should point to `caip/network-map.ts` after migration
- Test: `x402.types.ts` re-exports produce the same values as `caip/network-map.ts` direct imports

**Confidence:** HIGH (verified existing mapping in `x402.types.ts:20-41`)

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Severity | Mitigation |
|-------|---------------|----------|------------|
| Phase 1 (Research) | M-02: SPL vs Token-2022 namespace decision | MODERATE | Confirm `token` namespace for both. Do NOT invent custom namespaces |
| Phase 1 (Research) | M-03: Genesis hash stability | MODERATE | Document current hashes, add runtime verification plan |
| Phase 2 (Parser + Mapping) | **C-01: EVM case normalization** | CRITICAL | Lowercase EVM addresses at `formatCaip19()` construction time |
| Phase 2 (Parser + Mapping) | **C-02: Solana base58 preservation** | CRITICAL | Never lowercase Solana addresses. Branch on chain namespace |
| Phase 2 (Parser + Mapping) | M-01: Regex spec compliance | MODERATE | Use exact CAIP spec regex, include underscore in CAIP-2 reference |
| Phase 2 (Parser + Mapping) | L-05: Native asset format | MINOR | Use slip44 namespace with correct coin type numbers (ETH=60, SOL=501) |
| Phase 2 (Parser + Mapping) | L-06: x402 mapping duplication | MINOR | Consolidate CAIP-2 mapping into caip/network-map.ts, re-export |
| Phase 3 (Oracle + DB) | **C-04: Migration data corruption** | CRITICAL | Exhaustive CASE for all 13 networks, verify with TypeScript round-trip |
| Phase 3 (Oracle + DB) | **C-05: Cache key format break** | CRITICAL | Atomic switchover or keep internal keys unchanged |
| Phase 3 (Oracle + DB) | M-05: CoinGecko L2 platform mapping | MODERATE | Expand platform map in same phase (polygon-pos, arbitrum-one, etc.) |
| Phase 3 (Oracle + DB) | L-04: Incoming TX backfill | MINOR | Handle NULL token_address -> native asset CAIP-19 |
| Phase 3 (Oracle + DB) | L-01: Column size | MINOR | Zod regex handles max length (178 chars), no extra constraint needed |
| Phase 4 (API + Policy) | **C-03: Policy evaluation correctness** | CRITICAL | 4-scenario comparison matrix, 16+ test cases for ALLOWED_TOKENS |
| Phase 4 (API + Policy) | M-04: L2 address collision | MODERATE | CAIP-19 policies fix this; document as security improvement |
| Phase 4 (API + Policy) | M-06: API schema backward compat | MODERATE | Add never remove, snapshot tests for all response types |
| Phase 4 (API + Policy) | L-02: SDK type sync | MINOR | Add assetId to all SDK interfaces (optional field) |
| Phase 4 (API + Policy) | L-03: MCP parameter precedence | MINOR | Clear precedence rule: assetId > token, validate consistency |

---

## Prevention Test Matrix

The following test scenarios must be added to prevent the pitfalls above. Organized by priority.

### Must-Have (CRITICAL pitfall prevention)

| # | Test Scenario | Pitfall | Type |
|---|--------------|---------|------|
| 1 | `formatCaip19()` lowercases EVM address, preserves Solana address | C-01, C-02 | Unit |
| 2 | `parseCaip19()` normalizes EVM address to lowercase in result | C-01 | Unit |
| 3 | Round-trip: `formatCaip19(parseCaip19(x))` === `x` for normalized input | C-01, C-02 | Unit |
| 4 | Solana USDC mint address preserved exactly in CAIP-19 | C-02 | Unit |
| 5 | ALLOWED_TOKENS: legacy `address` policy matches `assetId` transaction | C-03 | Integration |
| 6 | ALLOWED_TOKENS: `assetId` policy matches legacy `tokenAddress` transaction | C-03 | Integration |
| 7 | ALLOWED_TOKENS: `assetId` policy for chain A does NOT match chain B same address | C-03, M-04 | Security |
| 8 | CONTRACT_WHITELIST: same 4-scenario matrix as ALLOWED_TOKENS | C-03 | Integration |
| 9 | Migration: all 13 networks produce correct `asset_id` in token_registry | C-04 | Migration |
| 10 | Migration: `parseCaip19(row.asset_id)` succeeds for every migrated row | C-04 | Migration |
| 11 | `buildCacheKey()` output matches `PYTH_FEED_IDS` keys after format change | C-05 | Unit |
| 12 | Price lookup works for all Pyth-supported tokens after cache key migration | C-05 | Integration |

### Should-Have (MODERATE pitfall prevention)

| # | Test Scenario | Pitfall | Type |
|---|--------------|---------|------|
| 13 | CAIP-2 with underscore in reference accepted by Zod schema | M-01 | Unit |
| 14 | CAIP-19 asset_reference with 128 chars accepted, 129 rejected | M-01 | Unit |
| 15 | Token-2022 mint produces `token` namespace (not custom `spl` or `token2022`) | M-02 | Unit |
| 16 | All 13 `networkToCaip2()` mappings match existing `CAIP2_TO_NETWORK` constants | M-03 | Unit |
| 17 | Polygon USDC price lookup succeeds via expanded CoinGecko map | M-05 | Integration |
| 18 | API response snapshot: all existing fields present after adding `assetId` | M-06 | Snapshot |
| 19 | Legacy address-only policy still matches across EVM chains (backward compat) | M-04 | Integration |

### Nice-to-Have (MINOR pitfall prevention)

| # | Test Scenario | Pitfall | Type |
|---|--------------|---------|------|
| 20 | Max-length CAIP-19 string (178 chars) accepted by Zod | L-01 | Unit |
| 21 | SDK types include optional `assetId` on AssetInfo and TokenInfo | L-02 | Type check |
| 22 | MCP tool: both `assetId` and `token` provided, consistent -> OK | L-03 | Unit |
| 23 | MCP tool: both `assetId` and `token` provided, inconsistent -> warning logged | L-03 | Unit |
| 24 | Migration: incoming_transactions with NULL token_address -> native CAIP-19 | L-04 | Migration |
| 25 | `isNativeAsset('eip155:1/slip44:60')` returns true | L-05 | Unit |
| 26 | `CAIP2_TO_NETWORK` from x402.types.ts === from caip/network-map.ts | L-06 | Unit |

---

## Sources

### CAIP Specifications (Primary)
- [CAIP-19 Specification](https://standards.chainagnostic.org/CAIPs/caip-19) -- asset_namespace `[-a-z0-9]{3,8}`, asset_reference `[-.%a-zA-Z0-9]{1,128}`
- [CAIP-2 Specification](https://standards.chainagnostic.org/CAIPs/caip-2) -- namespace `[-a-z0-9]{3,8}`, reference `[-_a-zA-Z0-9]{1,32}`
- [CAIP-20 SLIP44 Namespace](https://standards.chainagnostic.org/CAIPs/caip-20) -- ETH=60, SOL=501, unsigned integer decimal
- [Solana CAIP-19 Namespace](https://namespaces.chainagnostic.org/solana/caip19) -- `token` (fungible), `nft` (non-fungible), mint address as reference
- [Solana CAIP-2 Namespace](https://namespaces.chainagnostic.org/solana/caip2) -- genesis hash truncated to 32 chars
- [EIP-155 CAIP-19 Namespace](https://namespaces.chainagnostic.org/eip155/caip19) -- `erc20`, `erc721`, address format `0x[a-fA-F0-9]{40}`
- [EIP-155 CAIP-10 Address](https://namespaces.chainagnostic.org/eip155/caip10) -- recommends checksum-case production, accept both

### Blockchain Specifications
- [SLIP-44 Registry](https://github.com/satoshilabs/slips/blob/master/slip-0044.md) -- SOL coin type 501
- [Solana Testnet Restart 2024-01-02](https://github.com/anza-xyz/agave/wiki/2024%E2%80%9001%E2%80%9002-Testnet-Rollback-and-Restart) -- testnet restart event
- [Solana Available Clusters](https://docs.anza.xyz/clusters/available/) -- genesis hash values
- [EIP-55 Checksum Address Encoding](https://eips.ethereum.org/EIPS/eip-55) -- mixed-case checksum scheme
- [Axelar: CREATE2 Cross-Chain Tutorial](https://www.axelar.network/blog/same-address-cross-chain-tutorial) -- same address on different chains

### Ecosystem & Libraries
- [caip npm package](https://www.npmjs.com/package/caip) -- CAIP parser library (maintenance concerns noted)
- [WalletConnect Pay](https://docs.walletconnect.network/payments/wallet-implementation) -- CAIP-19 asset format usage
- [WalletConnect v2 Namespaces Spec](https://specs.walletconnect.com/2.0/specs/clients/sign/namespaces) -- CAIP-2 chain namespace

### WAIaaS Codebase (Verified)
- `packages/core/src/interfaces/x402.types.ts` -- existing CAIP-2 mapping (13 networks)
- `packages/daemon/src/infrastructure/oracle/price-cache.ts` -- cache key format `${chain}:${address}`
- `packages/daemon/src/infrastructure/oracle/pyth-feed-ids.ts` -- Pyth feed ID map (5 entries)
- `packages/daemon/src/infrastructure/oracle/coingecko-platform-ids.ts` -- L2 platform gap (2 entries only)
- `packages/daemon/src/pipeline/database-policy-engine.ts` -- ALLOWED_TOKENS evaluation (toLowerCase comparison)
- `packages/core/src/schemas/policy.schema.ts` -- AllowedTokensRulesSchema (address, optional chain)
- `packages/core/src/schemas/transaction.schema.ts` -- TokenInfoSchema (address, decimals, symbol)
- `packages/daemon/src/infrastructure/database/schema.ts` -- token_registry, incoming_transactions tables
- `packages/daemon/src/infrastructure/database/migrate.ts` -- migration system (schema_version, v21)
- `packages/sdk/src/types.ts` -- standalone SDK types (zero core dependency)
- `packages/daemon/src/__tests__/security/layer2-policy/policy-bypass-attacks.security.test.ts` -- base58 lowercase test
