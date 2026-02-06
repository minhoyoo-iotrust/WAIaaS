# Mock 경계, 인터페이스 스펙, Contract Test 전략 (MOCK)

**문서 ID:** MOCK
**작성일:** 2026-02-06
**상태:** 완료
**참조:** CORE-04 (27-chain-adapter-interface.md), CORE-03 (26-keystore-spec.md), LOCK-MECH (33-time-lock-approval-mechanism.md), NOTI-ARCH (35-notification-architecture.md), 14-RESEARCH.md
**요구사항:** MOCK-01 (Mock 경계 매트릭스), MOCK-02 (기존 인터페이스 Mock 검증), MOCK-03 (IClock/IOwnerSigner 스펙), MOCK-04 (Contract Test 전략)

---

## 1. 문서 개요

### 1.1 목적

WAIaaS 테스트에서 외부 의존성을 어떻게 격리하는지(Mock 경계), 테스트를 위한 신규 인터페이스(IClock, IOwnerSigner)의 스펙, 그리고 모든 인터페이스의 Mock-실제 구현 동작 일치를 보장하는 Contract Test 전략을 확정한다.

이 문서는 구현 단계에서 Mock 클래스, Fake 객체, Contract Test 스위트를 코드로 작성할 때 **"무엇을 만들어야 하는지"**가 명확한 설계 기준이 된다.

### 1.2 요구사항 매핑

| 요구사항 | 설명 | 충족 섹션 |
|---------|------|-----------|
| MOCK-01 | 5개 외부 의존성의 테스트 레벨별 Mock 방식 | 섹션 2 (Mock 경계 매트릭스) |
| MOCK-02 | 기존 4개 인터페이스 Mock 가능성 검증 | 섹션 3 (기존 인터페이스 Mock 가능성 검증) |
| MOCK-03 | IClock/IOwnerSigner 인터페이스 스펙 정의 | 섹션 4 (신규 테스트 인터페이스 스펙) |
| MOCK-04 | 5개 인터페이스 Contract Test 전략 | 섹션 5 (Contract Test 전략) |

### 1.3 핵심 원칙

| 원칙 | 설명 | 적용 |
|------|------|------|
| **Mock-first** | 블록체인 RPC를 포함한 모든 외부 호출은 기본적으로 Mock한다 | Unit/Integration에서 실제 RPC 호출 금지 |
| **DI 기반 격리** | 시간, Owner 서명 등 비결정적 의존성은 인터페이스로 추상화하여 DI로 주입 | IClock, IOwnerSigner |
| **Contract Test로 신뢰 보장** | Mock과 실제 구현이 동일한 테스트를 통과해야만 Mock을 믿을 수 있다 | 5개 인터페이스 전체 |
| **레벨별 충실도 조정** | Unit은 속도 우선(완전 Mock), Integration은 DB 포함, Chain Integration은 실제 네트워크 | 매트릭스 참조 |

---

## 2. Mock 경계 매트릭스 (MOCK-01)

### 2.1 테스트 레벨별 Mock 방식

5개 외부 의존성에 대해 6개 테스트 레벨에서 어떤 Mock 방식을 사용하는지 정의한다.

| 외부 의존성 | Unit | Integration | E2E | Chain Integration | Security | Platform |
|-------------|------|-------------|-----|-------------------|----------|----------|
| **블록체인 RPC** | MockChainAdapter (canned responses) | MockChainAdapter (canned responses) | MockChainAdapter (시나리오 기반) | 실제 Devnet/Testnet | MockChainAdapter | 환경에 따라 다름 |
| **알림 채널** | MockNotificationChannel | MockNotificationChannel | MockNotificationChannel | MockNotificationChannel | MockNotificationChannel | MockNotificationChannel |
| **파일시스템** | memfs (메모리 FS) | tmpdir (실제 FS) | tmpdir (실제 FS) | tmpdir (실제 FS) | memfs (메모리 FS) | 실제 FS |
| **시간 (IClock)** | FakeClock (DI) | FakeClock 또는 RealClock (DI) | RealClock | RealClock | FakeClock (DI) | RealClock |
| **Owner 서명** | FakeOwnerSigner (DI) | FakeOwnerSigner (DI) | FakeOwnerSigner | 실제 지갑 (수동) | FakeOwnerSigner | FakeOwnerSigner |

### 2.2 셀별 근거

#### 블록체인 RPC

| 레벨 | Mock 방식 | 근거 |
|------|----------|------|
| Unit | MockChainAdapter (canned responses) | 외부 네트워크 의존 제거, 결정적 응답으로 로직만 검증. 패키지당 <10s 목표 |
| Integration | MockChainAdapter (canned responses) | DB 연동 테스트가 목적이므로 RPC는 여전히 Mock. SQLite와의 상호작용에 집중 |
| E2E | MockChainAdapter (시나리오 기반) | API 전체 흐름 검증이 목적. 실패 시나리오(RPC 타임아웃, 잔액 부족 등)를 시뮬레이션 |
| Chain Integration | 실제 Devnet/Testnet | 실제 블록체인 네트워크와의 호환성 검증. Solana Devnet, EVM Sepolia 사용 |
| Security | MockChainAdapter | 공격 시나리오(금액 조작, 주소 위변조) 재현이 목적. 네트워크 상태에 의존하면 안 됨 |
| Platform | 환경에 따라 다름 | CLI/Docker는 MockChainAdapter, 수동 QA는 실제 네트워크 가능 |

#### 알림 채널 (Telegram/Discord/ntfy.sh)

| 레벨 | Mock 방식 | 근거 |
|------|----------|------|
| 전 레벨 | MockNotificationChannel | 실제 채널 호출은 외부 서비스 상태에 의존하므로 테스트 안정성 저해. 전송 기록(sentMessages)으로 검증 충분. Rate limit 테스트도 MockNotificationChannel + FakeClock으로 수행 가능 |

#### 파일시스템 (키스토어, config)

| 레벨 | Mock 방식 | 근거 |
|------|----------|------|
| Unit | memfs (메모리 기반) | 디스크 I/O 없이 순수 로직 검증. 키스토어 JSON 파싱, config.toml 로딩을 메모리에서 수행 |
| Integration | tmpdir (실제 FS) | 실제 파일 권한, 경로 해석, atomic write 등 OS 레벨 동작 검증. 테스트별 독립 tmpdir 사용 |
| Security | memfs (메모리 기반) | 공격 시나리오(경로 순회, 권한 에스컬레이션)는 로직 레벨에서 재현. 실제 FS 불필요 |

#### 시간 (IClock)

| 레벨 | Mock 방식 | 근거 |
|------|----------|------|
| Unit | FakeClock (DI) | JWT 만료, 타임락 쿨다운, 승인 타임아웃 등 시간 의존 로직을 결정적으로 검증 |
| Integration | FakeClock 또는 RealClock | DB 쿼리의 시간 관련 조건(WHERE created_at > ?) 테스트 시 FakeClock. 일반 흐름은 RealClock |
| E2E/Chain/Platform | RealClock | 실제 시간으로 전체 흐름 검증. 시간 조작이 의미 없는 레벨 |
| Security | FakeClock (DI) | 시간 기반 공격(만료 우회, 쿨다운 스킵) 시나리오 재현 |

#### Owner 서명 (IOwnerSigner)

| 레벨 | Mock 방식 | 근거 |
|------|----------|------|
| Unit/Integration | FakeOwnerSigner (DI) | 결정적 키쌍으로 서명 생성+검증. ownerAuth 미들웨어 로직 검증에 집중 |
| E2E | FakeOwnerSigner | API 전체 흐름에서 Owner 인가가 필요한 엔드포인트 테스트. 외부 지갑 불필요 |
| Chain Integration | 실제 지갑 (수동) | WalletConnect v2 연동을 포함한 전체 서명 흐름 검증. 수동 테스트 |
| Security | FakeOwnerSigner | 서명 위조, 리플레이 공격 등 보안 시나리오 재현 |

