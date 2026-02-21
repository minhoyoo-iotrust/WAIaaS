# Architecture Patterns: Incoming Transaction Monitoring Integration

**Domain:** Incoming TX monitoring for existing WAIaaS daemon
**Researched:** 2026-02-21
**Source:** Codebase analysis + design doc 76 (2,441 lines)
**Confidence:** HIGH (all integration points verified against source code)

---

## Recommended Architecture

Incoming transaction monitoring introduces a **parallel subsystem** alongside the existing outgoing TX pipeline. The design strictly avoids modifying any existing interfaces (IChainAdapter, AdapterPool, 6-stage pipeline) and instead adds new interfaces, services, and data paths that integrate through established daemon patterns.

### High-Level Component Topology

```
DaemonLifecycle
  |
  +-- Step 4c-9: IncomingTxMonitorService (NEW, fail-soft)
  |     |-- IncomingTxQueue (memory queue)
  |     |-- SubscriptionMultiplexer (WS/polling manager)
  |     |    |-- SolanaIncomingSubscriber (IChainSubscriber impl)
  |     |    +-- EvmIncomingSubscriber (IChainSubscriber impl)
  |     +-- IIncomingSafetyRule[] (dust, unknownToken, largeAmount)
  |
  +-- Step 5: HTTP Server
  |     |-- GET /v1/wallet/incoming (NEW route)
  |     |-- GET /v1/wallet/incoming/summary (NEW route)
  |     +-- PATCH /v1/wallet/:id (MODIFIED: monitorIncoming field)
  |
  +-- Step 6: BackgroundWorkers (6 NEW workers)
  |     |-- incoming-tx-flush (5s)
  |     |-- incoming-tx-retention (1h)
  |     |-- incoming-tx-confirm-solana (30s)
  |     |-- incoming-tx-confirm-evm (30s)
  |     |-- incoming-tx-poll-solana (configurable)
  |     +-- incoming-tx-poll-evm (configurable)
  |
  +-- EventBus (EXTENDED: 3 new event types)
  |     |-- 'transaction:incoming' -> NotificationService
  |     |-- 'transaction:incoming:suspicious' -> NotificationService
  |     +-- 'incoming:flush:complete' -> internal orchestration
  |
  +-- DB v21 Migration (NEW tables + column)
        |-- incoming_transactions (4 indexes)
        |-- incoming_tx_cursors
        +-- wallets.monitor_incoming column
```

---

## Component Boundaries

| Component | Package | Responsibility | Communicates With |
|-----------|---------|---------------|-------------------|
| `IChainSubscriber` | `@waiaas/core` | Interface definition for chain-specific subscription | Implemented by adapter packages |
| `IIncomingSafetyRule` | `@waiaas/core` | Interface for suspicious TX detection rules | Consumed by IncomingTxMonitorService |
| `IncomingTransaction` type | `@waiaas/core` | Shared type for incoming TX data | Used by all incoming TX components |
| `IncomingTxEvent` / `IncomingSuspiciousTxEvent` | `@waiaas/core` | EventBus event payloads | WaiaasEventMap extension |
| `SolanaIncomingSubscriber` | `@waiaas/adapter-solana` | Solana logsSubscribe + polling | IncomingTxMonitorService via IChainSubscriber |
| `EvmIncomingSubscriber` | `@waiaas/adapter-evm` | EVM getLogs polling + optional WS | IncomingTxMonitorService via IChainSubscriber |
| `IncomingTxMonitorService` | `@waiaas/daemon` | Orchestrator: subscription lifecycle, queue, events | DaemonLifecycle, EventBus, NotificationService, BackgroundWorkers |
| `IncomingTxQueue` | `@waiaas/daemon` | Memory queue + batch flush to DB | IncomingTxMonitorService, BackgroundWorkers |
| `SubscriptionMultiplexer` | `@waiaas/daemon` | WebSocket connection sharing per chain:network | IChainSubscriber instances |
| `DustAttackRule` / `UnknownTokenRule` / `LargeAmountRule` | `@waiaas/daemon` | IIncomingSafetyRule implementations | IncomingTxMonitorService |
| Incoming TX REST routes | `@waiaas/daemon` | API endpoints for incoming TX query | sessionAuth middleware, resolveWalletId |
| SDK methods | `@waiaas/sdk` | `listIncomingTransactions`, `getIncomingTransactionSummary` | REST API |
| MCP tools | `@waiaas/mcp` | `list_incoming_transactions`, `get_incoming_summary` | ApiClient -> REST API |

---

