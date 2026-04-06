# Phase 26: 체인 어댑터 안정화 - Research

**Researched:** 2026-02-08
**Domain:** Solana blockhash lifecycle, EVM nonce management, AES-256-GCM cryptographic safety, Priority fee dynamics
**Confidence:** HIGH

## Summary

Phase 26은 기존 설계 문서(31-solana-adapter-detail.md, 27-chain-adapter-interface.md, 26-keystore-spec.md)를 직접 수정하여 체인 어댑터의 런타임 안정성 취약점을 설계 수준에서 해소하는 DESIGN-ONLY 마일스톤이다. 4개 요구사항(CHAIN-01~04)은 각각 Solana blockhash 경쟁 조건, EVM nonce 인터페이스 확장, AES-GCM nonce 충돌 수학 정정, Priority fee 재시도 전략을 다룬다.

연구 결과, 현재 설계에는 다음과 같은 구체적 gap이 존재한다: (1) signTransaction() 직전 blockhash 잔여 수명 검사가 expiresAt Date 비교만으로 이루어져 실제 block height 기반 검증이 누락, (2) EVM nonce가 UnsignedTransaction.metadata에 비구조적으로 포함되어 타입 안전성 부재, (3) 키스토어 nonce 충돌 확률이 부정확한 근사로 기술, (4) priority fee 30초 TTL의 이론적 근거와 제출 실패 시 fee bump 전략이 미정의.

**Primary recommendation:** 기존 설계 문서 3개를 [v0.7 보완] 태그로 직접 수정하며, 새 문서는 생성하지 않는다.

## Standard Stack

이 phase는 설계 문서 수정만 수행하므로 새로운 라이브러리 도입이 없다. 기존 설계에서 참조하는 스택을 확인한다.

### Core (기존 설계 참조)
| Library | Version | Purpose | 참조 문서 |
|---------|---------|---------|-----------|
| `@solana/kit` | latest (구 @solana/web3.js 2.x) | Solana RPC + 트랜잭션 빌드 | 31-solana-adapter-detail.md |
| `viem` | 2.x | EVM RPC + 트랜잭션 빌드 + nonce 관리 | 27-chain-adapter-interface.md |
| Node.js `crypto` | built-in | AES-256-GCM 암호화 | 26-keystore-spec.md |

### 연구 대상 API
| API / RPC 메서드 | 체인 | 용도 | 비고 |
|-----------------|------|------|------|
| `getLatestBlockhash` | Solana | blockhash + lastValidBlockHeight 조회 | 현재 설계에 반영됨 |
| `getBlockHeight` | Solana | 현재 블록 높이 조회 (freshness guard 핵심) | **현재 설계에 미반영 -- 추가 필요** |
| `getTransactionCount` | EVM | 온체인 nonce 조회 (pending blockTag) | 현재 설계에 반영됨 |
| `createNonceManager` | viem | 동시 트랜잭션 nonce 관리 | viem 내장 유틸리티, 인터페이스 참고용 |
| `getRecentPrioritizationFees` | Solana | 최근 150 슬롯 priority fee 통계 | 현재 설계에 반영됨 |

## Architecture Patterns

### Pattern 1: Solana Blockhash Freshness Guard
**What:** signTransaction() 직전에 blockhash 잔여 수명을 block height 기반으로 검증하여, 만료된 blockhash로 서명하는 경쟁 조건을 방지한다.
**Why needed:** 현재 설계는 `expiresAt` (Date 기반, now + 50초)로만 검증하는데, 이는 wall-clock 기반이라 슬롯 속도 변동(400~600ms)에 취약하다. Solana 공식 문서는 `getBlockHeight()`으로 실제 block height를 비교할 것을 권장한다.
**Confidence:** HIGH (Solana 공식 문서 + Helius 기술 블로그 근거)

```
[현재 설계 gap]
signTransaction() {
  if (tx.expiresAt < new Date()) throw EXPIRED  // wall-clock 기반
  // ... 서명 수행
}

[보완 후 설계]
signTransaction() {
  // 1차: wall-clock 기반 빠른 검증 (기존 유지)
  if (tx.expiresAt < new Date()) throw EXPIRED

  // 2차: block height 기반 정밀 검증 (v0.7 추가)
  const currentBlockHeight = await this.rpc.getBlockHeight({ commitment }).send()
  const remainingBlocks = metadata.lastValidBlockHeight - currentBlockHeight
  const remainingSeconds = Number(remainingBlocks) * 0.4  // 슬롯 당 ~400ms

  if (remainingSeconds < FRESHNESS_THRESHOLD_SECONDS) {
    // 잔여 수명 < 임계값이면 blockhash 갱신 후 재빌드 유도
    throw BLOCKHASH_STALE (retryable: true)
  }
  // ... 서명 수행
}
```

