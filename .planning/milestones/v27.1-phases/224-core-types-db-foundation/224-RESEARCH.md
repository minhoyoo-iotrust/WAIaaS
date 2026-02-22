# Phase 224: Core Types + DB Foundation - Research

**Researched:** 2026-02-21
**Domain:** TypeScript interfaces, Zod schemas, SQLite migrations, Drizzle ORM schema
**Confidence:** HIGH

## Summary

Phase 224 is a pure foundation phase: it establishes the type system and database schema that all subsequent incoming TX monitoring phases depend on. The scope is narrow and well-defined by design doc 76. There are zero new npm dependencies required -- all work happens within existing `@waiaas/core` (interfaces + Zod schemas) and `packages/daemon` (DB migration + Drizzle schema).

The IChainSubscriber 6-method interface follows the same pattern as IChainAdapter but is a separate interface due to fundamental state model differences (stateless vs stateful). The DB v21 migration adds two new tables (`incoming_transactions`, `incoming_tx_cursors`) and one new column (`wallets.monitor_incoming`), following the established ALTER TABLE + CREATE TABLE migration pattern used since v1.4.

**Primary recommendation:** Follow the existing codebase patterns exactly -- IChainSubscriber goes alongside IChainAdapter in `packages/core/src/interfaces/`, Zod schemas follow the SSoT derivation pattern in `packages/core/src/schemas/`, DB migration v21 uses the standard `MIGRATIONS.push()` pattern, and Drizzle schema is extended in the existing `schema.ts` file.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUB-01 | IChainSubscriber 6-method interface (subscribe/unsubscribe/subscribedWallets/connect/waitForDisconnect/destroy) defined in @waiaas/core | Interface definition pattern from IChainAdapter (line 31-93 of `IChainAdapter.ts`), chain-adapter.types.ts pattern for IncomingTransaction type, design doc 76 section 1.4 provides exact signature |
| STO-01 | DB v21 migration adds incoming_transactions table, incoming_tx_cursors table, and wallets.monitor_incoming column | Migration pattern from MIGRATIONS v2-v20 in migrate.ts, Drizzle schema pattern from schema.ts (15 existing tables), design doc 76 section 2.7 provides exact DDL |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | ^3.x | Zod SSoT schemas for IncomingTransaction + IncomingTxStatus | Project convention: Zod -> TS types -> OpenAPI -> Drizzle |
| `drizzle-orm` | existing | Drizzle schema definitions for new tables | Already used for all 15 existing tables in schema.ts |
| `better-sqlite3` | existing | Raw SQL migration execution | Used by migrate.ts for all 20 existing migrations |
| `@waiaas/core` | workspace | Interface + type definitions | Existing package, IChainAdapter already defined here |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | existing | Migration chain tests + schema validation | Required for migration chain test updates |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate types file | Inline in IChainSubscriber.ts | Separate file matches existing chain-adapter.types.ts pattern |
| New Zod schema file | Add to existing transaction.schema.ts | Incoming TX is a distinct domain, warrants its own file |

## Architecture Patterns

### Recommended File Structure
```
packages/core/src/
  interfaces/
    IChainSubscriber.ts          # NEW: 6-method interface
    chain-subscriber.types.ts    # NEW: IncomingTransaction, IncomingTxStatus
    index.ts                     # MODIFY: re-export new types
  schemas/
    incoming-transaction.schema.ts  # NEW: Zod schemas
    index.ts                     # MODIFY: re-export new schemas
  enums/
    incoming-tx.ts               # NEW: INCOMING_TX_STATUSES enum
    index.ts                     # MODIFY: re-export new enum
  events/
    event-types.ts               # MODIFY: add IncomingTxEvent + event map entry
  index.ts                       # MODIFY: re-export all new items

packages/daemon/src/
  infrastructure/database/
    migrate.ts                   # MODIFY: add v21 migration + update LATEST_SCHEMA_VERSION to 21
    schema.ts                    # MODIFY: add incomingTransactions + incomingTxCursors tables + wallets.monitorIncoming
    index.ts                     # MODIFY: re-export new table schemas
  __tests__/
    migration-chain.test.ts      # MODIFY: update EXPECTED_INDEXES, ALL_TABLES, version assertions
```

