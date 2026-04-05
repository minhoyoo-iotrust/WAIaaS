# Phase 22: 토큰 확장 설계 - Research

**Researched:** 2026-02-07
**Domain:** SPL/ERC-20 토큰 전송, 자산 조회, 토큰 정책 설계
**Confidence:** HIGH

## Summary

Phase 22는 현재 네이티브 토큰(SOL/ETH) 전송에 한정된 IChainAdapter와 트랜잭션 파이프라인을 SPL/ERC-20 토큰까지 확장하는 설계 단계이다. 이 연구는 기존 v0.2 설계 문서 8개(CORE-04, CHAIN-SOL, TX-PIPE, LOCK-MECH, CORE-02, API-SPEC, ENUM-MAP, KILL-AUTO-EVM)를 분석하여 확장에 필요한 변경점, 기술 패턴, 잠재적 함정을 식별했다.

핵심 발견: v0.2 설계는 토큰 확장을 명시적으로 예비해두었다. TransferRequest에 이미 type/tokenMint 필드가 REST API Zod 스키마에 존재하고, SolanaAdapter에 SPL 전송 빌드 로직(buildSplTokenTransfer)이 설계 수준으로 작성되어 있으며, transactions 테이블에 type='TOKEN_TRANSFER'가 예약되어 있다. 따라서 Phase 22는 "신규 설계"보다는 "기존 예비 설계를 정식화하고 누락된 부분(EVM, 정책, 자산 조회, 수수료 추정, 테스트)을 채우는" 작업이다.

**Primary recommendation:** 기존 v0.2 예비 설계를 그대로 활용하되, (1) TransferRequest의 IChainAdapter 수준 타입 확장, (2) ALLOWED_TOKENS 정책 타입 추가, (3) getAssets() 인터페이스 복원, (4) EVM ERC-20 빌드 로직 설계, (5) Token-2022 호환성 결정을 추가로 확정해야 한다.

---

## Standard Stack

이 Phase는 설계 마일스톤이므로 라이브러리 "선택"이 아니라 기존 확정된 스택 위에서 토큰 관련 확장 모듈을 식별하는 것이 핵심이다.

### Core (이미 확정된 스택)

| Library | Version | Purpose | 확장 시 사용할 모듈 |
|---------|---------|---------|-------------------|
| `@solana/kit` | latest (구 @solana/web3.js 2.x) | Solana RPC 클라이언트 | `rpc.getTokenAccountsByOwner()`, `rpc.getAccountInfo()` |
| `@solana-program/token` | latest | SPL Token Program instruction | `getTransferInstruction()`, `getTransferCheckedInstruction()` |
| `@solana-program/associated-token-account` | latest | ATA 관리 | `findAssociatedTokenPda()`, `getCreateAssociatedTokenAccountInstruction()` |
| `@solana-program/token-2022` | latest | Token-2022 Program instruction | `getTransferCheckedInstruction()` (Token-2022 variant) |
| `viem` | 2.45.x+ | EVM 클라이언트 | `readContract()`, `simulateContract()`, `estimateGas()` |
| `drizzle-orm` | 0.45.x | DB ORM | policies 테이블 확장, 신규 테이블 없음 |
| `zod` | latest | Schema validation | TransferRequest 확장, AssetInfo 스키마 |

### Supporting (확장에 필요한 추가 지식)

| Library/Concept | Purpose | When to Use |
|----------------|---------|-------------|
| `@solana-program/compute-budget` | Compute Unit 조정 | SPL 전송 시 CU 한도 상향 필요 (200 -> 400+) |
| ERC-20 ABI (표준) | ERC-20 인터페이스 | `transfer(address,uint256)`, `balanceOf(address)`, `decimals()`, `symbol()` |
| `getMinimumBalanceForRentExemption` RPC | ATA 생성 비용 동적 조회 | 수수료 추정 정확도 향상 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `getTransferInstruction` (Token Program) | `getTransferCheckedInstruction` | Checked 버전은 decimals 검증 포함 -- 안전하지만 decimals 사전 조회 필요. **권장: transferChecked 사용** |
| 직접 ATA PDA 계산 | `findAssociatedTokenPda` | 라이브러리 함수가 정확한 PDA derivation 보장. 직접 계산 금지 |
| viem `readContract` 개별 호출 | Multicall (`publicClient.multicall`) | 다수 토큰 잔액 일괄 조회 시 RPC 효율적. 단, v0.6 설계에서는 개별 호출로 충분 |

---

## Architecture Patterns

