---
name: "WAIaaS Wallet Management"
description: "Wallet CRUD, asset queries, session management, token registry, MCP provisioning, owner management"
category: "api"
tags: [wallet, blockchain, solana, ethereum, sessions, tokens, mcp, waiass]
version: "1.5.3"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Wallet Management

Complete reference for wallet CRUD operations, asset queries, session management, token registry, MCP provisioning, and owner management. All endpoints use base URL `http://localhost:3100`.

## 1. Wallet CRUD

All wallet CRUD endpoints require **masterAuth** (`X-Master-Password` header), except `PUT /v1/wallets/{id}` and `DELETE /v1/wallets/{id}` which require **sessionAuth** (`Authorization: Bearer <token>`).

### POST /v1/wallets -- Create Wallet (masterAuth)

Create a new wallet with an auto-generated key pair. Each wallet belongs to an **environment** (testnet or mainnet) which determines the available networks and default network.

```bash
curl -s -X POST http://localhost:3100/v1/wallets \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{"name": "trading-bot", "chain": "solana", "environment": "testnet"}'
```

Parameters:
- `name` (required): string, 1-100 characters
- `chain` (optional): `"solana"` (default) or `"ethereum"`
- `environment` (optional): `"testnet"` (default) or `"mainnet"` -- determines available networks and default network

Response (201):
```json
{
  "id": "01958f3a-1234-7000-8000-abcdef123456",
  "name": "trading-bot",
  "chain": "solana",
  "network": "devnet",
  "environment": "testnet",
  "publicKey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "status": "ACTIVE",
  "createdAt": 1707000000
}
```

The `network` field shows the wallet's default network, automatically derived from `chain` + `environment`.

### GET /v1/wallets -- List Wallets (masterAuth)

```bash
curl -s http://localhost:3100/v1/wallets \
  -H 'X-Master-Password: your-master-password'
```

Response (200):
```json
{
  "items": [
    {
      "id": "01958f3a-1234-7000-8000-abcdef123456",
      "name": "trading-bot",
      "chain": "solana",
      "network": "devnet",
      "environment": "testnet",
      "publicKey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "status": "ACTIVE",
      "createdAt": 1707000000
    }
  ]
}
```

### GET /v1/wallets/{id} -- Wallet Detail (masterAuth)

Returns full wallet info including owner state and default network.

```bash
curl -s http://localhost:3100/v1/wallets/01958f3a-1234-7000-8000-abcdef123456 \
  -H 'X-Master-Password: your-master-password'
```

Response (200):
```json
{
  "id": "01958f3a-1234-7000-8000-abcdef123456",
  "name": "trading-bot",
  "chain": "solana",
  "network": "devnet",
  "environment": "testnet",
  "defaultNetwork": "devnet",
  "publicKey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "status": "ACTIVE",
  "ownerAddress": null,
  "ownerVerified": null,
  "ownerState": "NONE",
  "createdAt": 1707000000,
  "updatedAt": null
}
```

Owner states: `NONE` (no owner set), `GRACE` (owner set, not verified), `LOCKED` (owner verified via SIWS/SIWE signature).

### PUT /v1/wallets/{id} -- Update Wallet Name (sessionAuth)

```bash
curl -s -X PUT http://localhost:3100/v1/wallets/01958f3a-1234-7000-8000-abcdef123456 \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{"name": "renamed-bot"}'
```

Parameters:
- `name` (required): string, 1-100 characters

Response (200): same schema as create wallet response.

### DELETE /v1/wallets/{id} -- Terminate Wallet (sessionAuth)

Terminates a wallet permanently. Cannot be undone.

