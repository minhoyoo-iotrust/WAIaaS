# Architecture Patterns: Amount Unit Standardization & AI Agent DX

**Domain:** Amount unit standardization, MCP typed schema, humanAmount for WAIaaS
**Researched:** 2026-03-14
**Confidence:** HIGH (based on direct codebase analysis of all integration points)

---

## Recommended Architecture

Amount unit standardization touches 4 architectural layers: Action Provider input, REST API request/response, MCP tool registration, and SDK. The design introduces new components at each layer while maintaining backward compatibility through a migration helper.

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `migrateAmount()` helper | Detect decimal-containing legacy input, auto-convert + warn | 4 conversion-target provider resolve() methods |
| Provider inputSchema updates | Add `humanAmount` variant fields, update descriptions to include unit examples | ActionProviderRegistry, MCP tools, OpenAPI |
| `inputSchemaSerializer` | Serialize `ActionDefinition.inputSchema` (Zod) to JSON Schema via `zodToJsonSchema()` | `GET /v1/actions/providers` response |
| MCP schema converter | Convert JSON Schema from metadata API to Zod fields for `server.tool()` | MCP action-provider.ts tool registration |
| `humanAmountResolver` | Convert humanAmount to smallest-unit before pipeline entry | REST API routes, Action routes (pre-Stage 1) |
| `amountFormattedEnricher` | Compute human-readable from amount+decimals on response | Transaction detail response, Action response, Balance response |

### Data Flow: humanAmount Resolution

```
                      REST API / MCP
                          |
              +-----------+-----------+
              |                       |
     humanAmount present?      amount (smallest unit)
              |                       |
     [decimals lookup from           |
      chain config / token registry] |
     [parseAmount(humanAmount, dec)] |
              |                       |
              +--------> amount (smallest unit, unified)
                          |
                   Stage 1: Validate
                          |
               (existing 6-stage pipeline -- unchanged)
                          |
                   Stage 6: Confirm
                          |
              [amountFormatted enrichment on response]
                          |
                      Response JSON
                      { amount, amountFormatted, decimals, symbol }
```

### Data Flow: Action Provider Unit Migration (4 conversion targets)

```
     AI Agent Input to Aave/Kamino/Lido/Jito
          |
    +-----------+------------------+
    |           |                  |
 amount     humanAmount     amount with "."
 (smallest)  (human)        (legacy auto-detect)
    |           |                  |
    |    [parseAmount()]    [migrateAmount()]
    |           |           + deprecation log
    |           |                  |
    +---------->+<-----------------+
                |
         amount: bigint (smallest unit)
                |
         provider.resolve() -- no more parseTokenAmount()
                |
         ContractCallRequest
```

### Data Flow: MCP Typed Schema

```
  Provider Registration (daemon startup)
         |
  ActionProviderRegistry stores IActionProvider.actions[].inputSchema (Zod)
         |
  GET /v1/actions/providers
         |
  zodToJsonSchema(inputSchema) per action -> JSON Schema in response
         |
  MCP registerActionProviderTools()
         |
  Fetches /v1/actions/providers (HTTP)
         |
  jsonSchemaToZodFields(action.inputSchema) per action
         |
  server.tool(name, desc, zodFields, handler)  -- typed params!
         |
  AI agent sees: "sellAmount (string): Amount in smallest units (e.g., '1000000000000000' = 0.001 ETH)"
```

---

## Integration Points: New vs Modified

### NEW Components (6)

