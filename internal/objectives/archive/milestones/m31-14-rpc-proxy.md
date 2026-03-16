# 마일스톤 m31-14: EVM RPC 프록시 모드

- **Status:** SHIPPED
- **Milestone:** v31.14
- **Completed:** 2026-03-13

## 목표

WAIaaS 데몬이 **EVM JSON-RPC 프록시**로 동작하여, Forge·Hardhat·ethers.js·viem 등 **기존 EVM 개발 도구가 `--rpc-url`만 변경하면 WAIaaS 정책 엔진 + 서명 파이프라인 아래에서 컨트랙트 배포 및 모든 온체인 인터랙션을 수행**할 수 있도록 한다.

> **선행**: 없음 (기존 EVM 어댑터 + 정책 엔진 + sign-only 파이프라인 활용)
> **참조**: IChainAdapter, sign-only.ts, EvmAdapter, pipeline/stages.ts

---

## 배경

현재 WAIaaS는 고수준 REST API(`POST /v1/transactions/send`, `POST /v1/transactions/sign`)를 통해 트랜잭션을 처리한다. 이는 SDK·MCP 에이전트에는 적합하지만, **스마트 컨트랙트 개발자**의 표준 워크플로우(Forge script, Hardhat deploy, Remix)와는 호환되지 않는다.

### 현재 한계

| 시나리오 | 현재 가능 여부 | 이유 |
|----------|--------------|------|
| `forge script Deploy.s.sol --broadcast` | ❌ | WAIaaS가 JSON-RPC를 노출하지 않음 |
| `npx hardhat run scripts/deploy.ts` | ❌ | 동일 |
| 컨트랙트 배포 (CREATE) | ❌ | CONTRACT_CALL은 `to` 필수 |
| `eth_accounts` → WAIaaS 지갑 | ❌ | RPC 메서드 미노출 |

### RPC 프록시가 해결하는 문제

EVM 툴체인은 표준 JSON-RPC 인터페이스(`eth_sendTransaction`, `eth_accounts`, `eth_chainId` 등)를 통해 지갑과 통신한다. WAIaaS가 이 인터페이스를 구현하면:

1. **기존 개발 도구 100% 호환** — 코드 변경 없이 `--rpc-url` 교체만으로 WAIaaS 지갑 사용
2. **컨트랙트 배포 자동 지원** — `eth_sendTransaction`에서 `to=null`이면 CREATE 트랜잭션
3. **정책 엔진 자동 적용** — 모든 트랜잭션이 WAIaaS 파이프라인(정책 검증 → 시간 지연 → 승인)을 거침
4. **감사 로그 통합** — 배포 트랜잭션도 `tx_history`에 기록

---

## 요구사항

### R1. RPC 프록시 엔드포인트

- **R1-1.** `POST /v1/rpc-evm/:walletId/:chainId` 엔드포인트 노출 — JSON-RPC 2.0 프로토콜 준수
- **R1-2.** 세션 인증: `Authorization: Bearer <JWT>` 헤더로 기존 sessionAuth 사용
- **R1-3.** 지갑+체인 라우팅: URL 경로의 `walletId`로 서명 지갑 결정, `chainId`(EVM chain ID 숫자, 예: `1`, `8453`, `42161`)로 대상 체인 결정. 내부적으로 `EVM_CHAIN_MAP`을 통해 WAIaaS NetworkType slug(`ethereum-mainnet`, `base-mainnet` 등)로 매핑. EVM EOA는 동일 키로 모든 체인에서 같은 주소이므로 chainId가 필수. 테스트넷도 지원 — `EVM_CHAIN_MAP`에 이미 6개 테스트넷 등록 (Sepolia `11155111`, Polygon Amoy `80002`, Arbitrum Sepolia `421614`, Optimism Sepolia `11155420`, Base Sepolia `84532`, HyperEVM Testnet `998`)
- **R1-3a.** `eth_chainId` 응답은 URL의 `chainId`에서 자동 도출 (`0x${chainId.toString(16)}`) — 클라이언트와 체인 불일치 방지
- **R1-4.** JSON-RPC batch 요청 지원 (배열로 여러 호출 일괄 전송)
- **R1-5.** Content-Type: `application/json` 강제
- **R1-6.** 기존 `/v1/*` REST 라우트와 네임스페이스 충돌 없음 확인 (`/v1/rpc-evm/` 프리픽스는 현재 미사용). URL에 `-evm`을 포함하여 향후 `/v1/rpc-solana/` 등 다른 체인 프록시 확장 가능
- **R1-7.** chainId → WAIaaS NetworkType slug 매핑(`EVM_CHAIN_MAP` 활용) 후 RPC Pool에서 해당 네트워크의 RPC 엔드포인트 조회. 미등록 chainId면 JSON-RPC 에러 응답 (`-32602 Unknown chainId`)

