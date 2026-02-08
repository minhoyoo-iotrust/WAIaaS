# Enum 통합 대응표 (ENUM-MAP)

**문서 ID:** ENUM-MAP
**작성일:** 2026-02-06
**v0.6 업데이트:** 2026-02-08
**상태:** 완료
**참조:** CORE-02 (25-sqlite-schema.md), LOCK-MECH (33-time-lock-approval-mechanism.md), KILL-AUTO-EVM (36-killswitch-autostop-evm.md), NOTI-ARCH (35-notification-architecture.md), API-SPEC (37-rest-api-complete-spec.md), CHAIN-EXT-03 (58-contract-call-spec.md), CHAIN-EXT-07 (62-action-provider-architecture.md), CHAIN-EXT-06 (61-price-oracle-spec.md)
**Phase:** 12-high-schema-unification (Plan 12-01)
**해결 항목:** ENUM-01, ENUM-02, ENUM-03, ENUM-04
**v0.6 통합:** INTEG-02 (TransactionType 5개, PolicyType 10개, ActionErrorCode 7개, PriceSource 5개)

---

> **이 문서는 모든 Enum의 단일 진실 소스(SSoT)이다.**
> 구현 시 이 대응표와 일치하지 않는 값은 버그이다.
> DB CHECK, Drizzle ORM, Zod 스키마, TypeScript 타입은 이 대응표와 1:1로 대응해야 한다.

---

## 1. 대응표 요약

| # | Domain | Enum Name | 값 개수 | SSoT 문서 | 비고 |
|---|--------|-----------|---------|----------|------|
| 1 | Transaction | TransactionStatus | 8 | CORE-02 + TX-PIPE | Phase 11 SSoT 확정 |
| 2 | Transaction | TransactionTier | 4 | CORE-02 | Phase 8에서 4-tier 확정 |
| 3 | Transaction | TransactionType | 5 | CHAIN-EXT-03 + CORE-02 | (v0.6 추가) Phase 23 정식화 |
| 4 | Agent | AgentStatus | 5 | CORE-02 | DB CHECK가 SSoT |
| 5 | Policy | PolicyType | 10 | LOCK-MECH + CHAIN-EXT-03 | (v0.6 변경) Phase 8 기존 4개 + Phase 22-23 신규 6개 |
| 6 | Notification | NotificationChannelType | 3 | CORE-02 | 3개 채널 고정 |
| 7 | Audit | AuditLogSeverity | 3 | CORE-02 | lowercase (info, warning, critical) |
| 8 | Audit | AuditLogEventType | 23+ | CORE-02 | 이벤트 타입 목록 |
| 9 | System | KillSwitchStatus | 3 | KILL-AUTO-EVM | system_state 테이블 |
| 10 | AutoStop | AutoStopRuleType | 5 | KILL-AUTO-EVM | auto_stop_rules 테이블 |
| 11 | Action | ActionErrorCode | 7 | CHAIN-EXT-07 | (v0.6 추가) Action Provider 에러 코드 |
| 12 | Price | PriceSource | 5 | CHAIN-EXT-06 | (v0.6 추가) 가격 오라클 소스 식별자 |

---

## 2. Enum 상세 대응표

### 2.1 TransactionStatus

**SSoT:** CORE-02 (25-sqlite-schema.md) + TX-PIPE (32-transaction-pipeline-api.md) 상태 머신
**Phase 11 확정:** CRIT-02에서 DB 8개 상태가 SSoT로 확정

| 값 | DB CHECK | Drizzle ORM | Zod Schema | 설명 |
|----|----------|-------------|------------|------|
| `PENDING` | O | O | O | 요청 접수, 정책 평가 전 |
| `QUEUED` | O | O | O | 큐 진입 (DELAY/APPROVAL 대기) |
| `EXECUTING` | O | O | O | 파이프라인 실행 중 |
| `SUBMITTED` | O | O | O | 온체인 제출, 확정 대기 |
| `CONFIRMED` | O | O | O | 온체인 확정 완료 |
| `FAILED` | O | O | O | 실패 (에러 메시지 참조) |
| `CANCELLED` | O | O | O | 사용자/시스템 취소 |
| `EXPIRED` | O | O | O | 시간 초과 (APPROVAL/DELAY) |

**DB CHECK:**
```sql
CHECK (status IN ('PENDING', 'QUEUED', 'EXECUTING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED'))
```

**Drizzle ORM:**
```typescript
status: text('status', {
  enum: ['PENDING', 'QUEUED', 'EXECUTING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED']
}).notNull().default('PENDING')
```

**Zod Schema:**
```typescript
const TransactionStatusEnum = z.enum([
  'PENDING', 'QUEUED', 'EXECUTING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED'
])
```

