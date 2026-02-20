---
name: "WAIaaS Policies"
description: "Policy engine CRUD: 12 policy types for spending limits, whitelists, time restrictions, rate limits, token/contract/approve controls, network restrictions, x402 domain controls"
category: "api"
tags: [wallet, blockchain, policies, security, waiass]
version: "2.4.0-rc.1"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Policy Management

Policy engine for enforcing rules on wallet operations. Policies control spending limits, allowed recipients, time windows, rate limits, token whitelists, contract access, approval requirements, and network restrictions.

## Base URL

```
http://localhost:3100
```

## Authentication

All policy endpoints require **sessionAuth** -- include `Authorization: Bearer <token>` header from a session JWT.

---

## 1. Policy CRUD Endpoints

### POST /v1/policies -- Create Policy

Create a new policy. Policies can be wallet-specific (`walletId`) or global (omit `walletId`).

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{
    "walletId": "<wallet-uuid>",
    "type": "SPENDING_LIMIT",
    "rules": {"instant_max": "100000000", "notify_max": "500000000", "delay_max": "1000000000"},
    "priority": 0,
    "enabled": true
  }'
```

**Parameters:**

| Parameter  | Type    | Required | Description                                              |
| ---------- | ------- | -------- | -------------------------------------------------------- |
| `walletId` | UUID    | No       | Target wallet. Omit for global policy (applies to all).  |
| `type`     | string  | Yes      | One of 12 policy types (see below).                      |
| `rules`    | object  | Yes      | Type-specific rules object (see type sections).          |
| `priority` | integer | No       | Higher = more important. Default: 0.                     |
| `enabled`  | boolean | No       | Whether policy is active. Default: true.                 |
| `network`  | string  | No       | Network scope. When set, policy applies only to transactions on this network. Omit for all networks. |

**Response (201):**
```json
{
  "id": "<policy-uuid>",
  "walletId": "<wallet-uuid>",
  "type": "SPENDING_LIMIT",
  "rules": {"instant_max": "100000000", "notify_max": "500000000", "delay_max": "1000000000"},
  "priority": 0,
  "enabled": true,
  "network": null,
  "createdAt": 1707000000,
  "updatedAt": 1707000000
}
```

### GET /v1/policies -- List Policies

List policies. If `walletId` is provided, returns wallet-specific + global policies.

```bash
curl -s 'http://localhost:3100/v1/policies?walletId=<wallet-uuid>' \
  -H 'Authorization: Bearer <token>'
```

**Query Parameters:**

| Parameter  | Type | Required | Description                                           |
| ---------- | ---- | -------- | ----------------------------------------------------- |
| `walletId` | UUID | No       | Filter by wallet. Returns wallet + global policies.   |

**Response (200):** Array of policy objects, ordered by priority descending.

### PUT /v1/policies/{id} -- Update Policy

Update a policy's rules, priority, or enabled state. All fields are optional (partial update).

```bash
curl -s -X PUT http://localhost:3100/v1/policies/<policy-uuid> \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"rules": {"instant_max": "200000000", "notify_max": "1000000000", "delay_max": "2000000000"}, "enabled": true}'
```

**Parameters:**

| Parameter  | Type    | Required | Description                       |
| ---------- | ------- | -------- | --------------------------------- |
| `rules`    | object  | No       | Updated type-specific rules.      |
| `priority` | integer | No       | Updated priority.                 |
| `enabled`  | boolean | No       | Updated enabled state.            |

**Response (200):** Updated policy object.

### DELETE /v1/policies/{id} -- Delete Policy

```bash
curl -s -X DELETE http://localhost:3100/v1/policies/<policy-uuid> \
  -H 'Authorization: Bearer <token>'
