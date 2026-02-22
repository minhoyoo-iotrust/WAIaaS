# Phase 231: Core CAIP Module + Network Map - Research

**Researched:** 2026-02-22
**Domain:** CAIP-2/CAIP-19 parsing, formatting, validation, and NetworkType bidirectional mapping
**Confidence:** HIGH

## Summary

Phase 231 builds the foundational CAIP module that all subsequent phases (232-234) depend on. The codebase already contains partial CAIP-2 infrastructure in two locations: `packages/core/src/interfaces/x402.types.ts` (13-entry `CAIP2_TO_NETWORK` map, `parseCaip2()`, `NETWORK_TO_CAIP2`) and `packages/daemon/src/services/wc-session-service.ts` (`CAIP2_CHAIN_IDS` -- an identical 13-entry duplicate map). Phase 231 consolidates these into a single `packages/core/src/caip/` module, adds CAIP-19 asset type parsing/formatting, Zod schemas with spec-compliant regex, asset helper functions (`nativeAssetId`, `tokenAssetId`, `isNativeAsset`), and extends `TokenRef` with optional `assetId` and `network` fields.

The implementation is approximately 240 LOC of custom code with zero new npm dependencies. All four evaluated external libraries (caip v1.1.1, @shapeshiftoss/caip v8.16.7, @agentcommercekit/caip v0.1.0, caip-utils v0.1.1) were previously rejected during project research due to incorrect regex, bloated size, or pre-release immaturity. The existing `parseCaip2()` in x402.types.ts proves the pattern; this phase generalizes it into a full module.

Key technical attention points: (1) the CAIP-2 reference regex must include underscore (`[-_a-zA-Z0-9]{1,32}`) per the official spec -- the caip19-STACK.md document incorrectly omits it, (2) EVM addresses must be lowercased at CAIP-19 construction time while Solana base58 must never be lowercased, (3) Polygon uses `slip44:966` (not `slip44:60`) as its native asset, and (4) x402.types.ts must continue to export `CAIP2_TO_NETWORK`, `NETWORK_TO_CAIP2`, `parseCaip2`, and `resolveX402Network` via re-export from the new caip/ module for backward compatibility.

**Primary recommendation:** Build 5 files in `packages/core/src/caip/` (caip2.ts, caip19.ts, network-map.ts, asset-helpers.ts, index.ts), modify 3 existing files (x402.types.ts, wc-session-service.ts, price-oracle.types.ts), update barrel exports (interfaces/index.ts, core/index.ts), and add comprehensive tests.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CAIP-01 | User can parse a CAIP-2 chain ID string into namespace and reference components | `caip2.ts` with `parseCaip2()` generalizing existing x402 implementation. Spec-compliant regex `[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}` verified against official CAIP-2 spec. |
| CAIP-02 | User can format namespace and reference into a valid CAIP-2 chain ID string | `caip2.ts` with `formatCaip2()` that validates output via Zod schema. Follows existing codebase pattern of validate-on-output. |
| CAIP-03 | User can parse a CAIP-19 asset type URI into chainId, assetNamespace, and assetReference components | `caip19.ts` with `parseCaip19()`. Split on `/` then `:`. Regex `[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}` includes `.%` in asset_reference per spec. |
| CAIP-04 | User can format components into a valid CAIP-19 asset type URI with roundtrip fidelity | `caip19.ts` with `formatCaip19()`. EVM addresses lowercased at construction time; Solana preserved. Roundtrip tests confirm `parseCaip19(formatCaip19(...))` identity. |
| CAIP-05 | User can validate CAIP-2 and CAIP-19 strings via Zod schemas with spec-compliant regex | `Caip2Schema` and `Caip19Schema` (aliased from `Caip19AssetTypeSchema`) as Zod `z.string().regex(...)`. Regex verified against standards.chainagnostic.org official spec. |
| CAIP-06 | User can convert any WAIaaS NetworkType to its CAIP-2 chain ID and vice versa (13 networks bidirectional) | `network-map.ts` consolidates existing `CAIP2_TO_NETWORK` (x402.types.ts) and `CAIP2_CHAIN_IDS` (wc-session-service.ts). Functions: `networkToCaip2()`, `caip2ToNetwork()`. All 13 values verified in codebase. |
| CAIP-07 | User can generate a CAIP-19 native asset ID for any supported network using slip44 coin types (ETH=60, SOL=501, POL=966) | `asset-helpers.ts` with `nativeAssetId()`. Lookup table `NATIVE_SLIP44`: ethereum=60, solana=501, polygon=966. L2s (Arbitrum, Optimism, Base) use ETH slip44:60. |
| CAIP-08 | User can generate a CAIP-19 token asset ID from network and token address (erc20 for EVM, token for Solana SPL/Token-2022) | `asset-helpers.ts` with `tokenAssetId()`. Namespace selection: `eip155` -> `erc20`, `solana` -> `token`. EVM addresses lowercased; Solana preserved. |
| CAIP-09 | User can determine if a CAIP-19 URI represents a native asset via isNativeAsset() helper | `asset-helpers.ts` with `isNativeAsset()`. Checks `assetNamespace === 'slip44'` from parsed CAIP-19. |
| CAIP-10 | x402.types.ts CAIP2_TO_NETWORK mapping is consolidated into the new caip/ module with backward-compatible re-export | `x402.types.ts` changes from defining maps to importing from `caip/network-map.ts` and re-exporting. All existing imports (`@waiaas/core` barrel) continue to work unchanged. |
| TOKN-01 | TokenRef schema includes optional assetId (CAIP-19) and network (NetworkType) fields alongside existing address+chain | `price-oracle.types.ts` extended: `assetId: Caip19Schema.optional()`, `network: NetworkTypeEnum.optional()`. Existing consumers unaffected (both fields optional). |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | 3.x (existing) | CAIP URI validation via regex schemas | WAIaaS SSoT -- Zod schemas are the single source of truth for all validation |
| TypeScript | 5.x (existing) | Type derivation from Zod schemas | Zod -> TypeScript types derivation chain |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 3.x (existing) | Unit and contract tests for CAIP module | All new test files |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom ~240 LOC caip module | `caip` npm v1.1.1 | `caip` has incorrect regex (missing `.%` in asset_reference), OOP API (classes not functions), stale maintenance (last real update 2022), 98.9KB for 200 LOC of logic |
| Custom ~240 LOC caip module | `@shapeshiftoss/caip` v8.16.7 | 4.36 MB, drags in axios, massively over-scoped for URI parsing |
| Custom ~240 LOC caip module | `@agentcommercekit/caip` v0.1.0 | Pre-release v0.1.0, zero track record -- cannot depend on in production wallet |

