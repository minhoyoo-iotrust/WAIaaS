# Phase 23: 트랜잭션 타입 확장 설계 - Research

**Researched:** 2026-02-07
**Domain:** 임의 컨트랙트 호출, 토큰 Approve 관리, 배치 트랜잭션 설계
**Confidence:** HIGH

## Summary

Phase 23은 WAIaaS 트랜잭션 파이프라인에 3가지 새로운 트랜잭션 타입(CONTRACT_CALL, APPROVE, BATCH)을 추가하는 설계 단계이다. Phase 22에서 TRANSFER/TOKEN_TRANSFER를 확장한 기반 위에 ContractCallRequest, ApproveRequest, BatchRequest 인터페이스를 설계하고, 각 타입별 정책 규칙(CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE)과 파이프라인 확장(Stage 1 type 분기, Stage 2 allowedContracts, Stage 3 정책 평가)을 정의한다.

이 연구는 기존 v0.2 설계 문서 10개와 Phase 22 산출물 2개를 분석하여, 각 트랜잭션 타입의 체인별 기술 패턴(EVM calldata vs Solana instruction), 보안 위험 모델, 정책 엔진 확장 패턴, DB 스키마 확장 방안을 식별했다. 핵심 발견: v0.2의 6단계 파이프라인과 DatabasePolicyEngine은 새로운 트랜잭션 타입을 추가하기에 충분한 확장 포인트를 이미 갖추고 있으며, transactions.type이 TEXT(CHECK 제약 없음)이므로 새 타입 추가가 DB 마이그레이션 없이 가능하다. 그러나 감사 컬럼(contract_address, method_signature)은 스키마 확장이 필요하다.

**Primary recommendation:** Phase 22의 token 기반 분기 패턴을 확장하여 request.type 필드로 TRANSFER/CONTRACT_CALL/APPROVE/BATCH를 명시적 분기하고, 각 타입별 독립 인터페이스(ContractCallRequest, ApproveRequest, BatchRequest)를 TransferRequest와 병행 정의한다. 정책은 기본 전면 거부(opt-in)를 원칙으로 하되, 각 타입별 독립 PolicyType(CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT)을 추가한다.

---

## Standard Stack

이 Phase는 설계 마일스톤이므로 라이브러리 "선택"이 아니라 기존 확정된 스택 위에서 트랜잭션 타입 확장에 필요한 API/패턴을 식별하는 것이 핵심이다.

### Core (이미 확정된 스택)

| Library | Version | Purpose | Phase 23 활용 모듈 |
|---------|---------|---------|-------------------|
| `@solana/kit` | latest | Solana RPC 클라이언트 | instruction 구성, programId 기반 호출 |
| `@solana-program/token` | latest | SPL Token Program | `getApproveCheckedInstruction()` (approve) |
| `@solana-program/associated-token-account` | latest | ATA 관리 | approve 대상 ATA 계산 |
| `viem` | 2.45.x+ | EVM 클라이언트 | `encodeFunctionData()`, `simulateContract()`, `writeContract()` |
| `drizzle-orm` | 0.45.x | DB ORM | transactions 테이블 확장, policies 테이블 확장 |
| `zod` | latest | Schema validation | ContractCallRequest, ApproveRequest, BatchRequest 스키마 |

### Supporting (Phase 23에서 새로 참조하는 패턴)

| Library/Concept | Purpose | When to Use |
|----------------|---------|-------------|
| `viem.encodeFunctionData()` | 임의 함수 호출 calldata 인코딩 | ContractCallRequest EVM 빌드 |
| `viem.decodeFunctionData()` | calldata에서 함수 시그니처 추출 | METHOD_WHITELIST 검증 |
| Solana Instruction { programId, accounts, data } | 임의 프로그램 호출 구조 | ContractCallRequest Solana 빌드 |
| `getApproveCheckedInstruction()` | SPL 토큰 approve (decimals 검증) | ApproveRequest Solana 빌드 |
| ERC-20 `approve(address,uint256)` ABI | EVM 토큰 approve | ApproveRequest EVM 빌드 |
| Multicall3 | EVM 배치 호출 (선택적) | Phase 23에서는 미지원으로 설계, 향후 확장점만 예비 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 독립 ContractCallRequest 타입 | TransferRequest에 calldata 필드 추가 | 독립 타입이 타입 안전성 우월. calldata와 amount/to의 의미가 근본적으로 다름 |
| function selector 기반 METHOD_WHITELIST | full ABI 기반 화이트리스트 | selector(4바이트)가 더 간결하고 ABI 없이도 동작. ABI는 선택적 보강 |
| EVM 원자적 배치 미지원 | Multicall3 지원 | Multicall3는 외부 컨트랙트 의존 + ERC-4337 없이 EOA에서 사용 불가. WAIaaS Self-Hosted 원칙에 위배 |
| EIP-2612 Permit 지원 | 표준 approve만 지원 | Permit은 토큰별 지원 여부가 다르고, 오프체인 서명 패턴이 복잡. v0.6에서는 표준 approve만 설계 |

---

## Architecture Patterns

### 기존 파이프라인에서 Phase 23 확장 포인트

v0.2 파이프라인 6단계와 DatabasePolicyEngine에서 Phase 23이 확장해야 하는 정확한 지점:

```
Stage 1 (RECEIVE)
  ├── 현재: type='TRANSFER'|'TOKEN_TRANSFER' 만 처리
  ├── Phase 23: type='CONTRACT_CALL'|'APPROVE'|'BATCH' 추가
  └── TransactionRequestSchema 유니온 분기 (type 필드 기반)

Stage 2 (SESSION VALIDATE)
  ├── 현재: allowedOperations=['TRANSFER','TOKEN_TRANSFER','BALANCE_CHECK']
  ├── Phase 23: 'CONTRACT_CALL','APPROVE','BATCH' 추가
  ├── 신규: allowedContracts?: string[] (CONTRACT_CALL 전용 세션 제약)
  └── 신규: allowedSpenders?: string[] (APPROVE 전용 세션 제약)

Stage 3 (POLICY CHECK)
  ├── 현재: WHITELIST, TIME_RESTRICTION, RATE_LIMIT, SPENDING_LIMIT, ALLOWED_TOKENS
  ├── Phase 23: CONTRACT_WHITELIST, METHOD_WHITELIST 추가 (CONTRACT_CALL 전용)
  ├── Phase 23: APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE 추가
  └── DatabasePolicyEngine.evaluate() 입력 확장 (contractAddress, methodSignature)

Stage 4 (TIER CLASSIFY)
  ├── 현재: SPENDING_LIMIT 기반 금액 분류
  ├── Phase 23: CONTRACT_CALL은 기본 APPROVAL 티어 (보수적)
  ├── Phase 23: APPROVE는 APPROVE_TIER_OVERRIDE로 독립 티어 결정
  └── Phase 23: BATCH는 금액 합산으로 티어 결정

Stage 5 (EXECUTE)
  ├── 현재: adapter.buildTransaction(TransferRequest)
  ├── Phase 23: type 분기로 buildContractCall/buildApprove/buildBatch 호출
  └── IChainAdapter 확장 또는 서비스 레이어 분기

Stage 6 (CONFIRM)
  └── 변경 없음 (txHash 기반 확인)
```

