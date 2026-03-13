# Architecture Patterns: EVM RPC Proxy Integration

**Domain:** EVM JSON-RPC proxy mode for existing WAIaaS daemon
**Researched:** 2026-03-13
**Confidence:** HIGH (based on direct codebase analysis of existing components)

## Recommended Architecture

EVM RPC 프록시는 기존 WAIaaS 데몬에 **새 라우트 계층 + RPC 디스패처 + 동기 파이프라인 래퍼**를 추가하는 형태로 통합한다. 기존 6-stage 파이프라인, 정책 엔진, EventBus, RPC Pool, tx-parser 등 핵심 컴포넌트를 그대로 재사용하고, RPC 프록시 전용 신규 코드는 최소화한다.

```
[Forge/Hardhat/viem]
       |
       | POST /v1/rpc-evm/:walletId/:chainId
       | JSON-RPC 2.0 {"method": "eth_sendTransaction", ...}
       |
   [sessionAuth middleware]
       |
   [RPC Proxy Route Handler]
       |
       +-- classify(method) --> INTERCEPT | PASSTHROUGH | UNSUPPORTED
       |
       |-- PASSTHROUGH -----> [RPC Pool.getUrl(network)] --> upstream RPC --> JSON-RPC response
       |
       |-- INTERCEPT -------> [RPC Method Handler]
       |                         |
       |                         +-- eth_sendTransaction --> [RpcTransactionAdapter]
       |                         |      |
       |                         |      +-- ethTxParams --> WAIaaS TransactionRequest 변환
       |                         |      +-- tx-parser selector 감지 (타입 분류)
       |                         |      +-- to=null --> CONTRACT_DEPLOY
       |                         |      |
       |                         |      +-- [SyncPipelineExecutor]
       |                         |             |
       |                         |             +-- stage1 -> stage2 -> stage3 -> stage3.5
       |                         |             +-- stage4Wait:
       |                         |             |     INSTANT: continue to stage5/6
       |                         |             |     DELAY: long-poll (CompletionWaiter)
       |                         |             |     APPROVAL: long-poll (CompletionWaiter)
       |                         |             +-- stage5 -> stage6
       |                         |             +-- return txHash
       |                         |
       |                         +-- eth_signTransaction --> sign-only pipeline
       |                         +-- eth_accounts --> session wallet address
       |                         +-- personal_sign --> sign-message pipeline
       |                         +-- eth_signTypedData_v4 --> sign-message (EIP-712)
       |
       |-- UNSUPPORTED -----> JSON-RPC error -32601
```

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|--------------|
| `rpc-proxy.ts` (route) | Hono route `/v1/rpc-evm/:walletId/:chainId`, sessionAuth, JSON-RPC 2.0 파싱, batch 처리 | RpcDispatcher | **NEW** |
| `RpcDispatcher` | method 분류 (intercept/passthrough/unsupported), 핸들러 라우팅 | Method handlers, Passthrough | **NEW** |
| `RpcMethodHandlers` | eth_sendTransaction 등 서명 메서드 핸들러 | SyncPipelineExecutor, sign-only, sign-message | **NEW** |
| `RpcPassthrough` | 읽기 메서드를 upstream RPC로 포워딩 | RpcPool | **NEW** |
| `SyncPipelineExecutor` | 기존 stage1-6을 동기 모드로 실행, DELAY/APPROVAL long-poll | stages.ts, EventBus, CompletionWaiter | **NEW** |
| `CompletionWaiter` | EventBus 기반 트랜잭션 완료 대기, txId->Promise 관리 | EventBus | **NEW** |
| `RpcTransactionAdapter` | eth_sendTransaction params --> WAIaaS TransactionRequest 변환 | tx-parser.ts | **NEW** |
| `EVM_CHAIN_MAP` | chainId 숫자 --> WAIaaS NetworkType slug 매핑 | RpcPool | **EXISTING** (역방향 lookup 추가) |
| `tx-parser.ts` | selector 기반 트랜잭션 타입 분류 | RpcTransactionAdapter | **MODIFIED** (NFT selector 확장) |
| `stages.ts` | 6-stage 파이프라인 | SyncPipelineExecutor | **MODIFIED** (CONTRACT_DEPLOY 분기) |
| `EventBus` | transaction:completed/failed 이벤트 | CompletionWaiter | **EXISTING** (변경 없음) |
| `RpcPool` | 네트워크별 RPC URL 로테이션 + 헬스체크 | RpcPassthrough, Adapter | **EXISTING** (변경 없음) |
| `ApprovalWorkflow` | APPROVAL 티어 승인/거부/만료 관리 | SyncPipelineExecutor | **EXISTING** (onApproved 콜백 활용) |
| `DelayQueue` | DELAY 티어 쿨다운 관리 | SyncPipelineExecutor | **EXISTING** (isExpired 활용) |
| Admin Settings | rpc_proxy.* 설정 | RPC Proxy Route | **MODIFIED** (설정 키 추가) |