**TypeScript Type:**
```typescript
type TransactionStatus = z.infer<typeof TransactionStatusEnum>
// = 'PENDING' | 'QUEUED' | 'EXECUTING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'CANCELLED' | 'EXPIRED'
```

**상태 전이 SSoT:** TX-PIPE (32-transaction-pipeline-api.md) 섹션 2.3 상태 전이 매트릭스

---

### 2.2 TransactionTier

**SSoT:** CORE-02 (25-sqlite-schema.md)
**Phase 8 확정:** LOCK-MECH에서 4-tier 보안 분류 확정

| 값 | DB CHECK | Drizzle ORM | Zod Schema | 설명 |
|----|----------|-------------|------------|------|
| `INSTANT` | O | O | O | 즉시 실행 (< 0.1 SOL 기본) |
| `NOTIFY` | O | O | O | 실행 + 알림 (< 1 SOL 기본) |
| `DELAY` | O | O | O | 15분 쿨다운 후 실행 (< 10 SOL 기본) |
| `APPROVAL` | O | O | O | Owner 승인 필요 (>= 10 SOL 기본) |

**DB CHECK:**
```sql
CHECK (tier IN ('INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL') OR tier IS NULL)
```

**Drizzle ORM:**
```typescript
tier: text('tier', {
  enum: ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']
})
```

**Zod Schema:**
```typescript
const TierEnum = z.enum(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'])
```

**TypeScript Type:**
```typescript
type TransactionTier = z.infer<typeof TierEnum>
// = 'INSTANT' | 'NOTIFY' | 'DELAY' | 'APPROVAL'
```

**임계값 SSoT:** LOCK-MECH (33-time-lock-approval-mechanism.md) 4-티어 상태 머신

---

### 2.3 TransactionType (v0.6 추가)

**SSoT:** CHAIN-EXT-03 (58-contract-call-spec.md) + CORE-02 (25-sqlite-schema.md) DB CHECK 제약
**Phase 23 정식화:** Phase 23에서 5개 값의 공식 Enum으로 등록. 기존 transactions.type은 CHECK 제약 없는 TEXT 컬럼이었으나, Phase 23에서 CHECK 제약 추가.

| 값 | DB CHECK | Drizzle ORM | Zod Schema | 설명 | 도입 Phase |
|----|----------|-------------|------------|------|-----------|
| `TRANSFER` | O | O | O | 네이티브 토큰 전송 (SOL, ETH) | Phase 7 (기존) |
| `TOKEN_TRANSFER` | O | O | O | SPL/ERC-20 토큰 전송 | Phase 22 |
| `CONTRACT_CALL` | O | O | O | 임의 컨트랙트/프로그램 호출 | Phase 23 |
| `APPROVE` | O | O | O | 토큰 approve/delegate 권한 위임 | Phase 23 |
| `BATCH` | O | O | O | 다중 instruction 배치 (Solana 전용) | Phase 23 |

**DB CHECK:**
```sql
CHECK (type IN ('TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE', 'BATCH'))
```

**Drizzle ORM:**
```typescript
type: text('type', {
  enum: ['TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE', 'BATCH']
}).notNull()
```

**Zod Schema:**
```typescript
const TransactionTypeEnum = z.enum([
  'TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE', 'BATCH'
])
```

**TypeScript Type:**
```typescript
type TransactionType = z.infer<typeof TransactionTypeEnum>
// = 'TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE' | 'BATCH'
```

**파이프라인 Stage 1 연관:** 32-transaction-pipeline-api.md의 Stage 1에서 discriminatedUnion의 type 필드로 사용된다.

**type별 정책 적용 범위:**

| TransactionType | 적용 PolicyType | 기본 티어 |
|-----------------|----------------|----------|
| `TRANSFER` | SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT | 금액 기반 4-tier |
| `TOKEN_TRANSFER` | SPENDING_LIMIT(USD), ALLOWED_TOKENS, WHITELIST, TIME_RESTRICTION, RATE_LIMIT | USD 기반 4-tier |
| `CONTRACT_CALL` | CONTRACT_WHITELIST, METHOD_WHITELIST, SPENDING_LIMIT | APPROVAL (기본) |
| `APPROVE` | APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE | APPROVE_TIER_OVERRIDE |
| `BATCH` | 개별 instruction별 + 합산 금액 | maxTier(개별, 합산) |

---

### 2.4 AgentStatus

**SSoT:** CORE-02 (25-sqlite-schema.md) DB CHECK 제약
**Phase 12 수정:** ENUM-01 해결 -- REST API Zod를 DB CHECK 5개 값으로 통일

