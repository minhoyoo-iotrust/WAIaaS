---
name: "WAIaaS Quickset"
description: "End-to-end quickset: create wallet, session, check balance, send first transfer"
category: "api"
tags: [wallet, blockchain, solana, ethereum, quickset, quickstart, waiass]
version: "1.8.0"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Quickset

WAIaaS (Wallet-as-a-Service for AI Agents) is a self-hosted local daemon that lets AI agents execute on-chain transactions on Solana and Ethereum with policy-based security controls. This guide walks through the complete workflow from creating your first wallet to sending a transaction.

## Base URL

```
http://localhost:3100
```

All endpoints use this base. The daemon runs locally on port 3100 by default.

## Authentication Model

WAIaaS uses two authentication methods:

| Auth Type | Header | Used For |
|-----------|--------|----------|
| **masterAuth** | `X-Master-Password: <password>` | Wallet creation, session creation, wallet listing, token registry, MCP provisioning, admin |
| **sessionAuth** | `Authorization: Bearer <token>` | Balance queries, transactions, wallet updates/deletion, session renewal |

- **masterAuth** is for administrative operations. The master password is set in `config.toml` or via `WAIAAS_SECURITY_MASTER_PASSWORD` env var.
- **sessionAuth** is for wallet-scoped operations. You get a JWT token by creating a session (Step 3 below). Each session is bound to one wallet.

## Step-by-Step Workflow

### Step 1: Health Check

Verify the daemon is running. No authentication required.

```bash
curl -s http://localhost:3100/health
```

Response:
```json
{
  "status": "ok",
  "version": "1.8.0",
  "latestVersion": null,
  "updateAvailable": false,
  "schemaVersion": 16,
  "uptime": 42,
  "timestamp": 1707000000
}
```

### Step 2: Create a Wallet

Create a new wallet with a key pair. Requires **masterAuth**. Each wallet belongs to an **environment** (testnet or mainnet) which determines the available networks.

**Solana wallet (default):**

```bash
curl -s -X POST http://localhost:3100/v1/wallets \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{"name": "my-first-wallet", "chain": "solana", "environment": "testnet"}'
```

**EVM wallet (Ethereum):**

```bash
curl -s -X POST http://localhost:3100/v1/wallets \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{"name": "my-eth-wallet", "chain": "ethereum", "environment": "testnet"}'
```

Parameters:
- `name` (required): 1-100 characters
- `chain` (optional): `"solana"` (default) or `"ethereum"`
- `environment` (optional): `"testnet"` (default) or `"mainnet"` -- determines available networks
- `createSession` (optional): boolean, default `true` -- auto-creates a session and includes it in the response

Response (201):
```json
{
  "id": "01958f3a-1234-7000-8000-abcdef123456",
  "name": "my-first-wallet",
  "chain": "solana",
  "network": "devnet",
  "environment": "testnet",
  "publicKey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "status": "ACTIVE",
  "createdAt": 1707000000,
  "session": {
    "id": "01958f3b-5678-7000-8000-abcdef654321",
    "token": "wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": 1709592000
  }
}
```

The `network` field shows the wallet's default network, automatically assigned based on the chain and environment. For Solana testnet, the default is `devnet`. For Ethereum testnet, the default is `ethereum-sepolia`.

The `session` field contains the auto-created session token. Save the `token` value -- use it as `Authorization: Bearer <token>` for all wallet operations below. To skip auto-session creation, set `createSession: false`.

### Step 3: Create Additional Sessions (Optional)

A session is already created in Step 2. Use this only if you need additional sessions. Requires **masterAuth**.

```bash
curl -s -X POST http://localhost:3100/v1/sessions \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{"walletId": "01958f3a-1234-7000-8000-abcdef123456", "ttl": 2592000}'
```

Parameters:
- `walletId` (required): UUID of the wallet from Step 2
- `ttl` (optional): session lifetime in seconds, 300-31536000 (default: 2592000 = 30 days)

Response (201):
```json
{
  "id": "01958f3b-5678-7000-8000-abcdef654321",
  "token": "wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": 1709592000,
  "walletId": "01958f3a-1234-7000-8000-abcdef123456"
}
```

### Step 4: Check Balance

Get the native token balance (SOL for Solana, ETH for Ethereum). Requires **sessionAuth**.

