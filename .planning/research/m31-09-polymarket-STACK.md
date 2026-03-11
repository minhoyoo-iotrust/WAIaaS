# Technology Stack: Polymarket Prediction Market Integration

**Project:** WAIaaS v31.9 — Polymarket Prediction Market
**Researched:** 2026-03-10

## Decision: Do NOT Use @polymarket/clob-client

**Recommendation: Build custom Polymarket API client using existing WAIaaS infrastructure.**

`@polymarket/clob-client` (v5.7.0) depends on ethers v5.7.1 + axios + @polymarket/order-utils + @polymarket/builder-signing-sdk. WAIaaS uses viem 2.x exclusively for EVM operations. Importing ethers v5 as a transitive dependency adds ~1.5MB bundle weight and creates a parallel signing stack that conflicts with WAIaaS's existing `signTypedData` via EvmAdapter. The Hyperliquid integration (v31.4) already established the pattern of building custom API clients instead of using vendor SDKs.

**What to reuse from @polymarket packages:** Reference `@polymarket/order-utils` v3.0.1 source code for the exact EIP-712 type definitions and order hashing logic, but reimplement using viem's `signTypedData`. The order-utils package itself also drags in ethers v5 + viem dual dependency.

---

## Recommended Stack Additions

### No New npm Dependencies Required

The entire Polymarket integration can be built with zero new npm packages. All required capabilities exist in the current stack.

| Capability | Existing Package | How Used |
|---|---|---|
| EIP-712 Order Signing | `viem` 2.x (already installed) | `signTypedData` via EvmAdapter |
| CLOB REST API Client | Node.js built-in `fetch` | Custom `PolymarketClobClient` (same pattern as HyperliquidExchangeClient) |
| Gamma Market Data API | Node.js built-in `fetch` | Custom `PolymarketGammaClient` (no auth needed) |
| WebSocket Subscriptions | Node.js built-in `WebSocket` | Custom `PolymarketWsClient` for real-time price/order updates |
| HMAC-SHA256 (L2 Auth) | Node.js `crypto` module | API request signing for trading endpoints |
| ERC-1155 Token Interaction | `viem` 2.x (already installed) | CTF conditional token balances/transfers via existing ERC-1155 infra |
| ABI Encoding (CTF calls) | `viem` 2.x `encodeFunctionData` | `redeemPositions`, `splitPosition`, `mergePositions` calldata |
| BigInt Arithmetic | Native JS BigInt | Token amounts, order pricing (USDC 6 decimals) |

### Core Framework (Unchanged)
| Technology | Version | Purpose | Why |
|---|---|---|---|
| Node.js | 22 | Runtime | Already in use |
| viem | 2.x | EVM interaction + EIP-712 signing | signTypedData supports Polymarket Order struct directly |
| OpenAPIHono | 4.x | REST API | Already in use |
| Drizzle + SQLite | Current | DB + ORM | New migration for polymarket_orders table |

---

## Polymarket API Architecture (Three Services)

### 1. CLOB API (Trading)
| Property | Value |
|---|---|
| **Base URL (Prod)** | `https://clob.polymarket.com` |
| **Base URL (Testnet)** | Not publicly available (Polymarket has no public testnet CLOB) |
| **Auth (L1)** | EIP-712 signature -- creates API credentials |
| **Auth (L2)** | HMAC-SHA256 with derived `apiKey` + `secret` + `passphrase` |
| **Protocol** | REST + WebSocket |
| **Confidence** | HIGH (official docs) |

**Key REST Endpoints:**
```
POST   /auth/api-key          -- Create API credentials (L1 auth)
DELETE /auth/api-key           -- Delete API credentials
GET    /auth/api-keys          -- List API credentials
POST   /order                  -- Place order (L2 auth)
DELETE /order/{id}             -- Cancel order
GET    /data/order/{hash}      -- Get order by hash
GET    /data/orders            -- Get active orders for market
GET    /trades                 -- Get user trades
GET    /book                   -- Get orderbook (no auth)
GET    /price                  -- Get current price (no auth)
GET    /midpoint               -- Get midpoint price (no auth)
```

**WebSocket Endpoints:**
```
wss://ws-subscriptions-clob.polymarket.com/ws/  -- User orders/trades (auth) + market data (no auth)
wss://ws-live-data.polymarket.com               -- Activity feed, prices, orderbook (no auth)
```

### 2. Gamma API (Market Data)
| Property | Value |
|---|---|
| **Base URL** | `https://gamma-api.polymarket.com` |
| **Auth** | None required |
| **Protocol** | REST |
| **Confidence** | HIGH (official docs) |