**Key parameter:** FRESHNESS_THRESHOLD_SECONDS = 20초. 근거:
- Solana blockhash 수명: 150 슬롯 x 400ms = ~60초
- sign + submit 소요 시간: ~2-5초
- 안전 마진: 15초 (네트워크 지연, RPC 레이턴시)
- 20초 = sign(~1초) + submit(~2초) + 대기(~2초) + 안전마진(~15초)

**refreshBlockhash() 메서드:** UnsignedTransaction에 추가할 유틸리티 메서드. 현재 blockhash를 새로 가져와 트랜잭션 메시지를 재구성한다. 파이프라인 Stage 5 (sign 직전)에서 호출.

### Pattern 2: EVM Nonce Interface Extension
**What:** IChainAdapter에 `getCurrentNonce(address)` / `resetNonceTracker(address?)` 2개 메서드를 추가하고, UnsignedTransaction에 `nonce?: number` 필드를 명시적 optional로 승격한다.
**Why needed:** 현재 nonce는 `metadata: Record<string, unknown>`에 비구조적으로 포함되어 타입 안전성이 없다. 27-chain-adapter-interface.md의 EVMAdapter 내부 `nonceTracker`는 private으로 외부 접근이 불가하여, 파이프라인이나 에러 복구 로직에서 nonce 상태를 조회/리셋할 수 없다.
**Confidence:** HIGH (기존 설계 gap 분석 + viem nonceManager 패턴 참조)

```typescript
// IChainAdapter 확장 (17 -> 19 메서드)
interface IChainAdapter {
  // ... 기존 17개 메서드 ...

  /**
   * [18] 주소의 현재 유효 nonce를 반환한다. (v0.7 추가)
   * EVM: max(onchainNonce, localTracker)
   * Solana: 해당 없음 (0n 반환, blockhash 기반)
   */
  getCurrentNonce(address: string): Promise<number>

  /**
   * [19] nonce 트래커를 리셋한다. (v0.7 추가)
   * 제출 실패 시 nonce 복구에 사용.
   * address 미지정 시 전체 리셋.
   * Solana: no-op
   */
  resetNonceTracker(address?: string): void
}

// UnsignedTransaction 확장
interface UnsignedTransaction {
  // ... 기존 필드 ...

  /**
   * EVM 트랜잭션 nonce. (v0.7 추가)
   * EVM 체인에서만 사용. Solana는 undefined.
   * metadata에서 승격된 명시적 필드.
   */
  nonce?: number
}
```

### Pattern 3: AES-256-GCM Nonce Collision -- Birthday Problem 정정
**What:** 현재 26-keystore-spec.md 섹션 3.3의 충돌 확률 기술이 부정확하다. 정확한 수학 공식으로 정정하고, WAIaaS 실사용 패턴 분석을 추가한다.
**Confidence:** HIGH (Birthday Problem은 잘 확립된 수학)

현재 설계 기술 (부정확):
```
96비트 랜덤 nonce의 충돌 확률 (Birthday Problem):
- 2^32 (약 40억) 회 암호화 시 충돌 확률 ≈ 2^-32
- WAIaaS 키스토어는 에이전트당 최대 수십 회 재암호화 (패스워드 변경)
- 실질적 충돌 위험: 무시 가능
```