## Integration Point 1: IChainSubscriber in @waiaas/core

**Location:** `packages/core/src/interfaces/IChainSubscriber.ts`

IChainSubscriber is intentionally separate from IChainAdapter (22 methods, unchanged). This is the correct design because:

1. **State model mismatch**: IChainAdapter is stateless request-response; IChainSubscriber is stateful long-running (WebSocket connections, subscription registries, reconnection state)
2. **AdapterPool compatibility**: AdapterPool caches `Map<key, IChainAdapter>`. Mixing WebSocket state would cause subscription loss on eviction
3. **SRP**: Outgoing TX build/sign/submit is a completely different concern from incoming TX detection/parsing

**New files in @waiaas/core:**
```
packages/core/src/interfaces/
  IChainSubscriber.ts          (NEW - interface definition)
  chain-subscriber.types.ts    (NEW - IncomingTransaction, IncomingTxStatus)
  IIncomingSafetyRule.ts        (NEW - safety rule interface)
```

**Export from core barrel:**
```typescript
// packages/core/src/index.ts -- add exports
export type { IChainSubscriber } from './interfaces/IChainSubscriber.js';
export type { IncomingTransaction, IncomingTxStatus } from './interfaces/chain-subscriber.types.js';
export type { IIncomingSafetyRule, SafetyRuleContext, SuspiciousReason } from './interfaces/IIncomingSafetyRule.js';
```

**Key design: IChainSubscriber has 6 methods** (subscribe, unsubscribe, subscribedWallets, connect, waitForDisconnect, destroy) vs IChainAdapter's 22 methods. The `onTransaction` callback is injected by IncomingTxMonitorService and synchronously pushes to IncomingTxQueue -- no DB writes in callback.

---

## Integration Point 2: Adapter Package Implementations

### @waiaas/adapter-solana

**New file:** `packages/adapters/solana/src/solana-incoming-subscriber.ts`

```
SolanaIncomingSubscriber implements IChainSubscriber
  - Uses @solana/kit createSolanaRpcSubscriptions for logsSubscribe
  - Per-wallet subscription via mentions:[walletAddress]
  - SOL native detection: preBalances/postBalances delta
  - SPL/Token-2022 detection: preTokenBalances/postTokenBalances delta
  - ATA 2-level: automatically handled by mentions subscription
  - Polling fallback: getSignaturesForAddress + getTransaction
```

**Export addition:**
```typescript
// packages/adapters/solana/src/index.ts
export { SolanaAdapter } from './adapter.js';
export { SolanaIncomingSubscriber } from './solana-incoming-subscriber.js'; // NEW
```

**Connection independence:** SolanaIncomingSubscriber creates its OWN RPC connections (both HTTP for polling and WebSocket for subscriptions). It does NOT share SolanaAdapter's HTTP RPC connection because:
- SolanaAdapter uses `createSolanaRpc(httpUrl)` -- HTTP only
- SolanaIncomingSubscriber needs `createSolanaRpcSubscriptions(wsUrl)` -- WebSocket
- Even for polling fallback, a separate HTTP client avoids contention

### @waiaas/adapter-evm

**New file:** `packages/adapters/evm/src/evm-incoming-subscriber.ts`

```
EvmIncomingSubscriber implements IChainSubscriber
  - Polling-first: viem createPublicClient + getLogs
  - ERC-20 Transfer event detection via indexed `to` parameter
  - Native ETH detection via getBlock(includeTransactions: true)
  - token_registry whitelist filter
  - connect()/waitForDisconnect() are no-ops (polling mode)
```

**Export addition:**
```typescript
// packages/adapters/evm/src/index.ts
export { EvmAdapter } from './adapter.js';
export { EvmIncomingSubscriber } from './evm-incoming-subscriber.js'; // NEW
export { EVM_CHAIN_MAP, type EvmChainEntry } from './evm-chain-map.js';
export { ERC20_ABI } from './abi/erc20.js';
```

**Connection independence:** EvmIncomingSubscriber creates its OWN viem PublicClient via `createPublicClient({ transport: http(rpcUrl) })`. It does NOT share EvmAdapter's client because the existing EvmAdapter stores `client` as a private field with no accessor, and sharing would introduce coupling.

---

## Integration Point 3: Daemon Lifecycle Integration

**Location:** `packages/daemon/src/lifecycle/daemon.ts`

### Startup: Step 4c-9 (NEW, fail-soft)

