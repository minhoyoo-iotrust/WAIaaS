---
name: "WAIaaS Polymarket"
description: "Polymarket prediction market trading: CLOB off-chain orders, CTF on-chain settlement, market data, position tracking"
category: "api"
tags: [polymarket, prediction-market, clob, ctf, defi, polygon, usdc]
version: "2.9.0-rc"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Polymarket

Polymarket prediction market integration for AI agents. Trade on prediction markets using CLOB (Central Limit Order Book) off-chain orders and CTF (Conditional Token Framework) on-chain settlement. Runs exclusively on Polygon network using USDC.e as collateral.

> AI agents must NEVER request the master password. Use only your session token.

## Base URL / Authentication

```
http://localhost:3100
```

All endpoints require **sessionAuth** via `Authorization: Bearer <token>` header.

## Prerequisites

1. **Polygon wallet** -- Polymarket requires a wallet on `polygon-mainnet` network
2. **Polymarket enabled** -- Admin must set `actions.polymarket_enabled = true` in Admin Settings
3. **API keys** -- Run setup to create Polymarket CLOB API keys for the wallet

## 1. Setup

### POST /v1/wallets/{walletId}/polymarket/setup -- Create API Keys

Creates Polymarket CLOB API keys for the specified wallet. Required before placing orders.

```bash
curl -s -X POST http://localhost:3100/v1/wallets/${WALLET_ID}/polymarket/setup \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

**Response (200):**
```json
{
  "setup": {
    "created": true,
    "apiKey": "...",
    "walletId": "..."
  }
}
```

## 2. CLOB Trading Actions (polymarket_order)

All CLOB actions are executed via the action provider framework. Orders are placed off-chain on the Polymarket CLOB.

### pm_buy -- Buy Outcome Tokens

**Default Tier:** APPROVAL (requires owner approval)

```bash
curl -s -X POST http://localhost:3100/v1/actions/polymarket_order/pm_buy \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -H 'Content-Type: application/json' \
  -d '{
    "walletId": "WALLET_ID",
    "params": {
      "tokenId": "TOKEN_ID",
      "price": "0.65",
      "size": "100"
    }
  }'
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `tokenId` | string | yes | Outcome token ID from market data |
| `price` | string | yes | Price per token (0-1 range, e.g. "0.65" = 65 cents) |
| `size` | string | yes | Number of tokens to buy |
| `feeRateBps` | number | no | Fee rate override (basis points) |
| `nonce` | string | no | Custom nonce |
| `expiration` | number | no | Custom expiry (unix timestamp) |

### pm_sell -- Sell Outcome Tokens

**Default Tier:** DELAY

```bash
curl -s -X POST http://localhost:3100/v1/actions/polymarket_order/pm_sell \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -H 'Content-Type: application/json' \
  -d '{
    "walletId": "WALLET_ID",
    "params": {
      "tokenId": "TOKEN_ID",
      "price": "0.70",
      "size": "50"
    }
  }'
```

Same params as pm_buy.

### pm_cancel_order -- Cancel Single Order

**Default Tier:** INSTANT

```bash
curl -s -X POST http://localhost:3100/v1/actions/polymarket_order/pm_cancel_order \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -H 'Content-Type: application/json' \
  -d '{
    "walletId": "WALLET_ID",
    "params": {
      "orderId": "ORDER_ID"
    }
  }'
```

### pm_cancel_all -- Cancel All Orders

**Default Tier:** INSTANT

```bash
curl -s -X POST http://localhost:3100/v1/actions/polymarket_order/pm_cancel_all \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -H 'Content-Type: application/json' \
  -d '{
    "walletId": "WALLET_ID",
    "params": {
      "conditionId": "CONDITION_ID"
    }
  }'
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `conditionId` | string | no | Filter by market condition ID (omit for all) |

### pm_update_order -- Update Order

**Default Tier:** DELAY (cancel + replace)

```bash
curl -s -X POST http://localhost:3100/v1/actions/polymarket_order/pm_update_order \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -H 'Content-Type: application/json' \
  -d '{
    "walletId": "WALLET_ID",
    "params": {
      "tokenId": "TOKEN_ID",
      "price": "0.70",
      "size": "100",
      "orderId": "EXISTING_ORDER_ID"
    }
  }'
```

## 3. CTF On-chain Actions (polymarket_ctf)

CTF actions execute on-chain transactions on the Conditional Token Framework contracts.

### pm_split_position -- Split USDC to Outcome Tokens

**Default Tier:** DELAY

```bash
curl -s -X POST http://localhost:3100/v1/actions/polymarket_ctf/pm_split_position \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -H 'Content-Type: application/json' \
  -d '{
    "walletId": "WALLET_ID",
    "params": {
      "conditionId": "CONDITION_ID",
      "amount": "100"
    }
  }'
```

### pm_merge_positions -- Merge Outcome Tokens to USDC

**Default Tier:** DELAY

Same params as pm_split_position.

### pm_redeem_positions -- Redeem Winning Tokens

**Default Tier:** INSTANT (post-resolution, no risk)

```bash
curl -s -X POST http://localhost:3100/v1/actions/polymarket_ctf/pm_redeem_positions \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -H 'Content-Type: application/json' \
  -d '{
    "walletId": "WALLET_ID",
    "params": {
      "conditionId": "CONDITION_ID"
    }
  }'
