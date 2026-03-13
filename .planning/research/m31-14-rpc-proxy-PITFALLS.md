# Domain Pitfalls: EVM RPC Proxy

**Domain:** EVM JSON-RPC 프록시를 기존 WAIaaS 데몬에 추가
**Researched:** 2026-03-13

---

## Critical Pitfalls

리라이트 또는 심각한 장애를 유발하는 실수.

### Pitfall 1: Node.js keepAliveTimeout이 Long-Poll을 끊어버림

**What goes wrong:** Node.js HTTP 서버의 기본 `keepAliveTimeout`은 **5초**이다. RPC 프록시의 DELAY/APPROVAL 티어에서 수십 초~수 분간 응답을 보류하면, Node.js가 keep-alive 연결을 5초 후 자동 종료한다. 클라이언트(Forge/Hardhat)는 **재전송**하거나 "empty reply from server" 에러를 받는다. POST 요청이 재전송되면 중복 트랜잭션이 발생할 수 있다.

**Why it happens:** 현재 `daemon.ts`의 `serve()` 호출에서 `keepAliveTimeout`이나 `headersTimeout`을 설정하지 않는다 (L1528-1532). `@hono/node-server`의 `serve()`가 반환하는 `http.Server`는 Node.js 기본값(5s keepAlive, 약 60s headersTimeout)을 그대로 사용한다.

**Consequences:**
- DELAY 티어(기본 300초) 대기 중 연결 끊김
- APPROVAL 티어(기본 600초) 대기 중 연결 끊김
- 재전송 시 동일 트랜잭션 2번 실행 가능 (nonce 충돌 또는 이중 서명)
- Forge `--timeout 600` 설정해도 서버가 먼저 끊으면 무용

**Prevention:**
```typescript
const server = serve({ fetch: app.fetch, hostname, port });
// RPC 프록시 long-poll 지원: approval_timeout_seconds (기본 600) 이상으로 설정
server.keepAliveTimeout = 700_000; // 700초 (approval timeout + 여유)
server.headersTimeout = 705_000;   // keepAliveTimeout보다 약간 크게
```

**Detection:** DELAY/APPROVAL 트랜잭션이 "connection reset" 또는 "empty reply" 에러와 함께 실패. 로그에 트랜잭션 완료 기록은 남지만 클라이언트에 응답이 도달하지 않는 현상.

**Phase:** 인프라 설정 단계에서 즉시 처리 (RPC 프록시 라우트 등록보다 선행).

---

### Pitfall 2: CONTRACT_DEPLOY 타입 추가의 불완전한 Zod SSoT 체인 전파

**What goes wrong:** `TRANSACTION_TYPES` 배열에 `CONTRACT_DEPLOY`를 추가하면 Zod enum은 자동 확장되지만, 코드베이스 전체의 **switch/case 분기, DB CHECK 제약, OpenAPI 스펙, 테스트 fixture, Admin UI 표시, 정책 엔진 매핑, 알림 카테고리** 등을 모두 업데이트하지 않으면 런타임 에러가 발생한다.

**Why it happens:** WAIaaS는 TypeScript의 exhaustive check를 `default: throw` 패턴으로 구현한다 (`stages.ts` L1127-1130, L1337-1340). CONTRACT_DEPLOY 타입의 트랜잭션이 이 switch에 도달하면 `Unknown transaction type` 에러로 크래시한다.

**Consequences:**
- 파이프라인 Stage 4 (빌드)에서 `Unknown transaction type: CONTRACT_DEPLOY` 에러
- sign-only 파이프라인에서도 동일 크래시
- `resolve-effective-amount-usd.ts`의 switch에서 누락 시 USD 정책 평가 실패
- Admin UI 트랜잭션 목록에서 `CONTRACT_DEPLOY` 표시 불가
- DB `tx_history.type` CHECK 제약 위반으로 INSERT 실패

**Prevention:** 체크리스트 기반 접근:
1. `packages/core/src/enums/transaction.ts` — TRANSACTION_TYPES 배열 추가
2. `packages/core/src/schemas/transaction.schema.ts` — discriminatedUnion에 variant 추가
3. `packages/daemon/src/pipeline/stages.ts` — Stage 1 타입 분류, Stage 4 빌드, UserOp 빌드
4. `packages/daemon/src/pipeline/sign-only.ts` — sign-only 핸들러
5. `packages/daemon/src/pipeline/resolve-effective-amount-usd.ts` — USD 금액 해석
6. DB 마이그레이션 v58 — `tx_history.type` CHECK 제약 갱신
7. Admin UI — 트랜잭션 유형 표시 + 아이콘
8. 정책 엔진 — CONTRACT_DEPLOY 정책 매핑
9. 알림 서비스 — CONTRACT_DEPLOY 이벤트 카테고리
10. OpenAPI 스펙 재생성
11. CLAUDE.md — "discriminatedUnion 8-type" 표기를 "9-type"으로 갱신
12. 테스트 — 기존 enum 테스트(`enums.test.ts`, `nft-schema.test.ts`) 업데이트

