# 설계 문서 72: REST API 인터페이스 + DX 설계

> **Phase:** 108 (v1.4.5 -- 멀티체인 월렛 설계)
> **산출물:** REST API network/environment 파라미터 확장 + 멀티네트워크 잔액 집계 + 하위호환 전략 + OpenAPI 변경 요약
> **참조 기반:** docs/68-environment-model-design.md, docs/70-pipeline-network-resolve-design.md, docs/71-policy-engine-network-extension-design.md, 108-RESEARCH.md
> **작성일:** 2026-02-14

---

## 1. 트랜잭션 요청 스키마 network 파라미터 (API-01)

### 1.1 5-type 스키마 network 필드 추가

5가지 트랜잭션 요청 타입(TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH)에 `network` optional 필드를 추가한다. 트랜잭션 요청 시점에 실행할 네트워크를 명시적으로 선택할 수 있게 한다.

```typescript
// packages/core/src/schemas/transaction.schema.ts
import { NetworkTypeEnum } from '../enums/chain.js';

/** Type 1: TRANSFER -- native token transfer (SOL/ETH). */
export const TransferRequestSchema = z.object({
  type: z.literal('TRANSFER'),
  to: z.string().min(1),
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string (lamports/wei)'),
  memo: z.string().max(256).optional(),
  network: NetworkTypeEnum.optional(),  // NEW: 트랜잭션별 네트워크 선택
});

/** Type 2: TOKEN_TRANSFER -- SPL/ERC-20 token transfer. */
export const TokenTransferRequestSchema = z.object({
  type: z.literal('TOKEN_TRANSFER'),
  to: z.string().min(1),
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string'),
  token: TokenInfoSchema,
  memo: z.string().max(256).optional(),
  network: NetworkTypeEnum.optional(),  // NEW
});

/** Type 3: CONTRACT_CALL -- arbitrary contract invocation. */
export const ContractCallRequestSchema = z.object({
  type: z.literal('CONTRACT_CALL'),
  to: z.string().min(1),
  calldata: z.string().optional(),
  abi: z.array(z.record(z.unknown())).optional(),
  value: z.string().regex(numericStringPattern).optional(),
  programId: z.string().optional(),
  instructionData: z.string().optional(),
  accounts: z.array(z.object({
    pubkey: z.string(),
    isSigner: z.boolean(),
    isWritable: z.boolean(),
  })).optional(),
  network: NetworkTypeEnum.optional(),  // NEW
});

/** Type 4: APPROVE -- token spending approval. */
export const ApproveRequestSchema = z.object({
  type: z.literal('APPROVE'),
  spender: z.string().min(1),
  token: TokenInfoSchema,
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string'),
  network: NetworkTypeEnum.optional(),  // NEW
});

/** Type 5: BATCH -- multiple instructions in a single transaction. */
export const BatchRequestSchema = z.object({
  type: z.literal('BATCH'),
  instructions: z.array(
    z.union([
      TransferRequestSchema.omit({ type: true }),
      TokenTransferRequestSchema.omit({ type: true }),
      ContractCallRequestSchema.omit({ type: true }),
      ApproveRequestSchema.omit({ type: true }),
    ]),
  ).min(2).max(20),
  network: NetworkTypeEnum.optional(),  // NEW: BATCH 전체에 하나의 network
});
```

**BATCH 특이사항:** `network`는 최상위에 하나만 둔다. BATCH 내 instructions 각각에 network를 두지 않는다. 이유: (1) 하나의 트랜잭션은 하나의 네트워크에서 실행, (2) 동일 네트워크의 여러 instruction을 원자적으로 묶는 것이 BATCH의 목적.

### 1.2 Legacy SendTransactionRequestSchema network 필드 추가

하위호환을 위해 유지 중인 legacy 스키마에도 동일 패턴 적용.

```typescript
// packages/core/src/schemas/transaction.schema.ts

export const SendTransactionRequestSchema = z.object({
  to: z.string().min(1),
  amount: z.string().regex(/^\d+$/, 'amount must be a numeric string (lamports)'),
  memo: z.string().max(256).optional(),
  network: NetworkTypeEnum.optional(),  // NEW: legacy에도 network 선택 허용
});
```

### 1.3 TransactionSchema 응답에 network 필드 추가

트랜잭션 실행 결과에 어떤 네트워크에서 실행되었는지 반환한다.

```typescript
// packages/core/src/schemas/transaction.schema.ts

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  type: TransactionTypeEnum,
  status: TransactionStatusEnum,
  tier: PolicyTierEnum.nullable(),
  chain: ChainTypeEnum,
  network: NetworkTypeEnum.nullable(),  // NEW: 실행된 네트워크 (nullable, 마이그레이션 이전 레코드 호환)
  fromAddress: z.string(),
  toAddress: z.string(),
  amount: z.string(),
  txHash: z.string().nullable(),
  errorMessage: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
```

### 1.4 Route Handler POST /v1/transactions/send에서 resolveNetwork() 호출

```typescript
// packages/daemon/src/api/routes/transactions.ts -- 변경 의사코드

import { resolveNetwork } from '../../pipeline/network-resolver.js';
import type { ChainType, NetworkType, EnvironmentType } from '@waiaas/core';

router.openapi(sendTransactionRoute, async (c) => {
  const walletId = c.get('walletId') as string;
  const wallet = await db.select().from(wallets).where(eq(wallets.id, walletId)).get();
  if (!wallet) throw new WAIaaSError('WALLET_NOT_FOUND', { ... });

  const request = await c.req.json();

  // ------ NEW: resolveNetwork 3단계 fallback ------
  let resolvedNetwork: NetworkType;
  try {
    resolvedNetwork = resolveNetwork(
      request.network as NetworkType | undefined,       // 1순위: 요청 명시
      wallet.defaultNetwork as NetworkType | null,      // 2순위: 월렛 기본값
      wallet.environment as EnvironmentType,            // 3순위: 환경 기본값
      wallet.chain as ChainType,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('environment')) {
      console.warn(
        `[SECURITY] Environment-network mismatch attempt: ` +
        `wallet=${walletId}, chain=${wallet.chain}, env=${wallet.environment}, ` +
        `requestedNetwork=${request.network ?? 'null'}`,
      );
      throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', { message: err.message });
    }
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: err instanceof Error ? err.message : 'Network validation failed',
    });
  }

  // ------ 어댑터 해결 (resolvedNetwork 사용) ------
  const rpcUrl = resolveRpcUrl(
    deps.config.rpc as unknown as Record<string, string>,
    wallet.chain,
    resolvedNetwork,                    // CHANGED: wallet.network -> resolvedNetwork
  );
  const adapter = await deps.adapterPool.resolve(
    wallet.chain as ChainType,
    resolvedNetwork as NetworkType,     // CHANGED: wallet.network -> resolvedNetwork
    rpcUrl,
  );

  // ------ PipelineContext 생성 ------
  const ctx: PipelineContext = {
    // ... dependencies
    walletId,
    wallet: {
      publicKey: wallet.publicKey,
      chain: wallet.chain,
      environment: wallet.environment,       // CHANGED: network -> environment
      defaultNetwork: wallet.defaultNetwork, // NEW: nullable
    },
    resolvedNetwork,                          // NEW: 검증 완료된 네트워크
    request,
    txId: '',
    // ...
  };

  await stage1Validate(ctx);
  // Stages 2-6 async ...

  return c.json({ id: ctx.txId, status: 'PENDING' }, 201);
});
```

**핵심 흐름:**

```
요청 수신 -> wallet 조회
  -> resolveNetwork(request.network, wallet.defaultNetwork, wallet.environment, wallet.chain)
    -> 1순위: request.network (명시적)
    -> 2순위: wallet.defaultNetwork (월렛 설정)
    -> 3순위: getDefaultNetwork(chain, env) (환경 기본값)
  -> validateChainNetwork() + validateNetworkEnvironment() (2중 검증)
  -> resolveRpcUrl() + adapterPool.resolve() (올바른 네트워크 어댑터)
  -> PipelineContext.resolvedNetwork에 주입
  -> Stage 1 INSERT (transactions.network = resolvedNetwork)
```

### 1.5 OpenAPI 스키마 변경 (5-type + legacy)

`openapi-schemas.ts`에서 re-export하는 5-type 스키마와 legacy 스키마 모두 원천(`transaction.schema.ts`)에서 `network` 필드가 추가되므로, OpenAPI spec에 자동 반영된다.

```typescript
// packages/daemon/src/api/routes/openapi-schemas.ts -- 변경 사항 없음 (자동 파생)

// 기존 re-export가 그대로 동작:
export const TransferRequestOpenAPI = TransferRequestSchema.openapi('TransferRequest');
export const TokenTransferRequestOpenAPI = TokenTransferRequestSchema.openapi('TokenTransferRequest');
export const ContractCallRequestOpenAPI = ContractCallRequestSchema.openapi('ContractCallRequest');
export const ApproveRequestOpenAPI = ApproveRequestSchema.openapi('ApproveRequest');
export const BatchRequestOpenAPI = BatchRequestSchema.openapi('BatchRequest');
export const SendTransactionRequestOpenAPI = SendTransactionRequestSchema.openapi('SendTransactionRequest');
```

**OpenAPI spec 결과:** 각 스키마의 `properties`에 `network` 필드가 추가된다.

```json
// TransferRequest OpenAPI spec 예시 (자동 생성)
{
  "type": "object",
  "required": ["type", "to", "amount"],
  "properties": {
    "type": { "type": "string", "enum": ["TRANSFER"] },
    "to": { "type": "string", "minLength": 1 },
    "amount": { "type": "string", "pattern": "^\\d+$" },
    "memo": { "type": "string", "maxLength": 256 },
    "network": {
      "type": "string",
      "enum": ["mainnet", "devnet", "testnet", "ethereum-mainnet", "ethereum-sepolia",
               "polygon-mainnet", "polygon-amoy", "arbitrum-mainnet", "arbitrum-sepolia",
               "optimism-mainnet", "optimism-sepolia", "base-mainnet", "base-sepolia"]
    }
  }
}
```

