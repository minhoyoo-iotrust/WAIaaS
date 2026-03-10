# Project Research Summary

**Project:** WAIaaS v31.9 — Polymarket Prediction Market Integration
**Domain:** DeFi prediction market (CLOB + CTF on-chain settlement, Polygon)
**Researched:** 2026-03-10
**Confidence:** HIGH

## Executive Summary

Polymarket is a prediction market platform running on Polygon mainnet with a hybrid architecture: an off-chain Central Limit Order Book (CLOB) for order matching and on-chain Gnosis Conditional Token Framework (CTF) for settlement. AI agents interact with Polymarket by (1) discovering markets via the public Gamma API, (2) placing signed orders via the authenticated CLOB REST API using EIP-712 + HMAC-SHA256 two-layer auth, and (3) redeeming winning positions via on-chain `redeemPositions()` CTF contract calls. The critical insight is that order execution is off-chain (ApiDirectResult pattern, no gas) while settlement and approval are on-chain (standard CONTRACT_CALL pipeline, Polygon gas required).

The recommended implementation approach requires zero new npm dependencies. WAIaaS already has all the primitives: viem 2.x for EIP-712 signing, native `fetch` for REST clients, Node.js `crypto` for HMAC-SHA256, and the existing ERC-1155 infrastructure for conditional token balance queries. The Hyperliquid integration (v31.4) established the exact same hybrid pattern (off-chain orders + on-chain deposits) and provides a proven implementation template. The primary deviation from Hyperliquid is that Polymarket requires a dual-provider architecture: `PolymarketOrderProvider` (CLOB, ApiDirectResult) and `PolymarketCtfProvider` (on-chain CTF, CONTRACT_CALL), because mixing both return types in a single provider creates unresolvable `requiresSigningKey` semantics.

The dominant risks are all signing-related. Polymarket uses three distinct EIP-712 domains — ClobAuth (API key creation), CTF Exchange (binary market orders), and Neg Risk CTF Exchange (multi-outcome market orders) — that are fundamentally different from Hyperliquid's phantom agent pattern. Conflating these three domains produces valid-but-wrong ECDSA signatures that the CLOB API rejects with opaque "invalid signature" errors, which are extremely hard to debug. Additionally, Polymarket has no public testnet CLOB, so order matching cannot be integration-tested without real mainnet trades ($1-5 scale), requiring a mock-first strategy with mainnet UAT as the final validation gate.

## Key Findings

### Recommended Stack

The entire Polymarket integration uses zero new npm packages. viem 2.x handles all three EIP-712 signing domains natively via `signTypedData`. A custom `PolymarketClobClient` (~200 LOC) using native `fetch` replaces the official `@polymarket/clob-client`, which imports ethers v5 (~1.5MB) and conflicts with WAIaaS's viem-only signing pipeline. The Hyperliquid `ExchangeClient` pattern provides the exact implementation template. DB schema grows by 3 tables across migrations v53-v54: `polymarket_orders`, `polymarket_positions`, `polymarket_api_keys`.

**Core technologies (all existing):**
- **viem 2.x**: EIP-712 signing for ClobAuth + CTF Exchange (binary) + Neg Risk CTF Exchange domains — `signTypedData` handles all three natively without ethers
- **Node.js fetch**: `PolymarketClobClient` REST calls to `clob.polymarket.com`; `PolymarketGammaClient` to `gamma-api.polymarket.com` (no auth required)
- **Node.js crypto**: HMAC-SHA256 for L2 per-request authentication headers on all trading endpoints
- **Drizzle + SQLite**: Three new tables (polymarket_orders, polymarket_positions, polymarket_api_keys), DB migration v53-v54
- **OpenAPIHono 4.x**: 9 new REST query routes under `/v1/wallets/:walletId/polymarket/*` and `/v1/polymarket/*`

**Explicitly rejected packages:** `@polymarket/clob-client` (ethers v5), `@polymarket/order-utils` (ethers v5), `axios`, Gnosis Safe SDK.

### Expected Features

