# Feature Landscape: EVM RPC Proxy

**Domain:** EVM JSON-RPC 프록시 지갑 (Wallet-as-a-Service RPC 인터페이스)
**Researched:** 2026-03-13

## Table Stakes

사용자(Forge/Hardhat/ethers.js/viem 개발자)가 당연히 기대하는 기능. 누락 시 "호환 안 됨"으로 판단.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| `eth_sendTransaction` 인터셉트 | Forge `--unlocked`, Hardhat `accounts: "remote"` 의 핵심 메서드. 모든 EVM 툴이 트랜잭션 전송에 사용 | High | 6-stage pipeline, tx-parser.ts, EvmAdapter | 가장 복잡한 단일 기능. to=null(배포), selector 감지(타입 분류), 가스 추정, nonce 관리 전부 필요 |
| `eth_accounts` 반환 | Forge/Hardhat이 사용 가능한 서명 주소를 조회하는 첫 번째 호출. 실패하면 아예 시작 불가 | Low | sessionAuth, walletId URL 라우팅 | 세션에 연결된 지갑 주소를 배열로 반환 |
| 읽기 메서드 패스스루 | `eth_call`, `eth_getBalance`, `eth_blockNumber`, `eth_getTransactionReceipt` 등은 RPC 노드로 그대로 전달되어야 함. 개발 도구의 90%+ 호출이 읽기 | Low | RPC Pool (v28.6) | ~20개 메서드. 기존 RPC Pool 인프라 재사용 |
| `eth_chainId` / `net_version` | 모든 EVM 도구가 연결 후 즉시 호출. 체인 불일치 시 "wrong chain" 에러로 진행 불가 | Low | URL의 chainId 파라미터 | URL 경로에서 자동 도출, RPC 호출 불필요 |
| JSON-RPC 2.0 프로토콜 준수 | id/jsonrpc/result/error 형식. 비표준 응답 시 모든 클라이언트 파싱 실패 | Low | 없음 | batch 요청(배열) 포함 |
| `eth_getTransactionCount` 패스스루 | nonce 조회. Forge script가 다수 트랜잭션 전송 시 nonce 관리에 필수 | Low | RPC Pool | passthrough 범위 |
| `eth_estimateGas` 패스스루 | 가스 추정. `eth_sendTransaction` 전에 도구들이 자체 가스 추정을 위해 호출 | Low | RPC Pool | passthrough 범위 |
| `eth_gasPrice` / `eth_feeHistory` 패스스루 | EIP-1559 수수료 계산. ethers.js/viem이 maxFeePerGas 설정에 사용 | Low | RPC Pool | passthrough 범위 |
| `personal_sign` | 메시지 서명. dApp 연동, 검증 시나리오에서 필수 | Med | sign-message pipeline | 기존 파이프라인 재사용 |
| `eth_signTypedData_v4` | EIP-712 구조화 서명. DeFi 프로토콜(Permit, Uniswap), ERC-8004/8128 등에서 광범위 사용 | Med | 기존 EIP-712 서명 파이프라인 | v3 미지원은 허용 (사실상 v4만 사용) |
| 세션 인증 | Bearer JWT로 RPC 요청 인증. 무인증 RPC 노출은 보안 사고 | Low | sessionAuth 미들웨어 | Forge: `--header "Authorization: Bearer ..."` 지원. ethers.js/viem: httpHeaders 설정 |
| `from` 주소 검증 | `eth_sendTransaction`의 `from`이 세션 지갑과 불일치 시 거부. 생략 시 자동 채움 | Low | sessionAuth, walletId | Forge `--sender` 미지정 시 from 누락 -- 자동 채움 필수 |
| 에러 코드 표준 준수 | JSON-RPC 표준 에러 코드 (-32600~-32603, -32700) + 커스텀 -32000~-32099 | Low | 없음 | 비표준 에러 시 도구들이 에러 메시지를 파싱 못함 |

## Differentiators