**Installation:**
```bash
# No new packages needed. Zero npm install commands.
```

## Architecture Patterns

### Recommended Project Structure

```
packages/core/src/
  caip/
    index.ts              # barrel export (all public API)
    caip2.ts              # parseCaip2, formatCaip2, Caip2Schema, Caip2Params
    caip19.ts             # parseCaip19, formatCaip19, Caip19Schema, Caip19Params
    network-map.ts        # CAIP2_TO_NETWORK, NETWORK_TO_CAIP2, networkToCaip2, caip2ToNetwork
    asset-helpers.ts      # nativeAssetId, tokenAssetId, isNativeAsset
  interfaces/
    x402.types.ts         # MODIFY: re-export from caip/ (backward compat)
    price-oracle.types.ts # MODIFY: TokenRef + assetId + network
    index.ts              # MODIFY: add caip/ re-exports
  index.ts                # MODIFY: add caip/ exports to barrel
```

### Pattern 1: Zod-First Validation with Regex

**What:** CAIP-2 and CAIP-19 strings are validated via Zod regex schemas at both parse and format time.
**When to use:** Every function that accepts or produces a CAIP string.
**Example:**
```typescript
// Source: CAIP-2 spec (standards.chainagnostic.org/CAIPs/caip-2)
export const Caip2Schema = z.string().regex(
  /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/,
  'Invalid CAIP-2 chain ID format (expected namespace:reference)',
);

// Source: CAIP-19 spec (standards.chainagnostic.org/CAIPs/caip-19)
export const Caip19AssetTypeSchema = z.string().regex(
  /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$/,
  'Invalid CAIP-19 asset type format (expected chainId/namespace:reference)',
);
```

### Pattern 2: Consolidate-and-Re-export for Backward Compatibility

**What:** Move canonical data to new module, re-export from old location.
**When to use:** When consolidating duplicate maps (x402 + WC session service) into `caip/network-map.ts`.
**Example:**
```typescript
// x402.types.ts -- AFTER consolidation
import { CAIP2_TO_NETWORK, NETWORK_TO_CAIP2, parseCaip2 } from '../caip/index.js';
export { CAIP2_TO_NETWORK, NETWORK_TO_CAIP2, parseCaip2 };

// resolveX402Network remains here (x402-specific business logic)
export function resolveX402Network(caip2: string): { chain: ChainType; network: NetworkType } {
  const resolved = CAIP2_TO_NETWORK[caip2];
  if (!resolved) throw new Error(`Unsupported x402 network: ${caip2}`);
  return resolved;
}
```