### 1.6 트랜잭션 응답에 network 필드 포함

트랜잭션 상세 응답에 실행된 네트워크를 포함한다.

```typescript
// packages/daemon/src/api/routes/openapi-schemas.ts -- TxDetailResponseSchema 변경

export const TxDetailResponseSchema = z
  .object({
    id: z.string().uuid(),
    walletId: z.string().uuid(),
    type: z.string(),
    status: z.string(),
    tier: z.string().nullable(),
    chain: z.string(),
    network: z.string().nullable(),    // NEW: 실행된 네트워크 (nullable, 마이그레이션 이전 레코드)
    toAddress: z.string().nullable(),
    amount: z.string().nullable(),
    txHash: z.string().nullable(),
    error: z.string().nullable(),
    createdAt: z.number().int().nullable(),
  })
  .openapi('TxDetailResponse');
```

**API 응답 예시:**

```json
{
  "id": "tx_01abc...",
  "walletId": "w_01def...",
  "type": "TRANSFER",
  "status": "CONFIRMED",
  "tier": "INSTANT",
  "chain": "ethereum",
  "network": "polygon-amoy",
  "toAddress": "0x1234...",
  "amount": "1000000",
  "txHash": "0xabcd...",
  "error": null,
  "createdAt": 1707000000
}
```

---

## 2. 월렛 생성 API environment 파라미터 (API-03)

### 2.1 CreateWalletRequestSchema에 environment 추가

```typescript
// packages/core/src/schemas/wallet.schema.ts
import { EnvironmentTypeEnum, NetworkTypeEnum, ChainTypeEnum } from '../enums/chain.js';

export const CreateWalletRequestSchema = z.object({
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum.default('solana'),
  environment: EnvironmentTypeEnum.optional(),  // NEW: optional for backward compat
  network: NetworkTypeEnum.optional(),           // KEEP: 초기 default_network 설정용
});
```

**기존 `network` 필드의 의미 변경:**

| 필드 | 현재 (v1.4.4) | 변경 후 (v1.4.6) |
|------|-------------|----------------|
| `network` | 월렛의 고정 네트워크 | 초기 `default_network` 설정값 |
| `environment` | 존재하지 않음 | 월렛의 환경 (`testnet` / `mainnet`) |

### 2.2 Route Handler POST /v1/wallets 4가지 조합 처리

```typescript
// packages/daemon/src/api/routes/wallets.ts -- 변경 의사코드

import {
  deriveEnvironment,
  getDefaultNetwork,
  validateChainNetwork,
  validateNetworkEnvironment,
} from '@waiaas/core';
import type { ChainType, NetworkType, EnvironmentType } from '@waiaas/core';

router.openapi(createWalletRoute, async (c) => {
  const body = await c.req.json();
  const parsed = CreateWalletRequestSchema.parse(body);

  const chain = parsed.chain as ChainType;

  // ------ 4가지 조합 처리 ------
  let environment: EnvironmentType;
  let defaultNetwork: NetworkType;

  if (parsed.environment && parsed.network) {
    // Case 1: env 지정 + network 지정 -> 교차 검증
    environment = parsed.environment as EnvironmentType;
    defaultNetwork = parsed.network as NetworkType;

    // chain-network 호환성 검증
    try {
      validateChainNetwork(chain, defaultNetwork);
    } catch (err) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: err instanceof Error ? err.message : 'Chain-network validation failed',
      });
    }

    // environment-network 교차 검증
    try {
      validateNetworkEnvironment(chain, environment, defaultNetwork);
    } catch (err) {
      throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', {
        message: err instanceof Error ? err.message : 'Environment-network validation failed',
      });
    }

  } else if (parsed.environment && !parsed.network) {
    // Case 2: env 지정 + network 미지정 -> 환경 기본 네트워크 자동 설정
    environment = parsed.environment as EnvironmentType;
    defaultNetwork = getDefaultNetwork(chain, environment);

  } else if (!parsed.environment && parsed.network) {
    // Case 3: env 미지정 + network 지정 -> 네트워크에서 환경 역추론
    defaultNetwork = parsed.network as NetworkType;

    try {
      validateChainNetwork(chain, defaultNetwork);
    } catch (err) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: err instanceof Error ? err.message : 'Chain-network validation failed',
      });
    }

    environment = deriveEnvironment(defaultNetwork);

  } else {
    // Case 4: env 미지정 + network 미지정 -> 체인 기본 환경(testnet) + 기본 네트워크
    environment = 'testnet';
    defaultNetwork = getDefaultNetwork(chain, 'testnet');
  }

  // ------ 키 생성 + DB INSERT ------
  const id = generateId();
  const keyPair = await keyStore.generateKeyPair(id, chain, defaultNetwork, masterPassword);

  await db.insert(wallets).values({
    id,
    name: parsed.name,
    chain,
    environment,                      // NEW: 환경 저장
    defaultNetwork,                   // NEW: 초기 기본 네트워크
    publicKey: keyPair.publicKey,
    status: 'ACTIVE',
    ownerAddress: null,
    ownerVerified: false,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({
    id,
    name: parsed.name,
    chain,
    network: defaultNetwork,         // KEEP: 하위호환 (기존 클라이언트 기대 필드)
    environment,                     // NEW
    defaultNetwork,                  // NEW
    publicKey: keyPair.publicKey,
    status: 'ACTIVE',
    createdAt: now,
  }, 201);
});
```

### 2.3 4가지 조합 결정 테이블

| # | environment | network | 결정된 environment | 결정된 defaultNetwork | 검증 |
|---|-------------|---------|-------------------|---------------------|------|
| 1 | `"mainnet"` | `"polygon-mainnet"` | `mainnet` | `polygon-mainnet` | validateChainNetwork + validateNetworkEnvironment |
| 2 | `"mainnet"` | 미지정 | `mainnet` | `ethereum-mainnet` (solana면 `mainnet`) | 없음 (getDefaultNetwork 보장) |
| 3 | 미지정 | `"devnet"` | `testnet` (역추론) | `devnet` | validateChainNetwork |
| 4 | 미지정 | 미지정 | `testnet` (기본값) | `devnet` (solana) / `ethereum-sepolia` (ethereum) | 없음 (getDefaultNetwork 보장) |

**하위호환 증명:**

기존 API 호출 `{ name: "my-wallet", chain: "solana", network: "devnet" }` -> Case 3 -> environment=`testnet`(역추론), defaultNetwork=`devnet` -> 기존과 동일한 월렛 생성.

기존 API 호출 `{ name: "my-wallet" }` -> Case 4 -> environment=`testnet`, defaultNetwork=`devnet` -> 기존과 동일한 기본 동작.

### 2.4 WalletResponseSchema 변경 (응답)

```typescript
// packages/core/src/schemas/wallet.schema.ts

export const WalletSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum,
  environment: EnvironmentTypeEnum,            // NEW: 'testnet' | 'mainnet'
  defaultNetwork: NetworkTypeEnum.nullable(),  // NEW: 기본 네트워크 (nullable)
  publicKey: z.string(),
  status: WalletStatusEnum,
  ownerAddress: z.string().nullable(),
  ownerVerified: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
```

### 2.5 GET /v1/wallets, GET /v1/wallets/:id 응답 변경

기존 `network` 필드를 유지하면서 `environment`와 `defaultNetwork` 필드를 추가한다.

```typescript
// packages/daemon/src/api/routes/openapi-schemas.ts -- WalletCrudResponseSchema 변경

export const WalletCrudResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    chain: z.string(),
    network: z.string(),             // KEEP: 하위호환 (= defaultNetwork ?? getDefaultNetwork)
    environment: z.string(),         // NEW
    defaultNetwork: z.string().nullable(),  // NEW
    publicKey: z.string(),
    status: z.string(),
    createdAt: z.number().int(),
  })
  .openapi('WalletCrudResponse');

export const WalletDetailResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    chain: z.string(),
    network: z.string(),             // KEEP: 하위호환
    environment: z.string(),         // NEW
    defaultNetwork: z.string().nullable(),  // NEW
    publicKey: z.string(),
    status: z.string(),
    ownerAddress: z.string().nullable(),
    ownerVerified: z.boolean().nullable(),
    ownerState: z.enum(['NONE', 'GRACE', 'LOCKED']),
    createdAt: z.number().int(),
    updatedAt: z.number().int().nullable(),
  })
  .openapi('WalletDetailResponse');
```

**응답에서 `network` 필드 값 결정:**

```typescript
// Route handler에서 응답 구성 시
const networkValue = wallet.defaultNetwork
  ?? getDefaultNetwork(wallet.chain as ChainType, wallet.environment as EnvironmentType);

return c.json({
  id: wallet.id,
  name: wallet.name,
  chain: wallet.chain,
  network: networkValue,                      // 하위호환: 기존 클라이언트가 참조하는 필드
  environment: wallet.environment,            // NEW
  defaultNetwork: wallet.defaultNetwork,      // NEW (nullable)
  publicKey: wallet.publicKey,
  // ...
});
```

`network` 필드는 `defaultNetwork ?? getDefaultNetwork()` 결과를 반환한다. 기존 클라이언트는 이 필드만 참조하므로 동작 변경이 없다. 신규 클라이언트는 `environment` + `defaultNetwork`를 활용한다.

---

## 3. 잔액/자산 조회 멀티네트워크 확장 (API-01 + API-02)

### 3.1 GET /v1/wallet/balance ?network= 쿼리 파라미터 확장

