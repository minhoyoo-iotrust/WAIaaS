# Feature Landscape: Advanced DeFi Protocol Integration

**Domain:** Lending (Aave V3 / Kamino / Morpho), Yield Tokenization (Pendle PT/YT), Perpetual Trading (Drift), Position Tracking, DeFi Monitoring (HealthFactor / Maturity / Margin), Intent-Based Trading (CoW Protocol EIP-712)
**Researched:** 2026-02-26
**Overall confidence:** HIGH (official protocol docs + SDK analysis + codebase review + competitive analysis)

---

## Table Stakes

Features users expect from an AI agent wallet with advanced DeFi protocol support. Missing = product cannot compete with Coinbase AgentKit (which integrates Morpho lending and yield monitoring), LiquidityGuard AI, or dedicated DeFi agent frameworks.

### 1. Lending Protocol Integration (ILendingProvider)

**Why this matters:** Lending is the largest DeFi category by TVL ($35B+ Aave alone). AI agents managing idle capital must be able to supply collateral, borrow against it, and maintain healthy positions. Without lending, the wallet is limited to swaps and staking -- insufficient for autonomous DeFi management.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Aave V3 supply (deposit collateral) | Aave is the dominant EVM lending protocol. Supply is the entry point for earning interest + enabling borrowing | Medium | viem ABI encoding, ERC-20 approve before supply | Pool.supply(asset, amount, onBehalfOf, 0). Returns aToken receipt. Deployed on Ethereum, Base, Arbitrum, Polygon, Optimism. Pool address: 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2 (Ethereum) |
| Aave V3 borrow (draw loan against collateral) | Core lending operation. Agent borrows stablecoins against volatile collateral for DeFi operations | High | Health factor check BEFORE borrow to prevent immediate liquidation risk | Pool.borrow(asset, amount, 2, 0, onBehalfOf). interestRateMode=2 (variable only in V3). Must verify HF > 1.0 after simulated borrow |
| Aave V3 repay (return borrowed asset) | Complete lending lifecycle. Without repay, positions accumulate interest indefinitely | Medium | ERC-20 approve of debt token before repay | Pool.repay(asset, amount, 2, onBehalfOf). Use type(uint256).max for full debt repay |
| Aave V3 withdraw (redeem aTokens for underlying) | Exit strategy. Agent must be able to recover supplied capital | Medium | Health factor check -- withdraw reduces collateral, may trigger liquidation | Pool.withdraw(asset, amount, to). Use type(uint).max for full balance. Must check HF after simulated withdrawal |
| Kamino Lend supply + borrow (Solana equivalent) | Kamino is Solana's largest lending protocol. Solana agents need lending parity with EVM | High | @kamino-finance/klend-sdk for instruction building, KaminoMarket.load() for market data | KaminoAction.buildDepositTxns() / buildBorrowTxns(). Instruction-level integration, not REST API |
| Health Factor query | Agent MUST know position health before any action. Without HF visibility, agent operates blind | Medium | Aave: getUserAccountData() returns HF directly. Kamino: SDK obligation calculation | Aave HF = (totalCollateral * liquidationThreshold) / totalDebt. HF < 1 = liquidation eligible |
| Position summary query | "What are my lending positions?" -- basic visibility for agent decision-making | Medium | Aave: Pool view functions for user reserves. Kamino: obligation account deserialization | Returns: supplied assets + aToken balances, borrowed assets + debt, current HF, current LTV |

### 2. Yield Tokenization (Pendle PT/YT)

**Why this matters:** Pendle is the dominant yield tokenization protocol ($5B+ TVL), enabling fixed-yield strategies that are uniquely valuable for AI agents: buy PT at discount, hold to maturity, receive guaranteed fixed return. This is the DeFi equivalent of a bond -- a crucial tool for agents managing treasury.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Buy PT (Principal Token) with underlying | Core fixed-yield entry: buy discounted PT, hold to maturity, redeem at par. Agent locks in fixed APY | High | Pendle Router swapExactTokenForPt(). Requires market address, ApproxParams for slippage. Flash swap mechanics | EVM-only (Ethereum, Arbitrum). Pendle Solana deployment is PT-only via CCIP/Kamino bridge -- not full protocol |
| Sell PT for underlying | Exit before maturity or take profit. PT trades at discount that narrows as maturity approaches | Medium | Pendle Router swapExactPtForToken(). Requires PT approval | Liquidity varies by market; near-expiry markets may have thin liquidity |
| Buy YT (Yield Token) | Speculative yield position: long future yield at leveraged exposure. Higher risk, higher potential return | High | Pendle Router swapExactTokenForYt(). Flash swap + approximation logic | YT value decays to 0 at maturity. Agent must understand time decay |
| Redeem PT at maturity | Post-maturity, PT redeems 1:1 for underlying SY token. Core value proposition of fixed yield | Low | Pendle Router redeemPyToToken(). Only PT needed post-maturity (no YT required) | Must track maturity dates per position |
| Market/pool discovery | Agent needs to know which PT/YT markets exist, their APYs, and maturity dates | Medium | Pendle API or on-chain market enumeration. Each market = specific underlying + maturity date | Required for agent to make informed PT purchase decisions |

