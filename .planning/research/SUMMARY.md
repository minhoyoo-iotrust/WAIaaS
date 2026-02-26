# Project Research Summary

**Project:** WAIaaS Advanced DeFi Protocol Integration (m29)
**Domain:** Lending (Aave V3 / Kamino / Morpho), Yield Tokenization (Pendle PT/YT), Perpetual Trading (Drift), Intent-Based Trading (CoW Protocol), Position Tracking, DeFi Monitoring
**Researched:** 2026-02-26
**Confidence:** HIGH (stack and architecture grounded in existing codebase + official docs; protocol specifics verified via npm registry, Etherscan, official docs)

## Executive Summary

WAIaaS m29 adds advanced DeFi protocol support — lending, yield tokenization, perpetual trading, and intent-based trading — to an AI agent wallet that already has swaps, staking, and cross-chain bridging. The correct architecture extends the existing IActionProvider framework: every new protocol (Aave, Kamino, Pendle, Drift, CoW) becomes a new IActionProvider implementation that resolves to ContractCallRequest[], flows through the existing 6-stage pipeline, and is automatically exposed as MCP tools. No new pipeline variants, no new transaction types, and critically, zero new npm dependencies for EVM protocols. All EVM integrations (Aave, Morpho, Pendle, CoW) use direct ABI encoding or REST API calldata — the same pattern proven by Lido, Jupiter, 0x, and LI.FI.

The recommended delivery order is infrastructure-first: build the positions table and PositionTracker service before any protocol, then add the DeFiMonitorService (health factor / maturity / margin rules), then implement protocols in order of simplicity and TVL priority: Aave V3 (largest TVL, simplest ABI), Kamino (Solana lending parity), Pendle (fixed yield via Hosted SDK REST API), and Drift perps (most complex, requires Gateway REST API). CoW Protocol intent-based trading rounds out the feature set and requires extending IChainAdapter with EIP-712 signTypedData support. Morpho Blue is a valid addition but lower priority than Kamino for the Solana-first user base.

The primary risks are operational, not architectural. Stale health factor data during volatile markets is the most dangerous failure mode — the solution is adaptive polling (5 min safe, 1 min warning, 15 sec danger, 5 sec critical) rather than a fixed interval. SQLite write contention from high-frequency position updates requires batch writes in a dedicated BackgroundWorker, never inline with the pipeline. Intent signatures require strict EIP-712 domain binding with short deadlines (2-5 minutes for AI agents) and server-side nonce tracking to prevent replay attacks. Finally, scope discipline is critical: this milestone provides DeFi execution primitives for AI agents, not a DeFi dashboard for humans. Resist impermanent loss calculators, portfolio aggregation, and yield comparison matrices — the AI agent needs structured risk assessments, not charts.

## Key Findings

### Recommended Stack

The zero-external-SDK principle established in v28.x continues to hold for all EVM protocols. Aave V3 (supply/borrow/repay/withdraw) is encoded directly against the Pool contract ABI using the same `encodeXxxCalldata()` pattern as `lido-contract.ts`. Morpho Blue follows the same approach with a 5-field MarketParams struct. Pendle uses its official Hosted SDK REST API — identical to the Jupiter/0x/LI.FI pattern that returns transaction calldata directly. CoW Protocol order signing uses `viem`'s `signTypedData()` which is already present in the daemon, plus the CoW OrderBook REST API for submission. No new npm packages are needed for any of these.

The two Solana protocols are the exceptions. The `@kamino-finance/klend-sdk` v7.3.20 is incompatible with WAIaaS's `@solana/kit ^6.0.1` (the SDK requires `@solana/kit ^2.3.0` and `@coral-xyz/anchor ^0.28`). The recommended path is the Kamino REST API (if available) or manual Anchor IDL-based instruction encoding. Drift is the one unavoidable external dependency situation: `@drift-labs/sdk` (26+ transitive packages) is the only practical approach for building valid Drift instructions. The Drift Gateway REST API (`drift-labs/gateway`, a self-hosted Rust binary) is the recommended integration path — the Gateway shields `@waiaas/actions` from direct SDK coupling.

