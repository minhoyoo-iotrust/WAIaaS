# Phase 304: Transaction Dry-Run 설계 통합 스펙

**Phase:** 304
**마일스톤:** v30.0 운영 기능 확장 설계
**Requirements:** SIM-01, SIM-02, SIM-03, SIM-04
**상태:** 완료
**작성일:** 2026-03-03

---

## 1. 설계 개요

### 1.1 목적

AI 에이전트가 트랜잭션을 실제 실행하기 전에 **정책 평가 결과, 예상 수수료, 잔액 변화, 경고 목록**을 사전 확인할 수 있는 Transaction Dry-Run 기능을 설계한다.

### 1.2 핵심 원칙

1. **부수 효과 없음 (Side-effect free)** -- DB 삽입/갱신 없음, 온체인 서명/제출 없음, 알림 없음, 감사 로그 없음
2. **요청 호환성** -- POST /v1/transactions/send와 동일한 요청 바디 사용 (에이전트가 복사-붙여넣기 가능)
3. **부분 결과 반환** -- 일부 단계 실패 시에도 가용한 정보를 경고와 함께 반환
4. **기존 코드 비파괴** -- 새 메서드 추가, 기존 stage 함수 수정 없음

### 1.3 요구사항 매핑

| 요구사항 | 설명 | 충족 섹션 |
|---------|------|-----------|
| SIM-01 | SimulationResult Zod 스키마 정의 | 섹션 2 |
| SIM-02 | PipelineContext dryRun 플래그 + Stage 분기 설계 | 섹션 3 |
| SIM-03 | POST /v1/transactions/simulate 엔드포인트 스펙 | 섹션 4 |
| SIM-04 | SDK simulate() + MCP simulate_transaction 확장 스펙 | 섹션 5, 6 |

### 1.4 영향 범위

| 패키지 | 변경 사항 |
|--------|----------|
| `@waiaas/core` | DryRunSimulationResultSchema + 관련 서브 스키마 export |
| `@waiaas/daemon` (pipeline) | DryRunCollector + executeDryRun() + dry-run stage 함수 |
| `@waiaas/daemon` (api) | POST /v1/transactions/simulate 라우트 + OpenAPI 스키마 |
| `@waiaas/sdk` | SimulateResponse 타입 + simulate() 메서드 |
| `@waiaas/mcp` | simulate_transaction tool 등록 |
| 설계 문서 | doc 32, 33, 37, 38 갱신 |
| Skill files | transactions.skill.md 갱신 |

---

## 2. DryRunSimulationResult 스키마 (SIM-01)

### 2.1 전체 스키마 구조

```
DryRunSimulationResult
├── success: boolean                    -- 전체 성공 여부
├── policy: PolicyResult                -- 정책 평가 결과
│   ├── tier: PolicyTier                -- INSTANT / NOTIFY / DELAY / APPROVAL
│   ├── allowed: boolean                -- 허용 여부
│   ├── reason?: string                 -- 거부 사유
│   ├── delaySeconds?: number           -- DELAY 대기 시간
│   ├── approvalReason?: string         -- APPROVAL 격상 사유
│   ├── downgraded?: boolean            -- APPROVAL→DELAY 다운그레이드
│   └── cumulativeWarning?              -- 누적 한도 경고
│       ├── type: daily | monthly
│       ├── ratio: number
│       ├── spent: number
│       └── limit: number
├── fee: FeeEstimateResult | null       -- 수수료 추정 (시뮬 실패 시 null)
│   ├── estimatedFee: string            -- 예상 수수료 (digit string)
│   ├── feeSymbol: string               -- SOL / ETH
│   ├── feeDecimals: number             -- 9 / 18
│   ├── feeUsd: number | null           -- USD 환산
│   ├── needsAtaCreation?: boolean      -- Solana ATA 생성 필요
│   └── ataRentCost?: string            -- ATA 렌트 비용
├── balanceChanges: BalanceChange[]     -- 잔액 변화 예측
│   └── [each]
│       ├── asset: string               -- 'native' 또는 토큰 주소
│       ├── symbol: string              -- SOL, ETH, USDC 등
│       ├── decimals: number
│       ├── currentBalance: string      -- 현재 잔액
│       ├── changeAmount: string        -- 변화량 (음수 = 감소)
│       └── afterBalance: string        -- 예상 최종 잔액
├── warnings: SimulationWarning[]       -- 경고 목록
│   └── [each]
│       ├── code: string                -- 머신 소비용 경고 코드
│       ├── message: string             -- 사람 읽기용 메시지
│       └── severity: info|warning|error
├── simulation                          -- 온체인 시뮬레이션 상세
│   ├── success: boolean
│   ├── logs: string[]
│   ├── unitsConsumed: string | null    -- Solana CU / EVM gas
│   └── error: string | null
└── meta                                -- 요청 메타데이터
    ├── chain: ChainType
    ├── network: NetworkType
    ├── transactionType: string
    └── durationMs: number
```

