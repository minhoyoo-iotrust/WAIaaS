# Project Research Summary

**Project:** WAIaaS DeFi Protocol Integration (m28-00 ~ m28-05)
**Domain:** DeFi Action Providers -- DEX Swap, Cross-Chain Bridge, Liquid Staking, Gas Optimization
**Researched:** 2026-02-23
**Confidence:** HIGH

## Executive Summary

WAIaaS DeFi protocol integration covers 5 sub-milestones (Jupiter Swap, 0x EVM Swap, LI.FI Cross-Chain Bridge, Lido+Jito Liquid Staking, Gas Conditional Execution) that extend the existing IActionProvider framework established in v1.5. The critical finding is that **zero new npm dependencies are required** -- all 5 protocols integrate via REST APIs (native fetch + Zod validation) or direct ABI/instruction encoding using viem 2.x and @solana/kit 6.x already in the monorepo. A new `@waiaas/actions` package houses all provider implementations, following the established `packages/*` monorepo pattern with workspace dependencies only.

The recommended approach uses the existing 6-stage pipeline with two targeted extensions: a `GAS_WAITING` state inserted between Stage 3 (policy) and Stage 4 (wait) for gas conditional execution, and an `AsyncStatusTracker` for bridge/unstake completion polling. A single DB migration handles both additions. Two critical design corrections emerged from research: (1) 0x should use **AllowanceHolder** endpoints (`/swap/allowance-holder/*`) instead of Permit2 -- simpler flow, lower gas, single signature, no EIP-712 complexity; (2) Jito staking must use **manual instruction building** because `@solana/spl-stake-pool` depends on legacy `@solana/web3.js v1` and is incompatible with `@solana/kit 6.x`.

The primary risks are: cross-chain bridge fund loss from premature timeout (30 min is too short -- extend to 2+ hours), destination address policy bypass on bridges (must validate `toAddress` from LI.FI quote), stETH rebase token breaking balance tracking (consider wstETH), and gas condition nonce starvation from stale calldata (must re-resolve on condition met). All 7 critical pitfalls have concrete prevention strategies documented. Build order is dependency-driven: Jupiter first (creates package scaffolding), then 0x (EVM variant), LI.FI (async tracking + DB migration), Lido+Jito (reuse async tracker), Gas Conditions last (touches pipeline core).

## Key Findings

### Recommended Stack

Zero new npm dependencies. All DeFi protocols integrate through existing workspace packages: `viem ^2.21.0` for EVM ABI encoding and EIP-712 signing, `@solana/kit ^6.0.1` and `@solana-program/*` for Solana instruction building, `zod ^3.24.0` for API response validation, and Node.js 22 native `fetch` for REST API calls. A new `@waiaas/actions` package (workspace dependency only) houses all 5 ActionProvider implementations.

**Core technologies (all existing):**
- **viem 2.45.3**: `encodeFunctionData()` for Lido ABI, potential `signTypedData()` for 0x EIP-712 -- already locked in monorepo
- **@solana/kit 6.0.1**: Jito SPL Stake Pool raw instruction building -- replaces incompatible `@solana/spl-stake-pool`
- **Native fetch + AbortController**: Jupiter, 0x, LI.FI REST API calls with 10-15s timeout -- no SDK wrappers needed
- **zod 3.25.76**: Runtime validation of every external API response -- detects API drift before it causes fund loss

**Rejected dependencies** (with clear rationale): `@jup-ag/api` (wraps 2 endpoints, adds 2MB), `@solana/spl-stake-pool` (incompatible with @solana/kit v6), `@lifi/sdk` (frontend-focused), `@lidofinance/lido-ethereum-sdk` (frontend-focused), `ethers` (competing with viem).

**API authentication:** Only 0x requires an API key (mandatory). Jupiter and LI.FI API keys are optional (rate limit improvement). Lido and Jito are on-chain direct calls (no API key).

See: [STACK.md](.planning/research/STACK.md)

### Expected Features

