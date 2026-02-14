# Phase 108: API/인터페이스 + DX 설계 - Research

**Researched:** 2026-02-14
**Domain:** REST API / MCP / SDK / CLI 인터페이스 확장 + 하위호환 + Quickstart DX
**Confidence:** HIGH

## Summary

Phase 108은 Phase 105(환경 모델), 106(파이프라인 리졸브), 107(정책 네트워크 확장) 설계 결과를 REST API, MCP, TS SDK, Python SDK, CLI의 외부 인터페이스에 반영하는 설계이다. 핵심은 (1) POST /v1/transactions/send에 `network` 선택 파라미터 추가, (2) POST /v1/wallets에 `environment` 파라미터 추가 + `network` -> `defaultNetwork` 전환, (3) GET /v1/wallet/assets를 멀티네트워크 잔액 집계로 확장, (4) MCP 10개 도구와 SDK 메서드에 `network` 파라미터 일관 추가, (5) 기존 클라이언트 하위호환 전략(network 미지정 시 기존 동작 유지), (6) quickstart --mode testnet/mainnet 워크플로우 설계이다.

현재 코드베이스의 인터페이스 스택은 OpenAPIHono + Zod SSoT(core) -> OpenAPI 스키마(daemon) -> REST API -> MCP 도구(10개) -> TS SDK(WAIaaSClient) -> Python SDK(WAIaaSClient) 순서로 파생되므로, 변경은 Zod 스키마에서 시작하여 모든 레이어에 일관되게 전파되어야 한다. 이 전파 경로가 이미 프로젝트에 확립된 패턴이므로 Phase 108은 새로운 아키텍처 결정보다는 기존 패턴의 일관된 적용이 핵심이다.

**Primary recommendation:** docs/68(환경 모델) + docs/70(파이프라인 리졸브)의 설계를 기반으로, Plan 108-01에서 REST API Zod 스키마 변경을 설계하고, Plan 108-02에서 MCP/SDK/Quickstart 확장을 설계한다. 모든 인터페이스에서 `network` 미지정 시 `resolveNetwork()` 3단계 fallback을 사용하는 동일한 하위호환 전략을 적용한다.

## Standard Stack

### Core (변경 없음 -- 기존 스택 활용)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @hono/zod-openapi | 0.x | REST API route + OpenAPI 스키마 | 프로젝트 SSoT 기반. createRoute()로 Zod -> OpenAPI 자동 파생 |
| zod | 3.x | 요청/응답 스키마 정의 | CLAUDE.md SSoT 원칙: Zod -> TypeScript -> OpenAPI -> Drizzle |
| @modelcontextprotocol/sdk | 1.x | MCP 서버 + 도구 등록 | MCP 표준 SDK. server.tool()로 Zod 스키마 기반 입력 정의 |
| commander | 12.x | CLI 명령어 정의 | 기존 CLI 스택 |
| pydantic | 2.x | Python SDK 모델 | Python SDK 기존 스택 (models.py) |
| httpx | 0.x | Python SDK HTTP 클라이언트 | Python SDK 기존 스택 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (없음) | - | - | Phase 108은 외부 의존성 추가 없이 기존 스택 내에서 설계 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod SSoT -> OpenAPI 파생 | swagger-jsdoc 독립 정의 | 일관성 위반. Zod와 OpenAPI 불일치 위험. 기존 패턴 유지 |
| MCP 도구 개별 network 파라미터 | MCP 리소스에서 환경 설정 | MCP 리소스는 read-only. 트랜잭션 실행 시 network 선택 필요. 도구 파라미터가 적절 |

## Architecture Patterns

### Recommended Interface Layer Structure

```
packages/core/src/schemas/
├── wallet.schema.ts     # CreateWalletRequestSchema (environment 추가)
├── transaction.schema.ts # 5-type schemas (network 추가)
└── index.ts              # barrel export

packages/daemon/src/api/routes/
├── openapi-schemas.ts    # OpenAPI 래핑 (기존 패턴)
├── transactions.ts       # POST /v1/transactions/send (network resolve)
├── wallets.ts            # POST /v1/wallets (environment + defaultNetwork)
└── wallet.ts             # GET /v1/wallet/assets (멀티네트워크 집계)

packages/mcp/src/tools/
├── send-token.ts         # network 선택 파라미터 추가
├── call-contract.ts      # network 선택 파라미터 추가
├── approve-token.ts      # network 선택 파라미터 추가
├── send-batch.ts         # network 선택 파라미터 추가
├── get-balance.ts        # network 선택 파라미터 추가
├── get-assets.ts         # network 선택 파라미터 추가
└── get-address.ts        # 변경 없음 (wallet bound)

packages/sdk/src/
├── types.ts              # network 파라미터 추가
├── client.ts             # 메서드 시그니처 확장
└── validation.ts         # network 검증 추가

python-sdk/waiaas/
├── models.py             # network 필드 추가
└── client.py             # 메서드 시그니처 확장

packages/cli/src/commands/
├── quickstart.ts         # 신규: quickstart --mode testnet/mainnet
└── mcp-setup.ts          # 기존: MCP 설정 스니펫
```