### 2.2 경고 코드 체계

| 코드 | 심각도 | 설명 |
|------|--------|------|
| `INSUFFICIENT_BALANCE` | error | 전송 금액이 잔액보다 큼 |
| `INSUFFICIENT_BALANCE_WITH_FEE` | error | 전송 금액 + 수수료가 잔액보다 큼 |
| `ORACLE_PRICE_UNAVAILABLE` | warning | USD 가격 조회 불가 (네이티브 금액 기준 정책 평가) |
| `SIMULATION_FAILED` | warning | 온체인 시뮬레이션 실패 (수수료 추정 불확실) |
| `HIGH_FEE_RATIO` | info | 수수료 비율이 전송 금액의 10% 초과 |
| `APPROVAL_REQUIRED` | warning | APPROVAL tier -- Owner 승인 필요 |
| `DELAY_REQUIRED` | info | DELAY tier -- 시간 지연 적용 |
| `CUMULATIVE_LIMIT_WARNING` | warning | 누적 한도 80%+ 도달 |
| `TOKEN_NOT_IN_ALLOWED_LIST` | error | ALLOWED_TOKENS 정책 미포함 |
| `CONTRACT_NOT_WHITELISTED` | error | CONTRACT_WHITELIST 미포함 |
| `NETWORK_NOT_ALLOWED` | error | ALLOWED_NETWORKS 미포함 |
| `DOWNGRADED_NO_OWNER` | info | Owner 미등록으로 APPROVAL→DELAY 다운그레이드 |

### 2.3 Zod 스키마 파일

```
packages/core/src/schemas/simulation.schema.ts
```

새 파일 생성. `@waiaas/core` index.ts에서 export 추가.

### 2.4 기존 SimulationResult와의 관계

```
기존 (chain-adapter.types.ts):
  SimulationResult { success, logs, unitsConsumed?, error? }
  → IChainAdapter 내부용, 변경 없음

신규 (simulation.schema.ts):
  DryRunSimulationResultSchema { success, policy, fee, balanceChanges, warnings, simulation, meta }
  → REST API 응답용, SimulationResult를 simulation 필드로 래핑
```

---

## 3. PipelineContext dryRun 분기 (SIM-02)

### 3.1 실행 흐름 비교

```
[일반 모드]
  POST /v1/transactions/send
  → Stage 1 (Validate + DB INSERT)
  → 201 반환 (fire-and-forget)
    → Stage 2 (Auth)
    → Stage 3 (Policy + DB UPDATE)
    → Stage 3.5 (Gas Condition + PIPELINE_HALTED)
    → Stage 4 (Wait -- DELAY/APPROVAL + PIPELINE_HALTED)
    → Stage 5 (Build → Simulate → Sign → Submit + DB UPDATE)
    → Stage 6 (Confirm + DB UPDATE)

[Dry-Run 모드]
  POST /v1/transactions/simulate
  → Stage 1' (Validate only -- Zod 검증, DB 삽입 없음)
  → Stage 2' (Auth check only -- 세션 유효성, usage stats 미갱신)
  → Stage 3' (Policy evaluate only -- evaluate(), reserve 없음, DB 미갱신)
  → Balance query (잔액 조회 -- 변화 계산용)
  → Stage 5a' (Build -- buildByType())
  → Stage 5b' (Simulate -- adapter.simulateTransaction())
  → 200 반환 (동기 응답, DryRunSimulationResult)
```

### 3.2 구현 전략

별도 `TransactionPipeline.executeDryRun()` 메서드 추가. 기존 `executeSend()` 코드 경로 수정 없음.