**Detection:** TypeScript 컴파일은 통과할 수 있다 (default case가 타입 에러를 일으키지 않으므로). 런타임에 CONTRACT_DEPLOY 트랜잭션을 보내야 발견됨. 따라서 타입 추가 직후 E2E 테스트 필수.

**Phase:** 타입 시스템 확장 전용 페이즈로 분리 (다른 기능보다 선행). 모든 switch/case를 한 PR에서 일괄 업데이트.

---

### Pitfall 3: `toAddress` 비nullable 제약으로 CREATE 트랜잭션 저장 실패

**What goes wrong:** `TransactionSchema`의 `toAddress` 필드는 `z.string()`으로 정의되어 있어 빈 문자열은 가능하지만 null은 불가하다 (L35). CREATE 트랜잭션은 `to`가 없으므로, 트랜잭션 기록 저장 시 `toAddress`에 적절한 값이 필요하다.

**Why it happens:** 기존 모든 트랜잭션 타입은 `to` 주소가 반드시 존재했다. CONTRACT_DEPLOY는 유일하게 `to`가 없는 타입이다. Drizzle 스키마에서는 `text('to_address')`로 `.notNull()` 없이 정의되어 DB 자체는 null 허용하지만, Zod 스키마에서 빈 문자열("")을 넣으면 `toAddress: ""` 검색 시 의미 없는 결과가 반환된다.

**Consequences:**
- Zod 검증에서 null을 거부 (Schema와 DB 불일치)
- 빈 문자열 사용 시 쿼리 필터링 혼란
- Admin UI에서 트랜잭션 상세 표시 시 빈 주소 렌더링
- `deployedAddress`를 메타데이터에만 저장하면 검색이 불가

**Prevention:**
- `TransactionSchema.toAddress`를 `z.string().nullable()`로 변경
- CREATE 트랜잭션은 `toAddress: null`로 저장
- 배포 후 생성된 컨트랙트 주소는 `metadata.deployedAddress`에 기록
- Admin UI에서 `toAddress === null`이면 "Contract Deploy" 뱃지 표시
- 기존 코드에서 `toAddress`를 non-null로 가정하는 곳 검토 (트랜잭션 목록, 검색 등)

**Detection:** CREATE 트랜잭션 저장 시 Zod 검증 에러 또는 DB NULL 관련 에러.

**Phase:** CONTRACT_DEPLOY 타입 추가 페이즈에서 함께 처리.

---

### Pitfall 4: Forge Script Multi-TX Nonce 불일치

**What goes wrong:** Forge `forge script --broadcast`는 여러 트랜잭션을 순차 전송한다. 각 `eth_sendTransaction` 호출 시 WAIaaS가 `eth_getTransactionCount('pending')`로 nonce를 조회하면, 이전 트랜잭션이 아직 mempool에 있거나 WAIaaS 파이프라인(DELAY/APPROVAL) 대기 중이면 **같은 nonce를 두 번 사용**한다.

**Why it happens:** 현재 `EvmAdapter`의 모든 `buildTransaction` 계열 메서드는 매번 `client.getTransactionCount({ address: fromAddr })`를 호출한다 (adapter.ts L277, L545, L655 등). 이는 REST API에서는 문제없다 (한 번에 하나씩 처리). 그러나 RPC 프록시에서 Forge script가 tx1, tx2, tx3를 연속 전송하면:
- tx1: nonce=5 (getTransactionCount 반환)
- tx1이 아직 confirm 전: tx2도 nonce=5 (같은 값 반환)
- tx2 실패 ("nonce too low" 또는 "replacement transaction underpriced")