| 값 | DB CHECK | Drizzle ORM | Zod Schema | 설명 |
|----|----------|-------------|------------|------|
| `CREATING` | O | O | O | 에이전트 생성 진행 중 |
| `ACTIVE` | O | O | O | 정상 운영 상태 |
| `SUSPENDED` | O | O | O | 정지됨 (수동/정책/킬스위치) |
| `TERMINATING` | O | O | O | 종료 진행 중 |
| `TERMINATED` | O | O | O | 완전 종료 |

**DB CHECK:**
```sql
CHECK (status IN ('CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED'))
```

**Drizzle ORM:**
```typescript
status: text('status', {
  enum: ['CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED']
}).notNull().default('CREATING')
```

**Zod Schema:**
```typescript
const AgentStatusEnum = z.enum(['CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED'])
```

**TypeScript Type:**
```typescript
type AgentStatus = z.infer<typeof AgentStatusEnum>
// = 'CREATING' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATING' | 'TERMINATED'
```

> **KILL_SWITCH는 DB 상태가 아님.** 섹션 3 "클라이언트 표시 상태" 참조.

---

### 2.5 PolicyType (v0.6 변경: 4개 -> 10개)

**SSoT:** LOCK-MECH (33-time-lock-approval-mechanism.md) + CHAIN-EXT-03 (58-contract-call-spec.md)
**Phase 12 수정:** ENUM-02 해결 -- CORE-02의 CHECK를 Phase 8 기준으로 수정
**Phase 22-23 확장:** ALLOWED_TOKENS(Phase 22) + CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE(Phase 23) 추가

| 값 | DB CHECK | Drizzle ORM | Zod Schema | 설명 | 도입 Phase |
|----|----------|-------------|------------|------|-----------|
| `SPENDING_LIMIT` | O | O | O | 거래 금액 제한 (건당/일간/주간, v0.6 USD 확장) | Phase 8 |
| `WHITELIST` | O | O | O | 허용 주소 목록 | Phase 8 |
| `TIME_RESTRICTION` | O | O | O | 시간대 제한 | Phase 8 |
| `RATE_LIMIT` | O | O | O | 거래 빈도 제한 | Phase 8 |
| `ALLOWED_TOKENS` | O | O | O | 허용 토큰 목록 (미설정 시 토큰 전송 기본 거부) | (v0.6 추가) Phase 22 |
| `CONTRACT_WHITELIST` | O | O | O | 허용 컨트랙트 주소 (미설정 시 CONTRACT_CALL 거부) | (v0.6 추가) Phase 23 |
| `METHOD_WHITELIST` | O | O | O | 허용 함수 selector (EVM 전용) | (v0.6 추가) Phase 23 |
| `APPROVED_SPENDERS` | O | O | O | 허용 spender 주소 (미설정 시 APPROVE 거부) | (v0.6 추가) Phase 23 |
| `APPROVE_AMOUNT_LIMIT` | O | O | O | approve 최대 금액 + 무제한 차단 | (v0.6 추가) Phase 23 |
| `APPROVE_TIER_OVERRIDE` | O | O | O | approve 독립 보안 티어 (SPENDING_LIMIT과 독립) | (v0.6 추가) Phase 23 |

**DB CHECK:**
```sql
CHECK (type IN ('SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT',
  'ALLOWED_TOKENS', 'CONTRACT_WHITELIST', 'METHOD_WHITELIST', 'APPROVED_SPENDERS',
  'APPROVE_AMOUNT_LIMIT', 'APPROVE_TIER_OVERRIDE'))
```

**Drizzle ORM:**
```typescript
type: text('type', {
  enum: ['SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT',
    'ALLOWED_TOKENS', 'CONTRACT_WHITELIST', 'METHOD_WHITELIST', 'APPROVED_SPENDERS',
    'APPROVE_AMOUNT_LIMIT', 'APPROVE_TIER_OVERRIDE']
}).notNull()
```

**Zod Schema:**
```typescript
const PolicyTypeEnum = z.enum([
  // Phase 8 기존 (4개)
  'SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT',
  // Phase 22 추가 (1개)
  'ALLOWED_TOKENS',
  // Phase 23 추가 (5개)
  'CONTRACT_WHITELIST', 'METHOD_WHITELIST', 'APPROVED_SPENDERS',
  'APPROVE_AMOUNT_LIMIT', 'APPROVE_TIER_OVERRIDE',
])
```

**TypeScript Type:**
```typescript
type PolicyType = z.infer<typeof PolicyTypeEnum>
// = 'SPENDING_LIMIT' | 'WHITELIST' | 'TIME_RESTRICTION' | 'RATE_LIMIT'
// | 'ALLOWED_TOKENS' | 'CONTRACT_WHITELIST' | 'METHOD_WHITELIST'
// | 'APPROVED_SPENDERS' | 'APPROVE_AMOUNT_LIMIT' | 'APPROVE_TIER_OVERRIDE'
```

**PolicyType별 적용 TransactionType:**

