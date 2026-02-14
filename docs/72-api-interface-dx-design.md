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