```typescript
// packages/daemon/src/api/routes/wallet.ts -- walletBalanceRoute 변경

const walletBalanceRoute = createRoute({
  method: 'get',
  path: '/wallet/balance',
  tags: ['Wallet'],
  summary: 'Get wallet balance',
  request: {
    query: z.object({
      network: z.string().optional(),    // NEW: 특정 네트워크 잔액 조회
    }),
  },
  responses: {
    200: {
      description: 'Wallet balance',
      content: { 'application/json': { schema: WalletBalanceResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'CHAIN_ERROR', 'ENVIRONMENT_NETWORK_MISMATCH']),
  },
});
```

**Route Handler 의사코드:**

```typescript
router.openapi(walletBalanceRoute, async (c) => {
  const walletId = c.get('walletId') as string;
  const wallet = await resolveWalletById(deps.db, walletId);

  // network 결정: 쿼리 파라미터 > wallet.defaultNetwork > getDefaultNetwork()
  const queryNetwork = c.req.query('network');
  const targetNetwork = resolveNetwork(
    queryNetwork as NetworkType | undefined,
    wallet.defaultNetwork as NetworkType | null,
    wallet.environment as EnvironmentType,
    wallet.chain as ChainType,
  );

  const rpcUrl = resolveRpcUrl(deps.config.rpc, wallet.chain, targetNetwork);
  const adapter = await deps.adapterPool.resolve(
    wallet.chain as ChainType,
    targetNetwork as NetworkType,
    rpcUrl,
  );

  const balance = await adapter.getBalance(wallet.publicKey);

  return c.json({
    walletId: wallet.id,
    chain: wallet.chain,
    network: targetNetwork,                 // 실제 조회된 네트워크
    address: wallet.publicKey,
    balance: balance.balance,
    decimals: balance.decimals,
    symbol: balance.symbol,
  });
});
```

### 3.2 GET /v1/wallet/assets ?network= 쿼리 파라미터 확장

```typescript
// packages/daemon/src/api/routes/wallet.ts -- walletAssetsRoute 변경

const walletAssetsRoute = createRoute({
  method: 'get',
  path: '/wallet/assets',
  tags: ['Wallet'],
  summary: 'Get wallet assets',
  request: {
    query: z.object({
      network: z.string().optional(),    // NEW: 특정 네트워크 자산 조회
    }),
  },
  responses: {
    200: {
      description: 'All assets (native + tokens) held by wallet',
      content: { 'application/json': { schema: WalletAssetsResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'CHAIN_ERROR', 'ENVIRONMENT_NETWORK_MISMATCH']),
  },
});
```

**Route Handler 의사코드:**

```typescript
router.openapi(walletAssetsRoute, async (c) => {
  const walletId = c.get('walletId') as string;
  const wallet = await resolveWalletById(deps.db, walletId);

  const queryNetwork = c.req.query('network');
  const targetNetwork = resolveNetwork(
    queryNetwork as NetworkType | undefined,
    wallet.defaultNetwork as NetworkType | null,
    wallet.environment as EnvironmentType,
    wallet.chain as ChainType,
  );

  const rpcUrl = resolveRpcUrl(deps.config.rpc, wallet.chain, targetNetwork);
  const adapter = await deps.adapterPool.resolve(
    wallet.chain as ChainType,
    targetNetwork as NetworkType,
    rpcUrl,
  );

  const assets = await adapter.getAssets(wallet.publicKey);

  return c.json({
    walletId: wallet.id,
    chain: wallet.chain,
    network: targetNetwork,                 // 실제 조회된 네트워크
    assets,
  });
});
```

**하위호환:** `?network=` 미지정 시 `resolveNetwork()`가 `wallet.defaultNetwork` 또는 `getDefaultNetwork()`로 fallback하므로 기존 동작과 동일하다.

### 3.3 GET /v1/wallets/:id/assets 멀티네트워크 잔액 집계 엔드포인트 신설

환경 내 모든 네트워크의 자산을 병렬 조회하여 네트워크별로 그룹화하여 반환하는 masterAuth 전용 엔드포인트를 신설한다.

**Zod 응답 스키마:**

```typescript
// packages/daemon/src/api/routes/openapi-schemas.ts -- 신규 스키마

/** Per-network asset query result (success or error). */
const NetworkAssetsResultSchema = z.object({
  network: z.string(),
  status: z.enum(['ok', 'error']),
  assets: z.array(
    z.object({
      mint: z.string(),
      symbol: z.string(),
      name: z.string(),
      balance: z.string(),
      decimals: z.number().int(),
      isNative: z.boolean(),
      usdValue: z.number().optional(),
    }),
  ).optional(),
  error: z.string().optional(),
});

/** Multi-network assets aggregation response. */
export const MultiNetworkAssetsResponseSchema = z
  .object({
    walletId: z.string().uuid(),
    chain: z.string(),
    environment: z.string(),
    networks: z.array(NetworkAssetsResultSchema),
  })
  .openapi('MultiNetworkAssetsResponse');
```

**Route 정의:**

```typescript
// packages/daemon/src/api/routes/wallets.ts -- 신규 route

const walletMultiNetworkAssetsRoute = createRoute({
  method: 'get',
  path: '/wallets/{id}/assets',
  tags: ['Wallets'],
  summary: 'Get multi-network assets for a wallet',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Assets across all networks in the wallet environment',
      content: { 'application/json': { schema: MultiNetworkAssetsResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'CHAIN_ERROR']),
  },
});
```

**Route Handler 의사코드 (Promise.allSettled 병렬 조회):**

```typescript
import { getNetworksForEnvironment } from '@waiaas/core';
import type { ChainType, EnvironmentType, NetworkType } from '@waiaas/core';

router.openapi(walletMultiNetworkAssetsRoute, async (c) => {
  const { id } = c.req.param();
  const wallet = await db.select().from(wallets).where(eq(wallets.id, id)).get();
  if (!wallet) throw new WAIaaSError('WALLET_NOT_FOUND', { ... });

  const chain = wallet.chain as ChainType;
  const environment = wallet.environment as EnvironmentType;

  // 환경 내 전체 네트워크 목록 조회
  const networks = getNetworksForEnvironment(chain, environment);

  // 네트워크별 병렬 자산 조회
  const results = await Promise.allSettled(
    networks.map(async (network) => {
      const rpcUrl = resolveRpcUrl(
        deps.config.rpc as unknown as Record<string, string>,
        chain,
        network,
      );
      const adapter = await deps.adapterPool.resolve(chain, network, rpcUrl);
      const assets = await adapter.getAssets(wallet.publicKey);
      return { network, assets };
    }),
  );

  // 결과 매핑 (성공/실패 구분)
  const networkResults = results.map((result, index) => {
    const network = networks[index];
    if (result.status === 'fulfilled') {
      return {
        network,
        status: 'ok' as const,
        assets: result.value.assets,
      };
    }
    return {
      network,
      status: 'error' as const,
      error: result.reason?.message ?? 'Unknown error',
    };
  });

  return c.json({
    walletId: wallet.id,
    chain: wallet.chain,
    environment: wallet.environment,
    networks: networkResults,
  });
});
```

### 3.4 Promise.allSettled 설계 근거

| 대안 | 장점 | 단점 | 선택 |
|------|------|------|------|
| `Promise.all` | 구현 단순 | 1개 실패 시 전체 실패. 5개 네트워크 중 1개 RPC 장애로 전체 에러 | X |
| `Promise.allSettled` | 부분 실패 허용. 성공한 네트워크 결과 반환 | 응답에 status 필드 필요 | O |
| 직렬 조회 | 구현 단순 | 5개 네트워크 순차 조회 시 체감 지연 심각 (5x RPC latency) | X |

**전체 실패 처리:**

모든 네트워크가 `error` 상태인 경우에도 HTTP 200으로 반환한다. `networks` 배열 내 각 항목의 `status`가 `error`이므로 클라이언트가 판별 가능하다. 이유: 일부 네트워크만 실패하는 경우와 전체 실패를 동일한 응답 형식으로 처리하여 클라이언트 로직을 단순화한다.

### 3.5 응답 예시

**Solana testnet 월렛 (2개 네트워크):**

```json
{
  "walletId": "w_01abc...",
  "chain": "solana",
  "environment": "testnet",
  "networks": [
    {
      "network": "devnet",
      "status": "ok",
      "assets": [
        {
          "mint": "So11111111111111111111111111111111111111112",
          "symbol": "SOL",
          "name": "Solana",
          "balance": "1500000000",
          "decimals": 9,
          "isNative": true
        }
      ]
    },
    {
      "network": "testnet",
      "status": "error",
      "error": "RPC endpoint unreachable"
    }
  ]
}
```

**Ethereum testnet 월렛 (5개 네트워크, 일부 실패):**

```json
{
  "walletId": "w_01def...",
  "chain": "ethereum",
  "environment": "testnet",
  "networks": [
    {
      "network": "ethereum-sepolia",
      "status": "ok",
      "assets": [
        { "mint": "native", "symbol": "ETH", "name": "Ether", "balance": "500000000000000000", "decimals": 18, "isNative": true },
        { "mint": "0xA0b8...", "symbol": "USDC", "name": "USD Coin", "balance": "1000000", "decimals": 6, "isNative": false }
      ]
    },
    {
      "network": "polygon-amoy",
      "status": "ok",
      "assets": [
        { "mint": "native", "symbol": "POL", "name": "POL", "balance": "2000000000000000000", "decimals": 18, "isNative": true }
      ]
    },
    { "network": "arbitrum-sepolia", "status": "ok", "assets": [] },
    { "network": "optimism-sepolia", "status": "error", "error": "Request timeout" },
    { "network": "base-sepolia", "status": "ok", "assets": [] }
  ]
}
```

### 3.6 sessionAuth vs masterAuth 분리 근거