### 기존 설계에서 이미 예비된 확장 포인트

v0.2 설계 문서에서 토큰 확장을 위해 명시적으로 남겨둔 지점 목록이다. Phase 22 설계는 이 지점들을 정식화해야 한다.

#### 1. TransferRequest 확장 (CORE-04 / API-SPEC)

**현재 상태:** IChainAdapter의 TransferRequest는 `from, to, amount, memo?`만 정의. 그러나 REST API의 TransferRequestSchema에는 이미 `type`과 `tokenMint` 필드가 있다.

```typescript
// CORE-04 현재 (27-chain-adapter-interface.md)
interface TransferRequest {
  from: string
  to: string
  amount: bigint
  memo?: string
}

// API-SPEC 현재 (37-rest-api-complete-spec.md) -- 이미 토큰 필드 포함
const TransferRequestSchema = z.object({
  to: z.string(),
  amount: z.string(),
  type: z.enum(['TRANSFER', 'TOKEN_TRANSFER']).optional().default('TRANSFER'),
  tokenMint: z.string().optional(),
  memo: z.string().max(200).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
})
```

**설계 과제:** IChainAdapter 수준의 TransferRequest 타입에 `token?` 필드를 추가하여 REST API 스키마와 정렬. `token: undefined`일 때 네이티브 전송으로 하위 호환.

#### 2. SolanaAdapter SPL 빌드 로직 (CHAIN-SOL)

**현재 상태:** 31-solana-adapter-detail.md 섹션 5.2에 `buildSplTokenTransfer()` 메서드가 이미 설계 수준으로 작성되어 있다. 주요 내용:
- `findAssociatedTokenPda()` 으로 발신자/수신자 ATA 계산
- `getAccountInfo()`로 수신자 ATA 존재 확인
- ATA 미존재 시 `getCreateAssociatedTokenAccountInstruction()` 선행
- `getTransferInstruction()`으로 SPL 전송
- ATA 생성 시 `estimatedFee += 2,039,280 lamports` (rent-exempt)

**설계 과제:** 이 예비 설계를 정식 스펙으로 승격. Token-2022 호환성 결정, transferChecked 사용 여부, compute unit 조정이 추가 필요.

#### 3. buildTransaction 분기 로직 (CHAIN-SOL)

**현재 상태:** 31-solana-adapter-detail.md 섹션 5.3에 분기 로직이 주석으로 예비됨:
```typescript
// 향후 확장 시:
// if (request.type === 'TOKEN_TRANSFER' && request.tokenMint) {
//   return this.buildSplTokenTransfer(...)
// }
```

**설계 과제:** 이 분기를 정식 명세. token 필드 기반 분기가 type 필드보다 자연스러운지 결정 필요.

#### 4. transactions 테이블 type 필드 (CORE-02)

**현재 상태:** transactions.type은 TEXT로 `'TRANSFER' | 'TOKEN_TRANSFER' | 'PROGRAM_CALL'`이 이미 주석에 열거됨. CHECK 제약은 없음 (자유 문자열).

**설계 과제:** Phase 22에서 'TOKEN_TRANSFER' 사용을 정식화. Phase 23에서 CONTRACT_CALL, APPROVE, BATCH 추가 예정.

#### 5. REST API 확장 포인트 (API-SPEC)

**현재 상태:** 37-rest-api-complete-spec.md 섹션 12.5에 v0.3 확장으로 `GET /v1/wallet/tokens` 명시.

**설계 과제:** getAssets() 결과를 반환하는 REST API 엔드포인트 설계.

#### 6. getAssets() 인터페이스 (CORE-04 / v0.1)

**현재 상태:** v0.1의 IBlockchainAdapter에 있던 `getAssets(walletAddress): Promise<Asset[]>`가 v0.2에서 "v0.3 이연"으로 제거됨 (27-chain-adapter-interface.md 1.1절). v0.1의 Asset 인터페이스는 `{ identifier: AssetIdentifier, balance: Balance, name?, symbol?, logoUri? }` 형태.

**설계 과제:** IChainAdapter에 getAssets() 복원. AssetInfo 스키마 재설계 (v0.1 Asset 타입을 v0.2 BalanceInfo 패턴에 맞게 조정).

### Pattern 1: token 필드 기반 분기 (TransferRequest 확장)

**What:** TransferRequest에 선택적 `token` 객체를 추가하여 어댑터가 네이티브 vs 토큰 전송을 판별
**When to use:** buildTransaction() 진입 시

