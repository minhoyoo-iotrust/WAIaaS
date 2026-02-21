# Domain Pitfalls: Incoming Transaction Monitoring Implementation

**Domain:** Adding real-time incoming transaction monitoring to an existing wallet daemon (WAIaaS v27.1, doc 76)
**Researched:** 2026-02-21
**Confidence:** MEDIUM-HIGH (based on Solana/EVM official docs, GitHub issue trackers, codebase analysis. Some RPC rate limit numbers are provider-specific and marked accordingly.)

---

## Critical Pitfalls

Mistakes that cause data loss, missed transactions, or require architectural rework.

---

### Pitfall C-01: WebSocket Event Listener Leak on Reconnection

**What goes wrong:** Each reconnection cycle registers new `message`, `close`, `error` listeners on a fresh WebSocket instance, but old listeners on the previous (now-closed) WebSocket are never removed. Over days of operation, the EventEmitter accumulates zombie listeners. Node.js emits `MaxListenersExceededWarning` first, then memory grows linearly with reconnection count.

**Why it happens:** The `reconnectLoop` creates a new WebSocket via `subscriber.connect()`, but the previous WebSocket's event handlers reference closures that hold `Map` entries, parsed transaction buffers, and the `onTransaction` callback. If the old WebSocket reference is not explicitly cleaned before creating the new one, the GC cannot collect it because the registered handlers form a reference chain: old WebSocket -> handler closure -> subscription Map -> IncomingTxMonitorService.

**Consequences:**
- Memory growth: ~2-5 MB per reconnection cycle (WebSocket buffer + closure references)
- After 100+ reconnections: RSS exceeds container limits, OOM kill
- `MaxListenersExceededWarning` floods logs, obscuring real errors
- Degraded EventBus performance as orphaned listeners fire on stale data

**Warning signs:**
- `MaxListenersExceededWarning` in process stderr
- RSS memory monotonically increasing across reconnections (never returns to baseline)
- `process.memoryUsage().heapUsed` delta > 1MB per reconnection

