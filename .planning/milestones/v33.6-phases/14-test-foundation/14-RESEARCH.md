# Phase 14: 테스트 기반 정의 - Research

**Researched:** 2026-02-06
**Domain:** 테스트 전략 프레임워크 설계 (Jest, Contract Testing, Coverage Strategy, DI Interfaces)
**Confidence:** HIGH

## Summary

Phase 14는 WAIaaS 전체 테스트 전략의 뼈대를 확정하는 설계 문서화 페이즈이다. 코드를 작성하지 않으며, 이후 Phase 15~18에서 참조할 테스트 레벨 정의, 모듈별 매트릭스, Mock 경계, 커버리지 목표, IClock/ISigner 인터페이스 스펙, Contract Test 전략을 문서로 산출한다.

핵심 기술 스택은 Jest 30 (2025-06 릴리스, Node.js 18+ / TS 5.4+ 호환)이며, @swc/jest 트랜스포머로 빠른 실행 속도를 확보한다. 프로젝트가 Node.js 22 LTS + pnpm + Turborepo 모노레포이므로 Jest 30의 요구사항과 완벽히 호환된다. Contract Test는 Jest의 "shared test suite" 패턴(팩토리 함수 기반)으로 5개 인터페이스(IChainAdapter, IPolicyEngine, INotificationChannel, IClock, ISigner)에 대해 Mock과 실제 구현의 동작 일치를 검증한다.

**Primary recommendation:** Jest 30 + @swc/jest로 테스트 인프라를 구성하고, 보안 위험도 기반 3-tier 커버리지(90%/80%/70%)를 패키지별로 적용하며, 5개 인터페이스에 대해 팩토리 함수 기반 Contract Test 전략을 수립한다.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **커버리지 기준 철학**: 보안 위험도 기반 차등 적용 (보안 critical 90%+, 일반 80%, 유틸리티/CLI 70%)
- **커버리지 측정 범위**: Unit + Integration만 (E2E는 별도 관리)
- **CI 게이트**: 단계적 적용 -- 초기 soft gate(경고만), 안정화 후 hard gate(PR 차단)
- **테스트 프레임워크**: Jest
- **로컬 개발**: Watch 모드 기본
- **실행 빈도**: Unit 매 커밋, Integration 매 PR, E2E/Security nightly/릴리스
- **블록체인 RPC**: Mock-first (Unit/Integration Mock, E2E에서만 Local Validator, Phase 16에서 상세화)
- **알림 채널**: 완전 Mock (모든 레벨에서 Mock, 실제 채널 호출 없음)
- **시간(IClock)**: DI 인터페이스, now(): Date만 제공, setTimeout/setInterval은 Jest mock 사용
- **Owner 서명(ISigner)**: DI 인터페이스로 주입, 테스트 시 고정 키쌍
- **파일시스템**: 레벨별 분리 (Unit: 메모리 기반 mock, Integration: 임시 디렉토리)
- **Contract Test**: 전체 인터페이스 적용 (IChainAdapter, IPolicyEngine, INotificationChannel, IClock, ISigner)
- **IChainAdapter Mock 검증**: 13개 메소드 전체에 대해 Mock 구현 가능성과 Contract Test 작성

### Claude's Discretion
- 커버리지 측정 단위 (패키지 단위 vs 패키지+모듈 혼합)
- 속도 vs 충실도 균형에서의 테스트 레벨별 최적화 전략
- ISigner 인터페이스의 Owner 전용 vs Owner+Agent 통합 범위 결정
- 파일시스템 Mock의 구체적 구현 방식

### Deferred Ideas (OUT OF SCOPE)
None -- 논의가 Phase 14 범위 내에 머물렀음
</user_constraints>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jest | 30.x (30.2.0) | 테스트 프레임워크 | User 결정. 2025-06 릴리스, Node 18+ 호환, 37% 성능 향상, 77% 메모리 절감 |
| @swc/jest | latest | TypeScript 트랜스포머 | ts-jest 대비 ~40% CI 시간 절감, Rust 기반 컴파일러, Jest 30 호환 |
| @swc/core | latest | SWC 컴파일러 코어 | @swc/jest 런타임 의존성 |
| jest-mock-extended | 4.x | TypeScript 인터페이스 mock | 타입 안전한 interface mocking, Jest 30 지원 (v4.0.0) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| memfs | latest | 메모리 기반 파일시스템 mock | Unit 테스트에서 키스토어/config 파일 읽기쓰기 mock |
| @types/jest | 30.x | Jest TypeScript 타입 정의 | 개발 시 자동완성/타입 체크 |

### Not Needed (Don't Install)

| Library | Reason |
|---------|--------|
| ts-jest | @swc/jest가 더 빠르고 drop-in 대체 가능. 타입 체크는 별도 tsc --noEmit으로 수행 |
| vitest | User가 Jest로 결정함. 대안 탐색 불필요 |
| jest-pact | PACT 스타일 contract test 불필요. 자체 shared test suite 패턴으로 충분 |
| mock-fs | memfs가 더 활발히 유지보수되고 Jest 통합 패턴 확립 |

**Installation (구현 단계에서):**
```bash
pnpm add -Dw jest@^30.0.0 @swc/jest @swc/core jest-mock-extended@^4.0.0 @types/jest memfs
```

