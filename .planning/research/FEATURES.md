# Feature Landscape: Aave V3 EVM Lending + Lending Framework

**Domain:** DeFi Lending framework (ILendingProvider, PositionTracker, HealthFactorMonitor, LendingPolicyEvaluator) + Aave V3 first provider implementation
**Researched:** 2026-02-26
**Overall confidence:** HIGH (Aave V3 official docs verified, codebase IActionProvider pattern verified, m29-00 design doc reviewed, Phase 268-270 design outputs reviewed)

---

## Table Stakes

Features users expect from an AI agent wallet with DeFi lending support. Missing any of these = incomplete lending integration, agent cannot safely manage lending positions. These are the minimum viable set for shipping Aave V3 support.

### 1. Core Lending Actions (4 operations via ILendingProvider)

**Why this matters:** Lending is the largest DeFi category by TVL. Aave V3 alone holds ~$37B TVL across 10+ EVM chains. AI agents managing idle capital must supply, borrow, repay, and withdraw. These 4 operations form a complete lending lifecycle. Without all 4, the agent enters positions it cannot exit.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Supply (deposit asset to earn interest) | Entry point for lending. Agent deposits idle assets to earn supply APY + enable borrowing. aTokens are minted as receipt | Medium | ERC-20 approve before supply (existing multi-step pattern from LidoStaking), viem ABI encoding, Pool contract address per chain | `Pool.supply(asset, amount, onBehalfOf, 0)`. Referral code always 0 (inactive). Returns aToken balance increase. Must resolve to `[approveRequest, supplyRequest]` ContractCallRequest[] when allowance insufficient |
| Borrow (draw loan against collateral) | Core value proposition of lending. Agent borrows stablecoins against volatile collateral for further DeFi operations (leverage, yield farming) | High | Pre-borrow health factor simulation REQUIRED -- must verify HF stays > 1.0 after borrow. LendingPolicyEvaluator LTV check. Sufficient collateral deposited | `Pool.borrow(asset, amount, 2, 0, onBehalfOf)`. interestRateMode ALWAYS 2 (variable) -- stable rate deprecated in V3 governance. Must check projected HF before resolving |
| Repay (return borrowed asset to reduce debt) | Closes borrowing positions. Without repay, debt accrues interest indefinitely. Critical for health factor management when approaching liquidation | Medium | ERC-20 approve of debt token before repay. Must handle max repay (type(uint256).max = full debt) | `Pool.repay(asset, amount, 2, onBehalfOf)`. Returns actual amount repaid. Agent should support "repay all" shorthand |
| Withdraw (redeem supplied asset) | Exit strategy. Agent recovers deposited capital + accrued interest. aTokens are burned | Medium | Post-withdrawal health factor check -- reducing collateral may trigger liquidation if outstanding borrows exist. Must prevent HF < 1.0 | `Pool.withdraw(asset, amount, to)`. Use type(uint).max for full balance. Amount limited by available liquidity in pool |

