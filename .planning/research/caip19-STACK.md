# Technology Stack: CAIP-19 Asset Identification

**Project:** WAIaaS CAIP-19 Asset Identification (m27-02)
**Researched:** 2026-02-22

## Recommendation Summary

**Build a custom CAIP-2/CAIP-19 parser in `packages/core/src/caip/`** instead of using any npm library. The available libraries are either stale, bloated, or carry unnecessary dependencies. WAIaaS already has a partial CAIP-2 parser in `x402.types.ts` and Zod SSoT patterns that make a custom ~200 LOC implementation cleaner than any external dependency.

---

## Recommended Stack

### CAIP Parser (NEW -- custom implementation)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom `caip/` module | N/A | CAIP-2 + CAIP-19 parse/format/validate | See "Library Evaluation" below. Zero dependencies, Zod SSoT integration, ~200 LOC. Existing `parseCaip2()` in x402.types.ts is proof of concept. |
| Zod (existing) | 3.x | CAIP URI schema validation | Already SSoT. Regex-based Zod schemas replace need for external validator. |

### CoinGecko Platform Mapping (EXTEND existing)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `coingecko-platform-ids.ts` (existing) | N/A | Extend COINGECKO_PLATFORM_MAP with L2 entries | Currently only `solana` and `ethereum`. Add 4 L2 mainnet platforms for price oracle support. |

### No New Dependencies Required

The CAIP-19 feature requires **zero new npm packages**. All implementation uses existing Zod + TypeScript infrastructure.

---

## Library Evaluation: Why NOT to Use External Packages

### Candidate 1: `caip` (pedrouid/caip-js)

| Metric | Value | Assessment |
|--------|-------|------------|
| Version | 1.1.1 | Stable but unmaintained |
| Last publish | 2024-03-20 | Minor patch after 2 years of inactivity |
| Previous publish | 2022-04-27 (v1.1.0) | Nearly 2 years between updates |
| Weekly downloads | ~7,500 | LOW for production use |
| Unpacked size | 98.9 KB | EXCESSIVE for regex-based parsing |
| Dependencies | 0 | Good |
| TypeScript | Built with TS 3.7.5 | Outdated. No modern TS features. |
| Stars | 28 | Low community interest |
| License | MIT | Compatible |
| API | OOP: `ChainId`, `AccountId`, `AssetType`, `AssetId` classes | Over-engineered for our use case |
| CAIP-19 regex | `[-:a-zA-Z0-9]{11,115}` (AssetType) | **WRONG**: Official spec allows `.` and `%` in asset_reference but this regex does not |

**Verdict: REJECT.**
- Regex does not match CAIP-19 spec (`asset_reference` allows `[-.%a-zA-Z0-9]{1,128}` per official spec, but library uses `[-a-zA-Z0-9]` throughout).
- OOP class-based API conflicts with WAIaaS functional/Zod SSoT patterns.
- 98.9 KB for something achievable in ~200 LOC of custom code.
- Maintenance velocity is near-zero; if a spec bug exists, no fix will come.

**Confidence: HIGH** (verified via npm registry metadata, GitHub source inspection, spec cross-reference)

### Candidate 2: `@shapeshiftoss/caip`

| Metric | Value | Assessment |
|--------|-------|------------|
| Version | 8.16.7 (latest stable) | Actively maintained (117 versions) |
| Last publish | 2026-01-20 | Recent |
| Unpacked size | 4.36 MB | MASSIVELY BLOATED |
| Dependencies | axios ^1.13.0 | Drags in HTTP client -- unacceptable |
| License | MIT | Compatible |

**Verdict: REJECT.**
- 4.36 MB unpacked size is absurd for URI parsing.
- Pulls in `axios` as a runtime dependency for network requests (it bundles chain registry data fetching).
- ShapeShift-specific abstractions (chain adapters, asset service) irrelevant to WAIaaS.
- Breaks the "zero external deps for core parsing" principle.

**Confidence: HIGH** (verified via npm registry metadata)

### Candidate 3: `@agentcommercekit/caip`

| Metric | Value | Assessment |
|--------|-------|------------|
| Version | 0.1.0 | Pre-release |
| Dependencies | 0 | Good |
| License | MIT | Compatible |
| TypeScript | Yes (modern) | Good |

**Verdict: REJECT.**
- v0.1.0 pre-release. Zero track record.
- Part of a larger `agentcommercekit/ack` monorepo. Unclear maintenance trajectory.
- Cannot depend on a v0.1.0 package in production for a wallet system.

