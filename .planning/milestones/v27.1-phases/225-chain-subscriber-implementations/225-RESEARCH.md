# Phase 225: Chain Subscriber Implementations - Research

**Researched:** 2026-02-22
**Domain:** Blockchain incoming transaction detection (Solana WebSocket + EVM polling)
**Confidence:** HIGH

## Summary

Phase 225 implements the two concrete `IChainSubscriber` classes -- `SolanaIncomingSubscriber` and `EvmIncomingSubscriber` -- plus a 3-state connection machine and Solana heartbeat. Phase 224 already established the IChainSubscriber 6-method interface, IncomingTransaction types, IncomingTxStatus enum, and DB v21 migration in `@waiaas/core`. This phase fills in the two adapter-level implementations.

The key asymmetry: Solana uses WebSocket-first (logsSubscribe via `createSolanaRpcSubscriptions` from `@solana/kit 6.0.1`) with HTTP polling fallback (`getSignaturesForAddress`), while EVM uses polling-first (`client.getLogs` + `client.getBlock` via viem 2.45.3) since HTTP RPC reliability exceeds WebSocket in self-hosted environments. Both implementations live in their respective adapter packages (`@waiaas/adapter-solana`, `@waiaas/adapter-evm`) and export alongside the existing adapters. No new npm dependencies are needed.

The 3-state connection machine (WS_ACTIVE / POLLING_FALLBACK / RECONNECTING) is a shared utility. For Solana, WebSocket disconnection triggers exponential backoff reconnection with automatic polling fallback after 3 consecutive failures. For EVM, the connection machine starts and stays in polling mode (connect() is a no-op, waitForDisconnect() returns a never-resolving Promise). A Solana heartbeat (60s `getSlot` RPC ping) prevents the 10-minute inactivity timeout that Helius/QuickNode/public RPC providers enforce.

