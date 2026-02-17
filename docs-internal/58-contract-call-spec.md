# 컨트랙트 호출 스펙 + 파이프라인/DB/REST 크로스커팅 확장 (CHAIN-EXT-03)

**문서 ID:** CHAIN-EXT-03
**작성일:** 2026-02-08
**상태:** 완료
**Phase:** 23 (트랜잭션 타입 확장 설계)
**참조:** CORE-04 (27-chain-adapter-interface.md), TX-PIPE (32-transaction-pipeline-api.md), LOCK-MECH (33-time-lock-approval-mechanism.md), CORE-02 (25-sqlite-schema.md), API-SPEC (37-rest-api-complete-spec.md), ENUM-MAP (45-enum-unified-mapping.md), CHAIN-SOL (31-solana-adapter-detail.md), KILL-AUTO-EVM (36-killswitch-autostop-evm.md), CHAIN-EXT-01 (56-token-transfer-extension-spec.md), CHAIN-EXT-02 (57-asset-query-fee-estimation-spec.md), 23-RESEARCH.md
**요구사항:** CONTRACT-01 (ContractCallRequest), CONTRACT-02 (화이트리스트 정책), CONTRACT-03 (파이프라인 확장), CONTRACT-04 (DB 스키마 확장), CONTRACT-05 (테스트 시나리오), + APPROVE/BATCH 크로스커팅

---

## 1. 개요

### 1.1 목적

이 문서는 WAIaaS 트랜잭션 파이프라인에 **임의 스마트 컨트랙트 호출(CONTRACT_CALL)** 기능을 추가하는 정식 설계 스펙이다. 동시에, Phase 23의 3가지 새 트랜잭션 타입(CONTRACT_CALL, APPROVE, BATCH)이 공유하는 **크로스커팅 기반** -- 파이프라인 Stage 1-5 type 분기, DB TransactionType Enum, REST API 다형적 요청, 에러 코드 체계 -- 을 정의하여, 23-02(Approve)와 23-03(Batch)가 독립적으로 확장할 수 있는 토대를 마련한다.

### 1.2 요구사항 매핑

| 요구사항 | 커버리지 | 섹션 |
|---------|---------|------|
| CONTRACT-01 | ContractCallRequest 인터페이스 (EVM calldata + Solana programId) | 섹션 2 |
| CONTRACT-02 | CONTRACT_WHITELIST + METHOD_WHITELIST 정책 규칙 | 섹션 4, 5 |
| CONTRACT-03 | 파이프라인 Stage 1-5 확장 (크로스커팅) | 섹션 6 |
| CONTRACT-04 | TransactionType Enum + 감사 컬럼 + 인덱스 (크로스커팅) | 섹션 7 |
| CONTRACT-05 | 보안 가이드라인 + 테스트 시나리오 | 섹션 9 |
| APPROVE 크로스커팅 | Stage 1 variant, Stage 2 allowedSpenders, Stage 3 정책 3종, 에러 코드 3종 | 섹션 6, 7, 8 |
| BATCH 크로스커팅 | Stage 1 variant, Stage 3 합산 평가, 에러 코드 3종 | 섹션 6, 7, 8 |

**APPROVE-01~03, BATCH-01~03의 상세 설계는 각각 23-02-PLAN.md, 23-03-PLAN.md에서 정의한다.** 이 문서는 크로스커팅 확장 포인트만 예비 정의한다.

### 1.3 핵심 설계 원칙

| # | 원칙 | 설명 | 적용 |
|---|------|------|------|
| 1 | **기본 전면 거부 (opt-in)** | 임의 컨트랙트 호출은 기본 거부. CONTRACT_WHITELIST 정책이 명시적으로 설정된 에이전트만 CONTRACT_CALL 가능 | v0.6 핵심 결정 |
| 2 | **IChainAdapter 저수준 유지** | 어댑터는 "실행 엔진" 역할만 담당. DeFi 로직/정책 판단은 서비스 레이어와 Action Provider(Phase 24)에 분리 | CORE-04 원칙 계승 |
| 3 | **6단계 파이프라인 구조 변경 없음** | 새 트랜잭션 타입은 기존 6단계 파이프라인 위에 적층. 새 Stage 추가 없음 | TX-PIPE 구조 보존 |
| 4 | **서비스 레이어 type 분기** | request.type 필드로 TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH를 서비스 레이어에서 분기하고, 각 type별 빌드 함수 호출 | Phase 22 패턴 확장 |
| 5 | **Phase 22 패턴 계승** | Phase 22에서 token? 필드로 네이티브/토큰 분기를 도입한 패턴을 type 필드 기반 명시적 분기로 확장 | CHAIN-EXT-01 연속 |

### 1.4 v0.6 핵심 결정 인용

> "임의 컨트랙트 호출은 기본 거부 (opt-in 화이트리스트)" -- v0.6 Phase 23 핵심 결정

> "approve는 독립 정책 카테고리 (전송보다 위험한 권한 위임)" -- v0.6 Phase 23 핵심 결정

> "IChainAdapter는 저수준 실행 엔진으로 유지 (DeFi 지식은 Action Provider에 분리)" -- v0.6 핵심 결정

---

## 2. ContractCallRequest 인터페이스

### 2.1 TypeScript 인터페이스

```typescript
// packages/core/src/interfaces/chain-adapter.types.ts (Phase 23 확장)

/**
 * 임의 스마트 컨트랙트 호출 요청.
 * EVM과 Solana의 체인별 필수 필드가 다르다.
 * 서비스 레이어에서 체인 타입에 따라 교차 검증한다.
 */
interface ContractCallRequest {
  /** 호출자 주소 (에이전트 지갑 공개키) */
  from: string

  /** 호출 대상 컨트랙트/프로그램 주소 */
  to: string

  /** 네이티브 토큰 첨부량 (EVM payable 함수용, 기본 0n) */
  value?: bigint

  // ── EVM 전용 필드 ──

  /** ABI 인코딩된 호출 데이터 (0x 접두어 hex 문자열) */
  calldata?: string

  /** 선택적 ABI (METHOD_WHITELIST 검증, 감사 로그에 함수 시그니처 기록용) */
  abi?: object[]

  // ── Solana 전용 필드 ──

  /** 프로그램 주소 (Base58). to와 동일해야 한다 */
  programId?: string

  /** Base64 인코딩된 instruction data */
  instructionData?: string

  /** 계정 메타 목록 (Solana instruction accounts) */
  accounts?: AccountMetaInput[]
}

/**
 * Solana instruction 계정 메타 입력.
 * isSigner + isWritable 조합으로 AccountRole을 결정한다.
 */
interface AccountMetaInput {
  /** 계정 주소 (Base58) */
  address: string

  /** 서명자 여부 */
  isSigner: boolean

  /** 쓰기 가능 여부 */
  isWritable: boolean
}
```

### 2.2 EVM vs Solana 필수 필드

| 필드 | EVM | Solana | 설명 |
|------|-----|--------|------|
| `from` | **필수** | **필수** | 호출자 주소 |
| `to` | **필수** (컨트랙트 주소, 0x hex) | **필수** (= programId, Base58) | 호출 대상 |
| `value` | 선택 (기본 0n, payable 함수용) | 미사용 (SOL 전송은 별도 instruction) | 네이티브 토큰 첨부 |
| `calldata` | **필수** (0x hex, 빈 값 '0x' 금지) | 미사용 | ABI 인코딩 호출 데이터 |
| `abi` | 선택 (METHOD_WHITELIST 검증, 감사용) | 미사용 | ABI 배열 |
| `programId` | 미사용 | **필수** (= to와 동일) | 프로그램 주소 |
| `instructionData` | 미사용 | **필수** (Base64) | instruction 데이터 |
| `accounts` | 미사용 | **필수** (최소 1개) | 계정 메타 목록 |

### 2.3 Zod 스키마

```typescript
// packages/core/src/schemas/contract-call.schema.ts

import { z } from 'zod'

/**
 * AccountMetaInput Zod 스키마.
 */
export const AccountMetaInputSchema = z.object({
  address: z.string().min(1, '계정 주소는 필수'),
  isSigner: z.boolean(),
  isWritable: z.boolean(),
})

/**
 * ContractCallRequest Zod 스키마.
 * .refine()으로 체인별 필수 필드 교차 검증.
 *
 * EVM: calldata 필수, calldata !== '0x' (빈 calldata = fallback 트리거 방지)
 * Solana: programId + instructionData + accounts 필수
 */
export const ContractCallRequestSchema = z.object({
  from: z.string().min(1, '호출자 주소는 필수'),
  to: z.string().min(1, '컨트랙트/프로그램 주소는 필수'),
  value: z.bigint().nonnegative().optional().default(0n),

  // EVM 전용
  calldata: z.string().regex(/^0x[0-9a-fA-F]+$/, '유효한 hex calldata 필요').optional(),
  abi: z.array(z.any()).optional(),

  // Solana 전용
  programId: z.string().optional(),
  instructionData: z.string().optional(),
  accounts: z.array(AccountMetaInputSchema).optional(),
}).refine(
  (data) => {
    // EVM 경로: calldata가 있으면 EVM
    if (data.calldata) {
      // 빈 calldata('0x') 거부 -- fallback/receive 함수 트리거 방지
      return data.calldata !== '0x' && data.calldata.length >= 10
    }
    // Solana 경로: programId + instructionData + accounts 필수
    if (data.programId) {
      return !!data.instructionData && !!data.accounts && data.accounts.length > 0
    }
    // 둘 다 없으면 실패
    return false
  },
  {
    message: 'EVM은 calldata(0x hex, 최소 4바이트 selector), Solana는 programId + instructionData + accounts가 필수입니다',
  }
).refine(
  (data) => {
    // Solana인 경우 to === programId 강제
    if (data.programId) {
      return data.to === data.programId
    }
    return true
  },
  {
    message: 'Solana CONTRACT_CALL에서 to와 programId는 동일해야 합니다',
  }
)
```

### 2.4 TransferRequest와의 시맨틱 차이