```bash
curl -s http://localhost:3100/v1/wallet/balance \
  -H 'Authorization: Bearer wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

Optional: Append `?network=<network>` to query a specific network (defaults to the wallet's default network).

Response:
```json
{
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "chain": "solana",
  "network": "devnet",
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "balance": "1000000000",
  "decimals": 9,
  "symbol": "SOL"
}
```

Note: `balance` is in the smallest unit. For SOL, divide by 10^9 (1000000000 lamports = 1 SOL). For ETH, divide by 10^18.

### Step 5: Check All Assets

Get all assets including native token and SPL/ERC-20 tokens. Requires **sessionAuth**.

```bash
curl -s http://localhost:3100/v1/wallet/assets \
  -H 'Authorization: Bearer wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

Optional: Append `?network=<network>` to query a specific network (defaults to the wallet's default network).

Response:
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
      "balance": "1000000000",
      "decimals": 9,
      "isNative": true,
      "usdValue": 150.25
    },
    {
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "symbol": "USDC",
      "name": "USD Coin",
      "balance": "5000000",
      "decimals": 6,
      "isNative": false
    }
  ]
}
```

### Step 6: Send First Transfer

Send native tokens (SOL/ETH) to a recipient address. Requires **sessionAuth**.

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -d '{
    "type": "TRANSFER",
    "to": "9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde",
    "amount": "100000000"
  }'
```

Parameters:
- `type` (required): `"TRANSFER"` for native token transfers
- `to` (required): recipient wallet address
- `amount` (required): string of digits in smallest unit (lamports for SOL, wei for ETH)
- `memo` (optional): max 256 characters
- `network` (optional): target network for this transaction (defaults to wallet's default network)

Response (201):
```json
{
  "id": "01958f3c-9999-7000-8000-abcdef999999",
  "status": "PENDING"
}
```

The transaction is submitted to a 6-stage pipeline. It will move from `PENDING` through to `CONFIRMED` or `FAILED`.

### Step 7: Check Transaction Status

Poll the transaction to see if it confirmed on-chain. Requires **sessionAuth**.

```bash
curl -s http://localhost:3100/v1/transactions/01958f3c-9999-7000-8000-abcdef999999 \
  -H 'Authorization: Bearer wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

Response:
```json
{
  "id": "01958f3c-9999-7000-8000-abcdef999999",
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "type": "TRANSFER",
  "status": "CONFIRMED",
  "tier": "INSTANT",
  "chain": "solana",
  "network": "devnet",
  "toAddress": "9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde",
  "amount": "100000000",
  "txHash": "5UfD...abc",
  "error": null,
  "createdAt": 1707000001
}
```

Transaction status values:
- `PENDING` -- submitted, awaiting processing
- `QUEUED` -- passed validation and policy, awaiting execution
- `CONFIRMED` -- confirmed on-chain
- `FAILED` -- execution or confirmation failed
- `CANCELLED` -- cancelled by wallet or owner

## CLI Quickset (Alternative)

If you have the CLI installed, create wallets in one step:

```bash
waiaas quickset --mode testnet
```

This creates Solana + EVM wallets and prints MCP configuration.

## Error Handling

All API errors return a consistent JSON format:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable description",
  "retryable": false,
  "details": {},
  "requestId": "01958f3d-aaaa-7000-8000-bbbbbbbbbbbb",
  "hint": "Suggestion for fixing the issue"
}
```

Common error codes:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `WALLET_NOT_FOUND` | 404 | Wallet ID does not exist |
| `SESSION_EXPIRED` | 401 | Session token has expired -- create a new session |
| `SESSION_NOT_FOUND` | 404 | Session ID does not exist |
| `INSUFFICIENT_BALANCE` | 400 | Wallet does not have enough funds |
| `POLICY_VIOLATION` | 403 | Transaction blocked by a policy rule |
| `CHAIN_ERROR` | 502 | Blockchain RPC error -- check network connectivity |
| `ACTION_VALIDATION_FAILED` | 400 | Request body validation failed |
| `TX_NOT_FOUND` | 404 | Transaction ID does not exist |
| `ENVIRONMENT_NETWORK_MISMATCH` | 400 | Specified network does not belong to wallet's environment |

## Next Steps

- **wallet.skill.md** -- Complete wallet CRUD, asset queries, session management, token registry, MCP provisioning
- **transactions.skill.md** -- All 5 transaction types (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH) with full parameters
- **policies.skill.md** -- Policy management (spending limits, whitelists, rate limits, approval tiers)
- **admin.skill.md** -- Admin operations (kill switch, status, settings, notifications)