**Primary recommendation:** Implement SolanaIncomingSubscriber and EvmIncomingSubscriber as separate files in their respective adapter packages, following the existing SolanaAdapter/EvmAdapter vi.mock testing patterns. The 3-state connection machine should be a standalone utility in `@waiaas/core` or the daemon package since both subscribers consume it. Tests must use mock RPC objects (no real network calls) following the vi.hoisted + vi.mock pattern established in the existing adapter tests.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUB-02 | SolanaIncomingSubscriber implements logsSubscribe({mentions}) + getTransaction(jsonParsed) for SOL/SPL/Token-2022 incoming detection | Design doc 76 sections 3.1-3.7 provide complete implementation pseudocode. `createSolanaRpcSubscriptions` confirmed in @solana/kit 6.0.1. logsNotifications() method with AbortController signal for lifecycle management. SOL detection via preBalances/postBalances delta; SPL/Token-2022 via preTokenBalances/postTokenBalances owner matching (both programs handled identically). pollAll() method for HTTP fallback via getSignaturesForAddress. |
| SUB-03 | EvmIncomingSubscriber implements getLogs(Transfer event) + getBlock(includeTransactions:true) for ERC-20/native ETH incoming detection | Design doc 76 sections 4.1-4.7 provide complete implementation pseudocode. viem 2.45.3 `client.getLogs()` with `parseAbiItem('event Transfer(...)')` for ERC-20. Native ETH via `client.getBlock({ includeTransactions: true })` scanning tx.to === walletAddress. 10-block batch limit per poll cycle. |
| SUB-04 | WebSocket-to-polling automatic fallback with 3-state connection machine (WS_ACTIVE/POLLING_FALLBACK/RECONNECTING) | Design doc 76 section 5.1-5.2 defines state machine and transitions. reconnectLoop pattern: connect() -> waitForDisconnect() -> retry with exponential backoff (1s -> 60s, jitter 30%). 3 consecutive failures trigger POLLING_FALLBACK. Polling workers check connectionState to conditionally execute. |
| SUB-07 | Solana heartbeat ping (60s interval + jitter) prevents 10-minute inactivity timeout disconnection | Design doc 76 section 5.3 defines SolanaHeartbeat class. 60s interval with getSlot() RPC call (not WebSocket ping frame -- uses HTTP RPC to keep subscription alive). timer.unref() prevents blocking process exit. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@solana/kit` | 6.0.1 | `createSolanaRpcSubscriptions`, `createSolanaRpc`, `address()` | Already installed in @waiaas/adapter-solana. Provides logsNotifications() for WebSocket subscriptions and getTransaction/getSignaturesForAddress for HTTP RPC |
| `viem` | 2.45.3 | `createPublicClient`, `http`, `parseAbiItem`, `decodeEventLog`, `parseEventLogs` | Already installed in @waiaas/adapter-evm. client.getLogs() for ERC-20 Transfer events, client.getBlock() for native ETH scanning |
| `@waiaas/core` | workspace:* | IChainSubscriber interface, IncomingTransaction type, ChainType enum, IncomingTxStatus | Phase 224 output. All types already exported from core barrel |
| `uuidv7` | 1.0.2 | `generateId()` for IncomingTransaction.id | Already installed in daemon. Used via `packages/daemon/src/infrastructure/database/id.ts` |
| `vitest` | (workspace) | Unit testing with vi.mock/vi.hoisted | Standard test framework across all packages |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@solana-program/system` | 0.11.0 | System Program address constant | Already in adapter-solana deps; needed for identifying SOL transfer instructions |
| `@solana-program/token` | 0.10.0 | TOKEN_PROGRAM_ADDRESS constant | Already in adapter-solana deps; needed for distinguishing SPL vs Token-2022 programs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@solana/kit` logsNotifications | Raw WebSocket + JSON-RPC | More control but reinvents subscription lifecycle; @solana/kit already handles serialization/types |
| viem getLogs polling | viem watchEvent with eth_subscribe | WebSocket mode has reconnect complexity; polling is simpler and sufficient for 12s block intervals |
| Custom UUID generation | crypto.randomUUID() | No time-ordering; uuidv7 provides ms-precision sorting needed for cursor pagination |

**Installation:**
```bash
# No new packages needed. All dependencies already installed.
```

## Architecture Patterns

### Recommended File Structure

```
packages/adapters/solana/src/
├── adapter.ts                    # Existing SolanaAdapter (unchanged)
├── solana-incoming-subscriber.ts # NEW: SolanaIncomingSubscriber implements IChainSubscriber
├── tx-parser.ts                  # Existing (unchanged)
├── incoming-tx-parser.ts         # NEW: parseSOLTransfer + parseSPLTransfer helpers
├── index.ts                      # Updated: export SolanaIncomingSubscriber
└── __tests__/
    └── solana-incoming-subscriber.test.ts  # NEW: mock RPC tests

packages/adapters/evm/src/
├── adapter.ts                    # Existing EvmAdapter (unchanged)
├── evm-incoming-subscriber.ts    # NEW: EvmIncomingSubscriber implements IChainSubscriber
├── abi/erc20.ts                  # Existing (unchanged, Transfer ABI reused)
├── index.ts                      # Updated: export EvmIncomingSubscriber
└── __tests__/
    └── evm-incoming-subscriber.test.ts  # NEW: mock client tests

packages/core/src/
└── interfaces/
    └── connection-state.ts       # NEW: ConnectionState type + calculateDelay utility
```

### Pattern 1: Solana WebSocket Subscription with AbortController

**What:** Use `@solana/kit`'s `createSolanaRpcSubscriptions` to establish WebSocket subscriptions with AbortController-based lifecycle management.

**When to use:** Subscribing to real-time Solana transaction notifications.

**Example:**
```typescript
// Source: Design doc 76 section 3.1 + Stack research section 1-3
import { createSolanaRpcSubscriptions, address } from '@solana/kit';

const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl);
const abortController = new AbortController();

const logNotifications = await rpcSubscriptions
  .logsNotifications(
    { mentions: [address(walletAddress)] },
    { commitment: 'confirmed' },
  )
  .subscribe({ abortSignal: abortController.signal });

for await (const notification of logNotifications) {
  const { signature, err } = notification.value;
  if (err !== null) continue;
  // Process signature...
}

