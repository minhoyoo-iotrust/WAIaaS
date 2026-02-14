# Phase 106: 파이프라인 + 네트워크 리졸브 설계 - Research

**Researched:** 2026-02-14
**Domain:** 트랜잭션 파이프라인 네트워크 해결 + 환경 격리 검증 + AdapterPool 호출 변경
**Confidence:** HIGH

## Summary

Phase 106은 Phase 105에서 확정된 EnvironmentType 데이터 모델을 트랜잭션 파이프라인 실행 흐름에 적용하는 설계를 수행한다. 핵심 과제는 네 가지이다: (1) NetworkResolver 추상화 -- 트랜잭션 요청 시 `request.network > wallet.defaultNetwork > environment 기본값` 우선순위로 실제 네트워크를 해결하는 순수 함수 설계, (2) PipelineContext 확장 -- `wallet.environment` + `resolvedNetwork`가 Stage 1~6 전체에 걸쳐 전파되는 데이터 흐름 설계, (3) 환경-네트워크 교차 검증 -- mainnet 월렛이 testnet 네트워크를 사용하거나 그 반대를 차단하는 검증 로직 설계, (4) AdapterPool.resolve() 호출부 변경 -- 리졸브된 네트워크를 전달하도록 기존 호출 패턴을 변경하되 캐시 키(`chain:network`) 호환성 유지.

코드베이스 분석 결과 세 가지 핵심 발견이 있다. 첫째, 현재 파이프라인에서 네트워크는 `wallet.network` 단일 경로로만 결정되며, 이 값은 PipelineContext 생성 시 1회 설정된다. 변경 지점은 `transactions.ts`의 PipelineContext 생성부(line 268~291)와 `daemon.ts`의 Stage 5 재진입부(line 637~655)로 총 2곳이다. 둘째, AdapterPool의 캐시 키는 이미 `${chain}:${network}`이므로, resolvedNetwork를 전달하면 동일 환경(testnet)의 다른 네트워크(ethereum-sepolia vs polygon-amoy)도 각각 별도 어댑터로 캐시된다 -- **구조 변경 불필요**. 셋째, 환경 교차 검증은 Phase 105에서 설계된 `validateNetworkEnvironment(chain, env, network)` 함수를 파이프라인 Stage 1에서 호출하면 되며, 별도 검증 모듈이 불필요하다.

**Primary recommendation:** NetworkResolver를 별도 클래스가 아닌 순수 함수(`resolveNetwork`)로 설계하고, PipelineContext에 `resolvedNetwork` 필드를 추가하여 Stage 1에서 해결 + 검증한 뒤 나머지 Stage에서 참조하는 단순한 설계를 채택한다. 환경 교차 검증은 Stage 1의 첫 번째 동작으로 수행하여, 검증 실패 시 DB INSERT 전에 즉시 거부한다.

## Standard Stack

### Core (변경 없음 -- 기존 스택 활용)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.25.76 | TransactionRequest 스키마에 network 선택 필드 추가 | 기존 discriminatedUnion 5-type 스키마 확장 |
| drizzle-orm | 0.45.1 | transactions.network INSERT 시 resolvedNetwork 기록 | 기존 Stage 1 INSERT 패턴 확장 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @waiaas/core | (internal) | EnvironmentType, validateNetworkEnvironment, getDefaultNetwork, getNetworksForEnvironment | NetworkResolver 구현 시 매핑 함수 참조 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 순수 함수 resolveNetwork() | NetworkResolver 클래스 | 클래스는 상태 없는 로직에 과도한 추상화. 순수 함수가 테스트/재사용 용이 |
| Stage 1에서 환경 검증 | 별도 Stage 0.5 추가 | 기존 6-stage 파이프라인 구조 변경 불필요. Stage 1 앞부분에 검증 추가로 충분 |

### Installation

```bash
# 새 패키지 설치 없음. 기존 의존성 그대로 사용.
```

## Architecture Patterns

### 현재 파이프라인 네트워크 흐름 (Before)

