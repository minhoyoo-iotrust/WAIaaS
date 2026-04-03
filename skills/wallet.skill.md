---
name: "WAIaaS Wallet Management"
description: "Wallet queries, asset balances, session info, token list"
category: "api"
tags: [wallet, blockchain, solana, ethereum, ripple, xrp, xrpl, sessions, tokens, waiass]
version: "2.5.0-rc"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Wallet Management

Reference for wallet queries, asset balances, session renewal, and token list. All endpoints use base URL `http://localhost:3100`.

> AI agents must NEVER request the master password. Use only your session token.

> 관리자 설정(지갑 생성, 세션 생성, Owner 설정, 토큰 등록, MCP 프로비저닝)은 docs/admin-manual/ 을 참조하세요.

## Permissions

### Agent (sessionAuth) -- AI agents use these
- Query wallet balance, assets, address, nonce, and info
- Send transactions via transaction endpoints (see transactions.skill.md)
- Get registered tokens via `GET /v1/tokens`
- Get applied policies via `GET /v1/policies`
- Query NFT holdings via `GET /v1/wallet/nfts` (see nft.skill.md)
- Renew session tokens via `PUT /v1/sessions/{id}/renew`
- WalletConnect pairing and status via session-scoped endpoints

## Amount Units

For `amount` and `humanAmount` usage in transactions, see **transactions.skill.md** section "Amount Units". Use `humanAmount` for human-readable values (e.g., `"1.5"` for 1.5 ETH); use `amount` for smallest-unit values (e.g., `"1500000000000000000"` wei). These are mutually exclusive (XOR).

## 1. Multi-Wallet Operations

When your session has multiple wallets, you can target a specific wallet:
- GET requests: add `?walletId=<id>` query parameter
- POST requests: add `walletId` field in request body
- Omitting walletId auto-resolves when session has a single wallet

Example:
```bash
GET /v1/wallet/balance?walletId=wallet-abc
POST /v1/transactions/send { "walletId": "wallet-abc", "to": "...", "amount": "..." }
```

### Self-Discovery via connect-info

Call `GET /v1/connect-info` (sessionAuth) to discover all accessible wallets, policies, and capabilities:

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H 'Authorization: Bearer <session-token>'
```

Returns wallets with their addresses and chains, applicable policies per wallet, available capabilities (transfer, token_transfer, balance, assets, sign, actions, x402, erc8004, erc8128, smart_account), and an AI-ready prompt.

## 2. Wallet Query (Session-Scoped)

These endpoints operate on the wallet bound to the session token (or the specified walletId). Require **sessionAuth**.

### GET /v1/wallet/address -- Get Wallet Address

```bash
curl -s http://localhost:3100/v1/wallet/address \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Response (200):
```json
{
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "chain": "solana",
  "network": "solana-devnet",
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}
```

### GET /v1/wallet/balance -- Get Native Balance

Returns native token balance (SOL, ETH/MATIC/etc., or XRP).

```bash
curl -s http://localhost:3100/v1/wallet/balance \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Query a specific network by appending `?network=devnet`. Accepts plain string (e.g., `"ethereum-mainnet"`) or CAIP-2 (e.g., `"eip155:1"`). Required for EVM wallets; auto-resolved for Solana.

Response (200):
```json
{
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "chain": "solana",
  "network": "solana-devnet",
  "chainId": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "balance": "2500000000",
  "decimals": 9,
  "symbol": "SOL"
}
```

Note: `balance` is in the smallest unit. Divide by `10^decimals` for human-readable value:
- SOL: divide by 10^9 (1 SOL = 1,000,000,000 lamports)
- ETH: divide by 10^18 (1 ETH = 1,000,000,000,000,000,000 wei)

### GET /v1/wallet/balance?network=all -- Get All Network Balances

Returns native balances for all networks in the wallet's environment. Uses `Promise.allSettled` so partial RPC failures return error entries for failed networks.

```bash
curl -s 'http://localhost:3100/v1/wallet/balance?network=all' \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Response (200):
```json
{
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "chain": "ethereum",
  "environment": "testnet",
  "balances": [
    { "network": "ethereum-sepolia", "balance": "500000000000000000", "decimals": 18, "symbol": "ETH" },
    { "network": "polygon-amoy", "balance": "1200000000000000000", "decimals": 18, "symbol": "POL" },
    { "network": "arbitrum-sepolia", "error": "RPC timeout" }
  ]
}
```