### R2. 서명 관련 RPC 메서드 인터셉트

WAIaaS 정책 엔진을 통과해야 하는 메서드:

- **R2-1.** `eth_sendTransaction` → WAIaaS 트랜잭션 파이프라인 실행
  - `to=null` 또는 누락: CREATE 트랜잭션 (컨트랙트 배포)
  - `to` 존재 + `data` 존재: CONTRACT_CALL
  - `to` 존재 + `data` 없음/빈값: TRANSFER
  - `to` 존재 + `value > 0` + `data` 존재: CONTRACT_CALL (ETH 전송 + 컨트랙트 콜 동시 — value는 payable 함수 인자로 처리)
  - ERC-20 transfer selector (`0xa9059cbb`): TOKEN_TRANSFER (value 유무 무관 — calldata 우선 분류, 기존 tx-parser.ts 동작과 일치)
  - ERC-20 approve selector (`0x095ea7b3`): APPROVE (value 유무 무관)
  - ERC-721/1155 NFT selector: NFT_TRANSFER — 추가 필요한 selector:
    - `0x42842e0e` ERC-721 safeTransferFrom(address,address,uint256)
    - `0xb88d4fde` ERC-721 safeTransferFrom(address,address,uint256,bytes)
    - `0x23b872dd` transferFrom(address,address,uint256) — ERC-721과 ERC-20 동일 selector. 판별: CONTRACT_WHITELIST에 NFT 컨트랙트로 등록 여부 또는 `eth_call`로 ERC-165 supportsInterface 확인. 초기 구현은 CONTRACT_CALL로 fallback, NFT 컨트랙트 등록 시 NFT_TRANSFER
    - `0xf242432a` ERC-1155 safeTransferFrom(address,address,uint256,uint256,bytes)
    - `0x2eb2c2d6` ERC-1155 safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)
  - 기존 `tx-parser.ts`의 selector 감지 로직 재사용 + 위 NFT selector 확장 필요 (현재 ERC20 2개만 감지)
  - 정책 평가 → 시간 지연 → 승인 플로우 → 서명 → 브로드캐스트
  - JSON-RPC 응답: `result: txHash`
- **R2-2.** `eth_signTransaction` → sign-only 파이프라인 실행 (브로드캐스트 없이 서명만)
  - 정책 평가 포함
  - JSON-RPC 응답: `result: signedTxHex`
- **R2-3.** `eth_accounts` / `eth_requestAccounts` → 세션에 연결된 지갑 주소 반환
- **R2-4.** `eth_sign` → 기존 sign-message 파이프라인 (personal_sign)
- **R2-5.** `personal_sign` → 기존 sign-message 파이프라인
- **R2-6.** `eth_signTypedData_v4` → 기존 EIP-712 서명 파이프라인

### R3. 패스스루 RPC 메서드

서명이 필요 없는 읽기 메서드는 실제 RPC 노드로 프록시:

- **R3-1.** 패스스루 대상: `eth_call`, `eth_estimateGas`, `eth_getBalance`, `eth_getTransactionReceipt`, `eth_getTransactionByHash`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getBlockByHash`, `eth_chainId`, `net_version`, `eth_gasPrice`, `eth_feeHistory`, `eth_getCode`, `eth_getStorageAt`, `eth_getLogs`, `eth_getTransactionCount`, `web3_clientVersion` 등
- **R3-2.** RPC Pool 활용: 기존 RPC Pool 멀티엔드포인트 로테이션(v28.6) 인프라 사용
- **R3-3.** 미지원 메서드: JSON-RPC 에러 응답 (`-32601 Method not found`)

### R4. CREATE 트랜잭션 (컨트랙트 배포) 지원

- **R4-1.** `eth_sendTransaction`에서 `to` 필드가 `null`/누락이면 CREATE 트랜잭션으로 처리
- **R4-2.** EVM 어댑터의 기존 `buildTransaction()`이 `to=undefined`를 처리할 수 있으면 재사용, 불가하면 `buildDeployTransaction()` 별도 추가: nonce, EIP-1559 fee, gas 추정 (`to=undefined`). 구현 시 기존 메서드 확인 후 결정
- **R4-3.** 정책 타입: `CONTRACT_DEPLOY` — 새로운 정책 파라미터 타입 추가
  - `contractAddress`: 없음 (아직 미생성)
  - `bytecodeHash`: 배포 바이트코드의 keccak256 해시 (감사 로그 기록용)
  - `estimatedGas`: 가스 추정치
  - **정책 평가**: 기본 APPROVAL 티어 (Owner 승인 필수). 정책 설정으로 IMMEDIATE/DELAY로 낮출 수 있음 (운영 환경에서 반복 배포 자동화 시나리오). `bytecodeHash` 기반 화이트리스트 정책(특정 바이트코드만 자동 허용)은 후속 마일스톤 범위
- **R4-4.** 배포 결과 저장: `tx_history`에 `type: 'CONTRACT_DEPLOY'`, `metadata.deployedAddress` 기록
- **R4-5.** CREATE2 지원: `to`가 CREATE2 팩토리 주소면 기존 CONTRACT_CALL로 처리 (별도 타입 불필요)

### R5. 비동기 승인 처리

Forge script 등 동기적 RPC 클라이언트는 즉시 응답을 기대하지만, WAIaaS 승인 플로우는 비동기적일 수 있다:

- **R5-1.** IMMEDIATE 티어: 정책 통과 시 즉시 서명 + 응답 (기존과 동일)
- **R5-2.** DELAY 티어: HTTP 응답을 지연(long-poll) — 지연 시간 경과 후 서명 + 응답
  - 타임아웃 설정: Admin Settings `rpc_proxy.delay_timeout_seconds` (기본 300초)
  - 구현 방식: 현재 REST API의 `sendTransaction()`은 Stage 1 후 즉시 반환(PENDING)하고 Stage 2-6을 fire-and-forget으로 실행. RPC 프록시에서는 **동기 실행 모드**가 필요: Stage 1-6 전체를 await하여 최종 결과(txHash)를 HTTP 응답으로 반환. AbortController로 클라이언트 연결 끊김 감지
- **R5-3.** APPROVAL 티어: HTTP 응답을 보류(long-poll) — Owner 승인 대기
  - 승인 완료 시 서명 + 응답
  - 거부 또는 타임아웃 시 JSON-RPC 에러 응답 (`-32000 Transaction rejected`)
  - 타임아웃 설정: Admin Settings `rpc_proxy.approval_timeout_seconds` (기본 600초)
  - 구현 방식: 기존 `onApproved` 콜백 + EventBus(`transaction:completed`, `transaction:failed`) 활용. RPC 핸들러에서 `txId → {resolve, reject}` Map을 관리하고, 승인/완료 이벤트 발생 시 해당 Promise를 resolve. 타임아웃은 `Promise.race([completionPromise, timeoutPromise])`로 처리
- **R5-4.** 타임아웃 시 Forge-friendly 에러 메시지: 원인(DELAY/APPROVAL)과 트랜잭션 ID 포함
- **R5-5.** 클라이언트 HTTP 타임아웃 안내: Forge(`--timeout`), Hardhat(`timeout` config), viem(`timeout` option) 등 도구별 타임아웃 설정을 승인 대기 시간 이상으로 조정하도록 문서화. 기본 Forge 타임아웃(~45초)은 DELAY/APPROVAL 대기 시간보다 짧아 클라이언트 측 에러 발생 가능

### R6. Admin Settings 및 관리

- **R6-1.** `rpc_proxy.enabled`: RPC 프록시 활성화 토글 (기본 `false`)
- **R6-2.** `rpc_proxy.allowed_methods`: 허용 RPC 메서드 화이트리스트 (기본: 전체)
- **R6-3.** `rpc_proxy.delay_timeout_seconds`: DELAY 티어 타임아웃 (기본 300)
- **R6-4.** `rpc_proxy.approval_timeout_seconds`: APPROVAL 티어 타임아웃 (기본 600)
- **R6-5.** `rpc_proxy.max_gas_limit`: 단일 트랜잭션 최대 가스 한도 (기본 30,000,000)
- **R6-6.** Admin UI RPC 프록시 섹션: 활성 상태, 연결 통계, 최근 요청 로그

### R7. MCP 도구 및 SDK

- **R7-1.** MCP `get_rpc_proxy_url` 도구: 현재 세션의 RPC 프록시 URL 반환 (walletId + chainId 지정)
- **R7-2.** SDK `getRpcProxyUrl(walletId, chainId)` 메서드: RPC 프록시 URL 조회
- **R7-3.** `connect-info` 응답에 `rpcProxyBaseUrl` 필드 추가 (RPC 프록시 활성 시, 클라이언트가 `/{walletId}/{chainId}`를 append)

### R8. 보안

- **R8-1.** 세션 인증 필수 — 인증 없는 RPC 요청 거부
- **R8-2.** Rate limiting: 기존 API rate limit 정책 적용
- **R8-3.** 바이트코드 크기 제한: 배포 바이트코드 최대 크기 제한 (기본 48KB, EIP-170 x 2)
- **R8-4.** 감사 로그: RPC 프록시를 통한 모든 서명 트랜잭션을 감사 로그에 기록 (`source: 'rpc-proxy'`)
- **R8-5.** `eth_sendTransaction`의 `from` 필드 검증: 세션 지갑 주소와 일치해야 함. `from` 누락 시 URL 경로의 walletId에 해당하는 지갑 주소를 자동 채움 (Forge `--sender` 미지정 시 호환)

### R9. 테스트

- **R9-1.** JSON-RPC 2.0 프로토콜 준수 테스트 (id, jsonrpc, result/error 형식)
- **R9-2.** 서명 메서드 인터셉트 테스트: `eth_sendTransaction` → 파이프라인 통과 확인
- **R9-3.** 패스스루 메서드 테스트: 읽기 메서드가 실제 RPC로 프록시되는지 확인
- **R9-4.** CREATE 트랜잭션 테스트: `to=null` → 배포 트랜잭션 빌드 + 서명
- **R9-5.** 정책 적용 테스트: CONTRACT_DEPLOY에 정책 엔진이 동작하는지 확인
- **R9-6.** 비동기 승인 테스트: DELAY/APPROVAL 티어 long-poll 동작 확인
- **R9-7.** batch 요청 테스트: 다중 RPC 호출 일괄 처리
- **R9-8.** 인증/보안 테스트: 미인증 요청 거부, from 주소 불일치 거부
- **R9-9.** Forge 호환성 E2E: `forge script` → WAIaaS RPC 프록시 → Anvil 배포 시나리오 (CI에서 Foundry 미설치 시 로컬 매뉴얼 검증으로 대체. CI 통합은 Foundry 설치가 가능한 환경에서만 조건부 실행)

---

## 설계 결정

### D1. URL 기반 지갑+체인 라우팅 (`/v1/rpc-evm/:walletId/:chainId`)

JSON-RPC 프로토콜에는 지갑 선택이나 체인 선택 메커니즘이 없다. EVM EOA는 동일 키로 모든 체인에서 같은 주소를 갖기 때문에, walletId만으로는 대상 체인을 결정할 수 없다.

**URL 경로 설계:**
- `/v1/rpc-evm/` 프리픽스: 프로토콜별 네임스페이스 분리. 향후 `/v1/rpc-solana/` 등으로 확장 가능
- `chainId`: EVM chain ID 숫자 (1=Ethereum, 8453=Base, 42161=Arbitrum). Forge/Hardhat 개발자에게 직관적
- 내부 매핑: `EVM_CHAIN_MAP` (`evm-chain-map.ts`)을 통해 chainId 숫자 → WAIaaS NetworkType slug (`ethereum-mainnet`, `base-mainnet` 등)로 변환. RPC Pool은 이 slug로 엔드포인트 조회
- Forge: `--rpc-url http://localhost:3000/v1/rpc-evm/{walletId}/1`로 명시적 지정
- Alchemy·Infura 등 업계 표준과 동일하게 URL로 체인 구분 (Forge `--rpc-url`은 단일 URL만 허용)
- 세션 내 다중 지갑 + 다중 체인도 별도 URL로 구분 가능
- `eth_chainId` 응답을 chainId에서 자동 도출하여 클라이언트-서버 체인 일치 보장
- 기존 sessionAuth + resolveWalletId + RPC Pool 네트워크별 조회 로직과 자연스럽게 통합

