# v0.8 Technology Stack: Owner 선택적 등록 + 점진적 보안 모델

**Project:** WAIaaS v0.8 - Owner Optional Registration + Progressive Security
**Researched:** 2026-02-08
**Scope:** Stack changes/patterns for nullable owner_address migration, sweepAll, progressive security unlock
**Overall Confidence:** HIGH

---

## Executive Summary

v0.8은 **새로운 라이브러리가 전혀 필요하지 않다.** 기존 스택(Drizzle ORM, @solana-program/token, Hono middleware, @solana/kit)으로 모든 기능을 구현할 수 있다. v0.8의 기술적 도전은 라이브러리 선택이 아니라, 기존 스택의 **패턴 확장**에 있다:

1. **Drizzle + SQLite 마이그레이션:** NOT NULL 제거는 SQLite의 ALTER TABLE 제한으로 테이블 재생성이 필요하며, drizzle-kit 자동 마이그레이션 범위 밖이다. 수동 커스텀 마이그레이션 패턴을 사용한다.
2. **@solana-program/token closeAccount:** sweepAll의 Solana 토큰 계정 닫기 + rent 회수는 기존 의존성(`@solana-program/token`)의 `getCloseAccountInstruction`으로 구현한다.
3. **Hono Combine Middleware:** 점진적 보안 해금의 조건부 미들웨어는 Hono 빌트인 `hono/combine` (`every`, `some`, `except`)로 구현한다.

**결론:** 의존성 변경 제로(0). 코드 패턴 변경만 필요.

---

## Retained Stack (v0.1-v0.7 확정, 변경 없음)

이 기술들은 v0.8에서 그대로 유지된다. 재조사하지 않는다.

| Technology | Version | Role in v0.8 |
|------------|---------|-------------|
| Node.js | 22.x LTS | Runtime |
| TypeScript | 5.x | Primary language |
| Hono | 4.x | API server + middleware |
| Drizzle ORM | 0.45.x | SQLite ORM + migration |
| better-sqlite3 | 12.6.x | SQLite driver |
| drizzle-kit | latest | Migration file generation |
| @solana/kit | 3.x | Solana RPC + transaction building |
| @solana-program/token | latest | SPL token operations (v0.6 추가) |
| viem | 2.x | EVM operations (stub) |
| sodium-native | latest | Guarded memory, key encryption |
| jose | latest | JWT HS256 session tokens |
| Zod | 3.x | Schema SSoT |
| lru-cache | 11.x | In-memory caching |
| grammy | 1.39.x | Telegram notifications |

---

## Pattern 1: SQLite NOT NULL Removal Migration

### 문제

`agents.owner_address`를 `NOT NULL`에서 `nullable`로 변경하고, `owner_verified INTEGER NOT NULL DEFAULT 0` 컬럼을 추가해야 한다.

### SQLite 제약

