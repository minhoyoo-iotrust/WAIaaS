# Solana Adapter 상세 설계 (CHAIN-SOL)

**문서 ID:** CHAIN-SOL
**작성일:** 2026-02-05
**v0.6 업데이트:** 2026-02-08
**v0.7 업데이트:** 2026-02-08
**상태:** 완료
**참조:** CORE-04 (27-chain-adapter-interface.md), CORE-03 (26-keystore-spec.md), CORE-01 (24-monorepo-data-directory.md), ENUM-MAP (45-enum-unified-mapping.md), CHAIN-EXT-01~08 (56~63)
**요구사항:** CHAIN-02 (Solana Adapter 완전 구현)
**v0.6 통합:** INTEG-01 (SPL 정식화, Token-2022, getAssets, approve/batch, Jupiter 참조)

---

## 1. 문서 개요

### 1.1 목적

SolanaAdapter는 IChainAdapter 인터페이스(CORE-04)의 Solana 구현체이다. `@solana/kit` (구 `@solana/web3.js 2.x`) 기반의 pipe 함수형 API를 사용하여 SOL 전송, SPL 토큰 전송, 트랜잭션 시뮬레이션, 서명, 제출, 확인 대기를 수행한다.

이 문서는 WAIaaS v0.2 Design Milestone의 Phase 7에서 설계되며, 07-03 트랜잭션 파이프라인 Execute 단계의 구체적 구현 기반이 된다.

### 1.2 @solana/kit 리브랜딩 이력

| 시기 | 패키지 이름 | 버전 | 비고 |
|------|------------|------|------|
| ~2022 | `@solana/web3.js` | 1.x | Connection 클래스 기반 OOP API. deprecated |
| 2024 | `@solana/web3.js` | 2.x | 함수형 pipe API, 모듈러 아키텍처로 완전 재작성 |
| 2024~ | `@solana/kit` | (2.x 리브랜딩) | Anza 공식 SDK. `@solana/web3.js 2.x`와 동일 코드, 패키지명만 변경 |

**WAIaaS 방침:** `@solana/kit` latest를 사용한다. 문서에서는 `@solana/kit (구 @solana/web3.js 2.x)`로 표기하되, 버전 번호보다 기능(pipe API, createSolanaRpc 등)에 초점을 둔다.

### 1.3 IChainAdapter 메서드 -- SolanaAdapter 매핑 (v0.6 변경: 13 -> 17, v0.7: IChainAdapter 19개로 확장)

> **[v0.7 보완]** IChainAdapter는 v0.7에서 19개 메서드로 확장되었다 (getCurrentNonce, resetNonceTracker 추가). 추가된 2개는 EVM nonce 관리 전용이며, SolanaAdapter에서는 no-op으로 구현한다 (Solana는 blockhash 기반, nonce 개념 없음). 아래 테이블은 SolanaAdapter가 실질적으로 구현하는 17개 메서드를 나열한다.

| # | IChainAdapter 메서드 | 카테고리 | SolanaAdapter 구현 | @solana/kit API | 비동기 |
|---|---------------------|---------|-------------------|----------------|--------|
| 1 | `connect(rpcUrl)` | 연결 | `createSolanaRpc` + `createSolanaRpcSubscriptions` + `getHealth` 검증 | `createSolanaRpc`, `createSolanaRpcSubscriptions` | O |
| 2 | `disconnect()` | 연결 | RPC 구독 정리 + `connected = false` | - | O |
| 3 | `isConnected()` | 연결 | `connected` 플래그 반환 | - | X |
| 4 | `getHealth()` | 연결 | `rpc.getHealth().send()` + 레이턴시 측정 | `getHealth` RPC 메서드 | O |
| 5 | `isValidAddress(addr)` | 검증 | Base58 디코딩 + 32바이트 길이 확인 | `@solana/addresses` `isAddress` | X |
| 6 | `getBalance(addr)` | 조회 | `rpc.getBalance(address).send()` | `getBalance` RPC 메서드 | O |
| 7 | `buildTransaction(req)` | 파이프라인 | `pipe(createTransactionMessage, ...)` + instruction 조립 | `pipe`, `createTransactionMessage`, `setTransactionMessageFeePayer` 등 | O |
| 8 | `simulateTransaction(tx)` | 파이프라인 | `rpc.simulateTransaction(compiledTx).send()` | `simulateTransaction` RPC 메서드 | O |
| 9 | `signTransaction(tx, key)` | 파이프라인 | `signTransactionMessageWithSigners` 또는 수동 `signBytes` | `signTransactionMessageWithSigners`, `createKeyPairSignerFromBytes` | O |
| 10 | `submitTransaction(signed)` | 파이프라인 | `rpc.sendTransaction(signedTx).send()` | `sendTransaction` RPC 메서드 | O |
| 11 | `getTransactionStatus(hash)` | 조회 | `rpc.getSignatureStatuses([sig]).send()` | `getSignatureStatuses` RPC 메서드 | O |
| 12 | `waitForConfirmation(hash, timeout)` | 조회 | 폴링 기반 (`getSignatureStatuses` 반복) + 타임아웃 | `getSignatureStatuses` 폴링 | O |
| 13 | `estimateFee(req)` | 추정 | **(v0.6 변경)** FeeEstimate 구조체 반환. base fee + priority + ATA 생성 비용 | `getRecentPrioritizationFees` RPC 메서드 | O |
| 14 | `getAssets(addr)` **(v0.6 추가)** | 조회 | `rpc.getTokenAccountsByOwner()` + 네이티브 SOL 통합 | `getTokenAccountsByOwner` RPC 메서드 | O |
| 15 | `buildContractCall(req)` **(v0.6 추가)** | 파이프라인 | Solana: programId + accounts + data 기반 instruction 빌드 | `pipe` + instruction 직접 구성 | O |
| 16 | `buildApprove(req)` **(v0.6 추가)** | 파이프라인 | `createApproveCheckedInstruction` -- SPL delegate 설정 | `@solana-program/token` approve | O |
| 17 | `buildBatch(req)` **(v0.6 추가)** | 파이프라인 | 다중 instruction VersionedTransaction 구성 (min 2 / max 20) | `pipe` + 다중 `appendTransactionMessageInstruction` | O |

### 1.4 참조 문서 관계

```
┌──────────────────────────────────────────────────────────┐
│  CORE-04 (27-chain-adapter-interface.md)                 │
│  IChainAdapter 인터페이스 + 공통 타입 정의               │
│  TransferRequest, UnsignedTransaction, SimulationResult  │
│  SubmitResult, BalanceInfo, ChainError                   │
└────────────────────────┬─────────────────────────────────┘
                         │ implements
                         ▼
┌──────────────────────────────────────────────────────────┐
│  CHAIN-SOL (31-solana-adapter-detail.md) ◀── 이 문서     │
│  SolanaAdapter 상세 구현 설계 (v0.6: 17 메서드)           │
│  @solana/kit pipe API + Solana RPC 호출 패턴             │
└──────────┬──────────────────────────────┬────────────────┘
           │ signTransaction              │ config
           ▼                              ▼
┌────────────────────────┐  ┌───────────────────────────────┐
│ CORE-03 (26-keystore)  │  │ CORE-01 (24-monorepo)         │
│ sodium guarded memory  │  │ [rpc.solana] 설정              │
│ privateKey Uint8Array  │  │ packages/adapters/solana 경로  │
│ 64바이트 Ed25519 키    │  │ @waiaas/adapter-solana 패키지  │
└────────────────────────┘  └───────────────────────────────┘
```

---

## 2. SolanaAdapter 클래스 구조

### 2.1 파일 위치

```
packages/adapters/solana/src/
├── adapter.ts              # SolanaAdapter 클래스 (이 문서의 핵심)
├── transaction-builder.ts  # SOL/SPL 트랜잭션 빌드 헬퍼
├── rpc.ts                  # RPC 클라이언트 초기화 + 재연결 로직
├── errors.ts               # Solana-specific 에러 매핑
└── index.ts                # 패키지 진입점 (SolanaAdapter export)
```

### 2.2 클래스 선언

```typescript
import type { IChainAdapter, TransferRequest, UnsignedTransaction, SimulationResult, SubmitResult, BalanceInfo, ChainType, NetworkType } from '@waiaas/core/interfaces'
import type { Rpc, SolanaRpcApi, RpcSubscriptions, SolanaRpcSubscriptionsApi } from '@solana/kit'

/**
 * Solana 체인 어댑터.
 * IChainAdapter 17개 메서드를 @solana/kit pipe 기반 API로 구현한다. (v0.6: 13 -> 17)
 *
 * 사용 흐름:
 * 1. const adapter = new SolanaAdapter(config)
 * 2. await adapter.connect(rpcUrl)   -- RPC 연결
 * 3. await adapter.buildTransaction(req)  -- 트랜잭션 빌드
 * 4. ...
 * 5. await adapter.disconnect()      -- 연결 종료
 *
 * @see IChainAdapter (CORE-04)
 */
class SolanaAdapter implements IChainAdapter {
  // ═══════════════════════════════════════════════════════════
  // 읽기 전용 프로퍼티 (IChainAdapter 요구)
  // ═══════════════════════════════════════════════════════════

  /** Solana 체인 식별자 */
  readonly chain: ChainType = 'solana'

  /** Solana 네트워크. [v0.7 보완] 앱 레벨 NetworkType: 'mainnet' | 'devnet' | 'testnet' */
  readonly network: NetworkType

  // ═══════════════════════════════════════════════════════════
  // 내부 상태
  // ═══════════════════════════════════════════════════════════

  /** @solana/kit RPC 클라이언트 -- JSON-RPC 통신 */
  private rpc: Rpc<SolanaRpcApi> | null = null

  /** @solana/kit WebSocket 구독 클라이언트 -- 실시간 알림 */
  private rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi> | null = null

  /** RPC 연결 상태 */
  private connected: boolean = false

  /** RPC HTTP URL */
  private rpcUrl: string = ''

  /** RPC WebSocket URL */
  private wsUrl: string = ''

  /** 기본 commitment 수준 */
  private commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'

  /** 최근 blockhash 캐시 (5초 TTL) */
  private blockhashCache: {
    blockhash: string
    lastValidBlockHeight: bigint
    cachedAt: number
  } | null = null

  /** Priority fee 캐시 (30초 TTL) */
  private priorityFeeCache: {
    medianFee: bigint
    cachedAt: number
  } | null = null

  // ═══════════════════════════════════════════════════════════
  // [v0.7 보완] Blockhash Freshness Guard 상수
  // ═══════════════════════════════════════════════════════════

  /**
   * [v0.7 보완] Blockhash freshness 임계값 (초).
   * signTransaction() 직전에 잔여 수명이 이 값 미만이면 BLOCKHASH_STALE을 발생시킨다.
   *
   * 근거:
   * - Solana blockhash 수명: 150 슬롯 x 400ms = ~60초
   * - sign 소요: ~1초
   * - submit 소요: ~2초
   * - confirmation 대기: ~2초
   * - 안전 마진: ~15초 (네트워크 지연, RPC 레이턴시, 변동)
   * - 20초 = sign(1초) + submit(2초) + 대기(2초) + 안전마진(15초)
   */
  private readonly FRESHNESS_THRESHOLD_SECONDS = 20

  // ═══════════════════════════════════════════════════════════
  // 생성자
  // ═══════════════════════════════════════════════════════════

  constructor(config: SolanaAdapterConfig) {
    this.network = config.network
    this.rpcUrl = config.rpcUrl
    this.wsUrl = config.wsUrl
    this.commitment = config.commitment ?? 'confirmed'
  }
}
```

### 2.3 SolanaAdapterConfig 타입

```typescript
/**
 * SolanaAdapter 생성자 설정.
 * config.toml [rpc.solana] 섹션에서 로드된 값을 주입받는다.
 */
interface SolanaAdapterConfig {
  /** Solana 네트워크. [v0.7 보완] 앱 레벨 NetworkType 사용 (체인 무관 추상화) */
  network: 'mainnet' | 'devnet' | 'testnet'

  /** RPC HTTP 엔드포인트 URL */
  rpcUrl: string

  /** RPC WebSocket 엔드포인트 URL */
  wsUrl: string

  /**
   * 기본 commitment 수준.
   * - 'processed': 단일 노드 검증 (가장 빠름, 되돌림 가능)
   * - 'confirmed': 슈퍼마조리티(66%+) 투표 (기본값, 빠르고 안전)
   * - 'finalized': 31+ 확인 블록 (가장 느림, 최종 확정)
   *
   * @default 'confirmed'
   */
  commitment?: 'processed' | 'confirmed' | 'finalized'
}
```

### 2.4 config.toml 매핑

```toml
# CORE-01 config.toml에서 로드되는 Solana 관련 설정

# [v0.7 보완] config 키는 앱 레벨 NetworkType ('mainnet') 사용.
# RPC URL의 'mainnet-beta'는 Solana 공식 도메인명이므로 그대로 유지.
[rpc.solana]
mainnet = "https://api.mainnet-beta.solana.com"    # mainnet -> mainnet-beta RPC URL 매핑
devnet = "https://api.devnet.solana.com"
testnet = "https://api.testnet.solana.com"

[rpc.solana.ws]
mainnet = "wss://api.mainnet-beta.solana.com"      # mainnet -> mainnet-beta WebSocket 매핑
devnet = "wss://api.devnet.solana.com"
```

**config -> SolanaAdapterConfig 변환 로직** (AdapterRegistry 팩토리에서 수행):