```
POST /v1/transactions/send
  ↓
wallet = db.select(wallets).where(walletId)
  ↓
rpcUrl = resolveRpcUrl(config.rpc, wallet.chain, wallet.network)  ← 월렛의 고정 network
adapter = adapterPool.resolve(wallet.chain, wallet.network, rpcUrl)
  ↓
ctx = { wallet: { chain, network: wallet.network }, adapter, ... }
  ↓
Stage 1~6 실행 (ctx.wallet.network 참조)
```

### 설계 대상 파이프라인 네트워크 흐름 (After)

```
POST /v1/transactions/send { ..., network?: "polygon-amoy" }
  ↓
wallet = db.select(wallets).where(walletId)
  ↓
resolvedNetwork = resolveNetwork(                                  ← NEW
  request.network,          // 1순위: 요청 명시
  wallet.defaultNetwork,    // 2순위: 월렛 기본값
  wallet.environment,       // 3순위: 환경 기본값
  wallet.chain
)
  ↓
validateNetworkEnvironment(wallet.chain, wallet.environment, resolvedNetwork)  ← NEW
  ↓
rpcUrl = resolveRpcUrl(config.rpc, wallet.chain, resolvedNetwork)  ← resolvedNetwork 사용
adapter = adapterPool.resolve(wallet.chain, resolvedNetwork, rpcUrl)
  ↓
ctx = { wallet: { chain, environment, defaultNetwork }, resolvedNetwork, adapter, ... }
  ↓
Stage 1: INSERT transactions (network = resolvedNetwork)           ← resolvedNetwork 기록
Stage 2~6 실행 (ctx.resolvedNetwork 참조)
```

### Pattern 1: NetworkResolver 순수 함수

**What:** 트랜잭션 요청의 네트워크를 3단계 우선순위로 해결하는 순수 함수
**When to use:** 트랜잭션 파이프라인 진입 시점 (PipelineContext 생성 전)

```typescript
// 의사코드: packages/daemon/src/pipeline/network-resolver.ts (신규 파일 or stages.ts에 추가)

import {
  type ChainType,
  type EnvironmentType,
  type NetworkType,
  getDefaultNetwork,
  validateNetworkEnvironment,
  validateChainNetwork,
} from '@waiaas/core';

/**
 * Resolve the target network for a transaction.
 *
 * Priority:
 *   1. request.network (explicit per-tx override)
 *   2. wallet.defaultNetwork (user-configured default, nullable)
 *   3. getDefaultNetwork(chain, environment) (environment fallback)
 *
 * @throws Error if resolved network is invalid for chain+environment
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

### Pattern 2: PipelineContext 확장

**What:** PipelineContext에 environment + resolvedNetwork 필드 추가
**When to use:** Stage 1~6 전체에서 네트워크 정보 참조 시

```typescript
// 변경: packages/daemon/src/pipeline/stages.ts

export interface PipelineContext {
  // ... 기존 필드들
  wallet: {
    publicKey: string;
    chain: string;
    environment: string;       // NEW: 'testnet' | 'mainnet'
    defaultNetwork: string | null;  // NEW: nullable (ENV-07)
  };
  resolvedNetwork: string;       // NEW: resolveNetwork() 결과 -- 실제 실행 네트워크
  // network는 wallet에서 제거됨 (environment + defaultNetwork로 대체)
  // ...
}
```

### Pattern 3: Stage 1 환경 교차 검증

**What:** 트랜잭션 INSERT 전에 환경-네트워크 일치를 검증
**When to use:** stage1Validate() 함수 최상단

```typescript
// 의사코드: stage1Validate 내부

export async function stage1Validate(ctx: PipelineContext): Promise<void> {
  // NEW: Validate resolvedNetwork vs wallet.environment
  // (이미 resolveNetwork() 내부에서 검증되므로, PipelineContext 생성 시점에 검증 완료)
  // Stage 1에서는 추가 검증 불필요 -- resolvedNetwork는 이미 검증된 값

  // 기존 로직: Zod parse + INSERT
  // ...

  // transactions INSERT 시 resolvedNetwork 기록
  await ctx.db.insert(transactions).values({
    // ... 기존 필드들
    network: ctx.resolvedNetwork,  // NEW: 실행 네트워크 기록
  });
}
```

### Pattern 4: AdapterPool 호출부 변경

**What:** resolvedNetwork를 AdapterPool.resolve()에 전달
**When to use:** transactions.ts + daemon.ts 어댑터 해결 지점

```typescript
// 변경: packages/daemon/src/api/routes/transactions.ts (line 256-265)