```typescript
// TransactionPipeline (pipeline.ts)
class TransactionPipeline {
  async executeSend(...)  { /* 기존 -- 변경 없음 */ }
  async executeDryRun(...): Promise<DryRunSimulationResult> { /* 신규 */ }
}
```

### 3.3 부수 효과 격리 매트릭스

| 부수 효과 | 일반 모드 | dry-run 모드 | 격리 방법 |
|-----------|-----------|-------------|----------|
| DB INSERT (transactions) | O | X | txId 생성 안 함 |
| DB UPDATE (transactions.tier) | O | X | collector에 결과 저장 |
| DB evaluateAndReserve | O | X | evaluate()만 호출 |
| 개인 키 복호화 | O | X | Stage 5c 스킵 |
| 온체인 서명 | O | X | Stage 5c 스킵 |
| 온체인 제출 | O | X | Stage 5d 스킵 |
| 알림 발송 | O | X | notificationService 미참조 |
| EventBus emit | O | X | eventBus 미참조 |
| 감사 로그 INSERT | O | X | auditLog 미참조 |
| DelayQueue 큐잉 | O | X | Stage 4 스킵 |
| ApprovalWorkflow | O | X | Stage 4 스킵 |
| GasConditionTracker | O | X | Stage 3.5 스킵 |

### 3.4 DryRunCollector

```typescript
interface DryRunCollector {
  validationPassed: boolean;
  authPassed: boolean;
  policyEvaluation: PolicyEvaluation | null;
  downgraded: boolean;
  unsignedTx: UnsignedTransaction | null;
  simulationResult: SimulationResult | null;
  currentBalances: Array<{ asset: string; symbol: string; decimals: number; balance: bigint }>;
  warnings: Array<{ code: string; message: string; severity: 'info'|'warning'|'error' }>;
  startTime: number;
  amountUsd: number | null;
  feeUsd: number | null;
}
```

### 3.5 doc 33 읽기 전용 정책 평가

- `IPolicyEngine.evaluate()` -- 이미 읽기 전용, dry-run에서 안전하게 사용 가능
- `IPolicyEngine.evaluateAndReserve()` -- DB 쓰기 포함, dry-run에서 호출 금지
- USD 환산(`resolveEffectiveAmountUsd`) -- 가격 오라클 읽기 전용, dry-run에서 호출 허용
- `downgradeIfNoOwner()` -- 순수 함수, dry-run에서 호출 허용

---

## 4. REST API 엔드포인트 (SIM-03)

### 4.1 엔드포인트 스펙

```
POST /v1/transactions/simulate
```

| 항목 | 값 |
|------|-----|
| 경로 | `/v1/transactions/simulate` |
| 메서드 | POST |
| 인증 | sessionAuth (Bearer wai_sess_...) |
| 태그 | Transactions |
| 요청 바디 | TransactionRequestSchema (5-type discriminatedUnion) |
| 응답 (성공) | 200 DryRunSimulationResult |
| 응답 (검증 실패) | 422 ValidationError |
| 응답 (인증 실패) | 401 Unauthorized |
| 응답 (지갑 없음) | 404 WALLET_NOT_FOUND |
| 응답 (지갑 종료) | 409 WALLET_TERMINATED |
| 응답 (네트워크 불일치) | 400 ENVIRONMENT_NETWORK_MISMATCH |
| 응답 (타임아웃) | 504 SIMULATION_TIMEOUT |

### 4.2 HTTP 상태 코드 설계

**정책 거부도 HTTP 200 반환** (SIM-D11):
- 시뮬레이션 자체는 성공적으로 실행됨
- 결과의 `success=false` + `policy.allowed=false`로 거부를 표현
- 에이전트가 HTTP 상태 코드와 비즈니스 결과를 분리하여 처리 가능

### 4.3 요청 예시

```json
// TRANSFER
{
  "type": "TRANSFER",
  "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f6E8f0",
  "amount": "1000000000000000000",
  "network": "ethereum-mainnet"
}

// TOKEN_TRANSFER
{
  "type": "TOKEN_TRANSFER",
  "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f6E8f0",
  "amount": "1000000",
  "token": {
    "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "decimals": 6,
    "symbol": "USDC"
  },
  "network": "ethereum-mainnet"
}
```

### 4.4 응답 예시 (성공)

