# 마일스톤 m29-09: 세션 점진적 보안 모델

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

세션 토큰의 기본 만료 정책을 **무제한**으로 변경하고, TTL·갱신 횟수·절대 수명을 세션 생성 시 개별 설정할 수 있도록 전환하여, AI 에이전트가 Operator 개입 없이 장기 자율 운영할 수 있는 점진적 보안 모델을 구축한다.

---

## 배경

### 현재 문제

WAIaaS는 셀프호스트 로컬 데몬으로, AI 에이전트의 자율 운영을 목표로 한다. 그러나 현재 세션 관리 모델은 이 목표와 모순된다:

1. **기본 TTL 30일** — 30일마다 세션 만료, Operator 재설정 필수
2. **MCP setup 기본 TTL 24시간** — 매일 Operator 개입 필요 (단, CLI가 `expiresIn` 필드명으로 전송하여 API 스키마(`ttl`)와 불일치 — 실제로는 config 기본값 30일 적용되는 기존 버그 존재)
3. **maxRenewals 12회 한도** — 자동 갱신해도 최대 ~360일 후 종료
4. **absoluteLifetime 1년** — 모든 조건 충족해도 1년 후 강제 종료
5. **MCP에서 세션 생성 불가** — 만료 시 에이전트 완전 정지, 자체 복구 수단 없음

### 설계 원칙

WAIaaS의 기존 점진적 보안 모델(v0.8 Owner 3-State: NONE→GRACE→LOCKED)과 동일한 철학을 세션에 적용한다:

```
기본 열림(무제한) → Operator가 필요 시 제한 설정
```

셀프호스트 위협 모델에서 이 접근이 합리적인 이유:
- 토큰 탈취 경로가 극히 제한적 (localhost 바인딩, 로컬 파일)
- 유출 시 `DELETE /v1/sessions/{id}` 즉시 폐기 가능
- Kill Switch로 긴급 차단 가능
- 토큰 무효화는 revocation으로 충분

---

## 구현 대상

### 1. 세션 생성 API 변경 (`POST /v1/sessions`)

현재 요청 스키마:
```typescript
// 현재: ttl만 선택적 — maxRenewals, absoluteLifetime은 Admin Settings 전역값 사용
CreateSessionRequestSchema = z.object({
  walletId: z.string().uuid().optional(),
  walletIds: z.array(z.string().uuid()).min(1).optional(),
  ttl: z.number().int().min(300).max(31536000).optional(),
  constraints: z.record(z.unknown()).nullable().optional(),
});
```

변경 후:
```typescript
// 변경: 3가지 모두 per-session 설정, 기본값 무제한
CreateSessionRequestSchema = z.object({
  walletId: z.string().uuid().optional(),
  walletIds: z.array(z.string().uuid()).min(1).optional(),
  ttl: z.number().int().min(300).max(31536000).optional(),             // 생략 = 무제한
  maxRenewals: z.number().int().min(0).max(1000).optional(),           // 생략 = 무제한
  absoluteLifetime: z.number().int().min(3600).max(315360000).optional(), // 생략 = 무제한
  constraints: z.record(z.unknown()).nullable().optional(),
});
```

### 2. 세션 생성 로직 변경

현재 핸들러 (`packages/daemon/src/api/routes/sessions.ts`):
```typescript
// 현재: config/Admin Settings에서 기본값 읽음
const ttl = parsed.ttl ?? deps.config.security.session_ttl;         // 기본 30일
const expiresAt = nowSec + ttl;
const absoluteExpiresAt = nowSec + deps.config.security.session_absolute_lifetime; // 기본 1년
const maxRenewals = deps.config.security.session_max_renewals;      // 기본 12
```

변경 후:
```typescript
// 변경: 요청 파라미터 우선, 생략 시 무제한(0)
const ttl = parsed.ttl ?? 0;                           // 0 = 무제한
const expiresAt = ttl > 0 ? nowSec + ttl : 0;          // 0 = 만료 없음
const absoluteLifetime = parsed.absoluteLifetime ?? 0;  // 0 = 무제한
const absoluteExpiresAt = absoluteLifetime > 0 ? nowSec + absoluteLifetime : 0;
const maxRenewals = parsed.maxRenewals ?? 0;            // 0 = 무제한
```

### 3. JWT 발급 및 인증 변경

