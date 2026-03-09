# Architecture Patterns: Across Protocol Cross-Chain Bridge

**Domain:** DeFi Cross-Chain Bridge (Intent-based)
**Researched:** 2026-03-08

## Recommended Architecture

Across Protocol 통합은 기존 WAIaaS 아키텍처의 4가지 검증된 패턴을 조합한다:
1. **IActionProvider** (LI.FI/DCent 선례) -- AcrossBridgeActionProvider
2. **AsyncPollingService + IAsyncStatusTracker** (LI.FI BridgeStatusTracker 선례) -- AcrossBridgeStatusTracker
3. **CONTRACT_CALL + BATCH** (ERC-20 approve + depositV3)
4. **IncomingTxMonitor** (v27.1) -- 목적지 체인 Relayer fill 자동 감지 (보조)

### High-Level Flow

```
[Agent/MCP] --quote--> AcrossBridgeActionProvider
                           |
                    AcrossApiClient.getSuggestedFees()
                           |
                    resolve() --> ContractCallRequest[]
                           |  (approve + depositV3 BATCH)
                           v
                    6-Stage Pipeline (CONTRACT_CALL)
                           |
                    Stage 5: Execute on origin chain
                           |
                    Post-execution: Enroll bridge_status='PENDING'
                           |           tracker='across-bridge'
                           v
                    AsyncPollingService
                           |
                    AcrossBridgeStatusTracker.checkStatus()
                           | (GET /deposit/status)
                           v
                    bridge_status -> COMPLETED/FAILED/TIMEOUT
                           |
                    [Optional] IncomingTxMonitor detects fill
                              on destination chain
```

### Component Boundaries

| Component | Responsibility | Package | Communicates With |
|-----------|---------------|---------|-------------------|
| `AcrossBridgeActionProvider` | IActionProvider: quote/execute/status/routes/limits 5 actions | `@waiaas/actions` | AcrossApiClient, ActionProviderRegistry |
| `AcrossApiClient` | HTTP client for Across API (suggested-fees, limits, available-routes, deposit/status) | `@waiaas/actions` | Across API (`https://app.across.to/api`) |
| `AcrossBridgeStatusTracker` | IAsyncStatusTracker: deposit status polling (Phase 1: active) | `@waiaas/actions` | AcrossApiClient, AsyncPollingService |
| `AcrossBridgeMonitoringTracker` | IAsyncStatusTracker: reduced-frequency monitoring (Phase 2) | `@waiaas/actions` | AcrossApiClient, AsyncPollingService |
| `AcrossConfig` | 설정 타입 + 기본값 + 체인 ID 매핑 + SpokePool 주소 | `@waiaas/actions` | Admin Settings |
| Bridge enrollment logic | Post-execution bridgeStatus='PENDING' 등록 | `@waiaas/daemon` | actions route, DB |

### Data Flow

**1. Quote (read-only)**
```
Agent -> MCP tool "across_bridge_quote"
      -> AcrossBridgeActionProvider.resolve('quote', params)
      -> AcrossApiClient.getSuggestedFees(inputToken, outputToken, originChainId, destChainId, amount)
      -> Return: { outputAmount, totalRelayFee, fillDeadline, estimatedFillTimeSec, limits }
```

**2. Execute (on-chain)**
```
Agent -> MCP tool "across_bridge_execute"
      -> AcrossBridgeActionProvider.resolve('execute', params)
      -> [ERC-20 token?] ContractCallRequest[] = [approve, depositV3]
      -> [Native token?]  ContractCallRequest[] = [depositV3 with value]
      -> 6-stage pipeline (CONTRACT_CALL or BATCH)
      -> Stage 5 Execute: SpokePool.depositV3() on origin chain
      -> Post-execution: DB update bridge_status='PENDING', bridge_metadata={tracker:'across-bridge', depositId, originChainId, destChainId, txHash}
```

