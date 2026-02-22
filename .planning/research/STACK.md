# Technology Stack: Incoming Transaction Monitoring Implementation

**Project:** WAIaaS v27.1 -- Incoming TX Monitoring Implementation
**Researched:** 2026-02-21
**Mode:** Implementation Stack Research (subsequent milestone)
**Overall Confidence:** HIGH

---

## Executive Summary

No new npm packages required. The existing `@solana/kit ^6.0.1` and `viem ^2.21.0` already contain every API needed for incoming transaction monitoring. The implementation uses 5 key API surfaces: (1) `@solana/kit` `createSolanaRpcSubscriptions` with `logsNotifications` async iterators, (2) viem `watchEvent`/`watchBlocks` with WebSocket transport, (3) better-sqlite3 prepared statements wrapped in `db.transaction()` for batch INSERT, (4) application-level reconnection with exponential backoff (Solana) and viem built-in reconnect (EVM), and (5) a simple in-process memory array with timer-based batch flush. Node.js 22 native WebSocket (stable since v22.4.0) is used by `@solana/kit` internally; no `ws` package needed.

---

## 1. @solana/kit WebSocket Subscription APIs (v6.x)

### 1.1 API Surface: createSolanaRpcSubscriptions

`@solana/kit ^6.0.1` re-exports `createSolanaRpcSubscriptions` from `@solana/rpc-subscriptions`. This function creates a typed RPC subscription client over WebSocket.

**Confidence:** HIGH -- verified via QuickNode guide + npm @solana/rpc-subscriptions-api package docs + Solana official cookbook.

```typescript
import { createSolanaRpcSubscriptions, address } from '@solana/kit';

// Creates WebSocket connection to Solana RPC
const rpcSubscriptions = createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com');
```

**Subscription methods available (Notifications suffix pattern):**

| Method | RPC Equivalent | Use Case |
|--------|---------------|----------|
| `logsNotifications()` | `logsSubscribe` | TX logs matching filter -- **primary for incoming TX** |
| `accountNotifications()` | `accountSubscribe` | Account data/lamport changes |
| `programNotifications()` | `programSubscribe` | Program account changes |
| `slotNotifications()` | `slotSubscribe` | Slot progression |
| `signatureNotifications()` | `signatureSubscribe` | Specific TX confirmation |

### 1.2 logsNotifications API

```typescript
// Step 1: Create subscription (returns a PendingRpcSubscription)
const pendingSubscription = rpcSubscriptions.logsNotifications(
  { mentions: [address('WALLET_ADDRESS_BASE58')] as [Address] },
  { commitment: 'confirmed' },
);

// Step 2: Subscribe with AbortSignal (returns AsyncIterable)
const abortController = new AbortController();
const notifications = await pendingSubscription.subscribe({
  abortSignal: abortController.signal,
});

// Step 3: Consume via for-await-of (async iterator pattern)
for await (const notification of notifications) {
  const { signature, err, logs } = notification.value;
  const { slot } = notification.context;
  if (err !== null) continue; // skip failed TX
  // signature: string (base58) -- use for getTransaction lookup
}

// Step 4: Cleanup via AbortController
abortController.abort();
```

**Key characteristics:**
- `mentions` accepts a single-element array only (Solana RPC limitation -- one Pubkey per subscription)
- Returns `AsyncIterable` -- modern async iteration, not callback-based
- `AbortController` is the ONLY cancellation mechanism -- `.subscribe()` requires `abortSignal`
- Reconnection is NOT built-in; the `for await` loop terminates on disconnect, requiring application-level retry
- The async iterator blocks until next notification; no buffering or batching at transport level

### 1.3 Notification Payload Structure

Each notification from `logsNotifications` contains:

```typescript
{
  context: { slot: number },
  value: {
    signature: string,    // base58 TX signature -- key for getTransaction lookup
    err: object | null,   // null = successful TX, object = failed TX
    logs: string[],       // Program log messages (e.g., "Program 11111... invoke [1]")
  }
}
```

The notification does NOT contain amount, sender, or token info. These must be resolved via `getTransaction(signature, { encoding: 'jsonParsed' })` on the HTTP RPC endpoint.

### 1.4 Integration with SolanaIncomingSubscriber

