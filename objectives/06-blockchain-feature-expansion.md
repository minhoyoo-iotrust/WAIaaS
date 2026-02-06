# 마일스톤 6: 블록체인 기능 확장 설계

## 목표

현재 네이티브 토큰(SOL/ETH) 전송에 한정된 IChainAdapter와 트랜잭션 파이프라인을 확장하여, SPL/ERC-20 토큰 전송, 자산 조회, 임의 컨트랙트 호출, DeFi 액션 추상화까지 **설계 수준에서** 정의한다. 각 확장 기능의 테스트 전략을 함께 수립하여, 구현 단계에서 "무엇을 어떻게 검증할 것인가"가 명확한 상태를 만든다.

## 배경

### 현재 설계의 한계

v0.2 설계는 **네이티브 토큰 전송**만 지원한다:

| 항목 | 현재 상태 | 한계 |
|------|----------|------|
| TransferRequest | `from`, `to`, `amount`, `memo?` | 토큰 종류 지정 불가 |
| getBalance() | 네이티브 잔액만 (SOL/ETH) | SPL/ERC-20 잔액 미조회 |
| getAssets() | v0.1에서 제거, v0.3 이연 | 미구현 |
| buildTransaction() | SOL System Program 전송만 | 컨트랙트 호출 불가 |
| BalanceInfo.usdValue | 항상 undefined | 가격 정보 없음 |
| 정책 엔진 | 네이티브 토큰 금액 기준 | USD 기준 정책 불가 |

### Coinbase AgentKit과의 비교에서 도출된 갭

| 기능 | AgentKit | WAIaaS | 갭 |
|------|----------|--------|-----|
| 토큰 전송 (SPL/ERC-20) | 지원 | 미지원 | 즉시 해소 가능 |
| 자산 목록 조회 | 지원 | 미지원 | 인터페이스 복원 필요 |
| 임의 컨트랙트 호출 | 지원 (invokeContract) | 미지원 | 새 요청 타입 필요 |
| DeFi 통합 (Swap/Lend/Stake) | 50+ Action Provider | 미지원 | 새 아키텍처 레이어 필요 |
| 가격 오라클 | Pyth/CDP 연동 | 미지원 | IPriceOracle 인터페이스 필요 |

### WAIaaS의 차별화 관점

AgentKit은 DeFi 액션을 **실행만** 한다. WAIaaS는 DeFi 액션 위에 **정책 엔진이 적용**된다:

```
AgentKit:  AI → swap(5000 USDC → ETH) → 즉시 실행
WAIaaS:    AI → swap(5000 USDC → ETH) → 정책 평가 → APPROVAL 에스컬레이션 → Owner 승인 → 실행
```

이 "실행 전 제어"를 DeFi까지 확장하는 것이 WAIaaS의 핵심 차별점이다.

---

## 핵심 원칙

### 1. IChainAdapter는 저수준 실행 엔진으로 유지한다
- 어댑터는 "주어진 트랜잭션을 체인에 제출하는 것"에 집중
- DeFi 프로토콜 지식(ABI, approve 순서, 풀 주소 등)은 어댑터에 넣지 않음
- 4단계 파이프라인(build → simulate → sign → submit) 구조 유지

### 2. 새 기능은 기존 파이프라인 위에 쌓는다
- 6단계 트랜잭션 파이프라인은 변경하지 않음
- 정책 엔진(Stage 3)과 티어 분류(Stage 4)가 새 기능에도 동일하게 적용
- 8-state 상태 머신 변경 없음

### 3. 보안 표면 확대를 명시적으로 통제한다
- 임의 컨트랙트 호출 = 보안 표면 급증. 정책 규칙 확장 필수
- approve 관리 = 자금 노출 위험. 독립적 정책 카테고리 필요
- 새 기능마다 공격 시나리오를 함께 정의

### 4. 테스트 전략이 설계와 동시에 수립된다
- 각 확장 기능의 테스트 레벨, mock 경계, 보안 시나리오를 설계 단계에서 정의
- v0.4(테스트 전략)의 프레임워크를 확장하여 일관성 유지

---

## 확장 기능 설계

### Phase A: 토큰 확장 (IChainAdapter 최소 변경)

#### A-1. SPL/ERC-20 토큰 전송

**인터페이스 변경:**

```typescript
// TransferRequest 확장 (하위 호환)
interface TransferRequest {
  from: string
  to: string
  amount: bigint
  memo?: string
  token?: string   // NEW: SPL mint address 또는 ERC-20 contract address
                   // undefined = 네이티브 토큰 (SOL/ETH)
}
```

**어댑터 구현 영향:**

| 체인 | token 있을 때 | 추가 의존성 |
|------|-------------|------------|
| Solana | SPL Token Program `transfer` instruction. Associated Token Account 자동 생성 포함 | `@solana-program/token` |
| EVM | ERC-20 `transfer(address,uint256)` ABI 인코딩. `to`는 컨트랙트, 수신자는 calldata 내부 | viem `encodeFunctionData` (이미 의존) |