// Before:
const rpcUrl = resolveRpcUrl(config.rpc, wallet.chain, wallet.network);
const adapter = await adapterPool.resolve(wallet.chain, wallet.network, rpcUrl);

// After:
const resolvedNetwork = resolveNetwork(
  request.network,
  wallet.defaultNetwork,
  wallet.environment,
  wallet.chain,
);
const rpcUrl = resolveRpcUrl(config.rpc, wallet.chain, resolvedNetwork);
const adapter = await adapterPool.resolve(wallet.chain, resolvedNetwork, rpcUrl);
```

### Anti-Patterns to Avoid

- **Stage 1 이후에 환경 검증:** 검증 실패 시 이미 PENDING 트랜잭션이 DB에 INSERT된 상태. 검증은 반드시 INSERT 전에 수행
- **AdapterPool 캐시 키 변경:** 현재 `chain:network` 캐시 키는 이미 완벽한 추상화. `chain:environment`로 변경하면 같은 환경의 다른 네트워크가 같은 어댑터를 공유하게 되어 치명적 오류
- **PipelineContext에서 network 제거하고 environment만 유지:** Stage 5 buildTransaction에서 실제 네트워크 정보가 필요 (adapter.network). resolvedNetwork를 반드시 전파해야 함
- **resolveNetwork()에서 DB 조회:** 매핑은 순수 함수 (ENV-03 설계 결정). DB 조회는 불필요한 I/O + Zod SSoT 원칙 위반

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 환경-네트워크 교차 검증 | 커스텀 검증 로직 | `validateNetworkEnvironment()` (docs/68 섹션 3.4) | Phase 105에서 이미 설계된 순수 함수. 재구현은 중복 |
| 네트워크 기본값 해결 | 인라인 if-else 분기 | `getDefaultNetwork()` (docs/68 섹션 3.2) | Phase 105에서 이미 설계된 매핑 상수 기반 함수 |
| 환경 역파생 (네트워크 -> 환경) | switch-case | `deriveEnvironment()` (docs/68 섹션 3.3) | Phase 105에서 이미 설계됨. daemon.ts Stage 5 재진입부에서 사용 |

**Key insight:** Phase 106의 핵심 설계는 Phase 105에서 이미 설계된 4개 매핑 함수를 파이프라인의 올바른 시점에 호출하는 것이다. 새로운 알고리즘이나 데이터 구조 도입이 불필요하다.

## Common Pitfalls

### Pitfall 1: 환경 검증 시점이 DB INSERT 이후

**What goes wrong:** Stage 1에서 PENDING 트랜잭션을 DB에 INSERT한 후 환경 검증이 실패하면, PENDING 상태의 고아 레코드가 남는다.

**Why it happens:** 기존 Stage 1 흐름이 "Zod parse -> INSERT -> 나머지 처리" 순서이므로, 환경 검증을 Zod parse 뒤에 넣으면 INSERT 뒤가 될 수 있다.

**How to avoid:** resolveNetwork()를 PipelineContext 생성 시점(Stage 1 진입 전)에서 호출한다. 즉, `transactions.ts` route handler에서 wallet 조회 후, Stage 1 호출 전에 네트워크 해결 + 검증을 완료한다. 검증 실패 시 WAIaaSError를 throw하여 DB INSERT가 발생하지 않도록 한다.

**Warning signs:** PENDING 상태로 영구 남는 트랜잭션이 존재하고, error 필드가 "environment mismatch" 류의 메시지를 포함.

### Pitfall 2: daemon.ts Stage 5 재진입부 누락

**What goes wrong:** `daemon.ts`의 `executeFromStage5()` 메서드는 DELAY/APPROVAL 완료 후 Stage 5-6을 재실행하는데, 이 경로에서 wallet.network이 아닌 resolvedNetwork를 사용해야 한다. 누락하면 default_network 또는 environment 기본값으로 잘못된 네트워크에 트랜잭션을 제출한다.

**Why it happens:** `executeFromStage5()`는 파이프라인 정상 흐름과 별도 경로. 리팩토링 시 이 경로를 놓치기 쉽다.

**How to avoid:** transactions 테이블에 `network` 컬럼이 이미 기록되어 있으므로(Stage 1에서 resolvedNetwork 기록), `executeFromStage5()`에서는 `tx.network`을 직접 사용하면 된다. wallet에서 다시 해결할 필요 없음.

**Warning signs:** DELAY/APPROVAL 후 재실행 트랜잭션이 wallet의 default_network로 실행되어, 원래 요청과 다른 네트워크에서 실행됨.

### Pitfall 3: request.network 검증 없이 전달

**What goes wrong:** 트랜잭션 요청의 `network` 필드가 유효하지 않은 NetworkType 값(예: "rinkeby")이면, resolveNetwork()가 그대로 전달하여 AdapterPool에서 "No EVM chain config" 에러 발생.

**Why it happens:** `network` 필드가 optional이면서 Zod 스키마에서 NetworkTypeEnum으로 검증되지 않을 수 있다.

**How to avoid:** 트랜잭션 요청 스키마(TransactionRequestSchema)에 `network: NetworkTypeEnum.optional()` 필드를 추가하여, Zod parse 시점에 유효한 NetworkType만 허용한다. resolveNetwork() 입력은 이미 Zod 검증을 통과한 값만 들어온다.

**Warning signs:** Zod parse는 성공했지만 AdapterPool에서 "No EVM chain config for network 'rinkeby'" 에러.

### Pitfall 4: resolvedNetwork와 DB INSERT의 불일치

**What goes wrong:** Stage 1에서 transactions 테이블에 INSERT할 때 `network` 컬럼에 resolvedNetwork를 기록하지 않으면, 트랜잭션 조회 시 network 정보가 NULL이 된다.

**Why it happens:** v6a 마이그레이션에서 transactions.network이 nullable로 추가되므로, INSERT에서 누락해도 에러가 나지 않는다.

**How to avoid:** Stage 1 INSERT에서 `network: ctx.resolvedNetwork`를 반드시 포함한다. 설계 문서에 INSERT 변경 사항을 명시적으로 기술한다.

**Warning signs:** `SELECT COUNT(*) FROM transactions WHERE network IS NULL AND created_at > [v1.4.6 배포일]` > 0

## Code Examples

### 현재 코드베이스 패턴 (설계 참조용)

#### 1. PipelineContext 생성 -- transactions.ts route handler

```typescript
// Source: packages/daemon/src/api/routes/transactions.ts (line 255-291)
// 현재 코드: wallet.network 직접 사용

