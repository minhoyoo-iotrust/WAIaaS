# Phase 233: DB Migration + Schema + Policy - Research

**Researched:** 2026-02-22
**Domain:** SQLite incremental migration, Zod schema extension, policy engine evaluation
**Confidence:** HIGH

## Summary

Phase 233 adds CAIP-19 `asset_id` to the existing token infrastructure, transaction request schemas, and policy evaluation engine. The scope spans three distinct layers: (1) DB migration v22 adding `asset_id` TEXT column to `token_registry` with application-level backfill from existing `(network, address)` pairs, (2) extending `TokenInfoSchema` in transaction requests to accept an optional `assetId` with address extraction and cross-validation, and (3) enhancing the `ALLOWED_TOKENS` policy to support a 4-scenario matching matrix (assetId-vs-assetId, assetId-vs-legacy, legacy-vs-assetId, legacy-vs-legacy).

All three layers are already well-established in the codebase with clear patterns. The CAIP-19 module (Phase 231) provides `tokenAssetId(network, address)` and `parseCaip19()` for generating and decomposing asset identifiers. The migration system has 21 prior migrations with clear conventions. The policy engine's `evaluateAllowedTokens()` method is a single function with a well-defined address-matching loop that needs to be extended.

**Primary recommendation:** Follow established patterns precisely -- simple ALTER TABLE ADD COLUMN for v22, application-level SELECT+loop+UPDATE backfill (v6b pattern), and extend existing Zod schemas/policy evaluator additively with zero breaking changes.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | Raw SQL for migrations | Already used for all 21 migrations |
| drizzle-orm | (existing) | Type-safe DB access in services | Drizzle schema defines token_registry |
| zod | (existing) | Schema validation SSoT | TokenInfoSchema, AllowedTokensRulesSchema |
| @waiaas/core caip/ | (Phase 231) | CAIP-19 generation/parsing | tokenAssetId(), parseCaip19(), caip2ToNetwork() |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | (existing) | Test runner | Migration tests, policy evaluation tests |

### Alternatives Considered

None -- zero new npm deps is a locked prior decision.

**Installation:**
```bash
# No new dependencies needed
```

## Architecture Patterns

### Recommended Project Structure

```
packages/
├── core/src/
│   ├── schemas/
│   │   ├── transaction.schema.ts   # TokenInfoSchema + assetId extension
│   │   └── policy.schema.ts        # AllowedTokensRulesSchema + assetId extension
│   └── caip/                       # Phase 231 -- already complete
├── daemon/src/
│   ├── infrastructure/database/
│   │   ├── migrate.ts              # v22 migration + LATEST_SCHEMA_VERSION bump
│   │   └── schema.ts              # token_registry Drizzle column + assetId index
│   ├── infrastructure/token-registry/
│   │   └── token-registry-service.ts  # getTokensForNetwork returns assetId
│   ├── pipeline/
│   │   ├── stages.ts              # Stage 1: assetId extraction + cross-validation
│   │   └── database-policy-engine.ts  # evaluateAllowedTokens 4-scenario matrix
│   └── api/routes/
│       ├── tokens.ts              # GET response includes assetId
│       └── openapi-schemas.ts     # TokenRegistryItemSchema + assetId field
```

### Pattern 1: Simple ALTER TABLE + Application-Level Backfill (v22 Migration)

**What:** Add nullable `asset_id TEXT` column via ALTER TABLE, then backfill using SELECT+loop+UPDATE at application level.

**When to use:** When backfill logic requires application-level functions (CAIP-19 generation requires `tokenAssetId()` from @waiaas/core -- cannot be done in pure SQL).

**Why not pure SQL:** CAIP-19 generation uses `networkToCaip2()` which maps network strings to CAIP-2 IDs via JavaScript lookup tables, then constructs `eip155:{chainRef}/erc20:{lowercasedAddress}`. This mapping cannot be expressed in a SQL CASE WHEN because CAIP-2 references (e.g., `1`, `137`, `42161`) are determined by the NETWORK_TO_CAIP2 map in JS.