현재 만료 처리 구조: DB-level 만료 체크 없음. 만료는 **JWT `exp` 클레임**으로만 `jose.jwtVerify()`에서 적용. `sessionAuth` 미들웨어는 `revokedAt` 체크만 수행.

#### 3-1. JWT 발급 (`jwt-secret-manager.ts`)

```typescript
// 현재: 항상 exp 설정
export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;       // 필수
}

async signToken(payload: JwtPayload): Promise<string> {
  const jwt = await new SignJWT({ sub: payload.sub })
    .setIssuedAt(payload.iat)
    .setExpirationTime(payload.exp)  // 항상 호출
    .sign(secretKey);
}

// 변경: exp optional — 무제한 세션은 exp 생략
export interface JwtPayload {
  sub: string;
  iat: number;
  exp?: number;      // optional (undefined = 무제한)
}

async signToken(payload: JwtPayload): Promise<string> {
  const builder = new SignJWT({ sub: payload.sub })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(payload.iat);

  if (payload.exp !== undefined) {
    builder.setExpirationTime(payload.exp);  // 유한 TTL만
  }
  // exp 생략 시 jose는 exp 클레임 없는 JWT 발급
  // jwtVerify()는 exp 없는 토큰을 정상 통과 (exp 있을 때만 만료 검증)

  const jwt = await builder.sign(secretKey);
}
```

#### 3-2. JWT 검증 (`verifyToken` 반환값)

```typescript
// 현재: exp 필수 반환
return { sub: payload.sub as string, iat: payload.iat as number, exp: payload.exp as number };

// 변경: exp optional 반환
return { sub: payload.sub as string, iat: payload.iat as number, exp: payload.exp as number | undefined };
```

#### 3-3. 세션 인증 미들웨어 (`session-auth.ts`)

현재 DB-level 만료 체크가 없으므로 추가 변경 불필요. JWT exp 생략으로 무제한 세션의 인증 통과가 보장됨. 다만, 방어적 이중 체크를 원할 경우 `revokedAt` 체크 후에 추가 가능:

```typescript
// 선택적 방어 체크 (JWT 레벨에서 이미 처리되므로 이중 안전장치)
if (session.expiresAt > 0 && session.expiresAt < now) throw SESSION_EXPIRED;
```

### 4. 세션 갱신 로직 변경 (`PUT /v1/sessions/{id}/renew`)

TTL 무제한 세션은 갱신이 무의미하므로 거부:
```typescript
// TTL 무제한 세션은 갱신 불필요
if (session.expiresAt === 0) throw RENEWAL_NOT_REQUIRED; // 새 에러 코드

// 기존 5단계 안전 검증 유지 (TTL 유한 세션)
// Check 3 변경: maxRenewals === 0이면 무제한
if (session.maxRenewals > 0 && session.renewalCount >= session.maxRenewals) {
  throw RENEWAL_LIMIT_REACHED;
}

// Check 4 변경: absoluteExpiresAt === 0이면 무제한
if (session.absoluteExpiresAt > 0 && now >= session.absoluteExpiresAt) {
  throw SESSION_ABSOLUTE_LIFETIME_EXCEEDED;
}

// 갱신 시 새 TTL 계산 — jwtPayload.exp가 undefined가 아닌 경우만 도달
// (무제한 세션은 위에서 RENEWAL_NOT_REQUIRED로 이미 거부됨)
const originalTtl = jwtPayload.exp! - jwtPayload.iat;
const newExpiresAt = session.absoluteExpiresAt > 0
  ? Math.min(nowSec + originalTtl, session.absoluteExpiresAt)
  : nowSec + originalTtl;
```

> **주의**: `jwtPayload.exp`가 `number | undefined`로 변경되므로, 갱신 Check 5 (`elapsed < ttl * 0.5`)에서 `jwtPayload.exp - jwtPayload.iat` 연산도 무제한 세션 조기 거부 후에만 실행되도록 흐름 보장 필요.

### 5. Admin Settings 키 삭제 (3개)

삭제 대상 (`packages/daemon/src/infrastructure/settings/setting-keys.ts`):
- `security.session_ttl` (기본 2592000)
- `security.session_absolute_lifetime` (기본 31536000)
- `security.session_max_renewals` (기본 12)