// Cleanup
abortController.abort();
```

### Pattern 2: EVM Polling with getLogs + getBlock

**What:** Use viem's `client.getLogs()` for ERC-20 Transfer event detection and `client.getBlock()` for native ETH scanning, both over HTTP RPC.

**When to use:** Detecting incoming EVM transactions via periodic polling.

**Example:**
```typescript
// Source: Design doc 76 section 4.2 + 4.3
import { parseAbiItem, type PublicClient } from 'viem';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

// ERC-20 Transfer events
const logs = await client.getLogs({
  event: TRANSFER_EVENT,
  args: { to: walletAddress },
  fromBlock: lastBlock + 1n,
  toBlock: currentBlock,
});

// Native ETH -- scan block transactions
const block = await client.getBlock({
  blockNumber: blockNum,
  includeTransactions: true,
});
for (const tx of block.transactions) {
  if (typeof tx === 'object' && tx.to?.toLowerCase() === walletAddress.toLowerCase() && tx.value > 0n) {
    // Native ETH incoming transfer detected
  }
}
```

### Pattern 3: Mock RPC Testing (vi.hoisted + vi.mock)

**What:** Follow the established adapter test pattern: hoist mock objects with `vi.hoisted()`, then `vi.mock()` the library module to inject the mock.

**When to use:** All unit tests for subscriber implementations.

**Example:**
```typescript
// Source: Existing packages/adapters/solana/src/__tests__/solana-adapter.test.ts
const { mockRpc, mockRpcSubscriptions } = vi.hoisted(() => {
  const mockRpc = {
    getTransaction: vi.fn(),
    getSignaturesForAddress: vi.fn(),
    getSlot: vi.fn(),
  };
  const mockRpcSubscriptions = {
    logsNotifications: vi.fn(),
  };
  return { mockRpc, mockRpcSubscriptions };
});

vi.mock('@solana/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/kit')>();
  return {
    ...actual,
    createSolanaRpc: vi.fn().mockReturnValue(mockRpc),
    createSolanaRpcSubscriptions: vi.fn().mockReturnValue(mockRpcSubscriptions),
  };
});
```

### Pattern 4: 3-State Connection Machine

**What:** State machine managing WebSocket/polling mode transitions with exponential backoff reconnection.

**When to use:** Managing the lifecycle of chain subscriber connections.

**Example:**
```typescript
// Source: Design doc 76 section 5.1-5.2
type ConnectionState = 'WS_ACTIVE' | 'POLLING_FALLBACK' | 'RECONNECTING';

