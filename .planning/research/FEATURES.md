# Feature Research: Incoming Transaction Monitoring

**Domain:** Crypto Wallet Incoming Transaction Monitoring (AI Agent Wallet Service — WAIaaS)
**Researched:** 2026-02-21
**Confidence:** HIGH (design doc m27-00 verified against official RPC docs and industry patterns)

---

## Context

WAIaaS already has: 6-stage outgoing TX pipeline, 28-event INotificationChannel, 60+ REST endpoints,
18 MCP tools, config.toml flat-section config, SettingsService hot-reload, wallet-level opt-in policies.

This research covers what to ADD for incoming transaction monitoring — specifically for a design-only milestone.
The downstream consumer is the roadmap + design specification authors for milestone m27.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features an AI agent wallet service must have for incoming TX monitoring to feel complete.
Missing any of these = incoming TX feature is not shippable.

| Feature | Why Expected | Complexity | WAIaaS Dependency | Confidence |
|---------|--------------|------------|-------------------|------------|
| Real-time incoming TX detection | Every major wallet (Phantom, MetaMask, Trust Wallet) provides push notification on receive; AI agents need to react to inbound funds | MEDIUM | IChainAdapter — new IChainSubscriber layer; WebSocket on RPC node | HIGH |
| Native token detection (SOL, ETH) | Base expectation — wallet must know when its primary asset arrives | LOW | accountSubscribe (Solana); eth_subscribe newHeads + to-filter (EVM) | HIGH |
| SPL / ERC-20 token detection | AI agents manage token-denominated flows (USDC, stablecoins); detecting token arrivals is mandatory for complete fund tracking | MEDIUM | accountSubscribe per ATA (Solana); eth_subscribe logs + Transfer topic filter (EVM) | HIGH |
| Persistent storage of incoming TX history | Without a DB record, agents cannot query "what arrived since last run"; all wallet services reviewed keep full history | LOW | New `incoming_transactions` table; tx_hash UNIQUE constraint for dedup | HIGH |
| Duplicate detection | RPC WebSocket can deliver the same event multiple times on reconnect replay; duplicates corrupt accounting | LOW | ON CONFLICT IGNORE on tx_hash UNIQUE | HIGH |
| Opt-in per-wallet activation with global gate | Inactive wallets must incur zero additional RPC cost; self-hosted constraint. Two-gate model: global incoming_enabled AND per-wallet monitor_incoming | LOW | monitor_incoming boolean column in wallets table + global incoming_enabled config key | HIGH |
| Polling fallback when WebSocket unavailable | Not all RPC endpoints support WebSocket (public HTTP endpoints, restrictive firewalls); must degrade gracefully without silent failure | MEDIUM | getSignaturesForAddress (Solana); eth_getBlockByNumber scan (EVM) | HIGH |
| Retention / auto-purge policy | Self-hosted SQLite cannot grow unbounded; incoming_retention_days config key; scheduled cleanup job | LOW | Existing pattern from balance monitor; new scheduler for incoming_transactions table | HIGH |
| Incoming history REST API | AI agent or admin needs to query history with date/address/token filters | MEDIUM | New GET /v1/wallet/incoming endpoint; cursor pagination matching existing TX list pattern | HIGH |
| INCOMING_TX_DETECTED notification event | Owner wants a push alert on deposit via Telegram/ntfy/Discord/Slack; MetaMask and Phantom both deliver real-time receive notifications | LOW | 2 new NotificationEventType entries added to existing 28-event enum | HIGH |
| Wallet-level monitoring activation gate | Only explicitly opted-in wallets generate events and RPC subscriptions; prevents runaway cost | LOW | resolveWalletId + monitor_incoming flag gate before subscribing | HIGH |

### Differentiators (Competitive Advantage)

Features that go beyond baseline and are especially valuable in the AI agent context.

