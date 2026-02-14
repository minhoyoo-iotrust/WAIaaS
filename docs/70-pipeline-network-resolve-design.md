# 설계 문서 70: 파이프라인 네트워크 리졸브 설계

> **Phase:** 106 (v1.4.5 -- 멀티체인 월렛 설계)
> **산출물:** NetworkResolver 순수 함수 + PipelineContext 확장 + 환경-네트워크 교차 검증 + AdapterPool 호출 변경
> **참조 기반:** docs/68-environment-model-design.md, docs/69-db-migration-v6-design.md, 106-RESEARCH.md
> **작성일:** 2026-02-14

---

## 1. 개요

### 1.1 목적

Phase 106은 트랜잭션 요청에서 실제 네트워크가 리졸브되고 환경 격리가 검증되는 데이터 흐름을 설계한다. "1 월렛 = 1 체인 + 1 환경" 모델(Phase 105)에서 트랜잭션 요청 시점에 구체적 네트워크를 선택하는 유연한 모델로 전환하기 위한 파이프라인 변경 설계이다.

**핵심 과제 4개:**

| ID | 과제 | 설계 대상 |
|----|------|---------|
| PIPE-01 | NetworkResolver 순수 함수 | `resolveNetwork()` 3단계 우선순위 해결 |
| PIPE-02 | PipelineContext 확장 | `wallet.environment` + `resolvedNetwork` 전파 |
| PIPE-03 | 환경-네트워크 교차 검증 | `ENVIRONMENT_NETWORK_MISMATCH` 에러 + 보안 로깅 |
| PIPE-04 | AdapterPool 호출부 변경 | `transactions.ts` + `daemon.ts` 2곳 변경 |

### 1.2 Before/After 아키텍처 비교

**Before (v1.4.4 -- 현재):**

```
POST /v1/transactions/send
  |
wallet = db.select(wallets).where(walletId)
  |
rpcUrl = resolveRpcUrl(config.rpc, wallet.chain, wallet.network)  <-- 월렛의 고정 network
adapter = adapterPool.resolve(wallet.chain, wallet.network, rpcUrl)
  |
ctx = { wallet: { chain, network: wallet.network }, adapter, ... }
  |
Stage 1~6 실행 (ctx.wallet.network 참조)
```

**After (v1.4.6 -- 설계 대상):**

```
POST /v1/transactions/send { ..., network?: "polygon-amoy" }
  |
wallet = db.select(wallets).where(walletId)
  |
resolvedNetwork = resolveNetwork(                                  <-- NEW
  request.network,          // 1순위: 요청 명시
  wallet.defaultNetwork,    // 2순위: 월렛 기본값
  wallet.environment,       // 3순위: 환경 기본값
  wallet.chain
)
  |
rpcUrl = resolveRpcUrl(config.rpc, wallet.chain, resolvedNetwork)  <-- resolvedNetwork 사용
adapter = adapterPool.resolve(wallet.chain, resolvedNetwork, rpcUrl)
  |
ctx = { wallet: { chain, environment, defaultNetwork }, resolvedNetwork, adapter, ... }
  |
Stage 1: INSERT transactions (network = resolvedNetwork)           <-- resolvedNetwork 기록
Stage 2~6 실행 (ctx.resolvedNetwork 참조)
```

### 1.3 Phase 105 참조 관계

| Phase 105 산출물 | 이 문서에서의 참조 |
|-----------------|-----------------|
| docs/68 섹션 3.1 `getNetworksForEnvironment()` | `validateNetworkEnvironment()` 내부에서 호출 |
| docs/68 섹션 3.2 `getDefaultNetwork()` | `resolveNetwork()` 3순위 fallback |
| docs/68 섹션 3.3 `deriveEnvironment()` | daemon.ts 재진입부에서 참조 가능 (미사용) |
| docs/68 섹션 3.4 `validateNetworkEnvironment()` | `resolveNetwork()` 내부 2중 검증 |
| docs/68 `ENVIRONMENT_NETWORK_MAP` | 허용 네트워크 판별 상수 |
| docs/69 v6a `transactions.network` | Stage 1 INSERT 대상 컬럼 |
| docs/69 v6b `wallets.environment` + `default_network` | PipelineContext.wallet 필드 원천 |

---

## 2. resolveNetwork() 순수 함수 설계 (PIPE-01)

### 2.1 파일 위치

```
packages/daemon/src/pipeline/network-resolver.ts  (신규 파일)
```

단일 순수 함수를 별도 파일로 분리하여 테스트 용이성과 import 명확성을 확보한다. `stages.ts`에 인라인하지 않는 이유: (1) stages.ts는 이미 700줄 이상으로 비대, (2) resolveNetwork()는 route handler에서 호출되므로 pipeline 모듈 외부에서도 import 필요.

### 2.2 함수 시그니처

```typescript
// packages/daemon/src/pipeline/network-resolver.ts

import {
  type ChainType,
  type EnvironmentType,
  type NetworkType,
  getDefaultNetwork,
  validateChainNetwork,
  validateNetworkEnvironment,
} from '@waiaas/core';

/**
 * Resolve the target network for a transaction.
 *
 * Priority:
 *   1. request.network   (explicit per-tx override)
 *   2. wallet.defaultNetwork (user-configured default, nullable)
 *   3. getDefaultNetwork(chain, environment)  (environment fallback)
 *
 * Internal cross-validation (2-step):
 *   a. validateChainNetwork(chain, resolved)          -- chain-network 호환
 *   b. validateNetworkEnvironment(chain, env, resolved) -- 환경-네트워크 일치
 *
 * @param requestNetwork      - 트랜잭션 요청에 명시된 네트워크 (optional)
 * @param walletDefaultNetwork - 월렛에 설정된 기본 네트워크 (nullable)
 * @param environment          - 월렛의 환경 ('testnet' | 'mainnet')
 * @param chain                - 월렛의 체인 ('solana' | 'ethereum')
 * @returns 리졸브된 NetworkType
 * @throws Error if resolved network is invalid for chain or environment
 */
export function resolveNetwork(
  requestNetwork: NetworkType | undefined | null,
  walletDefaultNetwork: NetworkType | null,
  environment: EnvironmentType,
  chain: ChainType,
): NetworkType {
  // Step 1: Determine network from 3-level priority
  const resolved: NetworkType =
    requestNetwork                                   // 1순위: 트랜잭션 요청 명시
    ?? walletDefaultNetwork                          // 2순위: 월렛 기본값
    ?? getDefaultNetwork(chain, environment);         // 3순위: 환경 기본값

  // Step 2: Cross-validate chain + network (solana에 EVM 네트워크 불가)
  validateChainNetwork(chain, resolved);

  // Step 3: Cross-validate environment + network (testnet에 mainnet 네트워크 불가)
  validateNetworkEnvironment(chain, environment, resolved);

  return resolved;
}
```