### Pattern 1: 트랜잭션 요청 스키마에 network 선택 파라미터 추가

**What:** 5-type 트랜잭션 요청(TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH)에 `network` optional 필드를 추가하여 트랜잭션별 네트워크 선택을 허용한다.
**When to use:** POST /v1/transactions/send 요청 시. MCP send_token/call_contract/approve_token/send_batch 호출 시.
**Example:**

```typescript
// packages/core/src/schemas/transaction.schema.ts

// 기존 TransferRequestSchema에 network 추가
export const TransferRequestSchema = z.object({
  type: z.literal('TRANSFER'),
  to: z.string().min(1),
  amount: z.string().regex(numericStringPattern, '...'),
  memo: z.string().max(256).optional(),
  network: NetworkTypeEnum.optional(),  // NEW: 트랜잭션별 네트워크 선택
});

// TokenTransferRequestSchema, ContractCallRequestSchema, ApproveRequestSchema 동일 패턴
// BatchRequestSchema는 instructions 내부가 아닌 최상위에 network 추가
export const BatchRequestSchema = z.object({
  type: z.literal('BATCH'),
  instructions: z.array(...).min(2).max(20),
  network: NetworkTypeEnum.optional(),  // BATCH 전체에 하나의 network
});

// Legacy SendTransactionRequestSchema도 network 추가 (하위호환)
export const SendTransactionRequestSchema = z.object({
  to: z.string().min(1),
  amount: z.string().regex(/^\d+$/, '...'),
  memo: z.string().max(256).optional(),
  network: NetworkTypeEnum.optional(),
});
```

**핵심:** network 미지정 시 resolveNetwork() 3단계 우선순위(request.network > wallet.defaultNetwork > getDefaultNetwork(chain, env))가 Route Handler에서 적용되어 기존 동작 100% 유지.

### Pattern 2: 월렛 생성 API environment 파라미터

**What:** POST /v1/wallets의 요청 스키마를 `chain + network` -> `chain + environment + network(optional)` 으로 전환한다.
**When to use:** 신규 월렛 생성 시.
**Example:**

```typescript
// packages/core/src/schemas/wallet.schema.ts

// Phase 108 변경 후
export const CreateWalletRequestSchema = z.object({
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum.default('solana'),
  environment: EnvironmentTypeEnum.optional(),  // NEW (optional for backward compat)
  network: NetworkTypeEnum.optional(),  // 기존과 동일 (초기 default_network 설정)
});
```

**하위호환 전략:**
- `environment` 미지정 + `network` 지정: network에서 environment를 deriveEnvironment()로 역추론
- `environment` 미지정 + `network` 미지정: chain의 기본 환경(testnet) + 기본 네트워크(devnet/ethereum-sepolia) 사용
- `environment` 지정 + `network` 미지정: getDefaultNetwork(chain, env) 자동 설정
- `environment` 지정 + `network` 지정: validateNetworkEnvironment() 교차 검증 후 설정

### Pattern 3: 멀티네트워크 잔액 집계 (GET /v1/wallet/assets 또는 GET /v1/wallets/:id/assets)

**What:** 환경 내 모든 네트워크에서 자산을 병렬 조회하여 네트워크별로 그룹화하여 반환한다.
**When to use:** GET /v1/wallets/:id/assets (masterAuth) 신규 엔드포인트 또는 기존 GET /v1/wallet/assets 확장.
**Example:**

```typescript
// Route handler 의사코드
async function getMultiNetworkAssets(wallet: Wallet) {
  const networks = getNetworksForEnvironment(wallet.chain, wallet.environment);

  const results = await Promise.allSettled(
    networks.map(async (network) => {
      const rpcUrl = resolveRpcUrl(config.rpc, wallet.chain, network);
      const adapter = await adapterPool.resolve(wallet.chain, network, rpcUrl);
      const assets = await adapter.getAssets(wallet.publicKey);
      return { network, assets };
    }),
  );

  return {
    walletId: wallet.id,
    chain: wallet.chain,
    environment: wallet.environment,
    networks: results.map((r, i) => {
      if (r.status === 'fulfilled') {
        return { network: networks[i], status: 'ok', assets: r.value.assets };
      }
      return { network: networks[i], status: 'error', error: r.reason?.message ?? 'Unknown' };
    }),
  };
}
```