정정 내용:
```
Birthday Problem 정확한 공식:

P(collision) ≈ 1 - e^(-n^2 / (2 * N))

여기서:
  n = 동일 키로 수행한 암호화 횟수
  N = nonce 공간 크기 = 2^96 ≈ 7.92 * 10^28

NIST SP 800-38D 권장: P(collision) < 2^-32 → n < 2^32 (약 43억 회)

WAIaaS 실사용 패턴 분석:
- 키당 암호화 횟수(n):
  - 키스토어 생성 시 1회
  - 패스워드 변경 시 1회 (기존 salt 폐기 + 새 salt 생성이므로 사실상 새 키)
  - 하지만 CSPRNG salt가 매번 변경되므로 파생 키(AES key) 자체가 매번 다름!
  - 따라서 동일 키(key)로의 암호화 횟수 = 사실상 1회

- 키스토어 전체 관점:
  - 동일 salt(= 동일 AES key)로 최대 1회 암호화
  - 재암호화 시 새 salt → 새 AES key → nonce 공간 완전 독립
  - Birthday Problem 적용 대상 자체가 아님

- 보수적 분석 (salt 재사용 가정 -- 실제로는 불가능한 시나리오):
  - 에이전트 100개, 각 100회 패스워드 변경 = n = 10,000
  - P ≈ 1 - e^(-10000^2 / (2 * 2^96))
  - P ≈ 1 - e^(-10^8 / 1.58*10^29)
  - P ≈ 6.3 * 10^-22
  - 실질적 충돌 확률: 0 (무시 가능)
```

### Pattern 4: Priority Fee TTL 근거 + Fee Bump 전략
**What:** priority fee 캐시 TTL 30초의 Nyquist 기준 근거를 명시하고, 제출 실패 시 1.5배 fee bump 1회 재시도 전략을 추가한다.
**Confidence:** HIGH (Nyquist 정리 적용은 직관적, fee bump은 업계 표준)

```
Nyquist 기준 근거:

신호 처리의 Nyquist-Shannon 정리:
  "대역 제한 신호를 왜곡 없이 복원하려면 최소 2배 주파수로 샘플링해야 한다"
  f_sampling >= 2 * f_max

적용:
  - getRecentPrioritizationFees가 반환하는 데이터: 최근 150 슬롯(~60초) 통계
  - 이 60초 윈도우가 "신호의 주기"에 해당
  - 윈도우의 절반 주기 = 30초
  - Nyquist 기준: 60초 주기 신호를 추적하려면 >= 30초 간격으로 샘플링
  - TTL 30초 = Nyquist 최소 샘플링 주기

  실질적 의미:
  - 30초마다 갱신하면 60초 윈도우의 fee 변화를 앨리어싱 없이 추적 가능
  - 60초마다 갱신하면 fee 변화의 절반을 놓침 (under-sampling)
  - 15초마다 갱신하면 over-sampling (불필요한 RPC 호출)
  - 30초 = 최적 균형점
```

```
Fee Bump 1회 재시도 전략:

[제출 실패]
    |
    v
[실패 원인 분류]
    |
    +-- BlockhashNotFound → blockhash 만료 → buildTransaction() 재실행 (기존 전략)
    |
    +-- InsufficientFeeForTransaction / 우선순위 부족 →
    |       |
    |       v
    |   [Fee Bump 재시도 (v0.7 추가)]
    |   1. 현재 priority fee * 1.5 (50% 인상)
    |   2. 새 buildTransaction() (새 blockhash + bumped fee)
    |   3. simulateTransaction() → signTransaction() → submitTransaction()
    |   4. 재시도 횟수: 최대 1회 (무한 재시도 방지)
    |   5. bump 후에도 실패 시 → TRANSACTION_FAILED 반환
    |
    +-- 기타 에러 → 기존 에러 처리 유지

설계 제약:
  - 1회만 재시도: fee escalation 무한 루프 방지
  - 1.5배 bump 계수: 업계 관행 (50~100% 인상이 일반적)
  - fee bump 시 반드시 새 blockhash: 기존 blockhash 만료 위험
  - 감사 로그: bump 재시도 여부와 최종 fee를 audit_log에 기록
```

### Anti-Patterns to Avoid
- **Wall-clock 전용 만료 검증:** Solana 슬롯 속도는 400~600ms로 변동한다. Date.now() 기반 expiresAt만으로 blockhash 수명을 판단하면 슬롯이 빠를 때 이미 만료된 blockhash로 서명할 수 있다. 반드시 getBlockHeight() 기반 검증을 병행해야 한다.
- **nonce를 metadata에 비구조적으로 저장:** `Record<string, unknown>`은 런타임에 타입 캐스팅이 필요하며, nonce 누락 시 silent failure가 발생한다. 명시적 optional 필드로 승격해야 한다.
- **동일 키로의 nonce 충돌 확률 과대평가:** WAIaaS 키스토어는 매 암호화마다 새 salt로 새 AES 키를 파생하므로, Birthday Problem의 전제 조건(동일 키)이 성립하지 않는다. 이 사실을 명확히 기술하지 않으면 불필요한 우려를 유발한다.