**Core technologies:**
- viem `^2.21.0` — EVM ABI encoding + EIP-712 signing; already in daemon, zero new cost
- @solana/kit `^6.0.1` — Solana instruction building if manual encoding needed for Kamino; already present
- Drift Gateway REST API — self-hosted Rust binary exposing `/v2/orders`, `/v2/positions`, `/v2/user/marginInfo`; avoids `@drift-labs/sdk` in monorepo
- Pendle Hosted SDK `https://api-v2.pendle.finance/core/v2/sdk/` — REST API returning calldata, same pattern as Jupiter
- CoW OrderBook API `https://api.cow.fi` — REST API for intent submission after EIP-712 signing
- Drizzle ORM + SQLite — new `positions` table, DB migration v25

**What not to add:**
- `@aave/client` — peerDeps: viem + ethers + thirdweb; 4 ABI calls don't justify 3 peer deps
- `@morpho-org/blue-sdk-viem` — peerDeps: viem + blue-sdk + morpho-ts + lodash; 5 ABI calls don't justify it
- `@kamino-finance/klend-sdk` — `@solana/kit ^2.3.0` conflicts with our `^6.0.1`; 20+ transitive deps
- `@drift-labs/sdk` — `@solana/web3.js 1.x` legacy (incompatible with `@solana/kit 6.x`); 26+ deps; use Gateway instead
- `@pendle/sdk-v2` — ethers-based (not viem), beta-only releases; Pendle team recommends Hosted SDK for backends
- `@cowprotocol/cow-sdk` — 7 sub-packages + IPFS deps for 1 signing function + 1 REST call

### Expected Features

**Must have (table stakes):**
- Aave V3 supply, borrow, repay, withdraw (EVM) — largest lending protocol by TVL; foundation for health factor monitoring
- Health factor query per lending position — without this, agent operates blind; prerequisite for safe autonomous borrowing
- PositionTracker service + `positions` DB table — unified position state across all protocols, survives daemon restarts
- DeFiMonitorService with HealthFactorRule, MaturityRule, MarginRule — the critical safety layer for autonomous agents
- Notification events for liquidation risk, maturity approaching, margin warning — routes to existing 4-channel pipeline
- GET /v1/positions REST endpoint + `list_positions` MCP tool — agent API surface for position awareness
- Kamino lending supply/borrow (Solana) — Solana lending parity with EVM
- CONTRACT_WHITELIST and SPENDING_LIMIT policy integration for all new protocols

**Should have (competitive):**
- Pendle PT buy/sell/redeem (fixed yield, EVM) — uniquely valuable for AI treasury management; no competitor offers this
- Drift perp open/close/query (Solana) — hedging and leveraged speculation via Gateway REST API
- CoW Protocol EIP-712 intent signing (MEV protection) — differentiator over direct 0x swaps
- EIP-712 `signTypedData()` extension to IChainAdapter + EvmAdapter
- Proactive auto-repay on HF critical threshold — "AI agent safety net" feature
- Admin UI DeFi positions panel (Phase 2 / later milestone)

**Defer (v2+ or later phases):**
- Morpho Blue isolated market lending — valid but Kamino is higher priority for Solana user base
- Cross-protocol position dashboard with historical charts — AI agents need structured assessments, not charts
- Automated yield farming / LP management — 10x scope, impermanent loss complexity
- Custom liquidation bot — MEV extraction role, ethical concerns, out of scope
- Advanced perp strategies (grid trading, basis trading, funding rate arbitrage) — agent application logic, not wallet infrastructure
- Flash loan strategies — separate milestone with dedicated risk analysis

### Architecture Approach

