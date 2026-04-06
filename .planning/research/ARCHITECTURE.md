# Architecture Research

**Domain:** XRPL DEX Action Provider -- WAIaaS 기존 Action Provider + Pipeline 아키텍처에 XRPL 네이티브 오더북 DEX 통합
**Researched:** 2026-04-03
**Confidence:** HIGH

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        API / MCP Layer                               │
│  POST /v1/actions/xrpl_dex/{action}                                  │
│  MCP: xrpl_dex_swap, xrpl_dex_limit_order, xrpl_dex_cancel,         │
│       xrpl_dex_orderbook, xrpl_dex_offers                           │
├─────────────────────────────────────────────────────────────────────┤
│                    ActionProviderRegistry                            │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                    XrplDexProvider                            │    │
│  │  actions: swap, limit_order, cancel_order,                    │    │
│  │           get_orderbook, get_offers                           │    │
│  │  resolve() -> ContractCallRequest | ApiDirectResult           │    │
│  └──────────────────────┬───────────────────────────────────────┘    │
├─────────────────────────┼───────────────────────────────────────────┤
│                  Pipeline (6-stage)                                   │
│                         │                                            │
│  ┌──────────┐    ┌──────┴─────┐    ┌────────────────────────┐       │
│  │ Stage 1  │    │  Stage 5   │    │   ApiDirectResult      │       │
│  │ Validate │    │ buildByType│    │   (read-only bypass)   │       │
│  └────┬─────┘    └──────┬─────┘    └────────────────────────┘       │
│       │                 │                                            │
├───────┴─────────────────┴────────────────────────────────────────────┤
│                    RippleAdapter (IChainAdapter)                      │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │ buildContractCall() -- XRPL native tx routing                 │   │
│  │   metadata.xrplTxType: 'OfferCreate' | 'OfferCancel'         │   │
│  │   -> client.autofill() -> UnsignedTransaction                 │   │
│  └───────────────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │ xrpl.Client (WebSocket RPC)                                   │   │
│  │   book_offers / account_offers / autofill / submit             │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | New/Modified |
|-----------|----------------|--------------|
| **XrplDexProvider** | Action Provider: resolve swap/limit/cancel into ContractCallRequest, resolve orderbook/offers into ApiDirectResult | **NEW** (`packages/actions/src/providers/xrpl-dex/`) |
| **RippleAdapter.buildContractCall()** | XRPL native tx builder: OfferCreate/OfferCancel via metadata routing | **MODIFIED** (현재 throws -> XRPL tx 빌드) |
| **stage5 buildByType()** | CONTRACT_CALL -> adapter.buildContractCall() 라우팅 (변경 불필요) | UNCHANGED |
| **Pipeline stage3 policy** | CONTRACT_CALL 정책 평가 (actionProvider trust bypass) | UNCHANGED |
| **ActionProviderRegistry** | Provider 등록/실행 (변경 불필요) | UNCHANGED |
| **Admin Settings** | `actions.xrpl_dex_enabled` 토글 | **MODIFIED** (설정 키 추가) |
| **MCP tools** | xrpl_dex_* 5개 도구 자동 노출 (mcpExpose: true) | AUTO (기존 메커니즘) |

## Recommended Project Structure

```
packages/actions/src/providers/xrpl-dex/
├── index.ts                # XrplDexProvider class (IActionProvider)
├── schemas.ts              # Zod input schemas (swap, limit, cancel, orderbook, offers)
├── orderbook-client.ts     # book_offers / account_offers RPC wrapper
├── offer-builder.ts        # OfferCreate / OfferCancel params builder
└── __tests__/
    ├── xrpl-dex-provider.test.ts
    ├── orderbook-client.test.ts
    └── offer-builder.test.ts

packages/adapters/ripple/src/
├── adapter.ts              # MODIFIED: buildContractCall() XRPL native tx routing
├── tx-parser.ts            # MODIFIED: OfferCreate/OfferCancel parsing (currently UNKNOWN)
└── __tests__/
    └── ripple-adapter.test.ts  # MODIFIED: buildContractCall OfferCreate/Cancel tests
```

### Structure Rationale

