---
name: "WAIaaS Transactions"
description: "All 5 transaction types (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH) with lifecycle management"
category: "api"
tags: [wallet, blockchain, solana, ethereum, transactions, waiass]
version: "2.4.0-rc.7"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Transactions

Complete reference for all 5 transaction types, lifecycle management, and policy interaction. All endpoints use base URL `http://localhost:3100`. Transaction endpoints require **sessionAuth** (`Authorization: Bearer <token>`) unless noted otherwise.

## Permissions

### Agent (sessionAuth)
- Send all 5 transaction types via `POST /v1/transactions/send`
- Sign raw transactions via `POST /v1/transactions/sign`
- Query transaction status and history
- Renew session tokens

### Owner (ownerAuth -- SIWS/SIWE)
- Approve pending transactions via `POST /v1/transactions/{id}/approve`
- Reject pending transactions via `POST /v1/transactions/{id}/reject`

**Prerequisite:** Policy types (ALLOWED_TOKENS, CONTRACT_WHITELIST, APPROVED_SPENDERS) must be configured by admin before agents can use TOKEN_TRANSFER, CONTRACT_CALL, and APPROVE transaction types.

## 1. Overview

WAIaaS uses a **discriminatedUnion 5-type** system for transactions. The `type` field in the request body determines which transaction variant to execute:

| Type | Description | Policy Prerequisite |
|------|-------------|---------------------|
| `TRANSFER` | Native token transfer (SOL/ETH) | None required |
| `TOKEN_TRANSFER` | SPL/ERC-20 token transfer | ALLOWED_TOKENS policy |
| `CONTRACT_CALL` | Arbitrary contract invocation | CONTRACT_WHITELIST policy |
| `APPROVE` | Token spending approval | APPROVED_SPENDERS policy |
| `BATCH` | Multiple instructions (Solana only) | Depends on instruction types |
| `X402_PAYMENT` | x402 auto-payment (USDC) | X402_ALLOWED_DOMAINS policy |

All transaction types use `POST /v1/transactions/send` with the appropriate `type` field.

All transaction types accept an optional `network` parameter to specify the target network for the transaction. If omitted, the wallet's default network is used. The specified network must be valid for the wallet's environment.

## 2. Type 1: TRANSFER (Native SOL/ETH)

Transfer native tokens to a recipient address. No policy prerequisite -- subject to SPENDING_LIMIT if configured.

### Request

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "TRANSFER",
    "to": "9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde",
    "amount": "100000000",
    "memo": "payment for service"
  }'
