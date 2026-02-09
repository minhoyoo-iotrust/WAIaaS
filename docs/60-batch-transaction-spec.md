# 배치 트랜잭션 스펙 (CHAIN-EXT-05)

**문서 ID:** CHAIN-EXT-05
**작성일:** 2026-02-08
**상태:** 완료
**Phase:** 23 (트랜잭션 타입 확장 설계)
**참조:** CHAIN-EXT-03 (58-contract-call-spec.md), CHAIN-EXT-01 (56-token-transfer-extension-spec.md), CHAIN-SOL (31-solana-adapter-detail.md), TX-PIPE (32-transaction-pipeline-api.md), LOCK-MECH (33-time-lock-approval-mechanism.md), CORE-02 (25-sqlite-schema.md), API-SPEC (37-rest-api-complete-spec.md), ENUM-MAP (45-enum-unified-mapping.md), 23-RESEARCH.md
**요구사항:** BATCH-01 (BatchRequest/InstructionRequest), BATCH-02 (배치 정책 합산 평가), BATCH-03 (테스트 시나리오)

---

## 1. 개요

### 1.1 목적

이 문서는 WAIaaS 트랜잭션 파이프라인에 **배치 트랜잭션(BATCH)** 기능을 추가하는 정식 설계 스펙이다. Solana는 단일 트랜잭션 내에 다수 instruction을 원자적으로 포함하는 것을 네이티브로 지원하며, ATA 생성 + approve + transfer 같은 복합 작업을 원자적으로 실행하려면 배치가 필수이다. 정책 우회를 방지하기 위해 합산 평가가 필요하며, EVM에서의 배치 요청은 명시적으로 미지원하여 에러를 반환한다.

### 1.2 요구사항 매핑

| 요구사항 | 커버리지 | 섹션 |
|---------|---------|------|
| BATCH-01 | BatchRequest + InstructionRequest 인터페이스 | 섹션 2 |
| BATCH-02 | 배치 정책 합산 평가 (개별 + 합산 2단계) | 섹션 5 |
| BATCH-03 | 테스트 시나리오 (정상/정책거부/에러/보안) | 섹션 7 |

### 1.3 핵심 설계 원칙

> **[v0.8] sweepAll 교차 참조:** v0.8에서 추가된 `sweepAll()`(27-chain-adapter-interface.md §6.11)의 SPL 토큰 배치 전송은 `buildBatch()`로 단일 트랜잭션에 포함하되, 실패 시 개별 fallback한다. sweepAll 배치는 정책 엔진을 우회하므로 본 문서 섹션 5의 2단계 정책 평가(개별+합산)는 적용되지 않는다 (objectives/v0.8 §5.4 참조).

| # | 원칙 | 설명 | 적용 |
|---|------|------|------|
| 1 | **Solana 원자적 배치 네이티브 지원** | Solana는 단일 트랜잭션에 다수 instruction을 원자적으로 포함. 하나라도 실패하면 전체 롤백 | 섹션 4 |
| 2 | **EVM 배치 명시적 미지원** | EOA 기반 EVM은 1 tx = 1 call 원칙. BATCH_NOT_SUPPORTED 에러 반환 | 섹션 3 |
| 3 | **합산 정책 평가** | 배치 내 모든 instruction의 금액을 합산하여 SPENDING_LIMIT 티어 결정. 소액 분할 우회 차단 | 섹션 5 |
| 4 | **All-or-Nothing 위반 처리** | 배치 내 하나라도 정책 위반이면 전체 배치 거부. 부분 실행 없음 | 섹션 5 |

### 1.4 CHAIN-EXT-03 크로스커팅 참조

이 문서는 CHAIN-EXT-03(58-contract-call-spec.md)에서 예비 정의한 BATCH 확장 포인트를 상세화한다.

| CHAIN-EXT-03 확장 포인트 | 이 문서에서의 상세화 |
|------------------------|-------------------|
| Stage 1 BATCH variant (섹션 6.1.1) | BatchRequestSchema 상세 Zod 스키마 (섹션 2.4) |
| Stage 3 batchTotalAmount / batchInstructions (섹션 6.3.1) | 2단계 정책 평가 알고리즘 (섹션 5) |
| Stage 5 buildBatch 분기 (섹션 6.5) | Solana 원자적 배치 빌드 로직 (섹션 4) |
| DB type='BATCH' (섹션 7.1) | 감사 로그 전략 (섹션 6) |
| 에러 코드 BATCH_NOT_SUPPORTED / BATCH_SIZE_EXCEEDED / BATCH_POLICY_VIOLATION (섹션 8) | EVM 미지원 분기 (섹션 3) + 정책 위반 상세 (섹션 5) |

---

## 2. BatchRequest + InstructionRequest 인터페이스

### 2.1 TypeScript 인터페이스

```typescript
// packages/core/src/interfaces/chain-adapter.types.ts (Phase 23 확장)

/**
 * 배치 트랜잭션 요청.
 * Solana에서 다수의 instruction을 단일 트랜잭션으로 원자적 실행한다.
 * EVM에서는 미지원 (BATCH_NOT_SUPPORTED 에러).
 */
interface BatchRequest {
  /** 에이전트 주소 (트랜잭션 fee payer) */
  from: string

  /** 체인 (현재 'solana'만 지원) */
  chain: ChainType

  /** 개별 instruction 목록 (최소 2개, 최대 20개) */
  instructions: InstructionRequest[]
}

/**
 * 배치 내 개별 instruction 요청.
 * Discriminated union으로 type별 필수 필드가 다르다.
 *
 * 지원하는 4가지 type:
 * - TRANSFER: 네이티브 토큰 전송 (SOL)
 * - TOKEN_TRANSFER: SPL 토큰 전송
 * - CONTRACT_CALL: 임의 프로그램 호출
 * - APPROVE: SPL 토큰 approve/delegate
 *
 * BATCH 중첩 불가: InstructionRequest.type에 'BATCH'는 포함되지 않는다.
 */
type InstructionRequest =
  | TransferInstruction
  | TokenTransferInstruction
  | ContractCallInstruction
  | ApproveInstruction
```

### 2.2 개별 Instruction 타입 정의

```typescript
/**
 * TRANSFER instruction: 네이티브 토큰(SOL) 전송.
 * System Program transfer instruction으로 변환된다.
 */
interface TransferInstruction {
  type: 'TRANSFER'

  /** 수신자 주소 (Base58) */
  to: string

  /** 전송 금액 (lamports 단위, bigint) */
  amount: bigint

  /** 선택적 메모 (Memo Program instruction으로 추가) */
  memo?: string
}

/**
 * TOKEN_TRANSFER instruction: SPL 토큰 전송.
 * TransferChecked instruction으로 변환된다 (CHAIN-EXT-01 로직 재사용).
 */
interface TokenTransferInstruction {
  type: 'TOKEN_TRANSFER'

  /** 수신자 주소 (Base58, 지갑 주소 -- ATA는 자동 계산) */
  to: string

  /** 전송 금액 (토큰 최소 단위, bigint) */
  amount: bigint

  /** 토큰 정보 */
  token: TokenInfo
}

/**
 * CONTRACT_CALL instruction: 임의 프로그램 호출.
 * Solana instruction으로 직접 변환된다 (CHAIN-EXT-03 로직 재사용).
 */
interface ContractCallInstruction {
  type: 'CONTRACT_CALL'

  /** 프로그램 주소 (Base58) */
  programId: string

  /** Base64 인코딩된 instruction data */
  instructionData: string

  /** 계정 메타 목록 */
  accounts: AccountMetaInput[]

  /** 네이티브 토큰 첨부량 (선택적, 기본 0n) */
  value?: bigint
}

/**
 * APPROVE instruction: SPL 토큰 approve/delegate.
 * ApproveChecked instruction으로 변환된다 (23-02 스펙 참조).
 */
interface ApproveInstruction {
  type: 'APPROVE'

  /** 위임 대상(delegate) 주소 (Base58) */
  spender: string

  /** 토큰 정보 */
  token: TokenInfo

  /** 승인 금액 (토큰 최소 단위, bigint) */
  amount: bigint
}
```

### 2.3 Discriminated Union 설계 근거

InstructionRequest를 discriminated union으로 설계한 이유:

| 근거 | 설명 |
|------|------|
| **type별 필수 필드 차이** | TRANSFER는 `to + amount`, CONTRACT_CALL은 `programId + instructionData + accounts`. 단일 인터페이스로 표현하면 모든 필드가 optional이 되어 타입 안전성 상실 |
| **Zod discriminatedUnion 매핑** | REST API에서 `z.discriminatedUnion('type', [...])` 스키마로 직접 변환 가능 |
| **정책 평가 분기** | 배치 내 각 instruction의 type에 따라 적용할 정책이 다름 (TRANSFER -> WHITELIST, CONTRACT_CALL -> CONTRACT_WHITELIST 등) |
| **Phase 22-23 패턴 일관성** | CHAIN-EXT-03에서 확립한 5-type discriminatedUnion 패턴의 배치 내 재사용 |

### 2.4 BatchRequest 제약 조건