```

**Response (200):**
```json
{"id": "<policy-uuid>", "deleted": true}
```

---

## 2. Policy Types (12 Types)

Each policy type has a specific `rules` schema. The `type` field determines which rules structure is required.

### a. SPENDING_LIMIT

Maximum spend per tier. Amounts are digit strings in the chain's smallest unit (lamports for SOL, wei for ETH).

**Rules schema:**
```json
{
  "instant_max": "100000000",
  "notify_max": "500000000",
  "delay_max": "1000000000",
  "delay_seconds": 300,
  "instant_max_usd": 10,
  "notify_max_usd": 100,
  "delay_max_usd": 1000,
  "daily_limit_usd": 500,
  "monthly_limit_usd": 5000
}
```

| Field               | Type   | Required | Description                                          |
| ------------------- | ------ | -------- | ---------------------------------------------------- |
| `instant_max`       | string | Yes      | Max amount for INSTANT tier (digit string).          |
| `notify_max`        | string | Yes      | Max amount for NOTIFY tier (digit string).           |
| `delay_max`         | string | Yes      | Max amount for DELAY tier (digit string).            |
| `delay_seconds`     | number | No       | Cooldown for DELAY tier (seconds). Min 60, default: 900. |
| `instant_max_usd`   | number | No       | Max USD amount for INSTANT tier (oracle-based).      |
| `notify_max_usd`    | number | No       | Max USD amount for NOTIFY tier.                      |
| `delay_max_usd`     | number | No       | Max USD amount for DELAY tier.                       |
| `daily_limit_usd`   | number | No       | Cumulative USD spending limit in 24h rolling window. Exceeding escalates to APPROVAL. |
| `monthly_limit_usd` | number | No       | Cumulative USD spending limit in 30d rolling window. Exceeding escalates to APPROVAL. |

**Tier assignment:** Amount <= instant_max -> INSTANT. Amount <= notify_max -> NOTIFY. Amount <= delay_max -> DELAY. Amount > delay_max -> APPROVAL (requires owner approval). USD tiers (if set) are evaluated via price oracle and take precedence over native amount tiers.

**Cumulative limit evaluation:** After per-transaction tier assignment, if `daily_limit_usd` or `monthly_limit_usd` is set, the engine checks rolling-window cumulative USD spending (confirmed + pending reserved amounts). If cumulative + current transaction exceeds the limit, the tier is escalated to APPROVAL regardless of the per-transaction tier. The `TX_APPROVAL_REQUIRED` notification includes a `reason` field (`per_tx`, `cumulative_daily`, or `cumulative_monthly`).

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"SPENDING_LIMIT","rules":{"instant_max":"100000000","notify_max":"500000000","delay_max":"1000000000","daily_limit_usd":500,"monthly_limit_usd":5000}}'
```

### b. WHITELIST

Allowed recipient addresses. Transactions to addresses not in the list are blocked.

**Rules schema:**
```json
{
  "allowed_addresses": ["<address1>", "<address2>"]
}
```

| Field               | Type     | Required | Description                      |
| ------------------- | -------- | -------- | -------------------------------- |
| `allowed_addresses` | string[] | Yes      | List of allowed recipient addresses. |

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"WHITELIST","rules":{"allowed_addresses":["<addr1>","<addr2>"]}}'
```

### c. TIME_RESTRICTION

Allowed time windows for transactions. Transactions outside the window are blocked.

**Rules schema:**
```json
{
  "allowedHours": {"start": 9, "end": 17},
  "timezone": "UTC"
}
```

| Field          | Type   | Required | Description                                  |
| -------------- | ------ | -------- | -------------------------------------------- |
| `allowedHours` | object | Yes      | `{start: number, end: number}` (0-23 hours). |
| `timezone`     | string | No       | Timezone name. Default: "UTC".               |

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"TIME_RESTRICTION","rules":{"allowedHours":{"start":9,"end":17},"timezone":"UTC"}}'
```

### d. RATE_LIMIT

Maximum number of transactions per time period.

**Rules schema:**
```json
{
  "maxTransactions": 10,
  "period": "hourly"
}
```

