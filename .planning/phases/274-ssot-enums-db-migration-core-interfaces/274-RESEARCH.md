# Phase 274: SSoT Enums + DB Migration + Core Interfaces - Research

**Researched:** 2026-02-26
**Domain:** DeFi Lending SSoT enums, SQLite migration, TypeScript interfaces
**Confidence:** HIGH

## Summary

Phase 274 establishes the foundational type system, database schema, and core interfaces for the entire DeFi Lending stack. This is a "plumbing-first" phase with zero external dependencies -- all work is internal to the WAIaaS codebase. The phase touches 4 packages (`@waiaas/core` enums/interfaces/i18n/schemas, `@waiaas/daemon` DB migration/schema/notification, and `@waiaas/actions` for future provider registration compatibility) across 3 concerns: (1) SSoT enum expansion, (2) defi_positions table migration, (3) ILendingProvider + IPositionProvider interface definition.

The codebase has mature, well-established patterns for all three concerns. Enum expansion follows the `as const` + Zod + type derivation pattern in `packages/core/src/enums/`. DB migration follows the `MIGRATIONS.push({ version: N, ... })` pattern in `packages/daemon/src/infrastructure/database/migrate.ts`. Interface definition follows the Zod SSoT + TypeScript interface pattern in `packages/core/src/interfaces/`. Every pattern has precedent -- no novel architecture is needed.

**Primary recommendation:** Follow the existing codebase patterns exactly. The m29-00 design doc (shipped v29.0) provides copy-ready TypeScript code for all three concerns. The planner should decompose into 3 plans: (1) enums + notification integration, (2) DB migration + Drizzle schema, (3) interface definitions.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENUM-01 | LIQUIDATION_WARNING 등 4개 DeFi 알림 이벤트가 notification enum에 추가됨 | `NOTIFICATION_EVENT_TYPES` array in `packages/core/src/enums/notification.ts` -- append 4 events; update `EVENT_CATEGORY_MAP` + `EVENT_DESCRIPTIONS` in `signing-protocol.ts`; add `NOTIFICATION_CATEGORIES` entry `'defi_monitoring'`; add i18n templates in `en.ts`/`ko.ts`; add `LIQUIDATION_IMMINENT` to `BROADCAST_EVENTS` in notification-service.ts |
| ENUM-02 | POSITION_CATEGORIES (LENDING/YIELD/PERP/STAKING) enum이 core/enums/defi.ts에 정의됨 | New file `packages/core/src/enums/defi.ts` with `POSITION_CATEGORIES` as const array + Zod enum + type derivation; re-export from `enums/index.ts` |
| ENUM-03 | POSITION_STATUSES (ACTIVE/CLOSED/LIQUIDATED) enum이 core/enums/defi.ts에 정의됨 | Same file as ENUM-02; `POSITION_STATUSES` as const array + Zod enum + type; re-export from `enums/index.ts` |
| ENUM-04 | defi_positions 테이블이 DB 마이그레이션으로 생성됨 (category discriminant, UNIQUE key) | Migration v25 in `migrate.ts`: CREATE TABLE with 14 columns, 4 CHECK constraints from SSoT arrays; DDL in `getCreateTableStatements()`; indexes in `getCreateIndexStatements()`; Drizzle ORM definition in `schema.ts`; bump `LATEST_SCHEMA_VERSION` 24 -> 25 |
| ENUM-05 | DeFi 이벤트 메시지 템플릿이 알림 서비스에 등록됨 | i18n message templates in `en.ts` and `ko.ts` for 4 events (LIQUIDATION_WARNING, MATURITY_WARNING, MARGIN_WARNING, LIQUIDATION_IMMINENT); getNotificationMessage() auto-resolves via locale map |
| LEND-01 | ILendingProvider 인터페이스가 IActionProvider를 확장하여 getPosition/getHealthFactor/getMarkets 메서드 제공 | New file `packages/core/src/interfaces/lending-provider.types.ts` with interface extending IActionProvider; Zod schemas for LendingPositionSummary, HealthFactor, MarketInfo; re-export from `interfaces/index.ts` and `core/index.ts` |
| LEND-02 | IPositionProvider 인터페이스가 PositionTracker용 읽기 전용 동기화 메서드 제공 | New file `packages/core/src/interfaces/position-provider.types.ts` with IPositionProvider interface (getPositions, getProviderName, getSupportedCategories); PositionUpdate type; re-export from `interfaces/index.ts` and `core/index.ts` |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.x (existing) | Schema SSoT for enums, types, validation | Project convention: Zod is SSoT (CLAUDE.md) |
| drizzle-orm | 0.36.x (existing) | ORM table definition for defi_positions | All 17 existing tables use Drizzle ORM |
| better-sqlite3 | 11.x (existing) | Raw SQL migrations (CREATE TABLE, ALTER TABLE) | Migration pattern uses raw better-sqlite3, not Drizzle migrations |
| vitest | 3.x (existing) | Unit tests for enums, migration, interfaces | Entire test suite uses vitest |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @waiaas/core | workspace | Enum + interface + i18n definitions | All SSoT types live in @waiaas/core |
| @waiaas/actions | workspace | Provider registration integration check | Verify ILendingProvider is compatible with registerBuiltInProviders |