All new protocols plug into the existing IActionProvider framework without modifications to the 6-stage pipeline, policy engine, or signing infrastructure. The key architecture addition is the `positions` table (DB v25 migration) with a dedicated `PositionTracker` BackgroundWorker — separate from AsyncPollingService, which handles finite transaction lifecycles, not perpetual position monitoring. The `DeFiMonitorService` is a single BackgroundWorker with pluggable `IDeFiMonitorRule` implementations (HealthFactorRule, MaturityRule, MarginRule), feeding into the existing NotificationService. Intent-based protocols (CoW) require adding an optional `resolveIntent()` method to IActionProvider and `signTypedData()` to IChainAdapter, extending the existing sign-only pipeline variant.

**Major components:**
1. **AaveLendingActionProvider** (packages/actions) — IActionProvider impl; direct ABI encoding for supply/borrow/repay/withdraw; produces ContractCallRequest[]
2. **KaminoLendingActionProvider** (packages/actions) — Solana lending via REST API or manual instruction encoding; same IActionProvider contract
3. **PendleYieldActionProvider** (packages/actions) — Hosted SDK REST API (calldata pattern identical to Jupiter); IActionProvider impl
4. **DriftPerpActionProvider** (packages/actions) — Drift Gateway REST API; IActionProvider impl; avoids direct SDK
5. **CoWIntentActionProvider** (packages/actions) — EIP-712 signing + OrderBook API; extends IActionProvider with optional `resolveIntent()`
6. **IPositionReader** (packages/core) — new interface for reading on-chain position state, implemented per-protocol alongside each ActionProvider
7. **PositionTracker** (packages/daemon) — BackgroundWorker; polls OPEN positions, calls IPositionReader, updates positions table; adaptive polling frequency based on risk_score
8. **DeFiMonitorService** (packages/daemon) — BackgroundWorker; evaluates IDeFiMonitorRule instances per position snapshot; emits DeFi alerts via existing NotificationService
9. **positions table** (DB v25 migration) — UUIDv7 PK, wallet_id FK, protocol, position_type, status, metrics (JSON), risk_score, lifecycle timestamps

**Key patterns to follow:**
- One ActionProvider per protocol (consistent with Jupiter/0x/LiFi/Lido/Jito separation)
- ABI encoding in dedicated module (like `lido-contract.ts` — keep encoding functions separate from provider class)
- PositionReader separate from ActionProvider (reads = different lifecycle from writes)
- Metrics as JSON in DB (flexible blob like `bridgeMetadata`, not per-metric columns)
- Max 6 new notification event types (hierarchical POSITION_WARNING / POSITION_CRITICAL pattern, not per-state-per-protocol)

### Critical Pitfalls

1. **Stale health factor data during volatile markets (C1)** — Never cache HF as a single value; implement adaptive polling (5 min safe, 1 min warning, 15 sec danger, 5 sec critical); always use on-chain `getUserAccountData()` as authoritative source; include `positionLastSyncedAt` in every API response.

2. **SQLite write contention from position tracking (C2)** — Position updates must be batched in a single transaction per polling cycle from a dedicated BackgroundWorker; never update positions inline with the pipeline; monitor p99 write duration; consider a separate SQLite file for positions if contention is measurable.

3. **Intent signature replay / cross-chain replay (C3)** — Every EIP-712 intent must include `chainId`, `verifyingContract`, `nonce` (server-side monotonic counter per wallet+chain), and `deadline` (max 5 minutes for AI agents); enforce chain match before accessing private key.

4. **Liquidation alert arrives after liquidation occurs (C4)** — Set aggressive thresholds (WARNING at HF < 1.5, CRITICAL at HF < 1.3); implement auto-repay for autonomous agents at configurable threshold; never document this as "liquidation protection" — it is best-effort monitoring.

5. **Over-engineering for human users instead of AI agents (C5)** — Design API responses for AI consumption first: `{ healthFactor, risk, suggestedAction, liquidationPrice }` — not raw position data. Admin UI position panel is Phase 2. No historical data in Phase 1. Maximum 15 fields per endpoint.