---

## Architecture Patterns

### 테스트 디렉토리 구조 (패키지별)

```
packages/
├── core/
│   ├── src/
│   │   ├── interfaces/
│   │   │   ├── IClock.ts              # [신규] 시간 추상화
│   │   │   ├── ISigner.ts             # [신규] 서명 추상화
│   │   │   ├── IChainAdapter.ts       # [기존] 체인 어댑터
│   │   │   ├── IPolicyEngine.ts       # [기존] 정책 엔진
│   │   │   ├── INotificationChannel.ts # [기존] 알림 채널
│   │   │   └── ILocalKeyStore.ts      # [기존] 키스토어
│   │   └── testing/                   # 테스트 유틸리티 (패키지 export)
│   │       ├── FakeClock.ts           # IClock 테스트 구현
│   │       ├── FakeSigner.ts          # ISigner 테스트 구현
│   │       ├── MockChainAdapter.ts    # IChainAdapter mock
│   │       ├── MockNotification.ts    # INotificationChannel mock
│   │       ├── MockPolicyEngine.ts    # IPolicyEngine mock
│   │       ├── factories.ts          # 테스트 데이터 팩토리
│   │       └── index.ts              # 테스트 유틸 barrel export
│   ├── __tests__/
│   │   ├── unit/
│   │   └── contracts/                # Contract Test 공유 스위트
│   │       ├── chain-adapter.contract.ts
│   │       ├── policy-engine.contract.ts
│   │       ├── notification-channel.contract.ts
│   │       ├── clock.contract.ts
│   │       └── signer.contract.ts
│   └── jest.config.ts
│
├── daemon/
│   ├── __tests__/
│   │   ├── unit/
│   │   │   ├── services/
│   │   │   ├── middleware/
│   │   │   └── infrastructure/
│   │   └── integration/
│   │       ├── database/
│   │       ├── api/
│   │       └── lifecycle/
│   └── jest.config.ts
│
├── adapters/solana/
│   ├── __tests__/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── contracts/               # Contract Test 실행
│   │       └── solana-adapter.contract.test.ts
│   └── jest.config.ts
│
├── cli/
│   ├── __tests__/
│   │   └── integration/
│   └── jest.config.ts
│
├── sdk/
│   ├── __tests__/
│   │   ├── unit/
│   │   └── integration/
│   └── jest.config.ts
│
└── mcp/
    ├── __tests__/
    │   ├── unit/
    │   └── integration/
    └── jest.config.ts
```

### Pattern 1: Jest 30 모노레포 설정

**What:** 루트 Jest 설정에서 `projects`로 각 패키지를 참조하고, 각 패키지에 개별 jest.config.ts를 배치하는 패턴
**When to use:** pnpm + Turborepo 모노레포에서 패키지별 독립 테스트 실행 + 루트에서 전체 실행 모두 지원해야 할 때

```typescript
// jest.config.base.ts (루트, 공유 설정)
import type { Config } from 'jest'

const baseConfig: Config = {
  transform: {
    '^.+\\.tsx?$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        target: 'es2022',
      },
    }],
  },
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // Jest 30: 글로벌 정리 설정
  testEnvironmentOptions: {
    globalsCleanup: 'soft',
  },
}

export default baseConfig
```

```typescript
// jest.config.ts (루트, 모노레포 전체 실행)
import type { Config } from 'jest'

const config: Config = {
  projects: [
    '<rootDir>/packages/core',
    '<rootDir>/packages/daemon',
    '<rootDir>/packages/adapters/solana',
    '<rootDir>/packages/adapters/evm',
    '<rootDir>/packages/cli',
    '<rootDir>/packages/sdk',
    '<rootDir>/packages/mcp',
  ],
}

export default config
```

```typescript
// packages/daemon/jest.config.ts (패키지별)
import type { Config } from 'jest'
import baseConfig from '../../jest.config.base'

const config: Config = {
  ...baseConfig,
  displayName: '@waiaas/daemon',
  rootDir: '.',
  testMatch: [
    '<rootDir>/__tests__/**/*.test.ts',
    '<rootDir>/__tests__/**/*.spec.ts',
  ],
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/*.d.ts',
    '!<rootDir>/src/**/index.ts',  // barrel exports 제외
  ],
  // 패키지별 모듈 매핑
  moduleNameMapper: {
    '^@waiaas/core(.*)$': '<rootDir>/../core/src$1',
  },
}

export default config
```

### Pattern 2: Contract Test (팩토리 함수 기반 공유 스위트)

**What:** 인터페이스 계약을 정의하는 공유 테스트 함수를 만들고, 각 구현체가 이 함수를 호출하여 동일한 테스트를 통과하는지 검증
**When to use:** IChainAdapter, IPolicyEngine 등 여러 구현체(Mock 포함)가 존재하는 인터페이스의 동작 일치 보장