### Alternatives Considered

None. This phase uses only existing project libraries. No new dependencies needed.

## Architecture Patterns

### Recommended File Structure

```
packages/core/src/
  enums/
    defi.ts                          # NEW: POSITION_CATEGORIES, POSITION_STATUSES
    notification.ts                  # MODIFY: +4 event types
    index.ts                         # MODIFY: re-export defi.ts enums
  interfaces/
    lending-provider.types.ts        # NEW: ILendingProvider, LendingPositionSummary, HealthFactor, MarketInfo
    position-provider.types.ts       # NEW: IPositionProvider, PositionUpdate
    index.ts                         # MODIFY: re-export new interfaces
  schemas/
    signing-protocol.ts              # MODIFY: EVENT_CATEGORY_MAP, EVENT_DESCRIPTIONS, NOTIFICATION_CATEGORIES
    position.schema.ts               # NEW: BasePositionSchema, metadata schemas, PositionSchema discriminatedUnion
  i18n/
    en.ts                            # MODIFY: +4 notification templates
    ko.ts                            # MODIFY: +4 notification templates
  index.ts                           # MODIFY: re-export new types

packages/daemon/src/
  infrastructure/database/
    schema.ts                        # MODIFY: +defiPositions table definition
    migrate.ts                       # MODIFY: +v25 migration, LATEST_SCHEMA_VERSION 24->25, +DDL, +indexes
  notifications/
    notification-service.ts          # MODIFY: BROADCAST_EVENTS +LIQUIDATION_IMMINENT
```

### Pattern 1: SSoT Enum Definition (as const + Zod + type)

**What:** Define enums as `as const` arrays, derive Zod schemas and TypeScript types.
**When to use:** Every enum in the project follows this pattern.
**Example:**

```typescript
// Source: packages/core/src/enums/notification.ts (existing pattern)
export const POSITION_CATEGORIES = ['LENDING', 'YIELD', 'PERP', 'STAKING'] as const;
export type PositionCategory = (typeof POSITION_CATEGORIES)[number];
export const PositionCategoryEnum = z.enum(POSITION_CATEGORIES);

export const POSITION_STATUSES = ['ACTIVE', 'CLOSED', 'LIQUIDATED'] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];
export const PositionStatusEnum = z.enum(POSITION_STATUSES);
```

### Pattern 2: DB Migration (MIGRATIONS.push)

**What:** Append new migration object to MIGRATIONS array with version, description, up function.
**When to use:** Every DB schema change since v1.4.
**Example:**

```typescript
// Source: packages/daemon/src/infrastructure/database/migrate.ts (v24 pattern)
MIGRATIONS.push({
  version: 25,
  description: 'Add defi_positions table for DeFi position tracking',
  up: (sqlite) => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS defi_positions (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
        category TEXT NOT NULL CHECK(category IN (${inList(POSITION_CATEGORIES)})),
        provider TEXT NOT NULL,
        chain TEXT NOT NULL CHECK(chain IN (${inList(CHAIN_TYPES)})),
        network TEXT CHECK(network IS NULL OR network IN (${inList(NETWORK_TYPES)})),
        asset_id TEXT,
        amount TEXT NOT NULL,
        amount_usd REAL,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN (${inList(POSITION_STATUSES)})),
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        last_synced_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  },
});
```