```

### pm_approve_collateral -- Approve USDC.e for CTF

**Default Tier:** INSTANT

### pm_approve_ctf -- Approve CTF ERC-1155

**Default Tier:** INSTANT

## 4. Query Endpoints

### GET /v1/wallets/{walletId}/polymarket/positions -- List Positions

```bash
curl -s http://localhost:3100/v1/wallets/${WALLET_ID}/polymarket/positions \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

### GET /v1/wallets/{walletId}/polymarket/orders -- List Orders

```bash
curl -s "http://localhost:3100/v1/wallets/${WALLET_ID}/polymarket/orders?status=LIVE" \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter: LIVE, MATCHED, CANCELLED |

### GET /v1/wallets/{walletId}/polymarket/balance -- Token Balance

```bash
curl -s http://localhost:3100/v1/wallets/${WALLET_ID}/polymarket/balance \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

### GET /v1/wallets/{walletId}/polymarket/pnl -- PnL Summary

```bash
curl -s http://localhost:3100/v1/wallets/${WALLET_ID}/polymarket/pnl \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

### GET /v1/polymarket/markets -- Browse Markets

```bash
curl -s "http://localhost:3100/v1/polymarket/markets?keyword=election&limit=10" \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

| Param | Type | Description |
|-------|------|-------------|
| `keyword` | string | Search query |
| `category` | string | Category filter |
| `limit` | number | Max results |

### GET /v1/polymarket/markets/{conditionId} -- Market Detail

```bash
curl -s http://localhost:3100/v1/polymarket/markets/${CONDITION_ID} \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

### GET /v1/polymarket/events -- List Events

```bash
curl -s http://localhost:3100/v1/polymarket/events \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

## 5. Workflow Examples

### Workflow 1: Search Market and Buy

1. Search markets: `GET /v1/polymarket/markets?keyword=election`
2. Get market detail: `GET /v1/polymarket/markets/{conditionId}`
3. Setup (first time): `POST /v1/wallets/{id}/polymarket/setup`
4. Buy outcome tokens: `POST /v1/actions/polymarket_order/pm_buy`
5. Check position: `GET /v1/wallets/{id}/polymarket/positions`

### Workflow 2: Redeem Resolved Market

1. Check positions: `GET /v1/wallets/{id}/polymarket/positions`
2. Find resolved positions with `resolved: true`
3. Redeem: `POST /v1/actions/polymarket_ctf/pm_redeem_positions`
4. Verify balance: `GET /v1/wallets/{id}/polymarket/balance`

### Workflow 3: Position Management

1. View PnL: `GET /v1/wallets/{id}/polymarket/pnl`
2. Sell losing position: `POST /v1/actions/polymarket_order/pm_sell`
3. Cancel pending orders: `POST /v1/actions/polymarket_order/pm_cancel_all`

## 6. Admin Settings

| Key | Default | Description |
|-----|---------|-------------|
| `actions.polymarket_enabled` | `false` | Enable Polymarket integration |
| `actions.polymarket_default_fee_bps` | `0` | Default maker/taker fee (basis points) |
| `actions.polymarket_order_expiry_seconds` | `86400` | Order expiry (24h default) |
| `actions.polymarket_max_position_usdc` | `1000` | Max position size in USDC |
| `actions.polymarket_proxy_wallet` | `false` | Use proxy wallet for CLOB signing |
| `actions.polymarket_neg_risk_enabled` | `true` | Auto-route neg risk markets |
| `actions.polymarket_auto_approve_ctf` | `true` | Auto-approve CTF token allowances |

Admin UI: Navigate to `#/polymarket` > Settings tab.

## 7. MCP Tools

8 query tools registered in MCP server:

- `waiaas_pm_get_positions` -- Get wallet positions
- `waiaas_pm_get_orders` -- Get wallet orders
- `waiaas_pm_get_markets` -- Search/browse markets
- `waiaas_pm_get_market_detail` -- Get market detail by condition ID
- `waiaas_pm_get_events` -- List prediction events
- `waiaas_pm_get_balance` -- Get CTF token balance
- `waiaas_pm_get_pnl` -- Get PnL summary
- `waiaas_pm_setup` -- Create API keys for wallet

## 8. SDK Methods

15 convenience methods on WAIaaSClient:

**Actions:** `pmBuy`, `pmSell`, `pmCancelOrder`, `pmCancelAll`, `pmUpdateOrder`, `pmSplitPosition`, `pmMergePositions`, `pmRedeemPositions`

**Queries:** `pmGetPositions`, `pmGetOrders`, `pmGetMarkets`, `pmGetMarketDetail`, `pmGetBalance`, `pmGetPnl`, `pmSetup`

## 9. Notes

- **Polygon only** -- All Polymarket operations require a wallet on `polygon-mainnet`. Other networks will return INVALID_NETWORK error.
- **USDC.e collateral** -- Polymarket uses USDC.e (bridged USDC on Polygon) as collateral for all trades.
- **Neg Risk routing** -- Markets with neg risk flag are automatically routed to the NegRiskCTFExchange contract.
- **Spending limits** -- `pm_buy` spending (price * size in USDC) is evaluated against SPENDING_LIMIT policies. `pm_sell`, `pm_cancel_*` have zero spending.
- **connect-info** -- When `actions.polymarket_enabled = true`, the `polymarket` capability is included in `GET /v1/connect-info` for agent self-discovery.

## 10. Related Skill Files

- **actions.skill.md** -- Action Provider framework, policy integration
- **wallet.skill.md** -- Wallet CRUD, sessions
- **policies.skill.md** -- SPENDING_LIMIT, CONTRACT_WHITELIST
- **admin.skill.md** -- Admin Settings management