Per design doc 76, each wallet gets its own `logsNotifications` subscription. The subscriber holds a `Map<walletId, { abortController, ... }>`. Unsubscribe = `abortController.abort()`.

**Critical implementation detail:** The `for await` loop runs in a separate async task per wallet. When WebSocket disconnects, the async iterator throws or completes -- the reconnect loop in `reconnectLoop()` catches this and re-subscribes all wallets.

```typescript
// Per-wallet subscription task (runs as detached async)
async function subscriptionTask(
  rpcSubscriptions: SolanaRpcSubscriptions,
  walletAddress: string,
  abortSignal: AbortSignal,
  onTransaction: (tx: IncomingTransaction) => void,
): Promise<void> {
  const notifications = await rpcSubscriptions
    .logsNotifications({ mentions: [address(walletAddress)] }, { commitment: 'confirmed' })
    .subscribe({ abortSignal });

  for await (const notification of notifications) {
    if (notification.value.err !== null) continue;
    // Parse signature via getTransaction(jsonParsed) then call onTransaction
  }
  // Loop exits when connection drops or abort signal fires
}
```

**Confidence:** HIGH for RPC params/response; MEDIUM for exact @solana/kit method names (QuickNode guide-based, needs code-level verification during implementation).

### 1.5 What NOT to Use

| API | Why Not |
|-----|---------|
| `accountSubscribe` / `accountNotifications` | Only detects lamport changes on the wallet account itself. SPL token transfers change the ATA account, not the wallet. Would need per-ATA subscriptions. |
| `programSubscribe` / `programNotifications` | Subscribes to ALL accounts owned by a program. Far too broad for per-wallet monitoring. |
| `signatureSubscribe` / `signatureNotifications` | Monitors a known TX signature. Discovery-mode, not detection-mode. |

---

## 2. viem watchEvent/watchBlocks -- API Surface and WebSocket Transport

### 2.1 WebSocket Transport Configuration

```typescript
import { createPublicClient, webSocket } from 'viem';

const wsClient = createPublicClient({
  transport: webSocket('wss://eth-mainnet.example.com', {
    // Reconnection (built-in since viem 2.14+, Issue #2325 fix)
    reconnect: {
      attempts: 10,    // max reconnect attempts (default: varies)
      delay: 1_000,    // base delay ms, exponential backoff applied
    },
    // Keep-alive ping to prevent idle timeout
    keepAlive: {
      interval: 30_000, // 30s ping interval
    },
    // Request timeout
    timeout: 10_000,   // 10s per async request (default)
    // Retry for individual RPC calls
    retryCount: 3,
    retryDelay: 1_000,
  }),
});
```

**Transport exposes:**
- `getRpcClient()` -- typed RPC client
- `subscribe()` -- raw eth_subscribe access (newHeads, logs, newPendingTransactions, syncing)

**Confidence:** HIGH -- verified from viem GitHub source `src/clients/transports/webSocket.ts`.

### 2.2 watchEvent API (ERC-20 Transfer Detection)

```typescript
import { parseAbiItem } from 'viem';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

// Returns unwatch function: () => void
const unwatch = wsClient.watchEvent({
  // ABI event definition
  event: TRANSFER_EVENT,
  // Filter by indexed parameter (topic[2] = to address)
  args: { to: walletAddress },
  // Callback on matching logs
  onLogs: (logs) => {
    for (const log of logs) {
      // log.address = ERC-20 contract address
      // log.args.from = sender address
      // log.args.to = wallet address (filtered)
      // log.args.value = bigint amount (smallest unit)
      // log.blockNumber = bigint
      // log.transactionHash = string
    }
  },
  // Error callback (critical for reconnect detection)
  onError: (error) => {
    // Socket closure triggers this callback
    // Must re-invoke watchEvent after reconnection
  },
  // Transport mode selection
  poll: false, // false = use eth_subscribe("logs"), true = polling
});
```

**Transport mode selection logic (from viem source):**
1. If `poll` is explicitly set, use that
2. If `fromBlock` is specified, force polling (historical range query)
3. If transport is `webSocket` or `ipc`, default to subscription (`poll: false`)
4. If transport is `http`, default to polling (`poll: true`)