| 관점 | TransferRequest | ContractCallRequest |
|------|----------------|---------------------|
| **목적** | 자산 이동 (네이티브/토큰) | 임의 컨트랙트 상태 변경 |
| **to 필드 의미** | 수신자 주소 (사람/지갑) | 컨트랙트/프로그램 주소 |
| **금액 의미** | 전송 금액 (amount) | 네이티브 토큰 첨부량 (value, 대부분 0) |
| **데이터 페이로드** | memo (선택적 텍스트) | calldata/instructionData (필수 바이너리) |
| **보안 정책** | WHITELIST + SPENDING_LIMIT | CONTRACT_WHITELIST + METHOD_WHITELIST + SPENDING_LIMIT(value) |
| **기본 보안 티어** | SPENDING_LIMIT 기반 4-티어 | APPROVAL (보수적, Owner 승인 필수) |
| **Phase 22 token 분기** | token?: TokenInfo (네이티브/토큰) | 해당 없음 (독립 타입) |

**설계 근거:** ContractCallRequest를 TransferRequest와 독립 타입으로 분리한 이유는, 두 요청의 시맨틱이 근본적으로 다르기 때문이다. TransferRequest의 `to`는 "수신자"이지만, ContractCallRequest의 `to`는 "호출 대상"이다. 이 차이는 정책 엔진, 감사 로그, 보안 분류에서 모두 다른 처리 경로를 요구한다.

---

## 3. 체인별 빌드 로직

### 3.1 EVM ContractCall 빌드

#### 3.1.1 calldata 직접 제공 경로

에이전트(또는 Action Provider)가 이미 인코딩된 calldata를 제공하는 경우:

```typescript
// 서비스 레이어: EVM ContractCall 빌드
async function buildEvmContractCall(
  request: ContractCallRequest,
  client: PublicClient,
  walletClient: WalletClient,
): Promise<UnsignedTransaction> {
  // 1. calldata에서 function selector 추출 (감사 로그용)
  const selector = request.calldata!.slice(0, 10) // '0x' + 8 hex chars

  // 2. ABI가 제공된 경우 함수 시그니처 추출 (감사 로그 보강)
  let functionSignature: string | undefined
  if (request.abi) {
    try {
      const decoded = decodeFunctionData({
        abi: request.abi,
        data: request.calldata as `0x${string}`,
      })
      functionSignature = decoded.functionName
    } catch {
      // ABI 디코딩 실패는 비치명적 -- selector만 기록
    }
  }

  // 3. 트랜잭션 파라미터 구성
  const txParams = {
    to: request.to as `0x${string}`,
    data: request.calldata as `0x${string}`,
    value: request.value ?? 0n,
    account: request.from as `0x${string}`,
  }

  // 4. gas 추정 (1.2배 상한 적용)
  const estimatedGas = await client.estimateGas(txParams)
  const gasLimit = (estimatedGas * 120n) / 100n  // 1.2배 안전 마진

  return {
    ...txParams,
    gas: gasLimit,
    metadata: {
      selector,
      functionSignature,
      type: 'CONTRACT_CALL',
    },
  }
}
```

#### 3.1.2 ABI + functionName 제공 경로

에이전트가 ABI와 함수명을 제공하는 경우 (Action Provider 패턴):

```typescript
import { encodeFunctionData } from 'viem'

// ABI에서 calldata 인코딩
const calldata = encodeFunctionData({
  abi: request.abi!,
  functionName: 'swap',
  args: [tokenIn, tokenOut, amountIn, amountOutMin, deadline],
})

// 이후 calldata 직접 제공 경로와 동일
```

#### 3.1.3 시뮬레이션

```typescript
// Stage 4 (TIER CLASSIFY) 이전에 시뮬레이션 수행
const simulationResult = await client.simulateContract({
  address: request.to as `0x${string}`,
  abi: request.abi ?? [],
  functionName: functionSignature ?? 'unknown',
  args: decodedArgs,
  account: request.from as `0x${string}`,
  value: request.value ?? 0n,
})

// 또는 raw calldata 시뮬레이션 (ABI 없는 경우)
const callResult = await client.call({
  to: request.to as `0x${string}`,
  data: request.calldata as `0x${string}`,
  account: request.from as `0x${string}`,
  value: request.value ?? 0n,
})
```

#### 3.1.4 gas 추정

```typescript
// estimateContractGas()로 정확한 gas 추정
const gasEstimate = await client.estimateContractGas({
  address: request.to as `0x${string}`,
  abi: request.abi ?? [],
  functionName: functionSignature ?? 'unknown',
  args: decodedArgs,
  account: request.from as `0x${string}`,
  value: request.value ?? 0n,
})

// 1.2배 안전 마진 적용
const gasLimit = (gasEstimate * 120n) / 100n
```

### 3.2 Solana ContractCall 빌드

#### 3.2.1 Instruction 구성

```typescript
import { pipe, AccountRole } from '@solana/kit'

// 서비스 레이어: Solana ContractCall 빌드
async function buildSolanaContractCall(
  request: ContractCallRequest,
  rpc: Rpc<SolanaRpcApi>,
): Promise<UnsignedTransaction> {
  // 1. AccountMetaInput -> AccountRole 변환
  const accounts = request.accounts!.map((meta) => ({
    address: address(meta.address),
    role: resolveAccountRole(meta.isSigner, meta.isWritable),
  }))

  // 2. instructionData: Base64 -> Uint8Array 디코딩
  const data = Buffer.from(request.instructionData!, 'base64')

  // 3. instruction 구성
  const instruction = {
    programAddress: address(request.programId!),
    accounts,
    data: new Uint8Array(data),
  }

  // 4. 트랜잭션 메시지 빌드 (pipe 패턴)
  const { value: blockhash } = await rpc.getLatestBlockhash().send()

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(address(request.from), tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => appendTransactionMessageInstruction(instruction, tx),
  )

  return {
    message: transactionMessage,
    metadata: {
      programId: request.programId,
      type: 'CONTRACT_CALL',
    },
  }
}
```

#### 3.2.2 AccountRole 변환

```typescript
/**
 * isSigner + isWritable 조합 -> Solana AccountRole 변환.
 *
 * | isSigner | isWritable | AccountRole          |
 * |----------|------------|----------------------|
 * | true     | true       | WRITABLE_SIGNER      |
 * | true     | false      | READONLY_SIGNER      |
 * | false    | true       | WRITABLE             |
 * | false    | false      | READONLY             |
 */
function resolveAccountRole(isSigner: boolean, isWritable: boolean): AccountRole {
  if (isSigner && isWritable) return AccountRole.WRITABLE_SIGNER
  if (isSigner && !isWritable) return AccountRole.READONLY_SIGNER
  if (!isSigner && isWritable) return AccountRole.WRITABLE
  return AccountRole.READONLY
}
```

#### 3.2.3 Compute Unit 추정

```typescript
// simulateTransaction()으로 CU 소비량 확인
const simulation = await rpc.simulateTransaction(
  getBase64EncodedWireTransaction(compiledTransaction),
  { commitment: 'confirmed' }
).send()

if (simulation.value.err) {
  throw new ChainError('SIMULATION_FAILED', simulation.value.err)
}

// CU 소비량 + 20% 안전 마진 적용
const unitsConsumed = simulation.value.unitsConsumed ?? 200_000
const computeUnitLimit = Math.ceil(unitsConsumed * 1.2)
```

### 3.3 서비스 레이어 분기

```typescript
// packages/core/src/services/transaction.service.ts

async function buildTransaction(
  request: TransactionRequest,  // 유니온 타입
  adapter: IChainAdapter,
): Promise<UnsignedTransaction> {
  switch (request.type) {
    case 'TRANSFER':
    case 'TOKEN_TRANSFER':
      // Phase 22: 기존 buildTransaction() 경로
      return adapter.buildTransaction(request as TransferRequest)

    case 'CONTRACT_CALL':
      // Phase 23: 컨트랙트 호출 전용 빌드
      return adapter.buildContractCall(request as ContractCallRequest)

    case 'APPROVE':
      // 23-02에서 상세 설계
      return adapter.buildApprove(request as ApproveRequest)

    case 'BATCH':
      // 23-03에서 상세 설계
      return adapter.buildBatch(request as BatchRequest)

    default:
      throw new ChainError('UNSUPPORTED_TRANSACTION_TYPE', request.type)
  }
}
```

### 3.4 IChainAdapter 인터페이스 확장 방향

**결정:** 서비스 레이어에서 type별 빌드 함수를 호출한다. IChainAdapter에는 `buildContractCall()` 메서드를 추가하되, 기존 `buildTransaction()` 시그니처는 유지한다.

```typescript
// Phase 25에서 정식 반영 예정
interface IChainAdapter {
  // ... 기존 13개 메서드 ...

  // Phase 23 추가 메서드
  buildContractCall(request: ContractCallRequest): Promise<UnsignedTransaction>
  buildApprove(request: ApproveRequest): Promise<UnsignedTransaction>       // 23-02
  buildBatch(request: BatchRequest): Promise<UnsignedTransaction>           // 23-03
}
```

**근거:** `buildTransaction(TransferRequest | ContractCallRequest)` 유니온 확장보다, 독립 메서드 추가가 각 타입의 시맨틱을 명확히 분리한다. IChainAdapter 저수준 유지 원칙에 부합하면서도, 타입별 구현 자유도를 보장한다.

---

## 4. CONTRACT_WHITELIST 정책 규칙

### 4.1 PolicyType 확장

```typescript
// Phase 22까지: 5개
type PolicyType =
  | 'SPENDING_LIMIT' | 'WHITELIST' | 'TIME_RESTRICTION' | 'RATE_LIMIT'
  | 'ALLOWED_TOKENS'

// Phase 23 추가 (이 섹션): 6번째
type PolicyType =
  | 'SPENDING_LIMIT' | 'WHITELIST' | 'TIME_RESTRICTION' | 'RATE_LIMIT'
  | 'ALLOWED_TOKENS'
  | 'CONTRACT_WHITELIST'  // <-- 신규
```

CONTRACT_WHITELIST는 PolicyType의 6번째 값이다. METHOD_WHITELIST(섹션 5)는 7번째이다.