유지:
- `security.max_sessions_per_wallet` (기본 5)
- `security.max_pending_tx`, `security.rate_limit_session_rpm`, `security.rate_limit_tx_rpm`

### 6. DaemonConfig 스키마 변경

삭제 대상 (`packages/daemon/src/infrastructure/config/loader.ts`):
- `security.session_ttl`
- `security.session_absolute_lifetime`
- `security.session_max_renewals`

해당 필드는 config.toml에서도 제거. 환경변수 `WAIAAS_SECURITY_SESSION_TTL` 등도 불필요.

### 7. MCP SessionManager 변경

`packages/mcp/src/session-manager.ts`:

#### 7-1. `applyToken()` — exp 검증 완화 (선행 변경)

```typescript
// 현재: exp 필수 + 1년 범위 제한
applyToken(token: string) {
  const payload = decodeJwt(token);
  if (typeof payload.exp !== 'number') {
    this.state = 'error';  // exp 없으면 에러!
    return;
  }
  if (payload.exp < now - tenYears || payload.exp > now + oneYear) {
    this.state = 'error';  // 범위 밖이면 에러
    return;
  }
  this.expiresAt = payload.exp;
}

// 변경: exp optional — undefined이면 무제한
applyToken(token: string) {
  const payload = decodeJwt(token);
  if (payload.exp !== undefined) {
    if (typeof payload.exp !== 'number') {
      this.state = 'error';
      return;
    }
    if (payload.exp < now - tenYears || payload.exp > now + oneYear) {
      this.state = 'error';
      return;
    }
    this.expiresAt = payload.exp;
  } else {
    this.expiresAt = 0;  // 무제한
  }
}
```

#### 7-2. `start()` — 무제한 세션 분기

```typescript
// 현재: 항상 갱신 스케줄링
scheduleRenewal() {
  const remaining = expiresAt - now;
  const delayMs = Math.floor(remaining * renewalRatio) * 1000;
  // ...
}

// 변경: expiresAt === 0이면 스케줄링 스킵
start() {
  await loadToken();
  if (this.expiresAt === 0) {
    this.state = 'active';  // 무제한 — 갱신 불필요, 바로 active
    return;
  }
  // 기존 로직 (유한 TTL)
  scheduleRenewal();
}
```

Recovery loop도 무제한 세션에서는 시작하지 않음 (만료 자체가 없으므로).

### 8. MCP Setup CLI 변경

`packages/cli/src/commands/mcp-setup.ts`:

| 항목 | 현재 | 변경 |
|------|------|------|
| 플래그 이름 | `--expires-in` (초 단위) | `--ttl` (일 단위) |
| 기본값 | 86400 (24시간) | 생략 = 무제한 |
| 추가 플래그 | 없음 | `--max-renewals`, `--lifetime` (일 단위) |
| API 전송 | `{ expiresIn: 86400 }` | `{ ttl: N*86400 }` (N일 → 초 변환) 또는 생략 |

```bash
# 기본: 무제한 세션
waiaas mcp setup

# 제한 설정 (일 단위)
waiaas mcp setup --ttl 30 --max-renewals 10 --lifetime 90
```

### 9. Admin UI 변경

#### Settings 탭 (`packages/admin/src/pages/sessions.tsx`)

SESSION_KEYS에서 3개 제거:
```typescript
// 현재
const SESSION_KEYS = [
  'security.session_ttl',                // 삭제
  'security.session_absolute_lifetime',   // 삭제
  'security.session_max_renewals',        // 삭제
  'security.max_sessions_per_wallet',     // 유지
  'security.max_pending_tx',              // 유지
  'security.rate_limit_session_rpm',      // 유지
  'security.rate_limit_tx_rpm',           // 유지
];
```

Lifetime FieldGroup 축소: `max_sessions_per_wallet`만 남음.

#### Create Session 모달

지갑 선택 아래에 Advanced 접이식 섹션 추가:

```
┌──────────────────────────────────┐
│ Create Session                   │
│                                  │
│ Select Wallets:                  │
│ ☑ trading-bot (solana/mainnet)   │
│ ☐ savings (ethereum/mainnet)     │
│                                  │
│ ▶ Advanced                       │
│ ┌──────────────────────────────┐ │
│ │ TTL:            [        ] days │
│ │ Max Renewals:   [        ]     │
│ │ Lifetime:       [        ] days │
│ │ (비워두면 무제한)                │
│ └──────────────────────────────┘ │
│                                  │
│ [Create Session (1)]             │
└──────────────────────────────────┘
```