## Implications for Roadmap

Based on research, the build order must be infrastructure-first. No protocol implementation starts until position tracking infrastructure is ready, and no protocol is production-ready without the monitoring service active.

### Phase 1: Position Infrastructure (Foundation)

**Rationale:** All 5 new providers depend on the positions table and PositionTracker. Building this first means every subsequent protocol gets monitoring for free immediately upon integration. Building protocols before this foundation would require retrofitting — the riskiest implementation pattern.
**Delivers:** `positions` table (DB v25 migration), IPositionReader interface in packages/core, PositionTracker BackgroundWorker in packages/daemon, DeFiPositionEvent in EventBus, GET /v1/positions REST endpoints, `list_positions` MCP tool.
**Avoids:** C2 (SQLite contention — batch write design established from day 1), M2 (AsyncPollingService overload — dedicated worker pattern, not reusing AsyncPollingService), N1 (migration complexity — single-purpose v25 migration, no combined schema changes).

### Phase 2: DeFi Monitor Service

**Rationale:** Build the monitoring rules engine before any protocol so that when protocols are added in subsequent phases, monitoring is immediately operational. Testing health factor rules, maturity rules, and margin rules without real positions is straightforward using MockPositionProvider. Adding monitoring after protocols means retrofitting — historically the riskiest approach.
**Delivers:** DeFiMonitorService (BackgroundWorker), IDeFiMonitorRule interface, HealthFactorRule + MaturityRule + MarginRule, 6 DEFI_* notification event types, Admin Settings for thresholds.
**Avoids:** C4 (liquidation timing — aggressive thresholds established in monitor design), M6 (event type explosion — hierarchical event pattern, max 6 types), M1 (resource exhaustion — adaptive polling interval logic built once, shared by all monitors).
**Uses:** existing NotificationService, existing EVENT_CATEGORY_MAP extension pattern, existing BackgroundWorkers framework.

### Phase 3: Aave V3 Lending (EVM)

**Rationale:** Largest DeFi TVL category ($35B+). Simplest integration (4 ABI-encoded calls, zero new deps). Establishes the lending provider pattern reused by Kamino and Morpho. Health factor monitoring becomes immediately operational via Phase 2's DeFiMonitorService.
**Delivers:** AaveLendingActionProvider (supply/borrow/repay/withdraw), AavePositionReader, aave-contracts.ts ABI encodings, per-chain Pool address config, CONTRACT_WHITELIST + SPENDING_LIMIT integration, MCP tools auto-generated via mcpExpose=true.
**Avoids:** C1 (stale data — AavePositionReader uses `getUserAccountData()` directly, tiered polling from Phase 2), C5 (over-engineering — 4 actions only, 3 query methods max).
**Implements:** Pattern to be reused for all subsequent lending providers.

### Phase 4: Kamino Lending (Solana)

**Rationale:** Solana lending parity with EVM. Reuses the ILendingProvider action pattern established in Phase 3. Kamino is Solana's dominant lending protocol. The DeFiMonitorService extends to Kamino health monitoring via obligation account calculation.
**Delivers:** KaminoLendingActionProvider (supply/borrow/repay/withdraw), KaminoPositionReader, DeFiMonitorService extension for Kamino HF via obligation account.
**Avoids:** N4 (Solana program incompatibility — reuses existing instructionData + accounts pattern from Jupiter/Jito), dependency conflict with @kamino-finance/klend-sdk.
**Research flag:** Verify Kamino REST API availability and response format before implementation begins. If unavailable, assess Anchor IDL-based instruction encoding complexity and timeline impact.

### Phase 5: Pendle Yield Tokenization (EVM)

