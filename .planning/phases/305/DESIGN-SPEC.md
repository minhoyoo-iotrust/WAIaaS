# Phase 305: Audit Log Query API 설계 스펙

**Phase:** 305
**요구사항:** AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04
**산출물 ID:** OPS-02

---

## 1. 개요

audit_log 테이블의 감사 이벤트 커버리지를 현재 9개에서 20개로 확대하고, 외부에서 필터/페이지네이션으로 감사 로그를 조회할 수 있는 `GET /v1/audit-logs` REST API를 설계한다.

### 1.1 핵심 설계 결정 요약

| 항목 | 결정 | 근거 |
|------|------|------|
| 이벤트 수 | 20개 (기존 9 + 신규 11) | 운영 가시성과 감사 완전성 균형 |
| Pagination | cursor (id AUTOINCREMENT) | 단순성, 성능, 대량 데이터 안정성 |
| 인증 | masterAuth 전용 | 감사 로그는 관리자 보안 데이터 |
| Cursor 타입 | 평문 정수 | id는 공개 가능, Base64 불필요 |
| limit 기본/최대 | 50/200 | 저빈도 관리자 조회 + 대량 내보내기 지원 |
| details 타입 | Record<string, unknown> | 이벤트별 구조 상이, generic 응답 |
| total 필드 | 선택적 (include_total) | COUNT(*) 비용 절감 |

---

## 2. AuditEventType 확대 (AUDIT-03)

### 2.1 전체 이벤트 목록 (20개)

| # | event_type | severity | 카테고리 | 발생 서비스 | 구현 상태 |
|---|-----------|----------|---------|-----------|----------|
| 1 | `WALLET_CREATED` | info | 월렛 | wallets.ts (POST /wallets) | 신규 |
| 2 | `WALLET_SUSPENDED` | warning | 월렛 | wallets.ts (PATCH /wallets/:id) | 신규 |
| 3 | `SESSION_CREATED` | info | 세션 | sessions.ts (POST /sessions) | 신규 |
| 4 | `SESSION_REVOKED` | info | 세션 | sessions.ts (DELETE /sessions/:id) | 신규 |
| 5 | `SESSION_ISSUED_VIA_TELEGRAM` | info | 세션 | telegram-bot-service.ts | 기존 |
| 6 | `TX_SUBMITTED` | info | TX | stages.ts (Stage 5d) | 신규 |
| 7 | `TX_CONFIRMED` | info | TX | stages.ts (Stage 6) | 신규 |
| 8 | `TX_FAILED` | warning | TX | stages.ts (Stage 5/6 실패) | 신규 |
| 9 | `TX_APPROVED_VIA_TELEGRAM` | info | TX | telegram-bot-service.ts | 기존 |
| 10 | `TX_REJECTED_VIA_TELEGRAM` | info | TX | telegram-bot-service.ts | 기존 |
| 11 | `TX_CANCELLED_VIA_TELEGRAM` | info | TX | telegram-bot-service.ts | 기존 |
| 12 | `UNLISTED_TOKEN_TRANSFER` | warning | TX | stages.ts (Stage 3) | 기존 |
| 13 | `POLICY_DENIED` | warning | 정책 | stages.ts (Stage 3) | 신규 |
| 14 | `KILL_SWITCH_ACTIVATED` | critical | Kill Switch | kill-switch-service.ts | 기존 |
| 15 | `KILL_SWITCH_ESCALATED` | critical | Kill Switch | kill-switch-service.ts | 기존 |
| 16 | `KILL_SWITCH_RECOVERED` | warning | Kill Switch | kill-switch-service.ts | 신규 |
| 17 | `AUTO_STOP_TRIGGERED` | warning | AutoStop | autostop-service.ts | 기존 |
| 18 | `MASTER_AUTH_FAILED` | critical | 인증 | master-auth.ts | 신규 |
| 19 | `OWNER_REGISTERED` | info | Owner | wallets.ts | 신규 |
| 20 | `NOTIFICATION_TOTAL_FAILURE` | critical | 알림 | notification-service.ts | 기존 |

### 2.2 카테고리별 분포

