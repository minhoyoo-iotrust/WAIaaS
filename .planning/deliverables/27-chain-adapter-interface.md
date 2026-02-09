# ChainAdapter 인터페이스 + 체인별 어댑터 상세 명세 (CORE-04)

**문서 ID:** CORE-04
**작성일:** 2026-02-05
**v0.6 업데이트:** 2026-02-08
**v0.7 업데이트:** 2026-02-08
**v0.8 업데이트:** 2026-02-08
**상태:** 완료
**참조:** ARCH-05 (12-multichain-extension.md), CORE-01 (24-monorepo-data-directory.md), CORE-02 (25-sqlite-schema.md), 06-CONTEXT.md, 06-RESEARCH.md, CHAIN-EXT-01 (56-token-transfer-extension-spec.md), CHAIN-EXT-02 (57-asset-query-fee-estimation-spec.md), CHAIN-EXT-03 (58-contract-call-spec.md), CHAIN-EXT-04 (59-approve-management-spec.md), CHAIN-EXT-05 (60-batch-transaction-spec.md), CHAIN-EXT-07 (62-action-provider-architecture.md), objectives/v0.8-optional-owner-progressive-security.md, CORE-02 (25-sqlite-schema.md -- SweepResult 타입)

---

## 1. 인터페이스 설계 원칙

### 1.1 v0.1 ARCH-05 대비 변경 요약

v0.1의 `IBlockchainAdapter`(ARCH-05)는 Cloud-First + Squads Protocol 의존 모델로 설계되었다. v0.2에서는 Self-Hosted + 체인 무관 로컬 정책 엔진 모델로 전환하면서 인터페이스를 전면 리팩터링한다.

| 항목 | v0.1 (ARCH-05) | v0.2 (CORE-04) |
|------|---------------|----------------|
| 인터페이스 이름 | `IBlockchainAdapter` | `IChainAdapter` |
| 체인 식별 | `getChainId(): string` (자유 문자열) | `readonly chain: ChainType` (리터럴 유니온) |
| 네트워크 식별 | `getNetwork(): string` | `readonly network: NetworkType` |
| 스마트 월렛 | `createSmartWallet()` (Squads 의존) | **제거** -- 로컬 키스토어에서 키 관리 |
| 멤버 관리 | `addMember()`, `removeMember()` (Squads 멤버십) | **제거** -- 온체인 멀티시그 미사용 |
| 설정 변경 | `updateWalletConfig()` (Squads 설정) | **제거** -- 로컬 정책 엔진 |
| 트랜잭션 서명 | 없음 (KMS에서 처리) | `signTransaction()` -- 로컬 서명 |
| 연결 관리 | 없음 (생성자에서 처리) | `connect()`, `disconnect()`, `isConnected()`, `getHealth()` |
| 확인 대기 | 없음 | `waitForConfirmation()` -- 능동 확인 대기 |
| 수수료 추정 | 없음 | `estimateFee()` -- 독립 수수료 추정 |
| 에러 체계 | 없음 (문자열 에러) | `ChainError` 클래스 + 계층적 에러 코드 |
| 자산 조회 | `getBalance()`, `getAssets()` | `getBalance()` + `getAssets()` (v0.6 복원) |
| 헬스 체크 | `healthCheck(): boolean` | `getHealth(): { healthy, latency }` (레이턴시 포함) |
| 컨트랙트 호출 | 없음 | `buildContractCall()`, `buildApprove()`, `buildBatch()` (v0.6 추가) |
| **Nonce 관리** | 없음 | **[v0.7 추가]** `getCurrentNonce()`, `resetNonceTracker()` -- EVM nonce 타입 안전 관리 |

### 1.2 설계 원칙

| 원칙 | 설명 | 적용 |
|------|------|------|
| **명령형 인터페이스** | 내부 구현은 체인별 라이브러리 패턴(@solana/kit pipe, viem Client/Action)을 사용하되, 인터페이스는 명령형으로 노출 | `buildTransaction()`, `submitTransaction()` 등 |
| **4단계 트랜잭션 분리** | build -> simulate -> sign -> submit을 독립 메서드로 분리. 정책 엔진이 simulate 후 approve/reject 가능 | Phase 7 트랜잭션 파이프라인의 핵심 후크 |
| **체인 무관 공통 타입** | 모든 체인에서 동일한 요청/응답 타입 사용. 체인 고유 정보는 `metadata` 필드로 확장 | `TransferRequest`, `UnsignedTransaction`, `SubmitResult` |
| **로컬 서명** | 키스토어에서 복호화된 privateKey(Uint8Array)를 직접 전달받아 서명. sodium guarded memory 호환 | `signTransaction(tx, privateKey)` |
| **1 agent = 1 chain** | v0.2에서 에이전트는 단일 체인에 바인딩. 데이터 모델은 멀티 체인 확장을 수용하도록 설계 | `agents.chain` 컬럼 (CORE-02) |
| **빌트인 + 플러그인** | v0.2는 빌트인 어댑터(Solana, EVM)만 제공. 플러그인 인터페이스를 설계해두되 구현은 미루기 | `AdapterRegistry` + `IAdapterPlugin` |

### 1.3 트랜잭션 4단계 분리 근거

```
[1] buildTransaction() -> UnsignedTransaction
        |
[2] simulateTransaction() -> SimulationResult
        |
    *** 정책 엔진 검증 (Phase 7-8) ***
    - 금액 한도 확인
    - 화이트리스트 확인
    - 에스컬레이션 필요 여부 판단
        |
[3] signTransaction() -> SignedTransaction (Uint8Array)
        |
[4] submitTransaction() -> SubmitResult
```

4단계 분리를 통해:
- **시뮬레이션 후 정책 검증:** simulate 결과(수수료, 성공 여부)를 정책 엔진에 전달하여 사전 차단 가능
- **서명 최소화:** 정책 승인된 트랜잭션만 서명. guarded memory에서 키를 꺼내는 횟수 최소화
- **감사 로그:** 각 단계를 독립적으로 기록하여 "빌드했으나 시뮬레이션 실패", "시뮬레이션 성공했으나 정책 거부" 등 상세 추적

---

## 2. 공통 타입 정의

파일 위치: `packages/core/src/interfaces/chain-adapter.types.ts`

### 2.1 체인 및 네트워크 타입

```typescript
/**
 * 지원되는 블록체인 타입.
 * v0.2에서는 Solana + EVM 체인(Ethereum, Polygon, Arbitrum)을 지원한다.
 * 새 체인 추가 시 이 유니온에 리터럴을 추가한다.
 */
type ChainType = 'solana' | 'ethereum' | 'polygon' | 'arbitrum'

/**
 * 네트워크 타입.
 * 체인별로 사용하는 네트워크 이름이 다르므로 유니온으로 정의한다.
 *
 * - Solana: 'mainnet-beta' | 'devnet' | 'testnet'
 * - EVM: 'mainnet' | 'sepolia' | 'goerli' (deprecated)
 *
 * 에이전트 생성 시 chain + network 조합이 고정된다 (1 agent = 1 chain wallet).
 */
type NetworkType = 'mainnet' | 'mainnet-beta' | 'devnet' | 'testnet' | 'sepolia'
```

### 2.2 금액 타입

```typescript
/**
 * 토큰 금액 정보.
 * 모든 금액은 최소 단위(lamports, wei)의 bigint로 표현한다.
 * decimals와 symbol은 UI 표시 및 체인 식별에 사용한다.
 *
 * 예시:
 * - SOL 1.5개: { raw: 1_500_000_000n, decimals: 9, symbol: 'SOL' }
 * - ETH 0.1개: { raw: 100_000_000_000_000_000n, decimals: 18, symbol: 'ETH' }
 */
interface TokenAmount {
  /** 최소 단위 금액. Solana: lamports (1 SOL = 10^9), EVM: wei (1 ETH = 10^18) */
  raw: bigint

  /** 소수점 자릿수. SOL=9, ETH=18, USDC=6 */
  decimals: number

  /** 토큰 심볼. 'SOL', 'ETH', 'MATIC', 'USDC' 등 */
  symbol: string
}
```

### 2.3 트랜잭션 요청 타입

```typescript
/**
 * 네이티브 토큰 전송 요청.
 * 체인 무관한 공통 전송 파라미터를 정의한다.
 * 현재 v0.2에서는 네이티브 토큰(SOL, ETH) 전송만 지원한다.
 * SPL/ERC-20 토큰 전송은 v0.3에서 확장 예정.
 *
 * from/to는 체인별 주소 포맷을 따른다:
 * - Solana: Base58 인코딩 (32-44자, 예: 'So11111111111111111111111111111112')
 * - EVM: 0x 접두어 hex (42자, 예: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28')
 */
interface TransferRequest {
  /** 발신 주소 (체인별 포맷) */
  from: string

  /** 수신 주소 (체인별 포맷) */
  to: string

  /**
   * 전송 금액 (최소 단위, bigint).
   * Solana: lamports, EVM: wei.
   * SQLite에는 TEXT로 저장됨 (CORE-02 결정).
   */
  amount: bigint

  /**
   * 선택적 메모.
   * - Solana: Memo Program instruction으로 첨부
   * - EVM: transaction data 필드에 UTF-8 인코딩
   * 최대 길이: 256바이트
   */
  memo?: string
}
```

### 2.4 미서명 트랜잭션 타입

```typescript
/**
 * 빌드된 미서명 트랜잭션.
 * buildTransaction()의 반환값이며, simulateTransaction()과 signTransaction()의 입력이다.
 *
 * serialized는 체인별 직렬화 포맷:
 * - Solana: 버전 0 트랜잭션 메시지 바이트 (pipe 패턴으로 구성)
 * - EVM: RLP 인코딩된 트랜잭션 바이트 (EIP-1559)
 */
interface UnsignedTransaction {
  /** 대상 체인 */
  chain: ChainType

  /**
   * 체인별 직렬화된 트랜잭션 바이트.
   * 서명 전 상태의 원시 트랜잭션 데이터.
   */
  serialized: Uint8Array

  /**
   * 예상 수수료 (최소 단위, bigint).
   * - Solana: base fee + priority fee (lamports)
   * - EVM: gasLimit * maxFeePerGas (wei)
   */
  estimatedFee: bigint

  /**
   * 트랜잭션 유효 기한.
   * - Solana: blockhash lifetime 기반 (~60초). 필수.
   *   lastValidBlockHeight에서 현재 슬롯을 빼고 400ms를 곱하여 계산.
   * - EVM: nonce 기반이므로 유효 기한 없음. undefined.
   */
  expiresAt?: Date

  /**
   * 체인별 메타데이터.
   * 어댑터 내부에서 사용하는 추가 정보를 저장한다.
   *
   * Solana 예시:
   * {
   *   blockhash: string,
   *   lastValidBlockHeight: bigint,
   *   version: 0
   * }
   *
   * EVM 예시:
   * {
   *   chainId: number,
   *   maxFeePerGas: bigint,
   *   maxPriorityFeePerGas: bigint,
   *   gasLimit: bigint
   * }
   *
   * [v0.7 보완] nonce는 v0.7부터 명시적 필드(tx.nonce)로 승격.
   * metadata.nonce 대신 tx.nonce를 사용할 것.
   * 기존 호환: metadata.nonce를 읽는 코드는 tx.nonce로 마이그레이션 필요.
   */
  metadata: Record<string, unknown>

  /**
   * [v0.7 보완] EVM 트랜잭션 nonce.
   * EVM 체인에서만 사용. Solana는 undefined (blockhash 기반).
   *
   * 기존 metadata.nonce에서 승격된 명시적 optional 필드.
   * buildTransaction()이 자동 설정하며, 외부에서 override 가능.
   *
   * 파이프라인에서 nonce 접근 시 반드시 tx.nonce !== undefined 가드 사용.
   * Solana 어댑터에서는 항상 undefined이므로, 체인 무관 코드에서
   * nonce 존재 여부를 확인 후 사용해야 한다.
   *
   * @example
   * if (tx.nonce !== undefined) {
   *   // EVM nonce 관련 로직
   * }
   */
  nonce?: number
}
```

### 2.5 시뮬레이션 결과 타입

```typescript
/**
 * 트랜잭션 시뮬레이션 결과.
 * 실제 제출 전 트랜잭션의 성공 여부와 리소스 소비를 예측한다.
 *
 * 시뮬레이션은 정책 엔진 판단의 핵심 입력:
 * - success=false면 정책과 무관하게 거부
 * - unitsConsumed로 실제 수수료 재추정 가능
 * - logs로 프로그램/컨트랙트 동작 검증
 */
interface SimulationResult {
  /** 시뮬레이션 성공 여부 */
  success: boolean

  /**
   * 실행 로그.
   * - Solana: 프로그램 로그 (Program log:, Program return: 등)
   * - EVM: trace 로그 (call, revert reason 등)
   */
  logs: string[]

  /**
   * 소비된 연산 단위.
   * - Solana: compute units (CU). 기본 최대 200,000 CU/instruction.
   * - EVM: gas used.
   */
  unitsConsumed?: bigint

  /** 시뮬레이션 실패 시 에러 메시지 */
  error?: string
}
```

### 2.6 제출 결과 타입

```typescript
/**
 * 트랜잭션 제출 결과.
 * submitTransaction()과 getTransactionStatus(), waitForConfirmation()의 반환값.
 *
 * status 전이:
 * 'submitted' -> 'confirmed' -> 'finalized'
 *                    또는
 * 'submitted' -> 'failed'
 */
interface SubmitResult {
  /**
   * 트랜잭션 해시/서명.
   * - Solana: Base58 인코딩된 서명 (88자)
   * - EVM: 0x 접두어 hex (66자)
   */
  txHash: string

  /**
   * 트랜잭션 상태.
   * - submitted: 노드에 전송됨, 아직 블록에 포함되지 않음
   * - confirmed: 블록에 포함됨 (Solana: ~400ms, EVM: 체인별 상이)
   * - finalized: 최종 확정, 되돌릴 수 없음 (Solana: ~6s, EVM: 12-15 blocks)
   */
  status: 'submitted' | 'confirmed' | 'finalized'

  /**
   * 확인 수 (EVM 전용).
   * Solana는 confirmed/finalized 이진 상태이므로 undefined.
   */
  confirmations?: number

  /**
   * 블록 번호 (EVM) 또는 슬롯 번호 (Solana).
   * 트랜잭션이 포함된 블록/슬롯.
   */
  blockNumber?: bigint

  /**
   * 실제 소비된 수수료 (최소 단위, bigint).
   * confirmed 이후에만 정확한 값.
   */
  fee?: bigint
}
```

### 2.7 잔액 정보 타입

```typescript
/**
 * 주소의 잔액 정보.
 * getBalance()의 반환값. 네이티브 토큰 잔액만 조회한다.
 *
 * usdValue는 선택적이며, 향후 가격 오라클 통합 시 사용.
 * v0.2에서는 항상 undefined.
 */
interface BalanceInfo {
  /** 조회 대상 주소 */
  address: string

  /**
   * 잔액 (최소 단위, bigint).
   * - Solana: lamports
   * - EVM: wei
   */
  balance: bigint

  /** 소수점 자릿수. SOL=9, ETH=18, MATIC=18 */
  decimals: number

  /** 네이티브 토큰 심볼. 'SOL', 'ETH', 'MATIC' 등 */
  symbol: string

  /** USD 환산 가치 (선택적, v0.2에서는 미구현) */
  usdValue?: number
}
```

### 2.8 AssetInfo 타입 (v0.6 추가)

```typescript
/**
 * 에이전트가 보유한 개별 자산 정보.
 * getAssets()의 반환값 배열 요소이다.
 * 네이티브 토큰과 프로그램/컨트랙트 토큰을 하나의 타입으로 표현한다.
 *
 * @see CHAIN-EXT-02 (57-asset-query-fee-estimation-spec.md) 섹션 2
 */
interface AssetInfo {
  /** 토큰 민트/컨트랙트 주소. 네이티브 토큰이면 'native' */
  tokenAddress: string

  /** 토큰 심볼. 'SOL', 'USDC', 'ETH' 등 */
  symbol: string

  /** 토큰 이름. 'Solana', 'USD Coin' 등 */
  name: string

  /** 소수점 자릿수. SOL=9, USDC=6, ETH=18 */
  decimals: number

  /** 잔액 (최소 단위, bigint) */
  balance: bigint

  /** 토큰 타입. 'native' | 'spl' | 'erc20' */
  type: 'native' | 'spl' | 'erc20'

  /** 토큰 로고 URI (선택적) */
  logoUri?: string
}
```