**3. Status Tracking (async)**
```
AsyncPollingService (30s interval, per-tracker timing)
      -> Query DB: bridge_status IN ('PENDING', 'BRIDGE_MONITORING')
      -> resolveTrackerName -> metadata.tracker = 'across-bridge'
      -> AcrossBridgeStatusTracker.checkStatus(txId, metadata)
      -> AcrossApiClient.getDepositStatus(depositTxnRef: txHash)
      -> Map response: filled->COMPLETED, pending->PENDING, expired->TIMEOUT, refunded->REFUNDED
      -> DB update: bridge_status, bridge_metadata (fillTxnRef, destTxHash)
      -> Notification: BRIDGE_COMPLETED / BRIDGE_FAILED / BRIDGE_TIMEOUT
```

**4. Destination Detection (optional, automatic)**
```
IncomingTxMonitor (destination chain wallet 구독 중일 때)
      -> Relayer fill = ERC-20 transfer TO wallet address OR native ETH transfer
      -> 자동 감지: INCOMING_TX_DETECTED 알림
      -> 별도 bridge_status 업데이트 불필요 (AsyncPollingService가 Across API로 추적)
```

## Patterns to Follow

### Pattern 1: LI.FI-style ActionProvider (검증된 선례)

**What:** AcrossBridgeActionProvider는 LiFiActionProvider와 동일한 구조를 따른다.
**When:** 새로운 브릿지/DeFi 프로토콜 통합 시.
**Why:** LI.FI, DCent, Lido, Aave 등 11개 프로바이더가 모두 이 패턴으로 동작 검증 완료.

```typescript
export class AcrossBridgeActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'across_bridge',
    description: 'Across Protocol intent-based cross-chain bridge with fast relayer fills (2-10 seconds)',
    version: '1.0.0',
    chains: ['ethereum'],  // multi-chain via fromChain/toChain params
    mcpExpose: true,
    requiresApiKey: false,  // Across API 무료 (integrator ID 권장)
    requiredApis: ['across'],
    requiresSigningKey: false,  // on-chain TX, no API signing needed
  };

  readonly actions: readonly ActionDefinition[] = [
    { name: 'quote',   description: '...', chain: 'ethereum', inputSchema: AcrossQuoteInputSchema,   riskLevel: 'low',  defaultTier: 'INSTANT' },
    { name: 'execute', description: '...', chain: 'ethereum', inputSchema: AcrossExecuteInputSchema, riskLevel: 'high', defaultTier: 'DELAY' },
    { name: 'status',  description: '...', chain: 'ethereum', inputSchema: AcrossStatusInputSchema,  riskLevel: 'low',  defaultTier: 'INSTANT' },
    { name: 'routes',  description: '...', chain: 'ethereum', inputSchema: AcrossRoutesInputSchema,  riskLevel: 'low',  defaultTier: 'INSTANT' },
    { name: 'limits',  description: '...', chain: 'ethereum', inputSchema: AcrossLimitsInputSchema,  riskLevel: 'low',  defaultTier: 'INSTANT' },
  ] as const;

  async resolve(actionName: string, params: Record<string, unknown>, context: ActionContext):
    Promise<ContractCallRequest | ContractCallRequest[]> {
    // quote/status/routes/limits -> read-only (return minimal ContractCallRequest for pipeline compatibility)
    // execute -> approve + depositV3 ContractCallRequest[]
  }
}
```

### Pattern 2: Approve + DepositV3 BATCH Flow

**What:** ERC-20 토큰 브릿지 시 approve + depositV3를 ContractCallRequest[]로 반환하여 BATCH 파이프라인 사용.
**When:** ERC-20 토큰 크로스체인 전송.

