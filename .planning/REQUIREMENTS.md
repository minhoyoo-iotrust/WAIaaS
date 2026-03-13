# Requirements: WAIaaS v31.14 EVM RPC 프록시 모드

**Defined:** 2026-03-13
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v31.14 Requirements

Requirements for EVM RPC Proxy mode. Each maps to roadmap phases.

### RPC Endpoint

- [ ] **RPC-01**: User can send JSON-RPC 2.0 requests to `POST /v1/rpc-evm/:walletId/:chainId`
- [ ] **RPC-02**: User can authenticate RPC requests via existing sessionAuth (Bearer JWT)
- [x] **RPC-03**: System routes requests to correct wallet and chain via URL path parameters (chainId → EVM_CHAIN_MAP → NetworkType)
- [x] **RPC-04**: `eth_chainId` response is auto-derived from URL chainId parameter
- [ ] **RPC-05**: User can send JSON-RPC batch requests (array of calls)
- [ ] **RPC-06**: System enforces Content-Type: application/json
- [x] **RPC-07**: System returns JSON-RPC error `-32602` for unknown chainId

### Signing Intercept

- [x] **SIGN-01**: `eth_sendTransaction` routes through 6-stage pipeline with tx-parser type classification
- [x] **SIGN-02**: `eth_signTransaction` routes through sign-only pipeline (no broadcast)
- [x] **SIGN-03**: `eth_accounts` / `eth_requestAccounts` returns session wallet address
- [x] **SIGN-04**: `eth_sign` routes through sign-message pipeline
- [x] **SIGN-05**: `personal_sign` routes through sign-message pipeline
- [x] **SIGN-06**: `eth_signTypedData_v4` routes through EIP-712 signing pipeline
- [x] **SIGN-07**: `eth_sendRawTransaction` is explicitly rejected with descriptive error

### Passthrough

- [x] **PASS-01**: Read methods (eth_call, eth_getBalance, eth_blockNumber, etc.) are proxied to RPC Pool
- [x] **PASS-02**: System returns JSON-RPC error `-32601` for unsupported methods

### Contract Deploy

- [x] **DEPL-01**: `eth_sendTransaction` with `to=null` is classified as CONTRACT_DEPLOY
- [x] **DEPL-02**: TRANSACTION_TYPES enum extended to 9-type with CONTRACT_DEPLOY
- [x] **DEPL-03**: DB migration v58 adds CONTRACT_DEPLOY to tx_history type CHECK constraint
- [x] **DEPL-04**: CONTRACT_DEPLOY defaults to APPROVAL tier policy
- [x] **DEPL-05**: Deployment result stores `deployedAddress` in tx_history metadata
- [x] **DEPL-06**: bytecodeHash (keccak256) recorded in audit log

### Async Approval

- [ ] **ASYNC-01**: IMMEDIATE tier: instant sign + JSON-RPC response
- [ ] **ASYNC-02**: DELAY tier: long-poll HTTP response, configurable timeout (default 300s)
- [ ] **ASYNC-03**: APPROVAL tier: long-poll HTTP response, Owner approval wait (default 600s)
- [ ] **ASYNC-04**: Timeout returns JSON-RPC error `-32000` with cause and transaction ID
- [x] **ASYNC-05**: Node.js keepAliveTimeout configured to support long-poll connections

### Admin & Settings

- [ ] **ADMIN-01**: `rpc_proxy.enabled` toggle (default false)
- [ ] **ADMIN-02**: `rpc_proxy.allowed_methods` whitelist
- [ ] **ADMIN-03**: `rpc_proxy.delay_timeout_seconds` setting (default 300)
- [ ] **ADMIN-04**: `rpc_proxy.approval_timeout_seconds` setting (default 600)
- [ ] **ADMIN-05**: `rpc_proxy.max_gas_limit` setting (default 30,000,000)
- [ ] **ADMIN-06**: Admin UI RPC Proxy section with status and request log

### MCP & SDK

- [ ] **INTG-01**: MCP `get_rpc_proxy_url` tool returns RPC proxy URL for wallet+chain
- [ ] **INTG-02**: SDK `getRpcProxyUrl(walletId, chainId)` method
- [ ] **INTG-03**: `connect-info` response includes `rpcProxyBaseUrl` when proxy enabled

### Security

- [ ] **SEC-01**: Unauthenticated RPC requests rejected
- [ ] **SEC-02**: `from` field validated against session wallet address
- [ ] **SEC-03**: `from` auto-filled from URL walletId when omitted
- [ ] **SEC-04**: All signing transactions logged to audit log with `source: 'rpc-proxy'`
- [ ] **SEC-05**: Bytecode size limit enforced (default 48KB)
- [ ] **SEC-06**: Rate limiting applied via existing API rate limit policy