---

## 3. 기존 인터페이스 Mock 가능성 검증 (MOCK-02)

v0.2에서 정의한 4개 핵심 인터페이스 각각에 대해 Mock 가능성을 분석한다.

### 3.1 IChainAdapter

**참조:** CORE-04 (27-chain-adapter-interface.md)
**Mock 가능성:** HIGH
**메소드 수:** 13개 + 2 readonly 프로퍼티 (chain, network)

모든 메소드가 순수 입출력 기반이며, 부작용(RPC 호출)이 DI로 격리 가능하다. MockChainAdapter는 canned responses를 반환하고, 테스트에서 응답을 제어할 수 있다.

#### 13개 메소드별 Mock 반환값

| # | 메소드 | 카테고리 | Mock 반환값 | 비고 |
|---|--------|---------|------------|------|
| 1 | `connect(rpcUrl)` | 연결 | void (성공) | 내부 `connected` 플래그를 true로 설정 |
| 2 | `disconnect()` | 연결 | void (성공) | 내부 `connected` 플래그를 false로 설정 |
| 3 | `isConnected()` | 연결 | boolean (`connected` 플래그) | 동기 메소드. connect/disconnect 상태 반영 |
| 4 | `getHealth()` | 연결 | `{ healthy: true, latency: 50 }` | 고정 레이턴시. `setHealth()`로 제어 가능 |
| 5 | `isValidAddress(address)` | 검증 | boolean (체인별 포맷 검증) | Solana: Base58 + 32바이트, EVM: 0x + 40자 hex |
| 6 | `getBalance(address)` | 조회 | `BalanceInfo { balance: 10_000_000_000n, decimals: 9, symbol: 'SOL' }` | `setBalance()`로 제어 가능 |
| 7 | `buildTransaction(request)` | 파이프라인 | `UnsignedTransaction { chain, serialized: Uint8Array(256), estimatedFee: 5000n }` | 사전 정의된 직렬화 바이트 |
| 8 | `simulateTransaction(tx)` | 파이프라인 | `SimulationResult { success: true, logs: [], unitsConsumed: 200_000n }` | `setSimulationResult()`로 실패 시뮬레이션 가능 |
| 9 | `signTransaction(tx, privateKey)` | 파이프라인 | `Uint8Array(64)` (고정 서명 바이트) | privateKey 검증 없이 고정 바이트 반환 |
| 10 | `submitTransaction(signedTx)` | 파이프라인 | `SubmitResult { txHash: 'mock-tx-hash-...', status: 'confirmed' }` | `setSubmitResult()`로 제어 가능 |
| 11 | `getTransactionStatus(txHash)` | 조회 | `SubmitResult { txHash, status: 'confirmed' }` | 해시별 상태 맵으로 관리 |
| 12 | `waitForConfirmation(txHash, timeout?)` | 조회 | `SubmitResult { txHash, status: 'finalized' }` | 즉시 반환 (대기 없음) |
| 13 | `estimateFee(request)` | 추정 | `5000n` (고정 수수료) | `setEstimatedFee()`로 제어 가능 |

#### MockChainAdapter 클래스 설계

```typescript
// packages/core/src/testing/MockChainAdapter.ts
export class MockChainAdapter implements IChainAdapter {
  readonly chain: ChainType
  readonly network: NetworkType
  private connected = false

  // 제어용 상태
  private balances = new Map<string, BalanceInfo>()
  private healthResponse = { healthy: true, latency: 50 }
  private simulationResult: SimulationResult = { success: true, logs: [], unitsConsumed: 200_000n }
  private submitResult: SubmitResult | null = null
  private estimatedFee: bigint = 5000n
  private txStatuses = new Map<string, SubmitResult>()

  /** 호출 기록 (검증용) */
  readonly calls: { method: string; args: unknown[] }[] = []

  constructor(chain: ChainType = 'solana', network: NetworkType = 'devnet') {
    this.chain = chain
    this.network = network
  }

  // --- 제어 메소드 (테스트에서 사용) ---
  setBalance(address: string, balance: BalanceInfo): void
  setHealth(response: { healthy: boolean; latency: number }): void
  setSimulationResult(result: SimulationResult): void
  setSubmitResult(result: SubmitResult): void
  setEstimatedFee(fee: bigint): void
  setTransactionStatus(txHash: string, result: SubmitResult): void
  reset(): void  // 모든 상태 + 호출 기록 초기화

  // --- IChainAdapter 구현 (13 메소드) ---
  // 각 메소드는 calls 배열에 기록 후 canned response 반환
}
```

#### 주의점

- `signTransaction`: 실제 구현에서는 `ILocalKeyStore.sign()`을 내부 호출하므로, Integration 테스트에서는 MockKeyStore와 조합하여 테스트해야 한다. MockChainAdapter에서는 privateKey 검증 없이 고정 서명 바이트를 반환한다.
- `isValidAddress`: 체인별 포맷 검증 로직이 순수 함수이므로 Mock에서도 실제 검증을 수행할 수 있다. 단, 단순 Mock에서는 항상 true를 반환하고 주소 형식 테스트는 별도 Unit 테스트로 분리한다.
- `waitForConfirmation`: Mock에서는 즉시 finalized를 반환한다. 타임아웃 시나리오는 `setTimeout` + `jest.advanceTimersByTimeAsync()`로 별도 테스트한다.

### 3.2 IPolicyEngine

**참조:** LOCK-MECH (33-time-lock-approval-mechanism.md)
**Mock 가능성:** HIGH
**메소드 수:** 1개 (evaluate)

단일 메소드에 명확한 입출력(agentId + TxRequest -> PolicyDecision)을 가지므로 Mock이 매우 간단하다.

#### 인터페이스 요약

```typescript
interface IPolicyEngine {
  evaluate(agentId: string, request: {
    type: string
    amount: string
    to: string
    chain: string
  }): Promise<PolicyDecision>
}

interface PolicyDecision {
  allowed: boolean
  tier: 'INSTANT' | 'NOTIFY' | 'DELAY' | 'APPROVAL'
  reason?: string
  policyId?: string
  delaySeconds?: number
  approvalTimeoutSeconds?: number
}
```

#### MockPolicyEngine 클래스 설계

```typescript
// packages/core/src/testing/MockPolicyEngine.ts
export class MockPolicyEngine implements IPolicyEngine {
  /** 기본 응답: 모든 거래를 INSTANT으로 허용 */
  private defaultDecision: PolicyDecision = { allowed: true, tier: 'INSTANT' }

  /** 다음 evaluate() 호출에 반환할 결정 (큐 방식) */
  private nextDecisions: PolicyDecision[] = []

  /** 호출 기록 */
  readonly evaluateCalls: { agentId: string; request: unknown }[] = []

  async evaluate(agentId: string, request: TxRequest): Promise<PolicyDecision> {
    this.evaluateCalls.push({ agentId, request })
    if (this.nextDecisions.length > 0) {
      return this.nextDecisions.shift()!
    }
    return { ...this.defaultDecision }
  }

  /** 다음 N개 호출의 결정을 사전 설정 */
  setNextDecision(...decisions: PolicyDecision[]): void {
    this.nextDecisions.push(...decisions)
  }

  /** 기본 결정 변경 */
  setDefaultDecision(decision: PolicyDecision): void {
    this.defaultDecision = decision
  }

  /** 상태 초기화 */
  reset(): void {
    this.nextDecisions.length = 0
    this.evaluateCalls.length = 0
    this.defaultDecision = { allowed: true, tier: 'INSTANT' }
  }
}
```

#### 주의점