```typescript
// resolve('execute', ...) 내부
async resolveExecute(params: AcrossExecuteInput, context: ActionContext):
  Promise<ContractCallRequest[]> {

  // 1. Get suggested fees from Across API
  const fees = await this.apiClient.getSuggestedFees({
    inputToken: params.inputToken,
    outputToken: params.outputToken,
    originChainId: getAcrossChainId(params.fromChain),
    destinationChainId: getAcrossChainId(params.toChain),
    amount: params.amount,
  });

  // 2. Calculate outputAmount from suggested fees
  // outputAmount = inputAmount - totalRelayFee (Across API provides this)
  const outputAmount = fees.outputAmount ?? calculateOutputAmount(params.amount, fees.totalRelayFee.pct);

  // 3. Build depositV3 calldata via viem encodeFunctionData
  const depositCalldata = encodeFunctionData({
    abi: SPOKE_POOL_ABI,
    functionName: 'depositV3',
    args: [
      context.walletAddress,                     // depositor
      params.recipient ?? context.walletAddress,  // recipient
      params.inputToken,                          // inputToken
      params.outputToken,                         // outputToken
      BigInt(params.amount),                      // inputAmount
      BigInt(outputAmount),                       // outputAmount
      BigInt(getAcrossChainId(params.toChain)),   // destinationChainId
      fees.exclusiveRelayer ?? zeroAddress,        // exclusiveRelayer
      fees.timestamp,                             // quoteTimestamp
      calculateFillDeadline(fees.fillDeadline),   // fillDeadline
      fees.exclusivityDeadline ?? 0,              // exclusivityDeadline
      '0x',                                       // message (empty)
    ],
  });

  const spokePoolAddress = getSpokePoolAddress(params.fromChain);

  // 4. ERC-20: approve + depositV3 (BATCH)
  if (!isNativeToken(params.inputToken)) {
    return [
      {
        type: 'CONTRACT_CALL',
        to: params.inputToken,
        calldata: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [spokePoolAddress, BigInt(params.amount)],
        }),
      },
      {
        type: 'CONTRACT_CALL',
        to: spokePoolAddress,
        calldata: depositCalldata,
      },
    ];
  }

  // 5. Native token: depositV3 with msg.value
  return [{
    type: 'CONTRACT_CALL',
    to: spokePoolAddress,
    calldata: depositCalldata,
    value: params.amount,  // msg.value = inputAmount
  }];
}
```

### Pattern 3: Two-Phase Bridge Status Tracker (LI.FI 선례 응용)

**What:** Active polling (15s x 480 = 2h) -> Reduced monitoring (5min x 264 = 22h) -> TIMEOUT.
**When:** Across deposit 후 fill 완료 추적.
**Why:** Across의 Relayer fill은 보통 2-10초 내 완료되지만, 네트워크 혼잡 시 지연 가능. LI.FI 30초 대비 Across는 빠르므로 초기 폴링 간격을 15초로 줄인다.

```typescript
export class AcrossBridgeStatusTracker implements IAsyncStatusTracker {
  readonly name = 'across-bridge';
  readonly maxAttempts = 480;          // 480 x 15s = 2 hours
  readonly pollIntervalMs = 15_000;    // 15초 (Across fills faster)
  readonly timeoutTransition = 'BRIDGE_MONITORING' as const;

  async checkStatus(_txId: string, metadata: Record<string, unknown>): Promise<AsyncTrackingResult> {
    const depositTxHash = metadata.txHash as string;
    if (!depositTxHash) return { state: 'PENDING', details: { error: 'No txHash in metadata' } };

    const response = await this.apiClient.getDepositStatus({ depositTxnRef: depositTxHash });
    return mapAcrossStatus(response);
  }
}

function mapAcrossStatus(response: AcrossDepositStatusResponse): AsyncTrackingResult {
  switch (response.status) {
    case 'filled':
      return {
        state: 'COMPLETED',
        details: {
          fillTxnRef: response.fillTxnRef ?? null,
          destinationChainId: response.destinationChainId ?? null,
          depositId: response.depositId ?? null,
        },
      };
    case 'expired':
      return { state: 'FAILED', details: { reason: 'Deposit expired (fillDeadline passed)' } };
    case 'refunded':
      return { state: 'COMPLETED', details: { refunded: true } };
    case 'pending':
    default:
      return { state: 'PENDING' };
  }
}
```

