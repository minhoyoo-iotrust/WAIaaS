# Architecture Patterns: Polymarket Prediction Market Integration

**Domain:** DeFi prediction market (CLOB + CTF on-chain settlement)
**Researched:** 2026-03-10
**Overall confidence:** HIGH (existing Hyperliquid pattern provides proven template; Polymarket docs verified)

## Recommended Architecture

Polymarket integration follows the **same hybrid pattern as Hyperliquid (v31.4)**: off-chain CLOB order flow via `ApiDirectResult`, on-chain CTF operations via `CONTRACT_CALL` pipeline. The architecture maps cleanly because Polymarket's design (off-chain orderbook + on-chain settlement) mirrors Hyperliquid's (off-chain DEX + on-chain deposits/withdrawals).

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|--------------|
| `PolymarketClobClient` | REST client for CLOB API (orders, markets, auth) | Polymarket CLOB API (`clob.polymarket.com`) | **NEW** |
| `PolymarketSigner` | EIP-712 order signing + CLOB auth signing | viem `signTypedData` | **NEW** |
| `PolymarketMarketData` | Market info, prices, book depth, event data | Polymarket Gamma API + CLOB API | **NEW** |
| `PolymarketOrderProvider` | IActionProvider for CLOB trading (buy/sell/cancel) | ClobClient, Signer, MarketData | **NEW** |
| `PolymarketCtfProvider` | IActionProvider for on-chain CTF ops (split/merge/redeem) | EvmAdapter (CONTRACT_CALL) | **NEW** |
| `PolymarketRateLimiter` | Request rate limiting for CLOB API | ClobClient | **NEW** |
| Pipeline Stage 5 | ApiDirectResult branch (no changes needed) | ActionProviderRegistry | **UNCHANGED** |
| Pipeline Stage 5 | CONTRACT_CALL execution for CTF ops | EvmAdapter | **UNCHANGED** |
| ActionProviderRegistry | Registers both providers | PolymarketOrderProvider, PolymarketCtfProvider | **MODIFIED** (registration only) |
| DB schema v53-v54 | polymarket_orders + polymarket_positions + polymarket_api_keys | Drizzle ORM | **NEW** |
| Admin UI | Polymarket page (markets/orders/positions/settings tabs) | REST query routes | **NEW** |
| MCP tools | Read-only query tools (8) + auto-registered action tools (10) | REST query routes | **NEW** |

### High-Level Data Flow

```
AI Agent
  |
  v
MCP Tool / REST API
  |
  +---> [CLOB Order Flow] ---> ActionProviderRegistry
  |       |                         |
  |       v                         v
  |     PolymarketOrderProvider.resolve()
  |       |
  |       +---> PolymarketSigner.signOrder() [EIP-712]
  |       +---> PolymarketClobClient.postOrder()
  |       +---> return ApiDirectResult { __apiDirect: true }
  |               |
  |               v
  |             Stage 5: skip on-chain, CONFIRMED
  |
  +---> [CTF On-Chain Flow] ---> ActionProviderRegistry
          |                         |
          v                         v
        PolymarketCtfProvider.resolve()
          |
          +---> return ContractCallRequest (splitPosition/mergePositions/redeemPositions)
                  |
                  v
                Stage 5: build -> simulate -> sign -> submit (standard pipeline)
```

## Operation-to-Pipeline Mapping

### 1. CLOB Orders --> ApiDirectResult (off-chain)

These operations use the `requiresSigningKey: true` pattern identical to Hyperliquid.

| Operation | Action Name | Pipeline Path | Risk | Default Tier |
|-----------|------------|---------------|------|-------------|
| Buy outcome tokens | `pm_buy` | ApiDirectResult | high | APPROVAL |
| Sell outcome tokens | `pm_sell` | ApiDirectResult | medium | DELAY |
| Cancel order | `pm_cancel_order` | ApiDirectResult | low | INSTANT |
| Cancel all orders | `pm_cancel_all` | ApiDirectResult | low | INSTANT |
| Update order | `pm_update_order` | ApiDirectResult | medium | DELAY |

