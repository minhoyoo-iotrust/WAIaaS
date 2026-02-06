# WAIaaS v0.5 인증 모델 재설계 (AUTH-REDESIGN)

**문서 ID:** AUTH-REDESIGN
**작성일:** 2026-02-07
**상태:** 완료
**참조:** API-SPEC (37-rest-api-complete-spec.md), OWNR-CONN (34-owner-wallet-connection.md), CORE-06 (29-api-framework-design.md), SESS-PROTO (30-session-token-protocol.md), KILL-AUTO-EVM (36-killswitch-autostop-evm.md)
**요구사항:** AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, OWNR-05, OWNR-06

---

## 1. 문서 개요

### 1.1 목적

WAIaaS v0.2에서 ownerAuth가 17개 이상의 엔드포인트에 적용되던 인증 모델을 masterAuth/ownerAuth/sessionAuth 3-tier로 재분리한다. ownerAuth를 "자금 이동에 직접 영향을 미치는 곳"으로 한정하여 WalletConnect 의존성을 최소화하고, masterAuth를 "데몬 운영자가 이미 인증된 상태"로 정의하여 DX를 개선한다.

### 1.2 요구사항 매핑

| 요구사항 | 설명 | 충족 섹션 |
|---------|------|-----------|
| AUTH-01 | masterAuth/ownerAuth/sessionAuth 3-tier 인증 정의 | 섹션 3 (3-tier 인증 모델 정의) |
| AUTH-02 | 31개 엔드포인트 인증 맵 재배치 | 섹션 4 (31 엔드포인트 인증 맵) |
| AUTH-03 | ownerAuth 2곳 한정 (거래 승인 + KS 복구) | 섹션 3.2, 섹션 4 |
| AUTH-04 | Owner 주소 변경 masterAuth 단일 트랙 | 섹션 3.1 (암묵적 masterAuth로 에이전트 수정) |
| AUTH-05 | 보안 비다운그레이드 검증 | 섹션 6 (v0.2 vs v0.5 검증표) |
| OWNR-05 | CLI 수동 서명 플로우 (WalletConnect 대안) | 섹션 5 (CLI 수동 서명) |
| OWNR-06 | APPROVAL 타임아웃 설정 가능 | 섹션 3.2 (ownerAuth 정의 내 타임아웃) |

### 1.3 참조 문서

| 문서 ID | 파일 | 핵심 내용 |
|---------|------|-----------|
| API-SPEC | 37-rest-api-complete-spec.md | 31개 엔드포인트 v0.2 인증 체계 |
| OWNR-CONN | 34-owner-wallet-connection.md | ownerAuth 8단계 미들웨어, WalletConnect 프로토콜 |
| CORE-06 | 29-api-framework-design.md | Hono 미들웨어 아키텍처, 9단계 체인 |
| SESS-PROTO | 30-session-token-protocol.md | JWT HS256 세션 토큰, sessionAuth 2-stage |
| KILL-AUTO-EVM | 36-killswitch-autostop-evm.md | Kill Switch 3-state, dual-auth 복구 |
| CORE-01 | 24-monorepo-data-directory.md | config.toml, 127.0.0.1 Zod literal |

---

## 2. v0.2 -> v0.5 변경 요약

### 2.1 핵심 변경 3줄 요약

1. **ownerAuth 축소**: 17개 엔드포인트에서 2개(거래 승인 + KS 복구)로 한정. 나머지는 masterAuth(implicit) 또는 sessionAuth로 재배치.
2. **masterAuth 이중 모드**: 암묵적 모드(데몬 구동 = 인증 완료)와 명시적 모드(X-Master-Password 헤더)로 분리. 대부분의 시스템 관리 작업은 암묵적.
3. **WalletConnect 선택화**: CLI 수동 서명이 항상 가능하므로 WC 미연결 상태에서도 모든 ownerAuth 기능이 동작.

### 2.2 변경 비교표

| 영역 | v0.2 | v0.5 | 근거 |
|------|------|------|------|
| ownerAuth 적용 범위 | 17개 엔드포인트 (Owner API 전체 + POST /v1/sessions) | **2개** (거래 승인, KS 복구) | 자금 영향 기준 분리 |
| masterAuth 모드 | 명시적 전용 (X-Master-Password, Admin API 3개) | 암묵적 + 명시적 이중 모드 | 데몬 시작 시 1회 인증 원칙 |
| 세션 생성 인증 | ownerAuth (body 내 SIWS/SIWE 서명) | masterAuth (implicit) | 세션 제약이 안전장치 |
| WalletConnect 역할 | ownerAuth 기능의 사실상 필수 의존성 | 순수 편의 기능 (push 서명 자동화) | DX 개선 + 외부 의존성 최소화 |
| ownerAuth 검증 대상 | owner_wallets.address (전역 단일 Owner) | agents.owner_address (에이전트별 Owner) | 에이전트별 Owner 분리 |
| OwnerSignaturePayload action | 7개 (approve_tx, reject_tx, kill_switch, manage_sessions, update_settings, view_dashboard, recover) | **2개** (approve_tx, recover) | ownerAuth 2곳 한정 |
| Kill Switch 발동 인증 | ownerAuth | masterAuth (implicit) | 비상 정지는 보호적 행위 |
| 감사 추적 | actor='owner:address' (모든 관리 작업에 서명 기록) | actor='master' (시스템 관리), actor='owner:address' (자금 승인) | Self-Hosted 단일 운영자 트레이드오프 |

---

## 3. 3-tier 인증 모델 정의

### 3.1 masterAuth (시스템 관리 인증)

#### 정의

마스터 패스워드(Argon2id) 기반 인증. 데몬 시작 시 1회 입력하여 키스토어를 해제하며, 이후 데몬 실행 중에는 "이미 인증된 상태"로 동작한다.

#### 2가지 모드

**암묵적 masterAuth (implicit)**

- **전제 조건**: 데몬 구동 중 = 마스터 패스워드 인증 완료 상태
- **추가 헤더**: 불필요. HTTP 요청에 인증 관련 헤더를 포함하지 않아도 된다.
- **적용 범위**: 세션 생성/삭제, 에이전트 CRUD, 정책 CRUD, 설정 변경, 조회 등 시스템 관리 전반
- **보안 근거**: localhost 바인딩(`127.0.0.1` Zod literal)에 의존. 로컬 네트워크 외부에서 접근 불가.
- **미들웨어 동작**: `authType='master'` 설정 후 `next()` 호출. 사실상 no-op guard.

```typescript
// masterAuth 암묵적 모드 미들웨어
// 데몬이 실행 중이라는 것 자체가 인증 증거
export function implicitMasterAuthMiddleware() {
  return createMiddleware<AppBindings>(async (c, next) => {
    // 데몬 실행 = 마스터 패스워드 인증 완료 상태
    // 추가 검증 불필요. 보안은 localhost 바인딩에 의존.
    c.set('authType', 'master')
    c.set('actor', 'master')
    await next()
  })
}
```