- TTL, Lifetime: 일(day) 단위 입력 → API 전송 시 `× 86400` 초 변환
- Max Renewals: 횟수 그대로
- 빈 값 = 무제한 (API에 해당 필드 생략)
- Advanced 섹션 기본 접힘 — 대부분 Operator는 펼치지 않고 무제한 사용

#### 세션 목록 테이블

무제한 값 표시 처리:

| 필드 | 유한 값 | 무제한 (0) |
|------|--------|-----------|
| Expires | `2026-03-31` | `—` |
| Renewals | `2/12` | `—` |

### 10. SDK 변경 (`@waiaas/sdk`)

`packages/sdk/src/types.ts`:

```typescript
// 현재: expiresIn — API 스키마(ttl)와 필드명 불일치 버그
export interface CreateSessionParams {
  walletId?: string;
  walletIds?: string[];
  expiresIn?: number;     // ← API에 전송되나 스키마에 없어 무시됨
  constraints?: Record<string, unknown>;
  source?: 'api' | 'mcp';
}

// 변경: ttl로 리네임 + 신규 필드
export interface CreateSessionParams {
  walletId?: string;
  walletIds?: string[];
  ttl?: number;                // 초 단위, 생략 = 무제한
  maxRenewals?: number;        // 생략 = 무제한
  absoluteLifetime?: number;   // 초 단위, 생략 = 무제한
  constraints?: Record<string, unknown>;
  source?: 'api' | 'mcp';
}
```

`packages/sdk/src/client.ts` — `createSession()` 본문 구성에서 `expiresIn` → `ttl`로 변경하고 `maxRenewals`, `absoluteLifetime`을 조건부 포함.

### 11. Drizzle default 정합성

`packages/daemon/src/infrastructure/db/schema.ts`:

```typescript
// 현재: behavioral default와 불일치
maxRenewals: integer('max_renewals').notNull().default(12),

// 변경: 새 behavioral default(0=무제한)와 일치
maxRenewals: integer('max_renewals').notNull().default(0),
```

> 앱 레벨 default 변경으로 DDL/마이그레이션 불필요. 코드에서 항상 명시적으로 값을 전달하므로 기능 영향 없음. 정합성 확보 목적.

### 12. Skill 파일 동기화

| 파일 | 변경 내용 |
|------|----------|
| `skills/wallet.skill.md` | 세션 생성 파라미터: ttl 기본값 무제한, maxRenewals·absoluteLifetime 추가 |
| `skills/quickstart.skill.md` | 세션 생성 예제: 기본 무제한 반영, ttl=2592000 예시 유지 |
| `skills/admin.skill.md` | `expiresIn?` → `ttl?`, maxRenewals·absoluteLifetime 추가 |
| `skills/session-recovery.skill.md` | 무제한 세션 갱신 거부(RENEWAL_NOT_REQUIRED) 동작 추가 |

> CLAUDE.md 규칙: "REST API, SDK, or MCP interfaces change → skills/ files must be updated."
> MCP 세션 도구는 존재하지 않음 (세션 관리는 transport 계층에서 처리). MCP 도구 변경 불필요.

### 13. 세션 목록 API 응답 변경

`GET /v1/sessions` 응답에서 무제한 값을 명확히 전달:

```typescript
{
  id: "...",
  expiresAt: 0,           // 0 = 무제한
  absoluteExpiresAt: 0,   // 0 = 무제한
  maxRenewals: 0,         // 0 = 무제한
  renewalCount: 0,
  status: "ACTIVE",       // expiresAt=0이면 항상 ACTIVE (revoke 전까지)
  // ...
}
```

#### status 계산 로직 수정

```typescript
// 현재: expiresAt=0(epoch 0)이면 항상 EXPIRED로 판정되는 버그
const status = expiresAtSec < nowSec ? 'EXPIRED' : 'ACTIVE';

// 변경: 0=무제한 분기 추가 (revokedAt 세션은 쿼리에서 이미 필터됨)
const status = expiresAtSec === 0 || expiresAtSec >= nowSec
  ? 'ACTIVE'
  : 'EXPIRED';
```