| 엔드포인트 | 인증 | 대상 | 이유 |
|-----------|------|------|------|
| GET /v1/wallet/balance | sessionAuth | 단일 네트워크 잔액 | 세션 바인딩된 월렛의 단일 네트워크 조회. 에이전트 사용 시나리오 |
| GET /v1/wallet/assets | sessionAuth | 단일 네트워크 자산 | 세션 바인딩된 월렛의 단일 네트워크 조회. 에이전트 사용 시나리오 |
| GET /v1/wallets/:id/assets | masterAuth | 멀티네트워크 집계 | 관리자가 특정 월렛의 전체 환경 자산을 파악. 대시보드/모니터링 시나리오 |

sessionAuth 엔드포인트에 멀티네트워크 집계를 추가하면 에이전트가 의도치 않게 다른 네트워크의 잔액을 노출할 수 있다. masterAuth 분리로 접근 제어를 명확히 한다.

---

## 4. REST API 하위호환 전략 (API-05)

### 4.1 3-Layer 하위호환 원칙

Phase 108에서 추가하는 모든 파라미터와 응답 필드는 기존 API 호출의 동작을 변경하지 않는다. 3가지 원칙을 모든 엔드포인트에 일관 적용한다.

| # | 원칙 | 메커니즘 | 보장 |
|---|------|---------|------|
| L1 | network 미지정 = 기존 동작 유지 | `resolveNetwork()` 3단계 fallback (docs/70) | 기존 클라이언트가 network을 보내지 않아도 `wallet.defaultNetwork` 또는 `getDefaultNetwork()`가 기존과 동일한 네트워크를 결정 |
| L2 | environment 미지정 = 자동 추론 | `deriveEnvironment()` 역추론 (docs/68) 또는 체인 기본값(`testnet`) | 기존 `{ name, chain, network }` 월렛 생성 요청이 동일하게 동작. environment는 network에서 역추론 |
| L3 | 응답 필드 추가 only | 기존 필드 유지 + 새 필드 추가. 기존 필드 제거 안 함 | 기존 클라이언트가 미지원 필드를 무시하므로 파싱 오류 없음. REST API의 표준 확장 패턴 |

### 4.2 엔드포인트별 하위호환 매트릭스

| # | 엔드포인트 | L1 (network 미지정) | L2 (environment 미지정) | L3 (응답 필드) |
|---|----------|-------|-------|-------|
| 1 | POST /v1/wallets | network 미지정 -> `getDefaultNetwork(chain, env)` 자동 설정 | environment 미지정 -> `deriveEnvironment(network)` 역추론 또는 체인 기본값 `testnet` | `network` 유지 + `environment`, `defaultNetwork` 추가 |
| 2 | POST /v1/transactions/send | network 미지정 -> `resolveNetwork()` 2순위(wallet.defaultNetwork) 또는 3순위(getDefaultNetwork) fallback | N/A (트랜잭션은 environment 파라미터 없음) | `TxSendResponse`는 id+status만 반환, 변경 없음 |
| 3 | GET /v1/wallet/balance | `?network=` 미지정 -> `resolveNetwork(null, wallet.defaultNetwork, ...)` | N/A | `network` 필드가 실제 조회 네트워크를 반환 (기존과 동일 값) |
| 4 | GET /v1/wallet/assets | `?network=` 미지정 -> `resolveNetwork(null, wallet.defaultNetwork, ...)` | N/A | `network` 필드가 실제 조회 네트워크를 반환 (기존과 동일 값) |
| 5 | GET /v1/wallets/:id/assets | 신규 엔드포인트 (하위호환 대상 아님) | 환경 내 전체 네트워크 조회 | 신규 응답 형식 |
| 6 | GET /v1/wallets | N/A (목록 조회) | N/A | `network` 유지 + `environment`, `defaultNetwork` 추가 |
| 7 | GET /v1/wallets/:id | N/A (상세 조회) | N/A | `network` 유지 + `environment`, `defaultNetwork` 추가 |

### 4.3 기존 API 호출 동작 증명

#### 증명 1: 월렛 생성 (기존 요청 형식)

```
요청: POST /v1/wallets
Body: { "name": "sol", "chain": "solana", "network": "devnet" }

처리 흐름:
  parsed.environment = undefined (미지정)
  parsed.network = "devnet" (지정)
  -> Case 3: env 미지정 + network 지정
  -> validateChainNetwork("solana", "devnet") -> PASS
  -> deriveEnvironment("devnet") -> "testnet"
  -> environment = "testnet", defaultNetwork = "devnet"

응답:
{
  "id": "w_01abc...",
  "name": "sol",
  "chain": "solana",
  "network": "devnet",           <- 기존 클라이언트가 참조하는 필드 (변경 없음)
  "environment": "testnet",      <- 새 필드 (기존 클라이언트 무시)
  "defaultNetwork": "devnet",    <- 새 필드 (기존 클라이언트 무시)
  "publicKey": "7xKX...",
  "status": "ACTIVE",
  "createdAt": 1707000000
}

결과: 기존 클라이언트는 id, name, chain, network, publicKey, status, createdAt만
참조하므로 동작 변경 없음. QED
```

#### 증명 2: 트랜잭션 전송 (기존 요청 형식)

```
요청: POST /v1/transactions/send
Body: { "type": "TRANSFER", "to": "7abc...", "amount": "1000000" }
(network 미지정)

처리 흐름:
  request.network = undefined (미지정)
  -> resolveNetwork(undefined, wallet.defaultNetwork, wallet.environment, wallet.chain)
  -> wallet.defaultNetwork = "devnet" (NOT NULL, 마이그레이션에서 기존 network 값 복사)
  -> resolved = "devnet" (2순위 fallback)
  -> validateChainNetwork("solana", "devnet") -> PASS
  -> validateNetworkEnvironment("solana", "testnet", "devnet") -> PASS
  -> resolvedNetwork = "devnet"

결과: 기존과 동일한 "devnet"에서 트랜잭션 실행. QED

만약 wallet.defaultNetwork = null인 경우:
  -> resolved = getDefaultNetwork("solana", "testnet") = "devnet" (3순위 fallback)
  -> 동일한 결과. QED
```

#### 증명 3: 자산 조회 (기존 요청 형식)

```
요청: GET /v1/wallet/assets
(쿼리 파라미터 없음)

처리 흐름:
  queryNetwork = undefined (미지정)
  -> resolveNetwork(undefined, wallet.defaultNetwork, wallet.environment, wallet.chain)
  -> wallet.defaultNetwork = "devnet"
  -> targetNetwork = "devnet"
  -> adapter = adapterPool.resolve("solana", "devnet", rpcUrl)
  -> assets = adapter.getAssets(wallet.publicKey)

응답:
{
  "walletId": "w_01abc...",
  "chain": "solana",
  "network": "devnet",    <- 기존과 동일한 값
  "assets": [...]          <- 기존과 동일한 형식
}

결과: 기존과 동일한 네트워크에서 동일한 형식으로 자산 조회. QED
```

### 4.4 Breaking Change 방지 체크리스트

| # | 항목 | 검증 방법 | 위반 시 영향 |
|---|------|---------|------------|
| 1 | 기존 필수 필드 제거 안 함 | WalletCrudResponseSchema에 기존 필드 모두 존재 | 기존 클라이언트 파싱 실패 |
| 2 | 기존 optional 필드 required 전환 안 함 | CreateWalletRequestSchema.environment는 optional | 기존 요청 Zod 검증 실패 |
| 3 | 기존 응답 형식 변경 안 함 | TxSendResponseSchema (id+status) 변경 없음 | 기존 SDK/MCP 파싱 실패 |
| 4 | 기존 HTTP status code 변경 안 함 | 201 (create), 200 (query) 유지 | 기존 에러 핸들링 오동작 |
| 5 | 기존 엔드포인트 URL 변경 안 함 | /v1/wallet/balance, /v1/wallet/assets 유지 | 기존 클라이언트 404 |

---

## 5. OpenAPI 스키마 변경 요약 + REST API 설계 결정

### 5.1 OpenAPI 스키마 변경 전수 목록

Phase 108에서 변경되는 Zod 스키마가 OpenAPI spec에 미치는 영향을 전수 나열한다. `openapi-schemas.ts`의 re-export 패턴(`XxxSchema.openapi('Xxx')`)에 의해 Zod 스키마 변경이 OpenAPI에 자동 반영된다.

#### 요청 스키마 변경 (8개)

| # | OpenAPI Component | 변경 내용 | 영향 |
|---|-------------------|---------|------|
| 1 | `TransferRequest` | `network` optional 필드 추가 | `properties.network: { enum: [...13 values] }` 추가 |
| 2 | `TokenTransferRequest` | `network` optional 필드 추가 | 동일 |
| 3 | `ContractCallRequest` | `network` optional 필드 추가 | 동일 |
| 4 | `ApproveRequest` | `network` optional 필드 추가 | 동일 |
| 5 | `BatchRequest` | `network` optional 필드 추가 (최상위) | 동일 |
| 6 | `SendTransactionRequest` | `network` optional 필드 추가 (legacy) | 동일 |
| 7 | `CreateWalletRequest` | `environment` optional 필드 추가 | `properties.environment: { enum: ['testnet', 'mainnet'] }` 추가 |
| 8 | `CreatePolicyRequest` | `network` optional 필드 추가 (Phase 107) | `properties.network: { enum: [...13 values] }` 추가 |

#### 응답 스키마 변경 (5개)