| PolicyType | 적용 TransactionType | rule_config 스키마 |
|------------|---------------------|-------------------|
| `SPENDING_LIMIT` | TRANSFER, TOKEN_TRANSFER(USD), CONTRACT_CALL(value) | per_transaction, daily_total, weekly_total, instant_max_usd?, notify_max_usd?, delay_max_usd? |
| `WHITELIST` | TRANSFER, TOKEN_TRANSFER | addresses[], mode |
| `TIME_RESTRICTION` | ALL | allowed_hours, allowed_days, timezone |
| `RATE_LIMIT` | ALL | max_tx_per_hour, max_tx_per_day |
| `ALLOWED_TOKENS` | TOKEN_TRANSFER | tokens[{mint, symbol, chain}], unknown_token_action |
| `CONTRACT_WHITELIST` | CONTRACT_CALL | contracts[{address, chain, label}] |
| `METHOD_WHITELIST` | CONTRACT_CALL (EVM) | methods[{address, selector, name}] |
| `APPROVED_SPENDERS` | APPROVE | spenders[{address, chain, label}] |
| `APPROVE_AMOUNT_LIMIT` | APPROVE | max_amount, unlimited_blocked, unlimited_threshold? |
| `APPROVE_TIER_OVERRIDE` | APPROVE | default_tier |

**변경 이력:**
- Phase 6 (CORE-02 원본): `ALLOWED_ADDRESSES` -> Phase 8에서 `WHITELIST`로 변경
- Phase 6 (CORE-02 원본): `AUTO_STOP` -> Phase 8에서 제거 (AutoStopEngine은 별도 시스템, auto_stop_rules 테이블에서 관리)
- Phase 8 (LOCK-MECH): `RATE_LIMIT` 추가
- (v0.6) Phase 22: `ALLOWED_TOKENS` 추가 (토큰 전송 허용 목록)
- (v0.6) Phase 23: 5개 추가 (컨트랙트/approve 정책)

---

### 2.6 NotificationChannelType

**SSoT:** CORE-02 (25-sqlite-schema.md)

| 값 | DB CHECK | Drizzle ORM | Zod Schema | 설명 |
|----|----------|-------------|------------|------|
| `TELEGRAM` | O | O | O | Telegram Bot API (MarkdownV2) |
| `DISCORD` | O | O | O | Discord Webhook (Embed) |
| `NTFY` | O | O | O | ntfy.sh HTTP Push |

**DB CHECK:**
```sql
CHECK (type IN ('TELEGRAM', 'DISCORD', 'NTFY'))
```

**Drizzle ORM:**
```typescript
type: text('type', {
  enum: ['TELEGRAM', 'DISCORD', 'NTFY']
}).notNull()
```

**Zod Schema:**
```typescript
const NotificationChannelTypeEnum = z.enum(['TELEGRAM', 'DISCORD', 'NTFY'])
```

**TypeScript Type:**
```typescript
type NotificationChannelType = z.infer<typeof NotificationChannelTypeEnum>
// = 'TELEGRAM' | 'DISCORD' | 'NTFY'
```

---

### 2.7 AuditLogSeverity

**SSoT:** CORE-02 (25-sqlite-schema.md)

> **주의:** audit_log.severity는 **소문자**를 사용한다 (info, warning, critical).
> notification_log.level은 **대문자**를 사용한다 (INFO, WARNING, CRITICAL).
> 이는 별도 테이블/도메인이므로 의도된 차이이다.

| 값 | DB CHECK | Drizzle ORM | Zod Schema | 설명 |
|----|----------|-------------|------------|------|
| `info` | O | O | O | 일반 정보 이벤트 |
| `warning` | O | O | O | 경고 (정책 위반, 인증 실패 등) |
| `critical` | O | O | O | 긴급 (Kill Switch 발동 등) |

**DB CHECK:**
```sql
CHECK (severity IN ('info', 'warning', 'critical'))
```

**Drizzle ORM:**
```typescript
severity: text('severity', {
  enum: ['info', 'warning', 'critical']
}).notNull().default('info')
```

**Zod Schema:**
```typescript
const AuditLogSeverityEnum = z.enum(['info', 'warning', 'critical'])
```

**TypeScript Type:**
```typescript
type AuditLogSeverity = z.infer<typeof AuditLogSeverityEnum>
// = 'info' | 'warning' | 'critical'
```

---

### 2.8 AuditLogEventType

**SSoT:** CORE-02 (25-sqlite-schema.md) 이벤트 타입 목록

> audit_log.event_type은 CHECK 제약 없이 TEXT로 저장한다.
> 이벤트 타입은 확장 가능해야 하므로 TypeScript const enum으로 관리하고, DB에서는 자유 텍스트로 저장한다.

