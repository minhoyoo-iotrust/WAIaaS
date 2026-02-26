# Project Research Summary

**Project:** WAIaaS m29-02 — Aave V3 EVM Lending + Lending Framework
**Domain:** DeFi Lending — stateful position management layered on AI wallet ActionProvider pipeline
**Researched:** 2026-02-26
**Confidence:** HIGH

## Executive Summary

This milestone implements EVM lending support for AI agents via Aave V3, introducing the first concrete `ILendingProvider` implementation from the design completed in m29-00. The critical architectural insight is that lending does NOT require changes to the 6-stage transaction pipeline: supply, borrow, repay, and withdraw all resolve to `CONTRACT_CALL` `ContractCallRequest` objects (the same type used by Lido staking and 0x swaps), with `actionProvider` metadata used to identify them for specialized policy evaluation. What IS new is the stateful layer around the pipeline: `PositionTracker` (5-min sync), `HealthFactorMonitor` (adaptive polling), and `LendingPolicyEvaluator` (LTV + asset whitelist), all backed by a new `defi_positions` SQLite table.

The recommended implementation approach uses zero new npm dependencies. The `@waiaas/actions` package uses manual hex ABI encoding (the same `padHex`/`addressToHex`/`uint256ToHex` pattern from `lido-staking/lido-contract.ts`), and the `@waiaas/daemon` package uses existing viem `readContract` for on-chain position queries (`getUserAccountData`). The five Aave V3 Pool addresses across Ethereum, Polygon, Arbitrum, Optimism, and Base are hardcoded in `config.ts` (verified from `bgd-labs/aave-address-book`), following the same pattern as `zerox-swap/config.ts` and `lido-staking/config.ts`. The decision to reject `@aave/client` (requires ethers + thirdweb peer deps) and `@bgd-labs/aave-address-book` (191 releases/year for 20 static addresses) is clear and well-reasoned.

The primary risks are precision-related (health factor is 18-decimal bigint, JavaScript floating-point comparisons silently misclassify boundary values) and policy-interaction bugs (supply/repay incorrectly consuming SPENDING_LIMIT, multi-step approve arrays missing `actionProvider` annotation causing CONTRACT_WHITELIST denial). The liquidation timing gap (5-minute polling interval is too slow for flash crashes) is addressed by the pre-designed adaptive polling strategy from Phase 269. All five critical pitfalls have concrete, actionable prevention strategies that must be built into the implementation phases from the start.

---

## Key Findings

### Recommended Stack

No new npm dependencies required. All Aave V3 interactions in `@waiaas/actions` use manual hex ABI encoding following the established Lido pattern. Read functions (`getUserAccountData`, `getReservesList`) use viem's type-safe `readContract` in `@waiaas/daemon`, where viem already exists as a dependency. Zod validates all input schemas and position data. The existing Drizzle ORM handles the new `defi_positions` table migration (schema version 24 -> 25).

**Core technologies:**
- **viem 2.x** (daemon-only): `readContract` for `getUserAccountData` health factor queries — already a daemon dependency, zero added cost
- **Manual hex ABI encoding** (actions package): `encodeSupplyCalldata`, `encodeBorrowCalldata`, `encodeRepayCalldata`, `encodeWithdrawCalldata` — follows verified Lido pattern, keeps actions package at 2 dependencies (core + zod)
- **Drizzle ORM + SQLite**: `defi_positions` table with 4 indexes and CHECK constraints from SSoT enums — follows existing pushSchema 3-step migration pattern
- **Zod 3.24** (existing): `SupplyInputSchema`, `BorrowInputSchema`, `LendingMetadataSchema`, `HealthFactorSchema` — all aligned with m29-00 design

**Critical version decisions:**
- Aave V3 Pool addresses hardcoded (stable proxies since 2023 deployment, verified on Etherscan/BaseScan)
- `interestRateMode = 2n` (variable) always hardcoded — stable rate deprecated by Aave governance 2024
- `type(uint256).max` used for full repay/withdraw (standard Aave pattern)

See full analysis: `.planning/research/m29-02-aave-lending-STACK.md`

### Expected Features

