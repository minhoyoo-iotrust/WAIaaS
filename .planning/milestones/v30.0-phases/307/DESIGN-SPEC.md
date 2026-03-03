# Phase 307: Webhook Outbound 설계 스펙

**Phase:** 307
**요구사항:** HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05
**산출물 ID:** OPS-04

---

## 1. 개요

외부 시스템이 WAIaaS 이벤트를 프로그래밍 방식으로 구독하고 HMAC 서명으로 검증할 수 있는 Webhook Outbound 메커니즘을 설계한다. DB 스키마, 서명 프로토콜, 재시도 큐, REST API, EventBus 연동을 포함한다.

### 1.1 핵심 설계 결정 요약

| 항목 | 결정 | 근거 |
|------|------|------|
| DB 테이블 | webhooks + webhook_logs (2개) | 등록/전송 로그 분리, notification_logs 패턴 일관 |
| Secret 저장 | SHA-256 해시 + AES-256-GCM 암호화 이중 저장 | 조회 노출 방지 + HMAC 서명 생성 겸용 (S-04) |
| 서명 알고리즘 | HMAC-SHA256 (`sha256={hex}`) | GitHub/Stripe 업계 표준, Node.js crypto 내장 |
| 서명 헤더 | X-WAIaaS-Signature | 프로젝트 네임스페이스, 알고리즘 접두사 포함 |
| 재시도 | 최대 4회 (1+3), 지수 백오프 1s-2s-4s | 간단 + 예측 가능, 4xx 즉시 중단 |
| 큐 구현 | 인메모리 (setTimeout 기반) | Self-Hosted 단일 프로세스, 외부 MQ 불필요 |
| 타임아웃 | 10초 | 합리적 응답 대기 상한 |
| REST API | 4 엔드포인트, masterAuth | 관리자 전용 CRUD |
| NotificationChannel 관계 | 독립 구조 (INotificationChannel 미구현) | 관심사 상이 (N개 URL + HMAC + 재시도) |
| 이벤트 필터링 | webhooks.events JSON 배열 | 빈 배열 = 전체 구독 (와일드카드) |
| 구독 가능 이벤트 | Phase 305 AuditEventType 20개 재사용 | 이벤트 체계 일관성 |

---

## 2. DB 스키마 (HOOK-01)

### 2.1 webhooks 테이블 (Table 20)

```typescript
// packages/daemon/src/infrastructure/database/schema.ts

export const webhooks = sqliteTable(
  'webhooks',
  {
    id: text('id').primaryKey(),                              // UUID v7
    url: text('url').notNull(),                               // 수신 URL (HTTPS 권장)
    secretHash: text('secret_hash').notNull(),                // SHA-256(secret) -- 조회 노출 방지
    secretEncrypted: text('secret_encrypted').notNull(),      // AES-256-GCM(secret, masterPassword) -- HMAC 서명 생성용
    events: text('events').notNull(),                         // JSON array: 구독 이벤트 (빈 배열 = 전체)
    description: text('description'),                         // 관리자용 설명 (optional)
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_webhooks_enabled').on(table.enabled),
    check('check_webhook_enabled', sql`enabled IN (0, 1)`),
  ],
);
```

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | TEXT PK | O | UUID v7 |
| `url` | TEXT | O | Webhook 수신 URL. HTTPS 권장 |
| `secret_hash` | TEXT | O | SHA-256(secret). API 조회 시 secret 노출 방지 |
| `secret_encrypted` | TEXT | O | AES-256-GCM(secret, masterPassword). HMAC 서명 시 복호화 |
| `events` | TEXT | O | JSON 배열. `[]` = 전체 구독 |
| `description` | TEXT | - | 관리자용 설명 |
| `enabled` | INTEGER | O | 1=활성, 0=비활성 |
| `created_at` | INTEGER | O | Unix epoch 초 |
| `updated_at` | INTEGER | O | Unix epoch 초 |

### 2.2 webhook_logs 테이블 (Table 21)

