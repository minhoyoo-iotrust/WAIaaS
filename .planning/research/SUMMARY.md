# Project Research Summary

**Project:** XRPL DEX Action Provider (v33.8)
**Domain:** XRPL native orderbook DEX integration into WAIaaS multi-chain Action Provider framework
**Researched:** 2026-04-03
**Confidence:** HIGH

## Executive Summary

XRPL DEX is a protocol-level native orderbook — not a smart contract protocol — which makes it fundamentally different from every other DEX integration in the current WAIaaS stack (Jupiter, 0x, DCent, LI.FI). All DEX operations use native XRPL transaction types (`OfferCreate`, `OfferCancel`) that are fully supported by the already-installed `xrpl@4.6.0` package. Zero new dependencies are required. The correct pattern is to route DEX actions through the existing 6-stage pipeline as `CONTRACT_CALL` type, with XRPL-specific parameters encoded in the `calldata` JSON field. Read-only queries (orderbook, offers) bypass the pipeline via `ApiDirectResult`. This approach avoids the costly alternative of adding a 10th discriminated union type, which would require SSoT propagation across 6 DB tables, the entire pipeline, policy engine, notifications, Admin UI, SDK, and MCP.

The recommended build order follows a clear dependency chain: first extend `RippleAdapter.buildContractCall()` to parse XRPL native transactions from calldata JSON (currently throws `INVALID_INSTRUCTION`), then build `XrplDexProvider` with its 5 actions (swap, limit_order, cancel_order, get_orderbook, get_offers), then wire up read-only queries and Admin integration. The most dangerous integration risks are XRPL's dual amount format (XRP=drops string vs IOU=object), partial fill results that return `tesSUCCESS` even with zero exchange, and owner reserve requirements for limit orders that land on the ledger.

The critical risk to address early is ensuring the `formatXrplAmount()` conversion utility correctly handles all three trading pair combinations (XRP-IOU, IOU-XRP, IOU-IOU) before any testing against live or testnet orders. A formatting error silently creates orders at wildly wrong prices that may execute immediately, resulting in irreversible fund loss. Policy integration (USD spending limits for DEX trades) must also be addressed because the current `resolveEffectiveAmountUsd()` cannot reach TakerGets amounts buried in calldata JSON — without a fix, the daily spending limit policy is bypassed for all DEX trades.

## Key Findings

### Recommended Stack

No new packages are needed. All DEX functionality — `OfferCreate`, `OfferCancel`, `book_offers`, `account_offers`, flag enums, and Amount types — is already exported from the installed `xrpl@4.6.0` package. The existing `RippleAdapter` provides the WebSocket client, autofill, sign/submit pipeline, fee safety margin, confirmation polling, and amount conversion utilities (`xrpToDrops`, `smallestUnitToIou`, `parseTrustLineToken`). The only required changes are extending `buildContractCall()` in the adapter and adding a new `XrplDexProvider` module under `packages/actions/src/providers/xrpl-dex/`.

**Core technologies:**
- `xrpl@4.6.0`: OfferCreate/OfferCancel types, OfferCreateFlags enum, book_offers/account_offers RPC — already installed, zero changes needed
- `RippleAdapter` (existing): autofill, sign, submit, confirmation, fee margin — needs `buildContractCall()` extension only
- `ContractCallRequest` (existing): carries XRPL params via `calldata` JSON string — no schema changes needed
- `ApiDirectResult` (existing): pipeline bypass for read-only orderbook/offers queries — already proven by Hyperliquid pattern
- `IActionProvider` interface (existing): unchanged; `XrplDexProvider` implements it directly

### Expected Features

**Must have (table stakes):**
- Swap (tfImmediateOrCancel OfferCreate) — core DEX primitive; immediate execution or cancel with no residual order
- Limit order (OfferCreate without IOC) — places persistent offer on the XRPL orderbook with optional expiration
- Cancel order (OfferCancel) — essential for managing open positions; requires accurate OfferSequence
- Get orderbook (book_offers RPC) — price discovery before executing trades; bidirectional price labeling
- Get offers (account_offers RPC) — agent's own open order status with seq field for cancel

**Should have (differentiators):**
- Slippage protection for swap — pre-fetch orderbook depth, calculate effective rate, enforce minimum received amount
- Trust Line pre-validation — check account_lines before IOU swap; offer guided 2-step flow when missing
- Actual fill amounts in response — parse AffectedNodes metadata for real `actualAmountIn`/`actualAmountOut`
- Limit order expiration — Ripple epoch conversion (RIPPLE_EPOCH = 946684800), default 24h TTL
- Admin UI display labels — "XRPL DEX Swap" / "XRPL DEX Limit Order" instead of opaque CONTRACT_CALL