## Don't Hand-Roll

이 Phase는 설계 문서 수정만 수행하므로 라이브러리 도입이 없다. 하지만 설계 시 다음 사항에 유의:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Block height 조회 | 슬롯 시간 x 남은 슬롯 계산 | `getBlockHeight()` RPC 직접 호출 | 슬롯 시간이 가변이므로 시간 기반 추정 부정확 |
| EVM nonce 동시성 관리 | 완전 커스텀 트래커 | viem `createNonceManager` 패턴 참고 | 검증된 atomic increment 패턴 |
| Priority fee 추정 | 자체 통계 엔진 | `getRecentPrioritizationFees` 중간값 | 150 슬롯 윈도우가 충분한 통계 기반 |

## Common Pitfalls

### Pitfall 1: getSlot vs getBlockHeight 혼동
**What goes wrong:** Solana에서 slot과 block height는 다른 값이다. 건너뛴(skipped) 슬롯이 있으면 slot > blockHeight이 된다. lastValidBlockHeight는 block height 기준이므로, getSlot()으로 비교하면 아직 유효한 blockhash를 만료로 판정할 수 있다.
**Why it happens:** 용어가 혼용되기 쉬움. Solana 공식 문서도 "약 150 슬롯"이라고 기술하지만, 실제 유효성은 block height 기준.
**How to avoid:** 반드시 `getBlockHeight()` (block height)를 사용. `getSlot()`이 아님.
**Warning signs:** "lastValidBlockHeight를 getSlot()과 비교" 하는 코드.
**Confidence:** HIGH (Solana 공식 문서 확인)

### Pitfall 2: Blockhash 갱신 시 트랜잭션 재컴파일 누락
**What goes wrong:** blockhash를 새로 가져온 후 트랜잭션 메시지의 lifetime만 업데이트하고 재컴파일(compileTransactionMessage)을 하지 않으면, 실제 직렬화된 바이트는 구 blockhash를 포함한 채로 남는다.
**Why it happens:** @solana/kit의 pipe 패턴에서 setTransactionMessageLifetimeUsingBlockhash는 메시지 객체를 반환하지만, 이를 다시 compileTransactionMessage + encode해야 serialized 바이트가 갱신된다.
**How to avoid:** refreshBlockhash()는 반드시 compile + serialize까지 수행하여 UnsignedTransaction.serialized를 완전 교체해야 한다.
**Confidence:** HIGH (코드 구조 분석)

### Pitfall 3: EVM nonce 승격 시 하위 호환성
**What goes wrong:** UnsignedTransaction.nonce를 추가하면, 기존 Solana 코드에서 nonce 필드가 undefined인 것을 확인하지 않고 접근하면 런타임 에러가 발생한다.
**How to avoid:** nonce는 optional 필드(`nonce?: number`)이므로, Solana 어댑터에서는 항상 undefined. 파이프라인에서 nonce 접근 시 반드시 `tx.nonce !== undefined` 가드 사용.
**Confidence:** HIGH (TypeScript 타입 시스템으로 방지 가능)

### Pitfall 4: Salt 변경이 Birthday Problem에 미치는 영향 간과
**What goes wrong:** 26-keystore-spec.md의 nonce 충돌 확률 분석에서 "동일 키로 n회 암호화"를 전제로 Birthday Problem을 적용하는데, WAIaaS는 매 암호화마다 새 salt -> 새 파생 키를 사용하므로 이 전제 자체가 성립하지 않는다. 이를 명시하지 않으면 충돌 확률을 과대평가하게 된다.
**How to avoid:** "매번 새 salt = 매번 새 AES 키 = 동일 키 전제 성립 안 함"을 명시하고, 보수적 분석(salt 재사용 가정)을 별도로 제시.
**Confidence:** HIGH (암호학 기본 원리)

### Pitfall 5: Fee bump 시 기존 nonce/blockhash 재사용
**What goes wrong:** fee bump 재시도 시 기존 트랜잭션의 blockhash를 재사용하면, 이미 만료 직전의 blockhash로 다시 제출하게 된다.
**How to avoid:** fee bump 재시도 시 반드시 새 buildTransaction() 호출 (새 blockhash + bumped fee).
**Confidence:** HIGH (Solana 블로체인 메커니즘)

