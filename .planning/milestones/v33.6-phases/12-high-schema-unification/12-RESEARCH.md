# Phase 12: HIGH 스키마/수치 통일 - Research

**Researched:** 2026-02-06
**Domain:** 설계 문서 비일관성 해소 (Enum, config.toml, API 스펙 통일)
**Confidence:** HIGH

## Summary

Phase 12는 v0.3 설계 논리 일관성 확보의 두 번째 핵심 단계로, Phase 11(CRITICAL 4건 확정) 이후 남은 HIGH 우선순위 불일치 15건(ENUM-01~04, CONF-01~05, API-01~06)을 해소한다. 40개 설계 문서를 직접 분석하여 각 불일치의 정확한 위치, 현재 값, 통일 방향을 확인하였다.

분석 결과, 불일치는 크게 3개 영역으로 분류된다:
1. **Enum/상태값 불일치** (4건): agents.status가 DB에서 5개 값(CREATING~TERMINATED)인데 REST API에서는 4개 값(ACTIVE~KILL_SWITCH)으로 정의. policies.type이 DB와 Phase 8에서 다르게 정의. 트랜잭션 상태는 Phase 11에서 SSoT 확정 완료.
2. **config.toml 누락 설정** (5건): jwt_secret 누락, session_ttl 1h vs 24h 불일치, 연속 실패 임계값/nonce 캐시/kill switch 쿨다운 미설정화.
3. **API 스펙 불일치** (6건): 메모 길이 256 bytes vs 200 chars, CORS 헤더 누락, Health 스키마 상이, Rate Limiter 단위 혼재, SuccessResponse 잔존, ownerAuth 미정의.

**Primary recommendation:** 3개 PLAN으로 분리하여 (1) Enum 통합 대응표 + SQLite CHECK 일치 검증, (2) config.toml 누락 설정 일괄 추가, (3) REST API와 API Framework 스펙 통일을 수행하라.

---

## Enum/상태값 현황 분석

### ENUM-01: 에이전트 상태 Enum 통일 (H6)

**불일치 상세:**

| 출처 | 상태 값 |
|------|---------|
| 25-sqlite-schema.md (CORE-02) CHECK 제약 | `CREATING, ACTIVE, SUSPENDED, TERMINATING, TERMINATED` (5개) |
| 37-rest-api-complete-spec.md 에이전트 응답 Zod | `ACTIVE, SUSPENDED, TERMINATED, KILL_SWITCH` (4개) |
| 37-rest-api-complete-spec.md admin/status 응답 | `ACTIVE, SUSPENDED, TERMINATED, KILL_SWITCH` (4개) |

**분석:**
- DB 스키마에는 `CREATING`, `TERMINATING`이 있으나 REST API 응답에는 없음
- REST API에는 `KILL_SWITCH`가 있으나 DB CHECK 제약에는 없음
- `KILL_SWITCH`는 Kill Switch 발동 시 에이전트가 SUSPENDED 상태가 되며, `suspension_reason`으로 구분하는 것이 현재 DB 설계 (CORE-02)
- **근본 원인**: REST API 설계(Phase 9)가 DB 스키마(Phase 6)와 정합성 검증 없이 작성됨

**통일 방향:**
- DB CHECK 제약이 SSoT (CORE-02 확정)
- REST API 응답에서 `CREATING`과 `TERMINATING`을 포함하도록 수정
- `KILL_SWITCH`는 DB 값이 아닌 클라이언트 표시 상태로 분류 (Phase 11 CRIT-02 패턴 활용: status=SUSPENDED + suspension_reason=kill_switch 조합)
- 대안: DB CHECK에 `KILL_SWITCH`를 추가하는 방안도 있으나, Kill Switch 발동은 SUSPENDED의 특수 케이스이므로 별도 상태가 아님

**Confidence:** HIGH -- 문서 직접 비교 완료

---

### ENUM-02: 정책 상태 Enum 통일 (H7)

**불일치 상세:**

| 출처 | 정책 type 값 |
|------|-------------|
| 25-sqlite-schema.md (CORE-02) CHECK 제약 | `SPENDING_LIMIT, ALLOWED_ADDRESSES, TIME_RESTRICTION, AUTO_STOP` (4개) |
| 33-time-lock-approval.md (LOCK-MECH) Drizzle ORM | `SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT` (4개) |
| 37-rest-api-complete-spec.md Zod 스키마 | `SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT` (4개) |