- DatabasePolicyEngine은 SQLite DB에 의존하므로 Integration 테스트에서 실제 DB(tmpdir)와 함께 테스트해야 한다.
- TOCTOU 방지 로직(BEGIN IMMEDIATE + reserved_amount)은 Integration 레벨에서만 의미 있게 검증 가능하다.
- Mock에서는 DENY 결과도 설정 가능해야 한다: `{ allowed: false, reason: 'WHITELIST_BLOCKED', policyId: 'pol-001' }`.

### 3.3 INotificationChannel

**참조:** NOTI-ARCH (35-notification-architecture.md)
**Mock 가능성:** HIGH
**메소드 수:** 2개 (send, healthCheck) + 3 readonly 프로퍼티 (type, name, channelId)

HTTP 외부 호출만 Mock하면 되므로 Mock 가능성이 높다.

#### 인터페이스 요약

```typescript
interface INotificationChannel {
  readonly type: 'TELEGRAM' | 'DISCORD' | 'NTFY'
  readonly name: string
  readonly channelId: string
  send(message: NotificationMessage): Promise<NotificationResult>
  healthCheck(): Promise<boolean>
}
```

#### MockNotificationChannel 클래스 설계

```typescript
// packages/core/src/testing/MockNotification.ts
export class MockNotificationChannel implements INotificationChannel {
  readonly type: 'TELEGRAM' | 'DISCORD' | 'NTFY'
  readonly name: string
  readonly channelId: string

  /** 전송된 메시지 기록 (검증용) */
  readonly sentMessages: NotificationMessage[] = []

  /** 다음 send() 호출의 결과를 제어 */
  private nextResults: NotificationResult[] = []

  /** healthCheck 반환값 */
  private healthy = true

  constructor(
    type: 'TELEGRAM' | 'DISCORD' | 'NTFY' = 'TELEGRAM',
    name = 'mock-channel',
    channelId = 'ch-mock-001'
  ) {
    this.type = type
    this.name = name
    this.channelId = channelId
  }

  async send(message: NotificationMessage): Promise<NotificationResult> {
    this.sentMessages.push(message)
    if (this.nextResults.length > 0) {
      return this.nextResults.shift()!
    }
    return { success: true, channelId: this.channelId }
  }

  async healthCheck(): Promise<boolean> {
    return this.healthy
  }

  /** 다음 send() 호출이 실패하도록 설정 */
  simulateFailure(error: string, retryAfter?: number): void {
    this.nextResults.push({
      success: false,
      channelId: this.channelId,
      error,
      retryAfter,
    })
  }

  /** 건강 상태 변경 */
  setHealthy(healthy: boolean): void {
    this.healthy = healthy
  }

  /** 기록 및 상태 초기화 */
  reset(): void {
    this.sentMessages.length = 0
    this.nextResults.length = 0
    this.healthy = true
  }
}
```

#### 주의점

- TokenBucketRateLimiter는 INotificationChannel과 별개로 Unit 테스트한다. Rate limiter는 IClock을 주입받아 시간 기반 버킷 리필을 제어한다.
- 실제 채널(Telegram/Discord/ntfy.sh)은 어떤 테스트 레벨에서도 호출하지 않는다(Locked Decision).
- NotificationService의 priority-ordered fallback 로직은 MockNotificationChannel 여러 개를 조합하여 테스트한다.

### 3.4 ILocalKeyStore

**참조:** CORE-03 (26-keystore-spec.md)
**Mock 가능성:** MEDIUM
**메소드 수:** 6개 (unlock, lock, sign, getPublicKey, addAgent, exportKeyFile)

sodium-native C++ 바인딩에 의존하므로 Unit 테스트에서는 인터페이스 Mock이 필수이다. Integration에서만 실제 sodium-native를 사용한다.

#### 인터페이스 요약

```typescript
interface ILocalKeyStore {
  unlock(password: string): Promise<void>
  lock(): void
  sign(agentId: string, message: Uint8Array): Uint8Array
  getPublicKey(agentId: string): string
  addAgent(agentId: string, chain: ChainType, network: NetworkType, name: string): Promise<AgentKeyInfo>
  exportKeyFile(agentId: string, exportPassword: string): Promise<Buffer>
}
```

#### MockKeyStore 클래스 설계

```typescript
// packages/core/src/testing/MockKeyStore.ts
import nacl from 'tweetnacl'

export class MockKeyStore implements ILocalKeyStore {
  private unlocked = false
  private keys = new Map<string, {
    publicKey: Uint8Array
    secretKey: Uint8Array
    chain: ChainType
    network: NetworkType
    name: string
  }>()

  /** 호출 기록 */
  readonly calls: { method: string; args: unknown[] }[] = []

  /** 사전 등록된 에이전트 키 (결정적 시드 기반) */
  constructor(preloadedAgents?: Array<{
    agentId: string; chain: ChainType; network: NetworkType; name: string; seed: Uint8Array
  }>) {
    if (preloadedAgents) {
      for (const agent of preloadedAgents) {
        const keypair = nacl.sign.keyPair.fromSeed(agent.seed)
        this.keys.set(agent.agentId, {
          publicKey: keypair.publicKey,
          secretKey: keypair.secretKey,
          chain: agent.chain,
          network: agent.network,
          name: agent.name,
        })
      }
    }
  }

  async unlock(password: string): Promise<void> {
    this.calls.push({ method: 'unlock', args: [password] })
    if (this.unlocked) throw new Error('KEYSTORE_ALREADY_UNLOCKED')
    // MockKeyStore는 패스워드 검증을 하지 않음 (항상 성공)
    this.unlocked = true
  }

  lock(): void {
    this.calls.push({ method: 'lock', args: [] })
    if (!this.unlocked) throw new Error('KEYSTORE_NOT_UNLOCKED')
    this.unlocked = false
  }

  sign(agentId: string, message: Uint8Array): Uint8Array {
    this.calls.push({ method: 'sign', args: [agentId, message] })
    if (!this.unlocked) throw new Error('KEYSTORE_NOT_UNLOCKED')
    const key = this.keys.get(agentId)
    if (!key) throw new Error('AGENT_NOT_FOUND')
    return nacl.sign.detached(message, key.secretKey)
  }

  getPublicKey(agentId: string): string {
    this.calls.push({ method: 'getPublicKey', args: [agentId] })
    const key = this.keys.get(agentId)
    if (!key) throw new Error('AGENT_NOT_FOUND')
    // Base58 인코딩 (Solana) 또는 0x hex (EVM)
    return encodePublicKey(key.publicKey, key.chain)
  }

  async addAgent(
    agentId: string, chain: ChainType, network: NetworkType, name: string
  ): Promise<AgentKeyInfo> {
    this.calls.push({ method: 'addAgent', args: [agentId, chain, network, name] })
    if (!this.unlocked) throw new Error('KEYSTORE_NOT_UNLOCKED')
    // 결정적 시드에서 키 생성 (agentId 기반)
    const seed = new Uint8Array(32)
    new TextEncoder().encode(agentId).forEach((b, i) => { seed[i % 32] ^= b })
    const keypair = nacl.sign.keyPair.fromSeed(seed)
    this.keys.set(agentId, { publicKey: keypair.publicKey, secretKey: keypair.secretKey, chain, network, name })
    return { id: agentId, name, chain, network, publicKey: encodePublicKey(keypair.publicKey, chain), createdAt: new Date().toISOString() }
  }

  async exportKeyFile(agentId: string, exportPassword: string): Promise<Buffer> {
    this.calls.push({ method: 'exportKeyFile', args: [agentId, exportPassword] })
    if (!this.unlocked) throw new Error('KEYSTORE_NOT_UNLOCKED')
    const key = this.keys.get(agentId)
    if (!key) throw new Error('AGENT_NOT_FOUND')
    // Mock: 단순 JSON 직렬화 (실제 암호화 없음)
    return Buffer.from(JSON.stringify({ agentId, publicKey: encodePublicKey(key.publicKey, key.chain) }))
  }

  /** 상태 초기화 */
  reset(): void {
    this.unlocked = false
    this.keys.clear()
    this.calls.length = 0
  }
}
```

