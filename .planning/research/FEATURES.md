# Feature Landscape: Price Oracle + Action Provider Framework

**Domain:** Self-hosted AI agent wallet daemon -- USD-based spending limits, price oracle (Pyth Hermes + CoinGecko fallback), DeFi action provider plugin framework, API key management
**Researched:** 2026-02-15
**Overall Confidence:** HIGH (primary sources: Pyth/CoinGecko official docs, Coinbase AgentKit architecture, existing codebase analysis)

---

## Table Stakes

Features users expect when a wallet service evaluates spending limits in USD and supports DeFi protocol plugins. Missing = product feels incomplete or insecure.

| # | Feature | Why Expected | Complexity | Depends On |
|---|---------|--------------|------------|------------|
| TS-01 | **IPriceOracle interface (4 methods)** | Standard abstraction for price sources. getPrice/getPrices/getNativePrice/getCacheStats. Every oracle-backed system (Aave, Compound, dYdX) abstracts behind a unified price interface. Without this, oracle implementations leak into policy evaluation code. | Med | @waiaas/core types |
| TS-02 | **PythOracle (Primary, Zero-config)** | Pyth Hermes is the leading cross-chain oracle with 380+ feeds, no API key required, sub-second updates. The public endpoint `https://hermes.pyth.network/v2/updates/price/latest` is rate-limited at 30 req/10s per IP, sufficient for a single-user daemon. Zero-config means USD policy evaluation works immediately after installation. | High | IPriceOracle interface, Pyth feed ID mapping strategy, HTTP client |
| TS-03 | **CoinGeckoOracle (Opt-in Fallback)** | CoinGecko covers 24M+ tokens across 250+ networks vs Pyth's 380+ feeds. Essential for long-tail tokens that Pyth doesn't list. Demo API key (free, 30 req/min, 10K/month) is opt-in to maintain zero-config default. `/simple/token_price/{platform_id}` endpoint supports batch queries by contract address. | Med | IPriceOracle interface, platformId mapping, Demo API key |
| TS-04 | **OracleChain (Pyth->CoinGecko fallback)** | Multi-source fallback is an industry standard for price oracles (Chainlink + TWAP is the DeFi norm). Single-source failure must not break spending limits. Pyth primary, CoinGecko fallback when Pyth fails or returns stale data. Cross-validation when both sources available. | Med | PythOracle, CoinGeckoOracle |
| TS-05 | **InMemoryPriceCache (5min TTL, LRU 128)** | Direct API calls per transaction would exhaust rate limits instantly (Pyth: 30/10s, CoinGecko Demo: 30/min). Caching is a fundamental requirement stated in design doc principle #1: "no external API call without cache". LRU with 128 items covers most active token portfolios. | Med | Map-based LRU implementation |
| TS-06 | **Price age classification (FRESH/AGING/STALE)** | 3-tier staleness model prevents the system from using dangerously old prices. FRESH (<5min) = normal. AGING (5-30min) = warn but proceed. STALE (>30min) = skip USD evaluation, fall back to native amounts. This is the "conservative judgment principle" from design doc 61. | Low | InMemoryPriceCache |
| TS-07 | **resolveEffectiveAmountUsd() for all 5 types** | The core function that converts any TransactionType's amount to USD. Currently TOKEN_TRANSFER defaults to 0n (NOTIFY fixed tier), CONTRACT_CALL uses only native value, BATCH sums only native -- all incomplete. This function resolves the Phase 22-23 debt where USD evaluation was deferred. | High | IPriceOracle, PipelineInput parsing, PriceResult discriminated union |
| TS-08 | **SpendingLimitRuleSchema Zod + USD fields** | Currently `SPENDING_LIMIT` rules use `z.record(z.unknown())` (unvalidated). Zod SSoT principle requires proper schema. New fields: `instant_max_usd`, `notify_max_usd`, `delay_max_usd` alongside existing native amount fields. Dual evaluation: USD thresholds take precedence when price available, native thresholds as fallback. | Med | Zod schema definition, DatabasePolicyEngine modification |
| TS-09 | **IActionProvider interface** | The resolve-then-execute pattern: provider returns `ContractCallRequest`, never signs or submits. This is the security boundary -- all DeFi actions flow through the existing 6-stage pipeline including policy evaluation. Coinbase AgentKit uses the same pattern (action providers return results, not execute transactions). | Med | @waiaas/core types, ContractCallRequest (exists) |
| TS-10 | **ActionProviderRegistry (plugin discovery/load)** | ESM dynamic import from `~/.waiaas/actions/` directory. Node.js 22 native ESM support. validate-then-trust: verify IActionProvider interface compliance + Zod-validate resolve() return values. Name uniqueness enforced. register/unregister/getProvider/listProviders API. | High | ESM dynamic import(), IActionProvider interface, file system scan |
| TS-11 | **REST API: POST /v1/actions/:provider/:action** | The HTTP entry point for action execution. Routes to ActionProviderRegistry.getProvider(provider).resolve(action, params, context), then feeds result into existing pipeline as CONTRACT_CALL. sessionAuth protected. | Med | ActionProviderRegistry, Pipeline (exists) |
| TS-12 | **ActionProviderApiKeyStore (DB encrypted)** | External DeFi APIs (0x, Jupiter Ultra) require API keys. Keys stored encrypted in DB using existing HKDF-derived AES-256-GCM pattern (same as SettingsService credentials). CRUD via admin API. Keys masked in responses (first 4 chars only). | Med | settings-crypto.ts (exists), DB migration v11 |
| TS-13 | **GET /v1/admin/oracle-status** | Health check endpoint showing oracle cache stats (hits/misses/staleHits/size/evictions), source availability (Pyth: up/down, CoinGecko: enabled/disabled), and sample prices for native tokens. Essential for operational monitoring. masterAuth. | Low | IPriceOracle.getCacheStats(), OracleChain state |

