# Phase 20: 세션 갱신 프로토콜 - Research

**Researched:** 2026-02-07
**Domain:** 세션 갱신 프로토콜 설계 (JWT renewal, optimistic renewal pattern, Owner post-rejection)
**Confidence:** HIGH

## Summary

Phase 20은 AI 에이전트가 sessionAuth만으로 세션을 자율적으로 갱신할 수 있는 "낙관적 갱신(optimistic renewal)" 프로토콜을 설계한다. 이 프로토콜은 PUT /v1/sessions/:id/renew 엔드포인트, 5종의 안전 장치, sessions 테이블 스키마 확장, SessionConstraints 확장, Owner 사후 거부 플로우, 그리고 2종의 알림 이벤트를 정의한다.

기존 설계 문서 4개(30-session-token-protocol.md, 25-sqlite-schema.md, 37-rest-api-complete-spec.md, 35-notification-architecture.md)를 수정하고, 신규 세션 갱신 프로토콜 문서 1개를 생성한다. Phase 19에서 확정된 sessionAuth 정의와 agents.owner_address 모델을 전제로 한다.

핵심 설계 원칙은 "낙관적 갱신": 에이전트가 먼저 갱신하고, Owner가 사후에 거부할 수 있다. 이는 에이전트 자율성을 보장하면서도 Owner의 통제권을 유지하는 패턴이다. 새 라이브러리 도입은 불필요하며, 기존 기술 스택(jose, Hono, Drizzle, better-sqlite3)만으로 구현 가능하다.

**Primary recommendation:** 기존 설계 문서들의 패턴과 규약을 정확히 따르되, 갱신 시 새 JWT를 발급하고 token_hash를 교체하는 "토큰 회전(token rotation)" 방식을 채택하라. 기존 JWT를 만료 연장하는 방식은 JWT 불변성 원칙에 위배된다.

---

## Standard Stack

이 Phase는 순수 설계 작업이며 새 라이브러리가 불필요하다. 기존 v0.2 스택을 그대로 사용한다.

### Core (이미 존재하는 의존성)

| Library | Version | Purpose | Phase 20에서의 역할 |
|---------|---------|---------|---------------------|
| `jose` | v6.x | JWT 생성/검증 | 갱신 시 새 JWT 발급 (SignJWT + HS256) |
| `hono` | v4.x | HTTP 프레임워크 | PUT /v1/sessions/:id/renew 라우트 정의 |
| `drizzle-orm` | 0.45.x | ORM | sessions 테이블 스키마 변경 + 쿼리 |
| `better-sqlite3` | 12.6.x | SQLite 드라이버 | BEGIN IMMEDIATE 트랜잭션 (갱신 원자성) |
| `@hono/zod-openapi` | latest | Zod + OpenAPI | 요청/응답 스키마 정의 |

### Supporting

| Library | Version | Purpose | Phase 20에서의 역할 |
|---------|---------|---------|---------------------|
| `lru-cache` | existing | nonce 캐시 | 변경 없음 (갱신에 nonce 불필요) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JWT 새 발급 (토큰 회전) | expires_at만 DB에서 연장 (토큰 재사용) | JWT가 불변이므로 exp claim 불일치 발생. 토큰 회전이 JWT 표준에 부합. |
| PUT (갱신 전용) | PATCH /v1/sessions/:id (부분 업데이트) | PUT이 의미적으로 더 명확. PATCH는 임의 필드 수정을 암시. |
| sessionAuth (에이전트 자체 갱신) | ownerAuth (Owner 사전 승인) | 낙관적 갱신 = 에이전트 자율성 우선. Out of Scope에서 명시적 배제됨. |

---

## Architecture Patterns

### Pattern 1: 낙관적 갱신 (Optimistic Renewal)

**What:** 에이전트가 sessionAuth만으로 세션을 즉시 갱신하고, Owner는 거부 윈도우 내에서 사후 거부할 수 있다.

**When to use:** AI 에이전트의 자율 운영이 중요하고, Owner가 항상 온라인일 수 없는 Self-Hosted 환경.