**Confidence:** HIGH -- viem GitHub source `src/actions/public/watchEvent.ts` directly verified function signature and transport selection logic.

### 2.3 watchBlocks API (Native ETH Detection)

```typescript
const unwatch = wsClient.watchBlocks({
  // Include full transaction objects (not just hashes)
  includeTransactions: true,
  // Callback per new block
  onBlock: (block) => {
    // block.number: bigint
    // block.transactions: Transaction[] (full objects when includeTransactions=true)
    for (const tx of block.transactions) {
      if (typeof tx === 'object' && tx.to && tx.value > 0n) {
        if (tx.to.toLowerCase() === walletAddress.toLowerCase()) {
          // Native ETH incoming transfer detected
          // tx.hash, tx.from, tx.value, tx.blockNumber
        }
      }
    }
  },
  onError: (error) => { /* reconnect handling */ },
  poll: false, // eth_subscribe("newHeads") via WebSocket
});
```

**WebSocket mode (poll: false):** Uses `eth_subscribe` with `"newHeads"`. Block data fetched via `eth_getBlockByNumber` after header notification.
**Polling mode (poll: true):** Additional options available: `emitMissed` (emit skipped blocks), `emitOnBegin` (emit current block on start), `pollingInterval` (ms).

**Confidence:** HIGH -- viem GitHub source `src/actions/public/watchBlocks.ts`.

### 2.4 Design Decision: EVM Polling-First (per doc 76 section 4.1)

Design doc 76 chose **polling (getLogs) as the primary EVM strategy**, not WebSocket:

| Reason | Detail |
|--------|--------|
| HTTP reliability | getLogs works over HTTP -- no WS connection management |
| viem transport ambiguity | watchEvent auto-selects behavior by transport type, reducing predictability |
| Self-hosted WS availability | WS RPC not always available in self-hosted environments |
| Natural alignment | EVM ~12s block time matches polling interval naturally |

WebSocket mode (`watchEvent(poll: false)` + `watchBlocks`) is available as opt-in via `config.toml incoming_mode = 'websocket'`.

### 2.5 viem WebSocket Reconnection -- Known Issues and Status