**Confidence: MEDIUM** (verified via npm, limited GitHub inspection due to 404 on source)

### Candidate 4: `caip-utils`

| Metric | Value | Assessment |
|--------|-------|------------|
| Version | 0.1.1 | Pre-release |
| Dependencies | 0 | Good |

**Verdict: REJECT.** Same reasoning as @agentcommercekit/caip -- too immature.

**Confidence: MEDIUM**

### Conclusion: Custom Implementation

All evaluated libraries fail on at least one critical criterion: spec compliance, size, maintenance, or dependency hygiene. A custom implementation in `packages/core/src/caip/` is the correct choice because:

1. **Spec compliance**: We control the regex to match CAIP-19 spec exactly.
2. **Zod SSoT integration**: Schemas integrate directly into existing derivation chain (Zod -> TS -> OpenAPI).
3. **Zero dependencies**: No new `node_modules` entries.
4. **Existing foundation**: `parseCaip2()` and `CAIP2_TO_NETWORK` already exist in `x402.types.ts`.
5. **Minimal code**: ~200 LOC for parser/formatter/validator/mapping.

---

## CAIP-2 / CAIP-19 Specification Reference

### CAIP-2 (Chain ID) -- [CAIP-2 Spec](https://standards.chainagnostic.org/CAIPs/caip-2)

```
chain_id:        namespace + ":" + reference
namespace:       [-a-z0-9]{3,8}
reference:       [-a-zA-Z0-9]{1,32}
```

**Regex**: `/^[-a-z0-9]{3,8}:[-a-zA-Z0-9]{1,32}$/`

### CAIP-19 (Asset Type) -- [CAIP-19 Spec](https://standards.chainagnostic.org/CAIPs/caip-19)

```
asset_type:      chain_id + "/" + asset_namespace + ":" + asset_reference
asset_namespace: [-a-z0-9]{3,8}
asset_reference: [-.%a-zA-Z0-9]{1,128}
```

**Regex**: `/^[-a-z0-9]{3,8}:[-a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$/`

### CAIP-19 Asset ID (with token_id, for NFTs -- out of scope for v27.2)

```
asset_id:        asset_type + "/" + token_id
token_id:        [-.%a-zA-Z0-9]{1,78}
```

**Regex**: `/^[-a-z0-9]{3,8}:[-a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}\/[-.%a-zA-Z0-9]{1,78}$/`

**Important note**: The `caip` npm package uses `[-a-zA-Z0-9]` for asset_reference, MISSING `.` and `%` characters from the official spec. Our custom implementation must include them.

**Confidence: HIGH** (verified via official spec at standards.chainagnostic.org)

---

## CAIP-2 Network Mapping Table (WAIaaS -- 13 networks)

Existing mapping from `packages/core/src/interfaces/x402.types.ts` to be extracted and unified:

| CAIP-2 Chain ID | WAIaaS ChainType | WAIaaS NetworkType | EVM Chain ID |
|----------------|-----------------|-------------------|--------------|
| `eip155:1` | ethereum | ethereum-mainnet | 1 |
| `eip155:11155111` | ethereum | ethereum-sepolia | 11155111 |
| `eip155:137` | ethereum | polygon-mainnet | 137 |
| `eip155:80002` | ethereum | polygon-amoy | 80002 |
| `eip155:42161` | ethereum | arbitrum-mainnet | 42161 |
| `eip155:421614` | ethereum | arbitrum-sepolia | 421614 |
| `eip155:10` | ethereum | optimism-mainnet | 10 |
| `eip155:11155420` | ethereum | optimism-sepolia | 11155420 |
| `eip155:8453` | ethereum | base-mainnet | 8453 |
| `eip155:84532` | ethereum | base-sepolia | 84532 |
| `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | solana | mainnet | N/A |
| `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | solana | devnet | N/A |
| `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z` | solana | testnet | N/A |

**Source**: Verified against existing codebase (`x402.types.ts` lines 20-36) and Solana CAIP-2 namespace spec.

**Confidence: HIGH**

---

## Asset Namespace Reference

### EVM Chains (eip155) -- [EIP155 CAIP-19 Namespace](https://namespaces.chainagnostic.org/eip155/caip19)

| Namespace | Standard | asset_reference | WAIaaS Use |
|-----------|----------|----------------|-----------|
| `slip44` | CAIP-20 | Unsigned integer (SLIP-44 coin type) | Native ETH: `slip44:60` |
| `erc20` | CAIP-21 | EVM contract address (0x-prefixed, 42 chars) | ERC-20 tokens |
| `erc721` | N/A | EVM contract address | Out of scope (NFTs) |