**Must have (table stakes):**
- API Key Management (L1 EIP-712 ClobAuth derivation + L2 HMAC storage + encrypted DB per wallet) — prerequisite for all trading operations
- USDC.e Allowance Setup (one-time `pm_setup` action approves all 5 contract targets in batch)
- Market Discovery (Gamma API search/browse, no auth required, returns condition_id and token_id needed for orders)
- Limit Order GTC — basic buy/sell order placement
- Market Order FOK — immediate fill-or-kill execution
- Order Cancellation — single / batch / cancel-all
- Position Query — Data API `/positions` by wallet address
- Open Orders Query — `getOpenOrders()` with market/asset filter
- Neg Risk flag support — multi-outcome markets (>73% of Polymarket volume) route through different exchange contract

**Should have (differentiators):**
- CTF Redemption (on-chain `redeemPositions()` for Binary + Neg Risk)
- Trade History (paginated `getTrades`)
- Portfolio Value (Data API `/value`)
- PnL Tracking (realized/unrealized from avgPrice + curPrice)
- GTD Orders (expiration timestamp parameter)
- FAK Orders (partial fill market order)
- Batch Orders (up to 15 orders per single API call)
- Post-Only Orders (maker rebate fee optimization)
- Order Book Depth (`getOrderBook` for liquidity analysis)

**Defer (v2+):**
- WebSocket Price Stream — REST polling is sufficient for agent use cases; WebSocket adds stateful connection management complexity
- Multi-Outcome Token Convert (NegRiskAdapter on-chain NO→YES conversion) — high complexity, very low usage frequency
- Merge/Split Positions (CTF advanced collateral operations)
- Smart Account (ERC-4337) wallet compatibility for signatureType=2

### Architecture Approach

The architecture mirrors the Hyperliquid hybrid pattern with one key difference: two separate IActionProvider implementations. `PolymarketOrderProvider` handles all CLOB operations (buy, sell, cancel, update) returning `ApiDirectResult` to bypass on-chain execution. `PolymarketCtfProvider` handles on-chain operations (split, merge, redeem, approve) returning `ContractCallRequest` through the standard 6-stage pipeline on Polygon. Shared infrastructure (ClobClient, RateLimiter, MarketData) is wired via a factory function identical to `createHyperliquidInfrastructure()`. The neg_risk flag from Gamma API is the critical routing signal that must be cached alongside market data and propagated to every signing, approval, and settlement operation.

**Major components:**
1. **PolymarketSigner** — EIP-712 signing for 3 distinct domains (ClobAuth, binary CTF Exchange, neg risk CTF Exchange); HMAC-SHA256 L2 request signing; static method pattern matching HyperliquidSigner
2. **PolymarketClobClient** — REST client with lazy API key creation (encrypted per wallet in DB), per-endpoint-group rate limiting (3 groups: trading / market-data / positions), 30s+ timeouts for Cloudflare throttling
3. **PolymarketMarketData** — Gamma API market/event queries with 30s TTL cache; extracts and caches `neg_risk` flag for downstream routing
4. **PolymarketOrderProvider** — IActionProvider (`requiresSigningKey: true`); actions: pm_buy / pm_sell / pm_cancel_order / pm_cancel_all / pm_update_order; returns ApiDirectResult; contains PolymarketOrderBuilder for price↔makerAmount/takerAmount conversion
5. **PolymarketCtfProvider** — IActionProvider (`requiresSigningKey: false`); actions: pm_split_position / pm_merge_positions / pm_redeem_positions / pm_approve_collateral / pm_approve_ctf; returns ContractCallRequest for Polygon on-chain execution
6. **DB tables v53-v54** — polymarket_orders (order lifecycle with CLOB status sync), polymarket_positions (outcome token holdings + PnL), polymarket_api_keys (encrypted CLOB credentials per wallet address)
7. **Admin UI** — New Polymarket page with 5 tabs (Overview / Markets / Orders / Positions / Settings), 7 Admin Settings keys
8. **MCP + SDK** — 10 auto-registered action tools + 8 manual query tools; SDK PolymarketClient methods

### Critical Pitfalls

1. **EIP-712 domain mismatch (C1 — Critical)** — Polymarket uses 3 distinct EIP-712 domains. ClobAuth has no `verifyingContract`. Binary orders use CTF Exchange (`0x4bFb...`). Neg risk orders use Neg Risk CTF Exchange (`0xC5d5...`). All use real Polygon chainId 137, not a phantom 1337. Never share signing code with HyperliquidSigner. Implement dedicated `PolymarketSigner` with domain selected dynamically from the `isNegRisk` flag. Validate domain hash against py-clob-client test vectors before any CLOB call.