### 2.9 FeeEstimate 타입 (v0.6 추가)

```typescript
/**
 * 수수료 추정 결과.
 * estimateFee()의 반환 타입.
 *
 * v0.2에서는 bigint(= total)만 반환했으나, v0.6에서 토큰 전송의
 * ATA 생성 비용, ERC-20 가스 등 세부 항목을 표현하기 위해 확장.
 *
 * 하위 호환: total 필드가 기존 bigint 반환값에 대응한다.
 *
 * @see CHAIN-EXT-02 (57-asset-query-fee-estimation-spec.md) 섹션 7
 */
interface FeeEstimate {
  /** 기본 수수료 (lamports/wei). Solana: 5000 lamports/sig, EVM: baseFee */
  networkFee: bigint

  /** 우선순위 수수료 (선택적). Solana: priority fee, EVM: maxPriorityFeePerGas * gas */
  priorityFee?: bigint

  /** 계정 생성 비용 (선택적). Solana: ATA rent-exempt 비용 */
  accountCreationFee?: bigint

  /** 총 수수료. networkFee + (priorityFee ?? 0n) + (accountCreationFee ?? 0n) */
  totalFee: bigint
}
```

### 2.10 ContractCallRequest 타입 (v0.6 추가)

```typescript
/**
 * 컨트랙트/프로그램 호출 요청.
 * buildContractCall()의 입력 타입이다.
 *
 * EVM: calldata + value 기반 호출
 * Solana: programId + instructionData + accounts 기반 호출
 *
 * @see CHAIN-EXT-03 (58-contract-call-spec.md) 섹션 2
 */
interface ContractCallRequest {
  /** 발신 주소 */
  from: string

  /** 컨트랙트/프로그램 주소 */
  to: string

  /** 호출 시 전송할 네이티브 토큰 금액 (0이면 view call) */
  value: bigint

  // ── EVM 전용 ──
  /** ABI 인코딩된 호출 데이터 (EVM). 예: '0x70a08231...' */
  calldata?: string

  // ── Solana 전용 ──
  /** Solana 프로그램 ID */
  programId?: string

  /** Solana instruction data (직렬화된 바이트) */
  instructionData?: Uint8Array

  /** Solana instruction accounts */
  accounts?: Array<{
    pubkey: string
    isSigner: boolean
    isWritable: boolean
  }>
}
```

### 2.11 ApproveRequest 타입 (v0.6 추가)

```typescript
/**
 * 토큰 approve/delegate 요청.
 * buildApprove()의 입력 타입이다.
 *
 * APPROVE는 ContractCallRequest와 독립 타입이다 (권한 위임 vs 실행).
 * EVM: race condition 방지를 위해 approve(0)->approve(new) 자동 처리.
 * Solana: delegateChecked instruction, 단일 delegate 경고.
 *
 * @see CHAIN-EXT-04 (59-approve-management-spec.md) 섹션 2
 */
interface ApproveRequest {
  /** 토큰 소유자 주소 (발신자) */
  from: string

  /** 토큰 민트/컨트랙트 주소 */
  token: string

  /** 승인 대상 주소 (spender/delegate) */
  spender: string

  /** 승인 금액 (최소 단위, bigint). 0이면 revoke */
  amount: bigint

  /** 토큰 소수점 자릿수 (Solana delegateChecked에 필요) */
  decimals: number
}
```

### 2.12 BatchRequest 타입 (v0.6 추가)

```typescript
/**
 * 다중 instruction 배치 요청.
 * buildBatch()의 입력 타입이다.
 * Solana 전용. EVM에서는 BATCH_NOT_SUPPORTED 에러.
 *
 * @see CHAIN-EXT-05 (60-batch-transaction-spec.md) 섹션 2
 */
interface BatchRequest {
  /** 대상 체인 (현재 'solana'만 지원) */
  chain: 'solana'

  /** 발신 주소 (모든 instruction의 fee payer) */
  from: string

  /** instruction 목록 (최소 2, 최대 20) */
  instructions: Array<{
    type: 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE'
    // type별 필드는 해당 Request 타입과 동일
    to: string
    amount?: bigint
    token?: string
    // ... type별 추가 필드
  }>
}
```

### 2.13 타입 요약

| 타입 | 용도 | 핵심 필드 | 비고 |
|------|------|----------|------|
| `ChainType` | 체인 식별 | 리터럴 유니온 | 새 체인 추가 시 확장 |
| `NetworkType` | 네트워크 식별 | 리터럴 유니온 | 체인별 네트워크 이름 |
| `TokenAmount` | 금액 표현 | `raw`, `decimals`, `symbol` | UI 표시 + 내부 계산 |
| `TransferRequest` | 전송 요청 | `from`, `to`, `amount`, `memo?` | 체인 무관 공통 포맷 |
| `UnsignedTransaction` | 미서명 트랜잭션 | `serialized`, `estimatedFee`, `metadata`, `nonce?` **(v0.7)** | 체인별 직렬화, nonce는 EVM 전용 |
| `SimulationResult` | 시뮬레이션 결과 | `success`, `logs`, `unitsConsumed` | 정책 엔진 입력 |
| `SubmitResult` | 제출 결과 | `txHash`, `status`, `fee` | 상태 추적 |
| `BalanceInfo` | 잔액 정보 | `balance`, `decimals`, `symbol` | 네이티브 토큰 전용 |
| `AssetInfo` | 자산 정보 | `tokenAddress`, `balance`, `type` | (v0.6 추가) 토큰 포함 |
| `FeeEstimate` | 수수료 상세 | `networkFee`, `totalFee` | (v0.6 추가) bigint 대체 |
| `ContractCallRequest` | 컨트랙트 호출 | `to`, `calldata`/`programId` | (v0.6 추가) |
| `ApproveRequest` | 토큰 승인 | `token`, `spender`, `amount` | (v0.6 추가) |
| `BatchRequest` | 배치 요청 | `instructions[]`, `chain: 'solana'` | (v0.6 추가) |

---

## 3. IChainAdapter 인터페이스

파일 위치: `packages/core/src/interfaces/IChainAdapter.ts`

```typescript
/**
 * 체인 추상화 어댑터 인터페이스.
 *
 * 모든 블록체인 어댑터(SolanaAdapter, EVMAdapter 등)는 이 인터페이스를 구현한다.
 * 상위 서비스 레이어(transaction-service, agent-service)는 이 인터페이스에만 의존하여
 * 체인에 무관하게 동작한다.
 *
 * 핵심 설계:
 * - 4단계 트랜잭션 파이프라인: build -> simulate -> sign -> submit
 * - 로컬 서명: sodium guarded memory의 privateKey(Uint8Array)를 직접 전달
 * - 명령형 인터페이스: 내부 라이브러리 패턴(pipe, Client/Action)을 캡슐화
 *
 * @see SolanaAdapter - @solana/kit 3.x 기반 구현
 * @see EVMAdapter - viem 기반 구현
 */
interface IChainAdapter {
  // ═══════════════════════════════════════════════════════════
  // 어댑터 식별 (읽기 전용 프로퍼티)
  // ═══════════════════════════════════════════════════════════

  /**
   * 이 어댑터가 지원하는 체인.
   * 인스턴스 생성 후 변경 불가.
   *
   * @example 'solana', 'ethereum', 'polygon', 'arbitrum'
   */
  readonly chain: ChainType

  /**
   * 이 어댑터가 연결된 네트워크.
   * 인스턴스 생성 후 변경 불가.
   *
   * @example 'mainnet-beta' (Solana), 'mainnet' (Ethereum)
   */
  readonly network: NetworkType

  // ═══════════════════════════════════════════════════════════
  // 연결 관리
  // ═══════════════════════════════════════════════════════════

  /**
   * RPC 노드에 연결한다.
   *
   * Solana: createSolanaRpc() + createSolanaRpcSubscriptions() 초기화
   * EVM: createPublicClient() 초기화
   *
   * @param rpcUrl - RPC 엔드포인트 URL.
   *   config.toml [rpc] 섹션에서 체인/네트워크별로 주입된다.
   *   예: 'https://api.mainnet-beta.solana.com'
   *
   * @throws {ChainError} code=RPC_ERROR -- RPC 연결 실패
   * @throws {ChainError} code=NETWORK_ERROR -- 네트워크 도달 불가
   */
  connect(rpcUrl: string): Promise<void>

  /**
   * RPC 연결을 종료한다.
   * Graceful shutdown 시 호출.
   * WebSocket 구독이 있으면 함께 해제한다 (Solana rpcSubscriptions).
   */
  disconnect(): Promise<void>

  /**
   * 현재 RPC 연결 상태를 반환한다.
   * connect() 호출 전이면 false.
   *
   * @returns RPC 클라이언트가 초기화되어 있으면 true
   */
  isConnected(): boolean

  /**
   * RPC 노드의 건강 상태와 레이턴시를 조회한다.
   *
   * Solana: rpc.getHealth().send() + 응답 시간 측정
   * EVM: getBlockNumber() + 응답 시간 측정
   *
   * @returns healthy: RPC 응답 정상 여부, latency: 응답 시간 (ms)
   * @throws 연결되지 않은 상태에서 호출 시 { healthy: false, latency: -1 }
   */
  getHealth(): Promise<{ healthy: boolean; latency: number }>

  // ═══════════════════════════════════════════════════════════
  // 주소 검증
  // ═══════════════════════════════════════════════════════════

  /**
   * 주소 형식이 유효한지 검증한다.
   * 온체인 존재 여부는 확인하지 않는다 (포맷 검증만).
   *
   * Solana: Base58 디코딩 성공 + 32바이트 길이 확인
   * EVM: 0x 접두어 + 40자 hex + EIP-55 체크섬 검증
   *
   * @param address - 검증할 주소 문자열
   * @returns 유효하면 true, 아니면 false
   */
  isValidAddress(address: string): boolean

  // ═══════════════════════════════════════════════════════════
  // 잔액 조회
  // ═══════════════════════════════════════════════════════════

  /**
   * 주소의 네이티브 토큰 잔액을 조회한다.
   *
   * Solana: rpc.getBalance(address).send() -> lamports
   * EVM: client.getBalance({ address }) -> wei
   *
   * @param address - 조회할 주소 (체인별 포맷)
   * @returns 잔액 정보 (BalanceInfo)
   *
   * @throws {ChainError} code=INVALID_ADDRESS -- 주소 형식 오류
   * @throws {ChainError} code=RPC_ERROR -- RPC 호출 실패
   * @throws {ChainError} code=NETWORK_ERROR -- 네트워크 오류
   */
  getBalance(address: string): Promise<BalanceInfo>

  // ═══════════════════════════════════════════════════════════
  // 트랜잭션 파이프라인 (4단계)
  // ═══════════════════════════════════════════════════════════

  /**
   * [1단계] 전송 요청을 미서명 트랜잭션으로 빌드한다.
   *
   * Solana: pipe 패턴으로 트랜잭션 메시지 구성
   *   createTransactionMessage -> setFeePayer -> setLifetime -> appendInstruction
   * EVM: prepareTransactionRequest()로 nonce, gas, fee 설정
   *
   * @param request - 전송 요청 (체인 무관 공통 포맷)
   * @returns 미서명 트랜잭션 (serialized + estimatedFee + metadata)
   *
   * @throws {ChainError} code=INVALID_ADDRESS -- from 또는 to 주소 오류
   * @throws {ChainError} code=INSUFFICIENT_BALANCE -- 잔액 부족 (수수료 포함)
   * @throws {ChainError} code=RPC_ERROR -- blockhash/nonce 조회 실패
   * @throws {SolanaError} code=SOLANA_BLOCKHASH_EXPIRED -- blockhash 만료 (재시도 필요)
   */
  buildTransaction(request: TransferRequest): Promise<UnsignedTransaction>

  /**
   * [2단계] 트랜잭션을 시뮬레이션한다.
   *
   * 시뮬레이션 결과는 정책 엔진의 핵심 입력이다:
   * - success=false면 제출 전 차단
   * - unitsConsumed로 실제 수수료 추정 (과대 추정 방지)
   * - logs로 프로그램/컨트랙트 동작 검증
   *
   * Solana: simulateTransaction().send()
   * EVM: call() (단순 전송) 또는 simulateContract()
   *
   * @param tx - buildTransaction()으로 생성된 미서명 트랜잭션
   * @returns 시뮬레이션 결과 (success, logs, unitsConsumed)
   *
   * @throws {ChainError} code=SIMULATION_FAILED -- 시뮬레이션 자체 실패 (RPC 오류 등)
   * @throws {ChainError} code=TRANSACTION_EXPIRED -- 트랜잭션 유효 기한 초과
   */
  simulateTransaction(tx: UnsignedTransaction): Promise<SimulationResult>

  /**
   * [3단계] 미서명 트랜잭션에 서명한다.
   *
   * privateKey는 sodium guarded memory(sodium_malloc)에서 복호화된 원시 키 바이트이다.
   * 호출자(keystore)가 복호화 -> 이 메서드 호출 -> sodium_memzero 순서로 관리한다.
   *
   * Uint8Array를 사용하는 이유:
   * 1. sodium_malloc()이 반환하는 SecureBuffer는 Uint8Array 호환
   * 2. Node.js Buffer는 GC가 복사본을 만들어 보안 보장 불가 (C-03 pitfall)
   * 3. 체인별 서명 라이브러리 모두 Uint8Array 입력 지원
   *
   * Solana: Ed25519 서명 (64바이트). CryptoKeyPair 내부 생성 후 signTransactionMessageWithSigners
   * EVM: secp256k1 ECDSA 서명 (r, s, v). viem signTransaction()
   *
   * @param tx - 서명할 미서명 트랜잭션
   * @param privateKey - 서명 키 (Uint8Array). Solana: 64바이트 Ed25519 keypair, EVM: 32바이트 secp256k1
   * @returns 서명된 트랜잭션 바이트 (체인별 직렬화)
   *
   * @throws {ChainError} code=TRANSACTION_EXPIRED -- 서명 시점에 트랜잭션 이미 만료
   * @throws {ChainError} code=TRANSACTION_FAILED -- 서명 생성 실패 (잘못된 키 등)
   */
  signTransaction(tx: UnsignedTransaction, privateKey: Uint8Array): Promise<Uint8Array>

  /**
   * [4단계] 서명된 트랜잭션을 네트워크에 제출한다.
   *
   * Solana: sendAndConfirmTransactionFactory 사용.
   *   skipPreflight=true (2단계에서 이미 시뮬레이션 완료).
   *   commitment='confirmed' 기본.
   * EVM: sendRawTransaction() -> waitForTransactionReceipt()
   *
   * @param signedTx - signTransaction()으로 서명된 트랜잭션 바이트
   * @returns 제출 결과 (txHash, status, fee)
   *
   * @throws {ChainError} code=TRANSACTION_FAILED -- 제출 실패 (이미 처리됨, 중복 등)
   * @throws {ChainError} code=TRANSACTION_EXPIRED -- blockhash 만료 (Solana)
   * @throws {ChainError} code=NETWORK_ERROR -- 네트워크 오류
   * @throws {EVMError} code=EVM_NONCE_TOO_LOW -- nonce 충돌 (EVM)
   * @throws {EVMError} code=EVM_GAS_TOO_LOW -- gas limit 부족 (EVM)
   */
  submitTransaction(signedTx: Uint8Array): Promise<SubmitResult>

  // ═══════════════════════════════════════════════════════════
  // 트랜잭션 조회
  // ═══════════════════════════════════════════════════════════

  /**
   * 트랜잭션의 현재 상태를 조회한다.
   *
   * Solana: getSignatureStatuses().send()
   * EVM: getTransactionReceipt()
   *
   * @param txHash - 트랜잭션 해시/서명
   * @returns 현재 상태 (SubmitResult)
   *
   * @throws {ChainError} code=RPC_ERROR -- 조회 실패
   */
  getTransactionStatus(txHash: string): Promise<SubmitResult>

  /**
   * 트랜잭션이 원하는 상태에 도달할 때까지 대기한다.
   *
   * 내부적으로 폴링 또는 WebSocket 구독을 사용한다.
   * - Solana: rpcSubscriptions 사용 (WebSocket)
   * - EVM: waitForTransactionReceipt() (폴링)
   *
   * timeout 초과 시 마지막 상태를 반환한다 (에러가 아님).
   *
   * @param txHash - 대기할 트랜잭션 해시/서명
   * @param timeout - 최대 대기 시간 (ms). 기본값: 60000 (60초)
   * @returns 최종 도달한 상태 (SubmitResult)
   *
   * @throws {ChainError} code=RPC_ERROR -- 상태 조회 실패
   */
  waitForConfirmation(txHash: string, timeout?: number): Promise<SubmitResult>

  // ═══════════════════════════════════════════════════════════
  // 수수료 추정
  // ═══════════════════════════════════════════════════════════

  /**
   * 전송 요청의 예상 수수료를 추정한다.
   * buildTransaction() 없이 수수료만 미리 확인할 때 사용한다.
   *
   * Solana: base fee(5000 lamports) + priority fee 조회 + ATA 생성 비용 (토큰 전송 시)
   * EVM: estimateGas() * maxFeePerGas (EIP-1559)
   *
   * (v0.6 변경) 반환 타입: bigint -> FeeEstimate.
   * 하위 호환: 기존 호출자는 .totalFee으로 마이그레이션 필요.
   *
   * @param request - 수수료를 추정할 전송 요청
   * @returns 수수료 상세 (FeeEstimate)
   *
   * @throws {ChainError} code=INVALID_ADDRESS -- 주소 오류
   * @throws {ChainError} code=RPC_ERROR -- 수수료 조회 실패
   *
   * @see CHAIN-EXT-02 (57-asset-query-fee-estimation-spec.md) 섹션 7
   */
  estimateFee(request: TransferRequest): Promise<FeeEstimate>

  // ═══════════════════════════════════════════════════════════
  // 자산 조회 (v0.6 추가)
  // ═══════════════════════════════════════════════════════════

  /**
   * [14] 주소가 보유한 모든 자산(네이티브 + 토큰)을 조회한다. (v0.6 추가)
   *
   * v0.1에서 제거되었던 getAssets()를 v0.6에서 복원.
   * 네이티브 토큰을 첫 번째 항목으로, 이후 잔액 내림차순으로 정렬하여 반환.
   *
   * Solana: getBalance() + getTokenAccountsByOwner() + Token-2022 포함
   * EVM: getBalance() + ALLOWED_TOKENS 기반 multicall 보수적 조회
   *
   * 파싱 실패한 토큰 계정은 건너뛰고, 성공한 항목만 반환.
   *
   * @param address - 조회 대상 주소 (체인별 포맷)
   * @returns 보유 자산 목록 (AssetInfo[])
   *
   * @throws {ChainError} code=INVALID_ADDRESS -- 주소 형식 오류
   * @throws {ChainError} code=RPC_ERROR -- RPC 호출 실패
   *
   * @see CHAIN-EXT-02 (57-asset-query-fee-estimation-spec.md) 섹션 3
   */
  getAssets(address: string): Promise<AssetInfo[]>

  // ═══════════════════════════════════════════════════════════
  // 확장 빌드 메서드 (v0.6 추가)
  // ═══════════════════════════════════════════════════════════

  /**
   * [15] 컨트랙트/프로그램 호출 트랜잭션을 빌드한다. (v0.6 추가)
   *
   * EVM: calldata 기반 컨트랙트 호출 트랜잭션 구성
   * Solana: programId + instructionData + accounts 기반 instruction 구성
   *
   * CONTRACT_WHITELIST 정책은 이 메서드 호출 전에 파이프라인 Stage 3에서 검증된다.
   *
   * @param request - 컨트랙트 호출 요청 (ContractCallRequest)
   * @returns 미서명 트랜잭션 (UnsignedTransaction)
   *
   * @throws {ChainError} code=INVALID_ADDRESS -- 주소 오류
   * @throws {ChainError} code=RPC_ERROR -- RPC 호출 실패
   * @throws {ChainError} code=TRANSACTION_FAILED -- 트랜잭션 구성 실패
   *
   * @see CHAIN-EXT-03 (58-contract-call-spec.md) 섹션 3
   */
  buildContractCall(request: ContractCallRequest): Promise<UnsignedTransaction>

  /**
   * [16] 토큰 approve/delegate 트랜잭션을 빌드한다. (v0.6 추가)
   *
   * EVM: approve(spender, amount) + race condition 방지 (approve(0)->approve(new))
   * Solana: delegateChecked instruction (단일 delegate 경고)
   *
   * APPROVED_SPENDERS 정책은 이 메서드 호출 전에 파이프라인 Stage 3에서 검증된다.
   *
   * @param request - 토큰 승인 요청 (ApproveRequest)
   * @returns 미서명 트랜잭션 (UnsignedTransaction)
   *
   * @throws {ChainError} code=INVALID_ADDRESS -- 주소 오류
   * @throws {ChainError} code=RPC_ERROR -- RPC 호출 실패
   *
   * @see CHAIN-EXT-04 (59-approve-management-spec.md) 섹션 3
   */
  buildApprove(request: ApproveRequest): Promise<UnsignedTransaction>

  /**
   * [17] 다중 instruction 배치 트랜잭션을 빌드한다. (v0.6 추가)
   *
   * Solana 전용. 2~20개 instruction을 단일 트랜잭션으로 원자적 실행.
   * EVM에서 호출 시 BATCH_NOT_SUPPORTED 에러.
   *
   * 배치 정책은 2단계: Phase A (개별 instruction) + Phase B (합산 금액 티어).
   *
   * @param request - 배치 요청 (BatchRequest)
   * @returns 미서명 트랜잭션 (UnsignedTransaction)
   *
   * @throws {ChainError} code=BATCH_NOT_SUPPORTED -- EVM 체인에서 호출
   * @throws {ChainError} code=BATCH_SIZE_EXCEEDED -- instruction 수 초과 (> 20)
   * @throws {ChainError} code=INVALID_ADDRESS -- 주소 오류
   *
   * @see CHAIN-EXT-05 (60-batch-transaction-spec.md) 섹션 3
   */
  buildBatch(request: BatchRequest): Promise<UnsignedTransaction>

  // ═══════════════════════════════════════════════════════════
  // Nonce 관리 (v0.7 추가)
  // ═══════════════════════════════════════════════════════════

  /**
   * [18] [v0.7 보완] 주소의 현재 유효 nonce를 반환한다.
   *
   * EVM: max(onchainPendingNonce, localTrackerNonce)를 반환한다.
   *   - onchainPendingNonce: getTransactionCount(address, 'pending')
   *   - localTrackerNonce: 내부 nonceTracker에서 관리하는 값
   *   - 둘 중 높은 값을 반환하여 nonce gap과 충돌을 모두 방지
   *
   * Solana: 0을 반환한다 (Solana는 nonce 기반이 아님, blockhash 기반).
   *   - Solana에서 이 메서드를 호출하는 것은 의미 없으나, 인터페이스 일관성을 위해 0 반환.
   *
   * 사용 시나리오:
   * - 파이프라인에서 현재 nonce 상태 확인
   * - 에러 복구 시 nonce 상태 조회
   * - 감사 로그에 nonce 기록
   *
   * @param address - 조회 대상 주소 (체인별 포맷)
   * @returns 현재 유효 nonce (EVM), 0 (Solana)
   *
   * @throws {ChainError} code=RPC_ERROR -- 온체인 nonce 조회 실패
   */
  getCurrentNonce(address: string): Promise<number>

  /**
   * [19] [v0.7 보완] nonce 트래커를 리셋한다.
   *
   * 제출 실패/stuck 트랜잭션 복구 시 사용한다.
   * 리셋 후 다음 buildTransaction()에서 온체인 nonce를 새로 조회한다.
   *
   * EVM: nonceTracker Map에서 해당 주소 항목을 삭제한다.
   *   - address 지정 시: 해당 주소만 삭제
   *   - address 미지정 시: 전체 nonceTracker 클리어
   *
   * Solana: no-op (Solana는 nonce 트래커가 없음).
   *
   * 사용 시나리오:
   * - NONCE_TOO_LOW 에러 후 복구
   * - stuck 트랜잭션 감지 후 nonce 재동기화
   * - 관리자 수동 리셋
   *
   * @param address - 리셋 대상 주소 (생략 시 전체 리셋)
   */
  resetNonceTracker(address?: string): void

  // ═══════════════════════════════════════════════════════════
  // 자금 회수 (v0.8 추가)
  // ═══════════════════════════════════════════════════════════

  /**
   * [20] 에이전트 지갑의 전체 자산을 목표 주소로 회수한다. [v0.8 추가] (WITHDRAW-06)
   *
   * 실행 순서:
   * 1. getAssets(from) -> 보유 자산 전수 조사
   * 2. 토큰별 transfer + closeAccount -> 배치 처리 (buildBatch 활용)
   * 3. 네이티브 전량 전송 (잔액 - tx fee) -- 반드시 마지막 (WITHDRAW-07)
   *
   * 정책 엔진을 우회한다 (WithdrawService에서 직접 호출).
   * 수신 주소가 agents.owner_address로 고정되므로 공격자 이득 없음.
   *
   * @param from - 에이전트 지갑 주소 (소스)
   * @param to - Owner 지갑 주소 (목적지, agents.owner_address)
   * @returns 회수 결과 (성공/실패 분리, 부분 실패 시 failed 배열 비어있지 않음)
   *
   * @throws {ChainError} code=INSUFFICIENT_BALANCE -- 잔액 부족 (fee도 없음)
   * @throws {ChainError} code=RPC_ERROR -- RPC 호출 실패
   *
   * @see WITHDRAW-06 (메서드 추가), WITHDRAW-07 (SOL 마지막 전송)
   */
  sweepAll(from: string, to: string): Promise<SweepResult>
}
```