**Flow detail (pm_buy example):**
1. Stage 1: Validate request, INSERT PENDING transaction
2. Stage 2: Session auth
3. Stage 3: Policy evaluation (spending amount = size * price in USDC.e)
4. Stage 4: Wait (tier-dependent)
5. Stage 5: `ctx.actionResult` is set --> skip on-chain
   - `PolymarketSigner.signOrder()` signs EIP-712 Order struct
   - `PolymarketClobClient.postOrder()` submits to CLOB
   - Return `ApiDirectResult { externalId: orderId, status: 'success', provider: 'polymarket_order' }`
6. Stage 5 writes CONFIRMED with `apiDirect: true` metadata

### 2. CTF Operations --> CONTRACT_CALL (on-chain)

These operations go through the standard 6-stage pipeline on Polygon.

| Operation | Action Name | Pipeline Path | Risk | Default Tier |
|-----------|------------|---------------|------|-------------|
| Split collateral -> tokens | `pm_split_position` | CONTRACT_CALL | medium | DELAY |
| Merge tokens -> collateral | `pm_merge_positions` | CONTRACT_CALL | medium | DELAY |
| Redeem winning tokens | `pm_redeem_positions` | CONTRACT_CALL | low | INSTANT |
| Approve USDC for CTF | `pm_approve_collateral` | APPROVE | low | INSTANT |
| Approve CTF for Exchange | `pm_approve_ctf` | APPROVE | low | INSTANT |

**Flow detail (pm_split_position example):**
1. `PolymarketCtfProvider.resolve('pm_split_position', params, ctx)` builds:
   ```typescript
   return {
     type: 'CONTRACT_CALL',
     to: CTF_ADDRESS, // 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
     data: encodeFunctionData({
       abi: conditionalTokensAbi,
       functionName: 'splitPosition',
       args: [USDC_E_ADDRESS, parentCollectionId, conditionId, partition, amount]
     }),
     value: '0',
   } satisfies ContractCallRequest;
   ```
2. Standard pipeline: build -> simulate -> sign -> submit on Polygon

### 3. Proxy Wallet Management --> ApiDirectResult (off-chain)

| Operation | Action Name | Pipeline Path | Notes |
|-----------|------------|---------------|-------|
| Derive proxy address | `pm_derive_proxy` | ApiDirectResult | Pure computation, no API call |
| Create/derive API keys | `pm_create_api_keys` | ApiDirectResult | CLOB auth, stores in DB |

## EIP-712 Signing: Polymarket vs Hyperliquid Comparison

### Comparison Matrix

| Aspect | Hyperliquid | Polymarket |
|--------|-------------|------------|
| Domain name | `HyperliquidSignTransaction` / phantom agent | `Polymarket CTF Exchange` |
| Domain version | `1` | `1` |
| Chain ID | `1337` (phantom) / `42161` (user-signed) | `137` (Polygon) |
| Verifying contract | N/A | CTF Exchange address |
| Primary type | `Agent` (phantom) / `HyperliquidTransaction:*` | `Order` |
| Signing pattern | msgpack encode -> keccak256 -> phantom agent sign | Direct struct sign |
| Auth signing | N/A (API key not needed) | Separate `ClobAuth` EIP-712 for API credentials |
| Order signing | Indirect (phantom agent wraps action hash) | Direct (Order struct signed as-is) |
| Signature output | `{ r, s, v }` | `bytes` (65-byte compact) |

### Polymarket Order EIP-712 Structure (HIGH confidence -- verified from multiple sources)

```typescript
// Domain separator
const POLYMARKET_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: 137n, // Polygon
  verifyingContract: CTF_EXCHANGE_ADDRESS, // 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E
} as const;

// Order struct (12 fields)
const ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
} as const;

// ClobAuth struct (for API key generation)
const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'message', type: 'string' },
  ],
} as const;
```