**Key REST Endpoints:**
```
GET /events           -- List events (with markets)
GET /events/{slug}    -- Get event details
GET /markets          -- List markets
GET /markets/{id}     -- Get market details
```

### 3. Data API (Positions)
| Property | Value |
|---|---|
| **Base URL** | `https://data-api.polymarket.com` |
| **Auth** | None required |
| **Protocol** | REST |
| **Confidence** | MEDIUM (inferred from docs) |

---

## Contract Addresses (Polygon Mainnet, Chain ID 137)

| Contract | Address | Purpose |
|---|---|---|
| **CTF Exchange** | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` | Binary market order settlement |
| **Neg Risk CTF Exchange** | `0xC5d563A36AE78145C45a50134d48A1215220f80a` | Multi-outcome market order settlement |
| **Conditional Tokens (CTF)** | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` | ERC-1155 conditional token contract (Gnosis CTF) |
| **Neg Risk Adapter** | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` | NO-to-YES token conversion for multi-outcome markets |
| **USDC.e (Bridged)** | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | Collateral token (6 decimals) |
| **Proxy Wallet Factory** | `0xaB45c5A4B0c941a2F231C04C3f49182e1A254052` | EIP-1167 minimal proxy creation (CREATE2) |
| **Gnosis Safe Factory** | `0xaacfeea03eb1561c4e67d661e40682bd20e3541b` | Safe proxy creation |
| **UMA Adapter** | `0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74` | Oracle resolution |

**Confidence:** HIGH (verified from official Polymarket docs + PolygonScan)

**Testnet (Amoy, Chain ID 80002):** Polymarket does NOT operate a public testnet CLOB API. The CTF contracts may be deployed on Amoy for contract-level testing, but there is no testnet order matching service. Testing strategy must be mock-based for CLOB operations.

---

## EIP-712 Definitions

### Two Separate EIP-712 Domains

Polymarket uses TWO distinct EIP-712 domains for different purposes:

#### Domain 1: CLOB Authentication (API Key Creation)
```typescript
const CLOB_AUTH_DOMAIN = {
  name: 'ClobAuthDomain',
  version: '1',
  chainId: 137, // Polygon Mainnet
} as const;

const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'message', type: 'string' },
  ],
} as const;