| Feature | Value Proposition | Complexity | WAIaaS Dependency | Confidence |
|---------|-------------------|------------|-------------------|------------|
| Suspicious incoming TX detection (INCOMING_TX_SUSPICIOUS) | Dust attacks use tiny token airdrops to deanonymize wallets or introduce poisoned coins. AI agents that auto-spend received funds are at higher risk than human-controlled wallets. Threshold-based detection ($0.01 USD) plus ALLOWED_TOKENS cross-check gives immediate protection | MEDIUM | IIncomingSafetyRule interface; price oracle (v1.5 already in WAIaaS) for USD conversion; ALLOWED_TOKENS policy | HIGH |
| WebSocket connection sharing across wallets on same chain | One WebSocket per chain, not one per wallet. Critical for scaling beyond 5 wallets on a self-hosted node. Geth and Solana both support multiple subscriptions per single connection | MEDIUM | ChainSubscriber multiplexer registry; subscription ID → walletId map; resubscribe all on reconnect | HIGH |
| Exponential backoff reconnection with jitter | WebSocket drops happen. Without reconnect, monitoring silently stops for hours. Production grade: 1s→2s→4s→…→60s backoff with random jitter to prevent thundering herd. Subscription state must survive reconnect and be replayed automatically | MEDIUM | IChainSubscriber reconnect state machine; subscription registry persisted in memory across reconnects | HIGH |
| MCP tool: list_incoming_transactions | AI agent can ask "what payments have I received?" directly via MCP without custom REST client code. Enables autonomous DeFi reactions: receive deposit → query balance → swap → yield | LOW | 21st MCP tool; wraps GET /v1/wallet/incoming | HIGH |
| Unknown token flagging | Any token not in the wallet's ALLOWED_TOKENS policy list triggers INCOMING_TX_SUSPICIOUS. Prevents AI agents from treating malicious airdropped tokens as spendable funds without owner review | LOW | Cross-reference with existing ALLOWED_TOKENS policy store; no USD price needed | HIGH |
| Large deposit anomaly detection | Alert when a single deposit is N× the wallet's rolling average. Legitimate for AI agents managing treasury — a sudden large inflow is unusual and should prompt owner awareness before agent auto-acts | MEDIUM | Rolling average calculation in IncomingTransactionMonitor on incoming_transactions table; configurable multiplier (default 10×) | MEDIUM |
| Per-ATA dynamic subscription management (Solana) | SPL tokens live in Associated Token Accounts, not the wallet address itself. A static ATA list at daemon startup is insufficient — new ATAs created after startup must be detected and subscribed dynamically. This is required for complete Solana token monitoring | HIGH | accountSubscribe per ATA; wallet-level accountSubscribe to detect new ATA creation (owner field change in account data); ATA registry with add/remove hooks | HIGH |
| Summary / income aggregation endpoint | GET /v1/wallet/incoming/summary with daily/weekly/monthly totals. Useful for AI agents managing recurring income streams (subscription payments, yield collection, grant disbursements) | MEDIUM | SQL aggregation on incoming_transactions; optional USD conversion via price oracle | MEDIUM |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| External indexer / Helius Webhook push | "Zero polling" incoming TX with instant sub-100ms delivery via Helius/Alchemy managed webhooks | Violates Self-Hosted principle: requires outbound registration to 3rd-party service, API key management, external dependency, and internet egress. WAIaaS must operate without connectivity to indexer services | RPC WebSocket subscription achieves near-identical latency without external dependency |
| NFT incoming detection | Users want notification when receiving an NFT (Metaplex / ERC-721 / ERC-1155) | NFT metadata parsing is complex: Metaplex for Solana, varying ABI for EVM. No reliable USD floor for price-based dust threshold. Scope expansion risks derailing the core monitoring design | Defer to separate milestone; core monitoring covers fungible tokens only (explicitly out of scope in m27-00) |
| Historical backfill on activation | "When I turn on monitoring, show all past deposits from before activation" | Requires archive RPC node (512-1024 GB RAM) or Etherscan/Solscan API dependency. Public RPC nodes typically only provide recent signature history (limited getSignaturesForAddress lookback). False sense of completeness creates accounting errors | Document clearly: monitoring starts from activation timestamp. Past TX is visible via block explorer links included in INCOMING_TX_DETECTED notification details |
| Incoming TX policy enforcement (auto-reject / auto-block) | "Block suspicious incoming funds automatically" | Incoming TX cannot be blocked at the RPC layer — funds arrive on-chain regardless of daemon state. Claiming to "block" incoming TX is technically misleading and could create false security expectations | Record incoming TX with is_suspicious flag; emit INCOMING_TX_SUSPICIOUS alert; let Owner decide. Never claim incoming TX was blocked |
| Global monitoring on by default (all wallets always watched) | "Simpler UX — just monitor everything" | RPC connection cost scales with wallet count. Public RPC nodes have rate limits. On self-hosted nodes with limited hardware, unlimited subscriptions risk overwhelming the node. WAIaaS default-deny policy applies | Opt-in per-wallet with global enable gate. Cost is documented in config.toml. Operators choose which wallets warrant monitoring cost |
| Real-time balance streaming to AI agent (SSE / WebSocket push) | "Push balance changes to agent as they happen" | Adds SSE/WebSocket server complexity to daemon; agent frameworks poll MCP resources rather than maintaining persistent connections; existing getBalance() RPC call is sufficient for spot queries | On INCOMING_TX_DETECTED event, daemon updates MCP resource state; agent framework fetches on next poll cycle |