// reconnectLoop drives the state machine
async function reconnectLoop(
  subscriber: IChainSubscriber,
  config: ReconnectConfig,
  onStateChange: (state: ConnectionState) => void,
): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      await subscriber.connect();
      attempt = 0;
      onStateChange('WS_ACTIVE');
      await subscriber.waitForDisconnect();
    } catch {
      attempt++;
      if (attempt >= 3) onStateChange('POLLING_FALLBACK');
      else onStateChange('RECONNECTING');
      const delay = calculateDelay(attempt, config);
      await sleep(delay);
    }
  }
}
```

### Anti-Patterns to Avoid

- **Modifying existing adapters:** SolanaAdapter and EvmAdapter are stateless IChainAdapter implementations. DO NOT add WebSocket/subscription state to them. Subscribers are separate classes per the design doc's separation principle.
- **Using raw WebSocket:** Do not use Node.js WebSocket directly for Solana. `@solana/kit`'s `createSolanaRpcSubscriptions` handles serialization, typing, and subscription protocol.
- **Blocking onTransaction callbacks:** The onTransaction callback MUST be synchronous (push to memory queue only). Never await DB writes or network calls inside the callback.
- **Global state for connection machine:** Each subscriber instance owns its own connection state. Do not share state across instances.
- **Using viem watchEvent for EVM:** The design decision (D-06) specifies polling-first for EVM. Do not use `watchEvent` or `eth_subscribe` in this phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Solana WebSocket subscription protocol | Custom JSON-RPC WebSocket client | `createSolanaRpcSubscriptions` from @solana/kit | Handles subscription ID management, serialization, reconnect-safe abort |
| EVM event log decoding | Manual topic parsing | `parseAbiItem` + `decodeEventLog` from viem | Handles indexed parameter extraction, ABI encoding edge cases |
| UUID v7 generation | Custom timestamp-based ID | `generateId()` from daemon/database/id.ts | Correct ms-precision ordering, RFC compliance |
| Exponential backoff with jitter | Manual delay calculation | Shared `calculateDelay()` utility | Jitter prevents thundering herd, cap prevents unbounded delays |

**Key insight:** Both @solana/kit and viem already provide the RPC abstractions needed. The implementation work is in the subscriber class structure, transaction parsing logic, and connection state management -- not in low-level protocol handling.

## Common Pitfalls

### Pitfall 1: Solana preTokenBalances Missing Entry for First-Time Token Receipt

**What goes wrong:** When a wallet receives an SPL token for the first time, the ATA is created in the same transaction. `preTokenBalances` will NOT have an entry for that accountIndex/mint. Indexing into a missing entry causes undefined behavior.
**Why it happens:** ATA creation + token transfer happen atomically. Pre-state has no token account for that wallet.
**How to avoid:** When looking up preTokenBalances for a mint+owner combination, default to `0n` if not found: `const preAmount = pre?.amount ?? 0n;`
**Warning signs:** Tests with "first token receipt" scenario failing or returning incorrect amounts.

### Pitfall 2: EVM getBlock Returns Hash-Only Transactions Without includeTransactions

**What goes wrong:** `getBlock()` without `includeTransactions: true` returns transaction hashes (strings) instead of full transaction objects. Accessing `.to`, `.from`, `.value` on strings fails silently or throws.
**Why it happens:** viem's `getBlock` types are union -- transactions can be `string[]` or `Transaction[]` depending on the flag.
**How to avoid:** Always pass `{ includeTransactions: true }` and guard with `typeof tx === 'object'` check.
**Warning signs:** Native ETH transfers not being detected despite correct wallet address.

### Pitfall 3: Solana logsSubscribe mentions Array Accepts Only Single Address

**What goes wrong:** Passing multiple addresses in the `mentions` array appears to work but some RPC providers (QuickNode, Helius) only support single-address filtering.
**Why it happens:** The Solana spec allows an array, but provider implementations vary.
**How to avoid:** Subscribe with exactly one address per `logsNotifications()` call. Use separate subscriptions per wallet address, multiplexed on the same WebSocket connection.
**Warning signs:** Missing transactions for some wallets when monitoring multiple addresses.

### Pitfall 4: EVM getLogs Block Range Limits

**What goes wrong:** RPC providers limit `getLogs` to ~5,000-10,000 blocks per request. Requesting too large a range returns an error.
**Why it happens:** Provider rate-limiting and resource protection.
**How to avoid:** Batch polling to max 10 blocks per cycle (design doc 76 section 4.3). The EvmIncomingSubscriber.pollAll() already caps at `lastBlock + 10n`.
**Warning signs:** `getLogs` throwing "block range too large" errors in production.

### Pitfall 5: AbortController Signal Already Aborted

**What goes wrong:** Re-subscribing after an abort with the same AbortController fails immediately because the signal is already aborted.
**Why it happens:** AbortController.abort() is irreversible.
**How to avoid:** Create a new AbortController for each subscription attempt. Store it in the subscriptions Map keyed by walletId.
**Warning signs:** Subscriptions failing to restart after unsubscribe + re-subscribe.

### Pitfall 6: Solana Heartbeat Using WebSocket Ping vs RPC Call

**What goes wrong:** Using WebSocket-level `ping()` frames may not keep Solana RPC subscriptions alive because the inactivity timeout is measured at the RPC subscription level, not the WebSocket transport level.
**Why it happens:** RPC providers track activity based on JSON-RPC messages, not transport frames.
**How to avoid:** The design doc specifies using `getSlot()` HTTP RPC call as heartbeat, not WebSocket ping. However, the actual implementation should verify whether `ws.ping()` suffices for the target provider. As a safe default, use getSlot() via HTTP RPC.
**Warning signs:** Subscriptions timing out despite ping frames being sent.

## Code Examples

### SolanaIncomingSubscriber.subscribe() Core Flow

```typescript
// Source: Design doc 76 section 3.7 + Phase 225 plans
async subscribe(
  walletId: string,
  address: string,
  network: string,
  onTransaction: (tx: IncomingTransaction) => void,
): Promise<void> {
  if (this.subscriptions.has(walletId)) return; // idempotent

  const abortController = new AbortController();
  this.subscriptions.set(walletId, {
    address, network, abortController, onTransaction,
  });

  if (this.mode === 'websocket') {
    // Fire-and-forget: starts async WebSocket subscription loop
    void this.startWebSocketSubscription(
      walletId, address, network, onTransaction, abortController,
    );
  }
  // polling mode: pollAll() called externally by BackgroundWorkers
}
```

### SOL Native Transfer Detection

```typescript
// Source: Design doc 76 section 3.2.1
function parseSOLTransfer(
  tx: { meta: any; transaction: any; slot: number },
  walletAddress: string,
): { fromAddress: string; amount: string; slot: number } | null {
  const { meta, transaction } = tx;
  if (!meta || meta.err) return null;

  const accountKeys = transaction.message.accountKeys;
  const walletIndex = accountKeys.findIndex(
    (key: any) => key.pubkey.toString() === walletAddress,
  );
  if (walletIndex === -1) return null;

  const preBalance = BigInt(meta.preBalances[walletIndex]);
  const postBalance = BigInt(meta.postBalances[walletIndex]);
  const delta = postBalance - preBalance;
  if (delta <= 0n) return null;

  // Sender: first account with decreased balance
  const fromIndex = meta.preBalances.findIndex((pre: number, i: number) => {
    if (i === walletIndex) return false;
    return BigInt(pre) > BigInt(meta.postBalances[i]);
  });
  const fromAddress = fromIndex >= 0
    ? accountKeys[fromIndex].pubkey.toString()
    : 'unknown';

  return { fromAddress, amount: delta.toString(), slot: tx.slot };
}
```

### SPL/Token-2022 Transfer Detection

```typescript
// Source: Design doc 76 section 3.2.2
function parseSPLTransfers(
  tx: { meta: any; transaction: any; slot: number },
  walletAddress: string,
): Array<{ fromAddress: string; amount: string; tokenAddress: string; slot: number }> {
  const { meta } = tx;
  if (!meta || meta.err) return [];

  const results: Array<{ fromAddress: string; amount: string; tokenAddress: string; slot: number }> = [];

  // Build pre-state map for wallet's token balances
  const preMap = new Map<string, bigint>();
  for (const tb of meta.preTokenBalances ?? []) {
    if (tb.owner === walletAddress) {
      preMap.set(tb.mint, BigInt(tb.uiTokenAmount.amount));
    }
  }

  // Compare post-state: positive delta = incoming token transfer
  for (const tb of meta.postTokenBalances ?? []) {
    if (tb.owner !== walletAddress) continue;

    const preAmount = preMap.get(tb.mint) ?? 0n; // 0n for first-time receipt
    const postAmount = BigInt(tb.uiTokenAmount.amount);
    const delta = postAmount - preAmount;
    if (delta <= 0n) continue;

    // Both SPL Token and Token-2022 produce the same preTokenBalances/postTokenBalances structure
    results.push({
      fromAddress: findTokenSender(meta, tb.mint, walletAddress),
      amount: delta.toString(),
      tokenAddress: tb.mint,
      slot: tx.slot,
    });
  }

  return results;
}
```

### EVM ERC-20 Transfer Polling

```typescript
// Source: Design doc 76 section 4.2
import { parseAbiItem, type PublicClient, type Address } from 'viem';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