| # | OpenAPI Component | 변경 내용 | 영향 |
|---|-------------------|---------|------|
| 1 | `WalletCrudResponse` | `environment`, `defaultNetwork` 필드 추가 | 기존 `network` 유지 + 2 필드 추가 |
| 2 | `WalletDetailResponse` | `environment`, `defaultNetwork` 필드 추가 | 기존 `network` 유지 + 2 필드 추가 |
| 3 | `TxDetailResponse` | `network` nullable 필드 추가 | 실행된 네트워크 반환 |
| 4 | `PolicyResponse` | `network` nullable 필드 추가 (Phase 107) | 정책 네트워크 스코프 반환 |
| 5 | `MultiNetworkAssetsResponse` | 신규 스키마 | 멀티네트워크 잔액 집계 응답 |

#### 신규 OpenAPI 엔드포인트 (1개)

| # | 엔드포인트 | 인증 | 설명 |
|---|----------|------|------|
| 1 | GET /v1/wallets/:id/assets | masterAuth | 멀티네트워크 잔액 집계. `MultiNetworkAssetsResponse` 반환 |

#### 기존 엔드포인트 쿼리 파라미터 추가 (2개)

| # | 엔드포인트 | 추가 파라미터 | 설명 |
|---|----------|-------------|------|
| 1 | GET /v1/wallet/balance | `?network=string` (optional) | 특정 네트워크 잔액 조회 |
| 2 | GET /v1/wallet/assets | `?network=string` (optional) | 특정 네트워크 자산 조회 |

### 5.2 openapi-schemas.ts 코드 변경 요약

```typescript
// packages/daemon/src/api/routes/openapi-schemas.ts -- 변경 사항 요약

// 1. WalletCrudResponseSchema: environment, defaultNetwork 추가
// 2. WalletDetailResponseSchema: environment, defaultNetwork 추가
// 3. TxDetailResponseSchema: network nullable 추가
// 4. PolicyResponseSchema: network nullable 추가
// 5. MultiNetworkAssetsResponseSchema: 신규 스키마
// 6. WalletBalanceResponseSchema: 변경 없음 (route의 query param은 별도)
// 7. WalletAssetsResponseSchema: 변경 없음 (route의 query param은 별도)

// 요청 스키마는 core 패키지에서 변경 -> re-export 자동 반영:
// 8. TransferRequestOpenAPI -> network 필드 자동 포함
// 9. TokenTransferRequestOpenAPI -> network 필드 자동 포함
// 10. ContractCallRequestOpenAPI -> network 필드 자동 포함
// 11. ApproveRequestOpenAPI -> network 필드 자동 포함
// 12. BatchRequestOpenAPI -> network 필드 자동 포함
// 13. SendTransactionRequestOpenAPI -> network 필드 자동 포함
// 14. CreateWalletRequestOpenAPI -> environment 필드 자동 포함
// 15. CreatePolicyRequestOpenAPI -> network 필드 자동 포함
```

### 5.3 REST API 설계 결정

#### API-D01: environment optional + deriveEnvironment fallback (Breaking Change 방지)

| 항목 | 내용 |
|------|------|
| **결정** | `CreateWalletRequestSchema.environment`를 optional로 추가하고, 미지정 시 `deriveEnvironment(network)` 역추론 또는 체인 기본값(`testnet`)으로 자동 결정 |
| **근거** | 기존 API 호출 `{ name, chain, network }` 형식이 변경 없이 동작해야 함. environment를 required로 만들면 기존 모든 클라이언트(SDK, MCP, CLI, Admin UI)가 즉시 실패 |
| **대안** | environment를 required로 전환 + 전체 클라이언트 마이그레이션 |
| **기각 이유** | 동시 배포가 불가능하고, 하위호환 위반은 프로젝트 원칙(점진적 전환)에 반함 |

#### API-D02: 멀티네트워크 잔액을 별도 엔드포인트로 분리

| 항목 | 내용 |
|------|------|
| **결정** | 멀티네트워크 잔액 집계를 `GET /v1/wallets/:id/assets` (masterAuth) 별도 엔드포인트로 신설. 기존 `GET /v1/wallet/assets` (sessionAuth)는 단일 네트워크 조회 유지 |
| **근거** | (1) sessionAuth와 masterAuth는 사용 맥락이 다름 (에이전트 vs 관리자), (2) 기존 sessionAuth 응답 형식(`{ walletId, chain, network, assets }`)을 변경하면 기존 MCP 도구가 파싱 실패, (3) 멀티네트워크 집계는 2-5개 RPC 병렬 호출로 응답 시간이 김 (에이전트 시나리오에 부적합) |
| **대안** | 기존 `GET /v1/wallet/assets` 확장 (`?multi=true` 파라미터) |
| **기각 이유** | 기존 응답 형식 변경 위험 + sessionAuth로 멀티네트워크 노출은 보안 우려 |

#### API-D03: 트랜잭션 응답에 network 필드 추가

| 항목 | 내용 |
|------|------|
| **결정** | `TxDetailResponseSchema`에 `network: z.string().nullable()` 필드를 추가하여 트랜잭션이 실행된 네트워크를 응답에 포함 |
| **근거** | (1) 멀티네트워크 환경에서 "이 트랜잭션이 어떤 네트워크에서 실행되었는지" 추적이 필수, (2) `transactions` 테이블에 `network` 컬럼이 v6a 마이그레이션으로 추가되므로 DB 값을 그대로 노출, (3) nullable인 이유: 마이그레이션 이전 레코드의 network가 NULL일 수 있음 |
| **대안** | 응답에 network를 포함하지 않고 트랜잭션 상세 조회 시 월렛의 defaultNetwork를 반환 |
| **기각 이유** | 실제 실행 네트워크와 월렛 defaultNetwork가 다를 수 있음 (request-level override) |

#### API-D04: GET 엔드포인트는 query parameter, POST 엔드포인트는 body로 network 전달

| 항목 | 내용 |
|------|------|
| **결정** | GET 엔드포인트(`/wallet/balance`, `/wallet/assets`)는 `?network=X` 쿼리 파라미터, POST 엔드포인트(`/transactions/send`, `/wallets`)는 request body에 network 포함 |
| **근거** | (1) HTTP 표준: GET 요청은 body를 가지지 않으므로 쿼리 파라미터 사용, (2) POST 요청은 JSON body에 포함하는 것이 OpenAPIHono의 Zod 검증 패턴과 일관, (3) SDK/MCP에서 파라미터 전달 위치를 HTTP 메서드에 따라 명확히 구분해야 함 (Pitfall 5 방지) |
| **대안** | 모든 엔드포인트에서 헤더(`X-Network`)로 전달 |
| **기각 이유** | 비표준 헤더는 캐시/프록시 호환성 문제 + 기존 Zod 검증 패턴과 불일치 |

#### API-D05: WalletResponse에 기존 network 필드 유지 + environment, defaultNetwork 추가

| 항목 | 내용 |
|------|------|
| **결정** | `WalletCrudResponseSchema`와 `WalletDetailResponseSchema`에 기존 `network` 필드를 유지하면서 `environment`와 `defaultNetwork` 필드를 추가 |
| **근거** | (1) 기존 클라이언트가 `response.network`를 참조하므로 제거 불가, (2) `network` 값은 `defaultNetwork ?? getDefaultNetwork(chain, env)`로 계산 -- 기존과 동일한 값을 반환, (3) 향후 `network` 필드를 deprecated 처리하고 `defaultNetwork`로 전환 가능 (현재는 유지) |
| **대안** | `network` 필드를 `defaultNetwork`로 즉시 교체 (breaking change) |
| **기각 이유** | 기존 SDK/MCP/Admin UI 코드에서 `wallet.network` 참조하는 코드 전부 변경 필요 |

### 5.4 Phase 108-02 이행 포인트

Phase 108-01에서 확정된 REST API 설계를 Phase 108-02(MCP/SDK/CLI/Quickstart)에서 참조해야 하는 인터페이스 목록.

#### MCP 도구 (6개 변경)

| MCP 도구 | 참조하는 REST API | 변경 내용 |
|----------|------------------|---------|
| `send_token` | POST /v1/transactions/send | `network` optional 파라미터 추가 -> request body에 포함 |
| `call_contract` | POST /v1/transactions/send | `network` optional 파라미터 추가 -> request body에 포함 |
| `approve_token` | POST /v1/transactions/send | `network` optional 파라미터 추가 -> request body에 포함 |
| `send_batch` | POST /v1/transactions/send | `network` optional 파라미터 추가 -> request body에 포함 |
| `get_balance` | GET /v1/wallet/balance | `network` optional 파라미터 추가 -> `?network=X` 쿼리 파라미터 |
| `get_assets` | GET /v1/wallet/assets | `network` optional 파라미터 추가 -> `?network=X` 쿼리 파라미터 |

#### TS SDK (3개 변경)

| SDK 메서드 | 참조하는 REST API | 변경 내용 |
|-----------|------------------|---------|
| `sendToken(params)` | POST /v1/transactions/send | `SendTokenParams.network?: string` 추가 -> body에 포함 |
| `getBalance(network?)` | GET /v1/wallet/balance | `network?: string` 파라미터 추가 -> `?network=X` 쿼리 |
| `getAssets(network?)` | GET /v1/wallet/assets | `network?: string` 파라미터 추가 -> `?network=X` 쿼리 |

#### Python SDK (3개 변경)

| SDK 메서드 | 참조하는 REST API | 변경 내용 |
|-----------|------------------|---------|
| `send_token(params)` | POST /v1/transactions/send | `SendTokenRequest.network: Optional[str]` 추가 |
| `get_balance(network=None)` | GET /v1/wallet/balance | `network: Optional[str]` 파라미터 추가 |
| `get_assets(network=None)` | GET /v1/wallet/assets | `network: Optional[str]` 파라미터 추가 |

#### CLI (1개 신규)

| CLI 명령어 | 참조하는 REST API | 설명 |
|-----------|------------------|------|
| `waiaas quickstart --mode testnet/mainnet` | POST /v1/wallets (environment 파라미터) | Solana+EVM 2개 월렛 일괄 생성 + MCP 토큰 자동 생성 |