```typescript
export const webhookLogs = sqliteTable(
  'webhook_logs',
  {
    id: text('id').primaryKey(),                              // UUID v7
    webhookId: text('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    status: text('status').notNull(),                         // 'success' | 'failed'
    httpStatus: integer('http_status'),                       // nullable: 연결 실패 시
    attempt: integer('attempt').notNull().default(1),         // 시도 횟수 (1-4)
    error: text('error'),
    requestDuration: integer('request_duration'),             // ms
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_webhook_logs_webhook_id').on(table.webhookId),
    index('idx_webhook_logs_event_type').on(table.eventType),
    index('idx_webhook_logs_status').on(table.status),
    index('idx_webhook_logs_created_at').on(table.createdAt),
    check('check_webhook_log_status', sql`status IN ('success', 'failed')`),
  ],
);
```

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | TEXT PK | O | UUID v7 |
| `webhook_id` | TEXT FK | O | webhooks.id (CASCADE 삭제) |
| `event_type` | TEXT | O | 전송된 이벤트 타입 |
| `status` | TEXT | O | `success` / `failed` |
| `http_status` | INTEGER | - | HTTP 응답 코드. 연결 실패 시 null |
| `attempt` | INTEGER | O | 시도 횟수 (1=초기, 2-4=재시도) |
| `error` | TEXT | - | 실패 에러 메시지 |
| `request_duration` | INTEGER | - | 요청 소요 시간 (ms) |
| `created_at` | INTEGER | O | Unix epoch 초 |

### 2.3 테이블 수 변화

| 변경 전 | 변경 후 |
|---------|---------|
| 19 테이블 | **21 테이블** (+2: webhooks, webhook_logs) |

### 2.4 마이그레이션 (v35)

```sql
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  secret_encrypted TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  http_status INTEGER,
  attempt INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  request_duration INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at);
```

---

## 3. Zod SSoT 스키마 (HOOK-01)

```typescript
// packages/core/src/schemas/webhook.ts

import { z } from 'zod';
import { AUDIT_EVENT_TYPES } from './audit.js';

export const WEBHOOK_EVENT_TYPES = AUDIT_EVENT_TYPES;
export const WebhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

export const CreateWebhookRequestSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(WebhookEventTypeSchema).default([]),
  description: z.string().max(256).optional(),
});
export type CreateWebhookRequest = z.infer<typeof CreateWebhookRequestSchema>;

export const WebhookResponseSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  events: z.array(z.string()),
  description: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const CreateWebhookResponseSchema = WebhookResponseSchema.extend({
  secret: z.string(),    // 64자 hex -- 한 번만 반환
});

export type WebhookResponse = z.infer<typeof WebhookResponseSchema>;
export type CreateWebhookResponse = z.infer<typeof CreateWebhookResponseSchema>;

export const WEBHOOK_LOG_STATUSES = ['success', 'failed'] as const;

export const WebhookLogSchema = z.object({
  id: z.string().uuid(),
  webhookId: z.string().uuid(),
  eventType: z.string(),
  status: z.enum(WEBHOOK_LOG_STATUSES),
  httpStatus: z.number().int().nullable(),
  attempt: z.number().int(),
  error: z.string().nullable(),
  requestDuration: z.number().int().nullable(),
  createdAt: z.number().int(),
});

export const WebhookLogQuerySchema = z.object({
  status: z.enum(WEBHOOK_LOG_STATUSES).optional(),
  event_type: WebhookEventTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});
```

---

## 4. HMAC-SHA256 서명 프로토콜 (HOOK-02)

### 4.1 서명 생성

```typescript
import { createHmac } from 'node:crypto';

function signPayload(secret: string, payload: string): string {
  return `sha256=${createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;
}
```

### 4.2 서명 포맷

```
X-WAIaaS-Signature: sha256={64-char-hex-digest}
```

### 4.3 Webhook 요청 헤더

| 헤더 | 값 | 설명 |
|------|-----|------|
| `Content-Type` | `application/json` | 고정 |
| `X-WAIaaS-Signature` | `sha256={hex}` | HMAC-SHA256 서명 |
| `X-WAIaaS-Event` | 이벤트 타입 | 예: `TX_SUBMITTED` |
| `X-WAIaaS-Delivery` | UUID v7 | 전송 고유 ID |
| `X-WAIaaS-Timestamp` | Unix epoch 초 | 재생 공격 방지 |
| `User-Agent` | `WAIaaS-Webhook/1.0` | 발신자 식별 |

### 4.4 Webhook Payload 구조

```typescript
interface WebhookPayload {
  id: string;                         // 전송 ID
  event: string;                      // 이벤트 타입
  timestamp: number;                  // Unix epoch 초
  data: Record<string, unknown>;      // 이벤트별 상세 데이터
}
```

**예시:**

```json
{
  "id": "01936d3c-7f8a-7b00-9e4d-bbbbbb000001",
  "event": "TX_CONFIRMED",
  "timestamp": 1772525000,
  "data": {
    "txId": "01936d3c-...",
    "txHash": "5RkZ...",
    "walletId": "01936d3c-...",
    "network": "solana-mainnet",
    "type": "TRANSFER",
    "amount": "1000000000"
  }
}
```

### 4.5 Secret 보안 모델

```
[등록]
1. secret = randomBytes(32).toString('hex')           → 64자 hex
2. secretHash = SHA-256(secret)                       → webhooks.secret_hash
3. secretEncrypted = AES-256-GCM(secret, mp)          → webhooks.secret_encrypted
4. 응답에 secret 평문 한 번 반환