| 이벤트 타입 | severity | 설명 |
|------------|----------|------|
| `AGENT_CREATED` | info | 에이전트 생성 |
| `AGENT_ACTIVATED` | info | 에이전트 활성화 |
| `AGENT_SUSPENDED` | warning | 에이전트 정지 |
| `AGENT_TERMINATED` | info | 에이전트 종료 |
| `SESSION_ISSUED` | info | 세션 토큰 발급 |
| `SESSION_REVOKED` | info | 세션 토큰 폐기 |
| `SESSION_EXPIRED` | info | 세션 자동 만료 |
| `TX_REQUESTED` | info | 거래 요청 접수 |
| `TX_QUEUED` | info | 거래 큐 진입 |
| `TX_SUBMITTED` | info | 온체인 제출 |
| `TX_CONFIRMED` | info | 온체인 확정 |
| `TX_FAILED` | warning | 거래 실패 |
| `TX_CANCELLED` | info | 거래 취소 |
| `POLICY_VIOLATION` | warning | 정책 위반 감지 |
| `POLICY_UPDATED` | info | 정책 변경 |
| `KEYSTORE_UNLOCKED` | info | 키스토어 잠금 해제 |
| `KEYSTORE_LOCKED` | info | 키스토어 잠금 |
| `KEY_ROTATED` | info | 키 로테이션 |
| `KILL_SWITCH_ACTIVATED` | critical | Kill Switch 발동 |
| `DAEMON_STARTED` | info | 데몬 시작 |
| `DAEMON_STOPPED` | info | 데몬 정상 종료 |
| `AUTH_FAILED` | warning | 인증 실패 |
| `RATE_LIMIT_EXCEEDED` | warning | 속도 제한 초과 |

**TypeScript:**
```typescript
const AuditLogEventType = {
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

type AuditLogEventType = typeof AuditLogEventType[keyof typeof AuditLogEventType]
```

---

### 2.9 KillSwitchStatus

**SSoT:** KILL-AUTO-EVM (36-killswitch-autostop-evm.md)

> Kill Switch 상태는 `system_state` 테이블의 `kill_switch_status` 키에 저장한다.
> agents 테이블의 status와는 별개의 시스템 레벨 상태이다.

| 값 | system_state | Zod Schema | 설명 |
|----|-------------|------------|------|
| `NORMAL` | O | O | 정상 운영 |
| `ACTIVATED` | O | O | Kill Switch 발동, 전체 시스템 잠금 |
| `RECOVERING` | O | O | 복구 진행 중 (인증 검증) |

**system_state 저장:**
```sql
-- key: 'kill_switch_status'
-- value: '"NORMAL"' | '"ACTIVATED"' | '"RECOVERING"' (JSON 문자열)
```

**Zod Schema:**
```typescript
const KillSwitchStatusEnum = z.enum(['NORMAL', 'ACTIVATED', 'RECOVERING'])
```

**TypeScript Type:**
```typescript
type KillSwitchStatus = z.infer<typeof KillSwitchStatusEnum>
// = 'NORMAL' | 'ACTIVATED' | 'RECOVERING'
```

**상태 전이 SSoT:** KILL-AUTO-EVM 섹션 2.1 상태 다이어그램

---

### 2.10 AutoStopRuleType

**SSoT:** KILL-AUTO-EVM (36-killswitch-autostop-evm.md)

> AutoStopEngine의 규칙 타입은 `auto_stop_rules` 테이블에서 관리한다.
> policies 테이블의 PolicyType과는 별개이다 (AutoStop은 별도 시스템).

| 값 | DB CHECK | Drizzle ORM | 설명 |
|----|----------|-------------|------|
| `CONSECUTIVE_FAILURES` | O | O | 연속 거래 실패 감지 (기본 threshold: 3) |
| `TIME_RESTRICTION` | O | O | 비인가 시간대 활동 감지 |
| `DAILY_LIMIT_THRESHOLD` | O | O | 일일 자금 유출 한도 임계 (80%/100%) |
| `HOURLY_RATE` | O | O | 시간당 거래 빈도 이상 감지 |
| `ANOMALY_PATTERN` | O | O | 반복 전송 패턴 감지 |

**DB CHECK:**
```sql
CHECK (type IN ('CONSECUTIVE_FAILURES', 'TIME_RESTRICTION', 'DAILY_LIMIT_THRESHOLD', 'HOURLY_RATE', 'ANOMALY_PATTERN'))
```

**Drizzle ORM:**
```typescript
type: text('type', {
  enum: ['CONSECUTIVE_FAILURES', 'TIME_RESTRICTION', 'DAILY_LIMIT_THRESHOLD', 'HOURLY_RATE', 'ANOMALY_PATTERN']
}).notNull()
```