**분석:**
- CORE-02(Phase 6)에서는 `ALLOWED_ADDRESSES`와 `AUTO_STOP`
- LOCK-MECH(Phase 8)에서 `ALLOWED_ADDRESSES`를 `WHITELIST`로, `AUTO_STOP`을 AutoStopEngine 별도 시스템으로 분리하고 `RATE_LIMIT` 추가
- REST API(Phase 9)는 Phase 8 설계를 따름
- **근본 원인**: CORE-02는 "Phase 8에서 상세화" 주석이 있었고 Phase 8에서 실제로 변경했으나 CORE-02 원본 업데이트가 누락됨

**통일 방향:**
- Phase 8(LOCK-MECH) + Phase 9(REST API)의 `SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT`가 SSoT
- CORE-02(25-sqlite-schema.md)의 CHECK 제약과 Drizzle ORM 정의를 Phase 8 기준으로 수정
- `ALLOWED_ADDRESSES` -> `WHITELIST`, `AUTO_STOP` 제거 + `RATE_LIMIT` 추가
- 인덱스도 Phase 8 설계 기준으로 통일 (`idx_policies_agent_enabled` 복합 인덱스)

**Confidence:** HIGH -- 문서 직접 비교 완료

---

### ENUM-03: 트랜잭션 상태 머신 통일 (M1)

**현황:**
- Phase 11 CRIT-02에서 DB 8개 상태가 SSoT로 확정됨: `PENDING, QUEUED, EXECUTING, SUBMITTED, CONFIRMED, FAILED, CANCELLED, EXPIRED`
- objectives/v0.3-design-consistency.md에서 언급된 "QUEUED vs PENDING_QUEUE" 불일치는 Phase 11 조사에서 실제 존재하지 않음 확인
- 25-sqlite, 32-transaction-pipeline, 37-rest-api 모두 동일 8개 상태 사용

**통일 방향:**
- 이미 통일됨. Enum 대응표에 명시적으로 기록하면 충분
- 상태 전이 매트릭스(32-transaction-pipeline 섹션 2.3)가 정확한 전이 규칙의 SSoT

**Confidence:** HIGH -- Phase 11에서 직접 검증 완료

---

### ENUM-04: Enum/상태값 통합 대응표

**작성 대상 Enum 목록:**

| Enum | SSoT 문서 | 사용처 |
|------|----------|--------|
| TransactionStatus | 25-sqlite (CORE-02) CHECK + 32-tx-pipeline 상태 머신 | DB, API, SDK, MCP |
| TransactionTier | 25-sqlite (CORE-02) CHECK | DB, 파이프라인 Stage 4 |
| AgentStatus | 25-sqlite (CORE-02) CHECK | DB, API, SDK |
| PolicyType | 33-time-lock (LOCK-MECH) -- **CORE-02 수정 필요** | DB, API, SDK |
| NotificationChannelType | 25-sqlite (CORE-02) CHECK | DB, config.toml |
| AuditLogSeverity | 25-sqlite (CORE-02) CHECK | DB, 내부 |
| AuditLogEventType | 25-sqlite (CORE-02) 이벤트 목록 | DB, 내부 |
| KillSwitchStatus | 36-killswitch system_state 테이블 | DB, admin API |
| AutoStopRuleType | 36-killswitch auto_stop_rules 테이블 | DB, 내부 |

**대응표 포맷:**
- 각 Enum마다: DB CHECK 값, Drizzle ORM enum, Zod 스키마 enum, TypeScript 타입을 1:1 매핑
- 불일치가 있는 경우 SSoT 결정과 수정 대상 명시

---

## config.toml 설정 현황 분석

### CONF-01: 세션 TTL 기본값 통일 (H2)

**불일치 상세:**

| 출처 | TTL 값 |
|------|--------|
| 24-monorepo (CORE-01) config.toml | `session_ttl = 3600` (1시간) |
| 24-monorepo (CORE-01) Zod 스키마 | `300-86400`, 기본값 `3600` |
| 30-session-protocol (SESS-PROTO) | 기본 만료 `86400초 (24시간)` |
| 30-session-protocol expiresIn Zod | `.default(86400)` |
| 37-rest-api (API-SPEC) bearerAuth 설명 | `기본 24시간` |

**분석:**
- CORE-01은 "Phase 7-8에서 상세화" 주석으로 1시간 placeholder를 넣었음
- SESS-PROTO(Phase 7)에서 24시간으로 확정, REST API도 24시간 참조
- v0.2 Key Decisions에 "Session expiry: min 5min, max 7d, default 24h" 기록됨

