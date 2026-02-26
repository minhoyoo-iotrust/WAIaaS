# Phase 268: 포지션 인프라 설계 - Research

**Researched:** 2026-02-26
**Domain:** DeFi position management infrastructure (SQLite schema, Zod discriminatedUnion, polling scheduler, REST API, Admin UI wireframe)
**Confidence:** HIGH

## Summary

Phase 268 is a **design-only** phase that defines the shared infrastructure for all DeFi position types (LENDING, YIELD, PERP, STAKING). The deliverable is a design document, not code. The infrastructure consists of four components: (1) a `positions` SQLite table with discriminatedUnion category support via DB v25 migration, (2) a `PositionTracker` scheduler service with category-specific polling intervals and batched writes, (3) a unified `GET /v1/wallets/:id/positions` REST API Zod response schema, and (4) an Admin portfolio wireframe.

The codebase already has strong established patterns for each component: the `transactions` table pattern for SQLite schema (Drizzle ORM + CHECK constraints from SSoT enums), the `BackgroundWorkers` system for periodic scheduling, the `IncomingTxQueue` pattern for batched SQLite writes, the `StakingPositionsResponseSchema` pattern for REST API response schemas, and the Preact + signals Admin UI for wireframes. Phase 268 needs to extend these existing patterns rather than introduce new ones.

**Primary recommendation:** Design a `positions` table with `category TEXT CHECK(...)` as the discriminant, a JSON `metadata` column for category-specific fields (avoiding the need for dozens of nullable columns), and batch-write via a memory queue flushed in `BackgroundWorkers` intervals. Use `defi_positions` as the table name to avoid ambiguity with generic "positions."

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| POS-01 | positions 통합 테이블 스키마가 category(LENDING/YIELD/PERP/STAKING) discriminatedUnion으로 정의된다 | SQLite schema patterns (Drizzle, CHECK constraints from SSoT arrays), discriminatedUnion pattern from TransactionRequestSchema, metadata JSON column pattern from transactions.bridgeMetadata |
| POS-02 | PositionTracker 동기화 스케줄러가 카테고리별 차등 주기(Lending 5분, Perp 1분, Yield 1시간)를 설계한다 | BackgroundWorkers interval system, AsyncPollingService per-tracker timing pattern, BalanceMonitorService setInterval pattern |
| POS-03 | GET /v1/wallets/:id/positions 통합 응답 Zod 스키마가 4개 카테고리를 포함한다 | StakingPositionsResponseSchema existing pattern, OpenAPIHono createRoute pattern, Zod discriminatedUnion on 'category' field |
| POS-04 | Admin 포트폴리오 뷰 와이어프레임이 프로토콜별 포지션, USD 환산, APY, 헬스 팩터를 표시한다 | Admin dashboard StatCard pattern, Table component, fetchDisplayCurrency/formatWithDisplay USD conversion, Preact signals state management |
| POS-05 | DB 마이그레이션 v25 스키마가 positions 테이블을 정의한다 | Migration v24 (latest) pattern, LATEST_SCHEMA_VERSION=24 increment to 25, standard Migration push pattern with BEGIN/COMMIT |
| POS-06 | positions 테이블 배치 쓰기 전략이 SQLite 쓰기 경합을 방지하도록 설계된다 | IncomingTxQueue pattern (Map-based dedup, MAX_BATCH=100, ON CONFLICT), BEGIN IMMEDIATE serialization for policy engine, WAL mode already enabled |
</phase_requirements>

## Standard Stack

### Core (Already in Project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | Existing | Drizzle ORM schema definitions for SQLite tables | Project SSoT: Zod -> TS types -> Drizzle schema |
| better-sqlite3 | Existing | Raw SQLite operations for migrations and batch writes | Already used for all 17 tables, WAL mode enabled |
| zod | 3.x | Schema validation SSoT | Project rule: Zod SSoT, discriminatedUnion pattern |
| @hono/zod-openapi | Existing | OpenAPI route definitions with Zod validation | All 18 routes use this pattern |
| Preact 10.x + @preact/signals | Existing | Admin UI reactive state | All Admin pages use this |