## Differentiators

Features that set WAIaaS apart. Not expected, but create significant value.

| # | Feature | Value Proposition | Complexity | Depends On |
|---|---------|-------------------|------------|------------|
| DF-01 | **Cross-validation inline (>5% deviation = STALE)** | When both Pyth and CoinGecko return prices, compare them. If deviation exceeds 5%, demote to STALE + log PRICE_DEVIATION_WARNING. Detects oracle manipulation or stale data. Only active when CoinGecko key is configured. This goes beyond simple fallback -- it's a trust-but-verify model. | Low | OracleChain, both oracles returning prices |
| DF-02 | **PriceResult discriminated union (success/oracleDown/notListed)** | Three-state result distinguishes temporary oracle failure (graceful degradation) from permanent "token not tracked by any oracle" (escalate to NOTIFY minimum). Prevents the dangerous "$0 = free" bypass where unknown tokens circumvent USD limits. "Value unknown != value zero" is the security principle. | Med | resolveEffectiveAmountUsd(), policy evaluation logic |
| DF-03 | **Unlisted token CoinGecko hint (one-time per token)** | When a token is not listed and CoinGecko key is not configured, the first notification for that token includes "CoinGecko API key in Admin > Settings > Oracle can expand token coverage." Subsequent occurrences for the same token omit the hint (spam prevention). Already-configured CoinGecko: no hint at all. | Low | NotificationService (exists), token-level dedup Set |
| DF-04 | **ActionDefinition -> MCP Tool auto-mapping** | Each registered action provider's actions are automatically exposed as MCP tools via zodToJsonSchema conversion. Tool naming: `waiaas_{providerName}_{actionName}`. mcpExpose flag controls visibility. Dynamic registration/deregistration follows provider lifecycle. AI agents discover DeFi actions without manual MCP tool coding. | High | ActionProviderRegistry, MCP server.tool() dynamic registration, zodToJsonSchema |
| DF-05 | **Admin API Keys UI section** | Admin > Settings > API Keys: per-provider key input/edit/delete forms. Masked display (first 4 chars). Warning badge for providers that need keys but don't have them configured. Visual feedback for operators managing DeFi integrations. | Med | Admin Web UI (exists), API key store endpoints |
| DF-06 | **Oracle configurable thresholds via Admin Settings** | Cross-validation deviation threshold (default 5%), cache TTL, STALE age cutoff -- all configurable via SettingsService hot-reload. Operational tuning without daemon restart. Low-liquidity tokens may need wider deviation thresholds. | Low | SettingsService (exists), new setting keys |

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Chainlink Oracle implementation** | EVM-only (no Solana support), requires maintaining Aggregator address mapping tables per chain, significant implementation complexity for marginal coverage gain. Pyth already covers 380+ feeds cross-chain. Design doc 61 originally included Chainlink but v1.5 objective explicitly removes it. | Use Pyth (cross-chain, zero-config) + CoinGecko (token coverage). If Chainlink is needed later, IPriceOracle interface allows adding it as a 3rd implementation. |
| **On-chain oracle calls** | On-chain price reads (Chainlink Aggregator, Pyth on-chain accounts) add gas costs, chain-specific complexity, and RPC call overhead. Hermes HTTP API provides the same Pyth data without on-chain interaction. | Use off-chain HTTP APIs exclusively. Hermes serves the same Pyth price data via REST. |
| **Real-time price streaming (WebSocket/SSE)** | Pyth Hermes SSE streaming (`/v2/updates/price/stream`) provides sub-second updates, but WAIaaS evaluates prices only at transaction time, not continuously. Streaming wastes resources and adds connection management complexity. | Fetch on-demand with 5min TTL cache. The cache is the "stream" for WAIaaS's use case. |
| **Concrete DeFi protocol providers (Jupiter, 0x, Lido)** | v1.5 builds the framework only. Concrete protocol implementations have their own API complexities, testing requirements, and maintenance burdens. v1.5 objective explicitly states "framework only, protocols in v1.5.5+". | Build IActionProvider framework + test provider. Ship concrete Jupiter/0x/Lido providers in v1.5.5 and beyond. |
| **Plugin sandboxing (VM isolation)** | Full VM sandboxing (vm2, isolated-vm, Worker threads) adds massive complexity. ESM plugins run in the same process as the daemon. Since plugins are installed by the Owner into `~/.waiaas/actions/`, the trust boundary is "Owner installs trusted code." | validate-then-trust: verify interface compliance + Zod-validate all resolve() outputs. Document that plugins run with daemon privileges. Consider VM isolation in a future milestone (flagged as MEDIUM M2 risk). |
| **Historical price data / price charts** | WAIaaS needs current prices for spending limit evaluation, not historical OHLCV data. Historical price APIs have different rate limits and costs. | Store only current cached prices. If historical analysis is needed later, it's a separate feature. |
| **Per-token oracle configuration** | Allowing users to specify which oracle to use per token adds UI complexity and configuration burden. The OracleChain fallback handles this automatically. | Automatic fallback chain: Pyth first, CoinGecko second. The chain handles all tokens without per-token config. |
| **Stablecoin special pricing ($1.00 hardcoded)** | Tempting to hardcode USDC/USDT/DAI at $1.00 to avoid oracle calls, but stablecoins can depeg (UST crash, USDC Silicon Valley Bank depeg). | Treat stablecoins like any other token: fetch real prices from oracle. Cache means this costs almost nothing extra. |
| **API key rotation / expiry management** | Automatic key rotation adds complexity without clear benefit for a self-hosted single-user daemon. External APIs (CoinGecko, 0x) don't enforce rotation. | Manual key management via Admin UI. Owner updates keys when needed. |