### Pattern 3: Namespace-Branching for Address Normalization

**What:** Apply EVM lowercase normalization only when `namespace === 'eip155'`; preserve Solana base58 exactly.
**When to use:** In `formatCaip19()`, `tokenAssetId()`, and any function that constructs CAIP-19 from raw addresses.
**Example:**
```typescript
export function tokenAssetId(network: NetworkType, address: string): string {
  const caip2 = networkToCaip2(network);
  const { namespace } = parseCaip2(caip2);
  if (namespace === 'eip155') {
    // EVM: lowercase address, use erc20 namespace
    return formatCaip19(caip2, 'erc20', address.toLowerCase());
  }
  if (namespace === 'solana') {
    // Solana: NEVER lowercase base58 -- case-sensitive!
    return formatCaip19(caip2, 'token', address);
  }
  throw new Error(`Unsupported namespace: ${namespace}`);
}
```

### Pattern 4: Optional Field Extension (Additive, Non-Breaking)

**What:** Add new optional fields to existing Zod schemas without breaking consumers.
**When to use:** Extending TokenRef with `assetId` and `network`.
**Example:**
```typescript
// BEFORE
export const TokenRefSchema = z.object({
  address: z.string().min(1),
  symbol: z.string().optional(),
  decimals: z.number().int().min(0).max(18),
  chain: ChainTypeEnum,
});

// AFTER (additive -- all new fields optional)
export const TokenRefSchema = z.object({
  address: z.string().min(1),
  symbol: z.string().optional(),
  decimals: z.number().int().min(0).max(18),
  chain: ChainTypeEnum,
  assetId: Caip19Schema.optional(),       // NEW: CAIP-19 asset type URI
  network: NetworkTypeEnum.optional(),     // NEW: L2 network disambiguation
});
```

### Anti-Patterns to Avoid

- **Applying `toLowerCase()` globally:** MUST branch on namespace. Solana base58 is case-sensitive. Lowercasing corrupts addresses.
- **Comparing raw CAIP-19 strings without normalization:** Different entry points may produce different cases. Always compare via parsed/normalized components.
- **Duplicating the network map:** The whole point of this phase is consolidation. x402.types.ts and wc-session-service.ts must import from `caip/network-map.ts`, not maintain their own copies.
- **Using EIP-55 checksum in CAIP-19:** WAIaaS convention is lowercase EVM addresses (matches existing price-cache, policy engine, token registry). Do NOT store EIP-55 mixed-case in CAIP-19 strings.
- **Validating only on parse, not on format:** Both `parseCaip19()` and `formatCaip19()` must run Zod validation to prevent malformed strings from entering the system.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CAIP regex patterns | Custom regex from scratch | Official CAIP-2/CAIP-19 spec regex | Spec defines exact character sets. Copy them. Don't improvise. |
| Zod schema for CAIP validation | Manual if/throw validation | `z.string().regex(...)` | Zod SSoT discipline. Schemas integrate into OpenAPI generation. |
| Network -> CAIP-2 lookup | If/else chains | Const Record map (exhaustive) | TypeScript satisfies-check ensures all 13 NetworkType values are covered |
| SLIP-44 coin type lookup | Large lookup table | 3-entry map (ETH=60, SOL=501, POL=966) | Only 3 distinct coin types across 13 networks. Don't over-engineer. |

**Key insight:** The CAIP module is fundamentally string manipulation + lookup tables. The complexity is not in the code but in the correctness of the regex, the normalization rules, and the exhaustive coverage of all 13 networks.

## Common Pitfalls

### Pitfall 1: CAIP-2 Reference Regex Missing Underscore

**What goes wrong:** The caip19-STACK.md document uses `[-a-zA-Z0-9]{1,32}` for the CAIP-2 reference, but the official CAIP-2 spec (verified via standards.chainagnostic.org) defines `[-_a-zA-Z0-9]{1,32}` (includes underscore). Using the wrong regex would reject valid CAIP-2 identifiers like `starknet:SN_GOERLI`.
**Why it happens:** Easy to miss the underscore in the spec's ABNF grammar. The caip npm library also omits it.
**How to avoid:** Use `[-_a-zA-Z0-9]{1,32}` for CAIP-2 reference. This matches the ARCHITECTURE.md and PITFALLS.md research docs which have the correct regex. Test with underscore-containing references.
**Warning signs:** Any unit test with `SN_GOERLI` or similar underscore-containing references fails.