**Why (design rationale):**
- REQUIREMENTS.md의 Out of Scope: "세션 갱신 시 Owner 사전 승인 -> 낙관적 갱신 패턴 채택 -- 사후 거부가 에이전트 자율성에 더 적합"
- 에이전트가 장기 작업(DeFi 전략, 모니터링 등) 중 세션 만료로 중단되지 않아야 한다
- Owner가 오프라인이어도 에이전트가 운영을 지속할 수 있어야 한다

**Flow:**
```
에이전트                     WAIaaS 데몬                   Owner
   │                           │                           │
   │ PUT /v1/sessions/:id/renew│                           │
   │ (sessionAuth)             │                           │
   │ ──────────────────────>   │                           │
   │                           │ 안전 장치 5종 검증         │
   │                           │ 새 JWT 발급               │
   │                           │ token_hash 교체            │
   │                           │ renewal_count++           │
   │   <──────────────────── 200 { newToken, expiresAt }   │
   │                           │                           │
   │                           │ ───── SESSION_RENEWED ──> │ (알림)
   │                           │                           │
   │                           │                           │ (거부 윈도우 내)
   │                           │ <── POST /v1/owner/reject-renewal/:id
   │                           │     (masterAuth implicit) │
   │                           │ 세션 폐기 (revokedAt)      │
   │                           │                           │
   │                           │ ── SESSION_RENEWAL_REJECTED ──> │ (알림)
   │   <── 다음 요청 시 401 SESSION_REVOKED                │
```

### Pattern 2: 토큰 회전 (Token Rotation on Renewal)

**What:** 갱신 시 기존 JWT를 재사용하지 않고 새 JWT를 발급한다. 기존 token_hash를 새 token_hash로 교체한다.

**Why:**
- JWT는 불변(immutable) -- exp claim을 변경할 수 없음 (서명이 깨짐)
- DB의 expires_at만 변경하면 JWT의 exp와 DB의 expires_at이 불일치
- sessionAuth Stage 1에서 JWT exp 검증이 실패하여 불필요한 DB 조회 발생
- 토큰 회전은 탈취된 구 토큰의 자동 무효화 효과 (새 token_hash로 교체되면 구 토큰으로 조회 불가)

**Implementation sketch:**
```typescript
// 갱신 시
const newJwt = await new SignJWT({ sid: session.id, aid: session.agentId })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime(`${session.constraints.expiresIn}s`) // 원래 expiresIn 단위 유지
  .setJti(session.id)
  .setIssuer('waiaas')
  .sign(JWT_SECRET)

const newToken = `wai_sess_${newJwt}`
const newTokenHash = hashToken(newToken)
const newExpiresAt = Math.floor(Date.now() / 1000) + session.constraints.expiresIn

// DB 원자적 업데이트
sqlite.transaction(() => {
  db.update(sessions)
    .set({
      tokenHash: newTokenHash,
      expiresAt: new Date(newExpiresAt * 1000),
      renewalCount: session.renewalCount + 1,
      lastRenewedAt: new Date(),
    })
    .where(eq(sessions.id, session.id))
    .run()
})()
```

### Pattern 3: 5종 안전 장치 (Safety Guardrails)

**What:** 갱신을 무한정 허용하지 않는 5가지 방어 메커니즘.

**5종 안전 장치 (ROADMAP.md/STATE.md에서 확정):**

| # | 안전 장치 | 값 | 검증 시점 | 위반 시 동작 |
|---|----------|-----|----------|-------------|
| 1 | maxRenewals | 30 (기본) | 갱신 요청 시 | 403 RENEWAL_LIMIT_REACHED |
| 2 | 총 수명(absolute lifetime) | 30일 (기본) | 갱신 요청 시 | 403 SESSION_ABSOLUTE_LIFETIME_EXCEEDED |
| 3 | 50% 시점 갱신 | expiresIn의 50% 경과 후 | 갱신 요청 시 | 403 RENEWAL_TOO_EARLY |
| 4 | 거부 윈도우(renewalRejectWindow) | 설정 가능 (기본 1h?) | Owner 거부 시 참조 | Owner에게 알림 시 거부 가능 기간 명시 |
| 5 | 갱신 단위 고정 | 원래 expiresIn 값 | 갱신 시 적용 | 갱신마다 동일한 기간만큼 연장 (임의 연장 불가) |