[HMAC 서명 시]
1. secret = decrypt(secretEncrypted, masterPassword)
2. signature = HMAC-SHA256(secret, body)
3. X-WAIaaS-Signature: sha256={signature}

[GET 조회 시]
- secret/secretHash/secretEncrypted 모두 응답 미포함
```

### 4.6 수신 측 검증 가이드

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyWebhookSignature(
  secret: string,
  body: string,
  signature: string,
  timestamp: number,
): boolean {
  // 1. 타임스탬프 검증 (5분 이내)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return false;

  // 2. 서명 검증 (타이밍 안전 비교)
  const expected = `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

---

## 5. 비동기 재시도 큐 (HOOK-03)

### 5.1 재시도 전략

| 시도 | 대기 시간 | 누적 | 비고 |
|------|----------|------|------|
| 1차 (초기) | 즉시 | 0s | 이벤트 발생 시 |
| 2차 (재시도 1) | 1초 | 1s | |
| 3차 (재시도 2) | 2초 | 3s | |
| 4차 (재시도 3) | 4초 | 7s | 최종 시도 |

- 최대 총 소요: ~17초 (4회 x 10초 타임아웃 + 7초 백오프)
- 4xx 응답 시 즉시 중단 (클라이언트 에러, 재시도 무의미)
- 각 시도를 webhook_logs에 개별 기록

### 5.2 비블로킹 보장

```
[파이프라인]
  Stage 5 → emit('transaction:completed') → [리턴, 파이프라인 계속]
                    │
                    ▼ (EventBus listener, 동기 호출)
  [WebhookService.dispatch()]
    ├── 활성 webhook 조회 (~1ms)
    ├── 이벤트 필터 매칭
    └── queue.enqueue(job)  ← fire-and-forget
            │
            ▼ (비동기, 별도 마이크로태스크)
      [WebhookDeliveryQueue.deliver()]
        ├── fetch() → 성공: 로그
        └── 실패 → setTimeout(backoff) → 재시도
```

### 5.3 WebhookDeliveryQueue 핵심 인터페이스

```typescript
class WebhookDeliveryQueue {
  private readonly maxAttempts = 4;
  private readonly timeoutMs = 10_000;
  private readonly backoffMs = [0, 1000, 2000, 4000];

  enqueue(job: WebhookDeliveryJob): void;          // fire-and-forget
  private deliver(job: WebhookDeliveryJob): Promise<void>;  // 전송 + 재시도 루프
  private sign(secret: string, body: string): string;       // HMAC-SHA256
  private logAttempt(...): void;                              // webhook_logs INSERT
}
```

### 5.4 셧다운 동작

인메모리 큐이므로 데몬 재시작 시 미완료 전송은 유실된다. Webhook은 best-effort 전달이며, 수신 측은 누락 가능성을 감안해야 한다.

---

## 6. REST API 엔드포인트 (HOOK-04)

### 6.1 엔드포인트 요약

| # | 메서드 | 경로 | 인증 | 설명 |
|---|--------|------|------|------|
| 1 | POST | `/v1/webhooks` | masterAuth | webhook 등록 |
| 2 | GET | `/v1/webhooks` | masterAuth | 목록 조회 |
| 3 | DELETE | `/v1/webhooks/:id` | masterAuth | 삭제 (CASCADE) |
| 4 | GET | `/v1/webhooks/:id/logs` | masterAuth | 전송 로그 조회 |

### 6.2 POST /v1/webhooks (등록)

| 항목 | 값 |
|------|-----|
| 입력 | `CreateWebhookRequestSchema` (url, events, description) |
| 출력 | `CreateWebhookResponseSchema` (id, url, events, description, enabled, **secret**, createdAt, updatedAt) |
| HTTP | 201 Created |
| 특이사항 | secret은 응답에 **한 번만** 반환. 이후 조회 불가. |

**처리 흐름:**

1. masterAuth 검증
2. Zod 입력 검증
3. `secret = randomBytes(32).toString('hex')`
4. `secretHash = SHA-256(secret)`
5. `secretEncrypted = encryptSettingValue(secret, masterPassword)`
6. DB INSERT (webhooks)
7. 응답에 secret 포함

### 6.3 GET /v1/webhooks (목록 조회)

