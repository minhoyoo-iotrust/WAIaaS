# Technology Stack: EVM RPC Proxy Mode

**Project:** WAIaaS v31.14 -- EVM JSON-RPC Proxy
**Researched:** 2026-03-13
**Overall confidence:** HIGH

## Executive Summary

EVM RPC Proxy mode requires **zero new npm dependencies**. The existing stack (Hono 4.x, viem 2.x, Zod 3.x) already provides everything needed for JSON-RPC 2.0 protocol handling, contract deployment transaction building, and long-poll async patterns. This is a routing/integration feature, not a technology adoption challenge.

## Recommended Stack Additions

### No New Dependencies Required

| Capability | Existing Technology | Why Sufficient |
|-----------|-------------------|---------------|
| JSON-RPC 2.0 parsing | Zod 3.x (already installed) | JSON-RPC 2.0 is trivial schema: `{jsonrpc, method, params, id}`. Zod schema validation is 10 lines. No library needed |
| HTTP long-poll | Hono 4.x + native Promise | Long-poll = hold HTTP response until Promise resolves. `await Promise.race([completionPromise, timeoutPromise])`. No SSE/WS library needed |
| Contract deploy TX | viem 2.x `serializeTransaction` | `to: undefined` in viem's serializeTransaction creates CREATE opcode TX. Already used in `buildTransaction()` and `buildContractCall()` |
| Bytecode keccak256 | viem 2.x `keccak256` | `import { keccak256 } from 'viem'` -- already available, used elsewhere in codebase |
| RPC passthrough | Existing RPC Pool (v28.6) | Multi-endpoint rotation + health check already built. Passthrough = `fetch(rpcUrl, { body: JSON.stringify(rpcRequest) })` |
| Chain ID mapping | `EVM_CHAIN_MAP` (evm-chain-map.ts) | 12 networks already mapped with `chainId` field. Reverse lookup (chainId number -> NetworkType slug) is a simple Object.entries filter |
| EventBus completion | EventBus `transaction:completed`/`transaction:failed` | Already emitted in Stage 5/6. RPC handler subscribes, wraps in Promise |
| AbortController | Node.js 22 built-in | `c.req.raw.signal` from Hono context for client disconnect detection |

### Why NOT to Add Dependencies

| Considered Library | Why Rejected |
|-------------------|-------------|
| `jayson` / `json-rpc-2.0` | JSON-RPC 2.0 protocol is 50 lines of Zod schema + dispatcher. Adding a library for this creates dependency risk for trivial functionality. The spec is: `{jsonrpc: "2.0", method: string, params: array|object, id: number|string|null}` |
| `http-proxy` / `http-proxy-middleware` | Passthrough is a single `fetch()` call forwarding the JSON body to RPC Pool. No header rewriting, no WebSocket upgrade, no streaming needed |
| `long-polling` libraries | Long-poll = `await new Promise(resolve => eventBus.on('transaction:completed', resolve))` with `setTimeout` for timeout. No library |
| `@open-rpc/server` | Over-engineered for our use case. We intercept 6 methods and proxy the rest. OpenRPC schema generation is unnecessary |

## Integration Points with Existing Stack

### 1. Hono Route Registration

RPC proxy route is a standard Hono POST handler, NOT an OpenAPIHono `createRoute()`. Reason: JSON-RPC 2.0 has its own error envelope (`{jsonrpc: "2.0", error: {code, message}}`), incompatible with OpenAPI error schemas. Use plain `app.post('/v1/rpc-evm/:walletId/:chainId', handler)`.

```typescript
// In server.ts -- register as plain Hono router (not OpenAPIHono)
import { Hono } from 'hono';
const rpcProxyRouter = new Hono();
rpcProxyRouter.post('/rpc-evm/:walletId/:chainId', rpcProxyHandler);
app.route('/v1', rpcProxyRouter);
```

**Confidence:** HIGH -- verified by examining `server.ts` line 176 (`new OpenAPIHono()`) and how other routes mix `OpenAPIHono` sub-routers with plain Hono. `wcRoutes` uses similar pattern.