### Data Flow

#### 1. Passthrough (읽기 메서드)

```
Client --> POST /v1/rpc-evm/:walletId/:chainId
  --> sessionAuth 검증
  --> chainId --> resolveNetworkByChainId() --> NetworkType slug
  --> RpcPool.getUrl(networkSlug) --> upstream RPC URL
  --> fetch(upstreamUrl, { body: originalJsonRpc })
  --> upstream 응답 그대로 반환
```

#### 2. eth_sendTransaction (INSTANT 티어)

```
Client --> POST /v1/rpc-evm/:walletId/:chainId
  --> sessionAuth 검증
  --> JSON-RPC params[0] = {from, to, value, data, gas, ...}
  --> RpcTransactionAdapter.convert():
      - to=null --> CONTRACT_DEPLOY
      - to + data(0xa9059cbb) --> TOKEN_TRANSFER
      - to + data(0x095ea7b3) --> APPROVE
      - to + data(other) --> CONTRACT_CALL
      - to + no data --> TRANSFER
  --> SyncPipelineExecutor.execute():
      - stage1Validate (DB INSERT, PENDING)
      - stage2Auth (sessionId passthrough)
      - stage3Policy (정책 평가 --> tier=INSTANT)
      - stage3_5GasCondition (skip)
      - stage4Wait (INSTANT --> passthrough)
      - stage5Execute (build, simulate, sign, submit)
      - stage6Confirm (confirmation wait)
      - return txHash
  --> JSON-RPC response: { result: "0x..." }
```

#### 3. eth_sendTransaction (DELAY/APPROVAL 티어 - Long-Poll)

```
Client --> POST /v1/rpc-evm/:walletId/:chainId
  --> sessionAuth 검증
  --> RpcTransactionAdapter.convert() --> TransactionRequest
  --> SyncPipelineExecutor.execute():
      - stage1-3 실행
      - stage4Wait에서 PIPELINE_HALTED throw

      [핵심 설계] SyncPipelineExecutor가 PIPELINE_HALTED를 catch하고
      CompletionWaiter.waitForCompletion(txId, timeoutMs)로 위임

      기존 체인이 나머지를 처리:
      - DELAY: BackgroundWorker --> processExpired --> executeFromStage5
      - APPROVAL: onApproved --> handleApprovalApproved --> executeFromStage5
      --> stage5Execute + stage6Confirm
      --> EventBus emit('transaction:completed', {txId, txHash})
      --> CompletionWaiter Promise resolve(txHash)

      타임아웃 시:
      - JSON-RPC error: { code: -32000, message: "Transaction timeout (txId: ...)" }

  --> JSON-RPC response: { result: "0x..." }
```

## Patterns to Follow

### Pattern 1: EventBus 기반 완료 대기 (CompletionWaiter)

RPC 프록시의 핵심 신규 패턴. 기존 fire-and-forget 파이프라인의 완료를 동기적으로 대기한다.

**What:** `txId -> Promise<txHash>` 매핑을 관리하는 CompletionWaiter. EventBus의 `transaction:completed`/`transaction:failed` 이벤트를 구독하여 해당 txId의 Promise를 resolve/reject.

**When:** RPC 프록시에서 DELAY/APPROVAL 티어 `eth_sendTransaction` 처리 시.