### 2.3 3단계 우선순위

| 우선순위 | 원천 | 조건 | 예시 |
|---------|------|------|------|
| 1순위 | `request.network` | 트랜잭션 요청에 명시적으로 포함 | `POST { ..., network: "polygon-amoy" }` |
| 2순위 | `wallet.defaultNetwork` | NOT NULL (사용자가 월렛에 설정) | `PATCH /wallets/:id { defaultNetwork: "polygon-amoy" }` |
| 3순위 | `getDefaultNetwork(chain, env)` | 1순위, 2순위 모두 null/undefined | solana+testnet -> `devnet`, ethereum+testnet -> `ethereum-sepolia` |

**nullish coalescing (`??`) 체인의 동작:**
- `requestNetwork`이 `undefined` 또는 `null`이면 2순위로 진행
- `walletDefaultNetwork`이 `null`이면 3순위로 진행
- `getDefaultNetwork()`는 항상 유효한 NetworkType을 반환 (TypeScript 정적 타입 보장)

### 2.4 내부 2중 검증 순서

검증은 반드시 **chain-network 먼저, environment-network 나중** 순서로 수행한다.

```
resolved = 우선순위 해결
  |
  v
validateChainNetwork(chain, resolved)              -- (a) chain 호환성
  |  FAIL -> Error: "Invalid network 'X' for chain 'Y'"
  v
validateNetworkEnvironment(chain, env, resolved)   -- (b) 환경 일치
  |  FAIL -> Error: "Invalid network 'X' for chain 'Y' in environment 'Z'"
  v
return resolved  -- 검증 통과
```

**순서 근거:**
1. chain-network 불일치(solana + ethereum-sepolia)는 논리적으로 더 기본적인 오류 -- 환경 이전에 체인 자체가 맞지 않음
2. 환경 검증은 chain이 올바른 전제에서만 의미가 있음 (solana + ethereum-sepolia의 환경 검증은 무의미)
3. 기존 `validateChainNetwork()` 에러 메시지가 더 구체적인 정보를 제공 ("Valid: mainnet, devnet, testnet")

### 2.5 에러 분기 3개

| 분기 | 조건 | 에러 원천 | WAIaaSError 변환 |
|------|------|---------|----------------|
| chain-network 불일치 | solana + `ethereum-sepolia` 등 | `validateChainNetwork()` throws Error | `WAIaaSError('ACTION_VALIDATION_FAILED')` (기존 패턴) |
| environment-network 불일치 | mainnet 월렛 + `devnet` 등 | `validateNetworkEnvironment()` throws Error | `WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH')` (신규) |
| 정상 해결 | 모든 검증 통과 | -- | -- (NetworkType 반환) |

### 2.6 입출력 예시 테이블

| # | chain | environment | request.network | wallet.defaultNetwork | resolved | 검증 결과 | 비고 |
|---|-------|-------------|-----------------|----------------------|----------|---------|------|
| 1 | solana | testnet | `null` | `null` | `devnet` | PASS | 3순위 fallback: getDefaultNetwork |
| 2 | solana | testnet | `testnet` | `null` | `testnet` | PASS | 1순위: 요청 명시 (Solana testnet) |
| 3 | ethereum | testnet | `polygon-amoy` | `ethereum-sepolia` | `polygon-amoy` | PASS | 1순위 우선: 요청이 wallet 기본값 override |
| 4 | ethereum | mainnet | `null` | `polygon-mainnet` | `polygon-mainnet` | PASS | 2순위: wallet 기본값 사용 |
| 5 | ethereum | mainnet | `null` | `null` | `ethereum-mainnet` | PASS | 3순위 fallback |
| 6 | solana | mainnet | `devnet` | `null` | `devnet` | **FAIL** (env) | env 불일치: mainnet 월렛에 devnet 요청 |
| 7 | ethereum | testnet | `ethereum-mainnet` | `null` | `ethereum-mainnet` | **FAIL** (env) | env 불일치: testnet 월렛에 mainnet 네트워크 |
| 8 | solana | testnet | `ethereum-sepolia` | `null` | `ethereum-sepolia` | **FAIL** (chain) | chain 불일치: solana에 EVM 네트워크 |
| 9 | ethereum | mainnet | `devnet` | `null` | `devnet` | **FAIL** (chain) | chain 불일치: ethereum에 Solana 네트워크 |
| 10 | ethereum | testnet | `null` | `polygon-amoy` | `polygon-amoy` | PASS | 2순위: L2 testnet 사용 |
| 11 | solana | testnet | `devnet` | `testnet` | `devnet` | PASS | 1순위 우선: 요청이 wallet 기본값 override |

### 2.7 에러 메시지 템플릿

**chain-network 불일치 (기존 validateChainNetwork):**

```
Invalid network 'ethereum-sepolia' for chain 'solana'. Valid: mainnet, devnet, testnet
Invalid network 'devnet' for chain 'ethereum'. Valid EVM networks: ethereum-mainnet, ethereum-sepolia, ...
```

**environment-network 불일치 (신규 validateNetworkEnvironment, docs/68 섹션 3.4):**

```
Invalid network 'devnet' for chain 'solana' in environment 'mainnet'. Valid: mainnet
Invalid network 'ethereum-mainnet' for chain 'ethereum' in environment 'testnet'. Valid: ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia, base-sepolia
```

---

## 3. ENVIRONMENT_NETWORK_MISMATCH 에러 코드 설계

### 3.1 에러 코드 정의

| 속성 | 값 |
|------|---|
| code | `ENVIRONMENT_NETWORK_MISMATCH` |
| domain | `TX` |
| httpStatus | `400` |
| retryable | `false` |
| message | `Network is not allowed in this wallet's environment` |

### 3.2 기존 에러 코드 체계 분석

현재 `error-codes.ts`는 68개 에러 코드를 10개 도메인으로 분류한다.