## Feature Dependencies

```
IPriceOracle Interface (TS-01)
  |
  +--> PythOracle (TS-02)
  |     |
  |     +--> Feed ID mapping strategy (research: /v2/price_feeds metadata API
  |           vs hardcoded map vs symbol-based search)
  |
  +--> CoinGeckoOracle (TS-03)
  |     |
  |     +--> platformId mapping (solana, ethereum, polygon-pos, etc.)
  |     |
  |     +--> API key from ApiKeyStore (TS-12) or SettingsService
  |
  +--> InMemoryPriceCache (TS-05) -- both oracles write to cache
  |     |
  |     +--> Price age classification (TS-06) -- reads cache timestamps
  |
  +--> OracleChain (TS-04) -- composes PythOracle + CoinGeckoOracle
        |
        +--> Cross-validation (DF-01) -- needs both sources
        |
        +--> resolveEffectiveAmountUsd (TS-07) -- uses OracleChain
              |
              +--> PriceResult discriminated union (DF-02)
              |
              +--> SpendingLimitRuleSchema USD fields (TS-08)
              |     |
              |     +--> DatabasePolicyEngine modification
              |
              +--> Unlisted token hint (DF-03) -- on notListed result

IActionProvider Interface (TS-09)
  |
  +--> ActionProviderRegistry (TS-10)
  |     |
  |     +--> ESM dynamic import from ~/.waiaas/actions/
  |     |
  |     +--> MCP Tool auto-mapping (DF-04) -- reads actions from registry
  |     |
  |     +--> REST API endpoint (TS-11) -- looks up provider from registry
  |
  +--> ActionProviderApiKeyStore (TS-12) -- independent but enables providers
  |     |
  |     +--> DB migration v11 (api_keys table)
  |     |
  |     +--> Admin API Keys UI (DF-05) -- CRUD for keys
  |
  +--> Oracle status endpoint (TS-13) -- independent monitoring

Oracle Settings (DF-06) -- independent, extends SettingsService
```

