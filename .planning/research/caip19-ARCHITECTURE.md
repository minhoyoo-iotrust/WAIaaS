# Architecture Patterns: CAIP-19 Asset Identification Integration

**Domain:** CAIP-19 asset identification standard integration into existing WAIaaS wallet system
**Researched:** 2026-02-22
**Source:** Codebase analysis (packages/core, packages/daemon), CAIP-19/CAIP-2 official specs, CoinGecko API docs, objective m27-02

## Executive Summary

CAIP-19 integration touches 6 major subsystems across 4 packages. The core insight from code analysis is that WAIaaS already has the CAIP-2 foundation in `x402.types.ts` (13 entries, bidirectional mapping, parser function). The integration is fundamentally a **widening operation**: extending the existing `chain:address` identification pattern to the standard `chainId/namespace:reference` URI format, then propagating that through TokenRef, price oracle, policy engine, and DB.

The architecture is designed around a **single new module** (`packages/core/src/caip/`) that becomes the canonical source for all chain/asset identification, consolidating the existing `CAIP2_TO_NETWORK` map from x402 and providing typed parsers/formatters that flow through the Zod SSoT pipeline.

---

## Recommended Architecture

### High-Level Component Map

```
packages/core/src/caip/          <-- NEW: CAIP module (parsers, maps, schemas)
    |
    +-- caip2.ts                 <-- CAIP-2 parser/formatter + Zod schema
    +-- caip19.ts                <-- CAIP-19 parser/formatter + Zod schema
    +-- network-map.ts           <-- Consolidated NetworkType <-> CAIP-2 bidirectional map
    +-- asset-helpers.ts         <-- nativeAssetId(), tokenAssetId(), isNativeAsset()
    +-- index.ts                 <-- Barrel export
    |
packages/core/src/interfaces/
    +-- price-oracle.types.ts    <-- MODIFY: TokenRef gains assetId + network
    +-- x402.types.ts            <-- MODIFY: CAIP2_TO_NETWORK re-exported from caip/
    |
packages/core/src/schemas/
    +-- transaction.schema.ts    <-- MODIFY: TokenInfoSchema gains assetId
    +-- policy.schema.ts         <-- MODIFY: AllowedTokensRulesSchema gains assetId
    |
packages/daemon/src/
    +-- infrastructure/oracle/
    |   +-- price-cache.ts       <-- MODIFY: buildCacheKey uses CAIP-19
    |   +-- coingecko-platform-ids.ts <-- MODIFY: CAIP-2 keyed platform map
    |   +-- coingecko-oracle.ts  <-- MODIFY: network-aware platform resolution
    |   +-- oracle-chain.ts      <-- MODIFY: cache key format change
    +-- infrastructure/database/
    |   +-- schema.ts            <-- MODIFY: token_registry gains asset_id column
    |   +-- migrate.ts           <-- MODIFY: migration v22 for asset_id
    +-- infrastructure/token-registry/
    |   +-- token-registry-service.ts <-- MODIFY: assetId in return types
    +-- pipeline/
    |   +-- database-policy-engine.ts <-- MODIFY: ALLOWED_TOKENS assetId matching
    |   +-- stages.ts            <-- MODIFY: assetId extraction for policy params
    |   +-- resolve-effective-amount-usd.ts <-- MODIFY: TokenRef with network
    +-- api/routes/
        +-- tokens.ts            <-- MODIFY: assetId in request/response
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `caip/caip2.ts` | Parse/format CAIP-2 chain identifiers, Zod validation | network-map.ts, caip19.ts |
| `caip/caip19.ts` | Parse/format CAIP-19 asset identifiers, Zod validation | caip2.ts, asset-helpers.ts |
| `caip/network-map.ts` | Bidirectional NetworkType <-> CAIP-2 mapping (consolidates x402 map) | caip2.ts, chain.ts enums |
| `caip/asset-helpers.ts` | Convenience: nativeAssetId, tokenAssetId, resolveFromAssetId | caip19.ts, network-map.ts |
| `price-oracle.types.ts` | Extended TokenRef with assetId + network fields | caip19.ts (via Zod schema) |
| `price-cache.ts` | CAIP-19 based cache keys for price data | caip/asset-helpers.ts |
| `coingecko-platform-ids.ts` | CAIP-2 keyed CoinGecko platform resolution (L2 support) | caip/network-map.ts |
| `database-policy-engine.ts` | ALLOWED_TOKENS matching with assetId priority | caip/caip19.ts |
| `schema.ts` (Drizzle) | token_registry with asset_id column | migrate.ts |
| `migrate.ts` | DB migration v22: ALTER TABLE + auto-populate | network-map.ts, asset-helpers.ts |

### Data Flow

```
API Request (assetId or address+chain)
    |
    v
Stage 1 Validate: Zod parse TransactionRequestSchema
    |  - If assetId present: parseCaip19() -> extract chain, namespace, address
    |  - If assetId absent: legacy path (address + chain field)
    |  - Cross-validate: if both assetId and address, verify consistency
    v