경쟁 제품 대비 차별화 포인트. 없어도 작동하지만 있으면 가치 있음.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| CONTRACT_DEPLOY 정책 타입 | Fireblocks/Frame은 배포를 CONTRACT_CALL과 동일 취급. WAIaaS는 배포를 별도 고위험 작업으로 분류하여 정책 분리 가능 | High | TRANSACTION_TYPES 9-type 확장, Zod SSoT 체인, DB 마이그레이션 v58 | bytecodeHash 기록으로 감사 추적. 기본 APPROVAL 티어 |
| Long-poll 비동기 승인 | Forge/Hardhat은 동기 HTTP POST만 지원. Owner 승인이 필요한 트랜잭션도 HTTP 응답 지연(long-poll)으로 투명하게 처리 | High | EventBus, AbortController, Promise 래핑 | Fireblocks도 유사 패턴(폴링 기반). WAIaaS는 DELAY/APPROVAL 티어 모두 지원 |
| 파이프라인 동기 실행 모드 | REST API는 fire-and-forget이지만, RPC 프록시는 Stage 1-6 전체를 await하여 txHash 반환. 개발자가 별도 폴링 없이 결과 수신 | High | pipeline stages.ts 수정 또는 EventBus 래핑 | RPC 클라이언트는 요청-응답 패턴만 지원하므로 필수적 차별화 |
| RPC 프록시 Admin Settings | 런타임 토글(enabled/disabled), 메서드 화이트리스트, 타임아웃 조정 -- Admin UI에서 hot-reload 가능 | Med | SettingsService, Admin UI | Fireblocks는 CLI 플래그만. WAIaaS는 런타임 조정 가능 |
| MCP `get_rpc_proxy_url` 도구 | AI 에이전트가 MCP로 RPC URL을 자동 발견하여 Forge/Hardhat 설정에 사용. AI-driven 배포 자동화의 핵심 | Low | MCP tools, connect-info | WAIaaS 고유. 경쟁사에 MCP 통합 없음 |
| SDK `getRpcProxyUrl()` | 프로그래밍 방식으로 RPC URL 조회. CI/CD 파이프라인 통합 | Low | SDK 패키지 | connect-info에 rpcProxyBaseUrl 추가 |
| 감사 로그 통합 | RPC 프록시 경유 트랜잭션도 `source: 'rpc-proxy'`로 감사 로그에 기록. REST API와 동일한 추적성 | Med | Audit log 시스템 (v30.2) | 기존 감사 로그 인프라 재사용 |
| 바이트코드 크기 제한 | EIP-170(24KB) x 2 = 48KB 기본 제한. 악의적 대용량 배포 바이트코드 차단 | Low | R8-3 설정 | 간단하지만 보안에 중요 |
| URL 기반 멀티체인 라우팅 | `/v1/rpc-evm/:walletId/:chainId`로 체인 명시. Alchemy/Infura 패턴과 일치. 단일 데몬에서 12 EVM 체인 동시 지원 | Low | EVM_CHAIN_MAP | 경쟁사(Frame)는 UI에서 체인 전환 필요. WAIaaS는 URL로 명시적 |
| Admin UI RPC 프록시 대시보드 | 활성 상태, 연결 통계, 최근 요청 로그를 Admin UI에서 확인 | Med | Admin UI (Preact) | 운영 가시성. Fireblocks는 별도 대시보드 |

## Anti-Features

