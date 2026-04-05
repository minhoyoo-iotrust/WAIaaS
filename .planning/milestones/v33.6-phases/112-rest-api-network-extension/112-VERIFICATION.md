---
phase: 112-rest-api-network-extension
verified: 2026-02-14T13:02:00Z
status: passed
score: 11/11
re_verification: false
---

# Phase 112: REST API 네트워크 확장 Verification Report

**Phase Goal**: REST API가 환경/네트워크 파라미터를 수용하고, 월렛별 네트워크 관리 엔드포인트가 동작하는 상태
**Verified**: 2026-02-14T13:02:00Z
**Status**: passed
**Re-verification**: No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /v1/wallets에 environment 파라미터로 testnet/mainnet 월렛을 생성할 수 있고, 미지정 시 testnet 기본값이 적용된다 | ✓ VERIFIED | CreateWalletRequestSchema에 `environment: EnvironmentTypeEnum.default('testnet')` 존재. 8개 테스트에서 environment 파라미터 사용 확인. |
| 2 | POST /v1/transactions/send에 network 파라미터로 특정 네트워크를 지정하여 트랜잭션을 실행할 수 있다 | ✓ VERIFIED | 5-type 스키마 전체에 `network: NetworkTypeEnum.optional()` 존재. transactions.ts handler에서 resolveNetwork() 호출 (line 259). |
| 3 | GET /v1/wallets/:id/balance?network=polygon-mainnet으로 특정 네트워크 잔액을 조회할 수 있다 | ✓ VERIFIED | walletBalanceRoute에 `query: z.object({ network: z.string().optional() })` 정의. Handler에서 queryNetwork ?? wallet.defaultNetwork fallback 로직 (line 154-155). validateNetworkEnvironment 교차 검증 (line 160). |
| 4 | GET /v1/wallets/:id/balance에 network 미지정 시 wallet.defaultNetwork 잔액이 반환된다 (하위호환) | ✓ VERIFIED | wallet.ts line 155: `targetNetwork = queryNetwork ?? wallet.defaultNetwork!` 패턴 확인. |
| 5 | GET /v1/wallets/:id/assets?network=polygon-mainnet으로 특정 네트워크 자산 목록을 조회할 수 있다 | ✓ VERIFIED | walletAssetsRoute에 동일한 query schema. Handler line 214-215에 동일한 queryNetwork 로직. |
| 6 | PUT /v1/wallets/:id/default-network로 기본 네트워크를 변경할 수 있다 | ✓ VERIFIED | updateDefaultNetworkRoute 정의 (line 171-189). Handler에서 validateNetworkEnvironment 호출 후 DB UPDATE (wallets.ts line 544). 3개 테스트 PASS. |
| 7 | PUT /v1/wallets/:id/default-network에서 환경 불일치 네트워크 지정 시 ENVIRONMENT_NETWORK_MISMATCH 에러가 반환된다 | ✓ VERIFIED | Handler line 543-557에서 validateNetworkEnvironment catch → ENVIRONMENT_NETWORK_MISMATCH 에러. 테스트 "should return ENVIRONMENT_NETWORK_MISMATCH for testnet wallet with mainnet network" PASS. |
| 8 | GET /v1/wallets/:id/networks로 사용 가능 네트워크 목록을 조회할 수 있다 | ✓ VERIFIED | walletNetworksRoute 정의 (line 193-207). Handler에서 getNetworksForEnvironment 호출 (line 593). 응답에 availableNetworks + isDefault 플래그. 2개 테스트 PASS. |
| 9 | 트랜잭션 목록/상세 API 응답에 network 필드가 포함된다 | ✓ VERIFIED | TxDetailResponseSchema에 `network: z.string().nullable()` 추가 (openapi-schemas.ts line 177). transactions.ts 3개 엔드포인트(list/pending/detail)에서 `network: tx.network ?? null` 반환. |
| 10 | POST /v1/wallets 응답에 environment 필드가 포함된다 | ✓ VERIFIED | WalletCrudResponseSchema에 `environment: z.string()` 필드 required (openapi-schemas.ts line 67). wallets.ts POST handler에서 environment 반환. |
| 11 | ALLOWED_NETWORKS 정책을 REST API로 CRUD 할 수 있다 | ✓ VERIFIED | api-wallet-network.test.ts에 3개 CRUD 테스트 PASS: POST /v1/policies (create), GET /v1/policies (read), DELETE /v1/policies/:id (delete). |

