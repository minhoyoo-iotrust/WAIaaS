# Phase 300: Session Core API + JWT + Renewal

## Goal
세션 수명 모델을 글로벌 설정 기반에서 per-session 선택적 지정으로 전환하여, 기본 무제한 세션과 선택적 유한 세션이 공존하는 구조를 완성한다

## Requirements Coverage
SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, JWT-01, JWT-02, JWT-03, RENW-01, RENW-02, RENW-03, RENW-04, CONF-01, CONF-02

## Plans

### Plan 300-1: Core Schema + Error Code Changes

**Files:**
- `packages/core/src/schemas/session.schema.ts` — CreateSessionRequestSchema 확장
- `packages/core/src/errors/error-codes.ts` — RENEWAL_NOT_REQUIRED 에러 코드 추가
- `packages/core/src/i18n/en.ts` — 영문 메시지
- `packages/core/src/i18n/ko.ts` — 한글 메시지
- `packages/daemon/src/infrastructure/database/schema.ts` — maxRenewals 기본값 변경
- `packages/daemon/src/api/routes/openapi-schemas.ts` — CreateSessionRequestOpenAPI 확장

**Changes:**

1. **CreateSessionRequestSchema** (`packages/core/src/schemas/session.schema.ts`):
   - `ttl` 유지 (optional, 이미 존재)
   - `maxRenewals` 추가: `z.number().int().min(0).optional()` — 0 = 무제한 갱신
   - `absoluteLifetime` 추가: `z.number().int().min(0).optional()` — 0 = 무제한 수명

2. **RENEWAL_NOT_REQUIRED 에러 코드** (`packages/core/src/errors/error-codes.ts`):
   ```
   RENEWAL_NOT_REQUIRED: {
     code: 'RENEWAL_NOT_REQUIRED',
     domain: 'SESSION',
     httpStatus: 400,
     message: 'Unlimited session does not require renewal',
   }
   ```
   - `en.ts`: `'Unlimited session does not require renewal'`
   - `ko.ts`: `'무제한 세션은 갱신이 필요하지 않습니다'`

3. **Drizzle schema** (`packages/daemon/src/infrastructure/database/schema.ts`):
   - `maxRenewals`: `.default(12)` → `.default(0)` (앱 레벨, SESS-05)
   - 주의: DB 마이그레이션 필요 없음 (기존 행의 값은 변경 불필요, 새 행만 영향)

4. **OpenAPI schema** (`packages/daemon/src/api/routes/openapi-schemas.ts`):
   - `CreateSessionRequestOpenAPI`에 `maxRenewals`, `absoluteLifetime` 필드 반영 (core schema에서 자동 상속)
   - `SessionCreateResponseSchema.expiresAt` 설명에 "0 = unlimited" 추가
   - `SessionListItemSchema`에 `absoluteExpiresAt` 필드 추가 (이미 반환 중, 스키마에 명시)

**Verification:** `pnpm turbo run typecheck --filter=@waiaas/core --filter=@waiaas/daemon` 통과

---

### Plan 300-2: JwtSecretManager Unlimited Session Support

**Files:**
- `packages/daemon/src/infrastructure/jwt/jwt-secret-manager.ts` — signToken, verifyToken 수정

**Changes:**

1. **JwtPayload.exp 타입 변경** (JWT-03):
   - `exp: number` → `exp?: number` (optional)

2. **signToken()** (JWT-01, JWT-02):
   - `payload.exp`가 undefined 또는 0이면 `setExpirationTime()` 호출 건너뜀
   - 유한 세션: 기존 로직 유지 (`setExpirationTime(payload.exp)`)
   - 무제한 세션: exp 없는 JWT 생성

3. **verifyToken()** (JWT-01):
   - jose `jwtVerify`에 `maxTokenAge` 옵션 제거 (이미 없음)
   - 반환 시 `exp: payload.exp as number | undefined` 처리
   - 무제한 토큰(exp 없음)은 JWTExpired 에러 발생 안 함 (jose 자동 처리)

**Verification:** 기존 테스트 + 무제한 토큰 sign/verify 테스트 추가

---

### Plan 300-3: Session Routes — Create + List

**Files:**
- `packages/daemon/src/api/routes/sessions.ts` — POST /sessions, GET /sessions 수정

**Changes:**