```typescript
// packages/daemon/src/infrastructure/adapter-registry.ts 내부

function createSolanaFactory(config: AppConfig): AdapterFactory {
  return (network: NetworkType, _rpcUrl: string): IChainAdapter => {
    // [v0.7 보완] network는 앱 레벨 NetworkType ('mainnet' | 'devnet' | 'testnet')
    // config.toml의 키와 직접 대응하므로 별도 변환 불필요
    // 참고: Solana의 실제 RPC URL은 'api.mainnet-beta.solana.com'이지만
    //       앱 레벨에서는 'mainnet'으로 추상화. RPC URL 매핑은 config.toml이 담당.
    const rpcUrl = config.rpc.solana[network]
    const wsUrl = config.rpc.solana.ws?.[network]
      ?? rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://')

    return new SolanaAdapter({
      network,
      rpcUrl,
      wsUrl,
      commitment: 'confirmed',
    })
  }
}
```

---

## 3. RPC 연결 관리

### 3.1 connect(rpcUrl: string): Promise\<void\>

```typescript
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit'

async connect(rpcUrl: string): Promise<void> {
  // 이미 연결된 경우 무시
  if (this.connected) return

  // RPC URL 오버라이드 (connect 파라미터가 있으면 우선)
  const effectiveRpcUrl = rpcUrl || this.rpcUrl
  const effectiveWsUrl = this.wsUrl
    || effectiveRpcUrl.replace('https://', 'wss://').replace('http://', 'ws://')

  // 재시도 로직 (3회, exponential backoff: 1초, 2초, 4초)
  let lastError: Error | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // 1. RPC 클라이언트 생성
      this.rpc = createSolanaRpc(effectiveRpcUrl)

      // 2. WebSocket 구독 클라이언트 생성
      this.rpcSubscriptions = createSolanaRpcSubscriptions(effectiveWsUrl)

      // 3. 연결 확인 (getHealth RPC 호출)
      const healthResult = await this.rpc.getHealth().send()
      // getHealth()는 노드가 healthy하면 "ok"를 반환한다.
      // unhealthy하면 에러를 던진다.

      // 4. 연결 성공
      this.rpcUrl = effectiveRpcUrl
      this.wsUrl = effectiveWsUrl
      this.connected = true

      return // 성공, 루프 종료
    } catch (err) {
      lastError = err as Error
      if (attempt < 2) {
        // exponential backoff: 1초, 2초
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
      }
    }
  }

  // 3회 재시도 모두 실패
  // CORE-04 결정: 어댑터 초기화 실패 = warn (fail-fast 아님)
  this.connected = false
  throw new ChainError({
    code: ChainErrorCode.RPC_ERROR,
    chain: 'solana',
    message: `Solana RPC 연결 실패 (${effectiveRpcUrl}): ${lastError?.message}`,
    details: { rpcUrl: effectiveRpcUrl, attempts: 3 },
    retryable: true,
    cause: lastError,
  })
}
```

**연결 실패 시 동작 (CORE-04 결정 준수):**
- AdapterRegistry에서 `connect()` 호출 시 에러가 발생하면 **warn 로그를 남기고 계속 진행**한다 (fail-fast 아님).
- 어댑터는 `connected = false` 상태로 유지된다.
- 이후 해당 체인/네트워크에 대한 트랜잭션 요청이 들어오면 `RPC_ERROR`를 반환한다.

### 3.2 disconnect(): Promise\<void\>

```typescript
async disconnect(): Promise<void> {
  // RPC 구독 정리 (WebSocket 연결 해제)
  // @solana/kit의 RpcSubscriptions는 AbortController로 관리
  // 개별 구독은 이미 해제되었을 수 있으므로 안전하게 처리
  this.rpcSubscriptions = null

  // RPC 클라이언트 정리
  this.rpc = null

  // 캐시 초기화
  this.blockhashCache = null
  this.priorityFeeCache = null

  // 상태 갱신
  this.connected = false
}
```

### 3.3 isConnected(): boolean

```typescript
isConnected(): boolean {
  return this.connected
}
```

### 3.4 getHealth(): Promise\<{ healthy: boolean; latency: number }\>

```typescript
async getHealth(): Promise<{ healthy: boolean; latency: number }> {
  // 연결되지 않은 상태에서 호출 시 즉시 반환 (CORE-04 명세)
  if (!this.connected || !this.rpc) {
    return { healthy: false, latency: -1 }
  }

  const start = performance.now()

  try {
    // Solana getHealth RPC: 노드가 healthy하면 "ok" 반환
    await this.rpc.getHealth().send()

    const latency = Math.round(performance.now() - start)
    return { healthy: true, latency }
  } catch {
    const latency = Math.round(performance.now() - start)
    return { healthy: false, latency }
  }
}
```

### 3.5 재연결 전략 요약

| 상황 | 동작 | 근거 |
|------|------|------|
| 최초 connect 실패 | 3회 재시도 (1s, 2s, 4s exponential backoff) | 일시적 네트워크 문제 대응 |
| 실행 중 RPC 호출 실패 | 개별 메서드에서 ChainError 반환 | 호출자가 재시도 판단 |
| 자동 재연결 | 미구현 (v0.2 범위 외) | Self-Hosted 단일 서버에서는 수동 재연결이 합리적 |
| Graceful Shutdown | disconnect() 호출 | CORE-05 10단계 종료 캐스케이드 |

---

## 4. 조회 메서드

### 4.1 isValidAddress(address: string): boolean

```typescript
import { isAddress } from '@solana/addresses'

isValidAddress(address: string): boolean {
  // @solana/addresses의 isAddress()는 Base58 디코딩 + 32바이트 길이를 검증한다.
  // 온체인 존재 여부는 확인하지 않는다 (포맷 검증만).
  //
  // Solana 주소 = Ed25519 공개키의 Base58 인코딩
  // 길이: 32-44자 (Base58 인코딩 특성상 가변)
  // 내부 바이트: 정확히 32바이트
  try {
    return isAddress(address)
  } catch {
    return false
  }
}
```

### 4.2 getBalance(address: string): Promise\<BalanceInfo\>

```typescript
import type { Address } from '@solana/kit'

async getBalance(address: string): Promise<BalanceInfo> {
  this.ensureConnected()  // 연결 확인, 미연결 시 ChainError 던짐

  // 주소 검증
  if (!this.isValidAddress(address)) {
    throw new ChainError({
      code: ChainErrorCode.INVALID_ADDRESS,
      chain: 'solana',
      message: `유효하지 않은 Solana 주소: ${address}`,
      retryable: false,
    })
  }

  try {
    // rpc.getBalance()는 lamports 단위의 잔액을 반환한다.
    // commitment을 명시하여 일관된 결과를 보장한다.
    const result = await this.rpc!.getBalance(
      address as Address,
      { commitment: this.commitment }
    ).send()

    return {
      address,
      balance: result.value,        // bigint (lamports)
      decimals: 9,                  // SOL = 10^9 lamports
      symbol: 'SOL',
      // usdValue: undefined        // v0.2 미구현
    }
  } catch (err) {
    throw new ChainError({
      code: ChainErrorCode.RPC_ERROR,
      chain: 'solana',
      message: `잔액 조회 실패: ${(err as Error).message}`,
      retryable: true,
      cause: err as Error,
    })
  }
}
```

**참고:** ~~SPL 토큰 잔액 조회는 v0.3으로 이연한다.~~ **(v0.6 정식 설계)** SPL/Token-2022 토큰 잔액 조회는 `getAssets()` 메서드(섹션 4.6)로 통합 지원된다. `getBalance()`는 네이티브 SOL 잔액만 반환하며, 토큰 포함 전체 자산은 `getAssets()`를 사용한다.

### 4.3 getTransactionStatus(txHash: string): Promise\<SubmitResult\>

```typescript
async getTransactionStatus(txHash: string): Promise<SubmitResult> {
  this.ensureConnected()

  try {
    // getSignatureStatuses는 서명 배열을 받아 상태 배열을 반환한다.
    // searchTransactionHistory: true로 과거 트랜잭션도 조회 가능
    const result = await this.rpc!.getSignatureStatuses(
      [txHash as Parameters<typeof this.rpc!.getSignatureStatuses>[0][0]],
      { searchTransactionHistory: true }
    ).send()

    const status = result.value[0]

    // 트랜잭션을 찾지 못한 경우
    if (!status) {
      return {
        txHash,
        status: 'submitted',  // 아직 처리 중이거나 만료됨
        confirmations: undefined,
        blockNumber: undefined,
        fee: undefined,
      }
    }

    // 에러가 있는 경우
    if (status.err) {
      throw new ChainError({
        code: ChainErrorCode.TRANSACTION_FAILED,
        chain: 'solana',
        message: `트랜잭션 실행 실패: ${JSON.stringify(status.err)}`,
        details: { err: status.err },
        retryable: false,
      })
    }

    // confirmationStatus 매핑
    // Solana: 'processed' -> 'confirmed' -> 'finalized'
    // WAIaaS: 'submitted' -> 'confirmed' -> 'finalized'
    const confirmationStatus = status.confirmationStatus

    let mappedStatus: 'submitted' | 'confirmed' | 'finalized'
    if (confirmationStatus === 'finalized') {
      mappedStatus = 'finalized'
    } else if (confirmationStatus === 'confirmed') {
      mappedStatus = 'confirmed'
    } else {
      // 'processed' = 아직 대다수 투표 미완료
      mappedStatus = 'submitted'
    }

    return {
      txHash,
      status: mappedStatus,
      confirmations: undefined,  // Solana는 확인 수 개념 없음 (이진 상태)
      blockNumber: status.slot ? BigInt(status.slot) : undefined,
      fee: undefined,  // getSignatureStatuses는 수수료를 반환하지 않음
    }
  } catch (err) {
    if (err instanceof ChainError) throw err

    throw new ChainError({
      code: ChainErrorCode.RPC_ERROR,
      chain: 'solana',
      message: `트랜잭션 상태 조회 실패: ${(err as Error).message}`,
      retryable: true,
      cause: err as Error,
    })
  }
}
```

### 4.4 estimateFee(request: TransferRequest): Promise\<FeeEstimate\> (v0.6 변경)

> **(v0.6 변경)** 반환 타입이 `bigint` -> `FeeEstimate` 구조체로 변경되었다. ATA 생성 비용을 `accountCreationFee`로 분리하여 토큰 전송 시 정확한 수수료 추정을 제공한다. 소스: 57-asset-query-fee-estimation-spec.md 섹션 6

```typescript
/** (v0.6 변경) 수수료 추정 결과 -- 27-chain-adapter-interface.md 참조 */
interface FeeEstimate {
  baseFee: bigint          // 서명당 고정 수수료 (5000 lamports)
  priorityFee: bigint      // 네트워크 혼잡도 기반 추가 수수료
  accountCreationFee: bigint  // (v0.6 추가) ATA 생성 시 rent-exempt 비용
  totalFee: bigint         // baseFee + priorityFee + accountCreationFee
  computeUnits?: number    // (v0.6 추가) 예상 compute units
}

async estimateFee(request: TransferRequest): Promise<FeeEstimate> {
  this.ensureConnected()

  // === 1. Base Fee ===
  // Solana의 base fee는 서명당 5000 lamports로 고정이다.
  // 단일 서명 트랜잭션(WAIaaS 기본)의 base fee = 5000 lamports
  const baseFee = BigInt(5000)

  // === 2. Priority Fee (선택적) ===
  // getRecentPrioritizationFees를 호출하여 네트워크 혼잡도에 따른 추가 수수료를 추정한다.
  // 캐시 TTL: 30초
  let priorityFee = BigInt(0)

  try {
    priorityFee = await this.getMedianPriorityFee()
  } catch {
    // Priority fee 조회 실패 시 0으로 진행 (base fee만 사용)
    // 네트워크 혼잡 시 트랜잭션 지연될 수 있지만 실패하지는 않음
  }

  // === 3. (v0.6 추가) ATA 생성 비용 ===
  // 토큰 전송 시 수신자 ATA가 없으면 rent-exempt 비용이 추가된다
  // getMinimumBalanceForRentExemption(165) 동적 조회 (하드코딩 금지)
  let accountCreationFee = BigInt(0)
  if (request.token) {
    const destinationAta = await this.checkAtaExists(
      request.to as Address,
      request.token as Address,
    )
    if (!destinationAta) {
      accountCreationFee = await this.rpc!.getMinimumBalanceForRentExemption(
        BigInt(165),
        { commitment: this.commitment },
      ).send()
    }
  }

  // === 4. (v0.6 추가) Compute Units 추정 ===
  // SOL 전송: ~200 CU, SPL 전송: ~3000 CU, SPL+ATA 생성: ~6000 CU
  const computeUnits = request.token
    ? (accountCreationFee > 0n ? 6000 : 3000)
    : 200

  // === 5. 수수료 합산 ===
  return {
    baseFee,
    priorityFee,
    accountCreationFee,
    totalFee: baseFee + priorityFee + accountCreationFee,
    computeUnits,
  }
}

/**
 * 최근 priority fee의 중간값을 조회한다.
 * 30초 캐시를 적용하여 RPC 호출을 최소화한다.
 */
private async getMedianPriorityFee(): Promise<bigint> {
  const now = Date.now()

  // 캐시 히트 (30초 이내)
  if (this.priorityFeeCache && now - this.priorityFeeCache.cachedAt < 30_000) {
    return this.priorityFeeCache.medianFee
  }

  // RPC 호출: 최근 150 슬롯의 priority fee 통계
  const fees = await this.rpc!.getRecentPrioritizationFees().send()

  if (fees.length === 0) {
    return BigInt(0)
  }

  // 중간값 계산 (micro-lamports per compute unit)
  const sortedFees = fees
    .map(f => f.prioritizationFee)
    .sort((a, b) => Number(a - b))
  const medianIndex = Math.floor(sortedFees.length / 2)
  const medianMicroLamports = sortedFees[medianIndex]

  // micro-lamports -> lamports 변환
  // priority fee = microLamports * computeUnits / 1_000_000
  // SOL 전송의 기본 compute units = 200 (실제 측정값 기반)
  const DEFAULT_COMPUTE_UNITS = BigInt(200)
  const medianFee = (medianMicroLamports * DEFAULT_COMPUTE_UNITS) / BigInt(1_000_000)

  // 캐시 갱신
  this.priorityFeeCache = { medianFee, cachedAt: now }

  return medianFee
}
```