const rpcUrl = resolveRpcUrl(
  deps.config.rpc as unknown as Record<string, string>,
  wallet.chain,
  wallet.network,   // <-- 변경 대상: resolvedNetwork 사용
);
const adapter = await deps.adapterPool.resolve(
  wallet.chain as ChainType,
  wallet.network as NetworkType,   // <-- 변경 대상
  rpcUrl,
);

const ctx: PipelineContext = {
  // ...
  wallet: {
    publicKey: wallet.publicKey,
    chain: wallet.chain,
    network: wallet.network,   // <-- 변경 대상: environment + defaultNetwork
  },
  // resolvedNetwork: ??? // <-- 추가 대상
};
```

#### 2. Stage 1 INSERT -- stages.ts

```typescript
// Source: packages/daemon/src/pipeline/stages.ts (line 199-209)
// 현재 코드: network 컬럼 없음

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
  // network: ctx.resolvedNetwork,  // <-- 추가 대상
});
```

#### 3. daemon.ts Stage 5 재진입 -- executeFromStage5

```typescript
// Source: packages/daemon/src/lifecycle/daemon.ts (line 624-655)
// 현재 코드: wallet.network 직접 사용

const rpcUrl = resolveRpcUrl(
  this._config.rpc as unknown as Record<string, string>,
  wallet.chain,
  wallet.network,   // <-- 변경 대상: tx.network 사용
);
const adapter = await this.adapterPool.resolve(
  wallet.chain as ChainType,
  wallet.network as NetworkType,   // <-- 변경 대상: tx.network as NetworkType
  rpcUrl,
);

