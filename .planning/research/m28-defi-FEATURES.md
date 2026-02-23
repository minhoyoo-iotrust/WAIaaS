# Feature Landscape

**Domain:** DeFi Protocol Integration for AI Agent Wallet (DEX Swap, Cross-Chain Bridge, Liquid Staking, Gas Optimization)
**Researched:** 2026-02-23
**Overall confidence:** HIGH (objective files + official API docs + ecosystem analysis)

---

## Table Stakes

Features users expect from an AI agent wallet with DeFi protocol support. Missing = product feels incomplete compared to Coinbase AgentKit, Uniswap AI Skills, and similar toolkits.

### 1. DEX Token Swap (Single-Chain)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Solana DEX swap via Jupiter | Jupiter is Solana's dominant aggregator ($1B+ daily volume). Any Solana DeFi wallet must integrate it | Medium | REST API (Quote + /swap-instructions) -> ContractCallRequest. No SDK dependency needed |
| EVM DEX swap via 0x API | 0x covers 19+ EVM chains with 100+ liquidity sources. Broadest chain coverage of any aggregator | Medium | REST API (/swap/allowance-holder/price + /quote) -> calldata -> ContractCallRequest |
| Slippage protection with configurable limits | Users expect guard rails. Uncontrolled slippage = catastrophic loss on low-liquidity pairs | Low | Default/max slippage per provider. Clamp user input to max. Jupiter: bps, 0x/LI.FI: pct |
| Price impact guard (reject high-impact swaps) | Large swaps on thin pools can lose 5-20%. Automatic rejection prevents costly mistakes | Low | priceImpactPct threshold (e.g., 1% Jupiter, vary per provider). Reject with PRICE_IMPACT_TOO_HIGH |
| Quote/estimate before execution | Agent/user must see expected output before committing. Standard in all DEX UIs | Low | resolve() returns quote data (expected output, price impact, route). Display before pipeline execution |
| ERC-20 token approval handling | EVM swaps require token approval before exchange. Failure to handle = swap fails silently | Medium | Auto-detect approval need + execute approve before swap. Details differ by API approach (see critical finding below) |

### 2. Cross-Chain Bridge

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Solana <-> EVM bridging | WAIaaS supports both Solana and EVM wallets. Users expect to move assets between their own wallets | High | LI.FI meta-aggregator (100+ bridges, 40+ chains). REST /quote -> calldata. Confirmed Solana support via Mayan/Wormhole + Jupiter for Solana-side swaps |
| Bridge status tracking (async) | Bridges take minutes to hours. Without status tracking, user has no visibility | High | LI.FI /status API polling. New bridge_status column in transactions table. PENDING -> COMPLETED/FAILED/TIMEOUT |
| Bridge completion notifications | User cannot stare at polling. Must be notified on complete/fail/timeout | Low | Existing 4-channel notification system (Telegram/Discord/ntfy/Slack). New events: BRIDGE_COMPLETED, BRIDGE_FAILED |
| Cross-chain swap (bridge + swap in one) | "Send SOL, receive USDC on Base" is the common ask. Separate bridge + swap = bad DX | Medium | LI.FI handles this natively -- single /quote returns combined route. One ActionProvider call |

### 3. Liquid Staking

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| ETH staking via Lido (stETH) | Lido is DeFi's largest protocol by TVL ($35B). stETH is the most widely supported LST | Medium | Single ABI call: `submit()` with ETH value. viem encodeFunctionData. Contract: 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84 |
| SOL staking via Jito (JitoSOL) | Jito is Solana's largest LST ($3B TVL, 14.3M SOL staked). MEV rewards sharing is unique value | Medium | SPL Stake Pool program deposit instruction. Pool: Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb |
| Unstake (withdraw) for both protocols | Complete lifecycle: stake + unstake. Without unstake, funds are locked | High | Lido: Withdrawal Queue ERC721 NFT (1-5 days). Jito: epoch boundary (~2 days). Both require async tracking |
| Staking position query | "How much do I have staked? What's the APY?" Basic visibility | Medium | GET /v1/wallets/:id/staking endpoint. Query stETH/JitoSOL balances + current APY + USD value |