```json
{
  "success": true,
  "policy": {
    "tier": "INSTANT",
    "allowed": true
  },
  "fee": {
    "estimatedFee": "21000000000000",
    "feeSymbol": "ETH",
    "feeDecimals": 18,
    "feeUsd": 0.05
  },
  "balanceChanges": [
    {
      "asset": "native",
      "symbol": "ETH",
      "decimals": 18,
      "currentBalance": "5000000000000000000",
      "changeAmount": "-1021000000000000000",
      "afterBalance": "3979000000000000000"
    }
  ],
  "warnings": [],
  "simulation": {
    "success": true,
    "logs": [],
    "unitsConsumed": "21000",
    "error": null
  },
  "meta": {
    "chain": "ethereum",
    "network": "ethereum-mainnet",
    "transactionType": "TRANSFER",
    "durationMs": 342
  }
}
```

### 4.5 응답 예시 (정책 거부)

```json
{
  "success": false,
  "policy": {
    "tier": "INSTANT",
    "allowed": false,
    "reason": "Token transfer not allowed: USDC not in ALLOWED_TOKENS list"
  },
  "fee": null,
  "balanceChanges": [],
  "warnings": [
    {
      "code": "TOKEN_NOT_IN_ALLOWED_LIST",
      "message": "USDC is not in the allowed tokens list",
      "severity": "error"
    }
  ],
  "simulation": {
    "success": false,
    "logs": [],
    "unitsConsumed": null,
    "error": "Skipped: policy denied"
  },
  "meta": {
    "chain": "ethereum",
    "network": "ethereum-mainnet",
    "transactionType": "TOKEN_TRANSFER",
    "durationMs": 15
  }
}
```

### 4.6 응답 예시 (잔액 부족 경고)

```json
{
  "success": true,
  "policy": {
    "tier": "NOTIFY",
    "allowed": true
  },
  "fee": {
    "estimatedFee": "5000",
    "feeSymbol": "SOL",
    "feeDecimals": 9,
    "feeUsd": 0.001
  },
  "balanceChanges": [
    {
      "asset": "native",
      "symbol": "SOL",
      "decimals": 9,
      "currentBalance": "100000000",
      "changeAmount": "-1000005000",
      "afterBalance": "-900005000"
    }
  ],
  "warnings": [
    {
      "code": "INSUFFICIENT_BALANCE_WITH_FEE",
      "message": "Insufficient balance after fee: need 1000005000, have 100000000",
      "severity": "error"
    }
  ],
  "simulation": {
    "success": false,
    "logs": ["Transfer: insufficient lamports"],
    "unitsConsumed": null,
    "error": "Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1"
  },
  "meta": {
    "chain": "solana",
    "network": "solana-mainnet",
    "transactionType": "TRANSFER",
    "durationMs": 512
  }
}
```

---

## 5. SDK simulate() 메서드 (SIM-04 - SDK)

### 5.1 메서드 시그니처

```typescript
class WAIaaSClient {
  async simulate(params: SendTokenParams): Promise<SimulateResponse>;
}
```

### 5.2 동작

1. `validateSendToken(params)` 사전 검증 (기존 함수 재사용)
2. `POST /v1/transactions/simulate` 호출
3. `withRetry()` 래핑 (429/5xx 재시도)
4. `SimulateResponse` 반환

### 5.3 타입

```typescript
interface SimulateResponse {
  success: boolean;
  policy: { tier: string; allowed: boolean; reason?: string; ... };
  fee: { estimatedFee: string; feeSymbol: string; ... } | null;
  balanceChanges: Array<{ asset: string; symbol: string; ... }>;
  warnings: Array<{ code: string; message: string; severity: string }>;
  simulation: { success: boolean; logs: string[]; ... };
  meta: { chain: string; network: string; transactionType: string; durationMs: number };
}
```

### 5.4 사용 예시

```typescript
const client = await WAIaaSClient.connect();

// 1. 시뮬레이션
const sim = await client.simulate({
  type: 'TRANSFER',
  to: '0x1234...abcd',
  amount: '1000000000000000000',
  network: 'ethereum-mainnet',
});

// 2. 결과 확인
if (sim.success && sim.policy.tier === 'INSTANT') {
  console.log(`Fee: ${sim.fee?.estimatedFee} ${sim.fee?.feeSymbol}`);
  console.log(`After balance: ${sim.balanceChanges[0]?.afterBalance}`);

  // 3. 실행
  const tx = await client.sendToken({
    type: 'TRANSFER',
    to: '0x1234...abcd',
    amount: '1000000000000000000',
    network: 'ethereum-mainnet',
  });
} else if (!sim.success) {
  console.log(`Denied: ${sim.policy.reason}`);
} else {
  console.log(`Tier: ${sim.policy.tier}, Warnings:`, sim.warnings);
}
```