**Defer to later milestones:**
- XRPL AMM (XLS-30) — scoped to m33-10
- WebSocket subscription for real-time order fill events — separate milestone
- RPC pool multi-endpoint failover for XRPL WebSocket — single endpoint acceptable for now
- Cross-currency path-finding (rippling) — separate from simple DEX orderbook

### Architecture Approach

The architecture maps cleanly onto two existing patterns proven in the codebase. On-chain actions (swap, limit_order, cancel_order) return `ContractCallRequest` with XRPL transaction parameters JSON-encoded in the `calldata` field; `RippleAdapter.buildContractCall()` parses this and dispatches to `OfferCreate`/`OfferCancel` builders. Read-only queries (get_orderbook, get_offers) return `ApiDirectResult` to bypass the pipeline entirely. This design requires zero changes to `buildByType()` in stage5, zero changes to policy stage3, and zero changes to `ActionProviderRegistry`. A separate `XrplOrderbookClient` is injected into the provider constructor — not shared with the adapter — to manage the read-only RPC connection lifecycle cleanly with daemon shutdown hooks.

**Major components:**
1. **XrplDexProvider** (`packages/actions/src/providers/xrpl-dex/index.ts`) — IActionProvider with 5 actions; `resolve()` dispatches to ContractCallRequest or ApiDirectResult based on action type; registered conditionally in daemon-startup when ripple RPC URL is configured
2. **XrplOrderbookClient** (`orderbook-client.ts`) — `book_offers`/`account_offers` RPC wrapper; injected at provider construction; manages own WebSocket lifecycle with shutdown disconnect
3. **OfferBuilder** (`offer-builder.ts`) — builds OfferCreate/OfferCancel params; owns `formatXrplAmount()` for XRP drops-string vs IOU `{currency,issuer,value}` object conversion; owns flag calculations (tfImmediateOrCancel, tfSell, tfPassive)
4. **RippleAdapter.buildContractCall()** (modified) — currently throws; extended to parse calldata JSON and route to `buildXrplNativeTx()` shared helper that covers autofill, fee safety margin, and serialization identically to `buildTransaction()`
5. **tx-parser.ts** (modified) — adds OfferCreate/OfferCancel parsing cases to replace current UNKNOWN fallthrough for sign-only mode accuracy

### Critical Pitfalls

1. **XRP/IOU amount format mixing** — XRP=drops string (`"50000000"`), IOU=`{currency,issuer,value}` object; wrong format causes `temBAD_AMOUNT` or silent mis-pricing at 1,000,000x wrong magnitude. Prevention: `formatXrplAmount()` utility with unit tests covering all 3 pair combinations (XRP-IOU, IOU-XRP, IOU-IOU); implement in Phase 2 before any live order testing.

2. **tesSUCCESS does not mean full fill** — XRPL returns `tesSUCCESS` for partial fills; `tecKILLED` for zero-fill IOC swaps (after fix1578 amendment). Prevention: parse `AffectedNodes` metadata for actual exchanged amounts; handle `tecKILLED` as "no liquidity" user-facing error; include `actualAmountIn`/`actualAmountOut` in response.

3. **USD spending limit bypass** — `resolveEffectiveAmountUsd()` reads `req.value` for CONTRACT_CALL; XRPL DEX puts spend amount in calldata JSON where the policy evaluator cannot reach it, resulting in $0 USD computed for all DEX trades. Prevention: set `value` field in ContractCallRequest to TakerGets drops when XRP is sold; add oracle-based valuation path for IOU sells.

4. **Owner reserve for limit orders** — each open offer consumes 0.2 XRP owner reserve; `tecINSUF_RESERVE_OFFER` silently creates a partial order at `tesSUCCESS` with the remaining dropped. Prevention: pre-validate `available balance >= sellAmount + 200,000 drops` before limit_order execution.

5. **Sequence number collision on concurrent orders** — `client.autofill()` called concurrently returns the same Sequence for multiple transactions, causing `tefPAST_SEQ` failures. Prevention: local sequence counter in RippleAdapter mirroring the EVM nonce management pattern; invalidate cache on reconnect.

## Implications for Roadmap

Based on research, the dependency chain is: adapter extension must precede provider implementation; on-chain actions must precede read-only integration; policy/Admin UI wiring is independent and can be last. Three phases map naturally to these dependencies.