- **xrpl-dex/ in packages/actions/:** 기존 DEX 프로바이더(jupiter-swap, zerox-swap, dcent-swap)와 동일한 패턴. Action Provider 계층에 위치하여 비즈니스 로직(슬리피지, 호가 조회) 담당.
- **orderbook-client.ts 분리:** RPC 호출(book_offers, account_offers)을 Provider 로직에서 분리하여 테스트 용이성 확보. xrpl.Client 인스턴스는 ActionContext에서 주입 불가 -> 별도 클라이언트 필요.
- **offer-builder.ts 분리:** OfferCreate/OfferCancel 파라미터 빌드 로직 격리. Currency Amount 변환(XRP drops vs IOU object), Flag 계산(tfImmediateOrCancel, tfSell 등) 복잡성 캡슐화.

## Architectural Patterns

### Pattern 1: ContractCallRequest + calldata JSON encoding for XRPL native tx

**What:** XrplDexProvider.resolve()가 ContractCallRequest를 반환하되, calldata 필드에 XRPL 네이티브 트랜잭션 파라미터를 JSON으로 인코딩. RippleAdapter.buildContractCall()이 calldata를 파싱하여 xrplTxType으로 분기하고 OfferCreate/OfferCancel을 빌드.

**When to use:** on-chain 트랜잭션이 필요한 action (swap, limit_order, cancel_order)

**Trade-offs:**
- 장점: 기존 6-stage pipeline 완전 활용 (정책 엔진, 서명, 알림 모두 동작)
- 장점: ContractCallRequestSchema 재검증을 통과하므로 타입 안전성 유지
- 장점: buildByType()의 CONTRACT_CALL -> buildContractCall() 경로 그대로 사용 -- pipeline 코드 변경 0
- 단점: calldata의 의미가 EVM hex calldata에서 XRPL JSON params로 확장됨 (semantically overloaded)

**Example:**
```typescript
// XrplDexProvider.resolve() -- swap action
const contractCall: ContractCallRequest = {
  type: 'CONTRACT_CALL',
  to: takerPaysIssuer || 'native',  // destination for pipeline tracking
  value: isXrpTakerGets ? takerGetsDrops : undefined,
  actionProvider: 'xrpl_dex',
  actionName: 'swap',
  calldata: JSON.stringify({
    xrplTxType: 'OfferCreate',
    TakerPays: { currency: 'USD', issuer: 'rIssuer...', value: '100' },
    TakerGets: '1000000',  // 1 XRP in drops
    Flags: 0x00080000,     // tfImmediateOrCancel
  }),
};

// RippleAdapter.buildContractCall() -- previously threw INVALID_INSTRUCTION
async buildContractCall(request: ContractCallParams): Promise<UnsignedTransaction> {
  if (!request.calldata) {
    throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
      message: 'XRPL does not support smart contracts. Use calldata with xrplTxType for native DEX operations.',
    });
  }

  const xrplParams = JSON.parse(request.calldata);

  switch (xrplParams.xrplTxType) {
    case 'OfferCreate': {
      const offer: OfferCreate = {
        TransactionType: 'OfferCreate',
        Account: request.from,
        TakerPays: xrplParams.TakerPays,
        TakerGets: xrplParams.TakerGets,
        Flags: xrplParams.Flags ?? 0,
        ...(xrplParams.Expiration && { Expiration: xrplParams.Expiration }),
      };
      return this.buildXrplNativeTx(offer);
    }
    case 'OfferCancel': {
      const cancel: OfferCancel = {
        TransactionType: 'OfferCancel',
        Account: request.from,
        OfferSequence: xrplParams.OfferSequence,
      };
      return this.buildXrplNativeTx(cancel);
    }
    default:
      throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
        message: `Unknown XRPL transaction type: ${xrplParams.xrplTxType}`,
      });
  }
}

// Shared builder (same pattern as buildTransaction for Payment)
private async buildXrplNativeTx(tx: Transaction): Promise<UnsignedTransaction> {
  const client = this.getClient();
  const autofilled = await client.autofill(tx);
  // Apply fee safety margin, serialize, set expiry -- identical to buildTransaction()
  const baseFee = BigInt(autofilled.Fee ?? '12');
  const safeFee = (baseFee * 120n) / 100n;
  autofilled.Fee = safeFee.toString();
  const txJson = JSON.stringify(autofilled);
  const serialized = new TextEncoder().encode(txJson);
  // ... return UnsignedTransaction
}
```

**Why this approach over alternatives:**
- ApiDirectResult + requiresSigningKey (Hyperliquid 패턴)은 부적합: XRPL DEX는 on-chain 네이티브 트랜잭션이므로 pipeline signing이 필요. Hyperliquid는 off-chain API 서명이라 근본적으로 다름.
- 새 TransactionType 추가 (e.g., 'DEX_ORDER')는 discriminatedUnion 9-type SSoT 전파 범위가 너무 큼 (Zod schema, DB CHECK constraints 6 tables, pipeline stage1/stage3/stage5, policy engine, notification, Admin UI, SDK, MCP 전체 변경). XRPL DEX 하나를 위해 아키텍처 핵심을 변경하는 것은 비용 대비 효과 불일치.