**핵심:** Promise.allSettled로 일부 네트워크 RPC 장애 시에도 나머지 결과 반환. 네트워크별 성공/실패 상태 포함.

### Pattern 4: MCP 도구 network 파라미터 추가

**What:** MCP 10개 도구 중 트랜잭션/잔액 관련 도구에 `network` optional 파라미터를 추가한다.
**When to use:** send_token, call_contract, approve_token, send_batch, get_balance, get_assets 도구.
**Example:**

```typescript
// packages/mcp/src/tools/send-token.ts
server.tool(
  'send_token',
  withWalletPrefix('Send SOL/ETH or tokens from the wallet.', walletContext?.walletName),
  {
    to: z.string().describe('Destination wallet address'),
    amount: z.string().describe('Amount in smallest unit'),
    memo: z.string().optional().describe('Optional memo'),
    type: z.enum(['TRANSFER', 'TOKEN_TRANSFER']).optional().describe('Transaction type'),
    token: z.object({...}).optional().describe('Token info for TOKEN_TRANSFER'),
    network: z.string().optional().describe(  // NEW
      'Target network (e.g., ethereum-sepolia). If omitted, uses wallet default network.'
    ),
  },
  async (args) => {
    const body: Record<string, unknown> = { to: args.to, amount: args.amount };
    if (args.network !== undefined) body.network = args.network;
    // ... rest same
    const result = await apiClient.post('/v1/transactions/send', body);
    return toToolResult(result);
  },
);
```

**get_balance, get_assets 특이사항:** 이들은 현재 wallet에 바인딩된 단일 네트워크를 조회한다. network 파라미터를 추가하면 쿼리 파라미터(`?network=polygon-mainnet`)로 전달하거나, 멀티네트워크 집계 엔드포인트를 별도 활용한다.

### Pattern 5: Quickstart --mode testnet/mainnet 워크플로우

**What:** `waiaas quickstart --mode testnet` 실행 시 Solana + EVM 2개 월렛 일괄 생성, 세션 생성, MCP 토큰 자동 생성, Claude Desktop 설정 스니펫 출력을 단일 명령으로 수행한다.
**When to use:** 처음 설치 후 빠르게 시작할 때.
**Example:**

```
$ waiaas quickstart --mode testnet

[1/5] Creating Solana testnet wallet...
  Name: solana-testnet
  Network: devnet
  Address: 7xKX...

[2/5] Creating Ethereum testnet wallet...
  Name: eth-testnet
  Network: ethereum-sepolia
  Address: 0xAb...

[3/5] Creating sessions...
  Solana session: wai_sess_eyJ...
  Ethereum session: wai_sess_eyJ...

[4/5] Creating MCP tokens...
  Token file: ~/.waiaas/mcp-tokens/<id1>
  Token file: ~/.waiaas/mcp-tokens/<id2>

[5/5] Done! Add to your Claude Desktop config.json:

{
  "mcpServers": {
    "waiaas-solana-testnet": {
      "command": "npx",
      "args": ["@waiaas/mcp"],
      "env": { ... }
    },
    "waiaas-eth-testnet": {
      "command": "npx",
      "args": ["@waiaas/mcp"],
      "env": { ... }
    }
  }
}
```

### Anti-Patterns to Avoid

- **Breaking change without fallback:** environment 필드를 required로 만들면 기존 클라이언트 즉시 실패. 반드시 optional로 추가하고 deriveEnvironment() fallback 제공.
- **MCP 도구에서 network을 required로:** 기존 MCP 클라이언트가 network 없이 호출하므로 required면 전부 실패. optional만 허용.
- **Python SDK에서 TypeScript 타입 직접 import:** 별도 패키지이므로 Pydantic 모델에서 독립적으로 network 필드 추가.
- **Quickstart에서 daemon 자동 시작:** quickstart는 daemon 실행 전제. 자동 시작 시 config 미설정, 포트 충돌 등 예기치 않은 문제. health check 후 안내 메시지 출력이 안전.
- **getAssets 멀티네트워크에서 직렬 조회:** 5개 EVM 네트워크를 순차 조회하면 체감 지연 심각. 반드시 Promise.allSettled 병렬.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| network fallback 로직 | 각 라우트에서 개별 구현 | resolveNetwork() 순수 함수 (docs/70) | 3단계 우선순위 + 2중 검증을 매번 반복하면 불일치 발생. 단일 함수 참조 |
| environment 역추론 | 조건문 하드코딩 | deriveEnvironment() (docs/68 섹션 3.4) | 13개 네트워크 전수 매핑. 하드코딩 시 누락 위험 |
| chain-network 교차 검증 | 인라인 if 문 | validateChainNetwork() + validateNetworkEnvironment() | 기존 검증 함수 2개 조합 |
| OpenAPI 스키마 수동 정의 | swagger 직접 작성 | Zod .openapi() 메서드 | Zod SSoT 패턴. openapi-schemas.ts에서 자동 파생 |