**Each guardrail in detail:**

**Guard 1 - maxRenewals (최대 갱신 횟수):**
- renewal_count >= max_renewals 이면 갱신 거부
- Owner가 세션 생성 시 constraints.maxRenewals로 설정 (기본 30)
- 30회 x 24시간(기본) = 720시간 = 30일. 총 수명 제한과 자연스럽게 연동

**Guard 2 - Absolute Lifetime (절대 수명):**
- created_at + 30일(= 2,592,000초)을 초과하면 갱신 거부
- 아무리 많은 갱신을 해도 세션 원래 생성 시점으로부터 30일 초과 불가
- config.toml [security].session_absolute_lifetime으로 설정 가능

**Guard 3 - 50% 시점 갱신 (Minimum Elapsed):**
- 현재 시각이 (last_renewed_at 또는 created_at) + expiresIn * 0.5 이전이면 갱신 거부
- 24시간 세션이면 최소 12시간 경과 후 갱신 가능
- 빈번한 갱신으로 인한 토큰 남용 방지

**Guard 4 - 거부 윈도우 (Reject Window):**
- 갱신 후 Owner가 거부할 수 있는 시간 윈도우
- SessionConstraints.renewalRejectWindow (기본값: Owner가 지정, 미지정 시 시스템 기본값)
- 거부 윈도우 내 Owner가 POST /v1/owner/reject-renewal/:sessionId 호출 시 세션 폐기(revokedAt 설정)
- 실질적으로 이것은 별도 엔드포인트라기보다 기존 DELETE /v1/sessions/:id (masterAuth implicit)와 동일 효과
- 핵심은 알림에 "갱신됨. N시간 내 거부 가능" 문구 포함

**Guard 5 - 갱신 단위 고정 (Fixed Renewal Unit):**
- 갱신 시 새 expiresAt = now + 원래 expiresIn (세션 생성 시 설정된 값)
- 에이전트가 임의로 더 긴 만료 시간을 요청할 수 없음
- 원래 24시간이면 갱신해도 24시간만 연장

### Pattern 4: Owner 사후 거부 플로우

**What:** Owner가 갱신 알림을 받고 거부할 수 있는 메커니즘.

**Flow:**
1. 에이전트가 세션 갱신 -> SESSION_RENEWED 알림 전송
2. 알림에 포함: 세션 ID, 에이전트 이름, 갱신 횟수/최대, 남은 총 수명, 거부 윈도우 만료 시각
3. Owner가 거부 결정 -> 기존 DELETE /v1/sessions/:id (masterAuth implicit) 또는 별도 거부 엔드포인트 호출
4. 세션 폐기(revokedAt 설정) -> SESSION_RENEWAL_REJECTED 알림 전송
5. 에이전트의 다음 요청에서 401 SESSION_REVOKED 반환

**설계 결정 포인트 - 별도 거부 엔드포인트 필요 여부:**
- Option A: 기존 DELETE /v1/sessions/:id 재활용 (masterAuth implicit). 간단하지만 "갱신 거부"와 "일반 폐기"를 구분할 수 없음.
- Option B: POST /v1/sessions/:id/reject-renewal (masterAuth implicit). 감사 로그에서 "갱신 거부"를 명확히 추적 가능.
- **추천: Option A (기존 DELETE 재활용)**. 이유: (1) 결과가 동일(세션 폐기), (2) audit_log의 details JSON으로 구분 가능, (3) 엔드포인트 증가 최소화. 알림 메시지에서 "세션을 폐기하면 갱신이 거부됩니다"로 안내.

### Anti-Patterns to Avoid

- **JWT 만료 연장**: JWT의 exp claim을 변경하려고 하면 서명이 깨짐. 반드시 새 JWT 발급.
- **갱신 시 constraints 변경 허용**: 에이전트가 갱신 시 더 넓은 제약(더 큰 maxAmount 등)을 요청할 수 있게 하면 안 됨. 갱신은 기간 연장만.
- **Owner 사전 승인**: Out of Scope에서 명시적으로 배제됨. 낙관적 패턴의 핵심은 사후 거부.
- **무한 갱신**: maxRenewals와 절대 수명 없이 무한 갱신 허용하면 영구 세션과 동일. 반드시 상한 필요.
- **50% 미만 시점 갱신 허용**: 세션이 갱신된 직후 또 갱신 가능하면 토큰 남용 + 불필요한 토큰 회전.