| 카테고리 | 이벤트 수 | severity 분포 |
|---------|----------|--------------|
| 월렛 생명주기 | 2 | info 1, warning 1 |
| 세션 생명주기 | 3 | info 3 |
| 트랜잭션 파이프라인 | 6 | info 4, warning 2 |
| 정책 엔진 | 1 | warning 1 |
| Kill Switch | 3 | critical 2, warning 1 |
| AutoStop | 1 | warning 1 |
| 인증 | 1 | critical 1 |
| Owner 생명주기 | 1 | info 1 |
| 알림 시스템 | 1 | critical 1 |
| **합계** | **20** | info 9, warning 6, critical 5 |

### 2.3 Zod SSoT 정의

```typescript
// packages/core/src/schemas/audit.ts

import { z } from 'zod';

export const AUDIT_EVENT_TYPES = [
  'WALLET_CREATED',
  'WALLET_SUSPENDED',
  'SESSION_CREATED',
  'SESSION_REVOKED',
  'SESSION_ISSUED_VIA_TELEGRAM',
  'TX_SUBMITTED',
  'TX_CONFIRMED',
  'TX_FAILED',
  'TX_APPROVED_VIA_TELEGRAM',
  'TX_REJECTED_VIA_TELEGRAM',
  'TX_CANCELLED_VIA_TELEGRAM',
  'UNLISTED_TOKEN_TRANSFER',
  'POLICY_DENIED',
  'KILL_SWITCH_ACTIVATED',
  'KILL_SWITCH_ESCALATED',
  'KILL_SWITCH_RECOVERED',
  'AUTO_STOP_TRIGGERED',
  'MASTER_AUTH_FAILED',
  'OWNER_REGISTERED',
  'NOTIFICATION_TOTAL_FAILURE',
] as const;

export const AuditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

export const AUDIT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export const AuditSeveritySchema = z.enum(AUDIT_SEVERITIES);
export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;
```

### 2.4 삽입 지점 매핑

| event_type | 파일 | 함수/핸들러 | 삽입 시점 | actor |
|-----------|------|-----------|---------|-------|
| `WALLET_CREATED` | api/routes/wallets.ts | POST /wallets 핸들러 | INSERT 직후 | 'master' |
| `WALLET_SUSPENDED` | api/routes/wallets.ts | PATCH /wallets/:id 핸들러 | status UPDATE 직후 | 'master' |
| `SESSION_CREATED` | api/routes/sessions.ts | POST /sessions 핸들러 | INSERT + JWT 발급 직후 | 'master' |
| `SESSION_REVOKED` | api/routes/sessions.ts | DELETE /sessions/:id 핸들러 | revoked_at UPDATE 직후 | 'master' |
| `TX_SUBMITTED` | pipeline/stages.ts | stage5Execute() | status='SUBMITTED' 직후 | sessionId |
| `TX_CONFIRMED` | pipeline/stages.ts | stage6Confirm() | status='CONFIRMED' 직후 | sessionId |
| `TX_FAILED` | pipeline/stages.ts | stage5/6 실패 분기 | status='FAILED' 직후 | sessionId |
| `POLICY_DENIED` | pipeline/stages.ts | stage3Policy() | POLICY_DENIED throw 직전 | sessionId |
| `KILL_SWITCH_RECOVERED` | services/kill-switch-service.ts | recover() | CAS 전이 직후 | recoveredBy |
| `MASTER_AUTH_FAILED` | api/middleware/master-auth.ts | createMasterAuth() | throw 직전 | 'unknown' |
| `OWNER_REGISTERED` | api/routes/wallets.ts | PUT /wallets/:id 핸들러 | owner_address UPDATE 직후 | 'master' |

### 2.5 이벤트별 details JSON 스키마

각 이벤트의 details 필드에 저장되는 JSON 구조:

| event_type | details 필드 |
|-----------|-------------|
| `WALLET_CREATED` | `{ chain, environment, publicKey }` |
| `WALLET_SUSPENDED` | `{ reason, previousStatus, trigger: 'manual' }` |
| `SESSION_CREATED` | `{ walletIds, constraints }` |
| `SESSION_REVOKED` | `{ sessionId, revokedAt }` |
| `TX_SUBMITTED` | `{ txHash, chain, network, type }` |
| `TX_CONFIRMED` | `{ txHash, chain, network, executedAt }` |
| `TX_FAILED` | `{ error, stage, chain, network }` |
| `POLICY_DENIED` | `{ reason, policyId, requestedAmount, type }` |
| `KILL_SWITCH_RECOVERED` | `{ previousState, recoveredBy }` |
| `MASTER_AUTH_FAILED` | `{ reason, ip }` |
| `OWNER_REGISTERED` | `{ ownerAddress, chain }` |

