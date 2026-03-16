# Technology Stack: Type Safety Improvements

**Project:** WAIaaS Type Safety + Zod SSoT Consolidation
**Researched:** 2026-03-16

## Recommended Stack

**NO new dependencies needed.** All required tools are already in the codebase. This milestone is about using existing tools correctly, not adding new ones.

### Current Versions (verified from lockfile)

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| TypeScript | 5.9.3 | Type system | Already strict (`strict: true`, `noUncheckedIndexedAccess: true`) |
| Zod | 3.25.76 | Runtime validation SSoT | Installed, underused for DB JSON parsing |
| Drizzle ORM | 0.45.1 | Typed SQL queries | Installed, raw client access pattern needs cleanup |
| better-sqlite3 | 11.10.0 / 12.6.2 | Raw SQLite access | Dual version (daemon vs push-relay), both fine |
| @solana/kit | 6.0.1 | Solana chain adapter | Branded generics cause `as any` -- workaround needed |
| viem | 2.x | EVM chain adapter | Some `as any` in EIP-712 typing |
| permissionless | 0.3.4 | Account Abstraction (ERC-4337) | Heavy `as any` usage in bundler client calls |

## Pattern-Specific Guidance

### 1. Zod safeParse for JSON.parse Replacement

**Problem:** 362 occurrences of `JSON.parse` across 128 files. Critical hotspot: `database-policy-engine.ts` with 21 occurrences doing `JSON.parse(policy.rules)` with manual type assertions to local interfaces -- while Zod schemas for the same types already exist in `@waiaas/core/schemas/policy.schema.ts`.

**Pattern -- Use `safeParse` with existing Zod schemas:**

```typescript
// BEFORE (current - SSoT violation, no runtime validation)
const rules: SpendingLimitRules = JSON.parse(spendingPolicy.rules);

// AFTER (use existing Zod schema from @waiaas/core)
import { SpendingLimitRulesSchema } from '@waiaas/core';

const parsed = SpendingLimitRulesSchema.safeParse(
  JSON.parse(spendingPolicy.rules)
);
if (!parsed.success) {
  throw new WAIaaSError('POLICY_INVALID', `Invalid spending limit rules: ${parsed.error.message}`);
}
const rules = parsed.data;
```

**Where to apply (priority order):**

| Location | Occurrences | Risk | Approach |
|----------|-------------|------|----------|
| `database-policy-engine.ts` | 21 | HIGH -- policy bypass if malformed | safeParse with existing Zod schemas from `@waiaas/core` |
| `wc-storage.ts` / `wc-session-service.ts` | 4 | MEDIUM -- WalletConnect state corruption | safeParse with `z.unknown()` catch-all |
| `async-polling-service.ts` (bridgeMetadata) | 3 | LOW -- metadata only | safeParse with `z.record(z.unknown())` |
| `ntfy-signing-channel.ts` | 2 | MEDIUM -- external input from ntfy | safeParse with signing response schema |
| Monitors (health/margin/maturity) | 3 | LOW -- metadata parsing | safeParse with `z.record(z.unknown())` |
| `webhook-service.ts` | 1 | LOW -- internal events array | safeParse with `z.array(z.string())` |

**Implementation note:** `database-policy-engine.ts` currently declares 12 local interfaces (SpendingLimitRules, WhitelistRules, AllowedTokensRules, etc.) that duplicate Zod schema types in `@waiaas/core`. Delete these local interfaces and import the Zod-inferred types. This restores the Zod SSoT derivation chain per CLAUDE.md.

**Helper utility (reduces boilerplate, place in `@waiaas/core`):**

```typescript
// packages/core/src/utils/safe-json-parse.ts
import { z } from 'zod';

export function safeJsonParse<T extends z.ZodType>(
  schema: T,
  json: string,
  context: string,
): z.infer<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error(`Invalid JSON in ${context}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Schema validation failed in ${context}: ${result.error.message}`);
  }
  return result.data;
}
```

### 2. Drizzle ORM Raw Client Access

**Problem:** 8 occurrences in `wc.ts` of `(db as any).session?.client as Database` to access the underlying better-sqlite3 instance from a Drizzle ORM instance. This is a Drizzle internal API access that breaks type safety.

**Root cause:** `wc.ts` routes receive only the Drizzle `db` object but need raw SQL for WalletConnect storage operations. The `DatabaseConnection` interface at `infrastructure/database/connection.ts` already provides both `sqlite` and `db`, but the WC routes don't receive the `sqlite` handle.