---

## Feature Dependencies

```
[incoming_enabled config.toml key (global gate)]
    └──gates──> [per-wallet monitor_incoming flag]
                    └──enables──> [IChainSubscriber subscription]
                                      ├──primary──> [WebSocket RPC (Solana: accountSubscribe; EVM: eth_subscribe)]
                                      └──fallback──> [Polling (getSignaturesForAddress / eth_getBlockByNumber)]
                                      └──produces──> [incoming TX event]
                                                         ├──writes──> [incoming_transactions table (new)]
                                                         ├──emits──> [INCOMING_TX_DETECTED notification]
                                                         │               ├──feeds──> [INotificationChannel: Telegram/Discord/ntfy]
                                                         │               └──feeds──> [WalletNotificationChannel: SDK side channel]
                                                         └──emits──> [INCOMING_TX_SUSPICIOUS (conditional)]

[SPL Token detection (Solana)]
    └──requires──> [ATA enumeration via getTokenAccountsByOwner on startup]
    └──requires──> [accountSubscribe per ATA]
    └──requires──> [wallet accountSubscribe to detect new ATA creation]

[INCOMING_TX_SUSPICIOUS event]
    └──requires──> [incoming_transactions table] (rolling average for anomaly detection)
    └──requires──> [ALLOWED_TOKENS policy store] (unknown token check)
    └──optionally-uses──> [price oracle (v1.5)] (for USD-based dust threshold)

[GET /v1/wallet/incoming REST API]
    └──requires──> [incoming_transactions table]

[MCP tool: list_incoming_transactions]
    └──requires──> [GET /v1/wallet/incoming REST endpoint]

[Summary endpoint: GET /v1/wallet/incoming/summary]
    └──requires──> [incoming_transactions table]
    └──optionally-uses──> [price oracle] (for USD totals)

[WebSocket connection sharing]
    └──requires──> [subscription ID → walletId registry in ChainSubscriber]
    └──requires──> [resubscribe-all logic in reconnect handler]

[Exponential backoff reconnection]
    └──requires──> [IChainSubscriber reconnect state machine]
    └──enhances──> [WebSocket connection sharing] (resubscribes all wallets in registry after reconnect)
```

### Dependency Notes

- **SPL Token detection is the highest-complexity item.** Solana accountSubscribe tracks state changes on a single account. SPL tokens live in ATAs (Associated Token Accounts), not the wallet address. A static ATA list captured at daemon startup is insufficient — new ATAs created after startup (from new token airdrops or first-time receives) must be detected and subscribed. This requires a wallet-level subscription plus ATA registry with dynamic add hooks.
- **Suspicious TX detection uses price oracle optionally.** The USD dust threshold ($0.01) requires USD price lookup. Price oracle exists in WAIaaS since v1.5. If oracle unavailable for a specific token, fall back to raw token-unit threshold (configurable minimum token units as a secondary threshold).
- **WebSocket connection sharing must be designed upfront.** Retrofitting from "one connection per wallet" to "one connection per chain" is expensive. ChainSubscriber must be a multiplexer from the start.
- **Polling fallback has unavoidable detection lag.** At 30-second intervals (default), maximum lag is 30 seconds. This is acceptable for treasury monitoring. Design docs must state this explicitly so AI agent implementations do not assume real-time latency in polling mode.

