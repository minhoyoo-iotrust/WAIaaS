# Phase 31: 데이터 모델 + 타입 기반 설계 - Research

**Researched:** 2026-02-08
**Domain:** SQLite 스키마 변경 + TypeScript 타입 정의 + Drizzle ORM 마이그레이션 + BEGIN IMMEDIATE 트랜잭션 원자화
**Confidence:** HIGH

## Summary

Phase 31은 v0.8 마일스톤의 첫 번째 페이즈로, 모든 후속 설계의 기반이 되는 데이터 모델 변경과 핵심 타입 정의를 확정한다. 변경 범위는 (1) agents 테이블의 owner_address nullable 전환 + owner_verified 컬럼 추가, (2) OwnerState/SweepResult/PolicyDecision.downgraded 등 핵심 타입 정의, (3) IChainAdapter.sweepAll 시그니처 추가 (19->20개), (4) Grace->Locked 전이의 BEGIN IMMEDIATE 트랜잭션 원자화 설계이다.

이 페이즈는 코드 구현이 아닌 **설계 문서 수정**이 산출물이다. 기존 25-sqlite-schema(CORE-02), 27-chain-adapter-interface(CORE-04), 32-transaction-pipeline-api, 33-time-lock-approval-mechanism 설계 문서에 v0.8 변경 사항을 반영하고, v0.8-ARCHITECTURE.md에서 이미 정의된 상세 구조를 공식 설계 문서로 승격시키는 것이 핵심이다.

**Primary recommendation:** v0.8-ARCHITECTURE.md(이미 상세 분석 완료)의 내용을 공식 설계 문서 25, 27, 32, 33에 [v0.8] 태그로 반영하고, 마이그레이션 SQL과 Drizzle ORM 정의를 확정하라.

## Standard Stack

본 페이즈에서 직접 구현하는 코드는 없으므로, "standard stack"은 설계 대상인 기존 기술 스택을 의미한다.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | 0.45.x | TypeScript 스키마 정의, 쿼리 빌더 | 프로젝트 확정 (CORE-02) |
| `better-sqlite3` | 12.6.x | 동기식 SQLite 접근, WAL 모드, `.immediate()` 트랜잭션 | 프로젝트 확정 (CORE-02) |
| `drizzle-kit` | latest | SQL 마이그레이션 파일 자동 생성 | 프로젝트 확정 (CORE-02) |
| `zod` | 3.x | SSoT 타입 정의 (Zod -> TS -> OpenAPI -> Drizzle -> DB CHECK) | 프로젝트 확정 (CORE-02, 45-enum) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| SQLite | 3.25.0+ | ALTER TABLE RENAME TO 지원 필요 | 테이블 재생성 마이그레이션 |
| TypeScript | 5.x | 타입 정의 (discriminated union, literal types) | 모든 타입 정의 |

## Architecture Patterns

### 기존 설계 문서 현재 상태

Phase 31이 변경하는 설계 문서들의 현재 상태와 변경 지점을 정확히 파악해야 한다.

#### 1. agents 테이블 (CORE-02, 25-sqlite-schema)

**현재 상태 (v0.7 확정):**
```typescript
// Drizzle ORM 정의
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),                          // UUID v7
  name: text('name').notNull(),
  chain: text('chain').$type<'solana' | 'ethereum'>().notNull(),
  network: text('network').$type<'mainnet' | 'devnet' | 'testnet'>().notNull(),
  publicKey: text('public_key').notNull(),
  status: text('status', {
    enum: ['CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED']
  }).notNull().default('CREATING'),
  ownerAddress: text('owner_address').notNull(),        // <-- v0.8에서 nullable로 변경
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  suspendedAt: integer('suspended_at', { mode: 'timestamp' }),
  suspensionReason: text('suspension_reason'),
}, (table) => [
  uniqueIndex('idx_agents_public_key').on(table.publicKey),
  index('idx_agents_status').on(table.status),
  index('idx_agents_chain_network').on(table.chain, table.network),
  index('idx_agents_owner_address').on(table.ownerAddress),
  check('check_chain', sql`chain IN ('solana', 'ethereum')`),
  check('check_network', sql`network IN ('mainnet', 'devnet', 'testnet')`),
]);
```

**v0.8 변경 목표 (v0.8 objectives + v0.8-ARCHITECTURE에서 확정):**
```typescript
// 변경 전
ownerAddress: text('owner_address').notNull(),

// 변경 후
ownerAddress: text('owner_address'),                               // nullable
ownerVerified: integer('owner_verified', { mode: 'boolean' })
  .notNull()
  .default(false),                                                 // 신규 컬럼
```