### 3.1 메서드 요약

| # | 메서드 | 카테고리 | 파라미터 | 반환 | 비동기 |
|---|--------|---------|---------|------|--------|
| 1 | `connect` | 연결 | `rpcUrl: string` | `void` | O |
| 2 | `disconnect` | 연결 | 없음 | `void` | O |
| 3 | `isConnected` | 연결 | 없음 | `boolean` | X |
| 4 | `getHealth` | 연결 | 없음 | `{ healthy, latency }` | O |
| 5 | `isValidAddress` | 검증 | `address: string` | `boolean` | X |
| 6 | `getBalance` | 조회 | `address: string` | `BalanceInfo` | O |
| 7 | `buildTransaction` | 파이프라인 | `TransferRequest` | `UnsignedTransaction` | O |
| 8 | `simulateTransaction` | 파이프라인 | `UnsignedTransaction` | `SimulationResult` | O |
| 9 | `signTransaction` | 파이프라인 | `UnsignedTransaction, Uint8Array` | `Uint8Array` | O |
| 10 | `submitTransaction` | 파이프라인 | `Uint8Array` | `SubmitResult` | O |
| 11 | `getTransactionStatus` | 조회 | `txHash: string` | `SubmitResult` | O |
| 12 | `waitForConfirmation` | 조회 | `txHash, timeout?` | `SubmitResult` | O |
| 13 | `estimateFee` | 추정 | `TransferRequest` | `FeeEstimate` | O | (v0.6 변경: bigint -> FeeEstimate) |
| 14 | `getAssets` | 조회 | `address: string` | `AssetInfo[]` | O | (v0.6 추가) |
| 15 | `buildContractCall` | 파이프라인 | `ContractCallRequest` | `UnsignedTransaction` | O | (v0.6 추가) |
| 16 | `buildApprove` | 파이프라인 | `ApproveRequest` | `UnsignedTransaction` | O | (v0.6 추가) |
| 17 | `buildBatch` | 파이프라인 | `BatchRequest` | `UnsignedTransaction` | O | (v0.6 추가) |
| 18 | `getCurrentNonce` | **Nonce 관리 (v0.7 추가)** | `address: string` | `number` | O | **(v0.7 추가)** EVM: max(onchain, local), Solana: 0 |
| 19 | `resetNonceTracker` | **Nonce 관리 (v0.7 추가)** | `address?: string` | `void` | X | **(v0.7 추가)** EVM: Map 삭제, Solana: no-op |
| 20 | `sweepAll` | **자금 회수 (v0.8 추가)** | `from: string, to: string` | `SweepResult` | O | **(v0.8 추가)** 전체 자산 회수, 정책 엔진 우회 |

**Note:** v0.2 대비 변경 이력:
- **v0.6:** `getAssets` 복원(14번째), `buildContractCall`(15번째), `buildApprove`(16번째), `buildBatch`(17번째) 추가. `estimateFee` 반환 타입 bigint -> FeeEstimate 변경.
- **[v0.7 보완]:** `getCurrentNonce`(18번째), `resetNonceTracker`(19번째) 추가. `UnsignedTransaction.nonce` 명시적 optional 필드 승격. 총 19개 메서드.
- **[v0.8 추가]:** `sweepAll`(20번째) 추가. 에이전트 지갑 전량 회수 (WITHDRAW-06). **총 20개 메서드.**

> **DeFi 메서드 미추가 원칙 (v0.6 핵심 결정):** IChainAdapter는 저수준 실행 엔진으로 유지한다. swap(), stake(), lend() 같은 DeFi 프로토콜 지식은 IChainAdapter에 추가하지 않으며, IActionProvider 계층에 위임한다. Action Provider의 resolve()는 ContractCallRequest를 반환하고, 이를 IChainAdapter.buildContractCall()이 실행한다. 이 패턴(resolve-then-execute)은 모든 DeFi 작업이 기존 6단계 파이프라인의 정책 평가를 거치도록 보장한다. (CHAIN-EXT-07 참조)

### 3.2 [v0.8] sweepAll -- 자금 전량 회수

> **[v0.8 추가]** 에이전트 지갑의 전체 자산을 Owner 주소로 회수하는 20번째 메서드. WITHDRAW-06, WITHDRAW-07 요구사항을 충족한다.

**호출자:** WithdrawService (정책 엔진 우회, 파이프라인 외부)

**정책 우회 근거:**
- 수신 주소가 `agents.owner_address`로 고정되어 공격자가 자금을 탈취할 수 없음
- masterAuth(OWNER_VERIFIED=1 필수)로 호출되므로 인증 충분
- 정책 엔진의 SPENDING_LIMIT/RATE_LIMIT 등이 자금 회수를 차단하면 Owner가 자신의 자금을 회수할 수 없는 역설 발생

**SOL 마지막 전송 근거 (WITHDRAW-07):**
- SOL이 트랜잭션 fee 지불에 필요하므로, 토큰 전송이 모두 완료된 후 SOL 잔액에서 fee를 차감하여 전량 전송
- 토큰 계정 closeAccount로 회수된 rent lamports가 최종 SOL 잔액에 합산됨
- SOL을 먼저 보내면 이후 토큰 전송 tx fee를 지불할 수 없어 실패

**부분 실패 처리:**
- 특정 토큰 전송 실패 시 `failed` 배열에 기록하고 나머지 토큰 계속 처리
- 하나라도 실패하면 HTTP 207 (Multi-Status) 응답 -- WithdrawService 수준에서 처리
- 전체 실패(SOL 전송도 실패)가 아닌 한 성공으로 간주

**SweepResult 타입 참조:**
- 25-sqlite-schema.md에서 정의된 SweepResult 타입 사용
- `{ succeeded: SweepTransfer[], failed: SweepTransferError[], rentRecovered: string }`

**scope 분기:**
- `scope: "all"` (네이티브+토큰+rent)과 `scope: "native"` (네이티브만) 분기는 WithdrawService 수준에서 처리
- `sweepAll` 메서드 자체는 항상 전량 회수 (scope 파라미터 없음)

**인터페이스 변경 이력:**

| 버전 | 변경 | 메서드 수 | 근거 |
|------|------|----------|------|
| v0.2 | IChainAdapter 초기 설계 | 13 | CORE-04 기본 |
| v0.6 | getAssets 복원, buildContractCall/buildApprove/buildBatch 추가 | 13 -> 17 | 체인 기능 확장 (CHAIN-EXT) |
| v0.7 | getCurrentNonce, resetNonceTracker 추가 | 17 -> 19 | EVM nonce 관리 |
| v0.8 | sweepAll 추가 | 19 -> 20 | 자금 전량 회수 (WITHDRAW-06) |

---

## 4. 에러 타입 체계

파일 위치: `packages/core/src/errors/chain-error.ts`

### 4.1 공통 에러 코드 (체인 무관)