---

## MVP Definition

This is a design-only milestone. MVP = what the design documents must fully specify before implementation begins.

### Launch With — Core Design Deliverables (P1)

- [ ] IChainSubscriber interface — subscribe/unsubscribe/onTransaction + reconnect lifecycle methods
- [ ] SolanaSubscriber design — accountSubscribe for native SOL + ATA enumeration + dynamic ATA subscription + getSignaturesForAddress fallback
- [ ] EvmSubscriber design — eth_subscribe logs (ERC-20 Transfer topic filter) + eth_subscribe newHeads (native ETH to-address filter) + eth_getBlockByNumber polling fallback
- [ ] `incoming_transactions` table schema — id (UUID v7), wallet_id, tx_hash (UNIQUE), from_address, amount, token_address, chain, confirmed_at, is_suspicious (BOOLEAN), created_at; retention TTL via scheduled purge
- [ ] INCOMING_TX_DETECTED + INCOMING_TX_SUSPICIOUS notification event types (28→30)
- [ ] GET /v1/wallet/incoming REST endpoint spec — filters (from_address, token_address, chain, since, until), cursor pagination, sessionAuth, limit 50/max 200
- [ ] config.toml [incoming] section — 6 flat keys: incoming_enabled, incoming_mode, incoming_poll_interval, incoming_retention_days, incoming_suspicious_dust_usd, incoming_suspicious_amount_multiplier
- [ ] wallets table — monitor_incoming column addition (BOOLEAN DEFAULT 0)
- [ ] Deduplication strategy — ON CONFLICT IGNORE on tx_hash; idempotent event emission

### Add After Validation — Differentiator Design Deliverables (P2)

- [ ] WebSocket connection sharing — ChainSubscriber multiplexer design; subscription registry spec
- [ ] Exponential backoff reconnection — state machine spec (1s/2s/4s/…/60s, jitter, max attempts, subscription replay)
- [ ] MCP tool list_incoming_transactions — parameters, response schema, error handling
- [ ] IIncomingSafetyRule interface — dust threshold rule, unknown token rule, large deposit anomaly rule
- [ ] Per-ATA dynamic subscription management — ATA discovery flow, dynamic add/remove, new ATA detection trigger

### Future Consideration — Defer

- [ ] MCP Resource waiaas://wallet/incoming — depends on MCP SSE infrastructure not yet designed
- [ ] Summary endpoint GET /v1/wallet/incoming/summary — SQL aggregation, acceptable to defer
- [ ] NFT incoming detection — separate milestone, explicitly out of scope per m27-00

---

## Feature Prioritization Matrix

| Feature | AI Agent Value | Design Cost | Priority |
|---------|---------------|-------------|----------|
| Native token detection (SOL/ETH) | HIGH | LOW | P1 |
| Incoming TX storage + dedup | HIGH | LOW | P1 |
| INCOMING_TX_DETECTED notification | HIGH | LOW | P1 |
| SPL / ERC-20 detection | HIGH | MEDIUM | P1 |
| Opt-in per-wallet + global gate | HIGH | LOW | P1 |
| Polling fallback strategy | HIGH | MEDIUM | P1 |
| GET /v1/wallet/incoming REST | HIGH | MEDIUM | P1 |
| Retention / auto-purge | MEDIUM | LOW | P1 |
| Exponential backoff reconnection | HIGH | MEDIUM | P2 |
| WebSocket connection sharing | HIGH | MEDIUM | P2 |
| Suspicious TX detection (dust, unknown token) | MEDIUM | MEDIUM | P2 |
| Large deposit anomaly detection | MEDIUM | MEDIUM | P2 |
| Per-ATA dynamic subscription (Solana) | HIGH | HIGH | P2 |
| MCP tool list_incoming_transactions | HIGH | LOW | P2 |
| Summary endpoint | LOW | MEDIUM | P3 |
| MCP Resource waiaas://wallet/incoming | MEDIUM | HIGH | P3 |