**Critical:** CREATE TABLE only in migration. CREATE INDEX goes in `getCreateIndexStatements()`. LATEST_SCHEMA_VERSION 24 -> 25. Fresh DB DDL in `getCreateTableStatements()` also needs the defi_positions CREATE TABLE statement.

### Pattern 3: Interface Extension (ILendingProvider extends IActionProvider)

**What:** Extend IActionProvider with domain-specific query methods.
**When to use:** Each DeFi framework provider type (Lending, Yield, Perp).
**Example:**

```typescript
// Source: m29-00 design doc section 13.1
import type { IActionProvider, ActionContext } from './action-provider.types.js';

export interface ILendingProvider extends IActionProvider {
  getPosition(walletId: string, context: ActionContext): Promise<LendingPositionSummary[]>;
  getHealthFactor(walletId: string, context: ActionContext): Promise<HealthFactor>;
  getMarkets(chain: string, network?: string): Promise<MarketInfo[]>;
}
```

### Pattern 4: IPositionProvider (Independent Interface)

**What:** Read-only position data source for PositionTracker. Does NOT extend IActionProvider.
**When to use:** Any provider that participates in position tracking.
**Example:**

```typescript
// Source: m29-00 design doc section 6.1
export interface IPositionProvider {
  getPositions(walletId: string): Promise<PositionUpdate[]>;
  getProviderName(): string;
  getSupportedCategories(): PositionCategory[];
}
```

### Pattern 5: Notification Event Addition

**What:** Add event type to NOTIFICATION_EVENT_TYPES + EVENT_CATEGORY_MAP + EVENT_DESCRIPTIONS + i18n templates.
**When to use:** Every new notification event.
**Files to modify (all must be updated atomically):**
1. `packages/core/src/enums/notification.ts` -- append to NOTIFICATION_EVENT_TYPES array
2. `packages/core/src/schemas/signing-protocol.ts` -- add NOTIFICATION_CATEGORIES entry `'defi_monitoring'`, add 4 entries to EVENT_CATEGORY_MAP, add 4 entries to EVENT_DESCRIPTIONS
3. `packages/core/src/i18n/en.ts` -- add 4 {title, body} templates
4. `packages/core/src/i18n/ko.ts` -- add 4 {title, body} templates
5. `packages/daemon/src/notifications/notification-service.ts` -- add LIQUIDATION_IMMINENT to BROADCAST_EVENTS

### Anti-Patterns to Avoid

- **Hardcoding CHECK constraint values:** Always derive from SSoT arrays (`buildCheckSql()` in schema.ts, template literal with `inList()` in migrate.ts)
- **Creating indexes in migration up():** Indexes belong in `getCreateIndexStatements()`, not in migration CREATE TABLE statements (Pitfall 6 from m29-00 doc)
- **Forgetting to update LATEST_SCHEMA_VERSION:** Must increment 24 -> 25 to prevent fresh DBs from running the migration
- **Skipping i18n parity:** Both en.ts and ko.ts must have all 4 new event templates. The `Messages` interface enforces `Record<NotificationEventType, ...>` so TypeScript will catch missing entries.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CHECK constraint SQL | String concatenation with hardcoded values | `buildCheckSql()` / `inList()` from migrate.ts | SSoT violation if values differ from enum arrays |
| Enum-to-type derivation | Manual TypeScript type definitions | `as const` + `(typeof X)[number]` pattern | Single source of truth; Zod + TS type + DB CHECK all from one array |
| Migration version tracking | Custom version logic | Existing `runMigrations()` + `schema_version` table | Battle-tested, handles fresh/existing DB distinction |
| Notification message formatting | Custom format logic per event | `getNotificationMessage()` + i18n template system | Existing i18n system handles all locales + variable interpolation |

**Key insight:** Every component in this phase has a well-established precedent in the codebase. The m29-00 design doc provides near-copy-ready code. Innovation is unnecessary and risky.

## Common Pitfalls

### Pitfall 1: EVENT_CATEGORY_MAP Key Count Mismatch