### Signer Implementation Pattern

```typescript
// PolymarketSigner follows HyperliquidSigner's static-method pattern
export class PolymarketSigner {
  // Sign an order for CLOB submission
  static async signOrder(
    order: PolymarketOrder,
    privateKey: Hex,
    exchangeAddress: Hex,
    isNegRisk: boolean,
  ): Promise<Hex> {
    const account = privateKeyToAccount(privateKey);
    const verifyingContract = isNegRisk ? NEG_RISK_EXCHANGE : CTF_EXCHANGE;
    return account.signTypedData({
      domain: { ...POLYMARKET_DOMAIN, verifyingContract },
      types: ORDER_TYPES,
      primaryType: 'Order',
      message: order,
    });
  }

  // Sign ClobAuth for API key creation/derivation
  static async signClobAuth(
    address: Hex,
    timestamp: string,
    nonce: bigint,
    privateKey: Hex,
  ): Promise<Hex> {
    const account = privateKeyToAccount(privateKey);
    return account.signTypedData({
      domain: { name: 'ClobAuthDomain', version: '1', chainId: 137n },
      types: CLOB_AUTH_TYPES,
      primaryType: 'ClobAuth',
      message: {
        address,
        timestamp,
        nonce,
        message: 'This message attests that I control the given wallet',
      },
    });
  }
}
```

**Key difference from Hyperliquid:** Polymarket signing is simpler -- direct struct signing without the phantom agent indirection. No msgpack encoding needed. The `signTypedData` from viem handles everything. This is closer to the existing ERC-8004 EIP-712 signing pattern.

### Signature Types

| Type | Value | WAIaaS Usage |
|------|-------|-------------|
| EOA | 0 | Default for WAIaaS wallets (direct private key signing) |
| POLY_PROXY | 1 | For proxy wallets derived from WAIaaS EOA |
| GNOSIS_SAFE | 2 | Not applicable (WAIaaS does not use Gnosis Safe) |

WAIaaS will use **signatureType = 0 (EOA)** for direct wallet signing. If proxy wallet support is added, signatureType = 1 with the proxy address as `maker` and EOA as `signer`.

## Contract Addresses (Polygon, HIGH confidence -- PolygonScan verified)

| Contract | Address | Purpose |
|----------|---------|---------|
| Conditional Tokens (CTF) | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` | ERC-1155 outcome tokens |
| CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` | Binary market order matching |
| Neg Risk CTF Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` | Multi-outcome market matching |
| Neg Risk Adapter | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` | Neg risk token conversion |
| USDC.e (Collateral) | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | Collateral token |

## DB Migration Design (v53-v54)

### Table 27: polymarket_orders (v53)

Follows the `hyperliquid_orders` pattern exactly.

```sql
CREATE TABLE polymarket_orders (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  transaction_id TEXT REFERENCES transactions(id),
  -- Market identification
  condition_id TEXT NOT NULL,        -- Gnosis condition ID (bytes32 hex)
  token_id TEXT NOT NULL,            -- CTF ERC-1155 token ID (uint256)
  market_slug TEXT,                  -- Human-readable market slug
  outcome TEXT NOT NULL,             -- 'YES' | 'NO'
  -- Order details
  order_id TEXT,                     -- CLOB-assigned order ID
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  order_type TEXT NOT NULL CHECK (order_type IN ('GTC', 'GTD', 'FOK', 'IOC')),
  price TEXT NOT NULL,               -- Decimal 0-1 range
  size TEXT NOT NULL,                -- Number of shares
  -- Execution state
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'LIVE', 'MATCHED', 'PARTIALLY_FILLED', 'CANCELLED', 'EXPIRED')),
  filled_size TEXT,
  avg_fill_price TEXT,
  -- Signing metadata
  salt TEXT,                         -- EIP-712 order salt
  maker_amount TEXT,                 -- Raw makerAmount (uint256)
  taker_amount TEXT,                 -- Raw takerAmount (uint256)
  signature_type INTEGER NOT NULL DEFAULT 0,  -- 0=EOA, 1=POLY_PROXY
  fee_rate_bps INTEGER,
  expiration INTEGER,                -- Unix timestamp
  nonce TEXT,                        -- Order nonce
  -- Market metadata
  is_neg_risk INTEGER NOT NULL DEFAULT 0,
  -- Raw response
  response_data TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_pm_orders_wallet ON polymarket_orders(wallet_id);
CREATE INDEX idx_pm_orders_order_id ON polymarket_orders(order_id);
CREATE INDEX idx_pm_orders_condition ON polymarket_orders(condition_id);
CREATE INDEX idx_pm_orders_status ON polymarket_orders(status);
CREATE INDEX idx_pm_orders_created ON polymarket_orders(created_at);
```