### 4. Policy Integration

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| CONTRACT_WHITELIST enforcement | WAIaaS default-deny policy. DeFi contracts must be whitelisted before interaction | Low | Existing policy engine. Each protocol's program/contract addresses registered in whitelist |
| SPENDING_LIMIT evaluation on DeFi actions | Swap amount, bridge amount, stake amount all count as spending | Low | resolve() returns amount -> USD conversion via IPriceOracle -> existing 4-tier evaluation |
| Cross-chain policy: source chain evaluation | Bridge spending should be evaluated on the source wallet's policies (where funds leave) | Low | Policy evaluation uses source wallet context. Destination is a receive, not a spend |

### 5. MCP + SDK Exposure

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| MCP tools auto-generated for each action | AI agents interact via MCP. Every ActionProvider action must be a callable tool | Low | Existing v1.5 framework: mcpExpose=true -> automatic MCP tool generation |
| TS/Python SDK support | Programmatic access: executeAction('jupiter_swap', params) | Low | Existing SDK executeAction() method. No new SDK code needed per provider |

---

## Differentiators

Features that set WAIaaS apart from Coinbase AgentKit and other AI agent wallets. Not expected, but valued.

### High Value

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Gas conditional execution | "Execute only when gas < 30 gwei" -- unique for AI agents. Coinbase AgentKit has nothing comparable. Reduces agent logic complexity dramatically | High | New pipeline state GAS_WAITING between Stage 2-3. Background worker polls RPC gas price. DB-persisted for daemon restart resilience. Both EVM (baseFee+priorityFee) and Solana (computeUnitPrice) |
| MEV protection (Jito bundle for Solana swaps) | Prevents sandwich attacks on DEX swaps. Most AI agent wallets do not address MEV | Medium | Jupiter /swap-instructions with Jito tip. forJitoBundle=true on /quote. Tip cost minimal (~1000 lamports = $0.0002) |
| Declarative DeFi via MCP (natural language -> protocol) | Agent says "swap 5 SOL to USDC" -> MCP tool -> resolve -> pipeline -> execute. No protocol knowledge needed by agent | Low | Achieved by design through IActionProvider + MCP auto-conversion. Unique because self-hosted with policy enforcement |
| Unified slippage/safety config across protocols | Single Admin Settings panel to control all DeFi safety parameters. Not per-protocol UI hunting | Low | config.toml [actions.*] + Admin Settings runtime override. Consistent pattern across Jupiter/0x/LI.FI |

### Medium Value

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Admin UI staking dashboard | Visual staking position overview with APY and USD value. Most CLI-first agent wallets lack this | Medium | Admin Dashboard staking section. Renders stETH/JitoSOL positions + APY + USD |
| Provider-level enable/disable | Self-hosted operators choose which DeFi protocols are active. No bloat from unused protocols | Low | config.toml [actions.{provider}] enabled = true/false. Registry only loads enabled providers |
| Bridge estimated time display | LI.FI /quote includes estimated bridge time. Showing this before execution sets user expectations | Low | Extract estimatedTime from LI.FI quote response. Display in resolve() result and notifications |
| Configurable API keys per provider | Each DeFi API has its own key/rate limits. Admin Settings provides centralized key management | Low | 0x (required), Jupiter (optional), LI.FI (optional). Admin Settings > Actions section |

---

## Anti-Features