**파이프라인 영향:** 없음. buildTransaction() 내부 분기만 추가. 정책 엔진은 amount 기준으로 동일하게 동작.

**정책 엔진 확장:**
- `ALLOWED_TOKENS` 규칙 신설: 에이전트가 전송 가능한 토큰 민트/컨트랙트 주소 화이트리스트
- 미등록 토큰 전송 시도 → CANCELLED (정책 위반)

**테스트 전략:**

| 레벨 | 검증 내용 | 환경 |
|------|----------|------|
| Unit | SPL instruction 조립 정확성, ERC-20 ABI 인코딩 정확성 | Mock |
| Unit | token=undefined 시 기존 네이티브 전송 동작 유지 (회귀) | Mock |
| Unit | ALLOWED_TOKENS 정책 규칙 매칭/거부 로직 | Mock |
| Integration | SPL 전송 → Associated Token Account 자동 생성 → 잔액 변동 | Local Validator |
| Integration | ERC-20 전송 → 수신자 잔액 변동 | Hardhat/Anvil |
| E2E | 세션 생성 → 토큰 전송 → 정책 검증 → 확정 → 잔액 확인 | Mock Chain |
| Security | 미허용 토큰 민트 주소로 전송 시도 → 정책 거부 | Mock |
| Security | 존재하지 않는 민트 주소로 전송 시도 → 시뮬레이션 실패 | Mock/Local Validator |
| Chain | Devnet에서 SPL 토큰 발행 → 전송 → 잔액 확인 전체 흐름 | Devnet |

#### A-2. 자산 목록 조회 (getAssets 복원)

**인터페이스 추가:**

```typescript
interface IChainAdapter {
  // 기존 13개 메서드 + 1개 추가
  getAssets(address: string): Promise<AssetInfo[]>
}

interface AssetInfo {
  token: string        // 민트/컨트랙트 주소. "native"이면 네이티브 토큰
  symbol: string       // 'SOL', 'USDC', 'ETH' 등
  name: string         // 'USD Coin', 'Wrapped SOL' 등
  decimals: number
  balance: bigint      // 최소 단위
  usdValue?: number    // Phase C에서 활성화
  logoUri?: string     // 토큰 아이콘 URI (Tauri Desktop용)
}
```

**구현 방식:**

| 체인 | 방식 | 비고 |
|------|------|------|
| Solana | `getTokenAccountsByOwner()` RPC → SPL 토큰 계정 순회 | 표준 RPC, 추가 의존 없음 |
| EVM | `alchemy_getTokenBalances()` 또는 known token list 순회 | RPC 프로바이더별 차이 있음 |

**REST API:** `GET /v1/wallet/assets`는 37-rest-api-spec에 이미 정의되어 있음. 응답 스키마를 AssetInfo[]로 확정.

**테스트 전략:**

| 레벨 | 검증 내용 | 환경 |
|------|----------|------|
| Unit | RPC 응답 파싱, AssetInfo 변환 정확성 | Mock RPC |
| Unit | 토큰 계정이 0개/1개/다수일 때 동작 | Mock RPC |
| Integration | 실제 토큰 보유 주소의 자산 목록 조회 | Local Validator |
| E2E | 세션 인증 → getAssets → 응답 스키마 검증 | Mock Chain |

#### A-3. 수수료 추정 확장 (토큰 전송 수수료)

현재 `estimateFee()`는 네이티브 전송만 추정한다. 토큰 전송 시:
- Solana: base fee + ATA 생성 비용 (rent-exempt 최소 잔액 ~0.002 SOL)
- EVM: ERC-20 transfer의 gas 추정 (21,000 → ~65,000)

estimateFee()에 `token?` 필드가 있는 TransferRequest를 전달하면 자동 분기.

**테스트 전략:**

| 레벨 | 검증 내용 | 환경 |
|------|----------|------|
| Unit | ATA 존재 시 / 미존재 시 수수료 차이 | Mock RPC |
| Unit | ERC-20 transfer gas 추정 정확성 | Mock RPC |
| Integration | 실제 수수료와 추정값 오차 범위 (±20%) | Local Validator |

---

### Phase B: 트랜잭션 타입 확장

#### B-1. 임의 스마트 컨트랙트 호출

**새 요청 타입:**

```typescript
interface ContractCallRequest {
  from: string
  to: string              // 컨트랙트 주소
  value?: bigint          // payable value (0이면 생략)

  // EVM
  data?: string           // ABI-encoded calldata (hex, 0x 접두어)

  // Solana
  programId?: string      // 프로그램 주소
  instructionData?: string // base64-encoded instruction data
  accounts?: AccountMeta[] // 명시적 account list
}

interface AccountMeta {
  pubkey: string
  isSigner: boolean
  isWritable: boolean
}
```