2. **Order struct field semantics (C2 — Critical)** — `salt` is random entropy per order (not a sequence), `nonce` is for on-chain cancellation only (start at 0), `feeRateBps` must be queried from CLOB API and cannot be client-set, and price is expressed as a `makerAmount`/`takerAmount` ratio (not explicit price + size fields). BUY: `makerAmount = price * size * 1e6`, `takerAmount = size * 1e6`. SELL: inverse. Encapsulate all in `PolymarketOrderBuilder`. Use bigint arithmetic throughout.

3. **Neg risk routing completeness (C4 — Critical)** — Neg risk markets require: different EIP-712 `verifyingContract`, different USDC approve targets (3 contracts instead of 1), and different CTF redemption path through NegRiskAdapter. Missing any one causes silent failure for multi-outcome market orders. Prevention: `pm_setup` action approves all 5 contract targets in one batch upfront; exchange contract is derived from `neg_risk` flag on every operation.

4. **API Key generation fragility (M2 — Moderate)** — CLOB API key creation requires server-side timestamp from `/time` endpoint (not local clock). nonce starts at 0 and increments on "already used" conflict. All three values (apiKey + secret + passphrase) plus the nonce must be stored encrypted in DB. Loss of secret or passphrase requires regeneration.

5. **No testnet CLOB (M3 — Moderate)** — Polymarket has no public testnet order matching service. Unit tests must use test vectors from py-clob-client fixtures for EIP-712 signature validation. Integration tests use HTTP mocks. End-to-end validation requires mainnet UAT at $1-5 scale following v31.8's 6-section scenario format.

## Implications for Roadmap

Based on research, the architecture mandates a 5-phase build order driven by strict dependency chains: signing infrastructure must precede orders, orders must precede position tracking, and all logic phases must precede API/UI surface.

### Phase 1: Core Infrastructure
**Rationale:** PolymarketSigner and PolymarketClobClient have no upstream dependencies within this feature. All subsequent phases depend on them. The EIP-712 domain separation bug (C1) must be solved and unit-tested here before any order logic is written — a mistake at this layer poisons all downstream work.
**Delivers:** PolymarketSigner (3 domain types + HMAC-SHA256), PolymarketClobClient (REST + lazy API key creation), PolymarketRateLimiter (3 endpoint groups), contract ABI constants, DB migration v53-v54 (polymarket_orders + polymarket_positions + polymarket_api_keys), `pm_setup` batch-approve action (5 contract targets)
**Addresses:** API Key Management (table stakes), USDC.e Allowance Setup (table stakes)
**Avoids:** C1 (EIP-712 domain mismatch — 3 domains hardcoded and tested before any order placement), C3 (proxy wallet confusion — signatureType=0 EOA hard-pinned from day one)

### Phase 2: CLOB Order Provider
**Rationale:** Depends on Phase 1 infrastructure. Order struct conversion (C2) and neg risk routing (C4) must be solved before CTF on-chain work begins. PolymarketOrderBuilder is the critical deliverable that prevents makerAmount/takerAmount arithmetic errors.
**Delivers:** PolymarketOrderProvider (5 actions: pm_buy / pm_sell / pm_cancel_order / pm_cancel_all / pm_update_order), PolymarketOrderBuilder with tick-size-aware price conversion, Zod input schemas (PmBuySchema, PmSellSchema, etc.), CLOB order status sync, unit tests with py-clob-client test vectors
**Addresses:** Limit Order GTC, Market Order FOK, Order Cancellation, Open Orders Query (all table stakes)
**Avoids:** C2 (order struct semantics — PolymarketOrderBuilder encapsulates all conversions), M1 (USDC 6-decimal tick size precision), M2 (API key nonce management in ClobClient)