```typescript
// packages/core/src/schemas/batch.schema.ts

import { z } from 'zod'

/**
 * TokenInfo 스키마 (CHAIN-EXT-01에서 정의, 재사용).
 */
const TokenInfoSchema = z.object({
  address: z.string().min(1, '토큰 주소는 필수'),
  decimals: z.number().int().nonneg(),
  symbol: z.string().optional(),
})

/**
 * InstructionRequest Zod 스키마.
 * discriminatedUnion으로 4가지 type을 검증한다.
 */
export const InstructionRequestSchema = z.discriminatedUnion('type', [
  // TRANSFER instruction
  z.object({
    type: z.literal('TRANSFER'),
    to: z.string().min(1, '수신자 주소는 필수'),
    amount: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
    memo: z.string().max(256).optional(),
  }),

  // TOKEN_TRANSFER instruction
  z.object({
    type: z.literal('TOKEN_TRANSFER'),
    to: z.string().min(1, '수신자 주소는 필수'),
    amount: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
    token: TokenInfoSchema,
  }),

  // CONTRACT_CALL instruction
  z.object({
    type: z.literal('CONTRACT_CALL'),
    programId: z.string().min(1, '프로그램 주소는 필수'),
    instructionData: z.string().min(1, 'instruction data는 필수'),
    accounts: z.array(z.object({
      address: z.string().min(1),
      isSigner: z.boolean().default(false),
      isWritable: z.boolean().default(false),
    })).min(1, '최소 1개 계정 필요'),
    value: z.string().regex(/^\d+$/).optional().default('0'),
  }),

  // APPROVE instruction
  z.object({
    type: z.literal('APPROVE'),
    spender: z.string().min(1, 'spender 주소는 필수'),
    token: TokenInfoSchema,
    amount: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),
  }),
])

/**
 * BatchRequest Zod 스키마.
 * chain은 'solana'만 허용 (EVM BATCH 미지원).
 * instructions: 최소 2개(1개는 배치가 아님), 최대 20개(Solana TX 크기 실질 한계).
 */
export const BatchRequestSchema = z.object({
  type: z.literal('BATCH'),
  instructions: z.array(InstructionRequestSchema)
    .min(2, '배치는 최소 2개 instruction이 필요합니다. 1개면 단일 요청으로 처리하세요.')
    .max(20, '배치는 최대 20개 instruction까지 허용됩니다.'),
}).refine(
  // BATCH 중첩 방지는 InstructionRequestSchema에서 'BATCH' type을 미포함하여 구조적으로 보장
  // 추가 검증: 동일 type만으로 구성된 배치도 허용 (복수 전송 등 유효한 사용 사례)
  () => true,
  { message: 'BatchRequest 검증 실패' }
)
```

### 2.5 제약 조건 상세

| 제약 | 값 | 근거 |
|------|------|------|
| **최소 instruction 수** | 2 | 1개는 배치가 아닌 단일 요청. 배치의 의미 없음 |
| **최대 instruction 수** | 20 | Solana 트랜잭션 크기 1232 bytes 한계. 단순 transfer instruction이 ~100 bytes이므로 실질 한계 약 10-12개이나, 작은 instruction 고려하여 20개로 상한 설정. 크기 초과는 빌드 시 별도 검증 |
| **chain 제한** | 'solana' only | EVM EOA는 1 tx = 1 call. 네이티브 배치 불가 |
| **BATCH 중첩 불가** | InstructionRequest에 'BATCH' 미포함 | 재귀적 배치는 트랜잭션 크기 예측 불가 + 정책 평가 복잡성 폭발 |
| **instruction type 혼합 허용** | 4가지 type 자유 조합 | ATA 생성 + approve + transfer 같은 복합 작업이 배치의 핵심 사용 사례 |

### 2.6 CHAIN-EXT-03 BatchVariant 교체

CHAIN-EXT-03 섹션 6.1.1에서 예비 정의한 BATCH variant:

```typescript
// CHAIN-EXT-03 예비 정의 (이 문서에서 교체)
z.object({
  type: z.literal('BATCH'),
  instructions: z.array(z.object({
    type: z.enum(['TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE']),
  }).passthrough()).min(2).max(20),
})
```

이 문서에서 위의 `.passthrough()` 기반 느슨한 스키마를 **섹션 2.4의 `BatchRequestSchema`로 교체**한다. `InstructionRequestSchema`의 `z.discriminatedUnion`이 각 type별 필수 필드를 정밀하게 검증하므로, `.passthrough()`가 허용하던 잘못된 필드 조합이 차단된다.

---

## 3. EVM 미지원 분기

### 3.1 EVM 배치 거부

EVM(Ethereum, Polygon, Arbitrum 등)에서 BATCH 타입 요청 시 **즉시 거부**한다.

```typescript
/**
 * EVM 배치 거부 검증.
 * Stage 1 (RECEIVE)에서 chain 검증 후 즉시 에러 반환.
 *
 * 검증 시점: TransactionSendRequestSchema 파싱 성공 후,
 *           에이전트의 chain 정보를 조회한 직후.
 */
function validateBatchChain(request: BatchRequest, agentChain: ChainType): void {
  if (agentChain !== 'solana') {
    throw new ChainError('BATCH_NOT_SUPPORTED', {
      code: 'BATCH_NOT_SUPPORTED',
      httpStatus: 400,
      message: 'Batch transactions are only supported on Solana. '
        + 'EVM chains execute one call per transaction.',
      chain: agentChain,
      suggestion: 'EVM에서 복수 작업이 필요하면 개별 트랜잭션으로 분리하여 순차 실행하세요.',
    })
  }
}
```

### 3.2 에러 응답 상세

```json
{
  "error": {
    "code": "BATCH_NOT_SUPPORTED",
    "message": "Batch transactions are only supported on Solana. EVM chains execute one call per transaction.",
    "details": {
      "chain": "ethereum",
      "suggestion": "EVM에서 복수 작업이 필요하면 개별 트랜잭션으로 분리하여 순차 실행하세요."
    }
  }
}
```

| 항목 | 값 |
|------|------|
| HTTP 상태 | 400 Bad Request |
| 에러 코드 | `BATCH_NOT_SUPPORTED` |
| 검증 시점 | Stage 1 (RECEIVE), chain 확인 직후 |
| 영향 범위 | 모든 EVM 체인 (ethereum, polygon, arbitrum) |

### 3.3 향후 확장 포인트

EVM 배치가 필요해지는 시점을 위해 확장 포인트를 기록한다.

| 방식 | 설명 | 전제 조건 | 별도 마일스톤 |
|------|------|----------|-------------|
| **Multicall3** | 외부 컨트랙트(0xcA11bde05977b3631167028862bE2a173976CA11)를 통한 다중 호출 래핑 | EOA가 직접 Multicall3를 호출. 단, Multicall3는 msg.sender가 Multicall3 컨트랙트가 되므로 approve 등에서 권한 문제 발생. ERC-4337 없이 실용적이지 않음 | 필요 |
| **ERC-4337 (Account Abstraction)** | Smart Account로 전환하면 UserOperation에 다수 호출을 번들링 가능 | WAIaaS 에이전트를 EOA에서 Smart Account로 전환하는 대규모 아키텍처 변경 필요 | 필요 |
| **EIP-7702** | EOA에 임시 코드를 위임하여 배치 실행 (Pectra 하드포크) | 네트워크 업그레이드 의존. 아직 메인넷 배포 전 | 필요 |

**v0.6 결정:** 위 방식 모두 외부 의존이나 대규모 아키텍처 변경을 수반하므로, v0.6에서는 **EVM BATCH를 미지원**하고 명확한 에러를 반환한다. 확장 포인트만 기록하고 구현하지 않는다.

---

## 4. Solana 원자적 배치 빌드 로직

### 4.1 개요

Solana는 단일 트랜잭션 내에 여러 instruction을 포함하는 원자적 배치를 네이티브로 지원한다. Solana 런타임이 원자성을 보장하므로, 하나의 instruction이라도 실패하면 **전체 트랜잭션이 롤백**된다.

```
BatchRequest
  └── instructions[]: InstructionRequest[]
        │
        ▼  (각 InstructionRequest를 Solana Instruction으로 변환)
  [SolanaInstruction, SolanaInstruction, ...]
        │
        ▼  (pipe 패턴으로 트랜잭션 조립)
  TransactionMessage
        │
        ▼  (크기 검증 → 시뮬레이션 → 서명 → 제출)
  SubmitResult (txHash)
```

### 4.2 @solana/kit pipe 패턴 빌드

```typescript
// packages/core/src/adapters/solana/solana-adapter.ts (Phase 23 확장)
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  getBase64EncodedWireTransaction,
} from '@solana/kit'

/**
 * IChainAdapter.buildBatch() 구현.
 *
 * 1. 빈 트랜잭션 메시지 생성 (version 0)
 * 2. fee payer 설정 (= from, 에이전트 주소)
 * 3. blockhash 설정 (최신 blockhash 조회)
 * 4. 각 InstructionRequest를 Solana Instruction으로 변환하여 순차 추가
 * 5. compute unit 최적화 instruction 자동 추가
 * 6. 트랜잭션 크기 사전 검증
 */
async function buildBatch(request: BatchRequest): Promise<UnsignedTransaction> {
  // 1-3. 기본 트랜잭션 메시지 구성
  const { blockhash, lastValidBlockHeight } = await rpc
    .getLatestBlockhash()
    .send()

  let transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(address(request.from), tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash, lastValidBlockHeight },
      tx,
    ),
  )

  // 4. 각 InstructionRequest를 Solana Instruction으로 변환하여 추가
  const solanaInstructions = await convertInstructionsToSolana(
    request.instructions,
    request.from,
  )

  for (const instruction of solanaInstructions) {
    transactionMessage = appendTransactionMessageInstruction(
      instruction,
      transactionMessage,
    )
  }

  // 5. compute unit 최적화 (섹션 4.5 참조)
  transactionMessage = await addComputeBudget(
    transactionMessage,
    solanaInstructions.length,
  )

  // 6. 트랜잭션 크기 사전 검증 (섹션 4.6 참조)
  validateTransactionSize(transactionMessage)

  return { transactionMessage, type: 'BATCH' }
}
```