### 3. Perpetual Trading (Drift Protocol)

**Why this matters:** Perpetual futures enable hedging and leveraged speculation -- core operations for sophisticated AI agents. Drift is Solana's dominant perps platform with up to 101x leverage, cross-margin, and deep liquidity.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Open perp position (long/short) | Core perp operation: agent expresses directional view with leverage | Very High | @drift-labs/sdk required (complex instruction building, BN precision, oracle integration). Cannot use REST API alone | SDK uses BigNum (BN) for all values. DriftClient initialization requires market subscription |
| Close perp position | Exit strategy. Agent must be able to close winning or losing positions | High | DriftClient.cancelAndPlaceOrders() or market close. Position tracking via getUser() | Must handle partial close vs full close |
| Place limit/trigger orders | Non-market order types for agent's conditional strategies (take-profit, stop-loss) | High | DriftClient.placePerpOrder() with orderType variants. On-chain order book | Order types: MARKET, LIMIT, TRIGGER_MARKET, TRIGGER_LIMIT, ORACLE |
| Margin query + free collateral | Agent must know available margin before opening positions. Margin call prevention | Medium | DriftClient getUser() -> calculateFreeCollateral(), getMarginRequirement() | Cross-margin across all perp positions and spot balances |
| Position PnL query | "What is my current P&L?" for agent decision-making | Medium | getUser().getPerpPosition(marketIndex) -> baseAssetAmount, quoteAssetAmount, unrealizedPnl | Mark price vs entry price, including funding payments |
| Funding rate query | Funding rate affects position profitability over time. Agent needs to factor this in | Low | DriftClient.getPerpMarketAccount(marketIndex).amm.lastFundingRate | Updated hourly. Critical for carry trade strategies |

### 4. Position Tracking (PositionTracker)

**Why this matters:** Across lending + yield + perps, an agent manages multiple concurrent positions. Without unified tracking, the agent cannot make informed cross-protocol decisions about capital allocation.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Unified position inventory | Single query: "what are all my DeFi positions?" across protocols | Medium | Aggregate from ILendingProvider.getPositions(), Pendle market queries, Drift getUser() | Returns normalized PositionSummary[] with protocol, type, amounts, health metrics |
| Position value in USD | All positions valued in common denominator for portfolio-level decisions | Low | Existing IPriceOracle + CAIP-19 asset identification | LST positions use exchange-rate-to-base-asset method (existing pattern from v28.4) |
| Position state persistence | Positions must survive daemon restarts. Track open/close lifecycle | Medium | New DB table: defi_positions (walletId, protocol, type, metadata JSON, status, opened_at, closed_at) | IAsyncStatusTracker already provides the polling pattern |
| REST API: GET /v1/wallets/:id/positions | Agent/Admin needs HTTP access to position data | Medium | New endpoint aggregating from position DB + live chain queries | Merge DB persisted state with on-chain current values |
| MCP tool: get_defi_positions | AI agents access positions via MCP | Low | Auto-generated from ActionProvider with mcpExpose=true | Standard MCP tool pattern |

### 5. DeFi Monitoring Service