**파이프라인 영향:**

| Stage | 변경 사항 |
|-------|----------|
| Stage 1 | `type` 필드 분기: `'TRANSFER'` / `'CONTRACT_CALL'` |
| Stage 2 | 세션 제약에 `allowedContracts` 추가 |
| Stage 3 | 정책 엔진: 컨트랙트 주소 화이트리스트 + method signature 화이트리스트 |
| Stage 5 | 어댑터: `buildContractCall()` 메서드 추가 또는 buildTransaction() 오버로드 |

**transactions 테이블 영향:**

```sql
-- type 컬럼 Enum 확장
CHECK (type IN ('TRANSFER', 'CONTRACT_CALL'))

-- 추가 컬럼 (선택)
contract_address TEXT   -- 호출 대상 컨트랙트
method_signature TEXT   -- '0xa9059cbb' (ERC-20 transfer) 등, 감사용
```

**정책 엔진 확장:**

| 규칙 타입 | 설명 |
|----------|------|
| `CONTRACT_WHITELIST` | 허용된 컨트랙트 주소 목록. 미등록 주소 호출 시 거부 |
| `METHOD_WHITELIST` | 허용된 method signature 목록 (4-byte selector). 미등록 메서드 호출 시 거부 |
| `CONTRACT_VALUE_LIMIT` | 컨트랙트 호출 시 첨부 가능한 최대 value (payable) |

**보안 고려:**

- 임의 calldata는 **가장 위험한 확장**. 악성 컨트랙트 호출, 토큰 approve 악용 등
- 기본 정책: `CONTRACT_WHITELIST` 비어있으면 모든 컨트랙트 호출 거부 (opt-in 화이트리스트)
- method signature 해독: 4-byte selector → known function name 매핑 (4byte.directory 참조)

**테스트 전략:**

| 레벨 | 검증 내용 | 환경 |
|------|----------|------|
| Unit | ContractCallRequest → UnsignedTransaction 변환 | Mock |
| Unit | EVM calldata 인코딩 정확성 (viem encodeFunctionData) | Mock |
| Unit | Solana instruction 조립 + account meta 정확성 | Mock |
| Unit | CONTRACT_WHITELIST 매칭/거부 로직 | Mock |
| Unit | METHOD_WHITELIST 4-byte selector 매칭 | Mock |
| Integration | 커스텀 컨트랙트 배포 → 호출 → 상태 변경 확인 | Hardhat/Local Validator |
| E2E | 세션 → 컨트랙트 호출 → 정책(화이트리스트) → 실행 → 확인 | Mock Chain |
| Security | 화이트리스트에 없는 컨트랙트 호출 시도 → 거부 | Mock |
| Security | 화이트리스트에 없는 method signature 호출 시도 → 거부 | Mock |
| Security | data 필드에 악성 calldata 주입 → 시뮬레이션 실패 확인 | Mock/Local Validator |
| Security | payable value가 CONTRACT_VALUE_LIMIT 초과 → 거부 | Mock |

#### B-2. 토큰 Approve 관리

**전용 요청 타입:**

```typescript
interface ApproveRequest {
  from: string
  token: string           // SPL mint 또는 ERC-20 contract
  spender: string         // 승인 대상 (DEX router, lending pool 등)
  amount: bigint          // 승인 금액. 0이면 revoke
}
```

approve를 ContractCallRequest의 특수 케이스가 아닌 **독립 타입으로 분리하는 근거:**

1. approve는 자금 노출 범위를 결정하는 **권한 위임** 행위 — 전송보다 위험할 수 있음
2. 정책 엔진이 approve 전용 규칙을 적용해야 함 (금액 상한, spender 화이트리스트)
3. 감사 로그에서 approve와 일반 컨트랙트 호출을 명확히 구분해야 함

**정책 엔진 확장:**

| 규칙 타입 | 설명 |
|----------|------|
| `APPROVED_SPENDERS` | approve 허용 대상 주소 목록. 미등록 spender에 대한 approve 거부 |
| `APPROVE_AMOUNT_LIMIT` | 단건 approve 최대 금액. `type(uint256).max` (무제한 approve) 차단 |
| `APPROVE_TIER_OVERRIDE` | approve는 금액 무관하게 최소 DELAY 또는 APPROVAL 티어 강제 |

**테스트 전략:**