### 4.3 InstructionRequest -> Solana Instruction 변환

각 InstructionRequest type별로 Solana Instruction으로 변환하는 로직이다. Phase 22-23에서 설계한 기존 어댑터 로직을 **재사용**한다.

```typescript
/**
 * InstructionRequest 배열을 Solana Instruction 배열로 변환.
 *
 * ATA 자동 생성: TOKEN_TRANSFER / APPROVE에서 수신자/spender의 ATA가
 * 온체인에 존재하지 않으면 createAssociatedTokenAccountInstruction을
 * 해당 instruction 앞에 자동 삽입한다.
 *
 * @param instructions - InstructionRequest 배열
 * @param from - 에이전트 주소 (fee payer)
 * @returns Solana Instruction 배열 (ATA 생성 instruction 포함 가능)
 */
async function convertInstructionsToSolana(
  instructions: InstructionRequest[],
  from: string,
): Promise<SolanaInstruction[]> {
  const solanaInstructions: SolanaInstruction[] = []

  for (const instr of instructions) {
    switch (instr.type) {
      case 'TRANSFER':
        solanaInstructions.push(
          buildSystemTransferInstruction(from, instr.to, BigInt(instr.amount))
        )
        if (instr.memo) {
          solanaInstructions.push(
            buildMemoInstruction(instr.memo)
          )
        }
        break

      case 'TOKEN_TRANSFER':
        // ATA 자동 생성 (수신자 ATA 미존재 시)
        const recipientAta = await findAssociatedTokenPda(instr.to, instr.token.address)
        const recipientAtaExists = await checkAccountExists(recipientAta)
        if (!recipientAtaExists) {
          solanaInstructions.push(
            buildCreateAtaInstruction(from, instr.to, instr.token.address)
          )
        }
        // TransferChecked instruction (CHAIN-EXT-01 로직 재사용)
        solanaInstructions.push(
          buildTransferCheckedInstruction(
            from,
            instr.to,
            instr.token.address,
            BigInt(instr.amount),
            instr.token.decimals,
          )
        )
        break

      case 'CONTRACT_CALL':
        // 임의 프로그램 호출 instruction (CHAIN-EXT-03 로직 재사용)
        solanaInstructions.push(
          buildProgramInstruction(
            instr.programId,
            instr.accounts,
            Buffer.from(instr.instructionData, 'base64'),
          )
        )
        break

      case 'APPROVE':
        // ATA 확인 (delegate 대상 ATA)
        const ownerAta = await findAssociatedTokenPda(from, instr.token.address)
        const ownerAtaExists = await checkAccountExists(ownerAta)
        if (!ownerAtaExists) {
          // 소유자 ATA가 없으면 approve 불가 (토큰 보유 전제)
          throw new ChainError('ATA_NOT_FOUND', {
            message: `에이전트의 ATA가 존재하지 않습니다. 토큰을 보유하고 있는지 확인하세요.`,
            token: instr.token.address,
          })
        }
        // ApproveChecked instruction (23-02 스펙 참조)
        solanaInstructions.push(
          buildApproveCheckedInstruction(
            from,
            instr.spender,
            instr.token.address,
            BigInt(instr.amount),
            instr.token.decimals,
          )
        )
        break
    }
  }

  return solanaInstructions
}
```

### 4.4 개별 변환 함수 pseudo-code

#### 4.4.1 TRANSFER: System Program Transfer

```typescript
/**
 * System Program transfer instruction.
 * SOL 네이티브 전송.
 */
function buildSystemTransferInstruction(
  from: string,
  to: string,
  amount: bigint,
): SolanaInstruction {
  return getTransferSolInstruction({
    source: address(from),
    destination: address(to),
    amount,
  })
}
```

#### 4.4.2 TOKEN_TRANSFER: SPL TransferChecked

```typescript
/**
 * SPL TransferChecked instruction.
 * CHAIN-EXT-01에서 설계한 getTransferCheckedInstruction() 재사용.
 * decimals를 온체인에서 검증하여 금액 오류를 사전 방지.
 */
function buildTransferCheckedInstruction(
  from: string,
  to: string,
  mint: string,
  amount: bigint,
  decimals: number,
): SolanaInstruction {
  const sourceAta = findAssociatedTokenPda(from, mint)
  const destinationAta = findAssociatedTokenPda(to, mint)

  return getTransferCheckedInstruction({
    source: sourceAta,
    mint: address(mint),
    destination: destinationAta,
    authority: address(from),
    amount,
    decimals,
  })
}
```

#### 4.4.3 CONTRACT_CALL: 임의 프로그램 Instruction

```typescript
/**
 * 임의 프로그램 호출 instruction.
 * CHAIN-EXT-03에서 설계한 Solana instruction 구성 로직 재사용.
 * AccountMetaInput의 isSigner/isWritable를 AccountRole로 변환.
 */
function buildProgramInstruction(
  programId: string,
  accounts: AccountMetaInput[],
  data: Uint8Array,
): SolanaInstruction {
  return {
    programAddress: address(programId),
    accounts: accounts.map((acc) => ({
      address: address(acc.address),
      role: resolveAccountRole(acc.isSigner, acc.isWritable),
    })),
    data,
  }
}

/**
 * isSigner + isWritable 조합 -> AccountRole 변환.
 */
function resolveAccountRole(isSigner: boolean, isWritable: boolean): AccountRole {
  if (isSigner && isWritable) return AccountRole.WRITABLE_SIGNER
  if (isSigner) return AccountRole.READONLY_SIGNER
  if (isWritable) return AccountRole.WRITABLE
  return AccountRole.READONLY
}
```

#### 4.4.4 APPROVE: SPL ApproveChecked

```typescript
/**
 * SPL ApproveChecked instruction.
 * 23-02 스펙에서 설계한 getApproveCheckedInstruction() 재사용.
 * decimals를 온체인에서 검증하여 승인 금액 오류를 방지.
 *
 * Solana SPL은 토큰 계정당 1개의 delegate만 허용한다.
 * 새 approve는 기존 delegate를 덮어쓴다.
 */
function buildApproveCheckedInstruction(
  owner: string,
  delegate: string,
  mint: string,
  amount: bigint,
  decimals: number,
): SolanaInstruction {
  const ownerAta = findAssociatedTokenPda(owner, mint)

  return getApproveCheckedInstruction({
    account: ownerAta,
    mint: address(mint),
    delegate: address(delegate),
    owner: address(owner),
    amount,
    decimals,
  })
}
```

### 4.5 ATA 자동 생성 정책

TOKEN_TRANSFER와 APPROVE에서 수신자/대상의 ATA(Associated Token Account)가 온체인에 존재하지 않을 수 있다. 배치 빌드 시 **ATA 생성 instruction을 자동으로 삽입**한다.

```typescript
/**
 * ATA 생성 instruction.
 * createAssociatedTokenAccountInstruction을 해당 instruction 앞에 삽입.
 * fee payer = from (에이전트), rent 비용 부담.
 */
function buildCreateAtaInstruction(
  payer: string,
  owner: string,
  mint: string,
): SolanaInstruction {
  return getCreateAssociatedTokenAccountInstruction({
    payer: address(payer),
    ata: findAssociatedTokenPda(owner, mint),
    owner: address(owner),
    mint: address(mint),
  })
}
```

| 상황 | 처리 |
|------|------|
| TOKEN_TRANSFER에서 수신자 ATA 미존재 | createATA instruction을 transferChecked 앞에 자동 삽입 |
| APPROVE에서 소유자 ATA 미존재 | 에러 (토큰 미보유 상태에서 approve 불가) |
| 동일 배치 내 중복 ATA 생성 | 첫 번째 TOKEN_TRANSFER에서 생성하면, 이후 instruction에서는 이미 생성된 것으로 간주 (온체인 순차 실행) |

> **주의:** ATA 자동 생성은 instruction 수를 증가시킨다. 20개 instruction 제한에 ATA 생성 instruction도 포함된다. 예를 들어, 10개의 TOKEN_TRANSFER가 모두 새 ATA를 필요로 하면 실제 instruction은 20개(10 ATA + 10 transfer)가 된다.

### 4.6 트랜잭션 크기 사전 검증

Solana 트랜잭션의 최대 크기는 **1232 bytes**이다. 이 제한은 instruction data, account metas, signatures를 모두 포함한 직렬화된 트랜잭션 전체에 적용된다.