**Established pattern (v6b):**
```typescript
// From migrate.ts v6a (version 6):
MIGRATIONS.push({
  version: 6,
  description: 'Add network column to transactions with backfill from wallets',
  managesOwnTransaction: false,
  up: (sqlite) => {
    // SQL 1: Add nullable column
    sqlite.exec('ALTER TABLE transactions ADD COLUMN network TEXT');
    // SQL 2: Backfill from related table
    sqlite.exec(`UPDATE transactions SET network = (
      SELECT w.network FROM wallets w WHERE w.id = transactions.wallet_id
    )`);
  },
});
```

**v22 will follow this but with application-level loop:**
```typescript
MIGRATIONS.push({
  version: 22,
  description: 'Add asset_id column to token_registry with CAIP-19 backfill',
  managesOwnTransaction: false,
  up: (sqlite) => {
    // Step 1: Add nullable column
    sqlite.exec('ALTER TABLE token_registry ADD COLUMN asset_id TEXT');

    // Step 2: Application-level backfill (SELECT + loop + UPDATE)
    const rows = sqlite
      .prepare('SELECT id, network, address FROM token_registry')
      .all() as Array<{ id: string; network: string; address: string }>;

    const updateStmt = sqlite.prepare(
      'UPDATE token_registry SET asset_id = ? WHERE id = ?'
    );

    for (const row of rows) {
      try {
        const assetId = tokenAssetId(row.network as NetworkType, row.address);
        updateStmt.run(assetId, row.id);
      } catch {
        // Skip rows with unknown networks (safety)
      }
    }
  },
});
```

**Source:** Codebase `packages/daemon/src/infrastructure/database/migrate.ts` lines 700-713

### Pattern 2: Zod Schema Additive Extension

**What:** Add optional fields to existing Zod schemas without breaking consumers.

**When to use:** When extending request/response schemas with backward-compatible optional fields.

**Example (TokenInfoSchema extension):**
```typescript
// Current:
const TokenInfoSchema = z.object({
  address: z.string().min(1),
  decimals: z.number().int().min(0).max(18),
  symbol: z.string().min(1).max(10),
});

// Extended (additive):
const TokenInfoSchema = z.object({
  address: z.string().min(1),
  decimals: z.number().int().min(0).max(18),
  symbol: z.string().min(1).max(10),
  assetId: Caip19Schema.optional(),  // NEW: optional CAIP-19
});
```

**Source:** Codebase `packages/core/src/schemas/transaction.schema.ts` lines 54-58

### Pattern 3: Policy Evaluation Extension with Backward Compatibility

**What:** Extend `evaluateAllowedTokens()` to support assetId matching alongside existing address-only matching.

**When to use:** When policy rules and transaction parameters may contain assetId, address, or both.

**4-scenario matching matrix:**

| | Policy has assetId | Policy has address only |
|---|---|---|
| **TX has assetId** | Exact CAIP-19 string match (case-sensitive for Solana, lowercased for EVM) | Extract address from TX assetId, compare with policy address (lowercase) |
| **TX has address only** | Extract address from policy assetId, compare with TX address (lowercase) | Current behavior: address lowercase compare |

**Source:** Codebase `packages/daemon/src/pipeline/database-policy-engine.ts` lines 892-939

### Pattern 4: DDL Update + LATEST_SCHEMA_VERSION Bump

**What:** Update fresh DB DDL in `getCreateTableStatements()` to include the new column and bump `LATEST_SCHEMA_VERSION`.

**When to use:** Every migration that adds/modifies columns must update DDL for fresh databases.

```typescript
// In getCreateTableStatements():
`CREATE TABLE IF NOT EXISTS token_registry (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('builtin', 'custom')),
  asset_id TEXT,  -- NEW: CAIP-19 asset identifier
  created_at INTEGER NOT NULL
)`,

// Bump version:
export const LATEST_SCHEMA_VERSION = 22;  // was 21
```

