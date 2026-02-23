---
name: "WAIaaS Actions"
description: "Action Provider framework: list providers, execute DeFi actions through the 6-stage transaction pipeline"
category: "api"
tags: [wallet, blockchain, defi, actions, waiass, jupiter, 0x, swap]
version: "2.8.2"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Actions

Action Provider framework for executing DeFi protocol actions (swaps, staking, liquidity) through the WAIaaS transaction pipeline. Actions are resolved by registered providers and executed as CONTRACT_CALL transactions through the existing 6-stage pipeline with full policy evaluation.

> AI agents must NEVER request the master password. Use only your session token.

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
- Enable/configure built-in providers via Admin UI > Settings > Actions
- Configure CONTRACT_WHITELIST/ALLOWED_TOKENS policies for provider contracts (or use provider-trust bypass)

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
    },
    {
      "name": "zerox_swap",
      "description": "0x DEX aggregator for EVM token swaps via AllowanceHolder flow",
      "version": "1.0.0",
      "chains": ["ethereum"],
      "mcpExpose": true,
      "requiresApiKey": true,
      "hasApiKey": true,
      "actions": [
        {
          "name": "swap",
          "description": "Swap tokens on EVM chains via 0x aggregator with slippage protection and AllowanceHolder approval",
          "chain": "ethereum",
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

Resolve action parameters into ContractCallRequest(s) and execute through the 6-stage transaction pipeline. Returns immediately with transaction ID. Multi-step actions (e.g., approve + swap) return a pipeline array.

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
| `walletId` | string | No | Target wallet ID. Omit to use the default wallet. |

**Single-step response (201):**
```json
{
  "id": "01958f3c-9999-7000-8000-abcdef999999",
  "status": "PENDING"
}
```

**Multi-step response (201):** (e.g., ERC-20 approve + swap)
```json
{
  "id": "01958f3c-9999-7000-8000-abcdef999999",
  "status": "PENDING",
  "pipeline": [
    { "id": "01958f3c-9999-7000-8000-abcdef000001", "status": "PENDING" },
    { "id": "01958f3c-9999-7000-8000-abcdef000002", "status": "PENDING" }
  ]
}
```

The transaction follows the standard lifecycle (PENDING -> QUEUED -> CONFIRMED/FAILED). Query status with `GET /v1/transactions/{id}`.

**Prerequisites:**

1. The provider must be enabled via Admin UI > Settings > Actions.
2. If the provider requires an API key (`requiresApiKey: true`), the key must be configured in Admin Settings.
3. Either a **CONTRACT_WHITELIST** policy must include the resolved contract, or **provider-trust bypass** applies (see Section 5).

## 3. Jupiter Swap -- Built-in Provider (Solana)

### Configuration

Enable Jupiter Swap via **Admin UI > Settings > Actions > Jupiter Swap**, or environment variables:

| Setting | Env Variable | Default | Description |
| ------- | ------------ | ------- | ----------- |
| Enabled | `WAIAAS_ACTIONS_JUPITER_SWAP_ENABLED` | `false` | Enable Jupiter Swap provider |
| API Base URL | `WAIAAS_ACTIONS_JUPITER_SWAP_API_BASE_URL` | `https://api.jup.ag/swap/v1` | Jupiter API endpoint |
| API Key | `WAIAAS_ACTIONS_JUPITER_SWAP_API_KEY` | (empty) | Optional paid API key |
| Default Slippage | `WAIAAS_ACTIONS_JUPITER_SWAP_DEFAULT_SLIPPAGE_BPS` | `50` | Default slippage (0.5%) |
| Max Slippage | `WAIAAS_ACTIONS_JUPITER_SWAP_MAX_SLIPPAGE_BPS` | `500` | Max slippage clamp (5%) |
| Max Price Impact | `WAIAAS_ACTIONS_JUPITER_SWAP_MAX_PRICE_IMPACT_PCT` | `1.0` | Max price impact (1%) |
| Jito Tip | `WAIAAS_ACTIONS_JUPITER_SWAP_JITO_TIP_LAMPORTS` | `1000` | Jito MEV protection tip |
| Timeout | `WAIAAS_ACTIONS_JUPITER_SWAP_REQUEST_TIMEOUT_MS` | `10000` | API request timeout |

### Swap Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `inputMint` | string | Yes | Input token mint address (Base58). |
| `outputMint` | string | Yes | Output token mint address (Base58). |
| `amount` | string | Yes | Input amount in smallest units (lamports for SOL). |
| `slippageBps` | number | No | Custom slippage in basis points. Clamped to `max_slippage_bps` if exceeded. Default: `default_slippage_bps`. |

### Common Solana Token Mints

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

**REST API:**
```bash
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
```

**MCP Tool:**
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

**TypeScript SDK:**
```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', token: 'wai_sess_...' });

const tx = await client.executeAction('jupiter_swap', 'swap', {
  params: {
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: '1000000000',
  },
});
console.log('Transaction ID:', tx.id);
```

**Python SDK:**
```python
from waiaas import WAIaaSClient

async with WAIaaSClient(base_url="http://localhost:3100", token="wai_sess_...") as client:
    tx = await client.execute_action("jupiter_swap", "swap", {
        "inputMint": "So11111111111111111111111111111111111111112",
        "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "amount": "1000000000",
    })
    print("Transaction ID:", tx.id)
```

## 4. 0x Swap -- Built-in Provider (EVM)

The 0x Swap provider uses the [0x Swap API v2](https://0x.org/docs/api#tag/Swap) with the AllowanceHolder approval flow to aggregate liquidity across EVM DEXs. It supports 20 EVM chains.

### Configuration

Enable 0x Swap via **Admin UI > Settings > Actions > 0x Swap**. A 0x API key is **required** (`requiresApiKey: true`). Get a free key at [0x Dashboard](https://dashboard.0x.org/).

| Setting | Env Variable | Default | Description |
| ------- | ------------ | ------- | ----------- |
| Enabled | `WAIAAS_ACTIONS_ZEROX_SWAP_ENABLED` | `false` | Enable 0x Swap provider |
| API Key | `WAIAAS_ACTIONS_ZEROX_SWAP_API_KEY` | (empty) | **Required.** 0x API key |
| Default Slippage | `WAIAAS_ACTIONS_ZEROX_SWAP_DEFAULT_SLIPPAGE_BPS` | `100` | Default slippage (1%) |
| Max Slippage | `WAIAAS_ACTIONS_ZEROX_SWAP_MAX_SLIPPAGE_BPS` | `500` | Max slippage clamp (5%) |
| Timeout | `WAIAAS_ACTIONS_ZEROX_SWAP_REQUEST_TIMEOUT_MS` | `10000` | API request timeout |

If the provider is enabled but the API key is missing, an `ACTION_API_KEY_REQUIRED` notification is fired and requests fail with `API_KEY_REQUIRED`.

### Swap Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `sellToken` | string | Yes | Token to sell -- EVM hex address (e.g., `0xA0b8...eB48`). Use `0xEeee...eEEE` for native ETH. |
| `buyToken` | string | Yes | Token to buy -- EVM hex address. |
| `sellAmount` | string | Yes | Amount to sell in smallest units (wei for ETH, 6 decimals for USDC). |
| `slippageBps` | number | No | Custom slippage in basis points. Clamped to max 500bps. Default: 100bps (1%). |
| `chainId` | number | No | EVM chain ID. Defaults to 1 (Ethereum mainnet) or resolved from wallet network. |

### Common EVM Tokens (Ethereum Mainnet)

| Token | Address |
| ----- | ------- |
| ETH (native) | `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| WETH | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| DAI | `0x6B175474E89094C44Da98b954EedeAC495271d0F` |
| WBTC | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` |

### Supported EVM Networks

| Network | Chain ID | WAIaaS Network Name |
| ------- | -------- | ------------------- |
| Ethereum | 1 | `ethereum-mainnet` |
| Polygon | 137 | `polygon-mainnet` |
| Arbitrum | 42161 | `arbitrum-mainnet` |
| Optimism | 10 | `optimism-mainnet` |
| Base | 8453 | `base-mainnet` |

Additional chains supported by 0x API (BNB, Avalanche, Linea, Scroll, Blast, etc.) can be used by passing `chainId` explicitly.

### Safety Features

- **Slippage protection**: Default 100bps (1%), max 500bps (5%). User-specified slippage exceeding max is automatically clamped.
- **Liquidity check**: Rejects swaps when 0x API returns `liquidityAvailable: false`.
- **Same-token block**: Rejects `sellToken === buyToken` (case-insensitive) before API call.
- **AllowanceHolder validation**: Verifies the returned `allowanceTarget` matches the known AllowanceHolder contract address (`0x0000000000001fF3684f28c67538d4D072C22734`) for the given chain ID. Mismatches are rejected.
- **Zod runtime validation**: All 0x API responses (price and quote) are validated against Zod schemas with `.passthrough()` for forward compatibility.
- **Provider-trust bypass**: When 0x Swap is enabled in Admin Settings, the CONTRACT_WHITELIST policy check is skipped for 0x-resolved transactions. The AllowanceHolder contract is automatically trusted. See Section 5.

### Multi-step Execution

ERC-20 token sells generate **two sequential transactions** (pipeline):
1. **ERC-20 approve** -- Approve the AllowanceHolder contract to spend `sellAmount` of `sellToken`.
2. **Swap call** -- Execute the swap via the AllowanceHolder contract.

Native ETH sells generate **one transaction** (the swap call only, no approval needed).

The pipeline array is visible in the API response when multiple steps are returned.

### Example: Swap 0.1 ETH to USDC on Ethereum

**REST API:**
```bash
# Swap 0.1 ETH (100000000000000000 wei) to USDC
curl -s -X POST http://localhost:3100/v1/actions/zerox_swap/swap \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "sellToken": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      "buyToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "sellAmount": "100000000000000000",
      "chainId": 1
    }
  }'
```

**MCP Tool:**
```json
{
  "tool": "action_zerox_swap_swap",
  "params": {
    "sellToken": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "buyToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "sellAmount": "100000000000000000",
    "chainId": 1
  }
}
```

**TypeScript SDK:**
```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', token: 'wai_sess_...' });

const tx = await client.executeAction('zerox_swap', 'swap', {
  params: {
    sellToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    buyToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    sellAmount: '100000000000000000',
    chainId: 1,
  },
});
console.log('Transaction ID:', tx.id);
```

**Python SDK:**
```python
from waiaas import WAIaaSClient

async with WAIaaSClient(base_url="http://localhost:3100", token="wai_sess_...") as client:
    tx = await client.execute_action("zerox_swap", "swap", {
        "sellToken": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "buyToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "sellAmount": "100000000000000000",
        "chainId": 1,
    })
    print("Transaction ID:", tx.id)
```

### Example: Swap 100 USDC to ETH on Ethereum (ERC-20, multi-step)

```bash
# ERC-20 sell: returns pipeline with approve + swap
curl -s -X POST http://localhost:3100/v1/actions/zerox_swap/swap \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "sellToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "buyToken": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      "sellAmount": "100000000",
      "chainId": 1
    }
  }'
```

Response includes a `pipeline` array with two elements: `[approve, swap]`.

## 5. Policy Integration

### CONTRACT_WHITELIST

Action providers resolve to `CONTRACT_CALL` transactions targeting external protocol contracts. Normally, the wallet must have a `CONTRACT_WHITELIST` policy that includes the target contract address.

**Jupiter Swap:** Jupiter program `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`.
**0x Swap:** AllowanceHolder contract `0x0000000000001fF3684f28c67538d4D072C22734`.

### Provider-Trust Bypass

When an action provider is **enabled** via Admin Settings, the CONTRACT_WHITELIST check is automatically skipped for transactions resolved by that provider. This is the **provider-trust** mechanism:

- Enabled providers are trusted at policy evaluation time (checked via SettingsService, not registration).
- The `actionProvider` field is auto-tagged by the ActionProviderRegistry after Zod validation -- providers cannot spoof this field.
- This means you do **not** need to manually whitelist the AllowanceHolder contract or Jupiter program when using built-in action providers. Enabling the provider in Admin Settings is sufficient.

If you prefer explicit whitelisting (defense in depth), you can still add the contract addresses to CONTRACT_WHITELIST.

### SPENDING_LIMIT

The swap input amount is converted to USD via IPriceOracle and evaluated against any `SPENDING_LIMIT` policy on the wallet. This ensures DeFi operations respect the same spending controls as regular transfers.

## 6. Configuration via Admin Settings

Since v28.2, all action provider settings are managed via **Admin UI > Settings > Actions** (not config.toml). The Admin Settings UI provides:

- **Enable/disable toggle** per provider (takes effect immediately, no daemon restart)
- **API key management** (required for 0x Swap, optional for Jupiter Swap)
- **Slippage defaults** (default and max, in basis points)
- **Provider-specific settings** (base URL, timeout, Jito tip, max price impact)

Settings are stored in the database and take precedence over config.toml defaults. Environment variables (`WAIAAS_ACTIONS_*`) can override database values for deployment automation.

**Settings read priority:** Database (Admin UI) > Environment Variable > config.toml default > Code default.

Admin UI path: **Settings > Actions > [Provider Name]**

### Provider Status in Admin UI

The Admin UI shows a three-state status for each provider:
- **Active** -- Provider is enabled and registered (green)
- **Requires API Key** -- Provider is enabled but missing required API key (yellow, fires `ACTION_API_KEY_REQUIRED` notification)
- **Inactive** -- Provider is disabled (gray)

## 7. Error Reference

| Code | HTTP | Description | Recovery |
|------|------|-------------|----------|
| `ACTION_NOT_FOUND` | 404 | Provider or action not registered. | Check available providers with GET /v1/actions/providers. |
| `API_KEY_REQUIRED` | 403 | Provider requires API key not configured. | Set API key via Admin UI > Settings > Actions. |
| `ACTION_VALIDATION_FAILED` | 400 | Input parameters failed validation. | Check params format in provider docs. |
| `ACTION_RESOLVE_FAILED` | 502 | Provider's resolve() call failed. | Check provider logs, verify params. |
| `ACTION_RETURN_INVALID` | 500 | Provider returned invalid ContractCallRequest. | Report to provider maintainer. |
| `CONTRACT_NOT_WHITELISTED` | 403 | Resolved contract not in whitelist (provider-trust not applicable). | Add contract to CONTRACT_WHITELIST or enable the provider. |
| `POLICY_VIOLATION` | 403 | Transaction blocked by policy. | Check policies with GET /v1/policies. |
| `PRICE_IMPACT_TOO_HIGH` | 502 | Price impact exceeds configured maximum (Jupiter). | Reduce swap amount or increase max_price_impact_pct. |
| `LIQUIDITY_UNAVAILABLE` | 502 | No liquidity available for the swap pair (0x). | Try a different token pair or smaller amount. |

## 8. MCP Auto-Registration

When a provider has `mcpExpose: true` in its metadata, the MCP server automatically registers each action as an MCP tool using the naming convention:

```
action_{provider_name}_{action_name}
```

**Current MCP tools:**
- `action_jupiter_swap_swap` -- Jupiter Swap on Solana
- `action_zerox_swap_swap` -- 0x Swap on EVM chains

Auto-registration happens after MCP server connection via `registerActionProviderTools()`. The tool list is refreshed on each session. If the REST API is unavailable, MCP enters degraded mode (14 built-in tools remain, action provider tools are skipped).

MCP tool parameters:
- `params` (optional object): Action-specific parameters as key-value pairs
- `network` (optional string): Target network
- `wallet_id` (optional string): Target wallet ID

## 9. Related Skill Files

- **admin.skill.md** -- API key management, Admin Settings, daemon admin
- **transactions.skill.md** -- 5-type transaction reference (actions execute as CONTRACT_CALL)
- **policies.skill.md** -- Policy management (CONTRACT_WHITELIST, SPENDING_LIMIT)
- **wallet.skill.md** -- Wallet CRUD, sessions, assets