```typescript
/**
 * 체인 무관 공통 에러 코드.
 * 모든 체인에서 동일하게 발생할 수 있는 에러를 정의한다.
 * v0.1 API-04 (20-error-codes.md)의 에러 코드 체계와 통합 가능:
 * ChainErrorCode는 WAIaaSError의 하위 계층으로 매핑된다.
 */
enum ChainErrorCode {
  /**
   * 잔액 부족.
   * 전송 금액 + 수수료가 잔액을 초과할 때 발생.
   * HTTP 매핑: 400 Bad Request
   * 재시도: 잔액 충전 후 가능
   */
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',

  /**
   * 유효하지 않은 주소 형식.
   * Base58/Hex 디코딩 실패 또는 길이/체크섬 불일치.
   * HTTP 매핑: 400 Bad Request
   * 재시도: 주소 수정 후 가능
   */
  INVALID_ADDRESS = 'INVALID_ADDRESS',

  /**
   * 트랜잭션 실행 실패.
   * 서명, 제출, 또는 온체인 실행 중 실패.
   * HTTP 매핑: 500 Internal Server Error
   * 재시도: 원인에 따라 다름
   */
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',

  /**
   * 트랜잭션 유효 기한 초과.
   * Solana: blockhash 만료 (~60초)
   * EVM: 실질적으로 발생하지 않음 (nonce 기반)
   * HTTP 매핑: 408 Request Timeout
   * 재시도: 새 트랜잭션 빌드 후 가능
   */
  TRANSACTION_EXPIRED = 'TRANSACTION_EXPIRED',

  /**
   * RPC 노드 오류.
   * RPC 호출 실패, 응답 파싱 실패, 비정상 응답.
   * HTTP 매핑: 502 Bad Gateway
   * 재시도: 가능 (일시적 장애일 수 있음)
   */
  RPC_ERROR = 'RPC_ERROR',

  /**
   * 네트워크 연결 오류.
   * DNS 해석 실패, TCP 연결 타임아웃, TLS 오류.
   * HTTP 매핑: 503 Service Unavailable
   * 재시도: 가능 (네트워크 복구 대기)
   */
  NETWORK_ERROR = 'NETWORK_ERROR',

  /**
   * 시뮬레이션 실패.
   * 시뮬레이션 자체가 실행되지 못함 (RPC 제한 등).
   * 시뮬레이션에서 트랜잭션이 실패한 경우와 구분:
   * - 이 코드: 시뮬레이션 실행 불가
   * - SimulationResult.success=false: 시뮬레이션은 실행됨, 트랜잭션이 실패 예측
   * HTTP 매핑: 502 Bad Gateway
   * 재시도: 가능
   */
  SIMULATION_FAILED = 'SIMULATION_FAILED',
}
```

### 4.2 Solana 고유 에러 코드

```typescript
/**
 * Solana 체인 고유 에러 코드.
 * 접두어 'SOLANA_'로 체인 식별.
 */
enum SolanaErrorCode {
  /**
   * Blockhash 만료.
   * 트랜잭션 빌드 후 ~60초(150 슬롯) 이내에 제출하지 않으면 발생.
   * lastValidBlockHeight를 초과한 상태.
   *
   * 복구: buildTransaction()부터 재실행 (새 blockhash 필요)
   */
  BLOCKHASH_EXPIRED = 'SOLANA_BLOCKHASH_EXPIRED',

  /**
   * 프로그램 실행 에러.
   * Solana 프로그램(스마트 컨트랙트)이 에러를 반환한 경우.
   * details에 프로그램 에러 코드가 포함된다.
   *
   * 예: InstructionError, ProgramError
   */
  PROGRAM_ERROR = 'SOLANA_PROGRAM_ERROR',

  /**
   * [v0.7 보완] Blockhash 잔여 수명 부족.
   * signTransaction() 직전 checkBlockhashFreshness() 검증에서 발생.
   * blockhash가 아직 유효하지만, 서명 + 제출 + 확인에 충분한 시간이 남지 않은 상태.
   *
   * BLOCKHASH_EXPIRED와의 차이:
   * - EXPIRED: 이미 만료됨 → buildTransaction() 완전 재실행 필요
   * - STALE: 잔여 수명 부족 → refreshBlockhash() 호출로 빠른 복구 가능
   *
   * 복구: refreshBlockhash(tx) -> signTransaction(refreshedTx) -> submitTransaction()
   */
  BLOCKHASH_STALE = 'SOLANA_BLOCKHASH_STALE',
}
```

### 4.3 EVM 고유 에러 코드

```typescript
/**
 * EVM 체인 고유 에러 코드.
 * 접두어 'EVM_'로 체인 식별.
 * Ethereum, Polygon, Arbitrum 등 모든 EVM 체인에서 공용.
 */
enum EVMErrorCode {
  /**
   * Nonce 충돌 (너무 낮음).
   * 동일 nonce로 이미 다른 트랜잭션이 처리된 경우.
   * 동시 트랜잭션 제출 시 빈번하게 발생.
   *
   * 복구: 현재 nonce를 다시 조회하여 트랜잭션 재빌드
   */
  NONCE_TOO_LOW = 'EVM_NONCE_TOO_LOW',

  /**
   * Gas limit 부족.
   * estimateGas()로 추정한 gas가 실제 실행에 불충분한 경우.
   *
   * 복구: gas limit을 높여 재빌드 (1.2x ~ 1.5x 안전 마진)
   */
  GAS_TOO_LOW = 'EVM_GAS_TOO_LOW',

  /**
   * 컨트랙트 실행 revert.
   * 스마트 컨트랙트가 require/revert를 실행한 경우.
   * details에 revert reason 문자열이 포함된다.
   *
   * 복구: revert 원인 분석 후 입력 수정
   */
  REVERT = 'EVM_REVERT',
}
```

### 4.4 ChainError 클래스

```typescript
/**
 * 체인 어댑터 에러 클래스.
 * IChainAdapter의 모든 메서드가 던지는 에러의 기본 타입.
 *
 * v0.1 API-04(20-error-codes.md)의 WAIaaSError와 통합:
 * - ChainError는 WAIaaSError의 하위 타입
 * - HTTP 응답 시 WAIaaSError로 래핑되어 RFC 9457 형식으로 반환
 *
 * @example
 * try {
 *   await adapter.submitTransaction(signedTx)
 * } catch (err) {
 *   if (err instanceof ChainError) {
 *     switch (err.code) {
 *       case ChainErrorCode.TRANSACTION_EXPIRED:
 *         // 트랜잭션 재빌드
 *         break
 *       case EVMErrorCode.NONCE_TOO_LOW:
 *         // nonce 재조회 후 재빌드
 *         break
 *     }
 *   }
 * }
 */
class ChainError extends Error {
  /**
   * 에러 코드.
   * 공통 에러(ChainErrorCode) 또는 체인 고유 에러(SolanaErrorCode, EVMErrorCode).
   * switch/case로 프로그래밍적 분기에 사용.
   */
  readonly code: ChainErrorCode | SolanaErrorCode | EVMErrorCode

  /**
   * 에러가 발생한 체인.
   * 에러 로깅 및 감사 추적에 사용.
   */
  readonly chain: ChainType

  /**
   * 에러 상세 정보.
   * 체인별 추가 컨텍스트를 담는다.
   *
   * 예시:
   * - Solana PROGRAM_ERROR: { programId: string, instructionIndex: number }
   * - EVM REVERT: { revertReason: string, data: string }
   * - NONCE_TOO_LOW: { expected: number, actual: number }
   */
  readonly details?: Record<string, unknown>

  /**
   * 재시도 가능 여부.
   * true면 동일 요청으로 재시도 가능 (일시적 장애).
   * false면 입력 수정 필요.
   */
  readonly retryable: boolean

  constructor(params: {
    code: ChainErrorCode | SolanaErrorCode | EVMErrorCode
    chain: ChainType
    message: string
    details?: Record<string, unknown>
    retryable?: boolean
    cause?: Error
  }) {
    super(params.message)
    this.name = 'ChainError'
    this.code = params.code
    this.chain = params.chain
    this.details = params.details
    this.retryable = params.retryable ?? false
    if (params.cause) {
      this.cause = params.cause
    }
  }
}
```

### 4.5 에러 코드 매핑 테이블

| 에러 코드 | 체인 | HTTP | 재시도 | 복구 방법 |
|-----------|------|------|--------|----------|
| `INSUFFICIENT_BALANCE` | 공통 | 400 | 조건부 | 잔액 충전 후 재시도 |
| `INVALID_ADDRESS` | 공통 | 400 | X | 주소 수정 |
| `TRANSACTION_FAILED` | 공통 | 500 | 조건부 | 원인 분석 |
| `TRANSACTION_EXPIRED` | 공통 | 408 | O | 새 트랜잭션 빌드 |
| `RPC_ERROR` | 공통 | 502 | O | 재시도 (exponential backoff) |
| `NETWORK_ERROR` | 공통 | 503 | O | 네트워크 복구 대기 |
| `SIMULATION_FAILED` | 공통 | 502 | O | 재시도 |
| `TOKEN_NOT_FOUND` | 공통 | 404 | X | 토큰 주소 확인 | (v0.6 추가) |
| `TOKEN_NOT_ALLOWED` | 공통 | 403 | X | ALLOWED_TOKENS 정책 추가 | (v0.6 추가) |
| `INSUFFICIENT_TOKEN_BALANCE` | 공통 | 400 | 조건부 | 토큰 잔액 충전 | (v0.6 추가) |
| `CONTRACT_NOT_WHITELISTED` | 공통 | 403 | X | CONTRACT_WHITELIST에 주소 추가 | (v0.6 추가) |
| `METHOD_NOT_WHITELISTED` | EVM | 403 | X | METHOD_WHITELIST에 selector 추가 | (v0.6 추가) |
| `CONTRACT_CALL_FAILED` | 공통 | 500 | 조건부 | 호출 파라미터 확인 | (v0.6 추가) |
| `APPROVE_LIMIT_EXCEEDED` | 공통 | 403 | X | APPROVE_AMOUNT_LIMIT 설정 확인 | (v0.6 추가) |
| `SPENDER_NOT_APPROVED` | 공통 | 403 | X | APPROVED_SPENDERS에 주소 추가 | (v0.6 추가) |
| `UNLIMITED_APPROVE_BLOCKED` | 공통 | 403 | X | 금액 제한 후 재시도 | (v0.6 추가) |
| `BATCH_NOT_SUPPORTED` | EVM | 400 | X | Solana에서만 사용 | (v0.6 추가) |
| `BATCH_SIZE_EXCEEDED` | Solana | 400 | X | instruction 수 줄이기 | (v0.6 추가) |
| `BATCH_INSTRUCTION_INVALID` | Solana | 400 | X | instruction 데이터 확인 | (v0.6 추가) |
| `SOLANA_BLOCKHASH_EXPIRED` | Solana | 408 | O | buildTransaction() 재실행 |
| `SOLANA_BLOCKHASH_STALE` | Solana | 408 | O | **[v0.7 추가]** refreshBlockhash() 호출 후 re-sign. EXPIRED보다 복구 비용 낮음 |
| `SOLANA_PROGRAM_ERROR` | Solana | 400 | X | 프로그램 에러 분석 |
| `EVM_NONCE_TOO_LOW` | EVM | 409 | O | nonce 재조회 후 재빌드 |
| `EVM_GAS_TOO_LOW` | EVM | 400 | O | gas limit 상향 후 재빌드 |
| `EVM_REVERT` | EVM | 400 | X | revert reason 분석 |

### 4.6 v0.1 에러 체계와의 통합

v0.1 API-04(20-error-codes.md)는 RFC 9457 + Stripe 스타일 `WalletApiError`를 정의했다. v0.2에서 `ChainError`는 이 체계의 하위 계층으로 통합된다:

```
WalletApiError (HTTP 응답 레벨)
├── type: 에러 범주 (authentication_error, chain_error, ...)
├── code: 도메인 에러 코드 (CHAIN_INSUFFICIENT_BALANCE, ...)
└── detail: 사람 가독 메시지

    ↑ 매핑

ChainError (어댑터 레벨)
├── code: ChainErrorCode | SolanaErrorCode | EVMErrorCode
├── chain: ChainType
└── details: 체인별 상세 정보
```

**매핑 규칙:**
- `ChainError.code=INSUFFICIENT_BALANCE` -> `WalletApiError.code=CHAIN_INSUFFICIENT_BALANCE`
- `ChainError.code=EVM_NONCE_TOO_LOW` -> `WalletApiError.code=CHAIN_EVM_NONCE_TOO_LOW`
- `ChainError.retryable=true` -> `WalletApiError.retryable=true` + `Retry-After` 헤더

---

## 5. AdapterRegistry 설계

파일 위치: `packages/core/src/interfaces/adapter-registry.ts`

### 5.1 목적

AdapterRegistry는 체인 어댑터의 등록, 검색, 생성을 관리하는 중앙 레지스트리이다.
- 데몬 시작 시 빌트인 어댑터(Solana, EVM)를 자동 등록
- 에이전트의 `chain` 필드로 적절한 어댑터를 검색
- 향후 플러그인 어댑터 동적 로딩 인터페이스 제공

### 5.2 AdapterFactory 타입

```typescript
/**
 * 어댑터 팩토리 함수.
 * 체인과 네트워크를 받아 IChainAdapter 인스턴스를 생성한다.
 * config.toml [rpc] 섹션에서 해당 체인/네트워크의 RPC URL을 주입한다.
 *
 * @param network - 대상 네트워크
 * @param rpcUrl - RPC 엔드포인트 URL (config.toml에서 주입)
 * @returns 초기화된 어댑터 인스턴스
 */
type AdapterFactory = (network: NetworkType, rpcUrl: string) => IChainAdapter
```

### 5.3 AdapterRegistry 인터페이스

```typescript
/**
 * 체인 어댑터 레지스트리.
 *
 * 사용 흐름:
 * 1. 데몬 시작 시 빌트인 어댑터 등록: registry.register('solana', solanaFactory)
 * 2. 에이전트 요청 시 어댑터 검색: const adapter = registry.get('solana', 'devnet')
 * 3. 어댑터 사용: await adapter.buildTransaction(request)
 *
 * 어댑터 인스턴스는 (chain, network) 조합당 하나만 생성되어 캐시된다.
 * 동일 조합에 대한 후속 get() 호출은 캐시된 인스턴스를 반환한다.
 */
interface IAdapterRegistry {
  /**
   * 어댑터 팩토리를 등록한다.
   * 동일 체인에 대한 중복 등록 시 마지막 등록이 우선한다.
   *
   * @param chain - 대상 체인
   * @param factory - 어댑터 팩토리 함수
   */
  register(chain: ChainType, factory: AdapterFactory): void

  /**
   * 체인+네트워크 조합에 대한 어댑터 인스턴스를 반환한다.
   * 최초 호출 시 팩토리로 인스턴스를 생성하고, 이후에는 캐시된 인스턴스를 반환한다.
   * connect()는 호출자가 별도로 수행해야 한다.
   *
   * @param chain - 대상 체인
   * @param network - 대상 네트워크
   * @returns IChainAdapter 인스턴스
   *
   * @throws Error - 미등록 체인에 대한 조회 시
   */
  get(chain: ChainType, network: NetworkType): IChainAdapter

  /**
   * 등록된 체인 목록을 반환한다.
   *
   * @returns 등록된 ChainType 배열
   */
  getRegisteredChains(): ChainType[]

  /**
   * 특정 체인의 팩토리가 등록되어 있는지 확인한다.
   *
   * @param chain - 확인할 체인
   * @returns 등록 여부
   */
  has(chain: ChainType): boolean

  /**
   * 모든 활성 어댑터의 연결을 종료한다.
   * Graceful shutdown 시 호출.
   */
  disconnectAll(): Promise<void>
}
```

### 5.4 AdapterRegistry 구현 전략