```typescript
/**
 * 트랜잭션 크기 사전 검증.
 *
 * 검증 시점: 모든 instruction을 추가하고 compute budget을 설정한 후,
 *           서명 전에 직렬화 크기를 확인한다.
 *
 * 방법: compileTransaction()으로 직렬화 -> 크기 확인
 *
 * @throws BATCH_SIZE_EXCEEDED 1232 bytes 초과 시
 */
function validateTransactionSize(
  transactionMessage: TransactionMessage,
): void {
  // compileTransaction()은 서명 없이 트랜잭션 메시지를 직렬화
  const compiled = compileTransaction(transactionMessage)
  const serialized = getBase64EncodedWireTransaction(compiled)
  const sizeBytes = Buffer.from(serialized, 'base64').length

  // 서명 크기 추가 계산 (에이전트 1개 서명 = 64 bytes)
  // + 서명 수 배열 (1 byte) = 총 65 bytes
  const estimatedTotalSize = sizeBytes + 65

  if (estimatedTotalSize > 1232) {
    throw new ChainError('BATCH_SIZE_EXCEEDED', {
      code: 'BATCH_SIZE_EXCEEDED',
      httpStatus: 400,
      message: `배치 트랜잭션 크기(${estimatedTotalSize} bytes)가 Solana 한도(1232 bytes)를 초과합니다.`,
      currentSize: estimatedTotalSize,
      maxSize: 1232,
      instructionCount: transactionMessage.instructions.length,
      suggestion: 'instruction 수를 줄이거나, 복수 배치로 분할하세요.',
    })
  }
}
```

| 검증 항목 | 값 | 설명 |
|----------|------|------|
| 최대 트랜잭션 크기 | 1232 bytes | Solana 네트워크 프로토콜 제한 |
| 서명 오버헤드 | ~65 bytes | 에이전트 1개 서명(64B) + 서명 수 배열(1B) |
| 검증 시점 | Stage 5 빌드 직전 | compileTransaction() 후, signTransaction() 전 |
| 에러 코드 | `BATCH_SIZE_EXCEEDED` | HTTP 400 |

### 4.7 Compute Unit 최적화

배치 트랜잭션은 여러 instruction을 포함하므로, 기본 compute unit(200K CU) 한도가 부족할 수 있다. 시뮬레이션을 통해 실제 소비 CU를 측정하고 최적화한다.

```typescript
/**
 * compute unit 최적화 instruction 자동 추가.
 *
 * 1. 트랜잭션 시뮬레이션으로 실제 CU 소비량 측정
 * 2. 측정값 * 1.2 (20% 안전 마진)를 setComputeUnitLimit으로 설정
 * 3. priority fee 설정 (선택적, 네트워크 혼잡도 기반)
 *
 * setComputeUnitLimit instruction은 트랜잭션 첫 번째에 삽입.
 */
async function addComputeBudget(
  transactionMessage: TransactionMessage,
  instructionCount: number,
): Promise<TransactionMessage> {
  // 시뮬레이션으로 CU 소비량 측정
  const simResult = await rpc.simulateTransaction(
    compileTransaction(transactionMessage),
    { commitment: 'confirmed' }
  ).send()

  const consumedUnits = simResult.value.unitsConsumed ?? 200_000
  // 20% 안전 마진
  const computeUnitLimit = Math.ceil(consumedUnits * 1.2)

  // setComputeUnitLimit instruction 삽입
  const computeBudgetInstruction = getSetComputeUnitLimitInstruction({
    units: computeUnitLimit,
  })

  // 트랜잭션 앞에 삽입 (prepend)
  transactionMessage = prependTransactionMessageInstruction(
    computeBudgetInstruction,
    transactionMessage,
  )

  return transactionMessage
}
```

### 4.8 원자성 보장

Solana 런타임이 원자성을 보장한다:

| 항목 | 동작 |
|------|------|
| **모든 instruction 성공** | 트랜잭션 확정, 모든 상태 변경 적용 |
| **하나라도 실패** | 전체 트랜잭션 롤백, 어떤 상태 변경도 적용되지 않음 |
| **CU 한도 초과** | 전체 트랜잭션 롤백, fee만 소비 |

이 원자성은 배치 트랜잭션의 핵심 가치이다. 예를 들어 "ATA 생성 + 토큰 전송" 배치에서, 토큰 전송이 실패하면 ATA 생성도 롤백되어 불필요한 ATA가 생기지 않는다.

### 4.9 서명

배치 트랜잭션의 서명자는 **에이전트 1명**이다. 모든 instruction의 fee payer가 에이전트(`from`)이므로, 단일 서명으로 충분하다.

```typescript
// 서명: 에이전트 키로 단일 서명
const signedTx = await signTransaction(
  [agentKeyPair],
  compileTransaction(transactionMessage),
)
```

> **예외:** CONTRACT_CALL instruction의 accounts에 `isSigner: true`인 계정이 에이전트 외에 있으면 해당 키페어도 필요하다. 그러나 WAIaaS 에이전트가 보유한 키페어만으로 서명 가능한 instruction만 배치에 포함해야 한다. 추가 서명자가 필요한 instruction은 배치에 포함 불가이며, `INVALID_SIGNER` 에러를 반환한다.

---

## 5. 배치 정책 평가 규칙

### 5.1 2단계 평가 알고리즘 개요

배치 트랜잭션의 정책 평가는 **2단계(Phase A + Phase B)**로 수행한다.

```
BatchRequest
  │
  ▼
Phase A: 개별 instruction 정책 평가
  ├── instruction[0]: TRANSFER  → WHITELIST, TIME_RESTRICTION, RATE_LIMIT
  ├── instruction[1]: APPROVE   → ALLOWED_TOKENS, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT
  ├── instruction[2]: CONTRACT_CALL → CONTRACT_WHITELIST, METHOD_WHITELIST
  └── 하나라도 DENY? → 전체 배치 거부 (BATCH_POLICY_VIOLATION)
  │
  ▼ (Phase A 통과)
Phase B: 합산 금액 티어 결정
  ├── 모든 instruction 금액 합산 (네이티브 토큰 기준)
  ├── 합산 금액 → SPENDING_LIMIT → 4-티어 분류
  ├── APPROVE 포함 시 → APPROVE_TIER_OVERRIDE 추가 적용
  └── 최종 티어 = max(합산 금액 티어, APPROVE override 티어)
  │
  ▼
PolicyDecision { allowed: true, tier: 최종 티어 }
```

### 5.2 Phase A: 개별 instruction 정책 평가

배치 내 각 instruction을 **독립적으로** 정책 평가한다. CHAIN-EXT-03 섹션 6.3.3의 type별 정책 적용 매트릭스를 instruction 단위로 적용한다.

```typescript
/**
 * Phase A: 배치 내 개별 instruction 정책 평가.
 *
 * All-or-Nothing 원칙:
 * - 하나라도 DENY면 전체 배치 거부
 * - 거부 응답에 위반 instruction의 인덱스 + 위반 정책 상세 포함
 *
 * @param batchInstructions - 배치 내 instruction 목록
 * @param policies - 에이전트 활성 정책
 * @returns Phase A 결과 (전체 통과 또는 거부)
 */
async function evaluateBatchPhaseA(
  batchInstructions: BatchInstructionInput[],
  policies: Policy[],
): Promise<PhaseAResult> {
  const violations: InstructionViolation[] = []

  for (let i = 0; i < batchInstructions.length; i++) {
    const instr = batchInstructions[i]

    // 각 instruction type에 맞는 정책을 개별 평가
    // CHAIN-EXT-03 11단계 알고리즘의 type별 분기를 재사용
    const result = await evaluateInstructionPolicies(instr, policies)

    if (!result.allowed) {
      violations.push({
        index: i,
        type: instr.type,
        reason: result.reason,
        message: result.message,
        policyType: result.violatedPolicyType,
      })
    }
  }

  // All-or-Nothing: 위반이 1건이라도 있으면 전체 거부
  if (violations.length > 0) {
    return {
      allowed: false,
      reason: 'BATCH_POLICY_VIOLATION',
      message: `배치 내 ${violations.length}개 instruction이 정책을 위반했습니다.`,
      violations,
    }
  }

  return { allowed: true }
}
```

#### 5.2.1 instruction type별 적용 정책

| instruction type | 적용 정책 | 비적용 정책 |
|-----------------|----------|------------|
| TRANSFER | WHITELIST(to), TIME_RESTRICTION, RATE_LIMIT | CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, ALLOWED_TOKENS |
| TOKEN_TRANSFER | WHITELIST(to), TIME_RESTRICTION, RATE_LIMIT, ALLOWED_TOKENS | CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT |
| CONTRACT_CALL | TIME_RESTRICTION, RATE_LIMIT, CONTRACT_WHITELIST, METHOD_WHITELIST(EVM 전용, 배치는 Solana only이므로 미적용) | WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, ALLOWED_TOKENS |
| APPROVE | TIME_RESTRICTION, RATE_LIMIT, ALLOWED_TOKENS, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT | WHITELIST, CONTRACT_WHITELIST, METHOD_WHITELIST |

> **참고:** 배치는 Solana 전용이므로 METHOD_WHITELIST(EVM 전용)는 배치 내 CONTRACT_CALL에 적용되지 않는다. Solana CONTRACT_CALL은 CONTRACT_WHITELIST만으로 제어한다.

#### 5.2.2 개별 instruction 정책 평가 pseudo-code