### Phase 3: Market Discovery + CTF On-Chain Provider
**Rationale:** PolymarketMarketData (Gamma API) and PolymarketCtfProvider can be developed after Phase 1 is stable, partially in parallel with Phase 2. Market data provides the `neg_risk` flag that both providers need. CTF provider completes the position lifecycle with on-chain settlement.
**Delivers:** PolymarketMarketData (Gamma + CLOB market endpoints, 30s TTL cache, neg_risk flag extraction), PolymarketCtfProvider (5 actions: pm_split_position / pm_merge_positions / pm_redeem_positions / pm_approve_collateral / pm_approve_ctf), integration tests
**Addresses:** Market Discovery, CTF Redemption, Neg Risk flag support (all table stakes)
**Avoids:** C4 (neg risk routing — exchange contract derived from MarketData `neg_risk` flag on every call), M4 (approve target completeness — pm_setup from Phase 1 covers all 5 contracts), N1 (CTF tokens not routed through NFT indexer), N2 (Polygon network hard-check in Provider.validate())

### Phase 4: REST API + MCP + Admin UI + SDK
**Rationale:** All query and action surfaces depend on Phases 1-3 providers being registered. This phase is pure surface area with no novel architecture risk. Standard Hyperliquid v31.4 patterns apply directly.
**Delivers:** 9 REST query routes, 10 MCP action tools (auto-registered via mcpExpose) + 8 manual query tools, Admin UI Polymarket page (5 tabs), 7 Admin Settings keys, SDK PolymarketClient methods
**Addresses:** Trade History, Portfolio Value, Order Book Depth, Category/Tag Browse (all differentiators)
**Avoids:** N3 (ApiDirectResult vs on-chain routing confusion — dual provider architecture enforces separation structurally)

### Phase 5: Position Tracking + PnL + Settlement Monitoring
**Rationale:** Depends on Phase 2 (real order fills needed to validate sync logic), Phase 3 (redemption events), and notification infrastructure from Phase 4. Market resolution lifecycle is the highest-risk operational concern and requires careful state machine implementation against real resolved markets.
**Delivers:** Position sync from CLOB order fills (EventBus listener), PnL calculation (realized + unrealized from avgPrice + curPrice), market resolution state machine (ACTIVE → RESOLVING → DISPUTED → RESOLVED → REDEEMED), owner notifications on resolution, mainnet UAT scenarios (v31.8 6-section format)
**Addresses:** PnL Tracking, Portfolio Value (complete), Resolution Monitoring (differentiators)
**Avoids:** M6 (resolution edge cases — verify on-chain `payoutNumerators` before redeem; never auto-redeem during 48h dispute period)

### Phase Ordering Rationale

- Phases 1 → 2 → 3 are sequentially dependent: signing infrastructure is required before orders, market data is required before CTF operations that reference `neg_risk` flag
- Phase 3 Market Data component can start after Phase 1 is complete, allowing partial parallelism with Phase 2
- Phase 4 (surface area) depends on all providers being registered in ActionProviderRegistry; no novel technical risk, straightforward pattern application
- Phase 5 (position lifecycle) is deferred because it requires real order fills to validate sync correctness, and the dispute monitoring logic needs verified on-chain state machine behavior
- The Hyperliquid v31.4 build order (infra → exchange provider → on-chain provider → API/UI → monitoring) maps almost directly

### Research Flags

Phases needing deeper research during planning:
- **Phase 2:** CLOB order matching behavior for FOK/FAK at various liquidity conditions needs empirical verification; partial fill semantics for FAK on thin books are not fully documented
- **Phase 5:** UMA Oracle resolution timeline variability and on-chain `payoutNumerators` query pattern are MEDIUM confidence; needs verification against at least one live resolved market before implementing auto-redeem logic

Phases with standard patterns (skip research):
- **Phase 1:** EIP-712 signing pattern is structurally identical to HyperliquidSigner; contract ABIs are minimal and verified from contract source; DB migration pattern is established (v52 → v53 → v54)
- **Phase 4:** REST routes, MCP registration, Admin UI tab structure, and SDK client all follow Hyperliquid v31.4 exactly; no architectural novelty

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies confirmed; all capabilities verified in current WAIaaS stack; Hyperliquid precedent proven in production |
| Features | HIGH | Official Polymarket docs verified; order types, endpoints, and auth flow confirmed via py-clob-client source; Data API endpoints MEDIUM (schema detail unverified) |
| Architecture | HIGH | Hyperliquid v31.4 provides working precedent for hybrid off-chain/on-chain pattern; dual-provider split is unambiguous from return-type incompatibility |
| Pitfalls | HIGH | C1-C4 all verified from contract source code (OrderStructs.sol, Hashing.sol) + official docs + open-source client issues; M3 no-testnet confirmed in official docs |