### Pitfall 2: EVM Address Case in CAIP-19 (C-01)

**What goes wrong:** CAIP-19 spec allows mixed-case EVM addresses, but WAIaaS convention is lowercase everywhere (price-cache, policy engine, token registry). If CAIP-19 stores EIP-55 checksum addresses, cache misses and policy bypass vulnerabilities emerge.
**Why it happens:** Different APIs return addresses in different cases (CoinGecko: lowercase, EIP-55: mixed). Without a single normalization point, different code paths produce different CAIP-19 strings for the same asset.
**How to avoid:** Lowercase EVM addresses at `formatCaip19()` / `tokenAssetId()` construction time when `namespace === 'eip155'`. Document convention.
**Warning signs:** Cache miss rate spikes, duplicate token registry entries, policy matching failures.

### Pitfall 3: Solana Base58 Lowercasing (C-02)

**What goes wrong:** If EVM lowercase normalization is applied naively to Solana addresses, base58 addresses are corrupted. `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` lowercased becomes a completely different (and invalid) address.
**Why it happens:** Copy-paste from EVM normalization code without checking chain type.
**How to avoid:** Branch on CAIP-2 namespace: `if (namespace === 'eip155') lowercase(); else preserve()`. Add explicit "NEVER lowercase Solana addresses" comment. Regression test with exact Solana USDC mint address.
**Warning signs:** Solana transactions fail with "account not found", Solana policy matching fails.

### Pitfall 4: Polygon Uses slip44:966, Not slip44:60

**What goes wrong:** All other EVM L2s (Arbitrum, Optimism, Base) use ETH (slip44:60) as native gas token, but Polygon uses MATIC/POL (slip44:966). A naive `nativeAssetId()` that maps all EVM networks to slip44:60 produces wrong Polygon native asset IDs.
**Why it happens:** Polygon is the only supported L2 with a non-ETH native gas token. Easy to overlook in a uniform mapping.
**How to avoid:** Use a `NATIVE_SLIP44` lookup table that explicitly maps `polygon-mainnet` -> 966, `polygon-amoy` -> 966, and all others to 60 (for EVM) or 501 (for Solana). Test all 13 native asset IDs explicitly.
**Warning signs:** `nativeAssetId('polygon-mainnet')` returns `eip155:137/slip44:60` instead of `eip155:137/slip44:966`.

### Pitfall 5: Incomplete Barrel Exports Breaking Package Consumers

**What goes wrong:** New caip/ module exports are not wired through `interfaces/index.ts` and `core/index.ts`, causing `import { parseCaip2 } from '@waiaas/core'` to fail despite the function existing in the package.
**Why it happens:** Multiple barrel export layers: `caip/index.ts` -> `interfaces/index.ts` (or direct) -> `core/index.ts`. Missing any link in the chain breaks external consumers.
**How to avoid:** After adding exports, run the existing `package-exports.test.ts` test suite. Add new assertions for all caip/ exports. Run `pnpm turbo run typecheck` to verify cross-package resolution.
**Warning signs:** TypeScript compilation errors in downstream packages (daemon, mcp, sdk).

### Pitfall 6: x402.types.ts Test Suite Breaks After Re-export Refactor

**What goes wrong:** The existing `x402-types.test.ts` has 45+ lines of tests for `CAIP2_TO_NETWORK`, `NETWORK_TO_CAIP2`, `parseCaip2`, and `resolveX402Network`. If the re-export from caip/ subtly changes behavior (e.g., new parseCaip2 validates more strictly with Zod), these tests break.
**Why it happens:** The existing `parseCaip2()` in x402.types.ts does minimal validation (just checks for `:` presence). The new `parseCaip2()` in caip/ runs full Zod regex validation. Strings that passed the old parser may fail the new one.
**How to avoid:** Run `x402-types.test.ts` after the refactor. Ensure no existing test case produces a string that violates the spec regex. The existing test cases all use valid CAIP-2 strings, so this should pass -- but verify.
**Warning signs:** `x402-types.test.ts` failures after the re-export change.

## Code Examples

Verified patterns from official CAIP specs and existing codebase analysis:

### CAIP-2 Parser/Formatter (caip2.ts)