```

Parameters:
- `type` (required): `"TRANSFER"`
- `to` (required): recipient address (base58 for Solana, 0x-hex for EVM)
- `amount` (required): string of digits in smallest unit (lamports for SOL, wei for ETH)
- `memo` (optional): string, max 256 characters
- `network` (optional): target network for this transaction. Defaults to wallet's default network. Must be valid for the wallet's environment.

### Response (201)

```json
{
  "id": "01958f3c-9999-7000-8000-abcdef999999",
  "status": "PENDING"
}
```

### Amount Conversion

| Chain | Unit | Example |
|-------|------|---------|
| Solana | lamports (10^-9 SOL) | `"1000000000"` = 1 SOL |
| Ethereum | wei (10^-18 ETH) | `"1000000000000000000"` = 1 ETH |

## 3. Type 2: TOKEN_TRANSFER (SPL/ERC-20)

Transfer SPL tokens (Solana) or ERC-20 tokens (Ethereum) to a recipient.

### Prerequisite

The token must be whitelisted via an **ALLOWED_TOKENS** policy for the wallet. Without this policy, TOKEN_TRANSFER requests are denied.

```bash
# First, create an ALLOWED_TOKENS policy (masterAuth)
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{
    "walletId": "01958f3a-1234-7000-8000-abcdef123456",
    "type": "ALLOWED_TOKENS",
    "rules": {
      "tokens": [
        {"address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "symbol": "USDC"}
      ]
    },
    "priority": 0,
    "enabled": true
  }'
```

### Request

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
      "symbol": "USDC"
    },
    "memo": "USDC payment"
  }'
```

Parameters:
- `type` (required): `"TOKEN_TRANSFER"`
- `to` (required): recipient address
- `amount` (required): string of digits in token's smallest unit (based on `token.decimals`)
- `token` (required): token metadata object
  - `address` (required): mint address (SPL) or contract address (ERC-20)
  - `decimals` (required): integer, 0-18
  - `symbol` (required): string, 1-10 characters
- `memo` (optional): string, max 256 characters
- `network` (optional): target network for this transaction. Defaults to wallet's default network. Must be valid for the wallet's environment.

## 4. Type 3: CONTRACT_CALL (Arbitrary Contract)

Invoke an arbitrary smart contract. Supports both EVM and Solana program calls.

### Prerequisite

The contract address must be whitelisted via a **CONTRACT_WHITELIST** policy. Default-deny: without this policy, all CONTRACT_CALL requests are rejected.

```bash
# Create a CONTRACT_WHITELIST policy (masterAuth)
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{
    "walletId": "01958f3a-1234-7000-8000-abcdef123456",
    "type": "CONTRACT_WHITELIST",
    "rules": {
      "addresses": ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"]
    },
    "priority": 0,
    "enabled": true
  }'
```

### EVM Contract Call

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "CONTRACT_CALL",
    "to": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    "calldata": "0x095ea7b3000000000000000000000000spenderaddress0000000000000000000000000000000000000000000000000000000000000001",
    "abi": [{"name": "approve", "type": "function", "inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}], "outputs": [{"name": "", "type": "bool"}]}],
    "value": "0"
  }'
```

EVM-specific parameters:
- `type` (required): `"CONTRACT_CALL"`
- `to` (required): contract address (0x-hex)
- `calldata` (optional): hex-encoded calldata (e.g., `"0x095ea7b3..."`)
- `abi` (optional): JSON ABI fragment array for the function being called
- `value` (optional): native token value to send with call, string of digits in wei
- `network` (optional): target network for this transaction. Defaults to wallet's default network. Must be valid for the wallet's environment.

### Solana Program Call

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "CONTRACT_CALL",
    "to": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "instructionData": "base64encodeddata==",
    "accounts": [
      {"pubkey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "isSigner": true, "isWritable": true},
      {"pubkey": "9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde", "isSigner": false, "isWritable": true}
    ]
  }'
```

Solana-specific parameters:
- `programId` (optional): program address
- `instructionData` (optional): base64-encoded instruction data
- `accounts` (optional): array of account metas
  - `pubkey`: account public key
  - `isSigner`: boolean
  - `isWritable`: boolean
- `network` (optional): target network for this transaction. Defaults to wallet's default network. Must be valid for the wallet's environment.

## 5. Type 4: APPROVE (Token Spending Approval)

Approve a spender address to spend tokens on behalf of the wallet. ERC-20 `approve()` on EVM, SPL `delegate` on Solana.

### Prerequisite

The spender must be whitelisted via an **APPROVED_SPENDERS** policy.

```bash
# Create an APPROVED_SPENDERS policy (masterAuth)
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: your-master-password' \
  -d '{
    "walletId": "01958f3a-1234-7000-8000-abcdef123456",
    "type": "APPROVED_SPENDERS",
    "rules": {
      "spenders": ["0xDEFiRouterAddress"]
    },
    "priority": 0,
    "enabled": true
  }'
```

### Request

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "APPROVE",
    "spender": "0xDEFiRouterAddress",
    "token": {
      "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "decimals": 6,
      "symbol": "USDC"
    },
    "amount": "1000000000"
  }'
```

Parameters:
- `type` (required): `"APPROVE"`
- `spender` (required): address allowed to spend tokens
- `token` (required): token metadata object
  - `address` (required): token contract/mint address
  - `decimals` (required): integer, 0-18
  - `symbol` (required): string, 1-10 characters
- `amount` (required): string of digits, max approval amount in token's smallest unit
- `network` (optional): target network for this transaction. Defaults to wallet's default network. Must be valid for the wallet's environment.

## 6. Type 5: BATCH (Multiple Instructions)

Execute multiple instructions in a single transaction. **Solana only** -- EVM returns `BATCH_NOT_SUPPORTED` error.

### Request

```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "type": "BATCH",
    "instructions": [
      {
        "to": "9aE476sH92Vz7DMPyq5WLPkrKWivxeuTKEFKd2sZZcde",
        "amount": "50000000"
      },
      {
        "to": "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
        "amount": "25000000"
      }
    ]
  }'