### GET /v1/wallet/assets -- Get All Assets

Returns all assets: native token + SPL tokens (Solana) or ERC-20 tokens (Ethereum).

```bash
curl -s http://localhost:3100/v1/wallet/assets \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Query a specific network by appending `?network=devnet`. Required for EVM wallets; auto-resolved for Solana.

Response (200):
```json
{
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "chain": "solana",
  "network": "solana-devnet",
  "chainId": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "assets": [
    {
      "mint": "So11111111111111111111111111111111111111112",
      "symbol": "SOL",
      "name": "Solana",
      "balance": "2500000000",
      "decimals": 9,
      "isNative": true,
      "usdValue": 375.50,
      "assetId": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501"
    },
    {
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "symbol": "USDC",
      "name": "USD Coin",
      "balance": "10000000",
      "decimals": 6,
      "isNative": false,
      "assetId": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    }
  ]
}
```

### GET /v1/wallet/assets?network=all -- Get All Network Assets

Returns token assets for all networks in the wallet's environment.

```bash
curl -s 'http://localhost:3100/v1/wallet/assets?network=all' \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

### Display Currency Support

Balance and assets endpoints accept an optional `?display_currency=KRW` query parameter to include converted amounts in the preferred fiat currency.

| Endpoint | Response Fields |
|----------|-----------------|
| `GET /v1/wallet/balance` | `displayBalance`, `displayCurrency` |
| `GET /v1/wallet/assets` | `assets[].displayValue`, `displayCurrency` |

### GET /v1/tokens -- List Registered Tokens (sessionAuth)

```bash
curl -s 'http://localhost:3100/v1/tokens?network=ethereum-mainnet' \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Returns the token registry for the specified network. Token sources: `builtin` (pre-configured) or `custom` (admin-added).

## 3. Session Renewal

### PUT /v1/sessions/{id}/renew -- Renew Session (sessionAuth)

Renew a session token before it expires. Must use the session's own token.

```bash
curl -s -X PUT http://localhost:3100/v1/sessions/01958f3b-5678-7000-8000-abcdef654321/renew \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Response (200):
```json
{
  "id": "01958f3b-5678-7000-8000-abcdef654321",
  "token": "wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9_NEW...",
  "expiresAt": 1707172800,
  "renewalCount": 1
}
```

Safety checks: 50% TTL must have elapsed, max 30 renewals, 30-day absolute lifetime, token hash CAS to prevent replay.

## 4. Auth Nonce

Public endpoint (no auth required). Returns a nonce for owner signature verification (SIWS for Solana, SIWE for Ethereum).

### GET /v1/nonce -- Get Nonce

```bash
curl -s http://localhost:3100/v1/nonce
```

Response (200):
```json
{
  "nonce": "a1b2c3d4e5f6...",
  "expiresAt": 1707000300
}
```

## 5. Multi-Chain Notes

### Environment-Network Reference

| Chain | Environment | Available Networks |
|-------|-------------|-------------------|
| `solana` | `testnet` | `solana-devnet`, `solana-testnet` |
| `solana` | `mainnet` | `solana-mainnet` |
| `ethereum` | `testnet` | `ethereum-sepolia`, `polygon-amoy`, `arbitrum-sepolia`, `optimism-sepolia`, `base-sepolia` |
| `ethereum` | `mainnet` | `ethereum-mainnet`, `polygon-mainnet`, `arbitrum-mainnet`, `optimism-mainnet`, `base-mainnet` |

### Key Differences

| Feature | Solana | EVM (Ethereum) |
|---------|--------|----------------|
| Key type | Ed25519 | secp256k1 |
| Address format | Base58 (32-44 chars) | 0x-prefixed hex (42 chars) |
| Native token | SOL (9 decimals) | ETH (18 decimals) |
| Token standard | SPL / Token-2022 | ERC-20 |
| Token registry | N/A (auto-discovered) | Required for getAssets |
| Batch transactions | Supported | Not supported (BATCH_NOT_SUPPORTED) |
| Owner signature | SIWS (Sign-In With Solana) | SIWE (Sign-In With Ethereum) |

## 6. MCP Tools Reference

The MCP server exposes tools for AI agents. Key wallet management tools:

### get_balance