### Pattern 1: Interface + Types Split (existing pattern)
**What:** Interface file (`IChainSubscriber.ts`) imports types from a companion types file (`chain-subscriber.types.ts`)
**When to use:** When the interface has associated data types
**Example:**
```typescript
// chain-subscriber.types.ts
export type IncomingTxStatus = 'DETECTED' | 'CONFIRMED';
export interface IncomingTransaction { ... }

// IChainSubscriber.ts
import type { IncomingTransaction } from './chain-subscriber.types.js';
export interface IChainSubscriber { ... }
```
**Source:** Existing pattern in `IChainAdapter.ts` + `chain-adapter.types.ts`

### Pattern 2: Zod SSoT Derivation
**What:** Zod schema is the single source of truth; TypeScript type is derived via `z.infer<>`
**When to use:** All domain schemas in @waiaas/core
**Example:**
```typescript
import { z } from 'zod';
import { ChainTypeEnum, NetworkTypeEnum } from '../enums/index.js';

export const IncomingTxStatusEnum = z.enum(['DETECTED', 'CONFIRMED']);
export type IncomingTxStatus = z.infer<typeof IncomingTxStatusEnum>;

export const IncomingTransactionSchema = z.object({
  id: z.string().uuid(),
  txHash: z.string(),
  walletId: z.string().uuid(),
  // ... etc
});
export type IncomingTransaction = z.infer<typeof IncomingTransactionSchema>;
```
**Source:** Existing pattern in `wallet.schema.ts`, `signing-protocol.ts`

### Pattern 3: Migration with pushSchema Sync
**What:** Three synchronized changes: (1) MIGRATIONS.push() for incremental upgrade, (2) pushSchema DDL for fresh databases, (3) LATEST_SCHEMA_VERSION bump
**When to use:** Every DB schema change since v1.4
**Example:**
```typescript
// In migrate.ts:
export const LATEST_SCHEMA_VERSION = 21; // was 20

// Add new tables to getCreateTableStatements()
// Add new indexes to getCreateIndexStatements()

// Add migration
MIGRATIONS.push({
  version: 21,
  description: 'Add incoming transaction monitoring tables and wallet opt-in column',
  up: (sqlite) => {
    sqlite.exec('ALTER TABLE wallets ADD COLUMN monitor_incoming INTEGER NOT NULL DEFAULT 0');
    sqlite.exec(`CREATE TABLE incoming_transactions (...)`);
    sqlite.exec(`CREATE TABLE incoming_tx_cursors (...)`);
    sqlite.exec('CREATE INDEX ...');
    // etc
  },
});
```
**Source:** Existing migrations v2-v20 in migrate.ts

### Pattern 4: Drizzle Schema Table Definition
**What:** Table defined with `sqliteTable()`, using `text()`, `integer()`, `check()`, `index()`, `uniqueIndex()`, and `sql.raw()` for CHECK constraints from SSoT arrays
**When to use:** Every new table in the Drizzle schema
**Example:**
```typescript
export const incomingTransactions = sqliteTable(
  'incoming_transactions',
  {
    id: text('id').primaryKey(),
    txHash: text('tx_hash').notNull(),
    walletId: text('wallet_id').notNull().references(() => wallets.id, { onDelete: 'cascade' }),
    // ... columns
  },
  (table) => [
    index('idx_incoming_tx_wallet_detected').on(table.walletId, table.detectedAt),
    // ... indexes
  ],
);
```
**Source:** All 15 existing table definitions in schema.ts

### Anti-Patterns to Avoid
- **Putting IChainSubscriber methods on IChainAdapter:** Stateless vs stateful separation is a locked design decision. IChainAdapter has 22 methods, mixing would break AdapterPool caching.
- **Using plain TypeScript types without Zod:** Violates Zod SSoT convention. Always derive TS types from Zod schemas.
- **Creating indexes before migrations in pushSchema:** This caused MIGR-01 bug. Indexes go in Step 3 (after migrations run).
- **Forgetting to update LATEST_SCHEMA_VERSION:** Fresh databases use this to skip migrations. If not bumped, fresh DBs won't have the new tables in schema_version.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID v7 generation | Custom timestamp-based ID | Existing `generateId()` from `packages/daemon/src/infrastructure/database/id.ts` | Already provides ms-precision time ordering |
| CHECK constraint SQL | Manual string interpolation | `buildCheckSql()` helper in schema.ts, `inList()` in migrate.ts | Avoids SQL injection, consistent with SSoT arrays |
| Migration transaction handling | Custom BEGIN/COMMIT | `runMigrations()` runner (`managesOwnTransaction: false` for simple DDL) | Handles schema_version recording, error rollback |