**Source:** Codebase `packages/daemon/src/infrastructure/database/migrate.ts` lines 55, 194-203

### Anti-Patterns to Avoid

- **Breaking existing requests:** TokenInfoSchema.address must remain required. assetId is strictly optional and additive.
- **CAIP-19 in pure SQL:** Never try to construct CAIP-19 strings in SQLite -- use application-level `tokenAssetId()`.
- **Case-insensitive CAIP-19 comparison:** Solana addresses are base58 and MUST NEVER be lowercased. Only lowercase the `assetReference` part for EVM tokens (which is already done by `tokenAssetId()`).
- **Changing unique index:** The existing `idx_token_registry_network_address UNIQUE(network, address)` must stay. `asset_id` is nullable and should NOT be part of the unique constraint. A separate non-unique index on `asset_id` is optional.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CAIP-19 generation | String concatenation | `tokenAssetId(network, address)` from `@waiaas/core/caip` | Handles EVM lowercase and Solana base58 correctly |
| CAIP-19 parsing | Regex splitting | `parseCaip19(assetId)` from `@waiaas/core/caip` | Validates format via Zod, extracts all 3 components |
| Address extraction from assetId | Manual substring | `parseCaip19(assetId).assetReference` | Handles both `erc20:0x...` and `token:EPjF...` namespaces |
| Network extraction from assetId | Manual parsing | `caip2ToNetwork(parseCaip19(assetId).chainId)` | Returns `{ chain, network }` from CAIP-2 chain ID |
| Fresh DB schema sync | Manual DDL editing only | Update both DDL in `getCreateTableStatements()` AND Drizzle schema in `schema.ts` | Both must match for Drizzle type safety |

**Key insight:** The caip/ module from Phase 231 provides all the building blocks. The implementation should compose existing functions, not reimplement CAIP logic.

## Common Pitfalls

### Pitfall 1: Address Casing in CAIP-19 Cross-Validation

**What goes wrong:** EVM addresses in CAIP-19 are lowercased (per spec), but addresses in API requests may be EIP-55 checksummed. A naive string comparison fails.

**Why it happens:** `tokenAssetId('ethereum-mainnet', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')` produces `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` (lowercased). The request's `token.address` field may be `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`.

**How to avoid:** When cross-validating assetId and address:
1. Extract `assetReference` from the assetId (`parseCaip19(assetId).assetReference`)
2. Compare `assetReference.toLowerCase() === address.toLowerCase()`
3. For Solana: Compare exact (base58 is case-sensitive)

**Warning signs:** Tests pass with all-lowercase addresses but fail with checksummed addresses.

### Pitfall 2: Forgetting LATEST_SCHEMA_VERSION Bump

**What goes wrong:** Fresh databases skip the v22 migration (because pushSchema records all migration versions up to LATEST_SCHEMA_VERSION), but the DDL doesn't include the `asset_id` column.

**Why it happens:** `pushSchema()` records all versions <= LATEST_SCHEMA_VERSION in `schema_version`, so if LATEST_SCHEMA_VERSION is still 21, fresh DBs will have version 22 NOT recorded, and the migration WILL run but the DDL will still be the old one. Actually the issue is the reverse: if LATEST_SCHEMA_VERSION=22 but DDL doesn't include `asset_id`, fresh DBs won't have the column AND the migration won't run.

**How to avoid:** Always update THREE things together:
1. `LATEST_SCHEMA_VERSION = 22`
2. DDL in `getCreateTableStatements()` with the new column
3. Migration in `MIGRATIONS` array

**Warning signs:** `migration-chain.test.ts` T-2/T-6 schema equivalence test fails.

### Pitfall 3: 4-Scenario Policy Matrix Incomplete Coverage

**What goes wrong:** Only testing assetId-to-assetId matching, missing the cross scenarios where one side has assetId and the other has only address.

**Why it happens:** The most obvious scenario (both have assetId) works immediately. The edge cases (mixed) are easy to overlook.