---

## Don't Hand-Roll

이 Phase는 순수 설계 작업이므로 "don't hand-roll" 항목이 적지만, 설계 시 주의할 점:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT 만료 연장 | JWT 파싱 후 exp 수정 | jose의 SignJWT로 새 JWT 발급 | JWT 불변성 원칙. 서명 무결성 보장. |
| 타임스탬프 비교 | Date 객체 직접 비교 | Unix epoch 정수 (초) 비교 | CORE-02 표준. SQLite 정수 인덱스 활용. |
| 동시 갱신 방지 | 애플리케이션 레벨 뮤텍스 | better-sqlite3 BEGIN IMMEDIATE | SQLite WAL 모드의 단일 Writer 보장 활용. |
| 에러 코드 체계 | 새 에러 도메인 | 기존 SESSION_* 도메인 확장 | 37-rest-api-complete-spec.md 에러 코드 체계와 일관성 유지. |

---

## Common Pitfalls

### Pitfall 1: JWT exp와 DB expires_at 불일치

**What goes wrong:** 갱신 시 DB의 expires_at만 변경하고 JWT를 재사용하면, sessionAuth Stage 1에서 JWT exp 만료 거부 발생.
**Why it happens:** JWT는 서명된 불변 토큰. exp claim을 변경하면 서명이 깨진다.
**How to avoid:** 토큰 회전 패턴 적용. 갱신 시 반드시 새 JWT 발급 + 새 token_hash 저장.
**Warning signs:** 갱신 후 에이전트가 401 AUTH_TOKEN_EXPIRED를 받음.

### Pitfall 2: 동시 갱신 Race Condition

**What goes wrong:** 에이전트가 만료 임박 시점에 동시에 여러 갱신 요청을 보내면, 각 요청이 다른 token_hash를 생성하여 이전 토큰이 즉시 무효화.
**Why it happens:** 갱신이 token_hash를 교체하므로, 첫 번째 갱신이 성공하면 두 번째 갱신은 이미 교체된 token_hash로 조회 실패.
**How to avoid:** BEGIN IMMEDIATE 트랜잭션 내에서 token_hash 확인 + 교체를 원자적으로 수행. 두 번째 요청은 token_hash 불일치로 401 반환 (자연스러운 방어).
**Warning signs:** 동일 세션에 대해 연속 갱신 시 두 번째 요청이 실패.

### Pitfall 3: 50% 시점 계산 오류

**What goes wrong:** "50% 경과 시점"을 잘못 계산하여 갱신이 너무 일찍/늦게 허용됨.
**Why it happens:** 갱신 시점의 기준(created_at vs last_renewed_at vs 현재 expiresAt)이 모호.
**How to avoid:** 명확한 기준 정의:
- 첫 갱신: created_at + (expiresIn * 0.5) <= now() 이면 허용
- 재갱신: last_renewed_at + (expiresIn * 0.5) <= now() 이면 허용
**Warning signs:** 세션 생성 직후 갱신이 가능하거나, 만료 직전에만 갱신 가능.

### Pitfall 4: 절대 수명과 maxRenewals 간의 비정합

**What goes wrong:** maxRenewals=30, expiresIn=7일이면 총 수명이 210일(30 x 7)이 되어 절대 수명 30일을 크게 초과.
**Why it happens:** maxRenewals과 절대 수명이 독립적으로 동작할 때 발생.
**How to avoid:** 두 제한을 AND 조건으로 적용. 어느 한쪽이라도 초과하면 갱신 거부. 절대 수명이 최종 안전망.
**Warning signs:** 세션이 30일을 초과하여 존속.

### Pitfall 5: 거부 윈도우 의미 혼동