### Table 28: polymarket_positions (v54)

Tracks current holdings of outcome tokens per wallet.

```sql
CREATE TABLE polymarket_positions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  -- Market identification
  condition_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  market_slug TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('YES', 'NO')),
  -- Position data
  size TEXT NOT NULL DEFAULT '0',         -- Current token balance
  avg_price TEXT,                         -- Average entry price
  realized_pnl TEXT DEFAULT '0',
  -- Market state
  market_resolved INTEGER NOT NULL DEFAULT 0,
  winning_outcome TEXT,                   -- Set after resolution
  -- Metadata
  is_neg_risk INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(wallet_id, token_id)
);

CREATE INDEX idx_pm_positions_wallet ON polymarket_positions(wallet_id);
CREATE INDEX idx_pm_positions_condition ON polymarket_positions(condition_id);
CREATE INDEX idx_pm_positions_resolved ON polymarket_positions(market_resolved);
```

### Table 29: polymarket_api_keys (v54)

Stores CLOB API credentials per wallet (encrypted).

```sql
CREATE TABLE polymarket_api_keys (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  api_key TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,    -- Encrypted with master password
  api_passphrase_encrypted TEXT NOT NULL, -- Encrypted with master password
  signature_type INTEGER NOT NULL DEFAULT 0,
  proxy_address TEXT,                     -- Proxy wallet address (if type 1)
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(wallet_id)
);
```

## Dual Provider Architecture

Unlike Hyperliquid (single provider with `requiresSigningKey: true`), Polymarket needs **two providers** because it has both off-chain (CLOB) and on-chain (CTF) operations:

### Provider 1: PolymarketOrderProvider (CLOB, off-chain)

```typescript
export class PolymarketOrderProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'polymarket_order',
    description: 'Polymarket prediction market CLOB trading: buy and sell outcome tokens',
    version: '1.0.0',
    chains: ['ethereum'], // Polygon is an ethereum-type chain
    mcpExpose: true,
    requiresApiKey: false,
    requiredApis: [],
    requiresSigningKey: true, // Needs private key for EIP-712 order signing
  };

  readonly actions: readonly ActionDefinition[] = [
    { name: 'pm_buy', ... riskLevel: 'high', defaultTier: 'APPROVAL' },
    { name: 'pm_sell', ... riskLevel: 'medium', defaultTier: 'DELAY' },
    { name: 'pm_cancel_order', ... riskLevel: 'low', defaultTier: 'INSTANT' },
    { name: 'pm_cancel_all', ... riskLevel: 'low', defaultTier: 'INSTANT' },
    { name: 'pm_update_order', ... riskLevel: 'medium', defaultTier: 'DELAY' },
  ];

  async resolve(actionName, params, context): Promise<ApiDirectResult> {
    // EIP-712 sign -> CLOB POST -> return ApiDirectResult
  }

  async getSpendingAmount(actionName, params): Promise<{ amount: bigint; asset: string }> {
    // pm_buy: size * price (USDC.e 6 decimals)
    // pm_sell: 0n (selling existing position)
    // pm_cancel/pm_update: 0n
  }
}
```