#### Skill Files (4개 변경)

| 스킬 파일 | 변경 내용 |
|----------|---------|
| `quickstart.skill.md` | environment 모델 기반 워크플로우 + quickstart CLI 명령어 설명 |
| `wallet.skill.md` | POST /v1/wallets environment 파라미터, 응답 변경, GET /v1/wallets/:id/assets 신규 |
| `transactions.skill.md` | 5-type network 파라미터, 트랜잭션 응답에 network 필드 |
| `policies.skill.md` | ALLOWED_NETWORKS 정책 타입, network 스코프 |

---

## 부록 A: 변경 대상 파일 전체 목록

### Core 패키지 (Zod SSoT)

| 파일 | 변경 유형 | 변경 내용 |
|------|---------|---------|
| `packages/core/src/schemas/transaction.schema.ts` | 수정 | 5-type + legacy 스키마에 `network: NetworkTypeEnum.optional()` 추가. TransactionSchema에 `network: NetworkTypeEnum.nullable()` 추가 |
| `packages/core/src/schemas/wallet.schema.ts` | 수정 | CreateWalletRequestSchema에 `environment` 추가. WalletSchema: `network` -> `environment` + `defaultNetwork` |

### Daemon 패키지 (Route + OpenAPI)

| 파일 | 변경 유형 | 변경 내용 |
|------|---------|---------|
| `packages/daemon/src/api/routes/openapi-schemas.ts` | 수정 | WalletCrudResponseSchema, WalletDetailResponseSchema, TxDetailResponseSchema 변경. MultiNetworkAssetsResponseSchema 신규 |
| `packages/daemon/src/api/routes/transactions.ts` | 수정 | resolveNetwork() 호출 + PipelineContext 변경 (Phase 106 설계 적용) |
| `packages/daemon/src/api/routes/wallets.ts` | 수정 | 4가지 조합 처리 + 응답에 environment/defaultNetwork 추가. GET /v1/wallets/:id/assets 신규 route |
| `packages/daemon/src/api/routes/wallet.ts` | 수정 | GET /wallet/balance, /wallet/assets에 `?network=` 쿼리 파라미터 + resolveNetwork() 호출 |

### Phase 108-02 범위 (참조 목록)

| 파일 | 변경 유형 | 변경 내용 |
|------|---------|---------|
| `packages/mcp/src/tools/send-token.ts` | 수정 | network optional 파라미터 추가 |
| `packages/mcp/src/tools/call-contract.ts` | 수정 | network optional 파라미터 추가 |
| `packages/mcp/src/tools/approve-token.ts` | 수정 | network optional 파라미터 추가 |
| `packages/mcp/src/tools/send-batch.ts` | 수정 | network optional 파라미터 추가 |
| `packages/mcp/src/tools/get-balance.ts` | 수정 | network optional 파라미터 추가 |
| `packages/mcp/src/tools/get-assets.ts` | 수정 | network optional 파라미터 추가 |
| `packages/sdk/src/types.ts` | 수정 | SendTokenParams.network 추가 |
| `packages/sdk/src/client.ts` | 수정 | getBalance/getAssets network 파라미터 |
| `python-sdk/waiaas/models.py` | 수정 | SendTokenRequest.network 추가 |
| `python-sdk/waiaas/client.py` | 수정 | get_balance/get_assets network 파라미터 |
| `packages/cli/src/commands/quickstart.ts` | 신규 | quickstart --mode testnet/mainnet |
| `skills/wallet.skill.md` | 수정 | environment/defaultNetwork + 멀티네트워크 |
| `skills/transactions.skill.md` | 수정 | network 파라미터 |
| `skills/policies.skill.md` | 수정 | ALLOWED_NETWORKS |
| `skills/quickstart.skill.md` | 수정 | environment 모델 + quickstart CLI |

## 부록 B: Phase 105-108 참조 다이어그램

```
Phase 105 (docs/68)              Phase 106 (docs/70)              Phase 107 (docs/71)
  EnvironmentType SSoT             resolveNetwork() 순수 함수        ALLOWED_NETWORKS PolicyType
  ENVIRONMENT_NETWORK_MAP          PipelineContext.resolvedNetwork   policies.network 스코프
  deriveEnvironment()              ENVIRONMENT_NETWORK_MISMATCH     evaluateAndReserve() SQL
  getDefaultNetwork()              Stage 1 INSERT network           resolveOverrides() 4단계
  validateNetworkEnvironment()
         |                                |                                |
         +--------------------------------+--------------------------------+
                                          |
                                          v
                                Phase 108 (docs/72) -- THIS DOCUMENT
                                  REST API 인터페이스 확장 (섹션 1~3)
                                  하위호환 전략 (섹션 4)
                                  OpenAPI + 설계 결정 (섹션 5)
                                          |
                                          v
                                Phase 108-02 (docs/72 섹션 6~10)
                                  MCP 도구 network 파라미터
                                  SDK 메서드 확장
                                  Quickstart CLI 워크플로우
                                  Skill 파일 동기화
```

---

## 6. MCP 도구 network 파라미터 추가 (API-04)

### 6.1 변경 대상 6개 도구

트랜잭션/잔액 관련 MCP 도구 6개에 `network` optional 파라미터를 추가한다. 변경하지 않는 4개 도구(get_address, get_wallets, get_wallet, create_wallet)는 월렛 메타데이터 조회/생성 도구로, 네트워크 선택이 불필요하다.

| # | 도구 | 카테고리 | REST API | network 전달 위치 |
|---|------|---------|----------|-----------------|
| 1 | send_token | 트랜잭션 | POST /v1/transactions/send | request body |
| 2 | call_contract | 트랜잭션 | POST /v1/transactions/send | request body |
| 3 | approve_token | 트랜잭션 | POST /v1/transactions/send | request body |
| 4 | send_batch | 트랜잭션 | POST /v1/transactions/send | request body |
| 5 | get_balance | 조회 | GET /v1/wallet/balance | query parameter |
| 6 | get_assets | 조회 | GET /v1/wallet/assets | query parameter |

변경하지 않는 도구:

| # | 도구 | 이유 |
|---|------|------|
| 1 | get_address | 월렛 주소는 네트워크 독립. 체인별 주소 파생이 동일 |
| 2 | get_wallets | 월렛 목록 조회. 네트워크 필터는 필요 없음 |
| 3 | get_wallet | 월렛 상세 조회. environment/defaultNetwork가 응답에 포함됨 |
| 4 | create_wallet | 월렛 생성 시 environment 파라미터는 별도 도구 또는 REST API 직접 사용 |

### 6.2 트랜잭션 도구 4개: network를 body에 포함

#### send_token

```typescript
// packages/mcp/src/tools/send-token.ts -- 변경 후

export function registerSendToken(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'send_token',
    withWalletPrefix('Send SOL/ETH or tokens from the wallet. For token transfers, specify type and token info.', walletContext?.walletName),
    {
      to: z.string().describe('Destination wallet address'),
      amount: z.string().describe('Amount in smallest unit (lamports/wei)'),
      memo: z.string().optional().describe('Optional transaction memo'),
      type: z.enum(['TRANSFER', 'TOKEN_TRANSFER']).optional()
        .describe('Transaction type. Default: TRANSFER (native). TOKEN_TRANSFER for SPL/ERC-20'),
      token: z.object({
        address: z.string().describe('Token mint (SPL) or contract address (ERC-20)'),
        decimals: z.number().describe('Token decimals (e.g., 6 for USDC)'),
        symbol: z.string().describe('Token symbol (e.g., USDC)'),
      }).optional().describe('Required for TOKEN_TRANSFER'),
      network: z.string().optional().describe(                      // NEW
        'Target network (e.g., devnet, ethereum-sepolia, polygon-amoy). '
        + 'If omitted, uses wallet\'s default network.'
      ),
    },
    async (args) => {
      const body: Record<string, unknown> = { to: args.to, amount: args.amount };
      if (args.memo !== undefined) body.memo = args.memo;
      if (args.type) body.type = args.type;
      if (args.token) body.token = args.token;
      if (args.network !== undefined) body.network = args.network;  // NEW
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
```

#### call_contract

```typescript
// packages/mcp/src/tools/call-contract.ts -- 변경 후

export function registerCallContract(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'call_contract',
    withWalletPrefix('Call a whitelisted smart contract. Requires CONTRACT_WHITELIST policy. For EVM: provide calldata (hex). For Solana: provide programId + instructionData + accounts.', walletContext?.walletName),
    {
      to: z.string().describe('Contract address'),
      calldata: z.string().optional().describe('Hex-encoded calldata (EVM)'),
      abi: z.array(z.record(z.unknown())).optional().describe('ABI fragment for decoding (EVM)'),
      value: z.string().optional().describe('Native token value in wei (EVM)'),
      programId: z.string().optional().describe('Program ID (Solana)'),
      instructionData: z.string().optional().describe('Base64-encoded instruction data (Solana)'),
      accounts: z.array(z.object({
        pubkey: z.string(),
        isSigner: z.boolean(),
        isWritable: z.boolean(),
      })).optional().describe('Account metas (Solana)'),
      network: z.string().optional().describe(                      // NEW
        'Target network (e.g., devnet, ethereum-sepolia, polygon-amoy). '
        + 'If omitted, uses wallet\'s default network.'
      ),
    },
    async (args) => {
      const body: Record<string, unknown> = { type: 'CONTRACT_CALL', to: args.to };
      if (args.calldata !== undefined) body.calldata = args.calldata;
      if (args.abi !== undefined) body.abi = args.abi;
      if (args.value !== undefined) body.value = args.value;
      if (args.programId !== undefined) body.programId = args.programId;
      if (args.instructionData !== undefined) body.instructionData = args.instructionData;
      if (args.accounts !== undefined) body.accounts = args.accounts;
      if (args.network !== undefined) body.network = args.network;  // NEW
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
```

