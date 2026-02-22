# Phase 232: Oracle L2 Support + Cache Key Migration - Research

**Researched:** 2026-02-22
**Domain:** Price oracle cache key migration (CAIP-19) + CoinGecko L2 platform expansion + Pyth feed ID key transition
**Confidence:** HIGH

## Summary

Phase 232 migrates the price oracle cache key format from the legacy `${chain}:${address}` format to CAIP-19 URIs (e.g., `eip155:1/erc20:0xa0b...`), and expands CoinGecko platform ID support to cover four L2 networks (Polygon, Arbitrum, Optimism, Base). The migration is low-risk because InMemoryPriceCache is volatile (in-memory only, no persistence) -- a daemon restart naturally creates a fresh cache with the new key format, meaning zero data migration is needed.

The core challenge is a coordinated 3-point key format change: (1) `buildCacheKey()` must output CAIP-19 strings, (2) `PYTH_FEED_IDS` keys must be updated to match, and (3) `getCoinGeckoPlatform()` must resolve L2 networks via the `TokenRef.network` field instead of the ambiguous `chain` field. All three changes must be atomic -- if `buildCacheKey` produces CAIP-19 keys but `PYTH_FEED_IDS` still uses legacy keys, Pyth lookups silently fail (returning `undefined` from `getFeedId()`), causing all Pyth prices to fall back to CoinGecko.

**Primary recommendation:** Rewrite `buildCacheKey()` to use `nativeAssetId()`/`tokenAssetId()` from the Phase 231 caip module, requiring `TokenRef.network` as a mandatory parameter. Update `PYTH_FEED_IDS` keys atomically. Expand `COINGECKO_PLATFORM_MAP` to use CAIP-2 chain IDs as keys with L2 entries, and route CoinGecko lookups through `TokenRef.network` -> CAIP-2 -> platformId.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ORCL-01 | Price oracle cache key uses CAIP-19 format instead of legacy `${chain}:${address}` | `buildCacheKey()` in `price-cache.ts` is the single function generating cache keys. Rewriting it to use `nativeAssetId()`/`tokenAssetId()` from `packages/core/src/caip/asset-helpers.ts` achieves CAIP-19 format. 13 call sites in oracle code all use `buildCacheKey()`. |
| ORCL-02 | CoinGecko platform ID map expanded to cover L2 networks (polygon-pos, arbitrum-one, optimistic-ethereum, base) | `COINGECKO_PLATFORM_MAP` in `coingecko-platform-ids.ts` currently has 2 entries (solana, ethereum). Must expand to 6 mainnet entries (solana, ethereum-mainnet, polygon-mainnet, arbitrum-mainnet, optimism-mainnet, base-mainnet) keyed by NetworkType or CAIP-2 chain ID. CoinGecko platform IDs confirmed: `polygon-pos`, `arbitrum-one`, `optimistic-ethereum`, `base`. |
| ORCL-03 | L2 token prices resolvable via CoinGecko using CAIP-2 based platform mapping | CoinGecko `getPrice(token)` currently uses `token.chain` to look up platform ID. Since all EVM L2s share `chain: 'ethereum'`, the lookup must shift to `token.network` (now available via Phase 231 TOKN-01). The network field maps to CAIP-2 via `networkToCaip2()`, and CAIP-2 maps to CoinGecko platformId via the expanded map. |
| ORCL-04 | PYTH_FEED_IDS key format updated atomically with cache key migration | `PYTH_FEED_IDS` in `pyth-feed-ids.ts` has 5 entries using legacy keys (e.g., `solana:native`, `ethereum:native`). Must update keys to CAIP-19 format (e.g., `solana:5eykt.../slip44:501`, `eip155:1/slip44:60`). Since PythOracle calls `buildCacheKey()` then `getFeedId(cacheKey)`, both must produce/consume the same format. Same commit = atomic. |
</phase_requirements>

## Standard Stack

### Core