// Message value is always:
// "This message attests that I control the given wallet"
```

#### Domain 2: CTF Exchange Orders (Trading)
```typescript
const CTF_EXCHANGE_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: 137, // Polygon Mainnet (80002 for Amoy)
  verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E', // CTF Exchange
  // For Neg Risk markets: '0xC5d563A36AE78145C45a50134d48A1215220f80a'
} as const;

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
```

**Confidence:** HIGH (verified from CTF Exchange source + Clojure signing gist + official docs)

### Order Struct Field Reference

| Field | Type | Description |
|---|---|---|
| `salt` | uint256 | Random entropy (unique per order) |
| `maker` | address | Order source (WAIaaS wallet address or proxy wallet address) |
| `signer` | address | Signature creator (WAIaaS EOA, defaults to maker for EOA signing) |
| `taker` | address | `0x0000...0000` for public orders, specific address for private fills |
| `tokenId` | uint256 | CTF ERC-1155 token ID (identifies specific market outcome: Yes/No) |
| `makerAmount` | uint256 | Max tokens to sell (USDC for BUY side, outcome tokens for SELL) |
| `takerAmount` | uint256 | Min tokens to receive |
| `expiration` | uint256 | Unix timestamp (0 = no expiration) |
| `nonce` | uint256 | For on-chain cancellation |
| `feeRateBps` | uint256 | Fee in basis points (set by API) |
| `side` | uint8 | 0 = BUY, 1 = SELL |
| `signatureType` | uint8 | 0 = EOA, 1 = POLY_PROXY, 2 = POLY_GNOSIS_SAFE |

### Signature Types

| Value | Name | Description | WAIaaS Relevance |
|---|---|---|---|
| 0 | `EOA` | Direct EOA signature | **Primary option** -- WAIaaS wallets sign directly as EOA |
| 1 | `POLY_PROXY` | EIP-1167 proxy wallet signature | Needed if Polymarket requires proxy wallet |
| 2 | `POLY_GNOSIS_SAFE` | Gnosis Safe signature | Not needed (WAIaaS doesn't use Gnosis Safe) |

**Recommendation:** Use `signatureType: 0 (EOA)` as the primary signing mode. Polymarket's proxy wallet is for their web UX; programmatic API access via EOA signing is the standard for bots/agents. If proxy wallet is required by the API, implement CREATE2 address derivation from the Proxy Wallet Factory but prefer EOA direct signing.

---

## Proxy Wallet Architecture

### Overview
Polymarket creates a 1-of-1 multisig proxy (EIP-1167 minimal proxy) per EOA user, deployed via CREATE2 from the Proxy Wallet Factory. The proxy holds all positions (ERC-1155) and USDC.

### WAIaaS Integration Decision

**Recommendation: Start with EOA signing (signatureType: 0). Add proxy wallet support only if the CLOB API rejects EOA-signed orders.**

Rationale:
1. The CLOB API documentation shows EOA as a valid signatureType
2. Programmatic traders typically use EOA signing (no proxy deployment needed)
3. Proxy wallet adds complexity: CREATE2 derivation, USDC funding of proxy, position tracking in proxy address
4. If proxy IS required: derive address deterministically from factory + EOA salt, deploy on first order

### Proxy Wallet Flow (if needed)
```
1. Derive proxy address: CREATE2(factory, salt=keccak256(eoa), initCode)
2. Check if deployed (getCode)
3. If not deployed: call factory.deploy(eoa) -- one-time gas cost
4. Transfer USDC to proxy wallet
5. Sign orders with signatureType: 1 (POLY_PROXY)
6. Proxy wallet holds positions (ERC-1155 conditional tokens)
```

**Confidence:** MEDIUM (proxy wallet docs are sparse; EOA signing validity for API needs runtime verification)

---

## Neg Risk (Multi-Outcome Markets)

### How It Works
For markets with >2 outcomes (e.g., "Who wins the election?"), Polymarket uses the NegRiskAdapter:

1. Each outcome is a binary Yes/No market under the hood
2. NegRiskAdapter wraps USDC into WrappedCollateral
3. Trading routes through Neg Risk CTF Exchange (different contract address)
4. NO tokens can be converted to YES tokens of complementary outcomes + USDC
5. At resolution, exactly one outcome resolves true

### Impact on Implementation
- **Different exchange contract**: Orders for neg risk markets use `verifyingContract: 0xC5d563A36AE78145C45a50134d48A1215220f80a`
- **Market type detection**: Gamma API provides `neg_risk: true/false` field on markets
- **Approval targets**: USDC approve must target the correct exchange contract per market type
- **Redeem flow**: Neg risk markets redeem through NegRiskAdapter, not CTF directly

**Confidence:** HIGH (official docs + ChainSecurity audit)

---

## CTF Contract ABIs (Minimal Required)

No need to import full ABIs. Define only the functions WAIaaS will call:

### Conditional Tokens (0x4D97...76045)
```typescript
const CONDITIONAL_TOKENS_ABI = [
  // Read: check balances
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] owners, uint256[] ids) view returns (uint256[])',
  // Write: redeem winning positions
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)',
  // Write: split/merge (advanced, for CTF direct interaction)
  'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
  'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
] as const;
```

### CTF Exchange (0x4bFb...982E) -- Used Implicitly by CLOB
```typescript
// The CTF Exchange is called by the CLOB operator for settlement.
// WAIaaS does NOT call the exchange contract directly for orders.
// WAIaaS only needs to:
// 1. Approve USDC to the exchange contract
// 2. Sign EIP-712 orders off-chain
// 3. Submit signed orders to CLOB REST API
```

### USDC.e Approval
```typescript
const ERC20_APPROVE_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
] as const;

// Approve targets:
// Binary markets:    approve(CTF_EXCHANGE, amount)
// Neg Risk markets:  approve(NEG_RISK_CTF_EXCHANGE, amount)
```

**Confidence:** HIGH (verified from contract source)

---

## CLOB Authentication Flow

### L1: API Key Creation (One-time Setup)

```typescript
// 1. Sign EIP-712 ClobAuth message
const signature = await signTypedData({
  domain: CLOB_AUTH_DOMAIN,
  types: CLOB_AUTH_TYPES,
  primaryType: 'ClobAuth',
  message: {
    address: walletAddress,
    timestamp: String(Math.floor(Date.now() / 1000)),
    nonce: 0n,
    message: 'This message attests that I control the given wallet',
  },
});

// 2. POST /auth/api-key with L1 headers
// Headers: POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_NONCE