### 4.2 Zod 스키마: ContractWhitelistRuleSchema

```typescript
// packages/core/src/schemas/policy-rules.schema.ts

/**
 * CONTRACT_WHITELIST 정책 규칙 스키마.
 *
 * 허용된 컨트랙트/프로그램 주소 목록을 정의한다.
 * - 이 정책이 에이전트에 할당되어 있지 않으면: CONTRACT_CALL 자체 거부 (CONTRACT_CALL_DISABLED)
 * - 할당되어 있으나 allowed_contracts가 빈 배열이면: 모든 컨트랙트 거부 (CONTRACT_NOT_WHITELISTED)
 * - to 주소가 목록에 없으면: 해당 컨트랙트 거부 (CONTRACT_NOT_WHITELISTED)
 *
 * 보안 근거: v0.6 핵심 결정 "기본 전면 거부 (opt-in 화이트리스트)"
 *           23-RESEARCH.md Pitfall 2 "임의 컨트랙트 호출의 무한 공격 표면"
 */
export const ContractWhitelistRuleSchema = z.object({
  allowed_contracts: z.array(z.object({
    /** 컨트랙트/프로그램 주소 (EVM: 0x hex, Solana: Base58) */
    address: z.string().min(1, '주소는 필수'),

    /** 사람이 읽을 수 있는 라벨 (감사 로그용, 예: 'Uniswap V3 Router') */
    label: z.string().optional(),

    /** 해당 컨트랙트의 허용된 체인 (미지정 시 모든 체인에서 허용) */
    chain: z.enum(['solana', 'ethereum', 'polygon', 'arbitrum']).optional(),
  })),
})
```

### 4.3 평가 로직

```typescript
/**
 * CONTRACT_WHITELIST 정책 평가 pseudo-code.
 * Stage 3 (POLICY CHECK)에서 type === 'CONTRACT_CALL' 일 때만 실행.
 */
function evaluateContractWhitelist(
  input: PolicyEvaluationInput,
  policies: Policy[],
): PolicyDecision {
  // 1단계: CONTRACT_WHITELIST 정책이 에이전트에 할당되어 있는지 확인
  const contractWhitelist = policies.find(p => p.type === 'CONTRACT_WHITELIST')

  if (!contractWhitelist) {
    // CONTRACT_WHITELIST 정책 자체가 없으면 -> CONTRACT_CALL 기능 비활성화
    return {
      allowed: false,
      reason: 'CONTRACT_CALL_DISABLED',
      message: 'CONTRACT_WHITELIST 정책이 설정되지 않음. CONTRACT_CALL을 사용하려면 허용 컨트랙트 목록을 설정하세요.',
    }
  }

  // 2단계: allowed_contracts 파싱
  const rule = ContractWhitelistRuleSchema.parse(
    JSON.parse(contractWhitelist.rule)
  )

  // 3단계: 빈 배열 검사
  if (rule.allowed_contracts.length === 0) {
    return {
      allowed: false,
      reason: 'CONTRACT_NOT_WHITELISTED',
      message: 'CONTRACT_WHITELIST에 허용된 컨트랙트가 없습니다.',
    }
  }

  // 4단계: to 주소가 목록에 있는지 확인
  const matched = rule.allowed_contracts.find((entry) => {
    // 주소 일치 검사 (대소문자 무시 -- EVM checksum 주소 호환)
    const addressMatch = entry.address.toLowerCase() === input.to.toLowerCase()

    // chain 필드가 지정되어 있으면 체인도 일치해야 함
    if (entry.chain && entry.chain !== input.chain) {
      return false
    }

    return addressMatch
  })

  if (!matched) {
    return {
      allowed: false,
      reason: 'CONTRACT_NOT_WHITELISTED',
      message: `컨트랙트 ${input.to}는 화이트리스트에 없습니다.`,
    }
  }

  // 5단계: 통과 -> ALLOW, 다음 정책 평가 진행
  return {
    allowed: true,
    matchedLabel: matched.label,  // 감사 로그용
  }
}
```

### 4.4 보안 설계 근거

| 설계 선택 | 근거 |
|----------|------|
| 정책 미설정 = CONTRACT_CALL 비활성화 | 기본 전면 거부. 관리자가 명시적으로 화이트리스트를 구성해야만 CONTRACT_CALL 사용 가능 |
| 빈 배열 = 모든 컨트랙트 거부 | 정책은 존재하지만 아직 허용 대상을 추가하지 않은 과도 상태. 안전 측으로 거부 |
| chain 필드 선택적 | 동일 컨트랙트가 여러 체인에 배포된 경우(예: Uniswap V3), 특정 체인에서만 허용 가능 |
| 주소 비교 시 대소문자 무시 | EVM checksum 주소(0xAbCd...)와 소문자 주소(0xabcd...)의 혼용 방지 |

---

## 5. METHOD_WHITELIST 정책 규칙

### 5.1 PolicyType 확장

```typescript
// Phase 23 추가 (이 섹션): 7번째
type PolicyType =
  | 'SPENDING_LIMIT' | 'WHITELIST' | 'TIME_RESTRICTION' | 'RATE_LIMIT'
  | 'ALLOWED_TOKENS'
  | 'CONTRACT_WHITELIST'
  | 'METHOD_WHITELIST'  // <-- 신규
```

### 5.2 Zod 스키마: MethodWhitelistRuleSchema

```typescript
// packages/core/src/schemas/policy-rules.schema.ts

/**
 * METHOD_WHITELIST 정책 규칙 스키마.
 *
 * 컨트랙트별 허용된 함수 목록을 정의한다 (EVM 전용).
 * CONTRACT_WHITELIST와 조합: 컨트랙트 허용 + 메서드 허용 모두 만족해야 호출 가능.
 *
 * 적용 규칙:
 * - METHOD_WHITELIST 정책이 없으면 -> 해당 컨트랙트의 모든 메서드 허용 (CONTRACT_WHITELIST만으로 충분)
 * - contract_methods에 해당 contract_address 항목이 없으면 -> 해당 컨트랙트의 모든 메서드 허용
 * - 항목이 있으면 -> 해당 컨트랙트는 명시된 메서드만 허용
 *
 * Solana 대응: Solana 프로그램은 표준화된 function selector 규약이 없으므로,
 *            METHOD_WHITELIST는 EVM 전용이다. Solana CONTRACT_CALL은 CONTRACT_WHITELIST만 적용된다.
 */
export const MethodWhitelistRuleSchema = z.object({
  contract_methods: z.array(z.object({
    /** 컨트랙트 주소 (EVM: 0x hex) */
    contract_address: z.string().min(1, '컨트랙트 주소는 필수'),

    /**
     * 허용된 함수 selector 목록.
     * 4바이트 function selector (0x + 8 hex chars).
     * 예: '0xa9059cbb' (transfer), '0x095ea7b3' (approve)
     */
    allowed_selectors: z.array(
      z.string().regex(/^0x[0-9a-fA-F]{8}$/, '4바이트 function selector 형식: 0x + 8 hex chars')
    ).optional(),

    /**
     * 허용된 함수 시그니처 목록 (사람 가독성).
     * 예: 'transfer(address,uint256)', 'approve(address,uint256)'
     * 감사 로그 기록 및 관리 편의를 위해 선택적 제공.
     * 정책 평가 시 selector가 우선. signatures는 부가 검증 + 로깅용.
     */
    allowed_signatures: z.array(z.string()).optional(),
  })),
})
```

### 5.3 평가 로직

```typescript
/**
 * METHOD_WHITELIST 정책 평가 pseudo-code.
 * Stage 3에서 type === 'CONTRACT_CALL' && chain !== 'solana' 일 때 실행.
 * CONTRACT_WHITELIST 통과 후에 평가한다.
 */
function evaluateMethodWhitelist(
  input: PolicyEvaluationInput,
  policies: Policy[],
): PolicyDecision {
  // 1단계: METHOD_WHITELIST 정책 존재 확인
  const methodWhitelist = policies.find(p => p.type === 'METHOD_WHITELIST')

  if (!methodWhitelist) {
    // METHOD_WHITELIST 정책 자체가 없으면 -> 모든 메서드 허용
    // (CONTRACT_WHITELIST만으로 컨트랙트 수준 보안 충분)
    return { allowed: true }
  }

  // 2단계: 규칙 파싱
  const rule = MethodWhitelistRuleSchema.parse(
    JSON.parse(methodWhitelist.rule)
  )

  // 3단계: 해당 컨트랙트의 메서드 제한 조회
  const contractEntry = rule.contract_methods.find(
    (entry) => entry.contract_address.toLowerCase() === input.contractAddress!.toLowerCase()
  )

  if (!contractEntry) {
    // contract_methods에 해당 컨트랙트 항목이 없으면 -> 모든 메서드 허용
    return { allowed: true }
  }

  // 4단계: calldata에서 function selector 추출
  // selector = calldata 첫 4바이트 = '0x' + 8 hex chars = 10 chars
  const selector = input.methodSignature!  // 이미 Stage 1에서 추출됨

  // 5단계: allowed_selectors에서 selector 검사
  if (contractEntry.allowed_selectors && contractEntry.allowed_selectors.length > 0) {
    const selectorMatch = contractEntry.allowed_selectors.some(
      (s) => s.toLowerCase() === selector.toLowerCase()
    )

    if (!selectorMatch) {
      return {
        allowed: false,
        reason: 'METHOD_NOT_WHITELISTED',
        message: `함수 selector ${selector}는 컨트랙트 ${input.contractAddress}의 메서드 화이트리스트에 없습니다.`,
      }
    }
  }

  // 6단계: allowed_signatures 부가 검증 (선택적)
  // signatures가 있으면 감사 로그에 시그니처 기록
  let matchedSignature: string | undefined
  if (contractEntry.allowed_signatures) {
    matchedSignature = contractEntry.allowed_signatures.find((sig) => {
      // toFunctionSelector(sig)로 selector를 계산하여 대조
      // viem의 toFunctionSelector() 사용
      return toFunctionSelector(sig).toLowerCase() === selector.toLowerCase()
    })
  }

  // 7단계: 통과
  return {
    allowed: true,
    matchedSignature,  // 감사 로그용
  }
}
```