**Why this matters:** DeFi positions are not "set and forget." Health factors change with price movements, PT maturities arrive, and margin requirements shift. Without proactive monitoring, an agent's positions can be liquidated without warning. This is THE critical safety layer.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Health Factor monitoring (Aave/Kamino) | Poll HF at interval, alert when approaching liquidation threshold | High | On-chain HF query per lending position. Configurable thresholds (WARNING at 1.5, CRITICAL at 1.2, DANGER at 1.05) | Aave: getUserAccountData() single call. Kamino: obligation recalculation. Both need per-position polling |
| Maturity monitoring (Pendle PT/YT) | Alert agent when PT position approaches maturity for redemption | Medium | Track maturity timestamps per PT position. Alert at configurable lead time (7d, 1d, 1h before) | YT positions that reach maturity without being sold/redeemed lose all remaining yield value |
| Margin monitoring (Drift) | Alert when free margin drops below threshold, prevent forced liquidation | High | Drift getUser() margin calculation. Configurable free-margin threshold | Drift liquidation = oracle price based. Must use same oracle source as Drift |
| Multi-channel alert routing | Monitoring alerts use existing 4-channel notification system (Telegram/Discord/ntfy/Slack) | Low | Existing NotificationService + WalletNotificationChannel | New event types: HF_WARNING, HF_CRITICAL, PT_MATURITY_APPROACHING, MARGIN_LOW, POSITION_LIQUIDATED |
| Auto-action on critical threshold (optional) | Configurable: auto-repay on HF critical, auto-redeem on PT maturity | Very High | Requires PositionTracker + ILendingProvider + policy engine integration for auto-actions | This is the "AI agent safety net" -- the wallet itself takes protective action |

### 6. Policy Integration for DeFi Positions

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| CONTRACT_WHITELIST for lending/perp contracts | Aave Pool, Kamino program, Drift program, Pendle Router must be whitelisted | Low | Existing policy engine. Provider-managed whitelist bundles (pattern from v28.0) | Critical: each protocol has multiple contract addresses per chain |
| SPENDING_LIMIT on supply/borrow/position-open | All capital deployment counts against spending limits | Low | resolve() returns amount -> USD conversion -> existing 4-tier evaluation | Borrow actions: evaluate the borrowed amount, not the collateral |
| MAX_LEVERAGE policy (new) | Prevent agents from opening excessively leveraged perp positions | Medium | New PolicyType: MAX_LEVERAGE with configurable multiplier per wallet | Drift supports up to 101x. Default policy should cap at 5x or 10x |
| MAX_BORROW_UTILIZATION policy (new) | Prevent agents from borrowing up to liquidation threshold | Medium | New PolicyType: ensure post-borrow HF >= minHealthFactor (e.g., 1.5) | Evaluated at borrow time. Prevents "borrow to 99% LTV" scenarios |

---

## Differentiators

Features that set WAIaaS apart from Coinbase AgentKit and other AI agent wallets. Not expected, but highly valued for advanced DeFi use cases.

### High Value

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Intent-based trading via CoW Protocol | MEV-protected swaps via EIP-712 signed intents. Solvers compete for best execution. No direct on-chain transaction from wallet | Very High | @cowprotocol/cow-sdk for order signing. EIP-712 domain separator. Off-chain order submission to CoW API. Solver settlement | Fundamentally different from ActionProvider resolve() pattern: no calldata returned, order is signed and submitted off-chain. Batch auction settlement. EVM-only |
| Proactive HF defender (auto-repay/deleverage) | When HF drops to CRITICAL, wallet auto-executes repay or collateral top-up without human intervention. The "kill switch for liquidation" | Very High | ILendingProvider.repay() + PositionTracker + DeFiMonitorService + policy engine approval bypass for emergency actions | Unique value: most agent wallets alert but do not auto-act. WAIaaS can be the safety net that prevents liquidation losses |
| Cross-protocol position dashboard (Admin UI) | Single Admin UI page showing all DeFi positions: lending HF, PT maturity timelines, perp PnL, margin utilization | High | PositionTracker REST API + Admin UI components | Coinbase AgentKit has no admin dashboard. This is a self-hosted operator advantage |
| Fixed yield strategy via MCP | "Lock 10 ETH at 5% fixed yield for 6 months" -> MCP tool -> Pendle PT purchase -> maturity tracking -> auto-redeem | High | Pendle integration + maturity monitoring + auto-redeem action | Bridges traditional finance "fixed income" concept to DeFi via natural language |
| Unified DeFi health dashboard notification | Daily/weekly digest of all position health across protocols. "Your portfolio: 3 lending positions (HF avg 2.1), 2 PT positions (nearest maturity: 45 days), 1 perp position (+$340 unrealized)" | Medium | PositionTracker + NotificationService + templated message formatting | Quality-of-life feature that reduces monitoring burden on operators |