```typescript
// Phase 22 확장 제안
interface TransferRequest {
  from: string
  to: string
  amount: bigint
  memo?: string
  /** 토큰 정보. undefined면 네이티브 전송 (하위 호환) */
  token?: {
    /** 토큰 민트/컨트랙트 주소 (Solana: base58, EVM: 0x hex) */
    address: string
    /** 소수점 자릿수 (transferChecked 검증용) */
    decimals: number
    /** 토큰 심볼 (UI/로그용) */
    symbol: string
  }
}
```

**근거:**
- `type` 필드 대신 `token` 존재 여부로 분기 -> 타입 안전성 향상
- `token.decimals`를 포함하면 Solana transferChecked, EVM decimals 검증에 바로 사용 가능
- REST API의 `type`/`tokenMint` 필드와는 서비스 레이어에서 매핑 (API -> 내부 타입 변환)

### Pattern 2: ALLOWED_TOKENS 정책 (PolicyType 확장)

**What:** 에이전트별 토큰 화이트리스트 정책을 PolicyType에 추가
**When to use:** DatabasePolicyEngine의 정책 평가 Stage 3에서 토큰 검증

```typescript
// PolicyType 확장
type PolicyType = 'SPENDING_LIMIT' | 'WHITELIST' | 'TIME_RESTRICTION' | 'RATE_LIMIT'
  | 'ALLOWED_TOKENS'  // Phase 22 추가

// ALLOWED_TOKENS rules JSON 구조
const AllowedTokensRuleSchema = z.object({
  /** 허용된 토큰 주소 목록 (민트/컨트랙트) */
  allowed_tokens: z.array(z.object({
    address: z.string(),   // 토큰 민트/컨트랙트 주소
    symbol: z.string(),    // UI 표시용
    decimals: z.number(),  // 검증용
    chain: z.string(),     // 'solana' | 'ethereum'
  })),
  /** 네이티브 토큰 허용 여부 (기본: true) */
  allow_native: z.boolean().default(true),
  /** 미등록 토큰 정책: 'DENY' (기본) | 'WARN' */
  unknown_token_action: z.enum(['DENY', 'WARN']).default('DENY'),
})
```

**근거:**
- 기존 WHITELIST는 수신 주소 화이트리스트 -> ALLOWED_TOKENS는 토큰 종류 화이트리스트 (직교하는 정책)
- `allow_native: true` 기본값 -> 기존 네이티브 전송에 영향 없음 (하위 호환)
- `unknown_token_action: 'DENY'` 기본값 -> 미등록 토큰 거부 (보안 우선)
- Phase 24의 USD 기준 정책 평가와 결합: ALLOWED_TOKENS에 등록된 토큰만 가격 오라클에서 가격 조회 가능

### Pattern 3: getAssets() 인터페이스 복원

**What:** IChainAdapter에 자산 목록 조회 메서드 추가
**When to use:** 에이전트 포트폴리오 조회, 잔액 일괄 확인

```typescript
// IChainAdapter 확장
interface IChainAdapter {
  // ... 기존 13개 메서드 ...

  /** [14] 주소의 전체 자산 목록을 조회한다 */
  getAssets(address: string): Promise<AssetInfo[]>
}

interface AssetInfo {
  /** 토큰 민트/컨트랙트 주소. 네이티브면 'native' 또는 체인별 특수 주소 */
  tokenAddress: string
  /** 토큰 심볼 */
  symbol: string
  /** 토큰 이름 */
  name: string
  /** 소수점 자릿수 */
  decimals: number
  /** 잔액 (최소 단위, bigint) */
  balance: bigint
  /** 로고 URI (선택적) */
  logoUri?: string
  /** 토큰 유형 */
  type: 'native' | 'spl' | 'erc20'
}
```

**Solana 구현:**
- `getBalance()` -> 네이티브 SOL
- `rpc.getTokenAccountsByOwner(address, { programId: TOKEN_PROGRAM_ID })` -> SPL 토큰
- 각 토큰 계정에서 mint, amount 추출
- mint 정보 조회 (decimals, symbol) -> `rpc.getAccountInfo(mintAddress)` 또는 Token Metadata

**EVM 구현:**
- `getBalance()` -> 네이티브 ETH
- ERC-20 잔액은 토큰 목록 없이는 조회 불가 -> 두 가지 접근:
  - (A) ALLOWED_TOKENS 목록에 등록된 토큰만 `balanceOf()` 호출 (보수적, RPC 효율적)
  - (B) 외부 인덱서(Alchemy Enhanced API, Moralis) 사용 (포괄적, 외부 의존성)
  - **권장: (A) ALLOWED_TOKENS 기반** -- Self-Hosted 원칙에 부합, 외부 의존 최소화

