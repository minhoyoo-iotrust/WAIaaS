---
name: "WAIaaS Actions"
description: "Action Provider framework: list providers, execute DeFi actions through the 6-stage transaction pipeline"
category: "api"
tags: [wallet, blockchain, defi, actions, waiass]
version: "2.6.0-rc"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Actions

Action Provider framework for executing DeFi protocol actions (swaps, staking, liquidity) through the WAIaaS transaction pipeline. Actions are resolved by registered providers and executed as CONTRACT_CALL transactions through the existing 6-stage pipeline with full policy evaluation.

## Base URL / Authentication

```
http://localhost:3100
```

All action endpoints require **sessionAuth** via `Authorization: Bearer <token>` header.

## Permissions

### Agent (sessionAuth)
- List action providers and their available actions
- Execute actions (subject to policy evaluation)

### Admin (masterAuth -- prerequisite)
- Register API keys for action providers via Admin UI Settings
- Configure CONTRACT_WHITELIST/ALLOWED_TOKENS policies for provider contracts
- Enable/configure built-in providers via config.toml `[actions]` section

```
Authorization: Bearer wai_sess_eyJ...
```

## 1. List Action Providers

### GET /v1/actions/providers -- List Registered Providers

Returns all registered action providers with their actions and API key status.

```bash
curl -s http://localhost:3100/v1/actions/providers \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

**Response (200):**
```json
{
  "providers": [
    {
      "name": "jupiter_swap",
      "description": "Jupiter DEX aggregator for Solana token swaps with MEV protection",
      "version": "1.0.0",
      "chains": ["solana"],
      "mcpExpose": true,
      "requiresApiKey": false,
      "hasApiKey": false,
      "actions": [
        {
          "name": "swap",
          "description": "Swap tokens on Solana via Jupiter aggregator with slippage protection and Jito MEV tips",
          "chain": "solana",
          "riskLevel": "medium",
          "defaultTier": "DELAY"
        }
      ]
    }
  ]
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | string | Provider identifier. |
| `description` | string | Human-readable provider description. |
| `version` | string | Provider version (semver). |
| `chains` | string[] | Supported blockchain chains. |
| `mcpExpose` | boolean | Whether actions are exposed as MCP tools. |
| `requiresApiKey` | boolean | Whether provider needs an API key to function. |
| `hasApiKey` | boolean | Whether API key is currently configured. |
| `actions` | array | Available actions for this provider. |
| `actions[].name` | string | Action identifier. |
| `actions[].description` | string | What the action does. |
| `actions[].chain` | string | Target blockchain. |
| `actions[].riskLevel` | string | Risk level: "low", "medium", "high". |
| `actions[].defaultTier` | string | Default policy tier: "INSTANT", "NOTIFY", "DELAY", "APPROVAL". |

## 2. Execute Action

### POST /v1/actions/:provider/:action -- Execute Provider Action

Resolve action parameters into a ContractCallRequest and execute through the 6-stage transaction pipeline. Returns immediately with transaction ID.

```bash
curl -s -X POST http://localhost:3100/v1/actions/jupiter_swap/swap \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "inputMint": "So11111111111111111111111111111111111111112",
      "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "1000000000",
      "slippageBps": 50
    },
    "network": "devnet"
  }'
```

**Parameters:**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `params` | object | No | Action-specific parameters as key-value pairs. Varies per provider/action. |
| `network` | string | No | Target network. Defaults to wallet's default network. |

**Response (201):**
```json
{
  "id": "01958f3c-9999-7000-8000-abcdef999999",
  "status": "PENDING"
}
```

The transaction follows the standard lifecycle (PENDING -> QUEUED -> CONFIRMED/FAILED). Query status with `GET /v1/transactions/{id}`.

**Prerequisites:**

1. The resolved contract address must be whitelisted via a **CONTRACT_WHITELIST** policy (Jupiter program: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`).
2. If the provider requires an API key (`requiresApiKey: true`), the key must be configured via Admin API Keys.
3. The provider must be enabled in config.toml (built-in) or loaded from `~/.waiaas/actions/` (plugin).

## 3. Jupiter Swap -- Built-in Provider

### Configuration

Enable Jupiter Swap in `config.toml`:

```toml
[actions]
jupiter_swap_enabled = true
# jupiter_swap_api_base_url = "https://api.jup.ag/swap/v1"  # default
# jupiter_swap_api_key = ""                                    # optional paid API key
# jupiter_swap_default_slippage_bps = 50                       # 0.5% default slippage
# jupiter_swap_max_slippage_bps = 500                          # 5% max slippage clamp
# jupiter_swap_max_price_impact_pct = 1.0                      # 1% max price impact
# jupiter_swap_jito_tip_lamports = 1000                        # Jito MEV protection tip
# jupiter_swap_request_timeout_ms = 10000                      # API request timeout
```

Environment variable overrides: `WAIAAS_ACTIONS_JUPITER_SWAP_ENABLED=true`, etc.

### Swap Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `inputMint` | string | Yes | Input token mint address (Base58). |
| `outputMint` | string | Yes | Output token mint address (Base58). |
| `amount` | string | Yes | Input amount in smallest units (lamports for SOL). |
| `slippageBps` | number | No | Custom slippage in basis points. Clamped to `max_slippage_bps` if exceeded. Default: `default_slippage_bps`. |

### Common Token Mints

| Token | Mint Address |
| ----- | ------------ |
| SOL (wrapped) | `So11111111111111111111111111111111111111112` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |

### Safety Features

- **Slippage protection**: Default 50bps (0.5%), clamped to max 500bps (5%). User-specified slippage exceeding max is silently clamped.
- **Price impact check**: Rejects swaps with price impact exceeding `max_price_impact_pct` (default 1%).
- **Same-token block**: Rejects `inputMint === outputMint` before API call.
- **Jito MEV protection**: Includes priority fee tip (default 1000 lamports) to protect against MEV extraction.
- **Program ID verification**: Verifies returned swap instruction targets the known Jupiter program address.
- **Intermediate token restriction**: Uses `restrictIntermediateTokens=true` for safe routing.
- **Zod runtime validation**: All Jupiter API responses are validated against Zod schemas to detect API drift.

### Example: Swap 1 SOL to USDC

```bash
# 1. Ensure CONTRACT_WHITELIST includes Jupiter program
curl -s -X POST http://localhost:3100/v1/policies \
  -H 'Content-Type: application/json' \
  -H 'X-Master-Password: <password>' \
  -d '{
    "walletId": "<wallet-id>",
    "type": "CONTRACT_WHITELIST",
    "rules": {"addresses": ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"]},
    "priority": 0,
    "enabled": true
  }'

# 2. Execute swap (1 SOL = 1,000,000,000 lamports)
curl -s -X POST http://localhost:3100/v1/actions/jupiter_swap/swap \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "inputMint": "So11111111111111111111111111111111111111112",
      "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "1000000000"
    }
  }'