**DDL 변경 목표:**
```sql
CREATE TABLE agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  chain           TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum')),
  network         TEXT NOT NULL CHECK (network IN ('mainnet', 'devnet', 'testnet')),
  public_key      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'CREATING'
    CHECK (status IN ('CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED')),
  owner_address   TEXT,                                  -- [v0.8] NOT NULL -> nullable
  owner_verified  INTEGER NOT NULL DEFAULT 0,            -- [v0.8] 신규: ownerAuth 사용 이력 (0/1)
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  suspended_at    INTEGER,
  suspension_reason TEXT
);
```

#### 2. IChainAdapter 인터페이스 (CORE-04, 27-chain-adapter-interface)

**현재 상태 (v0.7 확정): 19개 메서드**

| # | 메서드 | 카테고리 |
|---|--------|---------|
| 1 | `chain` (readonly) | 식별 |
| 2 | `network` (readonly) | 식별 |
| 3 | `connect()` | 연결 |
| 4 | `disconnect()` | 연결 |
| 5 | `isConnected()` | 연결 |
| 6 | `getBalance()` | 조회 |
| 7 | `buildTransaction()` | 파이프라인 |
| 8 | `simulateTransaction()` | 파이프라인 |
| 9 | `signTransaction()` | 파이프라인 |
| 10 | `submitTransaction()` | 파이프라인 |
| 11 | `getTransactionStatus()` | 조회 |
| 12 | `waitForConfirmation()` | 조회 |
| 13 | `estimateFee()` | 추정 |
| 14 | `getAssets()` | 조회 (v0.6) |
| 15 | `buildContractCall()` | 파이프라인 (v0.6) |
| 16 | `buildApprove()` | 파이프라인 (v0.6) |
| 17 | `buildBatch()` | 파이프라인 (v0.6) |
| 18 | `getCurrentNonce()` | Nonce 관리 (v0.7) |
| 19 | `resetNonceTracker()` | Nonce 관리 (v0.7) |

**v0.8 추가: 20번째 메서드 sweepAll**

v0.8 objectives에서 시그니처 확정:
```typescript
sweepAll(from: string, to: string): Promise<SweepResult>
```

#### 3. PolicyDecision 타입 (32-transaction-pipeline-api)

**현재 상태:**
```typescript
interface PolicyDecision {
  allowed: boolean
  tier: 'INSTANT' | 'NOTIFY' | 'DELAY' | 'APPROVAL'
  reason?: string
  policyId?: string
  delaySeconds?: number
  approvalTimeoutSeconds?: number
}
```

**v0.8 확장 (v0.8-ARCHITECTURE에서 확정):**
```typescript
interface PolicyDecision {
  allowed: boolean
  tier: 'INSTANT' | 'NOTIFY' | 'DELAY' | 'APPROVAL'
  reason?: string
  policyId?: string
  delaySeconds?: number
  approvalTimeoutSeconds?: number
  // [v0.8 추가]
  downgraded?: boolean          // APPROVAL -> DELAY 다운그레이드 여부
  originalTier?: string         // 다운그레이드 전 원래 티어
}
```

#### 4. BEGIN IMMEDIATE 패턴 (33-time-lock-approval-mechanism)

프로젝트 전체에서 이미 BEGIN IMMEDIATE를 표준 패턴으로 사용하고 있다:
- TOCTOU 방지 (Stage 3 정책 평가 + reserved_amount 기록): `evaluateAndReserve()` -- 33-time-lock
- DELAY/APPROVAL 상태 전이: `processDelayedTransaction()` -- 33-time-lock
- 세션 토큰 로테이션: `rotateTx.immediate()` -- 30-session-token-protocol
- 세션 갱신: `updateTx.immediate()` -- 53-session-renewal-protocol
- Owner 승인/거절: `approve()`, `reject()` -- 34-owner-wallet-connection
- Kill Switch cascade: -- 08-RESEARCH

**패턴:**
```typescript
sqlite.transaction(() => {
  // 1. 현재 상태 읽기 (SELECT)
  // 2. 조건 확인
  // 3. 상태 변경 (UPDATE)
  // 4. 부작용 기록 (INSERT audit_log)
}).immediate()   // BEGIN IMMEDIATE: 트랜잭션 시작 시 RESERVED 잠금 획득
```

### Pattern 1: SQLite NOT NULL 제거 -- 테이블 재생성 마이그레이션