### 5.4 EVM Selector 추출 방법

```typescript
/**
 * calldata에서 function selector 추출.
 * calldata = '0x' + selector(4바이트=8hex) + parameters
 * selector = calldata.slice(0, 10)
 *
 * 예:
 *   '0xa9059cbb0000...0064' -> '0xa9059cbb' (transfer)
 *   '0x095ea7b30000...00ff' -> '0x095ea7b3' (approve)
 */
function extractSelector(calldata: string): string {
  if (calldata.length < 10) {
    throw new Error('calldata가 너무 짧습니다. 최소 4바이트 selector 필요.')
  }
  return calldata.slice(0, 10).toLowerCase()
}
```

### 5.5 Solana 대응

Solana 프로그램은 EVM과 달리 표준화된 function selector 규약이 없다. 각 프로그램이 독자적인 instruction 디스패칭 방식을 사용한다:

- **Anchor 프레임워크:** 8바이트 discriminator (SHA-256 해시의 첫 8바이트)
- **Native 프로그램:** 1바이트 또는 4바이트 instruction index
- **비표준 프로그램:** 프로그램별 자유 형식

이러한 이유로 **METHOD_WHITELIST는 EVM 전용**으로 설계한다. Solana CONTRACT_CALL에는 CONTRACT_WHITELIST만 적용된다. Solana 프로그램의 세분화된 함수 수준 제어가 필요한 경우, 향후 프로그램별 커스텀 정책 플러그인으로 확장할 수 있다.

---

## 6. 파이프라인 확장 (Stage 1-5) -- 크로스커팅

Phase 23의 3가지 트랜잭션 타입(CONTRACT_CALL, APPROVE, BATCH)이 기존 6단계 파이프라인에 적층되는 방식을 정의한다.

### 6.1 Stage 1 (RECEIVE) 확장

#### 6.1.1 TransactionSendRequestSchema -- 다형적 요청

```typescript
// packages/core/src/schemas/transaction.schema.ts

/**
 * POST /v1/transactions/send 요청 스키마.
 * z.discriminatedUnion('type', [...])으로 5가지 트랜잭션 타입을 다형적으로 수신한다.
 *
 * Phase 22: TRANSFER, TOKEN_TRANSFER
 * Phase 23: CONTRACT_CALL, APPROVE, BATCH
 */
export const TransactionSendRequestSchema = z.discriminatedUnion('type', [
  // ── Phase 22 기존 ──

  // TRANSFER: 네이티브 토큰 전송 (SOL, ETH)
  z.object({
    type: z.literal('TRANSFER'),
    to: z.string().min(1),
    amount: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
    memo: z.string().max(256).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  }),

  // TOKEN_TRANSFER: SPL/ERC-20 토큰 전송
  z.object({
    type: z.literal('TOKEN_TRANSFER'),
    to: z.string().min(1),
    amount: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
    tokenMint: z.string().min(1),
    memo: z.string().max(256).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  }),

  // ── Phase 23 신규 ──

  // CONTRACT_CALL: 임의 스마트 컨트랙트 호출
  z.object({
    type: z.literal('CONTRACT_CALL'),
    to: z.string().min(1),                                    // 컨트랙트/프로그램 주소
    value: z.string().regex(/^\d+$/).optional().default('0'),  // 네이티브 토큰 첨부량 (문자열)
    // EVM 전용
    calldata: z.string().regex(/^0x[0-9a-fA-F]+$/).optional(),
    abi: z.array(z.any()).optional(),
    // Solana 전용
    programId: z.string().optional(),
    instructionData: z.string().optional(),
    accounts: z.array(z.object({
      address: z.string().min(1),
      isSigner: z.boolean().default(false),
      isWritable: z.boolean().default(false),
    })).optional(),
  }),

  // APPROVE: 토큰 approve/delegate (23-02에서 상세 설계)
  z.object({
    type: z.literal('APPROVE'),
    tokenMint: z.string().min(1),                             // 토큰 주소
    spender: z.string().min(1),                               // 위임 대상 주소
    amount: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
  }),

  // BATCH: 다중 instruction 배치 (23-03에서 상세 설계)
  z.object({
    type: z.literal('BATCH'),
    instructions: z.array(z.object({
      type: z.enum(['TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE']),
      // 각 type에 맞는 필드 (유연한 스키마, 23-03에서 상세화)
    }).passthrough()).min(2, '최소 2개 instruction 필요').max(20, '최대 20개 instruction'),
  }),
])

/**
 * TransactionType 유니온 타입.
 * discriminatedUnion의 type 필드 값.
 */
export type TransactionType = z.infer<typeof TransactionSendRequestSchema>['type']
// = 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE' | 'BATCH'
```

#### 6.1.2 Stage 1 type 분기 pseudo-code

```typescript
// Stage 1: RECEIVE -- 요청 수신 및 Zod 검증
async function stage1Receive(rawBody: unknown): Promise<ValidatedRequest> {
  // 1. Zod discriminatedUnion 검증
  const parsed = TransactionSendRequestSchema.parse(rawBody)

  // 2. type에 따른 추가 검증
  switch (parsed.type) {
    case 'CONTRACT_CALL':
      // EVM/Solana 교차 검증 (ContractCallRequestSchema.refine())
      // calldata 빈 값('0x') 거부
      ContractCallRequestSchema.parse(parsed)
      break

    case 'APPROVE':
      // 23-02에서 상세 설계
      ApproveRequestSchema.parse(parsed)
      break

    case 'BATCH':
      // 23-03에서 상세 설계
      BatchRequestSchema.parse(parsed)
      break
  }

  // 3. transactions 테이블에 PENDING 레코드 생성
  const txId = generateUUIDv7()
  await db.insert(transactions).values({
    id: txId,
    walletId: session.walletId,
    sessionId: session.id,
    chain: wallet.chain,
    type: parsed.type,                          // Phase 23: 5가지 type
    amount: parsed.amount ?? parsed.value ?? '0',
    toAddress: parsed.to ?? parsed.spender,      // type별 의미 다름
    status: 'PENDING',
    // Phase 23 감사 컬럼
    contractAddress: parsed.type === 'CONTRACT_CALL' ? parsed.to : undefined,
    methodSignature: parsed.type === 'CONTRACT_CALL' && parsed.calldata
      ? extractSelector(parsed.calldata) : undefined,
    tokenAddress: parsed.tokenMint ?? undefined,
    spenderAddress: parsed.type === 'APPROVE' ? parsed.spender : undefined,
    createdAt: new Date(),
  })

  return { txId, parsed, session, agent }
}
```

### 6.2 Stage 2 (SESSION VALIDATE) 확장

#### 6.2.1 SessionConstraints 확장

```typescript
// packages/core/src/schemas/session.schema.ts (Phase 23 확장)

/**
 * SessionConstraints 스키마 확장.
 * Phase 22: allowedOperations에 'TRANSFER', 'TOKEN_TRANSFER', 'BALANCE_CHECK' 포함
 * Phase 23: 'CONTRACT_CALL', 'APPROVE', 'BATCH' 추가 + 세션 수준 컨트랙트/spender 제약
 */
export const SessionConstraintsSchema = z.object({
  // ── 기존 필드 (Phase 7) ──
  maxAmount: z.string().regex(/^\d+$/).optional(),
  allowedOperations: z.array(z.enum([
    'TRANSFER',
    'TOKEN_TRANSFER',
    'BALANCE_CHECK',
    'CONTRACT_CALL',      // Phase 23 추가
    'APPROVE',            // Phase 23 추가
    'BATCH',              // Phase 23 추가
  ])).optional(),
  allowedRecipients: z.array(z.string()).optional(),
  allowedTokens: z.array(z.string()).optional(),       // Phase 22 추가

  // ── Phase 23 신규 ──
  /**
   * 세션 수준 허용 컨트랙트 목록.
   * CONTRACT_CALL 시 이 세션이 호출 가능한 컨트랙트 주소 목록.
   * 미설정 시 정책(CONTRACT_WHITELIST)에 의존.
   * 설정 시 정책 화이트리스트와의 교집합만 허용.
   */
  allowedContracts: z.array(z.string()).optional(),

  /**
   * 세션 수준 허용 spender 목록.
   * APPROVE 시 이 세션이 승인 가능한 spender 주소 목록.
   * 미설정 시 정책(APPROVED_SPENDERS)에 의존.
   * 설정 시 정책 화이트리스트와의 교집합만 허용.
   */
  allowedSpenders: z.array(z.string()).optional(),
})
```

#### 6.2.2 Stage 2 검증 로직

```typescript
// Stage 2: SESSION VALIDATE (Phase 23 확장)
async function stage2SessionValidate(
  request: ValidatedRequest,
): Promise<void> {
  const { constraints } = request.session

  // 기존 검증: allowedOperations, maxAmount, allowedRecipients, allowedTokens
  // ... (Phase 7, Phase 22 코드) ...

  // Phase 23: CONTRACT_CALL 세션 제약 검증
  if (request.parsed.type === 'CONTRACT_CALL' && constraints?.allowedContracts) {
    const isAllowed = constraints.allowedContracts.some(
      (addr) => addr.toLowerCase() === request.parsed.to.toLowerCase()
    )
    if (!isAllowed) {
      throw new PolicyError('SESSION_CONTRACT_NOT_ALLOWED',
        `세션 제약: 컨트랙트 ${request.parsed.to}는 이 세션에서 허용되지 않습니다.`)
    }
  }

  // Phase 23: APPROVE 세션 제약 검증
  if (request.parsed.type === 'APPROVE' && constraints?.allowedSpenders) {
    const isAllowed = constraints.allowedSpenders.some(
      (addr) => addr.toLowerCase() === request.parsed.spender.toLowerCase()
    )
    if (!isAllowed) {
      throw new PolicyError('SESSION_SPENDER_NOT_ALLOWED',
        `세션 제약: spender ${request.parsed.spender}는 이 세션에서 허용되지 않습니다.`)
    }
  }
}
```