**How to avoid:** Write explicit test cases for all 4 cells of the matrix:
1. Policy assetId + TX assetId -> exact CAIP-19 match
2. Policy assetId + TX address only -> extract address from policy assetId, compare
3. Policy address only + TX assetId -> extract address from TX assetId, compare
4. Policy address only + TX address only -> current behavior (unchanged)

**Warning signs:** Existing tests pass (they're all scenario 4) but new scenarios fail.

### Pitfall 4: Backfill Failure on Unknown Networks

**What goes wrong:** `tokenAssetId(network, address)` throws if the network is not in `NETWORK_TO_CAIP2` map. If the DB contains a token with an unexpected network value, the entire migration fails.

**Why it happens:** token_registry has no CHECK constraint on the `network` column -- it's just `TEXT NOT NULL`. Any string could be stored.

**How to avoid:** Wrap the backfill loop in try/catch per-row, logging warnings for unrecognized networks but not failing the migration. Rows with unknown networks get `asset_id = NULL` (graceful degradation).

**Warning signs:** Migration fails on production DBs with custom network entries.

### Pitfall 5: Not Updating the Drizzle Schema Alongside DDL

**What goes wrong:** The Drizzle ORM schema in `schema.ts` doesn't include the new `asset_id` column, causing TypeScript type errors when the token registry service tries to select/return it.

**Why it happens:** `schema.ts` (Drizzle definitions) and `migrate.ts` (raw SQL DDL) are maintained separately.

**How to avoid:** Update both files in the same plan. The Drizzle schema column definition:
```typescript
assetId: text('asset_id'),
```

**Warning signs:** TypeScript errors on `tokenRegistry.assetId` access.

## Code Examples

### Example 1: v22 Migration with Application-Level Backfill

```typescript
// Source: established pattern from codebase migrate.ts
import { tokenAssetId, type NetworkType, NETWORK_TO_CAIP2 } from '@waiaas/core';

MIGRATIONS.push({
  version: 22,
  description: 'Add asset_id column to token_registry with CAIP-19 backfill',
  managesOwnTransaction: false,
  up: (sqlite) => {
    // Step 1: Add nullable column
    sqlite.exec('ALTER TABLE token_registry ADD COLUMN asset_id TEXT');

    // Step 2: Application-level backfill
    const rows = sqlite
      .prepare('SELECT id, network, address FROM token_registry')
      .all() as Array<{ id: string; network: string; address: string }>;

    const updateStmt = sqlite.prepare(
      'UPDATE token_registry SET asset_id = ? WHERE id = ?'
    );

    for (const row of rows) {
      // Guard: only backfill for known networks
      if (!(row.network in NETWORK_TO_CAIP2)) continue;
      try {
        const assetId = tokenAssetId(row.network as NetworkType, row.address);
        updateStmt.run(assetId, row.id);
      } catch {
        // Skip on error (unknown network edge case)
      }
    }
  },
});
```

### Example 2: TokenInfoSchema Extension with Cross-Validation

```typescript
// Source: packages/core/src/schemas/transaction.schema.ts
import { Caip19Schema, parseCaip19, caip2ToNetwork } from '../caip/index.js';

const TokenInfoSchema = z.object({
  address: z.string().min(1),
  decimals: z.number().int().min(0).max(18),
  symbol: z.string().min(1).max(10),
  assetId: Caip19Schema.optional(),
}).superRefine((data, ctx) => {
  if (!data.assetId) return; // No cross-validation needed

  try {
    const parsed = parseCaip19(data.assetId);
    const extractedAddress = parsed.assetReference;

    // Cross-validate: address from assetId must match provided address
    if (extractedAddress.toLowerCase() !== data.address.toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `assetId address '${extractedAddress}' does not match provided address '${data.address}'`,
        path: ['assetId'],
      });
    }
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid CAIP-19 assetId: ${data.assetId}`,
      path: ['assetId'],
    });
  }
});
```

### Example 3: ALLOWED_TOKENS 4-Scenario Evaluator

```typescript
// Source: packages/daemon/src/pipeline/database-policy-engine.ts evaluateAllowedTokens()
private evaluateAllowedTokens(
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  if (transaction.type !== 'TOKEN_TRANSFER') return null;

  const allowedTokensPolicy = resolved.find((p) => p.type === 'ALLOWED_TOKENS');
  if (!allowedTokensPolicy) {
    // ... default deny logic (unchanged)
  }

  const rules: AllowedTokensRules = JSON.parse(allowedTokensPolicy.rules);
  const txTokenAddress = transaction.tokenAddress;
  const txAssetId = transaction.assetId; // NEW field

  if (!txTokenAddress && !txAssetId) {
    return { allowed: false, tier: 'INSTANT', reason: 'Token transfer missing token address' };
  }

  const isAllowed = rules.tokens.some((policyToken) => {
    // Scenario 1: Both have assetId -> exact CAIP-19 match
    if (policyToken.assetId && txAssetId) {
      return policyToken.assetId === txAssetId;
    }
    // Scenario 2: Policy has assetId, TX has address only
    if (policyToken.assetId && txTokenAddress) {
      const policyAddr = parseCaip19(policyToken.assetId).assetReference;
      return policyAddr.toLowerCase() === txTokenAddress.toLowerCase();
    }
    // Scenario 3: Policy has address only, TX has assetId
    if (!policyToken.assetId && txAssetId) {
      const txAddr = parseCaip19(txAssetId).assetReference;
      return policyToken.address.toLowerCase() === txAddr.toLowerCase();
    }
    // Scenario 4: Both address only -> current behavior
    return policyToken.address.toLowerCase() === (txTokenAddress ?? '').toLowerCase();
  });

  if (!isAllowed) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: `Token not in allowed list: ${txAssetId ?? txTokenAddress}`,
    };
  }

  return null;
}
```

### Example 4: Token API Response with assetId

```typescript
// Source: packages/daemon/src/api/routes/tokens.ts GET handler
return c.json({
  network,
  tokens: tokens.map((t) => ({
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    source: t.source,
    assetId: t.assetId ?? null,  // NEW: from DB or generated on-the-fly
  })),
}, 200);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Legacy `${chain}:${address}` cache key | CAIP-19 `eip155:1/erc20:0x...` cache key | Phase 232 (v27.2) | Oracle already uses CAIP-19 keys |
| Address-only token identification | CAIP-19 assetId + address (both supported) | Phase 233 (this phase) | Additive -- address-only still works |
| token_registry without asset_id | token_registry with nullable asset_id | Phase 233 (this phase) | DB v22 migration |