#### 주의점

- **상태 순서 검증 필수:** `unlock -> sign -> lock` 순서가 지켜져야 한다. `sign`은 lock 상태에서 `KEYSTORE_NOT_UNLOCKED`를 throw해야 한다.
- **MEDIUM 판정 이유:** sodium-native가 C++ 바인딩이므로 CI 환경에서 빌드 실패 위험이 있다. MockKeyStore는 tweetnacl(순수 JS)로 대체하여 서명 생성/검증 기능은 유지하되, sodium_malloc/memzero 같은 보안 메모리 기능은 Mock하지 않는다.
- **Integration에서만 실제 sodium-native 사용:** LocalKeyStore 실제 구현의 보안 메모리 관리(sodium_malloc, mprotect, memzero)는 Integration 테스트에서 검증한다.
- **exportKeyFile의 Mock:** 실제 AES-256-GCM 암호화 대신 단순 JSON 직렬화. 암호화 검증은 Integration에서 수행한다.

### 3.5 Mock 가능성 요약

| 인터페이스 | Mock 가능성 | 메소드 수 | Mock 방식 | Integration에서의 차이 |
|-----------|-----------|----------|----------|---------------------|
| IChainAdapter | HIGH | 13 | MockChainAdapter (canned responses + 호출 기록) | SolanaAdapter + 실제 Devnet RPC |
| IPolicyEngine | HIGH | 1 | MockPolicyEngine (기본 INSTANT + 큐 방식 제어) | DatabasePolicyEngine + 실제 SQLite |
| INotificationChannel | HIGH | 2 + 3 props | MockNotificationChannel (전송 기록 + 실패 시뮬레이션) | 없음 (모든 레벨에서 Mock) |
| ILocalKeyStore | MEDIUM | 6 | MockKeyStore (tweetnacl 기반 메모리 키 관리) | LocalKeyStore + 실제 sodium-native |

---

## 4. 신규 테스트 인터페이스 스펙 (MOCK-03)

### 4.1 IClock 인터페이스

#### 인터페이스 정의

```typescript
// packages/core/src/interfaces/IClock.ts

/**
 * 시간 추상화 인터페이스.
 *
 * 현재 시각을 반환하는 단일 메소드를 제공한다.
 * setTimeout/setInterval은 이 인터페이스의 범위가 아니며,
 * Jest의 useFakeTimers()/advanceTimersByTimeAsync()를 사용한다.
 *
 * DI 주입:
 *   운영 환경 -> RealClock (new Date() 반환)
 *   테스트 환경 -> FakeClock (시간 제어 가능)
 */
export interface IClock {
  /** 현재 시각을 반환한다. */
  now(): Date
}
```

**Locked Decision 반영:**
- `now(): Date`만 제공한다. setTimeout/setInterval 제어는 Jest의 `useFakeTimers()` 사용.
- IClock의 책임은 "현재 시각 조회"로 한정. 타이머 스케줄링은 별도 관심사이다.

#### 사용처 및 DI 패턴

IClock은 시간 의존 로직이 있는 모든 서비스에 DI로 주입된다.

| 사용처 | IClock 사용 목적 | DI 패턴 |
|--------|-----------------|---------|
| **SessionService** | JWT 만료 검증 (`exp` vs `clock.now()`) | 생성자 주입: `new SessionService({ clock })` |
| **DatabasePolicyEngine** | 타임락 쿨다운 계산 (DELAY 대기 시간 판단) | 생성자 주입: `new DatabasePolicyEngine(db, sqlite, { clock })` |
| **TransactionService** | 트랜잭션 만료 확인 (`expiresAt` vs `clock.now()`) | 생성자 주입: `new TransactionService({ clock, adapter, ... })` |
| **DelayQueueWorker** | 지연 시간 도래 판단 (`created_at + delaySeconds` vs `clock.now()`) | 생성자 주입: `new DelayQueueWorker({ clock, db })` |
| **ApprovalTimeoutWorker** | 승인 타임아웃 판단 (`created_at + timeoutSeconds` vs `clock.now()`) | 생성자 주입: `new ApprovalTimeoutWorker({ clock, db })` |
| **AuditLogger** | 감사 로그 타임스탬프 | options 객체: `{ clock?: IClock }` (기본: RealClock) |

**DI 패턴 상세:**

```typescript
// 생성자 주입 패턴 (권장)
interface SessionServiceOptions {
  clock: IClock
  db: DrizzleInstance
  jwtSecret: string
  // ...
}

class SessionService {
  private readonly clock: IClock

  constructor(options: SessionServiceOptions) {
    this.clock = options.clock
  }

  async verify(token: string): Promise<SessionPayload> {
    const payload = decodeJwt(token)
    const now = this.clock.now()
    if (payload.exp * 1000 < now.getTime()) {
      throw new Error('SESSION_EXPIRED')
    }
    // ...
  }
}
```

#### FakeClock 테스트 구현

```typescript
// packages/core/src/testing/FakeClock.ts

/**
 * IClock 테스트 구현.
 * 시간을 프로그래밍 방식으로 제어할 수 있다.
 *
 * 특징:
 * - 결정적: 동일 초기 시각 + 동일 advance 시퀀스 = 동일 결과
 * - now()는 참조 공유를 방지하기 위해 항상 새 Date 인스턴스를 반환
 * - advance()는 양수만 허용 (시간 역행 방지)
 * - setTime()은 임의 시각 설정 가능 (시간 역행 허용 -- 테스트 초기화용)
 */
export class FakeClock implements IClock {
  private currentTime: Date

  /**
   * @param initialTime - 초기 시각. 기본값: 2026-01-01T00:00:00Z
   */
  constructor(initialTime: Date = new Date('2026-01-01T00:00:00Z')) {
    this.currentTime = new Date(initialTime.getTime())
  }

  /**
   * 현재 시각의 복사본을 반환한다.
   * 반환된 Date 객체를 변경해도 내부 상태에 영향을 주지 않는다.
   */
  now(): Date {
    return new Date(this.currentTime.getTime())
  }

  /**
   * 시간을 ms만큼 앞으로 이동한다.
   * @param ms - 이동할 밀리초 (양수만 허용)
   * @throws ms가 음수이면 Error
   */
  advance(ms: number): void {
    if (ms < 0) throw new Error('FakeClock.advance(): ms must be non-negative')
    this.currentTime = new Date(this.currentTime.getTime() + ms)
  }

  /**
   * 특정 시각으로 설정한다.
   * advance()와 달리 시간 역행이 가능하다 (테스트 초기화용).
   * @param time - 설정할 시각
   */
  setTime(time: Date): void {
    this.currentTime = new Date(time.getTime())
  }
}
```

#### RealClock 운영 구현

```typescript
// packages/core/src/infrastructure/RealClock.ts

/**
 * IClock 운영 구현.
 * 시스템 시계의 현재 시각을 반환한다.
 *
 * 모든 서비스의 기본 IClock 구현으로 사용된다.
 * 테스트에서는 FakeClock으로 대체한다.
 */
export class RealClock implements IClock {
  now(): Date {
    return new Date()
  }
}
```

#### IClock + Jest Fake Timers 병행 패턴

IClock은 "현재 시각"을 제어하고, Jest의 `useFakeTimers()`는 "타이머 콜백"을 제어한다. 둘은 독립적으로 동작하며 병행 사용 가능하다.

