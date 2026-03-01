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
2. **MCP setup 기본 TTL 24시간** — 매일 Operator 개입 필요
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

### 3. 세션 인증 미들웨어 변경

`sessionAuth` 미들웨어에서 만료 체크 시 `expiresAt === 0`이면 만료 검사 스킵:
```typescript
// 현재: 항상 만료 체크
if (session.expiresAt < now) throw SESSION_EXPIRED;

// 변경: 0이면 무제한
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

// 갱신 시 새 TTL 계산
const originalTtl = session.expiresAt - session.createdAt; // 또는 lastRenewedAt 기준
const newExpiresAt = session.absoluteExpiresAt > 0
  ? Math.min(nowSec + originalTtl, session.absoluteExpiresAt)
  : nowSec + originalTtl;
```

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

### 10. 세션 목록 API 응답 변경

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
| 3 | JWT exp 클레임 처리 | 무제한 세션의 JWT에 exp를 어떻게 설정할지 | **해결됨**: jose 6.x에서 `setExpirationTime()` 미호출 시 JWT에 exp 클레임이 생략되며, `jwtVerify()`는 exp 없는 토큰을 정상 통과시킴 (exp 있을 때만 만료 검증). JWT 표준에서 exp 생략 = "만료 없음". MCP SessionManager의 수동 디코딩에서 exp 없음을 무제한으로 처리하도록 변경 필요 (현재 exp 필수 + 1년 범위 제한 → exp optional로 변경) |
| 4 | Admin Settings 하위 호환 | 3키 삭제 시 기존 config.toml에 남아 있는 값 | config.toml 파싱에서 unknown key는 무시(Zod passthrough). 경고 로그 출력 |

---

## 수정 대상 파일

| 패키지 | 파일 | 변경 내용 |
|--------|------|----------|
| core | `schemas/session.schema.ts` | CreateSessionRequestSchema에 maxRenewals, absoluteLifetime 추가 |
| daemon | `api/routes/sessions.ts` | 생성 로직: per-session 파라미터 적용, 기본값 0(무제한) |
| daemon | `api/routes/sessions.ts` | 갱신 로직: 무제한 분기, maxRenewals/absoluteExpiresAt 0 처리 |
| daemon | `api/middleware/session-auth.ts` | expiresAt=0 만료 스킵 |
| daemon | `infrastructure/settings/setting-keys.ts` | 3키 삭제 |
| daemon | `infrastructure/config/loader.ts` | security 스키마에서 3필드 삭제 |
| daemon | `infrastructure/auth/jwt-secret-manager.ts` | exp=0 JWT 발급 처리 |
| mcp | `session-manager.ts` | 무제한 토큰: active 유지, 갱신/recovery 스킵 |
| cli | `commands/mcp-setup.ts` | `--ttl`(일), `--max-renewals`, `--lifetime`(일) 플래그, 기본 무제한 |
| admin | `pages/sessions.tsx` | Settings 탭 3키 제거, Create 모달 Advanced 섹션, 목록 무제한 표시 |
| core | `errors/error-codes.ts` | RENEWAL_NOT_REQUIRED 에러 코드 추가 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2개 (API+로직+MCP 1 / Admin UI+CLI+테스트 1) |
| 신규/수정 파일 | 11-14개 |
| 테스트 | 15-20개 |
| DB 마이그레이션 | 불필요 — expiresAt, absoluteExpiresAt, maxRenewals 컬럼 이미 per-session 존재 |

---

*생성일: 2026-03-01*
*관련: v0.8 Owner 점진적 보안 모델, v26.4 멀티 지갑 세션*
