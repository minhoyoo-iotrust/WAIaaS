# Technology Stack: Amount Unit Standardization & AI Agent DX

**Project:** WAIaaS v31.15
**Researched:** 2026-03-14

## Core Finding: No New Dependencies Required

This milestone requires **zero new npm packages**. All needed capabilities exist in the current dependency tree. This is the ideal outcome -- it avoids supply chain risk and keeps the bundle lean.

## Existing Stack (Unchanged)

### Already Available Libraries

| Technology | Current Version | Purpose | Relevance to v31.15 |
|------------|----------------|---------|---------------------|
| zod | 3.25.76 | Schema validation SSoT | XOR validation (`.refine()`), description annotations |
| @modelcontextprotocol/sdk | 1.26.0 | MCP server | Already converts Zod to JSON Schema internally via `toJsonSchemaCompat()` |
| zod-to-json-schema | 3.25.1 (transitive) | Zod -> JSON Schema conversion | Already bundled as dependency of @modelcontextprotocol/sdk; use directly for R2-1 metadata API |
| viem | 2.21.0+ | EVM chain interaction | `parseUnits`/`formatUnits` available but NOT recommended (use existing `parseAmount`/`formatAmount`) |
| @waiaas/core | workspace | Core utilities | `parseAmount()`, `formatAmount()` already implemented in `utils/format-amount.ts` |
| @waiaas/actions | workspace | Action providers | `parseTokenAmount()` in `common/amount-parser.ts`, `ActionDefinition.inputSchema` per-action Zod schemas |

### Key Integration Points

| Component | File | How v31.15 Uses It |
|-----------|------|-------------------|
| `parseAmount(amount, decimals)` | `packages/core/src/utils/format-amount.ts` | R4: humanAmount -> smallest unit conversion |
| `formatAmount(amount, decimals)` | `packages/core/src/utils/format-amount.ts` | R3: amountFormatted response field generation |
| `parseTokenAmount(amount, decimals)` | `packages/actions/src/common/amount-parser.ts` | R1-2: Remove calls from 4 migrating providers |
| `ActionDefinition.inputSchema` | `packages/core/src/interfaces/action-provider.types.ts` | R2-1: Already Zod schemas, convert to JSON Schema for metadata API |
| `z.record(z.unknown())` | `packages/mcp/src/tools/action-provider.ts:84` | R2-2: Replace with actual per-action Zod schemas |
| `.refine()` | `packages/core/src/schemas/transaction.schema.ts:19` | R4-2: Existing pattern for XOR validation |

---

## R2-1: Action Provider Metadata API -- `zod-to-json-schema`

### Recommendation: Import `zod-to-json-schema` Directly

**Confidence:** HIGH (verified in lockfile and MCP SDK dependency tree)

`zod-to-json-schema@3.25.1` is already installed as a transitive dependency of `@modelcontextprotocol/sdk@1.26.0`. For the daemon's metadata API (`GET /v1/actions/providers`), add it as a **direct dependency** of `@waiaas/daemon` (or `@waiaas/core`) to make the import explicit rather than relying on transitive hoisting.

```typescript
// packages/daemon/src/api/routes/actions.ts
import { zodToJsonSchema } from 'zod-to-json-schema';

// Per-action inputSchema conversion
const jsonSchema = zodToJsonSchema(action.inputSchema, {
  $refStrategy: 'none',       // Inline all refs (API consumers should not resolve $ref)
  target: 'jsonSchema7',      // JSON Schema draft-07 (MCP standard)
});
```

**Why `zod-to-json-schema` directly, not MCP SDK's `toJsonSchemaCompat`:**
- `toJsonSchemaCompat` is an internal MCP SDK function, not a public export
- `zod-to-json-schema` is the same underlying library (v3.25.1)
- Direct import gives explicit version control and avoids coupling to MCP SDK internals

**Installation:**

```bash
cd packages/daemon
pnpm add zod-to-json-schema@^3.25.1
```

This adds ~0 bytes to node_modules (already present), just makes the dependency explicit in package.json.

---

## R2-2: MCP Typed Schema -- Direct Zod Schema Passthrough

### Recommendation: Pass Zod Schemas Directly to `server.tool()`

**Confidence:** HIGH (verified by reading MCP SDK source: `mcp.js` line 75-80)

The MCP SDK's `server.tool()` method already accepts Zod object schemas and internally calls `toJsonSchemaCompat()` to convert them to JSON Schema for the MCP protocol. The current code passes `z.record(z.unknown())` -- simply replace this with the actual per-action Zod schema.