### Testing

- [ ] **TEST-01**: JSON-RPC 2.0 protocol compliance tests
- [ ] **TEST-02**: Signing method intercept tests (eth_sendTransaction → pipeline)
- [ ] **TEST-03**: Passthrough method proxy tests
- [ ] **TEST-04**: CONTRACT_DEPLOY classification and policy tests
- [ ] **TEST-05**: Async approval long-poll tests (DELAY/APPROVAL tiers)
- [ ] **TEST-06**: Batch request handling tests
- [ ] **TEST-07**: Auth/security tests (unauthenticated, from mismatch)

## Future Requirements

Deferred to future milestone.

### WebSocket RPC

- **WS-01**: `eth_subscribe` / `eth_unsubscribe` WebSocket RPC support

### Advanced Deploy Policy

- **ADVD-01**: bytecodeHash-based whitelist policy (auto-approve specific contract code)

### Solana RPC Proxy

- **SOL-01**: `/v1/rpc-solana/` Solana JSON-RPC proxy

### Caching

- **CACHE-01**: Response caching for read methods (eth_getBlockByNumber, etc.)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Solana RPC Proxy | JSON-RPC 규격 상이, EVM 툴체인 호환 목적 |
| WebSocket RPC (eth_subscribe) | 초기 버전은 HTTP POST만 |
| EIP-4337 UserOp RPC (eth_sendUserOperation) | Bundler RPC 규격 별도, 기존 UserOp API 사용 |
| 응답 캐싱 | 초기 범위 초과, 성능 이슈 발생 시 추가 |
| Forge verify 통합 (Etherscan API) | WAIaaS 범위 밖 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RPC-01 | Phase 400 | Pending |
| RPC-02 | Phase 400 | Pending |
| RPC-03 | Phase 399 | Complete |
| RPC-04 | Phase 399 | Complete |
| RPC-05 | Phase 400 | Pending |
| RPC-06 | Phase 400 | Pending |
| RPC-07 | Phase 398 | Complete |
| SIGN-01 | Phase 399 | Complete |
| SIGN-02 | Phase 399 | Complete |
| SIGN-03 | Phase 399 | Complete |
| SIGN-04 | Phase 399 | Complete |
| SIGN-05 | Phase 399 | Complete |
| SIGN-06 | Phase 399 | Complete |
| SIGN-07 | Phase 399 | Complete |
| PASS-01 | Phase 399 | Complete |
| PASS-02 | Phase 399 | Complete |
| DEPL-01 | Phase 398 | Complete |
| DEPL-02 | Phase 398 | Complete |
| DEPL-03 | Phase 398 | Complete |
| DEPL-04 | Phase 398 | Complete |
| DEPL-05 | Phase 398 | Complete |
| DEPL-06 | Phase 398 | Complete |
| ASYNC-01 | Phase 400 | Pending |
| ASYNC-02 | Phase 400 | Pending |
| ASYNC-03 | Phase 400 | Pending |
| ASYNC-04 | Phase 400 | Pending |
| ASYNC-05 | Phase 398 | Complete |
| ADMIN-01 | Phase 401 | Pending |
| ADMIN-02 | Phase 401 | Pending |
| ADMIN-03 | Phase 401 | Pending |
| ADMIN-04 | Phase 401 | Pending |
| ADMIN-05 | Phase 401 | Pending |
| ADMIN-06 | Phase 401 | Pending |
| INTG-01 | Phase 401 | Pending |
| INTG-02 | Phase 401 | Pending |
| INTG-03 | Phase 401 | Pending |
| SEC-01 | Phase 400 | Pending |
| SEC-02 | Phase 400 | Pending |
| SEC-03 | Phase 400 | Pending |
| SEC-04 | Phase 400 | Pending |
| SEC-05 | Phase 400 | Pending |
| SEC-06 | Phase 400 | Pending |
| TEST-01 | Phase 401 | Pending |
| TEST-02 | Phase 401 | Pending |
| TEST-03 | Phase 401 | Pending |
| TEST-04 | Phase 401 | Pending |
| TEST-05 | Phase 401 | Pending |
| TEST-06 | Phase 401 | Pending |
| TEST-07 | Phase 401 | Pending |

**Coverage:**
- v31.14 requirements: 49 total
- Mapped to phases: 49
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after roadmap creation*