### 6.3 Stage 3 (POLICY CHECK) 확장

#### 6.3.1 PolicyEvaluationInput 확장

```typescript
// packages/core/src/interfaces/policy-engine.types.ts (Phase 23 확장)

/**
 * DatabasePolicyEngine.evaluate() 입력 인터페이스.
 * Phase 22: type, amount, to, chain, tokenAddress
 * Phase 23: contractAddress, methodSignature, spender, approveAmount,
 *          batchTotalAmount, batchInstructions 추가
 */
export interface PolicyEvaluationInput {
  // ── 공통 (Phase 7 기존) ──
  type: TransactionType                // 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE' | 'BATCH'
  amount: bigint                       // 전송 금액 또는 value (네이티브 토큰 단위)
  to: string                           // 수신자 또는 컨트랙트 주소
  chain: ChainType                     // 'solana' | 'ethereum' | 'polygon' | 'arbitrum'

  // ── Phase 22 (토큰) ──
  tokenAddress?: string                // TOKEN_TRANSFER, APPROVE: 토큰 민트/컨트랙트 주소

  // ── Phase 23 (컨트랙트 호출) ──
  contractAddress?: string             // CONTRACT_CALL: 호출 대상 컨트랙트 주소 (= to)
  methodSignature?: string             // CONTRACT_CALL: 4바이트 function selector (EVM 전용, 0x + 8 hex)

  // ── Phase 23 (Approve) -- 23-02에서 상세 설계 ──
  spender?: string                     // APPROVE: 위임 대상 주소
  approveAmount?: bigint               // APPROVE: 승인 금액 (토큰 최소 단위)

  // ── Phase 23 (Batch) -- 23-03에서 상세 설계 ──
  batchTotalAmount?: bigint            // BATCH: 모든 instruction 금액 합산
  batchInstructions?: BatchInstructionInput[]  // BATCH: 개별 instruction (정책 개별 평가용)
}

/**
 * 배치 내 개별 instruction 입력 (정책 평가용).
 * 23-03에서 상세 설계.
 */
export interface BatchInstructionInput {
  type: Exclude<TransactionType, 'BATCH'>  // BATCH 중첩 불가
  amount: bigint
  to: string
  contractAddress?: string
  methodSignature?: string
  spender?: string
  approveAmount?: bigint
  tokenAddress?: string
}
```

#### 6.3.2 정책 평가 11단계 알고리즘

```typescript
/**
 * DatabasePolicyEngine.evaluate() -- Phase 23 확장 (총 11단계).
 *
 * Phase 22까지: 6단계 (WHITELIST, TIME_RESTRICTION, RATE_LIMIT, ALLOWED_TOKENS, SPENDING_LIMIT)
 * Phase 23 추가: 5단계 (CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS,
 *                       APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE)
 *
 * DENY 우선 원칙: 어떤 단계에서든 DENY가 나오면 즉시 반환.
 */
async function evaluate(input: PolicyEvaluationInput): Promise<PolicyDecision> {
  // 1단계: 에이전트별 + 글로벌 활성 정책 로드
  const policies = await loadActivePolicies(input.walletId)

  // 2단계: WHITELIST 평가 (수신자 주소 허용 여부)
  const whitelistResult = evaluateWhitelist(input, policies)
  if (!whitelistResult.allowed) return whitelistResult

  // 3단계: TIME_RESTRICTION 평가 (시간대 제한)
  const timeResult = evaluateTimeRestriction(input, policies)
  if (!timeResult.allowed) return timeResult

  // 4단계: RATE_LIMIT 평가 (거래 빈도 제한)
  const rateResult = evaluateRateLimit(input, policies)
  if (!rateResult.allowed) return rateResult

  // 5단계: ALLOWED_TOKENS 평가 (TOKEN_TRANSFER, APPROVE 시)
  if (input.type === 'TOKEN_TRANSFER' || input.type === 'APPROVE') {
    const tokenResult = evaluateAllowedTokens(input, policies)
    if (!tokenResult.allowed) return tokenResult
  }

  // 6단계: CONTRACT_WHITELIST 평가 (CONTRACT_CALL 시) -- DENY 우선
  if (input.type === 'CONTRACT_CALL') {
    const contractResult = evaluateContractWhitelist(input, policies)
    if (!contractResult.allowed) return contractResult
  }

  // 7단계: METHOD_WHITELIST 평가 (CONTRACT_CALL + EVM 전용) -- DENY 우선
  if (input.type === 'CONTRACT_CALL' && input.chain !== 'solana') {
    const methodResult = evaluateMethodWhitelist(input, policies)
    if (!methodResult.allowed) return methodResult
  }

  // 8단계: APPROVED_SPENDERS 평가 (APPROVE 시) -- 23-02에서 상세 설계
  if (input.type === 'APPROVE') {
    const spenderResult = evaluateApprovedSpenders(input, policies)
    if (!spenderResult.allowed) return spenderResult
  }

  // 9단계: APPROVE_AMOUNT_LIMIT 평가 (APPROVE 시) -- 23-02에서 상세 설계
  if (input.type === 'APPROVE') {
    const amountResult = evaluateApproveAmountLimit(input, policies)
    if (!amountResult.allowed) return amountResult
  }

  // 10단계: APPROVE_TIER_OVERRIDE 평가 (APPROVE 시) -- 23-02에서 상세 설계
  if (input.type === 'APPROVE') {
    const tierOverride = evaluateApproveTierOverride(input, policies)
    if (tierOverride.tier) return { allowed: true, tier: tierOverride.tier }
  }

  // 11단계: SPENDING_LIMIT 평가 -> 4-티어 분류
  //   CONTRACT_CALL: value(네이티브 토큰 첨부량)를 SPENDING_LIMIT에 반영
  //   BATCH: batchTotalAmount를 SPENDING_LIMIT에 반영
  const effectiveAmount = resolveEffectiveAmount(input)
  return evaluateSpendingLimit(effectiveAmount, policies)
}

/**
 * type별 SPENDING_LIMIT 평가 금액 결정.
 */
function resolveEffectiveAmount(input: PolicyEvaluationInput): bigint {
  switch (input.type) {
    case 'TRANSFER':
      return input.amount
    case 'TOKEN_TRANSFER':
      return 0n  // Phase 24 USD 통합 전 -- 토큰 금액 비교 불가, 기본 NOTIFY
    case 'CONTRACT_CALL':
      return input.amount  // = value (네이티브 토큰 첨부량)
    case 'APPROVE':
      return 0n  // APPROVE_TIER_OVERRIDE에서 독립 결정 (10단계)
    case 'BATCH':
      return input.batchTotalAmount ?? 0n  // 합산 금액
    default:
      return input.amount
  }
}
```

#### 6.3.3 type별 정책 적용 매트릭스

| 정책 타입 | TRANSFER | TOKEN_TRANSFER | CONTRACT_CALL | APPROVE | BATCH |
|----------|----------|---------------|---------------|---------|-------|
| WHITELIST | O (to) | O (to) | X | X | O (개별) |
| TIME_RESTRICTION | O | O | O | O | O |
| RATE_LIMIT | O | O | O | O | O (1건) |
| ALLOWED_TOKENS | X | O | X | O | O (개별) |
| CONTRACT_WHITELIST | X | X | **O** | X | O (개별) |
| METHOD_WHITELIST | X | X | **O** (EVM) | X | O (개별) |
| APPROVED_SPENDERS | X | X | X | **O** | O (개별) |
| APPROVE_AMOUNT_LIMIT | X | X | X | **O** | O (개별) |
| APPROVE_TIER_OVERRIDE | X | X | X | **O** | X |
| SPENDING_LIMIT | O (amount) | X (Phase 24) | O (value) | X | O (합산) |

> **BATCH 참고:** 배치 내 개별 instruction은 해당 type의 정책이 각각 적용된다. 금액은 합산하여 SPENDING_LIMIT에 반영한다. All-or-Nothing: 하나라도 정책 위반이면 전체 배치 거부. 상세 설계는 23-03에서 정의한다.

### 6.4 Stage 4 (TIER CLASSIFY) 확장

```typescript
// Stage 4: TIER CLASSIFY (Phase 23 확장)

/**
 * type별 보안 티어 결정 로직.
 *
 * TRANSFER: SPENDING_LIMIT 기반 4-티어 (기존)
 * TOKEN_TRANSFER: 기본 NOTIFY (Phase 24 USD 통합 전 과도기)
 * CONTRACT_CALL: 기본 APPROVAL (보수적, Owner 승인 필수)
 * APPROVE: APPROVE_TIER_OVERRIDE 독립 결정 (23-02에서 상세)
 * BATCH: 합산 금액 기반 4-티어
 */
function classifyTier(
  input: PolicyEvaluationInput,
  policyDecision: PolicyDecision,
): TransactionTier {
  // 정책 엔진이 이미 tier를 결정한 경우 (APPROVE_TIER_OVERRIDE 등)
  if (policyDecision.tier) return policyDecision.tier

  switch (input.type) {
    case 'CONTRACT_CALL':
      // CONTRACT_CALL 기본 티어: APPROVAL
      // value > 0인 경우에도 APPROVAL 유지 (이미 최고 보안 수준)
      // 관리자가 CONTRACT_WHITELIST에서 특정 컨트랙트의 티어를 낮출 수 있도록
      // 향후 확장 포인트 예비 (Phase 25+)
      return 'APPROVAL'

    case 'TOKEN_TRANSFER':
      // Phase 22 과도기: 기본 NOTIFY
      return policyDecision.tier ?? 'NOTIFY'

    case 'BATCH':
      // 합산 금액 기반 4-티어 (SPENDING_LIMIT 결과 사용)
      return policyDecision.tier ?? 'APPROVAL'

    default:
      // TRANSFER: SPENDING_LIMIT 기반 기존 4-티어
      return policyDecision.tier ?? 'INSTANT'
  }
}
```

### 6.5 Stage 5 (EXECUTE) 확장