```typescript
// Source: CAIP-2 spec (standards.chainagnostic.org/CAIPs/caip-2)
import { z } from 'zod';

export const Caip2Schema = z.string().regex(
  /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/,
  'Invalid CAIP-2 chain ID format',
);
export type Caip2 = z.infer<typeof Caip2Schema>;

export interface Caip2Params {
  namespace: string;   // e.g., "eip155", "solana"
  reference: string;   // e.g., "1", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
}

export function parseCaip2(chainId: string): Caip2Params {
  Caip2Schema.parse(chainId);
  const idx = chainId.indexOf(':');
  return {
    namespace: chainId.slice(0, idx),
    reference: chainId.slice(idx + 1),
  };
}

export function formatCaip2(namespace: string, reference: string): string {
  const result = `${namespace}:${reference}`;
  Caip2Schema.parse(result);
  return result;
}
```

### CAIP-19 Parser/Formatter (caip19.ts)

```typescript
// Source: CAIP-19 spec (standards.chainagnostic.org/CAIPs/caip-19)
import { z } from 'zod';
import { Caip2Schema } from './caip2.js';

export const Caip19AssetTypeSchema = z.string().regex(
  /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$/,
  'Invalid CAIP-19 asset type format',
);
export type Caip19AssetType = z.infer<typeof Caip19AssetTypeSchema>;

// Convenience alias (WAIaaS only handles fungible tokens -> AssetType sufficient)
export const Caip19Schema = Caip19AssetTypeSchema;
export type Caip19 = Caip19AssetType;

export interface Caip19Params {
  chainId: string;        // CAIP-2 chain ID
  assetNamespace: string; // e.g., "slip44", "erc20", "token"
  assetReference: string; // e.g., "60", "0xa0b8...", "EPjF..."
}

export function parseCaip19(assetType: string): Caip19Params {
  Caip19AssetTypeSchema.parse(assetType);
  const slashIdx = assetType.indexOf('/');
  const chainId = assetType.slice(0, slashIdx);
  const assetPart = assetType.slice(slashIdx + 1);
  const colonIdx = assetPart.indexOf(':');
  return {
    chainId,
    assetNamespace: assetPart.slice(0, colonIdx),
    assetReference: assetPart.slice(colonIdx + 1),
  };
}

export function formatCaip19(
  chainId: string,
  assetNamespace: string,
  assetReference: string,
): string {
  const result = `${chainId}/${assetNamespace}:${assetReference}`;
  Caip19AssetTypeSchema.parse(result);
  return result;
}
```

### Network Map (network-map.ts) -- Consolidation from x402.types.ts + wc-session-service.ts

```typescript
// Source: Existing codebase (x402.types.ts lines 20-41, wc-session-service.ts lines 41-57)
import type { ChainType, NetworkType } from '../enums/chain.js';

export const CAIP2_TO_NETWORK: Record<string, { chain: ChainType; network: NetworkType }> = {
  // EVM (10 entries)
  'eip155:1':        { chain: 'ethereum', network: 'ethereum-mainnet' },
  'eip155:11155111': { chain: 'ethereum', network: 'ethereum-sepolia' },
  'eip155:137':      { chain: 'ethereum', network: 'polygon-mainnet' },
  'eip155:80002':    { chain: 'ethereum', network: 'polygon-amoy' },
  'eip155:42161':    { chain: 'ethereum', network: 'arbitrum-mainnet' },
  'eip155:421614':   { chain: 'ethereum', network: 'arbitrum-sepolia' },
  'eip155:10':       { chain: 'ethereum', network: 'optimism-mainnet' },
  'eip155:11155420': { chain: 'ethereum', network: 'optimism-sepolia' },
  'eip155:8453':     { chain: 'ethereum', network: 'base-mainnet' },
  'eip155:84532':    { chain: 'ethereum', network: 'base-sepolia' },
  // Solana (3 entries)
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': { chain: 'solana', network: 'mainnet' },
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1':  { chain: 'solana', network: 'devnet' },
  'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z':  { chain: 'solana', network: 'testnet' },
};

export const NETWORK_TO_CAIP2 = Object.fromEntries(
  Object.entries(CAIP2_TO_NETWORK).map(([caip2, { network }]) => [network, caip2]),
) as Record<NetworkType, string>;

export function networkToCaip2(network: NetworkType): string {
  const caip2 = NETWORK_TO_CAIP2[network];
  if (!caip2) throw new Error(`No CAIP-2 mapping for network: ${network}`);
  return caip2;
}

export function caip2ToNetwork(caip2: string): { chain: ChainType; network: NetworkType } {
  const resolved = CAIP2_TO_NETWORK[caip2];
  if (!resolved) throw new Error(`No WAIaaS network for CAIP-2: ${caip2}`);
  return resolved;
}
```

