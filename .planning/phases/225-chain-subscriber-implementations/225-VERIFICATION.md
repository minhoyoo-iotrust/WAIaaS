---
phase: 225-chain-subscriber-implementations
verified: 2026-02-22T00:36:00Z
status: passed
score: 18/18 must-haves verified
re_verification: false
---

# Phase 225: Chain Subscriber Implementations — Verification Report

**Phase Goal:** Solana와 EVM 체인에서 지갑 주소로 들어오는 입금(네이티브 + 토큰)을 감지하는 구독자가 동작하여, mock RPC 환경에서 수신 트랜잭션을 콜백으로 전달할 수 있는 상태
**Verified:** 2026-02-22T00:36:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

#### Plan 225-01 (Solana) — SUB-02, SUB-07

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SolanaIncomingSubscriber.subscribe() starts a logsNotifications WebSocket subscription for the given wallet address | VERIFIED | `startWebSocketSubscription` calls `this.rpcSubscriptions.logsNotifications({ mentions: [address(addr)] }, { commitment: 'confirmed' }).subscribe(...)` in `solana-incoming-subscriber.ts:256-261` |
| 2 | SOL native transfer detection uses preBalances/postBalances delta comparison and identifies the sender | VERIFIED | `parseSOLTransfer` computes `delta = postBalance - preBalance`, returns null if `<= 0n`, scans for first account with decreased balance in `incoming-tx-parser.ts:91-105` |
| 3 | SPL/Token-2022 transfer detection uses preTokenBalances/postTokenBalances with 0n default for first-time receipt | VERIFIED | `parseSPLTransfers` uses `preMap.get(tb.mint) ?? 0n` pattern at `incoming-tx-parser.ts:193` — Pitfall 1 handled explicitly |
| 4 | SolanaIncomingSubscriber.pollAll() iterates subscribed wallets and calls onTransaction for each detected incoming transfer | VERIFIED | `pollAll()` iterates `this.subscriptions.entries()`, calls `pollWallet` per entry, which calls `processTransaction` → `sub.onTransaction(tx)` at `solana-incoming-subscriber.ts:196-204` |
| 5 | SolanaHeartbeat sends getSlot() RPC ping every 60s with timer.unref() | VERIFIED | `SolanaHeartbeat.start()` creates `setInterval` with `this.INTERVAL_MS = 60_000` and calls `this.timer.unref()` at `solana-incoming-subscriber.ts:63-71`; test confirms 60s interval with fake timers |
| 6 | subscribe() is idempotent — re-subscribing same walletId is a no-op | VERIFIED | `if (this.subscriptions.has(walletId)) return;` at line 119 and line 61 (EVM); test confirms `getBlockNumber` called only once |
| 7 | unsubscribe() aborts the AbortController and removes from subscriptions Map | VERIFIED | `sub.abortController.abort(); this.subscriptions.delete(walletId)` at `solana-incoming-subscriber.ts:138-139` |

#### Plan 225-02 (EVM) — SUB-03

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 8 | EvmIncomingSubscriber.pollAll() detects ERC-20 Transfer events via getLogs with parseAbiItem filter | VERIFIED | `pollERC20` calls `this.client.getLogs({ event: TRANSFER_EVENT, args: { to: walletAddress }, fromBlock, toBlock })` at `evm-incoming-subscriber.ts:151-156`; `TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')` at line 27 |
| 9 | EvmIncomingSubscriber.pollAll() detects native ETH transfers via getBlock(includeTransactions:true) scanning tx.to | VERIFIED | `pollNativeETH` calls `this.client.getBlock({ blockNumber: blockNum, includeTransactions: true })` and checks `tx.to.toLowerCase() === walletAddress.toLowerCase() && tx.value > 0n` at `evm-incoming-subscriber.ts:184-196` |
| 10 | Polling caps at 10 blocks per cycle to stay within RPC provider limits | VERIFIED | `MAX_BLOCK_RANGE = 10n` constant at line 32; `toBlock = sub.lastBlock + MAX_BLOCK_RANGE < currentBlock ? sub.lastBlock + MAX_BLOCK_RANGE : currentBlock` at lines 109-113; test verifies exact cap |
| 11 | subscribe() stores currentBlock as lastBlock cursor for each wallet | VERIFIED | `const currentBlock = await this.client.getBlockNumber(); this.subscriptions.set(walletId, { ..., lastBlock: currentBlock })` at `evm-incoming-subscriber.ts:63-69` |
| 12 | connect() is a no-op (EVM uses polling-first strategy per D-06) | VERIFIED | `async connect(): Promise<void> { // No-op }` at line 84-86; test `connect() resolves immediately (no-op)` passes |
| 13 | waitForDisconnect() returns a never-resolving Promise | VERIFIED | `return new Promise(() => {})` at line 93; test confirms it never resolves via 100ms race with sentinel |
| 14 | Per-wallet error isolation in pollAll() — one wallet failure does not affect others | VERIFIED | `try { ... } catch (err) { console.warn(...) }` per-wallet loop at lines 105-138; test with two wallets where first throws confirms second still receives events |