## Detailed Feature Specifications

### TS-01: IPriceOracle Interface

**Location:** `packages/core/src/interfaces/price-oracle.types.ts`

**Interface:**
```typescript
interface IPriceOracle {
  getPrice(token: TokenRef): Promise<PriceInfo>;
  getPrices(tokens: TokenRef[]): Promise<Map<string, PriceInfo>>;
  getNativePrice(chain: ChainType): Promise<PriceInfo>;
  getCacheStats(): CacheStats;
}
```

**Key types:**
- `TokenRef`: { address, symbol?, decimals, chain } -- minimal reference for price lookup
- `PriceInfo`: { usdPrice, confidence?, source, fetchedAt, expiresAt, isStale } -- single price result
- `CacheStats`: { hits, misses, staleHits, size, evictions } -- operational monitoring

Design doc 61 specifies these 4 methods as the complete oracle interface. The interface is chain-agnostic -- implementations handle chain-specific details.

### TS-02: PythOracle (Pyth Hermes REST API)

**Endpoint:** `GET https://hermes.pyth.network/v2/updates/price/latest?ids[]={feedId}`

**Rate limits (verified, HIGH confidence):**
- 30 requests per 10 seconds per IP address
- Exceeding triggers 429 response for subsequent 60-second cooldown period
- TradingView endpoint exception: 90 req/10s (not relevant for WAIaaS)

**Response format:**
```json
{
  "parsed": [{
    "id": "ff61491a...",
    "price": { "price": "234567", "conf": "123", "expo": -5, "publish_time": 1234567890 },
    "ema_price": { "price": "234500", "conf": "100", "expo": -5, "publish_time": 1234567890 }
  }]
}
```

Price calculation: `usdPrice = price * 10^expo` (e.g., 234567 * 10^-5 = $2.34567)

**Feed ID mapping strategy (phase research needed):**
Three approaches to map TokenRef.address to Pyth feedId (bytes32 hex):
1. **Hardcoded map** -- Map ~30 major tokens (SOL, ETH, BTC, USDC, USDT, etc.) to their feed IDs. Simple, fast, covers 90%+ of transaction volume. Low maintenance for a curated list.
2. **Hermes `/v2/price_feeds` metadata API** -- Query at startup to build dynamic mapping. Supports filtering by asset_type and symbol. More comprehensive but adds startup latency and complexity.
3. **Symbol-based search** -- Use TokenRef.symbol to search Pyth metadata API. Fragile (symbol collisions, e.g., multiple "USDC" across chains).

**Recommendation:** Hardcoded map for major tokens (covers SOL/ETH/BTC/USDC/USDT/WBTC/WETH/DAI/LINK/UNI/MATIC/AVAX/ARB/OP) + CoinGecko fallback for everything else. The hardcoded map is the most reliable and fastest approach. Phase planning should finalize the exact list.

**Production note:** Pyth "strongly encourages" using third-party providers (Triton, P2P, extrnode, Liquify) for production. The public endpoint is for testing/development. However, for a self-hosted single-user daemon, the public endpoint's 30 req/10s is adequate with caching.

### TS-03: CoinGeckoOracle

**Endpoint:** `GET https://pro-api.coingecko.com/api/v3/simple/token_price/{platform_id}`

**Parameters:**
- `platform_id`: Asset platform string (e.g., `ethereum`, `solana`, `polygon-pos`)
- `contract_addresses`: Comma-separated token addresses (batch support)
- `vs_currencies`: `usd`
- `include_last_updated_at`: `true` (for cache freshness)

**Authentication:** `x-cg-demo-api-key` header (Demo plan) or `x-cg-pro-api-key` (Pro plan)

**Rate limits (verified, HIGH confidence):**
- Demo plan: 30 calls/minute, 10,000 calls/month
- Pro plan: 500-1,000 calls/minute depending on tier
- Rate limit applies per API key per IP address
- 429 error on limit breach

