---
name: "WAIaaS Quickset"
description: "End-to-end quickset: create wallet, session, check balance, send first transfer"
category: "api"
tags: [wallet, blockchain, solana, ethereum, ripple, xrp, xrpl, quickset, quickstart, waiass]
version: "2.5.0-rc"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Quickset

WAIaaS (Wallet-as-a-Service for AI Agents) is a self-hosted local daemon that lets AI agents execute on-chain transactions on Solana, Ethereum, and Ripple (XRPL) with policy-based security controls. This guide walks through the complete workflow from creating your first wallet to sending a transaction.

> AI agents must NEVER request the master password. Use only your session token.

> **Preferred setup:** Use `waiaas init --auto-provision` for fully autonomous daemon setup without human interaction. See `setup.skill.md` Option A for the complete auto-provision flow.

## Base URL

```
http://localhost:3100
```

All endpoints use this base. The daemon runs locally on port 3100 by default.

## Authentication Model

WAIaaS uses two authentication methods:

| Auth Type | Header | Used For | Who |
|-----------|--------|----------|-----|
| **masterAuth** | Admin-only (CLI/Admin UI) | Wallet creation, session creation, policy config | **Operator only** |
| **sessionAuth** | `Authorization: Bearer <token>` | Balance queries, transactions, wallet info, session renewal | AI agents |

> AI agents must NEVER request the master password. Use only your session token.

- **masterAuth** is for administrative operations performed by the **Operator** via Admin UI or CLI. See docs/admin-manual/ for details.
- **sessionAuth** is for wallet-scoped operations. AI agents operate exclusively with session tokens (Bearer wai_sess_...).

## Self-Discovery (Recommended First Step)

Call `GET /v1/connect-info` with your session token to discover:
- Which wallets you can access
- What policies apply to each wallet
- Available capabilities (transfer, sign, x402, actions)
- AI-ready prompt with usage instructions

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H 'Authorization: Bearer <session-token>'
```

If using MCP, call the `connect_info` tool instead.

For multi-wallet sessions, specify `wallet_id` parameter to target a specific wallet. Required for multi-wallet sessions; auto-resolved when session has a single wallet.

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

### Step 2: Create Wallet and Session (Operator Action)

The operator creates wallets and sessions using the CLI or Admin UI. This is NOT an agent action.

```bash
# CLI approach (recommended)
waiaas quickset
```

Or the operator uses the Admin UI at `http://localhost:3100/admin`. See docs/admin-manual/setup-guide.md for full setup instructions.

Once the operator provides a session token, save it for all wallet operations below.

### Step 3: Verify Session (Optional)

Response (201):
```json
{
  "id": "01958f3b-5678-7000-8000-abcdef654321",
  "token": "wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": 0,
  "walletId": "01958f3a-1234-7000-8000-abcdef123456"
}
```

### Step 4: Check Balance

Get the native token balance (SOL for Solana, ETH for Ethereum). Requires **sessionAuth**.

```bash
curl -s http://localhost:3100/v1/wallet/balance \
  -H 'Authorization: Bearer wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

Optional: Append `?network=<network>` to query a specific network. Accepts both plain string (e.g., `ethereum-mainnet`) and CAIP-2 format (e.g., `eip155:1`). Required for EVM wallets; auto-resolved for Solana.

Response:
```json
{
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "chain": "solana",
  "network": "solana-mainnet",
  "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "balance": "1000000000",
  "decimals": 9,
  "symbol": "SOL"
}
```

Note: `balance` is in the smallest unit. For SOL, divide by 10^9 (1000000000 lamports = 1 SOL). For ETH, divide by 10^18. For XRP, divide by 10^6 (1000000 drops = 1 XRP).

### Step 5: Check All Assets

Get all assets including native token and SPL/ERC-20 tokens. Requires **sessionAuth**.

```bash
curl -s http://localhost:3100/v1/wallet/assets \
  -H 'Authorization: Bearer wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

Optional: Append `?network=<network>` to query a specific network. Accepts both plain string (e.g., `ethereum-mainnet`) and CAIP-2 format (e.g., `eip155:1`). Required for EVM wallets; auto-resolved for Solana.

Response:
```json
{
  "walletId": "01958f3a-1234-7000-8000-abcdef123456",
  "chain": "solana",
  "network": "solana-mainnet",
  "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
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

#### Preferred: Use humanAmount (human-readable)

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -d '{
    "type": "TRANSFER",
    "to": "9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde",
    "humanAmount": "0.1"
  }'
```

This sends **0.1 SOL**. The server converts to `100000000` lamports automatically.