**Rationale:** Fixed yield is uniquely valuable for AI agents managing treasury (predictable returns, principal protected at maturity). Lower risk than perps. Integration is straightforward — Hosted SDK REST API follows the exact Jupiter/LI.FI calldata pattern. Maturity tracking extends DeFiMonitorService's MaturityRule built in Phase 2.
**Delivers:** PendleYieldActionProvider (buy PT / sell PT / buy YT / redeem at maturity), PendlePositionReader, market discovery API integration, PT_MATURITY_APPROACHING notifications via existing DeFiMonitorService.
**Avoids:** M4 (lock-up mismanagement — `earliestWithdrawAt` mandatory in position metadata from deposit result), M7 (IActionProvider strain — Pendle Hosted SDK returns calldata directly, no interface extension needed).
**Standard patterns:** REST API + calldata pattern well-established; research phase not needed.

### Phase 6: Drift Perpetual Trading (Solana)

**Rationale:** Highest complexity and highest risk — deferred until phases 1-5 are stable. Requires Drift Gateway REST API (self-hosted Rust binary). New MAX_LEVERAGE policy type needed. MarginRule from Phase 2 becomes active for Drift positions automatically.
**Delivers:** DriftPerpActionProvider (open/close position, place orders, query PnL/margin), DriftPositionReader, MarginRule integration, DEFI_MARGIN_WARNING / DEFI_MARGIN_CRITICAL notifications, MAX_LEVERAGE PolicyType.
**Avoids:** M5 (funding rate blindness — cumulative funding cost tracked in position metadata per polling cycle), M3 (policy explosion — only 1 new PolicyType: MAX_LEVERAGE), N3 (scope creep — no solver network, no grid trading, no market making).
**Research flag:** Evaluate Drift Gateway self-hosting requirements (Docker image, binary release, config format) and confirm API endpoint surface matches expected contract (`POST /v2/orders`, `GET /v2/positions`, `GET /v2/user/marginInfo`).

### Phase 7: CoW Protocol Intent Trading (EVM)

**Rationale:** Intent-based MEV protection is a differentiator over 0x swaps. Deferred last because it requires extending IActionProvider with optional `resolveIntent()` and IChainAdapter with `signTypedData()` — interface-level changes that affect all providers and must not create churn during other protocol implementations. Phase 7 allows these interfaces to stabilize after concrete usage in phases 3-6.
**Delivers:** CoWIntentActionProvider, EIP-712 order signing, CoW OrderBook API submission, intent nonce tracking table, `resolveIntent()` extension to IActionProvider, `signTypedData()` on IChainAdapter + EvmAdapter.
**Avoids:** C3 (replay attacks — short deadlines, server-side nonces, chainId enforcement before key access), N3 (scope creep — sign and submit only, no solver implementation, no keeper network).
**Research flag:** Verify CoW API order status polling semantics and settlement timeline; confirm EIP-712 domain parameters for each supported chain (Ethereum, Arbitrum, Base).

### Phase 8: Admin UI DeFi Panel + DX Polish

**Rationale:** Admin UI for DeFi positions is explicitly Phase 2 in scope (enforcing C5 prevention — AI agents use API, humans use Admin UI later). All AI agent needs are served by the API and MCP tools delivered in phases 1-7. This phase adds operator visibility and DX completeness.
**Delivers:** DeFi positions viewer in Admin UI, position detail modal with risk score, monitor threshold settings UI, `defi.skill.md` skill file (new domain), updates to wallet.skill.md and transactions.skill.md, MCP tool updates.
**Avoids:** C5 (over-engineering — human UI follows AI API, not the other way around).

### Phase Ordering Rationale

- Infrastructure before protocols (phases 1-2) ensures every protocol gets monitoring automatically — no retrofitting
- Aave before Kamino (phase 3 before 4) because Aave establishes the lending provider pattern with zero dependencies, making it the safest first protocol implementation
- Pendle before Drift (phase 5 before 6) because Pendle is simpler (REST calldata pattern, no external deps) and lower risk (no leverage), building confidence before the most complex integration
- CoW Protocol last among protocol phases (phase 7) because its interface changes (`resolveIntent`, `signTypedData`) must not create churn during other protocol implementations
- Admin UI last (phase 8) enforcing the AI-agent-first design principle from PITFALLS.md C5