```typescript
// 예시: JWT 만료 + DELAY 큐 워커 테스트
describe('DelayQueueWorker', () => {
  let clock: FakeClock

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-01-01T12:00:00Z'))
    jest.useFakeTimers()  // setTimeout/setInterval 제어
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('쿨다운 시간 도래 후 거래를 실행해야 한다', async () => {
    // IClock: "현재 시각"을 15분 후로 이동
    clock.advance(15 * 60 * 1000)

    // Jest fake timers: Worker의 폴링 interval을 진행
    await jest.advanceTimersByTimeAsync(10 * 1000)  // 10s 폴링 주기

    // 검증: 워커가 쿨다운 도래를 감지하고 거래를 실행했는지 확인
  })
})
```

### 4.2 IOwnerSigner 인터페이스

#### Owner-only 범위 결정 근거

ISigner를 `IOwnerSigner`(Owner 전용)로 한정한다. Agent 서명은 기존 `ILocalKeyStore.sign()`으로 이미 충족된다.

| 구분 | Agent 서명 | Owner 서명 |
|------|-----------|-----------|
| **용도** | 트랜잭션 서명 (온체인 전송) | 관리 작업 인가 (SIWS/SIWE 메시지 서명) |
| **키 위치** | 로컬 키스토어 (sodium guarded memory) | 외부 지갑 (WalletConnect v2) |
| **서명 알고리즘** | Ed25519 (Solana) / secp256k1 (EVM) | Ed25519 (SIWS) / secp256k1 (SIWE) |
| **호출 주체** | daemon 내부 (`IChainAdapter.signTransaction`) | 외부 (`ownerAuth` 미들웨어에서 검증) |
| **기존 인터페이스** | `ILocalKeyStore.sign(agentId, message)` | 없음 -- 신규 추상화 필요 |
| **테스트 필요** | 이미 MockKeyStore로 mock 가능 | 서명 생성+검증 페어를 mock해야 함 |

**결론:** 두 서명은 용도, 키 위치, 호출 주체가 완전히 다르다. 하나의 인터페이스로 통합하면 오히려 책임이 혼재된다. Agent 서명은 이미 `ILocalKeyStore.sign()`으로 추상화되어 있으므로, 새 인터페이스는 Owner 서명만 담당한다.

**명명 규칙:** 인터페이스 이름은 `IOwnerSigner`, 파일명은 `ISigner.ts`로 유지하여 CONTEXT.md와의 일관성을 보존한다.

#### 인터페이스 정의

```typescript
// packages/core/src/interfaces/ISigner.ts

/**
 * Owner 서명 생성 추상화.
 *
 * Owner의 외부 지갑(WalletConnect v2)에서 SIWS/SIWE 메시지에 서명하는
 * 동작을 추상화한다. ownerAuth 미들웨어가 요청 헤더의 서명을 검증할 때,
 * 테스트에서는 FakeOwnerSigner로 서명을 생성하여 요청을 구성한다.
 *
 * DI 주입:
 *   운영 환경 -> WalletConnect signMessage 호출 (클라이언트 측)
 *   테스트 환경 -> FakeOwnerSigner (고정 키쌍으로 직접 서명)
 *
 * 참고: Agent 서명은 ILocalKeyStore.sign()으로 이미 충족되므로
 *       이 인터페이스의 범위가 아니다.
 */
export interface IOwnerSigner {
  /** Owner 지갑 주소 */
  readonly address: string

  /** Owner 지갑의 체인 타입 */
  readonly chain: 'solana' | 'ethereum'

  /**
   * 메시지에 서명한다.
   * SIWS/SIWE 형식의 메시지를 서명하여 ownerAuth 페이로드에 포함시킨다.
   *
   * @param message - 서명할 메시지 (UTF-8 문자열)
   * @returns 서명 문자열 (Solana: Base58 인코딩, Ethereum: 0x hex 인코딩)
   */
  signMessage(message: string): Promise<string>
}
```

#### FakeOwnerSigner 테스트 구현

```typescript
// packages/core/src/testing/FakeSigner.ts
import nacl from 'tweetnacl'
import bs58 from 'bs58'

/**
 * IOwnerSigner 테스트 구현.
 * 고정 시드(0x42 * 32바이트)에서 결정적 키쌍을 생성하여
 * 테스트 재현성을 보장한다.
 *
 * 특징:
 * - 동일 메시지 -> 동일 서명 (결정적)
 * - Solana: Ed25519 서명, Base58 인코딩
 * - Ethereum: secp256k1 서명, 0x hex 인코딩 (향후 @noble/secp256k1 사용)
 * - 생성된 서명은 address로 검증 가능 (서명-검증 쌍 유효)
 *
 * 고정 시드: new Uint8Array(32).fill(0x42)
 * Solana 주소: 이 시드에서 파생된 Ed25519 공개키의 Base58 인코딩
 * Ethereum 주소: 향후 secp256k1 공개키에서 Keccak256 -> 하위 20바이트 -> 0x 접두어
 */
export class FakeOwnerSigner implements IOwnerSigner {
  readonly address: string
  readonly chain: 'solana' | 'ethereum'
  private readonly secretKey: Uint8Array
  private readonly publicKey: Uint8Array

  /**
   * @param chain - 체인 타입. 기본값: 'solana'
   */
  constructor(chain: 'solana' | 'ethereum' = 'solana') {
    this.chain = chain

    // 고정 시드에서 결정적 키쌍 생성
    const seed = new Uint8Array(32).fill(0x42)

    if (chain === 'solana') {
      const keypair = nacl.sign.keyPair.fromSeed(seed)
      this.secretKey = keypair.secretKey
      this.publicKey = keypair.publicKey
      this.address = bs58.encode(keypair.publicKey)
    } else {
      // Ethereum: 향후 @noble/secp256k1로 구현
      // v0.2에서는 Solana 우선이므로 EVM은 placeholder
      const keypair = nacl.sign.keyPair.fromSeed(seed)
      this.secretKey = keypair.secretKey
      this.publicKey = keypair.publicKey
      this.address = '0x' + Buffer.from(keypair.publicKey.slice(0, 20)).toString('hex')
    }
  }

  /**
   * 메시지에 서명한다.
   * Ed25519 nacl.sign.detached로 서명하고 체인별 인코딩을 적용한다.
   */
  async signMessage(message: string): Promise<string> {
    const messageBytes = new TextEncoder().encode(message)
    const signature = nacl.sign.detached(messageBytes, this.secretKey)

    if (this.chain === 'solana') {
      return bs58.encode(signature)
    } else {
      return '0x' + Buffer.from(signature).toString('hex')
    }
  }

  /**
   * 서명 검증 (테스트 유틸리티).
   * Contract Test에서 서명-검증 쌍이 유효한지 확인하는 데 사용한다.
   * IOwnerSigner 인터페이스에는 포함되지 않는다.
   */
  verify(message: string, signature: string): boolean {
    const messageBytes = new TextEncoder().encode(message)
    let sigBytes: Uint8Array

    if (this.chain === 'solana') {
      sigBytes = bs58.decode(signature)
    } else {
      sigBytes = new Uint8Array(Buffer.from(signature.slice(2), 'hex'))
    }

    return nacl.sign.detached.verify(messageBytes, sigBytes, this.publicKey)
  }
}
```

#### IOwnerSigner 사용 맥락

```
테스트에서의 Owner 인가 요청 구성 흐름:

1. FakeOwnerSigner 인스턴스 생성
2. SIWS/SIWE 메시지 템플릿에 address, nonce, timestamp 주입
3. signer.signMessage(message)로 서명 생성
4. { message, signature, address } 페이로드를 ownerAuth 헤더에 포함
5. ownerAuth 미들웨어가 address로 서명을 검증 -> 통과

운영에서의 Owner 인가 흐름:
1. 클라이언트(Tauri/CLI)가 WalletConnect v2로 Owner 지갑 연결
2. 지갑 앱에서 SIWS/SIWE 메시지에 서명 (사용자 확인)
3. 서명된 페이로드를 daemon API 헤더에 포함
4. ownerAuth 미들웨어가 검증 -> 통과
```