---

## 6. MCP simulate_transaction Tool (SIM-04 - MCP)

### 6.1 Tool 스펙

| 항목 | 값 |
|------|-----|
| 이름 | `simulate_transaction` |
| 설명 | Simulate a transaction without executing it. Returns policy tier, estimated fees, balance changes, and warnings. |
| 입력 | send_token과 동일한 파라미터 구조 |
| 출력 | DryRunSimulationResult JSON |

### 6.2 입력 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| to | string | O | 수신 주소 |
| amount | string | O | 금액 (smallest unit) |
| type | enum | X | TRANSFER / TOKEN_TRANSFER / CONTRACT_CALL / APPROVE / BATCH |
| token | object | 조건 | TOKEN_TRANSFER 시 필수 (address, decimals, symbol) |
| calldata | string | X | CONTRACT_CALL 전용 |
| abi | array | X | CONTRACT_CALL 전용 |
| value | string | X | CONTRACT_CALL 전용 (네이티브 값) |
| spender | string | X | APPROVE 전용 |
| instructions | array | X | BATCH 전용 |
| network | string | X | 대상 네트워크 |
| wallet_id | string | X | 멀티 지갑 세션 시 |

### 6.3 AI 에이전트 사용 시나리오

```
사용자: "0x1234로 1 ETH 보내줘"

[에이전트 내부 로직]
1. simulate_transaction 호출
2. 결과 분석:
   - policy.tier = DELAY → "15분 지연이 적용됩니다" 안내
   - policy.tier = APPROVAL → "Owner 승인이 필요합니다" 안내
   - warnings 있으면 → 해당 경고 안내
   - fee 확인 → "수수료 0.003 ETH ($0.05)" 안내
3. 사용자 확인 후 send_token 호출
```

---

## 7. 에러 코드

### 7.1 신규 에러 코드

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| SIMULATION_TIMEOUT | 504 | true | 시뮬레이션 타임아웃 (RPC 응답 지연) |

### 7.2 재사용 에러 코드

| 코드 | HTTP | 시뮬레이션 맥락 |
|------|------|----------------|
| WALLET_NOT_FOUND | 404 | 지갑 없음 |
| WALLET_TERMINATED | 409 | 지갑 종료 상태 |
| ENVIRONMENT_NETWORK_MISMATCH | 400 | 환경-네트워크 불일치 |
| ACTION_VALIDATION_FAILED | 400 | 네트워크 검증 실패 |

---

## 8. 설계 문서 갱신 요약

### 8.1 doc 32 (TX-PIPE -- 32-transaction-pipeline-api.md)

| 갱신 위치 | 내용 |
|----------|------|
| 섹션 1 개요 | executeDryRun() 경로 추가 언급 |
| 새 섹션 "7. Dry-Run 시뮬레이션 모드" | Stage 분기표, 부수 효과 격리 매트릭스, DryRunSimulationResult 참조 |

### 8.2 doc 33 (LOCK-MECH -- 33-time-lock-approval-mechanism.md)

| 갱신 위치 | 내용 |
|----------|------|
| 새 섹션 "10. 읽기 전용 정책 평가 경로" | evaluate()만 호출, TOCTOU reserved 미포함, downgradeIfNoOwner 적용 |

### 8.3 doc 37 (API-SPEC -- 37-rest-api-complete-spec.md)

| 갱신 위치 | 내용 |
|----------|------|
| 섹션 1.4 엔드포인트 요약 | Session API 12→13개 |
| 새 섹션 "7.X POST /v1/transactions/simulate" | 전체 엔드포인트 스펙 |
| 에러 코드 매트릭스 | SIMULATION_TIMEOUT 추가 |
| 합계 | 38→39개 엔드포인트 |

### 8.4 doc 38 (SDK-MCP -- 38-sdk-mcp-interface.md)