The complete lending lifecycle must ship as a unit — a user who can supply but cannot withdraw is trapped. Health factor visibility is a hard prerequisite for the borrow and withdraw actions, since both can trigger liquidation if executed without HF awareness.

**Must have (table stakes):**
- **Supply action** — deposit assets to earn APY; resolves to `[approve, supply]` ContractCallRequest array
- **Borrow action** — draw loan against collateral; hardcoded variable rate (mode=2); requires pre-borrow HF simulation
- **Repay action** — reduce debt; supports `type(uint256).max` for full repay
- **Withdraw action** — exit position; pre-withdrawal HF simulation required when active borrows exist
- **Health factor query** (`GET /v1/wallets/:id/health-factor`) — semantic classification: SAFE/WARNING/DANGER/CRITICAL
- **Position persistence** (`defi_positions` table) — survives daemon restarts; sync every 5 min via PositionTracker
- **Position query API** (`GET /v1/wallets/:id/positions`) — filter by category=LENDING
- **HealthFactorMonitor service** — adaptive polling; fires `LIQUIDATION_WARNING` via existing 4-channel notification system
- **LENDING_ASSET_WHITELIST policy** — default-deny: only pre-approved assets usable as collateral/borrow
- **LENDING_LTV_LIMIT policy** — prevents borrow that would push LTV above owner-configured threshold
- **MCP tools** — 5 tools: `waiaas_aave_supply`, `waiaas_aave_borrow`, `waiaas_aave_repay`, `waiaas_aave_withdraw`, `waiaas_aave_positions`
- **Admin UI portfolio section** — positions list + health factor gauge + APY display

**Should have (competitive differentiators):**
- Pre-action HF simulation for borrow/withdraw — prevents self-inflicted liquidation; unique safety feature for AI agents
- Adaptive monitoring intelligence — SAFE:5min, WARNING:1min, DANGER:15s, CRITICAL:5s polling
- Market intelligence — APY comparison, utilization rate, supply/borrow cap awareness
- `setUserUseReserveAsCollateral` — collateral enable/disable toggle

**Defer (v2+):**
- E-Mode support — adds complexity to policy evaluator; limited AI agent benefit in V1
- Cross-protocol aggregation — meaningful only after 2+ lending providers exist
- Flash loan support — incompatible with key-custody signing model; explicitly an anti-feature
- Credit delegation (`approveDelegation`) — extreme risk for AI agents; explicitly blocked
- Liquidation execution — different product use case

See full analysis: `.planning/research/FEATURES.md`

### Architecture Approach

The architecture cleanly separates execution (unchanged 6-stage pipeline) from position management (new stateful layer). `AaveV3LendingProvider` implements both `ILendingProvider` (execution via resolve) and `IPositionProvider` (read-only position data for `PositionTracker`). This dual-interface pattern avoids coupling position data to transaction execution.

**Major components:**

1. **ILendingProvider / IPositionProvider** (`@waiaas/core`) — interface definitions; `ILendingProvider extends IActionProvider` preserves ActionProviderRegistry compatibility without modification
2. **AaveV3LendingProvider** (`@waiaas/actions`) — resolves supply/borrow/repay/withdraw to ContractCallRequest arrays using manual ABI encoding; implements IPositionProvider for PositionTracker registration
3. **PositionTracker** (`@waiaas/daemon`) — 4-category interval timers (not BackgroundWorkers); PositionWriteQueue batch upsert following IncomingTxQueue pattern; writes `defi_positions` table
4. **HealthFactorMonitor** (`@waiaas/daemon`) — adaptive recursive setTimeout (not setInterval); reads from `defi_positions` cache only (never direct RPC — DEC-MON-03); triggers PositionTracker on-demand sync when DANGER/CRITICAL
5. **LendingPolicyEvaluator** (`@waiaas/daemon`, pipeline step 4h) — two new policy types: LENDING_ASSET_WHITELIST (default-deny) + LENDING_LTV_LIMIT (projected HF check, not just LTV%); supply/repay must NOT count toward SPENDING_LIMIT cumulative counters
6. **defi_positions table** (DB migration v25) — category-discriminated; UNIQUE KEY on (wallet_id, provider, asset_id, category) for upsert; metadata JSON column for LendingMetadata