### Supporting (Already in Project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| IPriceOracle | Existing | USD price conversion for positions | Portfolio USD value calculation |
| BackgroundWorkers | Existing | Periodic task scheduler | PositionTracker polling registration |
| EventBus | Existing | Cross-service event emission | Position update notifications |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSON metadata column | Category-specific columns | JSON is more flexible for 4+ categories but loses SQL queryability; category-specific columns would create 20+ nullable columns. JSON wins for extensibility. |
| `defi_positions` table name | `positions` table name | `positions` is simpler but ambiguous; STATE.md flags this as an open decision. `defi_positions` is clearer and avoids future naming conflicts. |
| BackgroundWorkers multi-registration | Dedicated PositionTracker class with internal timers | Multi-registration is simpler but loses per-category timing; a dedicated class with internal interval management per category is more precise. Recommend dedicated class. |

## Architecture Patterns

### Recommended Design Document Structure

```
설계 문서:
├── 1. positions 테이블 스키마           # POS-01, POS-05
│   ├── 1.1 테이블 DDL
│   ├── 1.2 Drizzle ORM 정의
│   ├── 1.3 CHECK 제약 조건
│   ├── 1.4 인덱스 전략
│   └── 1.5 DB v25 마이그레이션 SQL
├── 2. Position Zod SSoT 스키마          # POS-01, POS-03
│   ├── 2.1 PositionCategory enum
│   ├── 2.2 Base Position 공통 필드
│   ├── 2.3 카테고리별 메타데이터 타입
│   └── 2.4 discriminatedUnion 통합 스키마
├── 3. PositionTracker 서비스            # POS-02, POS-06
│   ├── 3.1 IPositionProvider 인터페이스
│   ├── 3.2 카테고리별 폴링 주기
│   ├── 3.3 배치 쓰기 전략
│   └── 3.4 데몬 라이프사이클 연동
├── 4. REST API 명세                     # POS-03
│   ├── 4.1 GET /v1/wallets/:id/positions
│   ├── 4.2 응답 Zod 스키마
│   └── 4.3 필터링 쿼리 파라미터
└── 5. Admin 포트폴리오 와이어프레임      # POS-04
    ├── 5.1 포지션 목록 레이아웃
    ├── 5.2 카테고리별 카드 구성
    └── 5.3 USD 환산 + APY + 헬스 팩터
```

### Pattern 1: SQLite Table with JSON Metadata (Discriminated by Category)

**What:** A single `defi_positions` table with common columns + a `metadata` JSON TEXT column for category-specific fields. The `category` column acts as the discriminant.

**When to use:** When multiple subtypes share common fields but have distinct extra fields, and the number of subtypes will grow.

**Why this approach:** The existing `transactions` table already uses `bridgeMetadata TEXT` for tracker-specific data. The same pattern works here. Keeps the table schema stable as new categories are added.

**Example schema:**
```sql
CREATE TABLE IF NOT EXISTS defi_positions (
  id TEXT PRIMARY KEY,                          -- UUID v7
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  category TEXT NOT NULL,                       -- LENDING | YIELD | PERP | STAKING
  provider TEXT NOT NULL,                       -- 'aave_v3' | 'kamino' | 'lido' | 'jito' | 'pendle' | 'drift'
  chain TEXT NOT NULL,                          -- ChainType SSoT
  network TEXT,                                 -- NetworkType SSoT (nullable)
  asset_id TEXT,                                -- CAIP-19 asset identifier (nullable)
  amount TEXT NOT NULL,                         -- Position size as decimal string
  amount_usd REAL,                              -- USD equivalent (nullable, from IPriceOracle)
  metadata TEXT,                                -- Category-specific JSON (nullable)
  status TEXT NOT NULL DEFAULT 'ACTIVE',        -- ACTIVE | CLOSED | LIQUIDATED
  opened_at INTEGER NOT NULL,                   -- Unix epoch seconds
  closed_at INTEGER,                            -- Unix epoch seconds (nullable)
  last_synced_at INTEGER NOT NULL,              -- Unix epoch seconds (last PositionTracker update)
  created_at INTEGER NOT NULL,                  -- Unix epoch seconds
  updated_at INTEGER NOT NULL                   -- Unix epoch seconds
);
```

### Pattern 2: Zod discriminatedUnion for Position Categories