| 도메인 | 코드 수 | 예시 |
|--------|--------|------|
| AUTH | 8 | INVALID_TOKEN, TOKEN_EXPIRED, SYSTEM_LOCKED |
| SESSION | 8 | SESSION_NOT_FOUND, SESSION_EXPIRED |
| TX | 20 | INSUFFICIENT_BALANCE, CHAIN_ERROR, SIMULATION_FAILED |
| POLICY | 5 | POLICY_DENIED, SPENDING_LIMIT_EXCEEDED |
| OWNER | 5 | OWNER_ALREADY_CONNECTED, APPROVAL_TIMEOUT |
| SYSTEM | 6 | KILL_SWITCH_ACTIVE, CHAIN_NOT_SUPPORTED |
| WALLET | 3 | WALLET_NOT_FOUND, WALLET_SUSPENDED |
| WITHDRAW | 4 | NO_OWNER, SWEEP_TOTAL_FAILURE |
| ACTION | 7 | ACTION_VALIDATION_FAILED, ACTION_CHAIN_MISMATCH |
| ADMIN | 1 | ROTATION_TOO_RECENT |

**신규 코드 위치 결정:** `ENVIRONMENT_NETWORK_MISMATCH`는 TX 도메인에 배치한다. 트랜잭션 실행 전 환경-네트워크 검증 실패이므로 TX 도메인이 가장 적합하다. TX 도메인의 기존 20개 코드 + PIPELINE_HALTED 1개 뒤에 추가한다.

### 3.3 ACTION_VALIDATION_FAILED와 분리하는 이유

| 구분 | ACTION_VALIDATION_FAILED | ENVIRONMENT_NETWORK_MISMATCH |
|------|-------------------------|------------------------------|
| 도메인 | ACTION | TX |
| 발생 원인 | 액션 입력 Zod 검증 실패 | 환경-네트워크 교차 검증 실패 |
| 보안 중요도 | 낮음 (일반 입력 오류) | **높음** (testnet 키로 mainnet 트랜잭션 차단) |
| 추적 필요성 | 일반 로깅 | **보안 이벤트 로깅** (환경 불일치 시도) |
| 에러 메시지 | 범용 "validation failed" | 구체적 네트워크/환경 정보 포함 |

환경 불일치는 보안 관점에서 별도 에러 코드로 추적해야 한다. testnet 월렛이 mainnet 네트워크를 요청하는 것은 단순 입력 오류가 아니라 자금 안전 위협이다.

### 3.4 error-codes.ts 추가 의사코드

```typescript
// packages/core/src/errors/error-codes.ts
// TX 도메인의 BATCH_POLICY_VIOLATION 뒤에 추가

  ENVIRONMENT_NETWORK_MISMATCH: {
    code: 'ENVIRONMENT_NETWORK_MISMATCH',
    domain: 'TX',
    httpStatus: 400,
    retryable: false,
    message: "Network is not allowed in this wallet's environment",
  },
```

추가 후 총 에러 코드: 69개 (68 + 1).

### 3.5 에러 메시지 템플릿 (런타임)

WAIaaSError 생성 시 상세 메시지를 포함한다:

```typescript
// Route handler에서 resolveNetwork() catch 시
throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', {
  message: `Network '${resolvedNetwork}' is not allowed in environment '${wallet.environment}' for chain '${wallet.chain}'. Valid networks: ${validNetworks.join(', ')}`,
});
```

**API 응답 예시:**

```json
{
  "error": {
    "code": "ENVIRONMENT_NETWORK_MISMATCH",
    "message": "Network 'devnet' is not allowed in environment 'mainnet' for chain 'solana'. Valid networks: mainnet",
    "httpStatus": 400,
    "retryable": false
  }
}
```

---

## 4. 환경-네트워크 교차 검증 설계 (PIPE-03)

### 4.1 검증 시점: PipelineContext 생성 전

환경-네트워크 교차 검증은 **PipelineContext 생성 전** -- 즉, Route Handler에서 `resolveNetwork()` 호출 시점에 수행된다. 이 시점은 Stage 1 진입 전이며, DB INSERT 전이다.

```
Route Handler (transactions.ts)
  |
  |-- wallet 조회 (DB SELECT)
  |-- resolveNetwork()           <-- 여기서 검증 (INSERT 전)
  |     |-- validateChainNetwork()
  |     |-- validateNetworkEnvironment()
  |     |-- FAIL -> WAIaaSError throw -> 400 응답 (DB 변경 없음)
  |     |-- PASS -> NetworkType 반환
  |
  |-- resolveRpcUrl()
  |-- adapterPool.resolve()
  |-- PipelineContext 생성        <-- resolvedNetwork 포함
  |
  Stage 1: Zod parse + INSERT    <-- 이 시점에 resolvedNetwork는 이미 검증 완료
```

**DB INSERT 전 검증 보장:** resolveNetwork()가 PipelineContext 생성부에서 호출되므로, Stage 1의 `db.insert(transactions)` 실행 전에 환경-네트워크 검증이 완료된다. 검증 실패 시 WAIaaSError를 throw하여 PENDING 트랜잭션이 DB에 INSERT되지 않는다.

### 4.2 검증 로직 흐름

```typescript
// Route Handler (transactions.ts) 의사코드

const wallet = await db.select().from(wallets).where(eq(wallets.id, walletId)).get();

try {
  const resolvedNetwork = resolveNetwork(
    request.network,                                // request body에서 추출 (optional)
    wallet.defaultNetwork as NetworkType | null,     // DB 필드 (nullable)
    wallet.environment as EnvironmentType,           // DB 필드 ('testnet' | 'mainnet')
    wallet.chain as ChainType,                       // DB 필드 ('solana' | 'ethereum')
  );

  // resolveNetwork()가 성공하면 resolvedNetwork는 검증 완료된 값
  // 이후 AdapterPool + PipelineContext 생성에 사용

} catch (err) {
  // Error -> WAIaaSError 변환
  if (err instanceof Error) {
    // chain-network 불일치: validateChainNetwork()에서 발생
    if (err.message.startsWith("Invalid network") && !err.message.includes("environment")) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: err.message,
      });
    }
    // environment-network 불일치: validateNetworkEnvironment()에서 발생
    if (err.message.includes("environment")) {
      // 보안 이벤트 로깅 (환경 불일치 시도)
      console.warn(
        `[SECURITY] Environment-network mismatch attempt: ` +
        `wallet=${walletId}, chain=${wallet.chain}, env=${wallet.environment}, ` +
        `requestedNetwork=${request.network ?? 'null'}`,
      );
      throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', {
        message: err.message,
      });
    }
  }
  throw err;
}
```

**검증 순서 근거:**
1. `validateChainNetwork(chain, resolved)` -- chain 수준의 호환성 검증 (기본 조건)
2. `validateNetworkEnvironment(chain, env, resolved)` -- 환경 수준의 허용 검증 (보안 조건)

chain-network 검증이 먼저인 이유: solana + ethereum-sepolia와 같은 완전히 잘못된 조합을 먼저 걸러야 환경 검증의 에러 메시지가 의미를 가진다.

### 4.3 에러 시나리오 테이블