```typescript
/**
 * AdapterRegistry 구현.
 * 파일 위치: packages/daemon/src/infrastructure/adapter-registry.ts
 */
class AdapterRegistry implements IAdapterRegistry {
  /** 체인별 팩토리 저장소 */
  private factories: Map<ChainType, AdapterFactory> = new Map()

  /** (chain:network) -> 인스턴스 캐시 */
  private instances: Map<string, IChainAdapter> = new Map()

  register(chain: ChainType, factory: AdapterFactory): void {
    this.factories.set(chain, factory)
  }

  get(chain: ChainType, network: NetworkType): IChainAdapter {
    const key = `${chain}:${network}`

    // 캐시 히트
    const cached = this.instances.get(key)
    if (cached) return cached

    // 팩토리 조회
    const factory = this.factories.get(chain)
    if (!factory) {
      throw new Error(
        `어댑터 미등록: chain=${chain}. ` +
        `등록된 체인: [${[...this.factories.keys()].join(', ')}]`
      )
    }

    // rpcUrl은 config.toml에서 데몬이 주입
    // 여기서는 팩토리만 호출, connect()는 호출자가 수행
    const rpcUrl = this.resolveRpcUrl(chain, network)
    const adapter = factory(network, rpcUrl)
    this.instances.set(key, adapter)
    return adapter
  }

  getRegisteredChains(): ChainType[] {
    return [...this.factories.keys()]
  }

  has(chain: ChainType): boolean {
    return this.factories.has(chain)
  }

  async disconnectAll(): Promise<void> {
    const disconnects = [...this.instances.values()]
      .filter(adapter => adapter.isConnected())
      .map(adapter => adapter.disconnect())
    await Promise.allSettled(disconnects)
    this.instances.clear()
  }

  /**
   * config.toml [rpc] 섹션에서 RPC URL을 해석한다.
   * ConfigLoader에 의존 (데몬 초기화 시 주입).
   */
  private resolveRpcUrl(chain: ChainType, network: NetworkType): string {
    // 구현은 데몬의 config loader에 위임
    // 여기서는 시그니처만 정의
    throw new Error('resolveRpcUrl must be injected by daemon')
  }
}
```

### 5.5 빌트인 어댑터 자동 등록

데몬 시작 시 빌트인 어댑터를 자동 등록하는 패턴:

```typescript
/**
 * 데몬 초기화 시 빌트인 어댑터 등록.
 * 파일 위치: packages/daemon/src/lifecycle/daemon.ts (DaemonLifecycle.boot() 내)
 */
function registerBuiltinAdapters(registry: AdapterRegistry): void {
  // Solana 어댑터 (packages/adapters/solana)
  registry.register('solana', (network, rpcUrl) => {
    return new SolanaAdapter(network, rpcUrl)
  })

  // EVM 어댑터 (packages/adapters/evm) -- 복수 체인 공유
  const evmChains: ChainType[] = ['ethereum', 'polygon', 'arbitrum']
  for (const chain of evmChains) {
    registry.register(chain, (network, rpcUrl) => {
      return new EVMAdapter(chain, network, rpcUrl)
    })
  }
}
```

### 5.6 config.toml [rpc] 섹션 연동

AdapterRegistry는 config.toml의 [rpc] 섹션에서 체인/네트워크별 RPC URL을 조회한다:

```toml
# config.toml
[rpc.solana]
mainnet = "https://api.mainnet-beta.solana.com"
devnet = "https://api.devnet.solana.com"

[rpc.solana.ws]
mainnet = "wss://api.mainnet-beta.solana.com"
devnet = "wss://api.devnet.solana.com"

[rpc.ethereum]
mainnet = ""      # 사용자 설정 필수
sepolia = ""

[rpc.polygon]
mainnet = "https://polygon-rpc.com"

[rpc.arbitrum]
mainnet = "https://arb1.arbitrum.io/rpc"
```

**RPC URL 해석 우선순위:**
1. 환경변수: `WAIAAS_RPC_SOLANA_MAINNET=https://custom.rpc.com`
2. config.toml: `[rpc.solana].mainnet`
3. 빌트인 기본값 (Solana만, EVM은 사용자 설정 필수)

**빈 URL 처리:**
- EVM 체인의 기본값이 `""` (빈 문자열)이면 에이전트 생성 시 에러:
  "RPC URL이 설정되지 않았습니다. config.toml [rpc.ethereum].mainnet을 설정하세요."

### 5.7 Action Provider와 어댑터 협력 패턴 (v0.6 추가)

Action Provider(IActionProvider)는 DeFi 프로토콜 지식을 캡슐화하고, AdapterRegistry를 통해 IChainAdapter에 접근한다. resolve-then-execute 패턴에서 어댑터는 실행만 담당한다.

```typescript
/**
 * Action Provider가 어댑터를 사용하는 패턴.
 * resolve()는 ContractCallRequest만 반환하고, 실행은 파이프라인이 담당.
 *
 * @see CHAIN-EXT-07 (62-action-provider-architecture.md) 섹션 3
 */
// 1. Action Provider의 resolve() -- 어댑터 직접 사용 안 함
const contractCall = await provider.resolve(actionParams)
// contractCall: ContractCallRequest (정책 평가 전)

// 2. 파이프라인 Stage 3: 정책 평가
const policyResult = await policyEngine.evaluate(contractCall)

// 3. 파이프라인 Stage 5: 어댑터로 빌드/실행
const adapter = registry.get(agent.chain, agent.network)
const unsignedTx = await adapter.buildContractCall(contractCall)
const simulation = await adapter.simulateTransaction(unsignedTx)
const signedTx = await adapter.signTransaction(unsignedTx, privateKey)
const result = await adapter.submitTransaction(signedTx)
```

> **핵심:** Action Provider는 어댑터에 직접 접근하지 않는다. resolve() -> 파이프라인 -> 어댑터 경로만 허용된다.

### 5.8 향후 플러그인 어댑터 인터페이스

v0.2에서는 구현하지 않되, 인터페이스만 정의하여 향후 확장 경로를 확보한다:

```typescript
/**
 * 플러그인 어댑터 인터페이스 (v0.3+).
 * 외부 개발자가 새 체인 어댑터를 구현하여 동적 로드할 수 있다.
 *
 * 플러그인 구조:
 * ~/.waiaas/plugins/
 *   └── adapter-sui/
 *       ├── package.json
 *       └── dist/
 *           └── index.js  (default export: IAdapterPlugin)
 *
 * v0.2에서는 이 인터페이스를 정의만 하고 로딩 메커니즘은 구현하지 않는다.
 */
interface IAdapterPlugin {
  /** 플러그인 이름 (예: 'sui', 'aptos') */
  readonly name: string

  /** 플러그인이 지원하는 체인 타입 */
  readonly chain: string  // ChainType 유니온에 없는 새 체인

  /** 플러그인 버전 (semver) */
  readonly version: string

  /**
   * 어댑터 팩토리를 반환한다.
   * AdapterRegistry.register()에 전달된다.
   */
  createFactory(): AdapterFactory
}
```

### 5.8 어댑터 생명주기

```
[데몬 시작]
    |
    v
registerBuiltinAdapters()
    -- registry.register('solana', factory)
    -- registry.register('ethereum', factory)
    -- registry.register('polygon', factory)
    -- registry.register('arbitrum', factory)
    |
    v
[에이전트 요청 수신]
    |
    v
registry.get(agent.chain, agent.network)
    -- 최초: factory(network, rpcUrl) -> 인스턴스 생성
    -- 이후: 캐시된 인스턴스 반환
    |
    v
adapter.connect(rpcUrl)  // 최초 사용 시
    |
    v
adapter.buildTransaction() -> simulateTransaction() -> signTransaction() -> submitTransaction()
    |
    v
[데몬 종료 -- Graceful Shutdown]
    |
    v
registry.disconnectAll()
    -- 모든 활성 어댑터의 disconnect() 호출
    -- WebSocket 구독 해제 (Solana)
    -- 인스턴스 캐시 클리어
```

---

## 6. Solana Adapter 상세 명세

파일 위치: `packages/adapters/solana/src/adapter.ts`

### 6.1 구현 개요

```typescript
/**
 * Solana 블록체인 어댑터.
 * @solana/kit 3.x의 함수형 pipe API를 내부적으로 사용하되,
 * IChainAdapter 명령형 인터페이스로 노출한다.
 *
 * 주요 의존성:
 * - @solana/kit 3.x: RPC, 트랜잭션 빌드, 서명, 제출
 * - @solana-program/system: SOL 전송 instruction
 *
 * v0.1 대비 변경:
 * - @solana/web3.js 1.x -> @solana/kit 3.x (pipe 기반 함수형 API)
 * - Squads Protocol v4 의존 제거 (로컬 정책 엔진으로 대체)
 * - Connection 객체 -> createSolanaRpc() + createSolanaRpcSubscriptions()
 */
class SolanaAdapter implements IChainAdapter {
  readonly chain: ChainType = 'solana'
  readonly network: NetworkType

  /** @solana/kit RPC 클라이언트 */
  private rpc: SolanaRpc | null = null

  /** @solana/kit RPC WebSocket 구독 클라이언트 */
  private rpcSubscriptions: SolanaRpcSubscriptions | null = null

  /** RPC 엔드포인트 URL */
  private rpcUrl: string

  /** WebSocket 엔드포인트 URL */
  private wssUrl: string

  constructor(network: NetworkType, rpcUrl: string) {
    this.network = network
    this.rpcUrl = rpcUrl
    this.wssUrl = this.deriveWssUrl(rpcUrl)
  }
}
```

### 6.2 연결 관리 메서드

#### `connect(rpcUrl: string)`

```typescript
async connect(rpcUrl: string): Promise<void> {
  this.rpcUrl = rpcUrl
  this.wssUrl = this.deriveWssUrl(rpcUrl)

  // 1. HTTP RPC 클라이언트 생성
  this.rpc = createSolanaRpc(this.rpcUrl)

  // 2. WebSocket 구독 클라이언트 생성
  // sendAndConfirmTransactionFactory에 필요
  this.rpcSubscriptions = createSolanaRpcSubscriptions(this.wssUrl)

  // 3. 헬스 체크로 연결 검증
  try {
    await this.rpc.getHealth().send()
  } catch (err) {
    this.rpc = null
    this.rpcSubscriptions = null
    throw new ChainError({
      code: ChainErrorCode.RPC_ERROR,
      chain: 'solana',
      message: `Solana RPC 연결 실패: ${this.rpcUrl}`,
      details: { rpcUrl: this.rpcUrl, originalError: String(err) },
      retryable: true,
      cause: err as Error,
    })
  }
}
```

**WSS URL 자동 추론 규칙:**

```typescript
/**
 * HTTP(S) URL에서 WSS URL을 자동 추론한다.
 * config.toml [rpc.solana.ws] 섹션에 명시적 값이 있으면 그것을 우선 사용.
 *
 * 변환 규칙:
 * - https://api.mainnet-beta.solana.com -> wss://api.mainnet-beta.solana.com
 * - http://localhost:8899 -> ws://localhost:8899
 */
private deriveWssUrl(httpUrl: string): string {
  return httpUrl
    .replace('https://', 'wss://')
    .replace('http://', 'ws://')
}
```

#### `disconnect()`

```typescript
async disconnect(): Promise<void> {
  // WebSocket 구독 해제
  // @solana/kit의 rpcSubscriptions는 AbortController로 관리
  this.rpc = null
  this.rpcSubscriptions = null
}
```

#### `isConnected()`

```typescript
isConnected(): boolean {
  return this.rpc !== null
}
```

#### `getHealth()`

```typescript
async getHealth(): Promise<{ healthy: boolean; latency: number }> {
  if (!this.rpc) {
    return { healthy: false, latency: -1 }
  }

  const start = performance.now()
  try {
    await this.rpc.getHealth().send()
    const latency = Math.round(performance.now() - start)
    return { healthy: true, latency }
  } catch {
    const latency = Math.round(performance.now() - start)
    return { healthy: false, latency }
  }
}
```

### 6.3 주소 검증

#### `isValidAddress(address: string)`

```typescript
/**
 * Solana 주소 검증.
 * Base58 디코딩 성공 + 32바이트 길이 확인.
 *
 * @solana/kit의 address() 함수는 무효 주소에 대해 예외를 던진다.
 * 이를 try/catch로 감싸서 boolean을 반환한다.
 */
isValidAddress(address: string): boolean {
  try {
    // @solana/kit의 address() 유틸리티로 검증
    // Base58 디코딩 + 32바이트 길이 확인
    const decoded = bs58.decode(address)
    return decoded.length === 32
  } catch {
    return false
  }
}
```

### 6.4 잔액 조회

#### `getBalance(address: string)`

```typescript
async getBalance(address: string): Promise<BalanceInfo> {
  if (!this.rpc) throw this.notConnectedError()

  if (!this.isValidAddress(address)) {
    throw new ChainError({
      code: ChainErrorCode.INVALID_ADDRESS,
      chain: 'solana',
      message: `유효하지 않은 Solana 주소: ${address}`,
      retryable: false,
    })
  }

  try {
    // @solana/kit: getBalance(address).send() -> { value: lamports (bigint) }
    const { value: lamports } = await this.rpc
      .getBalance(address as Address)
      .send()

    return {
      address,
      balance: lamports,
      decimals: 9,
      symbol: 'SOL',
    }
  } catch (err) {
    throw new ChainError({
      code: ChainErrorCode.RPC_ERROR,
      chain: 'solana',
      message: `잔액 조회 실패: ${address}`,
      details: { address, originalError: String(err) },
      retryable: true,
      cause: err as Error,
    })
  }
}
```

### 6.5 트랜잭션 파이프라인

#### `buildTransaction(request: TransferRequest)`

```typescript
/**
 * @solana/kit 3.x pipe 패턴으로 트랜잭션 메시지를 구성한다.
 *
 * 내부 흐름:
 * 1. getLatestBlockhash().send() -> blockhash + lastValidBlockHeight
 * 2. pipe(
 *      createTransactionMessage({ version: 0 }),
 *      tx => setTransactionMessageFeePayer(from, tx),
 *      tx => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
 *      tx => appendTransactionMessageInstruction(transferSolInstruction, tx)
 *    )
 * 3. 메시지를 직렬화하여 UnsignedTransaction 반환
 *
 * v0.2에서는 SOL 전송만 지원. SPL 토큰 전송은 v0.3 확장 포인트.
 */
async buildTransaction(request: TransferRequest): Promise<UnsignedTransaction> {
  if (!this.rpc) throw this.notConnectedError()

  // 1. 최신 blockhash 조회
  const { value: latestBlockhash } = await this.rpc
    .getLatestBlockhash()
    .send()

  // 2. pipe 패턴으로 트랜잭션 메시지 구성
  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayer(
      address(request.from),
      tx
    ),
    tx => setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      tx
    ),
    tx => appendTransactionMessageInstruction(
      getTransferSolInstruction({
        amount: lamports(request.amount),
        destination: address(request.to),
        source: address(request.from),
      }),
      tx
    )
  )

  // 3. 메모가 있으면 Memo Program instruction 추가
  // (SPL Memo Program: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr)
  if (request.memo) {
    // Memo instruction은 향후 구현
    // appendTransactionMessageInstruction(memoInstruction, transactionMessage)
  }

  // 4. 트랜잭션 메시지 직렬화
  const serialized = serializeTransactionMessage(transactionMessage)

  // 5. expiresAt 계산
  // lastValidBlockHeight - 현재 슬롯 = 남은 슬롯 수
  // 남은 슬롯 수 * 400ms = 남은 시간
  // 보수적으로 ~60초로 설정
  const expiresAt = new Date(Date.now() + 60_000)

  // 6. 기본 수수료 추정 (base fee = 5000 lamports/signature)
  const estimatedFee = 5000n

  return {
    chain: 'solana',
    serialized,
    estimatedFee,
    expiresAt,
    metadata: {
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      version: 0,
    },
  }
}
```

#### `simulateTransaction(tx: UnsignedTransaction)`

```typescript
/**
 * 트랜잭션을 RPC 노드에서 시뮬레이션한다.
 *
 * @solana/kit: simulateTransaction(transaction, { commitment: 'confirmed' }).send()
 * compute units 소비량과 실행 로그를 추출한다.
 */
async simulateTransaction(tx: UnsignedTransaction): Promise<SimulationResult> {
  if (!this.rpc) throw this.notConnectedError()

  // 유효 기한 확인
  if (tx.expiresAt && tx.expiresAt < new Date()) {
    throw new ChainError({
      code: SolanaErrorCode.BLOCKHASH_EXPIRED,
      chain: 'solana',
      message: '트랜잭션 blockhash가 만료되었습니다. 재빌드가 필요합니다.',
      retryable: true,
    })
  }

  try {
    // 트랜잭션 메시지 역직렬화 후 시뮬레이션
    const result = await this.rpc
      .simulateTransaction(tx.serialized, {
        commitment: 'confirmed',
        encoding: 'base64',
      })
      .send()

    return {
      success: result.value.err === null,
      logs: result.value.logs ?? [],
      unitsConsumed: result.value.unitsConsumed
        ? BigInt(result.value.unitsConsumed)
        : undefined,
      error: result.value.err
        ? JSON.stringify(result.value.err)
        : undefined,
    }
  } catch (err) {
    throw new ChainError({
      code: ChainErrorCode.SIMULATION_FAILED,
      chain: 'solana',
      message: '트랜잭션 시뮬레이션 실패',
      details: { originalError: String(err) },
      retryable: true,
      cause: err as Error,
    })
  }
}
```