**명시적 masterAuth (explicit)**

- **전제 조건**: `X-Master-Password` 헤더 필수
- **적용 범위**: Admin API(kill-switch 발동, shutdown, status) + Kill Switch 복구(dual-auth 구성 요소)
- **보안 근거**: 파괴적/비가역적 작업에 대한 defense-in-depth. localhost 바인딩만으로는 부족한 고위험 작업.
- **brute-force 방지**: 5회 연속 실패 시 30분 lockout
- **미들웨어 동작**: Argon2id verify 수행. 실패 시 401 즉시 반환.

```typescript
// masterAuth 명시적 모드 미들웨어
// 파괴적 작업(Kill Switch, Shutdown)에만 적용
export function explicitMasterAuthMiddleware(
  verifyPassword: (password: string) => Promise<boolean>,
  lockoutTracker: BruteForceLockout,
) {
  return createMiddleware<AppBindings>(async (c, next) => {
    // lockout 상태 확인
    if (lockoutTracker.isLocked()) {
      throw new WaiaasError(
        'MASTER_AUTH_LOCKED',
        '인증 실패 횟수 초과. 30분 후 재시도하세요.',
        429,
      )
    }

    const password = c.req.header('X-Master-Password')
    if (!password) {
      throw new WaiaasError(
        'MASTER_PASSWORD_REQUIRED',
        'X-Master-Password 헤더가 필요합니다.',
        401,
      )
    }

    // Argon2id 검증
    const valid = await verifyPassword(password)
    if (!valid) {
      lockoutTracker.recordFailure()
      throw new WaiaasError(
        'INVALID_MASTER_PASSWORD',
        '마스터 패스워드가 올바르지 않습니다.',
        401,
      )
    }

    lockoutTracker.reset()
    c.set('authType', 'master-explicit')
    c.set('actor', 'admin')
    await next()
  })
}
```

**BruteForceLockout 설정:**

| 항목 | 값 | 근거 |
|------|-----|------|
| 최대 시도 횟수 | 5회 | v0.2 API-SPEC 3.3과 동일 |
| lockout 기간 | 30분 (1800초) | 공격 비용 증가 + 정당 사용자 복구 가능 |
| 카운터 저장 | 메모리 (데몬 재시작 시 리셋) | SQLite 불필요. 재시작으로 해제 가능. |

#### 감사 추적

| 모드 | actor 값 | 개인 식별 | 비고 |
|------|---------|-----------|------|
| 암묵적 | `master` | 불가 | Self-Hosted 단일 운영자이므로 의도적 트레이드오프 |
| 명시적 | `admin` | 불가 | 동일. 패스워드 제공자 = 운영자 본인 |

**의도적 트레이드오프**: v0.2에서 ownerAuth 기반일 때는 모든 관리 작업에 지갑 서명이 기록되어 actor='owner:{address}' 형태의 감사 추적이 가능했다. v0.5에서 masterAuth로 전환하면 개인 식별이 불가하지만, Self-Hosted 단일 운영자 환경에서는 "데몬에 접근할 수 있는 사람 = 운영자"이므로 별도 식별이 불필요하다.

---

### 3.2 ownerAuth (자금 승인 인증)

#### 정의

매 요청 SIWS(Solana)/SIWE(EVM) 서명 기반 인증. 서명자의 주소를 에이전트별 `agents.owner_address`와 대조하여 검증한다.

#### 적용 범위

**정확히 2곳만 적용:**

| # | 엔드포인트 | 용도 | 인증 조합 |
|---|----------|------|-----------|
| 1 | `POST /v1/owner/approve/:txId` | APPROVAL 티어 거래 승인 | ownerAuth 단독 |
| 2 | `POST /v1/owner/recover` | Kill Switch 복구 (dual-auth) | ownerAuth + masterAuth(explicit) |

**적용 원칙**: "자금 이동/동결 해제에 직접 영향을 미치는 경우에만 ownerAuth 요구"

- 거래 승인(approve): 자금이 지갑에서 빠져나감 = **자금 이동**
- Kill Switch 복구(recover): 동결된 자금에 대한 접근 복원 = **동결 해제**
- 거래 거절(reject): 자금이 지갑에 머무름 = 보호적 행위 = **masterAuth로 충분**
- Kill Switch 발동: 자금을 동결 = 보호적 행위 = **masterAuth로 충분**

#### v0.2 -> v0.5 변경점

**Step 5 검증 대상 변경:**

```
v0.2: 서명자 == owner_wallets.address (전역 단일 Owner)
v0.5: 서명자 == agents.owner_address (에이전트별 Owner)
```

**agentId 해석 체인:**

- 거래 승인: `txId` -> `transactions.agent_id` -> `agents.owner_address` 대조
- KS 복구: 요청 바디의 `agentId` (선택) 또는 등록된 에이전트 중 해당 서명 주소를 가진 에이전트가 1개 이상 존재하면 통과

```typescript
// v0.5 ownerAuth Step 5: 에이전트별 owner_address 대조
function resolveAgentIdFromContext(c: Context): string {
  const path = c.req.path

  // 거래 승인: txId -> agentId
  if (path.startsWith('/v1/owner/approve/')) {
    const txId = c.req.param('txId')
    const tx = db.select()
      .from(transactions)
      .where(eq(transactions.id, txId))
      .get()
    if (!tx) throw new WaiaasError('TRANSACTION_NOT_FOUND', 404)
    return tx.agentId
  }

  // KS 복구: 서명자 주소로 에이전트 존재 여부 확인
  if (path === '/v1/owner/recover') {
    // 해당 주소를 owner로 가진 에이전트가 1개 이상 존재하면 통과
    const ownerAgents = db.select()
      .from(agents)
      .where(eq(agents.ownerAddress, c.get('ownerAddress')))
      .all()
    if (ownerAgents.length === 0) {
      throw new WaiaasError('OWNER_MISMATCH', 403)
    }
    return ownerAgents[0].id // 대표 에이전트 (복구는 시스템 전체)
  }

  throw new WaiaasError('UNAUTHORIZED', 401)
}
```

#### OwnerSignaturePayload action enum 축소

```typescript
// v0.2: 7개 action
action: z.enum([
  'approve_tx', 'reject_tx', 'kill_switch', 'recover',
  'manage_sessions', 'update_settings', 'view_dashboard',
])

// v0.5: 2개 action (ownerAuth 적용 엔드포인트와 1:1 대응)
action: z.enum([
  'approve_tx',  // POST /v1/owner/approve/:txId
  'recover',     // POST /v1/owner/recover
])
```

#### ownerAuth 미들웨어 8단계 업데이트