# 3. Check transaction status
curl -s http://localhost:3100/v1/transactions/<tx-id> \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

### MCP Usage

When Jupiter Swap is enabled, the MCP tool `action_jupiter_swap_swap` is automatically available:

```json
{
  "tool": "action_jupiter_swap_swap",
  "params": {
    "inputMint": "So11111111111111111111111111111111111111112",
    "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": "1000000000"
  }
}
```

### SDK Usage (TypeScript)

```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', token: 'wai_sess_...' });

// Execute Jupiter Swap
const tx = await client.actions.execute('jupiter_swap', 'swap', {
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: '1000000000',
});
console.log('Transaction ID:', tx.id);
```

## 4. Policy Integration

### CONTRACT_WHITELIST (Required)

Jupiter Swap resolves to a `CONTRACT_CALL` targeting the Jupiter program address. The wallet must have a `CONTRACT_WHITELIST` policy that includes `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`.

Without this policy, all swap attempts are denied with `CONTRACT_NOT_WHITELISTED`.

### SPENDING_LIMIT

The swap input amount is converted to USD via IPriceOracle and evaluated against any `SPENDING_LIMIT` policy on the wallet. This ensures DeFi operations respect the same spending controls as regular transfers.

## 5. Error Reference

| Code | HTTP | Description | Recovery |
|------|------|-------------|----------|
| `ACTION_NOT_FOUND` | 404 | Provider or action not registered. | Check available providers with GET /v1/actions/providers. |
| `API_KEY_REQUIRED` | 403 | Provider requires API key not configured. | Set API key via PUT /v1/admin/api-keys/:provider. |
| `ACTION_VALIDATION_FAILED` | 400 | Input parameters failed validation. | Check params format in provider docs. |
| `ACTION_RESOLVE_FAILED` | 502 | Provider's resolve() call failed. | Check provider logs, verify params. |
| `ACTION_RETURN_INVALID` | 500 | Provider returned invalid ContractCallRequest. | Report to provider maintainer. |
| `CONTRACT_NOT_WHITELISTED` | 403 | Resolved contract not in whitelist. | Add Jupiter program to CONTRACT_WHITELIST policy. |
| `POLICY_VIOLATION` | 403 | Transaction blocked by policy. | Check policies with GET /v1/policies. |
| `PRICE_IMPACT_TOO_HIGH` | 502 | Price impact exceeds configured maximum. | Reduce swap amount or increase max_price_impact_pct. |

## 6. Related Skill Files

- **admin.skill.md** -- API key management, oracle status, daemon admin
- **transactions.skill.md** -- 5-type transaction reference (actions execute as CONTRACT_CALL)
- **policies.skill.md** -- Policy management (CONTRACT_WHITELIST required for actions)
- **wallet.skill.md** -- Wallet CRUD, sessions, assets