**Key insight:** Phase 108은 새로운 도구나 로직을 만들지 않는다. Phase 105-107에서 설계한 순수 함수와 타입을 인터페이스 레이어에 노출하는 것이 핵심이다. resolveNetwork(), deriveEnvironment(), getDefaultNetwork() 등은 이미 설계 완료되었으므로, 각 인터페이스에서 이를 일관되게 호출하기만 하면 된다.

## Common Pitfalls

### Pitfall 1: 하위호환 깨뜨림 (Breaking Change)
**What goes wrong:** CreateWalletRequestSchema에서 `network` 필드를 제거하고 `environment` 를 required로 만들면 기존 `{ name, chain, network }` 요청이 실패한다.
**Why it happens:** "환경 모델 전환"을 "기존 인터페이스 교체"로 해석.
**How to avoid:**
- `environment`는 optional로 추가. 미지정 시 `network`에서 deriveEnvironment()로 역추론.
- 기존 `network` 필드도 유지 (default_network 초기값 설정용).
- 기존 API 호출 `{ name: "my-wallet", chain: "solana", network: "devnet" }` 이 동일하게 동작해야 한다.
**Warning signs:** 기존 테스트가 실패하기 시작하면 하위호환 깨진 것.

### Pitfall 2: MCP 도구 스키마 변경 시 LLM 혼란
**What goes wrong:** MCP 도구의 파라미터 설명이 모호하면 LLM이 network 파라미터를 잘못 사용한다.
**Why it happens:** LLM은 파라미터 설명(description)을 기반으로 도구 사용을 결정.
**How to avoid:**
- network 파라미터 description에 "optional, defaults to wallet's default network" 명시
- 사용 가능한 네트워크 목록을 description에 포함 (예: "ethereum-sepolia, polygon-amoy, ...")
- MCP 리소스로 현재 월렛의 environment/default_network 정보 노출
**Warning signs:** LLM이 매번 network를 명시적으로 지정하거나, 잘못된 network를 지정.

### Pitfall 3: Promise.allSettled 에러 무시
**What goes wrong:** 멀티네트워크 잔액 집계에서 모든 네트워크가 실패해도 빈 결과를 성공으로 반환.
**Why it happens:** Promise.allSettled는 전체 실패해도 resolved.
**How to avoid:**
- 응답에 각 네트워크별 status("ok"/"error") 포함
- 전체 실패 시 적절한 에러 코드 반환 (예: CHAIN_ERROR)
- 클라이언트(SDK/MCP)에서 partial failure를 사용자에게 전달
**Warning signs:** 잔액이 항상 0으로 반환되거나, 에러 메시지 없이 빈 자산 목록.

### Pitfall 4: Quickstart에서 daemon 미실행 상태 처리 누락
**What goes wrong:** quickstart 명령 실행 시 daemon이 실행되지 않으면 wallet 생성 API 호출이 실패하고 불친절한 에러 출력.
**Why it happens:** quickstart가 daemon 실행 상태를 전제.
**How to avoid:**
- quickstart 첫 단계에서 health check 수행
- daemon 미실행 시 `waiaas start` 안내 메시지 출력 후 종료
- 기존 mcp-setup의 health check 패턴(mcp-setup.ts line 138-151) 재사용
**Warning signs:** "ECONNREFUSED" 에러가 사용자에게 노출.

### Pitfall 5: SDK에서 network 파라미터를 body 대신 query string으로 전달
**What goes wrong:** TS/Python SDK가 network을 query parameter로 전달하면 daemon의 body parser가 무시한다.
**Why it happens:** GET 엔드포인트(balance, assets)와 POST 엔드포인트(send)의 파라미터 전달 방식이 다름.
**How to avoid:**
- POST /v1/transactions/send: network은 request body에 포함
- GET /v1/wallet/balance, GET /v1/wallet/assets: network은 query parameter (`?network=ethereum-sepolia`)
- SDK 메서드에서 HTTP 메서드에 따라 파라미터 전달 위치를 정확히 구분
**Warning signs:** network 파라미터가 무시되고 항상 기본 네트워크 응답.