```

Parameters:
- `type` (required): `"BATCH"`
- `instructions` (required): array of 2-20 instruction objects. Each instruction follows the schema of TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, or APPROVE (without the `type` field)
- `network` (optional): target network for this transaction. Defaults to wallet's default network. Must be valid for the wallet's environment.

Batch instruction examples:

**Native transfers:**
```json
{"to": "address1", "amount": "1000000"}
```

**Token transfers:**
```json
{"to": "address2", "amount": "500000", "token": {"address": "mint", "decimals": 6, "symbol": "USDC"}}
```

**Contract calls:**
```json
{"to": "programId", "programId": "...", "instructionData": "...", "accounts": [...]}
```

Constraints:
- Minimum 2 instructions, maximum 20 instructions
- Solana only -- EVM wallets return error `BATCH_NOT_SUPPORTED`
- Each instruction is subject to its own policy checks

## 7. Transaction Lifecycle

### Status Flow

```
PENDING -> QUEUED -> CONFIRMED
                  -> FAILED
       -> CANCELLED
```

| Status | Description |
|--------|-------------|
| `PENDING` | Submitted, awaiting pipeline processing |
| `QUEUED` | Passed validation and policy, waiting for execution or delay/approval |
| `CONFIRMED` | Successfully confirmed on-chain |
| `FAILED` | Execution or confirmation failed |
| `CANCELLED` | Cancelled by wallet session or rejected by owner |

### X402_PAYMENT Lifecycle

x402 payments follow a simplified lifecycle:

```
PENDING -> CONFIRMED  (payment accepted by resource server)
        -> FAILED     (payment rejected or server error)
        -> CANCELLED  (policy denied before payment)