#### Plan 225-03 (ConnectionState) — SUB-04

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 15 | ConnectionState type defines 3 states: WS_ACTIVE, POLLING_FALLBACK, RECONNECTING | VERIFIED | `export type ConnectionState = 'WS_ACTIVE' \| 'POLLING_FALLBACK' \| 'RECONNECTING'` at `connection-state.ts:17` |
| 16 | calculateDelay returns exponential backoff with jitter (1s base, 60s cap, +/-30% jitter) | VERIFIED | Formula `Math.min(config.initialDelayMs * Math.pow(2, attempt), config.maxDelayMs)` + `jitter = baseDelay * config.jitterFactor * (2 * Math.random() - 1)` at `connection-state.ts:58-63`; tests confirm zero-jitter exact values and jitter range |
| 17 | calculateDelay never returns less than 100ms (floor clamp) | VERIFIED | `return Math.max(100, Math.floor(baseDelay + jitter))` at line 63; test with `initialDelayMs: 1` confirms floor |
| 18 | reconnectLoop calls connect(), waits for disconnect, transitions to POLLING_FALLBACK after 3 failures | VERIFIED | Loop transitions `RECONNECTING` → `WS_ACTIVE` on success, increments `attempt` on failure, calls `onStateChange('POLLING_FALLBACK')` when `attempt >= config.pollingFallbackThreshold` at lines 100-113; test confirms exact state sequence |