Inserted between Step 4c-4 (BalanceMonitorService) and Step 4c-5 (TelegramBotService) in the startup sequence. The ordering matters because IncomingTxMonitorService depends on:
- `sqlite` (Step 2)
- `_settingsService` (Step 2)
- `adapterPool` (Step 4 -- for resolveRpcUrl)
- `eventBus` (class field)
- `notificationService` (Step 4d)

```typescript
// Step 4c-9: IncomingTxMonitorService (fail-soft)
try {
  if (this.sqlite && this._settingsService && this.adapterPool && this._config) {
    const enabled = this._settingsService.get('incoming.enabled') === 'true';

    const { IncomingTxMonitorService } = await import(
      '../services/incoming/incoming-tx-monitor-service.js'
    );

    this.incomingTxMonitorService = new IncomingTxMonitorService({
      sqlite: this.sqlite,
      settingsService: this._settingsService,
      config: this._config,
      eventBus: this.eventBus,
      notificationService: this.notificationService ?? undefined,
      priceOracle: this.priceOracle,
    });

    if (enabled) {
      await this.incomingTxMonitorService.start();
      console.debug('Step 4c-9: IncomingTxMonitorService started');
    } else {
      console.debug('Step 4c-9: IncomingTxMonitorService disabled');
    }
  }
} catch (err) {
  console.warn('Step 4c-9 (fail-soft): IncomingTxMonitorService init warning:', err);
  this.incomingTxMonitorService = null;
}
```

**New DaemonLifecycle private field:**
```typescript
private incomingTxMonitorService: IncomingTxMonitorService | null = null;
```

### Shutdown: Before EventBus cleanup

```typescript
// Stop IncomingTxMonitorService (before EventBus cleanup)
if (this.incomingTxMonitorService) {
  await this.incomingTxMonitorService.stop(); // unsubscribe all, final flush
  this.incomingTxMonitorService = null;
}
```

### HotReloadOrchestrator: Wire incoming monitor ref

```typescript
// Step 5: createApp deps -- add incomingTxMonitorService to HotReloadOrchestrator
const hotReloader = new HotReloadOrchestrator({
  // ... existing deps ...
  incomingTxMonitorService: this.incomingTxMonitorService, // NEW
});
```

---

## Integration Point 4: DB Tables and Migrations

**Location:** `packages/daemon/src/infrastructure/database/migrate.ts`

### Migration v21

Current schema version is 20 (`LATEST_SCHEMA_VERSION = 20`). The new migration increments to v21.

```typescript
MIGRATIONS.push({
  version: 21,
  description: 'Add incoming transaction monitoring tables and wallet opt-in column',
  up: (sqlite) => {
    // 1. wallets table: add monitor_incoming column
    sqlite.exec('ALTER TABLE wallets ADD COLUMN monitor_incoming INTEGER NOT NULL DEFAULT 0');

    // 2. incoming_transactions table
    sqlite.exec(`CREATE TABLE incoming_transactions (...)`);

    // 3. incoming_tx_cursors table
    sqlite.exec(`CREATE TABLE incoming_tx_cursors (...)`);

    // 4. 4 indexes on incoming_transactions
  },
});
```

### pushSchema DDL Update

For fresh databases, update `getCreateTableStatements()` to include the new tables and column in the DDL:
- Add `monitor_incoming INTEGER NOT NULL DEFAULT 0` to wallets CREATE TABLE
- Add `incoming_transactions` CREATE TABLE
- Add `incoming_tx_cursors` CREATE TABLE
- Update `LATEST_SCHEMA_VERSION` from 20 to 21

### Drizzle Schema Extension

**Location:** `packages/daemon/src/infrastructure/database/schema.ts`

Add Drizzle table definitions for the new tables so that Drizzle ORM queries work:
```typescript
export const incomingTransactions = sqliteTable('incoming_transactions', { ... });
export const incomingTxCursors = sqliteTable('incoming_tx_cursors', { ... });
```

**No existing table modifications** -- `wallets.monitor_incoming` is added via migration ALTER TABLE but the existing `wallets` Drizzle schema definition also needs the column added.

---

## Integration Point 5: EventBus Event Flow

**Location:** `packages/core/src/events/event-types.ts`

### New Event Types

Current WaiaasEventMap has 5 events. Add 3 new ones (5 -> 8):

```typescript
export interface WaiaasEventMap {
  // ... existing 5 events ...
  'transaction:incoming': IncomingTxEvent;                    // NEW
  'transaction:incoming:suspicious': IncomingSuspiciousTxEvent; // NEW
  'incoming:flush:complete': { count: number };                // NEW (internal)
}
```

