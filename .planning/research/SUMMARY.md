# Project Research Summary

**Project:** WAIaaS v31.14 -- EVM JSON-RPC Proxy
**Domain:** EVM JSON-RPC proxy mode for Forge/Hardhat/ethers.js/viem compatibility
**Researched:** 2026-03-13
**Confidence:** HIGH

## Executive Summary

EVM RPC Proxy is a **routing/integration feature**, not a technology adoption challenge. The entire implementation requires zero new npm dependencies -- existing Hono 4.x, viem 2.x, and Zod 3.x provide all capabilities needed for JSON-RPC 2.0 protocol handling, contract deployment, and long-poll async patterns. The architecture integrates as a new route layer on the existing daemon, reusing the 6-stage pipeline, policy engine, RPC Pool, EventBus, and tx-parser without modification to their core logic. The key innovation is a `CompletionWaiter` that wraps the existing fire-and-forget pipeline into synchronous responses via EventBus event subscription.

The primary risks center on **protocol-level correctness** and **timing mismatches**. Node.js's 5-second `keepAliveTimeout` will kill long-poll connections unless explicitly overridden. Forge's hardcoded 45-second timeout is shorter than WAIaaS DELAY (300s) and APPROVAL (600s) tiers, creating an unavoidable client-side timeout for non-IMMEDIATE policies. The CONTRACT_DEPLOY type addition requires exhaustive propagation through the Zod SSoT chain (12+ touchpoints including switch/case branches, DB CHECK constraints, Admin UI, and policy engine). Forge script multi-TX scenarios demand a local nonce tracker to prevent nonce collisions when transactions are queued in the pipeline.

The recommended approach is a 4-phase build: (1) Foundation -- JSON-RPC protocol utils, CONTRACT_DEPLOY type system expansion, and infrastructure prep; (2) Core RPC proxy -- transaction adapter, completion waiter, passthrough, and sync pipeline executor; (3) Route assembly -- dispatcher, method handlers, Hono route registration; (4) DX integration -- Admin Settings/UI, MCP tool, SDK method, and E2E testing with Forge/Hardhat.

## Key Findings

### Recommended Stack

No new dependencies. All capabilities map to existing stack components already installed and proven in the codebase. See `.planning/research/STACK.md` for full analysis.

**Core technologies (all existing):**
- **Hono 4.x**: Plain `app.post()` route (NOT OpenAPIHono) -- JSON-RPC error envelope differs from REST OpenAPI
- **Zod 3.x**: JSON-RPC 2.0 request/response schema (trivial: 10 lines) -- no `jayson` library needed
- **viem 2.x**: `serializeTransaction({ to: undefined })` for CREATE TX, `keccak256` for bytecode hashing
- **RPC Pool (v28.6)**: Passthrough forwarding via single `fetch()` call -- no `http-proxy-middleware` needed
- **EventBus**: `transaction:completed`/`transaction:failed` events for completion tracking
- **Node.js 22 built-in**: `AbortController` + `Promise.race()` for long-poll timeout

### Expected Features

See `.planning/research/FEATURES.md` for complete table with complexity ratings and dependencies.

**Must have (table stakes):**
- `eth_sendTransaction` intercept with 6-stage pipeline sync execution
- `eth_accounts` / `eth_chainId` / `net_version` intercept
- ~20 passthrough read methods (`eth_call`, `eth_getBalance`, etc.) via RPC Pool
- JSON-RPC 2.0 protocol compliance (id type preservation, batch support, standard error codes)
- Session auth via `Authorization: Bearer` header
- `from` address validation/auto-fill
- `personal_sign` and `eth_signTypedData_v4` signing support

**Should have (differentiators):**
- CONTRACT_DEPLOY as separate policy type (9th transaction type) with bytecodeHash audit trail
- Long-poll async approval for DELAY/APPROVAL tiers (transparent to Forge/Hardhat)
- Admin Settings runtime toggle (`rpc_proxy.*`) with hot-reload
- MCP `get_rpc_proxy_url` tool for AI agent self-discovery
- SDK `getRpcProxyUrl()` + connect-info extension
- Audit log integration with `source: 'rpc-proxy'`

**Defer (v2+):**
- WebSocket RPC (`eth_subscribe`, `eth_newFilter`) -- HTTP POST covers Forge/Hardhat 100%
- Response caching -- unnecessary without performance issues
- Solana RPC proxy -- entirely different protocol, separate milestone
- `eth_sendRawTransaction` support -- bypasses policy engine, explicitly rejected
- EIP-4337 UserOp RPC -- existing UserOp API (v31.2) covers this

### Architecture Approach

See `.planning/research/m31-14-rpc-proxy-ARCHITECTURE.md` for component diagrams, data flows, and build order.