**Pattern -- Pass `DatabaseConnection` or extract raw client properly:**

```typescript
// OPTION A (preferred): Pass sqlite alongside db in service constructors
// Already used by: delay-queue.ts, approval-workflow.ts, owner-state.ts
constructor(
  private readonly db: BetterSQLite3Database<typeof schema>,
  private readonly sqlite: Database,  // raw better-sqlite3
) {}

// OPTION B: Type-safe extraction utility (for cases where refactoring injection is expensive)
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database } from 'better-sqlite3';

/**
 * Extract the raw better-sqlite3 client from a Drizzle BetterSQLite3Database instance.
 * Relies on Drizzle 0.45.x internal structure -- validated for this version.
 */
export function getRawClient(db: BetterSQLite3Database<any>): Database {
  const internal = db as unknown as { _: { session: { client: Database } } };
  return internal._.session.client;
}
```

**Why Option A is preferred:** The dual-handle pattern (`db` + `sqlite`) is already established in the codebase (12+ services use it). WC routes are the exception that bypasses it. Fixing the injection graph costs more upfront but eliminates runtime coupling to Drizzle internals.

**Why NOT upgrade Drizzle:** Drizzle 0.45.x is recent. The `as any` pattern is not a Drizzle version issue -- it's a dependency injection issue in the WC routes. Drizzle's planned `.$client` accessor is not yet available.

### 3. @solana/kit Branded Generic Workarounds

**Problem:** 8 occurrences of `as any` + `as unknown as typeof txMessage` in `packages/adapters/solana/src/adapter.ts` due to `@solana/kit` 6.x's branded generic types. The `appendTransactionMessageInstruction` function uses complex branded type parameters that don't compose well when instructions are built separately.

**Root cause:** `@solana/kit` 6.x uses TypeScript branded types (phantom type parameters) to track transaction message state (e.g., which instructions are attached, whether blockhash is set). When you build instructions outside the message pipeline, the brands don't match.

**Pattern -- Wrapper function to centralize the cast:**

```typescript
// packages/adapters/solana/src/utils/tx-builder.ts
import {
  appendTransactionMessageInstruction,
  type IInstruction,
  type TransactionMessage,
} from '@solana/kit';

/**
 * Append an instruction to a transaction message.
 *
 * Centralizes the branded-generic cast required by @solana/kit 6.x.
 * @solana/kit uses phantom type parameters to track message state,
 * which don't compose when instructions are built outside the pipeline.
 *
 * This is the standard workaround -- the branded types are intentionally
 * strict for new code but require casts when integrating pre-built instructions.
 */
export function appendInstruction<T extends TransactionMessage>(
  instruction: IInstruction,
  message: T,
): T {
  return appendTransactionMessageInstruction(
    instruction as Parameters<typeof appendTransactionMessageInstruction>[0],
    message,
  ) as unknown as T;
}
```

**Why NOT upgrade @solana/kit:** The branded generics are by design in 6.x. Upgrading won't fix this -- it's the intended API surface. The wrapper pattern keeps the single `as unknown as T` cast in one place instead of scattered across 8+ call sites.

**Why NOT use `@solana/web3.js` (legacy):** The codebase has already migrated to `@solana/kit` 6.x. Going back to the legacy API would be a regression.

### 4. `as any` Elimination Categories

**830 total `as any` occurrences across 133 files.** Categorized by fix strategy:

| Category | Count (src, non-test) | Fix Strategy | Priority |
|----------|----------------------|--------------|----------|
| **Drizzle raw client** (`wc.ts`) | 8 | Pass `sqlite` handle or extraction utility | HIGH |
| **@solana/kit branded generics** | 8 | `appendInstruction` wrapper | HIGH |
| **Policy engine JSON.parse** | 21 (JSON.parse, not `as any`) | Zod safeParse | HIGH |
| **permissionless bundler client** | 6 | Type assertions with `satisfies` or interface extension | MEDIUM |
| **WalletConnect SDK types** | 4 | `@walletconnect/sign-client` type quirks -- use `unknown` + narrowing | MEDIUM |
| **Network ID string literals** | ~8 | Expand `NetworkId` union or use type guard | MEDIUM |
| **EIP-712 viem types** | 3 | Use `viem`'s `TypedDataDefinition` properly | LOW |
| **Action provider registry** | 3 | Proper generics on registry interface | LOW |
| **External action pipeline** | 4 | Proper discriminated union narrowing | LOW |
| **HTTP server timeouts** (`daemon.ts`) | 2 | Node.js `http.Server` type extension | LOW |
| **Test files** | ~690 | Separate effort -- mock typing cleanup | DEFER |