**Platform ID mapping (verified, HIGH confidence):**
| Chain | CoinGecko platform_id |
|-------|----------------------|
| Ethereum | `ethereum` |
| Solana | `solana` |
| Polygon | `polygon-pos` |
| Arbitrum | `arbitrum-one` |
| BSC | `binance-smart-chain` |
| Optimism | `optimistic-ethereum` |
| Base | `base` |
| Avalanche | `avalanche` |

**Batch optimization:** `getPrices()` implementation should group tokens by platform_id and make one request per platform with comma-separated addresses. This minimizes API calls for multi-token portfolios.

**Native token pricing:** For native tokens (SOL, ETH), use `/simple/price?ids=solana,ethereum&vs_currencies=usd` (coin ID, not contract address).

### TS-07: resolveEffectiveAmountUsd()

**Function signature:**
```typescript
async function resolveEffectiveAmountUsd(
  input: PipelineInput,
  priceOracle: IPriceOracle,
): Promise<PriceResult>
```

**Per-type evaluation:**
| Transaction Type | Amount Source | USD Calculation |
|-----------------|-------------|-----------------|
| TRANSFER | request.amount (native) | amount * nativeUsdPrice |
| TOKEN_TRANSFER | request.amount (token units) | amount * tokenUsdPrice |
| CONTRACT_CALL | request.value (native, optional) | value * nativeUsdPrice |
| APPROVE | request.amount (token units) | amount * tokenUsdPrice |
| BATCH | Sum of all instructions | Per-instruction calculation, summed |

**PriceResult discriminated union:**
```typescript
type PriceResult =
  | { type: 'success'; usdAmount: number }     // Normal USD evaluation
  | { type: 'oracleDown' }                      // Temporary failure -> native fallback
  | { type: 'notListed'; tokenAddress: string }  // Token not tracked -> min NOTIFY
```

**Integration point:** Called within Stage 3 (policy evaluation), before SPENDING_LIMIT comparison. If PriceResult is `success`, compare against USD thresholds. If `oracleDown`, compare against native thresholds only. If `notListed`, escalate to at least NOTIFY tier.

### TS-08: SpendingLimitRuleSchema + USD Fields

**Current state (broken):** `rules: z.record(z.unknown())` -- no validation for SPENDING_LIMIT rules.

**New Zod schema:**
```typescript
const SpendingLimitRulesSchema = z.object({
  // Existing native amount thresholds (smallest unit: lamports/wei)
  instant_max: z.string().regex(/^\d+$/),
  notify_max: z.string().regex(/^\d+$/),
  delay_max: z.string().regex(/^\d+$/),
  delay_seconds: z.number().int().positive(),
  // NEW: USD thresholds (optional, takes precedence when price available)
  instant_max_usd: z.number().positive().optional(),
  notify_max_usd: z.number().positive().optional(),
  delay_max_usd: z.number().positive().optional(),
});
```

**Dual evaluation logic:**
1. If USD price available AND USD thresholds configured: evaluate against USD thresholds
2. If USD price unavailable OR USD thresholds not configured: evaluate against native thresholds (existing behavior)
3. Take the **higher** (more conservative) tier from whichever evaluation path applies

**Backward compatibility:** Existing SPENDING_LIMIT policies without USD fields continue to work unchanged. USD fields are optional additions.

### TS-09: IActionProvider Interface

**Interface (from design doc 62):**
```typescript
interface IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: ActionDefinition[];
  resolve(actionName: string, params: unknown, context: ActionContext): Promise<ContractCallRequest>;
}
```

**Key types:**
- `ActionProviderMetadata`: { name, displayName, version, chains, mcpExpose, requiresApiKey }
- `ActionDefinition`: { name, description, inputSchema (Zod), chain, riskLevel, defaultTier }
- `ActionContext`: { walletId, chain, walletAddress, network }

**Security boundary:** resolve() MUST return ContractCallRequest, never signed transactions. Zod validation on every resolve() output ensures compliance. This is the "resolve-then-execute" pattern from design doc 62.

**Coinbase AgentKit comparison:** AgentKit uses `@CreateAction` decorators with Zod schemas and returns strings. WAIaaS uses interface-based composition (no decorators) returning typed ContractCallRequest objects that flow through the policy pipeline. The WAIaaS pattern is more structured because every action MUST go through policy evaluation.

### TS-10: ActionProviderRegistry