### Pattern 2: ApiDirectResult for Read-Only Queries

**What:** get_orderbook, get_offers는 on-chain 트랜잭션이 아닌 읽기 전용 RPC 호출. ApiDirectResult를 반환하여 pipeline을 완전히 우회.

**When to use:** 읽기 전용 action (호가 조회, 미체결 주문 조회)

**Trade-offs:**
- 장점: pipeline 우회로 트랜잭션 레코드/서명/정책 불필요한 곳에서 불필요한 오버헤드 제거
- 장점: 기존 ApiDirectResult 메커니즘(Hyperliquid에서 검증됨) 재사용
- 단점: 트랜잭션 이력에 남지 않음 (의도된 동작)

**Example:**
```typescript
// XrplDexProvider.resolve() for get_orderbook
if (actionName === 'get_orderbook') {
  const input = GetOrderbookInputSchema.parse(params);
  const orderbook = await this.orderbookClient.getOrderbook(
    input.base, input.counter, input.limit,
  );
  return {
    __apiDirect: true,
    externalId: `orderbook-${Date.now()}`,
    status: 'success',
    provider: 'xrpl_dex',
    action: 'get_orderbook',
    data: {
      bids: orderbook.bids,
      asks: orderbook.asks,
      spread: orderbook.spread,
    },
  } satisfies ApiDirectResult;
}
```

### Pattern 3: RPC Client Injection via Constructor

**What:** XrplDexProvider는 xrpl.Client에 접근이 필요(book_offers RPC). ActionContext에는 adapter가 포함되지 않으므로, Provider 생성 시 XrplOrderbookClient를 주입.

**When to use:** Provider가 adapter의 RPC 클라이언트와 별도로 읽기 전용 RPC 호출이 필요한 경우

**Trade-offs:**
- 장점: Provider-Adapter 결합도를 최소화 (IActionProvider 인터페이스 변경 불필요)
- 장점: orderbookClient가 자체 connection lifecycle 관리
- 단점: Provider 초기화 시 RPC URL 주입이 필요하므로 daemon-startup.ts에서 설정 주입 필요

**Example:**
```typescript
// daemon-startup.ts -- ripple chain 설정 시 조건부 등록
if (hasRippleWallets || config.rpc.xrpl_mainnet) {
  const xrplDexClient = new XrplOrderbookClient(rippleRpcUrl);
  const xrplDexProvider = new XrplDexProvider(xrplDexClient);
  registry.register(xrplDexProvider);
}
```

## Data Flow

### Swap (tfImmediateOrCancel) Flow

```
Agent: POST /v1/actions/xrpl_dex/swap
  { params: { takerGets: "XRP", takerGetsAmount: "1000000",
              takerPays: "USD.rIssuer", takerPaysAmount: "100",
              slippageBps: 50 } }
    |
    v
ActionProviderRegistry.executeResolve()
    |
    v
XrplDexProvider.resolve("swap", params, ctx)
    |-- 1. orderbookClient.getOrderbook() -- 현재 호가 조회
    |-- 2. 슬리피지 검증: 최소 수량 계산
    |-- 3. OfferCreate params 빌드 (tfImmediateOrCancel)
    |-- 4. ContractCallRequest 반환
    |      { type: 'CONTRACT_CALL', to: issuerAddr,
    |        calldata: JSON.stringify({ xrplTxType: 'OfferCreate', ... }),
    |        value: takerGetsAmount }
    v
Pipeline Stage 1: Validate + DB INSERT (type=CONTRACT_CALL)
    |
    v
Pipeline Stage 2: Session Auth
    |
    v
Pipeline Stage 3: Policy Evaluation
    |-- actionProvider='xrpl_dex' -> provider-trust bypass 또는 정책 평가
    |-- type=CONTRACT_CALL -> CONTRACT_WHITELIST/SPENDING_LIMIT 적용 가능
    v
Pipeline Stage 4: Wait (DELAY/APPROVAL if policy requires)
    |
    v
Pipeline Stage 5: Execute
    |-- buildByType(adapter, request, publicKey)
    |     -> case 'CONTRACT_CALL': adapter.buildContractCall()
    |         -> RippleAdapter: parse calldata JSON -> OfferCreate 빌드
    |         -> client.autofill(offerCreate) -> UnsignedTransaction
    |-- adapter.simulateTransaction() (autofill validation)
    |-- adapter.signTransaction() (Ed25519 via Wallet.sign())
    |-- adapter.submitTransaction() (client.submit(tx_blob))
    v
Pipeline Stage 6: Confirm
    |-- adapter.waitForConfirmation() (validated ledger)
    |-- DB UPDATE status=CONFIRMED
    |-- Notification: ACTION_EXECUTED
```