**통일 방향:**
- `session_ttl = 86400` (24시간)으로 통일
- CORE-01의 `[security].session_ttl` 기본값을 3600 -> 86400으로 수정
- Zod 스키마 default(3600) -> default(86400)
- config.toml 예시 주석도 "24시간"으로 수정

**Confidence:** HIGH -- SESS-PROTO 결정이 명확

---

### CONF-02: jwt_secret 설정 추가 (H3)

**불일치 상세:**
- 30-session-protocol(SESS-PROTO) 섹션 2.7에서 `config.toml [security].jwt_secret` 필드 명시
- 환경변수 `WAIAAS_SECURITY_JWT_SECRET` 오버라이드 가능 명시
- `waiaas init` 시 `crypto.randomBytes(32).toString('hex')` 자동 생성 명시
- **그러나** 24-monorepo(CORE-01) config.toml 스펙에는 `[security]` 섹션에 `jwt_secret` 필드가 없음

**통일 방향:**
- CORE-01의 `[security]` 섹션에 `jwt_secret` 필드 추가:
  ```
  jwt_secret = ""  # waiaas init 시 자동 생성 (64자 hex, 256비트)
  ```
- Zod 스키마에 `jwt_secret: z.string().min(32)` 추가
- 환경변수 매핑: `WAIAAS_SECURITY_JWT_SECRET`
- 기본 config.toml 예시에 빈 값 + 주석 추가 (init 시 자동 채움)
- **주의**: config.toml 전체 예시에서 jwt_secret 위치는 session_ttl 바로 아래

**Confidence:** HIGH -- SESS-PROTO에서 설계 완료, CORE-01 반영만 누락

---

### CONF-03: 연속 실패 임계값 통일 (H5)

**불일치 상세:**

| 출처 | threshold 값 |
|------|-------------|
| 36-killswitch(KILL-AUTO-EVM) 섹션 5.1 consecutive_failures 규칙 | `기본 threshold: 3회` |
| 36-killswitch(KILL-AUTO-EVM) 기본 규칙 초기화 코드 | `threshold: 3` |
| 08-dual-key-architecture(v0.1) SUPERSEDED 문서 | `CONSECUTIVE_FAILURES_3` |
| 40-telegram-bot-docker.md Long Polling 재시도 | `consecutiveErrors >= 3` → 30초 대기 (다른 맥락) |

**분석:**
- objectives/v0.3-design-consistency.md에서 "3, 5, 3으로 세 군데 다르게 표기" 지적
- 36-killswitch 직접 검색 결과: threshold 값 5를 사용하는 곳이 발견되지 않음
- velocity 규칙의 threshold는 50 tx/hour (다른 규칙 타입)
- 08-dual-key는 v0.1 SUPERSEDED 문서로 무시
- 40-telegram의 consecutiveErrors=3은 Telegram API 재시도 로직으로 AutoStop과 무관

**통일 방향:**
- `consecutive_failures` 기본 threshold = 3 (이미 일관)
- config.toml에 설정화하여 조절 가능하게:
  ```toml
  [security.auto_stop]
  consecutive_failures_threshold = 3
  ```
- objectives의 "5" 표기는 오기(誤記) 가능성이 높음. 원본 문서에서 확인 불가

**Confidence:** HIGH -- 원본 문서 직접 검색으로 3이 일관적임을 확인

---

### CONF-04: Nonce 캐시 크기 설정화 (M3)

**현황:**
- 30-session-protocol(SESS-PROTO) 섹션 4.2: `new LRUCache({ max: 1000, ttl: 5 * 60 * 1000 })`
- 하드코딩된 값으로 config.toml에 해당 설정 없음

**통일 방향:**
- config.toml `[security]` 섹션에 추가:
  ```toml
  nonce_cache_max = 1000          # Nonce LRU 캐시 최대 항목 수
  nonce_cache_ttl = 300           # Nonce TTL (초) -- 5분
  ```
- Zod 스키마에 `nonce_cache_max: z.number().int().min(100).max(10000).default(1000)` 추가
- nonce_cache_ttl: `z.number().int().min(60).max(600).default(300)`

**Confidence:** HIGH -- 단순한 설정화 작업

---

### CONF-05: Kill Switch 복구 쿨다운 설정화 (M5)

**현황:**
- 36-killswitch(KILL-AUTO-EVM): 복구 시 "30분 최소 쿨다운" 언급 (Memory 기반 검색)
- config.toml에 해당 설정 없음
- v0.2 Key Decisions: "Kill Switch recovery: dual-auth, 30min minimum cooldown"