### Solana Chain -- [Solana CAIP-19 Namespace](https://namespaces.chainagnostic.org/solana/caip19)

| Namespace | Description | asset_reference | WAIaaS Use |
|-----------|-------------|----------------|-----------|
| `slip44` | Native SOL | `501` (SLIP-44 coin type) | Native SOL |
| `token` | SPL Fungible Token | Mint address (base58, 32-44 chars) | SPL tokens + Token-2022 |
| `nft` | SPL Non-Fungible Token | Mint address (base58) | Out of scope (NFTs) |

**Critical finding**: The Solana CAIP-19 namespace spec uses `token` (NOT `spl`) as the asset namespace for SPL fungible tokens. Both SPL and Token-2022 use the same `token` namespace because they share the mint address abstraction.

**Confidence: HIGH** (verified at namespaces.chainagnostic.org/solana/caip19)

---

## SLIP-44 Coin Type Numbers -- [SLIP-0044 Registry](https://github.com/satoshilabs/slips/blob/master/slip-0044.md)

| Coin | Symbol | SLIP-44 Type | CAIP-19 Native Asset Example |
|------|--------|-------------|------------------------------|
| Ethereum | ETH | 60 | `eip155:1/slip44:60` |
| Solana | SOL | 501 | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501` |

**Note**: L2 native tokens (MATIC/POL on Polygon, etc.) are ERC-20 tokens on the L2 chain, not separate SLIP-44 entries. For EVM L2 chains, the native gas token is ETH, so the native asset uses `slip44:60` regardless of which EVM chain. E.g., native ETH on Base is `eip155:8453/slip44:60` (ETH is coin type 60 on all EVM chains).

**Confidence: HIGH** (ETH=60 and SOL=501 verified via SLIP-0044 registry and CAIP-20 spec)

---

## CAIP-19 Examples (WAIaaS-relevant)

```
# Native assets
eip155:1/slip44:60                                                        # ETH on Ethereum mainnet
eip155:137/slip44:60                                                      # ETH (gas) on Polygon
eip155:42161/slip44:60                                                    # ETH on Arbitrum
eip155:10/slip44:60                                                       # ETH on Optimism
eip155:8453/slip44:60                                                     # ETH on Base
solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501                       # SOL on mainnet

# ERC-20 tokens
eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48                 # USDC on Ethereum
eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359               # USDC on Polygon
eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831             # USDC on Arbitrum
eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913              # USDC on Base

# SPL tokens (Solana)
solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v  # USDC on Solana mainnet
```

**EVM address canonicalization**: CAIP-19 spec does NOT require canonicalization, but WAIaaS should lowercase EVM addresses in CAIP-19 URIs for consistency (matches existing `address.toLowerCase()` pattern used in policy matching).

---

## CoinGecko Platform ID Mapping (EXTEND for L2 support)

### Current (`coingecko-platform-ids.ts`)

```typescript
export const COINGECKO_PLATFORM_MAP: Record<string, CoinGeckoPlatform> = {
  solana: { platformId: 'solana', nativeCoinId: 'solana' },
  ethereum: { platformId: 'ethereum', nativeCoinId: 'ethereum' },
};
```

### Extended Mapping (CAIP-2 keyed)

Re-key by CAIP-2 chain ID for unambiguous L2 support:

| CAIP-2 Chain ID | CoinGecko `platformId` | CoinGecko `nativeCoinId` | EVM Chain ID | WAIaaS Network |
|----------------|----------------------|------------------------|--------------|----------------|
| `eip155:1` | `ethereum` | `ethereum` | 1 | ethereum-mainnet |
| `eip155:137` | `polygon-pos` | `matic-network` | 137 | polygon-mainnet |
| `eip155:42161` | `arbitrum-one` | `ethereum` | 42161 | arbitrum-mainnet |
| `eip155:10` | `optimistic-ethereum` | `ethereum` | 10 | optimism-mainnet |
| `eip155:8453` | `base` | `ethereum` | 8453 | base-mainnet |
| `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `solana` | `solana` | N/A | mainnet |

**Note**: Testnets are excluded from CoinGecko mapping (no price data for testnet tokens).