**Overall confidence:** HIGH

### Gaps to Address

- **EOA signatureType=0 CLOB acceptance**: Polymarket documentation confirms EOA is a valid signatureType, but their web flow is proxy-wallet-centric. If the CLOB API rejects pure EOA-signed orders without a deployed proxy wallet, CREATE2 proxy derivation must be added to Phase 1. Budget 1-2 days contingency. Validate on first mainnet smoke test.
- **CLOB rate limit real-world values**: Documented limits (3,500 orders/10s burst) may be lower for new API keys without established track records. `PolymarketRateLimiter` should default to 10% of documented limits and allow Admin Settings override.
- **Data API response schema**: positions/value/activity endpoints confirmed to exist but full field names and types were not verified from contract source. Build Zod schemas with `.passthrough()` initially, tighten after first mainnet call.
- **Smart Account (ERC-4337) wallet compatibility**: signatureType=2 (GNOSIS_SAFE) may or may not map to ERC-4337. Out of scope for v31.9; flag for research if Smart Account wallet users request Polymarket access.

## Sources

### Primary (HIGH confidence)
- [Polymarket CLOB Introduction](https://docs.polymarket.com/developers/CLOB/introduction)
- [Polymarket Authentication Docs](https://docs.polymarket.com/developers/CLOB/authentication)
- [Polymarket Contract Addresses](https://docs.polymarket.com/resources/contract-addresses)
- [Polymarket CTF Overview](https://docs.polymarket.com/trading/ctf/overview)
- [Polymarket Orders Overview](https://docs.polymarket.com/developers/CLOB/orders/orders)
- [Polymarket L2 Client Methods](https://docs.polymarket.com/developers/CLOB/clients/methods-l2)
- [Polymarket Neg Risk Docs](https://docs.polymarket.com/advanced/neg-risk)
- [Polymarket Gamma API](https://docs.polymarket.com/developers/gamma-markets-api/overview)
- [Polymarket API Rate Limits](https://docs.polymarket.com/quickstart/introduction/rate-limits)
- [Polymarket CTF Redemption](https://docs.polymarket.com/developers/CTF/redeem)
- [CTF Exchange OrderStructs.sol](https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/libraries/OrderStructs.sol)
- [CTF Exchange Hashing.sol](https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/mixins/Hashing.sol)
- [NegRiskAdapter source](https://github.com/Polymarket/neg-risk-ctf-adapter)
- [py-clob-client source](https://github.com/Polymarket/py-clob-client)
- [clob-client TypeScript reference](https://github.com/Polymarket/clob-client)
- [NegRiskAdapter ChainSecurity Audit](https://www.chainsecurity.com/security-audit/polymarket-negriskadapter)
- [CLOB Allowance Setting Gist](https://gist.github.com/poly-rodr/44313920481de58d5a3f6d1f8226bd5e)

### Secondary (MEDIUM confidence)
- [Polymarket Order Signing Clojure Gist](https://gist.github.com/shaunlebron/7463f0003aa906ffe6f31dc18c408f73) — complete EIP-712 domain/struct spec, cross-verified with contract source
- [Polymarket Data API Positions](https://docs.polymarket.com/developers/misc-endpoints/data-api-get-positions) — endpoint confirmed, full response schema details unverified
- [Polymarket Data API Value](https://docs.polymarket.com/developers/misc-endpoints/data-api-value) — endpoint confirmed
- [Polymarket Proxy Wallet Docs](https://docs.polymarket.com/developers/proxy-wallet) — EOA direct API behavior sparse, proxy-wallet-centric documentation
- [py-clob-client Issue #121](https://github.com/Polymarket/py-clob-client/issues/121) — FOK decimal precision bug and fix
- [py-clob-client Issue #187](https://github.com/Polymarket/py-clob-client/issues/187) — 401 Unauthorized patterns and API key nonce management
- [py-clob-client Issue #138](https://github.com/Polymarket/py-clob-client/issues/138) — Neg Risk market resolution behavior
- [UMA Oracle manipulation 2025](https://orochi.network/blog/oracle-manipulation-in-polymarket-2025) — resolution edge case context

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