**Score**: 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/api/routes/wallet.ts` | balance/assets 엔드포인트 network 쿼리 파라미터 | ✓ VERIFIED | Line 80-82 (balanceRoute query), line 99-101 (assetsRoute query). Handler에서 queryNetwork 변수 사용 + validateNetworkEnvironment 교차 검증. |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | network 필드 포함 응답 스키마 | ✓ VERIFIED | TxDetailResponseSchema에 network 필드 (line 177). WalletCrudResponseSchema에 environment 필드 (line 67). UpdateDefaultNetworkRequest/Response + WalletNetworksResponse 3개 스키마 추가. |
| `packages/daemon/src/api/routes/wallets.ts` | PUT /wallets/:id/default-network + GET /wallets/:id/networks 엔드포인트 | ✓ VERIFIED | updateDefaultNetworkRoute (line 171-189) + walletNetworksRoute (line 193-207) 정의. getNetworksForEnvironment + validateNetworkEnvironment 임포트 및 사용. |
| `packages/daemon/src/api/routes/transactions.ts` | 트랜잭션 응답 network 필드 | ✓ VERIFIED | Line 408, 449, 494에서 `network: tx.network ?? null` 반환. resolveNetwork 함수 호출 (line 259). |
| `packages/daemon/src/api/server.ts` | masterAuth 미들웨어 등록 | ✓ VERIFIED | Line 139에서 /default-network, /networks sub-path skip. Line 151-152에서 masterAuth 등록. |
| `packages/daemon/src/__tests__/api-wallet-network.test.ts` | 신규 엔드포인트 통합 테스트 | ✓ VERIFIED | 8개 테스트 정의 및 PASS. PUT default-network 3개 + GET networks 2개 + ALLOWED_NETWORKS CRUD 3개. |
| `packages/core/src/schemas/wallet.schema.ts` | CreateWalletRequestSchema environment 파라미터 | ✓ VERIFIED | Line 27: `environment: EnvironmentTypeEnum.default('testnet')`. |
| `packages/core/src/schemas/transaction.schema.ts` | TransactionRequestSchema network 파라미터 | ✓ VERIFIED | 5-type 스키마 전체에 `network: NetworkTypeEnum.optional()` 추가 (line 49, 67, 91, 101, 119). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| packages/daemon/src/api/routes/wallet.ts | resolveRpcUrl + adapterPool.resolve | network query param -> resolveRpcUrl(config, chain, network) | ✓ WIRED | Line 172-181 (balance), line 232-241 (assets). targetNetwork 변수를 resolveRpcUrl + adapterPool.resolve에 전달. |
| packages/daemon/src/api/routes/wallets.ts | @waiaas/core getNetworksForEnvironment | import getNetworksForEnvironment | ✓ WIRED | Line 20 import. Line 593 호출: `getNetworksForEnvironment(wallet.chain, wallet.environment)`. |
| packages/daemon/src/api/routes/wallets.ts | @waiaas/core validateNetworkEnvironment | import validateNetworkEnvironment | ✓ WIRED | Line 20 import. Line 544 호출: `validateNetworkEnvironment(wallet.chain, wallet.environment, body.network)`. |
| packages/daemon/src/api/server.ts | wallets.ts new routes | masterAuth middleware for new paths | ✓ WIRED | Line 139 skip 조건 + line 151-152 masterAuth 등록. |
| packages/daemon/src/api/routes/transactions.ts | resolveNetwork (pipeline) | network 파라미터 -> resolveNetwork() | ✓ WIRED | Line 44 import. Line 259-264: `resolveNetwork(request.network, wallet.defaultNetwork, wallet.environment, wallet.chain)`. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| API-01: POST /v1/wallets environment 파라미터 | ✓ SATISFIED | None. CreateWalletRequestSchema에 environment 기본값 testnet. |
| API-02: POST /v1/transactions/send network 파라미터 | ✓ SATISFIED | None. 5-type 스키마 전체 지원 + resolveNetwork 호출. |
| API-03: GET balance/assets network 쿼리 파라미터 | ✓ SATISFIED | None. query schema + handler 로직 + validateNetworkEnvironment 교차 검증. |
| API-04: PUT /wallets/:id/default-network | ✓ SATISFIED | None. 엔드포인트 + 테스트 3개 PASS. |
| API-05: GET /wallets/:id/networks | ✓ SATISFIED | None. 엔드포인트 + 테스트 2개 PASS. |
| API-06: ALLOWED_NETWORKS 정책 CRUD | ✓ SATISFIED | None. 기존 policies 엔드포인트로 동작. 테스트 3개 PASS. |

### Anti-Patterns Found

No anti-patterns detected. All modified files were scanned for:
- TODO/FIXME/PLACEHOLDER comments: None found
- Empty implementations (return null/{}): None found
- Console.log only handlers: None found

### Human Verification Required

None. All observable truths are verified programmatically through:
1. Schema definitions (Zod validation)
2. Route handlers with business logic
3. Integration tests (8 tests covering all new endpoints)
4. Full test suite regression (847 tests PASS)

---

## Detailed Verification Evidence

### Success Criterion 1: POST /v1/wallets environment parameter

**Schema Definition**:
```typescript
// packages/core/src/schemas/wallet.schema.ts (line 24-28)
export const CreateWalletRequestSchema = z.object({
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum.default('solana'),
  environment: EnvironmentTypeEnum.default('testnet'),
});
```

**Response Schema**:
```typescript
// packages/daemon/src/api/routes/openapi-schemas.ts (line 63-72)
export const WalletCrudResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    chain: z.string(),
    network: z.string(),
    environment: z.string(),  // required field
    publicKey: z.string(),
    status: z.string(),
    createdAt: z.number().int(),
  })
  .openapi('WalletCrudResponse');