**Confidence: MEDIUM** (polygon-pos=137 verified via CoinGecko docs. Other platform IDs based on CoinGecko's documented naming conventions and web search results. Should be verified with a live API call to `/asset_platforms` during implementation.)

---

## Zod Schema Patterns for CAIP Validation

### Recommended Zod Schemas (to be placed in `packages/core/src/caip/schemas.ts`)

```typescript
import { z } from 'zod';

// -- CAIP-2 Chain ID --
// Format: namespace:reference
// Example: "eip155:1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"

export const Caip2Schema = z.string().regex(
  /^[-a-z0-9]{3,8}:[-a-zA-Z0-9]{1,32}$/,
  'Invalid CAIP-2 chain ID format (expected namespace:reference)',
);
export type Caip2 = z.infer<typeof Caip2Schema>;

// -- CAIP-19 Asset Type --
// Format: chain_id/asset_namespace:asset_reference
// Example: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"

export const Caip19AssetTypeSchema = z.string().regex(
  /^[-a-z0-9]{3,8}:[-a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$/,
  'Invalid CAIP-19 asset type format (expected chainId/namespace:reference)',
);
export type Caip19AssetType = z.infer<typeof Caip19AssetTypeSchema>;

// -- Convenience alias (WAIaaS uses "AssetId" to mean AssetType) --
// Note: CAIP-19 "AssetId" technically includes token_id suffix for NFTs.
// WAIaaS only handles fungible tokens, so AssetType is sufficient.
// We alias it as Caip19Schema for API simplicity.

export const Caip19Schema = Caip19AssetTypeSchema;
export type Caip19 = Caip19AssetType;
```

**Integration with existing Zod SSoT**:
- These schemas follow the same pattern as `ChainTypeEnum`, `NetworkTypeEnum`, etc.
- Exported from `packages/core/src/caip/index.ts` and re-exported from `packages/core/src/index.ts`.
- Used in TokenRef extension: `assetId: Caip19Schema.optional()`.

**Confidence: HIGH** (regex patterns verified against official CAIP-19 spec)

---

## Implementation Plan: Parser/Formatter Module

### File: `packages/core/src/caip/caip2.ts`

```typescript
// Parsed CAIP-2 result
export interface Caip2Params {
  namespace: string;  // e.g., "eip155", "solana"
  reference: string;  // e.g., "1", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
}

export function parseCaip2(chainId: string): Caip2Params {
  Caip2Schema.parse(chainId); // Zod validation
  const idx = chainId.indexOf(':');
  return { namespace: chainId.slice(0, idx), reference: chainId.slice(idx + 1) };
}

export function formatCaip2(namespace: string, reference: string): string {
  const result = `${namespace}:${reference}`;
  Caip2Schema.parse(result); // validate on output too
  return result;
}
```

### File: `packages/core/src/caip/caip19.ts`

```typescript
export interface Caip19Params {
  chainId: string;        // CAIP-2 chain ID
  assetNamespace: string; // e.g., "slip44", "erc20", "token"
  assetReference: string; // e.g., "60", "0xa0b8...", "EPjF..."
}

export function parseCaip19(assetType: string): Caip19Params {
  Caip19Schema.parse(assetType);
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
  Caip19Schema.parse(result);
  return result;
}
```

### File: `packages/core/src/caip/network-map.ts`

Moves and extends `CAIP2_TO_NETWORK` + `NETWORK_TO_CAIP2` from `x402.types.ts`:
- Source of truth for all 13 WAIaaS networks.
- `x402.types.ts` imports from this module (backwards compatible).
- Adds `networkToCaip2()` and `caip2ToNetwork()` functions.

### File: `packages/core/src/caip/asset-helpers.ts`

```typescript
export function nativeAssetId(network: NetworkType): string {
  const caip2 = networkToCaip2(network);
  const { namespace } = parseCaip2(caip2);
  if (namespace === 'eip155') return formatCaip19(caip2, 'slip44', '60');
  if (namespace === 'solana') return formatCaip19(caip2, 'slip44', '501');
  throw new Error(`Unsupported namespace: ${namespace}`);
}

export function tokenAssetId(network: NetworkType, address: string): string {
  const caip2 = networkToCaip2(network);
  const { namespace } = parseCaip2(caip2);
  if (namespace === 'eip155') return formatCaip19(caip2, 'erc20', address.toLowerCase());
  if (namespace === 'solana') return formatCaip19(caip2, 'token', address);
  throw new Error(`Unsupported namespace: ${namespace}`);
}

export function isNativeAsset(caip19: string): boolean {
  const { assetNamespace } = parseCaip19(caip19);
  return assetNamespace === 'slip44';
}
```

---

## What NOT to Add

| Do NOT Add | Reason |
|------------|--------|
| `caip` npm package | Stale (last real update 2022), incorrect regex, OOP API |
| `@shapeshiftoss/caip` | 4.36 MB, drags in axios, massively over-scoped |
| `@agentcommercekit/caip` | v0.1.0, too immature for production wallet |
| `caip-utils` | v0.1.1, same immaturity issue |
| `caip-solana` / `caip-eip155` | Chain-specific helpers, unnecessary when building a universal parser |
| Any SLIP-44 lookup library (`slip44` npm) | Only need 2 values (ETH=60, SOL=501). A lookup table is overkill. |
| NFT support (erc721, nft namespace) | Out of scope. WAIaaS handles fungible tokens only. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CAIP Parser | Custom ~200 LOC | `caip` npm v1.1.1 | Wrong regex (missing `.%` in asset_reference), OOP API, stale maintenance |
| CAIP Parser | Custom ~200 LOC | `@shapeshiftoss/caip` v8.16.7 | 4.36 MB, requires axios, massively bloated |
| Zod Validation | Regex-based Zod schemas | Runtime class-based validation (caip npm) | Breaks Zod SSoT derivation chain |
| CoinGecko Mapping | Extend existing `COINGECKO_PLATFORM_MAP` | Fetch from `/asset_platforms` API at runtime | Adds HTTP dependency + latency. Static map is sufficient for 6 supported mainnets. |
| Solana SPL namespace | `token` | `spl` | Official CAIP namespace is `token`, not `spl`. Using `spl` would break interop. |
| EVM address case | Lowercase in CAIP-19 | Mixed-case (EIP-55 checksum) | CAIP-19 spec says canonicalization is optional; lowercase matches existing WAIaaS pattern |

---

## Installation

```bash
# No new packages needed.
# Zero npm install commands.
```

---

## Migration Path for Existing Code

### x402.types.ts Refactoring

```
BEFORE: CAIP2_TO_NETWORK defined in x402.types.ts
AFTER:  CAIP2_TO_NETWORK defined in caip/network-map.ts
        x402.types.ts re-exports from caip/network-map.ts
```

### coingecko-platform-ids.ts Extension

```
BEFORE: Keyed by ChainType ('solana' | 'ethereum') -- 2 entries
AFTER:  Keyed by CAIP-2 chain ID -- 6+ entries (mainnet networks)
        Old ChainType-keyed API preserved as compatibility wrapper
```

### TokenRef Extension

```
BEFORE: { address, symbol?, decimals, chain }
AFTER:  { address, symbol?, decimals, chain, assetId?, network? }
        assetId is optional for backwards compatibility
```

---

## Sources

- [CAIP-19 Specification](https://standards.chainagnostic.org/CAIPs/caip-19) -- HIGH confidence
- [CAIP-2 Specification](https://standards.chainagnostic.org/CAIPs/caip-2) -- HIGH confidence
- [CAIP-20 (SLIP44 Asset Namespace)](https://standards.chainagnostic.org/CAIPs/caip-20) -- HIGH confidence
- [EIP155 CAIP-19 Namespace](https://namespaces.chainagnostic.org/eip155/caip19) -- HIGH confidence
- [Solana CAIP-19 Namespace](https://namespaces.chainagnostic.org/solana/caip19) -- HIGH confidence
- [Solana CAIP-2 Namespace](https://namespaces.chainagnostic.org/solana/caip2) -- HIGH confidence
- [SLIP-0044 Registry](https://github.com/satoshilabs/slips/blob/master/slip-0044.md) -- HIGH confidence
- [CoinGecko Asset Platforms API](https://docs.coingecko.com/reference/asset-platforms-list) -- MEDIUM confidence (platform IDs verified for polygon-pos, others inferred from naming convention)
- [caip npm package](https://www.npmjs.com/package/caip) -- HIGH confidence (metadata verified via npm registry)
- [@shapeshiftoss/caip npm](https://www.npmjs.com/package/@shapeshiftoss/caip) -- HIGH confidence (metadata verified via npm registry)
- [pedrouid/caip-js GitHub](https://github.com/pedrouid/caip-js) -- HIGH confidence (source code inspected)
- Existing WAIaaS codebase (`x402.types.ts`, `coingecko-platform-ids.ts`, `chain.ts`) -- HIGH confidence (direct code inspection)