**What:** Use `z.discriminatedUnion('category', [...])` to validate position metadata per category, matching the established `TransactionRequestSchema` pattern.

**When to use:** When API responses contain mixed-type items that consumers must disambiguate.

**Example:**
```typescript
// Base position (common to all categories)
const BasePositionSchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  provider: z.string(),
  chain: ChainTypeEnum,
  network: NetworkTypeEnum.nullable(),
  assetId: Caip19Schema.nullable(),
  amount: z.string(),
  amountUsd: z.number().nullable(),
  status: z.enum(['ACTIVE', 'CLOSED', 'LIQUIDATED']),
  openedAt: z.number().int(),
  closedAt: z.number().int().nullable(),
  lastSyncedAt: z.number().int(),
});

// Category-specific extensions
const LendingPositionSchema = BasePositionSchema.extend({
  category: z.literal('LENDING'),
  positionType: z.enum(['SUPPLY', 'BORROW']),
  apy: z.number().nullable(),
  healthFactor: z.number().nullable(),
  collateralUsd: z.number().nullable(),
  debtUsd: z.number().nullable(),
});

const StakingPositionSchema = BasePositionSchema.extend({
  category: z.literal('STAKING'),
  apy: z.number().nullable(),
  pendingUnstake: z.object({...}).nullable(),
});

// ... YieldPositionSchema, PerpPositionSchema

const PositionSchema = z.discriminatedUnion('category', [
  LendingPositionSchema,
  StakingPositionSchema,
  YieldPositionSchema,
  PerpPositionSchema,
]);
```

### Pattern 3: PositionTracker as Dedicated Service with Per-Category Intervals

**What:** A standalone service class (not BackgroundWorkers multi-registration) that manages per-category polling with different intervals.

**When to use:** When a single service needs multiple timer loops with different frequencies.

**Rationale:** BackgroundWorkers uses a single interval per worker. PositionTracker needs 3-4 different intervals (Perp 1min, Lending 5min, Staking 15min, Yield 1h). A dedicated class with internal `setInterval` calls per category (similar to `BalanceMonitorService`) is the right pattern.

**Example:**
```typescript
class PositionTracker {
  private timers = new Map<PositionCategory, NodeJS.Timeout>();
  private providers = new Map<string, IPositionProvider>();

  // Category -> polling interval mapping
  private readonly intervals: Record<PositionCategory, number> = {
    PERP: 60_000,      // 1 minute
    LENDING: 300_000,   // 5 minutes
    STAKING: 900_000,   // 15 minutes
    YIELD: 3_600_000,   // 1 hour
  };

  start(): void {
    for (const [category, intervalMs] of Object.entries(this.intervals)) {
      const timer = setInterval(() => this.syncCategory(category), intervalMs);
      timer.unref();
      this.timers.set(category, timer);
    }
  }
}
```

### Pattern 4: Batch Write via Memory Queue (IncomingTxQueue Pattern)

**What:** Accumulate position updates in a `Map` buffer, then batch-flush to SQLite using prepared statements in a single transaction.

**Why:** Prevents SQLITE_BUSY contention from concurrent PositionTracker category loops writing simultaneously. The `IncomingTxQueue` pattern is proven in v27.1 for exactly this problem.

**Example:**
```typescript
class PositionWriteQueue {
  private queue = new Map<string, PositionUpsert>(); // key: walletId:provider:assetId
  private static MAX_BATCH = 100;

  enqueue(position: PositionUpsert): void {
    const key = `${position.walletId}:${position.provider}:${position.assetId}`;
    this.queue.set(key, position);
  }

  flush(sqlite: Database): number {
    if (this.queue.size === 0) return 0;
    const batch = [...this.queue.values()].slice(0, PositionWriteQueue.MAX_BATCH);

    const stmt = sqlite.prepare(`INSERT INTO defi_positions (...) VALUES (...)
      ON CONFLICT(wallet_id, provider, asset_id) DO UPDATE SET ...`);

    const runBatch = sqlite.transaction((items) => {
      let count = 0;
      for (const item of items) {
        stmt.run(...);
        count++;
      }
      return count;
    });

    const inserted = runBatch(batch);
    for (const item of batch) {
      this.queue.delete(`${item.walletId}:${item.provider}:${item.assetId}`);
    }
    return inserted;
  }
}
```