### Pattern 1: TransactionRequest 유니온 타입 (type 기반 분기)

**What:** TransferRequest와 병행하여 ContractCallRequest, ApproveRequest, BatchRequest를 독립 타입으로 정의. REST API에서 type 필드로 분기.

**When to use:** Stage 1에서 요청 타입별 Zod 스키마 분기

```typescript
// 유니온 요청 타입 (REST API 수준)
type TransactionType = 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE' | 'BATCH'

// 타입별 독립 인터페이스
interface ContractCallRequest {
  from: string
  to: string           // 컨트랙트 주소 (EVM) 또는 programId (Solana)
  value?: bigint       // 네이티브 토큰 첨부량 (EVM payable, 기본 0)
  // EVM 전용
  calldata?: string    // ABI 인코딩된 함수 호출 데이터 (0x 접두어 hex)
  abi?: object[]       // 선택적 ABI (METHOD_WHITELIST 검증, 감사 로그용)
  // Solana 전용
  programId?: string          // 프로그램 주소 (Base58)
  instructionData?: string    // Base64 인코딩된 instruction data
  accounts?: AccountMetaInput[]  // 계정 메타 목록
}

interface ApproveRequest {
  from: string         // 토큰 소유자 (에이전트)
  spender: string      // 위임 대상 (컨트랙트/EOA)
  token: TokenInfo     // 토큰 정보 (address, decimals, symbol)
  amount: bigint       // 승인 금액 (토큰 최소 단위)
}

interface BatchRequest {
  from: string
  chain: ChainType
  instructions: InstructionRequest[]  // 개별 instruction 목록
}

interface InstructionRequest {
  type: 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE'
  // 각 type에 맞는 필드
  [key: string]: unknown
}
```

**근거:**
- Phase 22에서 TransferRequest.token으로 네이티브/토큰 분기를 성공적으로 도입
- CONTRACT_CALL은 TransferRequest와 시맨틱이 근본적으로 다름 (calldata, programId 등)
- APPROVE는 "위험한 권한 위임"이므로 독립 타입+정책이 보안상 필수
- BATCH는 다수 instruction의 컨테이너이므로 자체 타입 필요

### Pattern 2: 정책 타입 확장 (PolicyType 유니온)

**What:** DatabasePolicyEngine의 PolicyType Enum에 5개 타입을 추가하여 Phase 23 정책을 지원

**When to use:** Stage 3 정책 평가 시

```typescript
// Phase 22까지: 5개
type PolicyType =
  | 'SPENDING_LIMIT' | 'WHITELIST' | 'TIME_RESTRICTION' | 'RATE_LIMIT'
  | 'ALLOWED_TOKENS'

// Phase 23 추가: 5개 (총 10개)
type PolicyType =
  | 'SPENDING_LIMIT' | 'WHITELIST' | 'TIME_RESTRICTION' | 'RATE_LIMIT'
  | 'ALLOWED_TOKENS'
  | 'CONTRACT_WHITELIST'       // 허용된 컨트랙트/프로그램 주소 목록
  | 'METHOD_WHITELIST'         // 허용된 함수 selector 목록 (컨트랙트별)
  | 'APPROVED_SPENDERS'        // 허용된 approve spender 목록
  | 'APPROVE_AMOUNT_LIMIT'     // approve 최대 금액 제한
  | 'APPROVE_TIER_OVERRIDE'    // approve 전용 보안 티어 규칙
```

**근거:**
- v0.6 핵심 결정: "임의 컨트랙트 호출은 기본 거부 (opt-in 화이트리스트)"
- v0.6 핵심 결정: "approve는 독립 정책 카테고리 (전송보다 위험한 권한 위임)"
- Phase 22에서 ALLOWED_TOKENS 추가 패턴이 이미 검증됨

### Pattern 3: EVM calldata 인코딩/검증

**What:** viem의 encodeFunctionData/decodeFunctionData로 임의 컨트랙트 호출의 calldata를 구성하고, 4바이트 function selector로 METHOD_WHITELIST를 검증

**When to use:** ContractCallRequest EVM 빌드 및 정책 검증 시

```typescript
// calldata 인코딩 (에이전트가 ABI와 함수명을 제공하는 경우)
import { encodeFunctionData, decodeFunctionData } from 'viem'

const calldata = encodeFunctionData({
  abi: userProvidedAbi,
  functionName: 'swap',
  args: [tokenIn, tokenOut, amountIn, amountOutMin, deadline],
})

// calldata에서 function selector 추출 (정책 검증용)
// selector = calldata의 첫 4바이트 = keccak256(functionSignature)의 첫 4바이트
const selector = calldata.slice(0, 10)  // '0x' + 8 hex chars = 10 chars

// METHOD_WHITELIST 검증
const isAllowed = whitelist.allowed_methods.some(
  m => m.selector === selector || m.signature === functionSignature
)
```