Features to explicitly NOT build. Over-scoping is the primary risk for DeFi integrations.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Yield farming / LP position management | Extreme complexity (impermanent loss, rebalancing, multi-protocol coordination). 10x scope vs swap/stake. Coinbase AgentKit mentions it but does not ship it well | Defer to future milestone. stETH/JitoSOL via liquid staking covers the "earn yield on idle assets" use case sufficiently |
| Limit orders / TWAP execution | Requires persistent order book monitoring, partial fills, complex state machine. Jupiter has Limit Orders API but it is fundamentally different from swap | Gas conditional execution covers the "wait for better conditions" use case for gas. Token price-based limits can be a future enhancement |
| Leveraged positions / lending (Aave, Compound) | Liquidation risk, health factor monitoring, complex multi-step interactions. Dangerous for autonomous agents | Out of scope for m28. If needed, separate milestone with dedicated risk controls |
| wstETH wrapping / L2 Lido staking | wstETH is non-rebasing wrapper, needed for L2 bridging. Adds complexity for edge case | Support stETH on Ethereum mainnet first. wstETH and L2 staking in future expansion |
| Multi-hop manual route construction | Building custom swap routes across multiple DEXes/bridges manually | Jupiter and 0x handle routing automatically. LI.FI handles cross-chain routing. Trust the aggregators |
| Intent-based / gasless swap protocols | Jupiter Ultra API (gasless, managed execution), 1inch Fusion (gasless via resolvers) | WAIaaS needs full transaction control (custom instructions, CPI, policy enforcement). Gasless APIs remove this control. Jupiter Swap API and 0x AllowanceHolder are correct choices |
| Real-time yield comparison across protocols | "Which protocol has the highest APY right now?" requires live data feeds for dozens of protocols | Show APY for Lido/Jito staking positions only. Do not build a yield aggregator |
| Token sniping / MEV extraction | Ethically questionable, regulatory risk, extreme complexity | WAIaaS is an agent wallet, not a trading bot. MEV protection (defending against attacks) is appropriate. MEV extraction (attacking others) is not |
| Automatic portfolio rebalancing | Agent autonomously deciding when to swap between assets based on targets | This is agent application logic, not wallet infrastructure. WAIaaS provides the tools (swap/stake), agents decide when to use them |

---

## Feature Dependencies

```
[Existing] IActionProvider framework (v1.5)
  |
  +-> packages/actions/ package scaffold (m28-00 design -> m28-01 implementation)
  |     |
  |     +-> JupiterSwapActionProvider (m28-01)
  |     |     +-> JupiterApiClient (Quote + /swap-instructions)
  |     |     +-> Jito MEV protection (forJitoBundle + tip instruction)
  |     |     +-> Slippage control (bps-based)
  |     |
  |     +-> ZeroExSwapActionProvider (m28-02, depends on m28-01 for package structure)
  |     |     +-> ZeroExApiClient (/swap/allowance-holder/price + /quote)
  |     |     +-> AllowanceHolder token approval (standard ERC-20 approve)
  |     |     +-> Multi-chain routing (chainId -> API base URL mapping)
  |     |
  |     +-> LiFiActionProvider (m28-03, depends on m28-01/02 for patterns)
  |     |     +-> LiFiApiClient (/quote + /status)
  |     |     +-> AsyncStatusTracker (bridge polling)  <-- shared pattern
  |     |     +-> DB migration: bridge_status + GAS_WAITING state (single migration)
  |     |
  |     +-> LidoStakingActionProvider (m28-04, parallel-safe after m28-01)
  |     |     +-> LidoContractHelper (viem ABI encode for submit/requestWithdrawals)
  |     |     +-> Withdrawal Queue ERC721 NFT (async claim tracking)
  |     |
  |     +-> JitoStakingActionProvider (m28-04, parallel-safe after m28-01)
  |           +-> JitoStakeHelper (SPL Stake Pool program instructions)
  |           +-> Epoch boundary unstake (async)
  |
  +-> Staking position API (m28-04)
  |     +-> GET /v1/wallets/:id/staking
  |     +-> Admin Dashboard staking section
  |
  +-> GasConditionEvaluator (m28-05, depends on m28-03 DB migration)
        +-> GAS_WAITING pipeline state (9-state machine)
        +-> GasConditionWorker (background polling, DB-persisted)
        +-> Admin Settings gas_condition section

[Existing] Policy Engine (12 PolicyTypes)
  +-> CONTRACT_WHITELIST enforcement for all providers
  +-> SPENDING_LIMIT USD evaluation for all DeFi amounts

[Existing] IPriceOracle
  +-> USD conversion for swap/bridge/stake amounts
  +-> stETH/JitoSOL valuation for staking positions

[Existing] Notification System (4 channels)
  +-> Bridge complete/fail/timeout notifications
  +-> Gas condition met/cancelled notifications
  +-> Unstake complete notifications
```