**What goes wrong:** Adding events to NOTIFICATION_EVENT_TYPES without updating EVENT_CATEGORY_MAP causes `Record<NotificationEventType, NotificationCategory>` type error.
**Why it happens:** The `Record` type in signing-protocol.ts enforces exact key parity.
**How to avoid:** Update all 5 files atomically: notification.ts, signing-protocol.ts (category map + descriptions), en.ts, ko.ts.
**Warning signs:** TypeScript compilation error "Property 'LIQUIDATION_WARNING' is missing in type..."

### Pitfall 2: Existing Test Assertion Count

**What goes wrong:** `enums.test.ts` asserts `NOTIFICATION_EVENT_TYPES` has a specific length (currently tests count). Adding 4 events breaks the assertion.
**Why it happens:** Snapshot-style length assertions in test file.
**How to avoid:** Update the length assertion in `packages/core/src/__tests__/enums.test.ts` and `packages/core/src/__tests__/signing-protocol.test.ts` (EVENT_CATEGORY_MAP coverage test checks "covers all N NotificationEventType values").
**Warning signs:** Test failure: "expected 44 to be 48"

### Pitfall 3: Migration CREATE INDEX in wrong place

**What goes wrong:** Putting CREATE INDEX inside the v25 migration up() causes "no such column" errors on pre-migration databases.
**Why it happens:** Indexes reference columns that may not exist until after migration runs. The project separates DDL (CREATE TABLE) from indexes (getCreateIndexStatements, run after migrations).
**How to avoid:** Put CREATE INDEX IF NOT EXISTS statements in `getCreateIndexStatements()`, not in migration.up().
**Warning signs:** Migration test failure on existing DBs.

### Pitfall 4: NOTIFICATION_CATEGORIES Type Update

**What goes wrong:** Adding 'defi_monitoring' to NOTIFICATION_CATEGORIES array but not updating the NotificationCategory type derivation.
**Why it happens:** NOTIFICATION_CATEGORIES is `as const` so the type auto-derives, but the EVENT_CATEGORY_MAP values must include the new category.
**How to avoid:** Add 'defi_monitoring' to the NOTIFICATION_CATEGORIES `as const` array. The type derivation and Zod schema automatically include it.
**Warning signs:** TypeScript error when assigning 'defi_monitoring' to NotificationCategory type.

### Pitfall 5: Drizzle schema.ts vs migrate.ts Inconsistency

**What goes wrong:** The Drizzle ORM table definition in schema.ts doesn't match the SQL in migrate.ts DDL.
**Why it happens:** Two places define the same table (Drizzle for ORM queries, raw SQL for migration/fresh DDL).
**How to avoid:** Ensure column names, types, CHECK constraints, and indexes match exactly between `schema.ts` (Drizzle), `getCreateTableStatements()` (fresh DDL), and `MIGRATIONS[25].up()` (migration).
**Warning signs:** Runtime column mismatch errors during ORM queries.

### Pitfall 6: Missing POSITION_CATEGORIES/POSITION_STATUSES Import in migrate.ts

**What goes wrong:** Migration uses SSoT arrays from @waiaas/core but forgets to import them.
**Why it happens:** New enums (POSITION_CATEGORIES, POSITION_STATUSES) are in a new file (defi.ts) that hasn't been re-exported yet.
**How to avoid:** Ensure `packages/core/src/enums/index.ts` re-exports from `defi.ts`, and `packages/core/src/index.ts` re-exports from enums. Then import in migrate.ts.
**Warning signs:** Build error: "Module 'POSITION_CATEGORIES' is not exported from '@waiaas/core'"

## Code Examples

### New Enum File: defi.ts

```typescript
// packages/core/src/enums/defi.ts
import { z } from 'zod';

// POSITION_CATEGORIES: DeFi position category discriminant for defi_positions table
export const POSITION_CATEGORIES = ['LENDING', 'YIELD', 'PERP', 'STAKING'] as const;
export type PositionCategory = (typeof POSITION_CATEGORIES)[number];
export const PositionCategoryEnum = z.enum(POSITION_CATEGORIES);

// POSITION_STATUSES: DeFi position lifecycle status
export const POSITION_STATUSES = ['ACTIVE', 'CLOSED', 'LIQUIDATED'] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];
export const PositionStatusEnum = z.enum(POSITION_STATUSES);
```