| 레벨 | 검증 내용 | 환경 |
|------|----------|------|
| Unit | ERC-20 approve ABI 인코딩, SPL delegate instruction | Mock |
| Unit | amount=0 (revoke) 동작 정확성 | Mock |
| Unit | APPROVED_SPENDERS 매칭/거부 로직 | Mock |
| Unit | APPROVE_AMOUNT_LIMIT 경계값 (limit-1, limit, limit+1) | Mock |
| Unit | 무제한 approve (`2^256-1`) 차단 | Mock |
| Security | 미허용 spender에 대한 approve 시도 → 거부 | Mock |
| Security | 무제한 approve 시도 → APPROVE_AMOUNT_LIMIT 위반 | Mock |
| Security | approve 후 spender가 transferFrom으로 전액 탈취 시도 → 감사 로그 기록 | Integration |
| E2E | approve → swap (Phase C) → allowance 소진 확인 | Mock Chain |

#### B-3. 멀티 Instruction 배치 (Solana Atomic Tx)

Solana는 하나의 트랜잭션에 여러 instruction을 넣을 수 있다. DeFi 액션의 원자성 보장:

```typescript
interface BatchRequest {
  from: string
  instructions: InstructionRequest[]  // 순서 보장
  // EVM에서는 미지원 (EOA 한계). 향후 Account Abstraction 시 확장
}

interface InstructionRequest {
  type: 'transfer' | 'contract_call' | 'approve'
  params: TransferRequest | ContractCallRequest | ApproveRequest
}
```

**파이프라인 영향:**
- Stage 1: `type='BATCH'`로 단일 트랜잭션 INSERT (instruction 수는 metadata에)
- Stage 3: 배치 전체를 하나의 단위로 정책 평가 (금액 합산, 모든 컨트랙트 화이트리스트 확인)
- Stage 5: Solana — `pipe()`에 여러 instruction append. EVM — 거부 (CHAIN_NOT_SUPPORTED)

**정책 엔진 영향:**
- 배치 내 모든 instruction의 금액을 합산하여 티어 결정
- 배치 내 하나라도 정책 위반이면 전체 배치 거부 (All-or-Nothing)

**테스트 전략:**

| 레벨 | 검증 내용 | 환경 |
|------|----------|------|
| Unit | 여러 instruction → 단일 Solana transaction message 조립 | Mock |
| Unit | 정책 평가: 금액 합산 정확성, 화이트리스트 전체 검증 | Mock |
| Unit | EVM에서 BATCH 요청 시 CHAIN_NOT_SUPPORTED 에러 | Mock |
| Integration | 3-instruction 배치 (approve + swap + memo) 원자적 실행 | Local Validator |
| Security | 배치 내 1개 instruction이 정책 위반 → 전체 거부 | Mock |
| Security | 배치 크기 제한 (max_instructions) 초과 → 거부 | Mock |

---

### Phase C: 상위 추상화 레이어

#### C-1. 가격 오라클 통합 (IPriceOracle)

**인터페이스:**

```typescript
interface IPriceOracle {
  getPrice(token: string, chain: ChainType): Promise<PriceInfo>
  getPrices(tokens: string[], chain: ChainType): Promise<Map<string, PriceInfo>>
}

interface PriceInfo {
  usdPrice: number        // USD 단가
  confidence: number      // 신뢰도 (0~1). 유동성 낮으면 낮음
  source: string          // 'coingecko', 'pyth', 'chainlink'
  updatedAt: Date         // 가격 업데이트 시점
}
```

**구현 옵션 (우선순위순):**

| 소스 | 방식 | 장점 | 단점 |
|------|------|------|------|
| CoinGecko API | HTTP REST | 무료, 광범위 토큰 커버리지 | Rate limit (30 req/min), 지연 |
| Pyth Network | Solana RPC (온체인) | 실시간, 탈중앙화 | Solana 전용 |
| Chainlink | EVM 컨트랙트 호출 | 실시간, 업계 표준 | EVM 전용, 가스비 |

**캐싱:** 5분 TTL 로컬 캐시 (SQLite 또는 인메모리). 정책 평가 시 캐시 히트 우선.

**정책 엔진 확장:**
- 기존: 네이티브 토큰 금액 기준 (예: 10 SOL 이상 → APPROVAL)
- 확장: **USD 금액 기준** (예: $100 이상 → APPROVAL)
- USD 기준 정책이 설정된 경우, 파이프라인 Stage 3에서 IPriceOracle 조회

**BalanceInfo / AssetInfo 활성화:** `usdValue` 필드에 오라클 가격 반영

**테스트 전략:**

| 레벨 | 검증 내용 | 환경 |
|------|----------|------|
| Unit | 각 오라클 소스의 응답 파싱 + PriceInfo 변환 | Mock HTTP |
| Unit | 캐시 히트/미스 동작, TTL 만료 시 갱신 | Mock |
| Unit | USD 기준 정책 평가: 가격 변동에 따른 티어 변경 | Mock |
| Unit | 오라클 장애 시 fallback 동작 (캐시 stale 허용 vs 거부) | Mock |
| Integration | 실제 CoinGecko API 호출 → 가격 캐시 → AssetInfo.usdValue 반영 | CoinGecko API |
| Security | 가격 조작 시나리오: 오라클이 비정상 가격 반환 시 정책 우회 가능성 | Mock |
| Security | 오라클 장애 시 USD 기준 정책이 무효화되지 않는지 확인 | Mock |