### 2. Session Auth Middleware

```typescript
// In server.ts auth registration block (~line 273)
if (deps.jwtSecretManager && deps.db) {
  const sessionAuth = createSessionAuth({ ... });
  app.use('/v1/rpc-evm/*', sessionAuth);
}
```

Authentication uses existing `Authorization: Bearer wai_sess_<token>` header. Forge/Hardhat pass custom headers via environment:
- Forge: `ETH_RPC_HEADERS='Authorization: Bearer wai_sess_xxx'`
- Hardhat: `httpHeaders: { 'Authorization': 'Bearer wai_sess_xxx' }` in network config

**Confidence:** HIGH -- sessionAuth middleware already supports wildcard paths.

### 3. Pipeline Integration (Sync Mode)

Current REST API flow (`transactions.ts` line 1-17 comment): Stage 1 runs sync, returns 201, Stages 2-6 fire-and-forget.

RPC Proxy needs: Stage 1-6 ALL synchronous, return txHash in JSON-RPC response.

**Implementation approach:** Use `TransactionPipeline.executeSend()` directly (already runs all 6 stages synchronously and returns txId). Then query the transaction record for txHash. The pipeline class at `pipeline.ts` line 105-111 already `await`s all stages sequentially. The fire-and-forget behavior is in the **route handler** (`transactions.ts`), not in the pipeline itself.

```typescript
// RPC proxy handler (simplified)
const txId = await pipeline.executeSend(walletId, request);
const tx = await pipeline.getTransaction(txId);
return jsonRpcResponse(id, tx.txHash);
```

For DELAY/APPROVAL tiers: `executeSend()` already blocks through Stage 4 (wait/approval). The long-poll just needs to hold the HTTP connection. Add `AbortController` timeout via `Promise.race()`.

**Confidence:** HIGH -- verified `TransactionPipeline.executeSend()` at pipeline.ts lines 68-113 is fully synchronous (all stages awaited).

### 4. EventBus for Completion Tracking (APPROVAL tier)

When approval is pending, `executeSend()` blocks at Stage 4. The existing `onApproved` callback in ApprovalWorkflow resolves when owner approves. If the pipeline is already blocking at Stage 4, no additional EventBus wiring is needed for the basic case.

For timeout handling:
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), approvalTimeoutMs);
try {
  const txId = await pipeline.executeSend(walletId, request);
  // Success -- pipeline completed all 6 stages
} catch (err) {
  if (controller.signal.aborted) {
    return jsonRpcError(id, -32000, 'Transaction approval timeout');
  }
  throw err;
} finally {
  clearTimeout(timeout);
}
```

**Confidence:** HIGH -- EventBus events at stages.ts lines 1535-1536 (completed) and 1567 (failed) confirmed.

### 5. EVM Chain Map Reverse Lookup

Current `EVM_CHAIN_MAP` maps `NetworkType -> EvmChainEntry`. RPC proxy needs reverse: `chainId number -> NetworkType`.

Add helper function (not a new module):
```typescript
export function evmChainIdToNetwork(chainId: number): EvmNetworkType | null {
  for (const [network, entry] of Object.entries(EVM_CHAIN_MAP)) {
    if (entry.chainId === chainId) return network as EvmNetworkType;
  }
  return null;
}
```

**Confidence:** HIGH -- `EVM_CHAIN_MAP` at evm-chain-map.ts has `chainId` field on every entry.

### 6. Contract Deploy Transaction (buildDeployTransaction)

Existing `buildContractCall()` (adapter.ts line 639) requires `to` address and validates calldata has 4-byte selector. For CREATE transactions, `to` is undefined and data is full bytecode (no selector validation).

New method needed: `buildDeployTransaction(request: DeployParams)` -- similar to `buildContractCall()` but:
- `to: undefined` (CREATE opcode)
- No calldata selector validation (bytecode, not function call)
- Gas estimation with `to: undefined`

viem's `serializeTransaction()` already handles `to: undefined` -- it omits the `to` field in RLP encoding, which produces a CREATE transaction. Verified: viem's `TransactionRequestEIP1559` type has `to?: Address | null`.

```typescript
interface DeployParams {
  from: string;
  data: Hex;    // Full deployment bytecode
  value?: bigint; // ETH to send to constructor (payable)
}
```

**Confidence:** HIGH -- viem serializeTransaction with `to: undefined` confirmed to produce CREATE TX.

### 7. tx-parser.ts Extension for NFT Selectors

Current selectors detected (tx-parser.ts lines 16-18):
- `0xa9059cbb` -- ERC-20 transfer
- `0x095ea7b3` -- ERC-20 approve

New selectors needed for RPC proxy (per m31-14 R2-1):
- `0x42842e0e` -- ERC-721 safeTransferFrom(address,address,uint256)
- `0xb88d4fde` -- ERC-721 safeTransferFrom(address,address,uint256,bytes)
- `0x23b872dd` -- transferFrom (ERC-721/ERC-20 ambiguous -- fallback to CONTRACT_CALL)
- `0xf242432a` -- ERC-1155 safeTransferFrom
- `0x2eb2c2d6` -- ERC-1155 safeBatchTransferFrom

This is a small code change to existing tx-parser.ts, not a stack decision.

## JSON-RPC 2.0 Protocol Implementation

### Request Schema (Zod)

```typescript
const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.union([z.array(z.unknown()), z.record(z.unknown())]).optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
});