**Key insight:** This phase is almost entirely pattern-following. Every file to be created or modified has a direct analog in the existing codebase.

## Common Pitfalls

### Pitfall 1: pushSchema DDL vs Migration DDL Mismatch
**What goes wrong:** The DDL in `getCreateTableStatements()` (for fresh DBs) doesn't match the DDL produced by running migrations (for existing DBs). This causes T-2/T-6 schema equivalence tests to fail.
**Why it happens:** Developer adds migration but forgets to update pushSchema DDL, or vice versa.
**How to avoid:** Always update BOTH: (1) the migration's `up()` function, AND (2) the `getCreateTableStatements()` + `getCreateIndexStatements()` in pushSchema. Also update `LATEST_SCHEMA_VERSION`.
**Warning signs:** `migration-chain.test.ts` T-2/T-6 schema equivalence tests fail.

### Pitfall 2: Partial Index Syntax
**What goes wrong:** SQLite partial index (`WHERE status = 'DETECTED'`) requires exact quoting in both DDL and Drizzle schema.
**Why it happens:** The `idx_incoming_tx_status` index uses `WHERE status = 'DETECTED'` which is a partial index.
**How to avoid:** Use escaped quotes in migrate.ts: `WHERE status = \\'DETECTED\\'`. In Drizzle, use `sql.raw()` for the WHERE clause if supported, or skip the partial index in Drizzle and rely on the DDL index creation.
**Warning signs:** Index creation fails or partial filter is ignored.

### Pitfall 3: Foreign Key with wallets.monitor_incoming Default
**What goes wrong:** `ALTER TABLE wallets ADD COLUMN monitor_incoming INTEGER NOT NULL DEFAULT 0` on existing databases with data should work fine since DEFAULT is specified. But if testing with a fresh DB that creates wallets table WITH monitor_incoming already in DDL, the column must be present in both paths.
**Why it happens:** pushSchema creates the latest wallets DDL (which should include monitor_incoming), while migration adds it to existing DBs.
**How to avoid:** Add `monitor_incoming INTEGER NOT NULL DEFAULT 0` to the wallets CREATE TABLE in `getCreateTableStatements()`.
**Warning signs:** Column missing in fresh DB or duplicate column in migrated DB.

### Pitfall 4: Drizzle Schema Check Constraint with Enum Array
**What goes wrong:** Using a hardcoded string array instead of an SSoT enum array for CHECK constraints.
**Why it happens:** IncomingTxStatus ('DETECTED', 'CONFIRMED') is a new enum that needs SSoT treatment.
**How to avoid:** Define `INCOMING_TX_STATUSES` as a `const` array in `@waiaas/core/enums`, then use `buildCheckSql()` in Drizzle schema and `inList()` in migrate.ts DDL.
**Warning signs:** CHECK constraint values don't match enum values after a future status addition.

### Pitfall 5: Migration Chain Test Updates
**What goes wrong:** Tests pass individually but fail in CI because `EXPECTED_INDEXES`, `ALL_TABLES`, or version assertions are stale.
**Why it happens:** Adding new tables/indexes without updating the test fixtures.
**How to avoid:** Update these constants in `migration-chain.test.ts`:
- `EXPECTED_INDEXES`: add 4 new indexes for incoming_transactions
- `ALL_TABLES`: add 'incoming_transactions' and 'incoming_tx_cursors'
- Version assertions: expect `LATEST_SCHEMA_VERSION` (21)
**Warning signs:** T-4 (fresh DB) or T-5 (index completeness) tests fail.

## Code Examples

### IChainSubscriber Interface (from design doc 76 section 1.4)
```typescript
// packages/core/src/interfaces/IChainSubscriber.ts
import type { ChainType } from '../enums/chain.js';
import type { IncomingTransaction } from './chain-subscriber.types.js';

export interface IChainSubscriber {
  readonly chain: ChainType;

  subscribe(
    walletId: string,
    address: string,
    network: string,
    onTransaction: (tx: IncomingTransaction) => void,
  ): Promise<void>;

  unsubscribe(walletId: string): Promise<void>;
  subscribedWallets(): string[];
  connect(): Promise<void>;
  waitForDisconnect(): Promise<void>;
  destroy(): Promise<void>;
}
```
**Source:** Design doc 76, section 1.4