**수수료 구조 요약 (v0.6 변경):**

| 항목 | 값 | 단위 | 설명 |
|------|-----|------|------|
| Base Fee | 5000 | lamports | 서명당 고정 수수료 |
| Priority Fee | 가변 | lamports | 네트워크 혼잡도 기반 추가 수수료 |
| **(v0.6) Account Creation Fee** | 가변 (~2,039,280) | lamports | ATA 생성 시 rent-exempt 비용. `getMinimumBalanceForRentExemption(165)` 동적 조회 |
| Compute Unit Price | `getRecentPrioritizationFees` 중간값 | micro-lamports/CU | Compute Budget instruction으로 설정 |
| 총 예상 수수료 | baseFee + priorityFee + accountCreationFee | lamports | `estimateFee()` 반환값 (v0.6: FeeEstimate 구조체) |

### 4.5 공통 유틸리티

```typescript
/**
 * RPC 연결 상태를 확인하고, 미연결 시 ChainError를 던진다.
 * 모든 RPC 호출 메서드에서 첫 줄에 호출한다.
 */
private ensureConnected(): void {
  if (!this.connected || !this.rpc) {
    throw new ChainError({
      code: ChainErrorCode.RPC_ERROR,
      chain: 'solana',
      message: 'Solana RPC에 연결되지 않았습니다. connect()를 먼저 호출하세요.',
      retryable: false,
    })
  }
}

/**
 * 최근 blockhash를 조회한다.
 * 5초 캐시를 적용하여 동일 슬롯 내 여러 트랜잭션에서 재사용한다.
 */
private async getRecentBlockhash(): Promise<{
  blockhash: string
  lastValidBlockHeight: bigint
}> {
  const now = Date.now()

  // 캐시 히트 (5초 이내)
  if (this.blockhashCache && now - this.blockhashCache.cachedAt < 5_000) {
    return {
      blockhash: this.blockhashCache.blockhash,
      lastValidBlockHeight: this.blockhashCache.lastValidBlockHeight,
    }
  }

  // RPC 호출
  const result = await this.rpc!.getLatestBlockhash({
    commitment: this.commitment,
  }).send()

  // 캐시 갱신
  this.blockhashCache = {
    blockhash: result.value.blockhash,
    lastValidBlockHeight: result.value.lastValidBlockHeight,
    cachedAt: now,
  }

  return {
    blockhash: result.value.blockhash,
    lastValidBlockHeight: result.value.lastValidBlockHeight,
  }
}
```

### 4.6 getAssets(address: string): Promise\<AssetInfo[]\> (v0.6 추가)

> **(v0.6 추가)** 27-chain-adapter-interface.md에서 추가된 `getAssets()` 메서드. 네이티브 SOL + SPL/Token-2022 토큰의 통합 자산 목록을 반환한다. 소스: 57-asset-query-fee-estimation-spec.md 섹션 5

```typescript
import type { Address } from '@solana/kit'

/** (v0.6 추가) 자산 정보 구조체 -- 27-chain-adapter-interface.md 참조 */
interface AssetInfo {
  type: 'native' | 'spl'   // Token-2022도 'spl'로 통합 (프로그램 구분은 내부)
  symbol?: string           // SOL, USDC 등 (알려진 토큰만)
  name?: string             // 토큰 이름 (알려진 토큰만)
  mint?: string             // 토큰 민트 주소 (native는 undefined)
  balance: string           // 잔액 (최소 단위 문자열)
  decimals: number          // 소수점 자릿수
  programId?: string        // (v0.6) TOKEN_PROGRAM_ID 또는 TOKEN_2022_PROGRAM_ID
}

async getAssets(address: string): Promise<AssetInfo[]> {
  this.ensureConnected()

  if (!this.isValidAddress(address)) {
    throw new ChainError({
      code: ChainErrorCode.INVALID_ADDRESS,
      chain: 'solana',
      message: `유효하지 않은 Solana 주소: ${address}`,
      retryable: false,
    })
  }

  const assets: AssetInfo[] = []
  const addr = address as Address

  // 1. 네이티브 SOL 잔액 (항상 첫 번째)
  const solBalance = await this.rpc!.getBalance(addr, {
    commitment: this.commitment,
  }).send()

  assets.push({
    type: 'native',
    symbol: 'SOL',
    name: 'Solana',
    balance: solBalance.value.toString(),
    decimals: 9,
  })

  // 2. SPL 토큰 조회 (Token Program)
  const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address
  const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' as Address

  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const tokenAccounts = await this.rpc!.getTokenAccountsByOwner(
        addr,
        { programId },
        { encoding: 'jsonParsed', commitment: this.commitment },
      ).send()

      for (const account of tokenAccounts.value) {
        const parsed = account.account.data.parsed?.info
        if (!parsed || parsed.tokenAmount.uiAmount === 0) continue  // 잔액 0 제외

        assets.push({
          type: 'spl',  // Token-2022도 'spl'로 통합
          mint: parsed.mint,
          balance: parsed.tokenAmount.amount,
          decimals: parsed.tokenAmount.decimals,
          programId: programId as string,
        })
      }
    } catch {
      // 토큰 조회 실패 시 무시 (네이티브 SOL은 이미 추가됨)
    }
  }

  // 3. 잔액 내림차순 정렬 (네이티브 SOL 첫 번째 유지, 이후 토큰은 잔액 내림차순)
  // 결정: 57-asset-query-fee-estimation-spec.md -- 네이티브 토큰 첫 번째, 이후 잔액 내림차순
  const nativeAssets = assets.filter(a => a.type === 'native')
  const tokenAssets = assets.filter(a => a.type === 'spl')
    .sort((a, b) => {
      const balA = BigInt(a.balance)
      const balB = BigInt(b.balance)
      return balB > balA ? 1 : balB < balA ? -1 : 0
    })

  return [...nativeAssets, ...tokenAssets]
}
```

**Token-2022 처리 (v0.6):**
- Token-2022 토큰도 `type='spl'`로 통합 반환한다 (프로그램 구분은 `programId` 필드로)
- Token-2022의 위험 확장(TransferFee, ConfidentialTransfer 등)은 `getAssets()` 단계에서는 검사하지 않는다
- 위험 확장 감지/거부는 `buildTransfer()` 또는 `buildApprove()` 단계에서 수행 (섹션 5.2)

---

## 5. buildTransaction -- @solana/kit pipe 기반 트랜잭션 빌드

### 5.1 SOL 전송 (네이티브 전송)

```typescript
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  compileTransactionMessage,
  getCompiledTransactionMessageEncoder,
} from '@solana/kit'
import { getTransferSolInstruction } from '@solana-program/system'
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget'
import type { Address } from '@solana/kit'

async buildTransaction(request: TransferRequest): Promise<UnsignedTransaction> {
  this.ensureConnected()

  // 1. 주소 검증
  if (!this.isValidAddress(request.from)) {
    throw new ChainError({
      code: ChainErrorCode.INVALID_ADDRESS,
      chain: 'solana',
      message: `유효하지 않은 발신 주소: ${request.from}`,
      retryable: false,
    })
  }
  if (!this.isValidAddress(request.to)) {
    throw new ChainError({
      code: ChainErrorCode.INVALID_ADDRESS,
      chain: 'solana',
      message: `유효하지 않은 수신 주소: ${request.to}`,
      retryable: false,
    })
  }

  // 2. 최근 blockhash 조회 (캐시 활용)
  const { blockhash, lastValidBlockHeight } = await this.getRecentBlockhash()

  // 3. Priority fee 조회
  const priorityFee = await this.getMedianPriorityFee()

  // 4. pipe 패턴으로 트랜잭션 메시지 구성
  const from = request.from as Address
  const to = request.to as Address

  let transactionMessage = pipe(
    // 4a. 버전 0 트랜잭션 메시지 생성
    createTransactionMessage({ version: 0 }),

    // 4b. Fee Payer 설정 (발신자 = Fee Payer)
    tx => setTransactionMessageFeePayer(from, tx),

    // 4c. 수명(lifetime) 설정 -- blockhash 기반
    tx => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash, lastValidBlockHeight },
      tx,
    ),

    // 4d. Compute Unit Limit 설정 (Priority Fee 적용 시 필수)
    // SOL 전송의 기본 CU는 ~200이나, 안전 마진을 위해 300으로 설정
    // simulateTransaction 후 실제 CU * 1.2로 재조정할 수 있음
    tx => appendTransactionMessageInstruction(
      getSetComputeUnitLimitInstruction({ units: 300 }),
      tx,
    ),

    // 4e. Compute Unit Price 설정 (Priority Fee)
    tx => appendTransactionMessageInstruction(
      getSetComputeUnitPriceInstruction({
        microLamports: priorityFee > 0n
          ? priorityFee * BigInt(1_000_000) / BigInt(300)  // lamports -> microLamports/CU
          : BigInt(0),
      }),
      tx,
    ),

    // 4f. SOL 전송 instruction 추가
    tx => appendTransactionMessageInstruction(
      getTransferSolInstruction({
        source: from,
        destination: to,
        amount: request.amount,  // lamports (bigint)
      }),
      tx,
    ),
  )

  // 5. Memo instruction 추가 (선택적)
  if (request.memo) {
    // @solana-program/memo의 getAddMemoInstruction 사용
    // memo는 최대 256바이트로 제한 (CORE-04 TransferRequest 명세)
    const memoBytes = new TextEncoder().encode(request.memo)
    if (memoBytes.length > 256) {
      throw new ChainError({
        code: ChainErrorCode.TRANSACTION_FAILED,
        chain: 'solana',
        message: `메모가 256바이트를 초과합니다: ${memoBytes.length}바이트`,
        retryable: false,
      })
    }

    // Memo Program ID: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
    transactionMessage = appendTransactionMessageInstruction(
      {
        programAddress: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' as Address,
        data: memoBytes,
      },
      transactionMessage,
    )
  }

  // 6. 트랜잭션 메시지 컴파일 + 직렬화
  const compiledMessage = compileTransactionMessage(transactionMessage)
  const encoder = getCompiledTransactionMessageEncoder()
  const serialized = encoder.encode(compiledMessage)

  // 7. 예상 수수료 계산
  const baseFee = BigInt(5000)  // 서명 1개 기준
  const estimatedFee = baseFee + priorityFee

  // 8. 만료 시각 계산 (blockhash 수명 ~60초)
  // Solana 슬롯 당 ~400ms, blockhash는 150 슬롯 동안 유효
  // 안전 마진을 위해 50초로 설정
  const expiresAt = new Date(Date.now() + 50_000)

  return {
    chain: 'solana',
    serialized,
    estimatedFee,
    expiresAt,
    metadata: {
      blockhash,
      lastValidBlockHeight,
      version: 0,
      from: request.from,
      to: request.to,
      amount: request.amount.toString(),
      type: 'SOL_TRANSFER',
    },
  }
}
```

### 5.2 SPL 토큰 전송 (v0.6 정식 설계)

> **(v0.6 정식 설계)** ~~v0.2에서는 네이티브 SOL 전송만 공식 지원.~~ SPL 토큰 전송이 v0.6에서 정식 설계되었다. `getTransferCheckedInstruction` 사용으로 decimals 온체인 검증이 보장된다. Token-2022 기본 transfer 지원, 위험 확장 감지 시 거부. 소스: 56-token-transfer-extension-spec.md 섹션 5