The architecture adds 8 new components (`rpc-proxy.ts` route, `RpcDispatcher`, `RpcMethodHandlers`, `RpcPassthrough`, `SyncPipelineExecutor`, `CompletionWaiter`, `RpcTransactionAdapter`, JSON-RPC utils) and modifies 7 existing ones (EVM_CHAIN_MAP, tx-parser, TRANSACTION_TYPES, TransactionRequestSchema, PipelineContext, SettingsSchema, connect-info). The critical design decision is using **external PIPELINE_HALTED catch** in SyncPipelineExecutor rather than adding `syncMode` branching inside stage4Wait -- this keeps the existing fire-and-forget pipeline untouched.

**Major components:**
1. **RpcDispatcher** -- classifies methods as INTERCEPT / PASSTHROUGH / UNSUPPORTED
2. **SyncPipelineExecutor** -- runs stage1-6 synchronously, catches PIPELINE_HALTED and delegates to CompletionWaiter
3. **CompletionWaiter** -- `txId -> Promise<txHash>` map with EventBus subscription (2 global listeners only)
4. **RpcTransactionAdapter** -- converts `eth_sendTransaction` params to WAIaaS TransactionRequest with tx-parser type classification
5. **RpcPassthrough** -- forwards read methods to upstream RPC via RPC Pool

### Critical Pitfalls

See `.planning/research/m31-14-rpc-proxy-PITFALLS.md` for all 14 pitfalls with prevention strategies.

1. **Node.js keepAliveTimeout 5s kills long-poll** -- Set `server.keepAliveTimeout = 700_000` and `server.headersTimeout = 705_000` at daemon startup before any RPC proxy route is registered
2. **CONTRACT_DEPLOY SSoT chain incomplete propagation** -- 12+ touchpoints must update simultaneously (enum, Zod discriminatedUnion, switch/case in stages.ts, DB CHECK, Admin UI, policy engine, audit, OpenAPI). TypeScript compilation does NOT catch missing switch cases due to `default: throw` pattern
3. **`toAddress` non-nullable blocks CREATE TX storage** -- Change `TransactionSchema.toAddress` to `z.string().nullable()`, store `null` for deploys, add `metadata.deployedAddress` for contract address
4. **Forge script multi-TX nonce collision** -- Implement local nonce tracker `Map<address, pendingNonce>` with `max(onchainNonce, localTracker + 1)` strategy. Serialize `eth_sendTransaction` per wallet+chain
5. **Forge 45s hardcoded timeout vs DELAY/APPROVAL** -- Document `--timeout 600` requirement, recommend IMMEDIATE tier for dev/test, add `X-WAIaaS-Timeout-Hint` response header

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Type System + Infrastructure Foundation

**Rationale:** CONTRACT_DEPLOY type must propagate through entire Zod SSoT chain before any RPC proxy code can reference it. Node.js keepAliveTimeout must be fixed before long-poll is testable. These are prerequisites with no dependencies on RPC proxy code.
**Delivers:** 9-type transaction system, DB migration v58, toAddress nullable, keepAliveTimeout fix, EVM_CHAIN_MAP reverse lookup, tx-parser NFT+deploy selector expansion
**Addresses:** CONTRACT_DEPLOY policy type (differentiator), JSON-RPC protocol foundation
**Avoids:** Pitfall 2 (SSoT chain), Pitfall 3 (toAddress nullable), Pitfall 1 (keepAliveTimeout)

### Phase 2: Core RPC Proxy Engine

**Rationale:** With type system complete, build the core components bottom-up: protocol utils -> transaction adapter -> completion waiter -> passthrough -> sync pipeline executor. These are independent, unit-testable modules.
**Delivers:** JSON-RPC protocol utils, RpcTransactionAdapter, CompletionWaiter, RpcPassthrough, SyncPipelineExecutor, local nonce tracker
**Uses:** Zod (JSON-RPC schema), EventBus (completion tracking), RPC Pool (passthrough), pipeline stages (sync execution)
**Implements:** All 5 major architecture components
**Avoids:** Pitfall 4 (nonce collision), Pitfall 9 (JSON-RPC spec compliance), Pitfall 10 (fire-and-forget interference)

### Phase 3: Route Assembly + Signing Methods

**Rationale:** With core engine ready, assemble the dispatcher, method handlers, and Hono route. Add signing methods (personal_sign, eth_signTypedData_v4, eth_signTransaction). Wire sessionAuth middleware. This is the integration phase.
**Delivers:** Working RPC proxy endpoint `/v1/rpc-evm/:walletId/:chainId`, all intercept/passthrough/reject method routing, long-poll for DELAY/APPROVAL, batch request handling, `from` address validation
**Avoids:** Pitfall 5 (client timeout messaging), Pitfall 6 (batch signing -- reject in batch initially), Pitfall 8 (from field handling), Pitfall 13 (eth_chainId hex format)

### Phase 4: DX Integration + Testing