| Issue | Version | Status | Impact |
|-------|---------|--------|--------|
| [#2325](https://github.com/wevm/viem/issues/2325) - Socket CLOSED state recovery | 2.13.1 | FIXED (2024-07-26, commit 44281e8) | Socket couldn't recover from CLOSED state |
| [#2563](https://github.com/wevm/viem/issues/2563) - Reconnect stops working after ~1 hour | 2.18.5 | FIXED (2025-02-21, PR #3313) | Subscriptions lost after connection drop |
| [#877](https://github.com/wevm/viem/issues/877) - Auto reconnect not supported | Early 2.x | FIXED | Initial lack of reconnect support |

**Critical implementation note:** After WebSocket reconnection, `watchEvent`/`watchBlocks` subscriptions are NOT automatically re-established. The `onError` callback fires when the socket closes. Implementation must:
1. Detect error in `onError` callback
2. Wait for transport reconnection
3. Re-invoke `watchEvent`/`watchBlocks` to create new subscriptions

**Do NOT use `fallback()` transport with WebSocket** -- it breaks auto-reconnect (confirmed in Issue #2325 comments).

**Confidence:** HIGH -- GitHub issues #2325, #2563 directly verified.

---

## 3. SQLite Batch INSERT Patterns with WAL Mode

### 3.1 Current WAL Configuration (Already Optimal)

The existing `createDatabase()` in `packages/daemon/src/infrastructure/database/connection.ts` already applies all 7 required PRAGMAs:

```typescript
sqlite.pragma('journal_mode = WAL');      // Write-Ahead Logging
sqlite.pragma('synchronous = NORMAL');    // Safe with WAL (fsync on checkpoint only)
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');     // 5s busy wait (critical for concurrent access)
sqlite.pragma('cache_size = -64000');     // 64MB cache
sqlite.pragma('mmap_size = 268435456');   // 256MB mmap
sqlite.pragma('temp_store = MEMORY');
```

**No PRAGMA changes needed.** The existing configuration is already optimized for the incoming TX monitoring workload.

### 3.2 Batch INSERT Pattern: Prepared Statement + Transaction Wrapper

The design doc 76 specifies the `IncomingTxQueue.flush()` pattern. Here is the precise better-sqlite3 implementation:

```typescript
// Prepare statement ONCE (reuse across flushes -- hoist to class constructor)
const insertStmt = sqlite.prepare(`
  INSERT INTO incoming_transactions
    (id, tx_hash, wallet_id, from_address, amount, token_address,
     chain, network, status, block_number, detected_at, is_suspicious)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(tx_hash, wallet_id) DO NOTHING
`);

// Transaction wrapper for batch insert (better-sqlite3 native)
const insertMany = sqlite.transaction((txs: IncomingTransaction[]) => {
  const inserted: IncomingTransaction[] = [];
  for (const tx of txs) {
    const result = insertStmt.run(
      tx.id, tx.txHash, tx.walletId, tx.fromAddress, tx.amount,
      tx.tokenAddress, tx.chain, tx.network, tx.status,
      tx.blockNumber, tx.detectedAt, tx.isSuspicious ? 1 : 0,
    );
    if (result.changes > 0) inserted.push(tx); // ON CONFLICT skips return changes=0
  }
  return inserted;
});

// Usage: insertMany(batch) -- atomic, single WAL write
```

**Performance characteristics:**
- 1 prepared statement, reused for N rows = avoids repeated `sqlite3_prepare_v2` overhead
- `db.transaction()` wrapper = single WAL journal entry for the entire batch
- 100 rows in transaction: ~10ms (vs ~500ms individual inserts = 50x faster)
- `ON CONFLICT DO NOTHING` = idempotent; WebSocket + polling dual detection is safe
- `result.changes` check = filters out conflict-skipped rows for accurate event emission

**Confidence:** HIGH -- better-sqlite3 official performance docs; existing codebase uses identical `db.transaction()` pattern.

### 3.3 Drizzle ORM vs Raw better-sqlite3 for Batch INSERT

**Recommendation: Use raw better-sqlite3 for the batch flush path.** Use Drizzle for query/read paths (REST API listing, admin queries).

| Approach | Performance | Why |
|----------|-------------|-----|
| Raw `sqlite.prepare().run()` in `sqlite.transaction()` | Fastest | Direct C binding, zero overhead, prepared statement reuse |
| Drizzle `db.insert().values().onConflictDoNothing()` | Slightly slower | ORM overhead per row; `.returning()` with `onConflictDoNothing()` has a known issue (#2474) where conflicted rows return nothing |

The existing codebase already mixes raw better-sqlite3 (migrations, PRAGMAs, WAL checkpoints) with Drizzle (query builder). The batch flush is a hot path where raw is justified.

**Confidence:** HIGH -- existing codebase pattern; Drizzle GitHub issue #2474 confirms returning+onConflictDoNothing limitation.

### 3.4 WAL Checkpoint Considerations

The existing `BackgroundWorkers` already runs `wal_checkpoint(PASSIVE)` every 5 minutes and `wal_checkpoint(TRUNCATE)` on shutdown. This is sufficient for the incoming TX monitoring workload.

**No changes needed.** The WAL file growth from incoming TX writes (max ~100 rows per 5-second flush = ~20 rows/second at peak) is trivially handled by the existing 5-minute PASSIVE checkpoint.

---

## 4. WebSocket Reconnection Patterns in Node.js 22

### 4.1 Node.js 22 Native WebSocket -- Capabilities and Limitations

Node.js 22 provides a built-in WebSocket **client** (stable since v22.4.0, based on Undici):

| Feature | Node.js 22 Native WebSocket | ws library |
|---------|---------------------------|------------|
| Client connection | YES (stable, W3C API) | YES |
| Server | NO | YES |
| `ws.ping()` frame sending | **NO** (W3C API has no ping method) | YES |
| `ws.pong()` frame sending | **NO** | YES |
| Automatic pong reply to server pings | YES (handled by Undici internally) | YES |
| `close` / `error` / `message` events | YES | YES |
| Binary data (ArrayBuffer) | YES | YES |

**Key limitation:** Native WebSocket cannot send ping frames. This matters for Solana RPC providers that enforce idle timeouts (e.g., Helius/QuickNode: 10-minute inactivity timeout). See section 4.3 for the workaround.

**Confidence:** HIGH -- official Node.js docs ([nodejs.org/en/learn/getting-started/websocket](https://nodejs.org/en/learn/getting-started/websocket)).

### 4.2 How Libraries Use WebSocket

| Library | WebSocket Implementation | Notes |
|---------|------------------------|-------|
| `@solana/kit` (rpc-subscriptions) | `@solana/rpc-subscriptions-channel-websocket` | Uses platform WebSocket (native in Node.js 22). No auto-reconnect. |
| `viem` | Built-in transport (`isomorphic-ws` or native) | Has reconnect + keepAlive options. Manages its own connection. |

**Neither library requires `ws` as a direct dependency of WAIaaS.** Both manage their own WebSocket connections internally.

### 4.3 Solana: Application-Level Reconnection Required

`@solana/kit`'s `createSolanaRpcSubscriptions` does NOT provide built-in auto-reconnect. The WebSocket channel manages the raw connection but does not auto-reconnect on failure.

**Pattern: reconnectLoop() from design doc 76 section 5.2**

```typescript
// Exponential backoff with jitter
function calculateDelay(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 60000); // 1s -> 60s cap
  const jitter = base * 0.3 * (2 * Math.random() - 1);       // +/- 30%
  return Math.max(100, Math.floor(base + jitter));
}

// reconnectLoop: connect -> wait for disconnect -> reconnect
async function reconnectLoop(
  subscriber: IChainSubscriber,
  onStateChange: (state: 'WEBSOCKET' | 'POLLING') => void,
): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      await subscriber.connect();  // Create WS + subscribe all wallets
      attempt = 0;
      onStateChange('WEBSOCKET');
      await subscriber.waitForDisconnect(); // Blocks until WS closes
    } catch {
      attempt++;
      if (attempt >= 3) onStateChange('POLLING'); // Fallback after 3 failures
      await sleep(calculateDelay(attempt));
    }
  }
}
```

**Solana heartbeat -- ping limitation workaround:** Since native WebSocket lacks `ws.ping()`, use a lightweight RPC call as application-level heartbeat:

```typescript
// Application-level heartbeat via lightweight RPC call
const heartbeatTimer = setInterval(async () => {
  try {
    await rpc.getSlot().send(); // ~1ms response, keeps connection alive
  } catch {
    // Connection likely dead -- reconnect loop will handle it
  }
}, 60_000); // 60s interval (well within 10-min idle timeout)
heartbeatTimer.unref(); // Don't prevent process exit
```

**Confidence:** MEDIUM -- @solana/kit reconnection behavior is not officially documented. The heartbeat-via-RPC approach is pragmatic and avoids ping frame dependency.

### 4.4 EVM: viem Built-In Reconnection

viem's `webSocket()` transport handles reconnection internally:

```typescript
const transport = webSocket(wssUrl, {
  reconnect: { attempts: 10, delay: 1_000 }, // Built-in exponential backoff
  keepAlive: { interval: 30_000 },            // Built-in ping/pong
});
```

**But subscriptions must be re-established after reconnect.** viem reconnects the transport layer, but `watchEvent`/`watchBlocks` subscriptions are lost. The `onError` callback signals this:

```typescript
let currentUnwatch: (() => void) | null = null;

function setupWatchEvent(client: PublicClient, walletAddress: string) {
  currentUnwatch = client.watchEvent({
    event: TRANSFER_EVENT,
    args: { to: walletAddress },
    onLogs: (logs) => { /* process */ },
    onError: (error) => {
      // Clean up old reference
      currentUnwatch?.();
      currentUnwatch = null;
      // Wait for transport reconnect, then re-subscribe
      setTimeout(() => setupWatchEvent(client, walletAddress), 2000);
    },
    poll: false,
  });
}
```

**Confidence:** HIGH -- viem issues #2325 (fixed), #2563 (fixed via PR #3313) confirm this behavior.

### 4.5 No External Reconnection Libraries Needed

| Library | Why NOT |
|---------|---------|
| `reconnecting-websocket` | viem handles its own WS; @solana/kit needs application-level control, not transport-level |
| `ws` npm package | Not needed; @solana/kit has its own WS channel; viem has built-in transport |
| `socket.io-client` | Overkill; adds protocol overhead; not compatible with JSON-RPC endpoints |

---

## 5. Memory Queue + Batch Flush Pattern

### 5.1 In-Process Array Queue (No External Library)

The memory queue is a simple bounded array. No npm package needed.

```typescript
class IncomingTxQueue {
  private queue: IncomingTransaction[] = [];
  private readonly MAX_QUEUE_SIZE = 10_000; // Bounded: ~4MB at ~400 bytes/entry
  private readonly MAX_BATCH = 100;         // Max rows per flush

  push(tx: IncomingTransaction): void {
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      // Drop oldest -- backpressure signal
      this.queue.shift();
      console.warn('IncomingTxQueue overflow -- dropping oldest entry');
    }
    this.queue.push(tx);
  }

  flush(sqlite: Database): IncomingTransaction[] {
    if (this.queue.length === 0) return [];
    const batch = this.queue.splice(0, this.MAX_BATCH);
    return insertMany(batch); // db.transaction() wrapper from section 3.2
  }

  get length(): number { return this.queue.length; }
}
```

### 5.2 BackgroundWorkers Timer-Based Flush

The existing `BackgroundWorkers` class is the ideal scheduler. It already prevents overlapping runs (`running` Map check), handles errors gracefully (try/catch per handler), and uses `unref()` timers.

```typescript
workers.register('incoming-tx-flush', {
  interval: 5_000, // 5 seconds
  handler: () => {
    const inserted = incomingTxQueue.flush(sqlite);
    for (const tx of inserted) {
      eventBus.emit('transaction:incoming', toIncomingTxEvent(tx));
    }
    if (inserted.length > 0) {
      eventBus.emit('incoming:flush:complete', { count: inserted.length });
    }
  },
});
```

**Why 5-second interval:**
- Solana slot time ~400ms, EVM block time ~12s
- 5s batch collects ~12 Solana slots worth of events
- Keeps DB write frequency at ~12/minute (well within SQLite WAL comfort zone)
- Notification latency is acceptable: design doc says notifications fire at DETECTED, which happens within 5s of on-chain event

### 5.3 Deduplication in Queue (Recommended Optimization)

Design doc 76 section 2.4 mentions optional in-memory dedup before flush:

```typescript
class IncomingTxQueue {
  private seen = new Set<string>(); // txHash+walletId composite key

  push(tx: IncomingTransaction): void {
    const key = `${tx.txHash}:${tx.walletId}`;
    if (this.seen.has(key)) return; // Skip duplicate
    this.seen.add(key);
    this.queue.push(tx);
  }

  flush(sqlite: Database): IncomingTransaction[] {
    if (this.queue.length === 0) return [];
    const batch = this.queue.splice(0, this.MAX_BATCH);
    // Clear seen entries for flushed items
    for (const tx of batch) {
      this.seen.delete(`${tx.txHash}:${tx.walletId}`);
    }
    return insertMany(batch);
  }
}
```

**Recommendation:** Implement the `Set`-based dedup. It prevents unnecessary DB round-trips when WebSocket + polling detect the same TX simultaneously. The DB-level `ON CONFLICT DO NOTHING` is the safety net; the Set is the optimization.

### 5.4 Why No External Queue Library

| Library | Why NOT |
|---------|---------|
| `buffered-queue` | Adds dependency for trivial functionality (Array + setInterval) |
| `better-queue` | Designed for persistent, disk-backed queues; overkill for in-memory buffer |
| `bull` / `bullmq` | Requires Redis; WAIaaS is self-hosted with zero external dependencies |
| Node.js Streams (cork/uncork) | Wrong abstraction; we need batch-then-flush, not stream backpressure |

**Confidence:** HIGH -- the pattern is straightforward Array + timer; existing BackgroundWorkers already provides exactly the scheduler needed.

---

## Recommended Stack (Implementation Summary)

### New Dependencies: NONE

| Capability | Library | Version | Already Installed | Package |
|------------|---------|---------|-------------------|---------|
| Solana WS subscriptions | `@solana/kit` | ^6.0.1 | YES | daemon, adapter-solana |
| Solana TX parsing (jsonParsed) | `@solana/kit` | ^6.0.1 | YES | daemon, adapter-solana |
| EVM WS subscriptions (opt-in) | `viem` | ^2.21.0 | YES | daemon, adapter-evm |
| EVM event log parsing | `viem` | ^2.21.0 | YES | daemon, adapter-evm |
| EVM block scan (native ETH) | `viem` | ^2.21.0 | YES | daemon, adapter-evm |
| Batch INSERT to SQLite | `better-sqlite3` | ^12.6.0 | YES | daemon |
| DB schema + read queries | `drizzle-orm` | ^0.45.0 | YES | daemon |
| UUID v7 generation | `uuidv7` | ^1.0.2 | YES | daemon |
| Background scheduling | `BackgroundWorkers` | internal | YES | daemon |
| Event emission | `EventEmitter` (EventBus) | Node.js built-in | YES | core |

### What NOT to Add

| Technology | Why NOT |
|------------|---------|
| `ws` npm package | @solana/kit and viem handle their own WebSocket connections internally |
| `reconnecting-websocket` | Application-level reconnect logic per design doc 76 provides more control than transport-level auto-reconnect |
| `buffered-queue` / `better-queue` | Trivial pattern (Array + timer); no dependency needed |
| `bull` / `bullmq` / Redis | WAIaaS is self-hosted with zero external service dependencies |
| Helius/Alchemy webhook SDKs | Violates self-hosted principle; creates external service dependency |
| `socket.io-client` | Not compatible with JSON-RPC WebSocket endpoints |
| `@solana/rpc-subscriptions` (direct) | Already re-exported through `@solana/kit`; no direct dependency needed |

---

## Integration Points with Existing Codebase

### New Files to Create (per design doc 76)

| File | Package | Purpose |
|------|---------|---------|
| `IChainSubscriber.ts` | core/interfaces | Stateful subscription interface (separate from IChainAdapter) |
| `chain-subscriber.types.ts` | core/interfaces | IncomingTransaction type, IncomingTxStatus, IncomingTxEvent |
| `SolanaIncomingSubscriber.ts` | adapters/solana | logsNotifications + getTransaction(jsonParsed) parsing |
| `EvmIncomingSubscriber.ts` | adapters/evm | getLogs polling + getBlock(includeTransactions) for native ETH |
| `IncomingTxMonitorService.ts` | daemon/services | Orchestrator: manages subscribers, queue, cursor updates |
| `IncomingTxQueue.ts` | daemon/services | Memory queue + batch flush (section 5.1) |
| `SubscriptionMultiplexer.ts` | daemon/services | WS connection sharing per chain+network (doc 76 section 5.4) |
| `migration-v21.ts` | daemon/database | incoming_transactions + incoming_tx_cursors + wallets.monitor_incoming |

### Existing Files to Modify

| File | Change |
|------|--------|
| `packages/core/src/interfaces/index.ts` | Export IChainSubscriber, IncomingTransaction types |
| `packages/core/src/index.ts` | Re-export new types |
| `packages/daemon/src/lifecycle/daemon.ts` | Register IncomingTxMonitorService + new workers |
| `packages/daemon/src/infrastructure/database/schema.ts` | Add Drizzle schema for new tables |
| `packages/daemon/src/infrastructure/database/migrate.ts` | Add v21 migration, bump LATEST_SCHEMA_VERSION |
| `packages/core/src/types/notification.ts` | Add INCOMING_TX_DETECTED, INCOMING_TX_CONFIRMED event types |

### Config Changes

```toml
# config.toml -- new [incoming] section
[incoming]
enabled = false              # opt-in per design
wss_url = ""                 # WebSocket RPC URL (auto-derived from rpc_url if empty)
poll_interval_ms = 30000     # Polling fallback interval (ms)
flush_interval_ms = 5000     # Memory queue flush interval (ms)
retention_days = 90          # Incoming TX record retention
```

---

## Sources

| Source | Confidence | What It Verified |
|--------|-----------|-----------------|
| [Solana logsSubscribe RPC docs](https://solana.com/docs/rpc/websocket/logssubscribe) | HIGH | Parameters, response format, mentions filter |
| [Solana accountSubscribe RPC docs](https://solana.com/docs/rpc/websocket/accountsubscribe) | HIGH | Why NOT to use for SPL detection |
| [QuickNode @solana/kit subscriptions guide](https://www.quicknode.com/guides/solana-development/tooling/web3-2/subscriptions) | MEDIUM | createSolanaRpcSubscriptions API, async iterator pattern |
| [@solana/rpc-subscriptions-api npm](https://www.npmjs.com/package/@solana/rpc-subscriptions-api) | MEDIUM | Package exports, Notifications suffix convention |
| [viem watchEvent source](https://github.com/wevm/viem/blob/main/src/actions/public/watchEvent.ts) | HIGH | Function signature, transport mode selection logic |
| [viem watchBlocks source](https://github.com/wevm/viem/blob/main/src/actions/public/watchBlocks.ts) | HIGH | includeTransactions option, WS vs polling behavior |
| [viem WebSocket transport source](https://github.com/wevm/viem/blob/main/src/clients/transports/webSocket.ts) | HIGH | reconnect/keepAlive/timeout config options, defaults |
| [viem Issue #2325](https://github.com/wevm/viem/issues/2325) | HIGH | Socket CLOSED recovery fix (2024-07-26) |
| [viem Issue #2563](https://github.com/wevm/viem/issues/2563) | HIGH | Reconnect after 1h fix (PR #3313, 2025-02-21) |
| [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) | HIGH | WAL mode, transaction batching, checkpoint starvation |
| [SQLite Optimizations (PowerSync)](https://www.powersync.com/blog/sqlite-optimizations-for-ultra-high-performance) | MEDIUM | synchronous=NORMAL safety with WAL |
| [Drizzle ORM insert docs](https://orm.drizzle.team/docs/insert) | HIGH | onConflictDoNothing API |
| [Drizzle Issue #2474](https://github.com/drizzle-team/drizzle-orm/issues/2474) | MEDIUM | returning + onConflictDoNothing limitation |
| [Node.js WebSocket docs](https://nodejs.org/en/learn/getting-started/websocket) | HIGH | Native WS client stable in v22.4.0, W3C API, no ping method |
| Existing codebase: `connection.ts` | HIGH | Current 7 PRAGMA configuration |
| Existing codebase: `workers.ts` | HIGH | BackgroundWorkers API, overlap prevention, unref timers |
| Existing codebase: `daemon.ts` | HIGH | WAL checkpoint schedule (5min PASSIVE, shutdown TRUNCATE) |
| Design doc 76 | HIGH | Architecture decisions, DB schema, API patterns |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|-----------|--------|
| Solana logsSubscribe RPC parameters/response | HIGH | Official Solana RPC docs directly verified |
| @solana/kit logsNotifications async iterator API | MEDIUM | QuickNode guide + npm docs; exact TypeScript generics need code-level verification |
| @solana/kit reconnection behavior | MEDIUM | No official docs on reconnect; community pattern confirmed |
| @solana/kit heartbeat via RPC call | MEDIUM | Pragmatic workaround; not officially documented as pattern |
| viem watchEvent/watchBlocks API surface | HIGH | GitHub source code directly verified |
| viem WebSocket transport reconnect config | HIGH | Source code + issue tracking verified |
| viem subscription re-establishment after reconnect | HIGH | Issues #2325, #2563 confirm behavior |
| SQLite batch INSERT with WAL (better-sqlite3) | HIGH | Official docs + existing codebase patterns |
| Drizzle onConflictDoNothing for reads | HIGH | Official docs |
| Raw better-sqlite3 for batch writes | HIGH | Existing codebase precedent |
| Memory queue + BackgroundWorkers flush | HIGH | Trivial implementation; BackgroundWorkers already proven |
| Node.js 22 native WebSocket capabilities | HIGH | Official Node.js docs; stable since v22.4.0 |
| No new npm packages needed | HIGH | All capabilities verified in existing dependencies |

---

*Stack research for: WAIaaS v27.1 Incoming Transaction Monitoring Implementation*
*Researched: 2026-02-21*
*Supersedes: incoming-tx-monitor-STACK.md (design-phase research, retained as reference)*