```bash
curl -s -X DELETE http://localhost:3100/v1/wallets/01958f3a-1234-7000-8000-abcdef123456 \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Response (200):
```json
{
  "id": "01958f3a-1234-7000-8000-abcdef123456",
  "status": "TERMINATED"
}
```

### PUT /v1/wallets/{id}/owner -- Set Owner Address (masterAuth)

Register a human owner address for this wallet. Enables owner-based approval workflows.

```bash
curl -s -X PUT http://localhost:3100/v1/wallets/01958f3a-1234-7000-8000-abcdef123456/owner \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{"owner_address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"}'
```

Parameters:
- `owner_address` (required): blockchain address (Solana base58 or Ethereum 0x-prefixed, EIP-55 normalized)

Response (200):
```json
{
  "id": "01958f3a-1234-7000-8000-abcdef123456",
  "name": "trading-bot",
  "chain": "solana",
  "network": "devnet",
  "environment": "testnet",
  "publicKey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "status": "ACTIVE",
  "ownerAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "ownerVerified": false,
  "updatedAt": 1707000100
}
```

Error: `OWNER_ALREADY_CONNECTED` (409) if wallet is in LOCKED state -- use ownerAuth to change owner.

### PUT /v1/wallets/{id}/default-network -- Change Default Network (masterAuth)

Change the wallet's default network. The new network must be valid for the wallet's environment.

```bash
curl -s -X PUT http://localhost:3100/v1/wallets/01958f3a-1234-7000-8000-abcdef123456/default-network \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{"network": "testnet"}'
```

Parameters:
- `network` (required): new default network identifier. Must be valid for the wallet's chain + environment.

Response (200):
```json
{
  "id": "01958f3a-1234-7000-8000-abcdef123456",
  "defaultNetwork": "testnet",
  "previousNetwork": "devnet"
}
```

Error: `ENVIRONMENT_NETWORK_MISMATCH` (400) if the specified network is not valid for the wallet's environment.

### GET /v1/wallets/{id}/networks -- List Available Networks (masterAuth)

Get all networks available for a wallet based on its chain and environment.

```bash
curl -s http://localhost:3100/v1/wallets/01958f3a-1234-7000-8000-abcdef123456/networks \
  -H 'X-Master-Password: your-master-password'
```

Response (200):
```json
{
  "id": "01958f3a-1234-7000-8000-abcdef123456",
  "chain": "solana",
  "environment": "testnet",
  "defaultNetwork": "devnet",
  "availableNetworks": [
    {"network": "devnet", "isDefault": true},
    {"network": "testnet", "isDefault": false}
  ]
}
```

## 2. Wallet Query (Session-Scoped)

These endpoints operate on the wallet bound to the session token. Require **sessionAuth**.

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
  "network": "devnet",
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}
```

### GET /v1/wallet/balance -- Get Native Balance

Returns native token balance (SOL or ETH/MATIC/etc.).