### Medium Value

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Lending APY comparison across protocols | "Which protocol offers best supply rate for USDC?" across Aave/Kamino/Morpho | Medium | On-chain rate queries per protocol. Normalize to common APY format | Useful for agent capital allocation decisions |
| Provider-level enable/disable for advanced protocols | Operator chooses which advanced DeFi protocols are active. Security-conscious operators can disable perps entirely | Low | Existing config.toml [actions.{name}] enabled pattern | Aligns with self-hosted philosophy: operator controls risk exposure |
| Position history and analytics | Track historical positions: entry/exit prices, duration, realized PnL | Medium | DB table extension with position lifecycle events | Useful for operator review of agent performance |
| Morpho Blue isolated market lending | Alternative to Aave with isolated risk: each market has its own collateral/loan pair. No cross-contamination | High | morpho-org/blue-sdk-viem for TypeScript integration. Singleton contract pattern. MarketParams identification | Morpho is simpler contract-wise but market discovery is more complex |

---

## Anti-Features

Features to explicitly NOT build. These represent scope creep, excessive risk for autonomous agents, or fundamentally different products.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Automated yield farming / LP management | Impermanent loss, rebalancing complexity, multi-protocol coordination. 10x scope. Coinbase mentions it but does not ship it well | Provide lending supply (earn interest) and Pendle PT (fixed yield) as yield strategies. These are simpler, lower-risk alternatives |
| Custom liquidation bot (run liquidations on others) | MEV extraction role, not wallet infrastructure role. Ethical concerns. High capital requirements | Focus on liquidation PREVENTION (HF monitoring + auto-repay). The wallet protects its own positions, does not attack others |
| Advanced perp strategies (grid trading, basis trading, funding rate arbitrage) | Agent application logic, not wallet infrastructure. Requires persistent order management, complex state machines | Provide the primitives (open/close/query) and let agent frameworks build strategies. WAIaaS is the execution layer |
| Cross-margin across protocols | Combining Aave collateral with Drift margin in a unified margin calculation is protocol-impossible and extremely dangerous | Track positions per protocol independently. Show unified view in dashboard but never combine margin calculations |
| Pendle LP provision | Providing liquidity to Pendle PT/SY pools requires impermanent loss management, fee optimization, and active rebalancing | Buying/selling PT and YT via Router is sufficient. LP is a separate, more complex operation |
| Morpho Vault curation | Creating and managing Morpho Vaults (curated lending pools) is a DeFi protocol operator task, not an agent wallet task | Support supply/borrow via existing Morpho markets. Do not build vault creation/management |
| CoW Protocol solver implementation | Building a solver is a MEV/market-making operation requiring significant capital and infrastructure | Integrate as order submitter only. Use CoW SDK to sign and submit intents, let existing solvers compete |
| Drift market making / JIT liquidity | Providing liquidity on Drift is a professional market-making operation | Support trading (open/close positions, orders) only |
| Automatic portfolio rebalancing across protocols | Deciding when to move capital between lending/staking/perps is agent application logic | Provide position queries and execution primitives. Agent decides allocation |
| Flash loan strategies | Flash loans are for MEV extraction, arbitrage, and liquidation -- not wallet operations | Not in scope. If needed in future, separate milestone with dedicated risk analysis |

---

## Feature Dependencies

