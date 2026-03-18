---
name: "WAIaaS RPC Proxy"
description: "EVM JSON-RPC proxy mode: use Forge/Hardhat/ethers.js/viem with WAIaaS policy engine via --rpc-url"
category: "api"
tags: [wallet, blockchain, ethereum, evm, rpc, forge, hardhat, viem, waiass]
version: "3.0.0-rc"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---

# WAIaaS EVM RPC Proxy

EVM JSON-RPC proxy that lets standard EVM tools (Forge, Hardhat, ethers.js, viem) use WAIaaS wallets by changing `--rpc-url`. All transactions go through the WAIaaS policy engine + signing pipeline.

> AI agents must NEVER request the master password. Use only your session token.

## Quick Start

```bash
# 1. Enable RPC proxy (Admin -- see docs/admin-manual/daemon-operations.md)
# Admin enables rpc_proxy.enabled=true via Admin UI or Settings API

# 2. Use with Forge (Agent session)
forge script Deploy.s.sol --broadcast --timeout 600 \
  --rpc-url "http://localhost:3100/v1/rpc-evm/{walletId}/1" \
  --headers "Authorization: Bearer $SESSION_TOKEN"

# 3. Use with viem/ethers.js
const transport = http("http://localhost:3100/v1/rpc-evm/{walletId}/1", {
  fetchOptions: { headers: { Authorization: `Bearer ${token}` } }
});
```

## Endpoint

```
POST /v1/rpc-evm/:walletId/:chainId
Authorization: Bearer <session-token>
Content-Type: application/json
```

- `walletId`: WAIaaS wallet ID
- `chainId`: EVM chain ID number (1=Ethereum, 8453=Base, 42161=Arbitrum, etc.)

## Supported Methods

### Signing Methods (intercepted by WAIaaS pipeline)

| Method | WAIaaS Action |
|--------|--------------|
| `eth_sendTransaction` | 6-stage pipeline (tx-parser classifies type) |
| `eth_signTransaction` | Sign-only pipeline (no broadcast) |
| `eth_accounts` / `eth_requestAccounts` | Returns session wallet address |
| `eth_sign` | Sign message pipeline |
| `personal_sign` | Sign message pipeline |
| `eth_signTypedData_v4` | EIP-712 signing pipeline |
| `eth_sendRawTransaction` | **Rejected** (pre-signed tx bypasses policy) |

### Transaction Type Classification

| Condition | Type |
|-----------|------|
| `to=null` | CONTRACT_DEPLOY (APPROVAL tier default) |
| `to` + no data | TRANSFER |
| `to` + `0xa9059cbb` selector | TOKEN_TRANSFER |
| `to` + `0x095ea7b3` selector | APPROVE |
| `to` + NFT selectors | NFT_TRANSFER |
| `to` + other data | CONTRACT_CALL |

### Read Methods (proxied to RPC Pool)

`eth_call`, `eth_estimateGas`, `eth_getBalance`, `eth_getTransactionReceipt`, `eth_getTransactionByHash`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getBlockByHash`, `eth_chainId`, `net_version`, `eth_gasPrice`, `eth_feeHistory`, `eth_getCode`, `eth_getStorageAt`, `eth_getLogs`, `eth_getTransactionCount`, `web3_clientVersion`

## Async Approval

| Policy Tier | Behavior |
|-------------|----------|
| IMMEDIATE | Instant sign + JSON-RPC response |
| DELAY | Long-poll HTTP (default 300s timeout) |
| APPROVAL | Long-poll HTTP, wait for Owner approval (default 600s timeout) |

Timeout returns JSON-RPC error `-32000` with transaction ID.

**Important:** Set client timeout >= approval timeout:
- Forge: `--timeout 600`
- Hardhat: `timeout` in config
- viem: `timeout` option on transport

## Agent Discovery

### MCP Tool
```
get_rpc_proxy_url(walletId, chainId) → URL string
```

### SDK
```typescript
const url = await client.getRpcProxyUrl(walletId, chainId);
```

### connect-info
```json
{
  "rpcProxy": {
    "enabled": true,
    "baseUrl": "http://localhost:3100/v1/rpc-evm"
  }
}
```

## Admin Settings

| Key | Default | Description |
|-----|---------|-------------|
| `rpc_proxy.enabled` | `false` | Enable/disable RPC proxy |
| `rpc_proxy.allowed_methods` | `*` | Method whitelist |
| `rpc_proxy.delay_timeout_seconds` | `300` | DELAY tier timeout |
| `rpc_proxy.approval_timeout_seconds` | `600` | APPROVAL tier timeout |
| `rpc_proxy.max_gas_limit` | `30000000` | Max gas per transaction |
| `rpc_proxy.max_bytecode_size` | `49152` | Max deploy bytecode (48KB) |
| `rpc_proxy.log_retention_hours` | `24` | Request log retention |

## Security

- Session authentication required (Bearer JWT)
- `from` field validated against session wallet address (auto-filled if omitted)
- All signing transactions logged with `source: 'rpc-proxy'`
- Bytecode size limit enforced (default 48KB)
- Rate limiting via existing API policy

## Batch Requests

Send array of JSON-RPC calls:
```json
[
  {"jsonrpc":"2.0","method":"eth_chainId","id":1},
  {"jsonrpc":"2.0","method":"eth_getBalance","params":["0x...","latest"],"id":2}
]
```

## Error Codes

| Code | Meaning |
|------|---------|
| `-32600` | Invalid JSON-RPC request |
| `-32601` | Method not supported |
| `-32602` | Unknown chainId |
| `-32000` | Transaction timeout/rejected |