**Must have (table stakes):**
- DEX token swap: Jupiter (Solana) + 0x (19+ EVM chains) -- aggregators with broadest coverage
- Slippage protection with configurable per-provider limits (bps for Jupiter, pct for 0x/LI.FI)
- Price impact guard -- reject swaps with > 1% impact automatically
- Quote/estimate before execution via `resolve()` return
- ERC-20 token approval handling (AllowanceHolder standard approve flow)
- Cross-chain bridge via LI.FI (40+ chains, 100+ bridges, Solana confirmed)
- Bridge status tracking with notifications (COMPLETED/FAILED/TIMEOUT)
- Lido ETH staking (stETH, $35B TVL) + Jito SOL staking (JitoSOL, $3B TVL)
- Unstake with async tracking (Lido: 1-14 days, Jito: ~2 days epoch boundary)
- CONTRACT_WHITELIST + SPENDING_LIMIT policy enforcement on all DeFi actions
- MCP tool auto-exposure + SDK `executeAction()` support (existing framework)

**Should have (differentiators):**
- Gas conditional execution ("execute when gas < 30 gwei") -- unique among AI agent wallets
- Jito MEV protection (bundle routing to avoid sandwich attacks on Solana swaps)
- Declarative DeFi via MCP (natural language -> protocol, zero protocol knowledge needed)
- Unified safety config across protocols in Admin Settings
- Provider-level enable/disable per operator preference

**Defer (v2+):**
- Yield farming / LP position management (10x scope increase, impermanent loss complexity)
- Limit orders / TWAP execution (persistent order book monitoring)
- Leveraged positions / lending (Aave, Compound -- liquidation risk)
- wstETH wrapping / L2 Lido staking (edge case, handle stETH on mainnet first)
- Multi-hop manual route construction (trust aggregator routing)
- Intent-based / gasless swap protocols (removes transaction control WAIaaS needs)

See: [m28-defi-FEATURES.md](.planning/research/m28-defi-FEATURES.md)

### Architecture Approach

The architecture extends WAIaaS's existing `IActionProvider` framework without structural changes. Each DeFi protocol becomes an ActionProvider implementation in `@waiaas/actions` that returns a `ContractCallRequest` from `resolve()`, flowing through the unmodified 6-stage pipeline for policy enforcement, signing, and submission. Two new cross-cutting concerns are added: `GasConditionEvaluator` (Stage 3.5 between policy and wait) and `AsyncStatusTracker` (post-pipeline bridge/unstake polling via `BackgroundWorkers`). One unified DB migration adds `bridge_status`, `bridge_metadata` columns and `GAS_WAITING` transaction status.

**Major components:**
1. **@waiaas/actions package** (NEW) -- 5 ActionProvider implementations + `ActionApiClient` base (shared fetch/Zod) + `SlippageHelper`
2. **GasConditionEvaluator + GasConditionWorker** (NEW in daemon) -- Pipeline Stage 3.5 halt/resume pattern, batch RPC polling O(networks)
3. **AsyncStatusTracker + BridgeStatusWorker + UnstakeStatusWorker** (NEW in daemon) -- LI.FI /status polling, Lido Withdrawal Queue, Jito epoch tracking
4. **ActionProviderRegistry** (MODIFIED) -- Loads 5 new providers from `@waiaas/actions` via config-driven registration
5. **Pipeline stages.ts** (MODIFIED) -- GAS_WAITING branch between Stage 3 and Stage 4
6. **TRANSACTION_STATUSES enum** (MODIFIED) -- Add `GAS_WAITING` (10 -> 11 values)

**Key patterns:** resolve() purity (no side effects), ActionApiClient with Zod validation, config-driven provider registration, pipeline HALT + worker resume (existing pattern extended), batch gas evaluation O(networks).

See: [m28-defi-ARCHITECTURE.md](.planning/research/m28-defi-ARCHITECTURE.md)

### Critical Pitfalls

7 critical pitfalls identified, each with concrete prevention strategy:

1. **Cross-chain bridge fund loss (P4)** -- LI.FI "limbo" state where funds leave source but do not arrive on destination. 30-min polling window is too short for Wormhole and congestion periods. **Prevent:** Extend max polling to 2+ hours, never auto-cancel on timeout, transition to `BRIDGE_MONITORING` instead, keep SPENDING_LIMIT reservation active until confirmed COMPLETED.