```
[Existing] IActionProvider framework (v1.5) + @waiaas/actions package (v28.1)
  |
  +-> ILendingProvider interface (NEW - extends IActionProvider pattern)
  |     |
  |     +-> AaveLendingProvider (EVM: supply/borrow/repay/withdraw)
  |     |     +-> Aave Pool ABI encoding (viem, like Lido pattern)
  |     |     +-> getUserAccountData() for health factor
  |     |     +-> aToken balance tracking
  |     |     +-> Multi-chain: Ethereum/Base/Arbitrum/Polygon/Optimism
  |     |
  |     +-> KaminoLendingProvider (Solana: supply/borrow/repay/withdraw)
  |     |     +-> @kamino-finance/klend-sdk for instruction building
  |     |     +-> KaminoMarket.load() for reserve data
  |     |     +-> Obligation account for health status
  |     |
  |     +-> MorphoLendingProvider (EVM: supplyCollateral/borrow/repay/withdrawCollateral)
  |           +-> morpho-org/blue-sdk-viem for market queries
  |           +-> Singleton contract pattern (single address all markets)
  |           +-> MarketParams identification per market
  |
  +-> IYieldProvider interface (NEW)
  |     |
  |     +-> PendleYieldProvider (EVM: buy PT/sell PT/buy YT/redeem)
  |           +-> Pendle Router ABI encoding
  |           +-> Market discovery (list markets + APY + maturity)
  |           +-> ApproxParams for swap slippage (Pendle-specific)
  |           +-> Flash swap mechanics for YT trading
  |
  +-> IPerpProvider interface (NEW)
  |     |
  |     +-> DriftPerpProvider (Solana: open/close/order/query)
  |           +-> @drift-labs/sdk (REQUIRED - complex instruction building)
  |           +-> DriftClient initialization + market subscription
  |           +-> BN precision handling (Solana token precision)
  |           +-> Oracle integration for mark/index price
  |
  +-> PositionTracker service (NEW)
  |     +-> DB: defi_positions table (walletId, protocol, type, metadata, status)
  |     +-> Aggregates from all providers: lending + yield + perp
  |     +-> REST API: GET /v1/wallets/:id/positions
  |     +-> MCP tool: get_defi_positions
  |
  +-> DeFiMonitorService (NEW)
  |     +-> Health Factor polling (Aave/Kamino)
  |     +-> Maturity tracking (Pendle PT)
  |     +-> Margin monitoring (Drift)
  |     +-> Alert routing via existing NotificationService
  |     +-> Optional: auto-action on critical thresholds
  |
  +-> IntentProvider interface (NEW - different from IActionProvider)
  |     |
  |     +-> CoWIntentProvider (EVM: EIP-712 signed order -> off-chain submission)
  |           +-> @cowprotocol/cow-sdk for order signing
  |           +-> EIP-712 domain separator construction
  |           +-> Order Book API submission (not on-chain tx)
  |           +-> Solver settlement monitoring
  |
  +-> New PolicyTypes (extensions)
        +-> MAX_LEVERAGE (cap perp leverage per wallet)
        +-> MAX_BORROW_UTILIZATION (minimum HF after borrow)
        +-> DEFI_PROTOCOL_ALLOWLIST (which protocols enabled per wallet)

[Existing] Policy Engine (12 PolicyTypes)
  +-> CONTRACT_WHITELIST for Aave/Kamino/Pendle/Drift/Morpho/CoW contracts
  +-> SPENDING_LIMIT USD evaluation for supply/borrow/position amounts

[Existing] IPriceOracle (Pyth + CoinGecko)
  +-> USD valuation for all positions
  +-> aToken/debtToken/PT/YT valuation

[Existing] IAsyncStatusTracker
  +-> Reuse polling pattern for position monitoring
  +-> Health factor check as async tracker variant

[Existing] Notification System (4 channels + wallet notification)
  +-> HF_WARNING, HF_CRITICAL, HF_DANGER
  +-> PT_MATURITY_APPROACHING, PT_MATURITY_REACHED
  +-> MARGIN_LOW, MARGIN_CRITICAL
  +-> POSITION_LIQUIDATED
  +-> DEFI_DIGEST (daily/weekly summary)
```

---

## MVP Recommendation

### Phase 1: Lending Framework + Aave V3 (highest priority)

Prioritize because:
1. Lending is the largest DeFi category by TVL and the most requested by AI agent operators
2. Establishes ILendingProvider interface reused by Kamino and Morpho
3. Aave V3 has the simplest integration (4 ABI calls on Pool contract, no SDK dependency)
4. Health factor query is the foundation for DeFiMonitorService
5. Direct ABI encoding pattern already proven by LidoStakingActionProvider

Addresses:
- AaveLendingProvider: supply, borrow, repay, withdraw (4 actions)
- Health factor query via getUserAccountData()
- aToken balance tracking for position visibility
- CONTRACT_WHITELIST integration with Aave Pool addresses per chain
- SPENDING_LIMIT evaluation on supply and borrow amounts

### Phase 2: Position Tracking + DeFi Monitoring

Prioritize because:
1. Monitoring is the critical safety layer -- without it, lending positions are dangerous for autonomous agents
2. PositionTracker is required by all subsequent providers (yield, perps)
3. DeFiMonitorService establishes the health-factor polling pattern
4. Admin UI position dashboard provides operator visibility

Addresses:
- PositionTracker service + DB table (defi_positions)
- DeFiMonitorService: HF polling for Aave
- New notification events (HF_WARNING, HF_CRITICAL)
- REST API: GET /v1/wallets/:id/positions
- Admin UI: Positions panel

### Phase 3: Kamino Lending (Solana parity)