### Data Flow: Memory Queue to Notification

```
Chain Event (WS/Poll)
  |
  v
onTransaction callback (synchronous)
  |
  v
IncomingTxQueue.push(tx) -- in-memory, no DB access
  |
  v  [5-second interval]
BackgroundWorker 'incoming-tx-flush'
  |
  v
IncomingTxQueue.flush(sqlite) -- batch INSERT ON CONFLICT DO NOTHING
  |
  v
For each newly inserted TX:
  |
  +-- IIncomingSafetyRule.check() -- dust/unknownToken/largeAmount
  |     |
  |     +-- suspicious? -> eventBus.emit('transaction:incoming:suspicious', ...)
  |     |                   + notificationService.notify('INCOMING_TX_SUSPICIOUS', ...)
  |     +-- normal?     -> eventBus.emit('transaction:incoming', ...)
  |                         + notificationService.notify('INCOMING_TX_DETECTED', ...)
  |
  v
NotificationService.notify()
  |
  +-- WalletNotificationChannel (side channel, priority routing)
  +-- Telegram/Discord/ntfy/Slack (traditional channels)
```

### NotificationEventType SSoT Extension

**Location:** `packages/core/src/enums/notification.ts`

Add 2 new event types to the SSoT array (28 -> 30):
```typescript
export const NOTIFICATION_EVENT_TYPES = [
  // ... existing 28 ...
  'INCOMING_TX_DETECTED',     // NEW
  'INCOMING_TX_SUSPICIOUS',   // NEW
] as const;
```

### KillSwitch State Integration

When KillSwitch is SUSPENDED or LOCKED:
- IncomingTxMonitorService transitions to DISABLED state
- All subscriptions are paused (not destroyed)
- Notifications are suppressed
- On recovery (ACTIVE), monitoring resumes from cursor position

This is handled by listening to `'kill-switch:state-changed'` on EventBus within IncomingTxMonitorService.

---

## Integration Point 6: REST API Routes

**Location:** `packages/daemon/src/api/routes/`

### New Route File

Create `packages/daemon/src/api/routes/incoming.ts` with:
- `GET /v1/wallet/incoming` -- list incoming transactions (sessionAuth, resolveWalletId)
- `GET /v1/wallet/incoming/summary` -- aggregated summary (sessionAuth, resolveWalletId)

### Route Registration in server.ts

```typescript
// In createApp():
import { incomingRoutes } from './routes/incoming.js';

// After walletRoutes registration
if (deps.db && deps.sqlite) {
  app.route('/v1', incomingRoutes({
    db: deps.db,
    sqlite: deps.sqlite,
    priceOracle: deps.priceOracle,
    settingsService: deps.settingsService,
    forexRateService: deps.forexRateService,
  }));
}
```

### Auth Middleware

`/v1/wallet/incoming` and `/v1/wallet/incoming/summary` are covered by the existing sessionAuth wildcard at line 209 of server.ts:
```typescript
app.use('/v1/wallet/*', sessionAuth);
```

No additional auth middleware registration needed -- the existing wildcard already covers all `/v1/wallet/*` sub-paths.

### PATCH /v1/wallet/:id Extension (wallets.ts)

Existing `walletCrudRoutes` in `packages/daemon/src/api/routes/wallets.ts` needs:
1. `monitorIncoming` field in WalletUpdateSchema
2. On update with `monitorIncoming`, set `wallets.monitor_incoming` in DB
3. Trigger `incomingTxMonitorService.syncSubscriptions()` after update

This requires passing `incomingTxMonitorService` (or a callback) to CreateAppDeps and walletCrudRoutes deps.

### Barrel Export Update

```typescript
// packages/daemon/src/api/routes/index.ts
export { incomingRoutes, type IncomingRouteDeps } from './incoming.js'; // NEW
```

### Zod SSoT Schemas

Add to `packages/daemon/src/api/routes/openapi-schemas.ts`:
```typescript
export const IncomingTransactionQuerySchema = z.object({ ... });
export const IncomingTransactionSchema = z.object({ ... });
export const IncomingTransactionListResponseSchema = z.object({ ... });
export const IncomingTransactionSummarySchema = z.object({ ... });
```

---

## Integration Point 7: SDK and MCP Extensions

### TypeScript SDK (@waiaas/sdk)

**Location:** `packages/sdk/src/client.ts`

Add 2 methods to WAIaaSClient:
```typescript
async listIncomingTransactions(options?: ListIncomingTransactionsOptions): Promise<IncomingTransactionListResponse>
async getIncomingTransactionSummary(period?: 'daily' | 'weekly' | 'monthly'): Promise<IncomingTransactionSummary>
```