**Key patterns:**
- Approve + action multi-step resolve (Lido pattern) — both array elements must carry `actionProvider: 'aave_v3'` metadata for provider-trust bypass
- PositionWriteQueue batch upsert (IncomingTxQueue pattern from v27.1)
- Adaptive setTimeout polling (NOT fixed setInterval)
- HealthFactorMonitor reads DB cache only; PositionTracker owns all RPC queries

See full analysis: `.planning/research/ARCHITECTURE.md`

### Critical Pitfalls

1. **ERC-20 Approve Race Condition (C1)** — USDT-like tokens require zero-first approval; multi-step resolve must check current allowance before issuing approve; both array elements must carry `actionProvider` metadata for the pipeline's provider-trust bypass to work on the approve step
2. **Health Factor 18-Decimal Precision Loss (C2)** — use bigint comparisons for all threshold checks (`healthFactorRaw >= 1_500_000_000_000_000_000n`); never use `Number(bigint) / 1e18` for safety-critical comparisons; API response returns both raw and decimal values
3. **Position Sync Drift After Failed Transactions (C3)** — DB is cache of on-chain truth, never a write-ahead ledger; trigger immediate PositionTracker sync after Stage 6 confirms a lending transaction; mark positions STALE if `lastSyncedAt` is older than 2x sync interval
4. **CONTRACT_WHITELIST Not Auto-Bypassed for Approve Step (C4)** — when resolve() returns `[approveReq, supplyReq]`, BOTH requests must include `{ actionProvider: 'aave_v3' }` so the provider-trust bypass applies; verify this in ActionProviderRegistry
5. **SPENDING_LIMIT Incorrectly Counts Supply/Repay/Withdraw as Spending (M6)** — supply/repay/withdraw must NOT increment cumulative spending counters; only borrow creates new spendable funds and should count; implement via metadata annotation at LendingPolicyEvaluator step 4h

See full analysis: `.planning/research/m29-02-aave-lending-PITFALLS.md`

---

## Implications for Roadmap

The dependency graph is clear: SSoT enums and DB migration must come first (all other phases depend on them), followed by the framework services (PositionTracker, HealthFactorMonitor, LendingPolicyEvaluator), then the Aave V3 provider implementation, then API/MCP/SDK wiring, then Admin UI. The critical pitfalls are distributed across phases — some must be addressed in Phase 1 (precision definitions), others in Phase 3 (approve metadata, allowance check), and others in Phase 2 (sync drift prevention).

### Phase 1: SSoT Enums + DB Migration + Core Interfaces

**Rationale:** Foundation layer that all subsequent phases depend on. Zero implementation value without this. Establishes precision conventions (bigint thresholds) before any HF arithmetic is written.
**Delivers:** `defi_positions` table (migration v25), `POSITION_CATEGORIES`/`POSITION_STATUSES` enums, `LIQUIDATION_WARNING`+3 DeFi notification event types, `ILendingProvider`/`IPositionProvider` interfaces, `LendingPositionSummary`/`HealthFactor` Zod schemas
**Addresses:** Position persistence (table stakes), notification event types
**Avoids:** C2 (define HF threshold constants as bigint in schemas from the start), prevents schema drift across phases

### Phase 2: Lending Framework Services

**Rationale:** Protocol-agnostic infrastructure that Aave, Kamino, and Morpho will all reuse. Building the framework before the first provider ensures the interface is correct before it's implemented.
**Delivers:** `PositionTracker` service (5-min sync, PositionWriteQueue), `HealthFactorMonitor` (adaptive polling, severity classification), `LendingPolicyEvaluator` (LENDING_ASSET_WHITELIST + LENDING_LTV_LIMIT), notification message templates, DaemonLifecycle step 4c-10.5 + 4c-11 integration
**Uses:** defi_positions table (Phase 1), IPositionProvider interface (Phase 1), EventBus + NotificationService (existing)
**Avoids:** C3 (sync drift: DB is cache only, force sync on tx confirm), M4 (LTV/HF threshold coordination: policy evaluator uses projected HF, not just LTV%), M6 (supply/repay skip SPENDING_LIMIT cumulative counters), M7 (adaptive polling from Phase 269 design — MUST implement, not fixed interval)