### D2. Long-poll 방식의 비동기 승인

WebSocket이나 콜백 대신 HTTP long-poll을 선택한 이유:
- Forge/Hardhat의 RPC 클라이언트는 단순 HTTP POST → JSON 응답을 기대
- WebSocket은 추가 프로토콜 협상이 필요하고 호환성 문제 발생
- Long-poll은 기존 HTTP 인터페이스를 유지하면서 비동기 대기를 자연스럽게 처리
- 타임아웃 후 명확한 JSON-RPC 에러 반환
- **주의**: Forge 기본 HTTP 타임아웃(~45초)이 DELAY/APPROVAL 대기 시간보다 짧으므로, 사용자 가이드에서 `--timeout` 설정 안내 필수

### D3. CONTRACT_DEPLOY 정책 타입 신설 — TRANSACTION_TYPES 9-type 확장

기존 CONTRACT_CALL과 분리하는 이유:
- 배포는 새 코드를 온체인에 올리는 고위험 작업
- CONTRACT_WHITELIST 정책은 `to` 주소 기반이지만 배포에는 `to`가 없음
- `bytecodeHash` 기반 허용/거부 정책이 더 적합 (특정 컨트랙트 코드만 허용)
- 기본 정책: APPROVAL 티어 (배포는 항상 Owner 승인 필요)