### Pattern 4: 수수료 추정 확장

**What:** estimateFee()를 토큰 전송에 맞게 확장
**When to use:** 토큰 전송 전 수수료 예측

**Solana SPL 수수료 구조:**
| 항목 | 값 (lamports) | 조건 |
|------|-------------|------|
| Base Fee | 5,000 | 항상 |
| Priority Fee | 가변 | getRecentPrioritizationFees 기반 |
| ATA 생성 (수신자) | 2,039,280 | 수신자 ATA 미존재 시 |
| ATA 생성 (발신자) | 2,039,280 | 발신자 ATA 미존재 시 (최초 토큰 수신 후 전송) |
| Compute Unit 증가 | 0 (CU 가격에 반영) | SPL 전송은 ~450 CU (SOL 전송 ~200 CU 대비) |

**EVM ERC-20 수수료 구조:**
| 항목 | 값 | 조건 |
|------|-----|------|
| Gas Limit | ~65,000 gas (ERC-20 transfer) | estimateGas()로 동적 추정 |
| Max Fee Per Gas | EIP-1559 baseFee + priorityFee | estimateFeesPerGas()로 동적 |
| 총 수수료 | gasLimit * maxFeePerGas (wei) | 네이티브 전송 (~21,000 gas) 대비 3x |

### Anti-Patterns to Avoid

- **Token Program ID 하드코딩:** Token-2022와 Token Program은 서로 다른 Program ID. 토큰의 실제 owner program을 확인하고 올바른 instruction 사용 필수
- **ATA 존재 가정:** 수신자의 ATA가 항상 존재한다고 가정하면 전송 실패. 반드시 사전 확인
- **decimals 불일치:** transferChecked 사용 시 잘못된 decimals를 전달하면 Solana 프로그램 에러. mint에서 decimals 조회 필수
- **ERC-20 transfer 반환값 무시:** 일부 ERC-20은 `transfer()` 실패 시 false를 반환하지만 revert하지 않음 (USDT). SafeERC20 패턴 또는 시뮬레이션으로 보완

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ATA PDA 계산 | SHA256 직접 계산 | `findAssociatedTokenPda()` | PDA derivation은 seed 순서, bump seed 처리가 복잡 |
| Token-2022 판별 | owner program ID 직접 파싱 | `getAccountInfo()` -> owner 필드 확인 | Token-2022와 Token Program의 계정 구조가 동일하지만 owner가 다름 |
| ERC-20 ABI 인코딩 | 직접 calldata 조립 | viem `encodeFunctionData` / `simulateContract` | ABI 인코딩 오류는 자금 손실 위험 |
| 수수료 추정 (Solana) | 고정값 사용 | `getMinimumBalanceForRentExemption` RPC | rent 비용은 네트워크 파라미터로 변경 가능 |
| 다수 토큰 잔액 조회 (EVM) | 개별 RPC 호출 반복 | viem `multicall` 또는 Multicall3 컨트랙트 | N개 토큰 = 1 RPC 호출 (vs N회 호출) |

**Key insight:** 토큰 관련 연산은 체인 프로그램/컨트랙트와의 상호작용이 복잡하다. 라이브러리가 제공하는 검증된 instruction builder를 반드시 사용하고, 직접 바이트 조립은 금지한다.

---

## Common Pitfalls

### Pitfall 1: Token-2022 vs Token Program 혼용