명시적으로 구현하지 않을 기능.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| WebSocket RPC (`eth_subscribe`, `eth_newFilter`) | 초기 버전에 불필요한 복잡성. Forge/Hardhat 배포 워크플로우는 HTTP POST만 사용. WebSocket은 dApp 프론트엔드 패턴 | HTTP POST JSON-RPC만 지원. 후속 마일스톤에서 필요 시 추가 |
| EIP-4337 UserOp RPC (`eth_sendUserOperation`) | Bundler RPC 규격이 별도. WAIaaS에 이미 UserOp Build/Sign API 있음 (v31.2) | 기존 UserOp API (`POST /v1/userop/build`, `POST /v1/userop/sign`) 사용 |
| 응답 캐싱 | eth_getBlockByNumber 등의 캐싱은 초기 범위 과다. RPC Pool이 이미 로드밸런싱 제공 | 성능 이슈 발생 시 후속 최적화 |
| Solana RPC 프록시 | JSON-RPC 규격이 EVM과 완전히 다름 (Solana는 서명 완료된 TX를 받음). EVM 도구 호환이 목표 | `/v1/rpc-solana/` 네임스페이스 예약만. 별도 마일스톤 |
| Etherscan/Sourcify verify 통합 | 컨트랙트 검증은 WAIaaS 범위 밖. 별도 도구(forge verify) 사용 | 사용자가 직접 `forge verify-contract` 실행 |
| 프라이빗 키 내보내기/임포트 via RPC | `eth_importRawKey`, `eth_exportRawKey` 등은 보안 위험. WAIaaS 보안 모델과 충돌 | JSON-RPC -32601 Method not found 반환 |
| 다중 체인 단일 URL | 하나의 URL로 여러 체인 동시 프록시는 JSON-RPC 프로토콜에 체인 선택 메커니즘이 없어 불가 | URL당 단일 체인 (`/v1/rpc-evm/:walletId/:chainId`) |
| `eth_sendRawTransaction` 인터셉트 | 이미 서명 완료된 raw TX를 받으므로 정책 엔진 적용 불가. 패스스루하면 WAIaaS 우회 | 명시적 거부 (-32601). WAIaaS 파이프라인을 통과하려면 `eth_sendTransaction` 사용 |
| `wallet_*` 메서드 (EIP-3085, EIP-3326) | `wallet_addEthereumChain`, `wallet_switchEthereumChain`은 브라우저 지갑(MetaMask) 전용. CLI 도구에서 사용 안 함 | 미지원 메서드로 -32601 반환 |

## Feature Dependencies

```
sessionAuth -----------------------------------------------+
                                                           v
EVM_CHAIN_MAP (chainId -> slug) --> RPC Pool --> passthrough methods (eth_call, eth_getBalance, ...)
                                                           |
URL routing (/v1/rpc-evm/:walletId/:chainId) --------------+
                                                           v
                             eth_accounts --> eth_sendTransaction intercept
                                                           |
                                                           +-- tx-parser.ts (selector detection)
                                                           |     +-- TRANSFER (to + no data)
                                                           |     +-- TOKEN_TRANSFER (0xa9059cbb)
                                                           |     +-- APPROVE (0x095ea7b3)
                                                           |     +-- NFT_TRANSFER (0x42842e0e, 0xb88d4fde, ...)
                                                           |     +-- CONTRACT_CALL (to + data, default)
                                                           |     +-- CONTRACT_DEPLOY (to=null) <-- NEW
                                                           |
                                                           v
                             6-stage pipeline (sync execution mode) --> txHash response
                                                           |
                                                           +-- IMMEDIATE: immediate response
                                                           +-- DELAY: long-poll (max 300s)
                                                           +-- APPROVAL: long-poll (max 600s)
                                                                 +-- EventBus event wait

personal_sign ----------> sign-message pipeline (existing)
eth_signTypedData_v4 ---> EIP-712 signing pipeline (existing)
eth_signTransaction ----> sign-only pipeline (existing)

CONTRACT_DEPLOY policy type
  +-- TRANSACTION_TYPES 8 -> 9 expansion
  +-- Zod discriminatedUnion 6 -> 7 expansion
  +-- DB migration v58
  +-- OpenAPI regeneration

Admin Settings (rpc_proxy.*)
  +-- enabled toggle
  +-- allowed_methods whitelist
  +-- delay_timeout_seconds
  +-- approval_timeout_seconds
  +-- max_gas_limit
```

## EVM Tool Compatibility Requirements

### Forge (Foundry)

| Requirement | Method | Notes |
|-------------|--------|-------|
| `--unlocked --sender` | `eth_sendTransaction` | `from` field included. Must match WAIaaS wallet address |
| `--rpc-url` | All | Single HTTP URL only. Auth header via `--header` flag |
| `forge script --broadcast` | `eth_sendTransaction` repeated | Multiple TXs sent sequentially. Auto nonce management needed |
| `forge create` | `eth_sendTransaction` (to=null) | Contract deployment |
| `cast send` | `eth_sendTransaction` | Single transaction |
| `cast call` | `eth_call` | Read-only |
| Default timeout | ~45 seconds | Shorter than DELAY/APPROVAL wait. `--timeout` adjustment required |