### Asset Helpers (asset-helpers.ts) -- Native SLIP-44 + Token Namespace

```typescript
// Source: SLIP-0044 Registry, Solana CAIP-19 Namespace (token), EIP-155 CAIP-19 Namespace (erc20)
import type { NetworkType } from '../enums/chain.js';
import { parseCaip2 } from './caip2.js';
import { formatCaip19, parseCaip19 } from './caip19.js';
import { networkToCaip2 } from './network-map.js';

// SLIP-44 coin types for native assets
// ETH=60 (all EVM L2s except Polygon), SOL=501, POL=966 (Polygon only)
const NATIVE_SLIP44: Record<string, number> = {
  'eip155:1': 60,        // Ethereum mainnet
  'eip155:11155111': 60,  // Ethereum Sepolia
  'eip155:137': 966,      // Polygon mainnet (POL/MATIC)
  'eip155:80002': 966,    // Polygon Amoy (POL/MATIC)
  'eip155:42161': 60,     // Arbitrum mainnet (ETH)
  'eip155:421614': 60,    // Arbitrum Sepolia (ETH)
  'eip155:10': 60,        // Optimism mainnet (ETH)
  'eip155:11155420': 60,  // Optimism Sepolia (ETH)
  'eip155:8453': 60,      // Base mainnet (ETH)
  'eip155:84532': 60,     // Base Sepolia (ETH)
  // Solana
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 501,
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1': 501,
  'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z': 501,
};

export function nativeAssetId(network: NetworkType): string {
  const caip2 = networkToCaip2(network);
  const coinType = NATIVE_SLIP44[caip2];
  if (coinType === undefined) throw new Error(`No SLIP-44 coin type for: ${caip2}`);
  return formatCaip19(caip2, 'slip44', String(coinType));
}

export function tokenAssetId(network: NetworkType, address: string): string {
  const caip2 = networkToCaip2(network);
  const { namespace } = parseCaip2(caip2);
  if (namespace === 'eip155') {
    return formatCaip19(caip2, 'erc20', address.toLowerCase());
  }
  if (namespace === 'solana') {
    // NEVER lowercase Solana base58 -- case-sensitive!
    return formatCaip19(caip2, 'token', address);
  }
  throw new Error(`Unsupported namespace: ${namespace}`);
}

export function isNativeAsset(caip19: string): boolean {
  const { assetNamespace } = parseCaip19(caip19);
  return assetNamespace === 'slip44';
}
```

### x402.types.ts Re-export Pattern

```typescript
// Source: existing x402.types.ts, modified for re-export
// BEFORE: defines CAIP2_TO_NETWORK, NETWORK_TO_CAIP2, parseCaip2 locally
// AFTER: imports from caip/ and re-exports for backward compatibility

import {
  CAIP2_TO_NETWORK,
  NETWORK_TO_CAIP2,
  parseCaip2,
} from '../caip/index.js';

// Re-export for backward compatibility (existing consumers import from x402.types.ts)
export { CAIP2_TO_NETWORK, NETWORK_TO_CAIP2, parseCaip2 };

// resolveX402Network stays here -- x402-specific business logic
export function resolveX402Network(caip2: string): { chain: ChainType; network: NetworkType } {
  const resolved = CAIP2_TO_NETWORK[caip2];
  if (!resolved) throw new Error(`Unsupported x402 network: ${caip2}`);
  return resolved;
}
```

### WC Session Service Consolidation