Prioritize because:
1. Solana is WAIaaS's primary chain -- lending parity with EVM is essential
2. Reuses ILendingProvider interface from Phase 1
3. Kamino is Solana's dominant lending protocol
4. DeFiMonitorService extends to Kamino health monitoring

Addresses:
- KaminoLendingProvider: supply, borrow, repay, withdraw
- Health factor calculation via obligation account
- DeFiMonitorService extension for Kamino

### Phase 4: Pendle Yield Tokenization (EVM)

Prioritize because:
1. Fixed yield is uniquely valuable for AI agents (predictable returns)
2. PT maturity tracking extends DeFiMonitorService
3. Lower risk than perps (principal protected at maturity)

Addresses:
- PendleYieldProvider: buy PT, sell PT, buy YT, redeem at maturity
- Market discovery (list markets, APY, maturity)
- Maturity monitoring via DeFiMonitorService
- PT_MATURITY_APPROACHING notifications

### Phase 5: Drift Perpetual Trading (Solana)

Prioritize later because:
1. Highest complexity (requires @drift-labs/sdk, BN precision, oracle integration)
2. Highest risk for autonomous agents (leverage + liquidation)
3. Requires new policy types (MAX_LEVERAGE, margin monitoring)
4. SDK dependency is unavoidable -- cannot use REST API alone for instruction building

Addresses:
- DriftPerpProvider: open/close position, place orders, query PnL
- Margin monitoring via DeFiMonitorService
- MAX_LEVERAGE policy type
- MARGIN_LOW / MARGIN_CRITICAL notifications

### Phase 6: CoW Protocol Intent Trading (EVM)

Prioritize last because:
1. Fundamentally different from ActionProvider resolve() pattern (off-chain order, not on-chain tx)
2. Requires new IntentProvider interface alongside IActionProvider
3. EIP-712 signing requires special handling in keyStore
4. Value is incremental over 0x swap (better MEV protection, but higher complexity)

Addresses:
- CoWIntentProvider: create order, sign EIP-712, submit to Order Book API
- Solver settlement monitoring
- Batch auction result tracking

**Defer:** Morpho Blue lending (can be Phase 3.5 if demand warrants -- similar to Aave but with isolated market complexity), auto-action on critical thresholds (Phase 2.5 after monitoring proves stable), lending APY comparison (nice-to-have after all protocols integrated).

---

## Complexity Budget

| Component | Est. Files | Est. Tests | Est. LOC | DB Migration | External SDK |
|-----------|-----------|------------|----------|-------------|-------------|
| Aave V3 Lending | 10-14 | 15-22 | ~2,000 | 1 (defi_positions table) | None (viem ABI only) |
| PositionTracker + Monitor | 12-16 | 18-25 | ~2,500 | Shared with above | None |
| Kamino Lending | 10-14 | 12-18 | ~1,800 | None | @kamino-finance/klend-sdk |
| Pendle Yield | 12-16 | 14-20 | ~2,200 | None | None (viem ABI) |
| Drift Perps | 14-18 | 16-24 | ~2,800 | None | @drift-labs/sdk (required) |
| CoW Protocol Intent | 10-14 | 12-18 | ~1,800 | 1 (intent_orders table) | @cowprotocol/cow-sdk |
| New Policy Types (2-3) | 4-6 | 8-12 | ~600 | 1 (policy_types extension) | None |
| Admin UI Positions | 6-10 | 8-12 | ~1,500 | None | None |
| **Total** | **~80-110** | **~105-155** | **~15,200** | **3** | **3 npm packages** |

---

## Critical Technical Findings

### 1. Drift SDK is Mandatory (Cannot Use REST API Alone)

**Confidence: HIGH** (Drift official docs + SDK analysis)

Unlike Jupiter/0x/LI.FI which expose REST APIs that return transaction data, Drift's on-chain program requires complex instruction building with specific account layouts, oracle integrations, and BN precision handling. The @drift-labs/sdk is the ONLY practical way to construct valid Drift instructions. This is a significant architectural decision because it introduces a heavy npm dependency (~50+ transitive packages) and ties WAIaaS to Drift's SDK versioning.

**Impact:** DriftPerpProvider cannot follow the "native fetch + Zod validation" pattern used by Jupiter/0x/LI.FI. It must import and use @drift-labs/sdk.

### 2. CoW Protocol Breaks the ActionProvider Pattern

**Confidence: HIGH** (CoW Protocol docs + SDK analysis)