```typescript
// (v0.6 변경) getTransferInstruction -> getTransferCheckedInstruction
// decimals 온체인 검증을 보장하여 소수점 오류로 인한 자산 손실 방지
import { getTransferCheckedInstruction } from '@solana-program/token'
import {
  getCreateAssociatedTokenAccountInstruction,
  findAssociatedTokenPda,
} from '@solana-program/associated-token-account'

/**
 * SPL 토큰 전송 트랜잭션을 빌드한다.
 * buildTransaction()에서 request.token 필드 존재 시 내부적으로 호출된다.
 *
 * (v0.6 정식 설계) SPL 토큰 전송 절차:
 * 1. 토큰 프로그램 감지 (Token Program vs Token-2022)
 * 2. Token-2022 위험 확장 검사 (TransferFee, ConfidentialTransfer 등 -> 거부)
 * 3. Associated Token Account (ATA) 존재 확인
 * 4. ATA가 없으면 생성 instruction 선행 추가 (생성 비용 동적 조회)
 * 5. getTransferCheckedInstruction으로 토큰 전송 (decimals 온체인 검증)
 *
 * 소스: 56-token-transfer-extension-spec.md 섹션 5
 */
private async buildSplTokenTransfer(
  from: Address,
  to: Address,
  amount: bigint,
  mintAddress: Address,
  blockhash: string,
  lastValidBlockHeight: bigint,
): Promise<UnsignedTransaction> {

  // (v0.6 추가) 0. 토큰 프로그램 감지 + Token-2022 위험 확장 검사
  const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address
  const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' as Address

  // 민트 계정의 owner 프로그램으로 Token/Token-2022 구분
  const mintAccountInfo = await this.rpc!.getAccountInfo(mintAddress, {
    encoding: 'base64',
  }).send()

  const tokenProgramId = mintAccountInfo.value?.owner === TOKEN_2022_PROGRAM_ID
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID

  // (v0.6) Token-2022 위험 확장 감지 시 거부
  // TransferFee, ConfidentialTransfer, TransferHook 등은 예측 불가능한 동작 유발
  // 소스: 56-token-transfer-extension-spec.md 섹션 5.3
  if (tokenProgramId === TOKEN_2022_PROGRAM_ID) {
    const dangerousExtensions = await this.detectDangerousExtensions(mintAddress)
    if (dangerousExtensions.length > 0) {
      throw new ChainError({
        code: ChainErrorCode.TRANSACTION_FAILED,
        chain: 'solana',
        message: `Token-2022 위험 확장이 감지되어 전송이 거부되었습니다: ${dangerousExtensions.join(', ')}`,
        details: { mint: mintAddress, extensions: dangerousExtensions },
        retryable: false,
      })
    }
  }

  // 1. 발신자/수신자의 ATA(Associated Token Account) PDA 계산
  // (v0.6 변경) tokenProgram에 감지된 프로그램 ID 사용
  const [sourceAta] = await findAssociatedTokenPda({
    owner: from,
    mint: mintAddress,
    tokenProgram: tokenProgramId,
  })

  const [destinationAta] = await findAssociatedTokenPda({
    owner: to,
    mint: mintAddress,
    tokenProgram: tokenProgramId,
  })

  // 2. 수신자 ATA 존재 확인
  let needCreateAta = false
  try {
    const accountInfo = await this.rpc!.getAccountInfo(destinationAta, {
      encoding: 'base64',
    }).send()
    if (!accountInfo.value) {
      needCreateAta = true
    }
  } catch {
    needCreateAta = true
  }

  // 3. 트랜잭션 메시지 구성
  let transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayer(from, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash, lastValidBlockHeight },
      tx,
    ),
  )

  // 3a. ATA 생성 instruction (필요 시)
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

  // 3b. SPL 토큰 전송 instruction
  // (v0.6 변경) getTransferCheckedInstruction 사용
  // decimals를 온체인에서 검증하여 소수점 오류로 인한 자산 손실 방지
  // 소스: 56-token-transfer-extension-spec.md 결정 "getTransferCheckedInstruction 사용"
  const mintInfo = await this.rpc!.getAccountInfo(mintAddress, {
    encoding: 'jsonParsed',
  }).send()
  const tokenDecimals = mintInfo.value?.data?.parsed?.info?.decimals ?? 0

  transactionMessage = appendTransactionMessageInstruction(
    getTransferCheckedInstruction({
      source: sourceAta,
      mint: mintAddress,
      destination: destinationAta,
      authority: from,  // owner = 발신자
      amount,           // 토큰 최소 단위 (decimals 적용 전 원시값)
      decimals: tokenDecimals,  // (v0.6) 온체인 검증용 decimals
      // (v0.6) Token-2022인 경우 해당 프로그램 ID 사용
      tokenProgram: tokenProgramId,
    }),
    transactionMessage,
  )

  // 4. 컴파일 + 직렬화
  const compiledMessage = compileTransactionMessage(transactionMessage)
  const encoder = getCompiledTransactionMessageEncoder()
  const serialized = encoder.encode(compiledMessage)

  const baseFee = BigInt(5000)
  const expiresAt = new Date(Date.now() + 50_000)

  // (v0.6 변경) ATA 생성 비용 동적 조회 (하드코딩 금지)
  // 소스: 57-asset-query-fee-estimation-spec.md 결정
  // getMinimumBalanceForRentExemption(165) -- ATA 데이터 크기 = 165 bytes
  let accountCreationFee = BigInt(0)
  if (needCreateAta) {
    accountCreationFee = await this.rpc!.getMinimumBalanceForRentExemption(
      BigInt(165),  // SPL Token Account 데이터 크기
      { commitment: this.commitment },
    ).send()
  }

  return {
    chain: 'solana',
    serialized,
    estimatedFee: baseFee + accountCreationFee,  // (v0.6 변경) 동적 rent-exempt 비용
    expiresAt,
    metadata: {
      blockhash,
      lastValidBlockHeight,
      version: 0,
      from: from as string,
      to: to as string,
      amount: amount.toString(),
      mintAddress: mintAddress as string,
      needCreateAta,
      accountCreationFee: accountCreationFee.toString(),  // (v0.6) 감사 로그용
      type: 'SPL_TOKEN_TRANSFER',
      tokenProgram: tokenProgramId as string,  // (v0.6) Token/Token-2022 구분
    },
  }
}
```

### 5.3 buildTransaction 내부 분기 로직 (v0.6 정식화)

> **(v0.6 변경)** buildTransaction은 `request.token` 필드 존재 여부로 SOL/SPL 전송을 분기한다. 기존 주석 처리를 정식 코드로 전환. 소스: 56-token-transfer-extension-spec.md 결정 "TransferRequest에 token? 필드로 분기"

```typescript
// (v0.6 정식화) buildTransaction() 내부 분기
// request.token 필드 존재 시 SPL 토큰 전송, 없으면 네이티브 SOL 전송
// 27-chain-adapter-interface.md의 buildTransfer() 메서드에 해당

if (request.token) {
  // SPL/Token-2022 토큰 전송
  return this.buildSplTokenTransfer(
    request.from as Address,
    request.to as Address,
    request.amount,
    request.token as Address,  // (v0.6) tokenMint -> token
    blockhash,
    lastValidBlockHeight,
  )
}
// else: 네이티브 SOL 전송 (섹션 5.1)
```

---

## 6. simulateTransaction -- 트랜잭션 시뮬레이션

```typescript
async simulateTransaction(tx: UnsignedTransaction): Promise<SimulationResult> {
  this.ensureConnected()

  // 1. 트랜잭션 만료 확인
  if (tx.expiresAt && tx.expiresAt < new Date()) {
    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_EXPIRED,
      chain: 'solana',
      message: 'buildTransaction에서 생성된 트랜잭션이 만료되었습니다. 재빌드가 필요합니다.',
      details: { expiresAt: tx.expiresAt.toISOString() },
      retryable: true,  // 재빌드 후 재시도 가능
    })
  }

  try {
    // 2. 시뮬레이션 RPC 호출
    // simulateTransaction은 서명 없이도 실행 가능하다.
    // replaceRecentBlockhash: true로 설정하면 현재 blockhash로 교체하여 시뮬레이션한다.
    // 이는 빌드 시점의 blockhash가 만료되었더라도 시뮬레이션이 가능하게 해준다.
    //
    // @solana/kit에서는 base64 인코딩된 트랜잭션을 전달한다.
    const encodedTx = Buffer.from(tx.serialized).toString('base64')

    const result = await this.rpc!.simulateTransaction(
      encodedTx,
      {
        commitment: this.commitment,
        replaceRecentBlockhash: true,
        encoding: 'base64',
      },
    ).send()

    // 3. 결과 파싱
    const simResult = result.value

    // 3a. 시뮬레이션 성공
    if (!simResult.err) {
      return {
        success: true,
        logs: simResult.logs ?? [],
        unitsConsumed: simResult.unitsConsumed
          ? BigInt(simResult.unitsConsumed)
          : undefined,
        // error 없음
      }
    }

    // 3b. 시뮬레이션 실패 -- 에러 코드 추출
    const errorStr = JSON.stringify(simResult.err)
    const mappedError = this.mapSimulationError(simResult.err)

    return {
      success: false,
      logs: simResult.logs ?? [],
      unitsConsumed: simResult.unitsConsumed
        ? BigInt(simResult.unitsConsumed)
        : undefined,
      error: mappedError,
    }
  } catch (err) {
    // RPC 호출 자체의 실패 (네트워크 오류 등)
    throw new ChainError({
      code: ChainErrorCode.SIMULATION_FAILED,
      chain: 'solana',
      message: `시뮬레이션 RPC 호출 실패: ${(err as Error).message}`,
      retryable: true,
      cause: err as Error,
    })
  }
}
```

### 6.1 시뮬레이션 에러 매핑

```typescript
/**
 * Solana 시뮬레이션 에러를 사람이 읽을 수 있는 문자열로 매핑한다.
 */
private mapSimulationError(err: unknown): string {
  if (!err) return 'Unknown simulation error'

  // Solana 에러 형식: { InstructionError: [index, { Custom: code }] }
  // 또는 문자열: "AccountNotFound", "InsufficientFundsForFee" 등
  if (typeof err === 'string') {
    return this.mapSolanaErrorString(err)
  }

  if (typeof err === 'object' && err !== null) {
    const errObj = err as Record<string, unknown>

    // InstructionError 처리
    if ('InstructionError' in errObj) {
      const [index, detail] = errObj.InstructionError as [number, unknown]
      if (typeof detail === 'string') {
        return `Instruction ${index}: ${detail}`
      }
      if (typeof detail === 'object' && detail !== null) {
        const detailObj = detail as Record<string, unknown>
        if ('Custom' in detailObj) {
          return `Instruction ${index}: Custom error ${detailObj.Custom}`
        }
        return `Instruction ${index}: ${JSON.stringify(detail)}`
      }
    }

    // InsufficientFundsForFee 등 최상위 에러
    const errorKeys = Object.keys(errObj)
    if (errorKeys.length > 0) {
      return errorKeys[0]
    }
  }

  return JSON.stringify(err)
}

private mapSolanaErrorString(err: string): string {
  const errorDescriptions: Record<string, string> = {
    'AccountNotFound': '계정이 존재하지 않습니다',
    'InsufficientFundsForFee': '수수료를 지불할 잔액이 부족합니다',
    'InvalidAccountForFee': '수수료 지불에 사용할 수 없는 계정입니다',
    'AccountInUse': '계정이 다른 트랜잭션에서 사용 중입니다',
    'BlockhashNotFound': 'Blockhash가 만료되었습니다',
    'InsufficientFundsForRent': 'Rent-exempt 최소 잔액이 부족합니다',
  }

  return errorDescriptions[err] ?? err
}
```

### 6.2 시뮬레이션 결과 활용

| 필드 | 활용 | 활용 주체 |
|------|------|----------|
| `success` | false면 즉시 거부 (submitTransaction 호출 안 함) | transaction-service |
| `logs` | 프로그램 실행 로그 분석, 감사 로그 기록 | audit_log |
| `unitsConsumed` | 실제 CU * 1.2를 setComputeUnitLimit에 적용 (과대 추정 방지) | buildTransaction 재조정 |
| `error` | 에러 메시지를 사용자에게 반환 | API 응답 |

**Compute Unit 최적화 패턴:**

```
1차 빌드: setComputeUnitLimit(300)  -- 기본 안전값
    ↓
simulateTransaction → unitsConsumed = 200
    ↓
2차 빌드 (선택적): setComputeUnitLimit(200 * 1.2 = 240)  -- 정밀 설정
```

이 2차 빌드는 INSTANT 티어에서만 수행한다. DELAY/APPROVAL 티어에서는 정책 승인 후 새 blockhash로 재빌드하므로 2차 빌드에서 적용한다.

---

## 7. signTransaction -- 로컬 서명

```typescript
import { createKeyPairFromBytes, createSignerFromKeyPair } from '@solana/kit'

async signTransaction(
  tx: UnsignedTransaction,
  privateKey: Uint8Array,
): Promise<Uint8Array> {

  // 1. 트랜잭션 만료 확인
  if (tx.expiresAt && tx.expiresAt < new Date()) {
    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_EXPIRED,
      chain: 'solana',
      message: '서명 시점에 트랜잭션이 이미 만료되었습니다. buildTransaction부터 재실행하세요.',
      details: { expiresAt: tx.expiresAt.toISOString() },
      retryable: true,
    })
  }

  // 2. 키 길이 검증
  // CORE-03: Solana 개인키는 64바이트 (seed 32B + pubkey 32B)
  if (privateKey.length !== 64) {
    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_FAILED,
      chain: 'solana',
      message: `Solana 키 길이 불일치: ${privateKey.length}바이트 (64바이트 필요)`,
      details: { expectedLength: 64, actualLength: privateKey.length },
      retryable: false,
    })
  }

  try {
    // 3. @solana/kit CryptoKeyPair 생성
    // createKeyPairFromBytes는 64바이트 Ed25519 키페어를 받아
    // Web Crypto API의 CryptoKeyPair를 반환한다.
    //
    // privateKey는 CORE-03 키스토어에서 복호화된 sodium guarded memory의
    // Uint8Array이다. 서명 후 호출자(session-service)가 sodium_memzero()를
    // 수행하므로, 이 메서드에서는 키 정리를 하지 않는다.
    const keyPair = await createKeyPairFromBytes(privateKey)

    // 4. Signer 생성
    // @solana/kit의 signTransactionMessageWithSigners는 Signer 인터페이스를
    // 요구한다. createSignerFromKeyPair로 CryptoKeyPair를 Signer로 변환한다.
    const signer = await createSignerFromKeyPair(keyPair)

    // 5. 트랜잭션 메시지에 서명
    // tx.serialized는 compileTransactionMessage의 결과이다.
    // 서명 과정:
    //   a. 직렬화된 메시지를 Ed25519로 서명
    //   b. 서명(64바이트)을 트랜잭션 앞에 첨부
    //   c. 완전한 서명된 트랜잭션 바이트를 반환

    // 메시지 바이트에 직접 서명
    const signature = await crypto.subtle.sign(
      'Ed25519',
      keyPair.privateKey,
      tx.serialized,
    )

    // 6. 서명된 트랜잭션 조립
    // Solana 트랜잭션 와이어 포맷:
    //   [compact-u16 서명 수] [서명 64바이트 * N] [메시지 바이트]
    const signatureBytes = new Uint8Array(signature)
    const sigCount = new Uint8Array([1])  // 서명 1개 (compact-u16)

    const signedTx = new Uint8Array(
      sigCount.length + signatureBytes.length + tx.serialized.length
    )
    signedTx.set(sigCount, 0)
    signedTx.set(signatureBytes, sigCount.length)
    signedTx.set(tx.serialized, sigCount.length + signatureBytes.length)

    return signedTx
  } catch (err) {
    if (err instanceof ChainError) throw err

    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_FAILED,
      chain: 'solana',
      message: `트랜잭션 서명 실패: ${(err as Error).message}`,
      retryable: false,
      cause: err as Error,
    })
  }
}
```