### Phase 3: Aave V3 Provider Implementation

**Rationale:** First concrete provider validates the framework against a real protocol. Resolve to ContractCallRequest follows established Lido/0x patterns.
**Delivers:** `AaveV3LendingProvider` (supply/borrow/repay/withdraw resolve), `aave-contracts.ts` (manual ABI encoding, AAVE_V3_ADDRESSES map for 5 chains), `config.ts`, input Zod schemas, `registerBuiltInProviders()` extension, Admin Settings keys
**Uses:** Manual hex ABI encoding (Lido pattern), viem readContract for getUserAccountData (daemon-only), AAVE_V3_ADDRESSES hardcoded map (verified, stable since 2023)
**Implements:** AaveV3LendingProvider (dual interface), AaveContractHelper, IPositionProvider for PositionTracker registration
**Avoids:** C1 (check allowance before approve; use zero-first approve for USDT-like tokens), C4 (annotate BOTH elements of `[approveReq, actionReq]` with `actionProvider`), M1 (hardcode `interestRateMode = 2n`, never expose as param), M2 (use scaledBalanceOf for change detection, threshold for interest accrual), L1 (base currency is ETH-denominated — convert via IPriceOracle, not raw value), L2 (pre-withdrawal HF simulation when borrows exist)

### Phase 4: Policy Integration + REST API + MCP + SDK

**Rationale:** Wire the framework and provider into observable interfaces. REST API is the prerequisite for both Admin UI and SDK.
**Delivers:** `GET /v1/wallets/:id/positions`, `GET /v1/wallets/:id/health-factor` routes, LENDING_ASSET_WHITELIST + LENDING_LTV_LIMIT in DatabasePolicyEngine (PolicyTypeEnum + step 4h), 5 MCP tools (4 actions + 1 positions query), SDK `executeAction('aave_supply')` support + `getPositions()`/`getHealthFactor()` convenience methods, `skills/actions.skill.md` update
**Avoids:** C5 (flash loan primitives must NOT be exposed), M5 (isolation mode + E-Mode structured errors from resolve)

### Phase 5: Admin UI + E2E Validation

**Rationale:** Operator visibility and configuration interface. Depends on all REST API endpoints from Phase 4.
**Delivers:** Admin UI DeFi portfolio panel (`DeFiPortfolioPanel`, `HealthFactorGauge`, `PositionTable` Preact components), Admin Settings keys (`aave_v3.enabled`, `health_factor_warning_threshold`, `position_sync_interval_sec`, `max_ltv_pct`), policy forms (LTV limit slider, asset whitelist picker), E2E test scenarios covering full supply -> position-sync -> health-check flow

### Phase Ordering Rationale

- Phases 1 -> 2 -> 3 follows the hard dependency chain: interfaces must exist before implementations
- Phase 2 before Phase 3 ensures the framework is testable in isolation before the first concrete provider is added
- Phase 4 before Phase 5 because the Admin UI is entirely driven by REST API endpoints
- Pitfall prevention is distributed across phases by where the code lives (not bunched into a "safety phase")
- Framework-first design (Phase 2) means future providers (Kamino, Morpho) from m29-00's design will slot directly into Phase 2's infrastructure

### Research Flags

Phases with standard, well-documented patterns (no additional research needed):
- **Phase 1:** Zod schema and Drizzle migration patterns are fully established in the codebase
- **Phase 3:** ABI encoding pattern verified against Lido source and Aave V3 official ABI; contract addresses verified on Etherscan
- **Phase 5:** Admin UI Preact component patterns are established