**통일 방향:**
- config.toml `[security.kill_switch]` 섹션 추가:
  ```toml
  [security.kill_switch]
  recovery_cooldown = 1800        # 복구 최소 쿨다운 (초) -- 30분
  max_recovery_attempts = 3       # 복구 실패 시 최대 재시도 횟수
  ```
- Zod 스키마: `recovery_cooldown: z.number().int().min(600).max(86400).default(1800)`

**Confidence:** HIGH -- 결정 사항 명확, 설정화만 필요

---

## API 스펙 현황 분석

### API-01: 메모 길이 제한 통일 (H4)

**불일치 상세:**

| 출처 | 제한 |
|------|------|
| 31-solana-adapter(CHAIN-SOL) | `memo 최대 256바이트` (Solana Memo Program 제한) |
| 37-rest-api(API-SPEC) sendTransaction Zod | `z.string().max(200)` (200자) |

**분석:**
- Solana Memo Program의 실제 제한은 **566 bytes** (최근 업데이트)이나, 31-solana-adapter에서는 256 bytes로 보수적 설정
- REST API에서 200 chars = UTF-8에서 최대 800 bytes (4바이트 문자 시)로, 256 bytes를 초과할 수 있음
- 반대로 ASCII만 사용하면 200 chars = 200 bytes < 256 bytes
- 핵심: bytes와 chars는 다른 단위이므로 통일 기준이 필요

**통일 방향:**
- REST API Zod 스키마를 bytes 기준으로 통일: 256 bytes
- 구현 시 `new TextEncoder().encode(memo).length <= 256` 검증
- Zod에서는 `.max(256)` (chars 기준으로 보수적 제한 유지) + 커스텀 refinement로 바이트 검증
- 또는 단순히 200 chars (= 대부분 200 bytes)로 통일하여 Solana 256 bytes 이내 보장
- **권장**: `z.string().max(200)` 유지 + description에 "최대 200자 (Solana memo 256 bytes 이내 보장)" 명시
- 31-solana-adapter의 256 bytes 검증은 방어적 이중 검증으로 유지

**Confidence:** HIGH -- 양쪽 문서 직접 확인

---

### API-02: CORS 헤더 통일 (H8)

**불일치 상세:**

| 항목 | 29-api-framework (CORE-06) | 37-rest-api (API-SPEC) |
|------|---------------------------|------------------------|
| origin | `localhost:{port}`, `127.0.0.1:{port}` | + `tauri://localhost` |
| allowHeaders | `Authorization, Content-Type, X-Request-ID` | + `X-Master-Password` |
| exposeHeaders | `X-Request-ID, Retry-After` | + `X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset` |

**분석:**
- CORE-06(Phase 6)은 기본 설정만 정의, Phase 8-9에서 확장
- API-SPEC(Phase 9)이 최종 통합 스펙이므로 더 완전함
- `tauri://localhost`는 Phase 9 Tauri Desktop 대응으로 추가
- `X-Master-Password`는 Phase 8 Admin API 대응으로 추가
- RateLimit 헤더는 REST API 공통 응답 헤더로 추가