const ctx = {
  // ...
  wallet: {
    publicKey: wallet.publicKey,
    chain: wallet.chain,
    network: wallet.network,   // <-- 변경 대상: environment + defaultNetwork
  },
  // resolvedNetwork: tx.network,  // <-- 추가 대상 (이미 DB에 기록된 값)
};
```

#### 4. AdapterPool 캐시 키 -- 변경 불필요 확인

```typescript
// Source: packages/daemon/src/infrastructure/adapter-pool.ts (line 41-43)
// 캐시 키가 이미 chain:network로 정확함

private cacheKey(chain: ChainType, network: NetworkType): string {
  return `${chain}:${network}`;
}

// resolvedNetwork를 network로 전달하면 자동으로 올바른 캐시 키 생성
// 예: resolve('ethereum', 'polygon-amoy', rpcUrl) -> 캐시 키 'ethereum:polygon-amoy'
```

#### 5. resolveRpcUrl -- 변경 불필요 확인

```typescript
// Source: packages/daemon/src/infrastructure/adapter-pool.ts (line 20-33)
// 이미 network 파라미터로 RPC URL을 해결하므로, resolvedNetwork를 전달하면 자동 동작

export function resolveRpcUrl(
  rpcConfig: Record<string, string>,
  chain: string,
  network: string,  // <-- resolvedNetwork를 여기에 전달
): string {
  if (chain === 'solana') {
    const key = `solana_${network}`;
    return rpcConfig[key] || '';
  } else if (chain === 'ethereum') {
    const key = `evm_${network.replace(/-/g, '_')}`;
    return rpcConfig[key] || '';
  }
  return '';
}
```

## Detailed Findings by Requirement

### PIPE-01: NetworkResolver 추상화

**Confidence: HIGH** (기존 매핑 함수 4개가 Phase 105에서 완전 설계됨)

**설계 방향:**
- `resolveNetwork()` 순수 함수 1개로 충분 (클래스 불필요)
- 3단계 우선순위: `request.network > wallet.defaultNetwork > getDefaultNetwork(chain, env)`
- 내부에서 `validateChainNetwork()` + `validateNetworkEnvironment()` 호출하여 2중 검증
- 파일 위치: `packages/daemon/src/pipeline/network-resolver.ts` (신규) 또는 `stages.ts` 내 함수로 추가
- 에러 분기 3개:
  1. chain-network 불일치 (solana + ethereum-sepolia) -> Error -> WAIaaSError('VALIDATION_ERROR')
  2. environment-network 불일치 (mainnet 월렛 + devnet) -> Error -> WAIaaSError('ENVIRONMENT_MISMATCH')
  3. 정상 해결 -> NetworkType 반환

**에러 코드 설계:**
- 기존: `validateChainNetwork()`이 throw하는 Error는 route에서 `WAIaaSError('ACTION_VALIDATION_FAILED')`로 변환 (wallets.ts line 271-275 참조)
- 신규: 환경-네트워크 불일치는 새 에러 코드 `ENVIRONMENT_NETWORK_MISMATCH`를 도입하거나, 기존 `ACTION_VALIDATION_FAILED`를 재활용
- **권장:** 새 에러 코드 `ENVIRONMENT_NETWORK_MISMATCH` 도입 (보안 중요 -- testnet 키로 mainnet 트랜잭션 차단이 명확한 에러 코드로 추적되어야 함)
  - domain: 'TX', httpStatus: 400, retryable: false
  - message: "Network 'devnet' is not allowed in environment 'mainnet'"

### PIPE-02: PipelineContext 데이터 흐름

**Confidence: HIGH** (현재 PipelineContext 구조 직접 확인)

**PipelineContext 변경 사항:**

```typescript
export interface PipelineContext {
  // 변경: wallet 타입
  wallet: {
    publicKey: string;
    chain: string;
    environment: string;          // 변경: network -> environment
    defaultNetwork: string | null; // 추가: nullable (ENV-07)
  };