```typescript
/**
 * 단일 instruction에 대한 정책 평가.
 * CHAIN-EXT-03 11단계 알고리즘에서 해당 type의 정책만 추출하여 평가.
 */
async function evaluateInstructionPolicies(
  instr: BatchInstructionInput,
  policies: Policy[],
): Promise<PolicyDecision> {
  // 공통 정책: TIME_RESTRICTION, RATE_LIMIT
  const timeResult = evaluateTimeRestriction(instr, policies)
  if (!timeResult.allowed) return timeResult

  // RATE_LIMIT은 배치 전체를 1건으로 계산 (Phase A에서는 skip)
  // -> Phase B에서 배치 단위로 1회 평가

  // type별 분기
  switch (instr.type) {
    case 'TRANSFER':
      return evaluateWhitelist(instr, policies)

    case 'TOKEN_TRANSFER': {
      const whitelistResult = evaluateWhitelist(instr, policies)
      if (!whitelistResult.allowed) return whitelistResult
      return evaluateAllowedTokens(instr, policies)
    }

    case 'CONTRACT_CALL': {
      // CONTRACT_WHITELIST 필수 (기본 거부)
      const contractResult = evaluateContractWhitelist(instr, policies)
      if (!contractResult.allowed) return contractResult
      // METHOD_WHITELIST는 배치(Solana only)에서 미적용
      return { allowed: true }
    }

    case 'APPROVE': {
      const tokenResult = evaluateAllowedTokens(instr, policies)
      if (!tokenResult.allowed) return tokenResult
      const spenderResult = evaluateApprovedSpenders(instr, policies)
      if (!spenderResult.allowed) return spenderResult
      return evaluateApproveAmountLimit(instr, policies)
    }
  }
}
```

### 5.3 Phase B: 합산 금액 티어 결정

Phase A를 통과한 후, 모든 instruction의 금액을 **합산**하여 SPENDING_LIMIT 티어를 결정한다.

#### 5.3.1 합산 금액 계산 규칙

```typescript
/**
 * 배치 내 모든 instruction의 네이티브 토큰 금액을 합산.
 *
 * type별 합산 규칙:
 * - TRANSFER: amount (네이티브 토큰, 직접 합산)
 * - TOKEN_TRANSFER: 0 (Phase 24 USD 통합 전, 토큰 금액 비교 불가)
 * - CONTRACT_CALL: value (네이티브 토큰 첨부량, 기본 0)
 * - APPROVE: 0 (approve는 직접 자금 이동이 아님)
 *
 * @returns 합산 네이티브 토큰 금액 (lamports 단위)
 */
function calculateBatchTotalAmount(
  instructions: InstructionRequest[],
): bigint {
  let total = 0n

  for (const instr of instructions) {
    switch (instr.type) {
      case 'TRANSFER':
        total += BigInt(instr.amount)
        break

      case 'TOKEN_TRANSFER':
        // Phase 24 USD 통합 전: 토큰 금액은 네이티브 토큰과 비교 불가
        // 0으로 간주하여 합산에서 제외
        // Phase 24에서 가격 오라클 통합 시 USD 기준 환산 금액으로 교체
        total += 0n
        break

      case 'CONTRACT_CALL':
        // value = 네이티브 토큰 첨부량 (기본 0)
        total += BigInt(instr.value ?? '0')
        break

      case 'APPROVE':
        // approve는 "권한 위임"이므로 직접 자금 이동 아님
        // 금액 합산에 포함하지 않음
        // APPROVE의 위험도는 APPROVE_TIER_OVERRIDE에서 별도 평가
        total += 0n
        break
    }
  }

  return total
}
```

#### 5.3.2 합산 금액 -> SPENDING_LIMIT 4-티어 분류

```typescript
/**
 * Phase B: 합산 금액으로 SPENDING_LIMIT 평가 -> 4-티어 분류.
 *
 * 기존 SPENDING_LIMIT 평가 로직(LOCK-MECH 섹션 5)을 재사용.
 * batchTotalAmount를 단일 트랜잭션의 amount처럼 취급.
 */
function evaluateBatchSpendingLimit(
  batchTotalAmount: bigint,
  policies: Policy[],
): TransactionTier {
  // SPENDING_LIMIT 정책 조회
  const spendingLimit = policies.find(p => p.type === 'SPENDING_LIMIT')
  if (!spendingLimit) {
    // SPENDING_LIMIT 미설정 시 기본 INSTANT
    return 'INSTANT'
  }

  const rule = SpendingLimitRuleSchema.parse(JSON.parse(spendingLimit.rule))

  // 4-티어 분류 (LOCK-MECH 기존 로직)
  if (batchTotalAmount < rule.instant_threshold) return 'INSTANT'
  if (batchTotalAmount < rule.notify_threshold) return 'NOTIFY'
  if (batchTotalAmount < rule.delay_threshold) return 'DELAY'
  return 'APPROVAL'
}
```

#### 5.3.3 APPROVE 포함 배치의 추가 티어 결정

```typescript
/**
 * 배치에 APPROVE instruction이 포함된 경우,
 * APPROVE_TIER_OVERRIDE도 추가로 적용한다.
 *
 * 최종 티어 = max(합산 금액 티어, APPROVE override 티어)
 *
 * 예:
 *   합산 금액 티어 = INSTANT (소액 전송만)
 *   APPROVE override 티어 = APPROVAL (기본값)
 *   → 최종 = APPROVAL (더 높은 쪽)
 */
function resolveBatchFinalTier(
  amountTier: TransactionTier,
  instructions: InstructionRequest[],
  policies: Policy[],
): TransactionTier {
  const hasApprove = instructions.some(i => i.type === 'APPROVE')

  if (!hasApprove) {
    return amountTier
  }

  // APPROVE_TIER_OVERRIDE 평가
  const approveOverride = policies.find(p => p.type === 'APPROVE_TIER_OVERRIDE')
  const approveTier = approveOverride
    ? ApproveTierOverrideRuleSchema.parse(JSON.parse(approveOverride.rule)).default_tier
    : 'APPROVAL'  // 미설정 시 기본 APPROVAL

  // 두 티어 중 높은 쪽 채택
  return maxTier(amountTier, approveTier)
}

/**
 * 티어 우선순위 비교.
 * INSTANT < NOTIFY < DELAY < APPROVAL
 */
const TIER_PRIORITY: Record<TransactionTier, number> = {
  INSTANT: 0,
  NOTIFY: 1,
  DELAY: 2,
  APPROVAL: 3,
}

function maxTier(a: TransactionTier, b: TransactionTier): TransactionTier {
  return TIER_PRIORITY[a] >= TIER_PRIORITY[b] ? a : b
}
```

### 5.4 정책 우회 방지

#### 5.4.1 소액 분할 우회 차단

공격 패턴: 0.5 SOL을 10번 전송하여 각각 INSTANT 티어를 받으려는 시도.

**방어:** Phase B 합산 평가로 차단. 0.5 SOL * 10 = 5 SOL이 합산 금액으로 평가되어, SPENDING_LIMIT 기준 상위 티어가 적용된다.

```
개별 평가 시: 0.5 SOL → INSTANT (각각)
합산 평가 시: 5.0 SOL → DELAY (합산)
→ 최종 티어: DELAY
```

#### 5.4.2 approve + transferFrom 콤보

공격 패턴: 배치 내에서 approve를 먼저 실행하고, 같은 배치에서 transferFrom으로 자금 탈취.

**방어 1:** WAIaaS 배치는 에이전트가 직접 구성하는 instruction만 포함. transferFrom은 제3자(spender)가 호출하는 것이므로 에이전트가 자기 자신에게 transferFrom을 호출하는 것은 무의미하다.

**방어 2:** 배치에 APPROVE instruction이 포함되면 APPROVE_TIER_OVERRIDE가 적용되어 최소 APPROVAL 티어(Owner 승인 필수)가 강제된다.

**방어 3:** APPROVED_SPENDERS 정책이 Phase A에서 spender를 검증한다. 화이트리스트에 없는 spender로의 approve는 거부된다.

#### 5.4.3 배치 내 중복 instruction 감지

배치 내 동일 수신자에 대한 중복 전송 등은 **정책 엔진의 범위가 아니다**. 이유:

- 복수 수신자에게 동시 전송(에어드롭 패턴)은 정당한 사용 사례
- 동일 프로그램에 대한 복수 호출도 정당한 사용 사례 (LP 추가 등)
- 중복 감지는 감사 로그에서 사후 추적으로 충분

### 5.5 정책 평가 입력 (CHAIN-EXT-03 PolicyEvaluationInput 확장)

