# Domain Pitfalls: DeFi Protocol Integrations (m28-00 ~ m28-05)

**Domain:** DeFi protocol Action Providers for existing WAIaaS wallet system
**Researched:** 2026-02-23
**Confidence:** HIGH (official docs + existing codebase analysis + community findings)

---

## Critical Pitfalls

Mistakes that cause fund loss, security breaches, or require architectural rewrites.

---

### Pitfall 1: Jupiter API Version Drift (Quote Staleness + Endpoint Migration)

**What goes wrong:** Jupiter has migrated its API multiple times (v4 -> v6, and recently restructured from `lite-api.jup.ag` to `api.jup.ag` with new `/swap/v1/` prefix). The `feeAmount` and `feeMint` fields are being deprecated. Response schema changes silently break `ContractCallRequest` construction if not caught by runtime validation.

**Why it happens:** Jupiter evolves rapidly (Solana's largest DEX aggregator, $1B+ daily volume). API changes are communicated via blog/Discord but there is no formal deprecation window with versioned guarantees. The current `/swap/v1/quote` and `/swap-instructions` endpoints could reorganize at any time.

**Consequences:**
- Swap transactions fail silently or produce incorrect `instructionData`
- If Zod validation is missing or loose, malformed instructions get signed and submitted, wasting SOL on failed transactions
- On-chain state changes (partial fills, stuck approvals) are not recoverable

**Prevention:**
- **Strict Zod runtime validation on every API response** -- not just type checking, but field-level validation of `QuoteResponse` and `SwapInstructionsResponse` schemas. When Zod parse fails, raise `ACTION_API_ERROR` immediately rather than proceeding with partial data.
- **Version-pin the base URL** in config.toml (`api_base_url = "https://api.jup.ag/swap/v1"`) so endpoint path changes require explicit config updates rather than auto-following redirects.
- **Log the raw API response** on first-ever successful call and on any Zod validation failure, to enable forensic debugging of schema drift.
- **Nightly CI health check** (tagged `[HUMAN]`) that calls the real Jupiter Quote API with a known SOL/USDC pair and validates the response against the Zod schema.

**Detection:** Zod parse errors in `JupiterApiClient`, increasing `ACTION_API_ERROR` counts in audit logs, failed swap transactions with `InstructionError` on-chain.

**Phase:** m28-01 (Jupiter Swap implementation). Address during `JupiterApiClient` construction.

---

### Pitfall 2: MEV/Frontrunning Exposure -- Jito Fallback to Public Mempool

**What goes wrong:** When Jito block engine is unavailable or the tip is too low, the system falls back to standard RPC submission. Swap transactions sent through public Solana RPC are visible in the mempool and vulnerable to sandwich attacks (5-15% slippage extraction on large trades).

**Why it happens:** Jito tip infrastructure is not 100% available. The proposed fallback design (`JITO_FALLBACK` audit log) silently downgrades MEV protection. With ~95% of Solana validators running Jito client (as of 2025), minimum tip of 1000 lamports is usually sufficient, but during high-congestion periods validators may require higher tips. If `jito_block_engine_url` is not configured, all transactions go through public RPC by default.

**Consequences:**
- Sandwich bots front-run and back-run the swap, extracting value from the user
- User receives significantly fewer output tokens than quoted
- For AI agents making repeated swaps, the cumulative MEV extraction is substantial
- Trust erosion: user sees less output than the quote promised

**Prevention:**
- **Never silently fall back.** When Jito submission fails, set transaction status to `FAILED` with error code `JITO_UNAVAILABLE` rather than auto-falling back to public RPC. Let the caller retry or choose to proceed without MEV protection explicitly.
- **Configure `dynamicSlippage`** from Jupiter's API to automatically tighten slippage bounds, reducing sandwich profitability.
- **Enforce minimum tip validation** -- reject Jito tips below 1000 lamports (the protocol minimum) at config validation time, not at submission time.
- **Track Jito availability** -- if Jito fails 3 consecutive times, emit a `JITO_DEGRADED` notification and temporarily disable the provider until manual re-enable, rather than silently degrading all swaps.

**Detection:** `JITO_FALLBACK` entries in audit log, output token amounts consistently below quoted `outAmount`, high frequency of failed Jito submissions.

**Phase:** m28-01 (Jupiter Swap). Critical decision point in transaction submission path.

---

### Pitfall 3: 0x Permit2 Approval Flow Creates Double-Transaction Race Condition

**What goes wrong:** ERC-20 swaps through 0x require a Permit2 `approve` transaction before the swap transaction. The design calls for "2 independent pipeline executions" (approve + swap). If the approve transaction is submitted but not yet confirmed when the swap pipeline starts, the swap fails on-chain. Worse: if the approve confirms but the swap fails, the user has spent gas on approve for nothing.

**Why it happens:** The current 6-stage pipeline treats each transaction as independent. There is no "transaction chain" concept -- no way to express "execute B only after A confirms." The approve and swap run as separate `executeSend()` calls. Between approve confirmation and swap submission, the mempool state can change (another transaction from the same wallet, nonce collision).

**Consequences:**
- Swap fails with `INSUFFICIENT_ALLOWANCE` error on-chain after approve succeeds
- User pays gas for approve but gets no swap
- Nonce gap if approve and swap are submitted concurrently
- Policy engine evaluates approve and swap separately, potentially applying SPENDING_LIMIT to both the approve amount AND the swap amount (double-counting)

**Prevention:**
- **AllowanceHolder instead of Permit2 as default.** 0x explicitly recommends AllowanceHolder for most integrators because it requires only one signature/transaction and avoids the double-signature UX issue. Reserve Permit2 for advanced users who already have Permit2 allowances from other apps.
- **If Permit2 is required:** Implement a `TransactionChain` concept -- approve pipeline must reach CONFIRMED state before swap pipeline enters Stage 1. Use a simple state machine: `APPROVE_PENDING -> APPROVE_CONFIRMED -> SWAP_PENDING -> SWAP_CONFIRMED`.
- **Never allocate nonce for swap until approve is confirmed.** The existing design correctly defers nonce allocation to execution time (Stage 5), but ensure the swap pipeline does not enter Stage 5 until approve's `txHash` is confirmed.
- **Policy evaluation:** Count the approve as a $0 spending action (approval is not a spend). Only the swap amount should count against SPENDING_LIMIT.

**Detection:** Paired transactions where approve succeeds but swap fails, `INSUFFICIENT_ALLOWANCE` errors in audit log, nonce gaps on EVM wallets.

**Phase:** m28-02 (0x EVM Swap). Architecture decision required before implementation.

---

### Pitfall 4: Cross-Chain Bridge Fund Loss -- LI.FI "Limbo" State

**What goes wrong:** Cross-chain bridge transactions can enter an irrecoverable "limbo" state where funds have left the source chain but have not arrived on the destination chain. LI.FI's `/status` API may return `UNKNOWN` indefinitely. The proposed 30-minute polling window (60 attempts x 30s) expires, the system marks the transaction as `TIMEOUT`, but funds are still in transit through the bridge protocol.

**Why it happens:** Different bridges have vastly different finality times: Across (seconds), Stargate (minutes), Wormhole (15-20 minutes), some bridge paths can take hours during congestion. LI.FI aggregates 100+ bridges and cannot guarantee uniform completion times. Some bridges have their own failure/recovery mechanics that operate on timescales longer than the 30-minute polling window.

**Consequences:**
- User sees `TIMEOUT` status but funds eventually arrive (false negative)
- User sees `TIMEOUT` and initiates a recovery/refund, but funds arrive on destination simultaneously (double-spend risk at application layer)
- Funds genuinely stuck in bridge contract with no automatic refund
- `SPENDING_LIMIT` reservations for timed-out transactions are released, but funds are actually in limbo (policy accounting mismatch)

**Prevention:**
- **Extend maximum polling to 2 hours minimum** for cross-chain bridges. The 30-minute window is too aggressive for Wormhole and similar bridges during congestion. Use `status_poll_max_attempts = 240` (2 hours at 30s intervals).
- **Never auto-cancel on timeout.** Instead, transition to `BRIDGE_MONITORING` status (not CANCELLED/FAILED). Keep polling at reduced frequency (every 5 minutes) for up to 24 hours. Only mark as `BRIDGE_STALE` after 24 hours, requiring manual intervention.
- **Persist bridge tracking data:** Store LI.FI's `tool` (bridge name), `transactionId`, source chain tx hash, and destination chain tx hash in the `bridge_status` column or a related field. This data is essential for manual recovery via LI.FI support.
- **Do not release SPENDING_LIMIT reservation until bridge is confirmed COMPLETED or REFUNDED.** For TIMEOUT/BRIDGE_STALE states, keep the reservation active to prevent over-spending.
- **Surface LI.FI's refund mechanism:** Some bridges (cBridge) require user-initiated refund. Include refund instructions in the TIMEOUT notification.

**Detection:** Transactions stuck in `BRIDGE_MONITORING` for > 2 hours, LI.FI `/status` returning `UNKNOWN` persistently, mismatch between source chain debit and destination chain credit.

**Phase:** m28-03 (LI.FI Bridge). Must be addressed in `AsyncStatusTracker` and state machine design.

---

### Pitfall 5: stETH Rebase Token Breaks Balance Tracking and Policy Evaluation

**What goes wrong:** stETH is a rebasing token -- its balance increases daily without any transfer event. The wallet's cached balance becomes stale within 24 hours. Worse, `transferFrom(amount)` can leave 1-2 wei on the sender due to integer division rounding in share-to-balance conversion. The policy engine's `SPENDING_LIMIT` evaluation uses a point-in-time balance that may be inaccurate.

**Why it happens:** stETH internally tracks "shares" (which are stable) but exposes balances in ETH terms (which change on rebase). The conversion `shares -> ETH balance` involves integer division: `balance = shares * totalPooledEther / totalShares`. This division loses precision (1-2 wei). When you call `transfer(fullBalance)`, the shares transferred may represent `fullBalance - 1 wei` in ETH terms.

**Consequences:**
- "Transfer all stETH" operations leave dust (1-2 wei) -- confusing UX
- Balance displayed in Admin UI becomes stale/incorrect between rebases
- `SPENDING_LIMIT` evaluation on stETH staking operations may use incorrect balance
- Cross-chain bridging of stETH strips rebase benefits (stETH bridged to L2 stops rebasing)
- Staking position reporting (`GET /v1/wallets/:id/staking`) shows incorrect yields

**Prevention:**
- **Use wstETH (wrapped stETH) for all internal operations.** wstETH is non-rebasing and value-accruing. Balance is stable between transactions. The conversion stETH<->wstETH is trivial. This eliminates ALL rebase-related issues at the cost of one extra wrap/unwrap step.
- **If stETH is used directly:** Track in shares, not balances. Use `getSharesByPooledEth()` and `getPooledEthByShares()` for all conversions. Never cache stETH balance for > 1 minute.
- **For "transfer all" operations:** Use `transferShares()` instead of `transfer()` to avoid the 1-2 wei rounding issue. V2 Lido introduced `transferSharesFrom()` for this purpose.
- **Exclude rebase gains from SPENDING_LIMIT:** Rebase increases are yield, not new deposits. The policy engine should not count rebase increases when evaluating staking position changes.

**Detection:** 1-2 wei dust remaining after "transfer all" operations, staking position amounts that drift from expected values, Admin UI balance inconsistencies.

**Phase:** m28-04 (Liquid Staking). Architecture decision: wstETH vs stETH must be settled before implementation.

---

### Pitfall 6: Gas Condition Nonce Starvation and Pipeline Stall

**What goes wrong:** When a wallet has multiple transactions in `GAS_WAITING` state plus normal transactions being submitted, the normal transactions consume nonces that were "expected" by the gas-waiting transactions. When gas conditions are finally met, the deferred transaction's context is stale -- other transactions have been submitted in the meantime, changing the wallet's nonce sequence.

**Why it happens:** The design correctly states "nonce is assigned at execution time, not at wait entry." However, the interaction between gas-waiting transactions and normal transactions on the same wallet is complex. If 3 gas-waiting transactions + 2 normal transactions are all pending for the same wallet, the normal transactions will take nonces N and N+1. When gas-waiting transaction 1 resumes, it gets nonce N+2, which is correct. But if gas-waiting transaction 1 was a swap whose quote has expired (calldata is stale), the transaction will fail on-chain at nonce N+2, creating a nonce gap that blocks gas-waiting transactions 2 and 3.

**Consequences:**
- Stale calldata: DeFi API quotes have 30-second TTL. A transaction waiting hours for gas conditions will have expired calldata
- Nonce gaps on EVM chains block subsequent transactions
- Wallet becomes "stuck" -- all pending transactions fail because of a single stale gas-waiting transaction
- `max_pending_count` of 100 can be exhausted, blocking all new conditional transactions

**Prevention:**
- **Re-resolve calldata when gas condition is met.** For ActionProvider-originated transactions (`CONTRACT_CALL` from swap/bridge), the `GasConditionWorker` must re-call `resolve()` with fresh parameters when resuming execution. Store the original `ActionProvider` name and input params alongside the gas condition, not just the stale calldata.
- **Per-wallet gas-waiting limit:** Limit gas-waiting transactions per wallet (e.g., 5) rather than only a global limit (100). One wallet with 100 gas-waiting transactions would monopolize the worker.
- **Quote expiry detection:** Before resuming a gas-waiting transaction, check if the original quote has expired. If `Date.now() - quoteTimestamp > quoteTTL`, re-quote. If re-quoting fails, cancel the transaction with `QUOTE_EXPIRED` error.
- **EVM nonce sequencing:** When multiple gas-waiting transactions resume simultaneously for the same wallet, process them sequentially (not in parallel) to avoid nonce conflicts. Use a per-wallet lock during the `GAS_WAITING -> QUEUED` transition.

**Detection:** Transactions failing immediately after gas condition met (stale calldata), nonce gap errors in audit log, wallets with high `GAS_WAITING` count but no successful executions.

**Phase:** m28-05 (Gas Conditional Execution). Core design challenge.

---

### Pitfall 7: Cross-Chain Policy Evaluation Gap -- Destination Chain Not Evaluated

**What goes wrong:** The design specifies "evaluate using source chain wallet's policy (where funds leave)." But the destination address on the destination chain is not validated against ANY policy. An AI agent could bridge funds to an arbitrary address on the destination chain that is not owned by the wallet system, effectively bypassing the policy engine for fund extraction.

**Why it happens:** The policy engine evaluates `CONTRACT_WHITELIST` and `SPENDING_LIMIT` on the source chain transaction only. The bridge contract on the source chain is the `to` address for the policy engine. The actual destination (recipient on the destination chain) is embedded deep inside the bridge calldata, invisible to the current policy evaluation pipeline.

**Consequences:**
- Funds bridged to attacker-controlled address on destination chain
- Policy engine sees: "source wallet -> bridge contract (whitelisted)" = ALLOW
- But actual flow is: "source wallet -> bridge -> attacker on destination chain"
- Complete bypass of address whitelisting on the destination side

**Prevention:**
- **Extract and validate destination address from LI.FI quote response.** The LI.FI `/quote` response includes `toAddress` field. The `LiFiActionProvider.resolve()` must extract this and validate it against the wallet system -- the destination address MUST be a wallet owned by the same Owner, or explicitly whitelisted in a new `BRIDGE_DESTINATION_WHITELIST` policy.
- **Default: self-bridge only.** By default, cross-chain bridges should only allow sending to the Owner's own wallet on the destination chain. The destination address should be auto-populated from the Owner's wallet registry, not from user input.
- **If arbitrary destination is needed:** Require APPROVAL-tier authorization for any bridge where `toAddress` is not a known wallet of the same Owner.

**Detection:** Bridge transactions where destination address does not match any wallet in the system, audit log entries showing bridge to unknown addresses.

**Phase:** m28-03 (LI.FI Bridge). Policy design must be extended before implementation.

---

## Moderate Pitfalls

Mistakes that cause degraded UX, wasted resources, or require significant rework.

---

### Pitfall 8: Slippage Unit Confusion Across Providers

**What goes wrong:** Jupiter uses basis points (bps, integer: 50 = 0.5%), 0x uses percentage (decimal: 0.01 = 1%), LI.FI uses percentage (decimal: 0.03 = 3%). Mixing these units in config, API calls, or user-facing parameters causes either excessive slippage (user loses money) or insufficient slippage (transactions fail).

**Why it happens:** The m28-00 design correctly identifies this ("API native unit: bps/pct") but the risk is in the implementation. A developer implementing `0x_swap` after `jupiter_swap` may copy-paste the slippage clamping logic without converting units. Config keys use `_bps` and `_pct` suffixes, but a typo or omission causes silent misconfiguration.

**Consequences:**
- `default_slippage_bps = 50` (0.5%) accidentally passed to 0x API as `slippagePercentage = 50` (5000%) = instant MEV extraction
- `default_slippage_pct = 0.01` (1%) accidentally passed to Jupiter as `slippageBps = 0.01` (0.01 bps = 0.0001%) = every swap fails
- User specifies slippage in one unit, system interprets in another

**Prevention:**
- **Type-safe slippage types:** Define `SlippageBps` and `SlippagePct` as branded types (e.g., `type SlippageBps = number & { __brand: 'bps' }`). Conversion functions `bpsToSlippagePct()` and `pctToSlippageBps()` are the ONLY way to convert. This makes unit confusion a compile-time error.
- **Validation bounds at config parse time:** Jupiter: `default_slippage_bps` must be 1-10000 (integer). 0x/LI.FI: `default_slippage_pct` must be 0.001-1.0 (decimal). Reject out-of-range values at config.toml loading, not at API call time.
- **Centralized test:** A single test file that verifies each provider's `resolve()` passes the correct slippage unit to its respective API.

**Phase:** m28-00 (common design). Foundational, affects all providers.

---

### Pitfall 9: 0x API Key Management -- Leaking Keys in Logs/Responses

**What goes wrong:** 0x requires an API key sent as `0x-api-key` header. If the API client logs request headers for debugging (common pattern), the key appears in log files. If the config.toml is committed to git, the key is exposed. Unlike Jupiter (key optional) and LI.FI (key optional), 0x cannot function without a key.

**Why it happens:** The existing WAIaaS pattern stores secrets in config.toml (e.g., `master_password_hash`). But `master_password_hash` is a hash, not a plaintext secret. API keys are plaintext secrets that should never appear in logs. The existing `WAIAAS_{SECTION}_{KEY}` env var pattern supports overriding config with environment variables, but this must be documented and enforced.

**Consequences:**
- API key leaked via log files accessible to debug sessions
- API key committed to version control via config.toml
- If key is rate-limited or revoked by 0x, all EVM swaps fail with no clear error
- Shared key across environments (dev/staging/prod) causes rate limit exhaustion

**Prevention:**
- **Redact API keys in all log output.** The `ZeroExApiClient` logger must never log the `0x-api-key` header value. Implement a header redaction function that replaces sensitive headers with `[REDACTED]`.
- **Environment variable first:** Document that `WAIAAS_ACTIONS_0X_SWAP_API_KEY` env var is the preferred way to provide the key. Config.toml should contain only a placeholder comment (`# api_key = ""`).
- **Admin Settings integration:** Expose the API key field in Admin Settings > Actions with password-type input (masked). Store encrypted (existing master password encryption).
- **Startup validation:** On daemon start, if `0x_swap.enabled = true` but `api_key` is empty, log a clear error message with instructions and disable the provider (not crash).

**Phase:** m28-02 (0x EVM Swap). Must be addressed during `ZeroExApiClient` implementation.

---

### Pitfall 10: External API Timeout Cascading into Pipeline Timeout

**What goes wrong:** The pipeline's Stage 5 has its own timeout (e.g., 30 seconds for RPC submission). DeFi provider `resolve()` calls external APIs (Jupiter, 0x, LI.FI) with 10-15 second timeouts. If the external API is slow, `resolve()` consumes most of the stage timeout budget, leaving insufficient time for the actual on-chain submission. The pipeline times out, but the state is ambiguous: did the transaction get submitted?

**Why it happens:** `resolve()` is called before Stage 5 (it generates the `ContractCallRequest`), but the combined time of `resolve()` + gas estimation + signing + submission can exceed the pipeline's total time budget. The external API timeout (10-15s) and the pipeline stage timeouts are not coordinated.

**Consequences:**
- Intermittent pipeline failures during DeFi API congestion periods
- Hard to debug: the timeout appears as a pipeline failure, not an API latency issue
- If the transaction was actually submitted before the pipeline timeout triggered, the system marks it FAILED but it may succeed on-chain (state mismatch)

**Prevention:**
- **Separate the timeout budgets explicitly.** `resolve()` has its own `AbortController` timeout (10s). Stage 5 execution has its own timeout (30s). These are independent, not nested. The total operation time is `resolve_time + stage5_time`, and this should be documented.
- **resolve() is called BEFORE entering the pipeline stages.** The ActionProvider route handler (`POST /v1/actions/:provider/:action`) should call `resolve()` first, obtain the `ContractCallRequest`, then pass it to `executeSend()`. This way, `resolve()` timeout does not eat into pipeline timeout.
- **If resolve() times out, do not enter the pipeline at all.** Return `ACTION_API_TIMEOUT` immediately. The pipeline is never started, so there is no ambiguous state.

**Phase:** m28-00 (common design). Verify in `actions.ts` route handler.

---

### Pitfall 11: Jito Stake Pool Exchange Rate Stale at Epoch Boundary

**What goes wrong:** Jito's SOL:JitoSOL exchange rate changes at epoch boundaries (~every 2 days on Solana). If a stake operation is submitted near an epoch boundary, the quoted JitoSOL amount may differ from the actual amount received because the epoch transitioned between quote and execution. The user sees "Expected: 9.85 JitoSOL, Received: 9.82 JitoSOL" with no explanation.

**Why it happens:** Jito rewards (staking + MEV) are finalized at epoch close. The exchange rate during the current epoch reports `mev_rewards = 0` because rewards settle at epoch boundary. The rate snapped to a new value at epoch transition, but the quote was calculated with the pre-transition rate.

**Consequences:**
- Unexpected slippage on staking operations (usually small, < 0.5%)
- Confusing UX: "why did I get fewer JitoSOL than quoted?"
- If the system enforces strict amount matching, transactions appear as "partially filled"

**Prevention:**
- **Do not promise exact JitoSOL output.** The staking response should include `estimatedOutput` with a note: "actual amount may vary by up to 0.5% due to epoch boundary rate changes."
- **Accept 0.5% tolerance on JitoSOL received vs quoted.** This is inherent to the Stake Pool mechanism and not indicative of an error.
- **Detect epoch boundary proximity:** If current slot is within 1000 slots of epoch boundary (detectable via RPC `getEpochInfo()`), add a warning to the quote: "epoch transition imminent, rate may change."

**Phase:** m28-04 (Jito Staking). Address during `JitoStakeHelper` implementation.

---

### Pitfall 12: Lido Unstake Withdrawal Queue Duration Underestimated

**What goes wrong:** The design states "Lido unstake: 1-5 days." In practice, the Lido Withdrawal Queue duration depends on the Ethereum validator exit queue length, which can be significantly longer during mass-exit events. During the Shapella upgrade (April 2023), some withdrawals took 2+ weeks. The `AsyncStatusTracker` with 288 polling attempts (24 hours at 5-minute intervals) would time out long before the withdrawal completes.

**Why it happens:** Lido's Withdrawal Queue is a two-step process: (1) `requestWithdrawals()` creates a withdrawal request NFT, (2) the request is fulfilled when enough ETH is available from exiting validators. Step 2 duration is unpredictable and depends on Ethereum protocol-level validator exit queues.

**Consequences:**
- System marks unstake as `TIMEOUT` while it's still legitimately pending
- User panics and contacts support
- SPENDING_LIMIT reservation released prematurely, accounting error

**Prevention:**
- **Extend unstake polling to 14 days minimum:** `unstake_poll_max_attempts = 4032` (14 days at 5-minute intervals). Lido provides `isFinalized()` check on the withdrawal request NFT -- poll until finalized, not on a fixed timer.
- **Use Lido's withdrawal status API** rather than generic timer-based polling. Check `WithdrawalQueueERC721.getWithdrawalStatus()` for the specific request ID.
- **Display estimated wait time from Lido:** Lido's API provides estimated withdrawal time based on current queue length. Surface this to the user at request time.
- **Do not release SPENDING_LIMIT reservation for unstake until COMPLETED.** Unstaked ETH is still the user's asset in the protocol.

**Phase:** m28-04 (Lido Staking). Design `AsyncStatusTracker` polling parameters.

---

### Pitfall 13: CONTRACT_WHITELIST Fragmentation Across DeFi Providers

**What goes wrong:** Each DeFi provider requires different contract addresses whitelisted: Jupiter (program address), 0x (ExchangeProxy per chain + AllowanceHolder + Permit2), LI.FI (router per chain), Lido (stETH + WithdrawalQueue), Jito (Stake Pool program). An Owner must manually whitelist each address on each chain. Forgetting one address causes the policy engine to reject transactions with an unhelpful "CONTRACT_WHITELIST violation" error.

**Why it happens:** The default-deny policy is correct for security, but DeFi integration multiplies the number of required whitelist entries exponentially. 0x alone requires different ExchangeProxy addresses on 19+ chains. An Owner setting up "EVM swaps on Ethereum, Base, and Arbitrum" must whitelist 6+ addresses (2 per chain: ExchangeProxy + AllowanceHolder).

**Consequences:**
- First-time DeFi users hit a wall of policy rejections
- AI agents receive cryptic "POLICY_VIOLATION" errors with no guidance on which address to whitelist
- Admin UI provides no DeFi-specific whitelist management
- Typos in contract addresses create security holes (whitelisting a malicious contract)

**Prevention:**
- **Provider-managed whitelist bundles.** Each ActionProvider should declare its required contract addresses per chain. When an Owner enables a provider (e.g., `0x_swap`), the system should offer to auto-populate CONTRACT_WHITELIST with the provider's known-good addresses.
- **Hardcode canonical addresses.** Jupiter's program address, 0x's ExchangeProxy per chain, LI.FI's router per chain -- these are immutable or version-managed by the protocols. Store them in the provider's `config.ts` and surface them in Admin UI.
- **Error messages must include resolution.** Instead of "CONTRACT_WHITELIST violation for 0xDef1C0ded9bec7F1a1670819833240f027b25EfF", show "CONTRACT_WHITELIST violation: 0x ExchangeProxy on Ethereum is not whitelisted. Enable it in Admin > Policies > Contract Whitelist, or enable the 0x_swap provider bundle."
- **Audit known addresses on provider registration.** When a provider registers, validate that its declared addresses match the canonical on-chain contract addresses (could verify via RPC code check).

**Phase:** m28-00 (common design) + m28-01 through m28-04 (each provider declares its whitelist bundle).

---

### Pitfall 14: RPC Failure During Gas Condition Polling Creates Cascading Timeouts

**What goes wrong:** The `GasConditionWorker` polls gas prices every 30 seconds for up to 100 pending transactions. If the RPC node is temporarily unavailable (common with Solana and some EVM RPC providers), ALL gas condition evaluations fail simultaneously. After 3 consecutive failures, the system emits alerts. But during the outage, timeout clocks on all 100 transactions continue ticking, and many may time out and be cancelled even though gas prices might be favorable.

**Why it happens:** The design uses a single RPC call per poll cycle to check gas prices (efficient for batch evaluation). But this creates a single point of failure -- one RPC outage affects all gas-waiting transactions. The timeout clock does not pause during RPC outages.

**Consequences:**
- Mass cancellation of gas-waiting transactions during transient RPC outage
- User submitted transactions during a good gas window, but RPC outage during that window caused them to miss it
- False timeout: transaction marked CANCELLED because the system could not check gas, not because gas was actually too high

**Prevention:**
- **Pause timeout clock during RPC failures.** Track `effectiveWaitTime` (time when gas was actually checked) separately from wall-clock time. Only count successful polling intervals toward the timeout.
- **Multiple RPC fallback for gas queries.** Use the existing RPC failover mechanism (if available) for gas price queries. Gas price checking is a read-only, idempotent operation safe to retry on alternate RPCs.
- **Exponential backoff on RPC failure** instead of fixed 30-second interval. After RPC failure: 30s -> 60s -> 120s -> cap at 300s. Resume 30s interval after successful query.
- **Do not cancel transactions during RPC outage.** If consecutive RPC failures prevent gas evaluation, extend the timeout proportionally. Alert the operator, but do not auto-cancel.

**Phase:** m28-05 (Gas Conditional Execution). Address in `GasConditionWorker` design.

---

## Minor Pitfalls

Issues that cause inconvenience, confusion, or minor waste but are recoverable.

---

### Pitfall 15: Jupiter Versioned Transaction Compatibility

**What goes wrong:** Jupiter's `/swap-instructions` endpoint returns instructions designed for Versioned Transactions (v0) with Address Lookup Tables. If the existing `SolanaAdapter.buildTransaction()` builds legacy transactions, Jupiter instructions may exceed the transaction size limit (1232 bytes) for complex multi-hop routes.

**Prevention:** Ensure `SolanaAdapter` supports Versioned Transactions (v0). Jupiter's response includes `addressLookupTableAddresses` that must be resolved and included in the `VersionedTransaction`. If legacy-only, pass `asLegacyTransaction=true` to the quote endpoint, but accept that some routes will be unavailable.

**Phase:** m28-01 (Jupiter Swap). Verify `SolanaAdapter` capabilities before implementation.

---

### Pitfall 16: 0x Chain-Specific Endpoint Routing Maintenance Burden

**What goes wrong:** 0x Swap API v2 uses the same endpoint (`api.0x.org`) with `chainId` as a query parameter. However, some documentation and older integrations reference chain-specific subdomains (e.g., `base.api.0x.org`). Using the wrong routing scheme causes 404 errors or incorrect chain responses.

**Prevention:** Use the v2 unified endpoint (`api.0x.org`) with `chainId` parameter exclusively. Do not implement chain-specific subdomain routing. Maintain a `chainId` mapping from WAIaaS chain identifiers to 0x-supported chain IDs, and validate against 0x's supported chain list at startup.

**Phase:** m28-02 (0x EVM Swap).

---

### Pitfall 17: LI.FI Quote Caching Creates Stale Cross-Chain Routes

**What goes wrong:** The design proposes 30-second quote TTL cache. Cross-chain routes involve bridge liquidity that can change rapidly. A cached quote may reference a bridge that has depleted liquidity, causing the transaction to fail. Cross-chain quotes are fundamentally less cacheable than single-chain swap quotes because they depend on bridge pool states across two chains.

**Prevention:** Do not cache LI.FI cross-chain quotes. Every `resolve()` call should fetch a fresh quote. Cache only the LI.FI `/chains` and `/tokens` metadata responses (5-minute TTL), not quotes. The 15-second API timeout is the cost of freshness.

**Phase:** m28-03 (LI.FI Bridge).

---

### Pitfall 18: Staking Position Display Without Real-Time Price Oracle

**What goes wrong:** `GET /v1/wallets/:id/staking` is designed to show stETH/JitoSOL positions with USD values and APY. But if the price oracle (CoinGecko) rate-limits or has no price for stETH/JitoSOL, the position display shows `$0.00` or errors. Unlike SOL/ETH which always have oracle prices, LST prices may be missing from free-tier CoinGecko.

**Prevention:** For LST tokens (stETH, JitoSOL), calculate USD value from the exchange rate to the base asset (stETH:ETH ratio, JitoSOL:SOL ratio) multiplied by the base asset's USD price, rather than relying on a direct LST:USD oracle price. This is more reliable and always available because ETH and SOL always have oracle prices.

**Phase:** m28-04 (Liquid Staking). Staking position API implementation.

---

### Pitfall 19: Admin Settings Hot-Reload Race with Active Transactions

**What goes wrong:** DeFi settings (slippage defaults, API keys, gas condition parameters) are runtime-adjustable via Admin Settings. If an admin changes `default_slippage_bps` from 50 to 200 while a Jupiter swap's `resolve()` is in progress, the transaction uses the old value for the quote but the new value may be used for validation, causing a mismatch.

**Prevention:** Snapshot settings at the start of `resolve()`. Use the snapshotted values throughout the entire resolve + pipeline execution. Never read settings mid-pipeline from the live SettingsService.

**Phase:** m28-00 (common design). Foundational pattern for all providers.

---

### Pitfall 20: SQLite Contention During High-Frequency Polling

**What goes wrong:** The `GasConditionWorker` (30s polling for 100 transactions) + `AsyncStatusTracker` for bridges (30s polling for active bridges) + `AsyncStatusTracker` for unstakes (5min polling) all run concurrently with normal transaction pipeline operations. SQLite is single-writer. High polling frequency combined with transaction writes can cause `SQLITE_BUSY` errors.

**Prevention:** Use WAL (Write-Ahead Logging) mode for SQLite (likely already enabled). Batch gas condition evaluations into a single read query + single write query per poll cycle (not 100 individual read-write pairs). Use `beginTransaction()` / `commit()` for batch state updates. Keep read operations outside of write transactions.

**Phase:** m28-05 (Gas Conditional Execution) + m28-03 (Bridge Status Tracking). Verify SQLite concurrency model.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| m28-00 Common Design | Slippage unit confusion across providers (P8) | Moderate | Branded types for SlippageBps/SlippagePct |
| m28-00 Common Design | Settings hot-reload race (P19) | Minor | Snapshot settings at resolve() start |
| m28-00 Common Design | Timeout budget not separated (P10) | Moderate | resolve() before pipeline entry |
| m28-01 Jupiter Swap | API version drift (P1) | Critical | Strict Zod validation, version-pinned URL |
| m28-01 Jupiter Swap | Jito fallback to public mempool (P2) | Critical | Fail-closed, no silent fallback |
| m28-01 Jupiter Swap | Versioned transaction support (P15) | Minor | Verify SolanaAdapter capabilities |
| m28-02 0x EVM Swap | Permit2 double-transaction race (P3) | Critical | AllowanceHolder default, or TransactionChain |
| m28-02 0x EVM Swap | API key leak in logs (P9) | Moderate | Header redaction, env var preference |
| m28-02 0x EVM Swap | Chain endpoint routing (P16) | Minor | Use v2 unified endpoint with chainId |
| m28-03 LI.FI Bridge | Fund loss in bridge limbo (P4) | Critical | Extended polling, never auto-cancel |
| m28-03 LI.FI Bridge | Destination address not validated (P7) | Critical | Extract and validate toAddress from quote |
| m28-03 LI.FI Bridge | Stale cached quotes (P17) | Minor | Do not cache cross-chain quotes |
| m28-04 Lido Staking | stETH rebase breaks balance tracking (P5) | Critical | Use wstETH or track shares |
| m28-04 Lido Staking | Unstake duration underestimated (P12) | Moderate | 14-day polling, use Lido status API |
| m28-04 Jito Staking | Exchange rate stale at epoch boundary (P11) | Moderate | 0.5% tolerance, epoch proximity warning |
| m28-04 Staking | LST price oracle missing (P18) | Minor | Calculate from base asset exchange rate |
| m28-05 Gas Condition | Nonce starvation from stale calldata (P6) | Critical | Re-resolve calldata on gas condition met |
| m28-05 Gas Condition | RPC failure cascading timeouts (P14) | Moderate | Pause timeout clock during RPC outage |
| m28-05 Gas Condition | SQLite contention from polling (P20) | Minor | Batch queries, WAL mode |
| All (m28-01~04) | CONTRACT_WHITELIST fragmentation (P13) | Moderate | Provider-managed whitelist bundles |

---

## Security-Specific Warnings

### DeFi Attack Surface Expansion

Adding DeFi protocols dramatically expands the attack surface. Key security considerations:

| Attack Vector | Affected Component | Risk | Mitigation |
|--------------|-------------------|------|------------|
| Sandwich attack (MEV) | Jupiter, 0x swaps | Fund extraction 5-15% | Jito MEV protection (Solana), Flashbots Protect or MEV Blocker (EVM), tight slippage |
| Malicious quote injection | All API clients | Calldata manipulation | Zod schema validation on every response, HTTPS + certificate pinning |
| Bridge destination hijack | LI.FI bridge | Complete fund redirection | Validate destination address against wallet registry (P7) |
| Unlimited token approval | 0x Permit2/AllowanceHolder | Drain via approved contract | Exact-amount approvals only, never infinite. Verify `APPROVED_SPENDERS` policy coverage |
| Stale oracle price manipulation | Spending limit evaluation | Policy bypass | Use multiple price sources, reject transactions when oracle is stale (> 5 min) |
| Gas condition as DoS vector | GasConditionWorker | Resource exhaustion | Per-wallet limits, `max_pending_count`, timeout budget |

### API Key Security Matrix

| Provider | Key Required | Key in Header | Risk | Handling |
|----------|-------------|---------------|------|----------|
| Jupiter | Optional | Query param | Low | Env var, redact in logs |
| 0x | Required | `0x-api-key` header | High | Env var mandatory, encrypted in Admin Settings |
| LI.FI | Optional | `x-lifi-api-key` header | Low | Env var, redact in logs |
| Lido | None (on-chain) | N/A | None | N/A |
| Jito | None (on-chain) | N/A | None | N/A |

---

## Sources

### Official Documentation
- [Jupiter Developer Docs - Swap API](https://dev.jup.ag/docs/swap-api/build-swap-transaction) -- HIGH confidence
- [Jupiter Updates](https://dev.jup.ag/updates) -- HIGH confidence
- [0x Swap API Troubleshooting](https://0x.org/docs/0x-swap-api/guides/troubleshooting-swap-api) -- HIGH confidence
- [0x Upgrading to Swap API v2](https://0x.org/docs/upgrading/upgrading_to_swap_v2) -- HIGH confidence
- [0x AllowanceHolder vs Permit2](https://0x.org/docs/0x-swap-api/guides/swap-tokens-with-0x-swap-api) -- HIGH confidence
- [0x Contracts: Settler, AllowanceHolder & Permit2](https://0x.org/docs/developer-resources/core-concepts/contracts) -- HIGH confidence
- [LI.FI - Can funds get locked up?](https://help.li.fi/hc/en-us/articles/10980935994779-Can-funds-get-locked-up-forever-or-lost) -- HIGH confidence
- [LI.FI - Bridge issues overview](https://help.li.fi/hc/en-us/articles/11158338772251-What-are-the-issues-we-might-face-with-each-of-the-bridges-What-can-possibly-go-wrong) -- HIGH confidence
- [Lido Tokens Integration Guide](https://docs.lido.fi/guides/lido-tokens-integration-guide/) -- HIGH confidence
- [Lido stETH/wstETH Integration Guide](https://docs.lido.fi/guides/steth-integration-guide/) -- HIGH confidence
- [stETH 1-2 wei rounding issue](https://github.com/lidofinance/core/issues/442) -- HIGH confidence
- [Jito Technical FAQs](https://www.jito.network/docs/jitosol/faqs/technical-faqs/) -- HIGH confidence
- [Jito Unstaking Overview](https://www.jito.network/docs/jitosol/get-started/unstaking-jitosol-flow/unstaking-overview/) -- HIGH confidence

### Community / Secondary Sources
- [Jito Labs Documentation](https://docs.jito.wtf/lowlatencytxnsend/) -- MEDIUM confidence
- [QuickNode - Jupiter Landing Rate Tips](https://www.quicknode.com/docs/solana/jupiter-transactions) -- MEDIUM confidence
- [QuickNode - Nonce Management](https://www.quicknode.com/guides/ethereum-development/transactions/how-to-manage-nonces-with-ethereum-transactions) -- MEDIUM confidence
- [Uniswap Blog - MEV Protection](https://blog.uniswap.org/mev-protection) -- MEDIUM confidence
- [Blocknative - MEV Protection](https://www.blocknative.com/blog/mev-protection-sandwiching-frontrunning-bots) -- MEDIUM confidence

### Codebase Analysis
- `packages/core/src/interfaces/action-provider.types.ts` -- IActionProvider interface, resolve() contract
- `packages/core/src/schemas/transaction.schema.ts` -- ContractCallRequest schema (EVM + Solana fields)
- `packages/daemon/src/pipeline/stages.ts` -- 6-stage pipeline, nonce assignment at Stage 5
- `packages/daemon/src/pipeline/database-policy-engine.ts` -- CONTRACT_WHITELIST, SPENDING_LIMIT evaluation
- `packages/daemon/src/infrastructure/action/action-provider-registry.ts` -- Re-validation after resolve()
- Milestone objectives: m28-00 through m28-05 design documents