---

## MVP Recommendation

### Phase 1: Common Design (m28-00)

Design-only phase. Produces DEFI-01 through DEFI-05 deliverables consumed by all implementation phases.

Addresses:
- packages/actions/ directory structure
- REST API -> calldata common pattern (ActionApiClient base)
- Policy integration flow (CONTRACT_WHITELIST, SPENDING_LIMIT)
- AsyncStatusTracker interface (bridge polling, unstake tracking)
- Test strategy (mock API patterns, test helpers)

### Phase 2: Jupiter Swap (m28-01)

Prioritize because:
1. First ActionProvider implementation validates the entire framework end-to-end
2. Establishes packages/actions/ package structure reused by all subsequent providers
3. Solana is WAIaaS's primary chain -- highest user demand
4. Jupiter API is well-documented, no API key required, simplest integration of the four

Includes:
- packages/actions/ scaffolding (package.json, tsconfig, turbo integration)
- JupiterSwapActionProvider + JupiterApiClient
- Slippage control + priceImpact guard
- Jito MEV protection (forJitoBundle=true + tip instruction)
- MCP tool auto-exposure (waiaas_jupiter_swap)
- CONTRACT_WHITELIST + SPENDING_LIMIT integration
- 12+ tests with mock API responses

### Phase 3: 0x EVM Swap (m28-02)

Prioritize because:
1. Validates EVM-side ActionProvider pattern (complement to Solana Jupiter)
2. Reuses package structure from m28-01 with minimal new abstractions
3. 19+ chain coverage immediately (Ethereum, Base, Arbitrum, Polygon, etc.)

**CRITICAL DESIGN CORRECTION:** Use AllowanceHolder endpoint (`/swap/allowance-holder/quote`) instead of Permit2. 0x official docs recommend AllowanceHolder for server-side integrations: simpler flow, lower gas, single signature, no EIP-712 signing complexity. Permit2 is better for browser wallets with existing Permit2 approvals. The m28-02 objective file should be updated before implementation.

### Phase 4: LI.FI Bridge (m28-03)

Prioritize because:
1. Cross-chain is the highest-complexity feature -- needs more stabilization time
2. Introduces the only DB migration in this milestone (bridge_status + GAS_WAITING)
3. AsyncStatusTracker pattern is shared with unstake tracking in m28-04

### Phase 5: Liquid Staking (m28-04)

Can partially parallelize with m28-03 because:
1. No dependency on bridge implementation, only on m28-01 package structure
2. Lido is direct ABI call (no REST API client needed)
3. Jito is direct program instruction (no REST API client needed)
4. Unstake async tracking reuses AsyncStatusTracker pattern from design

### Phase 6: Gas Conditional Execution (m28-05)

Last because:
1. Depends on m28-03 DB migration (GAS_WAITING state already added)
2. DeFi protocols should be stable before adding execution conditions
3. Cross-cutting concern -- touches pipeline, MCP, SDK, Admin, notifications

**Defer:** Yield farming, lending, limit orders, wstETH, L2 staking, portfolio rebalancing

---

## Complexity Budget