```typescript
// packages/core/__tests__/contracts/chain-adapter.contract.ts
import type { IChainAdapter } from '../../src/interfaces/IChainAdapter'

/**
 * IChainAdapter Contract Test Suite.
 * Mock과 실제 구현 모두 이 테스트를 통과해야 한다.
 *
 * @param factory - IChainAdapter 구현체를 생성하는 팩토리 함수
 * @param options - 테스트 환경 설정 (연결 URL 등)
 */
export function chainAdapterContractTests(
  factory: () => IChainAdapter | Promise<IChainAdapter>,
  options?: { skipNetworkTests?: boolean }
) {
  let adapter: IChainAdapter

  beforeEach(async () => {
    adapter = await factory()
  })

  describe('식별 프로퍼티', () => {
    test('chain이 유효한 ChainType이어야 한다', () => {
      expect(['solana', 'ethereum', 'polygon', 'arbitrum']).toContain(adapter.chain)
    })

    test('network가 유효한 NetworkType이어야 한다', () => {
      expect(['mainnet', 'mainnet-beta', 'devnet', 'testnet', 'sepolia']).toContain(adapter.network)
    })
  })

  describe('주소 검증', () => {
    test('유효한 주소에 대해 true를 반환해야 한다', () => {
      // chain별로 유효한 주소 형식이 다름 -- 구현체가 제공
      // Contract: isValidAddress는 동기적이고 boolean을 반환
      const result = adapter.isValidAddress('any-address')
      expect(typeof result).toBe('boolean')
    })
  })

  describe('연결 관리', () => {
    test('connect 전 isConnected는 false여야 한다', () => {
      expect(adapter.isConnected()).toBe(false)
    })
  })

  // ... 13개 메소드 전체에 대한 계약 검증
}
```

```typescript
// packages/adapters/solana/__tests__/contracts/solana-adapter.contract.test.ts
import { chainAdapterContractTests } from '@waiaas/core/__tests__/contracts/chain-adapter.contract'
import { SolanaAdapter } from '../../src/adapter'

describe('SolanaAdapter Contract Tests', () => {
  chainAdapterContractTests(
    () => new SolanaAdapter('devnet'),
    { skipNetworkTests: true }
  )
})
```

```typescript
// packages/core/__tests__/contracts/mock-chain-adapter.contract.test.ts
import { chainAdapterContractTests } from './chain-adapter.contract'
import { MockChainAdapter } from '../../src/testing/MockChainAdapter'

describe('MockChainAdapter Contract Tests', () => {
  chainAdapterContractTests(
    () => new MockChainAdapter('solana', 'devnet')
  )
})
```

### Pattern 3: IClock DI + Jest Fake Timers 병행

**What:** IClock 인터페이스로 `now()` 시간을 제어하면서, setTimeout/setInterval은 Jest의 내장 fake timers를 사용하는 하이브리드 패턴
**When to use:** JWT 만료 검증, 타임락 쿨다운, 승인 타임아웃 등 시간 의존 로직 테스트

```typescript
// packages/core/src/interfaces/IClock.ts
export interface IClock {
  /** 현재 시각을 반환한다. */
  now(): Date
}

// packages/core/src/testing/FakeClock.ts
export class FakeClock implements IClock {
  private currentTime: Date

  constructor(initialTime: Date = new Date('2026-01-01T00:00:00Z')) {
    this.currentTime = initialTime
  }

  now(): Date {
    return new Date(this.currentTime.getTime())
  }

  /** 시간을 지정한 ms만큼 앞으로 이동 */
  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms)
  }

  /** 특정 시각으로 설정 */
  setTime(time: Date): void {
    this.currentTime = new Date(time.getTime())
  }
}
```

```typescript
// 테스트 예시: JWT 만료 검증
describe('SessionService', () => {
  let clock: FakeClock
  let sessionService: SessionService

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-01-01T12:00:00Z'))
    sessionService = new SessionService({ clock })
    jest.useFakeTimers()  // setTimeout/setInterval 제어용
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('만료된 세션 토큰은 거부해야 한다', async () => {
    const session = await sessionService.create({ expiresIn: 3600 })

    // IClock으로 1시간 1초 앞으로
    clock.advance(3601 * 1000)

    await expect(sessionService.verify(session.token))
      .rejects.toThrow('SESSION_EXPIRED')
  })

  test('DELAY 큐 워커는 쿨다운 후 실행해야 한다', async () => {
    // jest.advanceTimersByTimeAsync로 setTimeout 제어
    const promise = delayQueueWorker.start()
    await jest.advanceTimersByTimeAsync(15 * 60 * 1000)  // 15분
    // ...
  })
})
```

### Anti-Patterns to Avoid

- **Global Date.now() mocking:** `jest.spyOn(Date, 'now')` 대신 IClock DI를 사용한다. 글로벌 Date mock은 라이브러리 내부 동작까지 영향을 미쳐 예측 불가능한 실패를 유발한다.
- **테스트 간 상태 공유:** 각 테스트는 독립적인 FakeClock, 독립적인 DB 인스턴스를 사용해야 한다. `beforeEach`에서 항상 초기화한다.
- **`toBeCalled()` 사용 금지:** Jest 30에서 `toBeCalled`, `toBeCalledWith` 등 alias가 제거되었다. 반드시 `toHaveBeenCalled`, `toHaveBeenCalledWith` 사용.
- **모든 것을 mock하지 말 것:** Contract Test 대상 인터페이스만 mock한다. Zod 스키마 검증, 순수 함수는 실제 코드로 테스트한다.

---

## Claude's Discretion Recommendations

### 1. 커버리지 측정 단위: 패키지+모듈 혼합 권장