### 7.1 키 수명주기 (signTransaction 관점)

```
┌───────────────────────────────────────────────────────────────┐
│  호출자: transaction-service (Session 5c 단계)                 │
│                                                               │
│  1. keyStore.getKey(agentId, masterPassword)                  │
│     └─> CORE-03 키스토어에서 AES-256-GCM 복호화                │
│     └─> sodium_malloc 할당된 Uint8Array (64바이트)             │
│                                                               │
│  2. adapter.signTransaction(unsignedTx, privateKey)           │
│     └─> Ed25519 서명 수행 (이 메서드)                          │
│     └─> 서명된 트랜잭션 Uint8Array 반환                        │
│                                                               │
│  3. sodium_memzero(privateKey)                                │
│     └─> 호출자가 키 메모리 안전하게 소거                        │
│     └─> GC가 복사본을 만들지 않도록 Buffer 대신 Uint8Array 사용 │
└───────────────────────────────────────────────────────────────┘
```

**핵심 원칙:**
- `signTransaction`은 키 관리에 **관여하지 않는다** -- 수신한 Uint8Array로 서명만 수행
- 키 복호화/소거는 **호출자(transaction-service)**의 책임
- `privateKey` 파라미터는 Uint8Array (Node.js Buffer가 아님) -- sodium guarded memory 호환 (CORE-03)
- 서명 작업은 Web Crypto API (`crypto.subtle.sign`)를 사용하여 네이티브 성능을 확보

### 7.2 서명 실패 시나리오

| 시나리오 | 원인 | 에러 코드 | 복구 방법 |
|---------|------|----------|----------|
| 키 길이 불일치 | 64바이트가 아닌 키 전달 | `TRANSACTION_FAILED` | 키스토어 확인 |
| 만료된 blockhash | 빌드 후 ~60초 초과 | `TRANSACTION_EXPIRED` | `buildTransaction` 재실행 |
| 잘못된 키 포맷 | Ed25519가 아닌 키 전달 | `TRANSACTION_FAILED` | 키스토어 무결성 확인 |
| Web Crypto 미지원 | 비표준 런타임 환경 | `TRANSACTION_FAILED` | Node.js 22+ 확인 |
| **[v0.7] Blockhash stale** | 잔여 수명 < 20초 | `SOLANA_BLOCKHASH_STALE` | `refreshBlockhash()` 호출 후 재서명 |

### 7.3 [v0.7 보완] Blockhash Freshness Guard -- checkBlockhashFreshness

> **[v0.7 보완]** signTransaction() 직전에 blockhash 잔여 수명을 `getBlockHeight()` 기반으로 정밀 검증한다. 기존 `expiresAt` Date 비교(1차 검증)는 wall-clock 기반이라 슬롯 속도 변동(400~600ms)에 취약하다. 2차 검증으로 실제 block height를 조회하여 정밀한 잔여 수명을 계산한다.

```typescript
/**
 * [v0.7 보완] Blockhash 잔여 수명을 block height 기반으로 검증한다.
 *
 * signTransaction() 내부에서 1차 expiresAt 검증 통과 후 호출된다.
 * getBlockHeight()로 현재 블록 높이를 조회하고, lastValidBlockHeight와 비교하여
 * 잔여 수명이 FRESHNESS_THRESHOLD_SECONDS 미만이면 BLOCKHASH_STALE 에러를 던진다.
 *
 * 주의: getSlot()이 아닌 getBlockHeight()를 사용한다.
 * slot과 block height는 다르며, skipped 슬롯이 있으면 slot > blockHeight이 된다.
 * lastValidBlockHeight는 block height 기준이므로 반드시 getBlockHeight()로 비교해야 한다.
 *
 * @param lastValidBlockHeight - buildTransaction()에서 저장한 blockhash 유효 블록 높이
 * @param thresholdSeconds - 잔여 수명 임계값 (기본: FRESHNESS_THRESHOLD_SECONDS = 20초)
 * @throws ChainError code=SOLANA_BLOCKHASH_STALE -- 잔여 수명 부족 (refreshBlockhash 호출 권장)
 * @throws ChainError code=SOLANA_BLOCKHASH_EXPIRED -- 이미 만료 (buildTransaction 재실행 필요)
 */
private async checkBlockhashFreshness(
  lastValidBlockHeight: bigint,
  thresholdSeconds: number = this.FRESHNESS_THRESHOLD_SECONDS,
): Promise<void> {
  this.ensureConnected()

  // 1. 현재 블록 높이 조회
  // 주의: getBlockHeight()를 사용해야 한다 (getSlot() 아님)
  // skipped 슬롯이 있으면 slot > blockHeight이므로 잘못된 비교가 됨
  const currentBlockHeight = await this.rpc!.getBlockHeight({
    commitment: this.commitment,
  }).send()

  // 2. 잔여 블록 수 계산
  const remainingBlocks = lastValidBlockHeight - currentBlockHeight

  // 3. 이미 만료된 경우
  if (remainingBlocks <= 0n) {
    throw new ChainError({
      code: SolanaErrorCode.BLOCKHASH_EXPIRED,
      chain: 'solana',
      message: `Blockhash가 이미 만료되었습니다. currentBlockHeight(${currentBlockHeight}) >= lastValidBlockHeight(${lastValidBlockHeight}). buildTransaction()부터 재실행하세요.`,
      details: {
        currentBlockHeight: currentBlockHeight.toString(),
        lastValidBlockHeight: lastValidBlockHeight.toString(),
        remainingBlocks: '0',
      },
      retryable: true,
    })
  }

  // 4. 잔여 수명 계산 (슬롯당 ~400ms = 0.4초)
  const remainingSeconds = Number(remainingBlocks) * 0.4

  // 5. 임계값 미달 시 STALE 에러
  if (remainingSeconds < thresholdSeconds) {
    throw new ChainError({
      code: SolanaErrorCode.BLOCKHASH_STALE,
      chain: 'solana',
      message: `Blockhash 잔여 수명 부족: ${remainingSeconds.toFixed(1)}초 (임계값: ${thresholdSeconds}초). refreshBlockhash()를 호출하여 blockhash를 갱신하세요.`,
      details: {
        currentBlockHeight: currentBlockHeight.toString(),
        lastValidBlockHeight: lastValidBlockHeight.toString(),
        remainingBlocks: remainingBlocks.toString(),
        remainingSeconds: remainingSeconds.toFixed(1),
        thresholdSeconds,
      },
      retryable: true,
    })
  }

  // 6. 잔여 수명 충분 -- 서명 진행 가능
}
```

**signTransaction() 내 호출 위치:**

```typescript
// signTransaction() 내부 (v0.7 보완)
async signTransaction(tx: UnsignedTransaction, privateKey: Uint8Array): Promise<Uint8Array> {
  // 1차 검증: wall-clock 기반 (기존 유지 -- 빠른 실패)
  if (tx.expiresAt && tx.expiresAt < new Date()) {
    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_EXPIRED,
      chain: 'solana',
      message: '서명 시점에 트랜잭션이 이미 만료되었습니다.',
      retryable: true,
    })
  }

  // [v0.7 보완] 2차 검증: getBlockHeight() 기반 정밀 검증
  const lastValidBlockHeight = tx.metadata?.lastValidBlockHeight as bigint | undefined
  if (lastValidBlockHeight !== undefined) {
    await this.checkBlockhashFreshness(lastValidBlockHeight)
  }

  // ... 이하 기존 서명 로직 동일 ...
}
```

**BLOCKHASH_STALE vs BLOCKHASH_EXPIRED 복구 전략 차이:**

| 에러 코드 | 의미 | 복구 방법 | 비용 |
|-----------|------|----------|------|
| `SOLANA_BLOCKHASH_STALE` | 잔여 수명 부족, 아직 유효 | `refreshBlockhash()` -> re-sign -> submit | 낮음 (RPC 1회 + 재컴파일) |
| `SOLANA_BLOCKHASH_EXPIRED` | 이미 만료 | `buildTransaction()` 완전 재실행 | 높음 (수수료 재추정 포함) |

### 7.4 [v0.7 보완] refreshBlockhash -- Blockhash 갱신 유틸리티

> **[v0.7 보완]** BLOCKHASH_STALE 에러 발생 시 호출하는 유틸리티 메서드. 기존 트랜잭션의 instruction을 유지하면서 blockhash만 갱신한다. **Option A(메시지 객체 캐싱) 방식을 채택**하여, buildTransaction()에서 컴파일 전의 transactionMessage 객체를 `metadata._compiledMessage`에 보관하고 이를 재사용한다.

```typescript
/**
 * [v0.7 보완] UnsignedTransaction의 blockhash를 갱신한다.
 *
 * 기존 instruction은 변경하지 않고 blockhash만 교체하여 재컴파일한다.
 * Option A 채택: buildTransaction()에서 metadata._compiledMessage에 보관한
 * transactionMessage 객체를 재사용하여 새 blockhash를 적용한다.
 *
 * 사용 시나리오:
 * 1. signTransaction()에서 BLOCKHASH_STALE 에러 발생
 * 2. 호출자가 refreshBlockhash(tx)로 blockhash 갱신
 * 3. 갱신된 tx로 signTransaction() 재시도
 *
 * 주의사항:
 * - instruction은 변경하지 않음 (동일 전송/호출 유지)
 * - fee 변동이 큰 경우 buildTransaction() 완전 재실행 권장
 *   (priority fee가 30초 이상 지났으면 캐시가 만료되어 달라질 수 있음)
 * - metadata._compiledMessage가 없으면 에러 (buildTransaction() 미지원 버전)
 *
 * @param tx - blockhash를 갱신할 미서명 트랜잭션
 * @returns 새 blockhash가 적용된 미서명 트랜잭션 (새 객체)
 */
async refreshBlockhash(tx: UnsignedTransaction): Promise<UnsignedTransaction> {
  this.ensureConnected()

  // 1. metadata에서 캐싱된 transactionMessage 객체 조회
  const cachedMessage = tx.metadata?._compiledMessage
  if (!cachedMessage) {
    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_FAILED,
      chain: 'solana',
      message: 'refreshBlockhash 실패: metadata._compiledMessage가 없습니다. buildTransaction()을 재실행하세요.',
      retryable: true,
    })
  }

  // 2. blockhash 캐시 무효화 후 새 blockhash 조회
  this.blockhashCache = null  // 강제 무효화
  const { blockhash, lastValidBlockHeight } = await this.getRecentBlockhash()

  // 3. transactionMessage에 새 blockhash 적용
  const refreshedMessage = setTransactionMessageLifetimeUsingBlockhash(
    { blockhash, lastValidBlockHeight },
    cachedMessage,  // 기존 instruction이 보존된 메시지 객체
  )

  // 4. 재컴파일 + 직렬화
  const compiledMessage = compileTransactionMessage(refreshedMessage)
  const encoder = getCompiledTransactionMessageEncoder()
  const serialized = encoder.encode(compiledMessage)

  // 5. 새 expiresAt 계산
  const expiresAt = new Date(Date.now() + 50_000)  // 50초 (기존과 동일 안전 마진)

  // 6. 새 UnsignedTransaction 반환 (불변 -- 기존 tx를 수정하지 않음)
  return {
    ...tx,
    serialized,
    expiresAt,
    metadata: {
      ...tx.metadata,
      blockhash,
      lastValidBlockHeight,
      _compiledMessage: refreshedMessage,  // 갱신된 메시지 객체도 보관
    },
  }
}
```

**buildTransaction()에서 _compiledMessage 보관 (v0.7 보완):**

> buildTransaction() 섹션 5.1의 `return` 직전에 transactionMessage 객체를 metadata에 보관하도록 설계를 추가한다. 이는 refreshBlockhash()가 instruction을 재구성하지 않고 blockhash만 교체할 수 있게 하는 핵심이다.

```typescript
// buildTransaction() 내부 (v0.7 보완 추가 부분)
// 기존 코드: const transactionMessage = pipe(...)

// [v0.7 보완] transactionMessage 객체를 metadata에 캐싱
// refreshBlockhash()에서 instruction을 유지하면서 blockhash만 교체할 때 사용
return {
  chain: 'solana',
  serialized,
  estimatedFee,
  expiresAt,
  metadata: {
    blockhash,
    lastValidBlockHeight,
    version: 0,
    from: request.from,
    to: request.to,
    amount: request.amount.toString(),
    type: 'SOL_TRANSFER',
    _compiledMessage: transactionMessage,  // [v0.7 보완] refreshBlockhash()용 메시지 캐싱
  },
}
```

**refreshBlockhash vs buildTransaction 재실행 선택 기준:**