**Deprecated/outdated:**
- Nothing is deprecated in this phase. Address-only identification is maintained for backward compatibility. Deprecation planned for MIGR-01 (future milestone, out of scope).

## Open Questions

1. **Index on asset_id column?**
   - What we know: `asset_id` is nullable TEXT, not part of unique constraint. Queries will rarely filter by asset_id directly (policy matching extracts the address component).
   - What's unclear: Whether a non-unique index on `asset_id` provides measurable benefit.
   - Recommendation: Skip index for now. Token registry is small (dozens to hundreds of entries). A scan is negligible. Add index later if needed.

2. **Stage 1 auto-extraction: Should address be made optional in TokenInfoSchema when assetId is provided?**
   - What we know: TXSC-02 says "When assetId is provided, address is extracted and cross-validated." This implies address could be auto-populated from assetId.
   - What's unclear: Whether to make `address` conditionally optional (only when assetId is present) or always required.
   - Recommendation: Keep `address` required. The `assetId` cross-validates but doesn't replace. This avoids breaking existing consumers and simplifies Stage 1 logic. The alternative (address optional when assetId present) would require complex conditional Zod schemas and changes to every downstream consumer that reads `token.address`. Phase 234 MCP tools can auto-populate address before calling the API.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOKN-02 | token_registry DB table has asset_id TEXT column added via incremental migration (v22) | Pattern 1 (ALTER TABLE + backfill), Pattern 4 (DDL + version bump). Established v6a pattern. |