2. **Destination address policy bypass on bridges (P7)** -- Policy engine evaluates source chain only; destination address is embedded in bridge calldata, invisible to policy. Agent could bridge to attacker address. **Prevent:** Extract and validate `toAddress` from LI.FI quote. Default to self-bridge only (own wallet on destination chain). Require APPROVAL-tier for unknown destinations.

3. **0x Permit2 double-transaction race condition (P3)** -- Approve + swap as independent pipelines creates nonce conflicts and gas waste. **Prevent:** Use AllowanceHolder instead of Permit2 (0x recommendation for server-side). Standard ERC-20 approve flow already supported by APPROVE pipeline type.

4. **Gas condition nonce starvation (P6)** -- Stale calldata after hours of gas-waiting. DeFi quotes have 30s TTL. **Prevent:** Store original ActionProvider name + input params, re-resolve with fresh quote when gas condition met. Per-wallet gas-waiting limits. Sequential nonce processing.

5. **stETH rebase breaks balance tracking (P5)** -- Rebasing token causes stale balances, 1-2 wei dust on full transfers, incorrect policy evaluation. **Prevent:** Use wstETH (non-rebasing wrapper) for internal operations, or track in shares not balances. Use `transferShares()` for "transfer all."

6. **MEV/frontrunning via Jito fallback (P2)** -- Silent fallback to public mempool exposes swaps to sandwich attacks (5-15% extraction). **Prevent:** Fail-closed when Jito unavailable, never silently degrade. Use `dynamicSlippage` from Jupiter API. Track Jito availability.

7. **Jupiter API version drift (P1)** -- Endpoint migration and schema changes break ContractCallRequest construction. **Prevent:** Strict Zod runtime validation on every response, version-pin base URL in config.toml, log raw response on validation failure.

See: [m28-defi-protocol-PITFALLS.md](.planning/research/m28-defi-protocol-PITFALLS.md)

## Implications for Roadmap

Based on research, 6 phases with strict dependency ordering. Build order is driven by package scaffolding dependency (m28-01 creates `@waiaas/actions`), async tracking dependency (m28-03 creates `AsyncStatusTracker` reused by m28-04), and pipeline stability (m28-05 touches core pipeline, must come last).

### Phase 1: Common Design (m28-00)
**Rationale:** All implementation phases consume common design artifacts. Foundation must exist before any code.
**Delivers:** packages/actions/ directory structure, ActionApiClient base pattern, SlippageHelper with branded types, AsyncStatusTracker interface, policy integration rules (CONTRACT_WHITELIST bundles, SPENDING_LIMIT evaluation), test strategy with mock API patterns, unified DB migration spec.
**Addresses:** Slippage unit confusion (P8), timeout budget separation (P10), settings snapshot pattern (P19), CONTRACT_WHITELIST fragmentation (P13).
**Avoids:** P8 (slippage unit confusion) via branded types at design time; P10 (timeout cascade) via resolve-before-pipeline pattern.
**Research needed:** No -- design-only phase, all patterns well-documented from research.

### Phase 2: Jupiter Swap (m28-01)
**Rationale:** First ActionProvider implementation validates the entire framework end-to-end. Creates `@waiaas/actions` package scaffolding reused by all subsequent providers. Simplest protocol (2 REST endpoints, no API key required, no async tracking). Solana is WAIaaS's primary chain.
**Delivers:** `@waiaas/actions` package (package.json, tsconfig, turbo), `ActionApiClient` base class, `SlippageHelper`, `JupiterSwapActionProvider` + `JupiterApiClient`, Jito MEV protection, MCP auto-exposure, 12+ tests.
**Uses:** Native fetch, @solana/kit 6.x, zod (all existing).
**Implements:** ActionApiClient base, config-driven provider registration pattern.
**Avoids:** P1 (API drift) via strict Zod validation; P2 (MEV) via fail-closed Jito integration; P15 (versioned tx) via verifying SolanaAdapter capabilities.
**Research needed:** No -- Jupiter Swap API is well-documented, patterns are standard.