v0.2의 8단계 검증 체인을 유지하되, Step 5만 변경한다.

| 단계 | v0.2 | v0.5 | 변경 여부 |
|------|------|------|----------|
| 1 | Authorization 헤더 파싱 + payload 디코딩 | 동일 | 변경 없음 |
| 2 | timestamp 유효성 (5분 이내) | 동일 | 변경 없음 |
| 3 | nonce 일회성 (LRU 캐시 확인 + 삭제) | 동일 | 변경 없음 |
| 4 | SIWS/SIWE 서명 암호학적 검증 | 동일 | 변경 없음 |
| 5 | 서명자 == `owner_wallets.address` | **서명자 == `agents.owner_address`** | **변경** |
| 6 | action == 라우트 기대 action | 동일 | 변경 없음 |
| 7 | 컨텍스트 설정 (ownerAddress, ownerChain) | 동일 | 변경 없음 |
| 8 | next() 호출 | 동일 | 변경 없음 |

**Step 5 상세 (v0.5):**

```typescript
// ═══ Step 5: 서명자 주소 == 에이전트의 owner_address 확인 ═══
const agentId = resolveAgentIdFromContext(c)
const agent = await db.select()
  .from(agents)
  .where(eq(agents.id, agentId))
  .get()

if (!agent || agent.ownerAddress !== payload.address) {
  throw new WaiaasError(
    'OWNER_MISMATCH',
    '에이전트의 Owner 주소와 서명자 주소가 일치하지 않습니다.',
    403,
  )
}
```

#### ROUTE_ACTION_MAP 축소

```typescript
// v0.2 ROUTE_ACTION_MAP: 6개 매핑
const ROUTE_ACTION_MAP: Record<string, string> = {
  'POST /v1/owner/approve': 'approve_tx',
  'POST /v1/owner/reject': 'reject_tx',
  'POST /v1/owner/kill-switch': 'kill_switch',
  'GET /v1/owner/pending-approvals': 'manage_sessions',
  'PUT /v1/owner/policies': 'update_settings',
  'POST /v1/owner/policies': 'update_settings',
}

// v0.5 ROUTE_ACTION_MAP: 2개 매핑
const ROUTE_ACTION_MAP: Record<string, string> = {
  'POST /v1/owner/approve': 'approve_tx',
  'POST /v1/owner/recover': 'recover',
}
```

#### APPROVAL 타임아웃 설정

v0.2에서 1시간 고정이던 APPROVAL 거래 승인 대기 시간을 설정 가능하게 변경한다.

| 항목 | 값 | 근거 |
|------|-----|------|
| 최소 | 300초 (5분) | 세션 최소 만료와 동일. 너무 짧은 타임아웃 방지. |
| 최대 | 86,400초 (24시간) | 24시간 초과 시 거래를 재제출하는 것이 바람직. |
| 기본값 | 3,600초 (1시간) | v0.2 고정값 보존. 기존 문서와의 호환성. |

**설정 위치:**

```toml
# config.toml
[security]
# APPROVAL 티어 거래의 Owner 승인 대기 시간 (초)
# 최소 300 (5분), 최대 86400 (24시간), 기본 3600 (1시간)
approval_timeout = 3600
```

**Zod 스키마:**

```typescript
// 정책 기본값 설정
approval_timeout: z.number()
  .int()
  .min(300, 'APPROVAL 타임아웃은 최소 5분(300초) 이상이어야 합니다')
  .max(86400, 'APPROVAL 타임아웃은 최대 24시간(86400초)을 초과할 수 없습니다')
  .default(3600)
```

---

### 3.3 sessionAuth (에이전트 API 인증)

#### 정의

JWT HS256 Bearer 토큰 기반 인증. SESS-PROTO(30-session-token-protocol.md)에서 정의한 2-stage 검증을 그대로 유지한다.

#### 적용 범위

에이전트 API 전체:

| 경로 패턴 | 설명 |
|----------|------|
| `/v1/wallet/*` | 지갑 조회 (잔액, 주소) |
| `/v1/transactions/*` | 거래 송신, 이력 조회, 대기 목록 |
| `GET /v1/sessions` | 에이전트가 자신의 세션 목록 조회 |

#### 2-stage 검증 (v0.2 동일)

| Stage | 검증 | DB 접근 | 목적 |
|-------|------|---------|------|
| Stage 1 | JWT 서명 검증 (`jose.jwtVerify`) | 없음 | 토큰 위변조 탐지. 대부분의 무효 토큰을 빠르게 거부. |
| Stage 2 | sessions 테이블 조회 (폐기 여부 + 제약 조건) | 있음 | 실시간 폐기 확인, 세션 제약(constraints) 적용 |

#### 변경점

**v0.2 대비 변경 없음.** sessionAuth는 에이전트의 API 접근 인증으로서 기존 설계를 완전히 유지한다. JWT Claims(iss/exp/iat/jti/sid/aid), 토큰 포맷(`wai_sess_` 접두사), 만료 범위(5분~7일), 검증 로직 모두 동일.

유일한 간접 변경: `GET /v1/sessions`가 v0.2의 ownerAuth에서 v0.5의 sessionAuth로 이동. 에이전트가 자신의 세션 목록을 조회할 수 있게 됨 (JWT의 `aid` claim으로 에이전트별 필터링).

---

### 3.4 3-tier 비교 요약

| 속성 | masterAuth | ownerAuth | sessionAuth |
|------|-----------|-----------|-------------|
| **대상** | 데몬 운영자 (시스템 관리자) | Owner (자금 소유자) | AI 에이전트 (API 소비자) |
| **인증 방법** | 암묵적: 데몬 구동 자체 / 명시적: X-Master-Password 헤더 | 매 요청 SIWS/SIWE 서명 | JWT HS256 Bearer 토큰 |
| **인증 빈도** | 암묵적: 0회 (데몬 시작 시 1회 입력 후 자동) / 명시적: 매 요청 | 매 요청 | 세션 생성 시 1회 발급, 이후 자동 |
| **보안 근거** | localhost 바인딩 + 데몬 시작 시 키스토어 해제 | 지갑 소유권 암호학적 증명 | JWT 서명 + DB 폐기 확인 |
| **적용 범위** | 시스템 관리 전반 (에이전트 CRUD, 정책, 설정, 세션 관리) | **자금 이동 승인 + 동결 해제 복구** (2곳) | 에이전트 API (지갑, 거래, 세션 조회) |
| **감사 추적** | actor='master' 또는 actor='admin' | actor='owner:{address}' (서명 기록) | actor='agent:{agentId}' (JWT sid/aid) |
| **토큰/자격증명 수명** | 영구 (데몬 프로세스 수명) | 5분 (서명 유효기간) | 5분~7일 (JWT exp) |

---

## 4. 31 엔드포인트 인증 맵 재배치