| 상황 | 권장 방법 | 근거 |
|------|----------|------|
| STALE (잔여 20초 미만) | `refreshBlockhash()` | 빠름, instruction 유지, RPC 1회 |
| EXPIRED (이미 만료) | `buildTransaction()` 재실행 | 새 수수료 추정 필요 |
| fee 변동 감지 (30초+ 경과) | `buildTransaction()` 재실행 | priority fee 캐시 만료, 수수료 재추정 필요 |
| 동일 티어 재시도 (INSTANT) | `refreshBlockhash()` | 속도 우선 |
| DELAY/APPROVAL 승인 후 | `buildTransaction()` 재실행 | 오래 대기하여 상태 변경 가능 |

---

## 8. submitTransaction -- 트랜잭션 제출

```typescript
async submitTransaction(signedTx: Uint8Array): Promise<SubmitResult> {
  this.ensureConnected()

  try {
    // 1. 서명된 트랜잭션을 base64로 인코딩
    const encodedTx = Buffer.from(signedTx).toString('base64')

    // 2. sendTransaction RPC 호출
    // skipPreflight: false (기본) -- preflight 시뮬레이션으로 이중 안전
    // 이미 simulateTransaction을 통과했더라도, 제출 시점에 상태가 변경되었을 수 있음
    //
    // skipPreflight 전략:
    // - false (기본): 제출 전 preflight 시뮬레이션 재실행. 안전하지만 ~200ms 추가
    // - true: 이미 시뮬레이션 완료된 경우. blockhash 만료가 임박할 때 사용
    const txSignature = await this.rpc!.sendTransaction(
      encodedTx,
      {
        encoding: 'base64',
        skipPreflight: false,
        preflightCommitment: this.commitment,
        maxRetries: 3,  // RPC 노드 레벨 재시도
      },
    ).send()

    // 3. 결과 반환
    return {
      txHash: txSignature,
      status: 'submitted',
      confirmations: undefined,
      blockNumber: undefined,
      fee: undefined,
    }
  } catch (err) {
    // 4. 에러 처리
    const errorMessage = (err as Error).message ?? String(err)

    // 4a. 이미 처리된 트랜잭션 (중복 제출)
    if (errorMessage.includes('AlreadyProcessed') ||
        errorMessage.includes('already been processed')) {
      // 중복 제출은 에러가 아닐 수 있음 -- 이미 성공한 트랜잭션
      // 서명(txHash)을 추출하여 상태 확인 가능하도록 반환
      throw new ChainError({
        code: ChainErrorCode.TRANSACTION_FAILED,
        chain: 'solana',
        message: '트랜잭션이 이미 처리되었습니다 (중복 제출)',
        details: { reason: 'AlreadyProcessed' },
        retryable: false,
      })
    }

    // 4b. Blockhash 만료
    if (errorMessage.includes('BlockhashNotFound') ||
        errorMessage.includes('blockhash not found')) {
      throw new ChainError({
        code: SolanaErrorCode.BLOCKHASH_EXPIRED,
        chain: 'solana',
        message: 'Blockhash가 만료되었습니다. buildTransaction부터 재실행하세요.',
        retryable: true,
      })
    }

    // 4c. Preflight 시뮬레이션 실패
    if (errorMessage.includes('Transaction simulation failed')) {
      throw new ChainError({
        code: ChainErrorCode.TRANSACTION_FAILED,
        chain: 'solana',
        message: `Preflight 시뮬레이션 실패: ${errorMessage}`,
        details: { preflightError: errorMessage },
        retryable: false,
      })
    }

    // 4d. 기타 에러
    throw new ChainError({
      code: ChainErrorCode.RPC_ERROR,
      chain: 'solana',
      message: `트랜잭션 제출 실패: ${errorMessage}`,
      retryable: true,
      cause: err as Error,
    })
  }
}
```

### 8.1 skipPreflight 전략

| 상황 | skipPreflight | 근거 |
|------|---------------|------|
| 일반 전송 (INSTANT 티어) | `false` | 이중 안전. ~200ms 추가 허용 가능 |
| Blockhash 만료 임박 (재빌드 후 즉시 제출) | `true` | 시뮬레이션 이미 통과. 시간 절약 |
| 높은 우선순위 거래 | `true` | 속도 우선. 시뮬레이션은 이전 단계에서 완료 |
| 디버그/개발 환경 | `false` | 항상 이중 검증 |

**v0.2 기본값:** `skipPreflight: false` (안전 우선). 향후 config.toml `[adapters.solana]` 섹션에서 설정 가능하도록 확장 예정.

### 8.2 [v0.7 보완] 제출 실패 시 1.5배 Fee Bump 1회 재시도 전략

```
submitTransaction() 실패
    |
    v
[실패 원인 분류]
    |
    +-- BlockhashNotFound -> blockhash 만료 -> buildTransaction() 재실행 (기존 전략)
    |
    +-- InsufficientFeeForTransaction / 우선순위 부족 ->
    |       |
    |       v
    |   [Fee Bump 재시도 (v0.7 추가)]
    |   1. 현재 priority fee * 1.5 (50% 인상)
    |   2. 새 buildTransaction() (새 blockhash + bumped fee)
    |   3. simulateTransaction() -> signTransaction() -> submitTransaction()
    |   4. 재시도 횟수: 최대 1회 (무한 재시도 방지)
    |   5. bump 후에도 실패 시 -> TRANSACTION_FAILED 반환
    |
    +-- 기타 에러 -> 기존 에러 처리 유지
```

**설계 제약:**

| 제약 | 값 | 근거 |
|------|-----|------|
| 최대 재시도 횟수 | 1회 | fee escalation 무한 루프 방지 |
| bump 계수 | 1.5배 고정 | 업계 관행 (50~100% 인상이 일반적), 설정 가능하게 하지 않음 -- 단순성 우선 |
| 새 blockhash 필수 | yes | 기존 blockhash 만료 위험 방지 |
| 감사 기록 | audit_log에 기록 | fee_bump_attempted, original_fee, bumped_fee 필드 |

**fee bump 실패 감지 조건에 대한 현실적 주의사항:**
- Solana RPC는 "priority fee 부족"을 명시적 에러로 반환하지 않는 경우가 있음
- waitForConfirmation 타임아웃 + 네트워크 혼잡 감지(최근 fee 중간값 급등) 시에도 fee bump 적용 가능
- 구현 시 구체적인 감지 조건은 RPC 에러 코드 매핑에서 확정 (섹션 10.1 SOLANA_INSUFFICIENT_FEE 참조)

```typescript
/**
 * [v0.7 보완] Fee bump 재시도를 수행한다.
 * submitTransaction() 실패 시 priority fee를 1.5배 인상하여 1회 재시도.
 *
 * @param originalRequest - 원래 트랜잭션 빌드 요청
 * @param originalFee - 원래 priority fee (microLamports)
 * @param privateKey - 서명에 사용할 개인키
 * @returns SubmitResult (재시도 성공 시) 또는 ChainError (재시도 실패 시)
 */
private async retryWithFeeBump(
  originalRequest: TransferRequest,
  originalFee: bigint,
  privateKey: Uint8Array,
): Promise<SubmitResult> {
  const bumpedFee = BigInt(Math.ceil(Number(originalFee) * 1.5))

  // audit log 기록
  this.auditLog({
    event: 'fee_bump_attempted',
    original_fee: originalFee.toString(),
    bumped_fee: bumpedFee.toString(),
  })

  // 새 blockhash + bumped fee로 트랜잭션 재빌드
  const newTx = await this.buildTransaction({
    ...originalRequest,
    priorityFee: bumpedFee,
  })

  // simulate -> sign -> submit
  const simResult = await this.simulateTransaction(newTx)
  if (!simResult.success) {
    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_FAILED,
      chain: 'solana',
      message: `Fee bump 후 시뮬레이션 실패: ${simResult.error}`,
      retryable: false,
    })
  }

  const signedTx = await this.signTransaction(newTx, privateKey)
  return this.submitTransaction(signedTx)
}
```

---

## 9. waitForConfirmation -- 확인 대기

```typescript
async waitForConfirmation(
  txHash: string,
  timeout: number = 60_000,
): Promise<SubmitResult> {
  this.ensureConnected()

  const startTime = Date.now()
  const pollInterval = 2_000  // 2초 간격 폴링

  // 최대 대기 시간: 60초 (기본, blockhash 수명과 동일)
  // commitment 수준에 따른 예상 확인 시간:
  // - confirmed: ~6.4초 (슈퍼마조리티 투표)
  // - finalized: ~12.8초 (31+ 확인 블록)

  while (Date.now() - startTime < timeout) {
    try {
      const result = await this.getTransactionStatus(txHash)

      // confirmed 또는 finalized 상태에 도달하면 반환
      if (result.status === 'confirmed' || result.status === 'finalized') {
        return {
          ...result,
          fee: await this.getTransactionFee(txHash),  // 확인 후 실제 수수료 조회
        }
      }
    } catch (err) {
      // TRANSACTION_FAILED는 즉시 전파 (재시도 의미 없음)
      if (err instanceof ChainError && err.code === ChainErrorCode.TRANSACTION_FAILED) {
        throw err
      }
      // RPC_ERROR 등은 무시하고 다음 폴링에서 재시도
    }

    // lastValidBlockHeight 활용: 현재 블록 높이가 초과하면 즉시 만료 판정
    const metadata = await this.checkBlockHeightExpiry(txHash)
    if (metadata?.expired) {
      throw new ChainError({
        code: SolanaErrorCode.BLOCKHASH_EXPIRED,
        chain: 'solana',
        message: '트랜잭션 blockhash가 만료되었습니다. 블록에 포함되지 않았습니다.',
        details: {
          txHash,
          lastValidBlockHeight: metadata.lastValidBlockHeight?.toString(),
          currentBlockHeight: metadata.currentBlockHeight?.toString(),
        },
        retryable: true,  // 새 트랜잭션으로 재시도 가능
      })
    }

    // 폴링 대기
    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }

  // 타임아웃: 최대 대기 시간 초과
  // 에러가 아닌 마지막 상태를 반환 (CORE-04 명세)
  return {
    txHash,
    status: 'submitted',  // 아직 확인되지 않음
    confirmations: undefined,
    blockNumber: undefined,
    fee: undefined,
  }
}
```

### 9.1 블록 높이 만료 확인

```typescript
/**
 * 트랜잭션의 lastValidBlockHeight와 현재 블록 높이를 비교하여 만료 여부를 판정한다.
 *
 * Solana는 blockhash 수명을 ~150 슬롯(~60초)로 제한한다.
 * lastValidBlockHeight를 초과하면 해당 blockhash를 사용한 트랜잭션은
 * 더 이상 블록에 포함될 수 없다.
 */
private async checkBlockHeightExpiry(txHash: string): Promise<{
  expired: boolean
  lastValidBlockHeight?: bigint
  currentBlockHeight?: bigint
} | null> {
  try {
    // 현재 블록 높이 조회
    const currentBlockHeight = await this.rpc!.getBlockHeight({
      commitment: this.commitment,
    }).send()

    // 주의: lastValidBlockHeight는 buildTransaction에서 UnsignedTransaction.metadata에
    // 저장되어 있다. 하지만 waitForConfirmation은 txHash만 받으므로,
    // 트랜잭션 수명주기 관리는 transaction-service가 UnsignedTransaction.metadata를
    // 보존하고, 필요 시 이 정보를 전달해야 한다.
    //
    // v0.2에서는 타임아웃(60초) 기반으로 1차 판정하고,
    // blockHeight 비교는 transaction-service에서 metadata.lastValidBlockHeight로 수행한다.

    return null  // blockHeight 비교는 호출자에게 위임
  } catch {
    return null  // 조회 실패 시 타임아웃에 위임
  }
}
```

### 9.2 트랜잭션 수수료 조회

```typescript
/**
 * 확인된 트랜잭션의 실제 수수료를 조회한다.
 */
private async getTransactionFee(txHash: string): Promise<bigint | undefined> {
  try {
    const tx = await this.rpc!.getTransaction(
      txHash as Parameters<typeof this.rpc!.getTransaction>[0],
      {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      },
    ).send()

    if (tx?.meta?.fee) {
      return BigInt(tx.meta.fee)
    }
    return undefined
  } catch {
    return undefined  // 수수료 조회 실패는 무시 (핵심 동작이 아님)
  }
}
```

### 9.3 확인 대기 전략 요약

| 설정 | 값 | 근거 |
|------|-----|------|
| 폴링 간격 | 2초 | Solana 슬롯 시간(~400ms)보다 느리지만, RPC rate limit 고려 |
| 기본 타임아웃 | 60초 | blockhash 수명과 동일 |
| 기본 commitment | `confirmed` (~6.4초) | 빠른 응답. 대부분의 거래에 적합 |
| `finalized` 사용 | 선택적 | 대액 거래에서 호출자가 timeout을 길게 설정하고 finalized 대기 |
| WebSocket 구독 | v0.2 미사용 | 폴링이 더 단순하고 안정적. WebSocket은 v0.3에서 고려 |

**확인 수준별 예상 시간:**

| Commitment | 예상 시간 | 안전도 | 사용 시나리오 |
|-----------|----------|--------|-------------|
| `processed` | ~400ms | 낮음 (되돌림 가능) | 조회/잔액 확인 |
| `confirmed` | ~6.4초 | 높음 (슈퍼마조리티 투표) | 일반 전송 (기본) |
| `finalized` | ~12.8초 | 최고 (31+ 블록 확인) | 대액 거래 |

---

## 10. Solana-specific 에러 매핑

### 10.1 Solana RPC 에러 -> WAIaaS ChainError 매핑