| 갱신 위치 | 내용 |
|----------|------|
| 섹션 3 SDK 메서드 목록 | simulate() 추가 (21→22개) |
| 섹션 3 사전 검증 테이블 | simulate() 행 추가 |
| 섹션 5 MCP tool 목록 | simulate_transaction 추가 |
| 섹션 5 tool 상세 | 입력/출력/시나리오 |

---

## 9. 테스트 시나리오 매핑

### 9.1 단위 테스트 (구현 시 참조)

| ID | 카테고리 | 시나리오 | 예상 결과 |
|----|---------|---------|----------|
| SIM-T01 | 정상 | TRANSFER, INSTANT tier | success=true, tier=INSTANT, fee 존재 |
| SIM-T02 | 정상 | TOKEN_TRANSFER, DELAY tier | success=true, tier=DELAY, warning(DELAY_REQUIRED) |
| SIM-T03 | 정책 거부 | CONTRACT_CALL, ALLOWED_TOKENS 거부 | success=false, allowed=false |
| SIM-T04 | 경고 | 잔액 부족 | success=true, warning(INSUFFICIENT_BALANCE_WITH_FEE) |
| SIM-T05 | 경고 | 시뮬레이션 실패 | success=true, simulation.success=false |
| SIM-T06 | 경고 | 오라클 불가 | success=true, warning(ORACLE_PRICE_UNAVAILABLE) |
| SIM-T07 | 정책 | APPROVAL + Owner 미등록 | downgraded=true, warning(DOWNGRADED_NO_OWNER) |
| SIM-T08 | 정상 | BATCH 타입 | success=true, 각 instruction 시뮬레이션 |
| SIM-T09 | 정상 | APPROVE 타입 | success=true, 토큰 잔액 변화 없음 |

### 9.2 부수 효과 격리 테스트

| ID | 검증 대상 | 방법 |
|----|----------|------|
| SIM-T10 | DB transactions INSERT 없음 | 전후 count 비교 |
| SIM-T11 | audit_log INSERT 없음 | 전후 count 비교 |
| SIM-T12 | 알림 발송 없음 | mock spy 호출 0회 |
| SIM-T13 | 키 복호화 없음 | mock spy 호출 0회 |
| SIM-T14 | EventBus emit 없음 | mock spy 호출 0회 |

### 9.3 통합 테스트 (E2E)

| ID | 시나리오 | 방법 |
|----|---------|------|
| SIM-T20 | simulate → send 워크플로우 | simulate 결과 확인 후 동일 파라미터로 send, tx 성공 |
| SIM-T21 | simulate 후 잔액 변동 없음 | simulate 전후 getBalance 동일 |
| SIM-T22 | 다중 동시 simulate | 5개 병렬 simulate, 모두 200 응답, DB 변경 없음 |

---

## 10. 설계 결정 종합

| ID | 결정 | 근거 |
|----|------|------|
| SIM-D01 | 별도 executeDryRun() 메서드 | 기존 코드 비파괴, 테스트 격리, 동기 응답 |
| SIM-D02 | 시뮬레이션 실패를 경고로 변환 | 에이전트에게 부분 정보 제공이 유리 |
| SIM-D03 | 기존 SimulationResult 변경 없음 | 내부 타입 안정성 유지 |
| SIM-D04 | 잔액 변화에 수수료 포함 | 실제 지출 총액 정확 예측 |
| SIM-D05 | 가격 오라클 호출 허용 | 읽기 전용, USD 정책에 필요 |
| SIM-D06 | Stage 3.5(Gas) 스킵 | 사전 시뮬레이션에서 가스 조건 무의미 |
| SIM-D10 | TransactionRequestSchema 재사용 | 복사-붙여넣기 워크플로우, 관리 부담 없음 |
| SIM-D11 | 정책 거부도 HTTP 200 | 시뮬레이션 성공/비즈니스 결과 분리 |
| SIM-D12 | MCP tool 이름 simulate_transaction | 기존 패턴 일관성 |
| SIM-D13 | SDK 사전 검증 동일 적용 | 일관된 DX |
| SIM-D14 | gasCondition 무시 | 요청 호환성 유지 |
| SIM-D15 | SIMULATION_TIMEOUT만 신규 | 기존 코드 재사용 극대화 |
| SIM-D16 | /transactions/simulate 경로 | 네임스페이스 일관성 |