## Code Examples

### 현재 인터페이스 (Phase 108 변경 전)

```typescript
// Source: packages/core/src/schemas/wallet.schema.ts (현재)
export const CreateWalletRequestSchema = z.object({
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum.default('solana'),
  network: NetworkTypeEnum.optional(),
});

// Source: packages/core/src/schemas/transaction.schema.ts (현재)
export const TransferRequestSchema = z.object({
  type: z.literal('TRANSFER'),
  to: z.string().min(1),
  amount: z.string().regex(numericStringPattern, '...'),
  memo: z.string().max(256).optional(),
});

// Source: packages/mcp/src/tools/send-token.ts (현재)
// network 파라미터 없음
server.tool('send_token', desc, {
  to: z.string(),
  amount: z.string(),
  memo: z.string().optional(),
  type: z.enum(['TRANSFER', 'TOKEN_TRANSFER']).optional(),
  token: z.object({...}).optional(),
}, async (args) => { ... });

// Source: packages/sdk/src/types.ts (현재)
export interface SendTokenParams {
  to?: string;
  amount?: string;
  memo?: string;
  type?: 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE' | 'BATCH';
  token?: TokenInfo;
  // ... no network field
}
```

### Phase 108 설계 후 인터페이스 (의사코드)

```typescript
// CreateWalletRequestSchema 변경 후
export const CreateWalletRequestSchema = z.object({
  name: z.string().min(1).max(100),
  chain: ChainTypeEnum.default('solana'),
  environment: EnvironmentTypeEnum.optional(), // NEW
  network: NetworkTypeEnum.optional(),          // 유지 (default_network 설정용)
});

// TransferRequestSchema 변경 후 (5-type 모두 동일 패턴)
export const TransferRequestSchema = z.object({
  type: z.literal('TRANSFER'),
  to: z.string().min(1),
  amount: z.string().regex(numericStringPattern, '...'),
  memo: z.string().max(256).optional(),
  network: NetworkTypeEnum.optional(), // NEW
});

// MCP send_token 변경 후
server.tool('send_token', desc, {
  to: z.string(),
  amount: z.string(),
  memo: z.string().optional(),
  type: z.enum(['TRANSFER', 'TOKEN_TRANSFER']).optional(),
  token: z.object({...}).optional(),
  network: z.string().optional().describe(
    'Target network. Omit for wallet default. Examples: devnet, ethereum-sepolia, polygon-amoy'
  ), // NEW
}, async (args) => { ... });

// SDK SendTokenParams 변경 후
export interface SendTokenParams {
  to?: string;
  amount?: string;
  memo?: string;
  type?: 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE' | 'BATCH';
  token?: TokenInfo;
  network?: string; // NEW
}

// Python SDK SendTokenRequest 변경 후
class SendTokenRequest(BaseModel):
    to: Optional[str] = None
    amount: Optional[str] = None
    memo: Optional[str] = None
    type: Optional[str] = None
    token: Optional[TokenInfo] = None
    network: Optional[str] = None  # NEW
```

### Route Handler에서 resolveNetwork 호출 패턴

```typescript
// Source: 의사코드 (Phase 108 설계 대상)
// packages/daemon/src/api/routes/transactions.ts POST /transactions/send

router.openapi(sendTransactionRoute, async (c) => {
  const walletId = c.get('walletId') as string;
  const wallet = await db.select().from(wallets).where(eq(wallets.id, walletId)).get();
  if (!wallet) throw new WAIaaSError('WALLET_NOT_FOUND', {...});

  const request = await c.req.json();

  // NEW: network resolve (Phase 106 설계 적용)
  const resolvedNetwork = resolveNetwork(
    request.network ?? null,      // request-level network (optional)
    wallet.defaultNetwork ?? null, // wallet default_network (nullable)
    wallet.environment as EnvironmentType,
    wallet.chain as ChainType,
  );

  const rpcUrl = resolveRpcUrl(config.rpc, wallet.chain, resolvedNetwork);
  const adapter = await adapterPool.resolve(wallet.chain, resolvedNetwork, rpcUrl);

  const ctx: PipelineContext = {
    // ... 기존 필드
    wallet: {
      publicKey: wallet.publicKey,
      chain: wallet.chain,
      network: resolvedNetwork,         // CHANGED: wallet.network -> resolvedNetwork
      environment: wallet.environment,  // NEW
    },
    request,
    // ...
  };

  await stage1Validate(ctx);
  // ... stages 2-6
});
```