**What goes wrong:** 거부 윈도우를 "갱신 후 N시간 동안만 거부 가능"으로 구현하면, Owner가 윈도우 밖에서 세션을 폐기하지 못할 수 있다는 오해.
**Why it happens:** 거부 윈도우와 세션 폐기(DELETE)를 혼동.
**How to avoid:** 거부 윈도우는 알림 메시지의 "안내 문구"에 불과. Owner는 거부 윈도우와 무관하게 언제든 DELETE /v1/sessions/:id로 세션을 폐기할 수 있다. 거부 윈도우는 "이 시간 내에 확인하시는 것을 권장합니다"의 의미.
**Warning signs:** Owner가 거부 윈도우 경과 후 세션 폐기가 불가능하다고 착각.

---

## Code Examples

### Example 1: PUT /v1/sessions/:id/renew 라우트 정의 (Hono + Zod)

```typescript
// packages/daemon/src/server/routes/session-renew.ts
import { createRoute, z } from '@hono/zod-openapi'

// 요청 - 바디 없음 (sessionAuth만으로 인증, 갱신 단위 고정이므로 파라미터 불필요)
// 응답
const RenewSessionResponseSchema = z.object({
  sessionId: z.string().openapi({ description: '세션 ID', example: '019502a8-...' }),
  token: z.string().openapi({ description: '새 세션 토큰 (wai_sess_...)' }),
  expiresAt: z.string().datetime().openapi({ description: '새 만료 시각 (ISO 8601)' }),
  renewalCount: z.number().int().openapi({ description: '누적 갱신 횟수', example: 1 }),
  maxRenewals: z.number().int().openapi({ description: '최대 갱신 횟수', example: 30 }),
  absoluteExpiresAt: z.string().datetime().openapi({ description: '절대 만료 시각 (세션 총 수명)', }),
}).openapi('RenewSessionResponse')

const renewSessionRoute = createRoute({
  method: 'put',
  path: '/v1/sessions/{id}/renew',
  tags: ['Sessions'],
  operationId: 'renewSession',
  security: [{ bearerAuth: [] }],  // sessionAuth
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: '세션 ID' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: RenewSessionResponseSchema } },
      description: '세션 갱신 성공. 새 토큰이 발급됨.',
    },
    401: { description: 'AUTH_TOKEN_MISSING | AUTH_TOKEN_EXPIRED | AUTH_TOKEN_INVALID | SESSION_REVOKED' },
    403: { description: 'RENEWAL_LIMIT_REACHED | SESSION_ABSOLUTE_LIFETIME_EXCEEDED | RENEWAL_TOO_EARLY | SESSION_RENEWAL_MISMATCH' },
    404: { description: 'SESSION_NOT_FOUND' },
  },
})
```

### Example 2: 5종 안전 장치 검증 로직

```typescript
// packages/daemon/src/services/session-renewal-service.ts
interface RenewalValidationResult {
  allowed: boolean
  code?: string
  reason?: string
}

function validateRenewalGuards(
  session: SessionRow,
  now: number,  // Unix epoch (초)
): RenewalValidationResult {
  const constraints = JSON.parse(session.constraints ?? '{}')
  const expiresIn = constraints.expiresIn ?? 86400  // 기본 24시간
  const maxRenewals = session.maxRenewals ?? constraints.maxRenewals ?? 30
  const absoluteLifetime = 30 * 24 * 60 * 60  // 30일 (config에서 로드)

  // Guard 1: maxRenewals 확인
  if (session.renewalCount >= maxRenewals) {
    return {
      allowed: false,
      code: 'RENEWAL_LIMIT_REACHED',
      reason: `갱신 횟수 한도 초과: ${session.renewalCount} >= ${maxRenewals}`,
    }
  }

  // Guard 2: 절대 수명 확인
  const createdAtEpoch = Math.floor(session.createdAt.getTime() / 1000)
  if (now + expiresIn > createdAtEpoch + absoluteLifetime) {
    return {
      allowed: false,
      code: 'SESSION_ABSOLUTE_LIFETIME_EXCEEDED',
      reason: `갱신 후 세션 총 수명이 ${absoluteLifetime}초를 초과합니다`,
    }
  }

  // Guard 3: 50% 시점 갱신 확인
  const referenceTime = session.lastRenewedAt
    ? Math.floor(session.lastRenewedAt.getTime() / 1000)
    : createdAtEpoch
  const minimumElapsed = expiresIn * 0.5
  if (now < referenceTime + minimumElapsed) {
    return {
      allowed: false,
      code: 'RENEWAL_TOO_EARLY',
      reason: `최소 ${minimumElapsed}초 경과 후 갱신 가능 (현재 경과: ${now - referenceTime}초)`,
    }
  }

  // Guard 4: 거부 윈도우 (검증이 아닌 응답 정보로 포함)
  // Guard 5: 갱신 단위 고정 (expiresIn 값 재사용, 검증이 아닌 적용 규칙)

  return { allowed: true }
}
```