```

**Test Evidence**: api-wallet-network.test.ts에서 8개 테스트 모두 environment 파라미터를 사용하여 월렛 생성.

### Success Criterion 2: POST /v1/transactions/send network parameter

**Schema Definition**:
```typescript
// All 5 transaction types support network parameter
// packages/core/src/schemas/transaction.schema.ts
TransferRequestSchema: network: NetworkTypeEnum.optional() (line 49)
TokenTransferRequestSchema: network: NetworkTypeEnum.optional() (line 67)
ContractCallRequestSchema: network: NetworkTypeEnum.optional() (line 91)
ApproveRequestSchema: network: NetworkTypeEnum.optional() (line 101)
BatchRequestSchema: network: NetworkTypeEnum.optional() (line 119)
```

**Handler Integration**:
```typescript
// packages/daemon/src/api/routes/transactions.ts (line 256-279)
// Resolve network: request > wallet.defaultNetwork > environment default
let resolvedNetwork: string;
try {
  resolvedNetwork = resolveNetwork(
    request.network as NetworkType | undefined,
    wallet.defaultNetwork as NetworkType | null,
    wallet.environment as EnvironmentType,
    wallet.chain as ChainType,
  );
} catch (err) {
  if (err instanceof Error && err.message.includes('environment')) {
    // Security logging for environment-network mismatch
    throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', {
      message: err.message,
    });
  }
  throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
    message: err instanceof Error ? err.message : 'Network validation failed',
  });
}
```

### Success Criterion 3: GET /v1/wallet/balance?network=X

**Route Definition**:
```typescript
// packages/daemon/src/api/routes/wallet.ts (line 74-91)
const walletBalanceRoute = createRoute({
  method: 'get',
  path: '/wallet/balance',
  tags: ['Wallet'],
  summary: 'Get wallet balance',
  request: {
    query: z.object({
      network: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Wallet balance',
      content: { 'application/json': { schema: WalletBalanceResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'CHAIN_ERROR']),
  },
});
```

**Handler Logic**:
```typescript
// packages/daemon/src/api/routes/wallet.ts (line 153-169)
// network query parameter -> specific network, fallback to wallet.defaultNetwork
const { network: queryNetwork } = c.req.valid('query');
const targetNetwork = queryNetwork ?? wallet.defaultNetwork!;

// Validate network-environment compatibility when query param specified
if (queryNetwork) {
  try {
    validateNetworkEnvironment(
      wallet.chain as ChainType,
      wallet.environment as EnvironmentType,
      queryNetwork as NetworkType,
    );
  } catch (err) {
    throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', {
      message: err instanceof Error ? err.message : 'Network validation failed',
    });
  }
}
```

### Success Criterion 4: PUT /v1/wallets/:id/default-network

**Route Definition**:
```typescript
// packages/daemon/src/api/routes/wallets.ts (line 171-189)
const updateDefaultNetworkRoute = createRoute({
  method: 'put',
  path: '/wallets/{id}/default-network',
  tags: ['Wallets'],
  summary: 'Update wallet default network',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': { schema: UpdateDefaultNetworkRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Default network updated',
      content: { 'application/json': { schema: UpdateDefaultNetworkResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'ENVIRONMENT_NETWORK_MISMATCH']),
  },
});
```

**Test Evidence**:
- "should change default network for ethereum testnet wallet" ✓ PASS
- "should return ENVIRONMENT_NETWORK_MISMATCH for testnet wallet with mainnet network" ✓ PASS
- "should return 404 for non-existent wallet" ✓ PASS

### Success Criterion 5: ALLOWED_NETWORKS policy CRUD

**Test Evidence**:
- "POST /v1/policies should create ALLOWED_NETWORKS policy" ✓ PASS
- "GET /v1/policies should include created ALLOWED_NETWORKS policy" ✓ PASS
- "DELETE /v1/policies/:id should delete ALLOWED_NETWORKS policy" ✓ PASS

**Policy Schema** (already existed in Phase 110):
```typescript
// @waiaas/core PolicyRulesSchema supports ALLOWED_NETWORKS type
// Verified by existing policies API + new integration tests
```

---

## Build and Test Verification

### Full Build Status
```
pnpm build
Tasks:    8 successful, 8 total
Cached:    8 cached, 8 total
Time:    270ms >>> FULL TURBO
```

### Test Status
```
Test Files  55 passed (55)
Tests  847 passed (847)
```

### New Test File
```
api-wallet-network.test.ts (8 tests) PASS
  - PUT /v1/wallets/:id/default-network (3 tests)
  - GET /v1/wallets/:id/networks (2 tests)
  - ALLOWED_NETWORKS Policy CRUD (3 tests)
```

### Pre-existing Test Fixes
112-01 fixed 6 pre-existing failures in api-agents.test.ts by updating tests to use environment-based validation.

---

## Phase Completion Summary

**Duration**: 10 minutes (112-01: 6min + 112-02: 4min)
**Plans**: 2 plans executed
**Tasks**: 4 tasks completed (2 per plan)
**Files Modified**: 8 files
**Tests Added**: 8 integration tests
**Commits**: 4 atomic commits (2 per plan)

**Phase Goal**: ✓ ACHIEVED

REST API가 환경/네트워크 파라미터를 수용하고, 월렛별 네트워크 관리 엔드포인트가 동작하는 상태 확인. 모든 success criteria 충족.

**Next Phase Readiness**: Phase 112 완료. MCP/SDK/Skills 동기화 준비 완료.

---

_Verified: 2026-02-14T13:02:00Z_
_Verifier: Claude (gsd-verifier)_