  // 추가: resolvedNetwork (Stage 1~6 전체에서 참조)
  resolvedNetwork: string;

  // 기존 필드 유지
  // adapter, keyStore, policyEngine, masterPassword, walletId, request, txId, ...
}
```

**Stage 1~6 데이터 흐름도:**

```
[Route Handler]
  ├─ wallet 조회 (DB) -> { chain, environment, defaultNetwork }
  ├─ resolveNetwork(request.network, wallet.defaultNetwork, environment, chain) -> resolvedNetwork
  ├─ validateNetworkEnvironment(chain, environment, resolvedNetwork) -> pass/throw
  ├─ resolveRpcUrl(config.rpc, chain, resolvedNetwork) -> rpcUrl
  ├─ adapterPool.resolve(chain, resolvedNetwork, rpcUrl) -> adapter
  └─ ctx = { wallet: { chain, environment, defaultNetwork }, resolvedNetwork, adapter, ... }

[Stage 1: Validate]
  ├─ Zod parse (TransactionRequestSchema)
  ├─ generateId() -> txId
  └─ INSERT transactions (..., network = ctx.resolvedNetwork)

[Stage 2: Auth]
  └─ (변경 없음 -- sessionId 검증)

[Stage 3: Policy]
  ├─ buildTransactionParam(req, txType, ctx.wallet.chain)  -- 변경 없음
  └─ policyEngine.evaluate(walletId, txParam)  -- 변경 없음 (Phase 107 범위)

[Stage 4: Wait]
  └─ (변경 없음 -- DELAY/APPROVAL 분기)

[Stage 5: Execute]
  ├─ buildByType(ctx.adapter, ctx.request, ctx.wallet.publicKey)  -- 변경 없음
  ├─ simulateTransaction(unsignedTx)  -- 변경 없음
  ├─ signTransaction(unsignedTx, privateKey)  -- 변경 없음
  └─ submitTransaction(signedTx)  -- ctx.adapter가 이미 resolvedNetwork의 어댑터

[Stage 6: Confirm]
  └─ waitForConfirmation(txHash)  -- 변경 없음 (ctx.adapter가 올바른 네트워크)
```

**핵심:** 네트워크 해결은 파이프라인 진입점(Route Handler)에서 1회 수행. Stage 1~6에서는 ctx.resolvedNetwork를 참조만 한다.

### PIPE-03: 환경-네트워크 교차 검증

**Confidence: HIGH** (docs/68 섹션 3.4 validateNetworkEnvironment 완전 설계됨)

**검증 시점:** PipelineContext 생성 전 (Route Handler에서)

**검증 로직:**
1. `validateChainNetwork(chain, resolvedNetwork)` -- chain-network 호환 (기존)
2. `validateNetworkEnvironment(chain, environment, resolvedNetwork)` -- 환경-네트워크 일치 (신규)

**에러 시나리오:**

| 월렛 | 요청 network | 검증 결과 | 에러 |
|------|-------------|---------|------|
| solana/mainnet | devnet | FAIL | "Invalid network 'devnet' for chain 'solana' in environment 'mainnet'. Valid: mainnet" |
| ethereum/testnet | ethereum-mainnet | FAIL | "Invalid network 'ethereum-mainnet' for chain 'ethereum' in environment 'testnet'. Valid: ..." |
| ethereum/mainnet | polygon-mainnet | PASS | -- (같은 환경, 다른 L2) |
| solana/testnet | ethereum-sepolia | FAIL | chain-network 불일치 (validateChainNetwork에서 차단) |
| solana/testnet | null (미지정) | PASS | default_network 또는 getDefaultNetwork() -> devnet |

**에러 변환:**
- `validateChainNetwork()` Error -> `WAIaaSError('ACTION_VALIDATION_FAILED')` (기존 패턴)
- `validateNetworkEnvironment()` Error -> `WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH')` (신규)