### Example 3: sessions 테이블 스키마 확장

```typescript
// 기존 sessions 테이블에 추가할 컬럼
export const sessions = sqliteTable('sessions', {
  // ... 기존 컬럼 유지 ...

  // ── Phase 20 추가: 갱신 추적 ──
  renewalCount: integer('renewal_count').notNull().default(0),
  maxRenewals: integer('max_renewals').notNull().default(30),
  lastRenewedAt: integer('last_renewed_at', { mode: 'timestamp' }),
  absoluteExpiresAt: integer('absolute_expires_at', { mode: 'timestamp' }),  // created_at + 30일
})
```

### Example 4: SessionConstraints 확장

```typescript
// 기존 SessionConstraintsSchema에 추가
export const SessionConstraintsSchema = z.object({
  // ... 기존 6개 필드 유지 ...

  // ── Phase 20 추가 ──
  /** 최대 갱신 횟수 (기본 30) */
  maxRenewals: z.number().int().min(0).max(100).optional().default(30).openapi({
    description: '최대 갱신 횟수. 0이면 갱신 불가.',
    example: 30,
  }),

  /** 갱신 거부 윈도우 (초, 기본 3600 = 1시간) */
  renewalRejectWindow: z.number().int().min(300).max(86400).optional().default(3600).openapi({
    description: '갱신 후 Owner가 거부할 수 있는 시간 윈도우 (초)',
    example: 3600,
  }),
}).openapi('SessionConstraints')
```

### Example 5: 알림 이벤트 2종 추가

```typescript
// NotificationEventType 확장
export const NotificationEventType = {
  // ... 기존 13개 이벤트 유지 ...

  // ── Phase 20 추가 ──
  /** 세션 갱신 완료 알림 */
  SESSION_RENEWED: 'SESSION_RENEWED',
  /** 세션 갱신 거부(폐기) 알림 */
  SESSION_RENEWAL_REJECTED: 'SESSION_RENEWAL_REJECTED',
} as const
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OAuth 2.0 refresh_token | Session-based renewal (PUT /renew) | v0.5 설계 | OAuth 인프라 불필요. Self-Hosted에 적합. |
| Owner 사전 승인 (동기) | 낙관적 갱신 + 사후 거부 (비동기) | v0.5 결정 | 에이전트 자율성 보장. AI 에이전트 워크로드에 적합. |
| 영구 API Key | 시간 제한 세션 + 갱신 | v0.2 | 탈취 시 피해 기간 제한. |

**Industry trends (2026):**
- AI 에이전트 환경에서 short-lived credentials + renewal이 표준으로 자리잡는 추세
- OWASP Agentic Top 10 (2026)에서 "에이전트별 고유 신원(identity)" + "최소 권한" + "세션 기반 자격증명" 권장
- Zero-Trust 원칙: 장기 자격증명은 허용 불가한 위험. 단기 자격증명 + 정기 갱신이 표준.

---

## Key Design Decisions Required

Phase 20 설계 시 Planner가 결정해야 할 핵심 사항:

### Decision 1: 갱신 엔드포인트 인증 맵 배치

SESS-01에서 sessionAuth로 명시. 이는 52-auth-model-redesign.md의 authRouter에 새 경로를 추가해야 함을 의미한다.

```
PUT /v1/sessions/:id/renew -> sessionAuth
```

단, 에이전트는 자신의 세션만 갱신 가능해야 함 (JWT의 sid claim == 요청의 :id 일치 확인).

### Decision 2: 거부 메커니즘 - 별도 엔드포인트 vs 기존 DELETE 재활용

**추천: 기존 DELETE /v1/sessions/:id 재활용.**
- 이유: (1) 결과 동일(세션 폐기), (2) audit_log details로 구분 가능, (3) 엔드포인트 수 증가 최소화
- 알림에서 "세션 폐기 시 갱신이 취소됩니다" 안내

### Decision 3: 절대 수명(absolute lifetime) 저장 방식

두 가지 옵션:
- Option A: sessions 테이블에 absolute_expires_at 컬럼 추가 (created_at + 30일로 세션 생성 시 계산)
- Option B: created_at + config.session_absolute_lifetime으로 매번 계산

**추천: Option A (absolute_expires_at 컬럼).** config 변경이 기존 세션에 소급 적용되면 혼란. 세션 생성 시 고정하는 것이 예측 가능.

### Decision 4: 갱신 시 사용량(usageStats) 리셋 여부

- Option A: 갱신 시 usageStats 유지 (누적)
- Option B: 갱신 시 usageStats 리셋

**추천: Option A (유지/누적).** 이유: maxTotalAmount과 maxTransactions는 세션 전체 수명에 대한 제약. 갱신마다 리셋하면 제약이 무의미해짐. 갱신은 "기간 연장"이지 "새 세션"이 아님.

### Decision 5: config.toml 설정 항목

```toml
[security]
# 세션 절대 수명 (초). 기본 30일.
session_absolute_lifetime = 2592000

