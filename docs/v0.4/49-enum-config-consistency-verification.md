# 49. Enum SSoT 빌드타임 검증 + config.toml 테스트 전략 + NOTE 매핑

**Version:** 0.4
**Phase:** 16 - 블록체인 & 일관성 검증 전략
**Status:** Confirmed
**Created:** 2026-02-06
**Requirements:** ENUM-01, ENUM-02, ENUM-03
**References:** 45-enum-unified-mapping.md (9개 Enum SSoT), 24-monorepo-data-directory.md (config.toml), 41-test-levels-matrix-coverage.md (테스트 레벨), 42-mock-boundaries-interfaces-contracts.md (Mock 경계)

---

## 목차

1. [Enum SSoT 파생 체인 아키텍처](#1-enum-ssot-파생-체인-아키텍처)
2. [빌드타임 검증 메커니즘](#2-빌드타임-검증-메커니즘)
3. [Enum 검증 테스트 케이스](#3-enum-검증-테스트-케이스)
4. [config.toml 3단계 로딩 검증 전략](#4-configtoml-3단계-로딩-검증-전략)
5. [NOTE-01~11 테스트 매핑](#5-note-0111-테스트-매핑)
6. [요구사항 충족 매트릭스](#6-요구사항-충족-매트릭스)

---

## 1. Enum SSoT 파생 체인 아키텍처

> **ENUM-01 충족:** 9개 Enum의 DB CHECK = Drizzle = Zod = TypeScript 동기화가 빌드타임 우선 전략으로 자동 검증된다.

### 1.1 단방향 파생 다이어그램

모든 Enum은 단일 `as const` 배열에서 시작하여 한 방향으로만 파생된다. 역방향 파생은 허용하지 않는다.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Enum SSoT 단방향 파생 체인                              │
│                                                                              │
│   [1] as const 배열 (SSoT)                                                   │
│        │                                                                     │
│        ├──→ [2] TypeScript 타입 (typeof ARRAY[number])                       │
│        │         tsc --noEmit에서 불일치 즉시 감지                              │
│        │                                                                     │
│        ├──→ [3] Zod enum (z.enum(ARRAY))                                     │
│        │         컴파일 타임 + 런타임 양쪽 검증                                  │
│        │                                                                     │
│        ├──→ [4] Drizzle text enum (text('col', { enum: [...ARRAY] }))        │
│        │         ORM 레벨 타입 제약                                            │
│        │                                                                     │
│        └──→ [5] DB CHECK SQL (generateCheckConstraint(col, ARRAY))           │
│                  SQLite CHECK 제약 조건 자동 생성                               │
│                                                                              │
│   [LOCKED] 빌드타임 우선 전략                                                  │
│   1차 방어: tsc --noEmit (컴파일 에러)                                         │
│   2차 방어: Zod enum 타입 불일치 (컴파일 에러)                                  │
│   3차 방어: Drizzle text enum 타입 불일치 (컴파일 에러)                          │
│   4차 방어: DB CHECK SQL 자동 생성 (런타임 보완)                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

**핵심 원칙:** `as const` 배열이 변경되면 파생된 모든 곳에서 TypeScript 컴파일러가 즉시 에러를 발생시킨다. 별도의 동기화 스크립트나 런타임 비교가 필요 없다.

### 1.2 9개 Enum 전체 목록 + 파생 코드 패턴

45-enum-unified-mapping.md 기준 9개 Enum 각각에 대해 4곳(TypeScript/Zod/Drizzle/DB CHECK)의 파생 코드 패턴을 명시한다.

---

#### 1.2.1 TransactionStatus (8값)

**SSoT 위치:** `packages/core/src/domain/enums.ts`

```typescript
// [1] SSoT: as const 배열
export const TRANSACTION_STATUSES = [
  'PENDING', 'QUEUED', 'EXECUTING', 'SUBMITTED',
  'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED'
] as const

// [2] TypeScript 타입
export type TransactionStatus = typeof TRANSACTION_STATUSES[number]

// [3] Zod 스키마
export const TransactionStatusEnum = z.enum(TRANSACTION_STATUSES)
```

```typescript
// [4] Drizzle ORM (packages/daemon/src/infrastructure/database/schema.ts)
import { TRANSACTION_STATUSES } from '@waiaas/core'
status: text('status', { enum: [...TRANSACTION_STATUSES] }).notNull().default('PENDING')
```

```sql
-- [5] DB CHECK (마이그레이션 또는 generateCheckConstraint 출력)
CHECK (status IN ('PENDING','QUEUED','EXECUTING','SUBMITTED','CONFIRMED','FAILED','CANCELLED','EXPIRED'))
```

---

#### 1.2.2 TransactionTier (4값)

```typescript
// [1] SSoT
export const TRANSACTION_TIERS = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'] as const

// [2] TypeScript 타입
export type TransactionTier = typeof TRANSACTION_TIERS[number]

// [3] Zod 스키마
export const TransactionTierEnum = z.enum(TRANSACTION_TIERS)
```

```typescript
// [4] Drizzle ORM
tier: text('tier', { enum: [...TRANSACTION_TIERS] })
```

```sql
-- [5] DB CHECK
CHECK (tier IN ('INSTANT','NOTIFY','DELAY','APPROVAL') OR tier IS NULL)
```

---

#### 1.2.3 AgentStatus (5값)

```typescript
// [1] SSoT
export const AGENT_STATUSES = [
  'CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED'
] as const

// [2] TypeScript 타입
export type AgentStatus = typeof AGENT_STATUSES[number]

// [3] Zod 스키마
export const AgentStatusEnum = z.enum(AGENT_STATUSES)
```

```typescript
// [4] Drizzle ORM
status: text('status', { enum: [...AGENT_STATUSES] }).notNull().default('CREATING')
```

```sql
-- [5] DB CHECK
CHECK (status IN ('CREATING','ACTIVE','SUSPENDED','TERMINATING','TERMINATED'))
```

---

#### 1.2.4 PolicyType (4값)

```typescript
// [1] SSoT
export const POLICY_TYPES = [
  'SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT'
] as const

// [2] TypeScript 타입
export type PolicyType = typeof POLICY_TYPES[number]

// [3] Zod 스키마
export const PolicyTypeEnum = z.enum(POLICY_TYPES)
```

```typescript
// [4] Drizzle ORM
type: text('type', { enum: [...POLICY_TYPES] }).notNull()
```

```sql
-- [5] DB CHECK
CHECK (type IN ('SPENDING_LIMIT','WHITELIST','TIME_RESTRICTION','RATE_LIMIT'))
```

---

#### 1.2.5 NotificationChannelType (3값)

```typescript
// [1] SSoT
export const NOTIFICATION_CHANNEL_TYPES = ['TELEGRAM', 'DISCORD', 'NTFY'] as const

// [2] TypeScript 타입
export type NotificationChannelType = typeof NOTIFICATION_CHANNEL_TYPES[number]

// [3] Zod 스키마
export const NotificationChannelTypeEnum = z.enum(NOTIFICATION_CHANNEL_TYPES)
```

```typescript
// [4] Drizzle ORM
type: text('type', { enum: [...NOTIFICATION_CHANNEL_TYPES] }).notNull()
```

```sql
-- [5] DB CHECK
CHECK (type IN ('TELEGRAM','DISCORD','NTFY'))
```

---

#### 1.2.6 AuditLogSeverity (3값)

> **주의:** 소문자 사용 (info, warning, critical). notification_log.level의 대문자(INFO, WARNING, CRITICAL)와 구분.

```typescript
// [1] SSoT
export const AUDIT_LOG_SEVERITIES = ['info', 'warning', 'critical'] as const

// [2] TypeScript 타입
export type AuditLogSeverity = typeof AUDIT_LOG_SEVERITIES[number]

// [3] Zod 스키마
export const AuditLogSeverityEnum = z.enum(AUDIT_LOG_SEVERITIES)
```

```typescript
// [4] Drizzle ORM
severity: text('severity', { enum: [...AUDIT_LOG_SEVERITIES] }).notNull().default('info')
```

```sql
-- [5] DB CHECK
CHECK (severity IN ('info','warning','critical'))
```

---

#### 1.2.7 KillSwitchStatus (3값)

> KillSwitchStatus는 `system_state` 테이블의 JSON 값으로 저장되므로 DB CHECK 대신 Zod 런타임 검증에 의존한다.

```typescript
// [1] SSoT
export const KILL_SWITCH_STATUSES = ['NORMAL', 'ACTIVATED', 'RECOVERING'] as const

// [2] TypeScript 타입
export type KillSwitchStatus = typeof KILL_SWITCH_STATUSES[number]

// [3] Zod 스키마
export const KillSwitchStatusEnum = z.enum(KILL_SWITCH_STATUSES)
```

```typescript
// [4] Drizzle ORM -- system_state 테이블은 key-value 구조이므로 text enum 미적용
// 대신 서비스 레이어에서 Zod 검증:
// const parsed = KillSwitchStatusEnum.parse(JSON.parse(row.value))
```

```sql
-- [5] DB CHECK -- 해당 없음 (system_state는 범용 key-value 테이블)
-- 런타임 Zod 검증으로 보완
```

---

#### 1.2.8 AutoStopRuleType (5값)

```typescript
// [1] SSoT
export const AUTO_STOP_RULE_TYPES = [
  'CONSECUTIVE_FAILURES', 'TIME_RESTRICTION',
  'DAILY_LIMIT_THRESHOLD', 'HOURLY_RATE', 'ANOMALY_PATTERN'
] as const

// [2] TypeScript 타입
export type AutoStopRuleType = typeof AUTO_STOP_RULE_TYPES[number]

// [3] Zod 스키마
export const AutoStopRuleTypeEnum = z.enum(AUTO_STOP_RULE_TYPES)
```

```typescript
// [4] Drizzle ORM
type: text('type', { enum: [...AUTO_STOP_RULE_TYPES] }).notNull()
```

```sql
-- [5] DB CHECK
CHECK (type IN ('CONSECUTIVE_FAILURES','TIME_RESTRICTION','DAILY_LIMIT_THRESHOLD','HOURLY_RATE','ANOMALY_PATTERN'))
```

---

#### 1.2.9 AuditLogEventType (별도 패턴 -- CHECK 없이 TEXT)

> **특수 처리:** AuditLogEventType은 나머지 8개 Enum과 다른 패턴을 따른다.
> 45-enum-unified-mapping.md에서 명시: "CHECK 제약 없이 TEXT로 저장. 이벤트 타입은 확장 가능해야 하므로 TypeScript const object로 관리하고, DB에서는 자유 텍스트로 저장한다."

```typescript
// [1] SSoT: as const 객체 (배열이 아닌 객체 패턴)
export const AUDIT_LOG_EVENT_TYPES = {
  AGENT_CREATED: 'AGENT_CREATED',
  AGENT_ACTIVATED: 'AGENT_ACTIVATED',
  AGENT_SUSPENDED: 'AGENT_SUSPENDED',
  AGENT_TERMINATED: 'AGENT_TERMINATED',
  SESSION_ISSUED: 'SESSION_ISSUED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  TX_REQUESTED: 'TX_REQUESTED',
  TX_QUEUED: 'TX_QUEUED',
  TX_SUBMITTED: 'TX_SUBMITTED',
  TX_CONFIRMED: 'TX_CONFIRMED',
  TX_FAILED: 'TX_FAILED',
  TX_CANCELLED: 'TX_CANCELLED',
  POLICY_VIOLATION: 'POLICY_VIOLATION',
  POLICY_UPDATED: 'POLICY_UPDATED',
  KEYSTORE_UNLOCKED: 'KEYSTORE_UNLOCKED',
  KEYSTORE_LOCKED: 'KEYSTORE_LOCKED',
  KEY_ROTATED: 'KEY_ROTATED',
  KILL_SWITCH_ACTIVATED: 'KILL_SWITCH_ACTIVATED',
  DAEMON_STARTED: 'DAEMON_STARTED',
  DAEMON_STOPPED: 'DAEMON_STOPPED',
  AUTH_FAILED: 'AUTH_FAILED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const

// [2] TypeScript 타입
export type AuditLogEventType = typeof AUDIT_LOG_EVENT_TYPES[keyof typeof AUDIT_LOG_EVENT_TYPES]

// [3] Zod -- 열거형이 아닌 z.string()으로 느슨한 검증
// 코드 내에서는 AUDIT_LOG_EVENT_TYPES 키를 사용하여 타입 안전성 확보
// DB 삽입 시 z.string()으로만 검증 (확장 가능성 보존)
export const AuditLogEventTypeSchema = z.string().min(1)
```

```typescript
// [4] Drizzle ORM -- enum 제약 없이 text만 사용
event_type: text('event_type').notNull()
```

```sql
-- [5] DB CHECK -- 적용하지 않음 (설계 의도)
-- 이유: 이벤트 타입은 확장 가능해야 하며, 새 이벤트 추가 시 마이그레이션 불필요
```

**AuditLogEventType이 다른 8개 Enum과 다른 이유:**

| 항목 | 8개 Enum (폐쇄형) | AuditLogEventType (개방형) |
|------|-------------------|--------------------------|
| DB CHECK | O (값 제한) | X (자유 텍스트) |
| Drizzle enum 옵션 | O (타입 제약) | X (plain text) |
| Zod 검증 | z.enum() (엄격) | z.string() (느슨) |
| 확장 방식 | 마이그레이션 필요 | 코드 추가만으로 확장 |
| SSoT 형태 | as const 배열 | as const 객체 |
| 빌드타임 검증 | 4단계 전체 | 1단계만 (TypeScript 타입) |

### 1.3 Enum 통합 SSoT 파일 구조

모든 Enum의 SSoT는 단일 파일 `packages/core/src/domain/enums.ts`에 집중한다.

```
packages/core/src/domain/enums.ts          # [1] as const 배열 + [2] TypeScript 타입 + [3] Zod 스키마
packages/daemon/src/infrastructure/database/schema.ts  # [4] Drizzle text enum (import from @waiaas/core)
packages/daemon/src/infrastructure/database/checks.ts  # [5] DB CHECK SQL 생성 유틸리티
```

**Import 방향은 항상 단방향:**
```
@waiaas/core (SSoT) ──→ @waiaas/daemon (소비자)
                    ──→ @waiaas/adapter-solana (소비자)
                    ──→ @waiaas/sdk (소비자)
```

---

## 2. 빌드타임 검증 메커니즘

> **[LOCKED] 빌드타임 우선 전략:** TypeScript 컴파일러(`tsc --noEmit`) + lint 규칙으로 Enum 불일치를 즉시 차단한다.

### 2.1 1차 방어: tsc --noEmit (배열 불일치 시 타입 에러)

TypeScript의 `as const` 리터럴 타입 추론에 의해, SSoT 배열에서 파생된 타입과 다른 값을 사용하면 컴파일 에러가 발생한다.

**탐지 시나리오:**

```typescript
// SSoT에 'PAUSED'가 없는 상태에서:
const status: TransactionStatus = 'PAUSED'
// => Type '"PAUSED"' is not assignable to type 'TransactionStatus'. ts(2322)
```

**turbo.json에 이미 설정된 typecheck 태스크:**
```json
{
  "typecheck": {
    "dependsOn": ["^build"],
    "outputs": []
  }
}
```

**실행:** `pnpm turbo typecheck` 또는 `tsc --noEmit` (패키지별)

### 2.2 2차 방어: Zod enum 타입 불일치 (컴파일 에러)

`z.enum(TRANSACTION_STATUSES)`는 SSoT 배열의 리터럴 타입을 그대로 사용하므로, Zod 스키마에서 다른 값을 참조하면 컴파일 에러가 발생한다.

**탐지 시나리오:**

```typescript
// Zod 스키마에서 SSoT 배열이 아닌 다른 배열을 사용하면:
const WrongEnum = z.enum(['PENDING', 'QUEUED', 'PAUSED'] as const)  // 별도 정의

// 이 WrongEnum의 output 타입은 TransactionStatus와 호환되지 않음
// 서비스 레이어에서 TransactionStatus를 기대하는 곳에 WrongEnum의 결과를 전달하면 타입 에러
```

**Anti-pattern 방지:** Zod enum 생성 시 반드시 SSoT 배열을 직접 전달한다.
```typescript
// GOOD: SSoT 배열 직접 사용
const TransactionStatusEnum = z.enum(TRANSACTION_STATUSES)

// BAD: 리터럴 값 직접 기입 (동기화 누락 위험)
const TransactionStatusEnum = z.enum(['PENDING', 'QUEUED', ...])  // NEVER DO THIS
```

### 2.3 3차 방어: Drizzle text enum 타입 불일치 감지

Drizzle ORM의 `text('col', { enum: [...ARRAY] })`는 TypeScript 레벨에서 허용 값을 제한한다. SSoT 배열을 spread하여 전달하면, SSoT에 없는 값을 INSERT/UPDATE하려는 코드에서 컴파일 에러가 발생한다.

**탐지 시나리오:**

```typescript
import { TRANSACTION_STATUSES } from '@waiaas/core'

const transactions = sqliteTable('transactions', {
  status: text('status', { enum: [...TRANSACTION_STATUSES] }).notNull().default('PENDING'),
})

// 다른 패키지에서 잘못된 값 삽입 시도:
await db.insert(transactions).values({ status: 'PAUSED' })
// => Type '"PAUSED"' is not assignable to type '"PENDING" | "QUEUED" | ...' ts(2322)
```

**주의사항:** Drizzle의 enum 옵션은 TypeScript 레벨 제약이지 DB 레벨 제약(CHECK)을 자동 생성하지 않는다. DB CHECK는 4차 방어에서 별도 관리한다.

### 2.4 4차 방어: DB CHECK SQL 생성 유틸리티 (런타임 보완)

TypeScript 컴파일 시점에 DB 스키마를 검증할 수 없으므로, DB CHECK 제약은 런타임 보완 레이어로 관리한다.

**유틸리티 함수:**

```typescript
// packages/daemon/src/infrastructure/database/checks.ts

/**
 * SSoT 배열에서 SQLite CHECK 제약 SQL을 생성한다.
 * 마이그레이션 파일에서 사용하거나 테스트에서 비교 검증에 사용한다.
 */
export function generateCheckConstraint(
  column: string,
  values: readonly string[]
): string {
  const quoted = values.map(v => `'${v}'`).join(', ')
  return `CHECK (${column} IN (${quoted}))`
}

// 사용 예:
// generateCheckConstraint('status', TRANSACTION_STATUSES)
// => "CHECK (status IN ('PENDING','QUEUED','EXECUTING','SUBMITTED','CONFIRMED','FAILED','CANCELLED','EXPIRED'))"
```

### 2.5 DB CHECK 자동화 판단

| 항목 | 결정 | 근거 |
|------|------|------|
| Drizzle가 CHECK를 자동 생성하는가? | 불확실 (MEDIUM confidence) | `drizzle-kit generate` 산출물을 구현 시 확인 필요 (16-RESEARCH.md Open Question #2) |
| CHECK 미생성 시 대응 | 커스텀 마이그레이션 SQL | `generateCheckConstraint()`로 SQL 생성 후 수동 추가 |
| CHECK 생성 시 대응 | 테스트에서 일치 검증 | `sqlite_master`에서 CHECK SQL 파싱 후 SSoT 배열과 비교 |
| AuditLogEventType | CHECK 미적용 (설계 의도) | 확장 가능한 이벤트 타입이므로 DB 레벨 제약 불필요 |

**구현 시 확인 절차:**
1. `drizzle-kit generate`로 마이그레이션 SQL 생성
2. 산출물에 `CHECK` 제약이 포함되는지 확인
3. 포함 시: SSoT 배열 값과 CHECK 값의 일치를 Integration 테스트에서 검증
4. 미포함 시: `generateCheckConstraint()`로 생성한 SQL을 커스텀 마이그레이션에 추가

### 2.6 Enum 변경 프로세스

Enum 값 추가/삭제/변경 시 따라야 할 프로세스:

```
1. SSoT 배열 수정 (packages/core/src/domain/enums.ts)
   ↓
2. tsc --noEmit 실행 → 파생 코드에서 타입 에러 발생 위치 확인
   ↓
3. Zod 스키마 → 자동 반영 (SSoT 배열을 직접 참조하므로)
   ↓
4. Drizzle 스키마 → 자동 반영 (SSoT 배열을 spread하므로)
   ↓
5. drizzle-kit generate → 마이그레이션 SQL 생성
   ↓
6. DB CHECK 확인 → CHECK 누락 시 generateCheckConstraint()로 보완
   ↓
7. 45-enum-unified-mapping.md 대응표 업데이트
   ↓
8. 관련 테스트 업데이트 (새 값에 대한 테스트 케이스 추가)
```

**자동 동기화되는 단계:** 2, 3, 4 (TypeScript 컴파일러가 불일치 감지)
**수동 확인 필요한 단계:** 5, 6, 7, 8 (마이그레이션, 문서, 테스트)

---

## 3. Enum 검증 테스트 케이스

> **ENUM-01 검증:** 빌드타임 + 런타임 + Integration 3단계 테스트로 Enum 일관성을 보장한다.

### 3.1 빌드타임 테스트 (tsc)

빌드타임 검증은 별도 테스트 파일이 아닌 `tsc --noEmit` 실행 자체가 테스트이다. CI에서 `pnpm turbo typecheck`가 통과하면 1차~3차 방어가 모두 검증된 것이다.

| # | 검증 항목 | 검증 방법 | 실패 시 증상 |
|---|----------|----------|------------|
| BT-01 | SSoT 배열에서 TypeScript 타입 파생 정합성 | `tsc --noEmit` | `Type '"X"' is not assignable to type 'EnumType'` |
| BT-02 | SSoT 배열에서 Zod enum 파생 정합성 | `tsc --noEmit` | `Argument of type 'readonly [...]' is not assignable` |
| BT-03 | SSoT 배열에서 Drizzle enum 파생 정합성 | `tsc --noEmit` | `Type '"X"' is not assignable to type '"A" \| "B" \| ...'` |
| BT-04 | 패키지 간 import 정합성 (@waiaas/core -> daemon) | `tsc --noEmit` | 패키지 빌드 순서에 따른 타입 에러 |
| BT-05 | AuditLogEventType const object 타입 정합성 | `tsc --noEmit` | keyof 타입 불일치 |

**CI 통합:** `turbo.json`의 `typecheck` 태스크가 `dependsOn: ["^build"]`로 설정되어, 패키지 빌드 순서를 보장한 후 타입 체크를 실행한다.

### 3.2 런타임 테스트 (Unit)

SSoT 배열과 파생된 Zod/TypeScript 간의 런타임 수준 검증.

**테스트 파일:** `packages/core/test/unit/enums.test.ts`

| # | 테스트 케이스 | Given | When | Then |
|---|-------------|-------|------|------|
| UT-01 | SSoT 배열 값 개수 검증 | TRANSACTION_STATUSES 배열 | .length 확인 | 8 |
| UT-02 | SSoT 배열 값 내용 검증 | TRANSACTION_STATUSES 배열 | 각 값 확인 | 'PENDING', 'QUEUED', ..., 'EXPIRED' 순서대로 |
| UT-03 | Zod enum이 SSoT 배열과 동일 값 수용 | TransactionStatusEnum | .parse('PENDING') | 성공 |
| UT-04 | Zod enum이 SSoT 밖의 값 거부 | TransactionStatusEnum | .parse('PAUSED') | ZodError 발생 |
| UT-05 | 9개 Enum 전체 값 개수 스냅샷 | 모든 SSoT 배열 | 각 배열의 .length | TransactionStatus:8, TransactionTier:4, AgentStatus:5, PolicyType:4, NotificationChannelType:3, AuditLogSeverity:3, KillSwitchStatus:3, AutoStopRuleType:5, AuditLogEventType:23+ |
| UT-06 | generateCheckConstraint 출력 검증 | TRANSACTION_STATUSES | generateCheckConstraint('status', TRANSACTION_STATUSES) | "CHECK (status IN ('PENDING','QUEUED',...))" |
| UT-07 | generateCheckConstraint SQL Injection 방지 | `["val'; DROP TABLE"]` | generateCheckConstraint 호출 | 이스케이프된 안전한 SQL 또는 에러 |
| UT-08 | AuditLogEventType const object 키-값 일치 | AUDIT_LOG_EVENT_TYPES | Object.entries 순회 | 모든 key === value |
| UT-09 | 전 Enum 고유값 검증 (중복 없음) | 각 SSoT 배열 | new Set(array).size | 배열 길이와 동일 |

### 3.3 Integration 테스트 (DB 레벨)

실제 SQLite DB에서 Drizzle ORM과 DB CHECK 제약이 SSoT와 일치하는지 검증한다.

**테스트 파일:** `packages/daemon/test/integration/enum-db-consistency.test.ts`

| # | 테스트 케이스 | Given | When | Then |
|---|-------------|-------|------|------|
| IT-01 | SSoT 값으로 INSERT 성공 | 실제 SQLite + Drizzle 스키마 | TRANSACTION_STATUSES 각 값으로 INSERT | 모든 INSERT 성공 |
| IT-02 | SSoT 밖의 값으로 INSERT 실패 | 실제 SQLite + CHECK 제약 | status='PAUSED'로 INSERT | CHECK 제약 위반 에러 또는 Drizzle 타입 에러 |
| IT-03 | DB CHECK SQL과 SSoT 배열 일치 검증 | sqlite_master 테이블 | CHECK 제약 SQL 파싱 | SSoT 배열의 모든 값이 CHECK에 포함 |
| IT-04 | Drizzle 마이그레이션 후 CHECK 존재 확인 | drizzle-kit generate 산출물 | 마이그레이션 실행 후 sqlite_master 조회 | CHECK 제약이 존재 (또는 Drizzle 미생성 시 수동 추가 확인) |
| IT-05 | AuditLogEventType은 CHECK 없이 임의 값 INSERT 가능 | audit_log 테이블 | event_type='CUSTOM_EVENT'로 INSERT | INSERT 성공 (CHECK 없음) |
| IT-06 | 8개 Enum 테이블 전체 CHECK 존재 여부 | sqlite_master | 각 테이블의 CHECK 제약 조회 | AuditLogEventType 제외 8개 Enum 관련 컬럼에 CHECK 존재 |

**DB CHECK 파싱 방법:**

```typescript
// sqlite_master에서 CHECK 제약 추출
const tableInfo = db.run(sql`
  SELECT sql FROM sqlite_master
  WHERE type = 'table' AND name = 'transactions'
`)
// tableInfo.sql에서 CHECK (...) 파싱 후 SSoT 배열과 비교
```

---

## 4. config.toml 3단계 로딩 검증 전략

> **ENUM-02 충족:** config.toml 3단계 로딩(기본값/TOML/환경변수) 검증 전략이 테스트 케이스 수준으로 정의된다.

### 4.1 3단계 로딩 순서

24-monorepo-data-directory.md 섹션 3.1 SSoT 기준:

```
1. 하드코딩 기본값 (코드 내 DEFAULT_CONFIG)
    |  오버라이드
2. config.toml 파일 (smol-toml로 파싱)
    |  오버라이드
3. 환경변수 (WAIAAS_ 접두어)
```

**Zod 스키마 검증:** 3단계 병합 결과를 `AppConfigSchema.parse()`로 검증한다. 잘못된 값은 ZodError로 즉시 거부된다.

### 4.2 환경변수 매핑 규칙 (SSoT: 24-monorepo-data-directory.md 섹션 3.2)

```
WAIAAS_{SECTION}_{KEY} -> [section].key
```

**주요 매핑 (24-monorepo 표에서 발췌):**

| 환경변수 | TOML 키 | 타입 | 기본값 |
|---------|---------|------|--------|
| `WAIAAS_DAEMON_PORT` | `[daemon].port` | integer | 3100 |
| `WAIAAS_DAEMON_HOSTNAME` | `[daemon].hostname` | string | 127.0.0.1 |
| `WAIAAS_DAEMON_LOG_LEVEL` | `[daemon].log_level` | string | info |
| `WAIAAS_DAEMON_SHUTDOWN_TIMEOUT` | `[daemon].shutdown_timeout` | integer | 30 |
| `WAIAAS_KEYSTORE_ARGON2_MEMORY` | `[keystore].argon2_memory` | integer | 65536 |
| `WAIAAS_SECURITY_SESSION_TTL` | `[security].session_ttl` | integer | 86400 |
| `WAIAAS_SECURITY_POLICY_DEFAULTS_DELAY_SECONDS` | `[security.policy_defaults].delay_seconds` | integer | 300 |
| `WAIAAS_SECURITY_POLICY_DEFAULTS_APPROVAL_TIMEOUT` | `[security.policy_defaults].approval_timeout` | integer | 3600 |
| `WAIAAS_SECURITY_KILL_SWITCH_RECOVERY_COOLDOWN` | `[security.kill_switch].recovery_cooldown` | integer | 1800 |

**특수 환경변수 (config.toml에 매핑하지 않음):**

| 환경변수 | 용도 |
|---------|------|
| `WAIAAS_DATA_DIR` | 데이터 디렉토리 경로 |
| `WAIAAS_MASTER_PASSWORD` | 마스터 패스워드 (비대화형) |
| `WAIAAS_MASTER_PASSWORD_FILE` | 마스터 패스워드 파일 경로 |

### 4.3 테스트 케이스 (Given-When-Then)

**테스트 파일:** `packages/daemon/test/unit/config-loader.test.ts`
**테스트 레벨:** Unit (memfs/mock으로 config.toml 모킹, process.env 조작)

| # | 시나리오 | Given | When | Then |
|---|---------|-------|------|------|
| CF-01 | 기본값만 사용 | config.toml이 존재하지 않음, 환경변수 없음 | loadConfig({ dataDir: '/nonexistent' }) | port=3100, hostname='127.0.0.1', log_level='info', shutdown_timeout=30, session_ttl=86400 |
| CF-02 | 부분 오버라이드 | config.toml에 `[daemon]\nport = 4000` 만 존재 | loadConfig({ dataDir, tomlContent }) | port=4000, hostname='127.0.0.1' (기본값 유지) |
| CF-03 | 환경변수 우선순위 | config.toml에 port=4000, WAIAAS_DAEMON_PORT=5000 | loadConfig() | port=5000 (환경변수 승리) |
| CF-04 | Docker 환경 hostname | WAIAAS_DAEMON_HOSTNAME=0.0.0.0 | loadConfig() | hostname='0.0.0.0' (Docker 허용) |
| CF-05 | 중첩 섹션 환경변수 | WAIAAS_SECURITY_POLICY_DEFAULTS_DELAY_SECONDS=600 | loadConfig() | security.policy_defaults.delay_seconds=600 |
| CF-06 | 잘못된 값: port 음수 | config.toml에 port = -1 | loadConfig() | ZodError 발생 (min(1024) 위반) |
| CF-07 | 범위 밖 값: shutdown_timeout | config.toml에 shutdown_timeout = 999 | loadConfig() | ZodError 발생 (max(300) 위반) |
| CF-08 | 빈 문자열 환경변수 | WAIAAS_DAEMON_PORT="" | loadConfig() | 빈 문자열은 무시되고 기본값 3100 사용, 또는 파싱 에러 발생 |
| CF-09 | 전체 섹션 기본값 | config.toml에 [database] 섹션 없음 | loadConfig() | database.path='data/waiaas.db', wal_checkpoint_interval=300 등 모든 기본값 |
| CF-10 | 다중 환경변수 동시 적용 | WAIAAS_DAEMON_PORT=5000, WAIAAS_DAEMON_LOG_LEVEL=debug, config.toml에 port=4000 | loadConfig() | port=5000 (env), log_level='debug' (env), 나머지 기본값 |
| CF-11 | 특수 환경변수 제외 확인 | WAIAAS_DATA_DIR='/custom', WAIAAS_MASTER_PASSWORD='secret' | loadConfig() | config 객체에 data_dir, master_password 키 없음 |
| CF-12 | Zod 기본값 적용 | config.toml에 `[security]` 섹션만 있고 키 없음 | loadConfig() | session_ttl=86400, nonce_cache_max=1000 등 Zod .default() 적용 |

**테스트 구현 패턴:**

```typescript
// memfs 또는 mock으로 파일시스템 격리
// process.env 조작 후 반드시 cleanup

describe('config.toml 3단계 로딩', () => {
  const originalEnv = { ...process.env }
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test('CF-01: 기본값만 사용', () => {
    const config = loadConfig({ dataDir: '/nonexistent' })
    expect(config.daemon.port).toBe(3100)
    expect(config.daemon.hostname).toBe('127.0.0.1')
    expect(config.daemon.log_level).toBe('info')
    expect(config.daemon.shutdown_timeout).toBe(30)
  })

  test('CF-03: 환경변수 우선순위', () => {
    process.env.WAIAAS_DAEMON_PORT = '5000'
    const config = loadConfig({
      dataDir: '/test',
      tomlContent: '[daemon]\nport = 4000\n'
    })
    expect(config.daemon.port).toBe(5000)
  })
  // ... 나머지 케이스
})
```

---

## 5. NOTE-01~11 테스트 매핑

> **ENUM-03 충족:** NOTE-01~11 중 테스트 필요 4건과 불필요 7건이 분류되고, 테스트 필요 NOTE의 상세 케이스가 매핑된다.

### 5.1 전체 매핑 표

16-RESEARCH.md의 NOTE 분류를 기반으로 전체 매핑을 확정한다.

| NOTE | 제목 | 테스트 필요? | 테스트 레벨 | 매핑 방식 | 분류 근거 |
|------|------|:----------:|-----------|----------|----------|
| NOTE-01 | BalanceInfo 단위 변환 규칙 | O | Unit | 전용 테스트 (formatAmount/parseAmount) | 변환 공식 검증이 필요한 비즈니스 로직 |
| NOTE-02 | 알림 채널-정책 연동 규칙 | O | Integration | SEC-02 시나리오 확장 | 채널 <2일 때 INSTANT만 허용하는 규칙 검증 |
| NOTE-03 | MCP-REST API 패리티 매트릭스 | X | - | 문서 추적만 | 매트릭스 자체는 테스트 불가, MCP 구현 시 커버 |
| NOTE-04 | SDK 에러 코드 타입 매핑 | X | - | 빌드타임 (tsc) | TypeScript 타입으로 강제, 별도 테스트 불필요 |
| NOTE-05 | Tauri IPC+HTTP 에러 처리 | X | - | Platform 테스트 (Phase 18) | Tauri 환경 특화, Phase 16 범위 밖 |
| NOTE-06 | Setup Wizard vs CLI init | X | - | Platform 테스트 (Phase 18) | 프로세스 레벨, Phase 16 범위 밖 |
| NOTE-07 | Telegram SIWS 대체 방안 | X | - | 설계 가이드 추적만 | 구현 시 Telegram 테스트로 커버 |
| NOTE-08 | Docker shutdown 타임라인 | O (조건부) | Unit | config.toml 테스트에 흡수 | shutdown_timeout 값 범위 검증으로 충분 |
| NOTE-09 | 에이전트 상태 v0.1->v0.2 매핑 | X | - | 불필요 | 과거 이력 문서, v0.2 Enum이 이미 SSoT |
| NOTE-10 | Python SDK snake_case 변환 | X | - | SDK 구현 시 커버 | Phase 16 범위 밖, Python SDK 자체 테스트 영역 |
| NOTE-11 | 커서 페이지네이션 표준 | O | E2E | E2E 테스트에 흡수 | UUID v7 커서 로직 검증 필요 |

**요약:**
- **테스트 필요 4건:** NOTE-01, NOTE-02, NOTE-08, NOTE-11
- **테스트 불필요 7건:** NOTE-03, NOTE-04, NOTE-05, NOTE-06, NOTE-07, NOTE-09, NOTE-10

### 5.2 테스트 필요 NOTE 상세 케이스

---

#### NOTE-01: BalanceInfo 단위 변환 (formatAmount/parseAmount)

**테스트 파일:** `packages/core/test/unit/format-amount.test.ts`
**테스트 레벨:** Unit

| # | 테스트 케이스 | Given | When | Then |
|---|-------------|-------|------|------|
| N01-01 | SOL 기본 변환 | amount=1_000_000_000n, decimals=9 | formatAmount(amount, decimals) | "1.0" (또는 "1") |
| N01-02 | SOL 소수점 이하 | amount=1_500_000n, decimals=9 | formatAmount(amount, decimals) | "0.0015" |
| N01-03 | 0 lamport | amount=0n, decimals=9 | formatAmount(amount, decimals) | "0" |
| N01-04 | 1 lamport (최소 단위) | amount=1n, decimals=9 | formatAmount(amount, decimals) | "0.000000001" |
| N01-05 | 역방향: 문자열 -> lamport | amount="1.5", decimals=9 | parseAmount(amount, decimals) | 1_500_000_000n |

**경계값:**

| # | 테스트 케이스 | Given | When | Then |
|---|-------------|-------|------|------|
| N01-06 | MAX_SAFE_INTEGER 이하 BigInt | amount=9_007_199_254_740_991n | formatAmount(amount, 9) | 올바른 SOL 값 |
| N01-07 | MAX_SAFE_INTEGER 이상 BigInt | amount=9_007_199_254_740_992n | formatAmount(amount, 9) | 정밀도 손실 없이 올바른 값 |
| N01-08 | 음수 금액 거부 | amount=-1n | formatAmount(amount, 9) | 에러 발생 |

---

#### NOTE-02: 알림 채널-정책 연동 규칙

**테스트 파일:** Phase 15 SEC-02-09 (정책 미설정 기본 동작) 시나리오 확장
**테스트 레벨:** Integration (PolicyEngine + NotificationChannel 연동)

| # | 테스트 케이스 | Given | When | Then |
|---|-------------|-------|------|------|
| N02-01 | 활성 채널 0개 시 INSTANT만 허용 | 알림 채널 모두 비활성 | PolicyEngine.evaluate(amount=5 SOL) | tier=INSTANT (DELAY/APPROVAL 불가, NOTIFY 스킵) |
| N02-02 | 활성 채널 1개 시 동작 | Telegram만 활성 | PolicyEngine.evaluate(amount=5 SOL) | tier=DELAY (정상 동작하되 경고 로그) |
| N02-03 | 활성 채널 2개 이상 시 정상 | Telegram + Discord 활성 | PolicyEngine.evaluate(amount=5 SOL) | tier=DELAY (정상 동작, 경고 없음) |
| N02-04 | 채널 0개에서 APPROVAL 시도 | 알림 채널 모두 비활성 | amount >= 10 SOL 거래 요청 | INSTANT로 강등 또는 거부 (채널 부족으로 Owner 알림 불가) |
| N02-05 | 런타임 채널 비활성화 시 | 운영 중 Discord 채널 비활성화 | 다음 거래 요청 시 PolicyEngine 평가 | 활성 채널 재계산, 최소 요구 미달 시 정책 조정 |

---

#### NOTE-08: Docker shutdown 타임라인

**테스트 파일:** `packages/daemon/test/unit/config-loader.test.ts` (config.toml 테스트에 흡수)
**테스트 레벨:** Unit

| # | 테스트 케이스 | Given | When | Then |
|---|-------------|-------|------|------|
| N08-01 | shutdown_timeout 기본값 | config.toml 없음 | loadConfig() | shutdown_timeout=30 |
| N08-02 | shutdown_timeout 최소값 | config.toml에 shutdown_timeout=5 | loadConfig() | shutdown_timeout=5 (정상) |
| N08-03 | shutdown_timeout 최대값 | config.toml에 shutdown_timeout=300 | loadConfig() | shutdown_timeout=300 (정상) |
| N08-04 | shutdown_timeout 범위 밖 | config.toml에 shutdown_timeout=4 | loadConfig() | ZodError (min(5) 위반) |

> **Docker stop_grace_period 35초와의 관계:** Docker Compose에서 `stop_grace_period: 35s`는 데몬의 `shutdown_timeout: 30` + 5초 여유이다. 이 관계는 문서 참조로 충분하며, 코드 검증 대상은 `shutdown_timeout` 값 범위 자체이다.

---

#### NOTE-11: 커서 페이지네이션 표준

**테스트 파일:** `packages/daemon/test/e2e/pagination.test.ts` (E2E에 흡수)
**테스트 레벨:** E2E (Hono test client + 실제 SQLite)

| # | 테스트 케이스 | Given | When | Then |
|---|-------------|-------|------|------|
| N11-01 | 빈 목록 | 데이터 0건 | GET /v1/agents?limit=10 | items: [], nextCursor: null |
| N11-02 | 1건 (단일 페이지) | 에이전트 1건 | GET /v1/agents?limit=10 | items: [1건], nextCursor: null |
| N11-03 | limit+1건 (다음 페이지 존재) | 에이전트 11건 | GET /v1/agents?limit=10 | items: [10건], nextCursor: UUID v7 |
| N11-04 | cursor로 다음 페이지 조회 | 에이전트 15건, 1페이지 cursor 확보 | GET /v1/agents?limit=10&cursor={cursor} | items: [5건], nextCursor: null |
| N11-05 | 잘못된 cursor 형식 | 유효하지 않은 UUID | GET /v1/agents?cursor=invalid | 400 Bad Request |

### 5.3 추적성 매트릭스

| NOTE ID | 테스트 파일/시나리오 ID | 테스트 레벨 | 테스트 케이스 수 |
|---------|----------------------|-----------|---------------|
| NOTE-01 | `packages/core/test/unit/format-amount.test.ts` (N01-01~08) | Unit | 8 |
| NOTE-02 | Phase 15 SEC-02-09 확장 (N02-01~05) | Integration | 5 |
| NOTE-03 | N/A (문서 추적) | - | 0 |
| NOTE-04 | N/A (빌드타임 tsc) | 빌드타임 | 0 (별도 테스트 불필요) |
| NOTE-05 | Phase 18 Platform 테스트 | Platform | 이연 |
| NOTE-06 | Phase 18 Platform 테스트 | Platform | 이연 |
| NOTE-07 | N/A (설계 가이드) | - | 0 |
| NOTE-08 | `packages/daemon/test/unit/config-loader.test.ts` (N08-01~04, CF-07 겸용) | Unit | 4 |
| NOTE-09 | N/A (이력 문서) | - | 0 |
| NOTE-10 | Python SDK 자체 테스트 | Unit (Python) | 이연 |
| NOTE-11 | `packages/daemon/test/e2e/pagination.test.ts` (N11-01~05) | E2E | 5 |

**총계:**
- 테스트 필요 4건: 22개 테스트 케이스 (NOTE-01: 8, NOTE-02: 5, NOTE-08: 4, NOTE-11: 5)
- 테스트 불필요 7건: 0개 전용 테스트 (빌드타임/이연/문서 추적)

---

## 6. 요구사항 충족 매트릭스

### 6.1 ENUM-01~03 크로스 레퍼런스

| 요구사항 ID | 요구사항 설명 | 충족 섹션 | 검증 방법 |
|------------|-------------|----------|----------|
| **ENUM-01** | 9개 Enum SSoT의 DB CHECK = Drizzle = Zod = TypeScript 동기화 검증 방법이 빌드타임 우선으로 정의 | 섹션 1 (파생 체인), 섹션 2 (검증 메커니즘), 섹션 3 (테스트 케이스) | 빌드타임: tsc --noEmit (BT-01~05), Unit: 9개 Enum 값 검증 (UT-01~09), Integration: DB CHECK 일치 (IT-01~06) |
| **ENUM-02** | config.toml 3단계 로딩(기본값/TOML/환경변수) 검증 전략이 테스트 케이스 수준으로 정의 | 섹션 4 (config.toml 검증 전략) | Unit: 12개 Given-When-Then 테스트 케이스 (CF-01~12) |
| **ENUM-03** | NOTE-01~11 중 테스트 필요 4건과 불필요 7건이 분류되고, 테스트 매핑 완료 | 섹션 5 (NOTE 매핑) | 매핑 표 + 상세 Given-When-Then 22개 케이스 + 추적성 매트릭스 |

### 6.2 Phase 14 결정과의 정합성

| Phase 14 결정 | 본 문서 적용 | 정합 여부 |
|--------------|------------|----------|
| TLVL-01: Unit 매 커밋, Integration 매 PR | Enum Unit 테스트 매 커밋, DB Integration 매 PR | O |
| TLVL-01: E2E 매 PR | NOTE-11 페이지네이션 E2E 매 PR | O |
| MOCK-01: MockChainAdapter (canned responses) | Enum/config 테스트는 블록체인 무관, Mock 불필요 | O (해당 없음) |
| MOCK-02: INotificationChannel 모든 레벨 Mock | NOTE-02 Integration에서 Mock 채널 사용 | O |
| CONTRACT-TEST-FACTORY-PATTERN | Enum/config는 인터페이스가 아닌 데이터 모델, Contract Test 해당 없음 | O (해당 없음) |

### 6.3 v0.3 SSoT 문서와의 정합성

| v0.3 SSoT 문서 | 본 문서 참조 | 정합 여부 |
|---------------|------------|----------|
| 45-enum-unified-mapping.md (9개 Enum 대응표) | 섹션 1.2에서 9개 Enum 전체 파생 코드 명시, 값/개수/패턴 100% 일치 | O |
| 24-monorepo-data-directory.md (config.toml 전체 키-값) | 섹션 4.2에서 환경변수 매핑 표 참조, 섹션 4.3 테스트 케이스가 SSoT 범위 커버 | O |
| 45-enum: AuditLogEventType CHECK 없이 TEXT | 섹션 1.2.9에서 특수 처리 명시, IT-05에서 검증 | O |
| 45-enum: AuditLogSeverity 소문자 | 섹션 1.2.6에서 소문자 명시, UT-05 스냅샷에 반영 | O |
| 45-enum: KillSwitchStatus system_state 저장 | 섹션 1.2.7에서 JSON 값 저장 패턴 명시, Zod 런타임 검증 | O |

---

*문서 ID: 49-enum-config-consistency-verification*
*Phase: 16-blockchain-consistency-verification*
*Requirements: ENUM-01, ENUM-02, ENUM-03*
*Status: Confirmed*