| 항목 | 값 |
|------|-----|
| 출력 | `{ data: WebhookResponseSchema[] }` (secret 미포함) |
| HTTP | 200 OK |
| 정렬 | created_at DESC |

### 6.4 DELETE /v1/webhooks/:id (삭제)

| 항목 | 값 |
|------|-----|
| HTTP | 204 No Content |
| CASCADE | webhook_logs 함께 삭제 |
| 에러 | `WEBHOOK_NOT_FOUND` (404) |

### 6.5 GET /v1/webhooks/:id/logs (전송 로그)

| 항목 | 값 |
|------|-----|
| 입력 | `WebhookLogQuerySchema` (status, event_type, limit) |
| 출력 | `{ data: WebhookLogSchema[] }` |
| HTTP | 200 OK |
| 정렬 | created_at DESC |
| 기본 limit | 20 (최대 100) |
| 에러 | `WEBHOOK_NOT_FOUND` (404) |

### 6.6 에러 코드

| 코드 | HTTP | 신규/기존 |
|------|------|---------|
| `INVALID_MASTER_PASSWORD` | 401 | 기존 |
| `VALIDATION_ERROR` | 400 | 기존 |
| `WEBHOOK_NOT_FOUND` | 404 | **신규** |

---

## 7. EventBus 연동 및 이벤트 필터링 (HOOK-05)

### 7.1 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                       EventBus                            │
└────────┬────────────────────────────────┬────────────────┘
         │                                │
         ▼                                ▼
┌─────────────────────┐        ┌─────────────────────┐
│ NotificationService  │        │  WebhookService      │
│ (채널별 전송)         │        │  (N개 URL 전송)      │
│ Telegram/Discord/    │        │  HMAC 서명            │
│ ntfy/Slack           │        │  재시도 큐            │
│ + WalletNotification │        │  이벤트 필터링        │
└─────────────────────┘        └─────────────────────┘
```

**독립 구조:** WebhookService는 INotificationChannel을 구현하지 않는다. 관심사가 다르기 때문이다 (N개 URL + HMAC + 개별 재시도 vs 단일 채널 + 폴백 체인).

### 7.2 EventBus 이벤트 매핑

| EventBus 이벤트 | Webhook 이벤트 | 전달 방식 |
|----------------|---------------|---------|
| `transaction:completed` | `TX_CONFIRMED` | EventBus listener |
| `transaction:failed` | `TX_FAILED` | EventBus listener |
| `wallet:activity` (TX_SUBMITTED) | `TX_SUBMITTED` | EventBus listener |
| `wallet:activity` (SESSION_CREATED) | `SESSION_CREATED` | EventBus listener |
| `wallet:activity` (OWNER_SET) | `OWNER_REGISTERED` | EventBus listener |
| `kill-switch:state-changed` (ACTIVE) | `KILL_SWITCH_ACTIVATED` | EventBus listener |
| `kill-switch:state-changed` (recover) | `KILL_SWITCH_RECOVERED` | EventBus listener |
| `transaction:incoming` | `TX_INCOMING` (확장) | EventBus listener |
| - | `WALLET_CREATED` | 직접 호출 (POST /wallets 핸들러) |
| - | `WALLET_SUSPENDED` | 직접 호출 (PATCH /wallets/:id) |
| - | `SESSION_REVOKED` | 직접 호출 (DELETE /sessions/:id) |
| - | `POLICY_DENIED` | 직접 호출 (Stage 3) |
| - | `MASTER_AUTH_FAILED` | 직접 호출 (master-auth 미들웨어) |
| - | `AUTO_STOP_TRIGGERED` | 직접 호출 (AutoStopService) |
| - | `NOTIFICATION_TOTAL_FAILURE` | 직접 호출 (NotificationService) |

### 7.3 이벤트 필터링 규칙

| webhooks.events | 동작 |
|-----------------|------|
| `[]` | 모든 이벤트 수신 (와일드카드) |
| `["TX_SUBMITTED", "TX_CONFIRMED"]` | 2개 이벤트만 수신 |
| `["KILL_SWITCH_ACTIVATED"]` | Kill Switch 활성화만 수신 |

```typescript
// 필터링 로직
const subscribedEvents = JSON.parse(webhook.events) as string[];
if (subscribedEvents.length > 0 && !subscribedEvents.includes(eventType)) {
  continue; // skip
}
```

### 7.4 Daemon Lifecycle 통합

```typescript
// daemon.start() 내
const webhookService = new WebhookService(db, eventBus, () => masterPassword);