**What goes wrong:** Solana에는 두 가지 토큰 프로그램이 공존한다. Token Program (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)과 Token-2022 (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`). 잘못된 Program으로 instruction을 보내면 실패한다.
**Why it happens:** USDC가 2024년에 Token-2022로 마이그레이션하면서, 동일한 토큰이 두 프로그램에 걸쳐 존재할 수 있다.
**How to avoid:**
1. 토큰 mint 계정의 `owner` 필드를 조회하여 어느 Program에 속하는지 확인
2. 올바른 Program의 transfer instruction 사용
3. ATA 계산 시에도 올바른 `tokenProgram` 전달

```typescript
// mint 계정 owner 확인
const mintAccount = await rpc.getAccountInfo(mintAddress).send()
const tokenProgram = mintAccount.value?.owner
// tokenProgram === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' -> Token Program
// tokenProgram === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' -> Token-2022
```

**Warning signs:** `ProgramError` 또는 `InvalidAccountData` 에러 발생

### Pitfall 2: ATA 생성 비용의 자금 흐름 복잡성

**What goes wrong:** SPL 토큰 전송 시 수신자의 ATA가 없으면 발신자가 ATA 생성 비용(~0.00204 SOL)을 부담한다. 이 비용은 토큰 전송 금액과 별도이며, SOL로 지불된다.
**Why it happens:** 에이전트의 SOL 잔액이 0이면 토큰을 보유하고 있어도 전송 불가 (ATA 생성 + base fee 모두 SOL 필요).
**How to avoid:**
1. 수수료 추정 시 ATA 생성 비용을 명시적으로 분리 표시
2. SOL 잔액 부족 시 `INSUFFICIENT_BALANCE` 에러에 "SOL needed for ATA creation" 명시
3. estimateFee()에서 `{ baseFee, priorityFee, ataCreationCost, total }` 구조로 반환

**Warning signs:** 토큰 잔액은 충분하지만 전송 실패 -> SOL 잔액 부족

### Pitfall 3: ERC-20 approve/transferFrom 패턴과의 혼동

**What goes wrong:** Phase 22는 `transfer()` (직접 전송)만 다루지만, 많은 DeFi 프로토콜은 `approve()` + `transferFrom()` 패턴을 사용한다. Phase 22에서 approve를 포함하면 범위 초과.
**Why it happens:** ERC-20 표준에 transfer와 approve가 모두 포함되어 있어 혼동하기 쉬움.
**How to avoid:**
1. Phase 22는 `transfer()` 전용으로 한정
2. `approve()` 는 Phase 23 APPROVE-01~03에서 독립 설계
3. TransferRequest에 approve 관련 필드를 포함하지 않음

**Warning signs:** 설계 범위가 approve까지 확장되면 Phase 23과 중복

### Pitfall 4: USDT non-standard ERC-20 구현

**What goes wrong:** USDT의 `transfer()` 함수는 boolean을 반환하지 않는다 (ERC-20 표준 위반). `bool success = transfer()` 패턴이 revert한다.
**Why it happens:** USDT가 ERC-20 표준 제정 전에 배포되었다.
**How to avoid:**
1. viem의 `simulateContract()`로 사전 검증
2. 시뮬레이션 성공 = 실제 전송 성공 예측
3. EVM 토큰 전송 시 항상 시뮬레이션 단계를 필수로 포함

**Warning signs:** 시뮬레이션은 성공하지만 반환값 파싱에서 실패

### Pitfall 5: 정책 평가에서 토큰 금액 vs USD 금액 혼동

**What goes wrong:** 현재 SPENDING_LIMIT 정책은 네이티브 토큰의 최소 단위(lamports/wei) 기준이다. 토큰 확장 시 동일한 숫자 기준으로 비교하면 USDC 100만 lamports = $0.001 vs SOL 100만 lamports = $0.001이 되어 무의미.
**Why it happens:** v0.6 핵심 결정에서 "USD 기준 정책 평가"를 확정했지만 이는 Phase 24에서 가격 오라클과 함께 구현.
**How to avoid:**
1. Phase 22에서는 "토큰 화이트리스트" 정책(ALLOWED_TOKENS)만 도입
2. 금액 기반 티어 분류는 Phase 24까지 네이티브 토큰에만 적용
3. TOKEN_TRANSFER의 기본 티어를 NOTIFY 이상으로 설정 (금액 평가 불가 시 안전 마진)
4. Phase 24 가격 오라클 통합 후 USD 기준 티어 분류 적용

**Warning signs:** SPENDING_LIMIT의 instant_max/notify_max가 토큰별로 다른 가치를 갖는 상황

---

## Code Examples

### Solana SPL 토큰 전송 빌드 (기존 설계 기반)

```typescript
// Source: 31-solana-adapter-detail.md 섹션 5.2 (이미 설계됨)
import { getTransferInstruction } from '@solana-program/token'
import {
  getCreateAssociatedTokenAccountInstruction,
  findAssociatedTokenPda,
} from '@solana-program/associated-token-account'

// 1. ATA 계산
const [sourceAta] = await findAssociatedTokenPda({
  owner: from,
  mint: mintAddress,
  tokenProgram: TOKEN_PROGRAM_ID,  // 또는 TOKEN_2022_PROGRAM_ID
})

const [destinationAta] = await findAssociatedTokenPda({
  owner: to,
  mint: mintAddress,
  tokenProgram: TOKEN_PROGRAM_ID,
})

// 2. 수신자 ATA 존재 확인
const accountInfo = await rpc.getAccountInfo(destinationAta).send()
const needCreateAta = !accountInfo.value

// 3. ATA 생성 instruction (필요 시)
if (needCreateAta) {
  transactionMessage = appendTransactionMessageInstruction(
    getCreateAssociatedTokenAccountInstruction({
      payer: from,
      owner: to,
      mint: mintAddress,
    }),
    transactionMessage,
  )
}

// 4. SPL 토큰 전송 instruction
transactionMessage = appendTransactionMessageInstruction(
  getTransferInstruction({
    source: sourceAta,
    destination: destinationAta,
    authority: from,
    amount,
  }),
  transactionMessage,
)
```

### EVM ERC-20 전송 빌드 (신규 설계 필요)

```typescript
// Source: viem 공식 문서 기반 + KILL-AUTO-EVM 10.5절 참고
import { encodeFunctionData, parseAbi } from 'viem'

const erc20Abi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
])