Get native token balance. Supports `network` parameter:
- Required for EVM wallets; auto-resolved for Solana
- Accepts plain string (e.g., `"ethereum-mainnet"`) or CAIP-2 (e.g., `"eip155:1"`)
- `"all"`: returns balances for all networks in the wallet's environment

### get_assets

Get all assets (native + tokens). Same `network` parameter support as `get_balance`.

### get_wallet_info

Combined wallet information including address, chain, environment, and all available networks.

## 7. SDK Methods

### TypeScript SDK

```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', sessionToken: 'wai_sess_...' });

// Wallet info
const info = await client.getWalletInfo();

// Get all balances across networks
const allBalances = await client.getAllBalances();

// Get all assets across networks
const allAssets = await client.getAllAssets();
```

### Python SDK

```python
from waiaas import WAIaaSClient

async with WAIaaSClient("http://localhost:3100", "wai_sess_...") as client:
    # Wallet info
    info = await client.get_wallet_info()

    # Get all balances across networks
    all_balances = await client.get_all_balances()

    # Get all assets across networks
    all_assets = await client.get_all_assets()
```

## 8. Error Reference

| Code | HTTP | Description |
|------|------|-------------|
| `WALLET_NOT_FOUND` | 404 | Wallet ID does not exist |
| `WALLET_TERMINATED` | 410 | Wallet has been terminated |
| `SESSION_NOT_FOUND` | 404 | Session ID does not exist |
| `SESSION_EXPIRED` | 401 | Session JWT has expired |
| `SESSION_REVOKED` | 401 | Session has been revoked |
| `RENEWAL_TOO_EARLY` | 403 | Less than 50% of TTL has elapsed |
| `RENEWAL_LIMIT_REACHED` | 403 | Max 30 renewals exceeded |
| `SESSION_ABSOLUTE_LIFETIME_EXCEEDED` | 403 | 30-day absolute lifetime exceeded |
| `SESSION_RENEWAL_MISMATCH` | 401 | Token hash mismatch (stale token) |
| `ENVIRONMENT_NETWORK_MISMATCH` | 400 | Network not valid for wallet's environment |
| `CHAIN_ERROR` | 502 | Blockchain RPC error |
| `UNAUTHORIZED` | 401 | Missing or invalid auth header |

## 9. WalletConnect Session Management