| # | 월렛 (chain/env) | request.network | wallet.defaultNetwork | resolved | 검증 | 에러 코드 | 에러 메시지 |
|---|-----------------|-----------------|----------------------|----------|------|---------|-----------|
| 1 | solana/mainnet | `devnet` | null | `devnet` | FAIL (env) | `ENVIRONMENT_NETWORK_MISMATCH` | "Invalid network 'devnet' for chain 'solana' in environment 'mainnet'. Valid: mainnet" |
| 2 | ethereum/testnet | `ethereum-mainnet` | null | `ethereum-mainnet` | FAIL (env) | `ENVIRONMENT_NETWORK_MISMATCH` | "Invalid network 'ethereum-mainnet' for chain 'ethereum' in environment 'testnet'. Valid: ethereum-sepolia, polygon-amoy, ..." |
| 3 | solana/testnet | `ethereum-sepolia` | null | `ethereum-sepolia` | FAIL (chain) | `ACTION_VALIDATION_FAILED` | "Invalid network 'ethereum-sepolia' for chain 'solana'. Valid: mainnet, devnet, testnet" |
| 4 | ethereum/mainnet | `devnet` | null | `devnet` | FAIL (chain) | `ACTION_VALIDATION_FAILED` | "Invalid network 'devnet' for chain 'ethereum'. Valid EVM networks: ..." |
| 5 | solana/testnet | null | null | `devnet` | PASS | -- | -- (정상: 3순위 fallback) |
| 6 | ethereum/mainnet | `polygon-mainnet` | `ethereum-mainnet` | `polygon-mainnet` | PASS | -- | -- (정상: 1순위 L2 override) |
| 7 | ethereum/testnet | null | `polygon-amoy` | `polygon-amoy` | PASS | -- | -- (정상: 2순위 L2 기본값) |
| 8 | solana/mainnet | null | `devnet` | `devnet` | FAIL (env) | `ENVIRONMENT_NETWORK_MISMATCH` | "Invalid network 'devnet' for chain 'solana' in environment 'mainnet'. Valid: mainnet" |
| 9 | ethereum/mainnet | `base-sepolia` | null | `base-sepolia` | FAIL (env) | `ENVIRONMENT_NETWORK_MISMATCH` | "Invalid network 'base-sepolia' for chain 'ethereum' in environment 'mainnet'. Valid: ethereum-mainnet, ..." |
| 10 | solana/mainnet | `mainnet` | null | `mainnet` | PASS | -- | -- (정상: 유일한 mainnet 네트워크) |

**Edge Case:**
- **시나리오 8**: wallet.defaultNetwork이 환경과 불일치하는 값을 갖는 경우. DB CHECK 제약으로 이론적으로 불가하지만, 방어적 검증으로 차단.
- **시나리오 9**: mainnet 월렛이 testnet L2 네트워크를 요청하는 경우. L2 testnet은 EVM testnet 환경에만 속하므로 차단.

### 4.4 WAIaaSError 변환 패턴

기존 `wallets.ts`(line 271-275)의 에러 변환 패턴을 따른다:

```typescript
// 기존 패턴 참조: packages/daemon/src/api/routes/wallets.ts
// validateChainNetwork() Error -> WAIaaSError

try {
  validateChainNetwork(chain, network);
} catch (err) {
  throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
    message: err instanceof Error ? err.message : 'Chain-network validation failed',
  });
}
```

**신규 패턴:** resolveNetwork() 내부에서 throw되는 Error를 route handler에서 catch하여 WAIaaSError로 변환한다. 변환 시 에러 메시지의 `"environment"` 문자열 포함 여부로 chain 불일치와 environment 불일치를 구분한다.

**대안 (구현 시 선택):** resolveNetwork() 내부에서 커스텀 에러 클래스를 사용하여 더 명확하게 구분할 수도 있다.

```typescript
// 대안: 커스텀 에러 클래스 (구현 시 선택 사항)
export class EnvironmentNetworkMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentNetworkMismatchError';
  }
}

// route handler에서:
if (err instanceof EnvironmentNetworkMismatchError) {
  throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', { message: err.message });
}
```

### 4.5 보안 관점: 환경 불일치 시도 로깅

환경-네트워크 불일치 시도는 **보안 이벤트**로 분류한다. testnet 키로 mainnet 트랜잭션을 시도하는 것은 잠재적 자금 위험이다.

**로그 레벨:** `warn` (에러가 아닌 경고 -- 요청은 정상적으로 거부됨)

**포함 정보:**

| 필드 | 설명 | 예시 |
|------|------|------|
| `[SECURITY]` | 보안 이벤트 태그 | 로그 필터링용 |
| `walletId` | 요청한 월렛 ID | `"w_01abc..."` |
| `chain` | 월렛의 체인 | `"solana"` |
| `environment` | 월렛의 환경 | `"mainnet"` |
| `requestedNetwork` | 요청된 네트워크 | `"devnet"` |
| `resolvedNetwork` | 리졸브된 네트워크 (검증 실패한 값) | `"devnet"` |
| `sessionId` | 요청한 세션 ID (있는 경우) | `"sess_01def..."` |

**로그 형식:**

```
[SECURITY] Environment-network mismatch attempt: wallet=w_01abc, chain=solana, env=mainnet, requestedNetwork=devnet, session=sess_01def
```

**향후 확장:** v1.4.6 이후에 audit_log 테이블에 `ENVIRONMENT_MISMATCH_ATTEMPT` 이벤트 타입을 추가하여 영구 기록할 수 있다. 현재 설계에서는 console.warn 로깅만 포함한다.

### 4.6 DB INSERT 전 검증 보장 요약

```
[시간 축]
  |
  t0: wallet 조회 (DB SELECT)
  t1: resolveNetwork() 호출             <-- 검증 시점
       |- validateChainNetwork()
       |- validateNetworkEnvironment()
       |- FAIL -> throw -> 400 응답 (t1에서 종료, t2~t4 미실행)
  t2: resolveRpcUrl() + adapterPool.resolve()
  t3: PipelineContext 생성
  t4: stage1Validate() -> db.insert(transactions)  <-- DB INSERT 시점
  |
```

t1(검증)이 t4(INSERT)보다 항상 먼저 실행된다. t1에서 실패하면 t2~t4는 실행되지 않으므로, 검증 실패한 트랜잭션은 DB에 기록되지 않는다.

---

## 5. PipelineContext 확장 설계 (PIPE-02)

### 5.1 PipelineContext 인터페이스 변경 전/후

**현재 (v1.4.4) -- `packages/daemon/src/pipeline/stages.ts`:**