```typescript
/**
 * BATCH 타입일 때 PolicyEvaluationInput 구성.
 * CHAIN-EXT-03 섹션 6.3.1에서 예비 정의한 필드를 상세화.
 *
 * Stage 1에서 BatchRequest를 파싱한 후,
 * Stage 3 정책 평가 전에 이 입력을 구성한다.
 */
function buildBatchPolicyInput(
  request: BatchRequest,
  agent: Agent,
): PolicyEvaluationInput {
  // 합산 금액 계산
  const batchTotalAmount = calculateBatchTotalAmount(request.instructions)

  // 개별 instruction 입력 구성
  const batchInstructions: BatchInstructionInput[] = request.instructions.map(
    (instr, index) => ({
      index,
      type: instr.type,
      amount: resolveInstructionAmount(instr),
      to: resolveInstructionTo(instr),
      contractAddress: instr.type === 'CONTRACT_CALL' ? instr.programId : undefined,
      // METHOD_WHITELIST: Solana 전용 배치이므로 methodSignature 미사용
      methodSignature: undefined,
      spender: instr.type === 'APPROVE' ? instr.spender : undefined,
      approveAmount: instr.type === 'APPROVE' ? BigInt(instr.amount) : undefined,
      tokenAddress: ('token' in instr && instr.token)
        ? instr.token.address : undefined,
    })
  )

  return {
    type: 'BATCH',
    amount: batchTotalAmount,
    to: '',  // BATCH는 단일 수신자 없음
    chain: agent.chain,
    batchTotalAmount,
    batchInstructions,
  }
}

/**
 * instruction type별 금액 추출.
 */
function resolveInstructionAmount(instr: InstructionRequest): bigint {
  switch (instr.type) {
    case 'TRANSFER': return BigInt(instr.amount)
    case 'TOKEN_TRANSFER': return 0n  // Phase 24 USD 통합 전
    case 'CONTRACT_CALL': return BigInt(instr.value ?? '0')
    case 'APPROVE': return 0n
  }
}

/**
 * instruction type별 수신자 주소 추출.
 */
function resolveInstructionTo(instr: InstructionRequest): string {
  switch (instr.type) {
    case 'TRANSFER': return instr.to
    case 'TOKEN_TRANSFER': return instr.to
    case 'CONTRACT_CALL': return instr.programId
    case 'APPROVE': return instr.spender
  }
}
```

### 5.6 All-or-Nothing 정책 위반 에러 응답

```typescript
/**
 * BATCH_POLICY_VIOLATION 에러 응답.
 * 어느 instruction(인덱스)이 어떤 정책에 위반했는지 상세 포함.
 */
interface BatchPolicyViolationError {
  code: 'BATCH_POLICY_VIOLATION'
  httpStatus: 403
  message: string
  violations: Array<{
    /** 위반 instruction 인덱스 (0-based) */
    index: number
    /** instruction type */
    type: Exclude<TransactionType, 'BATCH'>
    /** 위반 정책 타입 */
    policyType: PolicyType
    /** 위반 사유 코드 */
    reason: string
    /** 사람 가독 메시지 */
    message: string
  }>
}
```

에러 응답 예시:

```json
{
  "error": {
    "code": "BATCH_POLICY_VIOLATION",
    "message": "배치 내 2개 instruction이 정책을 위반했습니다.",
    "violations": [
      {
        "index": 0,
        "type": "TRANSFER",
        "policyType": "WHITELIST",
        "reason": "WHITELIST_VIOLATION",
        "message": "수신자 주소 5xYz...가 화이트리스트에 없습니다."
      },
      {
        "index": 2,
        "type": "CONTRACT_CALL",
        "policyType": "CONTRACT_WHITELIST",
        "reason": "CONTRACT_NOT_WHITELISTED",
        "message": "프로그램 주소 9aBc...가 컨트랙트 화이트리스트에 없습니다."
      }
    ]
  }
}
```

### 5.7 RATE_LIMIT 배치 처리

RATE_LIMIT 정책에서 배치는 **1건**으로 계산한다. 배치 내 instruction 수에 관계없이 단일 트랜잭션이므로 1건이다.

| 처리 | 설명 |
|------|------|
| 배치 = 1건 카운트 | RATE_LIMIT의 "거래 빈도" 카운터에 1 증가 |
| Phase A에서 RATE_LIMIT | 배치 전체 단위로 1회 평가 (개별 instruction별 반복 평가 안 함) |
| 이유 | 온체인에서 단일 트랜잭션이므로, 빈도 제한도 트랜잭션 단위 |

---

## 6. 부모-자식 2계층 저장 + 감사 로그 전략

### 6.1 부모-자식 2계층 저장 전략 [v0.10]

배치 트랜잭션은 transactions 테이블에 **부모-자식 2계층**으로 기록한다 [v0.10 변경: 기존 단일 레코드 -> 2계층].
- 부모 레코드: type='BATCH', 배치 전체를 대표하는 1건
- 자식 레코드: 개별 instruction별 N건, parent_id로 부모 참조, batch_index로 순서 보장

```typescript
// 부모 레코드 (배치 전체)
const parentRecord = {
  id: generateUUIDv7(),
  agentId: agent.id,
  sessionId: session.id,
  chain: 'solana',
  txHash: submitResult.txHash,  // Solana: 단일 TX 해시 (자식과 공유)
  type: 'BATCH',
  amount: batchTotalAmount.toString(),  // 합산 네이티브 금액
  toAddress: null,                       // 배치는 단일 수신자 없음
  status: 'CONFIRMED',                  // 또는 FAILED, PARTIAL_FAILURE
  tier: finalTier,
  parentId: null,                        // 부모 자신은 parent_id NULL
  batchIndex: null,                      // 부모 자신은 batch_index NULL
  // 감사 컬럼은 기존 §6.3 규칙 적용 (대표값 저장)
  contractAddress: findFirst(instructions, 'CONTRACT_CALL')?.programId ?? null,
  methodSignature: null,
  tokenAddress: findFirstToken(instructions)?.token?.address ?? null,
  spenderAddress: findFirst(instructions, 'APPROVE')?.spender ?? null,
  metadata: JSON.stringify({
    batch_size: instructions.length,
    total_native_amount: batchTotalAmount.toString(),
    ata_created: ataCreatedCount,
    compute_units_consumed: simResult.unitsConsumed,
  }),
  createdAt: new Date(),
}
```

```typescript
// 자식 레코드 (개별 instruction별 N건)
const childRecords = instructions.map((instr, index) => ({
  id: generateUUIDv7(),
  agentId: agent.id,
  sessionId: session.id,
  chain: 'solana',
  txHash: submitResult.txHash,  // Solana 원자적 배치: 부모와 동일 해시 공유
  type: instr.type,             // TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE
  amount: resolveInstructionAmount(instr),
  toAddress: 'to' in instr ? instr.to : null,
  status: 'CONFIRMED',          // Solana 원자적: 부모와 동일
  tier: finalTier,
  parentId: parentRecord.id,    // 부모 배치 참조
  batchIndex: index,            // 0-based 순서
  // 개별 감사 컬럼
  contractAddress: instr.type === 'CONTRACT_CALL' ? instr.programId : null,
  tokenAddress: ('token' in instr) ? instr.token.address : null,
  spenderAddress: instr.type === 'APPROVE' ? instr.spender : null,
  approvedAmount: instr.type === 'APPROVE' ? instr.amount.toString() : null,
  metadata: null,               // 자식은 개별 metadata 불필요 (부모에 요약)
  createdAt: new Date(),
}))
```

### 6.1.1 부모-자식 상태 전이 테이블

| 시나리오 | 부모 상태 | 자식 상태 | tx_hash |
|----------|----------|----------|---------|
| 전체 성공 (Solana 원자적) | CONFIRMED | 전체 CONFIRMED | 부모-자식 동일 해시 공유 |
| Solana 원자적 실패 | FAILED | 전체 FAILED (원자적 롤백) | 실패한 TX 해시 또는 NULL |
| EVM 순차 부분 실패 | **PARTIAL_FAILURE** | 성공분 CONFIRMED + 실패분 FAILED | 자식별 독립 해시 |

> **PARTIAL_FAILURE 적용 범위:** PARTIAL_FAILURE는 EVM 순차 배치 전용 상태이다. 현재 Solana-only 배치에서는 원자적 실행이므로 CONFIRMED 또는 FAILED만 발생한다. PARTIAL_FAILURE는 향후 EVM 배치 지원 시를 위한 예비 상태이며, v0.10에서 status CHECK에 미리 포함한다.

### 6.1.2 Solana vs EVM 자식 tx_hash 차이

- **Solana 원자적 배치:** 자식 레코드 전체가 부모와 동일한 tx_hash를 공유 (단일 트랜잭션)
- **EVM 순차 배치(향후):** 자식별 독립 tx_hash (개별 트랜잭션)

### 6.2 metadata JSON 구조 [v0.10 변경]

[v0.10 변경] 기존 metadata의 `batch_instructions` 배열을 제거하였다. 개별 instruction 상세는 자식 레코드로 정규화되었으므로, metadata에는 **요약 정보만** 유지한다.

```json
{
  "batch_size": 3,
  "total_native_amount": "1000000000",
  "ata_created": 1,
  "compute_units_consumed": 45000
}
```

> **v0.10 변경 근거:** 기존에는 metadata.batch_instructions에 개별 instruction 상세를 JSON으로 저장했으나, 부모-자식 2계층 구조 도입으로 자식 레코드가 정규화된 테이블 행으로 존재한다. 따라서 metadata에서 중복 저장할 필요가 없으며, 요약 통계만 유지한다.

### 6.3 감사 컬럼 채우기 규칙 [v0.10 보완]

배치는 다수 instruction을 포함하므로, CHAIN-EXT-03에서 추가한 감사 컬럼(contract_address, method_signature, token_address, spender_address)을 다음 규칙으로 채운다.

**부모 레코드에 대표값 저장** (기존 규칙 동일), **자식 레코드에 개별값 저장** [v0.10 추가].

| 감사 컬럼 | 부모 레코드 (대표값) | 자식 레코드 (개별값) |
|----------|------|-----------|
| `contract_address` | 첫 번째 CONTRACT_CALL의 programId | 해당 자식의 programId (CONTRACT_CALL인 경우) |
| `method_signature` | null (Solana 배치, selector 규약 없음) | null |
| `token_address` | 첫 번째 TOKEN_TRANSFER 또는 APPROVE의 token.address | 해당 자식의 token.address (TOKEN_TRANSFER/APPROVE인 경우) |
| `spender_address` | 첫 번째 APPROVE의 spender | 해당 자식의 spender (APPROVE인 경우) |