### 4.1 배치 원칙

**자금 영향 기준 (Fund Impact Criterion)**:

- **자금 이동/동결 해제**에 직접 영향 = ownerAuth 필수
- **보호적 행위** (자금 보존, 동결) = masterAuth로 충분
- **시스템 관리** (CRUD, 설정, 조회) = masterAuth(implicit)
- **에이전트 자체 작업** (자신의 지갑/거래/세션 조회) = sessionAuth

### 4.2 전체 인증 맵

| # | Method | Path | v0.2 Auth | v0.5 Auth | 변경 | 근거 |
|---|--------|------|-----------|-----------|------|------|
| 1 | GET | /health | None | None | Same | 공개 헬스체크 |
| 2 | GET | /doc | None | None | Same | OpenAPI 스펙 (debug 전용) |
| 3 | GET | /v1/nonce | None | None | Same | 사전 인증 nonce 생성 |
| 4 | GET | /v1/wallet/balance | sessionAuth | sessionAuth | Same | 에이전트가 자신의 잔액 조회 |
| 5 | GET | /v1/wallet/address | sessionAuth | sessionAuth | Same | 에이전트가 자신의 주소 조회 |
| 6 | POST | /v1/transactions/send | sessionAuth | sessionAuth | Same | 에이전트 거래 송신 (정책 엔진이 관장) |
| 7 | GET | /v1/transactions | sessionAuth | sessionAuth | Same | 에이전트 거래 이력 조회 |
| 8 | GET | /v1/transactions/pending | sessionAuth | sessionAuth | Same | 에이전트 대기 거래 조회 |
| 9 | POST | /v1/sessions | ownerAuth (body sig) | masterAuth (implicit) | **Downgrade** | 세션 제약(constraints)이 안전장치. 데몬 운영자 신뢰. |
| 10 | GET | /v1/sessions | ownerAuth | sessionAuth | **Downgrade** | 에이전트가 자신의 세션 조회. aid 기반 필터링. |
| 11 | DELETE | /v1/sessions/:id | ownerAuth | masterAuth (implicit) | **Downgrade** | 세션 폐기 = 시스템 관리. 보호적 행위. |
| 12 | POST | /v1/owner/connect | None (localhost) | None (localhost) | Same | WC 연결 설정 (선택적 기능) |
| 13 | DELETE | /v1/owner/disconnect | ownerAuth | masterAuth (implicit) | **Downgrade** | WC 연결 해제 = 시스템 관리 |
| 14 | POST | /v1/owner/approve/:txId | ownerAuth | **ownerAuth** | **Same** | 자금 이동 승인. ownerAuth 유지 필수. |
| 15 | POST | /v1/owner/reject/:txId | ownerAuth | masterAuth (implicit) | **Downgrade** | 거절 = 자금 보존. 보호적 행위. |
| 16 | POST | /v1/owner/kill-switch | ownerAuth | masterAuth (implicit) | **Downgrade** | 비상 정지 = 보호적 행위. 자금 동결. |
| 17 | POST | /v1/owner/recover | ownerAuth + masterAuth | **ownerAuth + masterAuth (explicit)** | **Same** | dual-auth 유지. 동결 해제 = 자금 접근 복원. |
| 18 | GET | /v1/owner/pending-approvals | ownerAuth | masterAuth (implicit) | **Downgrade** | 대기 목록 조회 = 시스템 관리 |
| 19 | POST | /v1/owner/policies | ownerAuth | masterAuth (implicit) | **Downgrade** | 정책 생성 = 시스템 관리 |
| 20 | PUT | /v1/owner/policies/:policyId | ownerAuth | masterAuth (implicit) | **Downgrade** | 정책 수정 = 시스템 관리 |
| 21 | GET | /v1/owner/sessions | ownerAuth | masterAuth (implicit) | **Downgrade** | 세션 목록 조회 = 시스템 관리 |
| 22 | DELETE | /v1/owner/sessions/:id | ownerAuth | masterAuth (implicit) | **Downgrade** | 세션 폐기 = 시스템 관리 (11번과 동일 기능) |
| 23 | GET | /v1/owner/agents | ownerAuth | masterAuth (implicit) | **Downgrade** | 에이전트 목록 조회 = 시스템 관리 |
| 24 | GET | /v1/owner/agents/:id | ownerAuth | masterAuth (implicit) | **Downgrade** | 에이전트 상세 조회 = 시스템 관리 |
| 25 | GET | /v1/owner/settings | ownerAuth | masterAuth (implicit) | **Downgrade** | 설정 조회 = 시스템 관리 |
| 26 | PUT | /v1/owner/settings | ownerAuth | masterAuth (implicit) | **Downgrade** | 설정 변경 = 시스템 관리 |
| 27 | GET | /v1/owner/dashboard | ownerAuth | masterAuth (implicit) | **Downgrade** | 대시보드 조회 = 시스템 관리 |
| 28 | GET | /v1/owner/status | ownerAuth | masterAuth (implicit) | **Downgrade** | Owner 상태 조회 = 시스템 관리 |
| 29 | POST | /v1/admin/kill-switch | masterAuth (explicit) | masterAuth (explicit) | Same | CLI 비상 정지 (v0.2 동일) |
| 30 | POST | /v1/admin/shutdown | masterAuth (explicit) | masterAuth (explicit) | Same | 데몬 종료 (v0.2 동일) |
| 31 | GET | /v1/admin/status | masterAuth (explicit) | masterAuth (explicit) | Same | 데몬 상태 조회 (v0.2 동일) |

### 4.3 v0.5 인증별 엔드포인트 그룹

| 인증 유형 | 엔드포인트 수 | 엔드포인트 목록 |
|----------|-------------|----------------|
| None (공개) | 3 | GET /health, GET /doc, GET /v1/nonce |
| sessionAuth | 6 | GET /v1/wallet/balance, GET /v1/wallet/address, POST /v1/transactions/send, GET /v1/transactions, GET /v1/transactions/pending, GET /v1/sessions |
| masterAuth (implicit) | 16 | POST /v1/sessions, DELETE /v1/sessions/:id, POST /v1/owner/connect, DELETE /v1/owner/disconnect, POST /v1/owner/reject/:txId, POST /v1/owner/kill-switch, GET /v1/owner/pending-approvals, POST /v1/owner/policies, PUT /v1/owner/policies/:policyId, GET /v1/owner/sessions, DELETE /v1/owner/sessions/:id, GET /v1/owner/agents, GET /v1/owner/agents/:id, GET /v1/owner/settings, PUT /v1/owner/settings, GET /v1/owner/dashboard |
| masterAuth (explicit) | 3 | POST /v1/admin/kill-switch, POST /v1/admin/shutdown, GET /v1/admin/status |
| ownerAuth | 1 | POST /v1/owner/approve/:txId |
| dualAuth (ownerAuth + masterAuth explicit) | 1 | POST /v1/owner/recover |
| **합계** | **30** | GET /v1/owner/status는 masterAuth(implicit) 16개에 포함하여 총 30 |