---

## 3. AuditLogQuerySchema (AUDIT-01)

```typescript
export const AuditLogQuerySchema = z.object({
  wallet_id: z.string().uuid().optional(),
  event_type: AuditEventTypeSchema.optional(),
  severity: AuditSeveritySchema.optional(),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  tx_id: z.string().uuid().optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
  include_total: z.coerce.boolean().default(false).optional(),
});
```

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `wallet_id` | UUID | - | 월렛 ID 필터 |
| `event_type` | AuditEventType | - | 이벤트 타입 필터 (20개 enum) |
| `severity` | info/warning/critical | - | 심각도 필터 |
| `from` | number (epoch 초) | - | 시작 시각 (inclusive) |
| `to` | number (epoch 초) | - | 종료 시각 (inclusive) |
| `tx_id` | UUID | - | 트랜잭션 ID 필터 |
| `cursor` | number (positive int) | - | 다음 페이지 커서 |
| `limit` | number (1-200) | 50 | 페이지 크기 |
| `include_total` | boolean | false | total 필드 포함 여부 |

---

## 4. AuditLogResponseSchema (AUDIT-01)

```typescript
export const AuditLogItemSchema = z.object({
  id: z.number().int(),
  timestamp: z.number().int(),
  eventType: AuditEventTypeSchema,
  actor: z.string(),
  walletId: z.string().uuid().nullable(),
  sessionId: z.string().uuid().nullable(),
  txId: z.string().uuid().nullable(),
  details: z.record(z.unknown()),
  severity: AuditSeveritySchema,
  ipAddress: z.string().nullable(),
});

export const AuditLogResponseSchema = z.object({
  data: z.array(AuditLogItemSchema),
  nextCursor: z.number().int().nullable(),
  hasMore: z.boolean(),
  total: z.number().int().optional(),
});
```

---

## 5. Cursor Pagination 설계 (AUDIT-02)

### 5.1 동작 규칙

| 규칙 | 값 |
|------|-----|
| 정렬 | `ORDER BY id DESC` |
| cursor 의미 | `WHERE id < cursor` |
| hasMore 판정 | `LIMIT (limit + 1)`, 결과 > limit이면 true |
| nextCursor | hasMore=true일 때 마지막 항목의 id |
| 기본 limit | 50 |
| 최대 limit | 200 |

### 5.2 SQL 패턴

```sql
-- 필터 + cursor 조합
SELECT * FROM audit_log
WHERE wallet_id = ?
  AND event_type = ?
  AND timestamp >= ?
  AND timestamp <= ?
  AND id < ?
ORDER BY id DESC
LIMIT 51;
```

### 5.3 인덱스 커버리지

| 필터 | 인덱스 | 상태 |
|------|--------|------|
| wallet_id | idx_audit_log_wallet_id | 기존 |
| event_type | idx_audit_log_event_type | 기존 |
| severity | idx_audit_log_severity | 기존 |
| timestamp | idx_audit_log_timestamp | 기존 |
| wallet_id + timestamp | idx_audit_log_wallet_timestamp | 기존 |
| tx_id | idx_audit_log_tx_id | **신규** |
| id (cursor) | PRIMARY KEY | 기존 |

---

## 6. REST API 엔드포인트 (AUDIT-04)

### 6.1 엔드포인트 사양

| 항목 | 값 |
|------|-----|
| 메서드 | GET |
| 경로 | `/v1/audit-logs` |
| 인증 | masterAuth (X-Master-Password) |
| 태그 | Admin |
| 정렬 | id DESC (최신 우선) |

### 6.2 에러 코드

| 코드 | HTTP | 조건 |
|------|------|------|
| `INVALID_MASTER_PASSWORD` | 401 | 인증 실패 (기존) |
| `VALIDATION_ERROR` | 400 | 쿼리 파라미터 검증 실패 (기존) |

### 6.3 요청/응답 예시

**기본 조회:**
```
GET /v1/audit-logs
→ 200: { data: [...50건], nextCursor: 101, hasMore: true }
```

**필터 + 페이지네이션:**
```
GET /v1/audit-logs?event_type=MASTER_AUTH_FAILED&severity=critical&cursor=101&limit=20
→ 200: { data: [...], nextCursor: null, hasMore: false }
```