#### approve_token

```typescript
// packages/mcp/src/tools/approve-token.ts -- 변경 후

export function registerApproveToken(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'approve_token',
    withWalletPrefix('Approve a spender to transfer tokens on your behalf. Requires APPROVED_SPENDERS policy.', walletContext?.walletName),
    {
      spender: z.string().describe('Spender address'),
      token: z.object({
        address: z.string().describe('Token mint (SPL) or contract address (ERC-20)'),
        decimals: z.number().describe('Token decimals (e.g., 6 for USDC)'),
        symbol: z.string().describe('Token symbol (e.g., USDC)'),
      }).describe('Token info'),
      amount: z.string().describe('Approval amount in smallest unit'),
      network: z.string().optional().describe(                      // NEW
        'Target network (e.g., devnet, ethereum-sepolia, polygon-amoy). '
        + 'If omitted, uses wallet\'s default network.'
      ),
    },
    async (args) => {
      const body: Record<string, unknown> = {
        type: 'APPROVE',
        spender: args.spender,
        token: args.token,
        amount: args.amount,
      };
      if (args.network !== undefined) body.network = args.network;  // NEW
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
```

#### send_batch

```typescript
// packages/mcp/src/tools/send-batch.ts -- 변경 후

export function registerSendBatch(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'send_batch',
    withWalletPrefix('Send multiple instructions in a single atomic transaction (Solana only, 2-20 instructions).', walletContext?.walletName),
    {
      instructions: z.array(z.record(z.unknown())).min(2).max(20)
        .describe('Array of instruction objects (each is a TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE without the type field)'),
      network: z.string().optional().describe(                      // NEW
        'Target network (e.g., devnet, testnet). '
        + 'If omitted, uses wallet\'s default network. '
        + 'All instructions execute on this single network.'
      ),
    },
    async (args) => {
      const body: Record<string, unknown> = {
        type: 'BATCH',
        instructions: args.instructions,
      };
      if (args.network !== undefined) body.network = args.network;  // NEW
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
```

### 6.3 조회 도구 2개: network를 query parameter로 전달

#### get_balance

```typescript
// packages/mcp/src/tools/get-balance.ts -- 변경 후

import { z } from 'zod';                                            // NEW: Zod import 추가

export function registerGetBalance(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'get_balance',
    withWalletPrefix('Get the current balance of the wallet.', walletContext?.walletName),
    {
      network: z.string().optional().describe(                      // NEW
        'Target network to check balance (e.g., devnet, ethereum-sepolia, polygon-amoy). '
        + 'If omitted, uses wallet\'s default network.'
      ),
    },
    async (args) => {
      // GET 엔드포인트이므로 query parameter로 전달
      const query = args.network ? `?network=${encodeURIComponent(args.network)}` : '';
      const result = await apiClient.get(`/v1/wallet/balance${query}`);
      return toToolResult(result);
    },
  );
}
```

**변경 포인트:** 기존 `get_balance`는 파라미터가 없는 도구였다 (Zod 스키마 없이 `async () => { ... }` 형태). `network` optional 파라미터를 추가하면서 Zod 입력 스키마 객체를 추가한다. 파라미터 없이 호출하면 `args.network`는 `undefined`이므로 기존 동작과 동일하다.

#### get_assets

```typescript
// packages/mcp/src/tools/get-assets.ts -- 변경 후

import { z } from 'zod';                                            // NEW: Zod import 추가

export function registerGetAssets(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'get_assets',
    withWalletPrefix('Get all assets (native + tokens) held by the wallet.', walletContext?.walletName),
    {
      network: z.string().optional().describe(                      // NEW
        'Target network to check assets (e.g., devnet, ethereum-sepolia, polygon-amoy). '
        + 'If omitted, uses wallet\'s default network.'
      ),
    },
    async (args) => {
      // GET 엔드포인트이므로 query parameter로 전달
      const query = args.network ? `?network=${encodeURIComponent(args.network)}` : '';
      const result = await apiClient.get(`/v1/wallet/assets${query}`);
      return toToolResult(result);
    },
  );
}
```

### 6.4 MCP 리소스로 월렛 환경 정보 노출

LLM이 현재 월렛의 환경과 기본 네트워크를 파악할 수 있도록 MCP 리소스를 활용한다. 이미 `get_wallet` 도구가 월렛 상세 정보를 반환하지만, Phase 108 이후 응답에 `environment`와 `defaultNetwork`가 포함되므로 LLM이 현재 컨텍스트를 파악할 수 있다.

```typescript
// MCP 리소스 추가는 별도 구현 범위이지만, 설계 참고용으로 기록:
// server.resource('wallet-context', 'waiaas://wallet/context', async () => {
//   const walletInfo = await apiClient.get('/v1/wallet/info');
//   return {
//     contents: [{
//       uri: 'waiaas://wallet/context',
//       mimeType: 'application/json',
//       text: JSON.stringify({
//         chain: walletInfo.chain,
//         environment: walletInfo.environment,
//         defaultNetwork: walletInfo.defaultNetwork,
//         availableNetworks: walletInfo.availableNetworks,
//       }),
//     }],
//   };
// });
```

**현재 설계:** MCP 리소스 추가는 v1.4.6 구현 범위에서 선택적으로 진행한다. 우선은 `get_wallet` 도구 응답에 포함되는 `environment`/`defaultNetwork` 필드로 LLM이 컨텍스트를 파악한다.

### 6.5 network description 가이드 (LLM 혼란 방지)

MCP 도구의 `network` 파라미터 description은 LLM이 올바르게 사용하도록 3가지 원칙을 따른다:

| # | 원칙 | description 텍스트 패턴 | 이유 |
|---|------|----------------------|------|
| 1 | 기본값 명시 | "If omitted, uses wallet's default network" | LLM이 매번 network를 명시하는 것을 방지 |
| 2 | 예시 네트워크 포함 | "e.g., devnet, ethereum-sepolia, polygon-amoy" | LLM이 유효한 네트워크명을 추론 가능 |
| 3 | 특이사항 명시 (send_batch) | "All instructions execute on this single network" | BATCH 도구의 단일 네트워크 제약 설명 |

**설계 결정 API-D06:** MCP network description에 "omit for default" 명시 (LLM 혼란 방지). LLM이 network를 optional로 인식하여 불필요한 network 지정을 줄이고, 기존 동작(월렛 기본 네트워크)을 자연스럽게 활용하도록 유도한다.

---

## 7. TS SDK 확장 설계 (API-04)

### 7.1 SendTokenParams 인터페이스 확장

```typescript
// packages/sdk/src/types.ts -- 변경 후

export interface SendTokenParams {
  to?: string;
  amount?: string;
  memo?: string;
  type?: 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE' | 'BATCH';
  token?: TokenInfo;
  // CONTRACT_CALL fields
  calldata?: string;
  abi?: Record<string, unknown>[];
  value?: string;
  programId?: string;
  instructionData?: string;
  accounts?: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  // APPROVE fields
  spender?: string;
  // BATCH fields
  instructions?: Array<Record<string, unknown>>;
  // Network selection (Phase 108)
  network?: string;  // NEW: 트랜잭션별 네트워크 선택. 미지정 시 월렛 기본 네트워크
}
```

**하위호환:** `network`는 optional이므로 기존 `sendToken({ to, amount })` 호출이 변경 없이 동작한다. `network`는 `SendTokenParams` 전체를 `body`로 POST하므로 자동으로 request body에 포함된다.

### 7.2 WAIaaSClient.sendToken() 변경

```typescript
// packages/sdk/src/client.ts -- sendToken 메서드 (변경 없음)

async sendToken(params: SendTokenParams): Promise<SendTokenResponse> {
  validateSendToken(params);
  return withRetry(
    () => this.http.post<SendTokenResponse>(
      '/v1/transactions/send',
      params,                    // params에 network가 포함되면 body에 자동 전달
      this.authHeaders(),
    ),
    this.retryOptions,
  );
}
```

`sendToken()` 메서드 자체는 변경 불필요하다. `params` 객체를 그대로 body로 전달하므로 `SendTokenParams.network`가 추가되면 자동으로 body에 포함된다. `validateSendToken()`에서 network 검증이 필요하면 `validation.ts`에 추가한다.

### 7.3 WAIaaSClient.getBalance(network?) 확장

```typescript
// packages/sdk/src/client.ts -- getBalance 메서드 변경 후

async getBalance(network?: string): Promise<BalanceResponse> {
  // GET 엔드포인트이므로 query parameter로 전달
  const query = network ? `?network=${encodeURIComponent(network)}` : '';
  return withRetry(
    () => this.http.get<BalanceResponse>(
      `/v1/wallet/balance${query}`,
      this.authHeaders(),
    ),
    this.retryOptions,
  );
}
```

**변경 포인트:** 기존 `getBalance()`는 파라미터가 없었다. `network?: string` optional 파라미터를 추가하고, 지정 시 `?network=X` 쿼리 파라미터로 전달한다. 미지정 시 기존 URL과 동일(`/v1/wallet/balance`)하므로 하위호환 유지.

### 7.4 WAIaaSClient.getAssets(network?) 확장

```typescript
// packages/sdk/src/client.ts -- getAssets 메서드 변경 후

async getAssets(network?: string): Promise<AssetsResponse> {
  // GET 엔드포인트이므로 query parameter로 전달
  const query = network ? `?network=${encodeURIComponent(network)}` : '';
  return withRetry(
    () => this.http.get<AssetsResponse>(
      `/v1/wallet/assets${query}`,
      this.authHeaders(),
    ),
    this.retryOptions,
  );
}
```

**변경 포인트:** `getBalance()`와 동일 패턴. `network` 미지정 시 기존 동작 유지.