> **Note:** Wallets using `sdk_push_relay` approval method (e.g., D'CENT preset) do not require WalletConnect.

### REST API Endpoints (sessionAuth)

#### POST /v1/wallet/wc/pair -- Start WC Pairing

```bash
curl -s -X POST http://localhost:3100/v1/wallet/wc/pair \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Response (200):
```json
{
  "uri": "wc:abc123@2?relay-protocol=irn&symKey=xyz...",
  "qrCode": "data:image/png;base64,iVBOR...",
  "expiresAt": 1707000300
}
```

#### GET /v1/wallet/wc/session -- Get WC Session Info

```bash
curl -s http://localhost:3100/v1/wallet/wc/session \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

#### DELETE /v1/wallet/wc/session -- Disconnect WC Session

```bash
curl -s -X DELETE http://localhost:3100/v1/wallet/wc/session \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

#### GET /v1/wallet/wc/pair/status -- Poll Pairing Status

```bash
curl -s http://localhost:3100/v1/wallet/wc/pair/status \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `wc_connect` | Start WalletConnect pairing. Returns URI + QR code. |
| `wc_status` | Get WalletConnect session status. |
| `wc_disconnect` | Disconnect the active WalletConnect session. |

### SDK Methods

```typescript
const pairing = await client.wcConnect();
const session = await client.wcStatus();
const result = await client.wcDisconnect();
```

## 10. Wallet SDK: Notification Functions

The `@waiaas/wallet-sdk` package provides functions for wallet apps to receive real-time notification events.

### subscribeToNotifications(topic, callback, serverUrl?)

```typescript
import { subscribeToNotifications } from '@waiaas/wallet-sdk';

const subscription = subscribeToNotifications(
  'waiaas-notify-trading-bot',
  (notification) => {
    console.log(notification.eventType);
    console.log(notification.category);
  },
);

subscription.unsubscribe();
```

### Notification Categories

| Category | Events | Priority |
|----------|--------|----------|
| transaction | TX_REQUESTED, TX_CONFIRMED, TX_FAILED, TX_APPROVAL_REQUIRED, ... | 3 (default) |
| policy | POLICY_VIOLATION, CUMULATIVE_LIMIT_WARNING | 3 (default) |
| security_alert | WALLET_SUSPENDED, KILL_SWITCH_ACTIVATED, ... | **5 (urgent)** |
| session | SESSION_EXPIRING_SOON, SESSION_EXPIRED, SESSION_CREATED, ... | 3 (default) |
| owner | OWNER_SET, OWNER_REMOVED, OWNER_VERIFIED | 3 (default) |
| system | DAILY_SUMMARY, LOW_BALANCE, UPDATE_AVAILABLE | 3 (default) |

## 11. Incoming Transactions

Monitor and query incoming (received) transactions. Requires **sessionAuth**.

### GET /v1/wallet/incoming -- List Incoming Transactions

```bash
curl -s http://localhost:3100/v1/wallet/incoming \
  -H 'Authorization: Bearer wai_sess_xxx'
```

Query Parameters: `limit`, `cursor`, `chain`, `network`, `status`, `token`, `from_address`, `since`, `until`, `wallet_id`.

### GET /v1/wallet/incoming/summary -- Incoming Transaction Summary

```bash
curl -s 'http://localhost:3100/v1/wallet/incoming/summary?period=daily' \
  -H 'Authorization: Bearer wai_sess_xxx'
```

### MCP Tools

- **list_incoming_transactions**: List incoming transaction history with filters and pagination.
- **get_incoming_summary**: Get period-based incoming transaction summary.

## 12. DeFi Positions

Query DeFi lending positions and health factor. Requires **sessionAuth**.

### GET /v1/wallet/positions -- Get DeFi Positions

```bash
curl -s http://localhost:3100/v1/wallet/positions \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

### GET /v1/wallet/health-factor -- Get Lending Health Factor

```bash
curl -s http://localhost:3100/v1/wallet/health-factor \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Health factor status: `safe` (>2.0), `warning` (1.5-2.0), `danger` (1.1-1.5), `critical` (<=1.1).

### MCP Tools

| Tool | Description |
|------|-------------|
| `waiaas_get_defi_positions` | Get all DeFi positions for the wallet. |
| `waiaas_get_health_factor` | Get lending health factor. |

## 13. NFT Support

For full NFT documentation, see **nft.skill.md**.

Key capabilities:
- **Query**: List NFTs, get metadata (ERC-721, ERC-1155, Metaplex)
- **Transfer**: `POST /v1/transactions/send` with `type: "NFT_TRANSFER"`
- **Approve**: `POST /v1/transactions/send` with `type: "APPROVE"` and `nft` field

## CAIP-2 Network Identifiers

All `network` parameters accept CAIP-2 format alongside plain strings:

| Plain String | CAIP-2 | Chain |
|---|---|---|
| `ethereum-mainnet` | `eip155:1` | Ethereum |
| `polygon-mainnet` | `eip155:137` | Polygon |
| `arbitrum-mainnet` | `eip155:42161` | Arbitrum |
| `base-mainnet` | `eip155:8453` | Base |
| `optimism-mainnet` | `eip155:10` | Optimism |
| `solana-mainnet` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | Solana |
| `ethereum-sepolia` | `eip155:11155111` | Sepolia |
| `solana-devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | Solana Devnet |
| `xrpl-mainnet` | `xrpl:0` | XRPL Mainnet |
| `xrpl-testnet` | `xrpl:1` | XRPL Testnet |
| `xrpl-devnet` | `xrpl:2` | XRPL Devnet |

## Ripple (XRPL) Wallet Notes

- **Chain**: `ripple`, **Environment**: `testnet` or `mainnet`
- **Networks**: xrpl-mainnet, xrpl-testnet, xrpl-devnet
- **Key algorithm**: Ed25519 (same as Solana)
- **Address format**: r-address (e.g., `rN7n3473SaZBCG4dFL83w7p1W9cgZw6w3c`)
- **Reserve requirement**: 10 XRP base reserve + 2 XRP per owned object (Trust Lines, NFTs, etc.)
- **Smart accounts (ERC-4337)**: NOT supported on ripple chain
- **Assets**: `GET /v1/wallet/assets` returns native XRP + Trust Line tokens for ripple wallets
- **Trust Line tokens**: Token address format is `{currency}.{issuer}` (e.g., `USD.rIssuerAddress`)
- **NFTs**: XLS-20 standard, queried via native RPC (not external indexers)