---

## 5. Contract Test 전략 (MOCK-04)

### 5.1 Contract Test란

Contract Test는 인터페이스의 계약(Contract)을 정의하는 공유 테스트 함수를 만들고, Mock 구현과 실제 구현 모두가 동일한 테스트를 통과하는지 검증하는 방법이다.

**핵심 가치:** Mock이 실제 구현과 동일하게 동작한다는 보장이 있어야, Mock을 사용하는 Unit 테스트 결과를 신뢰할 수 있다.

```
┌─────────────────────────────────┐
│  Contract Test Suite            │
│  (인터페이스 계약 정의)          │
│                                 │
│  chainAdapterContractTests()    │
│  policyEngineContractTests()    │
│  ...                            │
└──────────┬──────────────────────┘
           │ 동일 테스트 실행
     ┌─────┴──────┐
     │            │
┌────▼────┐  ┌───▼──────────┐
│  Mock   │  │  실제 구현     │
│ 구현    │  │ (Solana 등)   │
└─────────┘  └──────────────┘
     │            │
     ▼            ▼
  모두 PASS → Mock을 신뢰할 수 있음
```

### 5.2 패턴: 팩토리 함수 기반 공유 스위트

각 인터페이스에 대해 Contract Test 공유 함수를 만든다. 팩토리 함수가 구현체 인스턴스를 생성하고, 공유 스위트가 인터페이스 계약을 검증한다.

#### 파일 배치

```
packages/core/__tests__/contracts/
  ├── chain-adapter.contract.ts       # chainAdapterContractTests(factory, options)
  ├── policy-engine.contract.ts       # policyEngineContractTests(factory)
  ├── notification-channel.contract.ts # notificationChannelContractTests(factory)
  ├── clock.contract.ts               # clockContractTests(factory)
  └── signer.contract.ts              # ownerSignerContractTests(factory)
```

### 5.3 IChainAdapter Contract Test

**Locked Decision:** 13개 메소드 전체에 대해 Contract Test를 작성한다.

#### 함수 시그니처

```typescript
// packages/core/__tests__/contracts/chain-adapter.contract.ts
import type { IChainAdapter } from '../../src/interfaces/IChainAdapter'

interface ChainAdapterContractOptions {
  /** 네트워크 의존 테스트를 건너뛸지 여부. Mock은 true, 실제 구현은 false */
  skipNetworkTests?: boolean
  /** connect에 사용할 RPC URL (skipNetworkTests=false일 때 필수) */
  rpcUrl?: string
  /** 테스트에 사용할 유효한 주소 */
  validAddress?: string
  /** 테스트에 사용할 유효한 개인키 */
  privateKey?: Uint8Array
}

export function chainAdapterContractTests(
  factory: () => IChainAdapter | Promise<IChainAdapter>,
  options?: ChainAdapterContractOptions
): void
```

#### 테스트 케이스 구조 (describe/test)

```typescript
chainAdapterContractTests(factory, options?):

  describe('식별 프로퍼티')
    test('chain이 유효한 ChainType이어야 한다')
      // expect(['solana','ethereum','polygon','arbitrum']).toContain(adapter.chain)
    test('network가 유효한 NetworkType이어야 한다')
      // expect(['mainnet','mainnet-beta','devnet','testnet','sepolia']).toContain(adapter.network)

  describe('연결 관리')
    test('connect 전 isConnected는 false여야 한다')
      // expect(adapter.isConnected()).toBe(false)
    test('connect 후 isConnected는 true여야 한다')  // skipNetworkTests 아닌 경우
      // await adapter.connect(options.rpcUrl)
      // expect(adapter.isConnected()).toBe(true)
    test('disconnect 후 isConnected는 false여야 한다')  // skipNetworkTests 아닌 경우
      // await adapter.disconnect()
      // expect(adapter.isConnected()).toBe(false)
    test('getHealth는 healthy와 latency를 반환해야 한다')  // skipNetworkTests 아닌 경우
      // const health = await adapter.getHealth()
      // expect(typeof health.healthy).toBe('boolean')
      // expect(typeof health.latency).toBe('number')

  describe('주소 검증')
    test('isValidAddress는 boolean을 반환해야 한다')
      // expect(typeof adapter.isValidAddress('any-address')).toBe('boolean')
    test('빈 문자열은 false를 반환해야 한다')
      // expect(adapter.isValidAddress('')).toBe(false)
    test('유효한 주소는 true를 반환해야 한다')  // options.validAddress 사용
      // if (options?.validAddress) expect(adapter.isValidAddress(options.validAddress)).toBe(true)

  describe('잔액 조회')  // skipNetworkTests 아닌 경우
    test('getBalance는 BalanceInfo를 반환해야 한다')
      // const balance = await adapter.getBalance(options.validAddress)
      // expect(typeof balance.balance).toBe('bigint')
      // expect(typeof balance.decimals).toBe('number')
      // expect(typeof balance.symbol).toBe('string')

  describe('트랜잭션 파이프라인')  // skipNetworkTests 아닌 경우 전체, Mock은 부분
    test('buildTransaction은 UnsignedTransaction을 반환해야 한다')
      // const tx = await adapter.buildTransaction(request)
      // expect(tx.chain).toBe(adapter.chain)
      // expect(tx.serialized).toBeInstanceOf(Uint8Array)
      // expect(typeof tx.estimatedFee).toBe('bigint')
    test('simulateTransaction은 SimulationResult를 반환해야 한다')
      // const result = await adapter.simulateTransaction(tx)
      // expect(typeof result.success).toBe('boolean')
      // expect(Array.isArray(result.logs)).toBe(true)
    test('signTransaction은 Uint8Array를 반환해야 한다')
      // const signed = await adapter.signTransaction(tx, privateKey)
      // expect(signed).toBeInstanceOf(Uint8Array)
      // expect(signed.length).toBeGreaterThan(0)
    test('submitTransaction은 SubmitResult를 반환해야 한다')
      // const result = await adapter.submitTransaction(signed)
      // expect(typeof result.txHash).toBe('string')
      // expect(['submitted','confirmed','finalized']).toContain(result.status)
    test('getTransactionStatus는 SubmitResult를 반환해야 한다')
      // const status = await adapter.getTransactionStatus(result.txHash)
      // expect(['submitted','confirmed','finalized','failed']).toContain(status.status)
    test('waitForConfirmation은 SubmitResult를 반환해야 한다')
      // const final = await adapter.waitForConfirmation(result.txHash, 60000)
      // expect(typeof final.txHash).toBe('string')

  describe('수수료 추정')
    test('estimateFee는 bigint를 반환해야 한다')
      // const fee = await adapter.estimateFee(request)
      // expect(typeof fee).toBe('bigint')
      // expect(fee).toBeGreaterThanOrEqual(0n)

  describe('에러 처리')
    test('연결 안 된 상태에서 getBalance는 CHAIN_NOT_CONNECTED를 throw해야 한다')
      // 새 어댑터 (connect하지 않음)
      // await expect(adapter.getBalance('any')).rejects.toThrow(/CHAIN_NOT_CONNECTED|not connected/i)
    test('잘못된 주소로 buildTransaction은 INVALID_ADDRESS를 throw해야 한다')
      // await expect(adapter.buildTransaction({ from: 'invalid', to: 'invalid', amount: 0n }))
      //   .rejects.toThrow(/INVALID_ADDRESS/i)
```

#### 실행 대상