**Example:**
```typescript
class CompletionWaiter {
  private pending = new Map<string, {
    resolve: (txHash: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  constructor(private eventBus: EventBus) {
    // 전역 리스너 1회 등록 -- 모든 RPC 요청 공유
    this.eventBus.on('transaction:completed', (ev) => {
      const entry = this.pending.get(ev.txId);
      if (entry) {
        clearTimeout(entry.timer);
        entry.resolve(ev.txHash);
        this.pending.delete(ev.txId);
      }
    });

    this.eventBus.on('transaction:failed', (ev) => {
      const entry = this.pending.get(ev.txId);
      if (entry) {
        clearTimeout(entry.timer);
        entry.reject(new Error(ev.error));
        this.pending.delete(ev.txId);
      }
    });
  }

  waitForCompletion(txId: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(txId);
        reject(new Error(`Transaction timeout after ${timeoutMs}ms (txId: ${txId})`));
      }, timeoutMs);

      this.pending.set(txId, { resolve, reject, timer });
    });
  }

  dispose(): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('CompletionWaiter disposed'));
    }
    this.pending.clear();
  }
}
```

**Why this pattern:**
- 기존 `handleApprovalApproved` --> `executeFromStage5` --> stage5/6 --> EventBus `transaction:completed` 체인을 그대로 활용
- DelayQueue `processExpired` --> `executeFromStage5` --> EventBus 체인도 동일
- 파이프라인 코드 변경 최소화 (stage4Wait의 PIPELINE_HALTED 동작 유지)
- 여러 RPC 요청이 동시에 대기 가능 (Map 기반, 전역 리스너 2개만)

### Pattern 2: JSON-RPC 2.0 Protocol Handler

**What:** JSON-RPC 2.0 스펙 준수 파서/시리얼라이저. single + batch request 모두 처리.

**When:** 모든 RPC 프록시 요청.

**Example:**
```typescript
interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown[];
  id: string | number | null;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function jsonRpcSuccess(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// Batch: 배열로 들어오면 Promise.all로 병렬 처리
async function handleBatch(
  requests: JsonRpcRequest[],
  handler: (req: JsonRpcRequest) => Promise<JsonRpcResponse>,
): Promise<JsonRpcResponse[]> {
  return Promise.all(requests.map(handler));
}
```

### Pattern 3: EVM Chain ID 역방향 Lookup

**What:** `EVM_CHAIN_MAP`에서 chainId 숫자 --> NetworkType slug 역방향 매핑.

**When:** RPC 프록시 URL의 `:chainId` 파라미터 해석 시.

**Example:**
```typescript
// evm-chain-map.ts에 추가
const CHAIN_ID_TO_NETWORK = new Map<number, EvmNetworkType>();
for (const [network, entry] of Object.entries(EVM_CHAIN_MAP)) {
  CHAIN_ID_TO_NETWORK.set(entry.chainId, network as EvmNetworkType);
}

export function resolveNetworkByChainId(chainId: number): EvmNetworkType {
  const network = CHAIN_ID_TO_NETWORK.get(chainId);
  if (!network) {
    throw new Error(`Unknown EVM chainId: ${chainId}`);
  }
  return network;
}
```

### Pattern 4: SyncPipelineExecutor (PIPELINE_HALTED 외부 래핑)

**What:** 기존 파이프라인 stages를 호출하되, stage4Wait의 PIPELINE_HALTED를 catch하여 CompletionWaiter로 위임하는 래퍼.

**When:** RPC 프록시에서 서명 트랜잭션 처리 시.

**Example:**
```typescript
class SyncPipelineExecutor {
  constructor(
    private completionWaiter: CompletionWaiter,
    private settingsService: SettingsService,
  ) {}

  async execute(ctx: PipelineContext): Promise<string> {
    // Stage 1-3: 항상 직접 실행
    await stage1Validate(ctx);
    await stage2Auth(ctx);
    await stage3Policy(ctx);
    await stage3_5GasCondition(ctx);

    try {
      // Stage 4: INSTANT이면 passthrough, DELAY/APPROVAL이면 PIPELINE_HALTED throw
      await stage4Wait(ctx);
    } catch (err) {
      if (err instanceof WAIaaSError && err.code === 'PIPELINE_HALTED') {
        // DELAY/APPROVAL: 기존 워크플로우가 stage5-6을 실행하고 EventBus emit
        // CompletionWaiter가 EventBus 이벤트로 완료 대기
        const timeoutMs = this.resolveTimeout(ctx.tier);
        return this.completionWaiter.waitForCompletion(ctx.txId, timeoutMs);
      }
      throw err;
    }

    // INSTANT: stage5-6 직접 실행
    await stage5Execute(ctx);
    await stage6Confirm(ctx);

    return ctx.submitResult?.txHash ?? '';
  }

  private resolveTimeout(tier?: string): number {
    if (tier === 'DELAY') {
      const s = this.settingsService.get('rpc_proxy.delay_timeout_seconds');
      return (s ? parseInt(s, 10) : 300) * 1000;
    }
    // APPROVAL
    const s = this.settingsService.get('rpc_proxy.approval_timeout_seconds');
    return (s ? parseInt(s, 10) : 600) * 1000;
  }
}
```