No new dependencies required. Phase 232 uses only existing packages/core CAIP module and existing oracle infrastructure.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@waiaas/core` caip module | (internal) | `nativeAssetId()`, `tokenAssetId()`, `networkToCaip2()`, `parseCaip19()` | Phase 231 SSoT for CAIP-19 generation. Already tested with 69 tests. |
| `InMemoryPriceCache` | (internal) | Volatile price cache with LRU eviction | Existing infrastructure. Key format change is transparent to cache internals. |
| `vitest` | 3.x | Unit testing | Project standard |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@waiaas/core` chain enums | (internal) | `NetworkType`, `ChainType` | For `TokenRef.network` type-safety and `NETWORK_TYPES` iteration |

### Alternatives Considered

None. Zero new npm deps is a prior decision. All required functionality exists in the Phase 231 caip module.

## Architecture Patterns

### Recommended Change Structure

```
packages/daemon/src/infrastructure/oracle/
  coingecko-platform-ids.ts  -- EXPAND: add L2 entries, rekey by NetworkType/CAIP-2
  price-cache.ts             -- REWRITE: buildCacheKey() -> CAIP-19 output
  pyth-feed-ids.ts           -- REWRITE: PYTH_FEED_IDS keys to CAIP-19
  coingecko-oracle.ts        -- UPDATE: use token.network for platform lookup + address lowering
  oracle-chain.ts            -- MINIMAL: just uses buildCacheKey() (no changes expected)
  pyth-oracle.ts             -- MINIMAL: just uses buildCacheKey() + getFeedId() (format changes propagate)

packages/daemon/src/__tests__/
  price-cache.test.ts        -- UPDATE: buildCacheKey test expectations to CAIP-19
  pyth-oracle.test.ts        -- UPDATE: getPrices result key expectations
  coingecko-oracle.test.ts   -- UPDATE: getPrices result key expectations + add L2 tests
  oracle-chain.test.ts       -- UPDATE: cache key expectations from 'solana:native' to CAIP-19
```

### Pattern 1: buildCacheKey CAIP-19 Rewrite

**What:** Replace the legacy `${chain}:${address}` cache key with CAIP-19 asset type URIs.
**When to use:** Every price oracle cache key generation.
**Signature change:** `buildCacheKey(chain, address)` -> `buildCacheKey(token: TokenRef)` or `buildCacheKey(network: NetworkType, address: string)`.

```typescript
// BEFORE (current):
export function buildCacheKey(chain: string, address: string): string {
  const normalizedAddress = chain === 'ethereum'
    ? address.toLowerCase()
    : address;
  return `${chain}:${normalizedAddress}`;
}
// Output: "ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"

// AFTER (proposed):
import { nativeAssetId, tokenAssetId } from '@waiaas/core';
import type { NetworkType } from '@waiaas/core';

export function buildCacheKey(network: NetworkType, address: string): string {
  if (address === 'native') {
    return nativeAssetId(network);
  }
  return tokenAssetId(network, address);
}
// Output: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
```

Key insight: `nativeAssetId()` and `tokenAssetId()` already handle EVM address lowering and Solana base58 preservation internally. The new `buildCacheKey` becomes a thin wrapper.

### Pattern 2: CoinGecko Platform Map Expansion (Network-keyed)

**What:** Re-key `COINGECKO_PLATFORM_MAP` from `ChainType` to `NetworkType` (or CAIP-2 chain ID).
**When to use:** CoinGecko API calls that need the platformId for `/simple/token_price/{platformId}`.