**통일 방향:**
- CORE-06의 CORS 미들웨어 코드를 API-SPEC 기준으로 업데이트:
  ```typescript
  cors({
    origin: [`http://localhost:${port}`, `http://127.0.0.1:${port}`, 'tauri://localhost'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Authorization', 'Content-Type', 'X-Request-ID', 'X-Master-Password'],
    exposeHeaders: ['X-Request-ID', 'Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 600,
  })
  ```
- CORE-06 섹션 2.3 미들웨어 6 (cors) 코드 블록 + 설정 상세 테이블 모두 수정

**Confidence:** HIGH -- 양쪽 문서 직접 비교 완료

---

### API-03: Health 응답 스키마 통일 (H9)

**불일치 상세:**

| 항목 | 29-api-framework (CORE-06) | 37-rest-api (API-SPEC) |
|------|---------------------------|------------------------|
| status 값 | `healthy, unhealthy, degraded` | `ok, degraded, error` |
| services 필드 | database, keystore, adapters 상세 | 없음 (간단 스키마) |
| 전체 복잡도 | 상세 (services, adapters 개별 상태) | 간단 (status, version, uptime, timestamp) |

**CORE-06 Health 스키마:**
```typescript
HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  version: z.string(),
  uptime: z.number(),
  services: {
    database: { status, size },
    keystore: { status, agents },
  },
  adapters: Record<chain, { status, latency, lastError }>,
})
```

**API-SPEC Health 스키마:**
```typescript
HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string().datetime(),
})
```

**분석:**
- CORE-06의 상세 스키마와 API-SPEC의 간단 스키마가 공존
- CORE-06에는 `timestamp` 필드가 없고, API-SPEC에는 `services`/`adapters` 필드가 없음
- status 값의 네이밍도 다름 (healthy vs ok)
- `/v1/admin/status` 엔드포인트(masterAuth 필요)가 CORE-06의 상세 정보를 커버

**통일 방향:**
- `/health` (공개): API-SPEC의 간단 스키마 사용, 단 status 값을 `healthy/degraded/unhealthy`로 통일 (CORE-06 기준)
  - `ok` -> `healthy`, `error` -> `unhealthy`
  - 이유: 표준 헬스체크 패턴에서 `healthy/unhealthy`가 더 명시적
- `/v1/admin/status` (masterAuth): 상세 정보 (CORE-06의 services/adapters 포함)
- 두 엔드포인트의 역할 분리를 명확히 문서화
- API-SPEC의 HealthResponseSchema에 CORE-06 기준 status enum 적용

**Confidence:** HIGH -- 양쪽 문서 직접 비교

---

### API-04: Rate Limiter 단위 통일 (H12)

**현황 분석:**

| 출처 | 단위 | 값 |
|------|------|-----|
| 29-api-framework (CORE-06) | req/min | 전역 100, 세션 300, 거래 10, health 600 |
| 37-rest-api (API-SPEC) | req/min | 전역 100, 세션 300, 거래 10 |
| 24-monorepo (CORE-01) config.toml | "rate_limit_rpm" | 60 |

**분석:**
- objectives/v0.3에서 "req/min vs req/sec 혼재" 지적이 있으나, 실제 문서 검색 결과 모든 곳에서 req/min 사용
- req/sec 표기는 발견되지 않음 -- objectives의 지적이 오류일 가능성
- 단, CORE-01의 `rate_limit_rpm = 60`은 CORE-06의 전역 100 req/min과 불일치
- CORE-01 config.toml에는 `rate_limit_session_rpm`, `rate_limit_tx_rpm` 필드가 없음 (CORE-06에서 정의)

**통일 방향:**
- 단위는 이미 req/min으로 통일됨 (req/sec는 존재하지 않음)
- CORE-01 config.toml `[security]` 섹션을 CORE-06 기준으로 수정:
  ```toml
  rate_limit_global_rpm = 100       # 전역 RPM (인증 전)
  rate_limit_session_rpm = 300      # 세션당 RPM (인증 후)
  rate_limit_tx_rpm = 10            # 거래 전송 RPM
  ```
- 기존 `rate_limit_rpm = 60`을 `rate_limit_global_rpm = 100`으로 교체
- Zod 스키마도 3-level 구조로 업데이트

**Confidence:** HIGH -- req/sec 표기 부재 확인, 수치 불일치는 명확

---

### API-05: SuccessResponse 래퍼 정리 (H14)

**현황:**
- 37-rest-api(API-SPEC) 섹션 11.3: "v0.2에서는 래퍼 없이 직접 반환한다. 불필요한 `{ data: T, success: true }` 패턴을 사용하지 않음"으로 명확히 결정
- API-SPEC의 모든 엔드포인트 응답이 실제로 래퍼 없이 직접 반환 형태

**분석:**
- SuccessResponse 래퍼가 잔존하는 곳을 검색해야 함
- Phase 12 작업에서 모든 응답 예시를 확인하여 래퍼 패턴(`{ data: ..., success: true }`)이 있으면 제거

**통일 방향:**
- 잔존 래퍼 패턴 검색 + 제거
- 이미 결정된 사항이므로 문서 정리만 필요

**Confidence:** HIGH -- 결정 명확

---

### API-06: ownerAuth 미들웨어 상세 정의 (H15)

**현황:**
- 34-owner-wallet(OWNR-CONN) 섹션 5: ownerAuth 미들웨어 상세 설계 완료
  - ownerSignaturePayload 구조 (chain, address, action, nonce, timestamp, message, signature)
  - 8단계 검증 로직 (헤더 파싱 -> timestamp -> nonce -> 서명 -> owner 일치 -> action 일치 -> 컨텍스트 -> next)
  - 인증 방식: `Authorization: Bearer <base64url JSON>`
- 37-rest-api(API-SPEC) 섹션 3.2: ownerAuth 스키마 정의 + 8단계 검증 테이블 포함

**분석:**
- objectives/v0.3에서 "per-request SIWS 서명 설계와 ownerAuth 미들웨어 상세 미정의" 지적
- 실제로는 34-owner-wallet에서 상세 설계가 완료되었고, 37-rest-api에도 반영됨
- 단, 29-api-framework(CORE-06) 섹션 2.1에서 ownerAuth가 "라우트 레벨 미들웨어 (Phase 8에서 상세 설계)" 주석으로만 존재
- CORE-06에 ownerAuth 미들웨어 상세를 반영하는 작업이 필요

**통일 방향:**
- CORE-06 미들웨어 순서 테이블을 Phase 8 확장 반영 (API-SPEC 섹션 4.1의 9단계 순서로 업데이트)
- CORE-06에 ownerAuth 미들웨어 섹션 추가 (34-owner-wallet 참조)
- 또는 CORE-06에서 "API-SPEC 섹션 3.2 및 4.1 참조"로 포워딩

**Confidence:** HIGH -- 설계 완료, 문서 반영만 필요

---

## 추가 발견 사항

### Nonce 엔드포인트 경로 불일치

| 출처 | 경로 |
|------|------|
| 30-session-protocol (SESS-PROTO) | `/v1/auth/nonce` |
| 32-transaction-pipeline (TX-PIPE) | `/v1/auth/nonce` |
| 37-rest-api (API-SPEC) | `/v1/nonce` |
| 38-sdk-mcp-interface (SDK-MCP) | `/v1/nonce` |
| 39-tauri-desktop (TAURI-DESK) | `/v1/nonce` |

**분석:**
- API-SPEC에 명시적 주석: "SESS-PROTO/TX-PIPE에서는 `/v1/auth/nonce`로 정의되었으나, 본 통합 스펙에서 `/v1/nonce`로 경로를 단순화한다"
- Phase 9(API-SPEC, SDK, Tauri)가 최종 통합이므로 `/v1/nonce`가 SSoT
- SESS-PROTO, TX-PIPE는 Phase 7 문서로 Phase 9에서 통합됨

**통일 방향:**
- Enum 대응표에 API 경로 SSoT도 함께 기록
- SESS-PROTO, TX-PIPE 원본은 수정하지 않아도 됨 (API-SPEC이 SSoT이므로)
- 다만 혼란 방지를 위해 해당 문서에 "NOTE: 최종 경로는 `/v1/nonce`로 결정됨 (API-SPEC 참조)" 추가 권장

### config.toml Delay/Approval 설정 누락

- 33-time-lock-approval의 SPENDING_LIMIT 규칙에서 `delay_seconds = 300` (기본 5분, 최소 60), `approval_timeout = 3600` (기본 1시간)
- 이 값들은 policies 테이블의 rules JSON에 저장되므로 config.toml에 전역 기본값이 필요
- CONF-03 작업 시 함께 추가 권장:
  ```toml
  [security.policy_defaults]
  delay_seconds = 300              # DELAY 티어 기본 쿨다운 (초) -- 5분. 최소 60
  approval_timeout = 3600          # APPROVAL 티어 기본 승인 대기 (초) -- 1시간
  ```

---

## Architecture Patterns

### 문서 수정 패턴

Phase 12는 **코드가 아닌 설계 문서 수정**이다. 다음 패턴을 따른다:

1. **SSoT 확정**: 충돌하는 값 중 최종 결정을 식별
2. **원본 수정**: SSoT 문서가 아닌 쪽의 값을 수정
3. **대응표 기록**: 모든 Enum의 통합 대응표를 독립 산출물로 생성
4. **교차 검증**: 수정 후 양쪽 문서의 값이 일치하는지 grep 검증

### Enum 대응표 구조

```markdown
| Domain | Enum Name | Values | SSoT 문서 | DB CHECK | Drizzle ORM | Zod Schema | 비고 |
|--------|-----------|--------|----------|----------|-------------|------------|------|
| Transaction | TransactionStatus | PENDING, QUEUED, ... | CORE-02 | O | O | O | 8개 상태 |
```

### config.toml 수정 패턴

1. CORE-01(24-monorepo)이 config.toml SSoT
2. 새 필드 추가: 키-값 테이블, Zod 스키마, 기본값 예시 3곳 모두 수정
3. 환경변수 매핑 규칙 준수: `WAIAAS_{SECTION}_{KEY}`

---

## Don't Hand-Roll

| 문제 | 하지 말 것 | 대신 사용 | 이유 |
|------|-----------|----------|------|
| Enum 통일 | 각 문서에서 개별적으로 Enum 수정 | 통합 대응표 먼저 작성 후 일괄 수정 | 대응표 없이 수정하면 새로운 불일치 발생 |
| config.toml 확장 | 필드만 추가 | Zod 스키마 + 기본값 테이블 + 예시 3곳 동시 수정 | 하나만 수정하면 다시 불일치 |
| 문서 교차 수정 | 여러 문서 동시에 수정 | 한 요구사항씩 순차적으로 (수정 -> 검증 -> 다음) | 동시 수정은 실수 확률 증가 |

---

## Common Pitfalls

### Pitfall 1: SSoT 오판
**What goes wrong:** 여러 문서에 같은 값이 있을 때 어느 것이 SSoT인지 잘못 판단
**Why it happens:** Phase 6 기본 설계가 Phase 7-8-9에서 확장되었으나 원본 미업데이트
**How to avoid:** Phase 번호가 높은 문서(최신 설계)가 우선. CORE-02는 Phase 6이지만 "Phase 8에서 상세화" 주석이 있으면 Phase 8 문서가 SSoT
**Warning signs:** "Phase X에서 상세화" 주석이 있는 필드

### Pitfall 2: 설계 변경 유입
**What goes wrong:** 불일치 해소 목적인데 새로운 설계 결정이 유입됨
**Why it happens:** "이왕 수정하는 김에" 심리
**How to avoid:** REQUIREMENTS.md "Out of Scope"에 명시: "설계 변경 아님, 불일치 해소만 수행"
**Warning signs:** 기존 문서에 없는 새로운 개념이나 필드가 등장

### Pitfall 3: 부분 수정
**What goes wrong:** Enum을 DB CHECK에서만 수정하고 Drizzle ORM이나 Zod에서는 누락
**Why it happens:** 하나의 Enum이 여러 곳(DDL, ORM, Zod, API 예시)에 정의됨
**How to avoid:** 대응표에서 모든 위치를 사전에 식별하고 체크리스트화
**Warning signs:** grep으로 이전 값이 여전히 검색됨

### Pitfall 4: 타 Phase 범위 침범
**What goes wrong:** MEDIUM 항목(Phase 13)이나 구현 사항(v0.4)을 Phase 12에서 처리
**Why it happens:** 연관된 이슈가 눈에 보이면 함께 처리하고 싶음
**How to avoid:** REQUIREMENTS.md의 Phase 12 할당 항목만 처리. NOTE-01~11은 Phase 13
**Warning signs:** M1~M14 ID가 task에 등장

---

## Code Examples

### Enum 대응표 검증 방법

```bash
# AgentStatus: DB CHECK와 REST API Zod 비교
grep -n "CREATING\|ACTIVE\|SUSPENDED\|TERMINATING\|TERMINATED\|KILL_SWITCH" \
  .planning/deliverables/25-sqlite-schema.md \
  .planning/deliverables/37-rest-api-complete-spec.md