| Component | Location | Purpose |
|-----------|----------|---------|
| `migrateAmount()` | `packages/actions/src/common/migrate-amount.ts` | Shared helper for 4 conversion-target providers. Detects `.` in amount string, converts via `parseAmount()`, returns `{ amount: bigint; migrated: boolean }`. Logs deprecation when `migrated=true`. |
| `humanAmountResolver` | `packages/daemon/src/pipeline/human-amount-resolver.ts` | Pre-pipeline function: resolve `humanAmount` to `amount` using decimals from chain config (TRANSFER/native) or token registry (TOKEN_TRANSFER/ERC-20/SPL). Mutual exclusion validation. |
| `amountFormattedEnricher` | `packages/daemon/src/api/helpers/amount-formatted.ts` | Response helper: look up decimals/symbol from chain config (native) or token.metadata (TOKEN_TRANSFER), call `formatAmount()`, return `{ amountFormatted, decimals, symbol }` or all nulls if unknown. |
| `inputSchemaSerializer` | `packages/daemon/src/infrastructure/action/schema-serializer.ts` | Serialize `ActionDefinition.inputSchema` (Zod) to JSON Schema via `zodToJsonSchema()`. Called in `GET /v1/actions/providers`. |
| MCP schema converter | `packages/mcp/src/tools/schema-converter.ts` | Convert JSON Schema `properties` into individual Zod fields for `server.tool()`. Fallback to `z.record(z.unknown())` on conversion failure. |
| `humanAmount` Zod fields | `packages/core/src/schemas/transaction.schema.ts` | New `humanAmount` field on TransferRequestSchema, TokenTransferRequestSchema, ApproveRequestSchema with `.refine()` mutual exclusion. |

### MODIFIED Components (14)

| Component | File | Change |
|-----------|------|--------|
| `ActionDefinitionResponseSchema` | `packages/daemon/src/api/routes/openapi-schemas.ts` (line 99) | Add `inputSchema: z.record(z.unknown()).nullable().optional()` field to action list response |
| `GET /v1/actions/providers` handler | `packages/daemon/src/api/routes/actions.ts` (line 212-236) | Serialize each action's `inputSchema` via `zodToJsonSchema()` and include in response |
| `TxDetailResponseSchema` | `packages/daemon/src/api/routes/openapi-schemas.ts` (line 246) | Add `amountFormatted: z.string().nullable()`, `decimals: z.number().int().nullable()`, `symbol: z.string().nullable()` |
| `WalletBalanceResponseSchema` | `packages/daemon/src/api/routes/openapi-schemas.ts` (line 148) | Add `balanceFormatted: z.string().nullable()` (computed from existing `balance` + `decimals`) |
| `TransferRequestSchema` | `packages/core/src/schemas/transaction.schema.ts` (line 66) | Add `humanAmount` optional field + `.refine()` XOR with `amount`, make `amount` optional |
| `TokenTransferRequestSchema` | `packages/core/src/schemas/transaction.schema.ts` (line 110) | Same humanAmount pattern |
| `ApproveRequestSchema` | `packages/core/src/schemas/transaction.schema.ts` (line 183) | Same humanAmount pattern |
| Aave schemas | `packages/actions/src/providers/aave-v3/schemas.ts` | Description -> smallest unit, add `humanAmount` field, update Zod description strings |
| Kamino/Lido/Jito input schemas | Respective provider files | Same schema pattern as Aave |
| Aave/Kamino/Lido/Jito resolve() | Respective `index.ts` files | Remove `parseTokenAmount()` call, use `migrateAmount()` for backward compat, accept input as bigint |
| Jupiter/0x/LiFi/Across/Pendle/DCent schemas | Respective provider files | Add `humanAmount` variant field (e.g., `humanSellAmount`), update description with unit examples |
| `registerActionProviderTools()` | `packages/mcp/src/tools/action-provider.ts` (line 80-95) | Replace `z.record(z.unknown())` with typed schema from metadata API; add human_amount fields |
| Built-in MCP tool descriptions | `packages/mcp/src/tools/send-token.ts`, `approve-token.ts`, etc. | Update amount `.describe()` with unit examples |
| Transaction response builders | `packages/daemon/src/api/routes/transactions.ts` | Call `amountFormattedEnricher()` before returning TxDetailResponse |
| Balance response builder | `packages/daemon/src/api/routes/wallet.ts` | Compute `balanceFormatted` from existing `balance` and `decimals` |
| SDK methods | `packages/sdk/src/` | Add `humanAmount` option to transfer/tokenTransfer/approve methods |

### UNCHANGED Components