**보안 관점:** 이 검증은 "testnet 키로 mainnet 트랜잭션 실행" 차단을 위한 핵심 안전장치이다. 검증은 DB INSERT 전에 수행되어야 하며, 로그에 환경 불일치 시도가 기록되어야 한다.

### PIPE-04: AdapterPool 호출부 변경

**Confidence: HIGH** (AdapterPool 소스 코드 직접 확인)

**변경 불필요한 것:**
- `AdapterPool.resolve(chain, network, rpcUrl)` 시그니처 -- 변경 없음
- `AdapterPool.cacheKey(chain, network)` -- 변경 없음 (`chain:network`)
- `resolveRpcUrl(rpcConfig, chain, network)` -- 변경 없음

**변경 필요한 것 (호출부만):**

1. `transactions.ts` (line 256-265): `wallet.network` -> `resolvedNetwork`
2. `daemon.ts` (line 625-634): `wallet.network` -> `tx.network` (DB에 기록된 resolvedNetwork)
3. `wallet.ts` (line 142-151, 183-192): 잔액/자산 조회에서 `wallet.network` -> 네트워크 해결 로직 적용 (Phase 108 범위일 수 있음)

**호환성 확인:**
- 캐시 키 `ethereum:polygon-amoy`와 `ethereum:ethereum-sepolia`는 별도 어댑터로 캐시됨 -- 정확한 동작
- 같은 월렛(ethereum/testnet)이 polygon-amoy와 ethereum-sepolia를 교대 사용 시, 두 어댑터가 동시에 캐시됨 -- 메모리 사용량은 어댑터당 경량이므로 문제 없음
- evict/evictAll은 기존대로 동작 (hot-reload 시 전체 evict)

**daemon.ts 재진입 경로 특이사항:**
- `executeFromStage5(txId, walletId)`에서 transactions 테이블의 `network` 컬럼을 읽어 resolvedNetwork로 사용
- 이미 Stage 1에서 network가 기록되어 있으므로, wallet에서 다시 해결할 필요 없음
- 단, v6a 마이그레이션 이전 트랜잭션(network=NULL)의 경우 wallet에서 fallback 필요 -> 구현 시 NULL 처리

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| wallet.network으로 고정 어댑터 해결 | resolveNetwork() 3단계 우선순위 해결 | v1.4.5 설계 | 트랜잭션마다 네트워크 선택 가능 |
| PipelineContext.wallet.network | PipelineContext.resolvedNetwork + wallet.environment | v1.4.5 설계 | 환경 격리 + 네트워크 유연성 |
| 환경 검증 없음 | validateNetworkEnvironment() | v1.4.5 설계 | mainnet/testnet 교차 사용 차단 |

## Open Questions

### 1. TransactionRequest 스키마에 network 필드 추가 범위

**What we know:**
- Phase 108이 API 인터페이스 설계를 담당하며, `POST /v1/transactions/send`의 network 파라미터 추가가 범위에 포함
- Phase 106은 파이프라인 내부 설계이므로, API 스키마 변경은 Phase 108에서 처리

**What's unclear:** Phase 106 설계 문서에서 `request.network`의 타입과 소스를 어디까지 명시해야 하는지.

**Recommendation:** Phase 106 설계에서는 `request.network`을 `NetworkType | undefined | null`로 가정하고 resolveNetwork()를 설계한다. 실제 Zod 스키마 변경(TransactionRequestSchema에 network 추가)은 Phase 108에서 수행. resolveNetwork()의 입력 타입만 정의하면 Phase 108에서 스키마를 맞출 수 있다.

### 2. wallet.ts 잔액/자산 조회 네트워크 해결

**What we know:**
- `GET /wallet/balance`와 `GET /wallet/assets`에서도 `wallet.network`을 사용하여 어댑터를 해결
- 이들은 트랜잭션이 아니므로 `request.network`이 없음