# PolicyType: DB CHECK와 Phase 8 Zod 비교
grep -n "SPENDING_LIMIT\|ALLOWED_ADDRESSES\|WHITELIST\|TIME_RESTRICTION\|AUTO_STOP\|RATE_LIMIT" \
  .planning/deliverables/25-sqlite-schema.md \
  .planning/deliverables/33-time-lock-approval-mechanism.md \
  .planning/deliverables/37-rest-api-complete-spec.md
```

### config.toml 필드 추가 패턴

3곳 동시 수정이 필요:

```markdown
1. 키-값 테이블 (섹션 3.3):
   | `jwt_secret` | string | `""` | 64자 hex 문자열 | JWT HS256 서명 Secret (waiaas init 자동 생성) |

2. Zod 스키마 (섹션 3.5):
   jwt_secret: z.string().min(32, 'JWT secret은 최소 32자 이상').default(''),

3. 기본 config.toml 예시 (섹션 3.4):
   jwt_secret = ""                    # waiaas init 시 자동 생성 (수동 변경 가능)
```

---

## Plan 별 작업 범위

### Plan 12-01: Enum/상태값 통합 대응표 + SQLite CHECK 일치 검증

**Requirements:** ENUM-01, ENUM-02, ENUM-03, ENUM-04

**핵심 작업:**
1. 모든 Enum의 통합 대응표 작성 (독립 산출물)
2. CORE-02(25-sqlite) policies.type CHECK 제약 수정: `ALLOWED_ADDRESSES, AUTO_STOP` -> `WHITELIST, RATE_LIMIT`
3. API-SPEC(37-rest-api) agent.status Zod enum 수정: CORE-02 5개 값으로 통일 + KILL_SWITCH 클라이언트 표시 로직
4. grep 교차 검증

**수정 대상 문서:**
- 25-sqlite-schema.md (policies CHECK 제약 + Drizzle ORM)
- 37-rest-api-complete-spec.md (agent.status Zod + 표시 로직)

### Plan 12-02: config.toml 누락 설정 추가

**Requirements:** CONF-01, CONF-02, CONF-03, CONF-04, CONF-05

**핵심 작업:**
1. session_ttl 3600 -> 86400 수정
2. jwt_secret 필드 추가
3. auto_stop 설정 섹션 추가 (consecutive_failures_threshold)
4. nonce_cache_max, nonce_cache_ttl 추가
5. kill_switch recovery_cooldown 추가
6. rate_limit 3-level 구조로 확장
7. Zod 스키마, 기본값 테이블, config.toml 예시 3곳 동시 수정

**수정 대상 문서:**
- 24-monorepo-data-directory.md (config.toml SSoT)

### Plan 12-03: REST API <-> API Framework 스펙 통일

**Requirements:** API-01, API-02, API-03, API-04, API-05, API-06

**핵심 작업:**
1. 메모 길이 제한 통일 (API-01): description에 bytes 기준 명시
2. CORS 헤더 통일 (API-02): CORE-06 미들웨어 코드 업데이트
3. Health 스키마 통일 (API-03): status 값 네이밍 통일 (ok->healthy, error->unhealthy)
4. Rate Limiter 수치 통일 (API-04): CORE-01 config 값 CORE-06 기준으로 수정
5. SuccessResponse 잔존 검색 + 제거 (API-05)
6. ownerAuth 미들웨어 CORE-06 반영 (API-06): 9단계 미들웨어 순서 + ownerAuth 참조

**수정 대상 문서:**
- 29-api-framework-design.md (CORS, Health, Rate Limiter, ownerAuth)
- 37-rest-api-complete-spec.md (Health status 값, 메모 description)
- 24-monorepo-data-directory.md (rate_limit 수치)

---

## Open Questions

1. **KILL_SWITCH를 DB CHECK에 추가할지 여부**
   - What we know: 현재 DB에서 KILL_SWITCH는 `status=SUSPENDED + suspension_reason=kill_switch`로 표현
   - What's unclear: KILL_SWITCH를 별도 상태로 승격하면 상태 머신이 더 명확해지지만 기존 설계 변경에 해당
   - Recommendation: "설계 변경 없음" 원칙에 따라 SUSPENDED + reason 패턴 유지, 클라이언트 표시로 처리

2. **config.toml 섹션 구조**
   - What we know: [security]에 flat하게 넣을지, [security.auto_stop], [security.kill_switch]로 중첩할지
   - Recommendation: 중첩 구조 사용 (관련 설정 그룹화, TOML 표준 활용)

---

## Sources

### Primary (HIGH confidence)
- 25-sqlite-schema.md (CORE-02) -- agents/policies/transactions CHECK 제약 확인
- 37-rest-api-complete-spec.md (API-SPEC) -- 모든 Zod enum, CORS, Health, Rate Limiter 확인
- 29-api-framework-design.md (CORE-06) -- 미들웨어 순서, Health 스키마, Rate Limiter 상세
- 24-monorepo-data-directory.md (CORE-01) -- config.toml 전체 스펙
- 30-session-token-protocol.md (SESS-PROTO) -- session_ttl, jwt_secret, nonce cache
- 33-time-lock-approval-mechanism.md (LOCK-MECH) -- policy types, consecutive_failures
- 36-killswitch-autostop-evm.md (KILL-AUTO-EVM) -- kill switch states, cooldown
- 34-owner-wallet-connection.md (OWNR-CONN) -- ownerAuth 미들웨어 8단계
- 31-solana-adapter-detail.md (CHAIN-SOL) -- memo 256 bytes 제한
- objectives/v0.3-design-consistency.md -- 비일관성 목록 원본

### Secondary (MEDIUM confidence)
- Phase 11 research + summary -- CRIT-01~04 해결 결과 참조
- v0.2 Key Decisions (MEMORY.md) -- 축적된 결정 사항

---

## Metadata

**Confidence breakdown:**
- Enum 통일 (ENUM-01~04): HIGH -- 모든 문서 직접 비교 완료
- config.toml (CONF-01~05): HIGH -- 누락 필드와 기존 값 모두 확인
- API 스펙 (API-01~06): HIGH -- 양쪽 문서 직접 비교 완료

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (설계 문서가 안정적이므로 30일)