1. **POST /sessions** (SESS-01, SESS-02):
   - TTL 결정 로직 변경:
     ```
     // Before: const ttl = parsed.ttl ?? deps.config.security.session_ttl;
     // After:
     const ttl = parsed.ttl; // undefined = unlimited
     ```
   - expiresAt 계산:
     - `ttl` undefined → `expiresAt = 0` (무제한, epoch 0)
     - `ttl` 있음 → `expiresAt = nowSec + ttl` (기존 로직)
   - absoluteExpiresAt 계산:
     - `parsed.absoluteLifetime` undefined → `absoluteExpiresAt = 0` (무제한)
     - `parsed.absoluteLifetime` 있음 → `absoluteExpiresAt = nowSec + parsed.absoluteLifetime`
   - maxRenewals 결정:
     - `parsed.maxRenewals ?? 0` (기본 0 = 무제한)
   - JWT payload:
     - `exp: ttl ? expiresAt : undefined` (무제한이면 exp 없음)
   - DB insert:
     - `expiresAt: new Date(expiresAt * 1000)` → 무제한이면 `new Date(0)` (epoch 0)
     - `absoluteExpiresAt: new Date(absoluteExpiresAt * 1000)` → 무제한이면 `new Date(0)`
   - Session limit check:
     - 무제한 세션의 active count에서 `gt(sessions.expiresAt, nowDate)` 조건 수정
     - `expiresAt=0`인 무제한 세션도 active로 카운트: `(expiresAt > now OR expiresAt = epoch 0)`

2. **GET /sessions** (SESS-04):
   - Status 계산 변경:
     ```
     // Before: const status = expiresAtSec < nowSec ? 'EXPIRED' : 'ACTIVE';
     // After:
     const status = expiresAtSec === 0 ? 'ACTIVE' : (expiresAtSec < nowSec ? 'EXPIRED' : 'ACTIVE');
     ```
   - 무제한 세션(expiresAt=0)은 항상 ACTIVE

**Verification:** 무제한 세션 생성 → 리스트에서 ACTIVE 확인

---

### Plan 300-4: Session Routes — Renewal Logic

**Files:**
- `packages/daemon/src/api/routes/sessions.ts` — PUT /sessions/:id/renew 수정
- `packages/daemon/src/api/routes/openapi-schemas.ts` — RENEWAL_NOT_REQUIRED 에러 추가

**Changes:**

1. **무제한 세션 갱신 거부** (RENW-01):
   - 맨 처음에 체크 추가 (session lookup 후):
     ```
     const expiresAtSec = Math.floor(session.expiresAt.getTime() / 1000);
     if (expiresAtSec === 0) {
       throw new WAIaaSError('RENEWAL_NOT_REQUIRED');
     }
     ```

2. **Check 3 수정 — maxRenewals** (RENW-02):
   - `maxRenewals === 0`이면 무제한 갱신 허용, 체크 건너뜀:
     ```
     // Before: if (session.renewalCount >= session.maxRenewals)
     // After:
     if (session.maxRenewals > 0 && session.renewalCount >= session.maxRenewals)
     ```

3. **Check 4 수정 — absoluteLifetime** (RENW-03):
   - `absoluteExpiresAt === 0`이면 무제한 수명, 체크 건너뜀:
     ```
     // Before: if (nowSec >= absoluteExpiresAtSec)
     // After:
     if (absoluteExpiresAtSec > 0 && nowSec >= absoluteExpiresAtSec)
     ```

4. **새 토큰 발급 시 clamp 로직** (RENW-04 유지):
   - `absoluteExpiresAtSec > 0`인 경우만 clamp:
     ```
     const newExpiresAt = absoluteExpiresAtSec > 0
       ? Math.min(nowSec + newTtl, absoluteExpiresAtSec)
       : nowSec + newTtl;
     ```

5. **OpenAPI 에러 응답** (`openapi-schemas.ts`):
   - `renewSessionRoute.responses`에 `RENEWAL_NOT_REQUIRED` 추가

**Verification:** 기존 5단계 검증 테스트 통과 + 무제한 세션 거부 테스트

---

### Plan 300-5: Config Removal (CONF-01, CONF-02)