### Pattern 4: Bridge Enrollment Post-Execution (staking unstake 패턴 동일)

**What:** Action 실행 완료 후 bridge_status='PENDING' 등록하여 AsyncPollingService가 추적 시작.
**When:** across_bridge execute 액션 성공 후.

```typescript
// packages/daemon/src/api/routes/actions.ts
// Post-execution (in the void async IIFE after stage6Confirm)
if (provider === 'across_bridge' && action === 'execute') {
  await deps.db
    .update(transactions)
    .set({
      bridgeStatus: 'PENDING',
      bridgeMetadata: JSON.stringify({
        tracker: 'across-bridge',
        txHash: /* on-chain txHash from stage5/6 */,
        originChainId: getAcrossChainId(params.fromChain),
        destChainId: getAcrossChainId(params.toChain),
        inputToken: String(params.inputToken),
        outputToken: String(params.outputToken),
        notificationEvent: 'BRIDGE_COMPLETED',
        enrolledAt: Date.now(),
      }),
    })
    .where(eq(transactions.id, ctx.txId));
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Across API 응답 캐싱

**What:** suggested-fees 응답을 캐시하는 것.
**Why bad:** Across 공식 문서가 명시적으로 캐싱 금지. On-chain 상태가 매 블록 변경되어 LP fee, relayer availability, limits가 빠르게 무효화됨.
**Instead:** 매 quote 요청마다 fresh API 호출. 단, available-routes는 변경 빈도가 낮으므로 5분 캐시 허용.

### Anti-Pattern 2: depositV3 파라미터 직접 계산

**What:** LP fee, relayer fee를 자체 계산하여 outputAmount 결정.
**Why bad:** Across의 수수료 모델은 utilization-based pricing (AAVE와 유사)으로 복잡하며, relayer capital cost + gas fee를 포함. 자체 계산 시 실제 relayer가 fill하지 않을 위험.
**Instead:** 항상 /suggested-fees API에서 반환하는 값 사용. outputAmount = inputAmount - totalRelayFee.total.

### Anti-Pattern 3: 별도 DB 테이블 생성

**What:** across_bridge_deposits 같은 전용 DB 테이블 생성.
**Why bad:** 기존 transactions 테이블의 bridge_status + bridge_metadata 컬럼이 이미 범용 브릿지 추적용으로 설계됨. LI.FI, staking 모두 이 컬럼 사용 중.
**Instead:** transactions.bridge_metadata JSON에 Across 전용 필드(depositId, fillTxnRef, originChainId, destChainId) 저장. **새 DB 테이블 불필요, DB 마이그레이션 불필요.**

### Anti-Pattern 4: IncomingTxMonitor 의존 bridge status 업데이트

**What:** IncomingTxMonitor가 destination fill을 감지하면 bridge_status를 COMPLETED로 업데이트.
**Why bad:** IncomingTxMonitor는 모든 체인/월렛을 구독하지 않을 수 있음 (#164 이슈). Relayer fill 감지가 보장되지 않음.
**Instead:** AsyncPollingService + Across /deposit/status API를 primary 추적으로 사용. IncomingTxMonitor는 보조적으로 INCOMING_TX_DETECTED 알림만 발생 (bonus UX).

## Integration Point Details

### New Components

| Component | File Location | Type |
|-----------|---------------|------|
| `AcrossBridgeActionProvider` | `packages/actions/src/providers/across-bridge/index.ts` | New file |
| `AcrossApiClient` | `packages/actions/src/providers/across-bridge/across-api-client.ts` | New file |
| `AcrossConfig` | `packages/actions/src/providers/across-bridge/config.ts` | New file |
| `AcrossSchemas` | `packages/actions/src/providers/across-bridge/schemas.ts` | New file |
| `AcrossBridgeStatusTracker` | `packages/actions/src/providers/across-bridge/bridge-status-tracker.ts` | New file |

### Modified Components

| Component | File | Change |
|-----------|------|--------|
| `packages/actions/src/index.ts` | Export | across-bridge provider + trackers export 추가 |
| `packages/daemon/src/lifecycle/daemon.ts` | Step 4f-2 확장 | Across tracker 등록 로직 추가 (LI.FI와 동일 패턴) |
| `packages/daemon/src/api/routes/actions.ts` | Post-execution | across_bridge execute 후 bridge enrollment 로직 추가 |
| Admin Settings definitions | settings service | `actions.across_*` 6개 키 추가 |
| SDK | `packages/sdk/src/` | across bridge 5 메서드 추가 |
| Skill files | `skills/defi.skill.md` | Across Bridge 도구 문서화 |

### No Changes Needed

| Component | Reason |
|-----------|--------|
| DB schema (v52) | bridge_status + bridge_metadata 기존 컬럼으로 충분 |
| DB migration | 불필요 -- 기존 스키마로 완전 호환 |
| 6-stage pipeline | CONTRACT_CALL/BATCH 기존 type으로 처리 |
| Policy engine | 기존 SPENDING_LIMIT, RATE_LIMIT, CONTRACT_WHITELIST 정책 그대로 적용 |
| ActionProviderRegistry | 자동 등록 (BUILTIN_PROVIDERS에 추가만) |
| AsyncPollingService | registerTracker()로 등록만 하면 자동 폴링 |
| IncomingTxMonitor | 별도 변경 없음 (destination chain 구독 중이면 ERC-20 transfer 자동 감지) |
| MCP tool exposure | mcpExpose=true 설정으로 자동 노출 -- 별도 코드 불필요 |

## Admin Settings

| Key | Default | Description |
|-----|---------|-------------|
| `actions.across_enabled` | `'false'` | Across Bridge 프로바이더 활성화 |
| `actions.across_api_base_url` | `'https://app.across.to/api'` | Across API base URL |
| `actions.across_integrator_id` | `''` | Across Integrator ID (등록 권장) |
| `actions.across_fill_deadline_buffer_sec` | `'21600'` | fillDeadline 버퍼 (기본 6시간, quoteTimestamp + buffer) |
| `actions.across_default_slippage_pct` | `'0.01'` | 기본 슬리피지 (1% -- Across는 동일 토큰 브릿지이므로 낮게) |
| `actions.across_max_slippage_pct` | `'0.03'` | 최대 슬리피지 (3%) |

## SpokePool Contract Addresses

Across GitHub deployments.json에서 확인한 주소 목록. 하드코딩 + /available-routes API fallback 전략.

| Chain | Chain ID | SpokePool Address (Proxy) |
|-------|----------|---------------------------|
| Ethereum | 1 | `0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5` |
| Arbitrum | 42161 | deployments.json 참조 |
| Optimism | 10 | deployments.json 참조 |
| Base | 8453 | deployments.json 참조 |
| Polygon | 137 | `0x69B5c72837769eF1e7C164Abc6515DcFf217F920` |

**참고:** 모든 SpokePool은 업그레이드 가능 프록시 컨트랙트. 주소는 변경되지 않지만 구현 로직은 업그레이드될 수 있음.

## Across API Endpoints -> WAIaaS Actions 매핑

| Across API | WAIaaS Action | HTTP Method | Key Parameters |
|------------|---------------|-------------|----------------|
| `/suggested-fees` | `quote` | GET | inputToken, outputToken, originChainId, destinationChainId, amount |
| `/limits` | `limits` | GET | inputToken, outputToken, originChainId, destinationChainId |
| `/available-routes` | `routes` | GET | originChainId?, destinationChainId?, originToken?, destinationToken? |
| `/deposit/status` | `status` | GET | depositTxnRef (txHash) |
| SpokePool.depositV3() | `execute` | On-chain TX | depositor, recipient, inputToken, outputToken, inputAmount, outputAmount, destinationChainId, exclusiveRelayer, quoteTimestamp, fillDeadline, exclusivityDeadline, message |

## depositV3 Function Signature

```solidity
function depositV3(
    address depositor,           // 예금자 (= walletAddress)
    address recipient,           // 수령인 (기본 = walletAddress)
    address inputToken,          // 소스 체인 토큰 (ERC-20 또는 WETH)
    address outputToken,         // 목적지 체인 토큰
    uint256 inputAmount,         // 입금 금액
    uint256 outputAmount,        // 수령 금액 (= inputAmount - fees)
    uint256 destinationChainId,  // 목적지 체인 ID
    address exclusiveRelayer,    // 독점 릴레이어 (0x0 = 오픈)
    uint32 quoteTimestamp,       // /suggested-fees 타임스탬프
    uint32 fillDeadline,         // fill 마감 시간
    uint32 exclusivityDeadline,  // 독점 릴레이 마감 시간
    bytes message                // 수령인 컨트랙트 메시지 (0x = 빈)
) external payable;
```

**Native Token 처리:** `msg.value = inputAmount` 설정. inputToken은 해당 체인의 WETH 주소로 지정해야 함. EOA recipient는 native ETH를 수신하고, contract recipient는 WETH를 수신.

## Scalability Considerations

| Concern | Current (< 100 bridges) | At 1K bridges | At 10K bridges |
|---------|--------------------------|----------------|-----------------|
| Status polling | AsyncPollingService 30s, 순차 처리 | 15s poll * 1K = 충분 (순차) | Rate limit 가능, batch query 필요 |
| API rate limits | No key = rate limited | Integrator ID 등록 필수 | 전용 API key + 요청 큐 |
| DB bridge_metadata | JSON in TEXT column | OK (indexed on bridge_status) | OK (인덱스 활용) |

## Suggested Build Order

1. **AcrossApiClient + Config + Schemas** -- 외부 API 통신 기반, 다른 모든 컴포넌트의 의존성
2. **AcrossBridgeActionProvider** (quote/execute/routes/limits) -- IActionProvider 구현, depositV3 calldata 인코딩
3. **Bridge Status Tracker** (AcrossBridgeStatusTracker + MonitoringTracker) -- IAsyncStatusTracker 구현
4. **Daemon Integration** (tracker registration + bridge enrollment + Admin Settings) -- 기존 코드 수정
5. **MCP + SDK + Skill Files** -- 인터페이스 레이어 (mcpExpose=true로 MCP는 대부분 자동)
6. **Tests** -- Mock API client 기반 단위 테스트 + BATCH flow 통합 테스트

**의존성 순서 근거:**
- ApiClient는 Provider와 Tracker 모두의 기반이므로 먼저 구현
- Provider는 Tracker보다 먼저 (execute가 있어야 tracking할 대상이 생김)
- Daemon 통합은 Provider + Tracker 완성 후 (import 대상이 있어야 등록 가능)
- MCP/SDK는 Provider 등록 후 자동 노출 (mcpExpose=true)
- Tests는 병렬 가능하나 마지막에 전체 검증

## Sources

- [Across API Reference](https://docs.across.to/reference/api-reference) -- HIGH confidence
- [Across Selected Contract Functions (depositV3)](https://docs.across.to/reference/selected-contract-functions) -- HIGH confidence
- [Across Intent Lifecycle](https://docs.across.to/concepts/intent-lifecycle-in-across) -- HIGH confidence
- [Across Fee Structure](https://docs.across.to/reference/fees-in-the-system) -- MEDIUM confidence
- [Across Bridge Guide](https://docs.across.to/developer-quickstart/bridge) -- MEDIUM confidence
- [Ethereum SpokePool V2 (Etherscan)](https://etherscan.io/address/0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5) -- HIGH confidence
- [Across GitHub Contracts](https://github.com/across-protocol/contracts) -- HIGH confidence
- 기존 WAIaaS 코드: LiFiActionProvider, BridgeStatusTracker, AsyncPollingService, ActionProviderRegistry -- HIGH confidence (직접 코드 검증)