```

x402 payments are synchronous -- the API call blocks until the payment flow completes. There is no QUEUED state. DELAY tier waits within the HTTP request timeout; APPROVAL tier is immediately rejected.

### Tier Flow (Policy-Based)

The policy engine assigns a tier to each transaction based on configured policies:

| Tier | Behavior |
|------|----------|
| `INSTANT` | Execute immediately, no waiting |
| `NOTIFY` | Execute immediately, send notification to owner |
| `DELAY` | Hold for configurable cooldown period before execution |
| `APPROVAL` | Require explicit owner approval before execution |

### Transaction Query Endpoints

#### GET /v1/transactions/{id} -- Get Transaction Detail (sessionAuth)

```bash
curl -s http://localhost:3100/v1/transactions/01958f3c-9999-7000-8000-abcdef999999 \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Response (200):
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
  "txHash": "5UfDaGz1ycBqAbW2RuVmuT8JcpBBbP2BdAfSLKXjzRYc",
  "error": null,
  "createdAt": 1707000001
}
```

#### GET /v1/transactions -- List Transactions (sessionAuth)

Cursor-based pagination for the wallet's transactions.

```bash
curl -s 'http://localhost:3100/v1/transactions?limit=20' \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Query parameters:
- `limit` (optional): 1-100 (default: 20)
- `cursor` (optional): UUID for pagination (from previous response's `cursor` field)

Response (200):
```json
{
  "items": [
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
      "txHash": "5UfDaGz1ycBqAbW2RuVmuT8JcpBBbP2BdAfSLKXjzRYc",
      "error": null,
      "createdAt": 1707000001
    }
  ],
  "cursor": null,
  "hasMore": false
}
```

#### GET /v1/transactions/pending -- List Pending Transactions (sessionAuth)

Returns only PENDING and QUEUED transactions for the wallet.

```bash
curl -s http://localhost:3100/v1/transactions/pending \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Response (200):
```json
{
  "items": []
}
```

### Transaction Action Endpoints

#### POST /v1/transactions/{id}/cancel -- Cancel Transaction (sessionAuth)

Cancel a delayed or pending transaction. Only works for transactions in QUEUED status with DELAY tier.

```bash
curl -s -X POST http://localhost:3100/v1/transactions/01958f3c-9999-7000-8000-abcdef999999/cancel \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Response (200):
```json
{
  "id": "01958f3c-9999-7000-8000-abcdef999999",
  "status": "CANCELLED"
}
```

#### POST /v1/transactions/{id}/approve -- Approve Transaction (ownerAuth)

Owner approves a pending-approval transaction. Requires **ownerAuth** (SIWS/SIWE signature via `X-Owner-Signature` header).

```bash
curl -s -X POST http://localhost:3100/v1/transactions/01958f3c-9999-7000-8000-abcdef999999/approve \
  -H 'X-Owner-Signature: <siws-or-siwe-signature>'
```

Response (200):
```json
{
  "id": "01958f3c-9999-7000-8000-abcdef999999",
  "status": "EXECUTING",
  "approvedAt": 1707000100
}
```

#### POST /v1/transactions/{id}/reject -- Reject Transaction (ownerAuth)

Owner rejects a pending-approval transaction. Requires **ownerAuth**.

```bash
curl -s -X POST http://localhost:3100/v1/transactions/01958f3c-9999-7000-8000-abcdef999999/reject \
  -H 'X-Owner-Signature: <siws-or-siwe-signature>'
```

Response (200):
```json
{
  "id": "01958f3c-9999-7000-8000-abcdef999999",
  "status": "CANCELLED",
  "rejectedAt": 1707000100
}
```

## 8. Policy Interaction

Policies control what transactions are allowed and how they are processed. Key policy types affecting transactions:

| Policy Type | Affects | Behavior |
|-------------|---------|----------|
| `SPENDING_LIMIT` | TRANSFER, TOKEN_TRANSFER | Max spend per period (daily/weekly/monthly) |
| `WHITELIST` | All types | Allowed recipient addresses |
| `RATE_LIMIT` | All types | Max transactions per period |
| `TIME_RESTRICTION` | All types | Allowed time windows |
| `ALLOWED_TOKENS` | TOKEN_TRANSFER | Required: whitelist token mints/contracts |
| `CONTRACT_WHITELIST` | CONTRACT_CALL | Required: whitelist contract addresses |
| `METHOD_WHITELIST` | CONTRACT_CALL | Whitelist specific contract methods |
| `APPROVED_SPENDERS` | APPROVE | Required: whitelist spender addresses |
| `APPROVE_AMOUNT_LIMIT` | APPROVE | Max approval amount |
| `APPROVE_TIER_OVERRIDE` | APPROVE | Override tier for approvals |
| `ALLOWED_NETWORKS` | All types | Restrict which networks a wallet can use |

**Default-deny principle**: ALLOWED_TOKENS, CONTRACT_WHITELIST, and APPROVED_SPENDERS must be explicitly configured. Without them, the corresponding transaction types are rejected.

### Tier Assignment

Policies can assign transaction tiers that determine the execution flow:
- No special policy -> `INSTANT` (execute immediately)
- SPENDING_LIMIT exceeded -> `DELAY` (cooldown) or `APPROVAL` (owner must approve)
- Large amounts -> `NOTIFY` (execute + alert owner)

## 9. Error Reference

| Code | HTTP | Description | Recovery |
|------|------|-------------|----------|
| `INSUFFICIENT_BALANCE` | 400 | Not enough funds in wallet | Fund the wallet with more tokens |
| `POLICY_VIOLATION` | 403 | Transaction blocked by policy | Check policies with GET /v1/policies, adjust or remove blocking policy |
| `CHAIN_ERROR` | 502 | Blockchain RPC failure | Retry after a short delay; check RPC endpoint health |
| `TX_NOT_FOUND` | 404 | Transaction ID does not exist | Verify the transaction ID |
| `ACTION_VALIDATION_FAILED` | 400 | Request body validation failed | Check required fields and types |
| `WALLET_NOT_FOUND` | 404 | Wallet ID does not exist | Verify wallet exists with GET /v1/wallets |
| `BATCH_NOT_SUPPORTED` | 400 | BATCH type used on EVM wallet | Use individual transactions for EVM chains |
| `CONTRACT_NOT_WHITELISTED` | 403 | Contract address not in whitelist | Add contract to CONTRACT_WHITELIST policy |
| `TOKEN_NOT_ALLOWED` | 403 | Token not in allowed list | Add token to ALLOWED_TOKENS policy |
| `SPENDER_NOT_APPROVED` | 403 | Spender not in approved list | Add spender to APPROVED_SPENDERS policy |
| `ENVIRONMENT_NETWORK_MISMATCH` | 400 | Specified network does not belong to wallet's environment | Use a network valid for the wallet's environment |
| `ABI_ENCODING_FAILED` | 400 | Function not found in ABI, or argument type mismatch | Verify ABI fragment contains the function and arguments match expected types |
| `X402_DISABLED` | 403 | x402 payments disabled | Enable in config.toml |
| `X402_DOMAIN_NOT_ALLOWED` | 403 | Domain not in allowed list | Add to X402_ALLOWED_DOMAINS policy |
| `X402_SSRF_BLOCKED` | 403 | URL targets private network | Use public HTTPS URL |
| `X402_UNSUPPORTED_SCHEME` | 400 | No compatible payment scheme | Server must support EIP-3009 or SPL |
| `X402_PAYMENT_REJECTED` | 402 | Payment rejected by server | Check amount and balance |
| `X402_DELAY_TIMEOUT` | 408 | Delay exceeds request timeout | Adjust timeout or limits |
| `X402_APPROVAL_REQUIRED` | 403 | Amount requires owner approval | Lower amount or adjust tiers |
| `X402_SERVER_ERROR` | 502 | Server error after payment | Retry later |

## 10. Display Currency

All transaction query endpoints accept an optional `display_currency` query parameter to convert USD amounts to a preferred fiat currency.

### Supported Endpoints

| Endpoint | Parameter | Response Fields |
|----------|-----------|-----------------|
| `GET /v1/transactions` | `?display_currency=KRW` | `items[].displayAmount`, `items[].displayCurrency` |
| `GET /v1/transactions/{id}` | `?display_currency=KRW` | `displayAmount`, `displayCurrency` |

If `display_currency` is omitted, the server's configured display currency (Admin Settings > Display Currency) is used. If the server setting is USD, no conversion is applied.

### Example

```bash
curl -s 'http://localhost:3100/v1/transactions?display_currency=KRW&limit=5' \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

Response includes converted amounts:
```json
{
  "items": [
    {
      "id": "01958f3c-9999-7000-8000-abcdef999999",
      "amount": "1000000000",
      "displayAmount": "\u2248\u20A9725,000",
      "displayCurrency": "KRW",
      "..."
    }
  ]
}
```

### MCP Tools

The following MCP tools support an optional `display_currency` parameter:
- `get_transaction` -- includes `displayAmount` in response
- `list_transactions` -- includes `displayAmount` per transaction item

## 11. Sign External Transaction (sign-only)

Sign an externally built unsigned transaction after policy evaluation. The signed transaction is returned without being submitted to the blockchain.

### POST /v1/transactions/sign

**Auth:** sessionAuth (Bearer token)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| transaction | string | Yes | Unsigned transaction (base64 for Solana, 0x-hex for EVM) |
| network | string | No | Target network (defaults to wallet default) |

**Response (200):**

| Field | Type | Description |
|-------|------|-------------|
| id | string | Transaction record ID |
| signedTransaction | string | Signed transaction bytes (same encoding as input) |
| txHash | string/null | Transaction hash (null if not computable before submission) |
| operations | array | Parsed operations from the unsigned tx |
| policyResult | object | `{ tier: string }` - policy evaluation tier |

**Operations object:**

| Field | Type | Description |
|-------|------|-------------|
| type | string | NATIVE_TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, UNKNOWN |
| to | string/null | Destination address |
| amount | string/null | Amount in smallest unit |
| token | string/null | Token address (for TOKEN_TRANSFER/APPROVE) |

**Example (Solana):**

```bash
curl -s -X POST http://localhost:3100/v1/transactions/sign \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABhbG9uZQ=="
  }'