#### `signTransaction(tx: UnsignedTransaction, privateKey: Uint8Array)`

```typescript
/**
 * Ed25519 서명을 생성한다.
 *
 * 키 처리 전략:
 * 1. privateKey는 sodium guarded memory에서 온 Uint8Array (64바이트 keypair)
 * 2. @solana/kit의 signTransactionMessageWithSigners()는 Signer 인터페이스 필요
 * 3. 어댑터 내부에서 CryptoKeyPair를 생성하여 Signer로 래핑
 *
 * 보안 주의:
 * - privateKey를 일반 변수에 복사하지 않음
 * - 서명 완료 후 호출자가 sodium_memzero() 수행
 * - CryptoKeyPair는 Web Crypto API의 non-extractable 키로 생성
 *
 * Solana keypair 구조:
 * - 처음 32바이트: Ed25519 비밀 시드 (private scalar)
 * - 마지막 32바이트: Ed25519 공개키
 * - signBytes()는 전체 64바이트 keypair를 받음
 */
async signTransaction(
  tx: UnsignedTransaction,
  privateKey: Uint8Array
): Promise<Uint8Array> {
  // 유효 기한 확인
  if (tx.expiresAt && tx.expiresAt < new Date()) {
    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_EXPIRED,
      chain: 'solana',
      message: '서명 시점에 트랜잭션이 이미 만료되었습니다.',
      retryable: true,
    })
  }

  try {
    // 1. privateKey(64바이트)에서 CryptoKeyPair 생성
    //    @solana/kit의 createKeyPairFromBytes() 사용
    const keyPair = await createKeyPairFromBytes(privateKey)

    // 2. 트랜잭션 메시지 역직렬화
    const txMessage = deserializeTransactionMessage(tx.serialized)

    // 3. KeyPairSigner 생성
    const signer = await createSignerFromKeyPair(keyPair)

    // 4. fee payer를 signer로 설정한 메시지 재구성
    const messageWithSigner = setTransactionMessageFeePayerSigner(
      signer,
      txMessage
    )

    // 5. 서명 수행
    const signedTx = await signTransactionMessageWithSigners(messageWithSigner)

    // 6. 서명된 트랜잭션 직렬화
    return serializeTransaction(signedTx)
  } catch (err) {
    if (err instanceof ChainError) throw err
    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_FAILED,
      chain: 'solana',
      message: '트랜잭션 서명 실패',
      details: { originalError: String(err) },
      retryable: false,
      cause: err as Error,
    })
  }
}
```

#### `submitTransaction(signedTx: Uint8Array)`

```typescript
/**
 * 서명된 트랜잭션을 Solana 네트워크에 제출한다.
 *
 * @solana/kit sendAndConfirmTransactionFactory 사용:
 * - rpc + rpcSubscriptions 모두 필요 (WebSocket으로 확인 구독)
 * - skipPreflight=true: 2단계 시뮬레이션에서 이미 검증 완료
 * - commitment='confirmed': 기본 확인 수준
 *
 * sendAndConfirmTransactionFactory는 트랜잭션 전송 후
 * WebSocket 구독으로 상태 변화를 모니터링하여 confirmed/finalized까지 대기한다.
 */
async submitTransaction(signedTx: Uint8Array): Promise<SubmitResult> {
  if (!this.rpc || !this.rpcSubscriptions) throw this.notConnectedError()

  try {
    // 1. sendAndConfirm 팩토리 생성
    const sendAndConfirm = sendAndConfirmTransactionFactory({
      rpc: this.rpc,
      rpcSubscriptions: this.rpcSubscriptions,
    })

    // 2. 서명된 트랜잭션 역직렬화
    const transaction = deserializeTransaction(signedTx)

    // 3. 전송 + 확인 대기
    await sendAndConfirm(transaction, {
      commitment: 'confirmed',
      skipPreflight: true,  // 이미 시뮬레이션 완료
    })

    // 4. 서명(txHash) 추출
    const signature = getSignatureFromTransaction(transaction)

    return {
      txHash: signature,
      status: 'confirmed',
      fee: 5000n,  // Solana 기본 수수료 (정확한 값은 getTransaction으로 조회)
    }
  } catch (err) {
    // blockhash 만료 에러 감지
    const errStr = String(err)
    if (errStr.includes('BlockhashNotFound') || errStr.includes('expired')) {
      throw new ChainError({
        code: SolanaErrorCode.BLOCKHASH_EXPIRED,
        chain: 'solana',
        message: '트랜잭션 blockhash가 만료되었습니다.',
        retryable: true,
        cause: err as Error,
      })
    }

    // 프로그램 에러 감지
    if (errStr.includes('InstructionError') || errStr.includes('ProgramError')) {
      throw new ChainError({
        code: SolanaErrorCode.PROGRAM_ERROR,
        chain: 'solana',
        message: 'Solana 프로그램 실행 에러',
        details: { rawError: errStr },
        retryable: false,
        cause: err as Error,
      })
    }

    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_FAILED,
      chain: 'solana',
      message: '트랜잭션 제출 실패',
      details: { originalError: errStr },
      retryable: true,
      cause: err as Error,
    })
  }
}
```

### 6.6 트랜잭션 조회 메서드

#### `getTransactionStatus(txHash: string)`

```typescript
async getTransactionStatus(txHash: string): Promise<SubmitResult> {
  if (!this.rpc) throw this.notConnectedError()

  try {
    const { value: statuses } = await this.rpc
      .getSignatureStatuses([txHash as Signature])
      .send()

    const status = statuses[0]

    if (!status) {
      return { txHash, status: 'submitted' }
    }

    if (status.err) {
      return {
        txHash,
        status: 'submitted',  // 실패도 submitted로 반환, 에러는 별도 조회
      }
    }

    const confirmationStatus =
      status.confirmationStatus === 'finalized' ? 'finalized' :
      status.confirmationStatus === 'confirmed' ? 'confirmed' :
      'submitted'

    return {
      txHash,
      status: confirmationStatus,
      blockNumber: status.slot ? BigInt(status.slot) : undefined,
    }
  } catch (err) {
    throw new ChainError({
      code: ChainErrorCode.RPC_ERROR,
      chain: 'solana',
      message: `트랜잭션 상태 조회 실패: ${txHash}`,
      retryable: true,
      cause: err as Error,
    })
  }
}
```

#### `waitForConfirmation(txHash: string, timeout?: number)`

```typescript
/**
 * WebSocket 구독으로 트랜잭션 확인을 대기한다.
 * @solana/kit의 rpcSubscriptions를 사용하여 효율적으로 모니터링.
 * 폴백: WebSocket 불가 시 500ms 간격 폴링.
 */
async waitForConfirmation(
  txHash: string,
  timeout: number = 60_000
): Promise<SubmitResult> {
  const deadline = Date.now() + timeout
  const pollInterval = 500  // ms

  while (Date.now() < deadline) {
    const result = await this.getTransactionStatus(txHash)
    if (result.status === 'confirmed' || result.status === 'finalized') {
      return result
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }

  // 타임아웃: 마지막 상태 반환 (에러가 아님)
  return this.getTransactionStatus(txHash)
}
```

### 6.7 수수료 추정

#### `estimateFee(request: TransferRequest)`

```typescript
/**
 * Solana 수수료 추정.
 *
 * Solana 수수료 구조:
 * - Base fee: 5000 lamports/signature (고정)
 * - Priority fee: 선택적 (혼잡 시 트랜잭션 우선순위 높이기)
 *
 * v0.2에서는 단순 SOL 전송(1 서명)만 지원하므로 5000 lamports 고정.
 * priority fee는 getRecentPrioritizationFees()로 조회 가능하나 v0.2에서는 미사용.
 */
async estimateFee(request: TransferRequest): Promise<bigint> {
  // Solana base fee: 5000 lamports per signature
  // SOL 전송은 1 signature -> 5000 lamports
  const baseFee = 5000n

  // 향후 priority fee 추가 시:
  // const priorityFees = await this.rpc.getRecentPrioritizationFees().send()
  // const medianPriorityFee = calculateMedian(priorityFees)

  return baseFee
}
```

### 6.8 RPC 기본값 테이블

| Network | HTTP RPC URL | WebSocket URL | 비고 |
|---------|-------------|---------------|------|
| `mainnet-beta` | `https://api.mainnet-beta.solana.com` | `wss://api.mainnet-beta.solana.com` | 공용 RPC, rate limit 엄격. 프로덕션에서는 Helius/QuickNode 권장 |
| `devnet` | `https://api.devnet.solana.com` | `wss://api.devnet.solana.com` | 개발/테스트용. 무료 에어드롭 가능 |
| `testnet` | `https://api.testnet.solana.com` | `wss://api.testnet.solana.com` | 검증자 테스트용. 일반 개발에는 devnet 권장 |

**공용 RPC 제한 사항:**
- Rate limit: 초당 ~40 요청 (IP 기반)
- WebSocket 연결: 동시 ~5 연결
- `getRecentPrioritizationFees()` 등 일부 메서드 지원 안 함
- 프로덕션 배포 시 전용 RPC 제공자(Helius, QuickNode, Triton) 사용 권장

### 6.9 Solana Adapter 내부 헬퍼

```typescript
/**
 * 연결되지 않은 상태에서 호출 시 공통 에러.
 */
private notConnectedError(): ChainError {
  return new ChainError({
    code: ChainErrorCode.RPC_ERROR,
    chain: 'solana',
    message: 'Solana RPC에 연결되지 않았습니다. connect()를 먼저 호출하세요.',
    retryable: false,
  })
}

/**
 * LAMPORTS_PER_SOL 상수.
 * @solana/kit 3.x에서는 더 이상 SDK에서 제공하지 않으므로 수동 정의.
 */
static readonly LAMPORTS_PER_SOL = 1_000_000_000n
```

### 6.10 [v0.7 보완] Nonce 관리 (Solana: no-op)

> **[v0.7 보완]** IChainAdapter가 19개 메서드로 확장되면서 추가된 getCurrentNonce, resetNonceTracker의 Solana 구현. Solana는 blockhash 기반이므로 nonce 개념이 없다. 인터페이스 일관성을 위해 no-op으로 구현한다.

```typescript
/**
 * [v0.7 보완] Solana는 nonce 기반이 아니므로 항상 0을 반환한다.
 * Solana 트랜잭션은 blockhash로 수명을 관리하며, 순차적 nonce 개념이 없다.
 *
 * @param _address - 미사용 (인터페이스 호환용)
 * @returns 항상 0
 */
async getCurrentNonce(_address: string): Promise<number> {
  return 0
}

/**
 * [v0.7 보완] Solana는 nonce 트래커가 없으므로 no-op이다.
 * 호출해도 아무 동작을 하지 않는다.
 *
 * @param _address - 미사용 (인터페이스 호환용)
 */
resetNonceTracker(_address?: string): void {
  // no-op: Solana는 blockhash 기반, nonce 트래커 없음
}
```

### 6.11 [v0.8 추가] sweepAll -- 에이전트 지갑 자금 전량 회수

> **[v0.8 추가]** IChainAdapter가 20개 메서드로 확장되면서 추가된 sweepAll의 SolanaAdapter 구현 지침. WithdrawService에서 직접 호출하며 정책 엔진을 우회한다. (WITHDRAW-06, WITHDRAW-07)

**SolanaAdapter.sweepAll 구현 전략:**

1. `getAssets(from)` 호출로 SPL 토큰 목록 전수 조사
2. 각 SPL 토큰에 대해 transfer + closeAccount 일괄 수행 (buildBatch 활용 가능)
   - transfer: 토큰 잔액 전량을 `to`의 ATA(Associated Token Account)로 전송
   - closeAccount: 빈 토큰 계정을 닫아 rent 회수 (lamports -> from 주소)
3. SOL 전량 전송은 **반드시 마지막** -- 잔액에서 tx fee를 차감하고 전송
   - 토큰 계정 closeAccount로 회수된 rent lamports를 포함한 최종 잔액 기준
   - SOL이 먼저 전송되면 이후 토큰 전송의 tx fee를 지불할 수 없음 (WITHDRAW-07)
4. 부분 실패 허용: 특정 토큰 전송 실패 시 `failed` 배열에 기록하고 나머지 계속 처리

```typescript
/**
 * [v0.8 추가] 에이전트 지갑의 전체 자산을 Owner 주소로 회수한다.
 *
 * @param from - 에이전트 지갑 주소 (Base58)
 * @param to - Owner 지갑 주소 (Base58, agents.owner_address)
 * @returns SweepResult -- succeeded/failed 분리, rentRecovered 기록
 */
async sweepAll(from: string, to: string): Promise<SweepResult> {
  if (!this.rpc) throw this.notConnectedError()

  // 1. 보유 자산 전수 조사
  const assets = await this.getAssets(from)
  const splTokens = assets.filter(a => !a.isNative)

  const succeeded: SweepTransfer[] = []
  const failed: SweepTransferError[] = []
  let rentRecovered = 0n

  // 2. SPL 토큰별 transfer + closeAccount (배치 처리)
  for (const token of splTokens) {
    try {
      // transfer 전량 + closeAccount -> rent 회수
      // buildBatch 활용 가능 (2 instructions per token)
      const result = await this.transferAndClose(from, to, token)
      succeeded.push(result.transfer)
      rentRecovered += result.rentLamports
    } catch (error) {
      failed.push({
        mint: token.mint!,
        symbol: token.symbol,
        amount: token.balance.raw.toString(),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // 3. SOL 전량 전송 (마지막 -- WITHDRAW-07)
  try {
    const balance = await this.getBalance(from)
    const fee = await this.estimateNativeTransferFee()
    const transferAmount = balance.balance.raw - fee.totalFee
    if (transferAmount > 0n) {
      // SOL 전송 (잔액 - fee)
      succeeded.push({
        type: 'native',
        symbol: 'SOL',
        amount: transferAmount.toString(),
        txHash: '...', // 실제 구현에서 채워짐
      })
    }
  } catch (error) {
    failed.push({
      mint: null,
      symbol: 'SOL',
      amount: '0',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return { succeeded, failed, rentRecovered: rentRecovered.toString() }
}
```

**Solana 토큰 계정 rent 회수:**
- SPL 토큰 계정은 생성 시 rent-exempt 최소 금액(약 0.00203928 SOL)을 예치한다
- closeAccount로 토큰 계정을 닫으면 이 rent가 from 주소로 반환된다
- 반환된 rent는 `rentRecovered` 필드에 누적 기록한다
- 최종 SOL 전송 시 이 rent 회수분이 잔액에 포함된다

---

## 7. EVM Adapter 상세 명세

파일 위치: `packages/adapters/evm/src/adapter.ts`

### 7.1 구현 개요

```typescript
/**
 * EVM 블록체인 어댑터.
 * viem의 Client/Action 패턴을 내부적으로 사용하되,
 * IChainAdapter 명령형 인터페이스로 노출한다.
 *
 * 단일 EVMAdapter 클래스가 모든 EVM 호환 체인을 지원한다:
 * - Ethereum (chainId: 1)
 * - Polygon (chainId: 137)
 * - Arbitrum (chainId: 42161)
 *
 * 체인별 차이는 viem의 chain 정의(mainnet, polygon, arbitrum)로 처리한다.
 * 네이티브 토큰 심볼은 체인별로 다르다: ETH, MATIC, ETH(Arbitrum).
 *
 * 주요 의존성:
 * - viem: PublicClient (읽기), WalletClient (서명/제출), chain 정의
 *
 * v0.1 대비 변경:
 * - ethers.js v6 -> viem (27KB vs 130KB, 타입 안전성 우수)
 * - ERC-4337/Safe 스마트 월렛 -> 제거 (로컬 키스토어 직접 서명)
 * - Gas 추정: ethers.estimateGas() -> viem estimateGas() + EIP-1559
 */
class EVMAdapter implements IChainAdapter {
  readonly chain: ChainType
  readonly network: NetworkType

  /** viem PublicClient (읽기 전용 RPC 호출) */
  private client: PublicClient | null = null

  /** viem chain 정의 */
  private viemChain: Chain

  /** RPC URL */
  private rpcUrl: string

  /** 로컬 nonce 트래커 */
  private nonceTracker: Map<string, number> = new Map()

  constructor(chain: ChainType, network: NetworkType, rpcUrl: string) {
    this.chain = chain
    this.network = network
    this.rpcUrl = rpcUrl
    this.viemChain = this.resolveViemChain(chain)
  }

  /**
   * ChainType에서 viem Chain 정의를 해석한다.
   */
  private resolveViemChain(chain: ChainType): Chain {
    const chainMap: Record<string, Chain> = {
      ethereum: mainnet,    // from 'viem/chains'
      polygon: polygon,
      arbitrum: arbitrum,
    }
    const resolved = chainMap[chain]
    if (!resolved) {
      throw new Error(`지원하지 않는 EVM 체인: ${chain}`)
    }
    return resolved
  }
}
```