### Anti-Patterns to Avoid

- **Category-specific columns in main table:** Adding `health_factor`, `leverage`, `maturity_date`, `margin_ratio`, etc. as nullable columns creates a wide, sparse table. Use JSON metadata instead.
- **One table per category:** `lending_positions`, `yield_positions`, etc. would prevent unified queries and require N JOIN operations for portfolio view.
- **Direct DB writes from polling callbacks:** Without a write queue, concurrent polling for different categories can cause SQLITE_BUSY. Always buffer through a queue.
- **Storing raw protocol responses:** Positions should normalize to a common schema. Protocol-specific raw data can go in metadata but the main columns must be standardized.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID v7 generation | Custom UUID implementation | Existing `generateId()` from `infrastructure/database/id.js` | Already provides ms-precision time ordering |
| USD price conversion | Manual CoinGecko/Pyth calls | Existing `IPriceOracle.getPrice()` | OracleChain with fallback + cross-validation already built |
| Periodic scheduling | Raw setInterval management | Extend `BackgroundWorkers` pattern or `BalanceMonitorService` pattern | Handles overlap prevention, unref, stopAll gracefully |
| Batch SQLite writes | Ad-hoc INSERT loops | `IncomingTxQueue` pattern (Map dedup + prepared statement + transaction) | Proven SQLITE_BUSY prevention |
| Zod -> OpenAPI types | Manual OpenAPI definitions | `@hono/zod-openapi` `z.object().openapi()` pattern | All 18 routes use this; auto-generates OpenAPI spec |
| CHECK constraint SQL | Hardcoded string literals | `buildCheckSql()` from `schema.ts` with SSoT enum arrays | Project convention: enum arrays as SSoT |

**Key insight:** This phase is design-only, so "don't hand-roll" means: reference existing implementations as blueprints in the design document rather than inventing new patterns.

## Common Pitfalls

### Pitfall 1: Table Name Ambiguity

**What goes wrong:** Using `positions` as the table name. In a wallet context, "position" could mean account position, token balance, or DeFi position.
**Why it happens:** Natural naming instinct; "positions" feels concise.
**How to avoid:** Use `defi_positions` to disambiguate. STATE.md explicitly flags this as an open decision.
**Warning signs:** Confusion in subsequent phases about what the "positions" endpoint returns.

### Pitfall 2: UNIQUE Constraint Design for Upsert

**What goes wrong:** Missing or incorrect UNIQUE constraint prevents ON CONFLICT DO UPDATE (upsert) from working correctly.
**Why it happens:** Positions are identified by (wallet_id, provider, chain, asset_id, category) composite key. Getting this wrong means duplicate rows or update failures.
**How to avoid:** Define a UNIQUE INDEX on `(wallet_id, provider, asset_id, category)` and document it clearly. The `asset_id` field (CAIP-19) disambiguates the same token across different chains/networks.
**Warning signs:** Duplicate position rows after polling sync.

### Pitfall 3: SQLite JSON Queryability

**What goes wrong:** Designing the metadata JSON structure without considering how it will be queried. SQLite json_extract() exists but is slower than column access.
**Why it happens:** Putting too much into JSON and then needing to filter/sort by those fields.
**How to avoid:** Common query fields (amount, amount_usd, status, category, provider) MUST be real columns. JSON metadata is only for category-specific fields that are displayed but rarely filtered.
**Warning signs:** API query performance degrades when filtering positions by health_factor or leverage (fields in JSON).

### Pitfall 4: Polling Interval Drift

**What goes wrong:** Using `setInterval` without accounting for async handler duration. If a Lending sync takes 4.5 minutes and interval is 5 minutes, the next sync starts only 0.5 minutes later.
**Why it happens:** setInterval fires based on clock time, not handler completion.
**How to avoid:** Use the `BackgroundWorkers` overlap prevention pattern (running flag per category). If handler is still running at next interval tick, skip.
**Warning signs:** Concurrent sync operations for the same category causing SQLITE_BUSY.

### Pitfall 5: Missing STAKING Category Backward Compatibility