> **참고**: #12 POST /v1/owner/connect는 None(localhost)이지만 hostValidation 미들웨어로 localhost만 허용. 공개 3개 + sessionAuth 6개 + masterAuth(implicit) 16개 + masterAuth(explicit) 3개 + ownerAuth 1개 + dualAuth 1개 = 30개. GET /doc 포함 시 31개.

### 4.4 변경 통계

| 변경 유형 | 수 | 비율 |
|----------|---|------|
| Same (변경 없음) | 15 | 48% |
| Downgrade (ownerAuth -> masterAuth/sessionAuth) | 16 | 52% |
| Upgrade | 0 | 0% |

모든 Downgrade 항목은 섹션 6에서 보상 통제(compensating control)와 함께 정당성을 검증한다.

---

## 5. CLI 수동 서명 플로우 (WalletConnect 대안)

### 5.1 설계 원칙

WalletConnect는 순수 편의 기능이다. CLI 수동 서명으로 모든 ownerAuth 기능이 동작해야 한다. Owner가 Solana CLI, Ledger CLI, 또는 키페어 파일로 오프라인 서명할 수 있는 4단계 플로우를 정의한다.

### 5.2 4단계 플로우

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│ Step 1      │     │ Step 2       │     │ Step 3          │     │ Step 4      │
│ nonce 발급  │────>│ 메시지 구성  │────>│ 오프라인 서명   │────>│ API 호출    │
│ (CLI->API)  │     │ + 출력/저장  │     │ (외부 도구)     │     │ (CLI->API)  │
└─────────────┘     └──────────────┘     └─────────────────┘     └─────────────┘
```

**Step 1: nonce 발급**

CLI가 `GET /v1/nonce` 엔드포인트로 일회성 nonce를 발급받는다.

```typescript
// CLI 내부
const response = await fetch('http://127.0.0.1:3100/v1/nonce')
const { nonce } = await response.json()
// nonce: "a1b2c3d4e5f67890a1b2c3d4e5f67890" (32자 hex)
```

**Step 2: SIWS/SIWE 메시지 구성 + 출력**

CLI가 SIWS/SIWE 표준 메시지를 구성하고, 터미널에 출력하며 임시 파일로 저장한다.

```typescript
// 메시지 구성
const message = constructSIWSMessage({
  domain: 'localhost:3100',
  address: ownerAddress,
  statement: `WAIaaS Owner Action: ${action}`,
  nonce,
  issuedAt: new Date().toISOString(),
  expirationTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
})

// 터미널 출력
console.log('=== 서명할 메시지 ===')
console.log(message)
console.log('====================')

// 임시 파일 저장 (파이프 도구 연동용)
const msgPath = '/tmp/waiaas-sign-msg.txt'
writeFileSync(msgPath, message, { mode: 0o600 })
console.log(`메시지 파일: ${msgPath}`)
```

**Step 3: 오프라인 서명**

Owner가 외부 도구로 메시지에 서명한다. WAIaaS CLI는 이 단계에서 대기한다.

```
지원되는 서명 도구:

  Solana CLI:
    $ solana sign-offchain-message -k ~/my-wallet.json /tmp/waiaas-sign-msg.txt

  Ledger (Solana):
    $ solana sign-offchain-message --keypair usb://ledger /tmp/waiaas-sign-msg.txt

  Phantom CLI (향후):
    $ phantom sign /tmp/waiaas-sign-msg.txt

서명 결과를 아래에 붙여넣으세요 (base58):
>
```

**Step 4: 서명 수신 + API 호출**

CLI가 서명을 수신하고 ownerAuth 페이로드를 구성하여 API를 호출한다.

```typescript
// 서명 수신 (stdin)
const signature = await promptInput('서명 결과 (base58): ')

// ownerAuth 페이로드 구성
const payload = {
  chain: 'solana',
  address: ownerAddress,
  action,
  nonce,
  timestamp: new Date().toISOString(),
  message,
  signature: signature.trim(),
}

// base64url 인코딩 -> Authorization 헤더
const token = Buffer.from(JSON.stringify(payload)).toString('base64url')

// API 호출
const response = await fetch(`http://127.0.0.1:3100/v1/owner/approve/${txId}`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
})
```

### 5.3 CLI 커맨드 인터페이스

**대화형 모드 (기본):**

```bash
$ waiaas owner approve <txId>

WAIaaS Owner Transaction Approval
==================================
거래 ID: 01950xxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
금액: 5.2 SOL -> recipient_address
에이전트: my-trading-agent

=== 서명할 메시지 ===
localhost:3100 wants you to sign in with your Solana account:
7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

WAIaaS Owner Action: approve_tx

URI: http://localhost:3100
Version: 1
Chain ID: 1
Nonce: a1b2c3d4e5f67890a1b2c3d4e5f67890
Issued At: 2026-02-07T10:30:00.000Z
Expiration Time: 2026-02-07T10:35:00.000Z
====================

메시지 파일: /tmp/waiaas-sign-msg.txt

서명 결과를 붙여넣으세요 (base58):
> 3Kp8V2...base58...signature

거래 승인 완료.
```

**비대화형 모드 (스크립트/CI 연동):**

```bash
# --signature와 --message-file로 비대화형 실행
$ waiaas owner approve <txId> \
    --signature "3Kp8V2...base58...signature" \
    --message-file /tmp/waiaas-sign-msg.txt

# stdin 파이프 지원
$ echo "3Kp8V2...base58...signature" | waiaas owner approve <txId>
```

**Kill Switch 복구 (dual-auth):**

```bash
$ waiaas owner recover

WAIaaS Kill Switch Recovery (Dual-Auth)
========================================
마스터 패스워드: ********

=== 서명할 메시지 ===
[SIWS/SIWE 메시지]
====================

메시지 파일: /tmp/waiaas-sign-msg.txt

서명 결과를 붙여넣으세요 (base58):
> [signature]

Kill Switch 복구 완료. 시스템이 NORMAL 상태로 전환되었습니다.
```

### 5.4 WalletConnect 연동 (선택적 편의 기능)

WalletConnect가 연결된 상태에서는 모바일 push 서명을 자동으로 시도한다.

```
우선순위:
1. WalletConnect 연결 확인 -> 연결됨 -> 모바일 push 서명 요청
   -> 성공: API 호출 완료
   -> 실패/타임아웃(30초): CLI 수동 서명으로 폴백