```typescript
export interface PipelineContext {
  // Dependencies
  db: BetterSQLite3Database<typeof schema>;
  adapter: IChainAdapter;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  // Request data
  walletId: string;
  wallet: { publicKey: string; chain: string; network: string };
  request: SendTransactionRequest | TransactionRequest;
  // State accumulated through stages
  txId: string;
  tier?: PolicyTier;
  unsignedTx?: UnsignedTransaction;
  signedTx?: Uint8Array;
  submitResult?: SubmitResult;
  // v1.2: session + policy integration
  sessionId?: string;
  sqlite?: SQLiteDatabase;
  delaySeconds?: number;
  downgraded?: boolean;
  // v1.2: workflow dependencies for stage4Wait
  delayQueue?: DelayQueue;
  approvalWorkflow?: ApprovalWorkflow;
  config?: {
    policy_defaults_delay_seconds: number;
    policy_defaults_approval_timeout: number;
  };
  // v1.3.4: notification service
  notificationService?: NotificationService;
}
```

**변경 (v1.4.6):**

```typescript
export interface PipelineContext {
  // Dependencies (변경 없음)
  db: BetterSQLite3Database<typeof schema>;
  adapter: IChainAdapter;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  // Request data
  walletId: string;
  wallet: {
    publicKey: string;
    chain: string;
    environment: string;          // CHANGED: network -> environment ('testnet' | 'mainnet')
    defaultNetwork: string | null; // NEW: nullable (ENV-07)
  };
  resolvedNetwork: string;         // NEW: resolveNetwork() 결과 -- 실제 실행 네트워크
  request: SendTransactionRequest | TransactionRequest;
  // State accumulated through stages (변경 없음)
  txId: string;
  tier?: PolicyTier;
  unsignedTx?: UnsignedTransaction;
  signedTx?: Uint8Array;
  submitResult?: SubmitResult;
  // v1.2: session + policy integration (변경 없음)
  sessionId?: string;
  sqlite?: SQLiteDatabase;
  delaySeconds?: number;
  downgraded?: boolean;
  // v1.2: workflow dependencies (변경 없음)
  delayQueue?: DelayQueue;
  approvalWorkflow?: ApprovalWorkflow;
  config?: {
    policy_defaults_delay_seconds: number;
    policy_defaults_approval_timeout: number;
  };
  // v1.3.4: notification service (변경 없음)
  notificationService?: NotificationService;
}
```

**변경 요약:**

| 필드 | Before | After | 변경 유형 |
|------|--------|-------|---------|
| `wallet.network` | `string` | -- (제거) | REMOVED |
| `wallet.environment` | -- | `string` ('testnet'\|'mainnet') | NEW |
| `wallet.defaultNetwork` | -- | `string \| null` | NEW |
| `resolvedNetwork` | -- | `string` | NEW |

### 5.2 Stage 1~6 데이터 흐름도

```
[Route Handler] (transactions.ts)
  |
  |-- wallet 조회 (DB SELECT)
  |     -> { id, chain, environment, defaultNetwork, publicKey, ... }
  |
  |-- resolveNetwork(request.network, wallet.defaultNetwork, wallet.environment, wallet.chain)
  |     -> resolvedNetwork: string  (검증 완료)
  |
  |-- resolveRpcUrl(config.rpc, wallet.chain, resolvedNetwork)
  |     -> rpcUrl: string
  |
  |-- adapterPool.resolve(wallet.chain, resolvedNetwork, rpcUrl)
  |     -> adapter: IChainAdapter  (resolvedNetwork에 해당하는 어댑터)
  |
  |-- PipelineContext 생성
  |     ctx = {
  |       wallet: { publicKey, chain, environment, defaultNetwork },
  |       resolvedNetwork,        <-- 실제 실행 네트워크
  |       adapter,                <-- resolvedNetwork의 어댑터
  |       ...
  |     }
  |
  v
[Stage 1: Validate + INSERT]
  |-- Zod parse (TransactionRequestSchema / SendTransactionRequestSchema)
  |-- generateId() -> txId
  |-- db.insert(transactions).values({
  |     id: txId,
  |     walletId,
  |     chain: ctx.wallet.chain,
  |     network: ctx.resolvedNetwork,    <-- NEW: 실행 네트워크 기록
  |     type: txType,
  |     status: 'PENDING',
  |     ...
  |   })
  |-- notify('TX_REQUESTED', ...)
  v
[Stage 2: Auth]
  |-- (변경 없음)
  |-- sessionId 검증 (sessionAuth middleware에서 이미 완료)
  v
[Stage 3: Policy]
  |-- buildTransactionParam(req, txType, ctx.wallet.chain)
  |     -- 변경 없음: chain만 참조, network 불필요
  |-- policyEngine.evaluate(walletId, txParam)
  |     -- 변경 없음: Phase 107 범위 (정책에 network 조건 추가)
  |-- TOCTOU-safe evaluateAndReserve()
  v
[Stage 4: Wait]
  |-- (변경 없음)
  |-- INSTANT/NOTIFY: passthrough
  |-- DELAY: delayQueue.queueDelay() -> halt
  |-- APPROVAL: approvalWorkflow.requestApproval() -> halt
  v
[Stage 5: Execute]
  |-- buildByType(ctx.adapter, ctx.request, ctx.wallet.publicKey)
  |     -- ctx.adapter가 이미 resolvedNetwork의 어댑터이므로 변경 없음
  |-- simulateTransaction(ctx.unsignedTx)
  |     -- ctx.adapter가 올바른 네트워크의 RPC에 연결
  |-- signTransaction(unsignedTx, privateKey)
  |     -- 변경 없음: 서명은 네트워크 무관
  |-- submitTransaction(signedTx)
  |     -- ctx.adapter가 올바른 네트워크에 제출
  v
[Stage 6: Confirm]
  |-- waitForConfirmation(txHash, 30_000)
  |     -- ctx.adapter가 올바른 네트워크에서 확인
  |-- UPDATE transactions SET status = 'CONFIRMED'
```

### 5.3 각 Stage에서 resolvedNetwork 참조 방식

**Stage 1 (stage1Validate):**

```typescript
// 변경 전:
await ctx.db.insert(transactions).values({
  id: ctx.txId,
  walletId: ctx.walletId,
  chain: ctx.wallet.chain,
  type: txType,
  status: 'PENDING',
  amount: amount ?? null,
  toAddress: toAddress ?? null,
  sessionId: ctx.sessionId ?? null,
  createdAt: now,
});

// 변경 후:
await ctx.db.insert(transactions).values({
  id: ctx.txId,
  walletId: ctx.walletId,
  chain: ctx.wallet.chain,
  network: ctx.resolvedNetwork,    // NEW: 실행 네트워크 기록
  type: txType,
  status: 'PENDING',
  amount: amount ?? null,
  toAddress: toAddress ?? null,
  sessionId: ctx.sessionId ?? null,
  createdAt: now,
});
```

