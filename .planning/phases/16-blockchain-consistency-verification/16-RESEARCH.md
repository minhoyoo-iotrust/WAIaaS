# Phase 16: 블록체인 & 일관성 검증 전략 - Research

**Researched:** 2026-02-06
**Domain:** 블록체인 테스트 환경 격리 + Enum/설정 SSoT 자동 검증
**Confidence:** HIGH

## Summary

Phase 16은 두 가지 독립된 도메인을 다룬다: (1) Solana 블록체인 의존성을 3단계(Mock RPC / Local Validator / Devnet)로 격리하는 테스트 환경 전략과, (2) v0.3에서 확보한 9개 Enum SSoT 및 config.toml의 자동 검증 방법 확정이다. Phase 14에서 테스트 레벨과 Mock 경계가 이미 정의되었고, Phase 15에서 보안 시나리오 71건이 완성되었으므로, Phase 16은 이들을 "블록체인 특화"와 "설정 일관성"이라는 두 축으로 구체화한다.

블록체인 테스트에서는 `@solana/kit`의 커스텀 `RpcTransport` 패턴을 활용한 Mock RPC 구현이 핵심이다. `createSolanaRpcFromTransport()`에 테스트용 트랜스포트를 주입하면 실제 `createSolanaRpc()`와 동일한 타입을 유지하면서 응답을 완전히 제어할 수 있다. Local Validator는 `solana-test-validator` (기본 포트 8899/8900)로 E2E 흐름을 검증하며, Devnet은 nightly/릴리스 시 네트워크 호환성만 확인하는 보조 역할로 제한한다.

Enum/설정 검증에서는 사용자가 명시적으로 선택한 "빌드타임 우선" 전략에 따라, TypeScript 컴파일러 + `as const` 배열 SSoT + Zod 파생 패턴을 활용한다. 9개 Enum 모두 `const` 배열을 SSoT로 삼고 Zod/Drizzle/TypeScript 타입을 파생하면, 불일치 시 `tsc --noEmit`에서 즉시 컴파일 에러가 발생한다.

**Primary recommendation:** Mock RPC는 `@solana/kit` 커스텀 트랜스포트 패턴으로 구현하고, Enum SSoT는 `as const` 배열 -> Zod enum -> Drizzle text enum -> DB CHECK SQL 생성의 단방향 파생 체인으로 빌드타임 검증을 확보하라.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Enum SSoT 검증 시점: 빌드타임 체크** -- TypeScript 컴파일러 + lint 규칙으로 Enum 불일치 즉시 차단 (가장 빠른 피드백)

### Claude's Discretion
이 Phase에서는 대부분의 구현 세부사항이 Claude 재량에 위임됨. 핵심 제약:
- **Mock RPC 충실도**: 시나리오별 최적 수준 선택 (high-fidelity 에러 파싱 경로 vs simplified 로직 검증)
- **Mock RPC 시나리오 범위**: SolanaAdapter 에러 매핑(31-solana-adapter-detail.md)과 Phase 15 보안 시나리오 분석 후 필요한 것만 선별
- **Mock 상태 관리**: 테스트 레벨별 Stateless/Stateful 적절 적용
- **Mock 패키지 구조**: 모노레포 7패키지 구조와 재사용 패턴 분석 후 위치 결정
- **Local Validator E2E 범위**: Phase 14 테스트 레벨 정의와 Phase 15 보안 시나리오 기준으로 검증 흐름 범위 결정
- **Devnet 역할**: 안정성과 CI 비용 고려하여 Local Validator와 역할 분담
- **CI 실행**: Phase 14 TLVL-01 실행 빈도 정의에 맞춰 결정
- **Airdrop 전략**: 테스트 성격별 적절한 SOL 충전 방식
- **DB 스키마 일치**: Drizzle ORM 특성과 CHECK 제약 구조 분석 후 빌드타임/테스트 보완 결정
- **config.toml 환경변수 우선순위**: config 로딩 로직 복잡도에 따라 테스트 레벨 결정
- **Enum 변경 방지**: 9개 Enum과 4곳(타입/Zod/Drizzle/DB CHECK) 동기화 전략
- **NOTE-01~11 매핑**: NOTE 내용 분석 후 성격별 최적 방식 선택
- Phase 14(TLVL-01~03, MOCK-01~04)의 테스트 레벨/Mock 경계 정의를 반드시 준수
- Phase 15(SEC-01~05)의 보안 시나리오와 충돌하지 않아야 함
- v0.3 SSoT 문서(45-enum-unified-mapping.md, 24-monorepo config.toml)가 검증 대상의 기준

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

---

## Standard Stack

### Core (블록체인 테스트)

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `solana-test-validator` | Solana CLI suite | Local Validator (단일 노드 클러스터) | Solana 공식 도구. 실제 RPC 호환, HTTP 8899 / WS 8900 기본 |
| `@solana/kit` 커스텀 RpcTransport | ^3.0.0 | Mock RPC 트랜스포트 | 라이브러리 자체 아키텍처. `createSolanaRpcFromTransport()`로 주입 |
| `@solana/kit` `requestAirdrop` | ^3.0.0 | Local Validator SOL 충전 | 공식 SDK 함수. lamports 단위 |