```typescript
// Source: wc-session-service.ts lines 41-57
// BEFORE: local CAIP2_CHAIN_IDS map (duplicate of x402.types.ts)
// AFTER: import from caip/ module

import { NETWORK_TO_CAIP2 } from '@waiaas/core';

// Delete CAIP2_CHAIN_IDS entirely. Use NETWORK_TO_CAIP2 instead.
// NETWORK_TO_CAIP2['mainnet'] === 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
// NETWORK_TO_CAIP2['ethereum-mainnet'] === 'eip155:1'

// In createPairing() at line 223:
const chainId = NETWORK_TO_CAIP2[network] ??
  (chain === 'solana' ? `solana:${network}` : `eip155:${network}`);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `CAIP2_TO_NETWORK` in x402.types.ts (partial) | Consolidated `caip/network-map.ts` (full module) | Phase 231 (now) | Single SSoT for all CAIP-2 mappings |
| `CAIP2_CHAIN_IDS` duplicate in wc-session-service.ts | Import from `@waiaas/core` (caip/) | Phase 231 (now) | Eliminate duplication, prevent drift |
| `parseCaip2()` minimal validation (indexOf only) | `parseCaip2()` with Zod regex validation | Phase 231 (now) | Spec-compliant validation, catches malformed inputs |
| TokenRef without network field | TokenRef with optional assetId + network | Phase 231 (now) | L2 token disambiguation for price oracle + policy |

## Open Questions

1. **CAIP-2 reference underscore in STACK.md**
   - What we know: The official CAIP-2 spec uses `[-_a-zA-Z0-9]{1,32}` (with underscore). The caip19-STACK.md document uses `[-a-zA-Z0-9]{1,32}` (without underscore). The ARCHITECTURE and PITFALLS docs use the correct version.
   - What's unclear: Whether the STACK.md was an oversight or intentional simplification.
   - Recommendation: Use the spec-compliant regex with underscore. This is non-controversial -- the spec is clear.

2. **WC Session Service import path after consolidation**
   - What we know: `wc-session-service.ts` currently defines `CAIP2_CHAIN_IDS` locally. After consolidation, it should import `NETWORK_TO_CAIP2` from `@waiaas/core`.
   - What's unclear: Whether `NETWORK_TO_CAIP2` is a 1:1 replacement for `CAIP2_CHAIN_IDS`. Comparing: `CAIP2_CHAIN_IDS` is `Record<string, string>` (NetworkType -> CAIP-2), `NETWORK_TO_CAIP2` is the same.
   - Recommendation: Direct replacement works. The maps are identical (verified: all 13 entries match). The fallback logic at line 223-224 can remain as-is.

3. **caip/ module export path: via interfaces/index.ts or directly from core/index.ts?**
   - What we know: All existing interfaces go through `interfaces/index.ts`. But caip/ is more of a utility module (like `utils/` or `enums/`) than an interface contract.
   - Recommendation: Export caip/ directly from `core/index.ts`, NOT through `interfaces/index.ts`. This keeps `interfaces/` for actual interface contracts (IChainAdapter, IPriceOracle, etc.). The caip module is a value-export utility, similar to `enums/` and `utils/`.

## Complete CAIP-19 URI Reference for WAIaaS (13 native + token examples)

### Native Assets

| NetworkType | CAIP-19 Native Asset | SLIP-44 |
|-------------|---------------------|---------|
| `mainnet` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501` | SOL=501 |
| `devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501` | SOL=501 |
| `testnet` | `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z/slip44:501` | SOL=501 |
| `ethereum-mainnet` | `eip155:1/slip44:60` | ETH=60 |
| `ethereum-sepolia` | `eip155:11155111/slip44:60` | ETH=60 |
| `polygon-mainnet` | `eip155:137/slip44:966` | POL=966 |
| `polygon-amoy` | `eip155:80002/slip44:966` | POL=966 |
| `arbitrum-mainnet` | `eip155:42161/slip44:60` | ETH=60 |
| `arbitrum-sepolia` | `eip155:421614/slip44:60` | ETH=60 |
| `optimism-mainnet` | `eip155:10/slip44:60` | ETH=60 |
| `optimism-sepolia` | `eip155:11155420/slip44:60` | ETH=60 |
| `base-mainnet` | `eip155:8453/slip44:60` | ETH=60 |
| `base-sepolia` | `eip155:84532/slip44:60` | ETH=60 |

### Token Asset Examples

| Token | NetworkType | CAIP-19 |
|-------|-------------|---------|
| USDC (Ethereum) | `ethereum-mainnet` | `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` |
| USDC (Polygon) | `polygon-mainnet` | `eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359` |
| USDC (Arbitrum) | `arbitrum-mainnet` | `eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831` |
| USDC (Base) | `base-mainnet` | `eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` |
| USDC (Solana) | `mainnet` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

## Existing Code to Modify

### Files to Modify (6 files)