// 3. Response: { apiKey, secret, passphrase }
// Store in Admin Settings (encrypted)
```

### L2: Trading Requests (Per-Request HMAC)

```typescript
// For each trading request:
// 1. Build HMAC-SHA256 signature from: timestamp + method + path + body
// 2. Sign with `secret` from L1 credentials
// Headers: POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_API_KEY, POLY_PASSPHRASE
```

### WAIaaS Integration
- **API Key Storage**: Admin Settings keys `polymarket_api_key`, `polymarket_api_secret`, `polymarket_passphrase`
- **Key Creation**: MCP tool / SDK method / Admin UI button to create API key (triggers EIP-712 signing flow)
- **Key Rotation**: Delete + recreate via L1 auth
- **Per-Wallet Keys**: Each wallet address gets its own CLOB API credentials

**Confidence:** HIGH (official authentication docs)

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|---|---|---|---|
| CLOB Client | Custom (fetch-based) | `@polymarket/clob-client` v5.7.0 | Brings ethers v5 (~1.5MB), conflicts with viem-only stack, abstractions don't match WAIaaS signing pipeline |
| Order Signing | viem `signTypedData` | `@polymarket/order-utils` v3.0.1 | Dual ethers+viem dep, unnecessary when viem handles EIP-712 natively |
| Market Data | Custom Gamma client | Third-party wrappers | Gamma API is trivial REST with no auth; no wrapper needed |
| ERC-1155 Interaction | Existing WAIaaS ERC-1155 infra | New CTF-specific client | CTF tokens ARE ERC-1155; reuse v31.0 infrastructure |
| WebSocket | Node.js WebSocket API | ws / socket.io packages | Built-in WebSocket sufficient for subscription pattern |

---

## Integration Points with Existing WAIaaS

| WAIaaS Component | Integration |
|---|---|
| **EvmAdapter.signTypedData** | Both EIP-712 domains (ClobAuth + Order signing) |
| **ApiDirectResult pattern** | CLOB order submit/cancel/query (same as Hyperliquid) |
| **6-stage pipeline** | USDC approve (APPROVE type), CTF redeem (CONTRACT_CALL type) |
| **Admin Settings** | API credentials storage (apiKey/secret/passphrase per wallet) |
| **Policy engine** | USDC spending limits apply to order makerAmount |
| **ERC-1155 infra** | Conditional token balance queries |
| **Action Provider framework** | PolymarketActionProvider (IActionProvider) |
| **DB migration** | New `polymarket_orders` + `polymarket_positions` tables |
| **MCP tools** | Market query, order CRUD, position view, redeem |
| **connect-info** | polymarket capability flag |

---

## What NOT to Add

| Package/Technology | Why Not |
|---|---|
| `@polymarket/clob-client` | ethers v5 dependency conflict |
| `@polymarket/order-utils` | ethers v5 dependency, viem handles EIP-712 natively |
| `@polymarket/builder-signing-sdk` | Specific to Polymarket web builder flow |
| `ethers` (any version) | WAIaaS is viem-only; no ethers in the dependency tree |
| `axios` | WAIaaS uses native fetch; no HTTP client libraries |
| Gnosis Safe SDK | WAIaaS wallets are EOA-based, not Safe-based |

---

## Sources

- [Polymarket CLOB Introduction](https://docs.polymarket.com/developers/CLOB/introduction) -- HIGH confidence
- [Polymarket Authentication Docs](https://docs.polymarket.com/developers/CLOB/authentication) -- HIGH confidence
- [Polymarket Contract Addresses](https://docs.polymarket.com/resources/contract-addresses) -- HIGH confidence
- [Polymarket CTF Overview](https://docs.polymarket.com/trading/ctf/overview) -- HIGH confidence
- [Polymarket Proxy Wallet Docs](https://docs.polymarket.com/developers/proxy-wallet) -- MEDIUM confidence
- [Polymarket Neg Risk Docs](https://docs.polymarket.com/advanced/neg-risk) -- HIGH confidence
- [CTF Exchange OrderStructs.sol](https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/libraries/OrderStructs.sol) -- HIGH confidence
- [CTF Exchange Hashing.sol](https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/mixins/Hashing.sol) -- HIGH confidence
- [Polymarket Neg Risk Adapter](https://github.com/Polymarket/neg-risk-ctf-adapter) -- HIGH confidence
- [Polymarket CLOB Client (reference)](https://github.com/Polymarket/clob-client) -- HIGH confidence
- [Polymarket Order Utils (reference)](https://github.com/Polymarket/clob-order-utils) -- HIGH confidence
- [Polymarket Gamma API](https://docs.polymarket.com/developers/gamma-markets-api/overview) -- HIGH confidence
- [Polymarket WSS Overview](https://docs.polymarket.com/developers/CLOB/websocket/wss-overview) -- HIGH confidence
- [Polymarket Order Signing (Clojure gist)](https://gist.github.com/shaunlebron/7463f0003aa906ffe6f31dc18c408f73) -- MEDIUM confidence (cross-verified with official source)
- [NegRiskAdapter ChainSecurity Audit](https://www.chainsecurity.com/security-audit/polymarket-negriskadapter) -- HIGH confidence