**Confidence:** HIGH -- Aave V3 Pool ABI verified from official docs (https://aave.com/docs/aave-v3/smart-contracts/pool). All 4 functions are single contract calls via viem encodeFunctionData, matching the existing resolve() -> ContractCallRequest pattern.

### 2. Health Factor Visibility

**Why this matters:** Health factor (HF) is THE risk metric for lending. HF = (totalCollateral * liquidationThreshold) / totalDebt. HF < 1.0 = position eligible for liquidation (up to 50% of debt can be liquidated, or 100% if HF < 0.95 or positions < $2,000). An AI agent operating lending without HF visibility is operating blind.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Health factor query (per-wallet) | Agent MUST know HF before any borrow/withdraw that affects collateral/debt ratio. Decision-making prerequisite | Medium | Aave Pool.getUserAccountData() returns 6-tuple including healthFactor (uint256, WAD-scaled 1e18) | Returns: totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor. All values in base currency (USD) with 8 decimals |
| Health factor status classification | Agent needs semantic meaning, not just a number. "Am I safe, at risk, or about to be liquidated?" | Low | Thresholds from Phase 269 HealthFactorMonitor design: SAFE (>2.0), WARNING (1.5-2.0), DANGER (1.2-1.5), CRITICAL (<1.2) | Admin-configurable warning threshold (default 1.2). Maps to LIQUIDATION_WARNING notification |
| Pre-action HF simulation | Before borrow/withdraw, predict resulting HF. Reject if simulated HF would be unsafe | High | Current collateral+debt from getUserAccountData() + projected change from action params + asset price from IPriceOracle | Critical safety feature: prevents agent from submitting a borrow that would immediately trigger liquidation warning |
| REST API endpoint (GET /v1/wallets/:id/health-factor) | Standard API access for health factor data. AI agents query this before lending decisions | Medium | HealthFactor response schema (Zod), aggregated across providers with per-provider breakdown | Returns worst HF across all lending providers + per-provider detail array |

**Confidence:** HIGH -- getUserAccountData() function verified from Aave V3 Pool contract. Returns health factor directly; no manual computation needed for Aave.

### 3. Position Tracking and Persistence

**Why this matters:** Lending creates stateful positions that persist across sessions. Unlike swap (fire-and-forget), a supply position accrues interest continuously and a borrow position accrues debt. The agent must track these across daemon restarts and provide a unified view.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| defi_positions table (DB persistence) | Positions survive daemon restarts. Track open/close lifecycle with USD valuation | Medium | DB migration (defi_positions 14-column table from m29-00 design), Drizzle ORM schema, POSITION_CATEGORIES/STATUSES SSoT enums | Already designed in Phase 268: category-discriminated table with LendingMetadata JSON in metadata column |
| Periodic position sync (PositionTracker, 5min interval) | aToken balances change continuously (interest accrual). DB cache must be refreshed periodically for Admin UI and API queries | Medium | PositionTracker service (from Phase 268 design), IPositionProvider interface on each lending provider, PositionWriteQueue for batch DB writes | Sync reads on-chain aToken/debtToken balances, updates defi_positions with current amounts + USD values |
| Position query API (GET /v1/wallets/:id/positions) | Agent asks "what are my lending positions?" -- needs structured response with amounts, APYs, USD values | Medium | Positions endpoint designed in Phase 268 (section 7), filter by category=LENDING | Returns array of positions with asset, positionType (SUPPLY/BORROW), amount, amountUsd, apy, provider |
| Position lifecycle tracking (ACTIVE -> CLOSED/LIQUIDATED) | Detect when positions are closed (withdraw all) or liquidated (HF < 1.0). Update status accordingly | Medium | PositionTracker sync detects zero balances -> CLOSED. HealthFactorMonitor detects liquidation events -> LIQUIDATED | Status transitions recorded with timestamps for audit trail |

**Confidence:** HIGH -- defi_positions table and PositionTracker design already completed in Phase 268 of m29-00. Implementation follows established patterns.

### 4. Health Factor Monitoring and Alerts

**Why this matters:** Lending positions can become dangerous between agent interactions. Price drops reduce collateral value, increasing liquidation risk. Continuous monitoring with proactive alerts is essential for owner visibility. Without alerts, the first notification of trouble may be actual liquidation.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| HealthFactorMonitor service (polling) | Background service that checks HF for all wallets with active lending positions at regular intervals (5min default, adaptive) | Medium | Phase 269 design: adaptive polling (5min normal, 2min WARNING, 1min DANGER, 30s CRITICAL). Reads from defi_positions cache for efficiency, on-chain for critical checks | Integrates with existing daemon lifecycle (start/stop registration) |
| LIQUIDATION_WARNING notification event | When HF drops below threshold (default 1.2), fire LIQUIDATION_WARNING through existing 4-channel notification system (Telegram/Discord/ntfy/Slack) | Medium | New notification event type in @waiaas/core SSoT enums. Message template with current HF, collateral/debt values, recommended actions | Must include actionable info: "Your health factor is 1.15. Consider repaying debt or adding collateral." |
| Duplicate alert suppression | Avoid spamming owner with repeated warnings. One alert per severity level transition per wallet per provider | Low | Existing notification dedup pattern (24h for LOW_BALANCE). For HF: alert on severity transition (SAFE->WARNING, WARNING->DANGER, etc.), not on every poll | Severity transitions: SAFE(>2.0) -> WARNING(1.5-2.0) -> DANGER(1.2-1.5) -> CRITICAL(<1.2) |

**Confidence:** HIGH -- HealthFactorMonitor design completed in Phase 269 with adaptive polling, severity levels, and notification integration.

### 5. Lending Policy Evaluation

**Why this matters:** AI agents must not borrow unlimited amounts or interact with arbitrary lending markets. The project's default-deny security model (CLAUDE.md: "deny when ... not configured") must extend to lending. LTV limits prevent over-leveraging that could cause liquidation.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| LENDING_ASSET_WHITELIST policy type | Default-deny: only pre-approved assets can be used as collateral or for borrowing. Follows CONTRACT_WHITELIST pattern | Medium | New policy type in DatabasePolicyEngine. Rules JSON: `{ collateralAssets: [{assetId, symbol}], borrowAssets: [{assetId, symbol}] }`. CAIP-19 asset identifiers | When no whitelist configured, ALL lending actions denied. Same pattern as CONTRACT_WHITELIST opt-in |
| LENDING_LTV_LIMIT policy type | Maximum LTV cap for new borrows. Prevents agent from leveraging beyond owner-defined risk tolerance | Medium | New policy type. Rules JSON: `{ maxLtv: 0.75, warningLtv: 0.65 }`. Projected LTV computed before borrow execution | Evaluated BEFORE pipeline submission. If projected LTV > maxLtv, action denied. Policy configurable per-wallet or global |
| Policy integration with existing pipeline | Lending actions (supply/borrow/repay/withdraw) flow through the same 6-stage pipeline. ContractCallRequest carries action metadata for policy evaluator identification | Low | Existing metadata/hint field on ContractCallRequest to carry `{ actionProvider: 'aave_v3', actionName: 'borrow' }` | No new transaction type in discriminatedUnion 5-type. Lending actions ARE CONTRACT_CALL type with metadata annotation |

**Confidence:** HIGH -- DatabasePolicyEngine pattern verified from codebase. 9 existing policy types provide the exact pattern to follow. Phase 270 design specifies integration points.

### 6. Aave V3 Chain Support (Contract Address Mapping)

**Why this matters:** Aave V3 is deployed across 10+ EVM chains. The wallet already supports multi-chain EVM (EvmAdapter + environment/network model). Agent must be able to use Aave on the chain where their wallet operates.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| AaveContractHelper (chain-to-contract address mapping) | Maps chain/network to correct Pool, PoolDataProvider, Oracle addresses. Required for every Aave interaction | Low | Static mapping from Aave deployed addresses. Pool addresses: Ethereum=0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2, Arbitrum/Optimism/Polygon=0x794a61358D6845594F94dc1DB02A252b5b4814aD, Base=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 | Alternative: use PoolAddressesProvider.getPool() for dynamic resolution. Hardcoded preferred for self-hosted (no extra RPC call). Fallback to dynamic if needed |
| Market data query (AaveMarketData) | Agent needs to know available assets, their APYs, LTVs, supply/borrow caps before making decisions | Medium | On-chain: PoolDataProvider.getReserveData(asset) returns rates, caps, totals. PoolDataProvider.getAllReservesTokens() for asset list | Returns per-asset: supplyApy, borrowApy, ltv, liquidationThreshold, supplyCap, borrowCap, isActive |
| L2Pool optimization (Arbitrum/Optimism/Base/Polygon) | L2 chains use calldata-optimized L2Pool contract for lower gas costs | Low | Use L2Pool ABI which accepts compressed calldata format. Same functional interface as Pool but encoded differently | Aave deploys L2Pool on all L2s. encodeFunctionData uses the same method names but may have different ABI |

**Confidence:** HIGH -- Contract addresses verified via Etherscan/BaseScan. PoolDataProvider ABI verified from official docs.

### 7. MCP Tool Integration

**Why this matters:** MCP tools are how AI agents interact with the wallet. Without MCP tools for lending, agents cannot use lending features through the standard MCP interface. Existing pattern: each ActionProvider's actions are auto-converted to MCP tools.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| waiaas_aave_supply MCP tool | Supply assets to Aave V3 | Low | Auto-generated from AaveV3LendingProvider.actions[0] by ActionProviderRegistry -> MCP tool conversion | Input: { asset: string, amount: string }. Same pattern as waiaas_lido_stake |
| waiaas_aave_borrow MCP tool | Borrow assets from Aave V3 | Low | Auto-generated | Input: { asset: string, amount: string }. interestRateMode hardcoded to 2 (variable) |
| waiaas_aave_repay MCP tool | Repay borrowed assets | Low | Auto-generated | Input: { asset: string, amount: string }. "max" for full repay |
| waiaas_aave_withdraw MCP tool | Withdraw supplied assets | Low | Auto-generated | Input: { asset: string, amount: string }. "max" for full withdrawal |
| waiaas_aave_positions MCP tool | Query current lending positions | Medium | NOT auto-generated (query method, not action). Must be manually registered as MCP tool | Input: { walletId?: string }. Returns positions array + health factor |

**Confidence:** HIGH -- MCP auto-conversion pattern verified from existing providers. Manual tool registration pattern exists for query-only operations.

### 8. SDK Extension

**Why this matters:** TS/Python SDK users need programmatic access to lending functions. Existing pattern: `executeAction('provider_action', params)`.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| SDK executeAction('aave_supply', params) | TypeScript/Python SDK supply call | Low | Existing executeAction pattern in SDK. No new SDK methods needed -- just new action names | Same pattern as executeAction('lido_stake', params) |
| SDK executeAction('aave_borrow', params) | SDK borrow call | Low | Same pattern | Agent code: `await sdk.executeAction('aave_borrow', { asset: '0x...', amount: '100' })` |
| SDK executeAction('aave_repay', params) | SDK repay call | Low | Same pattern | Support 'max' amount for full repay |
| SDK executeAction('aave_withdraw', params) | SDK withdraw call | Low | Same pattern | Support 'max' amount for full withdrawal |
| SDK getPositions(walletId) convenience method | Typed method for position queries (not just raw API call) | Medium | New SDK method wrapping GET /v1/wallets/:id/positions | Returns typed LendingPosition[] with TS IntelliSense |
| SDK getHealthFactor(walletId) convenience method | Typed method for health factor queries | Medium | New SDK method wrapping GET /v1/wallets/:id/health-factor | Returns typed HealthFactor with status classification |

**Confidence:** HIGH -- executeAction pattern verified in codebase. New convenience methods follow existing SDK patterns.

### 9. Admin UI Integration

**Why this matters:** Admin Web UI is the operator's primary management interface. DeFi positions need visibility alongside existing wallet management. Without Admin UI, operator must use raw API calls to monitor positions.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Portfolio section in wallet detail view | Show active DeFi positions (supplied/borrowed assets, amounts, APYs) in wallet's Overview tab | Medium | Existing Wallet 4-tab detail view (Overview/Transactions/Owner/MCP). Add DeFi section to Overview or new Positions tab | Reads from defi_positions DB cache via positions API |
| Health factor indicator | Visual HF display with color-coded status (green=safe, yellow=warning, red=danger) | Low | HF data from health-factor API. Color mapping: >2.0 green, 1.5-2.0 yellow, 1.2-1.5 orange, <1.2 red | Most important single metric for lending positions |
| APY display per position | Show current supply/borrow APY for each position | Low | APY stored in defi_positions.metadata.apy, refreshed by PositionTracker | Supply APY = earnings rate. Borrow APY = cost rate. Agent should see both |
| Aave V3 admin settings | Enable/disable provider, configure HF warning threshold, position sync interval, max LTV | Low | Existing Admin Settings pattern (Actions page). 4 config keys: enabled, health_factor_warning_threshold, position_sync_interval_sec, max_ltv_pct | Matches existing provider settings pattern from v28.x actions |

**Confidence:** HIGH -- Admin UI patterns well-established. Preact component patterns verified from existing wallet detail views.

---

## Differentiators

Features that set this implementation apart from basic Aave integrations. Not expected by every user, but valued by sophisticated AI agent operators.

### 1. Pre-Action Safety Simulation

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Simulate borrow impact on HF | Before executing borrow, compute projected HF. Reject if result would be unsafe. Prevents self-inflicted liquidation risk | High | Current getUserAccountData() + projected borrow amount + asset price from IPriceOracle. Formula: newHF = (collateral * liqThreshold) / (currentDebt + newBorrow) | Unique safety feature for AI agents. Most wallets don't simulate -- they just submit and hope |
| Simulate withdrawal impact on HF | Before executing withdrawal, check if remaining collateral supports existing debt | High | Same simulation approach. Formula: newHF = ((collateral - withdrawAmount) * liqThreshold) / currentDebt | Prevents accidental self-liquidation when withdrawing collateral with active borrows |
| "max safe borrow" calculation | Agent asks "how much can I safely borrow?" -- returns amount respecting max LTV policy | Medium | Available borrows from getUserAccountData().availableBorrowsBase, capped by LendingPolicyEvaluator maxLtv | Useful for agents doing automated leverage strategies |

### 2. Adaptive Monitoring Intelligence

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Adaptive polling frequency | HF closer to danger = more frequent checks. SAFE: 5min, WARNING: 2min, DANGER: 1min, CRITICAL: 30s | Medium | Phase 269 HealthFactorMonitor already designed this. Implementation follows the design | Balances RPC cost vs risk detection speed. Most competing products use fixed intervals |
| Escalating notification severity | First warning is informational. Repeated/worsening warnings escalate priority. Critical triggers immediate owner notification via all channels | Medium | Existing notification priority system (LOW/NORMAL/HIGH/URGENT). Map HF severity to notification priority | Owner gets gentler nudges for minor HF drops, urgent alerts for approaching liquidation |

### 3. Collateral Management

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Enable/disable asset as collateral (setUserUseReserveAsCollateral) | Agent can toggle which supplied assets count as collateral. Useful for risk isolation -- supply an asset for interest without using it as borrow collateral | Medium | Pool.setUserUseReserveAsCollateral(asset, useAsCollateral). Additional action in AaveV3LendingProvider | Not all agents need this, but it's a powerful risk management primitive |
| Isolation mode awareness | Detect when an asset is in Isolation Mode (can only borrow stablecoins up to debt ceiling). Prevent confusing errors | Low | getReserveConfigurationData() includes isolation mode flags. Surface this in market data query | Aave V3 feature: some assets (newer, riskier) have restricted borrowing capabilities |

### 4. Market Intelligence for Agent Decision-Making

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Real-time APY comparison across assets | Agent asks "which asset gives the best supply APY right now?" for optimal capital allocation | Medium | PoolDataProvider.getReserveData() for all active reserves. Return sorted by supply/borrow APY | Enables yield optimization strategies: move capital to highest-APY assets |
| Utilization rate visibility | Show how utilized each lending pool is. High utilization = higher APY but lower withdrawal liquidity | Low | Utilization = totalBorrow / totalSupply. Derived from getReserveData() | Agent should avoid supplying to 95%+ utilized pools (withdrawal risk) |
| Supply/borrow cap awareness | Prevent failed transactions by checking caps before action submission | Low | PoolDataProvider.getReserveCaps() returns supply/borrow caps per asset | If supply cap is hit, supply transaction will revert. Better to check beforehand |

---

## Anti-Features

Features to explicitly NOT build in this milestone. Either premature, out of scope, or harmful.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Flash loan support | Flash loans require atomic same-transaction execution with custom receiver contracts. Incompatible with the wallet's key-custody signing model (sign externally, submit). Extremely high complexity with limited AI agent use cases | Defer indefinitely. Flash loans are primarily for MEV/arbitrage bots that run their own contracts, not for wallet-managed agents |
| Credit delegation (let others borrow against your collateral) | Extreme risk: a delegatee can borrow and not repay, leaving the delegator with debt. No safe way for an AI agent to manage this | Explicitly block. Do not expose approveDelegation(). This is an anti-feature for an AI agent wallet |
| Stable rate borrowing | Aave V3 governance disabled stable rate on most markets (2023). The interestRateMode=1 parameter exists in ABI but fails for most assets | Always use interestRateMode=2 (variable). Do not expose rate mode selection to agent |
| Auto-leverage (recursive supply-borrow-supply) | Multi-step leverage amplification that multiplies liquidation risk. Extremely dangerous for autonomous agents without real-time human oversight | Provide individual supply/borrow actions. Agent can compose leverage manually if owner configures appropriate policies, but wallet does not automate multi-step leverage |
| Liquidation execution (becoming a liquidator) | Requires monitoring other users' positions, maintaining capital reserves, competing with MEV bots. Completely different product | Not relevant to wallet use case. This is for specialized liquidation bots |
| Cross-protocol aggregation (borrow on Aave, supply on Morpho) | Cross-protocol optimization requires understanding collateral positions across multiple protocols simultaneously. Phase 1 should focus on per-protocol correctness | Defer to future milestone when multiple ILendingProvider implementations exist (Aave + Kamino + Morpho). PositionTracker already supports multi-provider aggregation |
| Aave V3 E-Mode automatic selection | E-Mode optimizes LTV for same-category assets (e.g., stablecoin-to-stablecoin at 97% LTV). Adding E-Mode support adds complexity to the policy evaluator (different LTV limits per mode) | Document E-Mode as future enhancement. For now, use standard mode parameters. E-Mode can be added as a differentiator in a later iteration |
| Governance token staking (stkAAVE) | Aave safety module staking is a governance participation mechanism, not a lending feature. Different smart contracts, different risk model | Out of scope. Could be a separate staking provider if needed |

---

## Feature Dependencies

```
SSoT Enum Extension (LIQUIDATION_WARNING, POSITION_CATEGORIES, POSITION_STATUSES)
    |
    v
DB Migration (defi_positions table) ──────────────────────────┐
    |                                                          |
    v                                                          v
ILendingProvider Interface Definition           PositionTracker Service
    |                                                |
    v                                                v
AaveV3LendingProvider Implementation    HealthFactorMonitor Service
    |           |                              |
    v           v                              v
AaveContractHelper    AaveMarketData    LIQUIDATION_WARNING Notifications
(chain address map)   (reserve data)           |
    |                                          v
    v                                   Adaptive Polling (severity-based)
LendingPolicyEvaluator
(LENDING_ASSET_WHITELIST + LENDING_LTV_LIMIT)
    |
    v
REST API Endpoints (positions + health-factor)
    |
    v
MCP Tools (5: supply, borrow, repay, withdraw, positions)
    |
    v
SDK Extension (executeAction + getPositions/getHealthFactor)
    |
    v
Admin UI (portfolio view + HF indicator + settings)
```

**Critical path:** SSoT Enums -> DB Migration -> ILendingProvider -> AaveV3Provider -> HealthFactorMonitor -> REST API -> MCP/SDK/Admin

**Parallel tracks after ILendingProvider:**
- Track A: AaveV3Provider + AaveContractHelper + AaveMarketData
- Track B: PositionTracker + HealthFactorMonitor + Notifications
- Track C: LendingPolicyEvaluator (can start after interface definition)

---

## MVP Recommendation

### Phase 1: SSoT Enums + DB Migration
Build the foundation that all subsequent phases depend on.

Prioritize:
1. POSITION_CATEGORIES, POSITION_STATUSES enums in @waiaas/core
2. LIQUIDATION_WARNING + 3 future DeFi notification events (MATURITY_WARNING, MARGIN_WARNING, LIQUIDATION_IMMINENT) -- add all at once to minimize future enum changes
3. defi_positions table migration (DB version increment)
4. Drizzle ORM schema + 4 CHECK constraints + 4 indexes
5. Notification message templates for new events
6. EVENT_CATEGORY_MAP extension for DeFi event category

### Phase 2: Lending Framework (ILendingProvider + PositionTracker + HealthFactorMonitor)
Build the protocol-agnostic framework that Aave V3, Kamino, and Morpho will all use.

Prioritize:
1. ILendingProvider interface (extends IActionProvider, adds getPosition/getHealthFactor/getMarkets)
2. LendingPosition, HealthFactor, MarketInfo Zod types
3. PositionTracker service (5-min sync, PositionWriteQueue, UPSERT logic)
4. HealthFactorMonitor service (adaptive polling, severity classification, notification dispatch)
5. LendingPolicyEvaluator (LENDING_ASSET_WHITELIST + LENDING_LTV_LIMIT policy types)

### Phase 3: Aave V3 Provider Implementation
First concrete lending provider -- validates the framework against a real protocol.

Prioritize:
1. AaveContractHelper (chain-to-address mapping for 5 EVM chains)
2. AaveV3LendingProvider (resolve() for supply/borrow/repay/withdraw)
3. ERC-20 approve + action multi-step resolution (follow LidoStaking pattern)
4. Pre-borrow/pre-withdraw HF simulation safety checks
5. IPositionProvider implementation (getPositions for PositionTracker)

### Phase 4: Monitoring + Notifications + API
Wire everything together with observable interfaces.

Prioritize:
1. REST API: GET /v1/wallets/:id/positions, GET /v1/wallets/:id/health-factor
2. MCP tools: 5 tools (4 actions + 1 positions query)
3. SDK: executeAction support + getPositions/getHealthFactor convenience methods
4. LIQUIDATION_WARNING notification flow (HF monitor -> EventBus -> notification channels)

### Phase 5: Admin UI + Settings
Operator visibility and configuration.

Prioritize:
1. Admin Settings (aave_v3.enabled, HF threshold, sync interval, max LTV)
2. Wallet detail portfolio section (positions list + HF indicator)
3. APY display per position

Defer:
- E-Mode support: adds complexity to policy evaluator without clear AI agent benefit in V1
- Cross-protocol aggregation: meaningful only after 2+ lending providers exist
- setUserUseReserveAsCollateral: useful but not MVP -- agents can supply collateral-eligible assets by default
- Market intelligence features (APY comparison, utilization): nice-to-have after core lending works

---

## Key Integration Points with Existing Infrastructure

| Existing Component | How Lending Uses It | Integration Complexity |
|--------------------|--------------------|-----------------------|
| IActionProvider + ActionProviderRegistry | ILendingProvider extends IActionProvider. AaveV3Provider registers like any other provider. MCP tools auto-generated from actions[] | Low -- follows established pattern |
| 6-stage transaction pipeline | Supply/borrow/repay/withdraw resolve to ContractCallRequest, flow through normal pipeline for policy evaluation + signing | Low -- no pipeline changes needed |
| EvmAdapter (viem 2.x) | ABI encoding via viem encodeFunctionData. Transaction submission via existing adapter | Low -- standard viem pattern |
| IPriceOracle (Pyth + CoinGecko) | Position USD valuation, HF simulation, LTV calculation | Low -- existing oracle API |
| DatabasePolicyEngine (9 policy types) | +2 new types: LENDING_ASSET_WHITELIST, LENDING_LTV_LIMIT | Medium -- new evaluator logic but existing DB/policy infrastructure |
| EventBus + Notification system (4 channels) | LIQUIDATION_WARNING event -> existing notification dispatch | Low -- add event type + message template |
| Admin Web UI (Preact + Vite) | New portfolio section in wallet detail, new settings keys | Medium -- new UI components but existing patterns |
| CAIP-19 asset identification | Lending positions use assetId for asset identification in policies and tracking | Low -- existing caip/ module |
| DB migration system (pushSchema 3-step) | New defi_positions table migration | Low -- standard migration pattern |

---

## Sources

### Protocol Documentation (HIGH confidence)
- [Aave V3 Pool Smart Contract](https://aave.com/docs/aave-v3/smart-contracts/pool) -- supply/borrow/repay/withdraw/getUserAccountData function signatures
- [Aave V3 View Contracts](https://aave.com/docs/aave-v3/smart-contracts/view-contracts) -- getReserveData/getUserReserveData/getAllReservesTokens
- [Aave V3 Overview](https://aave.com/docs/aave-v3/overview) -- E-Mode, isolation mode, supply/borrow caps
- [Aave Health Factor & Liquidations](https://aave.com/help/borrowing/liquidations) -- HF formula, liquidation close factors
- [Aave Addresses Dashboard](https://aave.com/docs/resources/addresses) -- deployed contract addresses per chain
- [Aave E-Mode](https://aave.com/help/borrowing/e-mode) -- high efficiency mode for correlated assets
- [Aave PoolAddressesProvider](https://aave.com/docs/aave-v3/smart-contracts/pool-addresses-provider) -- dynamic contract address resolution

### Contract Addresses (HIGH confidence)
- [Aave Pool V3 Ethereum](https://etherscan.io/address/0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2) -- 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2
- [Aave Pool V3 Arbitrum](https://arbiscan.io/address/0x794a61358d6845594f94dc1db02a252b5b4814ad) -- 0x794a61358D6845594F94dc1DB02A252b5b4814aD
- [Aave Pool V3 Polygon](https://polygonscan.com/address/0x794a61358D6845594F94dc1DB02A252b5b4814aD) -- same as Arbitrum
- [Aave Pool V3 Base](https://basescan.org/address/0xa238dd80c259a72e81d7e4664a9801593f98d1c5) -- 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5

### Codebase (HIGH confidence)
- `/packages/core/src/interfaces/action-provider.types.ts` -- IActionProvider, ActionDefinition, ActionContext, resolve() -> ContractCallRequest
- `/packages/actions/src/providers/lido-staking/index.ts` -- Multi-step resolve pattern (approve + action), LidoStakingActionProvider
- `/internal/objectives/m29-02-aave-evm-lending.md` -- Milestone objective with 15 E2E test scenarios
- `/internal/objectives/m29-00-defi-advanced-protocol-design.md` -- ILendingProvider design, defi_positions table DDL, PositionTracker, HealthFactorMonitor

### Design Phases (HIGH confidence)
- Phase 268: Position infrastructure design (defi_positions table, IPositionProvider, PositionWriteQueue)
- Phase 269: DeFi monitoring framework (HealthFactorMonitor, adaptive polling, severity classification)
- Phase 270: Lending framework design (ILendingProvider interface, LendingPolicyEvaluator, protocol mapping)