**Stage 2 (stage2Auth):** 변경 없음. sessionId 검증만 수행.

**Stage 3 (stage3Policy):** 변경 없음. `buildTransactionParam(req, txType, ctx.wallet.chain)`에서 chain만 참조. Phase 107에서 `ctx.resolvedNetwork`를 정책 평가에 활용할 예정.

**Stage 4 (stage4Wait):** 변경 없음. DELAY/APPROVAL 분기에 네트워크 정보 불필요.

**Stage 5 (stage5Execute):** 간접 참조. `ctx.adapter`가 이미 resolvedNetwork에 해당하는 어댑터이므로, buildByType/simulate/sign/submit 호출 시 별도 네트워크 참조 불필요.

```typescript
// 변경 없음: adapter가 이미 올바른 네트워크
ctx.unsignedTx = await buildByType(ctx.adapter, ctx.request, ctx.wallet.publicKey);
```

**Stage 6 (stage6Confirm):** 간접 참조. `ctx.adapter.waitForConfirmation()`이 올바른 네트워크의 RPC에 연결되어 있으므로 변경 없음.

### 5.4 Stage 1 INSERT 변경 상세

**현재 transactions INSERT (`stages.ts` line 199-209):**

```typescript
await ctx.db.insert(transactions).values({
  id: ctx.txId,
  walletId: ctx.walletId,
  chain: ctx.wallet.chain,
  type: txType,
  status: 'PENDING',
  amount: amount ?? null,
  toAddress: toAddress ?? null,
  sessionId: ctx.sessionId ?? null,
  createdAt: now,
});
```

**변경 후:**

```typescript
await ctx.db.insert(transactions).values({
  id: ctx.txId,
  walletId: ctx.walletId,
  chain: ctx.wallet.chain,
  network: ctx.resolvedNetwork,    // NEW: v6a에서 추가된 컬럼에 기록
  type: txType,
  status: 'PENDING',
  amount: amount ?? null,
  toAddress: toAddress ?? null,
  sessionId: ctx.sessionId ?? null,
  createdAt: now,
});
```

`ctx.resolvedNetwork`는 Route Handler에서 `resolveNetwork()`로 이미 검증된 값이므로, Stage 1에서 추가 검증 없이 INSERT에 포함한다. `transactions.network` 컬럼은 v6a 마이그레이션에서 nullable로 추가되지만, v1.4.6 이후 INSERT에서는 항상 값이 채워진다.

---

## 6. AdapterPool 호출부 변경 설계 (PIPE-04)

### 6.1 AdapterPool.resolve() 시그니처 -- 변경 불필요 확인

```typescript
// packages/daemon/src/infrastructure/adapter-pool.ts
// 현재 시그니처 -- 변경 없음

async resolve(chain: ChainType, network: NetworkType, rpcUrl: string): Promise<IChainAdapter>
```

`resolvedNetwork`를 `network` 파라미터로 전달하면 기존 시그니처 그대로 동작한다.

### 6.2 캐시 키 호환성 확인

```typescript
// adapter-pool.ts line 41-43
private cacheKey(chain: ChainType, network: NetworkType): string {
  return `${chain}:${network}`;
}
```

캐시 키가 `chain:network` 형식이므로, `resolvedNetwork`를 전달하면 정확한 캐시 키가 생성된다.

| 시나리오 | chain | resolvedNetwork | 캐시 키 | 동작 |
|---------|-------|-----------------|---------|------|
| ethereum testnet 월렛, polygon-amoy 요청 | `ethereum` | `polygon-amoy` | `ethereum:polygon-amoy` | 별도 어댑터 |
| 같은 월렛, ethereum-sepolia 요청 | `ethereum` | `ethereum-sepolia` | `ethereum:ethereum-sepolia` | 별도 어댑터 |
| solana testnet 월렛, devnet 기본값 | `solana` | `devnet` | `solana:devnet` | 기존과 동일 |

같은 월렛(ethereum/testnet)이 polygon-amoy와 ethereum-sepolia를 교대 사용하면 두 어댑터가 동시에 캐시된다. 어댑터는 경량(RPC 클라이언트 + 설정)이므로 메모리 영향 무시 가능.

### 6.3 resolveRpcUrl() 시그니처 -- 변경 불필요 확인

```typescript
// adapter-pool.ts line 20-33
export function resolveRpcUrl(
  rpcConfig: Record<string, string>,
  chain: string,
  network: string,   // <-- resolvedNetwork를 여기에 전달
): string
```

`resolvedNetwork`를 `network` 파라미터로 전달하면 기존 매핑 로직 그대로 동작한다.

### 6.4 변경 대상 1: transactions.ts (line 255-291)

**현재 코드 (`transactions.ts` Route Handler):**

```typescript
// line 255-265: 어댑터 해결
const rpcUrl = resolveRpcUrl(
  deps.config.rpc as unknown as Record<string, string>,
  wallet.chain,
  wallet.network,           // <-- 변경 대상
);
const adapter = await deps.adapterPool.resolve(
  wallet.chain as ChainType,
  wallet.network as NetworkType,  // <-- 변경 대상
  rpcUrl,
);

// line 267-291: PipelineContext 생성
const ctx: PipelineContext = {
  db: deps.db,
  adapter,
  keyStore: deps.keyStore,
  policyEngine: deps.policyEngine,
  masterPassword: deps.masterPassword,
  walletId,
  wallet: {
    publicKey: wallet.publicKey,
    chain: wallet.chain,
    network: wallet.network,     // <-- 변경 대상
  },
  request,
  txId: '',
  sessionId: c.get('sessionId' as never) as string | undefined,
  // ... 나머지 deps
};
```

**변경 후 의사코드:**