| Component | Why Unchanged |
|-----------|---------------|
| 6-stage pipeline (stages.ts) | humanAmount resolved before pipeline entry; pipeline always receives smallest unit `amount` |
| PipelineContext | No new fields needed -- humanAmount is pre-resolved |
| DatabasePolicyEngine | Policies evaluate `amount` (already smallest unit) -- no change |
| IChainAdapter | Always receives smallest unit -- no change |
| DB transactions table | `amount` column remains smallest unit string. `amountFormatted` is computed at response time, not stored. **No DB migration needed.** |
| Hyperliquid/Drift/Polymarket providers | CLOB exchange exception -- keep human-readable units, description-only updates |

---

## Patterns to Follow

### Pattern 1: humanAmount Mutual Exclusion (Zod refine)

**What:** Use Zod `.refine()` to enforce `amount` XOR `humanAmount` at schema level.
**When:** Any request schema accepting an amount field.
**Example:**
```typescript
export const TransferRequestSchema = z.object({
  type: z.literal('TRANSFER'),
  to: z.string().min(1),
  amount: z.string().regex(numericStringPattern).optional(),
  humanAmount: z.string().optional()
    .describe('Human-readable amount (e.g., "0.001" for 0.001 ETH). Alternative to amount in smallest units.'),
  memo: z.string().max(256).optional(),
  network: NetworkTypeEnumWithLegacy.optional(),
  ...gasConditionField,
}).refine(
  (data) => {
    const hasAmount = data.amount !== undefined;
    const hasHuman = data.humanAmount !== undefined;
    return hasAmount !== hasHuman; // exactly one must be present
  },
  { message: 'Exactly one of amount or humanAmount must be provided', path: ['amount'] },
);
```

### Pattern 2: migrateAmount for Backward Compatibility

**What:** Shared helper for 4 conversion-target providers to detect and convert legacy human-readable input.
**When:** aave-v3, kamino, lido-staking, jito-staking provider resolve() methods only.
**Example:**
```typescript
// packages/actions/src/common/migrate-amount.ts
import { parseAmount } from '@waiaas/core';

export function migrateAmount(
  value: string,
  decimals: number,
  providerName: string,
): { amount: bigint; migrated: boolean } {
  if (value === 'max') return { amount: 0n, migrated: false }; // special keyword
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

### Pattern 3: Schema Serialization via zodToJsonSchema

**What:** Serialize each provider's `ActionDefinition.inputSchema` to JSON Schema for the metadata API.
**When:** `GET /v1/actions/providers` response construction.
**Implementation note:** `zod-to-json-schema@3.25.1` is already available as a transitive dependency of `@modelcontextprotocol/sdk` (verified in pnpm-lock.yaml). Add as direct dependency to `packages/daemon`.
**Example:**
```typescript
import { zodToJsonSchema } from 'zod-to-json-schema';

function serializeInputSchema(schema: unknown): Record<string, unknown> | null {
  try {
    const jsonSchema = zodToJsonSchema(schema as z.ZodType, { target: 'openApi3' });
    return jsonSchema as Record<string, unknown>;
  } catch {
    return null; // graceful degradation for non-serializable schemas
  }
}

// In listProviders route handler:
actions: providerActions.map((a) => ({
  name: a.action.name,
  description: a.action.description,
  chain: a.action.chain,
  riskLevel: a.action.riskLevel,
  defaultTier: a.action.defaultTier,
  inputSchema: serializeInputSchema(a.action.inputSchema), // NEW
})),
```

### Pattern 4: MCP JSON Schema to Zod Conversion

**What:** Convert JSON Schema properties from metadata API into Zod schemas for typed tool registration.
**When:** `registerActionProviderTools()` dynamically registers action tools.
**Example:**
```typescript
// packages/mcp/src/tools/schema-converter.ts
function jsonSchemaToZodFields(
  jsonSchema: Record<string, unknown> | null,
): Record<string, z.ZodType> | null {
  if (!jsonSchema) return null;
  const props = (jsonSchema as any).properties as Record<string, any> | undefined;
  if (!props) return null;

  const required = new Set<string>((jsonSchema as any).required ?? []);
  const fields: Record<string, z.ZodType> = {};

  for (const [key, prop] of Object.entries(props)) {
    let zodField: z.ZodType;
    switch (prop.type) {
      case 'string': zodField = z.string(); break;
      case 'number': case 'integer': zodField = z.number(); break;
      case 'boolean': zodField = z.boolean(); break;
      case 'object': zodField = z.record(z.unknown()); break;
      case 'array': zodField = z.array(z.unknown()); break;
      default: zodField = z.unknown(); break;
    }
    if (prop.description) zodField = zodField.describe(prop.description);
    if (!required.has(key)) zodField = zodField.optional();
    fields[key] = zodField;
  }
  return fields;
}