**핵심:** stage4Wait 내부 코드를 0줄 변경. PIPELINE_HALTED throw 동작은 기존 fire-and-forget 경로에서도 동일하게 유지.

## Anti-Patterns to Avoid

### Anti-Pattern 1: stage4Wait 내부에 syncMode 분기 추가

**What:** `stage4Wait(ctx)` 함수 내에 `if (ctx.syncMode)` 분기를 넣어 DELAY/APPROVAL 시 PIPELINE_HALTED 대신 직접 대기하도록 변경.

**Why bad:**
- 기존 stage4Wait의 깔끔한 "halt and delegate" 패턴을 오염
- fire-and-forget 경로의 모든 테스트에 영향
- PIPELINE_HALTED catch를 사용하는 다른 소비자(transactions.ts)에 혼동

**Instead:** SyncPipelineExecutor가 외부에서 PIPELINE_HALTED를 catch. stage4Wait는 0줄 변경.

### Anti-Pattern 2: RPC 프록시 전용 파이프라인 경로 신설

**What:** 기존 6-stage 파이프라인과 별도로 RPC 전용 파이프라인을 만드는 것.

**Why bad:**
- 정책 엔진, 감사 로그, 알림 등 모든 기능 복제
- 두 경로의 동작 불일치 리스크
- 유지보수 비용 2배

**Instead:** 기존 파이프라인을 그대로 사용, 실행 모드(fire-and-forget vs sync)만 래퍼에서 제어.

### Anti-Pattern 3: 클라이언트 측 폴링 응답

**What:** RPC 프록시에서도 REST API처럼 txId를 즉시 반환하고 클라이언트가 별도 폴링.

**Why bad:**
- JSON-RPC는 `result: txHash` 형태의 동기 응답을 기대
- Forge/Hardhat에 WAIaaS 폴링 로직을 추가 불가
- EVM 개발 도구 호환성 목표에 정면 반대

**Instead:** HTTP long-poll. 서버가 완료까지 응답을 보류.

### Anti-Pattern 4: INSTANT 전용 (DELAY/APPROVAL 거부)

**What:** RPC 프록시에서 INSTANT 이외의 정책 티어를 즉시 에러로 거부.

**Why bad:**
- 정책 엔진의 보안 기능을 무력화
- "RPC 프록시 쓰면 정책 우회 가능" 보안 구멍
- 컨트랙트 배포 같은 고위험 작업에 APPROVAL 적용 불가

**Instead:** Long-poll로 DELAY/APPROVAL 대기. 클라이언트 타임아웃만 문서화.

## 신규 vs 수정 컴포넌트 매트릭스

| Component | Status | Package | File Path (예상) |
|-----------|--------|---------|-----------------|
| RPC Proxy Route | **NEW** | daemon | `api/routes/rpc-proxy.ts` |
| RpcDispatcher | **NEW** | daemon | `rpc-proxy/dispatcher.ts` |
| RpcMethodHandlers | **NEW** | daemon | `rpc-proxy/method-handlers.ts` |
| RpcPassthrough | **NEW** | daemon | `rpc-proxy/passthrough.ts` |
| SyncPipelineExecutor | **NEW** | daemon | `rpc-proxy/sync-pipeline.ts` |
| CompletionWaiter | **NEW** | daemon | `rpc-proxy/completion-waiter.ts` |
| RpcTransactionAdapter | **NEW** | daemon | `rpc-proxy/tx-adapter.ts` |
| JSON-RPC Protocol Utils | **NEW** | daemon | `rpc-proxy/json-rpc.ts` |
| EVM_CHAIN_MAP | **MODIFIED** | evm-adapter | `evm-chain-map.ts` (역방향 lookup 추가) |
| tx-parser.ts | **MODIFIED** | evm-adapter | `tx-parser.ts` (NFT selector 확장) |
| TRANSACTION_TYPES | **MODIFIED** | core | `enums/transaction.ts` (CONTRACT_DEPLOY 추가) |
| TransactionRequestSchema | **MODIFIED** | core | `schemas/transaction.schema.ts` (CONTRACT_DEPLOY variant) |
| PipelineContext | **MODIFIED** | daemon | `pipeline/stages.ts` (source 필드 추가) |
| SettingsSchema | **MODIFIED** | daemon | `config/settings.schema.ts` (rpc_proxy.* 추가) |
| connect-info schema | **MODIFIED** | core | `schemas/connect-info.schema.ts` (rpcProxyUrl 필드) |
| DB migration v58 | **NEW** | daemon | `database/migrations/v58.ts` |
| Admin UI RPC section | **NEW** | admin | `pages/rpc-proxy/` |
| MCP get_rpc_proxy_url | **NEW** | mcp | `tools/rpc-proxy.ts` |
| SDK getRpcProxyUrl | **NEW** | sdk | method 추가 |