### Core (Enum/설정 검증)

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| TypeScript `as const` + `satisfies` | 5.7+ | Enum SSoT 배열 | 컴파일 타임 리터럴 타입 추론 |
| Zod `z.enum()` | ^3.24.0 | SSoT 배열에서 런타임 검증 파생 | 이미 프로젝트 의존성 |
| Drizzle ORM `text('col', { enum: [...] })` | ^0.45.0 | SSoT 배열에서 DB 스키마 파생 | 이미 프로젝트 의존성 |
| `smol-toml` | ^1.3.0 | config.toml 파싱 | 이미 프로젝트 의존성 |
| `tsc --noEmit` | ^5.7.0 | 빌드타임 타입 체크 | 이미 turbo.json typecheck 태스크로 설정됨 |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| Jest 30 `--runInBand --testTimeout=60000` | ^30.0.0 | Chain Integration 테스트 설정 | Phase 14 TLVL-01에서 확정된 설정 |
| `drizzle-kit generate` | ^0.30.0 | SQL 마이그레이션 생성 | DB CHECK 제약과 Drizzle 스키마 비교 시 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 커스텀 RpcTransport Mock | MSW (Mock Service Worker) | MSW는 HTTP 레벨 가로채기라 @solana/kit 타입 안전성 상실. RpcTransport가 SDK 레벨에서 타입 유지 |
| `solana-test-validator` | Bankrun (solana-bankrun) | Bankrun은 Rust BPF 프로그램 테스트 특화. WAIaaS는 트랜잭션 파이프라인만 검증하므로 test-validator 충분 |
| `as const` 배열 SSoT | TypeScript native `enum` | native enum은 드리즐/Zod와 통합 시 enumValues 추출이 불안정 (drizzle-orm#358). as const가 생태계 표준 |
| 수동 DB CHECK SQL | drizzle-zod 자동 생성 | drizzle-zod는 SELECT/INSERT 스키마 생성에 특화. CHECK 제약은 별도 관리 필요 |

---

## Architecture Patterns

### Pattern 1: Solana 3단계 테스트 환경 격리

**What:** Mock RPC / Local Validator / Devnet을 명확한 역할로 분리
**When to use:** SolanaAdapter 및 트랜잭션 파이프라인 검증

```
┌─────────────────────────────────────────────────────────────────────┐
│                    3단계 블록체인 테스트 격리                          │
├──────────────────────┬──────────────────────┬───────────────────────┤
│   Level 1            │   Level 2            │   Level 3             │
│   Mock RPC           │   Local Validator    │   Devnet              │
├──────────────────────┼──────────────────────┼───────────────────────┤
│ 용도: 로직 검증       │ 용도: E2E 흐름       │ 용도: 네트워크 호환    │
│ 환경: 커스텀 Transport│ 환경: solana-test-    │ 환경: Solana Devnet   │
│       (메모리 내)     │       validator      │       (실제 네트워크)  │
│ 속도: <1ms/call      │ 속도: ~100ms/call    │ 속도: ~500ms/call     │
│ 실행: 매 커밋/PR     │ 실행: 매 PR (선택적)  │ 실행: nightly/릴리스   │
│ 결정성: 100%         │ 결정성: ~99%          │ 결정성: ~90%          │
│ Mock 대상:           │ Mock 대상:            │ Mock 대상:             │
│  전체 RPC 응답       │  없음 (실제 노드)     │  없음 (실제 네트워크)   │
│ 테스트 레벨:         │ 테스트 레벨:          │ 테스트 레벨:            │
│  Unit, Integration,  │  E2E (Chain Int.)    │  Chain Integration     │
│  E2E, Security       │                      │                        │
└──────────────────────┴──────────────────────┴───────────────────────┘
```

**Phase 14 결정 준수:**
- Unit: MockChainAdapter (canned responses) -- 매 커밋
- Integration: MockChainAdapter (canned responses) -- 매 PR
- E2E: MockChainAdapter (시나리오 기반) -- 매 PR
- Chain Integration: 실제 Devnet/Testnet -- nightly/릴리스
- Security: MockChainAdapter -- 매 PR

### Pattern 2: @solana/kit 커스텀 RpcTransport Mock

**What:** `createSolanaRpcFromTransport()`에 테스트용 트랜스포트를 주입하여 RPC 응답 제어
**When to use:** SolanaAdapter Unit/Integration/E2E/Security 테스트

```typescript
// packages/core/src/testing/mock-rpc-transport.ts
import type { RpcTransport } from '@solana/rpc-transport'

type CannedResponse = {
  method: string
  params?: unknown
  result: unknown
  error?: { code: number; message: string }
  delay?: number  // 지연 시뮬레이션 (ms)
}

/**
 * Mock RPC Transport for Solana.
 *
 * Stateless 모드: 메서드별 고정 응답 (Unit 테스트)
 * Stateful 모드: 시나리오 큐 + 호출 기록 (E2E/Security 테스트)
 */
export function createMockRpcTransport(options: {
  responses: CannedResponse[]
  mode: 'stateless' | 'stateful'
}): RpcTransport & { calls: Array<{ method: string; params: unknown }> } {
  const calls: Array<{ method: string; params: unknown }> = []
  const responseQueue = [...options.responses]

  return Object.assign(
    async ({ payload }: { payload: unknown }): Promise<unknown> => {
      const body = payload as { method: string; params?: unknown; id?: number }
      calls.push({ method: body.method, params: body.params })

      const response = options.mode === 'stateful'
        ? responseQueue.shift()
        : options.responses.find(r => r.method === body.method)

      if (!response) {
        throw new Error(`No mock response for method: ${body.method}`)
      }

      if (response.delay) {
        await new Promise(r => setTimeout(r, response.delay))
      }

      if (response.error) {
        throw response.error
      }

      return { jsonrpc: '2.0', id: body.id, result: response.result }
    },
    { calls }
  )
}
```

**SolanaAdapter와의 통합:**
```typescript
// 테스트에서 사용
import { createSolanaRpcFromTransport } from '@solana/kit'

const mockTransport = createMockRpcTransport({
  mode: 'stateless',
  responses: [
    { method: 'getHealth', result: 'ok' },
    { method: 'getBalance', result: { value: 1_000_000_000n } },
    // ...
  ]
})

const rpc = createSolanaRpcFromTransport(mockTransport)
// 이 rpc를 SolanaAdapter에 DI 또는 내부 교체하여 사용
```

### Pattern 3: Enum SSoT 파생 체인 (빌드타임 우선)

**What:** 단일 `as const` 배열에서 TypeScript/Zod/Drizzle/DB CHECK를 일방향 파생
**When to use:** 9개 Enum 전체 (45-enum-unified-mapping.md)

```typescript
// packages/core/src/domain/enums.ts -- SINGLE SOURCE OF TRUTH

// 1. SSoT: as const 배열
export const TRANSACTION_STATUSES = [
  'PENDING', 'QUEUED', 'EXECUTING', 'SUBMITTED',
  'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED'
] as const

// 2. TypeScript 타입 (SSoT에서 자동 파생)
export type TransactionStatus = typeof TRANSACTION_STATUSES[number]

// 3. Zod 스키마 (SSoT에서 자동 파생)
import { z } from 'zod'
export const TransactionStatusEnum = z.enum(TRANSACTION_STATUSES)

// packages/daemon/src/infrastructure/database/schema.ts
import { TRANSACTION_STATUSES } from '@waiaas/core'

// 4. Drizzle ORM (SSoT에서 자동 파생)
export const transactions = sqliteTable('transactions', {
  status: text('status', { enum: [...TRANSACTION_STATUSES] })
    .notNull().default('PENDING'),
})

// 5. DB CHECK SQL (빌드타임 생성 스크립트 또는 드리즐 마이그레이션에서)
// CHECK (status IN ('PENDING','QUEUED','EXECUTING','SUBMITTED','CONFIRMED','FAILED','CANCELLED','EXPIRED'))
```

**불일치 시 탐지 메커니즘:**
- TypeScript: `text('status', { enum: [...WRONG_VALUES] })`에서 타입 불일치 -> `tsc --noEmit` 실패
- Zod: `z.enum(TRANSACTION_STATUSES)`는 리터럴 타입이므로 다른 값 사용 시 컴파일 에러
- Drizzle -> DB CHECK: 마이그레이션 스크립트에서 SSoT 배열로 CHECK SQL 자동 생성

### Pattern 4: config.toml 3단계 로딩 + Zod 검증

**What:** 하드코딩 기본값 -> config.toml -> 환경변수 순서 로딩 후 Zod 스키마 검증
**When to use:** config 로더 테스트 (config.schema.ts 검증)

```typescript
// packages/core/src/schemas/config.schema.ts
import { z } from 'zod'

export const DaemonConfigSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(3100),
  hostname: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  log_level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  shutdown_timeout: z.number().int().min(5).max(300).default(30),
  // ...
})

export const AppConfigSchema = z.object({
  daemon: DaemonConfigSchema,
  keystore: KeystoreConfigSchema,
  database: DatabaseConfigSchema,
  rpc: RpcConfigSchema,
  notifications: NotificationsConfigSchema,
  security: SecurityConfigSchema,
})

// 테스트 시나리오:
// 1. 기본값만 (config.toml 없음)
// 2. 부분 오버라이드 (일부 키만 있는 config.toml)
// 3. 환경변수 우선순위 (WAIAAS_DAEMON_PORT가 config.toml보다 우선)
// 4. Docker 환경 (WAIAAS_DAEMON_HOSTNAME=0.0.0.0)
// 5. 잘못된 값 (port: -1, 범위 밖 값)
```

### Anti-Patterns to Avoid

- **별도 Enum 정의:** 절대 TypeScript 타입, Zod 스키마, Drizzle 스키마, DB CHECK에서 같은 값을 독립적으로 하드코딩하지 않는다. 반드시 SSoT 배열에서 파생한다.
- **실제 Devnet을 Unit/Integration에서 사용:** 네트워크 의존성은 결정성을 파괴한다. Phase 14 Mock 경계를 준수한다.
- **Mock RPC에서 전체 Solana RPC 스펙 구현:** 필요한 메서드와 시나리오만 선별한다. SolanaAdapter가 사용하는 13개 메서드의 RPC만 Mock한다.
- **DB CHECK를 수동 관리:** SSoT 배열에서 자동 생성한다. 수동 SQL은 동기화 누락의 원인이다.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Solana RPC Mock | HTTP 서버 기반 Mock | `@solana/kit` 커스텀 RpcTransport | SDK 레벨 타입 안전성 유지. HTTP Mock은 직렬화/역직렬화 오류 가능 |
| Local Validator | 커스텀 테스트 노드 | `solana-test-validator` | Solana 공식 도구. 실제 RPC 완전 호환 |
| Enum 동기화 검증 | 런타임 비교 함수 | TypeScript 컴파일러 (as const + 파생) | 빌드타임에 불일치 즉시 발견. 런타임 검증은 이미 늦음 |
| config.toml 검증 | 커스텀 파서 | Zod 스키마 + smol-toml | 선언적 검증. 범위/타입/기본값을 스키마 하나로 관리 |
| SOL Airdrop 래퍼 | 커스텀 airdrop 함수 | `@solana/kit` `requestAirdrop` | SDK 공식 함수. lamports 타입 안전 |
| DB CHECK SQL 생성 | 수동 SQL 유지 | SSoT 배열에서 자동 생성 유틸리티 | 단방향 파생으로 동기화 누락 방지 |

**Key insight:** Mock RPC에서 가장 중요한 것은 "실제와 동일한 타입"이다. HTTP 레벨 Mock(MSW 등)은 JSON 직렬화/역직렬화 과정에서 bigint -> number 변환 등의 미묘한 차이를 유발할 수 있다. `@solana/kit`의 RpcTransport 레벨에서 Mock하면 이 문제를 원천 차단한다.

---

## Common Pitfalls

### Pitfall 1: Mock RPC 시나리오 과잉/과소 설계

**What goes wrong:** Mock RPC에 필요 이상의 시나리오를 넣으면 유지보수 부담이 커지고, 너무 적으면 실제 에러 경로를 놓친다.
**Why it happens:** SolanaAdapter 13개 메서드 x 에러 시나리오 11개 = 143개 조합이 가능하지만 대부분은 불필요하다.
**How to avoid:** 31-solana-adapter-detail.md의 에러 매핑 표(섹션 10)에서 "재시도 가능"과 "재시도 불가"를 구분하고, Phase 15 보안 시나리오에서 참조하는 에러 경로만 Mock한다.
**Warning signs:** Mock 시나리오가 30개를 넘으면 과잉 의심.

### Pitfall 2: solana-test-validator CI 안정성

**What goes wrong:** CI에서 `solana-test-validator`가 시작되지 않거나 포트 충돌이 발생한다.
**Why it happens:** validator 바이너리 설치 누락, 다른 프로세스와 포트 충돌, 시작 시간 대기 부족.
**How to avoid:**
  - CI에서 `--reset --quiet` 플래그 사용
  - `--rpc-port` 명시적 지정 (기본 8899에서 충돌 시)
  - 시작 후 health check 폴링 (최대 30초 대기)
  - `afterAll`에서 프로세스 kill 확실히 수행
**Warning signs:** CI에서 간헐적으로 Chain Integration 테스트 실패.

### Pitfall 3: Devnet Rate Limit 및 Airdrop 실패

**What goes wrong:** Devnet 공용 RPC의 rate limit으로 테스트 실패, airdrop이 "Too Many Requests"로 거부.
**Why it happens:** Solana Devnet 공용 RPC는 ~40 req/s 제한. nightly에서 여러 테스트가 동시 실행 시 초과.
**How to avoid:**
  - Devnet 테스트는 최소한으로 제한 (5개 이하의 핵심 흐름만)
  - `--runInBand`로 순차 실행
  - Airdrop 실패 시 재시도 (최대 3회, 2초 간격)
  - Local Validator에서 대부분의 E2E를 수행하고 Devnet은 호환성 확인만
**Warning signs:** Devnet 테스트 성공률이 90% 미만.

### Pitfall 4: Enum SSoT 배열과 DB CHECK SQL 분리

**What goes wrong:** `as const` 배열을 변경했지만 DB CHECK SQL을 업데이트하지 않아 마이그레이션에서 불일치 발생.
**Why it happens:** Drizzle ORM의 `text('col', { enum: [...] })`은 TypeScript 레벨 제약이지 DB CHECK를 자동 생성하지 않는다. SQLite의 CHECK 제약은 별도 SQL로 관리된다.
**How to avoid:**
  - DB CHECK SQL을 SSoT 배열에서 생성하는 유틸리티 함수 작성
  - 또는 테스트에서 `PRAGMA table_info` + `sqlite_master`를 읽어 CHECK 제약 파싱 후 SSoT와 비교
  - `drizzle-kit generate`로 마이그레이션 생성 시 CHECK 포함 확인
**Warning signs:** 런타임에 DB INSERT가 CHECK 제약 위반으로 실패.

### Pitfall 5: config.toml 중첩 섹션 환경변수 매핑

**What goes wrong:** `[security.policy_defaults].delay_seconds`의 환경변수 이름을 `WAIAAS_SECURITY_POLICY_DEFAULTS_DELAY_SECONDS`로 기대하지만 로더가 다르게 파싱한다.
**Why it happens:** TOML의 중첩 섹션(`[a.b]`)을 환경변수 계층(`WAIAAS_A_B_KEY`)으로 매핑하는 규칙이 모호하다.
**How to avoid:**
  - 24-monorepo-data-directory.md 섹션 3.2의 환경변수 매핑 표를 SSoT로 사용
  - 매핑 규칙을 테스트 케이스로 전환 (각 환경변수가 올바른 config 경로를 오버라이드하는지)
  - Docker 시나리오(WAIAAS_DAEMON_HOSTNAME=0.0.0.0)를 필수 테스트에 포함
**Warning signs:** Docker 환경에서 config 값이 예상과 다름.

### Pitfall 6: NOTE 매핑 시 불필요한 테스트 생성

**What goes wrong:** 11개 NOTE 모두에 전용 테스트를 만들면 유지보수 비용 대비 가치가 낮다.
**Why it happens:** NOTE는 "구현 시 참고" 수준의 가이드이지 독립 요구사항이 아니다.
**How to avoid:**
  - 테스트 필요/불필요를 NOTE 성격별로 분류 (아래 매핑 참조)
  - 기존 시나리오에 흡수 가능한 NOTE는 새 테스트 불필요
  - 설계 변경이 없는 NOTE(참고 문서)는 테스트 불필요로 분류
**Warning signs:** NOTE 전용 테스트 파일이 5개 이상.

---

## Code Examples

### Example 1: Mock RPC Transport 시나리오 -- 에러 매핑 검증

```typescript
// 31-solana-adapter-detail.md 섹션 10 에러 매핑 기반
// test: InsufficientFundsForFee -> INSUFFICIENT_BALANCE 매핑

const mockTransport = createMockRpcTransport({
  mode: 'stateful',
  responses: [
    { method: 'getHealth', result: 'ok' },
    { method: 'getLatestBlockhash', result: {
      value: { blockhash: 'mock-blockhash', lastValidBlockHeight: 100n }
    }},
    { method: 'getRecentPrioritizationFees', result: [] },
    // simulateTransaction이 InsufficientFundsForFee 반환
    { method: 'simulateTransaction', result: {
      value: { err: 'InsufficientFundsForFee', logs: [], unitsConsumed: 0 }
    }},
  ]
})

// Given: Mock RPC가 InsufficientFundsForFee를 반환하도록 설정
// When: adapter.simulateTransaction(unsignedTx) 호출
// Then: SimulationResult.success === false, error에 '수수료를 지불할 잔액이 부족합니다' 포함
```

### Example 2: Mock RPC Transport 시나리오 -- Blockhash 만료

```typescript
// Phase 15 SEC-05-T07 경계값 시나리오
const mockTransport = createMockRpcTransport({
  mode: 'stateful',
  responses: [
    { method: 'getHealth', result: 'ok' },
    // sendTransaction이 BlockhashNotFound 에러 반환
    {
      method: 'sendTransaction',
      error: { code: -32002, message: 'Transaction simulation failed: Blockhash not found' }
    },
  ]
})

// Given: Blockhash가 만료된 상태
// When: adapter.submitTransaction(signedTx) 호출
// Then: ChainError { code: SOLANA_BLOCKHASH_EXPIRED, retryable: true }
```

### Example 3: Local Validator E2E 흐름

```typescript
// Chain Integration 테스트
// 전제: solana-test-validator가 localhost:8899에서 실행 중

import { createSolanaRpc } from '@solana/kit'
import { SolanaAdapter } from '@waiaas/adapter-solana'

describe('SolanaAdapter E2E (Local Validator)', () => {
  const rpcUrl = 'http://127.0.0.1:8899'
  let adapter: SolanaAdapter

  beforeAll(async () => {
    adapter = new SolanaAdapter({
      network: 'devnet',  // local validator는 devnet 설정 사용
      rpcUrl,
      wsUrl: 'ws://127.0.0.1:8900',
    })
    await adapter.connect(rpcUrl)

    // Airdrop 10 SOL to test account
    const rpc = createSolanaRpc(rpcUrl)
    await rpc.requestAirdrop(testAddress, lamports(10_000_000_000n)).send()
    // 확인 대기 (local validator는 즉시 처리)
  })

  test('세션 -> 정책 -> 서명 -> 전송 -> 확인 전체 흐름', async () => {
    // 1. buildTransaction
    const unsignedTx = await adapter.buildTransaction({
      from: testAddress,
      to: recipientAddress,
      amount: 1_000_000n, // 0.001 SOL
    })
    expect(unsignedTx.chain).toBe('solana')
    expect(unsignedTx.expiresAt).toBeDefined()

    // 2. simulateTransaction
    const simResult = await adapter.simulateTransaction(unsignedTx)
    expect(simResult.success).toBe(true)

    // 3. signTransaction
    const signedTx = await adapter.signTransaction(unsignedTx, testPrivateKey)
    expect(signedTx).toBeInstanceOf(Uint8Array)

    // 4. submitTransaction
    const submitResult = await adapter.submitTransaction(signedTx)
    expect(submitResult.txHash).toBeDefined()
    expect(submitResult.status).toBe('submitted')

    // 5. waitForConfirmation
    const confirmed = await adapter.waitForConfirmation(submitResult.txHash, 30_000)
    expect(['confirmed', 'finalized']).toContain(confirmed.status)
  }, 60_000) // 60초 타임아웃 (TLVL-01 Chain Integration 설정)
})
```

### Example 4: Enum SSoT 빌드타임 검증

```typescript
// packages/core/src/domain/enums.ts

// === SSoT 배열 정의 ===
export const TRANSACTION_STATUSES = [
  'PENDING', 'QUEUED', 'EXECUTING', 'SUBMITTED',
  'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED'
] as const

export const TRANSACTION_TIERS = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'] as const
export const AGENT_STATUSES = ['CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED'] as const
export const POLICY_TYPES = ['SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT'] as const
export const NOTIFICATION_CHANNEL_TYPES = ['TELEGRAM', 'DISCORD', 'NTFY'] as const
export const AUDIT_LOG_SEVERITIES = ['info', 'warning', 'critical'] as const
export const KILL_SWITCH_STATUSES = ['NORMAL', 'ACTIVATED', 'RECOVERING'] as const
export const AUTO_STOP_RULE_TYPES = [
  'CONSECUTIVE_FAILURES', 'TIME_RESTRICTION',
  'DAILY_LIMIT_THRESHOLD', 'HOURLY_RATE', 'ANOMALY_PATTERN'
] as const

// === TypeScript 타입 파생 ===
export type TransactionStatus = typeof TRANSACTION_STATUSES[number]
export type TransactionTier = typeof TRANSACTION_TIERS[number]
export type AgentStatus = typeof AGENT_STATUSES[number]
// ... 나머지 동일 패턴

// === Zod 스키마 파생 ===
import { z } from 'zod'
export const TransactionStatusEnum = z.enum(TRANSACTION_STATUSES)
export const TransactionTierEnum = z.enum(TRANSACTION_TIERS)
// ... 나머지 동일 패턴

// === DB CHECK SQL 생성 유틸리티 ===
export function generateCheckConstraint(
  column: string,
  values: readonly string[]
): string {
  const quoted = values.map(v => `'${v}'`).join(', ')
  return `CHECK (${column} IN (${quoted}))`
}

// 테스트에서 사용:
// generateCheckConstraint('status', TRANSACTION_STATUSES)
// => "CHECK (status IN ('PENDING', 'QUEUED', 'EXECUTING', ...))"
```

### Example 5: config.toml 3단계 로딩 테스트

```typescript
// packages/daemon/test/unit/config-loader.test.ts

describe('config.toml 3단계 로딩', () => {
  test('기본값만: config.toml 없으면 DEFAULT_CONFIG 사용', () => {
    const config = loadConfig({ dataDir: '/nonexistent' })
    expect(config.daemon.port).toBe(3100)
    expect(config.daemon.hostname).toBe('127.0.0.1')
  })

  test('부분 오버라이드: config.toml에 port만 있으면 나머지 기본값', () => {
    // memfs로 config.toml 생성
    const config = loadConfig({
      dataDir: '/test',
      tomlContent: '[daemon]\nport = 4000\n'
    })
    expect(config.daemon.port).toBe(4000)
    expect(config.daemon.hostname).toBe('127.0.0.1') // 기본값 유지
  })

  test('환경변수 우선: WAIAAS_DAEMON_PORT가 config.toml보다 우선', () => {
    process.env.WAIAAS_DAEMON_PORT = '5000'
    const config = loadConfig({
      dataDir: '/test',
      tomlContent: '[daemon]\nport = 4000\n'
    })
    expect(config.daemon.port).toBe(5000) // 환경변수 승리
    delete process.env.WAIAAS_DAEMON_PORT
  })

  test('Docker 환경: WAIAAS_DAEMON_HOSTNAME=0.0.0.0 허용', () => {
    process.env.WAIAAS_DAEMON_HOSTNAME = '0.0.0.0'
    const config = loadConfig({ dataDir: '/test' })
    expect(config.daemon.hostname).toBe('0.0.0.0')
    delete process.env.WAIAAS_DAEMON_HOSTNAME
  })

  test('중첩 섹션: WAIAAS_SECURITY_POLICY_DEFAULTS_DELAY_SECONDS', () => {
    process.env.WAIAAS_SECURITY_POLICY_DEFAULTS_DELAY_SECONDS = '600'
    const config = loadConfig({ dataDir: '/test' })
    expect(config.security.policy_defaults.delay_seconds).toBe(600)
    delete process.env.WAIAAS_SECURITY_POLICY_DEFAULTS_DELAY_SECONDS
  })

  test('잘못된 값: Zod 검증 실패', () => {
    expect(() => loadConfig({
      dataDir: '/test',
      tomlContent: '[daemon]\nport = -1\n'
    })).toThrow() // Zod min(1024) 위반
  })
})
```

---

## Mock RPC 시나리오 범위 (CHAIN-02 충족)

### 필수 시나리오 (SolanaAdapter 13개 메서드 기반)

31-solana-adapter-detail.md의 에러 매핑(섹션 10)과 Phase 15 보안 시나리오를 교차 분석한 결과, 다음 시나리오가 필요하다:

| # | 시나리오 | RPC 메서드 | Mock 응답 | 참조 |
|---|---------|-----------|----------|------|
| 1 | 성공: SOL 전송 전체 흐름 | getHealth, getLatestBlockhash, getRecentPrioritizationFees, simulateTransaction, sendTransaction, getSignatureStatuses | 정상 응답 | 기본 흐름 |
| 2 | 성공: 잔액 조회 | getBalance | `{ value: bigint }` | getBalance |
| 3 | 성공: 수수료 추정 | getRecentPrioritizationFees | `[{ prioritizationFee, slot }]` | estimateFee |
| 4 | 실패: RPC 연결 실패 | getHealth | 에러 throw | connect 3회 재시도 |
| 5 | 실패: 잔액 부족 | simulateTransaction | `{ err: 'InsufficientFundsForFee' }` | SEC-05 금액 경계 |
| 6 | 실패: Blockhash 만료 | sendTransaction | `BlockhashNotFound` 에러 | SEC-05-T07 |
| 7 | 실패: 유효하지 않은 주소 | - (클라이언트 검증) | N/A | isValidAddress |
| 8 | 실패: 시뮬레이션 실패 (프로그램 에러) | simulateTransaction | `{ err: { InstructionError: [...] } }` | 에러 매핑 |
| 9 | 실패: 트랜잭션 실행 실패 | getSignatureStatuses | `{ err: {...} }` | getTransactionStatus |
| 10 | 실패: RPC 타임아웃 | 아무 메서드 | delay: 5000ms + 에러 | RPC_ERROR |
| 11 | 지연: Priority Fee 조회 실패 시 기본값 | getRecentPrioritizationFees | 에러 throw | estimateFee fallback |
| 12 | 지연: 확인 대기 타임아웃 | getSignatureStatuses | 반복 `{ value: [null] }` | waitForConfirmation |
| 13 | 성공: 이미 처리된 트랜잭션 (중복 제출) | sendTransaction | `AlreadyProcessed` 에러 | submitTransaction |

### 상태 관리 전략

| 테스트 레벨 | 상태 관리 | 근거 |
|------------|----------|------|
| Unit | Stateless (메서드별 고정 응답) | 단일 함수 로직만 검증. 호출 순서 무관 |
| Integration | Stateless (canned responses) | DB 연동이 목적. RPC 응답은 고정 |
| E2E | Stateful (시나리오 큐) | 전체 흐름에서 순차적 RPC 호출 시뮬레이션 필요 |
| Security | Stateless 또는 Stateful | 시나리오별 판단. 에러 주입은 Stateless, 흐름 공격은 Stateful |

---

## Local Validator E2E 범위 (CHAIN-03 충족)

### 검증 흐름 정의

Phase 14 TLVL-01 기준 Chain Integration 레벨에서 검증할 E2E 흐름:

| # | 흐름 이름 | 단계 | 시간 예상 |
|---|----------|------|----------|
| 1 | SOL 전송 전체 흐름 | connect -> airdrop -> buildTx -> simulate -> sign -> submit -> waitForConfirmation | ~10s |
| 2 | 잔액 조회 + 수수료 추정 | connect -> airdrop -> getBalance -> estimateFee -> 검증 | ~3s |
| 3 | 주소 검증 | isValidAddress (다양한 포맷) | <1s |
| 4 | 연결 관리 | connect -> isConnected -> getHealth -> disconnect -> isConnected | ~2s |
| 5 | 에러 복구 | connect -> buildTx (잔액 0) -> simulate (INSUFFICIENT) -> 에러 매핑 확인 | ~5s |

**합계:** ~21초. Phase 14 목표 "전체 <10min" 내 충분.

### Devnet 역할 분담

| 검증 항목 | Local Validator | Devnet |
|----------|----------------|--------|
| SOL 전송 전체 흐름 | O (핵심) | O (호환성) |
| 에러 매핑 | O | X |
| 네트워크 레이턴시 | X (로컬이라 의미 없음) | O |
| Rate Limit 대응 | X | O (공용 RPC 제한 테스트) |
| Priority Fee 동적 변화 | X (단일 노드) | O (실제 혼잡도) |

**Devnet 테스트 수:** 최대 2~3건 (SOL 전송 + 잔액 조회 + 헬스 체크). 네트워크 불안정 허용.

### Airdrop 전략

| 환경 | 방법 | SOL 양 | 근거 |
|------|------|--------|------|
| Local Validator | `requestAirdrop` via @solana/kit | 10 SOL (테스트 전체 공유) | Local validator는 제한 없음. genesis에 1000 SOL |
| Devnet | `requestAirdrop` via @solana/kit + 재시도 | 2 SOL (테스트별) | Devnet rate limit 대응. 필요 최소량 |
| beforeAll | 1회 대량 airdrop | 10 SOL | 테스트 간 airdrop 호출 최소화 |

---

## EVM Adapter Stub 테스트 범위 (CHAIN-04 충족)

EvmAdapterStub(36-killswitch-autostop-evm.md 섹션 10)은 IChainAdapter 인터페이스를 준수하되 모든 메서드가 `CHAIN_NOT_SUPPORTED`를 throw한다. 테스트 범위:

| # | 검증 항목 | 테스트 레벨 | 방법 |
|---|----------|-----------|------|
| 1 | IChainAdapter 타입 준수 | 빌드타임 | `tsc --noEmit`으로 implements IChainAdapter 확인 |
| 2 | isConnected()가 false 반환 | Unit | 직접 호출 검증 |
| 3 | getHealth()가 { healthy: false, latency: -1 } 반환 | Unit | 직접 호출 검증 |
| 4 | 11개 메서드가 CHAIN_NOT_SUPPORTED throw | Unit | 각 메서드 호출 후 ChainError 검증 |
| 5 | AdapterRegistry 등록/조회 | Unit | registry.get('ethereum') 호출 |

**Contract Test 적용:** Phase 14 CONTRACT-TEST-FACTORY-PATTERN에 따라 `chainAdapterContractTests(factory, { skipNetworkTests: true })`를 EvmAdapterStub에도 실행한다. 단, 대부분의 테스트가 CHAIN_NOT_SUPPORTED throw를 검증하게 된다.

---

## NOTE-01~11 테스트 매핑 (ENUM-03 충족)

### NOTE별 테스트 필요성 분류

| NOTE | 제목 | 테스트 필요? | 매핑 방식 | 근거 |
|------|------|------------|----------|------|
| NOTE-01 | BalanceInfo 단위 변환 규칙 | O | Unit 테스트 (formatAmount/parseAmount) | 변환 공식 검증 필요 |
| NOTE-02 | 알림 채널-정책 연동 규칙 | O | Integration 테스트 (PolicyEngine + 채널 수 검증) | 채널 <2면 INSTANT만 허용 규칙 |
| NOTE-03 | MCP-REST API 패리티 매트릭스 | X (문서) | 추적만 | 매트릭스 자체는 테스트 불가. MCP 구현 시 커버 |
| NOTE-04 | SDK 에러 코드 타입 매핑 | X (타입) | 빌드타임 | TypeScript 타입으로 강제. tsc --noEmit |
| NOTE-05 | Tauri IPC+HTTP 에러 처리 | X (UI) | Platform 테스트 (Phase 18) | Tauri 환경 특화. Phase 16 범위 밖 |
| NOTE-06 | Setup Wizard vs CLI init | X (문서) | Platform 테스트 (Phase 18) | 프로세스 레벨. Phase 16 범위 밖 |
| NOTE-07 | Telegram SIWS 대체 방안 | X (설계) | 추적만 | 설계 가이드. 구현 시 Telegram 테스트로 커버 |
| NOTE-08 | Docker shutdown 타임라인 | O (조건부) | config.toml 테스트에 흡수 | shutdown_timeout 30초 검증 |
| NOTE-09 | 에이전트 상태 v0.1->v0.2 매핑 | X (이력) | 불필요 | 과거 이력 문서. v0.2 Enum은 이미 SSoT |
| NOTE-10 | Python SDK snake_case 변환 | X (타입) | SDK 구현 시 커버 | Phase 16 범위 밖 |
| NOTE-11 | 커서 페이지네이션 표준 | O | E2E 테스트에 흡수 | UUID v7 커서 로직 검증 필요 |

### 테스트 필요 NOTE 매핑 상세

**NOTE-01 (formatAmount/parseAmount):**
- 기존 시나리오: @waiaas/core Unit 테스트에 흡수
- 검증: SOL(decimals=9), ETH(decimals=18) 양방향 변환
- 경계값: 0, 1 lamport, MAX_SAFE_INTEGER, BigInt 범위

**NOTE-02 (알림 채널 <2 규칙):**
- 기존 시나리오: SEC-02 정책 우회 시나리오에 흡수 가능
- 검증: 활성 채널 0/1/2에서 PolicyEngine 동작 차이

**NOTE-08 (shutdown timeout):**
- config.toml 테스트에 흡수: `shutdown_timeout` 값 범위 검증 (5-300)
- Docker stop_grace_period 35초와의 관계는 문서 참조만

**NOTE-11 (커서 페이지네이션):**
- E2E 테스트에 흡수: 목록 API 호출 시 cursor/nextCursor 검증
- 경계값: 빈 목록, 1건, limit+1건 (다음 페이지 존재)

### 추적성

```
NOTE-01 -> packages/core/test/unit/format-amount.test.ts (신규)
NOTE-02 -> Phase 15 SEC-02-09 (정책 미설정 기본 동작) 확장
NOTE-08 -> packages/daemon/test/unit/config-loader.test.ts (config 테스트에 포함)
NOTE-11 -> packages/daemon/test/e2e/pagination.test.ts (E2E에 포함)
NOTE-03, 04, 05, 06, 07, 09, 10 -> 테스트 불필요 (문서/타입/범위밖)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@solana/web3.js` 1.x Connection Mock | `@solana/kit` 커스텀 RpcTransport | 2024 리브랜딩 | pipe API + 함수형 아키텍처에 맞는 Mock 전략 필요 |
| TypeScript `enum` 키워드 | `as const` 배열 + 타입 파생 | 2024 생태계 전환 | Zod/Drizzle과의 통합이 `as const`에서 더 안정적 |
| drizzle-zod 자동 스키마 | SSoT 배열에서 수동 파생 | SQLite CHECK 한계 | SQLite CHECK 제약은 drizzle-kit이 자동 생성하지 않으므로 수동 관리 |
| Devnet 의존 E2E | Local Validator 우선 | Solana 테스트 성숙화 | 결정적 테스트 환경으로 CI 안정성 확보 |

---

## Open Questions

1. **@solana/kit RpcTransport 시그니처 정확한 형태**
   - What we know: `async ({ payload }) => Promise<unknown>` 형태이며 커스텀 트랜스포트를 지원한다
   - What's unclear: 정확한 TypeScript 인터페이스와 `createSolanaRpcFromTransport` 파라미터
   - Recommendation: 구현 시 `@solana/rpc-transport` 패키지의 소스를 확인하여 정확한 시그니처 사용. LOW confidence
   - Impact: Mock 트랜스포트 구현의 정확한 타입

2. **SQLite CHECK 제약과 Drizzle ORM 마이그레이션 통합**
   - What we know: Drizzle `text('col', { enum: [...] })` 은 TypeScript 레벨 제약이며 SQLite CHECK를 자동 생성할 수도 있고 안 할 수도 있음
   - What's unclear: `drizzle-kit generate`가 SQLite CHECK 제약을 포함하는지 여부
   - Recommendation: 구현 시 `drizzle-kit generate` 산출물을 검사하여 CHECK 포함 여부 확인. CHECK가 없으면 커스텀 마이그레이션 SQL 필요. MEDIUM confidence
   - Impact: DB 레벨 Enum 검증 자동화 가능 여부

3. **AuditLogEventType의 CHECK 제약 부재**
   - What we know: 45-enum-unified-mapping.md에서 명시적으로 "CHECK 제약 없이 TEXT로 저장"이라 기술
   - What's unclear: 향후 이벤트 타입 추가 시 TypeScript const object와의 동기화 방법
   - Recommendation: TypeScript `as const` 오브젝트로 관리하되 DB CHECK는 적용하지 않음 (설계 의도 준수). 테스트에서 사용하는 이벤트 타입이 const object에 포함되는지만 검증. HIGH confidence
   - Impact: AuditLogEventType만 다른 8개 Enum과 다른 패턴

---

## Sources

### Primary (HIGH confidence)
- 31-solana-adapter-detail.md -- SolanaAdapter 13개 메서드, 에러 매핑 11개 시나리오
- 27-chain-adapter-interface.md -- IChainAdapter 인터페이스, 공통 타입
- 36-killswitch-autostop-evm.md 섹션 10 -- EvmAdapterStub 13개 메서드
- 45-enum-unified-mapping.md -- 9개 Enum SSoT 대응표
- 24-monorepo-data-directory.md 섹션 3 -- config.toml 전체 키-값 구조, 환경변수 매핑
- Phase 14 deliverables (41, 42) -- 테스트 레벨/Mock 경계/Contract Test
- Phase 15 deliverables (43~47) -- 보안 시나리오 71건
- Phase 13 summaries -- NOTE-01~11 내용

### Secondary (MEDIUM confidence)
- [Anza Kit GitHub](https://github.com/anza-xyz/kit) -- 커스텀 RpcTransport 패턴 확인
- [Solana Test Validator Anza Docs](https://docs.anza.xyz/cli/examples/test-validator) -- 기본 포트 8899, 주요 플래그
- [ENUM with TypeScript, Zod AND Drizzle ORM](https://medium.com/@lior_amsalem/enum-with-typescript-zod-and-drizzle-orm-f7449a8b37d5) -- as const 배열 SSoT 패턴

### Tertiary (LOW confidence)
- @solana/kit RpcTransport 정확한 시그니처 -- 공식 문서에 상세 타입 미기재. 소스 확인 필요

---

## Metadata

**Confidence breakdown:**
- Mock RPC 전략: HIGH -- @solana/kit 공식 커스텀 트랜스포트 패턴 + 프로젝트 SolanaAdapter 설계 문서
- Local Validator: HIGH -- Solana 공식 도구 + 포트/플래그 공식 문서 확인
- Devnet 역할: HIGH -- Phase 14 TLVL-01 결정 기반
- Enum SSoT 빌드타임 검증: HIGH -- TypeScript `as const` + Zod 연동은 생태계 표준 패턴
- config.toml 검증: HIGH -- 24-monorepo-data-directory.md에 전체 스펙 명시
- NOTE 매핑: HIGH -- Phase 13 산출물에서 NOTE 내용 전체 확인
- EVM Stub 테스트: HIGH -- 36-killswitch-autostop-evm.md에 완전한 Stub 코드 존재
- RpcTransport 타입: LOW -- 정확한 시그니처 미확인 (소스 확인 필요)

**Research date:** 2026-02-06
**Valid until:** 30 days (stable domain -- Solana SDK와 Drizzle ORM 모두 안정 버전)