**What:** SQLite는 ALTER TABLE로 컬럼의 NOT NULL 제약을 직접 제거할 수 없다. 테이블 재생성이 필요하다.
**When to use:** owner_address NOT NULL -> nullable 전환 시
**Source:** v0.8-ARCHITECTURE.md 섹션 3.1, 25-sqlite-schema 섹션 4.6

**마이그레이션 SQL:**
```sql
-- 모든 작업을 트랜잭션 내에서 수행
BEGIN;

-- Step 1: 새 테이블 생성 (owner_address nullable + owner_verified 추가)
CREATE TABLE agents_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  chain TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum')),
  network TEXT NOT NULL CHECK (network IN ('mainnet', 'devnet', 'testnet')),
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING'
    CHECK (status IN ('CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED')),
  owner_address TEXT,                              -- [v0.8] nullable
  owner_verified INTEGER NOT NULL DEFAULT 0,       -- [v0.8] 신규
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  suspended_at INTEGER,
  suspension_reason TEXT
);

-- Step 2: 기존 데이터 복사 (owner_verified = 0 기본값 적용)
INSERT INTO agents_new
  SELECT id, name, chain, network, public_key, status, owner_address,
         0,    -- owner_verified: 기존 에이전트는 모두 유예 구간 (0)
         created_at, updated_at, suspended_at, suspension_reason
  FROM agents;

-- Step 3: 기존 테이블 삭제
DROP TABLE agents;

-- Step 4: 이름 변경
ALTER TABLE agents_new RENAME TO agents;

-- Step 5: 인덱스 재생성
CREATE UNIQUE INDEX idx_agents_public_key ON agents(public_key);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_chain_network ON agents(chain, network);
CREATE INDEX idx_agents_owner_address ON agents(owner_address);

COMMIT;
```

**핵심 주의사항:**
1. INSERT INTO ... SELECT 시 owner_verified 컬럼 위치가 정확해야 한다 (컬럼 순서 일치)
2. 기존 agents 테이블의 외래키 참조(sessions, transactions, policies)가 CASCADE로 설정되어 있으므로, 테이블 재생성 시 `PRAGMA foreign_keys = OFF`를 먼저 설정해야 외래키 제약 위반이 발생하지 않는다
3. Drizzle-kit generate가 이 패턴을 자동 생성하지만, 수동 검증이 필수이다

**Drizzle-kit 자동 생성과의 관계:**
Drizzle-kit은 NOT NULL 제거를 감지하면 테이블 재생성 마이그레이션을 자동 생성한다. 그러나:
- INSERT INTO ... SELECT의 컬럼 매핑을 검증해야 한다
- owner_verified 신규 컬럼의 DEFAULT 0이 올바르게 적용되는지 확인해야 한다
- 인덱스 재생성이 누락되지 않는지 확인해야 한다

### Pattern 2: Zod SSoT 타입 정의

**What:** Zod 스키마 -> TypeScript 타입 -> OpenAPI -> Drizzle -> DB CHECK 순서로 타입을 정의한다.
**When to use:** OwnerState, SweepResult 등 신규 타입 정의 시
**Source:** 프로젝트 핵심 원칙 (MEMORY.md: "Zod SSoT -> TS -> OpenAPI -> Drizzle -> DB CHECK")

```typescript
// OwnerState를 Zod SSoT로 정의
import { z } from 'zod'

export const OwnerStateSchema = z.enum(['NONE', 'GRACE', 'LOCKED'])
export type OwnerState = z.infer<typeof OwnerStateSchema>

// resolveOwnerState 함수의 입력 타입도 Zod로
export const AgentOwnerInfoSchema = z.object({
  ownerAddress: z.string().nullable(),
  ownerVerified: z.boolean(),
})
export type AgentOwnerInfo = z.infer<typeof AgentOwnerInfoSchema>
```

### Pattern 3: BEGIN IMMEDIATE 원자적 상태 전이

**What:** Grace -> Locked 전이를 BEGIN IMMEDIATE 트랜잭션으로 원자화하여 race condition을 방지한다.
**When to use:** ownerAuth 첫 사용 시 owner_verified 0 -> 1 전환
**Source:** v0.8-ARCHITECTURE.md 섹션 5.3, 33-time-lock 섹션 5