### Notification Event Type Additions

```typescript
// packages/core/src/enums/notification.ts -- append to NOTIFICATION_EVENT_TYPES
export const NOTIFICATION_EVENT_TYPES = [
  // ... existing 44 events ...
  'LIQUIDATION_WARNING',
  'MATURITY_WARNING',
  'MARGIN_WARNING',
  'LIQUIDATION_IMMINENT',
] as const;
```

### EVENT_CATEGORY_MAP Additions

```typescript
// packages/core/src/schemas/signing-protocol.ts
// Add 'defi_monitoring' to NOTIFICATION_CATEGORIES:
export const NOTIFICATION_CATEGORIES = [
  'transaction', 'policy', 'security_alert', 'session', 'owner', 'system',
  'defi_monitoring',  // NEW: DeFi position monitoring events
] as const;

// Add to EVENT_CATEGORY_MAP:
LIQUIDATION_WARNING: 'defi_monitoring',
MATURITY_WARNING: 'defi_monitoring',
MARGIN_WARNING: 'defi_monitoring',
LIQUIDATION_IMMINENT: 'security_alert',  // BROADCAST -- imminent fund loss
```

### i18n Message Templates (English)

```typescript
// packages/core/src/i18n/en.ts -- add to notifications:
LIQUIDATION_WARNING: {
  title: 'Liquidation Warning',
  body: '{walletName} health factor at {healthFactor} (threshold: {threshold}). Consider adding collateral or repaying debt.'
},
MATURITY_WARNING: {
  title: 'Maturity Warning',
  body: '{walletName} position in {provider} matures in {daysUntilMaturity} days. Redeem before maturity to avoid losses.'
},
MARGIN_WARNING: {
  title: 'Margin Warning',
  body: '{walletName} margin ratio at {marginRatio}% in {provider}. Add margin to avoid liquidation.'
},
LIQUIDATION_IMMINENT: {
  title: 'Liquidation Imminent',
  body: '{walletName} is at imminent risk of liquidation. Health factor: {healthFactor}. Immediate action required.'
},
```

### Drizzle ORM Table Definition

```typescript
// packages/daemon/src/infrastructure/database/schema.ts
import { POSITION_CATEGORIES, POSITION_STATUSES } from '@waiaas/core';

export const defiPositions = sqliteTable(
  'defi_positions',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id').notNull().references(() => wallets.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    provider: text('provider').notNull(),
    chain: text('chain').notNull(),
    network: text('network'),
    assetId: text('asset_id'),
    amount: text('amount').notNull(),
    amountUsd: real('amount_usd'),
    metadata: text('metadata'),
    status: text('status').notNull().default('ACTIVE'),
    openedAt: integer('opened_at', { mode: 'timestamp' }).notNull(),
    closedAt: integer('closed_at', { mode: 'timestamp' }),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_defi_positions_wallet_category').on(table.walletId, table.category),
    index('idx_defi_positions_wallet_provider').on(table.walletId, table.provider),
    index('idx_defi_positions_status').on(table.status),
    uniqueIndex('idx_defi_positions_unique').on(
      table.walletId, table.provider, table.assetId, table.category,
    ),
    check('check_position_category', buildCheckSql('category', POSITION_CATEGORIES)),
    check('check_position_status', buildCheckSql('status', POSITION_STATUSES)),
    check('check_position_chain', buildCheckSql('chain', CHAIN_TYPES)),
  ],
);
```

### ILendingProvider Interface