| TOKN-03 | Existing token_registry records are auto-populated with correct CAIP-19 asset_id from (network, address) during migration | Example 1 (application-level SELECT+loop+UPDATE with tokenAssetId()). Pitfall 4 (unknown networks). |
| TOKN-04 | Token API responses include assetId field for all token registry entries | Example 4. Requires OpenAPI schema update (TokenRegistryItemSchema) and token-registry-service return type extension. |
| TXSC-01 | Transaction request schemas (TokenInfoSchema) accept optional assetId field | Pattern 2 (Zod additive extension). Example 2. Caip19Schema already exists. |
| TXSC-02 | When assetId is provided, address is extracted and cross-validated against assetId | Example 2 (superRefine). Pitfall 1 (address casing). parseCaip19().assetReference extracts address. |
| TXSC-03 | Existing transactions without assetId continue to work identically (backward compatible) | assetId is `.optional()` -- Zod makes existing payloads pass unchanged. No changes to Stage 1 DB INSERT. |
| PLCY-01 | ALLOWED_TOKENS policy rules accept optional assetId field for token matching | AllowedTokensRulesSchema in policy.schema.ts needs `assetId: Caip19Schema.optional()` per token entry. |
| PLCY-02 | Policy evaluation with assetId compares chain+network+address (all three dimensions) | Example 3. CAIP-19 embeds chain ID + network + address, so string comparison captures all 3 dimensions. |
| PLCY-03 | 4-scenario policy matching works correctly (assetId-assetId, assetId-legacy, legacy-assetId, legacy-legacy) | Example 3 (4-branch evaluator). Pitfall 3 (incomplete coverage). Prior decision: C-03 pitfall requiring 4-scenario matrix. |
| PLCY-04 | EVM addresses are normalized to lowercase for CAIP-19 comparison | tokenAssetId() already lowercases EVM addresses. evaluateAllowedTokens() uses toLowerCase() for address comparison. Pitfall 1 documents the casing trap. |
</phase_requirements>

## Sources

### Primary (HIGH confidence)
- Codebase `packages/daemon/src/infrastructure/database/migrate.ts` -- all 21 existing migrations, migration runner, LATEST_SCHEMA_VERSION pattern
- Codebase `packages/daemon/src/infrastructure/database/schema.ts` -- Drizzle schema for token_registry (9 columns, unique index)
- Codebase `packages/daemon/src/pipeline/database-policy-engine.ts` -- evaluateAllowedTokens(), AllowedTokensRules interface
- Codebase `packages/core/src/schemas/transaction.schema.ts` -- TokenInfoSchema (3 fields)
- Codebase `packages/core/src/schemas/policy.schema.ts` -- AllowedTokensRulesSchema (tokens array with address + optional chain/symbol)
- Codebase `packages/core/src/caip/` -- all 5 module files from Phase 231
- Codebase `packages/daemon/src/api/routes/tokens.ts` -- token API response mapping
- Codebase `packages/daemon/src/api/routes/openapi-schemas.ts` -- TokenRegistryItemSchema (5 fields)
- Codebase `packages/daemon/src/infrastructure/token-registry/token-registry-service.ts` -- RegistryToken interface, getTokensForNetwork()
- Codebase `.planning/REQUIREMENTS.md` -- TOKN-02 through PLCY-04 requirement definitions

### Secondary (MEDIUM confidence)
- Codebase `packages/daemon/src/__tests__/migration-chain.test.ts` -- migration chain test patterns (schema equivalence, FK integrity)
- Codebase `packages/daemon/src/pipeline/stages.ts` -- stage1Validate, stage3Policy, buildTransactionParam

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all tools are already in the codebase
- Architecture: HIGH -- every pattern has a direct precedent in the existing migration/schema/policy code
- Pitfalls: HIGH -- identified from studying actual codebase patterns (address casing, LATEST_SCHEMA_VERSION sync, backfill error handling)

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable internal patterns, no external dependency changes)