### 7.5 응답 타입 확장

```typescript
// packages/sdk/src/types.ts -- 응답 타입 변경 후

export interface BalanceResponse {
  walletId: string;
  chain: string;
  network: string;           // 기존 유지 (실제 조회된 네트워크)
  address: string;
  balance: string;
  decimals: number;
  symbol: string;
}

export interface AddressResponse {
  walletId: string;
  chain: string;
  network: string;           // 기존 유지
  address: string;
}

export interface AssetsResponse {
  walletId: string;
  chain: string;
  network: string;           // 기존 유지 (실제 조회된 네트워크)
  assets: AssetInfo[];
}

// 트랜잭션 응답에 network 추가
export interface TransactionResponse {
  id: string;
  walletId: string;
  type: string;
  status: string;
  tier: string | null;
  chain: string;
  network: string | null;   // NEW: 실행된 네트워크 (nullable, 마이그레이션 이전 레코드)
  toAddress: string | null;
  amount: string | null;
  txHash: string | null;
  error: string | null;
  createdAt: number | null;
}
```

**WalletResponse 타입 추가 (신규):**

```typescript
// packages/sdk/src/types.ts -- WalletResponse 신규 (또는 기존 미정의 타입)

export interface WalletResponse {
  id: string;
  name: string;
  chain: string;
  network: string;                    // 기존 유지 (하위호환)
  environment: string;                // NEW: 'testnet' | 'mainnet'
  defaultNetwork: string | null;      // NEW: 월렛 기본 네트워크
  publicKey: string;
  status: string;
  createdAt: number;
}
```

### 7.6 하위호환 증명

```
기존 호출:
  const client = new WAIaaSClient({ baseUrl, sessionToken });
  const balance = await client.getBalance();           // network 미지정
  const tx = await client.sendToken({ to, amount });   // network 미지정

변경 후:
  const balance = await client.getBalance();           // 동일 동작 (query 없음)
  const balance2 = await client.getBalance('polygon-amoy');  // 신규 기능

  const tx = await client.sendToken({ to, amount });   // 동일 동작 (body에 network 없음)
  const tx2 = await client.sendToken({ to, amount, network: 'polygon-amoy' });  // 신규 기능

결과: 기존 코드 변경 없이 동작. 새 파라미터는 선택적. QED
```

---

## 8. Python SDK 확장 설계 (API-04)

### 8.1 SendTokenRequest Pydantic 모델 확장

```python
# python-sdk/waiaas/models.py -- 변경 후

class SendTokenRequest(BaseModel):
    """Request body for POST /v1/transactions/send (5-type support)."""

    to: Optional[str] = None
    amount: Optional[str] = None
    memo: Optional[str] = None
    type: Optional[str] = None
    token: Optional[TokenInfo] = None
    # CONTRACT_CALL fields
    calldata: Optional[str] = None
    abi: Optional[list[dict[str, Any]]] = None
    value: Optional[str] = None
    program_id: Optional[str] = Field(default=None, alias="programId")
    instruction_data: Optional[str] = Field(default=None, alias="instructionData")
    accounts: Optional[list[dict[str, Any]]] = None
    # APPROVE fields
    spender: Optional[str] = None
    # BATCH fields
    instructions: Optional[list[dict[str, Any]]] = None
    # Network selection (Phase 108)
    network: Optional[str] = None  # NEW: 트랜잭션별 네트워크 선택

    model_config = {"populate_by_name": True}
```

### 8.2 WAIaaSClient.send_token() 변경

```python
# python-sdk/waiaas/client.py -- send_token 메서드 (변경 없음)

async def send_token(
    self,
    to: Optional[str] = None,
    amount: Optional[str] = None,
    *,
    memo: Optional[str] = None,
    type: Optional[str] = None,
    token: Optional[dict[str, Any]] = None,
    network: Optional[str] = None,          # NEW
    **kwargs: Any,
) -> TransactionResponse:
    """POST /v1/transactions/send -- Send transaction (5-type support).

    Args:
        to: Recipient/contract address.
        amount: Amount in base units (lamports/wei).
        memo: Optional memo string.
        type: Transaction type (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH).
        token: Token info dict with address, decimals, symbol.
        network: Target network (e.g., 'devnet', 'ethereum-sepolia'). Omit for wallet default.
        **kwargs: Additional fields (calldata, spender, instructions, etc.).

    Returns:
        TransactionResponse with id and status.
    """
    token_obj = TokenInfo(**token) if isinstance(token, dict) else token
    request = SendTokenRequest(
        to=to, amount=amount, memo=memo, type=type,
        token=token_obj, network=network, **kwargs,    # network 전달
    )
    body = request.model_dump(exclude_none=True, by_alias=True)
    resp = await self._request("POST", "/v1/transactions/send", json_body=body)
    return TransactionResponse.model_validate(resp.json())
```

**하위호환:** `network` 파라미터는 `Optional[str] = None`이므로 기존 `client.send_token(to="...", amount="...")` 호출이 동일하게 동작한다. `exclude_none=True`로 직렬화하면 `network=None`인 경우 body에 포함되지 않는다.

### 8.3 WAIaaSClient.get_balance(network?) 확장

```python
# python-sdk/waiaas/client.py -- get_balance 메서드 변경 후

async def get_balance(self, network: Optional[str] = None) -> WalletBalance:
    """GET /v1/wallet/balance -- Get wallet balance.

    Args:
        network: Target network to check balance (e.g., 'devnet', 'ethereum-sepolia').
                 If omitted, uses wallet's default network.
    """
    params = {}
    if network is not None:
        params["network"] = network
    resp = await self._request("GET", "/v1/wallet/balance", params=params or None)
    return WalletBalance.model_validate(resp.json())
```

**변경 포인트:** 기존 `get_balance()`는 파라미터가 없었다. `network: Optional[str] = None` 파라미터를 추가하고, 지정 시 `params={"network": "..."}` 딕셔너리를 전달한다. `_request()` 메서드가 `params` 인자를 이미 지원하므로 httpx가 `?network=X` 쿼리 파라미터를 자동 생성한다.

### 8.4 WAIaaSClient.get_assets(network?) 확장

```python
# python-sdk/waiaas/client.py -- get_assets 메서드 변경 후

async def get_assets(self, network: Optional[str] = None) -> WalletAssets:
    """GET /v1/wallet/assets -- Get all assets held by wallet.

    Args:
        network: Target network to check assets (e.g., 'devnet', 'ethereum-sepolia').
                 If omitted, uses wallet's default network.
    """
    params = {}
    if network is not None:
        params["network"] = network
    resp = await self._request("GET", "/v1/wallet/assets", params=params or None)
    return WalletAssets.model_validate(resp.json())
```

### 8.5 응답 모델 확장

```python
# python-sdk/waiaas/models.py -- 응답 모델 변경 후

class TransactionDetail(BaseModel):
    """Response from GET /v1/transactions/:id."""

    id: str
    wallet_id: str = Field(alias="walletId")
    type: str
    status: str
    tier: Optional[str] = None
    chain: str
    network: Optional[str] = None       # NEW: 실행된 네트워크 (nullable)
    to_address: Optional[str] = Field(default=None, alias="toAddress")
    amount: Optional[str] = None
    tx_hash: Optional[str] = Field(default=None, alias="txHash")
    error: Optional[str] = None
    created_at: Optional[int] = Field(default=None, alias="createdAt")

    model_config = {"populate_by_name": True}
```

**WalletResponse 모델 추가 (신규):**

```python
# python-sdk/waiaas/models.py -- WalletResponse 신규

class WalletResponse(BaseModel):
    """Response from GET /v1/wallets/:id or POST /v1/wallets."""

    id: str
    name: str
    chain: str
    network: str                                    # 기존 유지 (하위호환)
    environment: str                                # NEW: 'testnet' | 'mainnet'
    default_network: Optional[str] = Field(default=None, alias="defaultNetwork")  # NEW
    public_key: str = Field(alias="publicKey")
    status: str
    created_at: int = Field(alias="createdAt")

    model_config = {"populate_by_name": True}
```

### 8.6 하위호환 증명

```python
# 기존 호출 (변경 없이 동작):
async with WAIaaSClient("http://localhost:3000", "wai_sess_xxx") as client:
    balance = await client.get_balance()               # network 미지정 -> 기존 동작
    assets = await client.get_assets()                 # network 미지정 -> 기존 동작
    tx = await client.send_token(to="addr", amount="1000")  # network 미지정 -> 기존 동작

# 신규 기능 (network 지정):
async with WAIaaSClient("http://localhost:3000", "wai_sess_xxx") as client:
    balance = await client.get_balance(network="polygon-amoy")
    assets = await client.get_assets(network="ethereum-sepolia")
    tx = await client.send_token(to="addr", amount="1000", network="polygon-amoy")
```

### 8.7 3개 인터페이스 network 전달 패턴 비교

| 메서드 | MCP 도구 | TS SDK | Python SDK | REST API |
|--------|----------|--------|------------|----------|
| 토큰 전송 | `send_token({ network: "X" })` -> body.network | `sendToken({ network: "X" })` -> body.network | `send_token(network="X")` -> body.network | POST body.network |
| 잔액 조회 | `get_balance({ network: "X" })` -> `?network=X` | `getBalance("X")` -> `?network=X` | `get_balance(network="X")` -> `?network=X` | GET `?network=X` |
| 자산 조회 | `get_assets({ network: "X" })` -> `?network=X` | `getAssets("X")` -> `?network=X` | `get_assets(network="X")` -> `?network=X` | GET `?network=X` |

**일관성:** POST 엔드포인트는 body, GET 엔드포인트는 query parameter. 3개 인터페이스 모두 동일한 REST API 전달 패턴을 따른다 (설계 결정 API-D04).