| Solana 에러 | WAIaaS 에러 코드 | HTTP 상태 | 재시도 | 설명 |
|------------|-----------------|----------|--------|------|
| `InsufficientFundsForFee` | `INSUFFICIENT_BALANCE` | 400 | 조건부 | 수수료 지불 잔액 부족 |
| `InsufficientFunds` | `INSUFFICIENT_BALANCE` | 400 | 조건부 | 전송 금액 잔액 부족 |
| `AccountNotFound` | `INVALID_ADDRESS` | 404 | X | 계정 미존재 (온체인) |
| `InvalidAccountForFee` | `TRANSACTION_FAILED` | 400 | X | 수수료 계정 유효하지 않음 |
| `BlockhashNotFound` | `SOLANA_BLOCKHASH_EXPIRED` | 408 | O | blockhash 만료 (~60초 초과). 복구: buildTransaction() 재실행 |
| **[v0.7] Freshness guard** | `SOLANA_BLOCKHASH_STALE` | 408 | O | **[v0.7 보완]** blockhash 잔여 수명 부족 (< 20초). 복구: refreshBlockhash() 호출 |
| **[v0.7] Fee 부족** | `SOLANA_INSUFFICIENT_FEE` | 400 | O | **[v0.7 보완]** Priority fee 부족으로 제출 실패. fee bump 재시도 대상 (섹션 8.2). 복구: retryWithFeeBump() 호출 |
| `TransactionError` | `TRANSACTION_FAILED` | 500 | X | 온체인 실행 실패 |
| `AccountInUse` | `TRANSACTION_FAILED` | 409 | O | 계정 잠금 (동시 트랜잭션) |
| RPC timeout | `RPC_ERROR` | 503 | O | RPC 응답 없음 (네트워크 또는 rate limit) |
| `NodeUnhealthy` | `RPC_ERROR` | 503 | O | RPC 노드 비정상 상태 |
| `TransactionPrecompileVerificationFailure` | `TRANSACTION_FAILED` | 400 | X | 서명 검증 실패 |
| `InsufficientFundsForRent` | `INSUFFICIENT_BALANCE` | 400 | 조건부 | Rent-exempt 최소 잔액 부족 |

### 10.2 에러 매핑 구현

```typescript
/**
 * Solana RPC 에러를 WAIaaS ChainError로 변환한다.
 *
 * @param err - Solana RPC에서 발생한 원본 에러
 * @param context - 에러 발생 맥락 (메서드 이름 등)
 * @returns ChainError 인스턴스
 */
private mapRpcError(err: unknown, context: string): ChainError {
  const message = err instanceof Error ? err.message : String(err)

  // 잔액 부족 에러
  if (message.includes('InsufficientFunds') ||
      message.includes('insufficient lamports')) {
    return new ChainError({
      code: ChainErrorCode.INSUFFICIENT_BALANCE,
      chain: 'solana',
      message: `잔액 부족: ${message}`,
      details: { context, originalError: message },
      retryable: false,  // 잔액 충전 전까지 재시도 무의미
    })
  }

  // Blockhash 만료
  if (message.includes('BlockhashNotFound') ||
      message.includes('blockhash not found') ||
      message.includes('block height exceeded')) {
    return new ChainError({
      code: SolanaErrorCode.BLOCKHASH_EXPIRED,
      chain: 'solana',
      message: `Blockhash 만료: ${message}`,
      details: { context },
      retryable: true,
    })
  }

  // 계정 미존재
  if (message.includes('AccountNotFound') ||
      message.includes('account not found')) {
    return new ChainError({
      code: ChainErrorCode.INVALID_ADDRESS,
      chain: 'solana',
      message: `계정 미존재: ${message}`,
      details: { context },
      retryable: false,
    })
  }

  // [v0.7 보완] Priority fee 부족 (fee bump 재시도 대상)
  if (message.includes('InsufficientFeeForTransaction') ||
      message.includes('insufficient priority fee') ||
      message.includes('fee too low')) {
    return new ChainError({
      code: SolanaErrorCode.INSUFFICIENT_FEE,
      chain: 'solana',
      message: `Priority fee 부족: ${message}`,
      details: { context, originalError: message },
      retryable: true,  // fee bump 재시도 가능 (섹션 8.2)
    })
  }

  // 프로그램 에러
  if (message.includes('Program failed') ||
      message.includes('InstructionError') ||
      message.includes('custom program error')) {
    return new ChainError({
      code: SolanaErrorCode.PROGRAM_ERROR,
      chain: 'solana',
      message: `프로그램 실행 에러: ${message}`,
      details: { context, originalError: message },
      retryable: false,
    })
  }

  // 기본: RPC 에러 (일시적 장애 가능)
  return new ChainError({
    code: ChainErrorCode.RPC_ERROR,
    chain: 'solana',
    message: `Solana RPC 에러 (${context}): ${message}`,
    details: { context },
    retryable: true,
    cause: err instanceof Error ? err : undefined,
  })
}
```

### 10.3 재시도 가능 vs 재시도 불가 분류

| 분류 | 에러 코드 | 동작 |
|------|----------|------|
| **재시도 가능 (retryable: true)** | `RPC_ERROR`, `NETWORK_ERROR`, `SOLANA_BLOCKHASH_EXPIRED`, `SOLANA_BLOCKHASH_STALE` **(v0.7 추가)**, `SOLANA_INSUFFICIENT_FEE` **(v0.7 추가)**, `SIMULATION_FAILED` | transaction-service가 자동 재시도 또는 재빌드. STALE: refreshBlockhash() -> re-sign, EXPIRED: buildTransaction() 재실행, INSUFFICIENT_FEE: retryWithFeeBump() (섹션 8.2) |
| **재시도 불가 (retryable: false)** | `INSUFFICIENT_BALANCE`, `INVALID_ADDRESS`, `SOLANA_PROGRAM_ERROR`, `TRANSACTION_FAILED` | 사용자에게 에러 반환. 입력 수정 필요 |
| **조건부 재시도** | `INSUFFICIENT_BALANCE` (잔액 충전 후), `TRANSACTION_FAILED` (원인에 따라) | 상황에 따라 판단 |

### 10.4 에러 전파 경로

```
SolanaAdapter                   transaction-service            API 응답
─────────────                   ──────────────────            ────────
ChainError {                    catch (err) {
  code: SOLANA_BLOCKHASH_       if (err.retryable) {
    EXPIRED                       // 자동 재빌드
  chain: 'solana'                 // (최대 2회)
  retryable: true               } else {
}                                 // transactions UPDATE
                                  // status=FAILED
                                }                              {
                                                                 code: "CHAIN_ERROR",
                                                                 message: "...",
                                                                 details: { ... },
                                                                 retryable: true
                                                               }
```

---

## 11. 성능 및 제약사항

### 11.1 RPC Rate Limit 대응

| RPC 공급자 | Rate Limit | 대응 전략 |
|-----------|-----------|----------|
| Solana 공용 RPC (api.mainnet-beta.solana.com) | ~40 req/s | 개발/테스트용으로만 사용. 프로덕션에서는 전용 RPC 권장 |
| Helius | 50-500 req/s (플랜별) | `config.toml [rpc.solana].mainnet`에 Helius URL 설정 |
| QuickNode | 25-500 req/s (플랜별) | `config.toml [rpc.solana].mainnet`에 QuickNode URL 설정 |
| Alchemy | 330 req/s (Growth) | `config.toml [rpc.solana].mainnet`에 Alchemy URL 설정 |

**WAIaaS 내부 rate limit 대응:**
- 공용 RPC 사용 시 SolanaAdapter 내부에서 추가 throttle은 하지 않는다
- WAIaaS API 레벨의 Rate Limiter(CORE-06: 전역 100/세션 300/거래 10 req/min)가 간접적으로 RPC 호출을 제한한다
- RPC rate limit 에러(HTTP 429)가 발생하면 `RPC_ERROR` (retryable: true)로 매핑하여 호출자가 재시도를 결정한다

### 11.2 캐시 전략

| 캐시 대상 | TTL | 근거 | 무효화 조건 |
|----------|-----|------|------------|
| **blockhash** | 5초 | 동일 슬롯 내 여러 트랜잭션이 같은 blockhash를 사용 가능. 슬롯 시간 ~400ms이므로 5초 캐시는 ~12 슬롯을 커버 | TTL 만료 시 자동 무효화 |
| **priority fee** | 30초 | **(v0.7 보완)** Nyquist 기준. 아래 상세 참조 | TTL 만료 시 자동 무효화 |
| **잔액** | 캐시 없음 | 잔액은 매 요청마다 실시간 조회. 캐시 시 잔액 부족 감지 실패 위험 | - |
| **ATA 존재 여부** | 캐시 없음 | ATA 생성/삭제 빈도가 낮지만, 캐시 시 불필요한 ATA 생성 instruction 추가 위험 | - |

#### [v0.7 보완] Priority Fee TTL 30초의 Nyquist 기준 근거

Nyquist-Shannon 샘플링 정리: 대역 제한 신호를 왜곡 없이 복원하려면 최소 신호 주파수의 2배로 샘플링해야 한다 (f_s >= 2 * f_max).

**적용:**
- `getRecentPrioritizationFees`는 최근 150 슬롯(~ 60초)의 통계를 반환
- 이 60초 윈도우가 fee 변화의 "주기"에 해당
- Nyquist 최소 샘플링 주기 = 60초 / 2 = 30초
- TTL 30초 = Nyquist 최소 샘플링 주기

**비교 테이블:**

| TTL | Nyquist 판정 | 트레이드오프 |
|-----|-------------|------------|
| 15초 | 오버샘플링 (4x) | 불필요한 RPC 호출 증가 |
| **30초** | **적정 (2x, Nyquist 최소)** | **fee 변화 추적 + RPC 부담 균형** |
| 60초 | 언더샘플링 (1x) | fee 변화 절반 놓침 (앨리어싱) |

### 11.3 Blockhash 만료 대응 전략

07-RESEARCH.md Pitfall 3에서 식별된 blockhash 만료 문제의 SolanaAdapter 레벨 대응:

```
┌──────────────────────────────────────────────────────────────────┐
│  트랜잭션 파이프라인 + blockhash 수명 관리                         │
│                                                                  │
│  t=0s   buildTransaction()                                       │
│         └─ getLatestBlockhash → blockhash (수명 ~60초)            │
│         └─ expiresAt = now + 50초 (안전 마진 10초)                │
│         └─ [v0.7] metadata._compiledMessage에 메시지 객체 캐싱     │
│                                                                  │
│  t=1s   simulateTransaction()                                    │
│         └─ replaceRecentBlockhash: true (만료 무관)               │
│                                                                  │
│  t=2s   [정책 엔진] Session Validate + Policy Check              │
│                                                                  │
│  t=3s   [보안 티어 분류]                                          │
│         └─ INSTANT → 즉시 signTransaction() 진행                 │
│         └─ DELAY/APPROVAL → 승인 대기 (blockhash 만료됨)          │
│                ↓                                                  │
│           승인 후 buildTransaction() 재실행 (새 blockhash)         │
│                                                                  │
│  t=4s   signTransaction()                                        │
│         └─ 1차: expiresAt 확인 → 만료 시 TRANSACTION_EXPIRED 반환 │
│         └─ [v0.7] 2차: checkBlockhashFreshness() 호출            │
│             └─ getBlockHeight() 기반 잔여 수명 정밀 검증           │
│             └─ < 20초 → BLOCKHASH_STALE (refreshBlockhash 유도)  │
│             └─ <= 0 → BLOCKHASH_EXPIRED (buildTransaction 재실행) │
│                                                                  │
│  t=4.1s [v0.7] STALE 시 복구 플로우:                              │
│         └─ refreshBlockhash(tx) → 새 blockhash 적용              │
│         └─ signTransaction(refreshedTx, privateKey) → 재서명     │
│         └─ submitTransaction(signedTx) → 제출                    │
│                                                                  │
│  t=5s   submitTransaction()                                      │
│         └─ BlockhashNotFound → SOLANA_BLOCKHASH_EXPIRED 반환      │
│         └─ 호출자가 buildTransaction()부터 재실행                  │
│                                                                  │
│  t=60s  waitForConfirmation() 타임아웃                            │
│         └─ 최종 상태(submitted) 반환                               │
└──────────────────────────────────────────────────────────────────┘
```

**[v0.7 보완] STALE 시 복구 플로우 상세:**

```
signTransaction()
    |
    +-- 1차: expiresAt < now? → EXPIRED
    |
    +-- [v0.7] 2차: checkBlockhashFreshness(lastValidBlockHeight)
            |
            +-- remainingBlocks <= 0 → BLOCKHASH_EXPIRED
            |   └── buildTransaction() 완전 재실행
            |
            +-- remainingSeconds < 20 → BLOCKHASH_STALE
            |   └── refreshBlockhash(tx) → 새 UnsignedTransaction
            |   └── signTransaction(refreshedTx, key) → 재서명
            |   └── submitTransaction(signedTx) → 제출
            |
            +-- remainingSeconds >= 20 → 서명 진행
```

**핵심 원칙:**
1. `buildTransaction()`에서 `expiresAt = now + 50초` (10초 안전 마진)
2. `simulateTransaction()`은 `replaceRecentBlockhash: true`로 blockhash 만료 무시
3. `signTransaction()`과 `submitTransaction()`에서 만료 확인
4. **[v0.7 보완]** `signTransaction()` 직전 `getBlockHeight()` 기반 freshness guard 적용
5. **[v0.7 보완]** STALE 시 `refreshBlockhash()` -> re-sign -> submit으로 빠른 복구
6. DELAY/APPROVAL 티어에서는 승인 후 반드시 `buildTransaction()` 재실행
7. `waitForConfirmation()`의 기본 타임아웃 = 60초 (blockhash 수명)