### Phase 3: 0x EVM Swap (m28-02)
**Rationale:** Validates EVM-side ActionProvider pattern (complement to Solana Jupiter). Reuses package structure from m28-01. Covers 19+ EVM chains immediately.
**Delivers:** `ZeroExSwapActionProvider` + `ZeroExApiClient`, AllowanceHolder token approval flow, multi-chain routing (chainId mapping), API key management with header redaction, 14+ tests.
**Uses:** Native fetch, viem 2.x `encodeFunctionData()` for approve calls (all existing).
**Implements:** EVM ActionProvider variant, API key security pattern.
**Avoids:** P3 (Permit2 race condition) by using AllowanceHolder instead; P9 (API key leak) via header redaction + env var preference; P16 (chain routing) via v2 unified endpoint.
**Critical correction required:** m28-02 objective file must be updated to use AllowanceHolder (`/swap/allowance-holder/*`) instead of Permit2 before implementation begins.
**Research needed:** No -- 0x docs are comprehensive, AllowanceHolder is simpler than Permit2.

### Phase 4: LI.FI Cross-Chain Bridge (m28-03)
**Rationale:** Highest complexity feature -- introduces async tracking (new pattern) and the only DB migration. AsyncStatusTracker pattern is shared with m28-04 unstake. Must stabilize before staking depends on it.
**Delivers:** `LiFiActionProvider` + `LiFiApiClient`, `AsyncStatusTracker` interface + `BridgeStatusWorker`, DB migration (bridge_status + bridge_metadata + GAS_WAITING state + indexes), bridge completion notifications (BRIDGE_COMPLETED, BRIDGE_FAILED), cross-chain policy validation, 14+ tests.
**Uses:** Native fetch (all existing).
**Implements:** AsyncStatusTracker interface, BackgroundWorkers bridge polling, cross-chain policy evaluation.
**Avoids:** P4 (fund loss limbo) via 2+ hour polling, never auto-cancel, BRIDGE_MONITORING state; P7 (destination hijack) via toAddress extraction + self-bridge default; P17 (stale quotes) via no cross-chain quote caching.
**Research needed:** Moderate -- LI.FI Solana transaction format differences from EVM need validation with testnet calls. Bridge timeout tuning may need empirical data.

