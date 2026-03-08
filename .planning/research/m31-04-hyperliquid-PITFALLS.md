# Domain Pitfalls: Hyperliquid Ecosystem Integration

**Domain:** Hyperliquid DEX (Perp/Spot) + HyperEVM + Sub-accounts integration into WAIaaS
**Researched:** 2026-03-08

---

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Two Signing Schemes Confusion (L1 Action vs User-Signed Action)

**What goes wrong:** Hyperliquid uses TWO distinct EIP-712 signing schemes, not one. Trading operations (orders, leverage changes) use "L1 Action" signing with a **phantom agent** abstraction, while administrative operations (transfers, withdrawals, agent approval) use "User-Signed Action" signing with a different EIP-712 domain. Treating them as one scheme produces invalid signatures for one or both categories.

**Why it happens:** Developers see "EIP-712 signing" in the docs and assume a single domain/flow. The existing WAIaaS `EvmAdapter.signTypedData` handles generic EIP-712, but the phantom agent construction for L1 actions requires: (1) normalizing the action, (2) msgpack encoding with specific field ordering, (3) appending nonce + vault address, (4) keccak256 hashing to derive the phantom agent. This is NOT standard EIP-712 -- it is a custom protocol layered on top.

**Consequences:**
- All order placement/cancellation/modification fails silently or returns cryptic signature errors
- Administrative operations (sub-account transfers, withdrawals) fail if phantom agent signing is used
- Debugging is extremely difficult because the error messages from Hyperliquid API are not descriptive about signing scheme mismatch

**Prevention:**
- Implement `HyperliquidSigner` as a dedicated class with explicit `signL1Action(action, nonce, vaultAddress?)` and `signUserSignedAction(action, nonce)` methods
- L1 Action domain: constructed from phantom agent hash (NOT a static domain)
- User-Signed Action domain: `{ name: "HyperliquidSignTransaction", version: "1", chainId: 0x66eee (421614), verifyingContract: 0x0000...0000 }`
- Map each exchange API action to its correct signing scheme at the type level (TypeScript discriminated union)
- Reference: The Python SDK's `sign_l1_action` and `sign_user_signed_action` are two separate code paths for a reason

**Detection:** Unit tests that verify signatures against known-good test vectors from the official Python SDK's `signing_test.py`. Any signature mismatch = wrong scheme being used.

**Phase to address:** Phase 2 (Design) must document both schemes. Phase 3 must implement `HyperliquidSigner` as the first deliverable before any exchange operations.

---

### Pitfall 2: Forcing API-Based Trades into the 6-Stage Pipeline

**What goes wrong:** WAIaaS's 6-stage pipeline (Validate -> Policy -> Delay -> Approve -> Execute -> Record) is designed for on-chain transactions. Drift perp integration works because Drift produces Solana instructions that flow through the pipeline as `CONTRACT_CALL` requests. Hyperliquid L1 DEX trades are NOT on-chain transactions -- they are EIP-712 signatures submitted via REST API to `api.hyperliquid.xyz/exchange`. Forcing these into the existing pipeline creates an impedance mismatch that breaks Stage 5 (Execute) and Stage 6 (Record).

**Why it happens:** The Drift precedent (`IPerpProvider` returns `ContractCallRequest[]` -> pipeline -> on-chain TX) makes it tempting to follow the same pattern. But Hyperliquid's execution model is fundamentally different: sign locally, POST to centralized API, receive immediate response with order status.