## Code Examples

### CHAIN-01: Blockhash Freshness Guard (31-solana-adapter-detail.md에 추가할 설계)

```typescript
// Source: Solana 공식 문서 (Transaction Confirmation & Expiration)
// 31-solana-adapter-detail.md 섹션 7 (signTransaction) 보완

/**
 * [v0.7 보완] Blockhash 잔여 수명을 검사한다.
 * signTransaction() 직전에 호출하여, 만료 임박 blockhash로의 서명을 방지한다.
 *
 * @param lastValidBlockHeight - buildTransaction()에서 저장된 lastValidBlockHeight
 * @param thresholdSeconds - 최소 잔여 수명 (기본 20초)
 * @returns 잔여 수명이 충분하면 true
 * @throws ChainError(SOLANA_BLOCKHASH_STALE) - 잔여 수명 < thresholdSeconds
 */
private async checkBlockhashFreshness(
  lastValidBlockHeight: bigint,
  thresholdSeconds: number = 20,
): Promise<void> {
  const currentBlockHeight = await this.rpc!.getBlockHeight({
    commitment: this.commitment,
  }).send()

  const remainingBlocks = Number(lastValidBlockHeight - currentBlockHeight)

  if (remainingBlocks <= 0) {
    throw new ChainError({
      code: SolanaErrorCode.BLOCKHASH_EXPIRED,
      chain: 'solana',
      message: 'Blockhash가 이미 만료되었습니다. buildTransaction부터 재실행하세요.',
      details: { lastValidBlockHeight: lastValidBlockHeight.toString(), currentBlockHeight: currentBlockHeight.toString() },
      retryable: true,
    })
  }

  // 슬롯 당 ~400ms, 보수적으로 계산
  const remainingSeconds = remainingBlocks * 0.4

  if (remainingSeconds < thresholdSeconds) {
    throw new ChainError({
      code: SolanaErrorCode.BLOCKHASH_STALE,  // 새 에러 코드
      chain: 'solana',
      message: `Blockhash 잔여 수명(${remainingSeconds.toFixed(1)}초)이 임계값(${thresholdSeconds}초) 미만입니다. 새 blockhash로 재빌드하세요.`,
      details: {
        remainingBlocks,
        remainingSeconds: remainingSeconds.toFixed(1),
        thresholdSeconds,
        lastValidBlockHeight: lastValidBlockHeight.toString(),
        currentBlockHeight: currentBlockHeight.toString(),
      },
      retryable: true,
    })
  }
}
```

### CHAIN-01: refreshBlockhash() 유틸리티

```typescript
// 31-solana-adapter-detail.md에 추가할 UnsignedTransaction 갱신 유틸리티
// [v0.7 보완] 파이프라인 Stage 5 직전 blockhash 갱신

/**
 * [v0.7 보완] 기존 UnsignedTransaction의 blockhash를 최신으로 갱신한다.
 *
 * signTransaction() 직전 checkBlockhashFreshness()에서 BLOCKHASH_STALE이
 * 발생했을 때, 트랜잭션을 완전히 재빌드하지 않고 blockhash만 교체하는
 * 경량 갱신 메서드이다.
 *
 * 제약: instruction 변경 없이 blockhash + lifetime만 교체.
 * fee 재추정이 필요하면 buildTransaction() 완전 재실행 권장.
 */
async refreshBlockhash(tx: UnsignedTransaction): Promise<UnsignedTransaction> {
  this.ensureConnected()

  // 1. 새 blockhash 조회 (캐시 무효화)
  this.blockhashCache = null
  const { blockhash, lastValidBlockHeight } = await this.getRecentBlockhash()

  // 2. 기존 직렬화된 트랜잭션에서 메시지 구조를 복원하고
  //    blockhash만 교체하여 재컴파일
  // 주의: 이 메서드는 instruction을 변경하지 않으므로,
  //       fee 변동이 크면 buildTransaction() 완전 재실행이 필요하다.

  // 구현 전략:
  // Option A: 메시지 객체를 metadata에 캐싱하여 재사용 (권장)
  // Option B: 직렬화된 바이트에서 blockhash 위치를 찾아 교체 (fragile)
  // v0.7 설계에서는 Option A를 채택한다.

  // 3. 새 expiresAt 계산
  const expiresAt = new Date(Date.now() + 50_000)

  return {
    ...tx,
    expiresAt,
    metadata: {
      ...tx.metadata,
      blockhash,
      lastValidBlockHeight,
    },
    // serialized는 재컴파일된 바이트로 교체
    // (구현 시 transactionMessage 객체를 metadata에 보관하여 재컴파일)
  }
}
```