### 7.2 연결 관리 메서드

#### `connect(rpcUrl: string)`

```typescript
async connect(rpcUrl: string): Promise<void> {
  this.rpcUrl = rpcUrl

  // 1. viem PublicClient 생성
  this.client = createPublicClient({
    chain: this.viemChain,
    transport: http(this.rpcUrl),
  })

  // 2. 헬스 체크 (getBlockNumber로 연결 검증)
  try {
    await this.client.getBlockNumber()
  } catch (err) {
    this.client = null
    throw new ChainError({
      code: ChainErrorCode.RPC_ERROR,
      chain: this.chain,
      message: `EVM RPC 연결 실패: ${this.rpcUrl}`,
      details: { rpcUrl: this.rpcUrl, chainId: this.viemChain.id },
      retryable: true,
      cause: err as Error,
    })
  }
}
```

#### `disconnect()`

```typescript
async disconnect(): Promise<void> {
  this.client = null
  this.nonceTracker.clear()
}
```

#### `isConnected()`

```typescript
isConnected(): boolean {
  return this.client !== null
}
```

#### `getHealth()`

```typescript
async getHealth(): Promise<{ healthy: boolean; latency: number }> {
  if (!this.client) {
    return { healthy: false, latency: -1 }
  }

  const start = performance.now()
  try {
    await this.client.getBlockNumber()
    const latency = Math.round(performance.now() - start)
    return { healthy: true, latency }
  } catch {
    const latency = Math.round(performance.now() - start)
    return { healthy: false, latency }
  }
}
```

### 7.3 주소 검증

#### `isValidAddress(address: string)`

```typescript
/**
 * EVM 주소 검증.
 * - 0x 접두어 + 40자 hex (42자 총 길이)
 * - EIP-55 mixed-case 체크섬 검증 (선택적)
 *
 * viem의 isAddress() 유틸리티를 사용한다.
 */
isValidAddress(address: string): boolean {
  return isAddress(address)  // from 'viem'
}
```

### 7.4 잔액 조회

#### `getBalance(address: string)`

```typescript
async getBalance(address: string): Promise<BalanceInfo> {
  if (!this.client) throw this.notConnectedError()

  if (!this.isValidAddress(address)) {
    throw new ChainError({
      code: ChainErrorCode.INVALID_ADDRESS,
      chain: this.chain,
      message: `유효하지 않은 EVM 주소: ${address}`,
      retryable: false,
    })
  }

  try {
    // viem: getBalance({ address }) -> wei (bigint)
    const wei = await this.client.getBalance({
      address: address as `0x${string}`,
    })

    return {
      address,
      balance: wei,
      decimals: 18,
      symbol: this.getNativeSymbol(),
    }
  } catch (err) {
    throw new ChainError({
      code: ChainErrorCode.RPC_ERROR,
      chain: this.chain,
      message: `잔액 조회 실패: ${address}`,
      details: { address, originalError: String(err) },
      retryable: true,
      cause: err as Error,
    })
  }
}

/**
 * 체인별 네이티브 토큰 심볼을 반환한다.
 */
private getNativeSymbol(): string {
  const symbolMap: Record<string, string> = {
    ethereum: 'ETH',
    polygon: 'MATIC',
    arbitrum: 'ETH',
  }
  return symbolMap[this.chain] ?? 'ETH'
}
```

### 7.5 트랜잭션 파이프라인

#### `buildTransaction(request: TransferRequest)`

```typescript
/**
 * EVM 트랜잭션을 빌드한다.
 *
 * EIP-1559 수수료 모델 적용:
 * - maxFeePerGas = baseFee * 2 + maxPriorityFeePerGas
 * - maxPriorityFeePerGas = 기본 2 gwei (네트워크 상태에 따라 조정)
 * - gasLimit = estimateGas() * 1.1 (10% 안전 마진)
 *
 * Nonce 관리:
 * - getTransactionCount()로 현재 nonce 조회
 * - 로컬 nonceTracker와 비교하여 높은 값 사용 (nonce gap 방지)
 */
async buildTransaction(request: TransferRequest): Promise<UnsignedTransaction> {
  if (!this.client) throw this.notConnectedError()

  const fromAddr = request.from as `0x${string}`
  const toAddr = request.to as `0x${string}`

  // 1. Nonce 조회 (로컬 트래커와 온체인 값 중 높은 것)
  const onchainNonce = await this.client.getTransactionCount({
    address: fromAddr,
  })
  const localNonce = this.nonceTracker.get(request.from) ?? 0
  const nonce = Math.max(onchainNonce, localNonce)

  // 2. Gas 추정
  const estimatedGas = await this.client.estimateGas({
    account: fromAddr,
    to: toAddr,
    value: request.amount,
  })
  // 10% 안전 마진
  const gasLimit = (estimatedGas * 110n) / 100n

  // 3. EIP-1559 수수료 추정
  const block = await this.client.getBlock({ blockTag: 'latest' })
  const baseFee = block.baseFeePerGas ?? 0n
  const maxPriorityFeePerGas = 2_000_000_000n  // 2 gwei
  const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas

  // 4. 총 예상 수수료
  const estimatedFee = gasLimit * maxFeePerGas

  // 5. 트랜잭션 객체 직렬화
  const txData = {
    to: toAddr,
    value: request.amount,
    nonce,
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    chainId: this.viemChain.id,
    type: 'eip1559' as const,
    data: request.memo
      ? (`0x${Buffer.from(request.memo, 'utf-8').toString('hex')}` as `0x${string}`)
      : undefined,
  }

  const serialized = serializeTransaction(txData)

  // 6. 로컬 nonce 트래커 업데이트
  this.nonceTracker.set(request.from, nonce + 1)

  return {
    chain: this.chain,
    serialized: hexToBytes(serialized),
    estimatedFee,
    expiresAt: undefined,  // EVM은 nonce 기반, 유효 기한 없음
    nonce,  // [v0.7 보완] 명시적 optional 필드로 승격 (기존 metadata.nonce 대체)
    metadata: {
      // [v0.7 보완] nonce는 tx.nonce로 승격. metadata에도 호환성을 위해 유지하되, tx.nonce가 SSoT
      nonce,
      chainId: this.viemChain.id,
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit,
    },
  }
}
```

#### `simulateTransaction(tx: UnsignedTransaction)`

```typescript
/**
 * EVM 트랜잭션을 시뮬레이션한다.
 *
 * 단순 ETH 전송: client.call()로 실행 결과 확인
 * 컨트랙트 호출 (v0.3+): client.simulateContract()
 *
 * EVM에서 단순 전송의 시뮬레이션은 주로 잔액 부족 확인에 사용된다.
 */
async simulateTransaction(tx: UnsignedTransaction): Promise<SimulationResult> {
  if (!this.client) throw this.notConnectedError()

  try {
    const metadata = tx.metadata as {
      nonce: number
      chainId: number
      maxFeePerGas: bigint
      maxPriorityFeePerGas: bigint
      gasLimit: bigint
    }

    // 트랜잭션 역직렬화하여 call() 실행
    const txRequest = parseTransaction(bytesToHex(tx.serialized))

    await this.client.call({
      account: txRequest.from,
      to: txRequest.to,
      value: txRequest.value,
      data: txRequest.data,
      gas: metadata.gasLimit,
    })

    return {
      success: true,
      logs: [],
      unitsConsumed: metadata.gasLimit,  // 추정치
    }
  } catch (err) {
    const errStr = String(err)

    // revert reason 추출
    if (errStr.includes('revert') || errStr.includes('execution reverted')) {
      return {
        success: false,
        logs: [],
        error: errStr,
      }
    }

    // 잔액 부족
    if (errStr.includes('insufficient funds')) {
      return {
        success: false,
        logs: [],
        error: 'Insufficient balance for transfer + gas',
      }
    }

    throw new ChainError({
      code: ChainErrorCode.SIMULATION_FAILED,
      chain: this.chain,
      message: 'EVM 트랜잭션 시뮬레이션 실패',
      details: { originalError: errStr },
      retryable: true,
      cause: err as Error,
    })
  }
}
```

#### `signTransaction(tx: UnsignedTransaction, privateKey: Uint8Array)`

```typescript
/**
 * secp256k1 ECDSA 서명을 생성한다.
 *
 * 키 처리:
 * 1. privateKey는 sodium guarded memory에서 온 Uint8Array (32바이트 secp256k1)
 * 2. viem의 signTransaction()은 Hex 포맷 privateKey 필요
 * 3. 어댑터 내부에서 Uint8Array -> Hex 변환 후 서명
 *
 * 서명 결과: RLP 인코딩된 서명 트랜잭션 (r, s, v 포함)
 *
 * 보안 주의:
 * - Hex 변환된 키를 변수에 저장하지 않고 즉시 사용
 * - 서명 완료 후 호출자가 원본 privateKey에 대해 sodium_memzero() 수행
 */
async signTransaction(
  tx: UnsignedTransaction,
  privateKey: Uint8Array
): Promise<Uint8Array> {
  try {
    // 1. privateKey를 Hex 포맷으로 변환 (viem 요구사항)
    const privateKeyHex = bytesToHex(privateKey) as `0x${string}`

    // 2. viem Account 생성
    const account = privateKeyToAccount(privateKeyHex)

    // 3. 트랜잭션 파라미터 복원
    const metadata = tx.metadata as {
      nonce: number
      chainId: number
      maxFeePerGas: bigint
      maxPriorityFeePerGas: bigint
      gasLimit: bigint
    }

    const txRequest = parseTransaction(bytesToHex(tx.serialized))

    // 4. 서명 수행
    const signedTx = await account.signTransaction({
      to: txRequest.to,
      value: txRequest.value,
      nonce: metadata.nonce,
      gas: metadata.gasLimit,
      maxFeePerGas: metadata.maxFeePerGas,
      maxPriorityFeePerGas: metadata.maxPriorityFeePerGas,
      chainId: metadata.chainId,
      data: txRequest.data,
      type: 'eip1559',
    })

    // 5. 서명된 트랜잭션을 바이트로 변환
    return hexToBytes(signedTx)
  } catch (err) {
    if (err instanceof ChainError) throw err
    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_FAILED,
      chain: this.chain,
      message: 'EVM 트랜잭션 서명 실패',
      details: { originalError: String(err) },
      retryable: false,
      cause: err as Error,
    })
  }
}
```

#### `submitTransaction(signedTx: Uint8Array)`

```typescript
/**
 * 서명된 트랜잭션을 EVM 네트워크에 제출한다.
 *
 * viem 흐름:
 * 1. sendRawTransaction(): 서명된 트랜잭션을 노드에 전송
 * 2. waitForTransactionReceipt(): 블록에 포함될 때까지 대기
 *
 * Nonce 충돌 시 EVM_NONCE_TOO_LOW 에러를 던진다.
 */
async submitTransaction(signedTx: Uint8Array): Promise<SubmitResult> {
  if (!this.client) throw this.notConnectedError()

  try {
    // 1. Raw 트랜잭션 전송
    const txHash = await this.client.sendRawTransaction({
      serializedTransaction: bytesToHex(signedTx) as `0x${string}`,
    })

    // 2. 영수증 대기 (confirmed)
    const receipt = await this.client.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    })

    return {
      txHash,
      status: receipt.status === 'success' ? 'confirmed' : 'submitted',
      blockNumber: receipt.blockNumber,
      fee: receipt.gasUsed * receipt.effectiveGasPrice,
    }
  } catch (err) {
    const errStr = String(err)

    // Nonce 충돌
    if (errStr.includes('nonce too low') || errStr.includes('NONCE_TOO_LOW')) {
      // nonce 트래커 리셋
      this.nonceTracker.clear()
      throw new ChainError({
        code: EVMErrorCode.NONCE_TOO_LOW,
        chain: this.chain,
        message: 'Nonce 충돌: 이미 처리된 nonce입니다.',
        details: { rawError: errStr },
        retryable: true,
        cause: err as Error,
      })
    }

    // Gas 부족
    if (errStr.includes('gas too low') || errStr.includes('intrinsic gas too low')) {
      throw new ChainError({
        code: EVMErrorCode.GAS_TOO_LOW,
        chain: this.chain,
        message: 'Gas limit이 부족합니다.',
        retryable: true,
        cause: err as Error,
      })
    }

    // Revert
    if (errStr.includes('revert') || errStr.includes('execution reverted')) {
      throw new ChainError({
        code: EVMErrorCode.REVERT,
        chain: this.chain,
        message: '컨트랙트 실행이 revert되었습니다.',
        details: { rawError: errStr },
        retryable: false,
        cause: err as Error,
      })
    }

    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_FAILED,
      chain: this.chain,
      message: 'EVM 트랜잭션 제출 실패',
      details: { originalError: errStr },
      retryable: true,
      cause: err as Error,
    })
  }
}
```

### 7.6 트랜잭션 조회 메서드

#### `getTransactionStatus(txHash: string)`

```typescript
async getTransactionStatus(txHash: string): Promise<SubmitResult> {
  if (!this.client) throw this.notConnectedError()

  try {
    const receipt = await this.client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    })

    if (!receipt) {
      return { txHash, status: 'submitted' }
    }

    // 현재 블록과의 차이로 확정성 판단
    const currentBlock = await this.client.getBlockNumber()
    const confirmations = Number(currentBlock - receipt.blockNumber)

    // 체인별 확정 블록 수
    const finalityBlocks = this.getFinalityBlocks()
    const status = confirmations >= finalityBlocks ? 'finalized' : 'confirmed'

    return {
      txHash,
      status: receipt.status === 'success' ? status : 'submitted',
      confirmations,
      blockNumber: receipt.blockNumber,
      fee: receipt.gasUsed * receipt.effectiveGasPrice,
    }
  } catch (err) {
    // 영수증이 없으면 아직 pending
    return { txHash, status: 'submitted' }
  }
}

/**
 * 체인별 최종 확정에 필요한 블록 수.
 */
private getFinalityBlocks(): number {
  const finalityMap: Record<string, number> = {
    ethereum: 15,     // ~3분 (12초/블록)
    polygon: 128,     // ~4분 (2초/블록)
    arbitrum: 1,      // L2 자체 확인 (L1 최종성은 별도)
  }
  return finalityMap[this.chain] ?? 15
}
```

#### `waitForConfirmation(txHash: string, timeout?: number)`

```typescript
async waitForConfirmation(
  txHash: string,
  timeout: number = 60_000
): Promise<SubmitResult> {
  if (!this.client) throw this.notConnectedError()

  try {
    // viem의 waitForTransactionReceipt 사용 (내장 폴링)
    const receipt = await this.client.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout,
      confirmations: 1,
    })

    return {
      txHash,
      status: receipt.status === 'success' ? 'confirmed' : 'submitted',
      blockNumber: receipt.blockNumber,
      fee: receipt.gasUsed * receipt.effectiveGasPrice,
    }
  } catch (err) {
    // 타임아웃: 마지막 상태 반환
    return this.getTransactionStatus(txHash)
  }
}
```

### 7.7 수수료 추정

#### `estimateFee(request: TransferRequest)`

```typescript
/**
 * EVM 수수료 추정.
 *
 * EIP-1559 수수료 계산:
 * 실제 비용 = gasUsed * (baseFee + priorityFee)
 * 최대 비용 = gasLimit * maxFeePerGas
 *
 * 이 메서드는 최대 비용을 반환한다 (실제 비용은 이보다 낮을 수 있음).
 */
async estimateFee(request: TransferRequest): Promise<bigint> {
  if (!this.client) throw this.notConnectedError()

  // 1. Gas 추정
  const estimatedGas = await this.client.estimateGas({
    account: request.from as `0x${string}`,
    to: request.to as `0x${string}`,
    value: request.amount,
  })
  const gasLimit = (estimatedGas * 110n) / 100n  // 10% 마진

  // 2. EIP-1559 수수료
  const block = await this.client.getBlock({ blockTag: 'latest' })
  const baseFee = block.baseFeePerGas ?? 0n
  const maxPriorityFeePerGas = 2_000_000_000n  // 2 gwei
  const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas

  return gasLimit * maxFeePerGas
}
```

