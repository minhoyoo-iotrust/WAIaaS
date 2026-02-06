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