#### C-2. Action Provider 레이어 (IActionProvider)

IChainAdapter 위에 **프로토콜별 고수준 액션 추상화**를 추가한다:

```
┌─────────────────────────────────────────────────────┐
│  Action Providers (NEW)                             │
│  ├── SwapActionProvider (Jupiter / 0x)              │
│  ├── StakeActionProvider (Marinade / Lido)          │
│  └── 향후: LendActionProvider, NftActionProvider    │
├─────────────────────────────────────────────────────┤
│  Transaction Pipeline (기존, 변경 없음)               │
│  Stage 1~6, Policy Engine, 8-state machine          │
├─────────────────────────────────────────────────────┤
│  IChainAdapter (기존, 변경 없음)                      │
│  build → simulate → sign → submit                   │
└─────────────────────────────────────────────────────┘
```

**인터페이스:**

```typescript
interface IActionProvider {
  /** 프로바이더 이름 */
  readonly name: string              // 'jupiter-swap', 'marinade-stake'
  /** 지원 체인 */
  readonly supportedChains: ChainType[]
  /** 제공하는 액션 목록 */
  readonly actions: ActionDefinition[]
}

interface ActionDefinition {
  /** 액션 이름 (MCP tool name으로 노출) */
  name: string                       // 'swap', 'stake', 'unstake'
  /** AI 도구 설명 (자연어) */
  description: string                // "Swap tokens using Jupiter aggregator"
  /** 입력 스키마 (Zod) */
  inputSchema: ZodSchema
  /** 출력 스키마 (Zod) */
  outputSchema: ZodSchema
  /**
   * 액션 실행.
   * 내부적으로 IChainAdapter를 사용하여 트랜잭션을 빌드한다.
   * 반환값은 파이프라인에 전달할 TransferRequest 또는 ContractCallRequest.
   */
  resolve(input: unknown): Promise<ResolvedAction>
}

interface ResolvedAction {
  /** 파이프라인에 전달할 요청 (1개 또는 배치) */
  requests: (TransferRequest | ContractCallRequest | ApproveRequest)[]
  /** 사전 검증 결과 (잔액 확인, 풀 유동성 등) */
  preflight: PreflightResult
  /** 예상 결과 요약 (UI/알림용) */
  summary: string   // "Swap 100 USDC → ~0.04 ETH (slippage 1%)"
}
```

**핵심 설계 결정:**

| 결정 | 선택 | 근거 |
|------|------|------|
| Action Provider는 트랜잭션을 직접 실행하나? | **아니오.** resolve()로 요청을 생성하고, 실행은 기존 파이프라인에 위임 | 정책 엔진이 중간에 개입해야 하므로 |
| 하나의 액션이 여러 트랜잭션을 생성할 수 있나? | **예.** requests 배열 (approve + swap 등). Solana는 배치로, EVM은 순차 실행 | DeFi 복합 트랜잭션의 현실 |
| Action Provider는 플러그인인가? | **예.** IAdapterPlugin과 유사한 동적 로드. `~/.waiaas/actions/` 디렉토리 | 사용자가 커스텀 액션 추가 가능 |
| MCP 도구로 자동 노출되나? | **예.** ActionDefinition → MCP Tool 자동 변환 (name, description, inputSchema) | AI 에이전트가 자연어로 액션 호출 |

**파이프라인 통합:**

```
AI 에이전트: "100 USDC를 ETH로 스왑해줘"
     │
     ▼
MCP Tool: swap({ fromToken: "USDC", toToken: "ETH", amount: "100" })
     │
     ▼
JupiterSwapActionProvider.resolve()
     │  → preflight: 잔액 확인, 가격 조회, 슬리피지 계산
     │  → requests: [ApproveRequest, ContractCallRequest]
     │  → summary: "Swap 100 USDC → ~0.04 ETH (slippage 1%)"
     ▼
Transaction Pipeline Stage 1~6
     │  → Stage 3: 정책 평가 (approve 규칙 + 컨트랙트 화이트리스트 + USD 한도)
     │  → Stage 4: 티어 분류 ($100 → DELAY or APPROVAL)
     │  → Stage 5~6: 어댑터 실행
     ▼
결과 반환 + 알림
```

**테스트 전략:**