```typescript
/**
 * ownerAuth 첫 사용 시 GRACE -> LOCKED 전이를 원자적으로 수행.
 *
 * Race condition 시나리오:
 * - 동시에 2개의 ownerAuth 요청이 들어오면, 둘 다 owner_verified=0을 읽고
 *   둘 다 1로 설정하려 할 수 있다.
 * - BEGIN IMMEDIATE로 직렬화하면 첫 번째가 1로 설정하고,
 *   두 번째는 이미 1인 상태를 읽어 no-op이 된다 (idempotent).
 */
function markOwnerVerifiedAtomic(
  sqlite: Database,
  agentId: string,
): boolean {
  return sqlite.transaction(() => {
    // 1. 현재 상태 확인
    const agent = sqlite.prepare(
      `SELECT owner_verified FROM agents WHERE id = ?`
    ).get(agentId) as { owner_verified: number } | undefined

    if (!agent) return false

    // 2. 이미 verified면 스킵 (idempotent)
    if (agent.owner_verified === 1) return false

    // 3. 원자적 전이
    sqlite.prepare(
      `UPDATE agents SET owner_verified = 1, updated_at = ? WHERE id = ? AND owner_verified = 0`
    ).run(Math.floor(Date.now() / 1000), agentId)

    return true  // 전이 발생
  }).immediate()
}
```

**핵심:** `WHERE owner_verified = 0` 조건으로 이중 전이를 방지한다. 이 패턴은 프로젝트에서 이미 DELAY/APPROVAL 상태 전이(WHERE status = 'QUEUED')에 사용하고 있는 동일한 패턴이다.

### Pattern 4: discriminated union 확장 (PolicyDecision)

**What:** 기존 PolicyDecision 타입에 optional 필드를 추가하여 하위 호환성을 유지하면서 확장한다.
**When to use:** PolicyDecision에 downgraded, originalTier 추가 시

```typescript
// 기존 호환성을 유지하면서 확장
interface PolicyDecision {
  // 기존 필드 (변경 없음)
  allowed: boolean
  tier: 'INSTANT' | 'NOTIFY' | 'DELAY' | 'APPROVAL'
  reason?: string
  policyId?: string
  delaySeconds?: number
  approvalTimeoutSeconds?: number

  // [v0.8 추가] optional이므로 기존 코드에 영향 없음
  downgraded?: boolean          // APPROVAL -> DELAY 다운그레이드 여부
  originalTier?: 'APPROVAL'     // 다운그레이드 전 원래 티어 (현재는 APPROVAL만 가능)
}
```

**downgraded 필드의 소비자:**
- NotificationService: `downgraded === true`이면 Owner 등록 안내 포함
- 감사 로그: `originalTier` 기록으로 다운그레이드 추적
- CLI/API 응답: 다운그레이드 여부 표시

### Anti-Patterns to Avoid

- **owner_verified에 타임스탬프 저장:** `owner_verified`는 boolean(0/1)이지 타임스탬프가 아니다. "언제 verified되었는가"는 audit_log의 OWNER_VERIFIED 이벤트로 추적한다.
- **OwnerState를 DB 컬럼으로 저장:** OwnerState는 owner_address + owner_verified 조합에서 런타임에 산출하는 파생 상태이다. 별도 컬럼으로 저장하면 동기화 문제가 발생한다.
- **SweepResult를 Drizzle 스키마에 정의:** SweepResult는 체인 어댑터의 반환 타입이지 DB에 저장하는 타입이 아니다. `@waiaas/core`의 인터페이스 파일에 정의한다.
- **마이그레이션에서 PRAGMA foreign_keys 끄기 누락:** 테이블 재생성 시 반드시 `PRAGMA foreign_keys = OFF`를 먼저 설정해야 한다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite NOT NULL 제거 | 수동 ALTER TABLE | Drizzle-kit generate + 수동 검증 | Drizzle-kit이 테이블 재생성 패턴 자동 생성 |
| OwnerState 파생 | owner_state DB 컬럼 | `resolveOwnerState()` 런타임 산출 | 파생 상태를 DB에 저장하면 동기화 오류 |
| 타입 검증 | 수동 if/else 체크 | Zod 스키마 parse | 런타임 검증 + 타입 추론 동시 제공 |
| 트랜잭션 직렬화 | 수동 잠금 플래그 | `better-sqlite3 .immediate()` | SQLite 네이티브 RESERVED 잠금 활용 |

**Key insight:** Phase 31의 모든 변경은 기존 패턴의 확장이다. 새로운 기술이나 라이브러리가 필요하지 않으며, v0.7까지 확립된 패턴(Drizzle 마이그레이션, BEGIN IMMEDIATE, Zod SSoT)을 그대로 적용한다.

## Common Pitfalls