**Consequences:**
- Forge script 중간에 실패 → `--resume`으로 재시도해도 nonce 꼬임
- "EOA nonce changed unexpectedly" 에러 (Foundry #4719)
- 멀티 컨트랙트 배포 실패

**Prevention:**
- RPC 프록시 전용 **로컬 nonce 트래커** 구현: `Map<address, pendingNonce>`
- `eth_sendTransaction` 처리 시: `pendingNonce = max(onchainNonce, localTracker + 1)`
- 트랜잭션 confirm 시 로컬 트래커 업데이트
- 트랜잭션 실패 시 로컬 트래커 롤백
- `eth_getTransactionCount('pending')` 패스스루 요청도 로컬 트래커 값 반영
- 단일 지갑+체인 조합에 대해 직렬화 (동시 `eth_sendTransaction` 방지)

**Detection:** Forge script가 2번째 이상 트랜잭션에서 "nonce too low" 에러. 또는 같은 nonce의 트랜잭션 2개가 mempool에 들어가 하나가 드롭됨.

**Phase:** RPC 메서드 핸들러 구현 페이즈. 핵심 기능이므로 초기에 처리.

---

## Moderate Pitfalls

### Pitfall 5: Forge/Hardhat HTTP 타임아웃 기본값 불일치

**What goes wrong:** Forge의 기본 HTTP 타임아웃은 약 45초이다. WAIaaS DELAY 티어(기본 300초)나 APPROVAL 티어(기본 600초)보다 훨씬 짧다. 사용자가 `--timeout` 설정을 모르면 Forge가 먼저 타임아웃되어 "request timed out" 에러가 발생하지만, WAIaaS 측에서는 트랜잭션이 계속 진행된다.

**Prevention:**
- RPC 프록시 응답 헤더에 `X-WAIaaS-Timeout-Hint: 600` 추가
- `eth_sendTransaction` 에러 응답에 도구별 타임아웃 설정 방법 안내 메시지 포함
- 문서에 명시: `forge script --timeout 600`, Hardhat `networks.waiaas.timeout: 600000`
- IMMEDIATE 티어만 사용하는 테스트넷 개발 시나리오는 기본값으로 충분함을 안내

**Detection:** 클라이언트 측 타임아웃 에러 후 WAIaaS 로그에는 트랜잭션 성공 기록.

**Phase:** RPC 프록시 long-poll 구현 페이즈에서 에러 메시지와 함께 처리.

---

### Pitfall 6: JSON-RPC 2.0 Batch 요청에서 서명 메서드와 읽기 메서드 혼합

**What goes wrong:** Batch 요청(`[{eth_sendTransaction}, {eth_call}, {eth_getBalance}]`)에서 서명 메서드는 파이프라인을 거쳐야 하고 읽기 메서드는 즉시 프록시할 수 있다. 모든 응답을 **동일 순서로** 반환해야 하므로, 서명 메서드의 long-poll이 전체 batch 응답을 지연시킨다.

**Why it happens:** JSON-RPC 2.0 spec은 batch 응답이 "반드시 같은 순서일 필요는 없다"고 하지만, 요청의 `id`로 매칭해야 한다. 문제는 하나의 `eth_sendTransaction`이 APPROVAL 대기 상태면 나머지 `eth_call` 결과도 함께 블로킹되어 사용자가 "멈춘 것처럼" 느끼는 것이다.

**Prevention:**
- Batch 내 각 요청을 **병렬 처리**: 읽기 메서드는 즉시 실행, 서명 메서드는 파이프라인 대기
- `Promise.all()`로 모든 결과 수집 후 batch 응답 반환
- 대안: batch 내 `eth_sendTransaction` 포함 시 JSON-RPC 에러 반환하여 개별 요청 강제 (Alchemy/Infura 방식)
- 추천: 초기 구현은 batch 내 서명 메서드를 **거부** (`-32600 eth_sendTransaction not allowed in batch`)하고, 후속에서 병렬 처리 추가

**Detection:** Batch 요청 시 전체 응답이 가장 느린 서명 메서드 기준으로 지연됨.

**Phase:** JSON-RPC batch 구현 페이즈. 초기에는 서명 메서드 batch 거부로 단순화.

---

### Pitfall 7: EIP-1559 가스 추정에서 컨트랙트 배포 특이 케이스

**What goes wrong:** 컨트랙트 배포의 `eth_estimateGas`는 `to: undefined`로 호출해야 하는데, viem의 `estimateGas()`에 `to`를 포함하면 일반 트랜잭션으로 취급된다. 또한 배포 바이트코드에는 constructor 인자가 ABI 인코딩되어 append되므로, `data` 길이가 매우 클 수 있다 (수 KB~수백 KB).

**Why it happens:** 기존 `EvmAdapter`의 모든 가스 추정 로직은 `to` 주소가 있는 전제로 구현되어 있다. `to: undefined`로 `estimateGas()`를 호출하면 viem이 자동으로 CREATE 트랜잭션으로 인식하지만, `gasLimit` 산출 시 기존 safety margin `(estimatedGas * 120n) / 100n`이 부족할 수 있다 (배포는 state 변경이 많아 추정 오차가 큼).

**Prevention:**
- `buildDeployTransaction()`에서 `to: undefined`로 가스 추정
- 배포 트랜잭션의 safety margin을 30%로 상향: `(estimatedGas * 130n) / 100n`
- `rpc_proxy.max_gas_limit` (기본 30M) 설정으로 과도한 가스 소비 방지
- `data` 크기 제한: R8-3의 48KB 상한 적용 (EIP-170 x 2)
- viem `estimateGas({ to: undefined, data: bytecode })` 호출 시 `from` 필수

**Detection:** 배포 트랜잭션이 "out of gas" 에러로 실패하지만 추정은 성공했던 경우.

**Phase:** EvmAdapter 확장 페이즈에서 처리.

---

### Pitfall 8: `eth_sendTransaction`의 `from` 필드 처리 불일치

**What goes wrong:** Forge는 `eth_sendTransaction`에 `from` 필드를 포함하지 않거나, `--sender` 플래그로 지정한 주소를 포함한다. WAIaaS는 URL 경로의 `walletId`로 서명 지갑을 결정하므로, `from`이 누락되면 채워야 하고, `from`이 있으면 지갑 주소와 일치하는지 검증해야 한다.

**Why it happens:** Forge `--unlocked` 모드에서는 `from`을 `eth_sendTransaction`에 포함한다. `--unlocked` 없이 `--private-key`나 `--keystore` 대신 WAIaaS RPC를 사용하는 경우, Forge가 `eth_accounts`로 먼저 주소를 조회하고 그 주소를 `from`에 넣는다.

**Consequences:**
- `from` 누락 시: WAIaaS가 채우지 않으면 Forge가 에러
- `from`이 세션 지갑과 불일치 시: 보안 위반 (다른 지갑으로 서명 시도)
- checksummed vs lowercase 주소 비교 실패

**Prevention:**
- `from` 누락 시: URL `walletId`의 지갑 주소로 자동 채움
- `from` 존재 시: `from.toLowerCase() === walletAddress.toLowerCase()` 검증
- 불일치 시: JSON-RPC 에러 `-32602 from address does not match wallet`
- `eth_accounts` 응답에 반환한 주소와 `from`이 일치하는 것이 정상 플로우

**Detection:** `from` 불일치 시 명확한 에러 메시지로 사용자에게 안내.

**Phase:** RPC 메서드 핸들러 구현 페이즈.

---

### Pitfall 9: JSON-RPC 2.0 프로토콜 준수 미비

**What goes wrong:** 미묘한 JSON-RPC 2.0 spec 위반이 Forge/Hardhat의 RPC 클라이언트를 혼란시킨다.

**주요 에지 케이스:**
1. **`id` 타입 보존**: 요청의 `id`가 `number`면 응답도 `number`, `string`이면 `string`. Forge는 숫자 ID를 사용한다.
2. **Notification (id 없음)**: `id` 필드가 없는 요청은 응답을 반환하지 않아야 한다. 응답을 반환하면 파싱 에러.
3. **`result`와 `error` 상호 배타**: 둘 다 포함하면 안 된다. `error` 있으면 `result` 없어야 한다.
4. **`jsonrpc: "2.0"` 필수**: 응답에 누락하면 클라이언트가 거부.
5. **에러 코드**: `-32700` (parse error), `-32600` (invalid request), `-32601` (method not found), `-32602` (invalid params), `-32603` (internal error). 커스텀 에러는 `-32000` ~ `-32099` 범위.
6. **빈 batch 응답**: batch 내 모든 요청이 notification이면 응답 자체를 보내지 않아야 한다.

**Prevention:**
- JSON-RPC 응답 빌더 유틸리티 작성: `jsonRpcResult(id, result)`, `jsonRpcError(id, code, message)`
- 모든 응답에 `jsonrpc: "2.0"` 포함 검증 테스트
- `id` 타입 보존 테스트 (number/string/null)
- notification(id 없음) 감지 및 응답 생략 로직

**Detection:** Forge가 "invalid JSON-RPC response" 에러를 보고하지만 WAIaaS 측 로그에는 성공으로 기록.

**Phase:** JSON-RPC 프로토콜 계층 구현 페이즈 (가장 첫 페이즈).

---

### Pitfall 10: REST API 동기 모드와 기존 fire-and-forget 모드의 충돌

**What goes wrong:** 기존 REST API는 Stage 1 후 즉시 반환하고 Stage 2-6을 fire-and-forget으로 실행한다. RPC 프록시는 Stage 1-6 전체를 동기적으로 await해야 한다. 파이프라인에 `syncMode` 옵션을 추가할 때 기존 REST API의 동작이 깨지면 안 된다.

**Why it happens:** 파이프라인 내부 상태 관리, 에러 핸들링, 이벤트 발행이 fire-and-forget 전제로 설계되어 있다. 동기 모드에서 Stage 3 (DELAY) 대기 중 예외가 발생하면, 어디서 catch하고 어떻게 클라이언트에 전달할지 결정해야 한다.

**Prevention:**
- 파이프라인 코드를 수정하지 않고, RPC 핸들러에서 **EventBus 이벤트 대기** 패턴 사용
- `txId → Promise<{resolve, reject}>` Map 관리
- `transaction:completed` 이벤트 → resolve(txHash)
- `transaction:failed` 이벤트 → reject(error)
- `Promise.race([completionPromise, timeoutPromise, abortPromise])` 조합
- AbortController로 클라이언트 연결 끊김 감지 → 리소스 정리

**Detection:** RPC 프록시를 통한 트랜잭션이 영원히 응답하지 않거나, REST API를 통한 트랜잭션이 갑자기 동기 모드로 동작.

**Phase:** RPC 프록시 핸들러 구현 페이즈. EventBus 패턴이 파이프라인 변경 없이 구현 가능.

---

## Minor Pitfalls

### Pitfall 11: `eth_getTransactionCount` 패스스루와 로컬 nonce 트래커 불일치

**What goes wrong:** Forge가 `eth_getTransactionCount(address, 'pending')`를 호출하여 nonce를 확인한다. 이를 그대로 RPC에 프록시하면 WAIaaS 내부에서 대기 중인 트랜잭션의 nonce가 반영되지 않는다. Forge가 이미 사용된 nonce를 "사용 가능"으로 인식하여 같은 nonce로 트랜잭션을 보낸다.

**Prevention:**
- `eth_getTransactionCount('pending')` 인터셉트: `max(onchainPendingNonce, localTrackerNonce)` 반환
- `eth_getTransactionCount('latest')` 인터셉트: WAIaaS 내부 대기 트랜잭션이 있으면 주의 로그
- `'earliest'` 등 다른 블록 태그는 그대로 패스스루

**Phase:** Nonce 관리 구현 페이즈에서 함께 처리.

---

### Pitfall 12: sessionAuth JWT를 Forge `--rpc-url`에 넣을 때 URL 길이 제한

**What goes wrong:** `Authorization: Bearer <JWT>` 헤더가 필요한데, Forge의 `--rpc-url`은 단순 URL만 허용하고 커스텀 헤더를 지원하지 않는다. JWT를 URL 쿼리 파라미터로 전달하면 (`?token=xxx`) 로그에 노출되는 보안 위험이 있다.

**Prevention:**
- `--header "Authorization: Bearer ..."` 지원 여부 확인 (Forge 최신 버전에서 `--header` 플래그 지원)
- Forge `foundry.toml`에서 `[rpc_endpoints]` + `headers` 설정 활용
- 대안: `--rpc-url`에 `http://token@localhost:3000/v1/rpc-evm/...` HTTP Basic Auth 스타일 지원 (서버에서 Basic Auth → JWT 변환)
- 최소 지원: URL 쿼리 파라미터 `?token=` 허용 + 로그에서 토큰 마스킹

**Phase:** 인증 통합 페이즈. Forge/Hardhat 호환성 테스트 병행.

---

### Pitfall 13: `eth_chainId` 응답 형식 (hex string vs number)

**What goes wrong:** `eth_chainId`는 `0x1` (hex string)을 반환해야 하는데, 실수로 `1` (number)이나 `"1"` (decimal string)을 반환하면 Forge가 체인 불일치로 판단하여 트랜잭션을 거부한다.

**Prevention:**
- `eth_chainId` 응답: `"0x" + chainId.toString(16)` (hex string)
- `net_version` 응답: `chainId.toString()` (decimal string) -- 두 메서드의 반환 형식이 다름
- Hardhat은 두 응답이 일치하는지 추가 검증하는 경우 있음
- 테스트에서 hex/decimal 형식 검증 필수

**Phase:** 패스스루 메서드 구현 페이즈.

---

### Pitfall 14: `transferFrom` Selector 공유 (ERC-20 vs ERC-721)

**What goes wrong:** `0x23b872dd` selector는 ERC-20의 `transferFrom(address,address,uint256)`과 ERC-721의 `transferFrom(address,address,uint256)` 모두에 사용된다. RPC 프록시가 `eth_sendTransaction`의 calldata에서 이 selector를 감지하면 TOKEN_TRANSFER와 NFT_TRANSFER를 구분할 수 없다.

**Prevention:**
- 초기 구현: `0x23b872dd`는 CONTRACT_CALL로 fallback (m31-14 objective D3에 명시)
- CONTRACT_WHITELIST에 NFT 컨트랙트로 등록된 경우만 NFT_TRANSFER
- 향후: `eth_call`로 ERC-165 `supportsInterface(0x80ac58cd)` 체크 추가
- 기존 `tx-parser.ts`의 selector 감지 로직과 일관성 유지

**Phase:** tx-parser 확장 페이즈.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| JSON-RPC 프로토콜 계층 | Pitfall 9: spec 준수 미비, id 타입 보존 | 응답 빌더 유틸리티 먼저 작성, 프로토콜 테스트 선행 |
| CONTRACT_DEPLOY 타입 추가 | Pitfall 2: SSoT 체인 불완전 전파 | 체크리스트 기반 일괄 업데이트, Pitfall 3: toAddress nullable 변경 동반 |
| EvmAdapter 배포 빌드 | Pitfall 7: to=undefined 가스 추정 | safety margin 30%, data 크기 제한, viem estimateGas 검증 |
| RPC 메서드 핸들러 | Pitfall 4: 멀티 TX nonce 불일치 | 로컬 nonce 트래커 필수, 직렬화 |
| Long-poll 구현 | Pitfall 1: keepAliveTimeout 5초 | 서버 시작 시 timeout 설정, Pitfall 5: 클라이언트 타임아웃 안내 |
| 동기 모드 파이프라인 | Pitfall 10: 기존 fire-and-forget 깨짐 | EventBus 패턴 사용, 파이프라인 코드 미수정 |
| Batch 요청 | Pitfall 6: 서명+읽기 혼합 | 초기: 서명 메서드 batch 거부 |
| 인증 통합 | Pitfall 12: Forge 헤더 미지원 | foundry.toml headers 설정, Basic Auth fallback |
| 패스스루 메서드 | Pitfall 13: eth_chainId 형식 | hex vs decimal 구분, Pitfall 11: nonce 인터셉트 |
| tx-parser 확장 | Pitfall 14: selector 공유 | CONTRACT_CALL fallback, ERC-165 확인은 후속 |

---

## Sources

- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification) -- 프로토콜 준수 요건
- [Foundry #4719: nonce 불일치](https://github.com/foundry-rs/foundry/issues/4719) -- Forge script nonce 관리 이슈
- [Foundry #6796: broadcast hangs](https://github.com/foundry-rs/foundry/issues/6796) -- Forge script 대기 이슈
- [Node.js #13391: keepAliveTimeout 5초](https://github.com/nodejs/node/issues/13391) -- HTTP 연결 종료 이슈
- [Hono #3637: timeout > 10s empty reply](https://github.com/honojs/hono/issues/3637) -- Hono 서버 타임아웃
- [Better Stack: Node.js Timeouts Guide](https://betterstack.com/community/guides/scaling-nodejs/nodejs-timeouts/) -- Node.js 타임아웃 설정 가이드
- [thirdweb: nonce management](https://blog.thirdweb.com/sending-more-than-one-transaction-at-a-time/) -- 동시 트랜잭션 nonce 관리
- [QuickNode: nonce management](https://www.quicknode.com/guides/ethereum-development/transactions/how-to-manage-nonces-with-ethereum-transactions) -- EVM nonce 관리 기법
- [geth batch requests](https://geth.ethereum.org/docs/interacting-with-geth/rpc/batch) -- batch 요청 구현 참조
- [Foundry deploy docs](https://getfoundry.sh/forge/deploying/) -- Forge broadcast 동작
- [ethereum/execution-apis #494: nonce edge cases](https://github.com/ethereum/execution-apis/issues/494) -- eth_getTransactionCount pending 이슈
- WAIaaS 코드베이스 직접 분석: `daemon.ts` L1528-1532, `adapter.ts` nonce 패턴, `stages.ts` switch/case 분기, `transaction.schema.ts` toAddress 정의