**Score: 18/18 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/adapters/solana/src/incoming-tx-parser.ts` | parseSOLTransfer and parseSPLTransfers pure functions | VERIFIED | 217 lines; exports `parseSOLTransfer`, `parseSPLTransfers`, `SolanaTransactionResult`, `SolanaAccountKey`, `SolanaTokenBalance` |
| `packages/adapters/solana/src/solana-incoming-subscriber.ts` | SolanaIncomingSubscriber class implementing IChainSubscriber 6-method interface | VERIFIED | 344 lines; `implements IChainSubscriber` at line 90; exports `SolanaIncomingSubscriber`, `SolanaHeartbeat`, `SolanaIncomingSubscriberConfig` |
| `packages/adapters/solana/src/__tests__/solana-incoming-subscriber.test.ts` | Unit tests with mock RPC, min 150 lines | VERIFIED | 587 lines; 19 tests all passing (5 parseSOL + 5 parseSPL + 6 subscriber + 3 heartbeat) |
| `packages/adapters/evm/src/evm-incoming-subscriber.ts` | EvmIncomingSubscriber class implementing IChainSubscriber 6-method interface + pollAll() | VERIFIED | 218 lines; `implements IChainSubscriber` at line 41; exports `EvmIncomingSubscriber` |
| `packages/adapters/evm/src/__tests__/evm-incoming-subscriber.test.ts` | Unit tests with mock viem client, min 150 lines | VERIFIED | 519 lines; 21 tests all passing |
| `packages/core/src/interfaces/connection-state.ts` | ConnectionState type, ReconnectConfig interface, calculateDelay, reconnectLoop, DEFAULT_RECONNECT_CONFIG | VERIFIED | 118 lines; exports all 5 required items |
| `packages/core/src/__tests__/connection-state.test.ts` | Unit tests for calculateDelay and reconnectLoop, min 80 lines | VERIFIED | 280 lines; 13 tests all passing |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `solana-incoming-subscriber.ts` | `@waiaas/core IChainSubscriber` | `implements IChainSubscriber` | WIRED | Line 90: `export class SolanaIncomingSubscriber implements IChainSubscriber` |
| `solana-incoming-subscriber.ts` | `incoming-tx-parser.ts` | `import parseSOLTransfer, parseSPLTransfers` | WIRED | Line 22-23: `import { parseSOLTransfer, parseSPLTransfers } from './incoming-tx-parser.js'` |
| `packages/adapters/solana/src/index.ts` | `solana-incoming-subscriber.ts` | barrel re-export | WIRED | Line 3-5: exports `SolanaIncomingSubscriber`, `SolanaHeartbeat`, `SolanaIncomingSubscriberConfig` |
| `evm-incoming-subscriber.ts` | `@waiaas/core IChainSubscriber` | `implements IChainSubscriber` | WIRED | Line 41: `export class EvmIncomingSubscriber implements IChainSubscriber` |
| `evm-incoming-subscriber.ts` | `viem` | `createPublicClient, http, parseAbiItem` | WIRED | Lines 17-23: `import { createPublicClient, http, parseAbiItem, type PublicClient, type Address } from 'viem'` |
| `packages/adapters/evm/src/index.ts` | `evm-incoming-subscriber.ts` | barrel re-export | WIRED | Line 3: `export { EvmIncomingSubscriber } from './evm-incoming-subscriber.js'` |
| `connection-state.ts` | `IChainSubscriber` (duck-typed) | `subscriber: { connect(): Promise<void>; waitForDisconnect(): Promise<void> }` | WIRED | Line 91: duck-typed subscriber param (avoids circular dep — intentional design) |
| `packages/core/src/interfaces/index.ts` | `connection-state.ts` | barrel re-export | WIRED | Lines 57-64: exports `ConnectionState`, `ReconnectConfig`, `calculateDelay`, `DEFAULT_RECONNECT_CONFIG`, `reconnectLoop` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| SUB-02 | 225-01 | SolanaIncomingSubscriber implements logsSubscribe({mentions}) + getTransaction(jsonParsed) for SOL/SPL/Token-2022 incoming detection | SATISFIED | `startWebSocketSubscription` uses `logsNotifications({ mentions: [address(addr)] })` + `getTransaction(..., { encoding: 'jsonParsed' })`; `parseSOLTransfer` and `parseSPLTransfers` handle all token types; 19 tests pass |
| SUB-03 | 225-02 | EvmIncomingSubscriber implements getLogs(Transfer event) + getBlock(includeTransactions:true) for ERC-20/native ETH incoming detection | SATISFIED | `pollERC20` uses `getLogs({ event: TRANSFER_EVENT, ... })`; `pollNativeETH` uses `getBlock({ blockNumber, includeTransactions: true })`; 21 tests pass |
| SUB-04 | 225-03 | WebSocket-to-polling automatic fallback with 3-state connection machine (WS_ACTIVE/POLLING_FALLBACK/RECONNECTING) | SATISFIED | `ConnectionState` type, `reconnectLoop` function, `calculateDelay` with exponential backoff, `DEFAULT_RECONNECT_CONFIG`; 13 tests pass |
| SUB-07 | 225-01 | Solana heartbeat ping (60s interval + jitter) prevents 10-minute inactivity timeout disconnection | SATISFIED | `SolanaHeartbeat` class with `INTERVAL_MS = 60_000`, `timer.unref()`, `getSlot()` ping; fake timer tests confirm 60s interval and timer replacement |

No orphaned requirements: all 4 requirement IDs from REQUIREMENTS.md (SUB-02, SUB-03, SUB-04, SUB-07) are claimed by plans and verified against codebase.

---

### Anti-Patterns Found

No blockers, warnings, or notable anti-patterns found.

Scan results:
- No TODO/FIXME/XXX/HACK/PLACEHOLDER comments in implementation files
- No `return null` stubs (only intentional parser nulls for "not an incoming transfer")
- No empty handler bodies — all handlers contain real logic
- No `console.log` placeholders (one `console.warn` in EVM pollAll is intentional error isolation)
- All `return new Promise(() => {})` usages are intentional design (EVM never-resolving waitForDisconnect, per design decision D-06)

---

### Human Verification Required

None. All truths are mechanically verifiable and confirmed. The subscribers are designed for mock RPC testing without real network calls, and all tests pass with mocked dependencies.

---

### Test Results Summary

| Test Suite | Tests | Passed | Failed |
|------------|-------|--------|--------|
| `solana-incoming-subscriber.test.ts` | 19 | 19 | 0 |
| `evm-incoming-subscriber.test.ts` | 21 | 21 | 0 |
| `connection-state.test.ts` | 13 | 13 | 0 |
| **Total** | **53** | **53** | **0** |

### Git Commits Verified

All commits documented in SUMMARYs exist in git history:

| Commit | Plan | Description |
|--------|------|-------------|
| `953323f` | 225-01 | feat: add SOL and SPL/Token-2022 incoming transfer parsers |
| `4eb612d` | 225-01 | feat: add SolanaIncomingSubscriber, SolanaHeartbeat, and 19 tests |
| `b508994` | 225-02 | feat: implement EvmIncomingSubscriber with ERC-20 and native ETH detection |
| `b5dc42a` | 225-02 | test: add comprehensive tests for EvmIncomingSubscriber |
| `a8ae1c9` | 225-02 | fix: TypeScript strict mode errors in subscriber tests |
| `7710287` | 225-03 | feat: add ConnectionState type, calculateDelay, and reconnectLoop |
| `bc4bcf9` | 225-03 | test: add unit tests for calculateDelay and reconnectLoop |

---

_Verified: 2026-02-22T00:36:00Z_
_Verifier: Claude (gsd-verifier)_