```typescript
// Stage 5: EXECUTE (Phase 23 확장)

/**
 * type별 빌드 + 시뮬레이션 + 서명 + 제출 실행.
 * IChainAdapter의 4단계 트랜잭션 분리를 type별로 분기.
 */
async function stage5Execute(
  request: ValidatedRequest,
  adapter: IChainAdapter,
  privateKey: Uint8Array,
): Promise<SubmitResult> {
  let unsignedTx: UnsignedTransaction

  // type별 빌드 분기
  switch (request.parsed.type) {
    case 'TRANSFER':
    case 'TOKEN_TRANSFER':
      // Phase 22: 기존 buildTransaction() 경로
      unsignedTx = await adapter.buildTransaction(request.transferRequest)
      break

    case 'CONTRACT_CALL':
      // Phase 23: 컨트랙트 호출 전용 빌드
      unsignedTx = await adapter.buildContractCall(request.contractCallRequest)
      break

    case 'APPROVE':
      // 23-02에서 상세 설계
      unsignedTx = await adapter.buildApprove(request.approveRequest)
      break

    case 'BATCH':
      // 23-03에서 상세 설계
      unsignedTx = await adapter.buildBatch(request.batchRequest)
      break
  }

  // 시뮬레이션 (모든 type 공통)
  const simResult = await adapter.simulateTransaction(unsignedTx)
  if (!simResult.success) {
    throw new ChainError('SIMULATION_FAILED', simResult.error)
  }

  // 서명
  const signedTx = await adapter.signTransaction(unsignedTx, privateKey)

  // 제출
  const submitResult = await adapter.submitTransaction(signedTx)

  return submitResult
}
```

### 6.6 Stage 6 (CONFIRM) -- 변경 없음

Stage 6 (CONFIRM)은 txHash 기반 온체인 확정 대기로, type에 무관하게 동일한 로직이 적용된다. Phase 23에서 변경 없음.

---

## 7. DB 스키마 확장 -- 크로스커팅

### 7.1 TransactionType Enum 정식화

Phase 23에서 TransactionType을 5개 값의 공식 Enum으로 등록한다. 기존 transactions.type은 CHECK 제약 없는 TEXT 컬럼이었으나, Phase 23에서 CHECK 제약을 추가한다.

```typescript
// packages/core/src/schemas/enums.ts (Phase 23 정식화)

/**
 * TransactionType Enum -- 5개 값.
 *
 * | 값                | Phase   | 설명                              |
 * |-------------------|---------|-----------------------------------|
 * | TRANSFER          | v0.2    | 네이티브 토큰 전송 (SOL, ETH)     |
 * | TOKEN_TRANSFER    | Phase 22| SPL/ERC-20 토큰 전송              |
 * | CONTRACT_CALL     | Phase 23| 임의 스마트 컨트랙트 호출         |
 * | APPROVE           | Phase 23| 토큰 approve/delegate             |
 * | BATCH             | Phase 23| 다중 instruction 배치 (Solana)    |
 */
export const TransactionTypeEnum = z.enum([
  'TRANSFER',
  'TOKEN_TRANSFER',
  'CONTRACT_CALL',
  'APPROVE',
  'BATCH',
])

export type TransactionType = z.infer<typeof TransactionTypeEnum>
// = 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE' | 'BATCH'
```

### 7.2 PolicyType Enum 확장

Phase 23에서 PolicyType을 10개 값으로 확장한다.

```typescript
// packages/core/src/schemas/enums.ts (Phase 23 확장)

/**
 * PolicyType Enum -- 10개 값.
 *
 * | 값                    | Phase    | 설명                             | 적용 type          |
 * |-----------------------|----------|----------------------------------|--------------------|
 * | SPENDING_LIMIT        | Phase 8  | 거래 금액 제한 (건당/일간/주간)  | TRANSFER, CONTRACT_CALL, BATCH |
 * | WHITELIST             | Phase 8  | 허용 주소 목록                   | TRANSFER, TOKEN_TRANSFER |
 * | TIME_RESTRICTION      | Phase 8  | 시간대 제한                      | 모든 type          |
 * | RATE_LIMIT            | Phase 8  | 거래 빈도 제한                   | 모든 type          |
 * | ALLOWED_TOKENS        | Phase 22 | 허용 토큰 목록                   | TOKEN_TRANSFER, APPROVE |
 * | CONTRACT_WHITELIST    | Phase 23 | 허용 컨트랙트 목록               | CONTRACT_CALL      |
 * | METHOD_WHITELIST      | Phase 23 | 허용 함수 selector (EVM)         | CONTRACT_CALL      |
 * | APPROVED_SPENDERS     | Phase 23 | 허용 approve spender             | APPROVE            |
 * | APPROVE_AMOUNT_LIMIT  | Phase 23 | approve 최대 금액                | APPROVE            |
 * | APPROVE_TIER_OVERRIDE | Phase 23 | approve 독립 보안 티어           | APPROVE            |
 */
export const PolicyTypeEnum = z.enum([
  // Phase 8 기존 (4개)
  'SPENDING_LIMIT',
  'WHITELIST',
  'TIME_RESTRICTION',
  'RATE_LIMIT',
  // Phase 22 추가 (1개)
  'ALLOWED_TOKENS',
  // Phase 23 추가 (5개)
  'CONTRACT_WHITELIST',
  'METHOD_WHITELIST',
  'APPROVED_SPENDERS',
  'APPROVE_AMOUNT_LIMIT',
  'APPROVE_TIER_OVERRIDE',
])

export type PolicyType = z.infer<typeof PolicyTypeEnum>
```

### 7.3 transactions 테이블 확장 -- 감사 컬럼 4개

```typescript
// packages/core/src/db/schema.ts (Phase 23 확장)

export const transactions = sqliteTable('transactions', {
  // ── 기존 14개 컬럼 (CORE-02) ──
  id: text('id').primaryKey(),
  walletId: text('wallet_id').notNull()
    .references(() => wallets.id, { onDelete: 'restrict' }),
  sessionId: text('session_id')
    .references(() => sessions.id, { onDelete: 'set null' }),
  chain: text('chain').notNull(),
  txHash: text('tx_hash'),
  type: text('type').notNull(),              // Phase 23: CHECK 제약 추가 (아래 DDL 참조)
  amount: text('amount'),
  toAddress: text('to_address'),
  status: text('status', {
    enum: ['PENDING', 'QUEUED', 'EXECUTING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED']
  }).notNull().default('PENDING'),
  tier: text('tier', {
    enum: ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']
  }),
  queuedAt: integer('queued_at', { mode: 'timestamp' }),
  executedAt: integer('executed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  error: text('error'),
  metadata: text('metadata'),

  // ── Phase 23 감사 컬럼 (4개) ──

  /**
   * 호출된 컨트랙트/프로그램 주소.
   * CONTRACT_CALL: 호출 대상 컨트랙트 주소
   * APPROVE: 토큰 컨트랙트 주소
   * 기타 type에서는 NULL
   */
  contractAddress: text('contract_address'),

  /**
   * 호출된 함수 시그니처.
   * CONTRACT_CALL: 4바이트 function selector (0x + 8 hex, EVM) 또는 프로그램 instruction 요약 (Solana)
   * APPROVE: 'approve(address,uint256)' (EVM) 또는 'ApproveChecked' (Solana)
   * 기타 type에서는 NULL
   */
  methodSignature: text('method_signature'),

  /**
   * 토큰 주소.
   * TOKEN_TRANSFER: 전송 대상 토큰 민트/컨트랙트 주소
   * APPROVE: approve 대상 토큰 주소
   * 기타 type에서는 NULL
   */
  tokenAddress: text('token_address'),

  /**
   * approve spender 주소.
   * APPROVE: 위임 대상 주소
   * 기타 type에서는 NULL
   */
  spenderAddress: text('spender_address'),
}, (table) => [
  // 기존 인덱스
  index('idx_transactions_wallet_status').on(table.walletId, table.status),
  index('idx_transactions_session_id').on(table.sessionId),
  uniqueIndex('idx_transactions_tx_hash').on(table.txHash),
  index('idx_transactions_queued_at').on(table.queuedAt),
  index('idx_transactions_created_at').on(table.createdAt),

  // Phase 23 신규 인덱스
  index('idx_transactions_contract_address').on(table.contractAddress),  // 컨트랙트별 감사 조회
  index('idx_transactions_spender_address').on(table.spenderAddress),    // spender별 approve 이력 조회
])
```

### 7.4 SQL DDL 확장

```sql
-- Phase 23 감사 컬럼 추가
ALTER TABLE transactions ADD COLUMN contract_address TEXT;
ALTER TABLE transactions ADD COLUMN method_signature TEXT;
ALTER TABLE transactions ADD COLUMN token_address TEXT;
ALTER TABLE transactions ADD COLUMN spender_address TEXT;

-- Phase 23 인덱스 추가
CREATE INDEX idx_transactions_contract_address ON transactions(contract_address);
CREATE INDEX idx_transactions_spender_address ON transactions(spender_address);

-- Phase 23 type CHECK 제약
-- 주의: SQLite ALTER TABLE은 기존 컬럼에 CHECK 추가를 지원하지 않는다.
-- 마이그레이션 시 테이블 재생성이 필요하다.
-- Drizzle Kit의 `drizzle-kit push` 명령이 테이블 재생성을 자동 처리한다.
--
-- 재생성 후 type 컬럼:
--   type TEXT NOT NULL CHECK (type IN ('TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE', 'BATCH'))

-- PolicyType CHECK 제약도 동일하게 재생성 필요:
--   type TEXT NOT NULL CHECK (type IN ('SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT',
--     'ALLOWED_TOKENS', 'CONTRACT_WHITELIST', 'METHOD_WHITELIST', 'APPROVED_SPENDERS',
--     'APPROVE_AMOUNT_LIMIT', 'APPROVE_TIER_OVERRIDE'))
```

### 7.5 마이그레이션 전략

| 단계 | 작업 | 방법 |
|------|------|------|
| 1 | 감사 컬럼 4개 추가 | `ALTER TABLE ADD COLUMN` (SQLite 지원) |
| 2 | 인덱스 2개 추가 | `CREATE INDEX` |
| 3 | type CHECK 제약 추가 | Drizzle Kit `push` (테이블 재생성) |
| 4 | PolicyType CHECK 확장 | Drizzle Kit `push` (테이블 재생성) |