### Provider 2: PolymarketCtfProvider (CTF, on-chain)

```typescript
export class PolymarketCtfProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'polymarket_ctf',
    description: 'Polymarket CTF on-chain operations: split, merge, and redeem outcome tokens',
    version: '1.0.0',
    chains: ['ethereum'],
    mcpExpose: true,
    requiresApiKey: false,
    requiredApis: [],
    requiresSigningKey: false, // Standard on-chain operations
  };

  readonly actions: readonly ActionDefinition[] = [
    { name: 'pm_split_position', ... riskLevel: 'medium', defaultTier: 'DELAY' },
    { name: 'pm_merge_positions', ... riskLevel: 'medium', defaultTier: 'DELAY' },
    { name: 'pm_redeem_positions', ... riskLevel: 'low', defaultTier: 'INSTANT' },
    { name: 'pm_approve_collateral', ... riskLevel: 'low', defaultTier: 'INSTANT' },
    { name: 'pm_approve_ctf', ... riskLevel: 'low', defaultTier: 'INSTANT' },
  ];

  async resolve(actionName, params, context): Promise<ContractCallRequest | ContractCallRequest[]> {
    // Build ContractCallRequest for on-chain execution via standard pipeline
  }
}
```

## REST API Routes (Query Endpoints)

Following the Hyperliquid pattern (`/v1/wallets/:walletId/hyperliquid/*`):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/wallets/:walletId/polymarket/positions` | Current outcome token positions |
| GET | `/v1/wallets/:walletId/polymarket/orders` | Open/recent orders |
| GET | `/v1/wallets/:walletId/polymarket/orders/:orderId` | Single order detail |
| GET | `/v1/polymarket/markets` | Active markets list |
| GET | `/v1/polymarket/markets/:conditionId` | Market detail + prices |
| GET | `/v1/polymarket/events` | Event categories/groups |
| GET | `/v1/wallets/:walletId/polymarket/balance` | USDC.e + token balances |
| GET | `/v1/wallets/:walletId/polymarket/pnl` | Profit/loss summary |
| POST | `/v1/wallets/:walletId/polymarket/setup` | Create API keys + optional proxy |

Action endpoints use the generic `/v1/actions/polymarket_order/:action` and `/v1/actions/polymarket_ctf/:action` routes (auto-registered).

## MCP Tools

Auto-registered action tools (via `mcpExpose: true`):
- `waiaas_pm_buy`, `waiaas_pm_sell`, `waiaas_pm_cancel_order`, `waiaas_pm_cancel_all`, `waiaas_pm_update_order`
- `waiaas_pm_split_position`, `waiaas_pm_merge_positions`, `waiaas_pm_redeem_positions`
- `waiaas_pm_approve_collateral`, `waiaas_pm_approve_ctf`

Manually registered query tools:
- `waiaas_pm_get_positions` -- Current positions
- `waiaas_pm_get_orders` -- Open orders
- `waiaas_pm_get_markets` -- Browse markets
- `waiaas_pm_get_market_detail` -- Market prices + book
- `waiaas_pm_get_events` -- Event categories
- `waiaas_pm_get_balance` -- USDC.e + outcome token balances
- `waiaas_pm_get_pnl` -- P&L summary
- `waiaas_pm_setup` -- One-time API key setup

## Admin UI Design

New Polymarket page (`/polymarket`) with 5 tabs (following Hyperliquid pattern):

| Tab | Content |
|-----|---------|
| Overview | Active positions, total P&L, USDC.e balance |
| Markets | Browse/search active markets, prices, volume |
| Orders | Open orders, order history, cancel actions |
| Positions | Outcome token holdings, unrealized P&L, redeem button |
| Settings | API key status, proxy wallet, Polymarket-specific settings |

## Admin Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `polymarket_enabled` | boolean | false | Enable Polymarket integration |
| `polymarket_default_fee_bps` | number | 0 | Default fee rate in basis points |
| `polymarket_order_expiry_seconds` | number | 86400 | Default order TTL (24h) |
| `polymarket_max_position_usdc` | number | 1000 | Max position size in USDC |
| `polymarket_proxy_wallet` | boolean | false | Use proxy wallet (signatureType 1) |
| `polymarket_neg_risk_enabled` | boolean | true | Allow multi-outcome markets |
| `polymarket_auto_approve_ctf` | boolean | true | Auto-approve CTF token spending |

## Policy Evaluation Mapping

| Action | Spending Amount | Asset | Evaluation |
|--------|----------------|-------|------------|
| `pm_buy` | `size * price` | USDC.e | Full policy: tier + spending limits |
| `pm_sell` | `0` | USDC.e | Tier only (no spending) |
| `pm_cancel_order` | `0` | USDC.e | Tier only |
| `pm_update_order` | `delta(size * price)` | USDC.e | Full policy if increasing |
| `pm_split_position` | `amount` | USDC.e | Full policy: locks collateral |
| `pm_merge_positions` | `0` | USDC.e | Tier only (releasing collateral) |
| `pm_redeem_positions` | `0` | USDC.e | Tier only (claiming winnings) |

## Patterns to Follow

### Pattern 1: Shared Infrastructure Factory (from Hyperliquid)

```typescript
// polymarket-factory.ts
export function createPolymarketInfrastructure(config: PolymarketConfig) {
  const rateLimiter = new PolymarketRateLimiter(config.rateLimit);
  const clobClient = new PolymarketClobClient(config.host, rateLimiter);
  const marketData = new PolymarketMarketData(clobClient);

  const orderProvider = new PolymarketOrderProvider(clobClient, marketData);
  const ctfProvider = new PolymarketCtfProvider(config.contracts);

  return { clobClient, marketData, orderProvider, ctfProvider, rateLimiter };
}
```

### Pattern 2: Lazy API Key Creation (Unique to Polymarket)

Unlike Hyperliquid (no API keys), Polymarket requires CLOB API credentials. These should be created on first use and stored encrypted in `polymarket_api_keys`:

```typescript
async function ensureApiKeys(walletId: string, privateKey: Hex, db: DB): Promise<ApiCredentials> {
  const existing = await db.select().from(polymarketApiKeys).where(eq(..., walletId)).get();
  if (existing) return decryptCredentials(existing);

  // Create API keys via CLOB auth endpoint
  const creds = await PolymarketSigner.createApiKeys(privateKey);
  await db.insert(polymarketApiKeys).values({
    id: generateId(),
    walletId,
    apiKey: creds.apiKey,
    apiSecretEncrypted: encrypt(creds.secret),
    apiPassphraseEncrypted: encrypt(creds.passphrase),
  });
  return creds;
}
```

### Pattern 3: Neg Risk Market Detection

Polymarket has two exchange contracts. The provider must detect which exchange to use based on market type:

```typescript
function getExchangeForMarket(market: MarketInfo): { exchange: Hex; isNegRisk: boolean } {
  if (market.negRisk) {
    return { exchange: NEG_RISK_CTF_EXCHANGE, isNegRisk: true };
  }
  return { exchange: CTF_EXCHANGE, isNegRisk: false };
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using @polymarket/clob-client Directly

**What:** Importing the official Polymarket TypeScript SDK.
**Why bad:** It uses ethers.js (not viem), has heavy dependencies, and WAIaaS already has all signing primitives. The SDK also manages its own wallet abstraction that conflicts with WAIaaS key management.
**Instead:** Implement a lightweight `PolymarketClobClient` using native `fetch` + viem's `signTypedData`, following the `HyperliquidExchangeClient` pattern. Only ~200 LOC needed for the CLOB REST client.

### Anti-Pattern 2: Storing Private Keys in CLOB API Config

**What:** Passing private keys to the CLOB client for auth.
**Why bad:** Violates WAIaaS security model. Keys should only be decrypted in resolve() via `requiresSigningKey`.
**Instead:** Use `requiresSigningKey: true` pattern. API keys (derived once) are stored encrypted. Order signing happens inline in resolve().

### Anti-Pattern 3: Single Provider for Both CLOB and CTF

**What:** One IActionProvider handling both off-chain and on-chain operations.
**Why bad:** Mixing `ApiDirectResult` and `ContractCallRequest` return types in one provider creates confusing `requiresSigningKey` semantics (CTF ops don't need it, CLOB ops do).
**Instead:** Two providers: `polymarket_order` (CLOB, `requiresSigningKey: true`) and `polymarket_ctf` (CTF, `requiresSigningKey: false`).

## Scalability Considerations

| Concern | Current Scale | At Scale |
|---------|--------------|----------|
| CLOB rate limits | Unknown official limit | PolymarketRateLimiter with conservative defaults |
| Market data caching | In-memory, 30s TTL | Same approach as HyperliquidMarketData |
| Position tracking | DB sync on order fill | EventBus listener updates positions on order confirmation |
| Multi-wallet trading | One API key set per wallet | `polymarket_api_keys` table supports per-wallet isolation |

## Build Order (Dependency-Driven)

```
Phase 1: Core Infrastructure
  - PolymarketSigner (EIP-712 signing, no external deps)
  - PolymarketClobClient (REST client, needs Signer for auth)
  - PolymarketRateLimiter
  - Contract ABIs + addresses config
  - DB migration v53 (polymarket_orders) + v54 (polymarket_positions, polymarket_api_keys)

Phase 2: CLOB Order Provider (depends on Phase 1)
  - PolymarketMarketData (market info, prices)
  - PolymarketOrderProvider (IActionProvider, ApiDirectResult)
  - Zod input schemas (PmBuySchema, PmSellSchema, etc.)
  - Order lifecycle management (status sync from CLOB)
  - Integration tests

Phase 3: CTF On-Chain Provider (depends on Phase 1)
  - PolymarketCtfProvider (IActionProvider, ContractCallRequest)
  - Split/Merge/Redeem operations
  - Approval helpers (USDC.e -> CTF, CTF -> Exchange)
  - Integration tests

Phase 4: REST API + MCP + Admin (depends on Phase 2, 3)
  - Query routes (/v1/wallets/:walletId/polymarket/*)
  - MCP query tools (8 tools)
  - Admin UI Polymarket page (5 tabs)
  - Admin Settings (7 keys)
  - SDK methods (PolymarketClient)

Phase 5: Position Tracking + P&L (depends on Phase 2)
  - Position sync from CLOB fills
  - P&L calculation
  - Market resolution detection
  - EventBus integration for notifications
```

## Sources

- [Polymarket CLOB Authentication](https://docs.polymarket.com/developers/CLOB/authentication) -- EIP-712 auth details, HIGH confidence
- [Polymarket CLOB Quickstart](https://docs.polymarket.com/developers/CLOB/quickstart) -- API key flow, order placement, HIGH confidence
- [Polymarket CTF Overview](https://docs.polymarket.com/trading/ctf/overview) -- Token framework mechanics, HIGH confidence
- [Polymarket CTF Exchange GitHub](https://github.com/Polymarket/ctf-exchange) -- Contract source, Order struct, HIGH confidence
- [Polymarket CTF Exchange on PolygonScan](https://polygonscan.com/address/0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e) -- Verified contract, HIGH confidence
- [Polymarket Order Signing Gist](https://gist.github.com/shaunlebron/7463f0003aa906ffe6f31dc18c408f73) -- Complete Order struct fields, MEDIUM confidence
- [Polymarket Order Utils](https://github.com/Polymarket/clob-order-utils) -- TypeScript order signing utility, HIGH confidence
- [Polymarket Rust SDK](https://docs.rs/polymarket-sdk/latest/polymarket_sdk/) -- Order struct reference, MEDIUM confidence