// daemon.shutdown() 내
webhookService.destroy();
```

---

## 8. NotificationChannel과의 관계 (HOOK-05)

### 8.1 비교 매트릭스

| 비교 항목 | NotificationService | WebhookService |
|----------|---------------------|----------------|
| 전송 대상 | 단일 채널 (설정된 1-4개) | N개 구독 URL |
| 인증 | 채널별 고유 (Bot Token 등) | HMAC-SHA256 서명 |
| 재시도 | 폴백 체인 (다른 채널로) | 자체 지수 백오프 (같은 URL) |
| 이벤트 필터 | 전역 카테고리 필터 | 개별 webhook 이벤트 배열 |
| 전송 기록 | notification_logs | webhook_logs |
| Secret 관리 | settings 테이블 | webhooks 테이블 (AES-GCM) |
| 구독 관리 | Admin Settings ON/OFF | REST API CRUD |
| 인터페이스 | INotificationChannel | 독립 클래스 |

### 8.2 결론

두 시스템은 **EventBus를 공유하되 독립적으로 동작한다.** NotificationService는 Owner에게 알림을 보내고, WebhookService는 외부 시스템에 이벤트를 전달한다. 관심사가 다르므로 통합하지 않는다.

---

## 9. 설계 문서 갱신 요약

| 문서 | 변경 내용 |
|------|----------|
| **25 (sqlite)** | 테이블 19개→21개, webhooks + webhook_logs 테이블 정의 추가, 마이그레이션 v35, AES-256-GCM secret 암호화 |
| **35 (notification)** | WebhookService 독립 구조 명시, EventBus 병렬 소비 관계도, webhook 참조 크로스 레퍼런스 |
| **37 (rest-api)** | +4 엔드포인트 (POST/GET/DELETE /v1/webhooks, GET /v1/webhooks/:id/logs), +1 에러 코드 (WEBHOOK_NOT_FOUND) |

---

## 10. 테스트 시나리오 요약

| 카테고리 | 건수 | 핵심 시나리오 |
|---------|------|-------------|
| Unit: WebhookService | 5 | 이벤트 매핑/필터링/빈 배열 와일드카드/dispatch 에러 격리/disabled 스킵 |
| Unit: DeliveryQueue | 4 | 성공/재시도 백오프/4xx 즉시 중단/타임아웃 |
| Unit: HMAC | 3 | 서명 생성/검증/타이밍 안전 비교 |
| Integration: REST API | 6 | POST 등록+secret 반환/GET 목록(secret 미포함)/DELETE cascade/logs 조회/masterAuth 필수/404 |
| Security | 3 | sessionAuth 거부/secret 재조회 불가/암호화 검증 |
| **합계** | **21** | |

---

## 11. 요구사항 추적

| 요구사항 | 충족 내용 |
|---------|----------|
| **HOOK-01** | webhooks 테이블 (8 컬럼, 1 인덱스, 1 CHECK), webhook_logs 테이블 (9 컬럼, 4 인덱스, 1 CHECK), Zod SSoT 스키마 (CreateWebhookRequest/Response, WebhookLog, WebhookLogQuery) 정의 완료 |
| **HOOK-02** | HMAC-SHA256 서명 프로토콜: `sha256={hex}` 포맷, X-WAIaaS-Signature/Event/Delivery/Timestamp 4개 헤더, Secret 이중 보안 (SHA-256 해시 + AES-256-GCM 암호화), 수신 측 검증 가이드 (타임스탬프 5분 윈도우 + timingSafeEqual) |
| **HOOK-03** | 인메모리 큐: 최대 4회 시도 (1+3), 지수 백오프 1s-2s-4s, 10초 타임아웃, 4xx 즉시 중단, 시도별 webhook_logs 기록, fire-and-forget 비블로킹 보장 |
| **HOOK-04** | REST API 4 엔드포인트: POST /v1/webhooks (201, secret 일회 반환), GET /v1/webhooks (200, secret 미포함), DELETE /v1/webhooks/:id (204, CASCADE), GET /v1/webhooks/:id/logs (200, 필터+limit), 전체 masterAuth, WEBHOOK_NOT_FOUND(404) 에러 코드 |
| **HOOK-05** | EventBus 8개 이벤트 매핑 + 직접 호출 7개, webhooks.events JSON 배열 필터링 (빈 배열=전체), INotificationChannel 독립 구조 결정 (관심사 분리), WebhookService 아키텍처 + Daemon Lifecycle 통합 |

---

*작성: 2026-03-03*
*Phase 307 Plan 307-01 + 307-02 통합 설계 스펙*
*전제: Self-Hosted 단일 머신 아키텍처*
*범위: 설계 마일스톤 -- 코드 구현은 범위 외*