### Pitfall 1: SQLite 테이블 재생성 시 외래키 참조 깨짐
**What goes wrong:** agents 테이블을 DROP하면 sessions, transactions, policies의 외래키가 무효화된다.
**Why it happens:** SQLite의 ALTER TABLE 제약으로 테이블 재생성이 필요하지만, 외래키를 활성화한 상태에서 DROP하면 참조 무결성 오류 발생.
**How to avoid:**
1. 마이그레이션 시작 시 `PRAGMA foreign_keys = OFF`
2. 전체 작업을 트랜잭션으로 감싸기
3. 마이그레이션 완료 후 `PRAGMA foreign_keys = ON`
4. `PRAGMA foreign_key_check` 실행으로 무결성 확인
**Warning signs:** 마이그레이션 SQL에 `PRAGMA foreign_keys` 설정이 없으면 위험.

### Pitfall 2: owner_verified 기본값 불일치
**What goes wrong:** 기존 에이전트(이미 owner_address가 있는)의 owner_verified가 잘못 설정된다.
**Why it happens:** 기존 에이전트의 Owner 주소는 v0.5에서 NOT NULL 필수로 등록된 것이므로, ownerAuth를 사용한 적이 있는지 알 수 없다.
**How to avoid:** 기존 에이전트는 모두 `owner_verified = 0` (유예 구간)으로 설정한다. ownerAuth 사용 이력은 audit_log에서 확인 가능하지만, 안전한 기본값은 0이다. v0.8-ARCHITECTURE.md 섹션 3.1에서 이미 확정.
**Warning signs:** 마이그레이션에서 기존 에이전트의 owner_verified를 1로 설정하는 로직이 있다면 재검토 필요.

### Pitfall 3: Drizzle mode: 'boolean' vs INTEGER 0/1
**What goes wrong:** `owner_verified`를 `{ mode: 'boolean' }`으로 정의하면 Drizzle ORM이 자동으로 0/1 -> true/false 변환을 수행하지만, raw SQL 쿼리에서는 여전히 0/1로 다뤄야 한다.
**Why it happens:** BEGIN IMMEDIATE 패턴에서 better-sqlite3 raw 쿼리를 직접 사용할 때, boolean과 integer의 혼동.
**How to avoid:** raw SQL에서는 항상 `owner_verified = 0` / `owner_verified = 1`로 비교. Drizzle ORM 쿼리에서는 `agent.ownerVerified` (boolean)으로 사용. 두 접근 방식이 혼재하는 코드에서 주의.
**Warning signs:** raw SQL에서 `owner_verified = true` 같은 표현은 SQLite에서 동작하지 않는다.

### Pitfall 4: SweepResult 타입과 AssetInfo 재사용
**What goes wrong:** SweepResult의 tokensRecovered 필드 타입이 AssetInfo와 다른 구조로 정의되어 타입 불일치.
**Why it happens:** v0.8 objectives에서 `tokensRecovered: AssetInfo[]`로 명시했지만, 실제 sweep 결과에 필요한 필드와 getAssets()가 반환하는 AssetInfo의 필드가 다를 수 있다.
**How to avoid:** SweepResult.tokensRecovered는 AssetInfo를 직접 재사용한다. 추가 정보(txHash 등)는 SweepResult.transactions 배열에 포함. v0.8 objectives 섹션 5.3에서 확정된 구조를 따른다.
**Warning signs:** SweepResult에 AssetInfo와 중복되는 필드가 별도로 정의되어 있다면 재검토.

### Pitfall 5: Grace -> Locked 전이의 idempotency
**What goes wrong:** 동시 ownerAuth 요청 시 race condition으로 이중 전이 시도.
**Why it happens:** 두 요청이 동시에 `owner_verified = 0`을 읽고, 둘 다 1로 설정하려 한다.
**How to avoid:** `WHERE owner_verified = 0` 조건 + BEGIN IMMEDIATE 조합. 첫 번째 요청만 실제 UPDATE가 발생하고, 두 번째 요청은 이미 1인 상태를 읽어 no-op. v0.8-ARCHITECTURE.md 섹션 14.3에서 이 분석이 완료되어 있다.
**Warning signs:** UPDATE 쿼리에 `WHERE owner_verified = 0` 조건이 없으면 idempotency가 보장되지 않는다.

## Code Examples

### OwnerState 타입 정의 (Zod SSoT)