**Prevention:**
1. In `SolanaIncomingSubscriber.connect()`, explicitly call `this.ws?.removeAllListeners()` and `this.ws?.terminate()` (not `.close()` -- terminate is synchronous) before creating a new WebSocket
2. Use AbortController per connection cycle: `new AbortController()` on connect, `controller.abort()` on disconnect. Pass `signal` to all `for await` loops (Solana Kit's `logsNotifications` supports this)
3. Add a `connectionGeneration` counter. Increment on each connect. All callbacks check `if (this.currentGeneration !== myGeneration) return;` to short-circuit stale handler execution
4. Set `emitter.setMaxListeners(0)` only for the SubscriptionMultiplexer internal emitter (not globally), and add a periodic health check that logs listener count per event

**Detection:** Unit test: call `connect()` 10 times in sequence, assert `ws.listenerCount('message') === expectedCount` (not `10 * expectedCount`)

**Phase:** Must be addressed in the WebSocket connection management phase (SolanaIncomingSubscriber + SubscriptionMultiplexer implementation)

**Confidence:** HIGH -- well-documented Node.js pattern ([ws library issue #804](https://github.com/websockets/ws/issues/804), [ws library issue #1617](https://github.com/websockets/ws/issues/1617))

---

### Pitfall C-02: Flush Worker vs Pipeline Writer SQLITE_BUSY Contention

**What goes wrong:** The `incoming-tx-flush` BackgroundWorker uses `sqlite.transaction()` to batch-INSERT incoming transactions. Simultaneously, the existing 6-stage pipeline's Stage 5 (database write) also uses `BEGIN IMMEDIATE` for outgoing transaction state changes. When both run concurrently, one gets `SQLITE_BUSY` even with `busy_timeout = 5000ms` because better-sqlite3 is synchronous -- it blocks the Node.js event loop during the busy wait.

**Why it happens:** WAIaaS uses a single better-sqlite3 connection (single process, single thread). `better-sqlite3` is synchronous, so `BEGIN IMMEDIATE` actually blocks the calling thread. The existing system never had two high-frequency writers: outgoing TX writes are infrequent (user-initiated). Adding incoming TX flush (every 5 seconds, up to 100 rows per batch) introduces the first high-throughput write pattern.

The real danger is not `SQLITE_BUSY` itself (better-sqlite3 handles that with the configured `busy_timeout`), but rather **event loop starvation**: a 100-row INSERT inside a transaction holds the database lock for 5-50ms. During that time, any HTTP request handler that needs a database read (e.g., GET /v1/wallet/incoming) blocks synchronously, adding latency to API responses.

**Consequences:**
- API response latency spikes during flush cycles (P99 increases from 5ms to 50ms+)
- If flush batches are large (100+ rows), HTTP handlers see consistent 30-50ms pauses
- WAL file growth if checkpoint runs during a long flush transaction
- In extreme cases (500+ queued TXs after reconnection gap recovery), flush transaction can take 200ms+, causing visible API stutter

**Warning signs:**
- API P99 latency correlates with `incoming-tx-flush` worker schedule
- WAL file size spikes periodically
- `incoming-tx-flush` worker duration exceeds 50ms (log worker execution time)

**Prevention:**
1. Keep batch size small: `MAX_BATCH = 50` (not 100). Multiple flushes per cycle is fine (the worker will flush again next interval)
2. Use prepared statement + `sqlite.transaction()` pattern (already in doc 76 design) -- this is the fastest path in better-sqlite3
3. Add worker execution time logging: `const start = performance.now(); flush(); const dur = performance.now() - start; if (dur > 50) logger.warn(...)`
4. Consider splitting gap recovery writes into micro-batches of 20 with `setImmediate()` between batches to yield the event loop
5. **Do NOT** create a second database connection. better-sqlite3 in the same process with WAL mode and single connection is the correct architecture for WAIaaS. Multiple connections add WAL checkpoint starvation risk.

**Detection:** Integration test: run flush worker and API GET concurrently, measure API response time, assert < 100ms

**Phase:** Must be addressed in IncomingTxQueue + BackgroundWorkers flush implementation

**Confidence:** HIGH -- confirmed by [SQLite WAL documentation](https://sqlite.org/wal.html), [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)

---

### Pitfall C-03: Solana `confirmed` Rollback Acting on Unfinalized TX

**What goes wrong:** An AI agent reads a DETECTED incoming transaction (committed at `confirmed` level) and takes action (e.g., sends a reply transfer, updates an internal ledger). The `confirmed` block is then dropped during a fork, and the incoming TX never finalizes. The agent has now acted on a phantom deposit.

**Why it happens:** Solana's `confirmed` commitment means the cluster voted on the block with supermajority, but ~5% of blocks do not end up being finalized. While the probability of a confirmed TX being rolled back is low, it is non-zero. The design doc's 2-phase status model (DETECTED -> CONFIRMED) correctly separates detection from finalization, but the pitfall is in **how downstream consumers (EventBus listeners, SDK users, MCP tool responses) treat DETECTED events**.

**Consequences:**
- Double-spend vulnerability: agent acts on unconfirmed deposit
- Accounting mismatch: internal records show deposit that never finalized
- Trust erosion: owner sees completed action for non-existent deposit

**Warning signs:**
- `DETECTED` rows that never transition to `CONFIRMED` after 5+ minutes
- `incoming-tx-confirm-solana` worker finding `getTransaction(finalized)` returning null for old DETECTED rows
- EventBus `transaction:incoming` events followed by no corresponding `transaction:incoming:confirmed` event

**Prevention:**
1. **API response must include status field prominently.** SDK/MCP consumers must check `status === 'CONFIRMED'` before acting on financial data
2. **Add `INCOMING_TX_CONFIRMED` notification event** (in addition to `DETECTED`). Agents should subscribe to CONFIRMED events for automated actions, DETECTED events for informational display only
3. **Document in skill files**: "Do NOT initiate transfers based on DETECTED incoming transactions. Wait for CONFIRMED status."
4. **Add stale DETECTED cleanup**: BackgroundWorker that marks DETECTED rows older than 1 hour as expired (new status `EXPIRED` or delete) -- if not confirmed after 1 hour on Solana, it was rolled back
5. **REST API default filter**: `GET /v1/wallet/incoming` should default to `status=CONFIRMED` unless explicitly overridden. This prevents casual API consumers from acting on unconfirmed data

**Detection:** Integration test: insert DETECTED row, simulate rollback (getTransaction returns null at finalized), verify row is cleaned up

**Phase:** Must be addressed in the EventBus event design phase and REST API implementation phase

**Confidence:** HIGH -- [Solana commitment levels documentation](https://www.helius.dev/blog/solana-commitment-levels), [Solana TX confirmation guide](https://solana.com/developers/guides/advanced/confirmation)

---

### Pitfall C-04: Gap Recovery Producing Duplicate Events via Memory Queue

**What goes wrong:** WebSocket disconnects. During the blind gap, 3 TXs arrive. WebSocket reconnects. Gap recovery runs `getSignaturesForAddress(until: lastSignature)` and finds the 3 TXs. Meanwhile, the daemon had already fallen back to polling mode, and the polling worker (`incoming-tx-poll-solana`) already found 2 of the 3 TXs. Gap recovery pushes all 3 into the memory queue. Polling already pushed 2. The queue now has 5 entries representing 3 unique TXs.

The DB-level `ON CONFLICT(tx_hash, wallet_id) DO NOTHING` correctly deduplicates at INSERT time. The flush handler correctly emits EventBus events only for rows where `result.changes > 0`. **BUT**: the doc 76 design marks the `Set<txHash+walletId>` dedup in the memory queue as "optional optimization" (section 2.4). This is **not optional** -- it is required.

Without queue-level dedup, the flush worker wastes DB operations on INSERT statements that hit ON CONFLICT DO NOTHING. More importantly, during gap recovery with 1000+ signatures, the queue balloons with duplicates, increasing memory pressure and flush time.

**Why it happens:** Three sources can produce the same TX simultaneously: (1) WebSocket subscription (if it reconnects fast), (2) polling fallback, (3) gap recovery. All three push to the same memory queue.

**Consequences:**
- Wasted DB write operations (INSERT that hits ON CONFLICT DO NOTHING)
- Memory queue grows faster than necessary during gap recovery
- If the flush handler logic is ever refactored to not check `result.changes`, duplicate notifications become possible

**Warning signs:**
- `incoming-tx-flush` logs show high `ON CONFLICT DO NOTHING` hit rate (> 10% of batch)
- Memory queue size spikes during reconnection sequences

**Prevention:**
1. **Make queue-level dedup mandatory**, not optional. Use `Map<string, IncomingTransaction>` keyed by `${txHash}:${walletId}` instead of plain array. `push()` becomes `set()` -- idempotent
2. During gap recovery, acquire a lock or set a flag that pauses polling for that specific wallet until gap recovery completes
3. Log dedup statistics: `inserted: N, duplicates_skipped: M` per flush cycle for observability

**Detection:** Test: push same TX to queue 3 times, call flush, assert exactly 1 DB row and 1 EventBus emit

**Phase:** Must be addressed in IncomingTxQueue implementation and gap recovery logic

**Confidence:** HIGH -- derived from doc 76 design analysis

---

### Pitfall C-05: Shutdown Data Loss -- Memory Queue Not Flushed

**What goes wrong:** The daemon receives SIGTERM. DaemonLifecycle shutdown sequence runs. Step 6a stops services, Step 7 calls `workers.stopAll()`, Step 8 does WAL checkpoint, Step 9 locks keystore, Step 10 closes SQLite. But `IncomingTxMonitorService.stop()` is called in Step 6a, which stops WebSocket subscriptions. The memory queue may still contain unflushed TXs (up to 5 seconds of accumulated events). If `workers.stopAll()` in Step 7 has already cleared the `incoming-tx-flush` timer, those TXs are lost.

**Why it happens:** The `BackgroundWorkers.stopAll()` clears all interval timers and waits up to 5 seconds for in-progress handlers. But it does NOT run one final iteration of each worker. If the flush worker last ran 4 seconds ago and the daemon shuts down, up to 4 seconds of queued TXs are lost.

The **critical escalation**: if the last flush updated the cursor to include these TXs but the TXs themselves were not flushed (cursor and data are updated in separate steps), the cursor points past unflushed data -- **permanent data loss** because gap recovery skips them.

**Consequences:**
- 0-5 seconds of incoming TXs lost on every daemon restart
- If cursor is ahead of actual data, permanent data loss (gap recovery skips the gap)

**Warning signs:**
- Missing incoming TXs after daemon restart that gap recovery should have caught
- Cursor timestamp newer than newest `incoming_transactions.detected_at` for a wallet

**Prevention:**
1. **In `IncomingTxMonitorService.stop()`, call `this.queue.flush(this.sqlite)` as the LAST step** -- after stopping subscriptions but before returning. This ensures all queued TXs are persisted
2. **Update cursor ONLY inside the flush transaction**, not separately. Cursor and TX data must be atomically consistent. Use a single `sqlite.transaction()` that inserts TXs AND updates the cursor
3. **In DaemonLifecycle shutdown, call `incomingTxMonitorService.stop()` BEFORE `workers.stopAll()`** (verify this ordering in implementation)
4. Add shutdown log: `Flushed N remaining incoming TXs during shutdown`

**Detection:** Test: push 10 TXs to queue, call `service.stop()`, verify all 10 are in DB. Test: crash simulation (no graceful shutdown), verify gap recovery catches missed TXs on restart

**Phase:** Must be addressed in DaemonLifecycle integration phase

**Confidence:** HIGH -- derived from codebase analysis (BackgroundWorkers.stopAll in `workers.ts` lines 94-105 does not run final iteration)

---

### Pitfall C-06: EVM Reorg Causing False CONFIRMED Status

**What goes wrong:** An EVM block at height N includes a transfer to a monitored wallet. The polling worker detects it, inserts as DETECTED with `block_number = N`. The confirm worker runs, sees `currentBlock - N >= 12`, marks it as CONFIRMED. Later, a chain reorganization replaces block N with a different block that does NOT include the transfer. The DB now has a CONFIRMED record for a transaction that does not exist on the canonical chain.

**Why it happens:** The EVM confirm worker (doc 76 section 4.6) only checks `currentBlock - tx.block_number >= BigInt(threshold)`. It does NOT re-verify that the transaction still exists at the claimed block. Reorgs deeper than 12 blocks are extremely rare on Ethereum mainnet post-Merge (~0%), but on testnets (Sepolia) and L2s, reorgs can be more common.

**Consequences:**
- False CONFIRMED record in the database
- Agent acts on non-existent deposit with full confidence (CONFIRMED status)
- No automatic correction mechanism

**Warning signs:**
- Transaction hash returns `null` from `eth_getTransactionReceipt` despite being CONFIRMED in DB
- Block number in DB does not match the block containing the TX hash on-chain

**Prevention:**
1. **In the confirm worker, re-fetch the transaction receipt** (`eth_getTransactionReceipt(txHash)`) before marking CONFIRMED. Verify receipt exists AND `receipt.blockNumber` matches stored `block_number`
2. If `receipt.blockNumber` differs from stored value, update the stored `block_number` and reset to DETECTED (the TX was reorged but re-included in a different block)
3. If receipt is null, mark the TX as `EXPIRED` or delete it (TX was dropped from canonical chain)
4. For L2s (Base, Arbitrum) where `CONFIRMATION_THRESHOLDS` is 1, the confirm worker should still re-verify the receipt -- L2 finality is derived from L1 batch posting, not L2 block count

**Detection:** Integration test with mocked RPC: insert DETECTED TX at block N, mock `getBlockNumber()` to return N+12, mock `getTransactionReceipt()` to return null, verify TX is NOT marked CONFIRMED

**Phase:** Must be addressed in the EVM confirmation worker implementation

**Confidence:** MEDIUM -- post-Merge Ethereum reorgs > 12 blocks are theoretical only on mainnet, but L2/testnet scenarios are real. [Geth newHeads reorg behavior](https://github.com/ethereum/go-ethereum/issues/24699)

---

## Moderate Pitfalls

Mistakes that cause degraded performance, incorrect behavior in edge cases, or debugging difficulty.

---

### Pitfall M-01: Solana 10-Minute Inactivity Timeout Killing Subscriptions Silently

**What goes wrong:** A monitored wallet receives no transactions for 10+ minutes. The Solana RPC provider (Helius, QuickNode, public RPC) silently closes the WebSocket connection due to its inactivity timeout policy. The `SolanaHeartbeat` (doc 76 section 5.3) sends ping frames every 60 seconds, which should prevent this. **BUT**: some RPC providers require application-level pings (JSON-RPC ping method), not WebSocket protocol-level ping frames. The `ws.ping()` call in the heartbeat sends a WebSocket frame, which may not be recognized by the RPC server's inactivity timer.

**Why it happens:** WebSocket ping/pong is a protocol-level mechanism. RPC providers may track "inactivity" at the application level (no subscription-related JSON-RPC messages), not the transport level.

**Prevention:**
1. Use both mechanisms: WebSocket `ws.ping()` AND a lightweight JSON-RPC call (e.g., `getHealth()` or `getSlot()`) on the same connection every 60 seconds
2. Add jitter to the heartbeat interval: `60_000 + Math.random() * 10_000` to prevent thundering herd if multiple daemons restart simultaneously
3. Monitor WebSocket `close` events and log the close code + reason. Code 1000 = normal, 1001 = going away (likely timeout), 1006 = abnormal (network issue)
4. Test with the actual RPC provider in staging to confirm which ping mechanism prevents timeout

**Detection:** Log WebSocket connection duration. If connections consistently last exactly 10 minutes, the heartbeat is not working.

**Phase:** SolanaIncomingSubscriber heartbeat implementation

**Confidence:** MEDIUM -- [Solana WebSocket docs](https://solana.com/docs/rpc/websocket), [QuickNode WebSocket guide](https://www.quicknode.com/guides/solana-development/getting-started/how-to-create-websocket-subscriptions-to-solana-blockchain-using-typescript)

---

### Pitfall M-02: getSignaturesForAddress `until` Parameter Ordering Gotcha

**What goes wrong:** Gap recovery calls `getSignaturesForAddress(address, { until: lastSignature })` to fetch TXs that occurred after the last processed signature. The results are returned in **newest-first** order. The code reverses them (`.reverse()`) to process oldest-first. **BUT**: if the address had multiple TXs in the same slot (common for token airdrops or bot activity), the ordering within a slot is inconsistent between blockstore and bigtable backends.

**Why it happens:** Solana's `getSignaturesForAddress` ordering is not fully deterministic within a single slot. [GitHub issue #35521](https://github.com/solana-labs/solana/issues/35521) documents that ordering differs based on whether the data is served from the validator's blockstore (recent) or bigtable (archival). Using `until` with a signature that is in the middle of a slot can produce different results depending on the backend.

**Consequences:**
- Missing 1-2 TXs during gap recovery if the cursor signature is in the middle of a multi-TX slot
- Inconsistent behavior between fresh nodes (blockstore) and archival queries (bigtable)
- Difficult to reproduce in testing because it depends on RPC backend state

**Prevention:**
1. After gap recovery, subtract 1 slot from the cursor and refetch to ensure no intra-slot gaps
2. Use `ON CONFLICT DO NOTHING` (already in design) to handle the resulting duplicates safely
3. Process ALL signatures returned, even if some were already processed (idempotent insert handles this)
4. Log the slot number alongside signature in cursor updates for debugging
5. Consider using slot-based cursors (Helius `getTransactionsForAddress`) instead of signature-based cursors for more reliable pagination

**Detection:** Integration test: create 3 TXs in same slot affecting same address, verify gap recovery finds all 3

**Phase:** SolanaIncomingSubscriber.pollAll() and gap recovery implementation

**Confidence:** MEDIUM -- [Solana GitHub issue #35521](https://github.com/solana-labs/solana/issues/35521), [Solana GitHub issue #22456](https://github.com/solana-labs/solana/issues/22456)

---

### Pitfall M-03: KillSwitch Cascade Race With Incoming TX Flush

**What goes wrong:** KillSwitch activates (ACTIVE -> SUSPENDED). The 6-step cascade runs: revoke sessions, cancel in-flight TXs, suspend wallets. Meanwhile, the `incoming-tx-flush` worker fires (it runs on a 5-second timer, independent of KillSwitch). The flush worker inserts incoming TXs and emits `transaction:incoming` events. Notification listeners fire, sending "Incoming TX detected" notifications -- AFTER the KillSwitch was activated.

The user receives contradictory signals: "Kill switch activated, all operations suspended" followed by "New incoming transaction detected for wallet X". This creates confusion about whether the system is actually locked down.

**Why it happens:** BackgroundWorkers run on `setInterval` timers that are independent of KillSwitch state. The flush worker does not check KillSwitch state before flushing. The KillSwitch cascade does not stop background workers (it only revokes sessions, cancels in-flight TXs, and suspends wallets).

**Consequences:**
- Confusing notification sequence for the owner
- Incoming TXs continue to be recorded in DB even while system is "locked down" (this is actually correct -- we want the audit trail)
- But notifications should be suppressed during SUSPENDED/LOCKED state

**Prevention:**
1. **Flush worker should still write to DB** during KillSwitch SUSPENDED/LOCKED (preserving audit trail is important)
2. **BUT: suppress notification emission** when KillSwitch state is not ACTIVE. Check `killSwitchService.getState().state === 'ACTIVE'` before emitting EventBus events in the flush handler
3. **Add to DaemonLifecycle shutdown cascade**: set `incomingTxMonitorService.suppressNotifications = true` alongside the KillSwitch activation
4. After KillSwitch recovery (SUSPENDED -> ACTIVE), do NOT retroactively send notifications for TXs recorded during suspension. They are in the DB for audit, not for alerts.

**Detection:** Test: activate KillSwitch, push incoming TX to queue, run flush, verify DB has the TX but no EventBus `transaction:incoming` event was emitted and no notification was sent

**Phase:** IncomingTxMonitorService integration with KillSwitchService

**Confidence:** HIGH -- derived from codebase analysis (KillSwitchService.executeCascade does not stop BackgroundWorkers)

---

### Pitfall M-04: Memory Queue Unbounded Growth During Extended Disconnect

**What goes wrong:** WebSocket disconnects. Polling mode activates. RPC provider is also having issues (rate limiting, downtime). Polling fails repeatedly. WebSocket reconnection also fails. Gap recovery accumulates. When connectivity restores, gap recovery fetches up to 1000 signatures per wallet, each requiring a `getTransaction()` call. For 10 monitored wallets, that is 10,000 TXs pushed to the memory queue in rapid succession.

If the `IncomingTxQueue` is a plain array with no size limit, it grows to 10,000+ entries. The next flush cycle processes `MAX_BATCH = 100`, so it takes 100 flush cycles (500 seconds = 8+ minutes) to drain the queue. During this time, the array holds ~10,000 `IncomingTransaction` objects in memory (~5KB each = ~50MB).

**Why it happens:** Gap recovery is designed to fetch ALL missed TXs, which is correct for data completeness. But it pushes all results synchronously into the memory queue without backpressure.

**Consequences:**
- 50MB+ memory spike during gap recovery
- 8+ minutes of elevated flush activity, degrading API performance
- If daemon restarts during this period, unflushed TXs are lost (see C-05)

**Prevention:**
1. **Add queue size limit**: `MAX_QUEUE_SIZE = 1000`. If queue exceeds limit, log a warning and drop oldest entries (they can be re-fetched via gap recovery on next restart)
2. **Process gap recovery in streaming fashion**: fetch 100 signatures, flush, update cursor, fetch next 100. Do NOT accumulate all 1000 in memory
3. **Add backpressure to gap recovery**: `if (queue.length > 500) await sleep(1000)` between wallet iterations
4. **Log queue high-water mark**: track and log the maximum queue size per flush cycle for capacity planning

**Detection:** Load test: simulate 1000 missed TXs across 10 wallets, monitor memory usage during gap recovery, assert RSS delta < 100MB

**Phase:** Gap recovery implementation and IncomingTxQueue design

**Confidence:** HIGH -- straightforward engineering concern

---

### Pitfall M-05: EVM Native ETH Detection via getBlock(includeTransactions) Performance

**What goes wrong:** The EVM polling worker calls `getBlock({ blockNumber, includeTransactions: true })` for every block to detect native ETH transfers. Each call returns the FULL block including ALL transactions (not just those relevant to monitored wallets). On Ethereum mainnet, blocks average 150+ transactions. For a 30-second polling interval catching ~2 blocks, that is 300+ full transaction objects deserialized per cycle, but only 0-1 are relevant.

**Why it happens:** Native ETH transfers do not emit events. There is no `getLogs` equivalent for ETH transfers. The only way to detect them is to scan full blocks. This is inherently expensive.

**Consequences:**
- High RPC credit consumption (Helius/QuickNode charge per call, and `getBlock(full)` is expensive)
- Deserialization overhead: 300 transaction objects per block, most discarded
- If polling falls behind (RPC slow), the 10-block batch means 1500+ transactions to deserialize

**Prevention:**
1. **Optimize: use `eth_getBlockReceipts` instead of `getBlock(includeTransactions: true)`** -- some providers support it, and it is more efficient for scanning
2. **Filter early**: check `tx.to?.toLowerCase() === walletAddress.toLowerCase()` AND `tx.value > 0n` before any other processing
3. **Consider provider-specific enhanced APIs** (Alchemy `alchemy_getAssetTransfers`, QuickNode equivalents) for production deployments -- these provide indexed ETH transfer lookups without full block scanning
4. **Rate limit block fetches**: max 2 blocks per polling cycle. If behind by more than 10 blocks, process in next cycle (don't try to catch up in one burst)
5. **Skip blocks with no relevant TXs quickly**: check block's `transactions` array length
6. **Document in config**: recommend users enable native ETH detection only if needed. ERC-20 only users can disable it to save RPC costs

**Detection:** Log RPC call count per polling cycle and average response time. Alert if > 5 calls per cycle.

**Phase:** EvmIncomingSubscriber.pollNativeETH implementation

**Confidence:** HIGH -- inherent limitation of EVM architecture, no log events for native transfers

---

### Pitfall M-06: HotReload WSS URL Change Causing Subscription Leak

**What goes wrong:** Admin changes `incoming.wss_url` via Settings UI. HotReloadOrchestrator calls `incomingTxMonitorService.updateConfig({ wssUrl: newUrl })`. The service creates a new WebSocket connection to the new URL. But the old WebSocket connection (to the old URL) is not properly closed because `updateConfig` only updates the config, it does not trigger `SubscriptionMultiplexer.destroyAll()` + re-subscribe.

**Why it happens:** Doc 76 section 8.5 shows `updateConfig()` but does not detail the WebSocket lifecycle during URL change. The multiplexer caches connections by `${chain}:${network}` key. If the URL changes but the key stays the same, the multiplexer still holds the old connection object.

**Consequences:**
- Two WebSocket connections to different RPC endpoints for the same chain
- Both produce events, leading to genuine duplicate TXs in the queue (same TX from two sources)
- Old connection eventually times out (10 min), but until then, double processing

**Prevention:**
1. **`updateConfig()` must call `this.multiplexer.destroyAll()` when `wssUrl` changes**, then `syncSubscriptions()` to re-establish connections with the new URL
2. Compare old and new wssUrl before destroying. If unchanged, skip reconnection
3. Add a brief cooldown (1-2 seconds) between destroy and re-subscribe to avoid racing with the old connection's close handlers

**Detection:** Test: call `updateConfig` with new URL, verify old WebSocket is terminated, verify only one active connection per chain:network

**Phase:** HotReloadOrchestrator incoming config integration

**Confidence:** HIGH -- derived from doc 76 design analysis

---

### Pitfall M-07: Notification Storm on Airdrop / Token Spam

**What goes wrong:** A wallet receives 50 dust-value token transfers in rapid succession (common in Solana ecosystem for token spam/airdrops). Each one triggers `INCOMING_TX_SUSPICIOUS` notification via all configured channels (Telegram, ntfy, Discord, Slack, WalletNotificationChannel). Owner receives 50x5 = 250 notifications in 30 seconds.

**Why it happens:** The notification system processes each TX independently. There is no rate limiting or aggregation for incoming TX notifications. The IIncomingSafetyRule correctly flags each as suspicious (dust attack), but the notification dispatch does not aggregate.

**Consequences:**
- Notification channel rate limits hit (Telegram: 30 messages/second per bot)
- Owner notification fatigue -- ignores future legitimate suspicious TX alerts
- Telegram bot potentially banned for flooding
- ntfy channel overwhelmed

**Prevention:**
1. **Add cooldown per wallet per event type**: after sending `INCOMING_TX_SUSPICIOUS` for wallet X, suppress further SUSPICIOUS notifications for wallet X for 60 seconds. Accumulate suppressed count. After cooldown, send summary: "15 more suspicious TXs detected for wallet X"
2. **Batch notifications**: in the flush handler, count suspicious TXs per wallet. If > 3 in one flush cycle, send a single aggregated notification instead of individual ones
3. **Add `incoming_notification_cooldown` setting** (default: 60 seconds) to SettingsService
4. **Separate DETECTED and SUSPICIOUS notification cadence**: normal incoming TX notifications can be batched (send summary every 5 minutes), suspicious ones are individual but rate-limited

**Detection:** Load test: push 50 dust TXs for one wallet, verify <= 5 notifications sent (not 50)

**Phase:** NotificationService integration in flush handler

**Confidence:** HIGH -- well-known problem in blockchain monitoring systems

---

## Minor Pitfalls

Issues that cause confusion, test instability, or minor misbehavior.

---

### Pitfall L-01: WebSocket Mock Timing in Vitest Tests

**What goes wrong:** Tests for SolanaIncomingSubscriber use mock WebSocket servers. Test sends a mock `logsSubscribe` notification, then immediately asserts that `onTransaction` callback was called. But the callback fires asynchronously (after JSON parsing, TX lookup, queue push). The assertion runs before the callback, causing a flaky test that passes 90% of the time.

**Prevention:**
1. Use `vi.waitFor()` or `waitForExpect()` pattern instead of immediate assertions
2. Use `vitest-websocket-mock` library for structured WS mock assertions with built-in timeouts
3. All WebSocket test assertions should be wrapped in `await expect(async () => ...).resolves` or use explicit `Promise`-based synchronization
4. Set deterministic test timeouts: `{ timeout: 5000 }` per test, not relying on global defaults
5. Use `vi.useFakeTimers()` for BackgroundWorkers tests to avoid real timer dependencies

**Phase:** All test phases for incoming TX monitoring

**Confidence:** HIGH -- [vitest-websocket-mock](https://github.com/akiomik/vitest-websocket-mock), [Vitest flaky test guide](https://trunk.io/blog/how-to-avoid-and-detect-flaky-tests-in-vitest)

---

### Pitfall L-02: Cursor Atomicity -- Cursor Updated Separately From TX Data

**What goes wrong:** The flush handler inserts TXs into `incoming_transactions`, then separately updates `incoming_tx_cursors`. If the process crashes between the two operations, the cursor is stale (behind the actual data). This is the benign case -- gap recovery will re-process some TXs (handled by ON CONFLICT). The **dangerous** reverse case (cursor ahead of data) is covered in C-05.

**Prevention:**
1. **Wrap both operations in a single `sqlite.transaction()`**: insert TXs and update cursor atomically
2. Only update cursor to the last TX in the successfully inserted batch
3. After crash recovery, cursor may be slightly behind -- this is safe because ON CONFLICT DO NOTHING handles re-inserts

**Phase:** IncomingTxQueue flush and cursor management

**Confidence:** HIGH -- standard database consistency pattern

---

### Pitfall L-03: EventBus Event Type Collision with Existing Listeners

**What goes wrong:** Doc 76 adds `'transaction:incoming'` to `WaiaasEventMap`. Existing consumers that use string-based patterns or iterate over all `transaction:*` events might accidentally process incoming TX events as outgoing TX events. For example, a logging middleware that logs all events starting with `'transaction:'` would log incoming TXs with outgoing TX format expectations.

**Prevention:**
1. **Review all existing EventBus consumers** (`on('transaction:...')`) to ensure they handle the new event type correctly or ignore it
2. Use the TypeScript type system: `WaiaasEventMap` is already typed, so mismatched handlers will cause compilation errors
3. Add the new event types to `WaiaasEventMap` with their distinct payload interfaces (doc 76 section 6.1 already does this correctly)
4. Test: emit `transaction:incoming`, verify no existing listener (transaction:completed, transaction:failed) fires

**Phase:** EventBus event type extension phase

**Confidence:** HIGH -- the existing typed EventBus system prevents this at compile time, but runtime consumers (logging, metrics) may not be typed

---

### Pitfall L-04: WAL File Growth During Continuous Incoming TX Writes

**What goes wrong:** The existing WAL checkpoint worker runs PASSIVE checkpoints every 5 minutes. With incoming TX monitoring adding writes every 5 seconds (flush worker), the WAL file grows faster than before. PASSIVE checkpoints only checkpoint pages not being read. If the `incoming-tx-confirm-*` workers are reading DETECTED rows while a checkpoint runs, those pages cannot be checkpointed, causing WAL growth.

**Prevention:**
1. **Current PASSIVE checkpoint interval (5 min) is sufficient** for the expected write volume (50 rows per batch max, 10 batches per 5 min = 500 rows). WAL file will grow to ~1-5MB between checkpoints, which is acceptable
2. **Monitor WAL file size** after enabling incoming TX monitoring. Add `PRAGMA wal_checkpoint(PASSIVE)` result logging (pages checkpointed vs. total pages)
3. If WAL exceeds 50MB, consider reducing checkpoint interval to 2 minutes
4. **Do NOT change to TRUNCATE checkpoints** during normal operation -- TRUNCATE blocks readers. Keep TRUNCATE only for shutdown (already implemented)
5. The existing `busy_timeout = 5000ms` is sufficient for this write volume

**Phase:** Post-integration monitoring, not a specific implementation phase

**Confidence:** HIGH -- [SQLite WAL documentation](https://sqlite.org/wal.html), current WAIaaS PASSIVE checkpoint pattern is correct

---

### Pitfall L-05: Admin UI Monitoring Toggle Creates Subscription Timing Issue

**What goes wrong:** User enables monitoring for a wallet via Admin UI (`PATCH /v1/wallet/:id { monitorIncoming: true }`). The API handler sets `monitor_incoming = 1` in DB and calls `syncSubscriptions()`. If `syncSubscriptions()` is awaited, the API request hangs for 2-3 seconds while WebSocket subscription is established.

**Prevention:**
1. **Make `syncSubscriptions()` fire-and-forget from the API handler**: `void this.syncSubscriptions()` -- do not await it
2. Return the API response immediately with `monitorIncoming: true` status
3. Add a monitoring status field to the wallet response: `monitoringStatus: 'activating' | 'active' | 'error'` that reflects actual subscription state
4. `syncSubscriptions()` should be resilient to individual wallet subscription failures (already has per-wallet error isolation in doc 76)

**Phase:** PATCH /v1/wallet/:id API handler implementation

**Confidence:** MEDIUM -- depends on implementation choices for sync vs async subscription setup

---

### Pitfall L-06: EVM `getLogs` Block Range Limit per RPC Provider

**What goes wrong:** EVM polling falls behind (daemon was down for 1 hour, ~300 blocks). Gap recovery calls `getLogs({ fromBlock: lastBlock + 1, toBlock: 'latest' })` with a 300-block range. Some RPC providers limit `getLogs` to 2,000-10,000 blocks per request. Others return errors for ranges exceeding their limit.

**Prevention:**
1. **Cap block range per getLogs call**: max 100 blocks (already partially in doc 76 `sub.lastBlock + 10n` pattern)
2. For gap recovery specifically, iterate in chunks: `for (let b = fromBlock; b <= toBlock; b += 100n)`
3. Handle `eth_getLogs` errors gracefully: if provider returns "block range too large" error, reduce chunk size and retry
4. Log: `Gap recovery: processing blocks ${from} to ${to} (${count} blocks, ${chunks} chunks)`

**Phase:** EvmIncomingSubscriber.pollAll() and gap recovery

**Confidence:** HIGH -- well-known RPC provider limitation

---

### Pitfall L-07: Solana logsSubscribe Single-Address-Per-Subscription Limit

**What goes wrong:** Developer assumes `logsSubscribe({ mentions: [addr1, addr2, addr3] })` monitors all three addresses with a single subscription. In reality, Solana RPC requires one subscription per address in the `mentions` array. Passing multiple addresses may silently filter by only the first one, or return unexpected results.

**Prevention:**
1. **One `logsSubscribe` call per wallet address** -- this is already the design in doc 76 section 3.1
2. All subscriptions share one WebSocket connection via SubscriptionMultiplexer (connection sharing, not subscription sharing)
3. Be aware of per-connection subscription limits -- most providers allow 100-200 concurrent subscriptions per WebSocket
4. Add `max_monitored_wallets` config setting (already in design as H-3) to prevent exceeding subscription limits

**Phase:** SolanaIncomingSubscriber.subscribe() implementation

**Confidence:** HIGH -- [Solana logsSubscribe docs](https://solana.com/docs/rpc/websocket/logssubscribe)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| IChainSubscriber interface + types | L-03 EventBus collision | Low | Type system guards, review existing consumers |
| DB schema v21 migration | None significant | N/A | Standard DDL migration, well-tested pattern |
| SolanaIncomingSubscriber | C-01 listener leak, M-01 heartbeat, M-02 cursor ordering | Critical/Moderate | AbortController per generation, dual ping, slot-based fallback |
| EvmIncomingSubscriber | M-05 getBlock performance, L-06 block range limits, C-06 false CONFIRMED | Critical/Moderate | Enhanced API if available, chunk processing, receipt re-verification |
| IncomingTxQueue + flush | C-02 SQLITE_BUSY, C-04 duplicate events, M-04 unbounded growth | Critical/Moderate | Small batches, Map-based dedup, queue size limit |
| WebSocket SubscriptionMultiplexer | C-01 listener leak, M-06 HotReload URL change | Critical/Moderate | Explicit cleanup, destroy-before-reconnect |
| Gap recovery | C-04 duplicates, M-02 cursor ordering, M-04 memory growth | Critical/Moderate | Streaming recovery, mandatory dedup, backpressure |
| KillSwitch integration | M-03 race condition | Moderate | Check KillSwitch state before EventBus emit |
| Notification integration | M-07 storm, C-03 acting on DETECTED | Critical/Moderate | Cooldown, aggregation, status-aware notifications |
| DaemonLifecycle shutdown | C-05 unflushed queue | Critical | Final flush in stop(), cursor atomicity |
| REST API + SDK | C-03 consumer confusion on DETECTED | Critical | Default to CONFIRMED, document prominently |
| Testing | L-01 WebSocket mock flakiness | Low | vitest-websocket-mock, fake timers, Promise sync |

---

## Integration Pitfalls Summary

These are pitfalls specifically arising from integrating incoming TX monitoring into the existing WAIaaS daemon architecture:

| Integration Point | Existing Service | New Component | Risk | Mitigation |
|---|---|---|---|---|
| EventBus | typed WaiaasEventMap (5 events) | 3 new events | Type safety OK, but runtime log/metric consumers may not expect new events | Audit all `eventBus.on()` registrations |
| BackgroundWorkers | 3 workers (WAL, session, version) | 6 new workers | Timer scheduling density increases. Flush + poll + confirm all running concurrently | Stagger intervals (flush: 5s, poll: 30s, confirm: 30s, retention: 3600s) |
| KillSwitchService | 6-step cascade | Incoming TX flush continues during cascade | Notifications sent after lockdown | Suppress EventBus emit when state != ACTIVE |
| DaemonLifecycle | 10-step shutdown | IncomingTxMonitorService cleanup | Unflushed queue data loss | Final flush before service stop |
| NotificationService | 28 event types, 5 channels | 2 new event types, potential flood | Rate limit exhaustion on Telegram/ntfy | Per-wallet cooldown, batch aggregation |
| SettingsService | Hot-reload for 50+ keys | 7 new incoming.* keys | WSS URL change requires WebSocket lifecycle management | Destroy + re-subscribe on URL change |
| SQLite single writer | Pipeline Stage 5 writes | Flush worker writes every 5s | Event loop blocking during long transactions | Small batches (50 max), worker time logging |

---

## Sources

### Official Documentation
- [Solana RPC WebSocket Methods](https://solana.com/docs/rpc/websocket)
- [Solana logsSubscribe](https://solana.com/docs/rpc/websocket/logssubscribe)
- [Solana Transaction Confirmation & Expiration](https://solana.com/developers/guides/advanced/confirmation)
- [Solana Commitment Levels (Helius)](https://www.helius.dev/blog/solana-commitment-levels)
- [SQLite WAL Documentation](https://sqlite.org/wal.html)
- [SQLite busy_timeout](https://sqlite.org/c3ref/busy_timeout.html)

### GitHub Issues & Discussions
- [Solana getSignaturesForAddress ordering inconsistency (#35521)](https://github.com/solana-labs/solana/issues/35521)
- [Solana getSignaturesForAddress wrong results (#21039)](https://github.com/solana-labs/solana/issues/21039)
- [Solana WebSocket subscription expiry (#16937)](https://github.com/solana-labs/solana/issues/16937)
- [Solana node websocket delay (#35489)](https://github.com/solana-labs/solana/issues/35489)
- [Geth newHeads wrong block hash on reorg (#24699)](https://github.com/ethereum/go-ethereum/issues/24699)
- [ws library memory leak (#804)](https://github.com/websockets/ws/issues/804)
- [ws per-message deflate memory leak (#1617)](https://github.com/websockets/ws/issues/1617)

### Performance & Best Practices
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)
- [SQLite performance tuning (phiresky)](https://phiresky.github.io/blog/2020/sqlite-performance-tuning/)
- [SQLite BUSY errors despite timeout](https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/)
- [PowerSync SQLite optimizations](https://www.powersync.com/blog/sqlite-optimizations-for-ultra-high-performance)

### Testing
- [vitest-websocket-mock](https://github.com/akiomik/vitest-websocket-mock)
- [Avoiding flaky tests in Vitest](https://trunk.io/blog/how-to-avoid-and-detect-flaky-tests-in-vitest)

### RPC Provider Limits
- [Helius RPC optimization](https://www.helius.dev/docs/rpc/optimization-techniques)
- [QuickNode rate limits guide](https://www.quicknode.com/guides/quicknode-products/endpoint-security/how-to-setup-method-rate-limits)
- [Solana RPC providers comparison 2025](https://chainstack.com/best-solana-rpc-providers-2025/)

### Internal Design References
- WAIaaS Design Doc 76: Incoming Transaction Monitoring (~2,300 lines)
- WAIaaS BackgroundWorkers (`packages/daemon/src/lifecycle/workers.ts`)
- WAIaaS KillSwitchService (`packages/daemon/src/services/kill-switch-service.ts`)
- WAIaaS EventBus (`packages/core/src/events/event-bus.ts`)
- WAIaaS DB connection (`packages/daemon/src/infrastructure/database/connection.ts`)