> **배경**: Drizzle `{ mode: 'timestamp' }`에서 `expiresAt=0`은 `new Date(0)` = 1970-01-01로 저장됨. 기존 `expiresAtSec < nowSec` 비교에서 0은 항상 현재보다 작으므로 무제한 세션이 EXPIRED로 잘못 표시됨. REVOKED 분기는 불필요 — 세션 목록 쿼리가 `.where(isNull(sessions.revokedAt))`로 revoked 세션을 이미 제외함.

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 무제한 표현 | `0` (정수) | null은 JSON/DB 처리 복잡. 0은 "만료 시점 없음"으로 직관적. TTL min=300이므로 0과 유효값이 겹치지 않음 |
| 2 | 전역 기본값 제거 | Admin Settings에서 3키 삭제 | per-session 설정으로 이동. 전역 기본값이 있으면 "기본 열림" 원칙과 충돌 가능 |
| 3 | UI 입력 단위 | 일(day) — API/DB는 초(sec) 유지 | Operator에게 `2592000`보다 `30`이 직관적. 변환은 UI/CLI 계층에서 `×86400`. API 하위 호환 유지 |
| 4 | TTL 무제한 시 갱신 정책 | 갱신 거부 (RENEWAL_NOT_REQUIRED) | 토큰 로테이션 불필요 — 같은 JWT 영구 유효. 폐기(revoke)가 유일한 무효화 수단 |
| 5 | Advanced 섹션 기본 접힘 | 접이식(collapsible) | 기본 워크플로우(지갑 선택→생성) 복잡도 증가 없이 세밀 제어 제공 |
| 6 | MCP SessionManager 무제한 처리 | exp=0이면 active 유지, 갱신·recovery 스킵 | 무제한 세션에서 갱신/복구 로직은 불필요한 오버헤드 |
| 7 | 만료 적용 계층 | JWT exp 클레임 (DB-level 아님) | 현재 구조가 이미 JWT 기반. DB-level 이중 체크는 선택적 방어 장치로만 추가. 핵심 변경은 `signToken()`에서 exp 조건부 생략 |
| 8 | `JwtPayload.exp` 타입 | `exp?: number` (optional) | 무제한 세션의 JWT에 exp 클레임 자체가 없음. 타입 시스템으로 이를 반영. 갱신 로직에서 무제한 조기 거부 후에만 `exp!` 사용 |
| 9 | CLI 필드명 버그 수정 | `expiresIn` → `ttl`로 통일 | 기존 CLI가 `{ expiresIn }` 전송 → API 스키마 `{ ttl }` 불일치로 24시간 기본값 미적용 버그. `--ttl` 리네임 시 자연 해결 |
| 10 | Drizzle default 정합성 | `.default(12)` → `.default(0)` | DB 스키마 `maxRenewals` 컬럼의 Drizzle default가 12. 새 behavioral default(0=무제한)와 불일치. DDL 변경 아닌 앱 레벨 default만 수정. 코드에서 항상 명시적 값 전달하므로 기능 영향 없지만 정합성 확보 |
| 11 | SDK `expiresIn` 필드명 | `expiresIn` → `ttl` 리네임 + 신규 필드 | SDK `CreateSessionParams.expiresIn`이 API 스키마 `ttl`과 불일치 (CLI와 동일 버그). `ttl`로 리네임하고 `maxRenewals`, `absoluteLifetime` 추가. `CreateSessionResponse.expiresAt`는 0=무제한 표현 |
| 12 | Admin Settings DB 잔존 행 | 자동 제외 — 조치 불필요 | `getAllMasked()`는 `SETTING_DEFINITIONS` 레지스트리 기반으로 순회. 삭제된 키의 DB 행이 남아 있어도 API 응답에 포함되지 않음 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 세션 생성 — 파라미터 생략 시 무제한 | `POST /v1/sessions { walletId }` → expiresAt=0, maxRenewals=0, absoluteExpiresAt=0 assert | [L0] |
| 2 | 세션 생성 — TTL 지정 | `POST /v1/sessions { walletId, ttl: 86400 }` → expiresAt=now+86400 assert | [L0] |
| 3 | 세션 생성 — 3가지 모두 지정 | `{ ttl: 86400, maxRenewals: 5, absoluteLifetime: 604800 }` → 각각 DB 반영 assert | [L0] |
| 4 | 무제한 세션 — 인증 성공 | expiresAt=0 세션 토큰으로 API 호출 → 200 OK assert | [L0] |
| 5 | 무제한 세션 — 갱신 거부 | `PUT /v1/sessions/{id}/renew` → RENEWAL_NOT_REQUIRED assert | [L0] |
| 6 | 유한 TTL 세션 — 기존 갱신 로직 유지 | TTL=3600 세션 생성 → 50% 경과 → 갱신 성공 → 새 토큰 assert | [L0] |
| 7 | maxRenewals=0 — 무제한 갱신 | TTL=3600 + maxRenewals=0 → 갱신 13회 이상 성공 assert | [L0] |
| 8 | absoluteLifetime=0 — 무제한 수명 | 갱신 시 absoluteExpiresAt 체크 스킵 assert | [L0] |
| 9 | 무제한 세션 — revoke 즉시 무효화 | `DELETE /v1/sessions/{id}` → 이후 API 호출 → SESSION_REVOKED assert | [L0] |
| 10 | Admin Settings — 3키 삭제 확인 | `GET /v1/admin/settings` → session_ttl, session_absolute_lifetime, session_max_renewals 없음 assert | [L0] |
| 11 | Admin UI — Create 모달 Advanced 섹션 | TTL·Renewals·Lifetime 입력 → 세션 생성 → 값 반영 assert | [L0] |
| 12 | Admin UI — 세션 목록 무제한 표시 | expiresAt=0 세션 → Expires 열에 `—` 표시 assert | [L0] |
| 13 | MCP SessionManager — 무제한 토큰 | exp 없는 JWT 로드 → state='active', 갱신 스케줄 없음 assert | [L0] |
| 14 | CLI — `waiaas mcp setup` 기본 무제한 | 플래그 없이 실행 → TTL 미전송 → 무제한 세션 생성 assert | [L0] |
| 15 | CLI — `--ttl 30` 일 단위 변환 | `--ttl 30` → API에 `ttl: 2592000` (30×86400) 전송 assert | [L0] |
| 16 | 세션 목록 — 무제한 세션 status=ACTIVE | expiresAt=0 세션 `GET /v1/sessions` → status=`ACTIVE` assert (EXPIRED 아님) | [L0] |
| 17 | JWT — 무제한 세션 exp 클레임 없음 | expiresAt=0 세션 생성 → JWT 디코딩 → exp 클레임 undefined assert | [L0] |
| 18 | JWT — 유한 세션 exp 클레임 존재 | ttl=3600 세션 생성 → JWT 디코딩 → exp = iat+3600 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| 없음 | 기존 인프라 수정만으로 구현 가능. 외부 의존 없음 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 무제한 토큰 유출 시 영구 접근 | 탈취된 토큰이 revoke 전까지 유효 | 셀프호스트 localhost 바인딩으로 탈취 경로 제한적. Kill Switch + 즉시 revoke로 대응. 보안 민감 Operator는 TTL 설정 |
| 2 | 기존 세션 마이그레이션 | 이미 생성된 세션의 동작 변경 없음 | 기존 세션은 생성 시 설정된 값(expiresAt, maxRenewals, absoluteExpiresAt) 유지. 새 세션만 새 기본값 적용 |
| 3 | JWT exp 클레임 처리 | 무제한 세션의 JWT에 exp를 어떻게 설정할지 | **해결됨**: jose 6.x에서 `setExpirationTime()` 미호출 시 JWT에 exp 클레임이 생략되며, `jwtVerify()`는 exp 없는 토큰을 정상 통과시킴 (exp 있을 때만 만료 검증). JWT 표준에서 exp 생략 = "만료 없음". 영향 범위: (1) `JwtPayload.exp` → optional 타입 변경, (2) `signToken()` → exp 조건부 설정, (3) `verifyToken()` → 반환 타입 수정, (4) 갱신 Check 5 → 무제한 조기 거부 후 `exp!` 사용, (5) MCP `applyToken()` → exp undefined 허용 + 범위 체크 조건부 |
| 4 | Admin Settings 하위 호환 | 3키 삭제 시 기존 설정값 잔존 | config.toml: Zod passthrough로 unknown key 무시, 경고 로그 출력. Admin Settings DB: `getAllMasked()`가 `SETTING_DEFINITIONS` 레지스트리만 순회하므로 삭제된 키의 DB 행은 API 응답에 자동 제외. 별도 마이그레이션 불필요 |