**트랜잭션별 감사 로그:**
```
GET /v1/audit-logs?tx_id=01936d3c-7f8a-7b00-9e4d-bbbbbb000001
→ 200: { data: [TX_SUBMITTED, TX_CONFIRMED], nextCursor: null, hasMore: false }
```

---

## 7. 감사 로그 헬퍼 함수

```typescript
// packages/daemon/src/infrastructure/database/audit-helper.ts

export interface AuditEntry {
  eventType: AuditEventType;
  actor: string;
  walletId?: string;
  sessionId?: string;
  txId?: string;
  details: Record<string, unknown>;
  severity: AuditSeverity;
  ipAddress?: string;
}

export function insertAuditLog(sqlite: SQLiteDatabase, entry: AuditEntry): void {
  try {
    const now = Math.floor(Date.now() / 1000);
    sqlite.prepare(
      'INSERT INTO audit_log (timestamp, event_type, actor, wallet_id, session_id, tx_id, details, severity, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(now, entry.eventType, entry.actor, entry.walletId ?? null,
          entry.sessionId ?? null, entry.txId ?? null,
          JSON.stringify(entry.details), entry.severity, entry.ipAddress ?? null);
  } catch {
    // Best-effort: 감사 로그 실패가 메인 로직을 중단하면 안 됨
  }
}
```

---

## 8. DB 마이그레이션

### 8.1 인덱스 추가 (v34)

```sql
CREATE INDEX IF NOT EXISTS idx_audit_log_tx_id ON audit_log(tx_id);
```

- DDL 변경 없음 (event_type은 TEXT, CHECK 제약 없음)
- 무중단 적용 가능

### 8.2 스키마 변경 없음

audit_log 테이블 구조는 변경하지 않는다. event_type 컬럼에 CHECK 제약이 없으므로 새 이벤트 추가에 DDL 변경 불필요.

---

## 9. 설계 문서 갱신 요약

| 문서 | 변경 내용 |
|------|----------|
| **25 (sqlite)** | 이벤트 타입 목록 23개→20개 재정의, details 스키마 추가, idx_audit_log_tx_id 인덱스 추가, 용어 변경(agent→wallet) |
| **29 (api-framework)** | cursor pagination 유틸리티 분류 (UUID/composite/integer 3패턴) |
| **32 (pipeline)** | Stage별 audit_log 삽입 현황 업데이트 (TX_SUBMITTED, TX_CONFIRMED, TX_FAILED, POLICY_DENIED 추가) |
| **37 (rest-api)** | GET /v1/audit-logs 엔드포인트 스펙 추가 (엔드포인트 ~100→~101) |

---

## 10. 테스트 시나리오 요약

| 카테고리 | 건수 | 핵심 시나리오 |
|---------|------|-------------|
| Unit | 6 | cursor 기본/마지막 페이지/빈 결과/연속 탐색/경계값/필터 조합 |
| Integration | 7 | masterAuth 보호/sessionAuth 거부/event_type 필터/severity 필터/from-to 범위/tx_id 필터/include_total |
| Security | 3 | sessionAuth 접근 거부/cursor 조작/event_type 주입 |
| **합계** | **16** | |

---

## 11. 요구사항 추적

| 요구사항 | 충족 내용 |
|---------|----------|
| **AUDIT-01** | AuditLogQuerySchema (6 필터 + cursor + limit + include_total), AuditLogResponseSchema (data + nextCursor + hasMore + total) 정의 완료 |
| **AUDIT-02** | id AUTOINCREMENT 기반 cursor pagination, 기본 50건, 최대 200건, WHERE id < cursor ORDER BY id DESC LIMIT limit+1 패턴 |
| **AUDIT-03** | AuditEventType 20개 정의 (기존 9 + 신규 11), 각 이벤트의 발생 서비스/파일/함수/삽입 시점 매핑 완료 |
| **AUDIT-04** | GET /v1/audit-logs, masterAuth 인증, INVALID_MASTER_PASSWORD(401) + VALIDATION_ERROR(400) 에러 코드 |

---

*작성: 2026-03-03*
*Phase 305 Plan 305-01 + 305-02 통합 설계 스펙*
*전제: Self-Hosted 단일 머신 아키텍처*
*범위: 설계 마일스톤 -- 코드 구현은 범위 외*