// In registerActionProviderTools():
const typedFields = jsonSchemaToZodFields(action.inputSchema);
const toolSchema = typedFields
  ? { ...typedFields, network: z.string().optional().describe('...'), /* ... */ }
  : { params: z.record(z.unknown()).optional().describe('...'), /* ... */ }; // fallback
```

### Pattern 5: amountFormatted Best-Effort Enrichment

**What:** Enrich transaction responses with human-readable amount. Returns null when decimals unknown.
**When:** All transaction detail responses (GET/list/pending).
**Example:**
```typescript
// packages/daemon/src/api/helpers/amount-formatted.ts
import { formatAmount } from '@waiaas/core';

interface AmountFormattedResult {
  amountFormatted: string | null;
  decimals: number | null;
  symbol: string | null;
}

const NATIVE_TOKEN_INFO: Record<string, { decimals: number; symbol: string }> = {
  solana: { decimals: 9, symbol: 'SOL' },
  ethereum: { decimals: 18, symbol: 'ETH' },
};

export function enrichAmountFormatted(
  tx: { type: string; amount: string | null; chain: string; metadata: Record<string, unknown> | null },
): AmountFormattedResult {
  const NULL_RESULT = { amountFormatted: null, decimals: null, symbol: null };
  if (!tx.amount) return NULL_RESULT;

  // Native transfer
  if (tx.type === 'TRANSFER') {
    const native = NATIVE_TOKEN_INFO[tx.chain];
    if (!native) return NULL_RESULT;
    return {
      amountFormatted: formatAmount(BigInt(tx.amount), native.decimals),
      decimals: native.decimals,
      symbol: native.symbol,
    };
  }

  // Token transfer: extract from stored metadata
  if ((tx.type === 'TOKEN_TRANSFER' || tx.type === 'APPROVE') && tx.metadata) {
    const token = tx.metadata.token as { decimals?: number; symbol?: string } | undefined;
    if (token?.decimals !== undefined) {
      return {
        amountFormatted: formatAmount(BigInt(tx.amount), token.decimals),
        decimals: token.decimals,
        symbol: token.symbol ?? null,
      };
    }
  }

  return NULL_RESULT; // CONTRACT_CALL, BATCH, unknown decimals
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Size-Based Heuristic for Unit Detection

**What:** Using `value >= 10^decimals` to guess whether input is smallest-unit or human-readable.
**Why bad:** USDC has 6 decimals. `"1000000"` could be 1 USDC (smallest unit) or 1,000,000 USDC (human-readable). Guessing wrong causes catastrophic fund loss. No safe heuristic exists for all tokens.
**Instead:** Use explicit `humanAmount` parameter. Only detect `.` (decimal point) as a safe legacy migration signal -- decimal point presence is unambiguous.

### Anti-Pattern 2: Duplicating Schema Definitions in MCP

**What:** Manually defining Zod schemas in MCP that mirror Action Provider schemas.
**Why bad:** Two sources of truth. When a provider adds or changes a field, MCP falls behind silently. With 14 providers and ~30 actions, manual sync is error-prone.
**Instead:** Use metadata API (`GET /v1/actions/providers`) to fetch JSON Schema dynamically, convert to Zod at tool registration time.

### Anti-Pattern 3: Storing amountFormatted in Database

**What:** Adding `amount_formatted`, `decimals`, `symbol` columns to the transactions table.
**Why bad:** Token decimals can change (rebase tokens), wastes storage, creates unnecessary DB migration. These are purely derived values from `amount` + token metadata.
**Instead:** Compute at response time from chain config + transaction metadata. The DB stores only the canonical `amount` in smallest units.

### Anti-Pattern 4: Making humanAmount the Default

**What:** Making all providers accept human-readable by default and requiring `rawAmount` for smallest units.
**Why bad:** Breaks the blockchain convention. Ethereum JSON-RPC uses wei, Solana uses lamports, Stripe uses cents. Every existing integration, explorer, and tool uses smallest units. Fighting the standard creates more confusion and inconsistency.
**Instead:** Keep `amount` as smallest unit (industry standard). `humanAmount` is the convenience alternative for AI agents.

### Anti-Pattern 5: Modifying Pipeline Internals for humanAmount

**What:** Adding humanAmount resolution logic inside Stage 1 or Stage 3 of the pipeline.
**Why bad:** The pipeline is a critical hot path with 8-state machine semantics. Adding unit conversion logic inside stages couples unit concerns with validation/policy/execution concerns.
**Instead:** Resolve humanAmount to amount in the route handler, **before** pipeline entry. The pipeline always receives canonical smallest-unit amounts.

---

## Key Architectural Decisions

### Decision 1: zodToJsonSchema is Already Available

`zod-to-json-schema@3.25.1` exists as a transitive dependency of `@modelcontextprotocol/sdk@1.12.0`. Add it as a direct dependency to `packages/daemon` for the metadata API serialization. No new package introduction needed.

**Confidence:** HIGH (verified in `node_modules/.pnpm`)

### Decision 2: Metadata API Extension is Non-Breaking

Adding `inputSchema` to `GET /v1/actions/providers` response is an additive change. The existing `ActionDefinitionResponseSchema` (line 99-105 of openapi-schemas.ts) does not use `.strict()`, so adding an optional field does not break existing consumers (Admin UI, MCP).

**Confidence:** HIGH (verified schema definition)

### Decision 3: humanAmount Resolution Before Pipeline Entry

The 6-stage pipeline expects `amount` in smallest units at Stage 1 (validate). `humanAmount` must be resolved to `amount` in the route handler before entering the pipeline. This keeps the pipeline clean, unchanged, and unaware of unit alternatives.

**Confidence:** HIGH (follows existing patterns -- network resolution also happens pre-pipeline)

### Decision 4: Token Registry for humanAmount Decimals Lookup

`humanAmount` for TOKEN_TRANSFER requires decimals lookup. The token metadata is already available from `token` field in the request body (`TokenInfoSchema` includes `decimals`). For TRANSFER (native), use chain config (SOL=9, ETH=18). If token is not registered and decimals not provided, return a clear error.

**Confidence:** HIGH (TokenInfoSchema already requires decimals field at line 79)

### Decision 5: No DB Migration Required

All new response fields (`amountFormatted`, `decimals`, `symbol`, `balanceFormatted`) are computed at runtime from existing data. The `humanAmount` input parameter is resolved to `amount` before DB insertion. No new columns, no schema version bump.

**Confidence:** HIGH (verified all integration points store only `amount`)

### Decision 6: Per-Provider humanAmount Field Names

Each provider has different amount field names. The `human` prefix convention maps cleanly:

| Provider Field | humanAmount Field |
|---------------|-------------------|
| `amount` | `humanAmount` |
| `sellAmount` | `humanSellAmount` |
| `fromAmount` | `humanFromAmount` |
| `amountIn` | `humanAmountIn` |

This is handled per-provider in the input schema, not by a generic middleware. Each provider knows its own field semantics.

---

## Build Order (Dependency-Aware)

```
Phase 1: Foundation (no external dependencies)
  |-- migrateAmount() helper in packages/actions/src/common/
  |-- amountFormatted enricher utility in packages/daemon/src/api/helpers/
  |-- Schema description updates for all 14 providers (descriptions only, no logic changes)
  |
Phase 2: Provider Unit Conversion (depends on Phase 1)
  |-- aave-v3, kamino, lido, jito: smallest unit input + migrateAmount backward compat
  |-- humanAmount fields in 10 non-CLOB provider input schemas
  |-- CLOB provider (Hyperliquid/Drift/Polymarket) description-only updates
  |-- Unit tests for migrateAmount + provider conversion
  |
Phase 3: REST API Integration (depends on Phase 2)
  |-- humanAmount in TransferRequest/TokenTransferRequest/ApproveRequest (Zod SSoT)
  |-- humanAmountResolver (pre-pipeline conversion for REST routes)
  |-- amountFormatted/decimals/symbol in TxDetailResponseSchema
  |-- balanceFormatted in WalletBalanceResponseSchema
  |-- zodToJsonSchema serialization in GET /v1/actions/providers
  |-- Integration tests for humanAmount flow + amountFormatted responses
  |
Phase 4: MCP Typed Schema (depends on Phase 3 -- metadata API)
  |-- JSON Schema to Zod converter (schema-converter.ts)
  |-- registerActionProviderTools() rewrite: typed schema + humanAmount fields
  |-- Built-in MCP tool description updates (send-token, approve-token, etc.)
  |-- Tests for typed schema generation + fallback behavior
  |
Phase 5: SDK + Skill Files (depends on Phase 3)
  |-- SDK humanAmount option on transfer/tokenTransfer/approve methods
  |-- Skill file unit guide sections (all 5 skill files)
  |-- quickstart.skill.md amount unit guide
  |
Phase 6: E2E Tests (depends on Phases 2-5)
  |-- E2E: AI agent uses humanAmount for swap/transfer/supply
  |-- E2E: MCP tool shows typed schema with unit descriptions
```

**Phase ordering rationale:**
- Phase 1 creates shared utilities with no risk. All other phases depend on these.
- Phase 2 is the highest-risk change (provider logic modification) -- do it early to catch issues.
- Phase 3 extends REST API using Phase 2 work. The metadata API must exist before MCP can consume it.
- Phase 4 depends on metadata API from Phase 3. MCP reads JSON Schema from the API.
- Phase 5 (SDK/docs) can run in parallel with Phase 4 since both depend only on Phase 3.
- Phase 6 validates the full stack end-to-end.

---

## Sources

- Verified: `packages/core/src/schemas/transaction.schema.ts` -- current amount fields, discriminatedUnion 7-type, TokenInfoSchema includes `decimals` (line 79)
- Verified: `packages/mcp/src/tools/action-provider.ts` -- current `z.record(z.unknown())` schema (line 84), full registration flow
- Verified: `packages/actions/src/providers/aave-v3/schemas.ts` -- human-readable descriptions, all 4 schemas
- Verified: `packages/actions/src/common/amount-parser.ts` -- `parseTokenAmount()` used by conversion targets
- Verified: `packages/core/src/utils/format-amount.ts` -- `formatAmount()` + `parseAmount()` utilities
- Verified: `packages/core/src/interfaces/action-provider.types.ts` -- `ActionDefinition.inputSchema` is `z.any()` (duck-typed), IActionProvider contract
- Verified: `packages/daemon/src/api/routes/actions.ts` -- metadata API handler (line 212-236), action execution route
- Verified: `packages/daemon/src/api/routes/openapi-schemas.ts` -- TxDetailResponseSchema (line 246), WalletBalanceResponseSchema (line 148), no `.strict()` on schemas
- Verified: `packages/daemon/src/infrastructure/action/action-provider-registry.ts` -- registration, executeResolve, listActions
- Verified: `zod-to-json-schema@3.25.1` present in `node_modules/.pnpm/` as MCP SDK transitive dependency
- Verified: `internal/objectives/m31-15-amount-unit-standardization.md` -- milestone requirements R1-R6, design decisions D1-D7