### 7.8 Nonce 관리 전략

EVM 트랜잭션은 순차적 nonce를 요구한다. 잘못된 nonce 관리는 트랜잭션 실패 또는 nonce gap을 유발한다.

#### Nonce 조회 전략

```
[buildTransaction 호출]
    |
    v
onchainNonce = getTransactionCount(address, 'pending')
localNonce = nonceTracker.get(address) ?? 0
nonce = max(onchainNonce, localNonce)
    |
    v
nonceTracker.set(address, nonce + 1)
```

**왜 `max(onchain, local)` 인가:**
- 온체인 nonce만 사용하면: 빠른 연속 제출 시 동일 nonce 충돌
- 로컬 nonce만 사용하면: 외부에서 트랜잭션을 제출하면 nonce gap 발생
- 둘 중 높은 값: 두 경우 모두 안전

#### 제출 실패 시 Nonce 복구

| 실패 유형 | Nonce 처리 | 후속 조치 |
|-----------|-----------|----------|
| `EVM_NONCE_TOO_LOW` | `nonceTracker.clear()` | 온체인 nonce 재조회 후 재빌드 |
| `EVM_GAS_TOO_LOW` | nonce 유지 | 동일 nonce로 gas 올려서 재제출 (replacement tx) |
| `NETWORK_ERROR` | nonce 유지 | 제출 재시도 (같은 signedTx 재사용 가능) |
| `EVM_REVERT` | nonce 소비됨 | 다음 nonce로 새 트랜잭션 |

#### Graceful Shutdown 시 미전송 Tx의 Nonce 처리

이것은 06-RESEARCH.md Open Question 3에서 제기된 문제이다.

```
[Graceful Shutdown 시작]
    |
    v
[진행 중 서명 작업 확인]
    |
    +-- 서명 완료 + 미전송 tx 존재?
    |       |
    |       +-- YES: 해당 tx를 즉시 제출 시도 (30초 타임아웃 내)
    |       |       성공: nonce 소비됨, 정상
    |       |       실패: pending_state로 SQLite에 저장
    |       |             - nonce, signedTx, timestamp 기록
    |       |             - 다음 시작 시 복구 시도
    |       |
    |       +-- NO: 정상 종료
    |
    v
[nonceTracker 상태 저장 불필요]
    -- 다음 시작 시 온체인 nonce를 조회하므로 로컬 트래커는 휘발성
```

**핵심 원칙:** 서명된 트랜잭션은 반드시 제출을 시도한다. 서명만 하고 미제출하면 nonce가 소비되지 않으므로 큰 문제는 없지만, 사용자가 의도한 트랜잭션이 실행되지 않는 것이 문제이다. Phase 7 트랜잭션 파이프라인에서 이 시나리오를 상세 설계한다.

#### [v0.7 보완] getCurrentNonce / resetNonceTracker 구현

> **[v0.7 보완]** IChainAdapter 인터페이스에 추가된 18번, 19번 메서드의 EVM 구현. 파이프라인 및 에러 복구 로직에서 nonce 상태를 타입 안전하게 조회/리셋할 수 있다.

```typescript
/**
 * [v0.7 보완] 주소의 현재 유효 nonce를 반환한다.
 *
 * 조회 전략: max(onchainPendingNonce, localTrackerNonce)
 * - getTransactionCount(address, 'pending'): 온체인 pending 포함 nonce
 * - nonceTracker.get(address): 로컬에서 추적 중인 다음 nonce
 * - 둘 중 높은 값 반환 (nonce gap 방지 + 충돌 방지)
 *
 * 참고: viem의 createNonceManager 패턴과 유사한 로직이나,
 * WAIaaS는 직접 구현하여 nonceTracker Map으로 관리한다.
 * (viem nonceManager는 내부 상태 접근이 제한적이므로 직접 관리가 유리)
 *
 * @param address - 조회 대상 주소 (0x hex 포맷)
 * @returns 현재 유효 nonce
 * @throws {ChainError} code=RPC_ERROR -- getTransactionCount 호출 실패
 */
async getCurrentNonce(address: string): Promise<number> {
  if (!this.client) throw this.notConnectedError()

  const onchainNonce = await this.client.getTransactionCount({
    address: address as `0x${string}`,
    blockTag: 'pending',
  })
  const localNonce = this.nonceTracker.get(address) ?? 0

  return Math.max(onchainNonce, localNonce)
}

/**
 * [v0.7 보완] nonce 트래커를 리셋한다.
 *
 * 리셋 후 다음 buildTransaction()에서 온체인 nonce를 새로 조회한다.
 * NONCE_TOO_LOW 에러 복구, stuck 트랜잭션 감지 후 재동기화에 사용.
 *
 * @param address - 리셋 대상 주소. 생략 시 전체 nonceTracker 클리어.
 */
resetNonceTracker(address?: string): void {
  if (address) {
    this.nonceTracker.delete(address)
  } else {
    this.nonceTracker.clear()
  }
}
```

**nonce 접근 패턴 마이그레이션 (v0.7):**

| 기존 (v0.6) | v0.7 | 비고 |
|------------|------|------|
| `tx.metadata.nonce as number` | `tx.nonce` | 명시적 optional 필드로 승격 |
| `this.nonceTracker.clear()` (private) | `adapter.resetNonceTracker()` | public 인터페이스로 노출 |
| `this.nonceTracker.get(addr)` (private) | `adapter.getCurrentNonce(addr)` | 온체인 + 로컬 max 비교 포함 |

**파이프라인 nonce 접근 시 가드 패턴:**

```typescript
// 체인 무관 코드에서 nonce 접근 시 반드시 가드 사용
if (tx.nonce !== undefined) {
  // EVM 전용 nonce 로직
  auditLog.nonce = tx.nonce
} else {
  // Solana (blockhash 기반) -- nonce 없음
  auditLog.blockhash = tx.metadata.blockhash
}
```

### 7.9 지원 체인 + RPC 기본값 테이블

| Chain | ChainType | Chain ID | 네이티브 토큰 | RPC 기본값 | 비고 |
|-------|-----------|----------|-------------|-----------|------|
| Ethereum | `'ethereum'` | 1 | ETH (18 decimals) | `""` (사용자 설정 필수) | Alchemy, Infura 등 필요 |
| Polygon | `'polygon'` | 137 | MATIC (18 decimals) | `https://polygon-rpc.com` | 공용 RPC 사용 가능 |
| Arbitrum | `'arbitrum'` | 42161 | ETH (18 decimals) | `https://arb1.arbitrum.io/rpc` | 공용 RPC 사용 가능 |

**Ethereum RPC 기본값이 비어있는 이유:**
- Ethereum 메인넷의 공용 RPC(`https://cloudflare-eth.com` 등)는 rate limit이 매우 엄격
- 실제 트랜잭션 제출에는 부적합 (읽기 전용 제한이 많음)
- 사용자가 자체 RPC 키를 설정해야 안정적인 서비스 가능
- config.toml에 `[rpc.ethereum].mainnet` 미설정 시 에이전트 생성 에러 발생

### 7.10 EVM Adapter 내부 헬퍼

```typescript
private notConnectedError(): ChainError {
  return new ChainError({
    code: ChainErrorCode.RPC_ERROR,
    chain: this.chain,
    message: `${this.chain} RPC에 연결되지 않았습니다. connect()를 먼저 호출하세요.`,
    retryable: false,
  })
}
```

### 7.11 [v0.8 추가] sweepAll -- EvmStub (NOT_IMPLEMENTED)

> **[v0.8 추가]** v0.8은 Solana 1순위 구현이며, EVM sweepAll은 설계만 확정하고 구현은 미래로 미룬다.

```typescript
/**
 * [v0.8 추가] EVM sweepAll은 미구현 상태이다.
 * v0.8 마일스톤에서는 Solana sweepAll만 구현한다.
 * EVM 구현 시에는 ERC-20 토큰 목록 조회 -> 개별 transfer -> ETH 전량 전송 순서를 따른다.
 *
 * @throws {ChainError} code=NOT_IMPLEMENTED -- 항상 발생
 */
async sweepAll(_from: string, _to: string): Promise<SweepResult> {
  throw new ChainError({
    code: ChainErrorCode.NOT_IMPLEMENTED,
    chain: this.chain,
    message: `sweepAll is not implemented for ${this.chain}. EVM support is planned for a future release.`,
    retryable: false,
  })
}
```

---

## 8. 체인 간 차이점 비교 매트릭스

### 8.1 수수료 모델 비교

| 항목 | Solana | EVM (Ethereum/L2) |
|------|--------|-------------------|
| **수수료 단위** | lamports (1 SOL = 10^9 lamports) | wei (1 ETH = 10^18 wei) |
| **수수료 구조** | base fee (5000 lamports/sig) + priority fee | gasUsed * (baseFee + priorityFee) (EIP-1559) |
| **수수료 변동성** | 낮음 (base fee 고정, priority fee만 변동) | 높음 (baseFee가 블록마다 변동) |
| **수수료 추정 난이도** | 쉬움 (거의 고정) | 어려움 (gas 추정 + 수수료 추정 필요) |
| **단순 전송 비용** | ~0.000005 SOL (~$0.001) | 0.001-0.05 ETH ($3-$150, 네트워크 혼잡도 의존) |
| **IChainAdapter 영향** | `estimateFee()` 단순 (5000n 반환) | `estimateFee()` 복잡 (estimateGas + getBlock + EIP-1559 계산) |

### 8.2 트랜잭션 수명 비교

| 항목 | Solana | EVM |
|------|--------|-----|
| **수명 메커니즘** | Blockhash lifetime (~150 slots, ~60초) | Nonce 기반 (무제한) |
| **만료 가능성** | 높음 (60초 내 미제출 시 만료) | 없음 (nonce가 유효하면 영구 유효) |
| **UnsignedTransaction.expiresAt** | 필수 (Date) | undefined |
| **재사용 가능성** | 불가 (blockhash 만료 시 재빌드 필요) | 가능 (동일 signedTx 재제출 가능) |
| **IChainAdapter 영향** | `signTransaction()`에서 만료 체크 필수 | Nonce 충돌 처리 필요 |

### 8.3 확정성 비교

| 항목 | Solana | Ethereum | Polygon | Arbitrum |
|------|--------|----------|---------|----------|
| **Confirmed** | ~400ms | ~12s (1 block) | ~2s (1 block) | ~250ms |
| **Finalized** | ~6s (31 slots) | ~3min (15 blocks) | ~4min (128 blocks) | L2 즉시 / L1 ~15min |
| **waitForConfirmation 기본 전략** | WebSocket 구독 | 폴링 (4s 간격) | 폴링 (2s 간격) | 폴링 (1s 간격) |
| **SubmitResult.confirmations** | undefined (이진 상태) | 숫자 (블록 수) | 숫자 | 숫자 |

### 8.4 서명 알고리즘 비교

| 항목 | Solana | EVM |
|------|--------|-----|
| **알고리즘** | Ed25519 | secp256k1 (ECDSA) |
| **키 크기** | 64바이트 keypair (32 seed + 32 pubkey) | 32바이트 private key |
| **서명 크기** | 64바이트 | 65바이트 (r: 32, s: 32, v: 1) |
| **주소 파생** | pubkey 자체가 주소 (Base58) | keccak256(pubkey)[12:32] (0x hex) |
| **signTransaction 입력** | Uint8Array (64바이트) | Uint8Array (32바이트) |
| **라이브러리** | @solana/kit createKeyPairFromBytes | viem privateKeyToAccount |

### 8.5 주소 포맷 비교

| 항목 | Solana | EVM |
|------|--------|-----|
| **인코딩** | Base58 | Hexadecimal (0x 접두어) |
| **길이** | 32-44자 (가변) | 42자 (고정: 0x + 40 hex) |
| **체크섬** | 없음 (Base58Check 아님) | EIP-55 mixed-case 체크섬 |
| **예시** | `So11111111111111111111111111111112` | `0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28` |
| **isValidAddress 검증** | Base58 디코딩 + 32바이트 확인 | 0x + 40 hex + EIP-55 체크섬 |

### 8.6 인터페이스 설계 영향 종합

위 차이점들이 IChainAdapter 인터페이스 설계에 미치는 영향을 정리한다:

| 인터페이스 요소 | 설계 결정 | 근거 |
|---------------|----------|------|
| `UnsignedTransaction.expiresAt` | `Date \| undefined` (optional) | Solana는 blockhash 만료가 있고, EVM은 없음 |
| `UnsignedTransaction.nonce` | `number \| undefined` (optional) **(v0.7)** | EVM 전용. 명시적 필드로 승격하여 타입 안전성 확보. Solana: undefined |
| `UnsignedTransaction.metadata` | `Record<string, unknown>` (유연한 타입) | Solana: blockhash/version, EVM: chainId/gas -- 체인마다 다른 메타데이터. nonce는 v0.7부터 tx.nonce로 승격 |
| `SubmitResult.confirmations` | `number \| undefined` (optional) | Solana는 confirmed/finalized 이진 상태, EVM은 블록 수 |
| `signTransaction` 키 크기 | `Uint8Array` (체인별 크기 다름) | Solana 64바이트, EVM 32바이트 -- 호출자(키스토어)가 올바른 크기 전달 책임 |
| `isValidAddress` 반환 | `boolean` (동기) | 두 체인 모두 로컬에서 검증 가능 (RPC 불필요) |
| `estimateFee` 복잡도 | `Promise<bigint>` (비동기) | Solana는 거의 동기(고정값)이지만, EVM은 RPC 호출 필요. 인터페이스 통일을 위해 비동기 |
| 에러 코드 분리 | 공통(7) + Solana(2) + EVM(3) | 체인별 고유 에러가 존재하므로 계층적 분리 |

---

## 9. 구현 노트

### 9.1 금액 단위 변환 규칙 (NOTE-01)

WAIaaS에서 금액은 레이어별로 다른 표현을 사용한다. 구현 시 레이어 간 변환 규칙을 반드시 준수해야 한다.

**저장/전송 레이어 (ChainAdapter, DB, Pipeline):**
모든 금액은 최소 단위(lamports/wei) bigint로 처리한다. DB `transactions.amount`는 TEXT 타입으로 bigint 직렬화 값을 저장한다. `TransferRequest.amount`, `TokenAmount.raw`, `UnsignedTransaction.estimatedFee` 모두 bigint이다.

**API 레이어 변환 공식:**
REST API `BalanceResponse.formatted` 필드는 다음 공식으로 생성한다:

```
formatted = Number(balance) / (10 ** decimals)  -- 숫자 변환
         -> .toFixed(decimals)                  -- 전체 소수점 표현
         -> .replace(/\.?0+$/, '')              -- trailing zeros 제거
         + ' ' + symbol                         -- 심볼 붙이기
```

예시: `1500000000n` (SOL, decimals=9) -> `"1.5 SOL"`

**체인별 변환표:**

| 체인 | 최소 단위 | decimals | 1 토큰 = 최소 단위 | 예시 |
|------|----------|----------|-------------------|------|
| Solana (SOL) | lamports | 9 | 1 SOL = 10^9 lamports | 1.5 SOL = `1_500_000_000n` |
| Ethereum (ETH) | wei | 18 | 1 ETH = 10^18 wei | 0.1 ETH = `100_000_000_000_000_000n` |
| Polygon (MATIC) | wei | 18 | 1 MATIC = 10^18 wei | 동일 EVM 규칙 |
| Arbitrum (ETH) | wei | 18 | 1 ETH = 10^18 wei | 동일 EVM 규칙 |

**SDK 레이어 변환 헬퍼 (구현 시 참고):**

```typescript
// @waiaas/sdk 또는 @waiaas/core에 포함
function formatAmount(balance: bigint, decimals: number, symbol: string): string
// 예: formatAmount(1_500_000_000n, 9, 'SOL') -> "1.5 SOL"

function parseAmount(amount: string, decimals: number): bigint
// 예: parseAmount("1.5", 9) -> 1_500_000_000n
```

**참조:** REST API `BalanceResponse`의 `formatted` 필드 변환 규칙은 37-rest-api-complete-spec.md 섹션 6.3 참조.

---

*문서 ID: CORE-04*
*작성일: 2026-02-05*
*v0.6 업데이트: 2026-02-08*
*v0.7 업데이트: 2026-02-08*
*v0.8 업데이트: 2026-02-08*
*Phase: 06-core-architecture-design*
*상태: 완료*