### CHAIN-02: getCurrentNonce / resetNonceTracker (27-chain-adapter-interface.md에 추가)

```typescript
// [v0.7 보완] IChainAdapter 확장 -- EVM nonce 관리 인터페이스

// EVMAdapter 구현
async getCurrentNonce(address: string): Promise<number> {
  if (!this.client) throw this.notConnectedError()

  const onchainNonce = await this.client.getTransactionCount({
    address: address as `0x${string}`,
    blockTag: 'pending',
  })
  const localNonce = this.nonceTracker.get(address) ?? 0
  return Math.max(onchainNonce, localNonce)
}

resetNonceTracker(address?: string): void {
  if (address) {
    this.nonceTracker.delete(address)
  } else {
    this.nonceTracker.clear()
  }
}

// SolanaAdapter 구현 (no-op)
async getCurrentNonce(_address: string): Promise<number> {
  return 0  // Solana는 nonce 기반이 아님 (blockhash 기반)
}

resetNonceTracker(_address?: string): void {
  // Solana는 nonce 트래커가 없음. no-op.
}
```

### CHAIN-03: Birthday Problem 정정 (26-keystore-spec.md 섹션 3.3 교체 내용)

```markdown
### 3.3 Nonce 재사용 방지 전략 (C-01 대응) [v0.7 보완]

AES-GCM에서 동일 key+nonce 조합의 재사용은 **치명적**이다:
- 두 개의 암호문을 XOR하면 평문 차이가 복원됨
- GCM의 인증 키(GHASH key)도 복구 가능

**방지 전략:**

| # | 전략 | 구현 |
|---|------|------|
| 1 | **매번 새 nonce** | `crypto.randomBytes(12)` -- CSPRNG 96비트 랜덤 nonce |
| 2 | **매번 새 salt** | 재암호화 시 새 salt → 새 AES 키 파생 → nonce 공간 독립 |
| 3 | **카운터 미사용** | 랜덤 nonce만 사용 (카운터 wrap-around 위험 제거) |
| 4 | **키당 암호화 1회** | 파생된 AES 키 1개로 1회만 암호화 |

**[v0.7 보완] 충돌 확률 정밀 분석:**

Birthday Problem 정확 공식:

  P(collision) = 1 - e^(-n(n-1) / (2N))
  ≈ 1 - e^(-n^2 / (2N))   (n >> 1일 때)

  여기서:
    n = 동일 AES 키로 수행한 암호화 횟수
    N = nonce 공간 크기 = 2^96 ≈ 7.92 x 10^28

NIST SP 800-38D 권장 한계:
  - P(collision) < 2^-32 (≈ 2.33 x 10^-10)
  - 이를 만족하는 최대 n ≈ 2^32 (약 43억 회)

**WAIaaS 실사용 패턴 분석:**

WAIaaS 키스토어는 매 암호화마다 새 CSPRNG salt(16바이트)를 생성하고,
Argon2id로 새 AES-256 키를 파생한다. 따라서:

1. **동일 AES 키로의 암호화 횟수 = 1회** (키스토어 파일 생성 또는 재암호화 1회)
2. 패스워드 변경 시 새 salt → 새 AES 키 → Birthday Problem 전제(동일 키) 미충족
3. n=1이면 P(collision) = 0 (자기 자신과의 충돌은 정의상 불가)

따라서 WAIaaS 키스토어에서 AES-GCM nonce 충돌은 **구조적으로 불가능**하다.

**보수적 가정 분석 (salt 고정 시나리오 -- 실제로는 불가능):**

만약 동일 salt(= 동일 AES 키)를 재사용하는 설계 결함이 있다고 가정:

| 시나리오 | n (암호화 횟수) | P(collision) | 판정 |
|---------|----------------|--------------|------|
| 에이전트 1개, 패스워드 변경 100회 | 100 | ≈ 6.3 x 10^-26 | 무시 가능 |
| 에이전트 100개, 각 100회 변경 | 10,000 | ≈ 6.3 x 10^-22 | 무시 가능 |
| NIST 한계 (참고) | 2^32 ≈ 4.3 x 10^9 | ≈ 2.33 x 10^-10 | NIST 허용 상한 |
| 50% 충돌 (참고) | 2^48 ≈ 2.8 x 10^14 | ≈ 50% | Birthday bound |

**결론:** WAIaaS 키스토어의 설계(매번 새 salt + 새 nonce)는 AES-GCM nonce
충돌을 구조적으로 방지한다. Birthday Problem 분석은 이론적 참고용이며,
실제 위험은 0이다.
```