### Hardhat

| Requirement | Method | Notes |
|-------------|--------|-------|
| `accounts: "remote"` | `eth_accounts` | Default setting. Queries accounts from RPC |
| Deploy scripts | `eth_sendTransaction` | `hardhat-deploy` plugin compatible |
| `httpHeaders` config | - | Used for Bearer JWT delivery |
| Network type: `"http"` | All | JSON-RPC based network |

### ethers.js v6

| Requirement | Method | Notes |
|-------------|--------|-------|
| `JsonRpcProvider` | All read methods | Standard provider |
| `JsonRpcSigner` (remote) | `eth_sendTransaction`, `eth_accounts` | Via `getSigner()` call |
| `signMessage` | `personal_sign` | Message signing |
| `signTypedData` | `eth_signTypedData_v4` | EIP-712 |

### viem

| Requirement | Method | Notes |
|-------------|--------|-------|
| `createPublicClient` + `http()` | All read methods | Transport-level HTTP |
| JSON-RPC Account | `eth_sendTransaction`, `eth_accounts` | `type: 'json-rpc'` account |
| `signMessage` | `personal_sign` | WalletClient method |
| `signTypedData` | `eth_signTypedData_v4` | WalletClient method |
| `timeout` option | - | Transport config for timeout adjustment |

## Competitive Analysis

### Fireblocks EVM JSON-RPC

- **Approach:** Separate CLI server (`fireblocks-json-rpc`). Wraps Fireblocks API as JSON-RPC
- **Auth:** API Key + Private Key (file-based)
- **Chain selection:** `--chainId` CLI flag (fixed at server start)
- **Policy:** Fireblocks dashboard Transaction Authorization Policy (TAP)
- **Strengths:** Enterprise MPC signing, SOC2 certification
- **Limitations:** Server restart needed for chain change, no local signing, SaaS dependency

### Frame

- **Approach:** System-wide JSON-RPC endpoint (`http://127.0.0.1:1248`)
- **Auth:** None (local only, UI approval)
- **Chain selection:** Manual switching in Frame UI
- **Policy:** None (UI popup approval only)
- **Strengths:** Developer-friendly, desktop app integration, open source
- **Limitations:** No policy engine, no API auth, no programmatic control

### WAIaaS RPC Proxy (planned)

- **Approach:** RPC endpoint added to existing daemon. No separate server needed
- **Auth:** JWT session token (existing sessionAuth)
- **Chain selection:** URL path (`/v1/rpc-evm/:walletId/:chainId`) -- runtime multi-chain
- **Policy:** Existing 6-stage pipeline + policy engine auto-applied
- **Differentiation:** AI agent MCP integration, runtime Admin Settings, CONTRACT_DEPLOY separated policy, audit logs

## MVP Recommendation

**Phase 1 (Required -- Forge/Hardhat basic compatibility):**
1. JSON-RPC 2.0 router + URL-based routing (`/v1/rpc-evm/:walletId/:chainId`)
2. `eth_accounts` / `eth_chainId` / `net_version` intercept
3. Passthrough methods (~20) -- RPC Pool connection
4. `eth_sendTransaction` intercept -> pipeline sync execution
5. `from` address validation/auto-fill

**Phase 2 (Complete -- full signing + deployment):**
1. CONTRACT_DEPLOY type (9-type expansion, DB v58)
2. `eth_signTransaction` -> sign-only pipeline
3. `personal_sign` / `eth_signTypedData_v4` -> existing signing pipelines
4. Long-poll async approval (DELAY/APPROVAL)
5. Security: bytecode size limit, audit logs, rate limiting

**Phase 3 (DX -- management + integration):**
1. Admin Settings (`rpc_proxy.*`)
2. Admin UI dashboard (status, stats, logs)
3. MCP `get_rpc_proxy_url` tool
4. SDK `getRpcProxyUrl()` + connect-info field