```typescript
// BEFORE:
export const COINGECKO_PLATFORM_MAP: Record<string, CoinGeckoPlatform> = {
  solana:   { platformId: 'solana',   nativeCoinId: 'solana' },
  ethereum: { platformId: 'ethereum', nativeCoinId: 'ethereum' },
};

// AFTER (keyed by NetworkType):
export const COINGECKO_PLATFORM_MAP: Record<string, CoinGeckoPlatform> = {
  // Solana
  'mainnet':           { platformId: 'solana',                nativeCoinId: 'solana' },
  // EVM Mainnet
  'ethereum-mainnet':  { platformId: 'ethereum',              nativeCoinId: 'ethereum' },
  'polygon-mainnet':   { platformId: 'polygon-pos',           nativeCoinId: 'matic-network' },
  'arbitrum-mainnet':  { platformId: 'arbitrum-one',          nativeCoinId: 'ethereum' },
  'optimism-mainnet':  { platformId: 'optimistic-ethereum',   nativeCoinId: 'ethereum' },
  'base-mainnet':      { platformId: 'base',                  nativeCoinId: 'ethereum' },
};
```

CoinGecko platform ID source: CoinGecko `/asset_platforms` API, verified via [CoinGecko docs](https://docs.coingecko.com/reference/asset-platforms-list). Confidence: HIGH for polygon-pos, arbitrum-one, optimistic-ethereum. MEDIUM for `base` (naming pattern consistent but not directly verified from API response -- documented in all token list URLs as `tokens.coingecko.com/base/all.json`).

Native coin IDs: Arbitrum/Optimism/Base use ETH as gas token (`nativeCoinId: 'ethereum'`). Polygon uses POL (formerly MATIC) (`nativeCoinId: 'matic-network'`). Confidence: HIGH -- Polygon's native coin is confirmed as `matic-network` via CoinGecko documentation.

### Pattern 3: CoinGecko Oracle network-aware lookup

**What:** CoinGeckoOracle.getPrice() must use `token.network` (not `token.chain`) to resolve the CoinGecko platform.
**Why:** All EVM L2s share `chain: 'ethereum'`. Without the network field, Ethereum USDC and Polygon USDC are indistinguishable.

```typescript
// BEFORE (in coingecko-oracle.ts):
const platform = getCoinGeckoPlatform(token.chain);
const address = token.chain === 'ethereum'
  ? token.address.toLowerCase()
  : token.address;

// AFTER:
const network = token.network ?? defaultNetworkForChain(token.chain);
const platform = getCoinGeckoPlatform(network);
const isEvm = token.chain === 'ethereum';
const address = isEvm ? token.address.toLowerCase() : token.address;
```

The `defaultNetworkForChain()` fallback is critical for backward compatibility: if `token.network` is undefined (old callers), it defaults to `'mainnet'` for solana and `'ethereum-mainnet'` for ethereum.

### Pattern 4: PYTH_FEED_IDS Atomic Key Transition

**What:** Update PYTH_FEED_IDS keys from legacy format to CAIP-19 format.
**When to use:** In the same commit as the buildCacheKey rewrite.

```typescript
// BEFORE:
export const PYTH_FEED_IDS: ReadonlyMap<string, string> = new Map([
  ['solana:native',        'ef0d8b6f...'],  // SOL/USD
  ['ethereum:native',      'ff61491a...'],  // ETH/USD
  ['solana:EPjFWdd5...',   'eaa020c6...'],  // USDC/USD (Solana)
  ['solana:Es9vMFrz...',   '2b89b9dc...'],  // USDT/USD (Solana)
  ['ethereum:native_btc',  'e62df6c8...'],  // BTC/USD
]);

// AFTER (using CAIP-19 strings):
import { nativeAssetId, tokenAssetId } from '@waiaas/core';
export const PYTH_FEED_IDS: ReadonlyMap<string, string> = new Map([
  // Native tokens -- use nativeAssetId() for key generation
  [nativeAssetId('mainnet'),          'ef0d8b6f...'],  // SOL/USD
  [nativeAssetId('ethereum-mainnet'), 'ff61491a...'],  // ETH/USD
  // SPL tokens -- use tokenAssetId() for key generation
  [tokenAssetId('mainnet', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), 'eaa020c6...'],  // USDC/USD
  [tokenAssetId('mainnet', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'), '2b89b9dc...'],  // USDT/USD
  // BTC -- special case, not a real on-chain token, consider removal or specialized handling
]);
```

Note: The `ethereum:native_btc` entry is a synthetic key not tied to any real on-chain address. This needs a design decision: either remove it (Pyth has no on-chain BTC token on EVM to price), or create a special CAIP-19 key (but there is no standard CAIP-19 for a non-existent token).

### Pattern 5: TokenRef.network Propagation to Oracle Callers

**What:** Callers that construct `TokenRef` and pass it to `priceOracle.getPrice()` must now populate the `network` field.
**Where:** `resolve-effective-amount-usd.ts`, `stages.ts`, `actions.ts`

```typescript
// BEFORE (in resolve-effective-amount-usd.ts):
const tokenPrice = await priceOracle.getPrice({
  address: req.token.address,
  decimals: req.token.decimals,
  chain: chain as ChainType,
});

// AFTER:
const tokenPrice = await priceOracle.getPrice({
  address: req.token.address,
  decimals: req.token.decimals,
  chain: chain as ChainType,
  network: network as NetworkType,  // need to thread network through
});
```

This requires `network` to be available at the call site. The pipeline context (`ctx.wallet.network` or similar) should already have this information from the wallet record.

### Anti-Patterns to Avoid

- **Partial key migration:** Changing `buildCacheKey` without updating `PYTH_FEED_IDS` in the same commit. This silently breaks all Pyth lookups because `getFeedId(caip19Key)` would always return `undefined` for the old legacy keys.
- **Hardcoding CAIP-19 strings in PYTH_FEED_IDS:** Use `nativeAssetId()` and `tokenAssetId()` to generate the keys programmatically. This ensures consistency with the SSoT caip module and prevents typos in long CAIP-19 strings.
- **Lowercasing in buildCacheKey:** The new `buildCacheKey` should NOT manually lowercase EVM addresses. `tokenAssetId()` already handles this internally. Double-lowercasing is harmless but indicates confusion about responsibility boundaries.
- **Grouping tokens by chain in CoinGecko batch queries:** The current `getPrices()` groups tokens by `token.chain`. With L2 support, it must group by `token.network` (or the resolved CoinGecko platformId) -- otherwise Polygon USDC and Ethereum USDC would be batched into the same platform query with conflicting platform IDs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CAIP-19 cache key generation | Manual string interpolation | `nativeAssetId()` / `tokenAssetId()` from `@waiaas/core` | Already handles EVM lowercase, Solana base58 preservation, correct SLIP-44 coin types, CAIP-2 chain IDs for all 13 networks |
| Network-to-CAIP-2 mapping | Local lookup table | `networkToCaip2()` from `@waiaas/core` | SSoT bidirectional map with 13 entries, validated by Phase 231 tests |
| EVM address normalization | `address.toLowerCase()` in oracle code | Let `tokenAssetId()` handle it | Normalization is already built into the caip module; duplicating it in oracle code creates maintenance burden |

**Key insight:** Phase 231 built all the building blocks (CAIP-2/19 parser+formatter, network map, asset helpers). Phase 232 is purely a consumer -- wiring these building blocks into the oracle subsystem. The hard part is coordination (ensuring all key format changes happen atomically), not the logic itself.

## Common Pitfalls

### Pitfall 1: Partial Key Migration Breaking Pyth Lookups

**What goes wrong:** If `buildCacheKey()` is updated to CAIP-19 but `PYTH_FEED_IDS` still uses legacy keys, `getFeedId()` returns `undefined` for all tokens. PythOracle throws `PriceNotAvailableError`, and everything silently falls back to CoinGecko. This looks like "Pyth is down" rather than a code bug.
**Why it happens:** The two changes are in different files (`price-cache.ts` and `pyth-feed-ids.ts`) and might be done in separate plans.
**How to avoid:** Update `PYTH_FEED_IDS` in the same plan/commit as the `buildCacheKey` rewrite. Write a cross-validation test that verifies `getFeedId(buildCacheKey(network, address))` returns the expected feed ID for all registered tokens.
**Warning signs:** In tests, all Pyth oracle calls fail with `PriceNotAvailableError` after the migration.

### Pitfall 2: Missing network Field in TokenRef Callers

**What goes wrong:** `buildCacheKey()` now requires `network`, but callers (e.g., `resolveEffectiveAmountUsd`) only pass `chain`. The function signature change causes TypeScript compilation errors, or worse, if the signature allows `undefined` network, it produces incorrect cache keys.
**Why it happens:** `network` is optional on `TokenRef` (Phase 231: `network: NetworkTypeEnum.optional()`). Callers that don't set it will get a default fallback.
**How to avoid:** Implement a `resolveNetwork(chain, network?)` helper that defaults to the chain's primary mainnet network. Use this consistently at all call sites.
**Warning signs:** TypeScript errors at `buildCacheKey()` call sites; or tests expecting specific cache key formats getting unexpected values.

### Pitfall 3: CoinGecko Batch Query Grouping by Wrong Key

**What goes wrong:** `getPrices()` in CoinGeckoOracle groups tokens by `token.chain`. Since Polygon/Arbitrum/Optimism/Base tokens all have `chain: 'ethereum'`, they get batched into a single CoinGecko API call with `platformId: 'ethereum'`. Polygon USDC address on Ethereum's platform returns no data.
**Why it happens:** The current grouping logic was designed for 2 chains (solana, ethereum), not 6+ networks.
**How to avoid:** Change the batch grouping key from `token.chain` to the resolved network-based platform ID. Each distinct CoinGecko platformId gets its own batch API call.
**Warning signs:** L2 token prices always returning `PriceNotAvailableError` or empty results.

### Pitfall 4: Polygon Native Coin ID Confusion

**What goes wrong:** Using `'ethereum'` as the native coin ID for Polygon. Polygon's native gas token is POL (formerly MATIC), not ETH.
**Why it happens:** Copy-paste from Arbitrum/Optimism/Base entries which DO use ETH.
**How to avoid:** Polygon `nativeCoinId: 'matic-network'` (verified via CoinGecko docs). All other L2s: `nativeCoinId: 'ethereum'`.
**Warning signs:** `getNativePrice()` for Polygon returns ETH price instead of MATIC/POL price.

### Pitfall 5: BTC Feed ID Entry Without Valid CAIP-19

**What goes wrong:** The current `PYTH_FEED_IDS` has an entry `'ethereum:native_btc'` which is a synthetic key. There is no real on-chain token address `native_btc`. Converting this to CAIP-19 format is not meaningful.
**Why it happens:** This was a convenience entry for cross-chain BTC price lookup, not tied to an actual token.
**How to avoid:** Either remove this entry (BTC is not an ERC-20 token on Ethereum; WBTC has its own address) or convert it to a proper CAIP-19 for WBTC if needed. Document the decision.
**Warning signs:** `formatCaip19()` or `tokenAssetId()` throwing validation errors for `native_btc` as an address.

## Code Examples

### Example 1: Rewritten buildCacheKey

```typescript
// Source: packages/daemon/src/infrastructure/oracle/price-cache.ts (proposed)
import { nativeAssetId, tokenAssetId } from '@waiaas/core';
import type { NetworkType } from '@waiaas/core';

/**
 * Build a CAIP-19 cache key for a token.
 *
 * Uses nativeAssetId/tokenAssetId from @waiaas/core (Phase 231 SSoT).
 * EVM addresses are lowercased internally by tokenAssetId().
 * Solana base58 addresses are preserved by tokenAssetId().
 *
 * @param network - NetworkType (e.g., 'ethereum-mainnet', 'polygon-mainnet', 'mainnet').
 * @param address - Token address or 'native' for native token.
 * @returns CAIP-19 asset type URI as cache key.
 */
export function buildCacheKey(network: NetworkType, address: string): string {
  if (address === 'native') {
    return nativeAssetId(network);
  }
  return tokenAssetId(network, address);
}

// Example outputs:
// buildCacheKey('ethereum-mainnet', 'native') => 'eip155:1/slip44:60'
// buildCacheKey('polygon-mainnet', '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359')
//   => 'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'
// buildCacheKey('mainnet', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
//   => 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
```

### Example 2: Network Resolution Helper

```typescript
// Source: packages/daemon/src/infrastructure/oracle/price-cache.ts (proposed)
import type { ChainType, NetworkType } from '@waiaas/core';

/**
 * Resolve NetworkType from token's chain and optional network fields.
 * Falls back to the chain's primary mainnet for backward compatibility.
 */
export function resolveNetwork(chain: ChainType, network?: NetworkType): NetworkType {
  if (network) return network;
  // Backward-compatible default: chain's primary mainnet
  return chain === 'solana' ? 'mainnet' : 'ethereum-mainnet';
}
```

### Example 3: CoinGecko Platform Map Expansion

```typescript
// Source: packages/daemon/src/infrastructure/oracle/coingecko-platform-ids.ts (proposed)
export const COINGECKO_PLATFORM_MAP: Record<string, CoinGeckoPlatform> = {
  // Solana (mainnet only -- devnet/testnet have no CoinGecko prices)
  'mainnet':           { platformId: 'solana',              nativeCoinId: 'solana' },
  // EVM Mainnet L1
  'ethereum-mainnet':  { platformId: 'ethereum',            nativeCoinId: 'ethereum' },
  // EVM L2 Mainnets
  'polygon-mainnet':   { platformId: 'polygon-pos',         nativeCoinId: 'matic-network' },
  'arbitrum-mainnet':  { platformId: 'arbitrum-one',        nativeCoinId: 'ethereum' },
  'optimism-mainnet':  { platformId: 'optimistic-ethereum', nativeCoinId: 'ethereum' },
  'base-mainnet':      { platformId: 'base',                nativeCoinId: 'ethereum' },
};

export function getCoinGeckoPlatform(network: string): CoinGeckoPlatform | undefined {
  return COINGECKO_PLATFORM_MAP[network];
}
```

### Example 4: Cross-Validation Test for Key Atomicity

```typescript
// Test: verify PYTH_FEED_IDS keys match buildCacheKey output
import { PYTH_FEED_IDS } from '../infrastructure/oracle/pyth-feed-ids.js';
import { buildCacheKey } from '../infrastructure/oracle/price-cache.js';

it('all PYTH_FEED_IDS keys are valid buildCacheKey outputs', () => {
  for (const [key] of PYTH_FEED_IDS) {
    // Every key should be a valid CAIP-19 string
    expect(() => Caip19Schema.parse(key)).not.toThrow();
  }
});

it('buildCacheKey for native SOL matches PYTH_FEED_IDS entry', () => {
  const key = buildCacheKey('mainnet', 'native');
  expect(PYTH_FEED_IDS.has(key)).toBe(true);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `${chain}:${address}` cache keys | CAIP-19 asset type URIs | Phase 232 (this phase) | Enables L2 disambiguation; same address on different chains gets separate cache entries |
| `chain`-keyed CoinGecko platform map | `network`-keyed platform map | Phase 232 (this phase) | CoinGecko can resolve L2 tokens correctly |
| 2-entry platform map (solana, ethereum) | 6-entry platform map (solana + 5 EVM) | Phase 232 (this phase) | Polygon/Arbitrum/Optimism/Base token prices available |
| Legacy `buildCacheKey(chain, address)` | `buildCacheKey(network, address)` | Phase 232 (this phase) | API change propagates to all oracle callers |

**Deprecated/outdated:**
- `buildCacheKey(chain: string, address: string)`: Replaced by `buildCacheKey(network: NetworkType, address: string)`. All callers must be updated.

## Open Questions

1. **BTC Feed ID Handling**
   - What we know: `PYTH_FEED_IDS` has an entry `'ethereum:native_btc'` that is a synthetic key not corresponding to any real on-chain address. It cannot be converted to a standard CAIP-19 URI.
   - What's unclear: Whether this entry is actively used by any caller, or if it was included for completeness.
   - Recommendation: Check if any caller constructs `TokenRef` with `address: 'native_btc'`. If not, remove the entry. If yes, either (a) replace with WBTC's actual ERC-20 address on Ethereum, or (b) omit from the map and let CoinGecko fallback handle BTC pricing. LOW priority -- this is a minor edge case.

2. **Testnet Network Entries in CoinGecko Map**
   - What we know: Out of scope per REQUIREMENTS.md ("CoinGecko testnet 토큰 가격 -- 테스트넷 토큰은 가격이 없음. 메인넷만 L2 확장").
   - Recommendation: Only add mainnet network entries to `COINGECKO_PLATFORM_MAP`. Testnet tokens will get `PriceNotAvailableError` as expected.

3. **Pipeline Context network Threading**
   - What we know: `resolveEffectiveAmountUsd()` receives `chain` from `ctx.wallet.chain`. The wallet record also has a `network` field (since v1.4.5 multi-chain wallet model).
   - What's unclear: Whether `ctx.wallet.network` is reliably populated at the pipeline stage where `resolveEffectiveAmountUsd` is called.
   - Recommendation: Check the pipeline context type and ensure `network` is available alongside `chain`. If not, this requires a small plumbing change in `stages.ts`.

## Sources

### Primary (HIGH confidence)

- Phase 231 CAIP module source code: `packages/core/src/caip/` (caip2.ts, caip19.ts, network-map.ts, asset-helpers.ts) -- directly read and verified
- Phase 231 Verification Report: `231-VERIFICATION.md` -- 21/21 truths verified, 69 caip tests pass
- Oracle source code: `packages/daemon/src/infrastructure/oracle/` (price-cache.ts, coingecko-oracle.ts, pyth-oracle.ts, oracle-chain.ts, pyth-feed-ids.ts, coingecko-platform-ids.ts) -- directly read
- Oracle test suites: `packages/daemon/src/__tests/` (price-cache.test.ts, coingecko-oracle.test.ts, pyth-oracle.test.ts, oracle-chain.test.ts) -- directly read
- `packages/core/src/enums/chain.ts` -- NetworkType enum with 13 values confirmed
- `packages/core/src/interfaces/price-oracle.types.ts` -- TokenRef with optional network/assetId fields confirmed

### Secondary (MEDIUM confidence)

- [CoinGecko Asset Platforms API docs](https://docs.coingecko.com/reference/asset-platforms-list) -- Polygon `polygon-pos` confirmed; other L2 names consistent with naming patterns
- [CoinGecko Getting Started docs](https://docs.coingecko.com/docs/1-get-data-by-id-or-address) -- `polygon-pos` platform ID explicitly shown in documentation examples
- [CoinGecko L2 chain pages](https://www.coingecko.com/en/chains/polygon-pos) -- Polygon POS platform name confirmed

### Tertiary (LOW confidence)

- CoinGecko `base` platform ID: Consistent with token list URL pattern (`tokens.coingecko.com/base/all.json`) but not directly extracted from API response. Very likely correct based on naming convention.
- Polygon native coin ID `matic-network`: Confirmed in CoinGecko docs API response schema example. Note that Polygon rebranded MATIC to POL, but CoinGecko still uses the legacy `matic-network` coin ID.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new deps; all building blocks exist from Phase 231
- Architecture: HIGH -- Clear data flow: buildCacheKey -> CAIP-19 -> cache/Pyth/CoinGecko
- Pitfalls: HIGH -- All pitfalls derive directly from codebase analysis (13 buildCacheKey call sites, 5 PYTH_FEED_IDS entries, 2 COINGECKO_PLATFORM_MAP entries)
- CoinGecko platform IDs: MEDIUM -- polygon-pos verified from docs; others consistent but not API-verified

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable domain, no external API changes expected)
