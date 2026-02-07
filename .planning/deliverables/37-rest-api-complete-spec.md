# WAIaaS v0.2 REST API 전체 스펙 (API-SPEC)

**문서 ID:** API-SPEC
**작성일:** 2026-02-05
**v0.5 인증 모델 업데이트:** 2026-02-07
**상태:** 완료
**참조:** CORE-06 (29-api-framework-design.md), SESS-PROTO (30-session-token-protocol.md), TX-PIPE (32-transaction-pipeline-api.md), OWNR-CONN (34-owner-wallet-connection.md), KILL-AUTO-EVM (36-killswitch-autostop-evm.md), CORE-02 (25-sqlite-schema.md), CORE-05 (28-daemon-lifecycle-cli.md), AUTH-REDESIGN (52-auth-model-redesign.md), SESS-RENEW (53-session-renewal-protocol.md), DX-IMPROVE (55-dx-improvement-spec.md)
**요구사항:** Phase 9 Success Criteria #1 -- REST API 전체 스펙 완성

---

## 1. 문서 개요

### 1.1 목적

WAIaaS v0.2의 **전체 REST API 스펙 통합 문서**이다. Phase 6-8에서 분산 정의된 23개 엔드포인트와 Phase 9에서 추가하는 7개 엔드포인트, Phase 20에서 추가하는 1개 엔드포인트를 합쳐 총 **31개 엔드포인트**의 요청/응답 Zod 스키마, 인증 체계, 에러 코드 체계, OpenAPI 3.0 구조를 정의한다.

SDK, MCP Server, Tauri Desktop, Telegram Bot 등 모든 클라이언트가 참조하는 **API 단일 소스(Single Source of Truth)** 역할을 한다.

### 1.2 참조 문서

| 문서 ID | 파일 | 핵심 내용 |
|---------|------|-----------|
| CORE-06 | 29-api-framework-design.md | Hono OpenAPIHono, 8 미들웨어, localhost 보안, Zod/OpenAPI |
| SESS-PROTO | 30-session-token-protocol.md | JWT HS256 jose, sessionAuth 2-stage, POST /v1/sessions |
| TX-PIPE | 32-transaction-pipeline-api.md | 6-stage pipeline, 9 API endpoints Zod specs |
| OWNR-CONN | 34-owner-wallet-connection.md | WalletConnect v2, ownerAuth 8-step, Owner API 엔드포인트 |
| KILL-AUTO-EVM | 36-killswitch-autostop-evm.md | Kill Switch API, /v1/admin/kill-switch |
| CORE-02 | 25-sqlite-schema.md | 8 tables, Drizzle ORM, 스키마 참조 (v0.5 agents.owner_address 추가) |
| CORE-05 | 28-daemon-lifecycle-cli.md | /v1/admin/shutdown, Graceful Shutdown |
| AUTH-REDESIGN | 52-auth-model-redesign.md | v0.5 3-tier 인증 모델, 31 엔드포인트 인증 맵 재배치 |

### 1.3 v0.1 -> v0.2 핵심 차이

| 영역 | v0.1 (Cloud) | v0.2 (Self-Hosted) |
|------|-------------|-------------------|
| 인증 | API Key (`wai_live_xxx`) + OAuth 2.1 | JWT Session (`wai_sess_xxx`) + SIWS/SIWE Owner + Master Password |
| 서버 URL | `https://api.waiass.io/api/v1` | `http://127.0.0.1:3100` |
| 보안 스키마 | Bearer API Key + OAuth scopes | 3종 인증 (Session, Owner Signature, Master Password) |
| 거래 파이프라인 | 8단계 (Enclave + Squads) | 6단계 (로컬 키스토어 + 정책 엔진) |
| 에러 포맷 | RFC 9457 + 46개 코드 | 간소화 JSON + 도메인별 에러 코드 |

### 1.4 전체 엔드포인트 요약 (v0.5 변경)

| 카테고리 | 수 | 인증 | 범위 |
|----------|---|------|------|
| Public API | 3 | None | 헬스체크, 문서, nonce |
| Session API (Agent) | 7 | Session Bearer | 지갑, 거래, 세션 조회, 세션 갱신 (Phase 20 추가: +1) |
| System Management API | 16 | masterAuth (implicit) | 세션 CRUD, 에이전트 CRUD, 정책, 설정, 대시보드 |
| Owner Auth API | 1 | Owner Signature | 거래 승인 (APPROVAL 티어) |
| Dual Auth API | 1 | Owner Signature + Master Password | Kill Switch 복구 |
| Admin API | 3 | Master Password (explicit) | Kill Switch, Shutdown, Status |
| **합계** | **31** | | `/doc` 포함 시 32 |

> **v0.5 변경:** v0.2의 "Session Management API 3 (ownerAuth)" + "Owner API 17 (ownerAuth)"가 3-tier 재분류로 통합 재편성되었다. ownerAuth 적용은 2곳(거래 승인, KS 복구)으로 축소. 나머지 시스템 관리 엔드포인트는 masterAuth(implicit)로 이동. 52-auth-model-redesign.md 섹션 4 참조.

---

## 2. 서버 정보 + 기본 설정

### 2.1 Base URL

```
http://127.0.0.1:{port}
```

| 항목 | 값 | 근거 |
|------|-----|------|
| 호스트 | `127.0.0.1` | `z.literal('127.0.0.1')` 강제 (CORE-01 결정) |
| 기본 포트 | `3100` | `config.toml [daemon].port`, 환경변수 `WAIAAS_DAEMON_PORT` 오버라이드 가능 |
| 프로토콜 | HTTP | localhost 전용, TLS 불필요 |

### 2.2 Content-Type

`application/json` 단일 포맷. Content negotiation 미채택 (CORE-06 결정).

### 2.3 공통 요청 헤더

| 헤더 | 방향 | 필수 | 설명 |
|------|------|------|------|
| `Content-Type` | Request | POST/PUT 시 | `application/json` |
| `Authorization` | Request | 인증 필요 엔드포인트 | `Bearer wai_sess_...` 또는 `Bearer <ownerSignaturePayload>` |
| `X-Master-Password` | Request | Admin API + KS 복구 | 마스터 패스워드 평문. Admin API (explicit masterAuth) 및 Kill Switch 복구 (dual-auth). 대부분의 masterAuth 엔드포인트는 implicit (헤더 불필요). (v0.5 변경) |
| `X-Request-ID` | 양방향 | 선택 | 클라이언트 제공 시 재사용, 없으면 서버 생성 (`req_` + 22자) |

### 2.4 공통 응답 헤더

| 헤더 | 설명 |
|------|------|
| `X-Request-ID` | 요청 추적 ID |
| `X-RateLimit-Limit` | 현재 윈도우 최대 요청 수 |
| `X-RateLimit-Remaining` | 남은 요청 수 |
| `X-RateLimit-Reset` | 윈도우 리셋 Unix timestamp |
| `Retry-After` | 429/503 시 재시도 대기 시간 (초) |

### 2.5 CORS 설정

```typescript
cors({
  origin: [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    'tauri://localhost',  // Phase 9 Tauri WebView 대응
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Authorization', 'Content-Type', 'X-Request-ID', 'X-Master-Password'],
  exposeHeaders: ['X-Request-ID', 'Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 600,
})
```

**`tauri://localhost` 추가 근거:** Tauri 2.x WebView는 `tauri://localhost` Origin을 사용한다. CORE-06에서 Phase 9 과제로 예고된 항목.

---

## 3. 인증 체계 (OpenAPI securitySchemes)

3종 인증 스키마를 OpenAPI `securitySchemes`로 정의한다.

### 3.1 Session Bearer (`bearerAuth`)

Agent API 전체에 적용되는 JWT 세션 토큰 인증.

```yaml
# OpenAPI 3.0 securitySchemes
bearerAuth:
  type: http
  scheme: bearer
  bearerFormat: JWT
  description: |
    WAIaaS 세션 토큰. 형식: wai_sess_ + JWT HS256 (~270 bytes)
    sessionAuth 2-stage 검증:
      Stage 1: JWT 서명 검증 (DB 접근 없음)
      Stage 2: sessions 테이블에서 폐기 여부 + 제약 조건 조회
```

| 항목 | 값 |
|------|-----|
| 토큰 형식 | `wai_sess_` + JWT HS256 (~270 bytes) |
| 알고리즘 | HS256 (jose v6.x) |
| JWT Claims | `iss`, `exp`, `iat`, `jti`, `sid`, `aid` |
| 만료 범위 | 최소 5분 ~ 최대 7일, 기본 24시간 |
| 검증 | 2-stage: Stage 1 JWT verify (no DB) -> Stage 2 DB lookup (폐기/제약) |
| 적용 | `/v1/wallet/*`, `/v1/transactions/*`, `GET /v1/sessions` (v0.5: 에이전트 자기 세션 조회 추가) |

**헤더 예시:**
```
Authorization: Bearer wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ3YWlhYXMiLCJpYXQiOjE3NzAyODcxODUsImV4cCI6MTc3MDM3MzU4NSwianRpIjoiMDE5NTAyYTgtN2IzYy03ZDRlLThmNWEtMTIzNDU2Nzg5MGFiIiwic2lkIjoiMDE5NTAyYTgtN2IzYy03ZDRlLThmNWEtMTIzNDU2Nzg5MGFiIiwiYWlkIjoiMDE5NTAyODgtMWEyYi0zYzRkLTVlNmYtYWJjZGVmMDEyMzQ1In0.xxxxx
```

### 3.2 Owner Signature (`ownerAuth`) (v0.5 변경)

자금 이동 승인 및 Kill Switch 복구에만 적용되는 요청별 SIWS/SIWE 서명 인증. (v0.5 변경: 적용 범위 2곳으로 축소)

```yaml
ownerAuth:
  type: apiKey
  in: header
  name: Authorization
  description: |
    Owner 지갑 서명 페이로드. 형식: Bearer <base64url JSON>
    페이로드: { chain, address, action, nonce, timestamp, message, signature }
    검증: 8-step verify chain (OWNR-CONN v0.5 참조)
    유효기간: 5분 (timestamp + nonce + action binding)
    v0.5: 적용 범위 2곳 한정 (approve_tx, recover)
```

| 항목 | 값 |
|------|-----|
| 전달 방식 | `Authorization: Bearer <base64url encoded JSON>` |
| 페이로드 필드 | chain, address, action, nonce, timestamp, message, signature |
| 서명 알고리즘 | Solana: Ed25519 (tweetnacl), EVM: EIP-191 (siwe + ethers) |
| 유효기간 | 5분 (timestamp 기준) |
| nonce | 일회성 (LRU 캐시, max 1000, TTL 5분) |
| 적용 | `POST /v1/owner/approve/:txId`, `POST /v1/owner/recover` (v0.5 변경: 2곳만) |

**ownerSignaturePayload Zod 스키마 (v0.5 변경: action 7개에서 2개로 축소):**
```typescript
const OwnerSignaturePayloadSchema = z.object({
  chain: z.enum(['solana', 'ethereum']),
  address: z.string(),
  action: z.enum([
    'approve_tx',  // POST /v1/owner/approve/:txId
    'recover',     // POST /v1/owner/recover
  ]),
  nonce: z.string(),
  timestamp: z.string().datetime(),
  message: z.string(),
  signature: z.string(),
})
```

**ownerAuth 8단계 검증 (OWNR-CONN v0.5 참조):**

| 단계 | 검증 항목 | 실패 시 |
|------|----------|---------|
| 1 | Authorization 헤더 파싱 + payload 디코딩 | 401 UNAUTHORIZED |
| 2 | timestamp 유효성 (5분 이내) | 401 INVALID_SIGNATURE |
| 3 | nonce 일회성 (LRU 캐시 확인 + 삭제) | 401 INVALID_NONCE |
| 4 | SIWS/SIWE 서명 암호학적 검증 | 401 INVALID_SIGNATURE |
| 5 | 서명자 == agents.owner_address (v0.5 변경: 에이전트별 검증) | 403 OWNER_MISMATCH |
| 6 | action == 라우트 기대 action | 403 INVALID_SIGNATURE |
| 7 | 컨텍스트 설정 (ownerAddress, ownerChain) | - |
| 8 | next() | - |

> **v0.5 Step 5 변경:** 서명자 주소 검증 대상이 `owner_wallets.address`(전역 단일 Owner)에서 `agents.owner_address`(에이전트별 Owner)로 변경. 52-auth-model-redesign.md 섹션 3.2 참조.

### 3.3 Master Password (`masterAuth`) (v0.5 변경)

시스템 관리 전반에 적용되는 마스터 패스워드 기반 인증. v0.5에서 **2가지 모드**로 확장. (v0.5 변경)