### 11.4 Compute Unit 최적화

```
┌─────────────────────────────────────────────────────────────┐
│  Compute Unit 최적화 플로우                                  │
│                                                             │
│  1차 빌드:                                                   │
│     setComputeUnitLimit(300)  ← SOL 전송 기본 안전값         │
│     setComputeUnitPrice(medianPriorityFee)                  │
│              │                                               │
│              ▼                                               │
│  시뮬레이션:                                                  │
│     unitsConsumed = 200  ← 실제 측정값                       │
│              │                                               │
│              ▼                                               │
│  2차 빌드 (INSTANT 티어에서 선택적):                          │
│     setComputeUnitLimit(200 * 1.2 = 240)  ← 정밀 설정       │
│     setComputeUnitPrice(medianPriorityFee)                  │
│                                                             │
│  효과:                                                       │
│     - 과대 CU 설정 → 불필요한 priority fee 지불 방지          │
│     - 과소 CU 설정 → 1.2x 안전 마진으로 실패 방지             │
└─────────────────────────────────────────────────────────────┘
```

### 11.5 제약사항 요약 (v0.6 변경)

| 항목 | 제약 | 영향 | 해소 계획 |
|------|------|------|----------|
| ~~**네이티브 SOL만 지원**~~ | **(v0.6 해소)** SPL/Token-2022 정식 설계 | ~~토큰 전송 불가~~ 토큰 전송 가능 | 섹션 5.2 (v0.6 정식 설계) |
| **(v0.6) Token-2022 위험 확장 제한** | TransferFee, ConfidentialTransfer 등 거부 | 일부 Token-2022 토큰 전송 불가 | 추후 확장별 핸들러 구현 시 해소 |
| **단일 서명만 지원** | 멀티시그 미지원 | 복수 서명자 트랜잭션 불가 | 향후 검토 |
| **폴링 기반 확인** | WebSocket 미사용 | 확인 지연 (~2초 간격) | 향후 WebSocket 구독 검토 |
| **자동 재연결 미지원** | 수동 재연결 필요 | RPC 장애 시 운영자 개입 | 향후 자동 재연결 + 폴백 RPC |
| **Address Lookup Table 미지원** | ALT 없이 트랜잭션 구성 | 복잡한 트랜잭션에서 크기 제한 | 향후 검토 |
| **Versioned Transaction v0만** | Legacy 트랜잭션 미지원 | Legacy 프로그램 호환성 제한 | 대부분의 현대 프로그램은 v0 지원 |

### 11.6 @solana/kit 주요 import 경로

| 기능 | 패키지 | import |
|------|--------|--------|
| RPC 클라이언트 | `@solana/kit` | `createSolanaRpc`, `createSolanaRpcSubscriptions` |
| 트랜잭션 빌드 (pipe) | `@solana/kit` | `pipe`, `createTransactionMessage`, `setTransactionMessageFeePayer`, `setTransactionMessageLifetimeUsingBlockhash`, `appendTransactionMessageInstruction` |
| 트랜잭션 컴파일 | `@solana/kit` | `compileTransactionMessage`, `getCompiledTransactionMessageEncoder` |
| 서명 | `@solana/kit` | `createKeyPairFromBytes`, `createSignerFromKeyPair`, `signTransactionMessageWithSigners` |
| 주소 검증 | `@solana/addresses` | `isAddress` |
| SOL 전송 | `@solana-program/system` | `getTransferSolInstruction` |
| SPL 토큰 전송 | `@solana-program/token` | `getTransferCheckedInstruction` **(v0.6 변경)**, `createApproveCheckedInstruction` **(v0.6 추가)** |
| ATA 관리 | `@solana-program/associated-token-account` | `getCreateAssociatedTokenAccountInstruction`, `findAssociatedTokenPda` |
| Compute Budget | `@solana-program/compute-budget` | `getSetComputeUnitLimitInstruction`, `getSetComputeUnitPriceInstruction` |

---

## 12. v0.6 확장: buildApprove, buildBatch, Jupiter 참조 (v0.6 추가)

### 12.1 buildApprove() -- SPL delegate 설정 (v0.6 추가)

> **(v0.6 추가)** IChainAdapter.buildApprove()의 Solana 구현. `createApproveCheckedInstruction`으로 SPL 토큰 delegate를 설정한다. 소스: 59-approve-management-spec.md 섹션 6

```typescript
import { createApproveCheckedInstruction } from '@solana-program/token'

/**
 * SPL 토큰 approve 트랜잭션을 빌드한다.
 * 지정된 spender에게 amount만큼 위임(delegate)을 설정한다.
 *
 * Solana 특이사항:
 * - Solana SPL Token은 단일 delegate만 허용 (기존 delegate 자동 덮어쓰기)
 * - previousDelegate 정보를 감사 로그에 기록 (경고, 차단 아님)
 * - createApproveCheckedInstruction 사용 (decimals 온체인 검증)
 *
 * 소스: 59-approve-management-spec.md 섹션 6
 */
async buildApprove(request: {
  from: string
  token: string
  spender: string
  amount: bigint
}): Promise<UnsignedTransaction> {
  this.ensureConnected()

  const owner = request.from as Address
  const mint = request.token as Address
  const spender = request.spender as Address

  // 1. 발신자 ATA 조회 (approve 대상)
  const [sourceAta] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address,
  })

  // 2. (v0.6) 기존 delegate 확인 -> 감사 로그용 previousDelegate 기록
  // Solana 단일 delegate 경고: 자동 차단하지 않고 previousDelegate 정보 기록
  const accountInfo = await this.rpc!.getAccountInfo(sourceAta, {
    encoding: 'jsonParsed',
  }).send()
  const previousDelegate = accountInfo.value?.data?.parsed?.info?.delegate ?? null

  // 3. 토큰 decimals 조회
  const mintInfo = await this.rpc!.getAccountInfo(mint, {
    encoding: 'jsonParsed',
  }).send()
  const decimals = mintInfo.value?.data?.parsed?.info?.decimals ?? 0

  // 4. blockhash + 트랜잭션 빌드
  const { blockhash, lastValidBlockHeight } = await this.getRecentBlockhash()

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayer(owner, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash, lastValidBlockHeight }, tx,
    ),
    tx => appendTransactionMessageInstruction(
      createApproveCheckedInstruction({
        account: sourceAta,
        mint,
        delegate: spender,
        owner,
        amount: request.amount,
        decimals,
      }),
      tx,
    ),
  )

  const compiledMessage = compileTransactionMessage(transactionMessage)
  const encoder = getCompiledTransactionMessageEncoder()

  return {
    chain: 'solana',
    serialized: encoder.encode(compiledMessage),
    estimatedFee: BigInt(5000),
    expiresAt: new Date(Date.now() + 50_000),
    metadata: {
      blockhash,
      lastValidBlockHeight,
      version: 0,
      type: 'APPROVE',
      from: request.from,
      spender: request.spender,
      token: request.token,
      amount: request.amount.toString(),
      previousDelegate,  // (v0.6) 감사 로그용
    },
  }
}
```

### 12.2 buildBatch() -- 다중 instruction VersionedTransaction (v0.6 추가)

> **(v0.6 추가)** IChainAdapter.buildBatch()의 Solana 구현. 다중 instruction을 하나의 VersionedTransaction으로 묶는다. Solana 전용 (EVM은 BATCH_NOT_SUPPORTED 400). 소스: 60-batch-transaction-spec.md 섹션 4

```typescript
/**
 * 배치 트랜잭션을 빌드한다. Solana 전용.
 *
 * 제약사항:
 * - min 2 / max 20 instructions (ATA 생성도 카운트 포함)
 * - All-or-Nothing: 하나의 instruction이라도 실패하면 전체 롤백
 * - BatchRequest.chain === 'solana' 검증 (EVM: BATCH_NOT_SUPPORTED)
 *
 * 소스: 60-batch-transaction-spec.md 섹션 4
 */
async buildBatch(request: {
  from: string
  instructions: Array<{
    type: 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE'
    // type별 필드 (InstructionRequest discriminatedUnion)
    [key: string]: unknown
  }>
}): Promise<UnsignedTransaction> {
  this.ensureConnected()

  // 1. instruction 수 검증
  if (request.instructions.length < 2) {
    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_FAILED,
      chain: 'solana',
      message: '배치에는 최소 2개의 instruction이 필요합니다.',
      retryable: false,
    })
  }
  if (request.instructions.length > 20) {
    throw new ChainError({
      code: ChainErrorCode.TRANSACTION_FAILED,
      chain: 'solana',
      message: '배치 instruction은 최대 20개까지 허용됩니다 (ATA 생성 포함).',
      retryable: false,
    })
  }

  // 2. blockhash + 기본 트랜잭션 메시지 구성
  const { blockhash, lastValidBlockHeight } = await this.getRecentBlockhash()
  const from = request.from as Address

  let transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayer(from, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash, lastValidBlockHeight }, tx,
    ),
  )

  // 3. 각 instruction을 type별로 빌드하여 append
  // 개별 instruction의 빌드는 해당 메서드(buildTransfer, buildApprove 등) 내부 로직 재사용
  // 여기서는 instruction-level 빌드를 수행하고 메시지에 추가
  for (const instr of request.instructions) {
    const solanaInstruction = await this.resolveInstruction(from, instr)
    transactionMessage = appendTransactionMessageInstruction(
      solanaInstruction,
      transactionMessage,
    )
  }

  // 4. 컴파일 + 직렬화
  const compiledMessage = compileTransactionMessage(transactionMessage)
  const encoder = getCompiledTransactionMessageEncoder()

  return {
    chain: 'solana',
    serialized: encoder.encode(compiledMessage),
    estimatedFee: BigInt(5000),  // 배치도 서명 1개 = base fee 5000
    expiresAt: new Date(Date.now() + 50_000),
    metadata: {
      blockhash,
      lastValidBlockHeight,
      version: 0,
      type: 'BATCH',
      from: request.from,
      instructionCount: request.instructions.length,
      instructionTypes: request.instructions.map(i => i.type),
    },
  }
}
```

### 12.3 Token-2022 위험 확장 감지 (v0.6 추가)

> **(v0.6 추가)** Token-2022 토큰의 위험 확장을 감지하여 예측 불가능한 동작을 사전 차단. 소스: 56-token-transfer-extension-spec.md 섹션 5.3

```typescript
/**
 * Token-2022 민트의 위험 확장을 감지한다.
 * 위험 확장이 포함된 토큰은 전송/approve가 거부된다.
 *
 * 위험 확장 목록:
 * - TransferFee: 전송 시 수수료 자동 차감 (금액 예측 불가)
 * - ConfidentialTransfer: 영지식 전송 (검증 불가)
 * - TransferHook: 커스텀 프로그램 호출 (부작용 예측 불가)
 * - PermanentDelegate: 영구 delegate (자산 통제 위험)
 */
private async detectDangerousExtensions(mintAddress: Address): Promise<string[]> {
  const dangerous: string[] = []

  try {
    const mintInfo = await this.rpc!.getAccountInfo(mintAddress, {
      encoding: 'jsonParsed',
    }).send()

    const extensions = mintInfo.value?.data?.parsed?.info?.extensions ?? []

    const DANGEROUS_EXTENSIONS = [
      'transferFeeConfig',
      'confidentialTransferMint',
      'transferHook',
      'permanentDelegate',
    ]

    for (const ext of extensions) {
      if (DANGEROUS_EXTENSIONS.includes(ext.extension)) {
        dangerous.push(ext.extension)
      }
    }
  } catch {
    // 조회 실패 시 안전하게 위험으로 판단
    dangerous.push('UNKNOWN_EXTENSION_CHECK_FAILED')
  }

  return dangerous
}
```

### 12.4 Jupiter swap instruction 빌드 참조 (v0.6 추가)

> **(v0.6 추가)** Action Provider(62-action-provider-architecture.md)의 JupiterSwapActionProvider가 `/swap-instructions` API를 호출하여 받은 instruction을 SolanaAdapter에서 빌드한다. 소스: 63-jupiter-swap-action-provider.md 섹션 10

**Jupiter 연동 흐름:**

```
JupiterSwapActionProvider.resolve(params)
  |
  +-- 1. GET /quote (견적 조회, slippageBps, priceImpactPct 1% 상한)
  |
  +-- 2. POST /swap-instructions (instruction 분해)
  |       |
  |       +-- computeBudgetInstructions[]
  |       +-- setupInstructions[]
  |       +-- swapInstruction
  |       +-- cleanupInstruction? (optional)
  |
  +-- 3. ContractCallRequest 반환
  |       programId: Jupiter Aggregator v6
  |       data: swapInstruction.data
  |       accounts: swapInstruction.accounts
  |
  +-- 4. (Jito MEV 보호)
          tipInstruction: SystemProgram.transfer -> Jito tip account
          amount: 1000 lamports (기본), max 100000 lamports
```

**SolanaAdapter 관점:**
- JupiterSwapActionProvider는 `resolve()`에서 `ContractCallRequest`를 반환
- `buildContractCall()`이 이 요청을 처리 (programId + accounts + data)
- Jito MEV 보호 instruction은 배치의 마지막에 추가
- `/swap` 대신 `/swap-instructions` 사용: 직렬화 전체 트랜잭션이 아닌 instruction 분해를 받아 정책 엔진 개입 보장

**참조:** 63-jupiter-swap-action-provider.md 전체, 62-action-provider-architecture.md 섹션 5