### Read-Only Query Flow (Orderbook)

```
Agent: POST /v1/actions/xrpl_dex/get_orderbook
  { params: { base: "XRP", counter: "USD.rIssuer", limit: 10 } }
    |
    v
ActionProviderRegistry.executeResolve()
    |
    v
XrplDexProvider.resolve("get_orderbook", params, ctx)
    |-- orderbookClient.getOrderbook(base, counter, limit)
    |     -> client.request({ command: 'book_offers', ... })
    |-- ApiDirectResult 반환
    v
actions.ts route handler
    |-- isApiDirectResult(result) === true
    |-- Pipeline 우회, 즉시 응답
    v
Response: { id: "orderbook-...", status: "success", data: { bids, asks, spread } }
```

### Limit Order + Partial Fill Tracking Flow

```
Agent: POST /v1/actions/xrpl_dex/limit_order
  { params: { takerGets: "1000000", takerPays: "USD.rIssuer:100",
              expiration: 3600 } }
    |
    v
XrplDexProvider.resolve("limit_order", ...)
    |-- OfferCreate WITHOUT tfImmediateOrCancel
    |-- Expiration = rippleEpoch + seconds
    |-- ContractCallRequest 반환
    v
Pipeline: full 6-stage execution
    |
    v
Agent: POST /v1/actions/xrpl_dex/get_offers
  { params: {} }
    |
    v
XrplDexProvider.resolve("get_offers", ...)
    |-- client.request({ command: 'account_offers', account: ctx.walletAddress })
    |-- ApiDirectResult: 미체결/부분체결 주문 목록
    v
Agent: POST /v1/actions/xrpl_dex/cancel_order
  { params: { offerSequence: 12345 } }
    |
    v
XrplDexProvider.resolve("cancel_order", ...)
    |-- OfferCancel tx params via calldata JSON
    |-- ContractCallRequest 반환
    v
Pipeline: full 6-stage execution
```

### Key Data Flows

1. **On-chain action (swap/limit/cancel):** Provider resolve() -> ContractCallRequest (calldata=XRPL JSON) -> Pipeline 6-stage -> RippleAdapter.buildContractCall() -> xrpl.Client autofill/sign/submit
2. **Read-only query (orderbook/offers):** Provider resolve() -> ApiDirectResult -> Pipeline bypass -> 즉시 응답
3. **RPC client lifecycle:** XrplOrderbookClient는 Provider 생성 시 RPC URL 주입, 자체 connection 관리, daemon shutdown 시 disconnect

## Integration Points

### Existing Components Modified

| Component | File | Change | Impact |
|-----------|------|--------|--------|
| **RippleAdapter.buildContractCall()** | `packages/adapters/ripple/src/adapter.ts` | `INVALID_INSTRUCTION` throw -> calldata JSON 파싱 -> OfferCreate/OfferCancel 빌드 | 핵심 변경. "XRPL does not support smart contracts" 에러를 XRPL native tx 라우팅으로 교체. calldata 없는 호출은 여전히 에러. |
| **RippleAdapter (private helper)** | `packages/adapters/ripple/src/adapter.ts` | buildXrplNativeTx() 공통 헬퍼 추출 -- autofill/serialize/fee margin 로직 재사용 | buildTransaction()과 코드 중복 제거 |
| **tx-parser.ts** | `packages/adapters/ripple/src/tx-parser.ts` | OfferCreate/OfferCancel 파싱 (현재 UNKNOWN 반환) | 트랜잭션 이력 표시 개선 |
| **daemon-startup.ts** | `packages/daemon/src/lifecycle/daemon-startup.ts` | XrplDexProvider 조건부 등록 (ripple chain 설정 시) | 기존 Provider 등록 패턴 동일 |
| **builtin-metadata.ts** | `packages/daemon/src/infrastructure/action/builtin-metadata.ts` | xrpl_dex 메타데이터 추가 | 기존 패턴 동일 |
| **Admin Settings** | settings keys | `actions.xrpl_dex_enabled` 추가 | 기존 패턴 동일 |

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| **XrplDexProvider** | `packages/actions/src/providers/xrpl-dex/index.ts` | IActionProvider: 5 actions, resolve() |
| **Zod input schemas** | `packages/actions/src/providers/xrpl-dex/schemas.ts` | swap/limit/cancel/orderbook/offers 입력 검증 |
| **XrplOrderbookClient** | `packages/actions/src/providers/xrpl-dex/orderbook-client.ts` | book_offers/account_offers RPC 래퍼 |
| **OfferBuilder** | `packages/actions/src/providers/xrpl-dex/offer-builder.ts` | OfferCreate/OfferCancel 파라미터 빌드, Currency Amount 변환, Flag 계산 |

