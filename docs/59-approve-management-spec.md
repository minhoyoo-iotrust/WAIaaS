# Approve 관리 스펙 (CHAIN-EXT-04)

**문서 ID:** CHAIN-EXT-04
**작성일:** 2026-02-08
**상태:** 완료
**Phase:** 23 (트랜잭션 타입 확장 설계)
**참조:** CHAIN-EXT-03 (58-contract-call-spec.md), CHAIN-EXT-01 (56-token-transfer-extension-spec.md), LOCK-MECH (33-time-lock-approval-mechanism.md), CORE-04 (27-chain-adapter-interface.md), CHAIN-SOL (31-solana-adapter-detail.md), KILL-AUTO-EVM (36-killswitch-autostop-evm.md), TX-PIPE (32-transaction-pipeline-api.md), CORE-02 (25-sqlite-schema.md), API-SPEC (37-rest-api-complete-spec.md), ENUM-MAP (45-enum-unified-mapping.md), 23-RESEARCH.md
**요구사항:** APPROVE-01 (ApproveRequest 독립 타입), APPROVE-02 (3가지 approve 전용 정책), APPROVE-03 (보안 테스트 시나리오)

---

## 1. 개요

### 1.1 목적

이 문서는 WAIaaS 트랜잭션 파이프라인에 **토큰 approve/delegate 관리(APPROVE)** 기능을 추가하는 정식 설계 스펙이다. 토큰 approve는 "자금 전송"이 아니라 **"전송 권한 위임"**이며, 일단 승인되면 spender가 에이전트 모르게 토큰을 가져갈 수 있다. 이 위험을 반영하여 approve를 ContractCall과 독립된 정책 카테고리로 관리한다.

CHAIN-EXT-03에서 크로스커팅으로 예비 정의한 APPROVED_SPENDERS(Stage 3 순서 8), APPROVE_AMOUNT_LIMIT(순서 9), APPROVE_TIER_OVERRIDE(순서 10) 정책의 상세 설계를 정식화하고, EVM ERC-20 approve와 Solana SPL ApproveChecked의 체인별 빌드 로직 및 보안 패턴을 정의한다.

### 1.2 요구사항 매핑

| 요구사항 | 커버리지 | 섹션 |
|---------|---------|------|
| APPROVE-01 | ApproveRequest 독립 인터페이스 + Zod 스키마 + TokenInfo 재사용 | 섹션 2 |
| APPROVE-02 | APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT + APPROVE_TIER_OVERRIDE 정책 | 섹션 5, 6, 7 |
| APPROVE-03 | 보안 위험 매트릭스 + 테스트 시나리오 15+ 개 | 섹션 9 |

### 1.3 핵심 설계 원칙

| # | 원칙 | 설명 | 적용 |
|---|------|------|------|
| 1 | **approve는 독립 정책 카테고리** | 전송(Transfer)과 권한 위임(Approve)은 근본적으로 다른 보안 모델. 별도 타입 + 별도 정책 | v0.6 핵심 결정 |
| 2 | **기본 전면 거부 (opt-in)** | APPROVED_SPENDERS 정책이 없으면 APPROVE 자체를 거부. 화이트리스트 미설정 = 기능 비활성화 | CHAIN-EXT-03 패턴 계승 |
| 3 | **무제한 approve 차단** | uint256.max / u64.max 수준의 무제한 approve는 기본 차단. block_unlimited=true 기본값 | 보안 최우선 |
| 4 | **Owner 승인 기본 강제** | APPROVE_TIER_OVERRIDE 미설정 시 기본 APPROVAL 티어 (Owner 승인 필수) | 보수적 기본값 |

### 1.4 v0.6 핵심 결정 인용

> "approve는 독립 정책 카테고리 (전송보다 위험한 권한 위임)" -- v0.6 Phase 23 핵심 결정

> "IChainAdapter는 저수준 실행 엔진으로 유지 (DeFi 지식은 Action Provider에 분리)" -- v0.6 핵심 결정

### 1.5 CHAIN-EXT-03 크로스커팅 참조

이 문서는 CHAIN-EXT-03(58-contract-call-spec.md)에서 예비 정의한 다음 확장 포인트를 정식화한다:

| CHAIN-EXT-03 항목 | 예비 정의 위치 | 이 문서 정식화 |
|-------------------|---------------|---------------|
| Stage 3 순서 8: APPROVED_SPENDERS 평가 | 섹션 6.3.2 (8단계) | 섹션 5 |
| Stage 3 순서 9: APPROVE_AMOUNT_LIMIT 평가 | 섹션 6.3.2 (9단계) | 섹션 6 |
| Stage 3 순서 10: APPROVE_TIER_OVERRIDE 평가 | 섹션 6.3.2 (10단계) | 섹션 7 |
| DB spender_address 감사 컬럼 | 섹션 7.3 | 섹션 8 |
| DB token_address 감사 컬럼 | 섹션 7.3 | 섹션 8 |
| REST API APPROVE variant | 섹션 6.1.1 (ApproveVariant) | 이 문서에서 확장 |
| 에러 코드 APPROVE_DISABLED, SPENDER_NOT_APPROVED, APPROVE_AMOUNT_EXCEEDED, UNLIMITED_APPROVE_BLOCKED | 섹션 8.3 (#4-7) | 섹션 5, 6 |
| 부록 A.1-A.3 예비 Zod 스키마 | 부록 A | 섹션 5, 6, 7 |

---

## 2. ApproveRequest 인터페이스

### 2.1 TypeScript 인터페이스

```typescript
// packages/core/src/interfaces/chain-adapter.types.ts (Phase 23 확장)

/**
 * 토큰 approve(권한 위임) 요청.
 * ContractCallRequest와 독립된 타입으로, "실행"이 아니라 "권한 위임"을 나타낸다.
 *
 * EVM: ERC-20 approve(spender, amount)
 * Solana: SPL ApproveChecked(delegate, amount, decimals)
 *
 * 보안 모델:
 * - approve가 완료되면 spender가 에이전트 모르게 토큰을 가져갈 수 있음
 * - 따라서 APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT + APPROVE_TIER_OVERRIDE 3중 정책 적용
 * - 기본 보안 티어: APPROVAL (Owner 승인 필수)
 */
interface ApproveRequest {
  /** 토큰 소유자 주소 (에이전트 지갑 공개키) */
  from: string

  /** 위임 대상 주소 (컨트랙트/EOA) -- approve를 받는 쪽 */
  spender: string

  /**
   * 토큰 정보 (CHAIN-EXT-01 TokenInfo 재사용).
   * address: 토큰 민트/컨트랙트 주소
   * decimals: 소수점 자릿수 (Solana ApproveChecked 온체인 검증에 필수)
   * symbol: 토큰 심볼 (UI/로그용)
   */
  token: TokenInfo

  /**
   * 승인 금액 (토큰 최소 단위, bigint).
   * 이 금액만큼 spender가 토큰을 전송할 수 있는 권한을 위임한다.
   *
   * 주의: amount의 의미가 TransferRequest와 다르다.
   * - TransferRequest.amount = "전송할 금액"
   * - ApproveRequest.amount = "위임할 한도"
   *
   * 0n으로 설정하면 기존 allowance를 revoke(취소)하는 효과.
   */
  amount: bigint
}
```

### 2.2 ContractCallRequest와의 분리 근거

ApproveRequest를 ContractCallRequest의 특수 케이스로 취급하지 않고 독립 타입으로 설계하는 이유:

| 관점 | ContractCallRequest | ApproveRequest | 분리 근거 |
|------|---------------------|----------------|----------|
| **목적** | 임의 스마트 컨트랙트 상태 변경 | 토큰 전송 권한을 타인에게 위임 | 시맨틱 근본 차이 |
| **위험 모델** | 호출 시점의 일회성 위험 | 승인 후 지속적 위험 (spender가 언제든 토큰 탈취 가능) | 지속적 위험 vs 일회성 위험 |
| **amount 의미** | value = 네이티브 토큰 첨부량 (대부분 0) | amount = 위임 한도 (보안 핵심 파라미터) | 파라미터 시맨틱 차이 |
| **정책 카테고리** | CONTRACT_WHITELIST + METHOD_WHITELIST | APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT + APPROVE_TIER_OVERRIDE | 독립 정책 체계 필요 |
| **기본 보안 티어** | APPROVAL (보수적) | APPROVAL (보수적) | 동일하지만 독립 결정 (APPROVE_TIER_OVERRIDE) |
| **체인별 빌드** | calldata / instruction | approve() / ApproveChecked | 빌드 로직 분리 |
| **감사 요소** | contract_address + method_signature | spender_address + token_address + amount | 감사 항목 차이 |

> **핵심:** approve는 "한 번의 실행"이 아니라 "지속적인 권한 위임"이다. 한번 승인하면 revoke하기 전까지 spender가 에이전트의 토큰을 가져갈 수 있다. 이 근본적 차이가 독립 타입과 독립 정책의 필요성을 결정한다.

### 2.3 Zod 스키마

```typescript
// packages/core/src/schemas/approve-request.schema.ts

import { z } from 'zod'
import { TokenInfoSchema } from './transfer-request'

/**
 * ApproveRequest Zod 스키마.
 * REST API 수준에서 CHAIN-EXT-03 섹션 6.1.1의 ApproveVariant로 수신 후,
 * 서비스 레이어에서 토큰 메타데이터 조회 -> TokenInfo 구성 -> 이 스키마로 변환.
 */
export const ApproveRequestSchema = z.object({
  /** 토큰 소유자 주소 (체인별 포맷: Solana Base58 / EVM 0x hex) */
  from: z.string().min(1, '토큰 소유자 주소는 필수'),

  /** 위임 대상 주소 (체인별 포맷) */
  spender: z.string().min(1, 'spender 주소는 필수'),

  /** 토큰 정보 (CHAIN-EXT-01 TokenInfoSchema 재사용) */
  token: TokenInfoSchema,

  /**
   * 승인 금액 (bigint, 토큰 최소 단위).
   * nonnegative: 0n은 revoke로 해석.
   */
  amount: z.bigint().nonnegative(),
})

export type ApproveRequest = z.infer<typeof ApproveRequestSchema>
```

### 2.4 ApproveRequest와 TokenInfo의 관계

```
┌──────────────────────────────────────────────────────────────┐
│ ApproveRequest                                                │
│                                                               │
│  from: string ──────── 에이전트 지갑 주소 (토큰 소유자)        │
│  spender: string ───── 위임 대상 주소 (approve 받는 쪽)       │
│  amount: bigint ────── 위임 한도 (토큰 최소 단위)             │
│                                                               │
│  token: TokenInfo ──┐                                         │
│                     │                                         │
│  ┌──────────────────▼────────────────────────┐                │
│  │ TokenInfo (CHAIN-EXT-01에서 정의)          │                │
│  │                                            │                │
│  │  address: string ── 토큰 민트/컨트랙트 주소 │                │
│  │  decimals: number ─ 소수점 자릿수           │                │
│  │  symbol: string ─── 토큰 심볼 (로그용)      │                │
│  └────────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────┘

[CHAIN-EXT-03 크로스커팅 참조]

REST API (POST /v1/transactions/send)
  └── type: 'APPROVE' + tokenMint + spender + amount
       └── 서비스 레이어: 온체인 토큰 메타데이터 조회
            └── ApproveRequest { from, spender, token: TokenInfo, amount }
                 └── Stage 3: APPROVED_SPENDERS → APPROVE_AMOUNT_LIMIT → APPROVE_TIER_OVERRIDE
                      └── Stage 5: buildApprove() (EVM approve / Solana ApproveChecked)
```

### 2.5 REST API ApproveVariant (CHAIN-EXT-03 정의 참조)

CHAIN-EXT-03 섹션 6.1.1에서 정의한 `TransactionSendRequestSchema`의 APPROVE variant:

```typescript
// CHAIN-EXT-03에서 이미 정의됨 -- 참조용 재기재
z.object({
  type: z.literal('APPROVE'),
  tokenMint: z.string(),       // 토큰 주소 (민트/컨트랙트)
  spender: z.string(),         // 위임 대상 주소
  amount: z.string().regex(/^\d+$/),  // 승인 금액 (문자열, bigint 변환)
})
```

서비스 레이어 변환 흐름:
1. REST API에서 `ApproveVariant` 수신
2. `tokenMint`로 온체인 토큰 메타데이터 조회 (`address`, `decimals`, `symbol`)
3. `TokenInfo` 객체 구성
4. `ApproveRequest` 생성 (`from` = 에이전트 주소, `amount` = BigInt(body.amount))
5. 파이프라인 Stage 1-6 진입

---

## 3. EVM ERC-20 approve 빌드 로직

### 3.1 IChainAdapter.buildApprove() 메서드

CHAIN-EXT-03 섹션 2.5에서 정의한 `buildApprove()` 독립 메서드의 상세 구현 설계:

```typescript
// IChainAdapter 확장 (CHAIN-EXT-03에서 메서드 시그니처 정의)
interface IChainAdapter {
  // ... 기존 14개 메서드 + buildContractCall() ...

  /**
   * 토큰 approve 트랜잭션을 빌드한다.
   *
   * EVM: ERC-20 approve(spender, amount) calldata 생성
   * Solana: SPL ApproveChecked instruction 생성
   *
   * @throws APPROVE_BUILD_FAILED -- 빌드 실패 (잘못된 주소, 토큰 계정 미존재 등)
   */
  buildApprove(request: ApproveRequest): Promise<UnsignedTransaction>
}
```

### 3.2 표준 ERC-20 approve(spender, amount) 호출

```typescript
// packages/adapters/evm/src/evm-adapter.ts -- buildApprove 구현 설계

import { encodeFunctionData, parseAbi } from 'viem'

/**
 * ERC-20 표준 approve ABI.
 * approve(address spender, uint256 amount) -> bool
 * selector: 0x095ea7b3
 */
const ERC20_APPROVE_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
])

/**
 * EVM ERC-20 approve 빌드 로직.
 *
 * 1. 현재 allowance 조회
 * 2. race condition 방지 (allowance > 0이면 approve(0) 먼저)
 * 3. approve(spender, newAmount) 실행
 */
async function buildEvmApprove(
  request: ApproveRequest,
  client: PublicClient,
): Promise<UnsignedTransaction | UnsignedTransaction[]> {

  const tokenAddress = request.token.address as `0x${string}`
  const spender = request.spender as `0x${string}`
  const owner = request.from as `0x${string}`

  // Step 1: 현재 allowance 조회 (eth_call)
  const currentAllowance = await client.readContract({
    address: tokenAddress,
    abi: ERC20_APPROVE_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  })

  // Step 2: approve(spender, amount) calldata 생성
  const approveCalldata = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [spender, request.amount],
  })

  // Step 3: race condition 방지 -- approve(0) -> approve(new) 2단계
  if (currentAllowance > 0n && request.amount > 0n) {
    // 기존 allowance가 있고 새 금액이 0이 아닌 경우:
    // approve(spender, 0) 먼저 실행하여 기존 allowance 초기화
    const resetCalldata = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [spender, 0n],
    })

    return [
      // Transaction 1: allowance 초기화
      {
        to: tokenAddress,
        data: resetCalldata,
        value: 0n,
        metadata: {
          type: 'APPROVE',
          subType: 'APPROVE_RESET',          // 감사 로그용 -- allowance 초기화 단계
          relatedSpender: spender,
          relatedToken: tokenAddress,
        },
      },
      // Transaction 2: 새 allowance 설정
      {
        to: tokenAddress,
        data: approveCalldata,
        value: 0n,
        metadata: {
          type: 'APPROVE',
          subType: 'APPROVE_SET',            // 감사 로그용 -- 새 allowance 설정 단계
          relatedSpender: spender,
          relatedToken: tokenAddress,
        },
      },
    ]
  }

  // 기존 allowance가 0이거나 revoke(amount=0)인 경우: 단일 트랜잭션
  return {
    to: tokenAddress,
    data: approveCalldata,
    value: 0n,
    metadata: {
      type: 'APPROVE',
      subType: request.amount === 0n ? 'APPROVE_REVOKE' : 'APPROVE_SET',
      relatedSpender: spender,
      relatedToken: tokenAddress,
    },
  }
}
```

### 3.3 Race Condition 방지 -- approve(0) -> approve(new) 2단계

ERC-20 approve에는 알려진 race condition 취약점이 존재한다:

```
시나리오: Alice가 Bob의 allowance를 100 -> 50으로 변경하려 할 때

1. Alice: approve(Bob, 50) 트랜잭션 제출
2. Bob이 mempool에서 이 트랜잭션을 감지
3. Bob: transferFrom(Alice, Bob, 100) 실행 (기존 allowance 100 사용)
4. Alice의 approve(Bob, 50) 확정
5. Bob: transferFrom(Alice, Bob, 50) 실행 (새 allowance 50 사용)
6. 결과: Bob이 총 150 탈취 (Alice 의도: 50만 허용)
```

**WAIaaS 완화 방안:**

| 단계 | 동작 | 설명 |
|------|------|------|
| 1 | `allowance(owner, spender)` 조회 | 현재 승인 금액 확인 |
| 2 | `currentAllowance > 0` 검증 | 기존 승인이 있는지 확인 |
| 3 | `approve(spender, 0)` 실행 | 기존 allowance를 0으로 초기화 |
| 4 | 트랜잭션 1 확인 대기 | 초기화가 온체인에 확정될 때까지 대기 |
| 5 | `approve(spender, newAmount)` 실행 | 새 allowance 설정 |

**결정:** 어댑터에서 자동 처리한다. 에이전트에게 race condition 보안 지식을 요구하지 않는다.

**2-step approve의 트랜잭션 연결:**

```typescript
// 2-step approve 시 metadata로 관련 트랜잭션 연결
interface ApproveTransactionMetadata {
  /** approve 타입 구분 */
  subType: 'APPROVE_RESET' | 'APPROVE_SET' | 'APPROVE_REVOKE'

  /**
   * 관련 트랜잭션 ID 참조.
   * APPROVE_RESET과 APPROVE_SET은 동일한 approve 흐름의 2단계.
   * approve_group_id로 그룹화하여 감사 추적.
   */
  approveGroupId?: string  // UUID v7 -- 2단계 approve 그룹 식별자

  /** spender 주소 (감사 로그용) */
  relatedSpender: string

  /** 토큰 주소 (감사 로그용) */
  relatedToken: string
}
```

### 3.4 무제한 approve 감지 (EVM)

```typescript
// 무제한 approve 감지 로직 (EVM)

/**
 * EVM uint256 최대값: 2^256 - 1
 * = 115792089237316195423570985008687907853269984665640564039457584007913129639935
 */
const MAX_UINT256 = 2n ** 256n - 1n

/**
 * 무제한 approve 감지 임계값 (기본값).
 * MAX_UINT256 / 2 이상이면 "무제한"으로 간주.
 *
 * 근거: DeFi 프로토콜은 관행적으로 MAX_UINT256을 사용하지만,
 * 일부는 MAX_UINT256 - 1 또는 유사한 큰 값을 사용할 수 있다.
 * 절반(~5.789 * 10^76) 이상이면 사실상 무제한으로 취급한다.
 */
const DEFAULT_EVM_UNLIMITED_THRESHOLD = MAX_UINT256 / 2n
// = 57896044618658097711785492504343953926634992332820282019728792003956564819967n

/**
 * 무제한 approve 감지.
 * @returns true이면 무제한 approve로 판단
 */
function isUnlimitedApproveEvm(
  amount: bigint,
  threshold?: bigint,
): boolean {
  const effectiveThreshold = threshold ?? DEFAULT_EVM_UNLIMITED_THRESHOLD
  return amount >= effectiveThreshold
}
```

### 3.5 gas 추정

```typescript
// EVM approve gas 추정

/**
 * ERC-20 approve의 gas 추정.
 * approve()는 상태 변경(allowance mapping 업데이트)이므로 ~46,000 gas 소요.
 * 안전 마진 20% 추가.
 */
async function estimateApproveGas(
  client: PublicClient,
  tokenAddress: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint,
): Promise<bigint> {
  const estimated = await client.estimateContractGas({
    address: tokenAddress,
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [spender, amount],
    account: owner,
  })

  // 안전 마진 20% (CHAIN-EXT-03 가스 추정 패턴과 동일)
  return (estimated * 120n) / 100n
}

// 2-step approve의 gas: 2배 추정 (approve(0) + approve(new))
// 실제 gas는 첫 번째 approve 확인 후 두 번째를 개별 추정
```

---

## 4. Solana SPL ApproveChecked 빌드 로직

### 4.1 getApproveCheckedInstruction() 호출

```typescript
// packages/adapters/solana/src/solana-adapter.ts -- buildApprove 구현 설계

import { getApproveCheckedInstruction } from '@solana-program/token'
import { findAssociatedTokenPda } from '@solana-program/associated-token-account'
import { getAccount } from '@solana-program/token'
import { address, type Address } from '@solana/kit'

/**
 * Solana SPL approve 빌드 로직.
 *
 * ApproveChecked를 사용하는 이유:
 * - 단순 Approve와 달리 decimals를 온체인에서 검증
 * - mint의 실제 decimals와 불일치하면 트랜잭션 실패 (안전 장치)
 * - CHAIN-EXT-01의 getTransferCheckedInstruction() 사용 패턴과 동일한 보안 원칙
 */
async function buildSolanaApprove(
  request: ApproveRequest,
  rpc: Rpc,
): Promise<UnsignedTransaction> {
  const owner = address(request.from)
  const delegate = address(request.spender)
  const mint = address(request.token.address)

  // 토큰 프로그램 결정 (Token Program vs Token-2022)
  // CHAIN-EXT-01에서 정의한 resolveTokenProgram() 재사용
  const tokenProgram = await resolveTokenProgram(rpc, mint)

  // ATA(Associated Token Account) 계산
  const [sourceAta] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram,
  })

  // 기존 delegate 조회 (단일 delegate 제약 경고용)
  const accountInfo = await getAccount(rpc, sourceAta)
  const previousDelegate = accountInfo.delegate
    ? {
        address: accountInfo.delegate.toString(),
        delegatedAmount: accountInfo.delegatedAmount,
      }
    : null

  // ApproveChecked instruction 생성
  const approveInstruction = getApproveCheckedInstruction({
    /** 에이전트의 ATA (위임 대상 토큰 계정) */
    account: sourceAta,

    /** 토큰 민트 주소 */
    mint,

    /** 위임받는 주소 (spender) */
    delegate,

    /** 토큰 계정 소유자 (에이전트) */
    owner,

    /** 승인 금액 (토큰 최소 단위) */
    amount: request.amount,

    /**
     * 소수점 자릿수 (온체인 검증).
     * mint의 실제 decimals와 일치해야 함.
     * 불일치 시 트랜잭션 실패 -> 잘못된 금액 approve 방지.
     */
    decimals: request.token.decimals,

    /** Token Program 주소 (Token Program 또는 Token-2022) */
    tokenProgram,
  })

  return {
    instruction: approveInstruction,
    metadata: {
      type: 'APPROVE',
      subType: request.amount === 0n ? 'APPROVE_REVOKE' : 'APPROVE_SET',
      relatedSpender: delegate.toString(),
      relatedToken: mint.toString(),
      // 기존 delegate 정보 (경고 메시지용)
      previousDelegate: previousDelegate
        ? {
            address: previousDelegate.address,
            delegatedAmount: previousDelegate.delegatedAmount.toString(),
          }
        : null,
    },
  }
}
```

### 4.2 단일 delegate 제약

SPL Token은 토큰 계정(ATA)당 **하나의 delegate만 허용**한다. 이는 EVM의 무제한 spender별 allowance와 근본적으로 다르다.

| 항목 | EVM (ERC-20) | Solana (SPL) |
|------|-------------|-------------|
| delegate 수 | **무제한** (spender별 독립 allowance) | **1개만** (계정당 하나의 delegate) |
| 새 approve | 기존 allowance와 독립 | 기존 delegate를 **덮어씀** |
| 영향 범위 | 해당 spender의 allowance만 변경 | 이전 delegate의 모든 권한 소멸 |

**경고 로직:**

```typescript
// approve 전 현재 delegate 조회 및 경고

/**
 * 단일 delegate 경고 흐름:
 *
 * 1. getAccount()로 현재 delegate 필드 조회
 * 2. delegate가 존재하면:
 *    a. 응답에 previousDelegate 정보 포함
 *    b. 감사 로그에 기존 delegate 교체 이벤트 기록
 *    c. 경고 수준: WARN (자동 차단하지 않음, 정보성)
 * 3. delegate가 없으면: 정상 진행
 */
interface ApproveResponseMetadata {
  /**
   * 기존 delegate 정보.
   * null이면 기존 delegate 없음.
   * 값이 있으면 이 approve로 인해 이전 delegate가 덮어써짐.
   */
  previousDelegate: {
    /** 이전 delegate 주소 */
    address: string
    /** 이전 delegate의 남은 위임 금액 (문자열) */
    delegatedAmount: string
  } | null

  /**
   * 경고 메시지 (previousDelegate가 있을 때).
   * 에이전트/Owner에게 기존 delegate 교체를 알린다.
   */
  warning?: string
}

// 경고 메시지 예시:
// "기존 delegate 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU의 남은 위임 금액
//  50000000 (50 USDC)이 새 delegate GfW4B...로 교체됩니다."
```

### 4.3 무제한 approve 감지 (Solana)

```typescript
// 무제한 approve 감지 로직 (Solana)

/**
 * Solana u64 최대값: 2^64 - 1
 * = 18,446,744,073,709,551,615
 */
const MAX_U64 = 2n ** 64n - 1n

/**
 * 무제한 approve 감지 임계값 (Solana 기본값).
 * MAX_U64 / 2 이상이면 "무제한"으로 간주.
 */
const DEFAULT_SOLANA_UNLIMITED_THRESHOLD = MAX_U64 / 2n
// = 9,223,372,036,854,775,807n

/**
 * 무제한 approve 감지 (Solana).
 * @returns true이면 무제한 approve로 판단
 */
function isUnlimitedApproveSolana(
  amount: bigint,
  threshold?: bigint,
): boolean {
  const effectiveThreshold = threshold ?? DEFAULT_SOLANA_UNLIMITED_THRESHOLD
  return amount >= effectiveThreshold
}
```

### 4.4 Revoke instruction (향후 확장 포인트)

```typescript
// Solana SPL Revoke -- delegate 제거
// Phase 23에서는 설계만 정의, 구현은 향후 확장

import { getRevokeInstruction } from '@solana-program/token'

/**
 * Revoke instruction: 현재 delegate를 제거한다.
 * ApproveRequest.amount = 0n으로 ApproveChecked를 호출해도 동일 효과이지만,
 * Revoke instruction이 더 명시적이고 가스 효율적이다.
 *
 * 향후 확장: REST API에 DELETE /v1/approvals/:token/:spender 엔드포인트 추가 가능.
 */
function buildRevokeInstruction(
  sourceAta: Address,
  owner: Address,
  tokenProgram: Address,
) {
  return getRevokeInstruction({
    account: sourceAta,
    owner,
    tokenProgram,
  })
}
```

### 4.5 Token-2022 approve 호환성

| 항목 | Token Program | Token-2022 | 영향 |
|------|-------------|------------|------|
| ApproveChecked | 지원 | **지원** | 기본 approve 호환 |
| CPI Guard 확장 | 해당 없음 | 감지 필요 | CPI Guard가 활성화된 토큰은 CPI 컨텍스트에서 approve 불가 |
| Permanent Delegate 확장 | 해당 없음 | 감지 필요 | 이미 permanent delegate가 설정된 토큰은 추가 delegate 불가 |
| Transfer Fee 확장 | 해당 없음 | 영향 없음 | approve에는 transfer fee 미적용 (전송 시 적용) |

**Token-2022 확장 감지 전략:**

```typescript
// Token-2022 approve 호환성 검사

/**
 * Token-2022 확장 중 approve에 영향을 주는 확장 감지.
 * CHAIN-EXT-01에서 정의한 detectToken2022Extensions() 패턴 재사용.
 *
 * 감지 대상:
 * - CpiGuard: CPI 컨텍스트에서 approve 차단 (WAIaaS는 직접 서명이므로 영향 없음, 경고만)
 * - PermanentDelegate: 이미 permanent delegate가 설정된 토큰 (경고)
 *
 * 전략: 감지 시 경고 로그 기록. 자동 차단하지 않음 (CHAIN-EXT-01과 동일 원칙).
 */
async function checkToken2022ApproveCompatibility(
  rpc: Rpc,
  mint: Address,
): Promise<{
  compatible: boolean
  warnings: string[]
}> {
  const extensions = await detectToken2022Extensions(rpc, mint)
  const warnings: string[] = []

  if (extensions.includes('CpiGuard')) {
    warnings.push('Token-2022 CPI Guard 확장이 감지되었습니다. CPI 컨텍스트에서 approve가 차단될 수 있습니다.')
  }

  if (extensions.includes('PermanentDelegate')) {
    warnings.push('Token-2022 Permanent Delegate 확장이 감지되었습니다. 토큰에 이미 영구 delegate가 설정되어 있을 수 있습니다.')
  }

  return {
    compatible: true,  // 경고만, 차단하지 않음
    warnings,
  }
}
```

---

## 5. APPROVED_SPENDERS 정책 규칙

### 5.1 정책 개요

| 항목 | 값 |
|------|-----|
| PolicyType | `'APPROVED_SPENDERS'` (Phase 23 추가, 총 8번째) |
| 적용 TransactionType | APPROVE, BATCH (개별 APPROVE instruction) |
| 기본 동작 | **정책 미설정 시 APPROVE 전면 거부** (APPROVE_DISABLED) |
| CHAIN-EXT-03 참조 | 섹션 6.3.2 8단계, 섹션 8.3 에러 코드 #4, #5, 부록 A.1 |

### 5.2 Zod 스키마

```typescript
// packages/core/src/schemas/policy-rules.schema.ts (Phase 23 확장)

/**
 * APPROVED_SPENDERS 정책 규칙 스키마.
 * 허용된 approve spender 주소 목록.
 *
 * 동작 규칙:
 * - APPROVED_SPENDERS 정책이 에이전트에 설정되지 않으면 → APPROVE 전면 거부 (APPROVE_DISABLED)
 * - allowed_spenders가 빈 배열이면 → 모든 spender 거부 (SPENDER_NOT_APPROVED)
 * - request.spender가 목록에 없으면 → 거부 (SPENDER_NOT_APPROVED)
 * - request.spender가 목록에 있으면 → ALLOW (후속 정책 평가 계속)
 *
 * 주소 비교: lowercase 정규화 (CHAIN-EXT-03 결정)
 */
export const ApprovedSpendersRuleSchema = z.object({
  /**
   * 허용된 spender 주소 목록.
   * 이 목록에 있는 주소만 approve 대상으로 허용.
   */
  allowed_spenders: z.array(z.object({
    /** spender 주소 (EVM: 0x hex lowercase, Solana: Base58) */
    address: z.string().min(1, 'spender 주소는 필수'),

    /** 사람이 읽을 수 있는 라벨 (감사 로그, Owner 알림용) */
    label: z.string().optional(),

    /**
     * 해당 spender가 허용된 체인.
     * 미지정 시 모든 체인에서 허용.
     * 지정 시 해당 체인에서만 허용.
     */
    chain: z.enum(['solana', 'ethereum', 'polygon', 'arbitrum']).optional(),
  })),
})

export type ApprovedSpendersRule = z.infer<typeof ApprovedSpendersRuleSchema>
```

### 5.3 평가 로직

```typescript
// DatabasePolicyEngine -- APPROVED_SPENDERS 평가 (Stage 3, 순서 8)

/**
 * APPROVED_SPENDERS 정책 평가.
 * CHAIN-EXT-03 섹션 6.3.2 8단계의 상세 구현.
 *
 * @param input PolicyEvaluationInput (type='APPROVE')
 * @param policies 에이전트별 + 글로벌 활성 정책 목록
 * @returns PolicyDecision { allowed, errorCode?, message? }
 */
function evaluateApprovedSpenders(
  input: PolicyEvaluationInput,
  policies: Policy[],
): PolicyDecision {
  // 1단계: APPROVED_SPENDERS 정책 존재 여부 확인
  const spenderPolicies = policies.filter(
    (p) => p.type === 'APPROVED_SPENDERS' && p.enabled
  )

  if (spenderPolicies.length === 0) {
    // 정책 미설정 → APPROVE 기능 자체를 거부
    return {
      allowed: false,
      errorCode: 'APPROVE_DISABLED',
      message: 'APPROVED_SPENDERS 정책이 설정되지 않아 APPROVE가 비활성화되어 있습니다.',
    }
  }

  // 2단계: 모든 APPROVED_SPENDERS 정책의 allowed_spenders를 병합
  // (에이전트별 + 글로벌 정책의 합집합)
  const allAllowedSpenders = spenderPolicies.flatMap(
    (p) => (p.rules as ApprovedSpendersRule).allowed_spenders
  )

  // 3단계: allowed_spenders가 비어있으면 거부
  if (allAllowedSpenders.length === 0) {
    return {
      allowed: false,
      errorCode: 'SPENDER_NOT_APPROVED',
      message: 'APPROVED_SPENDERS 정책의 허용 목록이 비어있습니다.',
    }
  }

  // 4단계: request.spender 주소 매칭
  const normalizedSpender = input.spender!.toLowerCase()

  const matchedSpender = allAllowedSpenders.find((s) => {
    const normalizedAllowed = s.address.toLowerCase()

    // 주소 일치 확인
    if (normalizedAllowed !== normalizedSpender) return false

    // chain 필드 교차 검증 (지정된 경우)
    if (s.chain && s.chain !== input.chain) return false

    return true
  })

  if (!matchedSpender) {
    return {
      allowed: false,
      errorCode: 'SPENDER_NOT_APPROVED',
      message: `spender ${input.spender}는 APPROVED_SPENDERS 허용 목록에 없습니다.`,
      details: {
        requestedSpender: input.spender,
        chain: input.chain,
      },
    }
  }

  // 5단계: 통과 → ALLOW (후속 정책 평가 계속)
  return {
    allowed: true,
    matchedSpender: {
      address: matchedSpender.address,
      label: matchedSpender.label,
    },
  }
}
```

### 5.4 세션 제약과의 교차 검증

CHAIN-EXT-03 섹션 6.2에서 정의한 `allowedSpenders` 세션 제약과 APPROVED_SPENDERS 정책은 **교집합**으로 동작한다:

```
세션 제약 (allowedSpenders)     정책 (APPROVED_SPENDERS)
        ┌──────────┐               ┌──────────┐
        │  A, B, C │               │  B, C, D │
        └────┬─────┘               └────┬─────┘
             │                          │
             └──────────┬───────────────┘
                        │
                   교집합: B, C
                        │
                   실제 허용 spender
```

- Stage 2 (SESSION VALIDATE): 세션의 `allowedSpenders`에 spender가 있는지 확인
- Stage 3 (POLICY CHECK): 정책의 `APPROVED_SPENDERS`에 spender가 있는지 확인
- 두 검증 모두 통과해야 approve 진행

### 5.5 설정 예시

```json
{
  "type": "APPROVED_SPENDERS",
  "wallet_id": "01JKABCDEF1234567890",
  "enabled": true,
  "priority": 80,
  "rules": {
    "allowed_spenders": [
      {
        "address": "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
        "label": "Uniswap V3 SwapRouter02",
        "chain": "ethereum"
      },
      {
        "address": "0x1111111254eeb25477b68fb85ed929f73a960582",
        "label": "1inch v5 AggregationRouter",
        "chain": "ethereum"
      },
      {
        "address": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
        "label": "Jupiter V6 Aggregator",
        "chain": "solana"
      }
    ]
  }
}
```

---

## 6. APPROVE_AMOUNT_LIMIT 정책 규칙

### 6.1 정책 개요

| 항목 | 값 |
|------|-----|
| PolicyType | `'APPROVE_AMOUNT_LIMIT'` (Phase 23 추가, 총 9번째) |
| 적용 TransactionType | APPROVE, BATCH (개별 APPROVE instruction) |
| 기본 동작 | 정책 미설정 시 금액 제한 없음 (APPROVED_SPENDERS가 이미 1차 방어) |
| CHAIN-EXT-03 참조 | 섹션 6.3.2 9단계, 섹션 8.3 에러 코드 #6, #7, 부록 A.2 |

### 6.2 Zod 스키마

```typescript
// packages/core/src/schemas/policy-rules.schema.ts (Phase 23 확장)

/**
 * APPROVE_AMOUNT_LIMIT 정책 규칙 스키마.
 * approve 최대 금액 제한 및 무제한 approve 차단.
 *
 * 평가 우선순위:
 * 1. 무제한 감지 (block_unlimited + unlimited_threshold)
 * 2. 최대 금액 초과 (max_approve_amount)
 *
 * 금액 단위: 토큰 최소 단위 (lamports, wei 등) 문자열.
 * Phase 24에서 USD 기준으로 전환 가능 (확장 포인트).
 */
export const ApproveAmountLimitRuleSchema = z.object({
  /**
   * 최대 승인 금액 (토큰 최소 단위, 문자열).
   * 이 금액 초과 approve 거부.
   * '0'이면 모든 approve 거부 (금액 기반 비활성화).
   *
   * 예: '1000000000' (= 1000 USDC, decimals=6)
   *
   * 주의: 토큰별로 최소 단위가 다르므로,
   * 동일한 '1000000000'이 USDC에서는 1000이지만
   * SOL에서는 1 SOL에 해당할 수 있다.
   * Phase 24 USD 통합 시 이 문제가 해소된다.
   */
  max_approve_amount: z.string().regex(/^\d+$/, '양의 정수 문자열이어야 합니다'),

  /**
   * 무제한 approve 감지 임계값 (토큰 최소 단위, 문자열).
   * approve 금액이 이 값 이상이면 "무제한"으로 간주하여 거부.
   *
   * 기본값 (체인별):
   * - EVM: (2^256 - 1) / 2 = ~5.789 * 10^76
   * - Solana: (2^64 - 1) / 2 = 9,223,372,036,854,775,807
   *
   * 미지정 시 체인별 기본값 적용.
   */
  unlimited_threshold: z.string().regex(/^\d+$/).optional(),

  /**
   * 무제한 approve 차단 여부.
   * true: unlimited_threshold 이상 금액 approve 거부 (UNLIMITED_APPROVE_BLOCKED)
   * false: 무제한 감지만 하고 차단하지 않음 (로그만 기록)
   *
   * 기본: true (보수적 -- 무제한 approve는 위험)
   */
  block_unlimited: z.boolean().default(true),
})

export type ApproveAmountLimitRule = z.infer<typeof ApproveAmountLimitRuleSchema>
```

### 6.3 평가 로직

```typescript
// DatabasePolicyEngine -- APPROVE_AMOUNT_LIMIT 평가 (Stage 3, 순서 9)

/**
 * APPROVE_AMOUNT_LIMIT 정책 평가.
 * CHAIN-EXT-03 섹션 6.3.2 9단계의 상세 구현.
 *
 * 평가 순서:
 * 1. block_unlimited 검사 (무제한 approve 감지 + 차단)
 * 2. max_approve_amount 검사 (최대 금액 초과)
 *
 * @param input PolicyEvaluationInput (type='APPROVE', amount=승인 금액)
 * @param policies 에이전트별 + 글로벌 활성 정책 목록
 * @returns PolicyDecision { allowed, errorCode?, message? }
 */
function evaluateApproveAmountLimit(
  input: PolicyEvaluationInput,
  policies: Policy[],
): PolicyDecision {
  // APPROVE_AMOUNT_LIMIT 정책 조회
  const amountPolicies = policies.filter(
    (p) => p.type === 'APPROVE_AMOUNT_LIMIT' && p.enabled
  )

  // 정책 미설정 시 금액 제한 없이 통과
  // (APPROVED_SPENDERS가 이미 1차 방어로 spender 검증 완료)
  if (amountPolicies.length === 0) {
    return { allowed: true }
  }

  // 가장 높은 우선순위(priority 낮은 값) 정책 적용
  const policy = amountPolicies.sort((a, b) => a.priority - b.priority)[0]
  const rules = policy.rules as ApproveAmountLimitRule

  const approveAmount = input.approveAmount!  // bigint (ApproveRequest.amount)

  // 1단계: 무제한 approve 감지 + 차단
  if (rules.block_unlimited) {
    const unlimitedThreshold = resolveUnlimitedThreshold(
      rules.unlimited_threshold,
      input.chain,
    )

    if (approveAmount >= unlimitedThreshold) {
      return {
        allowed: false,
        errorCode: 'UNLIMITED_APPROVE_BLOCKED',
        message: `무제한 approve가 감지되어 차단되었습니다. 금액: ${approveAmount}, 임계값: ${unlimitedThreshold}`,
        details: {
          amount: approveAmount.toString(),
          threshold: unlimitedThreshold.toString(),
          chain: input.chain,
        },
      }
    }
  }

  // 2단계: 최대 금액 초과 검사
  const maxAmount = BigInt(rules.max_approve_amount)

  if (approveAmount > maxAmount) {
    return {
      allowed: false,
      errorCode: 'APPROVE_AMOUNT_EXCEEDED',
      message: `approve 금액 ${approveAmount}이 최대 허용량 ${maxAmount}을 초과합니다.`,
      details: {
        amount: approveAmount.toString(),
        maxAllowed: rules.max_approve_amount,
      },
    }
  }

  // 3단계: 통과
  return { allowed: true }
}

/**
 * 체인별 무제한 approve 임계값 결정.
 * 사용자 지정 값이 있으면 사용, 없으면 체인별 기본값.
 */
function resolveUnlimitedThreshold(
  customThreshold: string | undefined,
  chain: ChainType,
): bigint {
  if (customThreshold) {
    return BigInt(customThreshold)
  }

  // 체인별 기본 임계값
  switch (chain) {
    case 'solana':
      return DEFAULT_SOLANA_UNLIMITED_THRESHOLD  // (2^64 - 1) / 2
    case 'ethereum':
    case 'polygon':
    case 'arbitrum':
    default:
      return DEFAULT_EVM_UNLIMITED_THRESHOLD     // (2^256 - 1) / 2
  }
}
```

### 6.4 Phase 24 USD 통합 확장 포인트

```
Phase 23 (현재)                          Phase 24 (향후)
┌─────────────────────────┐            ┌─────────────────────────────────┐
│ max_approve_amount:     │            │ max_approve_amount_usd: '1000' │
│ '1000000000' (토큰 단위)│  ──────>   │ (USD 기준, 토큰 무관)           │
│                         │            │                                 │
│ 문제: 토큰별 단위 다름  │            │ 가격 오라클이 토큰 → USD 변환   │
│ USDC 1000 vs SOL 1?    │            │ 모든 토큰에 동일 기준 적용       │
└─────────────────────────┘            └─────────────────────────────────┘
```

Phase 24에서 `max_approve_amount`를 USD 기준으로 전환할 때:
- 기존 토큰 단위 필드는 하위 호환을 위해 유지
- 새로운 `max_approve_amount_usd` 필드 추가
- USD 필드가 있으면 우선 적용, 없으면 토큰 단위 필드 사용
- 정책 엔진 앞단에 USD 변환 레이어 추가

### 6.5 설정 예시

```json
{
  "type": "APPROVE_AMOUNT_LIMIT",
  "wallet_id": "01JKABCDEF1234567890",
  "enabled": true,
  "priority": 90,
  "rules": {
    "max_approve_amount": "10000000000",
    "block_unlimited": true
  }
}
```

위 설정의 의미:
- USDC (decimals=6) 기준: 최대 10,000 USDC까지 approve 허용
- 무제한 approve (uint256.max 절반 이상): 자동 차단
- `unlimited_threshold` 미지정: 체인별 기본값 적용

---

## 7. APPROVE_TIER_OVERRIDE 정책 규칙

### 7.1 정책 개요

| 항목 | 값 |
|------|-----|
| PolicyType | `'APPROVE_TIER_OVERRIDE'` (Phase 23 추가, 총 10번째) |
| 적용 TransactionType | APPROVE |
| 기본 동작 | 정책 미설정 시 기본 **APPROVAL 티어** (Owner 승인 필수) |
| SPENDING_LIMIT과의 관계 | **독립** -- approve는 "권한 위임"이므로 전송 한도와 별개 |
| CHAIN-EXT-03 참조 | 섹션 6.3.2 10단계, 섹션 6.4 Stage 4, 부록 A.3 |

### 7.2 SPENDING_LIMIT과 독립인 이유

approve는 "자금을 전송"하는 것이 아니라 "전송할 수 있는 권한을 위임"하는 것이다. SPENDING_LIMIT은 실제 전송 금액을 기반으로 티어를 결정하는데, approve 금액을 SPENDING_LIMIT에 반영하면 다음 문제가 발생한다:

| 문제 | 설명 |
|------|------|
| 이중 계산 | approve 100 USDC → transferFrom 100 USDC 시 200 USDC로 계산되는 문제 |
| 단위 불일치 | SPENDING_LIMIT은 네이티브 토큰(SOL/ETH) 기준인데, approve는 임의 토큰 |
| 의미 혼동 | "한도 소모"가 아니라 "권한 위임". 실제 소모는 spender의 transferFrom 시점 |

따라서 CHAIN-EXT-03 섹션 6.3.2에서 `resolveEffectiveAmount(APPROVE) = 0n`으로 설정하고, APPROVE_TIER_OVERRIDE에서 독립적으로 티어를 결정한다.

### 7.3 Zod 스키마

```typescript
// packages/core/src/schemas/policy-rules.schema.ts (Phase 23 확장)

/**
 * APPROVE_TIER_OVERRIDE 정책 규칙 스키마.
 * approve 전용 보안 티어 결정.
 *
 * SPENDING_LIMIT과 독립적으로 적용:
 * - approve는 "권한 위임"이므로 전송 한도(SPENDING_LIMIT)와 별도 평가
 * - 기본 APPROVAL 티어 (Owner 승인 필수) -- 보수적 기본값
 *
 * 금액 기반 티어 오버라이드:
 * - amount_tiers가 설정되면 approve 금액에 따라 차등 티어 적용
 * - 소액 approve는 NOTIFY, 대액 approve는 APPROVAL 등
 */
export const ApproveTierOverrideRuleSchema = z.object({
  /**
   * approve의 기본 보안 티어.
   * amount_tiers에 매칭되지 않을 때 적용.
   * 기본: 'APPROVAL' (Owner 승인 필수)
   *
   * 권장: APPROVAL 유지. 소액만 amount_tiers로 낮추기.
   */
  default_tier: z.enum(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']).default('APPROVAL'),

  /**
   * 금액 기반 티어 오버라이드 (선택적).
   * approve 금액이 max_amount 이하이면 해당 tier 적용.
   * max_amount 오름차순 정렬 권장.
   *
   * 매칭 로직: amount <= max_amount인 첫 번째 항목의 tier 적용.
   * 매칭 없으면 default_tier 적용.
   *
   * 예시:
   * amount_tiers: [
   *   { max_amount: '100000000', tier: 'NOTIFY' },     // ≤ 100 USDC: NOTIFY
   *   { max_amount: '1000000000', tier: 'DELAY' },     // ≤ 1000 USDC: DELAY
   * ]
   * 1000 USDC 초과 → default_tier (APPROVAL)
   */
  amount_tiers: z.array(z.object({
    /**
     * 이 금액 이하면 해당 tier 적용 (토큰 최소 단위, 문자열).
     * Phase 24에서 USD 기준 전환 가능.
     */
    max_amount: z.string().regex(/^\d+$/),

    /** 적용할 보안 티어 */
    tier: z.enum(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']),
  })).optional(),
})

export type ApproveTierOverrideRule = z.infer<typeof ApproveTierOverrideRuleSchema>
```

### 7.4 평가 로직

```typescript
// DatabasePolicyEngine -- APPROVE_TIER_OVERRIDE 평가 (Stage 3, 순서 10)

/**
 * APPROVE_TIER_OVERRIDE 정책 평가.
 * CHAIN-EXT-03 섹션 6.3.2 10단계의 상세 구현.
 *
 * 이 정책은 DENY를 반환하지 않고, tier만 결정한다.
 * (DENY 판단은 8단계 APPROVED_SPENDERS와 9단계 APPROVE_AMOUNT_LIMIT에서 이미 완료)
 *
 * @param input PolicyEvaluationInput (type='APPROVE', approveAmount=승인 금액)
 * @param policies 에이전트별 + 글로벌 활성 정책 목록
 * @returns { tier: SecurityTier } -- 결정된 보안 티어
 */
function evaluateApproveTierOverride(
  input: PolicyEvaluationInput,
  policies: Policy[],
): { tier: SecurityTier } {
  // APPROVE_TIER_OVERRIDE 정책 조회
  const tierPolicies = policies.filter(
    (p) => p.type === 'APPROVE_TIER_OVERRIDE' && p.enabled
  )

  // 1단계: 정책 미설정 → 기본 APPROVAL 티어 (보수적)
  if (tierPolicies.length === 0) {
    return { tier: 'APPROVAL' }
  }

  // 가장 높은 우선순위 정책 적용
  const policy = tierPolicies.sort((a, b) => a.priority - b.priority)[0]
  const rules = policy.rules as ApproveTierOverrideRule

  const approveAmount = input.approveAmount!  // bigint

  // 2단계: amount_tiers 매칭
  if (rules.amount_tiers && rules.amount_tiers.length > 0) {
    // max_amount 오름차순으로 정렬
    const sortedTiers = [...rules.amount_tiers].sort(
      (a, b) => Number(BigInt(a.max_amount) - BigInt(b.max_amount))
    )

    // amount <= max_amount인 첫 번째 항목의 tier 적용
    for (const tierRule of sortedTiers) {
      if (approveAmount <= BigInt(tierRule.max_amount)) {
        return { tier: tierRule.tier }
      }
    }
  }

  // 3단계: 매칭 없으면 default_tier 적용
  return { tier: rules.default_tier }
}
```

### 7.5 Stage 4 (TIER CLASSIFY)와의 연계

CHAIN-EXT-03 섹션 6.4에서 정의한 `classifyTier()` 함수와의 연계:

```typescript
// CHAIN-EXT-03 섹션 6.4에서 정의 (참조)
function classifyTier(
  input: PolicyEvaluationInput,
  policyDecision: PolicyDecision,
): TransactionTier {
  // 정책 엔진이 이미 tier를 결정한 경우 (APPROVE_TIER_OVERRIDE 등)
  if (policyDecision.tier) return policyDecision.tier
  // ...
}
```

Stage 3에서 `evaluateApproveTierOverride()`가 반환한 `tier`가 `PolicyDecision.tier`에 설정되면, Stage 4에서는 그대로 사용한다. SPENDING_LIMIT 평가를 건너뛴다 (APPROVE의 `resolveEffectiveAmount() = 0n`).

### 7.6 설정 예시

```json
{
  "type": "APPROVE_TIER_OVERRIDE",
  "wallet_id": "01JKABCDEF1234567890",
  "enabled": true,
  "priority": 100,
  "rules": {
    "default_tier": "APPROVAL",
    "amount_tiers": [
      {
        "max_amount": "100000000",
        "tier": "NOTIFY"
      },
      {
        "max_amount": "1000000000",
        "tier": "DELAY"
      }
    ]
  }
}
```

위 설정의 의미 (USDC decimals=6 기준):

| approve 금액 | 적용 티어 | 동작 |
|-------------|----------|------|
| 0 ~ 100 USDC | NOTIFY | 알림 후 자동 실행 |
| 101 ~ 1,000 USDC | DELAY | 15분 쿨다운 후 자동 실행 (Owner 취소 가능) |
| 1,001 USDC 이상 | APPROVAL | Owner SIWS/SIWE 서명 승인 필수 |

---

## 8. 감사 로그 확장

### 8.1 transactions 테이블 활용

CHAIN-EXT-03 섹션 7에서 정의한 감사 컬럼을 APPROVE 타입에 활용한다:

| 컬럼 | APPROVE 시 값 | 설명 |
|------|-------------|------|
| `type` | `'APPROVE'` | TransactionType |
| `contract_address` | 토큰 민트/컨트랙트 주소 | EVM: ERC-20 컨트랙트, Solana: 토큰 민트 |
| `method_signature` | EVM: `'approve(address,uint256)'`, Solana: `'ApproveChecked'` | 호출 함수 식별 |
| `token_address` | 토큰 주소 (contract_address와 동일) | approve 대상 토큰 |
| `spender_address` | spender/delegate 주소 | 위임 대상 |
| `amount` | 승인 금액 (토큰 최소 단위 문자열) | 위임 한도 |
| `to_address` | spender 주소 (EVM), delegate 주소 (Solana) | approve의 "수신자" = spender |

### 8.2 2-step approve 감사 (EVM race condition 방지)

EVM에서 race condition 방지를 위한 2-step approve 시 두 트랜잭션을 연결하여 감사한다:

```typescript
// 2-step approve 감사 로그 구조

// Transaction 1: approve(spender, 0) -- allowance 초기화
{
  type: 'APPROVE',
  method_signature: 'approve(address,uint256)',
  spender_address: '0x68b3...Fc45',
  token_address: '0xA0b8...eB48',
  amount: '0',                          // 초기화
  metadata: {
    subType: 'APPROVE_RESET',
    approveGroupId: '01JK...WXYZ',      // 그룹 식별자
    previousAllowance: '50000000',       // 이전 allowance
  },
}

// Transaction 2: approve(spender, newAmount) -- 새 allowance 설정
{
  type: 'APPROVE',
  method_signature: 'approve(address,uint256)',
  spender_address: '0x68b3...Fc45',
  token_address: '0xA0b8...eB48',
  amount: '100000000',                   // 새 승인 금액
  metadata: {
    subType: 'APPROVE_SET',
    approveGroupId: '01JK...WXYZ',      // 동일 그룹 식별자
  },
}
```

### 8.3 Solana 단일 delegate 교체 감사

Solana에서 기존 delegate가 있는 상태에서 새 approve를 실행할 때:

```typescript
// Solana delegate 교체 감사 로그

{
  type: 'APPROVE',
  method_signature: 'ApproveChecked',
  spender_address: 'GfW4B...AsU',        // 새 delegate
  token_address: 'EPjFW...Dt1v',          // USDC mint
  amount: '200000000',                    // 200 USDC
  metadata: {
    subType: 'APPROVE_SET',
    previousDelegate: {
      address: '7xKXt...gAsU',            // 이전 delegate
      delegatedAmount: '50000000',         // 이전 남은 위임 금액 (50 USDC)
    },
    warning: '기존 delegate 7xKXt...gAsU의 남은 위임 금액 50000000이 새 delegate GfW4B...AsU로 교체됩니다.',
  },
}
```

### 8.4 approve 이력 추적 쿼리 예시

```sql
-- 특정 에이전트의 모든 approve 이력 조회
SELECT
  id,
  token_address,
  spender_address,
  amount,
  status,
  method_signature,
  created_at,
  metadata
FROM transactions
WHERE wallet_id = ?
  AND type = 'APPROVE'
ORDER BY created_at DESC;

-- 특정 spender에 대한 현재 유효 approve 조회
-- (가장 최근 성공한 approve의 금액)
SELECT
  token_address,
  spender_address,
  amount,
  created_at
FROM transactions
WHERE wallet_id = ?
  AND type = 'APPROVE'
  AND spender_address = ?
  AND status = 'CONFIRMED'
ORDER BY created_at DESC
LIMIT 1;

-- 2-step approve 그룹 조회 (EVM race condition 방지)
-- metadata JSON에서 approveGroupId로 그룹화
SELECT *
FROM transactions
WHERE type = 'APPROVE'
  AND json_extract(metadata, '$.approveGroupId') = ?
ORDER BY created_at ASC;

-- 무제한 approve 시도 이력 (차단된 것 포함)
-- status = 'REJECTED'이고 error에 UNLIMITED_APPROVE_BLOCKED 포함
SELECT *
FROM transactions
WHERE type = 'APPROVE'
  AND status = 'REJECTED'
  AND error LIKE '%UNLIMITED_APPROVE_BLOCKED%'
ORDER BY created_at DESC;
```

### 8.5 Revoke 이벤트 감사 (향후 확장)

향후 revoke 기능이 구현되면 다음과 같이 감사한다:

```typescript
// Revoke 감사 로그 (향후 확장)
{
  type: 'APPROVE',
  method_signature: 'approve(address,uint256)',  // EVM: approve(spender, 0)
  // 또는
  method_signature: 'Revoke',                     // Solana: Revoke instruction
  spender_address: '0x68b3...Fc45',
  token_address: '0xA0b8...eB48',
  amount: '0',                                    // revoke = amount 0
  metadata: {
    subType: 'APPROVE_REVOKE',
    revokedAllowance: '100000000',                // revoke 전 잔여 allowance
  },
}
```

---

## 9. 보안 위험 매트릭스 + 테스트 시나리오

### 9.1 APPROVE 보안 위험 매트릭스

23-RESEARCH.md에서 식별한 approve 위험을 상세화한다:

| # | 위험 | 심각도 | 공격 벡터 | WAIaaS 완화 방안 | 관련 정책 |
|---|------|--------|----------|----------------|----------|
| 1 | **무제한 approve** (uint256.max / u64.max) | CRITICAL | DeFi 관행적 무제한 승인 → spender가 전 잔액 탈취 가능 | APPROVE_AMOUNT_LIMIT + block_unlimited=true | 섹션 6 |
| 2 | **악의적 spender에게 approve** | CRITICAL | 피싱/오류로 악의적 주소에 approve | APPROVED_SPENDERS 화이트리스트 (기본 전면 거부) | 섹션 5 |
| 3 | **EVM approve race condition** | HIGH | allowance 변경 시 이전 값과 새 값 모두 소비 가능 | 어댑터 자동 approve(0) -> approve(new) 2단계 | 섹션 3.3 |
| 4 | **잔여 allowance 미관리** | MEDIUM | approve 후 미사용 allowance가 지속적으로 spender에게 열려 있음 | 감사 로그 기록 + revoke 가이드 (향후 확장) | 섹션 8 |
| 5 | **approve 후 즉시 탈취** | HIGH | approve 즉시 spender가 transferFrom 실행 | APPROVE_TIER_OVERRIDE: 기본 APPROVAL (Owner 승인 후 실행) | 섹션 7 |

### 9.2 테스트 레벨

CHAIN-EXT-03 섹션 9의 테스트 레벨 구조를 계승한다:

| 레벨 | 범위 | APPROVE 테스트 초점 |
|------|------|-------------------|
| Level 1 (Unit) | Zod 스키마, 무제한 감지, 정책 평가 로직 | ApproveRequestSchema, isUnlimited, evaluate* |
| Level 2 (Integration) | 파이프라인 approve 흐름 (Mock Adapter) | Stage 1 → 3 → 4 → 5 전체 흐름 |
| Level 3 (Chain Mock) | EVM Hardhat ERC-20 + Solana Bankrun SPL | 실제 approve/allowance 동작 |
| Level 4 (Security) | 무제한 차단, 비허가 spender, race condition | 보안 경계 조건 검증 |

### 9.3 Mock 경계

```
┌─────────────────────────────────────────────────────────┐
│ Level 1-2: Mock Boundary                                 │
│                                                          │
│  ApproveRequest                                          │
│       │                                                  │
│       ▼                                                  │
│  [DatabasePolicyEngine.evaluate()]  ◀── Mock Policy DB   │
│       │                                                  │
│       ▼                                                  │
│  [IChainAdapter.buildApprove()]     ◀── Mock Adapter     │
│       │                                 (반환값 검증)    │
│       ▼                                                  │
│  UnsignedTransaction (검증)                              │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Level 3: Chain Mock Boundary                             │
│                                                          │
│  [EVM Hardhat]                [Solana Bankrun]           │
│  - ERC-20 배포               - SPL Token 민트 생성       │
│  - approve(spender, amount)  - ApproveChecked            │
│  - allowance() 조회          - getAccount() delegate 조회│
│  - approve(spender, 0)       - Revoke                    │
│  - transferFrom 검증         - 단일 delegate 검증        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 9.4 테스트 시나리오

#### Level 1: Unit 테스트 (5개)

| # | 시나리오 | 입력 | 기대 결과 | 검증 항목 |
|---|---------|------|----------|----------|
| U1 | ApproveRequest Zod 유효성 -- 정상 | `{ from, spender, token: TokenInfo, amount: 100n }` | 파싱 성공 | 모든 필드 올바르게 파싱 |
| U2 | ApproveRequest Zod -- spender 누락 | `{ from, token, amount }` (spender 없음) | 파싱 실패 | `spender 주소는 필수` 에러 |
| U3 | 무제한 감지 -- EVM MAX_UINT256 | `amount = 2n**256n - 1n` | `isUnlimited = true` | DEFAULT_EVM_UNLIMITED_THRESHOLD 이상 |
| U4 | 무제한 감지 -- Solana MAX_U64 | `amount = 2n**64n - 1n` | `isUnlimited = true` | DEFAULT_SOLANA_UNLIMITED_THRESHOLD 이상 |
| U5 | 무제한 감지 -- 임계값 미만 | `amount = 100n` | `isUnlimited = false` | 정상 금액은 무제한 아님 |

#### Level 1: 정책 평가 Unit 테스트 (5개)

| # | 시나리오 | 정책 설정 | 입력 | 기대 결과 |
|---|---------|----------|------|----------|
| P1 | APPROVED_SPENDERS 미설정 | 정책 없음 | APPROVE any spender | DENY (APPROVE_DISABLED) |
| P2 | APPROVED_SPENDERS -- 허용 spender | `allowed_spenders: [{ address: '0xABC' }]` | spender='0xABC' | ALLOW |
| P3 | APPROVED_SPENDERS -- 비허가 spender | `allowed_spenders: [{ address: '0xABC' }]` | spender='0xDEF' | DENY (SPENDER_NOT_APPROVED) |
| P4 | APPROVE_AMOUNT_LIMIT -- 금액 초과 | `max_approve_amount: '1000'` | amount=1500n | DENY (APPROVE_AMOUNT_EXCEEDED) |
| P5 | APPROVE_TIER_OVERRIDE -- amount_tiers 매칭 | `amount_tiers: [{ max_amount: '100', tier: 'NOTIFY' }]` | amount=50n | tier='NOTIFY' |

#### Level 2: Integration 테스트 (3개)

| # | 시나리오 | 설명 | 기대 결과 |
|---|---------|------|----------|
| I1 | EVM approve 전체 파이프라인 | Stage 1 → 3 (정책 3종 통과) → 4 (TIER_OVERRIDE) → 5 (buildApprove) | UnsignedTransaction 생성, 올바른 calldata |
| I2 | Solana approve 전체 파이프라인 | Stage 1 → 3 → 4 → 5 (ApproveChecked instruction) | ApproveChecked instruction 생성, decimals 검증 |
| I3 | 정책 위반 파이프라인 종료 | Stage 1 → 3 (APPROVED_SPENDERS 거부) | 403 SPENDER_NOT_APPROVED, Stage 4-5 미진입 |

#### Level 3: Chain Mock 테스트 (3개)

| # | 시나리오 | 환경 | 기대 결과 |
|---|---------|------|----------|
| C1 | EVM ERC-20 approve + allowance 확인 | Hardhat local | approve 후 allowance() == amount |
| C2 | EVM 2-step approve (race condition 방지) | Hardhat local | approve(0) 후 allowance==0, 이후 approve(new) 후 allowance==new |
| C3 | Solana SPL ApproveChecked + delegate 확인 | Bankrun | approve 후 getAccount().delegate == spender, delegatedAmount == amount |

#### Level 4: Security 테스트 (6개)

| # | 시나리오 | 공격 벡터 | 기대 방어 | 관련 위험 |
|---|---------|----------|----------|----------|
| S1 | 무제한 approve 차단 (EVM) | `amount = 2n**256n - 1n` + `block_unlimited=true` | DENY (UNLIMITED_APPROVE_BLOCKED) | 위험 #1 |
| S2 | 무제한 approve 차단 (Solana) | `amount = 2n**64n - 1n` + `block_unlimited=true` | DENY (UNLIMITED_APPROVE_BLOCKED) | 위험 #1 |
| S3 | 비허가 spender approve 시도 | spender가 APPROVED_SPENDERS에 없음 | DENY (SPENDER_NOT_APPROVED) | 위험 #2 |
| S4 | EVM race condition 자동 방지 | 기존 allowance > 0에서 새 approve | approve(0) 자동 삽입 확인 | 위험 #3 |
| S5 | Solana 단일 delegate 경고 | 기존 delegate 있는 상태에서 새 approve | previousDelegate 정보 + 경고 메시지 포함 | 위험 #4 관련 |
| S6 | APPROVE_DISABLED -- 정책 미설정 전면 거부 | APPROVED_SPENDERS 정책 없음 | DENY (APPROVE_DISABLED), 어떤 spender/금액이든 거부 | 위험 #2 |

### 9.5 테스트 시나리오 요약

| 레벨 | 시나리오 수 | 범위 |
|------|-----------|------|
| Level 1 Unit (Zod + 무제한 감지) | 5 | 스키마 검증, 임계값 계산 |
| Level 1 Unit (정책 평가) | 5 | APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE |
| Level 2 Integration | 3 | 파이프라인 전체 흐름 |
| Level 3 Chain Mock | 3 | EVM Hardhat, Solana Bankrun |
| Level 4 Security | 6 | 무제한 차단, 비허가 spender, race condition, 단일 delegate |
| **합계** | **22** | |

### 9.6 테스트 데이터 상수

```typescript
// packages/core/test/fixtures/approve-test-data.ts

/** EVM 테스트 상수 */
export const EVM_APPROVE_TEST = {
  /** 테스트 ERC-20 컨트랙트 (Hardhat 배포) */
  tokenAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  /** 테스트 spender (Uniswap Router 모의) */
  spenderAddress: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45',
  /** 비허가 spender (화이트리스트 미등록) */
  unknownSpender: '0x0000000000000000000000000000000000000001',
  /** 정상 approve 금액 (100 USDC = 100_000_000) */
  normalAmount: 100_000_000n,
  /** 무제한 approve (uint256.max) */
  unlimitedAmount: 2n ** 256n - 1n,
  /** ERC-20 approve selector */
  approveSelector: '0x095ea7b3',
  /** ERC-20 decimals */
  decimals: 6,
  symbol: 'USDC',
} as const

/** Solana 테스트 상수 */
export const SOLANA_APPROVE_TEST = {
  /** 테스트 SPL Token 민트 (Bankrun 생성) */
  mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  /** 테스트 delegate (Jupiter 모의) */
  delegateAddress: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  /** 비허가 delegate (화이트리스트 미등록) */
  unknownDelegate: '11111111111111111111111111111111',
  /** 정상 approve 금액 (100 USDC = 100_000_000) */
  normalAmount: 100_000_000n,
  /** 무제한 approve (u64.max) */
  unlimitedAmount: 2n ** 64n - 1n,
  /** SPL Token decimals */
  decimals: 6,
  symbol: 'USDC',
} as const

/** 정책 테스트 fixture */
export const APPROVE_POLICY_FIXTURE = {
  /** APPROVED_SPENDERS 정책 -- EVM */
  approvedSpendersEvm: {
    type: 'APPROVED_SPENDERS' as const,
    enabled: true,
    priority: 80,
    rules: {
      allowed_spenders: [
        {
          address: EVM_APPROVE_TEST.spenderAddress,
          label: 'Uniswap V3 SwapRouter02',
          chain: 'ethereum' as const,
        },
      ],
    },
  },
  /** APPROVE_AMOUNT_LIMIT 정책 -- 10,000 USDC 한도 */
  amountLimit: {
    type: 'APPROVE_AMOUNT_LIMIT' as const,
    enabled: true,
    priority: 90,
    rules: {
      max_approve_amount: '10000000000',
      block_unlimited: true,
    },
  },
  /** APPROVE_TIER_OVERRIDE 정책 -- 3단계 */
  tierOverride: {
    type: 'APPROVE_TIER_OVERRIDE' as const,
    enabled: true,
    priority: 100,
    rules: {
      default_tier: 'APPROVAL' as const,
      amount_tiers: [
        { max_amount: '100000000', tier: 'NOTIFY' as const },
        { max_amount: '1000000000', tier: 'DELAY' as const },
      ],
    },
  },
} as const
```

---

## 부록 A: PolicyType 누적 확장 현황

CHAIN-EXT-03에서 정의한 PolicyType 10개의 전체 목록에서 이 문서가 정식화한 항목을 명시한다:

| # | PolicyType | 도입 Phase | 설명 | 적용 TransactionType | 정식화 문서 |
|---|-----------|-----------|------|---------------------|------------|
| 1 | SPENDING_LIMIT | Phase 8 | 금액 기반 4-티어 분류 | TRANSFER, CONTRACT_CALL(value), BATCH(합산) | LOCK-MECH (33) |
| 2 | WHITELIST | Phase 8 | 수신자 주소 화이트리스트 | TRANSFER, TOKEN_TRANSFER, BATCH(개별) | LOCK-MECH (33) |
| 3 | TIME_RESTRICTION | Phase 8 | 시간대 기반 거래 제한 | 전체 | LOCK-MECH (33) |
| 4 | RATE_LIMIT | Phase 8 | 빈도 제한 | 전체 | LOCK-MECH (33) |
| 5 | ALLOWED_TOKENS | Phase 22 | 허용 토큰 목록 | TOKEN_TRANSFER, APPROVE, BATCH(개별) | CHAIN-EXT-01 (56) |
| 6 | CONTRACT_WHITELIST | Phase 23 | 허용 컨트랙트 목록 | CONTRACT_CALL, BATCH(개별) | CHAIN-EXT-03 (58) |
| 7 | METHOD_WHITELIST | Phase 23 | 허용 메서드 목록 (EVM) | CONTRACT_CALL(EVM), BATCH(개별) | CHAIN-EXT-03 (58) |
| **8** | **APPROVED_SPENDERS** | **Phase 23** | **허용 approve spender 목록** | **APPROVE, BATCH(개별)** | **CHAIN-EXT-04 (59) -- 이 문서** |
| **9** | **APPROVE_AMOUNT_LIMIT** | **Phase 23** | **approve 최대 금액 제한** | **APPROVE, BATCH(개별)** | **CHAIN-EXT-04 (59) -- 이 문서** |
| **10** | **APPROVE_TIER_OVERRIDE** | **Phase 23** | **approve 독립 보안 티어** | **APPROVE** | **CHAIN-EXT-04 (59) -- 이 문서** |

---

## 부록 B: 23-03 (배치 트랜잭션) 확장 포인트

이 문서에서 23-03(CHAIN-EXT-05)이 참조할 APPROVE 관련 확장 포인트:

| 항목 | 이 문서 정의 | 23-03 확장 내용 |
|------|-----------|---------------|
| BATCH 내 APPROVE instruction | ApproveRequest 타입 정의 완료 | 배치 내 개별 APPROVE instruction에 APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT 정책 각각 적용 |
| APPROVE_TIER_OVERRIDE와 BATCH | APPROVE에만 적용 (BATCH에는 미적용) | 배치 티어는 합산 금액으로 결정, APPROVE_TIER_OVERRIDE는 배치 전체에 미적용 |
| 2-step approve와 BATCH | EVM 2-step approve는 단일 APPROVE instruction | 배치 내 EVM APPROVE 시 2-step 자동 처리 여부는 23-03에서 결정 |

---

## 부록 C: 용어 정의

| 용어 | 정의 |
|------|------|
| approve | 토큰 소유자가 spender에게 특정 금액만큼 토큰을 전송할 수 있는 권한을 위임하는 행위 |
| allowance | approve에 의해 spender에게 부여된 현재 남은 위임 금액 |
| spender (EVM) | approve를 받아 토큰을 전송할 수 있는 주소. transferFrom()의 호출자 |
| delegate (Solana) | SPL Token에서 approve를 받아 토큰을 전송할 수 있는 주소. EVM의 spender와 동일 개념 |
| revoke | approve를 취소하여 spender/delegate의 토큰 전송 권한을 제거하는 행위 |
| race condition | EVM ERC-20 approve에서 allowance 변경 시 이전 값과 새 값 모두 소비될 수 있는 취약점 |
| ApproveChecked | Solana SPL Token의 approve instruction. decimals를 온체인에서 검증하는 안전한 버전 |
| unlimited approve | uint256.max (EVM) 또는 u64.max (Solana) 수준의 매우 큰 금액으로 설정한 approve |
| block_unlimited | APPROVE_AMOUNT_LIMIT 정책에서 무제한 approve를 자동 차단하는 설정 |
| APPROVE_DISABLED | APPROVED_SPENDERS 정책이 미설정되어 APPROVE 기능이 비활성화된 상태의 에러 코드 |
| opt-in | 기본 비활성 상태에서 명시적 설정으로 활성화하는 보안 패턴 |