| Provider | Est. Files | Est. Tests | Est. LOC | DB Migration | API Key |
|----------|-----------|------------|----------|-------------|---------|
| Common Design (m28-00) | 0 (design docs) | 0 | 0 | Design only | N/A |
| Jupiter Swap (m28-01) | 10-15 | 12-18 | ~1,500 | None | Optional |
| 0x EVM Swap (m28-02) | 12-16 | 14-20 | ~1,800 | None | Required |
| LI.FI Bridge (m28-03) | 12-16 | 14-20 | ~2,000 | 1 (bridge_status + GAS_WAITING) | Optional |
| Lido + Jito Staking (m28-04) | 15-20 | 14-20 | ~2,200 | None | None |
| Gas Conditional (m28-05) | 10-15 | 12-16 | ~1,200 | None (reuses m28-03) | None |
| **Total** | **~65** | **~70** | **~8,700** | **1** | **1 required (0x)** |

---

## Critical Findings

### 1. 0x AllowanceHolder vs Permit2

**Confidence: HIGH** (0x official documentation is unambiguous)

The m28-02 objective specifies Permit2 (`/swap/permit2/price`, `/swap/permit2/quote`). However, 0x documentation explicitly recommends AllowanceHolder for server-side integrations:

- **AllowanceHolder**: single signature, lower gas, simpler integration, no EIP-712 signing. Standard ERC-20 approve flow.
- **Permit2**: double signature (approval + trade), higher gas, complex EIP-712 signing, better for browser wallets with existing Permit2 approvals.

WAIaaS is a daemon (server-side, non-interactive signing). AllowanceHolder is the correct choice. This changes:
- API endpoints from `/swap/permit2/*` to `/swap/allowance-holder/*`
- Removes Permit2 EIP-712 signature complexity entirely
- Simplifies to standard ERC-20 approve + swap flow (already supported by APPROVE type in pipeline)
- 0x documentation states: "AllowanceHolder is the default and recommended allowance contract for most integrators"

**Action required:** Update m28-02 objective file before implementation begins.

### 2. Jupiter Ultra API vs Swap API

**Confidence: HIGH** (Jupiter official docs clearly differentiate)

Jupiter now offers two APIs:
- **Ultra API**: Managed execution, gasless, automatic slippage, sub-second landing. RPC-less. "Spiritual successor to Swap API."
- **Swap API (Metis)**: Full transaction control, custom instructions, CPI support, choose broadcasting strategy.

WAIaaS must use **Swap API (Metis)**, not Ultra API. Reasons:
1. Ultra API removes transaction control (WAIaaS needs 6-stage pipeline)
2. Ultra API does not return individual instructions (WAIaaS needs ContractCallRequest mapping)
3. Ultra API manages signing internally (WAIaaS has its own signing with approval workflow)
4. Swap API supports Jito bundle integration via `forJitoBundle` parameter on /quote

The m28-01 objective correctly specifies Swap API v1 (`/swap/v1/quote`, `/swap-instructions`). No correction needed.

### 3. Lido Withdrawal is ERC-721 NFT-Based

**Confidence: HIGH** (Lido official contract docs)

Lido unstake is not a simple "withdraw ETH" call. The WithdrawalQueueERC721 contract:
1. `requestWithdrawals(amounts, owner)` -- mints an ERC-721 NFT representing the withdrawal request
2. Wait 1-5 days for Lido to process the batch
3. `claimWithdrawals(requestIds, hints)` -- burns the NFT and sends ETH to owner

This means unstake requires **two separate transactions** (request + claim) separated by days. The objective file mentions the Withdrawal Queue but does not explicitly address the two-transaction flow. The AsyncStatusTracker must track the NFT request ID and poll `getWithdrawalStatus()` to know when claimable.

### 4. LI.FI Confirmed Solana Support

**Confidence: HIGH** (LI.FI official announcements + docs)