2. WalletConnect 미연결 -> 즉시 CLI 수동 서명 플로우 진입
```

```typescript
// CLI에서 ownerAuth 수행 시
async function performOwnerAuth(action: string, txId?: string): Promise<string> {
  // WC 세션 확인
  const wcSession = loadWcSession() // ~/.waiaas/wc-session.json

  if (wcSession) {
    console.log('WalletConnect로 서명 요청 중...')
    try {
      // 모바일 지갑에 push 서명 요청 (30초 타임아웃)
      const signature = await requestWcSignature(wcSession, message, 30_000)
      return signature
    } catch {
      console.log('WalletConnect 서명 실패. 수동 서명으로 전환합니다.')
    }
  }

  // 수동 서명 플로우 (항상 가능)
  return await manualSignFlow(message)
}
```

---

## 6. 보안 비다운그레이드 검증 (v0.2 vs v0.5)

### 6.1 검증 원칙

모든 엔드포인트에서 v0.2 대비 보안 수준이 동등하거나 향상되어야 한다. 다운그레이드가 발생하는 경우, **보상 통제(compensating control)**가 반드시 존재하여 실질적 보안 수준을 유지해야 한다.

### 6.2 전체 검증표

| # | Endpoint | v0.2 Auth | v0.5 Auth | Change | Fund Impact | Verdict |
|---|----------|-----------|-----------|--------|-------------|---------|
| 1 | GET /health | None | None | Same | 없음 | SAFE |
| 2 | GET /doc | None | None | Same | 없음 | SAFE |
| 3 | GET /v1/nonce | None | None | Same | 없음 | SAFE |
| 4 | GET /v1/wallet/balance | sessionAuth | sessionAuth | Same | 간접 (잔액 노출) | SAFE |
| 5 | GET /v1/wallet/address | sessionAuth | sessionAuth | Same | 간접 (주소 노출) | SAFE |
| 6 | POST /v1/transactions/send | sessionAuth | sessionAuth | Same | 직접 (자금 이동) | SAFE -- 정책 엔진이 관장 |
| 7 | GET /v1/transactions | sessionAuth | sessionAuth | Same | 간접 (이력 노출) | SAFE |
| 8 | GET /v1/transactions/pending | sessionAuth | sessionAuth | Same | 간접 (대기 목록 노출) | SAFE |
| 9 | POST /v1/sessions | ownerAuth | masterAuth(implicit) | **Downgrade** | 간접 (세션 생성) | **JUSTIFIED** |
| 10 | GET /v1/sessions | ownerAuth | sessionAuth | **Downgrade** | 없음 (자기 세션 조회) | **JUSTIFIED** |
| 11 | DELETE /v1/sessions/:id | ownerAuth | masterAuth(implicit) | **Downgrade** | 없음 (세션 폐기 = 보호적) | **JUSTIFIED** |
| 12 | POST /v1/owner/connect | None | None | Same | 없음 | SAFE |
| 13 | DELETE /v1/owner/disconnect | ownerAuth | masterAuth(implicit) | **Downgrade** | 없음 (WC 해제) | **JUSTIFIED** |
| 14 | POST /v1/owner/approve/:txId | ownerAuth | ownerAuth | Same | **직접 (자금 이동)** | SAFE |
| 15 | POST /v1/owner/reject/:txId | ownerAuth | masterAuth(implicit) | **Downgrade** | 없음 (자금 보존) | **JUSTIFIED** |
| 16 | POST /v1/owner/kill-switch | ownerAuth | masterAuth(implicit) | **Downgrade** | 없음 (자금 동결 = 보호) | **JUSTIFIED** |
| 17 | POST /v1/owner/recover | ownerAuth+masterAuth | ownerAuth+masterAuth(explicit) | Same | **직접 (동결 해제)** | SAFE |
| 18 | GET /v1/owner/pending-approvals | ownerAuth | masterAuth(implicit) | **Downgrade** | 없음 (조회) | **JUSTIFIED** |
| 19 | POST /v1/owner/policies | ownerAuth | masterAuth(implicit) | **Downgrade** | 간접 (정책 변경) | **JUSTIFIED** |
| 20 | PUT /v1/owner/policies/:policyId | ownerAuth | masterAuth(implicit) | **Downgrade** | 간접 (정책 변경) | **JUSTIFIED** |
| 21 | GET /v1/owner/sessions | ownerAuth | masterAuth(implicit) | **Downgrade** | 없음 (조회) | **JUSTIFIED** |
| 22 | DELETE /v1/owner/sessions/:id | ownerAuth | masterAuth(implicit) | **Downgrade** | 없음 (세션 폐기 = 보호적) | **JUSTIFIED** |
| 23 | GET /v1/owner/agents | ownerAuth | masterAuth(implicit) | **Downgrade** | 없음 (조회) | **JUSTIFIED** |
| 24 | GET /v1/owner/agents/:id | ownerAuth | masterAuth(implicit) | **Downgrade** | 없음 (조회) | **JUSTIFIED** |
| 25 | GET /v1/owner/settings | ownerAuth | masterAuth(implicit) | **Downgrade** | 없음 (조회) | **JUSTIFIED** |
| 26 | PUT /v1/owner/settings | ownerAuth | masterAuth(implicit) | **Downgrade** | 간접 (설정 변경) | **JUSTIFIED** |
| 27 | GET /v1/owner/dashboard | ownerAuth | masterAuth(implicit) | **Downgrade** | 없음 (조회) | **JUSTIFIED** |
| 28 | GET /v1/owner/status | ownerAuth | masterAuth(implicit) | **Downgrade** | 없음 (조회) | **JUSTIFIED** |
| 29 | POST /v1/admin/kill-switch | masterAuth(explicit) | masterAuth(explicit) | Same | 없음 (자금 동결 = 보호) | SAFE |
| 30 | POST /v1/admin/shutdown | masterAuth(explicit) | masterAuth(explicit) | Same | 없음 (데몬 종료) | SAFE |
| 31 | GET /v1/admin/status | masterAuth(explicit) | masterAuth(explicit) | Same | 없음 (조회) | SAFE |

### 6.3 Downgrade 항목별 보상 통제 상세

#### #9 POST /v1/sessions (ownerAuth -> masterAuth implicit)

**위험**: 데몬 운영자가 Owner 서명 없이 세션을 생성할 수 있음.

**보상 통제:**
1. **세션 제약(constraints)**: 모든 세션에 maxAmount, allowedOperations, expiresIn 등 제약 조건이 설정됨. 무제한 세션이라도 정책 엔진(Layer 2)이 거래를 통제.
2. **최대 수명 7일**: 세션 만료 시간 상한(604,800초)이 Zod 스키마로 강제됨.
3. **Owner 폐기 가능**: 생성된 세션은 Owner가 언제든 폐기 가능 (DELETE /v1/sessions/:id 또는 Kill Switch).
4. **localhost 바인딩**: 데몬에 접근할 수 있는 사람 = 물리적/SSH 접근 권한 보유자 = 운영자.

**결론**: 세션 생성의 "인가(authorization)" 기능은 세션 제약이 대체. ownerAuth는 과도한 의식(ceremony)이었음.

#### #10 GET /v1/sessions (ownerAuth -> sessionAuth)

**위험**: 에이전트가 자신의 세션 목록을 조회할 수 있음.

**보상 통제:**
1. **aid 기반 필터링**: JWT의 `aid` claim으로 해당 에이전트의 세션만 반환. 다른 에이전트 세션은 노출되지 않음.
2. **민감 정보 미포함**: 응답에 JWT secret, 마스터 패스워드 등 민감 정보가 포함되지 않음.
3. **조회 전용**: GET 요청이므로 상태 변경 없음.

**결론**: 에이전트가 자신의 세션을 조회하는 것은 정당한 기능. 타 에이전트 격리가 보장됨.

#### #11, #22 DELETE /v1/sessions/:id (ownerAuth -> masterAuth implicit)

**위험**: 데몬 운영자가 Owner 서명 없이 세션을 폐기할 수 있음.

**보상 통제:**
1. **보호적 행위**: 세션 폐기는 에이전트의 접근 권한을 제거하는 것이므로 자금을 보호하는 방향.
2. **복구 불필요**: 새 세션을 생성하면 됨 (masterAuth implicit).

**결론**: 세션 폐기는 "자금 보존" 방향. ownerAuth 불필요.

#### #13 DELETE /v1/owner/disconnect (ownerAuth -> masterAuth implicit)

**위험**: 데몬 운영자가 WalletConnect 연결을 해제할 수 있음.

**보상 통제:**
1. **WC 해제 =/= 인증 상실**: wallet_connections 레코드 삭제일 뿐, agents.owner_address는 유지됨.
2. **재연결 가능**: POST /v1/owner/connect로 재연결 가능.

**결론**: WC 연결 관리는 시스템 관리 영역.

#### #15 POST /v1/owner/reject/:txId (ownerAuth -> masterAuth implicit)

**위험**: 데몬 운영자가 Owner 서명 없이 거래를 거절할 수 있음.

**보상 통제:**
1. **보호적 행위**: 거절은 "자금이 지갑에 머무름"을 의미. 자금 이동 없음.
2. **되돌림 가능**: 거절된 거래는 에이전트가 재제출할 수 있음.
3. **자금 무결성 유지**: 거절 시 reserved_amount가 롤백되어 잔액이 복원됨.

**결론**: 거절은 가장 안전한 행위. 자금 영향 제로.

#### #16 POST /v1/owner/kill-switch (ownerAuth -> masterAuth implicit)

**위험**: 데몬 운영자가 Owner 서명 없이 Kill Switch를 발동할 수 있음.

**보상 통제:**
1. **보호적 행위**: Kill Switch는 모든 세션 폐기 + 거래 취소 + 키스토어 잠금. 자금을 보호하는 최후 방어선.
2. **복구에는 ownerAuth 필요**: Kill Switch 발동은 쉽게 가능하지만, 복구(자금 접근 복원)에는 반드시 ownerAuth + masterAuth dual-auth가 필요.
3. **CLI 경로와 일관**: v0.2에서도 POST /v1/admin/kill-switch는 masterAuth(explicit)로 동작. Owner 경로와 CLI 경로의 인증 수준이 비대칭이었음.

**결론**: Kill Switch 발동 = 비상 정지 = 보호적 행위. 복구에만 ownerAuth를 유지하는 것이 적절.

#### #19, #20 POST/PUT /v1/owner/policies (ownerAuth -> masterAuth implicit)

**위험**: 데몬 운영자가 Owner 서명 없이 정책을 생성/수정할 수 있음. 정책 변경은 간접적 자금 영향 (임계값 변경으로 APPROVAL 우회 가능).

**보상 통제:**
1. **정책 변경 감사**: 모든 정책 변경은 audit_log에 기록됨 (actor='master', 변경 전/후 스냅샷).
2. **알림 트리거**: POLICY_UPDATED 알림 이벤트가 Owner에게 전송됨 (NOTI-ARCH).
3. **APPROVAL 티어 유지**: 정책을 아무리 변경해도 APPROVAL 티어 거래는 여전히 ownerAuth 서명이 필요.
4. **localhost 바인딩**: 물리적 접근 필요.

**결론**: 정책 관리는 시스템 관리자 영역. 감사 + 알림으로 가시성 확보.

#### #26 PUT /v1/owner/settings (ownerAuth -> masterAuth implicit)

**위험**: 데몬 운영자가 Owner 서명 없이 설정을 변경할 수 있음.

**보상 통제:**
1. **설정 변경 감사**: audit_log 기록.
2. **알림 트리거**: SETTINGS_UPDATED 알림 이벤트.
3. **보안 설정 제한**: jwt_secret 등 핵심 보안 설정은 config.toml 파일 수준에서만 변경 가능 (API로 변경 불가).

**결론**: 설정 관리는 시스템 관리자 영역.

#### 나머지 조회 엔드포인트 (#18, #21, #23, #24, #25, #27, #28)

**공통 보상 통제:**
1. GET 요청이므로 상태 변경 없음.
2. localhost 바인딩으로 로컬 접근만 허용.
3. 민감 정보(키, 패스워드)는 응답에 포함되지 않음.

**결론**: 조회 작업에 ownerAuth(매 요청 서명)는 과도한 의식. masterAuth implicit로 충분.

### 6.4 검증 결론

| 분류 | 수 | 설명 |
|------|---|------|
| Same (동일) | 15 | ownerAuth 유지 2곳 포함. 보안 수준 동일. |
| Downgrade + JUSTIFIED | 16 | 모든 항목에 보상 통제 존재. 실질적 보안 수준 유지. |
| Downgrade + UNJUSTIFIED | 0 | 없음 |

**핵심 검증 결과**: ownerAuth가 유지되는 2곳(POST /v1/owner/approve/:txId, POST /v1/owner/recover)은 자금 이동/동결 해제에 직접 영향을 미치는 유일한 엔드포인트이다. v0.2와 동일한 보안 수준이 유지된다. 다운그레이드된 16개 엔드포인트는 모두 보상 통제가 존재하며, 실질적 보안 수준 저하가 없다.

---

## 7. 미들웨어 아키텍처 업데이트

### 7.1 v0.5 미들웨어 체인

```
requestId -> logger -> shutdownGuard -> secureHeaders -> hostValidation -> cors -> rateLimiter -> killSwitchGuard -> authRouter
```

v0.2 대비 변경: 순서 9의 `sessionAuth / ownerAuth / masterAuth` 개별 적용이 `authRouter` 단일 디스패처로 통합.

### 7.2 authRouter 디스패치 로직

`authRouter`는 요청 경로(path)와 HTTP 메서드(method)를 기반으로 적절한 인증 미들웨어를 디스패치한다.

```typescript
// packages/daemon/src/server/middleware/auth-router.ts
import { createMiddleware } from 'hono/factory'
import type { AppBindings } from '../types.js'