**What's unclear:** 잔액 조회 시 네트워크 선택을 어떻게 처리할지 (쿼리 파라미터? defaultNetwork? 환경 기본값?)

**Recommendation:** Phase 108 범위로 분리. Phase 106은 트랜잭션 파이프라인에만 집중. 잔액 조회의 네트워크 해결은 Phase 108의 API 설계에서 `?network=polygon-amoy` 쿼리 파라미터로 처리.

### 3. 에러 코드 신규 추가 범위

**What we know:**
- 현재 ERROR_CODES에 환경-네트워크 관련 에러 코드가 없음
- `CHAIN_NOT_SUPPORTED`(system), `ACTION_VALIDATION_FAILED`(action) 등은 있지만 환경 불일치 전용 코드 없음

**What's unclear:** `ENVIRONMENT_NETWORK_MISMATCH` 에러 코드를 Phase 106에서 설계할지, Phase 108 API 설계에서 함께 추가할지.

**Recommendation:** Phase 106 설계에서 에러 코드 정의를 포함한다. 에러 코드는 파이프라인 동작의 일부이므로 Phase 106 범위가 적절. 실제 `error-codes.ts` 추가는 v1.4.6 구현 시.

## Sources

### Primary (HIGH confidence -- 코드베이스 직접 확인)

- `packages/daemon/src/pipeline/stages.ts` -- PipelineContext 인터페이스, stage1Validate INSERT, stage5Execute buildByType
- `packages/daemon/src/pipeline/pipeline.ts` -- TransactionPipeline.executeSend(), PipelineDeps 인터페이스
- `packages/daemon/src/api/routes/transactions.ts` -- route handler PipelineContext 생성, AdapterPool.resolve() 호출부
- `packages/daemon/src/infrastructure/adapter-pool.ts` -- AdapterPool.resolve(), cacheKey(), resolveRpcUrl()
- `packages/daemon/src/lifecycle/daemon.ts` (line 600-676) -- executeFromStage5() Stage 5 재진입 경로
- `packages/daemon/src/api/routes/wallet.ts` -- 잔액/자산 조회 어댑터 해결 패턴
- `packages/core/src/enums/chain.ts` -- NETWORK_TYPES, validateChainNetwork(), ChainType, NetworkType
- `packages/core/src/errors/error-codes.ts` -- 68개 에러 코드 정의 (환경 관련 코드 부재 확인)
- `packages/core/src/interfaces/IChainAdapter.ts` -- IChainAdapter.chain, IChainAdapter.network 속성
- `packages/adapters/evm/src/evm-chain-map.ts` -- EVM_CHAIN_MAP (10개 네트워크 -> viem Chain 매핑)

### Secondary (HIGH confidence -- Phase 105 설계 문서)

- `docs/68-environment-model-design.md` -- EnvironmentType SSoT, 환경-네트워크 매핑 테이블, 매핑 함수 4개, WalletSchema 변경, 키스토어 분석, 설계 결정 ENV-01~08
- `docs/69-db-migration-v6-design.md` -- v6a transactions.network ADD COLUMN, v6b wallets 12-step 재생성
- `.planning/phases/105-environment-data-model-db-migration/105-RESEARCH.md` -- Phase 105 리서치 (wallet.network 참조 지점 5개 파일 목록)

### Tertiary (HIGH confidence -- 프로젝트 설계)

- `.planning/ROADMAP.md` -- Phase 106 requirements (PIPE-01~04), success criteria
- `objectives/v1.4.5-multichain-wallet-design.md` -- v1.4.5 마일스톤 환경 모델 전환 목표

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 새 의존성 0개. 기존 코드베이스의 파이프라인 구조를 직접 분석
- Architecture: HIGH -- 변경 지점 2곳 식별 (transactions.ts, daemon.ts). AdapterPool 호환성 코드 레벨 확인. PipelineContext 확장 설계는 기존 필드 추가 패턴과 동일
- Pitfalls: HIGH -- Stage 5 재진입 경로 식별. 환경 검증 시점 분석. request.network 검증 누락 위험 식별

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (기존 스택 활용이므로 30일 유효)