| 레벨 | 검증 내용 | 환경 |
|------|----------|------|
| Unit | ActionDefinition → MCP Tool 변환 정확성 | Mock |
| Unit | resolve() → ResolvedAction의 requests 배열 구성 | Mock |
| Unit | preflight 실패 시 (잔액 부족, 풀 유동성 없음) 에러 처리 | Mock |
| Unit | inputSchema Zod 검증: 잘못된 토큰 심볼, 음수 금액 등 | Mock |
| Integration | Action Provider → 파이프라인 → 정책 엔진 → 어댑터 전체 흐름 | Mock Chain |
| Integration | 배치 요청 (approve + swap) → Solana 원자적 / EVM 순차 실행 | Local Validator / Hardhat |
| E2E | MCP Tool 호출 → Action 해석 → 정책 검증 → Owner 승인 → 실행 → 결과 | Mock Chain |
| Security | Action Provider가 악성 컨트랙트 주소를 반환 → 화이트리스트에서 차단 | Mock |
| Security | 슬리피지 조작: 비정상적으로 높은 슬리피지 → 정책 거부 | Mock |
| Security | 플러그인 액션의 resolve()가 예외 발생 → 파이프라인 안전 종료 | Mock |

#### C-3. Swap Action Provider (구체적 설계 예시)

Phase C-2의 구체적 구현 예시로 Swap을 먼저 설계한다:

**입력 스키마:**

```typescript
const SwapInputSchema = z.object({
  fromToken: z.string(),      // 민트/컨트랙트 주소 또는 심볼 ('USDC')
  toToken: z.string(),
  amount: z.string(),          // 사람이 읽을 수 있는 단위 ('100' = 100 USDC)
  slippageBps: z.number().min(1).max(5000).default(100),  // 1% 기본
})
```

**구현 방식 (체인별):**

| 체인 | 엔진 | 방식 |
|------|------|------|
| Solana | Jupiter Aggregator API | HTTP 호출 → quote → swap instruction 반환 |
| EVM | 0x Swap API 또는 1inch | HTTP 호출 → quote → calldata 반환 |

**핵심:** WAIaaS가 DEX 라우팅을 직접 구현하지 않는다. 외부 aggregator API에 quote를 요청하고, 반환된 트랜잭션 데이터를 파이프라인에 전달한다.

**테스트 전략:**

| 레벨 | 검증 내용 | 환경 |
|------|----------|------|
| Unit | Jupiter/0x API 응답 파싱 → ContractCallRequest 변환 | Mock HTTP |
| Unit | 슬리피지 계산 정확성, 경계값 (minOutput) | Mock |
| Unit | aggregator 장애 시 에러 처리 (timeout, 5xx) | Mock HTTP |
| Integration | Jupiter Devnet에서 실제 swap quote → instruction 검증 | Devnet |
| Security | aggregator가 악성 calldata 반환 → 시뮬레이션에서 차단 | Mock |
| Security | MEV 보호: aggregator의 anti-MEV 기능 활성화 확인 | Devnet |

---

## 영향받는 설계 문서

| 문서 | 변경 규모 | 변경 내용 |
|------|:--------:|----------|
| **CORE-04** (27-chain-adapter-interface) | **대** | TransferRequest.token, getAssets(), ContractCallRequest, ApproveRequest, BatchRequest 추가, IActionProvider 인터페이스 신설 |
| **CORE-02** (25-sqlite-schema) | 중 | transactions.type Enum 확장 (CONTRACT_CALL, APPROVE, BATCH), contract_address/method_signature 컬럼 |
| **CHAIN-SOL** (31-solana-adapter-detail) | 중 | SPL 전송 빌드, ATA 자동 생성, 멀티 instruction 배치 |
| **LOCK-MECH** (33-time-lock-approval-mechanism) | 중 | ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, USD 기준 정책 규칙 추가 |
| **TX-PIPE** (32-transaction-pipeline-api) | 소 | Stage 1 type 분기, Stage 3 확장 규칙 적용. 파이프라인 구조 자체는 변경 없음 |
| **API-SPEC** (37-rest-api-complete-spec) | 중 | `POST /v1/transactions/call` (컨트랙트 호출), `POST /v1/transactions/approve` (토큰 approve), `POST /v1/transactions/batch` (배치), `GET /v1/wallet/assets` 응답 확정, `GET /v1/prices` (오라클) |
| **SDK-MCP** (38-sdk-mcp-interface) | 중 | SDK에 contractCall/approve/batch 메서드 추가, MCP에 Action Provider 기반 동적 도구 노출 |
| **45-enum** (45-enum-unified-mapping) | 소 | TransactionType, PolicyType Enum 값 추가 |

---

## 신규 산출물