**Key insight:** Test files account for ~83% of `as any` usage. Production source has ~140 occurrences. Focus on the ~55 HIGH/MEDIUM priority production occurrences first.

### 5. permissionless (ERC-4337) Type Fixes

**Problem:** `pipeline/stages.ts` has 6 `as any` casts for `bundlerClient.prepareUserOperation`, `sendUserOperation`, `waitForUserOperationReceipt` -- permissionless 0.3.x client types don't match viem's client type system perfectly.

**Pattern -- Use SmartAccountClient type from permissionless:**

```typescript
import type { SmartAccountClient } from 'permissionless';

// Cast once at creation, use properly typed methods thereafter
const typedBundlerClient = bundlerClient as SmartAccountClient;
const prepared = await typedBundlerClient.prepareUserOperation({ calls });
```

**Why NOT upgrade permissionless:** 0.3.x is the latest stable. The type issues are workaround-able with proper imports.

### 6. Network ID String Literal Casts

**Problem:** ~8 occurrences of `network as any` when calling `networkToCaip2()` -- the function expects a specific `NetworkId` union type but routes receive `string` from query params.

**Pattern -- Validate at boundary with type guard:**

```typescript
// BEFORE
try { chainId = networkToCaip2(network as any); } catch { /* graceful */ }

// AFTER
import { isNetworkId } from '@waiaas/core';

if (isNetworkId(network)) {
  chainId = networkToCaip2(network);
}
```

**If `isNetworkId` type guard doesn't exist, create it:**

```typescript
// packages/core/src/utils/network.ts
export function isNetworkId(value: string): value is NetworkId {
  return NETWORK_IDS.includes(value as NetworkId);
}
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| JSON validation | Zod safeParse (existing) | io-ts, typebox | Zod is already SSoT per CLAUDE.md |
| Raw DB access | Dual-handle injection | Drizzle `.$client` (planned) | Not available in 0.45.x |
| Solana branded types | Wrapper function | Downgrade to @solana/web3.js | Regression, already migrated |
| Test `as any` | Separate cleanup phase | Fix alongside production | Too large scope, different problem |

## What NOT to Change

| DO NOT | Reason |
|--------|--------|
| Upgrade @solana/kit | Branded generics are by design in 6.x; upgrading won't help |
| Upgrade Drizzle ORM | Raw client access is injection issue, not version issue |
| Upgrade permissionless | 0.3.x is latest stable, type issues are workaround-able |
| Add new validation library | Zod 3.25.x has everything needed |
| Enable `noImplicitAny` | Already implied by `strict: true` in tsconfig |
| Fix test `as any` in this milestone | 690 occurrences in tests; mock typing is separate concern |
| Replace `JSON.parse` in test files | Test files use `JSON.parse` on known test fixtures; low risk |

## Installation

```bash
# No new packages needed. Zero new dependencies.
```

## Verification Commands

```bash
# Count remaining `as any` after fixes (production src only)
grep -r "as any" packages/*/src --include="*.ts" --exclude-dir="__tests__" | wc -l
# Target: reduce from ~140 to <30 (external SDK boundary casts only)

# Verify no JSON.parse without safeParse in policy engine
grep -c "JSON.parse" packages/daemon/src/pipeline/database-policy-engine.ts
# Target: 0 (all replaced with safeParse)

# Verify no Drizzle internal access
grep -r "\.session\?\.client" packages/daemon/src --include="*.ts"
# Target: 0 occurrences
```

## Sources

- TypeScript 5.9.3 -- tsconfig.base.json (verified `strict: true`, `noUncheckedIndexedAccess: true`)
- Zod 3.25.76 -- `safeParse` API stable since Zod 3.x
- Drizzle ORM 0.45.1 -- `DatabaseConnection` interface at `infrastructure/database/connection.ts`
- @solana/kit 6.0.1 -- branded generics are documented design choice
- permissionless 0.3.4 -- `SmartAccountClient` type available for proper typing
- Codebase analysis: 362 `JSON.parse` (128 files), 830 `as any` (140 production src, 690 tests)