Add corresponding types to `packages/sdk/src/types.ts`.

### Python SDK

**Location:** `python-sdk/waiaas/client.py`

Add 2 methods:
```python
def list_incoming_transactions(self, ...) -> IncomingTransactionListResponse
def get_incoming_transaction_summary(self, period="daily") -> IncomingTransactionSummary
```

### MCP (@waiaas/mcp)

**New tool files:**
- `packages/mcp/src/tools/list-incoming-transactions.ts`
- `packages/mcp/src/tools/get-incoming-summary.ts`

**Server registration:** Add to `packages/mcp/src/server.ts`:
```typescript
import { registerListIncomingTransactions } from './tools/list-incoming-transactions.js';
import { registerGetIncomingSummary } from './tools/get-incoming-summary.js';

// Register 23 tools (was 21)
registerListIncomingTransactions(server, apiClient, walletContext);
registerGetIncomingSummary(server, apiClient, walletContext);
```

### Skills Files

**Update:** `packages/skills/wallet.skill.md` -- add incoming TX section with endpoints, MCP tools, SDK methods, and notification category.

---

## Integration Point 8: Admin Settings for [incoming] Config

### Setting Keys Registration

**Location:** `packages/daemon/src/infrastructure/settings/setting-keys.ts`

Add 'incoming' to SETTING_CATEGORIES:
```typescript
export const SETTING_CATEGORIES = [
  // ... existing 11 categories ...
  'incoming',  // NEW (12th)
] as const;
```

Add 7 setting definitions:
```typescript
// --- incoming category ---
{ key: 'incoming.enabled', category: 'incoming', configPath: 'incoming.incoming_enabled', defaultValue: 'false', isCredential: false },
{ key: 'incoming.mode', category: 'incoming', configPath: 'incoming.incoming_mode', defaultValue: 'auto', isCredential: false },
{ key: 'incoming.poll_interval', category: 'incoming', configPath: 'incoming.incoming_poll_interval', defaultValue: '30', isCredential: false },
{ key: 'incoming.retention_days', category: 'incoming', configPath: 'incoming.incoming_retention_days', defaultValue: '90', isCredential: false },
{ key: 'incoming.suspicious_dust_usd', category: 'incoming', configPath: 'incoming.incoming_suspicious_dust_usd', defaultValue: '0.01', isCredential: false },
{ key: 'incoming.suspicious_amount_multiplier', category: 'incoming', configPath: 'incoming.incoming_suspicious_amount_multiplier', defaultValue: '10', isCredential: false },
{ key: 'incoming.wss_url', category: 'incoming', configPath: 'incoming.incoming_wss_url', defaultValue: '', isCredential: false },
```

All 7 keys are hot-reload capable (no daemon restart required).

### DaemonConfig Schema Extension

**Location:** `packages/daemon/src/infrastructure/config/loader.ts`

Add `[incoming]` section to DaemonConfigSchema:
```typescript
incoming: z.object({
  incoming_enabled: z.boolean().default(false),
  incoming_mode: z.enum(['polling', 'websocket', 'auto']).default('auto'),
  incoming_poll_interval: z.number().int().min(5).default(30),
  incoming_retention_days: z.number().int().min(1).default(90),
  incoming_suspicious_dust_usd: z.number().min(0).default(0.01),
  incoming_suspicious_amount_multiplier: z.number().min(1).default(10),
  incoming_wss_url: z.string().default(''),
}).default({}),
```

### HotReloadOrchestrator Extension

**Location:** `packages/daemon/src/infrastructure/settings/hot-reload.ts`

```typescript
// Add key prefix
const INCOMING_KEYS_PREFIX = 'incoming.';

// Add to HotReloadDeps
export interface HotReloadDeps {
  // ... existing ...
  incomingTxMonitorService?: IncomingTxMonitorService | null; // NEW
}

// In handleChangedKeys()
const hasIncomingChanges = changedKeys.some(k => k.startsWith(INCOMING_KEYS_PREFIX));
if (hasIncomingChanges) {
  try { this.reloadIncomingMonitor(); }
  catch (err) { console.warn('Hot-reload incoming monitor failed:', err); }
}
```

### Admin UI Integration

The Admin Settings page in `packages/admin/` already renders setting categories dynamically. Adding the 'incoming' category with its 7 keys will automatically generate the settings form in the Admin UI -- no special Admin UI code needed beyond category rendering.

---

