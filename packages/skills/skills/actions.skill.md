---
name: "WAIaaS Actions"
description: "Action Provider framework: list providers, execute DeFi actions through the 6-stage transaction pipeline"
category: "api"
tags: [wallet, blockchain, defi, actions, waiass, jupiter, 0x, swap, lifi, bridge, cross-chain, lido, jito, staking, liquid-staking, pendle, yield, pt, yt, drift, perp, perpetual, leverage, futures, dcent-swap, dcent, aggregator, across, across-bridge, polymarket, prediction-market, clob, ctf]
version: "2.12.0-rc.1"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS Actions

Action Provider framework for executing DeFi protocol actions (swaps, staking, liquidity, cross-chain bridges) through the WAIaaS transaction pipeline. Actions are resolved by registered providers and executed as CONTRACT_CALL transactions through the existing 6-stage pipeline with full policy evaluation.

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

> Provider 활성화, API 키 등록, CONTRACT_WHITELIST 설정은 관리자가 사전에 완료해야 합니다. docs/admin-manual/defi-providers.md 를 참조하세요.

```
Authorization: Bearer wai_sess_eyJ...
```

## Amount Units for Actions

Action provider params accept `humanAmount` as an alternative to `amount` for human-readable values. The server converts using the `decimals` field.

### humanAmount with Actions

```bash
curl -s -X POST http://localhost:3100/v1/actions/jupiter_swap/swap \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "humanAmount": "1.5",
      "decimals": 9,
      "inputMint": "So11111111111111111111111111111111111111112",
      "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "slippageBps": 50
    }
  }'
```

### Per-provider humanAmount field names

| Provider | Field | Example |
|----------|-------|---------|
| Jupiter, Aave, Kamino, Lido, Jito | `humanAmount` | `"1.5"` |
| 0x Swap | `humanSellAmount` | `"1.5"` |
| Pendle | `humanAmountIn` | `"1.5"` |
| LI.FI | `humanFromAmount` | `"1.5"` |
| Across Bridge | `humanAmount` | `"1.5"` |

All require a `decimals` field alongside `humanAmount` so the provider can convert to smallest units.

### CLOB Exception