```yaml
masterAuth:
  type: apiKey
  in: header
  name: X-Master-Password
  description: |
    v0.5 2가지 모드:
    - implicit: 데몬 실행 = 인증 상태. 헤더 불필요. 시스템 관리 전반.
    - explicit: X-Master-Password 헤더 필수. Admin API + KS 복구 dual-auth.
    brute-force 방지 (explicit만): 5회 실패 -> 30분 lockout
```

**암묵적 masterAuth (implicit)** (v0.5 신규)

- **전제 조건**: 데몬 구동 중 = 마스터 패스워드 인증 완료 상태
- **추가 헤더**: 불필요. HTTP 요청에 인증 관련 헤더를 포함하지 않아도 된다.
- **적용 범위**: 세션 CRUD, 에이전트 CRUD, 정책 CRUD, 설정 변경, 조회 등 시스템 관리 전반 (16개 엔드포인트)
- **보안 근거**: localhost 바인딩(`127.0.0.1` Zod literal)에 의존. 로컬 네트워크 외부에서 접근 불가.
- **미들웨어 동작**: `authType='master'` 설정 후 `next()` 호출. 사실상 no-op guard. 52-auth-model-redesign.md 섹션 3.1 참조.

**명시적 masterAuth (explicit)**

- **전제 조건**: `X-Master-Password` 헤더 필수
- **적용 범위**: Admin API (`/v1/admin/*`) + Kill Switch 복구 (dual-auth 구성 요소)
- **보안 근거**: 파괴적/비가역적 작업에 대한 defense-in-depth. localhost 바인딩만으로는 부족한 고위험 작업.

| 항목 | 값 |
|------|-----|
| 전달 방식 (implicit) | 헤더 불필요 (데몬 실행 = 인증) |
| 전달 방식 (explicit) | `X-Master-Password` 헤더 |
| 검증 (implicit) | 없음 (no-op guard) |
| 검증 (explicit) | Argon2id (argon2 npm, 비동기) |
| brute-force 방지 (explicit) | 5회 연속 실패 -> 30분 lockout |
| 적용 (implicit) | 시스템 관리 전반 (16개 엔드포인트) |
| 적용 (explicit) | `/v1/admin/*` (3개) + KS 복구 dual-auth |

**헤더 예시 (explicit만 해당):**
```
X-Master-Password: my-secure-master-password-2026
```

### 3.4 인증 체계 적용 맵 (v0.5 변경)

> **v0.5 전면 교체:** 52-auth-model-redesign.md 섹션 4의 31 엔드포인트 인증 맵을 반영.

| 엔드포인트 패턴 | 인증 | 미들웨어 |
|---------------|------|----------|
| `GET /health`, `GET /doc`, `GET /v1/nonce` | None | - |
| `POST /v1/owner/connect` | None (localhost 보안) | hostValidation |
| `/v1/wallet/*`, `/v1/transactions/*`, `GET /v1/sessions`, `PUT /v1/sessions/:id/renew` | Session Bearer | sessionAuth |
| `POST /v1/sessions`, `DELETE /v1/sessions/:id`, 에이전트 CRUD, 정책 CRUD, 설정, 조회 등 | masterAuth (implicit) | masterAuth(implicit) |
| `POST /v1/owner/approve/:txId` | Owner Signature | ownerAuth |
| `POST /v1/owner/recover` | Owner Signature + Master Password (dual-auth) | ownerAuth + masterAuth(explicit) |
| `/v1/admin/*` | Master Password (explicit) | masterAuth(explicit) |

> **v0.5 주요 변경 요약:** (1) `POST /v1/sessions`가 ownerAuth에서 masterAuth(implicit)로 전환. (2) `GET /v1/sessions`가 ownerAuth에서 sessionAuth로 전환 (에이전트 자기 세션 조회). (3) `/v1/owner/*` 대부분이 ownerAuth에서 masterAuth(implicit)로 전환. ownerAuth가 유지되는 것은 approve/:txId 1곳 + recover 1곳(dual-auth) = 2곳뿐.

---

## 4. 미들웨어 체인 (Phase 8 확장 반영)

### 4.1 9단계 미들웨어 순서 (v0.5 변경)

Phase 8에서 killSwitchGuard가 추가되어 8단계에서 **9단계**로 확장되었다. v0.5에서 순서 9가 `authRouter` 단일 디스패처로 통합. (v0.5 변경)

| 순서 | 미들웨어 | 역할 | 적용 범위 | 실패 시 |
|------|----------|------|-----------|---------|
| 1 | `requestId` | 요청 ID 부여 (X-Request-ID) | 전체 (`*`) | - |
| 2 | `requestLogger` | 요청/응답 로깅 | 전체 (`*`) | - |
| 3 | `shutdownGuard` | 종료 중 요청 거부 | 전체 (`*`) | 503 |
| 4 | `secureHeaders` | 보안 헤더 설정 | 전체 (`*`) | - |
| 5 | `hostValidation` | Host 헤더 검증 | 전체 (`*`) | 403 |
| 6 | `cors` | CORS 설정 | 전체 (`*`) | 403 |
| 7 | `rateLimiter` | 요청 속도 제한 | 전체 (`*`) | 429 |
| 8 | `killSwitchGuard` | Kill Switch 상태 검사 | 전체 (`*`) | 401 |
| 9 | `authRouter` (v0.5 변경) | 라우트별 인증 디스패치 | 전체 (`*`) | 401/403 |

> **v0.5 순서 9 변경:** v0.2의 `sessionAuth / ownerAuth / masterAuth` 개별 라우트 적용이 `authRouter` 단일 디스패처로 통합되었다. authRouter는 요청 경로(path)와 HTTP 메서드(method)를 기반으로 적절한 인증 미들웨어를 디스패치한다: publicAuth (None) / sessionAuth / masterAuth(implicit) / masterAuth(explicit) / ownerAuth / dualAuth (ownerAuth + masterAuth explicit). 52-auth-model-redesign.md 섹션 7.2 참조.

### 4.2 killSwitchGuard 동작

ACTIVATED 또는 RECOVERING 상태에서 **허용 엔드포인트 목록만 통과**:

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 헬스체크 (모니터링) |
| POST | `/v1/owner/recover` | Kill Switch 복구 |
| GET | `/v1/admin/status` | 데몬 상태 조회 |

그 외 모든 요청은 `401 SYSTEM_LOCKED` 에러로 거부된다.

---

## 5. Public API (인증 불필요)

### 5.1 GET /health

서버 상태를 확인하는 헬스체크 엔드포인트.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/health` |
| **Auth** | None |
| **Tags** | `Public` |
| **operationId** | `healthCheck` |
| **Rate Limit** | 전역 100 req/min |
| **정의 원본** | CORE-06 |

**Response Zod 스키마:**

```typescript
const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']).openapi({
    description: '서버 상태',
    example: 'healthy',
  }),
  version: z.string().openapi({
    description: 'WAIaaS 버전',
    example: '0.2.0',
  }),
  uptime: z.number().openapi({
    description: '서버 가동 시간 (초)',
    example: 3600,
  }),
  timestamp: z.string().datetime().openapi({
    description: '응답 시각 (ISO 8601)',
    example: '2026-02-05T10:31:25.000Z',
  }),
}).openapi('HealthResponse')
```

**응답 예시 (200 OK):**
```json
{
  "status": "healthy",
  "version": "0.2.0",
  "uptime": 3600,
  "timestamp": "2026-02-05T10:31:25.000Z"
}
```

---

### 5.2 GET /doc

OpenAPI 3.0 JSON 스펙 자동 생성 엔드포인트. **debug 모드에서만 활성화** (CORE-06 결정).

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/doc` |
| **Auth** | None |
| **Tags** | `Public` |
| **operationId** | `getOpenApiSpec` |
| **활성 조건** | `config.toml [daemon].log_level = "debug"` |
| **정의 원본** | CORE-06 |

**Response:** OpenAPI 3.0 JSON 문서 (Content-Type: application/json)

---

### 5.3 GET /v1/nonce

SIWS/SIWE 메시지 서명에 사용할 일회성 nonce를 생성한다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/nonce` |
| **Auth** | None |
| **Tags** | `Public` |
| **operationId** | `getNonce` |
| **Rate Limit** | 전역 100 req/min |
| **정의 원본** | SESS-PROTO (섹션 4), TX-PIPE (섹션 5) |

> **참고:** SESS-PROTO/TX-PIPE에서는 `/v1/auth/nonce`로 정의되었으나, 본 통합 스펙에서 `/v1/nonce`로 경로를 단순화한다. 인증이 불필요한 공개 엔드포인트이므로 `/v1/auth/` 접두사가 불필요.

**Response Zod 스키마:**

```typescript
const NonceResponseSchema = z.object({
  nonce: z.string().openapi({
    description: 'SIWS/SIWE 메시지 서명에 사용할 일회성 nonce (32 hex chars)',
    example: 'a1b2c3d4e5f67890a1b2c3d4e5f67890',
  }),
  expiresAt: z.string().datetime().openapi({
    description: 'nonce 만료 시각 (ISO 8601, TTL 5분)',
    example: '2026-02-05T10:36:25.000Z',
  }),
}).openapi('NonceResponse')
```

**응답 예시 (200 OK):**
```json
{
  "nonce": "a1b2c3d4e5f67890a1b2c3d4e5f67890",
  "expiresAt": "2026-02-05T10:36:25.000Z"
}
```

---

## 6. Session API (Agent 인증 -- bearerAuth)

에이전트 세션 토큰으로 인증하는 지갑/거래 엔드포인트.

### 6.1 GET /v1/wallet/balance

에이전트 지갑 잔액을 조회한다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/wallet/balance` |
| **Auth** | bearerAuth (Session) |
| **Tags** | `Wallet` |
| **operationId** | `getBalance` |
| **Rate Limit** | 세션 300 req/min |
| **정의 원본** | TX-PIPE (섹션 8.1) |

**Response Zod 스키마:**

```typescript
const BalanceResponseSchema = z.object({
  balance: z.string().openapi({
    description: '잔액 (최소 단위: lamports/wei)',
    example: '1500000000',
  }),
  decimals: z.number().int().openapi({
    description: '소수점 자릿수 (SOL=9, ETH=18)',
    example: 9,
  }),
  symbol: z.string().openapi({
    description: '토큰 심볼',
    example: 'SOL',
  }),
  formatted: z.string().openapi({
    description: '사람이 읽기 좋은 포맷',
    example: '1.5 SOL',
  }),
  chain: z.string().openapi({
    description: '체인 식별자',
    example: 'solana',
  }),
  network: z.string().openapi({
    description: '네트워크 식별자',
    example: 'mainnet-beta',
  }),
}).openapi('BalanceResponse')
```

> **금액 변환 규칙:** `formatted` 필드의 bigint -> 표시 문자열 변환 공식은 27-chain-adapter-interface.md 구현 노트 참조.

**응답 예시 (200 OK):**
```json
{
  "balance": "1500000000",
  "decimals": 9,
  "symbol": "SOL",
  "formatted": "1.5 SOL",
  "chain": "solana",
  "network": "mainnet-beta"
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `INVALID_TOKEN` | 401 | false | 세션 토큰 검증 실패 |
| `ADAPTER_NOT_AVAILABLE` | 503 | true | 체인 어댑터 미초기화 |
| `CHAIN_ERROR` | 502 | true | RPC 노드 연결/응답 오류 |

---

### 6.2 GET /v1/wallet/address

에이전트 지갑 공개키(주소)를 조회한다. 온체인 조회 없이 DB에서 반환.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/wallet/address` |
| **Auth** | bearerAuth (Session) |
| **Tags** | `Wallet` |
| **operationId** | `getAddress` |
| **Rate Limit** | 세션 300 req/min |
| **정의 원본** | TX-PIPE (섹션 8.2) |

**Response Zod 스키마:**

```typescript
const AddressResponseSchema = z.object({
  address: z.string().openapi({
    description: '에이전트 지갑 공개키',
    example: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  }),
  chain: z.string().openapi({
    description: '체인 식별자',
    example: 'solana',
  }),
  network: z.string().openapi({
    description: '네트워크 식별자',
    example: 'mainnet-beta',
  }),
  encoding: z.enum(['base58', 'hex']).openapi({
    description: '주소 인코딩 방식 (Solana: base58, EVM: hex)',
    example: 'base58',
  }),
}).openapi('AddressResponse')
```