> **설계 근거:** 부모 레코드의 독립 컬럼은 인덱싱/쿼리 효율을 위해 "대표 값"을 저장하고, 전체 상세는 자식 레코드의 정규화된 컬럼에서 조회한다. "특정 컨트랙트가 포함된 배치 조회"는 부모 레코드의 독립 컬럼 인덱스로 빠르게 검색하고, "해당 배치의 모든 instruction 상세"는 자식 레코드 조회(`parent_id = :batchId`)로 조회한다. [v0.10 변경] 자식 레코드가 있으므로 metadata 내 batch_instructions로의 fallback 조회는 더 이상 필요 없다.

### 6.4 감사 쿼리 패턴 [v0.10 보완]

```sql
-- 배치의 자식 instruction 조회 (부모-자식 관계) [v0.10 추가]
SELECT * FROM transactions
WHERE parent_id = :batchId
ORDER BY batch_index ASC;

-- 특정 에이전트의 배치 부모만 조회 [v0.10 추가]
SELECT * FROM transactions
WHERE agent_id = :agentId AND type = 'BATCH' AND parent_id IS NULL
ORDER BY created_at DESC;

-- 특정 프로그램이 포함된 배치 조회 (부모 레코드 대표값 인덱스 활용)
SELECT * FROM transactions
WHERE type = 'BATCH'
  AND contract_address = '9aBcDeFg...'
  AND parent_id IS NULL
ORDER BY created_at DESC;

-- 자식 레코드에서 특정 instruction type 조회 [v0.10 변경: JSON -> 정규 컬럼]
SELECT * FROM transactions
WHERE parent_id IS NOT NULL
  AND type = 'APPROVE'
ORDER BY created_at DESC;

-- 배치 내 특정 spender가 포함된 자식 조회 [v0.10 변경: JSON -> 정규 컬럼]
SELECT * FROM transactions
WHERE parent_id IS NOT NULL
  AND spender_address = '9aBcDeFg...'
ORDER BY created_at DESC;
```

> **v0.10 쿼리 개선:** 기존에는 metadata JSON 내 batch_instructions를 `json_extract()` 또는 `LIKE`로 검색했으나, 자식 레코드 정규화로 인해 표준 SQL 컬럼 쿼리로 대체되었다. 인덱스 활용이 가능해져 성능이 개선된다.

---

## 7. 보안 위험 매트릭스 + 테스트 시나리오

### 7.1 BATCH 보안 위험 매트릭스

| # | 위험 | 심각도 | 완화 방안 | 검증 섹션 |
|---|------|--------|----------|----------|
| B-1 | **합산 금액 정책 우회:** 소액 instruction 다수를 배치로 묶어 합산 한도 우회 | HIGH | Phase B 합산 평가: 모든 instruction 금액을 합산하여 SPENDING_LIMIT 티어 결정 | 테스트 S-01 |
| B-2 | **트랜잭션 크기 초과:** instruction 과다로 1232 bytes 초과, 빌드 실패 | MEDIUM | 사전 크기 검증 (섹션 4.6): compileTransaction() 후 직렬화 크기 확인. BATCH_SIZE_EXCEEDED 에러 반환 | 테스트 E-03 |
| B-3 | **approve + transferFrom 콤보:** 배치 내에서 approve 후 즉시 spender 전환 | HIGH | APPROVE 포함 배치에 APPROVE_TIER_OVERRIDE 강제 적용 + APPROVED_SPENDERS 검증 (섹션 5.4.2) | 테스트 S-02 |
| B-4 | **부분 실패 오해:** 사용자가 일부 instruction만 성공했다고 오해 | LOW | 문서화로 명시: Solana 원자적 배치는 전체 성공 또는 전체 실패 (섹션 4.8). 에러 메시지에 원자성 명시 |

### 7.2 테스트 레벨 분류

| 레벨 | 범위 | Mock 경계 | 대상 |
|------|------|----------|------|
| **Level 1 (Unit)** | BatchRequest/InstructionRequest Zod 검증, 합산 금액 계산, 크기 검증 | 없음 (순수 함수) | 섹션 2, 5.3 |
| **Level 2 (Integration)** | 파이프라인 배치 흐름 (Mock Adapter), All-or-Nothing 정책 | `IChainAdapter.buildBatch` Mock, `DatabasePolicyEngine.evaluate` Mock | 섹션 5.2, 5.6 |
| **Level 3 (Chain Mock)** | Solana Validator 다중 instruction 실행, 부분 실패 원자성 확인 | Solana Test Validator (로컬) | 섹션 4 |
| **Level 4 (Security)** | 합산 금액 정책 우회, approve 콤보, 크기 초과, EVM 미지원 | `DatabasePolicyEngine` (실제 정책 + Mock DB) | 섹션 5.4, 7.1 |

### 7.3 Mock 경계 정의

| Mock 대상 | Mock 방식 | 사용 레벨 |
|----------|----------|----------|
| `IChainAdapter.buildBatch()` | 입력 검증 + 고정 UnsignedTransaction 반환 | Level 2 |
| `DatabasePolicyEngine.evaluate()` | 정책 규칙 주입 + 결정 반환 (ALLOW/DENY/TIER) | Level 2 |
| `Solana TX serializer` | 고정 크기 바이트 배열 반환 (크기 검증 테스트) | Level 1 |
| `rpc.getLatestBlockhash()` | 고정 blockhash 반환 | Level 2, 3 |
| `checkAccountExists()` | ATA 존재 여부 제어 (true/false) | Level 2 |

### 7.4 테스트 시나리오

#### 카테고리 1: 정상 (Normal) -- 3개

| ID | 시나리오 | 입력 | 기대 결과 | 레벨 |
|----|---------|------|----------|------|
| **N-01** | 2-instruction 배치: SOL 전송 2건 | `[{type:'TRANSFER', to:'A', amount:'1000'}, {type:'TRANSFER', to:'B', amount:'2000'}]` | 성공, type='BATCH', amount='3000', metadata에 2건 기록 | L2 |
| **N-02** | 3-instruction 복합 배치: transfer + approve + contractCall | `[{type:'TRANSFER',...}, {type:'APPROVE',...}, {type:'CONTRACT_CALL',...}]` | 성공, 3가지 type 혼합 실행, 합산 금액 = TRANSFER.amount + CONTRACT_CALL.value | L2, L3 |
| **N-03** | ATA 자동 생성 포함 배치: TOKEN_TRANSFER(새 수신자) | `[{type:'TOKEN_TRANSFER', to:'newAddr',...}, {type:'TRANSFER',...}]` | 성공, ATA 생성 instruction 자동 삽입, metadata.ata_created=1 | L2, L3 |

#### 카테고리 2: 정책 거부 (Policy Deny) -- 4개

| ID | 시나리오 | 입력 | 기대 결과 | 레벨 |
|----|---------|------|----------|------|
| **P-01** | 합산 금액 APPROVAL 티어 | `[{type:'TRANSFER', amount:'5000000000'}, {type:'TRANSFER', amount:'5000000000'}]` -- 합산 10 SOL | 합산 10 SOL -> APPROVAL 티어 (개별은 5 SOL씩 DELAY) | L2 |
| **P-02** | 개별 instruction 화이트리스트 위반 | `[{type:'TRANSFER', to:'unknownAddr',...}, {type:'TRANSFER', to:'whitelistedAddr',...}]` | BATCH_POLICY_VIOLATION, violations[0].policyType='WHITELIST' | L2, L4 |
| **P-03** | All-or-Nothing: 다수 위반 | `[{type:'CONTRACT_CALL', programId:'unknown',...}, {type:'APPROVE', spender:'unknown',...}]` | BATCH_POLICY_VIOLATION, violations.length=2, 전체 배치 거부 | L2, L4 |
| **P-04** | APPROVE 포함 배치 티어 상승 | `[{type:'TRANSFER', amount:'100'}, {type:'APPROVE',...}]` -- 합산 소액 | 합산 금액 INSTANT이지만 APPROVE 포함 -> 최종 APPROVAL 티어 | L2 |

#### 카테고리 3: 에러 (Error) -- 4개

| ID | 시나리오 | 입력 | 기대 결과 | 레벨 |
|----|---------|------|----------|------|
| **E-01** | EVM BATCH_NOT_SUPPORTED | agent.chain='ethereum', type='BATCH' | 400 BATCH_NOT_SUPPORTED, "Batch transactions are only supported on Solana" | L1, L2 |
| **E-02** | instruction 수 부족 (<2) | `instructions: [{type:'TRANSFER',...}]` -- 1개 | Zod 검증 실패: "배치는 최소 2개 instruction이 필요합니다" | L1 |
| **E-03** | instruction 수 초과 (>20) | `instructions: [{...}, ...]` -- 21개 | Zod 검증 실패: "배치는 최대 20개 instruction까지 허용됩니다" | L1 |
| **E-04** | 트랜잭션 크기 초과 (>1232 bytes) | 대형 accounts 배열을 가진 CONTRACT_CALL 10개 | 400 BATCH_SIZE_EXCEEDED, currentSize > 1232 | L2, L3 |