#### Alternative: Use amount (smallest unit)

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

#### Amount Unit Rules

| Field | Format | Example (0.1 SOL) |
|-------|--------|-------------------|
| `humanAmount` | Human-readable decimal | `"0.1"` |
| `amount` | Smallest unit (lamports/wei) | `"100000000"` |

- `amount` and `humanAmount` are **mutually exclusive** (XOR) -- providing both returns 400 error
- For TOKEN_TRANSFER, the server uses `token.decimals` to convert `humanAmount`
- CLOB providers (Hyperliquid, Drift, Polymarket) use exchange-native units only

Parameters:
- `type` (required): `"TRANSFER"` for native token transfers
- `to` (required): recipient wallet address
- `amount` or `humanAmount` (required): smallest-unit digit string or human-readable decimal string (mutually exclusive)
- `memo` (optional): max 256 characters
- `network`: target network (e.g., `"ethereum-mainnet"` or CAIP-2 `"eip155:1"`). Required for EVM wallets; auto-resolved for Solana.

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
  "network": "solana-mainnet",
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
waiaas quickset
```

This creates Solana + EVM wallets in mainnet mode (default) and prints MCP configuration. Use `--mode testnet` for testnet.

To create a smart account wallet via CLI:

```bash
waiaas wallet create --name my-smart-wallet --chain ethereum --account-type smart
```

## Supported Chains

| Chain | Native Token | Decimals | Networks |
|-------|-------------|----------|----------|
| **Solana** | SOL | 9 | solana-mainnet, solana-testnet, solana-devnet |
| **Ethereum** | ETH/POL/AVAX/BNB | 18 | ethereum-mainnet, ethereum-sepolia, polygon-mainnet, etc. |
| **Ripple (XRPL)** | XRP | 6 | xrpl-mainnet, xrpl-testnet, xrpl-devnet |

### Ripple (XRPL) Quick Example

Create a Ripple wallet (operator action via Admin UI or CLI):
```bash
waiaas wallet create --name xrp-wallet --chain ripple --environment testnet
```

Send XRP transfer (agent action with session token):
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "TRANSFER",
    "to": "rDestinationAddress",
    "humanAmount": "1.0"
  }'
```

Note: For Ripple, the `memo` field supports Destination Tag (numeric string like `"12345"` or JSON `{"destinationTag":12345}`).

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

## CAIP Standard Identifiers (CAIP-2 / CAIP-19)

### CAIP-2: Network Identification

All `network` parameters accept CAIP-2 chain identifiers alongside plain strings:

| Plain String | CAIP-2 | Chain |
|---|---|---|
| `ethereum-mainnet` | `eip155:1` | Ethereum |
| `polygon-mainnet` | `eip155:137` | Polygon |
| `arbitrum-mainnet` | `eip155:42161` | Arbitrum |
| `base-mainnet` | `eip155:8453` | Base |
| `solana-mainnet` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | Solana |
| `xrpl-mainnet` | `xrpl:0` | XRPL Mainnet |
| `xrpl-testnet` | `xrpl:1` | XRPL Testnet |

Example: `?network=eip155:1` is equivalent to `?network=ethereum-mainnet`.

### CAIP-19: Asset Identification

WAIaaS supports CAIP-19 standard asset identifiers for unambiguous cross-chain token identification. When sending token transfers, you can include an `assetId` field in the token object:

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "TOKEN_TRANSFER",
    "to": "9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde",
    "amount": "5000000",
    "token": {
      "address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "decimals": 6,
      "symbol": "USDC",
      "assetId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    }
  }'
```

CAIP-19 format: `{chain_id}/{asset_namespace}:{asset_reference}`
- EVM tokens: `eip155:{chainId}/erc20:{lowercase_address}`
- Solana tokens: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:{base58_address}`
- Native assets: `{chain_id}/slip44:{coin_type}` (ETH=60, SOL=501, POL=966)

### assetId-Only Token Transfer (Recommended)

When using a registered token, you can send with just `assetId` -- the daemon auto-resolves address, decimals, and symbol from the token registry:

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "TOKEN_TRANSFER",
    "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD16",
    "humanAmount": "100",
    "token": {
      "assetId": "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
    }
  }'
```

The `network` is also auto-inferred from the CAIP-2 prefix in `assetId` (here `eip155:1` -> `ethereum-mainnet`).

If using MCP, call the `resolve_asset` tool to look up token metadata from a CAIP-19 assetId before sending.

See **transactions.skill.md** section 13 for the complete CAIP reference.