**Rationale:** Final phase adds developer experience: Admin Settings runtime toggle, Admin UI dashboard, MCP tool, SDK method, connect-info extension. E2E tests with actual Forge/Hardhat commands verify compatibility.
**Delivers:** Admin Settings (`rpc_proxy.*`), Admin UI RPC proxy section, MCP `get_rpc_proxy_url`, SDK `getRpcProxyUrl()`, connect-info `rpcProxyUrl` field, audit log integration, E2E Forge/Hardhat compatibility tests
**Avoids:** Pitfall 12 (Forge auth header configuration -- documented in E2E test setup)

### Phase Ordering Rationale

- Type system (Phase 1) must precede all pipeline code because CONTRACT_DEPLOY flows through every stage
- Core engine (Phase 2) must precede route assembly (Phase 3) because dispatcher depends on all handlers
- DX (Phase 4) is independent of core functionality and can be deferred without blocking Forge/Hardhat usage
- Local nonce tracker (Phase 2) must be in place before multi-TX Forge script testing (Phase 3)
- keepAliveTimeout fix (Phase 1) must precede any long-poll testing (Phase 2+)

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (CONTRACT_DEPLOY propagation):** Requires exhaustive audit of all switch/case branches, Zod schemas, and DB constraints. Low risk of unknown unknowns but high volume of touchpoints (12+)
- **Phase 2 (Nonce tracker):** Local nonce management under concurrent requests is tricky. Review thirdweb and QuickNode patterns for edge cases (rollback on failure, mempool eviction)

Phases with standard patterns (skip research-phase):
- **Phase 2 (JSON-RPC protocol utils):** Spec is trivial and stable, Zod schema is 10 lines
- **Phase 2 (CompletionWaiter):** Standard EventBus + Promise pattern, directly verified against codebase
- **Phase 3 (Route assembly):** Standard Hono route registration, sessionAuth middleware already proven
- **Phase 4 (Admin Settings/MCP/SDK):** Established patterns from prior milestones (v31.0+)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies. All capabilities verified against existing codebase (package.json, source files) |
| Features | HIGH | Table stakes derived from Forge/Hardhat/viem official docs. Differentiators align with existing WAIaaS patterns. Competitive analysis vs Fireblocks/Frame confirms positioning |
| Architecture | HIGH | Every component boundary verified by reading existing source (pipeline, EventBus, stages, tx-parser, daemon.ts). PIPELINE_HALTED catch pattern confirmed at stages.ts line-level |
| Pitfalls | HIGH | Critical pitfalls (keepAliveTimeout, nonce, SSoT chain) confirmed via GitHub issues and codebase analysis. Forge timeout confidence is MEDIUM due to possible Foundry version changes |

**Overall confidence:** HIGH

### Gaps to Address

- **Forge timeout exact behavior:** Foundry #9303 confirms 45s hardcoded timeout, but exact behavior may vary in latest Foundry releases. Validate during E2E testing in Phase 4
- **Batch request with signing methods:** Initial approach is to reject signing methods in batch. If Forge actually sends batched `eth_sendTransaction` + `eth_estimateGas`, this rejection will break compatibility. Monitor during E2E testing
- **`transferFrom` selector ambiguity (0x23b872dd):** ERC-20 vs ERC-721 cannot be distinguished by selector alone. Fallback to CONTRACT_CALL is safe but imprecise. ERC-165 check deferred to future milestone
- **Forge `--header` support:** Verify latest Foundry version supports `--header` flag for custom auth headers. Fallback: URL query parameter with log masking

## Sources

### Primary (HIGH confidence)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification) -- protocol compliance requirements
- WAIaaS codebase direct analysis: `pipeline/stages.ts`, `event-bus.ts`, `event-types.ts`, `daemon.ts`, `tx-parser.ts`, `evm-chain-map.ts`, `rpc-pool.ts`, `approval-workflow.ts`, `delay-queue.ts`
- [viem docs](https://viem.sh/) -- serializeTransaction, estimateGas, deployContract
- [Hardhat Configuration](https://v2.hardhat.org/hardhat-runner/docs/config) -- timeout, httpHeaders, accounts: "remote"

### Secondary (MEDIUM confidence)
- [Foundry #9303](https://github.com/foundry-rs/foundry/issues/9303) -- Forge 45s timeout limitation
- [Foundry #4831](https://github.com/foundry-rs/foundry/issues/4831) -- eth_sendTransaction vs eth_sendRawTransaction
- [Node.js #13391](https://github.com/nodejs/node/issues/13391) -- keepAliveTimeout 5s default
- [Fireblocks EVM JSON-RPC](https://developers.fireblocks.com/reference/evm-local-json-rpc) -- competitive analysis
- [Frame Desktop Wallet](https://frame.sh/) -- competitive analysis

### Tertiary (LOW confidence)
- [Foundry #8667](https://github.com/foundry-rs/foundry/issues/8667) -- Forge script timeout feature request (may have been resolved)
- [thirdweb nonce management](https://blog.thirdweb.com/sending-more-than-one-transaction-at-a-time/) -- nonce strategy patterns
- [ethereum/execution-apis #494](https://github.com/ethereum/execution-apis/issues/494) -- eth_getTransactionCount pending edge cases

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