| Field             | Type   | Required | Description                                             |
| ----------------- | ------ | -------- | ------------------------------------------------------- |
| `maxTransactions` | number | Yes      | Maximum transactions allowed per period.                 |
| `period`          | string | Yes      | One of: "hourly", "daily", "weekly", "monthly".         |

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"RATE_LIMIT","rules":{"maxTransactions":10,"period":"hourly"}}'
```

### e. ALLOWED_TOKENS (v1.4)

Token whitelist for TOKEN_TRANSFER transactions. **Default deny**: tokens not listed in any ALLOWED_TOKENS policy are blocked.

**Rules schema:**
```json
{
  "tokens": [
    {"address": "<mint-or-contract>", "symbol": "USDC", "chain": "solana"},
    {"address": "<erc20-address>", "symbol": "USDT", "chain": "ethereum"}
  ]
}
```

| Field     | Type   | Required | Description                                      |
| --------- | ------ | -------- | ------------------------------------------------ |
| `tokens`  | array  | Yes      | At least 1 token entry.                          |
| `address` | string | Yes      | Token mint (Solana) or contract address (EVM).   |
| `symbol`  | string | No       | Token symbol for display (e.g., "USDC").         |
| `chain`   | string | No       | "solana" or "ethereum". For documentation only.  |

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"ALLOWED_TOKENS","rules":{"tokens":[{"address":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","symbol":"USDC","chain":"solana"}]}}'
```

### f. CONTRACT_WHITELIST (v1.4)

Contract address whitelist for CONTRACT_CALL transactions. **Default deny**: contracts not listed are blocked.

**Rules schema:**
```json
{
  "contracts": [
    {"address": "<contract-address>", "name": "Uniswap V3 Router", "chain": "ethereum"}
  ]
}
```

| Field      | Type   | Required | Description                               |
| ---------- | ------ | -------- | ----------------------------------------- |
| `contracts`| array  | Yes      | At least 1 contract entry.                |
| `address`  | string | Yes      | Contract address.                         |
| `name`     | string | No       | Contract display name.                    |
| `chain`    | string | No       | "solana" or "ethereum".                   |

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"CONTRACT_WHITELIST","rules":{"contracts":[{"address":"0xE592427A0AEce92De3Edee1F18E0157C05861564","name":"Uniswap V3 Router","chain":"ethereum"}]}}'
```

### g. METHOD_WHITELIST (v1.4)

Allowed contract methods (function selectors) per contract address. Used with CONTRACT_CALL to restrict which functions can be called.

**Rules schema:**
```json
{
  "methods": [
    {"contractAddress": "<addr>", "selectors": ["0xa9059cbb", "0x095ea7b3"]}
  ]
}
```

| Field             | Type     | Required | Description                                    |
| ----------------- | -------- | -------- | ---------------------------------------------- |
| `methods`         | array    | Yes      | At least 1 method entry.                       |
| `contractAddress` | string   | Yes      | Contract address to restrict.                  |
| `selectors`       | string[] | Yes      | 4-byte function selectors (hex, e.g., "0xa9059cbb"). |

Common EVM selectors:
- `0xa9059cbb` -- transfer(address,uint256)
- `0x095ea7b3` -- approve(address,uint256)
- `0x23b872dd` -- transferFrom(address,address,uint256)
- `0x38ed1739` -- swapExactTokensForTokens

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"METHOD_WHITELIST","rules":{"methods":[{"contractAddress":"0xE592427A0AEce92De3Edee1F18E0157C05861564","selectors":["0xa9059cbb","0x095ea7b3"]}]}}'
```

### h. APPROVED_SPENDERS (v1.4)

Allowed spender addresses for APPROVE transactions. **Default deny**: spenders not listed are blocked from receiving token approvals.

**Rules schema:**
```json
{
  "spenders": [
    {"address": "<spender-address>", "name": "Uniswap Router", "maxAmount": "1000000000"}
  ]
}
```

| Field      | Type   | Required | Description                                         |
| ---------- | ------ | -------- | --------------------------------------------------- |
| `spenders` | array  | Yes      | At least 1 spender entry.                           |
| `address`  | string | Yes      | Spender contract/address.                           |
| `name`     | string | No       | Spender display name.                               |
| `maxAmount`| string | No       | Max approval amount (digit string). Optional cap.   |

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"APPROVED_SPENDERS","rules":{"spenders":[{"address":"0xE592427A0AEce92De3Edee1F18E0157C05861564","name":"Uniswap V3 Router","maxAmount":"1000000000000000000"}]}}'
```

### i. APPROVE_AMOUNT_LIMIT (v1.4)

Maximum approval amount and unlimited approval blocking for APPROVE transactions.

**Rules schema:**
```json
{
  "maxAmount": "1000000000",
  "blockUnlimited": true
}
```

| Field            | Type    | Required | Description                                           |
| ---------------- | ------- | -------- | ----------------------------------------------------- |
| `maxAmount`      | string  | No       | Maximum approval amount (digit string).               |
| `blockUnlimited` | boolean | No       | Block unlimited (max uint256) approvals. Default: true.|

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"APPROVE_AMOUNT_LIMIT","rules":{"maxAmount":"1000000000000000000","blockUnlimited":true}}'
```