---

## Chain-Specific Feature Comparison

| Feature | Solana | EVM (Ethereum, Base, etc.) |
|---------|--------|---------------------------|
| Native token detection subscription method | accountSubscribe(walletAddress) — detects lamport changes | eth_subscribe("newHeads") + filter block tx.to == walletAddress |
| Token detection subscription method | accountSubscribe per ATA (one subscription per token account) | eth_subscribe("logs") with topics: [Transfer sig, null, walletAddress] — single subscription covers all ERC-20 tokens |
| Multiple wallets per connection | Multiple accountSubscribe calls on single WS — supported | Multiple eth_subscribe calls on single WS — supported (Geth: no documented limit, 10k buffer before disconnect) |
| Commitment level | confirmed (fast, rare reorgs acceptable for monitoring; finalized for accounting) | Block inclusion (latest); reorganization depth typically 1-2 blocks on PoS Ethereum |
| Dedup sensitivity | confirmed→finalized state transition can trigger duplicate account change events | Uncle blocks on pre-Merge chains; PoS reorgs are rare but possible |
| Polling fallback method | getSignaturesForAddress(address, { until: lastKnownSig }) | eth_getBlockByNumber(latest) + scan tx array for to == walletAddress; per-block full scan is expensive |
| New token receive (first time) | Creates new ATA — must detect accountSubscribe on wallet for program-owner-change events | Same eth_subscribe logs filter covers first-time ERC-20 transfers without extra setup |
| ATA complexity | HIGH — per-token-mint ATA must be discovered and individually subscribed | LOW — single logs subscription covers all ERC-20 Transfer events to wallet address |

---

## Competitor / Reference Analysis

| Capability | MetaMask Portfolio | Phantom | Trust Wallet | Coinbase Wallet | WAIaaS Target |
|------------|-------------------|---------|--------------|-----------------|---------------|
| Incoming TX push notification | Yes (ETH, tokens, NFTs, staking unstake) | Yes (opt-in push, granular by type) | Yes (basic) | Yes (basic) | Yes — INotificationChannel (Telegram/ntfy/Discord/Slack) |
| Notification granularity | Per account, per event type, Settings toggle | Opt-in by category (transactions, perps, markets) | On/off only | On/off only | Per wallet + per category (signing_sdk.notify_categories existing) |
| Full TX history (incoming + outgoing) | Yes — MetaMask Portfolio (cloud-indexed) | Yes — chain indexed | Yes — chain indexed | Yes — chain indexed | Currently outgoing only → add incoming via incoming_transactions table |
| Retention period | Blockchain permanent; local cache varies | Blockchain permanent | Blockchain permanent | 30-day export window | 90-day default, configurable via incoming_retention_days |
| Dust attack detection | No native (Blowfish focuses on outgoing) | Blocklist + Blowfish (outgoing-focused) | No | No | Yes — INCOMING_TX_SUSPICIOUS with configurable dust_usd threshold |
| Unknown token flagging | Warning badge (informal) | SimpleHash blocklist | No | No | Yes — cross-reference ALLOWED_TOKENS policy (default-deny applies) |
| AI agent event reaction support | No (consumer wallet) | No (consumer wallet) | No | Yes (CDP Agentic Wallets — managed service) | Yes — MCP tool + INCOMING_TX_DETECTED event |
| Self-hosted, no external indexer | No | No | No | No (CDP is managed) | Yes — RPC WebSocket only, no Helius/Alchemy dependency |

---

## Self-Hosted Design Constraints (WAIaaS-Specific)

These constraints must inform every feature design decision in the milestone.