Phases that need careful attention during implementation (not external research, but internal validation):
- **Phase 2:** PositionTracker's interaction with HealthFactorMonitor on-demand sync needs care — the "request sync on DANGER detection" pathway must not create a polling loop
- **Phase 3 / Phase 4:** Verify ActionProviderRegistry actually propagates `actionProvider` metadata to all elements of a multi-step array (not just single-element returns) — this is Pitfall C4 and requires codebase verification
- **Phase 4:** LendingPolicyEvaluator spending classification for supply/repay/withdraw/borrow — confirm the existing pipeline metadata hooks are sufficient or require extension

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies. All patterns verified against existing Lido/0x/LI.FI provider source. Aave V3 Pool ABI verified against official docs and Etherscan. Contract addresses verified from bgd-labs/aave-address-book TypeScript source files. |
| Features | HIGH | IActionProvider pattern, 6-stage pipeline, DatabasePolicyEngine policy types, and MCP auto-generation all verified from codebase. m29-00 design doc (shipped v29.0) provides complete specifications for PositionTracker, HealthFactorMonitor, and LendingPolicyEvaluator. |
| Architecture | HIGH | Component boundaries and data flow are fully specified. DaemonLifecycle integration point identified (step 4c-10.5, 4c-11). Dual-interface pattern (ILendingProvider + IPositionProvider on same class) is consistent with existing codebase conventions. |
| Pitfalls | HIGH | Protocol pitfalls (ERC-20 race condition, HF precision, stable rate deprecation, isolation mode, rebase balances) verified from Aave V3 official documentation and governance proposals. Integration pitfalls (CONTRACT_WHITELIST bypass, SPENDING_LIMIT classification) verified from reading existing pipeline source. |

**Overall confidence:** HIGH

### Gaps to Address

- **scaledBalanceOf availability per chain:** The aToken `scaledBalanceOf()` method is standard ERC-20 extension in Aave V3, but should be verified against aToken ABI before Phase 3 implementation begins. If unavailable on a specific chain, fall back to `balanceOf()` + threshold comparison.
- **ActionProviderRegistry multi-step metadata propagation (Pitfall C4):** Must verify in `packages/actions/src/index.ts` and `packages/daemon/src/services/action-provider-registry.ts` that when `resolve()` returns an array, `actionProvider` is injected into all elements. This is a codebase-specific verification, not external research.
- **Aave V3 vs V3.1 address consistency:** Stack research notes Pool proxy addresses are immutable since deployment. Governance has passed Aave V3.1 upgrades via implementation changes (not proxy replacement). Verify this assumption holds for all 5 supported chains before finalizing config.ts.
- **USDT zero-first approve token list:** Pitfall C1 requires a `ZERO_FIRST_APPROVE_TOKENS` list in config. Needs a definitive list of Aave V3 supported assets requiring zero-first approval (USDT on Ethereum is confirmed; others may vary by chain).

---

## Sources

### Primary (HIGH confidence)
- [Aave V3 Pool Smart Contract Docs](https://aave.com/docs/aave-v3/smart-contracts/pool) — supply/borrow/repay/withdraw/getUserAccountData function signatures
- [Aave V3 IPool.sol Interface](https://github.com/aave/aave-v3-core/blob/master/contracts/interfaces/IPool.sol) — function selectors verified
- [bgd-labs/aave-address-book TypeScript source](https://github.com/bgd-labs/aave-address-book/) — all 5 chain contract addresses verified
- [Aave Pool V3 Ethereum (Etherscan)](https://etherscan.io/address/0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2) — on-chain verification
- [Aave Pool V3 Arbitrum (Arbiscan)](https://arbiscan.io/address/0x794a61358d6845594f94dc1db02a252b5b4814ad) — on-chain verification
- [Aave Addresses Dashboard](https://aave.com/docs/resources/addresses) — official deployment list
- [Aave Health Factor & Liquidations](https://aave.com/help/borrowing/liquidations) — HF formula, close factors
- [viem readContract docs](https://viem.sh/docs/contract/readContract) — daemon-side ABI call patterns
- m29-00 design document (internal, shipped v29.0) — ILendingProvider, PositionTracker, HealthFactorMonitor, LendingPolicyEvaluator specifications
- m29-02 objective document (internal) — implementation scope, 15 E2E scenarios
- Existing codebase: `lido-staking/lido-contract.ts`, `zerox-swap/config.ts`, `database-policy-engine.ts`, `EvmAdapter` — verified integration patterns

### Secondary (MEDIUM confidence)
- [Aave V3 E-Mode docs](https://aave.com/help/borrowing/e-mode) — E-Mode restrictions (Pitfall M5)
- [Aave Governance: Stable Rate Deprecation](https://governance.aave.com) — V3.2 stable rate removal (Pitfall M1)

---
*Research completed: 2026-02-26*
*Ready for roadmap: yes*