**No `json-schema-to-zod` library needed.** The objective doc (R2-2) mentions "JSON Schema to Zod reverse conversion" as one option, but the same paragraph notes: "or if MCP runs in the same process as the daemon, reference `ActionDefinition.inputSchema` Zod objects directly." Since the MCP server fetches provider metadata from the daemon REST API (same host, just HTTP), the simpler approach is:

1. Extend `GET /v1/actions/providers` response to include `inputSchema` as JSON Schema (R2-1)
2. In MCP `registerActionProviderTools()`, fetch the JSON Schema and construct a Zod schema from it

**However, the even simpler approach** (recommended): If the MCP package can depend on `@waiaas/core` types, pass the Zod schema directly. But since MCP currently fetches from REST API (keeping packages decoupled), the pragmatic approach is:

**Option A (Recommended): Construct Zod from JSON Schema at MCP tool registration**

Use a simple manual mapper for the common JSON Schema types used in action provider schemas. This avoids adding `json-schema-to-zod` as a dependency. Action provider schemas use only basic types: `z.string()`, `z.number()`, `z.boolean()`, `z.enum()`, `z.optional()`, `z.object()` -- no complex recursive types.

```typescript
// packages/mcp/src/tools/json-schema-to-zod.ts (~50 lines)
// Maps JSON Schema subset to Zod -- handles string, number, boolean, enum, object, optional
// Falls back to z.unknown() for unrecognized types (R2-3)
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType { ... }
```

**Why NOT use `json-schema-to-zod` npm package:**
- It is a full-featured converter (~200KB) designed for code generation, not runtime conversion
- Our action schemas use only 6-7 JSON Schema types -- a 50-line manual mapper is sufficient
- Avoids a new dependency for a trivial use case
- The MCP SDK already handles Zod -> JSON Schema internally; we just need the reverse for a thin adapter

**Option B (Alternative): Pass inputSchema JSON directly**

If `@modelcontextprotocol/sdk` exposes raw JSON Schema passthrough in future versions, use that instead. Currently `server.tool()` requires Zod schemas, so Option A is needed.

---

## R1-3: `migrateAmount` Helper Pattern

### Recommendation: Add to `packages/actions/src/common/amount-parser.ts`

**Confidence:** HIGH (pure utility function, no external dependencies)

```typescript
// packages/actions/src/common/amount-parser.ts

export interface MigrateAmountResult {
  amount: bigint;
  migrated: boolean;
}

/**
 * Backward-compatible amount migration for providers transitioning
 * from human-readable to smallest unit input.
 *
 * - Decimal point present -> human-readable, auto-convert + migrated=true
 * - Integer string -> smallest unit, use as-is + migrated=false
 */
export function migrateAmount(
  value: string,
  decimals: number,
  providerName: string,
): MigrateAmountResult {
  if (value.includes('.')) {
    console.warn(
      `[DEPRECATION] Provider ${providerName}: amount "${value}" contains decimal point, ` +
      `interpreted as human-readable. Use smallest units or humanAmount parameter.`
    );
    return { amount: parseAmount(value, decimals), migrated: true };
  }
  return { amount: BigInt(value), migrated: false };
}
```

**No new library needed.** Uses existing `parseAmount()` from `@waiaas/core`.

---

## R4-2: humanAmount XOR Validation Pattern in Zod

### Recommendation: Use `.refine()` (Existing Pattern)

**Confidence:** HIGH (verified pattern already used in `GasConditionSchema`)

```typescript
// Example: TRANSFER request schema extension
const TransferRequestSchema = z.object({
  to: z.string(),
  amount: z.string().optional()
    .describe('Amount in smallest units (wei/lamports). Example: "1000000000000000" = 0.001 ETH'),
  humanAmount: z.string().optional()
    .describe('Human-readable amount (e.g., "0.001" for 0.001 ETH). Alternative to amount.'),
  // ... other fields
}).refine(
  (data) => {
    const hasAmount = data.amount !== undefined;
    const hasHumanAmount = data.humanAmount !== undefined;
    return hasAmount !== hasHumanAmount; // XOR: exactly one must be present
  },
  { message: 'Specify either amount or humanAmount, not both (or neither)' },
);
```

**Why `.refine()` over `.discriminatedUnion()`:**
- `discriminatedUnion` requires a literal discriminator field -- amount/humanAmount are not discriminators
- `.refine()` is the established pattern in this codebase (GasConditionSchema, SessionSchema)
- Provides clear error messages for API consumers
- Works with OpenAPI generation via `@hono/zod-openapi`