**Source:** viem official docs (https://viem.sh/docs/contract/encodeFunctionData)

### Pattern 4: Solana 임의 프로그램 호출 instruction

**What:** Solana의 instruction은 { programId, accounts[], data } 3요소로 구성. @solana/kit의 pipe 패턴으로 임의 instruction을 트랜잭션에 추가

**When to use:** ContractCallRequest Solana 빌드 시

```typescript
// Solana instruction 구조
interface SolanaInstruction {
  programId: Address                        // 프로그램 주소
  accounts: Array<{
    address: Address
    role: AccountRole                       // writable+signer, writable, readonly+signer, readonly
  }>
  data: Uint8Array                          // 프로그램이 해석할 데이터
}

// pipe 패턴으로 트랜잭션에 instruction 추가
let transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayer(from, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash({ blockhash, lastValidBlockHeight }, tx),
  tx => appendTransactionMessageInstruction(customInstruction, tx),
)
```

**Source:** Solana official docs (https://solana.com/docs/core/transactions)

### Pattern 5: Solana 배치 (다중 instruction)

**What:** Solana는 단일 트랜잭션 내에 다수 instruction을 포함하는 원자적 배치를 네이티브로 지원. 트랜잭션 크기 제한(1232 bytes) 내에서 instruction을 순차 추가.

**When to use:** BatchRequest Solana 빌드 시

```typescript
// 다중 instruction을 하나의 트랜잭션에 원자적으로 포함
let transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayer(from, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash({ blockhash, lastValidBlockHeight }, tx),
)

// 순차적으로 instruction 추가
for (const instruction of batchInstructions) {
  transactionMessage = appendTransactionMessageInstruction(instruction, transactionMessage)
}

// 원자성 보장: 하나라도 실패하면 전체 롤백
```

**핵심 제약:** 트랜잭션 전체 크기 1232 bytes 이내. 실질적으로 ~20개 이하 instruction.

### Anti-Patterns to Avoid

- **EVM 원자적 배치 시도:** EOA 기반 EVM에서는 1 transaction = 1 call이 원칙. Multicall3는 외부 컨트랙트 의존이며, ERC-4337 없이 EOA가 직접 사용 불가. WAIaaS v0.6에서는 EVM BATCH를 명시적으로 미지원하고 에러를 반환해야 한다.
- **무제한 approve 허용:** type(uint256).max 승인은 편의성을 위해 DeFi에서 관행이나, WAIaaS AI 에이전트 컨텍스트에서는 치명적 위험. 정책 엔진에서 무조건 차단해야 한다.
- **calldata 없이 컨트랙트 호출 허용:** calldata가 비어 있는 컨트랙트 호출은 fallback/receive 함수 트리거. 의도하지 않은 동작을 방지하기 위해 calldata 필수로 설계.
- **BATCH 정책 개별 평가:** 배치의 개별 instruction만 평가하면 합산 금액이 APPROVAL 티어인데 개별은 INSTANT일 수 있음. 반드시 합산 평가 필요.

---

## Don't Hand-Roll

Phase 23은 설계 마일스톤이므로 "구현하지 마라"보다 "설계에서 외부 의존을 피하라"가 적용된다.

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| EVM calldata 인코딩 | 수동 ABI 인코딩 | viem `encodeFunctionData()` | ABI 인코딩은 타입 패딩, 동적 타입 오프셋 등 복잡. viem이 완벽히 처리 |
| function selector 계산 | 수동 keccak256 | viem `toFunctionSelector()` 또는 calldata 첫 4바이트 | 함수 시그니처 정규화가 미묘 (공백, 파라미터 이름 제거 등) |
| Solana ATA PDA 계산 | 수동 PDA derivation | `findAssociatedTokenPda()` | seed derivation 규칙이 변경될 수 있음 |
| EVM approve race condition 방지 | 커스텀 approve 패턴 | approve-to-zero-then-set 패턴 | OpenZeppelin이 표준화한 패턴. increaseAllowance는 OZ v5에서 제거됨 |

**Key insight:** Phase 23 설계에서 핵심은 "어떻게 인코딩할 것인가"가 아니라 "어떤 요청을 허용/거부할 것인가"이다. 인코딩은 기존 라이브러리에 위임하고, 정책과 보안 규칙 설계에 집중해야 한다.

---

## Common Pitfalls

### Pitfall 1: approve의 이중 위험 -- 권한 위임 + race condition

**What goes wrong:** approve는 "금액 전송"이 아니라 "전송 권한을 타인에게 위임"하는 행위이다. 일단 approve가 완료되면, spender가 에이전트 모르게 토큰을 가져갈 수 있다. 추가로 ERC-20 approve에는 race condition이 있어서 allowance 변경 시 이중 소비가 가능하다.

**Why it happens:** DeFi에서는 편의를 위해 무제한 approve(type(uint256).max)가 관행이지만, AI 에이전트 컨텍스트에서 이는 에이전트의 전 자산을 spender에게 넘기는 것과 같다.

**How to avoid:**
- ApproveRequest를 ContractCall과 독립된 타입으로 설계 (v0.6 핵심 결정)
- APPROVE_AMOUNT_LIMIT 정책으로 무제한 approve 차단
- APPROVED_SPENDERS 화이트리스트로 허용된 spender만 승인
- APPROVE_TIER_OVERRIDE로 approve는 기본 APPROVAL 티어 강제 (Owner 승인 필수)
- EVM에서 allowance 변경 시 approve(0) -> approve(newAmount) 패턴 강제

**Warning signs:** spender 주소가 화이트리스트에 없음, 금액이 토큰 총 공급량의 일정 비율 초과, 무제한(uint256.max) 금액 감지

### Pitfall 2: 임의 컨트랙트 호출의 무한 공격 표면

**What goes wrong:** ContractCallRequest는 에이전트가 임의 스마트 컨트랙트의 임의 함수를 호출할 수 있게 한다. 이는 악의적 컨트랙트 호출, 자금 탈취 함수 호출, 의도치 않은 상태 변경 등 무한한 공격 표면을 노출한다.

**Why it happens:** DeFi 프로토콜 상호작용에는 임의 컨트랙트 호출이 필수이지만, "무엇이든 호출 가능"은 보안적으로 재앙이다.

**How to avoid:**
- 기본 전면 거부 (opt-in 화이트리스트) -- v0.6 핵심 결정
- CONTRACT_WHITELIST: 허용된 컨트랙트 주소만 호출 가능
- METHOD_WHITELIST: 특정 컨트랙트의 특정 함수만 호출 가능 (4바이트 selector 기반)
- value 파라미터 제한 (네이티브 토큰 첨부 금액)
- 시뮬레이션 결과의 상태 변경 범위 검증 (로그 분석)

**Warning signs:** CONTRACT_WHITELIST 미설정, 알 수 없는 컨트랙트 주소, calldata가 없는 호출 (fallback 트리거), 높은 value 첨부

### Pitfall 3: 배치 트랜잭션의 정책 우회

**What goes wrong:** 배치의 개별 instruction이 각각 INSTANT 티어이지만, 합산하면 APPROVAL 티어가 되는 경우. 개별 평가만 하면 정책을 우회할 수 있다.

**Why it happens:** 정책 엔진이 개별 instruction만 평가하고 배치 전체의 합산 영향을 고려하지 않을 때 발생.

**How to avoid:**
- 배치 정책 평가 규칙: 모든 instruction의 금액을 합산하여 티어 결정
- All-or-Nothing 정책 위반 처리: 하나라도 정책 위반이면 전체 배치 거부
- CONTRACT_WHITELIST, METHOD_WHITELIST는 배치 내 모든 instruction에 각각 적용
- 배치 크기 제한 (instruction 수, 트랜잭션 크기)

**Warning signs:** 다수의 소액 전송을 배치로 묶어 한도 우회 시도, approve + transferFrom 콤보 배치

### Pitfall 4: EVM 배치 원자성 착각

**What goes wrong:** EVM EOA에서 다수의 호출을 단일 트랜잭션으로 원자적으로 실행하려고 시도. EOA는 1 tx = 1 call이 원칙이므로 네이티브 배치가 불가능하다.

**Why it happens:** Solana에서는 multi-instruction이 네이티브이므로, EVM에서도 가능할 것으로 오해.

**How to avoid:**
- EVM BATCH 타입 요청 시 명확한 에러 반환: `BATCH_NOT_SUPPORTED` (chain='evm')
- 향후 Multicall3/ERC-4337 지원은 별도 Phase에서 검토
- BatchRequest.chain이 'solana'가 아니면 즉시 거부

**Warning signs:** chain이 EVM 계열인 BatchRequest

### Pitfall 5: Solana 트랜잭션 크기 초과

**What goes wrong:** BatchRequest에 instruction을 과다하게 포함하여 1232 bytes 제한 초과. 트랜잭션 빌드 실패.

**Why it happens:** Solana의 1232 bytes 제한은 instruction data, account metas, signatures를 모두 포함한다. 복잡한 instruction은 100+ bytes를 소비할 수 있어 실질적으로 10-20개 instruction이 한계.

**How to avoid:**
- BatchRequest에 최대 instruction 수 제한 설계 (예: 20개)
- 빌드 시 직렬화된 트랜잭션 크기를 사전 검증
- 초과 시 BATCH_SIZE_EXCEEDED 에러 반환

**Warning signs:** instruction 수가 10개 초과, 각 instruction의 accounts 배열이 큰 경우

---

## Code Examples

### ContractCallRequest -- EVM calldata 구성

```typescript
// viem을 사용한 임의 컨트랙트 호출 calldata 인코딩
import { encodeFunctionData, toFunctionSelector } from 'viem'

// Uniswap V3 Router의 exactInputSingle 함수 호출 예시
const calldata = encodeFunctionData({
  abi: [
    {
      name: 'exactInputSingle',
      type: 'function',
      stateMutability: 'payable',
      inputs: [
        {
          name: 'params',
          type: 'tuple',
          components: [
            { name: 'tokenIn', type: 'address' },
            { name: 'tokenOut', type: 'address' },
            { name: 'fee', type: 'uint24' },
            { name: 'recipient', type: 'address' },
            { name: 'deadline', type: 'uint256' },
            { name: 'amountIn', type: 'uint256' },
            { name: 'amountOutMinimum', type: 'uint256' },
            { name: 'sqrtPriceLimitX96', type: 'uint160' },
          ],
        },
      ],
      outputs: [{ name: 'amountOut', type: 'uint256' }],
    },
  ],
  functionName: 'exactInputSingle',
  args: [params],
})

// function selector 추출 (정책 검증용)
const selector = calldata.slice(0, 10)  // '0x414bf389' (exactInputSingle)
```

### ApproveRequest -- EVM approve 구성

```typescript
// ERC-20 approve 호출
const calldata = encodeFunctionData({
  abi: [
    {
      name: 'approve',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
  ],
  functionName: 'approve',
  args: [spenderAddress, amount],
})

// 무제한 approve 감지 로직
const MAX_UINT256 = 2n ** 256n - 1n
const isUnlimited = amount >= MAX_UINT256 || amount >= MAX_UINT256 / 2n
// -> isUnlimited이면 APPROVE_AMOUNT_LIMIT 정책 위반
```

### ApproveRequest -- Solana SPL approve 구성

```typescript
// SPL Token approve (ApproveChecked instruction)
import { getApproveCheckedInstruction } from '@solana-program/token'

const approveInstruction = getApproveCheckedInstruction({
  account: sourceAta,           // 위임 대상 토큰 계정 (ATA)
  mint: mintAddress,            // 토큰 민트
  delegate: delegateAddress,    // 위임받는 주소
  owner: ownerAddress,          // 토큰 계정 소유자 (에이전트)
  amount: approveAmount,        // 위임 금액 (토큰 최소 단위)
  decimals: tokenDecimals,      // decimals 온체인 검증
  tokenProgram: tokenProgramId, // Token Program 또는 Token-2022
})

// Solana SPL은 하나의 토큰 계정에 하나의 delegate만 허용
// 새 approve는 기존 delegate를 덮어씀
```

### BatchRequest -- Solana 다중 instruction 배치

```typescript
// Solana 원자적 배치: ATA 생성 + approve + transfer를 하나의 tx로
import { pipe } from '@solana/kit'

let tx = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayer(from, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash({ blockhash, lastValidBlockHeight }, tx),
  // Instruction 1: ATA 생성
  tx => appendTransactionMessageInstruction(createAtaInstruction, tx),
  // Instruction 2: approve
  tx => appendTransactionMessageInstruction(approveInstruction, tx),
  // Instruction 3: transfer
  tx => appendTransactionMessageInstruction(transferInstruction, tx),
)

// 원자성 보장: 3개 instruction 중 하나라도 실패하면 전체 롤백
// 크기 검증: compiledMessage의 직렬화 크기 <= 1232 bytes
```

---

## State of the Art

### 기존 설계에서 Phase 23이 참조하는 확장 포인트

| 문서 | 현재 상태 | Phase 23 확장 내용 |
|------|----------|-------------------|
| CORE-04 (27) TransferRequest | `from, to, amount, memo?, token?` (Phase 22) | ContractCallRequest, ApproveRequest, BatchRequest 별도 타입 추가 |
| CORE-02 (25) transactions.type | TEXT, `'TRANSFER'\|'TOKEN_TRANSFER'\|'PROGRAM_CALL'` 주석 | `CONTRACT_CALL`, `APPROVE`, `BATCH` 정식 추가 |
| CORE-02 (25) transactions 컬럼 | 14개 컬럼 (id~metadata) | `contract_address`, `method_signature` 감사 컬럼 추가 |
| LOCK-MECH (33) PolicyType | 4개 (Phase 8) + 1개 (Phase 22) = 5개 | +5개 = 총 10개 |
| LOCK-MECH (33) DatabasePolicyEngine.evaluate() | `{ type, amount, to, chain }` 입력 | `contractAddress`, `methodSignature`, `spender`, `approveAmount` 입력 확장 |
| TX-PIPE (32) Stage 1 type 분기 | TRANSFER/TOKEN_TRANSFER | CONTRACT_CALL/APPROVE/BATCH 추가 |
| TX-PIPE (32) Stage 2 allowedOperations | `['TRANSFER', 'TOKEN_TRANSFER', 'BALANCE_CHECK']` | `CONTRACT_CALL`, `APPROVE`, `BATCH` 추가 |
| ENUM-MAP (45) PolicyType | 4개 값 | 10개로 확장 |
| ENUM-MAP (45) TransactionType | 미등록 (TEXT 자유) | `CONTRACT_CALL`, `APPROVE`, `BATCH` 공식 등록 |
| API-SPEC (37) POST /v1/transactions/send | TransferRequest만 수신 | type 분기로 다형적 요청 수신 |

### TransactionType Enum 확장 (Phase 22-23 누적)

| 값 | Phase | 설명 | DB CHECK |
|----|-------|------|----------|
| `TRANSFER` | v0.2 | 네이티브 토큰 전송 (SOL, ETH) | Phase 23에서 CHECK 추가 |
| `TOKEN_TRANSFER` | Phase 22 | SPL/ERC-20 토큰 전송 | Phase 23에서 CHECK 추가 |
| `CONTRACT_CALL` | Phase 23 | 임의 스마트 컨트랙트 호출 | 신규 |
| `APPROVE` | Phase 23 | 토큰 approve/delegate | 신규 |
| `BATCH` | Phase 23 | 다중 instruction 배치 (Solana) | 신규 |

### 정책 엔진 평가 알고리즘 확장

Phase 22까지의 DatabasePolicyEngine.evaluate() 6단계:
1. 에이전트별 + 글로벌 활성 정책 로드
2. WHITELIST 평가
3. TIME_RESTRICTION 평가
4. RATE_LIMIT 평가
5. (Phase 22) ALLOWED_TOKENS 평가
6. SPENDING_LIMIT 평가 -> 4-티어 분류

Phase 23 확장 (총 11단계):
1. 에이전트별 + 글로벌 활성 정책 로드
2. WHITELIST 평가
3. TIME_RESTRICTION 평가
4. RATE_LIMIT 평가
5. ALLOWED_TOKENS 평가 (TOKEN_TRANSFER, APPROVE 시)
6. **CONTRACT_WHITELIST 평가** (CONTRACT_CALL 시) -- DENY 우선
7. **METHOD_WHITELIST 평가** (CONTRACT_CALL 시) -- DENY 우선
8. **APPROVED_SPENDERS 평가** (APPROVE 시) -- DENY 우선
9. **APPROVE_AMOUNT_LIMIT 평가** (APPROVE 시) -- 무제한 차단
10. **APPROVE_TIER_OVERRIDE 평가** (APPROVE 시) -- 독립 티어
11. SPENDING_LIMIT 평가 -> 4-티어 분류 (BATCH는 합산 금액)

**핵심:** DENY 우선 원칙 유지. 새 정책 타입들은 각자의 type 조건에서만 평가 (CONTRACT_WHITELIST는 CONTRACT_CALL에만, APPROVED_SPENDERS는 APPROVE에만).

---

## Deep Dive: 체인별 기술 차이점

### 임의 컨트랙트 호출 (CONTRACT_CALL)

| 항목 | EVM | Solana |
|------|-----|--------|
| 호출 대상 | 컨트랙트 주소 (to 필드) | 프로그램 주소 (programId) |
| 호출 데이터 | calldata (ABI 인코딩, 0x hex) | instruction data (바이너리, Base64) |
| 함수 식별 | 4바이트 function selector | instruction data 첫 N바이트 (프로그램별 상이) |
| 계정 모델 | 호출자 EOA -> 컨트랙트 | instruction accounts[] (읽기/쓰기/서명자 권한) |
| 네이티브 토큰 첨부 | value 필드 (payable 함수용) | SOL은 System Program transfer로 별도 instruction |
| 시뮬레이션 | `eth_call` 또는 `simulateContract()` | `simulateTransaction()` |
| gas/compute | gas = 21000 + 실행 비용 | compute units (기본 200K CU limit) |
| 호출 깊이 | 1024 call depth 제한 | CPI (Cross-Program Invocation) 4 depth 제한 |

### 토큰 Approve (APPROVE)

| 항목 | EVM (ERC-20) | Solana (SPL) |
|------|-------------|-------------|
| 함수/instruction | `approve(spender, amount)` | `ApproveChecked(delegate, amount, decimals)` |
| 무제한 승인 | `type(uint256).max` (= 2^256-1) | `u64.max` (= 2^64-1, 18,446,744,073,709,551,615) |
| delegate 수 | 무제한 (spender별 독립 allowance) | **1개만** (새 approve가 기존 덮어씀) |
| 취소 | `approve(spender, 0)` | `Revoke` instruction |
| race condition | 있음 (approve -> 0 -> new 패턴 필요) | 없음 (단일 delegate 모델) |
| decimals 검증 | 없음 (approve는 raw amount만) | ApproveChecked에서 온체인 검증 |
| Permit (EIP-2612) | 오프체인 서명 approve (gasless) | 해당 없음 |
| 이벤트 | Approval(owner, spender, value) 이벤트 | approve instruction 로그 |

### 배치 트랜잭션 (BATCH)

| 항목 | EVM | Solana |
|------|-----|--------|
| 네이티브 지원 | **미지원** (1 tx = 1 call) | **네이티브 지원** (multi-instruction) |
| 대안 | Multicall3 (외부 컨트랙트), ERC-4337 (스마트 월렛) | 불필요 (네이티브) |
| 원자성 | Multicall3: 선택적 (aggregate3), ERC-4337: 보장 | **보장** (하나 실패 = 전체 롤백) |
| 크기 제한 | gas limit | **1232 bytes** (트랜잭션 전체) |
| WAIaaS v0.6 | **미지원** (BATCH_NOT_SUPPORTED 에러) | 지원 |

---

## Deep Dive: 정책 규칙 Zod 스키마 설계

### CONTRACT_WHITELIST

```typescript
export const ContractWhitelistRuleSchema = z.object({
  /**
   * 허용된 컨트랙트/프로그램 주소 목록.
   * 빈 배열이면 모든 컨트랙트 거부 (기본 전면 거부).
   * 미설정(CONTRACT_WHITELIST 정책 자체가 없음)이면 CONTRACT_CALL 자체 거부.
   */
  allowed_contracts: z.array(z.object({
    /** 컨트랙트/프로그램 주소 (EVM: 0x hex, Solana: Base58) */
    address: z.string().min(1),
    /** 사람이 읽을 수 있는 라벨 (감사 로그용) */
    label: z.string().optional(),
    /** 해당 컨트랙트의 허용된 체인 (미지정 시 모든 체인) */
    chain: z.enum(['solana', 'ethereum', 'polygon', 'arbitrum']).optional(),
  })),
})
```

### METHOD_WHITELIST

```typescript
export const MethodWhitelistRuleSchema = z.object({
  /**
   * 컨트랙트별 허용된 메서드 목록.
   * CONTRACT_WHITELIST와 조합: 컨트랙트 허용 + 메서드 허용 모두 만족해야 호출 가능.
   * 컨트랙트가 CONTRACT_WHITELIST에는 있지만 METHOD_WHITELIST에 없으면 -> 모든 메서드 허용.
   */
  contract_methods: z.array(z.object({
    /** 컨트랙트/프로그램 주소 */
    contract_address: z.string().min(1),
    /** 허용된 함수 selector 목록 (EVM: 0x + 8 hex chars, 예: '0xa9059cbb') */
    allowed_selectors: z.array(z.string().regex(/^0x[0-9a-fA-F]{8}$/)).optional(),
    /** 허용된 함수 시그니처 목록 (사람 가독성, 예: 'transfer(address,uint256)') */
    allowed_signatures: z.array(z.string()).optional(),
  })),
})
```

### APPROVED_SPENDERS

```typescript
export const ApprovedSpendersRuleSchema = z.object({
  /**
   * 허용된 approve spender 주소 목록.
   * 미설정 또는 빈 배열이면 모든 approve 거부 (기본 전면 거부).
   */
  allowed_spenders: z.array(z.object({
    /** spender 주소 (EVM: 0x hex, Solana: Base58) */
    address: z.string().min(1),
    /** spender 라벨 (예: 'Uniswap V3 Router') */
    label: z.string().optional(),
    /** 해당 spender의 허용된 체인 */
    chain: z.enum(['solana', 'ethereum', 'polygon', 'arbitrum']).optional(),
  })),
})
```

### APPROVE_AMOUNT_LIMIT

```typescript
export const ApproveAmountLimitRuleSchema = z.object({
  /**
   * approve 최대 금액 (토큰 최소 단위의 문자열).
   * 이 금액 초과 approve는 거부.
   * '0'이면 모든 approve 거부 (approve 기능 비활성화).
   */
  max_approve_amount: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),

  /**
   * 무제한 approve 감지 임계값.
   * approve 금액이 이 값 이상이면 "무제한"으로 간주하여 거부.
   * 기본값: EVM uint256 max의 절반, Solana u64 max의 절반
   */
  unlimited_threshold: z.string().regex(/^\d+$/).optional(),

  /**
   * 무제한 approve 차단 여부.
   * true이면 unlimited_threshold 이상 금액 approve 거부.
   * 기본: true (보수적)
   */
  block_unlimited: z.boolean().default(true),
})
```

### APPROVE_TIER_OVERRIDE

```typescript
export const ApproveTierOverrideRuleSchema = z.object({
  /**
   * approve의 기본 보안 티어.
   * SPENDING_LIMIT과 독립적으로 적용.
   * approve는 "권한 위임"이므로 전송보다 높은 티어를 기본 적용.
   * 기본: 'APPROVAL' (Owner 승인 필수)
   */
  default_tier: z.enum(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']).default('APPROVAL'),

  /**
   * 금액 기반 티어 오버라이드 (선택적).
   * 소액 approve는 낮은 티어 허용 가능.
   * 미설정이면 default_tier 일괄 적용.
   */
  amount_tiers: z.array(z.object({
    max_amount: z.string().regex(/^\d+$/),
    tier: z.enum(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']),
  })).optional(),
})
```

---

## Deep Dive: transactions 테이블 스키마 확장

### 현재 transactions 테이블 (Phase 22 시점)

14개 컬럼: id, agent_id, session_id, chain, tx_hash, type, amount, to_address, status, tier, queued_at, executed_at, created_at, error, metadata

### Phase 23 확장 컬럼

```sql
-- 감사 컬럼 추가 (ALTER TABLE)
ALTER TABLE transactions ADD COLUMN contract_address TEXT;    -- 호출된 컨트랙트/프로그램 주소
ALTER TABLE transactions ADD COLUMN method_signature TEXT;    -- 호출된 함수 시그니처 (예: 'transfer(address,uint256)')
ALTER TABLE transactions ADD COLUMN token_address TEXT;       -- approve 대상 토큰 주소 (Phase 22 TOKEN_TRANSFER에도 적용)
ALTER TABLE transactions ADD COLUMN spender_address TEXT;     -- approve spender 주소

-- type CHECK 제약 추가 (Phase 23에서 정식화)
-- 주의: SQLite ALTER TABLE은 CHECK 추가 미지원. 마이그레이션 시 테이블 재생성 필요.
-- Drizzle ORM 마이그레이션으로 처리
```

```typescript
// Drizzle ORM 확장
export const transactions = sqliteTable('transactions', {
  // ... 기존 14개 컬럼 ...

  // ── Phase 23 감사 컬럼 ──
  contractAddress: text('contract_address'),     // CONTRACT_CALL: 컨트랙트 주소, APPROVE: 토큰 컨트랙트
  methodSignature: text('method_signature'),     // CONTRACT_CALL: 함수 시그니처, APPROVE: 'approve(address,uint256)'
  tokenAddress: text('token_address'),           // TOKEN_TRANSFER, APPROVE: 토큰 민트/컨트랙트 주소
  spenderAddress: text('spender_address'),       // APPROVE: spender 주소
}, (table) => [
  // ... 기존 인덱스 ...
  index('idx_transactions_contract_address').on(table.contractAddress),  // 감사 조회용
])
```

### TransactionType Enum 정식화 (45-enum-unified-mapping.md 확장)

```typescript
// Phase 23에서 TransactionType을 공식 Enum으로 등록
const TransactionTypeEnum = z.enum([
  'TRANSFER',          // 네이티브 토큰 전송 (v0.2)
  'TOKEN_TRANSFER',    // SPL/ERC-20 토큰 전송 (Phase 22)
  'CONTRACT_CALL',     // 임의 컨트랙트 호출 (Phase 23)
  'APPROVE',           // 토큰 approve/delegate (Phase 23)
  'BATCH',             // 다중 instruction 배치 (Phase 23)
])

type TransactionType = z.infer<typeof TransactionTypeEnum>
```

---

## Deep Dive: REST API 확장

### POST /v1/transactions/send 요청 스키마 확장

현재 TransferRequestSchema에 type 필드가 이미 존재하므로, 이를 확장하여 다형적 요청을 수신한다.

```typescript
// REST API 수준 다형적 요청 스키마
const TransactionSendRequestSchema = z.discriminatedUnion('type', [
  // 기존 TRANSFER/TOKEN_TRANSFER
  z.object({
    type: z.literal('TRANSFER'),
    to: z.string(),
    amount: z.string().regex(/^\d+$/),
    memo: z.string().max(256).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  }),
  z.object({
    type: z.literal('TOKEN_TRANSFER'),
    to: z.string(),
    amount: z.string().regex(/^\d+$/),
    tokenMint: z.string(),
    memo: z.string().max(256).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  }),
  // Phase 23 신규
  z.object({
    type: z.literal('CONTRACT_CALL'),
    to: z.string(),              // 컨트랙트/프로그램 주소
    value: z.string().regex(/^\d+$/).optional().default('0'),  // 네이티브 토큰 첨부량
    calldata: z.string().optional(),           // EVM: 0x hex calldata
    abi: z.array(z.any()).optional(),           // 선택적 ABI (검증용)
    programId: z.string().optional(),           // Solana: 프로그램 주소
    instructionData: z.string().optional(),     // Solana: Base64 instruction data
    accounts: z.array(z.object({
      address: z.string(),
      isSigner: z.boolean().default(false),
      isWritable: z.boolean().default(false),
    })).optional(),
  }),
  z.object({
    type: z.literal('APPROVE'),
    tokenMint: z.string(),       // 토큰 주소
    spender: z.string(),         // 위임 대상 주소
    amount: z.string().regex(/^\d+$/),  // 승인 금액
  }),
  z.object({
    type: z.literal('BATCH'),
    instructions: z.array(z.object({
      type: z.enum(['TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE']),
      // 각 type에 맞는 필드 (유연한 스키마)
    }).passthrough()).min(2).max(20),
  }),
])
```

### 새 에러 코드 (37-rest-api-complete-spec.md 확장)

| 에러 코드 | HTTP | 도메인 | 설명 |
|----------|------|--------|------|
| `CONTRACT_NOT_WHITELISTED` | 403 | tx | 컨트랙트가 화이트리스트에 없음 |
| `METHOD_NOT_WHITELISTED` | 403 | tx | 함수 selector가 화이트리스트에 없음 |
| `SPENDER_NOT_APPROVED` | 403 | tx | spender가 APPROVED_SPENDERS에 없음 |
| `APPROVE_AMOUNT_EXCEEDED` | 403 | tx | approve 금액이 APPROVE_AMOUNT_LIMIT 초과 |
| `UNLIMITED_APPROVE_BLOCKED` | 403 | tx | 무제한 approve 차단 |
| `BATCH_NOT_SUPPORTED` | 400 | tx | EVM 체인에서 BATCH 타입 요청 |
| `BATCH_SIZE_EXCEEDED` | 400 | tx | 배치 instruction 수 또는 크기 초과 |
| `BATCH_POLICY_VIOLATION` | 403 | tx | 배치 내 instruction 정책 위반 |
| `CONTRACT_CALL_DISABLED` | 403 | tx | CONTRACT_WHITELIST 미설정 (기본 거부) |
| `APPROVE_DISABLED` | 403 | tx | APPROVED_SPENDERS 미설정 (기본 거부) |

---

## Deep Dive: 보안 위험 모델

### ContractCallRequest 위험 매트릭스

| 위험 | 심각도 | 완화 방안 |
|------|--------|----------|
| 악의적 컨트랙트 호출 | CRITICAL | CONTRACT_WHITELIST 필수 (기본 전면 거부) |
| 위험 함수 호출 (예: selfdestruct, delegatecall) | CRITICAL | METHOD_WHITELIST로 허용 함수만 통과 |
| 과도한 네이티브 토큰 첨부 (value) | HIGH | SPENDING_LIMIT에 value 포함하여 티어 평가 |
| 시뮬레이션 우회 (상태 의존적 호출) | MEDIUM | 시뮬레이션 실패 시 무조건 거부, 로그 감사 |
| 가스 고갈 공격 (과도한 gas 소비) | MEDIUM | gas 추정값 * 1.2 상한, 시뮬레이션에서 사전 검증 |

### ApproveRequest 위험 매트릭스

| 위험 | 심각도 | 완화 방안 |
|------|--------|----------|
| 무제한 approve (uint256.max) | CRITICAL | APPROVE_AMOUNT_LIMIT + block_unlimited=true |
| 악의적 spender에게 approve | CRITICAL | APPROVED_SPENDERS 필수 (기본 전면 거부) |
| approve race condition | HIGH | approve(0) -> approve(new) 패턴 강제 (EVM) |
| 잔여 allowance 미관리 | MEDIUM | 감사 로그에 approve 이력 기록, revoke 가이드 |
| approve 후 spender가 즉시 탈취 | HIGH | APPROVE_TIER_OVERRIDE: 기본 APPROVAL 티어 (Owner 승인) |

### BatchRequest 위험 매트릭스

| 위험 | 심각도 | 완화 방안 |
|------|--------|----------|
| 합산 금액 정책 우회 | HIGH | 배치 전체 금액 합산으로 티어 평가 |
| 트랜잭션 크기 초과 (Solana) | MEDIUM | 1232 bytes 사전 검증, instruction 수 제한 |
| approve + transferFrom 콤보 | HIGH | 배치 내 APPROVE 포함 시 APPROVE 정책 별도 적용 |
| 부분 실패 오해 | LOW | Solana 원자성 명시 (전체 성공 또는 전체 실패) |

---

## Open Questions

Phase 23 설계 시 결정이 필요한 사항:

1. **ContractCallRequest의 IChainAdapter 메서드 배치**
   - What we know: Phase 22에서 TransferRequest.token 분기로 buildTransaction() 내부에서 SPL/ERC-20 빌드를 처리
   - What's unclear: ContractCallRequest는 TransferRequest와 시맨틱이 매우 다름. buildTransaction(TransferRequest) 시그니처를 유니온으로 확장할 것인가, 아니면 buildContractCall(ContractCallRequest) 별도 메서드를 추가할 것인가?
   - Recommendation: 서비스 레이어에서 type 분기 후 어댑터의 기존 buildTransaction()에 내부 로직 추가. IChainAdapter 인터페이스 변경 최소화 (저수준 유지 원칙).

2. **BatchRequest의 정책 평가 순서**
   - What we know: 배치 내 금액은 합산하여 티어 결정
   - What's unclear: 배치 내 개별 instruction의 정책도 각각 평가해야 하는가? 예를 들어 배치 내 CONTRACT_CALL이 있으면 CONTRACT_WHITELIST도 검증?
   - Recommendation: Yes -- 배치 내 모든 instruction을 개별 정책 평가 + 금액 합산 평가. All-or-Nothing: 하나라도 정책 위반이면 전체 배치 거부.

3. **EVM approve race condition 방지의 설계 레벨**
   - What we know: approve(0) -> approve(new) 패턴이 표준
   - What's unclear: 이 패턴을 어댑터에서 자동으로 처리할 것인가, 아니면 에이전트가 수동으로 처리하도록 할 것인가?
   - Recommendation: 어댑터에서 자동 처리 (현재 allowance > 0이면 approve(0)을 먼저 실행하고 approve(new)를 실행). 에이전트에게 race condition 보안 지식을 요구하지 않음.

4. **Solana approve의 단일 delegate 제약 고지**
   - What we know: SPL Token은 토큰 계정당 하나의 delegate만 허용
   - What's unclear: 새 approve가 기존 delegate를 덮어쓸 때 에이전트/Owner에게 경고해야 하는가?
   - Recommendation: approve 전 현재 delegate를 조회하고, 기존 delegate가 있으면 경고 로그 기록 + 기존 delegate 정보를 응답에 포함.

5. **Phase 24 USD 기준 정책과의 연계**
   - What we know: Phase 24에서 가격 오라클 통합으로 USD 기준 정책 평가 도입 예정
   - What's unclear: Phase 23의 APPROVE_AMOUNT_LIMIT와 SPENDING_LIMIT의 금액 단위가 Phase 24에서 USD로 전환될 때의 호환성
   - Recommendation: Phase 23에서는 토큰 최소 단위(lamports/wei) 기반으로 설계. Phase 24에서 USD 변환 레이어를 정책 엔진 앞단에 추가하여 하위 호환 유지.

---

## Sources

### Primary (HIGH confidence)

- 기존 v0.2 설계 문서 분석 (직접 읽기):
  - `27-chain-adapter-interface.md` -- IChainAdapter 14 methods, TransferRequest, 4단계 파이프라인
  - `32-transaction-pipeline-api.md` -- 6단계 파이프라인, 8-state 상태 머신, Stage 1-6 pseudo-code
  - `33-time-lock-approval-mechanism.md` -- DatabasePolicyEngine 6단계 evaluate, PolicyType 4개, TOCTOU
  - `25-sqlite-schema.md` -- transactions 테이블 (14 컬럼, type TEXT), policies 테이블
  - `45-enum-unified-mapping.md` -- 9 Enum SSoT, PolicyType 4개, TransactionStatus 8개
  - `37-rest-api-complete-spec.md` -- 31 endpoints, TransferRequestSchema (type, tokenMint 이미 포함)
  - `31-solana-adapter-detail.md` -- SolanaAdapter 14 methods, @solana/kit pipe 패턴
  - `36-killswitch-autostop-evm.md` -- EvmAdapterStub 14 methods, viem 타입
  - `56-token-transfer-extension-spec.md` -- Phase 22 CHAIN-EXT-01, TransferRequest.token, ALLOWED_TOKENS
  - `57-asset-query-fee-estimation-spec.md` -- Phase 22 CHAIN-EXT-02, getAssets(), FeeEstimate

- Solana 공식 문서:
  - [Transactions](https://solana.com/docs/core/transactions) -- instruction 구조, 1232 bytes 제한, 원자성
  - [Approve Delegate](https://solana.com/docs/tokens/basics/approve-delegate) -- ApproveChecked, 단일 delegate 제약

### Secondary (MEDIUM confidence)

- [viem encodeFunctionData](https://viem.sh/docs/contract/encodeFunctionData) -- calldata 인코딩 API
- [viem writeContract](https://viem.sh/docs/contract/writeContract) -- 컨트랙트 쓰기 API
- [RareSkills: Multicall in Solana](https://rareskills.io/post/solana-multiple-transactions) -- Solana 배치 패턴, 크기 제약
- [Kalis.me: Unlimited ERC20 allowances considered harmful](https://kalis.me/unlimited-erc20-allowances/) -- 무제한 approve 위험
- [Smart Contract Tips: Understanding ERC20 Token Approvals](https://smartcontract.tips/en/post/understanding-erc20-token-approvals) -- approve 패턴, race condition
- [Approval Vulnerabilities - SCSFG](https://scsfg.io/hackers/approvals/) -- approve 보안 취약점

### Tertiary (LOW confidence)

- [Alchemy: What is ERC-4337](https://www.alchemy.com/overviews/what-is-account-abstraction) -- EVM 배치 대안 (향후 참고)
- [EIP-2612: Permit Extension](https://eips.ethereum.org/EIPS/eip-2612) -- gasless approve (v0.6 범위 외)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 모든 라이브러리가 Phase 22에서 이미 확정
- Architecture: HIGH -- 기존 파이프라인의 확장 포인트가 명확하고, Phase 22 패턴이 검증됨
- Pitfalls: HIGH -- ERC-20 approve 위험, 배치 정책 우회, EVM 원자성 한계가 잘 문서화됨
- Policy engine extension: HIGH -- DatabasePolicyEngine의 evaluate() 알고리즘이 명확하고 확장 가능

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days -- 안정적인 설계 도메인)