### Quickstart CLI 워크플로우 의사코드

```typescript
// Source: 의사코드 (Phase 108 설계 대상)
// packages/cli/src/commands/quickstart.ts

export interface QuickstartOptions {
  dataDir: string;
  baseUrl?: string;
  mode: 'testnet' | 'mainnet';
  masterPassword?: string;
}

export async function quickstartCommand(opts: QuickstartOptions): Promise<void> {
  const baseUrl = opts.baseUrl ?? 'http://127.0.0.1:3100';
  const password = opts.masterPassword ?? await resolvePassword();

  // Step 0: Health check
  await healthCheck(baseUrl);

  // Step 1: Create Solana wallet
  const solanaWallet = await createWallet(baseUrl, password, {
    name: `solana-${opts.mode}`,
    chain: 'solana',
    environment: opts.mode,
  });
  console.log(`[1/5] Solana wallet: ${solanaWallet.publicKey}`);

  // Step 2: Create Ethereum wallet
  const ethWallet = await createWallet(baseUrl, password, {
    name: `eth-${opts.mode}`,
    chain: 'ethereum',
    environment: opts.mode,
  });
  console.log(`[2/5] Ethereum wallet: ${ethWallet.publicKey}`);

  // Step 3-4: Create sessions + MCP tokens
  const mcpServers: Record<string, unknown> = {};
  for (const wallet of [solanaWallet, ethWallet]) {
    const mcpToken = await createMcpToken(baseUrl, password, wallet.id);
    mcpServers[`waiaas-${wallet.name}`] = mcpToken.claudeDesktopConfig;
  }

  // Step 5: Output config snippet
  console.log(JSON.stringify({ mcpServers }, null, 2));
  printConfigPath();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 1 wallet = 1 network | 1 wallet = 1 environment (multi-network) | v1.4.5 설계 (Phase 105) | API에서 network가 optional로 전환 |
| CreateWalletRequest: chain + network | CreateWalletRequest: chain + environment + network(opt) | Phase 108 설계 | 하위호환 유지하면서 환경 모델 지원 |
| MCP 도구: wallet 고정 네트워크 | MCP 도구: 트랜잭션별 network 선택 | Phase 108 설계 | LLM이 동적으로 네트워크 선택 가능 |
| 단일 네트워크 잔액 조회 | 멀티네트워크 병렬 잔액 집계 | Phase 108 설계 | 한 번의 호출로 전체 환경 자산 파악 |

**Deprecated/outdated:**
- `waiaas mcp setup --wallet <id>`: quickstart 도입 후에도 유지 (단일 월렛 설정용)
- 기존 `POST /v1/wallets` body `{ chain, network }`: 계속 동작 (environment를 deriveEnvironment로 역추론)

## Open Questions

### 1. GET /v1/wallet/assets 확장 vs 신규 엔드포인트

**What we know:**
- 현재 GET /v1/wallet/assets는 sessionAuth 기반, 단일 네트워크 자산 조회
- 멀티네트워크 집계는 환경 내 2~5개 네트워크 병렬 조회 필요
- 기존 엔드포인트 응답 형식 변경 시 하위호환 위험

**What's unclear:**
- 기존 GET /v1/wallet/assets를 확장할지, 별도 GET /v1/wallets/:id/assets (masterAuth) 엔드포인트를 추가할지

**Recommendation:**
- 기존 GET /v1/wallet/assets는 유지 (단일 네트워크, sessionAuth, 하위호환)
- GET /v1/wallet/assets?network=polygon-mainnet 쿼리 파라미터로 특정 네트워크 지정 가능하게 확장
- 멀티네트워크 집계는 별도 GET /v1/wallets/:id/assets (masterAuth)로 신설
- 이유: sessionAuth 기반의 단일 네트워크 조회와 masterAuth 기반의 멀티네트워크 집계는 사용 맥락이 다름

### 2. Quickstart에서 daemon 자동 시작 여부

**What we know:**
- 현재 CLI에 `start`, `stop`, `status` 명령이 존재
- quickstart는 daemon 실행을 전제로 API 호출
- daemon 시작에는 config.toml, master password 등 설정 필요

**What's unclear:**
- quickstart가 daemon 미실행 시 자동으로 `waiaas start`를 호출할지, 사용자에게 안내만 할지

**Recommendation:**
- daemon 미실행 시 안내 메시지 출력 후 종료 (자동 시작 안 함)
- 이유: daemon 시작에는 master password, config.toml 등 설정이 필요하고 자동 시작 시 포트 충돌, 설정 누락 등 디버깅 어려움
- quickstart 문서에 `waiaas init && waiaas start` 선행 단계 안내

### 3. MCP get_balance/get_assets에서 network 파라미터 전달 방식

**What we know:**
- get_balance, get_assets는 현재 파라미터 없는 도구 (wallet 기반 자동 조회)
- network 파라미터를 추가하면 도구 시그니처 변경
- REST API에서는 query parameter (?network=...)로 전달

**What's unclear:**
- MCP 도구에서 network을 파라미터로 받아 daemon API에 전달하는 정확한 경로

**Recommendation:**
- MCP get_balance, get_assets 도구에 `network` optional 파라미터 추가
- daemon API: GET /v1/wallet/balance?network=X, GET /v1/wallet/assets?network=X 쿼리 파라미터 지원
- 미지정 시 wallet의 default_network 사용 (기존 동작 유지)
- MCP 도구 내부에서 network이 지정되면 URL에 쿼리 파라미터로 추가

## Sources

### Primary (HIGH confidence)
- 코드베이스 직접 분석: packages/daemon/src/api/routes/transactions.ts, wallets.ts, wallet.ts
- 코드베이스 직접 분석: packages/core/src/schemas/transaction.schema.ts, wallet.schema.ts
- 코드베이스 직접 분석: packages/mcp/src/tools/ (10개 도구 전체)
- 코드베이스 직접 분석: packages/sdk/src/client.ts, types.ts
- 코드베이스 직접 분석: python-sdk/waiaas/client.py, models.py
- 코드베이스 직접 분석: packages/cli/src/commands/mcp-setup.ts, init.ts, index.ts
- 코드베이스 직접 분석: packages/daemon/src/api/routes/openapi-schemas.ts
- 설계 문서: docs/68-environment-model-design.md (환경 매핑 함수 4개)
- 설계 문서: docs/70-pipeline-network-resolve-design.md (resolveNetwork 3단계 우선순위)
- 설계 문서: docs/71-policy-engine-network-extension-design.md (ALLOWED_NETWORKS + policies.network)
- Phase summaries: 105-01, 105-02, 106-01, 107-01

### Secondary (MEDIUM confidence)
- 설계 결정 참조: ENV-01~ENV-08, PIPE-D01~D06, PLCY-D01~D05 (Phase 105-107 확정)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 기존 스택 유지, 외부 의존성 추가 없음
- Architecture: HIGH - Phase 105-107 설계가 완전한 인터페이스 명세를 이미 제공
- Pitfalls: HIGH - 기존 코드 패턴 분석에서 하위호환, 파라미터 전달 위치 등 명확히 식별

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (안정적 프로젝트 내부 설계, 외부 의존성 없음)

---

## 부록 A: 변경 대상 인터페이스 전수 목록

### REST API 엔드포인트 (7개 변경)

| # | 엔드포인트 | 현재 | 변경 | 요구사항 |
|---|----------|------|------|---------|
| 1 | POST /v1/wallets | chain + network(opt) | chain + environment(opt) + network(opt) | API-03 |
| 2 | POST /v1/transactions/send | 5-type body (network 없음) | 5-type body + network(opt) | API-01 |
| 3 | GET /v1/wallet/balance | 파라미터 없음 | ?network=X 쿼리 파라미터 | API-01 |
| 4 | GET /v1/wallet/assets | 파라미터 없음 | ?network=X 쿼리 파라미터 | API-01 |
| 5 | GET /v1/wallets/:id/assets | 존재하지 않음 | 신규: 멀티네트워크 잔액 집계 (masterAuth) | API-02 |
| 6 | GET /v1/wallets | 응답: chain+network | 응답: chain+environment+defaultNetwork | API-03 |
| 7 | GET /v1/wallets/:id | 응답: chain+network | 응답: chain+environment+defaultNetwork | API-03 |

### Zod 스키마 (8개 변경)

| # | 스키마 | 파일 | 변경 내용 |
|---|--------|------|----------|
| 1 | CreateWalletRequestSchema | wallet.schema.ts | environment(opt) 추가 |
| 2 | TransferRequestSchema | transaction.schema.ts | network(opt) 추가 |
| 3 | TokenTransferRequestSchema | transaction.schema.ts | network(opt) 추가 |
| 4 | ContractCallRequestSchema | transaction.schema.ts | network(opt) 추가 |
| 5 | ApproveRequestSchema | transaction.schema.ts | network(opt) 추가 |
| 6 | BatchRequestSchema | transaction.schema.ts | network(opt) 추가 |
| 7 | SendTransactionRequestSchema | transaction.schema.ts | network(opt) 추가 (legacy) |
| 8 | WalletSchema | wallet.schema.ts | network -> environment + defaultNetwork |

### MCP 도구 (6개 변경)

| # | 도구 | 변경 내용 |
|---|------|----------|
| 1 | send_token | network(opt) 파라미터 추가 |
| 2 | call_contract | network(opt) 파라미터 추가 |
| 3 | approve_token | network(opt) 파라미터 추가 |
| 4 | send_batch | network(opt) 파라미터 추가 |
| 5 | get_balance | network(opt) 파라미터 추가 |
| 6 | get_assets | network(opt) 파라미터 추가 |

### TS SDK (3개 변경)

| # | 메서드/타입 | 변경 내용 |
|---|------------|----------|
| 1 | SendTokenParams | network?: string 추가 |
| 2 | WAIaaSClient.getBalance() | network?: string 파라미터 + query string |
| 3 | WAIaaSClient.getAssets() | network?: string 파라미터 + query string |

### Python SDK (3개 변경)

| # | 클래스/메서드 | 변경 내용 |
|---|-------------|----------|
| 1 | SendTokenRequest | network: Optional[str] 추가 |
| 2 | WAIaaSClient.get_balance() | network 파라미터 + query string |
| 3 | WAIaaSClient.get_assets() | network 파라미터 + query string |

### CLI (1개 신규)

| # | 명령어 | 설명 |
|---|--------|------|
| 1 | waiaas quickstart | --mode testnet/mainnet, Solana+EVM 2월렛 일괄 생성 + MCP 토큰 자동 생성 |

### Skill Files (4개 변경)

| # | 파일 | 변경 내용 |
|---|------|----------|
| 1 | quickstart.skill.md | environment 모델 기반 워크플로우 + quickstart 명령어 설명 |
| 2 | wallet.skill.md | POST /v1/wallets environment 파라미터, 응답 변경, 멀티네트워크 잔액 |
| 3 | transactions.skill.md | 5-type network 파라미터, 응답에 network 필드 |
| 4 | policies.skill.md | ALLOWED_NETWORKS 정책 타입, network 스코프 |

## 부록 B: 하위호환 전략 요약

### 3-Layer 하위호환 원칙

모든 인터페이스(REST/MCP/SDK)에서 동일한 3가지 하위호환 원칙을 적용한다:

1. **network 미지정 = 기존 동작 유지**: network를 지정하지 않으면 resolveNetwork() fallback이 wallet.defaultNetwork 또는 getDefaultNetwork()를 사용한다. 기존 클라이언트는 network를 보내지 않으므로 동작 변경 없음.

2. **environment 미지정 = 자동 추론**: CreateWalletRequest에서 environment 미지정 시 network에서 deriveEnvironment()로 역추론하거나, 둘 다 미지정이면 체인 기본값(testnet) 사용. 기존 `{ name, chain, network }` 요청이 동일하게 동작.

3. **응답 필드 추가 only**: 기존 응답 필드(chain, network)를 제거하지 않고, environment, defaultNetwork 등 새 필드만 추가한다. 기존 클라이언트가 미지원 필드를 무시하므로 안전.

### 인터페이스별 적용

| 인터페이스 | 요청 하위호환 | 응답 하위호환 |
|-----------|-------------|-------------|
| REST API | network optional (미지정 시 fallback) | 기존 필드 유지 + 새 필드 추가 |
| MCP | network optional (미지정 시 무시) | 기존 응답 형식 유지 |
| TS SDK | network?: string (optional property) | 기존 타입 유지 + 새 필드 추가 |
| Python SDK | network: Optional[str] = None | 기존 모델 유지 + 새 필드 추가 |

## 부록 C: Phase 105-108 참조 관계

```
docs/68 (Phase 105)                    docs/69 (Phase 105)
  EnvironmentType SSoT                   DB Migration v6a/v6b
  매핑 함수 4개                            wallets/transactions schema
  WalletSchema 변경
         |                                      |
         v                                      v
docs/70 (Phase 106)                    docs/71 (Phase 107)
  resolveNetwork() 순수 함수               ALLOWED_NETWORKS PolicyType
  PipelineContext.resolvedNetwork          policies.network 스코프
  ENVIRONMENT_NETWORK_MISMATCH            4단계 override
         |                                      |
         +------------------+-------------------+
                            |
                            v
                     docs/72 (Phase 108) -- THIS PHASE
                       REST API network 파라미터
                       MCP/SDK 확장 + 하위호환
                       멀티네트워크 잔액 집계
                       Quickstart 워크플로우
```