### Unchanged Components (Pipeline 무변경 확인)

| Component | Why Unchanged |
|-----------|---------------|
| **buildByType() in stage5** | CONTRACT_CALL case가 이미 adapter.buildContractCall() 호출. XRPL 라우팅은 adapter 내부에서 calldata 파싱으로 처리. |
| **Stage 3 Policy** | CONTRACT_CALL 정책 평가 경로 그대로 사용. actionProvider='xrpl_dex'로 provider-trust bypass 가능. |
| **ActionProviderRegistry.executeResolve()** | ContractCallRequest 반환은 ContractCallRequestSchema.parse()로 재검증 -- calldata(string), to(string) 모두 기존 스키마 통과. ApiDirectResult도 기존 isApiDirectResult() 분기로 처리. |
| **ContractCallRequestSchema** | calldata(optional string), to(string), value(optional numeric string) 기존 필드로 XRPL params 인코딩 가능. 새 필드 불필요. |
| **IActionProvider interface** | resolve() 반환 타입 union이 이미 ContractCallRequest | ApiDirectResult 포함 |
| **MCP auto-exposure** | mcpExpose: true이면 getMcpExposedActions()로 자동 MCP 도구 노출 |
| **actions.ts route handler** | isApiDirectResult() 분기 + ContractCallRequest pipeline 실행 경로 모두 기존 코드 |

## Anti-Patterns

### Anti-Pattern 1: 새 TransactionType 추가 (e.g., DEX_ORDER)

**What people do:** discriminatedUnion에 10번째 타입 'DEX_ORDER'를 추가하여 OfferCreate를 표현
**Why it's wrong:** SSoT 전파 범위가 막대함 -- Zod schema, DB CHECK constraints 6 tables, pipeline stage1/stage3/stage5, policy engine evaluators, notification service, Admin UI, SDK types, MCP tools 전부 변경. XRPL DEX 하나를 위해 아키텍처 핵심을 변경하는 것은 과잉 설계.
**Do this instead:** CONTRACT_CALL + calldata에 XRPL params를 JSON 인코딩. 기존 pipeline이 그대로 동작하며 adapter 내부에서만 분기.

### Anti-Pattern 2: requiresSigningKey + ApiDirectResult 전용 (Hyperliquid 패턴 복사)

**What people do:** Hyperliquid처럼 Provider가 private key를 받아 직접 서명하고 API로 제출
**Why it's wrong:** XRPL DEX는 on-chain 네이티브 트랜잭션. 이미 RippleAdapter에 sign/submit 파이프라인이 완비되어 있음. requiresSigningKey를 사용하면 private key를 Provider에 노출하고, pipeline의 정책/지연/승인/서명/확인 단계를 모두 Provider 내부에서 재구현해야 함.
**Do this instead:** ContractCallRequest로 반환하여 pipeline이 서명/제출/확인을 처리. Provider는 파라미터 빌드만 담당.

### Anti-Pattern 3: Provider가 직접 xrpl.Client 생성/관리

**What people do:** XrplDexProvider 내부에서 `new Client(url).connect()`로 직접 WebSocket 연결
**Why it's wrong:** connection lifecycle 관리 분산, daemon shutdown 시 cleanup 누락 위험, RPC URL 하드코딩, 동일 endpoint에 중복 connection
**Do this instead:** XrplOrderbookClient를 별도로 생성하여 Provider constructor에 주입. daemon-startup에서 lifecycle 관리 (shutdown 시 disconnect 호출).

### Anti-Pattern 4: 모든 action을 ApiDirectResult로 처리