**Important caveat for Action Provider schemas:** The XOR pattern applies differently per provider. For providers that have `humanAmount` alternatives (e.g., `humanSellAmount` for zerox), the refine must match the specific field names. A reusable helper is warranted:

```typescript
// packages/core/src/utils/amount-xor.ts
export function amountXorRefine(amountField: string, humanField: string) {
  return (data: Record<string, unknown>) => {
    const hasAmount = data[amountField] !== undefined;
    const hasHuman = data[humanField] !== undefined;
    return hasAmount !== hasHuman;
  };
}
```

---

## R3: amountFormatted Response Fields

### Recommendation: Use Existing `formatAmount()` + Token Registry Lookup

**Confidence:** HIGH (no new dependencies, pure composition of existing utilities)

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `amountFormatted` | `string \| null` | `formatAmount(amount, decimals)` | null when decimals unknown |
| `decimals` | `number \| null` | Token registry / chain config | Native: chain config. ERC-20/SPL: token registry |
| `symbol` | `string \| null` | Token registry / chain config | Native: chain config. ERC-20/SPL: token registry |

These are **runtime computed fields** -- not stored in DB, not requiring DB migration. Added to Zod response schemas as optional nullable fields.

---

## What NOT to Add

| Library | Why Considered | Why Rejected |
|---------|---------------|-------------|
| `json-schema-to-zod` (npm) | R2-2 JSON Schema -> Zod reverse conversion | Overkill for ~6 JSON Schema types used in action schemas. Write a 50-line manual mapper instead |
| `zod@4.x` | Latest version | Current `zod@3.25.76` is stable, MCP SDK supports `^3.25 \|\| ^4.0`. Migration is unnecessary risk for this milestone |
| `bignumber.js` / `decimal.js` | Decimal arithmetic | All amount math uses native `BigInt` -- no floating point involved. Adding a decimal library contradicts the smallest-unit-as-bigint design |
| `@hono/zod-openapi` upgrade | OpenAPI schema generation | Already at `^0.19.10`, sufficient for humanAmount schema extension |
| Any formatter library | Amount display formatting | `formatAmount()` in `@waiaas/core` already handles all cases with pure bigint math |

---

## Installation Summary

```bash
# Single addition: make transitive dependency explicit
cd packages/daemon
pnpm add zod-to-json-schema@^3.25.1

# OR if used in @waiaas/core (for shared inputSchema serialization):
cd packages/core
pnpm add zod-to-json-schema@^3.25.1
```

**Total new direct dependencies: 1** (already in node_modules as transitive dep, 0 new downloads)
**Total new transitive dependencies: 0**

---

## Version Compatibility Matrix

| Package | Current | Required | Compatible | Notes |
|---------|---------|----------|------------|-------|
| zod | 3.25.76 | ^3.24.0 | YES | `.refine()`, `.describe()`, `.optional()` all stable |
| zod-to-json-schema | 3.25.1 (transitive) | ^3.25.1 | YES | Matches zod@3.25.x, `$refStrategy: 'none'` supported |
| @modelcontextprotocol/sdk | 1.26.0 | ^1.12.0 | YES | `server.tool()` accepts Zod schemas, auto-converts via `toJsonSchemaCompat()` |
| @hono/zod-openapi | 0.19.10 | ^0.19.0 | YES | Zod `.refine()` schemas render in OpenAPI (refinements shown as `x-refine`) |

---

## Sources

- MCP SDK source: `node_modules/.pnpm/@modelcontextprotocol+sdk@1.26.0_zod@3.25.76/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js` (line 75-80: `toJsonSchemaCompat` usage)
- MCP SDK `zod-json-schema-compat.js`: imports `zodToJsonSchema` from `zod-to-json-schema`
- MCP SDK `package.json`: `dependencies: { "zod-to-json-schema": "^3.25.1", "zod": "^3.25 || ^4.0" }`
- Existing `parseAmount`/`formatAmount`: `packages/core/src/utils/format-amount.ts`
- Existing `parseTokenAmount`: `packages/actions/src/common/amount-parser.ts`
- Existing XOR refine pattern: `packages/core/src/schemas/transaction.schema.ts:19` (GasConditionSchema)
- ActionDefinition.inputSchema: `packages/core/src/interfaces/action-provider.types.ts:82` (typed as `z.any()`)
- Current MCP tool registration: `packages/mcp/src/tools/action-provider.ts:84` (`z.record(z.unknown())`)
- pnpm-lock.yaml: `zod-to-json-schema@3.25.1(zod@3.25.76)` already resolved