**TypeScript Type:**
```typescript
type AutoStopRuleType =
  | 'CONSECUTIVE_FAILURES'
  | 'TIME_RESTRICTION'
  | 'DAILY_LIMIT_THRESHOLD'
  | 'HOURLY_RATE'
  | 'ANOMALY_PATTERN'
```

---

### 2.11 ActionErrorCode (v0.6 추가)

**SSoT:** CHAIN-EXT-07 (62-action-provider-architecture.md)
**Phase 24 추가:** Action Provider 에러 코드 7개. 기존 에러 코드 체계(CHAIN-EXT-03 섹션 8)와 일관된 형식.

> Action Provider 에러는 파이프라인 진입 전에 발생한다. resolve() 성공 후에는 기존 파이프라인 에러 체계가 적용된다.

| 에러 코드 | HTTP 상태 | 설명 | 재시도 |
|----------|----------|------|--------|
| `ACTION_NOT_FOUND` | 404 | 존재하지 않는 액션 이름 | X |
| `ACTION_VALIDATION_FAILED` | 400 | 입력 파라미터 Zod 검증 실패 | X |
| `ACTION_RESOLVE_FAILED` | 502 | 외부 API 호출 실패 (Quote API 등) | O |
| `ACTION_RETURN_INVALID` | 500 | resolve() 반환값 스키마 검증 실패 | X |
| `ACTION_PLUGIN_LOAD_FAILED` | 500 | 플러그인 로드 실패 (startup 시) | X |
| `ACTION_NAME_CONFLICT` | 409 | 동일 액션 이름 중복 등록 시도 | X |
| `ACTION_CHAIN_MISMATCH` | 400 | 요청 체인과 프로바이더 지원 체인 불일치 | X |

**TypeScript Type:**
```typescript
export type ActionErrorCode =
  | 'ACTION_NOT_FOUND'
  | 'ACTION_VALIDATION_FAILED'
  | 'ACTION_RESOLVE_FAILED'
  | 'ACTION_RETURN_INVALID'
  | 'ACTION_PLUGIN_LOAD_FAILED'
  | 'ACTION_NAME_CONFLICT'
  | 'ACTION_CHAIN_MISMATCH'
```

**에러 흐름:**
```
[Action Provider 에러] -> (파이프라인 미진입)
ACTION_NOT_FOUND -------> 404 응답
ACTION_RESOLVE_FAILED --> 502 응답 (재시도 가능)
(resolve 성공) ---------> Stage 1: 기존 파이프라인 에러 체계
```

---

### 2.12 PriceSource (v0.6 추가)

**SSoT:** CHAIN-EXT-06 (61-price-oracle-spec.md)
**Phase 24 추가:** 가격 오라클 소스 식별자. IPriceOracle의 PriceInfo.source 필드에 사용.

> PriceSource는 DB CHECK 제약 없이 TypeScript Enum으로만 관리한다. 구현 시 확정.

| 값 | 설명 | 조회 방식 |
|----|------|----------|
| `coingecko` | CoinGecko API (Primary) | HTTP REST |
| `pyth` | Pyth Network (Solana Secondary) | HTTP REST |
| `chainlink` | Chainlink (EVM Secondary) | HTTP REST |
| `jupiter` | Jupiter Price API (Solana 토큰) | HTTP REST |
| `cache` | 캐시된 가격 (stale 포함) | 로컬 LRU |

**Zod Schema:**
```typescript
const PriceSourceEnum = z.enum(['coingecko', 'pyth', 'chainlink', 'jupiter', 'cache'])
```

**TypeScript Type:**
```typescript
type PriceSource = z.infer<typeof PriceSourceEnum>
// = 'coingecko' | 'pyth' | 'chainlink' | 'jupiter' | 'cache'
```

**OracleChain fallback 순서:** CoinGecko(Primary) -> Pyth/Chainlink(Chain-specific Secondary) -> stale cache

---

## 3. 클라이언트 표시 상태

### 3.1 KILL_SWITCH는 DB 상태가 아닌 클라이언트 표시 상태

`KILL_SWITCH`는 agents.status DB CHECK에 포함되지 않는다. Kill Switch 발동 시 에이전트 상태는 다음과 같이 처리된다:

```
DB 저장: status = 'SUSPENDED', suspension_reason = 'kill_switch'
표시:     클라이언트에서 suspension_reason을 확인하여 "킬 스위치 발동" 표시
```

| DB status | suspension_reason | 클라이언트 표시 |
|-----------|-------------------|----------------|
| `SUSPENDED` | `kill_switch` | "킬 스위치 발동" |
| `SUSPENDED` | `policy_violation` | "정책 위반으로 정지" |
| `SUSPENDED` | `manual` | "수동 정지" |
| `SUSPENDED` | `auto_stop` | "자동 정지 규칙 발동" |
| `SUSPENDED` | (기타) | "정지됨" |