---

## 수정 대상 파일

| 패키지 | 파일 | 변경 내용 |
|--------|------|----------|
| core | `schemas/session.schema.ts` | CreateSessionRequestSchema에 maxRenewals, absoluteLifetime 추가 |
| core | `errors/error-codes.ts` | RENEWAL_NOT_REQUIRED 에러 코드 추가 (httpStatus: 400) |
| daemon | `infrastructure/jwt/jwt-secret-manager.ts` | `JwtPayload.exp` optional 변경, `signToken()` exp 조건부 설정, `verifyToken()` 반환 타입 수정 |
| daemon | `api/routes/sessions.ts` | 생성 로직: per-session 파라미터 적용, 기본값 0(무제한). JWT 발급 시 exp 조건부 전달 |
| daemon | `api/routes/sessions.ts` | 갱신 로직: 무제한 조기 거부(RENEWAL_NOT_REQUIRED), maxRenewals/absoluteExpiresAt 0 처리, exp 연산 안전 보장 |
| daemon | `api/routes/sessions.ts` | 목록 API: status 계산에 `expiresAt=0 → ACTIVE` 분기 추가 |
| daemon | `api/middleware/session-auth.ts` | (선택) 방어적 DB-level 만료 체크 추가: `expiresAt > 0 && expiresAt < now`. JWT 레벨에서 이미 처리되므로 이중 안전장치 |
| daemon | `infrastructure/settings/setting-keys.ts` | 3키 삭제 |
| daemon | `infrastructure/config/loader.ts` | security 스키마에서 3필드 삭제 |
| mcp | `session-manager.ts` | `applyToken()`: exp optional 검증. `start()`: 무제한 active 유지, 갱신/recovery 스킵 |
| cli | `commands/mcp-setup.ts` | `--expires-in` → `--ttl`(일) 리네임 + 필드명 버그 수정(`expiresIn`→`ttl`), `--max-renewals`, `--lifetime`(일) 추가, 기본 무제한 |
| admin | `pages/sessions.tsx` | Settings 탭 3키 제거, Create 모달 Advanced 섹션, 목록 무제한 표시(expiresAt=0 → `—`) |
| sdk | `types.ts` | `CreateSessionParams.expiresIn` → `ttl` 리네임, `maxRenewals`·`absoluteLifetime` 추가. `CreateSessionResponse.expiresAt` 0=무제한 문서화 |
| sdk | `client.ts` | `createSession()` 본문 구성: `expiresIn` → `ttl`, 신규 필드 조건부 포함 |
| daemon | `infrastructure/db/schema.ts` | `sessions.maxRenewals` Drizzle `.default(12)` → `.default(0)` (앱 레벨 default 정합성, DDL 변경 아님) |
| skills | `wallet.skill.md` | 세션 생성 파라미터: `ttl` 기본값 무제한, `maxRenewals`·`absoluteLifetime` 추가 |
| skills | `quickstart.skill.md` | 세션 생성 예제: 기본 무제한 반영 |
| skills | `admin.skill.md` | `expiresIn` → `ttl`, 신규 파라미터 추가 |
| skills | `session-recovery.skill.md` | 무제한 세션 갱신 거부(RENEWAL_NOT_REQUIRED) 동작 반영 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2개 (API+로직+MCP 1 / Admin UI+CLI+테스트 1) |
| 신규/수정 파일 | 19-22개 |
| 테스트 | 18-22개 |
| DB 마이그레이션 | 불필요 — expiresAt, absoluteExpiresAt, maxRenewals 컬럼 이미 per-session 존재 |

---

*생성일: 2026-03-01*
*검증일: 2026-03-02 — 코드베이스 대조 결과 반영 (섹션 3 재작성, 갭 4건 보완, 기술 결정 3건 추가)*
*보완일: 2026-03-02 — SDK 변경·Drizzle default 정합성·Skill 파일 동기화·Admin Settings DB 잔존 행 처리 5건 보완 (기술 결정 10-12, 수정 대상 +8파일)*
*관련: v0.8 Owner 점진적 보안 모델, v26.4 멀티 지갑 세션*