### Phase 5: Liquid Staking -- Lido + Jito (m28-04)
**Rationale:** No external API dependency (direct ABI/program encoding) makes these faster and more reliable. Reuses AsyncStatusTracker from m28-03 for unstake tracking. Can partially overlap with m28-03 since no DB migration needed.
**Delivers:** `LidoStakingActionProvider` + `JitoStakingActionProvider`, `UnstakeStatusWorker` (Lido Withdrawal Queue + Jito epoch), staking position API (`GET /v1/wallets/:id/staking`), Admin Dashboard staking section, 14+ tests.
**Uses:** viem `encodeFunctionData()` for Lido, @solana/kit + @solana-program/* for Jito (all existing).
**Implements:** Direct ABI encoding pattern (no REST API), SPL Stake Pool manual instruction building, AsyncStatusTracker reuse.
**Avoids:** P5 (stETH rebase) via wstETH or shares-based tracking -- decision required before implementation; P11 (epoch rate staleness) via 0.5% tolerance + epoch proximity warning; P12 (unstake duration) via 14-day polling + Lido status API; P18 (LST price oracle) via base-asset exchange rate calculation.
**Research needed:** Moderate -- Jito SPL Stake Pool manual instruction building needs careful verification of 10-account layout. wstETH vs stETH architecture decision needs finalization.

### Phase 6: Gas Conditional Execution (m28-05)
**Rationale:** Last because it touches pipeline core (highest risk). Benefits from all DeFi providers being stable. Depends on m28-03 DB migration (GAS_WAITING state already added). Cross-cutting concern affecting pipeline, MCP, SDK, Admin, notifications.
**Delivers:** `GasConditionEvaluator` + `GasConditionWorker`, Pipeline Stage 3.5 (GAS_WAITING halt/resume), `gasCondition` optional field on all transaction types, gas condition notifications (TX_GAS_WAITING, TX_GAS_CONDITION_MET), Admin Settings gas_condition section, 12+ tests.
**Uses:** Existing RPC infrastructure via IChainAdapter (eth_gasPrice, eth_maxPriorityFeePerGas, getRecentPrioritizationFees).
**Implements:** Pipeline HALT + Worker resume pattern (extends existing DELAY/APPROVAL pattern), batch gas evaluation O(networks).
**Avoids:** P6 (nonce starvation) via re-resolve calldata on condition met + per-wallet limits + sequential nonce processing; P14 (RPC cascading timeouts) via paused timeout clock during RPC failures + exponential backoff; P20 (SQLite contention) via batch queries + WAL mode.
**Research needed:** Moderate -- re-resolve pattern for stale calldata is novel and needs careful design. Interaction between gas-waiting and normal transactions needs state machine verification.

### Phase Ordering Rationale

- **m28-00 first:** Design artifacts consumed by all 5 implementation phases. Common patterns (ActionApiClient, SlippageHelper, branded types) prevent per-provider reinvention.
- **m28-01 before all others:** Creates `@waiaas/actions` package scaffolding. Validates IActionProvider integration end-to-end with the simplest protocol.
- **m28-02 after m28-01:** Reuses package structure. Adds EVM-specific patterns (approve flow, chainId routing). Together with m28-01, proves both Solana and EVM provider patterns work.
- **m28-03 after m28-02:** Most complex new pattern (async tracking). Single DB migration shared by m28-04 and m28-05. Must stabilize before consumers depend on it.
- **m28-04 can partially overlap m28-03:** No DB migration dependency. Only depends on m28-01 package structure and m28-03 AsyncStatusTracker interface (which can be designed in m28-00).
- **m28-05 absolutely last:** Touches pipeline core (stages.ts). Benefits from stable DeFi providers. Cross-cutting changes to transaction schema, enum, notifications.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (m28-03, LI.FI Bridge):** LI.FI Solana transaction format needs testnet validation. Bridge timeout tuning requires empirical data. Destination address policy design needs careful threat modeling.
- **Phase 5 (m28-04, Liquid Staking):** Jito SPL Stake Pool 10-account instruction layout must be verified against live mainnet data. wstETH vs stETH decision has broad implications. Lido Withdrawal Queue NFT tracking flow needs prototype.
- **Phase 6 (m28-05, Gas Conditions):** Re-resolve pattern for stale calldata is novel. Interaction between GAS_WAITING and concurrent normal transactions needs state machine analysis.

Phases with standard patterns (skip research-phase):
- **Phase 1 (m28-00, Common Design):** Design-only, all patterns documented from this research.
- **Phase 2 (m28-01, Jupiter Swap):** Well-documented API, 2 endpoints, existing patterns. The team has built ActionProviders before (v1.5).
- **Phase 3 (m28-02, 0x Swap):** Follows Jupiter pattern closely. AllowanceHolder is simpler than Permit2. Standard ERC-20 approve + swap.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies. All versions verified against pnpm-lock.yaml. @solana/spl-stake-pool incompatibility confirmed. |
| Features | HIGH | Feature landscape derived from objective files + official API docs + competitive analysis (Coinbase AgentKit, Uniswap AI Skills). |
| Architecture | HIGH | Based on direct codebase analysis of existing IActionProvider, pipeline, BackgroundWorkers patterns. Extensions are minimal and follow established conventions. |
| Pitfalls | HIGH | 20 pitfalls sourced from official docs (Lido stETH integration guide, LI.FI bridge issues, 0x troubleshooting), community findings (stETH wei rounding GitHub issue), and codebase analysis. |

**Overall confidence:** HIGH

### Gaps to Address

- **0x AllowanceHolder vs Permit2:** Research strongly recommends AllowanceHolder. The m28-02 objective file currently specifies Permit2 and must be updated before implementation. The STACK.md data flow still references Permit2 in some places -- these should be reconciled during m28-00 design phase.
- **wstETH vs stETH decision:** Research identifies critical issues with stETH (rebase, 1-2 wei dust, L2 bridging stops rebasing). Using wstETH eliminates all issues but adds wrap/unwrap step. This architecture decision must be finalized in m28-00 design before m28-04 implementation.
- **LI.FI Solana transaction format:** Quote responses for Solana-origin bridges may differ structurally from EVM-origin. Specific field mapping needs testnet validation before m28-03 implementation.
- **Jupiter swap-instructions response fields:** Exact field names (`swapInstruction` vs `swap_instruction`) need verification with a live API call during m28-01 implementation.
- **0x Permit2 EIP-712 object structure:** If AllowanceHolder is adopted (recommended), this gap becomes moot. If Permit2 is kept, the `permit2.eip712` object structure needs testnet verification.
- **Jito DepositSol instruction encoding:** 10-account layout + discriminator byte layout must be verified against SPL Stake Pool program source code. Manual instruction building has zero room for error.
- **STO-03 (existing known gap):** Confirmation Worker RPC callback not injected -- DETECTED to CONFIRMED transition for incoming transactions remains unresolved from v27.1. Not directly related to DeFi but may interact with bridge incoming detection.

## Complexity Budget

| Provider | Est. Files | Est. Tests | Est. LOC | DB Migration | API Key |
|----------|-----------|------------|----------|-------------|---------|
| Common Design (m28-00) | 0 (design) | 0 | 0 | Design only | N/A |
| Jupiter Swap (m28-01) | 10-15 | 12-18 | ~1,500 | None | Optional |
| 0x EVM Swap (m28-02) | 12-16 | 14-20 | ~1,800 | None | Required |
| LI.FI Bridge (m28-03) | 12-16 | 14-20 | ~2,000 | 1 (unified) | Optional |
| Lido + Jito Staking (m28-04) | 15-20 | 14-20 | ~2,200 | None | None |
| Gas Conditional (m28-05) | 10-15 | 12-16 | ~1,200 | None (reuses m28-03) | None |
| **Total** | **~65** | **~70** | **~8,700** | **1** | **1 required (0x)** |

## Sources

### Primary (HIGH confidence)
- [Jupiter Swap API Documentation](https://dev.jup.ag/docs/swap-api) -- Quote + swap-instructions endpoints, Swap API vs Ultra API distinction
- [0x Swap API v2](https://0x.org/docs/0x-swap-api/introduction) -- AllowanceHolder vs Permit2, chainId routing, API key requirements
- [0x AllowanceHolder Guide](https://0x.org/docs/0x-swap-api/guides/swap-tokens-with-0x-swap-api) -- Recommended server-side flow
- [LI.FI API Documentation](https://docs.li.fi/) -- Quote, status tracking, Solana support
- [LI.FI Solana Integration](https://docs.li.fi/li.fi-api/solana) -- Solana chain ID, bridges, token addresses
- [Lido Contract Documentation](https://docs.lido.fi/contracts/lido/) -- submit(), stETH, Withdrawal Queue
- [Lido stETH Integration Guide](https://docs.lido.fi/guides/steth-integration-guide/) -- Rebase mechanics, wstETH recommendation, 1-2 wei issue
- [Jito SPL Stake Pool Internals](https://www.jito.network/docs/stakenet/jito-steward/advanced/spl-stake-pool-internals/) -- Instruction layout
- [SPL Stake Pool deposit_sol](https://docs.rs/spl-stake-pool/latest/spl_stake_pool/instruction/fn.deposit_sol.html) -- 10-account spec
- WAIaaS codebase analysis (direct code review): IActionProvider interface, ActionProviderRegistry, pipeline stages, ContractCallRequest schema, BackgroundWorkers, transaction statuses

### Secondary (MEDIUM confidence)
- [Coinbase AgentKit Documentation](https://docs.cdp.coinbase.com/agent-kit/welcome) -- Competitive landscape
- [LI.FI Bridge Issues FAQ](https://help.li.fi/hc/en-us/articles/11158338772251) -- Bridge failure modes and recovery
- [stETH 1-2 wei rounding issue](https://github.com/lidofinance/core/issues/442) -- Confirmed rebase precision loss
- [QuickNode Nonce Management](https://www.quicknode.com/guides/ethereum-development/transactions/how-to-manage-nonces-with-ethereum-transactions) -- Nonce starvation patterns

### Tertiary (LOW confidence)
- Jupiter API rate limits (specific numbers undocumented, general behavior described)
- 0x supported chains exact list (19+ confirmed, may expand)
- Bridge timeout empirical data (derived from protocol documentation, not measured)

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