**Drizzle Kit push 기반 마이그레이션:**
- `drizzle-kit push:sqlite`는 스키마 diff를 감지하고 SQLite 테이블 재생성을 자동 처리
- 기존 데이터는 임시 테이블로 복사 후 재생성된 테이블에 복원
- 개발/스테이징 환경에서 사용. 프로덕션에서는 `drizzle-kit generate` + 수동 검토 권장

---

## 8. REST API 확장 -- 크로스커팅

### 8.1 POST /v1/transactions/send 스키마 확장

기존 `POST /v1/transactions/send`의 요청 스키마를 `z.discriminatedUnion('type', [...])` 5개 variant로 확장한다. 섹션 6.1.1의 `TransactionSendRequestSchema`가 이 엔드포인트의 요청 스키마이다.

**요청 예시 -- CONTRACT_CALL (EVM):**

```json
{
  "type": "CONTRACT_CALL",
  "to": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  "value": "0",
  "calldata": "0x414bf389000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000001f4",
  "abi": [{"name": "exactInputSingle", "type": "function", "inputs": [...]}]
}
```

**요청 예시 -- CONTRACT_CALL (Solana):**

```json
{
  "type": "CONTRACT_CALL",
  "to": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "programId": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "instructionData": "AQAAAA==",
  "accounts": [
    {"address": "GfW4Bh7yUFgEwNMh3cYNpW1QCfW7mKG6MgTLYjF5pTqZ", "isSigner": true, "isWritable": true},
    {"address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "isSigner": false, "isWritable": false}
  ]
}
```

### 8.2 응답 스키마

기존 `TransactionResponse` 스키마를 재사용한다. Phase 23에서 응답 형식 변경 없음.

```typescript
// 기존 TransactionResponse (변경 없음)
const TransactionResponseSchema = z.object({
  id: z.string(),                                    // UUID v7
  status: TransactionStatusEnum,                     // 'PENDING' | 'QUEUED' | ...
  tier: TierEnum.optional(),                         // 'INSTANT' | 'NOTIFY' | 'DELAY' | 'APPROVAL'
  type: TransactionTypeEnum,                         // Phase 23: 5가지 type 포함
  txHash: z.string().nullable(),                     // 온체인 해시 (제출 후)
  createdAt: z.string(),                             // ISO 8601
})
```

### 8.3 에러 코드 10개 추가

37-rest-api-complete-spec.md의 에러 코드 체계를 확장한다. 도메인: `tx` (트랜잭션).

| # | 에러 코드 | HTTP | 도메인 | 설명 | 발생 조건 |
|---|----------|------|--------|------|----------|
| 1 | `CONTRACT_CALL_DISABLED` | 403 | tx | CONTRACT_CALL 기능 비활성화 | CONTRACT_WHITELIST 정책이 에이전트에 설정되지 않음 |
| 2 | `CONTRACT_NOT_WHITELISTED` | 403 | tx | 컨트랙트가 화이트리스트에 없음 | to 주소가 CONTRACT_WHITELIST에 없음 |
| 3 | `METHOD_NOT_WHITELISTED` | 403 | tx | 함수가 메서드 화이트리스트에 없음 | calldata selector가 METHOD_WHITELIST에 없음 (EVM) |
| 4 | `APPROVE_DISABLED` | 403 | tx | APPROVE 기능 비활성화 | APPROVED_SPENDERS 정책이 에이전트에 설정되지 않음 |
| 5 | `SPENDER_NOT_APPROVED` | 403 | tx | spender가 승인 목록에 없음 | spender 주소가 APPROVED_SPENDERS에 없음 |
| 6 | `APPROVE_AMOUNT_EXCEEDED` | 403 | tx | approve 금액 초과 | approve 금액이 APPROVE_AMOUNT_LIMIT 초과 |
| 7 | `UNLIMITED_APPROVE_BLOCKED` | 403 | tx | 무제한 approve 차단 | approve 금액이 unlimited_threshold 이상 + block_unlimited=true |
| 8 | `BATCH_NOT_SUPPORTED` | 400 | tx | 체인이 배치 미지원 | EVM 체인에서 BATCH type 요청 |
| 9 | `BATCH_SIZE_EXCEEDED` | 400 | tx | 배치 크기 초과 | instruction 수 > 20 또는 직렬화 크기 > 1232 bytes (Solana) |
| 10 | `BATCH_POLICY_VIOLATION` | 403 | tx | 배치 내 정책 위반 | 배치 내 개별 instruction이 정책 위반 (All-or-Nothing) |

### 8.4 에러 응답 형식

```typescript
// 에러 응답 예시 -- CONTRACT_NOT_WHITELISTED
{
  "error": {
    "code": "CONTRACT_NOT_WHITELISTED",
    "message": "컨트랙트 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45는 화이트리스트에 없습니다.",
    "details": {
      "contractAddress": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
      "walletId": "01JKABCDEF1234567890"
    }
  }
}

// 에러 응답 예시 -- METHOD_NOT_WHITELISTED
{
  "error": {
    "code": "METHOD_NOT_WHITELISTED",
    "message": "함수 selector 0x414bf389는 컨트랙트 0x68b...Fc45의 메서드 화이트리스트에 없습니다.",
    "details": {
      "selector": "0x414bf389",
      "contractAddress": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"
    }
  }
}

// 에러 응답 예시 -- BATCH_NOT_SUPPORTED
{
  "error": {
    "code": "BATCH_NOT_SUPPORTED",
    "message": "EVM 체인에서 BATCH 트랜잭션은 지원되지 않습니다. Solana에서만 사용 가능합니다.",
    "details": {
      "chain": "ethereum",
      "supportedChains": ["solana"]
    }
  }
}
```

---

## 9. CONTRACT_CALL 보안 가이드라인 + 테스트 시나리오

### 9.1 보안 위험 매트릭스

| # | 위험 | 심각도 | 완화 방안 | 참조 |
|---|------|--------|----------|------|
| 1 | 악의적 컨트랙트 호출 | CRITICAL | CONTRACT_WHITELIST 필수 (기본 전면 거부) | 23-RESEARCH Pitfall 2 |
| 2 | 위험 함수 호출 (selfdestruct, delegatecall) | CRITICAL | METHOD_WHITELIST로 허용 함수만 통과 | 23-RESEARCH Pitfall 2 |
| 3 | 과도한 네이티브 토큰 첨부 (value) | HIGH | SPENDING_LIMIT에 value 포함, Stage 4 APPROVAL 기본 티어 | 23-RESEARCH 보안 모델 |
| 4 | 시뮬레이션 우회 (상태 의존적 호출) | MEDIUM | 시뮬레이션 실패 시 무조건 거부, 감사 로그 기록 | 23-RESEARCH 보안 모델 |
| 5 | 가스 고갈 공격 (과도한 gas 소비) | MEDIUM | gas 추정값 * 1.2 상한, 시뮬레이션 CU/gas 사전 검증 | 23-RESEARCH 보안 모델 |

### 9.2 보안 설계 결정

| 결정 | 근거 |
|------|------|
| CONTRACT_CALL 기본 티어 = APPROVAL | 임의 컨트랙트 호출은 가장 위험한 작업. Owner 승인 필수가 기본 |
| calldata 필수 (빈 '0x' 거부) | 빈 calldata는 EVM fallback/receive 함수 트리거. 의도치 않은 동작 방지 |
| METHOD_WHITELIST는 EVM 전용 | Solana는 표준 selector가 없음. 프로그램 수준 화이트리스트로 충분 |
| 주소 비교 시 lowercase 정규화 | EVM checksum 주소 불일치로 인한 정책 우회 방지 |
| ABI 선택적 제공 | ABI 없이도 calldata로 호출 가능. ABI는 보안 강화(함수명 로깅)용 |

### 9.3 테스트 시나리오

#### 9.3.1 테스트 레벨

| 레벨 | 범위 | Mock 경계 |
|------|------|----------|
| Level 1 (Unit) | ContractCallRequest Zod 검증, selector 추출, 정책 평가 로직 | 없음 (순수 함수) |
| Level 2 (Integration) | 파이프라인 Stage 1-5 통합 | IChainAdapter.buildContractCall (Mock), RPC client (Mock) |
| Level 3 (Chain Mock) | EVM Hardhat/Anvil 임의 컨트랙트 배포 + 호출 | 실제 로컬 체인 (Hardhat/Anvil, Solana Test Validator) |
| Level 4 (Security) | 정책 우회 시도, 악의적 입력, 경계값 | DatabasePolicyEngine 실제 DB |

#### 9.3.2 Mock 경계

| 컴포넌트 | Mock 방식 | 목적 |
|----------|----------|------|
| IChainAdapter.buildContractCall | Mock (반환값 지정) | 어댑터 실 구현 없이 서비스 레이어 테스트 |
| DatabasePolicyEngine.evaluate | Mock 또는 실 DB | 정책 로직 단위 테스트 vs 통합 테스트 분리 |
| RPC client (Solana/EVM) | Mock 응답 | 네트워크 의존 없이 빌드 로직 검증 |

#### 9.3.3 시나리오 상세

**정상 시나리오 (2개):**

| # | 시나리오 | 입력 | 기대 결과 |
|---|---------|------|----------|
| S-01 | EVM 정상 컨트랙트 호출 | type=CONTRACT_CALL, to=화이트리스트 컨트랙트, calldata=화이트리스트 selector | PENDING -> QUEUED(APPROVAL) -> CONFIRMED |
| S-02 | Solana 정상 프로그램 호출 | type=CONTRACT_CALL, to=화이트리스트 프로그램, programId+instructionData+accounts | PENDING -> QUEUED(APPROVAL) -> CONFIRMED |

**정책 거부 시나리오 (5개):**