| File | Change | Reason |
|------|--------|--------|
| `packages/core/src/interfaces/x402.types.ts` | Remove local CAIP2_TO_NETWORK/NETWORK_TO_CAIP2/parseCaip2 definitions; import from `../caip/index.js` and re-export | CAIP-10 requirement: consolidate into caip/ module |
| `packages/core/src/interfaces/index.ts` | Update CAIP export source (still re-export same symbols, but source changes) | Barrel consistency |
| `packages/core/src/index.ts` | Add caip/ module exports (Caip2Schema, Caip19Schema, parseCaip2, formatCaip2, parseCaip19, formatCaip19, networkToCaip2, caip2ToNetwork, nativeAssetId, tokenAssetId, isNativeAsset, CAIP2_TO_NETWORK, NETWORK_TO_CAIP2) | Package public API |
| `packages/core/src/interfaces/price-oracle.types.ts` | Add `assetId: Caip19Schema.optional()` and `network: NetworkTypeEnum.optional()` to TokenRefSchema | TOKN-01 requirement |
| `packages/daemon/src/services/wc-session-service.ts` | Delete `CAIP2_CHAIN_IDS` local map; import `NETWORK_TO_CAIP2` from `@waiaas/core` | Eliminate duplicate map |
| `packages/core/src/__tests__/package-exports.test.ts` | Add assertions for new caip/ exports | Verify package API |

### Files to Create (5 files)

| File | Content |
|------|---------|
| `packages/core/src/caip/index.ts` | Barrel export for all caip module functions, types, schemas |
| `packages/core/src/caip/caip2.ts` | Caip2Schema, Caip2Params, parseCaip2, formatCaip2 |
| `packages/core/src/caip/caip19.ts` | Caip19AssetTypeSchema, Caip19Schema, Caip19Params, parseCaip19, formatCaip19 |
| `packages/core/src/caip/network-map.ts` | CAIP2_TO_NETWORK, NETWORK_TO_CAIP2, networkToCaip2, caip2ToNetwork |
| `packages/core/src/caip/asset-helpers.ts` | NATIVE_SLIP44, nativeAssetId, tokenAssetId, isNativeAsset |

### Test Files to Create (1-2 files)

| File | Coverage |
|------|----------|
| `packages/core/src/__tests__/caip.test.ts` | Full test suite: parse/format roundtrips, all 13 networks, Zod validation, native assets, token assets, isNativeAsset, EVM lowercase, Solana preservation, Polygon slip44:966, error cases |

## Sources

### Primary (HIGH confidence)
- [CAIP-2 Specification](https://standards.chainagnostic.org/CAIPs/caip-2) -- namespace regex `[-a-z0-9]{3,8}`, reference regex `[-_a-zA-Z0-9]{1,32}` (underscore confirmed)
- [CAIP-19 Specification](https://standards.chainagnostic.org/CAIPs/caip-19) -- asset_type format, asset_reference `[-.%a-zA-Z0-9]{1,128}`
- [CAIP-20 SLIP44 Namespace](https://standards.chainagnostic.org/CAIPs/caip-20) -- ETH=60, SOL=501
- [Solana CAIP-19 Namespace](https://namespaces.chainagnostic.org/solana/caip19) -- `token` namespace for SPL + Token-2022
- [EIP-155 CAIP-19 Namespace](https://namespaces.chainagnostic.org/eip155/caip19) -- `erc20` namespace, 0x-prefixed address
- [SLIP-0044 Registry](https://github.com/satoshilabs/slips/blob/master/slip-0044.md) -- ETH=60, SOL=501, MATIC/POL=966
- WAIaaS codebase: `x402.types.ts` (CAIP2_TO_NETWORK 13 entries), `wc-session-service.ts` (CAIP2_CHAIN_IDS duplicate), `price-oracle.types.ts` (TokenRefSchema), `chain.ts` (NETWORK_TYPES 13 values), `evm-chain-map.ts` (chain IDs), `builtin-tokens.ts` (EVM token addresses)

### Secondary (MEDIUM confidence)
- `.planning/research/caip19-STACK.md` -- library evaluation (verified npm metadata). Note: CAIP-2 reference regex missing underscore (discrepancy vs official spec).
- `.planning/research/SUMMARY.md` -- overall research summary with correct regex
- `.planning/research/m27-02-caip19-PITFALLS.md` -- 5 critical pitfalls documented
- `.planning/research/caip19-ARCHITECTURE.md` -- component map, data flow, file-by-file changes

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Zero new dependencies. Existing Zod + TypeScript infrastructure. All library alternatives evaluated and rejected with specific reasons.
- Architecture: HIGH -- 5 new files, 6 modified files. Clean internal dependency ordering. Existing foundation in x402.types.ts verified. Module structure follows established WAIaaS patterns (caip/ parallels enums/, utils/, errors/).
- Pitfalls: HIGH -- 6 pitfalls documented with specific file/line references. Critical pitfalls (C-01 EVM case, C-02 Solana case, Polygon slip44:966) verified against codebase. Regex discrepancy (underscore) verified against official CAIP-2 spec.

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable specs, no version churn expected)