**Plugin discovery flow:**
1. Scan `~/.waiaas/actions/` directory for `.mjs` files or directories with `package.json` (type=module)
2. ESM `import()` each discovered module
3. Validate: module exports `default` that satisfies IActionProvider shape
4. Verify: metadata schema validates, actions array is non-empty, each action has valid inputSchema
5. Register: add to internal Map<string, IActionProvider>, reject name duplicates

**Dynamic import security:**
```typescript
const module = await import(filePath);  // Node.js 22 native ESM
const provider = module.default;
// Validate shape: metadata, actions, resolve must exist
ActionProviderMetadataSchema.parse(provider.metadata);
// Each action's inputSchema must be a Zod schema
for (const action of provider.actions) {
  ActionDefinitionSchema.parse(action);
}
```

No sandboxing -- plugins run in daemon process. Owner trust boundary.

### TS-12: ActionProviderApiKeyStore

**DB schema (migration v11):**
```sql
CREATE TABLE api_keys (
  provider_name TEXT PRIMARY KEY,
  encrypted_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Encryption:** Same pattern as settings-crypto.ts: HKDF(SHA-256) from master password, AES-256-GCM encrypt/decrypt. Reuse `encryptSettingValue`/`decryptSettingValue` or extract shared crypto utility.

**API endpoints:**
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /v1/admin/api-keys | masterAuth | List all providers + key status (masked) |
| PUT | /v1/admin/api-keys/:provider | masterAuth | Set/update encrypted key |
| DELETE | /v1/admin/api-keys/:provider | masterAuth | Remove key, disable provider |

**Masking:** Response shows `{ provider: "coingecko", maskedKey: "CG-x...xxxx", hasKey: true }`. First 4 chars + ellipsis. If no key, `{ hasKey: false }`.

**Relationship to CoinGecko key:** The CoinGecko API key can be stored EITHER in SettingsService (oracle.coingecko_api_key) OR in ApiKeyStore (provider: "coingecko"). The v1.5 objective indicates Admin Settings > Oracle for CoinGecko key, suggesting SettingsService is the primary store. ApiKeyStore is for action provider-specific keys (0x, Jupiter, etc.). Phase planning should clarify this distinction to avoid dual-storage confusion.

### DF-04: ActionDefinition -> MCP Tool Auto-Mapping

**Conversion process:**
1. For each registered provider where `metadata.mcpExpose === true`:
2. For each action in `provider.actions`:
3. Convert action.inputSchema (Zod) to JSON Schema via `zodToJsonSchema()`
4. Register MCP tool: `server.tool(toolName, jsonSchema, handler)`
5. Tool name format: `waiaas_{providerName}_{actionName}` (e.g., `waiaas_jupiter_swap`)

**Dynamic lifecycle:**
- Provider registered -> MCP tools added
- Provider unregistered -> MCP tools removed
- Requires MCP server tool API to support dynamic add/remove after initial registration

**Existing 14 tools are always present.** Action tools are additive. No MCP tool count limit (v1.5 explicitly removes the 16-tool cap from design doc 62/38).

---

## MVP Recommendation

### Phase 1: Oracle Core (highest priority -- enables USD policy evaluation)

Prioritize:
1. **TS-01** IPriceOracle interface + TokenRef/PriceInfo types -- foundation
2. **TS-05** InMemoryPriceCache (LRU 128, 5min TTL) -- required before any oracle
3. **TS-06** Price age classification -- required for cache reads
4. **TS-02** PythOracle implementation -- primary source
5. **TS-03** CoinGeckoOracle implementation -- fallback source
6. **TS-04** OracleChain (Pyth->CoinGecko + cross-validation) -- composites the sources

Rationale: Without the oracle infrastructure, USD policy evaluation cannot function. This phase delivers the price data layer.

### Phase 2: USD Policy Integration (resolves Phase 22-23 debt)

7. **TS-08** SpendingLimitRuleSchema Zod + USD fields -- schema before evaluation
8. **TS-07** resolveEffectiveAmountUsd() -- the core USD conversion
9. **DF-02** PriceResult discriminated union -- 3-state result handling
10. **DF-01** Cross-validation inline -- trust-but-verify
11. **DF-03** Unlisted token hint -- UX for missing coverage
12. **TS-13** Oracle status endpoint -- operational monitoring

Rationale: This phase integrates oracle into the policy engine, completing the USD spending limit feature end-to-end.

### Phase 3: Action Provider Framework (independent from oracle)

13. **TS-09** IActionProvider interface + types -- framework foundation
14. **TS-10** ActionProviderRegistry + ESM plugin loading -- core mechanism
15. **TS-11** REST API endpoint -- HTTP entry point
16. **TS-12** ApiKeyStore + DB migration v11 -- key management
17. **DF-05** Admin API Keys UI -- operator interface

Rationale: The action provider framework is self-contained and independent of oracle work. Can be developed in parallel or sequentially.

### Phase 4: MCP Integration (depends on Phase 3)

18. **DF-04** MCP Tool auto-mapping -- dynamic tool registration from action providers
19. **DF-06** Oracle configurable thresholds -- operational tuning

Rationale: MCP integration requires registered action providers (Phase 3). Oracle settings are non-critical and can be added last.

### Defer to v1.5.5+

- **Concrete DeFi protocol providers** (Jupiter Swap, 0x Swap, Lido Staking) -- each is a separate implementation milestone with its own API complexity
- **Plugin sandboxing / VM isolation** -- flagged as MEDIUM M2 risk, revisit when community plugin ecosystem emerges
- **Historical price tracking** -- not needed for spending limit evaluation
- **Per-token oracle configuration** -- automatic fallback chain handles this

---

## Complexity Assessment

| Feature | Backend | Frontend (Admin) | Tests | Total |
|---------|---------|-------------------|-------|-------|
| TS-01 IPriceOracle interface | Low (types only) | None | Low (type tests) | **Low** |
| TS-02 PythOracle | High (HTTP client, feed ID mapping, price parsing) | None | High (API mock, feed ID tests, rate limit tests) | **High** |
| TS-03 CoinGeckoOracle | Med (HTTP client, platformId mapping, batch) | None | Med (API mock, batch tests) | **Med** |
| TS-04 OracleChain | Med (fallback logic, cross-validation) | None | High (failure combos, deviation tests) | **Med** |
| TS-05 InMemoryPriceCache | Med (LRU from scratch, Map+linked list) | None | Med (eviction, TTL, concurrency) | **Med** |
| TS-06 Price age classification | Low (timestamp comparison) | None | Low (boundary tests) | **Low** |
| TS-07 resolveEffectiveAmountUsd | High (5 type paths, PriceResult handling) | None | High (per-type USD evaluation) | **High** |
| TS-08 SpendingLimitRuleSchema | Med (Zod schema + engine modification) | Low (optional USD fields in policy form) | Med (dual evaluation, backward compat) | **Med** |
| TS-09 IActionProvider interface | Low (types + Zod schemas) | None | Low (schema validation) | **Low** |
| TS-10 ActionProviderRegistry | High (ESM import, validation, lifecycle) | None | High (plugin load/unload, validation, errors) | **High** |
| TS-11 REST API actions endpoint | Med (route + pipeline integration) | None | Med (e2e provider->pipeline) | **Med** |
| TS-12 ApiKeyStore | Med (DB migration, crypto, CRUD) | Med (key management UI section) | Med (encrypt/decrypt, CRUD tests) | **Med** |
| TS-13 Oracle status endpoint | Low (aggregation endpoint) | Low (status display) | Low (response format) | **Low** |
| DF-01 Cross-validation | Low (deviation calc in OracleChain) | None | Med (deviation edge cases) | **Low** |
| DF-02 PriceResult union | Med (3-state handling in policy) | None | Med (per-state behavior tests) | **Med** |
| DF-03 Unlisted token hint | Low (one-time hint logic) | None | Low (dedup tests) | **Low** |
| DF-04 MCP Tool auto-mapping | High (dynamic tool reg, zodToJsonSchema) | None | High (dynamic add/remove, schema conversion) | **High** |
| DF-05 Admin API Keys UI | None | Med (new settings section) | Low (UI tests) | **Med** |
| DF-06 Oracle settings | Low (new setting keys) | Low (settings UI fields) | Low | **Low** |

**Estimated total:** ~2,500-3,500 LOC production, ~1,500-2,000 LOC tests

---

## Existing Feature Compatibility Matrix

| Existing Feature | Impact | Change Level |
|-----------------|--------|-------------|
| `POST /v1/transactions/send` (5-type) | resolveEffectiveAmountUsd injected before SPENDING_LIMIT eval in Stage 3 | **Enhancement** (internal logic, API unchanged) |
| `DatabasePolicyEngine` (11 policy types) | SPENDING_LIMIT evaluation uses USD amount when available; no new PolicyType added | **Enhancement** (internal logic) |
| `SpendingLimitRules` TypeScript interface | Replaced by Zod schema (SpendingLimitRulesSchema). Existing rules still valid (USD fields optional). | **Enhancement** (backward compatible) |
| `SettingsService` (31 keys) | +3-5 new setting keys (oracle thresholds, CoinGecko key, tool priority) | **Additive** |
| `Pipeline 6-stage` | POST /v1/actions/:provider/:action feeds ContractCallRequest into existing pipeline | **Additive** (new entry point, same pipeline) |
| `MCP Server` (14 tools, 4 resources) | Action tools dynamically added/removed based on providers. Existing 14 tools unchanged. | **Additive** |
| `Admin Web UI` | Oracle status section + API Keys section in Settings | **Additive** |
| `TokenRegistryService` | TokenRef builds from registry data (address, symbol, decimals) | **Read-only usage** |
| `skill files` (5 files) | Update admin.skill.md (oracle-status, api-keys), new/update transactions.skill.md or actions.skill.md | **Documentation** |
| `config.toml` | No new config keys. CoinGecko key and oracle settings use Admin Settings (hot-reload). | **None** |
| `DB schema v10` | Migration to v11: add api_keys table | **Migration** |
| `Notification 21 event types` | PRICE_DEVIATION_WARNING, PRICE_UNAVAILABLE, UNLISTED_TOKEN_TRANSFER added to audit log | **Additive** |

**No breaking changes.** All new features are additive or internal enhancements to existing API surface.

---

## Sources

### HIGH Confidence (official docs + codebase analysis)
- WAIaaS codebase direct analysis: DatabasePolicyEngine (11 PolicyType, SPENDING_LIMIT evaluation), Pipeline stages, SettingsService/settings-crypto.ts, TokenRegistryService, MCP server tools/resources
- [Pyth Hermes Rate Limits](https://docs.pyth.network/price-feeds/core/rate-limits) -- 30 req/10s per IP, 60s cooldown on 429
- [Pyth Hermes API Instances](https://docs.pyth.network/price-feeds/core/api-instances-and-providers/hermes) -- public endpoint URL, node providers for production
- [CoinGecko Rate Limits](https://docs.coingecko.com/docs/common-errors-rate-limit) -- Demo 30 calls/min, Pro 500-1000/min
- [CoinGecko Simple Token Price API](https://docs.coingecko.com/reference/simple-token-price) -- endpoint spec, platform_id, batch support
- [CoinGecko Asset Platforms](https://docs.coingecko.com/reference/asset-platforms-list) -- platform ID mapping
- WAIaaS design docs: 61-price-oracle-spec.md (IPriceOracle, OracleChain, USD policy), 62-action-provider-architecture.md (IActionProvider, resolve-then-execute, MCP conversion)
- WAIaaS v1.5 objective: v1.5-defi-price-oracle.md (scope, components, tech decisions, E2E scenarios)

### MEDIUM Confidence (WebSearch + cross-verification)
- [Pyth Price Feed IDs](https://docs.pyth.network/price-feeds/core/price-feeds/price-feed-ids) -- bytes32 format, metadata API for lookup
- [Pyth Hermes Documentation](https://docs.pyth.network/price-feeds/core/how-pyth-works/hermes) -- service architecture, REST + streaming
- [Coinbase AgentKit Architecture](https://docs.cdp.coinbase.com/agent-kit/core-concepts/architecture-explained) -- action provider pattern reference
- [Coinbase AgentKit Pyth Provider](https://github.com/coinbase/agentkit/blob/main/typescript/agentkit/src/action-providers/pyth/pythActionProvider.ts) -- @CreateAction decorator + Zod schema pattern
- [Price Oracle Security Best Practices](https://medium.com/@ancilartech/price-oracle-manipulation-protection-safeguarding-your-blockchain-applications-0d5ad1a94f64) -- multi-source, cross-validation, manipulation resistance

### LOW Confidence (training data only, needs validation in phase research)
- Pyth `/v2/price_feeds` metadata API exact response format for feed ID lookup -- needs phase research to confirm
- CoinGecko platformId for all WAIaaS-supported networks -- verified for major chains, needs confirmation for edge cases
- zodToJsonSchema library compatibility with MCP tool registration -- needs implementation verification