```typescript
// packages/core/src/types/owner.ts
// Source: v0.8-ARCHITECTURE.md 섹션 3.2

import { z } from 'zod'

/**
 * Owner 상태 열거형.
 * owner_address + owner_verified 조합에서 파생된다.
 *
 * NONE:   owner_address = NULL, owner_verified = 0
 * GRACE:  owner_address != NULL, owner_verified = 0
 * LOCKED: owner_address != NULL, owner_verified = 1
 */
export const OwnerStateSchema = z.enum(['NONE', 'GRACE', 'LOCKED'])
export type OwnerState = z.infer<typeof OwnerStateSchema>
```

### resolveOwnerState() 유틸리티

```typescript
// packages/daemon/src/domain/owner-presence.ts
// Source: v0.8-ARCHITECTURE.md 섹션 3.2

import type { OwnerState } from '@waiaas/core'

interface AgentOwnerInfo {
  ownerAddress: string | null
  ownerVerified: boolean       // Drizzle mode: 'boolean' 적용
}

/**
 * 에이전트의 Owner 상태를 산출한다.
 * DB 컬럼 2개(owner_address, owner_verified) 조합으로 3-state를 결정.
 *
 * 이 함수는 순수 함수(pure function)로, DB 접근 없이 입력값만으로 결정한다.
 * 호출 시점에 이미 DB에서 로드된 agent 객체를 전달받는다.
 */
export function resolveOwnerState(agent: AgentOwnerInfo): OwnerState {
  if (agent.ownerAddress === null) return 'NONE'
  if (!agent.ownerVerified) return 'GRACE'
  return 'LOCKED'
}
```

### SweepResult 타입

```typescript
// packages/core/src/interfaces/chain-adapter.types.ts
// Source: v0.8 objectives 섹션 5.3

import type { AssetInfo } from './chain-adapter.types'

/**
 * 전량 회수(sweepAll) 결과.
 *
 * 토큰 배치 전송 + 네이티브 전송 결과를 집계한다.
 * 부분 실패 시 failed 배열이 비어있지 않으며, HTTP 207 응답으로 매핑된다.
 */
interface SweepResult {
  /** 실행된 트랜잭션 목록 (성공한 것만) */
  transactions: Array<{
    txHash: string
    assets: Array<{ mint: string; amount: string }>
  }>

  /** 회수된 네이티브 자산 금액 (최소 단위 문자열) */
  nativeRecovered: string

  /** 회수된 토큰 목록 (v0.6 AssetInfo 재사용) */
  tokensRecovered: AssetInfo[]

  /** Solana 토큰 계정 rent 회수분 (최소 단위 문자열, Solana 전용) */
  rentRecovered?: string

  /** 실패한 토큰 목록 */
  failed: Array<{ mint: string; error: string }>
}
```

### IChainAdapter.sweepAll 시그니처

```typescript
// packages/core/src/interfaces/chain-adapter.ts
// Source: v0.8 objectives 섹션 5.3

interface IChainAdapter {
  // ... 기존 19개 메서드 ...

  /**
   * [20] 에이전트 지갑의 전체 자산을 목표 주소로 회수한다. (v0.8 추가)
   *
   * 실행 순서:
   * 1. getAssets(from) -> 보유 자산 전수 조사
   * 2. 토큰별 transfer + closeAccount -> 배치 처리 (buildBatch 활용)
   * 3. 네이티브 전량 전송 (잔액 - tx fee) -- 반드시 마지막
   *
   * 정책 엔진을 우회한다 (WithdrawService에서 직접 호출).
   * 수신 주소가 agents.owner_address로 고정되므로 공격자 이득 없음.
   *
   * @param from - 에이전트 지갑 주소 (소스)
   * @param to - Owner 지갑 주소 (목적지, agents.owner_address)
   * @returns 회수 결과 (성공/실패 분리)
   *
   * @throws {ChainError} code=INSUFFICIENT_BALANCE -- 잔액 부족 (fee도 없음)
   * @throws {ChainError} code=RPC_ERROR -- RPC 호출 실패
   *
   * @see WITHDRAW-06, WITHDRAW-07 (SOL 마지막 전송)
   */
  sweepAll(from: string, to: string): Promise<SweepResult>
}
```

### PolicyDecision 확장

```typescript
// packages/core/src/interfaces/policy-engine.ts
// Source: v0.8-ARCHITECTURE.md 섹션 4.3

interface PolicyDecision {
  /** 허용 여부 */
  allowed: boolean

  /** 보안 티어 (ALLOW일 때만 유효) */
  tier: 'INSTANT' | 'NOTIFY' | 'DELAY' | 'APPROVAL'

  /** 거부 사유 (DENY일 때) */
  reason?: string

  /** 거부한 정책 ID (DENY일 때) */
  policyId?: string

  /** DELAY 쿨다운 초 */
  delaySeconds?: number

  /** APPROVAL 타임아웃 초 */
  approvalTimeoutSeconds?: number

  // ── [v0.8 추가] ──

  /** APPROVAL -> DELAY 다운그레이드 여부. true이면 알림에 Owner 등록 안내 포함. */
  downgraded?: boolean

  /** 다운그레이드 전 원래 티어. 감사 로그용. */
  originalTier?: 'APPROVAL'
}
```