**What people do:** swap/limit/cancel도 ApiDirectResult로 반환하고 Provider 내부에서 직접 xrpl.Client로 제출
**Why it's wrong:** 정책 엔진 우회 (SPENDING_LIMIT, DELAY, APPROVAL 미적용), 트랜잭션 이력 미기록, 서명 파이프라인 재구현, 알림 누락
**Do this instead:** on-chain action은 반드시 ContractCallRequest로 반환하여 full pipeline을 거치도록 함. ApiDirectResult는 읽기 전용 쿼리(orderbook, offers)에만 사용.

## Suggested Build Order

의존성 기반 구현 순서:

1. **Phase 1: RippleAdapter.buildContractCall() 확장**
   - calldata JSON 파싱 -> xrplTxType 분기
   - OfferCreate: TakerPays/TakerGets/Flags/Expiration -> autofill -> UnsignedTransaction
   - OfferCancel: OfferSequence -> autofill -> UnsignedTransaction
   - buildXrplNativeTx() 공통 헬퍼 추출 (buildTransaction()과 코드 공유)
   - tx-parser.ts에 OfferCreate/OfferCancel 파싱 추가
   - calldata 없는 호출은 여전히 기존 에러 유지
   - **이유:** Provider가 반환한 ContractCallRequest가 실제로 실행되려면 adapter가 먼저 준비되어야 함

2. **Phase 2: XrplDexProvider 핵심 (swap + limit_order + cancel_order)**
   - Zod input schemas (SwapInputSchema, LimitOrderInputSchema, CancelOrderInputSchema)
   - OfferBuilder (Currency Amount 변환: XRP drops vs IOU {currency, issuer, value}, Flag 계산)
   - XrplOrderbookClient (book_offers RPC -- swap 시 현재가 조회에 필요)
   - resolve() -> ContractCallRequest (on-chain actions)
   - 슬리피지 보호: book_offers로 현재 호가 조회 -> 실효 환율 계산 -> tfImmediateOrCancel로 즉시 체결 보장
   - **이유:** on-chain action이 핵심 가치, Phase 1의 adapter 변경에 의존

3. **Phase 3: Read-only queries + Integration**
   - get_orderbook: book_offers -> ApiDirectResult
   - get_offers: account_offers -> ApiDirectResult
   - daemon-startup.ts 등록, builtin-metadata, Admin Settings
   - MCP 도구 자동 노출 검증
   - Admin UI: XRPL DEX 활성화 토글, 트랜잭션 이력에서 OfferCreate/OfferCancel 표시 (tx-parser 연동)
   - **이유:** read-only는 pipeline 변경 없이 동작하므로 마지막에 추가. 통합 테스트는 Phase 1+2 완료 후 가능.

## Sources

- XRPL OfferCreate: https://xrpl.org/docs/references/protocol/transactions/types/offercreate
- XRPL OfferCancel: https://xrpl.org/docs/references/protocol/transactions/types/offercancel
- XRPL DEX Offers concept: https://xrpl.org/docs/concepts/tokens/decentralized-exchange/offers
- xrpl.js OfferCreate type: https://js.xrpl.org/interfaces/OfferCreate.html
- xrpl.js OfferCancel type: https://js.xrpl.org/interfaces/OfferCancel.html
- XRPL Create Offers tutorial: https://xrpl.org/docs/tutorials/javascript/send-payments/create-offers
- 코드베이스 직접 분석:
  - `packages/core/src/interfaces/action-provider.types.ts` -- IActionProvider, ApiDirectResult, isApiDirectResult()
  - `packages/core/src/schemas/transaction.schema.ts` -- ContractCallRequestSchema (calldata: string optional)
  - `packages/daemon/src/infrastructure/action/action-provider-registry.ts` -- executeResolve(), ContractCallRequestSchema.parse() 재검증
  - `packages/daemon/src/pipeline/stage5-execute.ts` -- buildByType() CONTRACT_CALL -> adapter.buildContractCall()
  - `packages/daemon/src/api/routes/actions.ts` -- action route handler, isApiDirectResult() 분기, pipeline 실행
  - `packages/adapters/ripple/src/adapter.ts` -- RippleAdapter, buildContractCall() throws INVALID_INSTRUCTION, buildTransaction() autofill 패턴
  - `packages/actions/src/providers/hyperliquid/perp-provider.ts` -- ApiDirectResult + requiresSigningKey 패턴 (비교용)
  - `packages/actions/src/providers/jupiter-swap/index.ts` -- ContractCallRequest 반환 패턴 (참조)

---
*Architecture research for: XRPL DEX Action Provider integration with WAIaaS pipeline*
*Researched: 2026-04-03*