### Research Flags

Phases needing deeper research before planning begins:

- **Phase 4 (Kamino):** Verify REST API availability and endpoint contract. If the Kamino REST API does not return transaction instructions (analogous to Jupiter's `/swap-instructions`), the fallback is manual Anchor IDL-based instruction encoding — a significantly more complex approach that needs dedicated planning.
- **Phase 6 (Drift):** Evaluate Drift Gateway self-hosting requirements — Docker image availability, binary release cadence, configuration format, operator burden. Determine whether WAIaaS (a) requires operators to run the gateway externally, (b) bundles the gateway as a Docker Compose sidecar, or (c) defers Drift until a simpler integration path exists.
- **Phase 7 (CoW):** Verify EIP-712 domain parameters and nonce schema per supported chain; confirm order status polling semantics (solver settlement latency, timeout behavior, partial fill handling).

Phases with standard patterns (research phase not needed):

- **Phase 1 (Infrastructure):** SQLite + Drizzle migration patterns are well-established in WAIaaS (v24 migrations, MIG-01~06 strategy)
- **Phase 2 (Monitor Service):** Follows existing BalanceMonitorService and IncomingTxMonitorService BackgroundWorker patterns exactly
- **Phase 3 (Aave V3):** Direct ABI encoding pattern fully proven by LidoStakingActionProvider; function signatures verified against Etherscan; 4 functions only
- **Phase 5 (Pendle):** Hosted SDK REST API follows Jupiter/0x/LI.FI calldata pattern exactly; no novel integration patterns
- **Phase 8 (Admin UI):** Admin UI component patterns well-established across v1.3.2, v2.3, v27.4 milestones

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new deps for EVM protocols verified against npm registry. Drift Gateway approach is MEDIUM — depends on self-hosting viability and endpoint contract match. |
| Features | HIGH | Protocol docs verified (Aave, Morpho, Pendle, CoW via official sources + Etherscan). Drift feature set MEDIUM — Gateway API surface needs pre-implementation verification. Kamino MEDIUM — REST API availability unconfirmed. |
| Architecture | HIGH | Grounded in deep codebase analysis of all 5 existing providers, 17-table DB schema, 6-stage pipeline, 3 existing BackgroundWorkers, and existing AsyncPollingService pattern. |
| Pitfalls | HIGH (system) / MEDIUM (DeFi-specific) | System-level pitfalls (SQLite contention, EventBus limits, RPC budget, BackgroundWorker accumulation) verified from codebase. DeFi-specific pitfalls (liquidation timing, funding rate compounding) from research + community sources. |

**Overall confidence:** HIGH

### Gaps to Address

- **Kamino REST API availability:** STACK.md recommends REST API as primary integration path, but the endpoint contract has not been fully verified. Before Phase 4 planning, confirm that Kamino exposes a REST endpoint returning transaction instructions analogous to Jupiter's `/swap-instructions`. If unavailable, the fallback (manual Anchor IDL instruction encoding) is significantly more complex and needs its own research sprint.

- **Drift Gateway hosting model:** The integration depends on operators providing a self-hosted Drift Gateway instance (Rust binary). This adds operational complexity. The milestone planning must commit to one of: (a) external operator-provided gateway, (b) Docker Compose sidecar bundled with WAIaaS, (c) defer Drift. This is a product decision, not a technical one.

- **Table naming inconsistency:** STACK.md calls the new table `defi_positions` while ARCHITECTURE.md calls it `positions`. The planning phase must canonicalize the name before the migration is written. Recommendation: `defi_positions` (more specific, avoids collision risk with future non-DeFi position tracking).

- **New PolicyType count:** PITFALLS.md M3 recommends max 2 new PolicyTypes for the entire DeFi expansion. FEATURES.md suggests MAX_LEVERAGE and MAX_BORROW_UTILIZATION. The planning phase must commit to exactly which PolicyTypes are added (suggestion: MAX_LEVERAGE only in Phase 6, MAX_BORROW_UTILIZATION deferred) and which controls move to Admin Settings as provider-level configuration.

- **Intent nonce table:** PITFALLS.md C3 recommends server-side nonce tracking via an `intent_nonces` table. This is a new DB table not reflected in the positions table design. Include in either the Phase 1 positions migration (as a separate table) or Phase 7 CoW migration.

## Sources

### Primary (HIGH confidence)
- [Aave V3 Pool Contract Docs](https://aave.com/docs/aave-v3/smart-contracts/pool) — supply/borrow/repay/withdraw ABI signatures
- [Aave V3 Pool on Etherscan](https://etherscan.io/address/0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2) — ABI and address verification
- [Morpho Blue Solidity Source](https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol) — MarketParams struct, function signatures
- [Pendle Hosted SDK Docs](https://docs.pendle.finance/pendle-v2/Developers/Backend/HostedSdk) — REST API endpoint, calldata response pattern
- [CoW Protocol Signing Schemes](https://docs.cow.fi/cow-protocol/reference/core/signing-schemes) — EIP-712 domain parameters per chain
- [CoW GPv2Order.sol](https://github.com/cowprotocol/contracts/blob/main/src/contracts/libraries/GPv2Order.sol) — 12-field order struct
- [viem signTypedData](https://viem.sh/docs/accounts/local/signTypedData) — EIP-712 signing via existing viem dependency
- WAIaaS codebase: `packages/actions/src/providers/lido-staking/` — ABI encoding pattern (directly applicable to Aave)
- WAIaaS codebase: `packages/actions/src/providers/lifi/` — REST calldata pattern (directly applicable to Pendle)
- WAIaaS codebase: `packages/daemon/src/services/monitoring/balance-monitor-service.ts` — BackgroundWorker pattern for DeFiMonitorService
- WAIaaS codebase: `packages/daemon/src/lifecycle/workers.ts` — BackgroundWorkers framework
- WAIaaS codebase: `packages/daemon/src/infrastructure/database/schema.ts` — 17-table schema baseline for v25 migration

### Secondary (MEDIUM confidence)
- [Drift Gateway GitHub](https://github.com/drift-labs/gateway) — REST endpoint list; self-hosting model requires operator evaluation
- [Kamino Developer Docs](https://docs.kamino.finance/) — klend-sdk entry point; REST API availability unconfirmed
- [Kamino klend-sdk on npm](https://www.npmjs.com/package/@kamino-finance/klend-sdk) — dependency analysis (version conflicts confirmed HIGH)
- [Drift SDK on npm](https://www.npmjs.com/package/@drift-labs/sdk) — 26+ transitive deps, @solana/web3.js 1.x conflict confirmed HIGH
- [EIP-712 implementation issues](https://www.coinspect.com/blog/chainid-eip-712-implementation-issue/) — replay attack research (40+ wallets affected)
- [AI agent DeFi trading incident ($450K)](https://www.cryptotimes.io/2026/02/23/ai-agent-accidentally-sends-450k-sparks-autonomous-trading-debate/) — autonomous agent risk validation

### Tertiary (LOW confidence)
- [Kamino V2 Modular Lending architecture](https://docs.kamino.finance/) — V2 changes may affect integration surface; verify during Phase 4 planning
- [Pendle Solana expansion](https://blockworks.co/news/pendle-2025-outlook) — PT-only via CCIP bridge, not full Pendle protocol on Solana
- [CoW Protocol Solana/Cosmos expansion plans](https://coinmarketcap.com/cmc-ai/cow-protocol/latest-updates/) — future roadmap, not relevant to current implementation scope

---
*Research completed: 2026-02-26*
*Ready for roadmap: yes*