**What goes wrong:** The existing `GET /v1/wallet/staking` endpoint returns staking positions derived from transaction data. The new `positions` table introduces a separate source of truth.
**Why it happens:** Two systems tracking staking positions (transaction-derived vs. PositionTracker-synced).
**How to avoid:** Design document must specify the migration path: (1) STAKING positions in the new table are populated by PositionTracker, (2) the existing `/wallet/staking` endpoint is deprecated in favor of `/wallets/:id/positions?category=STAKING`, (3) migration plan for Lido/Jito from transaction-derived to tracker-synced.
**Warning signs:** Inconsistent staking balances between old and new endpoints.

### Pitfall 6: Migration SQL Without Index Deferral

**What goes wrong:** Creating indexes inside the migration SQL when they reference columns that don't exist yet in older DB versions.
**Why it happens:** The `pushSchema` function creates indexes separately (MIGR-01 fix), but migration SQL might inadvertently include CREATE INDEX.
**How to avoid:** Migration v25 should only CREATE TABLE + INSERT INTO schema_version. Indexes are handled by pushSchema's getCreateIndexStatements().
**Warning signs:** Migration failure on existing databases with error "no such column."

## Code Examples

### DB Migration v25 Pattern (from migration v24)

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
        category TEXT NOT NULL CHECK(category IN ('LENDING', 'YIELD', 'PERP', 'STAKING')),
        provider TEXT NOT NULL,
        chain TEXT NOT NULL CHECK(chain IN (${CHAIN_TYPES.map(v => `'${v}'`).join(', ')})),
        network TEXT CHECK(network IS NULL OR network IN (${NETWORK_TYPES.map(v => `'${v}'`).join(', ')})),
        asset_id TEXT,
        amount TEXT NOT NULL,
        amount_usd REAL,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'CLOSED', 'LIQUIDATED')),
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        last_synced_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  },
});
```

### Drizzle ORM Schema Definition (from existing pattern)

```typescript
// Source: packages/daemon/src/infrastructure/database/schema.ts patterns
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
    uniqueIndex('idx_defi_positions_unique').on(table.walletId, table.provider, table.assetId, table.category),
    check('check_position_category', buildCheckSql('category', POSITION_CATEGORIES)),
    check('check_position_status', buildCheckSql('status', POSITION_STATUSES)),
    check('check_position_chain', buildCheckSql('chain', CHAIN_TYPES)),
  ],
);
```

### REST API Response Schema (from StakingPositionsResponseSchema pattern)

```typescript
// Source: packages/daemon/src/api/routes/openapi-schemas.ts pattern
const PositionBaseSchema = z.object({
  id: z.string(),
  walletId: z.string(),
  provider: z.string(),
  chain: z.string(),
  network: z.string().nullable(),
  assetId: z.string().nullable(),
  amount: z.string(),
  amountUsd: z.number().nullable(),
  status: z.enum(['ACTIVE', 'CLOSED', 'LIQUIDATED']),
  openedAt: z.number().int(),
  lastSyncedAt: z.number().int(),
});

const LendingPositionResponseSchema = PositionBaseSchema.extend({
  category: z.literal('LENDING'),
  positionType: z.enum(['SUPPLY', 'BORROW']),
  apy: z.number().nullable(),
  healthFactor: z.number().nullable(),
}).openapi('LendingPosition');

// ... other categories

export const PositionsResponseSchema = z.object({
  walletId: z.string(),
  positions: z.array(z.discriminatedUnion('category', [
    LendingPositionResponseSchema,
    StakingPositionResponseSchema,
    YieldPositionResponseSchema,
    PerpPositionResponseSchema,
  ])),
  totalValueUsd: z.number().nullable(),
}).openapi('PositionsResponse');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Transaction-derived staking positions | To be: PositionTracker-synced positions | Phase 268 (this phase) | Staking positions will move from tx aggregation to dedicated table |
| Per-protocol position endpoints | To be: Unified `/wallets/:id/positions` | Phase 268 (this phase) | AI agents get one endpoint for all DeFi positions |
| No DeFi position persistence | To be: `defi_positions` table with batch sync | Phase 268 (this phase) | Enables monitoring, alerting, portfolio view |

**Existing position-like data:**
- `GET /v1/wallet/staking`: Returns staking positions derived from completed transactions (Lido/Jito). This is transaction-aggregation, not a real position table. Phase 268 designs the replacement.