**권장:** 대부분 패키지 단위로 측정하되, `@waiaas/daemon`만 모듈(디렉토리) 단위로 세분화.

근거: `@waiaas/daemon`은 키스토어, 세션, 정책엔진, API, Kill Switch 등 보안 critical 모듈과 일반 유틸리티가 혼재한다. 패키지 전체 90%보다 모듈별 차등이 더 정확한 보안 보장을 제공한다.

```
@waiaas/daemon 세분화:
  - infrastructure/keystore/     → 95% (보안 최상위)
  - services/session-service     → 90% (인증 핵심)
  - services/policy-engine       → 90% (정책 핵심)
  - services/transaction-service → 90% (자금 이동)
  - server/middleware/           → 85% (인증 미들웨어)
  - server/routes/               → 80% (API 핸들러)
  - infrastructure/database/     → 80% (데이터 계층)
  - infrastructure/notifications/ → 80% (알림, 완전 mock)
  - lifecycle/                   → 75% (프로세스 관리)
```

Jest 30에서는 `coverageThreshold`에 glob 패턴을 사용하여 디렉토리별 임계값 설정이 가능하다:

```typescript
coverageThreshold: {
  global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  './packages/daemon/src/infrastructure/keystore/': {
    branches: 90, functions: 95, lines: 95, statements: 95
  },
  './packages/daemon/src/services/': {
    branches: 85, functions: 90, lines: 90, statements: 90
  },
}
```

### 2. 속도 vs 충실도 균형: 레벨별 최적화 전략

| 테스트 레벨 | 전략 | 목표 실행 시간 | 충실도 |
|------------|------|--------------|--------|
| Unit | @swc/jest + 모든 외부 의존성 mock + in-memory | 패키지당 <10s | LOW (로직 정확성만) |
| Integration | @swc/jest + 실제 SQLite (tmpdir) + mock 외부 | 패키지당 <30s | MEDIUM (DB 상호작용 포함) |
| E2E | @swc/jest + 실제 SQLite + mock chain | 전체 <2min | HIGH (API 레벨 전체 흐름) |
| Security | Unit 속도 + 공격 시나리오 집중 | 전체 <1min | HIGH (공격 벡터 특화) |

**권장 최적화:**
- Unit: `--maxWorkers=75%`로 CPU 활용 극대화, Jest 30의 병렬 실행 개선 활용
- Integration: `--runInBand` (순차 실행)으로 SQLite 파일 충돌 방지, 또는 테스트별 독립 tmpdir
- E2E: `--detectOpenHandles`로 리소스 누수 방지 (Hono 서버 close 확인)
- 전체: `--bail=1` 비활성 (CI에서), 개발 시 `--bail` 활성으로 빠른 피드백

### 3. ISigner: Owner+Agent 분리 설계 권장

**권장:** ISigner를 Owner 전용 `IOwnerSigner`와 Agent 전용 서명(ILocalKeyStore.sign)으로 분리.

**근거 분석:**

v0.2 설계 문서를 분석한 결과, Owner 서명과 Agent 서명은 근본적으로 다른 메커니즘이다:

| 구분 | Agent 서명 | Owner 서명 |
|------|-----------|-----------|
| **용도** | 트랜잭션 서명 (온체인 전송) | 관리 작업 인가 (SIWS/SIWE 메시지 서명) |
| **키 위치** | 로컬 키스토어 (sodium guarded memory) | 외부 지갑 (WalletConnect v2) |
| **서명 알고리즘** | Ed25519 (Solana) / secp256k1 (EVM) | Ed25519 (SIWS) / secp256k1 (SIWE) |
| **호출 주체** | daemon 내부 (IChainAdapter.signTransaction) | 외부 (ownerAuth 미들웨어에서 검증) |
| **기존 인터페이스** | ILocalKeyStore.sign(agentId, message) | ownerAuth 미들웨어 + verifySIWS/verifySIWE |
| **테스트 필요** | 이미 ILocalKeyStore로 mock 가능 | 서명 생성+검증 페어를 mock해야 함 |

Agent 서명은 이미 `ILocalKeyStore.sign()`으로 추상화되어 있고, `IChainAdapter.signTransaction()`이 내부적으로 호출한다. 별도 ISigner 추상화가 필요 없다.

Owner 서명은 `ownerAuth` 미들웨어가 요청 헤더에서 SIWS/SIWE 페이로드를 파싱하고 검증하는 방식이다. 테스트에서는 이 서명을 생성할 수 있어야 한다. 따라서:

```typescript
// packages/core/src/interfaces/ISigner.ts

/**
 * Owner 서명 생성 추상화.
 * 실제 구현: WalletConnect v2 signMessage 호출
 * 테스트 구현: 고정 키쌍으로 직접 서명
 */
export interface IOwnerSigner {
  /** Owner 지갑 주소 반환 */
  readonly address: string

  /** Owner 지갑의 체인 타입 */
  readonly chain: 'solana' | 'ethereum'

  /**
   * 메시지에 서명한다.
   * SIWS/SIWE 형식의 메시지를 서명하여 ownerAuth 페이로드에 포함시킨다.
   *
   * @param message - 서명할 메시지 (UTF-8 문자열)
   * @returns 서명 바이트 (Base58 또는 0x hex 인코딩)
   */
  signMessage(message: string): Promise<string>
}
```