```typescript
// packages/core/src/interfaces/lending-provider.types.ts
import { z } from 'zod';
import type { IActionProvider, ActionContext } from './action-provider.types.js';

// Zod SSoT: LendingPositionSummary
export const LendingPositionSummarySchema = z.object({
  asset: z.string(),
  positionType: z.enum(['SUPPLY', 'BORROW']),
  amount: z.string(),
  amountUsd: z.number().nullable(),
  apy: z.number().nullable(),
});
export type LendingPositionSummary = z.infer<typeof LendingPositionSummarySchema>;

// Zod SSoT: HealthFactor
export const HealthFactorSchema = z.object({
  factor: z.number(),
  totalCollateralUsd: z.number(),
  totalDebtUsd: z.number(),
  currentLtv: z.number(),
  status: z.enum(['safe', 'warning', 'danger', 'critical']),
});
export type HealthFactor = z.infer<typeof HealthFactorSchema>;

// Zod SSoT: MarketInfo
export const MarketInfoSchema = z.object({
  asset: z.string(),
  symbol: z.string(),
  supplyApy: z.number(),
  borrowApy: z.number(),
  ltv: z.number(),
  availableLiquidity: z.string(),
});
export type MarketInfo = z.infer<typeof MarketInfoSchema>;

export interface ILendingProvider extends IActionProvider {
  getPosition(walletId: string, context: ActionContext): Promise<LendingPositionSummary[]>;
  getHealthFactor(walletId: string, context: ActionContext): Promise<HealthFactor>;
  getMarkets(chain: string, network?: string): Promise<MarketInfo[]>;
}
```

### IPositionProvider Interface

```typescript
// packages/core/src/interfaces/position-provider.types.ts
import type { PositionCategory } from '../enums/defi.js';

export interface PositionUpdate {
  walletId: string;
  category: PositionCategory;
  provider: string;
  chain: string;
  network?: string | null;
  assetId?: string | null;
  amount: string;
  amountUsd?: number | null;
  metadata: Record<string, unknown>;
  status: 'ACTIVE' | 'CLOSED' | 'LIQUIDATED';
  openedAt: number;
  closedAt?: number | null;
}

export interface IPositionProvider {
  getPositions(walletId: string): Promise<PositionUpdate[]>;
  getProviderName(): string;
  getSupportedCategories(): PositionCategory[];
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate tables per DeFi category | Single defi_positions with category discriminant | v29.0 design | JSON metadata column for category-specific data; 4 CHECK categories |
| positions table name | defi_positions table name | v29.0 decision DEC-DEFI-13 | Avoids ambiguity with wallet "positions" (balance/account positions) |
| No DeFi notification events | 4 DeFi events + defi_monitoring category | v29.0 design | New notification category `defi_monitoring` (6 -> 7 categories) |

## Open Questions

1. **Position Schema File Location**
   - What we know: m29-00 design suggests `packages/core/src/schemas/position.schema.ts` for Zod position schemas (BasePositionSchema, discriminatedUnion PositionSchema)
   - What's unclear: Whether to create this file in Phase 274 or defer to Phase 275 (PositionTracker implementation)
   - Recommendation: Create it in Phase 274 since it defines the Zod SSoT for the defi_positions table, which is in scope. The discriminatedUnion schema validates API output from positions endpoint.

2. **LendingPositionSummary vs LendingMetadataSchema Overlap**
   - What we know: LendingPositionSummary is for API/agent responses (ILendingProvider.getPosition), LendingMetadataSchema is for DB metadata column (defi_positions.metadata)
   - What's unclear: Both types exist in m29-00 design; should both be created in Phase 274?
   - Recommendation: Create both. LendingPositionSummary belongs to ILendingProvider (LEND-01). LendingMetadataSchema belongs to position.schema.ts (ENUM-04 defi_positions metadata). They serve different purposes.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 3.x |
| Config file | `vitest.config.ts` (per-package) |
| Quick run command | `pnpm --filter @waiaas/core run test` / `pnpm --filter @waiaas/daemon run test` |
| Full suite command | `pnpm turbo run test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENUM-01 | 4 DeFi events in NOTIFICATION_EVENT_TYPES + EVENT_CATEGORY_MAP + EVENT_DESCRIPTIONS + i18n | unit | `pnpm --filter @waiaas/core run test -- --run -t "Enum SSoT"` | existing (`enums.test.ts`, `signing-protocol.test.ts`, `i18n.test.ts`) -- update assertions |
| ENUM-02 | POSITION_CATEGORIES has 4 values, Zod validates | unit | `pnpm --filter @waiaas/core run test -- --run -t "Enum SSoT"` | new tests in `enums.test.ts` |
| ENUM-03 | POSITION_STATUSES has 3 values, Zod validates | unit | `pnpm --filter @waiaas/core run test -- --run -t "Enum SSoT"` | new tests in `enums.test.ts` |
| ENUM-04 | defi_positions table created, CHECK constraints work, UNIQUE index works | integration | `pnpm --filter @waiaas/daemon run test -- --run -t "migration-v25"` | new file: `migration-v25.test.ts` |
| ENUM-05 | getNotificationMessage() returns title/body for 4 DeFi events | unit | `pnpm --filter @waiaas/core run test -- --run -t "i18n"` | existing (`i18n.test.ts`) -- update |
| LEND-01 | ILendingProvider extends IActionProvider, schema validates | unit | `pnpm --filter @waiaas/core run test -- --run -t "interfaces"` | new tests in `interfaces.test.ts` or new file |
| LEND-02 | IPositionProvider type exports, PositionUpdate validates | unit | `pnpm --filter @waiaas/core run test -- --run -t "interfaces"` | new tests |