### Phase 1: Adapter Extension — buildContractCall + tx-parser
**Rationale:** `RippleAdapter.buildContractCall()` currently throws `INVALID_INSTRUCTION`. The provider cannot be tested end-to-end until the adapter can execute OfferCreate/OfferCancel. This is the hard prerequisite for everything else. Sequence management should also be resolved here since it is an adapter-level concern.
**Delivers:** `buildContractCall()` parses calldata JSON and dispatches to OfferCreate/OfferCancel builders via shared `buildXrplNativeTx()` helper; `tx-parser.ts` recognizes OfferCreate/OfferCancel; local Sequence counter strategy implemented; calldata-less calls still throw the original error.
**Addresses:** Pitfall 2 (CONTRACT_CALL structure mismatch), Pitfall 7 (Sequence collision), Pitfall 10 (tx-parser parsing gap)
**Avoids:** Premature Provider integration tests running against a stub that diverges from real adapter behavior

### Phase 2: XrplDexProvider — On-Chain Actions (swap, limit_order, cancel_order)
**Rationale:** Core business value lives here. Depends on Phase 1 adapter changes. Amount conversion (`formatXrplAmount`) correctness is the highest fund-loss risk in the entire milestone and must be established with comprehensive tests before any order goes near a live node. Slippage, reserve checks, and Trust Line pre-validation are also Phase 2 concerns because they protect user funds.
**Delivers:** `XrplDexProvider` with swap, limit_order, cancel_order resolving to ContractCallRequest; `OfferBuilder` with `formatXrplAmount` covering all 3 pair combinations; slippage protection via pre-swap book_offers fetch; Trust Line existence pre-validation; owner reserve pre-check for limit_order; Ripple epoch Expiration conversion; `tecKILLED` + partial fill handling with `actualAmountIn`/`actualAmountOut`; daemon-startup registration; `ContractCallRequest.value` set to TakerGets for XRP sells.
**Addresses:** Pitfall 1 (amount format), Pitfall 3 (reserve), Pitfall 4 (partial fill), Pitfall 5 (Trust Line missing), Pitfall 8 (OfferSequence accuracy), Pitfall 11 (expiration epoch)
**Uses:** xrpl@4.6.0 (OfferCreate, OfferCreateFlags, Amount, IssuedCurrencyAmount), existing adapter utilities (xrpToDrops, smallestUnitToIou, parseTrustLineToken)

### Phase 3: Read-Only Queries + Policy + Admin UI
**Rationale:** get_orderbook and get_offers are ApiDirectResult bypasses — structurally independent of pipeline changes and safe to add once the on-chain path is stable. Policy USD fix and Admin UI labels are integration concerns that can be addressed cleanly once the core two phases are stable without risk of breaking already-tested functionality.
**Delivers:** `XrplOrderbookClient` (book_offers + account_offers with bidirectional price labeling); get_orderbook/get_offers actions as ApiDirectResult; `resolveEffectiveAmountUsd()` extended for XRPL DEX TakerGets; `actions.xrpl_dex_enabled` Admin Settings toggle; builtin-metadata registration; MCP auto-exposure verification (mcpExpose: true); Admin UI displayName "XRPL DEX Swap"/"XRPL DEX Limit Order" via ContractNameRegistry.
**Addresses:** Pitfall 6 (USD spending limit bypass), Pitfall 9 (offer quality direction confusion), Pitfall 12 (Admin UI label gap)

### Phase Ordering Rationale

- Adapter-first ordering prevents writing Provider integration tests against a stub that may differ from real behavior; Phase 1 adapter tests also serve as the reference for Phase 2 provider tests.
- On-chain actions before read-only: `formatXrplAmount()` correctness must be established and unit tested before any live order executes — this is the irreversible fund-loss risk and warrants maximum early test coverage.
- Policy and Admin UI in Phase 3: they are purely additive integrations that do not block functional correctness; deferring them prevents their plumbing from masking Phase 1-2 bugs.
- Concurrent development within Phase 2: `OfferBuilder` (amount conversion + flag logic) and `XrplOrderbookClient` (RPC wrapper) can be developed in parallel since they have no dependency on each other; both feed into `XrplDexProvider.resolve()`.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (partial fill AffectedNodes parsing):** The AffectedNodes metadata structure for OfferCreate is complex and the exact field path for `actualAmountIn`/`actualAmountOut` is not documented with worked examples. Plan time for testnet transaction inspection before committing to a parsing implementation.
- **Phase 3 (USD valuation for IOU sells):** `resolveEffectiveAmountUsd()` for IOU TakerGets requires a price oracle lookup. The existing DeFi price oracle (`packages/daemon/src/infrastructure/price/`) covers EVM/Solana tokens; XRPL IOU pair coverage needs verification. A fallback strategy (conservative reject or skip) must be decided during Phase 3 planning.