```typescript
// packages/core/src/testing/FakeSigner.ts
import nacl from 'tweetnacl'  // 또는 @noble/ed25519 (경량)

export class FakeOwnerSigner implements IOwnerSigner {
  readonly address: string
  readonly chain: 'solana' | 'ethereum'
  private readonly privateKey: Uint8Array

  constructor(chain: 'solana' | 'ethereum' = 'solana') {
    this.chain = chain
    // 고정 시드에서 키쌍 생성 (결정적, 재현 가능)
    const keypair = nacl.sign.keyPair.fromSeed(
      new Uint8Array(32).fill(0x42)  // 테스트 전용 고정 시드
    )
    this.privateKey = keypair.secretKey
    this.address = encodeAddress(keypair.publicKey, chain)
  }

  async signMessage(message: string): Promise<string> {
    const messageBytes = new TextEncoder().encode(message)
    const signature = nacl.sign.detached(messageBytes, this.privateKey)
    return encodeSignature(signature, this.chain)
  }
}
```

**이름 변경:** CONTEXT.md에서 `ISigner`로 언급되었으나, 실제 설계 분석 결과 `IOwnerSigner`가 더 정확하다. Agent 서명은 기존 `ILocalKeyStore.sign()`으로 이미 충족되므로 별도 추상화가 불필요하다. 문서에서는 `ISigner`를 `IOwnerSigner`의 별칭으로 사용하되, 인터페이스 파일명은 `ISigner.ts`로 유지하여 CONTEXT.md와의 일관성을 보존한다.

### 4. 파일시스템 Mock: memfs + tmpdir 전략

**Unit (메모리 기반):** `memfs` 라이브러리로 `node:fs`를 mock하여 키스토어 JSON 파일 읽기/쓰기, config.toml 로딩을 메모리에서 수행.

```typescript
// jest.setup.ts or per-test setup
import { vol } from 'memfs'

jest.mock('node:fs')
jest.mock('node:fs/promises')

beforeEach(() => {
  vol.reset()
  // 테스트용 파일 구조 생성
  vol.fromJSON({
    '/home/test/.waiaas/config.toml': '[daemon]\nport = 3100',
    '/home/test/.waiaas/keys/agent-001.json': '{"version":1,...}',
  })
})
```

**Integration (임시 디렉토리):** `node:os`의 `tmpdir()` + `node:fs/promises`의 `mkdtemp()`로 실제 파일시스템 사용. 테스트 후 `afterEach`에서 정리.

```typescript
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'waiaas-test-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript 변환 | 커스텀 Babel preset | @swc/jest | Rust 기반, 설정 최소화, CI 40% 빠름 |
| 인터페이스 mock 생성 | 수동 jest.fn() 조합 | jest-mock-extended mock<T>() | 타입 안전, 자동 추론, calledWith 체크 |
| 파일시스템 mock | 커스텀 fs wrapper | memfs (Unit), tmpdir (Integration) | 검증된 node:fs 호환 구현, JSON 기반 초기화 |
| 커버리지 리포팅 | 커스텀 스크립트 | Jest 내장 v8 coverage provider | Jest 30 기본 제공, 글로벌+경로별 임계값 |
| Contract Test 프레임워크 | PACT/custom protocol | 팩토리 함수 기반 공유 스위트 | 외부 서버 불필요, 인터페이스가 이미 TypeScript로 정의됨 |
| 테스트 데이터 생성 | 각 테스트에서 직접 구성 | Factory 함수 (factories.ts) | 중앙 관리, 기본값 제공, 필요한 필드만 override |

---

## Common Pitfalls

### Pitfall 1: Jest 30 Breaking Changes 미적용

**What goes wrong:** Jest 29 코드 패턴을 그대로 사용하면 런타임 에러 발생
**Why it happens:** Jest 30에서 `toBeCalled()`, `toBeCalledWith()`, `lastCalledWith()` 등 alias가 제거됨. `jest.genMockFromModule()` -> `jest.createMockFromModule()`, `SpyInstance` -> `jest.Spied<T>`
**How to avoid:** 테스트 작성 시 항상 canonical 이름 사용 (`toHaveBeenCalled`, `toHaveBeenCalledWith`, `toHaveBeenLastCalledWith`)
**Warning signs:** `TypeError: expect(...).toBeCalled is not a function`

### Pitfall 2: Jest projects에서 per-project coverageThreshold 미지원

**What goes wrong:** 각 패키지 jest.config.ts에 `coverageThreshold`를 설정해도 무시됨
**Why it happens:** Jest 30 기준 알려진 제한사항. per-project coverage threshold가 root config에서만 동작
**How to avoid:** 루트 jest.config.ts의 `coverageThreshold`에서 glob/path 패턴으로 패키지별 임계값 지정
**Warning signs:** 커버리지 미달인데 CI가 통과함

### Pitfall 3: ESM + @swc/jest 호환성

**What goes wrong:** `import` 문이 `require`로 변환되지 않거나 파일 확장자 문제
**Why it happens:** Node.js 22의 ESM 모드와 Jest의 CommonJS 기본 동작 충돌
**How to avoid:** `extensionsToTreatAsEsm: ['.ts']` 설정, `moduleNameMapper`로 `.js` 확장자 해소, 또는 CommonJS 모드로 통일
**Warning signs:** `SyntaxError: Cannot use import statement outside a module`

### Pitfall 4: 비동기 타이머와 IClock 혼용 시 데드락

**What goes wrong:** `jest.advanceTimersByTime()`과 `async` 코드가 만나면 Promise가 resolve되지 않음
**Why it happens:** 동기식 타이머 진행이 마이크로태스크 큐를 처리하지 않음
**How to avoid:** Jest 30의 `jest.advanceTimersByTimeAsync()` 사용. IClock.now()는 타이머와 독립적이므로 안전
**Warning signs:** 테스트 타임아웃, `Async callback was not invoked within the timeout`

### Pitfall 5: SQLite Integration 테스트 병렬 실행 시 파일 잠금

**What goes wrong:** 여러 테스트 워커가 동일 SQLite 파일에 접근하면 SQLITE_BUSY
**Why it happens:** SQLite의 단일 쓰기 잠금 + Jest 병렬 실행
**How to avoid:** Integration 테스트는 `--runInBand` 또는 테스트별 독립 tmpdir에 별도 SQLite 파일 생성
**Warning signs:** `SQLITE_BUSY: database is locked`

### Pitfall 6: sodium-native mock 복잡성

**What goes wrong:** 키스토어 Unit 테스트에서 sodium-native C++ 바인딩이 로드 실패
**Why it happens:** sodium-native은 네이티브 모듈이라 CI 환경에서 빌드 필요, Jest 워커에서 로드 문제 가능
**How to avoid:** Unit 테스트에서는 ILocalKeyStore 인터페이스를 mock하여 sodium-native 의존성 우회. Integration 테스트에서만 실제 sodium-native 사용
**Warning signs:** `Cannot find module 'sodium-native'`, 빌드 에러

---

## Code Examples

### 테스트 데이터 팩토리 패턴

```typescript
// packages/core/src/testing/factories.ts
import type { TransferRequest, UnsignedTransaction } from '../interfaces/chain-adapter.types'