**구현 패턴:**
```typescript
function getAgentDisplayStatus(agent: { status: string; suspensionReason: string | null }): string {
  if (agent.status === 'SUSPENDED' && agent.suspensionReason === 'kill_switch') {
    return 'KILL_SWITCH'  // 클라이언트 표시용
  }
  return agent.status
}
```

### 3.2 TransactionStatus + Tier 조합 표시 가이드

Phase 11 CRIT-02에서 확정된 클라이언트 표시 매핑 (37-rest-api-complete-spec.md 참조):

| DB 상태 | Tier | 표시 텍스트 (예시) |
|---------|------|-------------------|
| `PENDING` | - | "승인 대기 중" |
| `QUEUED` | `INSTANT` | "실행 준비됨" |
| `QUEUED` | `DELAY` | "대기 중 (15분 후 실행)" |
| `QUEUED` | `APPROVAL` | "Owner 승인 대기 중" |
| `EXECUTING` | - | "실행 중" |
| `SUBMITTED` | - | "블록체인 전송됨" |
| `CONFIRMED` | - | "완료" |
| `FAILED` | - | "실패" |
| `CANCELLED` | - | "취소됨" |
| `EXPIRED` | - | "시간 초과" |

> **참고**: DB 상태 8개가 SSoT이며, 표시 텍스트는 클라이언트 구현 재량.

---

## 4. API 경로 SSoT

Enum과 함께 혼동 가능한 API 경로도 기록한다.

| 기능 | SSoT 경로 | 구버전 (Phase 7) | 비고 |
|------|----------|------------------|------|
| Nonce 발급 | `/v1/nonce` | `/v1/auth/nonce` | Phase 9 (API-SPEC)에서 경로 단순화 확정 |

> API-SPEC (37-rest-api-complete-spec.md)이 모든 API 경로의 SSoT이다.

---

## 5. 교차 참조 매트릭스

각 Enum이 사용되는 문서와 레이어를 정리한다.

| Enum | DB (CORE-02) | Pipeline (TX-PIPE) | Policy (LOCK-MECH) | Kill Switch (KILL-AUTO-EVM) | Notification (NOTI-ARCH) | REST API (API-SPEC) | SDK (SDK-MCP) | Chain Adapter (CORE-04) | Action Provider (CHAIN-EXT-07) | Price Oracle (CHAIN-EXT-06) |
|------|-------------|-------------------|--------------------|-----------------------------|--------------------------|---------------------|---------------|------------------------|-----------------------------|--------------------------|
| TransactionStatus | O | O | - | - | - | O | O | - | - | - |
| TransactionTier | O | O | O | - | O | O | O | - | - | - |
| TransactionType | O | O | O | - | - | O | O | - | O (resolve 반환) | - |
| AgentStatus | O | - | - | O (SUSPENDED 전이) | - | O | O | - | - | - |
| PolicyType | O | - | O (SSoT) | - | - | O | O | - | - | O (USD 확장) |
| NotificationChannelType | O | - | - | - | O (SSoT) | - | - | - | - | - |
| AuditLogSeverity | O | - | - | - | - | - | - | - | - | - |
| AuditLogEventType | O | - | - | O (감사 기록) | O (이벤트 참조) | - | - | - | - | - |
| KillSwitchStatus | - | - | - | O (SSoT) | - | O | - | - | - | - |
| AutoStopRuleType | - | - | - | O (SSoT) | - | - | - | - | - | - |
| ActionErrorCode | - | - | - | - | - | O | O | - | O (SSoT) | - |
| PriceSource | - | - | - | - | - | - | - | - | - | O (SSoT) |

---

## 6. 수정 이력

### ENUM-01 해결: AgentStatus DB-REST API 일치

- **문제:** DB CHECK 5개 값 (CREATING, ACTIVE, SUSPENDED, TERMINATING, TERMINATED) vs REST API Zod 4개 값 (ACTIVE, SUSPENDED, TERMINATED, KILL_SWITCH)
- **해결:** REST API Zod를 DB CHECK 5개 값으로 통일. KILL_SWITCH는 클라이언트 표시 상태로 분류.
- **수정 문서:** 37-rest-api-complete-spec.md (AgentSummarySchema, DashboardResponse)

### ENUM-02 해결: PolicyType CORE-02-LOCK-MECH 일치

- **문제:** CORE-02 CHECK (SPENDING_LIMIT, ALLOWED_ADDRESSES, TIME_RESTRICTION, AUTO_STOP) vs LOCK-MECH (SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT)
- **해결:** CORE-02를 Phase 8 (LOCK-MECH) 기준으로 수정. ALLOWED_ADDRESSES -> WHITELIST, AUTO_STOP 제거 + RATE_LIMIT 추가.
- **수정 문서:** 25-sqlite-schema.md (policies 테이블 CHECK, Drizzle ORM, rules 예시)