## Open Questions

1. **Table name: `positions` vs `defi_positions`**
   - What we know: STATE.md flags this as undecided. `positions` is shorter; `defi_positions` is unambiguous.
   - What's unclear: Future features might need other "position" tables (e.g., order book positions).
   - Recommendation: Use `defi_positions` for clarity. The prefix cost is minimal; the disambiguation value is high.

2. **STAKING category relationship with existing `/wallet/staking` endpoint**
   - What we know: Current staking endpoint derives positions from transaction records. New `defi_positions` table will be the SSoT for all position data.
   - What's unclear: Exact deprecation timeline for the old endpoint.
   - Recommendation: Design document should specify that `/wallet/staking` is deprecated in favor of `/wallets/:id/positions?category=STAKING`, but the old endpoint continues to work during transition.

3. **IPositionProvider interface location**
   - What we know: `IActionProvider` lives in `@waiaas/core`. Position providers will be called by PositionTracker to fetch current position state from on-chain/API sources.
   - What's unclear: Whether `IPositionProvider` belongs in `@waiaas/core` (interface) or `@waiaas/actions` (implementations).
   - Recommendation: Interface in `@waiaas/core`, implementations in `@waiaas/actions` (same split as IActionProvider).

4. **Metadata JSON schema validation**
   - What we know: The `metadata` column stores category-specific fields as JSON. Zod validates on API response but not on DB write.
   - What's unclear: Whether to validate metadata JSON at write time (slower, safer) or only at read time (faster, accepts any JSON).
   - Recommendation: Validate at API response time only (read path). The PositionTracker controls all writes, so write-path validation adds overhead without safety benefit.

## Sources

### Primary (HIGH confidence)
- `/packages/daemon/src/infrastructure/database/schema.ts` - Current 17-table Drizzle schema with CHECK constraints from SSoT enums
- `/packages/daemon/src/infrastructure/database/migrate.ts` - Migration system (v1-v24), LATEST_SCHEMA_VERSION=24, pushSchema/runMigrations pattern
- `/packages/core/src/schemas/transaction.schema.ts` - discriminatedUnion 5-type pattern for TransactionRequestSchema
- `/packages/daemon/src/lifecycle/workers.ts` - BackgroundWorkers periodic task scheduler
- `/packages/daemon/src/services/incoming/incoming-tx-queue.ts` - IncomingTxQueue batch write pattern (Map dedup + ON CONFLICT)
- `/packages/daemon/src/services/async-polling-service.ts` - AsyncPollingService per-tracker timing and DB update pattern
- `/packages/daemon/src/services/monitoring/balance-monitor-service.ts` - BalanceMonitorService setInterval + config pattern
- `/packages/daemon/src/api/routes/staking.ts` - Existing staking position route (transaction-derived)
- `/packages/daemon/src/api/routes/openapi-schemas.ts` - StakingPositionsResponseSchema, OpenAPI Zod patterns
- `/packages/core/src/interfaces/action-provider.types.ts` - IActionProvider interface (model for IPositionProvider)
- `/packages/core/src/interfaces/price-oracle.types.ts` - IPriceOracle for USD conversion
- `/packages/core/src/enums/notification.ts` - NotificationEventType SSoT array pattern
- `/packages/admin/src/pages/dashboard.tsx` - Admin StatCard + Table + display currency patterns
- `/.planning/STATE.md` - Open decision: table name `positions` vs `defi_positions`

### Secondary (MEDIUM confidence)
- `/packages/core/src/schemas/signing-protocol.ts` - EVENT_CATEGORY_MAP pattern (39 events -> 6 categories) for future monitoring events
- `/.planning/REQUIREMENTS.md` - POS-01 through POS-06 requirement definitions
- `/.planning/ROADMAP.md` - Phase 268 success criteria and dependency chain

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries/patterns already in the codebase
- Architecture: HIGH - Direct extensions of existing patterns (IncomingTxQueue, BackgroundWorkers, discriminatedUnion)
- Pitfalls: HIGH - Based on actual observed patterns in the codebase (MIGR-01, SQLITE_BUSY, JSON metadata)

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable patterns, internal project)