export function createTransferRequest(
  overrides: Partial<TransferRequest> = {}
): TransferRequest {
  return {
    from: 'So11111111111111111111111111111112',
    to: '9aE476sH92Vz7DMPyq5WLPkrKWivNH5eUxo7s1E6RAm4',
    amount: 1_000_000_000n,  // 1 SOL
    memo: undefined,
    ...overrides,
  }
}

export function createUnsignedTransaction(
  overrides: Partial<UnsignedTransaction> = {}
): UnsignedTransaction {
  return {
    chain: 'solana',
    serialized: new Uint8Array(256),
    estimatedFee: 5000n,
    expiresAt: new Date(Date.now() + 50_000),
    metadata: {},
    ...overrides,
  }
}

// Policy 관련
export function createPolicyDecision(
  overrides: Partial<PolicyDecision> = {}
): PolicyDecision {
  return {
    allowed: true,
    tier: 'INSTANT',
    reason: undefined,
    policyId: undefined,
    ...overrides,
  }
}
```

### IClock Contract Test

```typescript
// packages/core/__tests__/contracts/clock.contract.ts
import type { IClock } from '../../src/interfaces/IClock'

export function clockContractTests(factory: () => IClock) {
  let clock: IClock

  beforeEach(() => {
    clock = factory()
  })

  test('now()는 Date 객체를 반환해야 한다', () => {
    const result = clock.now()
    expect(result).toBeInstanceOf(Date)
  })

  test('now()는 호출할 때마다 유효한 시각을 반환해야 한다', () => {
    const result = clock.now()
    expect(result.getTime()).toBeGreaterThan(0)
    expect(Number.isNaN(result.getTime())).toBe(false)
  })

  test('연속 호출 시 시간이 역행하지 않아야 한다', () => {
    const t1 = clock.now()
    const t2 = clock.now()
    expect(t2.getTime()).toBeGreaterThanOrEqual(t1.getTime())
  })
}
```

### INotificationChannel Mock

```typescript
// packages/core/src/testing/MockNotification.ts
import type {
  INotificationChannel,
  NotificationMessage,
  NotificationResult,
} from '../interfaces/INotificationChannel'

export class MockNotificationChannel implements INotificationChannel {
  readonly type = 'TELEGRAM' as const
  readonly name: string
  readonly channelId: string

  /** 전송된 메시지 기록 (검증용) */
  readonly sentMessages: NotificationMessage[] = []
  /** 다음 send() 호출의 결과를 제어 */
  private nextResult: NotificationResult | null = null

  constructor(name = 'mock-channel', channelId = 'ch-001') {
    this.name = name
    this.channelId = channelId
  }

  async send(message: NotificationMessage): Promise<NotificationResult> {
    this.sentMessages.push(message)

    if (this.nextResult) {
      const result = this.nextResult
      this.nextResult = null
      return result
    }

    return { success: true, channelId: this.channelId }
  }

  async healthCheck(): Promise<boolean> {
    return true
  }

  /** 다음 send() 호출이 실패하도록 설정 */
  simulateFailure(error: string, retryAfter?: number): void {
    this.nextResult = {
      success: false,
      channelId: this.channelId,
      error,
      retryAfter,
    }
  }