## Patterns to Follow

### Pattern 1: BackgroundWorkers Registration

Follow the existing pattern used by wal-checkpoint, session-cleanup, delay-expired, approval-expired, and version-check workers.

```typescript
// Register in DaemonLifecycle Step 6, AFTER IncomingTxMonitorService.start()
if (this.incomingTxMonitorService) {
  // Flush queue to DB
  this.workers.register('incoming-tx-flush', {
    interval: 5_000,
    handler: () => {
      if (this._isShuttingDown) return;
      this.incomingTxMonitorService!.flush();
    },
  });

  // Confirmation upgrade
  this.workers.register('incoming-tx-confirm', {
    interval: 30_000,
    handler: async () => {
      if (this._isShuttingDown) return;
      await this.incomingTxMonitorService!.confirmPending();
    },
  });

  // Retention cleanup
  this.workers.register('incoming-tx-retention', {
    interval: 3600_000,
    handler: () => {
      if (this._isShuttingDown) return;
      this.incomingTxMonitorService!.cleanupRetention();
    },
  });

  // Polling workers (conditional on connection state)
  // ... incoming-tx-poll-solana, incoming-tx-poll-evm
}
```

### Pattern 2: Fail-Soft Service Initialization

All monitoring services (AutoStop, BalanceMonitor, TelegramBot) follow the same try/catch fail-soft pattern. IncomingTxMonitorService follows this exactly.

### Pattern 3: EventBus Emit After DB Write

The existing pattern is: persist to DB first, then emit event. The incoming TX flow follows this by flushing the memory queue to DB in the BackgroundWorker, then emitting `'transaction:incoming'` for each successfully inserted row. This prevents ghost events (events without DB backing).

### Pattern 4: Memory Queue + Batch Flush

This is a new pattern introduced specifically for incoming TX to avoid SQLite SQLITE_BUSY errors from concurrent WebSocket callbacks. The onTransaction callback is synchronous push-only; DB writes are batched every 5 seconds. This pattern should be used for any future high-frequency data ingestion.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mixing Subscriber State into AdapterPool

**What:** Adding IChainSubscriber methods to IChainAdapter or storing subscribers in AdapterPool's Map
**Why bad:** AdapterPool's evict/reconnect logic would destroy WebSocket subscriptions. State models are incompatible (stateless vs stateful).
**Instead:** Keep IChainSubscriber instances in IncomingTxMonitorService, entirely separate from AdapterPool.

### Anti-Pattern 2: Direct DB Writes in WebSocket Callbacks

**What:** Calling `sqlite.prepare(...).run(...)` inside the `onTransaction` callback
**Why bad:** WebSocket events can arrive at high frequency. better-sqlite3 is single-threaded synchronous; concurrent write attempts from multiple async contexts cause SQLITE_BUSY errors.
**Instead:** Push to in-memory queue, batch flush every 5 seconds via BackgroundWorkers.

### Anti-Pattern 3: Sharing RPC Clients Between Adapters and Subscribers

**What:** Exposing SolanaAdapter's internal `rpc` client or EvmAdapter's internal `client` for subscriber use
**Why bad:** Tight coupling, potential state conflicts, violates encapsulation
**Instead:** Subscribers create their own RPC clients. The RPC URL is the shared resource, not the client instance.

### Anti-Pattern 4: Modifying Existing Transaction Tables

**What:** Adding incoming TX data to the existing `transactions` table
**Why bad:** The transactions table has a discriminatedUnion 5-type schema (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH) with an 8-state machine. Incoming TX have a completely different lifecycle (DETECTED/CONFIRMED).
**Instead:** Use the separate `incoming_transactions` table.

---

## New File Inventory

### @waiaas/core (3 new files)

| File | Type | Purpose |
|------|------|---------|
| `packages/core/src/interfaces/IChainSubscriber.ts` | NEW | Interface definition (6 methods) |
| `packages/core/src/interfaces/chain-subscriber.types.ts` | NEW | IncomingTransaction, IncomingTxStatus types |
| `packages/core/src/interfaces/IIncomingSafetyRule.ts` | NEW | Safety rule interface, SafetyRuleContext |

### @waiaas/adapter-solana (1 new file)

| File | Type | Purpose |
|------|------|---------|
| `packages/adapters/solana/src/solana-incoming-subscriber.ts` | NEW | SolanaIncomingSubscriber class |

### @waiaas/adapter-evm (1 new file)

| File | Type | Purpose |
|------|------|---------|
| `packages/adapters/evm/src/evm-incoming-subscriber.ts` | NEW | EvmIncomingSubscriber class |