```

**Example (EVM):**

```bash
curl -s -X POST http://localhost:3100/v1/transactions/sign \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "transaction": "0x02f86c0180843b9aca00850ba43b7400825208940x...",
    "network": "polygon-mainnet"
  }'
```

**Error Codes:**

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_TRANSACTION` | 400 | Raw transaction parsing failed |
| `WALLET_NOT_SIGNER` | 400 | Wallet is not a signer in the transaction |
| `CHAIN_ID_MISMATCH` | 400 | Transaction chain ID doesn't match network |
| `POLICY_DENIED` | 403 | Policy evaluation denied one or more operations |
| `UNSUPPORTED_TX_TYPE` | 400 | Transaction type not supported |

**SDK Usage:**
- TypeScript: `await client.signTransaction({ transaction: '...', network: 'polygon-mainnet' })`
- Python: `await client.sign_transaction('...', network='polygon-mainnet')`
- MCP tool: `sign_transaction` with `transaction` + optional `network`

**Notes:**
- DELAY/APPROVAL tier transactions are immediately rejected (incompatible with synchronous API)
- Signed results are recorded in the transactions table with type='SIGN', status='SIGNED'
- Amounts are accumulated in reserved_amount to prevent double-spending against SPENDING_LIMIT

## 12. Encode Calldata (EVM Utility)