// 1. 시뮬레이션 (전송 가능 여부 사전 확인)
const { result } = await publicClient.simulateContract({
  address: tokenContractAddress,
  abi: erc20Abi,
  functionName: 'transfer',
  args: [to, amount],
  account: from,
})

// 2. calldata 인코딩
const data = encodeFunctionData({
  abi: erc20Abi,
  functionName: 'transfer',
  args: [to, amount],
})

// 3. 트랜잭션 빌드
const request = await publicClient.prepareTransactionRequest({
  to: tokenContractAddress,  // ERC-20 컨트랙트 주소 (수신자 아님!)
  data,
  account: from,
  value: 0n,  // ETH 전송 없음
})
```

### Solana 자산 목록 조회 (getAssets 구현)

```typescript
// Source: Solana RPC 공식 문서 기반
async getAssets(address: string): Promise<AssetInfo[]> {
  const assets: AssetInfo[] = []

  // 1. 네이티브 SOL 잔액
  const solBalance = await this.getBalance(address)
  assets.push({
    tokenAddress: 'native',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    balance: solBalance.balance,
    type: 'native',
  })

  // 2. SPL 토큰 계정 조회
  const tokenAccounts = await this.rpc!.getTokenAccountsByOwner(
    address as Address,
    { programId: TOKEN_PROGRAM_ID as Address },
    { encoding: 'jsonParsed' },
  ).send()

  for (const account of tokenAccounts.value) {
    const parsed = account.account.data.parsed.info
    assets.push({
      tokenAddress: parsed.mint,
      symbol: '',   // mint metadata에서 별도 조회 필요
      name: '',     // mint metadata에서 별도 조회 필요
      decimals: parsed.tokenAmount.decimals,
      balance: BigInt(parsed.tokenAmount.amount),
      type: 'spl',
    })
  }

  // 3. Token-2022 토큰 계정도 조회 (별도 programId)
  const token2022Accounts = await this.rpc!.getTokenAccountsByOwner(
    address as Address,
    { programId: TOKEN_2022_PROGRAM_ID as Address },
    { encoding: 'jsonParsed' },
  ).send()

  // ... Token-2022 계정도 동일 패턴으로 추가 ...

  return assets
}
```

### EVM 자산 목록 조회 (ALLOWED_TOKENS 기반)

```typescript
// Source: viem 공식 문서 + Self-Hosted 원칙
async getAssets(address: string): Promise<AssetInfo[]> {
  const assets: AssetInfo[] = []

  // 1. 네이티브 ETH 잔액
  const ethBalance = await publicClient.getBalance({ address: address as `0x${string}` })
  assets.push({
    tokenAddress: 'native',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    balance: ethBalance,
    type: 'native',
  })

  // 2. ALLOWED_TOKENS 목록에서 ERC-20만 조회
  // (외부 인덱서 의존 없이, 정책에 등록된 토큰만 조회)
  const allowedTokens = await loadAllowedTokens(agentId, 'ethereum')

  for (const token of allowedTokens) {
    const balance = await publicClient.readContract({
      address: token.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    })

    if (balance > 0n) {
      assets.push({
        tokenAddress: token.address,
        symbol: token.symbol,
        name: token.name ?? token.symbol,
        decimals: token.decimals,
        balance,
        type: 'erc20',
      })
    }
  }

  return assets
}
```

---

## State of the Art

| Old Approach (v0.2) | Current Approach (Phase 22) | When Changed | Impact |
|---------------------|---------------------------|--------------|--------|
| getAssets() 제거 (v0.3 이연) | getAssets() 복원 (14번째 메서드) | Phase 22 | IChainAdapter 인터페이스 확장 |
| TransferRequest: from/to/amount/memo만 | TransferRequest + token? 선택적 필드 | Phase 22 | 하위 호환 유지하며 토큰 전송 지원 |
| PolicyType 4개 | PolicyType 5개 (+ALLOWED_TOKENS) | Phase 22 | policies 테이블 CHECK 제약 수정 |
| estimateFee: 네이티브만 | estimateFee: ATA 생성/ERC-20 gas 포함 | Phase 22 | 수수료 추정 정확도 향상 |
| Token Program만 고려 | Token Program + Token-2022 | Phase 22 | USDC 등 Token-2022 마이그레이션 대응 |

**Deprecated/outdated:**
- `@solana/spl-token` (구 SPL 라이브러리): `@solana-program/token`으로 대체됨 (Anza 공식)
- `@solana/web3.js` 1.x: `@solana/kit`으로 완전 대체

---

## Open Questions

### 1. Token-2022 지원 범위

- **What we know:** Token-2022는 Token Program의 상위 호환. 기본 transfer/balanceOf는 동일하게 동작. 그러나 전송 수수료(TransferFee extension) 같은 확장이 있으면 추가 처리 필요.
- **What's unclear:** WAIaaS가 Token-2022 확장(TransferFee, ConfidentialTransfer 등)을 지원해야 하는 범위
- **Recommendation:** Phase 22에서는 Token-2022의 기본 transfer만 지원 (Token Program과 동일한 transfer instruction). TransferFee 등 확장은 "감지하여 거부" 전략으로 안전 확보. 향후 필요 시 확장.

### 2. EVM getAssets()에서 토큰 발견 전략

- **What we know:** EVM에는 Solana의 `getTokenAccountsByOwner` 같은 범용 RPC가 없다. 토큰 목록을 모르면 잔액 조회 불가.
- **What's unclear:** ALLOWED_TOKENS 기반만으로 충분한지, 외부 인덱서가 필요한지
- **Recommendation:** ALLOWED_TOKENS 기반 조회를 기본으로 하되, "known_tokens" 레지스트리를 config.toml에 추가하여 범용 토큰(USDC, USDT, WETH 등)은 기본 포함. 외부 인덱서는 선택적 플러그인으로 설계.

### 3. 토큰 전송의 기본 보안 티어

- **What we know:** Phase 24까지 USD 기준 정책 평가가 없으므로, 토큰 금액을 네이티브 금액과 비교할 수 없다.
- **What's unclear:** Phase 22-23 기간 동안 TOKEN_TRANSFER의 보안 티어를 어떻게 결정할지
- **Recommendation:** TOKEN_TRANSFER의 기본 티어를 NOTIFY로 설정 (INSTANT보다 한 단계 높음). SPENDING_LIMIT 정책이 TOKEN_TRANSFER에는 적용되지 않도록 설계하고, ALLOWED_TOKENS 정책으로만 검증. Phase 24에서 USD 기준 통합 후 SPENDING_LIMIT도 적용.

### 4. REST API의 type/tokenMint vs IChainAdapter의 token 객체 매핑

- **What we know:** REST API에는 이미 `type: 'TOKEN_TRANSFER'`와 `tokenMint` 필드가 존재. IChainAdapter의 TransferRequest에는 아직 없음.
- **What's unclear:** API 레이어와 어댑터 레이어 간 변환 로직의 위치
- **Recommendation:** 서비스 레이어(transaction-service)에서 REST API 요청을 IChainAdapter의 TransferRequest로 변환. tokenMint로 토큰 메타데이터(decimals, symbol) 조회 후 token 객체 구성.

---

## Key Existing Design Dependencies

Phase 22 설계가 참조/수정해야 하는 기존 문서의 구체적 지점:

### 수정 대상 (Phase 22에서 확장 명세)

| 문서 | 섹션 | 변경 내용 |
|------|------|----------|
| 27-chain-adapter-interface.md | 2.3 TransferRequest | token? 필드 추가 |
| 27-chain-adapter-interface.md | 3. IChainAdapter | getAssets() 메서드 추가 (14번째) |
| 27-chain-adapter-interface.md | 2.7 BalanceInfo | AssetInfo 타입 추가 |
| 31-solana-adapter-detail.md | 5.2 SPL 토큰 전송 | 정식 스펙으로 승격, Token-2022 분기 추가 |
| 31-solana-adapter-detail.md | 4.4 estimateFee | ATA 생성 비용 포함 확장 |
| 31-solana-adapter-detail.md | 신규 | getAssets() 구현 설계 |
| 33-time-lock-approval-mechanism.md | 2.2 PolicyRuleSchema | ALLOWED_TOKENS 타입 추가 |
| 33-time-lock-approval-mechanism.md | 3. DatabasePolicyEngine | 토큰 검증 로직 추가 |
| 25-sqlite-schema.md | 2.4 policies | CHECK 제약에 'ALLOWED_TOKENS' 추가 |
| 37-rest-api-complete-spec.md | 6.3 POST /v1/transactions/send | tokenMint 정식 지원 명세 |
| 37-rest-api-complete-spec.md | 신규 | GET /v1/wallet/assets 엔드포인트 추가 |
| 45-enum-unified-mapping.md | 2.4 PolicyType | 'ALLOWED_TOKENS' 추가 |
| 36-killswitch-autostop-evm.md | 10. EvmAdapterStub | getAssets() stub 추가, ERC-20 빌드 노트 |

### 참조만 (수정 없음)

| 문서 | 참조 이유 |
|------|----------|
| 32-transaction-pipeline-api.md | 파이프라인 6단계 구조 변경 없음. Stage 1 type 분기 확인용 |
| 25-sqlite-schema.md (transactions) | type 컬럼의 'TOKEN_TRANSFER' 사용 확인 |
| 52-auth-model-redesign.md | 인증 체계 변경 없음. sessionAuth가 토큰 전송에도 동일 적용 |

---

## Sources

### Primary (HIGH confidence)
- 27-chain-adapter-interface.md -- IChainAdapter 13 메서드, TransferRequest, BalanceInfo 타입 전체
- 31-solana-adapter-detail.md -- SolanaAdapter 13 메서드, buildSplTokenTransfer 예비 설계, estimateFee
- 32-transaction-pipeline-api.md -- 6-stage 파이프라인, 8-state 머신, Stage 1 type 분기
- 33-time-lock-approval-mechanism.md -- DatabasePolicyEngine, PolicyType 4개, PolicyRuleSchema
- 25-sqlite-schema.md -- 8 tables, transactions.type, policies.type CHECK 제약
- 37-rest-api-complete-spec.md -- 31 endpoints, TransferRequestSchema (type/tokenMint 이미 포함)
- 45-enum-unified-mapping.md -- 9 Enum SSoT, PolicyType 4개
- 36-killswitch-autostop-evm.md -- EvmAdapterStub 13 메서드, viem v0.3 구현 노트
- 12-multichain-extension.md -- v0.1 getAssets(), Asset/AssetIdentifier/Balance 타입

### Secondary (MEDIUM confidence)
- [Solana RPC: getTokenAccountsByOwner](https://solana.com/docs/rpc/http/gettokenaccountsbyowner) - SPL 토큰 계정 조회 RPC
- [Transfer Tokens | Solana](https://solana.com/docs/tokens/basics/transfer-tokens) - Solana 토큰 전송 공식 가이드
- [viem readContract](https://viem.sh/docs/contract/readContract) - viem 컨트랙트 읽기 공식 문서
- [viem writeContract](https://viem.sh/docs/contract/writeContract) - viem 컨트랙트 쓰기 공식 문서
- [viem simulateContract](https://viem.sh/docs/contract/simulateContract) - viem 컨트랙트 시뮬레이션
- [Token-2022 Program](https://spl.solana.com/token-2022) - Token-2022 공식 문서
- [Solana ATA](https://spl.solana.com/associated-token-account) - Associated Token Account 공식 문서

### Tertiary (LOW confidence)
- [SPL Token Transfers Guide | QuickNode](https://www.quicknode.com/guides/solana-development/spl-tokens/how-to-transfer-spl-tokens-on-solana) - 커뮤니티 가이드
- [How to Transfer Solana Tokens | Helius](https://www.helius.dev/blog/solana-dev-101-how-to-transfer-solana-tokens-with-typescript) - 커뮤니티 블로그

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 모든 라이브러리가 v0.2에서 이미 확정됨 (@solana/kit, @solana-program/token, viem)
- Architecture: HIGH - 기존 v0.2 설계에 명시적 확장 포인트 존재, 구조 변경 최소
- Pitfalls: HIGH - Token-2022, ATA 비용, ERC-20 비표준 구현 등 실전 이슈 문서화됨
- Open Questions: MEDIUM - Token-2022 확장 지원 범위, EVM 토큰 발견 전략은 설계 결정 필요

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days, 안정 도메인)