| Constraint | Implication |
|------------|-------------|
| No external indexer (Helius, Alchemy Notify, Etherscan webhooks ruled out) | WebSocket subscription to RPC node is the only detection path. Polling fallback is mandatory for HTTP-only RPC endpoints |
| SQLite on single machine (self-hosted) | Batch INSERT on high-frequency incoming TX streams prevents write stalls. Retention policy is critical — unbounded append breaks self-hosted deployments |
| Default-deny (WAIaaS policy principle) | incoming_enabled=false by default. monitor_incoming=false by default. No wallet is monitored without explicit double opt-in |
| Config.toml flat-section rule (no nesting) | [incoming] section with 6 flat keys — no nested TOML objects |
| SettingsService hot-reload for runtime adjustables | incoming_poll_interval, incoming_suspicious_dust_usd, incoming_suspicious_amount_multiplier are runtime adjustable via SettingsService (no daemon restart). incoming_enabled and incoming_mode require restart |
| Existing INotificationChannel unchanged | Add 2 new event type strings to NOTIFICATION_EVENT_TYPES array — no interface breaking change |
| Existing 6 NotificationCategory values | INCOMING_TX_DETECTED maps to 'transaction' category; INCOMING_TX_SUSPICIOUS maps to 'security_alert' category — no new categories needed |

---

## Sources

- Geth official docs, Real-time Events (pubsub): https://geth.ethereum.org/docs/interacting-with-geth/rpc/pubsub — eth_subscribe types, address filtering in logs, 10k notification buffer limit per connection (HIGH confidence)
- Solana official RPC docs, accountSubscribe: https://solana.com/docs/rpc/websocket/accountsubscribe — parameters, commitment levels, return format (HIGH confidence)
- Solana official RPC docs, WebSocket methods index: https://solana.com/docs/rpc/websocket — full subscription method list (HIGH confidence)
- Alchemy, WebSocket Best Practices for Web3: https://www.alchemy.com/docs/reference/best-practices-for-using-websockets-in-web3 — push-only recommendation, filtered subscriptions reduce bandwidth (HIGH confidence)
- QuickNode, Solana WebSocket Subscriptions guide: https://www.quicknode.com/guides/solana-development/getting-started/how-to-create-websocket-subscriptions-to-solana-blockchain-using-typescript — ATA monitoring pattern, reconnect with exponential backoff (MEDIUM confidence)
- CoinTelegraph, Dust attack explained: https://cointelegraph.com/explained/what-is-a-crypto-dusting-attack-and-how-do-you-avoid-it — dust definition, threshold patterns (MEDIUM confidence)
- Trezor, Dusting attacks and airdrop scam tokens: https://trezor.io/support/troubleshooting/coins-tokens/dusting-attacks-airdrop-scam-tokens — isolation strategy, recommended not to spend dust (MEDIUM confidence)
- MetaMask, Introducing Wallet Notifications: https://metamask.io/news/introducing-wallet-notifications — event types supported (receive ETH, tokens, NFTs, staking) (MEDIUM confidence)
- Phantom product update (notifications): https://phantom.com/learn/blog/product-updates-recent-activity-notifications-performance-and-more — opt-in push notification, granular type control (MEDIUM confidence)
- Coinbase, Agentic Wallets launch: https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets — AI agent deposit reaction patterns, programmable guardrails (MEDIUM confidence)
- Chainscore Labs / Solana monitoring guide: https://pandaacademy.medium.com/solana-on-chain-event-monitoring-guide-from-theory-to-practice-6750ee9a3933 — ATA subscription strategy, WebSocket + poll hybrid (MEDIUM confidence — 403 on direct fetch, referenced via search summary)
- WAIaaS internal, m27-00-incoming-transaction-monitoring.md — primary design specification for this milestone (HIGH confidence)
- WAIaaS internal, packages/core/src/enums/notification.ts — current 28 NotificationEventType entries (HIGH confidence)
- WAIaaS internal, packages/core/src/interfaces/IChainAdapter.ts — existing 22-method IChainAdapter interface (HIGH confidence)
- WAIaaS internal, packages/core/src/schemas/signing-protocol.ts — EVENT_CATEGORY_MAP with 6 NotificationCategory values (HIGH confidence)
- WAIaaS internal, packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts — WalletNotificationChannel implementation with category-based filtering (HIGH confidence)

---

*Feature research for: WAIaaS Incoming Transaction Monitoring (m27)*
*Researched: 2026-02-21*
*Mode: Ecosystem — what features exist in the domain, what is expected, what differentiates*