#### 카테고리 4: 보안 (Security) -- 3개

| ID | 시나리오 | 입력 | 기대 결과 | 레벨 |
|----|---------|------|----------|------|
| **S-01** | 소액 분할 우회 시도 | 0.01 SOL * 20 = 0.2 SOL 배치 (개별은 INSTANT, 합산은 한도에 따라 상위 티어) | 합산 0.2 SOL로 SPENDING_LIMIT 평가, 개별 INSTANT이 아닌 합산 티어 적용 | L4 |
| **S-02** | approve + 의심 패턴 | `[{type:'APPROVE', spender:'whitelisted', amount:'huge',...}, {type:'TRANSFER',...}]` | APPROVE_AMOUNT_LIMIT 위반 시 BATCH_POLICY_VIOLATION, amount 허용 범위 내면 APPROVAL 티어 강제 | L4 |
| **S-03** | CONTRACT_CALL 미인가 프로그램 배치 | `[{type:'TRANSFER',...}, {type:'CONTRACT_CALL', programId:'malicious',...}]` | BATCH_POLICY_VIOLATION, violations[1].policyType='CONTRACT_WHITELIST', reason='CONTRACT_NOT_WHITELISTED' | L4 |

### 7.5 테스트 시나리오 요약

| 카테고리 | 수량 | 핵심 검증 |
|---------|------|----------|
| 정상 (N) | 3 | 2-instruction, 복합 배치, ATA 자동 생성 |
| 정책 거부 (P) | 4 | 합산 티어, 화이트리스트, All-or-Nothing, APPROVE 티어 |
| 에러 (E) | 4 | EVM 미지원, instruction 수 초과/부족, 크기 초과 |
| 보안 (S) | 3 | 소액 분할, approve 콤보, 미인가 프로그램 |
| **합계** | **14** | |

---

## 8. 향후 확장 포인트

### 8.1 EVM 배치

| 방식 | 전제 | 별도 마일스톤 |
|------|------|-------------|
| **ERC-4337 Smart Account** | 에이전트를 EOA에서 Smart Account로 전환. UserOperation에 다수 호출 번들링 가능 | 필요 (아키텍처 대규모 변경) |
| **Multicall3** | 외부 컨트랙트 의존. EOA 직접 사용 시 msg.sender 문제 | ERC-4337과 조합 시 실용적 |
| **EIP-7702** | EOA에 임시 코드 위임 (Pectra 하드포크). 아직 메인넷 배포 전 | 네트워크 업그레이드 후 재검토 |

### 8.2 Solana Versioned Transactions + Address Lookup Table (ALT)

현재 설계는 V0 트랜잭션을 사용한다. Address Lookup Table(ALT)를 활용하면 accounts 배열을 압축하여 더 많은 instruction을 1232 bytes 내에 포함할 수 있다. 복잡한 DeFi 배치(accounts가 많은 경우)에서 유용하다.

| 항목 | 현재 | ALT 적용 시 |
|------|------|-----------|
| accounts 크기 | 각 32 bytes (full address) | 1-2 bytes (lookup index) |
| instruction 수 한계 | ~10-20 (accounts 크기 의존) | ~20-40 (accounts 압축) |
| 전제 | 없음 | ALT를 온체인에 미리 생성해야 함 |

### 8.3 배치 내 조건부 실행

현재는 배치 내 모든 instruction이 무조건 순차 실행된다. 선행 instruction의 결과에 따라 후행 instruction을 분기하는 "조건부 배치"는 현재 미지원이다. Solana 런타임이 instruction 간 조건 분기를 네이티브로 지원하지 않으므로, 이를 구현하려면 커스텀 프로그램(on-chain orchestrator)이 필요하다.

### 8.4 크로스체인 배치

Solana + EVM 혼합 배치는 현재 미지원이다. 동일 체인 내에서만 배치를 구성할 수 있다. 크로스체인 배치는 브릿지 프로토콜 통합이 필요하며, 원자성 보장이 근본적으로 어렵다.

### 8.5 Phase 24 USD 통합 시 변경

Phase 24에서 가격 오라클이 통합되면, Phase B 합산 금액 계산에서 토큰 금액도 USD 기준으로 환산하여 합산할 수 있다:

```typescript
// Phase 24 변경 예상
case 'TOKEN_TRANSFER':
  // 현재: 0n (토큰 금액 비교 불가)
  // Phase 24: USD 기준 환산
  total += await oracle.toNativeEquivalent(instr.token, instr.amount)
  break
```

이 변경은 `calculateBatchTotalAmount()` 함수만 수정하면 되며, 나머지 2단계 평가 알고리즘은 변경 없이 동작한다.

---

## 부록 A: CHAIN-EXT-03 교체 매핑

이 문서가 CHAIN-EXT-03(58-contract-call-spec.md)의 예비 정의를 대체하는 항목 목록.

| CHAIN-EXT-03 위치 | 예비 정의 | 이 문서에서의 교체 |
|-------------------|---------|-----------------|
| 섹션 6.1.1 BATCH variant | `.passthrough()` 기반 느슨한 스키마 | 섹션 2.4 BatchRequestSchema (정밀 Zod 스키마) |
| 섹션 6.3.1 batchTotalAmount | 예비 필드 정의만 | 섹션 5.3 calculateBatchTotalAmount() 상세 알고리즘 |
| 섹션 6.3.1 batchInstructions | BatchInstructionInput 예비 정의 | 섹션 5.5 buildBatchPolicyInput() 상세 구성 |
| 섹션 6.5 buildBatch 분기 | `adapter.buildBatch(request.batchRequest)` 호출만 | 섹션 4.2 buildBatch() 전체 구현 pseudo-code |
| 섹션 8 에러 코드 3종 | 코드 + 설명만 | 섹션 3.2, 5.6 에러 응답 상세 구조 |

---

## 부록 B: 전체 에러 코드 목록 (BATCH 관련)

| 에러 코드 | HTTP | 발생 시점 | 설명 |
|----------|------|----------|------|
| `BATCH_NOT_SUPPORTED` | 400 | Stage 1, chain 검증 | EVM 체인에서 BATCH 타입 요청 |
| `BATCH_SIZE_EXCEEDED` | 400 | Stage 5, 빌드 전 크기 검증 | 직렬화 크기 > 1232 bytes |
| `BATCH_POLICY_VIOLATION` | 403 | Stage 3, Phase A 정책 평가 | 배치 내 instruction 정책 위반 (All-or-Nothing) |
| `ATA_NOT_FOUND` | 400 | Stage 5, instruction 변환 | APPROVE에서 소유자 ATA 미존재 |
| `INVALID_SIGNER` | 400 | Stage 5, 서명 검증 | 에이전트 외 추가 서명자 필요한 instruction |

---

## 부록 C: 배치 파이프라인 전체 흐름 요약

```
클라이언트 → POST /v1/transactions/send { type: 'BATCH', instructions: [...] }

Stage 1 (RECEIVE)
  ├── TransactionSendRequestSchema.parse() -- discriminatedUnion 검증
  ├── BatchRequestSchema.parse() -- min 2, max 20 instruction 검증
  ├── validateBatchChain() -- chain === 'solana' 검증
  │     └── EVM이면 BATCH_NOT_SUPPORTED (400)
  └── transactions INSERT (type='BATCH', status='PENDING')

Stage 2 (SESSION VALIDATE)
  ├── allowedOperations에 'BATCH' 포함 확인
  └── 배치 내 개별 instruction의 세션 제약은 Phase A에서 함께 검증

Stage 3 (POLICY CHECK)
  ├── buildBatchPolicyInput() -- PolicyEvaluationInput 구성
  ├── Phase A: 개별 instruction 정책 평가
  │     ├── 각 instruction type별 정책 적용 (WHITELIST, CONTRACT_WHITELIST, ...)
  │     └── 1건이라도 DENY → BATCH_POLICY_VIOLATION (403)
  └── Phase B: 합산 금액 티어 결정
        ├── calculateBatchTotalAmount() -- 네이티브 금액 합산
        ├── evaluateBatchSpendingLimit() -- SPENDING_LIMIT 4-티어
        └── resolveBatchFinalTier() -- APPROVE 포함 시 max(금액 티어, approve 티어)

Stage 4 (TIER CLASSIFY)
  └── 최종 티어에 따라 INSTANT/NOTIFY/DELAY/APPROVAL 처리

Stage 5 (EXECUTE)
  ├── convertInstructionsToSolana() -- InstructionRequest[] → SolanaInstruction[]
  │     ├── ATA 자동 생성 삽입
  │     └── type별 변환 (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE)
  ├── buildBatch() -- pipe 패턴으로 트랜잭션 조립
  ├── addComputeBudget() -- CU 최적화
  ├── validateTransactionSize() -- 1232 bytes 검증
  │     └── 초과 시 BATCH_SIZE_EXCEEDED (400)
  ├── simulateTransaction() -- 시뮬레이션
  ├── signTransaction() -- 에이전트 단일 서명
  └── submitTransaction() -- 제출

Stage 6 (CONFIRM)
  └── txHash 기반 확정 대기 (기존 로직 동일)
```

---

*문서 끝 -- CHAIN-EXT-05 배치 트랜잭션 스펙*
*Phase: 23-transaction-type-extension*
*Plan: 03*
*작성일: 2026-02-08*