async function pollERC20Transfers(
  client: PublicClient,
  walletAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Array<{ txHash: string; fromAddress: string; amount: string; tokenAddress: string; blockNumber: number }>> {
  const logs = await client.getLogs({
    event: TRANSFER_EVENT,
    args: { to: walletAddress },
    fromBlock,
    toBlock,
  });

  return logs.map((log) => ({
    txHash: log.transactionHash!,
    fromAddress: log.args.from!,
    amount: log.args.value!.toString(),
    tokenAddress: log.address,
    blockNumber: Number(log.blockNumber),
  }));
}
```

### 3-State Connection Machine

```typescript
// Source: Design doc 76 section 5.1-5.2
type ConnectionState = 'WS_ACTIVE' | 'POLLING_FALLBACK' | 'RECONNECTING';

interface ReconnectConfig {
  initialDelayMs: number;   // 1000
  maxDelayMs: number;       // 60000
  maxAttempts: number;       // Infinity
  jitterFactor: number;     // 0.3
}

function calculateDelay(attempt: number, config: ReconnectConfig): number {
  const baseDelay = Math.min(
    config.initialDelayMs * Math.pow(2, attempt),
    config.maxDelayMs,
  );
  const jitter = baseDelay * config.jitterFactor * (2 * Math.random() - 1);
  return Math.max(100, Math.floor(baseDelay + jitter));
}
```

### Solana Heartbeat

```typescript
// Source: Design doc 76 section 5.3
class SolanaHeartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly INTERVAL_MS = 60_000;

  start(rpc: SolanaRpc): void {
    this.stop();
    this.timer = setInterval(async () => {
      try {
        await rpc.getSlot().send(); // HTTP RPC keepalive
      } catch {
        // Heartbeat failure is non-fatal; reconnectLoop handles real disconnects
      }
    }, this.INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `accountSubscribe` for Solana | `logsSubscribe({ mentions })` | Solana RPC v1.14+ | Covers SOL + all SPL tokens in single subscription |
| `eth_newFilter` + `eth_getFilterChanges` | viem `client.getLogs()` direct range query | viem 1.x+ | Stateless polling, no filter expiry concerns |
| Manual WebSocket reconnect for EVM | viem `webSocket()` transport with built-in reconnect | viem 2.0 (Issue #2325 fixed) | Auto reconnect with configurable attempts -- but NOT used in Phase 225 (polling-first for EVM) |
| @solana/web3.js Connection | @solana/kit createSolanaRpc/createSolanaRpcSubscriptions | @solana/kit 6.0 | Type-safe, tree-shakeable, functional API |

**Deprecated/outdated:**
- `@solana/web3.js` Connection class: replaced by `@solana/kit` functional API
- `programSubscribe`: too broad; `logsSubscribe({ mentions })` is the targeted alternative
- `eth_subscribe("newPendingTransactions")`: unconfirmed TX detection; unreliable for fund accounting

## Open Questions

1. **@solana/kit logsNotifications() method signature**
   - What we know: `createSolanaRpcSubscriptions` is confirmed exported from @solana/kit 6.0.1. The method is likely `logsNotifications()` per Stack research.
   - What's unclear: Exact TypeScript signature and return type. Type definitions are spread across multiple sub-packages in the @solana namespace.
   - Recommendation: Test with the actual API in unit tests. The Stack research (MEDIUM confidence) suggests `rpcSubscriptions.logsNotifications(filter, config).subscribe({ abortSignal })` pattern returning an AsyncIterable. If the API differs, the test will catch it immediately.

2. **Solana heartbeat: WebSocket ping vs getSlot RPC**
   - What we know: Design doc 76 section 5.3 shows `ws.ping()` in the SolanaHeartbeat example, but the Stack research mentions getSlot HTTP RPC as the keepalive mechanism.
   - What's unclear: Whether the inactivity timeout is at the WebSocket transport level or the RPC subscription level. Different providers may behave differently.
   - Recommendation: Implement getSlot() RPC call as the heartbeat (safer, works across all providers). The heartbeat class takes an RPC instance, not a WebSocket instance. This matches SUB-07 wording: "getSlot RPC."

3. **EVM polling interval for the subscriber itself**
   - What we know: Design doc says 12s (1 block). The pollAll() method is designed to be called by BackgroundWorkers in Phase 226.
   - What's unclear: Whether Phase 225 should register its own polling timer or leave that to Phase 226's IncomingTxMonitorService.
   - Recommendation: Phase 225 focuses on the subscriber class with a `pollAll()` public method. The polling timer registration belongs to Phase 226 (SubscriptionMultiplexer + BackgroundWorkers). The subscriber is a passive component invoked by the orchestrator.

## Codebase Integration Points

### Existing Files to Modify

| File | Change | Why |
|------|--------|-----|
| `packages/adapters/solana/src/index.ts` | Export `SolanaIncomingSubscriber` | Package barrel must expose the new class |
| `packages/adapters/evm/src/index.ts` | Export `EvmIncomingSubscriber` | Package barrel must expose the new class |

### Existing Patterns to Follow

| Pattern | Source File | What to Replicate |
|---------|------------|-------------------|
| vi.hoisted mock RPC | `adapters/solana/src/__tests__/solana-adapter.test.ts` | Mock `createSolanaRpc` and `createSolanaRpcSubscriptions` with controllable returns |
| vi.mock viem | `adapters/evm/src/__tests__/evm-adapter.test.ts` | Mock `createPublicClient` returning a mock client object |
| chainable RPC mock | `mockSend<T>` helper in solana-adapter.test.ts | `vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue(value) })` |
| Address types | `adapter.ts` using `address()` from @solana/kit | Branded `Address` type for Solana public keys |
| ERC20_ABI reuse | `adapters/evm/src/abi/erc20.ts` | Transfer event ABI already defined; use `parseAbiItem` for subscriber-specific event filtering |
| generateId() | `daemon/src/infrastructure/database/id.ts` | UUID v7 generation for IncomingTransaction.id |

### Dependencies Between Phase 225 Plans

- **225-01 (SolanaIncomingSubscriber)** and **225-02 (EvmIncomingSubscriber)** are independent of each other but both depend on IChainSubscriber from Phase 224.
- **225-03 (3-state connection machine + heartbeat)** is consumed by both subscribers but can be defined first or in parallel. The Solana subscriber in Plan 225-01 references the heartbeat, so heartbeat should be included in 225-01 or 225-03 should be done first.
- Recommendation: Plan 225-03 defines the connection state types and calculateDelay utility first. Plan 225-01 and 225-02 consume those types. Alternatively, Plan 225-01 includes the SolanaHeartbeat as a co-located helper class.

## Sources

### Primary (HIGH confidence)
- `@waiaas/core` IChainSubscriber interface -- verified in `packages/core/src/interfaces/IChainSubscriber.ts` (62 lines, 6 methods)
- `@waiaas/core` IncomingTransaction type -- verified in `packages/core/src/interfaces/chain-subscriber.types.ts` (35 lines, 13 fields)
- `@waiaas/core` IncomingTxStatus enum -- verified in `packages/core/src/enums/incoming-tx.ts` (5 lines)
- `@waiaas/core` WaiaasEventMap -- verified in `packages/core/src/events/event-types.ts` (7 events including transaction:incoming + transaction:incoming:suspicious)
- Design doc 76 (`internal/design/76-incoming-transaction-monitoring.md`) -- authoritative design spec for all sections
- `@solana/kit` 6.0.1 -- `createSolanaRpcSubscriptions` confirmed as exported function
- `viem` 2.45.3 -- `parseAbiItem`, `decodeEventLog`, `parseEventLogs` confirmed as top-level exports; `client.getLogs()`, `client.getBlock()` available on PublicClient
- Phase 224 verification -- all 4 success criteria verified, DB v21 migration operational, types exported

### Secondary (MEDIUM confidence)
- Stack research (`incoming-tx-monitor-STACK.md`) -- logsNotifications() method name and AbortController pattern from QuickNode guide
- viem WebSocket transport reconnect -- confirmed via GitHub Issue #2325 (closed 2024-07-26) but not directly used in Phase 225

### Tertiary (LOW confidence)
- Solana RPC provider heartbeat behavior -- exact inactivity timeout mechanics vary by provider. 60s getSlot() is a safe conservative choice.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and verified in codebase
- Architecture: HIGH -- design doc 76 provides complete implementation pseudocode for all components
- Pitfalls: HIGH -- based on actual codebase patterns and design doc constraints (C-01 through C-03)
- @solana/kit subscription API: MEDIUM -- method name `logsNotifications` from Stack research, not verified against TypeScript types directly

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable stack, no version changes expected)