| 구현체 | 패키지 | 실행 레벨 | skipNetworkTests | 비고 |
|--------|--------|----------|-----------------|------|
| MockChainAdapter | `core/__tests__/contracts/` | Unit | true | 모든 메소드 canned response |
| SolanaAdapter | `adapters/solana/__tests__/contracts/` | Chain Integration | false | Devnet RPC 연결 |
| EvmAdapterStub | `adapters/evm/__tests__/contracts/` | Unit | true | 모든 메소드 `CHAIN_NOT_SUPPORTED` throw |

```typescript
// packages/core/__tests__/contracts/mock-chain-adapter.contract.test.ts
import { chainAdapterContractTests } from './chain-adapter.contract'
import { MockChainAdapter } from '../../src/testing/MockChainAdapter'

describe('MockChainAdapter Contract Tests', () => {
  chainAdapterContractTests(
    () => new MockChainAdapter('solana', 'devnet'),
    { skipNetworkTests: true }
  )
})
```

```typescript
// packages/adapters/solana/__tests__/contracts/solana-adapter.contract.test.ts
import { chainAdapterContractTests } from '@waiaas/core/__tests__/contracts/chain-adapter.contract'
import { SolanaAdapter } from '../../src/adapter'

describe('SolanaAdapter Contract Tests', () => {
  chainAdapterContractTests(
    () => new SolanaAdapter('devnet'),
    {
      skipNetworkTests: false,
      rpcUrl: 'https://api.devnet.solana.com',
      validAddress: 'So11111111111111111111111111111112',
      privateKey: new Uint8Array(64), // 테스트 키쌍
    }
  )
})
```

```typescript
// packages/adapters/evm/__tests__/contracts/evm-stub.contract.test.ts
import { chainAdapterContractTests } from '@waiaas/core/__tests__/contracts/chain-adapter.contract'
import { EvmAdapterStub } from '../../src/adapter-stub'

describe('EvmAdapterStub Contract Tests', () => {
  // EvmAdapterStub은 모든 메소드에서 CHAIN_NOT_SUPPORTED를 throw한다.
  // Contract Test의 기본 프로퍼티 검증만 통과하고 나머지는 skip한다.
  chainAdapterContractTests(
    () => new EvmAdapterStub('ethereum', 'sepolia'),
    { skipNetworkTests: true }
  )
})
```

### 5.4 IPolicyEngine Contract Test

#### 함수 시그니처

```typescript
// packages/core/__tests__/contracts/policy-engine.contract.ts
import type { IPolicyEngine } from '../../src/interfaces/policy-engine'

export function policyEngineContractTests(
  factory: () => IPolicyEngine | Promise<IPolicyEngine>
): void
```

#### 테스트 케이스 구조

```typescript
policyEngineContractTests(factory):

  describe('evaluate 기본 계약')
    test('evaluate는 PolicyDecision을 반환해야 한다')
      // const decision = await engine.evaluate('agent-001', { type: 'transfer', amount: '1000000000', to: '...', chain: 'solana' })
      // expect(typeof decision.allowed).toBe('boolean')
      // expect(['INSTANT','NOTIFY','DELAY','APPROVAL']).toContain(decision.tier)
    test('PolicyDecision에 allowed 필드가 존재해야 한다')
      // expect(decision).toHaveProperty('allowed')
    test('PolicyDecision에 tier 필드가 존재해야 한다')
      // expect(decision).toHaveProperty('tier')
    test('DENY 결과에 reason이 존재해야 한다')
      // if (!decision.allowed) expect(typeof decision.reason).toBe('string')

  describe('에러 처리')
    test('빈 agentId에 대해 에러를 반환하거나 INSTANT을 반환해야 한다')
      // 구현에 따라 에러 또는 기본 INSTANT 허용
```

#### 실행 대상

| 구현체 | 실행 레벨 | 비고 |
|--------|----------|------|
| MockPolicyEngine | Unit | 기본 INSTANT, `setNextDecision()`으로 제어 |
| DefaultPolicyEngine | Unit | 모든 요청 INSTANT passthrough |
| DatabasePolicyEngine | Integration | 실제 SQLite + policies 테이블 |

### 5.5 INotificationChannel Contract Test

#### 함수 시그니처

```typescript
// packages/core/__tests__/contracts/notification-channel.contract.ts
import type { INotificationChannel } from '../../src/interfaces/INotificationChannel'

export function notificationChannelContractTests(
  factory: () => INotificationChannel | Promise<INotificationChannel>
): void
```

#### 테스트 케이스 구조

```typescript
notificationChannelContractTests(factory):

  describe('readonly 프로퍼티')
    test('type이 유효한 채널 타입이어야 한다')
      // expect(['TELEGRAM','DISCORD','NTFY']).toContain(channel.type)
    test('name이 비어있지 않은 문자열이어야 한다')
      // expect(typeof channel.name).toBe('string')
      // expect(channel.name.length).toBeGreaterThan(0)
    test('channelId가 비어있지 않은 문자열이어야 한다')
      // expect(typeof channel.channelId).toBe('string')
      // expect(channel.channelId.length).toBeGreaterThan(0)

  describe('send')
    test('send는 NotificationResult를 반환해야 한다')
      // const result = await channel.send(testMessage)
      // expect(typeof result.success).toBe('boolean')
      // expect(typeof result.channelId).toBe('string')
    test('성공 시 success가 true여야 한다')
      // expect(result.success).toBe(true)

  describe('healthCheck')
    test('healthCheck는 boolean을 반환해야 한다')
      // const healthy = await channel.healthCheck()
      // expect(typeof healthy).toBe('boolean')
```

#### 실행 대상

| 구현체 | 실행 레벨 | 비고 |
|--------|----------|------|
| MockNotificationChannel | Unit | 전송 기록 + 실패 시뮬레이션 |

참고: TelegramChannel, DiscordChannel, NtfyChannel은 외부 서비스에 의존하므로 Contract Test에서 실제 전송을 하지 않는다(Locked Decision). Mock이 계약을 충족하면, 실제 채널 어댑터는 HTTP 통신 로직만 별도로 검증한다.

### 5.6 IClock Contract Test

#### 함수 시그니처

```typescript
// packages/core/__tests__/contracts/clock.contract.ts
import type { IClock } from '../../src/interfaces/IClock'

export function clockContractTests(
  factory: () => IClock
): void
```

#### 테스트 케이스 구조

```typescript
clockContractTests(factory):

  describe('now() 기본 계약')
    test('now()는 Date 인스턴스를 반환해야 한다')
      // const result = clock.now()
      // expect(result).toBeInstanceOf(Date)
    test('now().getTime()이 유효해야 한다 (NaN 아님, > 0)')
      // const time = clock.now().getTime()
      // expect(Number.isNaN(time)).toBe(false)
      // expect(time).toBeGreaterThan(0)
    test('연속 호출 시 시간이 역행하지 않아야 한다 (t2 >= t1)')
      // const t1 = clock.now()
      // const t2 = clock.now()
      // expect(t2.getTime()).toBeGreaterThanOrEqual(t1.getTime())
    test('now()는 호출할 때마다 새 인스턴스를 반환해야 한다 (참조 독립)')
      // const d1 = clock.now()
      // const d2 = clock.now()
      // expect(d1).not.toBe(d2)  // 참조 비교
```

#### 실행 대상

| 구현체 | 실행 레벨 | 비고 |
|--------|----------|------|
| FakeClock | Unit | advance/setTime으로 시간 제어 |
| RealClock | Unit | 실제 시스템 시계 사용 |

### 5.7 IOwnerSigner Contract Test

#### 함수 시그니처

```typescript
// packages/core/__tests__/contracts/signer.contract.ts
import type { IOwnerSigner } from '../../src/interfaces/ISigner'

interface OwnerSignerContractOptions {
  /** 서명 검증 함수. 구현체가 제공하는 검증 로직 */
  verifySignature?: (message: string, signature: string, address: string, chain: string) => boolean
}

export function ownerSignerContractTests(
  factory: () => IOwnerSigner | Promise<IOwnerSigner>,
  options?: OwnerSignerContractOptions
): void
```