| # | 시나리오 | 입력 | 기대 에러 |
|---|---------|------|----------|
| S-03 | CONTRACT_WHITELIST 미설정 | type=CONTRACT_CALL, 에이전트에 CONTRACT_WHITELIST 정책 없음 | CONTRACT_CALL_DISABLED (403) |
| S-04 | 비화이트리스트 컨트랙트 | type=CONTRACT_CALL, to=화이트리스트에 없는 주소 | CONTRACT_NOT_WHITELISTED (403) |
| S-05 | 비화이트리스트 메서드 (EVM) | type=CONTRACT_CALL, calldata selector가 METHOD_WHITELIST에 없음 | METHOD_NOT_WHITELISTED (403) |
| S-06 | 체인 불일치 | type=CONTRACT_CALL, CONTRACT_WHITELIST.chain=ethereum, 실제 chain=solana | CONTRACT_NOT_WHITELISTED (403) |
| S-07 | 세션 제약 위반 | type=CONTRACT_CALL, session.allowedContracts에 to가 없음 | SESSION_CONTRACT_NOT_ALLOWED (403) |

**에러 시나리오 (3개):**

| # | 시나리오 | 입력 | 기대 에러 |
|---|---------|------|----------|
| S-08 | calldata 없는 EVM 호출 | type=CONTRACT_CALL, calldata 미제공, programId도 미제공 | Zod 검증 실패 (400) |
| S-09 | 빈 calldata ('0x') | type=CONTRACT_CALL, calldata='0x' | Zod refine 실패: "최소 4바이트 selector 필요" (400) |
| S-10 | Solana accounts 누락 | type=CONTRACT_CALL, programId 제공, accounts 미제공 | Zod refine 실패: "accounts 필수" (400) |

**보안 시나리오 (3개):**

| # | 시나리오 | 입력 | 기대 동작 |
|---|---------|------|----------|
| S-11 | 과도한 value 첨부 | type=CONTRACT_CALL, value=APPROVAL 티어 이상 | SPENDING_LIMIT 평가 -> APPROVAL 티어 (Owner 승인 필수) |
| S-12 | 시뮬레이션 실패 컨트랙트 | type=CONTRACT_CALL, 시뮬레이션에서 revert | SIMULATION_FAILED 에러, 트랜잭션 FAILED 상태 |
| S-13 | EVM checksum 주소 우회 시도 | type=CONTRACT_CALL, to='0xAbCd...'(혼합 케이스), 화이트리스트='0xabcd...'(소문자) | lowercase 정규화로 일치 -> 정상 통과 |

**추가 보안 시나리오 (1개):**

| # | 시나리오 | 입력 | 기대 동작 |
|---|---------|------|----------|
| S-14 | Solana to !== programId 불일치 | type=CONTRACT_CALL, to='AAA', programId='BBB' | Zod refine 실패: "to와 programId 동일해야 함" (400) |

**총 14개 시나리오:** 정상 2 + 정책 거부 5 + 에러 3 + 보안 4

---

## 10. 기존 문서 영향 분석

Phase 25에서 수정이 필요한 기존 문서 목록과 변경 범위를 정리한다.

### 10.1 영향 받는 문서 목록

| # | 문서 | 문서 ID | 변경 범위 | 우선순위 |
|---|------|---------|----------|---------|
| 1 | 27-chain-adapter-interface.md | CORE-04 | buildContractCall(), buildApprove(), buildBatch() 메서드 추가, TransferRequest 유니온 확장 | HIGH |
| 2 | 25-sqlite-schema.md | CORE-02 | TransactionType CHECK 5개, 감사 컬럼 4개, PolicyType CHECK 10개, 인덱스 2개 | HIGH |
| 3 | 32-transaction-pipeline-api.md | TX-PIPE | Stage 1 discriminatedUnion 5개 type, Stage 2 allowedContracts/allowedSpenders, Stage 3 evaluate() 11단계, Stage 4/5 type 분기 | HIGH |
| 4 | 33-time-lock-approval-mechanism.md | LOCK-MECH | PolicyType 10개, evaluate() 11단계 알고리즘, CONTRACT_CALL 기본 APPROVAL 티어 | HIGH |
| 5 | 37-rest-api-complete-spec.md | API-SPEC | TransactionSendRequestSchema discriminatedUnion, 에러 코드 10개 추가 | HIGH |
| 6 | 45-enum-unified-mapping.md | ENUM-MAP | TransactionType 5개 등록, PolicyType 10개 확장 | MEDIUM |

### 10.2 문서별 상세 변경

**27-chain-adapter-interface.md (CORE-04):**
- 섹션 3 (IChainAdapter 인터페이스): buildContractCall(ContractCallRequest), buildApprove(ApproveRequest), buildBatch(BatchRequest) 메서드 3개 추가
- 섹션 2 (공통 타입): ContractCallRequest, ApproveRequest, BatchRequest, AccountMetaInput 타입 추가
- 기존 buildTransaction() 시그니처 변경 없음 (독립 메서드 패턴)

**25-sqlite-schema.md (CORE-02):**
- 섹션 2.3 (transactions 테이블): 감사 컬럼 4개 + 인덱스 2개 추가, type CHECK 제약 추가
- 섹션 2.5 (policies 테이블): PolicyType CHECK 10개로 확장

**32-transaction-pipeline-api.md (TX-PIPE):**
- 섹션 3 (Stage 1-5): type 분기 pseudo-code 전면 업데이트
- Stage 1 TransactionSendRequestSchema 교체
- Stage 2 SessionConstraints 확장 필드 추가
- Stage 3 evaluate() 11단계 알고리즘 반영
- Stage 4 type별 티어 결정 로직 추가
- Stage 5 type별 빌드 분기 추가

**33-time-lock-approval-mechanism.md (LOCK-MECH):**
- 섹션 2 (DatabasePolicyEngine): PolicyType 10개, evaluate() 11단계, PolicyEvaluationInput 확장
- 섹션 3 (정책 규칙 Zod 스키마): CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE 5개 추가
- CONTRACT_CALL 기본 APPROVAL 티어 명시

**37-rest-api-complete-spec.md (API-SPEC):**
- POST /v1/transactions/send 요청 스키마: discriminatedUnion 5개 variant
- 에러 코드 섹션: 10개 신규 에러 코드 추가 (총 46개)
- 요청/응답 예시 업데이트

**45-enum-unified-mapping.md (ENUM-MAP):**
- TransactionType 신규 등록 (5개 값, DB CHECK, Drizzle ORM, Zod, TypeScript)
- PolicyType 10개로 확장 (기존 4개 -> 10개)

### 10.3 23-02, 23-03 확장 포인트 요약

이 문서에서 "23-02에서 상세 설계" 또는 "23-03에서 상세 설계"로 표기된 항목:

| 확장 포인트 | 문서 | 설계 범위 |
|------------|------|----------|
| ApproveRequest 인터페이스 | 23-02 | EVM approve + Solana ApproveChecked 상세 빌드 로직 |
| APPROVED_SPENDERS 정책 상세 | 23-02 | Zod 스키마, 평가 로직, 보안 설계 |
| APPROVE_AMOUNT_LIMIT 정책 상세 | 23-02 | 무제한 approve 감지, 임계값 설정, block_unlimited |
| APPROVE_TIER_OVERRIDE 정책 상세 | 23-02 | 독립 티어 결정 로직, amount_tiers |
| ApproveVariant Zod 스키마 상세 | 23-02 | REST API 요청 필드 상세화 |
| BatchRequest 인터페이스 | 23-03 | Solana multi-instruction 빌드 로직, 크기 검증 |
| BatchVariant Zod 스키마 상세 | 23-03 | REST API 요청 필드 상세화, instruction 내부 스키마 |
| BATCH 정책 합산 평가 | 23-03 | All-or-Nothing, 개별 + 합산 이중 평가 |
| EVM BATCH 거부 로직 | 23-03 | BATCH_NOT_SUPPORTED 에러 반환 조건 |

---

## 부록 A: Phase 23 APPROVE/BATCH 크로스커팅 정책 스키마 예비 정의

23-02, 23-03에서 상세화할 정책 스키마의 예비 구조. 23-RESEARCH.md Deep Dive 섹션에서 도출.

### A.1 APPROVED_SPENDERS (23-02에서 정식화)

```typescript
export const ApprovedSpendersRuleSchema = z.object({
  allowed_spenders: z.array(z.object({
    address: z.string().min(1),
    label: z.string().optional(),
    chain: z.enum(['solana', 'ethereum', 'polygon', 'arbitrum']).optional(),
  })),
})
```

### A.2 APPROVE_AMOUNT_LIMIT (23-02에서 정식화)

```typescript
export const ApproveAmountLimitRuleSchema = z.object({
  max_approve_amount: z.string().regex(/^\d+$/),
  unlimited_threshold: z.string().regex(/^\d+$/).optional(),
  block_unlimited: z.boolean().default(true),
})
```

### A.3 APPROVE_TIER_OVERRIDE (23-02에서 정식화)

```typescript
export const ApproveTierOverrideRuleSchema = z.object({
  default_tier: z.enum(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']).default('APPROVAL'),
  amount_tiers: z.array(z.object({
    max_amount: z.string().regex(/^\d+$/),
    tier: z.enum(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']),
  })).optional(),
})
```

---

## 부록 B: 용어 정의

| 용어 | 정의 |
|------|------|
| calldata | EVM 스마트 컨트랙트에 전달하는 ABI 인코딩된 바이너리 데이터 (0x hex 문자열) |
| function selector | calldata 첫 4바이트. 호출할 함수를 식별하는 keccak256 해시의 앞 4바이트 |
| instruction data | Solana 프로그램에 전달하는 바이너리 데이터 (Base64 인코딩) |
| programId | Solana에서 호출할 프로그램의 주소 (Base58) |
| AccountRole | Solana instruction 계정의 권한 (WRITABLE_SIGNER, WRITABLE, READONLY_SIGNER, READONLY) |
| opt-in | 기본 비활성 상태에서 명시적 설정으로 활성화하는 패턴 |
| discriminatedUnion | Zod의 type 필드 기반 다형적 스키마 검증 패턴 |
| All-or-Nothing | 배치 내 하나라도 실패/거부되면 전체를 거부하는 원칙 |