**응답 예시 (200 OK):**
```json
{
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "chain": "solana",
  "network": "mainnet-beta",
  "encoding": "base58"
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `INVALID_TOKEN` | 401 | false | 세션 토큰 검증 실패 |

#### 사용 사례: Agent 지갑에 자금 충전

WAIaaS는 Owner의 Private Key에 접근하지 않으므로,
Agent 지갑으로의 자금 전송은 Owner가 외부 지갑에서 직접 수행한다.

**절차:**
1. Agent 지갑 주소 조회: `GET /v1/wallet/address`
2. Owner 지갑(Phantom, Ledger 등)에서 해당 주소로 SOL/ETH 전송
3. 잔액 확인: `GET /v1/wallet/balance`

**v0.1 대비 변경:**

| v0.1 (Squads Vault) | v0.2 (Self-Hosted) |
|---------------------|-------------------|
| Owner -> Vault PDA -> Agent | Owner -> Agent 직접 전송 |
| 다층 예산 관리 | 정책 엔진(`policies` 테이블)으로 대체 |

> **참고**: WAIaaS API에는 "자금 입금" 전용 엔드포인트가 없다.
> Owner가 외부 지갑에서 Agent 주소로 직접 전송하는 것이 유일한 충전 경로이다.
> Agent 지갑은 수신만 허용하며, 발신은 정책 엔진의 승인을 거쳐야 한다.

---

### 6.3 POST /v1/transactions/send

거래를 전송한다. INSTANT 티어는 CONFIRMED까지 동기 대기 (최대 30초), DELAY/APPROVAL 티어는 QUEUED 즉시 반환 (202 Accepted).

| 항목 | 값 |
|------|-----|
| **Method** | `POST` |
| **Path** | `/v1/transactions/send` |
| **Auth** | bearerAuth (Session) |
| **Tags** | `Transaction` |
| **operationId** | `sendTransaction` |
| **Rate Limit** | 거래 10 req/min |
| **정의 원본** | TX-PIPE (섹션 7.1) |

**Request Zod 스키마:**

```typescript
const TransferRequestSchema = z.object({
  to: z.string().min(1).openapi({
    description: '수신자 주소 (Solana: base58, EVM: 0x hex)',
    example: 'So11111111111111111111111111111112',
  }),
  amount: z.string().min(1).openapi({
    description: '전송 금액 (최소 단위: lamports/wei, 문자열)',
    example: '1000000000',
  }),
  type: z.enum(['TRANSFER', 'TOKEN_TRANSFER']).optional().default('TRANSFER').openapi({
    description: '거래 유형 (TRANSFER: 네이티브 토큰, TOKEN_TRANSFER: SPL/ERC20)',
    example: 'TRANSFER',
  }),
  tokenMint: z.string().optional().openapi({
    description: 'SPL/ERC20 토큰 주소 (type=TOKEN_TRANSFER 시 필수)',
  }),
  memo: z.string().max(200).optional().openapi({
    description: '최대 200자. Solana Memo Program 256 bytes 이내를 보장한다. UTF-8 멀티바이트 문자 사용 시에도 200자 제한으로 256 bytes를 초과하지 않는다. 체인 어댑터에서 바이트 길이 이중 검증 수행.',
    example: 'Payment for services',
  }),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium').openapi({
    description: '우선순위 (수수료 조정: low=최소, medium=중간, high=최대)',
    example: 'medium',
  }),
}).openapi('TransferRequest')
```

**Response Zod 스키마:**

```typescript
const TransactionStatusEnum = z.enum([
  'PENDING', 'QUEUED', 'EXECUTING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED',
])
const TierEnum = z.enum(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'])
```

#### 클라이언트 상태 표시 가이드

TransactionStatusEnum의 8개 상태는 DB의 SSoT(Single Source of Truth)이다.
클라이언트 UI에서는 상태와 tier를 조합하여 사용자 친화적 메시지로 표시한다.

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
> Telegram Bot, Tauri Desktop 모두 이 매핑을 따른다.

#### 클라이언트 에이전트 상태 표시 가이드

AgentStatus의 5개 상태는 DB의 SSoT이다. `KILL_SWITCH`는 DB 상태가 아니며, 클라이언트에서 `status`와 `suspensionReason`을 조합하여 표시한다.

| DB status | suspension_reason | 클라이언트 표시 |
|-----------|-------------------|----------------|
| `CREATING` | - | "생성 중" |
| `ACTIVE` | - | "활성" |
| `SUSPENDED` | `kill_switch` | "킬 스위치 발동" |
| `SUSPENDED` | `policy_violation` | "정책 위반으로 정지" |
| `SUSPENDED` | `manual` | "수동 정지" |
| `SUSPENDED` | `auto_stop` | "자동 정지" |
| `SUSPENDED` | (기타) | "정지됨" |
| `TERMINATING` | - | "종료 중" |
| `TERMINATED` | - | "종료됨" |

> **참고**: Enum 통합 대응표(45-enum-unified-mapping.md)가 모든 Enum의 SSoT이다.

```typescript
const TransactionResponseSchema = z.object({
  transactionId: z.string().uuid().openapi({
    description: '내부 트랜잭션 ID (UUID v7)',
    example: '019502c0-1a2b-3c4d-5e6f-abcdef012345',
  }),
  status: TransactionStatusEnum.openapi({
    description: '트랜잭션 상태',
    example: 'CONFIRMED',
  }),
  tier: TierEnum.optional().openapi({
    description: '보안 티어',
    example: 'INSTANT',
  }),
  txHash: z.string().optional().openapi({
    description: '온체인 트랜잭션 해시 (제출 후)',
    example: '4vJ9JU1bJJE96FW...',
  }),
  estimatedFee: z.string().optional().openapi({
    description: '추정 수수료 (최소 단위)',
    example: '5000',
  }),
  createdAt: z.string().datetime().openapi({
    description: '요청 시각 (ISO 8601)',
    example: '2026-02-05T10:31:25.000Z',
  }),
}).openapi('TransactionResponse')
```

**응답 분기:**
- **200 OK** (INSTANT 티어): `status: 'CONFIRMED'`, `txHash` 포함
- **202 Accepted** (DELAY/APPROVAL 티어): `status: 'QUEUED'`, `txHash` 없음

**응답 예시 (200 OK -- INSTANT):**
```json
{
  "transactionId": "019502c0-1a2b-3c4d-5e6f-abcdef012345",
  "status": "CONFIRMED",
  "tier": "INSTANT",
  "txHash": "4vJ9JU1bJJE96FWSEyR7Y3E9x7vfn7tYLCsQZdKCbKhazFgVgGXHiryMQXa4PRSHCfND9rPECNhzzJGvGHsNJsN",
  "estimatedFee": "5000",
  "createdAt": "2026-02-05T10:31:25.000Z"
}
```

**응답 예시 (202 Accepted -- DELAY/APPROVAL):**
```json
{
  "transactionId": "019502c0-1a2b-3c4d-5e6f-abcdef012345",
  "status": "QUEUED",
  "tier": "APPROVAL",
  "createdAt": "2026-02-05T10:31:25.000Z"
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `INSUFFICIENT_BALANCE` | 400 | false | 잔액 부족 |
| `INVALID_ADDRESS` | 400 | false | 유효하지 않은 수신 주소 |
| `SESSION_LIMIT_EXCEEDED` | 403 | false | 세션 제약 초과 (단건/누적/횟수/주소) |
| `POLICY_DENIED` | 403 | false | 정책 엔진에 의해 거부 |
| `SIMULATION_FAILED` | 422 | false | 온체인 시뮬레이션 실패 |
| `ADAPTER_NOT_AVAILABLE` | 503 | true | 체인 어댑터 미초기화 |
| `KEYSTORE_LOCKED` | 503 | true | 키스토어 잠김 |

---

### 6.4 GET /v1/transactions

거래 이력을 커서 기반 페이지네이션으로 조회한다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/transactions` |
| **Auth** | bearerAuth (Session) |
| **Tags** | `Transaction` |
| **operationId** | `listTransactions` |
| **Rate Limit** | 세션 300 req/min |
| **정의 원본** | TX-PIPE (섹션 7.2) |

**Query Parameters Zod 스키마:**

```typescript
const TransactionListQuerySchema = z.object({
  status: TransactionStatusEnum.optional().openapi({
    description: '상태 필터 (미설정 시 전체)',
  }),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20).openapi({
    description: '페이지 크기 (1~100, 기본 20)',
    example: 20,
  }),
  cursor: z.string().optional().openapi({
    description: '커서 (이전 응답의 nextCursor, UUID v7 시간순)',
  }),
  order: z.enum(['asc', 'desc']).optional().default('desc').openapi({
    description: '정렬 순서 (기본: desc 최신순)',
    example: 'desc',
  }),
}).openapi('TransactionListQuery')
```

**Response Zod 스키마:**

```typescript
const TransactionSummarySchema = z.object({
  id: z.string().uuid().openapi({ description: '트랜잭션 ID' }),
  type: z.string().openapi({ description: '거래 유형' }),
  status: TransactionStatusEnum.openapi({ description: '상태' }),
  tier: TierEnum.optional().openapi({ description: '보안 티어' }),
  amount: z.string().optional().openapi({ description: '금액 (최소 단위)' }),
  toAddress: z.string().optional().openapi({ description: '수신자 주소' }),
  txHash: z.string().optional().openapi({ description: '온체인 해시' }),
  createdAt: z.string().datetime().openapi({ description: '요청 시각' }),
  executedAt: z.string().datetime().optional().openapi({ description: '완료 시각' }),
  error: z.string().optional().openapi({ description: '에러 메시지 (실패 시)' }),
}).openapi('TransactionSummary')

const TransactionListResponseSchema = z.object({
  transactions: z.array(TransactionSummarySchema),
  nextCursor: z.string().optional().openapi({
    description: '다음 페이지 커서 (마지막 페이지이면 미포함)',
  }),
}).openapi('TransactionListResponse')
```

**응답 예시 (200 OK):**
```json
{
  "transactions": [
    {
      "id": "019502c0-1a2b-3c4d-5e6f-abcdef012345",
      "type": "TRANSFER",
      "status": "CONFIRMED",
      "tier": "INSTANT",
      "amount": "1000000000",
      "toAddress": "So11111111111111111111111111111112",
      "txHash": "4vJ9JU1bJJE96FW...",
      "createdAt": "2026-02-05T10:31:25.000Z",
      "executedAt": "2026-02-05T10:31:28.000Z"
    }
  ],
  "nextCursor": "019502bf-9a8b-7c6d-5e4f-abcdef012345"
}
```

---

### 6.5 GET /v1/transactions/pending

DELAY/APPROVAL 티어로 대기 중인 거래를 조회한다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/transactions/pending` |
| **Auth** | bearerAuth (Session) |
| **Tags** | `Transaction` |
| **operationId** | `listPendingTransactions` |
| **Rate Limit** | 세션 300 req/min |
| **정의 원본** | TX-PIPE (섹션 7.3) |

**Response Zod 스키마:**

```typescript
const PendingTransactionSummarySchema = z.object({
  id: z.string().uuid().openapi({ description: '트랜잭션 ID' }),
  type: z.string().openapi({ description: '거래 유형' }),
  amount: z.string().optional().openapi({ description: '금액 (최소 단위)' }),
  toAddress: z.string().optional().openapi({ description: '수신자 주소' }),
  tier: TierEnum.openapi({ description: '보안 티어 (DELAY 또는 APPROVAL)' }),
  queuedAt: z.string().datetime().openapi({ description: '큐 진입 시각' }),
  expiresAt: z.string().datetime().optional().openapi({ description: '승인 기한 (APPROVAL 티어)' }),
  status: z.literal('QUEUED').openapi({ description: '상태 (항상 QUEUED)' }),
}).openapi('PendingTransactionSummary')

const PendingTransactionListResponseSchema = z.object({
  transactions: z.array(PendingTransactionSummarySchema),
}).openapi('PendingTransactionListResponse')
```

**응답 예시 (200 OK):**
```json
{
  "transactions": [
    {
      "id": "019502c0-1a2b-3c4d-5e6f-abcdef012345",
      "type": "TRANSFER",
      "amount": "50000000000",
      "toAddress": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      "tier": "APPROVAL",
      "queuedAt": "2026-02-05T10:31:25.000Z",
      "expiresAt": "2026-02-05T11:31:25.000Z",
      "status": "QUEUED"
    }
  ]
}
```

---

### 6.6 PUT /v1/sessions/:id/renew (세션 갱신) [Phase 20 추가]

에이전트가 자신의 세션을 갱신(토큰 회전)한다. 낙관적 갱신 패턴: 에이전트가 sessionAuth만으로 갱신하고, Owner가 사후에 거부할 수 있다.

| 항목 | 값 |
|------|-----|
| **Method** | `PUT` |
| **Path** | `/v1/sessions/:id/renew` |
| **Auth** | bearerAuth (Session) -- JWT의 sid == :id 일치 필수 |
| **Tags** | `Session` |
| **operationId** | `renewSession` |
| **Rate Limit** | 세션 300 req/min |
| **정의 원본** | SESS-RENEW (53-session-renewal-protocol.md 섹션 3) |

**Path Parameters:**

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `id` | UUID v7 | 갱신할 세션 ID (JWT의 sid claim과 일치해야 함) |

**요청 바디:** 없음 (갱신 단위 고정, Guard 5)

**응답 (200 OK):**

| 필드 | 타입 | 설명 |
|------|------|------|
| `sessionId` | string (UUID v7) | 세션 ID (변경 없음) |
| `token` | string | 새 세션 토큰 (`wai_sess_` + 새 JWT) |
| `expiresAt` | string (ISO 8601) | 새 만료 시각 = now + expiresIn |
| `renewalCount` | number | 누적 갱신 횟수 (갱신 후 값) |
| `maxRenewals` | number | 최대 갱신 횟수 |
| `absoluteExpiresAt` | string (ISO 8601) | 절대 만료 시각 (세션 총 수명 상한) |

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `RENEWAL_LIMIT_REACHED` | 403 | false | 최대 갱신 횟수 초과 |
| `SESSION_ABSOLUTE_LIFETIME_EXCEEDED` | 403 | false | 절대 수명 초과 |
| `RENEWAL_TOO_EARLY` | 403 | true | 50% 미경과 |
| `SESSION_RENEWAL_MISMATCH` | 403 | false | JWT sid != :id |
| `SESSION_NOT_FOUND` | 404 | false | 세션 없음 |

> **상세 스펙:** 5종 안전 장치, 토큰 회전 메커니즘, Owner 사후 거부 플로우 등 전체 프로토콜은 53-session-renewal-protocol.md 참조.

---

## 7. Session Management API (v0.5 변경: masterAuth(implicit))

> **(v0.5 변경)** 세션 관리가 ownerAuth에서 masterAuth(implicit)으로 변경되었다. 데몬 구동 시 마스터 패스워드 인증이 완료되므로 localhost API 호출에 추가 인증이 불필요하다. CLI `waiaas session create/list` 커맨드로 직접 관리 가능. 상세: **52-auth-model-redesign.md 섹션 4.2** 참조.

세션의 생성, 조회, 폐기를 관리하는 엔드포인트.

### 7.1 POST /v1/sessions

> **(v0.5 변경)** ownerAuth(SIWS/SIWE 서명) -> masterAuth(implicit). 데몬 구동 = 인증 완료. CLI `waiaas session create --agent <name>`으로 세션 토큰 발급. 요청 바디의 signature/message/ownerAddress 필드는 v0.5에서 불필요 (하위 호환을 위해 스키마 유지, 서버가 무시).

에이전트 세션을 생성한다. 세션 토큰은 이 응답에서만 반환.

| 항목 | 값 |
|------|-----|
| **Method** | `POST` |
| **Path** | `/v1/sessions` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Session` |
| **operationId** | `createSession` |
| **Rate Limit** | 전역 100 req/min |
| **참고** | sessionAuth 미들웨어 **제외** (SESS-PROTO 결정) |
| **정의 원본** | SESS-PROTO (섹션 3), TX-PIPE (섹션 6.1) |

**Request Zod 스키마:**

```typescript
const SessionCreateSchema = z.object({
  agentId: z.string().uuid().openapi({
    description: '대상 에이전트 ID (UUID v7)',
    example: '01950288-1a2b-3c4d-5e6f-abcdef012345',
  }),
  chain: z.enum(['solana', 'ethereum']).openapi({
    description: '체인 식별자',
    example: 'solana',
  }),
  ownerAddress: z.string().openapi({
    description: 'Owner 지갑 주소 (Solana: base58, EVM: 0x hex)',
    example: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  }),
  signature: z.string().openapi({
    description: 'SIWS/SIWE 메시지 서명 (Solana: base58, EVM: hex)',
  }),
  message: z.string().openapi({
    description: '서명된 메시지 원문 (EIP-4361 포맷)',
  }),
  expiresIn: z.number().int().min(300).max(604800).optional().default(86400).openapi({
    description: '세션 만료 시간 (초). 최소 300(5분) ~ 최대 604800(7일). 기본 86400(24시간)',
    example: 86400,
  }),
  constraints: z.object({
    maxAmountPerTx: z.string().optional().openapi({
      description: '단건 거래 한도 (최소 단위)',
      example: '10000000000',
    }),
    maxTotalAmount: z.string().optional().openapi({
      description: '누적 거래 한도 (최소 단위)',
      example: '100000000000',
    }),
    maxTransactions: z.number().int().optional().openapi({
      description: '최대 거래 횟수',
      example: 100,
    }),
    allowedOperations: z.array(z.string()).optional().openapi({
      description: '허용 작업 목록',
      example: ['TRANSFER'],
    }),
    allowedDestinations: z.array(z.string()).optional().openapi({
      description: '허용 수신 주소 목록',
    }),
    expiresIn: z.number().int().min(300).max(604800).optional().openapi({
      description: '세션 만료 시간 (초)',
    }),
  }).optional().default({}).openapi({
    description: '세션 제약 조건 (미설정 시 기본값 적용)',
  }),
}).openapi('SessionCreate')
```

**Response Zod 스키마:**

```typescript
const SessionCreateResponseSchema = z.object({
  sessionId: z.string().uuid().openapi({
    description: '생성된 세션 ID (UUID v7)',
    example: '019502a8-7b3c-7d4e-8f5a-1234567890ab',
  }),
  token: z.string().openapi({
    description: '세션 토큰 (wai_sess_...). 이 응답에서만 반환.',
    example: 'wai_sess_eyJhbGciOiJIUzI1NiIs...',
  }),
  expiresAt: z.string().datetime().openapi({
    description: '세션 만료 시각 (ISO 8601)',
    example: '2026-02-06T10:31:25.000Z',
  }),
  constraints: z.object({}).passthrough().openapi({
    description: '적용된 세션 제약 조건',
  }),
}).openapi('SessionCreateResponse')
```

**응답 예시 (201 Created):**
```json
{
  "sessionId": "019502a8-7b3c-7d4e-8f5a-1234567890ab",
  "token": "wai_sess_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2026-02-06T10:31:25.000Z",
  "constraints": {
    "maxAmountPerTx": "10000000000",
    "maxTotalAmount": "100000000000",
    "maxTransactions": 100,
    "allowedOperations": ["TRANSFER"],
    "allowedDestinations": null
  }
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `INVALID_NONCE` | 401 | false | nonce 무효/만료/사용됨 |
| `INVALID_SIGNATURE` | 401 | false | SIWS/SIWE 서명 검증 실패 |
| `AGENT_NOT_FOUND` | 404 | false | 에이전트 없음 또는 소유권 불일치 |
| `AGENT_SUSPENDED` | 409 | false | 에이전트 정지 상태 |

---

### 7.2 GET /v1/sessions

활성 세션 목록을 조회한다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/sessions` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Session` |
| **operationId** | `listSessions` |
| **Rate Limit** | 전역 100 req/min |
| **정의 원본** | TX-PIPE (섹션 6.2) |

**Query Parameters Zod 스키마:**

```typescript
const SessionListQuerySchema = z.object({
  agentId: z.string().uuid().optional().openapi({
    description: '에이전트 ID로 필터',
  }),
  status: z.enum(['active', 'all']).optional().default('active').openapi({
    description: '세션 상태 필터 (active: 유효만, all: 폐기/만료 포함)',
    example: 'active',
  }),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20).openapi({
    description: '페이지 크기 (1~100, 기본 20)',
  }),
  cursor: z.string().optional().openapi({
    description: '커서 기반 페이지네이션',
  }),
}).openapi('SessionListQuery')
```

**Response Zod 스키마:**

```typescript
const SessionSummarySchema = z.object({
  id: z.string().uuid().openapi({ description: '세션 ID' }),
  agentId: z.string().uuid().openapi({ description: '에이전트 ID' }),
  agentName: z.string().openapi({ description: '에이전트 이름' }),
  constraints: z.object({}).passthrough().openapi({ description: '세션 제약 조건' }),
  usageStats: z.object({
    totalTx: z.number().int(),
    totalAmount: z.string(),
    lastTxAt: z.string().datetime().nullable(),
  }).openapi({ description: '사용 통계' }),
  expiresAt: z.string().datetime().openapi({ description: '만료 시각' }),
  createdAt: z.string().datetime().openapi({ description: '생성 시각' }),
  revokedAt: z.string().datetime().optional().openapi({ description: '폐기 시각' }),
}).openapi('SessionSummary')

const SessionListResponseSchema = z.object({
  sessions: z.array(SessionSummarySchema),
  nextCursor: z.string().optional().openapi({
    description: '다음 페이지 커서',
  }),
}).openapi('SessionListResponse')
```

**응답 예시 (200 OK):**
```json
{
  "sessions": [
    {
      "id": "019502a8-7b3c-7d4e-8f5a-1234567890ab",
      "agentId": "01950288-1a2b-3c4d-5e6f-abcdef012345",
      "agentName": "trading-agent-01",
      "constraints": {
        "maxAmountPerTx": "10000000000",
        "maxTransactions": 100
      },
      "usageStats": {
        "totalTx": 5,
        "totalAmount": "2500000000",
        "lastTxAt": "2026-02-05T10:30:00.000Z"
      },
      "expiresAt": "2026-02-06T10:31:25.000Z",
      "createdAt": "2026-02-05T10:31:25.000Z"
    }
  ],
  "nextCursor": null
}
```

---

### 7.3 DELETE /v1/sessions/:id

세션을 즉시 무효화(폐기)한다. **(v0.5 추가)** 세션 갱신 거부 용도로도 재활용 (별도 엔드포인트 불필요, 53-session-renewal-protocol.md 참조).

| 항목 | 값 |
|------|-----|
| **Method** | `DELETE` |
| **Path** | `/v1/sessions/:id` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Session` |
| **operationId** | `revokeSession` |
| **Rate Limit** | 전역 100 req/min |
| **정의 원본** | TX-PIPE (섹션 6.3) |

**Path Parameters:**

```typescript
const SessionIdParamSchema = z.object({
  id: z.string().uuid().openapi({
    description: '폐기할 세션 ID',
    param: { in: 'path', name: 'id' },
  }),
})
```

**Response Zod 스키마:**

```typescript
const SessionRevokeResponseSchema = z.object({
  revoked: z.literal(true),
  sessionId: z.string().uuid(),
  revokedAt: z.string().datetime().openapi({
    description: '폐기 시각 (ISO 8601)',
    example: '2026-02-05T10:30:00.000Z',
  }),
}).openapi('SessionRevokeResponse')
```

**응답 예시 (200 OK):**
```json
{
  "revoked": true,
  "sessionId": "019502a8-7b3c-7d4e-8f5a-1234567890ab",
  "revokedAt": "2026-02-05T10:30:00.000Z"
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `SESSION_NOT_FOUND` | 404 | false | 세션 없음 |
| `SESSION_REVOKED` | 409 | false | 이미 폐기된 세션 |

---

## 8. Owner API (v0.5 변경: 대부분 masterAuth(implicit), ownerAuth 2곳만 유지)

> **(v0.5 변경)** Owner API의 대부분이 ownerAuth에서 masterAuth(implicit)으로 변경되었다. ownerAuth(SIWS/SIWE 서명)는 보안상 반드시 Owner 본인 확인이 필요한 **2곳에만 한정**: `POST /v1/owner/approve/:txId` (거래 승인), `POST /v1/owner/recover` (Kill Switch 복구). 나머지는 데몬 구동 시 마스터 패스워드 인증으로 충분. 상세: **52-auth-model-redesign.md 섹션 4.2** 참조.

Owner가 에이전트, 거래, 정책, 시스템을 관리하는 엔드포인트. Phase 8에서 정의된 기존 10개 + Phase 9에서 추가하는 7개 = 총 **17개** 엔드포인트.

### 8.1 POST /v1/owner/connect (Owner 지갑 등록)

Owner 지갑을 WAIaaS 데몬에 최초 등록한다.

| 항목 | 값 |
|------|-----|
| **Method** | `POST` |
| **Path** | `/v1/owner/connect` |
| **Auth** | None (localhost 보안으로 보호) |
| **Tags** | `Owner` |
| **operationId** | `connectOwner` |
| **정의 원본** | OWNR-CONN (섹션 3.3) |

**Request Zod 스키마:**

```typescript
const OwnerConnectRequestSchema = z.object({
  address: z.string().openapi({
    description: 'Owner 지갑 공개키/주소 (Solana: base58, EVM: 0x hex)',
    example: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  }),
  chain: z.enum(['solana', 'ethereum']).openapi({
    description: '체인 식별자',
    example: 'solana',
  }),
  wcSessionTopic: z.string().optional().openapi({
    description: 'WalletConnect 세션 토픽 (Tauri/CLI 연결 시)',
  }),
}).openapi('OwnerConnectRequest')
```

**Response Zod 스키마:**

```typescript
const OwnerConnectResponseSchema = z.object({
  ownerId: z.string().uuid().openapi({ description: 'Owner 레코드 ID' }),
  address: z.string().openapi({ description: '등록된 지갑 주소' }),
  chain: z.string().openapi({ description: '체인' }),
  connectedAt: z.string().datetime().openapi({ description: '연결 시각' }),
}).openapi('OwnerConnectResponse')
```

**응답 예시 (201 Created):**
```json
{
  "ownerId": "019502d0-1a2b-3c4d-5e6f-abcdef012345",
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "chain": "solana",
  "connectedAt": "2026-02-05T10:30:00.000Z"
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `OWNER_ALREADY_CONNECTED` | 409 | false | 이미 Owner가 등록됨. 해제 후 재연결 필요 |

---

### 8.2 DELETE /v1/owner/disconnect (Owner 지갑 해제)

Owner 지갑 연결을 해제한다.

| 항목 | 값 |
|------|-----|
| **Method** | `DELETE` |
| **Path** | `/v1/owner/disconnect` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `disconnectOwner` |
| **정의 원본** | OWNR-CONN (섹션 6) |

**Response Zod 스키마:**

```typescript
const OwnerDisconnectResponseSchema = z.object({
  disconnected: z.literal(true),
  disconnectedAt: z.string().datetime(),
}).openapi('OwnerDisconnectResponse')
```

**응답 예시 (200 OK):**
```json
{
  "disconnected": true,
  "disconnectedAt": "2026-02-05T10:30:00.000Z"
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `OWNER_NOT_CONNECTED` | 404 | false | Owner가 등록되지 않음 |

---

### 8.3 POST /v1/owner/approve/:txId (거래 승인)

APPROVAL 티어의 대기 중인 거래를 Owner가 승인한다.

| 항목 | 값 |
|------|-----|
| **Method** | `POST` |
| **Path** | `/v1/owner/approve/:txId` |
| **Auth** | ownerAuth (action=`approve_tx`) **(v0.5 유지: 거래 승인은 반드시 ownerAuth)** |
| **Tags** | `Owner` |
| **operationId** | `approveTransaction` |
| **정의 원본** | OWNR-CONN (섹션 6.2) |

**Path Parameters:**

```typescript
const TxIdParamSchema = z.object({
  txId: z.string().uuid().openapi({ description: '거래 UUID v7' }),
})
```

**Response Zod 스키마:**

```typescript
const ApproveResponseSchema = z.object({
  transactionId: z.string().uuid(),
  status: z.literal('EXECUTING'),
  approvedAt: z.string().datetime(),
  approvedBy: z.string().openapi({ description: 'Owner 지갑 주소' }),
}).openapi('ApproveResponse')
```

**응답 예시 (200 OK):**
```json
{
  "transactionId": "019502c0-1a2b-3c4d-5e6f-abcdef012345",
  "status": "EXECUTING",
  "approvedAt": "2026-02-05T10:35:00.000Z",
  "approvedBy": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `TX_NOT_FOUND` | 404 | false | 거래 없음 |
| `TX_ALREADY_PROCESSED` | 409 | false | 거래 상태가 QUEUED가 아님 |
| `TX_EXPIRED` | 410 | false | 승인 대기 시간 만료 |

---

### 8.4 POST /v1/owner/reject/:txId (거래 거절)

DELAY 또는 APPROVAL 티어의 대기 중인 거래를 Owner가 거절한다.

| 항목 | 값 |
|------|-----|
| **Method** | `POST` |
| **Path** | `/v1/owner/reject/:txId` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `rejectTransaction` |
| **정의 원본** | OWNR-CONN (섹션 6.3) |

**Request Zod 스키마 (선택):**

```typescript
const RejectRequestSchema = z.object({
  reason: z.string().max(500).optional().openapi({ description: '거절 사유' }),
}).optional()
```

**Response Zod 스키마:**

```typescript
const RejectResponseSchema = z.object({
  transactionId: z.string().uuid(),
  status: z.literal('CANCELLED'),
  rejectedAt: z.string().datetime(),
  rejectedBy: z.string(),
  reason: z.string().optional(),
}).openapi('RejectResponse')
```

**응답 예시 (200 OK):**
```json
{
  "transactionId": "019502c0-1a2b-3c4d-5e6f-abcdef012345",
  "status": "CANCELLED",
  "rejectedAt": "2026-02-05T10:35:00.000Z",
  "rejectedBy": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "reason": "Suspicious recipient address"
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `TX_NOT_FOUND` | 404 | false | 거래 없음 |
| `TX_ALREADY_PROCESSED` | 409 | false | 거래 상태가 QUEUED/PENDING이 아님 |

---

### 8.5 POST /v1/owner/kill-switch (Kill Switch 발동)

모든 세션 폐기, 대기 거래 취소, 에이전트 정지를 일괄 수행한다.

| 항목 | 값 |
|------|-----|
| **Method** | `POST` |
| **Path** | `/v1/owner/kill-switch` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit). 발동은 masterAuth)** |
| **Tags** | `Owner` |
| **operationId** | `activateKillSwitch` |
| **정의 원본** | KILL-AUTO-EVM (섹션 1.2) |

**Request Zod 스키마:**

```typescript
const KillSwitchRequestSchema = z.object({
  reason: z.string().min(1).max(500).openapi({
    description: 'Kill Switch 발동 사유',
    example: '비정상 거래 패턴 감지',
  }),
}).openapi('KillSwitchRequest')
```

**Response Zod 스키마:**

```typescript
const KillSwitchResponseSchema = z.object({
  activated: z.literal(true),
  timestamp: z.string().datetime(),
  sessionsRevoked: z.number().int().nonnegative().openapi({ description: '폐기된 세션 수' }),
  transactionsCancelled: z.number().int().nonnegative().openapi({ description: '취소된 거래 수' }),
  agentsSuspended: z.number().int().nonnegative().openapi({ description: '정지된 에이전트 수' }),
}).openapi('KillSwitchResponse')
```

**응답 예시 (200 OK):**
```json
{
  "activated": true,
  "timestamp": "2026-02-05T10:35:00.000Z",
  "sessionsRevoked": 3,
  "transactionsCancelled": 1,
  "agentsSuspended": 2
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `KILL_SWITCH_ACTIVE` | 409 | false | Kill Switch 이미 활성 |

---

### 8.6 POST /v1/owner/recover (Kill Switch 복구)

Kill Switch를 해제하고 시스템을 정상 상태로 복구한다. **이중 인증** 필요 (Owner 서명 + 마스터 패스워드).

| 항목 | 값 |
|------|-----|
| **Method** | `POST` |
| **Path** | `/v1/owner/recover` |
| **Auth** | ownerAuth (action=`recover`) + masterAuth(explicit) **(v0.5 유지: 복구는 이중 인증 필수)** |
| **Tags** | `Owner` |
| **operationId** | `recoverFromKillSwitch` |
| **정의 원본** | KILL-AUTO-EVM (섹션 4) |

**Request Zod 스키마:**

```typescript
const RecoverRequestSchema = z.object({
  masterPassword: z.string().min(8).openapi({
    description: '키스토어 마스터 패스워드',
  }),
}).openapi('RecoverRequest')
```

**Response Zod 스키마:**

```typescript
const RecoverResponseSchema = z.object({
  recovered: z.literal(true),
  timestamp: z.string().datetime(),
  agentsReactivated: z.number().int().nonnegative().openapi({
    description: 'ACTIVE로 복원된 에이전트 수 (Kill Switch로 SUSPENDED된 것만, suspension_reason=kill_switch)',
  }),
}).openapi('RecoverResponse')
```

**응답 예시 (200 OK):**
```json
{
  "recovered": true,
  "timestamp": "2026-02-05T11:05:00.000Z",
  "agentsReactivated": 2
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `KILL_SWITCH_NOT_ACTIVE` | 409 | false | Kill Switch가 활성 상태가 아님 |
| `INVALID_MASTER_PASSWORD` | 401 | false | 마스터 패스워드 불일치 |
| `MASTER_PASSWORD_LOCKED` | 429 | false | 5회 실패로 30분 lockout |

---

### 8.7 GET /v1/owner/pending-approvals (승인 대기 목록)

APPROVAL 또는 DELAY 티어에서 QUEUED 상태인 거래 목록을 조회한다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/owner/pending-approvals` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `listPendingApprovals` |
| **정의 원본** | OWNR-CONN (섹션 6.5) |

**Query Parameters:**

```typescript
const PendingApprovalsQuerySchema = z.object({
  agentId: z.string().uuid().optional().openapi({ description: '에이전트 필터' }),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().uuid().optional().openapi({ description: '페이지네이션 커서' }),
}).openapi('PendingApprovalsQuery')
```

**Response Zod 스키마:**

```typescript
const PendingApprovalSummarySchema = z.object({
  txId: z.string().uuid(),
  agentId: z.string().uuid(),
  agentName: z.string(),
  type: z.string().openapi({ description: '거래 유형' }),
  amount: z.string().openapi({ description: '금액 (최소 단위)' }),
  toAddress: z.string(),
  chain: z.string(),
  tier: z.enum(['DELAY', 'APPROVAL']),
  queuedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
}).openapi('PendingApprovalSummary')

const PendingApprovalsResponseSchema = z.object({
  transactions: z.array(PendingApprovalSummarySchema),
  nextCursor: z.string().uuid().optional(),
}).openapi('PendingApprovalsResponse')
```

**응답 예시 (200 OK):**
```json
{
  "transactions": [
    {
      "txId": "019502c0-1a2b-3c4d-5e6f-abcdef012345",
      "agentId": "01950288-1a2b-3c4d-5e6f-abcdef012345",
      "agentName": "trading-agent-01",
      "type": "TRANSFER",
      "amount": "50000000000",
      "toAddress": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      "chain": "solana",
      "tier": "APPROVAL",
      "queuedAt": "2026-02-05T10:31:25.000Z",
      "expiresAt": "2026-02-05T11:31:25.000Z"
    }
  ],
  "nextCursor": null
}
```

---

### 8.8 GET /v1/owner/status (Owner 연결 상태)

Owner 지갑 연결 상태 및 시스템 요약을 조회한다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/owner/status` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `getOwnerStatus` |
| **정의 원본** | OWNR-CONN (섹션 6) |

**Response Zod 스키마:**

```typescript
const OwnerStatusResponseSchema = z.object({
  connected: z.literal(true),
  address: z.string(),
  chain: z.string(),
  connectedAt: z.string().datetime(),
  lastActiveAt: z.string().datetime().optional(),
  systemState: z.enum(['NORMAL', 'ACTIVATED', 'RECOVERING']).openapi({
    description: 'Kill Switch 상태',
  }),
  activeSessionCount: z.number().int(),
  pendingApprovalCount: z.number().int(),
}).openapi('OwnerStatusResponse')
```

**응답 예시 (200 OK):**
```json
{
  "connected": true,
  "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "chain": "solana",
  "connectedAt": "2026-02-05T10:00:00.000Z",
  "lastActiveAt": "2026-02-05T10:35:00.000Z",
  "systemState": "NORMAL",
  "activeSessionCount": 2,
  "pendingApprovalCount": 1
}
```

---

### 8.9 POST /v1/owner/policies (정책 생성)

새 정책을 생성한다.

| 항목 | 값 |
|------|-----|
| **Method** | `POST` |
| **Path** | `/v1/owner/policies` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `createPolicy` |
| **정의 원본** | OWNR-CONN (섹션 6.7) |

**Request Zod 스키마:**

```typescript
const CreatePolicyRequestSchema = z.object({
  agentId: z.string().uuid().optional().openapi({
    description: '대상 에이전트 ID. 미지정 시 글로벌 정책',
  }),
  type: z.enum(['SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT']).openapi({
    description: '정책 유형',
  }),
  rules: z.unknown().openapi({
    description: '정책 규칙 JSON (type에 맞는 Zod 스키마로 런타임 검증)',
  }),
  priority: z.number().int().optional().default(0).openapi({
    description: '우선순위 (높을수록 먼저 평가)',
  }),
  enabled: z.boolean().optional().default(true),
}).openapi('CreatePolicyRequest')
```

**Response Zod 스키마:**

```typescript
const PolicySummarySchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid().nullable(),
  type: z.enum(['SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT']),
  rules: z.unknown(),
  priority: z.number().int(),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi('PolicySummary')

const CreatePolicyResponseSchema = z.object({
  policy: PolicySummarySchema,
}).openapi('CreatePolicyResponse')
```

**응답 예시 (201 Created):**
```json
{
  "policy": {
    "id": "019502e0-1a2b-3c4d-5e6f-abcdef012345",
    "agentId": null,
    "type": "SPENDING_LIMIT",
    "rules": {
      "tiers": {
        "INSTANT": { "max": "100000000" },
        "NOTIFY": { "max": "1000000000" },
        "DELAY": { "max": "10000000000" },
        "APPROVAL": { "max": "999999999999999" }
      }
    },
    "priority": 0,
    "enabled": true,
    "createdAt": "2026-02-05T10:30:00.000Z",
    "updatedAt": "2026-02-05T10:30:00.000Z"
  }
}
```

---

### 8.10 PUT /v1/owner/policies/:policyId (정책 수정)

기존 정책을 수정한다.

| 항목 | 값 |
|------|-----|
| **Method** | `PUT` |
| **Path** | `/v1/owner/policies/:policyId` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `updatePolicy` |
| **정의 원본** | OWNR-CONN (섹션 6.6) |

**Request Zod 스키마:**

```typescript
const UpdatePolicyRequestSchema = z.object({
  rules: z.unknown().optional().openapi({ description: '정책 규칙 JSON' }),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
}).openapi('UpdatePolicyRequest')
```

**Response Zod 스키마:**

```typescript
const UpdatePolicyResponseSchema = z.object({
  policy: PolicySummarySchema,
}).openapi('UpdatePolicyResponse')
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `POLICY_DENIED` | 404 | false | 정책 없음 |

---

### 8.11 GET /v1/owner/sessions (Owner 관점 세션 목록) [Phase 9 신규]

Owner 관점에서 모든 에이전트 세션을 조회한다. 섹션 7.2의 `GET /v1/sessions`와 달리, 모든 에이전트의 세션을 포함한다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/owner/sessions` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `listOwnerSessions` |
| **Phase 9 신규** | |

**Query Parameters:**

```typescript
const OwnerSessionsQuerySchema = z.object({
  cursor: z.string().optional().openapi({ description: '페이지네이션 커서 (UUID v7)' }),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  agentId: z.string().uuid().optional().openapi({ description: '에이전트 필터' }),
  active: z.coerce.boolean().optional().openapi({ description: 'true=활성 세션만, false=전체' }),
}).openapi('OwnerSessionsQuery')
```

**Response Zod 스키마:**

```typescript
const OwnerSessionsResponseSchema = z.object({
  sessions: z.array(SessionSummarySchema),
  nextCursor: z.string().nullable(),
}).openapi('OwnerSessionsResponse')
```

**응답 예시 (200 OK):**
```json
{
  "sessions": [
    {
      "id": "019502a8-7b3c-7d4e-8f5a-1234567890ab",
      "agentId": "01950288-1a2b-3c4d-5e6f-abcdef012345",
      "agentName": "trading-agent-01",
      "constraints": { "maxAmountPerTx": "10000000000" },
      "usageStats": { "totalTx": 5, "totalAmount": "2500000000", "lastTxAt": "2026-02-05T10:30:00.000Z" },
      "expiresAt": "2026-02-06T10:31:25.000Z",
      "createdAt": "2026-02-05T10:31:25.000Z"
    }
  ],
  "nextCursor": null
}
```

---

### 8.12 DELETE /v1/owner/sessions/:id (Owner 직접 세션 폐기) [Phase 9 신규]

Owner가 특정 세션을 즉시 폐기한다.

| 항목 | 값 |
|------|-----|
| **Method** | `DELETE` |
| **Path** | `/v1/owner/sessions/:id` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `revokeOwnerSession` |
| **Phase 9 신규** | |

**Response Zod 스키마:**

```typescript
const OwnerSessionRevokeResponseSchema = z.object({
  revoked: z.literal(true),
  sessionId: z.string().uuid(),
}).openapi('OwnerSessionRevokeResponse')
```

**응답 예시 (200 OK):**
```json
{
  "revoked": true,
  "sessionId": "019502a8-7b3c-7d4e-8f5a-1234567890ab"
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `SESSION_NOT_FOUND` | 404 | false | 세션 없음 |
| `SESSION_REVOKED` | 409 | false | 이미 폐기됨 |

---

### 8.13 GET /v1/owner/agents (에이전트 목록) [Phase 9 신규]

등록된 에이전트 목록을 조회한다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/owner/agents` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `listAgents` |
| **Phase 9 신규** | |

**Response Zod 스키마:**

```typescript
const AgentSummarySchema = z.object({
  id: z.string().uuid().openapi({ description: '에이전트 ID (UUID v7)' }),
  name: z.string().openapi({ description: '에이전트 이름' }),
  status: z.enum(['CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED']).openapi({
    description: '에이전트 상태 (DB CHECK 5개 값). KILL_SWITCH는 DB 상태가 아닌 클라이언트 표시 상태 (status=SUSPENDED + suspension_reason=kill_switch)',
  }),
  chain: z.string().openapi({ description: '체인' }),
  network: z.string().openapi({ description: '네트워크' }),
  publicKey: z.string().openapi({ description: '지갑 공개키' }),
  suspensionReason: z.string().nullable().optional().openapi({
    description: '정지 사유 (SUSPENDED 상태일 때만). kill_switch, policy_violation, manual, auto_stop 등',
  }),
  createdAt: z.string().datetime(),
  sessionCount: z.number().int().openapi({ description: '활성 세션 수' }),
  totalTxCount: z.number().int().openapi({ description: '총 거래 수' }),
}).openapi('AgentSummary')

const AgentListResponseSchema = z.object({
  agents: z.array(AgentSummarySchema),
}).openapi('AgentListResponse')
```

**응답 예시 (200 OK):**
```json
{
  "agents": [
    {
      "id": "01950288-1a2b-3c4d-5e6f-abcdef012345",
      "name": "trading-agent-01",
      "status": "ACTIVE",
      "chain": "solana",
      "network": "mainnet-beta",
      "publicKey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "createdAt": "2026-02-01T00:00:00.000Z",
      "sessionCount": 2,
      "totalTxCount": 47
    }
  ]
}
```

---

### 8.14 GET /v1/owner/agents/:id (에이전트 상세) [Phase 9 신규]

에이전트의 상세 정보 (최근 거래, 활성 세션, 정책 요약)를 조회한다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/owner/agents/:id` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `getAgentDetail` |
| **Phase 9 신규** | |

**Response Zod 스키마:**

```typescript
const AgentDetailResponseSchema = z.object({
  agent: AgentSummarySchema.extend({
    ownerAddress: z.string(),
  }),
  recentTransactions: z.array(TransactionSummarySchema).openapi({
    description: '최근 10건 거래',
  }),
  activeSessions: z.array(SessionSummarySchema).openapi({
    description: '활성 세션 목록',
  }),
  policies: z.array(PolicySummarySchema).openapi({
    description: '적용된 정책 목록 (글로벌 + 에이전트별)',
  }),
}).openapi('AgentDetailResponse')
```

**응답 예시 (200 OK):**
```json
{
  "agent": {
    "id": "01950288-1a2b-3c4d-5e6f-abcdef012345",
    "name": "trading-agent-01",
    "status": "ACTIVE",
    "chain": "solana",
    "network": "mainnet-beta",
    "publicKey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "ownerAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "createdAt": "2026-02-01T00:00:00.000Z",
    "sessionCount": 2,
    "totalTxCount": 47
  },
  "recentTransactions": [],
  "activeSessions": [],
  "policies": []
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `AGENT_NOT_FOUND` | 404 | false | 에이전트 없음 |

---

### 8.15 GET /v1/owner/settings (시스템 설정 조회) [Phase 9 신규]

보안 관련 시스템 설정 현황을 조회한다. 민감 값은 마스킹된다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/owner/settings` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `getSettings` |
| **Phase 9 신규** | |

**Response Zod 스키마:**

```typescript
const SettingsResponseSchema = z.object({
  server: z.object({
    hostname: z.literal('127.0.0.1'),
    port: z.number().int(),
    logLevel: z.string(),
  }),
  security: z.object({
    jwtSecret: z.literal('[REDACTED]').openapi({ description: '항상 마스킹' }),
    rateLimits: z.object({
      global: z.number().int().openapi({ description: 'req/min' }),
      session: z.number().int(),
      transaction: z.number().int(),
    }),
  }),
  notifications: z.object({
    enabled: z.boolean(),
    minChannels: z.number().int(),
    channels: z.array(z.object({
      type: z.enum(['telegram', 'discord', 'ntfy']),
      name: z.string(),
      enabled: z.boolean(),
      configPreview: z.string().openapi({ description: '마스킹된 설정 (마지막 4자만)' }),
    })),
  }),
  autoStop: z.object({
    enabled: z.boolean(),
    rulesCount: z.number().int(),
  }),
}).openapi('SettingsResponse')
```

**응답 예시 (200 OK):**
```json
{
  "server": {
    "hostname": "127.0.0.1",
    "port": 3100,
    "logLevel": "info"
  },
  "security": {
    "jwtSecret": "[REDACTED]",
    "rateLimits": { "global": 100, "session": 300, "transaction": 10 }
  },
  "notifications": {
    "enabled": true,
    "minChannels": 2,
    "channels": [
      { "type": "telegram", "name": "Owner Telegram", "enabled": true, "configPreview": "...7890" },
      { "type": "discord", "name": "Alert Channel", "enabled": true, "configPreview": "...abcd" }
    ]
  },
  "autoStop": { "enabled": true, "rulesCount": 3 }
}
```

---

### 8.16 PUT /v1/owner/settings (시스템 설정 변경) [Phase 9 신규]

허용된 필드만 변경 가능하다. `hostname`, `jwt_secret` 등 보안 핵심 설정은 변경 불가.

| 항목 | 값 |
|------|-----|
| **Method** | `PUT` |
| **Path** | `/v1/owner/settings` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `updateSettings` |
| **Phase 9 신규** | |

**Request Zod 스키마:**

```typescript
const UpdateSettingsRequestSchema = z.object({
  notifications: z.object({
    enabled: z.boolean().optional(),
    minChannels: z.number().int().min(1).max(5).optional(),
  }).optional(),
  autoStop: z.object({
    enabled: z.boolean().optional(),
  }).optional(),
  server: z.object({
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  }).optional(),
}).openapi('UpdateSettingsRequest')
```

**변경 불가 필드:**
- `hostname` (127.0.0.1 강제)
- `jwt_secret` (config.toml 직접 수정 필요)
- `port` (데몬 재시작 필요)

**Response Zod 스키마:**

```typescript
const UpdateSettingsResponseSchema = z.object({
  updated: z.literal(true),
  settings: SettingsResponseSchema,
}).openapi('UpdateSettingsResponse')
```

**응답 예시 (200 OK):**
```json
{
  "updated": true,
  "settings": { "...": "전체 settings 객체" }
}
```

---

### 8.17 GET /v1/owner/dashboard (대시보드 요약) [Phase 9 신규]

Owner 대시보드에 표시할 핵심 지표를 한 번에 조회한다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/owner/dashboard` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: ownerAuth -> masterAuth(implicit))** |
| **Tags** | `Owner` |
| **operationId** | `getDashboard` |
| **Phase 9 신규** | |

**Response Zod 스키마:**

```typescript
const DashboardResponseSchema = z.object({
  balance: z.object({
    sol: z.string().openapi({ description: '총 SOL 잔액 (lamports)' }),
    formatted: z.string().openapi({ description: '읽기 좋은 포맷', example: '15.5 SOL' }),
    chain: z.literal('solana'),
  }),
  todayTxCount: z.number().int().openapi({ description: '오늘 거래 수' }),
  todayTxVolume: z.string().openapi({ description: '오늘 거래 총액 (lamports)' }),
  activeSessions: z.number().int().openapi({ description: '활성 세션 수' }),
  pendingApprovals: z.number().int().openapi({ description: '승인 대기 거래 수' }),
  systemState: z.enum(['NORMAL', 'ACTIVATED', 'RECOVERING']).openapi({
    description: 'Kill Switch 상태',
  }),
  agentStatuses: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    status: z.enum(['CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED']),
    suspensionReason: z.string().nullable().optional(),
    chain: z.string(),
  })).openapi({ description: '에이전트 상태 요약. KILL_SWITCH는 status=SUSPENDED + suspensionReason=kill_switch로 표현' }),
}).openapi('DashboardResponse')
```

**응답 예시 (200 OK):**
```json
{
  "balance": {
    "sol": "15500000000",
    "formatted": "15.5 SOL",
    "chain": "solana"
  },
  "todayTxCount": 12,
  "todayTxVolume": "5000000000",
  "activeSessions": 2,
  "pendingApprovals": 1,
  "systemState": "NORMAL",
  "agentStatuses": [
    { "id": "01950288-1a2b-3c4d-5e6f-abcdef012345", "name": "trading-agent-01", "status": "ACTIVE", "chain": "solana" }
  ]
}
```

---

## 9. Admin API (masterAuth -- explicit/implicit)

> **(v0.5 변경)** Admin API는 masterAuth 이중 모드를 사용한다. **masterAuth(explicit)**: `X-Master-Password` 헤더 필수 (shutdown, kill-switch, 설정 변경 등 위험 작업). **masterAuth(implicit)**: 데몬 구동 = 인증 완료 (상태 조회 등 안전한 작업). 상세: **52-auth-model-redesign.md 섹션 2.1** 참조.

CLI 또는 시스템 관리용 엔드포인트.

### 9.1 POST /v1/admin/kill-switch (CLI Kill Switch)

CLI에서 마스터 패스워드로 Kill Switch를 발동한다. WalletConnect 불필요.

| 항목 | 값 |
|------|-----|
| **Method** | `POST` |
| **Path** | `/v1/admin/kill-switch` |
| **Auth** | masterAuth(explicit) -- X-Master-Password 헤더 필수 |
| **Tags** | `Admin` |
| **operationId** | `adminKillSwitch` |
| **정의 원본** | KILL-AUTO-EVM (섹션 1.2) |

**Request Zod 스키마:**

```typescript
const AdminKillSwitchRequestSchema = z.object({
  reason: z.string().min(1).max(500).openapi({
    description: 'Kill Switch 발동 사유',
    example: 'Emergency shutdown via CLI',
  }),
}).openapi('AdminKillSwitchRequest')
```

**Response:** `KillSwitchResponseSchema`와 동일 (섹션 8.5 참조)

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `INVALID_MASTER_PASSWORD` | 401 | false | 패스워드 불일치 |
| `MASTER_PASSWORD_LOCKED` | 429 | false | 5회 실패 lockout |
| `KILL_SWITCH_ACTIVE` | 409 | false | 이미 활성 |

---

### 9.2 POST /v1/admin/shutdown (Graceful Shutdown)

데몬을 안전하게 종료한다. CORE-05 10단계 Graceful Shutdown 캐스케이드를 트리거.

| 항목 | 값 |
|------|-----|
| **Method** | `POST` |
| **Path** | `/v1/admin/shutdown` |
| **Auth** | masterAuth(explicit) -- X-Master-Password 헤더 필수 |
| **Tags** | `Admin` |
| **operationId** | `adminShutdown` |
| **정의 원본** | CORE-05 |

**Response Zod 스키마:**

```typescript
const ShutdownResponseSchema = z.object({
  shutdownInitiated: z.literal(true),
  timestamp: z.string().datetime(),
  message: z.string().openapi({
    description: '종료 안내 메시지',
    example: 'Graceful shutdown initiated. Server will stop accepting new requests.',
  }),
}).openapi('ShutdownResponse')
```

**응답 예시 (200 OK):**
```json
{
  "shutdownInitiated": true,
  "timestamp": "2026-02-05T12:00:00.000Z",
  "message": "Graceful shutdown initiated. Server will stop accepting new requests."
}
```

**에러:**

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `INVALID_MASTER_PASSWORD` | 401 | false | 패스워드 불일치 |
| `SHUTTING_DOWN` | 503 | false | 이미 종료 진행 중 |

---

### 9.3 GET /v1/admin/status (데몬 상태 조회)

데몬의 상세 상태를 조회한다.

| 항목 | 값 |
|------|-----|
| **Method** | `GET` |
| **Path** | `/v1/admin/status` |
| **Auth** | masterAuth(implicit) **(v0.5 변경: 상태 조회는 implicit 허용)** |
| **Tags** | `Admin` |
| **operationId** | `getAdminStatus` |

**Response Zod 스키마:**

```typescript
const AdminStatusResponseSchema = z.object({
  daemon: z.object({
    version: z.string(),
    uptime: z.number().openapi({ description: '가동 시간 (초)' }),
    pid: z.number().int(),
    nodeVersion: z.string(),
  }),
  killSwitch: z.object({
    status: z.enum(['NORMAL', 'ACTIVATED', 'RECOVERING']),
    activatedAt: z.string().datetime().nullable(),
    reason: z.string().nullable(),
    actor: z.enum(['owner', 'auto_stop', 'admin', 'system']).nullable(),
  }),
  adapters: z.array(z.object({
    chain: z.string(),
    network: z.string(),
    healthy: z.boolean(),
    lastCheck: z.string().datetime().nullable(),
  })),
  workers: z.object({
    delayQueue: z.object({ running: z.boolean(), lastRun: z.string().datetime().nullable() }),
    approvalTimeout: z.object({ running: z.boolean(), lastRun: z.string().datetime().nullable() }),
    sessionCleanup: z.object({ running: z.boolean(), lastRun: z.string().datetime().nullable() }),
    walCheckpoint: z.object({ running: z.boolean(), lastRun: z.string().datetime().nullable() }),
  }),
  database: z.object({
    path: z.string(),
    sizeBytes: z.number().int(),
    walMode: z.boolean(),
  }),
}).openapi('AdminStatusResponse')
```

**응답 예시 (200 OK):**
```json
{
  "daemon": {
    "version": "0.2.0",
    "uptime": 86400,
    "pid": 12345,
    "nodeVersion": "v22.0.0"
  },
  "killSwitch": {
    "status": "NORMAL",
    "activatedAt": null,
    "reason": null,
    "actor": null
  },
  "adapters": [
    { "chain": "solana", "network": "mainnet-beta", "healthy": true, "lastCheck": "2026-02-05T10:30:00.000Z" }
  ],
  "workers": {
    "delayQueue": { "running": true, "lastRun": "2026-02-05T10:30:10.000Z" },
    "approvalTimeout": { "running": true, "lastRun": "2026-02-05T10:30:30.000Z" },
    "sessionCleanup": { "running": true, "lastRun": "2026-02-05T10:00:00.000Z" },
    "walCheckpoint": { "running": true, "lastRun": "2026-02-05T10:30:00.000Z" }
  },
  "database": {
    "path": "/Users/minho/.waiaas/data/waiaas.db",
    "sizeBytes": 1048576,
    "walMode": true
  }
}
```

---

## 10. 에러 코드 체계

### 10.1 에러 응답 포맷

모든 에러는 CORE-06에서 정의한 간소화 포맷으로 반환된다:

```typescript
const ErrorResponseSchema = z.object({
  code: z.string().openapi({ description: '에러 코드 (대문자 스네이크)' }),
  message: z.string().openapi({ description: '사람이 읽을 수 있는 에러 메시지' }),
  hint: z.string().optional().openapi({ description: '(v0.5 추가) 다음 행동을 안내하는 actionable 메시지. 40개 에러 중 31개에 매핑 (78%). 상세: 55-dx-improvement-spec.md 섹션 2 참조' }),
  details: z.unknown().optional().openapi({ description: '추가 상세 정보 (디버깅용)' }),
  requestId: z.string().openapi({ description: '요청 추적 ID' }),
  retryable: z.boolean().openapi({ description: '재시도 가능 여부' }),
}).openapi('ErrorResponse')
```

> **(v0.5 추가)** `hint` 필드는 backward-compatible 확장이다 (`z.string().optional()`). 기존 클라이언트는 이 필드를 무시하고, v0.5+ 클라이언트는 hint를 사용자에게 표시하여 에러 해결을 안내한다. hint 전체 매핑(errorHintMap)은 **55-dx-improvement-spec.md 섹션 2.2** 참조.

**에러 응답 예시:**
```json
{
  "code": "INSUFFICIENT_BALANCE",
  "message": "잔액이 부족합니다. 현재 잔액: 500000000 lamports, 요청 금액: 1000000000 lamports",
  "hint": "에이전트 지갑에 충분한 잔액을 입금하세요. 주소: waiaas status로 확인",
  "details": { "currentBalance": "500000000", "requestedAmount": "1000000000" },
  "requestId": "req_a1b2c3d4e5f678901234",
  "retryable": false
}
```

### 10.2 AUTH 도메인 에러

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `INVALID_TOKEN` | 401 | false | JWT 서명 검증 실패 또는 형식 오류 |
| `TOKEN_EXPIRED` | 401 | false | JWT 만료 시간 초과 |
| `SESSION_REVOKED` | 401 | false | 세션이 폐기됨 (DB 조회 결과) |
| `INVALID_SIGNATURE` | 401 | false | Owner SIWS/SIWE 서명 검증 실패 |
| `INVALID_NONCE` | 401 | false | nonce 무효, 만료, 또는 이미 사용됨 |
| `INVALID_MASTER_PASSWORD` | 401 | false | 마스터 패스워드 불일치 |
| `MASTER_PASSWORD_LOCKED` | 429 | false | 5회 실패로 30분 lockout |
| `SYSTEM_LOCKED` | 401 | false | Kill Switch ACTIVATED 상태에서 요청 거부 |

### 10.3 SESSION 도메인 에러

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `SESSION_NOT_FOUND` | 404 | false | 세션 ID에 해당하는 세션 없음 |
| `SESSION_EXPIRED` | 401 | false | 세션 만료 (exp claim 초과) |
| `SESSION_LIMIT_EXCEEDED` | 403 | false | 세션 제약 조건 초과 (한도/횟수/주소) |
| `CONSTRAINT_VIOLATED` | 403 | false | 허용 작업/주소 제약 위반 |
| `RENEWAL_LIMIT_REACHED` | 403 | false | 최대 갱신 횟수(maxRenewals) 초과 (Phase 20 추가) |
| `SESSION_ABSOLUTE_LIFETIME_EXCEEDED` | 403 | false | 갱신 후 세션 총 수명이 절대 수명 초과 (Phase 20 추가) |
| `RENEWAL_TOO_EARLY` | 403 | true | 현재 세션 기간의 50% 미경과 (시간 경과 후 재시도) (Phase 20 추가) |
| `SESSION_RENEWAL_MISMATCH` | 403 | false | JWT의 sid와 요청의 :id 불일치 (타인의 세션 갱신 시도) (Phase 20 추가) |

### 10.4 TX 도메인 에러

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `INSUFFICIENT_BALANCE` | 400 | false | 잔액 부족 (시뮬레이션 감지) |
| `INVALID_ADDRESS` | 400 | false | 유효하지 않은 수신 주소 형식 |
| `TX_NOT_FOUND` | 404 | false | 거래 ID에 해당하는 거래 없음 |
| `TX_EXPIRED` | 410 | false | 승인 대기 시간 또는 blockhash 만료 |
| `TX_ALREADY_PROCESSED` | 409 | false | 이미 처리 완료된 거래 |
| `CHAIN_ERROR` | 502 | true | 온체인 제출/확인 중 RPC 오류 |
| `SIMULATION_FAILED` | 422 | false | 온체인 시뮬레이션 실패 |

### 10.5 POLICY 도메인 에러

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `POLICY_DENIED` | 403 | false | 정책 엔진에 의해 거래 거부 |
| `SPENDING_LIMIT_EXCEEDED` | 403 | false | 4-tier 지출 한도 초과 |
| `RATE_LIMIT_EXCEEDED` | 429 | true | API 요청 속도 제한 초과 |
| `WHITELIST_DENIED` | 403 | false | 화이트리스트에 없는 수신 주소 |

### 10.6 OWNER 도메인 에러

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `OWNER_ALREADY_CONNECTED` | 409 | false | Owner 이미 등록됨 |
| `OWNER_NOT_CONNECTED` | 404 | false | Owner 미등록 |
| `APPROVAL_TIMEOUT` | 410 | false | 승인 기한 만료 (APPROVAL 티어) |
| `APPROVAL_NOT_FOUND` | 404 | false | 승인 대기 거래 없음 |

### 10.7 SYSTEM 도메인 에러

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `KILL_SWITCH_ACTIVE` | 409 | false | Kill Switch 이미 활성 |
| `KILL_SWITCH_NOT_ACTIVE` | 409 | false | Kill Switch 비활성 (복구 불필요) |
| `KEYSTORE_LOCKED` | 503 | true | 키스토어 잠김 상태 |
| `CHAIN_NOT_SUPPORTED` | 400 | false | 지원하지 않는 체인 |
| `SHUTTING_DOWN` | 503 | false | 데몬 종료 진행 중 |
| `ADAPTER_NOT_AVAILABLE` | 503 | true | 체인 어댑터 미초기화 |

### 10.8 AGENT 도메인 에러

| 코드 | HTTP | retryable | 설명 |
|------|------|-----------|------|
| `AGENT_NOT_FOUND` | 404 | false | 에이전트 없음 또는 소유권 불일치 |
| `AGENT_SUSPENDED` | 409 | false | 에이전트 정지 상태 |
| `AGENT_TERMINATED` | 410 | false | 에이전트 종료됨 |

### 10.9 에러 코드 요약 통계

| 도메인 | 코드 수 | 주요 HTTP |
|--------|--------|-----------|
| AUTH | 8 | 401, 429 |
| SESSION | 8 | 401, 403, 404 (Phase 20: +4 갱신 에러) |
| TX | 7 | 400, 404, 409, 410, 422, 502 |
| POLICY | 4 | 403, 429 |
| OWNER | 4 | 404, 409, 410 |
| SYSTEM | 6 | 400, 409, 503 |
| AGENT | 3 | 404, 409, 410 |
| **합계** | **40** | |

> **(v0.5 추가) hint 매핑:** 40개 에러 코드 중 31개(78%)에 hint가 매핑되어 있다. 9개 미매핑(보안/복구불가 사유: `INVALID_TOKEN`, `TOKEN_EXPIRED`, `SESSION_REVOKED`, `INVALID_SIGNATURE`, `INVALID_NONCE`, `MASTER_PASSWORD_LOCKED`, `SYSTEM_LOCKED`, `SHUTTING_DOWN`, `KEYSTORE_LOCKED`). 전체 hint 맵은 **55-dx-improvement-spec.md 섹션 2.2 errorHintMap** 참조.

---

## 11. 공통 응답 스키마

### 11.1 PaginatedResponse<T>

커서 기반 페이지네이션 응답의 공통 패턴. UUID v7의 시간 순서를 활용한다.

```typescript
// 패턴 (제네릭 래퍼가 아닌 각 엔드포인트에서 직접 정의)
// cursor 기반: WHERE id < cursor ORDER BY id DESC LIMIT n+1
{
  data: T[],           // 또는 도메인별 키 (transactions, sessions, agents)
  nextCursor: string | null,  // 다음 페이지 커서 (없으면 null)
}
```

**커서 구현 패턴:**
- 정렬: UUID v7 `id` 기준 DESC (최신순) 또는 ASC
- 조건: `WHERE id < cursor` (DESC) 또는 `WHERE id > cursor` (ASC)
- 오버페치: `LIMIT n+1`으로 조회 후 n+1번째 존재 여부로 `nextCursor` 결정
- `hasMore`는 별도 필드로 노출하지 않음 -- `nextCursor`가 null이면 마지막 페이지

### 11.2 ErrorResponse

섹션 10.1 참조. 모든 에러에 공통 적용.

### 11.3 SuccessResponse<T>

v0.2에서는 **래퍼 없이 직접 반환**한다. 불필요한 `{ data: T, success: true }` 패턴을 사용하지 않음.

```typescript
// Good (v0.2)
{ "balance": "1500000000", "symbol": "SOL", ... }

// Bad (사용하지 않음)
{ "success": true, "data": { "balance": "1500000000", "symbol": "SOL", ... } }
```

**근거:** v0.2는 Self-Hosted 단일 클라이언트 환경이므로 래퍼 오버헤드 불필요. 에러 여부는 HTTP 상태 코드로 판별.

---

## 12. OpenAPI 3.0 문서 구조 요약

### 12.1 Zod SSoT 파이프라인

Zod 스키마 하나에서 TypeScript 타입, 런타임 검증, OpenAPI 3.0 스펙이 모두 파생된다.

```
Zod Schema (packages/core/src/schemas/)
  |
  +-- z.infer<typeof>           --> TypeScript Type
  +-- .openapi() metadata       --> OpenAPI 3.0 JSON (/doc)
  +-- createRoute() + handler   --> Runtime validation (Hono middleware)
  +-- openapi-typescript         --> SDK type generation (Phase 9 09-02)
  +-- MCP tool inputSchema      --> MCP tool Zod reuse (Phase 9 09-02)
```

### 12.2 태그 그룹

| 태그 | 설명 | 엔드포인트 수 |
|------|------|-------------|
| `Public` | 인증 불필요 | 3 |
| `Wallet` | 지갑 조회 | 2 |
| `Transaction` | 거래 송금/조회 | 3 |
| `Session` | 세션 관리 | 3 |
| `Owner` | Owner 전용 관리 | 17 |
| `Admin` | 시스템 관리 | 3 |

### 12.3 securitySchemes 요약

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: "Session token (wai_sess_...)"
    ownerAuth:
      type: apiKey
      in: header
      name: Authorization
      description: "Owner SIWS/SIWE signature payload (base64url)"
    masterAuth:
      type: apiKey
      in: header
      name: X-Master-Password
      description: "Keystore master password (Argon2id verified)"
```

### 12.4 자동 생성 경로

```typescript
// packages/daemon/src/server/app.ts
app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    title: 'WAIaaS API',
    version: '0.2.0',
    description: 'AI 에이전트를 위한 Self-Hosted Wallet-as-a-Service API',
  },
  servers: [
    { url: `http://127.0.0.1:${port}`, description: 'Local daemon' },
  ],
  components: {
    securitySchemes: { /* 위 12.3 참조 */ },
  },
})

// debug 모드에서만 Swagger UI 활성화
if (config.daemon.log_level === 'debug') {
  app.get('/swagger', swaggerUI({ url: '/doc' }))
}
```

### 12.5 v0.3 확장 포인트

| 영역 | 확장 내용 |
|------|----------|
| SPL 토큰 | `GET /v1/wallet/tokens`, `POST /v1/transactions/send` (type=TOKEN_TRANSFER 구현) |
| EVM 체인 | `EvmAdapter` 구현, `eip155` 네임스페이스 활성화 |
| 멀티 에이전트 | `POST /v1/agents`, `DELETE /v1/agents/:id` 관리 API |
| Remote MCP | Streamable HTTP transport, OAuth 2.1 인증 |

---

## 13. API 버전 관리 전략

### 13.1 v0.2 전략

- **단일 버전:** `/v1` 접두사 사용
- **Breaking change 없음:** v0.2 기간 중 하위 호환성 유지
- **Additive only:** 신규 엔드포인트/필드 추가는 가능, 기존 제거/변경은 불가

### 13.2 v0.3+ 전략

- `/v1` 유지 + 신규 엔드포인트 추가 (additive)
- Breaking change가 필요한 경우에만 `/v2` 신설
- 기존 `/v1`과 `/v2`는 6개월간 병행 운영

### 13.3 Deprecation 정책

1. 폐기 예정 엔드포인트에 `Deprecation: true` 응답 헤더 추가
2. `Sunset: <date>` 헤더로 제거 예정일 명시
3. 최소 6개월 유지 (SDK/MCP 사용자 마이그레이션 기간)
4. OpenAPI `deprecated: true` 플래그로 /doc에 반영

```typescript
// Deprecation 헤더 미들웨어 예시
app.use('/v1/deprecated-endpoint', async (c, next) => {
  await next()
  c.header('Deprecation', 'true')
  c.header('Sunset', 'Wed, 01 Sep 2026 00:00:00 GMT')
  c.header('Link', '</v2/new-endpoint>; rel="successor-version"')
})
```

---

## 14. 구현 노트

### 14.1 커서 페이지네이션 표준 (NOTE-11)

모든 리스트 엔드포인트에서 일관된 커서 페이지네이션 파라미터를 사용한다.

**표준 파라미터 4개:**

| 파라미터 | 위치 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|------|--------|------|
| `cursor` | 요청 query | string (UUID v7) | 선택 | - | 이전 응답의 `nextCursor` 값. 첫 요청 시 생략 |
| `limit` | 요청 query | number | 선택 | 20 | 페이지 크기 (1~100) |
| `order` | 요청 query | `asc` \| `desc` | 선택 | `desc` | 정렬 방향 (UUID v7 시간순) |
| `nextCursor` | 응답 body | string \| null | 항상 | - | 다음 페이지 커서. `null`이면 마지막 페이지 |

**UUID v7 커서 구현 규칙:**

```sql
-- DESC (최신순, 기본)
WHERE id < :cursor ORDER BY id DESC LIMIT :limit + 1

-- ASC (오래된 순)
WHERE id > :cursor ORDER BY id ASC LIMIT :limit + 1
```

오버페치 방식: `LIMIT n+1`로 조회 후 n+1번째 행이 존재하면 `nextCursor = rows[n-1].id`, 없으면 `nextCursor = null`.

**페이지네이션 적용/미적용 엔드포인트:**

| 엔드포인트 | 페이지네이션 | 근거 |
|-----------|------------|------|
| GET /v1/transactions | 적용 | 거래 이력은 무한 증가 |
| GET /v1/sessions (Session Mgmt) | 적용 | 에이전트당 세션 누적 |
| GET /v1/owner/sessions | 적용 | Owner 세션 전체 조회 |
| GET /v1/owner/pending-approvals | 적용 (선택) | 대기 승인은 소규모이나 일관성을 위해 지원 |
| GET /v1/owner/agents | 미적용 | 에이전트 수는 소규모 (전체 반환) |

**클라이언트 구현 가이드:**
1. 첫 요청: `cursor` 파라미터 생략
2. 다음 페이지: 응답의 `nextCursor` 값을 다음 요청의 `cursor`에 전달
3. 마지막 페이지: `nextCursor`가 `null`이면 더 이상 데이터 없음
4. 이 파라미터명(`cursor`/`nextCursor`/`limit`/`order`)은 현재 모든 리스트 엔드포인트에서 일관됨을 확인함

---

## 15. 전체 엔드포인트 맵 (Quick Reference)

> **(v0.5 변경)** Auth 열이 v0.5 인증 모델을 반영하여 업데이트되었다. ownerAuth는 #15(approve)과 #18(recover) 2곳에만 유지. 상세: **52-auth-model-redesign.md 섹션 4.2** 참조.

| # | Method | Path | Auth (v0.5) | Tags | operationId | 정의 원본 |
|---|--------|------|-------------|------|-------------|----------|
| 1 | GET | `/health` | None | Public | healthCheck | CORE-06 |
| 2 | GET | `/doc` | None | Public | getOpenApiSpec | CORE-06 |
| 3 | GET | `/v1/nonce` | None | Public | getNonce | SESS-PROTO |
| 4 | GET | `/v1/wallet/balance` | sessionAuth | Wallet | getBalance | TX-PIPE |
| 5 | GET | `/v1/wallet/address` | sessionAuth | Wallet | getAddress | TX-PIPE |
| 6 | POST | `/v1/transactions/send` | sessionAuth | Transaction | sendTransaction | TX-PIPE |
| 7 | GET | `/v1/transactions` | sessionAuth | Transaction | listTransactions | TX-PIPE |
| 8 | GET | `/v1/transactions/pending` | sessionAuth | Transaction | listPendingTransactions | TX-PIPE |
| 9 | PUT | `/v1/sessions/:id/renew` | sessionAuth | Session | renewSession | **Phase 20** |
| 10 | POST | `/v1/sessions` | masterAuth(implicit) | Session | createSession | SESS-PROTO |
| 11 | GET | `/v1/sessions` | masterAuth(implicit) | Session | listSessions | TX-PIPE |
| 12 | DELETE | `/v1/sessions/:id` | masterAuth(implicit) | Session | revokeSession | TX-PIPE |
| 13 | POST | `/v1/owner/connect` | None | Owner | connectOwner | OWNR-CONN |
| 14 | DELETE | `/v1/owner/disconnect` | masterAuth(implicit) | Owner | disconnectOwner | OWNR-CONN |
| 15 | POST | `/v1/owner/approve/:txId` | **ownerAuth** | Owner | approveTransaction | OWNR-CONN |
| 16 | POST | `/v1/owner/reject/:txId` | masterAuth(implicit) | Owner | rejectTransaction | OWNR-CONN |
| 17 | POST | `/v1/owner/kill-switch` | masterAuth(implicit) | Owner | activateKillSwitch | KILL-AUTO-EVM |
| 18 | POST | `/v1/owner/recover` | **ownerAuth**+masterAuth(explicit) | Owner | recoverFromKillSwitch | KILL-AUTO-EVM |
| 19 | GET | `/v1/owner/pending-approvals` | masterAuth(implicit) | Owner | listPendingApprovals | OWNR-CONN |
| 20 | GET | `/v1/owner/status` | masterAuth(implicit) | Owner | getOwnerStatus | OWNR-CONN |
| 21 | POST | `/v1/owner/policies` | masterAuth(implicit) | Owner | createPolicy | OWNR-CONN |
| 22 | PUT | `/v1/owner/policies/:policyId` | masterAuth(implicit) | Owner | updatePolicy | OWNR-CONN |
| 23 | GET | `/v1/owner/sessions` | masterAuth(implicit) | Owner | listOwnerSessions | **Phase 9** |
| 24 | DELETE | `/v1/owner/sessions/:id` | masterAuth(implicit) | Owner | revokeOwnerSession | **Phase 9** |
| 25 | GET | `/v1/owner/agents` | masterAuth(implicit) | Owner | listAgents | **Phase 9** |
| 26 | GET | `/v1/owner/agents/:id` | masterAuth(implicit) | Owner | getAgentDetail | **Phase 9** |
| 27 | GET | `/v1/owner/settings` | masterAuth(implicit) | Owner | getSettings | **Phase 9** |
| 28 | PUT | `/v1/owner/settings` | masterAuth(implicit) | Owner | updateSettings | **Phase 9** |
| 29 | GET | `/v1/owner/dashboard` | masterAuth(implicit) | Owner | getDashboard | **Phase 9** |
| 30 | POST | `/v1/admin/kill-switch` | masterAuth(explicit) | Admin | adminKillSwitch | KILL-AUTO-EVM |
| 31 | POST | `/v1/admin/shutdown` | masterAuth(explicit) | Admin | adminShutdown | CORE-05 |
| 32 | GET | `/v1/admin/status` | masterAuth(implicit) | Admin | getAdminStatus | Phase 9 |