Stage 3 Policy: DatabasePolicyEngine.evaluate()
    |  - ALLOWED_TOKENS: match by assetId first, fallback to address
    |  - CONTRACT_WHITELIST: match by address (CAIP-19 not applicable)
    v
Price Oracle: resolveEffectiveAmountUsd()
    |  - Build TokenRef with network field (from assetId or wallet context)
    |  - buildCacheKey() now produces CAIP-19 formatted keys
    |  - CoinGecko: resolve platform from CAIP-2 chain ID (L2 aware)
    v
Stage 5 Execute: adapter.buildTokenTransfer()
    |  - Pass token.address (extracted from assetId if needed)
    |  - Adapter layer unchanged (works with raw addresses)
    v
Response: include assetId in transaction record
```

---

## New Module: packages/core/src/caip/

### caip2.ts

**Confidence: HIGH** (spec verified at standards.chainagnostic.org)

```typescript
import { z } from 'zod';

// CAIP-2 regex: namespace (3-8 lowercase alphanum+hyphen) : reference (1-32 mixed case)
export const Caip2Schema = z.string().regex(
  /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/,
  'Invalid CAIP-2 chain identifier'
);
export type Caip2 = z.infer<typeof Caip2Schema>;

export interface ParsedCaip2 {
  namespace: string;   // e.g. 'eip155', 'solana'
  reference: string;   // e.g. '1', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
}

export function parseCaip2(chainId: string): ParsedCaip2 {
  const idx = chainId.indexOf(':');
  if (idx === -1) throw new Error(`Invalid CAIP-2: ${chainId}`);
  return { namespace: chainId.slice(0, idx), reference: chainId.slice(idx + 1) };
}

export function formatCaip2(namespace: string, reference: string): string {
  return `${namespace}:${reference}`;
}
```

**Design decision**: Direct implementation, not npm `caip` package. Rationale:
- The `caip` npm package (v1.1.1) was last published 2+ years ago -- inactive maintenance.
- WAIaaS's Zod SSoT discipline requires Zod schemas as the source of truth. External libraries use their own validation approach.
- The parsing logic is trivial (string split on `:` and `/`), adding zero value from external dependency.
- Zero new dependencies aligns with the WAIaaS v1.5 decision pattern.

### caip19.ts

**Confidence: HIGH** (spec verified)

```typescript
import { z } from 'zod';
import { type ParsedCaip2, parseCaip2, Caip2Schema } from './caip2.js';

// CAIP-19 asset_type: chain_id / asset_namespace : asset_reference
// asset_namespace: [-a-z0-9]{3,8}
// asset_reference: [-.%a-zA-Z0-9]{1,128}
export const Caip19Schema = z.string().regex(
  /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$/,
  'Invalid CAIP-19 asset identifier'
);
export type Caip19 = z.infer<typeof Caip19Schema>;

export interface ParsedCaip19 {
  chainId: string;          // full CAIP-2 string, e.g. 'eip155:1'
  chain: ParsedCaip2;       // parsed chain components
  assetNamespace: string;   // e.g. 'slip44', 'erc20', 'token'
  assetReference: string;   // e.g. '60', '0xa0b8...', 'EPjFW...'
}

export function parseCaip19(assetId: string): ParsedCaip19 {
  const slashIdx = assetId.indexOf('/');
  if (slashIdx === -1) throw new Error(`Invalid CAIP-19: missing /`);
  const chainId = assetId.slice(0, slashIdx);
  const assetPart = assetId.slice(slashIdx + 1);
  const colonIdx = assetPart.indexOf(':');
  if (colonIdx === -1) throw new Error(`Invalid CAIP-19: missing asset namespace separator`);
  return {
    chainId,
    chain: parseCaip2(chainId),
    assetNamespace: assetPart.slice(0, colonIdx),
    assetReference: assetPart.slice(colonIdx + 1),
  };
}

export function formatCaip19(
  chainId: string,
  assetNamespace: string,
  assetReference: string,
): string {
  return `${chainId}/${assetNamespace}:${assetReference}`;
}
```

### network-map.ts (Consolidates x402 CAIP2_TO_NETWORK)

**Critical integration point**: This module replaces the existing `CAIP2_TO_NETWORK` and `NETWORK_TO_CAIP2` maps from `x402.types.ts`, re-exporting them for backward compatibility.

```typescript
import type { ChainType, NetworkType } from '../enums/chain.js';