**Files:**
- `packages/daemon/src/infrastructure/config/loader.ts` — 3개 필드 제거
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` — 3개 키 제거

**Changes:**

1. **DaemonConfigSchema** (`loader.ts`, CONF-02):
   - `session_ttl` 제거
   - `session_absolute_lifetime` 제거
   - `session_max_renewals` 제거
   - `max_sessions_per_wallet`은 유지 (여전히 필요)

2. **SETTING_DEFINITIONS** (`setting-keys.ts`, CONF-01):
   - `security.session_ttl` 항목 제거
   - `security.session_absolute_lifetime` 항목 제거
   - `security.session_max_renewals` 항목 제거

3. **Session route deps에서 config 참조 제거** (`sessions.ts`):
   - `deps.config.security.session_ttl` 참조 제거 (Plan 300-3에서 이미 제거)
   - `deps.config.security.session_absolute_lifetime` 참조 제거
   - `deps.config.security.session_max_renewals` 참조 제거

**Verification:** `pnpm turbo run typecheck` 통과 (config 참조 모두 제거 확인)

---

### Plan 300-6: Tests

**Files:**
- `packages/daemon/src/__tests__/api-sessions.test.ts` — 무제한 세션 테스트 추가
- `packages/daemon/src/__tests__/api-session-renewal.test.ts` — 갱신 로직 테스트 수정/추가
- `packages/daemon/src/__tests__/jwt-secret-manager.test.ts` — 무제한 토큰 테스트 (있으면 수정, 없으면 추가)

**Test Cases:**

1. **Session Creation**:
   - TTL 없이 생성 → expiresAt=0, JWT에 exp 없음
   - TTL=3600 지정 → expiresAt=now+3600, JWT에 exp 있음
   - maxRenewals=5 지정 → DB에 maxRenewals=5 저장
   - absoluteLifetime=86400 지정 → absoluteExpiresAt=now+86400

2. **Session List**:
   - 무제한 세션 → status=ACTIVE
   - 만료된 유한 세션 → status=EXPIRED
   - 활성 유한 세션 → status=ACTIVE

3. **Session Renewal**:
   - 무제한 세션 갱신 → 400 RENEWAL_NOT_REQUIRED
   - maxRenewals=0 유한 세션 → 무제한 갱신 허용
   - absoluteLifetime=0 유한 세션 → 절대 수명 체크 건너뜀
   - 기존 유한 세션 5단계 검증 → 모두 통과 (RENW-04)

4. **JWT**:
   - 무제한 세션 토큰 sign → exp 없음
   - 무제한 세션 토큰 verify → 성공, exp=undefined
   - 유한 세션 토큰 → 기존 동작 유지

5. **Session Limit**:
   - 무제한 세션도 active count에 포함
   - max_sessions_per_wallet 초과 시 SESSION_LIMIT_EXCEEDED

**Verification:** `pnpm turbo run test --filter=@waiaas/daemon` 통과, 커버리지 유지

---

### Plan 300-7: DB Migration v32

**Files:**
- `packages/daemon/src/infrastructure/database/migrate.ts` — v32 마이그레이션 추가

**Changes:**

1. **Migration v32**: `max_renewals DEFAULT 변경`
   - DDL 레벨에서는 ALTER TABLE로 DEFAULT 변경 불가 (SQLite 제한)
   - Drizzle schema의 `.default(0)`은 앱 레벨 기본값 — DDL DEFAULT는 무시
   - 따라서 실제 마이그레이션은 불필요, 하지만 LATEST_SCHEMA_VERSION을 32로 올려야 함
   - pushSchema의 CREATE TABLE에서 `max_renewals INTEGER NOT NULL DEFAULT 0`으로 변경
   - 기존 데이터 변환 불필요: 기존 세션의 maxRenewals=12는 의미가 유지됨

2. **LATEST_SCHEMA_VERSION**: 31 → 32

**Verification:** 마이그레이션 체인 테스트 통과

## Execution Order

300-1 → 300-2 → 300-3 → 300-4 → 300-5 → 300-6 → 300-7

Plans 1-5는 코드 변경, 6은 테스트, 7은 마이그레이션.
Plan 1 (core schemas)이 먼저 실행되어야 나머지가 타입 체크를 통과함.

## Success Criteria Verification

| Criterion | Plan | Verification |
|-----------|------|-------------|
| 1. TTL 없이 생성된 세션 인증 성공 | 300-3, 300-6 | 무제한 세션 API 테스트 |
| 2. 유한 세션 JWT exp 정확, 무제한 세션 JWT exp 없음 | 300-2, 300-6 | JWT 테스트 |
| 3. 무제한 세션 갱신 시 400, 유한 세션 5단계 유지 | 300-4, 300-6 | 갱신 테스트 |
| 4. Admin Settings 3개 키 제거, DaemonConfig 3개 필드 제거 | 300-5 | typecheck 통과 |
| 5. 무제한 세션 status=ACTIVE | 300-3, 300-6 | 리스트 테스트 |