**Defer:**
- WebSocket RPC: Not needed initially. HTTP POST covers Forge/Hardhat 100%
- Response caching: Unnecessary without performance issues
- bytecodeHash-based whitelist policy: Future milestone

## RPC Method Classification (Complete)

| Category | Method | Action | Complexity |
|----------|--------|--------|------------|
| **Intercept (signing)** | `eth_sendTransaction` | Pipeline execution -> txHash | High |
| **Intercept (signing)** | `eth_signTransaction` | sign-only -> signedTxHex | Med |
| **Intercept (signing)** | `personal_sign` | sign-message -> signature | Med |
| **Intercept (signing)** | `eth_sign` | sign-message -> signature | Med |
| **Intercept (signing)** | `eth_signTypedData_v4` | EIP-712 -> signature | Med |
| **Intercept (accounts)** | `eth_accounts` | Return wallet address | Low |
| **Intercept (accounts)** | `eth_requestAccounts` | Return wallet address (same as eth_accounts) | Low |
| **Intercept (chain)** | `eth_chainId` | Derived from URL chainId | Low |
| **Passthrough** | `eth_call` | RPC Pool forward | Low |
| **Passthrough** | `eth_estimateGas` | RPC Pool forward | Low |
| **Passthrough** | `eth_getBalance` | RPC Pool forward | Low |
| **Passthrough** | `eth_getTransactionReceipt` | RPC Pool forward | Low |
| **Passthrough** | `eth_getTransactionByHash` | RPC Pool forward | Low |
| **Passthrough** | `eth_blockNumber` | RPC Pool forward | Low |
| **Passthrough** | `eth_getBlockByNumber` | RPC Pool forward | Low |
| **Passthrough** | `eth_getBlockByHash` | RPC Pool forward | Low |
| **Passthrough** | `net_version` | RPC Pool forward | Low |
| **Passthrough** | `eth_gasPrice` | RPC Pool forward | Low |
| **Passthrough** | `eth_feeHistory` | RPC Pool forward | Low |
| **Passthrough** | `eth_getCode` | RPC Pool forward | Low |
| **Passthrough** | `eth_getStorageAt` | RPC Pool forward | Low |
| **Passthrough** | `eth_getLogs` | RPC Pool forward | Low |
| **Passthrough** | `eth_getTransactionCount` | RPC Pool forward | Low |
| **Passthrough** | `web3_clientVersion` | RPC Pool forward | Low |
| **Reject** | `eth_sendRawTransaction` | -32601 (pipeline bypass prevention) | Low |
| **Reject** | `eth_importRawKey` | -32601 (security) | Low |
| **Reject** | `wallet_*` | -32601 (browser-only) | Low |
| **Reject** | Unknown methods | -32601 Method not found | Low |

## Sources

- [Fireblocks EVM JSON-RPC](https://developers.fireblocks.com/reference/evm-local-json-rpc) -- Fireblocks RPC server architecture
- [Fireblocks JSON-RPC GitHub](https://github.com/fireblocks/fireblocks-json-rpc) -- CLI configuration options
- [Fireblocks Web3 Provider](https://developers.fireblocks.com/reference/evm-web3-provider) -- EIP-1193 compatible provider
- [Frame Desktop Wallet](https://frame.sh/) -- System-wide RPC endpoint pattern
- [Frame GitHub](https://github.com/floating/frame) -- Open source architecture
- [Foundry Scripting Docs](https://getfoundry.sh/forge/deploying) -- Forge `--unlocked`, `--rpc-url` behavior
- [Hardhat Configuration](https://v2.hardhat.org/hardhat-runner/docs/config) -- accounts: "remote", httpHeaders
- [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) -- Ethereum Provider JavaScript API standard
- [viem FAQ](https://viem.sh/docs/faq) -- JSON-RPC Account vs Local Account distinction
- [Foundry Issue #9303](https://github.com/foundry-rs/foundry/issues/9303) -- Forge RPC timeout 45-second limit