#### 테스트 케이스 구조

```typescript
ownerSignerContractTests(factory, options?):

  describe('readonly 프로퍼티')
    test('address가 비어있지 않은 문자열이어야 한다')
      // expect(typeof signer.address).toBe('string')
      // expect(signer.address.length).toBeGreaterThan(0)
    test('chain이 solana 또는 ethereum이어야 한다')
      // expect(['solana','ethereum']).toContain(signer.chain)

  describe('signMessage')
    test('signMessage는 비어있지 않은 문자열을 반환해야 한다 (Promise)')
      // const sig = await signer.signMessage('test message')
      // expect(typeof sig).toBe('string')
      // expect(sig.length).toBeGreaterThan(0)
    test('동일 메시지에 동일 서명을 반환해야 한다 (결정적)')
      // const sig1 = await signer.signMessage('deterministic test')
      // const sig2 = await signer.signMessage('deterministic test')
      // expect(sig1).toBe(sig2)
    test('다른 메시지에 다른 서명을 반환해야 한다')
      // const sig1 = await signer.signMessage('message A')
      // const sig2 = await signer.signMessage('message B')
      // expect(sig1).not.toBe(sig2)
    test('signMessage 결과가 address로 검증 가능해야 한다 (서명-검증 쌍)')
      // if (options?.verifySignature) {
      //   const message = 'verify this message'
      //   const sig = await signer.signMessage(message)
      //   expect(options.verifySignature(message, sig, signer.address, signer.chain)).toBe(true)
      // }
```

#### 실행 대상

| 구현체 | 실행 레벨 | 비고 |
|--------|----------|------|
| FakeOwnerSigner | Unit | 고정 시드 Ed25519 키쌍, `verify()` 메소드 제공 |

참고: 운영 환경에서 Owner 서명은 클라이언트 측(Tauri/CLI)에서 WalletConnect v2를 통해 생성되므로, 서버 측 Contract Test 대상은 FakeOwnerSigner뿐이다. 서명 검증 로직(ownerAuth 미들웨어)은 별도 Unit/Integration 테스트에서 FakeOwnerSigner가 생성한 서명으로 검증한다.

### 5.8 Contract Test 실행 전략

| 실행 시점 | 대상 | Mock 구현 | 실제 구현 |
|----------|------|----------|----------|
| **매 커밋 (Unit)** | 5개 인터페이스 전체 | MockChainAdapter, MockPolicyEngine, MockNotificationChannel, FakeClock, FakeOwnerSigner | DefaultPolicyEngine, RealClock |
| **매 PR (Integration)** | IChainAdapter, IPolicyEngine, ILocalKeyStore | - | SolanaAdapter (Devnet), DatabasePolicyEngine (SQLite), LocalKeyStore (sodium-native) |
| **nightly (Chain Integration)** | IChainAdapter | - | SolanaAdapter (Devnet 실제 트랜잭션) |

**의미:** Mock 구현과 실제 구현이 동일한 Contract Test를 통과하면, Mock을 사용하는 Unit 테스트 결과를 신뢰할 수 있다. Contract Test가 실패하면 Mock이 실제 구현과 괴리가 생겼다는 의미이므로, Mock을 업데이트하거나 인터페이스 변경을 재검토해야 한다.

### 5.9 Contract Test 파일 구조 전체

```
packages/
├── core/
│   ├── src/
│   │   ├── interfaces/
│   │   │   ├── IClock.ts              # now(): Date
│   │   │   ├── ISigner.ts             # IOwnerSigner: address, chain, signMessage
│   │   │   ├── IChainAdapter.ts       # 13 메소드 + 2 props
│   │   │   ├── IPolicyEngine.ts       # evaluate()
│   │   │   ├── INotificationChannel.ts # send, healthCheck + 3 props
│   │   │   └── ILocalKeyStore.ts      # unlock, lock, sign, getPublicKey, addAgent, exportKeyFile
│   │   └── testing/
│   │       ├── FakeClock.ts           # IClock 테스트 구현
│   │       ├── FakeSigner.ts          # IOwnerSigner 테스트 구현
│   │       ├── MockChainAdapter.ts    # IChainAdapter mock
│   │       ├── MockNotification.ts    # INotificationChannel mock
│   │       ├── MockPolicyEngine.ts    # IPolicyEngine mock
│   │       ├── MockKeyStore.ts        # ILocalKeyStore mock
│   │       ├── factories.ts          # 테스트 데이터 팩토리
│   │       └── index.ts              # barrel export
│   └── __tests__/
│       └── contracts/
│           ├── chain-adapter.contract.ts
│           ├── policy-engine.contract.ts
│           ├── notification-channel.contract.ts
│           ├── clock.contract.ts
│           ├── signer.contract.ts
│           ├── mock-chain-adapter.contract.test.ts     # MockChainAdapter 검증
│           ├── mock-policy-engine.contract.test.ts     # MockPolicyEngine 검증
│           ├── mock-notification.contract.test.ts      # MockNotificationChannel 검증
│           ├── fake-clock.contract.test.ts             # FakeClock + RealClock 검증
│           └── fake-signer.contract.test.ts            # FakeOwnerSigner 검증
│
├── adapters/
│   ├── solana/__tests__/contracts/
│   │   └── solana-adapter.contract.test.ts             # SolanaAdapter 검증
│   └── evm/__tests__/contracts/
│       └── evm-stub.contract.test.ts                   # EvmAdapterStub 검증
│
└── daemon/__tests__/contracts/
    ├── database-policy-engine.contract.test.ts          # DatabasePolicyEngine 검증
    └── local-keystore.contract.test.ts                  # LocalKeyStore 검증
```

---

## 6. 요구사항 충족 확인

| 요구사항 | 충족 | 근거 |
|---------|------|------|
| MOCK-01 | 충족 | 섹션 2: 5개 외부 의존성 x 6개 테스트 레벨 Mock 매트릭스 + 셀별 근거 |
| MOCK-02 | 충족 | 섹션 3: 4개 기존 인터페이스 Mock 가능성(HIGH/MEDIUM) + 메소드별 분석 + Mock 클래스 설계 |
| MOCK-03 | 충족 | 섹션 4: IClock (now(): Date) + FakeClock/RealClock + IOwnerSigner (address, chain, signMessage) + FakeOwnerSigner |
| MOCK-04 | 충족 | 섹션 5: 5개 인터페이스 전체 팩토리 함수 기반 Contract Test + describe/test 구조 + 실행 전략 |

---

## 7. 참조 문서 관계

```
┌──────────────────────────────────────────────────────────┐
│  42-mock-boundaries-interfaces-contracts.md (이 문서)      │
│  Mock 경계, IClock/IOwnerSigner, Contract Test 전략       │
└───────┬──────────────┬──────────────┬────────────────────┘
        │              │              │
   참조 ▼         참조 ▼         참조 ▼
┌──────────┐  ┌──────────┐  ┌──────────────┐
│ CORE-04  │  │ CORE-03  │  │  LOCK-MECH   │
│ IChain   │  │ IKeyStore│  │ IPolicyEngine│
│ Adapter  │  │          │  │              │
└──────────┘  └──────────┘  └──────────────┘
                                    │
                               참조 ▼
                          ┌──────────────┐
                          │  NOTI-ARCH   │
                          │ INotification│
                          │ Channel      │
                          └──────────────┘

  상호 참조
┌──────────────────────────────────────┐
│ 41-test-levels-matrix-coverage.md    │
│ 6개 테스트 레벨 + 커버리지 목표       │──→ 매트릭스 레벨 정의 참조
└──────────────────────────────────────┘
```