| ID | 산출물 | Phase | 설명 |
|----|--------|-------|------|
| CHAIN-EXT-01 | 토큰 전송 확장 스펙 | A | TransferRequest.token, SPL/ERC-20 빌드 로직, ALLOWED_TOKENS 정책 |
| CHAIN-EXT-02 | 자산 조회 스펙 | A | getAssets() 인터페이스 + RPC 구현 + REST API 응답 스키마 |
| CHAIN-EXT-03 | 컨트랙트 호출 스펙 | B | ContractCallRequest, 화이트리스트 정책, 보안 가이드라인 |
| CHAIN-EXT-04 | Approve 관리 스펙 | B | ApproveRequest, 정책 규칙, 감사 로그 확장 |
| CHAIN-EXT-05 | 배치 트랜잭션 스펙 | B | BatchRequest, Solana 원자적 배치, 정책 합산 평가 |
| CHAIN-EXT-06 | 가격 오라클 스펙 | C | IPriceOracle, 캐싱, USD 기준 정책, fallback |
| CHAIN-EXT-07 | Action Provider 아키텍처 | C | IActionProvider, resolve-then-execute 패턴, MCP 도구 변환, 플러그인 로드 |
| CHAIN-EXT-08 | Swap Action 상세 설계 | C | Jupiter/0x 연동, 슬리피지, 보안 |
| CHAIN-EXT-09 | 확장 기능 테스트 전략 | 전체 | 위 전체 기능의 테스트 레벨/mock/보안 시나리오 통합 |

---

## 테스트 전략 통합

### v0.4 테스트 프레임워크 확장

v0.4에서 수립한 테스트 프레임워크에 다음 요소를 추가한다:

#### Mock 경계 추가

| 의존성 | Mock 방식 | 적용 |
|--------|-----------|------|
| **Aggregator API** (Jupiter, 0x) | Mock HTTP 서버 (quote 응답 fixture) | Unit/Integration |
| **가격 오라클 API** (CoinGecko) | Mock HTTP 서버 (가격 fixture) | Unit/Integration |
| **온체인 오라클** (Pyth, Chainlink) | Mock RPC 응답 | Unit/Integration |
| **IPriceOracle** | Mock 구현체 (고정 가격 반환) | 정책 엔진 테스트 |
| **IActionProvider** | Mock resolve() (고정 ResolvedAction 반환) | 파이프라인 통합 테스트 |

#### 보안 시나리오 추가 (v0.4 기존 25개에 추가)

| # | 시나리오 | Phase | 검증 내용 |
|---|----------|-------|----------|
| S-26 | 미허용 SPL 토큰 전송 시도 | A | ALLOWED_TOKENS 정책 거부 |
| S-27 | 존재하지 않는 민트 주소로 전송 | A | 시뮬레이션 실패 |
| S-28 | 미허용 컨트랙트 호출 | B | CONTRACT_WHITELIST 거부 |
| S-29 | 미허용 method signature 호출 | B | METHOD_WHITELIST 거부 |
| S-30 | 무제한 ERC-20 approve | B | APPROVE_AMOUNT_LIMIT 위반 |
| S-31 | 미허용 spender에 대한 approve | B | APPROVED_SPENDERS 거부 |
| S-32 | 배치 내 1개 정책 위반 → 전체 거부 | B | All-or-Nothing 검증 |
| S-33 | aggregator 악성 calldata 반환 | C | 시뮬레이션 차단 |
| S-34 | 오라클 가격 조작 → 정책 우회 | C | 가격 범위 validation |
| S-35 | 오라클 장애 시 USD 정책 무효화 방지 | C | fallback 동작 |
| S-36 | 악성 Action Provider 플러그인 | C | resolve() 샌드박싱 |
| S-37 | 슬리피지 조작 공격 | C | 최대 슬리피지 정책 |

#### 커버리지 기준 확장

| 패키지 | 기존 목표 | 확장 후 목표 | 비고 |
|--------|----------|-------------|------|
| `@waiaas/core` | 90%+ | 90%+ | 새 Zod 스키마 추가분 포함 |
| `@waiaas/daemon` | 90%+ | 90%+ | 정책 규칙 확장분 포함 |
| `@waiaas/adapter-solana` | 80%+ | 85%+ | SPL 전송, ATA, 배치 추가 |
| `@waiaas/adapter-evm` | 50%+ | 75%+ | ERC-20, approve, 컨트랙트 호출 |
| `@waiaas/actions` (NEW) | - | 80%+ | Action Provider 레이어 |

#### 블록체인 테스트 환경 확장

| 환경 | 기존 | 확장 |
|------|------|------|
| Mock RPC | SOL 전송 fixture | + SPL 토큰, 컨트랙트 호출 fixture |
| Local Validator | solana-test-validator | + SPL 토큰 발행 스크립트, 커스텀 프로그램 배포 |
| Hardhat/Anvil (NEW) | 없음 | EVM 로컬 노드, ERC-20 배포, Uniswap fork |
| Devnet | SOL 전송만 | + SPL 토큰 전송, Jupiter Devnet swap |

---

## 구현 순서 제안