**현재 타입 구조:**
- `TRANSACTION_TYPES` enum: 8개 (TRANSFER / TOKEN_TRANSFER / CONTRACT_CALL / APPROVE / BATCH / NFT_TRANSFER / SIGN / X402_PAYMENT)
- `TransactionRequestSchema` discriminatedUnion: 6개 (TRANSFER / TOKEN_TRANSFER / CONTRACT_CALL / APPROVE / BATCH / NFT_TRANSFER) — SIGN, X402_PAYMENT은 별도 API
- CONTRACT_DEPLOY 추가 시: enum 9개, discriminatedUnion 7개

**파급 효과 (Zod SSoT 체인):** CONTRACT_DEPLOY 추가는 TRANSACTION_TYPES 8-type → 9-type 확장을 의미하며, Zod 스키마 → TypeScript 타입 → OpenAPI → Drizzle 스키마 → DB CHECK 제약 전체를 업데이트해야 한다. 구체적으로:
- `transaction.ts` enum: TRANSACTION_TYPES 배열에 `'CONTRACT_DEPLOY'` 추가
- `transaction.schema.ts`: Zod discriminatedUnion에 CONTRACT_DEPLOY variant 추가
- `tx_history` DB CHECK 제약: type 컬럼 허용값에 `'CONTRACT_DEPLOY'` 추가 (DB 마이그레이션 필요)
- OpenAPI 스펙 자동 재생성
- CLAUDE.md의 `discriminatedUnion 8-type` 표기를 `9-type`으로 갱신

### D4. 패스스루는 RPC Pool 직접 연결

읽기 메서드는 WAIaaS 로직 없이 RPC Pool로 직접 프록시한다. 이미 v28.6에서 구현한 멀티엔드포인트 로테이션 + 헬스체크 + 레이트리밋 인프라를 그대로 활용한다. 추가 캐싱 레이어는 범위 밖.

### D5. EVM 전용 (Solana 미지원)

RPC 프록시는 EVM JSON-RPC 프로토콜 기반이므로 EVM 체인만 지원한다. Solana는 JSON-RPC 규격이 다르고 (`sendTransaction`이 서명 완료된 트랜잭션을 받음), Forge 등 EVM 툴체인 호환이 목표이므로 Solana 지원은 범위 밖이다.