```typescript
import { resolveNetwork } from '../../pipeline/network-resolver.js';
import type { ChainType, NetworkType, EnvironmentType } from '@waiaas/core';

// Step 1: resolveNetwork() -- 검증 포함
let resolvedNetwork: NetworkType;
try {
  resolvedNetwork = resolveNetwork(
    request.network as NetworkType | undefined,      // request body의 network 필드
    wallet.defaultNetwork as NetworkType | null,      // DB 필드 (nullable)
    wallet.environment as EnvironmentType,            // DB 필드
    wallet.chain as ChainType,                        // DB 필드
  );
} catch (err) {
  // Error -> WAIaaSError 변환 (섹션 4.2 참조)
  if (err instanceof Error && err.message.includes('environment')) {
    console.warn(`[SECURITY] Environment-network mismatch: wallet=${walletId}, ...`);
    throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', { message: err.message });
  }
  throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
    message: err instanceof Error ? err.message : 'Network validation failed',
  });
}

// Step 2: 어댑터 해결 (resolvedNetwork 사용)
const rpcUrl = resolveRpcUrl(
  deps.config.rpc as unknown as Record<string, string>,
  wallet.chain,
  resolvedNetwork,                 // CHANGED: wallet.network -> resolvedNetwork
);
const adapter = await deps.adapterPool.resolve(
  wallet.chain as ChainType,
  resolvedNetwork as NetworkType,  // CHANGED: wallet.network -> resolvedNetwork
  rpcUrl,
);

// Step 3: PipelineContext 생성 (environment + defaultNetwork + resolvedNetwork)
const ctx: PipelineContext = {
  db: deps.db,
  adapter,
  keyStore: deps.keyStore,
  policyEngine: deps.policyEngine,
  masterPassword: deps.masterPassword,
  walletId,
  wallet: {
    publicKey: wallet.publicKey,
    chain: wallet.chain,
    environment: wallet.environment,       // CHANGED: network -> environment
    defaultNetwork: wallet.defaultNetwork,  // NEW: nullable
  },
  resolvedNetwork,                          // NEW: 검증 완료된 네트워크
  request,
  txId: '',
  sessionId: c.get('sessionId' as never) as string | undefined,
  // ... 나머지 deps (변경 없음)
};
```

### 6.5 변경 대상 2: daemon.ts executeFromStage5 (line 624-655)

**현재 코드 (`daemon.ts` executeFromStage5):**

```typescript
// line 624-634: 어댑터 해결
const rpcUrl = resolveRpcUrl(
  this._config.rpc as unknown as Record<string, string>,
  wallet.chain,
  wallet.network,              // <-- 변경 대상
);
const adapter = await this.adapterPool.resolve(
  wallet.chain as ChainType,
  wallet.network as NetworkType,  // <-- 변경 대상
  rpcUrl,
);

// line 636-655: PipelineContext 생성
const ctx = {
  // ...
  wallet: {
    publicKey: wallet.publicKey,
    chain: wallet.chain,
    network: wallet.network,      // <-- 변경 대상
  },
  // ...
};
```

**변경 후 의사코드:**

```typescript
import { getDefaultNetwork } from '@waiaas/core';

// tx.network: Stage 1에서 기록된 resolvedNetwork (DB에서 읽음)
// v6a 마이그레이션 이전 트랜잭션은 network=NULL일 수 있음

// NULL 처리: tx.network이 NULL이면 환경 기본값으로 fallback
const resolvedNetwork: string =
  tx.network                                                           // DB에 기록된 값 (정상 케이스)
  ?? getDefaultNetwork(                                                // NULL fallback (v6a 이전 트랜잭션)
      wallet.chain as ChainType,
      wallet.environment as EnvironmentType,
    );

// 어댑터 해결 (resolvedNetwork 사용)
const rpcUrl = resolveRpcUrl(
  this._config.rpc as unknown as Record<string, string>,
  wallet.chain,
  resolvedNetwork,                   // CHANGED: wallet.network -> resolvedNetwork
);
const adapter = await this.adapterPool.resolve(
  wallet.chain as ChainType,
  resolvedNetwork as NetworkType,    // CHANGED: wallet.network -> resolvedNetwork
  rpcUrl,
);

// PipelineContext 생성
const ctx: PipelineContext = {
  db: this._db,
  adapter,
  keyStore: this.keyStore,
  policyEngine: null as any,         // Not needed for stages 5-6
  masterPassword: this.masterPassword,
  walletId,
  wallet: {
    publicKey: wallet.publicKey,
    chain: wallet.chain,
    environment: wallet.environment,       // CHANGED: network -> environment
    defaultNetwork: wallet.defaultNetwork,  // NEW: nullable
  },
  resolvedNetwork,                          // NEW: tx.network 또는 fallback
  request: {
    to: tx.toAddress ?? '',
    amount: tx.amount ?? '0',
    memo: undefined,
  },
  txId,
};
```

### 6.6 daemon.ts 재진입 경로 특이사항

**왜 `resolveNetwork()`를 재호출하지 않는가:**

`executeFromStage5()`는 DELAY/APPROVAL 완료 후 Stage 5-6을 재실행하는 경로이다. 이 시점에서:

1. transactions 테이블에 `network` 컬럼이 Stage 1에서 이미 기록됨 (`ctx.resolvedNetwork`)
2. 동일한 네트워크로 재실행해야 함 (Stage 1 INSERT 시점의 네트워크와 동일)
3. wallet.defaultNetwork이 그 사이에 변경되었을 수 있음 (사용자가 PATCH)
4. 따라서 `resolveNetwork()`를 재호출하면 다른 네트워크가 리졸브될 수 있음 -- **위험**

**결론:** `executeFromStage5()`에서는 `tx.network`(DB에 기록된 값)을 직접 사용한다. `resolveNetwork()`를 재호출하지 않는다.

### 6.7 v6a 마이그레이션 이전 트랜잭션의 NULL 처리

v6a 마이그레이션(`ALTER TABLE transactions ADD COLUMN network TEXT`)은 기존 행에 NULL 기본값을 설정하고, `UPDATE ... SET network = wallets.network`으로 역참조 채움을 수행한다. 정상 마이그레이션 후에는 NULL 행이 없어야 한다.

그러나 방어적으로 NULL 처리를 포함한다:

```typescript
// NULL fallback 의사코드
const resolvedNetwork: string =
  tx.network
  ?? getDefaultNetwork(wallet.chain as ChainType, wallet.environment as EnvironmentType);
```

**NULL이 발생할 수 있는 시나리오:**

| 시나리오 | 가능성 | 처리 |
|---------|-------|------|
| v6a 마이그레이션 정상 완료 | 발생 불가 | -- |
| v6a 마이그레이션 중 일부 행 누락 | 극히 낮음 | `getDefaultNetwork()` fallback |
| v6a 마이그레이션 전 daemon 재시작 | 불가 (마이그레이션은 startup 시 실행) | -- |
| DB 무결성 이상 | 극히 낮음 | `getDefaultNetwork()` fallback |

### 6.8 메모리 영향 분석

같은 월렛이 다른 네트워크를 사용할 때 어댑터 캐시 상태:

```
시점 1: POST { network: "polygon-amoy" }
  AdapterPool: { "ethereum:polygon-amoy": EvmAdapter(polygon-amoy) }

시점 2: POST { network: "ethereum-sepolia" }
  AdapterPool: {
    "ethereum:polygon-amoy": EvmAdapter(polygon-amoy),     // 캐시 유지
    "ethereum:ethereum-sepolia": EvmAdapter(ethereum-sepolia)  // 새 어댑터
  }
```

EvmAdapter 인스턴스는 viem publicClient(HTTP 모드) + 설정 객체로 구성되어 경량이다. SolanaAdapter도 @solana/kit RPC 클라이언트 + 설정으로 경량이다. 동시 캐시 어댑터 수는 최대 13개(NETWORK_TYPES 전수)이며, 실 사용에서는 2-3개 수준이다.

**결론:** 메모리 영향은 무시 가능. evict/evictAll은 기존대로 동작 (hot-reload 시 전체 evict).

---

## 7. 설계 결정 요약

### 7.1 설계 결정 테이블

| ID | 결정 내용 | 근거 | 대안 | 영향 범위 |
|----|---------|------|------|---------|
| PIPE-D01 | resolveNetwork()를 순수 함수로 설계 (클래스 아님) | 상태 없는 로직에 클래스는 과도한 추상화. 순수 함수가 테스트/재사용 용이. 기존 validateChainNetwork() 패턴과 일관 | NetworkResolver 클래스 | `network-resolver.ts` (신규), `transactions.ts`, `daemon.ts` |
| PIPE-D02 | 환경 검증 시점을 PipelineContext 생성 전(Route Handler)으로 결정 | DB INSERT 전 검증 보장. Stage 1에서 검증하면 PENDING 고아 레코드 발생 위험 | Stage 1 최상단에서 검증 | `transactions.ts` Route Handler |
| PIPE-D03 | ENVIRONMENT_NETWORK_MISMATCH를 별도 에러 코드로 신설 (ACTION_VALIDATION_FAILED 재활용 안 함) | 보안 중요도 높음 (환경 불일치 = 자금 위험). 별도 추적/로깅/대시보드 필터링 필요 | ACTION_VALIDATION_FAILED 재활용 | `error-codes.ts`, API 응답, 모니터링 |
| PIPE-D04 | daemon.ts executeFromStage5에서 tx.network 직접 사용 (resolveNetwork 재호출 안 함) | Stage 1에서 기록된 네트워크로 재실행해야 안전. wallet.defaultNetwork이 변경되었을 수 있음 | resolveNetwork() 재호출 | `daemon.ts` executeFromStage5 |
| PIPE-D05 | AdapterPool 시그니처 변경 불필요 (호출부만 변경) | 캐시 키 `chain:network`가 이미 완벽한 추상화. resolvedNetwork를 network 파라미터에 전달하면 기존 동작 유지 | resolve()에 environment 파라미터 추가 | `transactions.ts`, `daemon.ts` (호출부만) |
| PIPE-D06 | resolveNetwork()를 별도 파일(network-resolver.ts)에 배치 | stages.ts가 700줄 이상으로 비대. route handler에서 import 필요하므로 별도 모듈이 적합 | stages.ts에 인라인 | `network-resolver.ts` (신규) |

### 7.2 Phase 107/108에 대한 영향

**Phase 107 (정책 설계):**
- Stage 3 `policyEngine.evaluate()`에서 `ctx.resolvedNetwork`를 참조하여 네트워크별 정책 평가 가능
- `policies.network` 컬럼 추가 시 `ctx.resolvedNetwork`와 매칭
- PipelineContext.resolvedNetwork 인터페이스가 확정되었으므로, Phase 107에서 정책 평가 시 이 필드를 직접 참조

**Phase 108 (API 인터페이스 설계):**
- `POST /v1/transactions/send` 요청 body에 `network?: NetworkType` 필드 추가
- `TransactionRequestSchema`에 `network: NetworkTypeEnum.optional()` 추가
- `resolveNetwork()`의 `requestNetwork` 파라미터가 이 필드에서 추출
- `GET /v1/wallets/:id/balance` + `GET /v1/wallets/:id/assets`에 `?network=` 쿼리 파라미터 추가
- Transaction API 응답에 `network` 필드 추가 (`tx.network`)

---

## 부록 A: 변경 파일 전체 목록

| 파일 | 변경 유형 | 설명 |
|------|---------|------|
| `packages/daemon/src/pipeline/network-resolver.ts` | 신규 | resolveNetwork() 순수 함수 |
| `packages/daemon/src/pipeline/stages.ts` | 수정 | PipelineContext 인터페이스 변경 + Stage 1 INSERT network 추가 |
| `packages/daemon/src/api/routes/transactions.ts` | 수정 | resolveNetwork() 호출 + AdapterPool 호출 변경 + PipelineContext 생성 변경 |
| `packages/daemon/src/lifecycle/daemon.ts` | 수정 | executeFromStage5 tx.network 사용 + PipelineContext 생성 변경 |
| `packages/daemon/src/pipeline/pipeline.ts` | 수정 | TransactionPipeline.executeSend() PipelineContext 생성 변경 |
| `packages/core/src/errors/error-codes.ts` | 수정 | ENVIRONMENT_NETWORK_MISMATCH 에러 코드 추가 |

## 부록 B: 테스트 전략 (v1.4.6 구현 시)

### resolveNetwork() 단위 테스트

| # | 테스트 케이스 | 기대 결과 |
|---|-------------|---------|
| 1 | 모든 파라미터 null -> 3순위 fallback | getDefaultNetwork() 결과 |
| 2 | requestNetwork 명시 -> 1순위 | requestNetwork 반환 |
| 3 | walletDefaultNetwork만 존재 -> 2순위 | walletDefaultNetwork 반환 |
| 4 | chain-network 불일치 | Error throw |
| 5 | environment-network 불일치 | Error throw |
| 6 | 정상: 11개 입출력 예시 (섹션 2.6) | 각각 기대값 |

### 통합 테스트

| # | 테스트 케이스 | 기대 결과 |
|---|-------------|---------|
| 1 | POST /transactions/send { network: "polygon-amoy" } (testnet 월렛) | 201 + transactions.network = "polygon-amoy" |
| 2 | POST /transactions/send { network: "ethereum-mainnet" } (testnet 월렛) | 400 ENVIRONMENT_NETWORK_MISMATCH |
| 3 | POST /transactions/send {} (testnet 월렛, defaultNetwork=null) | 201 + transactions.network = getDefaultNetwork() |
| 4 | DELAY 후 executeFromStage5 재진입 | tx.network 기록된 값으로 실행 |