// Batch: z.array(JsonRpcRequestSchema) -- or single object
const JsonRpcInputSchema = z.union([
  JsonRpcRequestSchema,
  z.array(JsonRpcRequestSchema).min(1),
]);
```

### Response Format

```typescript
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
```

### Standard Error Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| -32700 | Parse error | Invalid JSON body |
| -32600 | Invalid Request | Missing jsonrpc/method fields |
| -32601 | Method not found | Unsupported RPC method |
| -32602 | Invalid params | Bad params (e.g., unknown chainId) |
| -32603 | Internal error | Pipeline/adapter failures |
| -32000 | Server error (custom) | Transaction rejected/timeout |

**Confidence:** HIGH -- JSON-RPC 2.0 spec is stable and well-defined.

## Forge/Hardhat Compatibility Notes

### Forge (Foundry)

| Aspect | Detail | Source |
|--------|--------|--------|
| HTTP method | POST with `Content-Type: application/json` | Forge docs |
| TX method | `eth_sendTransaction` (when `--unlocked`) | [Foundry #4831](https://github.com/foundry-rs/foundry/issues/4831) |
| Default timeout | ~45 seconds (constant, not configurable for eth_sendTransaction) | [Foundry #9303](https://github.com/foundry-rs/foundry/issues/9303) |
| Custom headers | `ETH_RPC_HEADERS` env var | Forge docs |
| Batch requests | Yes, sends batched calls for gas estimation + send | Observed behavior |
| Receipt polling | `eth_getTransactionReceipt` polling after send | Standard behavior |
| Chain ID check | Calls `eth_chainId` before sending transactions | Standard behavior |

**Critical:** Forge's 45s timeout for `eth_sendTransaction` is hardcoded. DELAY tier (default 300s) and APPROVAL tier (default 600s) will ALWAYS timeout on Forge side. Mitigation options:
1. Document: users must set `--timeout 600` for Forge scripts (only works for receipt polling, NOT eth_sendTransaction)
2. IMMEDIATE tier policy for dev/test scenarios (recommended default for RPC proxy)
3. `ETH_RPC_TIMEOUT` env var for `cast send` (but NOT for `forge script`)
4. Consider lowering default DELAY timeout specifically for RPC proxy context

**Confidence:** MEDIUM -- Foundry #9303 and #8667 confirm the timeout limitation, but exact behavior may have changed in recent Foundry releases.

### Hardhat

| Aspect | Detail | Source |
|--------|--------|--------|
| Default timeout | 40,000ms (localhost), 20,000ms (remote) | [Hardhat config docs](https://v2.hardhat.org/hardhat-runner/docs/config) |
| Configurable | Yes: `networks.myNet.timeout: 600000` | Hardhat config |
| Custom headers | `httpHeaders: { 'Authorization': '...' }` | Hardhat config |
| Batch requests | No batching by default | Standard behavior |

### ethers.js / viem (client libraries)

Both support custom RPC URLs and configurable timeouts. No compatibility issues expected.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|------------|-------------|---------|
| JSON-RPC parsing | Zod manual schema | `jayson` npm package | Unnecessary dependency for 50 lines of code |
| RPC passthrough | Direct `fetch()` to RPC Pool | `http-proxy-middleware` | WAIaaS doesn't need header rewriting or streaming; it's JSON POST forwarding |
| Long-poll | Native Promise + EventBus | WebSocket upgrade | Forge/Hardhat don't support WS for `eth_sendTransaction`; HTTP POST only |
| Route framework | Plain Hono handler | OpenAPIHono createRoute | JSON-RPC error envelope differs from REST; OpenAPI schema mismatch |
| Deploy TX | New `buildDeployTransaction()` | Modify `buildContractCall()` | Different validation rules (`to` optional, no selector check); cleaner separation |

## Version Confirmation

| Technology | Current Version | Verified |
|-----------|----------------|----------|
| hono | ^4.11.9 | package.json |
| viem | ^2.21.0 | package.json |
| zod | ^3.24.0 | package.json |
| Node.js | 22.x | Project requirement |

All versions already installed. No version bumps needed for this feature.

## Installation

```bash
# No new packages to install.
# All capabilities are covered by existing dependencies:
#   - hono 4.x -- HTTP routing, plain POST handler for JSON-RPC
#   - viem 2.x -- serializeTransaction (to:undefined for CREATE), keccak256
#   - zod 3.x -- JSON-RPC request/response schema validation
#   - Node.js 22 built-in -- AbortController, Promise.race for long-poll
#   - Existing RPC Pool (v28.6) -- passthrough forwarding
#   - Existing EventBus -- transaction:completed/failed events
#   - Existing TransactionPipeline -- synchronous 6-stage execution
```

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| No new deps needed | HIGH | Verified all capabilities against existing codebase |
| Pipeline sync mode | HIGH | `TransactionPipeline.executeSend()` confirmed synchronous |
| viem CREATE TX | HIGH | `serializeTransaction()` with `to: undefined` is standard viem usage |
| JSON-RPC 2.0 Zod | HIGH | Protocol spec is trivial; Zod is already the project's SSoT tool |
| Forge timeout issue | MEDIUM | Confirmed via GitHub issues, but exact behavior may vary by Foundry version |
| Hono plain route | HIGH | Verified mixing OpenAPIHono + plain Hono routes in server.ts |
| EVM_CHAIN_MAP reverse | HIGH | Verified chainId field exists on all 12 entries |
| Long-poll pattern | HIGH | Standard Node.js Promise + AbortController pattern |

## Sources

- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification) -- protocol spec
- [Foundry #9303 - RPC timeout configuration](https://github.com/foundry-rs/foundry/issues/9303) -- Forge timeout limitation
- [Foundry #8667 - Forge script timeout](https://github.com/foundry-rs/foundry/issues/8667) -- Forge timeout feature request
- [Foundry #4831 - eth_sendTransaction vs eth_sendRawTransaction](https://github.com/foundry-rs/foundry/issues/4831) -- Forge `--unlocked` behavior
- [Hardhat Configuration](https://v2.hardhat.org/hardhat-runner/docs/config) -- timeout and httpHeaders config
- [viem deployContract docs](https://viem.sh/docs/contract/deployContract) -- CREATE transaction handling
- [viem sendTransaction docs](https://viem.sh/docs/actions/wallet/sendTransaction.html) -- `to` field optional for deploy
- Codebase verification: `server.ts`, `pipeline.ts`, `stages.ts`, `tx-parser.ts`, `evm-chain-map.ts`, `event-types.ts`, `adapter.ts`