  /** 기록 초기화 */
  reset(): void {
    this.sentMessages.length = 0
    this.nextResult = null
  }
}
```

### Turbo 통합 스크립트

```jsonc
// turbo.json (테스트 관련 태스크)
{
  "tasks": {
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "__tests__/**", "jest.config.*"],
      "outputs": ["coverage/**"],
      "cache": false  // 테스트는 항상 실행
    },
    "test:unit": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "__tests__/unit/**"],
      "cache": false
    },
    "test:integration": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "__tests__/integration/**"],
      "cache": false
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest 29 + ts-jest | Jest 30 + @swc/jest | 2025-06 (Jest 30 릴리스) | 37% 실행 속도 향상, 77% 메모리 절감 |
| `toBeCalled()` alias | `toHaveBeenCalled()` canonical | Jest 30 | alias 제거, 마이그레이션 필수 |
| `jest.genMockFromModule()` | `jest.createMockFromModule()` | Jest 30 | 이전 API 제거 |
| `SpyInstance` type | `jest.Spied<T>` | Jest 30 | 타입 변경 |
| `--testPathPattern` | `--testPathPatterns` (복수형) | Jest 30 | CLI 플래그 변경 |
| jest.useFakeTimers() + sync advance | jest.advanceTimersByTimeAsync() | Jest 30 개선 | async 코드와의 호환성 향상 |
| 수동 spy cleanup | `using` keyword auto-cleanup | Jest 30 (Node.js 22 지원) | 자동 spy 해제 |

---

## Interface Inventory for Contract Tests

v0.2/v0.3 설계 문서에서 추출한 인터페이스 전체 목록과 Mock 가능성 분석:

### 기존 인터페이스 4개

| Interface | Package | Methods | Mock 가능성 | Contract Test 전략 |
|-----------|---------|---------|------------|-------------------|
| **IChainAdapter** | @waiaas/core | 13개 (connect, disconnect, isConnected, getHealth, isValidAddress, getBalance, buildTransaction, simulateTransaction, signTransaction, submitTransaction, getTransactionStatus, waitForConfirmation, estimateFee) | HIGH -- 모든 메소드가 순수 입출력이고 부작용이 DI 가능 | 팩토리 함수 기반. SolanaAdapter, EvmAdapterStub, MockChainAdapter 모두 동일 스위트 통과 |
| **IPolicyEngine** | @waiaas/core | 1개 (evaluate) | HIGH -- 단일 메소드, 입출력 명확 | DefaultPolicyEngine(passthrough), DatabasePolicyEngine, MockPolicyEngine 검증 |
| **INotificationChannel** | @waiaas/core | 2개 (send, healthCheck) + 3 readonly props | HIGH -- HTTP 호출만 mock하면 됨 | Telegram/Discord/Ntfy 각 어댑터 + MockNotificationChannel |
| **ILocalKeyStore** | @waiaas/core | 6개 (unlock, lock, sign, getPublicKey, addAgent, exportAgent) | MEDIUM -- sodium-native 의존성으로 Unit에서는 interface mock 필수. Integration에서 실제 테스트 | Contract: unlock->sign->lock 순서, sign은 lock 상태에서 throw |

### 신규 인터페이스 2개

| Interface | Package | Methods | Mock 구현 | Contract Test 전략 |
|-----------|---------|---------|----------|-------------------|
| **IClock** | @waiaas/core | 1개 (now) | FakeClock: advance(ms), setTime(date) | 단조 증가, Date 반환, NaN 없음 |
| **ISigner** (IOwnerSigner) | @waiaas/core | 1개 (signMessage) + 2 readonly props | FakeOwnerSigner: 고정 Ed25519 키쌍 | signMessage -> verifySIWS/verifySIWE 쌍 검증 |

---

## Coverage Target Summary

### 패키지별 커버리지 목표 (Unit + Integration)

| Package | Target | Tier | Rationale |
|---------|--------|------|-----------|
| @waiaas/core | 90%+ | Critical | SSoT Enum, Zod 스키마, 인터페이스 정의. 모든 패키지의 기반 |
| @waiaas/daemon (keystore) | 95%+ | Critical | AES-256-GCM, Argon2id, sodium memory. 자금 보호 최전선 |
| @waiaas/daemon (session/policy/tx) | 90%+ | Critical | 세션 인증, 정책 평가, 트랜잭션 파이프라인 |
| @waiaas/daemon (middleware) | 85%+ | High | sessionAuth, ownerAuth, rate-limit, host-guard |
| @waiaas/daemon (routes/infra) | 80%+ | Normal | API 핸들러, DB 접속, 설정 로더 |
| @waiaas/daemon (lifecycle) | 75%+ | Normal | 프로세스 관리, 시그널 핸들링 |
| @waiaas/adapter-solana | 80%+ | High | RPC 의존 높음. Mock 한계 인정하되 핵심 로직 검증 |
| @waiaas/adapter-evm | 50%+ | Low | Stub만 존재. 모든 메소드 CHAIN_NOT_SUPPORTED throw 확인 |
| @waiaas/cli | 70%+ | Normal | 프로세스 spawn 기반 통합 테스트 위주 |
| @waiaas/sdk | 80%+ | High | 공개 인터페이스, 타입 안정성 |
| @waiaas/mcp | 70%+ | Normal | SDK 위의 얇은 레이어 |
| Python SDK | 80%+ | High | httpx + Pydantic v2, 별도 레포 |
| Desktop App (Tauri) | 제외 | - | UI는 수동 QA 중심 |