### j. APPROVE_TIER_OVERRIDE (v1.4)

Force a specific policy tier for all APPROVE transactions. Useful for requiring owner approval on every token approval.

**Rules schema:**
```json
{
  "tier": "APPROVAL"
}
```

| Field  | Type   | Required | Description                                               |
| ------ | ------ | -------- | --------------------------------------------------------- |
| `tier` | string | Yes      | One of: "INSTANT", "NOTIFY", "DELAY", "APPROVAL".        |

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"APPROVE_TIER_OVERRIDE","rules":{"tier":"APPROVAL"}}'
```

### k. ALLOWED_NETWORKS (v1.4.6)

Restrict which networks a wallet can use for transactions. Permissive by default: if no ALLOWED_NETWORKS policy exists, all networks valid for the wallet's environment are allowed.

**Rules schema:**
```json
{
  "networks": [
    {"network": "ethereum-sepolia"},
    {"network": "polygon-amoy", "name": "Polygon Testnet"}
  ]
}
```

| Field      | Type   | Required | Description                            |
| ---------- | ------ | -------- | -------------------------------------- |
| `networks` | array  | Yes      | At least 1 network entry.              |
| `network`  | string | Yes      | Network identifier (e.g., "ethereum-sepolia"). |
| `name`     | string | No       | Display name for the network.          |

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"ALLOWED_NETWORKS","rules":{"networks":[{"network":"ethereum-sepolia"},{"network":"polygon-amoy"}]}}'
```

Note: ALLOWED_NETWORKS is permissive by default (all networks allowed until the first ALLOWED_NETWORKS policy is created for a wallet).

### l. X402_ALLOWED_DOMAINS (v1.5.1)

Allowed domains for x402 automatic payments. **Default deny**: if any X402_ALLOWED_DOMAINS policy exists, x402 payments to unlisted domains are blocked.

**Rules schema:**
```json
{
  "domains": ["api.example.com", "*.openai.com"]
}
```