Phases with standard patterns (skip additional research):
- **Phase 1 (buildContractCall extension):** calldata JSON routing is an established internal pattern (Hyperliquid precedent); the adapter modification is mechanical with a clear implementation sketch already in ARCHITECTURE.md.
- **Phase 3 (ApiDirectResult, Admin Settings, MCP auto-exposure):** All three mechanisms are well-documented in the codebase with multiple existing examples; straightforward application of established patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against installed xrpl@4.6.0 source; all required types (OfferCreate, OfferCancel, BookOffersRequest, AccountOffersRequest, Amount) confirmed to exist at exact import paths |
| Features | HIGH | 5-action scope is well-defined and bounded; anti-features are explicitly deferred (AMM, subscriptions, path-finding) |
| Architecture | HIGH | Based on direct codebase analysis of existing providers, pipeline stage5, and adapter; zero guesswork on integration points; ContractCallRequest schema field set confirmed sufficient |
| Pitfalls | HIGH | XRPL protocol-level pitfalls sourced from official docs; WAIaaS-specific gaps (resolveEffectiveAmountUsd, buildContractCall throw) sourced by reading actual source files |

**Overall confidence:** HIGH

### Gaps to Address

- **AffectedNodes metadata parsing for actual fill amounts:** Research identified the requirement and the general mechanism but did not produce a verified parsing implementation. Plan a testnet inspection spike at the start of Phase 2 for the cancel_order/swap result parsing logic.
- **IOU USD valuation in policy evaluator:** If the DeFi price oracle does not cover XRPL IOU pairs, a fallback design decision is needed during Phase 3 planning: options are (a) skip USD check for IOU sells, (b) conservatively reject IOU sells if no USD price available, or (c) always count XRP-leg amount only.
- **Sequence collision strategy — cache invalidation on reconnect:** The local Sequence counter approach is recommended but requires a clear invalidation policy when the WebSocket client reconnects and the ledger Sequence may have advanced (e.g., from external transactions). This edge case needs a design decision during Phase 1 implementation.

## Sources

### Primary (HIGH confidence)
- `packages/adapters/ripple/node_modules/xrpl/src/models/transactions/offerCreate.ts` — OfferCreate interface + OfferCreateFlags enum (installed source)
- `packages/adapters/ripple/node_modules/xrpl/src/models/transactions/offerCancel.ts` — OfferCancel interface (installed source)
- `packages/adapters/ripple/node_modules/xrpl/src/models/methods/bookOffers.ts` — BookOffersRequest/Response + BookOffer (installed source)
- `packages/adapters/ripple/node_modules/xrpl/src/models/methods/accountOffers.ts` — AccountOffersRequest/Response + AccountOffer (installed source)
- `packages/adapters/ripple/src/adapter.ts` — existing autofill/sign/submit pipeline; buildContractCall() current throw
- `packages/daemon/src/pipeline/stage5-execute.ts` — buildByType() CONTRACT_CALL routing (unchanged)
- `packages/core/src/interfaces/action-provider.types.ts` — IActionProvider, ApiDirectResult, isApiDirectResult()
- `packages/core/src/schemas/transaction.schema.ts` — ContractCallRequestSchema field set confirmed sufficient
- https://xrpl.org/docs/references/protocol/transactions/types/offercreate — OfferCreate spec + flags
- https://xrpl.org/docs/concepts/tokens/decentralized-exchange/offers — DEX offers concept, reserve rules, partial fill behavior
- https://xrpl.org/docs/concepts/accounts/reserves — owner reserve 0.2 XRP per offer object

### Secondary (MEDIUM confidence)
- https://xrpl.org/docs/references/protocol/transactions/types/offercancel — OfferCancel spec
- https://js.xrpl.org/enums/OfferCreateFlags.html — flag hex values
- `packages/actions/src/providers/hyperliquid/perp-provider.ts` — ApiDirectResult + requiresSigningKey pattern (used as contrast to validate NOT using this approach)
- `packages/actions/src/providers/jupiter-swap/index.ts` — ContractCallRequest return pattern (used as reference for Provider structure)
- `packages/daemon/src/infrastructure/action/action-provider-registry.ts` — executeResolve(), ContractCallRequestSchema.parse() re-validation

### Tertiary (LOW confidence)
- https://github.com/XRPLF/rippled/pull/4694 — fixFillOrKill amendment (tecKILLED behavior for IOC zero-fill); confirms behavior but amendment activation date and testnet availability not independently verified

---
*Research completed: 2026-04-03*
*Ready for roadmap: yes*