---

## 6개 테스트 레벨 상세 설계 참조

v0.4 objectives에서 정의한 6개 레벨을 Phase 14 문서에서 정식 확정해야 한다:

| Level | Scope | Environment | Frequency | Mock 범위 | 속도 목표 |
|-------|-------|-------------|-----------|----------|----------|
| **Unit** | 단일 함수/클래스 | Node.js + @swc/jest | 매 커밋 | 모든 외부 의존성 mock | 패키지당 <10s |
| **Integration** | 모듈 간 연동 (DB, 캐시) | Node.js + 실제 SQLite (tmpdir) | 매 PR | 외부 서비스만 mock (RPC, 알림) | 패키지당 <30s |
| **E2E** | API 엔드포인트 전체 흐름 | Node.js + Hono test client + mock chain | 매 PR | 블록체인만 mock | 전체 <2min |
| **Chain Integration** | 실제 블록체인 네트워크 | Devnet/Testnet | nightly/릴리스 | mock 없음 | 전체 <10min |
| **Security** | 공격 시나리오 재현 | Node.js + Unit 환경 | 매 PR | Unit과 동일 | 전체 <1min |
| **Platform** | CLI/Docker/Desktop 동작 | 각 플랫폼 환경 | 릴리스 | 환경에 따라 다름 | N/A |

---

## Open Questions

1. **Jest 30 + pnpm symlink 해석**
   - What we know: pnpm의 심링크 기반 node_modules 구조에서 `transformIgnorePatterns` 설정 필요 가능
   - What's unclear: Jest 30의 `unrs-resolver`가 pnpm 심링크를 자동 처리하는지 여부
   - Recommendation: 구현 단계에서 초기 설정 시 검증. 문제 발생 시 `transformIgnorePatterns` 조정

2. **jest-mock-extended 4.x와 @swc/jest 호환성**
   - What we know: jest-mock-extended 4.0.0이 Jest 30을 공식 지원. @swc/jest는 타입 체크를 하지 않음
   - What's unclear: 복잡한 제네릭 인터페이스(IChainAdapter)의 mock 생성 시 타입 추론 한계
   - Recommendation: 핵심 인터페이스에 대해서는 수동 Mock 클래스 작성 권장 (Contract Test 호환)

3. **Python SDK 테스트 프레임워크**
   - What we know: pytest가 Python 표준. httpx + Pydantic v2 테스트 패턴 확립됨
   - What's unclear: Phase 14 범위에서 Python 테스트 전략을 어디까지 상세화할지
   - Recommendation: "pytest + httpx.AsyncClient mock" 수준의 방향만 명시, 상세는 구현 단계

---

## Sources

### Primary (HIGH confidence)
- [Jest 30 Blog Post](https://jestjs.io/blog/2025/06/04/jest-30) -- Jest 30 릴리스 노트, 주요 변경사항
- [Jest 30 Migration Guide](https://jestjs.io/docs/upgrading-to-jest30) -- Breaking changes, Node.js 18+, TS 5.4+
- [Jest Configuration Docs](https://jestjs.io/docs/configuration) -- coverageThreshold, projects, transform 설정
- jest-mock-extended 4.0.0 -- GitHub releases 확인, Jest 30 지원 명시

### Secondary (MEDIUM confidence)
- [@swc/jest Docs](https://swc.rs/docs/usage/jest) -- SWC Jest 통합 설정
- [Shared Test Suite Pattern](https://hansott.codes/blog/how-to-test-multiple-implementations-of-an-interface-in-jest-26) -- 팩토리 함수 기반 Contract Test
- [Jest Timer Mocks](https://jestjs.io/docs/timer-mocks) -- useFakeTimers, advanceTimersByTimeAsync
- [memfs npm](https://www.npmjs.com/package/memfs) -- 메모리 파일시스템 mock

### Tertiary (LOW confidence)
- WebSearch: "Jest coverage monorepo per-package thresholds" -- per-project threshold 제한사항은 GitHub Issue #15588에서 확인, Jest 30에서 해결 여부는 미확인

---

## Metadata

**Confidence breakdown:**
- Standard stack (Jest 30, @swc/jest): HIGH -- 공식 릴리스 노트 및 문서로 확인
- Architecture (모노레포 설정, Contract Test): HIGH -- Jest 공식 문서 + 커뮤니티 검증 패턴
- Interface 분석 (IChainAdapter 13 methods 등): HIGH -- v0.2 설계 문서 직접 분석
- IClock/ISigner 설계: MEDIUM -- 커뮤니티 패턴 기반 자체 설계 (프로젝트 특화)
- Pitfalls: HIGH -- Jest 30 migration guide + 공식 이슈 트래커
- 커버리지 전략: MEDIUM -- 업계 표준 기반 자체 판단 (보안 위험도 차등)

**Research date:** 2026-02-06
**Valid until:** 2026-04-06 (Jest 생태계 안정기, 60일 유효)