```bash
curl -s http://localhost:3100/v1/wallet/balance \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Query a specific network by appending `?network=devnet`. Defaults to the wallet's default network.

Response (200):
```json
{
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "chain": "solana",
  "network": "devnet",
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

Returns native balances for all networks in the wallet's environment. Useful for getting a complete picture across all chains in one call. Uses `Promise.allSettled` so partial RPC failures return error entries for failed networks while successful networks still return data.

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

Each entry either has `balance`/`decimals`/`symbol` (success) or `error` (failure).

### GET /v1/wallet/assets -- Get All Assets

Returns all assets: native token + SPL tokens (Solana) or ERC-20 tokens (Ethereum).

```bash
curl -s http://localhost:3100/v1/wallet/assets \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Query a specific network by appending `?network=devnet`. Defaults to the wallet's default network.

Response (200):
```json
{
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "chain": "solana",
  "network": "devnet",
  "assets": [
    {
      "mint": "So11111111111111111111111111111111111111112",
      "symbol": "SOL",
      "name": "Solana",
      "balance": "2500000000",
      "decimals": 9,
      "isNative": true,
      "usdValue": 375.50
    },
    {
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "symbol": "USDC",
      "name": "USD Coin",
      "balance": "10000000",
      "decimals": 6,
      "isNative": false
    }
  ]
}
```

For EVM wallets, assets include ERC-20 tokens from the token registry and ALLOWED_TOKENS policy.

### GET /v1/wallet/assets?network=all -- Get All Network Assets

Returns token assets for all networks in the wallet's environment. Same partial failure handling as balance.

```bash
curl -s 'http://localhost:3100/v1/wallet/assets?network=all' \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Response (200):
```json
{
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "chain": "ethereum",
  "environment": "testnet",
  "networkAssets": [
    {
      "network": "ethereum-sepolia",
      "assets": [
        { "mint": "0x0", "symbol": "ETH", "name": "Ether", "balance": "500000000000000000", "decimals": 18, "isNative": true }
      ]
    },
    { "network": "polygon-amoy", "error": "RPC timeout" }
  ]
}
```

### Display Currency Support

Balance and assets endpoints accept an optional `?display_currency=KRW` query parameter to include converted amounts in the preferred fiat currency.

| Endpoint | Response Fields |
|----------|-----------------|
| `GET /v1/wallet/balance` | `displayBalance`, `displayCurrency` |
| `GET /v1/wallet/assets` | `assets[].displayValue`, `displayCurrency` |

If `display_currency` is omitted, the server's configured display currency (Admin Settings > Display Currency) is used.

Example:
```bash
curl -s 'http://localhost:3100/v1/wallet/balance?display_currency=JPY' \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Response:
```json
{
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "chain": "solana",
  "network": "devnet",
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "balance": "2500000000",
  "decimals": 9,
  "symbol": "SOL",
  "displayBalance": null,
  "displayCurrency": "JPY"
}
```

Note: `displayBalance` requires price oracle data and may be `null` when unavailable. For assets, `displayValue` converts the `usdValue` field when available.

#### MCP Tools

The following MCP tools support an optional `display_currency` parameter:
- `get_balance` -- includes `displayBalance`/`displayCurrency` in response
- `get_assets` -- includes `assets[].displayValue`/`displayCurrency` in response

### PUT /v1/wallet/default-network -- Change Default Network (sessionAuth)

Session-scoped endpoint to change the wallet's default network. The network must be valid for the wallet's chain + environment.

```bash
curl -s -X PUT http://localhost:3100/v1/wallet/default-network \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{"network": "polygon-amoy"}'
```

Parameters:
- `network` (required): new default network identifier

Response (200):
```json
{
  "id": "01958f3a-1234-7000-8000-abcdef123456",
  "defaultNetwork": "polygon-amoy",
  "previousNetwork": "ethereum-sepolia"
}
```

Error: `ENVIRONMENT_NETWORK_MISMATCH` (400) if the specified network is not valid for the wallet's environment.

## 3. Session Management

Session creation and listing require **masterAuth**. Revocation requires **masterAuth**. Renewal requires **sessionAuth** (the session's own token).

### POST /v1/sessions -- Create Session (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/sessions \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{"walletId": "01958f3a-1234-7000-8000-abcdef123456", "ttl": 86400}'
```

Parameters:
- `walletId` (required): UUID of the wallet
- `ttl` (optional): session lifetime in seconds, 300-604800 (default: 86400 = 24 hours)
- `constraints` (optional): custom constraints object

Response (201):
```json
{
  "id": "01958f3b-5678-7000-8000-abcdef654321",
  "token": "wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": 1707086400,
  "walletId": "01958f3a-1234-7000-8000-abcdef123456"
}
```

Error: `SESSION_LIMIT_EXCEEDED` (403) if wallet has too many active sessions.

### GET /v1/sessions -- List Active Sessions (masterAuth)

```bash
curl -s 'http://localhost:3100/v1/sessions?walletId=01958f3a-1234-7000-8000-abcdef123456' \
  -H 'X-Master-Password: your-master-password'
```

Query parameters:
- `walletId` (required): UUID to filter sessions by wallet

Response (200):
```json
[
  {
    "id": "01958f3b-5678-7000-8000-abcdef654321",
    "walletId": "01958f3a-1234-7000-8000-abcdef123456",
    "status": "ACTIVE",
    "renewalCount": 0,
    "maxRenewals": 30,
    "expiresAt": 1707086400,
    "absoluteExpiresAt": 1709592000,
    "createdAt": 1707000000,
    "lastRenewedAt": null
  }
]
```

### DELETE /v1/sessions/{id} -- Revoke Session (masterAuth)

```bash
curl -s -X DELETE http://localhost:3100/v1/sessions/01958f3b-5678-7000-8000-abcdef654321 \
  -H 'X-Master-Password: your-master-password'
```

Response (200):
```json
{
  "id": "01958f3b-5678-7000-8000-abcdef654321",
  "status": "REVOKED"
}
```

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

Errors: `RENEWAL_TOO_EARLY` (403), `RENEWAL_LIMIT_REACHED` (403), `SESSION_REVOKED` (401), `SESSION_ABSOLUTE_LIFETIME_EXCEEDED` (403), `SESSION_RENEWAL_MISMATCH` (401).

## 4. Token Registry (EVM Only)

Manage the known token list for EVM networks. Token registry is UX-only -- adding/removing tokens here does NOT affect ALLOWED_TOKENS policy. Requires **masterAuth**.

### GET /v1/tokens?network={network} -- List Tokens

```bash
curl -s 'http://localhost:3100/v1/tokens?network=ethereum-mainnet' \
  -H 'X-Master-Password: your-master-password'
```

Response (200):
```json
{
  "network": "ethereum-mainnet",
  "tokens": [
    {
      "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "symbol": "USDC",
      "name": "USD Coin",
      "decimals": 6,
      "source": "builtin"
    },
    {
      "address": "0xCustomTokenAddress",
      "symbol": "MYT",
      "name": "My Token",
      "decimals": 18,
      "source": "custom"
    }
  ]
}
```

Token sources: `builtin` (pre-configured, 24 tokens across 5 EVM mainnets) or `custom` (user-added).

### POST /v1/tokens -- Add Custom Token (masterAuth)

```bash
curl -s -X POST http://localhost:3100/v1/tokens \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{
    "network": "ethereum-mainnet",
    "address": "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    "symbol": "LINK",
    "name": "Chainlink Token",
    "decimals": 18
  }'
```

Response (201):
```json
{
  "id": "custom-token-id",
  "network": "ethereum-mainnet",
  "address": "0x514910771AF9Ca656af840dff83E8264EcF986CA",
  "symbol": "LINK"
}
```

Error: `ACTION_VALIDATION_FAILED` (400) if token already exists (duplicate address + network).

### DELETE /v1/tokens -- Remove Custom Token (masterAuth)

Only custom tokens can be removed. Builtin tokens cannot be deleted.

```bash
curl -s -X DELETE http://localhost:3100/v1/tokens \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{"network": "ethereum-mainnet", "address": "0x514910771AF9Ca656af840dff83E8264EcF986CA"}'
```

Response (200):
```json
{
  "removed": true,
  "network": "ethereum-mainnet",
  "address": "0x514910771AF9Ca656af840dff83E8264EcF986CA"
}
```

## 5. MCP Token Provisioning (masterAuth)

One-stop provisioning for Claude Desktop MCP integration: creates a session, writes the JWT to a token file, and returns the Claude Desktop config snippet.

### POST /v1/mcp/tokens -- Create MCP Token

```bash
curl -s -X POST http://localhost:3100/v1/mcp/tokens \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{"walletId": "01958f3a-1234-7000-8000-abcdef123456", "expiresIn": 604800}'
```

Parameters:
- `walletId` (required): UUID of the wallet
- `expiresIn` (optional): session TTL in seconds, 300-604800 (default: config session_ttl)

Response (201):
```json
{
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "walletName": "trading-bot",
  "tokenPath": "/home/user/.waiaas/mcp-tokens/01958f3a-1234-7000-8000-abcdef123456",
  "expiresAt": 1707604800,
  "claudeDesktopConfig": {
    "waiaas-trading-bot": {
      "command": "npx",
      "args": ["@waiaas/mcp"],
      "env": {
        "WAIAAS_DATA_DIR": "/home/user/.waiaas",
        "WAIAAS_BASE_URL": "http://127.0.0.1:3100",
        "WAIAAS_WALLET_ID": "01958f3a-1234-7000-8000-abcdef123456",
        "WAIAAS_WALLET_NAME": "trading-bot"
      }
    }
  }
}
```

Copy the `claudeDesktopConfig` object into your Claude Desktop `claude_desktop_config.json` under `mcpServers`.

## 6. Auth Nonce

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

The nonce is a random 32-byte hex string valid for 5 minutes. Used by owner wallets to construct SIWS/SIWE authentication signatures.

## 7. Multi-Chain Notes

### Environment-Network Reference

| Chain | Environment | Default Network | Available Networks |
|-------|-------------|-----------------|-------------------|
| `solana` | `testnet` | `devnet` | `devnet`, `testnet` |
| `solana` | `mainnet` | `mainnet` | `mainnet` |
| `ethereum` | `testnet` | `ethereum-sepolia` | `ethereum-sepolia`, `polygon-amoy`, `arbitrum-sepolia`, `optimism-sepolia`, `base-sepolia` |
| `ethereum` | `mainnet` | `ethereum-mainnet` | `ethereum-mainnet`, `polygon-mainnet`, `arbitrum-mainnet`, `optimism-mainnet`, `base-mainnet` |

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

## 8. MCP Tools Reference

The MCP server exposes 14 tools for AI agents. Key wallet management tools:

### set_default_network

Changes the wallet's default network for subsequent operations (session-scoped).

Parameters:
- `network` (required): New default network identifier (e.g., `polygon-amoy`, `ethereum-sepolia`)

Calls `PUT /v1/wallet/default-network` internally. Returns the updated default network and previous network.

### get_balance

Get native token balance. Supports `network` parameter:
- Omitted: uses wallet default network
- Specific network name: queries that network
- `"all"`: returns balances for all networks in the wallet's environment

### get_assets

Get all assets (native + tokens). Same `network` parameter support as `get_balance`:
- Omitted: uses wallet default network
- Specific network name: queries that network
- `"all"`: returns assets for all networks in the wallet's environment

### get_wallet_info

Combined wallet information including address, chain, environment, and available networks with their default status.

## 9. CLI Commands

### waiaas wallet info

Displays wallet information including chain, environment, address, default network, and all available networks.

```bash
waiaas wallet info
```

### waiaas wallet set-default-network

Changes the wallet's default network.

```bash
waiaas wallet set-default-network polygon-amoy
```

## 10. SDK Methods

### TypeScript SDK

```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', sessionToken: 'wai_sess_...' });

// Wallet info
const info = await client.getWalletInfo();

// Change default network
await client.setDefaultNetwork('polygon-amoy');

// Get all balances across networks
const allBalances = await client.getAllBalances();
// Returns: { walletId, chain, environment, balances: [{ network, balance, decimals, symbol } | { network, error }] }

// Get all assets across networks
const allAssets = await client.getAllAssets();
// Returns: { walletId, chain, environment, networkAssets: [{ network, assets } | { network, error }] }
```

### Python SDK

```python
from waiaas import WAIaaSClient

async with WAIaaSClient("http://localhost:3100", "wai_sess_...") as client:
    # Wallet info
    info = await client.get_wallet_info()

    # Change default network
    await client.set_default_network("polygon-amoy")

    # Get all balances across networks
    all_balances = await client.get_all_balances()

    # Get all assets across networks
    all_assets = await client.get_all_assets()
```

## 11. Error Reference

| Code | HTTP | Description |
|------|------|-------------|
| `WALLET_NOT_FOUND` | 404 | Wallet ID does not exist |
| `WALLET_TERMINATED` | 410 | Wallet has been terminated |
| `SESSION_NOT_FOUND` | 404 | Session ID does not exist |
| `SESSION_EXPIRED` | 401 | Session JWT has expired |
| `SESSION_REVOKED` | 401 | Session has been revoked |
| `SESSION_LIMIT_EXCEEDED` | 403 | Too many active sessions for this wallet |
| `RENEWAL_TOO_EARLY` | 403 | Less than 50% of TTL has elapsed |
| `RENEWAL_LIMIT_REACHED` | 403 | Max 30 renewals exceeded |
| `SESSION_ABSOLUTE_LIFETIME_EXCEEDED` | 403 | 30-day absolute lifetime exceeded |
| `SESSION_RENEWAL_MISMATCH` | 401 | Token hash mismatch (stale token) |
| `OWNER_ALREADY_CONNECTED` | 409 | Owner is LOCKED, use ownerAuth |
| `ENVIRONMENT_NETWORK_MISMATCH` | 400 | Network not valid for wallet's environment |
| `ACTION_VALIDATION_FAILED` | 400 | Request validation failed |
| `CHAIN_ERROR` | 502 | Blockchain RPC error |
| `UNAUTHORIZED` | 401 | Missing or invalid auth header |