CoW Protocol's intent-based model is fundamentally different from the resolve()-returns-ContractCallRequest pattern:
- Orders are signed off-chain via EIP-712 (not as on-chain transactions)
- Orders are submitted to CoW's Order Book API (not broadcast to blockchain)
- Settlement happens via solver batch auctions (no direct tx from wallet)
- Result monitoring requires polling CoW's order status API

This means CoW integration needs a new IntentProvider interface alongside IActionProvider, or a special adapter that bridges the intent model to the existing pipeline. The wallet signs an EIP-712 typed message (not a transaction), which requires the keyStore to support message signing in addition to transaction signing.

### 3. Pendle Router Uses Flash Swaps for YT Trading

**Confidence: HIGH** (Pendle official docs)

All Pendle swaps are technically flash swaps: the Market sends output tokens first, then enforces input tokens have been received by end of transaction. For YT trading specifically, this means the Router performs a multi-step atomic operation:
1. Flash-borrow PT from market
2. Combine PT + YT received from user
3. Redeem SY
4. Swap SY for desired output token
5. Repay flash borrow from swap proceeds

This complexity is hidden behind the Router's swapExactTokenForYt/swapExactYtForToken functions, but the resulting on-chain transaction may interact with multiple contracts. CONTRACT_WHITELIST must include the Pendle Router, Market, YT contract, and SY contract for the specific market.

### 4. Aave V3 Uses Uniform Pool Address on Most Chains

**Confidence: HIGH** (Aave docs + Etherscan verification)

Aave V3 Pool addresses vary by chain but are well-documented:
- Ethereum: 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2
- Arbitrum: 0x794a61358D6845594F94dc1DB02A252b5b4814aD
- Polygon: 0x794a61358D6845594F94dc1DB02A252b5b4814aD (same as Arbitrum)
- Base/Optimism: separate addresses from Aave address registry

Unlike 0x which uses a unified API with chain ID, Aave requires per-chain contract address configuration. The provider must maintain a chain -> Pool address mapping, similar to the existing 0x AllowanceHolder address map.

### 5. Kamino V2 is Modular (Breaking Change from V1)

**Confidence: MEDIUM** (Kamino docs + community analysis)

Kamino Lend V2 transitions from monolithic pools to a modular lending primitive. The klend-sdk may need version-specific handling. V2 allows custom products (peer-to-peer lending, orderbook lending) which changes the market discovery pattern. Integration should target the stable klend-sdk API surface rather than direct program calls.

### 6. Health Factor Polling Frequency is Critical

**Confidence: HIGH** (DeFi agent community best practices)

Research shows DeFi monitoring agents poll health factors every 30-60 seconds on Ethereum and every 5-10 seconds during high-volatility events. For WAIaaS (self-hosted daemon), recommended defaults:
- Normal: 60 second polling interval
- Warning (HF < 1.5): 15 second polling
- Critical (HF < 1.2): 5 second polling
- This adaptive polling pattern prevents both unnecessary RPC load and delayed liquidation warnings

---

## Competitive Landscape

| Feature | WAIaaS (planned) | Coinbase AgentKit | LiquidityGuard AI |
|---------|-----------------|-------------------|-------------------|
| Lending (Aave/Kamino) | Multi-protocol, multi-chain | Morpho only (Base focus) | Aave cross-chain |
| Yield tokenization (Pendle) | PT/YT buy/sell/redeem | Not supported | Not supported |
| Perpetual trading (Drift) | Solana native | Not supported | Not supported |
| Position tracking | Unified across protocols | Per-protocol only | Cross-chain monitoring |
| Health factor monitoring | Adaptive polling + auto-action | Basic monitoring | Real-time + AI reasoning |
| Intent trading (CoW) | EIP-712 MEV protection | Not supported | Not supported |
| Policy enforcement | 15+ PolicyTypes, default-deny | "Programmable guardrails" | Not mentioned |
| Self-hosted | Yes (daemon) | No (Coinbase cloud) | Open source, self-hosted |
| MCP integration | Native (auto-conversion) | Not native | Not native |

WAIaaS differentiators: self-hosted lending with HF monitoring, multi-protocol position tracking, fixed yield via Pendle, perp trading via Drift, intent-based MEV protection, all with policy enforcement.

---

## Sources