### ENUM-03 해결: TransactionStatus 명시적 기록

- **문제:** 이미 통일되어 있으나 명시적 대응표 없음
- **해결:** 대응표에 8개 상태 기록 (Phase 11 SSoT 확정 결과 반영)

### ENUM-04 해결: 9개 Enum 통합 대응표 산출물

- **결과:** 본 문서 (45-enum-unified-mapping.md)

---

### v0.6 에러 코드 교차 참조 (CHAIN-EXT-03~08)

Phase 22-24에서 정의된 도메인별 에러 코드 전체 목록이다. 37-rest-api-complete-spec.md에 등록되어야 한다.

| # | 에러 코드 | HTTP | 도메인 | 소스 문서 | 설명 |
|---|----------|------|--------|----------|------|
| 1 | `TOKEN_NOT_FOUND` | 404 | tx | CHAIN-EXT-01 | 토큰 민트/컨트랙트 주소 불일치 |
| 2 | `TOKEN_NOT_ALLOWED` | 403 | tx | CHAIN-EXT-01 | ALLOWED_TOKENS에 미등록 |
| 3 | `INSUFFICIENT_TOKEN_BALANCE` | 400 | tx | CHAIN-EXT-01 | 토큰 잔액 부족 |
| 4 | `CONTRACT_CALL_DISABLED` | 403 | tx | CHAIN-EXT-03 | CONTRACT_WHITELIST 미설정 |
| 5 | `CONTRACT_NOT_WHITELISTED` | 403 | tx | CHAIN-EXT-03 | 컨트랙트가 화이트리스트에 없음 |
| 6 | `METHOD_NOT_WHITELISTED` | 403 | tx | CHAIN-EXT-03 | 함수 selector가 메서드 화이트리스트에 없음 (EVM) |
| 7 | `APPROVE_DISABLED` | 403 | tx | CHAIN-EXT-04 | APPROVED_SPENDERS 미설정 |
| 8 | `SPENDER_NOT_APPROVED` | 403 | tx | CHAIN-EXT-04 | spender가 승인 목록에 없음 |
| 9 | `APPROVE_AMOUNT_EXCEEDED` | 403 | tx | CHAIN-EXT-04 | approve 금액 초과 |
| 10 | `UNLIMITED_APPROVE_BLOCKED` | 403 | tx | CHAIN-EXT-04 | 무제한 approve 차단 |
| 11 | `BATCH_NOT_SUPPORTED` | 400 | tx | CHAIN-EXT-05 | 체인이 배치 미지원 (EVM) |
| 12 | `BATCH_SIZE_EXCEEDED` | 400 | tx | CHAIN-EXT-05 | instruction 수 > 20 |
| 13 | `BATCH_POLICY_VIOLATION` | 403 | tx | CHAIN-EXT-05 | 배치 내 정책 위반 |
| 14 | `ACTION_NOT_FOUND` | 404 | action | CHAIN-EXT-07 | 존재하지 않는 액션 |
| 15 | `ACTION_VALIDATION_FAILED` | 400 | action | CHAIN-EXT-07 | 입력 파라미터 검증 실패 |
| 16 | `ACTION_RESOLVE_FAILED` | 502 | action | CHAIN-EXT-07 | 외부 API 호출 실패 |
| 17 | `ACTION_RETURN_INVALID` | 500 | action | CHAIN-EXT-07 | resolve() 반환값 스키마 검증 실패 |
| 18 | `ACTION_PLUGIN_LOAD_FAILED` | 500 | action | CHAIN-EXT-07 | 플러그인 로드 실패 |
| 19 | `ACTION_NAME_CONFLICT` | 409 | action | CHAIN-EXT-07 | 동일 액션 이름 중복 |
| 20 | `ACTION_CHAIN_MISMATCH` | 400 | action | CHAIN-EXT-07 | 체인 불일치 |

### ENUM-05 해결: v0.6 통합 (INTEG-02)

- **추가:** TransactionType 5개 (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH)
- **확장:** PolicyType 4개 -> 10개 (+ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE)
- **추가:** ActionErrorCode 7개 (ACTION_NOT_FOUND 외 6개)
- **추가:** PriceSource 5개 (coingecko, pyth, chainlink, jupiter, cache)
- **추가:** v0.6 에러 코드 교차 참조 20개
- **수정 문서:** 25-sqlite-schema.md (TransactionType CHECK, PolicyType CHECK), 27-chain-adapter-interface.md (메서드 4개 추가)

---

*문서 ID: ENUM-MAP*
*작성일: 2026-02-06*
*v0.6 업데이트: 2026-02-08*
*Phase: 12-high-schema-unification*
*상태: 완료*