### D6. 기존 파이프라인 재사용 — 동기 실행 모드 추가

RPC 프록시에서 받은 트랜잭션을 새 파이프라인으로 처리하지 않고, 기존 6-stage 파이프라인에 주입한다. `eth_sendTransaction` → 기존 `tx-parser.ts` selector 감지 로직 재사용 → 트랜잭션 타입 분류 → 기존 파이프라인 입력으로 변환. 이렇게 하면 정책 엔진, 감사 로그, 알림, 시간 지연 등 모든 기존 기능이 자동 적용된다.

**REST API vs RPC 프록시 실행 모드 차이:**
- REST API: Stage 1 후 즉시 `201 {id, status: 'PENDING'}` 반환 → Stage 2-6 fire-and-forget → 클라이언트 폴링
- RPC 프록시: Stage 1-6 전체를 동기적으로 await → 최종 txHash를 JSON-RPC `result`로 반환
- 구현: 파이프라인에 `syncMode: boolean` 옵션 추가 또는 RPC 핸들러에서 EventBus `transaction:completed`/`transaction:failed` 이벤트를 Promise로 래핑하여 대기

---

## 영향 범위

| 파일/영역 | 변경 내용 |
|----------|----------|
| `packages/daemon/src/api/routes/rpc-proxy.ts` | 신규 — JSON-RPC 프록시 라우트 (`/v1/rpc-evm/:walletId/:chainId`) |
| `packages/daemon/src/rpc-proxy/` | 신규 — RPC 메서드 디스패처, 인터셉터, 패스스루 |
| `packages/daemon/src/rpc-proxy/method-handlers.ts` | 신규 — eth_sendTransaction 등 서명 메서드 핸들러 |
| `packages/daemon/src/rpc-proxy/passthrough.ts` | 신규 — 읽기 메서드 RPC 포워딩 |
| `packages/adapters/evm/src/adapter.ts` | buildDeployTransaction() 추가 |
| `packages/adapters/evm/src/tx-parser.ts` | NFT selector 감지 확장 (ERC-721/1155 safeTransferFrom) |
| `packages/core/src/enums/transaction.ts` | TRANSACTION_TYPES에 `'CONTRACT_DEPLOY'` 추가 (8→9-type) |
| `packages/core/src/schemas/transaction.schema.ts` | CONTRACT_DEPLOY variant 추가 (discriminatedUnion 6→7-type) |
| `packages/daemon/src/pipeline/stages.ts` | CREATE 트랜잭션 분류 + 정책 매핑 |
| `packages/daemon/src/config/settings.schema.ts` | rpc_proxy.* 설정 추가 |
| `packages/admin/src/pages/` | RPC 프록시 관리 섹션 |
| `packages/mcp/src/tools/` | get_rpc_proxy_url 도구 |
| `packages/sdk/src/` | getRpcProxyUrl() 메서드 |
| `packages/core/src/schemas/connect-info.schema.ts` | rpcProxyUrl 필드 |
| DB 마이그레이션 (v58) | `tx_history.type` CHECK 제약에 `'CONTRACT_DEPLOY'` 추가 + `schema_version` 업데이트 |

---

## 범위 밖 (명시적 제외)

| 항목 | 이유 | 대안 |
|------|------|------|
| Solana RPC 프록시 | JSON-RPC 규격 상이, EVM 툴체인 호환 목적 | 별도 마일스톤 (`/v1/rpc-solana/` 네임스페이스 예약) |
| WebSocket RPC (`eth_subscribe`) | 초기 버전은 HTTP POST만 | 후속 확장 |
| EIP-4337 UserOp RPC (`eth_sendUserOperation`) | Bundler RPC 규격 별도 | 기존 UserOp API 사용 |
| 응답 캐싱 (eth_getBlockByNumber 등) | 초기 범위 초과 | 성능 이슈 발생 시 추가 |
| 다중 체인 동시 프록시 (단일 URL) | URL당 단일 체인, 별도 URL로 분리 | `/v1/rpc-evm/:walletId/:chainId`로 해결 |
| Forge verify 통합 (Etherscan API) | WAIaaS 범위 밖 | 사용자가 직접 verify |