### Protocol Documentation (HIGH confidence)
- [Aave V3 Pool Contract](https://aave.com/docs/aave-v3/smart-contracts/pool) -- supply/borrow/repay/withdraw ABI
- [Aave V3 Smart Contracts Overview](https://aave.com/docs/aave-v3/smart-contracts) -- contract architecture
- [Aave V3 Addresses Dashboard](https://aave.com/docs/resources/addresses) -- deployed addresses per chain
- [Aave Health Factor & Liquidations](https://aave.com/help/borrowing/liquidations) -- HF calculation formula
- [Kamino Developer Docs](https://docs.kamino.finance/) -- klend-sdk entry point
- [Kamino klend-sdk GitHub](https://github.com/Kamino-Finance/klend-sdk) -- TypeScript SDK
- [Morpho Blue Smart Contracts](https://github.com/morpho-org/morpho-blue) -- singleton pattern, core functions
- [Morpho Borrow Tutorials](https://docs.morpho.org/build/borrow/tutorials/assets-flow/) -- supply/borrow/repay/withdraw flow
- [Pendle Router Integration Guide](https://docs.pendle.finance/pendle-v2/Developers/Contracts/PendleRouter/ContractIntegrationGuide) -- swap/mint/redeem functions
- [Pendle Yield Tokenization Contracts](https://docs.pendle.finance/pendle-v2/Developers/Contracts/YieldTokenization) -- PT/YT mechanics
- [Pendle High Level Architecture](https://docs.pendle.finance/pendle-v2/Developers/HighLevelArchitecture) -- SY/PT/YT relationship
- [Pendle Deployments](https://docs.pendle.finance/pendle-v2/Developers/Deployments) -- contract addresses per chain
- [Drift SDK Documentation](https://docs.drift.trade/sdk-documentation) -- TypeScript SDK usage
- [Drift Liquidations](https://docs.drift.trade/liquidations/liquidations) -- margin calculation, liquidation engine
- [Drift Funding Rates](https://docs.drift.trade/trading/funding-rates) -- funding rate mechanics
- [Drift Oracles](https://docs.drift.trade/trading/oracles) -- oracle validity checking
- [CoW Protocol Signing Schemes](https://docs.cow.fi/cow-protocol/reference/core/signing-schemes) -- EIP-712 order digest
- [CoW Protocol Intents](https://docs.cow.fi/cow-protocol/concepts/introduction/intents) -- intent flow and solver competition
- [CoW SDK GitHub](https://github.com/cowprotocol/cow-sdk) -- @cowprotocol/cow-sdk package
- [CoW SDK npm](https://www.npmjs.com/package/@cowprotocol/cow-sdk) -- v7.2.9, sub-packages

### Ecosystem Analysis (MEDIUM confidence)
- [Pendle 2026 Expansion to Solana](https://blockworks.co/news/pendle-2025-outlook) -- PT-only via CCIP, not full protocol
- [Kamino V2 Modular Lending](https://docs.kamino.finance/) -- V2 architecture changes
- [Morpho 2026 Review](https://stablecoininsider.org/morpho-complete-review-for-2026/) -- V2 roadmap
- [CoW Protocol Cross-Chain 2026](https://coinmarketcap.com/cmc-ai/cow-protocol/latest-updates/) -- Solana/Cosmos expansion plans
- [Coinbase AgentKit Q1 Update](https://www.coinbase.com/developer-platform/discover/launches/agentkit-q1-update) -- competitive comparison
- [Coinbase Agentic Wallets](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets) -- Feb 2026 launch
- [DeFAI: AI Agents in DeFi](https://cow.fi/learn/how-ai-agents-can-be-used-in-defi) -- AI agent DeFi patterns
- [LiquidityGuard AI](https://github.com/kunalsinghdadhwal/LiqX) -- cross-chain monitoring reference

### Codebase Analysis (HIGH confidence)
- `packages/core/src/interfaces/action-provider.types.ts` -- IActionProvider interface (resolve() contract)
- `packages/actions/src/common/async-status-tracker.ts` -- IAsyncStatusTracker, BridgeStatus
- `packages/actions/src/index.ts` -- registerBuiltInProviders(), existing 5 providers
- `packages/actions/src/providers/lido-staking/` -- ABI encoding pattern (viem, reusable for Aave)
- `packages/actions/src/providers/lifi/bridge-status-tracker.ts` -- async polling pattern
- `packages/daemon/src/services/async-polling-service.ts` -- AsyncPollingService infrastructure
- `packages/daemon/src/pipeline/gas-condition-tracker.ts` -- GasCondition tracker (extend for HF)