### @waiaas/daemon (6+ new files)

| File | Type | Purpose |
|------|------|---------|
| `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` | NEW | Main orchestrator service |
| `packages/daemon/src/services/incoming/incoming-tx-queue.ts` | NEW | Memory queue + batch flush |
| `packages/daemon/src/services/incoming/subscription-multiplexer.ts` | NEW | WebSocket connection sharing |
| `packages/daemon/src/services/incoming/safety-rules.ts` | NEW | 3 IIncomingSafetyRule implementations |
| `packages/daemon/src/services/incoming/utils.ts` | NEW | getDecimals helper, cursor helpers |
| `packages/daemon/src/services/incoming/index.ts` | NEW | Barrel export |
| `packages/daemon/src/api/routes/incoming.ts` | NEW | REST API routes |

### @waiaas/sdk (0 new files, 2 modified)

| File | Type | Purpose |
|------|------|---------|
| `packages/sdk/src/client.ts` | MODIFIED | Add 2 methods |
| `packages/sdk/src/types.ts` | MODIFIED | Add incoming TX types |

### @waiaas/mcp (2 new files, 1 modified)

| File | Type | Purpose |
|------|------|---------|
| `packages/mcp/src/tools/list-incoming-transactions.ts` | NEW | MCP tool |
| `packages/mcp/src/tools/get-incoming-summary.ts` | NEW | MCP tool |
| `packages/mcp/src/server.ts` | MODIFIED | Register 2 new tools (21 -> 23) |

### Modified Existing Files Summary

| File | Change |
|------|--------|
| `packages/core/src/events/event-types.ts` | Add 3 event types to WaiaasEventMap (5 -> 8) |
| `packages/core/src/enums/notification.ts` | Add 2 NotificationEventType entries (28 -> 30) |
| `packages/core/src/index.ts` | Export new types |
| `packages/daemon/src/lifecycle/daemon.ts` | Step 4c-9, shutdown, new field |
| `packages/daemon/src/infrastructure/database/migrate.ts` | v21 migration, LATEST_SCHEMA_VERSION 20->21 |
| `packages/daemon/src/infrastructure/database/schema.ts` | Drizzle schema for 2 new tables + wallets column |
| `packages/daemon/src/infrastructure/config/loader.ts` | [incoming] config section |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | 7 setting definitions, 'incoming' category |
| `packages/daemon/src/infrastructure/settings/hot-reload.ts` | HotReloadDeps + reloadIncomingMonitor |
| `packages/daemon/src/api/server.ts` | Register incoming routes + deps |
| `packages/daemon/src/api/routes/index.ts` | Export incoming routes |
| `packages/daemon/src/api/routes/wallets.ts` | monitorIncoming field in PATCH |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | Incoming TX Zod schemas |
| `packages/daemon/src/notifications/templates/message-templates.ts` | 2 new message templates |
| `packages/adapters/solana/src/index.ts` | Export SolanaIncomingSubscriber |
| `packages/adapters/evm/src/index.ts` | Export EvmIncomingSubscriber |
| `packages/skills/wallet.skill.md` | Incoming TX section |

---

## Suggested Build Order

The build order respects package dependency flow: core -> adapters -> daemon -> sdk/mcp.

### Phase 1: Core Types + DB Foundation

1. **@waiaas/core interfaces and types**
   - IChainSubscriber.ts, chain-subscriber.types.ts, IIncomingSafetyRule.ts
   - WaiaasEventMap extension (3 new events)
   - NotificationEventType extension (28 -> 30)
   - Core barrel exports

2. **DB migration v21**
   - incoming_transactions table + 4 indexes
   - incoming_tx_cursors table
   - wallets.monitor_incoming column
   - Drizzle schema definitions
   - pushSchema DDL update, LATEST_SCHEMA_VERSION = 21

**Rationale:** Everything else depends on these types and tables existing.

### Phase 2: Chain Subscriber Implementations

3. **SolanaIncomingSubscriber**
   - logsSubscribe + getTransaction parsing
   - SOL native + SPL/Token-2022 detection
   - Polling fallback (getSignaturesForAddress)
   - Unit tests with mock RPC

4. **EvmIncomingSubscriber**
   - getLogs polling (ERC-20 Transfer events)
   - getBlock polling (native ETH)
   - token_registry filter
   - Unit tests with mock viem client

**Rationale:** Subscribers are independent of each other and can be built in parallel. They depend only on IChainSubscriber from Phase 1.