Hyperliquid, Drift, and Polymarket use exchange-native units. `humanAmount` is not supported -- use `amount` directly with the value in exchange-native format.

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
    },
    {
      "name": "lifi",
      "description": "LI.FI cross-chain bridge and swap aggregator (100+ bridges, 40+ chains)",
      "version": "1.0.0",
      "chains": ["ethereum", "solana"],
      "mcpExpose": true,
      "requiresApiKey": false,
      "hasApiKey": false,
      "actions": [
        {
          "name": "cross_swap",
          "description": "Cross-chain bridge and swap via LI.FI aggregator",
          "chain": "ethereum",
          "riskLevel": "high",
          "defaultTier": "DELAY"
        },
        {
          "name": "bridge",
          "description": "Simple cross-chain bridge via LI.FI",
          "chain": "ethereum",
          "riskLevel": "high",
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
    "network": "solana-devnet"
  }'
```

**Parameters:**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `params` | object | No | Action-specific parameters as key-value pairs. Varies per provider/action. |
| `network` | string | No | Target network. Required for EVM wallets; auto-resolved for Solana. |
| `walletId` | string | No | Target wallet ID. Required for multi-wallet sessions; auto-resolved for single wallet. |

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

1. The provider must be enabled (all 10 providers are enabled by default since v30.11).
2. If the provider requires an API key (`requiresApiKey: true`), the key must be configured in Admin Settings.
3. Either a **CONTRACT_WHITELIST** policy must include the resolved contract, or **provider-trust bypass** applies (see Section 6).

## 3. Jupiter Swap -- Built-in Provider (Solana)

### Configuration

Enable Jupiter Swap via **Admin UI > DeFi (`#/defi`) > Jupiter Swap**, or environment variables:

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

Enable 0x Swap via **Admin UI > DeFi (`#/defi`) > 0x Swap**. A 0x API key is **required** (`requiresApiKey: true`). Get a free key at [0x Dashboard](https://dashboard.0x.org/).

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
- **Provider-trust bypass**: When 0x Swap is enabled in Admin Settings, the CONTRACT_WHITELIST policy check is skipped for 0x-resolved transactions. The AllowanceHolder contract is automatically trusted. See Section 6.

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

## 5. LI.FI Cross-Chain Bridge -- Built-in Provider (Multi-Chain)

The LI.FI provider uses the [LI.FI API](https://docs.li.fi/) to aggregate 100+ bridges and DEXs across 40+ chains. It enables cross-chain asset transfers (bridge) and cross-chain swaps (different tokens across chains). Unlike single-chain providers (Jupiter, 0x), LI.FI operates across multiple blockchains simultaneously.

### Configuration

Enable LI.FI via **Admin UI > DeFi (`#/defi`) > LI.FI**, or environment variables. No API key is required -- LI.FI works without a key but with rate limits. An optional API key relaxes rate limits.

| Setting | Env Variable | Default | Description |
| ------- | ------------ | ------- | ----------- |
| Enabled | `WAIAAS_ACTIONS_LIFI_ENABLED` | `false` | Enable LI.FI cross-chain provider |
| API Key | `WAIAAS_ACTIONS_LIFI_API_KEY` | (empty) | Optional. Relaxes rate limits (not required for basic usage) |
| API Base URL | `WAIAAS_ACTIONS_LIFI_API_BASE_URL` | `https://li.quest/v1` | LI.FI API endpoint |
| Default Slippage | `WAIAAS_ACTIONS_LIFI_DEFAULT_SLIPPAGE_PCT` | `0.03` | Default slippage (3%, decimal) |
| Max Slippage | `WAIAAS_ACTIONS_LIFI_MAX_SLIPPAGE_PCT` | `0.05` | Max slippage clamp (5%, decimal) |
| Timeout | `WAIAAS_ACTIONS_LIFI_REQUEST_TIMEOUT_MS` | `15000` | API request timeout (higher due to cross-chain route computation) |

**Note:** Slippage values are in **decimal** format (0.03 = 3%), NOT basis points. This differs from Jupiter and 0x which use basis points.

### Actions

| Action | Description | Use Case |
| ------ | ----------- | -------- |
| `cross_swap` | Cross-chain bridge and swap via LI.FI aggregator | Move tokens between different chains with token conversion (e.g., SOL on Solana to USDC on Base) |
| `bridge` | Simple cross-chain bridge via LI.FI | Transfer same token between chains (e.g., USDC from Ethereum to Arbitrum) |

Both actions accept the same parameters and use the same LI.FI `/quote` API -- the distinction is semantic for AI agent clarity.

### Cross-Swap / Bridge Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `fromChain` | string | Yes | Source chain name (e.g., `solana`, `ethereum`, `base`, `arbitrum`). |
| `toChain` | string | Yes | Destination chain name. |
| `fromToken` | string | Yes | Source token address or symbol (e.g., `So11111111111111111111111111111111111111112` for SOL, `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` for USDC). |
| `toToken` | string | Yes | Destination token address or symbol. |
| `fromAmount` | string | Yes | Amount in smallest units (lamports for SOL, wei for ETH, etc.). |
| `slippage` | number | No | Slippage tolerance as decimal (0-1). Default: `0.03` (3%). Clamped to max `0.05` (5%). |
| `toAddress` | string | No | Destination address on the target chain. Defaults to the wallet address. |

### Supported Chains

| Chain | LI.FI Chain ID | WAIaaS Chain Names |
| ----- | -------------- | ------------------ |
| Solana | 1151111081099710 | `solana`, `solana-mainnet` |
| Ethereum | 1 | `ethereum`, `ethereum-mainnet` |
| Polygon | 137 | `polygon`, `polygon-mainnet` |
| Arbitrum | 42161 | `arbitrum`, `arbitrum-mainnet` |
| Optimism | 10 | `optimism`, `optimism-mainnet` |
| Base | 8453 | `base`, `base-mainnet` |

### Safety Features

- **Slippage protection**: Default 3%, max 5% clamp. Slippage is in decimal (0.03 = 3%), NOT basis points. Values exceeding max are silently clamped.
- **Unsupported chain error**: Descriptive error message listing supported chains when an unsupported chain name is provided.
- **Zod runtime validation**: All LI.FI API responses (quote and status) are validated against Zod schemas to detect API drift.
- **Provider-trust bypass**: When LI.FI is enabled in Admin Settings, the CONTRACT_WHITELIST policy check is skipped for LI.FI-resolved transactions. See Section 6.
- **2-phase bridge monitoring**: Active polling (30s intervals, 240 attempts = 2 hours) followed by reduced polling (5min intervals, 264 attempts = 22 hours). Total monitoring window: 24 hours.
- **SPENDING_LIMIT reservation**: Bridge amounts are reserved against the spending limit on submission. Released on COMPLETED/FAILED/REFUNDED. Held (not released) on TIMEOUT to prevent double-spend during manual resolution.

### Bridge Status Tracking

Cross-chain bridge transactions are asynchronous -- the source chain transaction confirms immediately, but the bridge transfer takes minutes to hours. LI.FI bridge status is tracked via a 2-phase polling lifecycle:

1. **PENDING** -- Transaction submitted to source chain
2. **Active polling** (Phase 1) -- Poll LI.FI `/status` API every 30 seconds for up to 2 hours (240 attempts). Detects COMPLETED, FAILED, or REFUNDED.
3. **BRIDGE_MONITORING** -- If not resolved after 2 hours, transitions to reduced polling
4. **Reduced polling** (Phase 2) -- Poll every 5 minutes for up to 22 hours (264 attempts). Covers slow bridges and congestion.
5. **Terminal state** -- COMPLETED, FAILED, REFUNDED, or TIMEOUT (after 24 hours total)

**Notification events** (5 bridge-specific events):
- `BRIDGE_COMPLETED` -- Bridge transfer completed successfully on destination chain
- `BRIDGE_FAILED` -- Bridge transfer failed
- `BRIDGE_MONITORING_STARTED` -- Transitioned to reduced polling (bridge taking longer than expected)
- `BRIDGE_TIMEOUT` -- Bridge not resolved after 24 hours of monitoring
- `BRIDGE_REFUNDED` -- Bridge transfer was refunded on source chain

### Example: Bridge USDC from Ethereum to Arbitrum

**REST API:**
```bash
# Bridge 100 USDC (100000000 = 100 * 10^6) from Ethereum to Arbitrum
curl -s -X POST http://localhost:3100/v1/actions/lifi/bridge \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "fromChain": "ethereum",
      "toChain": "arbitrum",
      "fromToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "toToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "fromAmount": "100000000"
    }
  }'
```

**MCP Tool:**
```json
{
  "tool": "action_lifi_bridge",
  "params": {
    "fromChain": "ethereum",
    "toChain": "arbitrum",
    "fromToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "toToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "fromAmount": "100000000"
  }
}
```

**TypeScript SDK:**
```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', token: 'wai_sess_...' });

const tx = await client.executeAction('lifi', 'bridge', {
  params: {
    fromChain: 'ethereum',
    toChain: 'arbitrum',
    fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    fromAmount: '100000000',
  },
});
console.log('Transaction ID:', tx.id);
// Poll GET /v1/transactions/{tx.id} for bridge_status updates
```

**Python SDK:**
```python
from waiaas import WAIaaSClient

async with WAIaaSClient(base_url="http://localhost:3100", token="wai_sess_...") as client:
    tx = await client.execute_action("lifi", "bridge", {
        "fromChain": "ethereum",
        "toChain": "arbitrum",
        "fromToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "toToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "fromAmount": "100000000",
    })
    print("Transaction ID:", tx.id)
    # Poll GET /v1/transactions/{tx.id} for bridge_status updates
```

### Example: Cross-Chain Swap SOL to Base USDC

**REST API:**
```bash
# Swap 1 SOL (1000000000 lamports) from Solana to USDC on Base
curl -s -X POST http://localhost:3100/v1/actions/lifi/cross_swap \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "fromChain": "solana",
      "toChain": "base",
      "fromToken": "So11111111111111111111111111111111111111112",
      "toToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "fromAmount": "1000000000"
    }
  }'
```

**MCP Tool:**
```json
{
  "tool": "action_lifi_cross_swap",
  "params": {
    "fromChain": "solana",
    "toChain": "base",
    "fromToken": "So11111111111111111111111111111111111111112",
    "toToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "fromAmount": "1000000000"
  }
}
```

**TypeScript SDK:**
```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', token: 'wai_sess_...' });

const tx = await client.executeAction('lifi', 'cross_swap', {
  params: {
    fromChain: 'solana',
    toChain: 'base',
    fromToken: 'So11111111111111111111111111111111111111112',
    toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    fromAmount: '1000000000',
  },
});
console.log('Transaction ID:', tx.id);
// Bridge status tracked automatically -- notifications sent on completion/failure
```

**Python SDK:**
```python
from waiaas import WAIaaSClient

async with WAIaaSClient(base_url="http://localhost:3100", token="wai_sess_...") as client:
    tx = await client.execute_action("lifi", "cross_swap", {
        "fromChain": "solana",
        "toChain": "base",
        "fromToken": "So11111111111111111111111111111111111111112",
        "toToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "fromAmount": "1000000000",
    })
    print("Transaction ID:", tx.id)
    # Bridge status tracked automatically -- notifications sent on completion/failure
```

## 6. Lido Liquid Staking (ETH -> stETH)

The Lido Staking provider uses the [Lido Protocol](https://lido.fi/) to stake ETH and receive stETH (liquid staking token). Unstaking requests ETH withdrawal via the Lido Withdrawal Queue. Lido operates on Ethereum only.

> AI agents must NEVER request the master password. Use only your session token.

### Configuration

Enable Lido Staking via **Admin UI > DeFi (`#/defi`) > Lido Staking**, or environment variables. No API key is required.

| Setting | Env Variable | Default | Description |
| ------- | ------------ | ------- | ----------- |
| Enabled | `WAIAAS_ACTIONS_LIDO_STAKING_ENABLED` | `false` | Enable Lido Staking provider |
| stETH Address | `WAIAAS_ACTIONS_LIDO_STAKING_STETH_ADDRESS` | (auto) | Override stETH contract address (auto-detected from environment) |
| Withdrawal Queue | `WAIAAS_ACTIONS_LIDO_STAKING_WITHDRAWAL_QUEUE_ADDRESS` | (auto) | Override Withdrawal Queue address (auto-detected from environment) |

### Available Actions

| Action | Description | Chain | Risk | Tier |
| ------ | ----------- | ----- | ---- | ---- |
| `stake` | Stake ETH to receive stETH via Lido protocol (submit). Immediate, no lock-up. | ethereum | medium | DELAY |
| `unstake` | Request stETH to ETH withdrawal via Lido Withdrawal Queue. Takes 1-5 days to finalize. | ethereum | medium | DELAY |

### Stake Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `amount` | string | Yes | Amount of ETH to stake (human-readable, e.g., `"1.0"` for 1 ETH). Converted to wei internally. |

### Unstake Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `amount` | string | Yes | Amount of stETH to withdraw (human-readable, e.g., `"0.5"` for 0.5 stETH). Converted to wei internally. |

### Chain Support

- **Ethereum only** (mainnet and Holesky testnet)
- Address auto-detection: `deriveEnvironment()` determines mainnet vs Holesky addresses based on wallet environment
- Admin override: empty string default falls back to environment-derived addresses

### Async Unstake Tracking

Lido unstake is asynchronous -- the withdrawal request is submitted immediately, but ETH redemption takes 1-5 days:

1. **PENDING** -- Withdrawal request submitted to Lido Withdrawal Queue
2. **Polling** -- LidoWithdrawalTracker polls every 30s (480 attempts = 4 hours) using metadata.status field
3. **COMPLETED** -- Withdrawal finalized, ETH available for claim
4. **TIMEOUT** -- Not resolved after polling window

**Notification events:**
- `STAKING_UNSTAKE_COMPLETED` -- Unstake withdrawal finalized
- `STAKING_UNSTAKE_TIMEOUT` -- Unstake not resolved after monitoring period

### Example: Stake 1 ETH to stETH

**REST API:**
```bash
curl -s -X POST http://localhost:3100/v1/actions/lido_staking/stake \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": { "amount": "1.0" },
    "network": "ethereum-mainnet"
  }'
```

**MCP Tool:**
```json
{
  "tool": "action_lido_staking_stake",
  "params": { "amount": "1.0" },
  "network": "ethereum-mainnet"
}
```

**TypeScript SDK:**
```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', token: 'wai_sess_...' });

const tx = await client.executeAction('lido_staking', 'stake', {
  params: { amount: '1.0' },
  network: 'ethereum-mainnet',
});
console.log('Transaction ID:', tx.id);
```

**Python SDK:**
```python
from waiaas import WAIaaSClient

async with WAIaaSClient(base_url="http://localhost:3100", token="wai_sess_...") as client:
    tx = await client.execute_action("lido_staking", "stake", {
        "amount": "1.0",
    }, network="ethereum-mainnet")
    print("Transaction ID:", tx.id)
```

### Example: Unstake 0.5 stETH

**REST API:**
```bash
curl -s -X POST http://localhost:3100/v1/actions/lido_staking/unstake \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": { "amount": "0.5" },
    "network": "ethereum-mainnet"
  }'
```

**MCP Tool:**
```json
{
  "tool": "action_lido_staking_unstake",
  "params": { "amount": "0.5" },
  "network": "ethereum-mainnet"
}
```

**TypeScript SDK:**
```typescript
const tx = await client.executeAction('lido_staking', 'unstake', {
  params: { amount: '0.5' },
  network: 'ethereum-mainnet',
});
// Poll GET /v1/transactions/{tx.id} for async unstake status
```

**Python SDK:**
```python
tx = await client.execute_action("lido_staking", "unstake", {
    "amount": "0.5",
}, network="ethereum-mainnet")
# Poll GET /v1/transactions/{tx.id} for async unstake status
```

## 7. Jito Liquid Staking (SOL -> JitoSOL)

The Jito Staking provider uses the [Jito Stake Pool](https://www.jito.network/) to stake SOL and receive JitoSOL (liquid staking token). Unstaking burns JitoSOL to withdraw SOL with epoch boundary delay. Jito operates on Solana only.

> AI agents must NEVER request the master password. Use only your session token.

### Configuration

Enable Jito Staking via **Admin UI > DeFi (`#/defi`) > Jito Staking**, or environment variables. No API key is required.

| Setting | Env Variable | Default | Description |
| ------- | ------------ | ------- | ----------- |
| Enabled | `WAIAAS_ACTIONS_JITO_STAKING_ENABLED` | `false` | Enable Jito Staking provider |
| Stake Pool Address | `WAIAAS_ACTIONS_JITO_STAKING_STAKE_POOL_ADDRESS` | (auto) | Override Jito Stake Pool address (mainnet defaults) |
| JitoSOL Mint | `WAIAAS_ACTIONS_JITO_STAKING_JITOSOL_MINT` | (auto) | Override JitoSOL mint address (mainnet defaults) |

### Available Actions

| Action | Description | Chain | Risk | Tier |
| ------ | ----------- | ----- | ---- | ---- |
| `stake` | Stake SOL to receive JitoSOL via Jito Stake Pool (DepositSol). Immediate, no lock-up. | solana | medium | DELAY |
| `unstake` | Withdraw SOL from Jito Stake Pool by burning JitoSOL (WithdrawSol). Epoch boundary delay. | solana | medium | DELAY |

### Stake Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `amount` | string | Yes | Amount of SOL to stake (human-readable, e.g., `"2.0"` for 2 SOL). Converted to lamports internally. |

### Unstake Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `amount` | string | Yes | Amount of JitoSOL to withdraw (human-readable, e.g., `"1.5"` for 1.5 JitoSOL). Converted to lamports internally. |

### Chain Support

- **Solana only** (mainnet)
- Mainnet-only addresses: `getJitoAddresses('mainnet')` always, testnet falls back to mainnet
- Zero external Solana SDK dependencies -- pure TypeScript PDA derivation, base58, ATA

### Async Unstake Tracking

Jito unstake is asynchronous -- the withdrawal is submitted but SOL release happens at epoch boundaries:

1. **PENDING** -- Withdrawal request submitted to Jito Stake Pool
2. **Polling** -- JitoEpochTracker polls every 30s (240 attempts = 2 hours) using metadata.status field
3. **COMPLETED** -- SOL released from stake pool
4. **TIMEOUT** -- Not resolved after polling window

**Notification events:**
- `STAKING_UNSTAKE_COMPLETED` -- Unstake withdrawal completed
- `STAKING_UNSTAKE_TIMEOUT` -- Unstake not resolved after monitoring period

### Example: Stake 2 SOL to JitoSOL

**REST API:**
```bash
curl -s -X POST http://localhost:3100/v1/actions/jito_staking/stake \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": { "amount": "2.0" }
  }'
```

**MCP Tool:**
```json
{
  "tool": "action_jito_staking_stake",
  "params": { "amount": "2.0" }
}
```

**TypeScript SDK:**
```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', token: 'wai_sess_...' });

const tx = await client.executeAction('jito_staking', 'stake', {
  params: { amount: '2.0' },
});
console.log('Transaction ID:', tx.id);
```

**Python SDK:**
```python
from waiaas import WAIaaSClient

async with WAIaaSClient(base_url="http://localhost:3100", token="wai_sess_...") as client:
    tx = await client.execute_action("jito_staking", "stake", {
        "amount": "2.0",
    })
    print("Transaction ID:", tx.id)
```

### Example: Unstake 1.5 JitoSOL

**REST API:**
```bash
curl -s -X POST http://localhost:3100/v1/actions/jito_staking/unstake \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": { "amount": "1.5" }
  }'
```

**MCP Tool:**
```json
{
  "tool": "action_jito_staking_unstake",
  "params": { "amount": "1.5" }
}
```

**TypeScript SDK:**
```typescript
const tx = await client.executeAction('jito_staking', 'unstake', {
  params: { amount: '1.5' },
});
// Poll GET /v1/transactions/{tx.id} for async unstake status
```

**Python SDK:**
```python
tx = await client.execute_action("jito_staking", "unstake", {
    "amount": "1.5",
})
# Poll GET /v1/transactions/{tx.id} for async unstake status
```

## 8. Aave V3 Lending -- Built-in Provider (EVM)

The Aave V3 Lending provider uses the [Aave Protocol V3](https://aave.com/) to supply collateral, borrow assets, repay debt, and withdraw collateral on EVM chains. It supports multi-chain deployment across Ethereum, Arbitrum, Optimism, Polygon, and Base.

> AI agents must NEVER request the master password. Use only your session token.

### Configuration

Enable Aave V3 Lending via **Admin UI > DeFi (`#/defi`) > Aave V3 Lending**, or environment variables. No API key is required -- Aave V3 operates via on-chain contracts with RPC calls.

| Setting | Env Variable | Default | Description |
| ------- | ------------ | ------- | ----------- |
| Enabled | `WAIAAS_ACTIONS_AAVE_V3_ENABLED` | `false` | Enable Aave V3 Lending provider |

### Available Actions

| Action | Description | Chain | Risk | Tier |
| ------ | ----------- | ----- | ---- | ---- |
| `aave_supply` | Supply assets as collateral to Aave V3 lending pool | ethereum | medium | DELAY |
| `aave_borrow` | Borrow assets against collateral from Aave V3 | ethereum | high | DELAY |
| `aave_repay` | Repay borrowed assets to Aave V3 lending pool | ethereum | low | DELAY |
| `aave_withdraw` | Withdraw supplied collateral from Aave V3 | ethereum | medium | DELAY |

### Supported Chains

| Network | Chain ID | WAIaaS Network Name |
| ------- | -------- | ------------------- |
| Ethereum | 1 | `ethereum-mainnet` |
| Arbitrum | 42161 | `arbitrum-mainnet` |
| Optimism | 10 | `optimism-mainnet` |
| Polygon | 137 | `polygon-mainnet` |
| Base | 8453 | `base-mainnet` |

### Supply Parameters (aave_supply)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `asset` | string | Yes | Token address to supply (EVM hex address, e.g., `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`). |
| `amount` | string | Yes | Amount in human-readable format (e.g., `"100.5"` for 100.5 USDC). Converted to token decimals internally. |

### Borrow Parameters (aave_borrow)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `asset` | string | Yes | Token address to borrow. |
| `amount` | string | Yes | Amount in human-readable format. |

### Repay Parameters (aave_repay)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `asset` | string | Yes | Token address to repay. |
| `amount` | string | Yes | Amount in human-readable format, or `"max"` for full repayment. |

### Withdraw Parameters (aave_withdraw)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `asset` | string | Yes | Token address to withdraw. |
| `amount` | string | Yes | Amount in human-readable format, or `"max"` for full withdrawal. |

### Safety Features

- **Health factor simulation**: Borrow and withdraw actions simulate the resulting health factor before execution. If the simulated health factor would drop below a safe threshold, the action is rejected to prevent self-liquidation.
- **Non-spending classification**: Supply and repay actions are classified as non-spending operations and are not counted toward SPENDING_LIMIT policy limits. The assets remain under the wallet's control as collateral or debt reduction.
- **ERC-20 auto-approval**: Supply and repay actions automatically include an ERC-20 approve step (multi-step pipeline) to approve the Aave V3 Pool contract to spend the required token amount.
- **Provider-trust bypass**: When Aave V3 is enabled in Admin Settings, the CONTRACT_WHITELIST policy check is automatically skipped for Aave V3-resolved transactions. See Policy Integration section.

### Multi-step Execution

Supply and repay actions generate **two sequential transactions** (pipeline):
1. **ERC-20 approve** -- Approve the Aave V3 Pool contract to spend the token amount.
2. **Aave V3 call** -- Execute the supply/repay call on the Aave V3 Pool contract.

Borrow and withdraw actions generate **one transaction** (no approval needed since the protocol already holds the assets).

### Example: Supply 100 USDC to Aave V3 on Ethereum

**REST API:**
```bash
curl -s -X POST http://localhost:3100/v1/actions/aave_v3/aave_supply \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "asset": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "amount": "100"
    },
    "network": "ethereum-mainnet"
  }'
```

**MCP Tool:**
```json
{
  "tool": "action_aave_v3_aave_supply",
  "params": {
    "asset": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "amount": "100"
  },
  "network": "ethereum-mainnet"
}
```

**TypeScript SDK:**
```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', sessionToken: 'wai_sess_...' });

const tx = await client.executeAction('aave_v3', 'aave_supply', {
  params: {
    asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    amount: '100',
  },
  network: 'ethereum-mainnet',
});
console.log('Transaction ID:', tx.id);
```

**Python SDK:**
```python
from waiaas import WAIaaSClient

async with WAIaaSClient(base_url="http://localhost:3100", token="wai_sess_...") as client:
    tx = await client.execute_action("aave_v3", "aave_supply", {
        "asset": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "amount": "100",
    }, network="ethereum-mainnet")
    print("Transaction ID:", tx.id)
```

### Example: Borrow 0.5 ETH from Aave V3

**REST API:**
```bash
curl -s -X POST http://localhost:3100/v1/actions/aave_v3/aave_borrow \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "asset": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "amount": "0.5"
    },
    "network": "ethereum-mainnet"
  }'
```

**MCP Tool:**
```json
{
  "tool": "action_aave_v3_aave_borrow",
  "params": {
    "asset": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "amount": "0.5"
  },
  "network": "ethereum-mainnet"
}
```

### DeFi Position Queries

After executing Aave V3 actions, use the DeFi position endpoints to monitor your lending state:

- **GET /v1/wallet/positions** -- View all active lending positions (see `wallet.skill.md` Section 16)
- **GET /v1/wallet/health-factor** -- Monitor lending health factor to avoid liquidation
- **MCP tools:** `waiaas_get_defi_positions`, `waiaas_get_health_factor`

## 9. Kamino Lending -- Built-in Provider (Solana)

The Kamino Lending provider uses the [Kamino K-Lend](https://kamino.finance/) protocol to supply collateral, borrow assets, repay debt, and withdraw collateral on Solana. It uses the @kamino-finance/klend-sdk for instruction building.

> AI agents must NEVER request the master password. Use only your session token.

### Configuration

Enable Kamino Lending via **Admin UI > DeFi (`#/defi`) > Kamino Lending**, or environment variables. No API key is required -- Kamino operates via on-chain Solana programs.

| Setting | Environment Variable | Default | Description |
|---------|---------------------|---------|-------------|
| Enabled | `WAIAAS_ACTIONS_KAMINO_ENABLED` | `false` | Enable Kamino Lending provider |
| Market | `WAIAAS_ACTIONS_KAMINO_MARKET` | `main` | Market identifier ('main' or custom pubkey) |
| HF Threshold | `WAIAAS_ACTIONS_KAMINO_HF_THRESHOLD` | `1.2` | Health factor warning threshold |

### Actions

| Action | Description | Chain | Risk | Default Tier |
|--------|------------|-------|------|-------------|
| `kamino_supply` | Supply assets as collateral to Kamino lending market | solana | medium | DELAY |
| `kamino_borrow` | Borrow assets against collateral from Kamino | solana | high | APPROVAL |
| `kamino_repay` | Repay borrowed debt (supports 'max' for full repayment) | solana | medium | DELAY |
| `kamino_withdraw` | Withdraw supplied collateral (supports 'max' for full withdrawal) | solana | high | APPROVAL |

### Supply Parameters (kamino_supply)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `asset` | string | yes | Token mint address to supply |
| `amount` | string | yes | Amount to supply (human-readable) |
| `market` | string | no | Market identifier (default: 'main') |

### Borrow Parameters (kamino_borrow)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `asset` | string | yes | Token mint address to borrow |
| `amount` | string | yes | Amount to borrow (human-readable) |
| `market` | string | no | Market identifier (default: 'main') |

### Repay Parameters (kamino_repay)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `asset` | string | yes | Token mint address to repay |
| `amount` | string | yes | Amount to repay, or 'max' for full repayment |
| `market` | string | no | Market identifier (default: 'main') |

### Withdraw Parameters (kamino_withdraw)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `asset` | string | yes | Token mint address to withdraw |
| `amount` | string | yes | Amount to withdraw, or 'max' for full withdrawal |
| `market` | string | no | Market identifier (default: 'main') |

### Safety Features

- **Health factor simulation**: Borrow and withdraw actions simulate the resulting health factor before execution. If the simulated HF falls below the configured threshold, the action is blocked to prevent self-liquidation.
- **Non-spending classification**: Kamino lending actions are classified as non-spending (no SPENDING_LIMIT deduction) since they involve lending/borrowing, not asset purchases.
- **Max amount support**: Repay and withdraw support 'max' to handle full debt repayment and full collateral withdrawal respectively.

### Examples

**REST API:**
```bash
curl -s -X POST http://localhost:3100/v1/actions/kamino/kamino_supply \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"params":{"asset":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"100","market":"main"},"wallet_id":"...","network":"solana-mainnet"}'
```

**MCP:**
```json
{
  "tool": "action_kamino_kamino_supply",
  "arguments": {
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": "100",
    "wallet_id": "...",
    "network": "solana-mainnet"
  }
}
```

**TypeScript SDK:**
```typescript
const tx = await client.executeAction('kamino', 'kamino_supply', {
  asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: '100',
  market: 'main',
}, { walletId: '...', network: 'solana-mainnet' });
```

**Python SDK:**
```python
tx = await client.execute_action("kamino", "kamino_supply", {
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": "100",
    "market": "main",
}, wallet_id="...", network="solana-mainnet")
```

### Position Monitoring

Kamino positions are automatically tracked via PositionTracker (5-minute sync interval) and stored in the defi_positions table. Use the position query endpoints to check current positions and health factor:

- **Positions**: `GET /v1/wallet/positions` or MCP tool `waiaas_get_defi_positions`
- **Health Factor**: `GET /v1/wallet/health-factor` or MCP tool `waiaas_get_health_factor`

## 10. Pendle Yield Trading -- Built-in Provider (EVM)

The Pendle Yield Trading provider uses the [Pendle Finance](https://pendle.finance/) protocol to buy/sell Principal Tokens (PT) and Yield Tokens (YT), redeem matured PT, and manage LP positions on EVM chains. It uses the Pendle REST API v2 for market discovery and transaction calldata building via the Convert endpoint.

> AI agents must NEVER request the master password. Use only your session token.

### Configuration

Enable Pendle Yield Trading via **Admin UI > DeFi (`#/defi`) > Pendle Yield**, or environment variables. API key is optional but recommended for higher rate limits.

| Setting | Env Variable | Default | Description |
| ------- | ------------ | ------- | ----------- |
| Enabled | `WAIAAS_ACTIONS_PENDLE_YIELD_ENABLED` | `false` | Enable Pendle Yield Trading provider |
| API Base URL | `WAIAAS_ACTIONS_PENDLE_YIELD_API_BASE_URL` | `https://api-v2.pendle.finance` | Pendle API v2 base URL |
| API Key | `WAIAAS_ACTIONS_PENDLE_YIELD_API_KEY` | (empty) | Optional API key for higher rate limits |
| Default Slippage (bps) | `WAIAAS_ACTIONS_PENDLE_YIELD_DEFAULT_SLIPPAGE_BPS` | `100` | Default slippage tolerance in basis points (100 = 1%) |
| Max Slippage (bps) | `WAIAAS_ACTIONS_PENDLE_YIELD_MAX_SLIPPAGE_BPS` | `500` | Maximum allowed slippage in basis points (500 = 5%) |
| Request Timeout (ms) | `WAIAAS_ACTIONS_PENDLE_YIELD_REQUEST_TIMEOUT_MS` | `10000` | API request timeout |
| Maturity Warning Days | `WAIAAS_ACTIONS_PENDLE_YIELD_MATURITY_WARNING_DAYS` | `7` | Days before maturity to send warning notifications |

### Available Actions

| Action | Description | Chain | Risk | Tier |
| ------ | ----------- | ----- | ---- | ---- |
| `buy_pt` | Buy Principal Token (PT) for fixed yield exposure | ethereum | medium | DELAY |
| `buy_yt` | Buy Yield Token (YT) for leveraged yield exposure | ethereum | high | DELAY |
| `redeem_pt` | Redeem matured PT for underlying asset (auto-detects pre/post-maturity) | ethereum | low | NOTIFY |
| `add_liquidity` | Add liquidity to Pendle market LP pool | ethereum | medium | DELAY |
| `remove_liquidity` | Remove liquidity from Pendle market LP pool | ethereum | low | NOTIFY |

### Supported Chains

| Network | Chain ID | WAIaaS Network Name |
| ------- | -------- | ------------------- |
| Ethereum | 1 | `ethereum-mainnet` |
| Arbitrum | 42161 | `arbitrum-mainnet` |
| Base | 8453 | `base-mainnet` |

### Buy PT Parameters (buy_pt)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `market` | string | Yes | Pendle market address (EVM hex address) |
| `tokenIn` | string | Yes | Input token address to swap from |
| `amountIn` | string | Yes | Amount in human-readable format (e.g., `"100"` for 100 USDC) |
| `slippage` | number | No | Slippage tolerance in basis points (defaults to `default_slippage_bps` setting) |

### Buy YT Parameters (buy_yt)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `market` | string | Yes | Pendle market address |
| `tokenIn` | string | Yes | Input token address to swap from |
| `amountIn` | string | Yes | Amount in human-readable format |
| `slippage` | number | No | Slippage tolerance in basis points |

### Redeem PT Parameters (redeem_pt)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `market` | string | Yes | Pendle market address |
| `amount` | string | Yes | Amount of PT to redeem |

### Add Liquidity Parameters (add_liquidity)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `market` | string | Yes | Pendle market address |
| `tokenIn` | string | Yes | Input token address |
| `amountIn` | string | Yes | Amount in human-readable format |
| `slippage` | number | No | Slippage tolerance in basis points |

### Remove Liquidity Parameters (remove_liquidity)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `market` | string | Yes | Pendle market address |
| `amount` | string | Yes | Amount of LP tokens to remove |
| `slippage` | number | No | Slippage tolerance in basis points |

### Safety Features

- **Maturity monitoring**: MaturityMonitor polls daily and sends MATURITY_WARNING notifications at 7 days, 1 day before maturity, and post-maturity for unredeemed PT positions.
- **Slippage clamping**: Slippage is clamped to `max_slippage_bps` to prevent excessive price impact.
- **Zod runtime validation**: All Pendle API responses (market list, convert) are validated against Zod schemas.
- **Provider-trust bypass**: When Pendle is enabled in Admin Settings, the CONTRACT_WHITELIST policy check is skipped for Pendle-resolved transactions.
- **Position tracking**: Yield positions (category=YIELD) are tracked in the defi_positions table with maturity metadata for monitoring.

### Maturity Monitoring

Pendle PT and YT positions have fixed maturity dates. The MaturityMonitor service checks positions daily and sends warnings:

1. **N-day warning** -- Position maturity is within configured `maturity_warning_days` (default 7)
2. **1-day warning** -- Position maturity is within 24 hours
3. **Post-maturity warning** -- Position has matured but PT has not been redeemed

**Notification event:** `MATURITY_WARNING`

### Example: Buy PT on Ethereum

**REST API:**
```bash
curl -s -X POST http://localhost:3100/v1/actions/pendle_yield/buy_pt \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "market": "0x...",
      "tokenIn": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "amountIn": "1000"
    },
    "network": "ethereum-mainnet"
  }'
```

**MCP Tool:**
```json
{
  "tool": "action_pendle_yield_buy_pt",
  "params": {
    "market": "0x...",
    "tokenIn": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "amountIn": "1000"
  },
  "network": "ethereum-mainnet"
}
```

**TypeScript SDK:**
```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', token: 'wai_sess_...' });

const tx = await client.executeAction('pendle_yield', 'buy_pt', {
  params: {
    market: '0x...',
    tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    amountIn: '1000',
  },
  network: 'ethereum-mainnet',
});
console.log('Transaction ID:', tx.id);
```

**Python SDK:**
```python
from waiaas import WAIaaSClient

async with WAIaaSClient(base_url="http://localhost:3100", token="wai_sess_...") as client:
    tx = await client.execute_action("pendle_yield", "buy_pt", {
        "market": "0x...",
        "tokenIn": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "amountIn": "1000",
    }, network="ethereum-mainnet")
    print("Transaction ID:", tx.id)
```

### Example: Redeem Matured PT

**REST API:**
```bash
curl -s -X POST http://localhost:3100/v1/actions/pendle_yield/redeem_pt \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "market": "0x...",
      "amount": "1000"
    },
    "network": "ethereum-mainnet"
  }'
```

**MCP Tool:**
```json
{
  "tool": "action_pendle_yield_redeem_pt",
  "params": {
    "market": "0x...",
    "amount": "1000"
  },
  "network": "ethereum-mainnet"
}
```

### Position Monitoring

Pendle yield positions are automatically tracked via PositionTracker and stored in the defi_positions table (category=YIELD). Use the position query endpoints:

- **Positions**: `GET /v1/wallet/positions` or MCP tool `waiaas_get_defi_positions`
- **Maturity alerts**: Configured via Admin UI > DeFi (`#/defi`) > Pendle Yield > Maturity Warning Days

## 11. Drift Perp Trading -- Built-in Provider (Solana)

The Drift Perp Trading provider uses the [Drift Protocol V2](https://drift.trade/) to open, close, and modify leveraged perpetual futures positions on Solana. It supports LONG/SHORT positions with market and limit orders, margin management, and automated position/margin monitoring.

> AI agents must NEVER request the master password. Use only your session token.

### Configuration

Enable Drift Perp Trading via **Admin UI > DeFi (`#/defi`) > Drift Perp**, or environment variables. No API key is required.

| Setting | Env Variable | Default | Description |
| ------- | ------------ | ------- | ----------- |
| Enabled | `WAIAAS_ACTIONS_DRIFT_ENABLED` | `false` | Enable Drift Perp Trading provider |
| Max Leverage | `WAIAAS_ACTIONS_DRIFT_MAX_LEVERAGE` | `5` | Maximum allowed leverage multiplier (policy enforcement) |
| Max Position Size (USD) | `WAIAAS_ACTIONS_DRIFT_MAX_POSITION_USD` | `10000` | Maximum single position size in USD (policy enforcement) |
| Margin Warning Threshold | `WAIAAS_ACTIONS_DRIFT_MARGIN_WARNING_THRESHOLD_PCT` | `0.15` | Margin ratio threshold for warning alerts (lower = more dangerous) |
| Position Sync Interval | `WAIAAS_ACTIONS_DRIFT_POSITION_SYNC_INTERVAL_SEC` | `60` | Position sync polling interval in seconds |

### Available Actions

| Action | Description | Chain | Risk | Tier |
| ------ | ----------- | ----- | ---- | ---- |
| `drift_open_position` | Open a leveraged perpetual position (LONG/SHORT) with market or limit order | solana | high | APPROVAL |
| `drift_close_position` | Close a perpetual position (full or partial close) | solana | medium | DELAY |
| `drift_modify_position` | Modify position size or pending order limit price | solana | high | APPROVAL |
| `drift_add_margin` | Deposit collateral to increase available margin | solana | low | INSTANT |
| `drift_withdraw_margin` | Withdraw excess collateral from margin account | solana | medium | DELAY |

### Supported Chains

| Network | WAIaaS Network Name |
| ------- | ------------------- |
| Solana Mainnet | `solana-mainnet` |

### Open Position Parameters (drift_open_position)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `market` | string | Yes | Market symbol (e.g., `"SOL-PERP"`) |
| `direction` | string | Yes | Position direction: `"LONG"` or `"SHORT"` |
| `size` | string | Yes | Base asset amount as string (e.g., `"100"`) |
| `leverage` | number | No | Desired leverage multiplier (1-100, derived from margin if omitted) |
| `orderType` | string | Yes | Order type: `"MARKET"` or `"LIMIT"` |
| `limitPrice` | string | Conditional | Required when orderType is `"LIMIT"` |

### Close Position Parameters (drift_close_position)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `market` | string | Yes | Market symbol (e.g., `"SOL-PERP"`) |
| `size` | string | No | Partial close amount; omit for full close |

### Modify Position Parameters (drift_modify_position)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `market` | string | Yes | Market symbol (e.g., `"SOL-PERP"`) |
| `newSize` | string | No | New position size (at least one of newSize or newLimitPrice required) |
| `newLimitPrice` | string | No | New limit price for pending order |

### Add Margin Parameters (drift_add_margin)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `amount` | string | Yes | Collateral amount as string (e.g., `"100"`) |
| `asset` | string | Yes | CAIP-19 asset identifier for collateral token |

### Withdraw Margin Parameters (drift_withdraw_margin)

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `amount` | string | Yes | Withdrawal amount as string |
| `asset` | string | Yes | CAIP-19 asset identifier for collateral token |

### Safety Features

- **Policy enforcement**: PerpPolicyEvaluator enforces max_leverage and max_position_usd limits. Exceeding warning zone triggers DELAY tier; exceeding hard limit triggers DENY.
- **Allowed markets**: PERP_ALLOWED_MARKETS policy restricts which markets can be traded (default-deny).
- **Margin monitoring**: MarginMonitor polls margin ratios and sends MARGIN_WARNING notifications at configurable thresholds (0.30 = warning, 0.15 = danger, 0.10 = critical/liquidation imminent).
- **Zod runtime validation**: All action inputs are validated against Zod schemas with refinement checks (e.g., limitPrice required for LIMIT orders).
- **Provider-trust bypass**: When Drift is enabled in Admin Settings, the CONTRACT_WHITELIST policy check is skipped for Drift-resolved transactions.
- **Position tracking**: Perp positions (category=PERP) are tracked in the defi_positions table with margin, leverage, unrealized PnL, and liquidation price metadata.

### Example: Open Long Position

**REST API:**
```bash
curl -s -X POST http://localhost:3100/v1/actions/drift_perp/drift_open_position \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "market": "SOL-PERP",
      "direction": "LONG",
      "size": "100",
      "leverage": 5,
      "orderType": "MARKET"
    },
    "network": "solana-mainnet"
  }'
```

**MCP Tool:**
```json
{
  "tool": "action_drift_perp_drift_open_position",
  "params": {
    "market": "SOL-PERP",
    "direction": "LONG",
    "size": "100",
    "leverage": 5,
    "orderType": "MARKET"
  },
  "network": "solana-mainnet"
}
```

**TypeScript SDK:**
```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({ baseUrl: 'http://localhost:3100', token: 'wai_sess_...' });

const tx = await client.executeAction('drift_perp', 'drift_open_position', {
  params: {
    market: 'SOL-PERP',
    direction: 'LONG',
    size: '100',
    leverage: 5,
    orderType: 'MARKET',
  },
  network: 'solana-mainnet',
});
console.log('Transaction ID:', tx.id);
```

**Python SDK:**
```python
from waiaas import WAIaaSClient

async with WAIaaSClient(base_url="http://localhost:3100", token="wai_sess_...") as client:
    tx = await client.execute_action("drift_perp", "drift_open_position", {
        "market": "SOL-PERP",
        "direction": "LONG",
        "size": "100",
        "leverage": 5,
        "orderType": "MARKET",
    }, network="solana-mainnet")
    print("Transaction ID:", tx.id)
```

### Example: Add Margin

**REST API:**
```bash
curl -s -X POST http://localhost:3100/v1/actions/drift_perp/drift_add_margin \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "amount": "50",
      "asset": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501"
    },
    "network": "solana-mainnet"
  }'
```

### Position Monitoring

Drift perp positions are automatically tracked via PositionTracker and stored in the defi_positions table (category=PERP). MarginMonitor checks margin ratios periodically and sends alerts.

- **Positions**: `GET /v1/wallets/:id/positions` or MCP tool `waiaas_get_defi_positions`
- **Margin alerts**: Automatic at thresholds 0.30 (warning), 0.15 (danger), 0.10 (critical)
- **Liquidation alerts**: LIQUIDATION_IMMINENT notification when approaching liquidation price

## 12. ERC-8004 Trustless Agents -- Built-in Provider (EVM)

The ERC-8004 provider enables on-chain agent identity registration, reputation management, and third-party validation via three Ethereum mainnet registries. Unlike DeFi providers, ERC-8004 actions manage agent metadata and trust relationships rather than financial transactions.

- **Provider name:** `erc8004_agent`
- **Chains:** ethereum (EVM)
- **Requires API key:** No
- **Feature gate:** `actions.erc8004_agent_enabled` (default: true since v30.11)
- **Provider-trust bypass:** Yes (CONTRACT_WHITELIST bypassed when enabled)

**8 actions:** register_agent, set_agent_wallet, unset_agent_wallet, set_agent_uri, set_metadata, give_feedback, revoke_feedback, request_validation.

For full action documentation, input schemas, SDK methods, and MCP tools, see **erc8004.skill.md**.

## 13. D'CENT Swap Aggregator -- Built-in Provider (Multi-Chain)

D'CENT Swap Aggregator aggregates multiple DEX providers to offer optimal swap routes across EVM chains and Solana. Supports same-chain DEX swaps (approve+txdata BATCH), cross-chain swaps (`cross_swap` providerType), and 2-hop auto-routing fallback when direct routes are unavailable.

- **Provider name:** `dcent_swap`
- **Chains:** ethereum, solana (multi-chain via provider network)
- **Requires API key:** No
- **Feature gate:** `actions.dcent_swap_enabled` (default: true)
- **Aggregated providers:** 1inch, SushiSwap, Uniswap Labs, SwapScanner, Rubic, ButterSwap, LI.FI
- **Provider types:** `swap` (same-chain DEX), `cross_swap` (cross-chain DEX)

### Actions (2)

| Action | Description | Tier | Risk |
|--------|-------------|------|------|
| `get_quotes` | Get swap quotes with provider comparison — supports same-chain and cross-chain swaps (informational) | INSTANT | low |
| `dex_swap` | Execute DEX swap — supports same-chain and cross-chain swaps (approve+txdata BATCH for ERC-20, single CONTRACT_CALL for native) | DELAY | high |

### Admin Settings Keys (5)

| Key | Default | Description |
|-----|---------|-------------|
| `actions.dcent_swap_enabled` | `true` | Enable/disable D'CENT Swap Aggregator |
| `actions.dcent_swap_api_url` | `https://agent-swap.dcentwallet.com` | D'CENT Swap API base URL |
| `actions.dcent_swap_default_slippage_bps` | `100` | Default slippage (1%) |
| `actions.dcent_swap_max_slippage_bps` | `500` | Maximum slippage (5%) |
| `actions.dcent_swap_currency_cache_ttl_ms` | `86400000` | Currency list cache TTL (24h) |

### Example: Get Quotes

```bash
curl -s -X POST http://localhost:3100/v1/actions/dcent_swap/get_quotes \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "fromAsset": "eip155:1/slip44:60",
      "toAsset": "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "amount": "1000000000000000000",
      "fromDecimals": 18,
      "toDecimals": 6
    },
    "network": "ethereum-mainnet"
  }'
```

### Example: DEX Swap

```bash
curl -s -X POST http://localhost:3100/v1/actions/dcent_swap/dex_swap \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -d '{
    "params": {
      "fromAsset": "eip155:1/slip44:60",
      "toAsset": "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "amount": "1000000000000000000",
      "fromDecimals": 18,
      "toDecimals": 6,
      "slippageBps": 100
    },
    "network": "ethereum-mainnet"
  }'
```

### Policy Interaction

- **DEX Swap (dex_swap):** Resolves to CONTRACT_CALL targeting DEX router address. Subject to CONTRACT_WHITELIST (provider-trust bypass applies when enabled), ALLOWED_TOKENS, APPROVED_SPENDERS, and SPENDING_LIMIT policies.
- **2-hop auto-routing:** When direct route unavailable (`fail_no_available_provider`), attempts intermediate token (ETH/USDC/USDT) routing. Multi-step BATCH with cumulative fee/slippage calculation.

### SDK Methods

```typescript
const quotes = await client.getDcentQuotes({ fromAsset, toAsset, amount, fromDecimals, toDecimals, network });
const swap = await client.dcentDexSwap({ fromAsset, toAsset, amount, fromDecimals, toDecimals, network });
```

### MCP Tools

- `action_dcent_swap_get_quotes` -- Get swap quotes from D'CENT Swap Aggregator
- `action_dcent_swap_dex_swap` -- Execute DEX swap via D'CENT Swap Aggregator

## 14. Across Bridge -- Built-in Provider (EVM)

Intent-based cross-chain bridge with fast relayer fills (2-10 seconds). Supports Ethereum, Arbitrum, Optimism, Base, Polygon, Linea.

### Prerequisites (Admin)
- Enable via Admin Settings: `actions.across_bridge_enabled = true`
- Add SpokePool addresses to CONTRACT_WHITELIST for each chain (or rely on provider-trust bypass)

### Admin Settings

| Key | Default | Description |
|-----|---------|-------------|
| `actions.across_bridge_enabled` | `false` | Enable Across Bridge |
| `actions.across_bridge_api_base_url` | `https://app.across.to/api` | API base URL |
| `actions.across_bridge_integrator_id` | (empty) | Integrator ID |
| `actions.across_bridge_fill_deadline_buffer_sec` | `21600` | Fill deadline buffer (6h) |
| `actions.across_bridge_default_slippage_pct` | `0.01` | Default slippage (1%) |
| `actions.across_bridge_max_slippage_pct` | `0.03` | Max slippage (3%) |
| `actions.across_bridge_request_timeout_ms` | `10000` | Request timeout (ms) |

### Available Actions

#### across_bridge / quote -- Get Bridge Quote

```bash
curl -s -X POST http://localhost:3100/v1/actions/across_bridge/quote \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -H 'Content-Type: application/json' \
  -d '{"params":{"fromChain":"ethereum","toChain":"arbitrum","inputToken":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","outputToken":"0xaf88d065e77c8cC2239327C5EDb3A432268e5831","amount":"1000000000"}}'
```

Returns: inputAmount, outputAmount, totalFee, feeBreakdown (lpFee, relayerCapitalFee, relayerGasFee), estimatedFillTimeSec, limits.

#### across_bridge / execute -- Execute Cross-chain Bridge

```bash
curl -s -X POST http://localhost:3100/v1/actions/across_bridge/execute \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -H 'Content-Type: application/json' \
  -d '{"params":{"fromChain":"ethereum","toChain":"arbitrum","inputToken":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","outputToken":"0xaf88d065e77c8cC2239327C5EDb3A432268e5831","amount":"1000000000"}}'
```

Executes approve+depositV3 BATCH (ERC-20) or single depositV3 with msg.value (native ETH). Bridge status tracked automatically via 2-phase polling.

#### across_bridge / status -- Check Bridge Status

```bash
curl -s -X POST http://localhost:3100/v1/actions/across_bridge/status \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -H 'Content-Type: application/json' \
  -d '{"params":{"depositTxHash":"0xabc..."}}'
```

Returns: status (filled/pending/expired/refunded), fillTxHash, depositId.

#### across_bridge / routes -- List Available Routes

```bash
curl -s -X POST http://localhost:3100/v1/actions/across_bridge/routes \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -H 'Content-Type: application/json' \
  -d '{"params":{}}'
```

Returns supported chain/token route combinations.

### MCP Tools (auto-registered)

- `action_across_bridge_quote` -- Get Across bridge quote
- `action_across_bridge_execute` -- Execute cross-chain bridge
- `action_across_bridge_status` -- Check bridge deposit status
- `action_across_bridge_routes` -- List available routes

## 15. Polymarket Prediction Market

Polymarket trades on Polygon using CLOB off-chain orders and CTF on-chain settlement. Two providers: `polymarket_order` (CLOB) and `polymarket_ctf` (on-chain). Requires Polygon wallet.

### Setup

```bash
curl -s -X POST http://localhost:3100/v1/wallets/${WALLET_ID}/polymarket/setup \
  -H 'Authorization: Bearer wai_sess_eyJ...'
```

### CLOB Trading Actions (polymarket_order)

| Action | Tier | Description |
|--------|------|-------------|
| `pm_buy` | APPROVAL | Buy outcome tokens |
| `pm_sell` | DELAY | Sell outcome tokens |
| `pm_cancel_order` | INSTANT | Cancel order by ID |
| `pm_cancel_all` | INSTANT | Cancel all orders |
| `pm_update_order` | DELAY | Update order (cancel+replace) |

### CTF On-chain Actions (polymarket_ctf)

| Action | Tier | Description |
|--------|------|-------------|
| `pm_split_position` | DELAY | Split USDC to outcome tokens |
| `pm_merge_positions` | DELAY | Merge outcome tokens to USDC |
| `pm_redeem_positions` | INSTANT | Redeem winning tokens |
| `pm_approve_collateral` | INSTANT | Approve USDC.e for CTF |
| `pm_approve_ctf` | INSTANT | Approve CTF ERC-1155 tokens |

### Admin Settings

| Key | Default | Description |
|-----|---------|-------------|
| `actions.polymarket_enabled` | `false` | Enable Polymarket |
| `actions.polymarket_default_fee_bps` | `0` | Default fee (bps) |
| `actions.polymarket_order_expiry_seconds` | `86400` | Order expiry |
| `actions.polymarket_max_position_usdc` | `1000` | Max position USDC |
| `actions.polymarket_proxy_wallet` | `false` | Proxy wallet mode |
| `actions.polymarket_neg_risk_enabled` | `true` | Neg risk routing |
| `actions.polymarket_auto_approve_ctf` | `true` | Auto approve CTF |

### Example: Buy on Prediction Market

```bash
curl -s -X POST http://localhost:3100/v1/actions/polymarket_order/pm_buy \
  -H 'Authorization: Bearer wai_sess_eyJ...' \
  -H 'Content-Type: application/json' \
  -d '{"walletId":"WALLET_ID","params":{"tokenId":"TOKEN_ID","price":"0.65","size":"100"}}'
```

See **polymarket.skill.md** for full reference.

## 16. Policy Integration

### CONTRACT_WHITELIST

Action providers resolve to `CONTRACT_CALL` transactions targeting external protocol contracts. Normally, the wallet must have a `CONTRACT_WHITELIST` policy that includes the target contract address.

**Jupiter Swap:** Jupiter program `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`.
**0x Swap:** AllowanceHolder contract `0x0000000000001fF3684f28c67538d4D072C22734`.
**LI.FI Bridge:** Routes are resolved dynamically by the LI.FI API (no fixed contract address). The target contract varies per bridge route and chain.

### Provider-Trust Bypass

When an action provider is **enabled** via Admin Settings, the CONTRACT_WHITELIST check is automatically skipped for transactions resolved by that provider. This is the **provider-trust** mechanism:

- Enabled providers are trusted at policy evaluation time (checked via SettingsService, not registration).
- The `actionProvider` field is auto-tagged by the ActionProviderRegistry after Zod validation -- providers cannot spoof this field.
- This means you do **not** need to manually whitelist the AllowanceHolder contract or Jupiter program when using built-in action providers. Enabling the provider in Admin Settings is sufficient.
- For LI.FI, provider-trust bypass is especially important since bridge routes resolve to different contracts dynamically. Manual whitelisting is impractical.

If you prefer explicit whitelisting (defense in depth), you can still add the contract addresses to CONTRACT_WHITELIST.

### SPENDING_LIMIT

The swap/bridge input amount is converted to USD via IPriceOracle and evaluated against any `SPENDING_LIMIT` policy on the wallet. This ensures DeFi operations respect the same spending controls as regular transfers.

**LI.FI bridge reservation lifecycle:** Bridge amounts are reserved against the spending limit when the transaction is submitted. The reservation is released on terminal states (COMPLETED, FAILED, REFUNDED) but **held** on TIMEOUT to prevent double-spend during manual resolution. This means the spending budget is not freed until the bridge completes or fails definitively.

## 17. Configuration via Admin Settings

Since v28.2, all action provider settings are managed via **Admin UI > DeFi (`#/defi`)** for DeFi providers and **Admin UI > Agent Identity (`#/agent-identity`)** for ERC-8004 (not config.toml). The Admin Settings UI provides:

- **Enable/disable toggle** per provider (takes effect immediately, no daemon restart)
- **API key management** (required for 0x Swap, optional for Jupiter Swap and LI.FI)
- **Slippage defaults** (default and max, in basis points for Jupiter/0x, in decimal for LI.FI)
- **Provider-specific settings** (base URL, timeout, Jito tip, max price impact)

Settings are stored in the database and take precedence over config.toml defaults. Environment variables (`WAIAAS_ACTIONS_*`) can override database values for deployment automation.

**Settings read priority:** Database (Admin UI) > Environment Variable > config.toml default > Code default.

Admin UI paths:
- **DeFi (`#/defi`)** -- DeFi provider configuration (Jupiter, 0x, LI.FI, Lido, Jito, Aave, Kamino, Pendle, Drift)
- **Agent Identity (`#/agent-identity`)** -- ERC-8004 provider configuration

Since v30.11, all 10 built-in providers are enabled by default on fresh install. No manual enablement is needed.

### Provider Status in Admin UI

The Admin UI shows a three-state status for each provider:
- **Active** -- Provider is enabled and registered (green)
- **Requires API Key** -- Provider is enabled but missing required API key (yellow, fires `ACTION_API_KEY_REQUIRED` notification)
- **Inactive** -- Provider is disabled (gray)

### Action Tier Override (v30.11)

Operators can override the default security tier for individual actions. This allows fine-grained control independent of policy tier assignment.

**Setting key pattern:** `actions.{provider}_{action}_tier` (e.g., `actions.jupiter_swap_swap_tier`, `actions.aave_v3_aave_supply_tier`)

**Values:** `INSTANT` / `NOTIFY` / `DELAY` / `APPROVAL` -- empty string or unset uses the provider's hardcoded default tier.

**Pipeline:** `effectiveTier = max(policyTier, actionTier)` -- the action tier is a floor that can only escalate the security level, never downgrade it. For example, if a SPENDING_LIMIT policy assigns INSTANT but the action tier override is DELAY, the effective tier is DELAY.

**Admin UI:** The tier dropdown appears in the Registered Actions table on both DeFi and Agent Identity pages. Overridden tiers show a "customized" badge. A "Reset to default" button restores the provider's hardcoded default.

**Cross-reference:** Policy tier escalation rules apply on top of action tier. See **policies.skill.md** Section 3.

## 18. Error Reference

| Code | HTTP | Description | Recovery |
|------|------|-------------|----------|
| `ACTION_NOT_FOUND` | 404 | Provider or action not registered. | Check available providers with GET /v1/actions/providers. |
| `API_KEY_REQUIRED` | 403 | Provider requires API key not configured. | Set API key via Admin UI > DeFi (`#/defi`). |
| `ACTION_VALIDATION_FAILED` | 400 | Input parameters failed validation. | Check params format in provider docs. |
| `ACTION_RESOLVE_FAILED` | 502 | Provider's resolve() call failed. | Check provider logs, verify params. |
| `ACTION_RETURN_INVALID` | 500 | Provider returned invalid ContractCallRequest. | Report to provider maintainer. |
| `CONTRACT_NOT_WHITELISTED` | 403 | Resolved contract not in whitelist (provider-trust not applicable). | Add contract to CONTRACT_WHITELIST or enable the provider. |
| `POLICY_VIOLATION` | 403 | Transaction blocked by policy. | Check policies with GET /v1/policies. |
| `PRICE_IMPACT_TOO_HIGH` | 502 | Price impact exceeds configured maximum (Jupiter). | Reduce swap amount or increase max_price_impact_pct. |
| `LIQUIDITY_UNAVAILABLE` | 502 | No liquidity available for the swap pair (0x). | Try a different token pair or smaller amount. |
| `INVALID_INSTRUCTION` | 400 | Chain not supported by LI.FI integration. | Use one of the supported chains: solana, ethereum, polygon, arbitrum, optimism, base. |
| `ACTION_API_ERROR` | 502 | LI.FI API returned an error. | Check LI.FI API status, verify parameters, retry. |

## 19. MCP Auto-Registration

When a provider has `mcpExpose: true` in its metadata, the MCP server automatically registers each action as an MCP tool using the naming convention:

```
action_{provider_name}_{action_name}
```

**Current MCP tools (26 action tools):**
- `action_jupiter_swap_swap` -- Jupiter Swap on Solana
- `action_zerox_swap_swap` -- 0x Swap on EVM chains
- `action_lifi_cross_swap` -- LI.FI Cross-Chain Swap (multi-chain)
- `action_lifi_bridge` -- LI.FI Cross-Chain Bridge (multi-chain)
- `action_lido_staking_stake` -- Lido ETH to stETH staking (Ethereum)
- `action_lido_staking_unstake` -- Lido stETH to ETH withdrawal (Ethereum)
- `action_jito_staking_stake` -- Jito SOL to JitoSOL staking (Solana)
- `action_jito_staking_unstake` -- Jito JitoSOL to SOL withdrawal (Solana)
- `action_aave_v3_aave_supply` -- Aave V3 supply collateral (EVM)
- `action_aave_v3_aave_borrow` -- Aave V3 borrow assets (EVM)
- `action_aave_v3_aave_repay` -- Aave V3 repay debt (EVM)
- `action_aave_v3_aave_withdraw` -- Aave V3 withdraw collateral (EVM)
- `action_kamino_kamino_supply` -- Kamino supply collateral (Solana)
- `action_kamino_kamino_borrow` -- Kamino borrow assets (Solana)
- `action_kamino_kamino_repay` -- Kamino repay debt (Solana)
- `action_kamino_kamino_withdraw` -- Kamino withdraw collateral (Solana)
- `action_pendle_yield_buy_pt` -- Pendle buy Principal Token (EVM)
- `action_pendle_yield_buy_yt` -- Pendle buy Yield Token (EVM)
- `action_pendle_yield_redeem_pt` -- Pendle redeem matured PT (EVM)
- `action_pendle_yield_add_liquidity` -- Pendle add LP (EVM)
- `action_pendle_yield_remove_liquidity` -- Pendle remove LP (EVM)
- `action_drift_perp_drift_open_position` -- Drift open perpetual position (Solana)
- `action_drift_perp_drift_close_position` -- Drift close perpetual position (Solana)
- `action_drift_perp_drift_modify_position` -- Drift modify perpetual position (Solana)
- `action_drift_perp_drift_add_margin` -- Drift deposit margin collateral (Solana)
- `action_drift_perp_drift_withdraw_margin` -- Drift withdraw margin collateral (Solana)
- `action_erc8004_agent_register_agent` -- Register agent on ERC-8004 Identity Registry (EVM)
- `action_erc8004_agent_set_agent_wallet` -- Link wallet via EIP-712 signature (EVM)
- `action_erc8004_agent_unset_agent_wallet` -- Unlink wallet from agent identity (EVM)
- `action_erc8004_agent_set_agent_uri` -- Set registration file URI (EVM)
- `action_erc8004_agent_set_metadata` -- Set agent metadata key-value (EVM)
- `action_erc8004_agent_give_feedback` -- Submit reputation feedback (EVM)
- `action_erc8004_agent_revoke_feedback` -- Revoke reputation feedback (EVM)
- `action_erc8004_agent_request_validation` -- Request third-party validation (EVM)

Auto-registration happens after MCP server connection via `registerActionProviderTools()`. The tool list is refreshed on each session. If the REST API is unavailable, MCP enters degraded mode (14 built-in tools remain, action provider tools are skipped).

MCP tool parameters:
- `params` (optional object): Action-specific parameters as key-value pairs
- `network` (optional string): Target network
- `wallet_id` (optional string): Target wallet ID

## 20. Related Skill Files

- **admin.skill.md** -- API key management, Admin Settings, daemon admin
- **transactions.skill.md** -- 5-type transaction reference (actions execute as CONTRACT_CALL)
- **policies.skill.md** -- Policy management (CONTRACT_WHITELIST, SPENDING_LIMIT, REPUTATION_THRESHOLD)
- **wallet.skill.md** -- Wallet CRUD, sessions, assets
- **erc8004.skill.md** -- ERC-8004 trustless agent identity and reputation
- **polymarket.skill.md** -- Polymarket prediction market trading (CLOB + CTF)