// Canonical CAIP-2 <-> WAIaaS NetworkType mapping (13 entries, matching x402)
export const CAIP2_TO_NETWORK: Record<string, { chain: ChainType; network: NetworkType }> = {
  // EVM
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
  // Solana
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

export function caip2ToNetwork(chainId: string): { chain: ChainType; network: NetworkType } {
  const resolved = CAIP2_TO_NETWORK[chainId];
  if (!resolved) throw new Error(`Unsupported CAIP-2 chain: ${chainId}`);
  return resolved;
}
```

**x402.types.ts migration**: The existing `CAIP2_TO_NETWORK`, `NETWORK_TO_CAIP2`, `parseCaip2`, and `resolveX402Network` in `x402.types.ts` should be replaced with re-exports from `caip/`:

```typescript
// x402.types.ts -- after consolidation
export { CAIP2_TO_NETWORK, NETWORK_TO_CAIP2 } from '../caip/index.js';
export { parseCaip2 } from '../caip/index.js';
// resolveX402Network becomes caip2ToNetwork, aliased for backward compat
export { caip2ToNetwork as resolveX402Network } from '../caip/index.js';
```

### asset-helpers.ts

**Confidence: HIGH** (CAIP-19 spec + Solana namespace spec verified)

Key finding from research: The official Solana CAIP-19 namespace uses **`token`** (not `spl` or `spl-token`). This was confirmed at `namespaces.chainagnostic.org/solana/caip19`.

```typescript
import { formatCaip19, parseCaip19, type ParsedCaip19 } from './caip19.js';
import { networkToCaip2 } from './network-map.js';
import type { NetworkType } from '../enums/chain.js';

// Native asset SLIP-44 coin types
const NATIVE_SLIP44: Record<string, string> = {
  ethereum: '60',   // ETH
  solana: '501',    // SOL
};

// Asset namespace for fungible tokens per chain namespace
const TOKEN_NAMESPACE: Record<string, string> = {
  eip155: 'erc20',   // EVM: ERC-20 tokens
  solana: 'token',   // Solana: SPL tokens (official CASA namespace)
};

/**
 * Build CAIP-19 identifier for a native asset (ETH, SOL).
 * Example: nativeAssetId('ethereum-mainnet') -> 'eip155:1/slip44:60'
 */
export function nativeAssetId(network: NetworkType): string {
  const caip2 = networkToCaip2(network);
  const namespace = caip2.split(':')[0]!;
  const coinType = namespace === 'eip155' ? NATIVE_SLIP44.ethereum : NATIVE_SLIP44.solana;
  if (!coinType) throw new Error(`No SLIP-44 coin type for namespace: ${namespace}`);
  return formatCaip19(caip2, 'slip44', coinType);
}

/**
 * Build CAIP-19 identifier for a fungible token.
 * Example: tokenAssetId('ethereum-mainnet', '0xa0b8...') -> 'eip155:1/erc20:0xa0b8...'
 * Example: tokenAssetId('mainnet', 'EPjFW...') -> 'solana:5eykt.../token:EPjFW...'
 *
 * EVM addresses are stored lowercase for consistency (matching CoinGecko + buildCacheKey convention).
 */
export function tokenAssetId(network: NetworkType, address: string): string {
  const caip2 = networkToCaip2(network);
  const chainNamespace = caip2.split(':')[0]!;
  const assetNs = TOKEN_NAMESPACE[chainNamespace];
  if (!assetNs) throw new Error(`No token namespace for chain: ${chainNamespace}`);
  const normalizedAddr = chainNamespace === 'eip155' ? address.toLowerCase() : address;
  return formatCaip19(caip2, assetNs, normalizedAddr);
}

/**
 * Check if a CAIP-19 identifier refers to a native asset (slip44 namespace).
 */
export function isNativeAsset(assetId: string): boolean {
  const parsed = parseCaip19(assetId);
  return parsed.assetNamespace === 'slip44';
}

/**
 * Extract token address from a CAIP-19 identifier.
 * For erc20/token namespace: returns the asset reference (contract/mint address).
 * For slip44 (native): returns 'native'.
 */
export function extractAddress(assetId: string): string {
  const parsed = parseCaip19(assetId);
  if (parsed.assetNamespace === 'slip44') return 'native';
  return parsed.assetReference;
}

/**
 * Resolve a CAIP-19 to its constituent parts for backward compatibility.
 * Returns { chain, network, address, isNative }.
 */
export function resolveAssetId(assetId: string): {
  chain: string;
  network: string;
  address: string;
  isNative: boolean;
} { ... }
```

### Barrel Export (index.ts)

```typescript
// CAIP-2
export { Caip2Schema, type Caip2, type ParsedCaip2, parseCaip2, formatCaip2 } from './caip2.js';
// CAIP-19
export { Caip19Schema, type Caip19, type ParsedCaip19, parseCaip19, formatCaip19 } from './caip19.js';
// Network mapping (consolidates x402)
export { CAIP2_TO_NETWORK, NETWORK_TO_CAIP2, networkToCaip2, caip2ToNetwork } from './network-map.js';
// Asset helpers
export { nativeAssetId, tokenAssetId, isNativeAsset, extractAddress, resolveAssetId } from './asset-helpers.js';
```

---

## Existing File Modifications

### 1. TokenRef Extension (price-oracle.types.ts)

**Current state**: TokenRef has `address`, `symbol?`, `decimals`, `chain: ChainType`.
**Problem**: No network field means CoinGecko can't distinguish L2 tokens (Polygon USDC vs Ethereum USDC use the same `chain: 'ethereum'`).

```typescript
// Extended TokenRef
export const TokenRefSchema = z.object({
  /** CAIP-19 asset identifier (optional, takes priority over address+chain). */
  assetId: Caip19Schema.optional(),
  /** Token address (mint for Solana, contract for EVM). */
  address: z.string().min(1, 'Token address is required'),
  /** Token symbol (optional, for display/logging). */
  symbol: z.string().optional(),
  /** Decimal places. */
  decimals: z.number().int().min(0).max(18),
  /** Target chain. */
  chain: ChainTypeEnum,
  /** Network for L2 resolution (optional, derived from assetId when available). */
  network: NetworkTypeEnum.optional(),
});
```

**Backward compatibility**: Both new fields are optional. Existing code that constructs `TokenRef` with only `{ address, decimals, chain }` continues to work. The oracle chain gracefully degrades to chain-level lookup when network is absent.

### 2. Price Cache Key Migration (price-cache.ts)

**Current state**: `buildCacheKey(chain, address)` produces `ethereum:0xa0b8...`
**Target state**: `buildCacheKey()` produces CAIP-19 when network is available, falls back to `chain:address` for backward compat.

```typescript
import { tokenAssetId, nativeAssetId } from '@waiaas/core';
import type { NetworkType } from '@waiaas/core';

/**
 * Build a normalized cache key.
 *
 * When network is available, produces CAIP-19 format (e.g. 'eip155:1/erc20:0xa0b8...').
 * Without network, falls back to legacy format (e.g. 'ethereum:0xa0b8...') for
 * backward compatibility during migration.
 */
export function buildCacheKey(chain: string, address: string, network?: string): string {
  if (network) {
    try {
      if (address === 'native') return nativeAssetId(network as NetworkType);
      return tokenAssetId(network as NetworkType, address);
    } catch {
      // Fallback to legacy format if network mapping fails
    }
  }
  // Legacy format
  const normalizedAddress = chain === 'ethereum' ? address.toLowerCase() : address;
  return `${chain}:${normalizedAddress}`;
}
```

**Migration strategy**: Cache keys change format, but this is a volatile in-memory cache that rebuilds on daemon restart. No persistent data migration needed. The cache will naturally fill with CAIP-19 keys as requests with network context arrive.

### 3. CoinGecko Platform ID Extension (coingecko-platform-ids.ts)

**Current state**: Only maps `solana` and `ethereum` chain types. Comment explicitly says "L2 platformIds out of v1.5 scope."

**Target state**: CAIP-2 keyed map enabling L2 token price queries.

```typescript
// Keyed by CAIP-2 chain ID (not ChainType)
export const COINGECKO_PLATFORM_MAP: Record<string, CoinGeckoPlatform> = {
  // Legacy keys (backward compat)
  'solana':   { platformId: 'solana', nativeCoinId: 'solana' },
  'ethereum': { platformId: 'ethereum', nativeCoinId: 'ethereum' },
  // CAIP-2 keyed (L2 support)
  'eip155:1':        { platformId: 'ethereum', nativeCoinId: 'ethereum' },
  'eip155:137':      { platformId: 'polygon-pos', nativeCoinId: 'matic-network' },
  'eip155:42161':    { platformId: 'arbitrum-one', nativeCoinId: 'ethereum' },
  'eip155:10':       { platformId: 'optimistic-ethereum', nativeCoinId: 'ethereum' },
  'eip155:8453':     { platformId: 'base', nativeCoinId: 'ethereum' },
  // Testnets: no CoinGecko coverage (returns undefined, graceful fallback)
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': { platformId: 'solana', nativeCoinId: 'solana' },
};

/**
 * Look up CoinGecko platform. Tries CAIP-2 first, falls back to chain type.
 */
export function getCoinGeckoPlatform(
  chain: string,
  network?: string,
): CoinGeckoPlatform | undefined {
  if (network) {
    // Try CAIP-2 lookup
    const caip2 = NETWORK_TO_CAIP2[network as NetworkType];
    if (caip2) {
      const platform = COINGECKO_PLATFORM_MAP[caip2];
      if (platform) return platform;
    }
  }
  // Fallback to legacy chain-level lookup
  return COINGECKO_PLATFORM_MAP[chain];
}
```

**CoinGecko platform IDs verified via API docs** (MEDIUM confidence):
- `polygon-pos` (chain ID 137)
- `arbitrum-one` (chain ID 42161)
- `optimistic-ethereum` (chain ID 10)
- `base` (chain ID 8453)

Note: Testnets (Sepolia, Amoy, Arbitrum Sepolia, etc.) have no CoinGecko token price coverage. The function returns `undefined` for these, which is the existing graceful degradation path.

### 4. CoinGecko Oracle Network-Aware Queries (coingecko-oracle.ts)

**Current state**: `getPrice(token)` uses `getCoinGeckoPlatform(token.chain)` -- chain-level only.
**Modification**: Pass `token.network` to enable L2 platform resolution.

```typescript
async getPrice(token: TokenRef): Promise<PriceInfo> {
  // ...
  const platform = getCoinGeckoPlatform(token.chain, token.network);
  // rest unchanged
}
```

This is a minimal change. The `TokenRef.network` field flows through naturally.

### 5. Database Migration v22: token_registry.asset_id

**Current schema**: `token_registry` has `(network, address)` unique index.
**New column**: `asset_id TEXT` -- auto-populated from `(network, address)` using CAIP-19 format.

```sql
-- Migration v22: Add asset_id to token_registry
ALTER TABLE token_registry ADD COLUMN asset_id TEXT;

-- Auto-populate existing records
-- This requires application-level logic since CAIP-2 mapping is in JS, not SQL.
-- Migration runner executes:
--   1. ALTER TABLE (above)
--   2. SELECT all rows
--   3. For each row: compute tokenAssetId(row.network, row.address)
--   4. UPDATE SET asset_id = computed value
--   5. CREATE UNIQUE INDEX idx_token_registry_asset_id ON token_registry(asset_id)
--      (only after population, since NULL values would violate unique)
```

**Implementation in migrate.ts**:

```typescript
{
  version: 22,
  description: 'Add asset_id column to token_registry',
  up(db: Database) {
    db.exec('ALTER TABLE token_registry ADD COLUMN asset_id TEXT');

    // Auto-populate from (network, address)
    const rows = db.prepare('SELECT id, network, address FROM token_registry').all() as Array<{
      id: string; network: string; address: string;
    }>;

    const update = db.prepare('UPDATE token_registry SET asset_id = ? WHERE id = ?');
    for (const row of rows) {
      try {
        const assetId = tokenAssetId(row.network as NetworkType, row.address);
        update.run(assetId, row.id);
      } catch {
        // Skip rows with unmappable networks (shouldn't happen for valid data)
      }
    }

    // Create unique index after population
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_token_registry_asset_id ON token_registry(asset_id)');
  },
}
```

**Why not make asset_id NOT NULL**: Existing rows may fail mapping if the network is not in the CAIP-2 map. The column stays nullable, and the unique index allows NULLs in SQLite (multiple NULL values don't conflict). New inserts will always include asset_id.

### 6. Policy Engine: ALLOWED_TOKENS with assetId (database-policy-engine.ts)

**Current state**: `evaluateAllowedTokens()` matches only by `tokenAddress` (case-insensitive).
**Extension**: When policy rule has `assetId` field, match against full CAIP-19. When request has `assetId`, extract chain+network+address for precise matching.

```typescript
private evaluateAllowedTokens(
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  if (transaction.type !== 'TOKEN_TRANSFER') return null;

  const allowedTokensPolicy = resolved.find((p) => p.type === 'ALLOWED_TOKENS');
  if (!allowedTokensPolicy) { /* existing default deny logic */ }

  const rules: AllowedTokensRules = JSON.parse(allowedTokensPolicy.rules);
  const tokenAddress = transaction.tokenAddress;
  const txAssetId = transaction.assetId; // NEW: from request

  if (!tokenAddress && !txAssetId) {
    return { allowed: false, tier: 'INSTANT', reason: 'Token transfer missing token identifier' };
  }

  const isAllowed = rules.tokens.some((t) => {
    // Priority 1: assetId-to-assetId match (exact, case-sensitive for Solana)
    if (t.assetId && txAssetId) {
      return t.assetId === txAssetId;
    }
    // Priority 2: address match (case-insensitive for EVM, exact for Solana)
    if (tokenAddress) {
      return t.address.toLowerCase() === tokenAddress.toLowerCase();
    }
    return false;
  });

  if (!isAllowed) {
    return { allowed: false, tier: 'INSTANT', reason: `Token not in allowed list: ${txAssetId ?? tokenAddress}` };
  }
  return null;
}
```

**TransactionParam extension**:

```typescript
interface TransactionParam {
  // ... existing fields ...
  /** CAIP-19 asset identifier (NEW, optional). */
  assetId?: string;
}
```

### 7. Transaction Schema: TokenInfoSchema Extension (transaction.schema.ts)

**Current state**: `TokenInfoSchema` has `address`, `decimals`, `symbol`.
**Extension**: Add optional `assetId` field.

```typescript
const TokenInfoSchema = z.object({
  address: z.string().min(1),
  decimals: z.number().int().min(0).max(18),
  symbol: z.string().min(1).max(10),
  assetId: Caip19Schema.optional(),  // NEW
});
```

**Backward compatibility**: `assetId` is optional. Existing API consumers sending `{ address, decimals, symbol }` continue to work. When `assetId` is provided, Stage 1 validates it against address (if both present).

### 8. AllowedTokensRulesSchema Extension (policy.schema.ts)

```typescript
const AllowedTokensRulesSchema = z.object({
  tokens: z.array(z.object({
    address: z.string().min(1),
    symbol: z.string().min(1).max(10).optional(),
    chain: ChainTypeEnum.optional(),
    assetId: Caip19Schema.optional(),  // NEW
  })).min(1, 'At least one token required'),
});
```

### 9. x402.types.ts Consolidation

**Current state**: Contains `CAIP2_TO_NETWORK`, `NETWORK_TO_CAIP2`, `parseCaip2`, `resolveX402Network`.
**After consolidation**: These are re-exported from `caip/` module.

```typescript
// packages/core/src/interfaces/x402.types.ts (after)
// CAIP-2 mapping consolidated into caip/ module -- re-export for backward compatibility
export { CAIP2_TO_NETWORK, NETWORK_TO_CAIP2, parseCaip2 } from '../caip/index.js';
export { caip2ToNetwork as resolveX402Network } from '../caip/index.js';

// ... rest of x402 types unchanged ...
```

This ensures zero breaking changes for existing consumers that import from `x402.types.ts`.

---

## Patterns to Follow

### Pattern 1: Optional Field with Priority Resolution

**What**: New `assetId` fields are always optional. When present, they take priority over legacy `address`+`chain` fields. When absent, legacy behavior is unchanged.

**When**: Every touch point where assetId is introduced (TokenRef, TokenInfoSchema, policy rules, transaction params).

**Example**:
```typescript
// Resolution priority
function resolveToken(input: { assetId?: string; address: string; chain: string; network?: string }): ResolvedToken {
  if (input.assetId) {
    const parsed = parseCaip19(input.assetId);
    const resolved = caip2ToNetwork(parsed.chainId);
    return {
      address: parsed.assetReference,
      chain: resolved.chain,
      network: resolved.network,
      assetId: input.assetId,
    };
  }
  return {
    address: input.address,
    chain: input.chain as ChainType,
    network: input.network as NetworkType | undefined,
    assetId: input.network ? tokenAssetId(input.network as NetworkType, input.address) : undefined,
  };
}
```

### Pattern 2: Cache Key Migration via Volatile Cache

**What**: In-memory caches that change key format don't need data migration. They naturally refill after daemon restart.

**When**: `InMemoryPriceCache` keys change from `chain:address` to CAIP-19 format.

**Why safe**: The cache is purely volatile (RAM-only, lost on restart). Old-format keys coexist with new-format keys during the transition. No stale data risk -- TTL ensures cleanup.

### Pattern 3: DB Column Addition with Application-Level Backfill

**What**: Add nullable column, populate via application logic (not pure SQL), then optionally create index.

**When**: `asset_id` column on `token_registry`. CAIP-19 computation requires JavaScript (CAIP-2 mapping table), not expressible in pure SQLite SQL.

**Why this way**: SQLite ALTER TABLE only supports ADD COLUMN. The CAIP-2 mapping lives in JavaScript. Running a SELECT+loop+UPDATE in the migration runner is the established WAIaaS pattern (see migration v6b for the environment model migration).

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Making assetId Required Too Early

**What**: Forcing all API consumers to provide `assetId` immediately.
**Why bad**: Breaking change for SDK, MCP tools, existing integrations. The objective file explicitly requires backward compatibility.
**Instead**: `assetId` is optional everywhere. The system auto-generates it when possible (from `network` + `address`) and includes it in responses. Future milestone can deprecate address-only paths.

### Anti-Pattern 2: Dual Cache Key Formats Without Migration Path

**What**: Supporting both `chain:address` and CAIP-19 cache keys indefinitely without converging.
**Why bad**: Same token cached under two different keys wastes memory and causes cache misses.
**Instead**: `buildCacheKey()` always tries CAIP-19 first when network is available. Old format is only used when network is absent. As callers add network context, keys naturally converge.

### Anti-Pattern 3: Storing CAIP-19 as the Only Identifier in DB

**What**: Replacing `(network, address)` with only `asset_id` in token_registry.
**Why bad**: Existing queries use `(network, address)` index. Foreign keys and joins depend on it.
**Instead**: `asset_id` is an additional column alongside existing `network` and `address`. Both indexes coexist. Queries can use either path.

### Anti-Pattern 4: Parsing CAIP-19 at the Adapter Layer

**What**: Making chain adapters (SolanaAdapter, EvmAdapter) parse CAIP-19 identifiers.
**Why bad**: Adapters work with raw addresses and chain-specific types. Adding CAIP awareness violates their single responsibility.
**Instead**: CAIP-19 is resolved to `{ address, chain, network }` before reaching the adapter layer. Adapters remain chain-specific and address-based.

---

## Module Dependency Graph

```
packages/core/src/caip/
  caip2.ts          (no deps)
  caip19.ts         -> caip2.ts
  network-map.ts    -> caip2.ts, ../enums/chain.ts
  asset-helpers.ts  -> caip19.ts, network-map.ts, ../enums/chain.ts
  index.ts          -> all above

packages/core/src/interfaces/
  x402.types.ts     -> caip/ (re-exports, replaces inline CAIP-2 map)
  price-oracle.types.ts -> caip/ (Caip19Schema for assetId field)

packages/core/src/schemas/
  transaction.schema.ts -> caip/ (Caip19Schema for TokenInfoSchema.assetId)
  policy.schema.ts      -> caip/ (Caip19Schema for AllowedTokensRules.assetId)

packages/daemon/src/
  infrastructure/oracle/
    price-cache.ts              -> caip/ (nativeAssetId, tokenAssetId)
    coingecko-platform-ids.ts   -> caip/ (NETWORK_TO_CAIP2)
    coingecko-oracle.ts         -> coingecko-platform-ids.ts (getCoinGeckoPlatform signature change)
    oracle-chain.ts             -> price-cache.ts (buildCacheKey signature change)

  infrastructure/database/
    schema.ts                   -> (add asset_id column def)
    migrate.ts                  -> caip/ (tokenAssetId for backfill)

  infrastructure/token-registry/
    token-registry-service.ts   -> caip/ (add assetId to return)

  pipeline/
    database-policy-engine.ts   -> caip/ (assetId matching)
    stages.ts                   -> (extract assetId from request for TransactionParam)
    resolve-effective-amount-usd.ts -> (pass network to TokenRef)
```

---

## Files to Create vs Modify

### New Files (5)

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `packages/core/src/caip/caip2.ts` | ~40 | CAIP-2 parser/formatter + Zod schema |
| `packages/core/src/caip/caip19.ts` | ~50 | CAIP-19 parser/formatter + Zod schema |
| `packages/core/src/caip/network-map.ts` | ~55 | Consolidated CAIP-2 <-> NetworkType map |
| `packages/core/src/caip/asset-helpers.ts` | ~80 | Convenience functions |
| `packages/core/src/caip/index.ts` | ~15 | Barrel export |

### Modified Files (14)

| File | Change | Complexity |
|------|--------|------------|
| `packages/core/src/index.ts` | Add caip/ exports | Low |
| `packages/core/src/interfaces/index.ts` | Re-export caip types | Low |
| `packages/core/src/interfaces/x402.types.ts` | Replace inline CAIP-2 map with caip/ re-exports | Low |
| `packages/core/src/interfaces/price-oracle.types.ts` | Add assetId + network to TokenRef | Low |
| `packages/core/src/schemas/transaction.schema.ts` | Add assetId to TokenInfoSchema | Low |
| `packages/core/src/schemas/policy.schema.ts` | Add assetId to AllowedTokensRulesSchema | Low |
| `packages/daemon/src/infrastructure/database/schema.ts` | Add asset_id column to tokenRegistry | Low |
| `packages/daemon/src/infrastructure/database/migrate.ts` | Add migration v22 | Medium |
| `packages/daemon/src/infrastructure/oracle/price-cache.ts` | Update buildCacheKey signature | Low |
| `packages/daemon/src/infrastructure/oracle/coingecko-platform-ids.ts` | CAIP-2 keyed platform map | Medium |
| `packages/daemon/src/infrastructure/oracle/coingecko-oracle.ts` | Pass network to getCoinGeckoPlatform | Low |
| `packages/daemon/src/infrastructure/token-registry/token-registry-service.ts` | Add assetId to return types | Low |
| `packages/daemon/src/pipeline/database-policy-engine.ts` | assetId matching in ALLOWED_TOKENS | Medium |
| `packages/daemon/src/pipeline/stages.ts` | Extract assetId from request for TransactionParam | Low |

---

## Suggested Build Order (Phase Dependencies)

```
Phase 1: Core CAIP Module + x402 Consolidation
  Create: caip/{caip2,caip19,network-map,asset-helpers,index}.ts
  Modify: x402.types.ts (re-export from caip/)
  Modify: core/index.ts, interfaces/index.ts (barrel exports)
  Test: Unit tests for all parsers, formatters, mappers (13 networks roundtrip)
  Dependency: None

Phase 2: TokenRef Extension + Oracle L2 Support
  Modify: price-oracle.types.ts (assetId + network fields)
  Modify: coingecko-platform-ids.ts (CAIP-2 keyed map)
  Modify: coingecko-oracle.ts (network-aware platform resolution)
  Modify: price-cache.ts (buildCacheKey with network param)
  Modify: oracle-chain.ts (pass network through)
  Modify: resolve-effective-amount-usd.ts (network in TokenRef)
  Test: L2 token price lookup (Polygon USDC via polygon-pos platform)
  Dependency: Phase 1 (uses caip/ exports)

Phase 3: DB Migration + Token Registry + Transaction Schema
  Modify: schema.ts (asset_id column)
  Modify: migrate.ts (migration v22)
  Modify: token-registry-service.ts (assetId in returns)
  Modify: transaction.schema.ts (TokenInfoSchema assetId)
  Modify: policy.schema.ts (AllowedTokensRulesSchema assetId)
  Test: Migration test, schema snapshot, roundtrip
  Dependency: Phase 1 (uses tokenAssetId for backfill)

Phase 4: Pipeline + Policy + API + MCP + Skills
  Modify: database-policy-engine.ts (assetId matching)
  Modify: stages.ts (extract assetId for TransactionParam)
  Modify: API routes (assetId in request/response)
  Modify: MCP tools (send_token, approve_token assetId params)
  Modify: skills/ files
  Test: E2E with assetId-bearing requests, backward compat without assetId
  Dependency: Phase 2, Phase 3 (uses extended TokenRef, DB schema, pipeline)
```

**Phase ordering rationale**:
1. Phase 1 first because every other phase imports from `caip/`.
2. Phase 2 before Phase 3 because the oracle changes are independent of DB, and having L2 price support informs token registry design.
3. Phase 3 before Phase 4 because the pipeline/policy changes depend on the extended schemas being in place.
4. Phase 4 last because it's the integration layer that ties everything together.

---

## CAIP-19 Format Reference

### Verified Formats (HIGH confidence)

| Asset | CAIP-19 | Source |
|-------|---------|--------|
| ETH on mainnet | `eip155:1/slip44:60` | CAIP-19 spec |
| SOL on mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501` | CAIP-19 spec + SLIP-44 |
| ERC-20 USDC (Ethereum) | `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` | EIP-155 CAIP-19 profile |
| ERC-20 USDC (Polygon) | `eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359` | EIP-155 CAIP-19 profile |
| SPL USDC (Solana) | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | Solana CAIP-19 profile |
| ERC-20 on Base | `eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` | EIP-155 CAIP-19 profile |

### Solana Namespace Details (HIGH confidence)

- **CAIP-2 reference**: Truncated genesis hash (first 32 chars of base58-encoded genesis hash)
- **Native asset namespace**: `slip44` with coin type `501`
- **Token namespace**: `token` (NOT `spl` or `spl-token`)
- **Token-2022**: Uses same `token` namespace (same mint account structure)
- **Source**: namespaces.chainagnostic.org/solana/caip19

### EVM Namespace Details (HIGH confidence)

- **CAIP-2 reference**: `eip155:{chainId}` (decimal chain ID)
- **Native asset namespace**: `slip44` with coin type `60` (for all EVM chains -- ETH is the native)
- **Token namespace**: `erc20` for fungible tokens
- **Address format**: 0x-prefixed, 40 hex chars. Lowercase recommended for storage.
- **Source**: namespaces.chainagnostic.org/eip155/caip19

### Regex Patterns (HIGH confidence)

```
CAIP-2:  ^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$
CAIP-19: ^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$
```

### Maximum Lengths

| Component | Max Length |
|-----------|-----------|
| CAIP-2 chain ID | 41 chars (8 + 1 + 32) |
| CAIP-19 asset type | 41 + 1 + 8 + 1 + 128 = 179 chars |
| DB column `asset_id` | TEXT (no limit in SQLite, but practical max ~180 chars) |

---

## Scalability Considerations

| Concern | At current scale | At 100 wallets | At 10K wallets |
|---------|-----------------|----------------|----------------|
| CAIP-19 parsing overhead | Negligible (string split) | Negligible | Negligible |
| Cache key length increase | ~10 bytes more per key | ~1KB total | ~10KB total |
| token_registry asset_id index | B-tree on TEXT, same perf | Same | Same |
| CoinGecko L2 queries | 1 req/token/chain | May hit rate limits | Need API key tier upgrade |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| CAIP-2 format (EVM) | HIGH | Spec verified, matches existing x402 code |
| CAIP-2 format (Solana) | HIGH | Spec verified, genesis hashes confirmed |
| CAIP-19 format (EVM erc20) | HIGH | Official EIP-155 CAIP-19 profile verified |
| CAIP-19 format (Solana token) | HIGH | Official Solana CAIP-19 profile: `token` namespace confirmed |
| Solana Token-2022 namespace | MEDIUM | Same `token` namespace (same mint structure), but no explicit profile for Token-2022 in CASA registry |
| CoinGecko L2 platform IDs | MEDIUM | API docs reference polygon-pos, arbitrum-one, optimistic-ethereum, base. Not directly tested. |
| `caip` npm package status | HIGH | Last published 2+ years ago, confirmed inactive -- direct implementation is correct choice |
| DB migration approach | HIGH | Follows established v6b pattern in existing codebase |
| Pipeline impact scope | HIGH | Code analyzed, minimal touch points identified |

---

## Sources

- [CAIP-19 Specification](https://standards.chainagnostic.org/CAIPs/caip-19)
- [CAIP-2 Specification](https://standards.chainagnostic.org/CAIPs/caip-2)
- [EIP-155 CAIP-19 Profile](https://namespaces.chainagnostic.org/eip155/caip19)
- [Solana CAIP-19 Profile](https://namespaces.chainagnostic.org/solana/caip19)
- [Solana CAIP-2 Profile](https://namespaces.chainagnostic.org/solana/caip2)
- [CoinGecko Asset Platforms API](https://docs.coingecko.com/reference/asset-platforms-list)
- [caip npm package](https://www.npmjs.com/package/caip) (v1.1.1, last published 2+ years ago)
- Codebase analysis: `x402.types.ts`, `price-oracle.types.ts`, `price-cache.ts`, `coingecko-platform-ids.ts`, `coingecko-oracle.ts`, `oracle-chain.ts`, `database-policy-engine.ts`, `stages.ts`, `schema.ts`, `migrate.ts`, `token-registry-service.ts`, `transaction.schema.ts`, `policy.schema.ts`