# 기본 최대 갱신 횟수. Owner가 세션별로 재정의 가능.
default_max_renewals = 30

# 기본 거부 윈도우 (초). Owner가 세션별로 재정의 가능.
default_renewal_reject_window = 3600
```

---

## Documents to Modify

### 1. 신규: 세션 갱신 프로토콜 문서 (53-session-renewal-protocol.md)

핵심 내용:
- 낙관적 갱신 개념 정의
- PUT /v1/sessions/:id/renew API 스펙 (요청/응답/에러)
- 5종 안전 장치 상세 명세
- 토큰 회전 메커니즘
- Owner 사후 거부 플로우
- 시퀀스 다이어그램
- 갱신 서비스 코드 패턴
- 에러 코드 5개 정의

### 2. 수정 (대규모): 30-session-token-protocol.md

변경 사항:
- 섹션 7 (세션 수명주기): 4단계 -> 5단계 (갱신 단계 추가)
- 섹션 5 (SessionConstraints): maxRenewals, renewalRejectWindow 필드 추가
- 섹션 7.5 (세션 API 엔드포인트 요약): PUT /v1/sessions/:id/renew 추가
- 수명주기 시퀀스 다이어그램 업데이트

### 3. 수정 (중규모): 25-sqlite-schema.md

변경 사항:
- 섹션 2.2 sessions 테이블: renewal_count, max_renewals, last_renewed_at, absolute_expires_at 컬럼 추가
- Drizzle ORM 정의 업데이트
- SQL DDL 업데이트
- 마이그레이션 SQL (ALTER TABLE ADD COLUMN 4개)

### 4. 수정 (중규모): 37-rest-api-complete-spec.md

변경 사항:
- 전체 엔드포인트 요약 테이블: 30 -> 31개 (PUT /v1/sessions/:id/renew 추가)
- Session API 섹션에 갱신 엔드포인트 스펙 추가
- 에러 코드 테이블에 RENEWAL_* 코드 5개 추가
- 인증 맵에 PUT /v1/sessions/:id/renew (sessionAuth) 추가

### 5. 수정 (소규모): 35-notification-architecture.md

변경 사항:
- NotificationEventType: SESSION_RENEWED, SESSION_RENEWAL_REJECTED 2종 추가
- 이벤트별 심각도 매핑: SESSION_RENEWED=INFO, SESSION_RENEWAL_REJECTED=WARNING
- 알림 호출 포인트 테이블에 2건 추가
- 메시지 템플릿 추가

---

## Open Questions

### 1. 거부 윈도우 기본값

**What we know:** renewalRejectWindow는 SessionConstraints에 추가되며, Owner가 세션 생성 시 지정 가능.
**What's unclear:** 기본값이 얼마가 적절한지. 1시간? 24시간? 갱신 단위(expiresIn)와 동일?
**Recommendation:** 기본 3600초(1시간)로 설정하되, config.toml로 조정 가능하게. APPROVAL 타임아웃과 동일한 기본값이 일관성 있음.

### 2. MCP Server / SDK에서의 자동 갱신 통합

**What we know:** 38-sdk-mcp-interface.md에서 "v0.3 확장 계획: MCP Server 내장 토큰 갱신 메커니즘"으로 예고.
**What's unclear:** Phase 20에서 SDK/MCP의 자동 갱신 통합까지 설계해야 하는지, 아니면 API 스펙만 정의하면 되는지.
**Recommendation:** Phase 20은 서버 사이드 프로토콜만 정의. SDK/MCP 통합은 Phase 21(DX 개선)에서 고려. Phase 20 산출물이 SDK 자동 갱신의 기반이 됨.

### 3. Kill Switch 상태에서의 갱신 동작

**What we know:** Kill Switch ACTIVATED 상태에서는 killSwitchGuard가 대부분의 엔드포인트를 차단.
**What's unclear:** PUT /v1/sessions/:id/renew도 차단 대상인지.
**Recommendation:** 차단 대상 (기본). Kill Switch가 발동되면 모든 세션이 revokedAt 설정되므로, 갱신 요청 자체가 무의미. 별도 허용 목록 추가 불필요.

---

## Sources

### Primary (HIGH confidence)

- **30-session-token-protocol.md** -- JWT 구조, SessionConstraints 6필드, sessionAuth 2-stage, 수명주기 4단계 (이 리서치의 기반)
- **25-sqlite-schema.md** -- sessions 테이블 현재 스키마, 마이그레이션 전략, ALTER TABLE ADD COLUMN 패턴
- **52-auth-model-redesign.md** -- sessionAuth 정의, authRouter 디스패치 로직, masterAuth implicit 모드
- **37-rest-api-complete-spec.md** -- 31 엔드포인트 인증 맵, 에러 코드 체계, Zod 스키마 패턴
- **35-notification-architecture.md** -- NotificationEventType 13종, INotificationChannel, 알림 호출 포인트
- **ROADMAP.md** -- Phase 20 Goal, Requirements, Success Criteria, Key Deliverables
- **REQUIREMENTS.md** -- SESS-01~05 상세, Out of Scope (세션 갱신 시 Owner 사전 승인 배제)
- **STATE.md** -- v0.5 핵심 결정 (낙관적 갱신 패턴, maxRenewals 30, 총 수명 30일, 50% 갱신 시점)

### Secondary (MEDIUM confidence)

- [JWT Security Best Practices (Curity)](https://curity.io/resources/learn/jwt-best-practices/) -- JWT 불변성 원칙, 토큰 회전 패턴
- [Token Expiry Best Practices (Zuplo)](https://zuplo.com/learning-center/token-expiry-best-practices) -- Short-lived tokens + renewal 패턴
- [Token Best Practices (Auth0)](https://auth0.com/docs/secure/tokens/token-best-practices) -- Refresh token reuse detection
- [OAuth 2 Refresh Tokens Guide (Frontegg)](https://frontegg.com/blog/oauth-2-refresh-tokens) -- Refresh token rotation 패턴

### Tertiary (LOW confidence)

- [OWASP Agentic Top 10 (2026)](https://spr.com/the-2026-owasp-agentic-top-10-why-agentic-ai-security-has-to-be-planned-up-front/) -- AI 에이전트 보안 가이드라인 (WebSearch)
- [JWT Vulnerabilities 2026 (Red Sentry)](https://redsentry.com/resources/blog/jwt-vulnerabilities-list-2026-security-risks-mitigation-guide) -- JWT 취약점 목록 (WebSearch)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 새 라이브러리 불필요. 기존 v0.2 스택 100% 재사용.
- Architecture: HIGH -- 낙관적 갱신 패턴이 ROADMAP/STATE/REQUIREMENTS에서 확정됨. 설계 결정 포인트가 명확.
- Pitfalls: HIGH -- 기존 설계 문서에서 JWT 구조와 DB 스키마를 상세히 파악. 잠재적 충돌 지점 식별 완료.

**Research date:** 2026-02-07
**Valid until:** 2026-03-09 (30일 -- 설계 마일스톤이므로 안정적)