### agents Drizzle ORM 스키마 (v0.8)

```typescript
// packages/core/src/schema/agents.ts (또는 packages/daemon/src/infrastructure/database/schema.ts)
// Source: v0.8-ARCHITECTURE.md 섹션 3.1

import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const agents = sqliteTable('agents', {
  // ── 식별자 ──
  id: text('id').primaryKey(),
  name: text('name').notNull(),

  // ── 체인 정보 [v0.7 확정: CHECK 제약] ──
  chain: text('chain').$type<'solana' | 'ethereum'>().notNull(),
  network: text('network').$type<'mainnet' | 'devnet' | 'testnet'>().notNull(),
  publicKey: text('public_key').notNull(),

  // ── 상태 ──
  status: text('status', {
    enum: ['CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED']
  }).notNull().default('CREATING'),

  // ── Owner 정보 [v0.8 변경] ──
  ownerAddress: text('owner_address'),                           // [v0.8] NOT NULL 제거 -> nullable
  ownerVerified: integer('owner_verified', { mode: 'boolean' })  // [v0.8] 신규: ownerAuth 사용 이력
    .notNull()
    .default(false),

  // ── 타임스탬프 ──
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  suspendedAt: integer('suspended_at', { mode: 'timestamp' }),
  suspensionReason: text('suspension_reason'),
}, (table) => [
  uniqueIndex('idx_agents_public_key').on(table.publicKey),
  index('idx_agents_status').on(table.status),
  index('idx_agents_chain_network').on(table.chain, table.network),
  index('idx_agents_owner_address').on(table.ownerAddress),   // [v0.8] nullable이지만 인덱스 유지
  check('check_chain', sql`chain IN ('solana', 'ethereum')`),
  check('check_network', sql`network IN ('mainnet', 'devnet', 'testnet')`),
  check('check_owner_verified', sql`owner_verified IN (0, 1)`),  // [v0.8] boolean CHECK 제약
])
```

### Grace -> Locked 전이 원자화