**Consequences:**
- Stage 5 (Execute) expects `IChainAdapter.sendTransaction()` but Hyperliquid needs `HyperliquidExchangeClient.post()`
- Stage 6 (Record) expects a transaction hash, but Hyperliquid returns order status/fills, not a TX hash
- Gas estimation is meaningless for API trades (Hyperliquid L1 has no gas)
- Nonce management collides (on-chain nonce vs Hyperliquid's millisecond-timestamp nonce)
- The 8-state machine (PENDING -> VALIDATING -> ... -> CONFIRMED) does not map to order lifecycle (OPEN -> PARTIAL_FILL -> FILLED -> CANCELLED)

**Prevention:**
- Create a **parallel execution path** for Hyperliquid API trades. Reuse Stages 1-4 (Validate, Policy, Delay, Approve) but fork at Stage 5:
  - `stage5Execute` checks if the action is a Hyperliquid API trade -> delegates to `HyperliquidExchangeClient.submitAction(signedAction)`
  - Response handling maps Hyperliquid statuses to WAIaaS recording format
- Use the existing `SIGN` type in `discriminatedUnion` for the EIP-712 signing step, but the actual submission is a separate concern handled by the action provider
- Do NOT create a new discriminatedUnion type (9th type). Instead, the `HyperliquidActionProvider` resolves actions to `SignRequest` (EIP-712 typed data), and the provider itself handles the POST submission as a post-sign callback
- Store Hyperliquid order responses in a separate table (`hyperliquid_orders`) rather than trying to fit them into the existing `transactions` table

**Detection:** If you find yourself adding `if (isHyperliquid)` branches inside `stage5Execute` or `IChainAdapter`, you are going down the wrong path.

**Phase to address:** Phase 2 (Design) must define the pipeline fork strategy. This is THE most important architectural decision for the entire milestone.

---

### Pitfall 3: Nonce Mismanagement Leading to Rejected or Replayed Transactions

**What goes wrong:** Hyperliquid's nonce system is unlike any standard blockchain nonce. It stores the 100 highest nonces per signer, requires each new nonce to be larger than the smallest in that set, and constrains nonces to a time window of `(T - 2 days, T + 1 day)` where T is the block timestamp in milliseconds. Using sequential integers (like Ethereum nonces) or reusing timestamps causes all requests to be rejected.

**Why it happens:** Developers apply Ethereum nonce mental model (sequential integers starting from 0). Hyperliquid uses millisecond timestamps as nonces, and the "100 highest" window means rapid burst of 100+ actions in the same millisecond exhausts the window.

**Consequences:**
- All orders rejected with nonce errors after the 100th rapid-fire action
- Clock skew between WAIaaS daemon and Hyperliquid nodes causes window violations
- After API wallet deregistration, nonce state is pruned and "previously signed actions can be replayed" (official docs warning)
- Sub-accounts sharing an API wallet share the nonce tracker, causing cross-contamination

**Prevention:**
- Use `Date.now()` as the base nonce, with a monotonically increasing counter suffix for burst scenarios: `Date.now() * 1000 + counter` (microsecond resolution to avoid collisions)
- Implement `HyperliquidNonceManager` that tracks the last-used nonce and guarantees strict monotonic increase
- NEVER reuse an API wallet address after deregistration (generate fresh keypair each time)
- Use separate API wallets per sub-account (official recommendation) to avoid shared nonce trackers
- Add clock skew detection: compare local time with Hyperliquid server time header and warn if drift > 30 seconds

**Detection:** Monitor for `NONCE_TOO_LOW` or `NONCE_ALREADY_USED` errors in API responses. Any occurrence indicates nonce management failure.

**Phase to address:** Phase 3 (Perp implementation) must include `HyperliquidNonceManager` as part of `HyperliquidExchangeClient`.

---

### Pitfall 4: Sub-Account Security -- Unauthorized Cross-Account Transfers

**What goes wrong:** Sub-accounts are a new concept in WAIaaS (no existing equivalent). A master account can transfer funds freely between its sub-accounts via the `usdClassTransfer` and `sendAsset` APIs. If an AI agent session has access to the master wallet's signing key, it can drain funds from any sub-account to another, bypassing per-sub-account spending limits.

**Why it happens:** WAIaaS's policy engine evaluates policies per-wallet. If sub-accounts are mapped as child entities of a single WAIaaS wallet, the policy engine sees transfers between sub-accounts as "internal" operations that don't trigger spending limit checks. The `fromSubAccount` parameter in the API is just a string -- there is no on-chain enforcement of sub-account isolation.

**Consequences:**
- An AI agent can concentrate all sub-account balances into one account, then make a large trade that exceeds the intended per-sub-account risk limit
- Sub-account-to-sub-account transfers bypass the `SPENDING_LIMIT` policy because no external transfer occurs
- No audit trail distinguishes "agent moved funds between sub-accounts" from "agent traded on sub-account"

**Prevention:**
- Model sub-accounts as **distinct policy scopes** within the Hyperliquid provider. Each sub-account gets its own spending tracking even if they share a master wallet
- Add a dedicated policy type `SUBACCOUNT_TRANSFER_LIMIT` or extend `SPENDING_LIMIT` to cover internal transfers
- Log all sub-account transfers as first-class audit events (`HYPERLIQUID_SUBACCOUNT_TRANSFER`)
- Consider mapping each sub-account to a separate WAIaaS wallet entry (1 sub-account = 1 wallet with `subAccountAddress` metadata) rather than nesting under one wallet
- Default-deny sub-account transfers: require explicit policy allowance for cross-sub-account fund movement

**Detection:** Audit log showing multiple `usdClassTransfer` or `sendAsset` actions between sub-accounts in rapid succession.

**Phase to address:** Phase 2 (Design) must define sub-account-to-wallet mapping. Phase 5 (Sub-accounts) must implement transfer controls.

---

## Moderate Pitfalls

### Pitfall 5: Rate Limit Exhaustion from Naive Request Patterns

**What goes wrong:** Hyperliquid enforces a 1200 weight/minute IP-based quota with varying weights per endpoint. Info endpoints cost 2-60 weight each. A naive implementation that polls `clearinghouseState` (weight 2) + `orderStatus` (weight 2) + `l2Book` (weight 2) every second for 5 markets exhausts the quota in 40 seconds: `(2+2+2) * 5 markets * 40 seconds = 1200`.

**Why it happens:** Developers treat the API like a local database and poll frequently for state updates instead of using WebSocket subscriptions. The weight system is non-obvious (some info endpoints cost 20 weight, `userRole` costs 60).

**Prevention:**
- Implement `HyperliquidRateLimiter` with sliding window tracking, weight-aware request budgeting
- Use WebSocket subscriptions for real-time data (positions, fills, order updates) instead of REST polling
- Cache info responses with appropriate TTL (market metadata: 5min, positions: use WebSocket, order book: use WebSocket)
- Expose rate limit budget as an Admin Setting (`hyperliquid.rate_limit_weight_per_minute`, default 1000 with 200 buffer)
- Address-based limits also exist: 1 request per 1 USDC traded + 10,000 initial buffer. New accounts with no trading history hit this quickly
- Batch orders where possible: 40 orders in one batch = weight 2 instead of weight 40

**Detection:** HTTP 429 responses or `RATE_LIMIT` errors from Hyperliquid API. Monitor remaining weight budget.

**Phase to address:** Phase 3 (Perp) must include rate limiter in `HyperliquidExchangeClient`.

---

### Pitfall 6: Order State Management -- Partial Fills, Cancel Races, Stale State

**What goes wrong:** Hyperliquid's order lifecycle is more complex than on-chain transaction finality. An order can be: open, partially filled, fully filled, cancelled, or expired. Cancel requests can race with fills. The WAIaaS `transactions` table tracks binary outcomes (success/failure), not continuous order state.

**Why it happens:** On-chain transactions have finality: confirmed or reverted. Hyperliquid orders live in a stateful order book where partial fills accumulate over time and cancellations can fail if the order was already filled.

**Prevention:**
- Create a separate `hyperliquid_orders` table: `{ orderId, cloid, walletId, market, side, type, price, size, filledSize, status, createdAt, updatedAt }`
- Use Client Order IDs (`cloid`) for idempotent order tracking -- Hyperliquid supports client-specified order IDs
- Subscribe to `orderUpdates` and `fills` WebSocket channels for real-time state sync
- Handle cancel failures gracefully: if cancel returns "order already filled", update local state to FILLED rather than throwing error
- On WebSocket reconnection, reconcile local order state by querying `openOrders` and `userFills`
- The `isSnapshot: true` flag on WebSocket reconnection provides the full state snapshot -- process it to reconcile

**Detection:** Stale orders in the local database that show OPEN but were actually filled/cancelled on Hyperliquid.

**Phase to address:** Phase 3 (Perp) for order table + state machine. Phase 4 (Spot) reuses the same infrastructure.

---

### Pitfall 7: WebSocket Connection Management -- Silent Disconnects

**What goes wrong:** WAIaaS currently has no WebSocket client infrastructure (all existing integrations are REST-based or use chain-specific subscription patterns like `IChainSubscriber`). Adding WebSocket for Hyperliquid introduces connection lifecycle management that is error-prone: silent disconnects, subscription loss, stale data windows.

**Why it happens:** Hyperliquid WebSocket "disconnection from API servers may happen periodically and without announcement" (official docs). The IP-based limits (10 connections, 1000 subscriptions, 2000 messages/minute) can also cause throttled disconnects.

**Prevention:**
- Implement `HyperliquidWebSocketManager` with:
  - Heartbeat monitoring (detect silent disconnects within 30 seconds)
  - Exponential backoff reconnection (1s, 2s, 4s... max 30s)
  - Automatic resubscription on reconnect
  - State reconciliation on reconnect using snapshot ack (`isSnapshot: true`)
- Respect connection limits: maximum 10 connections per IP, 30 new connections per minute
- Use a single multiplexed connection with multiple subscriptions rather than one connection per subscription
- Fall back to REST polling with extended intervals if WebSocket is repeatedly failing
- Make WebSocket optional: the system must work (degraded) with REST-only polling

**Detection:** Position/order data timestamp drift > 10 seconds from current time suggests stale WebSocket data.

**Phase to address:** Phase 3 (Perp) for initial WebSocket infrastructure. Consider making WebSocket a Phase 2 design decision (required vs optional).

---

### Pitfall 8: Policy Engine Bypass for API-Based Trades

**What goes wrong:** WAIaaS's policy engine evaluates `SPENDING_LIMIT`, `TOKEN_SPENDING_LIMIT`, `RATE_LIMIT`, and `CONTRACT_WHITELIST` policies against on-chain transaction parameters (to, value, data). Hyperliquid API trades have no `to` address (it goes to an API endpoint), no `value` (margin-based), and no `data` (it is a JSON body). Without adaptation, the policy engine either blocks all Hyperliquid trades (no matching rules) or passes all of them (no applicable policies).

**Why it happens:** The policy evaluation pipeline assumes on-chain transaction shape. API-based trades use different parameters: asset index, size in units, USD margin value, leverage.

**Prevention:**
- Extract policy-relevant values from Hyperliquid trade parameters:
  - `SPENDING_LIMIT`: compute `size * price` for the USD notional value of the trade. For margin trades, use the margin amount as the spending value (not the leveraged notional)
  - `TOKEN_SPENDING_LIMIT`: map Hyperliquid asset to CAIP-19 asset ID using the existing asset mapping
  - `RATE_LIMIT`: count Hyperliquid orders as rate-limited actions (order_count, not tx_count)
  - `CONTRACT_WHITELIST`: NOT applicable (no contracts). Skip this policy for Hyperliquid trades
- Create a `HyperliquidPolicyAdapter` that translates Hyperliquid action parameters into the policy engine's expected input format
- Decide in Phase 2: should `SPENDING_LIMIT` apply to margin deposit or notional value? Document clearly.

**Detection:** Integration tests that verify policy enforcement for Hyperliquid trades: a trade exceeding the spending limit must be rejected.

**Phase to address:** Phase 2 (Design) must define policy mapping rules. Phase 3 (Perp) must implement `HyperliquidPolicyAdapter`.

---

### Pitfall 9: Testnet vs Mainnet Endpoint Confusion

**What goes wrong:** Hyperliquid has separate API endpoints (`api.hyperliquid.xyz` vs `api.hyperliquid-testnet.xyz`) AND separate EIP-712 signing parameters for testnet. Using mainnet signing parameters on testnet (or vice versa) produces valid-looking but rejected signatures.

**Why it happens:** The HyperEVM chain (Chain ID 999 mainnet / 998 testnet) is separate from the L1 DEX API. A wallet might be configured for HyperEVM testnet but the L1 DEX client might accidentally use mainnet API endpoint or signing parameters.

**Prevention:**
- Derive the Hyperliquid API endpoint and signing parameters from the wallet's network configuration: `hyperevm-mainnet` -> `api.hyperliquid.xyz`, `hyperevm-testnet` -> `api.hyperliquid-testnet.xyz`
- Store API endpoint in Admin Settings (`hyperliquid.api_url`) with environment-aware defaults
- NEVER hardcode endpoints. Use a configuration lookup: `HYPERLIQUID_ENDPOINTS: Record<NetworkId, { api: string, ws: string }>`
- Add validation at client initialization: verify API health endpoint returns expected environment name
- HyperEVM RPC also has separate rate limits: official public RPC is 100 requests/minute/IP

**Detection:** Signature verification failures that only occur on testnet or only on mainnet.

**Phase to address:** Phase 1 (HyperEVM chain) for network configuration. Phase 3 for API endpoint binding.

---

### Pitfall 10: msgpack Field Ordering Sensitivity in L1 Action Hashing

**What goes wrong:** The phantom agent construction for L1 actions requires msgpack-encoding the action with specific field ordering. JavaScript/TypeScript object property order is NOT guaranteed to match the required order. Different msgpack libraries may serialize the same object differently.

**Why it happens:** The Hyperliquid signing docs explicitly warn: "Field ordering requirements for msgpack serialization" is a common mistake. Python dictionaries preserve insertion order (3.7+), but TypeScript objects do not guarantee property enumeration order matches insertion order for all cases.

**Prevention:**
- Use a msgpack library that supports schema-driven encoding with explicit field order (e.g., `@msgpack/msgpack` with custom `ExtensionCodec`)
- Define the canonical field order for each action type as a constant array
- Build the action object by iterating the field order array, not by constructing an object literal
- Port and verify against the official Python SDK's `signing_test.py` test vectors
- Address case sensitivity: use lowercase addresses consistently (official recommendation)
- Numeric precision: ensure no trailing zeros in float-to-string conversions (another documented pitfall)

**Detection:** Compare msgpack output byte-for-byte against Python SDK reference implementation for the same input.

**Phase to address:** Phase 3 (Perp) as part of `HyperliquidSigner` implementation.

---

## Minor Pitfalls

### Pitfall 11: API Wallet Limit Exhaustion

**What goes wrong:** Each master account is limited to 1 unnamed + 3 named API wallets, plus 2 additional per sub-account. In a multi-agent scenario where each session creates its own API wallet, the limit is quickly exhausted.

**Prevention:** Pool API wallets across sessions for the same master account. Track registered API wallets in the database and reuse them. Implement cleanup of expired API wallets.

**Phase to address:** Phase 2 (Design) for API wallet lifecycle strategy.

---

### Pitfall 12: Stale `expiresAfter` Penalty

**What goes wrong:** Cancelled actions with stale `expiresAfter` consume 5x the normal address-based rate limit weight. Setting aggressive expiration times on all orders amplifies rate limit consumption when orders are cancelled.

**Prevention:** Only use `expiresAfter` when truly needed (time-sensitive orders). Default to no expiration for limit orders. Document the 5x penalty in the rate limiter logic.

**Phase to address:** Phase 3 (Perp) when implementing order parameters.

---

### Pitfall 13: HyperEVM RPC Rate Limit vs L1 API Rate Limit Confusion

**What goes wrong:** HyperEVM RPC (for on-chain operations like balance checks, token transfers) has a 100 req/min/IP limit, while the L1 DEX API has 1200 weight/min. These are independent limits. Sharing a rate limiter between them causes either under-utilization or one limit being hit while the other has capacity.

**Prevention:** Separate rate limiters for HyperEVM RPC (handled by existing RPC Pool) and Hyperliquid L1 API (handled by `HyperliquidRateLimiter`). They are different services with different quotas.

**Phase to address:** Phase 1 (HyperEVM chain) for RPC rate limiting. Phase 3 for L1 API rate limiting.

---

### Pitfall 14: Builder Fee Misconfiguration

**What goes wrong:** Hyperliquid supports builder fees where a builder address receives a percentage of each trade. If WAIaaS registers as a builder but misconfigures the fee rate or address, orders may be rejected or funds sent to wrong address.

**Prevention:** Make builder fee optional (disabled by default). If enabled, validate builder address and fee rate against `approveBuilderFee` limits before order submission. Store as Admin Settings.

**Phase to address:** Phase 2 (Design) for builder fee strategy. Phase 3 for implementation.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: HyperEVM Chain | viem chain export names may differ from expected (`hyperEvm` vs `hyperliquidEvm`) | Verify exact viem export at implementation time. Fallback to `defineChain` |
| Phase 2: Design | Trying to reuse Drift's `IPerpProvider` pattern directly | Hyperliquid returns order statuses, not instructions. Design a new interface or extend IPerpProvider with async order lifecycle |
| Phase 3: Perp | First-time WebSocket in WAIaaS codebase | Keep WebSocket optional initially. REST polling must work standalone |
| Phase 3: Perp | msgpack library choice | Use `@msgpack/msgpack` (most popular, well-maintained). Verify against Python SDK test vectors |
| Phase 4: Spot | Assuming Spot API is identical to Perp API | Spot has different clearing state endpoint (`spotClearinghouseState`) and different transfer semantics |
| Phase 5: Sub-accounts | 1-to-1 wallet mapping may be too rigid | Allow flexible mapping: some users want 1 wallet = N sub-accounts, others want 1 wallet = 1 sub-account |
| Phase 5: Sub-accounts | Shared nonce tracker across sub-accounts using same API wallet | Generate separate API wallets per sub-account (official recommendation) |
| All Phases: Testing | Mock API may not catch signing errors | Include at least one testnet integration test per action type. Use `api.hyperliquid-testnet.xyz` |

---

## Sources

- [Hyperliquid Signing Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing) -- Two signing schemes, field ordering, common mistakes (HIGH confidence)
- [Hyperliquid Nonces and API Wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets) -- Nonce format, 100-highest window, API wallet limits, sub-account nonce sharing (HIGH confidence)
- [Hyperliquid Rate Limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits) -- Weight system, IP vs address limits, batch rules, WebSocket limits (HIGH confidence)
- [Hyperliquid Exchange Endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint) -- Action types, transfer APIs, signing requirements per action (HIGH confidence)
- [Hyperliquid WebSocket](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket) -- Connection limits, reconnection, snapshot acks (HIGH confidence)
- [Chainstack: Hyperliquid Authentication Guide](https://docs.chainstack.com/docs/hyperliquid-authentication-guide) -- EIP-712 domain parameters (MEDIUM confidence)
- [Chainstack: User-Signed Actions](https://docs.chainstack.com/docs/hyperliquid-user-signed-actions) -- L1 vs user-signed action distinction, domain parameters, phantom agent (MEDIUM confidence)
- [Turnkey x Hyperliquid](https://www.turnkey.com/blog/hyperliquid-secure-eip-712-signing) -- Secure EIP-712 signing patterns (MEDIUM confidence)
- [Hyperliquid Python SDK signing_test.py](https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/tests/signing_test.py) -- Reference test vectors (HIGH confidence)