### Phase 3: Monitor Service + Workers

5. **IncomingTxMonitorService**
   - IncomingTxQueue (memory queue + batch flush)
   - SubscriptionMultiplexer (WS connection sharing)
   - IIncomingSafetyRule implementations (3 rules)
   - syncSubscriptions() logic
   - reconnectLoop + blind gap recovery

6. **DaemonLifecycle integration**
   - Step 4c-9 initialization
   - Shutdown hook
   - BackgroundWorkers registration (6 workers)
   - HotReloadOrchestrator extension

**Rationale:** The service orchestrates subscribers (Phase 2) and depends on DB (Phase 1).

### Phase 4: Config + Settings

7. **Config and Settings**
   - DaemonConfig [incoming] section
   - SETTING_DEFINITIONS (7 keys)
   - SETTING_CATEGORIES (add 'incoming')
   - HotReloadOrchestrator incoming reload
   - Notification message templates (2 new)

**Rationale:** Can be built in parallel with Phase 3 but logically groups config concerns.

### Phase 5: REST API + SDK/MCP

8. **REST API routes**
   - GET /v1/wallet/incoming (cursor pagination)
   - GET /v1/wallet/incoming/summary (aggregation)
   - PATCH /v1/wallet/:id monitorIncoming extension
   - Zod SSoT schemas

9. **SDK + MCP**
   - TypeScript SDK: 2 methods + types
   - Python SDK: 2 methods
   - MCP: 2 tools (21 -> 23)
   - Skills file update

**Rationale:** API depends on DB tables (Phase 1) and types (Phase 1). SDK/MCP depend on API being defined.

### Phase 6: Integration Testing

10. **E2E and integration tests**
    - T-01 through T-17 (core verification)
    - S-01 through S-04 (security verification)
    - WebSocket -> polling fallback E2E
    - Blind gap recovery E2E
    - Hot-reload setting changes E2E

**Rationale:** Integration tests require all components to be in place.

---

## Scalability Considerations

| Concern | 10 wallets | 100 wallets | 1000 wallets |
|---------|-----------|-------------|--------------|
| WebSocket connections | 1 per chain:network (multiplexed) | Same (multiplexed) | 1 per chain:network; Solana needs per-wallet logsSubscribe on shared WS |
| Polling load | Negligible | ~100 RPC calls per poll cycle | Rate limiting needed; batch getLogs across wallets |
| Memory queue | < 1 KB | < 10 KB | < 100 KB (flushed every 5s) |
| DB writes | ~1-5 rows per flush | ~10-50 rows per flush | ~100-500 rows per flush; batch INSERT handles well |
| DB size (90d) | < 10 MB | < 100 MB | ~1 GB; retention policy critical |

**Key insight:** The SubscriptionMultiplexer pattern ensures WebSocket connections scale with chain:network combinations (typically 2-4), not with wallet count. Solana's per-wallet logsSubscribe limitation means N subscriptions on 1 WS connection per network.

---

## Sources

- Design doc 76: `/Users/minho.yoo/dev/wallet/WAIaaS/internal/design/76-incoming-transaction-monitoring.md` (2,441 lines, 19 design decisions)
- IChainAdapter: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/core/src/interfaces/IChainAdapter.ts` (22 methods)
- EventBus: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/core/src/events/event-bus.ts`
- WaiaasEventMap: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/core/src/events/event-types.ts` (5 current events)
- NotificationEventType: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/core/src/enums/notification.ts` (28 current)
- DaemonLifecycle: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/daemon/src/lifecycle/daemon.ts` (1,309 lines)
- AdapterPool: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/daemon/src/infrastructure/adapter-pool.ts`
- BackgroundWorkers: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/daemon/src/lifecycle/workers.ts`
- NotificationService: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/daemon/src/notifications/notification-service.ts`
- SettingsService: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/daemon/src/infrastructure/settings/settings-service.ts`
- Setting Keys: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/daemon/src/infrastructure/settings/setting-keys.ts`
- HotReloadOrchestrator: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/daemon/src/infrastructure/settings/hot-reload.ts`
- Server (createApp): `/Users/minho.yoo/dev/wallet/WAIaaS/packages/daemon/src/api/server.ts`
- Route barrel: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/daemon/src/api/routes/index.ts`
- MCP server: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/mcp/src/server.ts` (21 tools, 4 resource groups)
- Migrate: `/Users/minho.yoo/dev/wallet/WAIaaS/packages/daemon/src/infrastructure/database/migrate.ts` (LATEST_SCHEMA_VERSION=20)