```typescript
// packages/daemon/src/domain/owner-lifecycle.ts
// Source: v0.8-ARCHITECTURE.md 섹션 5.3

import type Database from 'better-sqlite3'

/**
 * ownerAuth 성공 시 Grace -> Locked 전이를 원자적으로 수행한다.
 *
 * BEGIN IMMEDIATE를 사용하여:
 * 1. 현재 owner_verified 상태를 읽고
 * 2. 0이면 1로 전환하고
 * 3. COMMIT한다.
 *
 * 동시 요청 시: 첫 요청만 전이가 발생하고, 이후 요청은 이미 1인 상태를 읽어
 * no-op이 된다 (idempotent). WHERE owner_verified = 0 조건이 이를 보장.
 *
 * @returns true면 전이 발생 (0 -> 1), false면 이미 LOCKED 상태
 */
function markOwnerVerified(sqlite: Database, agentId: string): boolean {
  return sqlite.transaction(() => {
    const result = sqlite.prepare(
      `UPDATE agents
       SET owner_verified = 1, updated_at = ?
       WHERE id = ? AND owner_verified = 0`
    ).run(Math.floor(Date.now() / 1000), agentId)

    return result.changes > 0  // 실제 변경이 발생했는지
  }).immediate()
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| owner_address NOT NULL (v0.5) | owner_address nullable (v0.8) | v0.8 | 에이전트 생성 시 Owner 불필요 |
| 이분법 보안 (전체 적용 or 미적용) | 점진적 해금 (Base/Enhanced) | v0.8 | DELAY까지 자율, APPROVAL 해금 |
| IChainAdapter 19 메서드 (v0.7) | 20 메서드 (sweepAll 추가) | v0.8 | 자금 회수 기능 |
| PolicyDecision 6필드 | PolicyDecision 8필드 (downgraded, originalTier) | v0.8 | 다운그레이드 추적 |

## Open Questions

Phase 31 범위 내에서 해결되지 않지만 인지해야 하는 사항:

1. **owner_verified CHECK 제약 추가 여부**
   - What we know: v0.7에서 CHECK 제약 패턴이 확립됨 (chain, network, status). owner_verified도 0/1만 허용해야 한다.
   - What's unclear: Drizzle ORM의 `{ mode: 'boolean' }`이 자동으로 0/1 CHECK를 생성하는지.
   - Recommendation: 명시적으로 `check('check_owner_verified', sql\`owner_verified IN (0, 1)\`)` 추가. 위 코드 예시에 이미 반영.

2. **마이그레이션 실행 순서와 v1.1 코어 인프라 관계**
   - What we know: v1.1이 첫 코드 구현이므로, 실제 DB에 마이그레이션이 적용되는 시점은 v1.1이다. Phase 31은 설계 문서 수정이 산출물.
   - What's unclear: v1.1에서 첫 스키마 생성 시 이미 v0.8 변경이 반영된 상태로 시작하는지, 아니면 v0.7 스키마를 먼저 생성하고 v0.8 마이그레이션을 별도로 실행하는지.
   - Recommendation: v1.1의 초기 스키마에 v0.8 변경을 이미 포함한다 (owner_address nullable, owner_verified 컬럼). v0.8-ARCHITECTURE.md 섹션 14.1에서 "v1.1에서 첫 스키마 생성 시 이미 nullable로 시작하므로 마이그레이션 문제 없음"으로 분석 완료.

3. **IPolicyEngine 인터페이스 확장 (context 파라미터)**
   - What we know: v0.8-ARCHITECTURE.md 섹션 4.5에서 방안 1(context 전달)을 추천. evaluate() 시그니처에 optional PolicyContext 추가.
   - What's unclear: Phase 31의 범위에 IPolicyEngine 인터페이스 변경이 포함되는지 (Phase 33 정책 다운그레이드 설계에서 다룰 수도 있음).
   - Recommendation: Phase 31에서는 PolicyDecision 타입 확장만 다루고, IPolicyEngine.evaluate() 시그니처 변경은 Phase 33에서 다운그레이드 로직과 함께 설계. 단, PolicyContext 타입은 Phase 31에서 선언해두면 Phase 33의 의존성이 줄어든다.

## Sources

### Primary (HIGH confidence)
- v0.8 objectives: `/Users/minho.yoo/dev/wallet/WAIaaS/objectives/v0.8-optional-owner-progressive-security.md` -- agents DDL, sweepAll, 정책 다운그레이드 전체 정의
- v0.8-ARCHITECTURE.md: `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/research/v0.8-ARCHITECTURE.md` -- 컴포넌트별 변경 분석, 코드 패턴, 빌드 순서
- CORE-02 (25-sqlite-schema): `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/25-sqlite-schema.md` -- 현재 agents 테이블 DDL + Drizzle ORM 정의 + 마이그레이션 전략
- CORE-04 (27-chain-adapter-interface): `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/27-chain-adapter-interface.md` -- 현재 IChainAdapter 19개 메서드 + AssetInfo 타입
- 33-time-lock-approval-mechanism: `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/33-time-lock-approval-mechanism.md` -- PolicyDecision 타입 + BEGIN IMMEDIATE 패턴 + TOCTOU 방지
- 32-transaction-pipeline-api: `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/deliverables/32-transaction-pipeline-api.md` -- PolicyDecision 인터페이스 정의 + Stage 3 정책 평가

### Secondary (MEDIUM confidence)
- v0.8-FEATURES.md: `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/research/v0.8-FEATURES.md` -- 기능별 생태계 분석
- v0.8 ROADMAP: `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/ROADMAP.md` -- Phase 31 범위 + 성공 기준
- v0.8 REQUIREMENTS: `/Users/minho.yoo/dev/wallet/WAIaaS/.planning/REQUIREMENTS.md` -- OWNER-01, OWNER-07, OWNER-08, WITHDRAW-06

### Tertiary (LOW confidence)
- (없음 -- 모든 정보가 프로젝트 내부 문서에서 직접 확인됨)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 모두 프로젝트에서 확정된 기존 기술 (Drizzle, better-sqlite3, Zod)
- Architecture: HIGH -- v0.8-ARCHITECTURE.md에서 이미 상세 분석 완료. Phase 31은 이를 공식 문서로 승격
- Pitfalls: HIGH -- SQLite 테이블 재생성, BEGIN IMMEDIATE 패턴이 프로젝트에서 이미 여러 차례 사용됨

**Research date:** 2026-02-08
**Valid until:** 2026-03-10 (안정적 설계 문서 기반, 외부 의존성 없음)