### IncomingTransaction Type (from design doc 76 section 1.2)
```typescript
// packages/core/src/interfaces/chain-subscriber.types.ts
import type { ChainType } from '../enums/chain.js';

export type IncomingTxStatus = 'DETECTED' | 'CONFIRMED';

export interface IncomingTransaction {
  id: string;
  txHash: string;
  walletId: string;
  fromAddress: string;
  amount: string;
  tokenAddress: string | null;
  chain: ChainType;
  network: string;
  status: IncomingTxStatus;
  blockNumber: number | null;
  detectedAt: number;
  confirmedAt: number | null;
  isSuspicious?: boolean;
}
```
**Source:** Design doc 76, section 1.2

### DB v21 Migration (from design doc 76 section 2.7)
```typescript
MIGRATIONS.push({
  version: 21,
  description: 'Add incoming transaction monitoring tables and wallet opt-in column',
  up: (sqlite) => {
    // 1. wallets.monitor_incoming
    sqlite.exec('ALTER TABLE wallets ADD COLUMN monitor_incoming INTEGER NOT NULL DEFAULT 0');

    // 2. incoming_transactions table (12 columns)
    sqlite.exec(`CREATE TABLE incoming_transactions (
      id TEXT PRIMARY KEY,
      tx_hash TEXT NOT NULL,
      wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      from_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      token_address TEXT,
      chain TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum')),
      network TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DETECTED' CHECK (status IN ('DETECTED', 'CONFIRMED')),
      block_number INTEGER,
      detected_at INTEGER NOT NULL,
      confirmed_at INTEGER,
      is_suspicious INTEGER NOT NULL DEFAULT 0,
      UNIQUE(tx_hash, wallet_id)
    )`);

    // 3. incoming_tx_cursors table
    sqlite.exec(`CREATE TABLE incoming_tx_cursors (
      wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
      chain TEXT NOT NULL,
      network TEXT NOT NULL,
      last_signature TEXT,
      last_block_number INTEGER,
      updated_at INTEGER NOT NULL
    )`);

    // 4. Indexes (4 for incoming_transactions)
    sqlite.exec('CREATE INDEX idx_incoming_tx_wallet_detected ON incoming_transactions(wallet_id, detected_at DESC)');
    sqlite.exec('CREATE INDEX idx_incoming_tx_detected_at ON incoming_transactions(detected_at)');
    sqlite.exec('CREATE INDEX idx_incoming_tx_chain_network ON incoming_transactions(chain, network)');
    sqlite.exec("CREATE INDEX idx_incoming_tx_status ON incoming_transactions(status) WHERE status = 'DETECTED'");
  },
});
```
**Source:** Design doc 76, section 2.7

### Drizzle Schema Addition
```typescript
// In schema.ts, add after existing tables:

export const incomingTransactions = sqliteTable(
  'incoming_transactions',
  {
    id: text('id').primaryKey(),
    txHash: text('tx_hash').notNull(),
    walletId: text('wallet_id').notNull().references(() => wallets.id, { onDelete: 'cascade' }),
    fromAddress: text('from_address').notNull(),
    amount: text('amount').notNull(),
    tokenAddress: text('token_address'),
    chain: text('chain').notNull(),
    network: text('network').notNull(),
    status: text('status').notNull().default('DETECTED'),
    blockNumber: integer('block_number'),
    detectedAt: integer('detected_at', { mode: 'timestamp' }).notNull(),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
    isSuspicious: integer('is_suspicious', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    index('idx_incoming_tx_wallet_detected').on(table.walletId, table.detectedAt),
    index('idx_incoming_tx_detected_at').on(table.detectedAt),
    index('idx_incoming_tx_chain_network').on(table.chain, table.network),
    index('idx_incoming_tx_status').on(table.status),
    uniqueIndex('idx_incoming_tx_unique').on(table.txHash, table.walletId),
    check('check_incoming_chain', buildCheckSql('chain', CHAIN_TYPES)),
    check('check_incoming_status', sql`status IN ('DETECTED', 'CONFIRMED')`),
  ],
);

export const incomingTxCursors = sqliteTable('incoming_tx_cursors', {
  walletId: text('wallet_id').primaryKey().references(() => wallets.id, { onDelete: 'cascade' }),
  chain: text('chain').notNull(),
  network: text('network').notNull(),
  lastSignature: text('last_signature'),
  lastBlockNumber: integer('last_block_number'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
```
**Source:** Derived from design doc 76 section 2.1-2.3, following existing Drizzle patterns in schema.ts