### CHAIN-04: Priority Fee TTL 근거 + Bump 전략 (31-solana-adapter-detail.md 보완)

```markdown
### 11.2 캐시 전략 [v0.7 보완]

| 캐시 대상 | TTL | 근거 | 무효화 조건 |
|----------|-----|------|------------|
| **blockhash** | 5초 | ... (기존) | TTL 만료 시 자동 무효화 |
| **priority fee** | 30초 | **(v0.7 보완)** Nyquist 기준. 아래 상세 참조 | TTL 만료 시 자동 무효화 |

**[v0.7 보완] Priority Fee TTL 30초의 Nyquist 기준 근거:**

Nyquist-Shannon 샘플링 정리에 의하면, 대역 제한 신호를 왜곡 없이
복원하려면 최소 신호 주파수의 2배로 샘플링해야 한다 (f_s >= 2 * f_max).

적용:
- getRecentPrioritizationFees는 최근 150 슬롯(≈ 60초)의 통계를 반환
- 이 60초 윈도우가 fee 변화의 "주기"에 해당
- Nyquist 최소 샘플링 주기 = 60초 / 2 = 30초
- TTL 30초 = Nyquist 최소 샘플링 주기

| TTL | Nyquist 판정 | 트레이드오프 |
|-----|-------------|------------|
| 15초 | 오버샘플링 (4x) | 불필요한 RPC 호출 증가 |
| **30초** | **적정 (2x, Nyquist 최소)** | **fee 변화 추적 + RPC 부담 균형** |
| 60초 | 언더샘플링 (1x) | fee 변화 절반 놓침 (앨리어싱) |

**[v0.7 보완] 제출 실패 시 1.5배 Fee Bump 1회 재시도 전략:**

| 단계 | 동작 | 비고 |
|------|------|------|
| 1 | submitTransaction() 실패 감지 | 에러 유형: priority fee 부족 |
| 2 | 현재 priority fee * 1.5 계산 | 50% 인상 (업계 표준 범위: 50~100%) |
| 3 | buildTransaction() 재실행 | 새 blockhash + bumped fee |
| 4 | simulate → sign → submit | 전체 파이프라인 재실행 |
| 5-성공 | 성공 반환 | 감사 로그에 bump 기록 |
| 5-실패 | TRANSACTION_FAILED 반환 | 1회만 재시도, 추가 bump 없음 |

설계 제약:
- 최대 재시도 횟수: 1회 (fee escalation 무한 루프 방지)
- bump 계수: 1.5배 고정 (설정 가능하게 하지 않음 -- 단순성 우선)
- bump 시 반드시 새 blockhash 사용 (기존 blockhash 만료 위험)
- 감사 기록: audit_log에 fee_bump_attempted, original_fee, bumped_fee 기록
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| expiresAt (Date) 만으로 blockhash 만료 판정 | getBlockHeight() + lastValidBlockHeight 비교 | Solana 공식 문서 현행 권장 | wall-clock 기반 오판 방지 |
| nonce를 metadata에 비구조적 저장 | UnsignedTransaction.nonce 명시적 필드 | v0.7 설계 보완 | 타입 안전성 확보 |
| Birthday Problem 근사 기술 | 정확한 공식 + 실사용 패턴 분석 | v0.7 설계 보완 | 보안 문서 정확성 |
| Priority fee 실패 시 재시도 없음 | 1.5배 fee bump 1회 재시도 | 업계 표준 패턴 적용 | 혼잡 시 트랜잭션 착지율 개선 |

**주의: @solana/kit API 변화**
- `@solana/web3.js 2.x`가 `@solana/kit`으로 리브랜딩됨 (기존 문서에 반영 완료)
- `getBlockHeight`는 `rpc.getBlockHeight().send()` 패턴으로 호출 (기존 `getHealth`, `getBalance` 등과 동일 패턴)

## Open Questions

1. **refreshBlockhash() 구현 전략의 구체화**
   - What we know: blockhash만 교체하려면 트랜잭션 메시지 객체를 캐싱해야 함
   - What's unclear: @solana/kit에서 컴파일된 메시지에서 blockhash만 교체하는 공식 API가 있는지
   - Recommendation: Option A (메시지 객체를 metadata에 캐싱) 채택. 구현 시 @solana/kit 문서 재확인 필요.
   - Impact: LOW -- 이 Phase는 설계 문서 수정이므로, 구현 세부 사항은 코드 Phase에서 확정

2. **SOLANA_BLOCKHASH_STALE 에러 코드 추가 여부**
   - What we know: 현재 SolanaErrorCode에 BLOCKHASH_EXPIRED는 있으나 BLOCKHASH_STALE은 없음
   - What's unclear: "만료"와 "수명 부족"을 별도 코드로 구분할 필요가 있는지
   - Recommendation: 별도 에러 코드 추가 권장. EXPIRED(이미 만료) vs STALE(수명 부족, 갱신 권장)은 호출자의 복구 전략이 다름.
   - Impact: 45-enum-unified-mapping.md에도 에러 코드 추가 반영 필요

3. **Fee bump 감지 조건의 정밀화**
   - What we know: "priority fee 부족"으로 인한 실패를 감지해야 함
   - What's unclear: Solana RPC가 "priority fee 부족"을 명시적으로 반환하는지, 아니면 일반적인 트랜잭션 드롭으로만 나타나는지
   - Recommendation: 설계 문서에는 "제출 후 waitForConfirmation에서 타임아웃 + 네트워크 혼잡 감지 시 fee bump" 패턴을 기술하는 것이 현실적

## Sources

### Primary (HIGH confidence)
- [Solana Official - Transaction Confirmation & Expiration](https://solana.com/developers/guides/advanced/confirmation) -- blockhash 수명 151 블록, lastValidBlockHeight, getBlockHeight() 권장
- [Helius - How to Deal with Blockhash Errors](https://www.helius.dev/blog/how-to-deal-with-blockhash-errors-on-solana) -- freshness guard 패턴, commitment 일관성
- [NIST SP 800-38D](https://csrc.nist.gov/pubs/sp/800/38/d/final) -- AES-GCM nonce 한계, 2^32 메시지 제한
- [Wikipedia - Birthday Problem](https://en.wikipedia.org/wiki/Birthday_problem) -- P(collision) = 1 - e^(-n^2/(2N)) 공식
- [Nyquist-Shannon Sampling Theorem](https://en.wikipedia.org/wiki/Nyquist%E2%80%93Shannon_sampling_theorem) -- f_s >= 2 * f_max

### Secondary (MEDIUM confidence)
- [Helius - Priority Fees Understanding](https://www.helius.dev/blog/priority-fees-understanding-solanas-transaction-fee-mechanics) -- fee 변동성, getRecentPrioritizationFees 150 슬롯 윈도우
- [Soatok Blog - Why AES-GCM Sucks](https://soatok.blog/2020/05/13/why-aes-gcm-sucks/) -- 2^32 random nonce 한계, 2^48 50% 충돌
- [Neil Madden - GCM and Random Nonces](https://neilmadden.blog/2024/05/23/galois-counter-mode-and-random-nonces/) -- 96-bit nonce 실용 분석
- [viem Discussion #1338](https://github.com/wevm/viem/discussions/1338) -- 동시 트랜잭션 nonce 관리 문제
- [viem - createNonceManager](https://viem.sh/docs/accounts/local/createNonceManager) -- 공식 nonce 관리 API

### Tertiary (LOW confidence)
- [QuickNode - Solana Priority Fees Guide](https://www.quicknode.com/guides/solana-development/transactions/how-to-use-priority-fees) -- fee bump 패턴 (50~100% 인상 언급)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 기존 설계 문서에 이미 확정된 스택 (변경 없음)
- Architecture patterns: HIGH -- Solana 공식 문서 + 확립된 암호학 기반
- Pitfalls: HIGH -- 공식 문서 및 코드 구조 분석에서 도출
- Code examples: MEDIUM -- 설계 수준 pseudo-code, 구현 시 API 재확인 필요

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (30일 -- 안정적 기술 도메인)