LI.FI Solana support is confirmed and operational:
- Bridges: Mayan (Wormhole), Circle CCTP
- DEX: Jupiter (switched to official Jupiter API in April 2025)
- Solana-specific documentation at docs.li.fi/li.fi-api/solana

The m28-03 objective's Solana <-> EVM bridging scenario is validated.

---

## Competitive Landscape Summary

| Feature | WAIaaS (planned) | Coinbase AgentKit | Uniswap AI Skills |
|---------|-----------------|-------------------|-------------------|
| Solana DEX swap | Jupiter (full control) | Not supported (Base/EVM only) | Not supported |
| EVM DEX swap | 0x (19+ chains) | CDP Swap API (Base focus) | Uniswap direct (Ethereum/L2) |
| Cross-chain bridge | LI.FI (40+ chains) | Not mentioned | Not supported |
| Liquid staking | Lido + Jito | Mentioned, unclear impl | Not supported |
| Gas optimization | Conditional execution (unique) | Not supported | Not supported |
| Policy enforcement | 12 PolicyTypes, default-deny | "Programmable guardrails" | Not mentioned |
| Self-hosted | Yes (daemon) | No (Coinbase cloud) | No (requires infra) |
| MCP integration | Native (auto-conversion) | Not native | Not native |

WAIaaS differentiators: self-hosted control, multi-chain (Solana+EVM), gas conditional execution, policy-enforced DeFi, MCP-native.

---

## Sources

### Protocol API Documentation (HIGH confidence)
- [Jupiter Swap API Documentation](https://dev.jup.ag/docs/swap-api/build-swap-transaction)
- [Jupiter Ultra API vs Swap API](https://hub.jup.ag/docs/ultra-api/)
- [Jupiter API Reference](https://dev.jup.ag/api-reference)
- [0x Swap API v2 Introduction](https://0x.org/docs/0x-swap-api/introduction)
- [0x AllowanceHolder Guide](https://0x.org/docs/0x-swap-api/guides/swap-tokens-with-0x-swap-api)
- [0x Permit2 Guide](https://0x.org/docs/0x-swap-api/guides/swap-tokens-with-0x-swap-api-permit2)
- [0x Contracts: AllowanceHolder & Permit2](https://0x.org/docs/developer-resources/core-concepts/contracts)
- [LI.FI API Documentation](https://docs.li.fi/)
- [LI.FI Solana Documentation](https://docs.li.fi/li.fi-api/solana)
- [LI.FI Solana Expansion Announcement](https://li.fi/knowledge-hub/li-fi-expands-to-solana/)
- [Lido stETH Contract Documentation](https://docs.lido.fi/contracts/lido/)
- [Lido WithdrawalQueueERC721](https://docs.lido.fi/contracts/withdrawal-queue-erc721/)
- [Jito Foundation Liquid Staking](https://www.jito.network/docs/jitosol/liquid-staking-basics/)
- [Jito Technical FAQs](https://www.jito.network/docs/jitosol/faqs/technical-faqs/)

### Competitive Landscape (MEDIUM confidence)
- [Coinbase AgentKit Documentation](https://docs.cdp.coinbase.com/agent-kit/welcome)
- [Coinbase Agentic Wallets](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets)
- [Uniswap AI Skills Announcement](https://www.cryptotimes.io/2026/02/21/uniswap-rolls-out-7-ai-skills-for-automated-defi-execution/)

### Ecosystem Analysis (MEDIUM confidence)
- [DeFAI: How AI agents can be used in DeFi](https://cow.fi/learn/how-ai-agents-can-be-used-in-defi)
- [Integrating AI Agents into Crypto Wallets for DeFi](https://medium.com/@gwrx2005/integrating-ai-agents-into-crypto-wallets-for-defi-frameworks-strategies-and-challenges-81e0cdf13bf3)
- [DEX Aggregators and Slippage Protection](https://cointelegraph.com/news/dex-aggregators-the-ultimate-solution-to-reduce-price-slippage-in-defi)