### Zod Schema for IncomingTransaction
```typescript
// packages/core/src/schemas/incoming-transaction.schema.ts
import { z } from 'zod';
import { ChainTypeEnum, NetworkTypeEnum } from '../enums/index.js';

export const INCOMING_TX_STATUSES = ['DETECTED', 'CONFIRMED'] as const;
export type IncomingTxStatus = (typeof INCOMING_TX_STATUSES)[number];
export const IncomingTxStatusEnum = z.enum(INCOMING_TX_STATUSES);

export const IncomingTransactionSchema = z.object({
  id: z.string(),
  txHash: z.string(),
  walletId: z.string(),
  fromAddress: z.string(),
  amount: z.string(),
  tokenAddress: z.string().nullable(),
  chain: ChainTypeEnum,
  network: z.string(),
  status: IncomingTxStatusEnum,
  blockNumber: z.number().int().nullable(),
  detectedAt: z.number().int(),
  confirmedAt: z.number().int().nullable(),
  isSuspicious: z.boolean().optional(),
});
export type IncomingTransaction = z.infer<typeof IncomingTransactionSchema>;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Types + interface in one file | Separate types file + interface file | v1.1 (IChainAdapter) | Cleaner imports, smaller files |
| Hardcoded CHECK strings | SSoT enum arrays -> `inList()` / `buildCheckSql()` | v1.4 | Single source of truth for domain values |
| No migration chain tests | Full-path migration chain tests (T-1 to T-11) | v1.4.8 | Prevents schema drift between fresh and migrated DBs |

## Open Questions

1. **IncomingTxStatus enum: SSoT array vs plain type alias**
   - What we know: Design doc uses `type IncomingTxStatus = 'DETECTED' | 'CONFIRMED'` (plain type alias in `chain-subscriber.types.ts`)
   - What's unclear: Should we follow the SSoT enum pattern (`INCOMING_TX_STATUSES` const array + `z.enum()`) or keep it simple as a type alias?
   - Recommendation: Use SSoT enum pattern (const array + Zod enum) for consistency with all other enums in the project. The type alias in `chain-subscriber.types.ts` becomes a re-export from the enum. This enables reuse in CHECK constraints (migrate.ts) and Drizzle schema (schema.ts).

2. **Drizzle partial index support**
   - What we know: The `idx_incoming_tx_status` uses `WHERE status = 'DETECTED'` (partial index). Drizzle's `index()` API may not directly support WHERE clauses.
   - What's unclear: Whether drizzle-orm's SQLite dialect supports partial indexes via the builder API.
   - Recommendation: Define the standard `index()` in Drizzle schema (without WHERE). The actual partial index is created by the migration DDL and the `getCreateIndexStatements()` function, which use raw SQL. The Drizzle schema is primarily for query building, not index creation.

3. **Event type placement: IncomingTxEvent**
   - What we know: Design doc 76 references `IncomingTxEvent` for the EventBus (`eventBus.emit('transaction:incoming', ...)`). The current `WaiaasEventMap` has 5 event types.
   - What's unclear: Whether to add the event type in this phase (224) or defer to Phase 226 (where the queue/flush/event pipeline is built).
   - Recommendation: Add it in this phase since it's a type definition. Having it available early enables other phases to compile against it. It's a small addition to `event-types.ts`.

## Sources

### Primary (HIGH confidence)
- Design doc 76 (`internal/design/76-incoming-transaction-monitoring.md`) - sections 1.1-1.5 (IChainSubscriber), 2.1-2.7 (DB schema), 2.7 (migration DDL)
- Existing codebase: `packages/core/src/interfaces/IChainAdapter.ts` - interface definition pattern
- Existing codebase: `packages/core/src/interfaces/chain-adapter.types.ts` - companion types pattern
- Existing codebase: `packages/daemon/src/infrastructure/database/migrate.ts` - migration pattern (v2-v20)
- Existing codebase: `packages/daemon/src/infrastructure/database/schema.ts` - Drizzle schema pattern (15 tables)
- Existing codebase: `packages/daemon/src/__tests__/migration-chain.test.ts` - migration test pattern

### Secondary (MEDIUM confidence)
- Stack research (`incoming-tx-monitor-STACK.md`) - technology choices validated against official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all patterns established in codebase
- Architecture: HIGH - design doc 76 provides exact interface/schema definitions
- Pitfalls: HIGH - migration chain test pattern is well-established and documents known issues

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable domain, internal architecture)