```
Phase A (토큰 확장)        ← 인터페이스 최소 변경, 즉시 가치
  A-1. SPL/ERC-20 전송
  A-2. getAssets() 복원
  A-3. 수수료 추정 확장
       │
       ▼
Phase B (트랜잭션 타입)    ← 새 요청 타입, 정책 확장 필요
  B-1. 임의 컨트랙트 호출
  B-2. 토큰 Approve 관리
  B-3. 멀티 Instruction 배치
       │
       ▼
Phase C (상위 추상화)      ← 새 아키텍처 레이어, 생태계 차별화
  C-1. 가격 오라클
  C-2. Action Provider
  C-3. Swap Action (Jupiter/0x)
```

각 Phase는 독립적으로 설계 가능하되, B는 A에, C는 B에 의존한다.

---

## 성공 기준

### 설계 완성도
- [ ] Phase A~C 전체 9개 산출물의 인터페이스, Zod 스키마, 정책 규칙이 정의됨
- [ ] 기존 IChainAdapter 13개 메서드와의 호환성이 검증됨 (하위 호환 보장)
- [ ] 6단계 파이프라인 구조가 변경 없이 새 기능을 수용함을 증명
- [ ] TransactionType, PolicyType 등 Enum 확장이 v0.3 SSoT 체계에 통합됨

### 보안 설계
- [ ] Phase A~C 각 기능에 대한 보안 시나리오가 정의됨 (최소 12개, S-26~S-37)
- [ ] 임의 컨트랙트 호출의 기본 정책이 "전면 거부" (opt-in 화이트리스트)로 설계됨
- [ ] 토큰 approve의 독립 정책 카테고리가 정의됨 (무제한 approve 차단)
- [ ] Action Provider 플러그인의 보안 경계가 정의됨

### 테스트 설계
- [ ] 각 기능의 테스트 레벨(Unit/Integration/E2E/Security/Chain)과 환경이 정의됨
- [ ] 새 Mock 경계 5개(Aggregator, 가격 API, 온체인 오라클, IPriceOracle, IActionProvider)가 정의됨
- [ ] EVM 로컬 테스트 환경(Hardhat/Anvil)이 설계에 포함됨
- [ ] 커버리지 기준이 확장 패키지를 포함하여 재설정됨

### 차별화
- [ ] "Action Provider + 정책 엔진" 통합 패턴이 설계됨 (resolve → 정책 평가 → 실행)
- [ ] AI 에이전트가 MCP를 통해 DeFi 액션을 자연어로 호출 가능한 구조가 설계됨
- [ ] AgentKit 대비 "실행 전 제어" 차별점이 설계에 명시적으로 반영됨

---

## 마일스톤 범위 외 (Out of Scope)

- 실제 코드 구현 (설계 마일스톤)
- 크로스체인 브릿지 (별도 마일스톤으로 분리)
- NFT 민팅/마켓플레이스 통합 (Action Provider로 향후 추가 가능)
- Liquid Staking 프로토콜 상세 설계 (Swap Action 패턴 확립 후)
- Account Abstraction / Smart Wallet (EVM 배치 문제 해결, 별도 마일스톤)

---

## 선행 마일스톤과의 관계

```
v0.2 (설계)                    v0.6 (블록체인 확장 설계)
──────────                     ─────────────────────────
IChainAdapter 13 methods   →   getAssets() 복원, buildContractCall() 추가
TransferRequest            →   token?, ContractCallRequest, ApproveRequest, BatchRequest
IPolicyEngine 4 rules      →   ALLOWED_TOKENS, CONTRACT_WHITELIST, APPROVED_SPENDERS 등 6+ 규칙
BalanceInfo.usdValue       →   IPriceOracle 통합으로 활성화
IAdapterPlugin (인터페이스) →   IActionProvider 구체화

v0.3 (일관성)                  v0.6 (블록체인 확장 설계)
─────────────                  ─────────────────────────
9개 Enum SSoT              →   TransactionType, PolicyType Enum 값 추가
45-enum-unified-mapping    →   확장 Enum 통합 반영

v0.4 (테스트 전략)             v0.6 (블록체인 확장 설계)
────────────────               ─────────────────────────
보안 시나리오 25개         →   +12개 (S-26~S-37)
Mock 경계 5개              →   +5개 (Aggregator, 오라클 등)
커버리지 기준              →   확장 패키지 포함 재설정
블록체인 테스트 3환경      →   +Hardhat/Anvil (EVM)

v0.5 (인증 재설계)             v0.6 (블록체인 확장 설계)
────────────────               ─────────────────────────
masterAuth/ownerAuth 분리  →   컨트랙트 호출/approve에 동일 인증 체계 적용
에이전트별 owner_address   →   에이전트별 토큰/컨트랙트 화이트리스트
```

---

*작성: 2026-02-06*
*기반 분석: WAIaaS v0.2 설계 문서(24~40), Coinbase AgentKit 비교, 블록체인 기능 확장 분석*
*상태: 초안*