SQLite는 기존 컬럼의 NOT NULL 제약을 ALTER TABLE로 변경할 수 없다. [SQLite ALTER TABLE 문서](https://www.sqlitetutor.com/alter-table/)에 명시된 제한이며, [drizzle-kit도 이를 자동 처리하지 못한다](https://orm.drizzle.team/docs/kit-custom-migrations).

| 변경 유형 | ALTER TABLE 가능 | 대안 |
|----------|:---------------:|------|
| 컬럼 추가 | O | `ALTER TABLE ADD COLUMN` |
| NOT NULL 추가 | X | 테이블 재생성 |
| **NOT NULL 삭제** | **X** | **테이블 재생성** |
| 컬럼 타입 변경 | X | 테이블 재생성 |

### 해결: 수동 커스텀 마이그레이션

drizzle-kit의 `--custom` 플래그로 빈 마이그레이션 파일을 생성한 뒤 수동 SQL을 작성한다.

**생성 명령:**

```bash
cd packages/daemon
pnpm drizzle-kit generate --custom --name=v08-nullable-owner-address
```

**마이그레이션 SQL (테이블 재생성 패턴):**

```sql
-- v0.8: agents.owner_address NOT NULL -> nullable + owner_verified 추가
-- SQLite ALTER TABLE 제한으로 테이블 재생성 필수

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- Step 1: 새 스키마로 테이블 생성
CREATE TABLE agents_new (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  chain           TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum')),
  network         TEXT NOT NULL CHECK (network IN ('mainnet', 'devnet', 'testnet')),
  public_key      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'CREATING'
    CHECK (status IN ('CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED')),
  owner_address   TEXT,                                    -- [v0.8] nullable
  owner_verified  INTEGER NOT NULL DEFAULT 0,              -- [v0.8] 신규
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  suspended_at    INTEGER,
  suspension_reason TEXT
);

-- Step 2: 데이터 복사 (owner_verified = 0 기본값)
INSERT INTO agents_new (id, name, chain, network, public_key, status,
  owner_address, owner_verified, created_at, updated_at, suspended_at, suspension_reason)
SELECT id, name, chain, network, public_key, status,
  owner_address, 0, created_at, updated_at, suspended_at, suspension_reason
FROM agents;

-- Step 3: 원본 테이블 삭제
DROP TABLE agents;

-- Step 4: 새 테이블 이름 변경
ALTER TABLE agents_new RENAME TO agents;

-- Step 5: 인덱스 재생성
CREATE UNIQUE INDEX idx_agents_public_key ON agents(public_key);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_chain_network ON agents(chain, network);
CREATE INDEX idx_agents_owner_address ON agents(owner_address);

COMMIT;

PRAGMA foreign_keys = ON;
```

### Drizzle 스키마 변경

```typescript
// packages/daemon/src/infrastructure/database/tables/agents.ts
// v0.8 변경: ownerAddress nullable, ownerVerified 추가

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  chain: text('chain').$type<'solana' | 'ethereum'>().notNull(),
  network: text('network').$type<'mainnet' | 'devnet' | 'testnet'>().notNull(),
  publicKey: text('public_key').notNull(),
  status: text('status', {
    enum: ['CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED']
  }).notNull().default('CREATING'),

  // [v0.8] NOT NULL -> nullable
  ownerAddress: text('owner_address'),

  // [v0.8] 신규: ownerAuth 사용 이력 (유예/잠금 구간 판단)
  ownerVerified: integer('owner_verified').notNull().default(0),

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

### 주의사항

| 위험 | 완화 |
|------|------|
| 테이블 재생성 중 FK 참조 깨짐 | `PRAGMA foreign_keys = OFF` 후 트랜잭션 내에서 수행 |
| 기존 데이터 손실 | `INSERT INTO ... SELECT` 로 전량 복사. 마이그레이션 전 `VACUUM INTO` 백업 |
| drizzle-kit snapshot 불일치 | 커스텀 마이그레이션 후 `drizzle-kit generate`로 snapshot 갱신 |
| [drizzle-orm #4938](https://github.com/drizzle-team/drizzle-orm/issues/4938) 데이터 손실 버그 | CASCADE 관계 테이블을 수동으로 처리. drizzle-kit 자동 재생성에 맡기지 않음 |

### Confidence: HIGH

- 테이블 재생성 패턴은 25-sqlite-schema.md 섹션 4.6에 이미 정의됨
- v0.5 마이그레이션(섹션 4.7)에서 동일 패턴 사용 경험 있음
- drizzle-kit `--custom` 은 [공식 문서](https://orm.drizzle.team/docs/kit-custom-migrations)에서 확인됨

---

## Pattern 2: sweepAll -- Solana Token Account Close + Rent Recovery

### 문제

Owner가 에이전트 자금을 전량 회수(sweepAll)할 때, SPL 토큰을 전송하고 토큰 계정을 닫아 rent 를 회수해야 한다.

### 필요 API: `getCloseAccountInstruction`

`@solana-program/token` 패키지에 이미 포함된 instruction이다. 별도 패키지 설치 불필요.

**API ([Solana 공식 문서](https://solana.com/docs/tokens/basics/close-account) 확인):**

```typescript
import { getCloseAccountInstruction } from '@solana-program/token'

const closeIx = getCloseAccountInstruction({
  account: tokenAccountAddress,    // 닫을 토큰 계정 주소
  destination: ownerAddress,       // rent SOL 수신 주소 = owner_address
  owner: agentKeypair,             // 토큰 계정 소유자 (에이전트 키)
})
```

### 제약: 토큰 잔액 0 필수

토큰 계정을 닫으려면 잔액이 0이어야 한다. 따라서 sweepAll 실행 순서는:

```
1. getAssets(agentAddress) -> 보유 자산 전수 조사
2. 토큰별: transfer(전량) + closeAccount -> 하나의 배치 트랜잭션
   - transfer: 토큰 잔액을 owner_address로 전송
   - closeAccount: 빈 토큰 계정 닫기 -> rent SOL을 owner_address로
3. 네이티브 SOL 전량 전송 (잔액 - tx fee)
```

### 배치 구성: 기존 buildBatch() 활용

v0.6에서 추가된 `buildBatch()` (IChainAdapter 17번째 메서드)를 사용하여 토큰별 transfer + closeAccount를 원자적 배치로 묶는다.

```typescript
// sweepAll 내부 구현 의사 코드
async sweepAll(from: string, to: string): Promise<SweepResult> {
  const assets = await this.getAssets(from)
  const tokenAssets = assets.filter(a => a.type !== 'native' && a.balance > 0n)

  // 토큰별 transfer + close 배치 (Solana tx당 max 20 instructions)
  const batches = chunkTokenAssets(tokenAssets, 10) // 토큰당 2 ix -> 10 토큰/배치
  for (const batch of batches) {
    const instructions = batch.flatMap(asset => [
      getTransferCheckedInstruction({ /* 전량 전송 */ }),
      getCloseAccountInstruction({ account: asset.ata, destination: to, owner: from })
    ])
    await this.buildBatch({ instructions })
    // -> simulate -> sign -> submit 파이프라인
  }

  // 마지막: 네이티브 SOL 전량 전송
  const solBalance = await this.getBalance(from)
  const fee = await this.estimateFee({ /* SOL transfer */ })
  await this.buildTransaction({ to, amount: solBalance - fee })
}
```

### 기존 의존성으로 충분한 이유

| 필요 기능 | 이미 존재하는 곳 | 추가 설치 |
|-----------|----------------|----------|
| `getCloseAccountInstruction` | `@solana-program/token` (v0.6 추가) | 불필요 |
| `getTransferCheckedInstruction` | `@solana-program/token` (v0.6 추가) | 불필요 |
| `getAssets()` | IChainAdapter 14번째 메서드 (v0.6 추가) | 불필요 |
| `buildBatch()` | IChainAdapter 17번째 메서드 (v0.6 추가) | 불필요 |
| `estimateFee()` | IChainAdapter 13번째 메서드 (v0.2 설계) | 불필요 |

### Confidence: HIGH

- `getCloseAccountInstruction` 은 [Solana 공식 문서](https://solana.com/docs/tokens/basics/close-account)에서 확인됨
- `@solana-program/token`은 v0.6에서 이미 SPL 토큰 전송용으로 의존성에 포함됨
- 배치 트랜잭션 패턴은 60-batch-transaction-spec.md에 이미 설계됨

---

## Pattern 3: Progressive Security Unlock -- Conditional Middleware

### 문제

Owner 유무에 따라 미들웨어 동작을 분기해야 한다:
- Owner 없음: APPROVAL 다운그레이드, 세션 갱신 즉시 확정, Kill Switch 24h 복구
- Owner 있음: APPROVAL 정상 동작, 세션 갱신 거부 윈도우, Kill Switch 30min 복구

### 해결: 런타임 조건 분기 (미들웨어 내부)

Hono의 `hono/combine` (`every`, `some`, `except`)는 **라우트 레벨** 조건 분기에 유용하지만, v0.8의 Owner 유무 분기는 **요청별 런타임 데이터**(DB에서 에이전트 조회 후 owner_address 확인)에 기반하므로, 미들웨어 내부의 조건 분기가 적합하다.

**패턴 A: PolicyEngine 내부 분기 (APPROVAL 다운그레이드)**

```typescript
// PolicyEngine.evaluate() 내부, 기존 §9 maxTier 산출 직후
const finalTier = maxTier(nativeTier, usdTier)

if (finalTier === 'APPROVAL' && !agent.ownerAddress) {
  return {
    tier: 'DELAY',
    downgraded: true,
    originalTier: 'APPROVAL',
    // 알림에 Owner 등록 안내 포함
  }
}
```

이 패턴은 미들웨어가 아니라 **서비스 레이어**(PolicyEngine)의 내부 로직이다. 새로운 미들웨어 슬롯을 추가하지 않는다.

**패턴 B: 기존 미들웨어의 분기 확장 (Kill Switch 복구)**

```typescript
// killSwitchRecoveryHandler 내부
async function handleRecovery(c: Context) {
  const agent = c.get('agent') // authRouter에서 설정된 에이전트 컨텍스트

  if (agent.ownerAddress) {
    // Enhanced: ownerAuth + masterAuth + 30min 대기
    requireAuth(c, 'ownerAuth', 'masterAuth')
    requireCooldown(30 * 60) // 30분
  } else {
    // Base: masterAuth + 24h 대기
    requireAuth(c, 'masterAuth')
    requireCooldown(24 * 60 * 60) // 24시간
  }
}
```

**패턴 C: Hono `except` 활용 (Owner 전용 라우트 보호)**

```typescript
import { except } from 'hono/combine'

// Owner 전용 라우트 그룹
const ownerRoutes = new Hono()

// ownerAuth 미들웨어는 owner_address가 있는 에이전트만 통과
ownerRoutes.use('/*', ownerAuthMiddleware)

ownerRoutes.post('/agents/:agentId/withdraw', withdrawHandler)

app.route('/v1/owner', ownerRoutes)
```

### 새로운 미들웨어 필요 없음

v0.8은 기존 10단계 미들웨어 체인(29-api-framework-design.md 섹션 2.1)에 새로운 슬롯을 추가하지 않는다:

| 미들웨어 | v0.8 변경 |
|----------|----------|
| #1 requestId | 변경 없음 |
| #2 requestLogger | 변경 없음 |
| #3 secureHeaders | 변경 없음 |
| #3.5 globalRateLimit | 변경 없음 |
| #4 corsHandler | 변경 없음 |
| #5 bodyParser | 변경 없음 |
| #6 zodValidator | 변경 없음 |
| #7 killSwitchGuard | **허용 목록에 withdraw 추가 검토** (구현 시 결정) |
| #8 authRouter | **Owner 유무 분기 추가** (ownerAuth 라우트 디스패치) |
| #9 sessionRateLimit | 변경 없음 |
| #10 agentStatusGuard | 변경 없음 |

### Confidence: HIGH

- Hono middleware 패턴은 [공식 문서](https://hono.dev/docs/guides/middleware)에서 확인됨
- `hono/combine`의 `every`, `some`, `except`는 [Hono Combine 문서](https://hono.dev/docs/middleware/builtin/combine)에서 확인됨
- 기존 미들웨어 체인은 29-api-framework-design.md에 10단계로 확정됨

---

## Pattern 4: Owner Lifecycle State Machine (유예/잠금)

### 문제

Owner 등록 후 2단계 생명주기(유예 -> 잠금)를 추적해야 한다. ownerAuth를 한 번이라도 사용하면 유예에서 잠금으로 전환된다.

### 해결: `owner_verified` INTEGER 컬럼

별도의 상태 머신 라이브러리가 필요하지 않다. 2-state 전환이므로 단순 플래그로 충분하다.

```typescript
// 유예 구간: owner_address 존재 + owner_verified = 0
// 잠금 구간: owner_address 존재 + owner_verified = 1

type OwnerLifecyclePhase = 'none' | 'grace' | 'locked'

function getOwnerPhase(agent: Agent): OwnerLifecyclePhase {
  if (!agent.ownerAddress) return 'none'
  return agent.ownerVerified ? 'locked' : 'grace'
}

// ownerAuth 최초 성공 시 owner_verified = 1로 전환
async function onOwnerAuthSuccess(agentId: string): Promise<void> {
  await db.update(agents)
    .set({ ownerVerified: 1, updatedAt: nowEpochSeconds() })
    .where(eq(agents.id, agentId))
}
```

### 별도 라이브러리 불필요한 이유

| 고려 사항 | 판단 |
|-----------|------|
| 상태 수 | 3개 (none/grace/locked) -> 단순 분기로 충분 |
| 전환 조건 | 1개 (ownerAuth 최초 성공) -> if문 1개 |
| 지속성 | DB 컬럼 1개 (INTEGER 0/1) |
| 롤백 | 불가 (locked -> grace 전환 없음, 설계 의도) |

XState 같은 상태 머신 라이브러리는 5+ 상태, 복잡한 전환 규칙, 병렬 상태가 있을 때 가치가 있다. 2-state 단방향 전환에는 과잉.

### Confidence: HIGH

- 이미 설계 문서에 `owner_verified INTEGER NOT NULL DEFAULT 0`으로 확정됨
- 기존 agents.status (5-state)도 라이브러리 없이 관리 중

---

## Pattern 5: Withdraw API + Kill Switch 분기

### 문제

`POST /v1/owner/agents/:agentId/withdraw`는 Kill Switch ACTIVATED 상태에서도 동작해야 할 수 있다.

### 해결: killSwitchGuard 허용 목록 확장

v0.7에서 killSwitchGuard는 4개 경로만 허용한다:
- `GET /v1/health`
- `GET /v1/admin/status`
- `POST /v1/admin/recover`
- `GET /v1/admin/kill-switch`

v0.8에서 withdraw를 Kill Switch 상태에서 허용할지는 **구현 시 결정**이지만, 기술적으로 허용 목록에 경로를 추가하는 것은 단순한 배열 확장이다:

```typescript
const KILL_SWITCH_ALLOWED_PATHS = [
  'GET /v1/health',
  'GET /v1/admin/status',
  'POST /v1/admin/recover',
  'GET /v1/admin/kill-switch',
  // v0.8: Owner 자금 회수 (구현 시 결정)
  // 'POST /v1/owner/agents/:agentId/withdraw',
]
```

### Confidence: HIGH

- killSwitchGuard 패턴은 36-killswitch-autostop-evm.md에 확정됨
- 허용 목록 확장은 코드 1줄 추가

---

## What NOT to Add (and Why)

v0.8에서 추가하지 말아야 할 기술들:

| 기술 | 추가하지 않는 이유 |
|------|-------------------|
| **XState / xstate** | Owner 생명주기가 2-state 단방향. 과잉 엔지니어링 |
| **@solana/spl-token (레거시)** | `@solana-program/token`이 이미 있음. 레거시 패키지와 중복 |
| **ethers.js** | v0.7에서 제거 확정 (viem/siwe로 전환). sweepAll EVM은 EvmStub이므로 불필요 |
| **event-emitter 라이브러리** | Node.js 내장 EventEmitter로 충분. 다운그레이드 알림 발행에 외부 라이브러리 불필요 |
| **cron / scheduler 라이브러리** | Kill Switch 24h/30min 대기는 타임스탬프 비교로 구현. 스케줄러 불필요 |
| **추가 ORM / query builder** | Drizzle ORM이 nullable 컬럼, 조건부 쿼리 모두 지원 |
| **migration 전용 라이브러리** | drizzle-kit `--custom`이 수동 마이그레이션 파일 생성 지원 |

---

## v0.8 Dependency Impact Summary

```
추가 패키지:       0개
삭제 패키지:       0개
버전 업데이트:     0개 (기존 버전 유지)
Drizzle 스키마 변경: 1개 테이블 (agents)
IChainAdapter 확장: 1개 메서드 (sweepAll, 19->20)
미들웨어 변경:     0개 슬롯 추가, 2개 슬롯 내부 분기 확장
마이그레이션 파일:  1개 수동 커스텀 SQL
```

---

## Drizzle ORM v0.8 활용 패턴

### Nullable 컬럼 쿼리

```typescript
import { isNull, isNotNull, eq } from 'drizzle-orm'

// Owner 없는 에이전트 조회
const ownerlessAgents = await db.select()
  .from(agents)
  .where(isNull(agents.ownerAddress))

// Owner 있는 에이전트 조회
const ownedAgents = await db.select()
  .from(agents)
  .where(isNotNull(agents.ownerAddress))

// 특정 Owner의 에이전트 조회
const myAgents = await db.select()
  .from(agents)
  .where(eq(agents.ownerAddress, ownerAddr))
```

### Owner 등록/변경 쿼리

```typescript
// Owner 등록 (set-owner)
await db.update(agents)
  .set({
    ownerAddress: newOwnerAddress,
    updatedAt: nowEpochSeconds(),
  })
  .where(eq(agents.id, agentId))

// Owner 해제 (유예 구간에서만)
await db.update(agents)
  .set({
    ownerAddress: null,
    ownerVerified: 0,
    updatedAt: nowEpochSeconds(),
  })
  .where(
    and(
      eq(agents.id, agentId),
      eq(agents.ownerVerified, 0) // 유예 구간만
    )
  )
```

### Confidence: HIGH

- Drizzle ORM의 `isNull`, `isNotNull` 연산자는 [공식 문서](https://orm.drizzle.team/docs/sql-schema-declaration)에서 확인됨
- nullable 컬럼에 대한 UPDATE SET null은 Drizzle 표준 동작

---

## Integration Points with Existing Stack

v0.8 변경이 기존 스택 컴포넌트에 미치는 영향:

| 컴포넌트 | 영향 | 변경 범위 |
|----------|------|----------|
| **Drizzle schema (agents)** | owner_address nullable, owner_verified 추가 | 스키마 정의 + 커스텀 마이그레이션 SQL 1개 |
| **IChainAdapter** | sweepAll 메서드 1개 추가 (19->20) | 인터페이스 + SolanaAdapter 구현 + EvmStub no-op |
| **SolanaAdapter** | sweepAll 구현: getAssets + transfer + closeAccount + buildBatch | 신규 메서드 1개 (~80 LOC) |
| **PolicyEngine** | evaluate() 결과 후처리에 APPROVAL->DELAY 다운그레이드 | if 분기 1개 (~5 LOC) |
| **NotificationService** | 다운그레이드 알림 템플릿 + Owner 등록 안내 | 알림 템플릿 1개 추가 |
| **killSwitchGuard** | 복구 대기 시간 Owner 유무 분기 | 조건 분기 1개 |
| **authRouter** | ownerAuth 라우트 디스패치에 Owner 유무 체크 | 조건 분기 1개 |
| **SessionRenewalService** | 거부 윈도우 Owner 유무 분기 | 조건 분기 1개 |
| **CLI (agent create)** | --owner 옵션 선택화 | commander option 변경 |
| **CLI (신규 명령)** | agent set-owner, agent remove-owner | 신규 명령 2개 |
| **REST API** | POST /v1/owner/agents/:agentId/withdraw | 신규 엔드포인트 1개 |

---

## Version Matrix (2026-02-08)

v0.8에서 사용하는 모든 패키지. **새로운 추가 없음.**

| Package | Version | Role in v0.8 | v0.8 변경 |
|---------|---------|-------------|----------|
| `drizzle-orm` | 0.45.x | agents 테이블 스키마 변경 | nullable 컬럼 + 신규 컬럼 |
| `drizzle-kit` | latest | 커스텀 마이그레이션 파일 생성 | `--custom` 플래그 활용 |
| `better-sqlite3` | 12.6.x | 테이블 재생성 마이그레이션 실행 | 변경 없음 |
| `@solana/kit` | 3.x | sweepAll SOL 전송 | buildTransaction 활용 |
| `@solana-program/token` | latest | sweepAll closeAccount | getCloseAccountInstruction 활용 |
| `hono` | 4.x | 조건부 미들웨어 분기 | 내부 로직 분기만 |
| `jose` | latest | JWT 세션 토큰 | 변경 없음 |
| `zod` | 3.x | withdraw API 스키마 | 신규 스키마 추가 |
| `grammy` | 1.39.x | 다운그레이드 알림 | 템플릿 추가 |

---

## Roadmap Implications

### Phase Ordering Recommendation

1. **Schema Migration (최우선):** agents 테이블 변경이 모든 기능의 전제 조건이다. owner_address nullable + owner_verified 추가가 완료되어야 후속 기능 구현 가능.

2. **Owner Lifecycle (2순위):** 등록/변경/해제 로직 + CLI 명령 변경. 스키마 변경 직후 구현 가능. 다른 기능의 전제 조건(Owner 유무 판단 함수).

3. **Progressive Security (3순위):** PolicyEngine 다운그레이드, Kill Switch 분기, 세션 갱신 분기. Owner 유무 판단 함수에 의존.

4. **sweepAll + Withdraw API (4순위):** IChainAdapter 확장 + REST API. Owner 등록 기능 완료 후 구현.

5. **Design Doc Updates (병렬 가능):** 14개 기존 설계 문서 수정. 코드 변경과 병렬로 진행 가능.

### Stack Risk Assessment: LOW

v0.8은 기존 스택의 패턴 확장만 수행하므로 기술적 위험이 매우 낮다:
- 새로운 라이브러리 없음 -> 호환성 위험 없음
- SQLite 마이그레이션은 이미 검증된 패턴 (v0.5 4.7절 동일 방식)
- Solana closeAccount는 공식 API -> 안정성 검증됨
- Hono 미들웨어 분기는 표준 패턴 -> 복잡성 낮음

---

## Sources

### HIGH Confidence (공식 문서, npm registry)

- [Drizzle ORM Custom Migrations](https://orm.drizzle.team/docs/kit-custom-migrations) -- `--custom` 플래그 워크플로우
- [Drizzle Kit Generate](https://orm.drizzle.team/docs/drizzle-kit-generate) -- 마이그레이션 파일 생성
- [SQLite ALTER TABLE](https://www.sqlitetutor.com/alter-table/) -- NOT NULL 변경 불가 제약
- [Solana Close Token Account](https://solana.com/docs/tokens/basics/close-account) -- getCloseAccountInstruction API
- [@solana-program/token Documentation](https://www.solana-program.com/docs/token) -- closeAccount instruction
- [Hono Combine Middleware](https://hono.dev/docs/middleware/builtin/combine) -- every, some, except API
- [Hono Middleware Guide](https://hono.dev/docs/guides/middleware) -- 커스텀 미들웨어 패턴

### MEDIUM Confidence (검증된 커뮤니티 소스)

- [drizzle-orm #4938](https://github.com/drizzle-team/drizzle-orm/issues/4938) -- SQLite 테이블 재생성 데이터 손실 버그 보고
- [Hono Factory Helper](https://hono.dev/docs/helpers/factory) -- createMiddleware 패턴

### Project-Internal (이전 마일스톤 설계 문서)

- 25-sqlite-schema.md 섹션 4.6 -- 테이블 재생성 패턴 (v0.2 정의)
- 25-sqlite-schema.md 섹션 4.7 -- v0.5 마이그레이션 선례 (동일 패턴)
- 27-chain-adapter-interface.md -- IChainAdapter 19 메서드 (v0.7 확정)
- 29-api-framework-design.md 섹션 2.1 -- 10단계 미들웨어 체인 (v0.7 확정)
- 31-solana-adapter-detail.md -- SolanaAdapter 구현 패턴
- 57-asset-query-fee-estimation-spec.md -- getAssets() + AssetInfo 스키마
- 60-batch-transaction-spec.md -- buildBatch() 배치 트랜잭션 패턴