Encode an EVM function call into hex calldata. This utility helps construct the `calldata` parameter for `CONTRACT_CALL` transactions without needing an ABI encoding library.

### POST /v1/utils/encode-calldata

**Auth:** sessionAuth (Bearer token)

**Request:**

```bash
curl -s -X POST http://localhost:3100/v1/utils/encode-calldata \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "abi": [
      {
        "type": "function",
        "name": "transfer",
        "inputs": [
          { "name": "to", "type": "address" },
          { "name": "amount", "type": "uint256" }
        ],
        "outputs": [{ "name": "", "type": "bool" }],
        "stateMutability": "nonpayable"
      }
    ],
    "functionName": "transfer",
    "args": ["0xRecipientAddress", "1000000"]
  }'
```

**Response (200):**

```json
{
  "calldata": "0xa9059cbb000000000000000000000000recipientaddress0000000000000000000000000000000000000000000000000000000000000f4240",
  "selector": "0xa9059cbb",
  "functionName": "transfer"
}
```

**Errors:**
- `400 ABI_ENCODING_FAILED` -- Function not found in ABI, or argument type mismatch.

**Usage with CONTRACT_CALL:**
1. Encode calldata: `POST /v1/utils/encode-calldata`
2. Send contract call: `POST /v1/transactions/send` with `type: "CONTRACT_CALL"`, `to: contractAddress`, `calldata: encodedHex`

**SDK:**
- TypeScript: `client.encodeCalldata({ abi, functionName, args })`
- Python: `await client.encode_calldata(abi, function_name, args)`

**MCP Tool:** `encode_calldata` with parameters `abi`, `functionName`, `args`