## Suggested Build Order

의존 관계 기반 최적 빌드 순서:

### Phase 1: Foundation (의존성 없음, 독립 빌드 가능)

1. **JSON-RPC Protocol Utils** (`rpc-proxy/json-rpc.ts`)
   - JsonRpcRequest/Response 타입, 헬퍼, batch 처리
   - 의존성: 없음

2. **EVM_CHAIN_MAP 역방향 lookup** (`evm-chain-map.ts`)
   - `resolveNetworkByChainId(chainId: number): EvmNetworkType`
   - 의존성: 기존 EVM_CHAIN_MAP

3. **TRANSACTION_TYPES 9-type 확장 + DB migration v58**
   - core: enum + Zod discriminatedUnion + OpenAPI
   - daemon: DB migration v58 (CHECK 제약)
   - 의존성: Zod SSoT 체인

4. **tx-parser.ts NFT selector 확장 + CONTRACT_DEPLOY**
   - 의존성: CONTRACT_DEPLOY 타입

### Phase 2: Core RPC Proxy (Phase 1 후)

5. **RpcTransactionAdapter** -- eth_sendTransaction params 변환
6. **CompletionWaiter** -- EventBus 기반 완료 대기
7. **RpcPassthrough** -- 읽기 메서드 upstream 포워딩
8. **SyncPipelineExecutor** -- 동기 모드 파이프라인 래퍼

### Phase 3: Assembly + Route (Phase 2 후)

9. **RpcMethodHandlers** -- 인터셉트 메서드 핸들러 통합
10. **RpcDispatcher** -- method 분류 + 라우팅
11. **RPC Proxy Route** -- Hono 라우트 등록 + Admin Settings

### Phase 4: Integration + DX (Phase 3 후)

12. **Admin Settings + Admin UI**
13. **MCP + SDK + connect-info 확장**
14. **테스트 + E2E (Forge 호환성)**

## Scalability Considerations

| Concern | 10 concurrent | 100 concurrent | 1000 concurrent |
|---------|--------------|----------------|-----------------|
| CompletionWaiter Map | No issue | No issue | Lightweight entries, OK |
| Long-poll connections | OK | `maxConnections` 확인 | 타임아웃 단축 권장 |
| EventBus listeners | 전역 2개 | 전역 2개 (Map lookup) | 전역 2개 |
| RpcPool upstream | 기존 로테이션 충분 | 기존 로테이션 충분 | Rate limit 강화 |

## Sources

- 기존 코드 직접 분석 (HIGH confidence):
  - `packages/core/src/events/event-bus.ts` -- EventBus 구현
  - `packages/core/src/events/event-types.ts` -- transaction:completed/failed 이벤트
  - `packages/daemon/src/pipeline/stages.ts` -- 6-stage, PIPELINE_HALTED, stage4Wait
  - `packages/daemon/src/api/routes/transactions.ts` -- REST fire-and-forget 패턴
  - `packages/daemon/src/workflow/approval-workflow.ts` -- onApproved 콜백
  - `packages/daemon/src/workflow/delay-queue.ts` -- DELAY processExpired
  - `packages/daemon/src/lifecycle/daemon.ts` -- handleApprovalApproved, executeFromStage5
  - `packages/adapters/evm/src/tx-parser.ts` -- ERC-20 selector 감지
  - `packages/adapters/evm/src/evm-chain-map.ts` -- chainId <-> NetworkType 매핑
  - `packages/core/src/rpc/rpc-pool.ts` -- RPC 엔드포인트 로테이션
  - `internal/objectives/m31-14-rpc-proxy.md` -- 요구사항 정의