| Field     | Type     | Required | Description                                  |
| --------- | -------- | -------- | -------------------------------------------- |
| `domains` | string[] | Yes      | At least 1 domain. Glob patterns supported.  |

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"X402_ALLOWED_DOMAINS","rules":{"domains":["api.example.com","*.openai.com"]}}'
```

Note: X402_ALLOWED_DOMAINS is default deny: once any policy of this type exists for a wallet, only listed domains can receive x402 payments.

---

## 3. Policy Evaluation Flow

When a transaction is submitted (`POST /v1/transactions/send`), the policy engine evaluates all applicable policies:

1. **Collect policies** -- All enabled policies for the wallet + global policies, sorted by priority. If a policy has a `network` field set, it applies only to transactions on that specific network. Override priority: wallet+network > wallet+null > global+network > global+null.
2. **Default deny checks** -- ALLOWED_TOKENS, CONTRACT_WHITELIST, and APPROVED_SPENDERS use **default deny**: if any policy of that type exists but the transaction's token/contract/spender is not in any matching policy, the transaction is blocked with `POLICY_VIOLATION`.
3. **Tier assignment** -- SPENDING_LIMIT determines the transaction tier (INSTANT/NOTIFY/DELAY/APPROVAL) based on amount. APPROVE_TIER_OVERRIDE overrides the tier for APPROVE transactions.
4. **Constraint checks** -- WHITELIST, TIME_RESTRICTION, RATE_LIMIT, METHOD_WHITELIST, APPROVE_AMOUNT_LIMIT, ALLOWED_NETWORKS are evaluated. Any violation blocks the transaction.
5. **Tier execution** -- INSTANT executes immediately, NOTIFY executes + sends notification, DELAY waits for cooldown, APPROVAL requires owner approval via `POST /v1/transactions/{id}/approve`.

### Default Deny Policy Types

These 3 policy types block transactions unless explicitly whitelisted:

| Policy Type          | Applies To          | Effect                                          |
| -------------------- | ------------------- | ----------------------------------------------- |
| `ALLOWED_TOKENS`     | TOKEN_TRANSFER      | Token must be in allowed list to transfer.       |
| `CONTRACT_WHITELIST` | CONTRACT_CALL       | Contract must be in whitelist to call.           |
| `APPROVED_SPENDERS`  | APPROVE             | Spender must be in approved list to approve.     |

If no policies of a given default-deny type exist for a wallet, the check is skipped (permissive by default until the first policy is created).

---

## 4. Common Workflows

### Allow USDC token transfers

1. Create ALLOWED_TOKENS policy to whitelist USDC:
```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"ALLOWED_TOKENS","rules":{"tokens":[{"address":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","symbol":"USDC"}]}}'
```

2. Send TOKEN_TRANSFER (see `transactions.skill.md` for full transaction reference):
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"type":"TOKEN_TRANSFER","to":"<recipient>","amount":"5000000","token":{"address":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","decimals":6,"symbol":"USDC"}}'
```

### Allow Uniswap contract calls

1. Create CONTRACT_WHITELIST for Uniswap Router:
```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"CONTRACT_WHITELIST","rules":{"contracts":[{"address":"0xE592427A0AEce92De3Edee1F18E0157C05861564","name":"Uniswap V3 Router"}]}}'
```

2. (Optional) Restrict allowed methods with METHOD_WHITELIST:
```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"METHOD_WHITELIST","rules":{"methods":[{"contractAddress":"0xE592427A0AEce92De3Edee1F18E0157C05861564","selectors":["0x414bf389"]}]}}'
```

### Require owner approval for large transfers

Create SPENDING_LIMIT with low tier thresholds:
```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"SPENDING_LIMIT","rules":{"instant_max":"10000000","notify_max":"100000000","delay_max":"500000000"}}'
```

Any transfer exceeding `delay_max` (500M lamports = 0.5 SOL) requires owner approval.

### Require approval for all token approvals

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"APPROVE_TIER_OVERRIDE","rules":{"tier":"APPROVAL"}}'
```

### Restrict wallet to specific networks

```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"ALLOWED_NETWORKS","rules":{"networks":[{"network":"ethereum-sepolia"},{"network":"polygon-amoy"}]}}'
```

Transactions to unlisted networks will be blocked with POLICY_VIOLATION.

### Set daily/monthly cumulative spending limits

Prevent split-transaction bypass by limiting total USD spending per rolling window:
```bash
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"walletId":"<uuid>","type":"SPENDING_LIMIT","rules":{"instant_max":"100000000","notify_max":"500000000","delay_max":"1000000000","daily_limit_usd":500,"monthly_limit_usd":5000}}'
```

When cumulative spending exceeds the limit, the transaction is escalated to APPROVAL. Owner can then approve, reject, or increase the limit.

---

## 5. Error Reference

| Error Code                      | HTTP | Description                                       |
| ------------------------------- | ---- | ------------------------------------------------- |
| `POLICY_NOT_FOUND`              | 404  | Policy ID does not exist.                         |
| `POLICY_VIOLATION`              | 403  | Transaction violates one or more active policies. |
| `ACTION_VALIDATION_FAILED`      | 400  | Invalid rules schema for the given policy type.   |
| `WALLET_NOT_FOUND`              | 404  | walletId does not match any existing wallet.      |
| `ENVIRONMENT_NETWORK_MISMATCH`  | 400  | Network scope not valid for wallet's environment. |

**Error response format:**
```json
{
  "code": "POLICY_VIOLATION",
  "message": "Transaction blocked by ALLOWED_TOKENS policy",
  "retryable": false,
  "details": {},
  "requestId": "<uuid>",
  "hint": "Add the token to an ALLOWED_TOKENS policy first"
}
```

---

## 6. Related Skill Files

- **transactions.skill.md** -- 5-type transaction reference (policies affect transaction execution)
- **wallet.skill.md** -- Wallet CRUD and session management
- **admin.skill.md** -- Admin API for daemon operations