### Sampling Rate

- **Per task commit:** `pnpm --filter @waiaas/core run test && pnpm --filter @waiaas/daemon run test -- --run -t "migration"`
- **Per wave merge:** `pnpm turbo run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/daemon/src/__tests__/migration-v25.test.ts` -- covers ENUM-04 (defi_positions migration, CHECK constraints, UNIQUE index)
- [ ] Update `packages/core/src/__tests__/enums.test.ts` -- covers ENUM-02, ENUM-03 (new enum length assertions)
- [ ] Update `packages/core/src/__tests__/signing-protocol.test.ts` -- covers ENUM-01 (EVENT_CATEGORY_MAP count: 44 -> 48)
- [ ] Update `packages/core/src/__tests__/i18n.test.ts` -- covers ENUM-05 (new message templates)
- [ ] `packages/daemon/src/__tests__/enum-db-consistency.test.ts` may need update for new enum arrays

## Sources

### Primary (HIGH confidence)

- **Codebase inspection** -- all patterns verified from existing implementation:
  - `packages/core/src/enums/notification.ts` -- NOTIFICATION_EVENT_TYPES pattern
  - `packages/core/src/enums/index.ts` -- re-export pattern
  - `packages/core/src/schemas/signing-protocol.ts` -- EVENT_CATEGORY_MAP, EVENT_DESCRIPTIONS, NOTIFICATION_CATEGORIES
  - `packages/core/src/i18n/en.ts`, `ko.ts` -- i18n template pattern
  - `packages/core/src/interfaces/action-provider.types.ts` -- IActionProvider interface pattern
  - `packages/daemon/src/infrastructure/database/schema.ts` -- Drizzle ORM table + CHECK constraint pattern
  - `packages/daemon/src/infrastructure/database/migrate.ts` -- MIGRATIONS.push pattern, LATEST_SCHEMA_VERSION, getCreateTableStatements/getCreateIndexStatements
  - `packages/daemon/src/notifications/notification-service.ts` -- BROADCAST_EVENTS
  - `packages/actions/src/providers/lido-staking/index.ts` -- IActionProvider implementation pattern

### Secondary (HIGH confidence)

- **m29-00 design doc** (`internal/objectives/m29-00-defi-advanced-protocol-design.md`) -- complete design for:
  - Section 5: defi_positions table DDL, Drizzle ORM definition, v25 migration SQL
  - Section 6: IPositionProvider interface, PositionTracker service design
  - Section 11: Notification event additions, EVENT_CATEGORY_MAP, defi_monitoring category
  - Section 13: ILendingProvider interface, ActionDefinition 4 actions, LendingPositionSummary/HealthFactor/MarketInfo types

### Tertiary (HIGH confidence)

- **m29-02 objective** (`internal/objectives/m29-02-aave-evm-lending.md`) -- requirements mapping, file/module structure, technical decisions
- **REQUIREMENTS.md** (`.planning/REQUIREMENTS.md`) -- 7 requirements for Phase 274 (ENUM-01~05, LEND-01~02)
- **STATE.md** (`.planning/STATE.md`) -- research flags C1-C4, M6 for later phases

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- all patterns have direct precedent in codebase; m29-00 provides copy-ready designs
- Pitfalls: HIGH -- identified from actual codebase inspection (test assertions, migration ordering, index placement)

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (stable patterns, internal codebase)