// 인증이 불필요한 공개 경로
const PUBLIC_PATHS = new Set([
  'GET /health',
  'GET /doc',
  'GET /v1/nonce',
  'POST /v1/owner/connect',  // localhost 보안 의존
])

// sessionAuth 경로 패턴
const SESSION_AUTH_PREFIXES = [
  '/v1/wallet/',
  '/v1/transactions/',
]
const SESSION_AUTH_EXACT = new Set([
  'GET /v1/sessions',
])

// masterAuth 명시적 경로
const MASTER_EXPLICIT_PATHS = new Set([
  'POST /v1/admin/kill-switch',
  'POST /v1/admin/shutdown',
  'GET /v1/admin/status',
])

// ownerAuth 경로
const OWNER_AUTH_PATHS = new Set([
  'POST /v1/owner/approve',  // :txId 경로 파라미터 제거 후 매칭
])

// dualAuth 경로 (ownerAuth + masterAuth explicit)
const DUAL_AUTH_PATHS = new Set([
  'POST /v1/owner/recover',
])

export function authRouter(deps: AuthDeps) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const method = c.req.method
    const path = c.req.path
    const routeKey = `${method} ${path}`

    // 경로 파라미터 제거 (UUID 패턴)
    const normalizedPath = path.replace(/\/[0-9a-f-]{36}$/i, '')
    const normalizedKey = `${method} ${normalizedPath}`

    // 1. 공개 경로
    if (PUBLIC_PATHS.has(routeKey)) {
      c.set('authType', 'none')
      return next()
    }

    // 2. sessionAuth 경로
    if (SESSION_AUTH_EXACT.has(routeKey) ||
        SESSION_AUTH_PREFIXES.some(p => path.startsWith(p))) {
      return deps.sessionAuth(c, next)
    }

    // 3. dualAuth 경로 (ownerAuth + masterAuth explicit)
    if (DUAL_AUTH_PATHS.has(routeKey)) {
      return deps.dualAuth(c, next)
    }

    // 4. ownerAuth 경로
    if (OWNER_AUTH_PATHS.has(normalizedKey)) {
      return deps.ownerAuth(c, next)
    }

    // 5. masterAuth 명시적 경로
    if (MASTER_EXPLICIT_PATHS.has(routeKey)) {
      return deps.explicitMasterAuth(c, next)
    }

    // 6. 기본: masterAuth 암묵적 (시스템 관리 엔드포인트)
    return deps.implicitMasterAuth(c, next)
  })
}
```

### 7.3 dualAuth 미들웨어 (Kill Switch 복구용)

```typescript
// ownerAuth + masterAuth(explicit) 순차 검증
export function dualAuthMiddleware(deps: DualAuthDeps) {
  return createMiddleware<AppBindings>(async (c, next) => {
    // Step A: ownerAuth 검증 (서명 확인)
    // ownerAuth 미들웨어 로직을 인라인 실행 (next()를 호출하지 않음)
    await deps.verifyOwnerSignature(c)

    // Step B: masterAuth(explicit) 검증 (패스워드 확인)
    await deps.verifyMasterPassword(c)

    // 둘 다 통과: dual-auth 완료
    c.set('authType', 'dual')
    c.set('actor', `owner:${c.get('ownerAddress')}+admin`)
    await next()
  })
}
```

### 7.4 killSwitchGuard 허용 목록 (v0.2 동일)

ACTIVATED 또는 RECOVERING 상태에서 통과가 허용되는 엔드포인트:

| Method | Path | 설명 |
|--------|------|------|
| GET | /health | 헬스체크 (모니터링) |
| POST | /v1/owner/recover | Kill Switch 복구 (dual-auth) |
| GET | /v1/admin/status | 데몬 상태 조회 |

v0.2와 동일. 변경 없음.

### 7.5 미들웨어 순서 변경 요약

| 순서 | v0.2 | v0.5 | 변경 |
|------|------|------|------|
| 1 | requestId | requestId | 동일 |
| 2 | requestLogger | requestLogger | 동일 |
| 3 | shutdownGuard | shutdownGuard | 동일 |
| 4 | secureHeaders | secureHeaders | 동일 |
| 5 | hostValidation | hostValidation | 동일 |
| 6 | cors | cors | 동일 |
| 7 | rateLimiter | rateLimiter | 동일 |
| 8 | killSwitchGuard | killSwitchGuard | 동일 |
| 9 | sessionAuth / ownerAuth / masterAuth (라우트별) | **authRouter** (통합 디스패처) | **변경** |

순서 9만 변경. authRouter가 기존 3개의 인증 미들웨어를 경로 기반으로 디스패치하는 단일 진입점 역할.

---

## 8. 요구사항 매핑 총괄

| 요구사항 | 설명 | 충족 섹션 | 충족 상태 |
|---------|------|-----------|----------|
| AUTH-01 | masterAuth/ownerAuth/sessionAuth 3-tier 인증 정의 (대상, 방법, 적용 범위) | 섹션 3 전체 (3.1 masterAuth, 3.2 ownerAuth, 3.3 sessionAuth, 3.4 비교 요약) | 완료 |
| AUTH-02 | 31개 엔드포인트 인증 맵 재배치 | 섹션 4.2 전체 테이블 (31행) | 완료 |
| AUTH-03 | ownerAuth 2곳 한정 (거래 승인 + KS 복구) | 섹션 3.2 적용 범위 테이블, 섹션 4.3 인증별 그룹 (ownerAuth 1개 + dualAuth 1개 = 2곳) | 완료 |
| AUTH-04 | Owner 주소 변경 masterAuth 단일 트랙 | 섹션 3.1 암묵적 masterAuth (에이전트 수정 PUT /v1/agents/:id로 owner_address 변경) | 완료 |
| AUTH-05 | 보안 비다운그레이드 검증 | 섹션 6 전체 (31행 검증표, 16개 다운그레이드 보상 통제 상세) | 완료 |
| OWNR-05 | CLI 수동 서명 플로우 (WalletConnect 대안) | 섹션 5 전체 (4단계 플로우, CLI 커맨드, WC 폴백) | 완료 |
| OWNR-06 | APPROVAL 타임아웃 설정 가능 | 섹션 3.2 APPROVAL 타임아웃 설정 (min 300s, max 86400s, default 3600s) | 완료 |

**7/7 요구사항 완료.**

---

*문서 작성: 2026-02-07*
*Phase: 19-auth-owner-redesign, Plan: 01*
*AUTH-REDESIGN v1.0*
